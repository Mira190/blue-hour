// What each light puts on the picture at one hour, from one camera: the map without its story (?walk=1), the clock
// pinned, the weather clear, and a still taken with everything lit and then with each light taken away in turn
// (pinned at nothing, whatever the frame sets it to). Prints, for the middle of each still, its mean luminance, its
// median, its 95th percentile and the share of pixels with a channel at the top (clipped), so that a picture that
// is too bright can be traced to what makes it so.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/light_split.js out_dir [WxH]
// AT=2026-10-10T17:38 (the hour, the map's own time); EYE=x,y,dz;x,y,dz;fov: the camera and what it looks at (the map's
// metres, dz over the ground there), held as a film's shot is (game.js cine), with the world held still after SETTLE
// seconds so that every still is of the same moment; ONLY=env,sky,... picks some of the lights below (ONLY= none).
// WHO=1: what the clipped pixels are of, by material; with FAIL=0.3 the run fails on any surface that is not a light
// (a face, the ground, a wall) putting more than that share of the frame at white (docs/LOOK.md, faces and lights).
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
(async () => {
  const [w, h] = size.split('x').map(Number);
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, opts) { return get.call(this, type, /webgl/.test(type) ? Object.assign({}, opts, { preserveDrawingBuffer: true }) : opts); }; });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await startPlay(p, { timeout: 900000, asIs: true });
  await p.waitForTimeout(1500);
  // AT and EYE may each be several (AT=...T17:38,...T18:20; EYE=view|view, a view optionally named first: name=x,y,dz;x,y,dz;fov):
  // every view at every hour, the stills named <hour>-<view>-...
  const ats = (process.env.AT || '2026-10-10T17:38').split(',').map(a => /^(\d{4})-(\d\d)-(\d\d)T(\d\d?):(\d\d)$/.exec(a));
  const views = (process.env.EYE || 'crossing=371,-1012,9;361,-984,0;55').split('|').map((v, i) => { const [n, q] = v.includes('=') ? v.split('=') : [`v${i}`, v]; const [eye, look, fov] = q.split(';').map(x => x.split(',').map(Number)); return { n, eye, look, fov }; });
  const settle = +(process.env.SETTLE || 6);
  await p.evaluate(() => { const g = window.__game; for (const id of ['g-title', 'g-menu', 'g-bigmap', 'g-pass']) { const el = document.getElementById(id); if (el) el.hidden = true; } if (g.cine.active) g.cine.skip(); if (g.settleArrival) try { g.settleArrival(); } catch (e) { /* no arrival */ } });
  const stat = () => p.evaluate(() => { const g = window.__game, A = g.atmos, L = A && A.lens ? A.lens.uniforms : null; return { sun: g.Wd.lastSun ? +g.Wd.lastSun.sp.altitude.toFixed(2) : null, exposure: L ? +L.uExposure.value.toFixed(3) : null, hemi: +g.Wd.hemi.intensity.toFixed(3), env: !!g.Wd.world.environment }; });
  const shot = async name => { const png = await p.evaluate(() => new Promise(res => { let n = 4; const f = () => (--n > 0 ? requestAnimationFrame(f) : res(document.getElementById('game-gl').toDataURL('image/png'))); requestAnimationFrame(f); })); fs.writeFileSync(`${out}/${name}.png`, Buffer.from(png.split(',')[1], 'base64')); };
  const failed = [];
  const only = process.env.ONLY != null ? process.env.ONLY.split(',').filter(k => LIGHTS[k]) : Object.keys(LIGHTS); // (ONLY=none: no light taken away)
  // CARDS=i:k,i:k (the light cards' strengths) and CARDC=i:#rrggbb (a card's colour) for the whole run: the look as a
  // change to game.look.fill would make it, before it is made
  await p.evaluate(([K, C]) => { const N = window.__game.neon; if (!N) return; for (const q of K) { const [i, k] = q.split(':'); if (N.cards[+i]) N.cards[+i].userData.k = +k; } for (const q of C) { const [i, c] = q.split(':'); if (N.cards[+i]) N.cards[+i].color.set(c).convertSRGBToLinear(); } }, [(process.env.CARDS || '').split(',').filter(Boolean), (process.env.CARDC || '').split(',').filter(Boolean)]);
  for (const m of ats) for (const v of views) {
    const pre = `${m[4]}${m[5]}-${v.n}-`;
    await p.evaluate(async ({ m, v, settle }) => {
      const g = window.__game, THREE = window.THREE, { eye, look, fov } = v;
      g.hold(false);
      g.clock.frozen = true; g.setClock(+m[1], +m[2], +m[3], +m[4] * 60 + +m[5]);
      if (g.weather && g.weather.set) g.weather.set('clear', { now: true });
      const gz = (x, y) => { const f = g.nav.floorAt(x, y, g.nav.terrain(x, y) + 0.5); return f ? f.z : Math.max(0, g.nav.terrain(x, y)); };
      const W = (x, y, z) => new THREE.Vector3(x, z, -y);
      const pose = { pos: W(eye[0], eye[1], gz(eye[0], eye[1]) + eye[2]), look: W(look[0], look[1], gz(look[0], look[1]) + look[2]) };
      const cam = g.camera; if (!cam.__upm) cam.__upm = cam.updateProjectionMatrix.bind(cam); cam.updateProjectionMatrix = () => { cam.fov = fov[0]; cam.__upm(); };
      g.player.x = eye[0]; g.player.y = eye[1]; if (g.player.rig) g.player.rig.root.visible = false;
      g.cine.stop(); g.cine.play(() => pose, 1e9, { label: 'film' });
      g.advance(settle);
      if (g.hero && g.hero()) for (let i = 0; i < 1200; i++) { await new Promise(r => requestAnimationFrame(r)); if (i > 3 && !g.hero().state().some(q => q.state === 'loading')) break; }
      g.hold(true); // (the world held: the crowd and the cars where they are, for every still)
    }, { m, v, settle });
    console.log(`${pre} the light now:`, JSON.stringify(await stat()));
    await shot(`${pre}all`);
    // WHO=1: what the clipped pixels are of. Up to 160 of them (a channel at 250 or more, on a grid), each traced through
    // the lens to the first thing it meets, and counted by material: the share of the frame each puts at white
    const whoIs = async pre => { if (!process.env.WHO) return;
      const who = await p.evaluate(() => {
        const g = window.__game, T = window.THREE, c = document.getElementById('game-gl'), w = c.width, h = c.height;
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x2 = cv.getContext('2d'); x2.drawImage(c, 0, 0); const d = x2.getImageData(0, 0, w, h).data;
        const hot = []; let tot = 0;
        for (let y = 2; y < h; y += 5) for (let x = 2; x < w; x += 5) { tot++; const i = (y * w + x) * 4; if (Math.max(d[i], d[i + 1], d[i + 2]) >= 250) hot.push([x, y]); }
        const step = Math.max(1, Math.ceil(hot.length / 160)), rc = new T.Raycaster(), by = {};
        for (let k = 0; k < hot.length; k += step) {
          const [x, y] = hot[k]; rc.setFromCamera(new T.Vector2(x / w * 2 - 1, 1 - y / h * 2), g.camera);
          let name = 'the sky (nothing hit)';
          for (const q of rc.intersectObject(g.Wd.world, true)) { let v = true; for (let o = q.object; o; o = o.parent) v = v && o.visible; if (!v) continue; const m = Array.isArray(q.object.material) ? q.object.material[(q.face && q.face.materialIndex) || 0] : q.object.material; if (m && (m.transparent && m.opacity < 0.05 || m.colorWrite === false)) continue; name = `${(m && m.name) || (m && m.type) || '?'} · ${q.object.name || q.object.type}${m && m.emissiveIntensity > 0 ? ` · glow ${(+m.emissiveIntensity).toFixed(2)}` : ''}`; break; }
          by[name] = (by[name] || 0) + step;
        }
        return { clipped: +(hot.length / tot * 100).toFixed(2), by: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${(v / tot * 100).toFixed(2)}%  ${k}`) };
      });
      console.log(`${pre} clipped ${who.clipped}% of the frame, by what:\n    ${who.by.join('\n    ')}`);
      // FAIL=0.3: what is not a light (a lamp's head, a tube, a bulb, the points of the lamps, the sky) may put no more
      // than that share of the frame at white: a lit face, the ground, a wall. A light is the one thing meant to burn
      if (process.env.FAIL) for (const line of who.by) {
        const [pc, what] = [parseFloat(line), line.replace(/^[\d.]+%\s+/, '')];
        if (pc > +process.env.FAIL && !/lamp|light|tube|chase|neon|aviation|bulb|lantern|Points|ShaderMaterial|the sky/i.test(what)) { failed.push(`${pre}: ${line}`); console.log(`FAIL ${pre}: ${line}`); }
      }
    };
    await whoIs(pre);
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
      await shot(`${pre}without-${k}`);
      await p.evaluate(() => { for (const [o, key, was] of window.__pinned) { delete o[key]; o[key] = was; } });
    }
    // CARD=0.4,0.6: a light card's strength (its k; the card CARDI, the first by default) at each of these too, a still
    // for each, and with WHO=1 what is at white in it
    const ci = +(process.env.CARDI || 0);
    for (const k of (process.env.CARD || '').split(',').filter(Boolean).map(Number)) {
      const was = await p.evaluate(([k, i]) => { const C = window.__game.neon.cards[i], w = C.userData.k; C.userData.k = k; return w; }, [k, ci]);
      await shot(`${pre}card${ci}-${k}`);
      await whoIs(`${pre}card${ci}-${k}-`);
      await p.evaluate(([w, i]) => { window.__game.neon.cards[i].userData.k = w; }, [was, ci]);
    }
  }
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
    print('%-34s mean %.3f  median %.3f  p95 %.3f  clipped %5.1f%%   ground mean %.3f  clipped %5.1f%%' % (os.path.basename(f)[:-4], y.mean(), np.median(y), np.percentile(y, 95), (a.max(-1) > 0.97).mean() * 100, g.mean(), (a[int(a.shape[0] * .55):].max(-1) > 0.97).mean() * 100))
`, out]).toString());
  if (failed.length) { console.log(`${failed.length} surfaces that are not lights at white over ${process.env.FAIL}% of the frame`); process.exit(1); }
})();
