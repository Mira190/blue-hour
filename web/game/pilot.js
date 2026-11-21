// The autopilot of your own car (J) and the driver assists (I, K): the taxis' driver at your own wheel, the lane kept
// and the distance held. A part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").
// `g` is the rest of the game, by name. What this part asks of it:
//   A, G, H, U, angDiff, boxesMeet, cam, cars, clockT, crowd, destinations, dlg, driveTo, driverStep, eta,
//   handGhost, handGhostT, junctions, k, keepSign, myCar, nav, npcs, pilot, pilotEnd, placeOnRoute, player, reduced,
//   ride, rideClock, rideGuard, rideStep, roadNet, roads, rq, save, scene, waypoint
// and what it gives back:
//   assist, assistStep, assistToggle, carsTick, laneHere, pilotAsk, pilotHud, pilotOff, pilotStep, pilotTo,
//   scenicWeights
'use strict';
window.OEGamePilot = function (g) {
  // ------------------------------------------------------------ the autopilot of your own car (J)
  // Set a waypoint on the map, or pick a place by name, and the car drives there itself: the taxis' driver
  // (cars.js chauffeur, driverStep) at your own wheel, so it keeps its lane, queues, waits at the lights, gives
  // way at junctions, goes round a jam and pulls in at the kerb as they do. J again, the wheel, the brake or the
  // handbrake hands the car back as it is moving. The scenic way prefers the waterfront and the streets by the
  // landmarks (autopilot.js scenic). From wherever the car stands it is first driven onto its lane through its
  // own pedals (autopilot.js join); from then on it is carried along the driver's line (cars.js drive follow).
  let pilotScenic = false, scenicW = null;
  const scenicWeights = () => scenicW || (scenicW = OEAutopilot.scenic(g.roadNet, { water: (x, y) => g.nav.isWater(x, y),
    marks: Object.values(g.scene.labels || {}).concat((g.G.travel || []).map(t => t.at), g.G.wharves.map(w => w.terminal)).filter(Boolean) }));
  const pilotOpts = () => Object.assign(g.rideGuard(g.myCar.C), { keep: g.keepSign, lights: g.junctions, now: g.rideClock, strict: true, id: 'pilot', wedge: Infinity }); // (never on through a car, as a ride out of your sight may go: wedged half a minute, it hands the car back)
  function pilotTo(dest, { scenic = pilotScenic, quiet = false } = {}) {
    if (!g.myCar || g.player.mode !== 'car') return false;
    if (g.pilot) pilotOff();
    const st = g.myCar.D.st, a = g.roads.place(st.x, st.y, 60, g.keepSign, st.z);
    if (!a || a.d > 25) { g.H.toast('The autopilot needs a street: drive onto one first.'); return false; }
    g.roadNet.at(a.line, a.s, g.rq);
    if (!g.roadNet.L[a.line].ow) a.dir = Math.sin(st.h) * g.rq.hx + Math.cos(st.h) * g.rq.hy >= 0 ? 1 : -1; // (the way the car faces)
    let rt = g.driveTo(a, dest.at[0], dest.at[1]), share = 0;
    if (!rt) { g.H.toast(`No road from here reaches ${dest.name}.`); return false; }
    if (rt.len < 30) { g.H.toast(`${dest.name} is right here.`); return false; }
    if (scenic) {
      // (the scenic way, where it is no more than twice as far and does run more along the water or the landmarks)
      const w = scenicWeights(), sc = g.roads.route(a, rt.to, 30000, undefined, null, false, w), s0 = OEAutopilot.scenicShare(rt, g.roadNet, w);
      share = s0;
      if (sc && sc.len < rt.len * 2 + 300) { const s1 = OEAutopilot.scenicShare(sc, g.roadNet, w); if (s1 > s0 + 0.04) { rt = sc; share = s1; } }
    }
    const mk = from => { const opts = Object.assign(pilotOpts(), { from, v: 0 }), d = OECars.chauffeur(g.myCar.C, rt, opts); d.opts = opts; return d; };
    const offOf = c => ({ x: st.x - c.x, y: st.y - c.y, h: g.angDiff(st.h, c.h) }), close = o => Math.hypot(o.x, o.y) < 1.2 && Math.abs(o.h) < 0.45;
    // parked at the kerb where its way starts: out from the kerb, as a taxi pulls out; else onto the lane first
    let drv = mk('kerb'), join = false, off;
    drv.jump(0);
    if (!close(off = offOf(drv.st)) || st.speed > 1) {
      drv.leave(); drv = mk('lane');
      const at = OEAutopilot.onLane(drv.poseAt, drv.path.len, st.x, st.y, st.h, 0, 40);
      drv.jump(at.s);
      if (close(off = offOf(drv.st))) drv.st.v = Math.max(0, st.v); else join = true;
    }
    g.pilot = { kind: 'auto', blockId: 'pilot', name: 'Autopilot', C: g.myCar.C, drv, dest, phase: 'driving', t0: g.clockT, meter: 0, scenic: !!scenic, share, join, joinT: 0, joinS: 0,
      off: join ? { x: 0, y: 0, h: 0 } : off, film: OEAutopilot.film({ reduced: g.reduced }), turns: OEAutopilot.turns(rt, drv.path), turnsOf: drv, len: rt.len, sig: [], scr: [], qArms: [], way: g.waypoint && dest.id === 'waypoint' ? g.waypoint.slice() : null };
    if (g.cam.mode === 'chase') g.cam.lastInput = -10; // (the film starts at once)
    g.A.chime();
    if (!quiet) g.H.toast(`<b>Autopilot</b> to ${dest.name}: ${(rt.len / 1000).toFixed(1)} km${scenic ? (rt.len > 0 && share > 0.15 ? ', the scenic way' : ', no scenic way from here') : ''}. <kbd>J</kbd>, the wheel or the brake takes it back.`);
    return true;
  }
  function pilotOff(say = null, why = '') {
    const o = g.pilot;
    if (!o) return;
    g.pilotEnd = why;
    // (the traffic it is a little into as it is handed back: passed through until apart, carBoxes)
    g.handGhost = new Set(g.cars.live.filter(c => c.line >= 0 && Math.hypot(c.x - g.myCar.D.st.x, c.y - g.myCar.D.st.y) < c.half + g.myCar.C.half + 1 && g.boxesMeet(OECars.boxOf(c, c.half, c.hw || 0.9, c.top || 1.5), g.myCar)));
    g.handGhostT = g.clockT;
    if (!g.handGhost.size) g.handGhost = null;
    o.drv.leave(); g.pilot = null;
    if (g.cam.mode === 'chase') { g.cam.distTo = 7.5; g.cam.filmOut = true; }
    if (say) g.H.toast(say);
  }
  // J: off if it is on; to your waypoint if one is set; else it asks where to (and which way: the quickest or the scenic)
  function pilotAsk(ask = false) {
    if (g.pilot) { pilotOff('Autopilot off. You have the wheel.'); return; }
    if (g.player.mode !== 'car' || !g.myCar) return;
    const st = g.myCar.D.st, list = g.destinations(st.x, st.y).filter(d => d.id !== 'car');
    if (!ask && g.waypoint && list[0] && list[0].id === 'waypoint') { pilotTo(list[0]); return; }
    if (!list.length) { g.H.toast('Nowhere to drive to from here.'); return; }
    g.dlg.show({ name: 'Autopilot', role: 'Your car', color: '#7fd1c8', pitch: 210 }, ['Where to?'],
      list.slice(0, 7).map(d => ({ text: `${d.name}${d.note ? ` <span class="note">· ${d.note}</span>` : ''}`, dest: d }))
        .concat([{ text: `Route: <b>${pilotScenic ? 'scenic' : 'quickest'}</b> <span class="note">· change to ${pilotScenic ? 'the quickest' : 'the scenic way, by the water and the landmarks'}</span>`, flip: true }, { text: 'Not now. I\'ll drive.', dest: null }]),
      c => { if (c && c.flip) { pilotScenic = !pilotScenic; pilotAsk(true); } else if (c && c.dest && g.player.mode === 'car') pilotTo(c.dest); });
  }
  // what is in the way of your car just ahead of it (the traffic, a ride, people): the nearest, as { gap, v }, or null
  function leadOf(st, reach, wide = 0.25) {
    const fx = Math.sin(st.h), fy = Math.cos(st.h), half = g.myCar.C.half, hw = g.myCar.C.hw;
    let best = null;
    const see = (x, y, z, h2, w2, v, h, what = '') => {
      if (Math.abs(z - st.z) > 2.5) return;
      const dx = x - st.x, dy = y - st.y, a = dx * fx + dy * fy, w = Math.abs(-dx * fy + dy * fx);
      // (a car across the way is as long across as it is: its half length counts sideways by how far it is turned)
      const turned = h == null ? 0 : Math.abs(Math.sin(h - st.h)), across = w2 + (h2 - w2) * turned, along = h2 + (w2 - h2) * turned;
      const gap = a - along - half;
      if (a > 0 && gap < reach && w < hw + across + wide && (!best || gap < best.gap)) best = { gap: Math.max(0, gap), v: h == null ? 0 : Math.max(0, v * Math.cos(h - st.h)), what };
    };
    for (const c of g.cars.live) if (c.line >= 0 && Math.abs(c.x - st.x) < reach + 12 && Math.abs(c.y - st.y) < reach + 12) see(c.x, c.y, c.z, c.half, c.hw || 0.9, c.v, c.h, c.park ? 'a parked car' : 'a car');
    if (g.ride) { const r = g.ride.drv.st; see(r.x, r.y, r.z, g.ride.C.half, g.ride.C.hw, r.v, r.h); }
    for (let i = 0; i < g.crowd.active; i++) { const q = g.crowd.P[i]; if (q.line >= 0 && Math.abs(q.x - st.x) < reach + 4 && Math.abs(q.y - st.y) < reach + 4) see(q.x, q.y, q.z, 0.3, 0.3, 0, null, 'a walker'); }
    for (const n of g.npcs) if (Math.abs(n.x - st.x) < reach + 4 && Math.abs(n.y - st.y) < reach + 4) see(n.x, n.y, n.z, 0.3, 0.3, 0, null, 'a person standing');
    return best;
  }
  // ------------------------------------------------------------ the driver assists (I, K)
  // When you drive yourself: lane keeping (I) holds the car in the lane of the road it is on, and adaptive cruise
  // (K) holds the speed it was set at, keeps a time gap to the car ahead, slows for a bend and stops at a red
  // line (autopilot.js laneKeep, cruise). Each is a toggle; your own wheel past half lock wins over the lane, the
  // accelerator adds to the cruise, and the brake or the handbrake ends it. On a phone the Lens button at the wheel
  // steps through them: lane keeping, both, none.
  const assist = { lane: false, cruise: false, set: 0, on: { lane: false, cruise: false }, lead: null, line: null, here: null };
  // the lane of the road your car is on, the way it faces: { line, s, dir, len, v (the road's speed), d (how far the
  // car is to the right of the lane's middle), dh (its heading against the lane's), curv (the bend 8 m on, + right) }
  // (of the roads within 6 m and 2.5 m of height, the one the car runs along: a ramp beside a road, or a road
  // crossing it, is nearer at times than the one it is on. Scored by the distance to its lane's middle and the
  // angle to it, and the road it was on last kept while it still fits)
  let laneWas = -1, laneNarrow = { line: -1, until: 0 };
  function laneHere(st) {
    const hx0 = Math.sin(st.h), hy0 = Math.cos(st.h), seen = new Set();
    let q = null, best = Infinity;
    for (let k = 0; k < 4; k++) {
      const c = g.roadNet.nearest(st.x, st.y, 6, st.z, 2.5, 0, i => seen.has(i));
      if (!c) break;
      seen.add(c.line);
      g.roadNet.at(c.line, c.s, g.rq);
      const al = Math.abs(hx0 * g.rq.hx + hy0 * g.rq.hy), side = Math.abs(Math.abs((st.x - g.rq.x) * g.rq.hy - (st.y - g.rq.y) * g.rq.hx) - (g.junctions.centred && g.junctions.centred(c.line) ? 0 : OECars.LANE));
      const score = side + 6 * (1 - al) - (c.line === laneWas ? 0.8 : 0);
      if (score < best) { best = score; q = c; }
    }
    if (!q) { laneWas = -1; return null; }
    laneWas = q.line;
    g.roadNet.at(q.line, q.s, g.rq);
    const l = g.roadNet.L[q.line], dir = Math.sin(st.h) * g.rq.hx + Math.cos(st.h) * g.rq.hy >= 0 ? 1 : -1;
    // (the road's way along as the mean of 4 m either side, turning smoothly through a bend's corner: the heading of the
    // one segment there jumped at each vertex, and lane keeping let go there as at a turn off, Tetsugaku's road 192)
    const px = g.rq.x, py = g.rq.y, pz = g.rq.z, tan = (s0, out) => { const a = {}, b = {}; g.roadNet.at(q.line, Math.max(0, Math.min(l.len, s0 - 4)), a); g.roadNet.at(q.line, Math.max(0, Math.min(l.len, s0 + 4)), b); const ex = (b.x - a.x) * dir, ey = (b.y - a.y) * dir, n = Math.hypot(ex, ey) || 1; out.x = ex / n; out.y = ey / n; return out; };
    const T0 = tan(q.s, {}), hx = T0.x, hy = T0.y;
    g.rq.x = px; g.rq.y = py; g.rq.z = pz;
    let off = (g.junctions.centred && g.junctions.centred(q.line) ? 0 : OECars.LANE) * g.keepSign;
    // (a street that a facade narrows, with no room for the car at its lane's middle 4 m on but room at the road's:
    // nearer the middle, as the traffic keeps there)
    // (held 3 s on that road once found, so that the line it keeps does not flick between the two by each doorway)
    if (off) {
      const ax = g.rq.x + hx * 4, ay = g.rq.y + hy * 4, w = g.myCar.C.hw * 0.8;
      if (!g.nav.room(ax - hy * off, ay + hx * off, st.z, w, 1.4, false) && g.nav.room(ax - hy * off * 0.3, ay + hx * off * 0.3, st.z, w, 1.4, false)) laneNarrow = { line: q.line, until: g.clockT + 3 };
      if (laneNarrow.line === q.line && g.clockT < laneNarrow.until) off *= 0.3;
    }
    const lx = g.rq.x - hy * off, ly = g.rq.y + hx * off, h0 = Math.atan2(hx, hy);
    const out = { line: q.line, s: q.s, dir, len: l.len, v: l.v || 11, off, d: (st.x - lx) * hy - (st.y - ly) * hx, dh: g.angDiff(st.h, h0), curv: 0 };
    const s2 = Math.max(0, Math.min(l.len, q.s + 8 * dir));
    if (Math.abs(s2 - q.s) > 2) { const T2 = tan(s2, {}); out.curv = g.angDiff(Math.atan2(T2.x, T2.y), h0) / Math.abs(s2 - q.s); }
    return out;
  }
  // how far ahead of the car's nose a line it must stop at is (a red or amber light it can stop for), or null
  function redLineAhead(st, L) {
    const half = g.myCar.C.half, v = Math.max(0, st.v);
    let line = null;
    const see = (a, d) => {
      if (!a || !(d > -1.5 && d < 90)) return;
      const lt = g.junctions.light(a);
      if (lt === 'g' || (lt === 'y' && v * v / (2 * Math.max(0.5, d - half)) > 4)) return; // (amber, too close to stop for: on through)
      line = Math.min(line ?? Infinity, Math.max(0, d - half));
    };
    const a = g.junctions.armAt(L.line, L.dir > 0 ? 1 : 0);
    if (a && a.j.sig) see(a, (L.dir > 0 ? L.len - L.s : L.s) - a.back);
    for (const X of g.junctions.midsOn(L.line) || []) { const xa = X.sig && X.arms.find(b => b.end === (L.dir > 0 ? 1 : 0)); if (xa) see(xa, (X.mid - L.s) * L.dir - xa.back); }
    return line;
  }
  // a wall across the way ahead (a street shut off at its end, a gate): the gap to it along the heading, up to
  // reach, read every 0.2 s (three points across the car's width), or null
  let wallSeen = { t: -1, gap: null };
  function wallAhead(st, reach = 40) {
    if (g.clockT - wallSeen.t < 0.2) return wallSeen.gap;
    wallSeen.t = g.clockT; wallSeen.gap = null;
    const fx = Math.sin(st.h), fy = Math.cos(st.h), half = g.myCar.C.half, hw = g.myCar.C.hw * 0.8;
    for (let a = half + 1; a <= half + reach; a += 1.5) {
      let hit = 0;
      for (const w of [-hw, 0, hw]) { const x = st.x + fx * a - fy * w, y = st.y + fy * a + fx * w, q = g.nav.push(x, y, st.z, 0.3, 1.6); if (Math.hypot(q.x - x, q.y - y) > 0.01) hit++; }
      if (hit >= 2) { wallSeen.gap = a - half - 0.3; break; }
    }
    return wallSeen.gap;
  }
  function assistStep(fwd, side) {
    const st = g.myCar.D.st, L = assist.here = laneHere(st);
    assist.on.lane = assist.on.cruise = false;
    // (in the lane, near enough along it: turning across a junction or changing lanes, it lets go)
    // (and on a bend sharper than it steers, more than 2.8 m/s² across at this speed or under a 14 m radius, it lets go
    // as a car's lane centring does, and takes hold again after: Tetsugaku's S-bend on road 192 took it 2.2 m wide)
    const tight = L && (Math.abs(L.curv) > 0.07 || Math.abs(L.curv) * st.v * st.v > 2.8);
    if (assist.lane && L && st.v > 2 && !tight && Math.abs(L.dh) < 0.6 && Math.abs(L.d) < 2.6 && Math.abs(side) <= 0.5) { side = OEAutopilot.laneKeep(st, L, side); assist.on.lane = true; }
    if (assist.cruise) {
      if (fwd < -0.1 || g.k('Space')) { assist.cruise = false; g.H.toast('Cruise off.'); }
      else {
        let lead = assist.lead = leadOf(st, 70, 0.1);
        const line = assist.line = L ? redLineAhead(st, L) : null;
        // (and a wall across the lane, as a car standing there: it stops short of a street shut off)
        const wall = assist.wall = st.v > 0.5 ? wallAhead(st, Math.min(40, 4 + st.v * st.v / 4)) : null;
        if (wall != null && (!lead || wall < lead.gap)) lead = { gap: wall, v: 0 };
        const bend = L && Math.abs(L.curv) > 0.004 ? Math.sqrt(2.2 / Math.abs(L.curv)) : Infinity; // (2.2 m/s² across a bend)
        const pedal = OEAutopilot.cruise(st, Math.min(assist.set, bend), lead, line, { headway: 1.4 });
        fwd = fwd > 0.1 ? Math.max(fwd, pedal) : pedal;
        assist.on.cruise = true;
      }
    }
    return { fwd, turn: side };
  }
  function assistToggle(what) {
    if (g.player.mode !== 'car' || !g.myCar) return;
    if (g.pilot) { g.H.toast('The autopilot is driving. <kbd>J</kbd> to take the car back first.'); return; }
    const st = g.myCar.D.st;
    if (what === 'lane') { assist.lane = !assist.lane; g.H.toast(assist.lane ? '<b>Lane keeping on.</b> It holds the lane; your own steering wins. <kbd>I</kbd> turns it off.' : 'Lane keeping off.'); }
    else if (what === 'cruise') {
      assist.cruise = !assist.cruise;
      if (assist.cruise) { const L = laneHere(st); assist.set = Math.max(st.v > 5 ? st.v : (L ? L.v : 11), 8.3); }
      g.H.toast(assist.cruise ? `<b>Adaptive cruise on</b> at ${Math.round(assist.set * 3.6)} km/h. It follows the car ahead and stops at red lights; the brake ends it. <kbd>K</kbd> turns it off.` : 'Cruise off.');
    } else { // (a phone's one button: lane keeping, both, none)
      const next = !assist.lane ? [true, false] : !assist.cruise ? [true, true] : [false, false];
      if (assist.lane !== next[0]) assistToggle('lane');
      if (assist.cruise !== next[1]) assistToggle('cruise');
    }
  }
  // what the autopilot's screen says (twice a second): the next turn, how far, how long
  function pilotHud(o) {
    const c = o.drv.st, nt = o.join ? null : OEAutopilot.nextTurn(o.turns, c.s);
    return (o.hud = { nt, turn: nt ? OEAutopilot.turnText(nt) : '', left: o.join ? o.drv.path.len : o.drv.remaining(), eta: o.join ? o.drv.total() : g.eta(o), intent: c.intent || '' });
  }
  // the pedals onto the lane (autopilot.js join), stopping for what stands in the way it steers: looked for along the
  // line to the point it aims at, not straight ahead, so that a person standing by the kerb in front of a car that
  // turns out from it does not hold it there until the join gives up (Higashiyama by its first landmark). What
  // held it, for the checks: o.joinWhy
  function joinPedals(o, st, len, at) {
    const q = {};
    o.drv.poseAt(Math.min(len, at.s + 5 + Math.abs(st.v)), q);
    const aim = { x: st.x, y: st.y, z: st.z, h: Math.hypot(q.x - st.x, q.y - st.y) > 0.5 ? Math.atan2(q.x - st.x, q.y - st.y) : st.h };
    const lead = leadOf(aim, 5, 0.1), blocked = !!lead && lead.gap < 3.5;
    o.joinWhy = blocked ? `${lead.what} ${lead.gap.toFixed(1)} m ahead` : `${at.dist.toFixed(1)} m off the lane, turned ${at.dh.toFixed(2)}`;
    return OEAutopilot.join(st, o.drv.poseAt, len, at, blocked);
  }
  // a step of the autopilot. Returns true (it has driven the car this step), the pedals for the car's own
  // step (onto the lane), or null (it is off again)
  function pilotStep(dt, fwd, side) {
    const o = g.pilot, D = g.myCar.D, st = D.st;
    // your hands on the wheel, your foot on the brake or the handbrake: the car is yours again, as it moves
    if (Math.abs(side) > 0.25 || fwd < -0.25 || g.k('Space')) { pilotOff('You have the wheel.'); return null; }
    // a new waypoint set on the map while it drives to the old one: on to the new
    if (o.way && g.waypoint && (g.waypoint[0] !== o.way[0] || g.waypoint[1] !== o.way[1])) { const d = Object.assign({}, o.dest, { at: g.waypoint.slice(0, 2) }), sc = o.scenic; pilotOff(); if (!pilotTo(d, { scenic: sc, quiet: true })) return null; g.H.toast('<b>Autopilot:</b> on to the new waypoint.'); return pilotStep(dt, fwd, side); }
    if (o.join) {
      const len = o.drv.path.len, at = OEAutopilot.onLane(o.drv.poseAt, len, st.x, st.y, st.h, o.joinS, 40);
      o.joinT += dt; o.joinS = Math.max(o.joinS, at.s - 4);
      if ((at.dist < 1.2 && Math.abs(at.dh) < 0.45) || (o.joinT > 9 && at.dist < 4 && st.speed < 1.5)) {
        o.drv.jump(at.s); o.drv.st.v = Math.max(0, st.v);
        o.off = { x: st.x - o.drv.st.x, y: st.y - o.drv.st.y, h: g.angDiff(st.h, o.drv.st.h) }; o.join = false;
      } else if (o.joinT > 16) { pilotOff(o.rejoin ? '<b>Autopilot:</b> the road ahead is blocked. You have the wheel.' : 'The autopilot couldn\'t get onto the lane from here. Drive onto the street and try again.', o.rejoin ? 'blocked' : undefined); return null; }
      else return joinPedals(o, st, len, at);
    }
    g.driverStep(o, dt);
    const c = o.drv.st; // (the driver's state now: a turn in the road that has just ended has a new driver)
    // (a turn in the road, or backing out of a one-way street, held half a minute by what stands in its way: the car
    // is handed back where it is, rather than taken on from another place as a ride out of your sight is)
    if (o.turn && o.turn.held > 30) { pilotOff('The autopilot can\'t get round here. You have the wheel.', 'blocked'); return null; }
    // (stood 75 s with no red light to wait for, the cars that hold it asked out of the way and still there (110 s behind
    // anything else): a road
    // that will not clear. It says so and hands the car back, as a driver's assist does, rather than sit there)
    { const q = o.drv.st, a = q.lineAt, red = a && g.junctions.light(a, q.lineEx) === 'r';
      o.stoodT = !o.join && q.v < 0.3 && !red && !q.done ? (o.stoodT || 0) + dt : q.v > 1 || red ? 0 : o.stoodT || 0;
      if (o.stoodT > (o.jamT > 0 ? 75 : 110) || q.wedged > 30) { pilotOff('<b>Autopilot:</b> the road ahead is blocked. You have the wheel.', 'blocked'); return null; } }
    // (crawling: under 30 m along its way in 90 s of the clock, red lights not counted, as nose to nose with one car
    // after another on a street one car wide, Fushimi Inari's by junction 51: it takes another way round the street it
    // is on, twice at most, and with none hands the car back, rather than inch on for minutes)
    { const q = o.drv.st, a = q.lineAt, red = a && g.junctions.light(a, q.lineEx) === 'r';
      if (!o.crawl || o.crawl.drv !== o.drv || q.s - o.crawl.s > 30) o.crawl = { drv: o.drv, s: q.s, t: 0 };
      else if (!o.join && !red && !q.done && (o.crawl.t += dt) > 90) {
        const pl = g.placeOnRoute(q), to = q.route.to, rt = pl && to && (o.crawled || 0) < 2 ? g.roads.route(pl, to, 9000, undefined, new Set([pl.line])) : null;
        if (!rt || rt.len > (q.end - q.s) * 3 + 600) { pilotOff('<b>Autopilot:</b> the road ahead is blocked. You have the wheel.', 'blocked'); return null; }
        const opts = Object.assign({}, o.drv.opts, { from: 'lane', v: q.v });
        o.drv.leave(); o.drv = OECars.chauffeur(o.C, rt, opts); o.drv.opts = opts;
        o.sig = []; o.scr = []; o.qArms = []; o.crawled = (o.crawled || 0) + 1;
        g.H.toast(`<b>Autopilot:</b> slow going here. Taking another way.`);
      } }
    if (o.drv !== o.turnsOf) { // (another way round a jam, or after turning round in the road)
      // (the new way may start a little off where the car is: eased onto it from there, never put there)
      o.off = { x: st.x - c.x, y: st.y - c.y, h: g.angDiff(st.h, c.h) };
      o.turns = OEAutopilot.turns(c.route, o.drv.path); o.turnsOf = o.drv; o.len = o.meter + c.end;
      if ((o.rerouted || 0) > (o.told || 0)) { o.told = o.rerouted; g.H.toast('<b>Autopilot:</b> traffic ahead, taking another way.'); }
      // (further off than a lane's slack, it drives itself onto the new way first, as at the start: carried there,
      // its body swept sideways through whatever stood beside it, a car stopped for it at Fushimi Inari)
      if (Math.hypot(o.off.x, o.off.y) > 1.2 || Math.abs(o.off.h) > 0.45) {
        c.v = 0; o.join = true; o.rejoin = true; o.joinT = 0; o.joinS = 0; o.off = { x: 0, y: 0, h: 0 };
        const len = o.drv.path.len, at = OEAutopilot.onLane(o.drv.poseAt, len, st.x, st.y, st.h, 0, 40);
        return joinPedals(o, st, len, at);
      }
    }
    // (eased onto the driver's line from where it took the car over)
    const e = Math.exp(-dt * 2.4);
    o.off.x *= e; o.off.y *= e; o.off.h *= e;
    D.follow(dt, c, o.off);
    o.meter += Math.max(0, c.v) * dt;
    if ((o.hudT = (o.hudT || 0) - dt) <= 0) { o.hudT = 0.5; pilotHud(o); }
    if (c.done) {
      o.drv.leave(); g.pilot = null;
      Object.assign(st, { vx: 0, vy: 0, v: 0, speed: 0, r: 0 });
      if (g.cam.mode === 'chase') { g.cam.distTo = 7.5; g.cam.filmOut = true; }
      g.A.chime();
      g.pilotEnd = 'arrived';
      g.H.toast(`<b>Autopilot:</b> you have arrived: ${o.dest.name}, ${(o.meter / 1000).toFixed(1)} km.`);
      g.save();
    }
    return true;
  }
  // your car, a ride, and the people in them: where they are and what their lamps and wheels do
  function carsTick(dt) {
    const night = g.U.uNight.value;
    if (g.myCar) {
      const st = g.myCar.D.st, mine = g.player.mode === 'car';
      g.myCar.C.place(st.x, st.y, st.z, st.h, st.pitch, st.roll);
      if (g.pilot && !mine) pilotOff();
      const drvSt = g.pilot && !g.pilot.join ? g.pilot.drv.st : null; // (the autopilot signals as a driver does: out of the kerb, into it, round a car)
      g.myCar.C.animate(dt, { v: mine ? st.v : 0, h: st.h, steer: st.steer, brake: mine && (st.brake || (Math.abs(st.v) < 0.3 && g.k('KeyS'))), signal: drvSt ? drvSt.signal || 0 : 0, night: Math.max(night, 0.45 * OECars.weather.lamps), on: mine, inside: mine && g.cam.mode === 'cabin' });
    }
    if (g.ride) g.rideStep(dt, night);
    youAtLights(dt);
  }
  // you, waiting at a red, are seen by the signals as a car of the traffic or a walker at the button is
  // (junctions.js want, urgeWalk), so that you never wait at one longer than junctions.RED: at the wheel,
  // coming up to the line slowly or stopped there; on foot, standing beside a road near its junction or
  // a crossing with signals, or at a scramble's kerb (its walk next). A ride you are in, or one coming
  // for you, has priority (cars.js chauffeur).
  let atLightsT = 0;
  const atLightsQ = {};
  function youAtLights(dt) {
    if ((atLightsT += dt) < 0.25) return;
    atLightsT = 0;
    if (g.player.mode === 'car' && g.myCar) {
      const st = g.myCar.D.st;
      if (Math.abs(st.v) > 7) return;
      const q = g.roadNet.nearest(st.x, st.y, 5, st.z, 2.5);
      if (!q) return;
      g.roadNet.at(q.line, q.s, atLightsQ);
      const dir = Math.sin(st.h) * atLightsQ.hx + Math.cos(st.h) * atLightsQ.hy > 0 ? 1 : -1, l = g.roadNet.L[q.line];
      const a = g.junctions.armAt(q.line, dir > 0 ? 1 : 0), toLine = a && (dir > 0 ? l.len - q.s : q.s) - a.back;
      if (a && a.j.sig && toLine > -2 && toLine < 30) g.junctions.want(a);
      for (const X of g.junctions.midsOn(q.line) || []) { // (a crossing between junctions just ahead)
        const xa = X.sig && X.arms.find(b => b.end === (dir > 0 ? 1 : 0)), d = xa && (X.mid - q.s) * dir - xa.back;
        if (xa && d > -2 && d < 30) g.junctions.want(xa);
      }
    } else if (g.player.mode === 'foot' && !g.player.auto && g.player.speed < 0.8) {
      const S = g.junctions.scrambles.find(j => Math.hypot(j.x - g.player.x, j.y - g.player.y) < (j.reach || 30) + 8);
      if (S) { g.junctions.urgeWalk(S.arms[0]); return; }
      const q = g.roadNet.nearest(g.player.x, g.player.y, 10, g.player.z, 2.5);
      if (!q) return;
      const l = g.roadNet.L[q.line];
      let best = null, bd = 28;
      for (const end of [0, 1]) { const a = g.junctions.armBy(q.line, end), d = end ? l.len - q.s : q.s; if (a && a.j.sig && d < bd) { bd = d; best = a; } }
      for (const X of g.junctions.midsOn(q.line) || []) if (X.sig && Math.abs(X.mid - q.s) < 10) best = X.arms[0];
      if (best) g.junctions.urgeWalk(best);
    }
  }
  return { assist, assistStep, assistToggle, carsTick, laneHere, pilotAsk, pilotHud, pilotOff, pilotStep, pilotTo, scenicWeights };
};
