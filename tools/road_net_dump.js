// The road network as the game drives it, written out for the audit (pipeline/road_plan.py, tools/road_map.py):
// every piece of the game's road graph after its cuts at walls (game.js cutAtWalls), with what the game has found of
// it: the piece of game.json it came from, its class, its one-way, where it starts or ends at a wall, whether the
// traffic keeps off it (route.js: a car does not fit along it), the widest vehicle it has room for, and its lanes.
//   xvfb-run -a node tools/road_net_dump.js shibuya out.json
const { chromium } = require('playwright');
const fs = require('fs');
const [,, city = 'shibuya', out = 'road_net.json'] = process.argv;
(async () => {
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 300)));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-${city}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 300000 });
  await p.waitForFunction('window.__game.ways.ready', null, { timeout: 300000 }).catch(() => {});
  const r = await p.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    const g = window.__game, net = g.roadNet, J = g.junctions, av = net.avoid, r1 = v => Math.round(v * 10) / 10;
    const lines = net.L.map((l, i) => ({ i0: l.i0, c: l.c, ow: l.ow, wall: l.wall, len: r1(l.len), avoid: av && av[i] ? 1 : 0, fit: net.fit ? r1(net.fit[i]) : 9,
      lanes: J.lanesOf ? J.lanesOf(l) : 1, inner: J.inner && J.inner(i) ? 1 : 0, deck: l.deck ? (Array.from(l.deck).some(Boolean) ? 1 : 0) : 0, tb: l.tb ? 1 : 0,
      p: Array.from(l.pts, r1) }));
    return { lines, keep: g.KEEP, raw: g.G.paths.road.length };
  });
  fs.writeFileSync(out, JSON.stringify(r));
  console.log(`${city}: ${r.lines.length} pieces of the game's road graph from ${r.raw} of game.json; ${r.lines.filter(l => l.avoid).length} kept off, ${r.lines.filter(l => l.wall).length} at a wall`);
  await b.close();
})();
