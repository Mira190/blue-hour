// The street's own people (issue 168; web/game/regulars.js, game.json `regulars`), checked and photographed: on the walk
// (?walk=1), each routine is read as the page reads it, and
//   - every place a routine stands at is ground a body can stand on, off the carriageway, and every leg between two
//     places can be walked in a straight line every half metre, off the carriageway (a routine walks straight: it does
//     not know a crossing's lights);
//   - just after each row's minute and just before the next, under a clear sky and in the rain, you are stood 75 m
//     off and then ten, your back to the place and then facing it, the world stepped: the person is lent a walker of
//     the crowd and stands (or walks) where the clock puts them, and no more than `cap` are lent at once; a row that is off, or not for that sky, has nobody there;
//   - beyond reach they are given back (nobody lent with you 400 m away);
//   - with an out_dir, a still of each from ten metres at each of their hours: an evening of each, side by side
//     (tools/contact_sheet.py).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/regulars_play.js [out_dir] [WxH, default 1440x900; 390x844: a phone]
//   ONLY=id,id   MAP=x0,y0,w,h (prints the ground there, 2 m a letter: . to stand on, = carriageway, # not)
// Fails (exit 1) on any of the above.
const { chromium } = require('playwright');
const fs = require('fs');
const { startPlay } = require('./start_play');
const { whole } = require('./draw_skip');
const out = process.argv[2] && !/^\d+x\d+$/.test(process.argv[2]) ? process.argv[2] : null;
const size = process.argv.find(a => /^\d+x\d+$/.test(a)) || '1440x900';
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  if (out) fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('bh-quality', 'high'); } catch (e) { /* storage blocked */ } });
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 400000 });
  await startPlay(p);
  await p.evaluate(() => { const O = window.OEOnboard, t = O && O.current && O.current(); if (t) t.skip(); }); // (no first-time tour over the stills)
  let fails = 0;
  const fail = m => { fails++; console.log(`FAIL ${m}`); }, ok = m => console.log(`ok   ${m}`);
  if (process.env.MAP) {
    const rows = await p.evaluate(([x0, y0, W, H]) => {
      const g = window.__game, road = g.crowd.crossings.road, o = [];
      for (let y = y0 + H; y >= y0; y -= 2) { let s = ''; for (let x = x0; x <= x0 + W; x += 2) { const q = g.nav.walk(x, y, g.nav.terrain(x, y) + 0.6, true); s += !q.ok || !g.nav.room(x, y, q.z, 0.3) ? '#' : road(x, y) ? '=' : '.'; } o.push(`${String(y).padStart(6)} ${s}`); }
      return o;
    }, process.env.MAP.split(',').map(Number));
    console.log(rows.join('\n'));
    await b.close();
    return;
  }
  // the routines as the page holds them, and the ground under each place and leg
  const R = await p.evaluate(() => {
    const g = window.__game, reg = g.regulars && g.regulars();
    if (!reg) return null;
    const road = g.crowd.crossings.road, stand = (x, y) => { const q = g.nav.walk(x, y, g.nav.terrain(x, y) + 0.6, true); return !q.ok ? 'no ground to stand on' : !g.nav.room(x, y, q.z, 0.3) ? 'no room for a body' : road(x, y) ? 'in the carriageway' : ''; };
    return { cap: reg.cap, IN: reg.IN, people: reg.people.map(r => {
      const bad = [];
      const rows = r.rows.filter(q => q.at);
      r.rows.forEach((q, i) => { if (q.at) { const e = stand(q.at[0], q.at[1]); if (e) bad.push(`row ${i} (${q.at}): ${e}`); } });
      // (legs: between the places of rows that follow each other under one sky)
      for (const sky of ['dry', 'rain']) {
        const S = r.rows.filter(q => !q.if || q.if === sky);
        for (let i = 0; i + 1 < S.length; i++) {
          const a = S[i], c = S[i + 1];
          if (!a.at || !c.at || a.off) continue;
          const len = Math.hypot(c.at[0] - a.at[0], c.at[1] - a.at[1]);
          for (let d = 0.5; d < len; d += 0.5) { const e = stand(a.at[0] + (c.at[0] - a.at[0]) * d / len, a.at[1] + (c.at[1] - a.at[1]) * d / len); if (e) { bad.push(`the way from (${a.at}) to (${c.at}), ${d.toFixed(1)} m along (${sky}): ${e}`); break; } }
        }
      }
      return { id: r.id, who: r.who, bad, rows: r.rows.map(q => ({ t: q.t, vary: q.vary, at: q.at, off: q.off, if: q.if })) };
    }) };
  });
  if (!R) { console.log('FAIL the page has no regulars (game.json regulars, regulars.js)'); await b.close(); process.exit(1); }
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  for (const r of R.people) { if (r.bad.length) for (const e of r.bad) fail(`${r.id}: ${e}`); else ok(`${r.id}: ${r.rows.filter(q => q.at).length} places, each to stand on, each leg walked straight`); }
  const hm = m => { const k = Math.round(m) % 1440; return `${String(Math.floor(k / 60)).padStart(2, '0')}${String(k % 60).padStart(2, '0')}`; };
  let most = 0;
  for (const r of R.people) {
    if (only && !only.includes(r.id)) continue;
    for (const sky of ['clear', 'rain']) {
      if (sky === 'rain' && !r.rows.some(q => q.if)) continue; // (the same in the rain: once is enough)
      // (tonight's minutes of its rows, the date's draw in them: just after each, and just before the next, on the way)
      const rows = await p.evaluate(([id, wet]) => window.__game.regulars().when(id, wet), [r.id, sky === 'rain']);
      const times = [];
      rows.forEach((q, i) => { times.push(q.t + (q.off ? 1.5 : 0.3)); if (rows[i + 1] && !q.off && rows[i + 1].t - q.t > 1) times.push(rows[i + 1].t - 0.4); });
      for (const t of times) {
        const res = await p.evaluate(async ([id, t, sky]) => {
          const g = window.__game, me = g.player, reg = g.regulars();
          g.setClock(g.clock.y, g.clock.m, g.clock.d, t % 1440); g.clock.scale = 1;
          if (g.weather && g.weather.state.mode !== sky && !(sky === 'clear' && !/rain|drizzle|storm/.test(g.weather.state.mode || ''))) g.weather.set(sky, { now: true });
          const put = (x, y) => { me.x = x; me.y = y; me.z = g.nav.terrain(x, y); };
          // (far off first: whoever was lent is given back)
          put(-2000, -2500); for (let k = 0; k < 10; k++) g.advance(0.2);
          const none = reg.live().length;
          g.setClock(g.clock.y, g.clock.m, g.clock.d, t % 1440);
          for (let k = 0; k < 10; k++) g.advance(0.2); // (the rain eased on)
          const pl = reg.plan(id, g.clock.min, sky === 'rain');
          if (!pl) return { none, gone: true, wet: g.weather ? g.weather.state.rain : 0 };
          // a place to stand 75 m off, then 10 m off: the first of eight ways round with ground under it
          const spot = d => { for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8 + 0.4, x = pl.x + Math.sin(a) * d, y = pl.y + Math.cos(a) * d, q = g.nav.walk(x, y, g.nav.terrain(x, y) + 0.6, true); if (q.ok && Math.abs(q.z - g.nav.terrain(pl.x, pl.y)) < 3) return [x, y]; } return [pl.x + d, pl.y]; };
          const far = spot(75), near = spot(10);
          put(far[0], far[1]);
          for (let k = 0; k < 40; k++) { g.advance(0.2); put(far[0], far[1]); }
          const live = reg.live(), who = live.find(q => q.id === id), now = reg.plan(id, g.clock.min, sky === 'rain');
          // (ten metres off with your back to them first: of all the routines in reach the nearest are lent, where the
          // camera is not looking; then you turn round)
          put(near[0], near[1]);
          const hTo = Math.atan2(pl.x - near[0], pl.y - near[1]);
          me.h = hTo + Math.PI;
          Object.assign(g.cam, { mode: 'chase', yaw: me.h, pitch: 0.1, dist: 3.2, distTo: 0, yawTo: null, lastInput: -10 });
          for (let k = 0; k < 30; k++) { g.advance(0.2); put(near[0], near[1]); }
          const now1 = reg.plan(id, g.clock.min, sky === 'rain') || pl;
          me.h = Math.atan2(now1.x - near[0], now1.y - near[1]);
          Object.assign(g.cam, { yaw: me.h, yawTo: null, lastInput: -10 });
          for (let k = 0; k < 6; k++) { g.advance(0.2); put(near[0], near[1]); }
          const who2 = reg.live().find(q => q.id === id), now2 = reg.plan(id, g.clock.min, sky === 'rain');
          return { none, n: live.length, lent: !!who, off: who && now ? Math.hypot(who.x - now.x, who.y - now.y) : null, off2: who2 && now2 ? Math.hypot(who2.x - now2.x, who2.y - now2.y) : null, walking: !!(now && now.to), wet: g.weather ? g.weather.state.rain : 0 };
        }, [r.id, t, sky]);
        const at = `${r.id} at ${hm(t)} (${sky})`;
        if (res.none) fail(`${at}: ${res.none} still lent with you two kilometres away`);
        if (res.gone) { ok(`${at}: indoors, nobody there`); continue; }
        most = Math.max(most, res.n);
        if (res.n > R.cap) fail(`${at}: ${res.n} lent at once (the cap is ${R.cap})`);
        if (res.off2 == null) fail(`${at}: nobody is lent to the routine with you ten metres from where the clock puts them`);
        else if (res.off2 > (res.walking ? 12 : 1.5)) fail(`${at}: ${res.off2.toFixed(1)} m from where the clock puts them`);
        else ok(`${at}: ${res.walking ? 'on the way' : 'standing'}, ${res.off2.toFixed(1)} m from where the clock puts them (${res.n} lent)`);
        if (out && res.off2 != null) {
          // (the still through the game's photo mode, from where you stand, a little to the side, at eye height, on
          // the person: the one you play out of the picture, as tools/game_shot.js takes its eye views)
          await p.evaluate(id => {
            const g = window.__game, me = g.player, w = g.regulars().live().find(q => q.id === id);
            if (!w) return;
            // (the eye 7 m off at head height, on ground a body can stand on, with nothing solid between it and them: the
            // first such of sixteen ways round, starting from where you stood, a little to the side)
            const gz = g.nav.terrain(w.x, w.y), a0 = Math.atan2(me.x - w.x, me.y - w.y) + 0.35;
            let ex = me.x, ey = me.y;
            for (let k = 0; k < 16; k++) {
              const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 8, x = w.x + Math.sin(a) * 7, y = w.y + Math.cos(a) * 7, q = g.nav.walk(x, y, gz + 0.6, true);
              if (!q.ok || Math.abs(q.z - gz) > 1 || !g.nav.room(x, y, q.z, 0.4)) continue;
              let clear = true;
              for (let j = 1; j < 14 && clear; j++) { const f = j / 14; if (g.nav.solid(x + (w.x - x) * f, y + (w.y - y) * f, gz + 1.5, 0.15)) clear = false; }
              if (clear) { ex = x; ey = y; break; }
            }
            g.photoMode(true);
            const P = g.photo, lz = gz + 1.2, ez = gz + 1.65, ddx = ex - w.x, ddy = ey - w.y, hh = ez - lz, dd = Math.hypot(ddx, ddy);
            P.focus.set(w.x, lz, -w.y); P.anchor.copy(P.focus);
            Object.assign(P, { az: Math.atan2(ddx, ddy), pitch: Math.atan2(hh, dd), dist: Math.hypot(dd, hh), fstop: 16 });
            me.rig.root.visible = false;
            g.advance(0.1);
          }, r.id);
          // (the canvas alone: the game's picture, without the photo mode's panel or the walk's corner over it)
          await p.evaluate(() => { const st = document.createElement('style'); st.id = 'rp-still'; st.textContent = 'body *:not(#game-gl):not(:has(#game-gl)) { visibility: hidden !important; }'; document.head.appendChild(st); });
          await whole(p, () => p.screenshot({ path: `${out}/${phone ? 'phone' : 'desk'}-${r.id}-${sky === 'rain' ? 'rain-' : ''}${hm(t)}.png`, timeout: 120000 })).catch(e => console.log(`(no still of ${at}: ${String(e).slice(0, 120)})`));
          await p.evaluate(() => { const st = document.getElementById('rp-still'); if (st) st.remove(); });
          await p.evaluate(() => { const g = window.__game; g.photoMode(false); g.player.rig.root.visible = true; });
        }
      }
    }
  }
  console.log(`${fails ? `FAIL ${fails}` : 'ok  '} the street's own people: ${R.people.length} routines, at most ${most} lent at once (cap ${R.cap})`);
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
