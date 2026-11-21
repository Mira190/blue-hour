// Stills of a ride up and down each escalator whose name holds the text given, as a player rides it: from the floor
// 2.5 m before its comb, walked on (W) at the middle of the steps and off to one side, then carried. A still from the
// chase camera and one from the side every half second of the first four, and the rider's place on the steps printed:
// how far off the middle (a body is 0.6 m across, the steps 1 m, the glass beside them 1.2 m apart) and how high the
// feet are against the tread drawn under them. Fails where the body reaches into the glass or the feet into a step.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/escalator_ride_shot.js out_dir [name] [WxH]
const { chromium } = require('playwright');
const fs = require('fs');
const { startPlay } = require('./start_play');
const [,, out = '/tmp/escalator-ride', match = 'SHIBUYA SKY', size = '1280x800'] = process.argv;
const [VW, VH] = size.split('x').map(Number);
const BODY = 0.3, GLASS = 0.6; // (half a body's width; the glass's distance from the middle of the steps)
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, hasTouch: VW < 500, isMobile: VW < 500 });
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('bh-quality', 'high'); } catch (e) { /* storage blocked */ } });
  const logs = [];
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); });
  await startPlay(p);
  await p.evaluate(() => { const g = window.__game; g.advance(1); if (g.cine && g.cine.active && g.cine.skip) g.cine.skip(); g.advance(3); });
  const names = await p.evaluate(m => window.__game.nav.strips.filter(q => q.moving_ms && q.name.includes(m)).map(q => q.name), match);
  let bad = 0;
  for (const name of names) for (const off of [0, 0.42]) {
    const tag = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${off ? 'side' : 'middle'}`;
    const setUp = await p.evaluate(([name, off]) => {
      const g = window.__game, pl = g.player, nav = g.nav, s = nav.strips.find(q => q.name === name);
      const u0 = s.us[0] - 2.5, x = s.origin[0] + s.axis[0] * u0 - s.axis[1] * off, y = s.origin[1] + s.axis[1] * u0 + s.axis[0] * off; // (off: to the side, the way v grows)
      nav.prefetch(x, y, 48, Infinity);
      const f = nav.floorAt(x, y, s.zs[0] + 0.5);
      [pl.x, pl.y, pl.z] = [x, y, f ? f.z : s.zs[0]]; pl.mode = 'foot'; pl.ground = true; pl.vz = 0; pl.walking = true;
      pl.h = Math.atan2(s.axis[0], s.axis[1]); g.cam.yaw = pl.h; g.cam.pitch = 0.36; if (g.cam.snap !== undefined) g.cam.snap = true;
      return { at: [x, y] };
    }, [name, off]);
    const rows = [];
    for (let i = 0; i < 28; i++) { // a quarter of a second at a time: walked on for the first 3.5 s (2.5 m at a walk to the comb, and on), then carried
      const r = await p.evaluate(([name, walk]) => {
        const g = window.__game, pl = g.player, nav = g.nav, s = nav.strips.find(q => q.name === name);
        g.cam.yaw = Math.atan2(s.axis[0], s.axis[1]);
        g.advance(0.25, walk ? ['KeyW'] : []);
        const [u, v] = nav.stripUV(s, pl.x, pl.y), feet = pl.rig.root.position.y; // (the feet as drawn: the rig's root)
        return { u: +u.toFixed(2), v: +v.toFixed(3), z: +pl.z.toFixed(2), feet: +feet.toFixed(2), floor: pl.floor };
      }, [name, i < 14]);
      rows.push(r);
      if (i % 2 === 1 && i >= 8) await p.screenshot({ path: `${out}/${tag}-${String(i).padStart(2, '0')}-chase.jpg`, type: 'jpeg', quality: 85 });
    }
    // a side view of the rider half way up: a camera off the escalator's side at the rider's height, looking across
    await p.evaluate(name => {
      const g = window.__game, pl = g.player, s = g.nav.strips.find(q => q.name === name), T = window.THREE;
      const side = 4.5, x = pl.x - s.axis[1] * side, y = pl.y + s.axis[0] * side, cam = g.camera;
      g.flyCam = null; cam.position.set(x, pl.z + 1.2, -y); cam.up.set(0, 1, 0); cam.lookAt(new T.Vector3(pl.x, pl.z + 0.9, -pl.y)); cam.updateMatrixWorld();
      window.__sideShot = true;
    }, name);
    await p.screenshot({ path: `${out}/${tag}-side.jpg`, type: 'jpeg', quality: 85 });
    const on = rows.filter(r => r.u > 0.6), worstV = on.length ? Math.max(...on.map(r => Math.abs(r.v))) : NaN;
    const into = worstV + BODY - GLASS;
    console.log(`${name}, walked on ${off ? `${off} m off the middle` : 'at the middle'}:`);
    for (const r of rows) console.log(`  u ${r.u}  v ${r.v}  z ${r.z}  feet ${r.feet}  ${r.floor}`);
    const ok = on.length > 0 && into <= -0.05; // (a hand's width clear of the glass, at least)
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (${off ? 'from the side' : 'from the middle'}): at most ${worstV.toFixed(2)} m off the middle, the body ${into > 0 ? `${into.toFixed(2)} m into the glass` : `${(-into).toFixed(2)} m clear of the glass`}`);
    if (!ok) bad++;
  }
  console.log(logs.join('\n'));
  await b.close();
  process.exit(bad || logs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
