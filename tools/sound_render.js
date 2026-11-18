// Render the story's sound (web/game/audio.js) offline in Chromium to WAV files to listen to, and print each one's
// levels, so that the cues sit together (docs/SOUND.md "Levels"): its true sample peak (dBFS), its loudest 400 ms
// (momentary loudness, LUFS, ITU-R BS.1770 K-weighting) and its gated integrated loudness. Nothing is normalised: the
// files are at the level the game plays them.
//   NODE_PATH=$(npm root -g) [TAPE=worklet|deck] [VERB=hybrid|whole] node tools/sound_render.js [outdir] [cue ...]
// (VERB: the reverbs as a phone hears them, the default here, or convolved whole as with a mouse: docs/SOUND.md "Every
// sound on the audio thread")
// The cues one by one; the Stop over the street (its murmur, the screens' song, the walk calls, footsteps), braked,
// held five seconds and let go; and the same footsteps and a call in each place's room.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const SR = 48000;

async function render(browser, seconds, script) {
  const p = await browser.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') errors.push(m.text()); });
  // (an https page, served here: an AudioWorklet, the tape, is made only in a secure context)
  await p.route('https://sound.test/**', r => r.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  // (TAPE=worklet or TAPE=deck: the Stop's tape as a mouse's page or a touch screen's has it; unset, a phone's, the deck)
  const q = [process.env.TAPE && `tape=${process.env.TAPE}`, process.env.VERB && `verb=${process.env.VERB}`].filter(Boolean).join('&');
  await p.goto(`https://sound.test/${q ? `?${q}` : ''}`);
  // audio.js's context is an offline one, and its clock is the one this script sets (window.__t)
  // (as a phone hears it, with stereo pans: the HRTF panner's database loads lazily, and an offline render waiting on
  // it in headless Chromium could hang)
  await p.addScriptTag({ content: `Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 });` });
  await p.addScriptTag({ content: `window.__t = 0;
    window.AudioContext = class extends OfflineAudioContext { constructor() { super(2, ${SR} * ${seconds}, ${SR}); window.__ctx = this; } get currentTime() { return window.__t; } };` });
  await p.addScriptTag({ path: path.join(__dirname, '../web/game/audio.js') });
  const r = await p.evaluate(async src => {
    const A = window.OEAudio; A.start(); await A.ready;
    await (0, eval)(`(async (A, at) => { ${src} })`)(A, t => { window.__t = t; });
    const buf = await window.__ctx.startRendering(), n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1);
    // K-weighting at 48 kHz (BS.1770-4): a high shelf, then a high-pass
    const kw = x => {
      const y = new Float32Array(x.length), z = new Float32Array(x.length);
      const s1 = [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585], s2 = [1, -2, 1, -1.99004745483398, 0.99007225036621];
      for (const [inp, out, c] of [[x, y, s1], [y, z, s2]]) { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < inp.length; i++) { const v = c[0] * inp[i] + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2; x2 = x1; x1 = inp[i]; y2 = y1; y1 = v; out[i] = v; } }
      return z;
    };
    const kl = kw(L), kr = kw(R), win = 0.4 * buf.sampleRate, hop = 0.1 * buf.sampleRate, blocks = [];
    for (let s = 0; s + win <= n; s += hop) { let e = 0; for (let i = s; i < s + win; i++) e += kl[i] * kl[i] + kr[i] * kr[i]; blocks.push(e / win); }
    const lufs = e => -0.691 + 10 * Math.log10(e + 1e-20);
    const abs = blocks.filter(e => lufs(e) > -70), mean = a => a.reduce((s, e) => s + e, 0) / Math.max(1, a.length);
    const rel = lufs(mean(abs)) - 10, gated = abs.filter(e => lufs(e) > rel);
    let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    // per second, the loudest momentary loudness: the shape of a long render (the Stop)
    const perSec = []; for (let s = 0; s < n / buf.sampleRate - 0.4; s++) perSec.push(Math.max(...blocks.slice(s * 10, s * 10 + 10).map(lufs)).toFixed(0));
    const pcm = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) { pcm[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
    let bin = ''; const u8 = new Uint8Array(pcm.buffer); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { peak: 20 * Math.log10(peak + 1e-12), mmax: Math.max(...blocks.map(lufs)), integ: lufs(mean(gated)), perSec, b64: btoa(bin) };
  }, script);
  await p.close();
  if (errors.length) throw new Error(errors.join('; '));
  return r;
}

function wav(file, b64) {
  const data = Buffer.from(b64, 'base64'), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

// the street for a few seconds from `from` to `to`: the crowd, the screens' song (scheduled a beat ahead as game.js
// asks for it), footsteps at a walk, and the scramble's calls
const STREET = (from, to) => `
  for (let t = ${from}; t < ${to}; t += 0.1) {
    at(t); A.murmur(0.9); A.screens(0.8);
    if (Math.round(t * 10) % 5 === 0) A.step();
    if (Math.round(t * 10) % 15 === 0) A.walkCall(['piyo', 'piyopiyo', 'kakko', 'kakakko'][Math.round(t * 10 / 15) % 4], 0.7, Math.sin(t));
  }`;
const CUES = {
  shutter: [2, `at(0.2); A.sfx('shutter'); A.sfx('wind');`],
  'cam-up': [1.2, `at(0.2); A.sfx('cam-up');`],
  'cam-down': [1, `at(0.2); A.sfx('cam-down');`],
  found: [4, `at(0.2); A.sfx('found');`],
  goal: [1.5, `at(0.2); A.sfx('goal');`],
  stamp: [1, `at(0.2); A.sfx('stamp');`],
  ghost: [4, `at(0.2); A.sfx('ghost');`],
  right: [3.5, `at(0.2); A.sfx('right');`],
  wrong: [1, `at(0.2); A.sfx('wrong');`],
  end: [7, `at(0.2); A.sfx('end');`],
  voice: [2, `for (let k = 0; k < 14; k++) { at(0.2 + k * 0.09); A.voice({ pitch: 150 }); }`],
  // the signature: the street, the Stop at 3 s (as story.js calls it), held 5 s, let go at 8 s
  'the-stop': [12, `${STREET(0, 3)}; at(3); A.hush(true); A.sfx('stop'); A.held(true); at(8); A.hush(false); A.sfx('run'); A.held(false); ${STREET(8, 12)}`],
  'street-only': [4, STREET(0, 4)],
  // the brake alone, without the story's cues over it: the street braked at 2 s, held, spun up at 5 s
  tape: [8, `${STREET(0, 2)}; at(2); A.hush(true); at(5); A.hush(false); ${STREET(5, 8)}`],
  // a held note braked (a car's engine idling, two saws a fifth apart): the pitch to read the brake's curve by
  'tape-engine': [6, `at(0); A.car(0.5, 0.6, 1); at(2); A.hush(true); at(4); A.hush(false);`],
  stop: [4, `at(0.2); A.sfx('stop');`],
  run: [3, `at(0.2); A.sfx('run');`],
};
// (footsteps and a cuckoo's call with nothing under them, then a second and a half of the room's tail)
for (const k of ['open', 'viaduct', 'inside', 'roof']) CUES[`place-${k}`] = [4, `at(0); A.place('${k}'); for (const t of [0.3, 0.8, 1.3, 1.8]) { at(t); A.step(); } at(2.1); A.walkCall('kakko', 1, 0.5);`];

(async () => {
  const outDir = process.argv[2] || 'sound-wav';
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  console.log('cue               peak dBFS   max momentary LUFS   integrated LUFS');
  const only = process.argv.slice(3);
  for (const [name, [sec, script]] of Object.entries(CUES)) {
    if (only.length && !only.includes(name)) continue;
    // (an offline render with a worklet in it now and then never finishes in headless Chromium: it is given a minute,
    // then made again)
    let r = null;
    for (let k = 0; k < 3 && !r; k++) r = await Promise.race([render(browser, sec, script), new Promise(ok => setTimeout(() => ok(null), 60000))]);
    if (!r) throw new Error(`${name}: no render in three tries`);
    const file = path.join(outDir, `${name}.wav`);
    wav(file, r.b64);
    console.log(`${name.padEnd(16)} ${r.peak.toFixed(1).padStart(8)}   ${r.mmax.toFixed(1).padStart(10)}           ${r.integ.toFixed(1).padStart(8)}${name === 'the-stop' ? `   per second: ${r.perSec.join(' ')}` : ''}   ${file}`);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
