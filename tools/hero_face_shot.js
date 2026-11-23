// The face of the one you play, as near as a phone's talk shows it and nearer, with its pictures at the phone's size and
// as they come (people.js smaller; issue 130): the walk on a phone's page, the world held, the camera set before the
// player's head at two distances, a still of each, and what the player's pictures weigh on the GPU.
//   xvfb-run -a node tools/hero_face_shot.js out_dir [full]        ("full": ?herotex=full, the pictures as they come)
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const fs = require('fs');
const [,, out = '/tmp/hero-face', mode = ''] = process.argv;
(async () => {
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' });
  fs.mkdirSync(out, { recursive: true });
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  await p.addInitScript(() => { try { localStorage.setItem('oe3d-quality', 'low'); localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  await p.addInitScript(require('./gl_mem').hook);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0${mode === 'full' ? '&herotex=full' : ''}#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(() => { const g = window.__game; g.setClock(g.clock.y, 10, 10, 16 * 60 + 30); for (let i = 0; i < 200 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); } });
  await p.waitForTimeout(+(process.env.WARM || 30000));
  const tex = await p.evaluate(() => {
    const g = window.__game, T = window.THREE, seen = new Set(), list = [];
    g.player.rig.root.traverse(o => { if (!o.isMesh) return; for (const m of [].concat(o.material)) for (const k in m) { const t = m[k]; if (t && t.isTexture && t.image && !seen.has(t)) { seen.add(t); list.push(`${o.name} (in ${o.parent && o.parent.name}; material ${m.name}) ${k} ${t.image.width}x${t.image.height}`); } } });
    return { list, gpu: +(window.__memReport(0).now / 1048576).toFixed(1) };
  });
  console.log(`${mode || 'phone'}: GPU ${tex.gpu} MB; the player's pictures: ${tex.list.join('; ')}`);
  for (const [name, d] of [['talk', 1.6], ['near', 0.7]]) {
    await p.evaluate(d => {
      const g = window.__game, T = window.THREE, pl = g.player; g.hold(true);
      for (const e of document.querySelectorAll('#game-gl ~ *, .game-stage > *')) if (e.tagName !== 'CANVAS') e.style.visibility = 'hidden';
      let head = null; pl.rig.root.traverse(o => { if (o.isBone && /Head$/.test(o.name) && !head) head = o; });
      const at = new T.Vector3(); head.getWorldPosition(at);
      const f = new T.Vector3(0, 0, 1).applyQuaternion(pl.rig.root.getWorldQuaternion(new T.Quaternion())); f.y = 0; f.normalize();
      const c = g.camera; c.position.copy(at).addScaledVector(f, d).add(new T.Vector3(0.25 * d, 0.02, 0)); c.lookAt(at.x, at.y + 0.04, at.z); c.updateMatrixWorld();
      g.atmos.render(g.world, c);
    }, d);
    await p.screenshot({ path: `${out}/${mode || 'phone'}-${name}.png` });
    await p.evaluate(() => window.__game.hold(false));
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
