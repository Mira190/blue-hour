// Walkers who walk far and get nowhere (issue 168): two men under the deck east of the Scramble walked a few metres one
// way, turned, and walked back, again and again. A walker who turns back on themselves is one whose way is closed: a
// path that runs into something the walk-mesh does not know, or a place that cannot be reached, so the steering gives
// way, plans again to the same place, and gives way again. This measures it over the level instead of waiting for it
// to be seen: on the walk (?walk=1), at each hour, you are stood at each of a grid of stations with the world stepped
// a tenth of a second at a time, and each walker of the crowd is followed by its id. Over every WINDOW seconds (30) a
// walker's path (the ground covered) is set against its net progress (how far it is from where the window began): one
// who has covered more than FAR metres (12) and ended within NEAR (4) of where it began, having turned round at least
// twice, has paced. Each is printed with the place, the footway line, what turned it (the crowd's own reason, where
// it gives one) and how often; places within 6 m of each other are one place.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/crowd_pacing.js [WxH, default 1440x900; 390x844: a phone, inside its district] [seconds per station, 90]
//   HOURS=17.98,21 (default 8,12.5,17.98,21,23.5)   AT=450,-1000 (one station; default the level's grid)   SKY=rain
//   OUT=file.json: the list, for a before and an after
// Fails (exit 1) on a place where someone paced two windows running (a minute to and fro) or turned four times in one;
// a single window is printed as "once" (a walker who steps back from a car and comes on again: a street's life).
const { chromium } = require('playwright');
const fs = require('fs');
const { startPlay } = require('./start_play');
const size = /^\d+x\d+$/.test(process.argv[2] || '') ? process.argv[2] : '1440x900';
const secs = +(process.argv[3] || 90);
const HOURS = (process.env.HOURS || '8,12.5,17.98,21,23.5').split(',').map(Number);
const WINDOW = +(process.env.WINDOW || 30), FAR = +(process.env.FAR || 12), NEAR = +(process.env.NEAR || 4);
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', '1'); } catch (e) { /* storage blocked */ } });
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 400000 });
  await startPlay(p);
  // the stations: one at the Scramble, one where the two men were seen, and a grid over the level (a phone's district,
  // which a desktop's level holds too), each moved to the nearest footway and left out where none is within 150 m
  const stations = await p.evaluate(at => {
    window.requestAnimationFrame = () => 0;
    const g = window.__game, net = g.crowdNet, tmp = {};
    const want = at ? [[at[0], at[1], 'asked']] : [[368, -1002, 'scramble'], [452, -1000, 'east deck']];
    if (!at) for (let x = -50; x <= 1150; x += 400) for (let y = -1900; y <= 300; y += 400) want.push([x, y, `grid ${x},${y}`]);
    const out = [];
    for (const [x, y, name] of want) {
      let best = null;
      for (const i of net.near(x, y, 0, 150)) { const l = net.L[i]; for (let s = 0; s <= l.len; s += 4) { net.at(i, s, tmp); const d = Math.hypot(tmp.x - x, tmp.y - y); if (!best || d < best.d) best = { d, x: tmp.x, y: tmp.y }; } }
      if (best && !out.some(o => Math.hypot(o.x - best.x, o.y - best.y) < 150)) out.push({ name, x: +best.x.toFixed(1), y: +best.y.toFixed(1) });
    }
    return out;
  }, process.env.AT ? process.env.AT.split(',').map(Number) : null);
  console.log(`${phone ? 'phone' : 'desktop'} ${size}: ${stations.length} stations, ${HOURS.length} hours, ${secs} s each`);
  const places = [];
  let followed = 0;
  for (const hour of HOURS) for (const st of stations) {
    const r = await p.evaluate(([st, hour, secs, WINDOW, FAR, NEAR, sky]) => {
      const g = window.__game, me = g.player, C = g.crowd, net = g.crowdNet, P = C.P;
      C.why = true;
      g.setClock(g.clock.y, g.clock.m, g.clock.d, hour * 60); g.clock.scale = 1;
      if (sky && g.setWeather) g.setWeather(sky);
      const put = () => { me.x = st.x; me.y = st.y; me.z = g.nav.terrain(me.x, me.y); };
      put(); for (let t = 0; t < 6; t += 0.1) { g.advance(0.1); put(); } // (the crowd gathers round the station)
      const T = new Map(), paced = [];
      const DT = 0.1;
      for (let t = 0; t < secs; t += DT) {
        g.advance(DT); put();
        for (let i = 0; i < C.active; i++) {
          const q = P[i];
          let k = T.get(i);
          if (q.line < 0 || q.state !== 'walk' || q.seat) { T.delete(i); continue; }
          if (!k || Math.hypot(q.x - k.px, q.y - k.py) > 3) { k = { x0: q.x, y0: q.y, t0: t, px: q.x, py: q.y, path: 0, turns: 0, dir: q.dir, line: q.line, why: {}, run: 0 }; T.set(i, k); continue; } // (new, or come back elsewhere)
          k.path += Math.hypot(q.x - k.px, q.y - k.py); k.px = q.x; k.py = q.y;
          if (q.line === k.line && q.dir !== k.dir) { k.turns++; const y = q.turnWhy || (q.pz ? `crossing ${q.ph}` : '?'); q.turnWhy = ''; k.why[y] = (k.why[y] || 0) + 1; }
          k.dir = q.dir; k.line = q.line;
          if (t - k.t0 >= WINDOW) {
            const net1 = Math.hypot(q.x - k.x0, q.y - k.y0);
            const did = k.path > FAR && net1 < NEAR && k.turns >= 2, run = did ? k.run + 1 : 0;
            if (did) paced.push({ run, id: i, x: +q.x.toFixed(1), y: +q.y.toFixed(1), z: +q.z.toFixed(1), line: q.line, s: +(+q.s).toFixed(1), len: +net.L[q.line].len.toFixed(1), path: +k.path.toFixed(1), net: +net1.toFixed(1), turns: k.turns, why: k.why, pz: !!q.pz, lead: q.lead, mates: q.mates ? q.mates.length : 0, mode: q.mode, reach: C.ways ? [Math.round(C.ways.reach[2 * q.line]), Math.round(C.ways.reach[2 * q.line + 1]), C.ways.pocket[q.line]] : null });
            T.set(i, { x0: q.x, y0: q.y, t0: t, px: q.x, py: q.y, path: 0, turns: 0, dir: q.dir, line: q.line, why: {}, run });
          }
        }
      }
      return { paced, n: T.size, ways: C.ways ? { lines: C.ways.lines, pockets: C.ways.pockets, pocketM: C.ways.pocketM, shortWays: C.ways.shortWays, allM: C.ways.allM } : null, arrived: C.arrived || 0, thought: C.thought || 0 };
    }, [st, hour, secs, WINDOW, FAR, NEAR, process.env.SKY || '']);
    followed += r.n;
    for (const q of r.paced) {
      let pl = places.find(o => Math.hypot(o.x - q.x, o.y - q.y) < 6 && Math.abs(o.z - q.z) < 3);
      if (!pl) places.push(pl = { x: q.x, y: q.y, z: q.z, line: q.line, len: q.len, n: 0, ids: new Set(), hours: new Set(), why: {}, turns: 0, hard: 0 });
      pl.n++; pl.ids.add(`${hour}/${st.name}/${q.id}`); pl.hours.add(hour); pl.turns = Math.max(pl.turns, q.turns); if (q.run >= 2 || q.turns >= 4) pl.hard++;
      for (const k in q.why) { const key = k.replace(/\(.*$/, '').trim(); pl.why[key] = (pl.why[key] || 0) + q.why[k]; }
      pl.eg = q;
    }
    console.log(`  ${String(hour).padStart(5)} h  ${st.name.padEnd(16)} (${st.x}, ${st.y}): ${r.n} walkers followed, ${new Set(r.paced.map(q => q.id)).size} paced${r.ways ? `; ${r.ways.pockets} of ${r.ways.lines} lines in pockets (${r.ways.pocketM} of ${r.ways.allM} m), ${r.ways.shortWays} short ways, ${r.arrived} arrived at an end and stood, ${r.thought} stopped where they would have turned again` : '; the ways not yet told apart'}`);
    if (process.env.EACH) for (const q of r.paced) console.log(`      ${q.id} at (${q.x}, ${q.y}) line ${q.line} s ${q.s} of ${q.len}: path ${q.path}, net ${q.net}, ${q.turns} turns ${JSON.stringify(q.why)}${q.lead >= 0 ? ' a mate' : q.mates ? ' leading ' + q.mates : ''} reach ${q.reach}`);
  }
  await b.close();
  places.sort((a, c) => c.n - a.n);
  const list = places.map(o => ({ x: o.x, y: o.y, z: o.z, line: o.line, len: o.len, windows: o.n, walkers: o.ids.size, hours: [...o.hours], turns: o.turns, hard: o.hard, why: o.why, eg: o.eg }));
  console.log(`\n${phone ? 'phone' : 'desktop'}: ${list.length} places where a walker paced (${followed} walker-runs followed)`);
  for (const o of list) console.log(`  ${o.hard ? 'PACED' : 'once '} (${o.x}, ${o.y}, z ${o.z}) line ${o.line} (${o.len} m): ${o.walkers} walkers, ${o.windows} windows, hours ${o.hours.join(' ')}, up to ${o.turns} turns in ${WINDOW} s; ${JSON.stringify(o.why)}; e.g. path ${o.eg.path} m, net ${o.eg.net} m${o.eg.pz ? ', of a crossing\'s crowd' : ''}${o.eg.lead >= 0 ? ', a mate' : o.eg.mates ? `, leading ${o.eg.mates}` : ''}`);
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ size, hours: HOURS, secs, stations, places: list }, null, 1));
  const hard = list.filter(o => o.hard).length;
  console.log(`${hard} places where a walker paced a minute to and fro, or turned four times in ${WINDOW} s; ${list.length - hard} where one turned back once and went on`);
  process.exit(hard ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
