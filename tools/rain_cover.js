// The rain's cover map with what stands still kept (issue 130; weather.js occStill): the walk in the rain, the world held,
// and the map drawn three ways from the same place: whole, as it was; the still things into their own map and the moving
// ones over a copy; and the moving ones alone over the copy kept. The three maps must be the same, texel for texel; the
// triangles each way draws are counted (tools/beat_count.js). Then the game runs on, standing, and the map's draws are
// counted by kind: the still things' map must be drawn again only every few seconds.
//   xvfb-run -a node tools/rain_cover.js [WxH] [HH:MM]        TIER=low|high  PHONE=1  SECONDS=10 (of the game's time, standing)
// Exits 1 when the maps differ, the moving things' pass is not lighter than half the whole, or the still map is drawn
// more often than every four seconds while standing.
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const [,, size = '390x844', time = '21:00'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500,
    ...(process.env.PHONE ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' } : {}) });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log(`pageerror: ${String(e).slice(0, 300)}`); });
  p.on('console', m => { if (/rain cover: drawn whole|WebGL error|did not link/.test(m.text())) { errors.push(m.text()); console.log(`console: ${m.text().slice(0, 300)}`); } });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || (w < 500 ? 'low' : 'high'));
  await p.addInitScript(require('./beat_count').hook);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(t => {
    const g = window.__game, [hh, mm] = t.split(':').map(Number);
    g.setClock(g.clock.y, 10, 10, hh * 60 + mm); g.weather.set('rain', { now: true });
    for (let i = 0; i < 200 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); }
    if (g.governor) g.governor.auto = false;
  }, time);
  await p.waitForTimeout(+(process.env.WARM || 30000));
  const fails = [];
  const made = await p.evaluate(() => { const c = window.__game.weather.cover; return c ? { cache: c.cache, size: c.size, off: c.off, moves: c.moves, still: c.still, whole: c.whole } : null; });
  console.log(`the cover map: ${JSON.stringify(made)}`);
  if (!made || !made.cache) fails.push(`the still things' map is not in use${made && made.off ? `: ${made.off}` : ''}`);
  // the same place, three ways
  const r = await p.evaluate(() => {
    const g = window.__game, W = g.weather, C = W.cover, B = window.__beat, R = g.atmos.composer.renderer, n = C.size, t = g.t();
    g.hold(true);
    const one = (cache, fresh) => {
      C.cache = cache;
      B.begin(); C.draw(t, fresh); const c = B.end();
      const px = new Uint16Array(n * n * 4); R.readRenderTargetPixels(W.occ, 0, 0, n, n, px);
      const T = window.THREE.DataUtils, hgt = new Float32Array(n * n), cov = new Uint8Array(n * n);
      for (let i = 0; i < n * n; i++) { hgt[i] = T.fromHalfFloat(px[i * 4]); cov[i] = T.fromHalfFloat(px[i * 4 + 3]) > 0.5 ? 1 : 0; }
      return { draws: c.draws, tris: c.tris, hgt, cov, groups: c.groups };
    };
    const whole = one(false, false), fresh = one(true, true); B.names(true); const kept = one(true, false); B.names(false);
    const differ = (a, b) => { let d = 0, max = 0; for (let i = 0; i < n * n; i++) { const e = a.cov[i] !== b.cov[i] ? 99 : Math.abs(a.hgt[i] - b.hgt[i]); if (e > 0.02) d++; if (e > max) max = e; } return { texels: d, max: +max.toFixed(3) }; };
    g.hold(false);
    let covered = 0; for (let i = 0; i < n * n; i++) covered += whole.cov[i];
    return { n, covered, whole: { draws: whole.draws, tris: whole.tris }, fresh: { draws: fresh.draws, tris: fresh.tris }, kept: { draws: kept.draws, tris: kept.tris }, freshVsWhole: differ(whole, fresh), keptVsWhole: differ(whole, kept), moving: kept.groups.slice(0, 14).map(q => `${q.group.replace(/^\S+ /, '')} ${q.tris}`) };
  });
  console.log(`the map, ${r.n} x ${r.n}, ${r.covered} texels with something over them`);
  console.log(`whole, as before:                         ${r.whole.draws} draws, ${r.whole.tris} triangles`);
  console.log(`the still things' map and the moving over: ${r.fresh.draws} draws, ${r.fresh.tris} triangles; differs from the whole in ${r.freshVsWhole.texels} texels (largest ${r.freshVsWhole.max} m)`);
  console.log(`the moving alone over the map kept:        ${r.kept.draws} draws, ${r.kept.tris} triangles; differs from the whole in ${r.keptVsWhole.texels} texels (largest ${r.keptVsWhole.max} m)`);
  console.log(`what the moving things' pass draws, by name: ${r.moving.join('; ')}`);
  if (r.freshVsWhole.texels || r.keptVsWhole.texels) fails.push(`the map differs from the whole (${r.freshVsWhole.texels} and ${r.keptVsWhole.texels} texels)`);
  if (!(r.kept.tris < r.whole.tris * 0.5)) fails.push(`the moving things' pass (${r.kept.tris} triangles) is not under half the whole (${r.whole.tris})`);
  if (!r.covered) fails.push('nothing in the map');
  // standing in the rain: how often each kind is drawn
  const S = +(process.env.SECONDS || 10);
  const run = await p.evaluate(S => new Promise(done => {
    const g = window.__game, C = g.weather.cover, t0 = g.t(), c0 = { whole: C.whole, still: C.still, moves: C.moves }, w0 = performance.now();
    const f = () => { if (g.t() - t0 >= S || performance.now() - w0 > 400000) return done({ s: +(g.t() - t0).toFixed(1), whole: C.whole - c0.whole, still: C.still - c0.still, moves: C.moves - c0.moves, cache: C.cache }); requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }), S);
  console.log(`standing ${run.s} s of the game's time in the rain: the map due ${run.moves + run.whole} times; the still things drawn ${run.still + run.whole} times, the moving ${run.moves}`);
  if (run.still + run.whole > Math.ceil(run.s / 4) + 1) fails.push(`the still things were drawn ${run.still + run.whole} times in ${run.s} s standing`);
  if (errors.length) fails.push(`${errors.length} errors on the page`);
  for (const f of fails) console.log(`FAIL ${f}`);
  if (!fails.length) console.log(`ok   the rain's cover: the map as it was, ${r.kept.tris} triangles where ${r.whole.tris} were each time it is due`);
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
