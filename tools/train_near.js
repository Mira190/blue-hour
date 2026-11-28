// A phone within 15 m of a train (trains.js: on the lean tier the batch pool holds the far cars alone, and the near cars,
// drawn within LOD_M, are sent to the GPU when a car first comes that near). At each place (PLACES, "x,y,face_x,face_y;"
// game coordinates: you stand at x,y facing the line) it waits up to WAIT_S for a car to come within 15 m of the camera
// and prints: whether the near cars were drawn (their meshes shown with cars in them), the frame time of the frame they
// first came in against the median of the frames round it (a hitch is the upload), the GPU memory before and after, and
// takes a still with the car in it. Exits 1 where a car came within 15 m and no near car was drawn.
//   PORT=8800 xvfb-run -a node tools/train_near.js out_dir [WxH]       (390x844 by default: a phone, the lean tier)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { startPlay } = require('./start_play');
const [,, out = '/tmp/train-near', size = '390x844'] = process.argv;
const PLACES = (process.env.PLACES || '452,-1036,450.5,-1032.4;424,-992,430.2,-987.9;436,-1046,437.2,-1042.5').split(';').map(q => q.split(',').map(Number));
const WAIT_S = +(process.env.WAIT_S || 240);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage(phone ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: w, height: h } });
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 300)));
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'low');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 600000 });
  await startPlay(p);
  const lean = await p.evaluate(() => !!(window.OEQuality && OEQuality.city && OEQuality.city().lean));
  console.log(`lean tier: ${lean}`);
  let bad = 0, k = 0;
  for (const [x, y, fx, fy] of PLACES) {
    k++;
    const r = await p.evaluate(async ([x, y, fx, fy, WAIT_S]) => {
      const g = window.__game, T = window.THREE, cam = g.camera, gl = g.renderer;
      g.spawn([x, y]);
      const near = [], pool = [];
      g.world.traverse(o => { if (o.isInstancedMesh && o.userData.near) near.push(o); if (o.isBatchedMesh && /^train-/.test(o.name)) pool.push(o); });
      const face = () => { g.cam.yaw = Math.atan2(fx - g.player.x, fy - g.player.y); };
      const mem = () => { const i = gl.info.memory; return { geo: i.geometries, tex: i.textures, prog: (gl.info.programs || []).length }; };
      const dts = []; let last = performance.now(), first = null, progBefore = (gl.info.programs || []).length, nearest = Infinity, models = false, t0 = performance.now();
      const v = new T.Vector3(), m4 = new T.Matrix4();
      const m0 = mem();
      while ((performance.now() - t0) / 1000 < WAIT_S) {
        face();
        await new Promise(r => requestAnimationFrame(r));
        const now = performance.now(); dts.push(now - last); last = now;
        // the nearest car the pool or the near meshes place
        let d = Infinity;
        for (const b2 of pool) { const n = b2.instanceCount ?? b2._instanceInfo?.length ?? 0; for (let i = 0; i < n; i++) { try { if (!b2.getVisibleAt(i)) continue; b2.getMatrixAt(i, m4); } catch (e) { continue; } v.setFromMatrixPosition(m4).applyMatrix4(b2.matrixWorld); d = Math.min(d, v.distanceTo(cam.position)); } }
        for (const im of near) for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m4); v.setFromMatrixPosition(m4).applyMatrix4(im.matrixWorld); d = Math.min(d, v.distanceTo(cam.position)); }
        nearest = Math.min(nearest, d);
        models = models || pool.length > 0 || near.length > 0;
        const shown = near.filter(im => im.visible && im.count > 0).length;
        if (shown && !first) first = { at: dts.length - 1, d: +d.toFixed(1), shown, mem: mem(), progBefore };
        progBefore = (gl.info.programs || []).length;
        if (first && dts.length - first.at > 90) break;
        if (!pool.length && !near.length) { g.world.traverse(o => { if (o.isInstancedMesh && o.userData.near && !near.includes(o)) near.push(o); if (o.isBatchedMesh && /^train-/.test(o.name) && !pool.includes(o)) pool.push(o); }); }
      }
      const med = a => { const s = a.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)] || 0; };
      const res = { models, near: near.length, pool: pool.length, nearest: +nearest.toFixed(1), frames: dts.length, mem0: m0, mem1: mem() };
      if (first) Object.assign(res, { first: first.d, shownMeshes: first.shown, hitch: +dts[first.at].toFixed(0), hitchNext: +(dts[first.at + 1] || 0).toFixed(0), median: +med(dts.slice(Math.max(0, first.at - 60), first.at)).toFixed(0), memAt: first.mem, progBefore: first.progBefore });
      return res;
    }, [x, y, fx, fy, WAIT_S]);
    // (the still: the lens 9 m off the nearest car, beside the line and a little under it, following it for a few frames)
    if (r.first) await p.evaluate(async () => {
      const g = window.__game, T = window.THREE, cam = g.camera, m4 = new T.Matrix4(), v = new T.Vector3();
      const cars = () => { const c = []; g.world.traverse(o => { if (o.isInstancedMesh && o.userData.near && o.visible) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); c.push(new T.Vector3().setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld)); } }); return c; };
      const pose = { pos: new T.Vector3(), look: new T.Vector3() };
      const aim = () => { const c = cars(); if (!c.length) return pose; c.sort((a, b) => a.distanceTo(cam.position) - b.distanceTo(cam.position)); const q = c[0], side = new T.Vector3(q.x - cam.position.x, 0, q.z - cam.position.z).normalize(); pose.look.copy(q).y += 1.2; pose.pos.copy(q).addScaledVector(side, -9).y -= 0.5; return pose; };
      aim(); g.cine.play(() => aim(), 1e9, { label: 'film' });
      for (let i = 0; i < 12; i++) await new Promise(r => requestAnimationFrame(r));
    });
    const still = path.join(out, `near-${k}-${phone ? 'phone' : 'desktop'}.png`);
    await p.screenshot({ path: still });
    await p.evaluate(() => { const g = window.__game; if (g.cine.active) g.cine.skip(); });
    const fail = r.nearest < 15 && !r.first;
    if (fail) bad++;
    console.log(`${fail ? 'FAIL' : 'ok  '} at ${x},${y}: nearest car ${r.nearest} m over ${r.frames} frames; ${r.first ? `near cars drawn from ${r.first} m (${r.shownMeshes} meshes), that frame ${r.hitch} ms and the next ${r.hitchNext} against a median of ${r.median}` : 'no near car drawn'}; GPU objects ${JSON.stringify(r.mem0)} -> ${JSON.stringify(r.mem1)}${r.memAt ? `, at the near cars' first frame ${JSON.stringify(r.memAt)} (programs made then: ${r.memAt.prog - r.progBefore})` : ''}; ${still}`);
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
