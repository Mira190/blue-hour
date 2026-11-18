// What each light puts on the picture at one hour, from one camera: the map without its story (?walk=1), the clock
// pinned, the weather clear, and a still taken with everything lit and then with each light taken away in turn
// (pinned at nothing, whatever the frame sets it to). Prints, for the middle of each still, its mean luminance, its
// median, its 95th percentile and the share of pixels with a channel at the top (clipped), so that a picture that
// is too bright can be traced to what makes it so.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/light_split.js out_dir [WxH]
// AT=2026-10-10T17:38 (the hour, the map's own time); EYE=x,y,dz;x,y,dz;fov: the camera and what it looks at (the map's
// metres, dz over the ground there), held as a film's shot is (game.js cine), with the world held still after SETTLE
// seconds so that every still is of the same moment; ONLY=env,sky,... picks some of the lights below.
const { chromium } = require('playwright');
const fs = require('fs');
const { startPlay } = require('./start_play');
const [,, out = '/tmp/light-split', size = '1440x900'] = process.argv;
// each light, as the page has it: [what is pinned at 0, and on what]
const LIGHTS = {
  env: 'the sky as the materials reflect it and are lit by it (the environment map)',
  sky: 'the hemisphere light (the sky\'s and the ground\'s)',
  sun: 'the sun (or the moon) as a light',
  street: 'the street lights\' pools on the ground and the walls (night.js)',
  screens: 'the screens\' light on the ground (night.js uGlowOn)',
  bake: 'the hero level\'s baked night light',
  fill: 'the night fill round the player (game.js nightFill)',
  card: 'the light cards over the squares after dark (game.look.fill: neon.js cards)',
  neon: 'the screens\' area lights (neon.js lights)',
};
// CARD=0.4,0.6: the first light card's strength (its k) at each of these too, a still for each
(async () => {
  const [w, h] = size.split('x').map(Number);
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, opts) { return get.call(this, type, /webgl/.test(type) ? Object.assign({}, opts, { preserveDrawingBuffer: true }) : opts); }; });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await startPlay(p, { timeout: 900000, asIs: true });
  await p.waitForTimeout(1500);
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d?):(\d\d)$/.exec(process.env.AT || '2026-10-10T17:38');
  const [eye, look, fov] = (process.env.EYE || '371,-1012,9;361,-984,0;55').split(';').map(q => q.split(',').map(Number));
  const settle = +(process.env.SETTLE || 6);
  await p.evaluate(async ({ m, eye, look, fov, settle }) => {
    const g = window.__game, THREE = window.THREE;
    for (const id of ['g-title', 'g-menu', 'g-bigmap', 'g-pass']) { const el = document.getElementById(id); if (el) el.hidden = true; }
    if (g.cine.active) g.cine.skip();
    if (g.settleArrival) try { g.settleArrival(); } catch (e) { /* no arrival */ }
    g.clock.frozen = true; g.setClock(+m[1], +m[2], +m[3], +m[4] * 60 + +m[5]);
    if (g.weather && g.weather.set) g.weather.set('clear', { now: true });
    const gz = (x, y) => { const f = g.nav.floorAt(x, y, g.nav.terrain(x, y) + 0.5); return f ? f.z : Math.max(0, g.nav.terrain(x, y)); };
    const W = (x, y, z) => new THREE.Vector3(x, z, -y);
    const pose = { pos: W(eye[0], eye[1], gz(eye[0], eye[1]) + eye[2]), look: W(look[0], look[1], gz(look[0], look[1]) + look[2]) };
    const cam = g.camera, upm = cam.updateProjectionMatrix.bind(cam); cam.updateProjectionMatrix = () => { cam.fov = fov[0]; upm(); };
    g.player.x = eye[0]; g.player.y = eye[1]; if (g.player.rig) g.player.rig.root.visible = false;
    g.cine.stop(); g.cine.play(() => pose, 1e9, { label: 'film' });
    g.advance(settle);
    if (g.hero && g.hero()) for (let i = 0; i < 1200; i++) { await new Promise(r => requestAnimationFrame(r)); if (i > 3 && !g.hero().state().some(q => q.state === 'loading')) break; }
    g.hold(true); // (the world held: the crowd and the cars where they are, for every still)
  }, { m, eye, look, fov, settle });
  const stat = () => p.evaluate(() => { const g = window.__game, A = g.atmos, L = A && A.lens ? A.lens.uniforms : null; return { sun: g.Wd.lastSun ? +g.Wd.lastSun.sp.altitude.toFixed(2) : null, exposure: L ? +L.uExposure.value.toFixed(3) : null, hemi: +g.Wd.hemi.intensity.toFixed(3), env: !!g.Wd.world.environment }; });
  const shot = async name => { const png = await p.evaluate(() => new Promise(res => { let n = 4; const f = () => (--n > 0 ? requestAnimationFrame(f) : res(document.getElementById('game-gl').toDataURL('image/png'))); requestAnimationFrame(f); })); fs.writeFileSync(`${out}/${name}.png`, Buffer.from(png.split(',')[1], 'base64')); };
  console.log('the light now:', JSON.stringify(await stat()));
  await shot('all');
  const only = process.env.ONLY ? process.env.ONLY.split(',') : Object.keys(LIGHTS);
  for (const k of only.concat(only.length > 1 ? ['everything'] : [])) {
    await p.evaluate(k => {
      const g = window.__game, H = g.hero && g.hero(), W = g.Wd, NU = W.nightU || {};
      const pins = { env: [[W.world, 'environment', null]], sky: [[W.hemi, 'intensity', 0]], sun: [[W.sunLight, 'intensity', 0]], street: [[NU.uNightOn, 'value', 0]], screens: [[NU.uGlowOn, 'value', 0]],
        bake: [[H && H.light && H.light.bake, 'value', 0]], fill: [[g.nightFill, 'intensity', 0]],
        card: ((g.neon && g.neon.cards) || []).map(L => [L, 'intensity', 0]), neon: ((g.neon && g.neon.lights) || []).map(L => [L, 'intensity', 0]) };
      const list = k === 'everything' ? Object.values(pins).flat() : pins[k];
      window.__pinned = [];
      for (const [o, key, v] of list) { if (!o) continue; const was = o[key]; Object.defineProperty(o, key, { get: () => v, set: () => {}, configurable: true }); window.__pinned.push([o, key, was]); }
    }, k);
    await shot(`without-${k}`);
    await p.evaluate(() => { for (const [o, key, was] of window.__pinned) { delete o[key]; o[key] = was; } });
  }
  for (const k of (process.env.CARD || '').split(',').filter(Boolean).map(Number)) {
    const was = await p.evaluate(k => { const C = window.__game.neon.cards[0], w = C.userData.k; C.userData.k = k; return w; }, k);
    await shot(`card-${k}`);
    await p.evaluate(w => { window.__game.neon.cards[0].userData.k = w; }, was);
  }
  await shot('all-again'); // (the same as the first: the noise between two stills of one moment)
  await b.close();
  // the numbers, from the stills
  const { execFileSync } = require('child_process');
  console.log(execFileSync('python3', ['-c', `
import sys, glob, os
from PIL import Image
import numpy as np
for f in sorted(glob.glob(os.path.join(sys.argv[1], '*.png')), key=os.path.getmtime):
    a = np.asarray(Image.open(f).convert('RGB')).astype(float) / 255
    y = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    g = y[int(y.shape[0] * .55):]  # (the lower part of the frame: the ground)
    print('%-22s mean %.3f  median %.3f  p95 %.3f  clipped %5.1f%%   ground mean %.3f  clipped %5.1f%%' % (os.path.basename(f)[:-4], y.mean(), np.median(y), np.percentile(y, 95), (a.max(-1) > 0.97).mean() * 100, g.mean(), (a[int(a.shape[0] * .55):].max(-1) > 0.97).mean() * 100))
`, out]).toString());
})();
