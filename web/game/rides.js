// Taxis and rides: the drivers' step, a ride hailed or ordered and the story's own car, boarding and leaving, and what
// the helicopter can reach. A part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").
// `g` is the rest of the game, by name. What this part asks of it:
//   $, A, CARS_OK, CITY, CR, G, H, KEEP, PLAYER_LOOKS, ROAD_HALF, SCR_AT, SCR_BOX, W, angDiff, blendFrom, cam,
//   camera, carCfg, cars, cine, clockT, crowd, dlg, driveTo, fmtSec, guideMade, headlamp, hopTo, inScramble,
//   junctions, keepSign, lib, life, makeRig, metro, myCar, nav, npcs, objective, phone, pickupNear, pilot, placeOf,
//   player, resetCar, ride, rideSeat, roadNet, roads, rq, save, scene, smalltalk, stepOut, story, takeHelm, touch,
//   vlib, waypoint, world
// and what it gives back:
//   HELI_IDLE, HELI_REACH, altAction, backAgain, backIn, boardRide, cancelRide, destinations, driverStep, eta,
//   groundZ, hail, kerbAction, leaveRide, orderRide, placeOnRoute, rideAway, rideCar, rideClock, rideGuard,
//   rideStep, skipRide, srnd, turnRound
'use strict';
window.OEGameRides = function (g) {
  // ------------------------------------------------------------ taxis and rides
  const FIRST = { Australia: ['Sam', 'Priya', 'Tom', 'Mei', 'Ahmed', 'Jess', 'Luca', 'Aroha'], Japan: ['Kenji', 'Yui', 'Haruto', 'Aiko', 'Takeshi', 'Emi'],
    France: ['Karim', 'Léa', 'Julien', 'Camille', 'Moussa', 'Inès'], China: ['Ka-ming', 'Wing', 'Chi-wai', 'Mei-ling', 'Siu-fung', 'Hoi-yan'] };
  // what picks among rides and places a crowd stands: its own seeded run, so a harness that drives the
  // clock (tools/game_check.js) sends the same car on every run (the plates and names stay random)
  let simSeed = 9137;
  const srnd = () => ((simSeed = (simSeed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const L1 = () => 'ABCDEFGHJKLMNPRSTUVWXYZ'[Math.floor(Math.random() * 23)], D1 = () => String(Math.floor(Math.random() * 10));
  const plate = () => ({ France: () => `${L1()}${L1()}-${D1()}${D1()}${D1()}-${L1()}${L1()}`, Japan: () => `${D1()}${D1()}-${D1()}${D1()}`,
    China: () => `${L1()}${L1()} ${D1()}${D1()}${D1()}${D1()}` }[g.CITY.country] || (() => `${L1()}${L1()}${L1()} ${D1()}${D1()}${L1()}`))();
  const MODEL_NAME = { Car_Sedan: 'sedan', Car_Taxi: 'taxi', Car_Hatch: 'hatchback', Car_SUV: 'SUV', Car_Van: 'van', Car_Super: 'supercar' };
  const COLOUR_NAME = [['white', '#f0f0ee'], ['black', '#1c1c1e'], ['silver', '#a9adb3'], ['grey', '#5a6470'], ['red', '#b3242b'], ['maroon', '#7a1f2b'], ['blue', '#1f4e8c'],
    ['beige', '#d8d3c8'], ['green', '#2f3b33'], ['gold', '#c9a227'], ['yellow', '#f2c21a']].map(([n, h]) => [n, new THREE.Color(h)]);
  const colourName = hex => { const c = new THREE.Color(hex); let best = '', bd = Infinity; for (const [n, q] of COLOUR_NAME) { const d = (c.r - q.r) ** 2 + (c.g - q.g) ** 2 + (c.b - q.b) ** 2; if (d < bd) { bd = d; best = n; } } return best; };
  const rideCar = o => `${colourName(o.hex)} ${MODEL_NAME[o.model] || 'car'}`;
  function driverLook() { // one of the crowd's characters (a main character has its own look, and isn't for hire)
    const names = g.lib ? Object.keys(g.lib.tpl).filter(n => !g.PLAYER_LOOKS[n] && g.lib.info.characters[n]) : [];
    return names.length ? OEPeople.randomLook(g.lib, names[Math.floor(Math.random() * names.length)], g.CR.style) : {};
  }
  // a ride coming for you drives at up to half as fast again while it is well out of sight of the
  // pick-up and of you (in the dry run that times it, of the pick-up), as games keep such cars on time
  const hurryTo = pickup => (st, dry) => {
    const d = Math.hypot(st.x - pickup.x, st.y - pickup.y), dp = dry ? d : Math.min(d, Math.hypot(st.x - g.player.x, st.y - g.player.y));
    const t = Math.max(0, Math.min(1, (dp - 130) / 90));
    return 1 + 0.5 * t * t * (3 - 2 * t);
  };
  const RIDE_T = [10, 20]; // the time a ride should take to reach you (s), leaving the rest of the half minute for the traffic in your sight
  const STUB = { half: 2.3, hw: 0.9, top: 1.5, wheelbase: 2.7 }; // a car's size, to time a trip before there is a car
  // the route from a place on the roads (from: { line, s, dir, v }) to the pick-up, and how long it takes
  // (the time with nothing in the way and no red lights, which it obeys only in your sight)
  // The traffic lights near the pick-up, which it stops at in your sight, add on average SIG_WAIT
  // each to the time: it has priority there, calling its green from far enough out that the lights
  // have changed (the other road's few seconds of green, amber, all red) and held it by the time it
  // gets there, so it seldom stops (tools/ride_check.js signals measures it); the time with them is
  // the one a ride is picked by and the app first says.
  const SIG_WAIT = 1;
  // A scramble's walk under way is the one turn its priority never cuts (junctions.js: one not yet
  // started waits for the ride's turn), and a ride keeps a scramble's lights in sight or not, so a
  // scramble near you adds more: coming up to it as the walk starts, the walk and the all red round
  // it, over half a minute; with the walk not started, next to nothing. It is counted at about the
  // average of the two, so a taxi on your side of it is picked whenever there is one.
  const SCR_WAIT = 14;
  // and the cars already queued at each signalled arm on its way (OECars.queueing), Q_CLEAR each to
  // move off ahead of it when the light turns green: a ride waits behind a queue, never round it (#107, #143)
  const Q_CLEAR = 1.8;
  // (at any junction on its way, signals or none; and a queue whose head has stood over 20 s waiting for room beyond,
  // a jam that spills back, counts JAM_WAIT more: Shibuya's taxi was sent down a one-way street into one, 150 s, #243)
  const JAM_WAIT = 30, PASS_WAIT = 10;
  // (and a queue at a red waits for its green before any of it moves: the light's own change, junctions.toGreen. Without it a
  // taxi was sent from behind a queue at Shinjuku's scramble 1106, and one at 1105 after it, timed 20 s and there in 132, #331)
  // (and one whose head waits at its line for room beyond, however briefly: a third of that, for the
  // queue that is forming; Shibuya's hailed taxi was sent behind a car just stopped so at 824, timed 21 s and there in 70)
  const queuedAt = a => { let n = 0, jam = 0; for (const c of g.cars.live) if (c.line >= 0 && c.lineArm === a && OECars.queueing(c)) { n++; if (c.why === 'room' && c.toLine - c.half < 3) jam = Math.max(jam, c.why === 'room' && (c.still || 0) > 20 ? JAM_WAIT : JAM_WAIT / 3); } return n * Q_CLEAR + jam + (n && a.j.sig && g.junctions.light(a) !== 'g' ? g.junctions.toGreen(a) : 0); };
  const queueWait = (arms, s0, skip = null) => { let t = 0; for (const q of arms || []) if (q.s > s0 + 2 && q.a !== skip) t += queuedAt(q.a); return t; };
  // the car a story sends (story.js ride) drives at this much over the limit, with you in it: at the limit the way back to
  // Hachiko was minutes of a dark street between two frames, and the owner asked for it faster (cars.js chauffeur pace);
  // and held still this many seconds with you in it (a red, the queue to one), the trip is cut on to where it sets you down
  const STORY_PACE = 1.6, STORY_HELD = 6;
  const COME_STILL = 20, COME_WAIT = 75; // (s a car coming for you may stand without 3 m gained: in a knot, and at a light, a walk or for people; driverStep, #97)
  // a story's helicopter waiting on its pad: its rotor turning over (vehicles.js st.idle, a fraction of flying speed),
  // and how near it E gets you in (SHIBUYA SKY's pad is its Geo Compass, a round floor two metres over the deck round it)
  const HELI_IDLE = 0.3, HELI_REACH = 12;
  const rideClock = () => g.clockT; // the traffic's clock, which junctions.js keeps its turns by (a ride's driver asks it for its way across)
  // A way that crosses a scramble near you is timed with its walk (SCR_WAIT): where another way round it
  // reaches you sooner, counted the same way, the ride takes that one, as a driver who knows the scramble's
  // half-minute walk would (#243)
  function planRide(from, pickup) {
    const rt = g.roads.route({ line: from.line, s: from.s, dir: from.dir }, pickup, 4000, undefined, null, true); // (loose: as before, the way to you)
    if (!rt) return null;
    const plan = planOn(rt, from, pickup);
    if (!plan.scr.length) return plan;
    const shun = new Set();
    for (const nd of rt.nodes || []) { const a = g.junctions.armAt(nd.line, nd.end); if (a && a.j.scramble && Math.hypot(a.j.x - pickup.x, a.j.y - pickup.y) < 160) { for (const b of a.j.arms) shun.add(b.line); for (const l of a.j.inner || []) shun.add(l); } }
    shun.delete(from.line); shun.delete(pickup.line);
    const rt2 = shun.size ? g.roads.route({ line: from.line, s: from.s, dir: from.dir }, pickup, 4000, undefined, shun, true) : null;
    if (!rt2 || (rt2.nodes || []).some(nd => shun.has(nd.line))) return plan;
    const plan2 = planOn(rt2, from, pickup);
    return plan2.T < plan.T ? plan2 : plan;
  }
  function planOn(rt, from, pickup) {
    const opts = { keep: g.keepSign, from: from.v ? 'lane' : 'kerb', v: from.v || 0, hurry: hurryTo(pickup), lights: g.junctions, priority: true, now: rideClock };
    const P = OECars.path(rt.pts), sig = [], scr = [], scrJ = [], qArms = [];
    let first = null; // (the first light on its way)
    for (const nd of rt.nodes || []) {
      const p = rt.pts[nd.k], a = p ? g.junctions.armAt(nd.line, nd.end) : null;
      if (!a) continue;
      const s = P.cum[Math.min(nd.k, P.cum.length - 1)];
      if (P.cum[Math.min(nd.k, P.cum.length - 1)] < 400) qArms.push({ s, a }); // (the queues on its way, near enough to stand when it comes)
      if (!a.j.sig) continue;
      if (!first) first = { s, a };
      if (Math.hypot(p[0] - pickup.x, p[1] - pickup.y) < 140) {
        sig.push(s);
        if (a.j.scramble) { scr.push(s); scrJ.push(a.j); } // (its walk: SCR_WAIT)
      }
    }
    for (const m of rt.mids || []) if (m.X.sig && Math.hypot(m.X.x - pickup.x, m.X.y - pickup.y) < 140) sig.push(m.at); // (and the crossings' lights between junctions)
    sig.sort((p, q) => p - q);
    const drive = OECars.chauffeur(STUB, rt, opts).total();
    // (the first light on its way, red now and still red when it gets there, is waited out: the light's own change,
    // not the second or so of an average light; Shinjuku's hailed taxi, 60 m short of a red, came in 42 s, not 12)
    let firstW = 0;
    if (first && first.s < 250 && g.junctions.light(first.a) !== 'g') firstW = Math.max(0, g.junctions.toGreen(first.a) - drive * first.s / Math.max(1, P.len));
    // (and your car left standing in its way, which it pulls out round when nothing comes the other way: a taxi in
    // Queenstown stood 13 s behind it so, timed 22 s and there in 40, #331)
    let parkedW = 0;
    const mc = g.myCar && g.player.mode !== 'car' ? g.myCar.D.st : null;
    if (mc) { const e = {}; for (let s = 0; s < P.len; s += 3) { P.at(s, e); if (Math.hypot(e.x - mc.x, e.y - mc.y) < 2.5) { parkedW = PASS_WAIT; break; } } }
    return { rt, opts, drive, sig, scr, scrJ, qArms, firstSig: firstW > 0, T: drive + firstW + parkedW + SIG_WAIT * sig.length + SCR_WAIT * scr.length + queueWait(qArms, -Infinity) };
  }
  // what keeps a ride's driver out of the traffic's cars where you could see it (out of sight, as nothing
  // else holds a driver up there, it would only be late): never a step further into one (solid), and,
  // wedged against one that won't move off, asking it to back off (makeWay, actors.js)
  // (on its way to you, wedged a second, it goes on at a crawl as before, so that it comes in good time: wedge)
  const rideGuard = (C, coming = false) => ({
    solid: (x, y, z, h) => (inSight(x, y, z) ? g.cars.footprint(x, y, z, h, C.half, C.hw, 0) : 0),
    makeWay: (x, y, z, h, half, hw) => !!(g.junctions.makeWay && inSight(x, y, z) && g.junctions.makeWay(x, y, z, h, half, hw)),
    wedge: coming ? 1 : undefined,
    people: (ps, np, step, st, C) => peopleOnWay(ps, np, step, st, C),
    kerbFit: (x, y, hx, hy, k, keep) => kerbFit(C, x, y, hx, hy, k, keep),
  });
  // how far off its way's line a car can pull in at (x, y) heading (hx, hy): k, or less until its outer side, over its
  // length, is on the carriageway a hero level draws there (nav.carriageway; outside a level the street's class stands).
  // By Hachiko the street's width took the car 4.4 m out, its wheels on the square's paving (#54)
  function kerbFit(C, x, y, hx, hy, k, keep) {
    if (!g.nav.carriageway) return k;
    const s = Math.sign(k * keep) || 1, min = Math.min(k, OECars.LANE);
    const fits = kk => { const lat = kk * keep + s * (C.hw + 0.15); for (const a of [-C.half, 0, C.half]) if (g.nav.carriageway(x + hx * a - hy * lat, y + hy * a + hx * lat) === false) return false; return true; };
    for (let kk = k; kk > min; kk -= 0.2) if (fits(kk)) return kk;
    return min;
  }
  // the first person along a driver's way (cars.js chauffeur people: ps, np points step apart from its bumper): how far
  // along it, or Infinity. The crowd, the NPCs and you on foot, as the traffic brakes for them (actors.js 'person'); a
  // ride drove through the people on the pavement's edge and stepping out under the JR viaduct, seeing only the
  // scramble's crowd out on its road. (You are not waited on within 6 m of where it pulls in for you: you stand there.)
  function peopleOnWay(ps, np, step, st, C) {
    if (!np) return Infinity;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = 0; k < np; k++) { const x = ps[2 * k], y = ps[2 * k + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const R = C.hw + 0.3 + 0.25, R2 = R * R;
    let gap = Infinity;
    const test = (px, py, pz) => {
      if (px < x0 - R || px > x1 + R || py < y0 - R || py > y1 + R || (pz != null && Math.abs(pz - st.z) > 2.5)) return;
      for (let k = 0; k < np && k * step < gap; k++) {
        const ex = ps[2 * k] - px, ey = ps[2 * k + 1] - py;
        if (ex * ex + ey * ey < R2) { gap = Math.min(gap, Math.max(0, k * step - 0.3)); return; }
      }
    };
    if (g.crowd && g.crowd.P) for (let i = 0, n = Math.min(g.crowd.active, g.crowd.P.length); i < n; i++) { const p = g.crowd.P[i]; if (p.line >= 0 || p.pz) test(p.x, p.y, p.z); }
    // (someone who stands on the pavement is not on its way, however near the kerb: the walk's people stand at the
    // corners its drives turn round, and a driver waited on one for good 80 m short of 109, issue 167)
    for (const n of g.npcs) if (!g.nav.carriageway || g.nav.carriageway(n.x, n.y) !== false) test(n.x, n.y, n.z);
    if (g.player.mode === 'foot') {
      const g0 = gap; test(g.player.x, g.player.y, g.player.z);
      if (gap < g0 && st.s + C.half + gap > st.end - 6) gap = g0;
    }
    return gap;
  }
  // a ride (kind 'taxi' or 'hire') from a traffic car or a place on the roads, on its planned route to the pick-up
  function newRide(kind, from, pickup, plan, dest = null) {
    const tcfg = Object.assign({}, g.vlib.info.cars.liveries.taxi, ((g.G.vehicles || {}).cars || {}).taxi);
    const own = !!(dest && dest.id === 'story'); // (a story sends the player's own car round for them: game.vehicles.car)
    const model = own ? g.carCfg.model : kind === 'taxi' ? 'Car_Taxi' : OEActors.pick(['Car_Sedan', 'Car_SUV', 'Car_Sedan', 'Car_Hatch']);
    const hex = own ? g.carCfg.colour : from.hex || (kind === 'taxi' ? OEActors.pick(tcfg.colours) : OEActors.pick(['#1c1c1e', '#8a9099', '#3d4146', '#e7e5df', '#1f2a3a']));
    const C = OECars.car(g.world, g.vlib, model, { colours: { paint: hex, seat: kind === 'taxi' ? '#2b2d30' : '#b9ae9c' }, keep: g.KEEP });
    const o = { kind, C, model, hex, name: own ? 'Your car' : OEActors.pick(FIRST[g.CITY.country] || FIRST.Australia), plate: plate(), pickup, dest, phase: 'coming',
      t0: g.clockT, meter: 0, talkT: 0, wait: 0, pitch: 140 + Math.floor(Math.random() * 140), rating: (4.7 + Math.random() * 0.29).toFixed(2).slice(0, 3) };
    // (never a step further into a car of the traffic where you could see it: out of sight, as nothing
    // else holds a driver up there, it would only be late)
    const opts = Object.assign(rideGuard(C, true), plan.opts);
    o.drv = OECars.chauffeur(C, plan.rt, opts);
    o.drv.opts = opts; // (for a new route round a jam)
    o.T0 = plan.T; o.sig = plan.sig; o.scr = plan.scr || []; o.scrJ = plan.scrJ || []; o.qArms = plan.qArms; // (the lights it is to stop at near you, s along its route)
    let look = driverLook();
    o.driver = g.makeRig(look, {});
    C.sit(o.driver, 'driver');
    // (a tall character, or one in a hat, can stand out through the roof even shrunk as far as a seat shrinks
    // anyone: another of the crowd's characters at the wheel then, a few tries at most)
    for (let k = 0; k < 4 && look.character && C.clearance && C.clearance(o.driver, 'driver') < 0; k++) {
      if (o.driver.root.parent) o.driver.root.parent.remove(o.driver.root);
      look = driverLook();
      o.driver = g.makeRig(look, {});
      C.sit(o.driver, 'driver');
    }
    // none of the crowd's characters loaded yet (a ride in the first seconds of a game): a simple
    // figure at the wheel for now, and one of them as soon as it has loaded
    // (one that does not fit under the roof is passed over for the next, as above)
    if (!look.character && g.lib) {
      const names = Object.keys(g.lib.info.characters).filter(n => !g.PLAYER_LOOKS[n]);
      const next = tries => {
        const name = names[Math.floor(Math.random() * names.length)];
        if (name) Promise.resolve(g.lib.require(name)).then(() => {
          if (g.ride !== o || !g.lib.tpl[name]) return;
          const rig = g.makeRig(OEPeople.randomLook(g.lib, name, g.CR.style), {});
          const was = o.driver;
          if (was.root.parent) was.root.parent.remove(was.root);
          C.sit(rig, 'driver');
          if (C.clearance && C.clearance(rig, 'driver') < 0 && tries > 0) { if (rig.root.parent) rig.root.parent.remove(rig.root); C.sit(was, 'driver'); next(tries - 1); return; }
          o.driver = rig;
        }).catch(() => {});
      };
      next(4);
    }
    return o;
  }
  // one setting out from a street a couple of hundred metres off by road, chosen so it takes
  // RIDE_T to reach you and, where it can be, out of sight (behind you, or farther than you can see)
  // (a taxi you hail pulls in beside you, at most across the street: only a ride ordered on the phone has
  // its pick-up moved round the corner, #209)
  function rideFromAround(kind, pickup, dest, move = true) {
    if (!g.vlib.carsFull) { g.vlib.loadCars(); return null; } // (the cars' near models still to come, issue 335)
    let best = bestFrom(pickup);
    // none can reach that kerb in time (a dead end the near side of the street faces into, a stub no
    // road feeds): the kerb across the street and the streets round it too, as a ride app moves the
    // pick-up (a few seconds' allowance for each metre further from yours)
    // (a scramble's walk on the way counts in the time the app gives, but no move of the pick-up gets round it: every way there crosses it)
    if (!best || best.plan.T - SCR_WAIT * (best.plan.scr || []).length > RIDE_T[1] + 5) {
      const alts = g.roadNet.L[pickup.line].ow ? [] : [Object.assign({}, pickup, { dir: -pickup.dir })];
      if (move) for (const [dx, dy] of [[25, 0], [-25, 0], [0, 25], [0, -25]]) {
        const q = g.roads.place(pickup.x + dx, pickup.y + dy, 30, g.keepSign, pickup.z);
        if (q && q.line !== pickup.line && !alts.some(a => a.line === q.line) && !(g.SCR_AT.length && g.inScramble(q.line, q.s))) alts.push(q);
      }
      for (const q of alts) {
        const b = bestFrom(q), walk = Math.hypot(q.x - pickup.x, q.y - pickup.y) / 3;
        if (b && (!best || b.plan.T + walk < best.plan.T)) best = b;
      }
    }
    // (and a slow one rather than none, the app saying so)
    return best && best.plan.T < 120 ? newRide(kind, best.pl, best.pickup, best.plan, dest) : null;
  }
  function bestFrom(pickup) {
    const fx = Math.sin(g.cam.yaw), fy = Math.cos(g.cam.yaw); // the way the camera looks, on the map
    // streets 110 to 270 m from the pick-up by road (the network searched backwards from it), each timed
    const cand = g.roads.behind(pickup, 110, 270, 36);
    for (let k = 0; cand.length < 6 && k < 12; k++) { const pl = g.roads.around(pickup.x, pickup.y, 120, 280); if (pl) cand.push(pl); } // (a pick-up the search can't leave)
    let best = null;
    // (not where it would pull out into a car of the traffic, or a queue: one at a crawl or stopped close by)
    const busy = pl => g.cars.live.some(c => c.line >= 0 && Math.abs(c.z - (pl.z ?? c.z)) < 3 && Math.hypot(c.x - pl.x, c.y - pl.y) < (c.v < 3 ? 25 : 12));
    let any = false;
    const pick = list => {
      for (const pl of list) {
        if (!any && busy(pl)) continue;
        const plan = planRide(pl, pickup);
        if (!plan) continue;
        const dx = pl.x - g.player.x, dy = pl.y - g.player.y, d = Math.hypot(dx, dy);
        const hidden = d > 240 || (dx * fx + dy * fy) / Math.max(1, d) < 0.3;
        const score = (plan.T < RIDE_T[0] ? RIDE_T[0] - plan.T : plan.T > RIDE_T[1] ? 4 * (plan.T - RIDE_T[1]) : 0) + (hidden ? 0 : 5) + srnd();
        if (!best || score < best.score) best = { pl, plan, score, pickup };
      }
    };
    pick(cand);
    // none of those near enough in time (one-way streets, a slow way round): nearer ones too, 40 to 110 m off
    if (!best || best.plan.T > RIDE_T[1]) pick(g.roads.behind(pickup, 40, 110, 24));
    // and in streets as slow as Shibuya's, just round the corner, 15 to 40 m off (out of sight where it can be)
    if (!best || best.plan.T > RIDE_T[1] + 5) pick(g.roads.behind(pickup, 15, 40, 16));
    if (!best) { any = true; pick(cand); } // (all of them in the traffic: one of those rather than none)
    return best;
  }
  // the time to the pick-up (or, on the way, to where you're going), as the app shows it
  // (held up behind the traffic, it rises as it waits, as an app's does, rather than standing still)
  // Stopped at a red light, or queued behind a car that is, it is the time to that light's green
  // (junctions.toGreen: the signals know their change) with a couple of seconds for the queue to move
  // off, in place of the average for that light; held up behind cars otherwise, the time it has waited.
  function rideWait(st) {
    if (st.v > 1) return null;
    let b = st.block, n = 0; // (the queue ahead, car by car, to the one at the line)
    while (b && b.line != null && b.why === 'car' && b.front && b.v < 1 && n < 8) { b = b.front; n++; }
    const a = /^the line/.test(st.why || '') ? st.lineAt : b && b.line != null && b.why === 'light' ? b.lineArm : null;
    if (a && a.j.sig) return { light: true, a, t: g.junctions.toGreen(a) + (a === st.lineAt ? 0 : 1.5 * (n + 1)) };
    // (behind a car stuck where it is, at a wall or stopped for good: the driver swings out round it
    // once it has waited 6 s, cars.js gapAhead)
    const stuck = st.block && st.block.line != null && st.block.v < 0.1 && (st.block.why === 'wall' || st.block.still > 2);
    return { light: false, t: stuck ? Math.max(1, 7 - (st.held || 0)) : Math.max(0, (st.held || 0) - 2) };
  }
  const eta = o => {
    // (on the trip, as a navigator does: the drive left and what it is held up by now, a red light's wait or
    // the queue's, not the dry run alone, which reads 1:40 to go while the car stands at a red)
    if (o.phase !== 'coming') { if (o.phase !== 'driving') return 0; const w = rideWait(o.drv.st); return o.drv.timeLeft() + (w ? w.t : 0); }
    const st = o.drv.st, w = rideWait(st), lights = (o.sig || []).filter(s => s > st.s + 2).length - (w && w.light ? 1 : 0);
    const scr = (o.scr || []).filter(s => s > st.s + 2).length - (w && w.light && st.lineAt && st.lineAt.j.scramble ? 1 : 0); // (the scrambles still ahead: their walk, as it comes)
    return o.drv.timeLeft() + SIG_WAIT * Math.max(0, lights) + SCR_WAIT * Math.max(0, scr) + (w ? w.t : 0) + queueWait(o.qArms, st.s, w && w.a); // (the queue it is in already counted by rideWait)
  };
  // Y at the kerb: a hand up, and the nearest free taxi coming your way pulls in
  function hail() {
    if (g.player.mode !== 'foot' || g.player.auto) return;
    if (!g.CARS_OK) { g.H.toast('There are no taxis to hail here.'); return; }
    if (!g.vlib.carsFull) { g.vlib.loadCars(); g.H.toast('The taxis are still on their way into town: try again in a moment.'); return; } // (issue 335)
    if (g.ride && g.ride.phase !== 'leaving') { g.H.toast(g.ride.phase === 'coming' ? `${g.ride.name} is on the way.` : `${g.ride.name} is waiting for you.`); return; }
    if (backIn(g.ride)) { backAgain(); g.H.toast(`<b>${g.ride.name}</b> is still here: <kbd>E</kbd> to get back in.`); return; }
    const pickup = g.pickupNear(g.player.x, g.player.y, g.player.z, 40);
    if (!pickup) { g.H.toast('Stand at the kerb of a street to hail a taxi.'); return; }
    if (g.player.rig.wave) g.player.rig.wave(g.clockT);
    let best = null;
    for (const c of g.cars.live) {
      if (!c.taxi || c.line < 0) continue;
      if (c.v < 2 && (c.q || c.still > 2 || c.why === 'car')) continue; // (not one standing in a queue, nose to tail: it would sit there with you waiting; one from round the corner instead)
      if (c.front && c.front.line >= 0 && (c.front.v || 0) < 2 && Math.hypot(c.front.x - c.x, c.front.y - c.y) < 15 + c.v) continue; // (nor one about to stop behind a car standing close ahead: Shinjuku's taxi lost 10 s so)
      const d = Math.hypot(c.x - g.player.x, c.y - g.player.y);
      if (d > 300 || d < 12) continue;
      const from = { line: c.line, s: c.s, dir: c.dir, v: Math.max(1, c.v), hex: c.hex }, plan = planRide(from, pickup);
      // (one stopped at a red light waits for its green first: a scramble's walk can be half a minute)
      if (plan && c.v < 1 && c.lineArm && c.toLine < 12 && !plan.firstSig && g.junctions.light(c.lineArm, c.lineEx) === 'r') plan.T += g.junctions.toGreen(c.lineArm);
      if (plan && plan.T <= RIDE_T[1] && (!best || plan.T < best.plan.T)) best = { c, from, plan };
    }
    let o = null;
    if (best) {
      const c = best.c;
      o = newRide('taxi', best.from, pickup, best.plan);
      g.cars.take(c); Object.assign(o.drv.st, { x: c.x, y: c.y, z: c.z, h: c.h });
    }
    if (!o) o = rideFromAround('taxi', pickup, null, false);
    if (!o) { g.H.toast('No taxis about. Try a busier street, or order a ride on your phone (N).'); return; }
    if (g.ride) { g.ride.drv.leave(); g.ride.C.dispose(); } // the last one, still driving off
    g.ride = o;
    g.A.honk();
    g.H.toast(best ? `A taxi has seen you: it'll pull in in about ${g.fmtSec(eta(o))}.` : `A taxi is coming round the corner, about ${g.fmtSec(eta(o))} away.`);
  }
  // the phone: a private-hire car to where you say
  // (true if a ride is on its way, or waiting; else the phone and a toast say why not)
  function orderRide(dest) {
    const no = msg => { g.H.toast(msg); g.phone.note = msg; g.phone.noteT = g.clockT; return false; };
    if (g.player.mode !== 'foot') return no('Order once you are on foot.');
    if (g.ride && g.ride.phase !== 'leaving') return no(`${g.ride.name} is already on the way.`);
    if (backIn(g.ride)) { backAgain(dest); g.H.toast(`<b>${g.ride.name}</b> is still here: <kbd>E</kbd> to get back in.`); return true; } // (the car you got out of in the traffic, beside you still)
    const pickup = g.pickupNear(g.player.x, g.player.y, g.player.z, 120);
    if (!pickup) return no('There is no street near enough to be picked up from.');
    const o = rideFromAround('hire', pickup, dest);
    if (!o) return no('No drivers near you. Try again in a moment.');
    if (g.ride) { g.ride.drv.leave(); g.ride.C.dispose(); } // the last one, still driving off
    g.ride = o;
    const walk = Math.hypot(o.pickup.x - g.player.x, o.pickup.y - g.player.y); // (the pick-up it was given, which may be across the street or round the corner)
    // (the story's car is sent by the story, whose goal has said it is coming: not a ride-hailing app's notice, with its
    // make, plate and minutes, which frame 6 showed under the story's own line; only where it will stop, if that is not here)
    if (dest && dest.id === 'story') { if (walk > 25) g.H.toast(`It will pull in at the kerb ${Math.round(walk)} m from you.`); }
    else g.H.toast(`<b>${o.name}</b> is on the way in a ${rideCar(o)}, ${o.plate}: about ${g.fmtSec(eta(o))}.${walk > 25 ? ` Meet at the pick-up point, ${Math.round(walk)} m from you.` : ''}`);
    return true;
  }
  // the ride you got out of on the way (in the traffic), still stopped beside you: yours to get back
  // into, rather than another called while it drives off (or vanishes in front of you for it)
  const backIn = o => !!o && o.phase === 'leaving' && o.inLane && o.drv.st.v < 0.5 && Math.hypot(o.drv.st.x - g.player.x, o.drv.st.y - g.player.y) < 25;
  function backAgain(dest = null) {
    const o = g.ride;
    if (o.dest) o.prev = o.dest; // (offered first when the driver asks where to)
    Object.assign(o, { dest, phase: 'waiting', wait: 0, hold: true }); // (held where it stands, in its lane, until you are in)
    o.drv.st.v = 0;
    const st = o.drv.st, pl = g.placeOf(st);
    if (pl) o.pickup = Object.assign(pl, { x: st.x, y: st.y, z: st.z }); // (picked up where it stands: the phone shows it beside you)
  }
  function cancelRide() {
    if (!g.ride || g.player.mode === 'ride') return;
    g.H.toast(`Ride with ${g.ride.name} cancelled.`);
    rideAway();
  }
  // E beside the car and you are in it, in the seat on the kerb's side: no walk round to that door first (a walk up
  // to the door, round the boot when you stood on the road's side, was seconds of nothing between the key and the seat)
  function boardRide() {
    const o = g.ride;
    o.phase = 'boarding'; g.player.auto = null; g.player.speed = 0;
    g.player.mode = 'ride'; g.player.vehicle = o;
    o.C.sit(g.player.rig, g.rideSeat(o));
    if (g.headlamp) o.C.carry(g.headlamp);
    const turn = Math.abs(g.angDiff(o.drv.st.h, g.cam.yaw));
    g.cam.mode = 'chase'; g.cam.dist = 8; g.cam.pitch = 0.24; g.cam.yaw = o.drv.st.h;
    g.blendFrom(0.8 + turn * 0.16, true); // (the view goes round behind the car, eased: the one move between the key and the road)
    g.A.thump();
    if (o.dest) setOff(o.dest); else askWhereTo();
  }
  // where you might go: the waypoint, the survey, your car, the landmarks, the wharves (each
  // somewhere whose nearest street is a drive away, not round the corner)
  const groundZ = (x, y) => { const f = g.nav.floorAt(x, y, Math.max(0, g.nav.terrain(x, y)) + 1); return f ? f.z : null; };
  function destinations(x, y) {
    const out = [], seen = new Set();
    const add = (id, name, at, note) => {
      if (!at || seen.has(id) || Math.hypot(at[0] - x, at[1] - y) < 150) return;
      const pl = g.roads.place(at[0], at[1], 300, g.keepSign, groundZ(at[0], at[1]));
      if (!pl || Math.hypot(pl.x - x, pl.y - y) < 180) return;
      seen.add(id); out.push({ id, name, at: [at[0], at[1]], note });
    };
    if (g.waypoint) add('waypoint', 'Your waypoint', g.waypoint, 'set on the map');
    const ob = g.objective();
    if (ob && ob.at) add('objective', ob.title || 'Your walk', ob.at, 'your walk');
    if (g.myCar && g.player.vehicle !== g.myCar) add('car', 'Your car', [g.myCar.D.st.x, g.myCar.D.st.y], 'where you left it');
    const marks = Object.entries(g.scene.labels || {}).map(([n, p]) => ({ n, p, d: Math.hypot(p[0] - x, p[1] - y) })).filter(m => m.d > 300).sort((a, b) => a.d - b.d);
    for (const m of marks.slice(0, 4)) add(`lm-${m.n}`, m.n, m.p, `${(m.d / 1000).toFixed(1)} km`);
    for (const t of g.G.travel || []) add(t.id, t.name, t.at, '');
    for (const w of g.G.wharves) add(w.id, w.name, w.terminal, 'ferry wharf');
    add('start', 'Where you started', g.G.start.at, '');
    return out.slice(0, 7);
  }
  // (say: the driver's words, in place of the greeting; skip: a destination to leave out, one no road
  // reaches. Where you were going before you got out on the way, first.)
  function askWhereTo(say = null, skip = null) {
    const o = g.ride;
    o.phase = 'asking';
    let list = destinations(o.drv.st.x, o.drv.st.y).filter(d => d.id !== skip);
    if (o.prev && o.prev.id !== skip) list = [Object.assign({}, o.prev, { note: 'where you were going' })].concat(list.filter(d => d.id !== o.prev.id)).slice(0, 7);
    g.dlg.show({ name: o.name, role: o.kind === 'taxi' ? 'Taxi driver' : 'Your driver', color: '#e0a21a', pitch: o.pitch }, [say || `${g.G.greeting ? `${g.G.greeting} ` : ''}Where to?`],
      list.map(d => ({ text: `${d.name}${d.note ? ` <span class="note">· ${d.note}</span>` : ''}`, dest: d })).concat([{ text: 'Nowhere, thanks. I\'ll get out here.', dest: null }]),
      c => { if (g.ride !== o) return; if (c && c.dest) setOff(c.dest); else { o.phase = 'driving'; leaveRide(); } });
  }
  function setOff(dest) {
    const o = g.ride, from = placeOnRoute(o.drv.st) || o.drv.st.route.to, rt = from && g.driveTo(from, dest.at[0], dest.at[1]);
    // (no road from here gets there: the driver says so and asks again; you stay in the car)
    if (!rt) { o.dest = null; askWhereTo(`I can't get to ${dest.name} by road from here, sorry. Somewhere else?`, dest.id); return; }
    Object.assign(o, { dest, phase: 'driving', meter: 0, talkT: g.clockT + 9, t0: g.clockT });
    o.drv.leave();
    const opts = Object.assign(rideGuard(o.C), { keep: g.keepSign, from: o.inLane ? 'lane' : 'kerb', lights: g.junctions, priority: true, callFrom: 200, now: rideClock, pace: dest.id === 'story' ? STORY_PACE : 1 }); // (got back into in its lane: on from there; you in it, its green called ahead, as for one coming for you; the story's car, briskly: STORY_PACE)
    o.drv = OECars.chauffeur(o.C, rt, opts);
    o.drv.opts = opts; // (for a new way round a jam)
    o.inLane = o.hold = false;
    g.H.toast(`<b>${o.name}:</b> ${dest.name}, ${(rt.len / 1000).toFixed(1)} km by road. <kbd>F</kbd> to skip the trip.`);
  }
  // the car you are in, or have just got out of, pulls away and drives off
  function rideAway() {
    const o = g.ride;
    o.phase = 'leaving'; o.t0 = g.clockT; o.hold = false;
    const pl = g.placeOf(o.drv.st), pts = pl ? g.roads.onward({ to: pl }, 260) : [];
    if (pts.length > 1) { o.drv.leave(); o.drv = OECars.chauffeur(o.C, { pts, end: false, nodes: pts.nodes, mids: pts.mids }, Object.assign(rideGuard(o.C), { keep: g.keepSign, from: o.inLane || o.drv.st.v > 1 ? 'lane' : 'kerb', v: o.drv.st.v, lights: g.junctions, now: rideClock })); } // (left in its lane, in the traffic: on from there, not from the kerb)
  }
  function leaveRide() {
    const o = g.ride;
    if (!o) return;
    if (g.player.mode === 'ride') {
      if (o.drv.st.v > 0.5) { g.H.toast('Wait until the car stops.'); return; }
      if (!g.stepOut(o, g.rideSeat(o))) { g.H.toast('No room to get out here.'); return; }
      o.inLane = o.phase === 'driving' && !o.drv.st.done; // (out on the way, held up in the traffic: it stands in its lane)
      if (o.phase === 'arrived') g.H.toast(`<b>${o.name}:</b> ${OEActors.pick(['Enjoy!', 'Have a good one.', 'Take care.', 'Thanks!'])}`);
      g.save();
    }
    rideAway();
  }
  function skipRide() {
    const o = g.ride;
    if (!o || o.phase !== 'driving' || g.cine.active) return;
    const end = {}, P = o.drv.path;
    P.at(o.drv.st.end, end);
    o.meter += o.drv.remaining();
    // (it stands where it is while the view goes on ahead: driven on under the hop, out of sight, it once went into the
    // Scramble as its walk began and stood among the walkers. At the top of the hop it is set down short of its stop, where
    // its body stands clear of people and cars, and drives in under the view coming down onto it, braking for whoever is on
    // its way: set down at the stop itself, by Hachiko, it landed on the people crossing there, and they walked through it)
    o.hold = true;
    g.hopTo(end.x, end.y, end.z, o.dest.name, { cue: () => {
      o.hold = false;
      // (nowhere clear in its last 30 m: further back along its way; and nowhere at all, it drives in from where it stands.
      // Finished at its stop all the same, it was set down on the people crossing there by Hachiko, #28)
      // (and set down moving no faster than it can stop at short of the first person on its way in: put down at 5.5 m/s
      // 6 m short, it braked for a woman waiting at the kerb by Hachiko and stopped with her in its bonnet, #50)
      const s = setDown(o) ?? setDown(o, Infinity);
      if (s == null) { /* it drives on in from where it stood */ } else if (o.drv.st.end - s < 2) o.drv.finish(); else { const go = Math.min(o.drv.st.end - s, wayIn(o, s) - 1.5); o.drv.jump(s); o.drv.st.v = Math.min(8, Math.sqrt(2 * 2.5 * Math.max(0, go))); }
    }, quiet: true });
  }
  // where a skipped ride is set down: the furthest point of its way within SET_DOWN metres short of its stop (and not behind
  // where it is) at which its body, and a metre and a half round it, has nobody in it and no car near; null if there is none
  const SET_DOWN = 30;
  // (first choice, a point from which its way in to the stop has nobody on it either; else the furthest clear one)
  function setDown(o, far = SET_DOWN) {
    const st = o.drv.st;
    let any = null;
    for (let s = st.end; s >= Math.max(st.s, st.end - far); s -= 1.5) if (clearAt(o, s)) { if (wayIn(o, s) >= st.end - s) return s; any ??= s; }
    return any;
  }
  // how far a ride put at s can drive on before the first person on its way (from its bumper, as its driver looks:
  // cars.js look, game.js peopleOnWay), up to its stop; Infinity if nobody
  const wayPts = new Float64Array(80), wayAt = {};
  function wayIn(o, s) {
    const st = o.drv.st, half = o.C.half, sh = st.shift;
    let n = 0;
    st.shift = 0;
    for (let d = 0; s + half + d <= st.end + half && n < 40; d += 1.5) { o.drv.poseAt(Math.min(o.drv.path.len, s + half + d), wayAt); wayPts[2 * n] = wayAt.x; wayPts[2 * n + 1] = wayAt.y; n++; }
    st.shift = sh;
    o.drv.poseAt(s, wayAt);
    return peopleOnWay(wayPts, n, 1.5, { z: wayAt.z, s, end: st.end }, o.C);
  }
  // whether a ride put at s of its way (as jump and finish put it) stands clear: its body and pad metres round it with
  // nobody in it (the crowd, the NPCs, you on foot, the dog) and no car of the traffic near. Tested where the car will
  // stand, not on its way's line: near its stop it pulls in to the kerb, metres off that line towards the pavement, and
  // judged on the line it was set down on five people waiting by Hachiko (#50)
  const atSet = {};
  function clearAt(o, s, pad = 1.5) {
    const st = o.drv.st, sh = st.shift;
    st.shift = 0; o.drv.poseAt(s, atSet); st.shift = sh; // (jump and finish put it back in its lane: st.shift 0)
    const x = atSet.x, y = atSet.y, z = atSet.z, r = o.C.half + pad;
    const near = q => q && Math.abs(q.x - x) < r && Math.abs(q.y - y) < r && Math.hypot(q.x - x, q.y - y) < r && (q.z == null || z == null || Math.abs(q.z - z) < 3);
    if (g.crowd && g.crowd.P) for (let i = 0, n = Math.min(g.crowd.active, g.crowd.P.length); i < n; i++) { const q = g.crowd.P[i]; if ((q.line >= 0 || q.pz) && near(q)) return false; }
    if (g.npcs.some(near)) return false;
    if (g.player.mode === 'foot' && near(g.player)) return false;
    const gd = g.guideMade; if (gd && gd.root && gd.root.visible && gd.state !== 'away' && near(gd)) return false;
    return !g.cars.live.some(c => c.line >= 0 && Math.hypot(c.x - x, c.y - y) < (c.half || 2.4) + 3.5);
  }
  // what a ride's driver looks out for (cars.js chauffeur): the traffic, your car, you on foot
  // (one stopped for good, your car left in the lane or a car stuck in a jam, is driven round).
  // Out of your sight (inSight) nothing holds a driver up, as games keep the cars that come for you on time.
  function inTheWay(o) {
    const st = o.drv.st, out = [];
    // a scramble's crowd, out across its road on the walk (actors.js plazas), in sight or not: one that
    // drove through them would be seen there by those who come after (and is caught by tools/clip_check.js)
    if (g.crowd.plazas) for (let i = 0; i < g.crowd.active; i++) { const p = g.crowd.P[i]; if (p.pz && Math.abs(p.x - st.x) < 40 && Math.abs(p.y - st.y) < 40 && (p.ph === 'cross' || p.pz.road(p.x, p.y))) out.push({ x: p.x, y: p.y, half: 0.3, hw: 0.3, v: Math.max(0.2, p.v), walker: true }); } // (out on the road, never one to drive round: it waits for them; not those waiting on the pavement)
    if (!inSight(st.x, st.y, st.z) || o.thru) return out; // (o.thru: still in a car it drove through unseen, or stood for good: driverStep)
    // a ride running late for you goes round a car holding it up instead of queueing behind it
    const late = o.phase === 'coming' && g.clockT - o.t0 > (o.T0 || 20) + 3;
    for (const c of g.cars.live) if (c.line >= 0 && Math.abs(c.x - st.x) < 60 && Math.abs(c.y - st.y) < 60) out.push(c.why === 'parked' || (!OECars.queueing(c, o.phase !== 'coming') && (c.stuck > 4 || (late && c.v < 2))) ? // (one parked at the kerb, actors.js parkNow: there for good; read by its why, one of the fields game.js may read, actors.js VIEW) // (on the way to you: only a queue at a junction is waited in, as before; with you in it, any queue held by a rule of the road)
       { x: c.x, y: c.y, half: c.half, hw: c.hw, still: true, stay: c.why === 'parked' || c.stuck > 10, line: c.line, v: c.v, of: c } : c);
    if (g.myCar && o !== g.pilot) { const parked = g.player.mode !== 'car' && g.myCar.D.st.speed < 0.3; out.push({ x: g.myCar.D.st.x, y: g.myCar.D.st.y, half: g.myCar.C.half, hw: g.myCar.C.hw, still: parked, stay: parked }); }
    // (the autopilot sees a ride as the ride sees your car: one pulled in for you is driven round)
    if (o === g.pilot && g.ride) { const rs = g.ride.drv.st, parked = (g.ride.phase === 'waiting' || g.ride.phase === 'arrived' || !!g.ride.hold) && rs.v < 0.3; out.push({ x: rs.x, y: rs.y, half: g.ride.C.half, hw: g.ride.C.hw, v: Math.max(0, rs.v), still: parked, stay: parked }); }
    if (g.player.mode === 'foot' && o.phase !== 'coming') out.push(g.player);
    return out;
  }
  // A ride stuck in a queue on the piece of road it is on (#199): there is no way round a queue there, so
  // once the car in front of it hasn't moved for TURN_WAIT seconds, on a two-way street with nothing coming
  // the other way and room to do it, the driver turns round in the road, as drivers do: a three-point turn
  // (forward across on full lock, back on the other lock, forward into the far lane), a short straight back
  // first where the car in front is close, and then on by another way from there. Each pose of it is tried
  // first against the traffic's cars, your car and the road's edges; where any fails it waits on in the queue.
  // TURN_R is the radius the car's middle runs on at full lock: a city taxi's 5.3 m kerb-to-kerb turning
  // radius (Toyota's JPN Taxi, the Prius) is about 4.5 m at the middle of the car, the rear axle on 3.8 m
  const TURN_WAIT = 20, TURN_R = 4.5, TURN_V = 1.6;
  function turnPoses(x0, y0, h0, back, w, keep) {
    // the bicycle model: (direction, steer, angle) for each leg; a found so that the far lane is w across
    const run = (a, out) => {
      let x = 0, y = 0, h = 0;
      const legs = [[-1, 0, back], [1, 1, a], [-1, -1, Math.PI - 2 * a], [1, 1, a]];
      for (const [v, sg, amt] of legs) {
        const L = sg ? TURN_R * amt : amt, n = Math.max(1, Math.ceil(L / 0.25));
        for (let i = 0; i < n; i++) {
          x += v * Math.sin(h) * L / n; y += v * Math.cos(h) * L / n; h += v * sg / TURN_R * L / n;
          if (out) out.push({ x, y, h, v });
        }
        if (out && out.length) out[out.length - 1].stop = true;
      }
      return x;
    };
    let lo = 0.6, hi = 1.5;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (run(m) < w) lo = m; else hi = m; }
    const loc = [];
    run((lo + hi) / 2, loc);
    // local (x across to the far lane, y ahead) to the map: across is the side away from the kerb
    const fx = Math.sin(h0), fy = Math.cos(h0), ux = fy * keep, uy = -fx * keep;
    return loc.map(q => ({ x: x0 + ux * q.x + fx * q.y, y: y0 + uy * q.x + fy * q.y, h: h0 + keep * q.h, v: q.v, stop: q.stop }));
  }
  // the way a ride backs out of a one-way street it can't turn round in (#283): back along its lane to the
  // junction behind, the tail swung away from the way out it takes there, and forward into that way's lane.
  // pl: where it is on the roads; ok(q): whether a pose has room. { poses, at: the place it sets off from on the
  // way out, { line, s, dir } } or a reason why not
  function reversePoses(o, pl, ok) {
    const st = o.drv.st, l = g.roadNet.L[pl.line], back = pl.dir > 0 ? pl.s : l.len - pl.s;
    if (back > 80) return `the junction behind is ${back.toFixed(0)} m back`;
    const k = pl.dir > 0 ? 0 : l.pts.length / 3 - 1, av = g.roadNet.avoid;
    const outs = (g.roadNet.nodes.get(g.roadNet.key(l.pts[3 * k], l.pts[3 * k + 1])) || []).filter(([li, e]) => li !== pl.line && g.roadNet.L[li].ow !== (e === 0 ? -1 : 1) && !(av && av[li]) && !(g.roadNet.fit && g.roadNet.fit[li] < o.C.hw));
    if (!outs.length) return 'no other way out of the junction behind';
    // its place across its lane, kept as it backs; the points along the street back to dIn from the junction
    g.roadNet.at(pl.line, pl.s, g.rq);
    const lat = (st.x - g.rq.x) * -g.rq.hy + (st.y - g.rq.y) * g.rq.hx, q = {};
    const onA = sA => { g.roadNet.at(pl.line, sA, q); return { x: q.x - q.hy * lat, y: q.y + q.hx * lat, h: Math.atan2(q.hx * pl.dir, q.hy * pl.dir), v: -1 }; };
    const R = TURN_R, D = 0.25;
    for (const [li, e] of outs) {
      const L1 = g.roadNet.L[li], dir = e === 0 ? 1 : -1, off = (g.junctions.centred && g.junctions.centred(li) ? 0 : OECars.LANE) * g.keepSign;
      for (const dIn of [6, 4.5, 8, 3]) {
        if (dIn >= back - 0.5) continue;
        const legA = [];
        for (let u = 0; u <= back - dIn; u += D) legA.push(Object.assign(onA(pl.s - pl.dir * u), { leg: true })); // (leg: on the straight back along the street)
        if (legA.length < 2) continue;
        const P0 = legA[legA.length - 1];
        for (const dOut of [7, 10, 5]) {
          if (dOut > L1.len - 2) continue;
          g.roadNet.at(li, dir > 0 ? dOut : L1.len - dOut, q);
          const hT = Math.atan2(q.hx * dir, q.hy * dir), T = { x: q.x - Math.cos(hT) * off, y: q.y + Math.sin(hT) * off, h: hT };
          const turnBy = Math.atan2(Math.sin(hT - P0.h), Math.cos(hT - P0.h));
          if (Math.abs(turnBy) > 2.4) continue; // (a way out behind it: a turn in the junction, not this)
          for (const f of [0.75, 1, 0.5, 1.15]) {
            // backing round: the nose swings towards the way out
            const arc = [];
            let x = P0.x, y = P0.y, h = P0.h;
            const n = Math.max(1, Math.round(R * Math.abs(turnBy) * f / D)), sg = -Math.sign(turnBy);
            for (let i = 0; i < n; i++) { x -= Math.sin(h) * D; y -= Math.cos(h) * D; h -= sg / R * D; arc.push({ x, y, h, v: -1 }); }
            // then forward into its lane: a curve from there to T, as tight as its lock at most
            const ax = T.x - x, ay = T.y - y, dist = Math.hypot(ax, ay);
            if (dist < 2 || ax * Math.sin(h) + ay * Math.cos(h) < 0.3 * dist) continue;
            const c1 = dist * 0.4, B0 = [x, y], B1 = [x + Math.sin(h) * c1, y + Math.cos(h) * c1], B2 = [T.x - Math.sin(T.h) * c1, T.y - Math.cos(T.h) * c1], B3 = [T.x, T.y];
            const fw = [], m = Math.max(4, Math.ceil(dist * 1.6 / D));
            let px = x, py = y, ph = h, worst = 0;
            for (let i = 1; i <= m; i++) {
              const t = i / m, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3;
              const qx = a * B0[0] + b * B1[0] + c * B2[0] + d * B3[0], qy = a * B0[1] + b * B1[1] + c * B2[1] + d * B3[1], run = Math.hypot(qx - px, qy - py);
              if (run < 1e-3) continue;
              const qh = Math.atan2(qx - px, qy - py);
              worst = Math.max(worst, Math.abs(g.angDiff(qh, ph)) / run);
              fw.push({ x: qx, y: qy, h: qh, v: 1 }); px = qx; py = qy; ph = qh;
            }
            if (!fw.length || worst > 1.15 / R) continue; // (no bend in it tighter than its lock)
            const poses = legA.concat(arc);
            poses[poses.length - 1].stop = true;
            poses.push(...fw);
            poses[poses.length - 1].h = T.h;
            const bad = poses.findIndex(p => !ok(p));
            if (bad < 0) return { poses, at: { line: li, s: dir > 0 ? dOut : L1.len - dOut, dir } };
          }
        }
      }
    }
    return 'no room to back out';
  }
  // (force: now, wherever it is, as tools/game_check.js asks for one through __game.turnRide; the street, the room
  // and the traffic are still asked)
  function turnRound(o, dt, force = false) {
    const st = o.drv.st, b = st.block && st.block.line >= 0 && g.cars.live.includes(st.block) ? st.block : null;
    if (!force) {
    const queued = !st.mv && st.v < 0.3 && b && b.v < 0.3 && !/^the line/.test(st.why || '');
    if (!queued) { o.qT = 0; o.qAt = null; return; }
    if (!o.qAt || o.qAt.c !== b || Math.hypot(b.x - o.qAt.x, b.y - o.qAt.y) > 1) { o.qAt = { c: b, x: b.x, y: b.y }; o.qT = 0; }
    o.qT = (o.qT || 0) + dt;
    if (o.qT < TURN_WAIT || g.clockT - (o.turnLook || 0) < 2) return;
    // (a queue held at a red, or a scramble's walk, moves when its light changes: it waits that out, as a
    // driver does, unless it has stood through more than two cycles' worth of it)
    let hd = b;
    for (let k = 0; k < 30 && hd.front && hd.front.line != null && (hd.why === 'car' || hd.why === 'held'); k++) hd = hd.front;
    if (['light', 'walk', 'amber'].includes(hd.why) && hd.lineArm && hd.lineArm.j.sig && o.qT < 120) { o.turnNo = `the queue's head waits at a light (${hd.why})`; return; }
    } else if (st.mv) { o.turnNo = 'in a junction'; return; }
    o.turnLook = g.clockT;
    const pl = placeOnRoute(st), to = o.phase === 'coming' ? o.pickup : st.route.to;
    if (!pl || !to) { o.turnNo = 'nowhere on the roads'; return; }
    const l = g.roadNet.L[pl.line];
    if (l.ow) { reverseOut(o, pl, to, b, force); return; } // (a one-way street: it backs out to the junction behind, #283)
    if (b && !force && b.line !== pl.line) { o.turnNo = 'the queue is on the next piece'; return; } // (a queue on this piece of road only: one on the next, the reroute goes round)
    if (pl.s < 6 || pl.s > l.len - 6) { o.turnNo = 'by a junction'; return; } // (by the junction, where it would turn in the junction)
    // nothing coming the other way on this street within 45 m, nor on the move within 15 m (about to turn into it)
    if (g.cars.live.some(c => c.line >= 0 && c !== b && Math.abs(c.z - st.z) < 3 && c.v > 0.3 && (c.line === pl.line ? c.dir !== pl.dir && Math.hypot(c.x - st.x, c.y - st.y) < 45 : Math.hypot(c.x - st.x, c.y - st.y) < 15))) { o.turnNo = 'a car coming'; return; }
    const half = g.ROAD_HALF[l.c] || 3.5, w = 2 * OECars.LANE;
    if (half < 3) { o.turnNo = 'a street too narrow'; return; } // (a lane too narrow to turn in)
    const gapAhead = b ? Math.hypot(b.x - st.x, b.y - st.y) - (b.half || 2.3) - o.C.half : Infinity;
    const z = st.z, mine = g.myCar && g.player.mode !== 'car' ? g.myCar.D.st : null;
    let poses = null;
    for (const back of [Math.max(0, 3 - gapAhead), Math.max(0, 3 - gapAhead) + 1.5, Math.max(0, 3 - gapAhead) + 3]) {
      const P = turnPoses(st.x, st.y, st.h, back, w, g.keepSign);
      // the street's middle, from the lane the car is in: every corner of every pose inside the kerbs
      const cx = st.x + Math.cos(st.h) * g.keepSign * OECars.LANE, cy = st.y - Math.sin(st.h) * g.keepSign * OECars.LANE, ux = Math.cos(st.h), uy = -Math.sin(st.h);
      // (the wheels inside the kerbs; the body's corners may hang over them, as a bumper swings out over the
      // pavement in a turn in the road, but not into a wall, a post or a facade: Shibuya's 7 m streets had no
      // room for a turn with the whole body kept off the kerb, #264)
      const ok = P.every(q => {
        const fx = Math.sin(q.h), fy = Math.cos(q.h), ax = o.C.half * 0.55;
        for (const [a, c] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const wx = q.x + fx * a * ax + fy * c * (o.C.hw - 0.1), wy = q.y + fy * a * ax - fx * c * (o.C.hw - 0.1);
          if (Math.abs((wx - cx) * ux + (wy - cy) * uy) > half - 0.15) return false;
          const px = q.x + fx * a * o.C.half + fy * c * o.C.hw, py = q.y + fy * a * o.C.half - fx * c * o.C.hw;
          const off = Math.abs((px - cx) * ux + (py - cy) * uy);
          if (off > half + 0.9 || (off > half - 0.25 && !g.nav.room(px, py, z, 0.15, 1.2))) return false;
        }
        if (g.cars.footprint(q.x, q.y, z, q.h, o.C.half, o.C.hw, 0.25) > 0) return false;
        if (mine && Math.hypot(mine.x - q.x, mine.y - q.y) < o.C.half + g.myCar.C.half + 0.3) return false;
        return true;
      });
      if (ok) { poses = P; break; }
    }
    if (!poses) { o.turnNo = 'no room to turn'; return; }
    const e = poses[poses.length - 1], back = Math.max(0, (e.x - st.x) * -Math.sin(st.h) + (e.y - st.y) * -Math.cos(st.h));
    const sR = Math.max(0, Math.min(l.len, pl.s - pl.dir * back));
    const left = st.end - st.s, rt = g.roads.route({ line: pl.line, s: sR, dir: -pl.dir }, to, 6000, undefined, jamAhead(st));
    if (!rt || rt.len > left + (o.phase === 'driving' ? Math.max(400, left) : 400)) { o.turnNo = rt ? `the way back round is ${rt.len.toFixed(0)} m` : 'no way back round'; return; }
    // (a way that turns straight back on itself would only bring it back into the queue)
    for (let i = 1; i + 1 < rt.pts.length && i < 40; i++) {
      const p0 = rt.pts[i - 1], p1 = rt.pts[i], p2 = rt.pts[i + 1];
      if (Math.abs(g.angDiff(Math.atan2(p2[0] - p1[0], p2[1] - p1[1]), Math.atan2(p1[0] - p0[0], p1[1] - p0[1]))) > 2.6) { o.turnNo = 'the way back turns round again'; return; }
    }
    o.turn = { poses, i: 0, u: 0, wait: 0.4, rt };
    o.turned = (o.turned || 0) + 1;
    if (o.phase === 'driving' && g.player.vehicle === o) g.H.toast(`<b>${o.name}:</b> ${OEActors.pick(['This isn\'t moving. I\'ll turn round.', 'We\'re not getting through. Turning round.', 'Nothing\'s moving up there. Let\'s go back round.'])}`);
  }
  // a ride on a one-way street blocked ahead backs out to the junction behind and goes on by another way from
  // there (#283), the traffic stopped behind it on the street backing out first
  function reverseOut(o, pl, to, b, force) {
    const st = o.drv.st, z = st.z, mine = g.myCar && g.player.mode !== 'car' ? g.myCar.D.st : null, l = g.roadNet.L[pl.line];
    // the cars of the traffic behind it on this street, stopped: they back out first (and it tries again in a moment)
    const behind = g.cars.live.filter(c => c.line === pl.line && c.dir === pl.dir && (c.s - pl.s) * pl.dir < 0 && Math.abs(c.z - z) < 3);
    if (behind.length) {
      const moving = behind.filter(c => c.v > 0.5 && !c.rev);
      if (moving.length) { o.turnNo = 'a car coming up behind'; return; }
      let asked = 0;
      for (const c of behind) if (c.rev || (g.cars.reverse && g.cars.reverse(c))) asked++;
      o.turnNo = asked ? 'the cars behind back out first' : 'a car behind'; return;
    }
    const half = g.ROAD_HALF[l.c] || 3.5;
    const ok = q => {
      const fx = Math.sin(q.h), fy = Math.cos(q.h);
      for (const [a, c] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const px = q.x + fx * a * o.C.half + fy * c * o.C.hw, py = q.y + fy * a * o.C.half - fx * c * o.C.hw;
        if (!g.nav.room(px, py, z, 0.15, 1.2)) return false;
        // (on the carriageway: the body's corners within its road's kerbs, or over them by less than a bumper)
        const r = g.roadNet.nearest(px, py, 12, z);
        if (!r || r.d > (g.ROAD_HALF[g.roadNet.L[r.line].c] || half) + 0.6) return false;
      }
      if (g.cars.footprint(q.x, q.y, z, q.h, o.C.half, o.C.hw, q.leg ? 0.1 : 0.8) > 0) return false; // (in the junction, room round it: a car close by there, held, would hold it in turn)
      if (mine && Math.hypot(mine.x - q.x, mine.y - q.y) < o.C.half + g.myCar.C.half + 0.3) return false;
      return true;
    };
    const R = reversePoses(o, pl, ok);
    if (typeof R === 'string') { o.turnNo = R; return; }
    const left = st.end - st.s, rt = g.roads.route(R.at, to, 6000, undefined, new Set([pl.line, ...jamAhead(st)]));
    if (!rt || rt.len > left + (o.phase === 'driving' ? Math.max(500, left) : 500)) { o.turnNo = rt ? `the way round is ${rt.len.toFixed(0)} m` : 'no way round'; return; }
    if (rt.nodes && rt.nodes.some(nd => nd.line === pl.line)) { o.turnNo = 'the way round comes back up this street'; return; }
    o.turn = { poses: R.poses, i: 0, u: 0, wait: 0.4, rt, rev: true, pl, ok };
    o.turned = (o.turned || 0) + 1; o.reversed = (o.reversed || 0) + 1;
    if (o.phase === 'driving' && g.player.vehicle === o) g.H.toast(`<b>${o.name}:</b> ${OEActors.pick(['One-way and nothing\'s moving. I\'ll back out.', 'We\'re stuck in here. Backing up to the corner.', 'Can\'t turn round in this one. Reversing out.'])}`);
  }
  function turnStep(o, dt) {
    const T = o.turn, st = o.drv.st, P = T.poses;
    st.brake = T.wait > 0; st.signal = 0;
    if (T.wait > 0) { T.wait -= dt; st.v = 0; return; }
    // (a car of the traffic come into where it goes next: it waits there, as a driver does part way round, up
    // to 10 s; the traffic gives way to it, so the car is one already there or crossing, Queenstown, #264)
    const nx = P[Math.min(T.i + 1, P.length - 1)];
    // (it never goes on into one, backing out of a one-way street or turning in the road: after 3 s it asks it to back off,
    // and after 40 s gives up the turn where it is and drives on from there; a three-point turn went on into a queue after
    // 10 s held, 1.8 m deep, Shibuya and Shinjuku, #283, #296)
    if (nx !== P[T.i] && g.cars.footprint(nx.x, nx.y, st.z, nx.h, o.C.half * 0.95, o.C.hw * 0.95, 0) > g.cars.footprint(st.x, st.y, st.z, st.h, o.C.half * 0.95, o.C.hw * 0.95, 0) + 0.01) {
      T.held = (T.held || 0) + dt; st.v = 0; st.brake = true; T.by = g.cars.footBy; // (what holds it, for the checks)
      if (T.held > 3 && g.junctions.makeWay) g.junctions.makeWay(nx.x, nx.y, st.z, nx.h, o.C.half, o.C.hw, 0.3);
      // (a car come into the street behind it since, stopped there for it: it backs out first, Fushimi Inari's piece 99)
      if (T.rev && T.held > 3 && T.pl && g.cars.reverse) for (const c of g.cars.live) if (c.line === T.pl.line && c.dir === T.pl.dir && c.v < 0.3 && !c.rev && Math.hypot(c.x - nx.x, c.y - nx.y) < 10) g.cars.reverse(c);
      // (held 10 s on the way back: its way out worked out again from where it is, round what holds it now)
      if (T.rev && T.held > 10 && !T.again && T.pl && P[T.i].leg) { // (still on the straight back: from there it can take up another way round from where it is, without a jump)
        T.again = true;
        const A = g.roadNet.L[T.pl.line], q = g.roadNet.nearest(st.x, st.y, 6, st.z, 3, 0, i => i !== T.pl.line);
        if (q && A) {
          const R2 = reversePoses(o, { line: T.pl.line, s: q.s, dir: T.pl.dir }, T.ok);
          const rt2 = typeof R2 === 'string' ? null : g.roads.route(R2.at, T.rt.to, 6000, undefined, new Set([T.pl.line]));
          if (rt2 && !(rt2.nodes && rt2.nodes.some(nd => nd.line === T.pl.line))) { Object.assign(T, { poses: R2.poses, i: 0, u: 0, wait: 0.4, rt: rt2, held: 0 }); return; }
        }
      }
      if (T.held > 40) { // (on from where it stands, by the nearest road's lane)
        const pl = g.placeOf(st), to = o.phase === 'coming' ? o.pickup : T.rt.to, rt2 = pl && to && g.roads.route(pl, to, 6000);
        const p0 = rt2 && rt2.pts[0], p1 = rt2 && rt2.pts[Math.min(1, rt2.pts.length - 1)], clear = p0 && g.cars.footprint(p0[0], p0[1], st.z, Math.atan2(p1[0] - p0[0], p1[1] - p0[1]), o.C.half, o.C.hw, 0.1) === 0; // (not on into a car where it takes up the lane; after a minute on all the same, its driver braking for what is in its way: it stood for good, Higashiyama)
        if (rt2 && (clear || T.held > 60)) { const opts = Object.assign({}, o.drv.opts, { from: 'lane', v: 0 }); o.drv.leave(); o.drv = OECars.chauffeur(o.C, rt2, opts); o.drv.opts = opts; o.sig = []; o.scr = []; o.qArms = []; o.turn = null; o.qT = 0; o.qAt = null; o.rerouteT = g.clockT; }
      }
      return;
    }
    T.held = 0;
    T.u += TURN_V * dt;
    while (T.u >= 0.25 && T.i < P.length - 1) {
      T.u -= 0.25;
      if (P[T.i].stop) { T.i++; T.wait = 0.6; T.u = 0; break; } // (a moment at each change of gear)
      T.i++;
    }
    const q = P[T.i];
    Object.assign(st, { x: q.x, y: q.y, h: q.h, v: q.v * (T.wait > 0 ? 0 : TURN_V), steer: 0 });
    if (T.i < P.length - 1) return;
    // round: on by the new way, from its lane
    const opts = Object.assign({}, o.drv.opts, { from: 'lane', v: 0 });
    o.drv.leave();
    o.drv = OECars.chauffeur(o.C, T.rt, opts);
    o.drv.opts = opts;
    o.sig = []; o.scr = []; o.qArms = [];
    o.turn = null; o.qT = 0; o.qAt = null; o.rerouteT = g.clockT;
  }
  // the roads up to 250 m ahead on a ride's way (not the one it is on) that are jammed: a car of the
  // traffic on one has stood longer than a red light lasts (40 s, past the 95th percentile of the waits at a
  // red), or has stood 20 s in a junction it is crossing (the pieces of road inside the junction count)
  function jamAhead(st) {
    const out = new Set(), N = st.route.nodes || [], P = st.P, ahead = new Set();
    for (const nd of N) { const sN = P.cum[Math.min(nd.k, P.cum.length - 1)]; if (sN < st.s) continue; if (sN - st.s > 250) break; ahead.add(nd.line); }
    if (st.route.to && P.len - st.s < 250) ahead.add(st.route.to.line);
    if (!ahead.size) return out;
    for (const c of g.cars.live) {
      if (c.line < 0 || !ahead.has(c.line) || !(c.still > 20)) continue;
      if (c.still > 40 || (c.mv && c.still > 20)) out.add(c.line);
    }
    return out;
  }
  // where a ride is on the road network, read from its own route (the piece of road it is driving along
  // at st.s, and how far along it), not from the nearest road to it, which near a junction may be the
  // street across; placeOf's guess where the route can't say
  function placeOnRoute(st) {
    const rt = st.route, P = st.P, s0 = Math.min(st.s, st.end), at = (line, s, dir) => { g.roadNet.at(line, s, g.rq); return { line, s, dir, x: g.rq.x, y: g.rq.y, z: g.rq.z }; };
    for (const nd of rt.nodes || []) {
      const sN = P.cum[Math.min(nd.k, P.cum.length - 1)];
      if (sN < s0) continue;
      const l = g.roadNet.L[nd.line], back = sN - s0, dir = nd.end === 1 ? 1 : -1;
      if (back <= l.len) return at(nd.line, dir > 0 ? l.len - back : back, dir);
      break;
    }
    const to = rt.to;
    if (to && to.line != null) { const l = g.roadNet.L[to.line], s = to.s - to.dir * (P.len - s0); if (s >= -0.5 && s <= l.len + 0.5) return at(to.line, Math.max(0, Math.min(l.len, s)), to.dir); }
    return g.placeOf(st);
  }
  // in your sight: within 40 m of you, or on screen within 120 m
  function inSight(x, y, z) { const d = Math.hypot(x - g.player.x, y - g.player.y); return d < 40 || (d < 120 && inView(x, y, z)); }
  // whether a point is in the camera's view (not whether something hides it)
  const frustum = new THREE.Frustum(), projView = new THREE.Matrix4();
  function inView(x, y, z) {
    projView.multiplyMatrices(g.camera.projectionMatrix, g.camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    return frustum.containsPoint(g.W(x, y, z + 1));
  }
  // a driver's step along its way: the drive itself, a way round a scramble's walk or a jam, turning round in
  // the road, backing off for a car that waits on it. A ride's driver (rideStep), and the autopilot at the
  // wheel of your own car (pilotStep): one driver, so that what one learns the other has
  function driverStep(o, dt) {
    let st = o.drv.st;
    if (o.hold) st.v = 0; // (waiting in its lane for you to get back in)
    else if (o.turn) turnStep(o, dt);
    else {
      // Out of sight a ride drives through the traffic (inTheWay), and a car coming for you, on the move, is driven into by
      // it (game.js: soft). So it could come into sight inside a car, or be stopped in one, and from then on neither moved:
      // the ride never steps further into a car, the traffic never into a ride, the car in its box kept its junction from
      // clearing, and the three reasons took turns, each setting the others' clocks back, so nothing that counts seconds
      // ever ran out (#97: the car sent for you stood in view for the whole of a check, 6.2 m inside the car ahead, giving
      // way to a car across it at 0.6 m, waiting for a junction to clear). Two rules end it:
      // - seen again, it goes on as it went unseen until it is clear of every car (o.thru), and only then reads the traffic;
      // - coming for you and COME_STILL seconds without 3 m gained (o.stillT, which no change of reason sets back), it goes
      //   on so too, lights and all, for 10 m and until it is clear (o.stuck): a car that comes late through a knot, never
      //   one that does not come. A red light, a walk and people on its way are waited out for COME_WAIT first, longer than
      //   any of them lasts; people are never driven into (the driver's own `people`), nor a scramble's walk.
      const sight = inSight(st.x, st.y, st.z), C = o.C;
      const inCar = () => g.cars.footprint(st.x, st.y, st.z, st.h, C.half, C.hw, 0) > 0.02;
      if (o.phase === 'coming' && !o.stuck) {
        const ruled = st.v < 0.3 && ((st.block && st.block.walker) || (/^the line/.test(st.why || '') && /red|amber|stop sign|zebra|rails/.test(st.junction || '')));
        if ((o.stillT || 0) > (ruled ? COME_WAIT : COME_STILL)) { o.stuck = true; o.stuckS = st.s; o.stucks = (o.stucks || 0) + 1; o.stuckWhy = st.intent || st.why || ''; }
      }
      if (o.stuck && (o.phase !== 'coming' || (st.s > o.stuckS + 10 && !inCar()))) o.stuck = false;
      o.thru = !!o.stuck || (o.phase === 'coming' && (!sight || (!!o.thru && inCar())));
      o.drv.update(dt, inTheWay(o), false, (sight && !o.stuck) || g.SCR_BOX.some(j => Math.hypot(st.x - j.x, st.y - j.y) < j.r + 60)); // (and the lights, in sight, and a scramble's always: out of sight or not, nobody drives into its walk)
    }
    // how long it has gone without getting 3 m further on its way: held up, whether it stands or inches along a queue. (#97:
    // read as its speed this frame, under 0.5 m/s, a ride creeping at 0.6 in a queue that stood for minutes set the clock
    // back every frame, and was never moved on: not cut on to its stop with you in it, not found a way round coming for you)
    if (o.progS == null || st.s < o.progS || st.s - o.progS > 3) { o.progS = st.s; o.stillT = 0; } else if (!o.hold && !o.turn) o.stillT += dt;
    // running well late in a jam and out of view, it finds its way round, a stretch at a time, to a
    // clear piece of road (games keep the cars that come for you on time); in view it queues as it would
    if (o.phase === 'coming' && g.clockT - o.t0 > (o.T0 || 20) + 6 && (st.v < 0.5 || o.stillT > 3) && g.clockT - (o.hopT || 0) > 2.5 && !inView(st.x, st.y, st.z)) {
      o.hopT = g.clockT;
      const P = o.drv.path, at = {};
      for (let s = Math.min(st.end - 0.5, st.s + 22); s > st.s + 6; s -= 4) {
        P.at(s, at);
        if (!inView(at.x, at.y, at.z) && clearAt(o, s, 1)) { o.drv.jump(s); break; } // (and clear of people where it will stand, as a skipped ride is set down: #50)
      }
    }
    // coming for you up to a scramble whose walk is on, or about to start (its other road's amber or the all
    // red before it), with 90 m still to go: a way round it, if one reaches you sooner than the walk would
    // let it through, as a driver who sees the walk start turns off (#243: Shinjuku's taxi stood 26 s so)
    if (o.phase === 'coming' && !st.mv && (o.scr || []).length && g.clockT - (o.scrLook || 0) > 1 && o.drv.opts
      && Math.abs(st.lat - (st.lane ?? OECars.LANE)) < 0.2 && Math.abs(st.shift) < 0.1 && !st.backoff) {
      o.scrLook = g.clockT;
      const k = o.scr.findIndex(s => s > st.s + 2), j = k >= 0 ? o.scrJ[k] : null;
      const walk = j && !(o.walkRound && o.walkRound.has(j)) && (j.ph === 3 || (j.nxt === 3 && j.st !== 'g')); // (each scramble gone round once at most: a way round that met it again doesn't swing back)
      if (walk && o.scr[k] - st.s < 90 && o.scr[k] - st.s > 12) {
        const left = j.ph === 3 ? Math.max(0, j.green[3] - j.t) + (j.allred || 2) : j.green[3] + (j.allred || 2) * 2 + (j.st === 'y' ? j.amber : 0);
        const pl = placeOnRoute(st), shun = new Set();
        (o.walkRound || (o.walkRound = new Set())).add(j);
        for (const q of o.walkRound) { for (const b of q.arms) shun.add(b.line); for (const l of q.inner || []) shun.add(l); }
        if (pl) { shun.delete(pl.line); shun.delete(o.pickup.line); }
        const rt = pl ? g.roads.route(pl, o.pickup, 4000, undefined, shun, true) : null;
        if (rt && !(rt.nodes || []).some(nd => shun.has(nd.line))) {
          const alt = planOn(rt, Object.assign({}, pl, { v: st.v }), o.pickup);
          if (alt.T + 3 < o.drv.timeLeft() + left) {
            const opts = Object.assign({}, alt.opts, { from: 'lane', v: st.v });
            o.drv.leave();
            o.drv = OECars.chauffeur(o.C, alt.rt, opts);
            o.drv.opts = opts;
            st = o.drv.st;
            o.sig = alt.sig; o.scr = alt.scr; o.scrJ = alt.scrJ; o.qArms = alt.qArms; o.rerouteT = g.clockT;
            o.roundWalk = (o.roundWalk || 0) + 1;
          }
        }
      }
    }
    // a jam on its way, as a navigator with live traffic sees one: held up more than 10 s behind a queue
    // in view (one it can't pass for the traffic coming the other way), or, up to 250 m ahead on its way, a
    // road where a car has stood longer than a red light lasts (40 s) or a junction a car has stood in for
    // 20 s. It looks for another way from where it is, round those roads, and takes it if it is no more
    // than 300 m longer (on the trip, with you in it, 150 m or a quarter as far again: a long way round with the meter running reads as a detour), as a driver with a map app does; on the
    // trip the driver says so. Not while it is in a junction (its way across is held), and every 8 s at most
    if ((o.phase === 'coming' || o.phase === 'driving') && !st.mv && g.clockT - (o.rerouteT || 0) > 8 && o.drv.opts && g.clockT - (o.jamLook || 0) > 1
      && Math.abs(st.lat - (st.lane ?? OECars.LANE)) < 0.2 && Math.abs(st.shift) < 0.1 && !st.backoff) { // (settled in its lane: the new way starts from the lane, not the kerb or a swing out round a car)
      o.jamLook = g.clockT;
      const shun = jamAhead(st);
      if (st.held > 10 && st.block && st.block.line >= 0) shun.add(st.block.line);
      const pl = shun.size ? placeOnRoute(st) : null;
      if (pl) shun.delete(pl.line); // (the road it is on: no way round that)
      const to = o.phase === 'coming' ? o.pickup : st.route.to;
      if (pl && shun.size && to) {
        o.rerouteT = g.clockT;
        const left = st.end - st.s, rt = g.roads.route(pl, to, 6000, undefined, shun);
        // (coming for you, by the time it takes, the new way's lights and scrambles near you counted as when a ride is
        // picked, against the time left and a red light's wait for the jam: a way 100 m round that met a scramble's
        // red made Shibuya's taxi 57 s, #243)
        const sooner = o.phase !== 'coming' || !rt || planOn(rt, Object.assign({}, pl, { v: st.v }), o.pickup).T < o.drv.timeLeft() + SCR_WAIT * (o.scr || []).filter(q => q > st.s + 2).length + 12;
        if (rt && sooner && rt.len < left + (o.phase === 'driving' ? Math.max(150, left * 0.25) : 300) && !(rt.nodes || []).some(nd => shun.has(nd.line))) {
          const opts = Object.assign({}, o.drv.opts, { from: 'lane', v: st.v });
          o.drv.leave();
          o.drv = OECars.chauffeur(o.C, rt, opts);
          o.drv.opts = opts;
          st = o.drv.st;
          o.sig = []; o.scr = []; o.qArms = []; o.rerouted = (o.rerouted || 0) + 1; // (the lights it was to stop at were on the old way)
          if (o.phase === 'driving' && g.player.vehicle === o) g.H.toast(`<b>${o.name}:</b> ${OEActors.pick(['The traffic\'s backed up ahead. I\'ll go round.', 'Jam ahead, I\'ll take another way.', 'It\'s stuck up there. Let\'s go round.'])}`);
        }
      }
    }
    // a junction that won't clear (#355): stood 25 s at its line with no red light to wait for, for a movement across
    // it that never ends (a car stuck in the junction), the driver takes another way from where it stands, however
    // much longer (up to three times what was left and 400 m); with you in it, or at your own wheel, not on its way
    // to you (a ride late for you has its own ways on, above)
    if (o.phase === 'driving' && !o.turn && !o.hold && !st.mv && o.drv.opts) {
      const a = st.lineAt, waiting = st.v < 0.3 && a && /^the line/.test(st.why || '') && !/red|amber/.test(st.junction || '') && g.junctions.light(a, st.lineEx) !== 'r';
      o.boxT = waiting ? (o.boxT || 0) + dt : 0;
      if (o.boxT > 25 && g.clockT - (o.boxLook || 0) > 5) {
        o.boxLook = g.clockT;
        // (out of it by another exit than the one it waits for, which may be clear of what stands there; with none,
        // or stood 45 s, it turns round in the road and goes on from there: turnRound)
        const N = st.route.nodes || [], P = st.P, i = N.findIndex(nd => P.cum[Math.min(nd.k, P.cum.length - 1)] >= st.s - 0.5), to = st.route.to;
        const exitLine = i >= 0 && N[i + 1] ? N[i + 1].line : to ? to.line : null, pl = placeOnRoute(st);
        const left = st.end - st.s, rt = pl && to && exitLine != null && o.boxT < 45 ? g.roads.route(pl, to, 9000, undefined, new Set([exitLine])) : null;
        if (rt && rt.len < left * 3 + 400 && !(rt.nodes || []).slice(0, 3).some(nd => nd.line === exitLine)) {
          const opts = Object.assign({}, o.drv.opts, { from: 'lane', v: 0 });
          o.drv.leave();
          o.drv = OECars.chauffeur(o.C, rt, opts);
          o.drv.opts = opts;
          st = o.drv.st;
          o.sig = []; o.scr = []; o.qArms = []; o.boxT = 0; o.rerouted = (o.rerouted || 0) + 1; o.boxRound = (o.boxRound || 0) + 1;
          if (g.player.vehicle === o) g.H.toast(`<b>${o.name}:</b> That junction's not moving. I'll go another way.`);
        } else if (o.boxT > 40) { turnRound(o, 0, true); st = o.drv.st; if (o.turn) { o.boxT = 0; o.boxRound = (o.boxRound || 0) + 1; } }
      }
    }
    // a jam that no light explains (#355): stood 40 s behind cars of the traffic whose head stands too, at no red
    // light (two cars each waiting on the other in a junction, one facing it in a street one car wide), with no
    // way to turn round. The head of the jam is asked out of the way (actors.js unjam), and again 20 s on. (Its own
    // light counts only short of its line: inside the junction, a car that waits on it there is a knot, not a queue)
    if (o.phase === 'driving' && !o.hold && g.cars && g.cars.unjam) {
      let q = st.block && st.block.of ? st.block.of : st.block, head = null;
      if (st.v < 0.3 && q && g.cars.C.includes(q)) { const seen = new Set(); head = q; while (head.front && g.cars.C.includes(head.front) && !seen.has(head.front) && seen.size < 8) { seen.add(head); head = head.front; } }
      const lit = c => c.lineArm && !c.mv && /^[ra]$/.test(g.junctions.light(c.lineArm, c.lineEx) || '');
      o.jamT = head && head.v < 0.1 && !head.park && !lit(head) && !lit(q) && !(st.lineAt && !st.mv && g.junctions.light(st.lineAt, st.lineEx) === 'r') ? (o.jamT || 0) + dt : st.v > 1 ? 0 : Math.max(0, (o.jamT || 0) - dt); // (eased down, not reset: what holds it flickers between the car and the junction)
      if (o.jamT > 40) { o.jamT = 20; o.unjam = g.cars.unjam(head, o.unjamWas === head); o.unjamWas = head; o.unjammed = `${(o.unjammed || '')} ${o.unjam || 'not'}`; }
    }
    if (!o.turn && !o.hold && (o.phase === 'coming' || o.phase === 'driving')) { turnRound(o, dt); st = o.drv.st; }
    // at a junction's line, waiting for a car crossing in it, which stands in the junction for this ride's
    // nose (actors.js, why 'you'), or stopped behind a car that stands for it in turn: each waits on the
    // other, so after 2 s the ride backs off a metre or two
    // along its way, if the road behind it is clear, as a driver who pulled up too far does (#243: Shinjuku's
    // taxi stood 30 s so)
    if (!o.turn && !o.hold && st.v < 0.3 && !st.mv && !(st.backoff > 0)) {
      const mutual = g.cars.live.some(c => c.line >= 0 && c.v < 0.3 && c.why === 'you' && (c.youBy || '').startsWith(o.blockId || 'ride') && (c.mv ? /^the line/.test(st.why || '') || st.block === c || (st.block && st.block.of === c) : st.block === c || (st.block && st.block.of === c)) && Math.hypot(c.x - st.x, c.y - st.y) < 25); // (st.block: the car itself, or its stand-in as one stopped for good)
      o.mutJ = mutual ? (o.mutJ || 0) + dt : 0;
      if (o.mutJ > 2) { o.mutJ = -3; st.backoff = 1.5; o.yielded = (o.yielded || 0) + 1; }
    } else if (!(st.backoff > 0)) o.mutJ = 0;
    return st;
  }
  function rideStep(dt, night) {
    const o = g.ride, st = driverStep(o, dt);
    o.C.place(st.x, st.y, st.z, st.h, st.pitch, 0);
    o.C.animate(dt, { v: st.v, h: st.h, steer: st.steer, brake: st.brake, signal: st.signal, hazard: o.phase === 'waiting' || o.phase === 'arrived', night: Math.max(night, 0.45 * OECars.weather.lamps), on: true,
      inside: g.player.vehicle === o && g.cam.mode === 'cabin', near: st.gap,
      sign: o.kind === 'taxi' && (o.phase === 'coming' || o.phase === 'leaving') });
    o.driver.animate(dt, 0, 'sit', g.clockT);
    if (o.phase === 'driving') o.meter += st.v * dt;
    if (o.phase === 'coming' && st.done) {
      o.phase = 'waiting'; o.wait = 0; o.tArrived = g.clockT - o.t0;
      const far = Math.hypot(st.x - g.player.x, st.y - g.player.y);
      g.H.toast(`<b>${o.name}</b> has pulled in${o.kind === 'hire' ? ` in the ${rideCar(o)}, ${o.plate}` : ''}${far > 25 ? `, ${Math.round(far)} m from you` : ''}. <kbd>E</kbd> to get in.`);
      g.A.honk();
    }
    // the story's car standing for you, you at its door or getting in: the first signal on its way to where it takes you
    // called now (junctions.js priority), as the ride calls it on the move. Called only once it pulled away, it came too
    // late for the scramble 95 m on, whose walk began as you got in, ran its 28 s and its all red, and the car stood 34 s
    // in the queue under the JR viaduct. (A walk under way still runs its course, and is never passed over twice running.)
    if (o.dest && o.dest.id === 'story' && o.dest.at && (o.phase === 'boarding' || (o.phase === 'waiting' && Math.hypot(st.x - g.player.x, st.y - g.player.y) < 15))) {
      if (o.preRt === undefined) { const from = placeOnRoute(st) || st.route.to; o.preRt = (from && g.driveTo(from, o.dest.at[0], o.dest.at[1])) || null; }
      if (o.preRt && o.preRt.nodes) for (const nd of o.preRt.nodes) { const a = g.junctions.armAt(nd.line, nd.end); if (a && a.j.sig) { g.junctions.priority(a); break; } }
    }
    if (o.phase === 'waiting') {
      // a driver waits five minutes, as the apps' drivers do; one you have walked well away from, one
      o.wait += dt;
      if (o.wait > (Math.hypot(st.x - g.player.x, st.y - g.player.y) > 350 ? 60 : 300) && g.player.mode === 'foot' && !g.player.auto) { g.H.toast(`${o.name} couldn't wait any longer.`); rideAway(); }
    }
    if (g.player.mode === 'ride' && g.player.vehicle === o) {
      Object.assign(g.player, { x: st.x, y: st.y, z: st.z, h: st.h, speed: st.v });
      if (o.phase === 'driving' && g.clockT > o.talkT) { o.talkT = g.clockT + 24 + srnd() * 18; g.H.toast(`<b>${o.name}:</b> ${g.smalltalk(st.x, st.y)}`); }
      // the car a story sends, with you in it, is not sat in at a red or in the queue to one: held still STORY_HELD seconds,
      // the trip goes on to where it sets you down, as F takes it (the queue to the Scramble's arm under the viaduct waits out
      // its walk and its turns: on one way back to Hachiko 75 s of 127 were stood still)
      // (once under way: not while it waits at the kerb for a gap to pull out into, or the drive is never seen; but not for
      // good either: a queue standing beside the kerb for minutes held it there, #97, so four times as long there. Held
      // means no 3 m further on in that time, o.stillT: inching along a queue that does not move is held too)
      if (o.phase === 'driving' && g.player.vehicle === o && o.dest && o.dest.id === 'story') { o.driveT = (o.driveT || 0) + dt; if (!g.cine.active && o.stillT > STORY_HELD * (st.s > 8 ? 1 : 4)) { o.stillT = 0; o.cut = o.driveT; skipRide(); } }
      if (o.phase === 'driving' && st.done) {
        o.phase = 'arrived';
        const fare = g.life ? g.life.fare(o.meter, o.kind) : '';
        if (g.life) g.life.emit('ride', { kind: o.kind === 'taxi' ? 'taxi' : 'cab', to: o.dest.name, m: o.meter });
        g.H.toast(`<b>${o.name}:</b> Here we are: ${o.dest.name}. That's ${(o.meter / 1000).toFixed(1)} km${fare}. <kbd>E</kbd> to get out.`);
        g.A.chime();
      }
      g.A.car(0.22 + Math.min(1, st.v / 22) * 0.45, st.brake ? 0 : 0.3, 0.35);
      if (g.A.indicator) g.A.indicator(!!st.signal || o.phase === 'arrived'); // (the relay's tick in the cabin: audio.js)
      g.player.rig.animate(dt, 0, 'sit', g.clockT);
    }
    if (o.phase === 'leaving' && (g.clockT - o.t0 > 45 || Math.hypot(st.x - g.player.x, st.y - g.player.y) > 240 || st.done)) { o.drv.leave(); o.C.dispose(); g.ride = null; }
  }
  // the hail hint at the kerb (Y), beside whatever E does
  function kerbAction() {
    if (g.player.mode !== 'foot' || g.player.auto || !g.CARS_OK || (g.ride && g.ride.phase !== 'leaving') || g.player.speed > 1.8) return null;
    return g.roadNet.nearest(g.player.x, g.player.y, 11, g.player.z, 2.5) ? { key: 'Y', text: 'Hail a taxi', act: hail } : null;
  }

  // The prompt's second action. At a kerb, hailing a taxi; and on a phone, where no key reaches them, the ferry's
  // helm while she is under way and the car put back on the road when it has come to a stop
  function altAction() { if (g.story && g.story.on) return null; // (a story has no taxi to hail)
    const k = kerbAction();
    if (k || !g.touch) return k;
    const v = g.player.vehicle;
    if (g.player.mode === 'ferry' && v && v.phase === 'sail' && !v.helm) return { key: 'H', text: 'Take the helm', act: g.takeHelm };
    if (g.player.mode === 'car' && !g.pilot && Math.abs(g.myCar.D.st.speed) < 0.5) return { key: 'R', text: 'Back on the road', act: g.resetCar };
    return null;
  }
  // On a phone no hint names a key: each key in a message becomes the name of the button that does its work
  function touchKeys(s) {
    if (s.indexOf('<kbd>') < 0) return s;
    const m = g.player.mode;
    const word = { E: 'E', F: 'Skip', Y: 'Hail a taxi', H: m === 'car' ? 'Horn' : 'Take the helm', V: 'View', J: m === 'car' ? 'Auto' : 'Diary', I: 'Assist', K: 'Assist',
      Space: m === 'heli' ? 'Up' : m === 'car' ? 'Hand brake' : 'Jump', C: 'Down', M: 'Map', N: 'Phone', P: 'Passport', O: 'Photo', X: 'Run', Shift: 'Run', L: 'Show route',
      Enter: 'Save photo', Esc: 'Step back', R: 'Back on the road', Q: 'Lens', G: 'Guess', B: g.metro ? g.metro.name : 'Districts', T: 'the walk\'s name' };
    return s.replace(/<kbd>W<\/kbd>\/<kbd>S<\/kbd>/g, 'the stick up and down').replace(/<kbd>A<\/kbd>\/<kbd>D<\/kbd>/g, 'the stick to either side')
      .replace(/<kbd>([^<]+)<\/kbd>/g, (all, k) => (word[k] ? `<b>${word[k]}</b>` : ''));
  }
  g.H.keys = g.touch ? touchKeys : null;
  document.documentElement.classList.toggle('oe-touch', g.touch);
  if (g.touch) {
    g.$('.gt-hints').innerHTML = '<span>The stick walks · drag to look around · two fingers zoom</span><span><b>E</b> talk, board the ferry, fly the helicopter, drive your car</span>'
      + '<span><b>Hail a taxi</b> at the kerb · <b>Phone</b>: order a ride</span><span><b>Lens</b> · <b>Guess</b> a height · <b>Map</b> · <b>Menu</b></span>';
    g.$('#g-photo .note').textContent = 'Drag to turn · two fingers to come closer';
  }
  return { HELI_IDLE, HELI_REACH, altAction, backAgain, backIn, boardRide, cancelRide, destinations, driverStep, eta, groundZ, hail, kerbAction, leaveRide, orderRide, placeOnRoute, rideAway, rideCar, rideClock, rideGuard, rideStep, skipRide, srnd, turnRound };
};
