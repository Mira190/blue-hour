// Records the episode with its sound, from the loading screen to the last card, and listens to it (docs/SOUND.md
// "Listened to"). It plays the episode with tools/story_play.js unchanged, in a browser whose every AudioContext is
// tapped where it meets the speakers (tools/sound_tap.js): what a player hears, the game's sound and the opening's
// score on one timeline, written as a WAV, with what the story did along it. Then tools/sound_analyse.js reads the
// recording for what grates: a cue that strikes, a click, a peak at full scale, a loop seam, a voice under the score,
// a level that jumps.
//   NODE_PATH=$(npm root -g) xvfb-run -a node tools/sound_rec.js out_dir [WxH]
//   (a phone: 390x844. The page is served on its own port. GESTURE=1: the browser gives no sound before a touch, and the
//   recorder touches the loading screen once, as a player does; without it, sound is allowed from the start.)
// Writes out_dir/mix.wav (16-bit stereo), events.json, env.json (the buses' levels every 12 ms) and report.json (SHOTS=1:
// and the story's stills); exits 1 where story_play does, or where the analysis finds something that grates (STRICT=1).
// On a software renderer the page's main thread is slow: the score, which writes its notes from a timer 300 ms ahead,
// can drop or bunch them where a device would not. The analysis marks the main thread's stalls (events further apart
// than they were asked) so that what they made is not taken for the sound's own fault.
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const pw = require('playwright');
const [,, out = '/tmp/sound-rec', size = '1440x900'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const tapSrc = fs.readFileSync(path.join(__dirname, 'sound_tap.js'), 'utf8');
const ctxs = new Map(); // id -> { rate, fd, chunks: [{ f0, perf, n, pk }], env: [] }
const events = [];
let tStart = null;

const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
function wavHeader(frames, rate, chans = 2) {
  const b = Buffer.alloc(44), bytes = frames * chans * 2;
  b.write('RIFF', 0); b.writeUInt32LE(36 + bytes, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(chans, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * chans * 2, 28); b.writeUInt16LE(chans * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(bytes, 40);
  return b;
}

function sinkFn(kind, meta, data) {
  const m = JSON.parse(meta);
  if (tStart == null) tStart = m.t != null ? m.t : m.perf;
  if (kind === 'ctx') { ctxs.set(m.id, { rate: m.rate, file: path.join(out, `ctx${m.id}.raw`), fd: fs.openSync(path.join(out, `ctx${m.id}.raw`), 'w'), chunks: [], env: [], pos: 0 }); return; }
  if (kind === 'ev') { events.push(m); if (m.kind === 'no-recorder') console.log('FAIL no recorder:', JSON.stringify(m.detail)); return; }
  if (kind === 'pcm') {
    const c = ctxs.get(m.id); if (!c) return;
    const buf = Buffer.from(data, 'base64');
    fs.writeSync(c.fd, buf, 0, buf.length, c.pos); c.pos += buf.length;
    c.chunks.push({ f0: m.f0, perf: m.perf, n: buf.length / 4, pk: m.pk });
    if (m.env && m.env.length) c.env.push({ perf: m.perf, v: m.env });
  }
}

// Lay every context's chunks on one clock (performance.now() in ms) and sum them. A chunk follows the one before it
// sample for sample, unless the context was suspended between them (its frames stop, the clock does not): then it
// starts where its own timestamp puts it.
function assemble() {
  const all = [...ctxs.values()].filter(c => c.chunks.length);
  if (!all.length) return null;
  const RATE = all[0].rate, t0 = Math.min(...all.map(c => c.chunks[0].perf));
  for (const c of all) {
    // (in the context's own frames, which run on without a gap while it runs: positions as whole samples, so no join
    // opens one. Only a context that stood still, suspended, is placed again by the clock, and only forward: a block's
    // timestamp read in a stall of the main thread was 0.1 s out, and once left a hole of silence in the recording)
    let pos = null, prevEnd = null, prevF = null; const r = RATE / c.rate;
    for (const k of c.chunks) {
      const want = (k.perf - t0) / 1000 * RATE, contiguous = prevF != null && k.f0 === prevF;
      pos = prevEnd == null || (!contiguous && want - prevEnd > 0.08 * RATE) || want - prevEnd > 1.5 * RATE ? Math.max(prevEnd || 0, Math.round(want)) : prevEnd;
      prevF = k.f0 + k.n;
      k.pos = pos; k.at = pos / RATE; prevEnd = pos + k.n * r;
    }
    c.endPos = prevEnd; c.end = prevEnd / RATE;
  }
  const frames = Math.ceil(Math.max(...all.map(c => c.endPos))) + 1, dur = frames / RATE;
  const mix = new Float32Array(frames * 2);
  for (const c of all) {
    fs.closeSync(c.fd);
    const fd = fs.openSync(c.file, 'r'), r = c.rate / RATE; let off = 0;
    for (const k of c.chunks) {
      const buf = Buffer.alloc(k.n * 4); fs.readSync(fd, buf, 0, buf.length, off); off += buf.length;
      const s = new Int16Array(buf.buffer, buf.byteOffset, k.n * 2), m = r === 1 ? k.n : Math.round(k.n / r), base = Math.round(k.pos);
      for (let i = 0; i < m; i++) { // (linear resampling, where a context runs at another rate than the first)
        const x = i * r, j = Math.min(k.n - 1, Math.floor(x)), f = x - j, j1 = Math.min(k.n - 1, j + 1), o = base + i;
        if (o >= frames) break;
        mix[2 * o] += (s[2 * j] * (1 - f) + s[2 * j1] * f) / 32767;
        mix[2 * o + 1] += (s[2 * j + 1] * (1 - f) + s[2 * j1 + 1] * f) / 32767;
      }
    }
    fs.closeSync(fd); fs.unlinkSync(c.file);
  }
  const pcm = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames * 2; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mix[i] * 32767))), i * 2);
  fs.writeFileSync(path.join(out, 'mix.wav'), Buffer.concat([wavHeader(frames, RATE), pcm]));
  // the buses' levels, every 512 frames, on the same clock (the game's context only: the one that has them)
  const env = [];
  for (const c of all) { if (!c.env.some(e => e.v.some(v => v > 0))) continue; // (the opening's context has no buses of its own)
    const byPerf = new Map(c.chunks.map(k => [k.perf, k])), dt = 512 / c.rate;
    for (const e of c.env) { const k = byPerf.get(e.perf); const at = k ? k.at : (e.perf - t0) / 1000; const W = 5; for (let i = 0; i < e.v.length / W; i++) env.push([+(at + i * dt).toFixed(4)].concat(Array.from(e.v.slice(W * i, W * i + W), v => +v.toPrecision(3)))); } }
  env.sort((a, b) => a[0] - b[0]);
  fs.writeFileSync(path.join(out, 'env.json'), JSON.stringify({ cols: ['t', 'music', 'street+music', 'story', 'street+music 1-4 kHz', 'story 1-4 kHz'], rows: env }));
  fs.writeFileSync(path.join(out, 'events.json'), JSON.stringify(events.map(e => Object.assign({}, e, { t: +((e.t - t0) / 1000).toFixed(3) })), null, 0));
  const peaks = all.map(c => ({ rate: c.rate, seconds: +(c.end - c.chunks[0].at).toFixed(1), peak: Math.max(...c.chunks.map(k => k.pk)) }));
  return { seconds: dur, contexts: peaks };
}

(async () => {
  let port = +process.env.PORT, server = null;
  if (!port) {
    port = await freePort();
    server = spawn('python3', ['-m', 'http.server', String(port), '--directory', path.join(__dirname, '..', 'web')], { stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { if (await new Promise(r => { const s = net.connect(port, '127.0.0.1', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); })) break; await new Promise(r => setTimeout(r, 100)); }
    process.env.PORT = String(port);
  }
  const gesture = !!process.env.GESTURE;
  const launch = pw.chromium.launch.bind(pw.chromium);
  pw.chromium.launch = async opts => {
    opts = Object.assign({}, opts); opts.args = (opts.args || []).concat(gesture ? '--autoplay-policy=document-user-activation-required' : '--autoplay-policy=no-user-gesture-required');
    const b = await launch(opts), newPage = b.newPage.bind(b), close = b.close.bind(b);
    let page = null;
    b.newPage = async o => {
      page = await newPage(o);
      await page.exposeFunction('__soundSink', sinkFn);
      // (no stills unless SHOTS=1: a still of a software renderer's frame holds the main thread for seconds, and the score
      // drops its notes in the hold; the recording is of the game, not of the camera)
      if (!process.env.SHOTS) page.screenshot = async () => Buffer.alloc(0);
      await page.addInitScript(tapSrc);
      if (process.env.EXTRA_INIT) await page.addInitScript(fs.readFileSync(process.env.EXTRA_INIT, 'utf8')); // (EXTRA_INIT=file.js: more of the page's sound to log, for a hunt)
      page.on('console', m => { if (/audio|music|sound/i.test(m.text())) console.log('console:', m.text().slice(0, 200)); });
      if (gesture) { // one touch on the loading screen, as a player gives it, once the page has its sound waiting
        const goto = page.goto.bind(page);
        page.goto = async (...a) => {
          const r = await goto(...a);
          await page.waitForFunction(() => window.OEAudio && window.OEAudio.ctx, null, { timeout: 120000 }).catch(() => {});
          await page.waitForTimeout(1500);
          const vp = page.viewportSize();
          const st = await page.evaluate(() => window.OEAudio.ctx && window.OEAudio.ctx.state);
          console.log(`sound before the touch: ${st}`);
          if (o && o.hasTouch) await page.touchscreen.tap(vp.width / 2, vp.height * 0.4); else await page.mouse.click(vp.width / 2, vp.height * 0.4);
          await page.waitForTimeout(800);
          const now = await page.evaluate(() => window.OEAudio.ctx && window.OEAudio.ctx.state);
          console.log(`${now === 'running' ? '' : 'FAIL '}sound after the touch: ${now}`); if (now !== 'running') process.exitCode = 1;
          return r;
        };
      }
      return page;
    };
    b.close = async () => {
      if (page) { try { await page.waitForTimeout(4000); } catch (e) { /* gone */ } }
      const a = assemble();
      if (a) {
        fs.writeFileSync(path.join(out, 'recording.json'), JSON.stringify(Object.assign({ size, gesture }, a), null, 1));
        console.log(`recorded ${a.seconds.toFixed(1)} s: ${a.contexts.map(c => `${c.seconds} s at ${c.rate} Hz, peak ${(20 * Math.log10(c.peak || 1e-9)).toFixed(1)} dBFS`).join('; ')}`);
      } else console.log('FAIL nothing was recorded');
      await close();
      if (server) server.kill();
      const r = require('./sound_analyse.js').analyse(out);
      if (process.env.STRICT && r.grating) process.exitCode = 1;
    };
    return b;
  };
  process.argv = [process.argv[0], path.join(__dirname, 'story_play.js'), out, size];
  const exit = process.exit.bind(process);
  process.exit = code => exit(process.exitCode || code); // (story_play's own verdict, or the analysis's)
  require('./story_play.js');
})();
