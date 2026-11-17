// Walk up to Hachiko Square's round planters on foot from eight sides, and print where the walker stops and what is
// solid round them: the stainless rail round each planter is a fence, not something stepped over.
//   xvfb-run -a node tools/planter_probe.js
const { chromium } = require('playwright');
const PL = [[381.0, -1035.5], [383.6, -1049.2]], RAIL = 1.35 + 0.34;
(async () => {
  const b = await chromium.launch(process.env.DISPLAY ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] } : {});
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.nav && window.__game.player', null, { timeout: 600000 });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(([PL, RAIL]) => {
    const g = window.__game, pl = g.player, n = g.nav, out = [];
    let bad = 0;
    for (const c of PL) for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, x0 = c[0] + Math.cos(a) * 5, y0 = c[1] + Math.sin(a) * 5, f = n.floorAt(x0, y0, n.terrain(x0, y0) + 0.5);
      Object.assign(pl, { x: x0, y: y0, z: f ? f.z : n.terrain(x0, y0), ground: true, vz: 0, speed: 0 });
      let min = 9;
      for (let i = 0; i < 120; i++) { pl.h = g.cam.yaw = Math.atan2(c[0] - pl.x, c[1] - pl.y); g.advance(0.05, ['KeyW']); min = Math.min(min, Math.hypot(pl.x - c[0], pl.y - c[1])); }
      const inside = min < RAIL;
      if (inside) bad++;
      out.push(`planter ${c} from ${(k * 45)}°: nearest ${min.toFixed(2)} m from its middle, z ${pl.z.toFixed(2)}${inside ? '  INSIDE THE RAIL' : ''}`);
    }
    out.push(`${bad} of ${PL.length * 8} walks got inside the rail`);
    return out;
  }, [PL, RAIL]);
  console.log(r.join('\n'));
  await b.close();
  process.exit(/ 0 of/.test(r[r.length - 1]) ? 0 : 1);
})();
