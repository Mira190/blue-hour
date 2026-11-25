// The opening scores a phone plays, as files (issue 166; docs/SOUND.md "A phone's music"). A phone's music is a media
// element's, and until 24 November the opening's score was rendered in the phone's own page (film-score.js in WebKit's
// OfflineAudioContext) and handed to the element as a WAV. The owner's iPhone heard a strong noise in the opening, at
// the first aerial and the shot from above, with no AudioContext and one element playing; the same render here is clean.
// So a phone renders nothing: each overture's score is rendered here, by the same code from the same plan, checked, and
// shipped as a file the element plays (web/assets/story/late/score-<key>.mp3), as the loading cue is (tools/load_cue.js).
// The key is a hash of what the score is made from (the overture's score and its shots' ids and lengths, overture.js
// scoreKey), so a changed score finds no file and a phone plays the film without it (never its own render), and the check below fails until this
// is run again.
//   NODE_PATH=$(npm root -g) node tools/score_files.js          (writes the files and scores.json; needs ffmpeg)
//   node tools/score_files.js --check                           (static: every overture's file there and up to date)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'web/assets/story/late'), RATE = 24000, GAIN = 0.8; // (the rate a desktop renders at, overture.js prepareScore: the same render, resampled to 44.1 kHz by the encoder)
// (overture.js scoreKey: FNV-1a of the score's spec and its shots, the same string in node and the page)
const scoreKey = (score, shots) => { const s = JSON.stringify([score, shots.map(q => [q.id, q.dur])]); let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
function overtures() { // the overtures a story plays, as game.js makes them: the first episode's over the map's, and the walk's
  const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'cities/shibuya/city.json'), 'utf8')).game, out = [];
  if (g.story && g.story.episodes && g.story.episodes[0] && g.story.episodes[0].overture) out.push(['story', Object.assign({}, g.overture, g.story.episodes[0].overture, { night: null })]);
  if (g.walk && g.walk.overture) { const w = g.walk.overture; out.push(['walk', w]); if (w.night) out.push(['walk at night', Object.assign({}, w, w.night)]); }
  // (a flight the story plays between two places: its score under the story's own music, as game.js makeFilm gives it
  // while that plays, and alone)
  for (const [i, fr] of ((g.story && g.story.episodes && g.story.episodes[0] && g.story.episodes[0].frames) || []).entries()) if (fr.flight && fr.flight.score) {
    out.push([`frame ${i + 1}'s flight`, Object.assign({}, fr.flight, { score: Object.assign({}, fr.flight.score, { under: true }) })]);
    out.push([`frame ${i + 1}'s flight alone`, fr.flight]);
  }
  return out.filter(([, o]) => o.score && o.shots);
}
function plan(ov) { // overture.js scorePlan
  const sc = Object.assign({}, ov.score); let T = 0; const shots = ov.shots.map(s => { const q = Object.assign({}, s, { t0: T }); T += s.dur; return q; });
  const at = (id, k) => { const s = shots.find(q => q.id === id); return s ? s.t0 + (k || 0) * s.dur : 0; };
  return Object.assign(sc, { duration: T, cuts: shots.map(s => s.t0).filter(x => x > 0), title: at(sc.title_shot, sc.title_at), finale: at(sc.finale_shot, sc.finale_at),
    hush: sc.hush_shot ? [at(sc.hush_shot, sc.hush_at[0]), at(sc.hush_shot, sc.hush_at[1])] : null });
}
const MAN = path.join(OUT, 'scores.json');
// (the code that renders them: a change to film-score.js makes every file stale)
const CODE = require('crypto').createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'web/film-score.js'))).digest('hex').slice(0, 12);
if (process.argv.includes('--check')) {
  const man = fs.existsSync(MAN) ? JSON.parse(fs.readFileSync(MAN, 'utf8')) : {}, fails = [];
  for (const [name, ov] of overtures()) {
    const k = scoreKey(ov.score, ov.shots), e = man[k];
    if (!e) fails.push(`${name}'s score (${k}) has no file: run node tools/score_files.js`);
    else if (!fs.existsSync(path.join(ROOT, 'web', e.file))) fails.push(`${name}'s score file ${e.file} is missing`);
    else if (e.code !== CODE) fails.push(`${name}'s score file was made by another film-score.js: run node tools/score_files.js`);
  }
  for (const f of fails) console.log('FAIL', f);
  console.log(fails.length ? `FAIL the opening scores' files (${fails.length})` : `ok   ${overtures().length} opening scores a phone plays from a file, each up to date`);
  process.exit(fails.length ? 1 : 0);
}
(async () => {
  const { chromium } = require('playwright');
  const { execFileSync } = require('child_process');
  const os = require('os');
  const b = await chromium.launch(), p = await b.newPage();
  await p.addScriptTag({ path: path.join(ROOT, 'web/film-score.js') });
  const man = {}, done = new Set();
  for (const [name, ov] of overtures()) {
    const k = scoreKey(ov.score, ov.shots);
    if (done.has(k)) continue; done.add(k);
    const pl = plan(ov);
    const r = await p.evaluate(async ([pl, rate, gain]) => {
      const c = await window.OEFilmScore.render(pl, rate), n = c[0].length, pcm = new Int16Array(n * 2); let peak = 0;
      for (let ch = 0; ch < 2; ch++) for (let i = 0; i < n; i++) { const v = c[ch][i] * gain; peak = Math.max(peak, Math.abs(v)); pcm[i * 2 + ch] = Math.round(Math.max(-1, Math.min(1, v)) * 32767); }
      const u = new Uint8Array(pcm.buffer); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
      return { b64: btoa(s), n, peak };
    }, [pl, RATE, GAIN]);
    const pcm = Buffer.from(r.b64, 'base64'), head = Buffer.alloc(44);
    head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
    head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
    const wav = path.join(os.tmpdir(), `blue-hour-score-${k}.wav`), file = `score-${k}.mp3`;
    fs.writeFileSync(wav, Buffer.concat([head, pcm]));
    // (rendered at 24 kHz, it has nothing above 12: a low-pass there keeps the encoder from spending bits on nothing)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-map_metadata', '-1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', '-cutoff', '12000', path.join(OUT, file)]);
    fs.unlinkSync(wav);
    man[k] = { file: `assets/story/late/${file}`, seconds: +(r.n / RATE).toFixed(2), for: name, code: CODE };
    console.log(`${name}: ${file}, ${(r.n / RATE).toFixed(1)} s, peak ${(20 * Math.log10(r.peak)).toFixed(1)} dBFS, ${Math.round(fs.statSync(path.join(OUT, file)).size / 1024)} kB`);
  }
  await b.close();
  // (files of scores no overture plays any more are taken away)
  for (const f of fs.readdirSync(OUT)) if (/^score-[0-9a-f]{8}\.mp3$/.test(f) && !Object.values(man).some(e => e.file.endsWith(f))) { fs.unlinkSync(path.join(OUT, f)); console.log(`removed ${f}`); }
  fs.writeFileSync(MAN, JSON.stringify(man, null, 1) + '\n');
})();
