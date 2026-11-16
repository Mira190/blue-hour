// The loudness of the story's opening score (web/film-score.js, as cities/shibuya/city.json's episode plans it), second
// by second: nothing in it may arrive suddenly. Renders it offline in Chromium, prints each second's level (RMS, dBFS,
// at the level the overture plays it) and exits 1 if a second is more than 8 dB over the one before once the score
// is audible (over -50 dBFS), if a 50 ms window is more than 12 dB over the second before it (a hit), or if the peak is
// over -8 dBFS. Writes the render to [out.wav] to listen to.
//   NODE_PATH=$(npm root -g) node tools/overture_levels.js [out.wav]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const RATE = 24000;
(async () => {
  const S = JSON.parse(fs.readFileSync(path.join(__dirname, '../cities/shibuya/city.json'), 'utf8')).game.story, ov = S.episodes[0].overture;
  let t = 0; const shots = ov.shots.map(s => { const q = { id: s.id, t0: t, dur: s.dur }; t += s.dur; return q; });
  const at = (id, k) => { const s = shots.find(q => q.id === id); return s ? s.t0 + (k || 0) * s.dur : 0; }, sc = ov.score;
  const plan = Object.assign({}, sc, { duration: t, cuts: shots.map(s => s.t0).filter(x => x > 0), title: at(sc.title_shot, sc.title_at), finale: at(sc.finale_shot, sc.finale_at),
    hush: sc.hush_shot ? [at(sc.hush_shot, sc.hush_at[0]), at(sc.hush_shot, sc.hush_at[1])] : null });
  const b = await chromium.launch(), p = await b.newPage();
  await p.addScriptTag({ path: path.join(__dirname, '../web/film-score.js') });
  const chs = await p.evaluate(async ([plan, RATE]) => (await OEFilmScore.render(plan, RATE)).map(c => Array.from(c)), [plan, RATE]);
  await b.close();
  const G = 0.8, n = chs[0].length, db = v => (v > 0 ? 20 * Math.log10(v) : -120);
  const rms = (a, c) => { let s = 0; for (let i = a; i < a + c && i < n; i++) s += (chs[0][i] * chs[0][i] + chs[1][i] * chs[1][i]) / 2; return db(G * Math.sqrt(s / c)); };
  let peak = 0; for (const c of chs) for (const v of c) peak = Math.max(peak, Math.abs(v) * G);
  const secs = []; for (let s = 0; s + 1 <= n / RATE; s++) secs.push(rms(s * RATE, RATE));
  let bad = 0, hit = -99, jump = -99;
  for (let s = 1; s < secs.length; s++) if (secs[s] > -50) jump = Math.max(jump, secs[s] - Math.max(secs[s - 1], -50));
  for (let i = RATE; i + RATE / 20 < n; i += RATE / 40) { const w = rms(i, RATE / 20), before = rms(i - RATE, RATE); if (w > -45) hit = Math.max(hit, w - Math.max(before, -50)); }
  console.log(`title at ${plan.title.toFixed(1)} s, finale at ${plan.finale.toFixed(1)} s, ${t} s long`);
  console.log(secs.map((v, s) => `${String(s).padStart(2)} s ${v.toFixed(1).padStart(6)} dB ${'#'.repeat(Math.max(0, Math.round((v + 70) / 2)))}`).join('\n'));
  const line = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`); if (!ok) bad++; };
  line(jump <= 8, `the largest rise from one second to the next is ${jump.toFixed(1)} dB (8 allowed)`);
  line(hit <= 12, `the loudest 50 ms is ${hit.toFixed(1)} dB over the second before it (12 allowed)`);
  line(db(peak) <= -8, `peak ${db(peak).toFixed(1)} dBFS (-8 allowed)`);
  if (process.argv[2]) { const pcm = Buffer.alloc(n * 4); for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, chs[c][i] * G)) * 32767), i * 4 + c * 2);
    const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
    fs.writeFileSync(process.argv[2], Buffer.concat([h, pcm])); }
  process.exit(bad ? 1 : 0);
})();
