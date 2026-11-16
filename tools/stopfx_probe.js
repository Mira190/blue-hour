// Are the leaves, handbills and pigeons of the stopped air there before the Stop, or do they appear with it?
// Plays the first frame to its Stop and, every half second, counts how many of each are in the camera's view
// within 25 m, with a still before the Stop and at it (stopfx.js says they are there all along).
//   python3 -m http.server 8800 --directory web &
//   node tools/stopfx_probe.js out_dir [WxH]          (GPU=metal on a Mac; under xvfb-run -a elsewhere)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/stopfx-probe', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(() => { try { localStorage.setItem('oe3d-quality', 'high'); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.evaluate(() => document.getElementById('gt-play').click());
  const count = () => p.evaluate(() => {
    const g = window.__game, T = window.THREE, cam = g.camera, st = g.story.state;
    let amb = null;
    (g.world.traverse ? g.world : g.world.scene || g.world).traverse(o => { if (!amb && o.isGroup && o.children.some(c => c.isPoints && c.geometry.attributes.position.count === 1400)) amb = o; });
    const r = { phase: st.phase, beat: st.beat, fi: st.fi, leaves: 0, bills: 0, birds: 0, made: !!amb };
    if (!amb) return r;
    const fr = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const M = new T.Matrix4(), V = new T.Vector3();
    const tally = (mesh, key) => { if (!mesh || !mesh.visible || !mesh.parent.visible) return; for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, M); V.setFromMatrixPosition(M).applyMatrix4(mesh.matrixWorld); if (V.distanceTo(cam.position) < 25 && fr.containsPoint(V)) r[key]++; } };
    const [, leaves, birds] = amb.children;
    if (leaves) { tally(leaves.children[0], 'leaves'); tally(leaves.children[1], 'leaves'); tally(leaves.children[2], 'bills'); }
    if (birds) tally(birds.children[0], 'birds');
    return r;
  });
  const t0 = Date.now(); let shotBefore = false, rows = [];
  while (Date.now() - t0 < 400000) {
    const d = await p.evaluate(() => { const d = document.getElementById('gd'); return d && !d.hidden; });
    const c = await count();
    rows.push(c); console.log(JSON.stringify(c));
    if (d) { await p.waitForTimeout(1200); await p.keyboard.press('KeyE'); await p.waitForTimeout(300); continue; } // (read as a player reads, and counted while they do)
    if (c.phase === 'go' && c.fi === 0 && c.made && !shotBefore && Date.now() - t0 > 20000) { shotBefore = true; await p.screenshot({ path: `${out}/before-stop.png` }); }
    if (c.phase === 'stop') { await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/at-stop.png` }); console.log(JSON.stringify(await count())); break; }
    await p.waitForTimeout(500);
  }
  const run = rows.filter(r => r.phase !== 'stop');
  const avg = k => (run.reduce((s, r) => s + r[k], 0) / Math.max(1, run.length)).toFixed(1);
  console.log(`running world, mean in view: leaves ${avg('leaves')}, handbills ${avg('bills')}, pigeons ${avg('birds')} (over ${run.length} samples)`);
  await b.close();
})();
