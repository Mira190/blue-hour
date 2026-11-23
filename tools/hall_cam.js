// Where the chase camera stands in SKY GATE's hall when the view comes round to the lift (issue 181: walk1's still of
// it was one flat tone now and then, the one you play not in it). Puts you 1.2 m from the lift as tools/walk_play.js
// does, turns the view to the lift as it does, and prints for each of N tries what the camera's rig did (cam.trace),
// where the lens and your head are, what the probe meets between them (nav.clearFraction) and what the lens sees
// straight ahead (the nearest thing the scene's ray meets), with a still of each.
//   xvfb-run -a node tools/hall_cam.js out_dir [tries]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [,, out = '/tmp/hall_cam', tries = '4'] = process.argv;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', '1'); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 400000 });
  // (the walk set out at once, as its menu's Set out does, without its film: the crane down to your shoulder)
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return t && !t.hidden; }, null, { timeout: 600000, polling: 250 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return t && getComputedStyle(t).opacity > 0.9; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(2500); await p.keyboard.press('Space'); await p.waitForTimeout(1600); // (the title's press, then its menu)
  await p.waitForSelector('#gt-walk-go', { state: 'visible', timeout: 600000 }); await p.waitForTimeout(3000); // (the story loaded behind the title: the walk dresses from it)
  await p.evaluate(() => window.__game.walkStart({ t: '21:00', w: 'rain' }));
  await p.waitForFunction(() => window.__game.player && window.__game.player.rig, null, { timeout: 400000 });
  await p.waitForTimeout(8000); await p.keyboard.press('Space'); await p.waitForTimeout(4000); // (a key eases the crane down to you at once)
  for (let k = 0; k < +tries; k++) {
    const r = await p.evaluate(async (k) => {
      const g = window.__game, l = g.G.lifts.find(q => q.id === 'sky-gate'), s = l.stops[0];
      const [ax, ay, az] = s.at, [dx, dy] = s.door || s.at, n = Math.hypot(ax - dx, ay - dy) || 1;
      g.player.x = ax - (ax - dx) / n * 1.2; g.player.y = ay - (ay - dy) / n * 1.2; g.player.z = az; g.player.h = Math.atan2(ax - dx, ay - dy) + (k % 2 ? 0.6 : -0.6) * Math.floor(k / 2); g.player.speed = 0;
      const H = g.hero && g.hero();
      for (let i = 0; i < 480; i++) { const L = H && H.levels.find(q => q.h.id === 'skylobby'); if (L && L.state === 'ready' && L.h.shown) break; await new Promise(res => setTimeout(res, 250)); }
      const want = Math.atan2(s.at[0] - s.door[0], s.at[1] - s.door[1]);
      // (k = 0, 1: the view held to the south, over the hall's wall against the tower, as a hand holds it: the lens is to
      // stand in front of the wall. k >= 2: the view comes round to the lift, as walk_play.js has it)
      if (k < 2) { for (let i = 0; i < 40; i++) { g.cam.yaw = -0.58 + 0.25 * k; g.cam.yawTo = null; g.cam.lastInput = g.t(); g.frame(0.05); } }
      else { let i = 0; for (; i < 120; i++) { g.frame(0.05); if (g.cam.yawTo == null && Math.abs(Math.atan2(Math.sin(g.cam.yaw - want), Math.cos(g.cam.yaw - want))) < 0.1) break; } }
      for (let j = 0; j < 9; j++) { if (k < 2) { g.cam.yaw = -0.58 + 0.25 * k; g.cam.lastInput = g.t(); } g.frame(0.05); }
      g.cam.trace = {}; g.frame(0.05);
      const T = THREE, cam = g.camera, head = new T.Vector3(g.player.x, g.player.z + 1.6, -g.player.y);
      const rc = new T.Raycaster(); rc.setFromCamera(new T.Vector2(0, 0), cam); rc.far = 30;
      const hits = rc.intersectObjects(((typeof g.scene === 'function' ? g.scene() : g.scene) || {}).children || [], true).filter(h => h.object.visible).slice(0, 3).map(h => ({ d: +h.distance.toFixed(2), name: h.object.name || h.object.parent && h.object.parent.name, mat: [].concat(h.object.material || []).map(m => m && m.name).join() }));
      return { k, yaw: +g.cam.yaw.toFixed(2), want: +want.toFixed(2), lift: +g.cam.lift.toFixed(2), pull: +g.cam.pull.toFixed(2), dist: +g.cam.dist.toFixed(2), lens: cam.position.toArray().map(v => +v.toFixed(2)), head: head.toArray().map(v => +v.toFixed(2)), lensToHead: +cam.position.distanceTo(head).toFixed(2), probe: +g.nav.clearFraction(head, cam.position).toFixed(3), wallsCrossed: (() => { const pre = g.cam.trace.pre, P = (g.G.hero.find(h => h.id === 'skylobby') || {}).posts || [], ax = head.x, ay = -head.z, bx = pre[0], by = -pre[2], L = Math.hypot(bx - ax, by - ay); return P.filter(([x, y]) => { const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (L * L))); return Math.hypot(ax + (bx - ax) * t - x, ay + (by - ay) * t - y) < 0.2; }).length; })(), trace: g.cam.trace, ahead: hits };
    }, k);
    console.log(JSON.stringify(r));
    await p.screenshot({ path: path.join(out, `hall-${k}.png`) });
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(2); });
