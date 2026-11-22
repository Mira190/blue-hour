// The edge of the planned area (docs/BOUNDS.md): where a walker, a car and the helicopter are kept inside the made
// world, softly and in the place's own terms, never by a wall that stops them dead or a teleport they see.
//
// The ground's edge and the air's are convex polygons in the map's local metres (cities/shibuya/city.json
// game.bounds, worked out from the story's and the walk's places by pipeline/bounds.py). What this part does:
//   - on foot: inside the last metres before the edge, the part of a step that goes out is taken away (the walker goes
//     along the edge, never into it); kept pressed out against it, the camera eases round to face back in, and the
//     walker walks back in on the same key;
//   - by car: braked to a stop short of the road works at a comfortable rate, the throttle outward let go; it turns
//     and drives away of itself, as at any closed road;
//   - in the helicopter: turned back in a banked arc towards the Scramble, over the band inside the air's edge, the
//     tower's line on the radio; and held under a ceiling (Haneda's approach), eased down;
//   - the streets that cross the ground's edge are shut to cars (the traffic keeps off them, as off a street shut at
//     an hour: junctions.js shutNow), and road works stand across each: cones with their bars, two barricades with
//     their amber lamps, and the sign;
//   - and nothing offers a place outside it: inside(x, y) for the rides, the autopilot, the map's places.
//
// opts: { data: game.bounds, toast(html), floor(x, y, z) -> z of the floor there or null, reg: the helicopter's
//         registration, clock() -> seconds }
'use strict';
window.OEBounds = (function () {
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

  // a convex counter-clockwise polygon, its edges with their outward normals, and the signed distance to it (negative
  // inside), with the outward normal a soft max of the edges' (no jump at a corner)
  function shape(poly) {
    const E = [];
    let cx = 0, cy = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      E.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], tx: dx / l, ty: dy / l, nx: dy / l, ny: -dx / l, len: l });
      cx += a[0]; cy += a[1];
    }
    cx /= poly.length; cy /= poly.length;
    const out = { s: 0, nx: 0, ny: 0, e: null };
    function sd(x, y) {
      let best = -Infinity, be = null;
      for (const e of E) { const s = (x - e.ax) * e.nx + (y - e.ay) * e.ny; if (s > best) { best = s; be = e; } }
      let wx = 0, wy = 0;
      for (const e of E) { const s = (x - e.ax) * e.nx + (y - e.ay) * e.ny, w = Math.exp((s - best) / 6); wx += e.nx * w; wy += e.ny * w; }
      const l = Math.hypot(wx, wy) || 1;
      out.s = best; out.nx = wx / l; out.ny = wy / l; out.e = be;
      return out;
    }
    return { poly, E, cx, cy, sd };
  }

  function create(opts) {
    const D = opts.data;
    if (!D || !D.ground || !D.air) return null;
    const G = shape(D.ground.poly), Air = shape(D.air.poly), L = D.lines || {};
    const WS = 10; // (m: a walker is eased over the last ten metres, the car by its stopping distance)
    const GS = D.ground.soft || 22, AS = D.air.soft || 220, CEIL = D.air.ceiling || 420;
    const now = () => (opts.clock ? opts.clock() : performance.now() / 1000);
    const said = {};
    const say = (kind, gap = 25) => {
      const t = now();
      if (t - (said[kind] ?? -1e9) < gap || !L[kind]) return;
      said[kind] = t;
      opts.toast(String(L[kind]).replace('{reg}', opts.reg || 'Helicopter'));
    };
    const api = { ground: G, air: Air, ceiling: CEIL, stats: { eased: 0, turned: 0, braked: 0, flown: 0, held: 0 } };
    api.sd = (x, y, kind = 'ground') => { const r = (kind === 'air' ? Air : G).sd(x, y); return { s: r.s, nx: r.nx, ny: r.ny }; };
    api.inside = (x, y, kind = 'ground', m = 0) => (kind === 'air' ? Air : G).sd(x, y).s < -m;
    // a list of places, those inside the ground's edge (a margin in, so the arrival is not at the barriers)
    api.keep = (list, at = d => d.at, m = 25) => list.filter(d => { const p = at(d); return !p || api.inside(p[0], p[1], 'ground', m); });

    // ---------------------------------------------------------------- on foot
    let press = 0, turn = null, histT = -1e9, wt = 0;
    const hist = []; // (where the walker was, the last ten seconds: the way back in is the way they came)
    // fwd and side are the stick or the keys (the walk's way is cam.yaw + atan2(side, fwd), game.js walkStep)
    api.walk = (dt, p, cam, fwd, side) => {
      wt += dt; // (its own time: the walk's turn does not wait on the world's clock)
      const m = Math.min(1, Math.hypot(fwd, side));
      const r = G.sd(p.x, p.y);
      if (!turn && wt - histT > 0.25) { histT = wt; hist.push([p.x, p.y, r.s]); if (hist.length > 40) hist.shift(); }
      if (r.s < -WS - 2) { press = Math.max(0, press - dt); turn = null; return null; }
      if (m < 0.05) { press = Math.max(0, press - dt * 2); turn = null; return r.s > 0.2 ? api.walkBack(p, cam) : null; }
      const a = cam.yaw + Math.atan2(side, fwd);
      let dx = Math.sin(a) * m, dy = Math.cos(a) * m;
      const dn = dx * r.nx + dy * r.ny, f = smooth(-WS, -2.5, r.s);
      if (dn > 0) { dx -= r.nx * dn * f; dy -= r.ny * dn * f; api.stats.eased++; }
      if (r.s > 0) { const k = Math.min(1, r.s / 2) * m; dx -= r.nx * k; dy -= r.ny * k; } // (past it: back in)
      // pressed out against it: said, and after a second the walker is turned round, eased over most of a second, to the
      // way they came (known open: straight in may be a wall), on the same key; the camera comes round behind them
      const rel = Math.atan2(side, fwd);
      if (turn && (r.s < -WS - 1 || wt - turn.t0 > 7 || Math.abs(angDiff(rel, turn.rel)) > 1)) turn = null;
      const h4 = hist.length > 4 ? hist[hist.length - 5] : null, stuck = !!h4 && Math.hypot(h4[0] - p.x, h4[1] - p.y) < 0.8; // (held still a second: in a corner of the edge and a wall)
      if (!turn && (dn > 0.55 * m || stuck) && r.s > -WS * 0.6) {
        press += dt;
        say('foot');
        if (press > 1.1) {
          // (the trail back: the places they walked through, followed one after another, the nearest first)
          turn = { a: Math.atan2(-r.nx, -r.ny), rel, t0: wt, k: 0, i: hist.length - 1 };
          trail(p);
          cam.yawTo = turn.a; press = 0;
          api.stats.turned++;
        }
      } else if (!turn) press = Math.max(0, press - dt);
      if (turn) {
        trail(p);
        turn.k = Math.min(1, turn.k + dt / 0.8);
        const k = turn.k * turn.k * (3 - 2 * turn.k), ex = Math.sin(turn.a) * m, ey = Math.cos(turn.a) * m;
        dx = dx * (1 - k) + ex * k; dy = dy * (1 - k) + ey * k;
        const l0 = Math.hypot(dx, dy); if (l0 > 1e-4 && l0 < 0.5 * m) { dx *= 0.5 * m / l0; dy *= 0.5 * m / l0; } // (round, not through a stand)
      }
      const l = Math.hypot(dx, dy);
      if (l < 1e-4) return { fwd: 0, side: 0 };
      const b = Math.atan2(dx, dy) - cam.yaw;
      return { fwd: Math.cos(b) * l, side: Math.sin(b) * l };
    };
    function trail(p) { // aim at the next place of the trail at least 2.5 m off, and further in than where they stand
      while (turn.i > 0 && Math.hypot(hist[turn.i][0] - p.x, hist[turn.i][1] - p.y) < 2.5) turn.i--;
      const q = hist[turn.i];
      if (q && Math.hypot(q[0] - p.x, q[1] - p.y) >= 2.5) turn.a = Math.atan2(q[0] - p.x, q[1] - p.y);
    }
    // after the step: a walker the step took past the line (the turn of the body lags the key) is set back on it, a
    // few centimetres a frame, where the ground there lets them stand (ok(x, y) -> may stand there)
    api.walkHold = (p, dt, ok) => {
      const r = G.sd(p.x, p.y), over = r.s + 0.4;
      if (over <= 0) return;
      const k = Math.min(over, Math.max(0.05, over * dt * 6)), x = p.x - r.nx * k, y = p.y - r.ny * k;
      if (!ok || ok(x, y)) { p.x = x; p.y = y; api.stats.held++; }
    };
    // standing past the edge with no key held (set down there by something else): a step back in
    api.walkBack = (p, cam) => {
      const r = G.sd(p.x, p.y), a = Math.atan2(-r.nx, -r.ny) - cam.yaw, k = Math.min(0.6, r.s / 3);
      return { fwd: Math.cos(a) * k, side: Math.sin(a) * k };
    };

    // ---------------------------------------------------------------- by car
    // st: the car's state (cars.js: x, y, h, vx, vy, v, reverse), half: half its length; returns the pedals to use
    api.drive = (st, fwd, side, half = 2.3) => {
      const r = G.sd(st.x, st.y), lim = -(half + 1.4), gap = lim - r.s;
      if (gap > 60) return null;
      const vo = st.vx * r.nx + st.vy * r.ny, ho = Math.sin(st.h) * r.nx + Math.cos(st.h) * r.ny;
      const outPower = (!st.reverse && fwd > 0 && ho > 0.1) || (st.reverse && fwd < 0 && ho < -0.1);
      if (outPower && gap < 12) { fwd *= Math.max(0, Math.min(1, (gap - 0.5) / 11.5)); }
      if (vo > 0.6) {
        const need = vo * vo / (2 * Math.max(0.25, gap)); // (m/s² to stop at the line)
        if (need > 3.2) {
          const b = Math.min(1, need / 10);
          fwd = st.reverse ? Math.max(fwd, b) : Math.min(fwd, -b);
          api.stats.braked++;
          say('car');
        }
      } else if (outPower && gap < 1.5) say('car');
      return { fwd, side };
    };
    // after the step: a car past the stop line (a slide, a shove) is eased back and its way out taken off
    api.driveHold = (st, dt, half = 2.3) => {
      const r = G.sd(st.x, st.y), over = r.s + half + 0.4;
      if (over <= 0) return;
      const vo = st.vx * r.nx + st.vy * r.ny;
      if (vo > 0) { st.vx -= r.nx * vo; st.vy -= r.ny * vo; }
      const k = over * Math.min(1, dt * 3);
      st.x -= r.nx * k; st.y -= r.ny * k; api.stats.held++;
    };

    // ---------------------------------------------------------------- in the air
    let turning = 0, auth = 0;
    // st: the helicopter's state (vehicles.js: x, y, z, h, vx, vy, landed), inp: { fwd, turn, lift }; returns the inputs
    api.fly = (dt, st, inp, groundZ = 0) => {
      const r = Air.sd(st.x, st.y), out = Object.assign({}, inp);
      if (st.landed) { turning = 0; auth = 0; return out; }
      const toC = Math.atan2(Air.cx - st.x, Air.cy - st.y), err = angDiff(toC, st.h);
      const ho = Math.sin(st.h) * r.nx + Math.cos(st.h) * r.ny, vo = st.vx * r.nx + st.vy * r.ny;
      const w = smooth(-AS, -AS * 0.25, r.s);
      if (!turning && w > 0.02 && (ho > 0.15 || vo > 2)) { turning = 1; say('air'); api.stats.flown++; }
      if (turning && (Math.abs(err) < 0.35 || r.s < -AS * 1.15)) turning = 0;
      auth += ((turning ? Math.max(0.55, w) + 0.45 * smooth(-AS * 0.4, 0, r.s) : 0) - auth) * Math.min(1, dt * 1.6);
      if (auth > 0.01) {
        const a = Math.min(1, auth);
        out.turn = inp.turn * (1 - a) + Math.max(-1, Math.min(1, err * 1.6)) * a;
        out.fwd = inp.fwd * (1 - a) + (Math.abs(err) > 1.2 ? 0.35 : 0.7) * a; // (a banked arc, not a stop and spin)
      }
      // the last resort, past the edge itself: the way out taken off the flight
      if (r.s > 0 && vo > 0) { const k = Math.min(1, r.s / 80); st.vx -= r.nx * vo * k * Math.min(1, dt * 3); st.vy -= r.ny * vo * k * Math.min(1, dt * 3); }
      // the ceiling: eased down over the last thirty metres, then down
      const over = st.z - (CEIL - 30);
      if (over > 0) { out.lift = Math.min(out.lift, -Math.min(1, over / 30)); if (st.z > CEIL - 5) say('ceiling', 30); }
      return out;
    };
    api.turning = () => !!turning;
    api.state = () => ({ press, turn: turn && { a: turn.a, k: turn.k }, hist: hist.length });

    // ---------------------------------------------------------------- the streets across the edge
    // where each street crosses the ground's edge: [{ x, y, z, e (the edge), w (m across, along the edge), foot }]
    function crossings(paths) {
      const W = { motorway: 16, trunk: 16, primary: 15, secondary: 13, tertiary: 11, unclassified: 8, residential: 7, living_street: 6, service: 5 };
      const out = [];
      const add = (lst, foot) => {
        for (const r of lst || []) {
          const p = r.p;
          for (let i = 0; i + 5 < p.length; i += 3) {
            const x1 = p[i] / 10, y1 = p[i + 1] / 10, x2 = p[i + 3] / 10, y2 = p[i + 4] / 10;
            for (const e of G.E) {
              const s1 = (x1 - e.ax) * e.nx + (y1 - e.ay) * e.ny, s2 = (x2 - e.ax) * e.nx + (y2 - e.ay) * e.ny;
              if ((s1 > 0) === (s2 > 0)) continue;
              const t = s1 / (s1 - s2), x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, u = (x - e.ax) * e.tx + (y - e.ay) * e.ty;
              if (u < -1 || u > e.len + 1) continue;
              const z = (p[i + 2] + (p[i + 5] - p[i + 2]) * t) / 10, sx = x2 - x1, sy = y2 - y1, sl = Math.hypot(sx, sy) || 1;
              const cos = Math.abs((sx * e.nx + sy * e.ny) / sl);
              const w0 = foot ? (r.c === 'steps' ? 3 : 4) : (W[r.c] || 7) + (r.o ? -2 : 0);
              const rs = s2 > s1 ? 1 : -1; // (the street's way out, for a harness that drives it: tools/bounds_check.js)
              out.push({ x, y, z, e, w: Math.min(w0 * 2.2, w0 / Math.max(0.45, cos)), foot, c: r.c, rx: rs * sx / sl, ry: rs * sy / sl, cos });
            }
          }
        }
      };
      add(paths.road, false);
      add(paths.foot, true);
      // (one set of works a place: a footway beside a road it runs along is the road's)
      const keep = [];
      for (const c of out.sort((a, b) => (a.foot - b.foot) || b.w - a.w)) {
        const o = keep.find(k => k.e === c.e && Math.abs(k.z - c.z) < 3 && Math.abs((c.x - k.x) * k.e.tx + (c.y - k.y) * k.e.ty) < (k.w + c.w) / 2 + 1);
        if (o) { // (merged: the works widened to take both)
          const u0 = Math.min(-o.w / 2, (c.x - o.x) * o.e.tx + (c.y - o.y) * o.e.ty - c.w / 2), u1 = Math.max(o.w / 2, (c.x - o.x) * o.e.tx + (c.y - o.y) * o.e.ty + c.w / 2);
          const mid = (u0 + u1) / 2; o.x += o.e.tx * mid; o.y += o.e.ty * mid; o.w = u1 - u0; o.foot = o.foot && c.foot;
          continue;
        }
        keep.push(Object.assign({}, c));
      }
      return keep;
    }
    api.crossings = paths => crossings(paths);

    // shut the streets that cross the edge to cars, both ways, all day (the traffic and the rides keep off them)
    api.closeRoads = net => {
      if (!net || !net.L) return 0;
      const ALL = [[127, 0, 1441]];
      let n = 0;
      for (const l of net.L) {
        const P = l.pts;
        if (!P || P.length < 2) continue;
        let inS = null, cross = false;
        for (let i = 0; i + 1 < P.length; i += 3) { const s = G.sd(P[i], P[i + 1]).s > 0; if (inS === null) inS = s; else if (s !== inS) { cross = true; break; } }
        if (!cross) continue;
        l.tb = (l.tb || []).concat([[0, true, ALL]]);
        n++;
      }
      api.closed = n;
      return n;
    };

    // ---------------------------------------------------------------- the road works
    // drawn at each crossing, on the outer side of the edge, facing in: a line of cones with their striped bars, two
    // barricades with an amber lamp each (blinking at night), and the sign. All of it instanced: a few draws.
    api.build = (THREE, paths, root) => {
      const C = crossings(paths);
      api.works = C;
      if (!C.length) return null;
      const group = new THREE.Group();
      group.name = 'bounds-works';
      const V = (x, y, z) => new THREE.Vector3(x, z, -y);
      const cones = [], bars = [], rails = [], legs = [], lamps = [], signs = [];
      for (const c of C) {
        const z0 = opts.floor ? (opts.floor(c.x, c.y, c.z) ?? c.z) : c.z;
        const tx = c.e.tx, ty = c.e.ty, nx = c.e.nx, ny = c.e.ny;
        const yaw = Math.atan2(-nx, ny); // facing in (a model's +z turned by yaw faces (sin yaw, -cos yaw) on the map)
        const along = Math.atan2(ty, tx); // (and its +x along the edge)
        const n = Math.max(2, Math.round(c.w / 1.5)), step = c.w / n;
        for (let k = 0; k <= n; k++) {
          const u = -c.w / 2 + k * step, x = c.x + tx * u + nx * 0.6, y = c.y + ty * u + ny * 0.6;
          const z = opts.floor ? (opts.floor(x, y, z0) ?? z0) : z0;
          cones.push([x, y, z, yaw]);
          if (k < n) bars.push([x + tx * step / 2, y + ty * step / 2, z, along, step]);
        }
        if (!c.foot) for (const u of [-1.6, 1.6]) {
          const x = c.x + tx * u - nx * 0.9, y = c.y + ty * u - ny * 0.9, z = opts.floor ? (opts.floor(x, y, z0) ?? z0) : z0;
          rails.push([x, y, z, along]);
          legs.push([x, y, z, along]);
          lamps.push([x + tx * 0.5, y + ty * 0.5, z + 1.16, 0]);
        }
        { const u = c.foot ? 0 : 0, x = c.x + tx * u - nx * 2.2, y = c.y + ty * u - ny * 2.2, z = opts.floor ? (opts.floor(x, y, z0) ?? z0) : z0; signs.push([x, y, z, yaw]); }
      }
      // the pictures: the cone's red and its white band, the bar's yellow and black, the sign's face
      const tex = (w, h, draw) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding; return t; };
      const stripes = tex(128, 16, (g, w, h) => { g.fillStyle = '#e8b711'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a'; for (let x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.fill(); } });
      const coneT = tex(16, 64, (g, w, h) => { g.fillStyle = '#c8261c'; g.fillRect(0, 0, w, h); g.fillStyle = '#eceae4'; g.fillRect(0, h * 0.28, w, h * 0.16); g.fillRect(0, h * 0.56, w, h * 0.1); });
      const signT = tex(256, 384, (g, w, h) => {
        g.fillStyle = '#f4f3ee'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#1d4f9c'; g.fillRect(0, 0, w, h * 0.3); g.fillRect(8, h - 14, w - 16, 6);
        g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const S = L.sign || ['工事中', 'この先 通行止め', 'ROAD WORKS · CLOSED AHEAD'];
        g.font = 'bold 72px "Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif'; g.fillText(S[0], w / 2, h * 0.15);
        g.fillStyle = '#c41e1e'; g.font = 'bold 40px "Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif'; g.fillText(S[1], w / 2, h * 0.46);
        g.fillStyle = '#222'; g.font = 'bold 19px "Inter","Helvetica Neue",Arial,sans-serif'; g.fillText(S[2], w / 2, h * 0.62);
        g.strokeStyle = '#c41e1e'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, h * 0.8, 34, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(w / 2 - 24, h * 0.8 + 24); g.lineTo(w / 2 + 24, h * 0.8 - 24); g.stroke();
      });
      const M = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.6, metalness: 0 }, o));
      const inst = (geo, mat, list, place) => {
        if (!list.length) return null;
        const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
        list.forEach((q, i) => { o.position.copy(V(q[0], q[1], q[2])); o.rotation.set(0, q[3], 0); o.scale.set(1, 1, 1); if (place) place(o, q); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
        m.instanceMatrix.needsUpdate = true; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
        group.add(m); return m;
      };
      // a cone 0.7 m on a square foot, its bar at 0.55 m between two
      const coneG = new THREE.CylinderGeometry(0.035, 0.16, 0.68, 14, 1, true); coneG.translate(0, 0.38, 0);
      const footG = new THREE.BoxGeometry(0.38, 0.04, 0.38); footG.translate(0, 0.02, 0);
      inst(coneG, M({ map: coneT, roughness: 0.45, side: THREE.DoubleSide }), cones);
      inst(footG, M({ color: 0x1b1b1b, roughness: 0.85 }), cones);
      const barG = new THREE.CylinderGeometry(0.024, 0.024, 1, 8); barG.rotateZ(Math.PI / 2); barG.translate(0, 0.56, 0);
      const barM = M({ map: stripes, roughness: 0.5 });
      inst(barG, barM, bars, (o, q) => o.scale.set(q[4], 1, 1));
      // a barricade: the striped rail at a metre, a lower one, two legs
      const railG = new THREE.BoxGeometry(1.2, 0.2, 0.04); railG.translate(0, 0.98, 0);
      const rail2G = new THREE.BoxGeometry(1.2, 0.12, 0.04); rail2G.translate(0, 0.55, 0);
      inst(railG, M({ map: stripes, roughness: 0.5 }), rails);
      inst(rail2G, M({ map: stripes, roughness: 0.5 }), rails);
      const legG = new THREE.BoxGeometry(0.05, 1.08, 0.5);
      { const a = legG.clone(); a.translate(-0.56, 0.54, 0); const b = legG.clone(); b.translate(0.56, 0.54, 0); legs.geo = [a, b]; }
      for (const g of legs.geo) inst(g, M({ color: 0xd9d6cf, roughness: 0.55 }), legs);
      // the lamps: amber, lit, blinking at night by two groups out of step
      const lampG = new THREE.SphereGeometry(0.075, 12, 8);
      const lampA = M({ color: 0x3a2400, emissive: 0xffa21f, emissiveIntensity: 1.2, roughness: 0.3 });
      const lampB = lampA.clone();
      inst(lampG, lampA, lamps.filter((_, i) => i % 2 === 0));
      inst(lampG, lampB, lamps.filter((_, i) => i % 2 === 1));
      // the sign on its stand, facing in
      const signG = new THREE.PlaneGeometry(0.8, 1.2); signG.translate(0, 1.15, 0.02);
      const standG = new THREE.BoxGeometry(0.84, 1.28, 0.03); standG.translate(0, 1.15, 0);
      const postG = new THREE.BoxGeometry(0.04, 0.55, 0.45); postG.translate(0, 0.27, -0.12);
      inst(signG, M({ map: signT, roughness: 0.4 }), signs);
      inst(standG, M({ color: 0xcfcdc6, roughness: 0.6 }), signs);
      inst(postG, M({ color: 0x777777, roughness: 0.7 }), signs);
      root.add(group);
      api.group = group;
      api.tick = (t, night) => {
        const on = night ? 1 : 0.6, k = (Math.sin(t * Math.PI * 2 * 0.9) > 0 ? 1 : 0.08);
        lampA.emissiveIntensity = (night ? 1.5 : 0.7) * k * on; lampB.emissiveIntensity = (night ? 1.5 : 0.7) * (1.08 - k) * on; // (a lamp, not a flare: the bloom takes it further)
      };
      return group;
    };
    return api;
  }
  return { create, shape };
})();
