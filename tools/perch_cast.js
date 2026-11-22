// Scanned cast members stood in the crowd's change of clothes beside Hachiko's wall, seen from the walk's seat there
// (perch.js: the seat's camera over your shoulder, game.json hero[].perches cam), with the crowd and the traffic running: to look at the
// people's skin masks (blender/build_people.py skin_mask) where the owner saw them, at the hour, beside the cast as
// the crowd draws it. Each figure stands a few metres out from the seat, turned to the lens, in DRESS[k].
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/perch_cast.js out_dir [WxH] [HH:MM[,HH:MM...]] [name:k,name:k...]
// (390x844: a phone, its tier and memory path as tools/game_shot.js LEAN=1 takes them; PORT=n another server, to
// take the same still of another checkout)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { startPlay } = require('./start_play');
const [,, out = 'perch-cast', size = '1440x900', time = '17:39',
  list = 'R_Female_Adult_05_f011:4,R_Male_Adult_02_m017:2,R_Male_Adult_05_m008:6,R_Male_Adult_20_m008:4'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext(Object.assign({ viewport: { width: w, height: h }, deviceScaleFactor: 1 }, phone ? { isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' } : {}));
  const p = await ctx.newPage();
  const logs = [];
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
  p.on('console', m => { if (m.text().startsWith('[perch]')) console.log(m.text()); });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, phone ? 'low' : 'high');
  await p.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, opts) { return get.call(this, type, /webgl/.test(type) ? Object.assign({}, opts, { preserveDrawingBuffer: true }) : opts); };
  });
  fs.mkdirSync(out, { recursive: true });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.perch', null, { timeout: 600000 });
  await p.waitForFunction(() => { const l = document.getElementById('g-loader'); return !l || l.hidden; }, null, { timeout: 900000, polling: 500 });
  const cast = list.split(',').map(s => { const [name, k] = s.split(':'); return { name, k: +k }; });
  // past the title, as tools/game_shot.js goes (tools/start_play.js)
  await p.waitForFunction(() => !document.getElementById('g-title').hidden, null, { timeout: 300000 }).catch(() => {});
  await startPlay(p);
  for (let i = 0; i < 60 && !(await p.evaluate(() => { const t = document.getElementById('g-title'); return !t || t.hidden; })); i++) {
    await p.evaluate(() => { const b = document.getElementById('gt-play'); if (b) b.click(); });
    await p.waitForTimeout(1000);
  }
  await p.evaluate(async () => {
    const g = window.__game;
    for (let t = 0; t < 10 && (!g.arriving || !g.arriving()); t += 0.25) await new Promise(r => setTimeout(r, 250));
    for (let t = 0; t < 10 && g.arriving && g.arriving(); t += 0.25) { g.settleArrival(); g.advance(0.25); await new Promise(r => requestAnimationFrame(r)); }
    const O = window.OEOnboard, t = O && O.current && O.current(); if (t) t.skip();
    if (g.cine && g.cine.active) g.cine.skip();
  });
  console.log('playing');
  const r = await p.evaluate(async ([time, cast]) => {
    const g = window.__game;
    if (g.weather) g.weather.set('clear', { now: true });
    // the seat's own camera (game.json hero[].perches: cam back, side and up from the seat, looking at its look),
    // held in photo mode: ?walk=1, the builder's map, offers no seat, so the tripod perch.js stands there is taken
    const s = g.perch.list[0], C = s.cam, rx = s.face[1], ry = -s.face[0]; // (right of the way the seat faces)
    g.player.x = s.at[0]; g.player.y = s.at[1];
    { const f = g.nav.floorAt(s.at[0], s.at[1], g.nav.terrain(s.at[0], s.at[1]) + 1.5); if (f) g.player.z = f.z; }
    for (let i = 0; i < 4; i++) g.advance(0.05);
    const sz = s.z != null ? s.z : g.player.z, ex = s.at[0] - s.face[0] * C.back + rx * C.side, ey = s.at[1] - s.face[1] * C.back + ry * C.side, ez = sz + C.up;
    const frame = () => new Promise(res => requestAnimationFrame(res));
    // every one of the cast loaded and warmed first (lib.tpl: the game shows a character only once it is)
    const lib0 = g.peopleLib, t0 = performance.now();
    while (cast.some(q => !lib0.tpl[q.name]) && performance.now() - t0 < 480000) { for (const q of cast) lib0.require(q.name); await frame(); }
    // the cast, out from the seat toward what it looks at, in a loose row across the view, each turned to the lens
    const lib = g.peopleLib, cp = { x: ex, z: -ey }, made = [];
    const fx = s.look[0] - s.at[0], fy = s.look[1] - s.at[1], fl = Math.hypot(fx, fy), ux = fx / fl, uy = fy / fl;
    for (let i = 0; i < cast.length; i++) {
      const { name, k } = cast[i];
      if (!lib.tpl[name]) { console.log(`[perch] ${name} never ready`); continue; }
      const rig = OEPeople.person(lib, { character: name, scale: 1 });
      if (rig.dress) rig.dress(k);
      const d = 3.2 + (i % 2) * 1.6, lat = (i - (cast.length - 1) / 2) * 1.1;
      const x = s.at[0] + ux * d + uy * lat, y = s.at[1] + uy * d - ux * lat;
      const f = g.nav.floorAt(x, y, g.nav.terrain(x, y) + 1), z = f ? f.z : g.nav.terrain(x, y);
      rig.root.position.set(x, z, -y);
      rig.root.rotation.y = Math.atan2(cp.x - x, cp.z + y);
      for (let j = 0; j < 30; j++) rig.animate(0.6 / 30, 0, 'ground', j * 0.02);
      g.Wd.world.add(rig.root);
      made.push(name);
    }
    g.photoMode(true); // (set last: the minutes the cast takes to load move the camera on)
    const P = g.photo, lz = sz + 1.2, dx = ex - s.look[0], dy = ey - s.look[1], hh2 = ez - lz, dd = Math.hypot(dx, dy);
    P.focus.set(s.look[0], lz, -s.look[1]); P.anchor.copy(P.focus);
    Object.assign(P, { az: Math.atan2(dx, dy), pitch: Math.atan2(hh2, dd), dist: Math.hypot(dd, hh2) });
    P.fstop = 16; g.player.rig.root.visible = false;
    g.advance(0.1);
    for (let i = 0; i < 4; i++) await frame();
    const cpos = g.camera.position;
    return { made, cam: [+cpos.x.toFixed(1), +(-cpos.z).toFixed(1), +cpos.y.toFixed(1)], eye: [+ex.toFixed(1), +ey.toFixed(1), +ez.toFixed(1)] };
  }, [time, cast]);
  if (r.err) { console.log(r.err); process.exitCode = 1; }
  console.log(JSON.stringify(r));
  for (const at of time.split(',')) { // (each hour asked, on the one page)
    await p.evaluate(at => { const g = window.__game, c = g.clock, [hh, mm] = at.split(':').map(Number); g.setClock(c.y, c.m, c.d, hh * 60 + mm); g.advance(0.1); }, at);
    for (let t = 0; t < 6; t++) await p.evaluate(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))));
    const png = await p.evaluate(() => document.getElementById('game-gl').toDataURL('image/png'));
    const file = path.join(out, `perch_${w}x${h}_${at.replace(':', '')}.png`);
    fs.writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'));
    console.log(file);
  }
  for (const l of logs) console.log(l);
  await b.close();
})();
