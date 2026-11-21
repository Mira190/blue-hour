// Walk off SHIBUYA SKY's roof, as a player might try: from the middle of the deck towards its edge in 36 directions,
// running (and walking) into the glass round it for four seconds each, and see whether anyone gets through it or down
// off the deck (a walker below the deck's height, or past the tower's own outline). Frame 4's picture is taken at the
// east glass, the one asked about stands there, and a walker once stood in the glass there and went down into the tower.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/roof_edge_walk.js [out_dir]
const { chromium } = require('playwright');
const fs = require('fs');
const { startPlay } = require('./start_play');
const [,, out = '/tmp/roof-edge'] = process.argv;
const DECK = 241.8, MID = [541, -1124]; // (on the open deck east of the compass and its pad, which stand 2 m higher)
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  const logs = [];
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); });
  await startPlay(p);
  await p.evaluate(() => { const g = window.__game; g.advance(1); if (g.cine && g.cine.active && g.cine.skip) g.cine.skip(); g.advance(3); });
  const res = await p.evaluate(([MID, DECK]) => {
    const g = window.__game, pl = g.player, nav = g.nav, out = [];
    nav.prefetch(MID[0], MID[1], 64, Infinity);
    for (let i = 0; i < 36; i++) for (const walk of [false, true, 'jump']) {
      const a = i * Math.PI / 18;
      [pl.x, pl.y, pl.z] = [MID[0], MID[1], DECK]; pl.mode = 'foot'; pl.ground = true; pl.vz = 0; pl.walking = walk === true; pl.floor = null;
      pl.h = a; g.cam.yaw = a;
      let far = 0, low = DECK, where = [+pl.x.toFixed(2), +pl.y.toFixed(2), +pl.z.toFixed(2)];
      for (let t = 0; t < (walk === true ? 30 : 8); t += 0.25) {
        g.cam.yaw = a; g.advance(0.25, walk === 'jump' && Math.round(t * 4) % 6 === 5 ? ['KeyW', 'Space'] : ['KeyW']); // (and running at it, jumping every second and a half)
        const d = Math.hypot(pl.x - MID[0], pl.y - MID[1]);
        if (d > far) { far = d; where = [+pl.x.toFixed(2), +pl.y.toFixed(2), +pl.z.toFixed(2)]; }
        low = Math.min(low, pl.z);
      }
      out.push({ deg: i * 10, walk, far: +far.toFixed(2), low: +low.toFixed(2), where });
    }
    return out;
  }, [MID, DECK]);
  // the tower's outline under the deck (buildings.json, solid 40866: the deck stands on it), for how far out each got
  const B = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'web', 'data', 'shibuya', 'buildings.json'), 'utf8'));
  const s = B.s.find(q => q[4].length === 18 && Math.abs(q[4][0] / 10 - 533.2) < 0.2);
  const ring = []; for (let j = 0; j < s[4].length; j += 2) ring.push([s[4][j] / 10, s[4][j + 1] / 10]);
  const inside = (x, y) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const edgeDist = (x, y) => { let best = Infinity; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [ax, ay] = ring[j], [bx, by] = ring[i], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)); best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy)); } return best; };
  let bad = 0;
  for (const r of res) {
    const [x, y] = r.where, inn = inside(x, y), e = edgeDist(x, y), fell = r.low < DECK - 0.5, out_ = !inn; // (the glass stands half a metre past the outline here: the middle of a body may come to the outline, never past it)
    if (fell || out_) bad++;
    console.log(`${fell || out_ ? 'FAIL' : 'ok  '} ${String(r.deg).padStart(3)} degrees${r.walk === 'jump' ? ', running and jumping' : r.walk ? ', walking' : ', running'}: stopped ${inn ? `${e.toFixed(2)} m inside` : `${e.toFixed(2)} m OUTSIDE`} the tower's edge at ${r.where}${fell ? `, down to ${r.low} m` : ''}`);
  }
  console.log(`${bad} of ${res.length} walks got into the glass or off the deck`);
  console.log(logs.join('\n'));
  await b.close();
  process.exit(bad || logs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
