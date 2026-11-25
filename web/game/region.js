// region.js: a part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").
// `g` is the rest of the game, by name. What this part asks of it:
//   $, $$, A, B, BASE_FOV, CITY, DSM, FOOT, FRAME, G, H, KEY, MONTHS, P, PLAYER_KEY, PLAYER_LOOKS, VP, W,
//   applyDensity, applySun, base, bigCanvas, bigChips, bigNames, bigPins, bigView, bounds, cam, camera, carBoxes,
//   cars, cityId, clock, clockT, cycleTrack, density, doorAt, dragged, fer, fish, fishLoad, flocks, fmtMin, gamepad,
//   goals, gold, gov, groundLod, groundZ, guide, heli, hopTo, kerbNear, landmarks, lib, life, lifts, mapDrag,
//   mapPop, me, menuSync, metro, myCar, nav, npcs, objective, on, openMetro, overture, parkMyCar, peekRoute, picked,
//   pilot, placeNear, player, playerChar, presetTime, rail, reduced, renderPassport, ride, rideAway, rideSeat,
//   routeMode, save, scene, setClock, setPlayerCharacter, setRouteMode, settings, sideObjectives, spawn, startGame,
//   startTour, stepOut, story, sun, titleKeyed, toggleMap, toggleMenu, togglePass, touch, travelKey, trigDone,
//   wantsTalk, waypoint, weather, world
// and what it gives back:
//   DISTRICT_AIR, bodyOf, deckOf, deckStand, districtEdge, drawBig, inFrame, lookOf, mapZ, moreTray, ownPress,
//   region, screenOf, seenNow, standFor, titleEl, titleLead, titleScreen, travelGroups, travelTo, whoAsk, whoBack,
//   whoDone, whoGate, whoNeeded, whoPick, whoSync, zoomMap
'use strict';
window.OEGameRegion = function (g) {
  // ------------------------------------------------------------ the region round this map
  // A city drawn as maps of its own (Kyoto, Tokyo: a metro group) is one world on the big map, as an open-world
  // game's map is: zoom out past this map and the other districts are there where they really are, each map's
  // extent framed, its stations pinned and the railway lines that join them drawn faintly underneath, so
  // Kiyomizu-dera is found on the map from Kyoto Station rather than on another screen. A district there is
  // picked like any place and Travel takes you into that map, at that station (index.html router, "@<travel id>").
  // A district out of view is a chip at the map's edge, pointing to it with its distance, as games point to
  // an objective off screen; "This district" and "All of <city>" over the map's corner switch between the two.
  const region = (() => {
    if (!g.metro || !g.scene.frame.lat0) return null;
    const f = g.scene.frame, k = Math.cos(f.lat0 * Math.PI / 180);
    const w = (la, lo) => [(lo - f.lon0) * 111320 * k, (la - f.lat0) * 110574]; // (the frame's transverse Mercator, near enough over a city)
    const maps = g.metro.sites.filter(c => c.id !== g.cityId && c.game && c.frame_m).map(c => {
      const [cx, cy] = w(c.lat, c.lon), m = c.frame_m;
      return { id: c.id, name: c.district || c.name, native: c.native || '', x0: cx + m[0], x1: cx + m[1], y0: cy + m[2], y1: cy + m[3] };
    });
    if (!maps.length) return null;
    const stations = g.metro.meta.districts.map((st, i) => {
      const mp = maps.find(m => m.id === st.map);
      return mp && { kind: 'district', id: `district-${i}`, name: st.name, native: st.native || '', at: w(st.lat, st.lon), map: mp, travel: st.travel || null, line: (st.guide || {}).line || '' };
    }).filter(Boolean);
    const lines = (g.metro.meta.lines || []).map(l => ({ colour: l.colour, loop: !!l.loop, pts: l.stops.map(([la, lo]) => w(la, lo)) }));
    const all = maps.concat([{ x0: f.x[0], x1: f.x[1], y0: f.y[0], y1: f.y[1] }]);
    const box = [Math.min(...all.map(m => m.x0)), Math.max(...all.map(m => m.x1)), Math.min(...all.map(m => m.y0)), Math.max(...all.map(m => m.y1))];
    return { name: g.metro.name, native: g.metro.native || '', here: (g.me && (g.me.district || g.me.name)) || g.CITY.name, maps, stations, lines, box };
  })();
  const dsmAt = (x, y) => {
    const c = Math.floor((x - g.DSM.x0) / g.DSM.cell), r = Math.floor((g.DSM.y1 - y) / g.DSM.cell);
    return c >= 0 && r >= 0 && c < g.DSM.nx && r < g.DSM.ny ? g.DSM.data[r * g.DSM.nx + c] : 0;
  };
  const inFrame = (x, y, m = 30) => x > g.FRAME.x0 + m && x < g.FRAME.x1 - m && y > g.FRAME.y0 + m && y < g.FRAME.y1 - m;
  // A phone's district (pipeline/district.py; D.district): the play area is the district's frame. A walker and a car
  // stop at its edge as at the whole map's (the walking model ends there); the helicopter is held DISTRICT_AIR metres
  // past it, over the streets still built there. Said once in a while, so that the edge is not a wall without a word.
  const DISTRICT_AIR = 120;
  let districtSaid = -1e9;
  function districtEdge() {
    if (g.clockT - districtSaid < 45) return;
    districtSaid = g.clockT;
    g.H.toast('<b>The edge of this district.</b> On a phone the game keeps to the streets round the start; the rest of the map is on a larger screen.');
  }
  // how far into the haze at the model's edge a point is, 0 to 1, as world.js edgeHaze draws it: standing in that band,
  // everything round you is veiled, the near things too
  const edgeFade = Math.min(500, Math.max(250, 0.1 * Math.min(g.FRAME.x1 - g.FRAME.x0, g.FRAME.y1 - g.FRAME.y0)));
  const hazeAt = (x, y) => {
    const ox = Math.max(0, Math.abs(x - (g.FRAME.x0 + g.FRAME.x1) / 2) - ((g.FRAME.x1 - g.FRAME.x0) / 2 - edgeFade));
    const oy = Math.max(0, Math.abs(y - (g.FRAME.y0 + g.FRAME.y1) / 2) - ((g.FRAME.y1 - g.FRAME.y0) / 2 - edgeFade));
    return THREE.MathUtils.smoothstep(Math.hypot(ox, oy), 0, edgeFade);
  };
  // the trees (places.json, decimetres: x, y, ground, height; mapped, and planted from the woods' canopy) as [x, y, top, crown radius] on a 20 m grid,
  // built on first use: the surface model has the buildings but not the trees, and a crown hides a tower as well
  let treeGrid = null;
  function treesNear(x, y, r) {
    if (!treeGrid) {
      treeGrid = new Map();
      const T = (g.P.trees || []).concat(g.P.woods || []);
      for (let i = 0; i + 3 < T.length; i += 4) {
        const tx = T[i] / 10, ty = T[i + 1] / 10, h = T[i + 3] / 10, k = `${Math.floor(tx / 20)},${Math.floor(ty / 20)}`;
        if (!treeGrid.has(k)) treeGrid.set(k, []);
        treeGrid.get(k).push([tx, ty, T[i + 2] / 10 + h, Math.max(3, h * 0.45)]); // a fig spreads as wide as it is tall
      }
    }
    const out = [];
    for (let i = Math.floor((x - r) / 20); i <= Math.floor((x + r) / 20); i++) for (let j = Math.floor((y - r) / 20); j <= Math.floor((y + r) / 20); j++) {
      for (const t of treeGrid.get(`${i},${j}`) || []) if (Math.hypot(t[0] - x, t[1] - y) < r + t[3]) out.push(t);
    }
    return out;
  }
  // a spot to stand and look at a landmark from: { x, y, z, face, pitch }, or null. Back from it by its
  // height or its breadth, whichever is more (the breadth read from the surface model round its label), so
  // a tower stands whole in the frame and the Opera House's shells fit across it; then, of the spots round
  // it, the one with the clearest line of sight to its upper part, room behind for the camera, and the
  // sun behind you by day
  // A city can steer it for the few landmarks the search gets wrong (city.json "arrivals", keyed by the label's
  // name): "front", the compass bearing its front faces (the arrival keeps within "arc" degrees of it, 70 if not
  // given), "dist", how far back to stand in metres, or "at", a hand-picked spot [x, y] in the local frame
  // (with "look", the point [x, y] to face from it, where the landmark's middle is the wrong thing to face).
  // "top" frames a lower part than the label's top (metres above the ground): a theatre's front rather than the tower behind it.
  function standFor(lm, dbg = null) {
    const spec = ((g.scene.city && g.scene.city.arrivals) || {})[lm.name] || {};
    const [x, y] = lm.at, g_ = g.groundZ(x, y) ?? Math.max(0, g.nav.terrain(x, y)), top = spec.top ? g_ + spec.top : lm.top ?? g_ + 20, tall = Math.max(10, top - g_);
    const reach = [];
    for (let i = 0; i < 16; i++) { // how far its high part runs out from the label, each way; the median of that
      const a = i / 16 * Math.PI * 2, ux = Math.sin(a), uy = Math.cos(a);
      let last = 0;
      for (let r = 0; r <= 220; r += 4) { if (dsmAt(x + ux * r, y + uy * r) >= g_ + tall * 0.3) last = r; else if (r - last > 12 && (last || r > 40)) break; } // a street ends it
      reach.push(last);
    }
    const R = reach.sort((a, b) => a - b)[8];
    const D = spec.dist || THREE.MathUtils.clamp(Math.max(tall * 1.4, R * 2.2 + 40), 45, 520);
    // off its front: 0 straight in front, rising to 0.45 at the edge of the arc, and out of it altogether beyond
    const arc = (spec.arc ?? 70) * Math.PI / 180, front = spec.front != null ? spec.front * Math.PI / 180 : null;
    const aside = (px, py) => {
      if (front == null) return 0;
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(px - x, py - y) - front), Math.cos(Math.atan2(px - x, py - y) - front)));
      return off > arc ? Infinity : 0.45 * (1 - Math.cos(off)) / (1 - Math.cos(arc));
    };
    const day = g.sun && g.sun.altitude > 2, sx = day ? Math.sin(g.sun.azimuth * Math.PI / 180) : 0, sy = day ? Math.cos(g.sun.azimuth * Math.PI / 180) : 0;
    const body = bodyOf(lm, g_, top);
    // what the camera behind you sees of the landmark from a spot (px, py, pz), facing it: the share of its body
    // in frame and in sight (through the surface model, and the tree crowns when asked), how much was cut off
    // by the frame's edges (and of its upper third off the top), and how much of the frame's height the part in
    // sight fills. The camera stands where the chase rig puts it: 7.5 m behind your head, a little to the side, at
    // the pitch (and the tilt up) that takes in its top.
    const aspect = Math.max(0.4, g.camera.aspect || 1.6), tanV = Math.tan(g.BASE_FOV / 2 * Math.PI / 180), tanH = tanV * aspect;
    const view = (px, py, pz, crowns, fixed = null) => {
      const face = Math.atan2(x - px, y - py), yaw = face + 0.12, hz = pz + 1.55;
      let el = -Infinity; // the highest point of it, seen from your head, sets the pitch: its top a little under the frame's top edge
      for (const q of body.pts) el = Math.max(el, Math.atan2(q[2] - hz, Math.max(1, Math.hypot(q[0] - px, q[1] - py) + 7.5)));
      // a camera under your head would be in the ground: it stays a little over it and tilts up instead (cam.tilt),
      // as far as keeps you in the frame
      const want = fixed ?? Math.atan(tanV * 0.78) - el, pitch = THREE.MathUtils.clamp(want, 0.06, 0.16), tilt = THREE.MathUtils.clamp(pitch - want, 0, 0.26);
      const cp = Math.cos(pitch), cx = px - Math.sin(yaw) * cp * 7.5, cy = py - Math.cos(yaw) * cp * 7.5;
      const cz = Math.max(hz + Math.sin(pitch) * 7.5, Math.max(0, g.nav.terrain(cx, cy)) + 0.5);
      const he = Math.atan2(hz - cz, Math.hypot(px - cx, py - cy)) + tilt, hh = Math.atan2(px - cx, py - cy);
      const fx = Math.sin(hh) * Math.cos(he), fy = Math.cos(hh) * Math.cos(he), fz = Math.sin(he);
      let rx = fy, ry = -fx; const rl = Math.hypot(rx, ry) || 1; rx /= rl; ry /= rl; // right, level
      const ux = ry * fz, uy = -rx * fz, uz = rx * fy - ry * fx; // up = right x forward
      let seen = 0, cut = 0, lo = Infinity, hi = -Infinity, over = 0;
      for (let k = 0; k < body.pts.length; k++) {
        const q = body.pts[k], wk = body.w[k], dx = q[0] - cx, dy = q[1] - cy, dz = q[2] - cz, zf = dx * fx + dy * fy + dz * fz;
        if (zf < 2) { cut += wk; if (q[2] >= body.high) over++; continue; }
        const u = (dx * rx + dy * ry) / (zf * tanH), v = (dx * ux + dy * uy + dz * uz) / (zf * tanV);
        if (q[2] >= body.high && v > 0.97) over++; // its upper part off the top of the frame, hidden or not
        if (!sightTo(cx, cy, cz, q, body, crowns)) continue;
        if (Math.abs(u) > 0.97 || Math.abs(v) > 0.97) { cut += wk; continue; }
        seen += wk; lo = Math.min(lo, v); hi = Math.max(hi, v);
      }
      const n = body.wSum;
      return { face, pitch, tilt, seen: seen / n, cut: cut / n, over: over / body.nHigh, fill: seen ? (hi - lo) / 2 : 0 };
    };
    // the score of a view: most of it in sight, filling a good part of the frame and not cut off, and the sun behind you
    const rate = (v, px, py) => 1.6 * v.seen + 0.5 * Math.min(1, v.fill / 0.45) - v.cut - 1.2 * v.over
      + (day ? 0.2 * Math.max(0, -((x - px) * sx + (y - py) * sy) / Math.hypot(x - px, y - py)) : 0);
    if (spec.at) { // a hand-picked spot: on it (or the nearest ground to it), facing the landmark
      const p = g.placeNear(spec.at[0], spec.at[1], Number.isFinite(spec.at[2]) ? spec.at[2] : null, null, 12);
      if (p && spec.look) return { x: p[0], y: p[1], z: p[2], face: Math.atan2(spec.look[0] - p[0], spec.look[1] - p[1]), pitch: 0.2, tilt: 0 }; // (and what to face: a tunnel's mouth)
      if (p) { const v = view(p[0], p[1], p[2], true); return { x: p[0], y: p[1], z: p[2], face: v.face, pitch: v.pitch, tilt: v.tilt }; }
    }
    // room for the chase camera behind you: the line from your head to where it will stand, as the rig tests it
    const room = f => {
      const yaw = f.face + 0.12, cp = Math.cos(f.pitch), hd = g.W(f.x, f.y, f.z + 1.55), cx = f.x - Math.sin(yaw) * cp * 7.5, cy = f.y - Math.cos(yaw) * cp * 7.5;
      const leafy = (qx, qy) => treesNear(qx, qy, 0).some(t => Math.hypot(t[0] - qx, t[1] - qy) < t[3] * 0.7);
      if (leafy(cx, cy) || leafy((cx + f.x) / 2, (cy + f.y) / 2)) return 0.5; // the camera in a crown: leaves across the lens
      return g.nav.clearFraction(hd, new THREE.Vector3(cx, hd.y + Math.sin(f.pitch) * 7.5, -cy));
    };
    // open ground round a spot (a square, a park, the waterfront rather than a lane): the share of rings 6 and 14 m out with nothing over 3 m on them
    const open = p => { let n = 0; for (const r of [6, 14]) for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; if (dsmAt(p[0] + Math.sin(a) * r, p[1] + Math.cos(a) * r) < p[2] + 3) n++; } return n / 32; };
    const cands = [];
    // rings from close under it, looking up, to well back: what the camera sees decides, not the distance
    for (const k of spec.dist ? [1, 0.75, 1.3] : [1, 0.45, 0.7, 1.35]) for (let i = 0; i < 16; i++) {
      const a = (i + (k === 1 || k === 0.45 ? 0 : 0.5)) / 16 * Math.PI * 2, px = x + Math.sin(a) * D * k, py = y + Math.cos(a) * D * k, pz = g.nav.terrain(px, py);
      if (!inFrame(px, py) || pz <= -0.5 || aside(px, py) === Infinity || Math.hypot(px - x, py - y) < 25) continue;
      if (dsmAt(px, py) > Math.max(0, pz) + 3) continue; // inside a building
      cands.push({ px, py, score: rate(view(px, py, Math.max(0, pz), false), px, py) - 0.08 * Math.abs(k - 1) - aside(px, py) - 3 * hazeAt(px, py) });
    }
    cands.sort((a, b) => b.score - a.score);
    // the rig lifts a camera that a wall or the ground in front of it would block, looking down more: the view it will have
    const rig = (p, v) => {
      const hd = g.W(p[0], p[1], p[2] + 1.55), yaw = v.face + 0.12;
      for (const lift of [0, 0.25, 0.5, 0.8]) {
        const pt = Math.min(1.35, v.pitch + lift), cp = Math.cos(pt);
        const pos = new THREE.Vector3(hd.x - Math.sin(yaw) * cp * 7.5, hd.y + Math.sin(pt) * 7.5, hd.z + Math.cos(yaw) * cp * 7.5);
        if (g.nav.clearFraction(hd, pos) >= 0.97) return lift ? Object.assign(view(p[0], p[1], p[2], true, pt), { pitch: v.pitch, tilt: v.tilt }) : v;
      }
      return v;
    };
    const judge = p => {
      const v = rig(p, view(p[0], p[1], p[2], true)), f = { x: p[0], y: p[1], z: p[2], face: v.face, pitch: v.pitch, tilt: v.tilt }, rm = room(f);
      const fl = g.nav.floorAt(p[0], p[1], p[2] + 0.5), roof = fl && fl.kind === 'roof' ? 0.4 : 0; // the street rather than a roof level with it
      // out from under a walkway, a flyover or an overhang, for you and for the camera behind you
      const bx = p[0] - Math.sin(f.face + 0.12) * 7, by = p[1] - Math.cos(f.face + 0.12) * 7;
      const covered = (dsmAt(p[0], p[1]) > p[2] + 4 ? 0.6 : 0) + (dsmAt(bx, by) > p[2] + 4 ? 0.6 : 0);
      const score = rate(v, p[0], p[1]) + (rm > 0.97 ? 0.3 : rm === 0.5 ? -0.3 : -1) + 0.8 * open(p) - roof - covered - aside(p[0], p[1]) - 3 * hazeAt(p[0], p[1]);
      if (dbg) dbg.push({ p: p.map(v => Math.round(v)), seen: +v.seen.toFixed(2), cut: +v.cut.toFixed(2), over: +v.over.toFixed(2), fill: +v.fill.toFixed(2), room: +rm.toFixed(2), open: +open(p).toFixed(2), score: +score.toFixed(2) });
      return { f, score, rm, seen: v.seen };
    };
    // none of the rings sees much of it (a short building among towers): every open spot on a grid round it, once
    const grid = () => {
      if (best && best.seen >= 0.6) return [];
      const step = Math.max(10, D / 10), out = [];
      for (let gx = x - D * 1.6; gx <= x + D * 1.6; gx += step) for (let gy = y - D * 1.6; gy <= y + D * 1.6; gy += step) {
        const d = Math.hypot(gx - x, gy - y), pz = g.nav.terrain(gx, gy);
        if (d < 25 || d > D * 1.6 || !inFrame(gx, gy) || pz <= -0.5 || aside(gx, gy) === Infinity || dsmAt(gx, gy) > Math.max(0, pz) + 3) continue;
        out.push({ px: gx, py: gy, score: rate(view(gx, gy, Math.max(0, pz), false), gx, gy) - 3 * hazeAt(gx, gy) });
      }
      return out.sort((a, b) => b.score - a.score).slice(0, 12);
    };
    let best = null;
    for (let pass = 0; pass < 2; pass++) for (const c of pass ? grid() : cands.slice(0, 24)) {
      const p = g.placeNear(c.px, c.py, null, null, 12);
      if (!p) continue;
      let j = judge(p);
      // a wall or a crown behind you: a few steps either side, or nearer or further, may clear it
      if (j.rm <= 0.97) {
        const ux = (x - p[0]) / Math.hypot(x - p[0], y - p[1]), uy = (y - p[1]) / Math.hypot(x - p[0], y - p[1]);
        for (const [s, t] of [[6, 0], [-6, 0], [0, 8], [0, -8], [12, 0], [-12, 0]]) {
          const q = g.placeNear(p[0] + uy * s + ux * t, p[1] - ux * s + uy * t, null, null, 3);
          if (q) { const k = judge(q); if (k.score > j.score) j = k; }
        }
      }
      if (!best || j.score > best.score) best = j;
    }
    if (best) return best.f;
    const p = g.placeNear(x, y, null, null, 150); // at its foot, or the nearest ground to it
    if (!p) return null;
    const v = view(p[0], p[1], p[2], false);
    return { x: p[0], y: p[1], z: p[2], face: v.face, pitch: v.pitch, tilt: v.tilt };
  }
  // the landmark's body, as points to look at: the cells of the surface model its buildings cover (those named
  // after it, or the one under its label), their tops and, along their edges, their walls; for a landmark the
  // surface model leaves out (an open iron tower), a column at its label. Cut at its "top" when a city.json
  // "arrivals" entry gives one.
  const bodies = new Map();
  function bodyOf(lm, g_, top) {
    if (bodies.has(lm.name)) return bodies.get(lm.name);
    const [x, y] = lm.at, C = g.DSM.cell, rad = 250, c0 = Math.floor((x - g.DSM.x0) / C), r0 = Math.floor((g.DSM.y1 - y) / C), n = Math.ceil(rad / C);
    // named after it: the label's name, or the start of it ("Kabuki-za" of "Kabuki-za 歌舞伎座"), or any word of it in
    // another script ("歌舞伎座"), whole; not a longer name that starts the same ("Town Hall Station" for "Town Hall")
    const toks = lm.name.toLowerCase().split(/\s+/), cjk = t => /[^\x00-\x7f]/.test(t), lead = toks.slice(0, Math.max(1, toks.findIndex(cjk))).join(' ');
    const words = new Set([lm.name.toLowerCase(), toks.some(cjk) ? lead : '', ...toks.filter(t => cjk(t) && t.length > 1)].filter(Boolean));
    // or a name that ends in the label's words after a place's ("Tsim Sha Tsui Clock Tower" for "Clock Tower")
    const tail = ' ' + lm.name.toLowerCase();
    const named = id => { const m = g.B.b[id] && g.B.b[id][0] && g.B.b[id][0].toLowerCase(); return !!m && m.length > 1 && (words.has(m) || m.endsWith(tail)); };
    const ids = new Set(), near = new Map(), tall = new Set();
    for (let r = r0 - n; r <= r0 + n; r++) for (let c = c0 - n; c <= c0 + n; c++) {
      if (r < 0 || c < 0 || r >= g.DSM.ny || c >= g.DSM.nx) continue;
      const id = g.DSM.ids[r * g.DSM.nx + c];
      if (id < 0) continue;
      const d = Math.hypot(c - c0, r - r0) * C;
      if (d < 150 && named(id)) ids.add(id);
      if (d < 16 && g.DSM.data[r * g.DSM.nx + c] > g_ + Math.min(8, (top - g_) * 0.3)) near.set(id, (near.get(id) || 0) + 1);
      if (d < 40 && g.DSM.data[r * g.DSM.nx + c] >= g_ + (top - g_) * 0.6) tall.add(id); // its high part, whatever building the cells were drawn for
    }
    // a landmark found by its name keeps to it and its unnamed parts: a neighbour named for something else is not
    // its high part (Hong Kong's Cultural Centre behind the Clock Tower), and framing both crops a phone's narrow view
    const byName = ids.size > 0;
    if (!ids.size && near.size) { const most = Math.max(...near.values()); for (const [id, k] of near) if (k >= most * 0.3) ids.add(id); }
    for (const id of tall) if (!byName || !(g.B.b[id] && g.B.b[id][0] && g.B.b[id][0].length > 1)) ids.add(id);
    const cells = [];
    for (let r = r0 - n; r <= r0 + n; r++) for (let c = c0 - n; c <= c0 + n; c++) {
      if (r < 1 || c < 1 || r >= g.DSM.ny - 1 || c >= g.DSM.nx - 1) continue;
      const i = r * g.DSM.nx + c;
      if (ids.has(g.DSM.ids[i]) && g.DSM.data[i] > g_ + 2) cells.push([r, c, i]);
    }
    const pts = [], stride = Math.max(1, Math.ceil(Math.sqrt(cells.length / 90)));
    for (const [r, c, i] of cells) {
      const edge = !ids.has(g.DSM.ids[i - 1]) || !ids.has(g.DSM.ids[i + 1]) || !ids.has(g.DSM.ids[i - g.DSM.nx]) || !ids.has(g.DSM.ids[i + g.DSM.nx]);
      if (!edge && (r % stride || c % stride)) continue;
      if (edge && (r + c) % stride) continue;
      const px = g.DSM.x0 + (c + 0.5) * C, py = g.DSM.y1 - (r + 0.5) * C, h = Math.min(g.DSM.data[i], top);
      pts.push([px, py, h]);
      if (edge) for (const f of [0.25, 0.6]) pts.push([px, py, g_ + (h - g_) * f]);
    }
    if (pts.length < 6) { pts.length = 0; ids.clear(); for (const f of [0.1, 0.3, 0.5, 0.7, 0.9, 1]) for (const s of [-3, 3]) pts.push([x + s, y, g_ + (top - g_) * f]); }
    // a part over its buildings that the surface model leaves out (HEP FIVE's wheel, a spire, an open iron tower on
    // a base): a column at its label up to its top, as many points as the buildings have, so it counts as much
    const hi = pts.reduce((m, q) => Math.max(m, q[2]), g_);
    if (top > hi + Math.max(8, (top - g_) * 0.15) && ids.size) { const k = Math.max(6, pts.length); for (let i = 0; i < k; i++) pts.push([x + (i % 2 ? 3 : -3), y, hi + (top - hi) * (i + 1) / k, 1]); } // over them: their roofs hide it
    // its upper third, which a frame cut off at the top loses first
    const zs = pts.map(q => q[2]).sort((a, b) => a - b), zTop = zs[zs.length - 1], high = g_ + (zTop - g_) * 0.67;
    // each point weighs by its height: a tower is known by its upper floors, the podium round its foot is not
    const w = pts.map(q => 0.3 + Math.max(0, q[2] - g_) / Math.max(1, zTop - g_)), wSum = w.reduce((a, v) => a + v, 0);
    const b = { ids, pts, w, wSum, high, nHigh: Math.max(1, pts.filter(q => q[2] >= high).length) };
    bodies.set(lm.name, b);
    return b;
  }
  // how much of a landmark the camera sees now: the share of its body in frame and in sight (for tools/travel_shot.js)
  function seenNow(lm) {
    const spec = ((g.scene.city && g.scene.city.arrivals) || {})[lm.name] || {}, [x, y] = lm.at, g_ = g.groundZ(x, y) ?? Math.max(0, g.nav.terrain(x, y));
    const body = bodyOf(lm, g_, spec.top ? g_ + spec.top : lm.top ?? g_ + 20), c = g.camera.position, v = new THREE.Vector3();
    g.camera.updateMatrixWorld();
    let n = 0;
    body.pts.forEach((q, k) => {
      v.copy(g.W(q[0], q[1], q[2])).project(g.camera);
      if (Math.abs(v.x) < 0.97 && Math.abs(v.y) < 0.97 && v.z < 1 && sightTo(c.x, -c.z, c.y, q, body, true)) n += body.w[k];
    });
    return n / body.wSum;
  }
  // a clear line from the camera (cx, cy, cz) to a point of a landmark's body: through the surface model in 2 m
  // steps until it meets the body itself (a wall of it in front of the point counts as seen, but not in front of
  // a point of the part over its roofs), and through the mapped tree crowns when asked
  function sightTo(cx, cy, cz, q, body, crowns) {
    const d = Math.hypot(q[0] - cx, q[1] - cy), n = Math.max(1, Math.ceil(d / 2));
    for (let k = 1; k < n; k++) {
      const t = k / n, qx = cx + (q[0] - cx) * t, qy = cy + (q[1] - cy) * t, line = cz + (q[2] - cz) * t;
      const c = Math.floor((qx - g.DSM.x0) / g.DSM.cell), r = Math.floor((g.DSM.y1 - qy) / g.DSM.cell);
      if (c < 0 || r < 0 || c >= g.DSM.nx || r >= g.DSM.ny) continue;
      const i = r * g.DSM.nx + c;
      if (g.DSM.data[i] > line + 0.5) return !q[3] && body.ids.has(g.DSM.ids[i]);
      if (crowns && k % 2 === 0 && d * (1 - t) > 6 && treesNear(qx, qy, 0).some(tr => tr[2] > line && Math.hypot(tr[0] - qx, tr[1] - qy) < tr[3] * 0.8)) return false;
    }
    return true;
  }
  // where a destination puts you: { x, y, z, face?, pitch? }, or null
  // a landmark that is a place to go up (an observation deck with its own lift, game.json "lifts", named for it):
  // its deck, where the city names a place to travel to up there (or else the lift's top stop), facing out from
  // its middle over the city; not a view of it from the street half a kilometre off
  function deckOf(lm) {
    const n = lm.name.toLowerCase(), l = g.lifts.find(l => l.stops.length > 1 && n.startsWith(l.name.toLowerCase()) && Math.hypot(l.stops[0].at[0] - lm.at[0], l.stops[0].at[1] - lm.at[1]) < 150);
    if (!l) return null;
    const g_ = Math.min(...l.stops.map(s => s.at[2]));
    const places = (g.G.travel || []).filter(t => t.at.length > 2 && t.at[2] > g_ + 60 && Math.hypot(t.at[0] - lm.at[0], t.at[1] - lm.at[1]) < 150).map(t => t.at);
    const stops = l.stops.filter(s => s.at[2] > g_ + 60).map(s => s.at);
    const all = [...places.sort((a, b) => b[2] - a[2]), ...stops.sort((a, b) => b[2] - a[2])];
    return all.length ? all : null;
  }
  // where on a deck you can stand: the first of its places with a floor at that level (not the street under it)
  function deckStand(decks) {
    for (const at of decks) { const p = g.placeNear(at[0], at[1], at[2], null, 45); if (p && Math.abs(p[2] - at[2]) < 6) return p; }
    return null;
  }
  // on a deck the chase camera looks down over the city past you, as you would at the glass (and under a deck's roof)
  const DECK_PITCH = 0.4;
  // the side of a deck that looks at the city: towards where the game starts (the heart of it: Shibuya's
  // scramble under SKY EDGE, Senso-ji from the Skytree), not over the edge of the map
  const heart = lm => { const dx = g.G.start.at[0] - lm.at[0], dy = g.G.start.at[1] - lm.at[1], n = Math.hypot(dx, dy); return n > 20 ? [dx / n, dy / n] : null; };
  const outward = (lm, p) => { const u = heart(lm); if (u) return Math.atan2(u[0], u[1]); const dx = p[0] - lm.at[0], dy = p[1] - lm.at[1]; return Math.hypot(dx, dy) > 2 ? Math.atan2(dx, dy) : null; };
  // a deck's spots, the one on its city side first: as far out from the landmark's middle as the deck's own spot is
  const facingSide = (lm, decks) => {
    const u = heart(lm);
    return u ? [...decks.map(at => { const r = Math.hypot(at[0] - lm.at[0], at[1] - lm.at[1]); return [lm.at[0] + u[0] * r, lm.at[1] + u[1] * r, at[2]]; }), ...decks] : decks;
  };
  function arrival(d) {
    const deck = d.kind === 'landmark' ? deckOf(d) : null;
    if (deck) {
      const p = deckStand(facingSide(d, deck));
      if (p) return { x: p[0], y: p[1], z: p[2], face: outward(d, p), pitch: DECK_PITCH };
    }
    if (d.kind === 'landmark') return standFor(d);
    if (d.kind === 'car' && g.myCar) {
      const st = g.myCar.D.st, dr = g.doorAt(g.myCar, 'driver'), p = g.placeNear(dr.x, dr.y, st.z + 0.5, g.carBoxes(st.x, st.y, 12));
      return p && { x: p[0], y: p[1], z: p[2], face: Math.atan2(st.x - p[0], st.y - p[1]), pitch: 0.24 };
    }
    const [x, y, z] = d.at, p = g.placeNear(x, y, Number.isFinite(z) ? z : null, null, d.kind === 'point' ? 150 : 45); // on a roof, or the ground
    if (!p) return null;
    // high up on a landmark (a deck the city names as a place): facing out over the city, as from its deck
    const lm = p[2] - Math.max(0, g.nav.terrain(p[0], p[1])) > 60 && g.landmarks.find(l => deckOf(l) && Math.hypot(l.at[0] - p[0], l.at[1] - p[1]) < 150);
    if (lm) return { x: p[0], y: p[1], z: p[2], face: outward(lm, p), pitch: DECK_PITCH };
    // else facing what the place is for (game.travel "look": a gate's mouth, the view; "pitch" the camera's, if its own), or the landmark there
    const look = d.kind === 'place' ? lookOf(d, p) : null;
    return look ? { x: p[0], y: p[1], z: p[2], face: Math.atan2(look[0] - p[0], look[1] - p[1]), pitch: d.pitch ?? 0.2 } : { x: p[0], y: p[1], z: p[2] };
  }
  // what you face on arriving at a travel place: its own "look" [x, y], or else the nearest landmark's label
  // within 200 m (not one you stand on), so you arrive looking at what you came for, not wherever you last faced
  function lookOf(t, p = t.at) {
    if (t.look) return t.look;
    let best = null, bd = 200;
    for (const q of Object.values(g.scene.labels || {})) { const e = Math.hypot(q[0] - p[0], q[1] - p[1]); if (e > 8 && e < bd) { bd = e; best = q; } }
    return best;
  }
  function travelTo(d) { // a shot playing (the start, a survey) is skipped by the hop, which plays its cues
    if (d.kind === 'district') { // another map of the city: saved here, then that map loads and you arrive at the station
      g.save();
      g.$('#g-bigmap').hidden = true; g.mapPop.hidden = true; g.picked = null;
      g.H.toast(`To ${d.map.name}: ${d.name}…`);
      location.hash = `play-${d.map.id}${d.travel ? `@${d.travel}` : ''}`;
      return true;
    }
    if (g.bounds && d.at && !g.bounds.inside(d.at[0], d.at[1], 'ground', 10)) { g.H.toast(g.G.bounds.lines.closed || 'Not open yet.'); return false; } // (past the planned area's edge)
    if (!['foot', 'car', 'ride'].includes(g.player.mode)) {
      g.H.toast({ heli: 'Land and get out of the helicopter first, then travel from the map.', ferry: 'Get off the ferry first (E at a wharf), then travel from the map.', rail: 'Get off first, then travel from the map.' }[g.player.mode] || 'Not now.');
      return false;
    }
    const to = arrival(d);
    if (!to) { g.H.toast(`There is nowhere to stand near ${d.name}.`); return false; }
    g.$('#g-bigmap').hidden = true; g.mapPop.hidden = true; g.picked = null;
    if (g.player.auto) { const a = g.player.auto; g.player.auto = null; if (a.cancel) a.cancel(); }
    const was = g.player.mode, name = d.kind === 'point' ? 'your pin' : d.name;
    // in your car, the kerb nearest the spot, and the camera looking past the car at the landmark
    const kerb = was === 'car' && g.myCar ? g.kerbNear(to.x, to.y, to.z, 0) : null;
    // no street near the spot (the end of a pier): you go on foot, and the car waits on the nearest street there is
    const park = was === 'car' && g.myCar && !kerb ? g.kerbNear(to.x, to.y, null, 0, 1500) : null;
    const carYaw = kerb && (d.kind === 'landmark' ? Math.atan2(d.at[0] - kerb.pose.x, d.at[1] - kerb.pose.y) : to.face ?? kerb.pose.h);
    const cue = () => {
      inSeason(d);
      // (a place to watch a train from: the next one is that many seconds off as you arrive, rail.js cue)
      const tv = (g.G.travel || []).find(t => t.id === d.id);
      if (tv && tv.train && g.rail && g.rail.cue && g.player.mode !== 'rail') g.rail.cue(g.rail.sNear(tv.at[0], tv.at[1]), tv.train.in ?? 40, tv.train.dir || 0);
      if (kerb) { // the car comes too, facing along the street
        g.parkMyCar(kerb.pose);
        Object.assign(g.player, { x: kerb.pose.x, y: kerb.pose.y, z: kerb.pose.z, h: kerb.pose.h, speed: 0 });
        g.cam.mode = 'chase'; g.cam.yaw = carYaw; g.cam.pitch = Math.max(0.08, to.pitch ?? 0.2); g.cam.tilt = to.tilt || 0; g.cam.dist = 7.5;
        g.groundLod(kerb.pose.x, kerb.pose.y); g.save();
        return;
      }
      if (was === 'car' && g.myCar && g.player.mode === 'car') {
        g.stepOut(g.myCar, 'driver', [to.x, to.y, to.z]);
        if (park) { g.parkMyCar(park.pose); g.H.toast(`Your car is on the nearest street, ${fmtDist(Math.hypot(park.pose.x - to.x, park.pose.y - to.y))} away.`); }
      }
      if (was === 'ride' && g.ride && g.player.mode === 'ride') { g.stepOut(g.ride, g.rideSeat(g.ride), [to.x, to.y, to.z]); g.rideAway(); }
      [g.player.x, g.player.y, g.player.z] = [to.x, to.y, to.z];
      g.player.speed = 0; g.player.vz = 0; g.player.ground = true;
      if (to.face != null) g.player.h = to.face;
      g.cam.mode = 'chase'; g.cam.dist = 7.5;
      // the landmark a little left of the player rather than behind their head
      if (to.face != null) { g.cam.yaw = to.face + 0.12; g.cam.pitch = to.pitch ?? 0.3; g.cam.tilt = to.tilt || 0; } else { g.cam.yaw = g.player.h; g.cam.pitch = g.FOOT.pitch; g.cam.dist = g.FOOT.dist; g.cam.tilt = 0; }
      g.groundLod(to.x, to.y); g.save();
    };
    g.hopTo(kerb ? kerb.pose.x : to.x, kerb ? kerb.pose.y : to.y, kerb ? kerb.pose.z : to.z, name,
      { cue, yaw: kerb ? carYaw : to.face != null ? to.face + 0.12 : null, pitch: kerb ? Math.max(0.08, to.pitch ?? 0.2) : to.pitch });
    return true;
  }
  // a place at its best in a season of its own (game.travel "best": {from, to, date [m, d], what}: the jacarandas
  // over Circular Quay in late spring): arriving out of it, the clock's date moves to that day, the time kept
  function inSeason(d) {
    const b = d.kind === 'place' && d.best;
    if (!b || !b.date || ![...b.from, ...b.to].every((v, i) => v >= 1 && v <= (i % 2 ? 31 : 12)) || b.date[0] > 12) return; // (a window that is not months and days is none)
    const md = (m, dd) => m * 100 + dd, now = md(g.clock.m, g.clock.d), f = md(...b.from), t = md(...b.to);
    if (f <= t ? now >= f && now <= t : now >= f || now <= t) return;
    g.setClock(g.clock.y, b.date[0], b.date[1], g.clock.min);
    g.H.toast(`${b.what || d.name} flower from ${b.from[1]} ${g.MONTHS[b.from[0] - 1]} to ${b.to[1]} ${g.MONTHS[b.to[0] - 1]}: the date is now ${b.date[1]} ${g.MONTHS[b.date[0] - 1]}.`);
  }
  // everywhere the map offers, in groups, nearest first within a group except the landmarks (the city's own order)
  function travelGroups() {
    const quick = [];
    if (g.waypoint) quick.push({ kind: 'point', id: 'waypoint', name: 'Your waypoint', at: g.waypoint });
    if (g.myCar && g.player.mode !== 'car') quick.push({ kind: 'car', id: 'car', name: 'Your car', at: [g.myCar.D.st.x, g.myCar.D.st.y] });
    quick.push({ kind: 'start', id: 'start', name: 'Where you started', at: g.G.start.at });
    const near = l => l.sort((a, b) => Math.hypot(a.at[0] - g.player.x, a.at[1] - g.player.y) - Math.hypot(b.at[0] - g.player.x, b.at[1] - g.player.y));
    const open = l => (g.bounds ? g.bounds.keep(l) : l); // (nowhere past the planned area's edge: bounds.js)
    return [
      ['Places', (g.G.travel || []).map(t => ({ kind: 'place', id: t.id, name: t.name, at: t.at, look: t.look, pitch: t.pitch, best: t.best }))],
      ['Landmarks', g.landmarks],
      ['Trig stations', near(g.VP.map(v => ({ kind: 'trig', id: v.id, name: v.name, at: [v.x, v.y, v.z] })))],
      ['Fishing spots', g.fish ? near(g.fish.spots.map(f => ({ kind: 'fish', id: `fish-${f.id}`, name: f.name, at: f.at }))) : []],
      ['Ferry wharves', near(g.G.wharves.map(w => ({ kind: 'wharf', id: w.id, name: w.name, at: w.landing })))],
      [region ? `Elsewhere in ${region.name}` : '', region ? near(region.stations.slice()) : []],
      ['Shortcuts', quick],
    ].map(([t, l]) => [t, open(l)]).filter(([, l]) => l.length);
  }
  const fmtDist = m => (m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 9500 ? 1 : 0)} km`);
  let travelList = [];
  function renderTravel() {
    const groups = travelGroups(), key = groups.map(([t, l]) => `${t}:${l.map(d => `${d.id}@${Math.round(Math.hypot(d.at[0] - g.player.x, d.at[1] - g.player.y) / 50)}`).join(',')}`).join('|');
    if (key === g.travelKey) return;
    g.travelKey = key; travelList = [];
    g.$('#g-travel').innerHTML = groups.map(([title, list]) => `<li class="g-tgroup"><h4>${title}</h4><ul>${list.map(d => {
      travelList.push(d);
      return `<li><button data-k="${travelList.length - 1}"${d.kind === 'district' ? ' class="g-tdistrict"' : ''}><span>${d.name}${d.kind === 'district' ? `<small>${d.map.name} map</small>` : ''}</span><span class="num">${fmtDist(Math.hypot(d.at[0] - g.player.x, d.at[1] - g.player.y))}</span></button></li>`;
    }).join('')}</ul></li>`).join('');
  }
  // the card over the map for a picked pin or spot: travel there, or set a waypoint
  function pick(d, cx, cy) {
    g.picked = d;
    g.$('#g-mappop-name').textContent = d.kind === 'point' ? 'Your pin' : d.name;
    const deck = d.kind === 'landmark' && deckOf(d) && deckStand(deckOf(d)), up = deck ? ` · travel takes you up to its deck, ${Math.round(deck[2] - Math.max(0, g.nav.terrain(deck[0], deck[1])))} m up` : '';
    g.$('#g-mappop-note').textContent = `${{ landmark: 'Landmark', place: 'Place', trig: 'Trig station', fish: 'Fishing spot', wharf: 'Ferry wharf', car: 'Your car', start: 'Where you started', point: 'Waypoint set' }[d.kind] || ''} · ${fmtDist(Math.hypot(d.at[0] - g.player.x, d.at[1] - g.player.y))} away${up}`;
    if (d.kind === 'district') g.$('#g-mappop-note').textContent = `${d.map.name} map · ${fmtDist(Math.hypot(d.at[0] - g.player.x, d.at[1] - g.player.y))} away · its own map loads`;
    g.$('#g-mappop-line').textContent = d.kind === 'district' ? d.line : '';
    g.$('#g-mappop-line').hidden = d.kind !== 'district' || !d.line;
    g.$('#g-mappop-go').textContent = d.kind === 'district' ? `Go to ${d.map.name}` : 'Travel here';
    g.$('#g-mappop-way').hidden = d.kind === 'point' || d.kind === 'district';
    g.mapPop.hidden = false;
    placePop(cx, cy);
    g.$('#g-mappop-go').focus({ preventScroll: true });
  }
  function placePop(cx, cy) {
    const box = g.bigCanvas.getBoundingClientRect(), w = g.mapPop.offsetWidth, h = g.mapPop.offsetHeight;
    g.mapPop.style.left = `${Math.max(6, Math.min(box.width - w - 6, cx - w / 2))}px`;
    g.mapPop.style.top = `${cy - h - 14 > 6 ? cy - h - 14 : Math.min(box.height - h - 6, cy + 14)}px`;
  }
  // the map's zoom (1: the whole city fits) and the base-map pixel at its centre, kept while the map is closed;
  // the names are laid out afresh at each zoom, so the ones crowded out come back as you zoom in
  const mapZ = { z: 1, cx: null, cy: null }, touches = new Map();
  const mapZMax = () => Math.max(4, 2 / (g.bigView ? g.bigView.fit : 0.25)); // up to about a metre a screen pixel
  const mapZMin = () => (g.bigView ? g.bigView.zmin : 1); // below 1, the region round this map (region, above)
  function drawBig() {
    const box = g.bigCanvas.parentElement.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const cw = Math.round(box.width * dpr), ch = Math.round(box.height * dpr);
    if (g.bigCanvas.width !== cw || g.bigCanvas.height !== ch) { g.bigCanvas.width = cw; g.bigCanvas.height = ch; }
    const bw = g.base.canvas.width, bh = g.base.canvas.height, fit = Math.min(cw / bw, ch / bh);
    // the extent that can be shown: this map, or with the region the whole city's maps (base-map pixels)
    const ext = region ? [g.base.X(region.box[0]), g.base.Y(region.box[3]), g.base.X(region.box[1]), g.base.Y(region.box[2])] : [0, 0, bw, bh];
    // (the whole city fits clear of the switch over the top corner and the zoom buttons at the side)
    const zmin = region ? Math.min(1, Math.min((cw - 110 * dpr) / (ext[2] - ext[0]), (ch - 120 * dpr) / (ext[3] - ext[1])) / fit) : 1;
    mapZ.z = THREE.MathUtils.clamp(mapZ.z, zmin, Math.max(4, 2 / fit));
    const g_ = g.bigCanvas.getContext('2d'), s = fit * mapZ.z;
    // the centre held where the extent still fills the frame on that axis (or centred where it is narrower); this map's centre by default
    const half = (c, a, b, n, full) => ((b - a) * s <= full ? (n * s <= full && !(mapZ.z < 1 - 1e-3) ? n / 2 : (a + b) / 2) : THREE.MathUtils.clamp(c ?? n / 2, a + full / s / 2, b - full / s / 2));
    mapZ.cx = half(mapZ.cx, ext[0], ext[2], bw, cw); mapZ.cy = half(mapZ.cy, ext[1], ext[3], bh, ch);
    const ox = cw / 2 - mapZ.cx * s, oy = ch / 2 - mapZ.cy * s;
    g.bigView = { s, ox, oy, dpr, fit, zmin };
    g_.clearRect(0, 0, g.bigCanvas.width, g.bigCanvas.height);
    const P2 = (x, y) => [ox + g.base.X(x) * s, oy + g.base.Y(y) * s];
    const out = mapZ.z < 1 - 1e-3; // zoomed out past this map, into the region
    if (region) { // the other maps, under this one: their extents, and the railway lines joining them
      g_.save();
      for (const m of region.maps) {
        const [x0, y0] = P2(m.x0, m.y1), [x1, y1] = P2(m.x1, m.y0);
        g_.fillStyle = 'rgba(22, 29, 38, 0.92)'; g_.fillRect(x0, y0, x1 - x0, y1 - y0);
        const gr = g_.createLinearGradient(x0, y0, x0, y1); gr.addColorStop(0, 'rgba(255, 176, 102, 0.07)'); gr.addColorStop(1, 'rgba(255, 176, 102, 0.015)');
        g_.fillStyle = gr; g_.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
      g_.lineWidth = 2.2 * dpr; g_.lineJoin = g_.lineCap = 'round'; g_.globalAlpha = 0.55;
      for (const l of region.lines) {
        g_.strokeStyle = l.colour; g_.beginPath();
        l.pts.forEach((p, i) => { const [x, y] = P2(p[0], p[1]); i ? g_.lineTo(x, y) : g_.moveTo(x, y); });
        if (l.loop) g_.closePath();
        g_.stroke();
      }
      g_.restore();
    }
    g_.drawImage(g.base.canvas, ox, oy, g.base.canvas.width * s, g.base.canvas.height * s);
    if (region) { // every map's edge over the lot: the others dashed, this one in gold once you are out past it
      g_.save(); g_.lineWidth = 1.2 * dpr;
      g_.setLineDash([5 * dpr, 4 * dpr]); g_.strokeStyle = 'rgba(255, 176, 102, 0.6)';
      for (const m of region.maps) { const [x0, y0] = P2(m.x0, m.y1), [x1, y1] = P2(m.x1, m.y0); g_.strokeRect(x0, y0, x1 - x0, y1 - y0); }
      if (out) { g_.setLineDash([]); g_.strokeStyle = 'rgba(255, 210, 150, 0.9)'; g_.lineWidth = 1.6 * dpr; g_.strokeRect(ox, oy, bw * s, bh * s); }
      g_.restore();
    }
    g_.lineWidth = 2 * dpr;
    for (const r of g.G.ferries) { g_.strokeStyle = 'rgba(30,91,58,0.75)'; g_.setLineDash([6 * dpr, 4 * dpr]); for (const l of r.legs) { g_.beginPath(); l.path.forEach((p, i) => { const [x, y] = P2(p[0], p[1]); i ? g_.lineTo(x, y) : g_.moveTo(x, y); }); g_.stroke(); } }
    g_.setLineDash([]);
    const way = g.guide.pts && g.gold.ahead(); // the gold route still to go, as on the minimap and in the world
    if (way && way.length > 1) {
      g_.save(); g_.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--sun') || '#ffc23d'; g_.lineWidth = 3.5 * dpr; g_.lineJoin = g_.lineCap = 'round';
      g_.beginPath(); let pen = false; for (const p of way) { if (!p) { pen = false; continue; } const [x, y] = P2(p[0], p[1]); if (pen) g_.lineTo(x, y); else g_.moveTo(x, y); pen = true; } g_.stroke(); g_.restore(); // (a null: the break at a lift)
    }
    g_.save(); g_.scale(dpr, dpr);
    g.bigPins = [];
    const marks = [], ctl = []; // every icon drawn, which the names keep clear of, and the controls over the map
    for (const el of [g.$('#g-mapzoom'), region && g.$('#g-mapscope')]) {
      if (!el) continue;
      const r = el.getBoundingClientRect(), c = g.bigCanvas.getBoundingClientRect();
      if (r.width) ctl.push([r.left - c.left - 4, r.top - c.top - 4, r.right - c.left + 4, r.bottom - c.top + 4]);
    }
    const icon = (ic, x, y, d) => { g.H.drawIcon(g_, ic, x / dpr, y / dpr); marks.push([x / dpr - 7, y / dpr - 7, x / dpr + 7, y / dpr + 7]); if (d) g.bigPins.push({ x: x / dpr, y: y / dpr, d }); };
    // the landmarks and travel points; their names go on last, over everything but the player, the city's first
    // ones first, each beside its pin where it covers no other pin or name (else left off: a pin names itself when picked)
    const named = [...(g.G.travel || []).map(t => ({ kind: 'place', id: t.id, name: t.name, at: t.at, look: t.look, pitch: t.pitch, best: t.best })), ...g.landmarks];
    for (const d of named) icon({ kind: d.kind }, ...P2(d.at[0], d.at[1]), d);
    if (region) for (const d of region.stations) icon({ kind: 'district' }, ...P2(d.at[0], d.at[1]), d);
    for (const w of g.G.wharves) icon({ kind: 'wharf' }, ...P2(...w.terminal), { kind: 'wharf', id: w.id, name: w.name, at: w.landing });
    for (const h of g.G.helipads) icon({ kind: 'pad' }, ...P2(h.at[0], h.at[1]));
    for (const v of g.VP) icon({ kind: 'trig', done: !!g.trigDone()[v.id] }, ...P2(v.x, v.y), { kind: 'trig', id: v.id, name: v.name, at: [v.x, v.y, v.z] });
    if (g.fish) for (const f of g.fish.spots) icon({ kind: 'fish' }, ...P2(f.at[0], f.at[1]), { kind: 'fish', id: `fish-${f.id}`, name: f.name, at: f.at });
    for (const f of g.flocks) if (!f.soaring) icon({ kind: 'gull' }, ...P2(f.at[0], f.at[1]));
    for (const v of g.fer.vessels) icon({ kind: 'ferry' }, ...P2(v.x, v.y));
    if (g.player.mode !== 'heli') icon({ kind: 'heli' }, ...P2(g.heli.st.x, g.heli.st.y));
    if (g.myCar && g.player.mode !== 'car') icon({ kind: 'car' }, ...P2(g.myCar.D.st.x, g.myCar.D.st.y), { kind: 'car', id: 'car', name: 'Your car', at: [g.myCar.D.st.x, g.myCar.D.st.y] });
    if (g.ride && g.ride.phase !== 'leaving') {
      const st = g.ride.drv.st, P = g.ride.drv.path;
      if (g.ride.phase === 'coming' || g.ride.phase === 'driving') {
        g_.restore(); g.H.rideLine(g_, [[st.x, st.y]].concat(P.pts.slice(P.pos(st.s, {}).i + 1)), x => P2(x, 0)[0], y => P2(0, y)[1], dpr); g_.save(); g_.scale(dpr, dpr);
      }
      if (g.ride.phase === 'coming' || g.ride.phase === 'waiting') icon({ kind: 'pickup' }, ...P2(g.ride.pickup.x, g.ride.pickup.y));
      if (g.player.mode !== 'ride') icon({ kind: 'ridecar', rot: st.h }, ...P2(st.x, st.y));
    }
    for (const n of g.npcs) icon({ kind: 'npc', color: g.wantsTalk(n) ? '#e0a21a' : '#5b6b77', label: n.name[0] }, ...P2(n.x, n.y));
    for (const o of g.sideObjectives()) icon({ kind: 'quest2' }, ...P2(...o.at));
    const ob = g.objective();
    if (ob && ob.at) icon({ kind: 'quest' }, ...P2(...ob.at));
    if (g.waypoint) icon({ kind: 'waypoint' }, ...P2(...g.waypoint));
    const [px, py] = P2(g.player.mode === 'heli' ? g.heli.st.x : g.player.mode === 'ferry' ? g.player.vehicle.x : g.player.x, g.player.mode === 'heli' ? g.heli.st.y : g.player.mode === 'ferry' ? g.player.vehicle.y : g.player.y);
    // the city's first five landmarks are named over anything but another pin; the rest keep clear of every icon,
    // and a landmark is named before a travel place, which the list beside the map names too
    const me = [px / dpr - 11, py / dpr - 11, px / dpr + 11, py / dpr + 11], pinBox = g.bigPins.map(q => [q.x - 7, q.y - 7, q.x + 7, q.y + 7]);
    const taken = marks.concat([me], ctl), first = new Set(g.landmarks.slice(0, 5)), firstTaken = pinBox.concat([me], ctl);
    g_.font = '600 11px "Public Sans", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif'; g_.textBaseline = 'middle'; g_.lineJoin = 'round';
    const said = []; // pins already named: a place and a landmark on the same spot take one name
    // the other districts' stations first when out in the region, which is what that view is for; else after this map's own
    const rank = q => (q.d.kind === 'district' ? (out ? 3 : -1) : first.has(q.d) ? 2 : q.d.kind === 'landmark' ? 1 : 0); // then the landmarks, then the travel places
    // the maps' own names, set in their top corner as a game's map names its regions
    if (region) {
      g_.save(); g_.textBaseline = 'top'; g_.textAlign = 'left';
      for (const m of region.maps.map(m => ({ ...m, me: false })).concat(out ? [{ name: region.here, native: '', x0: g.scene.frame.x[0], y1: g.scene.frame.y[1], x1: g.scene.frame.x[1], me: true }] : [])) {
        const [x0, y0] = P2(m.x0, m.y1), [x1, y1] = P2(m.x1, m.me ? g.scene.frame.y[0] : m.y0);
        if (x1 / dpr - x0 / dpr < 70) continue;
        const t = m.name.toUpperCase().split('').join(String.fromCharCode(8202));
        g_.font = '500 10.5px "Zalando Sans Expanded", "Michroma", "Public Sans", sans-serif';
        const tw = g_.measureText(t).width, lw = tw + 4, L = [x0 / dpr, y0 / dpr, x1 / dpr, y1 / dpr];
        // a corner of the map's frame clear of pins, in view and (for another map) off this one where it can be
        const own = [P2(g.scene.frame.x[0], 0)[0] / dpr, P2(0, g.scene.frame.y[1])[1] / dpr, P2(g.scene.frame.x[1], 0)[0] / dpr, P2(0, g.scene.frame.y[0])[1] / dpr];
        const hit = (r, list) => list.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
        const corners = [[L[0] + 8, L[1] + 8], [L[2] - 8 - lw, L[1] + 8], [L[0] + 8, L[3] - 34], [L[2] - 8 - lw, L[3] - 34]]
          .map(([x, y]) => ({ x, y, r: [x - 2, y - 2, x + lw + 2, y + 27] }))
          .filter(c => c.r[0] > 2 && c.r[1] > 2 && c.r[2] < box.width - 2 && c.r[3] < box.height - 2);
        const score = c => (hit(c.r, taken) ? 2 : 0) + (!m.me && !out && hit(c.r, [own]) ? 1 : 0);
        const best = corners.sort((a, b) => score(a) - score(b))[0];
        if (!best || score(best) >= 2) continue;
        const X0 = best.x, Y0 = best.y;
        g_.strokeStyle = 'rgba(6, 10, 18, 0.85)'; g_.lineWidth = 3.2; g_.strokeText(t, X0, Y0);
        g_.fillStyle = m.me ? '#ffd296' : '#ffb066'; g_.fillText(t, X0, Y0);
        g_.font = '400 9px "JetBrains Mono", ui-monospace, monospace';
        const sub = m.me ? 'You are here' : `${m.native ? `${m.native} · ` : ''}another map`;
        g_.strokeText(sub, X0, Y0 + 15); g_.fillStyle = 'rgba(244, 239, 230, 0.7)'; g_.fillText(sub, X0, Y0 + 15);
        taken.push([X0 - 2, Y0 - 2, X0 + Math.max(tw, g_.measureText(sub).width) + 4, Y0 + 27]); firstTaken.push(taken[taken.length - 1]);
      }
      g_.restore();
      g_.font = '600 11px "Public Sans", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif'; g_.textBaseline = 'middle';
    }
    for (const q of g.bigPins.slice().sort((a, b) => rank(b) - rank(a))) {
      if ((q.d.kind !== 'landmark' && q.d.kind !== 'place' && q.d.kind !== 'district' && q.d.kind !== 'fish') || said.some(o => Math.hypot(o.x - q.x, o.y - q.y) < 16)) continue;
      const w = g_.measureText(q.d.name).width;
      // right, left, above or below its pin: [text x, text y, align]
      for (const [tx, ty, al] of [[q.x + 10, q.y, 'left'], [q.x - 10, q.y, 'right'], [q.x, q.y - 15, 'center'], [q.x, q.y + 15, 'center']]) {
        const x0 = al === 'left' ? tx - 1 : al === 'right' ? tx - w - 2 : tx - w / 2 - 2, r = [x0, ty - 7, x0 + w + 3, ty + 7];
        if (r[0] < 2 || r[2] > box.width - 2 || r[1] < 2 || r[3] > box.height - 2 || (first.has(q.d) ? firstTaken : taken).some(t => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1])) continue;
        taken.push(r); firstTaken.push(r); said.push(q);
        g_.textAlign = al;
        g_.strokeStyle = 'rgba(6, 10, 18, 0.82)'; g_.lineWidth = 3.2; g_.strokeText(q.d.name, tx, ty);
        g_.fillStyle = q.d.kind === 'district' ? '#ffb066' : q.d.kind === 'place' ? '#ffd9a8' : q.d.kind === 'fish' ? '#9fd8ee' : '#f4efe6'; g_.fillText(q.d.name, tx, ty);
        break;
      }
    }
    g.bigNames = said.map(q => q.d.name);
    g_.translate(px / dpr, py / dpr); g_.rotate(g.player.mode === 'heli' ? g.heli.st.h : g.player.h);
    g_.fillStyle = '#ffffff'; g_.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg'); g_.lineWidth = 2; // white on the gold route
    g_.beginPath(); g_.moveTo(0, -10); g_.lineTo(7, 8); g_.lineTo(0, 4); g_.lineTo(-7, 8); g_.closePath(); g_.fill(); g_.stroke();
    g_.restore();
    edgeChips(g_, P2, cw, ch, dpr);
    zoomUi();
    if (g.picked && !g.mapPop.hidden) { // the card follows its place as the map moves, and goes when it leaves the frame
      const q = g.picked.kind === 'point' ? g.waypoint || g.picked.at : g.picked.at, [cx, cy] = P2(q[0], q[1]);
      if (cx < 0 || cy < 0 || cx > cw || cy > ch) { g.mapPop.hidden = true; g.picked = null; } else placePop(cx / dpr, cy / dpr);
    }
    renderTravel();
  }
  // a district wholly out of view: a chip on the map's edge in its direction, its name and how far; picking it
  // shows the whole region with that district's card
  function edgeChips(g_, P2, cw, ch, dpr) {
    g.bigChips = [];
    if (!region) return;
    const W = cw / dpr, Hh = ch / dpr, cx = W / 2, cy = Hh / 2;
    g_.save(); g_.scale(dpr, dpr);
    g_.font = '600 11px "Public Sans", "Noto Sans JP", sans-serif'; g_.textBaseline = 'middle'; g_.textAlign = 'left';
    for (const m of region.maps) {
      const [ax, ay] = P2(m.x0, m.y1), [bx, by] = P2(m.x1, m.y0);
      if (bx / dpr > 0 && ax / dpr < W && by / dpr > 0 && ay / dpr < Hh) continue; // some of it in view
      const mx = (ax + bx) / 2 / dpr, my = (ay + by) / 2 / dpr, dx = mx - cx, dy = my - cy;
      const t = Math.min((W / 2 - 24) / Math.max(1e-6, Math.abs(dx)), (Hh / 2 - 22) / Math.max(1e-6, Math.abs(dy)));
      const near = Math.hypot(Math.max(m.x0 - g.player.x, 0, g.player.x - m.x1), Math.max(m.y0 - g.player.y, 0, g.player.y - m.y1));
      const label = `${m.name} · ${fmtDist(near)}`, tw = g_.measureText(label).width, w = tw + 34, h = 26;
      let x = cx + dx * t, y = cy + dy * t;
      x = THREE.MathUtils.clamp(x - w / 2, 8, W - w - 52) ; y = THREE.MathUtils.clamp(y - h / 2, 8, Hh - h - 8);
      for (const c of g.bigChips) if (x < c[2] + 4 && x + w > c[0] - 4 && y < c[3] + 4 && y + h > c[1] - 4) y = c[3] + 6; // stacked, not on top of one another
      g_.fillStyle = 'rgba(10, 14, 22, 0.88)'; g_.strokeStyle = 'rgba(255, 176, 102, 0.75)'; g_.lineWidth = 1;
      g_.beginPath(); g_.roundRect ? g_.roundRect(x, y, w, h, 13) : g_.rect(x, y, w, h); g_.fill(); g_.stroke();
      g_.save(); g_.translate(x + 14, y + h / 2); g_.rotate(Math.atan2(dy, dx)); // an arrowhead, pointing to the district
      g_.fillStyle = '#ffb066'; g_.beginPath(); g_.moveTo(5, 0); g_.lineTo(-3.5, -4.5); g_.lineTo(-1.5, 0); g_.lineTo(-3.5, 4.5); g_.closePath(); g_.fill(); g_.restore();
      g_.fillStyle = '#f4efe6'; g_.fillText(label, x + 25, y + h / 2 + 0.5);
      g.bigChips.push([x, y, x + w, y + h, m]);
    }
    g_.restore();
  }
  // the whole region in view (zoomMap's lower bound), or back to this map
  function showRegion(on) {
    if (!g.bigView) return;
    if (on && region) { mapZ.z = 0; mapZ.cx = mapZ.cy = null; } else { mapZ.z = 1; mapZ.cx = mapZ.cy = null; }
    g.mapPop.hidden = true; g.picked = null;
    drawBig();
  }
  // a click picks the pin under it, or drops a waypoint there; a double click travels at once
  const mapHit = e => {
    if (!g.bigView) return null;
    const r = g.bigCanvas.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top, reach = g.touch ? 22 : 14;
    let best = null, bd = reach;
    for (const p of g.bigPins) { const d = Math.hypot(p.x - cx, p.y - cy); if (d < bd) { bd = d; best = p; } }
    const bx = (cx * g.bigView.dpr - g.bigView.ox) / g.bigView.s, by = (cy * g.bigView.dpr - g.bigView.oy) / g.bigView.s;
    return { cx, cy, pin: best, at: [g.scene.frame.x[0] + bx * g.base.PX, g.scene.frame.y[1] - by * g.base.PX] };
  };
  // zoom about a point of the canvas (CSS pixels; its centre if none), keeping the spot under it in place
  let mapRaf = 0;
  const redrawBig = () => { if (!mapRaf) mapRaf = requestAnimationFrame(() => { mapRaf = 0; if (!g.$('#g-bigmap').hidden) drawBig(); }); };
  function zoomMap(k, sx, sy) {
    if (!g.bigView) return;
    const r = g.bigCanvas.getBoundingClientRect(), { s, ox, oy, dpr } = g.bigView;
    if (sx == null) { sx = r.width / 2; sy = r.height / 2; }
    const z = THREE.MathUtils.clamp(mapZ.z * k, mapZMin(), mapZMax()), s2 = g.bigView.fit * z;
    const bx = (sx * dpr - ox) / s, by = (sy * dpr - oy) / s; // the base-map pixel under the point
    mapZ.z = z; mapZ.cx = bx - (sx * dpr - g.bigCanvas.width / 2) / s2; mapZ.cy = by - (sy * dpr - g.bigCanvas.height / 2) / s2;
    redrawBig();
  }
  const panMap = (dx, dy) => { if (!g.bigView) return; mapZ.cx -= dx * g.bigView.dpr / g.bigView.s; mapZ.cy -= dy * g.bigView.dpr / g.bigView.s; redrawBig(); };
  function zoomUi() {
    const z = g.$('#g-mapzoom');
    if (!z) return;
    z.querySelector('[data-z="in"]').disabled = mapZ.z >= mapZMax() - 1e-3;
    z.querySelector('[data-z="out"]').disabled = mapZ.z <= mapZMin() + 1e-3;
    z.querySelector('[data-z="fit"]').disabled = Math.abs(mapZ.z - 1) < 1e-3;
    g.bigCanvas.style.cursor = g.mapDrag && g.mapDrag.moved ? 'grabbing' : mapZ.z > 1 + 1e-3 || mapZ.z < 1 - 1e-3 ? 'grab' : '';
    const sc = g.$('#g-mapscope');
    if (sc && region) { const o = mapZ.z < 1 - 1e-3; sc.querySelector('[data-scope="here"]').setAttribute('aria-pressed', String(!o)); sc.querySelector('[data-scope="all"]').setAttribute('aria-pressed', String(o)); }
  }
  // the wheel (or a trackpad's pinch, which comes as a wheel with ctrl) zooms; a drag pans; two fingers pinch and pan
  g.on(g.bigCanvas, 'wheel', e => {
    e.preventDefault();
    const r = g.bigCanvas.getBoundingClientRect(), dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    zoomMap(Math.exp(-THREE.MathUtils.clamp(dy, -200, 200) * (e.ctrlKey ? 0.01 : 0.0022)), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  g.on(g.bigCanvas, 'pointerdown', e => {
    if (e.button > 0) return;
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    try { g.bigCanvas.setPointerCapture(e.pointerId); } catch (err) { /* the pointer went already */ }
    if (touches.size === 1) { g.mapDrag = { x: e.clientX, y: e.clientY, moved: false }; g.dragged = false; } else g.mapDrag = { pinch: true, moved: true };
  });
  g.on(g.bigCanvas, 'pointermove', e => {
    const was = touches.get(e.pointerId);
    if (!was || !g.mapDrag) return;
    if (touches.size >= 2) {
      const [a, b] = [...touches.values()], other = a === was ? b : a;
      const d0 = Math.hypot(was[0] - other[0], was[1] - other[1]), d1 = Math.hypot(e.clientX - other[0], e.clientY - other[1]);
      const r = g.bigCanvas.getBoundingClientRect(), mx = (e.clientX + other[0]) / 2 - r.left, my = (e.clientY + other[1]) / 2 - r.top;
      panMap((e.clientX - was[0]) / 2, (e.clientY - was[1]) / 2);
      if (d0 > 8) zoomMap(d1 / d0, mx, my);
      g.dragged = true;
    } else {
      if (!g.mapDrag.moved && Math.hypot(e.clientX - g.mapDrag.x, e.clientY - g.mapDrag.y) > (g.touch ? 9 : 5)) g.mapDrag.moved = g.dragged = true;
      if (g.mapDrag.moved) panMap(e.clientX - was[0], e.clientY - was[1]);
    }
    touches.set(e.pointerId, [e.clientX, e.clientY]);
  });
  const lift = e => { touches.delete(e.pointerId); if (!touches.size) { g.mapDrag = null; zoomUi(); } else if (touches.size === 1) { const [p] = touches.values(); g.mapDrag = { x: p[0], y: p[1], moved: true }; } };
  g.on(g.bigCanvas, 'pointerup', lift);
  g.on(g.bigCanvas, 'pointercancel', lift);
  if (region) {
    const sc = g.$('#g-mapscope');
    sc.hidden = false;
    sc.querySelector('[data-scope="here"]').textContent = region.here;
    sc.querySelector('[data-scope="all"]').textContent = `All of ${region.name}`;
    g.on(sc, 'click', e => { const b = e.target.closest('button[data-scope]'); if (b) showRegion(b.dataset.scope === 'all'); });
    g.$('#g-lg-district').hidden = false;
    g.$('#g-lg-district').lastChild.textContent = `Another district of ${region.name}: a map of its own`;
  }
  g.on(g.$('#g-mapzoom'), 'click', e => {
    const b = e.target.closest('button[data-z]');
    if (!b) return;
    if (b.dataset.z === 'fit') { mapZ.z = 1; mapZ.cx = mapZ.cy = null; redrawBig(); } else zoomMap(b.dataset.z === 'in' ? 2 : 0.5);
  });
  g.on(g.bigCanvas, 'click', e => {
    if (g.dragged) { g.dragged = false; return; } // the end of a drag or a pinch is not a pick
    const h = mapHit(e);
    if (!h) return;
    const chip = g.bigChips.find(c => h.cx >= c[0] && h.cx <= c[2] && h.cy >= c[1] && h.cy <= c[3]);
    if (chip) { // out to the region, with that district's first station picked
      showRegion(true);
      const st = region.stations.find(d => d.map === chip[4] && !d.travel) || region.stations.find(d => d.map === chip[4]);
      const q = st && g.bigPins.find(p => p.d === st);
      if (q) pick(st, q.x, q.y);
      return;
    }
    if (h.pin) { pick(h.pin.d, h.pin.x, h.pin.y); return; }
    const f = g.scene.frame;
    if (h.at[0] < f.x[0] || h.at[0] > f.x[1] || h.at[1] < f.y[0] || h.at[1] > f.y[1]) { // off this map: in another, its nearest station
      const m = region && region.maps.find(q => h.at[0] >= q.x0 && h.at[0] <= q.x1 && h.at[1] >= q.y0 && h.at[1] <= q.y1);
      const st = m && region.stations.filter(d => d.map === m).sort((a, b) => Math.hypot(a.at[0] - h.at[0], a.at[1] - h.at[1]) - Math.hypot(b.at[0] - h.at[0], b.at[1] - h.at[1]))[0];
      const q = st && g.bigPins.find(p => p.d === st);
      if (q) pick(st, q.x, q.y);
      return;
    }
    g.waypoint = h.at;
    drawBig();
    pick({ kind: 'point', id: 'waypoint', name: 'Your waypoint', at: g.waypoint }, h.cx, h.cy);
  });
  g.on(g.bigCanvas, 'dblclick', e => { if (g.dragged) return; const h = mapHit(e); if (h && g.bigChips.some(c => h.cx >= c[0] && h.cx <= c[2] && h.cy >= c[1] && h.cy <= c[3])) return; const f = g.scene.frame; if (h && !h.pin && (h.at[0] < f.x[0] || h.at[0] > f.x[1] || h.at[1] < f.y[0] || h.at[1] > f.y[1])) return; if (h) travelTo(h.pin ? h.pin.d : { kind: 'point', id: 'waypoint', name: 'Your waypoint', at: g.waypoint || h.at }); });
  g.on(g.$('#g-mappop-go'), 'click', () => { if (g.picked) travelTo(g.picked); });
  g.on(g.$('#g-mappop-way'), 'click', () => { if (!g.picked) return; g.waypoint = g.picked.at.slice(0, 2); g.mapPop.hidden = true; g.picked = null; g.travelKey = ''; drawBig(); g.H.toast(g.player.mode === 'car' && !g.pilot ? 'Waypoint set. <kbd>J</kbd>: the autopilot drives you there.' : g.routeMode === 'on' ? 'Waypoint set. Follow the gold route there.' : 'Waypoint set. Its route is on the minimap; <kbd>L</kbd> shows it in the world.'); });
  g.on(g.$('#g-travel'), 'click', e => { const b = e.target.closest('button[data-k]'); if (b && travelList[+b.dataset.k]) travelTo(travelList[+b.dataset.k]); });
  g.$('#g-bigmap header .note').textContent = g.touch ? 'Tap a place to travel there · pinch to zoom' : 'Pick a place to travel there · double-click to go at once · scroll to zoom, drag to pan';
  g.on(g.$('#g-map-btn'), 'click', g.toggleMap);
  // the HUD's other buttons, folded behind "more" (index.html .g-btns): open while the tour points at them, and as
  // the player left them
  const moreTray = (open, keep = true) => {
    g.$('#g-btns').classList.toggle('open', open); g.$('#g-more-btn').setAttribute('aria-expanded', String(open));
    if (keep) { try { localStorage.setItem('bh-hud-more', open ? '1' : '0'); } catch (e) { /* storage blocked */ } }
  };
  g.on(g.$('#g-more-btn'), 'click', () => moreTray(!g.$('#g-btns').classList.contains('open')));
  try { if (localStorage.getItem('bh-hud-more') === '1') moreTray(true, false); } catch (e) { /* storage blocked */ }
  g.on(g.$('#gq-lines'), 'click', e => { const b = e.target.closest('button'); if (b) g.cycleTrack(b.dataset.line); });
  g.on(g.$('#g-pass-btn'), 'click', g.togglePass);
  g.on(g.$('#g-menu-btn'), 'click', g.toggleMenu);
  g.on(g.$('#g-metro-btn'), 'click', g.openMetro);
  g.on(g.$('#gm-links'), 'click', e => {
    if (e.target.closest('#gm-metro')) g.openMetro();
    if (e.target.closest('#gm-fishlog')) { g.$('#g-menu').hidden = true; g.fishLoad().then(api => (api ? api.showLog(true) : g.H.toast('The log did not arrive. Try again in a moment.'))); }
  });
  for (const id of ['#g-bigmap-close', '#g-pass-close', '#g-menu-close']) g.on(g.$(id), 'click', () => { g.$(id).closest('.g-overlay').hidden = true; });
  g.on(g.$('#gm-time'), 'click', e => { const b = e.target.closest('button'); if (b) { g.presetTime(b.dataset.t); g.menuSync(); g.H.toast(`Time: ${b.dataset.label || b.textContent}, ${g.fmtMin(g.clock.min)}`); } });
  g.on(g.$('#gm-clock'), 'input', e => { g.setClock(g.clock.y, g.clock.m, g.clock.d, +e.target.value); g.menuSync(); });
  g.on(g.$('#gm-date'), 'change', e => { const [y, m, d] = e.target.value.split('-').map(Number); if (y && m && d) { g.setClock(y, m, d, g.clock.min); g.menuSync(); } });
  g.on(g.$('#gm-speed'), 'click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    g.clock.frozen = b.dataset.s === '0'; if (!g.clock.frozen) g.clock.scale = +b.dataset.s;
    if (g.clock.frozen || g.clock.scale !== 1) g.clock.own = true; // (a clock at another speed is the player's own from then on)
    g.$$('#gm-speed button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    g.applySun();
  });
  g.on(g.$('#gm-density'), 'click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    g.settings.density = b.dataset.d;
    g.applyDensity(); g.cars.fresh = 1; // (the traffic's count at once: game.js trafficWant)
    g.$$('#gm-density button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });
  // the frame-rate cap (the governor's): the display's own rate, 60 or 30 a second; kept for the next visit
  g.$$('#gm-fps button').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.f === g.gov.cap)));
  g.on(g.$('#gm-fps'), 'click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    g.gov.cap = +b.dataset.f; g.gov.reset();
    try { localStorage.setItem('bh-fps', String(g.gov.cap)); } catch (err) { /* storage blocked */ }
    g.$$('#gm-fps button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });
  g.on(g.$('#gm-route'), 'click', e => { const b = e.target.closest('button'); if (b) g.setRouteMode(b.dataset.r); });
  g.on(g.$('#gm-weather'), 'click', e => {
    const b = e.target.closest('button');
    if (!b || !g.weather) return;
    g.weather.set(b.dataset.w, { keep: true });
    g.menuSync();
    const s = g.weather.season(g.clock.y, g.clock.m, g.clock.d, g.clock.min);
    if (b.dataset.w === 'now') {
      g.weather.onNow = w => g.H.toast(w ? `Live weather: ${OEWeather.describe(Object.assign({}, OEWeather.S, { kind: w.storm ? 'storm' : w.snow > 0.06 ? 'snow' : w.rain > 0.5 ? 'rain' : w.rain > 0.06 ? 'drizzle' : w.fog > 0.3 ? 'fog' : w.cloud > 0.6 ? 'overcast' : 'clear', cover: w.cloud, rain: w.rain, snow: w.snow, fog: w.fog, temp: w.temp, windSpeed: w.wind }))}. <a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a>` : 'Live weather could not be reached: the season\'s weather carries on.');
      g.H.toast('Live weather: asking Open-Meteo for this city\'s conditions (only the city\'s coordinates are sent).');
      return;
    }
    g.H.toast(b.dataset.w === 'live' ? `Weather as the season brings it: ${s.rain > 0.5 ? 'rain' : s.rain > 0.06 ? 'drizzle' : s.cloud > 0.6 ? 'overcast' : 'fair'} now` : `Weather: ${OEWeather.NAMES[b.dataset.w]}`);
  });
  g.setRouteMode(g.routeMode);
  g.on(g.$('#gq-route'), 'click', e => { e.stopPropagation(); g.peekRoute(); });
  if (!g.lib) g.$('#gm-who').closest('.field').hidden = true;
  g.$$('#gm-who button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.c === g.playerChar)));
  g.on(g.$('#gm-who'), 'click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    g.setPlayerCharacter(b.dataset.c).then(whoSync);
    g.$$('#gm-who button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });
  // ... and on the story's title (docs/STORY.md "The title, as a game opens"): the title in three screens. The press:
  // the street and the name, nothing to choose, until a key, a tap or a pad's button (the press a browser waits for
  // before it plays a sound, so the score comes in with it). The menu: the ways in. And who you play, a screen of its
  // own: Kagami as a woman or a man, the two portraits (tools/views/kagami.json) beside the file on them (city.json
  // story.card.who). It comes up the first time a way in is taken, as a game with one lead played as either asks after
  // New Game, and that way in goes on once one is chosen and confirmed; after that the choice stands, named under the
  // menu's list and in the pause menu, and either changes it. Nothing is chosen for the player the first time.
  // (A scripted press, a harness's, begins as before, as the woman.)
  const whoEl = g.$('#gt-who'), titleEl = g.$('#g-title');
  const whoKept = () => { try { return localStorage.getItem(g.PLAYER_KEY); } catch (e) { return null; } };
  const whoChosen = () => { try { return !!g.PLAYER_LOOKS[localStorage.getItem(g.PLAYER_KEY)]; } catch (e) { return true; } };
  const whoNeeded = () => !!whoEl && !whoEl.hidden && !whoChosen();
  // (the title's first way in, the one Enter and a pad's A take: the walk's while the episodes are being finished, walk.js)
  // (on the story's screen its Begin or Continue; on a screen with none, nothing: Enter then presses only what the hand is on)
  const titleLead = () => [...document.querySelectorAll('#g-title .gt-go > .btn.primary')].find(b => b.offsetParent) || (g.story ? null : g.$('#gt-play'));
  let whoThen = null, wayLast = null, whoFrom = 'menu'; // (the way in that brought who you play up, taken again once one is confirmed, from the screen it was on)
  const screenOf = () => titleEl.dataset.screen || 'menu';
  // the name carried from the middle of the press to the menu's corner, by where it stood and where it now stands (FLIP)
  function lockupFlip() {
    const h = g.$('#gt-title'), r0 = h.getBoundingClientRect();
    return () => {
      const r1 = h.getBoundingClientRect();
      if (!r0.width || !r1.width || !h.animate) return;
      h.animate([{ transformOrigin: '0 0', transform: `translate(${r0.left - r1.left}px, ${r0.top - r1.top}px) scale(${r0.width / r1.width})` }, { transformOrigin: '0 0', transform: 'none' }],
        { duration: 1100, easing: 'cubic-bezier(0.22, 0.8, 0.12, 1)' });
    };
  }
  function titleScreen(s) {
    if (!g.story) s = 'menu';
    const was = titleEl.dataset.screen;
    if (s === was) return;
    const flip = was === 'press' && s === 'menu' && !g.reduced ? lockupFlip() : null;
    titleEl.dataset.screen = s;
    if (flip) flip();
    if (s !== 'who' && whoEl) whoEl.dataset.hand = '';
    if (was === 'opts') optsLend(false);
    if (s === 'opts') optsLend(true);
    whoSync();
    // (the hand: on the menu's first way in as it opens, or back on the row of the screen just left; on the story's screen
    // on its Begin or Continue; on the options' first control)
    const hand = s === 'menu' ? (was === 'story' ? g.$('#gt-story-go') : was === 'opts' ? g.$('#gt-opts-go') : was === 'who' ? null : titleLead())
      : s === 'story' ? titleLead() : s === 'opts' ? g.$('#gt-opts .gt-opts-list :is(button, input)') : null;
    if (hand) hand.focus({ preventScroll: true });
    // (who you play: the hand on the one chosen; the first time on neither, not even a cursor resting on one, but on the
    // screen itself, so that Tab, the arrows or a pad's first press put it on a portrait)
    if (s === 'who' && whoEl) (whoEl.querySelector('.gt-who-row [aria-checked="true"]') || whoEl).focus({ preventScroll: true });
  }
  function whoSync() {
    if (!whoEl) return;
    const chosen = whoChosen(), s = screenOf();
    const k = (chosen && whoKept()) || g.playerChar; // (the choice as made, while its model may still be on its way)
    g.$$('#gt-who .gt-who-row [data-c]').forEach(b => b.setAttribute('aria-checked', String(chosen && b.dataset.c === k)));
    g.$$('#gm-who button').forEach(x => x.setAttribute('aria-pressed', String(chosen && x.dataset.c === k)));
    whoEl.classList.toggle('open', !chosen);
    whoEl.dataset.show = whoEl.dataset.hand || (chosen ? k : ''); // (the file's lines for the one the hand is on, else the one chosen)
    const ask = whoEl.querySelector('.gt-who-ask');
    if (chosen) ask.textContent = ''; else if (!whoEl.classList.contains('ask')) ask.textContent = 'Choose one, then confirm.';
    g.$('#gt-who-go').setAttribute('aria-disabled', String(!chosen));
    titleEl.toggleAttribute('data-choose', !chosen && !whoEl.hidden && s === 'who'); // (pad.js: A puts the hand on a portrait first)
    const line = g.$('#gt-who-line'); // (under the menu's list: who you play, and the way to change it)
    if (line) {
      line.hidden = whoEl.hidden || !chosen;
      const t = whoEl.querySelector(`.gt-who-row [data-c="${k}"] small`);
      line.querySelector('small').textContent = t ? t.textContent : '';
    }
  }
  // nothing goes on from the title until who you play is chosen: the button, Enter, a tap, a pad's A, and the title's
  // other ways on (the evening again, a frame of a closed case gone back into) each bring who you play up instead, the
  // first time, and are taken again once one is confirmed
  function whoGate() { if (whoNeeded()) { whoAsk(); return false; } return true; }
  function whoAsk(then) {
    if (screenOf() !== 'who') { whoThen = then || wayLast || null; whoFrom = screenOf(); titleScreen('who'); return; }
    whoEl.querySelector('.gt-who-ask').textContent = 'Choose who you play first.'; // (Confirm with none chosen: the two shake)
    whoEl.classList.toggle('ask', false); void whoEl.offsetWidth; whoEl.classList.toggle('ask', true);
    const f = whoEl.querySelector('.gt-who-row [data-c]');
    if (f && !whoEl.querySelector('.gt-who-row').contains(document.activeElement)) f.focus({ preventScroll: true });
  }
  function whoDone() {
    if (!whoChosen()) { whoAsk(); return; }
    const then = whoThen; whoThen = null;
    titleScreen(whoFrom || 'menu');
    if (then && then.isConnected) then.click(); else { const l = titleLead(); if (l) l.focus({ preventScroll: true }); }
  }
  function whoBack() {
    whoThen = null; titleScreen(whoFrom || 'menu');
    const l = whoFrom === 'menu' && g.$('#gt-who-line'), f = l && !l.hidden ? l : whoFrom === 'menu' ? titleLead() : null; if (f) f.focus({ preventScroll: true });
  }
  async function whoPick(c) {
    if (!g.PLAYER_LOOKS[c]) return;
    const first = !whoChosen();
    const done = g.setPlayerCharacter(c); // (kept at once; the model swapped in when it has come)
    whoSync();
    if (first && screenOf() === 'who') g.$('#gt-who-go').focus({ preventScroll: true }); // (chosen: the next press confirms)
    await done; whoSync();
  }
  if (whoEl) {
    whoEl.hidden = !(g.lib && g.story);
    g.on(whoEl, 'click', e => { const b = e.target.closest('.gt-who-row [data-c]'); if (b) whoPick(b.dataset.c); });
    // (the hand on a portrait, the pointer's or the keys', shows that one's lines in the file before it is chosen)
    const hand = c => { if (whoEl.dataset.hand !== c) { whoEl.dataset.hand = c; whoSync(); } };
    g.on(whoEl, 'pointerover', e => { const b = e.target.closest('.gt-who-row [data-c]'); hand(b ? b.dataset.c : ''); });
    g.on(whoEl, 'pointerleave', () => hand(''));
    g.on(whoEl, 'focusin', e => { const b = e.target.closest('.gt-who-row [data-c]'); hand(b && b.matches(':focus-visible') ? b.dataset.c : ''); });
    g.on(g.$('#gt-who-go'), 'click', whoDone);
    g.on(g.$('#gt-who-back'), 'click', whoBack);
    g.on(g.$('#gt-who-line'), 'click', () => { whoThen = null; whoFrom = 'menu'; titleScreen('who'); });
    g.on(titleEl, 'click', e => { const b = e.target.closest('.gt-go > .btn, #gt-eps button'); if (b) wayLast = b; }, { capture: true }); // (before the way's own press asks)
    whoSync();
  }
  // the press: a tap anywhere on it, or its prompt pressed (a pad's A presses it: button.go, pad.js), opens the menu
  g.on(g.$('#gt-press'), 'click', () => titleScreen('menu'));
  // the menu's rows (docs/STORY.md "The title, as a game opens"): Continue, while a case is going, takes it up where it was
  // left (asking who you play first, for a case begun before the title asked); the story opens its screen, the options
  // theirs; each screen's Back, Esc or B goes back to the menu
  const ownPress = e => e.isTrusted || !!(g.gamepad && g.gamepad.pressing) || g.titleKeyed; // (a person's press: the mouse's, a tap, the keys', a pad's)
  if (g.$('#gt-cont-go')) g.on(g.$('#gt-cont-go'), 'click', e => { if (ownPress(e) && whoNeeded()) { whoAsk(); return; } g.startGame(false); });
  if (g.$('#gt-story-go')) g.on(g.$('#gt-story-go'), 'click', () => titleScreen('story'));
  if (g.$('#gt-opts-go')) g.on(g.$('#gt-opts-go'), 'click', () => titleScreen('opts'));
  for (const q of ['#gt-eps-back', '#gt-opts-back']) if (g.$(q)) g.on(g.$(q), 'click', () => { const E = g.$('#gt-eps'); if (!(E && E.sure && E.sure())) titleScreen('menu'); });
  // options before play: the pause menu's own controls for the sound, the crowd and the frame rate, lent to the title's
  // screen while it is up and given back as it goes (each keeps one home, one handler and one state)
  const optLent = ['#gm-sound', '#gm-density', '#gm-fps'].map(q => { const e = g.$(q), n = e && (e.closest('.field') || e.closest('label')); return n ? { n, home: n.parentNode, next: n.nextSibling } : null; }).filter(Boolean);
  function optsLend(on) {
    const list = g.$('#gt-opts .gt-opts-list');
    if (!list) return;
    if (on) for (const o of optLent) list.appendChild(o.n);
    else for (const o of [...optLent].reverse()) o.home.insertBefore(o.n, o.next && o.next.parentNode === o.home ? o.next : null); // (the last first, so that each goes back before what followed it)
  }
  g.on(g.$('#gm-sound'), 'change', e => g.A.setMuted(!e.target.checked));
  g.on(g.$('#gm-intro'), 'click', () => { g.$('#g-menu').hidden = true; OEOnboard.forgetCoaches(); g.startTour(); }); // (and the first flight's coach again)
  // the map's overture again, from wherever you are: it ends where it always does (overture.js)
  g.on(g.$('#gm-overture'), 'click', () => { g.$('#g-menu').hidden = true; if (g.overture && !g.overture.active && g.player.mode === 'foot') g.overture.play(null); });
  g.on(g.$('#gm-reset'), 'click', () => {
    try { localStorage.removeItem(g.KEY); } catch (e) { /* ignore */ }
    if (g.life) g.life.reset();
    if ((g.player.mode === 'car' || g.player.mode === 'ride') && !g.stepOut(g.player.vehicle, g.player.mode === 'car' ? 'driver' : g.rideSeat(g.player.vehicle))) { g.player.vehicle.C.body.remove(g.player.rig.root); g.world.add(g.player.rig.root); g.player.rig.root.scale.setScalar(1); g.player.mode = 'foot'; g.player.vehicle = null; }
    if (g.ride) g.rideAway();
    g.goals.reset(); g.renderPassport(); g.spawn(); g.H.toast('A fresh start: a new passport.'); g.$('#g-menu').hidden = true;
  });
  return { DISTRICT_AIR, bodyOf, deckOf, deckStand, districtEdge, drawBig, inFrame, lookOf, mapZ, moreTray, ownPress, region, screenOf, seenNow, standFor, titleEl, titleLead, titleScreen, travelGroups, travelTo, whoAsk, whoBack, whoDone, whoGate, whoNeeded, whoPick, whoSync, zoomMap };
};
