// A close look at what tools/clip_probe.js measured (issue 126): for each person named, a still of their feet and one
// of their whole body from a free camera a pace off, and beside the probe's numbers the ground as it is DRAWN under each
// foot (a ray straight down through the world's own meshes), so that a foot the collision floor calls sunk can be told
// from one the paving really covers.
//   xvfb-run -a node tools/clip_look.js out_dir [WxH] [name,name,...]     (the map without the story, ?walk=1; names of
//   the map's NPCs, or "you"; RUN=1: the player run past the camera, five stills of the stride from the front)
// STORY=n: in the story instead, opened at frame n+1 (as tools/story_play.js FROM=n), for its cast.
const { chromium } = require('playwright');
const fs = require('fs');
const probe = require('./clip_probe');
const [,, out = '/tmp/clip-look', size = '1440x900', names = 'Aoi,Shun,Yuna'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await probe.install(p);
  const story = process.env.STORY != null;
  if (story) await p.addInitScript(n => { try { localStorage.setItem('oe-story-late', JSON.stringify({ fi: n, left: 7 - n, prints: Array.from({ length: n }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, +process.env.STORY);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${story ? '' : '?walk=1'}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('gt-play').click());
  await p.waitForTimeout(story ? 20000 : 8000);
  await p.evaluate(() => { const g = window.__game; if (g.cine && g.cine.active && g.cine.skip) g.cine.skip(); });
  await p.waitForTimeout(2000);
  const look = (name, part) => p.evaluate(([name, part]) => {
    const g = window.__game, T = window.THREE, pl = g.player;
    const all = [{ name: 'you', o: pl, rig: pl.rig }].concat((g.npcs || []).map(n => ({ name: n.name || n.id, o: n, rig: n.rig })), [...g.storyFigs()].map(f => ({ name: f.name || f.character, o: f, rig: f.rig })));
    const q = all.find(a => a.name.toLowerCase().includes(name.toLowerCase()) && a.rig && a.rig.root);
    if (!q) return null;
    const o = q.o, root = q.rig.root;
    if (q.name !== 'you') { // (the player beside them, out of the frame, so that they are drawn at their nearest)
      pl.x = o.x + 3.2; pl.y = o.y + 0.4; pl.z = o.z; if (pl.rig) pl.rig.root.visible = false; }
    root.updateWorldMatrix(true, true);
    // the feet: the lowest vertex each foot's bone carries, and the ground drawn under it
    const ray = new T.Raycaster(), feet = window.__probe.solesOf(root); ray.camera = new T.PerspectiveCamera(); // (a sprite in the ray's way asks for one)
    for (const f of feet) {
      ray.set(new T.Vector3(f.x, f.y + 1.2, f.z), new T.Vector3(0, -1, 0)); ray.far = 3;
      const hit = ray.intersectObjects(g.world.children.filter(c => c !== root && c.visible), true).filter(x => { for (let q2 = x.object; q2; q2 = q2.parent) { if (q2 === root || !q2.visible) return false; if (q2.isSkinnedMesh || q2.isInstancedMesh || q2.isPoints || q2.isSprite || q2.isLine) return false; } return true; })[0];
      const nf = g.nav.floorAt(f.x, -f.z, o.z + 0.5);
      f.drawn = hit ? +hit.point.y.toFixed(3) : null; f.drawnOn = hit ? (hit.object.name || hit.object.parent.name || hit.object.type) : null;
      f.floor = nf ? +nf.z.toFixed(3) : null; f.sole = +f.y.toFixed(3);
    }
    const S = window.__look = window.__look || { pose: { pos: new T.Vector3(), look: new T.Vector3() } };
    const hd = (o.h != null ? o.h : 0) + 0.7, dx = Math.sin(hd), dy = Math.cos(hd);
    if (part === 'feet') { S.pose.pos.set(o.x + dx * 1.3, o.z + 0.22, -(o.y + dy * 1.3)); S.pose.look.set(o.x, o.z + 0.06, -o.y); }
    else { S.pose.pos.set(o.x + dx * 2.6, o.z + 1.35, -(o.y + dy * 2.6)); S.pose.look.set(o.x, o.z + 1.0, -o.y); }
    g.cine.stop(); g.cine.play(() => S.pose, 1e9, { label: 'film' });
    let nm = 0, nv = 0; root.traverse(m => { if (m.isSkinnedMesh) nm++; if (m.isMesh) nv++; });
    return { name: q.name, at: [+o.x.toFixed(2), +o.y.toFixed(2), +o.z.toFixed(2)], root: +root.position.y.toFixed(3), feet, dbg: `${nm} skinned of ${nv} meshes, pending ${!!q.rig.pending}, visible ${root.visible}, probe err ${window.__probe.err}` };
  }, [name, part]);
  for (const name of names.split(',')) {
    for (const part of ['feet', 'body']) {
      let r = await look(name, part);
      if (!r) { console.log(`${name}: not there`); break; }
      await p.waitForFunction(name => { const g = window.__game, n = (g.npcs || []).find(q => (q.name || q.id).toLowerCase().includes(name.toLowerCase())); return !n || (n.rig && !n.rig.pending); }, name, { timeout: 120000, polling: 500 }).catch(() => {});
      await p.waitForTimeout(1500);
      r = await look(name, part); // (again: someone's own model comes once the player is near, and is measured then)
      await p.waitForTimeout(1200);
      const file = `${name.toLowerCase()}-${part}`;
      await p.screenshot({ path: `${out}/${file}.png` });
      if (part === 'feet') console.log(r.dbg);
      if (part === 'feet') console.log(`${r.name} at (${r.at}), its root at ${r.root}: ${r.feet.map(f => `${f.side} sole ${f.sole}, the collision floor ${f.floor}, the ground drawn ${f.drawn}${f.drawnOn ? ` (${f.drawnOn})` : ''}`).join('; ')}`);
    }
  }
  if (process.env.RUN) { // the player's stride from the front: run at the camera's side, a still every few frames
    await p.evaluate(() => { const g = window.__game, T = window.THREE, pl = g.player; g.cine.stop(); if (pl.rig) pl.rig.root.visible = true; pl.h = Math.PI / 2; if (g.cam) g.cam.yaw = pl.h;
      const S = window.__look = window.__look || { pose: { pos: new T.Vector3(), look: new T.Vector3() } };
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
      const f = () => { S.pose.pos.set(pl.x + 2.4, pl.z + 1.3, -(pl.y + 0.9)); S.pose.look.set(pl.x, pl.z + 1.15, -pl.y); if (!g.cine.active) g.cine.play(() => S.pose, 1e9, { label: 'film' }); requestAnimationFrame(f); }; f(); });
    for (let k = 0; k < 6; k++) { await p.waitForTimeout(700); await p.screenshot({ path: `${out}/run-${k}.png` }); }
    await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true })));
  }
  probe.print(await probe.report(p));
  await b.close();
})();
