// One of a scramble's crowd stranded in its box during the traffic's turn (issue 204): put where the roads check found
// one (4.3 m from the Scramble's middle, strolling, its spot behind a kerb), and timed until it is off the carriageway.
// The drive to 109 stood 150 s behind such a one, whom the rescue for the stranded never moved: it looked for
// pavement only 4 m off.
//   xvfb-run -a node tools/box_stranded.js shibuya [tries=6]        (GAME_TIME=17:57; LIMIT=s, 25 by default)
// The Scramble (the scramble nearest 369,-1001), its crowd's own test of the road (pz.road). Each try waits for a traffic turn, takes one of the Scramble's crowd standing at a kerb, puts it at a point of the box
// (the middle and round it at 4 to 8 m), and fails where it is still in the carriageway after LIMIT seconds.
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, city = 'shibuya', TRIES = '6'] = process.argv;
const LIMIT = +(process.env.LIMIT || 25);

(async () => {
  process.env.GAME_TIME = process.env.GAME_TIME || '17:57';
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 800, height: 500 } })).newPage();
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 400)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  await pinClock(p, city);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-${city}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.cars', null, { timeout: 400000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); if (g.lateReady) await g.lateReady(); });
  await startPlay(p, { asIs: true });
  // (you on a footway 30 m off, out of the scramble's reach: on foot at its kerb you would press for its walk)
  await p.evaluate(() => { const g = window.__game, S = g.junctions.scrambles.reduce((a, j) => Math.hypot(j.x - 369, j.y + 1001) < Math.hypot(a.x - 369, a.y + 1001) ? j : a), q = g.roadNet.nearest(S.x - 20, S.y - 45, 60); g.hopTo(q.x, q.y, q.z, 'the kerb'); for (let t = 0; t < 10 && (g.arriving() || g.cine.active); t += 0.25) g.advance(0.25); g.advance(20); });
  let bad = 0;
  for (let k = 0; k < +TRIES; k++) {
    const r = await p.evaluate(({ k, LIMIT }) => {
      const g = window.__game, S = g.junctions.scrambles.reduce((a, j) => Math.hypot(j.x - 369, j.y + 1001) < Math.hypot(a.x - 369, a.y + 1001) ? j : a), P = g.crowd.P, pzOf = P.find(q => q.pz && q.pz.x != null && Math.hypot(q.pz.x - S.x, q.pz.y - S.y) < 5), road = (x, y) => pzOf && pzOf.pz.road ? !!pzOf.pz.road(x, y) : g.nav.carriageway(x, y) !== false;
      for (let t = 0; t < 120 && !(S.st === 'g' && S.ph < 2 && S.t < 3); t += 0.1) g.frame(0.1); // (a traffic turn, just begun)
      const i = P.findIndex(q => q.pz && pzOf && q.pz === pzOf.pz && q.state === 'scr' && (q.ph === 'wait' || q.ph === 'stroll') && !road(q.x, q.y) && !(q.lead >= 0) && !(q.mates && q.mates.length));
      if (i < 0) return { k, err: 'none of the crowd at a kerb' };
      const q = P[i], a = k * 2.4, r0 = k ? 4 + (k % 3) * 2 : 4.3, x = S.x + Math.cos(a) * r0, y = S.y + Math.sin(a) * r0;
      if (!road(x, y)) return { k, err: `${x.toFixed(1)},${y.toFixed(1)} is not in the carriageway` };
      q.x = q.rx = x; q.y = q.ry = y; q.ph = 'stroll'; q.v = q.vx = q.vy = 0; q.roadT = 0; q.roadOut = false; q.sTries = 3; q.gutT = 0; q.sjam = 0;
      let t = 0; for (; t < LIMIT && road(q.x, q.y); t += 1 / 30) g.frame(1 / 30);
      return { k, at: [+x.toFixed(1), +y.toFixed(1)], t: +t.toFixed(1), out: !road(q.x, q.y), ph: q.ph, now: [+q.x.toFixed(1), +q.y.toFixed(1)], light: `${S.ph}${S.st}` };
    }, { k, LIMIT });
    if (r.err) { console.log(`try ${k + 1}: ${r.err}`); continue; }
    console.log(`${r.out ? 'ok  ' : 'FAIL'} try ${k + 1}: put at ${r.at} in the box at ${r.light}: ${r.out ? `off the carriageway in ${r.t} s` : `still in it after ${LIMIT} s, at ${r.now}, ${r.ph}`}`);
    if (!r.out) bad++;
  }
  console.log(bad ? `FAIL ${bad} of the crowd left stranded in the box` : 'ok   the crowd stranded in the box comes out of it');
  await b.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
