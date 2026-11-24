// What a phone's music elements play, measured (issue 166; docs/SOUND.md, "A phone's music"). A phone plays its music on
// media elements, whose volume iOS does not let a page set, so each file's level is baked in: the loading cue
// (web/assets/story/late/cue-phone.mp3, tools/load_cue.js) and each opening's score, rendered in the page by
// film-score.js and written as a 16-bit WAV at tuneWav's gain (overture.js prepareScore). This renders the scores here
// as the page does, from cities/shibuya/city.json (the story's opening and the walk's, each as it would be rendered
// with the cue under it, plan.under, and alone), decodes the cue, and reports
//   - each tune's peak and loudness (RMS over 400 ms windows, the loudest) in dBFS, and how many samples tuneWav clips;
//   - the cue and a score summed as they would overlap if both played (the cue's every phase in quarter-second steps):
//     the peak the system's mix would be given.
// It fails when a tune that plays alone peaks above HEADROOM (-1 dBFS: a decoder's or a resampler's overshoot reaches
// full scale) or tuneWav clips one sample. The sum is reported, not failed on: since issue 166 a phone never plays two.
//   NODE_PATH=$(npm root -g) node tools/tune_levels.js      (the cue decoded by Chromium, no ffmpeg)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..'), RATE = 24000, HEADROOM = -1, GAIN = +(process.env.GAIN || readGain());
function readGain() { // tuneWav's gain as overture.js passes it
  const m = /OEAudio\.tuneWav\(chs, RATE, ([\d.]+)\)/.exec(fs.readFileSync(path.join(ROOT, 'web/game/overture.js'), 'utf8'));
  return m ? m[1] : 0.8;
}
const db = v => (v > 0 ? 20 * Math.log10(v) : -Infinity).toFixed(1);
function plan(ov, under) { // overture.js scorePlan
  const sc = Object.assign({}, ov.score, under ? { under: true } : {});
  let T = 0; const shots = ov.shots.map(s => { const q = Object.assign({}, s, { t0: T }); T += s.dur; return q; });
  const at = (id, k) => { const s = shots.find(q => q.id === id); return s ? s.t0 + (k || 0) * s.dur : 0; };
  return Object.assign(sc, { duration: T, cuts: shots.map(s => s.t0).filter(x => x > 0), title: at(sc.title_shot, sc.title_at), finale: at(sc.finale_shot, sc.finale_at),
    hush: sc.hush_shot ? [at(sc.hush_shot, sc.hush_at[0]), at(sc.hush_shot, sc.hush_at[1])] : null });
}
function stats(chs) {
  let peak = 0, loud = 0; const W = Math.round(RATE * 0.4);
  for (const a of chs) {
    for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > peak) peak = v; }
    for (let i = 0; i + W <= a.length; i += W >> 1) { let s = 0; for (let j = i; j < i + W; j++) s += a[j] * a[j]; loud = Math.max(loud, Math.sqrt(s / W)); }
  }
  return { peak, loud };
}
(async () => {
  const city = JSON.parse(fs.readFileSync(path.join(ROOT, 'cities/shibuya/city.json'), 'utf8')).game;
  const ovs = { story: city.story.episodes[0].overture, walk: city.walk.overture };
  const b = await chromium.launch(), p = await b.newPage();
  await p.addScriptTag({ path: path.join(ROOT, 'web/film-score.js') });
  // the cue decoded by the browser itself, at the scores' rate (no ffmpeg: CI's machines have none)
  const mp3 = fs.readFileSync(path.join(ROOT, 'web/assets/story/late/cue-phone.mp3')).toString('base64');
  const dec = await p.evaluate(async ([b64, rate, turn]) => {
    const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), oc = new OfflineAudioContext(2, rate, rate), buf = await oc.decodeAudioData(u.buffer);
    const chs = [0, 1].map(c => buf.getChannelData(Math.min(c, buf.numberOfChannels - 1))), W = Math.round(rate * 0.4); let peak = 0, loud = 0;
    for (const a of chs) { for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > peak) peak = v; } for (let i = 0; i + W <= a.length; i += W >> 1) { let q = 0; for (let j = i; j < i + W; j++) q += a[j] * a[j]; loud = Math.max(loud, Math.sqrt(q / W)); } }
    const pack = a => { const x = new Uint8Array(a.slice(0, turn).buffer); let s = ''; for (let i = 0; i < x.length; i += 32768) s += String.fromCharCode.apply(null, x.subarray(i, i + 32768)); return btoa(s); };
    return { peak, loud, seconds: buf.duration, chs: chs.map(pack) };
  }, [mp3, RATE, Math.ceil(RATE * 320 / 9) + RATE]); // (the whole file measured in the page; one turn of its loop and a second brought back, for the sums)
  const cue = dec.chs.map(b64 => { const x = Buffer.from(b64, 'base64'); return new Float32Array(x.buffer.slice(x.byteOffset, x.byteOffset + x.length)); }), n = cue[0].length;
  const fails = [];
  console.log(`cue-phone.mp3: peak ${db(dec.peak)} dBFS, loudest 400 ms ${db(dec.loud)} dBFS RMS, ${dec.seconds.toFixed(0)} s`);
  for (const [name, ov] of Object.entries(ovs)) for (const under of [false, true]) {
    const chs = (await p.evaluate(async ([pl, rate]) => (await window.OEFilmScore.render(pl, rate)).map(a => Array.from(a)), [plan(ov, under), RATE])).map(a => Float32Array.from(a, v => v * GAIN));
    let clipped = 0; for (const a of chs) for (const v of a) if (Math.abs(v) >= 1) clipped++;
    const s = stats(chs);
    // the cue under it from every phase (quarter-second steps over one turn of its loop, 320/9 s)
    let sum = 0;
    for (let off = 0; off < Math.round(RATE * 320 / 9); off += RATE / 4) for (let c = 0; c < 2; c++) { const a = chs[c], q = cue[c]; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i] + q[(i + off) % n]); if (v > sum) sum = v; } }
    const plays = !under; // (what a phone plays since issue 166: each score alone, the cue let go)
    console.log(`${name}'s score${under ? ' (rendered under the cue)' : ' (alone)'} at tuneWav's ${GAIN}: peak ${db(s.peak)} dBFS, loudest 400 ms ${db(s.loud)} dBFS RMS, ${clipped} samples clipped, ${(chs[0].length / RATE).toFixed(1)} s; with the cue under it: peak ${db(sum)} dBFS${plays ? '' : '   (not how main plays it)'}`);
    if (!under && (s.peak > Math.pow(10, HEADROOM / 20) || clipped)) fails.push(`${name}'s score alone peaks at ${db(s.peak)} dBFS (${clipped} clipped), over ${HEADROOM}`);
  }
  // the opening scores a phone plays, as shipped (tools/score_files.js): each file decoded as the element would, its peak,
  // and, half a second at a time, how much of it is broadband: the energy of its sample-to-sample difference against its
  // own (the scores and the cue read under 0.1, white noise 1.41; over 0.25 fails, about noise 15 dB under the music). The owner's iPhone heard a noise like the city's
  // old bed in the opening (issue 166): no file a phone plays may carry one
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/assets/story/late/scores.json'), 'utf8'));
  for (const [k, e] of Object.entries(man).concat([['cue', { file: 'assets/story/late/cue-phone.mp3', for: 'the loading cue' }]])) {
    const r = await p.evaluate(async b64 => {
      const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), buf = await new OfflineAudioContext(2, 44100, 44100).decodeAudioData(u.buffer), W = Math.round(buf.sampleRate / 2);
      let peak = 0, worst = 0, at = 0;
      for (let c = 0; c < buf.numberOfChannels; c++) { const a = buf.getChannelData(c);
        for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > peak) peak = v; }
        for (let i = 1; i + W <= a.length; i += W) { let e0 = 0, e1 = 0; for (let j = i; j < i + W; j++) { e0 += a[j] * a[j]; const d = a[j] - a[j - 1]; e1 += d * d; } if (e0 / W < 1e-5) continue; const q = Math.sqrt(e1 / e0); if (q > worst) { worst = q; at = i / buf.sampleRate; } } }
      return { peak, worst, at, s: buf.duration };
    }, fs.readFileSync(path.join(ROOT, 'web', e.file)).toString('base64'));
    console.log(`${e.file} (${e.for}): peak ${db(r.peak)} dBFS, broadband at most ${r.worst.toFixed(3)} (at ${r.at.toFixed(1)} s), ${r.s.toFixed(1)} s`);
    if (r.peak > Math.pow(10, HEADROOM / 20)) fails.push(`${e.file} peaks at ${db(r.peak)} dBFS, over ${HEADROOM}`);
    if (r.worst > 0.25) fails.push(`${e.file} carries broadband noise at ${r.at.toFixed(1)} s (${r.worst.toFixed(2)}): a phone's music is to have none`);
  }
  await b.close();
  for (const f of fails) console.log('FAIL', f);
  console.log(fails.length ? `FAIL the tunes' levels (${fails.length})` : 'PASS every tune a phone plays alone peaks under ' + HEADROOM + ' dBFS, none clipped, and the files it plays carry no broadband noise');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log(`FAIL ${String(e && e.stack || e).split('\n')[0].slice(0, 200)}`); process.exit(1); });
