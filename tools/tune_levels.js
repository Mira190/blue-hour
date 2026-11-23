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
//   NODE_PATH=$(npm root -g) node tools/tune_levels.js
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
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
  // the cue as the element decodes it, at the scores' rate
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', path.join(ROOT, 'web/assets/story/late/cue-phone.mp3'), '-f', 'f32le', '-ac', '2', '-ar', String(RATE), '-'], { maxBuffer: 1 << 30 });
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), n = all.length / 2, cue = [new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) { cue[0][i] = all[i * 2]; cue[1][i] = all[i * 2 + 1]; }
  const b = await chromium.launch(), p = await b.newPage();
  await p.addScriptTag({ path: path.join(ROOT, 'web/film-score.js') });
  const fails = [];
  const cs = stats(cue);
  console.log(`cue-phone.mp3: peak ${db(cs.peak)} dBFS, loudest 400 ms ${db(cs.loud)} dBFS RMS, ${(n / RATE).toFixed(0)} s`);
  for (const [name, ov] of Object.entries(ovs)) for (const under of [false, true]) {
    const chs = (await p.evaluate(async ([pl, rate]) => (await window.OEFilmScore.render(pl, rate)).map(a => Array.from(a)), [plan(ov, under), RATE])).map(a => Float32Array.from(a, v => v * GAIN));
    let clipped = 0; for (const a of chs) for (const v of a) if (Math.abs(v) >= 1) clipped++;
    const s = stats(chs);
    // the cue under it from every phase (quarter-second steps over one turn of its loop, 320/9 s)
    let sum = 0;
    for (let off = 0; off < Math.round(RATE * 320 / 9); off += RATE / 4) for (let c = 0; c < 2; c++) { const a = chs[c], q = cue[c]; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i] + q[(i + off) % n]); if (v > sum) sum = v; } }
    const plays = name === 'walk' ? !under : under; // (what main plays: the story's rendered under the cue, the walk's alone)
    console.log(`${name}'s score${under ? ' (rendered under the cue)' : ' (alone)'} at tuneWav's ${GAIN}: peak ${db(s.peak)} dBFS, loudest 400 ms ${db(s.loud)} dBFS RMS, ${clipped} samples clipped, ${(chs[0].length / RATE).toFixed(1)} s; with the cue under it: peak ${db(sum)} dBFS${plays ? '' : '   (not how main plays it)'}`);
    if (!under && (s.peak > Math.pow(10, HEADROOM / 20) || clipped)) fails.push(`${name}'s score alone peaks at ${db(s.peak)} dBFS (${clipped} clipped), over ${HEADROOM}`);
  }
  await b.close();
  for (const f of fails) console.log('FAIL', f);
  console.log(fails.length ? `FAIL the tunes' levels (${fails.length})` : 'PASS every tune a phone plays alone peaks under ' + HEADROOM + ' dBFS, none clipped');
  process.exit(fails.length ? 1 : 0);
})();
