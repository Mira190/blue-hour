// Every place the story puts someone or sends the player (the living cast, each afterimage, where a picture is taken
// from, where the world stops, where a car or a flight sets you down, the people met) stands on a floor at its own
// height and can be walked on: not in a wall, a building, a fence or the air. And the things of 1964 that stand in
// tonight's street (not those drawn through what was built since) stand on ground too. Prints one line a place and
// exits 1 if any fails.
//   python3 -m http.server 8800 --directory web &
//   NODE_PATH=$(npm root -g) node tools/story_clear.js        (GPU=metal on a Mac; PORT for another server)
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
(async () => {
  const b = await chromium.launch({ args: process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu'] : ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'], headless: !process.env.DISPLAY });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  await p.addInitScript(() => { try { localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); });
  await startPlay(p);
  const out = await p.evaluate(async () => {
    const g = window.__game, nav = g.nav, S = (await (await fetch('data/shibuya/game.json')).json()), story = S.story, pts = [];
    const add = (name, at, kind) => { if (at) pts.push({ name, at, kind: kind || 'stand' }); };
    for (const ep of story.episodes) {
      for (const c of ep.cast || []) add(`cast ${c.id}`, c.at);
      if (ep.guide) add('guide from', ep.guide.from);
      ep.frames.forEach((f, i) => {
        const n = `frame ${i + 1}`;
        if (f.afterimage) add(`${n} afterimage`, f.afterimage.at);
        if (f.afterimage2) add(`${n} afterimage2`, f.afterimage2.at);
        add(`${n} stop_at`, f.stop_at); add(`${n} cross_to`, f.cross_to);
        if (f.ride) add(`${n} ride.to`, f.ride.to);
        if (f.flight && f.flight.end) add(`${n} flight end`, f.flight.end.at);
        if (f.meet && f.meet.npc) { const q = (S.npcs || []).find(x => x.id === f.meet.npc); if (q) add(`${n} meets ${q.id}`, q.at); }
        const T = f.task || {};
        add(`${n} stand`, T.stand);
        if (T.relic) for (const r of [T.relic].concat(T.relic.with || [])) if (!T.relic.over) add(`${n} relic ${r.model}`, r.at, 'thing');
      });
    }
    const res = [];
    for (const q of pts) {
      const [x, y, z] = q.at; nav.prefetch(x, y, 24, Infinity);
      const f = nav.floorAt(x, y, (z != null ? z : nav.terrain(x, y)) + 0.6), fz = f ? f.z : null, want = z != null ? z : fz;
      let why = '';
      if (fz == null) why = 'no floor';
      else if (Math.abs(fz - want) > 0.35) why = `the floor is at ${fz.toFixed(2)}, not ${want.toFixed(2)}`;
      else if (q.kind === 'stand') {
        const w = nav.walk(x, y, fz, true);
        if (!w.ok) why = `cannot be stood on (${w.why || 'blocked'})`;
        else { let open = 0; for (let a = 0; a < 8; a++) { const m = nav.slide(x, y, fz, Math.sin(a * Math.PI / 4) * 0.5, Math.cos(a * Math.PI / 4) * 0.5); if (Math.hypot(m.x - x, m.y - y) > 0.42) open++; } if (open < 3) why = `walled in (${open} of 8 ways open)`; }
      }
      res.push({ name: q.name, at: q.at, floor: f ? f.kind : '', why });
    }
    return res;
  });
  let bad = 0;
  for (const r of out) { console.log(`${r.why ? 'FAIL' : 'ok  '} ${r.name.padEnd(24)} ${JSON.stringify(r.at)} ${r.floor}${r.why ? `: ${r.why}` : ''}`); if (r.why) bad++; }
  for (const e of errors) console.log(`pageerror: ${e}`);
  console.log(`${bad ? 'FAIL' : 'ok  '} story places: ${out.length - bad} of ${out.length} clear`);
  await b.close();
  process.exit(bad || errors.length ? 1 : 0);
})();
