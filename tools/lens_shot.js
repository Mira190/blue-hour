// Someone of the crowd at a cinematic shot's lens (issue 232): the walk (?walk=1), you stood at the Hachiko kerb, and once
// the near people are made a scripted shot is played whose camera stands a metre behind one of them at the eye's height,
// looking past them, followed as they walk. Counted over the shot's frames, stepped headless a thirtieth of a second at a
// time: in how many that person was still drawn whole in front of the lens (game.js lensClear takes them out of a shot as
// out of a film). Exits 1 if they were drawn in any.
//   xvfb-run -a node tools/lens_shot.js [frames, 90]       (PORT=; AT=x,y where you stand; D=1 metres behind them)
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, frames = '90'] = process.argv;
(async () => {
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  await pinClock(p, 'shibuya');
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 400000 });
  await startPlay(p);
  const at = (process.env.AT || '376.9,-1013.1').split(',').map(Number);
  await p.evaluate(at => { const g = window.__game; if (g.cine && g.cine.active) g.cine.skip(); g.player.x = at[0]; g.player.y = at[1]; }, at);
  await p.waitForFunction(() => { const R = window.__game.crowdDraw(); return R && R.active && R.active.size >= 4; }, null, { timeout: 240000, polling: 1000 }).catch(() => console.log('fewer than four whole rigs after four minutes'));
  const out = await p.evaluate(([n, D]) => {
    window.requestAnimationFrame = () => 0;
    const g = window.__game, P = g.crowd.P, R = g.crowdDraw(), me = g.player, dt = 1 / 30;
    // (who: the whole rig nearest you that is walking a line)
    let i = -1, bd = Infinity;
    for (const [k] of R.active) { const q = P[k]; if (!(q.line >= 0 || q.pz)) continue; const d = Math.hypot(q.x - me.x, q.y - me.y); if (d < bd) { bd = d; i = k; } }
    if (i < 0) return { none: true };
    const q = P[i], pos = new THREE.Vector3(), look = new THREE.Vector3();
    // (the shot: D metres behind them on the line from you to them, at 1.6 m, looking 8 m past them)
    const shot = () => { const dx = q.x - me.x, dy = q.y - me.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, z = q.z || 0;
      pos.set(q.x - ux * D, z + 1.6, -(q.y - uy * D)); look.set(q.x + ux * 8, z + 1.4, -(q.y + uy * 8)); return { pos, look }; };
    g.cine.play(shot, n * dt + 5, { label: 'film' });
    let drawn = 0, framesIn = 0;
    const hid0 = R.hide; let hides = 0; R.hide = (k, soft) => { if (k === i) hides++; return hid0(k, soft); }; // (how often lensClear asked)
    for (let f = 0; f < n; f++) {
      g.advance(dt);
      if (!g.cine.active) break;
      framesIn++;
      const r = R.active.get(i); if (r && r.root.visible && r.root.layers.isEnabled(0)) drawn++;
    }
    g.cine.skip();
    R.hide = hid0;
    return { i, hides, cam: [g.camera.position.x, g.camera.position.y, g.camera.position.z, q.x, q.y, q.z, q.rx, q.ry, q.rz].map(v => +(+v).toFixed(2)), framesIn, drawn, d0: +bd.toFixed(1) };
  }, [+frames, +(process.env.D || 1)]);
  if (out.none) { console.log('nobody of the crowd near you walking a line'); process.exitCode = 1; }
  else { console.log(`shot of ${out.framesIn} frames, the camera ${process.env.D || 1} m behind walker ${out.i} (${out.d0} m from you): drawn whole at the lens in ${out.drawn} frames (asked out ${out.hides} times; ${out.cam})`); if (out.drawn) process.exitCode = 1; }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
