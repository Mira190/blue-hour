// People: realistic rigged characters (Quaternius's Ultimate Modular Men and Women, CC0)
// for the crowd near the player, plus an instanced low-detail copy of the same characters
// for the crowd further away. Each character is one skinned mesh whose vertices index a
// small palette, so skin, hair and clothes are recoloured per person: thirteen files make
// a varied crowd. pipeline/fetch_people.py builds the files in web/assets/people. The
// surveyors you play (H_) and the NPCs (R_) are textured Microsoft Rocketbox avatars
// (MIT, blender/build_people.py); the NPCs share one file of clips per sex.
'use strict';
window.OEPeople = (function () {
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
  const W = (x, y, z) => new THREE.Vector3(x, z, -y);
  const N = 24; // palette size in the shaders
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = a => a[Math.floor(rnd() * a.length)];
  // sRGB swatches for recolouring
  const SKIN = ['#f6d8c6', '#f0c7aa', '#e3b08d', '#d49c76', '#c18661', '#a8714f', '#8f5b3d', '#73482e', '#5a3622'];
  const HAIR = ['#141010', '#231915', '#33241b', '#4a3222', '#6a4529', '#8d6339', '#b48a52', '#cfae73', '#8c8580', '#cfcac4', '#6e2f1c'];
  const TOPS = ['#e9e6df', '#1f2328', '#2f5d8c', '#c94f3d', '#3d6b4a', '#d9a441', '#7a4e8f', '#5b7f99', '#b5654b', '#f2f0ea', '#355c7d', '#8c2f39', '#9aa3a8', '#d7c6a5', '#3c4a3e', '#e4b7b2'];
  const LEGS = ['#2b3440', '#1d1f24', '#4b5563', '#3a3026', '#6b7280', '#24384f', '#c7b89a', '#33415c', '#5c4b3b'];
  // how common each character is in a city crowd
  const WEIGHT = { M_Casual2: 3, M_Hoodie: 2, M_Suit: 2, M_Worker: 0.8, M_Beach: 1, M_Adventurer: 1, M_Punk: 0.4,
    W_Casual: 3, W_Formal: 1.5, W_Suit: 2, W_Worker: 0.8, W_Adventurer: 1, W_Punk: 0.4 };
  // named crowd styles (city.json game.crowd.style: "tokyo"): skin, hair and clothes palettes and
  // how common each character is. HAIR holds nine natural colours, then the greys and dyes that
  // 15% of people wear; a style's own hair list is drawn from as it is.
  const STYLES = {
    tokyo: {
      skin: ['#f6d8c6', '#f3cfb5', '#f0c7aa', '#efc6a8', '#e9bf9d', '#e9bf9d', '#e3b08d', '#d49c76', '#c18661', '#8f5b3d'],
      hair: ['#141010', '#141010', '#17120f', '#1b1512', '#1b1512', '#231915', '#231915', '#33241b', '#4a3222', '#8c8580', '#cfcac4', '#8d6339', '#b48a52'],
      // dark suits, navy school blazers, white shirts, beige trench coats: Tokyo dresses quietly
      tops: ['#1f2328', '#1f2328', '#1f2328', '#1d2b4a', '#1d2b4a', '#e9e6df', '#f2f0ea', '#2b2f3a', '#9aa3a8', '#d7c6a5', '#c9c6bd', '#355c7d', '#4a4f57', '#7a4e8f', '#c94f3d', '#e4b7b2'],
      legs: ['#1b1d22', '#1b1d22', '#1d1f24', '#2b3440', '#24384f', '#33415c', '#4b5563', '#c7b89a', '#3a3026'],
      weights: { M_Casual2: 2, M_Hoodie: 1.5, M_Suit: 4.5, M_Worker: 0.7, M_Beach: 0.2, M_Adventurer: 0.8, M_Punk: 0.15,
        W_Casual: 3, W_Formal: 2.5, W_Suit: 3.5, W_Worker: 0.6, W_Adventurer: 0.8, W_Punk: 0.15 },
    },
  };
  // Paris: navy, black, grey and camel, white shirts, trench coats and the odd marinière; a city of
  // many origins, so the widest range of skin
  STYLES.paris = {
    skin: ['#f6dccb', '#f1d1bb', '#ecc6aa', '#e3b592', '#d9a583', '#c68f6a', '#b07a55', '#8f5b3d', '#6e4430', '#4f3022'],
    hair: ['#141010', '#1b1512', '#2a1e17', '#3b2a20', '#4a3222', '#6a4529', '#8c6339', '#b48a52', '#c9b48a', '#8c8580', '#cfcac4'],
    tops: ['#1d2b4a', '#1d2b4a', '#141414', '#141414', '#3a3d42', '#6b6f75', '#c2a378', '#b8925e', '#f2efe8', '#e9e6df', '#7a2e33',
      '#2f4a3c', '#9aa3a8', '#d7c6a5', '#4a3a2c', '#5b6b7a'],
    legs: ['#1b1d22', '#1b1d22', '#23314a', '#2b3440', '#3a3d42', '#4b5563', '#c7b89a', '#5a4632', '#141414'],
    weights: { M_Casual2: 3, M_Hoodie: 1.2, M_Suit: 2.5, M_Worker: 0.6, M_Beach: 0.3, M_Adventurer: 1, M_Punk: 0.3,
      W_Casual: 3, W_Formal: 2.5, W_Suit: 2.2, W_Worker: 0.5, W_Adventurer: 1, W_Punk: 0.3 },
  };
  // Amsterdam: the tallest people in the world (a Dutch man averages 1.83 m), dressed for rain and a
  // bicycle: navy, black, grey and olive parkas, jeans, white trainers; the odd bunch of tulips
  STYLES.amsterdam = {
    skin: ['#f7dfcf', '#f3d6c2', '#efcbb1', '#e8bd9e', '#ddab88', '#c99470', '#b07a55', '#8f5b3d', '#6e4430', '#4f3022'],
    hair: ['#e3c58e', '#d4b27a', '#c9a46c', '#b48a52', '#8c6339', '#6a4529', '#4a3222', '#2a1e17', '#141010', '#cfcac4', '#8c8580'],
    tops: ['#1d2b4a', '#1d2b4a', '#141414', '#141414', '#3a3d42', '#56604a', '#6b6f75', '#2f4a3c', '#7a2e33', '#e9e6df', '#c2a378',
      '#f08a24', '#9aa3a8', '#4a5a6e', '#d7c6a5'],
    legs: ['#24384f', '#24384f', '#2b3440', '#1b1d22', '#33415c', '#141414', '#4b5563', '#3a3026'],
    scale: [0.97, 1.04],
    acc: { backpack: 0.18, tulips: 0.025 },
    weights: { M_Casual2: 3, M_Hoodie: 1.6, M_Suit: 1.6, M_Worker: 0.6, M_Beach: 0.2, M_Adventurer: 1.2, M_Punk: 0.2,
      W_Casual: 3, W_Formal: 1.6, W_Suit: 1.4, W_Worker: 0.5, W_Adventurer: 1.2, W_Punk: 0.2 },
  };
  // Japan carries the clear vinyl umbrellas sold at every konbini (some 80 million of the 130 million umbrellas the country
  // buys in a year, the Japan Umbrella Promotion Association's estimate), and black and navy ones. A photograph of the
  // Scramble in the rain is a field of clear canopies among dark ones: four in ten here. At one in ten the crowd's
  // umbrellas read as any city's, dark and opaque
  STYLES.tokyo.umbrellas = ['#1d1f26', '#1d1f26', '#1d1f26', '#22304a', '#2b4a6b', '#5b626c', 'clear', 'clear', 'clear', 'clear'];
  STYLES.kyoto = Object.assign({}, STYLES.tokyo, {
    tops: ['#1f2328', '#1f2328', '#1d2b4a', '#1d2b4a', '#e9e6df', '#f2f0ea', '#2b2f3a', '#9aa3a8', '#d7c6a5', '#46604f', '#8a2f39', '#5b6b7a', '#c9c2b5', '#7a4e8f'],
  });
  let STYLE = null;
  const styleOf = s => (typeof s === 'string' ? STYLES[s] || null : s || null);
  // the city's crowd style (a preset's name or a style object), for every look drawn without its own
  function setStyle(s) { STYLE = styleOf(s); }
  const CLS = { keep: 0, skin: 1, hair: 2, brows: 3, top: 4, legs: 5 };

  // ------------------------------------------------------------ local flavour: patterns and accessories
  // look.pattern paints the 'top' class with a procedural print, in the character's bind-pose space so it
  // stays on the body while it animates: leopard (tan with rosettes), tiger (yellow and black bands, a
  // Hanshin Tigers jersey), kuidaore (red and white bands), pinstripe, plaid. look.pattern2 overrides the
  // second colour. look.acc lists accessory ids, built from primitives and attached to bones.
  const PAT = { leopard: 1, tiger: 2, kuidaore: 3, pinstripe: 4, plaid: 5, mariniere: 6 };
  const PAT_GLSL = `
vec3 oePattern(vec3 base, vec3 p, float id, vec3 c2) {
  if (id < 0.5) return base;
  if (id < 1.5) {
    vec3 brown = c2.r < 0.0 ? vec3(0.13, 0.05, 0.012) : c2;
    float s = sin(p.x * 30.0 + p.y * 3.0) * sin(p.y * 30.0 + 1.7) * sin(p.z * 30.0 - 0.6);
    vec3 col = mix(base, vec3(0.012), smoothstep(0.07, 0.13, s));
    return mix(col, brown, smoothstep(0.26, 0.34, s));
  }
  if (id < 2.5) return mix(base, c2.r < 0.0 ? vec3(0.012) : c2, step(0.55, fract(p.y * 8.0)));
  if (id < 3.5) return mix(base, c2.r < 0.0 ? vec3(0.75) : c2, step(0.5, fract(p.y * 7.0)));
  if (id < 4.5) return mix(base, c2.r < 0.0 ? vec3(0.45) : c2, 0.8 * step(0.86, fract(p.x * 55.0)));
  if (id > 5.5) return mix(base, c2.r < 0.0 ? vec3(0.015, 0.024, 0.07) : c2, step(0.58, fract(p.y * 26.0))); // marinière: Breton stripes
  float a = step(0.78, fract(p.x * 28.0)), b = step(0.78, fract(p.y * 18.0));
  return base * (1.0 - 0.5 * a) * (1.0 - 0.5 * b) + (c2.r < 0.0 ? vec3(0.12, 0.02, 0.02) : c2) * a * b;
}`;
  const GEO = {}, MAT = {};
  const geo = (k, f) => GEO[k] || (GEO[k] = f());
  // 'clear': the vinyl of a convenience-store umbrella, a material of its own (issue 129). A thin clear film: looked
  // through square on it is nearly nothing (a faint milky haze), and it turns to a sheen where it curves away from the
  // eye (a film's Fresnel) and where it carries a light (the screens', the signs', a lamp's: the highlight is kept
  // whole, not thinned with the film). What makes it read as an umbrella is how it is made: the eight white ribs its
  // panels are welded along and the hem round its edge; and in the rain the drops beaded on it (uVinylWet, from the
  // crowd's setRain), which go as one wetness where a pixel spans several. Blended over the person under it, who is
  // drawn first and whole: nobody is see-through here but the vinyl
  const vinylWet = { value: 0 };
  function vinylMaterial() {
    const m = new THREE.MeshStandardMaterial({ color: 0xf2f6f8, roughness: 0.1, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => {
      sh.uniforms.uVinylWet = vinylWet;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vVinylUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVinylUv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uVinylWet; varying vec2 vVinylUv;
float vinylHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <opaque_fragment>', `{
  // the film: clear square on, a sheen at a glancing angle
  float vnF = pow(max(0.0, 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)))), 3.0);
  float vnA = mix(0.1, 0.62, vnF);
  // the ribs along the panels' seams and the hem: white tape, a centimetre wide (never thinner than a pixel is drawn)
  float vnU = vVinylUv.x * 8.0, vnW = max(fwidth(vnU), 1e-4), vnR = abs(fract(vnU + 0.5) - 0.5);
  float vnRib = (1.0 - smoothstep(0.012, 0.012 + vnW, vnR)) * min(1.0, 0.024 / vnW);
  float vnH = max(fwidth(vVinylUv.y), 1e-4);
  vnRib = max(vnRib, (1.0 - smoothstep(0.03, 0.03 + vnH, vVinylUv.y)) * min(1.0, 0.06 / vnH));
  vnA = mix(vnA, 0.85, vnRib * 0.8);
  // the rain beaded on it: a drop in each cell of the panel, somewhere in it and of its own size; one wetness far off
  vec2 vnP = vVinylUv * vec2(176.0, 16.0), vnC = floor(vnP);
  vec2 vnO = vec2(vinylHash(vnC), vinylHash(vnC + 17.0)) * 0.5 + 0.25;
  float vnD = length(fract(vnP) - vnO), vnS = 0.08 + 0.12 * vinylHash(vnC + 5.0), vnPx = max(fwidth(vnP.x), fwidth(vnP.y));
  float vnDrop = mix(1.0 - smoothstep(vnS - vnPx, vnS + vnPx, vnD), 0.06, smoothstep(0.25, 0.8, vnPx)) * uVinylWet * step(vinylHash(vnC + 9.0), 0.6);
  vnA += 0.14 * vnDrop;
  outgoingLight *= 1.0 + 0.3 * vnDrop * (1.0 - smoothstep(0.0, vnS, vnD) * 0.6);
  // the light it carries, whole: where the highlight is, the film is as opaque as the highlight is bright
  float vnL = dot(reflectedLight.directSpecular + reflectedLight.indirectSpecular, vec3(0.3333));
  diffuseColor.a = clamp(max(vnA, vnL * 1.4), 0.0, 0.95);
}
#include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'person-vinyl';
    return m;
  }
  const stdMat = hex => MAT[hex] || (MAT[hex] = hex === 'clear' ? vinylMaterial()
    : new THREE.MeshStandardMaterial({ color: lin(hex), roughness: 0.75, metalness: 0, side: THREE.DoubleSide }));
  // an open umbrella's canopy: eight panels over a cone, open underneath (the apex up)
  // (a metre across, as a convenience store's 60 cm umbrella is open: UMB_R; UMB_H from its rim to its tip)
  const UMB_R = 0.5, UMB_H = 0.22;
  const canopyGeo = () => new THREE.ConeGeometry(UMB_R, UMB_H, 8, 1, true);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  // An umbrella is held (issue 165): its place is the hand's, and the hand's the arm's. Until then it was placed over
  // the head, upright, and the arm sent after it, so every clip, every height and every far copy made a new way for
  // the shaft to come down through a shoulder. Now, in a body's own space (y up, +z forward, the right hand at -x):
  // the fist in front of the right shoulder at chest height (UMB_GRIP, from the head's joint hd), the elbow by the
  // side, and the shaft leaning from the fist in over the shoulder and back, a dozen degrees, so that the canopy's
  // middle is over the head (UMB_TOP). The hand is closed on the handle as a hand is (the owner's reference, a
  // photograph: the four fingers wrapped round it from the front, the thumb laid over them, and the handle where it
  // is held inside the closed hand, only its end showing under the fist: person, umbHold). The umbrella hangs from the hand; the pose that brings the hand there is laid
  // over the clip (person: umbHold). fist: where a far copy's folded arm has its hand (crowdRenderer), in place of
  // UMB_GRIP (umbArm brings it to the same place): the shaft goes from there towards the same place over the head
  const UMB_GRIP = [-0.2, -0.3, 0.24], UMB_TOP = [-0.1, 0.42, 0.11];
  // (the closed hand on the handle, person umbHold: where the handle's middle is in the hand, from the wrist along the
  // fingers, towards the thumb and into the palm, m; how far each of a finger's three joints closes and how the
  // thumb is laid, rad; roll: the hand turned about the shaft)
  // (an ordinary closed fist with the shaft inside it, as the owner asked: the three joints of a finger at some 77, 95
  // and 52 degrees, what a hand does when it closes and no more, the thumb folded in by the first finger, and the
  // shaft in the crease under the fingers' roots. Looked at side by side with looser and tighter ones, close, from
  // four sides: tools/umbrella_held.js HANDS=1 FISTS=[...]. UMB_END: the handle's end, this far down the shaft from
  // the middle of the hand)
  const UMB_RAISE = 0.2; // how much higher an umbrella is held over someone passing under it (m, people.js umbRaise; issue 157 item 7)
  const UMB_FIST = { x: 0.085, y: 0, palm: 0.022, slant: 0, curl: [1.35, 1.65, 0.9], thumb: [-0.45, 0.5, 0.35], roll: 0 }, UMB_END = 0.07;
  const UMB_LEN = Math.hypot(UMB_TOP[0] - UMB_GRIP[0], UMB_TOP[1] - UMB_GRIP[1], UMB_TOP[2] - UMB_GRIP[2]);
  // umbrellas are off for now: the hand on the handle doesn't read right yet, so nobody carries one,
  // closed or open, and the rain falls on bare heads. Set true to bring them back.
  const UMBRELLAS = true;
  // People and what they carry are no roof: the weather's map of what is under cover (weather.js, drawn from
  // above every so often) leaves them out, or the wet paving showed a dry patch wherever an umbrella had been
  // when the map was last drawn. uncovered: every one of them, which the weather hides for that pass.
  const uncovered = [];
  const noCover = o => { uncovered.push(o); return o; };
  const noUmb = ids => (UMBRELLAS || !ids ? ids : ids.filter(id => id !== 'umbrella' && id !== 'umbrella_open'));
  const umbrellaHold = (hd, fist = null) => {
    const grip = fist ? fist.clone() : hd.clone().add(V3(...UMB_GRIP)), top = hd.clone().add(V3(...UMB_TOP)), dir = top.clone().sub(grip).normalize();
    // (a far copy's hand is where its arm puts it: should the shaft from there pass the head's middle closer than a head
    // and a hand's width, the place over the head is moved out, away from the head, until it does not)
    if (fist) for (let k = 0; k < 4; k++) {
      const c = hd.clone().add(V3(0, 0.09, 0.01)), near = grip.clone().addScaledVector(dir, Math.max(0, c.clone().sub(grip).dot(dir))).sub(c), d = near.length();
      if (d >= 0.2) break;
      near.y = 0;
      top.addScaledVector(near.lengthSq() > 1e-6 ? near.normalize() : V3(-1, 0, 0), (0.2 - d) * 1.6);
      dir.copy(top).sub(grip).normalize();
    }
    return { grip, dir, top: grip.clone().addScaledVector(dir, UMB_LEN), q: new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir) };
  };
  // An umbrella put up (k: 0 still furled, 1 open), as a person does it: the arm comes up to the handle in the first
  // third of a second, then the canopy opens from furled round its shaft (an eighth as wide, two and a half times as
  // long) to its spread, about its tip, a little past it as the ribs lock. Over UMB_OPEN_S, each person in their own
  // moment (wantUmb), so that the crowd's umbrellas go up one by one as the rain comes on and not in one frame: the
  // canopy's scale across and along, and the arm's share of the hold
  const UMB_OPEN_S = 1.1, UMB_TIP = UMB_H / 2; // (the cone's tip, half its height above its middle: canopyGeo)
  const umbOpening = k => {
    const c = x => Math.max(0, Math.min(1, x)), u = c(k / 0.3), e = c((k - 0.25) / 0.75) - 1, o = 1 + 2 * e * e * e + e * e; // (easeOutBack)
    return { arm: u * u * (3 - 2 * u), r: 0.12 + 0.88 * o, a: 2.4 - 1.4 * Math.min(1, o) };
  };
  // Everything is built in the model's own space (y up, +z forward, metres) around anchors read from the
  // reference pose, so one set of numbers fits every character; attach() then hangs it on a bone. A
  // Rocketbox body (real: the main characters and the NPCs) is slimmer and its spine sits further back,
  // so what hangs on the body or rests on the hair has numbers of its own for it.
  const ACC = {
    tigers_cap: { bone: 'Head', build: (M, h) => [
      M(geo('hs', () => new THREE.SphereGeometry(0.125, 18, 10, 0, 6.2832, 0, 1.5708)), '#f6c500', h.clone().add(V3(0, 0.07, -0.005)), V3(1, 1.05, 1.2)),
      M(geo('brim', () => new THREE.CylinderGeometry(0.15, 0.15, 0.01, 18, 1, false, -1.35, 2.7)), '#141414', h.clone().add(V3(0, 0.055, 0.085))),
      M(geo('hbadge', () => new THREE.CylinderGeometry(0.022, 0.022, 0.006, 10).rotateX(1.5708)), '#141414', h.clone().add(V3(0, 0.125, 0.14)))] },
    visor: { bone: 'Head', build: (M, h) => [
      M(geo('vband', () => new THREE.CylinderGeometry(0.119, 0.119, 0.035, 18, 1, true)), '#151515', h.clone().add(V3(0, 0.085, -0.005))),
      M(geo('vbrim', () => new THREE.CylinderGeometry(0.22, 0.22, 0.006, 22, 1, false, -1.45, 2.9)), '#151515', h.clone().add(V3(0, 0.085, 0.09)))] },
    hachimaki: { bone: 'Head', build: (M, h) => [
      M(geo('hband', () => new THREE.CylinderGeometry(0.14, 0.14, 0.055, 18, 1, true)), '#f4f1ea', h.clone().add(V3(0, 0.1, 0.008))),
      M(geo('hknot', () => new THREE.BoxGeometry(0.055, 0.03, 0.05)), '#f4f1ea', h.clone().add(V3(0, 0.08, -0.15)))] },
    jingasa: { bone: 'Head', build: (M, h, c, look, real) => [
      M(geo('jcone', () => new THREE.ConeGeometry(0.22, 0.11, 26)), '#1b1816', h.clone().add(V3(0, real ? 0.18 : 0.2, 0.0))),
      M(geo('jcrest', () => new THREE.SphereGeometry(0.022, 8, 6)), '#d6a931', h.clone().add(V3(0, real ? 0.24 : 0.26, 0)))] },
    mask: { bone: 'Head', build: (M, h) => [
      M(geo('mask', () => new THREE.BoxGeometry(0.13, 0.07, 0.03)), '#f2f2f0', h.clone().add(V3(0, -0.05, 0.172)))] },
    police_cap: { bone: 'Head', build: (M, h) => [
      M(geo('pcap', () => new THREE.CylinderGeometry(0.12, 0.123, 0.09, 18)), '#16213f', h.clone().add(V3(0, 0.11, -0.004))),
      M(geo('ptop', () => new THREE.CylinderGeometry(0.145, 0.126, 0.03, 18)), '#16213f', h.clone().add(V3(0, 0.17, 0.012))),
      M(geo('pbrim', () => new THREE.CylinderGeometry(0.135, 0.135, 0.008, 18, 1, false, -1.3, 2.6)), '#0b0b0b', h.clone().add(V3(0, 0.065, 0.08))),
      M(geo('pbadge', () => new THREE.CylinderGeometry(0.016, 0.016, 0.006, 8).rotateX(1.5708)), '#d6a931', h.clone().add(V3(0, 0.12, 0.126)))] },
    clown_hat: { bone: 'Head', build: (M, h) => [
      M(geo('chat1', () => new THREE.ConeGeometry(0.115, 0.2, 18)), '#d9262c', h.clone().add(V3(0, 0.27, 0))),
      M(geo('chat2', () => new THREE.CylinderGeometry(0.1, 0.122, 0.05, 18)), '#f4f1ea', h.clone().add(V3(0, 0.12, 0))),
      M(geo('chat3', () => new THREE.CylinderGeometry(0.078, 0.1, 0.05, 18)), '#d9262c', h.clone().add(V3(0, 0.17, 0))),
      M(geo('chat4', () => new THREE.SphereGeometry(0.03, 8, 6)), '#f4f1ea', h.clone().add(V3(0, 0.38, 0)))] },
    glasses: { bone: 'Head', build: (M, h) => {
      const r = geo('gl', () => new THREE.TorusGeometry(0.032, 0.004, 6, 14));
      return [M(r, '#161616', h.clone().add(V3(-0.045, 0.035, 0.172))), M(r, '#161616', h.clone().add(V3(0.045, 0.035, 0.172))),
        M(geo('glb', () => new THREE.BoxGeometry(0.03, 0.005, 0.005)), '#161616', h.clone().add(V3(0, 0.045, 0.172)))]; } },
    sunglasses: { bone: 'Head', build: (M, h) => {
      const r = geo('sgl', () => new THREE.CylinderGeometry(0.03, 0.03, 0.006, 16).rotateX(1.5708).scale(1.15, 0.85, 1));
      return [M(r, '#0d0f12', h.clone().add(V3(-0.045, 0.035, 0.174))), M(r, '#0d0f12', h.clone().add(V3(0.045, 0.035, 0.174))),
        M(geo('glb', () => new THREE.BoxGeometry(0.03, 0.005, 0.005)), '#3a3d42', h.clone().add(V3(0, 0.045, 0.172)))]; } },
    apron: { bone: 'Abdomen', realBone: 'Hips', build: (M, h, c, look, real) => (real ? [   // from the waist to the knee, on the hips
      M(geo('apronR', () => new THREE.BoxGeometry(0.34, 0.5, 0.012)), look.apron || '#f4f1ea', h.clone().add(V3(0, -0.17, 0.145)))] : [
      M(geo('apron', () => new THREE.BoxGeometry(0.27, 0.52, 0.03)), look.apron || '#f4f1ea', h.clone().add(V3(0, 0.06, 0.13)))]) },
    lanyard: { bone: 'Chest', build: (M, h, c, look, real) => {
      const z = real ? 0.035 : 0;
      return [M(geo('lan1', () => new THREE.BoxGeometry(0.012, 0.3, 0.008)), '#2d6fd6', h.clone().add(V3(-0.07, 0.0, 0.1 + z)), null, null, 0.35),
        M(geo('lan1', () => new THREE.BoxGeometry(0.012, 0.3, 0.008)), '#2d6fd6', h.clone().add(V3(0.07, 0.0, 0.1 + z)), null, null, -0.35),
        M(geo('lan2', () => new THREE.BoxGeometry(0.06, 0.085, 0.006)), '#f4f1ea', h.clone().add(V3(0, -0.2, 0.11 + z)))]; } },
    drum: { bone: 'Abdomen', build: (M, h) => [
      M(geo('drum', () => new THREE.CylinderGeometry(0.1, 0.1, 0.26, 16).rotateZ(1.5708)), '#d9262c', h.clone().add(V3(0, 0.0, 0.19))),
      M(geo('drumb', () => new THREE.CylinderGeometry(0.103, 0.103, 0.03, 16).rotateZ(1.5708)), '#f4f1ea', h.clone().add(V3(0.1, 0.0, 0.19))),
      M(geo('drumb', () => new THREE.CylinderGeometry(0.103, 0.103, 0.03, 16).rotateZ(1.5708)), '#f4f1ea', h.clone().add(V3(-0.1, 0.0, 0.19))),
      M(geo('drumst', () => new THREE.BoxGeometry(0.34, 0.025, 0.02)), '#f4f1ea', h.clone().add(V3(0, 0.25, 0.08)), null, null, 0)] },
    backpack: { bone: 'Chest', build: (M, h, c, look, real) => [
      M(geo('bp', () => new THREE.BoxGeometry(0.3, 0.38, 0.15)), '#4a6b8a', h.clone().add(real ? V3(0, -0.13, -0.15) : V3(0, -0.02, -0.19)), real ? V3(0.92, 0.95, 0.85) : null)] },
    tako_tray: { bone: 'WristR', build: (M, h) => {
      const out = [M(geo('tray', () => new THREE.BoxGeometry(0.2, 0.02, 0.14)), '#f4f1ea', h.clone().add(V3(0.02, 0.02, 0.16)))];
      for (let i = 0; i < 6; i++) out.push(M(geo('tako', () => new THREE.SphereGeometry(0.032, 8, 6)), '#b5642c', h.clone().add(V3(-0.05 + 0.05 * (i % 3), 0.05, 0.125 + 0.07 * Math.floor(i / 3)))));
      return out; } },
    umbrella: { bone: 'WristR', build: (M, h, g) => (g ? [   // closed, by its handle, the tip by the foot
      M(geo('umbR', () => new THREE.CylinderGeometry(0.028, 0.014, 0.72, 8).rotateZ(1.5708)), '#222a44', g.at(0.44, 0.0, 0.0), null, g.q),
      M(geo('umbhR', () => new THREE.CylinderGeometry(0.014, 0.014, 0.12, 6).rotateZ(1.5708)), '#6a4a2a', g.at(0.05, 0.0, 0.0), null, g.q)] : [
      M(geo('umb', () => new THREE.CylinderGeometry(0.018, 0.028, 1.0, 8)), '#222a44', h.clone().add(V3(0, -0.4, 0.02))),
      M(geo('umbh', () => new THREE.CylinderGeometry(0.014, 0.014, 0.14, 6)), '#6a4a2a', h.clone().add(V3(0, 0.0, 0)))]) },
    // open in the rain, held up in the right hand in front of the shoulder, the shaft leaning in over it so
    // the canopy is over the head (weather.js turns it on). It hangs from the hand that holds it (hand:
    // laid out as the hold has it, umbrellaHold, and hung on the hand's bone as the hold poses it, person:
    // umbHold), so it goes where the hand goes; on a rig with no arm to pose, from the chest. Laid out from
    // the head's joint (r: the reference pose), so it fits every body
    umbrella_open: { bone: 'Chest', hand: 'WristR', build: (M, h, c, look, real, r) => {
      const u = umbrellaHold(r && r.Head ? r.Head.pos : h.clone().add(V3(0, 0.3, 0)));
      const canopy = M(geo('umbC', canopyGeo), look.umbrella || '#1d1f26', u.top, null, u.q);
      canopy.userData.canopy = { pos: u.top.clone(), dir: u.dir.clone() }; // (opened by rig.umbOpen)
      // (the handle, as a folding umbrella's is in a hand: where it is held it is inside the closed hand and is not seen,
      // so only the slim shaft runs through the fist, with room round it for fingers closed as a hand closes, and the
      // handle's end shows under the little finger. A thick handle drawn through the hand was cut into by every finger)
      const handle = M(geo('umbH', () => new THREE.CylinderGeometry(0.015, 0.013, 0.05, 8)), '#2a2a2e', u.grip.clone().addScaledVector(u.dir, -UMB_END), null, u.q);
      const held = new THREE.Object3D(); held.position.copy(u.grip);
      canopy.userData.handle = held; // (where it is held, for what the check measures: rig.umbParts)
      return [canopy,
        M(geo('umbT', () => new THREE.SphereGeometry(0.012, 6, 4)), '#2a2a2e', u.top.clone().addScaledVector(u.dir, UMB_TIP)),
        M(geo('umbS', () => new THREE.CylinderGeometry(0.008, 0.008, UMB_LEN + UMB_END, 6).translate(0, -(UMB_LEN + UMB_END) / 2, 0)), '#2a2a2e', u.top, null, u.q),
        handle, held]; } },
    beret: { bone: 'Head', build: (M, h, c, look, real) => [
      M(geo('beret', () => new THREE.CylinderGeometry(0.14, 0.13, 0.04, 20)), look.beret || '#1a1a1d', h.clone().add(V3(0.02, real ? 0.135 : 0.15, -0.01)), real ? V3(1.1, 1, 1.1) : null, null, 0.18),
      M(geo('beretc', () => new THREE.CylinderGeometry(0.008, 0.008, 0.025, 6)), look.beret || '#1a1a1d', h.clone().add(V3(0.02, real ? 0.165 : 0.18, -0.01)))] },
    baguette: { bone: 'WristR', build: (M, h, g) => (g ? [   // held at its paper wrap, hanging down by the leg
      M(geo('bagR', () => new THREE.CylinderGeometry(0.028, 0.028, 0.62, 10).rotateZ(1.5708)), '#c98a3e', g.at(0.2, 0.0, 0.0), null, g.q),
      M(geo('bagwR', () => new THREE.BoxGeometry(0.2, 0.07, 0.065)), '#efe8da', g.at(0.07, 0.0, 0.0), null, g.q)] : [
      M(geo('bag', () => new THREE.CylinderGeometry(0.028, 0.028, 0.62, 10).rotateZ(1.2)), '#c98a3e', h.clone().add(V3(0.02, 0.02, 0.06))),
      M(geo('bagw', () => new THREE.BoxGeometry(0.075, 0.2, 0.065)), '#efe8da', h.clone().add(V3(0.0, -0.02, 0.06)))]) },
    cafe_tray: { bone: 'WristL', build: (M, h) => {
      const out = [M(geo('ctray', () => new THREE.CylinderGeometry(0.17, 0.17, 0.012, 22)), '#b9bcbf', h.clone().add(V3(0, 0.08, 0.05)))];
      for (let i = 0; i < 3; i++) out.push(M(geo('cup', () => new THREE.CylinderGeometry(0.03, 0.025, 0.06, 10)), i ? '#f4f1ea' : '#7a2e33', h.clone().add(V3(-0.07 + 0.07 * i, 0.12, 0.05 + 0.03 * (i % 2)))));
      return out; } },
    tulips: { bone: 'WristR', build: (M, h, c, look) => {
      // a paper cone of tulips from the flower market, carried head down
      const out = [M(geo('tcone', () => new THREE.ConeGeometry(0.07, 0.36, 10, 1, true)), '#efe8da', h.clone().add(V3(0, -0.1, 0.05)))];
      const cols = ['#d9262c', '#f2c12e', '#e8577a', '#f08a24', '#f4f1ea'], k = cols.indexOf(look.tulip) >= 0 ? cols.indexOf(look.tulip) : 0;
      for (let i = 0; i < 5; i++) out.push(M(geo('tulip', () => new THREE.SphereGeometry(0.03, 8, 6)), cols[(k + i) % 5], h.clone().add(V3(-0.04 + 0.02 * i, -0.3, 0.04 + 0.015 * (i % 2)))));
      return out; } },
    flag: { bone: 'WristR', build: (M, h) => [
      M(geo('pole', () => new THREE.CylinderGeometry(0.012, 0.012, 1.3, 6)), '#8a8a8a', h.clone().add(V3(0, 0.3, 0.0))),
      M(geo('flag', () => new THREE.BoxGeometry(0.01, 0.2, 0.3)), '#d9262c', h.clone().add(V3(0, 0.85, -0.16)))] },
  };
  // what an NPC holds for what it does while it waits (look.clip)
  const CLIP_ACC = { Phone: ['phone'], Photo: ['camera'], Documents: ['clipboard'], Reading: ['book'], Drink: ['cup'] };
  // gestures made to someone: a person plays them only in a conversation (mode 'talk' or 'listen'), never while they
  // wait. Cast with one to wait in, a guide presented to nobody all evening at the Scramble, a person talking to themselves
  // in the crowd (the owner, 22 November 2026): alone they wait as the cast's own idle does, and talk when talked to
  const GESTURE = new Set(['Talk', 'Listen', 'Present', 'Thoughtful', 'Nod', 'Cheer', 'Wave']);
  // things held in a hand, placed in its grip (see person): nothing where the rig has no fingers
  const B3 = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  Object.assign(ACC, {
    phone: { bone: 'WristR', build: (M, h, g) => (g ? [M(geo('phone', () => B3(0.14, 0.07, 0.009)), '#16181c', g.at(0.07, 0.0, 0.022 * g.palm), null, g.q)] : []) },
    camera: { bone: 'WristR', build: (M, h, g) => (g ? [   // gripped by its right end, the lens away from the face
      M(geo('cam', () => B3(0.07, 0.075, 0.13)), '#1d1f22', g.at(0.045, -0.01, 0.075 * g.palm), null, g.q),
      M(geo('lens', () => new THREE.CylinderGeometry(0.028, 0.028, 0.06, 14)), '#0f1012', g.at(0.045, -0.07, 0.085 * g.palm), null, g.q)] : []) },
    clipboard: { bone: 'WristL', build: (M, h, g) => (g ? [
      M(geo('board', () => B3(0.31, 0.23, 0.01)), '#8a6a45', g.at(0.12, 0.0, 0.02 * g.palm), null, g.q),
      M(geo('paper', () => B3(0.27, 0.2, 0.004)), '#f2f0ea', g.at(0.12, 0.0, 0.028 * g.palm), null, g.q)] : []) },
    book: { bone: 'WristR', build: (M, h, g) => (g ? [M(geo('book', () => B3(0.21, 0.15, 0.025)), '#5b2c2c', g.at(0.08, 0.0, 0.03 * g.palm), null, g.q)] : []) },
    cup: { bone: 'WristR', build: (M, h, g) => (g ? [
      M(geo('cup', () => new THREE.CylinderGeometry(0.042, 0.034, 0.11, 14)), '#f4f1ea', g.at(0.06, 0.01, 0.045 * g.palm), null, g.q),
      M(geo('lid', () => new THREE.CylinderGeometry(0.044, 0.044, 0.015, 14)), '#3a2a20', g.at(0.06, 0.07, 0.045 * g.palm), null, g.q)] : []) },
    // (a vending machine's hot can of coffee, look.drink 'can': the short steel can of 185 g, 53 mm across and 104 mm
    // tall, in a dark lacquer with no maker's name, its top and rim bare steel)
    can: { bone: 'WristR', build: (M, h, g) => (g ? [
      M(geo('can', () => new THREE.CylinderGeometry(0.0265, 0.0265, 0.092, 16)), '#2a2f3c', g.at(0.06, 0.0, 0.036 * g.palm), null, g.q),
      M(geo('canT', () => new THREE.CylinderGeometry(0.024, 0.0265, 0.012, 16)), '#b9bcbf', g.at(0.06, 0.052, 0.036 * g.palm), null, g.q)] : []) },
  });
  // The camera of 1964 (docs/STORY.md: Mizuno Akira's, which Sumiko gives in the first frame): a 35 mm rangefinder of
  // that time in no maker's shape. A body with rounded ends in black leatherette under a chrome top plate with the
  // finder's three windows (the finder, the frosted one that lights its frame lines, the rangefinder's), a lens of
  // chrome and black rings with its front glass, the speed dial, the release, the advance lever and the rewind knob,
  // and a lug at each end. Made once, in metres: y up, z out of the lens, x to the left of whoever holds it to the eye
  // (so the release, the speed dial and the advance lever are at -x, under the right hand, and the finder's eyepiece
  // and the rewind knob at +x).
  // Round Kagami's neck in place of their own camera, once Sumiko has given it (game.js; their own is put away, and the
  // words say so): flat on the chest, nearly level, as a light camera hangs, its lens forward, on its own thin leather
  // strap, which is in the main character's model and shown with it (look.neckcam: people.json "neck_camera" "old",
  // where blender/build_people.py neck_camera rested it on the coat). (Carried in the hand first, it went into the
  // thigh at the side, or leaned into the coat held out in front; hung at the other camera's strap ends, it stood
  // off the chest in the air.)
  let oldCam = null;
  const oldCamera = () => {
    if (oldCam) return oldCam;
    const mat = (hex, rough, metal) => { const m = new THREE.MeshStandardMaterial({ color: lin(hex), roughness: rough, metalness: metal }); litMaterial(m); return m; };
    const hide = mat('#141414', 0.82, 0), chrome = mat('#aeafad', 0.34, 1), black = mat('#0b0b0c', 0.5, 0.2),
      glass = mat('#0d1622', 0.06, 0.4), frost = mat('#d9dcdc', 0.6, 0);
    const W = 0.138, D = 0.032, R = 0.0145, BODY = 0.052, TOP = 0.024;
    const stadium = (w, d, r) => {
      const s = new THREE.Shape(), x = w / 2 - r, z = d / 2;
      s.moveTo(-x, -z); s.lineTo(x, -z); s.absarc(x, -z + r, r, -Math.PI / 2, 0, false); s.lineTo(w / 2, z - r);
      s.absarc(x, z - r, r, 0, Math.PI / 2, false); s.lineTo(-x, z); s.absarc(-x, z - r, r, Math.PI / 2, Math.PI, false);
      s.lineTo(-w / 2, -z + r); s.absarc(-x, -z + r, r, Math.PI, Math.PI * 1.5, false);
      return s;
    };
    const slab = (h, inset, m, y0) => { // the body's outline, h tall from y0, its edges eased
      const b = 0.0012, g = new THREE.ExtrudeGeometry(stadium(W - 2 * inset - 2 * b, D - 2 * inset - 2 * b, R - inset - b),
        { depth: h - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 10 });
      g.rotateX(Math.PI / 2); g.translate(0, y0 + h - b, 0); // (the outline lies in x and z; it is drawn up the y axis)
      return new THREE.Mesh(g, m);
    };
    const cyl = (r0, r1, len, m, at, axis = 'z') => {
      const g = new THREE.CylinderGeometry(r1, r0, len, 28);
      if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(-Math.PI / 2);
      const o = new THREE.Mesh(g, m); o.position.set(...at); return o;
    };
    const box = (w, h, d, m, at) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(...at); return o; };
    const y0 = -(BODY + TOP) / 2, top = y0 + BODY + TOP, front = D / 2, lensY = y0 + BODY * 0.5;
    const g = new THREE.Group();
    g.add(slab(BODY, 0, hide, y0), slab(TOP, 0.0006, chrome, y0 + BODY));
    // the lens: mount, barrel, the focusing ring, the front, its glass
    let z = front;
    for (const [len, r0, r1, m] of [[0.004, 0.0215, 0.0215, chrome], [0.014, 0.0205, 0.0205, black], [0.006, 0.0212, 0.0212, chrome], [0.011, 0.0196, 0.0188, chrome]]) {
      g.add(cyl(r0, r1, len, m, [0, lensY, z + len / 2])); z += len;
    }
    g.add(cyl(0.0142, 0.0142, 0.0016, glass, [0, lensY, z - 0.0005]));
    g.add(box(0.004, 0.003, 0.004, chrome, [0.0, lensY - 0.021, front + 0.024])); // the focusing tab
    // the finder's windows on the top plate's face
    const wy = y0 + BODY + TOP * 0.52;
    // (seen from the front: the finder's window at the holder's left, +x, its frosted one beside it, the rangefinder's
    // at the other end)
    g.add(box(0.019, 0.012, 0.0016, glass, [0.044, wy, front + 0.0004]), box(0.011, 0.009, 0.0016, frost, [0.021, wy, front + 0.0004]),
      box(0.011, 0.009, 0.0016, glass, [-0.046, wy, front + 0.0004]));
    // on top: the speed dial and the release under the right hand, the advance lever behind them, the rewind knob at the left
    g.add(cyl(0.0105, 0.0105, 0.0055, chrome, [-0.034, top + 0.0028, 0.002], 'y'), cyl(0.004, 0.0038, 0.006, chrome, [-0.053, top + 0.003, 0.004], 'y'),
      box(0.026, 0.0022, 0.0055, chrome, [-0.042, top + 0.0068, -0.008]), cyl(0.0095, 0.0095, 0.008, chrome, [0.048, top + 0.004, 0.0], 'y'),
      cyl(0.005, 0.005, 0.004, black, [0.048, top + 0.010, 0.0], 'y'));
    // a lug at each end, for its strap
    for (const s of [-1, 1]) g.add(cyl(0.0028, 0.0028, 0.006, chrome, [s * (W / 2 + 0.002), y0 + BODY + 0.004, 0], 'x'));
    // (issue 192: its thirty parts in a draw a material, five, not one each: 16 of a phone's draws in every beat it is
    // worn, frames 1 to 7. Each part's place is baked into its copy of the shape; what it looks like is the same)
    if (THREE.BufferGeometryUtils) {
      g.updateMatrixWorld(true);
      const by = new Map();
      for (const o of g.children) if (o.isMesh) { const l = by.get(o.material) || []; l.push(o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()); l[l.length - 1].applyMatrix4(o.matrixWorld); by.set(o.material, l); }
      const one = new THREE.Group();
      for (const [m, list] of by) {
        for (const x of list) { for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k); x.clearGroups(); }
        const merged = THREE.BufferGeometryUtils.mergeGeometries(list, false);
        if (!merged) return (oldCam = g);
        one.add(new THREE.Mesh(merged, m));
      }
      one.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      return (oldCam = one);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return (oldCam = g);
  };
  ACC.camera1964 = { bone: 'Chest', build: (M, h, g, look) => {
    const L = look.neckcam && look.neckcam.old;
    if (!L) return [];
    const o = oldCamera().clone();
    o.name = 'camera1964';
    o.position.set(...L.centre);
    o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(...L.x), V3(...L.y), V3(...L.z)));
    return [o];
  } };

  // ------------------------------------------------------------ loading
  // people.json, tried again twice if the request fails (as gltf.js does for the models)
  async function fetchJSON(url) {
    for (let i = 0; ; i++) {
      try { const r = await fetch(url); if (r.ok) return await r.json(); if (i >= 2 || r.status < 500) throw new Error(`${url}: HTTP ${r.status}`); }
      catch (e) { if (i >= 2) throw e; }
      await new Promise(r => setTimeout(r, 800 * 3 ** i));
    }
  }
  async function load(base, { onMsg, warmLater = false } = {}) {
    if (!THREE.GLTFLoader || !THREE.SkeletonUtils) throw new Error('GLTFLoader is not available');
    const L = new THREE.GLTFLoader();
    L.oeTex = false; // (a phone's pictures in ASTC blocks, tex.js: packed below, once an NPC's have been made smaller)
    const packed = root => (window.OETex && OETex.stats.on ? OETex.packObject(root) : null);
    const get = u => new Promise((res, rej) => L.load(base + u, res, null, rej));
    const info = await fetchJSON(base + 'people.json');
    // the far crowd's copies of the scanned cast (pipeline/crowd_cast.py, issue 475): none, and the far crowd is the dolls
    const CC = info.crowd_cast, castFile = CC && !/[?&]farcast=off/.test(location.search) ? get(CC.file).catch(e => { console.warn('crowd_cast', e); return null; }) : null;
    const [aM, aW, cr, fc] = await Promise.all([get(info.anims.M), get(info.anims.W), get(info.crowd), castFile]);
    // (tpl and loading, by a character's name, grow one name at a time as the cast streams in: made without a prototype
    // they are a dictionary from the start, one shape however many names come. As plain objects each name was a new
    // shape, and the renderer's begin, which asks lib.tpl for the loaded stand-ins, was thrown out of its optimised code
    // 51 times a minute on a desktop's walk: tools/deopt_survey.js, issue 220)
    const lib = { info, clips: { M: aM.animations, W: aW.animations }, lod: {}, far: {}, tpl: Object.create(null), loading: Object.create(null), warming: Object.create(null), hurried: Object.create(null) };
    // (lib.setWarm(fn): the game's warm-up, given once its loader has compiled what the first frame shows; lib.warmed
    // resolves with it, for an NPC's character that came before it to wait on: below, ready)
    // (warmLater: the game says it will give one; a page that never does, tools/people_lineup.js, shows them as they come)
    lib.warmed = new Promise(r => { lib.setWarm = fn => { lib.warm = fn; r(fn); }; });
    lib.warmLater = warmLater;
    cr.scene.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry;
      g.setAttribute('mat', g.getAttribute('_mat'));
      g.setAttribute('part', g.getAttribute('_part'));
      lib.lod[o.name] = { geometry: g, extras: o.userData };
    });
    // (and each one's coarser copy past COARSE_M, <name>~coarse on the same picture, issue 61)
    const coarse = {};
    if (fc) fc.scene.traverse(o => {
      if (!o.isMesh || !o.material.map) return;
      const g = o.geometry;
      g.setAttribute('part', g.getAttribute('_part'));
      g.deleteAttribute('_part');
      if (g.getAttribute('_partw')) { g.setAttribute('pw', g.getAttribute('_partw')); g.deleteAttribute('_partw'); } // (each corner's share of its limb: crowdPose, OE_PARTW)
      if (/~coarse$/.test(o.name)) { coarse[o.name.slice(0, -7)] = g; return; }
      lib.far[o.name] = { geometry: g, map: o.material.map, extras: o.userData };
    });
    for (const [n, g] of Object.entries(coarse)) if (lib.far[n] && !/[?&]farcoarse=off/.test(location.search)) lib.far[n].coarse = g;
    // on a phone (quality.js lean) a far copy's picture goes up at half its size: past the nearest walkers a figure
    // is under 50 px tall on a phone's canvas, and the cast's pictures then hold no more of its memory than the dolls'
    // palettes did (a quarter of a megabyte for a cast of eight)
    const QF = window.OEQuality ? OEQuality.city() : null;
    if (fc && QF && QF.lean && typeof createImageBitmap === 'function') await Promise.all(Object.values(lib.far).map(L => {
      const t = L.map, im = t.image;
      if (!im || !im.width) return null;
      return createImageBitmap(im, { resizeWidth: im.width >> 1, resizeHeight: im.height >> 1, resizeQuality: 'high', premultiplyAlpha: 'none' })
        .then(bm => { t.image = bm; t.needsUpdate = true; if (im.close) im.close(); }).catch(() => {});
    }));
    if (fc && window.OETex && OETex.stats.on) await Promise.all(Object.values(lib.far).map(F => OETex.pack(F.map)));
    lib.require = name => lib.loading[name] || (lib.loading[name] = get(`${name}.glb`).then(g => {
      let mesh = null;
      g.scene.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
      mesh.geometry.setAttribute('mat', mesh.geometry.getAttribute('_mat'));
      const tpl = { scene: g.scene, extras: mesh.userData, pack: info.characters[name].pack };
      return warmPalette(lib, mesh).then(() => {
        lib.tpl[name] = tpl;
        if (onMsg) onMsg(name);
        return tpl;
      });
    }));
    lib.names = Object.keys(info.characters);
    lib.warmPalette = () => warmPalette(lib);
    // the main characters (blender/build_people.py): textured, with their own clips and skeleton
    const H = info.heroes || {}, plain = lib.require;
    lib.heroes = H.characters || {};
    // the NPCs (build_people.py --npcs): textured too, on the same skeleton, sharing one file of clips per sex
    const NP = info.npcs || {};
    lib.npcs = NP.characters || {};
    // a textured character that comes once the game is open is shown (lib.tpl, which the crowd and the NPCs
    // wait on) only when its textures are on the GPU and its shaders compiled, off the frame (lib.warm, set
    // by the game once its loader has compiled the scene; issue 201): else the first frame that draws it
    // uploads them and links its program, a hitch of a frame or more each time someone new comes into view
    // on a phone (quality.js lean) an NPC's pictures go up at LEAN_PX a side: a 1024 one is 5.3 MB of the GPU with its
    // mipmaps, two or three a character and twenty-odd characters a map (130 MB in Tokyo, issue 406), for someone who
    // stands a few hundred pixels tall at most on a phone's canvas. The characters you play keep theirs
    const WARM_CAP = 20; // (s: the longest a character that has come waits on its warm-up before it is shown, below)
    const QC = window.OEQuality ? OEQuality.city() : null, LEAN_PX = 512 >> ((QC && QC.lighter) ? 1 : 0), lean = !!(QC && QC.lean); // (256 after the map's page died here: quality.js died)
    const smaller = (tpl, only, PX = LEAN_PX) => {
      const jobs = [];
      tpl.scene.traverse(o => {
        if (!o.isSkinnedMesh) return;
        for (const m of [].concat(o.material)) for (const k in m) {
          if (only && !only.test(m.name || '')) continue; // (by the material's name: the head's and the hair's, not the clothes')
          const t = m[k], im = t && t.isTexture && t.image;
          if (!im || !(im.width > PX || im.height > PX) || t.userData.oeLean || typeof createImageBitmap !== 'function') continue;
          t.userData.oeLean = true;
          const f = PX / Math.max(im.width, im.height);
          jobs.push(createImageBitmap(im, { resizeWidth: Math.round(im.width * f), resizeHeight: Math.round(im.height * f), resizeQuality: 'high', premultiplyAlpha: 'none' })
            .then(bm => { t.image = bm; t.needsUpdate = true; if (im.close) im.close(); }).catch(() => {})); // (else as it came)
        }
      });
      return Promise.all(jobs);
    };
    // The hair cards (an avatar's *_opacity material: flat strips of hair cut out of a picture, and the lashes) each
    // face their own way, and lit by their own normals a strip that turns from the sun went black beside one that
    // faces it: shards in a fringe, a dark band across the back of a head. They are lit as one head of hair instead,
    // each vertex's normal pointing out from the middle of the head, as hair is shaded wherever it is built of cards.
    const roundHair = o => {
      const g = o.geometry, P = g.attributes.position, Nn = g.attributes.normal;
      if (!P || !Nn || g.userData.oeHair) return;
      g.userData.oeHair = true;
      g.computeBoundingBox();
      const bb = g.boundingBox, cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2;
      // (the box's middle, whichever axis is up in the mesh's own frame: the cards wrap the skull all round)
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i) - cx, y = P.getY(i) - cy, z = P.getZ(i) - cz, l = Math.hypot(x, y, z) || 1;
        Nn.setXYZ(i, x / l, y / l, z / l);
      }
      Nn.needsUpdate = true;
      // (a two-sided material turns the normal round on a face seen from behind, and half the strips are wound
      // facing the skull: those stayed black. Each strip is drawn from both sides as two faces with the one normal)
      const ix = g.index;
      if (ix) {
        const a = ix.array, both = new a.constructor(a.length * 2);
        both.set(a);
        for (let i = 0; i < a.length; i += 3) { both[a.length + i] = a[i]; both[a.length + i + 1] = a[i + 2]; both[a.length + i + 2] = a[i + 1]; }
        g.setIndex(new THREE.BufferAttribute(both, 1));
        o.material.side = THREE.FrontSide;
      }
    };
    // ... and in the colour of the hair they lie on. The cards' picture is darker than the hair painted on the head
    // under them, much darker where the hair was recoloured (a brown or grey head kept near-black wisps: they read
    // as black shards stuck in the fringe). Measured here, once a character: the cards' opaque texels against the
    // head's picture at the head's vertices nearest the cards, and the cards' material lightened by the ratio.
    const pixels = (tex, side = 96) => {
      const im = tex && tex.image;
      if (!im || !im.width) return null;
      const cv = document.createElement('canvas'); cv.width = cv.height = side;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(im, 0, 0, side, side);
      const d = g.getImageData(0, 0, side, side).data;
      cv.width = cv.height = 0;
      const lin = v => Math.pow(v / 255, 2.2);
      return (u, v) => { // (a glTF picture: v down the image; the texture's own transform first)
        const x = Math.min(side - 1, Math.max(0, Math.floor((u * tex.repeat.x + tex.offset.x) % 1 * side))), y = Math.min(side - 1, Math.max(0, Math.floor((v * tex.repeat.y + tex.offset.y) % 1 * side))), k = 4 * (y * side + x);
        return [lin(d[k]), lin(d[k + 1]), lin(d[k + 2]), d[k + 3] / 255];
      };
    };
    const matchHair = (hair, head) => {
      const hm = hair.material, dm = head.material;
      if (hm.userData.oeHairTint || !hm.map || !dm.map) return;
      hm.userData.oeHairTint = true;
      let cardAt, headAt;
      try { cardAt = pixels(hm.map); headAt = pixels(dm.map); } catch (e) { return; }
      const P = hair.geometry.attributes.position, U2 = hair.geometry.attributes.uv, Q = head.geometry.attributes.position, V2 = head.geometry.attributes.uv;
      if (!cardAt || !headAt || !P || !U2 || !Q || !V2) return;
      const sum = [0, 0, 0], under = [0, 0, 0];
      let n = 0;
      for (let i = 0, step = Math.max(1, Math.floor(P.count / 240)); i < P.count; i += step) {
        const c = cardAt(U2.getX(i), U2.getY(i));
        if (c[3] < 0.5) continue;
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        let best = -1, bd = Infinity;
        for (let j = 0; j < Q.count; j++) { const dx = Q.getX(j) - x, dy = Q.getY(j) - y, dz = Q.getZ(j) - z, dd = dx * dx + dy * dy + dz * dz; if (dd < bd) { bd = dd; best = j; } }
        if (best < 0) continue;
        const h = headAt(V2.getX(best), V2.getY(best));
        for (let k = 0; k < 3; k++) { sum[k] += c[k]; under[k] += h[k]; }
        n++;
      }
      if (n < 12) return;
      const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], ratio = lum(under) / Math.max(1e-4, lum(sum));
      // (even where their tones agree their hues may not: the channels are matched below)
      const k = Math.min(1.6, Math.max(0.7, ratio));
      // (their tone, and as much of their hue as the mean of the samples can be trusted with: a card's brown strands over
      // black hair read as a patch at the nape, issue 123; a channel moves at most a quarter from the tone's own ratio)
      const ch = i => Math.min(k * 1.25, Math.max(k * 0.75, under[i] / Math.max(1e-4, sum[i])));
      hm.color.setRGB(ch(0), ch(1), ch(2));
    };
    const ready = (name, tpl, npc = false) => {
      let hair = null, head = null;
      stamp(name, 'parsed');
      if (window.OEFace) OEFace.prepare(tpl.scene); // (a speaking character's face drawn still until it is chosen to move: face.js)
      tpl.scene.traverse(o => {
        if (!o.isSkinnedMesh) return;
        o.castShadow = o.receiveShadow = true; [].concat(o.material).forEach(litMaterial); // (the variant person() draws, its shadow's too)
        if (/_opacity$/.test(o.material.name || '') && !/glasses/.test(o.material.name)) { hair = o; roundHair(o); } else if (/_head$/.test(o.material.name || '')) head = o;
      });
      if (hair && head) matchHair(hair, head);
      // the hair as strands (issue 74): the cards, and the hair painted on the head's own mesh (after litMaterial: its
      // street light is in the shader the hair reads)
      let headHair = false;
      if (head && head.material.map) { let at = null; try { at = pixels(head.material.map, 128); } catch (e) { /* a picture that cannot be read */ } if (at) { strandHair(head, at); hairMaterial(head.material, true); headHair = true; } }
      if (hair) { strandHair(hair, null, headHair ? head : null); hairMaterial(hair.material); }
      // (an NPC's character that comes before the game has a warm-up to give it waits for one, and is shown once warmed:
      // the crowd's cast came between the loader's compile and the title, and the title's first frames linked their
      // programs in a draw, issue 31. Until then the far crowd's copy of each stands in. A main character is wanted by
      // the load itself, and does not wait)
      // (and shown after WARM_CAP seconds however far the warm-up has come: its pictures go up a frame at a time behind the
      // crowd's and the levels', and on a slow machine Nagi waited minutes in that queue, never drawn, the walk's check failing
      // "not drawn ten minutes after setting out". A frame's hitch as the rest go up on its first draw, not someone missing)
      const warmCap = p => (lib.hurried[name] ? Promise.race([p, new Promise(r => setTimeout(r, WARM_CAP * 1000))]) : p); // (someone named you are near, lib.hurry; the rest wait their turn)
      lib.warming[name] = tpl; // (lib.hurry: its pictures to the head of the queue, if someone named is waiting on it)
      const warmIt = () => { const w0 = lib.warm ? Promise.resolve(lib.warm) : npc && lib.warmLater ? lib.warmed : null; return w0 ? warmCap(w0.then(w => { tpl.warmGo = true; return Promise.all([w(tpl.scene, lib.hurried[name] ? { first: true } : lib.urged[name] ? URGE : undefined), npc && tpl.textured ? warmDress(lib, tpl, w) : null]); }).catch(() => {})) : Promise.resolve(); };
      // (a character you play keeps its clothes' picture on a phone, seen large from behind all through the game, but not
      // its head's and its hair's at 1024: a phone's canvas is 760 pixels wide and shows that face 300 across at its nearest, in a talk's
      // two-shot, and a texel finer than a pixel is not seen. At 512 a side whatever the phone's level (the cast's go to 256 on the lighter ones): 8 MB of the GPU less: issue 130. ?herotex=full: as they come, to set beside, tools/hero_face_shot.js)
      stamp(name, 'hair');
      return (lean && (npc || !/[?&]herotex=full\b/.test(location.search)) ? smaller(tpl, npc ? null : /_head$|_opacity$/, npc ? LEAN_PX : 512) : Promise.resolve()).then(() => packed(tpl.scene)).then(() => stamp(name, 'warm0')).then(warmIt).then(() => {
        lib.tpl[name] = tpl; delete lib.warming[name]; stamp(name, 'done');
        if (onMsg) onMsg(name);
        return tpl;
      });
    };
    // (and the run, a clip of its own on the same skeleton (NP.field, ~45 KB): without it a figure asked to run played its
    // idle, and the man of the walk's incident slid at 4.5 m/s stood upright, as if on a board nobody could see. A file
    // that does not come leaves the walk and the gestures as they were)
    const clipsOf = sex => lib.loading[`clips:${sex}`] || (lib.loading[`clips:${sex}`] = Promise.all([get(NP.clips[sex].file),
      NP.field && NP.field[sex] ? get(NP.field[sex].file).catch(() => null) : null]).then(([g, f]) => (f ? g.animations.concat(f.animations.filter(a => a.name === 'Run')) : g.animations)));
    const speedsOf = sex => Object.assign({}, NP.field && NP.field[sex] ? NP.field[sex].ground_speed : null, NP.clips[sex].ground_speed);
    // (a load asked for again: one that never answered (a request dropped, a server that went quiet) is fetched afresh,
    // game.js npcLoad; one that came is kept)
    // (and fetched as a request of its own: three.js's loader joins a request for a file to one still on its way, and the
    // second ask waited on the held first)
    lib.again = Object.create(null); // (one shape however many names, as tpl and loading)
    // (each character's way in, ms of the page's clock at each step: asked, its file come, parsed, its hair laid, its
    // warm-up begun, shown. For the checks: tools/crowd_whole.js, issue 261)
    lib.stream = Object.create(null);
    const stamp = (name, k) => { const T = lib.stream[name] || (lib.stream[name] = {}); if (T[k] == null) T[k] = Math.round(performance.now()); };
    lib.forget = name => { if (!lib.tpl[name]) { delete lib.loading[name]; lib.again[name] = (lib.again[name] || 0) + 1; } };
    const fresh = (name, file) => (lib.again[name] ? `${file}?again=${lib.again[name]}` : file);
    // (someone named waiting on this character, a person of the story or the walk you meet: its pictures sent at the head of
    // the upload queue (world.js upload, first), ahead of the crowd's and the levels', from now or as soon as it is warming.
    // Behind them, Nagi waited minutes to be drawn on a slow machine; she is never drawn as anyone else meanwhile)
    // (a character the crowd's pick waits on for someone in the view now, people.js begin: its pictures sent ahead of the
    // rest of the cast's and of what else waits for a model to be shown, behind the hero level's and anyone named (issue
    // 261). The whole cast is asked for at once as the crowd is made, and the queue sent it in the order it came, so the
    // walkers at your elbow waited behind characters nobody near was wearing)
    const URGE = { cls: 0.5 };
    lib.urged = Object.create(null);
    lib.urge = name => { if (lib.urged[name] || lib.tpl[name]) return; lib.urged[name] = true;
      const t = lib.warming[name]; if (t && t.warmGo && lib.warm && !lib.hurried[name]) lib.warm(t.scene, URGE).catch(() => {}); };
    // A cast member whose body nobody has shown for a while is let go from the GPU (issue 261, and frame 5's beat on a phone):
    // its pictures disposed, its template parked, until someone asks for it again (lib.require), when they go up again
    // through the queue as they first did, ahead of the rest if someone in the view waits (lib.urge). On SKY's roof the
    // near crowd is 230 m below and nobody of it is drawn, and the cast's pictures stood idle on the GPU through frames 5
    // and 6, two of them worn only by the hidden visitors of a place left behind: 3.2 MB of the phone's tightest beat.
    // The crowd's renderer asks it of its cast (crowdRenderer, idle); the pixels stay in the page, so the way back is a
    // second upload, not a second download. lib.shown: any body of the character in the scene and visible all the way up
    lib.rigsOf = Object.create(null);
    lib.parked = Object.create(null);
    lib.shown = name => {
      const R = lib.rigsOf[name]; if (!R) return false;
      for (const r of R) { for (let o = r.root; o; o = o.parent) { if (!o.visible) break; if (!o.parent) { if (o.isScene) return true; break; } } }
      return false;
    };
    const texOfScene = root => { const out = new Set(); root.traverse(o => { for (const m of [].concat(o.material || [])) { if (!m) continue; for (const k in m) { const v = m[k]; if (v && v.isTexture && !v.isRenderTargetTexture) out.add(v); } } }); return out; };
    const kept = t => (t.isCompressedTexture ? !!(t.mipmaps && t.mipmaps.length) : t.isDataTexture ? !!(t.image && t.image.data) : !!(t.image && (t.image.width || t.image.videoWidth))); // (its pixels still in the page, to send again)
    lib.letGo = name => {
      const tpl = lib.tpl[name];
      if (!tpl || !tpl.textured || !lib.npcs[name] || !lib.warm || lib.hurried[name]) return false;
      const T = texOfScene(tpl.scene);
      for (const t of T) if (!kept(t)) return false; // (one whose pixels went with its upload cannot come back: kept as it is)
      for (const t of T) t.dispose();
      delete lib.tpl[name]; delete lib.loading[name]; delete lib.urged[name];
      tpl.warmGo = false; lib.parked[name] = tpl;
      return true;
    };
    const rewarm = name => {
      const tpl = lib.parked[name]; delete lib.parked[name];
      lib.warming[name] = tpl; tpl.warmGo = true;
      return Promise.resolve(lib.warm(tpl.scene, lib.hurried[name] ? { first: true } : lib.urged[name] ? URGE : undefined)).catch(() => {})
        .then(() => { lib.tpl[name] = tpl; delete lib.warming[name]; return tpl; });
    };
    lib.hurry = name => { if (lib.hurried[name]) return; lib.hurried[name] = true; // (once: asked every half second, it warmed the model again each time and the helicopter's load waited behind it)
      const t = lib.warming[name]; if (t && lib.warm) lib.warm(t.scene, { first: true }).catch(() => {}); };
    lib.require = name => {
      const h = lib.heroes[name], c = lib.npcs[name];
      if (lib.parked[name]) return (lib.loading[name] = rewarm(name));
      if (c) {
        return lib.loading[name] || (stamp(name, 'ask'), lib.loading[name] = Promise.all([get(fresh(name, c.file)).then(g => (stamp(name, 'glb'), g)), clipsOf(c.sex)]).then(([g, clips]) =>
          ready(name, { scene: g.scene, textured: true, clips, speeds: speedsOf(c.sex), bones: NP.bones || {}, mask: !!c.mask }, true)));
      }
      if (!h) return plain(name);
      return lib.loading[name] || (lib.loading[name] = get(fresh(name, h.file)).then(g =>
        ready(name, { scene: g.scene, textured: true, clips: g.animations, speeds: h.ground_speed, bones: H.bones || {} })));
    };
    return lib;
  }

  // a random look for a character: skin, hair, clothes and height
  // style (optional, per city): a preset's name (STYLES) or { skin, hair, tops, legs: [hex], weights: {name: n},
  // scale: [min, max], patterns: {tiger: p, leopard: p, ...}, acc: {mask: p, ...} }; every field is optional.
  // Without one, the style setStyle() chose.
  const PAT_TOP = { tiger: '#f6c500', leopard: '#c9a66b', kuidaore: '#d9262c', pinstripe: '#23262e', plaid: '#6e3a2a' };
  function randomLook(lib, name, style) {
    const ch = lib.info.characters[name], w = ch.pack === 'W', st = styleOf(style) || STYLE || {};
    const skin = st.skin || SKIN, hair = st.hair || HAIR;
    const look = { character: name, skin: pick(skin), hair: st.hair ? pick(hair) : rnd() < 0.15 ? pick(HAIR.slice(8)) : pick(HAIR.slice(0, 9)), top: pick(st.tops || TOPS), legs: pick(st.legs || LEGS),
      scale: st.scale ? st.scale[0] + rnd() * (st.scale[1] - st.scale[0]) - (w ? 0.055 : 0) : (w ? 0.885 : 0.94) + rnd() * 0.06 };
    if (st.patterns && ch.classes.includes('top')) {
      let r = rnd();
      for (const [k, p] of Object.entries(st.patterns)) { if ((r -= p) < 0) { look.pattern = k; look.top = PAT_TOP[k]; break; } }
    }
    if (st.acc) { const a = Object.keys(st.acc).filter(k => rnd() < st.acc[k]); if (a.length) look.acc = a; }
    return look;
  }
  function pickCharacter(lib, style) {
    const st = styleOf(style) || STYLE, own = !!(st && st.weights), wt = own ? st.weights : WEIGHT;
    const names = lib.names, tot = names.reduce((a, n) => a + (wt[n] != null ? wt[n] : own ? 0 : 1), 0);
    let r = rnd() * tot;
    for (const n of names) { r -= wt[n] != null ? wt[n] : own ? 0 : 1; if (r <= 0) return n; }
    return names[0];
  }

  // the palette a look gives a character, linear RGB, padded to N
  function colours(extras, look) {
    const pal = extras.palette, cls = extras.classes;
    const skinRef = (pal[cls.indexOf('skin')] || [0.617])[0];
    const c = k => (look[k] ? lin(look[k]) : null);
    const skin = c('skin'), hair = c('hair'), top = c('top'), legs = c('legs');
    const out = [];
    for (let i = 0; i < N; i++) {
      const p = pal[i] || [0, 0, 0], k = cls[i];
      let v = new THREE.Color(p[0], p[1], p[2]);
      if (k === 'skin' && skin) v = skin.clone().multiplyScalar(p[0] / skinRef);
      else if (k === 'hair' && hair) v = hair.clone();
      else if (k === 'brows' && hair) v = hair.clone().multiplyScalar(0.6);
      else if (k === 'top' && top) v = top.clone();
      else if (k === 'legs' && legs) v = legs.clone();
      out.push(new THREE.Vector3(v.r, v.g, v.b));
    }
    return out;
  }

  // ------------------------------------------------------------ someone at the lens (issues 82 and 129)
  // Nobody is drawn half. Until issue 129 a person near the chase camera was dissolved in a 4x4 ordered dither over a
  // band of distance (whole at 3.2 m, gone at 2 m): a state that someone standing in the band stayed in, read at a
  // desktop's size as a screen of dots with the street showing through them, and laid over a clear umbrella's own
  // see-through. A camera in a crowd does not see through the people beside it: one of the crowd is in the picture,
  // whole, or out of it, whole, with their umbrella and their shadow (game.js lensClear decides it for each of them,
  // with a margin between going and coming back so nobody blinks at the edge; the crowd's renderer takes them out:
  // hide(i, true)). No material of a person's has a fade in it, so the story's people and the one you play have none.

  // ------------------------------------------------------------ the street lights on people
  // setLight(patch): a shader patch every person's material takes from then on (world.js
  // streetLit: after dark the street lights' pool where they stand lights them as it lights the
  // pavement, so the player and the people they meet are not silhouettes under a lamp). cap: the picture's ceiling for a
  // face that gives light (world.js faceCap, atmosphere.js), which the street's light on a person is held under (CAST_END)
  let streetLit = null, castCap = null;
  function setLight(patch, cap = null) { streetLit = patch; castCap = cap; }

  // ------------------------------------------------------------ a person in the street's light (issue 123)
  // The street lights, shop windows and screens reach a person as one colour where they stand (world.js streetLight),
  // and it was laid on them evenly, as on the paving: a face, a cardigan and a head of hair with no form in the light
  // that is most of what lights them from dusk on. A person is lit here as a film lights one in a street at night
  // (docs/LOOK.md, "People in the street's light"), from that same colour and the sky's, with no new picture and no
  // new program:
  // - a key: the street's light from the lens's side, above and to one side, wrapped (cloth: a knit lets light round;
  //   skin: further in the red than the blue, as light scattered under skin leaves the terminator warm: Penner's
  //   pre-integrated skin as a three-term wrap), and the far side left at four tenths of it;
  // - a rim: the screens and the sky behind on the other side, on the outline that faces them (Mitchell et al.'s rim
  //   term in Team Fortress 2, coloured by the light that is there);
  // - cloth's sheen: the fibres standing off a knit or a wool catch light at grazing angles, all round (the shape of
  //   Estevez and Kulla's sheen lobe, as a Fresnel-like term: no second BRDF);
  // - on a desktop (castFull), skin's broad highlight toward the key: the oil on a cheekbone and the bridge of a nose.
  // Skin is told from cloth by the character's mask where its picture has one (OE_SKIN_MASK), by the head's own
  // material (its hair marked by strandHair), or by its colour.
  const castFull = () => { const Q = window.OEQuality && OEQuality.city ? OEQuality.city() : null; return !(Q && Q.lean); };
  const CAST_LINE = 'totalEmissiveRadiance += diffuseColor.rgb * streetLight(transpose(mat3(viewMatrix)) * (-vViewPosition - viewMatrix[3].xyz));';
  const CAST_FS = `vec3 oeCastSt = vec3(0.0); float oeCastHair = 0.0, oeCastSkin = -1.0;
float oeCastIsSkin(vec4 c) {
#ifdef OE_SKIN_MASK
  return 1.0 - smoothstep(0.86, 0.95, c.a);
#else
  float s = c.r + c.g + c.b, w = (c.r - c.b) / max(s, 1e-3);
  return step(c.g, c.r) * step(c.b, c.g) * smoothstep(0.1, 0.16, w) * (1.0 - smoothstep(0.36, 0.44, w)) * smoothstep(0.1, 0.2, c.r);
#endif
}`;
  const CAST_END = `
{ vec3 cV = normalize(vViewPosition), cN = normal;
  vec3 cUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), cR = normalize(cross(cUp, cV) + vec3(1e-4, 0.0, 0.0)); // (never nought: a view straight down made it NaN, a black pixel)
  vec3 cSky = vec3(0.0);
#if NUM_HEMI_LIGHTS > 0
  cSky = hemisphereLights[0].skyColor;
#endif
  // (from dusk the lit fronts round a street light a person before the street lights do: the sky's light stands for
  // them, warmed, until the day is bright enough to drown them)
  float cDk = 1.0 - smoothstep(0.25, 0.6, dot(cSky, vec3(0.3333)));
  cSky *= mix(1.0, 4.0, cDk);
  vec3 cSt = oeCastSt + cSky * vec3(1.0, 0.88, 0.74) * (0.3 * cDk);
  float cSkin = (oeCastSkin < 0.0 ? oeCastIsSkin(diffuseColor) : oeCastSkin) * (1.0 - oeCastHair), cCloth = (1.0 - cSkin) * (1.0 - oeCastHair);
  // (a near-white taken down for this light, as a film's wardrobe takes a white shirt down to an off-white: the key,
  // rim and sheen give a person more than the paving under them takes, and a shirt at cotton's 0.72 went over the
  // tone curve's shoulder, brighter at night than at noon and without its folds. Above 0.4 a colour keeps two fifths
  // of its lightness, its hue as it is; skin, hair and darker cloth are below it. By day this light is nothing and a
  // white is as white as its picture: the knee is this light's alone)
  vec3 cAlb = material.diffuseColor;
  { float cY = dot(cAlb, vec3(0.2126, 0.7152, 0.0722)); if (cY > 0.4) cAlb *= (0.4 + (cY - 0.4) * 0.4) / cY; }
  float cNV = clamp(dot(cN, cV), 0.0, 1.0);
  // the key
  vec3 cK = normalize(cV * 0.5 + cUp * 0.6 + cR * 0.65);
  float cKd = dot(cN, cK);
  vec3 cW = mix(vec3(0.3), vec3(0.8, 0.42, 0.28), cSkin);
  vec3 cKey = clamp((cKd + cW) / (1.0 + cW), 0.0, 1.0);
  vec3 cOut = cAlb * (oeCastSt * (0.4 + 1.1 * cKey) + (cSt - oeCastSt) * (1.3 * cKey - 0.25));
  // the rim: the outline that faces the screens behind, on the other side
  vec3 cE = cSky * 0.5 + oeCastSt * 1.3;
  float cF = 1.0 - cNV, cRim = cF * cF * cF * smoothstep(-0.25, 0.55, dot(cN, normalize(cUp * 0.45 - cR * 0.8)));
  cOut += cE * cRim * (cAlb * 0.7 + mix(0.03, 0.05, cSkin)) * (1.0 - oeCastHair);
  // cloth's sheen
  cOut += cE * (cF * cF * cF * cF) * cCloth * mix(cAlb, vec3(dot(cAlb, vec3(0.3333))), 0.5) * 0.45;
#ifdef OE_CAST_FULL
  // skin's broad highlight toward the key
  cOut += cE * cSkin * 0.035 * pow(max(dot(cN, normalize(cK + cV)), 0.0), 22.0);
#endif
  // (and the whole of it held under a ceiling set where the picture is, as a sign's face is (world.js faceCap): eased in
  // from a third of a face's and never past three fifths of it, about where a white shirt lands in the noon sun. The key,
  // the rim, the sheen and the dusk's sky give a person more than the paving under them takes, and a near-white went
  // past the tone curve's shoulder, the brightest thing in a crowd at the Center Gai gate and brighter than it is at noon.
  // Taken on its luminance, so a face, whose red runs well over its lightness, stays under the knee with darker cloth)
  { float cP = dot(cOut, vec3(0.2126, 0.7152, 0.0722)), cK = 0.35 * uCastCap, cR = 0.25 * uCastCap;
    if (cP > cK) cOut *= (cK + cR * (1.0 - exp(-(cP - cK) / cR))) / cP; }
  totalEmissiveRadiance += cOut; }`;
  const CAST_NOCAP = { value: 1e4 }; // (no ceiling given: none)
  function castPatch(sh) {
    if (!sh.fragmentShader.includes(CAST_LINE) || !sh.fragmentShader.includes('#include <lights_fragment_end>')) return;
    sh.uniforms.uCastCap = castCap || CAST_NOCAP;
    sh.fragmentShader = sh.fragmentShader.replace(CAST_LINE, 'oeCastSt = streetLight(transpose(mat3(viewMatrix)) * (-vViewPosition - viewMatrix[3].xyz));')
      .replace('#include <common>', `#include <common>\nuniform float uCastCap;\n${castFull() ? '#define OE_CAST_FULL\n' : ''}${CAST_FS}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>${CAST_END}`);
  }
  function litMaterial(m) {
    if (!streetLit || !m || !m.isMeshStandardMaterial || m.userData.streetLit) return;
    const own = m.onBeforeCompile, patch = streetLit, key = m.customProgramCacheKey;
    m.onBeforeCompile = (sh, r) => { if (own) own.call(m, sh, r); patch(sh); castPatch(sh); };
    // three.js keys a program by the text of onBeforeCompile, which this wrapper makes alike for all
    m.customProgramCacheKey = () => `person-lit2${castFull() ? 'f' : ''}|${key ? key.call(m) : ''}|${own ? own.toString() : ''}`;
    m.userData.streetLit = true;
    m.needsUpdate = true;
  }

  // ------------------------------------------------------------ hair: strands, not a shell (issue 74)
  // An avatar's hair is two things: the hair cards (its *_opacity material: strips cut out of a picture of strands)
  // and, under them, hair painted on the head's own mesh (a long head of hair falls down the back as part of the head).
  // Both were drawn as any other surface: the cards cut at one alpha, everything lit as a matte skin. Over a shoulder,
  // close, that is one black shell with a hem cut in teeth. They are drawn here as real-time hair is drawn on cards
  // (docs/LOOK.md "Hair: strands, not a shell"):
  // - the cards' edge: with MSAA on (a desktop's composer), alpha to coverage: each strand cut at its own alpha, so the
  //   ends thin out strand by strand instead of stopping in a hem, the cut sharpened across a pixel (Golus's
  //   anti-aliased alpha test), and the texture's alpha kept from fading in its smaller mips (the strands otherwise go
  //   as the head goes away); the head's painted hair opened between its strands toward its outline. Without MSAA (a
  //   phone), the cut at the same alpha as before and the head whole: the same pixels, with the light and tone below;
  // - its light: Kajiya-Kay's strand highlight, two lobes shifted along the strand (Scheuermann, ATI 2004), the first
  //   white, the second tinted by the hair: from every light the game has (the moon, the sun, the street lights' fill,
  //   the cars' lamps), and from the street round the head (the hemisphere's sky and the street lights' and screens'
  //   own light where the head is, world.js streetLight), as the lit fronts all round a crossing light it; and that
  //   light through the thin strands at the edge, as a backlit head of hair glows at its rim;
  // - its tone: a darker root, the ends a little lighter, as hair is denser and shaded at the scalp.
  // Each vertex carries the strand's way (from the crown, down over the head), how near the scalp it is (hairTR), the way round
  // the head and, on the head's mesh, whether it is hair or skin (hairSK): strandHair, once per character. The shading is in the
  // hair's own fragments (on the head, the face's too, where it adds nothing): a few dozen instructions.
  const hairMS = { value: 1 }; // (1: the target drawn into has samples: alpha to coverage takes the strands' alpha)
  const HAIR_VS = ['attribute vec4 hairTR; attribute vec2 hairSK; varying vec3 vHairT; varying float vHairRoot, vHairS;\n#ifdef HAIR_HEAD\nvarying float vHairK;\n#endif', `
vec3 hairT0 = hairTR.xyz;
#ifdef USE_SKINNING
hairT0 = (skinMatrix * vec4(hairT0, 0.0)).xyz;
#endif
vHairT = normalMatrix * hairT0; vHairRoot = hairTR.w; vHairS = hairSK.x;
#ifdef HAIR_HEAD
vHairK = hairSK.y;
#endif`];
  const HAIR_FS = `uniform float uHairMS; varying vec3 vHairT; varying float vHairRoot, vHairS;
#ifdef HAIR_HEAD
varying float vHairK;
#else
#define vHairK 1.0
#endif
float hairA = 1.0, hairJ = 0.0, hairOcc = 1.0;
// the strands: clumps side by side round the head (vHairS: the way round it, in clumps), each its own shade, a finer
// grain over them, and both gone where a pixel spans several clumps (no shimmer as the head goes away)
float hairHash(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float hairNoise(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hairHash(i), hairHash(i + 1.0), f); }
float hairStrands() {
  float w = fwidth(vHairS);
  return (0.65 * (hairNoise(vHairS) - 0.5) * (1.0 - smoothstep(0.4, 1.2, w)) + 0.35 * (hairNoise(vHairS * 3.7 + 17.0) - 0.5) * (1.0 - smoothstep(0.1, 0.35, w))) * 2.0;
}
// Kajiya-Kay's highlight along a strand of way t, at half vector h (Scheuermann's form: sin^e of the angle to h)
float hairKK(vec3 t, vec3 h, float e) { float th = dot(t, h); return smoothstep(-1.0, 0.0, th) * pow(max(1.0 - th * th, 0.0), 0.5 * e); }
// what light keeps of its colour through a fibre and out again (Marschner's TT and TRT), from the hair's albedo (light
// scattered many times among the strands): black hair's pigment takes nearly all of it, grey and blonde let most of it
// through; black hair a little warm, as eumelanin is (the relation is Chiang et al.'s, 2016, in a power's form)
vec3 hairPass(vec3 a) {
  a = max(a, vec3(1e-4));
  return pow(a, vec3(0.8)) * mix(vec3(1.5, 1.0, 0.65), vec3(1.0), smoothstep(0.004, 0.03, dot(a, vec3(0.3333))));
}
// Marschner's R and TRT as Scheuermann's two shifted Kajiya-Kay lobes, weighted as a fibre of index 1.55 weights them:
// R, the cuticle's own reflection, white, some 6% at its peak and narrow (5 degrees), toward the root; TRT, into the
// fibre and back off its far wall, twice as broad and toward the tip, in the colour the pigment lets through twice (c2:
// next to none from black hair, whose only highlight is R). Each strand's highlight moved and its strength set by its
// clump's shade (a band that breaks into strands near, and is whole only where a pixel spans many). And none on the side
// of the head away from the light: the hair's own mass shadows it (the normal here is the head of hair's, out from its
// middle, as hair on cards is shadowed: the underside of a bun, the hem of a fringe, lit from above, stay dark)
// (env: 1 for the light of the street round the head, which comes from a lit front's or a screen's whole width, not a
// lamp's point: both lobes broader)
vec3 hairLobes(vec3 n, vec3 v, vec3 l, vec3 c2, float env) {
  vec3 t = normalize(vHairT), h = normalize(v + l + vec3(0.0, 1e-4, 0.0)); // (never nought: the light straight behind the hair)
  vec3 t1 = normalize(t + n * (-0.07 + 0.1 * hairJ)), t2 = normalize(t + n * (0.12 + 0.1 * hairJ));
  float spark = 0.3 + 1.4 * clamp(0.5 + hairJ, 0.0, 1.0);
  // (HAIR_HEAD: the hair painted on a head's own mesh. Issue 123 took its lobes and the cards' to half, against lobes that
  // gave black hair a grey sheen fifty times its own; weighted as a fibre weights them they leave black hair black at
  // full, and at half the head read as one dark shell in the close shot, #186 B)
#ifdef HAIR_HEAD
  float hK = vHairK;
#else
  float hK = 1.0;
#endif
  return (vec3(mix(0.07, 0.06, env) * hairKK(t1, h, mix(110.0, 64.0, env))) + c2 * (0.14 * hairKK(t2, h, mix(30.0, 20.0, env)))) * spark * hK * smoothstep(-0.25, 0.35, dot(n, l));
}`;
  // head: the head's own mesh (its hair painted on it, hairSK.y), not the cards
  function hairMaterial(m, head = false) {
    if (!m || m.userData.oeStrand) return;
    m.userData.oeStrand = true;
    m.alphaToCoverage = true; // (where the target has no samples the GPU ignores it: the shader cuts as before)
    m.onBeforeRender = r => { const t = r.getRenderTarget(); hairMS.value = (t ? t.samples > 0 : r.getContext().getContextAttributes().antialias) ? 1 : 0; };
    const own = m.onBeforeCompile, key = m.customProgramCacheKey;
    m.onBeforeCompile = (sh, r) => {
      if (own) own.call(m, sh, r);
      const street = /vec3 streetLight\(/.test(sh.fragmentShader), H = head ? '#define HAIR_HEAD\n' : '';
      const cast = /float oeCastHair/.test(sh.fragmentShader) ? (head ? 'oeCastHair = vHairK; oeCastSkin = 1.0;' : 'oeCastHair = 1.0;') : ''; // (castPatch: hair is not skin or cloth; the rest of a head is skin)
      sh.uniforms.uHairMS = hairMS;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${H}${HAIR_VS[0]}`)
        .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>${HAIR_VS[1]}`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${H}${HAIR_FS}`)
        // the tone: the strands each their own shade, the root darker, the ends lighter
        .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
{ hairJ = clamp(hairStrands(), -1.0, 1.0);
#ifndef HAIR_HEAD
  hairA = texture2D(map, vMapUv).a;
  // (the alpha's smaller mips average the strands away: kept up as far as a texel's footprint grows)
  vec2 hSz = vec2(textureSize(map, 0)), hdx = dFdx(vMapUv * hSz), hdy = dFdy(vMapUv * hSz);
  if (uHairMS > 0.5) diffuseColor.a *= 1.0 + 0.22 * max(0.5 * log2(max(dot(hdx, hdx), dot(hdy, hdy))), 0.0);
#endif
}
#endif
// (where a card's strands thin out they lie deeper among the others, under the hair over them: a shade darker, as a
// depth map shades a card's fringe in a film's hair, not paler; issue 170)
float hDeep = smoothstep(0.2, 0.9, hairA);
diffuseColor.rgb *= mix(1.0, mix(1.0, 0.55, vHairRoot) * mix(0.72, 1.0, hDeep) * (1.0 + 0.12 * hairJ), vHairK);
// (how much of the light round the head reaches a strand: a card near the scalp lies under the others, half of it; the
// head's painted hair shows only where it is the outside, slicked back or tied, and takes nearly all)
#ifdef HAIR_HEAD
hairOcc = 0.9;
#else
hairOcc = mix(1.0, 0.5, vHairRoot) * mix(0.55, 1.0, hDeep); // (and less of it at the fringe, deeper in)
#endif
${cast}`)
        // the cards' edge (material.alphaTest stays, for the shadow's depth and the define)
        .replace('#include <alphatest_fragment>', `#ifdef USE_ALPHATEST
if (uHairMS > 0.5) {
  // each strand cut at its own alpha (a third of the cut to one and a quarter of it, by its shade), so where the
  // picture's strands thin out they end one by one at their own lengths; and the cut sharpened across a pixel (Golus),
  // so the coverage is whole or none but at the cut itself, and the GPU's dither is not seen
  float hThr = alphaTest * (0.3 + 0.95 * clamp(0.5 + 0.5 * hairJ, 0.0, 1.0));
  float hw = max(fwidth(diffuseColor.a), 1e-3);
  diffuseColor.a = clamp((diffuseColor.a - hThr) / hw + 0.5, 0.0, 1.0);
  // (and between the strands a card lets the hair under it through: its straight top edge, where it lies on the head,
  // breaks into strands instead of a ledge)
  diffuseColor.a *= 1.0 - clamp((-hairJ - 0.45) / max(fwidth(hairJ), 1e-3) + 0.5, 0.0, 1.0);
  if (diffuseColor.a < 0.02) discard;
} else {
  if (diffuseColor.a < alphaTest) discard;
  diffuseColor.a = 1.0;
}
#endif
#ifdef HAIR_HEAD
// (the head's painted hair, where it turns from the lens: its outline let through between the strands, by the
// picture's grain, as the cards' ends are; without samples it stays whole)
diffuseColor.a = 1.0;
if (uHairMS > 0.5 && vHairK > 0.01) {
  // (the gaps open from the outline in: a strand's shade below a threshold that rises towards it, cut clean, so the
  // coverage is whole or none and the GPU's dither is not seen)
  float hEdge = smoothstep(0.6, 0.95, 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)))) * vHairK * (1.0 - 0.6 * vHairRoot);
  float hX = -hairJ + 1.3 * hEdge - 1.0;
  diffuseColor.a = 1.0 - clamp(hX / max(fwidth(hX), 1e-3) + 0.5, 0.0, 1.0);
  if (diffuseColor.a < 0.12) discard;
}
#endif`)
        // every light the game has: the strand's two lobes, and a softer wrap of its diffuse (light passes into hair).
        // The physical model's own highlight (a round GGX lobe on the head's normal, which points out from the middle
        // of the head) is a plastic cap on a head of hair: it is kept for the skin of the head's mesh alone
        .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
void RE_Direct_Hair(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  ReflectedLight hP = ReflectedLight(vec3(0.0), vec3(0.0), vec3(0.0), vec3(0.0));
  RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, hP);
  reflectedLight.directDiffuse += hP.directDiffuse;
  reflectedLight.directSpecular += hP.directSpecular * (1.0 - vHairK);
  float nl = dot(geometryNormal, directLight.direction);
  reflectedLight.directDiffuse += directLight.color * BRDF_Lambert(material.diffuseColor) * 0.3 * vHairK * clamp(1.0 - abs(nl) * 1.6, 0.0, 1.0);
  reflectedLight.directSpecular += directLight.color * hairLobes(geometryNormal, geometryViewDir, directLight.direction, hairPass(material.diffuseColor), 0.0) * hairOcc;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Hair
#if NUM_RECT_AREA_LIGHTS > 0
// (a screen's light, neon.js: on hair its band across the strands in the screen's colour, toward the screen's middle,
// at the light the screen gives here as its diffuse measured it, in place of the round sheen)
void RE_Direct_RectArea_Hair(const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  ReflectedLight hP = ReflectedLight(vec3(0.0), vec3(0.0), vec3(0.0), vec3(0.0));
  RE_Direct_RectArea_Physical(rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, hP);
  reflectedLight.directDiffuse += hP.directDiffuse;
  reflectedLight.directSpecular += hP.directSpecular * (1.0 - vHairK);
  vec3 hEr = hP.directDiffuse / max(material.diffuseContribution, vec3(1e-3)) * PI;
  reflectedLight.directSpecular += hEr * hairLobes(geometryNormal, geometryViewDir, normalize(rectAreaLight.position - geometryPosition), hairPass(material.diffuseColor), 1.0) * hairOcc;
}
#undef RE_Direct_RectArea
#define RE_Direct_RectArea RE_Direct_RectArea_Hair
#endif`)
        // the street round the head: the sky, and the street lights' and screens' light where it stands (from above and
        // behind the lens, as the screens and lit fronts all round a crossing light it), and that light through the
        // thin strands at the edge
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{ vec3 hE = vec3(0.0);
#if NUM_HEMI_LIGHTS > 0
  // (from dusk the lit fronts and screens round a street are most of what a head of hair reflects, and the sky's own
  // light, which is all the game's lights say of them before the street lights come on, is a quarter of it)
  // (the lit fronts' share in their own warm white at the sky's brightness: in the sky's blue it laid a blue sheen on black hair)
  { vec3 hSky = hemisphereLights[0].skyColor; float hSl = dot(hSky, vec3(0.3333));
    hE += hSky + vec3(1.1, 0.95, 0.8) * (1.5 * hSl * (1.0 - smoothstep(0.25, 0.6, hSl))); }
#endif
${street ? `  // (the street's light where the head is goes from a lamp's pool to the dark between two lamps in a few steps: on hair,
  // whose highlight is broad light reflected, it is taken with a knee, so that walking from one pool to the next the
  // highlight breathes rather than coming and going)
  { vec3 hSt = streetLight(transpose(mat3(viewMatrix)) * (-vViewPosition - viewMatrix[3].xyz)); hE += hSt * 1.6 / (1.0 + 2.0 * dot(hSt, vec3(0.3333))); }` : ''}
  vec3 hV = normalize(vViewPosition), hUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), hSd = normalize(cross(hUp, hV));
  vec3 hL = normalize(hV - hUp * dot(hV, hUp) + hUp * 0.55), hC2 = hairPass(material.diffuseColor);
  // (the lit fronts behind the lens: one band across the head where the lens sees its strands broadside; and the screens
  // behind on the other side, a fainter one. A third band, from the cast's key to the lens's side, and a second lobe in
  // a warm grey that black hair was given too, laid a sheen over the whole head: a wig's, or wet plastic's)
  reflectedLight.indirectSpecular += hE * hairOcc * (hairLobes(normal, hV, hL, hC2, 1.0) * 0.9 + hairLobes(normal, hV, normalize(hUp * 0.5 - hSd * 0.8 - hV * 0.35), hC2, 1.0) * 0.35);
  // (light scattered among the strands: Karis's stand-in, a wrap round the strand's own normal toward the lens, in the
  // colour the pigment lets through)
  { vec3 hT = normalize(vHairT), hFn = normalize(hV - hT * dot(hV, hT));
    reflectedLight.indirectDiffuse += hE * sqrt(hC2) * 0.03 * clamp((dot(hFn, hL) + 1.0) * 0.5, 0.0, 1.0) * mix(0.5, 1.0, 1.0 - vHairRoot) * vHairK; }
  float hRim = pow(max(0.0, 1.0 - abs(dot(normal, hV))), 2.0), hThin = (1.0 - smoothstep(0.35, 1.0, hairA)) * hRim;
  // (light comes through thin strands only where nothing but the street is behind them: at the outline of the head of
  // hair. A card's own fringe inside it lies over more hair, and lit there it drew a white lace round every card of a
  // grey or brown head, issue 170)
  // (light through the thin strands and the outline, TT, in the colour the pigment lets through twice: a grey or blonde
  // head glows at its edge against a lit front, a black one stays dark there, as in a photograph; and off the strands at
  // a grazing angle a little of the cuticle's own white, as Fresnel rises toward grazing)
  reflectedLight.indirectDiffuse += hE * hC2 * (0.2 * hThin + 0.3 * hRim) * (1.0 - 0.8 * vHairRoot) * vHairK;
  reflectedLight.indirectSpecular += hE * 0.03 * hRim * hRim * hairOcc * vHairK; }`);
    };
    m.customProgramCacheKey = () => `strand-hair8${head ? '-head' : ''}|${key ? key.call(m) : ''}|${own ? own.toString() : ''}`;
    m.needsUpdate = true;
  }
  // The strand's way at each vertex, how near the scalp it is (hairTR: xyz, w) and on the head's mesh whether it is hair
  // (hairSK: the way round the head, in clumps of strands, and on the head's mesh 1 where it is hair), in the mesh's own frame at its bind pose. Up runs from the pelvis to the head; the skull is a ball round the
  // middle of the head (a hand over the head's bone, at the skull's foot), the crown on top of it; a strand runs from
  // the crown down over the head (the vertex's way from the crown, laid along the hair's surface: its normal); its
  // root is on the skull, the ends a hand and more off it. On the head's mesh a vertex is hair where its picture is
  // (sample(u, v) -> linear rgb: dark, or without the warmth of skin) above the brows or behind the ears.
  // under: the head's mesh, done first: a card near its hair takes the normal of the hair under it, so that card and
  // head are lit as one head of hair and the card's edge is not seen as a ledge (roundHair's otherwise)
  // (a joint's place in a mesh's own vertices' space: the inverse of its bind matrix, not mesh.bindMatrixInverse, which an
  // attached mesh sets to its node's inverse each time the scene is updated. A face's mesh hangs on a node a hundredth
  // the size and turned, so once the model had been in a scene the skull was looked for sixty units over the pelvis,
  // every vertex was a metre and a half "off the skull", and the head's hair was never marked as hair, issue 123)
  let BIND_M = null; // (made when first asked: three.js is not there yet as this script loads)
  const bindInv = mesh => (BIND_M || (BIND_M = new THREE.Matrix4())).copy(mesh.bindMatrix).invert();
  function strandHair(mesh, sample = null, under = null) {
    const g = mesh.geometry, P = g.attributes.position, Nn = g.attributes.normal, UV = g.attributes.uv;
    if (!P || !Nn || g.attributes.hairTR) return;
    const at = re => {
      const sk = mesh.skeleton, i = sk ? sk.bones.findIndex(b => re.test(b.name)) : -1;
      if (i < 0) return null;
      return new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[i].clone().invert().premultiply(bindInv(mesh)));
    };
    const hb = at(/Head$/), pb = at(/Pelvis$/) || at(/Spine$/), re = at(/REye$/), le = at(/LEye$/);
    g.computeBoundingBox();
    const v = new THREE.Vector3(), n = new THREE.Vector3(), d = new THREE.Vector3();
    let up, u, S;
    if (hb && pb) {
      up = hb.clone().sub(pb).normalize();
      u = hb.distanceTo(pb) / 0.6; // (the mesh's units in metres: a pelvis is about 60 cm under the skull's foot)
      S = hb.clone().addScaledVector(up, 0.085 * u);
    } else { // (no rig to go by: the hair's own box)
      up = new THREE.Vector3(0, 1, 0); S = g.boundingBox.getCenter(new THREE.Vector3());
      u = (g.boundingBox.max.y - g.boundingBox.min.y) / 0.3;
    }
    const R = 0.095 * u, crown = S.clone().addScaledVector(up, R);
    const eye = re && le ? re.clone().add(le).multiplyScalar(0.5) : null;
    const fwd = eye ? eye.clone().sub(S).addScaledVector(up, -eye.clone().sub(S).dot(up)).normalize() : null;
    const ahead = fwd || new THREE.Vector3(1, 0, 0).addScaledVector(up, -up.x).normalize(), side = up.clone().cross(ahead);
    const head = !!sample && !!UV;
    // (the hair of the head's mesh under the cards: its vertices and normals, in this mesh's frame: they share the rig)
    let UP = null, UN = null;
    const uq = under && under.geometry.attributes, uk = uq && uq.hairSK;
    if (uk && uq.normal) {
      const p0 = [], n0 = [];
      for (let j = 0; j < uk.count; j++) if (uk.getY(j) > 0.5) { p0.push(uq.position.getX(j), uq.position.getY(j), uq.position.getZ(j)); n0.push(uq.normal.getX(j), uq.normal.getY(j), uq.normal.getZ(j)); }
      if (p0.length) { UP = p0; UN = n0; }
    }
    // (the way round the head from the back, in clumps of strands, about 160 round: 4 mm at the skull. It wraps at the
    // face, where the head's own mesh is skin)
    const out = new Float32Array(P.count * 4), SK = new Float32Array(P.count * 2), CL = 160 / (2 * Math.PI);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); n.fromBufferAttribute(Nn, i);
      if (UP) {
        let best = Infinity, bj = -1;
        for (let j = 0; j < UP.length; j += 3) { const dx = UP[j] - v.x, dy = UP[j + 1] - v.y, dz = UP[j + 2] - v.z, dd = dx * dx + dy * dy + dz * dz; if (dd < best) { best = dd; bj = j; } }
        const w = 1 - Math.min(1, Math.max(0, (Math.sqrt(best) / u - 0.03) / 0.09));
        if (w > 0) { n.lerp(d.set(UN[bj], UN[bj + 1], UN[bj + 2]), w).normalize(); Nn.setXYZ(i, n.x, n.y, n.z); }
      }
      d.copy(v).sub(crown); d.addScaledVector(n, -d.dot(n));
      if (d.lengthSq() < 1e-4 * R * R) { d.copy(up).negate(); d.addScaledVector(n, -d.dot(n)); }
      d.normalize();
      const off = (v.distanceTo(S) - R) / u; // (metres off the skull)
      const root = 1 - Math.min(1, Math.max(0, (off - 0.005) / 0.16));
      out.set([d.x, d.y, d.z, root * root * (3 - 2 * root)], i * 4);
      const q = v.clone().sub(S);
      SK[2 * i] = Math.atan2(q.dot(side), -q.dot(ahead)) * CL;
      SK[2 * i + 1] = head ? 0 : 1;
      if (head) {
        const where = !eye || v.clone().sub(eye).dot(up) > 0.035 * u || v.clone().sub(eye).dot(fwd) < -0.085 * u;
        const c = where ? sample(UV.getX(i), UV.getY(i)) : null;
        if (c) {
          const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], warm = (c[0] - c[2]) / Math.max(1e-3, c[0] + c[1] + c[2]);
          SK[2 * i + 1] = lum < 0.05 ? 1 : warm < 0.12 ? 1 : 0; // (black and brown hair is dark; grey and white hair has no warmth)
        }
      }
    }
    g.setAttribute('hairTR', new THREE.BufferAttribute(out, 4));
    g.setAttribute('hairSK', new THREE.BufferAttribute(SK, 2));
    if (UP) { Nn.needsUpdate = true; looseEnds(g, UP, S, up, u, ahead); }
  }
  // The cards that hang loose: below the nape the cards lie along the head's painted hair where it goes in under the
  // collar, and come out of the jacket in strips beside the lock, a fringe of tassels round the hair's end (the owner,
  // 23 November 2026); below the ears a card off the painted hair, or past its hem, hangs in the air over the back.
  // Those triangles are left out: below the nape a long head of hair is its painted lock, and the cards stay round the
  // head. (In the mesh's own frame, once a character; UP: the head's hair's vertices)
  function looseEnds(g, UP, S, up, u, ahead) {
    const P = g.attributes.position, ix = g.index;
    if (!ix) return;
    let hem = Infinity;
    for (let j = 0; j < UP.length; j += 3) hem = Math.min(hem, ((UP[j] - S.x) * up.x + (UP[j + 1] - S.y) * up.y + (UP[j + 2] - S.z) * up.z) / u);
    const loose = new Uint8Array(P.count), v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      const h = v.clone().sub(S).dot(up) / u; // (metres over the skull's middle)
      if (h > -0.09) continue; // (above the ears: a fringe, a parting, the hair over the ears stays as built)
      let best = Infinity;
      for (let j = 0; j < UP.length; j += 3) { const dx = UP[j] - v.x, dy = UP[j + 1] - v.y, dz = UP[j + 2] - v.z; best = Math.min(best, dx * dx + dy * dy + dz * dz); }
      const back = v.clone().sub(S).dot(ahead) / u < -0.02; // (behind the neck, where the collar is)
      loose[i] = h < (back ? -0.11 : -0.15) || h < hem + 0.005 || Math.sqrt(best) / u > 0.018 ? 1 : 0; // (the nape, 11 cm under the skull's middle behind, 15 at the sides)
    }
    const a = ix.array, keep = [];
    for (let t = 0; t < a.length; t += 3) if (!(loose[a[t]] && loose[a[t + 1]] && loose[a[t + 2]])) keep.push(a[t], a[t + 1], a[t + 2]);
    if (keep.length < a.length) { g.setIndex(new THREE.BufferAttribute(new a.constructor(keep), 1)); g.userData.oeLoose = (a.length - keep.length) / 3; }
  }

  // ------------------------------------------------------------ an afterimage: a person in an old exposure
  // Someone of another year standing in tonight's street (the story's afterimages, game.js figure; docs/PAST.md). One
  // look for all of them, the look past.js gives the things of 1964: their own body, face and clothes, in a silver
  // print's tones (a warm grey with a little of the colour left, the blacks lifted to the paper's), a fine grain that
  // lives, and a soft light on the edge. Laid over the street as a second exposure is laid over a first: where they
  // are dark the street shows through, where they are light they are solid, so that against a lit shop front they
  // are half there and against the night they stand whole. No outline, no glow, no blue.
  // exposure(root): every mesh under root drawn so; the materials are the person's own, cloned and patched on top.
  const EXPOSURE = `
vec3 xpN = normalize(normal);
float xpKey = max(dot(xpN, normalize((viewMatrix * vec4(0.35, 0.85, 0.4, 0.0)).xyz)), 0.0);
float xpRim = pow(max(0.0, 1.0 - abs(dot(xpN, normalize(vViewPosition)))), 3.0);
vec3 xpC = gl_FragColor.rgb + diffuseColor.rgb * (0.04 + 0.1 * xpKey) * uXpLift;
float xpV = sqrt(max(dot(xpC, vec3(0.3, 0.59, 0.11)), 0.0));
vec3 xpP = mix(vec3(0.26, 0.245, 0.225), vec3(1.0, 0.95, 0.86), smoothstep(-0.02, 0.95, xpV));
vec3 xpT = xpP * xpP * (0.78 + 0.44 * sqrt(max(xpC, 0.0)) / max(xpV, 0.03) * 0.5);
xpC = mix(xpC, xpT, 0.85);
xpC += vec3(1.0, 0.9, 0.74) * xpRim * 0.08 * (0.3 + xpV);
float xpG = fract(sin(dot(floor(gl_FragCoord.xy / 1.5) + floor(uXpT * 24.0) * vec2(17.0, 31.0), vec2(12.9898, 78.233))) * 43758.5453);
xpC *= 1.0 + (xpG - 0.5) * 0.12;
xpV = sqrt(max(dot(xpC, vec3(0.3, 0.59, 0.11)), 0.0));
gl_FragColor = vec4(xpC, 1.0 - 0.32 * (1.0 - smoothstep(0.08, 0.5, xpV)));`;
  const xpU = { uXpT: { value: 0 }, uXpLift: { value: 1 } }, xpMade = new WeakMap(), xpOwn = new WeakSet();
  function exposure(root) {
    const one = m => {
      if (!m || xpOwn.has(m)) return m;
      if (xpMade.has(m)) return xpMade.get(m); // (one clone a material: the same character twice is one program)
      const c = m.clone(), own = m.onBeforeCompile, key = m.customProgramCacheKey;
      c.userData = m.userData; // (the palette's uniforms, shared: clone() passes userData through JSON)
      c.onBeforeCompile = (sh, r) => {
        if (own) own.call(m, sh, r);
        Object.assign(sh.uniforms, xpU);
        if (sh.uniforms.uHairMS) sh.uniforms.uHairMS = { value: 0 }; // (hair, issue 74: cut as without samples; it is laid over the street, not covered)
        sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform float uXpT, uXpLift;\nvoid main() {')
          .replace('#include <dithering_fragment>', `#include <dithering_fragment>${EXPOSURE}`);
      };
      c.customProgramCacheKey = () => `exposure|${key ? key.call(m) : ''}|${own ? own.toString() : ''}`;
      // (a second exposure: what it adds, over what was there let through as it is dark: one, one minus its alpha)
      Object.assign(c, { alphaToCoverage: false, transparent: true, depthWrite: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
      xpMade.set(m, c); xpOwn.add(c);
      c.needsUpdate = true;
      return c;
    };
    root.traverse(o => {
      if (!o.isMesh || !o.material) return;
      o.castShadow = false; // (a picture laid over the street: it throws no shadow on it)
      o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
      o.renderOrder = 3;
      if (!o.userData.xpTick) { o.userData.xpTick = true; const was = o.onBeforeRender; o.onBeforeRender = (...a) => { xpU.uXpT.value = performance.now() / 1000; if (was) was.apply(o, a); }; }
    });
  }

  // ------------------------------------------------------------ one person: skinned, animated
  function paletteMaterial(pal, cls) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
    mat.userData.pal = { value: pal };
    mat.userData.cls = { value: Float32Array.from({ length: N }, (_, i) => cls[i] || 0) };
    mat.userData.pat = { value: 0 };
    mat.userData.pat2 = { value: new THREE.Vector3(-1, -1, -1) };
    mat.onBeforeCompile = sh => {
      sh.uniforms.uPal = mat.userData.pal;
      sh.uniforms.uCls = mat.userData.cls;
      sh.uniforms.uPat = mat.userData.pat;
      sh.uniforms.uPat2 = mat.userData.pat2;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute float mat; uniform vec3 uPal[${N}]; uniform float uCls[${N}]; varying vec3 vPal; varying float vCls; varying vec3 vObj;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vPal = uPal[int(mat + 0.5)]; vCls = uCls[int(mat + 0.5)]; vObj = position;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vPal; varying float vCls; varying vec3 vObj; uniform float uPat; uniform vec3 uPat2;
${PAT_GLSL}`)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( (uPat > 0.5 && vCls > 3.5 && vCls < 4.5) ? oePattern(vPal, vObj, uPat, uPat2) : vPal, opacity );');
    };
    return mat;
  }

  // The palette material's program (one for every untextured person: the same patch, the same key),
  // compiled, with its shadow pass's, before the first of them is shown (issue 266): person() makes the
  // material per person, so warming the template (lib.warm) never reached it, and the first one drawn
  // linked it in a frame. Once per library, on a stand-in for the first character that comes once the
  // game is open (before then, the loader's compile of the scene covers whoever stands in it).
  // (lib.warmPalette(): the same from a template already loaded, for the game to call once it sets lib.warm.)
  // The things people hold (stdMat: one program for every colour, and one for the clear umbrellas) come with
  // the first of them too, since their shadows' variant is drawn by nothing in the scene the loader compiled.
  function warmPalette(lib, mesh) {
    if (!lib.warm) return Promise.resolve();
    const waits = [];
    if (!lib.propsWarm) {
      const g = new THREE.Group();
      for (const hex of ['#808080', 'clear']) { const q = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), stdMat(hex)); q.castShadow = true; g.add(q); }
      lib.propsWarm = lib.warm(g).catch(() => {});
    }
    waits.push(lib.propsWarm);
    if (!lib.paletteWarm) {
      if (!mesh) for (const t of Object.values(lib.tpl)) if (!t.textured && !mesh) t.scene.traverse(o => { if (o.isSkinnedMesh && !mesh) mesh = o; });
      if (mesh) {
        const m = mesh.clone();
        m.material = paletteMaterial(Array.from({ length: N }, () => new THREE.Vector3(0.5, 0.5, 0.5)), []);
        litMaterial(m.material);
        m.castShadow = m.receiveShadow = true;
        m.frustumCulled = false;
        m.children = [];
        lib.paletteWarm = lib.warm(m).catch(() => {});
      }
    }
    if (lib.paletteWarm) waits.push(lib.paletteWarm);
    return Promise.all(waits);
  }

  // scratch objects, made on first use (three.js may load after this file)
  let up, tv, tq, tq2, hp, sa, sb, sd, sd2, fw, sq, sq2, rq, r1, r2, r3, r4;
  // turn bone b so that it points in direction dir (world space): towards its child, or along
  // its own +y axis (the way the bone points, as Blender exports it) when there is none
  function aim(b, child, dir) {
    if (child) { b.getWorldPosition(sa); child.getWorldPosition(sb); sd.subVectors(sb, sa).normalize(); }
    else sd.set(0, 1, 0).applyQuaternion(b.getWorldQuaternion(sq));
    sq.setFromUnitVectors(sd, dir);
    b.getWorldQuaternion(sq2);
    sq.multiply(sq2);
    b.parent.getWorldQuaternion(sq2).invert();
    b.quaternion.copy(sq2.multiply(sq));
    b.updateMatrixWorld(true);
  }
  // (switches a harness may turn: clearArms off shows a clip as it was made, tools/hold_check.js)
  const OPT = { clearArms: true };
  const HIP_OVER = 0.09; // (m: the hip joint over what a seated person sits on)
  let made = 0;
  // One skeleton for a person (issue 191). SkeletonUtils.clone gives every skinned part its own Skeleton, even where the
  // parts share one skin: a person's body, head and hair and the camera in the hand each computed the same bones a frame
  // and sent them to the GPU in a texture of their own, 53 to 78 textures a frame on the walk and 190 at a Stop, each a
  // texSubImage2D and four texParameteri (tools/gl_calls.js). Parts whose bones are the same bones with the same inverses
  // are bound to the first one's skeleton: one update and one upload a person.
  function oneSkeleton(model) {
    const kept = [];
    model.traverse(o => {
      if (!o.isSkinnedMesh || !o.skeleton) return;
      const s = o.skeleton, B = s.bones, I = s.boneInverses;
      const k = kept.find(t => t !== s && t.bones.length === B.length && t.bones.every((b, i) => b === B[i]) && t.boneInverses.every((m, i) => m.equals(I[i])));
      if (!k) { if (!kept.includes(s)) kept.push(s); return; }
      o.bind(k, o.bindMatrix);
      s.dispose();
    });
  }
  function person(lib, look) {
    if (!up) {
      up = new THREE.Vector3(0, 1, 0); tv = new THREE.Vector3(); tq = new THREE.Quaternion(); tq2 = new THREE.Quaternion(); hp = new THREE.Vector3();
      sa = new THREE.Vector3(); sb = new THREE.Vector3(); sd = new THREE.Vector3(); sd2 = new THREE.Vector3(); fw = new THREE.Vector3();
      sq = new THREE.Quaternion(); sq2 = new THREE.Quaternion(); rq = new THREE.Quaternion();
      r1 = new THREE.Vector3(); r2 = new THREE.Vector3(); r3 = new THREE.Vector3(); r4 = new THREE.Vector3();
    }
    const T = lib.tpl[look.character], speeds = T.speeds || lib.info.ground_speed[T.pack];
    const alias = n => (T.bones && T.bones[n]) || n; // the old characters' bone names on a main character's rig
    const model = noCover(THREE.SkeletonUtils.clone(T.scene));
    oneSkeleton(model);
    let mesh = null, head = null;
    const bone = {};
    model.traverse(o => { if (o.isSkinnedMesh && !mesh) mesh = o; if (o.isBone) bone[o.name] = o; });
    head = bone[alias('Head')] || null;
    if (T.textured) model.traverse(o => { if (o.isSkinnedMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; (Array.isArray(o.material) ? o.material : [o.material]).forEach(litMaterial); } });
    else {
      mesh.material = paletteMaterial(colours(T.extras, look), T.extras.classes.map(c => CLS[c] || 0));
      litMaterial(mesh.material);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    }
    const root = new THREE.Group();
    root.userData.whole = true; // (drawn whole or not at all: world.js gate, issue 241)
    root.add(model);
    const mixer = new THREE.AnimationMixer(model), act = {};
    for (const c of T.clips || lib.clips[T.pack]) act[c.name] = mixer.clipAction(c);
    let cur = null, cycles = 0, lastT = 0, waveUntil = -Infinity, lookW = 0, talked = false, convoT = -Infinity, glanceUntil = -Infinity, glanceNext = null;
    // (when a waiting person looks round: a sequence of their own, the same each time the page is played)
    let gs = [...String(look.character || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const grnd = () => ((gs = (gs * 1664525 + 1013904223) >>> 0) / 4294967296);
    const idleAt = (made = (made + 0.6180339887) % 1); // (what one waits doing begins here in it: spread by the golden ratio, in the order people are made)
    const rig = { root, model, mixer, look, phase: 0, lookTarget: null, character: look.character, clearEvery: 1 }; // (clearEvery: armsClear)
    if (lib.rigsOf) (lib.rigsOf[look.character] || (lib.rigsOf[look.character] = [])).push(rig); // (every body made of a character, for lib.shown: whether any is in the picture)
    // reference pose for accessories: the first frame of Idle, in the model's own space
    const bones = {}, ref = {};
    model.traverse(o => { if (o.isBone) bones[o.name] = o; });
    if (act.Idle) { act.Idle.play(); mixer.update(0); act.Idle.stop(); }
    model.updateMatrixWorld(true);
    const mInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    // how far the top of the head (and a hat) stands over the hip joints, standing, at scale 1: what a
    // seat has to leave under a car's roof (rig.headTop, below)
    const thigh = bone[THREE.PropertyBinding.sanitizeNodeName(alias('UpperLeg.L'))];
    let crown = 0, overHead = 0;
    if (thigh) {
      const box = new THREE.Box3(), part = new THREE.Box3(), rel = new THREE.Matrix4();
      // (a skinned mesh's vertices are already in the standing figure's frame; its node's transform is not what places them)
      model.traverse(o => { if (o.isMesh) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(o.isSkinnedMesh ? o.geometry.boundingBox : part.copy(o.geometry.boundingBox).applyMatrix4(rel.multiplyMatrices(mInv, o.matrixWorld))); } });
      crown = box.max.y - V3(0, 0, 0).setFromMatrixPosition(rel.multiplyMatrices(mInv, thigh.matrixWorld)).y;
      if (head) overHead = box.max.y - V3(0, 0, 0).setFromMatrixPosition(rel.multiplyMatrices(mInv, head.matrixWorld)).y; // and over the head's joint
    }
    for (const n of ['Head', 'Chest', 'Abdomen', 'Hips', 'WristR', 'WristL']) {
      if (!bones[alias(n)]) continue;
      bones[n] = bones[alias(n)];
      const bm = new THREE.Matrix4().multiplyMatrices(mInv, bones[n].matrixWorld);
      ref[n] = { pos: V3(0, 0, 0).setFromMatrixPosition(bm), inv: bm.clone().invert() };
    }
    // each hand's grip, from its finger bones (on a Rocketbox rig), for what it holds: x along the
    // fingers, y towards the thumb, z the third way (palm: which way along it the palm faces);
    // at(x, y, z) is a point in it, q its turn
    const grip = {};
    for (const [n, s] of [['WristR', 'R'], ['WristL', 'L']]) {
      const f2 = bone[`Bip01_${s}_Finger2`], th = bone[`Bip01_${s}_Finger01`];
      if (!ref[n] || !f2 || !th) continue;
      const o = ref[n].pos, p = b => V3(0, 0, 0).setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(mInv, b.matrixWorld)).sub(o);
      const x = p(f2).normalize(), y = p(th), z = new THREE.Vector3();
      y.addScaledVector(x, -y.dot(x)).normalize();
      z.crossVectors(x, y);
      grip[n] = { at: (a, b, c) => o.clone().addScaledVector(x, a).addScaledVector(y, b).addScaledVector(z, c),
        q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)), palm: s === 'R' ? -1 : 1 };
    }
    // a real head (a Rocketbox rig, found by its eyes) is narrower and longer than the old characters'
    // the hats and glasses were made for, whose eyes are 9 cm apart: they are fitted to it axis by axis
    let headFit = null;
    if (bone.Bip01_REye && bone.Bip01_LEye) {
      const p = b => V3(0, 0, 0).setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(mInv, b.matrixWorld));
      const r = p(bone.Bip01_REye), l = p(bone.Bip01_LEye);
      headFit = { s: V3(1.1 * r.distanceTo(l) / 0.09, 1.05, 0.8), mid: r.add(l).multiplyScalar(0.5).add(V3(0, -0.03, -0.105)) };
    }
    let accKey = '', accObjs = [];
    const mk = (g, hex, pos, scale, turn, rotZ) => {
      const m = new THREE.Mesh(g, stdMat(hex));
      m.position.copy(pos);
      if (scale) m.scale.copy(scale);
      if (turn) m.quaternion.copy(turn);
      if (rotZ) m.rotation.z = rotZ;
      m.castShadow = true;
      return m;
    };
    // what the NPC does while it waits (look.clip), if this character has the clip
    // (never a gesture: alone, someone cast with one stands as people stand, GESTURE)
    const idleClip = () => (look.clip && act[look.clip] && !GESTURE.has(look.clip) ? look.clip : GESTURE.has(look.clip) && act.Idle_Neutral ? 'Idle_Neutral' : 'Idle');
    function setAccessories() {
      const ids = noUmb([...(look.acc || []), ...((act[look.clip] && CLIP_ACC[look.clip]) || []).map(a => (a === 'cup' && look.drink === 'can' ? 'can' : a))]);
      const key = JSON.stringify([ids, look.apron || '']);
      if (key === accKey) return;
      accKey = key;
      for (const o of accObjs) o.parent && o.parent.remove(o);
      accObjs = [];
      for (const id of ids) {
        const a = ACC[id], held = !!(a && a.hand && umbHold), bn = held ? a.hand : a && headFit && a.realBone && ref[a.realBone] ? a.realBone : a && a.bone;
        if (!a || !ref[bn]) continue;
        const grp = new THREE.Group();
        const anchor = ref[bn].pos.clone();
        const fit = bn === 'Head' && headFit;
        if (fit) anchor.copy(fit.mid);
        else if (bn === 'Head') { anchor.y += 0.11; anchor.z -= 0.05; }   // the middle of the head
        for (const m of a.build(mk, anchor, grip[bn], look, !!headFit, ref)) {
          if (fit) { m.position.sub(anchor).multiply(fit.s).add(anchor); m.scale.multiply(fit.s); }
          grp.add(m);
        }
        grp.matrixAutoUpdate = false;
        grp.matrix.copy(held ? umbHold.inv : ref[bn].inv); // (held: where the hand is with the hold laid on, not as the reference pose has it)
        bones[bn].add(grp);
        accObjs.push(grp);
      }
      // an open umbrella in the right hand: the arm that holds it up is laid over the clip (umbLay)
      umbUp = ids.includes('umbrella_open') && !!umbHold;
      canopy = null; umbW = 1;
      for (const g of accObjs) for (const m of g.children) if (m.userData.canopy) canopy = m;
      // the camera of 1964 round the neck on its own strap, in place of Kagami's own, which is put away with its strap
      const own = !ids.includes('camera1964');
      model.traverse(o => { const n = (o.isMesh && o.material && o.material.name) || ''; if (/^camera_(camera|rubber|metal|glass|strap)$/.test(n)) o.visible = own; else if (n === 'camera_strap1964') o.visible = !own; });
    }
    // The arm that holds an open umbrella up, over whatever the clip has the arm doing (issue 165): one pose, fixed,
    // of the upper arm, the forearm, the hand and its fingers (umbHold.q, found once from the reference pose, below),
    // each bone's share of it umbW (0 the clip's, 1 the hold: it comes up as the umbrella opens). No solver runs in a
    // frame, and the rest of the clip (the legs, the other arm, the spine) is as it was. The clip's own turns are kept
    // (umbHold.clip) and put back before the mixer runs again (armBack): the mixer writes a bone only when its value
    // changes, so a turn left on would be the next frame's start, under a still clip or a held world
    let umbHold = null, umbUp = false, umbLaid = false, armHeld = null, canopy = null, umbW = 1, umbRaise = 0;
    // (the umbrella leant away from a neighbour's, a little, at the wrist: rig.umbLean, in the body's own space)
    const umbLeanQ = new THREE.Quaternion(); let umbLeant = false;
    // (the umbrella held higher, 0 to 1 of UMB_RAISE: lifted over someone's head as one passes under it, issue 157 item 7;
    // the second pose is found once beside the first, umbHold.hi, and a frame blends the two, umbLay)
    rig.umbRaise = k => { umbRaise = k > 0 ? Math.min(1, k) : 0; };
    rig.umbLean = (x, z) => {
      const a = Math.hypot(x, z);
      umbLeant = a > 1e-3 && !!umbHold;
      if (umbLeant) umbLeanQ.setFromAxisAngle(sd.set(z / a, 0, -x / a), a).premultiply(sq.copy(umbHold.laQ).invert()).multiply(umbHold.laQ);
    };
    function umbLay() {
      const H = umbHold, n = H.bones.length;
      for (let k = 0; k < n; k++) {
        const b = H.bones[k];
        H.clip[k].copy(b.quaternion);
        sq2.copy(H.q[k]); if (umbRaise > 0 && H.hi) sq2.slerp(H.hi[k], umbRaise);
        if (k === 2 && umbLeant) sq2.premultiply(umbLeanQ);
        if (umbW < 1) b.quaternion.slerp(sq2, umbW); else b.quaternion.copy(sq2);
      }
      umbLaid = true;
    }
    // an open umbrella part of the way up (umbOpening): its canopy furled or spread about its tip, and the arm's share
    rig.umbOpen = k => {
      if (!canopy) return;
      const o = umbOpening(k), C = canopy.userData.canopy;
      canopy.scale.set(o.r, o.a, o.r);
      canopy.position.copy(C.pos).addScaledVector(C.dir, UMB_TIP * (1 - o.a));
      umbW = o.arm;
    };
    // (each arm's pose as the clip left it, kept the first time in a frame something is laid over it: the umbrella's reach,
    // or the arm moved out of the body, armsClear; put back before the mixer runs)
    const armClip = [null, null];
    const keepArm = i => { const a = arms[i]; if (!armClip[i]) { armClip[i] = a.kept = a.kept || [new THREE.Quaternion(), new THREE.Quaternion()]; armClip[i][0].copy(a.ua.quaternion); armClip[i][1].copy(a.la.quaternion); } return armClip[i]; };
    // What issue 165's check measures of a near person under an umbrella, in the world, as posed: the holding hand's
    // bone, the handle's middle, the shaft from the handle's foot to the canopy's middle, the canopy (its middle, the
    // way its tip points, its rim's radius and its height), the head as a ball and the trunk as a capsule
    rig.umbParts = () => {
      if (!canopy || !bones.Head || !reaches) return null;
      root.updateMatrixWorld(true);
      const s = model.getWorldScale(V3(0, 0, 0)).y, w = o => o.getWorldPosition(V3(0, 0, 0)), c = w(canopy), n = V3(0, 1, 0).applyQuaternion(canopy.getWorldQuaternion(new THREE.Quaternion()));
      const handle = w(canopy.userData.handle), hd = w(bones.Head), hip = bones.Hips ? w(bones.Hips) : hd.clone().add(V3(0, -0.6 * s, 0));
      return { held: !!umbHold && umbUp, hand: w(arms[1].wr), handle, shaft: [handle.clone().addScaledVector(n, -(UMB_END + 0.025) * s), c], canopy: { c, n, r: UMB_R * s * canopy.scale.x, h: UMB_H * s * canopy.scale.y },
        head: { c: hd.clone().add(V3(0, 0.09 * s, 0)), r: 0.105 * s, crown: overHead > 0 ? hd.y + overHead * s : hd.y + 0.24 * s }, torso: { a: hip, b: hd.clone().add(V3(0, -0.07 * s, 0)), r: 0.125 * s } };
    };
    const armBack = () => {
      // (the arm moved out of the body first, back to the pose it came in with; then the umbrella's hold, then the rod's)
      for (let i = 0; i < 2; i++) if (armClip[i]) { const a = arms[i]; a.ua.quaternion.copy(armClip[i][0]); a.la.quaternion.copy(armClip[i][1]); armClip[i] = null; }
      if (umbLaid) { const H = umbHold; for (let k = 0; k < H.bones.length; k++) H.bones[k].quaternion.copy(H.clip[k]); umbLaid = false; }
      if (armHeld) { const a = arms[1]; a.ua.quaternion.copy(armHeld[0]); a.la.quaternion.copy(armHeld[1]); armHeld = null; }
    };
    // (at: a point in the world for the fist instead, rig.hold: a fishing rod's grip, game/fishing.js)
    function holdUmbrella(at) {
      const a = arms[1];
      armHeld = keepArm(1);
      root.updateMatrixWorld(true);
      const fist = r2.copy(at);
      const sh = a.ua.getWorldPosition(r3), el = a.la.getWorldPosition(r4);
      const L1 = sh.distanceTo(el), L2 = el.distanceTo(a.wr.getWorldPosition(r1)), L3 = L2 + 0.075 * model.getWorldScale(sa).y;
      const to = sd2.subVectors(fist, sh), d = Math.min(Math.max(to.length(), Math.abs(L1 - L3) + 1e-3), L1 + L3 - 1e-3);
      to.normalize();
      const along = (L1 * L1 - L3 * L3 + d * d) / (2 * d), off = Math.sqrt(Math.max(0, L1 * L1 - along * along));
      // which way the elbow bends: down, out to the right and a little back
      const out = r1.set(-1, 0, 0).applyQuaternion(root.getWorldQuaternion(rq)), back = fw.set(0, 0, -1).applyQuaternion(rq);
      const pole = out.multiplyScalar(0.55).addScaledVector(back, 0.25);
      pole.y -= 1;
      pole.addScaledVector(to, -pole.dot(to)).normalize();
      const elbow = r4.copy(sh).addScaledVector(to, along).addScaledVector(pole, off);
      aim(a.ua, a.la, elbow.clone().sub(sh).normalize());
      aim(a.la, a.wr, fist.sub(elbow).normalize());
    }
    function play(name, fade = 0.25, once = false) {
      // (a clip this character's rig was not built with, a sitting or a running one: its idle instead, or any it has.
      // Tokyo's people at 576,1269 threw here one run in three)
      const a = act[name] || act.Idle || act.Walk || Object.values(act)[0];
      if (!a) return { setEffectiveTimeScale() { return this; } };
      if (cur === a) return a;
      a.reset();
      // (what one waits doing begins at a moment of its own: a kerb's crowd that stopped together at the red light moved
      // together, every head turning at once)
      if (!once && name === idleClip()) a.time = idleAt * a.getClip().duration;
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = once;
      a.setEffectiveTimeScale(1).setEffectiveWeight(1).play();
      if (cur) cur.crossFadeTo(a, fade, false);
      cur = a;
      lastT = 0;
      return a;
    }
    rig.setLook = l => {
      Object.assign(look, l);
      rig.character = look.character;
      if (!T.textured) { // a main character keeps its own textures
        mesh.material.userData.pal.value = colours(T.extras, look);
        mesh.material.userData.pat.value = PAT[look.pattern] || 0;
        if (look.pattern2) { const c = lin(look.pattern2); mesh.material.userData.pat2.value.set(c.r, c.g, c.b); } else mesh.material.userData.pat2.value.set(-1, -1, -1);
      }
      model.scale.setScalar(look.scale || 1);
      setAccessories();
    };
    // the clothes of DRESS[k] on a scanned person (the crowd's): the body's materials become this person's own
    // copies the first time, sharing their pictures and their program
    let dressMats = null;
    rig.dress = k => {
      if (!T.textured) return; // (the first of DRESS too: every one is the street's colours, issue 64)
      if (!dressMats) {
        dressMats = [];
        model.traverse(o => {
          if (!dressable(o)) return;
          const m = dressedCopy(o.material, T);
          o.material = m;
          dressMats.push(m);
        });
        // (and given the weather's patch at once, as the warm-up gave the copy it compiled: lib.dressNew, the game's
        // weather.dress. Drawn first without it, the copy linked a program of its own in a draw, issue 31)
        if (lib.dressNew) lib.dressNew(model);
      }
      for (const m of dressMats) dressVec(k, m.userData.dress.value, m.userData.dye.value);
    };
    rig.setLook({});
    // sitting has no clip: bend the legs over the idle pose, thighs forward and shins down (an aim
    // per bone in world space, so it doesn't depend on how the bones' axes are set up). The feet
    // are IK targets under Root in these rigs, not children of the shins, so they are moved to
    // the ends of the shins (a main character's feet hang from its shins, and follow them); then the
    // body is lowered until they are back on the ground. In a car (rig.legRake ~1) the shins reach
    // forward to the pedals, and with rig.reach (a point in the world: the steering wheel's hub) the
    // hands go to either side of it. A main character's bones are found by their names on the old
    // rigs (alias, people.json "heroes.bones").
    const B = name => bone[THREE.PropertyBinding.sanitizeNodeName(alias(name))]; // the loader drops the dots: Foot.L is FootL
    const legs = ['L', 'R'].map(side => ({ ul: B('UpperLeg.' + side), ll: B('LowerLeg.' + side), ft: B('Foot.' + side), shin: 0, y0: 0 }));
    for (const l of legs) l.hangs = !!l.ft && l.ft.parent === l.ll;
    // The walk set to a point of its stride (issue 174): someone taken over from their far copy steps on with the foot the
    // copy had forward, not from the clip's first frame (a hitch in the walk at the swap). ph: the far copy's stride, its
    // shader's angle (CROWD_POSE: the left leg turned by sin(ph) about the hip, rx, so its foot furthest forward at sin -1). Where that is in the clip is found once a clip, by posing it, while the walk is all the rig plays; called
    // between two animate()s, so whatever is laid over the clip is put back by the next one before its mixer.update
    rig.walkAt = ph => {
      const a = act.Walk;
      if (!a || cur !== a || !legs[0].ft || !legs[1].ft) return false;
      const clip = a.getClip(), d = clip.duration;
      if (clip.leftAt == null) {
        if (Object.values(act).some(x => x !== a && x.isRunning())) return false; // (a fade from another clip: posed, it would be the blend)
        const t0 = a.time, F = new THREE.Vector3(), G = new THREE.Vector3(), toe = legs[0].ft.children.find(c => c.isBone);
        let best = -Infinity, at = 0, fwd = 1;
        model.updateMatrixWorld(true);
        if (toe) { toe.getWorldPosition(F); legs[0].ft.getWorldPosition(G); model.worldToLocal(F); model.worldToLocal(G); fwd = F.z >= G.z ? 1 : -1; } // (the way the body faces: heel to toe)
        for (let k = 0; k < 32; k++) {
          a.time = k / 32 * d; mixer.update(0); model.updateMatrixWorld(true);
          legs[0].ft.getWorldPosition(F); legs[1].ft.getWorldPosition(G); model.worldToLocal(F); model.worldToLocal(G);
          if ((F.z - G.z) * fwd > best) { best = (F.z - G.z) * fwd; at = k / 32; }
        }
        clip.leftAt = at; clip.fwd = fwd; a.time = t0;
      }
      const frac = (ph - (clip.fwd > 0 ? 1.5 : 0.5) * Math.PI) / (2 * Math.PI);
      a.time = (((clip.leftAt + frac) % 1) + 1) % 1 * d;
      return true;
    };
    const arms = ['L', 'R'].map(side => ({ ua: B('UpperArm.' + side), la: B('LowerArm.' + side), wr: B('Wrist.' + side), s: side === 'L' ? 1 : -1 }));
    const seated = legs.every(l => l.ul && l.ll && l.ft), reaches = arms.every(a => a.ua && a.la && a.wr);
    // The forearms, the hands and what they hold kept out of the body. One clip file drives every avatar of a sex, so a
    // pose made on one body plays on broader ones: the texting clip put the right forearm into a jacket's chest, the drink
    // and the book the hand into a blouse (tools/hold_check.js measures every cast avatar through every held clip). The
    // body's own torso, as it was bound, is cut into 3 cm slices up its spine, each a ring of 24 radii about its middle,
    // carried by the spine bones that carry a share of it (the jacket and the blouse over them). Each frame points of each
    // forearm and hand and the corners of what the hand holds are looked for inside the rings (between two slices, the ring
    // between them). Every point inside, or nearer than CLEAR, asks for a turn that would take it out along its ring's
    // radius: a point by the elbow of the upper arm at the shoulder (the forearm then aimed back at the wrist, so the hand
    // keeps its place), a point by the wrist, of the hand or of what it holds, of the forearm at the elbow, and between the
    // two, of both in shares. The turns asked are weighed by how far each point is in, so the correction grows and fades with
    // the pose and never jumps from one point to another (a jump showed as a wrist's jerk). Laid over the clip and taken
    // off before the next frame (keepArm, armBack).
    const CLEAR = 0.02, EASE = 0.02, NEAR = 0.04, SLICE = 0.03, RAYS = 24;
    let clr;
    // (a matrix whose sixteen numbers are doubles from the start: a new Matrix4's are small integers, and the first fraction
    // written into them changes the array's kind, so that each rig loaded as the crowd moved threw sliceAt's optimised
    // code away, every two or three seconds, and it ran unoptimised: issue 220. The same numbers either way)
    const f64 = m => { m.elements = Float64Array.from(m.elements); return m; };
    function clearBuild() {
      const body = [];
      model.traverse(o => { if (o.isSkinnedMesh && o.skeleton && o.geometry.attributes.skinIndex && o.skeleton.bones.some(b => /Bip01_Spine2$/.test(b.name))) body.push(o); });
      const o = body.sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0];
      if (!o || !reaches) return null;
      const bones = o.skeleton.bones;
      // the geometry's own axes: up, forward and to the right of the figure as it was bound (the bind matrix turns them to the model's)
      const bi = new THREE.Matrix4().copy(o.bindMatrix).invert(), m0 = new THREE.Vector3().setFromMatrixColumn(o.bindMatrix, 0).length();
      const upG = V3(0, 1, 0).transformDirection(bi), fwG = V3(0, 0, 1).transformDirection(bi), rtG = new THREE.Vector3().crossVectors(upG, fwG).normalize();
      const torso = /Bip01_(Pelvis|Spine\d?|Neck|[LR]_Clavicle)$/, kind = b => { const n = b.name; if (torso.test(n)) return 'T'; const m = /Bip01_([RL])_(Forearm|Hand|Finger\d*)$/.exec(n); return m ? m[1] + (m[2] === 'Forearm' ? 'f' : 'h') : ''; };
      const kinds = bones.map(kind), sl = SLICE / m0, v = new THREE.Vector3(), into = new THREE.Matrix4();
      const tv = [], pts = { Rf: [], Rh: [], Lf: [], Lh: [] };
      let h0 = Infinity, h1 = -Infinity;
      // (every part of the body: the loader makes a mesh of each of its materials, the skin, the jacket, the sleeves; each
      // brought into the largest one's space, its bones found in that one's skeleton)
      for (const m of body) {
        const g = m.geometry, P = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, map = m.skeleton.bones.map(x => bones.indexOf(x));
        into.multiplyMatrices(bi, m.bindMatrix);
        for (let i = 0; i < P.count; i++) {
          let b = 0, w = -1; for (let k = 0; k < 4; k++) { const x = sw.getComponent(i, k); if (x > w) { w = x; b = si.getComponent(i, k); } }
          b = map[b]; const k = b >= 0 && kinds[b]; if (!k) continue;
          v.fromBufferAttribute(P, i); if (m !== o) v.applyMatrix4(into);
          if (k === 'T') { const h = v.dot(upG); tv.push(b, h, v.dot(rtG), v.dot(fwG)); h0 = Math.min(h0, h); h1 = Math.max(h1, h); } else pts[k].push(b, v.x, v.y, v.z);
        }
      }
      if (!tv.length) return null;
      const n = Math.ceil((h1 - h0) / sl) + 1, S = [], at = h => Math.floor((h - h0) / sl);
      // (every field a slice is ever given, named here in one shape, as the walkers' are (issue 130): sliceAt, asked some
      // 4,000 times a frame on a desktop, reads them all. cx, cz, k doubles from the start)
      for (let j = 0; j < n; j++) S.push({ x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, r: new Float32Array(RAYS), votes: new Map(), cx: NaN, cz: NaN, w: null, F: null, I: null, k: NaN, at: -1 });
      // the middle of each slice from the box of the two slices either side as well (a slice of a few vertices had its middle
      // off to one side, and a hand at the chest read 18 cm deep); the bones that carry a quarter of it or more (where the
      // spine bends, a point between two bones' slices was in neither)
      for (let i = 0; i < tv.length; i += 4) for (let dj = -2; dj <= 2; dj++) {
        const s = S[at(tv[i + 1]) + dj]; if (!s) continue;
        s.x0 = Math.min(s.x0, tv[i + 2]); s.x1 = Math.max(s.x1, tv[i + 2]); s.z0 = Math.min(s.z0, tv[i + 3]); s.z1 = Math.max(s.z1, tv[i + 3]);
        if (!dj) s.votes.set(tv[i], (s.votes.get(tv[i]) || 0) + 1);
      }
      // each slice is carried by the bones that carry its vertices, in their shares (smoothed over the slices either side, so
      // that the slices' frames change by degrees up the spine: a point handed from one bone's slices to the next jumped)
      for (const s of S) { s.cx = (s.x0 + s.x1) / 2; s.cz = (s.z0 + s.z1) / 2; }
      for (let j = 0; j < n; j++) {
        const w = new Map(); let all = 0;
        for (let dj = -1; dj <= 1; dj++) { const t = S[j + dj]; if (t) for (const [b, c] of t.votes) { w.set(b, (w.get(b) || 0) + c); all += c; } }
        S[j].w = all ? [...w].map(([b, c]) => [b, c / all]) : null;
        S[j].F = f64(new THREE.Matrix4()); S[j].I = f64(new THREE.Matrix4()); S[j].k = 1;
      }
      for (let j = 0; j < n; j++) if (!S[j].w) { for (let d = 1; d < n; d++) { const t = S[j - d] || S[j + d]; if (t && t.w) { S[j].w = t.w; break; } } }
      // each ray's radius, the farthest vertex of its slice in that way; a ray without one takes it from the slices over and
      // under it, then from its neighbours round the ring; then each radius the middle of its own and the ones over and under
      // it (a body's rows of vertices lie farther apart than a slice, and one slice's odd row is not the body)
      for (let i = 0; i < tv.length; i += 4) {
        const s = S[at(tv[i + 1])], dx = tv[i + 2] - s.cx, dz = tv[i + 3] - s.cz;
        const a = ((Math.round(Math.atan2(dz, dx) / (2 * Math.PI) * RAYS) % RAYS) + RAYS) % RAYS; s.r[a] = Math.max(s.r[a], Math.hypot(dx, dz));
      }
      { const R0 = S.map(s => s.r.slice()); for (let j = 0; j < n; j++) for (let a = 0; a < RAYS; a++) if (!R0[j][a]) { const u = (R0[j - 1] || [])[a] || 0, d = (R0[j + 1] || [])[a] || 0; S[j].r[a] = u && d ? (u + d) / 2 : u || d; } }
      for (const s of S) {
        const r = s.r.slice(); if (!r.some(x => x)) continue;
        for (let a = 0; a < RAYS; a++) if (!r[a]) {
          let p = 1, q = 1; while (!r[(a - p + RAYS) % RAYS]) p++; while (!r[(a + q) % RAYS]) q++;
          s.r[a] = (r[(a - p + RAYS) % RAYS] * q + r[(a + q) % RAYS] * p) / (p + q);
        }
      }
      { const R0 = S.map(s => s.r.slice()); for (let j = 1; j < n - 1; j++) for (let a = 0; a < RAYS; a++) { const t = [R0[j - 1][a], R0[j][a], R0[j + 1][a]].sort((x, y) => x - y); if (t[0]) S[j].r[a] = t[1]; } }
      // the points looked for: every few of each forearm's and hand's vertices, each with how far along the forearm it lies
      // (spread over the part: each next point the farthest from those already taken, from the farthest from its middle)
      const pick = (arr, want) => {
        const c = arr.length / 4, out = [], far = new Float32Array(c).fill(Infinity); if (!c) return out;
        let mx = 0, my = 0, mz = 0; for (let i = 0; i < c; i++) { mx += arr[i * 4 + 1] / c; my += arr[i * 4 + 2] / c; mz += arr[i * 4 + 3] / c; }
        let k = 0, best = -1; for (let i = 0; i < c; i++) { const d = (arr[i * 4 + 1] - mx) ** 2 + (arr[i * 4 + 2] - my) ** 2 + (arr[i * 4 + 3] - mz) ** 2; if (d > best) { best = d; k = i; } }
        while (out.length < Math.min(want, c)) {
          out.push({ b: arr[k * 4], p: V3(arr[k * 4 + 1], arr[k * 4 + 2], arr[k * 4 + 3]) });
          let nk = 0; best = -1;
          for (let i = 0; i < c; i++) { const d = Math.min(far[i], (arr[i * 4 + 1] - arr[k * 4 + 1]) ** 2 + (arr[i * 4 + 2] - arr[k * 4 + 2]) ** 2 + (arr[i * 4 + 3] - arr[k * 4 + 3]) ** 2); far[i] = d; if (d > best) { best = d; nk = i; } }
          k = nk;
        }
        return out;
      };
      const arm = [{ f: pick(pts.Lf, 10), h: pick(pts.Lh, 14) }, { f: pick(pts.Rf, 10), h: pick(pts.Rh, 14) }];
      for (const A of arm) { A.m = new Map(); for (const x of A.f.concat(A.h)) if (!A.m.has(x.b)) A.m.set(x.b, new THREE.Matrix4()); }
      const owners = [...new Set(S.flatMap(s => (s.w || []).map(([b]) => b)))];
      // the nodes whose places the measure reads, each after its parent: from under the root to the spine and the arms
      const chain = [];
      for (const nd of [o, ...owners.map(b => bones[b]), ...arms.flatMap(x => [x.ua, x.la, x.wr]), ...arm.flatMap(A => [...A.m.keys()].map(b => bones[b]))]) {
        const up = []; for (let q = nd; q && q !== root; q = q.parent) up.unshift(q);
        for (const q of up) if (!chain.includes(q)) chain.push(q);
      }
      return { o, bones, S, h0, sl, upG, rtG, fwG, owners, chain, M: new Map(owners.map(b => [b, f64(new THREE.Matrix4())])), arm, bm: new THREE.Matrix4(), q: new THREE.Vector3(), w: new THREE.Vector3(), mid: n >> 1, frame: 0 };
    }
    // a vertex's place in the world as its bone carries it now (the skinning matrix of that one bone)
    const skinM = (c, b, out) => out.multiplyMatrices(c.o.matrixWorld, c.o.bindMatrixInverse).multiply(c.bm.multiplyMatrices(c.bones[b].matrixWorld, c.o.skeleton.boneInverses[b])).multiply(c.o.bindMatrix);
    // how deep a point of the world is inside the torso (metres; below 0, how far out), and the way out, into hit
    const hit = { d: 0, n: new THREE.Vector3() };
    const ringR = (s, f) => { const a0 = Math.floor(f), t = f - a0; return s.r[((a0 % RAYS) + RAYS) % RAYS] * (1 - t) + s.r[(((a0 + 1) % RAYS) + RAYS) % RAYS] * t; };
    // a slice's depth for a point: its radius in the point's way less the point's distance from its middle, in its own frame
    // (a slice of nothing, over the top or under the lowest, has none: a hand rising past the shoulders comes out by degrees)
    const sdA = [0, new THREE.Vector3()], sdB = [0, new THREE.Vector3()];
    function sliceAt(c, j) {
      const s = c.S[j];
      if (s.at !== c.frame) {
        const F = s.F.elements; F.fill(0);
        for (const [b, w] of s.w) { const e = c.M.get(b).elements; for (let i = 0; i < 16; i++) F[i] += w * e[i]; }
        s.I.copy(s.F).invert(); s.k = cax.setFromMatrixColumn(s.F, 0).length(); s.at = c.frame;
      }
      return s;
    }
    function sliceDepth(c, s, wp, out, none) {
      const q = c.q.copy(wp).applyMatrix4(s.I), dx = q.dot(c.rtG) - s.cx, dz = q.dot(c.fwG) - s.cz, L = Math.hypot(dx, dz) || 1e-6;
      out[0] = ((none ? 0 : ringR(s, Math.atan2(dz, dx) / (2 * Math.PI) * RAYS)) - L) * s.k;
      out[1].copy(c.rtG).multiplyScalar(dx / L).addScaledVector(c.fwG, dz / L).transformDirection(s.F);
      return out;
    }
    function torsoDepth(c, wp) {
      const S = c.S, n = S.length;
      // the height: first in the frame of the middle slice, then in that of the slice it found
      let j = c.mid, u = 0;
      // (a point that is no number, a hand's on a rig not posed yet, is outside: it asked for a slice that is not there,
      // "Cannot read properties of undefined (reading 'at')", and stopped the frame; tools/guide_body.js, now and then)
      for (let pass = 0; pass < 2; pass++) { u = (c.q.copy(wp).applyMatrix4(sliceAt(c, Math.max(0, Math.min(n - 1, j)) || 0).I).dot(c.upG) - c.h0) / c.sl - 0.5; j = Math.floor(u); }
      if (!(j >= -1 && j < n)) { hit.d = -Infinity; return hit.d; }
      const t = u - j, a = sliceDepth(c, sliceAt(c, Math.max(0, j)), wp, sdA, j < 0), b = sliceDepth(c, sliceAt(c, Math.min(n - 1, j + 1)), wp, sdB, j + 1 >= n);
      hit.d = a[0] * (1 - t) + b[0] * t;
      hit.n.copy(a[1]).multiplyScalar(1 - t).addScaledVector(b[1], t).normalize();
      return hit.d;
    }
    const cp = new THREE.Vector3(), cel = new THREE.Vector3(), csh = new THREE.Vector3(), cwr = new THREE.Vector3(), cax = new THREE.Vector3(), cq = new THREE.Quaternion(), cbox = new THREE.Box3();
    const wSh = new THREE.Vector3(), wEl = new THREE.Vector3(), cpt = new THREE.Vector3(), cmw = new THREE.Matrix4(), clrW = [0, 0];
    // one point's ask: the turn that would take it out, by its lever from the shoulder and from the elbow, in its shares
    // (by the elbow the shoulder's, by the wrist the elbow's), weighed by how far it is in, eased in over the first EASE of it
    // so that the correction starts with no kick; into wSh and wEl, the weights into clrW
    function clrAsk(c, wp, along) {
      const e = torsoDepth(c, wp) + CLEAR; if (!(e > 0)) return e;
      const d = e < EASE ? e * e / (2 * EASE) : e - EASE / 2, sh = Math.max(0, Math.min(1, 1.6 - 2 * along)), el = 1 - sh;
      // (weighed by the square of how far in: the deepest point has most of the say, and no point's say starts or ends at once)
      if (sh > 0) { const r = cp.subVectors(wp, csh), L2 = Math.max(0.0025, r.lengthSq()); wSh.addScaledVector(cax.crossVectors(r, hit.n), d * d * d * sh / L2); clrW[0] += d * d * sh; }
      if (el > 0) { const r = cp.subVectors(wp, cel), L2 = Math.max(0.0025, r.lengthSq()); wEl.addScaledVector(cax.crossVectors(r, hit.n), d * d * d * el / L2); clrW[1] += d * d * el; }
      return e;
    }
    // (the arm's three bones brought up to date from their parents alone, not their fingers and what they hold: done the
    // three.js way, a frame's turns updated twenty bones each and cost a near walker half a millisecond)
    const upd = n => { n.updateMatrix(); n.matrixWorld.multiplyMatrices(n.parent.matrixWorld, n.matrix); };
    const cps = new THREE.Vector3(), csc = new THREE.Vector3(), cpq = new THREE.Quaternion();
    // a turn of the world (a quaternion) laid on a bone, in its parent's terms, and the bones below it on the arm brought along
    const turnQ = (bone, qw, below) => {
      bone.parent.matrixWorld.decompose(cps, cpq, csc);
      bone.quaternion.premultiply(sq.copy(cpq).invert().multiply(qw).multiply(cpq));
      upd(bone); for (const n of below) upd(n);
    };
    // ... a turn about the world's axis w, its length the angle
    const turnBone = (bone, w, below) => { const ang = Math.min(0.8, w.length()); if (ang < 1e-5) return; turnQ(bone, cq.setFromAxisAngle(cax.copy(w).normalize(), ang), below); };
    // ... and the forearm aimed at a point of the world for the wrist
    const aimFore = (a, at) => {
      cel.setFromMatrixPosition(a.la.matrixWorld);
      sa.setFromMatrixPosition(a.wr.matrixWorld).sub(cel).normalize();
      turnQ(a.la, cq.setFromUnitVectors(sa, sb.copy(at).sub(cel).normalize()), [a.wr]);
    };
    // The turns found are then laid on the arm as it came in, through a spring of its own for each joint, critically damped:
    // stiff while the turn must grow (a hand that meets the hip at speed is held out within a frame or two), soft while it
    // lets go. Laid on at once, a hand that met the hip at speed stopped within the frame, and one that left the chest at
    // speed snapped away; let go at a rate, it still changed its pace at once (tools/hold_check.js reads either as a jerk).
    const GRIP = 40, LET = 18, cRq = new THREE.Quaternion(), cRi = new THREE.Quaternion(), cv = new THREE.Vector3(), cx2 = new THREE.Vector3();
    const upTo = (w, k) => (w.length() > k ? w.setLength(k) : w);
    // (the spring's place p and pace v, in the body's own frame, towards want, in the world; want becomes the place)
    const spring = (p, v, want, dt) => {
      // (time held, in a Stop: no spring, the turn as it should be, at once and still. Left where it was when the world
      // stopped, a hand on its way out stayed 2 cm in the body for the whole of frame 7's Stop)
      if (!(dt > 0)) { p.copy(want).applyQuaternion(cRi); v.set(0, 0, 0); return; }
      cv.copy(want).applyQuaternion(cRi);
      const w = cv.lengthSq() > p.lengthSq() ? GRIP : LET, e = Math.exp(-w * dt);
      cx2.subVectors(p, cv);                                        // (how far from where it wants to be)
      const t = sa.copy(v).addScaledVector(cx2, w).multiplyScalar(dt); // (the closed form of Lowe's critically damped smoothing)
      v.addScaledVector(t, -w).multiplyScalar(e);
      p.copy(cx2.add(t).multiplyScalar(e)).add(cv);
      want.copy(p).applyQuaternion(cRq);
    };
    function armsClear(dt) {
      if (clr === undefined) clr = clearBuild();
      if (!clr) return;
      const c = clr, d0 = Math.min(0.1, Math.max(0, dt || 0));
      // (only the bones measured, from the root down: the renderer brings the rest up to date before it draws)
      root.updateWorldMatrix(true, false);
      for (const nd of c.chain) upd(nd);
      root.matrixWorld.decompose(cps, cRq, csc); cRi.copy(cRq).invert();
      let skinned = false; // (the torso's bones as they carry it: worked out once a frame, and only if an arm asks this frame)
      c.frame++; // (each slice's frame made when a point first falls in it this frame: sliceAt)
      // (rig.clearEvery: an arm asked every so many frames, set by the crowd for a person small on the screen, issue 130.
      // Between, the turns last asked are kept in the body's own frame and laid on through the same springs. 1 by default:
      // the story's people, the player and the walk's are asked every frame)
      const every = rig.clearEvery > 1 ? rig.clearEvery : 1;
      for (let side = 0; side < 2; side++) {
        const a = arms[side], A = c.arm[side];
        // (not the arm that holds an open umbrella or a rod: its pose is laid on whole, umbHold, and what it holds is no thing at the chest)
        if (side === 1 && (umbUp || rig.hold)) continue;
        if (!A.tSh) { A.tSh = new THREE.Vector3(); A.tEl = new THREE.Vector3(); A.pSh = new THREE.Vector3(); A.pEl = new THREE.Vector3(); A.vSh = new THREE.Vector3(); A.vEl = new THREE.Vector3(); A.gSh = new THREE.Vector3(); A.gEl = new THREE.Vector3(); A.since = side; A.asked = false; }
        A.tSh.set(0, 0, 0); A.tEl.set(0, 0, 0);
        const q0 = A.q0 || (A.q0 = [new THREE.Quaternion(), new THREE.Quaternion()]);
        q0[0].copy(a.ua.quaternion); q0[1].copy(a.la.quaternion);   // (the arm as it came in: the clip's, or the umbrella's)
        if (every > 1 && A.asked && (A.since = (A.since + 1) % every) !== 0) { A.tSh.copy(A.gSh).applyQuaternion(cRq); A.tEl.copy(A.gEl).applyQuaternion(cRq); } // (not this arm's frame: the turns last asked)
        else {
        if (!skinned) { skinned = true; for (const b of c.owners) skinM(c, b, c.M.get(b)); }
        const held = A.held || (A.held = []);
        held.length = 0;
        for (const g of accObjs) if (g.parent === a.wr) for (const m of g.children) if (m.geometry) {
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          m.updateMatrix(); held.push(m);
        }
        // (two passes, the second asking again only of the points the first found within NEAR of the body)
        const near = A.near || (A.near = new Uint8Array(A.f.length + A.h.length + 64));
        for (let it = 0; it < 2; it++) {
          csh.setFromMatrixPosition(a.ua.matrixWorld); cel.setFromMatrixPosition(a.la.matrixWorld); cwr.setFromMatrixPosition(a.wr.matrixWorld);
          const fl = cel.distanceTo(cwr) || 1;
          // the turns asked of the shoulder and of the elbow, each the sum of every point's own weighed by how far it is in
          wSh.set(0, 0, 0); wEl.set(0, 0, 0); clrW[0] = clrW[1] = 0;
          for (const [b, m] of A.m) if (!it || A.f.length && b === A.f[0].b) skinM(c, b, m);
          // (the hand's points, fingers and all, as the hand carries them: found once, then turned with the hand)
          if (!it) { cmw.copy(a.wr.matrixWorld).invert(); for (const x of A.h) (x.loc || (x.loc = new THREE.Vector3())).copy(x.p).applyMatrix4(A.m.get(x.b)).applyMatrix4(cmw); }
          let k = 0;
          const one = (wp, along) => { if (it && !near[k]) { k++; return; } const e = clrAsk(c, wp, along); if (!it) near[k] = e > -NEAR ? 1 : 0; k++; };
          for (const x of A.f) { cpt.copy(x.p).applyMatrix4(A.m.get(x.b)); one(cpt, Math.min(1, cpt.distanceTo(cel) / fl)); }
          for (const x of A.h) one(cpt.copy(x.loc).applyMatrix4(a.wr.matrixWorld), 1);
          for (const m of held) {
            cmw.multiplyMatrices(a.wr.matrixWorld, m.parent.matrix).multiply(m.matrix); cbox.copy(m.geometry.boundingBox);
            for (let i = 0; i < 8 && k < near.length; i++) one(cpt.set(i & 1 ? cbox.max.x : cbox.min.x, i & 2 ? cbox.max.y : cbox.min.y, i & 4 ? cbox.max.z : cbox.min.z).applyMatrix4(cmw), 1);
          }
          const wsS = clrW[0], wsE = clrW[1];
          if (!wsS && !wsE) break;
          keepArm(side);
          if (wsS) { upTo(wSh.divideScalar(wsS), 0.3); turnBone(a.ua, wSh, [a.la, a.wr]); aimFore(a, cwr); A.tSh.add(wSh); }
          if (wsE) { upTo(wEl.divideScalar(wsE), 0.3); turnBone(a.la, wEl, [a.wr]); A.tEl.add(wEl); }
        }
        A.gSh.copy(A.tSh).applyQuaternion(cRi); A.gEl.copy(A.tEl).applyQuaternion(cRi); A.asked = true; // (kept for the frames between asks)
        }
        // through the springs, and laid on the arm as it came in
        spring(A.pSh, A.vSh, A.tSh, d0); spring(A.pEl, A.vEl, A.tEl, d0);
        a.ua.quaternion.copy(q0[0]); a.la.quaternion.copy(q0[1]);
        if (A.tSh.lengthSq() + A.tEl.lengthSq() > 1e-10) {
          keepArm(side);
          upd(a.ua); upd(a.la); upd(a.wr);
          cwr.setFromMatrixPosition(a.wr.matrixWorld);
          turnBone(a.ua, wSh.copy(A.tSh), [a.la, a.wr]); aimFore(a, cwr);
          turnBone(a.la, wEl.copy(A.tEl), [a.wr]);
        }
      }
    }
    // The pose that holds an open umbrella (umbHold, issue 165), found once, here, while the bones stand in the
    // reference pose: the fist where umbrellaHold has it, the elbow down by the side and a little out and back; on a
    // rig with fingers (a Rocketbox hand's grip) the hand turned so that the shaft runs through the fist thumb side
    // up, the knuckles on along the forearm, and the fingers closed round it. Kept as each bone's own turn (q), which
    // a frame lays over the clip (umbLay); inv: where the hand is with the pose on, in the model's space, which is
    // what the umbrella is hung by (setAccessories); laQ: the forearm's turn then, for a lean laid on at the wrist
    // (refPose: every bone as the reference pose has it, so that the hold can be found again later with other numbers
    // for the fist, rig.umbTune: tools/umbrella_held.js lays several side by side to be looked at)
    const refPose = [];
    model.traverse(o => { if (o.isBone) refPose.push([o, o.quaternion.clone(), o.position.clone()]); });
    const makeHold = (t = UMB_FIST, lift = 0) => { // (lift: the grip that much higher, m, for umbHold.hi)
      const now = refPose.map(([b]) => [b.quaternion.clone(), b.position.clone()]);
      for (const [b, q, at] of refPose) { b.quaternion.copy(q); b.position.copy(at); }
      const a = arms[1], G = grip.WristR, fingers = [];
      if (G) for (let f = 0; f < 5; f++) for (const s of ['', '1', '2']) { const b = bone[`Bip01_R_Finger${f}${s}`]; if (b) fingers.push([b, f, s]); }
      const all = [a.ua, a.la, a.wr].concat(fingers.map(f => f[0]));
      model.updateMatrixWorld(true);
      const mw = model.matrixWorld, mq = model.getWorldQuaternion(new THREE.Quaternion()), ms = model.getWorldScale(V3(0, 0, 0)).y;
      const toW = v => v.clone().applyMatrix4(mw), dirW = v => v.clone().applyQuaternion(mq).normalize(), wq = b => b.getWorldQuaternion(new THREE.Quaternion());
      const H = umbrellaHold(ref.Head.pos), F = toW(H.grip), yT = dirW(H.dir);
      if (lift) F.y += lift * ms;
      const S = a.ua.getWorldPosition(V3(0, 0, 0)), E0 = a.la.getWorldPosition(V3(0, 0, 0)), W0 = a.wr.getWorldPosition(V3(0, 0, 0));
      const L1 = S.distanceTo(E0), L2 = E0.distanceTo(W0), pole = dirW(V3(-0.5, -1, -0.3));
      // (the middle of the closed hand from the wrist, as the reference pose has the hand: t.x along the fingers, t.y
      // towards the thumb, t.palm into the palm)
      // (slant: the handle lies across the palm along the knuckles, which run back towards the wrist from the first finger
      // to the little one: the hand's thumb-side axis turned by that much about the palm's)
      const Gq = G ? G.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), -t.slant)) : null;
      const handQ0 = wq(a.wr), off = G ? toW(G.at(t.x, t.y, t.palm * G.palm)).sub(W0) : null, gq = G ? mq.clone().multiply(Gq) : null;
      const fingerQ0 = fingers.map(f => wq(f[0]));
      const Wt = F.clone(), E = V3(0, 0, 0), rel = new THREE.Quaternion(), fore = V3(0, 0, 0);
      const Lf = G ? L2 : L2 + 0.075 * ms; // (no fingers to place: the fist a hand's length past the wrist, along the forearm)
      for (let it = 0; it < (G ? 5 : 1); it++) {
        const to = Wt.clone().sub(S), d = Math.min(Math.max(to.length(), Math.abs(L1 - Lf) + 1e-3), L1 + Lf - 1e-3);
        to.normalize();
        const along = (L1 * L1 - Lf * Lf + d * d) / (2 * d), out = Math.sqrt(Math.max(0, L1 * L1 - along * along));
        const pl = pole.clone().addScaledVector(to, -pole.dot(to)).normalize();
        E.copy(S).addScaledVector(to, along).addScaledVector(pl, out);
        fore.copy(S).addScaledVector(to, d).sub(E).normalize();
        if (!G) break;
        const xT = fore.clone().addScaledVector(yT, -fore.dot(yT)).normalize(), zT = xT.clone().cross(yT);
        rel.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xT, yT, zT));
        if (t.roll) rel.premultiply(new THREE.Quaternion().setFromAxisAngle(yT, t.roll)); // (the hand turned about the shaft)
        rel.multiply(gq.clone().invert());
        Wt.copy(F).sub(off.clone().applyQuaternion(rel));
      }
      aim(a.ua, a.la, E.clone().sub(S).normalize());
      aim(a.la, a.wr, fore.clone());
      if (G) {
        a.wr.quaternion.copy(wq(a.la).invert().multiply(rel.clone().multiply(handQ0)));
        // the fingers closed round the handle, each joint about the hand's own thumb-side axis; the thumb laid across them
        const ax = (v, q0) => v.clone().applyQuaternion(mq).applyQuaternion(q0.clone().invert()).normalize();
        const gx = V3(1, 0, 0).applyQuaternion(Gq), gy = V3(0, 1, 0).applyQuaternion(Gq), gz = V3(0, 0, 1).applyQuaternion(Gq);
        fingers.forEach(([b, f, s], k) => {
          const q0 = fingerQ0[k];
          if (f > 0) b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(ax(gy, q0), -G.palm * t.curl[s === '' ? 0 : s === '1' ? 1 : 2]));
          else if (s === '') b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(ax(gz, q0), t.thumb[0])).multiply(new THREE.Quaternion().setFromAxisAngle(ax(gx, q0), G.palm * t.thumb[1]));
          else b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(ax(gy, q0), -G.palm * t.thumb[2]));
        });
      }
      model.updateMatrixWorld(true);
      umbHold = { bones: all, q: all.map(b => b.quaternion.clone()), clip: all.map(() => new THREE.Quaternion()),
        inv: new THREE.Matrix4().copy(mw).invert().multiply(a.wr.matrixWorld).invert(), laQ: mq.clone().invert().multiply(wq(a.la)) };
      refPose.forEach(([b], k) => { b.quaternion.copy(now[k][0]); b.position.copy(now[k][1]); });
      model.updateMatrixWorld(true);
      if ((look.acc || []).includes('umbrella_open')) { accKey = ''; setAccessories(); } // (made with an umbrella already up: hung again, from the hand)
    };
    if (reaches && ref.Head) {
      // (the hold, and the same hold with the grip UMB_RAISE higher: umbLay blends towards it by rig.umbRaise)
      const holdBoth = t => { makeHold(t, UMB_RAISE); const hi = umbHold.q.map(q => q.clone()); makeHold(t); umbHold.hi = hi; };
      holdBoth(UMB_FIST);
      rig.umbTune = t => { armBack(); holdBoth(Object.assign({}, UMB_FIST, t)); };
    }
    // The mixer only writes a bone whose value has changed, so under a still clip a foot moved
    // here stays moved: put it back where the clip had it before measuring again (or standing up).
    const feetBack = () => { for (const l of legs) if (l.moved) { if (l.ft.position.equals(l.set)) l.ft.position.copy(l.home); l.moved = false; } };
    // ... and so for the legs bent and the arms put on the wheel: back to the clip's pose before the mixer runs, else
    // under a still clip a frame began with the thighs already forward, the feet were measured from there, the body
    // went down 0.38 m less and the head rose that much through a car's roof, on the frames where the clip held still
    // (which ones depends on the frame times: Tokyo's taxi driver under load, #392)
    const bent = [];
    const bendBack = () => { for (const [b, q] of bent) b.quaternion.copy(q); bent.length = 0; };
    // ... and the head turned to look at something: the turn is laid over the clip's pose and taken off before the mixer
    // runs. Laid over the head as the last frame left it, it was added again every frame the mixer wrote nothing (time held
    // in a Stop, or a clip that does not key the head: Aoi's Present), and the head went round and round (tools/head_spin.js)
    const headQ = new THREE.Quaternion(); let headLaid = false;
    const headBack = () => { if (headLaid) { head.quaternion.copy(headQ); headLaid = false; } };
    const bend = b => { const q = (b.userData.clipQ = b.userData.clipQ || new THREE.Quaternion()).copy(b.quaternion); bent.push([b, q]); };
    function seat() {
      if (!seated) return;
      model.position.y = 0;
      feetBack();
      root.updateWorldMatrix(true, true); // the parents too: in a moving car they have moved since they were drawn
      fw.set(0, 0, 1).applyQuaternion(root.getWorldQuaternion(sq));
      // with the feet back where the clip has them, the shin's length and the ankle's height
      for (const l of legs) { l.y0 = l.ft.getWorldPosition(sa).y; l.shin = sa.distanceTo(l.ll.getWorldPosition(sb)); }
      let drop = 0;
      for (const l of legs) {
        bend(l.ul); bend(l.ll);
        // (the thighs along the way the figure faces, or sloping down from the hips by rig.thighDown radians: on a seat
        // higher than a chair's, the knees come down and the hips stay up on it, the feet still on the floor)
        aim(l.ul, l.ll, rig.thighDown ? sd2.copy(fw).multiplyScalar(Math.cos(rig.thighDown)).add(sb.set(0, -Math.sin(rig.thighDown), 0)) : sd2.copy(fw));
        const down = sd2.set(0, -1, 0).addScaledVector(fw, rig.legRake ?? 0.12).normalize();
        aim(l.ll, l.hangs ? l.ft : null, down); // (towards the foot where it hangs from the shin: those bones' axes differ)
        const ankle = l.ll.getWorldPosition(sa).addScaledVector(down, l.shin);
        drop = Math.min(drop, l.y0 - ankle.y);
        if (l.hangs) continue; // it came with the shin
        l.ft.parent.updateMatrixWorld(true);
        l.home = (l.home || new THREE.Vector3()).copy(l.ft.position);
        l.ft.position.copy(l.ft.parent.worldToLocal(ankle));
        l.set = (l.set || new THREE.Vector3()).copy(l.ft.position);
        l.moved = true;
      }
      model.position.y = drop / root.getWorldScale(sb).y; // (a car's seat may make the whole figure a little smaller: cars.js sit)
      // a seat of a known height (rig.seatH: its top over the floor the feet are on, m): the thighs slope down from the hips
      // (rig.thighDown) until the hip joint stands HIP_OVER it, the feet still on the floor. A chair's pose stands the hips
      // about a shin's length up, which on a wall at 0.4 m or a bench at 0.44 m was the hip joint level with the top and the
      // body sunk into it (issue 171). Worked out from this frame's pose for the next (one step: the hips rise as the sine)
      if (rig.seatH != null && bones.Hips && legs.length) {
        model.updateMatrixWorld(true);
        const h = bones.Hips.getWorldPosition(sa).y - root.getWorldPosition(sb).y, L = legs[0].ul.getWorldPosition(sa).distanceTo(legs[0].ll.getWorldPosition(sb));
        if (L > 0.2) rig.thighDown = Math.asin(Math.min(0.7, Math.max(0, Math.sin(rig.thighDown || 0) + (rig.seatH + HIP_OVER - h) / L)));
      }
      if (!rig.reach || !reaches) return;
      // hands on the wheel: each elbow a little down and out from halfway, the hand at the rim
      root.updateWorldMatrix(false, true);
      const side = r1.set(1, 0, 0).applyQuaternion(root.getWorldQuaternion(rq));
      for (const a of arms) {
        const hand = r2.copy(rig.reach).addScaledVector(side, 0.16 * a.s), sh = a.ua.getWorldPosition(r3);
        const elbow = r4.copy(sh).lerp(hand, 0.5).addScaledVector(side, 0.09 * a.s);
        elbow.y -= 0.1;
        bend(a.ua); bend(a.la);
        aim(a.ua, a.la, elbow.sub(sh).normalize());
        aim(a.la, a.wr, hand.sub(a.la.getWorldPosition(r3)).normalize());
      }
    }
    rig.wave = (t = 0) => { if (!act.Wave) return; waveUntil = t + act.Wave.getClip().duration * 0.95; play('Wave', 0.2, true); };
    // the top of the head in the world as the rig is posed: over the head's joint as it is now (seated
    // and leaning back, or sitting up), as high as the hair stood over it standing
    if (thigh && crown > 0) rig.headTop = (out = V3(0, 0, 0)) => (head && overHead > 0 ? head.getWorldPosition(out).add(sb.set(0, overHead * model.getWorldScale(sa).y, 0))
      : thigh.getWorldPosition(out).add(sb.set(0, crown * model.getWorldScale(sa).y, 0)));
    // a view through this person's eyes: the head, and whatever is on it, shrinks out of the way
    rig.hideHead = on => { if (head) head.scale.setScalar(on ? 1e-3 : 1); };
    rig.head = head; // (the bone the look is laid on: tools/head_spin.js reads it)
    rig.clipName = () => (cur ? cur.getClip().name : null); // (the clip it plays now: tools/crowd_still.js reads it)
    // something held out in the right hand: rig.hold is where the fist goes (a point in the world, or null), and
    // rig.fist(out) where the wrist is as posed
    rig.hold = null;
    rig.fist = out => (reaches ? arms[1].wr.getWorldPosition(out) : null);
    // speed in m/s, mode 'ground' | 'air' | 'sit' | 'talk'; t is the game clock. Seated, the
    // root is where the feet rest: thighs forward, shins down, the hips a chair's height above it
    rig.animate = (dt, speed, mode = 'ground', t = 0) => {
      const s = look.scale || 1;
      model.position.y = 0;
      // (a conversation is talked in and listened to on your feet: walking, the gait)
      if ((mode === 'talk' || mode === 'listen') && speed >= 0.15) mode = 'ground';
      const convo = mode === 'talk' || mode === 'listen';
      // a nod hello once, as a conversation opens (a wave is for calling someone over from across the square, walktalk.js
      // bark: at arm's length it went on three seconds before a word), not again at each turn of it (a speaker's runs,
      // walktalk.js say), nor from someone in a scene already under way (rig.noWave: the story's people)
      if (convo) convoT = t;
      else if (t - convoT > 4 || t < convoT) talked = false;
      if (mode === 'talk' && !talked && !rig.noWave && act.Nod) { waveUntil = t + Math.min(1.6, act.Nod.getClip().duration * 0.9); play('Nod', 0.25, true); }
      if (convo) talked = true;
      const waving = t < waveUntil && speed < 0.3 && mode !== 'sit' && mode !== 'air';
      if (convo || mode !== 'ground' || speed >= 0.15) glanceUntil = -Infinity;
      if (waving && mode !== 'listen') { /* let the wave finish (hello, or a call-out's) */ }
      else if (mode === 'talk') play(act.Talk ? 'Talk' : 'Idle', 0.35);
      else if (mode === 'listen') play(act.Listen ? 'Listen' : 'Idle', 0.4);
      else if (mode === 'sit') play('Idle_Neutral', 0.2);
      else if (mode === 'air') play('Run', 0.15).setEffectiveTimeScale(0.3);
      else if (speed < 0.15) {
        // Waiting (rig.waits: the map's named people). Stood alone a person does not hold one pose all evening: now and
        // then they look round, for whoever they are waiting for, at the crossing. Not while they look at you (rig.lookTarget:
        // their glance is yours), and only as time goes (dt: nothing stirs in a held world)
        const base = idleClip();
        if (glanceNext == null || glanceNext - t > 60) glanceNext = t + 5 + 11 * grnd();
        const can = rig.waits && act.LookAround && (base === 'Idle' || base === 'Idle_Neutral') && !rig.lookTarget;
        if (can && dt > 0 && t >= glanceNext && t >= glanceUntil) { glanceUntil = t + act.LookAround.getClip().duration * 0.92; glanceNext = glanceUntil + 9 + 14 * grnd(); play('LookAround', 0.6, true); }
        else if (!(can && t < glanceUntil)) { glanceUntil = -Infinity; play(base, cur === act.LookAround ? 0.6 : 0.3); }
      }
      else if (speed < 2.1) play('Walk', 0.25).setEffectiveTimeScale(Math.max(0.5, Math.min(1.7, speed / (speeds.Walk * s))));
      else if (act.Sprint && speed > 7) play('Sprint', 0.2).setEffectiveTimeScale(Math.max(0.7, Math.min(1.6, speed / (speeds.Sprint * s))));
      else play('Run', 0.2).setEffectiveTimeScale(Math.max(0.6, Math.min(2.4, speed / (speeds.Run * s)))); // up to the 8.5 m/s sprint (game.js GAIT)
      if (mode !== 'sit') feetBack();
      armBack();
      bendBack();
      headBack();
      mixer.update(dt);
      if (mode === 'sit') seat();
      else if (rig.hold && reaches) holdUmbrella(rig.hold);
      else if (umbUp) umbLay();
      if (mode !== 'sit' && mode !== 'air' && OPT.clearArms) armsClear(dt);
      // the walk cycle as a phase, two steps per cycle (footsteps)
      const d = cur.getClip().duration, tt = cur.time / d;
      if (tt < lastT) cycles++;
      lastT = tt;
      rig.phase = (cycles + tt) * Math.PI * 2;
      // turn the head towards whatever is worth looking at
      lookW += ((rig.lookTarget && speed < 2.1 ? 1 : 0) - lookW) * Math.min(1, dt * 4);
      if (head && lookW > 0.01) {
        root.updateMatrixWorld(true);
        head.getWorldPosition(hp);
        const tgt = rig.lookTarget || hp;
        tv.subVectors(tgt, hp);
        headQ.copy(head.quaternion); headLaid = true;
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(tq2));
        let yaw = Math.atan2(tv.x, tv.z) - Math.atan2(fwd.x, fwd.z);
        yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
        yaw = Math.max(-1.1, Math.min(1.1, yaw)) * lookW;
        head.getWorldQuaternion(tq);
        tq.premultiply(tq2.setFromAxisAngle(up, yaw));
        head.parent.getWorldQuaternion(tq2).invert();
        head.quaternion.copy(tq2.multiply(tq));
      }
    };
    return rig;
  }

  // ------------------------------------------------------------ the crowd: instanced far, skinned near
  // the far crowd's walk: the legs and arms swung about the hips, knees and shoulders by the parts each vertex
  // belongs to (pipeline/fetch_people.py part_of), for the dolls and the scanned cast's far copies alike
  const CROWD_POSE = `
attribute float mat; attribute float part; attribute vec3 aAnim; attribute float iUmb;
#ifdef OE_PARTW
attribute vec2 pw;
#endif
uniform float uTime; uniform vec2 uHip; uniform vec2 uKnee; uniform vec2 uShoulder;
uniform vec3 uUmbS; uniform vec3 uUmbE; uniform vec4 uUmbD; uniform vec4 uUmbR1; uniform vec4 uUmbR2; uniform float uUmbPart;
mat3 rx(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
vec3 turn(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
// legs swing from the hips with the knee bending on the back swing; arms swing from the shoulders.
// A negative amplitude means sitting: thighs forward, shins down.
vec3 crowdPose(vec3 p, bool isNormal) {
  bool sit = aAnim.z < -0.5;
  float amp = max(aAnim.z, 0.0), ph = uTime * aAnim.y + aAnim.x, sw = sin(ph) * amp;
  float side = (part > 0.5 && part < 1.5) || (part > 2.5 && part < 3.5) || (part > 4.5 && part < 5.5) ? 1.0 : -1.0;
  bool leg = (part > 0.5 && part < 2.5) || part > 4.5, shin = part > 4.5, arm = part > 2.5 && part < 4.5;
  // (a scanned cast member's far copy, OE_PARTW: each corner turns by its share of its limb, wC, and below the knee by
  // its share of the knee, wK, as skinning blends bones, so nothing tears where a limb meets the body: pipeline/crowd_cast.mjs.
  // A doll's corner is wholly its part's)
#ifdef OE_PARTW
  float wC = pw.x, wK = pw.y;
#else
  float wC = 1.0, wK = shin ? 1.0 : 0.0;
#endif
  vec3 piv;
  if (leg && wK > 0.0) { float k = (sit ? 1.5708 : max(0.0, -cos(ph) * side) * amp * 1.3) * wK; piv = vec3(0.0, uKnee); p = isNormal ? rx(k) * p : rx(k) * (p - piv) + piv; }
  if (leg) { float a = (sit ? -1.5708 : sw * side) * wC; piv = vec3(0.0, uHip); p = isNormal ? rx(a) * p : rx(a) * (p - piv) + piv; }
  // the arm holding an umbrella up (iUmb): this copy's own arm, turned about its own elbow and then about its own
  // shoulder by the two turns that bring its hand to the hold, the fist in front of the shoulder at chest height
  // (uUmbS, uUmbE, uUmbD, uUmbR1, uUmbR2: people.js umbArm, worked once for each character). The umbrella is hung
  // where that puts the hand (crowdRenderer holdOf)
  // (iUmb its share: 0 swinging, 1 held up, between as the umbrella is put up or down)
  if (arm && abs(part - uUmbPart) < 0.5 && iUmb > 0.0 && !sit) {
    float u = min(iUmb, 1.0);
    float lo = isNormal ? step(uUmbD.w, dot(position - uUmbS, uUmbD.xyz)) : smoothstep(uUmbD.w - 0.03, uUmbD.w + 0.03, dot(position - uUmbS, uUmbD.xyz));
    p = isNormal ? turn(p, uUmbR2.xyz, uUmbR2.w * lo * u * wC) : turn(p - uUmbE, uUmbR2.xyz, uUmbR2.w * lo * u * wC) + uUmbE;
    p = isNormal ? turn(p, uUmbR1.xyz, uUmbR1.w * u * wC) : turn(p - uUmbS, uUmbR1.xyz, uUmbR1.w * u * wC) + uUmbS;
    float b = -sw * side * 0.8 * (1.0 - u) * wC;
    piv = vec3(0.0, uShoulder); p = isNormal ? rx(b) * p : rx(b) * (p - piv) + piv;
  } else if (arm) { piv = vec3(0.0, uShoulder); p = isNormal ? rx(-sw * side * 0.8 * wC) * p : rx(-sw * side * 0.8 * wC) * (p - piv) + piv; }
  if (!isNormal) p.y += abs(cos(ph)) * 0.035 * amp;
  // standing (aAnim.z between -0.5 and 0): alive, not a statue. The upper body turns a little one way and the other
  // as one looks about, and the weight goes from one foot to the other, the body leaning a degree over the foot it is on,
  // each at a pace of its own (aAnim.x: the walker's own phase). Stood with no such change a figure a few metres off
  // read as stuck (the owner at Hachiko, tools/crowd_still.js)
  if (aAnim.z < -0.05 && aAnim.z > -0.5) {
    float t = uTime * (0.5 + 0.12 * fract(aAnim.x * 0.159)) + aAnim.x;
    float yaw = (0.1 * sin(t * 0.7) + 0.05 * sin(t * 1.9 + 1.3)) * smoothstep(uHip.x - 0.05, uShoulder.x, position.y);
    float roll = 0.02 * sin(t * 0.43 + 0.4);
    float cy = cos(yaw), sy = sin(yaw), cr = cos(roll), sr = sin(roll);
    vec3 o = isNormal ? vec3(0.0) : vec3(0.0, 0.0, uHip.y);
    p -= o; p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z) + o;
    p = vec3(cr * p.x - sr * p.y, sr * p.x + cr * p.y, p.z);
  }
  return p;
}`;

  // A far copy's arm with an umbrella up (issue 165). The copy has no bones: its arm was folded by height, about an
  // elbow assumed 27 cm under the shoulder on the body's middle line, whatever the character's build or how its arms
  // hang, so on many the forearm bent out of shape or the hand went out to the side, and the umbrella was not in it.
  // Here, once for each character, from its own geometry: the arm that is its right one (which part), its shoulder,
  // its hand (the middle of the arm's last 9 cm) and its elbow between them; then the same reach the near people's
  // hold makes (the fist where umbrellaHold has it, the elbow down, out and back), as two turns: the forearm's about
  // the elbow, then the whole arm's about the shoulder. The shader lays them on (CROWD_POSE) and the umbrella is hung
  // at the fist they give (crowdRenderer holdOf): one place for the hand, worked once
  function umbArm(Lc) {
    if (Lc.umbArm) return Lc.umbArm;
    const A = Lc.geometry.attributes, sh = Lc.extras.shoulder, n = A.part.count, armOf = i => !A.pw || A.pw.getX(i) >= 0.5, // (a far copy's corners the arm mostly carries: crowdPose OE_PARTW)
      P = [3, 4].map(k => { const c = V3(0, 0, 0); let m = 0; for (let i = 0; i < n; i++) if (A.part.getX(i) === k && armOf(i)) { c.x += A.position.getX(i); m++; } return m ? c.x / m : 0; });
    const part = P[0] < P[1] ? 3 : 4, pts = []; // (the right hand is at -x)
    for (let i = 0; i < n; i++) if (A.part.getX(i) === part && armOf(i)) pts.push(V3(A.position.getX(i), A.position.getY(i), A.position.getZ(i)));
    const mean = l => l.reduce((a, b) => a.add(b), V3(0, 0, 0)).divideScalar(l.length || 1);
    const low = Math.min(...pts.map(q => q.y)), high = Math.max(...pts.map(q => q.y));
    const H = pts.length ? mean(pts.filter(q => q.y < low + 0.09)) : V3(-0.2, sh[0] - 0.6, sh[1]), top = pts.length ? mean(pts.filter(q => q.y > high - 0.06)) : V3(-0.18, sh[0], sh[1]);
    const S = V3(top.x, Math.min(sh[0], top.y), sh[1]), d = H.clone().sub(S), len = d.length();
    d.divideScalar(len);
    const L1 = 0.45 * len, L2 = len - L1, E = S.clone().addScaledVector(d, L1);
    const hd = V3(0, sh[0] + 0.16, sh[1]), F = umbrellaHold(hd).grip, to = F.clone().sub(S), dist = Math.min(Math.max(to.length(), Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3);
    to.normalize();
    const along = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), out = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    const pole = V3(-0.5, -1, -0.3).normalize(), pl = pole.addScaledVector(to, -pole.dot(to)).normalize();
    const E2 = S.clone().addScaledVector(to, along).addScaledVector(pl, out), fist = S.clone().addScaledVector(to, dist);
    const q1 = new THREE.Quaternion().setFromUnitVectors(d, E2.clone().sub(S).normalize());
    const q2 = new THREE.Quaternion().setFromUnitVectors(d, fist.clone().sub(E2).normalize().applyQuaternion(q1.clone().invert()));
    const aa = q => { const a = 2 * Math.acos(Math.max(-1, Math.min(1, q.w))), k = Math.sqrt(Math.max(1e-12, 1 - q.w * q.w)); return new THREE.Vector4(q.x / k, q.y / k, q.z / k, a); };
    return (Lc.umbArm = { fist, hd, rest: H, uni: { uUmbS: { value: S }, uUmbE: { value: E }, uUmbD: { value: new THREE.Vector4(d.x, d.y, d.z, L1) }, uUmbR1: { value: aa(q1) }, uUmbR2: { value: aa(q2) }, uUmbPart: { value: part } } });
  }
  function crowdMaterial(ex, U, Lc) {
    const pal = colours(ex, {}), cls = new Float32Array(N);
    ex.classes.forEach((c, i) => { cls[i] = CLS[c] || 0; });
    const skinRef = (ex.palette[ex.classes.indexOf('skin')] || [0.617])[0];
    const uni = { ...umbArm(Lc).uni, uPal: { value: pal }, uCls: { value: cls }, uSkinRef: { value: skinRef },
      uHip: { value: new THREE.Vector2(...ex.hip) }, uKnee: { value: new THREE.Vector2(...ex.knee) }, uShoulder: { value: new THREE.Vector2(...ex.shoulder) } };
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uni, { uTime: U.uTime });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
${CROWD_POSE}
attribute vec3 iSkin; attribute vec3 iHair; attribute vec3 iTop; attribute vec3 iLegs; attribute float iPat;
uniform vec3 uPal[${N}]; uniform float uCls[${N}]; uniform float uSkinRef; varying vec3 vPal; varying float vCls; varying float vPatId; varying vec3 vObj;`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
objectNormal = crowdPose(objectNormal, true);`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed = crowdPose(transformed, false);
int mi = int(mat + 0.5); vec3 base = uPal[mi]; float c = uCls[mi];
vPal = c < 0.5 ? base : c < 1.5 ? iSkin * (base.r / uSkinRef) : c < 2.5 ? iHair : c < 3.5 ? iHair * 0.6 : c < 4.5 ? iTop : iLegs;
vCls = c; vPatId = iPat; vObj = position;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vPal; varying float vCls; varying float vPatId; varying vec3 vObj;
${PAT_GLSL}`)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( (vPatId > 0.5 && vCls > 3.5 && vCls < 4.5) ? oePattern(vPal, vObj, vPatId, vec3(-1.0)) : vPal, opacity );');
    };
    // the shadows walk too
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uni, { uTime: U.uTime });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
${CROWD_POSE}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed = crowdPose(transformed, false);`);
    };
    return { mat, depth };
  }

  // The same scanned person in other clothes. A cast of a dozen fills a crossing, so two of one character meet, and
  // side by side in the one red shirt, or three in the one taupe suit, they read as copies (the owner's review).
  // Each walker wears one of DRESS, and every one of them, the first too, is a Tokyo street's colours (issue 64:
  // the hue wheel turned a green T-shirt into aqua, mint and lime, and a blue blouse into sky blue, and the owner saw
  // them first at the Scramble's kerb). The cloth's colour is turned as before, which picks where it lands, and then
  // drawn to the nearest of the street's hues (STREET below: navy, brown to camel and beige, olive, a dark wine),
  // its colour held to what that hue has on the street at its lightness: a dark navy or a brown may be deep, a light
  // one is a greyish blue or a beige, never a pastel or a bright. A neutral, a suit, a skirt, a coat, is taken
  // lighter or darker and dyed a little (navy, charcoal, sand), since a turn does nothing to a grey; and a walker's
  // colours as a whole lighter or darker. White stays white. The skin is left as it is (its mask, or else its
  // colour and lightness: red over green over blue in a skin's ratios), and the head has its own material.
  // [turn in radians, colour kept (0 grey to 1 the street's most), tone, dye: I and Q of the cast it takes].
  // (most of a Tokyo evening crowd is black, charcoal, navy and grey with white, beige, camel and brown, some olive;
  // docs/LOOK.md "A Tokyo street's colours". Three in twelve are near grey or black: the turn matters little there)
  // (the near-grey changes keep a third of the street's colour and take a dye, navy or sand: with none, every body
  // took the one light grey, and four strangers at a kerb stood in the same grey top, issue 64)
  // (dealt to one person's walkers in turn, below, and the tones go dark and light by turns round the list, so the same
  // person twice is once near black and once a light grey or a sand, not two shades of one colour. The owner, of a
  // kerb before this: at the least, one person's clothes should differ, black, white, grey)
  const DRESS = [[0, 1, 1, 0, 0], [3.1, 0.3, 0.36, -0.01, 0.006], [-2.5, 0.35, 1.6, 0.016, -0.004], [2.3, 0.6, 0.55, -0.022, 0.008],
    [-1.7, 0.8, 1.5, 0.014, 0.0], [0.5, 0.55, 0.4, -0.018, 0.01], [2.8, 0.9, 1.5, 0.016, -0.004], [1.7, 0.6, 0.62, 0.012, 0.0],
    [-1.2, 0.4, 1.15, -0.016, 0.008], [-3.0, 0.35, 0.45, 0.01, -0.006], [-0.75, 0.7, 1.35, -0.016, 0.006], [1.0, 0.7, 0.8, 0.02, 0.0]];
  const dressOf = i => (Math.imul(i + 7, 2246822519) >>> 16) % DRESS.length;
  // (the colour kept is the length of the turn's vector: no new attribute or uniform)
  const dressVec = (k, out, dye) => { const D = DRESS[k]; out.set(Math.cos(D[0]) * D[1], Math.sin(D[0]) * D[1], D[2]); if (dye) dye.set(D[3], D[4]); return out; };
  // (dress: vec3 the turn's cos and sin times the colour kept, and the tone; dye: vec2; after the picture is read into
  // diffuseColor, which is linear. STREET: each hue's direction in YIQ (from sRGB navy 35,45,75; brown 120,80,50;
  // olive 95,95,60; wine 95,35,45, made linear), how often it pulls, and how much colour it may have for its lightness,
  // dark and light: chroma / Y, as navy 0.81, denim 0.61, camel 0.48, beige 0.20, khaki 0.27, wine 1.27 measure)
  const DRESS_GLSL = `{
    vec3 c = diffuseColor.rgb; float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
    float gr = c.g / max(c.r, 1e-4), bg = c.b / max(c.g, 1e-4), sat = (mx - mn) / max(mx, 1e-4);
    #ifdef OE_SKIN_MASK
    // (the character's own mask, in its picture's alpha: 0.8 on skin, and on a far copy's head and hair, 1 on cloth.
    // blender/build_people.py skin_mask, issue 505: every garment changes, a tan waistcoat too, and no hand is dyed)
    float skin = 1.0 - smoothstep(0.86, 0.95, diffuseColor.a);
    #else
    float skin = step(c.g, c.r) * step(c.b, c.g) * smoothstep(0.3, 0.38, gr) * (1.0 - smoothstep(0.78, 0.86, gr)) * smoothstep(0.3, 0.4, bg) * smoothstep(0.26, 0.36, mx);
    #endif
    float Y = dot(c, vec3(0.299, 0.587, 0.114)), I = dot(c, vec3(0.596, -0.274, -0.322)), Q = dot(c, vec3(0.211, -0.523, 0.312));
    float ch = length(vec2(I, Q)), keep = length(dress.xy);
    vec2 t = dress.xy / max(keep, 1e-4), h = vec2(I * t.x - Q * t.y, I * t.y + Q * t.x) / max(ch, 1e-5);
    // (drawn to the street's hues: each pulls as it is near, the nearest most)
    vec4 S0 = vec4(-0.860, 0.511, 1.0, 0.0), S1 = vec4(0.995, 0.095, 1.0, 0.0), S2 = vec4(0.718, -0.696, 0.55, 0.0), S3 = vec4(0.920, 0.393, 0.3, 0.0);
    float w0 = S0.z * exp(7.0 * (dot(h, S0.xy) - 1.0)), w1 = S1.z * exp(7.0 * (dot(h, S1.xy) - 1.0)),
      w2 = S2.z * exp(7.0 * (dot(h, S2.xy) - 1.0)), w3 = S3.z * exp(7.0 * (dot(h, S3.xy) - 1.0)), ws = w0 + w1 + w2 + w3;
    vec2 hs = normalize(w0 * S0.xy + w1 * S1.xy + w2 * S2.xy + w3 * S3.xy + 1e-5 * h);
    // (how much colour that hue has on the street at this lightness: navy 0.8 dark to 0.12 light, brown 0.75 to 0.22,
    // olive 0.35 to 0.12, wine 0.6 to 0.12. A blue is a navy only while it is dark: a mid blue at the navy's
    // strength was a royal blue shirt, the brightest thing at the kerb)
    float L = smoothstep(0.03, 0.5, Y);
    float rmax = (w0 * mix(0.8, 0.12, smoothstep(0.02, 0.2, Y)) + w1 * mix(0.75, 0.22, L) + w2 * mix(0.35, 0.12, L) + w3 * mix(0.6, 0.12, L)) / ws;
    vec2 iq = hs * min(ch * keep, rmax * Y * keep);
    float neutral = (1.0 - smoothstep(0.3, 0.62, sat)) * (1.0 - smoothstep(0.42, 0.7, Y));
    // (the walker's colours lighter or darker, all but a white: the neutrals fully, a coloured cloth most of the way)
    Y = min(Y * mix(1.0, dress.z, mix(0.7, 1.0, neutral) * (1.0 - smoothstep(0.42, 0.7, Y))), max(Y, 0.8));
    iq += dye * neutral * (0.5 + Y * 3.0);
    vec3 d = max(vec3(0.0), vec3(Y + 0.956 * iq.x + 0.621 * iq.y, Y - 0.272 * iq.x - 0.647 * iq.y, Y - 1.106 * iq.x + 1.703 * iq.y));
    diffuseColor.rgb = mix(d, c, skin);
  }`;
  // a near person's clothes (their body's material, a copy of its own): rig.dress, below
  // what of a scanned person the crowd's change of clothes dresses (rig.dress), and its copy of a material for it
  const dressable = o => o.isSkinnedMesh && !Array.isArray(o.material) && !!o.material.map && !/_opacity$|_head$/.test(o.material.name || '');
  function dressedCopy(m0, T) {
    const m = m0.clone();
    m.userData = { dress: { value: new THREE.Vector3(1, 0, 1) }, dye: { value: new THREE.Vector2() } };
    dressMaterial(m, !!T.mask && /_body$/.test(m.name || '')); litMaterial(m);
    return m;
  }
  // The dressed variant's program, compiled once a library (one for a body whose picture marks its skin, one for one that
  // does not) with the first cast member that comes: the template's warm-up (lib.warm) reached its own materials, and
  // the first walker of the crowd drawn in other clothes linked this one in a draw, in the opening on the desktop tier
  // (issue 31)
  // (each character with its own body until the variant is made: one promise for the library, from whichever character
  // came first, held every other character of the cast until that one's pictures were up, and the first was as often as
  // not someone nobody near was wearing, its pictures at the back of the queue: at the kerb on a desktop twenty characters
  // warmed by the first minute waited three more for it, issue 261. Once made, a character's is a lookup and none waits)
  function warmDress(lib, T, w) {
    const key = T.mask ? 'masked' : 'plain', W = lib.dressWarm || (lib.dressWarm = {});
    if (W[key] === true) return null;
    let src = null;
    T.scene.traverse(o => { if (!src && dressable(o)) src = o; });
    if (!src) return null;
    const c = src.clone();
    c.material = dressedCopy(src.material, T);
    return w(c).then(() => { W[key] = true; }, () => {});
  }
  function dressMaterial(m, masked) {
    const own = m.onBeforeCompile, key = m.customProgramCacheKey;
    m.onBeforeCompile = (sh, r) => {
      if (own) own.call(m, sh, r);
      sh.uniforms.uDress = m.userData.dress; sh.uniforms.uDye = m.userData.dye;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uDress;\nuniform vec2 uDye;')
        .replace('#include <map_fragment>', `#include <map_fragment>\n{ vec3 dress = uDress; vec2 dye = uDye;\n${DRESS_GLSL} }`);
    };
    if (masked) m.defines = Object.assign({}, m.defines, { OE_SKIN_MASK: '' });
    m.customProgramCacheKey = () => `dress7${masked ? 'm' : ''}|${key ? key.call(m) : ''}`;
  }

  // A scanned cast member's far copy (lib.far, pipeline/crowd_cast.py): its own picture, swung as the dolls are. Lit as
  // the near walker is (litMaterial), with its roughness; the hair cards cut out of the picture, in the shadow too.
  function castMaterial(L, U) {
    const ex = L.extras;
    const uni = { ...umbArm(L).uni, uHip: { value: new THREE.Vector2(...ex.hip) }, uKnee: { value: new THREE.Vector2(...ex.knee) }, uShoulder: { value: new THREE.Vector2(...ex.shoulder) } };
    const mat = new THREE.MeshStandardMaterial({ map: L.map, roughness: 0.7, metalness: 0, alphaTest: 0.4 });
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uni, { uTime: U.uTime });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
${CROWD_POSE}`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
objectNormal = crowdPose(objectNormal, true);`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed = crowdPose(transformed, false);
vDress = iDress; vDye = iDye;`)
        .replace('#include <common>', '#include <common>\nattribute vec3 iDress;\nattribute vec2 iDye;\nvarying vec3 vDress;\nvarying vec2 vDye;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vDress;\nvarying vec2 vDye;')
        .replace('#include <map_fragment>', `#include <map_fragment>\n{ vec3 dress = vDress; vec2 dye = vDye;\n${DRESS_GLSL} }`); // (the clothes this walker wears: DRESS)
    };
    const pwOn = !!L.geometry.getAttribute('pw'); // (each corner's share of its limb: crowdPose, OE_PARTW)
    mat.defines = Object.assign(ex.mask ? { OE_SKIN_MASK: '' } : {}, pwOn ? { OE_PARTW: '' } : {});
    mat.customProgramCacheKey = () => `crowd-cast-dress7${ex.mask ? 'm' : ''}${pwOn ? 'w' : ''}`;
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: L.map, alphaTest: 0.4 });
    depth.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uni, { uTime: U.uTime });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
${CROWD_POSE}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed = crowdPose(transformed, false);`);
    };
    if (pwOn) depth.defines = { OE_PARTW: '' };
    depth.customProgramCacheKey = () => `crowd-cast-depth${pwOn ? 'w' : ''}`;
    return { mat, depth };
  }

  // Draws actors.crowd's pedestrians: a skinned person for the nearest few, an instance
  // of the character's low-detail copy for everyone else.
  // Each character's instances are kept packed (issue 352): the ones drawn this frame are the first mesh.count
  // slots, and only that range of the matrices and the gait is sent to the GPU. A walker that is not drawn (out
  // for the hour, near enough to be a skinned person, or out of the camera's sight by more than a shadow's
  // length) changes places with the last one drawn, their colours and all, so it costs no vertex work at all:
  // before, every slot was drawn every frame, the hidden ones as a model scaled to nothing, in the view and
  // again in the sun's shadow map, and every buffer was sent whole. camera: the view to cull against (none:
  // no culling).
  // real: the textured Rocketbox characters (the NPCs' cast, build_people.py --npcs) the nearest walkers are drawn
  // as, each the sex of their far figure, instead of the far crowd's own character close up: at eye level a
  // passer-by is a person, with the scanned face, hair and clothes the NPCs have (none: the far crowd's own)
  function crowdRenderer(world, lib, U, P, { near = 14, nearR = 32, style = null, camera = null, real = null, realHeight = null, stillNear = 0, coarseM = 60, farM = Infinity, headPx = 30, headStill = 16, bigCap = 0, stillCap = 0, inPlay = null } = {}) {
    { const m = /[?&]crowdnear=(\d+)/.exec(location.search); if (m) near = +m[1]; } // (to look at the far copies close up: tools/game_shot.js QUERY=?crowdnear=0)
    // a real person's height: the Japanese adult's mean (MHLW National Health and Nutrition Survey 2019: women
    // 1.58 m, men 1.71 m; a city may say otherwise in game.crowd.height) with the far figure's own spread
    const realScale = (rn, look) => {
      const w = lib.npcs[rn].sex === 'f', mean = realHeight ? realHeight[w ? 0 : 1] : w ? 1.58 : 1.71;
      return mean / (lib.npcs[rn].height_m || 1.75) * look.scale / (w ? 0.915 : 0.97);
    };
    // (whether the player is in play: the characters the pick waits on are sent ahead (lib.urge, issue 261) only then. Behind
    // the title or the loader nobody walks among them, and sent sooner there they only filled the title's memory, a beat
    // with a budget of its own; inPlay: the game's, read each frame, and a page without one urges always)
    const urging = () => { if (!inPlay) return true; try { return !!inPlay(); } catch (e) { return false; } };
    const cast = (real || []).filter(n => lib.npcs && lib.npcs[n]);
    const bySex = { f: cast.filter(n => lib.npcs[n].sex === 'f'), m: cast.filter(n => lib.npcs[n].sex === 'm') };
    // a loaded cast member of rn's sex, to stand in until rn itself comes (begin, above)
    // (any of those loaded, by the walker's own number: the first loaded for everyone was a crossing of one man)
    // (the same pick as from the list of those loaded, without the list: an empty one is an array of another kind, and the
    // renderer's begin, which asks this of each near walker still waiting for its own, was thrown out of its optimised
    // code each time it met one: tools/deopt_survey.js, issue 220)
    const realStandIn = (rn, i) => {
      const S = bySex[lib.npcs[rn].sex];
      let n = 0; for (let k = 0; k < S.length; k++) if (lib.tpl[S[k]]) n++;
      if (!n) return null;
      let at = (Math.imul(i + 3, 2246822519) >>> 17) % n;
      for (let k = 0; k < S.length; k++) if (lib.tpl[S[k]] && at-- === 0) return S[k];
      return null;
    };
    // load a few of the cast up front so the first near people are real, nearest the camera first as they stream
    // (and then the rest of it, a dozen at most: a walker whose character has not come is someone else's double until it does)
    if (cast.length) { bySex.f.slice(0, 2).concat(bySex.m.slice(0, 2)).forEach(n => lib.require(n)); cast.forEach(n => lib.require(n)); }
    const realOf = (() => {
      if (!cast.length) return () => null;
      return (i, look) => {
        const w = lib.info.characters[look.character] && lib.info.characters[look.character].pack === 'W';
        const list = bySex[w ? 'f' : 'm'].length ? bySex[w ? 'f' : 'm'] : cast;
        // (mixed down to its low bits: the multiplier alone leaves h % 6 the walker's own number % 6, and a group that
        // set out together, every sixth of the line, was eight of the one man in the one waistcoat)
        let h = Math.imul(i + 1, 2654435761) >>> 0;
        h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
        return list[(h >>> 0) % list.length];
      };
    })();
    // the far copy a walker is drawn as (lib.far): the same cast member it becomes when near, so the step from one to
    // the other changes the detail, not the person (issue 475); none (no cast, or no copy built): the far crowd's doll
    const farOf = (i, look) => { const rn = realOf(i, look); return rn && lib.far && lib.far[rn] ? rn : null; };
    const groups = {}, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const UP = new THREE.Vector3(0, 1, 0), at = new THREE.Vector3(), frustum = new THREE.Frustum(), vp = new THREE.Matrix4(), ball = new THREE.Sphere(at, 30), camAt = new THREE.Vector3(1e9, 0, 0);
    let culling = false;
    // past COARSE_M (by the lens, as near is counted below) a cast member's walker is drawn as its coarser copy: a walker 60 m
    // off is about 35 px tall on a phone, and its copy's 1,000 to 1,400 triangles were one for every three pixels (issue 61);
    // the step has 4 m of slack either way, so a walker at the edge does not change back and forth
    // (coarseM: a phone's is nearer, game.js; farM: past it, by the lens, a walker is not drawn at all, a phone's 260 m, where
    // one is some ten pixels tall at the governor's scale)
    let COARSE_M = coarseM;
    { const m = /[?&]coarsem=(\d+)/.exec(location.search); if (m) COARSE_M = +m[1]; } // (to look at the coarser copies close up: QUERY=?crowdnear=0&coarsem=0)
    let lodX = 0, lodY = 0, lodZoom = 1;
    const SWAP = ['iSkin', 'iHair', 'iTop', 'iLegs', 'iPat', 'aAnim', 'iUmb', 'iDress', 'iDye'], tmpDress = new THREE.Vector3(), tmpDye = new THREE.Vector2();
    // (a cast member's walkers have a slot in each of its two meshes, the copy and the coarser copy: p.sl, by the mesh's
    // userData.k; p.mesh and p.slot are the one they are drawn in)
    function swap(mesh, a, b) {
      const who = mesh.userData.who, pa = who[a], pb = who[b], k = mesh.userData.k;
      who[a] = pb; who[b] = pa;
      if (k === undefined) { pa.slot = b; pb.slot = a; } else {
        pa.sl[k] = b; pb.sl[k] = a;
        if (pa.mesh === mesh) pa.slot = b;
        if (pb.mesh === mesh) pb.slot = a;
      }
      const M = mesh.instanceMatrix.array;
      for (let k = 0; k < 16; k++) { const t = M[a * 16 + k]; M[a * 16 + k] = M[b * 16 + k]; M[b * 16 + k] = t; }
      for (const name of SWAP) {
        const A = mesh.geometry.attributes[name];
        if (!A) continue; // (a cast member's copy has its own picture, not the dolls' colours)
        const n = A.itemSize, D = A.array;
        for (let k = 0; k < n; k++) { const t = D[a * n + k]; D[a * n + k] = D[b * n + k]; D[b * n + k] = t; }
      }
      mesh.userData.swapped = true;
    }
    // into the drawn range, or out of it
    function show(p) { const m = p.mesh; if (p.slot >= m.count) { if (p.slot !== m.count) swap(m, p.slot, m.count); m.count++; } }
    function unshow(p) { const m = p.mesh; if (p.slot < m.count) { if (p.slot !== m.count - 1) swap(m, p.slot, m.count - 1); m.count--; } }
    const worn = {}; // (the last of DRESS each cast member was dealt)
    P.forEach((p, i) => {
      p.look = randomLook(lib, pickCharacter(lib, style), style);
      // (three in ten wait otherwise when they stand: half look about them, half shift their weight. A kerb's crowd all in Idle
      // and square to the road read as a parade, issue 75. Not the cast's Phone clip, as it was until November 2026: a pose
      // with a prop, made on one body, read as an odd gesture on the others, the forearm in a jacket and a box at the chest;
      // a crowd waits in what holds on every body. Chosen by its place, not by rnd: the looks dealt after it as they were)
      let ph = Math.imul(i + 1, 2654435761) >>> 0; ph = Math.imul(ph ^ (ph >>> 15), 2246822519) >>> 0;
      const pw = ((ph ^ (ph >>> 13)) >>> 0) % 100;
      if (pw < 30) p.look.clip = pw < 15 ? 'LookAround' : 'Idle_Neutral';
      const gs = lib.info.ground_speed[lib.info.characters[p.look.character].pack].Walk;
      p.speed = gs * p.look.scale * (0.95 + rnd() * 0.25);
      // (the clothes they wear, far and near: DRESS. Dealt round each cast member's walkers in turn, from a start of
      // its own, so that two of one person in the one change of clothes are as rare as the cast allows: drawn at
      // random, a kerb of forty had the same man in the same clothes three times over, issue 64)
      const rn = realOf(i, p.look);
      if (rn) { worn[rn] = (worn[rn] === undefined ? dressOf(rn.length * 31 + rn.charCodeAt(rn.length - 1)) : worn[rn] + 1) % DRESS.length; p.dress = worn[rn]; } else p.dress = dressOf(i);
      p.far = farOf(i, p.look);
      p.fscale = p.far ? realScale(p.far, p.look) : p.look.scale; // (the near walker's own height)
      const ex = p.far ? lib.far[p.far].extras : lib.lod[p.look.character].extras, key = p.far ? '@' + p.far : p.look.character;
      p.thigh = (ex.hip[0] - ex.knee[0]) * p.fscale; // how far the body drops when sitting
      // (how tall they stand, and how high their canopy's rim is when it is up: a head at a rim, lean and actors.js umbRoom)
      p.crown = (ex.height_m || ex.shoulder[0] + 0.37) * p.fscale; p.umbRim = (ex.shoulder[0] + 0.16 + UMB_TOP[1] - UMB_TIP) * p.fscale;
      (groups[key] = groups[key] || []).push(p);
    });
    const meshes = [];
    for (const [name, ps] of Object.entries(groups)) {
      const cast = name[0] === '@', L = cast ? lib.far[name.slice(1)] : lib.lod[name], n = ps.length;
      const { mat, depth } = cast ? castMaterial(L, U) : crowdMaterial(L.extras, U, L);
      litMaterial(mat);
      // a cast member's walkers are drawn as its copy, and past COARSE_M as its coarser copy (L.coarse): a second mesh with
      // the same material, so the same program, and its own slots (issue 61)
      const made = [L.geometry].concat(cast && L.coarse ? [L.coarse] : []).map((src, lod) => {
        const geo = src.clone();
        for (const a of cast ? ['aAnim'] : ['iSkin', 'iHair', 'iTop', 'iLegs', 'aAnim']) geo.setAttribute(a, new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
        if (!cast) geo.setAttribute('iPat', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
        if (cast) { geo.setAttribute('iDress', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('iDye', new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2)); }
        geo.setAttribute('iUmb', new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
        const mesh = noCover(new THREE.InstancedMesh(geo, mat, n));
        mesh.customDepthMaterial = depth;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        geo.attributes.aAnim.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.userData.who = ps.slice(); // the walker in each slot
        mesh.userData.slots = n;
        if (cast) mesh.userData.k = lod;
        mesh.count = 0;                 // (none drawn until placed)
        ps.forEach((p, k) => {
          if (cast) { dressVec(p.dress, tmpDress, tmpDye); geo.attributes.iDress.setXYZ(k, tmpDress.x, tmpDress.y, tmpDress.z); geo.attributes.iDye.setXY(k, tmpDye.x, tmpDye.y); return; }
          geo.attributes.iPat.setX(k, PAT[p.look.pattern] || 0);
          for (const [a, key] of [['iSkin', 'skin'], ['iHair', 'hair'], ['iTop', 'top'], ['iLegs', 'legs']]) { const c = lin(p.look[key]); geo.attributes[a].setXYZ(k, c.r, c.g, c.b); }
        });
        mesh.userData.noRefl = true; // (out of the sea's reflection: water.js)
        mesh.onAfterRender = () => { mesh.userData.drawn = true; };
        world.add(mesh);
        meshes.push(mesh);
        return mesh;
      });
      ps.forEach((p, k) => {
        p.mesh = made[0]; p.slot = k;
        if (cast) { p.ms = made; p.sl = made.map(() => k); p.lod = 0; }
      });
    }
    // umbrellas for the rain: each person's own colour (Tokyo carries clear vinyl), and whether they
    // put one up in a drizzle (some don't bother) or only when it really rains
    const UMB = (styleOf(style) || STYLE || {}).umbrellas || ['#1d1f26', '#1d1f26', '#1d1f26', '#22304a', '#22304a', '#2b4a6b', '#3a3f47', '#5b626c', '#7b8794'];
    let us = 977; // (its own random run, so the crowd's looks and pace stay as they were without it)
    const urnd = () => ((us = (us * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (const p of P) { p.umbK = urnd(); p.look.umbrella = UMB[Math.floor(urnd() * UMB.length)]; }
    // The far copies' umbrellas (issue 165): held, as the near people's are. An umbrella's place is its hand's: each
    // copy's own hand, where its arm's two turns put it (umbArm: the same fist the near people's hold has), is where
    // the handle is, and the shaft leans from there to over the
    // copy's own head (umbrellaHold), so the canopy is where the near person's is and the step from one to the other
    // moves nothing. Until then every umbrella was laid out once from the whole crowd's mean shoulder and drawn with
    // each body's matrix: over a body of another build the shaft came down through a shoulder or a chest, and no hand
    // was at the handle. One canopy and one shaft, about the canopy's middle; a copy's own place for them (holdOf.m)
    // goes into the instance's matrix, which costs no draw and no texture
    const umbGeo = canopyGeo(), shaftGeo = new THREE.CylinderGeometry(0.01, 0.01, UMB_LEN + UMB_END, 5).translate(0, -(UMB_LEN + UMB_END) / 2, 0);
    const farHold = {};
    const holdOf = p => {
      const key = p.far ? '@' + p.far : p.look.character;
      if (farHold[key]) return farHold[key];
      const Lc = p.far ? lib.far[p.far] : lib.lod[p.look.character], ex = Lc.extras, sh = ex.shoulder, arm = umbArm(Lc), hd = arm.hd, H = umbrellaHold(hd, arm.fist);
      return (farHold[key] = { grip: H.grip, top: H.top, dir: H.dir, hd, restY: arm.rest.y, hip: ex.hip, sh, m: new THREE.Matrix4().compose(H.top, H.q, V3(1, 1, 1)) });
    };
    // (a far umbrella's matrix, um: the body's, the copy's own hold, and its lean about the fist; an umbrella part of
    // the way up has its canopy scaled about its tip along the shaft, umbOpening: opened)
    const om = new THREE.Matrix4(), om2 = new THREE.Matrix4(), um = new THREE.Matrix4(), ug = new THREE.Vector3(), ux = new THREE.Vector3();
    // (a copy that stands turns a little one way and the other and shifts its weight, CROWD_POSE's standing: the hand
    // goes with the body, so the umbrella in it does, by the same turn and lean as the shader gives the hand)
    const sw = new THREE.Matrix4(), sw2 = new THREE.Matrix4();
    const sway = (p, C) => {
      if (!p.umbStand) return null;
      const fr = p.animO * 0.159 - Math.floor(p.animO * 0.159), t = U.uTime.value * (0.5 + 0.12 * fr) + p.animO;
      // (the shader turns each vertex by where it is in the copy as it was made, and the hand was made hanging by the hip)
      const x = Math.max(0, Math.min(1, (C.restY - (C.hip[0] - 0.05)) / (C.sh[0] - (C.hip[0] - 0.05)))), kf = x * x * (3 - 2 * x);
      const yaw = (0.1 * Math.sin(t * 0.7) + 0.05 * Math.sin(t * 1.9 + 1.3)) * kf, roll = 0.02 * Math.sin(t * 0.43 + 0.4);
      sw.makeRotationZ(roll).multiply(sw2.makeTranslation(0, 0, C.hip[1])).multiply(sw2.makeRotationY(yaw)).multiply(sw2.makeTranslation(0, 0, -C.hip[1]));
      return sw;
    };
    const farUmb = (p, body) => {
      const C = holdOf(p), lx = p.umbLx || 0, ly = p.umbLy || 0, a = Math.hypot(lx, ly), S = sway(p, C);
      um.copy(body);
      if (S) um.multiply(S);
      um.multiply(C.m);
      if (a > 1e-3) {
        ug.copy(C.grip); if (S) ug.applyMatrix4(S); ug.applyMatrix4(body);
        om.makeRotationAxis(ux.set(-ly / a, 0, -lx / a), a);
        ux.copy(ug).applyMatrix4(om);
        om.setPosition(ug.x - ux.x, ug.y - ux.y, ug.z - ux.z);
        um.premultiply(om);
      }
      return um;
    };
    const opened = k => { const o = umbOpening(k); return om2.makeScale(o.r, o.a, o.r).setPosition(0, UMB_TIP * (1 - o.a), 0).premultiply(um); };
    // Canopies give way to each other (issue 165): the crowd's steering keeps two people under umbrellas an umbrella's
    // room apart (actors.js umbRoom, from p.umbR here), and where they are pressed closer all the same, or someone
    // taller stands with their head at a canopy's rim, each umbrella leans away from what it would touch, at the wrist,
    // up to LEAN_MAX (eight degrees: at fourteen the canopy's far side came down on its holder's own hair): the rim on that side rises and the canopy's middle moves off, as people do it. From who stood
    // where a frame ago (umbGrid, in cells), eased over a third of a second, in the world's plan (p.umbLx, p.umbLy,
    // radians); not worked past LEAN_M from the lens
    const LEAN_MAX = 0.14, LEAN_K = 1.0, LEAN_M = 40, UCELL = 1.3, LEAN_HEAD = 0.05;
    let umbGrid = new Map(), umbNext = new Map();
    const ucell = (cx, cy) => (cx * 73856093) ^ (cy * 19349663);
    function lean(p) {
      const cx = Math.floor(p.rx / UCELL), cy = Math.floor(p.ry / UCELL), key = ucell(cx, cy);
      let cell = umbNext.get(key);
      if (!cell) umbNext.set(key, cell = []);
      cell.push(p);
      let vx = 0, vy = 0;
      const R = p.umbR || 0;
      // (where its canopy's middle is from the body, in the plan: over the copy's own hold, turned as it faces. The lean
      // and the crowd's steering, actors.js umbRoom, keep an umbrella's room between canopies, not between bodies)
      const C = holdOf(p), th = Math.PI - p.h, c = Math.cos(th), sn = Math.sin(th);
      { const bx = C.top.x * p.fscale, bz = C.top.z * p.fscale; p.ucx = bx * c + bz * sn; p.ucy = bx * sn - bz * c; }
      const mx = p.rx + p.ucx, my = p.ry + p.ucy;
      if (R > 0 && Math.hypot(p.rx - lodX, p.ry - lodY) < LEAN_M * lodZoom) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const c = umbGrid.get(ucell(cx + a, cy + b));
        if (c) for (const o of c) {
          if (o === p || Math.abs((o.rz || 0) - (p.rz || 0)) > 1.5) continue;
          const ou = o.umbR > 0, dx = mx - o.rx - (ou ? o.ucx : 0), dy = my - o.ry - (ou ? o.ucy : 0), D = Math.hypot(dx, dy), reach = ou ? R + o.umbR : o.crown > p.umbRim - 0.03 ? R + 0.12 : 0;
          if (D > 1e-3 && D < reach) { const w = (reach - D) / reach / D; vx += dx * w; vy += dy * w; }
        }
      }
      const m = Math.hypot(vx, vy) * LEAN_K, s = m > LEAN_MAX ? LEAN_MAX / m : 1, k = 1 - Math.exp(-dtNow / 0.35);
      let tx = vx * LEAN_K * s, ty = vy * LEAN_K * s;
      // (never into its own head: the shaft stands a hand's width from it, so of a lean towards the head, from the
      // fist, only LEAN_HEAD is taken)
      { const hx = C.hd.x - C.grip.x, hz = C.hd.z - C.grip.z, hl = Math.hypot(hx, hz) || 1, wx = (hx * c + hz * sn) / hl, wy = (hx * sn - hz * c) / hl, t = tx * wx + ty * wy; if (t > LEAN_HEAD) { tx -= (t - LEAN_HEAD) * wx; ty -= (t - LEAN_HEAD) * wy; } }
      p.umbLx = (p.umbLx || 0) + (tx - (p.umbLx || 0)) * k;
      p.umbLy = (p.umbLy || 0) + (ty - (p.umbLy || 0)) * k;
    }
    const umbMeshes = {}, umbN = { true: 0, false: 0, shaft: 0 };
    const umbCol = P.map(p => lin(p.look.umbrella === 'clear' ? '#1d1f26' : p.look.umbrella));
    const umbMesh = clear => umbMeshes[clear] || (umbMeshes[clear] = (() => {
      const shaft = clear === 'shaft';
      const m = new THREE.InstancedMesh(shaft ? shaftGeo : umbGeo, shaft ? stdMat('#2a2a2e') : clear ? stdMat('clear') : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, side: THREE.DoubleSide }), P.length);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // (packed, as the crowd is: the umbrellas held this frame are the first `count` slots, each with its holder's
      // colour; nothing is drawn for those not held, and only the slots taken go to the GPU: issue 375)
      if (!clear) { m.setColorAt(0, umbCol[0]); m.instanceColor.setUsage(THREE.DynamicDrawUsage); }
      m.count = 0;
      m.castShadow = clear !== true; m.frustumCulled = false; m.visible = false; m.userData.noRefl = true; noCover(m);
      world.add(m);
      return m;
    })());
    const UMB_KEYS = [true, false, 'shaft'];
    let rain = 0, umbOn = false, umbFrac = 0, umbSnap = 0, soaked = 0;
    // (the umbrellas' instanced meshes made now and their programs compiled as soon as the game gives a warm-up, not made
    // at the first rain: the story's evening rains at its title, and the title's frame linked the canopies' program in a
    // draw, a wait of seconds on the desktop tier in the tap, issue 31. Nobody puts one up before)
    let umbWarm = !UMBRELLAS;
    if (UMBRELLAS) {
      for (const c of UMB_KEYS) umbMesh(c);
      (lib.warmLater && !lib.warm ? lib.warmed : Promise.resolve(lib.warm)).then(w => (w ? Promise.all(UMB_KEYS.map(c => w(umbMeshes[c]))) : null))
        .catch(() => {}).then(() => { umbWarm = true; const r = rain; rain = -1; setRain(r, soaked); });
    }
    // (of those who walk together the two beside the one who leads share that one's umbrella, as friends do: two
    // canopies do not fit over two people shoulder to shoulder; a fourth, who stands or walks a canopy's width from the
    // leader in the group's rows, actors.js mateSpot, carries their own: issue 165)
    const wantUmb = p => UMBRELLAS && rain > 0.06 && p.mode !== 'sit' && p.umbK < umbFrac && !(p.lead >= 0 && (p.gk === 1 || p.gk === 2));
    // how far up this person's umbrella is (p.umbT, 0..1): each goes up over UMB_OPEN_S once they want it, and down a
    // little faster; one not drawn a moment ago, or a rain that came in at once (umbSnap), as it is by now
    function umbStep(p) {
      const want = umbOn && wantUmb(p) ? 1 : 0;
      p.umbW = want ? UMB_R * p.fscale : 0; // (the canopy this one will hold up, m: actors.js gives them its room at a kerb, slotFree)
      if (p.umbAt == null || tNow - p.umbAt > 0.3 || umbSnap) p.umbT = want;
      else if (p.umbT !== want) p.umbT = want ? Math.min(1, p.umbT + dtNow / UMB_OPEN_S) : Math.max(0, p.umbT - dtNow / (0.8 * UMB_OPEN_S));
      p.umbAt = tNow;
      p.umbR = p.umbT > 0 ? UMB_R * p.fscale * (p.umbT < 1 ? umbOpening(p.umbT).r : 1) : 0; // (the room its canopy takes, m: actors.js umbRoom, and lean)
      return p.umbT;
    }
    const free = {}, active = new Map();
    let dtNow = 0, tNow = 0, frameNo = 0, ended = false, m0 = null;
    const NO_WARM = /[?&]crowdwarm=0\b/.test(location.search); // (as before the warm: drawn as soon as made, to set beside, tools/crowd_colour.js)
    const api = { nearCap: null, dropPool: () => { for (const k in free) free[k].length = 0; } }; // (dropPool: a harness's, the next near people made new, tools/crowd_colour.js)
    let lastBegin = null, stillMade = -1; // (stillMade: how many people made in this still frame, still(); -1 in play)
    const lastPick = { nNear: 0, culling: false, zoom: 1, want: 0, unloaded: 0, capped: 0, big: 0 }, pickI = [], pickD = new Float64Array(P.length), pickKeep = new Set(), byPick = (a, b) => pickD[a] - pickD[b];
    let umbAny = false, umbUp = 0, easeK = 1;
    // (the cast let go from the GPU once none of a character's bodies has been in the picture for IDLE_S, lib.letGo: asked
    // once a second of the wall's clock, the world's may be held; a still's frame lets nothing go)
    const IDLE_S = 20, lastShown = Object.create(null);
    let idleAt = 0;
    function idle() {
      const now = performance.now() / 1000;
      if (now - idleAt < 1 || !lib.letGo) return;
      idleAt = now;
      for (const n of cast) {
        if (!lib.tpl[n]) { delete lastShown[n]; continue; }
        if (lastShown[n] == null || lib.shown(n)) lastShown[n] = now;
        else if (now - lastShown[n] > IDLE_S && lib.letGo(n)) delete lastShown[n];
      }
    }
    function begin(dt, cx, cy, t, nActive, count = 0) {
      lastBegin = [cx, cy, nActive];
      if (!count) idle();
      dtNow = dt; tNow = t; frameNo++; ended = false;
      if (!m0) m0 = new THREE.Matrix4().makeScale(0, 0, 0);
      umbN.true = umbN.false = umbN.shaft = 0;
      if (umbSnap) umbSnap--;
      { const g = umbGrid; umbGrid = umbNext; umbNext = g; for (const c of g.values()) c.length = 0; } // (who stood where, for this frame's leans)
      umbAny = umbUp > 0; umbUp = 0; // (is anyone's umbrella up, by the last frame's count: place() leans nobody under a dry sky)
      easeK = 1 - Math.exp(-dt / 0.08); // (drawn()'s ease, the same for everyone this frame)
      // the camera's frustum as it was last drawn, for this frame's culling; not across a cut (the camera somewhere else)
      culling = false;
      if (camera) {
        culling = camera.position.distanceToSquared(camAt) < 400;
        camAt.copy(camera.position);
        frustum.setFromProjectionMatrix(vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem, camera.reversedDepth);
      }
      // who is a person and who a far figure goes by what the eye resolves: the distance from the camera (not from
      // the player, who stands 6 m in front of it: the far figures were being drawn at the lens while people behind
      // the player were given faces), and those in the view first, since a face behind the camera is seen by no one.
      // On a crowded crossing the few skinned people there are go where they are looked at.
      // Through a long lens (the story's finder at 22 to 40 degrees, a conversation's 35 mm) someone 50 m off is as big in
      // the frame as someone 25 m off is in the chase view: the distance is counted as the lens sees it, and a few more
      // are people (issue 19: in the prints the nearest walkers filled a third of the frame as far figures)
      const zoom = camera && camera.isPerspectiveCamera ? Math.max(1, Math.min(3, 55 / camera.fov)) : 1;
      // And whoever the eye can make out is whole, however many that is (issue 174): a person whose head stands taller on
      // the screen than headPx (30 CSS pixels: a face and fingers read; the far copy's 128 x 192 picture is a blur and its
      // hand a few facets) and is in the view. At the Scramble's kerb thirty and more stand within 6 m, and a fixed count
      // (ten on a phone) left the eleventh on, 3 to 5 m off, a copy. Those over it come first, the biggest and the nearest
      // the frame's middle before those at its edge, up to bigCap (a tier's frame and memory: game.js); the rest of the
      // near count goes by distance as before. One who is whole stays whole down to HOLD of it, and keeps a slot of the
      // near count until outranked by KEEP_M, so that someone at the edge of either does not swap back and forth.
      // A still (count: the world held for a photograph) asks it of everyone in the frame whose head is over headStill,
      // up to stillCap: the frame rate is not at stake there
      const HEAD_K = 0.14, HOLD = 0.85, KEEP_M = 0.6; // (the head's share of the height to the crown)
      const need = count ? headStill : headPx, persp = camera && camera.isPerspectiveCamera, E = persp ? camera.projectionMatrix.elements : null, V = persp ? camera.matrixWorldInverse.elements : null;
      const P5 = persp ? Math.abs(E[5]) : 0, P0 = persp ? Math.abs(E[0]) : 0, Hk = (window.innerHeight || 800) * HEAD_K / 2;
      let nBig = 0;
      // (the pick is kept in lists made once: a pair for each of a few hundred people, a sort of them and a set, made
      // again sixty times a second, were the frame's garbage, issue 130)
      const want = pickI, ex = camera ? camera.position.x : cx, ey = camera ? -camera.position.z : cy;
      want.length = 0;
      lodX = ex; lodY = ey; lodZoom = zoom;
      for (let i = 0; i < nActive; i++) {
        const p = P[i]; if (p.line < 0) continue;
        // (one standing counted a quarter nearer: the eye rests on those stood about, and a far copy standing is a figure
        // with a clip's life in it only from the shader, CROWD_POSE; one walking by is gone in a moment)
        const d = Math.hypot(p.x - ex, p.y - ey) / zoom * (p.moving || p.state === 'sit' ? 1 : 0.75);
        if (d >= nearR) continue;
        const seen = !culling || frustum.intersectsSphere(ball.set(at.set(p.x, p.z + 1, -p.y), 1.5)), was = active.has(i);
        let key = seen ? d : d + nearR;
        if (seen && persp) {
          // (the head's height on the screen, by its depth along the view, not its distance: one at the frame's side stands
          // taller than its distance says; tools/crowd_whole.js measures it the same way)
          const crown = p.crown || 1.6 * ((p.look && p.look.scale) || 1), X = p.x, Y = p.z + crown * (p.mode === 'sit' ? 0.6 : 0.93), Z = -p.y;
          const dep = -(V[2] * X + V[6] * Y + V[10] * Z + V[14]);
          if (dep > 0.3) {
            const head = Hk * crown * P5 / dep;
            if (head >= (was ? need * HOLD : need)) {
              const nx = (V[0] * X + V[4] * Y + V[8] * Z + V[12]) * P0 / dep, ny = (V[1] * X + V[5] * Y + V[9] * Z + V[13]) * P5 / dep;
              key = -head * (1 - 0.4 * Math.min(1, Math.hypot(nx, ny))); nBig++; // (the frame's middle first: at its edge counted 0.6 as big)
            }
          }
        }
        if (key >= 0 && was) key = Math.max(0, key - KEEP_M);
        pickD[i] = key; want.push(i);
      }
      const nNear = Math.min(count ? Math.max(count, Math.min(nBig, stillCap || count)) : Math.max(Math.round(near * Math.min(1.5, zoom)), Math.min(nBig, bigCap || 0)), api.nearCap ?? Infinity); // (nearCap: a harness's, the near drawn as their far copies to set beside, tools/crowd_colour.js)
      ball.radius = 30;
      want.sort(byPick);
      const keep = pickKeep; keep.clear();
      const urgeNow = !!lib.urge && urging();
      for (let k = 0; k < nNear && k < want.length; k++) keep.add(want[k]);
      lastPick.nNear = nNear; lastPick.big = nBig; lastPick.culling = culling; lastPick.zoom = zoom; lastPick.want = want.length; lastPick.unloaded = lastPick.capped = 0; // (for the checks: nearInfo, which lists the nearest when asked)
      for (const [i, r] of active) if (!keep.has(i)) { world.remove(r.root); (free[r.character] = free[r.character] || []).push(r); active.delete(i); }
      for (const i of keep) {
        // (a stand-in gives way to the walker's own character once that has come, not only when they next come near)
        if (active.has(i)) { const r0 = active.get(i); if (!(r0.standFor && lib.tpl[r0.standFor])) continue; world.remove(r0.root); (free[r0.character] = free[r0.character] || []).push(r0); active.delete(i); }
        const p = P[i], rn = realOf(i, p.look);
        let look = rn ? Object.assign({}, p.look, { character: rn, pattern: null, scale: realScale(rn, p.look) }) : p.look, name = look.character;
        // a real near person whose character is still streaming stands in as a loaded cast member of the same sex,
        // not the far crowd's doll: at the hero spawn a dense crowd reads as real at once, and swaps to its own
        // character when it comes (begin() runs again as the player moves)
        // (not one who has a far copy of their own: that copy is drawn until they come, the same person in the same clothes.
        // A stand-in there was someone else's body, and the walker changed clothes twice as the cast streamed in, from the
        // copy to the stand-in and from the stand-in to their own: the owner's report of 27 November 2026, tools/crowd_colour.js)
        if (rn && !lib.tpl[name] && !p.far) { lib.require(name); if (urgeNow && pickD[i] < nearR) lib.urge(name); const si = realStandIn(rn, i); if (si) { look = Object.assign({}, p.look, { character: si, pattern: null, scale: realScale(si, p.look) }); name = si; } }
        if (!lib.tpl[name]) { lib.require(name); if (urgeNow && pickD[i] < nearR) lib.urge(name); lastPick.unloaded++; p.pickWait = frameNo; continue; } // (pickWait: picked, and drawn as their far copy until their character has come; for the checks, tools/crowd_whole.js)
        if (stillMade >= 4 && !(free[name] && free[name].length)) { lastPick.capped++; p.pickWait = frameNo; continue; } // (a still frame makes four at most: the rest come in the frames after)
        if (stillMade >= 0 && !(free[name] && free[name].length)) stillMade++;
        const pooled = free[name] && free[name].pop(), r = pooled || person(lib, Object.assign({}, look));
        r.setLook(Object.assign({ pattern: null, pattern2: null, acc: null, clip: null }, look)); // (clip: a person taken from the pool keeps none of the last one's phone)
        if (rn) r.dress(p.dress);
        r.standFor = rn && name !== rn ? rn : null;
        r.umbOn = false;
        // A person made new has materials of their own (the clothes' copy, rig.dress) with no program yet, and the draw gate
        // (world.js gate) holds a model whole until every part of it has one: the walker was taken out of the far copies in
        // this frame and drawn as nobody for the frames that took, the street behind showing through where they stood, then
        // drawn whole. So they are warmed off the frame first (lib.warm: the programs are the template's, a lookup each, and
        // its pictures are on the GPU already) and stay their far copy, the same person in the same clothes, until it is done
        // (cold: place() draws the copy). A person from the pool has been drawn already
        if (!pooled && lib.warm && !NO_WARM) {
          // (not shown while cold, to anyone who asks of the near people, a harness's lens check too: the model under it warmed)
          r.cold = true; r.root.visible = false;
          const warm = () => { r.cold = false; r.sync = true; r.root.visible = true; for (const x of active.values()) if (x === r) { world.add(r.root); break; } };
          Promise.all(r.root.children.map(c => lib.warm(c))).then(warm, warm);
        }
        if (!r.cold) world.add(r.root);
        r.sync = true; // (taken over from their far copy: place() sets the walk to the copy's stride)
        active.set(i, r);
      }
    }
    // where a walker is drawn: the simulated place, eased over a few hundredths of a second. The simulation moves in
    // steps a frame does not always take (one put back for coming closer than 0.32 m to someone in a press on the
    // crossing, one every 2nd or 4th frame for a walker 60 m and more away: actors.js), and drawn as it is, a walker
    // in a dense column went on, stopped a frame, went on. Put somewhere else (2 m and more at once): drawn there
    function drawn(p) {
      if (p.rx == null || Math.abs(p.x - p.rx) + Math.abs(p.y - p.ry) > 2 || Math.abs(p.z - p.rz) > 1) { p.rx = p.x; p.ry = p.y; p.rz = p.z; return; }
      const k = easeK;
      p.rx += (p.x - p.rx) * k; p.ry += (p.y - p.ry) * k; p.rz += (p.z - p.rz) * k;
    }
    function place(i, p, moving) {
      const r0 = active.get(i), r = r0 && !r0.cold ? r0 : null; // (one still being warmed is drawn as their far copy: begin)
      drawn(p);
      const ut = umbStep(p);
      // (the lean is the umbrellas': with none up anywhere nobody is put in its grid and no hold is turned, which was a
      // twelfth of the crowd's script on a dry evening, issue 130. p.on: drawn this frame, a person or a far copy; the
      // crowd steps those not drawn less often, actors.js update)
      if (p.umbR > 0) umbUp++;
      if (umbAny || p.umbR > 0) lean(p); else if (p.umbLx || p.umbLy) p.umbLx = p.umbLy = 0;
      p.inPic = true;
      if (r) {
        const u = ut > 0;
        if (u !== !!r.umbOn) { r.umbOn = u; r.setLook({ acc: u ? [...(p.look.acc || []), 'umbrella_open'] : p.look.acc || null, clip: u ? null : p.look.clip || null }); } // (the phone put away while the umbrella's hand holds it up)
        if (u && r.umbOpen) r.umbOpen(ut);
        if (u && r.umbLean) { const c = Math.cos(Math.PI - p.h), s = Math.sin(Math.PI - p.h); r.umbLean(p.umbLx * c + p.umbLy * s, p.umbLx * s - p.umbLy * c); } // (the lean, from the world's plan into the body's own space)
        // (held higher while its canopy's rim comes within a head's width of the player's head, where the crowd is centred
        // this step: people passing under umbrellas lift one over the other's head. Up over 0.3 s, down over 0.5. A canopy went
        // 7 cm into the player's head as a crossing walker passed; a step rule against it trapped walkers by the player and a
        // lean of the canopy did not clear it. Issue 157 item 7)
        if (r.umbRaise) { let want = 0; if (u && lastBegin) { const D = Math.hypot(p.rx + (p.ucx || 0) - lastBegin[0], p.ry + (p.ucy || 0) - lastBegin[1]); want = D < (p.umbR || 0) + 0.12 + 0.25 ? 1 : 0; } const k = 1 - Math.exp(-dtNow / (want > (p.umbUpT || 0) ? 0.3 : 0.5)); p.umbUpT = (p.umbUpT || 0) + (want - (p.umbUpT || 0)) * k; r.umbRaise(p.umbUpT); }
        unshow(p);
        p.whole = true; // (drawn as a whole person: actors.js keeps two of them NEAR_BODY apart)
        r.root.visible = true; // (as hide(i, true) left it, a frame ago)
        r.root.position.set(p.rx, p.rz, -p.ry);
        r.root.rotation.y = Math.PI - p.h;
        if (p.wave) { p.wave = false; r.wave(tNow); }
        // (how often its arms are kept out of its body, by how tall it stands on the screen: every frame from 300 pixels up,
        // every second from 150, every third below, where a centimetre is under a pixel; issue 130)
        if (camera && camera.isPerspectiveCamera) { const V = camera.matrixWorldInverse.elements, depth = -(V[2] * p.rx + V[6] * (p.rz + 1) - V[10] * p.ry + V[14]), tall = 1.7 * p.look.scale * (window.innerHeight || 800) * camera.projectionMatrix.elements[5] / 2 / Math.max(0.5, depth); r.clearEvery = tall >= 300 ? 1 : tall >= 150 ? 2 : 3; } // (its depth along the view, not its distance: one at the screen's side stands taller than its distance says)
        const pace = moving ? Math.max(0.2, p.av ?? p.v ?? p.speed) : 0, how = p.mode === 'sit' ? 'sit' : 'ground';
        // (the first frame drawn whole after the far copy: the walk set to the copy's stride, the same foot forward, so the
        // swap is not a hitch in the walk; the copy's angle as its shader had it in the last frame, CROWD_POSE)
        if (r.sync) { r.sync = false; if (moving && p.animF != null && r.walkAt) { r.animate(0, pace, how, tNow); r.walkAt(U.uTime.value * p.animF + p.animO); } }
        r.animate(dtNow, pace, how, tNow);
        return;
      }
      p.wave = false; p.whole = false;
      const sit = p.mode === 'sit';
      at.set(p.rx, p.rz - (sit ? p.thigh : 0), -p.ry);
      // out of sight by more than the longest shadow reaches back into it: not drawn (30 m: a sun 4 degrees up)
      if (culling && (!frustum.intersectsSphere(ball) || (window.OEVis && !OEVis.seenNext(at.x, -at.z, at.y + 2.3, 2.3)))) { unshow(p); p.inPic = false; return; } // (or behind the street wall: visibility.js)
      if (farM < Infinity && Math.hypot(p.rx - lodX, p.ry - lodY) / lodZoom > farM) { unshow(p); p.inPic = false; return; }
      if (p.ms && p.ms.length > 1) {
        const d = Math.hypot(p.rx - lodX, p.ry - lodY) / lodZoom, lod = d > COARSE_M + (p.lod ? -4 : 4) ? 1 : 0;
        if (lod !== p.lod) { unshow(p); p.lod = lod; p.mesh = p.ms[lod]; p.slot = p.sl[lod]; }
      }
      show(p);
      q.setFromAxisAngle(UP, Math.PI - p.h);
      sc.setScalar(p.fscale);
      m4.compose(at, q, sc);
      p.mesh.setMatrixAt(p.slot, m4);
      const held = umbOn && ut > 0, share = held ? (ut < 1 ? umbOpening(ut).arm : 1) : 0;
      if (held) {
        const clear = p.look.umbrella === 'clear', c = umbMesh(clear), k = umbN[clear]++;
        p.umbStand = !sit && !moving;
        farUmb(p, m4);
        c.setMatrixAt(k, ut < 1 ? opened(ut) : um);
        if (!clear) c.setColorAt(k, umbCol[i]);
        p.umbF = frameNo; p.umbC = clear; p.umbI = k; p.umbS = umbN.shaft; // (for hide(), should the game take them out after this)
        umbMesh('shaft').setMatrixAt(umbN.shaft++, um);
      }
      const ua = p.mesh.geometry.attributes.iUmb;
      if (ua.getX(p.slot) !== share) { ua.setX(p.slot, share); ua.needsUpdate = true; }
      // the cadence follows the speed; when it changes, shift the phase so the stride doesn't jump
      const f = moving ? 4.5 * Math.max(0.2, p.av ?? p.v ?? p.speed) / p.look.scale : p.animF ?? 4.5 * p.speed / p.look.scale;
      if (p.animF == null) { p.animF = f; p.animO = p.phase; }
      else if (Math.abs(f - p.animF) > 0.02 * p.animF) { p.animO += (p.animF - f) * tNow; p.animF = f; }
      p.mesh.geometry.attributes.aAnim.setXYZ(p.slot, p.animO, p.animF, sit ? -1 : moving ? 0.42 : -0.25); // (-0.25: standing, CROWD_POSE)
    }
    // not drawn this frame. Called by the crowd's step before the places are sent (end), and after it by the game, once
    // the camera is known (the lens inside someone, a talk's shot cleared, someone near the lens): then what it changes
    // is sent again. Before issue 129 it was not: a far figure hidden after end() was drawn all the same (the GPU had
    // the frame's matrices already) while the figure whose slot it took was not, and an umbrella held by a hidden
    // figure stayed in the air. soft: a whole person kept as they are and only not drawn (someone near the lens is out
    // for as long as they are near: giving their rig back and dressing another every frame is work for nothing)
    function hide(i, soft = false) {
      const p = P[i], m = p.mesh, was = m && p.slot < m.count;
      p.whole = false;
      unshow(p);
      if (was && ended) { resend(m); m.userData.swapped = false; }
      if (p.umbF === frameNo && p.umbI >= 0) { // (its far umbrella, laid this frame: to nothing)
        const c = umbMeshes[p.umbC], sh = umbMeshes.shaft;
        if (c && p.umbI < c.count) { c.setMatrixAt(p.umbI, m0); c.instanceMatrix.needsUpdate = true; }
        if (sh && p.umbS < sh.count) { sh.setMatrixAt(p.umbS, m0); sh.instanceMatrix.needsUpdate = true; }
        p.umbI = -1;
      }
      const r = active.get(i);
      if (!r) return;
      if (soft) { r.root.visible = false; return; }
      world.remove(r.root); (free[r.character] = free[r.character] || []).push(r); active.delete(i);
    }
    const resend = m => { const A = m.geometry.attributes; for (const name of SWAP) { if (!A[name]) continue; if (A[name].clearUpdateRanges) A[name].clearUpdateRanges(); A[name].needsUpdate = true; } m.instanceMatrix.clearUpdateRanges && m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.needsUpdate = true; };
    // what changed, to the GPU: the drawn range of the matrices and the gait, and after a change of places the colours too
    const range = (a, n) => { if (a.clearUpdateRanges) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); } a.needsUpdate = true; };
    function end() {
      ended = true;
      for (const m of meshes) {
        // (a character with nobody drawn this frame costs no draw at all, once its program has been made)
        m.visible = m.count > 0 || !m.userData.drawn;
        const A = m.geometry.attributes, moved = m.userData.swapped;
        m.userData.swapped = false;
        if (moved) { resend(m); continue; }
        if (!m.count) continue;
        range(m.instanceMatrix, m.count); range(A.aAnim, m.count);
      }
      for (const c of UMB_KEYS) {
        const m = umbMeshes[c];
        if (!m || !m.visible) continue;
        m.count = umbN[c];
        if (m.count) { range(m.instanceMatrix, m.count); if (m.instanceColor) range(m.instanceColor, m.count); }
      }
    }
    // the rain, 0..1 (weather.js), and how long it has rained (soak: the street's wetness, 0..1): umbrellas go up as it
    // comes on, a few at the first drops and most once the street is wet, fewer in a drizzle (some don't bother). Until
    // November 2026 a third of the crowd put theirs up in the frame the rain began, and the story's last frame snapped
    // the rain on with nine in ten up at once: a switch, not a shower
    function setRain(r, soak = 1) {
      rain = r; soaked = soak; vinylWet.value = Math.min(1, r * 1.6);
      const sm = (a, b, x) => { x = Math.max(0, Math.min(1, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
      umbFrac = 0.92 * sm(0.06, 0.6, r) * sm(0.05, 1, soak);
      const on = UMBRELLAS && umbWarm && r > 0.06;
      if (on === umbOn) return;
      if (on && soak > 0.85) umbSnap = 2; // (raining a while already: the page opened into it, or the weather set at once)
      umbOn = on;
      for (const c of UMB_KEYS) { const m = umbMesh(c); m.visible = on; if (!on) m.count = 0; }
    }
    // What issue 165's check measures (tools/umbrella_held.js): everyone of the crowd drawn within `within` metres of
    // the lens, each with the head as a ball, and, under an umbrella, the holding hand, the handle, the shaft, the
    // canopy and the trunk, in the world (x, y up, z). A near person's from the bones as posed (rig.umbParts); a far
    // copy's from its own hold and the arm's two turns (holdOf), through the matrices it was drawn with
    function umbrellaReport(within = 25) {
      const out = [], arr = v => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)], bm = new THREE.Matrix4(), v = k => V3(k.x, k.y, k.z);
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.line < 0 && !p.pz) continue;
        if (p.rx == null || !Number.isFinite(p.rx) || !shows(i) || p.mode === 'sit') continue; // (a slot past the crowd's active count keeps its old instance and no place: not drawn as anyone)
        const d = camera ? Math.hypot(p.rx - camera.position.x, p.ry + camera.position.z, p.rz + 1 - camera.position.y) : 0;
        if (d > within) continue;
        const r = active.get(i), row = { i, near: !!r, d: +d.toFixed(2), x: +p.rx.toFixed(2), y: +p.ry.toFixed(2), wait: p.ph === 'wait' || !!p.lst, moving: (p.av ?? p.v ?? 0) > 0.15, up: +(p.umbT || 0).toFixed(2), line: p.line, pz: !!p.pz, lean: +Math.hypot(p.umbLx || 0, p.umbLy || 0).toFixed(3), character: r ? r.character : p.far || p.look.character };
        if (r) {
          const q = r.umbOn && r.umbParts ? r.umbParts() : null;
          if (q) Object.assign(row, { umb: true, held: q.held, hand: arr(q.hand), handle: arr(q.handle), shaft: q.shaft.map(arr), canopy: { c: arr(q.canopy.c), n: arr(q.canopy.n), r: +q.canopy.r.toFixed(3), h: +q.canopy.h.toFixed(3) }, head: { c: arr(q.head.c), r: +q.head.r.toFixed(3), crown: +q.head.crown.toFixed(3) }, torso: { a: arr(q.torso.a), b: arr(q.torso.b), r: +q.torso.r.toFixed(3) } });
          else { const t = r.headTop ? r.headTop(V3(0, 0, 0)) : V3(p.rx, p.rz + p.crown, -p.ry); row.head = { c: arr(t.add(V3(0, -0.12 * p.fscale, 0))), r: +(0.105 * p.fscale).toFixed(3) }; }
        } else {
          const C = holdOf(p), s = p.fscale;
          bm.compose(at.set(p.rx, p.rz, -p.ry), q.setFromAxisAngle(UP, Math.PI - p.h), sc.setScalar(s));
          row.head = { c: arr(V3(0, C.hd.y + 0.09, C.hd.z + 0.01).applyMatrix4(bm)), r: +(0.105 * s).toFixed(3), crown: +(p.rz + p.crown).toFixed(3) };
          if (umbOn && p.umbT > 0 && p.umbF === frameNo && p.umbI >= 0) {
            const o = p.umbT < 1 ? umbOpening(p.umbT) : { r: 1, a: 1 };
            farUmb(p, bm);
            const top = V3(0, 0, 0).applyMatrix4(um), foot = V3(0, -UMB_LEN - UMB_END, 0).applyMatrix4(um), handle = V3(0, -UMB_LEN, 0).applyMatrix4(um), n = V3(0, 1, 0).transformDirection(um);
            Object.assign(row, { umb: true, held: true, hand: arr((() => { const S = sway(p, C), h = v(C.grip); if (S) h.applyMatrix4(S); return h.applyMatrix4(bm); })()), handle: arr(handle), shaft: [arr(foot), arr(top)], canopy: { c: arr(top), n: arr(n), r: +(UMB_R * s * o.r).toFixed(3), h: +(UMB_H * s * o.a).toFixed(3) },
              torso: { a: arr(V3(0, C.hip[0], C.hip[1]).applyMatrix4(bm)), b: arr(V3(0, C.sh[0] + 0.06, C.sh[1]).applyMatrix4(bm)), r: +(0.125 * s).toFixed(3) } });
          }
        }
        out.push(row);
      }
      return out;
    }
    // whether crowd member i is drawn this frame (a near one as a whole person, or in its character's instances)
    const shows = i => (active.has(i) && !active.get(i).cold ? active.get(i).root.visible : !!(P[i] && P[i].mesh && P[i].slot < P[i].mesh.count));
    // where the lens stands and the way it looks, in the crowd's ground plan (x, y, z up; fx, fy): actors.js steers the
    // walkers out of its way, issue 82 (and who still comes near it is not drawn: game.js lensClear). false with no camera
    let lensDir = null;
    function lens(out) {
      if (!camera) return false;
      camera.getWorldDirection(lensDir || (lensDir = new THREE.Vector3()));
      out.x = camera.position.x; out.y = -camera.position.z; out.z = camera.position.y; out.fx = lensDir.x; out.fy = -lensDir.z;
      return true;
    }
    // a walker of a cast member given another of its changes of clothes (regulars.js: the street's own people wear the
    // same clothes every night): its slot in each of its copies, and its near person if it is near. False for a doll
    function redress(i, d) {
      const p = P[i];
      if (!p || !p.ms) return false;
      p.dress = d; dressVec(d, tmpDress, tmpDye);
      for (const m of p.ms) { const k = p.sl[m.userData.k], A = m.geometry.attributes; A.iDress.setXYZ(k, tmpDress.x, tmpDress.y, tmpDress.z); A.iDye.setXY(k, tmpDye.x, tmpDye.y); A.iDress.needsUpdate = A.iDye.needsUpdate = true; }
      const r = active.get(i);
      if (r && r.dress) r.dress(d);
      return true;
    }
    // A still (issue 174): with the world held for a photograph (game.js photo mode) the crowd's step does not run, so who
    // is a whole person stayed as it was when the camera came up, ten on a phone, and everyone past them was a far copy:
    // a blurred face and a hand of a few facets filled a phone's photograph of a kerb. The frame rate does not matter in
    // a still, so here, every frame it is held, the people are chosen again for where the camera is now, stillNear of
    // them (24 on a phone, 40 on a desktop), and placed as they stand, with no time passing. Whoever stands within LENS
    // of the camera is left out of the picture whole, as in play (game.js lensClear). In play nothing changes
    const LENS = 1.1;
    function still() {
      if (!stillNear || !lastBegin || !camera) return;
      camera.updateMatrixWorld(); // (the camera as it is now, for who is in the frame: moved this frame and not yet drawn, its matrices were the last view's)
      stillMade = 0;
      const [cx, cy, n] = lastBegin;
      begin(0, cx, cy, tNow, n, stillNear);
      stillMade = -1;
      for (let i = 0; i < n; i++) {
        const p = P[i];
        if (p.line < 0 && !p.pz) continue;
        place(i, p, p.state !== 'sit' && !!p.moving);
        if (active.has(i) && Math.hypot(p.rx - camera.position.x, p.ry + camera.position.z, p.rz + 1 - camera.position.y) < LENS) hide(i, true);
      }
      end();
    }
    Object.assign(api, { begin, place, hide, shows, end, setRain, meshes, active, umbrellas: umbMeshes, lens, umbrellaReport, still, redress, nearInfo: () => Object.assign({ active: active.size, frame: frameNo, top: pickI.slice(0, lastPick.nNear + 4).map(i => [i, +pickD[i].toFixed(2)]) }, lastPick) });
    return api;
  }

  return { load, person, randomLook, pickCharacter, crowdRenderer, colours, setStyle, setLight, uncovered, exposure, oldCamera, opts: OPT }; // (oldCamera: the camera of 1964, its materials shared by every copy hung on a rig, warmed ahead: game.js)
})();
