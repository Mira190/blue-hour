// Records what the street sounds like at the places where a bed without a source would be heard (docs/SOUND.md "No bed
// without a source"), so that a before (main) and an after (a branch) can be put side by side for the ear. The walk's
// page at 17:30, the player held at each point, everything the speakers get recorded through tools/sound_tap.js:
//   kerb     Hachiko's kerb through one whole cycle of the Scramble's signal (until the walk has come on, gone off and
//            come on again, or MAXCYC seconds), with red.wav cut from the longest stretch the walk is off
//   stop     the same kerb, the Stop as story.js makes it (hush, hold, the `stop` cue), held 5 s, let go
//   roof     SHIBUYA SKY's deck, 229 m; one far event asked for 6 s in, as the game asks one every 70 to 160 s
//   rain     Hachiko's kerb in frame 7's rain
// Each a WAV in OUT (16-bit stereo, as the speakers get it) and notes.json (the signal's changes, the people round you).
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   OUT=out/beds/after xvfb-run -a node tools/beds_listen.js          (PORT=8801 for another checkout's page; PHONE=1)
// It plays the page in software WebGL, whose frames are slow: the world's clock keeps the wall's (one step a frame).
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const OUT = process.env.OUT || 'out/beds', PHONE = process.env.PHONE === '1', MAXCYC = +(process.env.MAXCYC || 200);
fs.mkdirSync(OUT, { recursive: true });
const ctxs = new Map();
function sink(kind, meta, data) {
  const m = JSON.parse(meta);
  if (kind === 'ctx') { ctxs.set(m.id, { rate: m.rate, chunks: [] }); return; }
  if (kind === 'pcm') { const c = ctxs.get(m.id); if (c) c.chunks.push({ f0: m.f0, buf: Buffer.from(data, 'base64') }); }
}
function wav(file, c, f0, f1) {
  const n = Math.max(0, Math.round(f1 - f0)), pcm = Buffer.alloc(n * 4);
  for (const ch of c.chunks) {
    const len = ch.buf.length / 4;
    for (let i = 0; i < len; i++) { const k = ch.f0 + i - f0; if (k >= 0 && k < n) ch.buf.copy(pcm, k * 4, i * 4, i * 4 + 4); }
  }
  const b = Buffer.alloc(44), bytes = n * 4;
  b.write('RIFF', 0); b.writeUInt32LE(36 + bytes, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(c.rate, 24); b.writeUInt32LE(c.rate * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(bytes, 40);
  fs.writeFileSync(file, Buffer.concat([b, pcm]));
  // its level, for notes.json: RMS and peak in dBFS
  let s = 0, pk = 0; for (let i = 0; i < n * 2; i++) { const v = pcm.readInt16LE(i * 2) / 32768; s += v * v; pk = Math.max(pk, Math.abs(v)); }
  const db = v => (v > 0 ? +(20 * Math.log10(v)).toFixed(1) : -Infinity);
  return { file, s: +(n / c.rate).toFixed(1), rms: db(Math.sqrt(s / Math.max(1, n * 2))), peak: db(pk) };
}
(async () => {
  const b = await chromium.launch({ headless: false, args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } : { viewport: { width: 800, height: 500 }, deviceScaleFactor: 1 });
  await p.exposeFunction('__soundSink', sink);
  await p.addInitScript(fs.readFileSync(path.join(__dirname, 'sound_tap.js'), 'utf8'));
  await p.addInitScript(phone => {
    try { localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ }
    if (phone) Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
  }, PHONE);
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 200)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&weather=clear${PHONE ? '&shed=0&guard=0' : ''}#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(async () => {
    const g = window.__game, A = window.OEAudio;
    if (g.overture && g.overture() && g.overture().active && g.overture().skip) g.overture().skip();
    A.start(); if (A.ctx && A.ctx.state !== 'running') await A.ctx.resume();
    g.clock.scale = 1; g.clock.min = 17 * 60 + 30; g.clock.own = true; g.crowdAuto(true); for (let i = 0; i < 20; i++) g.advance(0.5);
  });
  await p.waitForFunction(() => window.OEAudio.ctx && window.OEAudio.ctx.state === 'running', null, { timeout: 60000 });
  // the player held at (x, y[, z]) for sec seconds of the wall, or until stop(g) says so; returns the context's frames
  // at its start and end and the signal's changes (on the context's clock)
  const hold = (x, y, z, sec, act) => p.evaluate(async ([x, y, z, sec, act]) => {
    const g = window.__game, A = window.OEAudio, fr = () => Math.round(A.ctx.currentTime * A.ctx.sampleRate), raf = () => new Promise(r => requestAnimationFrame(r));
    const put = () => { if (g.player.mode !== 'foot') return; const f = g.nav.floorAt(x, y, 400); g.player.x = x; g.player.y = y; g.player.z = z != null ? z : f ? f.z : g.nav.terrain(x, y); g.player.speed = 0; g.player.vz = 0; g.player.ground = true; };
    for (let i = 0; i < 30; i++) { put(); await raf(); } // (settled where it is put, the place's mix taken)
    const f0 = fr(), t0 = performance.now(), sig = [], near = [], marks = [];
    let walk = null, ons = 0, offs = 0, next = 1;
    while (performance.now() - t0 < sec * 1000) {
      put(); await raf();
      const s = g.sound(), w = !!(s && s.walk), t = (performance.now() - t0) / 1000;
      if (w !== walk) { if (walk !== null) { sig.push([+(fr() - f0) / A.ctx.sampleRate, w ? 'walk on' : 'walk off']); if (w) ons++; else offs++; } walk = w; }
      if (t > next) { next += 2; near.push(s ? s.near : null); }
      if (act === 'cycle' && ons >= 2 && offs >= 1) break; // (on, off and on again: one whole cycle, and its start)
      if (act === 'stop') {
        if (!marks.length && t > 3) { A.hush(true); g.hold(true); A.sfx('stop'); if (A.held) A.held(true); marks.push([+(fr() - f0) / A.ctx.sampleRate, 'the Stop']); }
        if (marks.length === 1 && t > 8) { A.hush(false); g.hold(false); A.sfx('run'); if (A.held) A.held(false); marks.push([+(fr() - f0) / A.ctx.sampleRate, 'time runs again']); }
      }
      if (act === 'far' && !marks.length && t > 6) { A.far('siren', 600, -0.3); marks.push([+(fr() - f0) / A.ctx.sampleRate, 'a far siren asked for, 600 m off (heard 1.7 s later)']); }
    }
    return { f0, f1: fr(), sig, near, marks, place: g.soundPlace(), mix: A.mixNow };
  }, [x, y, z, sec, act]);
  const notes = {}, rate = () => [...ctxs.values()].find(c => c.chunks.length);
  const seg = async (name, r) => { await new Promise(res => setTimeout(res, 600)); const c = rate(); notes[name] = Object.assign(wav(path.join(OUT, `${name}.wav`), c, r.f0, r.f1), { sig: r.sig, marks: r.marks, near: r.near, place: r.place, mix: r.mix }); console.log(name, JSON.stringify(notes[name])); };
  const kerb = await hold(380, -1028, null, MAXCYC, 'cycle'); await seg('kerb', kerb);
  // red.wav: the longest stretch with the walk off, up to 20 s, from its middle
  { const ch = [[0, null], ...kerb.sig, [(kerb.f1 - kerb.f0) / rate().rate, 'end']]; let best = null;
    for (let i = 0; i < ch.length - 1; i++) if (ch[i][1] === 'walk off' || (i === 0 && ch[1] && ch[1][1] === 'walk on')) { const len = ch[i + 1][0] - ch[i][0]; if (!best || len > best[1] - best[0]) best = [ch[i][0], ch[i + 1][0]]; }
    if (best) { const mid = (best[0] + best[1]) / 2, half = Math.min(10, (best[1] - best[0]) / 2), R = rate().rate; notes.red = wav(path.join(OUT, 'red.wav'), rate(), kerb.f0 + (mid - half) * R, kerb.f0 + (mid + half) * R); notes.red.from = +(mid - half).toFixed(1); console.log('red', JSON.stringify(notes.red)); } }
  await seg('stop', await hold(380, -1028, null, 13, 'stop'));
  await seg('roof', await hold(541, -1124, 241.8, 25, 'far'));
  await p.evaluate(() => window.__game.weather.set('rain', { now: true }));
  await seg('rain', await hold(380, -1028, null, 30, ''));
  fs.writeFileSync(path.join(OUT, 'notes.json'), JSON.stringify(notes, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
