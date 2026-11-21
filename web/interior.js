// Rooms behind a landmark's windows (landmarks.json "interior": {"room_m": [w, h, d], "win_m": [w, h]}):
// interior mapping, as web/buildings.js draws the generic buildings' windows and as games draw a city's
// (a ray from the eye through the glass meets the back wall, the floor, the ceiling or a side wall of a
// box room behind it). The glass's texture coordinates are metres across the opening from its left jamb
// and up from its sill; the room is room_m wide (centred on the opening), high (from a floor 0.9 m under
// the sill) and deep. By day the room is dim, lit from the window; after dark it takes the material's
// emissive (its lamps: a floodlit material's glow, which the night turns up), brightest on the ceiling's
// light and falling off to the back. Each room's walls are a shade of their own.
// Shared by every city and by the hero levels' windows (web/game/hero.js win* materials may call apply).
'use strict';
window.OEInterior = (function () {
  // mat: a MeshStandardMaterial whose mesh has uv in metres; spec: landmarks.json "interior"; night: {value} 0..1
  function apply(mat, spec, { night = { value: 0 } } = {}) {
    const [rw, rh, rd] = spec.room_m || [3.6, 3.4, 4.5], [ww, wh] = spec.win_m || [1.5, 2.6];
    mat.defines = Object.assign(mat.defines || {}, { USE_UV: '' });
    const own = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      if (own) own(sh, r);
      Object.assign(sh.uniforms, { uIrRoom: { value: new THREE.Vector3(rw, rh, rd) }, uIrWin: { value: new THREE.Vector2(ww, wh) }, uIrNight: night });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vIrW; varying vec3 vIrN;')
        .replace('#include <project_vertex>', `#include <project_vertex>
  vIrW = (modelMatrix * vec4(transformed, 1.0)).xyz; vIrN = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform vec3 uIrRoom; uniform vec2 uIrWin; uniform float uIrNight; varying vec3 vIrW; varying vec3 vIrN;
float irH(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { vec3 N = normalize(vIrN), V = normalize(vIrW - cameraPosition);
    if (dot(V, N) > 0.0) N = -N; // (glass drawn from either side: the room is on the far side of it)
    vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N) + vec3(1e-5));
    // where the eye's ray enters the room's box, in the room's own units (0..1 across and up, 0..1 deep)
    vec2 p0 = vec2((vUv.x + 0.5 * (uIrRoom.x - uIrWin.x)) / uIrRoom.x, (vUv.y + 0.9) / uIrRoom.y);
    vec3 d = vec3(dot(V, T) / uIrRoom.x, V.y / uIrRoom.y, -dot(V, N) / uIrRoom.z);
    vec3 inv = 1.0 / max(abs(d), vec3(1e-4));
    float tx = (d.x > 0.0 ? 1.0 - p0.x : p0.x) * inv.x, ty = (d.y > 0.0 ? 1.0 - p0.y : p0.y) * inv.y, tz = inv.z;
    float t = min(min(tx, ty), tz);
    vec3 hp = vec3(p0, 0.0) + d * t;
    vec2 id = floor(vIrW.xz / uIrRoom.x * 0.7 + vIrW.y / uIrRoom.y);
    float rr = irH(id);
    vec3 wallC = mix(vec3(0.72, 0.66, 0.56), vec3(0.6, 0.62, 0.6), rr);
    vec3 c;
    if (tz <= t * 1.0001 + 1e-5) {
      c = wallC;
      c *= 1.0 - 0.45 * step(0.4, rr) * step(hp.y, 0.3) * step(0.2, hp.x) * step(hp.x, 0.8); // a cabinet, a desk
      c = mix(c, vec3(0.25, 0.2, 0.16), step(0.75, rr) * step(0.35, hp.y) * step(hp.y, 0.75) * step(0.3, hp.x) * step(hp.x, 0.7)); // a picture
    } else if (ty <= t * 1.0001 + 1e-5) {
      c = d.y > 0.0 ? vec3(0.86, 0.84, 0.8) : mix(vec3(0.38, 0.27, 0.18), vec3(0.42, 0.36, 0.3), rr); // ceiling, floor
    } else c = wallC * 0.82;
    float depth = clamp(hp.z, 0.0, 1.0);
    float spot = d.y > 0.0 && ty <= t * 1.0001 + 1e-5 ? 1.0 + 1.5 * exp(-10.0 * dot(hp.xz - vec2(0.5, 0.45), hp.xz - vec2(0.5, 0.45))) : 1.0;
    vec3 lamp = totalEmissiveRadiance * spot * mix(1.25, 0.55, depth);
    vec3 day = c * 0.09 * (1.0 - uIrNight) * mix(1.0, 0.4, depth);
    // the room fades to its mean where a window is a pixel or two
    float far = smoothstep(0.08, 0.3, max(fwidth(vUv.x), fwidth(vUv.y)));
    totalEmissiveRadiance = mix(c * lamp + day, totalEmissiveRadiance * 0.7 + 0.04 * (1.0 - uIrNight), far); }`);
    };
    const key = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
    mat.customProgramCacheKey = () => `ir|${key ? key() : ''}`;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // An office tower's storeys behind its curtain wall (a hero level's win* skin with "offices" in its game.json hero
  // entry: Scramble Square, cities/shibuya/hero_scramblesq.py; docs/HERO.md "Its floors after dark"). Each storey is a
  // room the eye's ray is traced into, as the city's own windows are (buildings.js), but an open office floor rather
  // than a box a window: the floor and the ceiling run on along the facade, so a ray seen through one pane may end in
  // the next pane. Kept plain and of one family, as the owner asked (November 2026: furniture, screens and chairs read
  // as clutter through the glass, and warm shop floors under cool offices as two buildings): every storey is a floor, a
  // white ceiling with unbroken rows of line luminaires along the glass, and the core's wall at the back, under one
  // neutral cool white; the shops, restaurants, sky lobby and gallery differ only in their height, depth, the tone of
  // their floor and how bright they are. Each storey is lit whole by its use's hours (offices emptying through the
  // evening, docs/NIGHT.md; a shop until closing). No downlights' dots, no blinds' patches: lines and bands alone.
  // The glass in front is the skin's own tile: the spandrel over each slab (no light), the frit thinning up the pane
  // (less of the room through it, and a haze of its light on it), and each pane's mullion, stepping along at each
  // storey as the tile steps them, so that the light stops where the tile draws a joint.
  // Farther off the room settles to its mean, then a zone's light to the share lit, so a far tower keeps its tone and
  // never sparkles.
  // The skin's texture coordinates: u in tiles of `tile` metres along the facade, v the tile's storey coordinate.
  // spec: base (1F's height), shop_top and shop_storey (the shop floors' storeys to there), storey (the offices'),
  // spandrel and frit (shares of a storey, as the tile draws them), tile, rows, pane, shift and mullion (the tile's
  // joints), trans (the glass's share of the room's light), busy (the tower's evening against the city's), and floors:
  // [[from, to, use], ...] by storey index from 1F = 0, use one of office, shop, dining, lobby, gallery, plant.
  const USES = { office: 0, shop: 1, dining: 2, lobby: 3, gallery: 4, plant: 5 };
  function offices(mat, spec, { night = { value: 0 }, hour = { value: 20 } } = {}) {
    const S = Object.assign({ base: 0, shop_top: 0, shop_storey: 4.5, storey: 4.5, spandrel: 0.12, frit: 0.3, tile: 12, rows: 8,
      pane: 1.5, shift: 0.75, mullion: 0.06, trans: 0.55, busy: 1, floors: [] }, spec);
    const f = v => (+v).toFixed(4);
    const useOf = (S.floors || []).map(([a, b, u]) => `fl > ${f(a - 0.5)} && fl < ${f(b + 0.5)} ? ${f(USES[u] != null ? USES[u] : 0)} : `).join('') + '0.0';
    // (the skin's light is its rooms', drawn here: whatever the model carried as its emission is let go)
    if (mat.emissiveMap) { mat.emissiveMap.dispose(); mat.emissiveMap = null; }
    mat.emissive.setRGB(0, 0, 0);
    mat.defines = Object.assign(mat.defines || {}, { USE_UV: '' });
    const DEF = `#define OF_BASE ${f(S.base)}\n#define OF_SHOP_TOP ${f(S.shop_top)}\n#define OF_SHOP_S ${f(S.shop_storey)}\n#define OF_S ${f(S.storey)}
#define OF_SHOP_N ${f(S.shop_top / S.shop_storey)}\n#define OF_SPAN ${f(S.spandrel)}\n#define OF_FRIT ${f(S.frit)}\n#define OF_TILE ${f(S.tile)}
#define OF_ROWS ${f(S.rows)}\n#define OF_PANE ${f(S.pane)}\n#define OF_SHIFT ${f(S.shift)}\n#define OF_MULL ${f(S.mullion)}\n#define OF_TRANS ${f(S.trans)}
#define OF_BUSY ${f(S.busy)}\n`;
    const own = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      if (own) own.call(mat, sh, r);
      sh.uniforms.uOfNight = night; sh.uniforms.uOfHour = hour;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOfW; varying vec3 vOfN;')
        .replace('#include <project_vertex>', `#include <project_vertex>
  vOfW = (modelMatrix * vec4(transformed, 1.0)).xyz; vOfN = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${DEF}${OF_COMMON}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${OF_MAIN.replace('OF_USE_OF', useOf)}`);
    };
    const key = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
    mat.customProgramCacheKey = () => `of|${key ? key() : ''}`;
    mat.needsUpdate = true;
  }

  const OF_COMMON = `
uniform float uOfNight, uOfHour;
varying vec3 vOfW; varying vec3 vOfN;
// a hash of whole numbers, without sin (the same on every GPU)
float ofH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
// the share of a filter w wide round x that falls in [a, b] of each period p: a line too fine for its pixels settles on
// its mean instead of shimmering (buildings.js pulse)
float ofP(float x, float a, float b, float p, float w) {
  float iw = p / max(w, 1e-4), d = clamp((b - a) / p, 0.0, 1.0), t = (x - a) / p, c = floor(t);
  float t0 = t - c - 0.5 / iw, t1 = t - c + 0.5 / iw;
  return ((floor(t1) - floor(t0)) * d + min(fract(t1), d) - min(fract(t0), d)) * iw;
}
float ofFoot(float s) { return s <= OF_SHOP_N ? s * OF_SHOP_S : OF_SHOP_TOP + (s - OF_SHOP_N) * OF_S; }
// the storey's room, kept plain and the same on every storey: an evenly lit floor, a white ceiling with its line luminaires in
// unbroken rows along the glass (rowP apart: the system ceilings of Japanese offices), and the core's wall at the back.
// p: metres along the facade, over the floor, and in from the glass; d: the eye's ray in the same axes; w: the pixel's
// footprint at the glass (m). Returns the light that leaves it toward the eye at the storey's light of 1, and in dayC
// what it gives back of the day's light through the glass
vec3 ofRoom(vec3 p, vec3 d, float Hc, float D, float rowP, vec3 floorC, vec3 wallC, float w, out vec3 dayC) {
  float tC = d.y > 0.0 ? (Hc - p.y) / d.y : 1e4, tF = d.y < 0.0 ? -p.y / d.y : 1e4, tB = (D - p.z) / d.z;
  float t = min(min(tC, tF), tB);
  vec3 q = p + d * t;
  // the footprint where the ray ends, from the pixel's own neighbours: far into the room and at a graze the rows of light
  // close up, and drawn finer than their pixels they broke into dots; filtered over it they settle into an even glow
  // (taken here, where every fragment of the skin comes, not under the branches below)
  float wq = max(fwidth(q.z), w) + 0.004, r0 = 0.5 * rowP;
  float rows = 4.0 * ofP(q.z, r0 - 0.06, r0 + 0.06, rowP, wq);
  float E, e = 0.0;
  vec3 c;
  if (tB <= t) { c = wallC; E = 0.5; }                                                   // the core's wall
  else if (tF <= t) { c = floorC; E = 0.86; }                                           // the floor, evenly lit
  else { c = vec3(0.82); E = 0.3; e = rows; }                                            // the ceiling and its rows of light
  E *= mix(1.0, 0.82, clamp(q.z / D, 0.0, 1.0));
  dayC = c * mix(1.0, 0.35, clamp(q.z / D, 0.0, 1.0));
  return c * E * 2.2 + e;
}
`;

  const OF_MAIN = `
  {
    vec3 oN = normalize(vOfN), oV = normalize(vOfW - cameraPosition);
    vec3 oT = normalize(cross(vec3(0.0, 1.0, 0.0), oN) + vec3(1e-6));
    float ax = vUv.x * OF_TILE, h = vOfW.y - OF_BASE;          // metres along the skin; over 1F
    float sc = h <= OF_SHOP_TOP ? h / OF_SHOP_S : OF_SHOP_N + (h - OF_SHOP_TOP) / OF_S; // the tile's storeys
    float fl = floor(sc), fy = sc - fl, foot = ofFoot(fl), S = ofFoot(fl + 1.0) - foot;
    float wx = max(fwidth(ax), 1e-4), ws = max(fwidth(sc), 1e-4), w = max(wx, ws * S); // the pixel's footprint (m; storeys)
    float use = OF_USE_OF;
    // the storey's use: its room, its brightness and its hours. One light for the whole tower, a neutral cool white
    // (about 4500 K, the city's offices' and the night's blue): the storeys differ in how bright they are and when,
    // never in colour (the owner's ask: one tower, one family of light)
    float hr = uOfHour, Hc = 2.9, D = 15.0, rowP = 3.2, gain = 1.0, open = 0.0;
    vec3 floorC = vec3(0.17, 0.175, 0.19), wallC = vec3(0.46, 0.46, 0.46);
    if (use < 0.5) {        // offices, emptying through the evening (buildings.js occupancy), floor by floor
      float staff = smoothstep(6.5, 8.5, hr) * (1.0 - smoothstep(17.0, 21.0, hr)), late = smoothstep(6.5, 8.5, hr) * (1.0 - smoothstep(19.0, 24.0, hr));
      open = clamp((0.05 + 0.55 * staff + 0.22 * late) * OF_BUSY, 0.0, 0.97);
    } else if (use < 1.5) { // shops, 10:00 to 21:00: higher, deeper in grey stone, and brighter
      Hc = 3.6; D = 11.0; rowP = 2.4; gain = 1.15; floorC = vec3(0.5); wallC = vec3(0.66);
      open = 0.06 + 0.92 * smoothstep(9.5, 10.0, hr) * (1.0 - smoothstep(21.0, 21.4, hr));
    } else if (use < 2.5) { // the restaurants, to 23:00: lower light
      Hc = 3.2; D = 11.0; rowP = 2.4; gain = 0.7; floorC = vec3(0.24); wallC = vec3(0.32);
      open = 0.04 + 0.94 * smoothstep(10.5, 11.0, hr) * (1.0 - smoothstep(23.0, 23.5, hr));
    } else if (use < 3.5) { // the sky lobby, lit to midnight, in pale stone
      Hc = 3.7; D = 16.0; gain = 1.0; floorC = vec3(0.7); wallC = vec3(0.68);
      open = 0.3 + 0.68 * smoothstep(6.5, 7.0, hr) * (1.0 - smoothstep(23.5, 24.0, hr));
    } else if (use < 4.5) { // the gallery under the roof, to 22:30, kept dim for the view out
      Hc = 3.6; D = 10.0; gain = 0.45; floorC = vec3(0.1); wallC = vec3(0.14);
      open = 0.02 + 0.96 * smoothstep(9.5, 10.0, hr) * (1.0 - smoothstep(22.5, 23.0, hr));
    }
    Hc = min(Hc, S * (1.0 - OF_SPAN) - 0.3);
    // the storey lit whole or dark (a lit floor among dark ones, not patches: a zone's edge seen into the room at a slant
    // read as a smudge), each lit storey a little brighter or dimmer than the next; farther off, the share lit
    float far = smoothstep(2.5, 6.0, w);
    float L = mix(step(ofH(vec2(fl, 7.1)), open) * (0.85 + 0.3 * ofH(vec2(fl, 5.1))), open, far) * gain * uOfNight;
    vec3 lampC = vec3(0.88, 0.94, 1.0);
    float top = OF_SPAN + Hc / S;                              // the ceiling's line, in the storey
    float room = ofP(sc, OF_SPAN, top, 1.0, ws), plen = ofP(sc, top, 1.0, 1.0, ws);
    float day = 0.05 * (1.0 - uOfNight);
    // the room: traced near, its mean farther off
    float kMean = smoothstep(0.45, 1.3, w);
    // (traced for every fragment, so that the footprints taken inside are of neighbours traced too; the plant's is dark)
    vec3 mean = 0.62 * L * lampC + 0.25 * day;
    vec3 d = vec3(dot(oV, oT), oV.y, max(-dot(oV, oN), 0.02));
    vec3 p = vec3(ax, clamp((fy - OF_SPAN) * S, 0.002, Hc - 0.002), 0.0);
    vec3 dayC, lit = ofRoom(p, d, Hc, D, rowP, floorC, wallC, w, dayC);
    vec3 see = mix(lit * L * lampC + dayC * day, mean, kMean) * step(use, 4.5);
    // through the glass: its share of the light, less where the frit is printed (and a haze of the room's light on
    // the frit itself), nothing through the spandrel and the mullions; over the ceiling, the plenum's dark
    float frit = mix(pow(1.0 - clamp((fy - OF_SPAN) / OF_FRIT, 0.0, 1.0), 1.6) * 0.45, 0.06, smoothstep(0.15, 0.4, ws));
    float shift = mod(mod(fl, OF_ROWS) * OF_SHIFT, 2.0 * OF_PANE);
    float mull = ofP(ax, shift - 0.5 * OF_MULL, shift + 0.5 * OF_MULL, OF_PANE, wx);
    vec3 glow = see * OF_TRANS * (1.0 - 0.7 * frit) + frit * 0.18 * L * lampC;
    vec3 ofE = (glow * room + 0.012 * L * lampC * plen) * (1.0 - mull);
    totalEmissiveRadiance += ofE;
  }
`;
  return { apply, offices };
})();
