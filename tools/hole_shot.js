// The ground's hole over the walled channels on a phone, with its mask at half the size and whole (inland.js holeMask;
// issue 130): the walk on a phone's page, the player put beside the channel, the world held, and stills from over the
// player looking each way and down, each drawn both ways' pages; and what the GPU holds.
//   xvfb-run -a node tools/hole_shot.js out_dir [full] [x,y]       ("full": ?holemask=full; x,y: where, by the river's culvert by default)
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const fs = require('fs');
const [,, out = '/tmp/hole', mode = '', at = '516.7,-1073.6'] = process.argv;
(async () => {
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' });
  fs.mkdirSync(out, { recursive: true });
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  await p.addInitScript(() => { try { localStorage.setItem('oe3d-quality', 'low'); localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  await p.addInitScript(require('./gl_mem').hook);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0${mode === 'full' ? '&holemask=full' : ''}#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(([x, y]) => { const g = window.__game; g.setClock(g.clock.y, 10, 10, 15 * 60); for (let i = 0; i < 200 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); } g.spawn([x, y]); for (let i = 0; i < 10; i++) g.advance(1 / 30); }, at.split(',').map(Number));
  await p.waitForTimeout(+(process.env.WARM || 35000));
  const info = await p.evaluate(() => { const r = window.__memReport(60), g = window.__game; return { gpu: +(r.now / 1048576).toFixed(1), big: r.topTex.filter(s => /^\d+\.\d MB \d{4}x\d{3,4} storage$/.test(s)).slice(0, 4), at: [g.player.x, g.player.y, g.player.z].map(v => +v.toFixed(1)) }; });
  console.log(`${mode || 'half'}: GPU ${info.gpu} MB; the largest plain textures: ${info.big.join('; ')}; the player at ${info.at}`);
  const views = [['n', 0, 0.9], ['e', Math.PI / 2, 0.9], ['s', Math.PI, 0.9], ['w', -Math.PI / 2, 0.9], ['down', 0, 1.45]];
  for (const [name, yaw, pitch] of views) {
    await p.evaluate(([yaw, pitch]) => {
      const g = window.__game, T = window.THREE, pl = g.player; g.hold(true);
      for (const e of document.querySelectorAll('#game-gl ~ *, .game-stage > *')) if (e.tagName !== 'CANVAS') e.style.visibility = 'hidden';
      const c = g.camera, eye = new T.Vector3(); pl.rig.root.getWorldPosition(eye); eye.y += 14;
      const d = new T.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      c.position.copy(eye); c.lookAt(eye.clone().add(d)); c.updateMatrixWorld();
      g.atmos.render(g.world, c);
    }, [yaw, pitch]);
    await p.screenshot({ path: `${out}/${mode || 'half'}-${name}.png` });
    await p.evaluate(() => window.__game.hold(false));
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
