// The trailers (docs/TRAILER.md): filmed in the game itself, frame by frame on a virtual clock (tools/film/clock.js), by
// the director in tools/trailer/director.js from a shot list (tools/views/trailer-*.json), scored by
// tools/trailer/score.js from the same list's cues, and cut together by ffmpeg in the scope frame (2.39:1 in 16:9).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/trailer.js tools/views/trailer-story.json --stills [--k 0.1,0.5,0.9] [--shots a,b]
//   xvfb-run -a node tools/trailer.js tools/views/trailer-story.json            # every frame, then the score and the cut
//   node tools/trailer.js tools/views/trailer-story.json --score                # the score alone (a wav), no map
//   node tools/trailer.js tools/views/trailer-story.json --cut                  # the cut from frames already on disk
// Options: --size 1920x804 (the picture; the cut pads it to 1920x1080), --fps 24, --frames <dir> (default
// /tmp/trailer-<name>), --out <file.mp4>, --from <shot> --to <shot> (film those shots only: frames are numbered by the
// film's time, so a shot filmed again replaces its own frames), --tier high, PORT (8800).
'use strict';
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const specFile = argv[0];
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i < 0 ? def : argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[i + 1]; };
if (!specFile || !fs.existsSync(specFile)) { console.error('usage: node tools/trailer.js <spec.json> [--stills] [--score] [--cut]'); process.exit(1); }
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const [W, H] = String(opt('size', spec.size || '1920x804')).split('x').map(Number);
const FPS = +opt('fps', spec.fps || 24);
const FRAMES = opt('frames', `/tmp/trailer-${spec.name}`);
const OUT = opt('out', path.join(FRAMES, `${spec.name}.mp4`));
const PORT = process.env.PORT || 8800;
fs.mkdirSync(FRAMES, { recursive: true });
let T = 0;
const shots = spec.shots.map(s => { const o = { id: s.id, t0: T, dur: s.dur, type: s.type }; T += s.dur; return o; });
const TOTAL = T;
const frameOf = i => path.join(FRAMES, `f${String(i).padStart(5, '0')}.jpg`);

async function open() {
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', e => errs.push(`pageerror: ${String(e).slice(0, 400)}`));
  p.on('console', m => { if (m.type() === 'error' || /trailer/.test(m.text())) errs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  await p.addInitScript({ path: path.join(__dirname, 'film', 'clock.js') });
  await p.addInitScript(q => {
    try {
      localStorage.setItem('oe3d-quality', q); localStorage.setItem('oe3d-fps', '0'); localStorage.setItem('oe-route-line', 'off');
      localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('oe3d-overture', JSON.stringify({ shibuya: 1 }));
    } catch (e) { /* storage blocked */ }
  }, opt('tier', 'high'));
  await p.goto(`http://localhost:${PORT}/?walk=1&gov=1/1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000, polling: 1000 })
    .catch(e => { console.error(errs.join('\n')); throw e; });
  await startPlay(p, { asIs: true });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const g = window.__game; if (g.arriving && g.arriving()) g.settleArrival(); if (g.cine.active) g.cine.stop(); if (g.groundShown) g.groundShown(); });
  // the story's people and the dog asked for now, so that they have come by the shots that want them
  await p.evaluate(() => {
    const g = window.__game, E = g.G.story.episodes[0], L = g.peopleLib, want = new Set();
    for (const f of E.frames) for (const a of [f.afterimage, f.afterimage2]) if (a) want.add(a.character);
    for (const c of E.cast || []) want.add(c.character);
    for (const c of want) Promise.resolve(L.require(c)).catch(() => {});
  });
  await p.addScriptTag({ path: path.join(__dirname, 'trailer', 'director.js') });
  const info = await p.evaluate(s => window.OETrailer.setup(s), spec);
  await p.evaluate(fps => window.OETrailer.setDt(fps), FPS);
  console.log(`  type faces: ${JSON.stringify(await p.evaluate(() => window.OETrailer.fonts()))}`);
  await p.evaluate(() => window.__vt.start());
  console.log(`${spec.name}: ${info.total.toFixed(1)} s, ${info.shots.length} shots`);
  return { b, p, errs };
}

// a frame taken through the DevTools protocol: Playwright's own screenshot waits for the page to settle, 2 s a frame here
const cdps = new WeakMap();
const shoot = async p => {
  if (!cdps.has(p)) cdps.set(p, await p.context().newCDPSession(p));
  const r = await cdps.get(p).send('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
  return Buffer.from(r.data, 'base64');
};
// a shot begun: the world given a moment to settle (simulated, not drawn), then frames drawn until the map round it is in
async function settle(p, s) {
  await p.evaluate(sec => { const g = window.__game, was = g.held(); g.hold(true); g.advance(sec); g.hold(was); window.OETrailer.settled(); }, s.preroll ?? 1.5);
  const t0 = Date.now();
  // (loaders pace themselves on the page's clock, which is the film's: it is run on while they work, the world held)
  // (and a frame is not drawn while they do: a texture goes up a frame, and a drawn frame takes seconds here)
  await p.evaluate(() => { window.__game.hold(true); window.OETrailer.draw(false); });
  for (;;) {
    await p.evaluate(() => { for (let i = 0; i < 20; i++) window.__vt.step(1000 / 30); });
    if (await p.evaluate(() => window.OETrailer.ready())) break;
    if (Date.now() - t0 > 90000) { console.log(`  ${s.id}: still waiting after 90 s for ${JSON.stringify(await p.evaluate(() => window.OETrailer.waiting()))}; filming as it is`); break; }
    await p.waitForTimeout(100);
  }
  await p.evaluate(() => window.OETrailer.draw(true));
  // a few frames for what loads as it is first seen (textures, a far tile)
  for (let i = 0; i < 4; i++) { await p.evaluate(() => window.__vt.step(1000 / 30)); await p.waitForTimeout(250); }
  await p.evaluate(() => window.__game.hold(false));
}
const spOf = id => spec.shots.find(q => q.id === id);

async function stills() {
  const { b, p, errs } = await open();
  const ks = String(opt('k', '0.15,0.6,0.95')).split(',').map(Number);
  const pick = opt('shots', null), dir = path.join(FRAMES, 'stills');
  fs.mkdirSync(dir, { recursive: true });
  for (const s of shots) {
    if (pick && !String(pick).split(',').includes(s.id)) continue;
    for (const k of ks) {
      await p.evaluate(() => window.OETrailer.reset());
      const r = await p.evaluate(t => window.OETrailer.apply(t), s.t0 + 1e-4);
      if (r.entered && !r.card) await settle(p, spOf(s.id));
      // on to k from the shot's start (its cues and the Stop happen), the frames before it not drawn
      await p.evaluate(t => window.OETrailer.seek(t), s.t0 + k * s.dur);
      for (let i = 0; i < 2; i++) await p.evaluate(() => window.__vt.step(0.5));
      const f = path.join(dir, `${s.id}-${Math.round(k * 100)}.jpg`);
      fs.writeFileSync(f, await shoot(p));
      console.log(f);
    }
  }
  if (errs.length) console.log(errs.slice(0, 15).join('\n'));
  await b.close();
}

async function film() {
  const from = opt('from', null), to = opt('to', null);
  const s0 = from ? shots.find(s => s.id === from) : shots[0], s1 = to ? shots.find(s => s.id === to) : shots[shots.length - 1];
  if (!s0 || !s1) throw new Error('no such shot');
  const i0 = Math.round(s0.t0 * FPS), i1 = Math.round((s1.t0 + s1.dur) * FPS);
  const { b, p, errs } = await open();
  const t0 = Date.now();
  let card = 0;
  for (let i = i0; i < i1; i++) {
    const t = (i + 0.5) / FPS;
    const r = await p.evaluate(t => window.OETrailer.apply(t), t);
    if (r.entered) console.log(`${r.shot} at frame ${i} (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
    if (r.entered && !r.card) { await settle(p, spOf(r.shot)); await p.evaluate(t => window.OETrailer.apply(t), t); }
    if (!r.card) await p.evaluate(ms => window.__vt.step(ms), r.ms); else card++;
    fs.writeFileSync(frameOf(i), await shoot(p));
    if ((i - i0) % 48 === 0) console.log(`frame ${i}/${i1}, ${((Date.now() - t0) / 1000 / (i - i0 + 1)).toFixed(2)} s a frame`);
  }
  if (errs.length) console.log(errs.slice(0, 15).join('\n'));
  await b.close();
}

// the score: tools/trailer/score.js in a blank page's OfflineAudioContext, from the spec's cues on the film's times
async function score() {
  const b = await chromium.launch({ args: ['--mute-audio'] });
  const p = await b.newPage();
  await p.setContent('<!doctype html><title>score</title>');
  await p.addScriptTag({ path: path.join(__dirname, 'trailer', 'score.js') });
  const b64 = await p.evaluate(async ({ spec, shots, total }) => {
    const ch = await window.OETrailerScore.render(spec.score, shots, total), n = ch[0].length, buf = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) { buf[2 * i] = Math.max(-1, Math.min(1, ch[0][i])) * 32767; buf[2 * i + 1] = Math.max(-1, Math.min(1, ch[1][i])) * 32767; }
    let s = ''; const u8 = new Uint8Array(buf.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }, { spec, shots, total: TOTAL });
  await b.close();
  const raw = Buffer.from(b64, 'base64'), wav = Buffer.alloc(44);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + raw.length, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(48000 * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(raw.length, 40);
  const f = path.join(FRAMES, 'score.wav');
  fs.writeFileSync(f, Buffer.concat([wav, raw]));
  console.log(`${f}: ${(raw.length / 4 / 48000).toFixed(1)} s`);
  return f;
}

// the cut: the frames at their rate, padded into 16:9 (the scope frame's black bars), a fine grain laid on in motion,
// the score under it; and a lighter copy for a phone
function cut() {
  const n = Math.round(TOTAL * FPS), missing = [];
  for (let i = 0; i < n; i++) if (!fs.existsSync(frameOf(i))) missing.push(i);
  if (missing.length) throw new Error(`${missing.length} frames missing (first ${missing[0]})`);
  const wav = path.join(FRAMES, 'score.wav');
  const vf = `scale=1920:-2:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,noise=c0s=${spec.grain ?? 5}:c0f=t,format=yuv420p`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(FRAMES, 'f%05d.jpg'), '-i', wav,
    '-vf', vf, '-t', TOTAL.toFixed(3), '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-tune', 'film', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', OUT]);
  const lite = OUT.replace(/\.mp4$/, '-720p.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', OUT, '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', lite]);
  for (const f of [OUT, lite]) console.log(`${f}: ${(fs.statSync(f).size / 1e6).toFixed(1)} MB`);
}

if (require.main !== module) module.exports = { open, settle, shoot, spOf, shots };
else (async () => {
  if (opt('stills', false)) return stills();
  if (opt('score', false)) return score();
  if (opt('cut', false)) return cut();
  await film();
  if (!opt('from', null) && !opt('to', null)) { await score(); cut(); }
})().catch(e => { console.error(e); process.exit(1); });
