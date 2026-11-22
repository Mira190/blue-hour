// The car the story sends at frame 6, sent for again and again (#97): from where the flight sets you down the ride is
// ordered as the story orders it, the world is stepped on without its draws until the car has pulled in (or LATE
// seconds have gone), the car is sent away, the traffic runs on a while, and it is ordered again. Each trial prints how
// long the car took and how long it stood; one that took longer than LATE prints what held it, ten cars down the chain,
// and every movement in the junction it waited at. Exits 1 if any car did not come within LATE seconds.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/ride_come.js [trials] [WxH]
// LATE=seconds (90): the longest a car may take. GAP=seconds (20): the traffic's time between two trials.
// FORCE=overlap: the case made to happen: three seconds on its way the car is put inside the nearest car of the traffic
// on its way ahead, in your sight, as it once came into sight; it must come all the same (stucks: how often its driver's
// bound moved it on, rides.js COME_STILL). FORCE=hold: the car is held where it is for good, as nothing in the traffic
// should hold it; the story's own bound must send it away and go on on foot (story.js, the ride's wait_s), which this
// then expects instead of the car.
const { skip } = require('./draw_skip');
const { chromium } = require('playwright');
const { logger: browserLog, watch: watchPage } = require('./browser_watch');
const [,, trials = '12', size = '800x500'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args, logger: browserLog() });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  await skip(p, 1000);
  watchPage(p);
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-story-late', JSON.stringify({ fi: 5, left: 2, prints: [0, 1, 2, 3, 4].map(i => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('gt-play').click());
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const pl = window.__game.player; pl.x = 498; pl.y = -1046; });
  // the cards before the ride, until the story has sent the car
  for (let k = 0; k < 400; k++) {
    const s = await p.evaluate(() => { const g = window.__game, st = g.story.state, d = document.getElementById('gd'); return { dlg: !!(d && !d.hidden), choices: document.querySelectorAll('#gd-choices button').length, phase: st.phase, beat: st.beat, ride: !!g.ride() }; });
    if (s.ride && s.beat === 'ride') break;
    if (s.phase === 'dressed') await p.keyboard.press('KeyQ');
    else if (s.dlg) { await p.evaluate(() => { const st = window.__game.story.state, B = document.querySelectorAll('#gd-choices button'); if (B.length) (B[st.want] || B[0]).click(); }); if (!s.choices) await p.keyboard.press('KeyE'); }
    await p.waitForTimeout(700);
  }
  const LATE = +(process.env.LATE || 90), GAP = +(process.env.GAP || 20);
  // one trial, in the page: the car (the story's own the first time, then ordered as the story orders it) stepped to its
  // stop, a second at a time; what it stood for, by its intent; and where it was late, what held it
  const trial = (n, late, gap) => p.evaluate(([n, late, gap, force]) => {
    const g = window.__game, to = (g.story.state.fr.ride || {}).to || [0, 0];
    const step = s => { for (let i = 0; i < Math.round(s * 30); i++) g.frame(1 / 30); };
    if (!g.ride() || g.ride().phase === 'leaving') {
      for (let k = 0; k < 120 && g.ride(); k++) step(1);
      step(gap);
      if (!g.orderRide({ id: 'story', name: 'there', at: to.slice(0, 2) })) return { n, no: 'not ordered' };
    }
    const r = g.ride(), st0 = r.drv.st, from = [+st0.x.toFixed(0), +st0.y.toFixed(0)], eta = +(r.T0 || 0).toFixed(0), stood = {};
    let t = 0, still = 0, worst = 0, run = 0, seen = 0, forced = null;
    for (; t < late && g.ride() === r && r.phase === 'coming'; t++) {
      step(1);
      if (force === 'overlap' && !forced && t >= 2) { // (onto the nearest car of the traffic on its way ahead)
        const st = r.drv.st, at = {}; let best = null;
        for (let a = 6; a < 80 && !best; a += 1) { r.drv.path.at(Math.min(st.end - 1, st.s + a), at); for (const c of g.cars.live) if (c.line >= 0 && Math.hypot(c.x - at.x, c.y - at.y) < 1.2 && Math.abs((c.z || 0) - (at.z || 0)) < 2) { best = { a, c }; break; } }
        if (best) { r.drv.jump(st.s + best.a); forced = { on: +best.a.toFixed(0), depth: +g.cars.footprint(st.x, st.y, st.z, st.h, r.C.half, r.C.hw, 0).toFixed(2), far: +Math.hypot(st.x - g.player.x, st.y - g.player.y).toFixed(0) }; }
      }
      const st = r.drv.st;
      if (st.v < 0.3) { still++; run++; worst = Math.max(worst, run); const k = st.intent || st.why || '?'; stood[k] = (stood[k] || 0) + 1; } else run = 0;
      if (g.inView && g.inView(st.x, st.y, st.z)) seen++;
    }
    const st = r.drv.st, out = { n, from, eta, took: t, still, worst, phase: g.ride() === r ? r.phase : 'gone', far: +Math.hypot(st.x - g.player.x, st.y - g.player.y).toFixed(0), stood, short: r.short || '', stucks: r.stucks || 0, stuckWhy: r.stuckWhy || '', forced, story: { beat: g.story.state.beat, goal: (document.querySelector('#g-story-goal') || {}).textContent || '' } };
    if (g.ride() === r && r.phase === 'coming') {
      const d = o => ({ at: [+(+o.x).toFixed(1), +(+o.y).toFixed(1)], v: +(o.v || 0).toFixed(1), why: o.why || '', intent: o.intent || '', heldBy: o.heldBy || '', q: !!o.q, mv: o.mv ? o.mv.j.id : null, line: o.line, toLine: o.toLine != null ? +(+o.toLine).toFixed(1) : null, still: +(o.still || o.held || 0).toFixed(0), walker: !!o.walker });
      const chain = [d(st)], seenC = new Set();
      let o = st.block; for (let k = 0; k < 10 && o && !seenC.has(o); k++) { seenC.add(o); chain.push(d(o)); o = o.front || o.xBlock || (o.block && !o.block.walker ? o.block : null) || null; }
      const a = st.lineArm || (st.wj && { j: st.wj }), j = a && a.j;
      out.chain = chain; out.gap = st.gap; out.xMutual = !!st.xMutual; out.wedged = +(st.wedged || 0).toFixed(1);
      if (j) out.junction = { id: j.id, sig: !!j.sig, ph: j.ph, st: j.st, t: j.t, busy: j.busy, scramble: !!j.scramble, active: j.active.map(q => ({ me: q.c === st, k: q.k, m: q.m, in: +(g.t() - q.t).toFixed(0), c: d(q.c) })), pend: j.pend.map(q => ({ me: q.c === st, k: q.k, since: +(g.t() - q.since).toFixed(0), why: q.c.why || '' })) };
    }
    if (g.ride() === r) g.cancelRide();
    return out;
  }, [n, late, gap, process.env.FORCE || '']);
  let bad = 0; const took = [];
  if (process.env.FORCE === 'hold') { // (the story's own car, held; the page's own frames, which the story's clock runs on)
    await p.evaluate(() => { window.__game.ride().hold = true; });
    const t0 = Date.now();
    const gone = await p.waitForFunction(() => { const r = window.__game.ride(); return !r || r.phase === 'leaving'; }, null, { timeout: 1200000, polling: 1000 }).then(() => true, () => false);
    await p.waitForTimeout(3000);
    const r = await p.evaluate(() => { const g = window.__game, st = g.story.state; return { beat: st.beat, phase: st.phase, goal: (document.querySelector('#g-story-goal') || {}).textContent || '', chip: (document.querySelector('#g-story-chip') || {}).textContent || '' }; });
    console.log(`held: the story ${gone ? 'sent the car away' : 'did NOT send the car away'} after ${Math.round((Date.now() - t0) / 1000)} s of the wall clock; now ${JSON.stringify(r)}`);
    await b.close();
    process.exit(gone && r.beat !== 'ride' && !errors.length ? 0 : 1);
  }
  for (let n = 0; n < +trials; n++) {
    const r = await trial(n, LATE, GAP);
    console.log(JSON.stringify(r));
    if (r.no) continue;
    took.push(r.took);
    if (r.phase === 'coming') bad++;
    if (process.env.FORCE === 'overlap' && !r.forced) console.log('(no car of the traffic on its way to put it in)');
  }
  took.sort((a, b) => a - b);
  console.log(`${took.length} cars sent for: ${bad} did not come within ${LATE} s; the median came in ${took[took.length >> 1]} s, the slowest in ${took[took.length - 1]} s`);
  await b.close();
  process.exit(bad || errors.length ? 1 : 0);
})();
