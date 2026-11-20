// Stills of every lift's street lobby (pipeline/lobby.py, game.lobbies), at the hour of the frame that sends the player
// up it (FROM, counted from 0: 3, the fourth frame, "Take the lift, then the escalator to the roof"), and of the guide
// dog at the player's heel by the lobby's queue belts. For each lobby it takes the portal from the pavement, from
// either side, and from inside, then stands the player where the dog's place at heel is on a belt, sends him to it,
// and reports how near his body comes to a belt (his body: within GUIDE_BODY of where he stands, game.js).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/lobby_shot.js out_dir [WxH]          (FROM=3 by default)
// Exits 1 if the dog stands with a belt through him, or the page throws.
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/lobby-shot', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  const tag = w < 500 ? 'phone' : 'desktop';
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  const FROM = +(process.env.FROM || 3);
  await p.addInitScript(n => { try { localStorage.setItem('oe-story-late', JSON.stringify({ fi: n, left: 7 - n, prints: Array.from({ length: n }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, FROM);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.evaluate(() => document.getElementById('gt-play').click());
  // through the frame's card and its first words, to where the player walks to the lift
  const t0 = Date.now(); let was = '';
  while (Date.now() - t0 < 400000) {
    const s = await p.evaluate(() => { const st = window.__game.story.state, d = document.getElementById('gd'); const o = window.__game.overture(); if (o && o.active && o.skip) o.skip(); return { phase: st.phase, beat: st.beat, fi: st.fi, dlg: d && !d.hidden, film: !!(o && o.active) || !!(window.__game.cine && window.__game.cine.active) }; });
    const k = JSON.stringify(s); if (k !== was) console.log('story', k); was = k;
    if (s.dlg) { await p.keyboard.press('KeyE'); await p.waitForTimeout(350); continue; }
    if (s.phase === 'dressed') await p.evaluate(() => { const k = document.querySelector('.ov-skip'); if (k) k.click(); document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true })); }); // (the opening shots and the preface: skipped)
    if (s.phase === 'go' && s.fi === FROM && !s.film) break;
    await p.waitForTimeout(500);
  }
  const frames = n => p.evaluate(n => new Promise(r => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); }), n);
  const lobbies = await p.evaluate(() => {
    const g = window.__game, levels = (g.G.hero || []).filter(h => h.belts && h.belts.length);
    return g.lifts.map(l => l.stops[0]).filter(s => s.door).map(s => {
      const h = levels.find(q => Math.hypot(q.at[0] - s.at[0], q.at[1] - s.at[1]) < q.r + 4) || null; // (the hall's level: cities/shibuya/hero_skylobby.py)
      return { name: s.name, at: s.at, door: s.door, belts: h ? h.belts : null, level: h ? h.id : null };
    });
  });
  console.log('lobbies', JSON.stringify(lobbies));
  // the player stood at (x, y) looking at (tx, ty, tz), the camera behind them at a distance
  // (on the floor nearest the lobby's own: the street's, not the station deck over SKY's forecourt)
  const view = (x, y, tx, ty, tz, back = 3.2) => p.evaluate(([x, y, tx, ty, tz, back]) => {
    const g = window.__game, pl = g.player, nav = g.nav, f = nav.floorAt(x, y, tz - 1.4);
    pl.x = x; pl.y = y; pl.z = f ? f.z : Math.max(0, nav.terrain(x, y));
    const d = Math.hypot(tx - x, ty - y);
    pl.h = Math.atan2(tx - x, ty - y);
    if (g.cam) { g.cam.yaw = pl.h; if ('dist' in g.cam) g.cam.dist = back; g.cam.pitch = Math.max(-0.25, Math.min(0.9, 0.3 - Math.atan2(tz - (pl.z + 1.6), d))); }
  }, [x, y, tx, ty, tz, back]);
  let bad = 0;
  for (const [i, L] of lobbies.entries()) {
    const nx0 = L.at[0] - L.door[0], ny0 = L.at[1] - L.door[1], n = Math.hypot(nx0, ny0), nx = nx0 / n, ny = ny0 / n, ux = ny, uy = -nx;
    const z = L.at[2] || 0, P = (u, v) => [L.door[0] + ux * u + nx * v, L.door[1] + uy * u + ny * v];
    const shots = { street: [P(0, -9), 0], left: [P(-3.6, -8.5), 0], right: [P(3.6, -8.5), 0], threshold: [P(-0.8, 1.2), 0], inside: [P(-2.8, 3.6), 0] };
    for (const [k, [q]] of Object.entries(shots)) {
      await view(q[0], q[1], L.at[0] + nx * 1.2, L.at[1] + ny * 1.2, z + 2.6);
      await frames(4);
      // (the hall is a hero level, fetched as the player comes near: loaded and shown before the still, as scramble_shot waits)
      await p.evaluate(async () => { const g = window.__game; if (g.hero && g.hero()) for (let i = 0; i < 1200; i++) { await new Promise(r => requestAnimationFrame(r)); if (i > 3 && !g.hero().state().some(h => h.state === 'loading')) break; } });
      await p.waitForTimeout(1200);
      await p.screenshot({ path: `${out}/lobby${i}-${k}-${tag}.png` });
    }
    // the dog at heel by the belts (the level's, game.json hero[].belts: points along each, from its post to the wall):
    // the player stands beside the queue, then in it
    if (!L.belts) continue;
    const belts = L.belts, half = belts.length / 2, A = belts.slice(0, half), Bt = belts.slice(half);
    // (the frame's word with the living first, Yuna at the lift's door: her talk would start in the middle of the dog's)
    for (let i = 0; i < 80; i++) {
      const m = await p.evaluate(() => { const g = window.__game, st = g.story.state, d = document.getElementById('gd'), t = st.target; return { beat: st.beat, dlg: d && !d.hidden, t: t ? [t[0], t[1]] : null }; });
      if (m.dlg) { await p.keyboard.press('KeyE'); await p.waitForTimeout(350); continue; }
      if (m.beat !== 'meet' || !m.t) break;
      await p.evaluate(t => { const pl = window.__game.player; pl.x = t[0] + 1.8; pl.y = t[1]; pl.h = Math.atan2(-1.8, 0); }, m.t);
      await p.waitForTimeout(600);
    }
    // (where his place at heel falls on a belt: he is sent there from two metres out, and must stop short of it)
    for (const [k, q] of Object.entries({ left: A[Math.floor(A.length / 2)], right: Bt[Math.floor(Bt.length * 0.7)], end: A[1] })) {
      const front = [q[0] - nx * 2, q[1] - ny * 2];
      const r = await p.evaluate(async ([q, front, belts]) => {
        const g = window.__game, pl = g.player, nav = g.nav;
        // (a case taken up at this frame has no guide yet: he joins at a Stop. He is made as the story makes him)
        let dog = g.story.state.dog || (g.guideMade && g.guideMade());
        if (!dog && g.makeGuide) { const gd = (g.G.story.episodes || []).map(e => e.guide).find(Boolean); dog = gd && g.makeGuide(gd); }
        if (!dog) return null;
        for (let i = 0; i < 600 && !dog.ready; i++) await new Promise(r => setTimeout(r, 100));
        pl.h = Math.atan2(q[0] - front[0], q[1] - front[1]); // (facing the lift's doors, with q at heel: companion.js heel)
        pl.x = q[0] + Math.sin(pl.h) * 1.1 - Math.cos(pl.h) * 0.8; pl.y = q[1] + Math.cos(pl.h) * 1.1 + Math.sin(pl.h) * 0.8;
        const f = nav.floorAt(pl.x, pl.y, pl.z + 3); pl.z = f ? f.z : pl.z;
        if (g.cam) { g.cam.yaw = pl.h + 0.35; g.cam.pitch = 1.05; } // (from behind and above, over the queue: the lobby is no room to look back in)
        dog.place(front[0], front[1], pl.h); dog.heel();
        let worst = 9;
        const own = !g.story.state.dog; // (a guide this made is ticked here: the story ticks only its own)
        for (let i = 0; i < 90; i++) { await new Promise(r => requestAnimationFrame(r)); if (own) dog.tick(1 / 30); for (const b of belts) worst = Math.min(worst, Math.hypot(b[0] - dog.x, b[1] - dog.y)); }
        let now = 9; for (const b of belts) now = Math.min(now, Math.hypot(b[0] - dog.x, b[1] - dog.y));
        return { dog: [+dog.x.toFixed(2), +dog.y.toFixed(2)], state: dog.state, nearest: +now.toFixed(2), worst: +worst.toFixed(2), body: dog.reach || g.GUIDE_BODY || 0.7 };
      }, [q, front, belts]);
      if (!r) { console.log('no dog in this frame'); break; }
      const body = r.body || 0.7, ok = r.worst >= body - 0.04;
      if (!ok) bad++;
      console.log(ok ? 'ok  ' : 'FAIL', `lobby${i} ${k}: the dog's nearest belt ${r.nearest} m now, ${r.worst} m at worst (his body reaches ${body} m)`, JSON.stringify(r));
      await p.evaluate(() => { const g = window.__game; if (g.cam) { g.cam.yaw = g.player.h + 0.35; g.cam.pitch = 1.05; } });
      await frames(4); await p.waitForTimeout(1000);
      await p.screenshot({ path: `${out}/lobby${i}-dog-${k}-${tag}.png` });
    }
  }
  console.log(`page errors: ${errors.length}`);
  await b.close();
  process.exit(bad || errors.length ? 1 : 0);
})();
