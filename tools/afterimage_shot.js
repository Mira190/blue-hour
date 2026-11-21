// The story's afterimages as they look (web/game/people.js exposure, issue 16): each stood in the street beside one of
// tonight's living and a thing of 1964, at the story's hour (17:14) and at night, as stills; and five seconds of
// stills with time held while the player walks round one of them, the head turning to follow. Then the world held
// still entirely (no time at all) for ten frames: a head pose laid over the animation must not move, let alone wind
// round (AGENTS.md). Exits 1 if it does, or the page throws.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/afterimage_shot.js out_dir [WxH]       (TIER=low for a phone's tier; 390x844 for a phone)
'use strict';
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const fs = require('fs');
const path = require('path');
const [,, out = '/tmp/afterimages', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 600;
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  fs.mkdirSync(out, { recursive: true });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.storyFigure', null, { timeout: 900000, polling: 500 });
  await startPlay(p, { asIs: true });
  const story = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cities', 'shibuya', 'city.json'), 'utf8')).game.story.episodes[0];
  const seen = new Set(), ghosts = [];
  for (const f of story.frames) for (const a of [f.afterimage, f.afterimage2]) if (a && !seen.has(a.character)) { seen.add(a.character); ghosts.push(a); }
  const living = story.cast;
  // (each of them as themselves: their characters asked for and come, as the story asks for them when it opens)
  const chars = [...new Set(ghosts.concat(living).map(a => a.character))];
  await p.evaluate(cs => { const L = window.__game.peopleLib; for (const c of cs) Promise.resolve(L.require(c)).catch(() => {}); }, chars);
  await p.waitForFunction(cs => cs.every(c => window.__game.peopleLib.tpl[c]), chars, { timeout: 600000, polling: 1000 })
    .catch(async () => errors.push(`not every character came: ${await p.evaluate(cs => cs.filter(c => !window.__game.peopleLib.tpl[c]).join(', '), chars)}`));
  // (the arrival from the title's orbit settled and over: held, its shot would never end, and its blur stays on the picture)
  await p.evaluate(() => { const g = window.__game; if (g.arriving()) g.settleArrival(); g.advance(2); if (g.cine.active) g.cine.stop(); });
  await p.evaluate(() => { const g = window.__game; g.hold(true); g.clock.scale = 0; if (g.weather) g.weather.set('clear', { now: true }); g.player.rig.root.visible = false; });
  // a place in the open by Hachiko, looking north-west across the square (the crowd held round it)
  const A = [370.5, -1004.0], look = Math.atan2(-6, 14);
  const stage = (a, c, relic) => p.evaluate(([a, c, relic, A, look]) => {
    const g = window.__game, T = window.THREE, sx = Math.cos(look), sy = -Math.sin(look); // (across the view, to the right)
    for (const q of window.__ai || []) q.remove();
    const at = (k, fwd) => [A[0] + sx * k + Math.sin(look) * fwd, A[1] + sy * k + Math.cos(look) * fwd];
    const ghost = g.storyFigure(a, at(0, 0).concat([g.nav.terrain(...at(0, 0))])), alive = g.storyFigure(Object.assign({ alive: true }, c), at(1.3, 0.4).concat([g.nav.terrain(...at(1.3, 0.4))]));
    const r = g.past ? g.past.relic(relic, (() => { const q = at(-1.6, 0.6); return new T.Vector3(q[0], g.nav.terrain(q[0], q[1]) + 0.04, -q[1]); })(), look + Math.PI, {}) : null;
    if (g.past) g.past.whole(true);
    window.__ai = [ghost, alive, r].filter(Boolean);
    // the player where the camera is, so that the afterimage looks into the lens
    const cam = at(0.2, -4.2), z = g.nav.terrain(cam[0], cam[1]);
    Object.assign(g.player, { x: cam[0], y: cam[1], z });
    ghost.face(cam[0], cam[1]); alive.face(cam[0], cam[1]);
    for (let i = 0; i < 40; i++) { ghost.animate(1 / 30); alive.animate(1 / 30); }
    const c3 = g.camera; c3.position.set(cam[0], z + 1.55, -cam[1]); const t = at(0, 0); c3.lookAt(t[0], z + 1.25, -t[1]); c3.fov = 42; c3.updateProjectionMatrix();
    return true;
  }, [a, c, relic, A, look]);
  const relics = ['postbox', 'board', 'lamp'];
  for (const [hh, mm, tag] of [[17, 14, '1714'], [19, 40, 'night']]) {
    await p.evaluate(min => { const g = window.__game, c = g.clock; g.setClock(c.y, 10, 10, min); g.advance(0.2); }, hh * 60 + mm);
    for (const [i, a] of ghosts.entries()) {
      await stage(a, living[i % living.length], relics[i % relics.length]);
      await p.evaluate(() => new Promise(r => { let n = 12; const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); })); // (frames enough for the picture to settle on the new view)
      await p.screenshot({ timeout: 300000, path: path.join(out, `${tag}-${i + 1}-${(a.name || a.character).split(' ')[0]}.png`) });
      console.log(`${tag} ${a.name} beside ${living[i % living.length].name} and the ${relics[i % relics.length]}`);
    }
  }
  // the head turn: the player walks round to the left over five seconds, time held but the afterimage moving
  await stage(ghosts[0], living[0], 'postbox');
  const turn = [];
  for (let i = 0; i < 10; i++) {
    const r = await p.evaluate(([i, A, look]) => {
      const g = window.__game, f = window.__ai[0], k = -0.45 - i * 0.12, d = 4.2, x = A[0] + Math.sin(look + Math.PI + k) * d, y = A[1] + Math.cos(look + Math.PI + k) * d; // (from in front, round to her right)
      g.player.x = x; g.player.y = y;
      for (let s = 0; s < 15; s++) { f.face(x, y); f.animate(1 / 30); }
      const c3 = g.camera, z = g.player.z; c3.position.set(x, z + 1.6, -y); c3.lookAt(A[0], z + 1.35, -A[1]);
      const hd = f.look[1]; return hd ? hd.quaternion.toArray().map(v => +v.toFixed(4)) : null;
    }, [i, A, look]);
    turn.push(r);
    await p.evaluate(() => new Promise(r => { let n = 6; const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); }));
    await p.screenshot({ timeout: 300000, path: path.join(out, `turn-${String(i).padStart(2, '0')}.png`) });
  }
  // time held entirely: ten frames with no time in them; the head's pose must stay as it is
  const held = await p.evaluate(() => { const f = window.__ai[0], hd = f.look[1], out = []; for (let i = 0; i < 10; i++) { f.face(window.__game.player.x, window.__game.player.y); f.animate(0); out.push(hd.quaternion.toArray()); } return out; });
  const drift = Math.max(...held.map(q => Math.hypot(...q.map((v, k) => v - held[0][k]))));
  console.log(`head turn: ${turn.filter(Boolean).length} poses over 5 s; held still, the head moved ${drift.toExponential(2)}`);
  if (!turn[0]) errors.push('no head bone found on the afterimage');
  if (drift > 1e-4) errors.push(`the head moved ${drift} with no time passing: a pose wound round`);
  await b.close();
  for (const e of errors) console.log(`FAIL ${e}`);
  process.exit(errors.length ? 1 : 0);
})();
