// Open Earth 3D streets: where the street furniture may stand, and which of it is solid.
//
// The game draws each mapped road as a band of its class's width (game.js streetTexture), its
// traffic keeps to lanes inside the band, and a car pulls in with its kerb-side wheels on the
// band's edge (cars.js kerbOf). OpenStreetMap maps many street lamps as nodes of the road's
// own line, trees in kerb build-outs and between a dual carriageway's two lines (which the
// game draws over each other), and night.js stands its street lights a fixed distance off each
// road, which at a junction, or beside a road running close to another, is inside the other.
// So, as a city's games do with the props they place by hand:
//  - carriageways(lines): the bands, grown to the outer side of a car parked at the kerb, in a
//    grid; depth() is how far a circle reaches into one at its own level (a viaduct overhead
//    is not in the way), kerbside() the nearest place clear of all of them, or null where none
//    is near (in the middle of a junction, between two bands drawn over each other);
//  - tidy(D): a city's mapped lamps, benches and trees moved out of them, or left out, once
//    for the viewer and the game alike (world.js), before anything is drawn;
//  - posts(): lamp posts and tree trunks as circles in a grid, which the walkers, your car and
//    the traffic treat as solid.
// Like vehicles.js and cars.js, nothing here depends on the three.js version.
'use strict';
window.OEStreets = (function () {
  // road widths by class (m), as game.js draws the streets and cars.js pulls in to the kerb
  const ROADW = { motorway: 14, trunk: 12, primary: 12, secondary: 10, tertiary: 9, residential: 7, unclassified: 6, living_street: 5 };
  const LEVEL = 3;  // a road and a thing this far apart in height are on different levels (a deck over a street)
  const CAR_HW = 1.0; // the half width of the widest car that parks (the SUV, with its mirrors)
  // where a car parked at the kerb has its centre (cars.js kerbOf), and the band furniture keeps out of
  const kerb = c => Math.min(6.5, Math.max(3.3, (ROADW[c] || 7) / 2 - 0.1));
  const setback = c => Math.max((ROADW[c] || 7) / 2, kerb(c) + CAR_HW);
  // a road piece's carriageway, kerb to kerb (m): the surveyed width where the map has one (game.json cw:
  // pipeline/road_width.py, docs/ROADS.md), else its class's. One function for whoever draws, drives or stands by a road.
  const widthOf = l => (l && l.cw) || ROADW[l && l.c] || 7;
  // room for two lanes each way on a piece whose class gives it one: a surveyed carriageway of 13.6 m two-way (the outer
  // lane's middle 4.7 m off the line, a car and a gutter past it) or 9.6 m one-way, unless the map's own count says one
  // (pipeline/road_ground.py lanes_each_way; junctions.js drives it, game.js paints it). l: a piece of game.json or a line of the net
  const roomForTwo = l => !!l && l.cw >= ((l.o || l.ow) ? 9.6 : 13.6) && l.nl !== 1;
  const hash = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };

  // lines: [{ c: class, p: [x, y, z, ...] in metres, cw: the carriageway's width where it is not its class's (m) }]
  function carriageways(lines) {
    const S = [], grid = new Map(), GC = 16, key = (cx, cy) => cx * 131071 + cy;
    for (const l of lines) {
      // (a lane narrower than its class, "cw" in game.json: one along a channel's bank, with no parking at its kerb)
      const p = l.p, cw = l.cw ? l.cw / 2 : (ROADW[l.c] || 7) / 2, hw = l.cw ? cw + 0.3 : setback(l.c);
      for (let k = 3; k + 2 < p.length; k += 3) {
        const ax = p[k - 3], ay = p[k - 2], bx = p[k], by = p[k + 1];
        if (ax === bx && ay === by) continue;
        const i = S.push({ ax, ay, az: p[k - 1], bx, by, bz: p[k + 2], hw, cw, c: l.c }) - 1;
        for (let cx = Math.floor((Math.min(ax, bx) - hw) / GC); cx <= Math.floor((Math.max(ax, bx) + hw) / GC); cx++)
          for (let cy = Math.floor((Math.min(ay, by) - hw) / GC); cy <= Math.floor((Math.max(ay, by) + hw) / GC); cy++) {
            const kk = key(cx, cy), g = grid.get(kk);
            if (g) g.push(i); else grid.set(kk, [i]);
          }
      }
    }
    const out = { deep: 0, nx: 0, ny: 0, d: 0, seg: null };
    // the band a circle (radius r, at height z) reaches deepest into: out.deep (<= 0: clear of every
    // band), and the way out of it, (nx, ny), from the band's line
    // (lanes: the carriageway itself, kerb to kerb, not the band kept clear for the cars parked at it)
    function deepest(x, y, z, r, lanes = false) {
      out.deep = -Infinity; out.seg = null;
      for (const i of grid.get(key(Math.floor(x / GC), Math.floor(y / GC))) || []) {
        const s = S[i], ex = s.bx - s.ax, ey = s.by - s.ay, L2 = ex * ex + ey * ey;
        const t = Math.max(0, Math.min(1, ((x - s.ax) * ex + (y - s.ay) * ey) / L2));
        if (z != null && Math.abs(s.az + (s.bz - s.az) * t - z) >= LEVEL) continue;
        const qx = s.ax + ex * t, qy = s.ay + ey * t, d = Math.hypot(x - qx, y - qy), deep = (lanes ? s.cw : s.hw) + r - d;
        if (deep <= out.deep) continue;
        out.deep = deep; out.seg = s; out.d = d;
        if (d > 1e-3) { out.nx = (x - qx) / d; out.ny = (y - qy) / d; }
        else { const L = Math.sqrt(L2), side = hash(x, y) < 0.5 ? 1 : -1; out.nx = -ey / L * side; out.ny = ex / L * side; } // on the line: either kerb
      }
      if (!out.seg) out.deep = -Infinity;
      return out;
    }
    return {
      segments: S,
      // how far a circle of radius r at (x, y), at height z (null: any), reaches into a band; <= 0 when clear
      depth(x, y, z, r = 0) { return deepest(x, y, z, r).deep; },
      // the nearest place within reach of (x, y) where a circle of radius r is clear of every band
      // at its level: [x, y], or null
      // (lanes: clear of the carriageways only, as a signal post at a junction's corner, where no car parks)
      kerbside(x, y, z, r = 0, reach = 6, lanes = false) {
        let px = x, py = y;
        for (let it = 0; it < 8; it++) {
          const q = deepest(px, py, z, r, lanes);
          if (q.deep <= 0) return Math.hypot(px - x, py - y) <= reach ? [px, py] : null;
          px += q.nx * (q.deep + 0.06); py += q.ny * (q.deep + 0.06); // (past the edge by more than a decimetre rounds)
        }
        // (pushed out of one band into another and back, where roads meet at a sharp angle: the
        // nearest clear spot on rings round it, half a metre apart, instead)
        for (let d = 0.5; d <= reach; d += 0.5) {
          const n = Math.max(12, Math.ceil(2 * Math.PI * d / 0.5));
          let best = null, bd = Infinity;
          for (let i = 0; i < n; i++) {
            const t = (i / n) * 2 * Math.PI, qx = x + Math.sin(t) * d, qy = y + Math.cos(t) * d;
            const e = deepest(qx, qy, z, r, lanes).deep;
            if (e <= 0 && e < bd) { bd = e; best = [qx, qy]; } // (of the clear ones on the ring, the one furthest from any band)
          }
          if (best) return best;
        }
        return null;
      },
    };
  }

  // the road lines of a city: the game's (game.json, decimetres), else night.json's (the viewer)
  function roadLines(D) {
    // (with a district's roads past its edge, paths.far, pipeline/district.py: drawn and kept clear, never driven)
    if (D.G && D.G.paths) return D.G.paths.road.concat((D.G.paths.far || {}).road || []).map(r => ({ c: r.c, p: r.p.map(v => v / 10), cw: r.cw }));
    const N = D.N;
    if (!N || !N.roads) return [];
    const unpack = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Int16Array(u.buffer); };
    const R = unpack(N.roads), P = unpack(N.pts), [XY, ZU] = N.units, out = [];
    for (let i = 0, k = 0; i < R.length; i += 3) {
      const n = R[i + 2], p = [];
      for (let j = 0; j < n; j++, k += 3) p.push(P[k] * XY, P[k + 1] * XY, P[k + 2] * ZU);
      out.push({ c: N.classes[R[i]], p });
    }
    return out;
  }

  // Move a city's mapped street furniture out of the carriageways, once (world.js, before anything
  // is drawn): the lamps (game.json props, or night.json's in the viewer), the benches and the
  // trees (places.json), each to the nearest place clear of every band, or left out where there
  // is none within a few metres. D.streets: { roads (carriageways), lamps: [x, y, z, ...] in
  // metres (for night.js), moved, dropped }.
  function tidy(D) {
    if (D.streets) return D.streets;
    const lines = roadLines(D), st = D.streets = { roads: null, lamps: null, moved: {}, dropped: {} };
    if (!lines.length) return st;
    const cw = st.roads = carriageways(lines);
    // flat lists of `stride` numbers per item, x and y first then z, in units of `u` metres
    // (nor does a lamp or a bench of the map stand where a landmark says nothing of the street's does, inside a hall it
    // draws: landmarks.json "bare", rings in decimetres, as "treeless" is for the trees in world.js)
    const bare = ((D.LM && D.LM.bare) || []).map(r => r.map(v => v / 10));
    const under = (x, y) => bare.some(r => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if ((r[i + 1] > y) !== (r[j + 1] > y) && x < (r[j] - r[i]) * (y - r[i + 1]) / (r[j + 1] - r[i + 1]) + r[i]) c = !c; return c; });
    const fix = (name, flat, stride, u, r, zu = u) => {
      const keep = [];
      let moved = 0, dropped = 0;
      for (let i = 0; i + stride - 1 < flat.length; i += stride) {
        const x = flat[i] * u, y = flat[i + 1] * u, z = flat[i + 2] * zu, q = name !== 'trees' && under(x, y) ? null : cw.kerbside(x, y, z, r);
        if (!q) { dropped++; continue; }
        const item = Array.prototype.slice.call(flat, i, i + stride);
        if (q[0] !== x || q[1] !== y) { item[0] = Math.round(q[0] / u); item[1] = Math.round(q[1] / u); moved++; }
        keep.push(...item);
      }
      st.moved[name] = moved; st.dropped[name] = dropped;
      return keep;
    };
    if (D.P && D.P.trees) D.P.trees = fix('trees', D.P.trees, 4, 0.1, 0.7);
    const props = D.G && D.G.props;
    if (props) {
      if (props.street_lamp) props.street_lamp = fix('lamps', props.street_lamp, 3, 0.1, 0.25);
      if (props.bench) props.bench = fix('benches', props.bench, 3, 0.1, 0.95);
      st.lamps = (props.street_lamp || []).map(v => v / 10);
    } else if (D.N && D.N.lamps) {
      const s = atob(D.N.lamps), u8 = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
      const [XY, ZU] = D.N.units, L = fix('lamps', new Int16Array(u8.buffer), 3, XY, 0.25, ZU);
      st.lamps = L.map((v, i) => v * (i % 3 === 2 ? ZU : XY));
    }
    return st;
  }

  // ------------------------------------------------------------ posts: lamp posts and trunks, solid
  // add(x, y, z, r, kind) each, then near(x, y, r, fn) calls fn(post) for each post whose circle
  // comes within r of (x, y) ({ x, y, z, r, kind }), and pushOut moves a circle out of them
  function posts() {
    const list = [], grid = new Map(), GC = 8, key = (cx, cy) => cx * 131071 + cy;
    let big = 0;
    const api = {
      list,
      add(x, y, z, r, kind) {
        const p = { x, y, z, r, kind }, k = key(Math.floor(x / GC), Math.floor(y / GC)), g = grid.get(k);
        list.push(p);
        if (g) g.push(p); else grid.set(k, [p]);
        if (r > big) big = r;
        return p;
      },
      // a post moved to (x, y, z) (someone who stands elsewhere at another hour)
      move(p, x, y, z) {
        const g = grid.get(key(Math.floor(p.x / GC), Math.floor(p.y / GC))), i = g ? g.indexOf(p) : -1;
        if (i >= 0) g.splice(i, 1);
        p.x = x; p.y = y; p.z = z;
        const k = key(Math.floor(x / GC), Math.floor(y / GC)), h = grid.get(k);
        if (h) h.push(p); else grid.set(k, [p]);
        return p;
      },
      // a post taken away (one of a story's people, gone with their frame)
      remove(p) {
        const g = grid.get(key(Math.floor(p.x / GC), Math.floor(p.y / GC))), i = g ? g.indexOf(p) : -1, j = list.indexOf(p);
        if (i >= 0) g.splice(i, 1);
        if (j >= 0) list.splice(j, 1);
      },
      near(x, y, r, fn, z = null) {
        const R = r + big;
        for (let cx = Math.floor((x - R) / GC); cx <= Math.floor((x + R) / GC); cx++) for (let cy = Math.floor((y - R) / GC); cy <= Math.floor((y + R) / GC); cy++) {
          const g = grid.get(key(cx, cy));
          if (g) for (const p of g) if (Math.abs(p.x - x) < r + p.r && Math.abs(p.y - y) < r + p.r && (z == null || Math.abs(p.z - z) < 2.5)) fn(p);
        }
      },
      // a circle of radius r with its foot at z, out of every post it overlaps: { x, y, hit }
      pushOut(x, y, r, z = null) {
        let hit = null;
        for (let it = 0; it < 2; it++) {
          let moved = false;
          api.near(x, y, r, p => {
            const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy), m = p.r + r - d;
            if (m <= 0) return;
            if (d > 1e-6) { x += dx / d * m; y += dy / d * m; } else x += m;
            hit = p; moved = true;
          }, z);
          if (!moved) break;
        }
        return { x, y, hit };
      },
    };
    return api;
  }


  // A zebra crossing's bars, filtered to the pixel (the owner's still of the Scramble, November 2026: its bars bent
  // into steps and broke into moiré across the junction). A bar is 45 cm wide with 45 cm between (道路標示 横断歩道),
  // a pattern of 0.9 m, and from a few tens of metres a pixel on the road covers more than that across the bars: drawn
  // as edges of geometry or as a picture of half a metre a texel, its stripes fall between the samples and come out
  // as whatever the samples happen to meet, which no multisampling or upscaler can take back. So the bars are drawn
  // as the share of each pixel they cover: oeZebra() is the bars' square wave box-filtered over the pixel's footprint
  // across them (exactly: the wave's integral at the footprint's two sides), which is the bar or the asphalt where a
  // pixel is small beside them and their mean where it is not, as a mipmapped picture of them would be.
  //   a: metres across the bars from a bar's middle (any bar's: the pattern repeats), w: the pixel's width in a
  const ZEBRA = { bar: 0.45, gap: 0.45 };
  const ZEBRA_GLSL = `
float oeZebraI(float x) { return floor(x / 0.9) * 0.45 + min(mod(x, 0.9), 0.45); }
float oeZebra(float a, float w) {
  w = max(w, 1e-4);
  float x = a + 0.225 - 0.5 * w;
  return clamp((oeZebraI(x + w) - oeZebraI(x)) / w, 0.0, 1.0);
}`;
  // A model's bars as the bands they repeat in (a hero level's paint: one ribbon 45 cm wide a bar, cut where its model
  // is cut into squares). Each bar found among the meshes' pieces (a piece 45 cm across whose like lies 0.9 m, or a
  // whole number of times that, beside it, parallel) is widened to the 0.9 m cell it repeats in, so that the cells of a
  // crossing tile its band, and given `_zebra` (a: metres across from its bar's middle, on: 1); every other piece of
  // paint keeps its shape and on 0. The material then shows oeZebra(a, fwidth(a)) of its paint (its alpha, over the
  // asphalt), and its bars no longer fall between the pixels. list: meshes, their matrixWorld current. Returns the bars.
  function zebraCells(list) {
    const THREE = window.THREE, B = ZEBRA.bar, P = ZEBRA.bar + ZEBRA.gap, parts = [];
    const v = new THREE.Vector3();
    for (const o of list) {
      const g = o.geometry, pa = g.attributes.position, n = pa.count, idx = g.index ? g.index.array : null;
      const at = new Float32Array(n * 2);
      g.setAttribute('_zebra', new THREE.BufferAttribute(at, 2));
      if (!idx || !pa.array) continue;
      const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n);
      for (let i = 0; i < n; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); X[i] = v.x; Y[i] = v.y; Z[i] = v.z; }
      const up = new Int32Array(n).map((_, i) => i), find = i => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
      for (let t = 0; t < idx.length; t += 3) { const a = find(idx[t]); for (let j = 1; j < 3; j++) { const b = find(idx[t + j]); if (a !== b) up[b] = a; } }
      const comp = new Map();
      for (let t = 0; t < idx.length; t++) { const r = find(idx[t]); let c = comp.get(r); if (!c) comp.set(r, c = new Set()); c.add(idx[t]); }
      for (const vs of comp.values()) {
        const ids = [...vs];
        let mx = 0, mz = 0;
        for (const i of ids) { mx += X[i]; mz += Z[i]; }
        mx /= ids.length; mz /= ids.length;
        let sxx = 0, szz = 0, sxz = 0;
        for (const i of ids) { const dx = X[i] - mx, dz = Z[i] - mz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
        const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), dx = Math.cos(th), dz = Math.sin(th); // (its long axis)
        parts.push({ o, ids, X, Y, Z, at, mx, mz, d: [dx, dz], bar: null });
      }
    }
    // a piece's extent across a direction (nx, nz): [lo, hi]
    const span = (q, nx, nz) => { let lo = Infinity, hi = -Infinity; for (const i of q.ids) { const s = q.X[i] * nx + q.Z[i] * nz; if (s < lo) lo = s; if (s > hi) hi = s; } return [lo, hi]; };
    const along = (q, dx, dz) => span(q, dx, dz);
    // first the pieces that are plainly bars: 45 cm across their long axis, longer than that along it
    const cand = [];
    for (const q of parts) {
      const [nx, nz] = [-q.d[1], q.d[0]], s = span(q, nx, nz), l = along(q, q.d[0], q.d[1]);
      if (Math.abs(s[1] - s[0] - B) < 0.03 && l[1] - l[0] > 0.8) { q.n = [nx, nz]; q.mid = (s[0] + s[1]) / 2; cand.push(q); }
    }
    const kin = (q, r) => { // r lies a whole number of 0.9 m (1 to 3) from q across q's bars, parallel, within a crossing's reach
      if (Math.abs(q.n[0] * r.n[1] - q.n[1] * r.n[0]) > 0.02 || Math.hypot(q.mx - r.mx, q.mz - r.mz) > 30) return false;
      const off = Math.abs((r.mx - q.mx) * q.n[0] + (r.mz - q.mz) * q.n[1]), k = Math.round(off / P);
      return k >= 1 && k <= 3 && Math.abs(off - k * P) < 0.05;
    };
    const bars = cand.filter(q => cand.some(r => r !== q && kin(q, r)));
    for (const q of bars) q.bar = q.n;
    // then a bar's short ends, cut off by a square's edge, whose own axis says nothing: 45 cm across a bar's direction near it, in its rhythm
    for (const q of parts) {
      if (q.bar) continue;
      for (const r of bars) {
        if (Math.hypot(q.mx - r.mx, q.mz - r.mz) > 12) continue;
        const s = span(q, r.n[0], r.n[1]);
        if (Math.abs(s[1] - s[0] - B) > 0.03) continue;
        const off = Math.abs((s[0] + s[1]) / 2 - r.mid), k = Math.round(off / P);
        if (k <= 3 && Math.abs(off - k * P) < 0.05) { q.bar = r.n; q.mid = (s[0] + s[1]) / 2; break; }
      }
    }
    let count = 0;
    const inv = new THREE.Matrix4(), touched = new Set();
    for (const q of parts) {
      if (!q.bar) continue;
      count++;
      const [nx, nz] = q.bar, pa = q.o.geometry.attributes.position;
      inv.copy(q.o.matrixWorld).invert();
      for (const i of q.ids) {
        const sg = q.X[i] * nx + q.Z[i] * nz - q.mid >= 0 ? 1 : -1;
        v.set(q.X[i] + nx * sg * (P - B) / 2, q.Y[i], q.Z[i] + nz * sg * (P - B) / 2).applyMatrix4(inv);
        pa.setXYZ(i, v.x, v.y, v.z);
        q.at[2 * i] = sg * P / 2; q.at[2 * i + 1] = 1;
      }
      touched.add(q.o.geometry);
    }
    for (const g of touched) { g.attributes.position.needsUpdate = true; g.computeBoundingBox(); g.computeBoundingSphere(); }
    return count;
  }
  // a material whose `_zebra` pieces are bars (above): their paint's alpha is the share of the pixel the bars cover
  function zebraMaterial(m) {
    if (m.userData.oeZebra) return;
    m.userData.oeZebra = true;
    m.transparent = true; // (over the asphalt, which is drawn first: the ground is opaque)
    m.userData.oeDecal = true; // (paint on the ground for all that: the rain wets it, weather.js dress)
    const own = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      if (own) own.call(m, sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 _zebra;\nvarying vec2 vZebra;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vZebra = _zebra;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vZebra;\n${ZEBRA_GLSL}`)
        .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n  { float oeZw = fwidth(vZebra.x); if (vZebra.y > 0.5) diffuseColor.a *= oeZebra(vZebra.x, oeZw); }');
    };
    const key = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : null;
    m.customProgramCacheKey = () => `${key ? key() : ''}|zebra`;
    m.needsUpdate = true;
  }

  return { ROADW, widthOf, ZEBRA, ZEBRA_GLSL, zebraCells, zebraMaterial, roomForTwo, LEVEL, kerb, setback, carriageways, roadLines, tidy, posts };
})();
