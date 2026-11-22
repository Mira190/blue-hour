// The road network as the game drives it, written out for the audit (pipeline/road_plan.py, tools/road_map.py):
// every piece of the game's road graph after its cuts at walls (game.js cutAtWalls), with what the game has found of
// it: the piece of game.json it came from, its class, its one-way, where it starts or ends at a wall, whether the
// traffic keeps off it (route.js: a car does not fit along it), the widest vehicle it has room for, and its lanes.
//   xvfb-run -a node tools/road_net_dump.js shibuya out.json [cities/shibuya/road_measured.json]
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
    // the measure for the plan: the pieces of game.json the game cuts at a wall (one of its parts starts or ends at
    // one, or parts of it are gone), and those it keeps off (no car fits along them), by their ends in decimetres
    const raw = g.G.paths.road, kept = new Float64Array(raw.length), cutAt = new Uint8Array(raw.length), off = new Uint8Array(raw.length);
    net.L.forEach((l, i) => { kept[l.i0] += l.len; if (l.wall) cutAt[l.i0] = 1; if (av && av[i]) off[l.i0] = 1; });
    const ends = o => [o.p[0], o.p[1], o.p[o.p.length - 3], o.p[o.p.length - 2]], lenOf = o => { let s = 0; for (let k = 3; k < o.p.length; k += 3) s += Math.hypot(o.p[k] - o.p[k - 3], o.p[k + 1] - o.p[k - 2]) / 10; return s; };
    const measured = { cut: [], off: [] };
    // (not a piece on a deck, an expressway on its viaduct: a tower's corner mapped over its parapet clips it for a metre
    // or two, the game keeps the rest, and closing 400 m of expressway for that would be the larger fault)
    raw.forEach((o, i) => { if (o.x || (o.d && Array.prototype.some.call(o.d, Boolean)) || o.c === 'motorway') return; const len = lenOf(o); if (len <= 4) return; if (cutAt[i] || kept[i] < len - 3) measured.cut.push(ends(o)); else if (off[i]) measured.off.push(ends(o)); });
    return { lines, keep: g.KEEP, raw: raw.length, measured };
  });
  if (process.argv[4]) { // (kept with the city: pipeline/road_plan.py reads it)
    const was = fs.existsSync(process.argv[4]) ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) : { cut: [], off: [] };
    const key = e => e.join(','), merge = (a, b) => { const m = new Map(); for (const e of [...a, ...b]) m.set(key(e), e); return [...m.values()].sort((p, q) => p[0] - q[0] || p[1] - q[1]); };
    // (a piece already closed by the plan is not in the game's graph, so not measured again: what was measured stays)
    const m = { source: `The game's own measure of its roads against the built model (tools/road_net_dump.js, ${new Date().toISOString().slice(0, 10)}): the pieces it cuts at a wall, and those no car fits along; each by its ends in decimetres. Measured again, a piece still in the list is kept: one that has been opened is taken out by hand, or with FRESH=1.`,
      cut: process.env.FRESH ? r.measured.cut : merge(was.cut, r.measured.cut), off: process.env.FRESH ? r.measured.off : merge(was.off, r.measured.off) };
    fs.writeFileSync(process.argv[4], JSON.stringify(m, null, 0).replace(/\],\[/g, '],\n[') + '\n');
    console.log(`${city}: measured ${m.cut.length} pieces cut at a wall, ${m.off.length} no car fits along -> ${process.argv[4]}`);
  }
  fs.writeFileSync(out, JSON.stringify(r));
  console.log(`${city}: ${r.lines.length} pieces of the game's road graph from ${r.raw} of game.json; ${r.lines.filter(l => l.avoid).length} kept off, ${r.lines.filter(l => l.wall).length} at a wall`);
  await b.close();
})();
