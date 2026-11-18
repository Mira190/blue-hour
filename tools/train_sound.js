// A train going by, rendered offline (web/game/audio.js in Chromium, as tools/sound_render.js renders the story's sound)
// to WAV files to listen to, from where a player stands: under the Yamanote Line's bridge, and in the street beside its
// viaduct. Eleven E235 cars of 20 m at 54 km/h, from 180 m off to 180 m gone, driven each 60th of a second as
// web/game/trains.js drives it (audio.js trainAt: the distance to the nearest car, how far the rail is over your ears,
// the speed, a car's length). And read for what makes a train a train and not a jet going over:
//   rhythm  the wheels: how strongly the loudness repeats at the bogies' beat while the train is by (the envelope's
//           autocorrelation between 0.25 and 1.5 s, which holds a car's 1.33 s; a jet's roar has none, about 0.1)
//   LUFS    the loudest 400 ms (ITU-R BS.1770 K-weighting), so that the train stays where the street's mix has it
//   hiss    far off (60 to 150 m), the share of the sound above 1 kHz: the air takes the high sound first, so a train
//           heard that far is a rumble; a slowly swelling hiss is what a jet is
//   deck    under the bridge, the share of the sound below 110 Hz while the train is overhead: a steel deck booms
// AUDIO=path renders another audio.js the same way (an older one, to hear what changed; without trainAt it is driven as
// trains.js drove it before: its rumble, and a bogie's two axles once a car length).
//   NODE_PATH=$(npm root -g) node tools/train_sound.js [outdir]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const SR = 48000, SECONDS = 38;
const [,, outDir = '/tmp/train-sound'] = process.argv;
const AUDIO = process.env.AUDIO || path.join(__dirname, '../web/game/audio.js');
const PLACES = { under: { side: 0, rail: 7, ear: 2 }, beside: { side: 15, rail: 7, ear: 2 } };

async function render(browser, place) {
  const p = await browser.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.route('https://sound.test/**', r => r.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  await p.goto('https://sound.test/');
  await p.addScriptTag({ content: `Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 });` });
  await p.addScriptTag({ content: `window.__t = 0;
    window.AudioContext = class extends OfflineAudioContext { constructor() { super(2, ${SR} * ${SECONDS}, ${SR}); window.__ctx = this; } get currentTime() { return window.__t; } };` });
  await p.addScriptTag({ path: AUDIO });
  const r = await p.evaluate(async ({ place, SECONDS }) => {
    const A = window.OEAudio; A.start(); await A.ready;
    const v = 15, cars = 11, len = 20, dt = 1 / 60, H = place.rail, D = place.side, ear = place.ear, near = [];
    let clackAt = 0;
    for (let t = 0; t < SECONDS - 0.5; t += dt) {
      window.__t = t;
      const front = -180 + v * t; let nd = Infinity, nx = 0;
      for (let k = 0; k < cars; k++) { const x = front - (k + 0.5) * len, d = Math.hypot(x, D, H + 1.5 - ear); if (d < nd) { nd = d; nx = x; } }
      near.push(nd);
      const pan = Math.max(-1, Math.min(1, nx / (nd || 1))) * 0.85;
      if (nd > 240) { if (A.trainAt) A.trainAt(0, null, dt); else A.train(0, 0); continue; }
      if (A.trainAt) A.trainAt(0, { near: nd, above: H - ear, v, a: 0, len, pan }, dt);
      else { // (as trains.js drove it before trainAt)
        const level = Math.pow(Math.max(0, 1 - nd / 240), 2.2) * (1 + 0.6 * Math.max(0, 1 - nd / 30));
        A.train(0, level, pan, v, 0, false);
        if ((clackAt -= dt) <= 0) { A.clack(level, pan, v); clackAt = len / v; }
      }
    }
    const buf = await window.__ctx.startRendering(), n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1);
    const m = new Float32Array(n); for (let i = 0; i < n; i++) m[i] = (L[i] + R[i]) / 2;
    // one-pole filters for the bands: over 1 kHz, and under 110 Hz
    const hp = new Float32Array(n), lp = new Float32Array(n), ah = Math.exp(-2 * Math.PI * 1000 / buf.sampleRate), al = Math.exp(-2 * Math.PI * 110 / buf.sampleRate);
    { let yh = 0, xp = 0, yl = 0; for (let i = 0; i < n; i++) { yh = ah * (yh + m[i] - xp); xp = m[i]; hp[i] = yh; yl = (1 - al) * m[i] + al * yl; lp[i] = yl; } }
    const hop = buf.sampleRate / 100, env = [], eH = [], eL = [], eA = [];
    for (let s = 0; s + hop <= n; s += hop) { let a = 0, h = 0, l = 0; for (let i = s; i < s + hop; i++) { a += m[i] * m[i]; h += hp[i] * hp[i]; l += lp[i] * lp[i]; } env.push(Math.sqrt(a / hop)); eA.push(a); eH.push(h); eL.push(l); }
    const nearAt = j => near[Math.min(near.length - 1, Math.round(j / 100 * 60))];
    // while it is by (its nearest car within 15 m): the envelope's autocorrelation at the bogies' beat
    const by = env.map((e, j) => (nearAt(j) < 15 + Math.hypot(D, H + 1.5 - ear) - Math.hypot(0, H + 1.5 - ear) ? e : null)), seg = by.filter(e => e != null);
    const mean = seg.reduce((s, e) => s + e, 0) / Math.max(1, seg.length), z = seg.map(e => e - mean), var0 = z.reduce((s, e) => s + e * e, 0) || 1;
    let rhythm = 0; for (let lag = 25; lag <= 150; lag++) { let c = 0; for (let i = 0; i + lag < z.length; i++) c += z[i] * z[i + lag]; rhythm = Math.max(rhythm, c / var0); }
    const share = (num, den, pick) => { let a = 0, b = 0; for (let j = 0; j < num.length; j++) if (pick(j)) { a += num[j]; b += den[j]; } return b ? a / b : 0; };
    const hiss = share(eH, eA, j => nearAt(j) > 60 && nearAt(j) < 150), deck = share(eL, eA, j => nearAt(j) < 12);
    let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const kw = x => { const y = new Float32Array(x.length), z = new Float32Array(x.length), s1 = [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585], s2 = [1, -2, 1, -1.99004745483398, 0.99007225036621];
      for (const [inp, out, c] of [[x, y, s1], [y, z, s2]]) { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < inp.length; i++) { const v = c[0] * inp[i] + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2; x2 = x1; x1 = inp[i]; y2 = y1; y1 = v; out[i] = v; } } return z; };
    const kl = kw(L), kr = kw(R), win = 0.4 * buf.sampleRate; let lufs = -99;
    for (let s0 = 0; s0 + win <= n; s0 += buf.sampleRate / 10) { let e = 0; for (let i = s0; i < s0 + win; i++) e += kl[i] * kl[i] + kr[i] * kr[i]; lufs = Math.max(lufs, -0.691 + 10 * Math.log10(e / win + 1e-20)); }
    const pcm = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) { pcm[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
    let bin = ''; const u8 = new Uint8Array(pcm.buffer); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { rhythm, hiss, deck, lufs, peak: 20 * Math.log10(peak + 1e-12), b64: btoa(bin) };
  }, { place, SECONDS });
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

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const [name, place] of Object.entries(PLACES)) {
    const r = await render(b, place);
    wav(path.join(outDir, `train-${name}.wav`), r.b64);
    console.log(`${name.padEnd(7)} rhythm ${r.rhythm.toFixed(2)}  hiss far off ${(100 * r.hiss).toFixed(0)}%  deck ${(100 * r.deck).toFixed(0)}%  loudest ${r.lufs.toFixed(1)} LUFS  peak ${r.peak.toFixed(1)} dBFS`);
  }
  await b.close();
})();
