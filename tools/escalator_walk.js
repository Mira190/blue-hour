// Walk onto each escalator (a game surface with moving_ms) from the floor before its entry, the way a player
// does: stand 2.5 m back from its comb facing along it, hold W (walking) for a moment, let go, and see whether
// the steps take you to the far end. Prints the track every second.
//   cd web && python3 -m http.server 8800 &
//   xvfb-run -a node tools/escalator_walk.js shibuya
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const [,, city = 'shibuya'] = process.argv;
(async () => {
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  await p.addInitScript(() => { try { localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  const logs = [];
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-${city}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); });
  await startPlay(p); // (the title card up, Play pressed and the game started: tools/start_play.js, #423)
  await p.evaluate(() => { const g = window.__game; g.advance(1); if (g.cine && g.cine.active && g.cine.skip) g.cine.skip(); g.advance(3); });
  const out = await p.evaluate(async () => {
    const g = window.__game, pl = g.player, nav = g.nav, res = [];
    for (const s of nav.strips.filter(q => q.moving_ms)) {
      const mu = s.moving_u || [s.us[0], s.us[s.us.length - 1]], u0 = s.us[0] - 2.5;
      const x = s.origin[0] + s.axis[0] * u0, y = s.origin[1] + s.axis[1] * u0;
      nav.prefetch(x, y, 48, Infinity);
      const f = nav.floorAt(x, y, s.zs[0] + 0.5);
      [pl.x, pl.y, pl.z] = [x, y, f ? f.z : s.zs[0]]; pl.mode = 'foot'; pl.ground = true; pl.vz = 0; pl.walking = true;
      pl.h = Math.atan2(s.axis[0], s.axis[1]); g.cam.yaw = pl.h;
      const track = [];
      const at = t => { const [u] = nav.stripUV(s, pl.x, pl.y); track.push({ t, u: +u.toFixed(2), z: +pl.z.toFixed(2), floor: pl.floor }); };
      at(0);
      for (let t = 0.5; t <= 3; t += 0.5) { g.cam.yaw = Math.atan2(s.axis[0], s.axis[1]); g.advance(0.5, ['KeyW']); at(t); }
      for (let t = 4; t <= 50; t += 1) { g.advance(1); at(t); }
      // and beside it: walked at from the same floor a body's width to either side of the steps, nobody gets in between
      // the escalator and what stands next to it (a stair's glass, the outer glass), where they stood inside its balustrade
      const sides = [];
      for (const off of [-1.05, -0.8, 0.8, 1.05]) {
        const sx = x + s.axis[1] * off, sy = y - s.axis[0] * off, f2 = nav.floorAt(sx, sy, s.zs[0] + 0.5);
        [pl.x, pl.y, pl.z] = [sx, sy, f2 ? f2.z : s.zs[0]]; pl.mode = 'foot'; pl.ground = true; pl.vz = 0; pl.walking = true;
        let worst = null;
        for (let t = 0; t < 8; t += 0.5) { pl.h = g.cam.yaw = Math.atan2(s.axis[0], s.axis[1]); g.advance(0.5, ['KeyW']); const [u, v] = nav.stripUV(s, pl.x, pl.y); if (u > 0.8 && Math.abs(v) > s.half_width + 0.05 && Math.abs(v) < 1.4 && (!worst || u > worst.u)) worst = { u: +u.toFixed(2), v: +v.toFixed(2), z: +pl.z.toFixed(2), floor: pl.floor }; }
        sides.push({ off, worst });
      }
      // and off its side: standing on the steps part of the way along and walking sideways, nobody leaves them
      for (const [key, uu] of [['KeyA', 3], ['KeyD', 3], ['KeyA', 4.5], ['KeyD', 4.5], ['KeyA', 12], ['KeyD', 12], ['KeyA', s.us[s.us.length - 1] - 3], ['KeyD', s.us[s.us.length - 1] - 3]]) {
        const sx = s.origin[0] + s.axis[0] * uu, sy = s.origin[1] + s.axis[1] * uu;
        [pl.x, pl.y, pl.z] = [sx, sy, nav.stripHeight(s, sx, sy)]; pl.mode = 'foot'; pl.ground = true; pl.vz = 0; pl.walking = true; pl.floor = s.name;
        let worst = null;
        for (let t = 0; t < 3; t += 0.25) { pl.h = g.cam.yaw = Math.atan2(s.axis[0], s.axis[1]); g.advance(0.25, [key]); const [u, v] = nav.stripUV(s, pl.x, pl.y), h = nav.stripHeight(s, pl.x - s.axis[1] * -v, pl.y + s.axis[0] * -v); if (Math.abs(v) > s.half_width + 0.05 && (!worst || Math.abs(v) > Math.abs(worst.v))) worst = { u: +u.toFixed(2), v: +v.toFixed(2), z: +pl.z.toFixed(2), floor: pl.floor }; }
        sides.push({ off: `${key} at u ${uu}`, worst });
      }
      res.push({ name: s.name, us: [s.us[0], s.us[s.us.length - 1]], mu, zs: [s.zs[0], s.zs[s.zs.length - 1]], track, sides });
    }
    return res;
  });
  let bad = 0;
  for (const r of out) {
    console.log(`${r.name}: strip u ${r.us}, moving ${r.mu}, z ${r.zs}`);
    for (const q of r.track) console.log(`  t ${q.t}  u ${q.u}  z ${q.z}  ${q.floor}`);
    const last = r.track[r.track.length - 1], carried = last.u > r.us[1] - 0.5 && Math.abs(last.z - r.zs[1]) < 0.3;
    console.log(`${carried ? 'ok  ' : 'FAIL'} ${r.name}: carried to its far end (u ${last.u}, z ${last.z})`); if (!carried) bad++;
    for (const q of r.sides) { console.log(`${q.worst ? 'FAIL' : 'ok  '} ${r.name}: ${typeof q.off === 'number' ? `walked at ${q.off} m beside the steps` : `stepped sideways, ${q.off}`}${q.worst ? `, got in beside them: ${JSON.stringify(q.worst)}` : ', kept out'}`); if (q.worst) bad++; }
  }
  console.log(logs.join('\n'));
  await b.close();
  process.exit(bad || logs.length ? 1 : 0);
})();
