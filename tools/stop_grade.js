// How bright the first frame's street is, held and running, from one camera: what the Stop's own grade does to the
// picture, and what the picture is when time runs again (the office's call after the first photograph). Plays the
// episode from its title to that call as a player who knows the way would (the films skipped, every line passed), and
// at each moment holds the player and the camera at one place, takes a still, and prints the light as the game has it
// (the clock, the sun's height, the exposure and the hour's grade) beside the still's mean luminance and its share of
// clipped pixels. A still with the Stop's grade taken off (its veil and its filter) is taken in the Stop too, so that
// what the CSS does is told apart from what the world's light does.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/stop_grade.js out_dir [WxH]
// EYE=x,y,yaw,pitch,dist: the camera (the map's metres; yaw in radians from north, as the game's player.h).
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/stop-grade', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.removeItem('bh-story-late'); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('gt-play').click());
  const E = (process.env.EYE || '366.5,-997.5,-0.35,0.62,9').split(',').map(Number);
  const frames = n => p.evaluate(n => new Promise(r => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); }), n);
  const state = () => p.evaluate(() => { const g = window.__game, s = g.story.state, d = document.getElementById('gd'); return { phase: s.phase, beat: s.beat, fi: s.fi, dlg: d && !d.hidden, order: document.getElementById('g-story-order').classList.contains('on') }; });
  // the light as the game has it now
  const light = () => p.evaluate(() => {
    const g = window.__game, A = g.atmos, L = A && A.lens ? A.lens.uniforms : null, sun = g.Wd && g.Wd.lastSun ? g.Wd.lastSun.sp.altitude : null, gl = document.getElementById('game-gl');
    return { clock: g.clock ? `${Math.floor(g.clock.min / 60)}:${String(Math.floor(g.clock.min % 60)).padStart(2, '0')}` : null, sun: sun != null ? +sun.toFixed(2) : null,
      exposure: L ? +L.uExposure.value.toFixed(3) : null, sat: L ? +L.uSat.value.toFixed(3) : null, night: L ? +L.uNightTone.value.toFixed(3) : null,
      filter: gl ? getComputedStyle(gl).filter : '', veil: +getComputedStyle(document.getElementById('g-story-veil')).opacity, post: (() => { const P = A && A.composer ? A.composer.passes : [], LU = A && A.lens ? A.lens.uniforms : {}, num = v => (v == null ? null : typeof v === 'number' ? +v.toFixed(3) : v.isVector3 || v.isColor ? [v.x ?? v.r, v.y ?? v.g, v.z ?? v.b].map(x => +x.toFixed(3)) : v.isVector4 ? [v.x, v.y, v.z, v.w].map(x => +x.toFixed(3)) : null);
    const post = { passes: P.map(q => `${(q.constructor && q.constructor.name) || '?'}${q.enabled ? '' : '(off)'}`).join(' '), trim: A && A.lens ? A.lens.trim : null, bloom: P.filter(q => q.threshold != null).map(q => [+q.threshold.toFixed(3), +q.strength.toFixed(3)]),
      lens: Object.fromEntries(['uExposure', 'uLift', 'uContrast', 'uSat', 'uVibrance', 'uTint', 'uShade', 'uHiTint', 'uShadeLift', 'uNightTone'].filter(k => LU[k]).map(k => [k, num(LU[k].value)])) }; return post; })() };
  });
  // the player and the camera at one place, the camera behind and above as the game's own chase camera is
  const hold = () => p.evaluate(E => { const g = window.__game, pl = g.player; pl.x = E[0]; pl.y = E[1]; pl.h = E[2]; if (g.cam) { g.cam.yaw = E[2]; g.cam.pitch = E[3]; g.cam.dist = E[4]; g.cam.lastInput = 1e9; } }, E);
  const shot = async name => { await hold(); await frames(6); await p.waitForTimeout(400); await hold(); await frames(3); await p.screenshot({ path: `${out}/${name}.png` }); const L = await light(); console.log(name, JSON.stringify(L)); return L; };
  const t0 = Date.now(); let was = '', inStop = false, after = false;
  while (Date.now() - t0 < 1500000) {
    const s = await state();
    const k = `${s.phase}/${s.beat}/${s.fi}/${s.dlg}`; if (k !== was) { was = k; console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`, k); }
    if (s.phase === 'dressed') { await p.keyboard.press('Space'); await p.waitForTimeout(800); continue; } // (the opening film)
    if (s.order) { await p.keyboard.press('KeyE'); await p.waitForTimeout(500); continue; } // (the job sheet)
    if (s.phase === 'stop' && s.beat === 'guide') { await p.evaluate(() => window.__game.story.skipFilm()); await p.waitForTimeout(500); continue; }
    if (s.phase === 'stop' && s.beat === 'shoot' && !inStop) { // held: the Stop's grade, then without it
      inStop = true;
      await shot('1-held');
      await p.evaluate(() => { document.querySelector('.game-stage').classList.remove('story-stop'); document.getElementById('g-story-veil').classList.remove('on'); });
      await p.waitForTimeout(2200); await shot('2-held-without-the-stop-grade');
      await p.evaluate(() => { document.querySelector('.game-stage').classList.add('story-stop'); document.getElementById('g-story-veil').classList.add('on'); });
      await p.waitForTimeout(800);
      // the photograph, from the standpoint
      await p.evaluate(() => { const g = window.__game, st = g.story.state, T = st.fr.task, pl = g.player, R = T.relic; pl.x = T.stand[0]; pl.y = T.stand[1]; pl.h = Math.atan2(R.at[0] - pl.x, R.at[1] - pl.y); if (g.cam) { g.cam.yaw = pl.h; g.cam.pitch = 0.25; } g.story.raise(true); });
      await frames(8); await p.waitForTimeout(1500);
      await p.evaluate(() => window.__game.story.shoot());
      await p.waitForTimeout(600);
      continue;
    }
    if (s.phase === 'after' && !after) {
      after = true; await p.waitForTimeout(2500); await shot('3-running-again');
      // LIGHTS=1: what each light puts on the picture, each taken away in turn (pinned at 0, whatever the frame sets it to)
      if (process.env.LIGHTS) for (const [name, what] of [['street', 'NU.uNightOn'], ['screens', 'NU.uGlowOn'], ['hero-bake', 'hero.bake'], ['hero-street', 'hero.street'], ['fill', 'fill'], ['sky', 'hemi'], ['all-four', 'NU.uNightOn,NU.uGlowOn,hero.bake,fill']]) {
        await p.evaluate(what => { const g = window.__game, H = g.hero && g.hero(), T = { 'NU.uNightOn': g.Wd.nightU.uNightOn, 'NU.uGlowOn': g.Wd.nightU.uGlowOn, 'hero.bake': H && H.light.bake, 'hero.street': H && H.light.street };
          window.__pinned = [];
          for (const k of what.split(',')) { const [o, key] = k === 'fill' ? [g.nightFill, 'intensity'] : k === 'hemi' ? [g.Wd.hemi, 'intensity'] : [T[k], 'value']; if (!o) continue; const was = o[key]; Object.defineProperty(o, key, { get: () => 0, set: () => {}, configurable: true }); window.__pinned.push([o, key, was]); }
        }, what);
        await shot(`3-running-without-${name}`);
        await p.evaluate(() => { for (const [o, key, was] of window.__pinned) { delete o[key]; o[key] = was; } });
      }
      continue;
    }
    if (s.dlg) {
      if (s.phase === 'go' && s.beat === 'prologue') { await shot('4-the-call'); break; }
      await p.keyboard.press('KeyE'); await p.waitForTimeout(350); continue;
    }
    if (s.phase === 'stop' && s.beat === 'seek') { await p.evaluate(() => { const g = window.__game, q = g.story.state.ghost; if (q) { g.player.x = q.x + 2; g.player.y = q.y; } }); }
    await p.waitForTimeout(400);
  }
  console.log(errors.length ? `${errors.length} page errors` : 'no page errors');
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
