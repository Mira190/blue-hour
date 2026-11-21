// The overture: a map's opening, a short film played in the game itself before control comes to you
// (docs/OVERTURE.md). A guide (a cherry petal in spring, a ginkgo leaf in autumn, a snowflake in winter,
// a mote of light in summer: the season on the game's clock) carries the camera through the map's
// signature places, cut like a film to a score, and comes down onto the player's shoulder, where the
// chase camera takes over without a cut. Everything is in game.json "overture" (from city.json), so a
// map's overture is data: its shots name the map's landmarks rather than coordinates, and a rebuilt
// map moves them with it.
//
//   spec.shots: [{ id, dur, type, ... }]  one after another; type is
//     orbit  {at, az: [a, b] (compass degrees of the camera from at), dist, h, look?}
//     move   {from, to, look | lookFrom + lookTo}
//     chase  {dist, h, side}               behind the guide along its path, looking at it
//     land   {via}                        from the last shot's end down to over the player's shoulder
//     fly    {}                            a window on the film's own flight (spec.fly, below): the camera runs on through
//                                          every cut, and the shot gives only its type, its cues and its seconds
//     escort {az, dist, h, lag, lead_s}    a camera ship flying with the guide: dist metres from it, az degrees round
//                                          from dead astern (+ to its right), h above it, in the way it has been
//                                          going over the last lag seconds (never whipped round by a turn), looking
//                                          where it will be lead_s seconds on (room ahead of it in the frame)
//   move: aim (0..1, or [k0, k1]: from none at k0 to whole at k1) turns its look to the guide (lead_s on, aim_up above)
//   any shot: guide: [points] (its path, a Catmull-Rom curve), or "path": the film's own path (spec.path) at the
//     film's time: one flight, the same through every cut, which the shots only cover; rest: k (the guide holds still until k),
//     fov (number or [from, to]), ease, lapse (minutes the clock runs through the shot: a time-lapse),
//     drift (0..1, the petals in the air round the camera), fadeIn / fadeOut (seconds), title (the
//     title drop over this shot: {at, until} in k), caption ({text, at, until}), cues: [[k, name]]
//     (signal: 'red' holds the walkers at a scramble, 'green' lets them all go at once)
//   A point is [x, y, z] (local metres), or ["@<anchor>", dx, dy, dz]: a landmark in scene.json by name
//   or path ("scramble", "hachiko", "shibuya_sky", "scramble.lines.4.0"), or "label:<name>" (scene
//   labels, by the start of the name), or "end" (where you stand at the end), with z above the
//   anchor's own height (a deck's, a statue's base, else the ground). {lerp: [A, B], m} is the point m
//   metres from A towards B (negative: behind A).
//   spec.path: [[x, y, z, t], ...]: the guide's way through the whole film, at t seconds from its start (a curve
//   through them in time: its speed is what the points' spacing and times give, and it stops at the first and last
//   and wherever a point is repeated); spec.end: {at, facing}: where you stand when control comes to you; spec.guides: [[kind, [m, d], [m, d]]]
//   the guide by season (the first whose dates hold); spec.score: the score's plan (film-score.js);
//   spec.title: {name, reading, line}, or {style: "card", eyebrow, name, jp, line}: the title screen's own card (the walk's);
//   a title's or a caption's {tokens} are filled by the game (ctx.fill: the walk's {date}, {hour}, {sky});
//   spec.signal: the point whose junction the cues change; spec.guide "none": no guide and no air (the walk's opening).
//   spec.fly: {pts, look, fov, from, to, ease, pace, low}: the camera's one way through the film (resolveFly);
//   spec.marks: [{at, jp, name, sub, t: [from, to] seconds, stem}]: places named on the picture as the camera passes them.
//   ctx.levelReady: the film holds where its land shot begins until the level under the player is drawn (ctx.levelWait s).
'use strict';
window.OEOverture = (function () {
  const RAD = Math.PI / 180;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const EASE = {
    linear: t => t,
    glide: t => { const a = 0.18; return t < a ? t * t / (2 * a * (1 - a)) : t > 1 - a ? 1 - (1 - t) * (1 - t) / (2 * a * (1 - a)) : (t - a / 2) / (1 - a); },
    inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    smooth: t => t * t * t * (t * (6 * t - 15) + 10),
    out: t => 1 - Math.pow(1 - t, 3),
    in: t => t * t * t,
  };
  const ch = (v, k, e = EASE.glide) => (Array.isArray(v) ? lerp(v[0], v[1], e(k)) : v);
  const KEY = 'oe3d-overture'; // the maps whose overture this browser has seen
  const seen = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  const markSeen = id => { try { const s = seen(); s[id] = Date.now(); localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ } };

  // ------------------------------------------------------------ the guide's shapes (unit length, +y along the leaf)
  function petalGeometry() { // a cherry petal: broad, with the notch at its tip, cupped
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(0.22, 0.05, 0.5, 0.42, 0.42, 0.78);
    s.bezierCurveTo(0.38, 0.95, 0.18, 1.0, 0.1, 0.98);
    s.quadraticCurveTo(0.03, 0.97, 0, 0.88);
    s.quadraticCurveTo(-0.03, 0.97, -0.1, 0.98);
    s.bezierCurveTo(-0.18, 1.0, -0.38, 0.95, -0.42, 0.78);
    s.bezierCurveTo(-0.5, 0.42, -0.22, 0.05, 0, 0);
    return cup(new THREE.ShapeGeometry(s, 10), 0.22);
  }
  function ginkgoGeometry() { // a ginkgo leaf: a fan on a short stalk, split at the middle of its rim
    const s = new THREE.Shape(), r = 0.78, a0 = -62 * RAD, a1 = 62 * RAD;
    s.moveTo(0.015, 0); s.lineTo(0.015, 0.22);
    for (let i = 0; i <= 12; i++) { const a = lerp(a1, 2 * RAD, i / 12); s.lineTo(Math.sin(a) * r * (0.96 + 0.04 * Math.sin(i * 1.7)), 0.22 + Math.cos(a) * r * 0.82); }
    s.lineTo(0, 0.22 + r * 0.62);
    for (let i = 0; i <= 12; i++) { const a = lerp(-2 * RAD, a0, i / 12); s.lineTo(Math.sin(a) * r * (0.96 + 0.04 * Math.sin(i * 1.3)), 0.22 + Math.cos(a) * r * 0.82); }
    s.lineTo(-0.015, 0.22); s.lineTo(-0.015, 0);
    return cup(new THREE.ShapeGeometry(s, 6), 0.12);
  }
  function flakeGeometry() { // a snowflake: six thin arms
    const g = [];
    for (let i = 0; i < 3; i++) { const b = new THREE.PlaneGeometry(0.06, 1); b.rotateZ(i * Math.PI / 3); g.push(b); }
    const out = new THREE.BufferGeometry(), pos = [], idx = [];
    let o = 0;
    for (const b of g) { pos.push(...b.attributes.position.array); for (const q of b.index.array) idx.push(q + o); o += b.attributes.position.count; }
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setIndex(idx); out.computeVertexNormals();
    return out;
  }
  function cup(geo, depth) { // bend a flat leaf into a shallow cup, and centre it on its middle
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, depth * (x * x * 2.2 + 0.25 * Math.sin(y * Math.PI))); p.setY(i, y - 0.5); }
    geo.computeVertexNormals();
    return geo;
  }
  const KINDS = {
    sakura: { geo: petalGeometry, color: '#f4b3c4', edge: '#ffd3df', size: 0.11, glow: '#ffbfd1', fall: 0.9, spin: 3.2 },
    ginkgo: { geo: ginkgoGeometry, color: '#f2c230', edge: '#ffe27a', size: 0.12, glow: '#ffd36b', fall: 1.3, spin: 2.2 },
    snow: { geo: flakeGeometry, color: '#f4f8ff', edge: '#ffffff', size: 0.035, glow: '#dfeaff', fall: 0.7, spin: 1.2 },
    mote: { geo: null, color: '#fff1d0', edge: '#fff1d0', size: 0.05, glow: '#ffe6b0', fall: -0.05, spin: 0 },
    // a meteor, for the night: a white head and a long blue-violet tail across the sky, far off (sized in metres there)
    meteor: { geo: null, color: '#ffffff', edge: '#c070ff', size: 2.2, glow: '#eaf6ff', fall: 0, spin: 0, tail: 96, far: true },
    // no guide at all: the film's camera is its own subject (the walk's opening, flown as one flight: spec.fly)
    none: { geo: null, color: '#000000', edge: '#000000', size: 0.05, glow: '#000000', fall: 0, spin: 0, none: true },
  };
  function kindFor(spec, m, d) {
    const md = m * 100 + d;
    for (const [kind, a, b] of spec.guides || []) {
      const lo = a[0] * 100 + a[1], hi = b[0] * 100 + b[1];
      if (lo <= hi ? md >= lo && md <= hi : md >= lo || md <= hi) return kind;
    }
    return 'sakura';
  }
  // a soft round glow, drawn once
  function glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    return t;
  }

  // ------------------------------------------------------------ a night sky painted for the overture
  // One sphere inside the camera's far plane, drawn last and only where nothing stands in front of it (the
  // sky's pixels): a deep gradient from the zenith's indigo to a glow along the horizon where the city's light
  // lifts it, the Milky Way as a band of soft noise with its dark lanes, stars in two scales that twinkle, and
  // thin clouds low down lit from below by the city. All in the shader: no texture, a few hundred bytes.
  function nightSky(o = {}) {
    const RADc = Math.PI / 180, cm = o.comet || null;
    // the comet: where its head is (compass bearing and height, degrees) and the way its tails stream (degrees round
    // from straight up, clockwise as seen), the tails' length in degrees
    const dirOf = (az, alt) => new THREE.Vector3(Math.sin(az * RADc) * Math.cos(alt * RADc), Math.sin(alt * RADc), -Math.cos(az * RADc) * Math.cos(alt * RADc));
    const cDir = cm ? dirOf(cm.az ?? 0, cm.alt ?? 40) : new THREE.Vector3(0, 1, 0), cTail = new THREE.Vector3(0, 1, 0);
    if (cm) {
      const up = new THREE.Vector3(0, 1, 0).addScaledVector(cDir, -cDir.y).normalize(), right = new THREE.Vector3().crossVectors(up, cDir).normalize(), a = (cm.tail ?? 20) * RADc;
      cTail.copy(up).multiplyScalar(Math.cos(a)).addScaledVector(right, Math.sin(a)).normalize();
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uMilky: { value: o.milky ?? 1 }, uStars: { value: o.stars ?? 1 }, uClouds: { value: o.clouds ?? 0.6 },
        uZen: { value: new THREE.Color(...(o.zenith || [0.008, 0.014, 0.05])) }, uMid: { value: new THREE.Color(...(o.mid || [0.03, 0.045, 0.13])) },
        uLow: { value: new THREE.Color(...(o.low || o.mid || [0.03, 0.045, 0.13])) }, uLowK: { value: o.low ? 0.85 : 0 },
        uHor: { value: new THREE.Color(...(o.horizon || [0.32, 0.2, 0.26])) }, uCity: { value: new THREE.Color(...(o.city || o.horizon || [0.32, 0.2, 0.26])) }, uPole: { value: new THREE.Vector3(...(o.pole || [0.35, 0.55, -0.76])).normalize() },
        uRim: { value: new THREE.Color(...(o.rim || [0.34, 0.4, 0.7])) }, uBank: { value: o.banks ?? 0 },
        uComet: { value: cm ? (cm.k ?? 1) : 0 }, uCometDir: { value: cDir }, uCometTail: { value: cTail }, uCometLen: { value: ((cm && cm.len) || 24) * RADc } },
      vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `
        uniform float uTime, uK, uMilky, uStars, uClouds, uLowK, uBank, uComet, uCometLen; uniform vec3 uZen, uMid, uLow, uHor, uCity, uPole, uRim, uCometDir, uCometTail; varying vec3 vW;
        float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
        float vn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
        float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * vn(p); p = p * 2.03 + 1.7; a *= 0.5; } return v; }
        // stars: one to a cell at most, its colour from blue-white to a warm one, the rare bright ones larger
        vec3 stars(vec3 d, float scale, float density) {
          vec3 p = d * scale, c = floor(p), f = fract(p) - 0.5;
          float r = h31(c);
          if (r > density) return vec3(0.0);
          vec3 o = vec3(h31(c + 11.1), h31(c + 23.7), h31(c + 37.3)) - 0.5;
          float big = pow(h31(c + 5.3), 5.0), dd = length(f - o * 0.6), b = big * 6.0 + 0.6;
          float tw = 0.75 + 0.25 * sin(uTime * (1.5 + 3.0 * h31(c + 9.9)) + r * 40.0);
          vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.86, 0.7), smoothstep(0.55, 0.95, h31(c + 2.2)));
          return tint * b * tw * smoothstep(0.2 + 0.1 * big, 0.0, dd);
        }
        void main() {
          vec3 d = normalize(vW - cameraPosition);
          float h = d.y, up = clamp(h, 0.0, 1.0);
          vec3 col = mix(uMid, uZen, smoothstep(0.08, 0.75, up));
          col = mix(col, uLow, exp(-max(h, 0.0) * 5.0) * uLowK);                   // the belt of clearer blue under the indigo
          col = mix(col, uHor, exp(-max(h, -0.02) * 14.0) * 0.9);                 // the glow over the city along the horizon
          col = mix(col, uCity, exp(-max(h, -0.01) * 70.0) * 0.75);              // and, only where the sky meets the skyline, the city's own warm light
          float band = dot(d, uPole), mw = exp(-band * band / 0.05) * smoothstep(-0.02, 0.25, h);
          float n = fbm(d * 7.0), lanes = smoothstep(0.45, 0.75, fbm(d * 13.0 + 4.0));
          vec3 mwc = mix(vec3(0.36, 0.38, 0.66), vec3(0.62, 0.5, 0.56), exp(-band * band / 0.008) * n);   // its core warmer than its edges
          col += mwc * mw * (0.3 + 1.1 * n * n) * (1.0 - 0.8 * lanes) * 0.42 * uMilky;   // the Milky Way, its dust lanes
          vec3 st = stars(d, 160.0, 0.10) + stars(d, 330.0, 0.05 + 0.2 * mw) * 0.6 + stars(d, 90.0, 0.012) * 2.2;
          col += st * uStars * smoothstep(0.0, 0.18, h);
          // a comet, still in the sky as a comet is: its head, a straight blue tail of gas blown by the sun's wind, and a
          // broad pale tail of dust curving away from it
          float cd = dot(d, uCometDir);
          if (uComet > 0.0 && cd > 0.3) {
            vec3 v = d - uCometDir * cd, t2 = normalize(cross(uCometDir, uCometTail));
            float a = dot(v, uCometTail), b = dot(v, t2), r = length(v), L = uCometLen;
            float head = exp(-r * r / 0.0000035) * 2.2 + exp(-r * r / 0.00004) * 0.45 + exp(-r / 0.012) * 0.08;   // (a star-like point in a small coma: not a disc)
            float along = max(a, 0.0), tail = smoothstep(-0.002, 0.004, a);
            float w1 = 0.0025 + along * 0.03, ion = tail * exp(-b * b / (w1 * w1)) * exp(-along / (L * 0.55));
            ion *= 0.72 + 0.28 * vn(vec3(b / w1 * 2.5, along * 60.0, 3.0));       // (streamers along it)
            float bc = b - 0.6 * along * along / L - along * 0.2, w2 = 0.006 + along * 0.1;
            float dust = tail * exp(-bc * bc / (w2 * w2)) * exp(-along / (L * 0.4));
            col += (vec3(0.4, 0.72, 1.0) * ion * 0.95 + vec3(1.0, 0.88, 0.78) * dust * 0.5 + vec3(0.86, 0.95, 1.0) * head) * uComet * smoothstep(0.0, 0.1, h);
          }
          // thin clouds low in the sky, lit from below by the city: dark blue bodies with warm undersides
          vec2 cp = d.xz / max(h + 0.08, 0.05);
          float cl = smoothstep(0.52, 0.8, fbm(vec3(cp * 0.9, 1.3) + vec3(uTime * 0.004, 0.0, 0.0))) * smoothstep(0.42, 0.04, h) * smoothstep(-0.01, 0.04, h);
          col = mix(col, mix(vec3(0.04, 0.05, 0.11), uHor * 0.9, smoothstep(0.3, 0.0, h) * 0.8), cl * uClouds);
          // banks of cumulus standing over the horizon: deep blue bodies, their undersides warmed by the city under them,
          // and their edges, where they are thin, bright with the sky's light behind them
          if (uBank > 0.0) {
            vec2 bp = d.xz / max(h + 0.16, 0.1);
            float bn = fbm(vec3(bp * 0.62, 7.0) + vec3(uTime * 0.0025, 0.0, 0.0)) + 0.16 * smoothstep(0.3, 0.0, h);
            float mask = smoothstep(0.5, 0.6, bn) * smoothstep(0.55, 0.12, h) * smoothstep(-0.01, 0.03, h), core = smoothstep(0.58, 0.78, bn);
            vec3 body = mix(vec3(0.035, 0.05, 0.13), uHor * 0.85, smoothstep(0.2, 0.0, h) * 0.85);
            col = mix(col, mix(uRim * (0.7 + 0.9 * up), body, core), mask * uBank);
          }
          gl_FragColor = vec4(col, uK);
        }`,
      side: THREE.BackSide, depthWrite: false, depthTest: true, transparent: true, fog: false,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(38000, 48, 24), mat);
    m.renderOrder = -1e6; m.frustumCulled = false; m.name = 'overture-sky'; // (the first of the see-through things, after the sky and the city: the meteors and the glows go over it)
    return m;
  }

  // ------------------------------------------------------------ the overture of one map
  // ctx: { G, scene, CITY, W, world, camera, stage, cine, live, handOver, junctions, crowd, footNet, nav, clock,
  //        setClock, player, spawn, tier, reduced, sun: () => sun, U, onEnd }
  function create(ctx) {
    const base = ctx.G.overture;
    if (!base || !base.shots || !base.shots.length) return null;
    // the day's overture, or its night one (spec.night: what differs after dark, its own shots, score and guide)
    // when the sun is down at the hour the game starts
    let spec = base, variant = 'day';
    function pick() {
      const sp = ctx.sun && ctx.sun(), v = base.night && sp && sp.altitude < (base.night.below ?? -6) ? 'night' : 'day';
      if (v !== variant) { variant = v; spec = v === 'night' ? Object.assign({}, base, base.night) : base; cut(); scoreBuf = null; scoreFor = null; }
      return variant;
    }
    const { W, scene, nav } = ctx;
    const V3 = THREE.Vector3;

    // where a person would stand at (x, y): the ground, a deck or a footway's drape
    function floor(x, y) {
      let z0 = Math.max(0, nav.terrain(x, y));
      for (const st of nav.strips) { const h = st.drape ? nav.stripHeight(st, x, y) : null; if (h != null && h > z0) z0 = h; }
      const f = nav.floorAt(x, y, z0 + 1);
      return f ? f.z : z0;
    }
    // a landmark (or a point inside one) by name or path: [x, y, z]
    function anchor(name) {
      if (name === 'end') return endAt.slice();
      if (name.startsWith('label:')) {
        const want = name.slice(6), L = scene.labels || {}, k = Object.keys(L).find(n => n === want) || Object.keys(L).find(n => n.startsWith(want));
        if (!k) throw new Error(`overture: no label ${want}`);
        return [L[k][0], L[k][1], floor(L[k][0], L[k][1])];
      }
      const path = name.split('.'), L = scene.landmarks || {};
      let v = L[path[0]];
      if (v === undefined) throw new Error(`overture: no landmark ${path[0]}`);
      for (const p of path.slice(1)) { v = v[/^\d+$/.test(p) ? +p : p]; if (v === undefined) throw new Error(`overture: no ${name}`); }
      if (Array.isArray(v) && typeof v[0] === 'number') return [v[0], v[1], v[2] != null ? v[2] : floor(v[0], v[1])];
      const xy = v.node || v.at || v.centre;
      if (!xy) throw new Error(`overture: ${name} has no position`);
      const z = typeof v.deck_z === 'number' ? v.deck_z : typeof v.z === 'number' ? v.z : floor(xy[0], xy[1]);
      return [xy[0], xy[1], z];
    }
    function point(p) {
      if (!p) return null;
      if (typeof p === 'string') p = [p];
      if (p.lerp) { const a = point(p.lerp[0]), b = point(p.lerp[1]), d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = (p.m || 0) / d; return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t) + (p.dz || 0)]; }
      if (typeof p[0] === 'string') { const a = anchor(p[0].replace(/^@/, '')); return [a[0] + (p[1] || 0), a[1] + (p[2] || 0), a[2] + (p[3] || 0)]; }
      return p.slice(0, 3);
    }

    // where you stand at the end: the spec's, on the nearest firm spot
    let endAt = ctx.G.start.at.slice(0, 2).concat([0]);
    const endSpec = spec.end || {};
    function placeEnd() {
      const at = endSpec.at ? point(endSpec.at) : endAt;
      endAt = [at[0], at[1], floor(at[0], at[1])];
      const fa = endSpec.facing ? point(endSpec.facing) : ctx.G.start.facing;
      ctx.spawn([endAt[0], endAt[1]], undefined, fa);
      endAt = [ctx.player.x, ctx.player.y, ctx.player.z];
    }

    // the cut
    let shots = [], total = 0;
    function cut() { let T = 0; shots = spec.shots.map(s => { const q = Object.assign({}, s, { t0: T }); T += s.dur; return q; }); total = T; }
    cut();
    let path = null; // spec.path resolved: [{ p: [x, y, z], t, m: [vx, vy, vz] }]
    function resolve() { // the shots' points, once the player is placed (an "end" anchor depends on it)
      path = spec.path && spec.path.length > 1 ? spec.path.map(q => ({ p: point(q.slice(0, 3)), t: q[3] })) : null;
      if (path) path.forEach((q, i) => { // (its velocity at each point: from its neighbours, nought at an end and at a point repeated)
        const a = path[i - 1], b = path[i + 1], same = (u, v) => u && v && Math.hypot(u.p[0] - v.p[0], u.p[1] - v.p[1], u.p[2] - v.p[2]) < 1e-3;
        q.m = !a || !b || same(a, q) || same(q, b) ? [0, 0, 0] : [0, 1, 2].map(j => (b.p[j] - a.p[j]) / Math.max(1e-3, b.t - a.t));
      });
      for (const s of shots) {
        for (const k of ['at', 'look', 'from', 'to', 'lookFrom', 'lookTo', 'via', 'focus']) if (s[k]) s['_' + k] = point(s[k]);
        s._guide = s.guide === 'path' ? null : (s.guide || []).map(point);
      }
      resolveFly();
      marks = (spec.marks || []).map(m => Object.assign({}, m, { _at: point(m.at) }));
    }
    // ------------------------------------------------------------ the film's own flight (spec.fly; a shot of type "fly" is
    // a window on it, so the camera runs on unbroken through every cut)
    //   spec.fly: { pts: [points] (where the camera passes), look: [points] (what it looks at from each, or one point),
    //               fov: [degrees] (the lens at each, optional), from, to (its seconds in the film), ease, pace, low }
    // The way is a centripetal Catmull-Rom curve through pts (it neither loops nor overshoots between points spaced
    // unevenly), and the look and the lens are the same curve's through theirs, at the same place along it. It is flown at
    // a pace set by the camera's height over the ground: each metre counts as 1 / height^pace, so with pace 1 the city
    // streams past the lens at one rate from 600 m to the kerb (the "optimal" fly-to of van Wijk and Nuij, 2003, which web
    // maps' fly-to uses: a camera's speed over the ground in proportion to what it sees), with 0 at one speed; between,
    // the high part slower than that, as a held reveal is. `low` is the height under which a metre counts as at it (6 m).
    let fly = null, marks = [];
    function crc(P, i, u, out) { // the centripetal Catmull-Rom (alpha 0.5) through P at segment i, 0 <= u <= 1
      const n = P.length, g = j => P[Math.max(0, Math.min(n - 1, j))];
      const p1 = g(i), p2 = g(i + 1);
      let p0 = g(i - 1), p3 = g(i + 2);
      if (i === 0) p0 = p1.map((v, j) => 2 * v - p2[j]); // (the ends reflected: the curve leaves and arrives along its chord)
      if (i >= n - 2) p3 = p2.map((v, j) => 2 * v - p1[j]);
      const d = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])));
      const t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3), t = t1 + (t2 - t1) * u;
      for (let j = 0; j < 3; j++) {
        const a1 = ((t1 - t) * p0[j] + t * p1[j]) / t1, a2 = ((t2 - t) * p1[j] + (t - t1) * p2[j]) / (t2 - t1), a3 = ((t3 - t) * p2[j] + (t - t2) * p3[j]) / (t3 - t2);
        const b1 = ((t2 - t) * a1 + t * a2) / t2, b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
        out[j] = ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1);
      }
      return out;
    }
    function resolveFly() {
      fly = null;
      const F = spec.fly;
      if (!F || !F.pts || F.pts.length < 2) return;
      const P = F.pts.map(point), L = (F.look || []).map(point), n = P.length, M = 80, pace = F.pace ?? 0.7, low = F.low ?? 6;
      const S = [], q = [0, 0, 0];
      let acc = 0, prev = null;
      for (let i = 0; i < n - 1; i++) for (let j = 0; j < M; j++) {
        const u = j / M; crc(P, i, u, q);
        if (prev) { const ds = Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]), h = Math.max(low, (q[2] + prev[2]) / 2 - Math.max(0, nav.terrain((q[0] + prev[0]) / 2, (q[1] + prev[1]) / 2))); acc += ds / Math.pow(h, pace); }
        S.push({ L: acc, g: i + u }); prev = q.slice();
      }
      crc(P, n - 2, 1, q); acc += Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]) / Math.pow(Math.max(low, q[2] - Math.max(0, nav.terrain(q[0], q[1]))), pace);
      S.push({ L: acc, g: n - 1 });
      fly = { P, L, S, fov: F.fov && F.fov.length === n ? F.fov.slice() : null, from: F.from ?? 0, to: F.to ?? total, ease: EASE[F.ease || 'glide'] };
    }
    // where along it at T seconds: the curve's own parameter (segment + fraction)
    function flyG(T) {
      const f = fly, S = f.S, want = f.ease(clamp((T - f.from) / Math.max(1e-3, f.to - f.from))) * S[S.length - 1].L;
      let lo = 0, hi = S.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m].L < want) lo = m; else hi = m; }
      const a = S[lo], b = S[hi], w = b.L > a.L ? (want - a.L) / (b.L - a.L) : 0;
      return a.g + (b.g - a.g) * w;
    }
    const flyAt = (P, g, out) => { const i = Math.min(P.length - 2, Math.floor(g)); return crc(P, i, g - i, out); };
    const flyFov = g => { const v = fly.fov, n = v.length, i = Math.min(n - 2, Math.floor(g)), u = g - i, a = v[Math.max(0, i - 1)], b = v[i], c = v[i + 1], d = v[Math.min(n - 1, i + 2)]; // (a lens: a plain Catmull-Rom)
      return 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u); };
    const fq = [0, 0, 0];
    // the film's path at T seconds from its start ([x, y, z], local metres): a cubic in time through its points (Hermite,
    // the velocities above), so position and velocity run on unbroken through every cut
    function pathAt(T) {
      if (!path) return null;
      const n = path.length;
      if (T <= path[0].t) return path[0].p.slice();
      if (T >= path[n - 1].t) return path[n - 1].p.slice();
      let i = 0;
      while (i < n - 2 && T > path[i + 1].t) i++;
      const a = path[i], b = path[i + 1], h = Math.max(1e-3, b.t - a.t), u = (T - a.t) / h, u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      return [0, 1, 2].map(j => h00 * a.p[j] + h10 * h * a.m[j] + h01 * b.p[j] + h11 * h * b.m[j]);
    }

    // ------------------------------------------------------------ the guide and the air
    const tier = ctx.tier || 'high';
    let kind = 'sakura', K = KINDS.sakura, hero = null, glow = null, drift = null, driftData = null, group = null, tail = [], sky = null, shower = [], nextStar = 0;
    const NDRIFT = { high: 420, medium: 260, low: 110 }[tier] || 200, BOX = 36;
    let builtFor = null;
    const buildKey = () => `${variant}|${spec.guide || kindFor(spec, ctx.clock.m, ctx.clock.d)}|${!!spec.sky}`;
    function build() {
      kind = spec.guide || kindFor(spec, ctx.clock.m, ctx.clock.d);
      K = KINDS[kind];
      builtFor = buildKey();
      group = new THREE.Group();
      group.name = 'overture';
      const tex = glowTexture();
      const geo = K.geo ? K.geo() : null;
      const mat = geo ? new THREE.MeshStandardMaterial({ color: new THREE.Color(K.color), emissive: new THREE.Color(K.edge), emissiveIntensity: 0.35, roughness: 0.55, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 0.96 }) : null;
      if (geo) { hero = new THREE.Mesh(geo, mat); hero.scale.setScalar(K.size); hero.frustumCulled = false; group.add(hero); }
      glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(K.glow), transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      glow.scale.setScalar(K.size * 4); glow.frustumCulled = false; group.add(glow);
      // a meteor's tail: glowing sprites along the way it came, smaller and fainter towards the end
      tail = [];
      if (K.tail) for (let i = 0; i < K.tail; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(K.glow).lerp(new THREE.Color(K.edge), i / K.tail), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        sp.frustumCulled = false; sp.visible = false; group.add(sp); tail.push(sp);
      }
      // the air: petals (or leaves, flakes, motes) drifting round the camera in a box that wraps
      const dgeo = geo || new THREE.PlaneGeometry(1, 1);
      const dmat = geo ? mat.clone() : new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(K.glow), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      if (geo) dmat.opacity = 0.9;
      drift = new THREE.InstancedMesh(dgeo, dmat, NDRIFT);
      drift.frustumCulled = false;
      drift.count = 0;
      driftData = [];
      let seed = 11;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < NDRIFT; i++) driftData.push({ p: new V3((rnd() - 0.5) * BOX, (rnd() - 0.5) * BOX * 0.6, (rnd() - 0.5) * BOX), ph: rnd() * 6.28, s: 0.7 + rnd() * 0.6, ax: new V3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), w: 0.6 + rnd() * 1.6 });
      group.add(drift);
      ctx.world.add(group);
      // after dark, the painted night sky, and a shower of smaller meteors besides the guide
      sky = spec.sky ? nightSky(spec.sky) : null;
      if (sky) ctx.world.add(sky);
      shower = [];
      if (K.far && (spec.shower ?? 0) > 0) for (let i = 0; i < 5; i++) {
        const parts = [];
        for (let j = 0; j < 12; j++) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(K.glow).lerp(new THREE.Color(K.edge), j / 12), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
          sp.frustumCulled = false; sp.visible = false; group.add(sp); parts.push(sp);
        }
        shower.push({ parts, t0: -99, life: 1, a: new V3(), v: new V3() });
      }
    }
    // built ahead and compiled, hidden, while the title is up (warm: game.js compileFor, which resolves when the GPU has
    // them): the tap on Play compiled the guide, its drift, its glows and the sky in the frame after it, which on the
    // owner's iPhone held that tap 4.4 s (tools/entry_cost.js)
    function prewarm(warm) {
      if (active) return Promise.resolve();
      pick();
      if (group && builtFor !== buildKey()) dispose();
      if (!group) build();
      group.visible = false; if (sky) sky.visible = false;
      return Promise.all([warm(group), sky ? warm(sky) : null]).catch(e => console.warn('overture warm-up:', e));
    }
    function dispose() {
      if (!group) return;
      ctx.world.remove(group);
      group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
      group = hero = glow = drift = null; tail = []; shower = [];
      if (sky) { ctx.world.remove(sky); sky.geometry.dispose(); sky.material.dispose(); sky = null; }
    }

    // the guide's path through a shot: a Catmull-Rom curve through its points, held at the first until `rest`
    const tmpA = new V3(), tmpB = new V3();
    function guideAt(s, k, out) {
      if (s.guide === 'path') { const q = pathAt(s.t0 + clamp(k) * s.dur); return q ? out.copy(W(...q)) : null; }
      const P = s._guide;
      if (!P || !P.length) return null;
      if (s.gFrom != null || s.gTo != null) { const a = s.gFrom ?? 0, b = s.gTo ?? 1; if (k < a || k > b) return null; k = (k - a) / (b - a); }
      if (P.length === 1) return out.copy(W(...P[0]));
      const r = s.rest || 0, u = k < r ? 0 : EASE[s.guideEase || 'inOut']((k - r) / (1 - r)) * (P.length - 1);
      const i = Math.min(P.length - 2, Math.floor(u)), f = u - i;
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
      const x = cr(p0[0], p1[0], p2[0], p3[0]), y = cr(p0[1], p1[1], p2[1], p3[1]);
      let z = cr(p0[2], p1[2], p2[2], p3[2]);
      if (s.arc) { // a falling star's curve: the path bows down by arc times its length at the middle
        const a = P[0], b = P[P.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), q = u / (P.length - 1);
        z -= s.arc * L * 4 * q * (1 - q);
      }
      // a leaf's flutter: a lazy sway across its line and a bob, more as it moves
      // (not a thing of the game's, ctx.guideAt: a helicopter does not flutter, and its attitude is read off this path)
      const t = (s.t0 + k * s.dur), amp = K.far || ctx.guideAt ? 0 : (k < r ? 0.012 : 0.16) * (s.flutter ?? 1);
      out.copy(W(x + Math.sin(t * 1.9) * amp, y + Math.cos(t * 1.4) * amp, z + Math.sin(t * 2.6) * amp * 0.6));
      return out;
    }

    // ------------------------------------------------------------ the camera
    const pose = { pos: new V3(), look: new V3() }, gpos = new V3(), gprev = new V3(), tan = new V3(0, 0, -1);
    let lastShot = null, from = null, fov = 45;
    function shotPose(s, k) {
      const e = EASE[s.ease || 'glide'];
      const g = guideAt(s, k, gpos);
      if (s.type === 'orbit') {
        const az = ch(s.az, k, e) * RAD, d = ch(s.dist, k, e), h = ch(s.h, k, e), c = W(...s._at);
        pose.pos.set(c.x + Math.sin(az) * d, c.y + h, c.z - Math.cos(az) * d);
        pose.look.copy(s._look ? W(...s._look) : c);
      } else if (s.type === 'move') {
        pose.pos.lerpVectors(W(...s._from), W(...s._to), e(k));
        if (s._look) pose.look.copy(W(...s._look)); else pose.look.lerpVectors(W(...s._lookFrom), W(...s._lookTo), e(k));
        // (aim: the lens panning with the guide, as an operator follows it, from where the shot was framed)
        const aim = !g || s.aim == null ? 0 : Array.isArray(s.aim) ? EASE.smooth(clamp((k - s.aim[0]) / Math.max(1e-3, s.aim[1] - s.aim[0]))) : s.aim;
        if (aim > 0) { const q = ahead(s, k, s.lead_s || 0, tmpA); q.y += s.aim_up || 0; pose.look.lerp(q, aim); }
      } else if (s.type === 'escort' && g) {
        // a camera ship flying with it: astern and to a side of the way it has been going over the last `lag` seconds
        // (an average, so a turn swings it round no faster than the turn goes and it never whips), looking where it will be
        const T = s.t0 + k * s.dur, lag = s.lag ?? 1.2, hd = heading(s, T, lag, tmpB);
        const az = ch(s.az ?? 25, k, e) * RAD, dist = ch(s.dist ?? 20, k, e), h = ch(s.h ?? 3, k, e);
        // (game heading (hx, hy): astern is -(hx, hy), its right (hy, -hx); in the world's frame y is up and z is -north)
        const bx = -hd.x * Math.cos(az) + hd.y * Math.sin(az), by = -hd.y * Math.cos(az) - hd.x * Math.sin(az);
        pose.pos.set(g.x + bx * dist, g.y + h, g.z - by * dist);
        const q = ahead(s, k, s.lead_s ?? 0.3, tmpA);
        pose.look.copy(q); pose.look.y += s.aim_up || 0;
      } else if (s.type === 'chase' && g) {
        // behind the guide along the way it goes, a little above and to the side, looking past it
        const ahead = guideAt(s, Math.min(1, k + 0.02), tmpA), back = guideAt(s, Math.max(0, k - 0.02), tmpB);
        const d = tmpA.copy(ahead).sub(back);
        if (d.lengthSq() > 1e-6) tan.lerp(d.normalize(), 0.25).normalize();
        const dist = ch(s.dist ?? 3, k, e), h = ch(s.h ?? 1, k, e), side = ch(s.side ?? 0, k, e);
        const right = tmpB.set(-tan.z, 0, tan.x).normalize();
        pose.pos.copy(g).addScaledVector(tan, -dist).addScaledVector(right, side);
        pose.pos.y += h;
        pose.look.copy(g).addScaledVector(tan, s.lead ?? 2);
        if (s._look) pose.look.lerp(W(...s._look), ch(s.lookMix ?? 0.5, k, e));
      } else if (s.type === 'fly' && fly) {
        // the film's own flight at this moment (resolveFly): the camera on its way, looking where its points say
        const gg = flyG(s.t0 + k * s.dur);
        pose.pos.copy(W(...flyAt(fly.P, gg, fq)));
        if (fly.L.length === fly.P.length) pose.look.copy(W(...flyAt(fly.L, gg, fq)));
        else if (fly.L.length) pose.look.copy(W(...fly.L[0]));
        else { flyAt(fly.P, Math.min(fly.P.length - 1, gg + 0.05), fq); pose.look.copy(W(...fq)).sub(pose.pos).multiplyScalar(8).add(pose.pos); } // (along the way, ahead)
        if (fly.fov && s.fov == null) { fov = flyFov(gg); return g; }
      } else if (s.type === 'land') {
        // from where the last shot ended, through `via`, down to the chase camera over the player's shoulder
        const a = from || { pos: pose.pos.clone(), look: pose.look.clone() }, q = EASE[s.qEase || 'smooth'](k);
        const v = s._via ? W(...s._via) : a.pos.clone().lerp(ctx.live.pos, 0.5).setY(Math.max(a.pos.y, ctx.live.pos.y) * 0.6);
        const b = ctx.live;
        pose.pos.set(0, 0, 0).addScaledVector(a.pos, (1 - q) * (1 - q)).addScaledVector(v, 2 * q * (1 - q)).addScaledVector(b.pos, q * q);
        pose.look.lerpVectors(a.look, g || b.look, EASE.smooth(clamp(k * 2.2)));
        if (k > 0.55) pose.look.lerp(b.look, EASE.smooth((k - 0.55) / 0.45));
      }
      fov = ch(s.fov ?? 45, k, e);
      return g;
    }
    function shotAt(t) { let s = shots[0]; for (const q of shots) if (t >= q.t0 - 1e-6) s = q; return s; }
    // a lens chosen for a landscape frame keeps most of its width on a phone held upright: the vertical angle opened until
    // the frame is 0.8 as wide as a 3:2 one, at most 90 degrees. At the vertical angle alone a phone saw a slice a third as
    // wide as a desktop did, and a helicopter crossing the frame was out of it in a third of the time
    function lensFor(v) { const a = (ctx.camera && ctx.camera.aspect) || 1.6, k = 1.2 / a; return k <= 1 ? v : Math.min(90, 2 * Math.atan(Math.tan(v * RAD / 2) * k) / RAD); }
    // where the guide will be lead seconds on, at the height it is now (the film's path, or the shot's own beyond its end held
    // at its last point): room ahead of it in the frame, not below it as it comes down
    function ahead(s, k, lead, out) {
      const y = gpos.y;
      if (s.guide === 'path') out.copy(W(...pathAt(s.t0 + k * s.dur + lead)));
      else if (!guideAt(s, Math.min(1, k + lead / s.dur), out)) out.copy(pose.look);
      if (lead) out.y = y;
      return out;
    }
    // the way it has been going over the last lag seconds, level: { x, y } a unit vector in game coordinates
    const lastHd = { x: 0, y: 1 };
    function heading(s, T, lag, out) {
      let sx = 0, sy = 0;
      const at = tt => (s.guide === 'path' ? pathAt(tt) : (() => { const q = guideAt(s, clamp((tt - s.t0) / s.dur), tmpB.clone()); return q ? [q.x, -q.z, q.y] : null; })());
      for (let i = 0; i <= 8; i++) { // (eight steps over the window, the later ones weighed more)
        const t1 = T - lag * (1 - i / 8), a = at(t1 - 0.15), b = at(t1 + 0.15);
        if (!a || !b) continue;
        const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), w = 0.5 + i / 8;
        if (l > 0.05) { sx += dx / l * w * Math.min(1, l / 1.5); sy += dy / l * w * Math.min(1, l / 1.5); }
      }
      const l = Math.hypot(sx, sy);
      if (l > 0.2) { lastHd.x = sx / l; lastHd.y = sy / l; } // (in a hover: the way it last went)
      out.x = lastHd.x; out.y = lastHd.y;
      return out;
    }

    // ------------------------------------------------------------ the type: the title drop, captions, the bars, the skip hint
    const css = document.createElement('style');
    css.textContent = `
.game-stage.overture :is(.g-labels, .g-right, .g-toasts, .g-prompt, .g-touch, .g-grid, .g-quest, .g-reticle, .g-ekimei, .g-vhud, .g-lens) { visibility: hidden !important; }
.ov-layer { position: absolute; inset: 0; z-index: 5; pointer-events: none; overflow: hidden; color: #fff; }
.ov-black { position: absolute; inset: 0; background: #000; opacity: 1; }
.ov-title { position: absolute; left: 0; right: 0; top: 34%; text-align: center; opacity: 0; letter-spacing: .22em; }
.ov-title b { display: block; margin-right: -.22em; font: 500 clamp(54px, 10vw, 128px)/1 var(--f-jp, "Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif); text-shadow: 0 2px 28px rgba(0,0,0,.35), 0 0 60px rgba(255,214,190,.18); }
.ov-title span { display: block; margin-top: 18px; font: 300 clamp(10px, 1.1vw, 13px)/1.4 var(--f-display, system-ui); letter-spacing: .62em; margin-right: -.62em; text-transform: uppercase; color: rgba(255,255,255,.86); text-shadow: 0 1px 12px rgba(0,0,0,.4); }
.ov-title i { display: block; margin-top: 10px; font: 400 clamp(9px, .9vw, 11px)/1.4 var(--f-mono, ui-monospace, monospace); font-style: normal; letter-spacing: .24em; color: rgba(255,255,255,.62); }
.ov-cap { position: absolute; left: max(16px, 4.5vw); bottom: calc(8.5vh + 22px); max-width: min(560px, calc(100% - 32px)); opacity: 0; font: 400 clamp(12px, 1.2vw, 15px)/1.6 var(--f-body, system-ui); color: rgba(255,255,255,.92); text-shadow: 0 1px 14px rgba(0,0,0,.55); }
.ov-cap small { display: block; margin-bottom: 4px; font: 400 9.5px/1.3 var(--f-mono, ui-monospace, monospace); letter-spacing: .22em; text-transform: uppercase; color: var(--accent, #ffb066); }
.ov-skip { position: absolute; right: max(16px, 3vw); bottom: calc(8.5vh + 18px); font: 400 10px/1 var(--f-mono, ui-monospace, monospace); letter-spacing: .2em; text-transform: uppercase; color: rgba(255,255,255,.55); opacity: 0; pointer-events: auto; cursor: pointer; background: none; border: 0; padding: 10px 0; }
.ov-skip:hover { color: #fff; }
@media (max-width: 640px) { .ov-title { top: 30%; } .ov-cap { bottom: calc(8.5vh + 14px); } .ov-skip { top: calc(8.5vh + 6px); bottom: auto; } }
.ov-title.card { top: 27%; padding: 44px 0 46px; letter-spacing: .16em; background: radial-gradient(ellipse 46% 50% at 50% 50%, rgba(4,8,18,.5), rgba(4,8,18,.22) 55%, rgba(4,8,18,0) 78%); }
.ov-title.card small { display: block; margin-bottom: 18px; font: 400 11px/1 var(--f-mono, ui-monospace, monospace); letter-spacing: .34em; margin-right: -.34em; text-transform: uppercase; color: #ffcf8a; text-shadow: 0 1px 12px rgba(0,0,0,.6); }
.ov-title.card b { margin-right: -.16em; font: 200 clamp(38px, 7.4vw, 96px)/.96 var(--f-display, system-ui); letter-spacing: inherit; text-transform: uppercase; color: #f4efe6; text-shadow: 0 2px 30px rgba(0,0,0,.4), 0 0 60px rgba(120,150,255,.26); }
.ov-title.card em { display: block; margin-top: 20px; margin-right: -.5em; font: 500 18px/1 var(--f-jp, serif); font-style: normal; letter-spacing: .5em; color: #ffcf8a; text-shadow: 0 1px 12px rgba(0,0,0,.8); }
.ov-title.card i { margin-top: 16px; margin-right: -.24em; font-size: 11px; color: rgba(244,239,230,.86); text-shadow: 0 1px 10px rgba(0,0,0,.8); }
.ov-marks { position: absolute; inset: 0; }
.ov-mark { position: absolute; left: 0; top: 0; opacity: 0; white-space: nowrap; will-change: transform, opacity; }
.ov-mark::before { content: ""; position: absolute; left: -3px; top: -3px; width: 6px; height: 6px; border-radius: 50%; background: #ffcf8a; box-shadow: 0 0 0 1px rgba(4,8,18,.45), 0 0 12px 2px rgba(255,207,138,.55); }
.ov-mark::after { content: ""; position: absolute; left: -.5px; bottom: 6px; width: 1px; height: var(--stem, 46px); background: linear-gradient(rgba(255,207,138,.85), rgba(255,207,138,.15)); }
.ov-mark div { position: absolute; left: -1px; bottom: calc(var(--stem, 46px) + 6px); padding: 7px 12px 8px 11px; border-left: 1px solid rgba(255,207,138,.9); background: linear-gradient(90deg, rgba(4,8,18,.72), rgba(4,8,18,.5)); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); text-shadow: 0 1px 6px rgba(0,0,0,.6); }
.ov-mark small { display: block; font: 400 10px/1.3 var(--f-body, system-ui); letter-spacing: .16em; color: #ffcf8a; }
.ov-mark b { display: block; margin-top: 3px; font: 300 clamp(11.5px, 1.1vw, 13.5px)/1.2 var(--f-display, system-ui); letter-spacing: .2em; text-transform: uppercase; color: #f4efe6; }
.ov-mark i { display: block; margin-top: 3px; font: 400 10px/1.2 var(--f-mono, ui-monospace, monospace); font-style: normal; letter-spacing: .18em; color: rgba(244,239,230,.78); }
.ov-mark.l div { left: auto; right: -1px; padding: 7px 11px 8px 12px; border-left: 0; border-right: 1px solid rgba(255,207,138,.9); background: linear-gradient(270deg, rgba(4,8,18,.72), rgba(4,8,18,.5)); text-align: right; }
@media (max-width: 640px) { .ov-mark b { font-size: 10.5px; letter-spacing: .16em; } .ov-mark small, .ov-mark i { font-size: 9px; } .ov-mark { --stem: 30px; }
  .ov-title.card { top: 24%; padding: 34px 16px 36px; background: radial-gradient(ellipse 70% 50% at 50% 50%, rgba(4,8,18,.5), rgba(4,8,18,.2) 60%, rgba(4,8,18,0) 82%); }
  .ov-title.card b { font-size: clamp(34px, 11vw, 52px); line-height: 1.04; } .ov-title.card em { margin-top: 16px; font-size: 16px; } .ov-title.card small, .ov-title.card i { font-size: 9.5px; letter-spacing: .26em; } }
`;
    let layer = null, black = null, titleEl = null, capEl = null, skipEl = null, marksEl = null;
    // a title's or a caption's {tokens}: what the game fills in at the moment (ctx.fill: the walk's hour, date and sky)
    const fill = txt => String(txt).replace(/\{(\w+)\}/g, (a, k) => { const v = ctx.fill && ctx.fill(k); return v == null ? a : v; });
    function overlay() {
      document.head.appendChild(css);
      layer = document.createElement('div'); layer.className = 'ov-layer'; layer.setAttribute('aria-live', 'polite');
      black = document.createElement('div'); black.className = 'ov-black';
      titleEl = document.createElement('div'); titleEl.className = 'ov-title';
      const t = spec.title || {}, f = scene.frame || {};
      const lat = f.lat0 != null ? `${Math.abs(f.lat0).toFixed(3)}°${f.lat0 >= 0 ? 'N' : 'S'}  ${Math.abs(f.lon0).toFixed(3)}°${f.lon0 >= 0 ? 'E' : 'W'}` : '';
      if (t.style === 'card') { // (the story's own title card, as the title screen sets it: an amber eyebrow, the name in the display face, its own script under it, a mono line)
        titleEl.classList.add('card');
        titleEl.innerHTML = `${t.eyebrow ? `<small>${fill(t.eyebrow)}</small>` : ''}<b>${t.name}</b>${t.jp ? `<em lang="ja">${t.jp}</em>` : ''}${t.line ? `<i>${fill(t.line)}</i>` : ''}`;
      } else titleEl.innerHTML = `<b>${t.name || ctx.CITY.native || ctx.CITY.name}</b><span>${t.reading || ctx.CITY.name}</span><i>${t.line || lat}</i>`;
      capEl = document.createElement('div'); capEl.className = 'ov-cap';
      skipEl = document.createElement('button'); skipEl.className = 'ov-skip'; skipEl.type = 'button';
      skipEl.textContent = matchMedia('(pointer: coarse)').matches ? 'Tap to skip' : (ctx.G.overture || {}).skip_keys || 'Any key to skip'; // (a story's flight: only the keys that skip it)
      skipEl.addEventListener('click', e => { e.stopPropagation(); skip(); });
      // the places named as the camera passes over them (spec.marks): a point on the place, a stem, its name
      marksEl = document.createElement('div'); marksEl.className = 'ov-marks';
      for (const m of marks) {
        m.el = document.createElement('div'); m.el.className = 'ov-mark';
        m.el.innerHTML = `<div>${m.jp ? `<small lang="ja">${m.jp}</small>` : ''}<b>${m.name}</b>${m.sub ? `<i>${m.sub}</i>` : ''}</div>`;
        if (m.stem) m.el.style.setProperty('--stem', `${m.stem}px`);
        marksEl.appendChild(m.el);
      }
      layer.append(black, marksEl, titleEl, capEl, skipEl);
      ctx.stage.appendChild(layer);
    }
    // the type is drawn from the overture's own clock, not by CSS transitions, so a film of it
    // (tools/overture_film.js, frame by frame) shows the same fades as the game
    let capFor = null;
    const E = EASE.smooth, O = EASE.out;
    function type(s, k, t) {
      // the black: up at the head of a shot with fadeIn, down at the tail of one with fadeOut
      let f = 1;
      if (s.fadeIn) f = Math.min(f, EASE.smooth(clamp((t - s.t0) / s.fadeIn)));
      if (s.fadeOut) f = Math.min(f, EASE.smooth(clamp((s.t0 + s.dur - t) / s.fadeOut)));
      black.style.opacity = String(1 - f);
      // the title: out of a blur, its letters closing up slowly; then gone in a breath
      const ti = s.title;
      if (ti) {
        const a = (k - (ti.at || 0)) * s.dur, z = (k - (ti.until ?? 1)) * s.dur;
        const op = a < 0 ? 0 : E(clamp(a / 1.6)) * (1 - E(clamp(z / 1.1)));
        titleEl.style.opacity = op.toFixed(3);
        titleEl.style.filter = `blur(${(14 * (1 - O(clamp(a / 2.2))) + 8 * E(clamp(z / 1.1))).toFixed(2)}px)`;
        titleEl.style.letterSpacing = `${(0.22 + 0.3 * (1 - O(clamp(a / 7)))).toFixed(3)}em`;
      } else titleEl.style.opacity = '0';
      const c = s.caption;
      if (c && capFor !== s) { capEl.innerHTML = `${c.eyebrow ? `<small>${fill(c.eyebrow)}</small>` : ''}${fill(c.text)}`; capFor = s; }
      if (c) {
        const a = (k - (c.at || 0)) * s.dur, z = (k - (c.until ?? 0.9)) * s.dur;
        capEl.style.opacity = (a < 0 ? 0 : E(clamp(a / 1.0)) * (1 - E(clamp(z / 0.8)))).toFixed(3);
        capEl.style.transform = `translateY(${(6 * (1 - O(clamp(a / 1.4)))).toFixed(2)}px)`;
      } else capEl.style.opacity = '0';
      skipEl.style.opacity = (E(clamp((t - 1.2) / 0.8)) * (1 - E(clamp((t - total + 4) / 0.8)))).toFixed(3);
      if (marks.length) placeMarks();
    }
    // each name where its place is in this frame's picture: projected through the pose this frame has just been given (the
    // camera itself takes it after), at the lens the page will draw it at (lensFor), faded in and out over its seconds
    const mf = new V3(), mr = new V3(), mu = new V3(), md = new V3(), UP = new V3(0, 1, 0);
    function placeMarks() {
      const wv = ctx.stage.clientWidth || innerWidth, hv = ctx.stage.clientHeight || innerHeight, ty = Math.tan(lensFor(fov) * RAD / 2), tx = ty * wv / hv;
      mf.copy(pose.look).sub(pose.pos).normalize(); mr.crossVectors(mf, UP).normalize(); mu.crossVectors(mr, mf);
      for (const m of marks) {
        const [a, b] = m.t || [0, total], op = E(clamp((t - a) / 0.9)) * (1 - E(clamp((t - b + 0.9) / 0.9)));
        md.copy(W(...m._at)).sub(pose.pos);
        const z = md.dot(mf), x = md.dot(mr) / (z * tx), y = md.dot(mu) / (z * ty);
        const on = op > 0.002 && z > 1 && Math.abs(x) < 0.92 && y > -0.92 && y < 0.7; // (room above it for its name)
        m.el.style.opacity = on ? (op * clamp((0.92 - Math.abs(x)) / 0.12) * clamp((0.7 - y) / 0.12)).toFixed(3) : '0';
        if (on) { m.el.style.transform = `translate(${((x + 1) / 2 * wv).toFixed(1)}px, ${((1 - y) / 2 * hv).toFixed(1)}px)`; if (m.side !== x > 0.3) { m.side = x > 0.3; m.el.classList.toggle('l', m.side); } } // (its name to the left of it in the frame's right part, never off the edge)
      }
    }

    // ------------------------------------------------------------ the score (film-score.js, rendered offline and played)
    let audio = null, scoreBuf = null, scoreSrc = null, scoreFor = null;
    function loadScript(src) {
      return new Promise((ok, no) => { if (window.OEFilmScore) return ok(); const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = no; document.head.appendChild(el); });
    }
    function scorePlan() {
      const sc = Object.assign({}, spec.score || {});
      const at = (id, k) => { const s = shots.find(q => q.id === id); return s ? s.t0 + (k || 0) * s.dur : 0; };
      return Object.assign(sc, { duration: total, cuts: shots.map(s => s.t0).filter(x => x > 0),
        title: at(sc.title_shot, sc.title_at), finale: at(sc.finale_shot, sc.finale_at), hush: sc.hush_shot ? [at(sc.hush_shot, sc.hush_at[0]), at(sc.hush_shot, sc.hush_at[1])] : null });
    }
    async function prepareScore() {
      const v = pick();
      if ((scoreBuf && scoreFor === v) || !spec.score) return scoreBuf;
      try {
        await loadScript('film-score.js');
        // at 24 kHz (a piano and soft sines: nothing above 12 kHz to keep), straight into one AudioBuffer and the
        // render's own arrays dropped, so a 45 s score holds about 8 MB rather than 33, and only while it plays
        const RATE = 24000, chs = await OEFilmScore.render(scorePlan(), RATE);
        let buf = chs;
        if (window.AudioBuffer) try { buf = new AudioBuffer({ length: chs[0].length, numberOfChannels: 2, sampleRate: RATE }); buf.copyToChannel(chs[0], 0); buf.copyToChannel(chs[1], 1); } catch (e) { buf = chs; }
        if (v === variant) { scoreBuf = buf; scoreFor = v; } // (not if the hour changed to the other overture meanwhile)
      } catch (e) { console.warn('overture: no score', e); }
      return scoreBuf;
    }
    function startScore(offset = 0) {
      if (!scoreBuf || (window.OEAudio && OEAudio.muted)) return;
      try {
        // on the game's own context and its music bus (docs/SOUND.md): a second context made here, after the touch that
        // started the game's, is one a phone (iOS) leaves suspended, and it was outside the Sound switch and the duck
        const A = window.OEAudio, AC = window.AudioContext || window.webkitAudioContext, bus = A && A.ctx && A.musicBus();
        if (A && !bus) return; // (the game's sound not made yet: on iOS it is made in a touch, and a context made here would not be)
        audio = bus ? A.ctx : audio || new AC();
        let b = scoreBuf;
        if (Array.isArray(b)) { b = audio.createBuffer(2, scoreBuf[0].length, 24000); b.copyToChannel(scoreBuf[0], 0); b.copyToChannel(scoreBuf[1], 1); }
        // (the bus goes out at main's 0.55: the same level as before. Begun a little after now, up in 40 ms: joined late,
        // where the picture is, it came in part way through a note, in one sample)
        const g = audio.createGain(), lv = bus ? 0.8 / 0.55 : 0.8, at = audio.currentTime + 0.012; g.connect(bus || audio.destination);
        g.gain.value = 0; g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(lv, at + 0.04);
        scoreSrc = audio.createBufferSource(); scoreSrc.buffer = b; scoreSrc.connect(g); scoreSrc.start(at, offset);
        scoreSrc.gainNode = g;
      } catch (e) { scoreSrc = null; }
    }
    function fadeScore(sec = 2.5) {
      if (!scoreSrc || !audio) return;
      const g = scoreSrc.gainNode.gain, n = audio.currentTime;
      g.cancelScheduledValues(n); g.setValueAtTime(g.value, n); g.linearRampToValueAtTime(0, n + sec);
      const s = scoreSrc; setTimeout(() => { try { s.stop(); s.disconnect(); } catch (e) { /* stopped */ } }, sec * 1000 + 100);
      scoreSrc = null;
      scoreBuf = null; scoreFor = null; // (played: its memory goes back; "Play the opening" renders it again, about a second)
    }

    // ------------------------------------------------------------ the signal the cues change, and the crowd
    let J = null;
    function junction() {
      if (J !== null) return J;
      const p = spec.signal ? point(spec.signal) : null, all = (ctx.junctions && ctx.junctions.J) || [];
      J = p ? all.filter(j => j.sig).map(j => [j, Math.hypot(j.x - p[0], j.y - p[1])]).filter(a => a[1] < 30).sort((a, b) => a[1] - b[1]).map(a => a[0])[0] || false : false;
      return J;
    }
    // the cues: 'red' holds every arm at red until the 'green' cue's moment and gathers the crowd at the kerbs
    // (the game's own walkIn, as its opening shot does); 'green' lets them all go at once
    const greenAt = () => { for (const q of shots) for (const [ck, name] of q.cues || []) if (name === 'green') return q.t0 + ck * q.dur; return null; };
    function signal(name) {
      const j = junction();
      if (!j) return;
      if (ctx.walkIn && j.scramble) {
        if (name === 'red') { const g = greenAt(); ctx.walkIn(j, g != null ? Math.max(0.1, g - t) : 0.1); }
        if (name === 'green' && !(j.ph === 3 && j.st === 'g')) ctx.walkIn(j, -0.01);
        return;
      }
      if (name === 'red') { j.ph = 0; j.st = 'g'; j.t = 0; j.nxt = 1; } // the traffic's turn: the walkers wait at the kerbs
      if (name === 'green') {
        if (j.scramble) { j.ph = 3; j.st = 'g'; j.t = 0; j.nxt = 0; } // every crossing at once, the diagonals too
        else { j.ph = 1; j.st = 'g'; j.t = 0; j.nxt = 0; }
      }
    }
    // the crowd on the footways round a point, as if they had been walking there all along
    function crowdAround(c, r) {
      const C = ctx.crowd;
      if (C.respawn) { // (the crowd's own placing: on its footways, clear of the walls, the cars, the benches and the major roads)
        // the crowd the game walks round you already stays as it is; a few of them (crowd_near_max, 24) are brought
        // within 25 m of your end spot (a whole pool placed round you, a third of it that close, and left there after
        // the overture, was a crowd walking through itself and out across the roads)
        const net = ctx.crowdNet, tmp = {}, nClose = Math.min(Math.round(C.active * (spec.crowd_near ?? 0.35)), spec.crowd_near_max ?? 24);
        for (let i = 0; i < nClose; i++) {
          const p = C.P[i];
          for (let k = 0; k < (net ? 6 : 1); k++) {
            C.respawn(p, endAt[0], endAt[1], 1.6);
            if (p.line < 0 || !net) break;
            net.at(p.line, p.s, tmp);
            if (Math.hypot(tmp.x - endAt[0], tmp.y - endAt[1]) < 25) break;
          }
        }
        return;
      }
      C.active = C.P.length;
      const nClose = Math.round(C.P.length * (spec.crowd_near ?? 0.35));
      const net = ctx.crowdNet || ctx.footNet, cand = net.near(c[0], c[1], 0, r), tmp = {};
      if (!cand.length) return;
      let seed = 97;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const close = net.near(endAt[0], endAt[1], 0, 28);
      C.P.forEach((p, i) => {
        const pool = i < nClose && close.length ? close : cand;
        if (p.seat) { p.seat.by = -1; p.seat = null; }
        p.state = 'walk'; p.mode = 'ground'; p.lat = null; p.pause = 0; p.dodge = 0;
        for (let tries = 0; tries < 24; tries++) { // (near you: on the part of the footway within 25 m, not just a footway that comes that close)
          p.line = pool[Math.floor(rnd() * pool.length)]; p.s = rnd() * net.L[p.line].len; net.at(p.line, p.s, tmp);
          const d = Math.hypot(tmp.x - endAt[0], tmp.y - endAt[1]);
          if (d > 1.6 && (pool !== close || d < 25)) break;
        }
        p.dir = rnd() < 0.5 ? 1 : -1; p.x = tmp.x; p.y = tmp.y; p.z = tmp.z;
      });
    }

    // ------------------------------------------------------------ playing
    let active = false, onDone = null, t = 0, fired = new Set(), wasFrozen = false, clock0 = 0, settling = false, lapsed = 0, levelHeld = null;
    function frameFn(kAll) {
      t = kAll * total;
      const s = shotAt(t);
      // the camera does not come down to the player before the level they stand in is drawn (game.js holdForLevel, issue 62):
      // the film held where the land shot begins while it is not, for at most ctx.levelWait seconds
      if (s.type === 'land' && ctx.levelReady && !settling) {
        if (levelHeld == null) levelHeld = ctx.levelReady() ? -1 : performance.now();
        if (levelHeld > 0) {
          if (!ctx.levelReady() && performance.now() - levelHeld < (ctx.levelWait || 6) * 1000) { ctx.cine.seek(s.t0 / total); t = s.t0; }
          else { console.info(`the walk film waited ${((performance.now() - levelHeld) / 1000).toFixed(1)} s for the level`); levelHeld = -1; }
        }
      }
      const k = clamp((t - s.t0) / s.dur);
      if (s !== lastShot) { // a cut: the land shot starts where the shot before it ends
        const i = shots.indexOf(s);
        if (i > 0) { tan.set(0, 0, -1); shotPose(shots[i - 1], 1); from = { pos: pose.pos.clone(), look: pose.look.clone() }; }
        lastShot = s;
        tan.set(0, 0, -1);
      }
      // the clock: a time-lapse through the shots that ask for one
      let lap = 0;
      for (const q of shots) lap += (q.lapse || 0) * clamp((t - q.t0) / q.dur);
      if (Math.abs(lap - lapsed) > 0.05) { lapsed = lap; ctx.setClock(ctx.clock.y, ctx.clock.m, ctx.clock.d, clock0 + lap); }
      for (const q of shots) for (const [ck, name] of q.cues || []) { const id = `${q.id}:${ck}:${name}`; if (t >= q.t0 + ck * q.dur && !fired.has(id)) { fired.add(id); signal(name); } }
      const g = shotPose(s, k);
      if (ctx.guideAt) ctx.guideAt(g, s, k); // (a film whose guide is a thing of the game's: a helicopter the camera flies with)
      // the guide: placed and turning, lit from behind when the sun is low (its edge glows)
      if (hero || glow) {
        const show = !!g && !K.none && !ctx.guideAt && !(s.type === 'land' && k > 0.93); // (a film whose guide is a thing of the game's: that thing, not a glow on it)
        const gp = g || gprev;
        if (hero) {
          hero.visible = show;
          hero.position.copy(gp);
          const sp = K.spin, tt = t;
          hero.rotation.set(Math.sin(tt * sp * 0.5) * 1.1 + 0.4, tt * sp * 0.37, Math.cos(tt * sp * 0.43) * 0.9);
          const sun = ctx.sun && ctx.sun();
          hero.material.emissiveIntensity = 0.25 + 0.55 * clamp(1 - (sun ? sun.altitude : 30) / 25) + 0.4 * (ctx.U ? ctx.U.uNight.value : 0);
        }
        glow.visible = show;
        glow.position.copy(gp);
        const camD = pose.pos.distanceTo(gp);
        glow.material.opacity = (kind === 'mote' ? 0.9 : 0.22 + 0.5 * clamp((camD - 4) / 30)) * (s.type === 'land' ? clamp((0.93 - k) / 0.1) : 1);
        glow.scale.setScalar(K.size * (kind === 'mote' ? 5 : 3.2) * Math.max(1, camD / 12));
        if (K.far) { // a meteor: the same size on screen however far, bright in the middle of its run, its tail behind it
          const a0 = s.gFrom ?? 0, a1 = s.gTo ?? 1, u = clamp((k - a0) / Math.max(1e-3, a1 - a0)), life = Math.sin(Math.PI * u);
          const px = d => d * Math.tan(fov * RAD / 2) * 2 / 900; // (metres a pixel at d, on 900 lines)
          glow.material.opacity = 0.95 * Math.pow(life, 0.6);
          glow.scale.setScalar(px(camD) * 15 * K.size / 2.2); // (a small head: a large one reads as a moon)
          const n = tail.length, len = (s.tailLen ?? 0.32) * (a1 - a0);
          glow.material.opacity *= 0.85 + 0.15 * Math.sin(t * 47.0) * Math.sin(t * 31.0); // (its head flickers as it burns)
          tail.forEach((sp, i) => {
            const q = guideAt(s, k - len * (i + 1) / n, tmpB);
            sp.visible = !!q && show;
            if (!sp.visible) return;
            sp.position.copy(q);
            const f = 1 - (i + 1) / n, d = pose.pos.distanceTo(q);
            sp.material.opacity = 0.5 * Math.pow(f, 1.6) * Math.pow(life, 0.6);
            sp.scale.setScalar(Math.max(px(d) * (2.5 + 9 * f * f), 2.2 * q.distanceTo(i ? tail[i - 1].position : gp))); // (never smaller than the gap to the one before it: a line, not a row of dots)
          });
        }
        if (g) gprev.copy(g);
      }
      // the land shot hands over to the chase camera in its last fifth
      if (s.type === 'land') {
        const w = ctx.handOver(k, 0.7);
        pose.pos.lerp(ctx.live.pos, w); pose.look.lerp(ctx.live.look, w);
      }
      type(s, k, t);
      return pose;
    }
    // the look: the overture's grade (warmer, richer, a touch brighter) eased in at the head and out as it
    // lands, and the title's flare where the sun is in shot and not behind a building
    const sunV = new V3();
    function look(s, k) {
      const lens = ctx.atmos && ctx.atmos.lens;
      if (!lens) return;
      const gr = spec.grade || {}, w = EASE.smooth(clamp(t / 1.5)) * (s.type === 'land' ? 1 - EASE.smooth(clamp((k - 0.55) / 0.45)) : 1);
      const tint = gr.tint || [1, 1, 1];
      // (on top of the hour's own grade, which atmosphere.js applies each frame)
      lens.trim = { ev: lerp(1, gr.ev ?? 1, w), sat: lerp(1, gr.sat ?? 1, w), tint: [lerp(1, tint[0], w), lerp(1, tint[1], w), lerp(1, tint[2], w)], skySat: lerp(1, gr.sky_sat ?? 1, w), stars: lerp(1, gr.stars ?? 1, w), bloom: lerp(1, gr.bloom ?? 1, w) };
      if (ctx.Wd && ctx.Wd.su) ctx.Wd.su.cloudTrim = (gr.clouds || 0) * w; // (more cloud, for the sun to light: weather.js)
      // a night sky with depth: a glow along the horizon under a deep blue (world.js's night sky, while the overture plays)
      const su = ctx.Wd && ctx.Wd.su;
      if (su && su.uNightZenith && gr.night_sky) {
        if (!skyWas) skyWas = [su.uNightZenith.value.clone(), su.uNightHorizon.value.clone()];
        su.uNightZenith.value.copy(skyWas[0]).lerp(skyCol.setRGB(...gr.night_sky[0]), w);
        su.uNightHorizon.value.copy(skyWas[1]).lerp(skyCol.setRGB(...gr.night_sky[1]), w);
      }
      const sp = ctx.sun && ctx.sun(), L = lens.uniforms;
      if (!sp || !L.uSunVis || !window.OELens) return;
      const alt = sp.altitude * RAD, az = sp.azimuth * RAD;
      sunV.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
      const cam = ctx.camera;
      cam.updateMatrixWorld();
      const on = OELens.sunOnScreen(cam, sunV);
      let vis = 0;
      if (on.front && sp.altitude > -1 && on.u > -0.1 && on.u < 1.1 && on.v > -0.1 && on.v < 1.1 && ctx.DSM && window.Sun) {
        vis = Sun.sunlit(ctx.DSM, cam.position.x, -cam.position.z, cam.position.y, sp) ? clamp((sp.altitude + 1) / 3) : 0;
      }
      flareVis += ((vis * (gr.flare ?? 1) * w) - flareVis) * 0.15; // (eased, so a lamp post crossing the sun does not flicker it)
      L.uSunUv.value.set(on.u, on.v);
      L.uSunVis.value = flareVis;
      // the animated film's lens (atmosphere.js anime): painted, graded, rays from the sun; lighter on a weaker tier
      const an = spec.anime || {}, rad = { high: 3, medium: 2 }[tier] || 0;
      if (ctx.atmos.anime && rad) ctx.atmos.anime({ k: (an.paint ?? 0.85) * w, radius: rad, grade: (an.grade ?? 1) * w, rays: (an.rays ?? 1) * w, sunVis: flareVis, sunUv: sunUv.set(on.u, on.v),
        haze: (an.haze || 0) * w, hazeD: an.haze_m, hazeC: an.haze_rgb, rim: (an.rim || 0) * w, rimC: an.rim_rgb, streak: (an.streak || 0) * w });
      // depth of field on the guide when it is near the lens (the camera's own effect, atmosphere.js camFx), not on a weak tier
      // focus: on the guide when it is near the lens, or on the shot's own point (a statue), a wide aperture
      const gd = s._focus ? cam.position.distanceTo(W(...s._focus)) : (hero ? hero.visible : glow && glow.visible) ? cam.position.distanceTo(gprev) : 999, fstop = s.fstop ?? 2.8;
      if (tier !== 'low' && gd < (s.focusFar ?? (s._focus ? 60 : 9))) {
        const f = 0.012 / Math.tan(cam.fov * RAD / 2);
        fx = { focus: gd, aperture: f * f / (fstop * Math.max(0.05, gd - f)) / 0.024, blur: 0.25 };
      } else fx = null;
      if (L.uFlareTint) L.uFlareTint.value.setRGB(1, 0.62 + 0.25 * clamp(sp.altitude / 20), 0.42 + 0.4 * clamp(sp.altitude / 25));
    }
    let flareVis = 0, fx = null, skyWas = null;
    const skyCol = new THREE.Color();
    const sunUv = new THREE.Vector2();
    function unlook() {
      fx = null;
      if (ctx.atmos && ctx.atmos.anime) ctx.atmos.anime(null);
      if (ctx.Wd && ctx.Wd.su) ctx.Wd.su.cloudTrim = 0;
      if (skyWas && ctx.Wd && ctx.Wd.su) { ctx.Wd.su.uNightZenith.value.copy(skyWas[0]); ctx.Wd.su.uNightHorizon.value.copy(skyWas[1]); skyWas = null; }
      const lens = ctx.atmos && ctx.atmos.lens;
      if (!lens) return;
      lens.trim = null;
      if (lens.uniforms.uSunVis) lens.uniforms.uSunVis.value = 0;
      flareVis = 0;
    }
    const dObj = new THREE.Object3D(), dCol = new V3();
    function update(dt) { // the air round the camera, and the look, each frame
      if (!active || !drift) return;
      const s = shotAt(t), k = clamp((t - s.t0) / s.dur);
      look(s, k);
      if (sky) { sky.material.uniforms.uTime.value = t; sky.material.uniforms.uK.value = EASE.smooth(clamp(t / 1.2)); }
      if (shower.length && s.shower !== 0) {
        // now and then a smaller meteor, somewhere in the sky ahead, falling across it for a second
        const cam = ctx.camera, fwd = cam.getWorldDirection(dCol).setY(0).normalize();
        if (t > nextStar) {
          const m = shower.find(q => t - q.t0 > q.life);
          if (m) {
            const rnd = Math.random, right = new V3(-fwd.z, 0, fwd.x), D = 1800;
            m.a.copy(cam.position).addScaledVector(fwd, D).addScaledVector(right, (rnd() - 0.5) * D * 1.2);
            m.a.y = cam.position.y + D * (0.28 + rnd() * 0.32);
            m.v.copy(right).multiplyScalar((rnd() < 0.5 ? -1 : 1) * (380 + rnd() * 260)); m.v.y = -(140 + rnd() * 160);
            m.t0 = t; m.life = 0.6 + rnd() * 0.7;
          }
          nextStar = t + (spec.shower ?? 1.2) * (0.5 + Math.random());
        }
        for (const m of shower) {
          const u = (t - m.t0) / m.life, on = u >= 0 && u <= 1, life = on ? Math.sin(Math.PI * u) : 0;
          m.parts.forEach((sp, j) => {
            sp.visible = on;
            if (!on) return;
            sp.position.copy(m.a).addScaledVector(m.v, (t - m.t0) - j * 0.008);
            const dd = cam.position.distanceTo(sp.position), px = dd * Math.tan(fov * RAD / 2) * 2 / 900, f = 1 - j / 12;
            sp.scale.setScalar(px * (j ? 3 + 7 * f : 12)); sp.material.opacity = (j ? 0.55 * f * f : 0.9) * life;
          });
        }
      }
      const dens = ch(s.drift ?? 0.5, k, EASE.smooth) * (s.type === 'land' ? 1 - EASE.smooth(clamp((k - 0.6) / 0.4)) : 1);
      const n = K.none ? 0 : Math.round(NDRIFT * clamp(dens));
      drift.count = n;
      const cam = ctx.camera.position, wind = dCol.set(0.9, 0, -0.5);
      for (let i = 0; i < n; i++) {
        const d = driftData[i];
        d.p.x += (wind.x * d.w + Math.sin(t * 0.7 + d.ph) * 0.3) * dt;
        d.p.z += (wind.z * d.w + Math.cos(t * 0.6 + d.ph) * 0.3) * dt;
        d.p.y -= K.fall * d.s * dt;
        // wrap round the camera, so the air is always full
        const h = BOX / 2, hy = BOX * 0.3;
        let x = d.p.x - cam.x, y = d.p.y - cam.y, z = d.p.z - cam.z;
        x = ((x + h) % BOX + BOX) % BOX - h; y = ((y + hy) % (2 * hy) + 2 * hy) % (2 * hy) - hy; z = ((z + h) % BOX + BOX) % BOX - h;
        d.p.set(cam.x + x, cam.y + y, cam.z + z);
        dObj.position.copy(d.p);
        dObj.quaternion.setFromAxisAngle(d.ax, t * K.spin * 0.5 * d.s + d.ph);
        if (kind === 'mote') dObj.quaternion.copy(ctx.camera.quaternion);
        dObj.scale.setScalar(K.size * d.s * (kind === 'mote' ? 2.2 : 1));
        dObj.updateMatrix();
        drift.setMatrixAt(i, dObj.matrix);
      }
      drift.instanceMatrix.needsUpdate = true;
    }
    // the stage for it: streets wet from a shower that has passed, under a clear sky (spec.wet: 0..1, not on the low tier;
    // the weather goes back to what it was afterwards and the streets dry as they would), and the map's light show
    // on whatever the hour (spec.show)
    let wetWas = null, showWas = false;
    function stageSet() {
      const we = ctx.weather;
      if (spec.wet && we && we.set && tier !== 'low') {
        const st = we.state || {};
        wetWas = st.mode || 'live';
        we.set({ rain: 0, cloud: spec.wet_cloud ?? 0.08, wet: spec.wet, fog: 0 }, { now: true });
      }
      if (spec.show && ctx.show && ctx.show.force) { showWas = true; ctx.show.force(true, ctx.clock.min); }
    }
    function stageUnset() {
      if (wetWas != null && ctx.weather) { ctx.weather.set(wetWas === 'custom' ? 'live' : wetWas); wetWas = null; }
      if (showWas && ctx.show) { ctx.show.force(false, ctx.clock.min); showWas = false; }
    }
    // returns false (and leaves everything as it was) if the spec does not fit the map: a landmark it
    // names is missing after a rebuild, say; the game then plays its plain crane instead
    function play(done) {
      pick();
      if (variant === 'day' && base.day === false) return false; // (a map whose day overture is not ready yet: the plain crane)
      try { placeEnd(); resolve(); } catch (e) { console.warn(String(e)); return false; }
      onDone = done;
      active = true; settling = false; fired = new Set(); lastShot = null; from = null; lapsed = 0; levelHeld = null;
      if (group && builtFor !== buildKey()) dispose(); // (built ahead for another hour or season)
      if (!group) build();
      group.visible = true; if (sky) sky.visible = true;
      overlay();
      ctx.stage.classList.add('letterbox', 'overture');
      wasFrozen = ctx.clock.frozen; ctx.clock.frozen = true; clock0 = ctx.clock.min;
      stageSet();
      const c = spec.crowd_at ? point(spec.crowd_at) : endAt;
      crowdAround(c, spec.crowd_r || 120);
      if (scoreBuf) startScore(0); else prepareScore().then(() => { if (active && !settling) startScore(t); }); // (late: joined where the picture is)
      ctx.cine.play(frameFn, total, { label: 'overture', onEnd: () => { if (!settling) finish(false); } }); // (a skip's ease ends this shot as it starts: not the end)
      markSeen(ctx.CITY.id);
      return true;
    }
    // a key or a tap: ease from where the camera is to over the player's shoulder, quickly but not a cut
    function skip() {
      if (!active || settling) return;
      settling = true;
      fadeScore(1.2);
      for (const q of shots) for (const [, name] of q.cues || []) if (name === 'green') signal('green');
      const a = { pos: ctx.camera.position.clone(), look: ctx.camera.getWorldDirection(new V3()).multiplyScalar(20).add(ctx.camera.position) };
      if (black) black.style.opacity = '0';
      if (titleEl) titleEl.style.opacity = '0';
      if (capEl) capEl.style.opacity = '0';
      if (drift) drift.count = 0;
      if (hero) hero.visible = false;
      if (glow) glow.visible = false;
      // the level the player stands in not drawn yet (a phone, a skip in the first seconds): the shot held behind the game's
      // veil until it is, and then the camera at the player's shoulder at once, under it (game.js holdForLevel, issue 62)
      if (ctx.holdForLevel && ctx.holdForLevel(() => ctx.cine.play(() => ctx.live, 0, { label: 'crane', onEnd: () => finish(true) }))) { ctx.cine.play(() => a, 60, { label: 'crane' }); return; }
      ctx.cine.play(OECine.mix(() => a, () => ctx.live, k => OECine.ease.smooth(k)), ctx.reduced ? 0 : 0.9, { label: 'crane', onEnd: () => finish(true) });
    }
    function finish(skipped) {
      if (!active) return;
      active = false;
      if (ctx.guideAt) ctx.guideAt(null);
      stageUnset();
      if (!skipped) fadeScore(3);
      ctx.clock.frozen = wasFrozen;
      unlook();
      ctx.stage.classList.remove('letterbox', 'overture');
      if (layer) { layer.style.transition = 'opacity .8s'; layer.style.opacity = '0'; const l = layer; setTimeout(() => l.remove(), 900); layer = null; }
      setTimeout(() => css.remove(), 1000);
      dispose();
      if (onDone) onDone(skipped);
    }
    return {
      play, skip, update, prepareScore, prewarm, scorePlan, point, get shots() { return shots; }, get total() { return total; }, get variant() { return variant; },
      get active() { return active; }, get walk() { return !!ctx.walk; }, get fov() { return lensFor(fov); }, get fx() { return active ? fx : null; }, get t() { return t; }, get kind() { return kind; }, get end() { return endAt.slice(); },
      // the guide's and the camera's path through each shot (for tools/overture_film.js's checks)
      sample(s, k) { const g = shotPose(s, k); return { pos: pose.pos.clone(), look: pose.look.clone(), guide: g ? g.clone() : null }; },
      // the guide's path through a shot at k (0..1), as the camera's frame has it, without touching the camera: where a thing
      // of the game's flown along it is, either side of now (game.js story ctx film: the helicopter's attitude)
      path: (s, k) => guideAt(s, clamp(k), new V3()),
      // (and the film's own path, at T seconds from its start: [x, y, z] in game coordinates, or null without one)
      pathAt: T => pathAt(T), get pathEnd() { return path ? path[path.length - 1].t : null; }, get hasPath() { return !!path; },
      setFrom(f) { from = f; },
    };
  }

  // should the overture play on this map: the first time here, or when asked (?overture=1)
  // (not in an automated browser unless asked: the checks and the stills tools click Play and expect the crane)
  function due(id) { return !/[?&]overture=0\b/.test(location.search) && (/[?&]overture=1\b/.test(location.search) || (!navigator.webdriver && !seen()[id])); }
  function forget(id) { try { const s = seen(); delete s[id]; localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ } }
  return { create, due, forget, KINDS, kindFor };
})();
