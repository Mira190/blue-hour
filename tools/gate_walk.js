// Nagi's walk to the station's gate, in every order (issue 211: a walk's play at night in rain left her gate at 'walk'
// for good after the incident, {"ph":"up","inc":"helped","done":true,"gate":"walk","wait":false}: she never came to the
// station's front, and the walk had nowhere to go). Her story is kept told in this browser (walktalk.js's own store), the
// walk set out at 21:00 in rain, she and you put by Hachiko's wall at 0:29 (a little before the wait ends: walk_play waits from 0:20) as tools/walk_play.js does, the wait taken
// (walktalk.js wait, game.js waitWith) and the game's clock stepped until her gate is 'ask', in each case:
//   - as played: nothing between;
//   - stale: once she is up and her gate is 'walk', she is left marked as talking with no talk open (a box shut over
//     by another), which holds her steps (walktalk.js stepWalkers);
//   - held: her steps refused every frame (put back where she stood after each), as a way blocked would.
// Fails a case where her gate is not 'ask' within 60 s of the game's clock from the end of the wait (the page's own frames).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/gate_walk.js [cases=played,stale,held]
const { chromium } = require('playwright');
const [,, which = 'played,stale,held'] = process.argv;
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let fails = 0;
  for (const kind of which.split(',')) {
    const p = await b.newPage({ viewport: { width: 800, height: 500 } });
    p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
    await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', '1'); localStorage.setItem('bh-walk-talk', JSON.stringify({ last: { part: 9, met: true, done: true, inc: 'helped', rested: true } })); } catch (e) { /* storage blocked */ } });
    await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 250 });
    await p.waitForFunction(() => { const t = document.getElementById('g-title'); return t && getComputedStyle(t).opacity > 0.9; }, null, { timeout: 900000, polling: 500 });
    await p.waitForTimeout(2500); await p.keyboard.press('Space'); await p.waitForTimeout(1600);
    await p.waitForSelector('#gt-walk-go', { state: 'visible', timeout: 600000 }); await p.waitForTimeout(3000);
    await p.evaluate(() => window.__game.walkStart({ t: '21:00', w: 'rain' }));
    await p.waitForFunction(() => window.__game.player && window.__game.player.rig && window.__game.npcById('nagi'), null, { timeout: 400000 });
    await p.waitForTimeout(8000); await p.keyboard.press('Space'); await p.waitForTimeout(4000);
    const r = await p.evaluate(async kind => {
      const g = window.__game, n = g.npcById('nagi'), W = g.walkTalk();
      for (let i = 0; i < 240 && n.rig.pending; i++) await new Promise(res => setTimeout(res, 250));
      g.npcMove(n, [372.6, -1043.2]); g.setClock(g.clock.y, g.clock.m, g.clock.d, 29.5); g.spawn([n.x + 0.9, n.y + 1.6]);
      for (let i = 0; i < 20; i++) g.frame(0.05);
      if (!W.waits('nagi')) return { no: `nothing offers to wait with her (${JSON.stringify(g.walkLine())})` };
      if (!W.wait(n)) return { no: 'the wait was not taken' };
      // the wait: the night passes until a few minutes before her train, then she stands and her gate is 'walk'
      let t = 0;
      const through = () => { if (g.dlg && g.dlg.open) g.dlg.next(false); }; // (what is said read on, as a player presses on)
      for (; t < 600 && g.walkLine().gate !== 'walk' && g.walkLine().gate !== 'ask'; t += 0.05) { through(); g.frame(0.05); }
      const up = g.walkLine();
      if (up.gate !== 'walk' && up.gate !== 'ask') return { no: `the wait never ended (${JSON.stringify(up)})`, t, me: g.player.mode, dlg: !!(g.dlg && g.dlg.open), min: +g.clock.min.toFixed(1), held: g.held && g.held() };
      if (kind === 'stale') n.talking = true;
      const T = { n: 0, hid: 0, dt: 0 }, tk = W.tick; W.tick = (dt, hide) => { T.n++; if (hide) T.hid++; T.dt += dt; return tk(dt, hide); };
      // (her gate on the page's own frames: the walk's people are ticked there, not in a harness's g.frame)
      let at = null; const c0 = g.t(), w0 = Date.now();
      while (!at && g.t() - c0 < 60 && Date.now() - w0 < 600000) {
        const was = [n.x, n.y];
        through();
        await new Promise(res => requestAnimationFrame(() => res()));
        if (kind === 'held' && g.walkLine().gate === 'walk') g.npcMove(n, was); // (put back where she stood: her steps refused)
        if (g.walkLine().gate === 'ask') at = +(g.t() - c0).toFixed(1);
      }
      return { ticks: T, hide: { dlg: !!(g.dlg && g.dlg.open), cine: !!(g.cine && g.cine.active), cineLabel: g.cine && g.cine.label, paused: !!g.paused, photo: !!(g.photo && g.photo.on), talking: !!n.talking, moving: g.walkTalk().events && g.walkTalk().events.moving }, gate: g.walkLine().gate, at, her: [+n.x.toFixed(1), +n.y.toFixed(1)], me: g.player.mode, wait: +t.toFixed(0) };
    }, kind);
    const ok = r.at != null;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${kind}: ${JSON.stringify(r)}`);
    if (!ok) fails++;
    await p.close();
  }
  await b.close();
  process.exit(fails ? 1 : 0);
})();
