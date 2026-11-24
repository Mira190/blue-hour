// What each part of a phone's mix costs the audio thread (docs/SOUND.md, "Every sound on the audio thread"). iOS plays
// Web Audio in blocks of 2.7 ms and a block not made in time is a click; how long the audio thread takes over a block is
// what a busy page leaves it no room for. This renders each part of the mix as a phone has it (the deck, the hybrid
// reverbs, the score, the choir, the crowd's beds) on its own in an OfflineAudioContext at 48 kHz, and the whole of what
// sounds at once at the story's Stop, and prints how much of a block each takes on this machine, best of three. The
// absolute figures are this machine's CPU (a phone's differs); the shares between parts, and between the ways a part can
// be built, are what it is for.
//   python3 -m http.server 8800 --directory web &
//   NODE_PATH=$(npm root -g) node tools/audio_cost.js [part ...]
const { chromium } = require('playwright');
const want = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(), p = await b.newPage(), port = process.env.PORT || 8800;
  p.on('pageerror', e => console.log('pageerror', String(e)));
  await p.setContent(`<script>Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });</script><script src="http://localhost:${port}/game/audio.js"></script><script src="http://localhost:${port}/game/music.js"></script>`);
  await p.waitForFunction(() => window.OEAudio && window.OEAudio.reverb && window.OEMusic);
  const parts = await p.evaluate(() => Object.keys(window.__parts = {
    // each part: (c, input) => built on the offline context c, fed by input (noise), into c.destination
    base: (c, x) => { x.connect(c.destination); },
    'room open, hybrid': (c, x) => { const v = OEAudio.reverb(OEAudio.impulse('open', c), 1, c, 'hybrid'); x.connect(v.input); v.output.connect(c.destination); },
    'room open, whole': (c, x) => { const v = OEAudio.reverb(OEAudio.impulse('open', c), 1, c, 'whole'); x.connect(v.input); v.output.connect(c.destination); },
    'room viaduct, hybrid': (c, x) => { const v = OEAudio.reverb(OEAudio.impulse('viaduct', c), 1, c, 'hybrid'); x.connect(v.input); v.output.connect(c.destination); },
    'hall, hybrid': (c, x) => { const ir = OEAudio.hallIR(c), v = OEAudio.reverb(ir, OEAudio.normScale(ir), c, 'hybrid'); x.connect(v.input); v.output.connect(c.destination); },
    "score's room, hybrid": (c, x) => { const ir = OEMusic.create({ persist: false }).impulse(c, 3.6), v = OEAudio.reverb(ir, OEAudio.normScale(ir), c, 'hybrid'); x.connect(v.input); v.output.connect(c.destination); },
    'head convolver alone (0.25 s)': (c, x) => { const n = Math.round(0.25 * c.sampleRate), ir = c.createBuffer(2, n, c.sampleRate); for (let k = 0; k < 2; k++) { const d = ir.getChannelData(k); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / n * 4); } const v = c.createConvolver(); v.normalize = false; v.buffer = ir; x.connect(v); v.connect(c.destination); },
    'combs alone (12, shelved)': (c, x) => { const m = c.createChannelMerger(2); for (let s = 0; s < 2; s++) for (let k = 0; k < 6; k++) { const d = c.createDelay(0.2); d.delayTime.value = 0.067 + k * 0.012 + s * 0.004; const f = c.createBiquadFilter(); f.type = 'highshelf'; f.frequency.value = 3000; f.gain.value = -2; const g = c.createGain(); g.gain.value = 0.8; d.connect(f); f.connect(g); g.connect(d); x.connect(d); d.connect(m, 0, s); } m.connect(c.destination); },
    choir: (c, x) => { const g = c.createGain(); g.gain.value = 0.08; g.connect(c.destination);
      for (const [i, f] of [110, 164.8, 220, 246.9, 329.6].entries()) { const o = c.createOscillator(), vib = c.createOscillator(), vg = c.createGain(), og = c.createGain(); o.type = 'sawtooth'; o.frequency.value = f; vib.frequency.value = 4.6 + i * 0.35; vg.gain.value = f * 0.004; vib.connect(vg); vg.connect(o.frequency);
        for (const [F, k] of [[820, 1], [1180, 0.6], [2700, 0.18]]) { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = F; bp.Q.value = 9; const fg = c.createGain(); fg.gain.value = k; o.connect(bp); bp.connect(fg); fg.connect(og); }
        og.gain.value = 0.4; og.connect(g); o.start(); vib.start(); } },
    'the score (bluehour), its room whole': async (c, x, T) => { OEMusic.create({ volume: 1, persist: false })._render(c, T, { palette: 'bluehour', slot: 'evening', mode: 'foot', theme: 0 }); },
  }));
  const T = +(process.env.SECONDS || 10), RATE = 48000, Q = 128 / RATE * 1000;
  console.log(`each part rendered for ${T} s at ${RATE} Hz, best of three; a block is ${Q.toFixed(2)} ms`);
  for (const name of parts) {
    if (want.length && !want.some(w => name.includes(w))) continue;
    const ms = await p.evaluate(async ([name, T, RATE]) => {
      let best = Infinity;
      for (let r = 0; r < 3; r++) {
        const c = new OfflineAudioContext(2, T * RATE, RATE), nb = c.createBuffer(1, RATE * 2, RATE), d = nb.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.1;
        const x = c.createBufferSource(); x.buffer = nb; x.loop = true; x.start();
        await window.__parts[name](c, x, T);
        const t0 = performance.now(); await c.startRendering(); best = Math.min(best, performance.now() - t0);
      }
      return best;
    }, [name, T, RATE]);
    const per = ms / (T * RATE / 128);
    console.log(`${name.padEnd(40)} ${(per * 1000).toFixed(1).padStart(7)} µs a block  ${(100 * per / Q).toFixed(2).padStart(6)} % of it`);
  }
  await b.close();
})();
