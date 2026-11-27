// What the camera sees at a place, named: a still from a player's chase camera at `at` (on the floor nearest `z`,
// facing `look`), and the first thing a ray from the camera meets through each point of a grid over the screen, by its
// mesh's name, its material and how dark it is drawn. For finding what a still shows that should not be there (the
// owner's phone at SHIBUYA SKY's escalator: "a black cover over it").
//   xvfb-run -a node tools/what_covers.js '{"at":[x,y],"z":z,"look":[x,y],"pitch":0.5,"dist":5.5,"time":"17:41"}' out.png [WxH]
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const [,, spec = '{}', out = '/tmp/what_covers.png', size = '390x844'] = process.argv;
const V = JSON.parse(spec), [W, H] = size.split('x').map(Number);
(async () => {
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  // LEAN=1: an iPhone (its user agent, touch, the phone's memory path and its district, the low tier), as tools/game_shot.js
  const lean = !!process.env.LEAN;
  const ctx = lean ? await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: +(process.env.DPR || 2), isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' }) : b;
  const p = lean ? await ctx.newPage() : await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await p.addInitScript(t => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || (lean ? 'low' : 'high'));
  const logs = [];
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${process.env.QS || '?walk=1'}#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(async V => {
    const g = window.__game;
    g.advance(1); if (g.cine && g.cine.active && g.cine.skip) g.cine.skip(); g.advance(2);
    if (V.time) { const [h, m] = V.time.split(':').map(Number); g.clock.min = h * 60 + m; g.clock.scale = 0; }
    // (the floor under the point: from the level asked, or from over the ground there: from 0.5 m over the sea's level, a
    // place 15 m up found none, and the player stood at an undefined height, the sound's mix made from it: not a number)
    const [x, y] = V.at, f = g.nav.floorAt(x, y, V.z != null ? V.z + 0.5 : Math.max(0, g.nav.terrain(x, y) || 0) + 30);
    Object.assign(g.player, { x, y, z: f ? f.z : (V.z ?? Math.max(0, g.nav.terrain(x, y) || 0)), mode: 'foot', speed: 0, vz: 0, ground: true });
    if (V.look) g.player.h = Math.atan2(V.look[0] - x, V.look[1] - y);
    Object.assign(g.cam, { mode: 'chase', yaw: g.player.h + (V.yaw || 0), pitch: V.pitch ?? 0.17, dist: V.dist ?? 5.5, distTo: 0, yawTo: null, lastInput: -10 });
    for (let i = 0; i < 20; i++) { g.advance(0.1); await new Promise(r => requestAnimationFrame(r)); }
    const h = g.hero && g.hero();
    for (let i = 0; i < 400 && h && h.state().some(s => s.state === 'loading'); i++) await new Promise(r => setTimeout(r, 250));
    for (let i = 0; i < 10; i++) { g.cam.yaw = g.player.h + (V.yaw || 0); g.cam.pitch = V.pitch ?? 0.17; g.advance(0.05); await new Promise(r => requestAnimationFrame(r)); }
  }, V);
  // "walk": seconds walked forward first (up a flight, along a way), a still every `every` seconds of it
  for (let t = 0, k = 0; V.walk && t < V.walk; t += V.every || 2, k++) {
    await p.evaluate(async V => { const g = window.__game; for (let i = 0; i < (V.every || 2) * 4; i++) { g.cam.yaw = g.player.h + (V.yaw || 0); g.cam.pitch = V.pitch ?? 0.17; g.advance(0.25, ['KeyW']); await new Promise(r => requestAnimationFrame(r)); } }, V);
    const at = await p.evaluate(() => { const g = window.__game; return [g.player.x, g.player.y, g.player.z].map(v => +v.toFixed(2)); });
    await p.screenshot({ path: out.replace(/\.png$/, `-${k}.png`) });
    console.log(`still ${k} at ${at.join(', ')}`);
  }
  await p.screenshot({ path: out });
  const hits = await p.evaluate(() => {
    const g = window.__game, T = window.THREE, cam = g.camera, rc = new T.Raycaster(), res = [];
    const c = document.getElementById('game-gl'), s = document.createElement('canvas'); s.width = c.width; s.height = c.height;
    const cx = s.getContext('2d'); cx.drawImage(c, 0, 0); const px = cx.getImageData(0, 0, s.width, s.height).data;
    for (let j = 1; j < 12; j++) for (let i = 1; i < 6; i++) {
      const u = i / 6, v = j / 12;
      rc.setFromCamera(new T.Vector2(u * 2 - 1, -(v * 2 - 1)), cam);
      const all = [];
      g.world.traverseVisible(o => { if (!o.isMesh || !o.geometry || !o.material || Array.isArray(o.material) || o.material.visible === false) return; const P = o.geometry.attributes && o.geometry.attributes.position; if (!P || !P.array) return; try { rc.intersectObject(o, false, all); } catch (e) { /* freed */ } });
      all.sort((a, b) => a.distance - b.distance);
      const hit = all[0];
      const k = (Math.floor(v * s.height) * s.width + Math.floor(u * s.width)) * 4, lum = Math.round((px[k] + px[k + 1] + px[k + 2]) / 3);
      let o = hit && hit.object, chain = [];
      while (o && chain.length < 3) { if (o.name) chain.push(o.name); o = o.parent; }
      res.push(`${(u * 100).toFixed(0).padStart(3)}% ${(v * 100).toFixed(0).padStart(3)}%  lum ${String(lum).padStart(3)}  ${hit ? `${chain.join(' < ') || '(unnamed ' + hit.object.type + ')'}  mat ${hit.object.material.name || hit.object.material.type}  at ${hit.point.x.toFixed(1)}, ${(-hit.point.z).toFixed(1)}, ${(hit.point.y).toFixed(2)}  d ${hit.distance.toFixed(1)}` : 'sky'}`);
    }
    return { res, player: [g.player.x, g.player.y, g.player.z].map(v => +v.toFixed(2)), cam: [cam.position.x, -cam.position.z, cam.position.y].map(v => +v.toFixed(2)) };
  });
  console.log('player at', hits.player.join(', '), ' camera at', hits.cam.join(', '));
  console.log(hits.res.join('\n'));
  if (logs.length) console.log(logs.join('\n'));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
