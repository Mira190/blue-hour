// What is heard from where: the street's sounds at a few places a player stands, on the Scramble and on SHIBUYA SKY's
// roof, through the air as audio.js reach takes them (the distance, height in it; the air; the edge between), beside
// what the street played before, when each was read in plan. The owner, on the roof: "theoretically you can't hear
// the trains up there any more". Reads the page's own reach and its world's edge (game.js), with no sound made.
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   tools/job.sh run hear -- xvfb-run -a node tools/roof_hear.js
// Exits 1 when a sound of the street below is louder than -40 dB on the roof away from its edge, or when the street's own
// sounds lose more than 3 dB where nothing stands between them and the ear.
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
(async () => {
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  const logs = [];
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); });
  await startPlay(p);
  const res = await p.evaluate(() => {
    const g = window.__game, nav = g.nav, A = window.OEAudio, G = g.G || {};
    const SND = ((G.look || {}).sound) || { at: [368.7, -1000.6], station: [430, -1070] };
    const T = (G.trains && G.trains.tracks) || [];
    const ear = (x, y, up) => { const f = nav.floorAt(x, y, 400); return { x, y, z: (up != null ? up : f ? f.z : nav.terrain(x, y)) + 2.5 }; };
    const deck = 241.8;
    const places = [
      ['the Scramble, at Hachiko', ear(380, -1028)],
      ['by the station, on the street', ear(440, -1080)],
      ['SHIBUYA SKY, the deck\'s middle', ear(541, -1124, deck)],
      ['SHIBUYA SKY, at the west glass (over the station)', ear(500, -1120, deck)],
      ['SHIBUYA SKY, at the east glass', ear(553, -1137, deck)],
    ];
    const db = v => v > 0 ? +(20 * Math.log10(v)).toFixed(1) : -Infinity;
    // the nearest point of the main line's tracks, its train's body 1.5 m over the rail
    // and points along the train either side of it, about 60 m apart (a 200 m train's cars: audio.js trainAt hears the one
    // the air and what stands between leave the most of)
    const trainNear = e => {
      let best = null, bd = Infinity;
      for (const t of T) for (let i = 0; i < t.p.length; i += 3) { const x = t.p[i] / 10, y = t.p[i + 1] / 10, z = t.p[i + 2] / 10 + 1.5, d = Math.hypot(x - e.x, y - e.y, z - e.z); if (d < bd) { bd = d; best = { x, y, z, t, i }; } }
      if (best) best.pts = [-105, -70, -35, 35, 70, 105].map(o => best.i + o * 3).filter(j => j >= 0 && j < best.t.p.length).map(j => ({ x: best.t.p[j] / 10, y: best.t.p[j + 1] / 10, z: best.t.p[j + 2] / 10 + 1.5 }));
      return best;
    };
    const stn = { x: SND.station[0], y: SND.station[1], z: nav.terrain(SND.station[0], SND.station[1]) + 4, skip: 45 }; // (as game.js crossingSound)
    const xing = { x: SND.at[0], y: SND.at[1], z: nav.terrain(SND.at[0], SND.at[1]) + 2 };
    // (what it costs: a sound's line read against the world, as trainAt reads seven a voice four times a second)
    const e0 = places[0][1], tp0 = trainNear(e0), t0 = performance.now();
    for (let k = 0; k < 200; k++) A.reach(tp0.pts[k % tp0.pts.length] || tp0, e0);
    window.__reachMs = (performance.now() - t0) / 200;
    return places.map(([name, e]) => {
      const out = { name, ear: [+e.x.toFixed(1), +e.y.toFixed(1), +e.z.toFixed(1)] };
      // the announcement: was min(1, (260 - plan distance) / 160)
      const ds = Math.hypot(e.x - stn.x, e.y - stn.y), was = ds < 260 ? Math.min(1, (260 - ds) / 160) : 0, R = A.reach(stn, e);
      out.announce = { was: db(was), now: db(R.d < 260 ? Math.min(1, (260 - R.d) / 160) * R.g : 0), d: +R.d.toFixed(0), delta: +R.delta.toFixed(2), fc: Math.round(R.fc), edge: R.edge };
      // the nearest train passing: was (1 - near / 240)^2.2 on the distance through the air, no edge
      const tp = trainNear(e);
      if (tp) {
        const lv = d => Math.pow(Math.max(0, 1 - d / 240), 2.2) * (1 + 0.6 * Math.max(0, 1 - d / 30)), R0 = A.reach(tp, e);
        let Rt = R0, bv = lv(R0.d) * R0.g, bq = tp;
        for (const q of tp.pts) { const P = A.reach(q, e), v = lv(P.d) * P.g; if (v > bv) { bv = v; Rt = P; bq = q; } }
        out.train = { was: db(lv(R0.d)), now: db(Math.min(lv(R0.d), bv)), d: +Rt.d.toFixed(0), delta: +Rt.delta.toFixed(2), fc: Math.round(Rt.fc), edge: Rt.edge, at: [+bq.x.toFixed(1), +bq.y.toFixed(1), +bq.z.toFixed(1)] };
      }
      // a honk on the crossing below: was max(0.15, 1 - plan distance / 40) of whoever it honked at
      const Rh = A.reach(xing, e);
      out.crossing = { now: db(Rh.d < 90 ? Math.max(0.15, 1 - Rh.d / 40) * Math.min(1, (90 - Rh.d) / 40) * Rh.g : 0), d: +Rh.d.toFixed(0), delta: +Rh.delta.toFixed(2), fc: Math.round(Rh.fc), edge: Rh.edge };
      return out;
    });
  });
  const ms = await p.evaluate(() => window.__reachMs);
  console.log(`a sound's line read against the world: ${ms.toFixed(3)} ms (trains at most 3 x 7 x 4 a second: ${(ms * 84).toFixed(1)} ms a second, here)`);
  let bad = 0;
  for (const r of res) {
    console.log(`${r.name} (ear at ${r.ear})`);
    for (const k of ['announce', 'train', 'crossing']) {
      const v = r[k];
      if (!v) continue;
      console.log(`   ${k.padEnd(9)} ${v.was != null ? `was ${String(v.was).padStart(6)} dB, ` : ''}now ${String(v.now).padStart(6)} dB  (${v.d} m through the air, ${v.delta > 0 ? `${v.delta} m round the edge at ${v.edge}` : 'in the open'}, highs from ${v.fc} Hz)${v.at ? `, from ${v.at}` : ''}`);
      const roof = /SHIBUYA SKY/.test(r.name), edge = /glass/.test(r.name);
      if (roof && !edge && v.now > -40) { bad++; console.log(`   FAIL: heard on the roof at ${v.now} dB`); }
      if (!roof && v.was != null && v.was > -30 && v.delta <= 0 && v.now < v.was - 3) { bad++; console.log(`   FAIL: the street's own sound lost ${(v.was - v.now).toFixed(1)} dB in the open`); }
    }
  }
  if (logs.length) console.log(logs.join('\n'));
  await b.close();
  process.exit(bad || logs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
