// The far skyline: the towers past the map's frame, and Tokyo Tower and the Skytree (pipeline/far_city.py,
// blender/build_far_towers.py; docs/LOOK.md, "The far skyline").
//
// The map's own buildings end at its frame; past it farland.js draws the land, flat. These stand on it:
//  - every roof face of PLATEAU's models within 14 km and tall enough for its distance (farcity.bin), as a low prism
//    under the far land's own air (OE_FAR in world.js), so Shinjuku, Roppongi, Toranomon and the bay's towers rise out
//    of the haze as they do from SHIBUYA SKY. Their faces are drawn from what a facade is at that distance: the storeys'
//    bands of glass and spandrel, settled to their mean once a storey is under a pixel; after dark the offices' lit
//    floors (the city's own evening, buildings.js occupancy: most floors lit at dusk, a few by midnight), cool white;
//  - Tokyo Tower and the Skytree as cards, the impostors a game draws a far landmark with: each tower drawn once, finely,
//    into a picture with its own coverage (assets/far), standing at its real place and turned about its axis to face the
//    camera. After dark they take their lighting: Tokyo Tower's Landmark Light, orange from October to early July and
//    white in summer; the Skytree's Iki (a pale indigo blue) one night and Miyabi (Edo purple) the next.
// The aircraft warning lights on the far towers' tops are night.js's (D.farTops), flashing with the map's own.
// On the low tier (phones) only the faces over 100 m are drawn.
'use strict';
window.OEFarCity = (function () {
  const PHONE_MIN_H = 100;
  const SUMMER = [707, 1001]; // Tokyo Tower's white lamps, 7 July to 30 September (MMDD)

  async function load(DATA, ASSETS) {
    try {
      const [bin, meta, cards] = await Promise.all([
        fetch(DATA + 'farcity.bin').then(r => (r.ok ? r.arrayBuffer() : null)),
        fetch(DATA + 'farcity.json').then(r => (r.ok ? r.json() : null)),
        fetch(ASSETS + 'far/far.json').then(r => (r.ok ? r.json() : null), () => null)]);
      return bin && meta ? { bin, meta, cards } : null;
    } catch (e) { return null; }
  }

  // the records of farcity.bin: [{ring: [x, y, ...] (m), h, g, seed}], tallest first
  function decode(buf, minH) {
    const dv = new DataView(buf), n = dv.getUint32(0, true), out = [];
    let o = 4;
    for (let i = 0; i < n; i++) {
      const k = dv.getUint8(o), seed = dv.getUint8(o + 1), h = dv.getUint16(o + 2, true) / 10, g = dv.getInt16(o + 4, true) / 10;
      o += 6;
      const ring = new Float32Array(2 * k);
      for (let j = 0; j < 2 * k; j++) ring[j] = dv.getInt16(o + 2 * j, true) / 2;
      o += 4 * k;
      if (h < minH) break; // (tallest first)
      out.push({ ring, h, g, seed });
    }
    return out;
  }

  const FACADE = `
uniform float uFcNight, uFcHour;
varying vec4 vFc;   // along the walls (m; < 0 on a roof), over the ground (m), the building's seed (0..1), its height
float fcH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float fcP(float x, float a, float b, float w) { // the share of a filter w wide round x in [a, b] of each period 1
  float iw = 1.0 / max(w, 1e-4), d = b - a, t = x - a, c = floor(t), t0 = t - c - 0.5 * w, t1 = t - c + 0.5 * w;
  return ((floor(t1) - floor(t0)) * d + min(fract(t1), d) - min(fract(t0), d)) * iw;
}`;

  // the haze over the far skyline after dark: the night's air is the sky's own deep blue at the horizon, but the edge
  // haze's colour (world.js) is lit for the plain under it, whose glow it carries; mixed into a far tower it turned the
  // tower to a pale grey block against a darker sky. So a far tower takes the same haze, darker by night
  function nightHaze(sh, night) {
    const C = window.THREE.ShaderChunk.fog_fragment, line = 'gl_FragColor.rgb = mix( gl_FragColor.rgb, oeHaze, fogFactor );';
    if (C.indexOf(line) < 0) return;
    sh.uniforms.uFcHazeNight = night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFcHazeNight;')
      .replace('#include <fog_fragment>', C.replace(line, 'gl_FragColor.rgb = mix( gl_FragColor.rgb, oeHaze * mix( 1.0, 0.4, uFcHazeNight ), fogFactor );'));
  }

  function material(U, THREE) {
    const night = (U && U.uNight) || { value: 0 }, hour = (U && U.uHour) || { value: 20 };
    const m = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 });
    m.defines = { OE_FAR: '' };
    m.onBeforeCompile = sh => {
      sh.uniforms.uFcNight = night; sh.uniforms.uFcHour = hour;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aFc;\nvarying vec4 vFc;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFc = aFc;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${FACADE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
  float fcRoof = step(vFc.x, -0.5), fcS = vFc.z, fcSt = 3.9 + 0.6 * fract(fcS * 7.0);   // a storey's height
  float fcQ = vFc.y / fcSt, fcW = max(fwidth(fcQ), 1e-4), fcFar = smoothstep(0.35, 0.9, fcW);
  // what the facade is made of: glass in most towers, stone or tile in some, each its own tone
  vec3 fcGlass = mix(vec3(0.22, 0.28, 0.33), vec3(0.3, 0.33, 0.35), fract(fcS * 3.1));
  vec3 fcWall = mix(vec3(0.58, 0.58, 0.56), vec3(0.62, 0.58, 0.52), fract(fcS * 5.3));
  float fcIsGlass = step(0.3, fcS);
  // the storeys: a band of glass over a spandrel, at its mean when a storey is under a pixel
  float fcBand = mix(fcP(fcQ, 0.28, 0.9, fcW), 0.62, fcFar);
  vec3 fcCol = mix(mix(fcWall * 0.95, vec3(0.18, 0.2, 0.22), fcBand * 0.8), mix(fcGlass * 1.15, fcGlass * 0.85, fcBand), fcIsGlass);
  diffuseColor.rgb = mix(fcCol, vec3(0.3, 0.31, 0.32), fcRoof) * (1.0 - 0.55 * uFcNight);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(0.75, mix(0.75, 0.3, fcBand * fcIsGlass), 1.0 - fcRoof);')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { // after dark the offices' lit floors, emptying through the evening as the map's own do (buildings.js occupancy)
    float hr = uFcHour;
    float staff = smoothstep(6.5, 8.5, hr) * (1.0 - smoothstep(17.0, 21.0, hr)), late = smoothstep(6.5, 8.5, hr) * (1.0 - smoothstep(19.0, 24.0, hr));
    float occ = clamp((0.05 + 0.55 * staff + 0.22 * late) * (0.5 + fcS) * 0.75, 0.0, 0.9);
    float fl = floor(fcQ), run = floor(max(vFc.x, 0.0) / 9.0);
    float lit = step(mix(fcH(vec2(fl, fcS * 97.0)), fcH(vec2(run, fl + fcS * 31.0)), 0.6), occ);   // by the run along a floor
    lit = mix(lit, occ, smoothstep(0.6, 1.4, fcW));                  // a storey under a pixel: the share lit
    float win = mix(fcP(fcQ, 0.3, 0.85, fcW), 0.55, fcFar);
    vec3 lamp = mix(vec3(0.85, 0.92, 1.0), vec3(1.0, 0.86, 0.66), step(0.8, fract(fcS * 11.0)));
    // a lit storey reads as a line of light while it is a pixel or more; spread over the facade's pixels as its mean,
    // the same light lit the whole tower as a pale grey block: a far tower at night is a dark mass, its light a glint
    float spread = mix(1.0, 0.3, smoothstep(0.5, 1.5, fcW));
    totalEmissiveRadiance += lamp * lit * win * spread * (1.0 - fcRoof) * uFcNight * 0.32;   // (the map's own lit rooms' level)
  }`);
      nightHaze(sh, night);
    };
    m.customProgramCacheKey = () => 'farcity';
    return m;
  }

  // the prisms of the records, in sectors round the frame's middle so that what is behind the camera is not drawn
  function geometry(recs, centre, THREE) {
    const SECT = 16, parts = Array.from({ length: SECT }, () => ({ p: [], n: [], a: [], i: [] }));
    const tops = [];
    for (const r of recs) {
      const k = r.ring.length / 2;
      let cx = 0, cy = 0;
      for (let j = 0; j < k; j++) { cx += r.ring[2 * j]; cy += r.ring[2 * j + 1]; }
      cx /= k; cy /= k;
      const s = Math.floor(((Math.atan2(cy - centre[1], cx - centre[0]) / (2 * Math.PI) + 1) % 1) * SECT) % SECT, P = parts[s];
      const seed = ((r.seed * 0.618034) % 1 + 1) % 1, z0 = r.g, z1 = r.g + r.h;
      let along = 0;
      for (let j = 0; j < k; j++) {
        const ax = r.ring[2 * j], ay = r.ring[2 * j + 1], bx = r.ring[2 * ((j + 1) % k)], by = r.ring[2 * ((j + 1) % k) + 1];
        const L = Math.hypot(bx - ax, by - ay);
        if (L < 0.2) continue;
        const nx = (by - ay) / L, ny = -(bx - ax) / L, b = P.p.length / 3;
        // map (x, y, z) -> three.js (x, z, -y)
        P.p.push(ax, z0, -ay, bx, z0, -by, bx, z1, -by, ax, z1, -ay);
        for (let q = 0; q < 4; q++) P.n.push(nx, 0, -ny);
        P.a.push(along, 0, seed, r.h, along + L, 0, seed, r.h, along + L, r.h, seed, r.h, along, r.h, seed, r.h);
        P.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
        along += L;
      }
      const pts = [];
      for (let j = 0; j < k; j++) pts.push(new THREE.Vector2(r.ring[2 * j], r.ring[2 * j + 1]));
      const tri = THREE.ShapeUtils.triangulateShape(pts, []), b = P.p.length / 3;
      for (let j = 0; j < k; j++) { P.p.push(pts[j].x, z1, -pts[j].y); P.n.push(0, 1, 0); P.a.push(-1, r.h, seed, r.h); }
      for (const [u, v, w] of tri) {
        // (counter-clockwise seen from above, so that the roof faces up)
        const cross = (pts[v].x - pts[u].x) * (pts[w].y - pts[u].y) - (pts[v].y - pts[u].y) * (pts[w].x - pts[u].x);
        if (cross >= 0) P.i.push(b + u, b + v, b + w); else P.i.push(b + u, b + w, b + v);
      }
      if (r.h >= 60) tops.push([cx, cy, z1]);
    }
    // one light a tower: a roof face's top only where no taller one is within 30 m (a tower's roof comes as several)
    tops.sort((p, q) => q[2] - p[2]);
    const cell = new Map(), keep = [];
    for (const t of tops) {
      const i = Math.floor(t[0] / 30), j = Math.floor(t[1] / 30);
      let near = false;
      for (let a = -1; a <= 1 && !near; a++) for (let b = -1; b <= 1 && !near; b++)
        near = (cell.get(`${i + a},${j + b}`) || []).some(q => Math.hypot(q[0] - t[0], q[1] - t[1]) < 30);
      if (near) continue;
      keep.push(t);
      const k = `${i},${j}`;
      if (!cell.has(k)) cell.set(k, []);
      cell.get(k).push(t);
    }
    return { parts, tops: keep };
  }

  function card(def, at, tex, THREE, U, tint) {
    const g = new THREE.PlaneGeometry(def.width, def.height);
    g.translate(0, def.height / 2, 0);
    const m = new THREE.MeshStandardMaterial({ map: tex.day, transparent: true, alphaTest: 0.02, depthWrite: false, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide });
    m.defines = { OE_FAR: '' };
    const night = (U && U.uNight) || { value: 0 };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { uCardNight: tex.night ? { value: tex.night } : { value: null }, uCardOn: night, uCardR: tint.r, uCardG: tint.g, uCardB: tint.b });
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uCardNight; uniform float uCardOn; uniform vec3 uCardR, uCardG, uCardB;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { vec3 n = texture2D(uCardNight, vMapUv).rgb;
    totalEmissiveRadiance += (uCardR * n.r + uCardG * n.g + uCardB * n.b) * uCardOn; }`);
      nightHaze(sh, night);
    };
    m.customProgramCacheKey = () => 'farcard';
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(at[0], at[2], -at[1]);
    mesh.renderOrder = -1;
    mesh.frustumCulled = true;
    return mesh;
  }

  // data: load()'s; opts: {U (world.js's uniforms: uNight, uHour), small (the low tier), ASSETS (the assets' base)}
  function create(data, { U, small = false, ASSETS = 'assets/' } = {}) {
    const THREE = window.THREE;
    const group = new THREE.Group();
    group.name = 'farcity';
    const recs = decode(data.bin, small ? PHONE_MIN_H : 0);
    const { parts, tops } = geometry(recs, data.meta.centre || [0, 0], THREE);
    const mat = material(U, THREE);
    let tris = 0;
    for (const P of parts) {
      if (!P.i.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(P.n, 3));
      g.setAttribute('aFc', new THREE.Float32BufferAttribute(P.a, 4));
      g.setIndex(P.i);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.matrixAutoUpdate = false;
      mesh.name = 'farcity';
      mesh.userData.noRefl = true;
      group.add(mesh);
      tris += P.i.length / 3;
    }
    // the towers' cards
    const cards = [], tints = {};
    const loader = new THREE.TextureLoader();
    for (const [id, def] of Object.entries((data.cards) || {})) {
      const at = data.meta.cards && data.meta.cards[id];
      if (!at) continue;
      const day = loader.load(ASSETS + def.picture), night = loader.load(ASSETS + def.night);
      day.colorSpace = THREE.SRGBColorSpace; night.colorSpace = THREE.NoColorSpace;
      for (const t of [day, night]) { t.anisotropy = 4; t.generateMipmaps = true; }
      const tint = { r: { value: new THREE.Color(0, 0, 0) }, g: { value: new THREE.Color(0, 0, 0) }, b: { value: new THREE.Color(0, 0, 0) } };
      tints[id] = tint;
      const c = card(def, at, { day, night }, THREE, U, tint);
      c.name = `farcard-${id}`;
      cards.push(c);
      group.add(c);
    }
    const lin = (r, g, b, k = 1) => new THREE.Color(r * k, g * k, b * k);
    const api = {
      group, tops, tris, count: recs.length, cards,
      // the date (local month and day): each tower's lighting
      setSeason(month, day) {
        const md = month * 100 + day, doy = Math.round((Date.UTC(2001, month - 1, day) - Date.UTC(2001, 0, 1)) / 864e5);
        const tt = tints.tokyo_tower, st = tints.skytree;
        if (tt) {
          const summer = md >= SUMMER[0] && md < SUMMER[1];
          tt.r.value.copy(summer ? lin(1.0, 0.95, 0.9, 1.6) : lin(1.0, 0.42, 0.1, 2.2));   // the lattice: Landmark Light
          tt.g.value.copy(lin(1.0, 0.86, 0.62, 1.6));                                       // the decks' windows
        }
        if (st) {
          const miyabi = doy % 2 === 1;
          st.r.value.copy(miyabi ? lin(0.55, 0.28, 0.95, 1.6) : lin(0.42, 0.72, 1.0, 1.6)); // Miyabi's purple, Iki's blue
          st.g.value.copy(lin(1.0, 0.9, 0.75, 1.5));
          st.b.value.copy(miyabi ? lin(0.9, 0.7, 1.0, 1.2) : lin(0.85, 0.95, 1.0, 1.4));   // the core
        }
      },
      // each frame: the cards turned to face the camera about their own axis
      update(camera) {
        for (const c of cards) {
          const dx = camera.position.x - c.position.x, dz = camera.position.z - c.position.z;
          c.rotation.y = Math.atan2(dx, dz);
        }
      },
    };
    api.setSeason(11, 20);
    return api;
  }

  return { load, create };
})();
