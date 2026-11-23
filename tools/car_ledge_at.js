// What your car's rules find under its footprint at a pose (issue 173): at each of the nine points cars.js ledgesUnder
// reads, the car's floor (no more than a kerb over its wheels), the floor a walker would step up to, every deck there
// and the ground drawn.
//   xvfb-run -a node tools/car_ledge_at.js x,y,z,heading [x,y,z,heading ...]
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
(async () => {
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  await p.addInitScript(() => { try { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 600000 });
  await startPlay(p);
  await p.evaluate(() => { const g = window.__game; if (g.cine && g.cine.active) g.cine.skip(); g.spawn(); g.advance(0.5); });
  await p.waitForFunction(() => window.__game.myCar && window.__game.myCar(), null, { timeout: 180000 });
  await p.evaluate(() => window.__game.hold(true));
  const r = await p.evaluate(poses => {
    const g = window.__game, nav = g.nav, C = g.myCar().C, OC = window.OECars;
    if (nav.layAll) nav.layAll();
    return poses.map(([x, y, z, h]) => {
      const fx = Math.sin(h), fy = Math.cos(h), rows = [];
      for (const u of [C.half - 0.1, 0, 0.1 - C.half]) for (const w of [C.hw - 0.05, 0, 0.05 - C.hw]) {
        const px = x + fx * u - fy * w, py = y + fy * u + fx * w, d = [];
        nav.decksAt(px, py, (hh, dk) => d.push(+hh.toFixed(2) + (dk.walk ? '' : 'm')));
        const lo = nav.floorAt(px, py, z - (nav.STEP - OC.CAR_STEP)), hi = nav.floorAt(px, py, z + 0.1);
        rows.push(`u ${u.toFixed(1)} w ${w.toFixed(1)}: car ${lo ? lo.kind + ' ' + lo.z.toFixed(2) : '-'} walker ${hi ? hi.kind + ' ' + hi.z.toFixed(2) : '-'} decks ${d.join('/') || '-'} ground ${nav.terrain(px, py).toFixed(2)}`);
      }
      return { pose: [x, y, z, h], half: C.half, hw: C.hw, ledges: OC.ledgesUnder(nav, { x, y, z, h }, C.half, C.hw), rows };
    });
  }, process.argv.slice(2).map(a => a.split(',').map(Number)));
  for (const q of r) { console.log(JSON.stringify(q.pose), 'half', q.half, 'hw', q.hw, 'ledges', q.ledges); for (const l of q.rows) console.log('  ' + l); }
  await b.close();
})();
