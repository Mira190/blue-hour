// The opening's score as a phone plays it (issue 166): rendered by film-score.js from the overture's own plan, at the
// phone's rate, then measured as audio.js tuneWav writes it for the system's player (times its gain, every sample past
// full scale cut off at it). Prints the peak, the share of samples cut and where in the film the cutting is, by half
// second, beside the film's shots and its title. Exits 1 when any sample is cut: a cut sample is a click, a run of them
// a loud buzz, the noise the owner heard on an iPhone at the title of both openings.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/score_peaks.js            (WALK=1: the walk's opening; GAIN: tuneWav's, 0.8)
const { chromium } = require('playwright');
(async () => {
  const WALK = !!process.env.WALK, GAIN = +(process.env.GAIN || 0.8), RATE = 24000;
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 200)));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${WALK ? '?walk=1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__game && window.__game.overture && window.__game.overture(), null, { timeout: 600000, polling: 1000 });
  const r = await p.evaluate(async ({ GAIN, RATE }) => {
    const o = window.__game.overture(), plan = o.scorePlan();
    if (!window.OEFilmScore) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'film-score.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    const chs = await window.OEFilmScore.render(plan, RATE);
    const n = chs[0].length, win = RATE / 2, rows = [];
    let peak = 0, cut = 0;
    for (let w0 = 0; w0 < n; w0 += win) {
      let pk = 0, c = 0, ss = 0;
      for (let ch = 0; ch < 2; ch++) { const a = chs[ch]; for (let i = w0; i < Math.min(n, w0 + win); i++) { const v = Math.abs(a[i]); if (v > pk) pk = v; if (v * GAIN >= 1) c++; ss += a[i] * a[i]; } }
      rows.push({ t: w0 / RATE, pk, cut: c, rms: Math.sqrt(ss / (2 * Math.min(win, n - w0))) });
      peak = Math.max(peak, pk); cut += c;
    }
    return { plan: { duration: plan.duration, title: plan.title, finale: plan.finale, cuts: plan.cuts, clean: plan.clean, hush: plan.hush }, n, peak, cut, rows };
  }, { GAIN, RATE });
  console.log(`the ${WALK ? "walk's" : "story's"} score: ${(r.n / RATE).toFixed(1)} s at ${RATE} Hz; the title at ${r.plan.title.toFixed(1)} s, the finale at ${r.plan.finale.toFixed(1)} s, the cuts at ${r.plan.cuts.map(c => c.toFixed(1)).join(', ')}; clean ${!!r.plan.clean}`);
  console.log(`peak ${r.peak.toFixed(2)} (${(20 * Math.log10(r.peak)).toFixed(1)} dBFS); times tuneWav's ${GAIN}: ${(r.peak * GAIN).toFixed(2)}; samples cut off at full scale: ${r.cut} of ${r.n * 2} (${(100 * r.cut / (r.n * 2)).toFixed(2)}%)`);
  for (const q of r.rows) if (q.cut || q.pk * GAIN > 0.9) console.log(`  ${q.t.toFixed(1).padStart(5)} s  peak ${(q.pk * GAIN).toFixed(2)}  rms ${(q.rms * GAIN).toFixed(2)}  cut ${q.cut}`);
  await b.close();
  process.exit(r.cut ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
