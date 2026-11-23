// What draws the ground at each point of an area, from above: for a grid over (x0, y0)-(x1, y1), the first mesh a ray
// straight down meets (its name, its material's name, the height), after the game has loaded round the spot. To tell
// which of several overlapping floors (a hero level's, a landmark's, the terrain's) is the one seen.
//   tools/job.sh run probe -- xvfb-run -a node tools/floor_probe.js x0,y0,x1,y1 [step] [z]
'use strict';
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const [,, box, step = '0.6', zs = ''] = process.argv;
(async () => {
  const [x0, y0, x1, y1] = box.split(',').map(Number);
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 200)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('bh-quality', 'high'); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await startPlay(p);
  await p.waitForFunction(() => { const g = window.__game; return g && g.player && g.frame; }, null, { timeout: 600000, polling: 500 });
  await p.evaluate(([x, y, z]) => { const g = window.__game; g.spawn([x, y], z || undefined); for (let k = 0; k < 40; k++) g.frame(0.05); }, [(x0 + x1) / 2, (y0 + y1) / 2, zs ? +zs : 0]);
  await p.waitForTimeout(20000);
  if (process.env.LEVEL) await p.waitForFunction(id => { const g = window.__game, h = g.hero && g.hero(); const l = h && h.state().find(q => q.id === id); return l && l.state === 'ready' && l.shown; }, process.env.LEVEL, { timeout: 300000, polling: 1000 }).catch(() => console.log('(the level not shown)'));
  if (process.env.SHOT) {
    await p.evaluate(([x, y]) => { const g = window.__game, pl = g.player; g.cam.yaw = Math.atan2(x - pl.x, y - pl.y); pl.h = g.cam.yaw; g.cam.pitch = 0.5; }, (process.env.FACE || '0,0').split(',').map(Number));
    await p.waitForTimeout(4000); await p.screenshot({ path: process.env.SHOT });
    await p.evaluate(() => window.__game.heroCut(true)); await p.waitForTimeout(3000); await p.screenshot({ path: process.env.SHOT.replace(/\.png$/, '-nocut.png') });
    await p.evaluate(() => window.__game.heroCut(false));
  }
  console.log(JSON.stringify(await p.evaluate(() => { const g = window.__game; return { cut: g.heroCut ? g.heroCut() : null, levels: g.hero() ? g.hero().state().map(l => `${l.id}:${l.state}:${l.shown}`) : null }; })));
  const r = await p.evaluate(([x0, y0, x1, y1, st, ztop]) => {
    const g = window.__game, T = window.THREE, scene = g.world ? (g.world.scene || null) : null;
    const root = scene || (g.renderer && g.renderer.info && null);
    const sc = root || (() => { let s = null; g.player.rig.root.traverseAncestors(a => { if (a.isScene) s = a; }); return s; })();
    const ray = new T.Raycaster(), out = {}, meshes = [];
    sc.traverseVisible(o => { if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh) meshes.push(o); });
    const name = o => { const parts = []; for (let q = o; q && !q.isScene && parts.length < 4; q = q.parent) parts.push(q.name || q.type); return parts.join(' < '); };
    for (let x = x0; x <= x1 + 1e-6; x += st) for (let y = y0; y <= y1 + 1e-6; y += st) {
      ray.set(new T.Vector3(x, ztop, -y), new T.Vector3(0, -1, 0)); ray.far = 60;
      const hit = ray.intersectObjects(meshes, false).find(h => h.object.visible && h.object.isMesh && !(h.object.material && h.object.material.transparent && h.object.material.opacity < 0.3) && !/rig|player|person|npc/i.test(name(h.object)));
      const m = hit && (Array.isArray(hit.object.material) ? hit.object.material[hit.face ? hit.face.materialIndex : 0] : hit.object.material);
      const ud = hit ? Object.keys(hit.object.userData || {}).slice(0, 4).join('/') : '';
      const k = hit ? `${name(hit.object)} ${hit.object.geometry.attributes.position.count}v ud:${ud} [${m && m.name || ''} ${m && m.type} #${m && m.color ? m.color.getHexString() : ''} map:${m && m.map ? (m.map.name || (m.map.image && m.map.image.width) || 'y') : '-'} ${m && m.side}]` : '(none)';
      (out[k] = out[k] || { n: 0, z: [] }).n++; if (hit) out[k].z.push(+hit.point.y.toFixed(2));
    }
    return Object.entries(out).map(([k, v]) => `${v.n}\t${k}\tz ${Math.min(...v.z)}..${Math.max(...v.z)}`).sort((a, b) => parseInt(b) - parseInt(a));
  }, [x0, y0, x1, y1, +step, (zs ? +zs : 16) + 1.9]);
  console.log(r.join('\n'));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
