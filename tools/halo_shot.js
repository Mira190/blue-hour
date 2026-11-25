// The halation round an afterimage seen from across the crossing (game.js storyFigure glow; issue 206: on the owner's
// iPhone, Sumiko in the first Stop stood in a cloud of dark and coloured specks from afar that went as one came near).
// Sumiko, as the first Stop stands her, her halation on, looked at from about 20 m off at a phone's size and render
// scale, with time held; a still with the halation and one without it, and the halation's texture as an image.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/halo_shot.js out_dir [WxH]       TIER=low SCALE=0.65 for the owner's iPhone (the defaults)
'use strict';
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const fs = require('fs');
const path = require('path');
const [,, out = '/tmp/halo', size = '390x844'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 600;
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +process.env.DPR || 1, isMobile: phone, hasTouch: phone });
  let errors = 0;
  p.on('pageerror', e => { errors++; console.log('pageerror:', String(e).slice(0, 300)); });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  fs.mkdirSync(out, { recursive: true });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.storyFigure', null, { timeout: 900000, polling: 500 });
  await startPlay(p, { asIs: true });
  const story = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cities', 'shibuya', 'city.json'), 'utf8')).game.story.episodes[0];
  const a = story.frames[0].afterimage, EYE = [376.0, -998.0];
  await p.evaluate(c => Promise.resolve(window.__game.peopleLib.require(c)), a.character);
  await p.evaluate(([a, E, scale]) => {
    const g = window.__game;
    if (g.arriving()) g.settleArrival(); g.advance(2); if (g.cine.active) g.cine.stop();
    const c = g.clock; g.setClock(c.y, 10, 10, 17 * 60 + 40); g.advance(0.2);
    g.hold(true); g.clock.scale = 0; if (g.weather) g.weather.set('clear', { now: true });
    if (g.governor && scale) { g.governor.auto = false; g.governor.scale = scale; }
    const f = g.storyFigure(a, a.at.concat([g.nav.terrain(a.at[0], a.at[1])]));
    Object.assign(g.player, { x: E[0], y: E[1], z: g.nav.terrain(E[0], E[1]) }); g.player.rig.root.visible = false;
    f.face(E[0], E[1]); f.glow(true);
    for (let i = 0; i < 150; i++) f.animate(1 / 30); // (five seconds: the halation up to what this distance gives it)
    window.__halo = f;
    const cam = g.camera, z = g.player.z; cam.position.set(E[0], z + 1.6, -E[1]); cam.lookAt(a.at[0], z + 1.2, -a.at[1]); cam.fov = 50; cam.updateProjectionMatrix();
  }, [a, EYE, +(process.env.SCALE || (phone ? 0.65 : 0))]);
  const settle = () => p.evaluate(() => new Promise(r => { let n = 20; const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); }));
  await settle();
  const info = await p.evaluate(() => {
    const f = window.__halo, s = window.__game.world.children.find(o => o.isSprite && o.material.map && o.scale.x === 2.4 && o.scale.y === 4.2);
    const img = s.material.map.image; let d, W = img.width, H = img.height;
    if (img.data) d = img.data; else { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(img, 0, 0); d = x.getImageData(0, 0, W, H).data; }
    let maxA = 0, offWhite = 0; const A = new Array(W * H);
    for (let i = 0; i < W * H; i++) { A[i] = d[i * 4 + 3]; maxA = Math.max(maxA, A[i]); if (A[i] > 8 && (d[i * 4] < 250 || d[i * 4 + 1] < 250 || d[i * 4 + 2] < 250)) offWhite++; }
    // a texel whose alpha is far from its neighbours' mean: a speck in what should be a smooth gradient
    let specks = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const m = (A[(y - 1) * W + x] + A[(y + 1) * W + x] + A[y * W + x - 1] + A[y * W + x + 1]) / 4; if (Math.abs(A[y * W + x] - m) > 6) specks++; }
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), id = x.createImageData(W, H);
    for (let i = 0; i < W * H; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = A[i]; id.data[i * 4 + 3] = 255; }
    x.putImageData(id, 0, 0);
    return { opacity: +f.haloNow().toFixed(3), size: `${W}x${H}`, kind: img.data ? 'data' : 'canvas', maxA, offWhite, specks, png: c.toDataURL() };
  });
  fs.writeFileSync(path.join(out, 'halo-texture.png'), Buffer.from(info.png.split(',')[1], 'base64'));
  await p.screenshot({ path: path.join(out, 'halo-on.png') });
  await p.evaluate(() => { window.__halo.glow(false); for (let i = 0; i < 150; i++) window.__halo.animate(1 / 30); });
  await settle();
  await p.screenshot({ path: path.join(out, 'halo-off.png') });
  delete info.png;
  console.log(`Sumiko's halation from 20 m: ${JSON.stringify(info)}; stills in ${out}`);
  await b.close();
  if (errors) process.exit(1);
})();
