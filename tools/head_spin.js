// A head turned to look at something is laid over the clip's pose, and must not be laid over itself. In a stopped world
// (the Stop gives the world dt = 0) the mixer writes nothing, and a turn added to the head's own rotation every frame wound
// it round and round: Aoi by the Center Gai arch, as a player on a phone walked past her in frame 2's Stop. This holds
// every NPC's rig, and the player's, with time stopped and with time running, looking at a point beside it, and fails if
// the head goes on turning or is turned further than the look allows (1.1 rad from the body).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/head_spin.js [WxH]
const { chromium } = require('playwright');
const [,, size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: w < 500, isMobile: w < 500 });
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-quality', 'low'); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__game && window.__game.npcs && window.__game.npcs.length && window.__game.npcs.some(n => n.rig && n.rig.head), null, { timeout: 900000, polling: 1000 });
  const r = await p.evaluate(() => {
    const g = window.__game, T = window.THREE, q0 = new T.Quaternion(), q1 = new T.Quaternion(), qb = new T.Quaternion(), out = [];
    const rigs = g.npcs.filter(n => n.rig && n.rig.head).map(n => ({ id: n.id, rig: n.rig })).concat(g.player && g.player.rig && g.player.rig.head ? [{ id: 'player', rig: g.player.rig }] : []);
    for (const { id, rig } of rigs) {
      const hp = new T.Vector3(); rig.root.updateMatrixWorld(true); rig.head.getWorldPosition(hp);
      const fwd = new T.Vector3(0, 0, 1).applyQuaternion(rig.root.getWorldQuaternion(qb)), side = new T.Vector3(fwd.z, 0, -fwd.x);
      const res = { id };
      // time running, the look comes on (lookW eases in with time); then time held, as the Stop holds it: the head must stay
      // where it was, frame after frame, with the look still on it
      rig.lookTarget = hp.clone().addScaledVector(fwd, 2).addScaledVector(side, 1.5); // (ahead and to one side: about 37 degrees)
      let t = 100, held = 0, run = 0;
      for (let i = 0; i < 60; i++) { rig.animate(1 / 30, 0, 'ground', t += 1 / 30); rig.head.getWorldQuaternion(q1); if (i > 40) run = Math.max(run, q0.angleTo(q1)); q0.copy(q1); }
      const q00 = q0.clone();
      for (let i = 0; i < 300; i++) { rig.animate(0, 0, 'ground', t); rig.head.getWorldQuaternion(q1); held = Math.max(held, q0.angleTo(q1)); q0.copy(q1); } // (five seconds at sixty frames)
      res.held = +held.toFixed(4); res.creep = +q00.angleTo(q1).toFixed(4); res.running = +run.toFixed(3);
      rig.lookTarget = null; out.push(res);
    }
    return out;
  });
  // a character that comes while time is held (issue 76: Yuna's, when the case is taken up at frame 4 and she loaded in
  // the Stop): it goes into the world posed as the next frame will pose it, not in its bind pose for that frame to turn
  // its head (and the rest of it) to the clip's. Every NPC's character made again as npcLoad makes it, then held frames
  const late = await p.evaluate(async () => {
    const g = window.__game, T = window.THREE, q0 = new T.Quaternion(), q1 = new T.Quaternion(), out = [];
    for (const n of g.npcs.filter(n => n.rig && n.rig.head && !n.sit).slice(0, 6)) {
      const was = n.rig; n.loading = null; n.rig = { root: was.root, pending: true, animate() {} };
      await g.npcLoad(n);
      const rig = n.rig; if (!rig.head) { out.push({ id: n.id, first: 0, held: 0 }); continue; }
      rig.root.updateMatrixWorld(true); rig.head.getWorldQuaternion(q0);
      let first = null, held = 0;
      for (let i = 0; i < 30; i++) { rig.animate(0, 0, 'ground', 100); rig.head.getWorldQuaternion(q1); const a = q0.angleTo(q1); if (first == null) first = a; else held = Math.max(held, a); q0.copy(q1); }
      out.push({ id: n.id, first: +first.toFixed(4), held: +held.toFixed(4) });
    }
    return out;
  });
  let bad = 0;
  for (const x of late) {
    const fail = x.first > 1e-3 || x.held > 1e-3;
    console.log(`${fail ? 'FAIL' : 'ok  '} ${x.id.padEnd(10)} come with time held: the first held frame turns the head ${x.first} rad, the rest ${x.held}`);
    if (fail) bad++;
  }
  for (const x of r) {
    const fail = x.held > 1e-3 || x.creep > 0.01 || x.running > 0.35; // (a clip's own head moves a little a frame; a turn laid over itself moves the look's whole angle)
    if (fail) bad++;
    console.log(`${fail ? 'FAIL' : 'ok  '} ${x.id.padEnd(10)} time held: the head turns ${x.held} rad a frame, ${x.creep} in five seconds; time running: at most ${x.running}`);
  }
  if (errors.length) console.log('page errors:', errors.slice(0, 3).join(' | '));
  console.log(bad ? `FAIL ${bad} of ${r.length} heads go on turning` : `ok   ${r.length} heads hold their look`);
  await b.close();
  process.exit(bad || errors.length ? 1 : 0);
})();
