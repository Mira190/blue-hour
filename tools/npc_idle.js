// What the named people do while nobody talks to them, and while they talk (the owner, 22 November 2026: "the people
// with a speech bubble over their heads keep talking to themselves"). On the walk the title's second way in sets out
// (the blue hour, clear; the clock at 17:57, the owner's hour), and with the world stepped a thirtieth of a second at a
// time it records, for every one of the map's named people out on the street (game.json npcs) and a living person of
// the story's (game.js storyFigure):
//   alone: the player 60 m off, SECS (default 40) of the game: every clip each plays. It fails on a gesture made to
//     someone (Talk, Listen, Present, Thoughtful, Nod, Cheer) played alone, and on someone who stood in one clip all
//     through with nothing else (a waiting person looks round now and then: Idle and Idle_Neutral people must have
//     looked round once, LookAround, in the time; a phone, a camera or a drink is its own waiting).
//   near: the player three metres in front, three seconds: their head comes to you (rig.lookTarget is you), still no
//     gesture, and the body turned no further than the head cannot reach.
//   talk: each one with something to say (walktalk.js want) talked to through the walk's own talk, the box stepped on
//     every 2.5 s: the speaker plays Talk (after a nod hello) while their line is said; in a talk of two (a street
//     moment's couple, photo-couple) the one not speaking plays Listen and looks at the speaker. After the talk they
//     wait again (no gesture a few seconds on).
//   story: a living figure of the story talked to in the story's box (talking while the line is said), then alone.
// It writes a JSON report beside its stills when OUT is given (OUT=dir: a still of Aoi every 1.2 s alone, from a camera
// a pace off, the player out of the frame).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/npc_idle.js [secs]      PHONE=1: a phone's page (390x844, touch); OUT=dir: stills and report
const { chromium, devices } = require('playwright');
const fs = require('fs');
const [,, secs = '40'] = process.argv;
const MIN = +(process.env.MIN || 17 * 60 + 57), PHONE = !!process.env.PHONE, OUT = process.env.OUT || '';
const GESTURE = ['Talk', 'Listen', 'Present', 'Thoughtful', 'Nod', 'Cheer'];
(async () => {
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(PHONE ? { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await p.addInitScript(() => {
    try { localStorage.setItem('bh-onboard', '1'); localStorage.setItem('bh-quality', 'high'); localStorage.removeItem('bh-walk-talk'); if (!sessionStorage.getItem('bh-idle-once')) { sessionStorage.setItem('bh-idle-once', '1'); sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t: 'blue', w: 'clear' })); } } catch (e) { /* storage blocked */ }
  });
  const errs = [];
  p.on('pageerror', e => { errs.push(String(e).slice(0, 300)); console.log(`pageerror: ${String(e).slice(0, 300)}`); });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 600000, polling: 500 });
  const t0 = Date.now();
  for (;;) { // set out: the walk's opening skipped by a key, as a player may
    const s = await p.evaluate(() => { const g = window.__game, o = g.overture && g.overture(); return { on: document.getElementById('game-stage').classList.contains('walk-on'), film: !!(o && o.active) }; });
    if (s.on && !s.film) break;
    if (s.film) await p.keyboard.press('Space');
    if (Date.now() - t0 > 600000) throw new Error('the walk did not set out');
    await p.waitForTimeout(1000);
  }
  // every named person's character come, before anything is measured (a stand-in plays no clip of theirs), while the
  // page still draws frames (a model is readied on one)
  await p.evaluate(() => Promise.all(window.__game.npcs.map(n => window.__game.npcLoad(n)))); // (the street moments' too, away till one starts)
  await p.evaluate(([min]) => {
    window.requestAnimationFrame = () => 0;
    const g = window.__game;
    g.setClock(g.clock.y, g.clock.m, g.clock.d, min); g.clock.scale = 1;
    if (g.cine && g.cine.active) g.cine.skip();
    window.__idle = {
      out: n => { const me = g.player, a = Math.atan2(n.x - 330, n.y + 1060); me.x = n.x - Math.sin(a) * 60; me.y = n.y - Math.cos(a) * 60; me.z = g.nav.terrain(me.x, me.y); },
      clip: r => (r && r.clipName ? r.clipName() : null),
    };
  }, [MIN]);
  const report = { at: `${Math.floor(MIN / 60)}:${String(MIN % 60).padStart(2, '0')}`, phone: PHONE, alone: {}, near: {}, talk: {}, story: {}, fails: [] };
  const fail = m => { report.fails.push(m); console.log(`FAIL ${m}`); };

  // ---- alone: the player far off, every clip each named person plays
  const step = (s, every = 0.25) => p.evaluate(([s, every]) => {
    const g = window.__game, seen = {};
    for (let t = 0; t < s; t += 1 / 30) {
      g.advance(1 / 30);
      if (Math.abs((t / every) - Math.round(t / every)) < 0.017) for (const n of g.npcs) if (!n.away) { const c = window.__idle.clip(n.rig); (seen[n.id] = seen[n.id] || {})[c] = (seen[n.id][c] || 0) + 1; }
    }
    return seen;
  }, [s, every]);
  await p.evaluate(() => { const g = window.__game, me = g.player; me.x = 250; me.y = -900; me.z = g.nav.terrain(250, -900); }); // (away from all of them, on Dogenzaka's foot)
  const stills = [];
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    // Aoi alone: a still every 1.2 s from a camera a pace off her front
    await p.evaluate(() => {
      const g = window.__game, T = window.THREE, n = g.npcs.find(q => q.id === 'aoi'), S = window.__idleCam = { pos: new T.Vector3(), look: new T.Vector3() };
      const hd = n.h + 0.5; S.pos.set(n.x + Math.sin(hd) * 3.4, n.z + 1.5, -(n.y + Math.cos(hd) * 3.4)); S.look.set(n.x, n.z + 1.1, -n.y);
      g.cine.stop(); g.cine.play(() => S, 1e9, { label: 'film' });
    });
    for (let i = 0; i < 6; i++) { await step(1.2); const f = `${OUT}/aoi_alone_${i}.png`; await p.screenshot({ path: f }); stills.push(f); }
    await p.evaluate(() => window.__game.cine.stop());
  }
  const alone = await step(+secs);
  for (const [id, seen] of Object.entries(alone)) {
    const n = await p.evaluate(id => { const n = window.__game.npcs.find(q => q.id === id); return { name: n.name, clip: n.look.clip || null, pending: !!n.rig.pending }; }, id);
    report.alone[id] = { name: n.name, cast: n.clip, played: seen };
    const g = Object.keys(seen).filter(c => GESTURE.includes(c));
    if (g.length) fail(`${n.name} alone played ${g.join(', ')}`);
    const k = Object.keys(seen);
    if (!n.pending && k.length === 1 && /^Idle/.test(k[0])) fail(`${n.name} alone stood in ${k[0]} all through, never looked round`);
    console.log(`alone  ${n.name.padEnd(22)} cast ${String(n.clip).padEnd(13)} played ${JSON.stringify(seen)}`);
  }

  // ---- near: the player three metres in front of each
  const ids = Object.keys(alone);
  for (const id of ids) {
    const r = await p.evaluate(id => {
      const g = window.__game, n = g.npcs.find(q => q.id === id), me = g.player;
      const h0 = n.h, a = h0 + 0.8; // (in front and to one side: the head turns, the body only what the head cannot take)
      me.x = n.x + Math.sin(a) * 3; me.y = n.y + Math.cos(a) * 3; me.z = n.z; me.h = Math.atan2(n.x - me.x, n.y - me.y);
      const seen = {};
      for (let t = 0; t < 3; t += 1 / 30) { g.advance(1 / 30); me.x = n.x + Math.sin(a) * 3; me.y = n.y + Math.cos(a) * 3; const c = window.__idle.clip(n.rig); seen[c] = (seen[c] || 0) + 1; }
      const want = Math.atan2(me.x - n.x, me.y - n.y), off = Math.atan2(Math.sin(want - n.h), Math.cos(want - n.h));
      const look = n.rig.lookTarget ? Math.hypot(n.rig.lookTarget.x - me.x, -n.rig.lookTarget.z - me.y) : null;
      window.__idle.out(n);
      return { name: n.name, played: seen, looks: look != null && look < 0.5, headLeft: +(off * 180 / Math.PI).toFixed(0), turned: +(Math.atan2(Math.sin(n.h - h0), Math.cos(n.h - h0)) * 180 / Math.PI).toFixed(0), stand: !!n.stand, sit: !!n.sit };
    }, id);
    report.near[id] = r;
    const g = Object.keys(r.played).filter(c => GESTURE.includes(c));
    if (g.length) fail(`${r.name} near played ${g.join(', ')}`);
    if (!r.looks && !r.sit) fail(`${r.name} near did not look at you`);
    console.log(`near   ${r.name.padEnd(22)} looks ${r.looks} head left ${r.headLeft}° body turned ${r.turned}° played ${JSON.stringify(r.played)}`);
  }

  // ---- talk: each with something to say, through the walk's own talk; and a street moment's couple
  const talk = (id, ev) => p.evaluate(([id, ev]) => {
    const g = window.__game, W = g.walkTalk(), me = g.player;
    if (ev && !W.events.start(ev, 0)) return { skip: `no ${ev}` };
    const n = g.npcs.find(q => q.id === id);
    for (let t = 0; t < 1; t += 1 / 30) g.advance(1 / 30); // (put out, and drawn)
    const a = n.h; me.x = n.x + Math.sin(a) * 1.8; me.y = n.y + Math.cos(a) * 1.8; me.z = n.z; me.h = Math.atan2(n.x - me.x, n.y - me.y);
    if (!W.want(id) || !W.talk(n)) return { skip: 'nothing to say' };
    const by = {}, look = {};
    for (let t = 0, nx = 2.5; t < 40 && g.dlg.open; t += 1 / 30) {
      g.advance(1 / 30);
      for (const m of g.npcs) if (!m.away && Math.hypot(m.x - n.x, m.y - n.y) < 4) {
        const st = m.talking ? 'speaking' : m.listening ? 'listening' : 'by', c = window.__idle.clip(m.rig), k = `${m.id}:${st}`;
        (by[k] = by[k] || {})[c] = (by[k][c] || 0) + 1;
        if (st === 'listening' && m.rig.lookTarget) { const s = m.listening; look[m.id] = Math.hypot(m.rig.lookTarget.x - s.x, -m.rig.lookTarget.z - s.y) < 0.5; }
      }
      if (t >= nx) { nx += 2.5; g.dlg.next(false, true); }
    }
    const after = {};
    for (let t = 0; t < 6; t += 1 / 30) { g.advance(1 / 30); if (t > 2) { const c = window.__idle.clip(n.rig); after[c] = (after[c] || 0) + 1; } }
    window.__idle.out(n);
    return { name: n.name, by, looksAtSpeaker: look, after, open: g.dlg.open };
  }, [id, ev]);
  const talks = ids.map(id => [id, null]).concat([['chloe', 'photo-couple']]);
  for (const [id, ev] of talks) {
    if (ev) { // (a street moment's people put out, and their characters come, before the talk)
      const ok = await p.evaluate(ev => window.__game.walkTalk().events.start(ev, 0), ev);
      if (!ok) { console.log(`talk   ${ev}: not started`); continue; }
    }
    const r = await talk(id, null);
    report.talk[ev || id] = r;
    if (r.skip) { console.log(`talk   ${id}: ${r.skip}`); continue; }
    if (r.open) await p.evaluate(() => window.__game.dlg.quit());
    for (const [k, seen] of Object.entries(r.by)) {
      const [who, st] = k.split(':'), c = Object.keys(seen);
      if (st === 'speaking' && !c.includes('Talk')) fail(`${who} spoke without talking (${c.join(', ')})`);
      if (st === 'listening' && !c.includes('Listen')) fail(`${who} listened without listening (${c.join(', ')})`);
      if (st === 'by' && c.some(x => GESTURE.includes(x))) fail(`${who} stood by a talk not theirs and played ${c.filter(x => GESTURE.includes(x)).join(', ')}`);
    }
    for (const [who, ok] of Object.entries(r.looksAtSpeaker)) if (!ok) fail(`${who} listened looking away from the speaker`);
    const g = Object.keys(r.after).filter(c => GESTURE.includes(c));
    if (g.length) fail(`${r.name} after the talk played ${g.join(', ')}`);
    console.log(`talk   ${(ev || id).padEnd(22)} ${JSON.stringify(r.by)} listener looks ${JSON.stringify(r.looksAtSpeaker)} after ${JSON.stringify(r.after)}`);
  }

  // ---- story: a living person of the story, talked to in the story's box, and then alone
  report.story = await p.evaluate(() => {
    const g = window.__game, me = g.player, f = g.storyFigure({ alive: true, name: 'Kenji (a check)', character: g.npcs.find(q => q.id === 'oda').look.character }, [me.x + 2, me.y, me.z]);
    const seen = { talk: {}, alone: {} };
    let closed = false;
    // (the box as the story's say opens it, its done wrapped by game.js talking: the one who says it found by name)
    g.dlg.show({ name: f.name, alive: true }, ['A line of the story.', 'And another.'], null, g.storyTalking({ name: f.name }, () => { closed = true; }));
    for (let t = 0, nx = 2; t < 8 && !closed; t += 1 / 30) { g.advance(1 / 30); f.animate(1 / 30); const c = f.rig.clipName(); seen.talk[c] = (seen.talk[c] || 0) + 1; if (t >= nx) { nx += 2; g.dlg.next(false, true); } }
    if (g.dlg.open) g.dlg.quit();
    for (let t = 0; t < 4; t += 1 / 30) { g.advance(1 / 30); f.animate(1 / 30); if (t > 1) { const c = f.rig.clipName(); seen.alone[c] = (seen.alone[c] || 0) + 1; } }
    f.remove();
    return { via: 'the story\'s box', ...seen };
  });
  if (!Object.keys(report.story.talk).includes('Talk')) fail(`the story's figure spoke without talking (${Object.keys(report.story.talk).join(', ')})`);
  if (Object.keys(report.story.alone).some(c => GESTURE.includes(c))) fail(`the story's figure alone played ${Object.keys(report.story.alone).join(', ')}`);
  console.log(`story  via ${report.story.via}: talking ${JSON.stringify(report.story.talk)} alone ${JSON.stringify(report.story.alone)}`);

  report.errors = errs;
  if (OUT) fs.writeFileSync(`${OUT}/npc_idle.json`, JSON.stringify(report, null, 1));
  console.log(report.fails.length ? `npc_idle: ${report.fails.length} fail(s)` : 'npc_idle: ok');
  await b.close();
  process.exit(report.fails.length || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
