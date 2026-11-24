// What stands in a junction's box (issue 204): the posts (lamps, signal poles, trunks, a hero level's posts) within a
// junction's reach that the traffic brakes for, each with whether it stands in the carriageway, and over some minutes
// of the traffic every car held in the box by one (`why === 'post'`): which movement, by which post, for how long.
//   xvfb-run -a node tools/box_posts.js shibuya [minutes=4] [x,y=369,-1001]      (GAME_TIME=17:57; R= the reach, 45 m)
// A car of the Scramble's 0>20 stood 8 s in the box for a post at about 370,-977 while the car turning from arm 1
// waited on its way across; the run fails on any car held by a post in a box with a signal for more than 3 s.
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, city = 'shibuya', MIN = '4', AT = '369,-1001'] = process.argv;
const at = AT.split(',').map(Number), R = +(process.env.R || 45);

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
  const list = await p.evaluate(({ at, R }) => {
    const g = window.__game, q = g.roadNet.nearest(at[0] - 12, at[1] - 30, 60);
    g.hopTo(q.x, q.y, q.z, 'the kerb');
    for (let t = 0; t < 10 && (g.arriving() || g.cine.active); t += 0.25) g.advance(0.25);
    const out = [];
    g.posts.near(at[0], at[1], R, o => out.push(`${o.kind || '?'} r ${(+o.r).toFixed(2)} at ${o.x.toFixed(1)},${o.y.toFixed(1)}${g.nav.carriageway && g.nav.carriageway(o.x, o.y) ? ' IN THE CARRIAGEWAY' : ''}`));
    window.__bp = { held: new Map(), out: [] };
    return out;
  }, { at, R });
  console.log(`posts within ${R} m of ${at}: ${list.length}\n  ${list.filter(s => /CARRIAGEWAY/.test(s)).join('\n  ') || '(none in the carriageway)'}`);
  const steps = Math.round(+MIN * 60 * 30);
  for (let s = 0; s < steps; s += 600) {
    const r = await p.evaluate(({ n, at, R }) => {
      const g = window.__game, W = window.__bp, C = g.cars.C;
      for (let k = 0; k < n; k++) {
        g.frame(1 / 30);
        for (const c of C) {
          if (c.line < 0 || Math.hypot(c.x - at[0], c.y - at[1]) > R) { W.held.delete(c); continue; }
          if (c.why === 'post' && c.v < 0.3 && c.mv && c.mv.j.sig) {
            const h = W.held.get(c) || { t: 0, mv: `j${c.mv.j.id} ${c.mv.a.i}>${c.mv.e.m.i}`, at: `${c.x.toFixed(1)},${c.y.toFixed(1)}`, post: '' };
            h.t += 1 / 30;
            if (!h.post) { const fx = Math.sin(c.h), fy = Math.cos(c.h); let best = null, bd = 1e9; g.posts.near(c.x + fx * 6, c.y + fy * 6, 8, o => { const d = Math.hypot(o.x - c.x, o.y - c.y); if (d < bd) { bd = d; best = o; } }); if (best) h.post = `${best.kind} at ${best.x.toFixed(1)},${best.y.toFixed(1)} r ${(+best.r).toFixed(2)}${g.nav.carriageway && g.nav.carriageway(best.x, best.y) ? ' in the carriageway' : ''}`; }
            W.held.set(c, h);
          } else { const h = W.held.get(c); if (h && h.t > 1) W.out.push(`car ${C.indexOf(c)} ${h.mv} at ${h.at}: ${h.t.toFixed(1)} s for ${h.post}`); W.held.delete(c); }
        }
      }
      return W.out.length;
    }, { n: Math.min(600, steps - s), at, R });
    process.stdout.write(`${((s + 600) / 30).toFixed(0)} s: ${r} held by a post\n`);
  }
  const out = await p.evaluate(() => window.__bp.out);
  for (const l of out) console.log('  ' + l);
  const bad = out.filter(l => +l.match(/: ([\d.]+) s for/)[1] > 3);
  console.log(bad.length ? `FAIL cars held in a box by a post more than 3 s: ${bad.length}` : 'ok   no car held in a box by a post more than 3 s');
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
