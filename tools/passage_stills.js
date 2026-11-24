// Stills of the chase camera in the station's free passage (issue 208), at frame 4's hour (17:31): stood in its middle
// with the view dragged round and up (where the lens rose through the ceiling), and walking back into it from its east
// end. For a before and after, serve the two pages on two ports.
//   PORT=8800 xvfb-run -a node tools/passage_stills.js out/prefix        (PHONE=1: a phone, 390x844; else 1440x900)
const { open } = require('./cam_jumps');
const [,, out = '/tmp/passage'] = process.argv;
(async () => {
  const { b, p } = await open('shibuya', process.env.PHONE ? {} : { width: 1440, height: 900 });
  const shots = [
    { name: 'middle', at: [441.9, -1023.4], h: Math.PI / 2, yaw: Math.PI / 2 + 1.3, pitch: 0.75, walk: 0 },
    { name: 'east-end', at: [446.5, -1020.4], h: -Math.PI / 2 - 0.1, yaw: -Math.PI / 2 - 0.1, pitch: 0.6, walk: 2.5 },
  ];
  for (const s of shots) {
    const r = await p.evaluate(async s => {
      const g = window.__game, c = g.clock;
      g.setClock(c.y, c.m, c.d, 17 * 60 + 31);
      const go = () => { const [x, y] = s.at, f = g.nav.floorAt(x, y, g.nav.terrain(x, y) + 1.5); g.player.x = x; g.player.y = y; g.player.z = f ? f.z : g.nav.terrain(x, y); g.player.h = s.h; Object.assign(g.cam, { mode: 'chase', yaw: s.yaw, pitch: 0.17, distTo: 0, yawTo: null, lastInput: -10, snap: true }); };
      g.player.x = s.at[0] + 400; g.advance(0.05); go(); g.advance(1);
      for (let i = 0; i < 40 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); }
      if (g.cine.active) g.cine.skip();
      go(); g.advance(0.5);
      // (the view dragged up, as a hand does, and held there)
      for (let k = 0; k < 30; k++) { g.cam.pitch += (s.pitch - 0.17) / 30; g.cam.lastInput = g.clockT; g.advance(1 / 30); }
      for (let k = 0; k < s.walk * 30; k++) { g.cam.lastInput = g.clockT; g.advance(1 / 30, ['KeyW']); }
      g.advance(1 / 30);
      const cp = g.camera.position;
      return { cam: [+cp.x.toFixed(2), +(-cp.z).toFixed(2), +(cp.y - g.player.z).toFixed(2)], at: [+g.player.x.toFixed(1), +g.player.y.toFixed(1)] };
    }, s);
    await p.evaluate(() => new Promise(r => { const g = window.__game; g.advance(1 / 30); setTimeout(r, 300); }));
    await p.screenshot({ path: `${out}-${s.name}.png` });
    console.log(s.name, JSON.stringify(r));
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(2); });
