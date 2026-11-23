// People and cars. Pedestrians walk the city's footways (keeping left, as Australians
// do), step aside for each other and for the player, and stop to sit on benches. Cars
// drive the roads on the city's side (the left unless it keeps right), at the speed limit
// Overture gives or a default for the road class, and swing out round a car pulled in at
// the kerb. Cars are instanced meshes, a handful of draw calls for
// hundreds. People are drawn by people.js (realistic characters); the box-built rigs
// here are the fallback when those files can't be loaded.
'use strict';
window.OEActors = (function () {
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
  const W = (x, y, z) => new THREE.Vector3(x, z, -y);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const SHIRTS = ['#c94f3d', '#2f5d8c', '#e9e4d8', '#3d6b4a', '#1f2328', '#d9a441', '#7a4e8f', '#5b7f99', '#b5654b', '#f2f0ea', '#355c7d', '#8c2f39'];
  const PANTS = ['#2b3440', '#1d1f24', '#4b5563', '#3a3026', '#6b7280', '#24384f', '#c7b89a'];
  const SKIN = ['#f1c8a6', '#e0ac85', '#c68a64', '#a8714f', '#8d5a3c', '#6b4429'];
  const HAIR = ['#1b1311', '#3b2a20', '#6b4a2b', '#a37a45', '#c9a35b', '#8a8a8a', '#2a1d17'];
  // footway widths by class (m), for drawing the streets and for how far walkers can step aside
  const FOOTW = { pedestrian: 8, footway: 3, path: 2.5, steps: 3, cycleway: 2.5, living_street: 5 };
  const CARS = ['#f2f2f2', '#1c1c1e', '#8a9099', '#b3242b', '#1f4e8c', '#d8d3c8', '#2f3b33', '#c9a227', '#5a6470', '#7a1f2b'];

  // ------------------------------------------------------------ articulated person (player, NPCs)
  function box(w, h, d, color, y = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: lin(color), roughness: 0.8 }));
    m.position.y = y;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  function limb(len, w, color) { // pivot at the top, hangs down
    const g = new THREE.Group(), m = box(w, len, w, color, -len / 2);
    g.add(m);
    return g;
  }
  function makePerson(look = {}, { vest = false } = {}) {
    const shirt = look.shirt || pick(SHIRTS), pants = look.pants || pick(PANTS), skin = look.skin || pick(SKIN), hair = look.hair || pick(HAIR);
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const hips = new THREE.Group();
    hips.position.y = 0.94;
    body.add(hips);
    const torso = box(0.4, 0.56, 0.22, shirt, 0.3);
    hips.add(torso);
    if (vest) { // hi-vis survey vest with reflective bands
      const v = box(0.42, 0.42, 0.24, '#ff7a1a', 0.33);
      hips.add(v);
      for (const y of [0.22, 0.42]) hips.add(box(0.43, 0.04, 0.25, '#e8eef2', y));
    }
    const neck = new THREE.Group();
    neck.position.y = 0.62;
    hips.add(neck);
    const head = box(0.2, 0.24, 0.22, skin, 0.13);
    neck.add(head);
    neck.add(box(0.22, 0.08, 0.24, hair, 0.27));
    neck.add(box(0.22, 0.12, 0.05, hair, 0.18).translateZ(-0.1));
    const legL = limb(0.47, 0.15, pants), legR = limb(0.47, 0.15, pants);
    legL.position.set(0.1, 0, 0); legR.position.set(-0.1, 0, 0);
    hips.add(legL, legR);
    const shinL = limb(0.45, 0.13, pants), shinR = limb(0.45, 0.13, pants);
    shinL.position.y = -0.47; shinR.position.y = -0.47;
    legL.add(shinL); legR.add(shinR);
    for (const sh of [shinL, shinR]) { const f = box(0.14, 0.07, 0.26, '#2a2622', -0.47); f.position.z = 0.05; sh.add(f); }
    const armL = limb(0.3, 0.11, shirt), armR = limb(0.3, 0.11, shirt);
    armL.position.set(0.26, 0.55, 0); armR.position.set(-0.26, 0.55, 0);
    hips.add(armL, armR);
    const foreL = limb(0.28, 0.1, skin), foreR = limb(0.28, 0.1, skin);
    foreL.position.y = -0.3; foreR.position.y = -0.3;
    armL.add(foreL); armR.add(foreR);
    const rig = { root, body, hips, neck, legL, legR, shinL, shinR, armL, armR, foreL, foreR, phase: 0 };
    // pose: speed in m/s, mode 'ground' | 'air' | 'sit' | 'talk'
    rig.animate = (dt, speed, mode = 'ground', t = 0) => {
      if (mode === 'sit') {
        legL.rotation.x = legR.rotation.x = -1.45; shinL.rotation.x = shinR.rotation.x = 1.45;
        armL.rotation.x = armR.rotation.x = -0.35; foreL.rotation.x = foreR.rotation.x = -0.6;
        hips.position.y = 0.5;
        return;
      }
      hips.position.y = 0.94;
      if (mode === 'air') {
        legL.rotation.x = -0.5; legR.rotation.x = 0.25; shinL.rotation.x = 0.7; shinR.rotation.x = 0.3;
        armL.rotation.x = -0.9; armR.rotation.x = 0.6; foreL.rotation.x = foreR.rotation.x = -0.4;
        return;
      }
      const run = Math.min(1, Math.max(0, (speed - 2.2) / 3));
      rig.phase += dt * (speed > 0.1 ? 2.2 + speed * 1.6 : 0);
      const s = Math.sin(rig.phase), amp = Math.min(1, speed / 1.6) * (0.55 + 0.35 * run);
      legL.rotation.x = s * amp; legR.rotation.x = -s * amp;
      shinL.rotation.x = Math.max(0, -Math.cos(rig.phase)) * amp * 1.3;
      shinR.rotation.x = Math.max(0, Math.cos(rig.phase)) * amp * 1.3;
      armL.rotation.x = -s * amp * 0.8; armR.rotation.x = s * amp * 0.8;
      foreL.rotation.x = foreR.rotation.x = -0.25 - run * 0.9;
      hips.position.y = 0.94 + Math.abs(Math.cos(rig.phase)) * 0.04 * amp;
      body.rotation.x = run * 0.18;
      if (speed < 0.1) { // idle: breathe, glance around; talking adds gestures
        const b = Math.sin(t * 1.7) * 0.012;
        hips.position.y = 0.94 + b;
        neck.rotation.y = Math.sin(t * 0.37) * 0.35;
        if (mode === 'talk') { armR.rotation.x = -0.5 + Math.sin(t * 3.1) * 0.25; foreR.rotation.x = -0.9; neck.rotation.y = 0; }
      } else neck.rotation.y *= 0.9;
    };
    return rig;
  }

  // ------------------------------------------------------------ instanced bodies, animated in the shader
  // tone: 0..3 take per-instance colours aC0..aC3; 4 glass, 5 tyre, 6 headlight, 7 tail light;
  // the Blender cars add 8 trim, 9 chrome, 10 wheel, 11 number plate, 12 taxi sign, 13 indicator,
  // and (with `cars`) their baked occlusion and a finish per tone: gloss paint, glass, metal.
  // part: 0 rigid, 1/2 left/right leg (pivot at hips), 3/4 left/right arm (pivot at shoulders)
  function toneMaterial(U, { cars = false } = {}) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 });
    // a car is drawn on both sides, its inside dark: where a far copy (or an arch) leaves a gap,
    // it reads as the shadowed inside of a car, not as a hole through it
    if (cars) { mat.defines = Object.assign({}, mat.defines, { TONE_CARS: '' }); mat.side = THREE.DoubleSide; }
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = U.uTime; sh.uniforms.uNight = U.uNight; sh.uniforms.uLamps = U.uLamps || (U.uLamps = { value: 0 }); // (uLamps: headlamps on by day, in rain, snow or fog)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute float tone; attribute float part; attribute vec3 aC0; attribute vec3 aC1; attribute vec3 aC2; attribute vec3 aC3; attribute vec3 aAnim;
uniform float uTime; varying vec3 vCol; varying float vEmit;
#ifdef TONE_CARS
attribute float ao; varying float vAO; varying float vTone; varying float vLamp;
#endif
mat3 rx(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
float sw = sin(uTime * aAnim.y + aAnim.x) * aAnim.z;
float ang = part > 0.5 && part < 1.5 ? sw : part > 1.5 && part < 2.5 ? -sw : part > 2.5 && part < 3.5 ? -sw * 0.8 : part > 3.5 ? sw * 0.8 : 0.0;
float piv = part < 2.5 ? 0.94 : 1.49;
objectNormal = rx(ang) * objectNormal;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed.y -= piv; transformed = rx(ang) * transformed; transformed.y += piv;
vCol = tone < 0.5 ? aC0 : tone < 1.5 ? aC1 : tone < 2.5 ? aC2 : tone < 3.5 ? aC3 : tone < 4.5 ? vec3(0.03, 0.045, 0.06) : tone < 5.5 ? vec3(0.02) : tone < 6.5 ? vec3(0.9, 0.88, 0.8) : tone < 7.5 ? vec3(0.5, 0.02, 0.02)
  : tone < 8.5 ? vec3(0.03) : tone < 9.5 ? vec3(0.8) : tone < 10.5 ? vec3(0.42, 0.43, 0.45) : tone < 11.5 ? vec3(0.78, 0.78, 0.72) : tone < 12.5 ? vec3(0.9, 0.8, 0.42) : vec3(0.7, 0.32, 0.02);
vEmit = tone > 5.5 && tone < 7.5 ? (tone < 6.5 ? 1.0 : 0.7) : tone > 11.5 && tone < 12.5 ? 0.3 : 0.0; // (a taxi's roof sign: a lit panel, not a lamp, that blooms across the car behind it)
#ifdef TONE_CARS
// (a pane of glass takes no occlusion: its few vertices lie under its frame, where the bake is darkest, and fewer are
// left in the mid and far copies, sedan 0.68, 0.40, 0.14, so that the far glass lost its reflection and drew black, #525)
vAO = tone > 3.5 && tone < 4.5 ? 1.0 : ao; vTone = tone;
// a car's brake lights and indicators (#355), per car in aC3 (a tone no car has): x how hard it brakes, y its
// indicators (1 left, -1 right, 2 both: hazards), flashing 85 times a minute; the left lamps are on the model's +x
float sgn = aC3.y, flash = step(0.5, fract(uTime * 1.42));
vLamp = tone > 6.5 && tone < 7.5 ? aC3.x * 3.0 : tone > 12.5 ? flash * (sgn > 1.5 ? 1.0 : sgn * position.x > 0.05 ? 1.0 : 0.0) * 2.6 : 0.0;
#endif`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform float uNight; uniform float uLamps; varying vec3 vCol; varying float vEmit;
#ifdef TONE_CARS
varying float vAO; varying float vTone; varying float vLamp;
#endif`)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `vec4 diffuseColor = vec4( vCol, opacity );
#ifdef TONE_CARS
diffuseColor.rgb *= mix(1.0, vAO, 0.45);
if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.02);
#endif`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
#ifdef TONE_CARS
roughnessFactor = vTone < 1.5 ? 0.28 : vTone < 3.5 ? roughnessFactor : vTone < 4.5 ? 0.05 : vTone < 5.5 ? 0.9 : vTone < 7.5 ? 0.2 : vTone < 8.5 ? 0.6 : vTone < 9.5 ? 0.12 : vTone < 10.5 ? 0.32 : 0.45;
#endif`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
#ifdef TONE_CARS
metalnessFactor = vTone > 8.5 && vTone < 10.5 ? 0.9 : 0.0;
#endif`)
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
#ifdef TONE_CARS
reflectedLight.indirectDiffuse *= vAO; reflectedLight.indirectSpecular *= vAO;
#endif`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vCol * vEmit * (0.25 + 2.5 * max(uNight, 0.45 * uLamps));
#ifdef TONE_CARS
totalEmissiveRadiance += vCol * vLamp; // (brake lights and indicators: lit by day as by night)
#endif`);
    };
    return mat;
  }
  // merge boxes into one geometry with tone and part attributes
  function boxes(list) {
    const pos = [], nrm = [], tone = [], part = [], idx = [];
    for (const [w, h, d, x, y, z, t, p] of list) {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      const base = pos.length / 3, P = g.attributes.position, N = g.attributes.normal;
      for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nrm.push(N.getX(i), N.getY(i), N.getZ(i)); tone.push(t); part.push(p); }
      for (const i of g.index.array) idx.push(base + i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('tone', new THREE.Float32BufferAttribute(tone, 1));
    g.setAttribute('part', new THREE.Float32BufferAttribute(part, 1));
    g.setIndex(idx);
    return g;
  }
  const PERSON = () => boxes([
    [0.38, 0.56, 0.21, 0, 1.24, 0, 0, 0], [0.19, 0.23, 0.21, 0, 1.68, 0, 2, 0], [0.21, 0.08, 0.23, 0, 1.82, 0, 3, 0],
    [0.15, 0.92, 0.15, 0.1, 0.47, 0, 1, 1], [0.15, 0.92, 0.15, -0.1, 0.47, 0, 1, 2],
    [0.14, 0.06, 0.25, 0.1, 0.03, 0.05, 5, 1], [0.14, 0.06, 0.25, -0.1, 0.03, 0.05, 5, 2],
    [0.1, 0.56, 0.1, 0.25, 1.21, 0, 0, 3], [0.1, 0.56, 0.1, -0.25, 1.21, 0, 0, 4],
    [0.09, 0.1, 0.09, 0.25, 0.88, 0, 2, 3], [0.09, 0.1, 0.09, -0.25, 0.88, 0, 2, 4],
  ]);
  const CAR = () => boxes([ // 4.4 m long, nose towards +z
    [1.8, 0.62, 4.4, 0, 0.62, 0, 0, 0], [1.6, 0.52, 2.3, 0, 1.18, -0.25, 4, 0], [1.62, 0.06, 2.1, 0, 1.47, -0.25, 0, 0],
    [0.24, 0.62, 0.62, 0.86, 0.31, 1.35, 5, 0], [0.24, 0.62, 0.62, -0.86, 0.31, 1.35, 5, 0],
    [0.24, 0.62, 0.62, 0.86, 0.31, -1.35, 5, 0], [0.24, 0.62, 0.62, -0.86, 0.31, -1.35, 5, 0],
    [0.36, 0.16, 0.05, 0.62, 0.72, 2.21, 6, 0], [0.36, 0.16, 0.05, -0.62, 0.72, 2.21, 6, 0],
    [0.36, 0.14, 0.05, 0.62, 0.74, -2.21, 7, 0], [0.36, 0.14, 0.05, -0.62, 0.74, -2.21, 7, 0],
  ]);
  // the traffic is no roof to the weather's map of what is under cover, any more than the people are (people.js
  // uncovered): drawn into it, a car on the move left a dry strip of road behind it until the map was next made
  const noCover = m => { if (window.OEPeople && OEPeople.uncovered) OEPeople.uncovered.push(m); return m; };
  function instanced(geo, mat, n) {
    for (const a of ['aC0', 'aC1', 'aC2', 'aC3', 'aAnim']) geo.setAttribute(a, new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    geo.attributes.aAnim.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    return m;
  }
  const setC = (attr, i, hex) => { const c = lin(hex); attr.setXYZ(i, c.r, c.g, c.b); };

  // the shared Blender cars (assets/vehicles/cars.glb): one geometry per model and distance,
  // the materials folded into tone slots and the baked occlusion into 'ao'
  function carGeometries(gltf, tones) {
    const out = {};
    gltf.scene.updateMatrixWorld(true);
    for (const node of gltf.scene.children) {
      if (/_Cabin$/.test(node.name)) continue; // seats and wheel, for the cars people get into (cars.js)
      const parts = [];
      node.traverse(o => { if (o.isMesh) parts.push(o); });
      const pos = [], nrm = [], tone = [], ao = [], idx = [];
      for (const m of parts) {
        const g = m.geometry.clone().applyMatrix4(m.matrixWorld), P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
        const name = m.material.name.replace(/\.\d+$/, ''), t = name in tones ? tones[name] : 8, base = pos.length / 3;
        for (let i = 0; i < P.count; i++) {
          pos.push(P.getX(i), P.getY(i), P.getZ(i)); nrm.push(N.getX(i), N.getY(i), N.getZ(i));
          tone.push(t); ao.push(C ? C.getX(i) : 1);
        }
        if (g.index) for (const i of g.index.array) idx.push(base + i);
        else for (let i = 0; i < P.count; i++) idx.push(base + i);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('tone', new THREE.Float32BufferAttribute(tone, 1));
      g.setAttribute('part', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
      g.setAttribute('ao', new THREE.Float32BufferAttribute(ao, 1));
      g.setIndex(idx);
      g.computeBoundingBox();
      if (node.userData.near_box) g.userData.nearBox = node.userData.near_box; // (a far model's: the near one's box, pipeline/split_glb.mjs)
      const [model, lod] = node.name.split('_LOD');
      (out[model] = out[model] || [])[lod ? +lod : 0] = g;
    }
    return out;
  }

  // ------------------------------------------------------------ polyline networks (footways, roads)
  // The footways joined where they meet (issue 168). A network's lines meet only at their ends (network's nodes), and
  // the footways come as they were mapped and then cut (at walls, at ground nobody can stand on): of Shibuya's 5,610
  // ends 2,021 met another, 1,358 lay on the middle of another line (a path that runs into a footway: a T with no
  // node at it) and 218 within 3 m of another end without meeting it. To a walker each of those was the end of the
  // way: it turned back there, and on a short piece walked to and fro between its two ends. Here an end that meets
  // nothing is joined to what it reaches within REACH metres on its own level (within a metre up or down), the join
  // itself clear of walls (`solid(x, y, z)`, m): to another end by a step to it, or to the middle of another line,
  // which is cut there in two; where the cut would leave a piece under 4.5 m (which a network drops) the end is led on
  // along that piece to its end instead. Lines as given: { p: [x, y, z, ...] in decimetres, d: per segment }; returns
  // new lines, the given ones left as they were.
  function join(lines, solid = null, REACH = 1.6, walk = null) {
    const L = lines.map(o => Object.assign({}, o, { p: Array.from(o.p), d: o.d ? Array.from(o.d) : null }));
    const CELL = 80, key = (x, y) => `${Math.round(x / 20)},${Math.round(y / 20)}`, R = REACH * 10, DZ = 10, SHORT = 45;
    const cell = (x, y) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
    const clearWay = (ax, ay, az, bx, by, bz) => {
      if (!solid) return true;
      const m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4));
      for (let j = 0; j <= m; j++) if (solid((ax + (bx - ax) * j / m) / 10, (ay + (by - ay) * j / m) / 10, (az + (bz - az) * j / m) / 10)) return false;
      return true;
    };
    let joined = 0, cuts = 0, led = 0;
    for (let pass = 0; pass < 2; pass++) { // (a second pass: for the ends the first one's cuts made)
      const ends = new Map(), grid = new Map();
      L.forEach((l, i) => {
        const n = l.p.length / 3;
        for (const k of [0, n - 1]) { const kk = key(l.p[3 * k], l.p[3 * k + 1]); ends.set(kk, (ends.get(kk) || 0) + 1); }
        for (let k = 0; k < n - 1; k++) {
          const x0 = Math.floor(Math.min(l.p[3 * k], l.p[3 * k + 3]) / CELL), x1 = Math.floor(Math.max(l.p[3 * k], l.p[3 * k + 3]) / CELL), y0 = Math.floor(Math.min(l.p[3 * k + 1], l.p[3 * k + 4]) / CELL), y1 = Math.floor(Math.max(l.p[3 * k + 1], l.p[3 * k + 4]) / CELL);
          for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const c = `${cx},${cy}`; let g = grid.get(c); if (!g) grid.set(c, g = []); g.push(i, k); }
        }
      });
      const splits = new Map(), later = []; // line -> [{ k, t, x, y, z }]
      const n0 = L.length;
      for (let i = 0; i < n0; i++) {
        const l = L[i];
        for (const e of [0, 1]) {
          const n = l.p.length / 3, k = e ? n - 1 : 0, x = l.p[3 * k], y = l.p[3 * k + 1], z = l.p[3 * k + 2];
          if (ends.get(key(x, y)) > 1) continue;
          let best = null;
          const cx0 = Math.floor((x - R) / CELL), cx1 = Math.floor((x + R) / CELL), cy0 = Math.floor((y - R) / CELL), cy1 = Math.floor((y + R) / CELL);
          for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
            const g = grid.get(`${cx},${cy}`);
            if (g) for (let j = 0; j < g.length; j += 2) {
              const li = g[j], sk = g[j + 1];
              if (li === i || li >= n0) continue;
              const m = L[li], ax = m.p[3 * sk], ay = m.p[3 * sk + 1], az = m.p[3 * sk + 2], bx = m.p[3 * sk + 3], by = m.p[3 * sk + 4], bz = m.p[3 * sk + 5];
              const dx = bx - ax, dy = by - ay, d2 = dx * dx + dy * dy, t = d2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / d2)) : 0;
              const qx = ax + dx * t, qy = ay + dy * t, qz = az + (bz - az) * t, d = Math.hypot(qx - x, qy - y);
              if (d > R || Math.abs(qz - z) > DZ || (best && d >= best.d)) continue;
              best = { d, li, sk, t, x: qx, y: qy, z: qz };
            }
          }
          if (!best || !clearWay(x, y, z, best.x, best.y, best.z)) continue;
          // how far along the line met its two ends are from the meeting point
          const m = L[best.li], mn = m.p.length / 3;
          let before = Math.hypot(best.x - m.p[3 * best.sk], best.y - m.p[3 * best.sk + 1]), after = Math.hypot(m.p[3 * best.sk + 3] - best.x, m.p[3 * best.sk + 4] - best.y);
          for (let q = 1; q <= best.sk; q++) before += Math.hypot(m.p[3 * q] - m.p[3 * q - 3], m.p[3 * q + 1] - m.p[3 * q - 2]);
          for (let q = best.sk + 2; q < mn; q++) after += Math.hypot(m.p[3 * q] - m.p[3 * q - 3], m.p[3 * q + 1] - m.p[3 * q - 2]);
          const add = [];
          if (before < SHORT || after < SHORT) { // led on along the line met to its nearer end: its last points, in order
            if (before <= after) { if (best.t > 0.02 || best.sk > 0) add.push(Math.round(best.x), Math.round(best.y), Math.round(best.z)); for (let q = best.sk; q >= 0; q--) add.push(m.p[3 * q], m.p[3 * q + 1], m.p[3 * q + 2]); }
            else { if (best.t < 0.98 || best.sk < mn - 2) add.push(Math.round(best.x), Math.round(best.y), Math.round(best.z)); for (let q = best.sk + 1; q < mn; q++) add.push(m.p[3 * q], m.p[3 * q + 1], m.p[3 * q + 2]); }
            led++;
          } else {
            const X = Math.round(best.x), Y = Math.round(best.y), Z = Math.round(best.z);
            let S = splits.get(best.li); if (!S) splits.set(best.li, S = []);
            // (one cut for the ends that meet it within half a metre of each other: they share the node)
            const same = S.find(c => Math.hypot(c.x - X, c.y - Y) < 5);
            if (same) add.push(same.x, same.y, same.z); else { S.push({ k: best.sk, t: best.t, x: X, y: Y, z: Z }); add.push(X, Y, Z); cuts++; }
          }
          // (the points added: without a doubled point where the end already stood on the one it is led to)
          const pts = []; let lx = x, ly = y;
          let move = null;
          for (let q = 0; q < add.length; q += 3) { if (Math.hypot(add[q] - lx, add[q + 1] - ly) < 1) { if (q + 3 >= add.length && pts.length === 0) move = [add[q], add[q + 1], add[q + 2]]; continue; } pts.push(add[q], add[q + 1], add[q + 2]); lx = add[q]; ly = add[q + 1]; }
          if (add.length) { const kk = key(add[add.length - 3], add[add.length - 2]); ends.set(kk, (ends.get(kk) || 0) + 1); } // (met now: the end it was led to does not come looking for this one in turn)
          later.push({ l, e, pts, move }); // (made once every end has been looked at: the grid's places along a line hold until then)
          joined++;
        }
      }
      for (const { l, e, pts, move } of later) {
        const k = e ? l.p.length / 3 - 1 : 0;
        if (move) { l.p[3 * k] = move[0]; l.p[3 * k + 1] = move[1]; l.p[3 * k + 2] = move[2]; }
        const dk = l.d ? (e ? l.d[l.d.length - 1] : l.d[0]) || 0 : 0;
        if (e) { for (let q = 0; q < pts.length; q += 3) { l.p.push(pts[q], pts[q + 1], pts[q + 2]); if (l.d) l.d.push(dk); } }
        else { for (let q = 0; q < pts.length; q += 3) { l.p.unshift(pts[q + 2]); l.p.unshift(pts[q + 1]); l.p.unshift(pts[q]); if (l.d) l.d.unshift(dk); } }
      }
      // the cuts: each line met in its middle becomes the pieces between its cuts
      for (const [li, S] of splits) {
        const m = L[li], p = m.p, d = m.d;
        // (a cut's place along the line as it is now: found again by its point, since ends led on above may have
        // lengthened this line at its start)
        const at = S.map(c => {
          let bk = -1, bt = 0, bd = Infinity;
          for (let k = 0; k < p.length / 3 - 1; k++) {
            const ax = p[3 * k], ay = p[3 * k + 1], dx = p[3 * k + 3] - ax, dy = p[3 * k + 4] - ay, d2 = dx * dx + dy * dy, t = d2 > 0 ? Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.y - ay) * dy) / d2)) : 0, dd = Math.hypot(ax + dx * t - c.x, ay + dy * t - c.y) + Math.abs(p[3 * k + 2] - c.z) * 0.1;
            if (dd < bd) { bd = dd; bk = k; bt = t; }
          }
          return { k: bk, t: bt, x: c.x, y: c.y, z: c.z };
        }).sort((a, b) => a.k - b.k || a.t - b.t);
        const pieces = [];
        let cur = [p[0], p[1], p[2]], curD = [], ci = 0;
        for (let k = 0; k < p.length / 3 - 1; k++) {
          while (ci < at.length && at[ci].k === k) {
            const c = at[ci++];
            if (Math.hypot(c.x - cur[cur.length - 3], c.y - cur[cur.length - 2]) >= 1) { cur.push(c.x, c.y, c.z); curD.push(d ? d[k] : 0); }
            if (cur.length >= 6) pieces.push([cur, curD]);
            cur = [c.x, c.y, c.z]; curD = [];
          }
          if (Math.hypot(p[3 * k + 3] - cur[cur.length - 3], p[3 * k + 4] - cur[cur.length - 2]) >= 1 || cur.length < 6) { cur.push(p[3 * k + 3], p[3 * k + 4], p[3 * k + 5]); curD.push(d ? d[k] : 0); }
        }
        if (cur.length >= 6) pieces.push([cur, curD]);
        pieces.forEach(([pp, dd], j) => { const o = Object.assign({}, m, { p: pp, d: d ? dd : null }); if (j === 0) L[li] = o; else L.push(o); });
      }
      if (!splits.size && pass > 0) break;
    }
    // The gaps bridged. Where a footway runs into a pier, a pillar or a planter the cut leaves its two halves facing
    // each other across the thing, each ending nowhere (under the deck east of the Scramble: four such ends within
    // 30 m, where the two men of issue 168 walked to and fro). A person walks round a pier. An end that still meets
    // nothing is led on to another such end within GAP metres on its level that lies ahead of it: straight across
    // where a body can walk every 0.4 m of the way (`walk(x, y, z)`: ground to stand on, clear of walls, rails and
    // posts by a body's width), else round by a step aside of 1.5 to 4.5 m, to either side.
    let bridged = 0;
    if (walk) {
      const GAP = 140, count = new Map(), E = [];
      L.forEach(l => { const n = l.p.length / 3; for (const k of [0, n - 1]) { const kk = key(l.p[3 * k], l.p[3 * k + 1]); count.set(kk, (count.get(kk) || 0) + 1); } });
      L.forEach((l, i) => {
        const n = l.p.length / 3;
        for (const e of [0, 1]) {
          const k = e ? n - 1 : 0, j = e ? n - 2 : 1, x = l.p[3 * k], y = l.p[3 * k + 1];
          if (count.get(key(x, y)) > 1) continue;
          const hx = x - l.p[3 * j], hy = y - l.p[3 * j + 1], h = Math.hypot(hx, hy) || 1;
          E.push({ i, e, x, y, z: l.p[3 * k + 2], hx: hx / h, hy: hy / h, done: false });
        }
      });
      const way = P => { // can a body walk the whole of it?
        for (let q = 3; q < P.length; q += 3) {
          const ax = P[q - 3], ay = P[q - 2], az = P[q - 1], bx = P[q], by = P[q + 1], bz = P[q + 2], m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4));
          for (let j = q === 3 ? 1 : 0; j <= m - (q + 3 >= P.length ? 1 : 0); j++) if (!walk((ax + (bx - ax) * j / m) / 10, (ay + (by - ay) * j / m) / 10, (az + (bz - az) * j / m) / 10)) return false;
        }
        return true;
      };
      for (const a of E) {
        if (a.done) continue;
        let b = null, bd = GAP;
        for (const o of E) {
          if (o === a || o.done || o.i === a.i || Math.abs(o.z - a.z) > DZ) continue;
          const dx = o.x - a.x, dy = o.y - a.y, d = Math.hypot(dx, dy);
          if (d >= bd || d < 1 || (dx * a.hx + dy * a.hy) / d < 0.5 || (-dx * o.hx - dy * o.hy) / d < 0.2) continue; // (ahead of this end, and that end looking back this way)
          b = o; bd = d;
        }
        if (!b) continue;
        const dx = (b.x - a.x) / bd, dy = (b.y - a.y) / bd, mz = Math.round((a.z + b.z) / 2), A = [a.x, a.y, a.z], B = [b.x, b.y, b.z];
        let path = way([...A, ...B]) ? [] : null;
        for (const off of [15, -15, 30, -30, 45, -45]) {
          if (path) break;
          const ox = -dy * off, oy = dx * off;
          const one = [Math.round((a.x + b.x) / 2 + ox), Math.round((a.y + b.y) / 2 + oy), mz];
          const two = [Math.round(a.x + ox + dx * 5), Math.round(a.y + oy + dy * 5), a.z, Math.round(b.x + ox - dx * 5), Math.round(b.y + oy - dy * 5), b.z];
          if (way([...A, ...one, ...B])) path = one; else if (bd > 30 && way([...A, ...two, ...B])) path = two;
        }
        if (!path) continue;
        const l = L[a.i], dk = l.d ? (a.e ? l.d[l.d.length - 1] : l.d[0]) || 0 : 0, pts = [...path, ...B];
        if (a.e) { for (let q = 0; q < pts.length; q += 3) { l.p.push(pts[q], pts[q + 1], pts[q + 2]); if (l.d) l.d.push(dk); } }
        else { for (let q = 0; q < pts.length; q += 3) { l.p.unshift(pts[q + 2]); l.p.unshift(pts[q + 1]); l.p.unshift(pts[q]); if (l.d) l.d.unshift(dk); } }
        a.done = b.done = true; bridged++;
      }
    }
    join.last = { joined, cuts, led, bridged, lines: L.length, were: lines.length }; // (for the checks)
    return L.map(o => { if (o.d) o.d = Uint8Array.from(o.d); else delete o.d; return o; });
  }
  function network(lines, opts = {}) {
    const L = lines.map((o, i0) => {
      const p = o.p || o, n = p.length / 3, pts = new Float32Array(n * 3), cum = new Float32Array(n);
      for (let i = 0; i < n; i++) { pts[3 * i] = p[3 * i] / 10; pts[3 * i + 1] = p[3 * i + 1] / 10; pts[3 * i + 2] = p[3 * i + 2] / 10; }
      for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[3 * i] - pts[3 * i - 3], pts[3 * i + 1] - pts[3 * i - 2]);
      // deck: per segment, 1 where the line is off the ground (decks.js); ow: one-way with its points (1) or against them (-1);
      // i0: its place in the lines given; nt: the turns banned from its ends, tl the arrows on its lanes
      // (OSM's turn:lanes) at its ends (junctions.js); ntw: turns banned at some hours, tb: the hours
      // it is shut to cars (pipeline/road_rules.py); nl: OSM's count of its lanes each way (road_lanes.py);
      // wall: 1 where it starts at a wall, 2 where it ends at one (a road the data runs into a building: game.js cutAtWalls);
      // cw: its carriageway's width where narrower than its class's (a channel's bank lane: inland_water.py bank_lanes)
      // the road plan's (pipeline/road_plan.py, docs/ROADS.md): quiet: 1 where no way along it leads from one of the map's
      // gates to another (a cul-de-sac, a stub before a closure): no traffic is made on it and none turns in; bus: 1 on a
      // street a bus route takes; ends: what its two ends are where nothing joins them (1 a gate, 2 a dead end, 3 a closure)
      return { pts, cum, len: cum[n - 1], v: o.v || 0, c: o.c || '', deck: o.d || null, ow: o.o || 0, i0: o.r0 != null ? o.r0 : i0, nt: o.nt || null, tl: o.tl || null, ntw: o.ntw || null, tb: o.tb || null, nl: o.nl || 0, wall: o.w || 0, cw: o.cw || 0,
        quiet: o.q || 0, bus: o.b || 0, ends: o.e || null };
    }).filter(l => l.len > 4);
    const key = (x, y) => `${Math.round(x / 2)},${Math.round(y / 2)}`;
    const nodes = new Map(), grid = new Map(), GC = 100;
    L.forEach((l, i) => {
      const n = l.pts.length / 3;
      for (const [end, k] of [[0, 0], [1, n - 1]]) {
        const kk = key(l.pts[3 * k], l.pts[3 * k + 1]);
        if (!nodes.has(kk)) nodes.set(kk, []);
        nodes.get(kk).push([i, end]);
      }
      for (let k = 0; k < n; k += 2) {
        const gk = `${Math.floor(l.pts[3 * k] / GC)},${Math.floor(l.pts[3 * k + 1] / GC)}`;
        if (!grid.has(gk)) grid.set(gk, new Set());
        grid.get(gk).add(i);
      }
    });
    for (const [k, v] of grid) grid.set(k, [...v]);
    function at(i, s, out) { // position and heading at distance s along line i
      const l = L[i], n = l.pts.length / 3;
      s = Math.max(0, Math.min(l.len, s));
      let k = 1;
      if (n > 6) { let hi = n - 1; while (hi - k > 0) { const m = (k + hi) >> 1; if (l.cum[m] < s) k = m + 1; else hi = m; } }
      else while (k < n - 1 && l.cum[k] < s) k++;
      const t = (s - l.cum[k - 1]) / Math.max(1e-6, l.cum[k] - l.cum[k - 1]);
      const ax = l.pts[3 * k - 3], ay = l.pts[3 * k - 2], az = l.pts[3 * k - 1], bx = l.pts[3 * k], by = l.pts[3 * k + 1], bz = l.pts[3 * k + 2];
      out.x = ax + (bx - ax) * t; out.y = ay + (by - ay) * t; out.z = az + (bz - az) * t;
      out.deck = l.deck ? l.deck[k - 1] : 0;
      out.k = k;
      out.hx = bx - ax; out.hy = by - ay;
      const h = Math.hypot(out.hx, out.hy) || 1;
      out.hx /= h; out.hy /= h;
      return out;
    }
    // lines with a vertex in the ring between rMin and rMax around (x, y)
    function near(x, y, rMin, rMax) {
      const out = [], c0 = Math.floor((x - rMax) / GC), c1 = Math.floor((x + rMax) / GC), r0 = Math.floor((y - rMax) / GC), r1 = Math.floor((y + rMax) / GC);
      for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
        const d = Math.hypot((cx + 0.5) * GC - x, (cy + 0.5) * GC - y);
        if (d > rMax + GC || d < rMin - GC) continue;
        const g = grid.get(`${cx},${cy}`);
        if (g) out.push(...g);
      }
      return out;
    }
    // the closest point on any line within maxD of (x, y): {line, s, x, y, z, d} or null; with z,
    // only where the line is within dz of that height (the street you are on, not the flyover above it)
    // the nearest point on the lines within maxD of (x, y), within dz of height z (when given), and
    // with a grade, within dz + grade * the distance: a street down a slope from a raised plaza
    // (Melbourne's Federation Square) counts, a road on a deck right above or below does not;
    // skip(i): lines to pass over
    function nearest(x, y, maxD, z = null, dz = 3, grade = 0, skip = null) {
      let best = null;
      for (const i of new Set(near(x, y, 0, maxD))) {
        if (skip && skip(i)) continue;
        const l = L[i], n = l.pts.length / 3;
        for (let k = 1; k < n; k++) {
          const ax = l.pts[3 * k - 3], ay = l.pts[3 * k - 2], ex = l.pts[3 * k] - ax, ey = l.pts[3 * k + 1] - ay, L2 = ex * ex + ey * ey;
          const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L2)) : 0;
          const qx = ax + ex * t, qy = ay + ey * t, d = Math.hypot(x - qx, y - qy), qz = l.pts[3 * k - 1] + (l.pts[3 * k + 2] - l.pts[3 * k - 1]) * t;
          if (d < maxD && (!best || d < best.d) && (z == null || Math.abs(qz - z) < dz + grade * d)) best = { line: i, s: l.cum[k - 1] + t * Math.sqrt(L2), x: qx, y: qy, z: qz, d };
        }
      }
      return best;
    }
    // another line meeting line i's end (0 start, 1 end): [line, its end there], not one to avoid;
    // with `legal`, only one a car may drive into from there (not against a one-way street)
    // (hw: a vehicle's half-width; a street too narrow for it, api.fit, only if there is no other)
    function next(i, end, legal = false, hw = 0) {
      const l = L[i], k = end ? l.pts.length / 3 - 1 : 0, av = api.avoid;
      let opts2 = (nodes.get(key(l.pts[3 * k], l.pts[3 * k + 1])) || []).filter(o => o[0] !== i && !(av && av[o[0]]) && (!legal || L[o[0]].ow !== (o[1] === 0 ? -1 : 1)));
      if (hw && api.fit && opts2.length > 1) { const w = opts2.filter(o => api.fit[o[0]] >= hw); if (w.length) opts2 = w; }
      return opts2.length ? opts2[Math.floor(rnd() * opts2.length)] : null;
    }
    // the one line a car can drive on into from line i's end, where it simply continues (or null)
    function only(i, end) {
      const l = L[i], k = end ? l.pts.length / 3 - 1 : 0, at2 = nodes.get(key(l.pts[3 * k], l.pts[3 * k + 1])) || [];
      if (at2.length !== 2) return null;
      const o = at2[0][0] === i ? at2[1] : at2[0];
      return L[o[0]].ow !== (o[1] === 0 ? -1 : 1) && !(api.avoid && api.avoid[o[0]]) ? o : null;
    }
    // avoid: per line, 1 for a line no one should be put on or turn into (a road through a
    // building, which route.js finds); set by the game once it knows
    const api = { L, at, near: (x, y, rMin, rMax) => (api.avoid ? near(x, y, rMin, rMax).filter(i => !api.avoid[i]) : near(x, y, rMin, rMax)), nearest, next, only, nodes, key, avoid: null, fit: null, planned: L.some(l => l.ends || l.quiet), busStreets: L.some(l => l.bus) }; // (fit: per line, the widest vehicle's half-width it has room for, game.js)
    return api;
  }

  // ------------------------------------------------------------ the crowd
  // the box-built crowd, for when the realistic people can't be loaded
  function boxRenderer(world, U, P) {
    const n = P.length, mesh = instanced(PERSON(), toneMaterial(U), n), A = mesh.geometry.attributes;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    mesh.userData.noRefl = true; // (out of the sea's reflection: water.js)
    world.add(mesh);
    for (let i = 0; i < n; i++) { setC(A.aC0, i, pick(SHIRTS)); setC(A.aC1, i, pick(PANTS)); setC(A.aC2, i, pick(SKIN)); setC(A.aC3, i, pick(HAIR)); }
    return {
      meshes: [mesh],
      begin() {},
      hide(i) { mesh.setMatrixAt(i, zero); },
      place(i, p, moving) {
        q.setFromAxisAngle(up, Math.PI - p.h); // models face +z; local heading is clockwise from north
        m4.compose(W(p.x, p.y, p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale));
        mesh.setMatrixAt(i, m4);
        A.aAnim.setXYZ(i, p.phase, 2.2 + p.speed * 1.6, moving ? 0.5 : 0);
        p.wave = false;
      },
      end() { mesh.instanceMatrix.needsUpdate = true; A.aAnim.needsUpdate = true; },
    };
  }
  // ------------------------------------------------------------ benches: places to sit
  // Each bench is a smart object in the sense of Unreal's Smart Objects (find, claim, use,
  // release), placed from open data the way GTA V places its scenario points: two seats, a
  // facing, and the point on a footway where a walker leaves the path for it. It advertises
  // sun or shade, as objects advertise what they offer in The Sims; game.js keeps `lit` up to
  // date and decides how much that matters today.
  function benches(flat, net, nav) {
    const list = [], byLine = new Map(), tmp = {};
    const fwd = h => [Math.sin(h), Math.cos(h)];
    const waterAhead = (x, y, h) => { const [fx, fy] = fwd(h); for (let d = 6; d <= 40; d += 4) if (nav.isWater(x + fx * d, y + fy * d)) return true; return false; };
    // a facing is better with water ahead and a wall behind, and bad facing a wall
    const score = (x, y, z, h) => {
      const [fx, fy] = fwd(h);
      return (waterAhead(x, y, h) ? 2 : 0) + (nav.walk(x - fx * 1.2, y - fy * 1.2, z).ok ? 0 : 0.5) - (nav.walk(x + fx * 1.2, y + fy * 1.2, z).ok ? 0 : 2);
    };
    // can a walker get from the footway to the seat without meeting a wall, the water or a step?
    const wayClear = (q, st) => {
      const d = Math.hypot(st.x - q.x, st.y - q.y), n = Math.max(1, Math.ceil(d / 0.5));
      for (let k = 0; k <= n; k++) {
        const w = nav.walk(q.x + (st.x - q.x) * k / n, q.y + (st.y - q.y) * k / n, st.z);
        if (!w.ok || Math.abs(w.z - st.z) > 0.6) return false;
      }
      return true;
    };
    for (let i = 0; i < flat.length / 3; i++) {
      const x = flat[3 * i] / 10, y = flat[3 * i + 1] / 10, z = flat[3 * i + 2] / 10, q = net.nearest(x, y, 12);
      let h = (i * 2.399) % Math.PI; // nowhere near a footway: any way round
      if (q) { // face the footway, or turn round to the view if there is water behind it
        net.at(q.line, q.s, tmp);
        const hp = q.d > 0.6 ? Math.atan2(q.x - x, q.y - y) : Math.atan2(tmp.hx, tmp.hy) + Math.PI / 2;
        let best = -Infinity;
        for (const [hh, base] of [[hp, q.d > 0.6 ? 1 : 0], [hp + Math.PI, 0]]) { const v = base + score(x, y, z, hh); if (v > best) { best = v; h = hh; } }
      }
      const [fx, fy] = fwd(h), b = { i, x, y, z, h, seats: [], line: -1, s: 0, lit: null };
      for (const a of [-0.42, 0.42]) b.seats.push({ x: x + Math.cos(h) * a - fx * 0.08, y: y - Math.sin(h) * a - fy * 0.08, z, h, by: -1, bench: b });
      if (q && b.seats.every(st => wayClear(q, st))) {
        b.line = q.line; b.s = q.s;
        if (!byLine.has(q.line)) byLine.set(q.line, []);
        byLine.get(q.line).push(b);
      }
      list.push(b);
    }
    let cursor = 0;
    // re-test what the benches within r of (cx, cy) offer, a few per call: test(bench) -> true (sun), false (shade) or null (night)
    function refresh(test, cx, cy, r, budget) {
      for (let k = 0; k < list.length && budget > 0; k++) {
        const b = list[cursor = (cursor + 1) % list.length];
        if (b.line < 0 || Math.abs(b.x - cx) > r || Math.abs(b.y - cy) > r) continue;
        b.lit = test(b);
        budget--;
      }
    }
    return { list, byLine, refresh, usable: byLine.size ? [...byLine.values()].reduce((a, l) => a + l.length, 0) : 0 };
  }

  // ------------------------------------------------------------ walking, stepping aside, sitting down
  // Walkers follow footway lines with a sideways offset, keeping left. They avoid each other
  // and the player as RVO and Detour Crowd do, but on the lane: each looks ahead for whoever
  // it will pass too close to within a few seconds, steps aside within the footway's width,
  // and slows to match whoever it can't get round. Benches and cars (`cars`, which traffic()
  // sets) are in the way the same way, a car as a row of discs along its length; and a walker
  // never steps into a car's footprint, a bench or another walker, but waits, and turns back
  // if the way stays blocked. A walker passing a bench with a free seat may claim it
  // (benches(), and `sitChance`, which game.js sets), walk over, sit a while, and walk on.
  // At a junction with signals (`crossings`, which game.js sets from junctions.js) a walker
  // coming up to a road its traffic may go on waits at the kerb and presses the button, and
  // crosses when the walk signal shows.
  const HORIZON = 4;   // seconds of look-ahead
  const BODY = 0.8;    // two walkers closer than this are in each other's way (m, centre to centre)
  const CLOSE = 0.56;  // a walker never steps closer than this to another (m, centre to centre): a
                       // Rocketbox body is about 0.45 m across the shoulders and its arms swing out, so
                       // two passing at this keep a hand's width between them rather than show inside each other
  const HALF = 0.3;    // a walker's own half-width, for the room it gives a bench or a post
  const KERB = 0.45;   // how far a walker keeps from a car's side or bumper (m, centre to body)
  // People under umbrellas take an umbrella's room (issue 165). A canopy is a metre across: while two walkers'
  // umbrellas are up (p.umbR, the canopy's radius as it is now, which the crowd's renderer writes: people.js) they
  // keep the two radii between them and a little more, so that canopies touch at most at their rims (where they are
  // pressed closer a taller one's rides over a shorter one's and each leans from the other: people.js lean), and
  // someone with none whose head stands as high as a neighbour's rim keeps out from under it. 0: nothing
  // more than one of the crowd gives another. It is kept between the canopies' middles, which stand a hand off the
  // body towards the holding hand (p.ucx, p.ucy from the body, in the plan; someone with none: their head). The rooms
  // below take it as distance already spent (umbGap: how far the canopies are from each other, with p stood at x, y,
  // less what an umbrella asks past the room they keep anyway), so each of them holds to it in its own way. Those
  // who walk together are left to it on the move: of two friends one carries and the other shares it (people.js
  // wantUmb), and where both carry the canopies lean apart, and stood waiting they stand an umbrella apart
  const UMB_RIM = 0.06;
  function umbRoom(p, o) {
    const a = p.umbR || 0, b = o.umbR || 0;
    if (a > 0 && b > 0) return a + b + UMB_RIM / 3;
    if (a > 0) return o.crown > p.umbRim - 0.03 ? a + 0.12 : 0;
    if (b > 0) return p.crown > o.umbRim - 0.03 ? b + 0.12 : 0;
    return 0;
  }
  const umbGap = (p, x, y, o, u, room) => Math.hypot(o.x + (o.umbR > 0 ? o.ucx : 0) - x - (p.umbR > 0 ? p.ucx : 0), o.y + (o.umbR > 0 ? o.ucy : 0) - y - (p.umbR > 0 ? p.ucy : 0)) - u + room;
  const HOT_MIN = 45;  // how near the player a walker may be put where the crowd gathers (m: lost in the crowd there)
  const SCR_HW = 3.4;  // the half-width of a scramble's crosswalk the crowd spreads across (m: Shibuya's are about 8 m wide)
  // a number from 0 to 1 for walker i's trait k, the same on every visit and drawing nothing from rnd
  const h01 = (i, k) => { let x = (Math.imul(i + 1, 374761393) + Math.imul(k, 668265263)) >>> 0; x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  const POST = 0.25;   // and from a lamp post or a trunk
  const MOVING = 1.2;  // and the seconds of a moving car's path ahead it won't step into
  const NEAR = 60, FAR = 150; // walkers farther than these from the player take a step every 2nd, 4th frame (m)
  // ground(x, y, at): the height to stand at beside the line at `at` (net.at), or null where no one can stand;
  // wall(x, y, z): is that inside a building's wall? posts: the lamp posts and trunks (streets.js), solid;
  // clear(x, y, z): whether someone standing there is clear of the walls (a facade the footway runs along)
  const WALL_LOOK = 1.5; // how far ahead a walker looks for a wall beside its line (m)
  // eye: the camera: once the game is under way nobody is put where it can see (seen, below); shut(x, y): is
  // that a place nobody is put and no footway is walked into: a subway entrance's stair well while the station
  // under it is not built (the walkers hung in the air over its stairs, went in to the dead end and came out
  // again, and new ones appeared in its mouth). A well that opens stops being shut and is walked like any footway.
  const SEEN = 170;      // beyond this a walker put on the street is a few pixels: not seen to appear (m)
  const SEEN_NEAR = 30;  // nearer than this the camera has only to turn (m)
  function crowd(world, net, U, n, radius, makeRenderer, { benches: BN = null, ground = null, wall = null, posts: PO = null, clear = null, eye = null, shut = null } = {}) {
    const P = [], tmp = {}, ahead = {};
    for (let i = 0; i < n; i++) P.push({ line: -1, s: 0, dir: 1, speed: 1.1 + rnd() * 0.6, phase: rnd() * 6.28, side: 0.6 + rnd() * 1.2, spread: rnd() * 2 - 1, lat: null, dodge: 0, v: 0, vx: 0, vy: 0,
      pause: 0, x: 0, y: 0, z: 0, h: 0, scale: 0.92 + rnd() * 0.16, state: 'walk', mode: 'ground', seat: null, t: 0, rest: rnd() * 30,
      id: i, lead: -1, mates: null, browse: 20 + rnd() * 160, // (id: its place in P; lead, mates: its walking group; browse: seconds to a stop along the way)
      // (waiting at a kerb, issue 75: room, the space it keeps from a stranger, from 0.65 to 1.05 m centre to centre (the
      // no-touch end of Fruin's queuing level D to the middle of C: a kerb at a red light, not a concourse); keen,
      // how much it wants the front row over a nearer place further back; wf, how far it stands turned from square to
      // the road, up to 25 degrees either way and mostly less. Drawn from its place in P, not from rnd, so that every
      // other draw the crowd makes is as it was)
      room: 0.65 + 0.4 * h01(i, 1), keen: 0.15 + 1.1 * h01(i, 2), wf: (h01(i, 3) + h01(i, 4) - 1) * 0.44 });
    const R = makeRenderer ? makeRenderer(P) : boxRenderer(world, U, P);
    // a point along a line and its heading (net.at), the heading turned smoothly through each bend over
    // a metre or so either side of the vertex: walkers keep their offset across the footway from it, so
    // with the bare segment's heading one well out to the side would jump round the corner in a step
    function lineAt(i, s, out) {
      net.at(i, s, out);
      const l = net.L[i], c = l.cum, pts = l.pts, n = pts.length / 3, k = out.k;
      if (!c || n < 3) return out;
      s = Math.max(0, Math.min(l.len, s));
      const v = s - c[k - 1] < c[k] - s ? k - 1 : k;
      if (v <= 0 || v >= n - 1) return out;
      const R = Math.min(1.5, (c[v] - c[v - 1]) / 2, (c[v + 1] - c[v]) / 2), d = s - c[v];
      if (!(R > 0.05) || Math.abs(d) >= R) return out;
      let ax = pts[3 * v] - pts[3 * v - 3], ay = pts[3 * v + 1] - pts[3 * v - 2], bx = pts[3 * v + 3] - pts[3 * v], by = pts[3 * v + 4] - pts[3 * v + 1];
      const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1, f = (d + R) / (2 * R);
      ax = ax / la * (1 - f) + bx / lb * f; ay = ay / la * (1 - f) + by / lb * f;
      const h = Math.hypot(ax, ay);
      if (h > 1e-3) { out.hx = ax / h; out.hy = ay / h; }
      return out;
    }
    function release(p) { if (p.seat) { p.seat.by = -1; p.seat = null; } }
    // can the camera see someone standing at (x, y, z)? Near it, or ahead of it and within sight with no
    // building between (the walls, sampled along the line from the eye to the walker's head)
    const look = new THREE.Vector3();
    function seen(x, y, z, cone = 0.2) {
      if (!eye) return false;
      const ex = eye.position.x, ey = -eye.position.z, ez = eye.position.y, dx = x - ex, dy = y - ey, d = Math.hypot(dx, dy); // (sim y is -z)
      if (d > SEEN) return false;
      if (d < SEEN_NEAR) return true;
      eye.getWorldDirection(look);
      const h = Math.hypot(look.x, look.z); // (looking down from high up, all round it)
      if (h > 0.3 && (dx * look.x - dy * look.z) / (d * h) < cone) return false;
      if (!wall) return true;
      const k = Math.ceil(d / 2.5), dz = z + 1.5 - ez;
      for (let i = 1; i < k; i++) if (wall(ex + dx * i / k, ey + dy * i / k, ez + dz * i / k)) return false;
      return true;
    }
    // a footway that leads into a place that is shut (most of it there, or a short one that ends there), or that runs
    // through a wall the model has where the map's line has a passage (a station's facade over a way into it): walked,
    // it put walkers through the wall, where the player is stopped and the player's routes are cut (route.js)
    const shutLines = new Map();
    function shutLine(li) {
      if (!shut && !wall) return false;
      let v = shutLines.get(li);
      if (v !== undefined) return v;
      const l = net.L[li], k = Math.max(2, Math.ceil(l.len)), q = {};
      let inside = 0, end = false;
      if (shut) for (let i = 0; i <= k; i++) { net.at(li, l.len * i / k, q); if (shut(q.x, q.y)) { inside++; if (i === 0 || i === k) end = true; } }
      let cut = false;
      if (wall) for (let d = 0.5; d < l.len - 0.5 && !cut; d += 0.5) { net.at(li, d, q); cut = wall(q.x, q.y, q.z); }
      v = cut || inside > (k + 1) / 2 || (end && l.len < 12);
      shutLines.set(li, v);
      return v;
    }
    function respawn(p, cx, cy, rMin, rMax = radius) { // (rMax: no farther off than that, out of sight still: one held on a footway, walk())
      release(p);
      if (p.lead >= 0 || p.mates) partGroup(p);
      p.stop = null; p.stopFace = null; p.arrived = 0; p.reg = null; if (p.look0) { p.look = p.look0; p.look0 = null; }
      if (p.pz) { if (p.gc) { p.gc.n--; p.gc = null; } p.pz = p.g = null; } // (off a scramble's kerbs, taken off its gate's count)
      p.fx = p.gx = p.av = null; p.moving = false; // (somewhere new: nothing of the pace or the way it went before)
      p.state = 'walk'; p.mode = 'ground'; p.lat = null; p.side = 0.6 + rnd() * 1.2; p.kerbNext = null; p.kerbBack = false;
      // (a share of them where the crowd gathers, api.hot: a scramble; out of the player's way there)
      const H = api.hot && api.hot.filter(h => Math.hypot(h.x - cx, h.y - cy) < radius);
      // (one of them by its share: a quay's promenade with twice the share of a side square gets twice the walkers)
      let hot = null;
      if (H && H.length) { let r = rnd(); for (const h of H) if ((r -= h.share) < 0) { hot = h; break; } }
      // (with the game under way, rMin > 0, only where the camera cannot see: a walker comes into view on foot, from
      // round a corner or from far off, and where the crowd gathers in the player's sight it is those who fill it)
      const unseen = rMin > 0 && !!eye;
      p.line = -1;
      if (hot && rMax >= radius && place(p, net.near(hot.x, hot.y, 0, hot.r).filter(i => near1(net.L[i], hot.x, hot.y, hot.r)), 8, cx, cy, hot, Math.min(rMin, HOT_MIN), unseen)) { formGroup(p, unseen); return; }
      if (place(p, net.near(cx, cy, rMin, rMax), rMax < radius ? 8 : 4, cx, cy, null, 0, unseen)) formGroup(p, unseen);
    }
    function place(p, cand, tries, cx, cy, hot, rMe, unseen) {
      for (let k = 0; k < tries && cand.length; k++) { // somewhere clear of the cars and benches
        const line = cand[Math.floor(rnd() * cand.length)], s = rnd() * net.L[line].len;
        let dir = rnd() < 0.5 ? 1 : -1;
        if (inPocket(line)) continue; // (on a footway that leads somewhere, and the way along it that does: issue 168)
        const ahead = wayReach(line, dir) - (dir > 0 ? s : net.L[line].len - s), behind = wayReach(line, -dir) - (dir > 0 ? net.L[line].len - s : s);
        if (ahead < LEAD) { if (behind < LEAD) continue; dir = -dir; }
        lineAt(line, s, tmp);
        const x = tmp.x - tmp.hy * dir * p.side, y = tmp.y + tmp.hx * dir * p.side;
        if (hot && (Math.hypot(x - hot.x, y - hot.y) > hot.r || Math.hypot(x - cx, y - cy) < rMe)) continue;
        if ((shut && shut(x, y)) || shutLine(line)) continue; // (not in a subway entrance's stair well)
        // (with a margin: a little outside the view's edge, and hidden at the footway's line too, where its first steps
        // may take it; on an open square a walker put at the very edge of sight was in it a step later)
        if (unseen && (seen(x, y, tmp.z, 0.05) || seen(tmp.x, tmp.y, tmp.z, 0.05))) continue;
        const X = api.crossings && api.crossings.byLine.get(line);
        if (X && X.some(q => Math.abs(q.s - s) < q.kerb + 0.5)) continue; // (not out in a road at a crossing)
        if (api.crossings && api.crossings.major && api.crossings.road && api.crossings.road(tmp.x, tmp.y) && api.crossings.major(tmp.x, tmp.y)) continue; // (nor out in a major road)
        gather(x, y, p, true, tmp.z);
        if (blocked(x, y) > 0 || (wall && wall(x, y, tmp.z)) || crowded(x, y, p, CLOSE + 0.1)) continue;
        p.line = line; p.s = s; p.dir = dir;
        // (known to those placed after it in this step: when the whole crowd is put out at once, the opening or a cut to
        // another hour, each was tested against a street still empty, and two could be put inside each other)
        if (p.hashed !== stepNo) {
          const i = P.indexOf(p);
          if (i >= 0) { p.x = x; p.y = y; p.z = tmp.z; const k = bucket(Math.floor(x / CELL), Math.floor(y / CELL)); chain[i] = head[k]; head[k] = i; p.hashed = stepNo; }
        }
        return true;
      }
      return false;
    }
    let opened = false, stepNo = 0; // (stepNo: the update under way, for the neighbours' hash) // (has the crowd taken its first step: update)
    const api = { R, P, active: n, benches: BN, cars: null, sitChance: () => 0, crossings: null, kerbWait: 0, kerbWaits: [], fresh: 0, hot: null, plazas: null, muster, bodies: null };
    // where footway li steps off the kerb onto a road with no crossing marked there, each way along it
    // ({ s, dir, x, y }): found the first time a walker is on it, a metre at a time (crossings.road, from
    // game.js, says what is carriageway; crossings.zebra, a zebra's stripes, where the cars give way instead)
    const entries = new Map();
    function roadEntries(li) {
      let E = entries.get(li);
      if (E) return E;
      E = [];
      const l = net.L[li], C = api.crossings, n = Math.max(1, Math.ceil(l.len));
      let was = null;
      for (let k = 0; k <= n; k++) {
        const s = Math.min(l.len, k * l.len / n);
        net.at(li, s, tmp);
        const on = !!C.road(tmp.x, tmp.y);
        // (a footway that crosses the road there, not one along the kerb that dips into the carriageway's edge)
        if (was !== null && on !== was && !(C.zebra && C.zebra(tmp.x, tmp.y)) && (!C.across || C.across(tmp.x, tmp.y, tmp.hx, tmp.hy))) E.push({ s, dir: on ? 1 : -1, x: tmp.x, y: tmp.y, major: !!(C.major && C.major(tmp.x, tmp.y)) });
        was = on;
      }
      // (a footway that lies out in a major road its whole length, never stepping off a kerb, a crossing mapped as a
      // footway without its signals or stripes: crossed away from a crosswalk all the same; Tetsugaku's footway 952
      // in a secondary road, where walkers stood in the road)
      const all = was && E.length === 0 && C.major && (() => { net.at(li, l.len / 2, tmp); return !!C.road(tmp.x, tmp.y) && !!C.major(tmp.x, tmp.y) && !(C.zebra && C.zebra(tmp.x, tmp.y)); })();
      if (all && !(C.byLine && (C.byLine.get(li) || []).length)) { E.push({ s: 0, dir: 1, x: tmp.x, y: tmp.y, major: true }, { s: l.len, dir: -1, x: tmp.x, y: tmp.y, major: true }); }
      // (a major road, C.major: crossed only at a crosswalk, its signals or a zebra, as the law asks where one
      // is near (Japan's Road Traffic Act, art. 12; the UK's Highway Code, rule 8) and as a city's crowd does;
      // where the footway's step off the kerb is a signalled junction's own crossing, it is that crossing)
      const X = C.byLine && C.byLine.get(li);
      for (const e of E) if (e.major && X && X.some(x => Math.abs(x.s - e.s) < x.kerb + 2.5)) e.major = false;
      E.banned = [E.some(e => e.major && e.dir === -1), E.some(e => e.major && e.dir === 1)]; // (walking against, along the line)
      if (entries.size > 3000) entries.clear(); // (only the footways walked near you are kept)
      entries.set(li, E);
      return E;
    }
    // is a car (of the traffic, your car or a ride) coming that would reach (x, y) within 3.5 s?
    function carComing(x, y, z) {
      let yes = false;
      api.cars.near(x, y, 35, o => {
        if (yes || (o.v || 0) < 0.8) return;
        const fx = Math.sin(o.h), fy = Math.cos(o.h), dx = x - o.x, dy = y - o.y, a = dx * fx + dy * fy;
        if (a < -o.half || Math.abs(-dx * fy + dy * fx) > (o.hw || 0.9) + 1.6) return;
        if ((a - o.half) / o.v < 3.5) yes = true;
      }, z);
      return yes;
    }
    const near1 = (l, x, y, r) => { for (let k = 0; k < l.pts.length; k += 3) if (Math.hypot(l.pts[k] - x, l.pts[k + 1] - y) < r) return true; return false; };
    // would a walker set off at s along line `line` heading `dir` be out in a road at a crossing
    // whose walk isn't on (or, at a scramble, too short for it to reach the far kerb)? Then its button is pressed
    function heldAt(line, s, dir, p) {
      const C = api.crossings, X = C && C.byLine.get(line);
      if (!X) return false;
      for (const x of X) {
        const d = Math.abs(x.s - s);
        if (d >= x.kerb) continue;
        const far = (x.s - s) * dir + x.kerb;
        if (x.at && toPlaza(p, x.at)) return 'plaza';
        if (!C.walk(x.a) || (x.scramble && C.walkLeft(x.a) < far / (p.speed * 0.65))) { C.call(x.a); return true; }
      }
      return false;
    }
    // where a walker goes on at the end of its line: any way on, and near a place the crowd gathers
    // (api.hot), more often the way towards it, so that the crowd stays thick there
    // a way on that doesn't lead across a major road away from a crossing (roadEntries): a few tries, or none
    function nextOk(line, end) {
      if (!WAYS.reach) { // (the ways not yet weighed: any way on that is not banned, a few tries)
        let o = null;
        for (let k = 0; k < 6; k++) {
          o = net.next(line, end);
          if (!o || !banned(o[0], o[1] === 0 ? 1 : -1)) return o;
        }
        return null;
      }
      // a way on that leads somewhere: of the ways that meet here, those that go on LEAD metres or more without an
      // end (each as likely as another), else the one that goes on farthest if that is at least SHORT_WAY, else none
      const l = net.L[line], k = end ? l.pts.length / 3 - 1 : 0, av = net.avoid, R = WAYS.reach;
      let n = 0, pick = null, far = null, farR = SHORT_WAY;
      for (const q of net.nodes.get(net.key(l.pts[3 * k], l.pts[3 * k + 1])) || []) {
        if (q[0] === line || (av && av[q[0]])) continue;
        const r = R[2 * q[0] + (q[1] === 0 ? 1 : 0)];
        if (r >= LEAD) { if (rnd() * ++n < 1) pick = q; } else if (r >= farR) { farR = r; far = q; }
      }
      return pick || far;
    }
    // Ways that lead somewhere (issue 168). Two men under the deck east of the Scramble walked a few metres one way,
    // turned, and walked back, again and again. A walker who turns back on themselves is one whose way is closed, and
    // measured over the level (tools/crowd_pacing.js: 17:59, two minutes from under that deck) 54 of 263 walkers
    // did it, at 31 places. Three causes, each in the way and not in the walker:
    //  - footways that met without a node (join, above): 1,418 ends that ended nowhere now go on;
    //  - pieces the walls and the roads cut off from everything else (a stub under a deck, between two piers): on
    //    one of those every way is closed. A set of footways joined to each other that comes to less than POCKET
    //    metres is a pocket: nobody is put on one, and whoever comes to be on one (off a bus, up from a bench) stands
    //    where they are and is somewhere else once nobody is looking;
    //  - an end with no way on, and a major road with no crossing: a walker went into a short way that only led to
    //    one, turned at it, and at its other end turned again. Each way (a line, and a direction along it) now knows
    //    how far it leads without an end (reach: its own length and the farthest of the ways on from its end, up
    //    to REACH_CAP; 0 where it steps into a major road with no crossing or is shut), and a walker choosing a way
    //    on, or put on a footway, takes one that leads on (nextOk, place). At an end all the same, they have
    //    arrived (arrive): out of sight they are somewhere else; in sight they stop there as a person does who has
    //    got where they were going (a phone out, three in ten: the renderer's standing clips) and after a while walk
    //    back the way they came, once.
    // What it costs: the bans are read a little each step (half a millisecond) until every line has been looked at,
    // a few seconds into the game, then one pass; four bytes a way and one a line are kept. Until then a walker
    // chooses as before.
    const AGAIN = 20, POCKET = 60, LEAD = 40, SHORT_WAY = 12, REACH_CAP = 160, WAYS = { reach: null, pocket: null, k: 0, ban: null };
    const wayReach = (li, dir) => (WAYS.reach ? WAYS.reach[2 * li + (dir > 0 ? 1 : 0)] : REACH_CAP);
    const inPocket = li => !!(WAYS.pocket && WAYS.pocket[li]);
    function waysStep() {
      if (WAYS.reach || !api.crossings) return;
      const L = net.L, n = L.length, t0 = performance.now();
      if (!WAYS.ban) WAYS.ban = new Uint8Array(2 * n);
      const ban = WAYS.ban;
      for (; WAYS.k < n; WAYS.k++) {
        if ((WAYS.k & 7) === 0 && performance.now() - t0 > (api.waysMs || 0.5)) return;
        const li = WAYS.k, av = net.avoid && net.avoid[li];
        ban[2 * li] = av || banned(li, -1) ? 1 : 0; ban[2 * li + 1] = av || banned(li, 1) ? 1 : 0;
      }
      const endKey = (li, e) => { const l = L[li], k = e ? l.pts.length / 3 - 1 : 0; return net.key(l.pts[3 * k], l.pts[3 * k + 1]); };
      // the pockets: the footways joined to each other (at their ends, whatever is banned), and how much each set is
      const set = new Int32Array(n).fill(-1), setLen = [], pocket = new Uint8Array(n);
      for (let r = 0; r < n; r++) {
        if (set[r] >= 0) continue;
        const id = setLen.length, q = [r];
        let len = 0;
        set[r] = id;
        while (q.length) { const li = q.pop(); len += L[li].len; for (const e of [0, 1]) for (const o of net.nodes.get(endKey(li, e)) || []) if (set[o[0]] < 0) { set[o[0]] = id; q.push(o[0]); } }
        setLen.push(len);
      }
      let pockets = 0, pocketM = 0;
      for (let li = 0; li < n; li++) if (setLen[set[li]] < POCKET) { pocket[li] = 1; pockets++; pocketM += L[li].len; }
      // how far each way leads: its own length and the farthest of the ways on from its end, to a fixed point
      const N = 2 * n, reach = new Float32Array(N), succ = new Array(N);
      for (let li = 0; li < n; li++) for (let d = 0; d < 2; d++) {
        const st = 2 * li + d, out = [];
        if (!ban[st] && !pocket[li]) for (const q of net.nodes.get(endKey(li, d)) || []) { const o = 2 * q[0] + (q[1] === 0 ? 1 : 0); if (q[0] !== li && !ban[o]) out.push(o); }
        succ[st] = out;
        reach[st] = ban[st] || pocket[li] ? 0 : Math.min(REACH_CAP, L[li].len);
      }
      for (let pass = 0, moved = true; moved && pass < 60; pass++) {
        moved = false;
        for (let st = 0; st < N; st++) {
          if (ban[st] || pocket[st >> 1] || reach[st] >= REACH_CAP) continue;
          let far = 0;
          for (const o of succ[st]) if (reach[o] > far) far = reach[o];
          const r = Math.min(REACH_CAP, L[st >> 1].len + far);
          if (r > reach[st] + 0.01) { reach[st] = r; moved = true; }
        }
      }
      WAYS.reach = reach; WAYS.pocket = pocket; WAYS.ban = null;
      let short = 0;
      for (let st = 0; st < N; st++) if (reach[st] < LEAD) short++;
      api.ways = { reach, pocket, lines: n, pockets, pocketM: Math.round(pocketM), shortWays: short, allM: Math.round(L.reduce((a, l) => a + l.len, 0)) }; // (for the checks)
    }
    const banned = (li, dir) => { if (shutLine(li)) return true; const C = api.crossings; if (!C || !C.road || !C.major) return false; const B = roadEntries(li).banned; return !!(B && B[dir > 0 ? 1 : 0]); };
    function onward(p, end) {
      let nx = nextOk(p.line, end);
      const h = nx && api.hot && api.hot.find(q => Math.hypot(p.x - q.x, p.y - q.y) < q.r * 1.6);
      if (h && rnd() < h.pull) {
        const far = o => { const l = net.L[o[0]], k = o[1] === 0 ? l.pts.length - 3 : 0; return Math.hypot(l.pts[k] - h.x, l.pts[k + 1] - h.y); };
        let best = null, bd = Math.hypot(p.x - h.x, p.y - h.y) - 2; // (only a way that does lead nearer: no back and forth in a pocket)
        for (let k = 0; k < 4; k++) { const o = nextOk(p.line, end), d = o && far(o); if (o && d < bd) { best = o; bd = d; } }
        if (best) nx = best;
      }
      return nx;
    }
    // a crowd gathered somewhere at once (the scramble as the game opens on its walk): each of `spots`
    // ({ line, s, dir, side: its place across the footway, m }) takes the walker farthest from (cx, cy), placed on the next step
    function muster(spots, cx, cy) {
      const order = P.slice(0, api.active).map((q, i) => [i, q.line < 0 ? 1e9 : Math.hypot(q.x - cx, q.y - cy)]).sort((a, b) => b[1] - a[1]);
      // spaced out: a spot within a body's width of one already taken moves along or across a little,
      // or is dropped, so no two of the gathered crowd stand inside each other
      const taken = [], at = (sp, o) => { lineAt(sp.line, Math.max(0, Math.min(net.L[sp.line].len, sp.s + o[0])), tmp); const sd = (sp.side ?? 1) + o[1]; return [tmp.x - tmp.hy * sp.dir * sd, tmp.y + tmp.hx * sp.dir * sd]; };
      const OFF = [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [0.6, 0.6], [-0.6, -0.6], [1.2, 0], [-1.2, 0]];
      spots = spots.map(sp => {
        for (const o of OFF) {
          const xy = at(sp, o);
          if (taken.some(t => Math.hypot(t[0] - xy[0], t[1] - xy[1]) < CLOSE + 0.08)) continue;
          taken.push(xy);
          return Object.assign({}, sp, { s: sp.s + o[0], side: (sp.side ?? 1) + o[1] });
        }
        return null;
      }).filter(Boolean);
      spots.slice(0, order.length).forEach((sp, k) => {
        const q = P[order[k][0]];
        release(q);
        // (one of a scramble's own crowd is taken off it: left on it, the scramble's step went on walking it from its
        // new place straight to the spot it had been making for, through whatever stood between, #1)
        if (q.pz) { uncount(q); q.pz = q.g = null; }
        partGroup(q); q.stop = null; q.stopFace = null;
        q.state = 'walk'; q.mode = 'ground'; q.lat = null; q.side = sp.side ?? 0.3 + rnd() * 1.4; q.pause = 0; q.still = 0; q.wait = 0;
        q.line = sp.line; q.s = Math.max(0, Math.min(net.L[sp.line].len, sp.s)); q.dir = sp.dir;
        lineAt(q.line, q.s, tmp); q.x = tmp.x; q.y = tmp.y; q.z = tmp.z; // (walk() puts it beside the line)
      });
      return Math.min(spots.length, order.length);
    }
    // the benches as obstacles: for each 4 m cell, those in it and the cells round it
    const benchAt = new Map(), bkey = (cx, cy) => (cx + 8192) * 16384 + cy + 8192; // a small integer key, for speed
    if (BN) for (const b of BN.list) for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) {
      const k = bkey(Math.floor(b.x / 4) + a, Math.floor(b.y / 4) + c);
      if (!benchAt.has(k)) benchAt.set(k, []);
      benchAt.get(k).push(b);
    }
    // the cars, benches and posts near a walker: the benches each step, the cars and posts every
    // other (a little farther out; where the cars are is read as they move)
    const none = [];
    let nearBenches = none, nearCars = none, nearPosts = none;
    const addCar = o => { nearCars.push(o); }, addPost = o => { if (o.kind !== 'signal') nearPosts.push(o); }; // (not the junctions' poles: solid for the cars, but a walker steering round a walk signal's post at the kerb, where the crossing begins, is pushed out into the road and stands in the traffic's way)
    function gather(x, y, q, fresh, z) { // (z: the cars on that level, not on a deck over it or a street under it)
      nearBenches = benchAt.size ? benchAt.get(bkey(Math.floor(x / 4), Math.floor(y / 4))) || none : none;
      nearCars = q.cars || (q.cars = []);
      nearPosts = q.posts || (q.posts = []);
      if (!fresh) return;
      nearCars.length = 0; nearPosts.length = 0;
      if (api.cars) api.cars.near(x, y, 10, addCar, z);
      if (PO) PO.near(x, y, 3, addPost, z);
    }
    // how deep (x, y) is in those benches, posts and cars' footprints and the paths the moving
    // ones are about to take, each grown by the room a walker keeps: 0 when clear
    function blocked(x, y, benches = true, posts = true) {
      let deep = 0;
      if (posts) for (const o of nearPosts) { const e = o.r + POST - Math.hypot(x - o.x, y - o.y); if (e > 0) deep += e; }
      if (benches) for (const bn of nearBenches) {
        const fx = Math.sin(bn.h), fy = Math.cos(bn.h), dx = x - bn.x, dy = y - bn.y;
        const ea = 0.22 + 0.25 - Math.abs(dx * fx + dy * fy), eb = 0.85 + 0.25 - Math.abs(-dx * fy + dy * fx);
        if (ea > 0 && eb > 0) deep += Math.min(ea, eb);
      }
      for (const o of nearCars) {
        const fx = Math.sin(o.h), fy = Math.cos(o.h), dx = x - o.x, dy = y - o.y, a = dx * fx + dy * fy;
        const ea = Math.min(a + o.half + KERB, o.half + KERB + o.v * MOVING - a), eb = o.hw + KERB - Math.abs(-dx * fy + dy * fx);
        if (ea > 0 && eb > 0) deep += Math.min(ea, eb);
      }
      return deep;
    }
    // neighbours: a spatial hash of 3 m cells (bucket heads and a next-in-bucket chain)
    const CELL = 3, NB = 4096, head = new Int32Array(NB), chain = new Int32Array(n);
    const bucket = (cx, cy) => ((cx * 73856093) ^ (cy * 19349663)) & (NB - 1);
    // what agent p does about another body at (ox, oy) moving at (ovx, ovy): sets push (sideways, + = left) and cap (speed)
    let p = null, hx = 0, hy = 0, push = 0, cap = 0;
    // the walker it slows for (seeJ: whose body see() is looking at, -1 for anything else): its index,
    // how far ahead and how far across (+ = to the left) it is
    let seeJ = -1, blk = -1, blkAhead = 0, blkLat = 0;
    function see(ox, oy, ovx, ovy, rr, w) {
      const dx = ox - p.x, dy = oy - p.y, d2 = dx * dx + dy * dy;
      if (d2 > 36) return;
      const wx = p.vx - ovx, wy = p.vy - ovy, w2 = wx * wx + wy * wy; // closing velocity
      let t = w2 > 1e-4 ? (dx * wx + dy * wy) / w2 : 0;             // time of closest approach
      if (t < 0) { if (d2 >= rr * rr) return; t = 0; }
      t = Math.min(t, HORIZON); // someone gaining slowly is still in the way
      const cx = dx - wx * t, cy = dy - wy * t, c = Math.hypot(cx, cy);
      if (c >= rr) return;
      const u = (1 - c / rr) * Math.min(1, 1.5 / (t + 0.5)) * w; // the sooner, the stronger
      // step away from the side it is on now (judged by where it will be, both would mirror each
      // other's sidestep and cross into each other); dead ahead, pass on the right
      const now = dx * -hy + dy * hx, then = cx * -hy + cy * hx;
      push += (Math.abs(now) > 0.05 ? now : then) > 0 ? -u : u;
      const ahead = dx * hx + dy * hy;
      // slow for it only on a course that would really meet it: another walker it will pass a body's
      // width clear of it steps round (push) without braking
      if (ahead > 0 && (seeJ < 0 || c < CLOSE + 0.12)) {
        const v = Math.max(0, ovx * hx + ovy * hy) + Math.max(0, ahead - (seeJ < 0 ? rr : CLOSE + 0.12)) * 0.8;
        if (v < cap) { cap = v; if (seeJ >= 0) { blk = seeJ; blkAhead = ahead; blkLat = now; } }
      }
    }
    // how close the nearest other walker (or the player, given a little more room) is to
    // (x, y), up to CLOSE (of the nn neighbours walk() found)
    const nbr = new Int32Array(n);
    let nn = 0;
    // (one of its own group, and anyone while it squeezes through a knot, is passed a turn of the shoulder closer: to 0.4 m
    // centre to centre. A leader and its mate a step ahead of it, each at CLOSE from the other's next step, stood a minute
    // waiting on each other, and two groups met head on on a footway stood jammed for minutes, issue 85)
    const SHOULDER = 0.16;
    function closest(x, y, player) {
      let best = player ? Math.min(CLOSE, Math.hypot(player.x - x, player.y - y) - (player.r || 0.15)) : CLOSE;
      const sq = p.squeeze > 0 ? SHOULDER : 0;
      for (let k = 0; k < nn; k++) {
        const o = P[nbr[k]], dx = o.x - x, dy = o.y - y, mate = mateOf(p, o);
        if (Math.abs(dx) < best && Math.abs(dy) < best) best = Math.min(best, Math.hypot(dx, dy) + (mate ? SHOULDER : sq));
        if (!mate && (p.umbR > 0 || o.umbR > 0)) { const u = umbRoom(p, o); if (u > CLOSE) best = Math.min(best, umbGap(p, x, y, o, u, CLOSE) + sq); } // (an umbrella's room, issue 165)
      }
      return keepRoom(x, y, best);
    }
    // those standing among the crowd who are not of it (api.bodies, set by game.js each frame: the story's people, the
    // living and the afterimages, the guide as the length of his spine, the map's NPCs): each a segment
    // { ax, ay, bx, by, r }, r the room it needs past what one of the crowd gives another. The crowd keeps clear of them
    // as it keeps clear of the player and of each other: no place to wait is given on one, no walker steers into one,
    // and no step is taken inside one. The crowd took none of them for a body: a waiter's place at the Scramble's kerb
    // fell on Sumiko, and a young woman with an umbrella stood inside her for the whole of the summation (issue 65)
    let K = [];
    // the lens on foot (issue 82): the chase camera stands a few metres behind and above the player, and someone walking
    // a pace beside it or in front of it filled a corner of a phone's upright frame, though not between it and the
    // player. As the talk camera's shots keep the crowd out of their way, the walkers keep out of the lens's: a segment
    // from where it stands to a pace and a half along the way it looks, gone round as one of those not of the crowd is
    // (KW: K and it, for walk()'s steering only; nobody is put out of it at once, nor refused a place to wait by it)
    // The lens's room (issue 129): whoever of the crowd comes within 2 m of the lens, from it to their middle, is out of
    // the picture, whole (game.js lensClear: 1.3 m from under a lens 2.5 m up), and back 2.3 m off (1.75 m). So that it
    // is rare, the room the walkers give the lens is that and a little more (r 0.75: 1.85 m from the segment, where it
    // was 1.55), and those stood waiting make room for it too, a step, once it has come to rest by them (still: under
    // half a metre a second for half a second; a lens swung round you is past before anyone could move for it)
    let LN = null, KW = K;
    const lensAt = { x: 0, y: 0, z: 0, fx: 0, fy: 0 }, lensSeg = { ax: 0, ay: 0, bx: 0, by: 0, r: 0.75, lens: true, still: 0 };
    function lensUpdate(player, dt) {
      LN = null;
      const lx0 = lensAt.x, ly0 = lensAt.y;
      if (!player || !R.lens || !R.lens(lensAt)) return;
      const dx = lensAt.x - player.x, dy = lensAt.y - player.y, d = Math.hypot(dx, dy), up = lensAt.z - (player.z || 0), fl = Math.hypot(lensAt.fx, lensAt.fy);
      if (d < 0.8 || d > 9 || up > 4.5 || up < -1 || fl < 0.2) return; // (on foot, behind the player: not a view from the air, through someone's eyes, or a car's)
      lensSeg.ax = lensAt.x; lensSeg.ay = lensAt.y; lensSeg.bx = lensAt.x + lensAt.fx / fl * 1.5; lensSeg.by = lensAt.y + lensAt.fy / fl * 1.5;
      lensSeg.still = dt > 0 && Math.hypot(lensAt.x - lx0, lensAt.y - ly0) < 0.5 * dt ? Math.min(1, lensSeg.still + dt) : 0;
      LN = lensSeg;
    }
    const kp = { x: 0, y: 0 };
    function keepPt(k, x, y) { // the point of k nearest (x, y), into kp
      const dx = k.bx - k.ax, dy = k.by - k.ay, L2 = dx * dx + dy * dy, t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - k.ax) * dx + (y - k.ay) * dy) / L2)) : 0;
      kp.x = k.ax + dx * t; kp.y = k.ay + dy * t;
      return kp;
    }
    // the nearest of them to q, the player among them, when q is within `min` of it past its room: { x, y, r } (into ko),
    // else null. Used to step q out at once where it has come to be inside someone: the player put down on a waiter, a
    // story's person placed among the crowd (issue 65)
    const ko = { x: 0, y: 0, r: 0 };
    function keepIn(q, player, min) {
      let bd = min;
      ko.r = -1;
      if (player) { const r = player.r || 0.15, d = Math.hypot(q.x - player.x, q.y - player.y) - r; if (d < bd) { bd = d; ko.x = player.x; ko.y = player.y; ko.r = r; } }
      for (let j = 0; j < K.length; j++) {
        const k = K[j], m = bd + k.r + 1.5;
        if (Math.abs(k.ax - q.x) > m || Math.abs(k.ay - q.y) > m) continue;
        keepPt(k, q.x, q.y);
        const d = Math.hypot(kp.x - q.x, kp.y - q.y) - k.r;
        if (d < bd) { bd = d; ko.x = kp.x; ko.y = kp.y; ko.r = k.r; }
      }
      return ko.r < 0 ? null : ko;
    }
    function keepRoom(x, y, best) { // the room from (x, y) to the nearest of them past its own (distance less r), up to best
      for (let j = 0; j < K.length; j++) {
        const k = K[j], m = best + k.r + 1.5;
        if (Math.abs(k.ax - x) > m || Math.abs(k.ay - y) > m) continue;
        keepPt(k, x, y);
        const e = Math.hypot(kp.x - x, kp.y - y) - k.r;
        if (e < best) best = e;
      }
      return best;
    }
    // whether any other walker (on the ground, walking or sitting) is within r of (x, y): the
    // neighbour hash as this step began, for those placed or moved outside walk()
    function crowded(x, y, self, r) {
      const c0 = Math.floor(x / CELL), r0 = Math.floor(y / CELL);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        // (n: a walker put in the hash twice between two steps, as an overture's placing of the same one again and again
        // does, closes its chain into a ring; the walk along it ends at the crowd's size, where it hung the page)
        for (let j = head[bucket(c0 + a, r0 + b)], n = 0; j >= 0 && n <= P.length; j = chain[j], n++) {
          const o = P[j];
          if (o !== self && o.line >= 0 && Math.abs(o.x - x) < r && Math.abs(o.y - y) < r && Math.hypot(o.x - x, o.y - y) < r) return true;
        }
      }
      return false;
    }
    function seeCar(o) { // a row of discs along the car, each as wide as the car
      const fx = Math.sin(o.h), fy = Math.cos(o.h), k = Math.max(1, Math.round(o.half / o.hw)), r = o.hw + KERB;
      for (let j = 0; j < k; j++) {
        const u = k === 1 ? 0 : -o.half + o.hw + (2 * o.half - 2 * o.hw) * j / (k - 1);
        see(o.x + fx * u, o.y + fy * u, fx * o.v, fy * o.v, r, 1.4);
      }
    }
    // walker q, beside the line at tmp: on the ground drawn there; off the bank of the water, closer in to the line
    function settle(q) {
      for (let k = 0; (ground || wall) && k < 3; k++) {
        const z = ground ? ground(q.x, q.y, tmp) : tmp.z;
        if (z != null && !(wall && k < 2 && wall(q.x, q.y, z))) { q.z = z; break; } // (in a wall beside the line: closer in)
        q.lat = k < 1 ? q.lat / 2 : 0;
        if (z != null) q.side = Math.max(0.3, Math.min(q.side, Math.abs(q.lat))); // and keep in from that wall
        q.x = tmp.x - q.hy * q.lat; q.y = tmp.y + q.hx * q.lat;
      }
    }
    // the offset nearest `want` (sideways from the line, + = left of the way it walks) that keeps a walker
    // out of the walls here and WALL_LOOK ahead: tried from `want` in 0.2 m steps in to the line, then out
    // the other side; `want` itself where nowhere is clear (the line grazing a corner). walk() moves the
    // walker's offset towards it no faster than a sidestep, so it closes in on a facade, never jumps
    function wallFree(q, want, hw) {
      if (!clear) return want;
      lineAt(q.line, Math.max(0, Math.min(net.L[q.line].len, q.s + q.dir * WALL_LOOK)), ahead);
      const ok = lat => {
        for (const a of [tmp, ahead]) {
          const hx = a.hx * q.dir, hy = a.hy * q.dir, x = a.x - hy * lat, y = a.y + hx * lat, z = ground ? ground(x, y, a) : a.z;
          if (z == null || !clear(x, y, z)) return false;
        }
        return true;
      };
      if (ok(want)) return want;
      const sg = want >= 0 ? 1 : -1;
      for (let l = want - sg * 0.2; l * sg > 0; l -= sg * 0.2) if (ok(l)) return l;
      for (let l = 0; Math.abs(l) <= hw + 1e-6; l -= sg * 0.2) if (ok(l)) return l;
      return want;
    }
    function backTo(q) { // the point on the footway a walker returns to from a bench
      q.dir = rnd() < 0.5 ? 1 : -1;
      lineAt(q.line, q.s, tmp);
      q.back = { x: tmp.x - tmp.hy * q.dir * q.side, y: tmp.y + tmp.hx * q.dir * q.side, z: tmp.z };
    }
    // ------------------------------------------------ a scramble's own crowd
    // api.plazas (game.js, from junctions.js): per scramble { x, y, spans: its crosswalks kerb to kerb
    // [ax, ay, az, bx, by, bz], walk(), left() }. Near the player a share of the crowd is the
    // scramble's: massed on the pavement behind the kerbs where its crosswalks land, deeper the more
    // wait, each stepping out when the walk comes on (a moment's reaction, the front rows first, and
    // only with the time to make the far kerb); then out across the broad stripes to the far side,
    // the diagonal too, free in the road as the real crowd is: not in single file but weaving
    // through those coming the other way, a little to the left as they meet, so that lanes form as
    // they do in any thick crossing flow (Helbing and Molnar's social forces). On the far side it
    // strolls to a kerb of that corner and waits again; away from the player it goes back to the footways.
    const PLAZA_SHARE = 0.3, PLAZA_R = 0.8; // (of the crowd; within this share of its radius of the player)
    function gatesOf(pz) {
      if (pz.gates) return pz.gates;
      const G = [];
      for (const w of pz.spans) {
        const len = Math.hypot(w[3] - w[0], w[4] - w[1]);
        if (len < 4) continue;
        const ux = (w[3] - w[0]) / len, uy = (w[4] - w[1]) / len;
        const a = { x: w[0], y: w[1], z: w[2], ox: -ux, oy: -uy, len, n: 0 }, b = { x: w[3], y: w[4], z: w[5], ox: ux, oy: uy, len, n: 0 };
        a.partner = b; b.partner = a; G.push(a, b);
      }
      // (a crosswalk landing in a road, at an island or another street, isn't one to wait at either end of)
      const on = (g, d, u) => pz.road && pz.road(g.x + g.ox * d - g.oy * u * SCR_HW, g.y + g.oy * d + g.ox * u * SCR_HW);
      const off = g => spotAt(g, 0, 0.8, {}, pz.road).ok !== false; // (and somewhere off the road behind it to wait)
      const ok = G.filter(g => !(on(g, 3, 0) && on(g, 5, 0)) && !(on(g.partner, 3, 0) && on(g.partner, 5, 0)) && off(g) && off(g.partner));
      for (const g of ok) g.corner = ok.filter(h => h !== g && h !== g.partner && Math.hypot(h.x - g.x, h.y - g.y) < 16);
      return (pz.gates = ok);
    }
    // a place to wait at gate g, behind its kerb (u: across the stripes' width, -1 to 1), or to land at
    // it; drawn in towards the stripes' line, and nearer the kerb, where that would be in a road
    function spotAt(g, u, depth, out, road = null) {
      // (first further back at the same place across: a crosswalk whose stripes end short of the kerb, Hachiko's under
      // the viaduct 3.6 m short, drew every spot in to the stripes' line and then on to one point behind the kerb, and
      // those landing there from the far side heaped on it, twenty in a few metres, tools/crowd_spread.js)
      if (road) for (let e = 0; e <= 6; e += 0.5) {
        out.x = g.x + g.ox * (depth + e) - g.oy * u * SCR_HW; out.y = g.y + g.oy * (depth + e) + g.ox * u * SCR_HW;
        if (!road(out.x, out.y) && !(shut && shut(out.x, out.y))) { if (e > 0) { out.x += g.ox * 0.4; out.y += g.oy * 0.4; } return out; } // (a step up off the kerb's edge)
      }
      for (let k = 0; k < 6; k++) {
        out.x = g.x + g.ox * depth - g.oy * u * SCR_HW; out.y = g.y + g.oy * depth + g.ox * u * SCR_HW;
        if ((!road || !road(out.x, out.y)) && !(shut && shut(out.x, out.y))) return out; // (on the pavement, and not in a shut stair well)
        u *= 0.6; depth = 0.8 + (depth - 0.8) * 0.6;
      }
      // (still in a road at the kerb: further back from it, on the stripes' line, where the pavement is; a spot left
      // in the road massed its crowd on the carriageway, where it held the signals' all-red and the cars' greens,
      // Shinjuku's 1106, #264)
      for (const d of [1.5, 2.5, 3.5, 5, 6.5]) {
        out.x = g.x + g.ox * d; out.y = g.y + g.oy * d;
        if (!road(out.x, out.y)) return out;
      }
      out.ok = false;
      return out;
    }
    // a gate's count of those waiting at it or on their way there (g.n): each counted at one gate at most (q.gc),
    // so that a walker who leaves the scramble from out on the crosswalk, or from the kerb, is taken off once
    // (the counts went negative: a walker out crossing, no longer counted, was taken off again, #283)
    const count = (q, g) => { if (q.gc) q.gc.n--; q.gc = g; g.n++; };
    const uncount = q => { if (q.gc) { q.gc.n--; q.gc = null; } };
    // a free place of its own to wait at gate g: the crowd at a kerb stands in loose rows along it, the front row the
    // whole width of the stripes and a pace or more past either edge, each row behind it 0.7 m back, and each one a
    // pace (0.9 m, centre to centre: about 1.4 people a square metre, Fruin's comfortable waiting) from every place taken at that corner, its own crowd's or a
    // neighbouring gate's. Before, every walker of a gate was sent to one point drawn in towards the stripes' line
    // (spotAt below, its depth in a road shrinking to the same spot behind the kerb), and twenty stood there in a heap
    // a few metres across with the paving round them empty (Hachiko's corner under the viaduct, tools/crowd_spread.js).
    const SLOT = 0.9;
    function slotFree(q, x, y, r = SLOT) {
      if (keepRoom(x, y, r) < r) return false; // (nor on one of those not of the crowd: a pace past the room each needs)
      // (a place at a kerb, r the pace: kept from each stranger by the mean of the two's own room, from 0.8 to 1.25 m, and
      // from one of its own group by a shoulder's width. All at one pace, 0.9 m, the front row stood ruled along the
      // kerb one person every pace, issue 75)
      const own = r === SLOT && q, gq = q ? (q.lead >= 0 ? q.lead : q.id) : -1;
      for (let k = 0; k < api.active; k++) {
        const o = P[k];
        if (o === q || !o.pz || !o.T || (o.ph !== 'wait' && o.ph !== 'stroll' && o.ph !== 'linger')) continue;
        const ex = o.T.x - x, ey = o.T.y - y;
        let rr = (o.lead >= 0 ? o.lead : o.id) === gq ? MATE_NEAR : own ? (q.room + o.room) / 2 : r;
        // (in the rain, two who will both put an umbrella up are given an umbrella's room: the two canopies' radii and a
        // little more, p.umbW, which the crowd's renderer writes. A crowd under umbrellas stands looser at a kerb, as it
        // does in the rain, and canopies meet at most at their rims; issue 165)
        if (q && q.umbW > 0 && o.umbW > 0) rr = Math.max(rr, q.umbW + o.umbW + UMB_RIM / 3);
        if (Math.abs(ex) < rr && Math.abs(ey) < rr && ex * ex + ey * ey < rr * rr) return false;
      }
      return true;
    }
    // a place to stand a while on the paving behind a landmark crossing's kerbs, 4 to 16 m back and 9 either side of
    // its crosswalk, as Hachiko's square is used: the city's meeting place, people waiting for a friend, on the phone,
    // looking about, each a couple of metres from the next, not walking and not waiting for the lights. Off the road,
    // on its own level, and a straight walk from where q stands with no wall in the way (a scramble's walkers keep no
    // footway): false where there is none
    function lingerAt(g, q, out, road) {
      const lean = !q.mates && rnd() < 0.5 && clear && ground;
      for (let k = 0; k < (lean ? 16 : 10); k++) {
        const d = 4 + rnd() * 12, lat = (rnd() * 2 - 1) * 9, x = g.x + g.ox * d - g.oy * lat, y = g.y + g.oy * d + g.ox * lat;
        if ((road && road(x, y)) || (shut && shut(x, y)) || !slotFree(q, x, y, 1.6) || keptOut(x, y)) continue;
        let ok = true;
        const n = Math.ceil(Math.hypot(x - q.x, y - q.y) / 0.5);
        for (let m = 1; m <= n && ok; m++) {
          const px = q.x + (x - q.x) * m / n, py = q.y + (y - q.y) * m / n;
          if (shut && shut(px, py)) ok = false;
          else if (clear && ground) { ZAT.z = g.z; const z = ground(px, py, ZAT); if (z == null || Math.abs(z - g.z) > 1 || !clear(px, py, z)) ok = false; }
        }
        if (!ok) continue;
        out.x = x; out.y = y; out.face = null;
        // (some, alone, lean on something within a few steps of that spot instead, the back to it: the guard pipes along
        // the kerb, the planters' rails, a pier of the viaduct, the station's wall; people at a square stand at its edges
        // and by things, not out in the open, Whyte, The Social Life of Small Urban Spaces)
        if (lean) {
          const a0 = rnd() * 6.283;
          let found = false;
          for (let m = 0; m < 8; m++) {
            const a = a0 + m * 0.785, ux = Math.sin(a), uy = Math.cos(a);
            let e = -1;
            for (let r = 0.4; r <= 2.5; r += 0.3) { ZAT.z = g.z; const z = ground(x + ux * r, y + uy * r, ZAT); if (z == null || Math.abs(z - g.z) > 1 || !clear(x + ux * r, y + uy * r, z)) { e = r; break; } }
            if (e < 0) continue;
            const sx = x + ux * (e - 0.42), sy = y + uy * (e - 0.42);
            if ((road && road(sx, sy)) || !standOk(sx, sy, g.z, road) || !slotFree(q, sx, sy, 1.6) || keptOut(sx, sy)) continue;
            out.x = sx; out.y = sy; out.face = a + Math.PI; found = true;
            break;
          }
          if (!found && k < 15) continue; // (nothing to lean on near that spot: another)
        }
        return true;
      }
      return false;
    }
    const LINGER = 0.22; // (the share of a landmark crossing's own crowd that stands about on its paving rather than wait at a kerb)
    function toLinger(q, g) {
      if (!q.pz || !(q.pz.weight > 1) || !lingerAt(g, q, q.T || (q.T = {}), q.pz.road)) return false;
      uncount(q); q.g = g; q.ph = 'linger'; q.lst = false; q.lt = 25 + rnd() * 70; q.lface = q.T.face; // (lface: leaning, the way it faces)
      return true;
    }
    const WAITERS = [];
    // how far behind gate g's line the pavement begins, at lat m across its stripes: a crosswalk's stripes end short of
    // the kerb (0.5 to 3.6 m at Shibuya's), and places measured from the stripes' end fell in the road, were refused,
    // and their walkers sent to the first paving behind (spotAt): every one at the same distance from the kerb's edge,
    // a ruled file along it (the last frame's umbrellas, issue 75). Asked once for each half metre across, and kept
    function kerbOff(g, lat, road) {
      if (!road) return 0;
      const K = g.ko || (g.ko = new Map()), k = Math.round(lat * 2);
      let e = K.get(k);
      if (e === undefined) {
        e = 8;
        for (let d = 0; d <= 7; d += 0.25) if (!road(g.x + g.ox * d - g.oy * k * 0.5, g.y + g.oy * d + g.ox * k * 0.5)) { e = d; break; }
        K.set(k, e);
      }
      return e;
    }
    function slotAt(g, q, out, road = null, fallback = true) {
      const W = SCR_HW + 1.4;
      // (the front row the stripes' width and a little, each row behind a pace wider, fanning out: with every row as
      // wide as the pavement allows, a dozen stood in one long file along the kerb, which no crowd waiting does)
      // (and of the free places, the one nearest the way it comes, the front ones a little preferred: sent for a place
      // in the front row from behind, a newcomer walked into the backs of those standing, was stopped there and stood
      // in their pocket; those landing from the crossing take the front, those coming up the footway the back)
      // (issue 75, the second pass: the places are drawn as a crowd waiting is found to stand, not as rows. Waiters do not
      // spread into the free room: they stand by those already there, and their neighbours' distances peak near a metre
      // however empty the rest is (Kuepper and Seyfried 2023); their depth behind the kerb follows a Weibull curve whose
      // mean grows with the number waiting (Wang et al. 2017); the front is a ragged line within a foot's length of the
      // kerb, nobody past it; the mouth of the crosswalk fills first and the crowd spills a few metres past its ends.
      // So of the places tried, three in five are beside or behind someone already waiting at this kerb, at a
      // neighbour's distance; of the rest a third are at the front, 0.3 to 0.65 m behind the kerb, and the others as
      // deep as the Weibull draw (shape 1.5, its scale from 1 m to 2.5 m as the kerb fills); across, seven in ten within
      // the stripes and the rest up to 2.5 m past them. The room each keeps from a stranger does the rest: clumps of
      // two to five with gaps between, as the kerb's photographs show, where the rows gave one person a pace.
      // docs/GAME.md, "The wait at a kerb")
      let bx = 0, by = 0, best = Infinity, found = 0, nw = 0;
      for (let k = 0; k < api.active; k++) { const o = P[k]; if (o !== q && o.g === g && o.T && (o.ph === 'wait' || o.ph === 'stroll')) WAITERS[nw++] = o; }
      const lam = Math.min(2.5, 1 + 0.06 * nw);
      for (let k = 0; k < 80 && found < 24; k++) {
        let x, y, d;
        if (nw && k > 0 && rnd() < 0.6) {
          const o = WAITERS[Math.floor(rnd() * nw)], a = (rnd() * 2 - 1) * 1.9, r = (q.room + o.room) / 2 + rnd() * 0.25, c = Math.cos(a), sn = Math.sin(a);
          x = o.T.x + (g.ox * c - g.oy * sn) * r; y = o.T.y + (g.oy * c + g.ox * sn) * r;
          d = (x - g.x) * g.ox + (y - g.y) * g.oy - kerbOff(g, (y - g.y) * g.ox - (x - g.x) * g.oy, road);
          if (d < 0.3) continue; // (never past the front)
        } else {
          const lat = k === 0 ? q.spread * SCR_HW : rnd() < 0.7 ? (rnd() * 2 - 1) * SCR_HW : (rnd() < 0.5 ? -1 : 1) * Math.min(W + 1.1, SCR_HW + rnd() * 2.5);
          d = rnd() < 0.33 ? 0.3 + rnd() * 0.35 : 0.3 + lam * Math.pow(-Math.log(1 - rnd() * 0.98), 1 / 1.5);
          const e = d + kerbOff(g, lat, road);
          x = g.x + g.ox * e - g.oy * lat; y = g.y + g.oy * e + g.ox * lat;
        }
        if ((road && road(x, y)) || (shut && shut(x, y)) || !slotFree(q, x, y)) continue;
        if (clear && ground) { ZAT.z = g.z; const z = ground(x, y, ZAT); if (z == null || Math.abs(z - g.z) > 1 || !clear(x, y, z)) continue; }
        found++;
        // (of the free places, the one nearest the way it comes, the front a little preferred by each as keen as it is,
        // and a little left to chance)
        const sc = Math.hypot(x - q.x, y - q.y) + q.keen * d + rnd() * 0.8;
        if (sc < best) { best = sc; bx = x; by = y; }
      }
      if (found) { out.x = bx; out.y = by; out.ok = true; return out; }
      if (!fallback) return null;
      return spotAt(g, q.spread, 0.7 + rnd() * 1.6, out, road); // (no room left behind that kerb: in among them)
    }
    function toGate(q, g) { // to wait at gate g
      q.g = g; count(q, g); q.ph = 'stroll'; q.lst = false; q.react = 0.2 + rnd() * 2.2;
      const T = q.T || (q.T = {}), road = q.pz && q.pz.road;
      if (slotAt(g, q, T, road, false)) return true;
      // (no room left behind that kerb, a narrow corner's pavement between a wall and the road: a kerb of that corner
      // with room, and else false, for the caller to send it on along a footway rather than in among those already
      // there: the corner west of QFRONT heaped a dozen into a circle 3 m across)
      for (const h of g.corner || []) if (slotAt(h, q, T, road, false)) { q.g = h; count(q, h); return true; }
      spotAt(g, q.spread, 0.7 + rnd() * 1.6, T, road);
      return false;
    }
    function plazas(t, cx, cy) {
      // (the share split between those near, a landmark's the most)
      const near = (api.plazas || []).filter(q => Math.hypot(q.x - cx, q.y - cy) < radius * PLAZA_R && gatesOf(q).length), W = near.reduce((a, q) => a + (q.weight || 1), 0) || 1;
      for (const pz of api.plazas || []) {
        const G = gatesOf(pz);
        if (!G.length) continue;
        const want = near.includes(pz) ? Math.min(G.reduce((a, h) => a + h.len * 0.32, 0), Math.round(api.active * PLAZA_SHARE * (pz.weight || 1) / W)) : 0; // (no more than its crosswalks can carry)
        let have = 0;
        for (let i = 0; i < api.active; i++) if (P[i].pz === pz) have++;
        // (more than its share: with the player gone, back to the footways at once, out of sight; else
        // each leaves along a footway as it reaches the far side, pz.owe)
        if (!want) for (let i = 0; i < api.active && have > 0; i++) { const q = P[i]; if (q.pz === pz && q.ph !== 'cross') { release(q); uncount(q); q.pz = q.g = null; q.state = 'walk'; q.line = -1; have--; } }
        pz.owe = Math.max(0, have - want);
        // (taken from those well out of sight, or all at once as the game starts)
        for (let i = 0; i < api.active && have < want; i++) {
          const q = P[i];
          if (q.pz || q.state !== 'walk' || q.lead >= 0 || (t >= 1 && q.line >= 0 && Math.hypot(q.x - cx, q.y - cy) < 120)) continue; // (a mate comes with its leader)
          const g1 = G[Math.floor(rnd() * G.length)], g2 = G[Math.floor(rnd() * G.length)], g = g1.n / g1.len <= g2.n / g2.len ? g1 : g2; // (the less crowded of two kerbs for its crosswalk's width: no one kerb heaped while the next stands empty)
          if (t >= 1 && seen(g.x, g.y, g.z)) continue; // (not put at a kerb the camera sees: those who walk up to it join, toPlaza)
          const was = [q.line, q.x, q.y, q.z];
          q.pz = pz; q.state = 'scr'; q.mode = 'ground'; q.line = Math.max(0, q.line); q.g = null; q.pause = 0;
          q.x = g.x; q.y = g.y; // (put there at once: the front rows first)
          const stand = rnd() < LINGER && toLinger(q, g); // (some standing about the square from the first frame)
          if (!stand && !toGate(q, g)) { uncount(q); q.pz = q.g = null; q.state = 'walk'; [q.line, q.x, q.y, q.z] = was; continue; } // (no room at that corner)
          q.x = q.T.x; q.y = q.T.y; q.z = g.z; q.v = q.vx = q.vy = 0;
          if (stand) { q.lst = true; q.h = rnd() * 6.28; } else { q.ph = 'wait'; q.h = Math.atan2(-g.ox, -g.oy); }
          gather(q.x, q.y, q, true, q.z);
          if (t >= 1 && seen(q.x, q.y, q.z)) { uncount(q); q.pz = q.g = null; q.state = 'walk'; [q.line, q.x, q.y, q.z] = was; continue; } // (its own spot along that kerb is in sight: it stays where it was)
          if (carDepth(q.x, q.y) > 0) { uncount(q); q.pz = q.g = null; q.state = 'walk'; q.line = -1; continue; } // (not put inside a car waiting there)
          have++;
          if (q.mates) for (const j of q.mates.slice()) { // (and its mates by it, waiting with it or standing about with it)
            const o = P[j];
            if (o.lead !== q.id || o.state !== 'walk' || o.pz) continue;
            mateIn(o, q); o.x = o.T.x; o.y = o.T.y; o.z = q.z; o.v = o.vx = o.vy = 0; o.line = Math.max(0, o.line);
            if (q.ph === 'wait') { o.ph = 'wait'; o.h = q.h; } else if (q.lst) { o.lst = true; o.h = Math.atan2(q.x - o.x, q.y - o.y); }
            have++;
          }
        }
      }
    }
    // the crowd on the footways and a scramble's own trade places at its kerbs: one walking up to it
    // joins those waiting there (they cross the scramble's way, free of the footways' single file),
    // and one of them, on the far side, walks off along the footway it stands by
    function toPlaza(p, j, reach = 9) {
      const pz = j.plaza, G = pz && pz.gates;
      if (!G || !G.length || !api.plazas || !api.plazas.includes(pz)) return false;
      let g = null, bd = reach;
      for (const h of G) { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < bd) { bd = d; g = h; } }
      if (!g) return false;
      release(p);
      p.pz = pz; p.state = 'scr'; p.mode = 'ground'; p.g = null; p.kerbNext = null; p.kerbBack = false;
      if (!toGate(p, g)) { uncount(p); p.pz = p.g = null; p.state = 'walk'; return false; } // (no room there: on along its footway)
      p.vx = p.vy = 0;
      return true;
    }
    // walker p (on the footways) joins scramble pz's crowd where it stands, waiting at its nearest kerb
    function joinPlaza(p, pz) {
      const G = pz.gates;
      if (!G || !G.length || !api.plazas || !api.plazas.includes(pz) || (pz.road && pz.road(p.x, p.y))) return false;
      let g = null, bd = 16;
      for (const h of G) { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < bd) { bd = d; g = h; } }
      if (!g) return false;
      release(p);
      p.pz = pz; p.state = 'scr'; p.mode = 'ground'; p.g = null; p.kerbNext = null; p.kerbBack = false;
      const room = toGate(p, g);
      // (a place of its own if one is near, the next step or two; else where it stands, at the back of them)
      if (!room || Math.hypot(p.T.x - p.x, p.T.y - p.y) > 3) { p.T.x = p.x; p.T.y = p.y; p.ph = 'wait'; }
      p.vx = p.vy = 0;
      return true;
    }
    function toFootway(q) {
      const near = net.nearest(q.x, q.y, 6, q.z, 2, 0, shut ? shutLine : null); // (not onto a footway that leads down a shut stair)
      if (!near) return false;
      const X = api.crossings && api.crossings.byLine.get(near.line);
      if (X && X.some(x => Math.abs(x.s - near.s) < x.kerb + 0.5)) return false; // (not out in the road)
      net.at(near.line, near.s, tmp);
      const j = q.pz.j, away = (tmp.x - j.x) * tmp.hx + (tmp.y - j.y) * tmp.hy >= 0 ? 1 : -1; // (on away from the scramble)
      uncount(q);
      q.pz = q.g = null; q.state = 'walk'; q.mode = 'ground'; q.leftPz = frame;
      q.line = near.line; q.s = near.s; q.dir = away;
      q.hx = tmp.hx * away; q.hy = tmp.hy * away;
      q.lat = q.lim = (q.x - tmp.x) * -q.hy + (q.y - tmp.y) * q.hx; q.limWant = q.side = Math.max(0.3, Math.min(1.8, Math.abs(q.lat)));
      q.dodge = 0; q.v = Math.hypot(q.vx, q.vy);
      return true;
    }
    // ------------------------------------------------ walking groups
    // About half of a city crowd walks in groups of two to four: friends, couples, families, colleagues (Moussaid, Perozo,
    // Garnier, Helbing and Theraulaz, PLoS ONE 2010: 55% on a weekday street, 70% at the weekend; pairs the most, then
    // threes, fours rare). A group walks abreast, a line across the way, at ease; as it gets crowded the line bends
    // forward into a V, the middle ones a little back, so that they can still talk; where the footway is too narrow for
    // them abreast, two by two. It walks a little slower than its members would alone, waits at a kerb and crosses
    // together, stands about the square together facing in, and parts only where a group would: one of them sent off
    // elsewhere (out of sight, by the story's clearing, or into a bus). Each group has a leader, who walks as anyone
    // does; each of the others (lead: the leader's id, gk: its place, 1 to 3) keeps its place by it.
    const GROUP = 0.3;                    // the chance someone put out on the street leads a group (with its mates about half the crowd)
    const MATE = 0.75, MATE_DENSE = 0.62, MATE_NEAR = 0.62; // abreast, centre to centre (m): at ease, in a crowd, and stood waiting together
    const mateOf = (p, o) => (p.lead >= 0 && (o.id === p.lead || o.lead === p.lead)) || (!!p.mates && o.lead === p.id);
    function partGroup(p) { // p leaves its group: a leader's mates go on as a group of their own, the first of them leading
      if (p.mates) {
        const M = p.mates.filter(j => P[j].lead === p.id);
        p.mates = null;
        if (M.length) {
          const L = P[M[0]];
          L.lead = -1; L.gk = 0; L.mates = M.length > 1 ? M.slice(1) : null;
          M.slice(1).forEach((j, k) => { P[j].lead = L.id; P[j].gk = k + 1; });
        }
      }
      if (p.lead >= 0) {
        const L = P[p.lead];
        if (L && L.mates) { L.mates = L.mates.filter(j => j !== p.id); L.mates.forEach((j, k) => { P[j].gk = k + 1; }); if (!L.mates.length) { L.mates = null; if (L.speed0 != null) L.speed = L.speed0; } }
        p.lead = -1; p.gk = 0;
      }
      if (p.speed0 != null) p.speed = p.speed0; // (alone again: at its own pace)
    }
    function hashIn(o) { // (known to the neighbours' hash at once, as place() does)
      if (o.hashed === stepNo) return;
      const k = bucket(Math.floor(o.x / CELL), Math.floor(o.y / CELL));
      chain[o.id] = head[k]; head[k] = o.id; o.hashed = stepNo;
    }
    // the place of mate k (1..n-1) of a group of n by its leader on a footway: across the way (lat, + = left, as the
    // leader's offset) and behind it (back, m). Abreast as far as the footway allows, the leader on its own side and the
    // rest further out; bent forward into a V as it gets crowded (dense 0..1); two by two where the way is narrow; and
    // stopped at a window or a rail, along it either side of the leader
    function mateSlot(L, k, n, hw, dense) {
      if (L.stop) return { lat: L.stop.lat, back: (k % 2 ? 1 : -1) * MATE * Math.ceil(k / 2) };
      const ll = L.lat ?? L.side, sp = MATE - (MATE - MATE_DENSE) * dense;
      const cols = dense > 0.7 ? 1 : Math.max(1, Math.min(n, Math.floor((ll + hw - 0.3) / sp) + 1)), col = k % cols, row = Math.floor(k / cols); // (in a press, single file)
      const bend = col > 0 && col < cols - 1 ? 0.5 : cols === 2 && col === 1 ? 0.2 : 0;
      return { lat: ll - col * sp, back: row * 0.9 + bend * dense };
    }
    // walker L, just put out on a footway, may lead a group: one to three others taken from where nobody sees them (or
    // from those not yet out), put beside or behind it at their places
    function grouped() { // the share of those out on the footways walking in a group
      let n = 0, m = 0;
      for (let i = 0; i < api.active; i++) { const q = P[i]; if (q.line < 0) continue; n++; if (q.lead >= 0 || q.mates) m++; }
      return n ? m / n : 0;
    }
    function formGroup(L, unseen) {
      if (L.line < 0 || L.pz || L.state !== 'walk' || rnd() >= GROUP) return;
      const l = net.L[L.line], hw = Math.max(1, (FOOTW[l.c] || 3) / 2), r = rnd(), want = r < 0.7 ? 1 : r < 0.92 ? 2 : 3;
      const M = [];
      for (let tries = 0; tries < 40 && M.length < want; tries++) {
        const j = Math.floor(rnd() * api.active), o = P[j];
        if (o === L || o.pz || o.state !== 'walk' || o.lead >= 0 || o.mates || o.seat || o.stop) continue;
        if (unseen && o.line >= 0 && seen(o.x, o.y, o.z, 0.05)) continue; // (not taken from where the camera sees it)
        const k = M.length + 1, sl = mateSlot(L, k, want + 1, hw, 0), s = L.s - L.dir * sl.back;
        if (s < 0 || s > l.len) break;
        lineAt(L.line, s, ahead);
        const hx = ahead.hx * L.dir, hy = ahead.hy * L.dir, x = ahead.x - hy * sl.lat, y = ahead.y + hx * sl.lat;
        if ((shut && shut(x, y)) || (wall && wall(x, y, ahead.z)) || (clear && !clear(x, y, ahead.z))) break;
        if (unseen && seen(x, y, ahead.z, 0.05)) break;
        gather(x, y, o, true, ahead.z);
        if (blocked(x, y) > 0 || crowded(x, y, o, CLOSE)) break;
        release(o);
        o.state = 'walk'; o.mode = 'ground'; o.line = L.line; o.s = s; o.dir = L.dir; o.side = sl.lat; o.lat = null;
        o.kerbNext = null; o.kerbBack = false; o.fx = o.gx = o.av = null; o.moving = false; o.stop = null; o.stopFace = null; o.pause = 0;
        o.x = x; o.y = y; o.z = ahead.z; o.lead = L.id; o.gk = k;
        hashIn(o);
        M.push(j);
      }
      if (!M.length) return;
      L.mates = M; L.gk = 0; L.went = null; L.ga = rnd() * 6.283;
      L.speed0 = L.speed0 ?? L.speed;
      L.speed = Math.max(0.95, L.speed0 * (1 - 0.05 * M.length)); // (a group walks slower than its members would alone)
      for (const j of M) { const o = P[j]; o.speed0 = o.speed0 ?? o.speed; o.speed = L.speed; }
    }
    // where (x, y) can be stood on at a scramble: off its road, out of a shut stair well, on the level of z, not in a wall
    function standOk(x, y, z, road) {
      if ((road && road(x, y)) || (shut && shut(x, y))) return false;
      if (clear && ground) { ZAT.z = z; const h = ground(x, y, ZAT); if (h == null || Math.abs(h - z) > 1 || !clear(x, y, h)) return false; }
      return true;
    }
    // a mate's spot by its leader L at a scramble (out): beside it along the kerb waiting, either side, else a step behind;
    // in a ring with it standing about the square, facing in, as people talking stand; beside it crossing
    function mateSpot(L, q, out) {
      const k = q.gk || 1, n = 1 + (L.mates ? L.mates.length : 1), road = L.pz && L.pz.road, g = L.g, z = L.z, T = L.T;
      if (L.ph === 'linger') {
        const a = L.ga ?? (L.ga = rnd() * 6.283), r = n === 2 ? 0.45 : 0.55, cx = T.x - Math.sin(a) * r, cy = T.y - Math.cos(a) * r, b = a + k * 6.283 / n;
        out.x = cx + Math.sin(b) * r; out.y = cy + Math.cos(b) * r;
        if (standOk(out.x, out.y, z, road)) return out;
      } else if (L.ph === 'cross') {
        const dx = T.x - L.x, dy = T.y - L.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, sd = k % 2 ? -1 : 1, w = MATE;
        out.x = T.x - uy * w * sd - (k === 3 ? ux * 0.7 : 0); out.y = T.y + ux * w * sd - (k === 3 ? uy * 0.7 : 0);
        return out;
      } else if (g) {
        const ax = -g.oy, ay = g.ox, u = Math.ceil(k / 2), sd = k % 2 ? 1 : -1;
        for (const [a, b] of [[sd * u, 0], [-sd * u, 0], [0, k], [sd, 1]]) { // (shoulder to shoulder with its own, as friends wait: 0.85 m apart, a group stood in the ruled row as strangers do, issue 75)
          const st = b * 0.65 + (a ? (h01(q.id, 7) - 0.3) * 0.4 : 0); // (abreast, not dressed by the right: each up to a foot's length ahead of or behind its friend)
          out.x = T.x + ax * a * MATE_NEAR + g.ox * st; out.y = T.y + ay * a * MATE_NEAR + g.oy * st;
          if (standOk(out.x, out.y, z, road) && slotFree(q, out.x, out.y, 0.8)) return out;
        }
      }
      out.x = T.x + Math.sin(k * 2.1) * 0.72; out.y = T.y + Math.cos(k * 2.1) * 0.72;
      return out;
    }
    function mateIn(q, L) { // mate q joins its leader L's crowd at a scramble, as L is there
      release(q);
      q.pz = L.pz; q.state = 'scr'; q.mode = 'ground'; q.kerbNext = null; q.kerbBack = false; q.stop = null; q.stopFace = null; q.pause = 0;
      q.g = L.g; q.T = q.T || {}; q.lst = false; q.lface = null; q.react = 0.2 + rnd() * 2.2; q.lt = 25 + rnd() * 70; // (and its own reaction and while, should it be left alone there)
      q.ph = L.ph === 'cross' ? 'cross' : L.ph === 'linger' ? 'linger' : 'stroll';
      if (q.ph === 'stroll' && L.g) count(q, L.g);
      mateSpot(L, q, q.T); q.lTx = L.T.x; q.lTy = L.T.y; q.lph = L.ph;
      q.vx = q.vy = 0;
    }
    function enterAt(q, pz, g) { // walker q joins scramble pz's crowd at its gate g, as toPlaza does
      if (!g) return false;
      release(q);
      q.pz = pz; q.state = 'scr'; q.mode = 'ground'; q.g = null; q.kerbNext = null; q.kerbBack = false; q.stop = null; q.stopFace = null;
      if (!toGate(q, g)) { uncount(q); q.pz = q.g = null; q.state = 'walk'; return false; }
      q.vx = q.vy = 0;
      return true;
    }
    // each step, a mate where its leader is and as it is: onto a scramble's crowd after it (or bringing it, there first),
    // off it after it, waiting, crossing and standing about with it; and out of the group once it is gone or far off
    function groupSync(p) {
      const L = P[p.lead];
      if (!L || L.lead >= 0 || !(L.mates && L.mates.includes(p.id)) || (L.line < 0 && !L.pz) || (L.state !== 'walk' && L.state !== 'scr') || (p.state !== 'walk' && p.state !== 'scr')
        || Math.abs(L.z - p.z) > 2 || Math.hypot(L.x - p.x, L.y - p.y) > 12) { partGroup(p); return; }
      if (L.pz && !p.pz) { mateIn(p, L); return; }
      if (p.pz && !L.pz) {
        if (p.pz.road && p.pz.road(p.x, p.y)) return; // (out on the road: over first)
        if (frame - (L.leftPz ?? -1e9) < 150) { if (!toFootway(p)) partGroup(p); } // (gone off along a footway: after it)
        else if (!enterAt(L, p.pz, p.g)) partGroup(p); // (there first: the leader comes and waits with it)
        return;
      }
      if (!p.pz) return; // (both on the footways: walk() keeps its place)
      if (p.pz !== L.pz) { partGroup(p); return; }
      const road = p.pz.road;
      let moved = false;
      if (L.ph === 'cross' && p.ph !== 'cross' && p.g === L.g) { uncount(p); p.ph = 'cross'; moved = true; } // (the leader steps out: so does it)
      else if (L.ph !== 'cross' && p.ph === 'cross') { if (!(road && road(p.x, p.y))) { p.ph = 'stroll'; p.g = L.g; if (L.ph !== 'linger' && L.g) count(p, L.g); moved = true; } }
      else if (L.ph === 'linger' && p.ph !== 'linger' && p.ph !== 'cross') { uncount(p); p.ph = 'linger'; p.lst = false; p.g = L.g; moved = true; }
      else if (L.ph !== 'linger' && L.ph !== 'cross' && p.ph === 'linger') { p.ph = 'stroll'; p.g = L.g; if (L.g) count(p, L.g); moved = true; }
      else if (p.ph !== 'cross' && L.ph !== 'cross' && p.g !== L.g) { p.g = L.g; if (p.ph !== 'linger' && L.g) count(p, L.g); moved = true; }
      if (moved || p.lTx !== L.T.x || p.lTy !== L.T.y || p.lph !== L.ph) {
        p.lTx = L.T.x; p.lTy = L.T.y; p.lph = L.ph;
        mateSpot(L, p, p.T || (p.T = {}));
        if (p.ph === 'wait' && Math.hypot(p.T.x - p.x, p.T.y - p.y) > 0.6) p.ph = 'stroll';
        if (p.ph === 'linger' && Math.hypot(p.T.x - p.x, p.T.y - p.y) > 0.5) p.lst = false;
      }
    }
    // ------------------------------------------------ stops along the way
    // Someone looking in a shop window, or leaning on the guard pipes along a kerb or against a pier of the viaduct a
    // while, as people on a city street do and as the square's people stand about (linger). Found from the footway itself,
    // out to either side of it: something solid within reach of its edge with more of it a metre beyond is a building's
    // front (a shop window: faced); something solid with the road beyond it, the guard rail along a kerb (leaned on, the
    // back to it or facing the street); anything else solid, a pier or a post (leaned on, the back to it). Not near a
    // crossing (a kerb's crowd), not on steps, not where the story keeps the crowd out of (api.keep: a frame's sightline,
    // the ring round someone it is of, a conversation's shot), and never within a metre of anyone or by a car or a bench.
    // A group stops with its leader, along the window beside it (mateSlot).
    function stopAt(p, l, X, hw) {
      if (!clear || !ground || p.state !== 'walk' || p.pz || p.mode !== 'ground' || l.c === 'steps' || l.c === 'cycleway') return false;
      if ((X && X.some(x => Math.abs(x.s - p.s) < x.kerb + 6)) || p.s < 3 || p.s > l.len - 3 || p.lat == null) return false;
      const road = api.crossings && api.crossings.road;
      lineAt(p.line, p.s, tmp);
      const hx = tmp.hx * p.dir, hy = tmp.hy * p.dir, at = lat => {
        const x = tmp.x - hy * lat, y = tmp.y + hx * lat;
        ZAT.z = p.z; const z = ground(x, y, ZAT);
        return { x, y, z, ok: z != null && Math.abs(z - p.z) < 0.6 && clear(x, y, z) };
      };
      for (const sg of rnd() < 0.6 ? [1, -1] : [-1, 1]) {
        let edge = null;
        for (let lat = p.lat; Math.abs(lat) <= hw + 1.6; lat += sg * 0.2) {
          const a = at(lat);
          if (!a.ok) { edge = lat; break; } // (the guard pipes stand on the kerb's edge, where the road may begin: looked for first)
          if (road && road(a.x, a.y)) break; // (the open kerb: nothing there to stop at)
        }
        if (edge == null) continue;
        const lat = edge - sg * 0.42, a = at(lat); // (a body's half and a little from it)
        if (!a.ok || Math.abs(lat) < 0.3 || (road && road(a.x, a.y)) || keptOut(a.x, a.y)) continue;
        gather(a.x, a.y, p, true, a.z);
        if (blocked(a.x, a.y) > 0 || crowded(a.x, a.y, p, 1.0)) continue;
        const b1 = at(edge + sg * 0.9), b2 = at(edge + sg * 1.6);
        const kind = road && ((road(b1.x, b1.y) && b1.ok) || (road(b2.x, b2.y) && b2.ok)) ? 'rail' : !b1.ok && !b2.ok ? 'window' : 'pier';
        const toward = Math.atan2(-hy * sg, hx * sg);
        p.stop = { lat, kind, on: false, try: 0, t: kind === 'window' ? 10 + rnd() * 30 : 20 + rnd() * 50 };
        p.stopFace = kind === 'window' || (kind === 'rail' && rnd() < 0.5) ? toward : toward + Math.PI;
        api.stops[kind] = (api.stops[kind] || 0) + 1;
        return true;
      }
      return false;
    }
    // where the story keeps the crowd out of (game.js clearSight, clearRound and a conversation's shot, each refreshed
    // while it lasts): nobody begins to stand about or stop along the way there. Each a segment and its half-width
    const kept = new Map();
    api.stops = {};
    api.keep = (ax, ay, bx, by, w) => {
      const key = `${ax.toFixed(1)},${ay.toFixed(1)},${bx.toFixed(1)},${by.toFixed(1)}`, e = kept.get(key);
      if (e) { e.until = frame + 90; e.w = w; } else kept.set(key, { ax, ay, bx, by, w, until: frame + 90 });
    };
    function keptOut(x, y) {
      for (const [key, e] of kept) {
        if (e.until < frame) { kept.delete(key); continue; }
        const dx = e.bx - e.ax, dy = e.by - e.ay, L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.max(0, Math.min(1, ((x - e.ax) * dx + (y - e.ay) * dy) / L2)) : 0;
        if (Math.hypot(x - e.ax - dx * t, y - e.ay - dy * t) < e.w) return true;
      }
      return false;
    }
    const ZAT = { z: 0, deck: 0 };
    function carDepth(x, y, m = 0.3) { // how deep (x, y) is in the cars near (gathered): each its box, grown m all round (the corners too)
      let deep = 0;
      for (const o of nearCars) {
        const fx = Math.sin(o.h), fy = Math.cos(o.h), dx = x - o.x, dy = y - o.y;
        const ea = o.half + m - Math.abs(dx * fx + dy * fy), eb = o.hw + m - Math.abs(-dx * fy + dy * fx);
        if (ea > 0 && eb > 0) deep += Math.min(ea, eb);
      }
      return deep;
    }
    // how far the nearest other walker is from (x, y), up to 1 m (the neighbour hash as this step began)
    function nearest1(self, x, y) {
      let best = 1;
      const me = P[self], us = me.squeeze > 0 ? 0.4 : 1; // (through a press, shuffling: the canopies lean and brush)
      const c0 = Math.floor(x / CELL), r0 = Math.floor(y / CELL);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        for (let k = head[bucket(c0 + a, r0 + b)]; k >= 0; k = chain[k]) {
          if (k === self) continue;
          const o = P[k], ex = o.x - x, ey = o.y - y;
          if (o.line < 0) continue;
          if ((me.umbR > 0 || o.umbR > 0) && Math.abs(ex) < 1.6 && Math.abs(ey) < 1.6 && !mateOf(me, o)) { // (an umbrella's room, issue 165)
            const u = umbRoom(me, o);
            if (u > 0.45) { const e = umbGap(me, x, y, o, 0.45 + (u - 0.45) * us, 0.45); if (e < best) best = e; }
          }
          if (Math.abs(ex) > best || Math.abs(ey) > best) continue;
          const e = Math.hypot(ex, ey);
          if (e < best) best = e;
        }
      }
      return best;
    }
    // a scramble's crowd crosses briskly, as Shibuya's does (about 1.5 m/s, the slowest a little under,
    // the quickest near 1.8): junctions.js times the walk by it (SCR_V), #199
    const xSpeed = q => Math.max(q.speed, 1.38) * 1.05;
    // whether someone still waiting at gate g stands just in front of q, between it and the road
    function aheadWaits(i, q, g) {
      const c0 = Math.floor(q.x / CELL), r0 = Math.floor(q.y / CELL);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        for (let k = head[bucket(c0 + a, r0 + b)]; k >= 0; k = chain[k]) {
          if (k === i) continue;
          const o = P[k];
          if (o.g !== g || o.ph !== 'wait') continue;
          const ex = o.x - q.x, ey = o.y - q.y, fwd = -(ex * g.ox + ey * g.oy), lat = Math.abs(ex * g.oy - ey * g.ox);
          if (fwd > 0.15 && fwd < 1.1 && lat < 0.45) return true;
        }
      }
      return false;
    }
    function plazaStep(i, q, dt, player) {
      const pz = q.pz, g = q.g;
      // (inside the player or one of those not of the crowd, put down there: out at once, to shoulders brushing)
      if (dt > 0 && keepIn(q, player, 0.3)) {
        let ex = q.x - ko.x, ey = q.y - ko.y, e = Math.hypot(ex, ey);
        if (e < 1e-4) { ex = 1; ey = 0; e = 1; }
        const to = ko.r + 0.34; q.x = ko.x + ex / e * to; q.y = ko.y + ey / e * to; q.rx = null;
      }
      let sp = 0;
      if (q.ph === 'wait' && !(q.lead >= 0)) { // (a mate goes when its leader does: groupSync)
        // the walk on, and time enough to make the far kerb: out, after a moment's reaction
        const far = g.len + 1; // (the crosswalk's length: the deepest of the crowd at the kerb a little behind the front rows)
        if (pz.walk() && pz.left() > far / (xSpeed(q) * 0.85)) { // (with time in hand for a crowd in the way)
          // a crowd at a kerb sets off as a wave from the front, as a real one does (and as Detour's and Mass's
          // queues do, each agent moving once the one ahead has): the front row on its reaction, each row behind
          // it later by how deep it stands and only once whoever stands in front of it has stepped off, rather
          // than every row at once walking into the backs of the row ahead. Never held more than 4 s by that
          // (and across to the far kerb a little to its own left of the stripes, as the crowd sorts itself into lanes:
          // each heading for the mirror of where it stood, the two kerbs' crowds met face to face across the whole width
          // and stood in a knot in the middle of the road until the shoves sorted them, tools/crowd_spread.js)
          const depth = Math.max(0, (q.x - g.x) * g.ox + (q.y - g.y) * g.oy - 0.8);
          // (each heading for the far kerb across from where it stands along this one, in the stripes' half-widths, a little
          // to its left: aimed by a number drawn for it, the whole kerb's crowd funnelled into a lane 5 m wide and crossed
          // as a column three people a square metre dense, issue 56; and each row at the back half a second a metre later)
          const lat = Math.max(-1.35, Math.min(1.35, ((q.x - g.x) * -g.oy + (q.y - g.y) * g.ox) / SCR_HW));
          if ((q.react -= dt) <= -0.5 * depth && (q.react < -4 || !aheadWaits(i, q, g))) { q.ph = 'cross'; spotAt(g.partner, -(lat * 0.8 - 0.3) + (rnd() - 0.5) * 0.4, 0.6 + rnd() * 1.4, q.T, pz.road); uncount(q); }
        }
      }
      else if (q.ph === 'cross' && !(q.lead >= 0)) { // (still behind the kerb as the walk ends, or with too little of it left: back to wait)
        const P2 = g.partner, ex = P2.x - g.x, ey = P2.y - g.y, t = ((q.x - g.x) * ex + (q.y - g.y) * ey) / (ex * ex + ey * ey);
        if (t < 0.03 && (!pz.walk() || pz.left() < g.len / (xSpeed(q) * 0.85))) { q.ph = 'wait'; count(q, g); slotAt(g, q, q.T, pz.road); q.react = 0.2 + rnd() * 2.2; }
      }
      // (its place to wait or stand about now on one of those not of the crowd, who came and stood there: another, issue 65)
      if (K.length && q.g && (q.ph === 'wait' || q.ph === 'stroll' || q.ph === 'linger') && (frame + i) % 15 === 0 && keepRoom(q.T.x, q.T.y, SLOT) < SLOT - 0.2) {
        if (q.ph === 'linger') { if (!lingerAt(q.g, q, q.T, pz.road)) { q.T.x = q.x; q.T.y = q.y; } q.lst = false; }
        else slotAt(q.g, q, q.T, pz.road);
      }
      const dx = q.T.x - q.x, dy = q.T.y - q.y, d = Math.hypot(dx, dy);
      if (q.ph === 'cross') { sp = xSpeed(q); pz.busy = (pz.busy || 0) + 1; } else if (q.ph === 'stroll') {
        sp = q.speed * 0.75;
        if (pz.road && pz.road(q.x, q.y)) {
          sp = xSpeed(q);
          // (still out on the road, held up short of its spot by the crowd massed at the kerb: a spot further back
          // behind it, twice, then another kerb of that corner, and after that it edges on through as it can, no
          // longer counted as out crossing: the signals held their all-red and the cars' greens for such a one, a
          // minute at a time, Shinjuku's 1105, #264)
          // (and one stood still in the gutter a pace from its spot, pressed against the crowd at the kerb, is at the
          // kerb, not out crossing: it held the all-red after the walk 10 to 15 s at a time, Shinjuku's 1105, #283)
          q.gutT = q.v < 0.15 ? (q.gutT || 0) + dt : 0;
          const atKerb = q.gutT > 1 && d < 2.5;
          if (!((q.sTries || 0) > 3) && !atKerb) pz.busy = (pz.busy || 0) + 1;
          q.sjam = q.v < 0.15 ? (q.sjam || 0) + dt : 0;
          if (q.sjam > 3) {
            q.sjam = 0; q.sTries = (q.sTries || 0) + 1;
            if (q.sTries <= 2 && q.g) spotAt(q.g, q.spread * 0.5, 2 + 1.5 * q.sTries, q.T, pz.road);
            else if (q.sTries === 3 && q.g && q.g.corner && q.g.corner.length) { const c = q.g.corner; toGate(q, c[Math.floor(rnd() * c.length)]); q.sTries = 3; }
          }
        } else q.sTries = 0;
      } else if (q.ph === 'linger') {
        sp = q.lst ? 0 : q.speed * 0.8;
        // (stood its while: off along a footway, or to a kerb to cross)
        if (q.lst && !(q.lead >= 0) && (q.lt -= dt) < 0) { if (!(rnd() < 0.5 && toFootway(q))) toGate(q, q.g); return; }
      } else sp = d > 0.6 ? 0.5 : 0;
      // (a mate on its way to its place by its leader: at the leader's pace, a little quicker while behind it, slower ahead)
      if (q.lead >= 0 && (q.ph === 'cross' || q.ph === 'stroll' || (q.ph === 'linger' && !q.lst)) && d > 0.6) {
        const L = P[q.lead], ahead = ((L.x - q.x) * dx + (L.y - q.y) * dy) / d;
        sp = Math.max(0.45, Math.min(2, Math.max(L.v || 0, 0.3) + Math.max(-0.6, Math.min(0.6, ahead * 1.2))));
      }
      // (stood in the road in front of a car that has waited on them, off the walk: on through the press to a spot
      // further back from the kerb, as the footways' walkers turn back for one, below. One pressed against the crowd
      // at the kerb by the Scramble's western stop line held a driver there 150 s, issue 175)
      if (q.give) { q.give = false; if (q.ph !== 'cross') { q.squeeze = Math.max(q.squeeze || 0, 2.5); if (q.ph === 'stroll' && q.g) { q.sTries = Math.min(3, (q.sTries || 0) + 1); spotAt(q.g, q.spread * 0.5, 2 + 1.5 * q.sTries, q.T, pz.road); } } }
      if (q.pause > 0) sp = 0;
      let vx = d > 1e-3 ? dx / d * Math.min(sp, d / Math.max(dt, 1e-3)) : 0, vy = d > 1e-3 ? dy / d * Math.min(sp, d / Math.max(dt, 1e-3)) : 0;
      // the others near: apart, and, meeting someone coming the other way, a step to the left
      let fx = 0, fy = 0;
      const c0 = Math.floor(q.x / CELL), r0 = Math.floor(q.y / CELL), vv = Math.hypot(vx, vy);
      // (caught a while in the press, mid-road: shuffles on through it, as for the footways' knots)
      q.stuck = q.ph === 'cross' && q.v < 0.15 ? (q.stuck || 0) + dt : 0;
      if (q.ph === 'cross' && !pz.walk() && pz.left() < 3) q.squeeze = Math.max(q.squeeze || 0, 0.3); // (the walk over and still out on the road: on through the press, hurrying)
      if (q.stuck > 2) { q.squeeze = 1.5; q.stuck = 0; }
      if (q.squeeze > 0) q.squeeze -= dt;
      const gq = q.lead >= 0 ? q.lead : q.id;
      q.umbPush = false; // (pushed off by a neighbour's umbrella this step: below, it then stays where it was pushed)
      if (!(q.squeeze > 0)) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        for (let k = head[bucket(c0 + a, r0 + b)]; k >= 0; k = chain[k]) {
          if (k === i) continue;
          const o = P[k], ex = q.x - o.x, ey = q.y - o.y, e = Math.hypot(ex, ey);
          if (e > 2.4 || e < 1e-4) continue;
          const keep = (q.ph === 'wait' || q.lst) && sp === 0 ? ((o.lead >= 0 ? o.lead : o.id) === gq ? 0.55 : 0.68) : 0.75; // (stood waiting: close, as a crowd at a kerb stands, not shoved about by every neighbour; at 0.55 a kerb's crowd set in a knot two to a square metre; one of its own group closer, issue 75)
          if (e < keep) { const f = (keep - e) / e * 2.2; fx += ex * f; fy += ey * f; }
          if ((q.umbR > 0 || o.umbR > 0) && ((o.lead >= 0 ? o.lead : o.id) !== gq || (q.umbR > 0 && o.umbR > 0))) { // (under umbrellas: an umbrella's room between the canopies, issue 165; two of one group who both carry stand that far apart too, as friends under two umbrellas do)
            const u = umbRoom(q, o) + 0.04, cx = ex + (q.umbR > 0 ? q.ucx : 0) - (o.umbR > 0 ? o.ucx : 0), cy = ey + (q.umbR > 0 ? q.ucy : 0) - (o.umbR > 0 ? o.ucy : 0), ec = Math.hypot(cx, cy);
            if (u > 0.1 && ec < u && ec > 1e-4) { const f = (u - ec) / ec * 2.2; fx += cx * f; fy += cy * f; q.umbPush = true; }
          }
          if (vv > 0.3 && e < 2.4 && (o.vx * vx + o.vy * vy) < 0 && (-ex * vx - ey * vy) > 0) { const f = 0.5 * (2.4 - e) / 2.4; fx += -vy / vv * f; fy += vx / vv * f; } // (left: + across the heading)
        }
      }
      if (player) { const ex = q.x - player.x, ey = q.y - player.y, e = Math.hypot(ex, ey); if (e < 1.1 && e > 1e-4) { const f = (1.1 - e) / e * 2.5; fx += ex * f; fy += ey * f; } }
      // (and out of the way of those not of the crowd, as of the player: issue 65)
      for (let j = 0; j < K.length; j++) {
        const k = K[j], m = 1.1 + k.r + 1;
        if (Math.abs(k.ax - q.x) > m || Math.abs(k.ay - q.y) > m) continue;
        keepPt(k, q.x, q.y);
        const ex = q.x - kp.x, ey = q.y - kp.y, e = Math.hypot(ex, ey), rr = 1.1 + k.r;
        if (e < rr) { if (e < 1e-4) { fx += 1; continue; } const f = (rr - e) / e * 2.5; fx += ex * f; fy += ey * f; }
      }
      // (and, on the move, out of the lens's way: issue 82; those stood waiting, only of a lens come to rest: issue 129)
      if (LN && (LN.still > 0.5 || !((q.ph === 'wait' || q.lst) && sp === 0)) && Math.abs(LN.ax - q.x) < 5 && Math.abs(LN.ay - q.y) < 5) {
        keepPt(LN, q.x, q.y);
        const ex = q.x - kp.x, ey = q.y - kp.y, e = Math.hypot(ex, ey), rr = 1.1 + LN.r;
        if (e < rr && e > 1e-4) { const f = (rr - e) / e * 1.5; fx += ex * f; fy += ey * f; }
      }
      // and round a car caught in the box (a row of discs along it), and the posts
      gather(q.x, q.y, q, (frame + i) % 3 === 0 || !q.cars, q.z);
      for (const o of nearPosts) {
        const ex = q.x - o.x, ey = q.y - o.y, e = Math.hypot(ex, ey), rr = o.r + POST + 0.25;
        if (e < rr + 0.5 && e > 1e-4) { const f = Math.max(0, rr - e) / e * 3, side = vx * -ey + vy * ex > 0 ? 1 : -1, t = (rr + 0.5 - e) / e * Math.max(0.6, vv) * 0.9; fx += ex * f - ey * side * t; fy += ey * f + ex * side * t; }
      }
      for (const o of nearCars) {
        // (one on the move a second ahead too: out of its way before it gets there)
        const ox = Math.sin(o.h), oy = Math.cos(o.h), ahead = Math.min(6, (o.v || 0) * 1.0), k = Math.max(1, Math.round((o.half + ahead / 2) / o.hw)), rr = o.hw + KERB + 0.25;
        for (let m = 0; m < k; m++) {
          const u = k === 1 ? 0 : -o.half + o.hw + (2 * o.half + ahead - 2 * o.hw) * m / (k - 1), ex = q.x - (o.x + ox * u), ey = q.y - (o.y + oy * u), e = Math.hypot(ex, ey);
          if (e < rr + 0.6 && e > 1e-4) {
            const f = Math.max(0, rr - e) / e * (q.tight ? 0.6 : 3), side = vx * -ey + vy * ex > 0 ? 1 : -1, t = (rr + 0.6 - e) / e * Math.max(0.6, vv) * 0.9;
            fx += ex * f - ey * side * t; fy += ey * f + ex * side * t; // (out of it, and round it, on the side it is already heading for)
          }
        }
      }
      vx += fx; vy += fy;
      // (waiting: a nudge under a slow step is stood through, not shuffled to; a real push still moves them)
      if ((q.ph === 'wait' || q.lst) && sp === 0 && Math.hypot(vx, vy) < 0.35) vx = vy = 0;
      const m = Math.hypot(vx, vy), top = Math.max(sp, 0.6) * 1.15;
      if (m > top) { vx *= top / m; vy *= top / m; }
      // eased, as a body speeds up and turns
      const k = Math.min(1, dt * 5);
      q.vx += (vx - q.vx) * k; q.vy += (vy - q.vy) * k;
      // never a step into a car (one edging out of the box): stand, and let it by
      // (held up a while against a car caught in the box, with others round it: close along its side to get by)
      // (slow to forget: shuffling a step at a time is still stuck, and so is being put back out of a car's way)
      q.jam = q.ph === 'cross' && (q.v < 0.15 || q.ejected) ? (q.jam || 0) + dt : Math.max(0, (q.jam || 0) - dt * 0.25);
      q.tight = q.ph === 'cross' && (q.jam > 3 || (q.tight && q.jam > 0)); // (once close along a car's side, it stays close until it is through: no flipping back to the wide berth)
      const M = q.tight ? 0.12 : 0.3;
      q.ejected = false;
      if (q.jam > (pz.walk() ? 6 : 3)) { // (and still stuck: off the road by the nearest kerb whose way is clear, the one it set out
        // from or any other of the scramble's; sooner once the walk is over, the traffic's turn waiting on it, #197)
        let best = null, bd = Infinity;
        for (const h of gatesOf(pz)) {
          const back = spotAt(h, q.spread, 0.8, {}, pz.road), d = Math.hypot(back.x - q.x, back.y - q.y);
          if (d >= bd || d > 30) continue;
          let clear = true;
          for (let k = 1; k <= 8 && clear; k++) if (carDepth(q.x + (back.x - q.x) * k / 8, q.y + (back.y - q.y) * k / 8, 0.12) > 0) clear = false;
          if (clear) { best = h; bd = d; }
        }
        if (best) { q.g = null; toGate(q, best); q.jam = 0; return; }
        q.jam = pz.walk() ? 3.5 : 1.5;
      }
      const was = carDepth(q.x, q.y, M), nx = q.x + q.vx * dt, ny = q.y + q.vy * dt;
      if (was > 0.02) { // (caught by one, a car pulling up: straight out of it, the shortest way)
        const e = 0.05, gx = carDepth(q.x + e, q.y, M) - carDepth(q.x - e, q.y, M), gy = carDepth(q.x, q.y + e, M) - carDepth(q.x, q.y - e, M), gl = Math.hypot(gx, gy);
        let ux = -gx, uy = -gy, ul = gl;
        if (gl < 0.02) { // (on its long axis the discs' pulls cancel: out to the side, the one nearer where it was going)
          let o = null, best = -1;
          for (const c of nearCars) { const e = Math.hypot(q.x - c.x, q.y - c.y); if (e < c.half + c.hw + M && (best < 0 || e < best)) { best = e; o = c; } }
          if (o) { const sx = Math.cos(o.h), sy = -Math.sin(o.h), lat = (q.x - o.x) * sx + (q.y - o.y) * sy, toT = (q.T.x - q.x) * sx + (q.T.y - q.y) * sy, sd = Math.abs(lat) > 0.05 ? Math.sign(lat) : toT >= 0 ? 1 : -1; ux = sx * sd; uy = sy * sd; ul = 1; }
        }
        if (ul > 1e-6) { q.x += ux / ul * 1.2 * dt; q.y += uy / ul * 1.2 * dt; q.vx = ux / ul * 1.2; q.vy = uy / ul * 1.2; q.ejected = true; }
      } else if (carDepth(nx, ny, M) > was + 1e-4) { q.vx *= 0.3; q.vy *= 0.3; }
      else {
        // and never a step inside anyone: shoulder to shoulder at the kerb (0.45 m apart, centre to
        // centre), shoulders brushing out on the crossing or squeezing through (0.32 m); a step that
        // would come closer slides along them on one axis, or waits
        // (nor inside the player or any of those not of the crowd, issue 65: one already there may step out of them)
        const room = (x, y) => keepRoom(x, y, player ? Math.min(nearest1(i, x, y), Math.hypot(player.x - x, player.y - y) - (player.r || 0.15)) : nearest1(i, x, y));
        const hard = q.squeeze > 0 || q.ph === 'cross' ? 0.32 : 0.45, n0 = Math.min(hard, room(q.x, q.y));
        // (nor a step into a shut stair well: along its rim on one axis, or round it to the left)
        // (nor a step off the pavement into a carriageway while the traffic has its turn: on its way to a kerb of the
        // scramble it waits where the road stops it, and crosses from there with the walk. One sent to the nearest
        // kerb in a straight line, 30 m off and across Dogenzaka, stood in the lane at the Scramble's western stop line
        // with a car before it, each waiting on the other, 150 s, issue 175)
        const offWalk = q.ph !== 'cross' && !!pz.road && Math.abs(q.vx) + Math.abs(q.vy) > 0.05 && !pz.walk() && !pz.road(q.x, q.y);
        const inWell = shut && !shut(q.x, q.y) ? shut : null, ok = (x, y) => room(x, y) >= n0 - 1e-4 && !(inWell && inWell(x, y)) && !(offWalk && pz.road(x, y));
        if (offWalk && pz.road(nx, ny)) { if ((q.kerbT = (q.kerbT || 0) + dt) > 1.5) { q.kerbT = 0; q.T.x = q.x; q.T.y = q.y; q.ph = 'wait'; } } else q.kerbT = 0;
        if (ok(nx, ny)) { q.x = nx; q.y = ny; }
        else if (ok(nx, q.y)) { q.x = nx; q.vy *= 0.3; }
        else if (ok(q.x, ny)) { q.y = ny; q.vx *= 0.3; }
        else if (inWell && inWell(nx, ny) && ok(q.x - q.vy * dt, q.y + q.vx * dt)) { q.x -= q.vy * dt; q.y += q.vx * dt; }
        else { q.vx *= 0.3; q.vy *= 0.3; }
      }
      q.v = Math.hypot(q.vx, q.vy);
      ZAT.z = q.z;
      const z = ground ? ground(q.x, q.y, ZAT) : null;
      if (z != null) q.z = z;
      // short of its spot at the kerb and getting nowhere for a second, the crowd there in its way: it stands where
      // it is, at the back of them, as people do on reaching a crowd, instead of walking on the spot into their
      // backs until someone gives way (Shibuya: some pressed so for 27 s; tools/crowd_press.js)
      if ((q.ph === 'stroll' || q.ph === 'wait' || (q.ph === 'linger' && !q.lst)) && Math.hypot(q.T.x - q.x, q.T.y - q.y) > 0.6 && !(pz.road && pz.road(q.x, q.y))) {
        q.held = (q.av ?? q.v) < 0.15 ? (q.held || 0) + dt : 0;
        // (but where it stands is someone's place, a pace from it: another place of its own, twice at most, rather than
        // stand in their pocket, which heaped the crowd at a kerb into a knot as each arrival stopped against the last)
        if (q.held > 1 && q.ph === 'linger') { q.held = 0; q.T.x = q.x; q.T.y = q.y; q.lst = true; } // (held up on its way across the square: it stands about where it is)
        else if (q.held > 1) { q.held = 0; if ((q.reslot || 0) < 2 && q.g && !(q.lead >= 0) && !slotFree(q, q.x, q.y)) { q.reslot = (q.reslot || 0) + 1; slotAt(q.g, q, q.T, pz.road); } else { q.T.x = q.x; q.T.y = q.y; q.ph = 'wait'; q.reslot = 0; } }
      } else q.held = 0;
      // (the rain come on while it waits: its place was given a pace from its neighbours, before anyone had an umbrella,
      // and a row stood a pace apart cannot push itself an umbrella apart, each pushed back by the next. So as its own
      // umbrella goes up, one waiting whose place has not an umbrella's room from the places round it is given another
      // that has, once, as people step apart to put theirs up; where the kerb has none left it stays. Until November 2026
      // frame 7's kerb stood under canopies running through each other, issue 165)
      if (!(q.umbW > 0)) q.umbSlot = false;
      else if (!q.umbSlot && q.ph === 'wait' && q.g && !(q.lead >= 0) && q.T) { q.umbSlot = true; if (!slotFree(q, q.T.x, q.T.y)) slotAt(q.g, q, q.T, pz.road, false); }
      // (and stood under it with its canopy still inside a neighbour's, once a second: where the kerb had no place left
      // with an umbrella's room, or a press brought them together after, it stayed, and a kerb packed between the road
      // and the wall behind cannot push itself an umbrella apart. So of two stood so, the one later on the list finds
      // another place, at this kerb or one of its corner, or about the square; and where there is none it walks on along
      // the footway, out of the press, as people do when a kerb fills with umbrellas. Measured where the canopies are,
      // not where the places were given. Twice at most while its umbrella is up. Until November 2026 frame 7's kerb
      // stood under canopies running through each other after a long play, issue 187)
      if (!(q.umbW > 0)) q.umbMoved = q.umbChk = 0;
      else if (q.umbR > 0 && sp === 0 && (q.ph === 'wait' || q.lst) && q.g && !(q.lead >= 0) && (q.umbMoved || 0) < 2 && (q.umbChk = (q.umbChk || 0) + dt) >= 1) {
        q.umbChk = 0;
        const mx = q.x + (q.ucx || 0), my = q.y + (q.ucy || 0), c1 = Math.floor(q.x / CELL), r1 = Math.floor(q.y / CELL);
        let inside = false;
        for (let a = -1; a <= 1 && !inside; a++) for (let b = -1; b <= 1 && !inside; b++) {
          for (let k = head[bucket(c1 + a, r1 + b)]; k >= 0; k = chain[k]) {
            const o = P[k];
            if (k >= i || !(o.umbR > 0) || (o.av ?? o.v ?? 0) > 0.3 || (o.lead >= 0 ? o.lead : o.id) === gq) continue; // (the earlier of the two keeps its place; one walking by is past in a moment; friends lean apart)
            if (Math.hypot(mx - o.x - (o.ucx || 0), my - o.y - (o.ucy || 0)) < q.umbR + o.umbR - UMB_RIM) { inside = true; break; }
          }
        }
        if (inside) {
          q.umbMoved = (q.umbMoved || 0) + 1;
          if (q.ph === 'wait') { let to = slotAt(q.g, q, q.T, pz.road, false); for (const h of q.g.corner || []) { if (to) break; if ((to = slotAt(h, q, q.T, pz.road, false))) { q.g = h; count(q, h); } } if (!to) toFootway(q); }
          else if (lingerAt(q.g, q, q.T, pz.road)) q.lst = false;
          else toFootway(q);
          if (!q.pz) return; // (on along a footway: no longer of the square)
        }
      }
      // (waiting, pushed aside a step: the body keeps facing the road, as it does, rather than turning to every shove)
      if ((q.ph === 'wait' || (q.umbPush && (q.ph === 'linger' || q.lst))) && q.v > 0 && Math.hypot(q.T.x - q.x, q.T.y - q.y) < 1.5 && !(pz.road && pz.road(q.x, q.y))) { q.T.x = q.x; q.T.y = q.y; } // (one standing about whom an umbrella pushed off stays off too: walking back, the canopies met again, issue 165) // (and stays where it was pushed, up to a pace and a half, not back into the one who pushed it: walking back it turned about and back, Tokyo's kerb check, #283)
      if (!(q.ph === 'linger' && q.lst)) q.lh = null; // (its way to look round from, set afresh at each stand)
      const fw = heading(q, q.vx, q.vy, dt);
      if (q.face != null) q.h = q.face;
      else if (q.v > (q.ph === 'wait' ? (Math.hypot(q.T.x - q.x, q.T.y - q.y) > 1.2 ? 0.45 : Infinity) : 0.15) && fw > 0.12) turnTo(q, dt, 6, fw); // (waiting, it turns only to walk back a way to its place: shoved about in the press it keeps facing the road, #283)
      else if (q.ph === 'wait') {
        // (each a little turned its own way, and one waiting with its own turned partly to them, as people talk at a kerb:
        // a whole kerb's crowd squared to the road read as a parade, issue 75)
        let h = Math.atan2(-g.ox, -g.oy) + q.wf + glance(q, dt, 0.45); // (and now and then a look along the kerb, at the lights, back over a shoulder)
        const m = q.lead >= 0 ? P[q.lead] : q.mates && q.mates.length ? P[q.mates[0]] : null;
        // (two in five of the groups stand turned in to each other, talking, 30 to 60 degrees from the road; the rest abreast,
        // facing it, a little towards their own: Kendon's side-by-side and L arrangements)
        if (m && m.pz === pz && m.ph === 'wait') { const to = Math.atan2(m.x - q.x, m.y - q.y), gid = q.lead >= 0 ? q.lead : q.id; h += Math.atan2(Math.sin(to - h), Math.cos(to - h)) * (h01(gid, 5) < 0.4 ? 0.45 + 0.25 * h01(gid, 6) : 0.2); }
        q.h += Math.atan2(Math.sin(h - q.h), Math.cos(h - q.h)) * Math.min(1, dt * 0.8);
      }
      else if (q.ph === 'linger' && q.lst && q.lface != null && !q.mates && !(q.lead >= 0)) { const h = q.lface + glance(q, dt, 0.55); q.h += Math.atan2(Math.sin(h - q.h), Math.cos(h - q.h)) * Math.min(1, dt * 1.2); } // (leaning: the back to what it leans on, the head and shoulders turning to look about)
      else if (q.ph === 'linger' && q.lst && !q.mates && !(q.lead >= 0)) { // (alone, nothing to lean on: waiting for someone, it looks round for them, a while one way, a while another)
        if (q.lh == null) q.lh = q.h;
        const h = q.lh + glance(q, dt, 1.3); q.h += Math.atan2(Math.sin(h - q.h), Math.cos(h - q.h)) * Math.min(1, dt * 1.2);
      }
      else if (q.ph === 'linger' && q.lst && (q.lead >= 0 || q.mates)) { // (a group standing about: each turned to the others, as people talking stand)
        const L = q.lead >= 0 ? P[q.lead] : q, M = [L, ...(L.mates || []).map(j => P[j])].filter(o => o !== q && o.pz === q.pz);
        if (M.length) { let mx = 0, my = 0; for (const o of M) { mx += o.x; my += o.y; } mx /= M.length; my /= M.length; if (Math.hypot(mx - q.x, my - q.y) > 0.2) { const h = Math.atan2(mx - q.x, my - q.y) + glance(q, dt, 0.6); q.h += Math.atan2(Math.sin(h - q.h), Math.cos(h - q.h)) * Math.min(1, dt * 1.5); } }
      } // (facing the road, settling round to it over a second or so, as one does in a crowd, not swung round)
      // there: on the far side, on to a kerb of that corner (or this one) to wait again
      // (over, off the road, within a couple of paces of where it was going and held there a second by those standing
      // about: it has landed; walking on into them for its exact spot pressed a knot together on the far kerb)
      q.landT = q.ph === 'cross' && q.v < 0.3 && Math.hypot(q.T.x - q.x, q.T.y - q.y) < 2.5 && !(pz.road && pz.road(q.x, q.y)) ? (q.landT || 0) + dt : 0;
      if (Math.hypot(q.T.x - q.x, q.T.y - q.y) < 0.5 || q.landT > 1) {
        q.landT = 0;
        if (q.lead >= 0) { // (a mate: at its place; over before its leader, it waits for it on that side)
          if (q.ph === 'cross') { if (!(pz.road && pz.road(q.x, q.y))) { q.ph = 'stroll'; q.g = g.partner; count(q, g.partner); } }
          else if (q.ph === 'stroll') q.ph = 'wait';
          else if (q.ph === 'linger' && !q.lst) { q.lst = true; q.vx = q.vy = 0; }
        }
        else if (q.ph === 'cross' && pz.owe > 0 && toFootway(q)) pz.owe--;
        else if (q.ph === 'cross' && rnd() < LINGER && toLinger(q, g.partner)) { /* (over, and to stand about the square a while) */ }
        else if (q.ph === 'cross') { const c = g.partner.corner, n2 = rnd() < 0.55 && c.length ? c[Math.floor(rnd() * c.length)] : g.partner; q.g = null; if (!toGate(q, n2) && toFootway(q)) return; }
        else if (q.ph === 'stroll') q.ph = 'wait';
        else if (q.ph === 'linger' && !q.lst) { q.lst = true; q.vx = q.vy = 0; }
      }
    }
    // a glance (radians, within span either way) for someone standing: held a few seconds, then another, a third of them
    // straight ahead again. A crowd stood about the square with every head fixed for a minute read as stuck (the owner at
    // Hachiko, tools/crowd_still.js): a real person waiting looks round, along the kerb, back over a shoulder. Drawn from
    // the walker's own little sequence, not the crowd's rnd, so that the rest of the crowd's draws are as they were
    function glance(q, dt, span) {
      if (q.gzT == null) { q.gzS = (Math.imul(q.id + 7, 2654435761) >>> 0) || 1; q.gzT = 1 + (q.gzS % 600) / 100; q.gz = 0; }
      if ((q.gzT -= dt) <= 0) {
        const r = () => ((q.gzS = (Math.imul(q.gzS, 1664525) + 1013904223) >>> 0) / 4294967296);
        q.gzT = 3 + r() * 8; q.gz = r() < 0.33 ? 0 : (r() * 2 - 1) * span;
      }
      return q.gz;
    }
    // the way the body faces, out of where it is going: its velocity eased over a good part of a second,
    // so the jostle of a crowd (a shove one way, a step back the other) averages out rather than swinging
    // the body to and fro, and a slow shuffle, weighing little, turns it slowly. Returns the eased speed
    function heading(p, vx, vy, dt) {
      const k = Math.min(1, dt * 2.5);
      if (p.fx == null) { p.fx = vx; p.fy = vy; } else { p.fx += (vx - p.fx) * k; p.fy += (vy - p.fy) * k; }
      return Math.hypot(p.fx, p.fy);
    }
    function turnTo(p, dt, rate, fw) {
      const h = Math.atan2(p.fx, p.fy);
      p.h += Math.atan2(Math.sin(h - p.h), Math.cos(h - p.h)) * Math.min(1, dt * rate * Math.min(1, fw / 0.9));
    }
    // the pace the body shows: the ground it really covered (a sidestep round someone included, a step
    // put back for bumping into them not), eased over a quarter second, and walking or standing with a
    // margin between the two, so that a walker edging along in a queue or nudged in a crowd at a kerb
    // walks or stands rather than flickering between the two clips every few frames
    function gait(p, dt) {
      const lx = p.gx, ly = p.gy;
      p.gx = p.x; p.gy = p.y;
      let v = lx == null || !(dt > 0) ? p.v || 0 : Math.hypot(p.x - lx, p.y - ly) / dt;
      if (v > 4) v = p.v || 0; // (put somewhere else, not a pace)
      p.av = p.av == null ? v : p.av + (v - p.av) * Math.min(1, dt * 4);
      // (one waiting at a scramble's kerb, shoulder to shoulder and nudged by the press, stands through a slower shuffle than
      // that: at the margins above it broke into a step and out of it, Tokyo's "those waiting at its kerbs stand still"
      // step, 1015 turns or steps in 7592 looks, its crowd the deeper since its counts are kept right, #283)
      const kerb = p.pz && p.ph === 'wait';
      p.moving = p.state !== 'sit' && (p.moving ? p.av > (kerb ? 0.3 : 0.12) : p.av > (kerb ? 0.55 : 0.35));
    }
    let frame = 0;
    let ucx = 0, ucy = 0, uT = 0; // (uT: the world's time this step) // (where the crowd is centred this step: one held on a footway is put back near it, walk())
    function update(dt, cx, cy, t, player) {
      ucx = cx; ucy = cy; uT = t; api.t = t; // (api.t: the crowd's own time, for the checks' windows)
      waysStep();
      R.begin(dt, cx, cy, t, api.active);
      frame++;
      if (api.plazas && (frame % 15 === 1 || t < 1)) plazas(t, cx, cy);
      if (api.plazas) for (const pz of api.plazas) if (pz.j) { pz.j.busy = pz.busy || 0; pz.busy = 0; } // (who was out on its road last step: the signals wait for them)
      head.fill(-1); stepNo++;
      for (let i = 0; i < api.active; i++) {
        const q = P[i];
        if (q.line < 0) continue;
        const k = bucket(Math.floor(q.x / CELL), Math.floor(q.y / CELL));
        chain[i] = head[k]; head[k] = i; q.hashed = stepNo;
      }
      // groups part (a leader turns off, a mate falls behind) and were only made where someone comes out, so over a few
      // minutes their share sank from half to a quarter: now and then someone walking alone is joined, out of sight, by
      // people who were walking alone out of sight (formGroup puts none of them where the camera sees)
      if (frame % 20 === 7 && api.active > 8 && grouped() < 0.5) for (let k = 0; k < 2; k++) { // (to about half, as counted on a weekday street)
        const L = P[Math.floor(rnd() * api.active)];
        if (L.lead < 0 && !L.mates && !L.seat && !L.stop && L.line >= 0) formGroup(L, true);
      }
      // (api.fresh: the hour was set, not reached: those who come out with it are put anywhere, near the player too, as
      // when the game opens. A cut to lunchtime that put the lunch crowd only out of sight left the player's square empty)
      // The same on the crowd's first step. It was `t < 1`, the game's first second, but the title card holds the crowd
      // while the game's clock runs on under it, so by the time Play was pressed everyone was put as a latecomer is:
      // out of sight and 270 m off, or 45 m off where the crowd gathers. Nobody stood within 32 m of the player at
      // any map's opening (issue 494), whatever the map's numbers.
      const fresh = api.fresh > 0 || !opened; opened = true; if (api.fresh > 0) api.fresh -= dt;
      K = api.bodies || [];
      lensUpdate(player, dt); KW = LN ? K.concat([LN]) : K;
      const pvx = player ? Math.sin(player.h) * player.speed : 0, pvy = player ? Math.cos(player.h) * player.speed : 0;
      for (let i = 0; i < n; i++) {
        p = P[i];
        if (i >= api.active) { R.hide(i); release(p); if (p.pz) { uncount(p); p.pz = p.g = null; p.state = 'walk'; } if (p.lead >= 0 || p.mates) partGroup(p); p.line = -1; continue; }
        if (p.lead >= 0) groupSync(p); // (a mate: where its leader is, on a footway or at a scramble, and as it is)
        if (p.pz) { if (p.pause > 0) p.pause -= dt; plazaStep(i, p, dt, player); p.mode = 'ground'; gait(p, dt); R.place(i, p, p.moving); continue; }
        if (p.line < 0 || Math.hypot(p.x - cx, p.y - cy) > radius * 1.15) respawn(p, cx, cy, p.line < 0 && (t < 1 || fresh) ? 0 : radius * 0.6);
        if (p.line < 0) { R.hide(i); continue; }
        if (p.pause > 0) p.pause -= dt;
        if (p.arrived === 1 || (p.state === 'walk' && !p.pz && inPocket(p.line))) { // (stood where their way ended, arrive(), or on a footway that leads nowhere: elsewhere once nobody is looking)
          if (!seen(p.x, p.y, p.z)) { respawn(p, cx, cy, radius * 0.6); if (p.line < 0) { R.hide(i); continue; } }
          else if (inPocket(p.line)) { p.arrived = 1; if (p.pause < 1) p.pause += 4; }
          else if (p.pause <= 0) p.arrived = 2;
        }
        if (p.state === 'walk') { // farther off, a longer step every few frames does
          const d = Math.max(Math.abs(p.x - cx), Math.abs(p.y - cy)), k = d < NEAR ? 1 : d < FAR ? 2 : 4;
          if ((frame + i) % k === 0) { walk(i, k * dt, player, pvx, pvy); gait(p, k * dt); }
          if (p.line < 0 && !p.pz) { R.hide(i); continue; } // (sent on from inside someone, issue 65: gone, not drawn there)
        }
        else if (p.state === 'reg') regStep(i, p, dt);
        else if (p.state === 'sit') {
          p.v = p.vx = p.vy = 0;
          if ((p.t -= dt) <= 0) { release(p); backTo(p); p.state = 'leave'; }
        } else { // to a seat or back to the footway, in a straight line
          const g = p.state === 'approach' || p.state === 'board' ? p.seat : p.back, dx = g.x - p.x, dy = g.y - p.y, d = Math.hypot(dx, dy);
          gather(p.x, p.y, p, (frame + i) % 6 < 2 || !p.cars, p.z);
          // (not into a car pulled up by the bench: wait for it)
          let st = d > 1e-3 && blocked(p.x + dx / d * 0.05, p.y + dy / d * 0.05, false) > blocked(p.x, p.y, false) + 1e-4 ? 0 : Math.min(d, p.speed * 0.8 * dt);
          // nor into someone walking by: wait for them to pass (a few seconds at most, then on)
          if (st > 0 && d > 0.3 && (p.yield || 0) < 3 && crowded(p.x + dx / d * st, p.y + dy / d * st, p, CLOSE) && !crowded(p.x, p.y, p, CLOSE)) { st = 0; p.yield = (p.yield || 0) + dt; }
          else if (st > 0) p.yield = 0;
          if (d > 1e-3) { p.x += dx / d * st; p.y += dy / d * st; p.z += (g.z - p.z) * st / d; p.h = Math.atan2(dx, dy); }
          p.v = dt > 0 ? st / dt : 0; p.vx = d > 1e-3 ? dx / d * p.v : 0; p.vy = d > 1e-3 ? dy / d * p.v : 0;
          // (to a bus's door, api.board: aboard once there, or as it leaves, and back to the footway if it left without them)
          if (p.state === 'board' && (d - st < 0.35 || !(g.open && g.open()) || (p.bt = (p.bt || 0) + dt) > 14)) {
            const on = d - st < 1.2;
            p.seat = null; p.bt = 0;
            if (on) { api.boarded++; respawn(p, cx, cy, radius * 0.6); continue; } // (gone aboard: someone else comes into the crowd elsewhere)
            backTo(p); p.state = 'leave';
          } else if (d - st < 0.02) {
            if (p.state === 'approach') { p.state = 'sit'; p.x = g.x; p.y = g.y; p.z = g.z; p.h = g.h; p.t = 25 + rnd() * 50; }
            else { p.state = 'walk'; p.lat = null; p.dodge = 0; p.rest = 40 + rnd() * 60; } // walk() picks up the new direction
          }
        }
        p.mode = p.state === 'sit' ? 'sit' : 'ground';
        if (p.state !== 'walk') gait(p, dt);
        R.place(i, p, p.state !== 'sit' && p.moving);
      }
      R.end();
    }
    // One of the street's own people (web/game/regulars.js, issue 168): a walker of the crowd lent to a routine. While
    // it is lent (state 'reg') the crowd does not walk it: it goes straight to p.reg.goal ({ x, y, face, pace }) at its
    // own pace, waiting for whoever walks by as someone crossing to a bench does, and stands there turned to
    // goal.face (a heading, or null). The crowd goes on stepping round it as round anyone. enlist: a walker for whom
    // want(p) holds (the body and the clothes the routine's person wears), walking alone, out of sight, the farthest
    // such from (x, y), put there; null if there is none. dismiss: back to the crowd, somewhere else.
    function regStep(i, p, dt) {
      const g = p.reg.goal, dx = g.x - p.x, dy = g.y - p.y, d = Math.hypot(dx, dy);
      gather(p.x, p.y, p, (frame + i) % 6 < 2 || !p.cars, p.z);
      let st = d < 0.08 ? 0 : Math.min(d, p.speed * (g.pace || 0.9) * dt);
      if (st > 0 && d > 0.3 && (p.yield || 0) < 3 && crowded(p.x + dx / d * st, p.y + dy / d * st, p, CLOSE) && !crowded(p.x, p.y, p, CLOSE)) { st = 0; p.yield = (p.yield || 0) + dt; }
      else if (st > 0) p.yield = 0;
      if (st > 0) {
        const x = p.x + dx / d * st, y = p.y + dy / d * st;
        ZAT.z = p.z; const z = ground ? ground(x, y, ZAT) : p.z;
        p.x = x; p.y = y; if (z != null && Math.abs(z - p.z) < 1) p.z = z;
        const h = Math.atan2(dx, dy); p.h += Math.atan2(Math.sin(h - p.h), Math.cos(h - p.h)) * Math.min(1, dt * 6);
      } else if (g.face != null) p.h += Math.atan2(Math.sin(g.face - p.h), Math.cos(g.face - p.h)) * Math.min(1, dt * 2.5);
      p.v = dt > 0 ? st / dt : 0; p.vx = st > 0 ? dx / d * p.v : 0; p.vy = st > 0 ? dy / d * p.v : 0;
      p.reg.there = d < 0.3;
    }
    api.enlist = (want, x, y, z, h, reg) => {
      // (of some forty bodies-and-clothes a crowd of a few hundred has four or five each: first one nobody sees, else
      // the one farthest from the camera past 35 m, a figure among hundreds; one of a group leaves it)
      let best = null, bd = -1, far = null, fd = 35;
      for (let i = 0; i < api.active; i++) {
        const q = P[i];
        if (q.line < 0 || (q.state !== 'walk' && !q.pz) || q.seat || q.reg || !want(q)) continue; // (one of a scramble's crowd too: taken off its kerb's count)
        const d = Math.hypot(q.x - x, q.y - y);
        if (!seen(q.x, q.y, q.z)) { if (d > bd) { bd = d; best = q; } }
        else if (eye) { const de = Math.hypot(q.x - eye.position.x, q.y + eye.position.z); if (de > fd) { fd = de; far = q; } }
      }
      const q = best || far;
      if (!q) return null;
      if (q.lead >= 0 || q.mates) partGroup(q);
      if (q.pz) { uncount(q); q.pz = q.g = null; }
      q.stop = null; q.stopFace = null; q.arrived = 0; q.pause = 0; q.kerbNext = null; q.kerbBack = false; q.fx = q.gx = q.av = null; q.moving = false; q.lat = null;
      q.state = 'reg'; q.mode = 'ground'; q.reg = reg;
      q.x = x; q.y = y; q.z = z; q.h = h || 0; q.v = q.vx = q.vy = 0;
      // (what they do with their hands while they stand: one of the cast's own clips and its small shared thing, a camera, a phone)
      if (reg.clip && q.look) { q.look0 = q.look; q.look = Object.assign({}, q.look, { clip: reg.clip }); }
      return q;
    };
    api.dismiss = q => { if (q && q.state === 'reg') { q.state = 'walk'; q.reg = null; q.line = -1; if (q.look0) { q.look = q.look0; q.look0 = null; } } };
    api.seen = seen;
    // turn round where it stands: the way along the line and the offset across it both flip, so the
    // walker stays on the spot (and drifts over to its own side as it walks on) rather than jump
    // across the footway
    // The way ahead has ended (a footway with no way on, a major road with no crossing): they have arrived (issue
    // 168). Out of sight they are somewhere else. In sight they stop where they are, as a person does who has got
    // where they were going, for ten to twenty-five seconds; then, still in sight, they walk back the way they came
    // (false: the caller turns them, once), unless that way is closed too (a pocket): there they stand until nobody is
    // looking. A mate does as its leader does. True: nothing more to do for this walker this step.
    function arrive(q) {
      if (q.lead >= 0) { // (ahead of its leader at the end: it waits there for the leader, who arrives, and turns when the leader does)
        const G = P[q.lead];
        if (!G || G.line !== q.line || G.dir !== q.dir) return false;
        q.s = Math.max(0, Math.min(net.L[q.line].len, q.s)); q.v = 0;
        return true;
      }
      if (q.arrived === 1) return true;
      if (q.arrived === 2) { q.arrived = 0; return false; }
      if (!seen(q.x, q.y, q.z)) { respawn(q, ucx, ucy, 25); return true; }
      q.s = Math.max(0, Math.min(net.L[q.line].len, q.s)); q.v = 0; q.pause = Math.max(q.pause, 10 + rnd() * 15); q.arrived = 1;
      api.arrived = (api.arrived || 0) + 1;
      return true;
    }
    function turn(q, why) {
      // (a mate turns when its leader does, not for a reason of its own while it walks with the leader: it turned, the
      // leader had not, and the next step turned it back, to and fro, issue 168)
      if (q.lead >= 0 && why !== 'the leader turned' && why !== 'restore') { const G = P[q.lead]; if (G && G.line === q.line && G.dir === q.dir) return; }
      // (and nobody turns twice in AGAIN seconds: hemmed in both ways (a parked car's bumper over the footway and a
      // post behind, someone met in a lane and someone else behind) a walker turned every few metres, to and fro, for
      // as long as it lasted. Where they would turn again they stop instead, as someone who has thought better of it,
      // for ten to twenty-five seconds (arrive's standing: gone once nobody is looking). Not held back: a turn put
      // back in the step it was made, a mate following its leader, and a walker getting out of a car's way)
      if (why === 'restore') q.turnedT = q.turnedT0;
      else if (why === 'a car waited on them') { if (uT - (q.carT ?? -1e9) < 8) return; q.carT = uT; } // (out of a car's way once: turned again a second later it walked back into it, four turns in thirty seconds)
      else if (why !== 'the leader turned' && why !== 'a car waited on them' && why !== 'held in the road') {
        if (uT - (q.turnedT ?? -1e9) < AGAIN) { q.v = 0; q.pause = Math.max(q.pause, 10 + rnd() * 15); q.arrived = 1; api.thought = (api.thought || 0) + 1; return; }
        q.turnedT0 = q.turnedT; q.turnedT = uT;
      }
      q.dir = -q.dir; q.hx = -q.hx; q.hy = -q.hy; if (api.why) q.turnWhy = why; // (why: for the harnesses, what turned it)
      if (q.lat != null) q.lat = -q.lat;
      q.dodge = -q.dodge;
      if (q.fx != null) { q.fx = -q.fx; q.fy = -q.fy; } // (turned back: faces the new way at once, not walking backwards until the eased way catches up)
      if (q.lim != null) { q.lim = -q.lim; q.limWant = -q.limWant; }
    }
    function walk(i, dt, player, pvx, pvy) {
      const l = net.L[p.line];
      if (p.lat == null) { // just placed: put it there
        p.lat = p.side; p.v = p.speed; lineAt(p.line, p.s, tmp); p.hx = tmp.hx * p.dir; p.hy = tmp.hy * p.dir;
        p.lat = p.lim = wallFree(p, p.limWant = p.side, Math.max(1, (FOOTW[l.c] || 3) / 2)); // (placed out of sight: straight to where there is room)
        p.x = tmp.x - p.hy * p.lat; p.y = tmp.y + p.hx * p.lat; p.z = tmp.z;
        settle(p);
      }
      // (inside the player or one of those not of the crowd, put down there: across the footway out of them at once, or,
      // with them square in its way, sent on elsewhere as one the crowd is done with; issue 65)
      if (dt > 0 && keepIn(p, player, 0.3)) {
        const ax = ko.x - p.x, ay = ko.y - p.y, a = ax * p.hx + ay * p.hy, lc = ax * -p.hy + ay * p.hx, to = ko.r + 0.34;
        if (Math.abs(a) >= to) { /* (clear of them along the way already) */ }
        else {
          const dl = (Math.abs(lc) < 1e-3 ? 1 : -Math.sign(lc)) * (Math.sqrt(to * to - a * a) - Math.abs(lc));
          const nx = p.x - p.hy * dl, ny = p.y + p.hx * dl;
          if (Math.abs(p.lat + dl) < Math.max(1, (FOOTW[l.c] || 3) / 2) + 0.5 && !(clear && !clear(nx, ny, p.z))) { p.lat += dl; if (p.lim != null) p.lim += dl; p.x = nx; p.y = ny; p.rx = null; }
          else { p.line = -1; return; }
        }
      }
      if (p.give) { // stood in the road in front of a car that has waited on them: turn back, out of its way
        p.give = false;
        if (p.v < 0.3 && p.pause <= 0) { turn(p, 'a car waited on them'); p.wait = p.still = 0; }
      }
      const G = p.lead >= 0 ? P[p.lead] : null; // (one of a group: its leader, whose place by it it keeps)
      if (G && G.line === p.line && G.dir !== p.dir && Math.hypot(G.x - p.x, G.y - p.y) < 6) turn(p, 'the leader turned'); // (the leader turned back: so does it)
      // (stopped along the way: turned to the window, or with its back to the rail, over a second or so; the stop over, on)
      if (p.stop && p.stop.on && p.pause <= 0) { p.stop = null; p.stopFace = null; }
      if (p.stop && !p.stop.on && ((p.stop.try += dt) > 5 || p.detourT > 0)) { p.stop = null; p.stopFace = null; }
      if (p.pause > 0 && p.stopFace != null) { const h = p.stopFace + (p.stop && p.stop.on ? glance(p, dt, p.stop.kind === 'window' ? 0.3 : 0.6) : 0); p.h += Math.atan2(Math.sin(h - p.h), Math.cos(h - p.h)) * Math.min(1, dt * (p.stop && p.stop.on ? 1.2 : 2.5)); } // (stood there: along the window, or about the street from the rail, tools/crowd_still.js)
      hx = p.hx; hy = p.hy; // the lane's direction where the walker is, from the last step
      push = 0; cap = G ? p.speed + 0.5 : p.speed; nn = 0; blk = -1; // (a mate may walk a little quicker, to catch its leader up)
      const c0 = Math.floor(p.x / CELL), r0 = Math.floor(p.y / CELL);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        for (let j = head[bucket(c0 + a, r0 + b)], jc = 0; j >= 0 && jc < n; j = chain[j], jc++) if (j !== i) { const o = P[j]; if (!(p.squeeze > 0) && !mateOf(p, o)) { seeJ = j; see(o.x, o.y, o.vx, o.vy, BODY, 1); } if (nn < nbr.length) nbr[nn++] = j; } // (bounded: a walker put into the hash twice in one step, by a respawn and a routine's lending, made a bucket's chain run on into another's and overran the list) // (its own group walks with it, not in its way)
      }
      // (squeezing through a knot it brakes and steers for no one, but still never steps inside anyone: closest() below)
      if (p.squeeze > 0) p.squeeze -= dt;
      seeJ = -1;
      const capPeople = cap, blkI = blk, blkA = blkAhead, blkL = blkLat;
      // (going round the player it steers by its detour, closest() below still keeping it out of them)
      if (player && !(p.detourT > 0 && p.detourOf === -2)) see(player.x, player.y, pvx, pvy, BODY + (player.r || 0.15), 1.6); // give the player a little more room (a car more)
      // (and those standing who are not of the crowd, as the player, issue 65; while going round one, by its detour)
      if (!(p.detourT > 0 && p.detourOf === -3) && !(p.ghost > 0)) for (let j = 0; j < KW.length; j++) { const k = KW[j]; if (Math.abs(k.ax - p.x) < 7 && Math.abs(k.ay - p.y) < 7) { keepPt(k, p.x, p.y); see(kp.x, kp.y, 0, 0, BODY + k.r, 1.6); } }
      // the player on its course, close ahead (where it is, not where it will be: stood still face to face,
      // the closing speed is nil and see() no longer counts them)
      let pAhead = 0, pLat = 0, byPlayer = false;
      if (player) { const dx = player.x - p.x, dy = player.y - p.y; pAhead = dx * hx + dy * hy; pLat = dx * -hy + dy * hx; byPlayer = pAhead > 0 && pAhead < 2.4 && Math.abs(pLat) < BODY + (player.r || 0.15); }
      // (or, with the player not in its way, one of those not of the crowd standing on its course: gone round as the player is)
      let obR = player ? player.r || 0.15 : 0.15, obOf = -2;
      if (!byPlayer && !(p.ghost > 0)) for (let j = 0; j < K.length; j++) { // (squeezing on past them, issue 85: sidled by a shoulder off, ghostBad; the lens is steered round, never turned back from)
        const k = K[j];
        if (Math.abs(k.ax - p.x) > 4 || Math.abs(k.ay - p.y) > 4) continue;
        keepPt(k, p.x + hx * 1.2, p.y + hy * 1.2);
        const dx = kp.x - p.x, dy = kp.y - p.y, a = dx * hx + dy * hy, l = dx * -hy + dy * hx;
        if (a > 0 && a < 2.4 && Math.abs(l) < BODY + k.r && (!byPlayer || a < pAhead)) { pAhead = a; pLat = l; byPlayer = true; obR = k.r; obOf = -3; }
      }
      gather(p.x, p.y, p, (p.steps = (p.steps || 0) + 1) % 2 === 0 || !p.cars, p.z);
      // the benches' two seats: step round them, without slowing (it may be passing to sit down)
      let cap0 = cap;
      if (!(p.ghost > 0)) { // (squeezing on past, held a while: not braking for a bollard in front of it, issue 85)
        for (const bn of nearBenches) for (const st of bn.seats) if (st.by !== i) see(st.x, st.y, 0, 0, 0.5 + HALF, 1);
        for (const o of nearPosts) see(o.x, o.y, 0, 0, o.r + POST + HALF, 1); // and round the posts and trunks
      }
      cap = cap0;
      // a walker caught beside a car (it pulled up, say) steps on out rather than wait for it
      const was = blocked(p.x, p.y);
      cap0 = cap;
      for (const o of nearCars) seeCar(o);
      if (was > 0) cap = cap0;
      // sideways within the footway (a little past its edge for whoever keeps far left), and speed
      // (out on a scramble's crosswalk, a band of stripes 4 to 6 m wide: across its width, each walker keeping to
      // its left so the two crowds pass rather than meet face to face in the middle of the road)
      const X = api.crossings && api.crossings.byLine.get(p.line), band = X && X.some(x => x.scramble && Math.abs(x.s - p.s) < x.kerb);
      const hw = band ? 2.6 : Math.max(1, (FOOTW[l.c] || 3) / 2), side = band ? 1.2 + 0.5 * Math.max(-1.6, Math.min(1.6, p.side)) : p.side; // (lat: to the walker's left)
      p.dodge += (Math.max(-1.5, Math.min(1.5, push * 1.2)) - p.dodge) * Math.min(1, dt * 4);
      let want = Math.max(-hw + 0.3, Math.min(Math.max(hw, side) + 0.2, side + p.dodge));
      // one of a group: across the way at its place by the leader, along it by its pace; a leader holds back for its mates
      let gcap = Infinity;
      if (G) {
        // (held up, by people coming the other way or a kerb's crowd: into single file behind the leader, and out of the
        // way as anyone alone would be; a group abreast met head on had blocked a footway a minute)
        const jam = (p.slow || 0) > 0.4 || (p.still || 0) > 0.2 || (G.slow || 0) > 0.4 || (G.still || 0) > 0.2 || p.blkO || G.blkO || p.oncoming || G.oncoming; // (or someone coming the other way, close: into single file before they meet, issue 85)
        const n = 1 + (G.mates ? G.mates.length : 1), dense = jam ? 1 : Math.max(0, Math.min(1, (nn - 8) / 24));
        const sl = mateSlot(G, p.gk || 1, n, hw, dense), along = (G.x - p.x) * hx + (G.y - p.y) * hy;
        if (G.line === p.line && G.dir === p.dir) want = Math.max(-hw + 0.3, Math.min(Math.max(hw, side) + 0.2, sl.lat + p.dodge * (jam ? 1 : 0.5)));
        const err = along - sl.back;
        gcap = Math.max(G.line === p.line && !(nn > 8) && !((G.mgT || 0) > 1) ? 0 : 0.3, (G.v || 0) + Math.max(-1, Math.min(0.8, err * 1.5))); // (in a crowd never stood still in its way, nor waiting on a leader that is itself held: issue 85)
        if (G.pause > 0 && G.stop && Math.abs(err) < 0.4) { p.pause = Math.max(p.pause, 0.3); p.stopFace = G.stopFace; } // (and stops with it)
        else if (p.stopFace != null && !p.stop) p.stopFace = null;
      } else if (p.mates && nn < 16) { // (in a crowd it goes on with the flow: a lagging mate catches up or parts)
        for (const j of p.mates) { const o = P[j]; if (o.lead !== p.id || o.pz) continue; const lag = (p.x - o.x) * hx + (p.y - o.y) * hy; if (lag > 2.5) gcap = Math.min(gcap, Math.max(0.3, p.speed * (lag > 5 ? 0.3 : 0.6))); }
      }
      if ((p.mgT || 0) > 2.5) gcap = Math.max(gcap, 0.5); // (held a while: on, whatever its place by the leader, rather than stand waiting on it, issue 85)
      // a stop along the way (stopAt): over to the window or the rail, slowly, and there stood a while
      if (!G && !p.stop && (p.browse -= dt) <= 0) { p.browse = 60 + rnd() * 120; if (p.v > 0.5 && p.pause <= 0 && nn < 10 && hw >= 1.5) stopAt(p, l, X, hw); } // (not in a crowd, nor where a footway is too narrow to stand aside on)
      if (p.stop) { want = p.stop.lat; if (!p.stop.on) gcap = Math.min(gcap, 0.55); else if (nn > 12 && p.pause > 1) p.pause = 1; } // (the way filling up round it: it moves on)
      // someone stood in its way (it has slowed right down for them): after a moment, a detour round
      // them, as people do, to the side of them that is clear of the walls and inside the footway (its
      // own side first), wide enough to pass a body's width clear. Of two face to face the first takes
      // it and the other waits for it; a second later the other goes round if the first could not
      if (p.detourT > 0) p.detourT -= dt;
      const stopped = blkI >= 0 && Math.abs(cap - capPeople) < 1e-6 && p.v < 0.35 && blkA < 1.5;
      p.stuckT = stopped ? (p.stuckT || 0) + dt : 0;
      if (stopped && !(p.detourT > 0) && p.stuckT > (i < blkI ? 0.35 : 1.1)) {
        const o = P[blkI];
        if (!(o.detourT > 0 && o.detourOf === i)) {
          const olat = p.lat + blkL, gap = CLOSE + 0.22, lo = -hw + 0.25, hi = Math.max(hw, side) + 0.2, own = side >= 0 ? 1 : -1;
          if (clear) lineAt(p.line, p.s, tmp);
          let best = null;
          for (const sg of [own, -own]) {
            const tl = olat + sg * gap;
            if (tl < lo || tl > hi || (clear && Math.abs(wallFree(p, tl, hw) - tl) > 1e-6)) continue;
            if (!best || Math.abs(tl - p.lat) < Math.abs(best - p.lat) - 0.3) best = tl;
          }
          if (best != null) { p.detourT = 2.5; p.detourLat = best; p.detourOf = blkI; }
          else p.stuckT = 0; // (no way round: it waits, and in the end turns back)
        }
      }
      // the player in its way (they never step aside for it): at once a detour round them, a body's width
      // clear of them where the way is wide enough, else sidling past shoulder to shoulder (a torii tunnel
      // two people wide), to the side with room; with no room at all (a lane between walls) it turns back
      // after a moment rather than stand in front of them
      const pStop = byPlayer && p.v < 0.6 && !(p.detourT > 0);
      p.pStuck = pStop ? (p.pStuck || 0) + dt : 0;
      if (pStop && p.pStuck > 0.2) {
        const olat = p.lat + pLat, pr = obR, lo = -hw + 0.15, hi = Math.max(hw, side) + 0.3, own = side >= 0 ? 1 : -1;
        if (clear) lineAt(p.line, p.s, tmp);
        let best = null;
        for (const gap of [BODY + pr + 0.12, CLOSE + pr + 0.1]) {
          for (const sg of [own, -own]) {
            const tl = olat + sg * gap;
            if (tl < lo || tl > hi || (clear && Math.abs(wallFree(p, tl, hw) - tl) > 1e-6)) continue;
            if (best == null || Math.abs(tl - p.lat) < Math.abs(best - p.lat) - 0.3) best = tl;
          }
          if (best != null) break;
        }
        if (best != null) { p.detourT = 3; p.detourLat = best; p.detourOf = obOf; p.pStuck = 0; }
        else if (p.pStuck > 0.9) { turn(p, 'no way round you'); p.pStuck = 0; p.still = 0; p.pBack = 3; }
      }
      // and whoever it then meets face to face, coming on behind it, sees the way is shut and turns too
      if (p.pBack > 0) p.pBack -= dt;
      if (stopped && blkI >= 0 && P[blkI].pBack > 0 && P[blkI].dir !== p.dir && p.stuckT > 0.3) { turn(p, 'whoever was ahead turned from you'); p.stuckT = 0; p.still = 0; p.pBack = 3; }
      // slowed to a crawl by the crowd at a scramble's kerb, just ahead: one of them, standing where it is at the
      // back of them, as someone coming up to a crowd at a crossing does, rather than creeping into their backs
      // and in the end turning back (Shibuya: a tenth of the footways' walkers near you at any moment).
      // Unreal's Mass and Detour's crowds settle an agent that reaches a queue the same way
      let pzAhead = null;
      if (p.v < 0.3) for (let k = 0; k < nn; k++) {
        const o = P[nbr[k]], ex = o.x - p.x, ey = o.y - p.y;
        if (o.pz && o.ph !== 'cross' && ex * ex + ey * ey < 2.6 && ex * hx + ey * hy > 0.1) { pzAhead = o.pz; break; }
      }
      p.pzSlow = pzAhead ? (p.pzSlow || 0) + dt : 0;
      if (p.pzSlow > 0.6 && joinPlaza(p, pzAhead)) { p.pzSlow = 0; return; }
      if (p.detourT > 0) want = p.detourLat;
      // (counted out on a scramble's crosswalk, for its signals to wait for; and massed at its kerbs, spread
      // across the stripes' width rather than in single file)
      if (X && X.scramble) for (const x of X) if (x.scramble && Math.abs(x.s - p.s) < x.kerb - 0.3 && x.scramble.plaza) x.scramble.plaza.busy = (x.scramble.plaza.busy || 0) + 1;
      if (!band && X && X.scramble && X.some(x => x.scramble && Math.abs(x.s - p.s) < x.kerb + 5)) want = Math.max(-SCR_HW, Math.min(SCR_HW, p.spread * SCR_HW + p.dodge));
      // a facade beside the line, here or a little ahead: in towards the line (looked at every few steps)
      if (clear && ((p.wallStep = (p.wallStep || 0) + 1) % 3 === 0 || p.lim == null)) { lineAt(p.line, p.s, tmp); p.lim = wallFree(p, want, hw); p.limWant = want; }
      if (clear && p.lim != null && p.lim !== p.limWant) want = p.limWant >= 0 ? Math.min(want, p.lim) : Math.max(want, p.lim); // (no further out on that side)
      const lv = p.v < 0.2 && p.kw > 0.5 ? 0.25 : 0.9; // (stood at a kerb a while: a slow shuffle across, not a slide)
      let dl = Math.max(-lv * dt, Math.min(lv * dt, want - p.lat));
      p.lat += dl;
      if (p.stop && !p.stop.on && Math.abs(want - p.lat) < 0.12 && Math.abs(want - p.stop.lat) < 0.5) { p.stop.on = true; p.pause = p.stop.t; } // (there: it stands)
      // a road ahead at a junction with signals, its traffic free to go: up to the kerb, and wait
      // there (the button pressed) for the walk signal; someone already out in the road walks on
      // (at a scramble, only with the time to reach the far kerb before the traffic moves)
      let atKerb = false;
      // (out in a scramble's road when its walk is over: off it with its own crowd, to the nearest kerb they wait at)
      if (X) for (const x of X) if (x.at && Math.abs(x.s - p.s) < x.kerb - 0.3 && !api.crossings.walk(x.a) && toPlaza(p, x.at, 30)) return;
      if (X && !X.some(x => Math.abs(x.s - p.s) < x.kerb - 0.3)) for (const x of X) { // (not while out in a road: over a median, it crosses the other half too)
        const d = (x.s - p.s) * p.dir;
        if (x.at && d > x.kerb - 0.4 && d < x.kerb + 1.5 && toPlaza(p, x.at)) return; // (to the scramble's own crowd)
        if (d > x.kerb - 0.4 && d < x.kerb + 3 && (!api.crossings.walk(x.a) || (x.scramble && api.crossings.walkLeft(x.a) < (d + x.kerb) / (p.speed * 0.65)))
          && !(G && G.line === p.line && api.crossings.walk(x.a) && Math.abs(x.s - G.s) < x.kerb)) { // (not while its leader is already out across it)
          atKerb = true; api.crossings.call(x.a); cap = Math.min(cap, Math.max(0, (d - x.kerb) * 1.5));
        }
      }
      // a road ahead with no crossing marked on it (no signals, no zebra): a look both ways first, and a wait at
      // the kerb while a car would be there within 3.5 s, as the law asks of someone crossing away from a
      // crossing (Japan's Road Traffic Act, art. 13; the UK's Highway Code, rule 7) and as people do. Before,
      // the crowd stepped out regardless and every car stopped for it, one after another: on the streets east
      // of Shibuya station a queue stood for the people crossing, car after car, for minutes. Out in the road,
      // it goes on across; after 20 s at the kerb it takes its chance at walking pace, the cars braking for it
      if (!atKerb && api.crossings && api.crossings.road && api.cars && !(X && X.some(x => Math.abs(x.s - p.s) < x.kerb + 2))) {
        const E = roadEntries(p.line);
        let held = false;
        for (const e of E) {
          if (e.dir !== p.dir) continue;
          const d = (e.s - p.s) * p.dir;
          if (d < -0.2 || d > 2.2) continue;
          if (e.major) { p.gw = 0; if (arrive(p)) return; turn(p, 'a major road with no crossing'); break; } // (a major road with no crossing here: back, to the crossing another way)
          if ((p.gw || 0) < 20 && carComing(e.x, e.y, p.z)) { held = true; cap = Math.min(cap, Math.max(0, (d - 0.3) * 1.5)); }
          break;
        }
        p.gw = held ? (p.gw || 0) + dt : 0;
        if (held) atKerb = true;
      }
      // a level crossing's alarm sounding ahead (rail.js gateAhead, set as api.gate by the game): up to its line and
      // wait there, as at a kerb; someone between the gates when it starts walks on out
      if (api.gate) { const g = api.gate(p.x, p.y, hx, hy); if (g != null) { atKerb = true; cap = Math.min(cap, g * 1.5); } }
      if (atKerb && p.v < 0.05) api.kerbWait += dt;
      // each wait at a kerb for the walk, from coming up to it to stepping out (tools/traffic_check.js)
      if (atKerb) p.kw = (p.kw || 0) + dt;
      else if (p.kw) { if (api.kerbWaits.length < 4000) api.kerbWaits.push(p.kw); p.kw = 0; }
      if (api.why) p.why = { capPeople: +capPeople.toFixed(2), cap: +cap.toFixed(2), gcap: +Math.min(9, gcap).toFixed(2), atKerb, blk: blkI, nn, byPlayer, detourT: +(p.detourT || 0).toFixed(1), want: +want.toFixed(2), hw }; // (for the harnesses: what holds it, tools/crowd_spread.js)
      const target = p.pause > 0 ? 0 : Math.min(p.speed, cap, gcap);
      p.v = Math.max(0, p.v + Math.max(-3 * dt, Math.min(1.2 * dt, target - p.v)));
      // face to face with someone neither can get round: after a while, turn back
      p.still = p.pause <= 0 && p.v < 0.05 && !atKerb && !p.kerbNext && !p.kerbBack && !(gcap < 0.1) ? (p.still || 0) + dt : 0; // (a mate held by its leader is not stuck)
      // caught in a knot of walkers where footways meet (a thick crowd's head-on): shuffle on through
      // it for a moment, as people in a crush do (and off a road, through those waiting at its kerb);
      // never into the crowd massed at a kerb, though
      p.slow = p.pause <= 0 && p.v < 0.25 && !atKerb && !p.kerbNext && !p.kerbBack && !(gcap < 0.3) ? (p.slow || 0) + dt : 0; // (or barely edging through it)
      if ((p.still > 1.5 || p.wait > 1.5 || p.slow > 2.5) && !(X && X.some(x => { const d = (x.s - p.s) * p.dir; return d > x.kerb - 0.3 && d < x.kerb + 10; }))) { p.squeeze = 1.2; p.slow = 0; }
      if (p.still > 2.5 && !(p.mgT < 6 && p.blkO)) { turn(p, 'face to face, still'); p.still = 0; } // (and so takes another way: a different line at the next corner; not for people coming the other way, who are passed)
      // made no ground for a while (half a metre, not waiting at a kerb or stopped along the way): people met head on on a
      // footway pass each other, a step aside and a turn of the shoulder, groups too, in single file. Before, two groups
      // abreast met on one line of a narrow footway stood in a knot for minutes, each turning back into those behind it
      // and back again (issue 85; tools/crowd_spread.js, tools/crowd_knot.js). So, held: after a second and a half it
      // squeezes (no braking for anyone, a shoulder closer, closest()); after two and a half, over to its own side's edge,
      // where those coming the other way are not, in single file (after four, to the middle instead: the edge's posts);
      // after four and a half, for two seconds, on through the walkers and the posts round it as best it can (p.ghost:
      // never into a car, the player or the story's people); and after six and a half, out of sight, it is somewhere
      // else nearby, out of sight as a new walker is (put far off, the footways round the player emptied over two minutes),
      // or in sight, turns and takes another way (and held a second and a half more, it is somewhere else all the same)
      const freeNow = atKerb || p.pause > 0 || p.kerbNext || p.kerbBack || p.stop;
      if (freeNow || p.mgx == null || Math.hypot(p.x - p.mgx, p.y - p.mgy) > 0.5) { if (p.mgx != null) p.esc = 0; p.mgx = p.x; p.mgy = p.y; p.mgT = 0; }
      else p.mgT = (p.mgT || 0) + dt;
      p.blkO = blkI >= 0 && P[blkI].dir !== p.dir && P[blkI].line === p.line;
      // (anyone coming the other way along its line within 4 m ahead and less than a body's width across: the group in front
      // of them falls into single file, each walker over towards its own side, as people do before they meet)
      p.oncoming = false;
      for (let k = 0; k < nn && !p.oncoming; k++) { const o = P[nbr[k]]; if (o.line !== p.line || o.dir === p.dir || mateOf(p, o)) continue; const ex = o.x - p.x, ey = o.y - p.y, a = ex * hx + ey * hy; if (a > 0 && a < 4 && Math.abs(ex * -hy + ey * hx) < 1.2) p.oncoming = true; }
      if (p.mgT > 1.5) p.squeeze = Math.max(p.squeeze || 0, 0.4);
      if (p.mgT > 2.5 && !(p.detourT > 0)) { p.detourT = 2; p.detourOf = -4; p.detourLat = p.mgT > 4 ? 0 : side >= 0 ? Math.max(hw, side) - 0.05 : -hw + 0.3; } // (and that not helping, the footway's middle: one at the edge between two bollards was pulled back into the gap)
      if (p.ghost > 0) p.ghost -= dt;
      if (p.mgT > 4.5 && !(p.ghost > 0) && !((p.ghostT || 0) > p.mgT)) { p.ghost = 2; p.ghostT = p.mgT + 2; }
      if (p.mgT > (p.esc ? 1.5 : 6.5)) { p.mgT = 0; p.mgx = null; p.ghostT = 0; p.esc = (p.esc || 0) + 1; if (p.esc > 1 || !seen(p.x, p.y, p.z)) { p.esc = 0; respawn(p, ucx, ucy, 25, 70); return; } turn(p, 'held in the road'); p.still = 0; } // (turned and held again: elsewhere even in sight, a pocket by someone standing on a footway's node, issue 85)
      const s0 = p.s, line0 = p.line, dir0 = p.dir, lat0 = p.lat - dl;
      p.s += p.dir * p.v * dt;
      // a bench on this stretch with a free seat: maybe sit down
      p.rest -= dt;
      const here = BN && p.rest <= 0 && p.v > 0.3 && !G && !p.mates && !p.stop ? BN.byLine.get(p.line) : null; // (a group walks on together)
      if (here) for (const b of here) {
        if ((b.s - s0) * (b.s - p.s) > 0) continue;
        const seat = b.seats.find(q => q.by < 0);
        if (!seat || rnd() >= api.sitChance(b)) continue;
        seat.by = i; p.seat = seat; p.state = 'approach';
        return;
      }
      if (p.s < 0 || p.s > l.len) {
        // on along the next line, or back; but where that steps straight out into a road at a
        // crossing whose walk isn't on (a crosswalk mapped from the kerb), the walker waits at the
        // end, the way chosen kept for when it is
        // (a mate goes the way its leader went from the end of this line: G.went)
        const end = p.s > l.len ? 1 : 0, gw = G && G.went && G.went.from === p.line && G.went.end === end ? G.went : null;
        const nx = p.kerbNext || (gw ? gw.nx : onward(p, end)), back = p.kerbNext ? false : gw ? false : p.kerbBack || !nx || (!p.mates && rnd() >= 0.9 && !(uT - (p.turnedT || -1e9) < 120) && wayReach(p.line, -p.dir) >= LEAD && !seen(p.x, p.y, p.z)); // (back on a whim: one in ten alone, where nobody sees it turn on its heel, only onto a way that leads somewhere, and not within two minutes of having turned for any reason, issue 168)
        const nl = back ? p.line : nx[0], nd = back ? -p.dir : nx[1] === 0 ? 1 : -1, ns = back ? Math.max(0, Math.min(l.len, p.s)) : nx[1] === 0 ? 0 : net.L[nl].len;
        const held = heldAt(nl, ns, nd, p);
        if (held === 'plaza') return;
        if (held) {
          p.kerbNext = back ? null : nx; p.kerbBack = back;
          p.s = Math.max(0, Math.min(l.len, p.s)); p.v = 0;
          api.kerbWait += dt;
        } else { p.kerbNext = null; p.kerbBack = false; if (back && !nx && !p.kerbBack && arrive(p)) return; if (back) turn(p, p.kerbBack ? 'back from a kerb' : !nx ? 'a dead end' : 'a whim'); else { if (p.mates) p.went = { from: p.line, end, nx }; p.line = nl; p.dir = nd; } p.s = ns; } // (back: turned where it stands)
      }
      lineAt(p.line, p.s, tmp);
      const nhx = tmp.hx * p.dir, nhy = tmp.hy * p.dir;
      // a step into a car, a bench or someone: stay put (whoever is already in one may walk
      // out of it, or along it), and after a while turn back
      let nx1 = tmp.x - nhy * p.lat, ny1 = tmp.y + nhx * p.lat, room1 = closest(nx1, ny1, player);
      // out in a carriageway on a crossing, getting off it comes first: there a walker may close in to
      // shoulders brushing (0.32 m) to clear it, never inside anyone; everywhere else it keeps CLOSE
      const inRoad = !!(X && X.some(x => Math.abs(x.s - p.s) < x.kerb)), lim = inRoad ? 0.32 : CLOSE;
      // (held four and a half seconds and more, p.ghost: on through the walkers and past a post as best it can, a second or two, never into a
      // car, the player or one of those not of the crowd: nobody stands blocked for minutes, issue 85)
      const ghost = p.ghost > 0, wasC = ghost ? blocked(p.x, p.y, false, false) : 0, roomK = ghost ? keepRoom(p.x, p.y, player ? Math.min(CLOSE, Math.hypot(player.x - p.x, player.y - p.y) - (player.r || 0.15)) : CLOSE) : 0;
      const ghostBad = (x, y) => blocked(x, y, false, false) > wasC + 1e-4 || keepRoom(x, y, player ? Math.min(CLOSE, Math.hypot(player.x - x, player.y - y) - (player.r || 0.15)) : CLOSE) < Math.min(0.36, roomK) - 1e-4; // (past them a shoulder close, never inside: their room is past what one of the crowd gives another)
      const room0 = closest(p.x, p.y, player), bad = (x, y, r) => (ghost ? ghostBad(x, y) : blocked(x, y) > was + 1e-4 || (r < lim && r < room0 - 1e-4)); // (a hair's tolerance: stood exactly at the room from someone, every step on shaved a ten-thousandth off it and was refused, issue 85)
      if (dl !== 0 && bad(nx1, ny1, room1)) { // drifting across into someone it is passing: straight on instead
        const lat2 = p.lat - dl, x2 = tmp.x - nhy * lat2, y2 = tmp.y + nhx * lat2, r2 = closest(x2, y2, player);
        if (!bad(x2, y2, r2)) { p.lat = lat2; dl = 0; nx1 = x2; ny1 = y2; room1 = r2; }
      }
      if (bad(nx1, ny1, room1)) {
        if (api.why) p.whyBad = { deep: +blocked(nx1, ny1).toFixed(2), was: +was.toFixed(2), posts: nearPosts.length, cars: nearCars.map(o => [+Math.hypot(o.x - p.x, o.y - p.y).toFixed(1), +(o.v || 0).toFixed(1)]), room1: +room1.toFixed(2), room0: +room0.toFixed(2), lim }; // (for the harnesses)
        if (p.dir !== dir0) turn(p, 'restore');
        p.line = line0; p.s = s0; p.lat = lat0; p.v = 0;
        p.vx = p.vy = 0;
        if (was > 0) for (const d of [0.9 * dt, -0.9 * dt]) { // in a car's way and stuck: a step sideways, out
          const x = p.x - p.hy * d, y = p.y + p.hx * d;
          if (blocked(x, y) < was - 1e-4) { p.lat += d; p.x = x; p.y = y; break; }
        }
        else if (room1 < CLOSE) { // someone in the way: a step aside, as people do, away from whoever is
          // nearest across (both of two face to face so go to their own right, and pass), and keep
          // going that way a while (dodge) so it walks round them rather than back and forth
          let ox = 0, oy = 0, bd = Infinity;
          for (let k = 0; k < nn; k++) { const o = P[nbr[k]], e = Math.hypot(o.x - nx1, o.y - ny1); if (e < bd) { bd = e; ox = o.x; oy = o.y; } }
          // (or the player, or one of those not of the crowd, if nearer past its own room: stepped away from, not into, issue 85)
          if (player) { const e = Math.hypot(player.x - nx1, player.y - ny1) - (player.r || 0.15) + 0.28; if (e < bd) { bd = e; ox = player.x; oy = player.y; } }
          for (let j = 0; j < K.length; j++) { const k = K[j]; if (Math.abs(k.ax - nx1) > 4 || Math.abs(k.ay - ny1) > 4) continue; keepPt(k, nx1, ny1); const e = Math.hypot(kp.x - nx1, kp.y - ny1) - k.r + 0.28; if (e < bd) { bd = e; ox = kp.x; oy = kp.y; } }
          const across = (ox - p.x) * -p.hy + (oy - p.y) * p.hx, first = across > 0.02 ? -1 : 1;
          for (const sg of [first, -first]) {
            const d = sg * 0.9 * dt, lat = p.lat + d;
            if (lat < -hw + 0.2 || lat > Math.max(hw, side) + 0.3) continue;
            const x = p.x - p.hy * d, y = p.y + p.hx * d;
            if (blocked(x, y) > was + 1e-4 || closest(x, y, player) < Math.min(CLOSE, room0) - 1e-4) continue;
            if (clear && !clear(x, y, p.z)) continue;
            p.lat = lat; p.x = x; p.y = y; p.vx = -p.hy * sg * 0.9; p.vy = p.hx * sg * 0.9;
            p.dodge = Math.max(-1.5, Math.min(1.5, p.dodge + d * 2));
            p.wait = Math.max(0, (p.wait || 0) - dt * 0.5); // (on the move: not yet a reason to turn back)
            break;
          }
        }
        else if (Math.abs(p.lat) > 0.3) { // a post, a bench or a rail at the footway's edge in the way, nobody: a step in towards its middle
          // (one walking out at the edge was wedged against one, every way it tried blocked, and stood there turning, issue 85)
          const d = -Math.sign(p.lat) * 0.9 * dt, x = p.x - p.hy * d, y = p.y + p.hx * d;
          if (blocked(x, y) <= was + 1e-4 && closest(x, y, player) >= Math.min(CLOSE, room0) - 1e-4 && !(clear && !clear(x, y, p.z))) { p.lat += d; p.x = x; p.y = y; if (p.side * p.lat > 0) p.side = Math.sign(p.side) * Math.max(0.3, Math.min(Math.abs(p.side), Math.abs(p.lat))); } // (and keeps in from it)
        }
        if ((p.wait = (p.wait || 0) + dt) > (was > 0 ? 0.3 : p.blkO || p.oncoming ? 7 : 3)) { turn(p, 'stepping on refused'); p.wait = 0; } // (people coming the other way are passed, not turned back from: issue 85)
        return;
      }
      p.wait = 0;
      const ohx = p.hx, ohy = p.hy, ox = p.x, oy = p.y, oz = p.z;
      hx = p.hx = nhx; hy = p.hy = nhy;
      p.x = tmp.x - hy * p.lat; p.y = tmp.y + hx * p.lat; p.z = tmp.z; // keep left
      settle(p);
      // never farther in a step than a brisk walk: where the line itself turns sharply between two
      // lines or the offset is cut in by a wall, the walker catches up over a few steps, not in one
      const jx = p.x - ox, jy = p.y - oy, jd = Math.hypot(jx, jy), jmax = (p.v + 1.3) * dt + 0.01;
      if (jd > jmax) { p.x = ox + jx * jmax / jd; p.y = oy + jy * jmax / jd; }
      // and where it ends up (pulled in from a wall, or catching up) no closer to anyone than the
      // check above allowed: otherwise it stays where it was this step
      if (jd > 1e-6 && (ghost ? ghostBad(p.x, p.y) : closest(p.x, p.y, player) < Math.min(lim, room0) - 1e-4 || blocked(p.x, p.y) > was + 1e-4)) { // (squeezing on past, as above: a post the wall pulled it in to stood it there for minutes, issue 85)
        if (p.dir !== dir0) turn(p, 'restore');
        p.line = line0; p.s = s0; p.lat = lat0; p.hx = ohx; p.hy = ohy; p.x = ox; p.y = oy; p.z = oz; p.v = 0; p.vx = p.vy = 0;
        return;
      }
      const lr = dt > 0 ? dl / dt : 0;
      p.vx = hx * p.v - hy * lr; p.vy = hy * p.v + hx * lr;
      // (the body faces the way it goes along the footway; drifting across to pass someone turns it only a little)
      const fw = heading(p, hx * p.v - hy * lr * 0.4, hy * p.v + hx * lr * 0.4, dt);
      if (p.face != null) p.h = p.face;
      else if (fw > 0.3) turnTo(p, dt, 8, fw);
      else if (p.v > 0.05) { const h = Math.atan2(hx, hy); p.h += Math.atan2(Math.sin(h - p.h), Math.cos(h - p.h)) * Math.min(1, dt * 3); } // (barely moving, a sidestep: still facing the way it goes, not turned sideways to every shuffle)
    }
    function nearest(x, y, maxD) {
      let best = -1, bd = maxD;
      for (let i = 0; i < n; i++) { const d = Math.hypot(P[i].x - x, P[i].y - y); if (P[i].line >= 0 && d < bd) { bd = d; best = i; } }
      return best;
    }
    // a bus at its stop (the traffic, below): up to n of those walking within 16 m of its door walk to it and get on
    // while it stands (open() says so), and up to m get off there and walk away along the footway (people taken
    // from the far side of the crowd, out of your sight, as the bus would have brought them)
    api.boarded = 0; api.alighted = 0;
    api.board = (door, n, m, open, cx, cy) => {
      let k = 0;
      for (let i = 0; i < api.active && k < n; i++) {
        const p = P[i];
        if (p.line < 0 || p.state !== 'walk' || p.pz || p.kerbNext || p.kerbBack || Math.abs(p.z - door.z) > 1.5 || Math.hypot(p.x - door.x, p.y - door.y) > 16) continue;
        if (wall && wall(door.x, door.y, p.z)) break; // (a door no walker can reach: in a wall)
        p.state = 'board'; p.seat = { x: door.x, y: door.y, z: door.z, h: 0, by: i, open }; p.bt = 0; k++;
      }
      const q = m > 0 && net.nearest ? net.nearest(door.x, door.y, 14, door.z) : null; // (the footway by the door)
      for (let i = api.active - 1, j = 0; q && i >= 0 && j < m; i--) {
        const p = P[i];
        if (p.line < 0 || p.state !== 'walk' || p.pz || Math.hypot(p.x - cx, p.y - cy) < radius * 0.55) continue;
        release(p); partGroup(p); p.stop = null; p.stopFace = null;
        p.line = q.line; p.s = q.s; p.x = door.x + (rnd() - 0.5) * 0.8; p.y = door.y + (rnd() - 0.5) * 0.8; p.z = door.z; p.lat = null; p.v = 0; p.kerbNext = null; p.kerbBack = false; p.pause = j * 1.1;
        backTo(p); p.state = 'leave'; j++; api.alighted++;
      }
      return k;
    };
    return Object.assign(api, { update, nearest, respawn, seen, shutLine, shut });
  }

  // ------------------------------------------------------------ traffic (drives on the left, or on the right)
  // With the shared Blender cars (opts.lib from OEVehicles.load) each slot drives one model
  // (sedans, hatches, SUVs, vans, the city's taxis and buses), drawn near, mid or far by
  // distance from opts.eye; without them, one box car for all.
  // Every car is a rectangle on the ground (`half` its length, `hw` its width, halved; `top` its
  // height), on the side of the road the city keeps to (opts.keep), and on the ground drawn under
  // it or its deck (opts.ground, as for the crowd).
  // It brakes for whatever is in its path: another car whose footprint reaches into its lane
  // (where two paths cross, the one farther from the crossing gives way), the player and the
  // walkers of opts.crowd, and your car or a ride (blockers with a length), swinging out round
  // one pulled in at the kerb. It drives a one-way street only its way. On a main road it has two
  // lanes each way (junctions.js lanesOf): it moves across into the other when the car ahead in
  // its own is slow and the other is clear beside it, and into the one its movement at the
  // junction ahead needs in time (straight on may go from either, a turn from the first). At a junction
  // (opts.junctions, junctions.js) it picks its exit as it comes up, stops at the line for a red
  // light or a stop sign, gives way, and goes in only when its way across is clear of the
  // movements in the junction and there is room for it beyond, so a queue never locks the
  // junction up; it gives the movement up once clear of it.
  // And it never moves into another car or a person: it waits, and, if a jam that is not a queue
  // at a junction won't clear, turns round on a two-way street (or, out of sight, comes back
  // elsewhere). The crowd keeps out of the cars' footprints (cars.near), and opts.nav stops the
  // player walking into one (nav.movers).
  const RAIL_ROOM = 3.5; // the room past a level crossing's far rail a car waits for, beyond its own length (m)
  const LANE = 1.7;    // a lane's centre, on the keep side of the road's line (m)
  const DRY = { grip: 1, pace: 1, corner: 1, headway: 1 }; // (a dry day, where cars.js is not loaded)
  // your car on a course into one (issue 335): a driver notices it up to DODGE_T s before it would hit,
  // swings up to DODGE_OUT m out of its way (to the kerb, or out over the centre line with nothing coming
  // when you pass on the kerb side), brakes hard unless you come up from behind, and keeps that up for
  // at least DODGE_HOLD s; a horn at most every HONK_GAP s a car
  const DODGE_T = 2.2, DODGE_OUT = 1.2, DODGE_HOLD = 1.2, HONK_GAP = 5;
  const PACE = 1.25;   // the traffic drives a quarter over the posted limit, as drivers do on an open street (the data's
                       // limits are the signs': 30 km/h on a side street reads as a crawl in play); a ride's route,
                       // its time and how it passes a queue stay on the limits (cars.js chauffeur)
  const BUS_A = 1.6, BEND_B = 2.2, BEND_W = 6; // the sideways pull a bus takes a bend with (m/s²), how hard it brakes for one ahead, and how far either side it reads a bend (m)
  const STUCK = 20;    // seconds stopped behind a car that won't move (not queueing at a junction) before turning round
  const LEVEL = 3;     // cars and people this far apart in height are on different levels: a deck over a street (m)
  const STEP = 1.5, NPATH = 32; // a car's way ahead, in points this far apart (m), and at most this many
  const pathQ = new Float32Array(2 * (NPATH + 64)), pathZ = new Float32Array(NPATH + 64), pathNext = [];
  // a car coming the other way within reach ahead of car c (heading fx, fy), on its road or a step from
  // its centre line: one it would meet swinging out over that line
  function oncomingIn(C, c, fx, fy, reach) {
    for (const o of C) {
      if (o === c || o.line < 0 || Math.abs(o.z - c.z) >= LEVEL) continue;
      const dx = o.x - c.x, dy = o.y - c.y, a = dx * fx + dy * fy;
      if (a <= 0 || a > reach || Math.abs(-dx * fy + dy * fx) > 4.5) continue;
      if (Math.sin(o.h) * fx + Math.cos(o.h) * fy < -0.5) return true;
    }
    return false;
  }
  function traffic(world, net, U, n, radius, { lib = null, cfg = {}, eye = null, keep = 'left', ground = null, crowd = null, nav = null, posts = null, junctions = null, stops = null } = {}) {
    const side = keep === 'right' ? -1 : 1; // the lane is to the left of the centre line, or to the right
    const JN = junctions || OEJunctions.create(net, { keep, lane: LANE, signals: [] });
    const I = lib && lib.cars && lib.info.cars, C = [], tmp = {}, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    // (a phone, quality.js lean: a car's full model, 22,000 to 25,000 triangles, only within 12 m, where a phone's screen
    // can show what the 5,000 of its second model cannot; its third, 1,000, past 70 m. At 35 and 110 m a car 30 m off was a
    // triangle to every pixel or two of it)
    const LEAN = !!(window.OEQuality && OEQuality.city().lean), LOD1 = I ? (LEAN ? Math.min(12, I.lod1_m) : I.lod1_m) : 0, LOD2 = I ? (LEAN ? Math.min(70, I.lod2_m) : I.lod2_m) : 0;
    let mesh = null, fleet = null, mat = null;
    const oncoming = (c, fx, fy, reach) => oncomingIn(C, c, fx, fy, reach);
    if (I) {
      // (with only the far models come yet, vehicles.js cars: 'later', each stands in for the nearer two until upgrade())
      const geos = carGeometries(lib.cars, I.tones), names = Object.keys(I.models).filter(k => geos[k] && geos[k][2]);
      // (each car sized by its near model's box, come or not: the traffic drives the same either way)
      const boxes = {};
      for (const k of names) {
        const nb = geos[k][2].userData.nearBox;
        boxes[k] = geos[k][0] ? geos[k][0].boundingBox : nb ? new THREE.Box3(new THREE.Vector3(nb[0], nb[1], nb[2]), new THREE.Vector3(nb[3], nb[4], nb[5])) : geos[k][2].boundingBox;
        for (const l of [1, 0]) if (!geos[k][l]) geos[k][l] = geos[k][l + 1].clone();
      }
      const taxi = Object.assign({}, I.liveries.taxi, cfg.taxi), bus = Object.assign({}, I.liveries.bus, cfg.bus);
      const own = names.filter(k => !I.models[k].taxi && !I.models[k].bus), sum = own.reduce((a, k) => a + I.models[k].weight, 0);
      const share = k => (I.models[k].taxi ? taxi.share : I.models[k].bus ? bus.share : (1 - taxi.share - bus.share) * I.models[k].weight / sum);
      const colours = cfg.colours || I.liveries.colours;
      for (let i = 0; i < n; i++) {
        let r = rnd(), k = names[names.length - 1];
        for (const name of names) { if ((r -= share(name)) < 0) { k = name; break; } }
        const M = I.models[k], box = boxes[k], hex = M.taxi ? pick(taxi.colours) : M.bus ? bus.colour : pick(colours);
        C.push({ line: -1, s: 0, dir: 1, v: 0, x: 0, y: 0, z: 0, h: 0, off: 0, ln: 0, lo: 0, model: k, half: (box.max.z - box.min.z) / 2, hw: (box.max.x - box.min.x) / 2, top: box.max.y,
          stuck: 0, taxi: !!M.taxi, bus: !!M.bus, van: /van/i.test(k), hex, c0: lin(hex), c1: lin(M.bus ? bus.band : taxi.band || '#1c1d1f') });
      }
      mat = toneMaterial(U, { cars: true });
      fleet = {};
      for (const k of names) {
        const cap = C.filter(c => c.model === k).length;
        if (!cap) continue;
        fleet[k] = geos[k].map(g => { const m = noCover(instanced(g, mat, cap)); m.count = 0; m.userData.noRefl = true; world.add(m); return m; });
      }
    } else {
      mesh = instanced(CAR(), toneMaterial(U), n);
      mesh.userData.noRefl = true;
      world.add(mesh);
      for (let i = 0; i < n; i++) {
        const hex = pick(CARS);
        setC(mesh.geometry.attributes.aC0, i, hex);
        C.push({ line: -1, s: 0, dir: 1, v: 0, x: 0, y: 0, z: 0, h: 0, off: 0, ln: 0, lo: 0, half: 2.2, hw: 0.98, top: 1.5, stuck: 0, hex });
      }
    }
    // (issue 352: a car out of the eye's sight by more than its shadow reaches back into it, 30 m, takes no slot,
    // so it is not drawn into the view or the shadow map; and only the slots taken are sent to the GPU)
    const at = new THREE.Vector3(), qSpring = new THREE.Quaternion(), eSpring = new THREE.Euler(), frustum = new THREE.Frustum(), fm = new THREE.Matrix4(), ball = new THREE.Sphere(at, 30), eyeAt = new THREE.Vector3(1e9, 0, 0);
    let culling = false;
    const sendRange = (a, n) => { if (a.clearUpdateRanges) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); } a.needsUpdate = true; };
    function place(i, c) { // into the box mesh's slot, or the next free slot of the model's mesh for this distance
      if (!fleet) { mesh.setMatrixAt(i, m4); return; }
      (c.m4 || (c.m4 = new THREE.Matrix4())).copy(m4); c.m4At = tick; // (kept for review(), below)
      show(c);
    }
    function show(c) { // car c, at m4, in the mesh of its model for its distance from the eye, if the eye can see it
      const d = eye ? eye.position.distanceTo(at.setFromMatrixPosition(m4)) : 0;
      if (culling && (!frustum.intersectsSphere(ball) || (window.OEVis && !OEVis.seenNext(at.x, -at.z, at.y + 3.6, 3.6)))) return; // (or behind the street wall: visibility.js; 3.6 m: a bus)
      const M = fleet[c.model][d < LOD1 ? 0 : d < LOD2 ? 1 : 2], j = M.count++, A = M.geometry.attributes;
      M.setMatrixAt(j, m4);
      A.aC0.setXYZ(j, c.c0.r, c.c0.g, c.c0.b); A.aC1.setXYZ(j, c.c1.r, c.c1.g, c.c1.b);
      A.aC3.setXY(j, c.brk > 0 ? 1 : 0, c.park ? (c.park.hazard ? 2 : 0) : c.sg || 0); // (its brake lights and indicators: toneMaterial)
    }
    // where a car on line `line` at s, driving dir, sits: its lane, on the keep side of the line,
    // and off metres farther left (a swing out round a car at the kerb)
    // (its way, the line's direction smoothed over a few metres either side, on to the next
    // piece and back to the one it came from (prev, next: [line, dir]), so the lane turns
    // corners and goes through junctions without jumping, and oncoming lanes stay apart round a bend)
    const pA = {}, pB = {};
    function along(line, s, dir, u, prev, next, out) { // the point u metres on from s, the way the car goes
      const l = net.L[line], t = s + dir * u;
      if (t >= 0 && t <= l.len) return net.at(line, t, out);
      const over = t > l.len ? t - l.len : -t, ahead = (t > l.len) === (dir > 0), o = ahead ? next : prev;
      if (!o) return net.at(line, Math.max(0, Math.min(l.len, t)), out);
      const L2 = net.L[o[0]], d = Math.min(L2.len, over);
      return net.at(o[0], (ahead ? o[1] > 0 : o[1] < 0) ? d : L2.len - d, out);
    }
    // A bus (longer than LONG_V either side of its middle) turns as one does (#283): at a tight corner, a turn
    // on the kerb side, its front swings wide of the lane, up to SWING m out at the sharpest of the turn, and its
    // rear axle is drawn after the front along the body (a tractrix, as a bicycle model's rear wheel goes), so
    // the body comes round over its wheelbase with the rear tracking about the lane, rather than pivot on its
    // middle round the lane's corner (tools/bus_turn.js: 10 to 25 degree jumps in its heading, its yaw two to
    // four times its lock, before). The swing is what keeps the rear clear of the corner's posts, which a
    // trailing body without it cut into (Shibuya, #264).
    const LONG_V = 3.5, SWING = 1.5, TRAIL_MAX = 0.45;
    // how far out a long vehicle's lane swings at s: the turn over the 7 m either side, on the kerb side only
    function swingAt(line, s, dir, prev, next) {
      along(line, s, dir, -7, prev, next, pA); along(line, s, dir, -1, prev, next, pB);
      const h0 = Math.atan2(pB.x - pA.x, pB.y - pA.y);
      along(line, s, dir, 1, prev, next, pA); along(line, s, dir, 7, prev, next, pB);
      let dh = Math.atan2(pB.x - pA.x, pB.y - pA.y) - h0;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      if (dh * side >= 0) return 0; // (a turn across the road, away from the kerb: wide already)
      const a = Math.min(1, Math.max(0, (Math.abs(dh) - 0.35) / 0.8));
      return Math.sign(dh) * SWING * a * a * (3 - 2 * a);
    }
    // the point u metres on from s along the way the car goes, on through the pieces after `next` (its plan
    // across a junction, a list of [line, dir]): a bus's front axle and the 3 m beyond run past the next piece,
    // which inside a junction may be a few metres long, and along() stops at its end
    function aheadOn(line, s, dir, u, prev, next, out) {
      const l = net.L[line], t = s + dir * u;
      if (u <= 0 || (t >= 0 && t <= l.len) || !next || !next.length) return along(line, s, dir, u, prev, next && next.length ? next[0] : null, out);
      let over = t > l.len ? t - l.len : -t;
      for (let k = 0; k < next.length; k++) {
        const o = next[k], L2 = net.L[o[0]];
        if (over <= L2.len || k === next.length - 1) { const d = Math.min(L2.len, over); return net.at(o[0], o[1] > 0 ? d : L2.len - d, out); }
        over -= L2.len;
      }
      return out;
    }
    // its front axle on the lane at s (fa ahead of its middle, the lane offset off); its rear axle drawn after it
    // along the body; its middle and heading set from the two
    const pF = {};
    function trail(c, reset, line, s, dir, off, prev, next) {
      const fa = c.half * 0.6, wb = c.half * 1.15;
      aheadOn(line, s, dir, fa - 3, prev, next, pA); aheadOn(line, s, dir, fa + 3, prev, next, pB); aheadOn(line, s, dir, fa, prev, next, pF);
      let hx = pB.x - pA.x, hy = pB.y - pA.y;
      const hl = Math.sqrt(hx * hx + hy * hy);
      if (hl > 0.5) { hx /= hl; hy /= hl; } else { hx = Math.sin(c.h); hy = Math.cos(c.h); }
      const lane = LANE * side + off, fx = pF.x - hy * lane, fy = pF.y + hx * lane;
      const dx = fx - c.rx, dy = fy - c.ry, d = Math.hypot(dx, dy);
      if (reset || c.rx == null || !(d > 1e-3) || Math.abs(d - wb) > 1.5) { c.rx = c.x - Math.sin(c.h) * (wb - fa); c.ry = c.y - Math.cos(c.h) * (wb - fa); return; } // (placed, turned round, or moved a long way at once: straight behind)
      let h = Math.atan2(dx, dy), dh = h - c.h;
      dh -= Math.round(dh / (2 * Math.PI)) * 2 * Math.PI;
      if (Math.abs(dh) > TRAIL_MAX) h = c.h + Math.sign(dh) * TRAIL_MAX; // (never more than this off the lane's own heading)
      c.h = h; c.rx = fx - Math.sin(h) * wb; c.ry = fy - Math.cos(h) * wb;
      c.x = fx - Math.sin(h) * fa; c.y = fy - Math.cos(h) * fa;
    }
    function lanePos(line, s, dir, out, off = 0, prev = null, next = null) {
      along(line, s, dir, -3, prev, next, pA); along(line, s, dir, 3, prev, next, pB);
      net.at(line, s, out);
      let hx = pB.x - pA.x, hy = pB.y - pA.y;
      const h = Math.sqrt(hx * hx + hy * hy);
      if (h > 0.5) { hx /= h; hy /= h; } else { hx = out.hx * dir; hy = out.hy * dir; }
      out.hx = hx; out.hy = hy;
      const lane = LANE * side + off;
      out.x -= hy * lane; out.y += hx * lane;
      return out;
    }
    // its height: the lane's, or the ground drawn under it or its deck (opts.ground)
    function onGround(c, at) {
      c.z = at.z;
      const gz = ground && ground(c.x, c.y, at);
      if (gz != null) c.z = gz;
    }
    // is (x, y) clear of every other car by d (centre to centre)?
    function clear(x, y, d, self, z) {
      for (let j = 0; j < api.active; j++) { const o = C[j]; if (o !== self && o.line >= 0 && Math.abs(o.z - z) < LEVEL && Math.abs(o.x - x) < d && Math.abs(o.y - y) < d && Math.hypot(o.x - x, o.y - y) < d) return false; }
      return true;
    }
    // how deep car c, at (x, y) heading (hx, hy), would be in other cars' footprints grown
    // by a margin (along, across): 0 when clear
    // (and `ahead`: is the deepest of them ahead of it? mostCar: that one; intoSet: a set to add them
    // to; `fresh`: how deep it is in the ones not in knownSet, the cars it is already caught up with)
    let depth = 0, most = 0, ahead = false, oc = null, ox0 = 0, oy0 = 0, ohx = 0, ohy = 0, mL = 0, mW = 0, mostCar = null, inSet = null, known = null, fresh = 0;
    const overlapTest = o => {
      if (o === oc || (o.soft && Math.sin(o.h) * ohx + Math.cos(o.h) * ohy < 0.5)) return; // (a ride on its way to you, but for one it follows: game.js)
      // (where a ride backing out will be, not where it is: kept clear by a car not in it, but one already in it, in a
      // junction, drives on out of the way rather than stand there, held by a place the ride has yet to reach, while the
      // ride waits on it: a ride backing out in Higashiyama's junction 67 stood 90 s so, #317)
      if (o.ahead && oc.inAhead) return;
      const dx = o.x - ox0, dy = o.y - oy0, ox = Math.sin(o.h), oy = Math.cos(o.h), cs = Math.abs(ox * ohx + oy * ohy), sn = Math.abs(-ox * ohy + oy * ohx);
      const ea = oc.half + cs * o.half + sn * o.hw + mL - Math.abs(dx * ohx + dy * ohy), eb = oc.hw + sn * o.half + cs * o.hw + mW - Math.abs(-dx * ohy + dy * ohx);
      if (ea > 0 && eb > 0) {
        // (and on the other car's axes too: two cars at an angle, nose to nose on a bend with the
        // oncoming lane, are clear of each other along one of its sides even when their boxes
        // projected on this car's axes alone overlap)
        const ec = o.half + cs * oc.half + sn * oc.hw + mL - Math.abs(dx * ox + dy * oy);
        if (ec <= 0) return;
        const ed = o.hw + sn * oc.half + cs * oc.hw + mW - Math.abs(-dx * oy + dy * ox);
        if (ed <= 0) return;
        const d = Math.min(ea, eb, ec, ed);
        depth += d;
        if (d > most) { most = d; ahead = dx * ohx + dy * ohy > 0; mostCar = o; }
        if (inSet) inSet.add(o);
        if (known && !known.has(o)) fresh += d;
      }
    };
    // do car c's box and o's (x, y, h, half, hw) overlap, on the axes of both?
    function boxIn(c, o) {
      if (Math.abs(o.x - c.x) > c.half + o.half + 1 || Math.abs(o.y - c.y) > c.half + o.half + 1) return false;
      const hx = Math.sin(c.h), hy = Math.cos(c.h), ox = Math.sin(o.h), oy = Math.cos(o.h), dx = o.x - c.x, dy = o.y - c.y;
      const cs = Math.abs(ox * hx + oy * hy), sn = Math.abs(-ox * hy + oy * hx);
      return c.half + cs * o.half + sn * o.hw > Math.abs(dx * hx + dy * hy) && c.hw + sn * o.half + cs * o.hw > Math.abs(-dx * hy + dy * hx)
        && o.half + cs * c.half + sn * c.hw > Math.abs(dx * ox + dy * oy) && o.hw + sn * c.half + cs * c.hw > Math.abs(-dx * oy + dy * ox);
    }
    function overlaps(c, x, y, hx, hy, ml = 0.5, mw = 0.2, intoSet = null, knownSet = null) {
      depth = most = fresh = 0; ahead = false; mostCar = null; oc = c; ox0 = x; oy0 = y; ohx = hx; ohy = hy; mL = ml; mW = mw; inSet = intoSet; known = knownSet;
      near(x, y, c.half + 1, overlapTest, c.z);
      inSet = known = null;
      return depth;
    }
    // and how deep the people (the player, the crowd) and the lamp posts and trunks would be in it
    let inWho = -1, inPosts = 0; // (the walker deepest in it, from the last peopleIn)
    function peopleIn(c, x, y, hx, hy) {
      let d = 0, most = 0;
      inWho = -1; inPosts = 0;
      if (posts && !(c.postPass > 0)) posts.near(x, y, c.half + 0.3, q => { // (not while it has leave to edge past a post, below)
        if (Math.abs(q.z - c.z) >= LEVEL) return;
        const dx = q.x - x, dy = q.y - y, ea = c.half + q.r - Math.abs(dx * hx + dy * hy), eb = c.hw + q.r - Math.abs(-dx * hy + dy * hx);
        if (ea > 0 && eb > 0) { d += Math.min(ea, eb); inPosts += Math.min(ea, eb); }
      });
      const c0 = Math.floor((x - c.half - 1) / CELL), c1 = Math.floor((x + c.half + 1) / CELL), r0 = Math.floor((y - c.half - 1) / CELL), r1 = Math.floor((y + c.half + 1) / CELL);
      for (let a = c0; a <= c1; a++) for (let b = r0; b <= r1; b++) {
        for (let j = bhead[bucket(a, b)]; j >= 0; j = bchain[j]) {
          if (Math.abs(bz[j] - c.z) >= LEVEL) continue;
          const dx = bx[j] - x, dy = by[j] - y, ea = c.half + br[j] - Math.abs(dx * hx + dy * hy), eb = c.hw + br[j] - Math.abs(-dx * hy + dy * hx);
          if (ea > 0 && eb > 0) { const e = Math.min(ea, eb); d += e; if (e > most) { most = e; inWho = bi[j]; } }
        }
      }
      return d;
    }
    // the walker (of the crowd, or you, or one of the map's people) whom car c's body in pose 1 would stand deeper in than
    // in pose 0, and more than thr deep: its place among the blockers, or -1. Each walker on their own, not the sum of
    // them: one stepping out of the body's back as another is driven into its front sums to less, and the step was let
    // through (#28)
    function walkerDeeper(c, x0, y0, hx0, hy0, x1, y1, hx1, hy1, thr) {
      let best = -1, most = 0;
      const c0 = Math.floor((x1 - c.half - 1) / CELL), c1 = Math.floor((x1 + c.half + 1) / CELL), r0 = Math.floor((y1 - c.half - 1) / CELL), r1 = Math.floor((y1 + c.half + 1) / CELL);
      for (let a = c0; a <= c1; a++) for (let b = r0; b <= r1; b++) {
        for (let j = bhead[bucket(a, b)]; j >= 0; j = bchain[j]) {
          if (Math.abs(bz[j] - c.z) >= LEVEL) continue;
          let dx = bx[j] - x1, dy = by[j] - y1, ea = c.half + br[j] - Math.abs(dx * hx1 + dy * hy1), eb = c.hw + br[j] - Math.abs(-dx * hy1 + dy * hx1);
          const e1 = ea > 0 && eb > 0 ? Math.min(ea, eb) : 0;
          if (e1 <= thr) continue;
          dx = bx[j] - x0; dy = by[j] - y0; ea = c.half + br[j] - Math.abs(dx * hx0 + dy * hy0); eb = c.hw + br[j] - Math.abs(-dx * hy0 + dy * hx0);
          const e0 = ea > 0 && eb > 0 ? Math.min(ea, eb) : 0;
          if (e1 > e0 + 1e-3 && e1 - e0 > most) { most = e1 - e0; best = j; }
        }
      }
      return best;
    }
    // where a bus's body will be drawn after a step to the lane's pose (x, y, h) (trail, which the step itself runs after it
    // is taken), worked out on a copy: { x, y, h }
    const trailProbe = { half: 0, hw: 0, h: 0, x: 0, y: 0, rx: null, ry: null };
    function trailed(c, x, y, h, line, s, dir, off, prev, next) {
      const T = trailProbe;
      T.half = c.half; T.hw = c.hw; T.x = x; T.y = y; T.h = h; T.rx = c.rx; T.ry = c.ry;
      trail(T, false, line, s, dir, off, prev, next);
      return T;
    }
    // someone of the crowd on a zebra's stripes, or about to step onto them from its kerb
    function onStripes(X) {
      const half = X.half, P = crowd.P;
      for (let i = 0; i < crowd.active; i++) {
        const p = P[i];
        if (p.line < 0 || Math.abs(p.x - X.x) > half + 3 || Math.abs(p.y - X.y) > half + 3 || Math.abs(p.z - X.z) >= LEVEL) continue;
        const dx = p.x - X.x, dy = p.y - X.y, along = Math.abs(dx * X.hx + dy * X.hy), across = Math.abs(-dx * X.hy + dy * X.hx);
        if (along > 2.6 || across > half + 1.2) continue;
        if (across < half || (p.v > 0.2 && Math.abs((p.hx || 0) * X.hx + (p.hy || 0) * X.hy) < 0.6)) return true; // (in the road, or walking out across it)
      }
      return false;
    }
    if (crowd) JN.onStripes = onStripes; // (a ride's driver gives way at a zebra too: cars.js chauffeur)
    // ---- the buses' stops (#355): opts.stops, the mapped stops' poles (game.json props bus_stop, pipeline/kerb_stops.py),
    // each on the piece of road within 14 m of it, serving the traffic that keeps to its side. A bus coming up to one on
    // its way slows, indicates, stops with its front door at the pole and stands 8 to 18 s while people get on and off
    // (the crowd's board, above), then goes on. Not one within 30 m of the junction ahead (its queue would stand in it),
    // nor on a junction's own piece, nor one its lane is not next to (a second lane)
    const busStops = new Map();
    if (stops && stops.length) for (let i = 0; i + 2 < stops.length; i += 3) {
      const x = stops[i] / 10, y = stops[i + 1] / 10, z = stops[i + 2] / 10, q0 = net.nearest(x, y, 14, z, 3.5);
      if (!q0 || JN.inner(q0.line) || (net.avoid && net.avoid[q0.line])) continue;
      const l = net.L[q0.line];
      net.at(q0.line, q0.s, tmp);
      const left = (x - tmp.x) * -tmp.hy + (y - tmp.y) * tmp.hx, dir = l.ow || (left * side >= 0 ? 1 : -1); // (the way whose kerb the pole stands at)
      const ahead = dir > 0 ? l.len - q0.s : q0.s, ar = JN.armAt(q0.line, dir > 0 ? 1 : 0);
      if (ahead < (ar ? ar.back : 0) + 30 || l.len - ahead < 14) continue;
      if (JN.midsOn && (JN.midsOn(q0.line) || []).some(X => Math.abs(X.mid - q0.s) < 14)) continue;
      const on = busStops.get(q0.line) || [];
      if (on.some(o => o.dir === dir && Math.abs(o.s - q0.s) < 40)) continue;
      on.push({ line: q0.line, s: q0.s, dir, x, y, z }); busStops.set(q0.line, on);
    }
    // ---- the kerb (#355): cars parked along the streets with room for them, where trips into town end and trips
    // out of it begin. A parked car stands at the kerb (cars.js kerbOf, where a taxi pulls in), clear of the lane,
    // and takes no step: it is drawn, and the traffic, the crowd and you keep out of its footprint. A car at the end
    // of a trip into town looks for room at the kerb ahead, slows, pulls in and stands for a while (longer in the
    // morning, shorter in the evening, when the cars at the kerb leave for the map's edges); then, with the lane
    // clear behind it, it signals nothing but pulls out as a lane change and drives off on a new trip.
    // PARKED: the share of the cars parked when they come into the traffic; no more than PARK_MAX of them at once
    // (cfg.parked: a city's own share, game.json vehicles.cars.parked; Japan's streets have next to none: its cars are in car parks)
    const PARKED = cfg.parked ?? 0.16, PARK_MAX = Math.max(0.08, PARKED * 1.9), PARK_CLEAR = 2.3; // (PARK_CLEAR: from the lane's middle to a parked car's, m: two half-widths and room to pass)
    const hourNow = () => { const T = JN.trips && JN.trips(); return T && T.hour ? T.hour() : 12; };
    // how far off its lane's place a car stands at the kerb of a line (c.lo's units), or 0 where the street has no
    // room: a motorway or a trunk road, a living street, two lanes each way, a street narrowed, a junction's own piece, a road to
    // keep off, or the kerb too near the lane (a two-way back street)
    const kerbMemo = new Map();
    function kerbLo(line) {
      let k = kerbMemo.get(line);
      if (k !== undefined) return k;
      const l = net.L[line];
      k = 0;
      if (window.OECars && l.len >= 45 && !(l.cw > 0) && !/^(motorway|trunk|living_street|service)/.test(l.c) && JN.lanesOf(l) === 1 && !JN.inner(line) && !(net.avoid && net.avoid[line]) && !(net.fit && net.fit[line] < 1.2)) {
        const kerb = OECars.kerbOf(l.c, l.cw), lane = LANE + JN.shiftOf(l, 0); // (shiftOf: 0, or -LANE on a one-way street of one lane, driven down its middle)
        if (kerb - lane >= PARK_CLEAR) k = kerb - LANE;
      }
      kerbMemo.set(line, k);
      return k;
    }
    // can car c stand at the kerb of line at s, facing dir? (clear of the junctions and crossings, of the other cars
    // by a bumper's room, of people, posts and walls): its pose in tmp if so
    const kerbA = {}, kerbB = {}; // (the lane's way either end of a place at the kerb: kerbFree)
    const kerbNo = {}; // (why a place at the kerb was not free, counted: for the checks)
    let youX = 1e9, youY = 1e9; // (where you are: update)
    function kerbFree(c, line, s, dir) {
      const k = kerbLo(line), l = net.L[line];
      if (!k) return false;
      const ahead = dir > 0 ? l.len - s : s, ar = JN.armAt(line, dir > 0 ? 1 : 0), br = JN.armAt(line, dir > 0 ? 0 : 1);
      const no = why => { kerbNo[why] = (kerbNo[why] || 0) + 1; return false; };
      if (ahead < (ar ? ar.back : 0) + 26 || l.len - ahead < (br ? br.back : 0) + 20) return no('junction'); // (clear of the cars that swing in from the junction behind, and of the queue for the one ahead)
      if (JN.midsOn && (JN.midsOn(line) || []).some(X => Math.abs(X.mid - s) < 16)) return no('crossing');
      if (JN.shutNow && JN.shutNow(line, dir)) return no('shut');
      // (nor where the street bends there: the car stands straight while the kerb and the lane curve, and a car passing
      // it drove into it, its body swung by the bend while its way ahead, the lane's middle, kept clear. Sydney's piece 1621
      // bends 22 degrees under a parked car, which stood out into the lane; on Queenstown's 302, a gentle 5 degrees, a bus
      // swung its corner 0.3 to 0.6 m into two: parked 2.7 m off the lane, a car leaves a bus 0.4 m on the straight, and a
      // bus's 6 m from its middle to its corner swings 0.4 m at 4 degrees, #420. The lane's way 8 m behind and ahead of it,
      // a bus's length, within 4 degrees)
      { const sa = Math.max(0, Math.min(l.len, s - dir * 8)), sb = Math.max(0, Math.min(l.len, s + dir * 8));
        lanePos(line, sa, dir, kerbA); lanePos(line, sb, dir, kerbB);
        if (kerbA.hx * kerbB.hx + kerbA.hy * kerbB.hy < 0.9976) return no('bend'); }
      lanePos(line, s, dir, tmp, side * k);
      if (JN.inScramble && JN.inScramble(tmp.x, tmp.y)) return no('scramble');
      if (Math.hypot(tmp.x - youX, tmp.y - youY) < 25) return no('you'); // (not at the kerb where you stand: a taxi you hail pulls in there)
      const z0 = c.z;
      c.z = tmp.z;
      const why = overlaps(c, tmp.x, tmp.y, tmp.hx, tmp.hy, 1.1, 0.25) > 0 ? 'car' : peopleIn(c, tmp.x, tmp.y, tmp.hx, tmp.hy) > 0 ? (inPosts > 0 ? 'post' : 'person')
        : nav && nav.room && ![-1, 0, 1].every(f => nav.room(tmp.x + tmp.hx * f * (c.half - 0.5), tmp.y + tmp.hy * f * (c.half - 0.5), tmp.z, c.hw - 0.1, 1.4, true)) ? 'wall'
        : api.extra.some(o => Math.hypot(o.x - tmp.x, o.y - tmp.y) < c.half + (o.half || 2.4) + 2) ? 'yours' : ''; // (not on your car or a ride)
      c.z = z0;
      return why ? no(why) : true;
    }
    // and the way in to it from the lane: the car's places 9, 6 and 3 m short of it, a third, half and most of the way
    // across, clear of the cars standing at the kerb (a place between two parked cars takes room behind it to drive
    // into forwards)
    // (and the way out again, ahead of it: the same three places on the other side. sgn -1 the way in, +1 the way out)
    function wayIn(c, line, s, dir, sgn = -1) {
      const k = side * kerbLo(line), base = side * JN.shiftOf(net.L[line], 0), len = net.L[line].len;
      for (const [d, f] of [[3, 0.95], [6, 0.63], [9, 0.32]]) { // (the way pulling in goes: update's loT)
        const s1 = s + sgn * dir * d;
        if (s1 < 0 || s1 > len) return false;
        lanePos(line, s1, dir, tmp, base + (k - base) * f);
        ownOnly = true; const dp = overlaps(c, tmp.x, tmp.y, tmp.hx, tmp.hy, 0.3, 0.12); ownOnly = false;
        if (dp > 0 && mostCar && (mostCar.park || mostCar.v < 0.5)) return false;
      }
      return true;
    }
    // how long a car stands at the kerb (s): parked for the day in the morning, on its way out in the evening
    const dwell = () => { const h = hourNow(); return h >= 16 && h < 19.5 ? 15 + rnd() * 150 : h >= 6.5 && h < 9.5 ? 240 + rnd() * 900 : 60 + rnd() * 500; };
    // car c stands at the kerb of line at s from now (kerbFree said so: its pose is in tmp)
    function parkNow(c, line, s, dir, t) {
      JN.forget(c);
      c.line = line; c.s = s; c.dir = dir; c.ln = 0; c.lo = side * kerbLo(line); c.off = 0; c.v = 0;
      c.nx = undefined; c.plan = c.ex = c.ex2 = c.exA = c.pv = null; c.rev = null; c.halt = false; c.q = false; c.mv = null;
      c.dodgeT = 0; c.dodgeBrake = false; c.vBend = Infinity; c.lcT = 0; c.lnWait = 0; // (as a car come fresh into the traffic: respawn)
      c.wallGap = Infinity; c.wallT = 0; c.atWall = 0; c.narrow = 0; c.narrowF = 0; c.narrowIn = Infinity;
      c.x = tmp.x; c.y = tmp.y; onGround(c, tmp); c.h = Math.atan2(tmp.hx, tmp.hy);
      c.park = { t }; c.parking = null; c.wantPark = 0; c.trip = -1; c.why = 'parked'; c.youBy = null; c.front = null; c.heldBy = '';
      c.still = c.stuck = 60; // (stopped for good, to a ride's driver and to whoever reads how long it has stood)
    }
    // is the lane beside a parked car clear for it to pull out into? (nothing coming up behind within 28 m or 3 s,
    // nothing alongside)
    function laneClear(c) {
      const fx = Math.sin(c.h), fy = Math.cos(c.h);
      for (let j = 0; j < api.active; j++) {
        const o = C[j];
        if (o === c || o.line < 0 || o.park || Math.abs(o.z - c.z) >= LEVEL) continue;
        const dx = o.x - c.x, dy = o.y - c.y, a = dx * fx + dy * fy, w = Math.abs(-dx * fy + dy * fx);
        if (w > 5.5 || a > c.half + o.half + 3 || a < -Math.max(28, o.v * 3)) continue;
        if (Math.sin(o.h) * fx + Math.cos(o.h) * fy < 0.3 && a < -o.half - c.half) continue; // (one going the other way, behind it)
        // (one standing behind it in its lane, waiting on it: it pulls out ahead of that one, which is what it waits for.
        // Counted as traffic, the car it held up kept it parked, and itself held behind it, for good: #409)
        if (o.v < 0.3 && a < 0 && o.front === c) continue;
        return false;
      }
      for (const o of api.extra) { const dx = o.x - c.x, dy = o.y - c.y, a = dx * fx + dy * fy; if (Math.abs(-dx * fy + dy * fx) < 5.5 && a < c.half + (o.half || 2.4) + 3 && a > -Math.max(28, (o.v || 0) * 3)) return false; }
      return true;
    }
    // where a car is bound (trips.js: a place's index, or -1 for none), a new place taken once it is within 60 m
    // by road of the one it had: looked at only as it picks an exit
    const tripOf = c => {
      const T = JN.trips && JN.trips();
      if (!T) return -1;
      // (a trip out to an edge: over within 60 m of it by road. One into town ends on its street, where it looks for the kerb: update)
      if (c.trip >= 0 && (T.places[c.trip].kind !== 'centre' || c.bus) && T.cost(c.trip, c.line, c.dir) < 60) { c.trip = T.pick(c.x, c.y); c.trips = (c.trips || 0) + 1; }
      return c.trip ?? -1;
    };
    const parkedN = () => { let k = 0; for (let j = 0; j < api.active; j++) if (C[j].park && C[j].line >= 0) k++; return k; };
    function respawn(c, cx, cy, rMin) {
      const cand = net.near(cx, cy, rMin, radius), T = JN.trips && JN.trips();
      JN.forget(c);
      c.line = -1;
      c.trip = T ? T.pick(cx + (rnd() - 0.5) * radius, cy + (rnd() - 0.5) * radius) : -1; // (bound for a place, or for none)
      c.park = c.parking = null; c.wantPark = 0;
      // at the kerb already, as some of the cars of any street are (not the buses; the taxis' ranks are theirs, below)
      // (fewer in the morning, when the kerbs fill with the cars that come in; more in the evening, when they empty)
      if (T && !c.bus && !c.taxi && cand.length && rnd() < PARKED * (T.inbound(hourNow()) > 0.7 ? 0.6 : T.inbound(hourNow()) < 0.3 ? 1.5 : 1) && parkedN() < PARK_MAX * api.active) {
        for (let k = 0; k < 5; k++) {
          const line = cand[Math.floor(rnd() * cand.length)], L1 = net.L[line];
          if (!kerbLo(line)) continue;
          const s = L1.len * (0.1 + 0.8 * rnd()), dir = L1.ow || (rnd() < 0.5 ? 1 : -1);
          if (kerbFree(c, line, s, dir) && clear(tmp.x, tmp.y, 5.2, c, tmp.z) && !(rMin > 0 && Math.hypot(tmp.x - cx, tmp.y - cy) < rMin * 0.8)) { parkNow(c, line, s, dir, dwell() * rnd()); return; }
        }
      }
      for (let k = 0; k < 4 && cand.length; k++) { // somewhere no other car is, the way the street goes, not inside a junction
        // (on a two-way street it sets out the way its place lies, four times in five: trips.js facing)
        // (and it comes in along a main road more often than a back street, as the cars that come into a part of town do:
        // of two streets drawn, the bigger one four times in five)
        let line = cand[Math.floor(rnd() * cand.length)];
        if (c.trip >= 0) { const l2 = cand[Math.floor(rnd() * cand.length)], RK = OEJunctions.RANK, r1 = RK[net.L[line].c] || 2, r2 = RK[net.L[l2].c] || 2; if ((r2 > r1) === (rnd() < 0.8) && r1 !== r2) line = l2; }
        const L1 = net.L[line], s = L1.len * (0.1 + 0.8 * rnd()), dir = L1.ow || (c.trip >= 0 && T.facing(c.trip, line)) || (rnd() < 0.5 ? 1 : -1);
        if (JN.inner(line) || L1.len < 15 || (net.fit && net.fit[line] < c.hw)) continue; // (nor on a street too narrow for it)
        // (the road plan: traffic is made only on a street that leads from one of the map's gates to another, never in a
        // cul-de-sac or on the stub before a closure, where it could only stand at the end; nor on a piece the game itself
        // cuts at a wall; and a bus only on a street a bus route takes, issue 167)
        if (L1.quiet || L1.wall || (c.bus && net.busStreets && !L1.bus)) continue;
        if (L1.ow && !net.next(line, dir > 0 ? 1 : 0, true)) continue; // (not on a one-way street that leads nowhere: stuck at its end)
        const ahead = dir > 0 ? L1.len - s : s, ar = JN.armAt(line, dir > 0 ? 1 : 0);
        if (ar && ahead < ar.back + 10) continue; // not at a junction's line, or over it
        if (JN.midsOn && (JN.midsOn(line) || []).some(X => Math.abs(X.mid - s) < 30)) continue; // nor at a crossing's
        if (JN.shutNow && JN.shutNow(line, dir)) continue; // nor on a street shut to cars at this hour
        const ln = JN.lanesOf(L1) > 1 && rnd() < 0.5 && !(JN.laneRun && ahead + JN.laneRun(line, dir > 0 ? 1 : 0) < 120) ? 1 : 0, lo = side * JN.shiftOf(L1, ln); // (not in a second lane about to end)
        lanePos(line, s, dir, tmp, lo);
        if (JN.inScramble && JN.inScramble(tmp.x, tmp.y)) continue;
        // (out of the ring's inside: a long piece with one vertex in the ring has the rest of its length anywhere, and a
        // car put on Meiji-dori 85 m from you appeared in sight, issue 167)
        if (rMin > 0 && Math.hypot(tmp.x - cx, tmp.y - cy) < rMin * 0.8) continue;
        c.z = tmp.z;
        if (!clear(tmp.x, tmp.y, 12, c, tmp.z) || overlaps(c, tmp.x, tmp.y, tmp.hx, tmp.hy, 3, 1) > 0 || peopleIn(c, tmp.x, tmp.y, tmp.hx, tmp.hy) > 0) continue; // (and not on your car or a ride)
        c.line = line; c.s = s; c.dir = dir; c.v = L1.v * 0.7; c.stuck = 0; c.dodgeT = 0; c.dodgeBrake = false; c.rev = null; c.vBend = Infinity; c.nx = undefined; c.plan = c.ex = c.ex2 = c.exA = c.pv = null; c.halt = false; c.q = false; c.off = 0;
        c.ln = ln; c.lo = lo; c.lcT = 0; c.lnWait = 0;
        c.wallGap = Infinity; c.wallT = 0; c.atWall = 0; c.narrow = 0; c.narrowF = 0; c.narrowIn = Infinity; // (a wall seen where it was is not one here: looked for at once)
        c.x = tmp.x; c.y = tmp.y; onGround(c, tmp); c.h = Math.atan2(tmp.hx, tmp.hy);
        return;
      }
    }
    // a spatial hash of 16 m cells over the cars (rebuilt each frame) and over what they brake for
    const CELL = 16, NB = 1024, head = new Int32Array(NB), chain = new Int32Array(n), bhead = new Int32Array(NB);
    let bchain = new Int32Array(1024), bx = new Float32Array(1024), by = new Float32Array(1024), bz = new Float32Array(1024), br = new Float32Array(1024), bi = new Int32Array(1024), nb = 0;
    const bucket = (cx, cy) => ((cx * 73856093) ^ (cy * 19349663)) & (NB - 1);
    head.fill(-1); bhead.fill(-1);
    function addBlocker(x, y, z, r, who = -1) { // (who: the walker's place in the crowd)
      if (nb === bx.length) { const g = a => { const b = new a.constructor(a.length * 2); b.set(a); return b; }; bx = g(bx); by = g(by); bz = g(bz); br = g(br); bi = g(bi); bchain = g(bchain); }
      bx[nb] = x; by[nb] = y; bz[nb] = z; br[nb] = r; bi[nb] = who;
      const k = bucket(Math.floor(x / CELL), Math.floor(y / CELL));
      bchain[nb] = bhead[k]; bhead[k] = nb++;
    }
    // call fn(car) for every car with its centre within about r of (x, y) (and, given z, on that level):
    // the traffic's, and the cars in api.extra (your car and a ride, which game.js keeps up to date)
    let ownOnly = false;
    function near(x, y, r, fn, z = null) {
      if (!ownOnly) for (const o of api.extra) if (Math.abs(o.x - x) <= r + o.half && Math.abs(o.y - y) <= r + o.half && (z == null || Math.abs(o.z - z) < LEVEL)) fn(o);
      const R = r + 7; // the longest car's centre is this far from its farthest corner
      const c0 = Math.floor((x - R) / CELL), c1 = Math.floor((x + R) / CELL), r0 = Math.floor((y - R) / CELL), r1 = Math.floor((y + R) / CELL);
      for (let a = c0; a <= c1; a++) for (let b = r0; b <= r1; b++) {
        for (let j = head[bucket(a, b)]; j >= 0; j = chain[j]) { const o = C[j]; if (o.line >= 0 && Math.abs(o.x - x) <= r + o.half && Math.abs(o.y - y) <= r + o.half && (z == null || Math.abs(o.z - z) < LEVEL)) fn(o); }
      }
    }
    // how far (x, y) is inside car o's footprint grown by m: the way out, or null when it isn't
    function into(o, x, y, m) {
      const fx = Math.sin(o.h), fy = Math.cos(o.h), dx = x - o.x, dy = y - o.y, a = dx * fx + dy * fy, b = -dx * fy + dy * fx;
      const ea = o.half + m - Math.abs(a), eb = o.hw + m - Math.abs(b);
      if (ea <= 0 || eb <= 0) return null;
      return ea < eb ? { x: fx * Math.sign(a || 1) * ea, y: fy * Math.sign(a || 1) * ea } : { x: -fy * Math.sign(b || 1) * eb, y: fx * Math.sign(b || 1) * eb };
    }
    // and the step to the side that takes (x, y) out of car o's way (its footprint grown by m, a metre on ahead): null if clear
    function aside(o, x, y, m) {
      const fx = Math.sin(o.h), fy = Math.cos(o.h), dx = x - o.x, dy = y - o.y, a = dx * fx + dy * fy, b = -dx * fy + dy * fx;
      const eb = o.hw + m - Math.abs(b);
      if (a < -o.half - m || a > o.half + m + 1 || eb <= 0) return null;
      return { x: -fy * Math.sign(b || 1) * Math.min(eb, 0.05), y: fx * Math.sign(b || 1) * Math.min(eb, 0.05) }; // (a step at a time, 5 cm a frame)
    }
    // (x, y) moved out of every car's footprint grown by r (of the cars on level z, if given)
    function pushOut(x, y, r, z = null) {
      for (let it = 0; it < 3; it++) {
        let moved = false;
        near(x, y, r + 1, o => { if (o.id === 'heli') return; const e = into(o, x, y, r); if (e) { x += e.x * 1.01; y += e.y * 1.01; moved = true; } }, z); // (not the helicopter's footprint, its rotor's reach: you walk up to its door, kept out of its hull by its own boxes, game.js carBoxes)
        if (!moved) break;
      }
      return { x, y };
    }
    // the first point of a way (points st metres apart) inside car o's footprint grown by (gl, gw),
    // refined between points: the distance along it, or -1
    let hO = null, hX = 0, hY = 0, hL = 0, hW = 0;
    const hIn = (x, y) => { const dx = x - hO.x, dy = y - hO.y; return Math.abs(dx * hX + dy * hY) < hL && Math.abs(-dx * hY + dy * hX) < hW; };
    function hitAt(Pa, n, o, gl, gw, st) {
      hO = o; hX = Math.sin(o.h); hY = Math.cos(o.h); hL = gl; hW = gw;
      for (let k = 0; k < n; k++) {
        if (!hIn(Pa[2 * k], Pa[2 * k + 1])) continue;
        if (k === 0) return 0;
        let lo = 0, hi = 1;
        for (let it = 0; it < 4; it++) { const m = (lo + hi) / 2; if (hIn(Pa[2 * k - 2] + (Pa[2 * k] - Pa[2 * k - 2]) * m, Pa[2 * k - 1] + (Pa[2 * k + 1] - Pa[2 * k - 1]) * m)) hi = m; else lo = m; }
        return (k - 1 + hi) * st;
      }
      return -1;
    }
    const onWay = line => { for (let k = 0; k < pathNext.length; k += 2) if (pathNext[k] === line) return true; return false; }; // (the pieces of the way just worked out)
    // the cars on each line this frame (for the room beyond a junction)
    const onLine = new Map();
    // the pieces of road a car has found too narrow for two to pass (in from a facade on its way: narrowF), for the far mouth
    const narrowSeen = new Uint8Array(net.L.length);
    // a car coming up exit e's piece towards the junction, near, on a street too narrow for two to pass (one of
    // them in from a facade, narrowF): car c waits at its line for it rather than turn in and stop just inside,
    // nose to nose with it, as that one waits at its own line for c's movement to clear the junction (each for
    // the other: Shibuya's junction 931, a car stood 75 s so with five queues behind)
    function narrowComing(c, e) {
      const m = e.m, ml = net.L[m.line], toward = m.end === 0 ? -1 : 1;
      if (ml.ow || JN.lanesOf(ml) > 1) return false;
      for (const j of onLine.get(m.line) || []) {
        const o = C[j];
        if (o === c || o.dir !== toward) continue;
        const d = toward < 0 ? o.s : ml.len - o.s;
        if (d < 30 && (o.narrowF > 0.2 || o.narrow > 0) && !(o.still > 20 && !(o.lineArm && o.toLine - o.half < 3))) return true; // (not one stood 20 s out on the piece, held there by something else: it is not coming)
      }
      // and the far mouth of a street the traffic has found too narrow for two (#317): a car crossing the junction there
      // onto it, towards c, is coming; and of one waiting at a line there to turn onto it for the street alone and c, the
      // one that has stood longer goes (of two as long, the one first in the traffic), read the same way at both ends. Read
      // at this end alone, both went in, met in the middle and one of them backed out
      if (!narrowSeen[m.line]) return false;
      const far = JN.armAt(m.line, 1 - m.end);
      if (!far) return false;
      const ic = C.indexOf(c);
      for (const a of far.j.arms) {
        if (a === far || !a.in) continue;
        for (const j of onLine.get(a.line) || []) {
          const o = C[j];
          if (o === c || o.v >= 0.3 && !o.mv) continue;
          if (o.mv && o.mv.j === far.j && o.mv.e.m.line === m.line) return true;
          if (o.lineArm === a && o.lineEx && o.lineEx.m.line === m.line && o.toLine - o.half < 3 && o.v < 0.3 && o.why === 'narrow') { // (held there by this street alone, not its light)
            const so = o.still || 0, sc = c.still || 0;
            if (so > sc + 0.5 || (Math.abs(so - sc) <= 0.5 && j < ic)) return true;
          }
        }
      }
      return false;
    }
    // is there room for car c on exit e of a junction, beyond it, behind the last car going out
    // that way (and the cars already crossing to it)?
    // (on an exit with two lanes, behind the cars in the lane it will be in)
    // the arm with signals whose queue car c stands in, by the cars ahead of it (each queued behind the next), or null
    function queuedFor(c) {
      let x = c.front;
      if (c.why === 'room' && c.lineArm && !c.lineArm.j.sig) x = c;
      for (let n = 0; n < 8 && x && x.q; n++) {
        const a = x.lineArm;
        if (a && a.j.sig) return a;
        if (a && x.why === 'light' && x.ex2 && x.ex2.a && x.ex2.a.j.sig) return x.ex2.a; // (held at this line by the light of the junction just after)
        if (a && x.why === 'room' && x.lineEx) { const b = JN.armBy(x.lineEx.m.line, 1 - x.lineEx.m.end); return b && b.in && b.j.sig ? b : null; }
        x = x.front;
      }
      return null;
    }
    function room(c, e) {
      const m = e.m, ml = net.L[m.line], out = m.end === 0 ? 1 : -1, two = JN.lanesOf(ml) > 1, ln = c.ln && e.lanes.includes(c.ln) ? c.ln : 0;
      let free = JN.reach(e), need = 2 * c.half + 2.5;
      for (const j of onLine.get(m.line) || []) {
        const o = C[j];
        if (o === c || o.dir !== out || (two && (o.ln || 0) !== ln)) continue;
        free = Math.min(free, (out > 0 ? o.s : ml.len - o.s) - o.half - m.back);
      }
      for (const a of m.j.active) if ((a.m & 15) === m.i && (!two || (a.m >> 4) === ln) && a.c !== c && a.c.line !== m.line) need += 2 * a.c.half + 2.5;
      // a short exit that simply runs on into another piece, no junction between (a slip road, a loop
      // back): the room is on those pieces too, up to the next junction's line, behind the last car on
      // them, or a car let in stops part way, still across this junction, in the queue for the next
      let reach = JN.reach(e), li = m.line, end = 1 - m.end, base = ml.len - m.back;
      for (let k = 0; k < 3 && reach < need && free >= reach && !JN.armAt(li, end); k++) {
        const nx = net.only(li, end);
        if (!nx) break;
        const l2 = net.L[nx[0]], d2 = nx[1] === 0 ? 1 : -1, a2 = JN.armAt(nx[0], 1 - nx[1]);
        reach = free = base + l2.len - (a2 ? a2.back : 0);
        for (const j of onLine.get(nx[0]) || []) {
          const o = C[j];
          if (o === c || o.dir !== d2) continue;
          free = Math.min(free, base + (d2 > 0 ? o.s : l2.len - o.s) - o.half);
        }
        li = nx[0]; end = 1 - nx[1]; base += l2.len;
      }
      return free >= Math.min(need, reach - 1);
    }
    // is car c's way across the junction at arm a (its line toLine ahead of its centre; its way ahead P,
    // np points step apart from its bumper) blocked by a ride or your car standing in it? That car, or null
    function wayBlocked(c, a, toLine, P, np, step) {
      const from = toLine - c.half - 0.5, j = a.j;
      let hit = null;
      for (const o of api.extra) {
        if ((o.v || 0) >= 0.5 || Math.abs(o.z - c.z) >= LEVEL || Math.hypot(o.x - j.x, o.y - j.y) > 35) continue;
        if (hitAt(P, np, o, o.half + 0.3, o.hw + c.hw + 0.15, step) >= from) { hit = o; break; }
      }
      return hit;
    }
    let redRuns = 0, revs = 0, laneChanges = 0, outOfRing = 0, squeezes = 0;
    const redLog = []; // (the last few cars over a crossing's line on red, how: tools/traffic_why.js)
    // The traffic as game.js reads it (#317 item 2: the step is to move to a Worker): `live`, the records of the cars
    // on the roads as the last step left them, each the same object from one frame to the next (here the car itself;
    // stepped in a Worker, a mirror its fields in VIEW are copied into each frame), and changes asked for by command
    // (stop, reverse), never by writing to a record. game.js reads nothing else of the traffic's cars; the tools may
    // (they run the main thread's step). `slots`: how many cars there can be, `active` how many are on now
    const live = [];
    const VIEW = ['line', 's', 'dir', 'x', 'y', 'z', 'h', 'v', 'half', 'hw', 'top', 'taxi', 'hex', 'why', 'youBy', 'heldBy', 'still', 'stuck', 'q', 'toLine', 'lineArm', 'lineEx', 'mv', 'front', 'rev'];
    const api = { mesh, fleet, C, live, VIEW, slots: C.length, active: n, near, pushOut, junctions: JN, netL: net.L, extra: [], honks: [], stop: c => { c.v = 0; } };
    const centreAt = [0, 0]; // (where the traffic was last centred: unjam's respawn)
    // who goes first where two cars' ways meet (car c's way comes into o's box d metres ahead of its
    // bumper, and o's into c's d2 ahead): read the same way by both, so that one goes and the other
    // waits and never both. A car that can no longer stop short of the place goes; then the one in
    // the junction (of two in it, the one in first); then the one nearer the place; at a dead heat,
    // the one first in the list (ic, io: the traffic's index, or -1 for a ride or your car). This is
    // what a ride's driver (cars.js chauffeur) reads too, as the traffic reads it of a ride.
    function first(c, o, d, d2, ic, io) {
      const cs = (c.v || 0) * (c.v || 0) / 8 > d + 0.3, os = (o.v || 0) * (o.v || 0) / 8 > d2 + 0.3; // (braking at 4 m/s²)
      if (cs !== os) return cs;
      if (c.mv && o.mv && c.mv.j === o.mv.j) return c.mvT < o.mvT || (c.mvT === o.mvT && ic < io);
      if (c.mv && !o.mv && o.toLine > 0) return true;
      if (!c.mv && o.mv && c.toLine > 0) return false;
      // (already touching, each in the other's way at once: the one in front goes on and the one behind waits,
      // as the one behind can't drive through it; at a dead heat the ride's driver, which never steps
      // further into a car it can see, and the car that gave it way would both stand for good)
      if (d < 0.5 && d2 < 0.5) { const a = (o.x - c.x) * Math.sin(c.h) + (o.y - c.y) * Math.cos(c.h); if (Math.abs(a) > 0.3) return a < 0; }
      return d < d2 - 0.5 || (Math.abs(d - d2) <= 0.5 && ic < io);
    }
    JN.first = first;
    // the Intelligent Driver Model's interaction term: the acceleration a car at speed v takes for
    // something gap metres ahead (bumper to it) moving at vl along its way; s0 the gap it stops at, T its
    // time gap, a and b its comfortable acceleration and braking. (The free road term is the limit above.)
    function idm(v, gap, vl, s0, T, a, b) {
      const ss = s0 + Math.max(0, v * T + v * (v - vl) / (2 * Math.sqrt(a * b)));
      return a * (1 - (ss / Math.max(0.05, gap)) * (ss / Math.max(0.05, gap)));
    }
    if (crowd) crowd.cars = api;
    if (nav) nav.movers = api;
    // clear a junction's box (a scramble whose walk the opening shot turns green at once, #110): a car
    // in it, or still moving within r of its node, comes back elsewhere, out past r, rather than being
    // caught in the box by the crowd stepping off the kerbs
    // a car that holds a driver up for good (game.js, the chauffeur at a jam that no light explains): it backs out to
    // the junction behind if it can, as from a narrow street; one that cannot (in a junction's box, a car behind it)
    // leaves the traffic and comes back elsewhere, as does one asked a second time
    api.unjam = (c, hard) => { // (hard: asked before, and it stands there yet)
      if (!c || c.line < 0 || c.park || !C.includes(c)) return '';
      if (!hard && reverse(c)) return 'backs out';
      respawn(c, centreAt[0], centreAt[1], radius * 0.6);
      return 'gone';
    };
    api.clearBox = (x, y, r) => {
      let k = 0;
      for (const c of C) {
        if (c.line < 0 || Math.hypot(c.x - x, c.y - y) > r || !(JN.inner(c.line) || c.v > 1.5)) continue;
        respawn(c, x, y, r + 20); k++;
      }
      return k;
    };
    // the traffic out of a lane from (ax, ay) to (bx, by), w m either side and widening by 0.15 a metre (game.js
    // clearSight: a frame's sightline in a stopped world. A car held on the zebra between the lens and frame 6's corner
    // filled the finder and the print on a phone, issue 75): each car in it comes back elsewhere, out of sight
    api.clearLane = (ax, ay, bx, by, w) => {
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      let k = 0;
      for (const c of C) {
        if (c.line < 0 || c.park) continue;
        const t = (c.x - ax) * ux + (c.y - ay) * uy, side = Math.abs((c.x - ax) * -uy + (c.y - ay) * ux);
        if (t < -3 || t > L + 3 || side > w + 0.15 * Math.max(0, t) + 2.6) continue; // (2.6 m: half a car's length, its middle to its bumper)
        respawn(c, (ax + bx) / 2, (ay + by) / 2, L / 2 + 30); k++;
      }
      return k;
    };
    // a car leaves the traffic (a taxi you hailed): its slot comes back elsewhere, out of sight
    function take(c) { JN.forget(c); c.line = -1; c.v = 0; }
    // ask traffic car o to back off for t seconds (not your car or a ride, and not one that has
    // already backed off a good while without moving on since): whether it will
    // has it room on its piece to back off into (not at the very start of it)?
    const canBack = o => o.line >= 0 && (o.dir > 0 ? o.s > 0.5 : o.s < net.L[o.line].len - 0.5);
    // of two cars of the traffic each stopped with the other as the one in front (braked for along its way, or
    // held by it as it steps), which goes on: one rule, read the same way by both and by every place that parts
    // such a pair (the face-off, the backing off, the squeeze below), so that the one each waits on is never the
    // one that waits on it. The one that can't back off goes; then the one in a junction; of two in one, the one
    // in first; then the one first in the traffic. (Read one way by the face-off, with the backing off a car
    // could do, and another by the squeeze, without it, two in Sydney's junction 461 each waited on the other
    // through every cycle, #312.)
    const goesFirst = (c, o) => {
      const cb = canBack(c), ob = canBack(o);
      if (cb !== ob) return ob;
      if (!!c.mv !== !!o.mv) return !!c.mv;
      if (c.mv && c.mvT !== o.mvT) return c.mvT < o.mvT;
      return C.indexOf(c) < C.indexOf(o);
    };
    function backOff(o, t) {
      if (o.stuck === undefined || o.line < 0 || o.boSpent > 6) return false;
      // (not with your car or a ride close behind it: it would back into a car that cannot be asked to move, be held by it,
      // and hold it in turn. A bus in Dogenzaka-shita's junction so stood with the autopilot's car 0.6 m behind it until
      // the car was handed back, issue 167)
      const hx = Math.sin(o.h), hy = Math.cos(o.h);
      for (const b of api.extra) {
        if (!b.half || (b.z != null && Math.abs(b.z - o.z) >= LEVEL)) continue;
        const a = (b.x - o.x) * hx + (b.y - o.y) * hy, w = -(b.x - o.x) * hy + (b.y - o.y) * hx;
        if (a < 0 && a > -(o.half + b.half + t + 1.5) && Math.abs(w) < o.hw + (b.hw || 0.9) + 0.3) return false;
      }
      o.backoff = Math.max(o.backoff || 0, t);
      return true;
    }
    // reversing out of a one-way street blocked ahead (a jam that won't clear, a wall across it: #283): the car
    // backs along its lane to the junction behind, where it takes another way out, as a driver does who can't turn
    // round in one lane against the traffic. The cars stopped behind it on the street back out first (it asks them
    // to). The ways out of the end of line `line` behind a car going `dir` (not the line itself, nor against a
    // one-way street, nor one to avoid or too narrow for it, nor one shut now): [[line, its end there], ...]
    const REV_V = 2.4, REV_MAX = 80; // backing speed (m/s), and the farthest it backs (m): a junction behind farther than that, it waits as before
    function waysOut(c, line, dir) {
      const l = net.L[line], k = dir > 0 ? 0 : l.pts.length / 3 - 1;
      return (net.nodes.get(net.key(l.pts[3 * k], l.pts[3 * k + 1])) || []).filter(([li, e]) => li !== line && net.L[li].ow !== (e === 0 ? -1 : 1)
        && !(net.avoid && net.avoid[li]) && !(net.fit && net.fit[li] < c.hw) && !(JN.shutNow && JN.shutNow(li, e === 0 ? 1 : -1)));
    }
    // the one piece a reversing car backs on onto past the end of its line, where there is no way out there (a bend
    // the data splits in two): the line that runs into this one, one-way the same way, alone at that node
    function backOnto(line, dir) {
      const l = net.L[line], k = dir > 0 ? 0 : l.pts.length / 3 - 1, at = (net.nodes.get(net.key(l.pts[3 * k], l.pts[3 * k + 1])) || []).filter(o => o[0] !== line);
      if (at.length !== 1) return null;
      const [li, e] = at[0], d = e === 1 ? 1 : -1; // (arriving at its end 1: it ran along it the way of its points)
      return net.L[li].ow === -d ? null : [li, d];
    }
    function canReverse(c) {
      if (c.line < 0 || c.rev || c.park || c.parking || c.stuck === undefined || c.revBan > 0 || JN.inner(c.line) || (c.mv && c.mv.e && c.mv.e.m.line !== c.line)) return false; // (not one still in a junction's box, but one on its way out of it onto this piece)
      // (nor one parked at the kerb, or pulling in to it: a parked car takes no step, and one asked to back out stood
      // there for good, reversing 0 m, Tokyo's piece 208 by the station plaza)
      // (nor one with a ride or your car close behind it: they don't back off for the traffic, and a ride coming for you
      // stood behind three cars backing out towards it, one after another, in Fushimi Inari)
      { const hx = Math.sin(c.h), hy = Math.cos(c.h); for (const o of api.extra) { const a = (o.x - c.x) * hx + (o.y - c.y) * hy; if (a < 0 && a > -(c.half + (o.half || 2.3) + 12) && Math.abs((o.x - c.x) * hy - (o.y - c.y) * hx) < 3.5) return false; } }
      let line = c.line, dir = c.dir, run = c.dir > 0 ? c.s : net.L[c.line].len - c.s;
      for (let k = 0; k < 6 && run < REV_MAX; k++) {
        if (waysOut(c, line, dir).length) return true;
        const b = backOnto(line, dir);
        if (!b) return false;
        [line, dir] = b; run += net.L[line].len;
      }
      return false;
    }
    function reverse(c) {
      if (!canReverse(c)) return false;
      JN.forget(c);
      c.rev = { v: 0, d: 0, wait: 0 }; c.nx = undefined; c.plan = c.ex = c.ex2 = c.exA = null; c.stuck = 0; c.q = false;
      revs++;
      return true;
    }
    // a step of a reversing car: whether it took it (the frame's update for the car is done)
    function reverseStep(c, i, dt, cx, cy) {
      const R = c.rev, l = net.L[c.line], hx0 = Math.sin(c.h), hy0 = Math.cos(c.h);
      c.why = 'reversing'; c.heldBy = ''; c.front = null; c.q = false; c.stuck = 0; c.still = 0; c.v = 0; c.toLine = undefined; c.lineArm = c.lineEx = null; c.np = 0; // (at no line while it backs: read at one, its distance to it was NaN, #330)
      const atEnd = c.dir > 0 ? c.s <= 0.05 : c.s >= l.len - 0.05;
      if (atEnd) {
        const outs = waysOut(c, c.line, c.dir);
        if (!outs.length) { // (on round a bend onto the piece before)
          const b = backOnto(c.line, c.dir);
          if (!b || R.d > REV_MAX) { c.rev = null; return false; }
          c.line = b[0]; c.dir = b[1]; c.s = b[1] > 0 ? net.L[b[0]].len : 0;
          return true;
        }
        // out by the way that turns least from the way it faces (the nose swings round to it as it pulls away)
        const head = o => { const L1 = net.L[o[0]], d = o[1] === 0 ? 1 : -1; net.at(o[0], d > 0 ? Math.min(4, L1.len) : Math.max(0, L1.len - 4), tmp); return Math.atan2(tmp.hx * d, tmp.hy * d); };
        let best = null, bd = Infinity;
        for (const o of outs) { const a = Math.abs(Math.atan2(Math.sin(head(o) - c.h), Math.cos(head(o) - c.h))); if (a < bd) { bd = a; best = o; } }
        const line = best[0], dir = best[1] === 0 ? 1 : -1, L1 = net.L[line], s = dir > 0 ? Math.min(1, L1.len) : Math.max(0, L1.len - 1), lo = side * JN.shiftOf(L1, 0);
        lanePos(line, s, dir, tmp, lo);
        if (overlaps(c, tmp.x, tmp.y, tmp.hx, tmp.hy, 0.3, 0.1) > 0 || peopleIn(c, tmp.x, tmp.y, tmp.hx, tmp.hy) > 0) {
          const bk = mostCar; R.wait += dt; R.by = bk;
          // (one stopped where it would pull out, able to back off a metre or two, is asked to, as on its way back)
          if (bk && !bk.rev && bk.v < 0.5 && R.wait > 3 && canBack(bk)) backOff(bk, 2);
          if (R.wait > 20) { c.revBan = 60; c.revEnd = `no room on the way out${bk ? ` (car ${C.indexOf(bk)}, ${bk.why}, v ${(+bk.v || 0).toFixed(1)}, on piece ${bk.line})` : ' (someone on foot)'}`; c.rev = null; }
          return true;
        }
        c.line = line; c.s = s; c.dir = dir; c.ln = 0; c.lo = lo; c.off = 0; c.pv = null; c.rev = null;
        c.wallGap = Infinity; c.wallT = 0; c.atWall = 0; c.narrow = 0; c.narrowF = 0; c.narrowIn = Infinity; c.inWallNow = false;
        c.x = tmp.x; c.y = tmp.y; onGround(c, tmp); c.v = 0.5; // (its heading eased round to the new way's by its next steps, not swung at once)
        return false; // (on its way from here this frame, as any car)
      }
      const v = Math.min(REV_V, R.v + 1.2 * dt), sb = Math.max(0, Math.min(l.len, c.s - c.dir * v * dt));
      // (not back into the box of the junction behind while others are let into it: it waits short of it until the box
      // is clear, as it would at a line. Backed in, it stood across 1120's way onto piece 2481, two cars let in for it
      // standing 75 s in the junction behind it, Shinjuku #330)
      const ab = JN.armBy(c.line, c.dir > 0 ? 0 : 1), rear = s0 => (c.dir > 0 ? s0 : l.len - s0) - c.half;
      // (busy for it: a car let in onto this piece, or one crossing the box within 10 m of its mouth)
      const mk = c.dir > 0 ? 0 : l.pts.length - 3, mx = l.pts[mk], my = l.pts[mk + 1];
      // (12 s at most: a box busy all the time, a scramble's, it backs into as before, the cars there stopping for it)
      if (ab && rear(sb) < ab.back && rear(c.s) >= ab.back - 0.05 && (R.boxT || 0) < 12 && ab.j.active.some(o => o.c !== c && ((o.m & 15) === ab.i || Math.hypot(o.c.x - mx, o.c.y - my) < 10))) {
        R.v = 0; R.boxT = (R.boxT || 0) + dt; R.by = null;
        q.setFromAxisAngle(up, Math.PI - c.h); m4.compose(W(c.x, c.y, c.z), q, one); place(i, c);
        return true;
      }
      lanePos(c.line, sb, c.dir, tmp, c.off + c.lo);
      const bd = overlaps(c, tmp.x - hx0 * 0.6, tmp.y - hy0 * 0.6, hx0, hy0, 0.3, 0.1), bk = mostCar;
      // (clear behind, or backing away from the one it is up against: a car ahead within its margins, backing out too, held
      // the one behind it, which held it in turn, each "held by" the other, Sydney's piece 1192, #317)
      const away = bd > 0 && bd < overlaps(c, c.x - hx0 * 0.6, c.y - hy0 * 0.6, hx0, hy0, 0.3, 0.1) - 1e-4 && (overlaps(c, tmp.x - hx0 * 0.6, tmp.y - hy0 * 0.6, hx0, hy0, 0.3, 0.1), mostCar === bk) && (bk.x - c.x) * hx0 + (bk.y - c.y) * hy0 > 0
        && !bk.rev; // (never one backing out too: at the end of its piece, turning out of it, the one in front of it read as ahead, and backed 0.65 m into it, Kyoto's piece 739)
      if ((bd === 0 || away) && peopleIn(c, tmp.x - hx0 * 0.3, tmp.y - hy0 * 0.3, hx0, hy0) === 0) {
        R.d += Math.abs(sb - c.s); R.v = v; R.wait = 0;
        c.s = sb; c.x = tmp.x; c.y = tmp.y; onGround(c, tmp);
        const dh = Math.atan2(Math.sin(Math.atan2(tmp.hx, tmp.hy) - c.h), Math.cos(Math.atan2(tmp.hx, tmp.hy) - c.h));
        c.h += dh * Math.min(1, dt * 6);
        c.ax = c.x; c.ay = c.y; c.idle = 0;
      } else {
        R.v = 0; R.wait += bk && bk.rev ? dt * 0.25 : dt; R.by = bk; // (behind it one backing out too, waiting at the junction behind for room: it waits its turn, not giving up after 20 s)
        // (nor for a ride or your car behind it: it won't back off for the traffic, and a ride coming for you stood 7 s
        // behind three cars backing out towards it, one after another, in Fushimi Inari)
        if (bk && !bk.rev && bk.stuck === undefined && R.wait > 1) { c.revBan = 60; c.revEnd = 'a ride or your car behind it'; c.rev = null; }
        // the car behind, stopped on this street and going its way: it backs out first
        else if (bk && bk.line === c.line && bk.dir === c.dir && !bk.rev && bk.v < 0.5 && (c.s - bk.s) * c.dir > 0) reverse(bk);
        // (one stopped across its way back, at the junction behind or on the piece beyond: after 3 s it is asked to back off
        // a metre or two, as one of two of the traffic is; else the car gave up after 20 s, held by one waiting at a line
        // there that could have made it room, Fushimi Inari's piece 99)
        else if (bk && !bk.rev && bk.v < 0.5 && R.wait > 3 && canBack(bk)) backOff(bk, 2);
        if (c.rev && (R.wait > 20 || R.d > REV_MAX)) { c.revBan = 60; c.revEnd = R.d > REV_MAX ? 'backed out as far as it goes' : bk ? `held by car ${C.indexOf(bk)} (${bk.why}, v ${(+bk.v || 0).toFixed(1)}${bk.line === c.line ? '' : `, on piece ${bk.line}`}${bk.rev && bk.rev.by ? `, itself held by car ${C.indexOf(bk.rev.by)} (${bk.rev.by.why}${bk.rev.by.line === bk.line ? '' : `, on piece ${bk.rev.by.line}`})` : ''})` : 'held by someone behind it'; c.rev = null; } // (it waits on as before; asked again if it stays stuck)
      }
      q.setFromAxisAngle(up, Math.PI - c.h);
      m4.compose(W(c.x, c.y, c.z), q, one);
      place(i, c);
      return true;
    }
    // how deep a car-sized box (x, y at height z, heading h, half length and width, grown by m) would
    // be in the traffic's cars (not api.extra): 0 when clear. For a car driven by something else (a
    // ride) to wait rather than move into one, as the traffic waits for it
    const probe = { half: 0, hw: 0, z: 0 };
    function footprint(x, y, z, h, half, hw, m = 0.15) {
      Object.assign(probe, { half, hw, z });
      ownOnly = true;
      const d = overlaps(probe, x, y, Math.sin(h), Math.cos(h), m, m);
      ownOnly = false;
      api.footBy = d > 0 ? mostCar : null; // (the car deepest in it, for the checks' logs)
      return d;
    }
    // a ride's driver nose to nose with cars of the traffic that won't move off (each waiting on the other):
    // the ones up against its box (x, y, z, heading h, half length and width, grown by m) are asked to back
    // off a metre or two, as one of two of the traffic is (backOff). Whether any will
    function makeWay(x, y, z, h, half, hw, m = 0.8) {
      Object.assign(probe, { half, hw, z });
      ownOnly = true;
      const set = new Set();
      overlaps(probe, x, y, Math.sin(h), Math.cos(h), m, m, set);
      ownOnly = false;
      let k = 0;
      // (not one ahead of the asker and facing its way: backing off, it backs into the asker. The autopilot behind a bus in
      // Dogenzaka-shita's junction asked it to make way, the bus backed into the car, was held by it, and each waited on the
      // other until the autopilot gave the car back, issue 167)
      const hx = Math.sin(h), hy = Math.cos(h);
      for (const o of set) {
        if ((o.x - x) * hx + (o.y - y) * hy > 0 && Math.sin(o.h) * hx + Math.cos(o.h) * hy > 0.3) continue;
        if (canBack(o) && backOff(o, 2)) k++;
      }
      return k > 0;
    }
    JN.makeWay = makeWay;
    api.busStops = busStops; api.busStopped = 0; api.deliveries = 0; // (for the checks)
    api.kerbLo = kerbLo; // (for the checks: how far off the lane a line's kerb is, or 0)
    api.parkStats = { share: PARKED, looks: 0, noKerb: 0, notNow: 0, noRoom: 0, began: 0, gaveUp: 0, why: '', no: kerbNo }; // (the looks for room at the kerb, and what became of them)
    JN.room = (c, e) => room(c, e); // (a ride's driver waits at the line for room beyond, as the traffic does: never stopped in the box)
    // blockers: the player on foot { x, y, z } and your car or a ride { x, y, half (half length),
    // hw (half width), parked }; a parked one beside the lane is passed by swinging out round it
    let tick = 0;
    const FAR = 160; // cars farther than this from the eye (m, along x and y) take a step every second frame
    // is car c where the camera can see it: near enough, and not behind it or far out to a side?
    const look = new THREE.Vector3();
    function inView(c) {
      if (!eye) return false;
      const dx = c.x - eye.position.x, dy = c.y + eye.position.z, d = Math.hypot(dx, dy);
      const h = Math.hypot(look.x, look.z); // (looking down from high up, all round it)
      return d < 12 || (d < 200 && (h < 0.3 ? d < 150 : (dx * look.x - dy * look.z) / (d * h) > 0.3)); // (sim y is -z)
    }
    function update(dt0, cx, cy, t, blockers) {
      centreAt[0] = cx; centreAt[1] = cy;
      const dt = dt0;
      tick++;
      if (eye) eye.getWorldDirection(look);
      if (fleet) for (const k in fleet) for (const M of fleet[k]) M.count = 0;
      // the eye's frustum as it was last drawn, to leave out the cars it cannot see; not across a cut
      culling = !!(fleet && eye && eye.isCamera && eye.position.distanceToSquared(eyeAt) < 400);
      if (fleet && eye && eye.isCamera) { eyeAt.copy(eye.position); frustum.setFromProjectionMatrix(fm.multiplyMatrices(eye.projectionMatrix, eye.matrixWorldInverse), eye.coordinateSystem, eye.reversedDepth); }
      head.fill(-1); bhead.fill(-1); nb = 0;
      for (const a of onLine.values()) a.length = 0;
      live.length = 0;
      for (let i = 0; i < api.active; i++) {
        const c = C[i];
        if (c.line < 0) continue;
        live.push(c);
        const k = bucket(Math.floor(c.x / CELL), Math.floor(c.y / CELL));
        chain[i] = head[k]; head[k] = i;
        if (!onLine.has(c.line)) onLine.set(c.line, []);
        onLine.get(c.line).push(i);
      }
      JN.update(dt, t);
      const TR = JN.trips && JN.trips(); // (where the traffic is going, trips.js)
      youX = cx; youY = cy;
      const WXT = (window.OECars && OECars.weather) || DRY; // (the weather as drivers meet it)
      const you = api.extra.find(o => o.id === 'car' && !o.ahead && o.v > 3); // your car on the move (dodged, below)
      for (const b of blockers) if (!b.half) addBlocker(b.x, b.y, b.z, 0.4); // the player on foot and the NPCs (your car and a ride: below)
      if (crowd) for (let i = 0; i < crowd.active; i++) { const p = crowd.P[i]; if (p.line >= 0) addBlocker(p.x, p.y, p.z, 0.3, i); }
      for (let i = 0; i < n; i++) {
        const c = C[i];
        if (i >= api.active) { if (c.line >= 0) JN.forget(c); c.line = -1; if (mesh) { m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, m4); } continue; }
        if (c.line < 0 || Math.hypot(c.x - cx, c.y - cy) > radius * 1.15) respawn(c, cx, cy, c.line < 0 && t < 1 ? 0 : radius * 0.6);
        if (c.line < 0) { if (mesh) { m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, m4); } continue; }
        // at the kerb (parkNow): no step. Its time up and the lane beside it clear, it pulls out, as a lane change from
        // where it stands, on a trip out of town or to another part of it
        if (c.park) {
          // (and its way out past the car parked ahead of it clear: boxed in for two minutes, and out of your sight, it leaves the traffic)
          if (c.park.t < -120 && !inView(c)) { respawn(c, cx, cy, radius * 0.6); continue; }
          // (one that holds the traffic up, a car stood 8 s behind it in its lane, as one at a bend whose body stands out into
          // the lane: it pulls out and drives on as soon as its way out is clear, or out of your sight leaves the traffic.
          // Shibuya's car 120 stood 21 s behind one)
          if (c.park.blockT > 8) { c.park.blockT = 0; if (!inView(c)) { respawn(c, cx, cy, radius * 0.6); continue; } c.park.t = Math.min(c.park.t, 0); c.park.look = 0; }
          if ((c.park.t -= dt0) > 0 || (c.park.look = (c.park.look || 0) - dt0) > 0 || !(c.park.look = 0.5, laneClear(c) && wayIn(c, c.line, c.s, c.dir, 1))) {
            q.setFromAxisAngle(up, Math.PI - c.h); m4.compose(W(c.x, c.y, c.z), q, one); place(i, c); continue;
          }
          const T = JN.trips && JN.trips();
          c.park = null; c.pullOut = 6; c.still = c.stuck = 0; c.why = ''; c.trip = T ? T.pick(c.x, c.y) : -1; c.left = (c.left || 0) + 1;
        }
        if (c.pullOut > 0) c.pullOut -= dt0;
        // far off, a step of two frames every second frame (the same traffic at half the work)
        // (and out of the camera's view, 70 m or more from it and 60 m from you: unseen, it keeps the same ways at half the
        // work, which pays for the trips' denser traffic in town, #355)
        const fd = eye ? Math.abs(eye.position.x - c.x) + Math.abs(eye.position.z + c.y) : 0;
        // (unseen past 300 m: every fourth frame. Every fourth frame from 120 m unseen jammed the junctions three times as
        // often: their turns and reservations want the finer steps)
        const unseen = eye && fd > 70 && Math.abs(c.x - cx) + Math.abs(c.y - cy) > 60 && !inView(c);
        const every = !eye ? 1 : unseen && fd > 300 ? 4 : fd > FAR || unseen ? 2 : 1;
        if (every > 1 && (tick + i) % every) { q.setFromAxisAngle(up, Math.PI - c.h); m4.compose(W(c.x, c.y, c.z), q, one); place(i, c); continue; }
        const half = every > 1, dt = every * dt0;
        if (c.revBan > 0) c.revBan -= dt; // (having given up backing out, it doesn't try again for a minute: tried every 20 s, one stood backing in a junction's mouth, the junction's movements held a minute, Sydney's 461)
        if (c.rev && (c.mv || c.line < 0)) c.rev = null;
        if (c.rev && reverseStep(c, i, dt, cx, cy)) continue;
        const l = net.L[c.line];
        // brake for anything in its way ahead: other cars, the player, pedestrians in the road;
        // the gap is bumper to bumper, so a bus keeps its length back
        const fx = Math.sin(c.h), fy = Math.cos(c.h), reach = Math.min(40, l.v / 0.9 + 4 + c.half);
        // which road it takes at the end of this one, chosen in time to look along it: at a
        // junction, its exit and the pieces across to it (c.ex, c.plan); else the next piece
        const end = c.dir > 0 ? 1 : 0, arm = JN.armAt(c.line, end);
        if (c.nx === undefined) {
          // (the way across chosen before it got here: coming up to it, or crossing the junction before with it)
          c.ex = arm ? (c.exA && c.exA.a === arm ? c.exA.e : c.ex2 && c.ex2.a === arm ? c.ex2.e : JN.choose(arm, c.hw, c.half, tripOf(c), c.bus)) : null;
          if (c.exA && c.exA.a === arm) c.exA = null;
          if (c.ex2 && c.ex2.a === arm) c.ex2 = null;
          c.plan = c.ex ? c.ex.steps.slice(1) : null;
          c.nx = c.ex ? c.ex.steps[0] : net.next(c.line, end, true, c.hw);
        }
        c.inAhead = !!c.mv && api.extra.length > 1 && api.extra.some(o => o.ahead && boxIn(c, o)); // (in a junction, in where a ride backing out will be)
        const left = c.dir > 0 ? l.len - c.s : c.s, nl = c.nx ? c.nx[0] : -1, nd = c.nx ? (c.nx[1] === 0 ? 1 : -1) : 0;
        let gap = 40, byCar = false, swerve = 0, front = null, why = '', walker = -1;
        // the road ends ahead in nothing (a stub at the map's edge, a dead end): it slows to turn round there
        if (!c.nx && !arm && left + 4 < gap) { gap = left + 4; why = 'end'; }
        // at the end of a trip into town: room at the kerb 12 m and two seconds ahead on this street, looked for
        // twice a second; found, it slows to stop there and pulls in (c.parking: where, and how far off the lane)
        // a bus and its stops (busStops): the next one ahead on this piece, slowed for and stopped at; then its dwell
        if (c.bus && (c.dwell > 0 || busStops.size)) {
          if (c.dwell > 0) {
            c.dwell -= dt;
            if (gap > 2.6) { gap = 2.6; why = 'stop'; byCar = false; front = null; }
          } else if (!c.mv && !c.rev) {
            const S = busStops.get(c.line);
            if (S) for (const st of S) {
              if (st.dir !== c.dir || st === c.lastStop) continue;
              const d = (st.s - c.s) * c.dir - c.half + 1.2; // (its front door, 1.2 m back from its nose, to the pole)
              if (d < -3 || d > 70) continue;
              if (d + 2.6 < gap) { gap = Math.max(2.6, d + 2.6); why = 'stop'; byCar = false; front = null; }
              c.stopAhead = d < 30;
              if (d < 1.5 && c.v < 0.3) {
                c.dwell = 8 + rnd() * 10; c.lastStop = st; c.stopped = (c.stopped || 0) + 1; api.busStopped++;
                // (people on and off at its front door, on the kerb's side: where you could see them)
                if (crowd && crowd.board && Math.hypot(c.x - cx, c.y - cy) < 150) {
                  const fx0 = Math.sin(c.h), fy0 = Math.cos(c.h), k = side * (c.hw + 0.7), dx = c.x + fx0 * (c.half - 1.6) - fy0 * k, dy = c.y + fy0 * (c.half - 1.6) + fx0 * k;
                  c.boarding = crowd.board({ x: dx, y: dy, z: c.z }, 1 + Math.floor(rnd() * 3), Math.floor(rnd() * 3), () => c.dwell > 1 && c.line >= 0, cx, cy);
                  if (c.boarding > 1) c.dwell += 3 * (c.boarding - 1); // (a longer stop for more people)
                }
              }
              break;
            }
          }
        }
        // (on the street its trip ends in: the trip is over, and it looks for the kerb)
        // (and from 300 m short of it by road, a car bound into town takes any room at the kerb it passes, as a driver
        // near where they are going does: looked up once a second)
        if (TR && c.trip >= 0 && !c.parking) {
          const P = TR.places[c.trip];
          if (P.line === c.line && !c.wantPark) { if (P.kind === 'centre' && !c.bus) c.wantPark = 30; c.trip = TR.pick(c.x, c.y); c.trips = (c.trips || 0) + 1; }
          else if (P.kind === 'centre' && !c.bus && !c.wantPark && (c.nearT = (c.nearT || 0) - dt) <= 0) { c.nearT = 1; if (TR.cost(c.trip, c.line, c.dir) < 300 + l.len) c.wantPark = 2; }
        }
        // a van on its round: every minute or two it stops at the kerb for a delivery, hazards on, and goes again
        if (c.van && !c.parking && !c.wantPark && (c.dropT = (c.dropT ?? 20 + rnd() * 80) - dt) <= 0) { c.dropT = 50 + rnd() * 90; c.wantPark = 14; c.deliver = true; }
        if (c.wantPark > 0) {
          c.wantPark -= dt;
          if (!c.parking && !c.mv && !c.rev && !c.ln && (c.parkLook = (c.parkLook || 0) - dt) <= 0) {
            c.parkLook = 0.5;
            const s1 = c.s + c.dir * (12 + 2 * c.v + c.half), PS = api.parkStats;
            PS.looks++;
            if (!kerbLo(c.line)) PS.noKerb++;
            else if (Math.abs(c.lo - side * JN.shiftOf(l, 0)) >= 0.2 || parkedN() >= PARK_MAX * api.active) PS.notNow++;
            else if (!(s1 > 0 && s1 < l.len && kerbFree(c, c.line, s1, c.dir) && wayIn(c, c.line, s1, c.dir))) PS.noRoom++;
            else { c.parking = { line: c.line, s: s1, lo: side * kerbLo(c.line), t: 0 }; PS.began++; }
          }
          if (c.wantPark <= 0 && !c.parking) { c.wantPark = 0; c.deliver = false; }
        }
        if (c.parking) {
          const P = c.parking, d = (P.s - c.s) * c.dir;
          P.t += dt;
          // (given up: 25 s on, the place overshot, or taken meanwhile by another)
          // (or stopped short of the kerb with something in its way across: it drives on rather than stand in the lane)
          if (P.line !== c.line || P.t > 25 || d < -3 || c.mv || (c.v < 0.3 && d > 4 && P.t > 12) || (c.v < 0.2 && d < 3 && Math.abs(c.lo - P.lo) > 0.5 && (P.stood = (P.stood || 0) + dt) > 2.5)) { api.parkStats.gaveUp++; api.parkStats.why = `t ${P.t.toFixed(0)} d ${d.toFixed(1)} v ${c.v.toFixed(1)} lo ${(c.lo - P.lo).toFixed(1)} ${c.mv ? 'in a junction' : ''} ${why}`; c.parking = null; c.wantPark = 0; }
          else if (c.v < 0.25 && d < 2.2 && Math.abs(c.lo - P.lo) < 0.2) { // (in: it stands)
            const s0 = c.s;
            lanePos(c.line, s0, c.dir, tmp, c.lo);
            // (a van's delivery: 12 to 40 s, its hazards on; a taxi waits a minute or so for a fare; the rest park)
            const drop = c.deliver;
            parkNow(c, c.line, s0, c.dir, drop ? 12 + rnd() * 28 : c.taxi ? 25 + rnd() * 70 : dwell()); c.parkedIn = (c.parkedIn || 0) + 1;
            if (drop) { c.park.hazard = true; c.deliver = false; api.deliveries++; }
            q.setFromAxisAngle(up, Math.PI - c.h); m4.compose(W(c.x, c.y, c.z), q, one); place(i, c); continue;
          } else if (d + 2.6 < gap) { gap = d + 2.6; why = 'parking'; }
        }
        // its way ahead: points every STEP metres from its front bumper along its lane, on to the
        // next piece and its way across a junction (as lanePos smooths it round corners)
        const P = c.ps || (c.ps = new Float32Array(2 * NPATH)), PZ = c.pz || (c.pz = new Float32Array(NPATH)), Q = pathQ;
        let np = 0, pk0 = 0, laneAt = 0; // (laneAt: how far across from the road's line the points are)
        // (far from the eye, points twice as far apart: they serve as well there, at half the work)
        const step = !eye || Math.abs(eye.position.x - c.x) + Math.abs(eye.position.z + c.y) < 250 ? STEP : 2 * STEP;
        c.pst = step;
        {
          const sb = Math.max(0, Math.min(l.len, c.s - c.dir * 2 * step)); // from two steps back (or the start of the line), for the direction
          let li = c.line, di = c.dir, si = sb, q = 0, nq = 0, ck = -1;
          // (moving across to another lane: its way between the two, where it sees the cars in both)
          const loT0 = side * JN.shiftOf(l, c.ln), lane = LANE * side + c.off + (Math.abs(c.lo - loT0) > 0.15 ? (c.lo + loT0) / 2 : c.lo), nxt = pathNext;
          nxt.length = 0;
          if (c.nx) { nxt.push(nl, nd); if (c.plan) for (const st of c.plan) nxt.push(st[0], st[1] === 0 ? 1 : -1); }
          const total = c.half + reach + 2 * step;
          for (let d = 0; d <= total + 2 * step && nq < NPATH + 4; d += step) {
            const L1 = net.L[li];
            if (si < 0 || si > L1.len) {
              if (q + 1 >= nxt.length) break;
              const over = si > L1.len ? si - L1.len : -si;
              li = nxt[q]; di = nxt[q + 1]; q += 2; ck = -1;
              si = di > 0 ? over : net.L[li].len - over;
              if (si < 0 || si > net.L[li].len) break;
            }
            // (the point at si: walking the line's segments on from the last point's, not searching them)
            const Lc = net.L[li], cum = Lc.cum, pt = Lc.pts, nn = cum.length, sc = si < 0 ? 0 : si > Lc.len ? Lc.len : si;
            if (ck < 0) { let lo = 1, hi = nn - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < sc) lo = m + 1; else hi = m; } ck = lo; }
            else { while (ck < nn - 1 && cum[ck] < sc) ck++; while (ck > 1 && cum[ck - 1] > sc) ck--; }
            const tt = (sc - cum[ck - 1]) / Math.max(1e-6, cum[ck] - cum[ck - 1]), b3 = 3 * ck;
            Q[2 * nq] = pt[b3 - 3] + (pt[b3] - pt[b3 - 3]) * tt; Q[2 * nq + 1] = pt[b3 - 2] + (pt[b3 + 1] - pt[b3 - 2]) * tt; pathZ[nq] = pt[b3 - 1] + (pt[b3 + 2] - pt[b3 - 1]) * tt; nq++;
            si += di * step;
          }
          // the speed a bus can take the bends of its way at (#283), from its middle on (a bend between its middle and
          // its bumper is one it is still going round): round each, no more than BUS_A of sideways pull, braking for it
          // in time at BEND_B, and out of one gathering speed gently. It took a junction's corner at its full 50 km/h,
          // its heading swinging 15 degrees in a tenth of a second (tools/bus_turn.js). (The cars keep their speed
          // round a corner for now: slowed so, the queues at the lights grew and a taxi in Shinjuku came in 50 s,
          // not 10; the junctions' timings want tuning to it first)
          {
            // (the turn read over BEND_W either side: the roads' lines meet at sharp corners, and read over a step or two a
            // corner of 30 degrees between two pieces was a tight bend, the traffic crawling through every junction)
            const aLat = BUS_A, kc = Math.round(Math.abs(c.s - sb) / step), w = Math.max(2, Math.round(BEND_W / step));
            let vb = Infinity;
            if (c.half > LONG_V) for (let k = Math.max(w, kc); k + w < nq; k++) {
              const h0 = Math.atan2(Q[2 * k] - Q[2 * (k - w)], Q[2 * k + 1] - Q[2 * (k - w) + 1]), h1 = Math.atan2(Q[2 * (k + w)] - Q[2 * k], Q[2 * (k + w) + 1] - Q[2 * k + 1]);
              let tk = h1 - h0;
              tk = Math.abs(tk > Math.PI ? tk - 2 * Math.PI : tk < -Math.PI ? tk + 2 * Math.PI : tk);
              if (tk < 0.08) continue;
              const vk = Math.max(2, Math.sqrt(aLat * w * step / tk)), dk = Math.max(0, (k - kc) * step - c.half);
              const vc = Math.sqrt(vk * vk + 2 * BEND_B * dk);
              if (vc < vb) vb = vc;
            }
            c.vBend = Math.min(vb, (c.vBend ?? Infinity) + 1.5 * dt);
          }
          // offset into the lane by the direction over two steps either side; the first point kept is the front bumper
          const k0 = Math.round((Math.abs(c.s - sb) + c.half) / step);
          pk0 = k0; laneAt = lane;
          for (let k = k0; k < nq && np < NPATH; k++) {
            const ka = Math.max(0, k - 2), kb = Math.min(nq - 1, k + 2);
            let hx = Q[2 * kb] - Q[2 * ka], hy = Q[2 * kb + 1] - Q[2 * ka + 1];
            const h = Math.sqrt(hx * hx + hy * hy) || 1; hx /= h; hy /= h; // (sqrt: hypot is slow)
            P[2 * np] = Q[2 * k] - hy * lane; P[2 * np + 1] = Q[2 * k + 1] + hx * lane; PZ[np] = pathZ[k]; np++;
          }
          if (np && Math.hypot(P[0] - c.x, P[1] - c.y) > c.half + step + 1) np = 0; // (it has left its line: off a swing out, say)
        }
        c.np = np;
        if (np) {
          let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
          for (let k = 0; k < np; k++) { const x = P[2 * k], y = P[2 * k + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          const g0 = Math.floor((x0 - 8) / CELL), g1 = Math.floor((x1 + 8) / CELL), h0 = Math.floor((y0 - 8) / CELL), h1 = Math.floor((y1 + 8) / CELL);
          for (let ga = g0; ga <= g1; ga++) for (let gb = h0; gb <= h1; gb++) {
            const k = bucket(ga, gb);
            for (let j = head[k]; j >= 0; j = chain[j]) {
              if (j === i) continue;
              const o = C[j];
              if (o.x < x0 - 8 || o.x > x1 + 8 || o.y < y0 - 8 || o.y > y1 + 8) continue;
              if (Math.abs(o.z - c.z) >= LEVEL && o.line !== c.line && !onWay(o.line)) continue; // over or under this road, on a deck (not on its own way, where heights can be out)
              const d = hitAt(P, np, o, o.half + 0.6, o.hw + c.hw + 0.25, step);
              if (d < 0 || o === c.passBy) continue; // (not the car it squeezes past: below)
              // is it coming into my way as I come into its? Then whoever is in the junction first, or
              // nearer the place where the two ways meet, goes first, and the other waits
              const d2 = o.np ? hitAt(o.ps, o.np, c, c.half + 0.6, c.hw + o.hw + 0.25, o.pst || STEP) : -1;
              // two coming at each other up a street too narrow for both (each in from a facade): the one already in
              // the narrow stretch goes on, and the other waits short of it, in its lane; never into the other
              const headOn = d2 >= 0 && o.line === c.line && o.dir !== c.dir && (c.narrowF > 0.2 || o.narrowF > 0.2);
              if (headOn) {
                const cIn = c.narrow > 0 && c.narrowIn < 1, oIn = o.narrow > 0 && o.narrowIn < 1;
                // which goes first, as on a single-track road (#283): the one in the stretch; of two both in it or both
                // short of it, the one nearer the far end, its passing place (c.narrow: how far until its back is out of
                // it), and of two as near, the one first in the traffic; but never a wait on one that stands outside the
                // stretch held by something else (a queue at its own line, a light): it waits in turn once this one is in
                const oHeld = !oIn && o.v < 0.3 && o.front !== c && o.why !== 'narrow';
                // (read the same way by both: with one of them clear of the stretch, narrow 0, read by one as nearer its end and by
                // the other as not compared, each took itself as the one to go, and the two stood nose to nose, #317)
                const kc = c.narrow > 0 ? c.narrow : 0, ko = o.narrow > 0 ? o.narrow : 0;
                const cFirst = cIn !== oIn ? cIn : Math.abs(kc - ko) > 0.5 ? kc < ko : Math.abs(d2 - d) > 0.5 ? d2 > d : i < j;
                let g = d + 0.6, w = 'car';
                if (!cIn && c.narrowIn < Infinity && !cFirst && !oHeld) { const g2 = Math.max(0, c.narrowIn - 1.5); if (g2 < g) { g = g2; w = 'narrow'; } }
                // (already nose to nose with it, both stopped, the other to go first: it is this one that gives way, and backs out
                // after a while (below), as on a single-track road; both braked for each other as for a car ahead and stood there
                // for good, 208 s in view in Shinjuku's piece 2601, #317)
                if (!cFirst && w === 'car' && d < 3 && c.v < 0.3 && o.v < 0.3) w = 'narrow';
                if (g < gap) { gap = g; byCar = true; front = o; why = w; }
                continue;
              }
              if (d2 >= 0) {
                const first = c.mv && o.mv && c.mv.j === o.mv.j ? c.mvT < o.mvT || (c.mvT === o.mvT && i < j) : c.mv && !o.mv && o.toLine > 0 ? true : !c.mv && o.mv && c.toLine > 0 ? false : d < d2 - 0.5 || (Math.abs(d - d2) <= 0.5 && i < j);
                if (first) continue;
              }
              const g = d + 0.6;
              if (g < gap) { gap = g; byCar = true; front = o; why = 'car'; }
            }
            for (let j = bhead[k]; j >= 0; j = bchain[j]) { // people in its way
              if (Math.abs(bz[j] - c.z) >= LEVEL || bx[j] < x0 - 3 || bx[j] > x1 + 3 || by[j] < y0 - 3 || by[j] > y1 + 3) continue;
              const r = c.hw + br[j] + 0.15, r2 = r * r, px = bx[j], py = by[j];
              for (let q2 = 0; q2 < np; q2++) {
                const ex = P[2 * q2] - px, ey = P[2 * q2 + 1] - py;
                if (ex * ex + ey * ey >= r2) continue;
                const g = Math.max(c.pw > 5 ? 2.9 : 0, q2 * step - br[j]); // (after a while waiting on someone standing in the road, it edges on, and they step aside)
                if (g < gap) { gap = g; byCar = false; front = null; why = 'person'; walker = bi[j]; }
                break;
              }
            }
          }
        }
        // a ride or your car on the move, along its way as a car of the traffic is (not along a straight line from
        // the bonnet, which misses one round the corner it is turning), and given way to by the same rule as the
        // traffic's (first): the one that goes on is the one that would. A ride stopped on its way counts as on
        // the move (live); one parked, at the kerb, is left to the blockers below (passed side by side, swung out
        // round, or braked for)
        let sawX = null, leadX = null, xQ = false, youBy = null; // (youBy: which of yours it brakes for, and how, for the checks)
        c.xWaitT = c.why === 'you' && c.v < 0.3 && c.youBy && / on its way$/.test(c.youBy) ? (c.xWaitT || 0) + dt : 0;
        c.bonnetT = c.why === 'you' && c.v < 0.3 && c.youBy && / across its bonnet$/.test(c.youBy) ? (c.bonnetT || 0) + dt : c.v >= 0.3 ? 0 : c.bonnetT || 0; // (kept while it stands, once it no longer waits on it)
        // (and the helicopter's footprint at its bonnet, whatever its way ahead reaches: following close behind a car it was set
        // down onto, that car driving out from under it, its way ended at that car's tail and it followed it in under the rotor)
        for (const o of api.extra) {
          if (o.id !== 'heli' || (o.free && o.free.has(c)) || Math.abs(o.z - c.z) >= LEVEL || Math.abs(o.x - c.x) > 30 || Math.abs(o.y - c.y) > 30) continue;
          const bx = c.x + fx * (c.half + 0.5), by = c.y + fy * (c.half + 0.5);
          if (into(o, bx, by, 0.3) || into(o, bx - fy * c.hw, by + fx * c.hw, 0.3) || into(o, bx + fy * c.hw, by - fx * c.hw, 0.3)) { if (0 < gap) { gap = 0; byCar = true; front = null; why = 'you'; youBy = 'heli at its bonnet'; } }
        }
        if (np) for (const o of api.extra) {
          if ((o.ahead && c.inAhead) || o.soft || (o.v < 0.3 && !o.live) || (o.z != null && Math.abs(o.z - c.z) >= LEVEL) || Math.abs(o.x - c.x) > 60 || Math.abs(o.y - c.y) > 60) continue;
          // (a helicopter set down over a car already there: that car drives on out from under it rather than stand in it; the
          // ones behind wait for it, game.js heliBlock, heliFree)
          if (o.id === 'heli' && o.free && o.free.has(c)) continue;
          // (a ride stopped at a junction's line, waiting its turn, is measured by its own size by a car crossing that
          // junction, not with the margins kept from one on the move: with them the car stood in the box for the
          // ride's nose while the ride waited at its line for that car's movement, each for the other, #243)
          // (and one stopped a while in a car's way, wherever either stands: measured by its own size too, after 4 s, so that a
          // ride stood beside the car's way, within the margins only, holds it no longer: Tokyo's car 94 stood 71 s in junction
          // 1465 for a ride on its way, and at Fushimi Inari a car stood for the taxi coming for you, which waited on it in turn, #283)
          const waiting = !o.mv && o.v < 0.3 && ((c.mv && o.toLine != null && o.toLine >= 0 && o.toLine < 6) || c.xWaitT > 4);
          const d = hitAt(P, np, o, o.half + (waiting ? 0.1 : 0.6), o.hw + c.hw + (waiting ? 0.05 : 0.25), step);
          if (d < 0) continue;
          (sawX || (sawX = new Set())).add(o.id);
          const d2 = o.np ? hitAt(o.ps, o.np, c, c.half + 0.6, c.hw + o.hw + 0.25, o.pst || STEP) : -1;
          if (d2 >= 0 && first(c, o, d, d2, i, -1)) continue;
          // (and not one whose driver is giving way to this car already, as its own reading of the rule had it last
          // frame: the two readings measure with different margins and could each give way to the other, a car
          // standing in Shinjuku's junction 1105 for the taxi coming for you while the taxi stood for it, 15 s, #254)
          if (o.xBlock && (o.xBlock === c || o.xBlock.of === c)) continue;
          // (nor one stopped behind this very car in its lane, its gap ahead set by it: the ride stood queued 2.8 m
          // behind a car in Shibuya's junction 940 while that car stood 44 s for the ride on its way, each waiting on
          // the other, #180)
          if (o.v < 0.3 && o.block && (o.block === c || o.block.of === c)) continue;
          const g = d + 0.6;
          if (g < gap) { gap = g; byCar = true; front = null; why = 'you'; leadX = o; xQ = !!o.q && o.qBy !== c; youBy = o.id + ' on its way'; } // (a ride queueing for a junction: this car queues behind it)
        }
        // in a junction and stopped behind a car waiting at another of its lines (an awkward corner,
        // a short arm whose line can't be set back far enough): that one backs off a little, and
        // after 8 s the car goes on as if it weren't there, to squeeze past it as cars caught up do
        const atLine2 = front && c.mv && !front.mv && front.lineArm && front.lineArm.j === c.mv.j && front.v < 0.3 && front.toLine - front.half < 4;
        if (atLine2 && c.v < 0.3) {
          // (asked through backOff, which stops asking one that has backed off 6 s without driving on since: set here
          // directly, each time it ran out, it held a car that could not back off, the car asking right behind it, held
          // "backing off" for good, out of reach of the pair rule's squeeze; two stood 69 s in Shibuya's junction 1995, #472)
          if (!(front.backoff > 0)) backOff(front, 1.5);
          c.waitOn = c.waitOnCar === front ? (c.waitOn || 0) + dt : 0; c.waitOnCar = front;
          if (c.waitOn > 8) { c.passBy = front; c.waitOn = 0; }
        } else if (!front || front !== c.waitOnCar) { c.waitOn = 0; c.waitOnCar = null; }
        // two in a junction, each stopped for the other as the car ahead (nose to nose where their ways
        // cross, each path seeing the other): after 4 s the one that went in first goes on as if the
        // other weren't there, and the other gives way to it when they touch (below; #144)
        // (or held by each other, a step each took back into the other: neither has the other on its way ahead, and the
        // two stood 63 s in Sydney's junction 461, out of neighbouring lanes of one arm, #243)
        // (and any two each with the other as the one in front, whether braked for or held by it, in a junction or not,
        // one of them in it or neither, by the one rule goesFirst: held by a step it took into the other, one stood with the
        // other braked for on its way, and only two in a junction both held were parted, #312; not two coming at each other
        // up a narrow street, which the single-track rule above parts, nor one waiting for the other there)
        const fr = front && front.front === c ? front : c.why === 'held' && c.front && c.front.front === c && c.front.line >= 0 ? c.front : null;
        const narrowPair = fr && (why === 'narrow' || fr.why === 'narrow' || (!c.mv && !fr.mv && fr.line === c.line && fr.dir !== c.dir));
        if (fr && !narrowPair && c.v < 0.3 && fr.v < 0.3) {
          c.faceAll = c.faceCar === fr ? (c.faceAll || 0) + dt : 0;
          c.faceT = c.faceCar === fr ? (c.faceT || 0) + dt : 0; c.faceCar = fr; c.faceGap = 0;
          if (c.faceT > 4 && goesFirst(c, fr)) { c.passBy = fr; c.passFace = true; c.faceT = 0; }
        }
        // (the face-off's clock runs on through a break of up to 3 s: the other backing off a metre and this one moving up
        // into the room is the same knot, not a new one. Each such step began the 20 s again, so a bus and a car in the
        // mouth of Sydney's junction 460 stood 40 s while the car used up its backing off, then the 20 s: 63 s, #432)
        else if (c.faceCar && c.faceCar.line >= 0 && (c.faceGap = (c.faceGap || 0) + dt) < 3) { c.faceAll = (c.faceAll || 0) + dt; c.faceT = 0; }
        else { c.faceT = c.faceAll = c.faceGap = 0; c.faceCar = null; }
        if (c.passBy && ((!c.mv && !c.passFace) || Math.hypot(c.passBy.x - c.x, c.passBy.y - c.y) > c.half + c.passBy.half + 4 || c.passBy.line < 0)) { c.passBy = null; c.passFace = false; }
        // your car and a ride: one parked beside the lane is passed side by side with a hand's width
        // between, or round it: a short swing out towards the kerb, or out over the centre line round
        // one left in the lane, as traffic goes round a stopped car; otherwise braked for like a car ahead
        let youQ = xQ; // (the one braked for is a ride queueing for a junction: this car queues behind it)
        for (const b of blockers) {
          if (!b.half || (b.z != null && Math.abs(b.z - c.z) >= LEVEL)) continue;
          if (!b.parked && b.id && sawX && sawX.has(b.id)) continue; // (on the move and on its way: given way to, or not, above)
          if (np && !b.parked && b.id && api.extra.some(o => o.id === b.id && o.np)) { // (on the move with a way of its own, not on this car's: only one straight across its bonnet, close, holds it)
            const xo = api.extra.find(o => o.id === b.id);
            if (xo && xo.block && (xo.block === c || xo.block.of === c)) continue; // (not one held up by this car itself: the two would wait on each other)
            const dx = b.x - c.x, dy = b.y - c.y, a = dx * fx + dy * fy, w = -dx * fy + dy * fx;
            // (one stopped there a while, 6 s, holds it only if it is right up against it: the ride stood 18 s across the
            // bonnet of a car it waited on in turn, then swung out round it, Sydney's queue at a red light, #317)
            const reachB = c.bonnetT > 6 && (b.v || xo && xo.v || 0) < 0.3 ? 0.6 : 4;
            if (a > 0 && a < c.half + b.half + reachB && Math.abs(w) < c.hw + (b.hw || 0.9) + 0.2 && a - b.half - c.half < gap) { gap = Math.max(0, a - b.half - c.half); byCar = true; front = null; why = 'you'; youBy = b.id + ' across its bonnet'; }
            continue;
          }
          const dx = b.x - c.x, dy = b.y - c.y, a = dx * fx + dy * fy, w = -dx * fy + dy * fx;
          // (never round a ride queueing at a red light, b.q: it waits its turn there, and so does this car)
          if (b.parked && !b.q) {
            const need = c.hw + (b.hw || 0.9) + 0.3;
            // (w0: where it is across from the car's own lane, without the swing out the car has already
            // taken, so that the swing is the whole way out round it and not half of it: with w the swing
            // would stop where it is as far again from the one needed)
            const w0 = w + c.off;
            if (a < -b.half - c.half || a > 45 || Math.abs(w0) >= need) continue;
            // (not round one stopped at a junction's line, a taxi waiting for its turn: it queues behind)
            // (your car parked by the kerb near a junction is not a car waiting at its line: it is gone round)
            const atJ = b.id !== 'car' && arm && left - arm.back < a + b.half + 15;
            const toKerb = w0 + side * need, toCentre = w0 - side * need; // (the kerb is on the keep side)
            // (over the centre line only with nothing coming the other way up to 40 m ahead: else it waits behind,
            // as a driver does; one coming down a narrow street, in from a facade, would meet it head on)
            const sw = Math.abs(toKerb) < 1.6 && Math.abs(toKerb) < Math.abs(toCentre) ? toKerb : Math.abs(toCentre) < 2.6 && !oncoming(c, fx, fy, a + b.half + 30) ? toCentre : null;
            if (sw != null && !atJ) { if (Math.abs(sw) > Math.abs(swerve)) swerve = sw; continue; }
          }
          if (a > 0 && Math.abs(w) < Math.max(1.6, c.hw + (b.hw || 0.9) + 0.2) && a - b.half - c.half < gap) { gap = a - b.half - c.half; byCar = true; front = null; why = 'you'; youQ = !!b.q && b.qBy !== c; youBy = (b.id || 'you on foot') + (b.parked ? ' parked' : '') + ' ahead'; } // (a ride pulling in still reaches into the lane)
        }
        // your car coming at it: where the two will be closest, if that is soon and close enough to touch,
        // it gets out of the way (DODGE_T above): sideways from where your car will pass it, and braking
        // unless you come up from behind
        if (you && Math.abs(you.z - c.z) < LEVEL) {
          const px = you.x - c.x, py = you.y - c.y;
          if (px * px + py * py < 3600) {
            const yx = Math.sin(you.h) * you.v, yy = Math.cos(you.h) * you.v, ux = yx - fx * c.v, uy = yy - fy * c.v, uu = ux * ux + uy * uy;
            const tc = uu > 4 ? -(px * ux + py * uy) / uu : -1;
            if (tc > 0 && tc < DODGE_T) {
              const mx = px + ux * tc, my = py + uy * tc, ma = mx * fx + my * fy, mw = -mx * fy + my * fx;
              if (Math.abs(mw) < c.hw + you.hw + 0.8 && Math.abs(ma) < c.half + you.half + 0.8) {
                const behindMe = px * fx + py * fy < -c.half && yx * fx + yy * fy > 0; // (you come up from behind it)
                if (!(c.dodgeT > 0)) {
                  c.dodgeW = mw; // (where you pass it: + its left; it picks a side once and keeps to it)
                  if (t - (c.honkAt ?? -HONK_GAP) >= HONK_GAP && px * px + py * py < 1600) { c.honkAt = t; api.honks.push({ x: c.x, y: c.y, z: c.z, d: Math.sqrt(px * px + py * py), bus: c.half > 4 }); }
                }
                c.dodgeT = DODGE_HOLD; c.dodgeBrake = !behindMe;
              }
            }
          }
        }
        if (c.dodgeT > 0) {
          c.dodgeT -= dt;
          // to the kerb (side: + is the left, keeping left), unless you pass it on that side: then out
          // over the centre line, if nothing is coming the other way
          const kerb = (c.dodgeW || 0) * side > 0.3 ? 0 : side;
          const out = kerb ? kerb * DODGE_OUT : oncoming(c, fx, fy, 30) ? 0 : -side * DODGE_OUT;
          if (Math.abs(out) > Math.abs(swerve)) swerve = out;
          if (c.dodgeT <= 0) c.dodgeBrake = false;
        }
        // a lamp post or a trunk in the way (at a corner taken wide): braked for like a car stopped there
        // (along its way ahead, P, round a corner as it will drive it: a line straight on from its heading
        // crossed the corner of a turn, and a car braked to a stop in the junction for the walk-signal post
        // on that corner, which its way never comes near, and the cars behind it ran into it; Roppongi,
        // tools/clip_check.js. With no way ahead, straight on as before)
        if (posts) posts.near(c.x + fx * reach / 2, c.y + fy * reach / 2, reach / 2 + 1, q => {
          if (Math.abs(q.z - c.z) >= LEVEL) return;
          const dx = q.x - c.x, dy = q.y - c.y, a = dx * fx + dy * fy, r = c.hw + q.r + 0.1;
          let g = Infinity;
          if (np) {
            if (a < c.half - r) return; // (beside or behind it)
            const r2 = r * r;
            for (let k = 0; k < np; k++) { const ex = P[2 * k] - q.x, ey = P[2 * k + 1] - q.y; if (ex * ex + ey * ey < r2) { g = k * step - q.r; break; } }
            if (g === Infinity && a + q.r >= c.half && a <= c.half + step && Math.abs(-dx * fy + dy * fx) < r) g = a - q.r - c.half; // (between its bumper and the first point)
          } else if (a + q.r >= c.half && a <= reach && Math.abs(-dx * fy + dy * fx) < r) g = a - q.r - c.half;
          if (g < gap && !(c.postPass > 0)) { gap = g; byCar = true; front = null; why = 'post'; }
        });
        // (stopped for one more than 10 s, a post its way runs into in a junction, say: it edges past it, #144)
        c.postT = why === 'post' && c.v < 0.3 ? (c.postT || 0) + dt : 0;
        if (c.postT > 10 && !inView(c)) { c.postT = 0; respawn(c, cx, cy, radius * 0.6); continue; } // (out of view: it leaves the traffic rather than drive through it)
        if (c.postT > 10) { c.postT = 0; c.postPass = c.mv ? 30 : 6; } else if (c.postPass > 0) c.postPass -= dt; // (in a junction, for the rest of its turn: a bus held there by a walker meanwhile ran out its 6 s and stood at the post again, 200 s in Kyoto's 309)
        // (a facade beside its lane: in from it, below, until its back has passed the place: c.narrow is the
        // metres to go, not a time, so a car that stops beside a facade stays in from it however long it waits)
        // (and only once it is close to the place: one waiting short of a narrow stretch for a car coming the
        // other way through it keeps to its lane, out of that car's way)
        if (c.narrow > 0) {
          c.narrow -= c.v * dt; c.narrowIn = Math.max(0, (c.narrowIn ?? 0) - c.v * dt);
          if (c.narrow <= 0) { c.wallT = 0; c.narrowIn = Infinity; }
          if (!swerve && c.narrowIn < 6 + c.v) swerve = -LANE * side * (c.narrowF || 0);
        } else { c.narrowF = 0; c.narrowIn = Infinity; }
        // (and one slow or stopped in its lane with its body in a facade, a queue along a street that has room only nearer
        // its middle, which the look ahead from the bumper missed: half way in, as one on the move would be, #202;
        // Higashiyama's road 138 kept a queue in a wall)
        if (nav && c.v < 2 && !c.ln && !c.mv && !JN.centred(c.line) && (c.wallChk = (c.wallChk || 0) - dt) <= 0) {
          c.wallChk = 0.5;
          c.inWallNow = !nav.room(c.x, c.y, c.z, c.hw * 0.8, 1.4, false) && Math.abs(c.off) < LANE * 0.4;
        } else if (c.v >= 2 || c.ln || c.mv) c.inWallNow = false;
        if (!swerve && c.inWallNow) swerve = -LANE * side * 0.5;
        // (and such a street is single file there: it counts as in a narrow stretch, so that one coming the other
        // way waits short of it, in its lane, as the narrow rule makes moving cars do, rather than brush past, #264)
        if (c.inWallNow) { c.narrowF = Math.max(c.narrowF || 0, 0.5); c.narrow = Math.max(c.narrow > 0 ? c.narrow : 0, 2 * c.half + 1.5); c.narrowIn = 0; }
        c.off += (swerve - c.off) * Math.min(1, dt * (c.dodgeT > 0 ? 4 : c.narrow > 0 && Math.abs(swerve) > Math.abs(c.off) ? 3.5 : 1.6)); // (in from a facade the sooner; out of your way at once)
        // the junction ahead: in time to stop at its line, the light, a stop sign, the way across
        // and the room beyond it; then in, or wait at the line (the longest waiting goes first)
        let atLine = false, lineGap = Infinity;
        // the junction it comes up to: at the end of this piece, or of the next if that is a short one
        // (its line can be close to where the car comes onto it), with its way across (c.ex, or c.exA)
        let jArm = arm, jEx = c.ex, toLine = arm ? left - arm.back : 0;
        if (!arm && c.nx) { // (on through short pieces that simply follow one another)
          let a2 = null, d2 = left, li = nl, ld = nd;
          for (let k = 0; k < 4 && li >= 0 && d2 < 60; k++) {
            a2 = JN.armAt(li, ld > 0 ? 1 : 0);
            if (a2) { d2 += net.L[li].len - a2.back; break; }
            d2 += net.L[li].len;
            const n2 = net.L[li].len < 30 ? net.only(li, ld > 0 ? 1 : 0) : null;
            if (!n2) break;
            li = n2[0]; ld = n2[1] === 0 ? 1 : -1;
          }
          if (a2 && d2 < c.half + 6 + c.v * c.v / 6) {
            if (!c.exA || c.exA.a !== a2) c.exA = { a: a2, e: JN.choose(a2, c.hw, c.half, tripOf(c)) };
            if (c.exA.e) { jArm = a2; jEx = c.exA.e; toLine = d2; }
          }
        }
        if (jArm && jEx) {
          // the lane its movement needs, at the line: another way across from the lane it is in, if
          // it could not get across in time (also while it still holds its way through the junction
          // behind, as one pushed over a line there and out onto a short piece before this one: it
          // can't change lanes while it holds that, and waiting for the lane there held that
          // junction, and the queue behind it at a green, for good)
          if ((!c.mv || c.mv.j !== jArm.j) && !jEx.lanes.includes(c.ln || 0) && toLine - c.half < 20) {
            const alt0 = JN.exits(jArm).filter(e => e.lanes.includes(c.ln || 0)), alt1 = alt0.filter(e => !JN.closedNow(e)), alt = alt1.length ? alt1 : alt0; // (not one closed at this hour)
            if (alt.length) {
              const e2 = alt[Math.floor(rnd() * alt.length)];
              if (jArm === arm) { c.ex = jEx = e2; c.plan = e2.steps.slice(1); c.nx = e2.steps[0]; } else { c.exA.e = jEx = e2; }
            } else if (c.mv || c.mv0) c.anyLane = jArm; // (no way on from its lane, and it can't move across while it holds the junction behind: it goes from the lane it is in, #144)
          }
          const lt = JN.light(jArm, jEx), stop = c.v * c.v / 8 < toLine - c.half - 0.3; // (can stop by the line, at 4 m/s²)
          if (c.mv && c.mv.a === jArm && lt !== 'g' && lt != null && stop) { JN.release(c); c.rel = 'lights'; } // the lights changed before it got there
          if (!c.mv || c.mv.a !== jArm) {
            JN.approach(c, jArm, JN.mv(c, jEx), Math.max(0, toLine - c.half) / Math.max(c.v, 2));
            if (toLine < c.half + 4 + c.v * c.v / 6) {
              let go = lt == null || lt === 'g' || (lt === 'y' && !stop);
              if (toLine - c.half < -1) { c.overWhy = `${c.rel || ''} ${c.why} v ${c.v.toFixed(1)} toLine ${(toLine - c.half).toFixed(1)} lane ${c.ln} lo ${c.lo.toFixed(1)} lt ${lt}`; JN.enter(c, jArm, jEx, t, true); c.mv.via = [c.line]; go = false; } // already over the line: in the junction, so through it
              if (go && jArm.sign === 'stop' && !c.halt) go = false;
              let noRoom = false;
              // (an exit too short to wait on before the next junction's line is crossed with that junction, below,
              // and the room asked for is beyond it: asked here, a piece shorter than a car up to that line never had
              // room, and no car ever took it; Shibuya's 811 onto a 39 m piece whose far line is 28 m back, a car stood
              // 121 s at it, #243. Not with a car on the short piece going that way: it waits behind that one)
              // (not from the side road of a junction run from the scramble beside it, junctions.js follow: its green is that
              // scramble's walk, so the two never show green together. It crosses this one alone and waits the scramble's
              // turn on the short piece between, as a driver does, issue 175)
              const twin = () => { const q = JN.after(jEx, 2 * c.half + 3); return q && jArm.j.lead === q.j && jArm.phase !== jArm.j.leadPh ? null : q; };
              const pair = go ? twin() : null;
              const through = pair && !(onLine.get(jEx.m.line) || []).some(j => C[j] !== c && C[j].dir === (jEx.m.end === 0 ? 1 : -1));
              if (go && !through && !room(c, jEx)) { go = false; noRoom = true; }
              let narrowOut = false;
              if (go && narrowComing(c, jEx)) { go = false; noRoom = narrowOut = true; } // (and after 5 s, another way out, as for room, below)
              // keep the box clear: not in while its way across is blocked by a ride or your car standing in the
              // junction (it would stop half way across, the junction held, and the two nose to nose, each waiting
              // on the other, until one drove through the other: SUMO's keep-clear, A/B Street's "don't block the
              // box"). After 12 s it goes in all the same, and is given way to as before, so that a car left there
              // for good never shuts the movement out. (One of the traffic waiting at another line with its nose in
              // the way is asked to back off once this car is in, below: kept out for it, the traffic jammed more,
              // 6.1% of the time in Shibuya against 4.8%.) Looked at four times a second while it waits, not every frame
              if (go && np && (c.boxT || 0) < 12 && !((c.wbT = (c.wbT || 0) - dt) > 0)) { c.wbT = 0.25; c.wbCar = wayBlocked(c, jArm, toLine, P, np, step); }
              const wb = go && np && (c.boxT || 0) < 12 ? c.wbCar : null;
              if (wb) { go = false; c.boxT = (c.boxT || 0) + dt; } else if (!go || toLine - c.half > 4) c.boxT = 0;
              // (in a lane its movement can't go from, or still moving across: it waits; but not one still
              // holding its way through the junction behind, whose place in the road stays as it went in
              // by until it is clear of that one: forced over its line there onto a piece too short to wait
              // on, it would wait for good, holding that junction and its queues through every green, #144)
              const inLane = (c.anyLane === jArm && (c.mv || c.mv0)) || (jEx.lanes.includes(c.ln || 0) && (Math.abs(c.lo - side * JN.shiftOf(l, c.ln)) < 0.3 || (c.mv && c.mv.j !== jArm.j)));
              if (!inLane) go = false;
              // a junction just after, too close to wait between: crossed with this one, its way chosen now
              const a2 = go ? twin() : null;
              let light2 = false; // (held by that one's light: waiting for it, as at a red here, not for room)
              if (a2) {
                if (!c.ex2 || c.ex2.a !== a2) c.ex2 = { a: a2, e: JN.choose(a2, c.hw, c.half, tripOf(c)) };
                const lt2 = JN.light(a2, c.ex2.e);
                if (!c.ex2.e || !(lt2 == null || lt2 === 'g') || a2.sign === 'stop') go = false;
                else if (!room(c, c.ex2.e)) { go = false; noRoom = true; } // (no room beyond the second: another way out after 5 s, as for the first's, below; Shinjuku's 1103 arm 0 stood 198 s for room past 1105, #331)
                if (c.ex2.e && lt2 && lt2 !== 'g') light2 = true;
                // (held at this line by the next one's light: a call for its phase, as if at its line, and the time
                // counted lost on this green, junctions.js; a 6 s green at Shinjuku's 1105 went by on 1103's red, #264)
                // (at a scramble's, counted in that arm's queue instead: its turn is run for its queues, and passed over with
                // none. The cars down Dogenzaka wait for 109's fork at the line of the junction before it, 9 m short, and
                // unseen there they stood 150 s while their turn was passed over, issue 175)
                if (c.ex2.e && lt2 && lt2 !== 'g') { if (!a2.j.scramble) JN.want(a2); else if (toLine - c.half < 3) a2.qn1 = (a2.qn1 || 0) + 1; if (toLine - c.half < 3 && jArm.j.sig) jArm.lost1 = true; }
              }
              // (in it already: its way through this junction let in, or, crossing two close junctions together, this
              // one's let in with the one just after, mv0: then a light turning red behind it, or the room beyond
              // filling, doesn't stop it at the line it was let over, holding both junctions' boxes there, as a car
              // stood 87 s at Shibuya's 813 with the cars at the junction's other arms waiting on it, #178)
              const r = (c.mv && c.mv.a === jArm) || (c.mv0 && c.mv0.a === jArm && c.mv && c.mv.j !== jArm.j) ? true : go ? JN.request(c, jArm, jEx, t, a2, a2 && c.ex2.e) : false;
              if (r === true && go) { // the pieces it may still be on before each junction's arm
                if (a2) { c.mv0.via = [c.line]; c.mv.via = [c.line].concat(jEx.steps.map(st => st[0])); } else c.mv.via = [c.line];
              }
              if (r !== true) {
                const g = toLine - c.half + 2.4;
                lineGap = Math.min(lineGap, g);
                if (g < gap) { gap = g; byCar = false; atLine = true; front = null; why = r || (lt === 'r' || lt === 'y' || light2 ? 'light' : jArm.sign === 'stop' && !c.halt ? 'stop' : !inLane ? 'lane' : narrowOut ? 'narrow' : 'room'); }
                // no room on its way out for 5 s, at its line with its light green: another way out with room, if
                // there is one (the traffic wanders, so any way will do). A queue that waits for room behind a queue
                // that waits for room, round a block and back, is a ring that never moves: Shibuya's station streets
                // had a car stand 220 s at its line so. Taking another way out breaks the ring, as drivers do
                c.roomT = noRoom && toLine - c.half < 2.5 && c.v < 0.6 && !c.mv ? (c.roomT || 0) + dt : 0;
                if (c.roomT > 5) {
                  c.roomT = 0; c.ex2 = null; // (its way across the junction just after chosen again too)
                  // (as JN.choose weighs them: ahead before a turn, a main road before a lane; never a turn back, a road
                  // the data runs through a building, a lesser road than the one it meant to take, or a one-way street
                  // that leads nowhere)
                  const alt = JN.exits(jArm).filter(e => e !== jEx && e.lanes.includes(c.ln || 0) && !JN.closedNow(e) && Math.abs(e.turn) < 2.4 && e.m.rank >= jEx.m.rank
                    && !(net.avoid && net.avoid[e.m.line]) && !(net.L[e.m.line].ow && !net.next(e.m.line, 1 - e.m.end, true)) && room(c, e) && (JN.light(jArm, e) == null || JN.light(jArm, e) === 'g'));
                  if (alt.length) {
                    const w = alt.map(e => Math.max(0.15, (1 + 1.6 * Math.cos(e.turn)) * (0.6 + 0.2 * e.m.rank)));
                    let r = rnd() * w.reduce((a, b) => a + b, 0), e2 = alt[alt.length - 1];
                    for (let k = 0; k < alt.length; k++) if ((r -= w[k]) < 0) { e2 = alt[k]; break; }
                    if (jArm === arm) { c.ex = jEx = e2; c.plan = e2.steps.slice(1); c.nx = e2.steps[0]; } else if (c.exA) c.exA.e = jEx = e2;
                    c.reroutes = (c.reroutes || 0) + 1; outOfRing++;
                  }
                }
                if (toLine - c.half < 2.5 && c.v < 0.6) {
                  if (jArm.sign === 'stop') c.halt = true;
                  if (r) { JN.wait(c, jArm, jEx, t); c.wj = jArm.j; } // its turn comes: it waits for the way across, not for a light or room
                  // (and at the junction just after, crossed with this one, for its way across there too: else the cars turning
                  // there across its way, one after another, took every green from it; Shinjuku's 1103 arm 0, on 1105's turns, #331)
                  if (r && a2 && a2.j.sig && c.ex2 && c.ex2.e && a2.j !== jArm.j) { JN.wait(c, a2, c.ex2.e, t); c.wj2 = a2.j; }
                }
              }
            }
          }
          c.toLine = toLine; c.lineArm = jArm; c.lineEx = jEx;
        } else c.lineArm = null;
        // caught in a scramble's box when its walk comes on (held up on its way out, say): out at a
        // walking pace, the crowd parting round it and anyone in its way stopping it, as a taxi caught there does
        if (JN.scrambles && JN.scrambles.length) for (const sj of JN.scrambles) {
          if (sj.ph === 3 && Math.hypot(c.x - sj.x, c.y - sj.y) < sj.reach * 0.75 && 4.8 < gap) { gap = 4.8; byCar = false; front = null; why = 'walk'; }
        }
        // a crossing between junctions ahead, on this piece or the next (junctions.js): held at its line
        // by its lights, or at a zebra by someone on the stripes or stepping onto them (not for ever: a
        // walker who stands there, it edges on after a while, braking for them as for anyone in the road)
        if (JN.midsOn) for (let pass = 0; pass < 2; pass++) {
          const li = pass ? nl : c.line, di = pass ? nd : c.dir, base = pass ? left : 0, Ms = li >= 0 ? JN.midsOn(li) : null;
          if (!Ms) continue;
          for (const X of Ms) {
            const d = base + (pass ? (di > 0 ? X.mid : net.L[li].len - X.mid) : (di > 0 ? X.mid - c.s : c.s - X.mid));
            const a = X.arms.find(b => b.end === (di > 0 ? 1 : 0));
            if (!a || d < 0 || d > reach + c.half + 20) continue;
            const toStop = d - a.back - c.half; // (its front bumper to the line)
            if (toStop < -0.5) continue; // over it already: on across
            let hold = false;
            if (X.sig) {
              const lt = JN.light(a), can = c.v * c.v / 8 < toStop - 0.3;
              hold = lt === 'r' || (lt === 'y' && can);
              if (lt === 'r' && X.ph === 1 && toStop > 0 && toStop - c.v * dt <= 0 && !pass) { redRuns++; if (redLog.length < 20) redLog.push(`crossing ${X.id}: v ${c.v.toFixed(1)} to its line ${toStop.toFixed(2)} ${why} gap ${gap.toFixed(1)} t ${X.t.toFixed(1)}`); }
            } else if (crowd && !(c.zebraOff > 0) && c.v * c.v / 8 < toStop + 0.5) hold = onStripes(X);
            // a level crossing (junctions.js addRail), open: the rails kept clear. With whatever is ahead (a queue, a
            // red light beyond) leaving no room for the whole car past the far rail, it waits at the line, never on them
            // (the room the car ahead will make in a second or so counts, not its going on: one that stopped in a queue
            // just past left the car behind it on the rails, Queenstown); none from one in a queue, or coming up to a light that
            // is not green within 60 m: it is about to stop (Shinjuku's car 101 stood on the rails behind one)
            // (nor from one slowing to pull in at the kerb, at a bus stop or for a delivery: Shinjuku's car 190)
            // (and the room it makes counted as what it still goes if it brakes now, v²/10 up to 6 m, not as a second
            // and more of its going on: one that stopped short in a queue beyond left the car behind it on the rails while
            // the crossing shut, Sydney's car 39, #409)
            // (the room: the whole car past the far rail and RAIL_ROOM more, the 3 m and more a car stops behind the one
            // ahead. With 1.5 m, two cars in Tokyo stopped behind a queue 8 and 9.6 m past them with their tails half a
            // metre over the rails; and the car ahead's going on counts only above 6 m/s, not 3: at 3 it is in a queue)
            // (and none for a car creeping up in a queue itself, under 3 m/s: the one ahead pulling away makes its room in
            // a second, and then it goes; counted on, it crept onto the rails and stood there when the queue stopped again,
            // Tokyo's cars 5, 19 and 34, #432)
            if (!hold && X.rail && toStop > -0.3 && gap < 39.5 && gap + (front && c.v > 3 && !front.q && front.v > 6 && !front.wantPark && !front.parking && !(front.dwell > 0) && !front.deliver && !(front.lineArm && front.toLine < 60 && JN.light(front.lineArm, front.lineEx) !== 'g') ? Math.min(front.v * front.v / 10, 6) : 0) < toStop + a.back + X.rail.w / 2 + 2 * c.half + RAIL_ROOM) { hold = true; c.clearRails = (c.clearRails || 0) + dt; } // (gap under its 40 m: something is there)
            if (hold) {
              const g = toStop + 2.4;
              if (g < gap) { gap = g; byCar = false; atLine = true; front = null; why = X.rail ? 'rails' : X.sig ? 'light' : 'zebra'; }
            }
            break; // (the nearest one ahead rules)
          }
        }
        if (c.zebraOff > 0) c.zebraOff -= dt;
        // out of a junction: its movement given up once the whole car is clear of the box (on its exit
        // past the stop line there), or once it is on a piece that is none of its way there and across
        for (const key of ['mv0', 'mv']) {
          const mv = c[key];
          if (!mv) continue;
          const m = mv.e.m;
          if (c.line === m.line) { if ((m.end === 0 ? c.s : l.len - c.s) > m.back + c.half + 0.5) JN.release(c, key); }
          else if (c.line !== mv.a.line && !mv.j.inner.has(c.line) && !(mv.via && mv.via.includes(c.line))) JN.release(c, key);
        }
        // lanes, on a road with two each way: the one its way on needs (its movement at the junction
        // ahead, or the road it simply goes on into), or else the other when the car ahead in this one
        // is slow (an overtake); across once it is clear beside it there, never in a junction, and
        // close to a line only into the lane it must be in
        if (JN.lanesOf(l) > 1) {
          c.lcT = (c.lcT || 0) + dt;
          // (the lane ends, or moves across, on the road ahead before the next junction: JN.laneRun looks
          // past the pieces between, so that a car moves across in time where a short stretch comes first)
          const endAt = arm || !JN.laneRun ? Infinity : left + JN.laneRun(c.line, c.dir > 0 ? 1 : 0), ends = ln => ln && endAt < 90 + 2 * c.v;
          const wrong = ln => (jArm && jEx && toLine < 150 && !jEx.lanes.includes(ln)) || ends(ln) || (ln && c.noL1 > 0); // (noL1: a facade beside the second lane, below)
          if (c.noL1 > 0) c.noL1 -= dt;
          let to = c.ln || 0, must = false;
          if (wrong(to) && !wrong(1 - to)) { to = 1 - to; must = true; }
          else if (wrong(to) && jArm && jEx && arm === jArm && !jEx.lanes.includes(to)) { // (neither will do: another way on from the lane it is in)
            const alt0 = JN.exits(jArm).filter(e => e.lanes.includes(to)), alt1 = alt0.filter(e => !JN.closedNow(e)), alt = alt1.length ? alt1 : alt0; // (not one closed at this hour)
            if (alt.length) { const e2 = alt[Math.floor(rnd() * alt.length)]; c.ex = jEx = e2; c.plan = e2.steps.slice(1); c.nx = e2.steps[0]; }
          }
          else if (front && why === 'car' && front.v < Math.min(5, 0.6 * l.v) && gap < 30 && c.lcT > 4 && !wrong(1 - to)) to = 1 - to;
          if (to !== (c.ln || 0) && !c.mv && !c.mv0 && (must || !(jArm && toLine - c.half < 8))) {
            c.lnWait = must ? (c.lnWait || 0) + dt : 0;
            lanePos(c.line, c.s, c.dir, tmp, c.off + side * JN.shiftOf(l, to), c.pv, c.nx ? [nl, nd] : null);
            const ml = c.lnWait > 15 ? 0.3 : 0.8 + c.v * 0.9; // (waiting long at a line, it squeezes in)
            // (one at a time: not while a car close by on this road is moving across itself)
            let busy = false;
            for (const j of onLine.get(c.line) || []) { const o = C[j]; if (o !== c && o.dir === c.dir && Math.abs(o.s - c.s) < ml + o.half + c.half + 6 && Math.abs(o.lo - side * JN.shiftOf(l, o.ln)) > 0.15) { busy = true; break; } }
            if (!busy && overlaps(c, tmp.x, tmp.y, fx, fy, ml, 0.25) === 0 && peopleIn(c, tmp.x, tmp.y, fx, fy) === 0) { c.ln = to; c.lcT = 0; c.lnWait = 0; laneChanges++; }
          }
        } else c.ln = 0;
        // given its way across but not yet at its line, and stopped there behind a car that is not in
        // that junction (one waiting at another of its lines, where two roads come in side by side,
        // for this very movement to clear): it gives the movement up and waits its turn
        c.mvHold = c.mv && c.mv.a === jArm && toLine - c.half > 0.5 && c.v < 0.3 && byCar && front && !(front.mv && front.mv.j === c.mv.j) ? (c.mvHold || 0) + dt : 0;
        if (c.mvHold > 4) { JN.release(c); c.mvHold = 0; c.rel = 'hold'; }
        // a wall across its way: a road the data runs through a building (route.js flags it, net.avoid, a
        // second or two after the start, when cars can already be on it) or a lane into a facade. Its way
        // ahead is looked along every half second (on a flagged road every frame): braked for like a car
        // stopped there; out of sight a car on a flagged road, or stopped at a wall, leaves the traffic
        // (its slot comes back elsewhere), and in sight one stopped at a wall turns round as from a jam
        const flagged = !!(net.avoid && net.avoid[c.line]), far = !eye || Math.hypot(eye.position.x - c.x, -eye.position.z - c.y) > 140;
        if (flagged && far) { respawn(c, cx, cy, radius * 0.6); continue; }
        if (nav && np) {
          // (between looks, a wall found comes nearer as the car drives on; none found is none: Infinity, not
          // the 40 m the look reaches, which counted down would read as a wall just ahead of every car)
          if (c.wallGap == null) c.wallGap = Infinity;
          else if (c.wallGap < Infinity) c.wallGap -= c.v * dt;
          if ((c.wallT = (c.wallT || 0) - dt) <= 0 || flagged) {
            c.wallT = 0.5; c.wallGap = Infinity;
            // (each point at the height of the road there, not the car's: up a canal bridge's ramp, the deck
            // ahead stands higher than a car at its foot, and at the car's height read as a wall across the
            // way, where the car stopped; tools/game_check.js, Amsterdam)
            const PZ = c.pz, dz = c.z - PZ[0];
            let nF = 0, nEnd = 0, nIn = Infinity; // (how far in from its lane it needs to be on the 25 m ahead, for how far, and from where)
            for (let k = 0; k < np; k++) {
              const zk = PZ[k] + dz, deck = zk > nav.terrain(P[2 * k], P[2 * k + 1]) + 2;
              if (nav.room(P[2 * k], P[2 * k + 1], zk, c.hw * 0.8, 1.4, deck)) continue;
              // a facade beside its lane, but room nearer the middle of the street: it moves in only as far as it
              // needs to there (so that two coming the other way up a narrow street can still pass). How far in
              // is measured from its own lane, not from where it already is: from there (half way in, say) the
              // share found would be taken as the whole swing, and it would stay half way, brushing the facade
              const q = pk0 + k, qx = pathQ[2 * q], qy = pathQ[2 * q + 1];
              let f = -1;
              if (Math.abs(laneAt) > 0.05) {
                const ux = (P[2 * k] - qx) / laneAt, uy = (P[2 * k + 1] - qy) / laneAt, base = laneAt - c.off;
                for (const F of [0.25, 0.5, 0.75, 1]) {
                  const at = base - LANE * side * F;
                  if (nav.room(qx + ux * at, qy + uy * at, zk, c.hw * 0.8, 1.4, deck)) { f = F; break; }
                }
              }
              if (f >= 0) { if (k * step < 25) { nF = Math.max(nF, f); nEnd = Math.max(nEnd, k * step + 2 * c.half + 1.5); nIn = Math.min(nIn, k * step); } continue; }
              c.wallGap = k * step; break;
            }
            // (a facade still beside it from before, further in: it keeps to that one until it is past it)
            if (nF > 0.2 && !l.ow) narrowSeen[c.line] = 1;
            if (nF > 0) { if (!(c.narrow > 0) || nF >= c.narrowF) c.narrowF = nF; c.narrow = Math.max(c.narrow > 0 ? c.narrow : 0, nEnd); c.narrowIn = Math.min(c.narrow > 0 && c.narrowIn != null ? c.narrowIn : Infinity, nIn); c.narrowNow = true; } else c.narrowNow = false;
          }
          if (c.ln && (c.wallGap < 40 || c.narrowNow)) c.noL1 = 6; // (a facade by the second lane: back to the first)
          if (c.wallGap < gap) { gap = c.wallGap; byCar = false; front = null; why = 'wall'; }
          // (stood at it, or creeping up to it under 1 m/s with less than 3 m left: a bus nosing along a one-way
          // street that hugs a facade crept into the wall for seconds at 0.3 m/s before it gave up, #202)
          c.atWall = why === 'wall' && (c.v < 0.1 || (c.v < 1 && gap < 3)) ? (c.atWall || 0) + dt : 0;
          if (c.atWall > 1.5) {
            c.atWall = 0; c.wallT = 0;
            if (far) { respawn(c, cx, cy, radius * 0.6); continue; }
            c.stuck = STUCK + 1; // (turned round below, as from a jam; on a one-way street it waits to be out of sight)
          }
          // (stood at a wall inside a junction, where it can neither turn round nor wait without holding every movement
          // across it: after 20 s it leaves the traffic, in your sight or not. Fushimi Inari's junction 37 stood shut
          // six minutes behind one, #355)
          c.wallHold = why === 'wall' && c.v < 0.1 && c.mv ? (c.wallHold || 0) + dt : 0;
          if (c.wallHold > 20) { c.wallHold = 0; respawn(c, cx, cy, radius * 0.6); continue; }
        }
        // (and stood 90 s anywhere in a junction's box, for whatever it waits on: a knot across two junctions a few metres
        // apart, each holding the other, which nothing else undoes. Kamakura's junctions 90 and 91 stood nine minutes so,
        // a car in 90's box waiting to cross into 91 behind one held at 90's light, #355. It backs out if it can, else it
        // leaves the traffic, in sight or not)
        c.boxHold = c.mv && c.v < 0.1 ? (c.boxHold || 0) + dt : 0;
        if (c.boxHold > 90) { c.boxHold = 0; if (!reverse(c)) { respawn(c, cx, cy, radius * 0.6); continue; } }
        c.q = atLine || (why === 'person' && walker >= 0 && c.v < 0.5 && lineGap < gap + 4) || (byCar && c.v < 0.5 && (front != null ? !!front.q && !(front.line === c.line && front.dir !== c.dir) : why === 'you' && youQ)); // (not behind one coming the other way, queued at its own line: a wait on that is a narrow street's, turned round in the end, #283) // queueing at a junction (behind a car, or a ride, queueing there; or held by the crowd crossing at its line, not by you, who may stand there for good)
        // counted at its arm for the signals' max-pressure (junctions.js): queued, and whether the head of the queue waits for room beyond
        if (c.q && c.lineArm && c.lineArm.j.sig && c.toLine < 80) { const a = c.lineArm; a.qn1 = (a.qn1 || 0) + 1; if (why === 'room' && c.toLine - c.half < 3) a.full1 = true; if (why === 'cross' && c.toLine - c.half < 3) a.lost1 = true; }
        // (and one further back: behind the cars of that line's queue on the pieces before it, or at a junction without
        // signals waiting for room on the piece that leads to it. The back of the queue a scramble's green is run for:
        // seen only on the last piece of its arm, 25 m of the Scramble's east arm, a queue of eight had its green end
        // with three through, issue 175)
        else if (c.q) { const b = queuedFor(c); if (b) b.qn1 = (b.qn1 || 0) + 1; }
        // caught up in another car (two stopped for each other can't get out by waiting): the
        // one in front creeps on, as far as that frees it, and the other backs off (below)
        // (getting out of one never takes it into another: `caught` holds the ones it is caught up with)
        const caught = c.caught || (c.caught = new Set());
        caught.clear();
        const tangled = c.v < 0.5 ? overlaps(c, c.x, c.y, fx, fy, 0, 0, caught) : 0, cg = tangled > 0 ? caught : null;
        // still caught after 4 s (two that each wait for the other): out of sight it leaves
        // the traffic (its slot comes back elsewhere), in sight it drives on out of the other, as long
        // as that takes it into nothing else
        c.tangleT = tangled > 0 ? (c.tangleT || 0) + dt : 0;
        if (c.tangleT > 4 && Math.hypot(c.x - cx, c.y - cy) > 140) { JN.forget(c); c.line = -1; c.tangleT = 0; if (mesh) { m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, m4); } continue; }
        const free = c.tangleT > 4, behind = tangled > 0 && ahead && !free;
        // up to the limit, and braking in time for what is ahead (gently from far off, at most 3.5 m/s²)
        // (in the weather, cars.js setWeather: slower on a wet or snowy road and in fog, slower still through a bend, and braking for a gap from farther back)
        const want = tangled > 0 && !behind ? 1.5 : gap < 2.6 ? 0 : Math.min(l.v * PACE * WXT.pace, c.vBend * WXT.corner, (gap - 2.6) * 0.9 / WXT.headway, Math.sqrt(7 * WXT.grip * (gap - 2.6)) + 0.5);
        // and what it closes on, by the Intelligent Driver Model's interaction term (Treiber, Hennecke and
        // Helbing 2000): the gap it wants grows with its speed and with how fast it closes, so it starts to
        // brake early and gently for a queue or a red line seen from 40 m, rather than at the last moment at
        // 8 m/s² as the limit above alone did. Never faster than that limit: only earlier, softer braking
        let dv = Math.max(-8 * dt, Math.min(3 * dt, want - c.v));
        if (gap < 40 && !(tangled > 0 && !behind)) {
          const ld = front || leadX, vl = ld ? (ld.v || 0) * (Math.sin(ld.h) * fx + Math.cos(ld.h) * fy) : 0;
          dv = Math.min(dv, idm(c.v, gap, vl, 2.6, 0.8 * WXT.headway, 2.5, 3) * dt); // (a longer time gap in the wet)
        }
        if (c.dodgeBrake) dv = Math.min(dv, -6.5 * dt); // (an emergency stop for your car)
        // (its brake lights: braking at 1.2 m/s² or more, or held at a stand; kept on a third of a second, not flickering)
        c.brk = dv < -1.2 * dt || (c.v < 0.15 && want < 0.1) ? 0.35 : Math.max(0, (c.brk || 0) - dt);
        c.v = Math.max(0, c.v + Math.max(-8 * dt, dv)); // (never below a stop: braking for what is close ahead took a stopped car's speed below 0, and it ran away backwards, at up to 17 m/s into the walls, #202)
        let s = c.s + c.dir * c.v * dt, line = c.line, dir = c.dir;
        const away = !eye || Math.hypot(eye.position.x - c.x, -eye.position.z - c.y) > 90;
        c.still = c.v < 0.3 ? (c.still || 0) + dt : 0;
        // (and one that has gone nowhere for a minute, however it has edged, turned or stopped and
        // started where it stands, a minute and a half in a queue: a knot no rule here undoes, out of sight)
        if (c.ax === undefined || Math.abs(c.x - c.ax) + Math.abs(c.y - c.ay) > 4) { c.ax = c.x; c.ay = c.y; c.idle = 0; } else c.idle += dt;
        if ((c.still > 45 && !c.q || c.idle > (c.q ? 90 : 60)) && (!eye || Math.hypot(eye.position.x - c.x, -eye.position.z - c.y) > 150)) { c.still = c.idle = 0; respawn(c, cx, cy, radius * 0.6); continue; } // out of sight, a car stuck a long time (not queueing) comes back elsewhere
        // (waiting on one coming the other way where a street has room for one, which is itself held in the stretch: out of
        // view after 25 s it comes back elsewhere, as a knot does; in view it backs out or turns round after 10 s, so that
        // no such wait lasts half a minute, #283)
        c.narrowT = why === 'narrow' && c.v < 0.3 ? (c.narrowT || 0) + dt : 0;
        if (c.narrowT > 25 && !inView(c)) { c.narrowT = 0; respawn(c, cx, cy, radius * 0.6); continue; }
        c.narrowCarT = why === 'narrow' && byCar && c.v < 0.3 ? (c.narrowCarT || 0) + dt : 0;
        if (why !== 'narrow') { c.narrowTries = 0; c.narrowRevS = null; } // (nose to nose in the stretch with one to go first: it backs out)
        // (sooner where the car it waits on waits on it in turn: nose to nose, each the other's car in front, which no waiting
        // undoes; three tries, ten seconds apart, made Shibuya's car 136 stand 31 s at the mouth of piece 1988, #454)
        if (c.narrowCarT > (front && front.front === c ? 6 : 10) && !l.ow) { // (out of view it turns round where it stands, as one stuck does below; in view it backs out if it can)
          c.narrowCarT = 0;
          // (not again where backing out gains nothing: at the end of its piece already, under 2 m from the junction behind,
          // or less than a metre back since the last time it backed out for this. Each such try "backed out" a few centimetres
          // and cost ten seconds more nose to nose: Shibuya's car 136 stood 31 s at the mouth of piece 1988 for car 182, which
          // waited on it in turn, #454)
          const room = c.dir > 0 ? c.s : l.len - c.s, gained = c.narrowRevS == null || Math.abs(c.s - c.narrowRevS) >= 1;
          if (!away && room > 2 && gained && reverse(c)) { c.narrowRevS = c.s; reverseStep(c, i, dt, cx, cy); continue; }
          // (over 90 m off, on its second try, it comes back elsewhere, as a car stuck on a one-way street does there: in sight
          // that far off, it neither backed out nor, out of view, came back elsewhere, and stood 114 s nose to nose at the
          // mouth of Higashiyama's piece 126)
          if (away && (c.narrowTries || 0) >= 1) { c.narrowTries = 0; respawn(c, cx, cy, radius * 0.6); continue; }
          // (no junction near enough behind it to back out to: the one it faces backs out instead, if it can. Turned round
          // where it stood, nose to nose with it, it would only have swung into it, and was held so: a car in Higashiyama
          // stood 46 s at a narrow stretch for one queued behind it, #331)
          // (after a first try at turning round has come to nothing: the second time it asks)
          c.narrowTries = (c.narrowTries || 0) + 1;
          // (at once where it has no room behind: turned round at the very end of its piece, it met that end, stood again and
          // counted from nothing, round and round; Shibuya's car 101 stood 73 s at the start of piece 1709 so, while car 84,
          // facing it, could have backed out all along, #454)
          const o = (c.narrowTries > 1 || room <= 2) && front && front.line === c.line && front.dir !== c.dir && !front.rev && front.v < 0.3 ? front : null;
          if (o && reverse(o)) { c.narrowTries = 0; /* it backs out of the way */ }
          // (the third time, with neither able to back out and no room to turn round in: it comes back elsewhere, in view
          // too. Shibuya's car 84 stood 60 s nose to nose with car 93 on piece 1709, 4 m apart, neither with a way back:
          // 93 not asked again for a minute after it gave up backing out, 84 turned round every 6 s into 93 and held so)
          else if (c.narrowTries >= 3) { c.narrowTries = 0; respawn(c, cx, cy, radius * 0.6); continue; }
          else { dir = -dir; c.stuck = 0; } // (with no junction behind near enough to back out to, it turns round, in view too: Fushimi Inari's car 36 stood 180 s)
        }
        if (c.stuck > (tangled > 0 ? 2 : why === 'narrow' ? 10 : STUCK)) { // a jam that won't clear: turn round, or out of sight on a one-way street, come back elsewhere
          c.stuck = 0;
          if (!l.ow && !away && why !== 'you' && (why === 'narrow' || c.narrowF > 0.2) && reverse(c)) { reverseStep(c, i, dt, cx, cy); continue; } // (a street with no room to turn round in: backed out to the junction behind, as on a one-way street)
          if (!l.ow) dir = -dir;
          else if (away) { respawn(c, cx, cy, radius * 0.6); continue; }
          else if (why !== 'you' && reverse(c)) { reverseStep(c, i, dt, cx, cy); continue; } // (in sight on a one-way street: back out to the junction behind, #283; not one held by a ride, or you, which will move on: backing out, it went into a ride's own way back, Sydney)
        }
        if (s < 0 || s > l.len) {
          if (dir === c.dir && c.nx) { line = nl; dir = nd; s = nd > 0 ? 0 : net.L[line].len; }
          else if (l.ow && away) { respawn(c, cx, cy, radius * 0.6); continue; } // the end of a one-way street (the edge of the map)
          else if (l.ow) { s = Math.max(0, Math.min(l.len, s)); c.v = 0; } // in sight: it waits there (turned round it would meet the traffic head on in its one lane) and comes back elsewhere once out of sight
          else { dir = -dir; s = Math.max(0, Math.min(l.len, s)); }
        }
        // across its stop line on red, with the cross road's green (the checks count it: tools/traffic_check.js)
        if (c.lineArm && c.toLine > 0 && c.toLine - c.v * dt <= 0 && JN.light(c.lineArm, c.lineEx) === 'r' && c.lineArm.j.st === 'g' && !(c.mv && c.mv.a === c.lineArm)) {
          redRuns++;
          const j = c.lineArm.j;
          if (redLog.length < 20) redLog.push(`junction ${j.id}: arm ${c.lineArm.i} (phase ${c.lineArm.phase}) at phase ${j.ph} green ${j.t.toFixed(1)} s: v ${c.v.toFixed(1)} to its line ${c.toLine.toFixed(2)} ${why} gap ${gap.toFixed(1)}`);
        }
        const onto = line !== c.line, nx2 = c.plan && c.plan.length ? [c.plan[0][0], c.plan[0][1] === 0 ? 1 : -1] : null;
        // (across to its lane a little at a time, slowly while it is barely moving, nosing that way)
        // (in a junction it keeps the lane it went in by: its way across is that lane's)
        const back = line === c.line && dir !== c.dir, keepIt = c.mv && !back, lnNow = keepIt ? c.ln : !back && JN.lanesOf(net.L[line]) > 1 ? c.ln : 0,
          laneLo = side * JN.shiftOf(net.L[line], lnNow), toPark = c.parking && line === c.line && !back ? (c.parking.s - s) * dir : Infinity,
          // (pulling in: across to the kerb over its last 12 m, as far across as its distance from the place says, the
          // way wayIn found clear. Let across at the rate its speed allows, it was at the kerb 9 m short and swept into
          // the car parked there, Queenstown)
          loT = toPark < 12 ? laneLo + (c.parking.lo - laneLo) * Math.min(1, (12 - toPark) / 9.5) : laneLo;
        // (but not over the middle of a two-way road: out of a one-way street's lane nearest the middle,
        // the lane kept across the junction is the oncoming one there, so it moves across at once, and
        // can do so standing, where a car waiting at that road's line would otherwise hold it until it squeezed through)
        const across = !back && !net.L[line].ow && LANE + side * (c.off + c.lo) < c.hw + 0.2;
        // (in to the kerb and out from it, only as far across as it goes forward: a third of its way, never sideways on the spot)
        const rate = (c.parking || c.pullOut > 0 ? Math.min(1.3, 0.34 * c.v + 0.02) : Math.min(1.3, 0.4 + 0.15 * c.v)) * dt, lo1 = back ? 0 : keepIt && !across ? c.lo : c.lo + Math.max(-rate, Math.min(rate, loT - c.lo));
        const pvA = onto ? [c.line, c.dir] : dir === c.dir ? c.pv : null, nxA = onto ? nx2 : dir === c.dir && c.nx ? [nl, nd] : null;
        const sw = c.half > LONG_V && !back ? swingAt(line, s, dir, pvA, nxA) : 0; // (a bus at a tight corner: wide)
        lanePos(line, s, dir, tmp, c.off + lo1 + sw, pvA, nxA);
        let dh = Math.atan2(tmp.hx, tmp.hy) - c.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const yaw = !back && dt > 0 ? Math.atan2((lo1 - c.lo) / dt, Math.max(c.v, 1.5)) : 0; // (a lane change: nosing across, left of the way it goes for a shift to the left)
        const turn = line !== c.line || dir !== c.dir, h = c.h + (back ? dh : dh * Math.min(1, dt * 8)) - yaw * Math.min(1, dt * 8); // turning round: at once
        // never into another car: turning round puts the car in the other lane, and turning into
        // a road may meet a car coming into it from another, so those wait for the way to be
        // clear; any other step waits unless the car is already caught up with one
        let held = false, holder = null;
        const hx1 = Math.sin(h), hy1 = Math.cos(h), hx0 = Math.sin(c.h), hy0 = Math.cos(c.h);
        const moves = s !== c.s || h !== c.h || tmp.x !== c.x || tmp.y !== c.y; // (a swing out moves it sideways where it stands)
        if (turn) { const d1 = overlaps(c, tmp.x, tmp.y, hx1, hy1, tangled > 0 ? 0 : 0.5, tangled > 0 ? 0 : 0.2, null, cg); held = d1 > 0 && (!(d1 < tangled) || fresh > 0); holder = mostCar; }
        else if (moves) { // (close beside one, or caught up with one, a move that gets no closer will do; caught up, never into a third)
          const d1 = overlaps(c, tmp.x, tmp.y, hx1, hy1, 0.15, 0.05, null, cg), o = mostCar, f1 = fresh, d0 = d1 > 0 ? overlaps(c, c.x, c.y, hx0, hy0, 0.15, 0.05, null, cg) : 0;
          held = d1 > 0 && (tangled > 0 ? (d1 > d0 + 1e-4 && !free) || f1 > fresh + 1e-4 : d1 > d0 + 1e-3); holder = o;
        }
        // in a junction and held there by a car waiting at its line (a bus swinging wide, say): that one backs off a little
        if (held && holder && c.mv && !holder.mv && holder.v < 0.3 && holder.toLine != null && holder.toLine - holder.half < 4) backOff(holder, 1.5);
        // (a step taken back below, last frame, is held too, by the car it would have gone into: #144)
        const revBy = !held && c.revT > 0 && c.revBy && c.revBy.line >= 0 ? c.revBy : null;
        c.revT = 0; // (set again below if this frame's step is taken back too)
        c.inHeld = held || revBy ? (c.inHeld || 0) + dt : 0;
        // held a while by a car that is stopped too (an awkward corner, two nose to nose where a turn
        // cuts across the other lane): one of them gives way, backing off a metre or two, and the cars
        // behind it back off in turn to make it room (below). The one not in the junction gives way to
        // the one in it; of two in it, the one that went in later; of two on a street, one of the two
        const heldBy0 = held ? holder : revBy;
        if (heldBy0 && heldBy0.v < 0.3 && c.inHeld > 3 && !(c.giveT > 0)) {
          c.giveT = 5;
          // (of two each held by or waiting on the other, the one goesFirst doesn't pick backs off; else the one in the way)
          const mutual = heldBy0.front === c;
          let yl = mutual && !goesFirst(c, heldBy0) ? c : heldBy0;
          if (!canBack(yl) && canBack(yl === c ? heldBy0 : c)) yl = yl === c ? heldBy0 : c; // (not one at the very start of its piece, with nowhere to back off to: the other)
          backOff(yl, 1.5);
        }
        if (c.giveT > 0) c.giveT -= dt;
        // held a long time all the same (a knot no backing off undoes), or in a junction caught up behind
        // one for 10 s: out of view (behind the camera, or far off) it leaves the traffic (its slot comes
        // back elsewhere); in view it waits on, and only after a minute and a half squeezes past, through
        // the other car, as the last way out of a knot you stand and watch
        c.behindT = behind && !turn ? (c.behindT || 0) + dt : 0;
        const long = c.inHeld > (holder && holder.v >= 0.3 ? 25 : c.mv ? 10 : 15) || (c.mv && c.behindT > 10);
        if (long && !inView(c)) { c.inHeld = c.behindT = 0; respawn(c, cx, cy, radius * 0.6); continue; }
        // (the one of two nose to nose in a junction that goes on, held by the other 20 s, the queue behind
        // that one too close for it to back off: it squeezes past then, not after the minute and a half)
        // (or, of two held by each other that backing off hasn't parted in 30 s, the one in the junction first: two head-on
        // at the mouth of a piece stood 61 s in Sydney's junction 472, the one that could back off boxed in behind, #243)
        const stuckPair = heldBy0 && heldBy0.front === c && c.inHeld > 30 && goesFirst(c, heldBy0);
        // (the face-off's own clock, faceAll, counts the two standing face to face without a break; the time held does not:
        // held one frame and not the next as the step taken back flickers, it starts again each time, so the one that
        // goes, the other unable to back off any more, never squeezed past: a bus and a car stood 63 s nose to nose in
        // Sydney's junction 460, two in Shibuya's 1995 for 69 s, #484)
        // (and once begun it goes on, up to 5 s while the two are still close (passBy, cleared once they are apart): one
        // frame of it, the next held again by the same car, moved the bus 5 cm back each time, #484)
        if (c.passBy && c.passBy === heldBy0 && c.faceAll > 20) c.faceSq = 5;
        else if (c.faceSq > 0) c.faceSq = c.passBy ? c.faceSq - dt : 0;
        const squeeze = (long && (c.inHeld > 90 || stuckPair)) || c.faceSq > 0;
        if (squeeze && !c.squeezing) squeezes++;
        c.squeezing = squeeze;
        if (squeeze) held = false;
        if (!held && (turn || moves)) {
          const d1 = peopleIn(c, tmp.x, tmp.y, hx1, hy1), who = inWho;
          const p1 = inPosts;
          const thr = c.pw > 5 ? 0.12 : 0.02;
          held = d1 > thr && d1 > peopleIn(c, c.x, c.y, hx0, hy0) + 1e-3; // (waited on a while, it edges up to them, not into them: they step aside, below)
          if (held && who >= 0) walker = who; // (a walker against it: asked to turn back, below, if it waits on them)
          // (and never deeper into any one walker, though the sum of them is less; nor, for a bus, with its body where it is
          // drawn: the step below swings it after its front, up to 0.45 rad off the lane's heading, and that body, not the
          // lane's pose tested above, went into a walker crossing the north scramble in the ride check, #28)
          if (!held) {
            let j = walkerDeeper(c, c.x, c.y, hx0, hy0, tmp.x, tmp.y, hx1, hy1, thr);
            if (j < 0 && c.half > LONG_V && !back) {
              const nxs = [], pl = turn ? (line !== c.line && c.plan && c.plan.length ? c.plan : null) : c.plan, nx0 = turn ? (pl ? pl[0] : null) : c.nx;
              if (nx0 && (turn || c.dir === dir)) { nxs.push([nx0[0], nx0[1] === 0 ? 1 : -1]); if (pl) for (let k = turn ? 1 : 0; k < pl.length; k++) nxs.push([pl[k][0], pl[k][1] === 0 ? 1 : -1]); }
              const T = trailed(c, tmp.x, tmp.y, h, line, s, dir, c.off + lo1 + sw, pvA, nxs);
              j = walkerDeeper(c, c.x, c.y, hx0, hy0, T.x, T.y, Math.sin(T.h), Math.cos(T.h), thr);
            }
            if (j >= 0) { held = true; if (bi[j] >= 0) walker = bi[j]; }
          }
          // (held by a post alone, its body's corner swinging over the kerb at a junction's corner: after 10 s it has
          // leave to edge past, as for a post ahead, above; a bus stood 106 s so in Tokyo's 689, the junction's queues behind)
          c.postHeld = held && who < 0 && p1 >= d1 - 1e-3 ? (c.postHeld || 0) + dt : 0;
          // (out of view it leaves the traffic instead, as a knot does below: edged past, a bus's body went through a street
          // light at Shibuya's 1916 in the clip check)
          if (c.postHeld > 10 && !inView(c)) { c.postHeld = 0; respawn(c, cx, cy, radius * 0.6); continue; }
          if (c.postHeld > 10) { c.postHeld = 0; c.postPass = c.mv ? 30 : 6; held = false; }
        }
        if (behind && !turn && !squeeze) held = true;
        if (c.backoff > 0) { // backing off for a car that can't get past, a metre or two, if the way behind is clear
          c.v = 0; c.boSpent = (c.boSpent || 0) + dt;
          const sb = Math.max(0, Math.min(l.len, c.s - c.dir * 1.2 * dt));
          lanePos(c.line, sb, c.dir, tmp, c.off + c.lo, c.pv, c.nx ? [nl, nd] : null);
          const bd = overlaps(c, tmp.x - hx0 * 0.6, tmp.y - hy0 * 0.6, hx0, hy0, 0.3, 0.1), bk = mostCar;
          // (and its whole body where it will stand: the test above, shifted back, leaves its front 0.3 m out, and the lane's
          // bend into a junction's mouth moves the car sideways as it backs; so it went 0.18 m into a car backing out beside
          // its nose, Shibuya's car 94, #348)
          if (bd === 0 && overlaps(c, tmp.x, tmp.y, hx0, hy0, 0.1, 0.1) === 0 && peopleIn(c, tmp.x, tmp.y, hx0, hy0) === 0) { c.s = sb; c.x = tmp.x; c.y = tmp.y; onGround(c, tmp); c.backoff -= dt; }
          else if (bk && bk.v < 0.5 && (bk.x - c.x) * hx0 + (bk.y - c.y) * hy0 < 0 && Math.sin(bk.h) * hx0 + Math.cos(bk.h) * hy0 > 0.5 && backOff(bk, c.backoff)) c.backoff -= dt * 0.25; // (the car behind it, stopped and going its way, backs off first)
          else c.backoff -= dt;
          held = true;
        } else if (c.v > 2) c.boSpent = 0;
        if (held && tangled > 0) { // can't get out ahead: try another road next (if it isn't in a junction yet), and back up a little
          if (!c.mv) { c.nx = undefined; c.plan = c.ex = null; }
          const sb = Math.max(0, Math.min(l.len, c.s - c.dir * 1.5 * dt));
          lanePos(c.line, sb, c.dir, tmp, c.off + c.lo, c.pv, c.nx ? [nl, nd] : null);
          if (overlaps(c, tmp.x, tmp.y, hx0, hy0, 0, 0, null, caught) < tangled - 1e-4 && fresh === 0 && peopleIn(c, tmp.x, tmp.y, hx0, hy0) <= peopleIn(c, c.x, c.y, hx0, hy0)) { c.s = sb; c.x = tmp.x; c.y = tmp.y; onGround(c, tmp); }
        }
        // held part way across to another lane: back to the one it came from (it moves across later)
        c.lnHeld = held && !back && Math.abs(c.lo - loT) > 0.15 ? (c.lnHeld || 0) + dt : 0;
        if (c.lnHeld > 1.5 && JN.lanesOf(l) > 1 && !c.mv) { c.ln = c.ln ? 0 : 1; c.lnHeld = 0; c.lcT = 0; }
        if (held) c.v = 0;
        else {
          const was = [c.line, c.s, c.dir, c.x, c.y, c.z, c.h];
          const wasLane = [c.lo, c.ln];
          if (turn) { // onto the next piece: of its way across a junction, or a new one
            c.pv = line !== c.line ? [c.line, c.dir] : null;
            if (line !== c.line && c.plan && c.plan.length) c.nx = c.plan.shift();
            else { c.nx = undefined; c.plan = c.ex = null; }
            c.halt = false; c.toLine = undefined;
            if (c.wj) JN.unwait(c);
          }
          if (line === c.line && dir !== c.dir) { JN.forget(c); c.v = Math.min(c.v, 1.5); } // turned round (slowly: never at speed)
          c.line = line; c.s = s; c.dir = dir; c.lo = lo1; c.ln = lnNow;
          c.x = tmp.x; c.y = tmp.y; onGround(c, tmp); c.h = h;
          const rWas = c.half > LONG_V ? [c.rx, c.ry] : null;
          if (rWas) { // (the pieces after this one: the next and the rest of its plan, after the step onto the next piece above)
            const nxs = [];
            if (c.nx && c.dir === dir) { nxs.push([c.nx[0], c.nx[1] === 0 ? 1 : -1]); if (c.plan) for (const q of c.plan) nxs.push([q[0], q[1] === 0 ? 1 : -1]); }
            trail(c, back, line, s, dir, c.off + lo1 + sw, pvA, nxs);
            // (never, so drawn after its front, into a post its lane's own pose keeps clear of: at a corner's lamp post the
            // body swung wide, or its rear drawn in, went 0.1 m into it, Queenstown's clip check: back on the lane's pose)
            if (posts && (c.x !== tmp.x || c.y !== tmp.y)) {
              peopleIn(c, c.x, c.y, Math.sin(c.h), Math.cos(c.h)); const pT = inPosts;
              if (pT > 0) { peopleIn(c, tmp.x, tmp.y, hx1, hy1); if (pT > inPosts + 1e-3) { c.x = tmp.x; c.y = tmp.y; c.h = h; trail(c, true, line, s, dir, 0, pvA, nxs); } }
            }
          }
          // and a step along its road that took it deeper into another car is taken back (one parting
          // from a car it has long been caught with: deeper into any other), unless it is squeezing past
          // one it has waited on a long time; a step onto the next road was checked above, with the junction
          // Taken back, it is held by that car, as by a step held above: in a junction, by one waiting at
          // its line whose nose is in the way out (and which waits for this very movement to clear), that one
          // backs off; and it squeezes past in time, as one held is (#144: the step was taken back unseen,
          // the time held never counted, and two nose to nose, or a movement out of a junction and the car
          // waiting on it, stood for good)
          if (!turn && !squeeze) {
            const kn = free ? caught : null, d1 = overlaps(c, c.x, c.y, Math.sin(c.h), Math.cos(c.h), 0, 0, null, kn), f1 = free ? fresh : d1, o1 = mostCar;
            if (f1 > 0 && f1 > (overlaps(c, was[3], was[4], Math.sin(was[6]), Math.cos(was[6]), 0, 0, null, kn), free ? fresh : depth) + 1e-3) {
              [c.line, c.s, c.dir, c.x, c.y, c.z, c.h] = was;
              [c.lo, c.ln] = wasLane;
              if (rWas) [c.rx, c.ry] = rWas;
              c.v = 0;
              held = true; holder = o1; c.revT = dt; c.revBy = o1;
              if (o1 && c.mv && !o1.mv && o1.v < 0.3 && o1.toLine != null && o1.toLine - o1.half < 4) backOff(o1, 1.5);
            }
          }
        }
        c.stuck = c.v < 0.1 && (byCar || held || (why === 'person' && walker < 0)) && !c.q ? c.stuck + dt : 0; // (and held by you, or someone not of the crowd, who won't step aside: as from a jam, in the end it turns round)
        c.zebraT = why === 'zebra' && c.v < 0.3 ? (c.zebraT || 0) + dt : 0;
        if (c.zebraT > 15) { c.zebraT = 0; c.zebraOff = 6; }
        { const f = held ? holder : front; if (f && f.park && c.v < 0.3 && !c.park) f.park.blockT = (f.park.blockT || 0) + dt; } // (a parked car that holds it up: above)
        c.why = held ? 'held' : why; c.youBy = why === 'you' ? youBy : null; c.front = held ? holder : front; c.who = walker; c.heldBy = held ? (holder ? 'car' : c.backoff > 0 ? 'backing off' : behind ? 'caught up' : 'person') : '';
        c.pw = walker >= 0 && c.v < 0.6 ? (c.pw || 0) + dt : walker >= 0 ? c.pw : 0;
        if (c.pw > 3 && c.pw - dt <= 3 && crowd) crowd.P[walker].give = true;
        if (c.pw > 12) c.pw = 0;
        // its indicators: into the kerb and out from it, across to another lane, and from 35 m before a turn at a
        // junction until it is through (junctions.js exits: turn > 0 is to the right); 1 left, -1 right
        { const dl = loT - c.lo, tn = c.ex && (left < 35 || c.mv) && Math.abs(c.ex.turn) > 0.45 ? (c.ex.turn > 0 ? -1 : 1) : 0;
          c.sg = c.parking || c.pullOut > 0 || Math.abs(dl) > 0.3 ? (dl > 0 ? 1 : -1) : tn || (c.mv ? c.sg || 0 : 0);
          if (c.bus && (c.dwell > 0 || c.stopAhead)) { c.sg = c.dwell > 0 && c.dwell < 2.5 ? -side : side; c.stopAhead = false; } } // (a bus: into its stop, and out of it as it goes)
        q.setFromAxisAngle(up, Math.PI - c.h);
        // near you, the body on its springs: the nose down under braking and up pulling away, a lean out of a turn
        if (!half) {
          const ax = dt > 0 ? (c.v - (c.vWas ?? c.v)) / dt : 0, yr = dt > 0 ? Math.atan2(Math.sin(c.h - (c.hWas ?? c.h)), Math.cos(c.h - (c.hWas ?? c.h))) / dt : 0, e = Math.min(1, dt * 5);
          c.pit = (c.pit || 0) + (Math.max(-0.035, Math.min(0.05, -ax * 0.011)) - (c.pit || 0)) * e;
          c.rol = (c.rol || 0) + (Math.max(-0.055, Math.min(0.055, -yr * c.v * 0.011)) - (c.rol || 0)) * e;
          if (Math.abs(c.pit) > 0.002 || Math.abs(c.rol) > 0.002) q.multiply(qSpring.setFromEuler(eSpring.set(c.pit, 0, c.rol)));
        }
        c.vWas = c.v; c.hWas = c.h;
        m4.compose(W(c.x, c.y, c.z), q, one);
        place(i, c);
        // a horn with cause: your car stopped in its lane ahead of it for five seconds and more (once, then every 12 s)
        c.youT = c.youBy === 'car ahead' && c.v < 0.3 ? (c.youT || 0) + dt : 0;
        if (c.youT > 5 && t - (c.honkAt ?? -12) >= 12) { const d = Math.hypot(c.x - cx, c.y - cy); if (d < 45) { c.honkAt = t; api.honks.push({ x: c.x, y: c.y, z: c.z, d, bus: c.half > 4 }); } }
      }
      // and a walker it has come up against (a corner taken, edging up to one who stands in the road),
      // or who has stepped up against it where it stands: a step out of its way, along the footway and across it, if that is not into a wall
      // (and your car and a ride (api.extra, not where a ride turning round is going next, nor a train): put down where
      // someone already stood (your car parked at the start before the crowd's first step had it to see, #28), they
      // walked on through it, a step that took them no deeper)
      const nC = api.active, ex = api.extra.filter(o => !o.ahead && o.id !== 'train' && o.half > 0 && o.h != null);
      if (crowd) for (let i = 0; i < nC + ex.length; i++) {
        const c = i < nC ? C[i] : ex[i - nC];
        if (c.line < 0) continue;
        const R = c.half + 0.5, a0 = Math.floor((c.x - R) / CELL), a1 = Math.floor((c.x + R) / CELL), b0 = Math.floor((c.y - R) / CELL), b1 = Math.floor((c.y + R) / CELL);
        for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) for (let j = bhead[bucket(a, b)]; j >= 0; j = bchain[j]) {
          if (bi[j] < 0 || Math.abs(bz[j] - c.z) >= LEVEL) continue;
          // (the walker it has waited on over 5 s, stood just ahead of it: a step to the side, clear of its next metre too, as
          // one does who sees a bus waiting on them; else the bus edged up and the walker, blocked by the bus, stood on, 55 s
          // in Queenstown's junction 117)
          const waited = c.pw > 5 && bi[j] === c.who, e = waited ? aside(c, bx[j], by[j], 0.9) : into(c, bx[j], by[j], 0.25), p = crowd.P[bi[j]];
          if (!e || p.state !== 'walk' || p.line < 0) continue;
          const x = bx[j] + e.x * 1.02, y = by[j] + e.y * 1.02;
          if (nav && !nav.walk(x, y, p.z).ok) continue;
          const dx = x - p.x, dy = y - p.y; // (p.line is the crowd's network's, not the roads': past its end, walk() takes it on)
          p.lat += -dx * p.hy + dy * p.hx;
          p.s += p.dir * (dx * p.hx + dy * p.hy);
          p.x = bx[j] = x; p.y = by[j] = y;
        }
      }
      // a car that has come up against the player (turning in, say) moves them out of its way
      if (nav) for (const b of blockers) {
        if (b.half || b.fixed) continue;
        let o = pushOut(b.x, b.y, 0.35, b.z);
        if (o.x !== b.x || o.y !== b.y) {
          if (nav.posts) o = nav.posts.pushOut(o.x, o.y, 0.35, b.z); // (and not into a lamp post or a trunk)
          if (nav.walk(o.x, o.y, b.z).ok) { b.x = o.x; b.y = o.y; }
        }
      }
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
      send();
    }
    function send() { // the slots taken, to the GPU
      if (fleet) for (const k in fleet) for (const M of fleet[k]) {
        if (!M.count) continue;
        sendRange(M.instanceMatrix, M.count); sendRange(M.geometry.attributes.aC0, M.count); sendRange(M.geometry.attributes.aC1, M.count); sendRange(M.geometry.attributes.aC3, M.count);
      }
    }
    // The cars drawn again where they stood at the last update, for the eye as it is now (issue 525). update() picks each
    // car's mesh by its distance from the eye and leaves out the cars the eye cannot see; while the world is held and
    // the eye still moves (photo mode, whose camera flies up to 400 m off and turns all round; the menu; a still taken
    // through photo mode by the tools), that choice stood as it was when the world stopped: a bus the camera came up
    // to stayed its far model, a thousand triangles filling the frame, and the cars behind the old view were not there.
    const inv = new THREE.Matrix4();
    function review() {
      if (!fleet || !eye || !eye.isCamera) return;
      for (const k in fleet) for (const M of fleet[k]) M.count = 0;
      eye.updateMatrixWorld();
      frustum.setFromProjectionMatrix(fm.multiplyMatrices(eye.projectionMatrix, inv.copy(eye.matrixWorld).invert()), eye.coordinateSystem, eye.reversedDepth);
      eyeAt.copy(eye.position); culling = true;
      for (const c of C) if (c.m4 && c.m4At === tick) { m4.copy(c.m4); show(c); }
      send();
    }
    // the near and mid models, come after the far ones (vehicles.js loadCars, issue 335): each model's stand-ins
    // replaced, the cars put into them at the next update. Returns the meshes put in the world
    function upgrade(gltf) {
      if (!fleet || !gltf) return [];
      const full = carGeometries(gltf, I.tones), added = [];
      for (const k in fleet) for (const l of [0, 1]) {
        const g = full[k] && full[k][l], old = fleet[k][l];
        if (!g || !old) continue;
        const m = noCover(instanced(g, mat, old.instanceMatrix.count));
        // (the cars where they stand now, so the swap shows in the next frame drawn, whether or not the traffic moves)
        m.count = old.count;
        m.instanceMatrix.array.set(old.instanceMatrix.array); m.instanceMatrix.needsUpdate = true;
        for (const a of ['aC0', 'aC1', 'aC2', 'aC3', 'aAnim']) { m.geometry.attributes[a].array.set(old.geometry.attributes[a].array); m.geometry.attributes[a].needsUpdate = true; }
        m.userData.noRefl = true; world.add(m); world.remove(old); old.geometry.dispose();
        fleet[k][l] = m; added.push(m);
      }
      return added;
    }
    return Object.assign(api, { update, review, take, footprint, reverse, canReverse, upgrade, stats: () => Object.assign(JN.stats(), { revs, redRuns, redLog, laneChanges, outOfRing, squeezes, conflicts: JN.conflicts() }) });
  }

  // ------------------------------------------------------------ text sprites (names, markers)
  function sprite(text, { bg = 'rgba(18,32,42,0.82)', fg = '#ffffff', size = 44, pad = 16, font = '600 40px "Public Sans", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif' } = {}) {
    const c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = font;
    const w = Math.ceil(g.measureText(text).width) + pad * 2;
    c.width = w; c.height = size + pad;
    g.font = font;
    g.fillStyle = bg;
    const r = (size + pad) / 2;
    g.beginPath(); g.moveTo(r, 0); g.lineTo(w - r, 0); g.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2); g.lineTo(r, size + pad); g.arc(r, r, r, Math.PI / 2, Math.PI * 1.5); g.fill();
    g.fillStyle = fg; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText(text, w / 2, r + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // (in the world as anything else is: behind the player, a wall or anyone nearer the eye than it, hidden. It was drawn
    // through everything, depthTest off, and a mark over a man beyond the player stood on the back of her head: marks.js)
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false, transparent: true }));
    s.scale.set(w / (size + pad) * 0.42, 0.42, 1);
    s.renderOrder = 10;
    return s;
  }

  return { makePerson, network, join, benches, crowd, traffic, sprite, boxes, lin, rnd, pick, FOOTW };
})();
