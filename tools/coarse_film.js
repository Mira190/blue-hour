// A film of the far crowd's step from its coarser copy to its copy (issue 61, people.js COARSE_M): the camera dollies at
// walking pace along the Scramble's diagonal, eye high, with the crowd staged ahead, so walkers come in from past 60 m to
// under it in view. The world runs at 15 frames a second of game time, each frame saved; ffmpeg makes <out>/<name>.mp4.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/coarse_film.js out_dir [WxH] [seconds, 8]
// TIME (sunset+15), QUERY added to ?walk=1 (e.g. &farcoarse=off for the copy throughout, &coarsem=0 for the coarser
// copy throughout), NAME (the film's file name), TIER (high; low on a phone's size).
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const [,, outDir = '.', size = '1440x900', secs = '8'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), mobile = w < 600, FPS = 15, N = Math.round(+secs * FPS);
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); localStorage.setItem('oe3d-onboard', '1'); } catch (e) { /* storage blocked */ } }, process.env.TIER || (mobile ? 'low' : 'high'));
  await p.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, opts) { return get.call(this, type, /webgl/.test(type) ? Object.assign({}, opts, { preserveDrawingBuffer: true }) : opts); };
  });
  const logs = [];
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
  const name = process.env.NAME || `coarse-${w}x${h}`, dir = path.join(outDir, name);
  fs.mkdirSync(dir, { recursive: true });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1${process.env.QUERY || ''}#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await startPlay(p);
  await p.waitForTimeout(1500);
  await p.evaluate(async time => {
    const g = window.__game;
    for (const id of ['g-title', 'g-menu', 'g-bigmap', 'g-pass']) { const el = document.getElementById(id); if (el) el.hidden = true; }
    if (g.cine.active) g.cine.skip();
    if (g.settleArrival) try { g.settleArrival(); } catch (e) { /* no arrival */ }
    g.clock.frozen = true;
    document.body.classList.add('shot');
    const st = document.createElement('style');
    st.textContent = '#g-hud, .g-hud, #g-toast, #g-caption, .tour, #g-onboard, #g-tour, #g-area { display: none !important; }';
    document.head.appendChild(st);
    const c = g.clock, rel = /^(sunrise|sunset)([+-]\d+)?$/.exec(time);
    let min = 17 * 60 + 30;
    if (rel && g.dayLimits) min = Math.round(g.dayLimits()[rel[1]] + (+rel[2] || 0));
    else if (/^\d+:\d+$/.test(time)) { const [hh, mm] = time.split(':').map(Number); min = hh * 60 + mm; }
    g.setClock(c.y, 11, 14, min);
    if (g.weather && g.weather.set) g.weather.set('clear', { now: true });
    const W = (x, y, z) => new THREE.Vector3(x, z, -y), gz = (x, y) => Math.max(0, g.nav.terrain(x, y));
    // from the far corner of the crossing towards Hachiko's, eye 1.65 m up, 55 degrees (the lens counts as the chase view's)
    const A = [326, -952], B = [356, -994], L = [392, -1046];
    const pose = { pos: W(A[0], A[1], gz(...A) + 1.65), look: W(L[0], L[1], gz(...L) + 2) };
    window.__film = { A, B, L, pose, W, gz };
    const cam = g.camera, upm = cam.updateProjectionMatrix.bind(cam);
    cam.updateProjectionMatrix = () => { cam.fov = 55; upm(); };
    g.player.x = A[0]; g.player.y = A[1]; g.player.z = gz(...A);
    if (g.player.rig) g.player.rig.root.visible = false;
    g.cine.stop();
    g.cine.play(() => pose, 1e9, { label: 'film' });
    // the crowd on the footways and the crossing ahead (as tools/scramble_shot.js "people" stages it), none within 6 m
    if (g.crowdAuto) g.crowdAuto(false);
    const C = g.crowd, net = g.footNet, cand = net.near(370, -1012, 0, 90), tmp = {};
    let seed = 99;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (const q of C.P.slice(0, C.active)) {
      if (q.seat) { q.seat.by = -1; q.seat = null; }
      q.state = 'walk'; q.mode = 'ground'; q.lat = null; q.pause = 0; q.dodge = 0;
      for (let k = 0; k < 12; k++) { q.line = cand[Math.floor(rnd() * cand.length)]; q.s = rnd() * net.L[q.line].len; net.at(q.line, q.s, tmp); if (Math.hypot(tmp.x - A[0], tmp.y - A[1]) >= 6) break; }
      q.dir = rnd() < 0.5 ? 1 : -1; q.x = tmp.x; q.y = tmp.y; q.z = tmp.z;
    }
    g.advance(4);
    if (g.hero && g.hero()) for (let i = 0; i < 1200; i++) { await new Promise(r => requestAnimationFrame(r)); if (i > 3 && !g.hero().state().some(h => h.state === 'loading')) break; }
  }, process.env.TIME || 'sunset+15');
  for (let i = 0; i < N; i++) {
    const png = await p.evaluate(async ({ k }) => {
      const g = window.__game, F = window.__film, x = F.A[0] + (F.B[0] - F.A[0]) * k, y = F.A[1] + (F.B[1] - F.A[1]) * k;
      F.pose.pos.copy(F.W(x, y, F.gz(x, y) + 1.65));
      g.player.x = x; g.player.y = y;
      g.advance(1 / 15);
      g.Wd.fitShadow(F.pose.look, 300);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return document.getElementById('game-gl').toDataURL('image/jpeg', 0.9);
    }, { k: i / Math.max(1, N - 1) });
    fs.writeFileSync(path.join(dir, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(png.split(',')[1], 'base64'));
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', path.join(outDir, `${name}.mp4`)]);
  console.log(`${path.join(outDir, `${name}.mp4`)}: ${N} frames`);
  if (logs.length) console.log(logs.slice(0, 20).join('\n'));
  await b.close();
})();
