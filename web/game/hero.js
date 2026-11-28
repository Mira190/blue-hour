// A hero level: a small piece of a map (a street, a crossing, a square: some 200-300 m across) modelled
// finely in Blender, drawn over the city's own model there when the player is near it, and gone again
// when they leave, so that the rest of the map and a phone's memory pay nothing for it.
//
// A map names its hero levels in city.json game.hero (copied into game.json by pipeline/game_text.py):
//   "hero": [{"id": "kabukicho", "glb": "hero/kabukicho.glb", "at": [x, y], "r": 140,
//             "hide": ["kbhero_kb_atlas", ...],       // landmark meshes it draws instead, hidden while it is shown
//             "bake": 1.0, "glow": [0.35, 1.6],       // its baked night light's gain; its signs' glow by day and by night
//             "street": 0.4,                          // the share of the city's street lights it takes (its own are baked)
//             "fill": 0.3,                            // the share of the night's fill light round the player it takes (game.js nightFill)
//             "fine": "hero/kabukicho_fine.glb",      // its finest parts (blender/hero_kit.py Geo.fine): see below
//             "fine_m": 70,                           // how near the camera a square of them is drawn (m)
//             "load_m": 60, "show_m": 300, "drop_m": 85,  // fetched within r + load_m (260), shown within show_m (420),
//                                                     // let go past r + drop_m (520): a level only one place uses comes later
//                                                     // and goes sooner (Miyamasu, frame 5's place)
//             "zr": 4}]                               // a level over the street (SKY STAGE): its half-height about its z; the
//                                                     // camera's height off it counts in those distances as well
// The model is built in the city's local frame (blender/build_hero.py: x east, y north, z up, which glTF
// carries as three.js's x, z, -y, as the game draws every local point) and meshopt-compressed.
//
// What its materials mean, by the name they are given in Blender (blender/hero_kit.py):
//   every material   the street lights after dark (world.js streetLit), the sun's shadow, the rain (weather.js
//                    dress) and, on the high tier, a wet street's reflection (mirror.js) for what is ground;
//                    and the light baked into its vertices (_BAKE: rgb the night light the signs and shop fronts
//                    throw on it, a the occlusion of the street's corners), taken with its own colour
//   glow*            a lit sign or a shop front's light box: its emissive drawn by day at glow[0] and after
//                    dark at glow[1], so it blooms at night as a lit sign does in a photograph
//   tube*            neon tubes: as glow, and a tube in a few hundred hums and stutters now and then
//   chase*           the bulbs of an arch or a marquee: as glow, running in a chase along the u of its texture
//   win*             windows: dark glass by day, lit after dark where its emissive map says a room is lit
//   paper*, lamp*    paper with a lamp behind it (a shoji, a lantern): its own colour by day, lit as dusk falls
//   ground*          what you walk or drive on: wet in the rain, and a mirror then on the high tier
//
// What cannot be seen costs nothing (issue 358): the level is cut into squares (one mesh per material and
// square), so that the squares behind the camera are not drawn; and its finest geometry (a railing's rails, a
// window's glazing bars, a bench's slats) is a second model, `fine`, that is fetched only when the camera is
// inside the level, drawn square by square within fine_m of the camera, and never fetched on the low tier (phones).
//
// It is loaded when the camera comes within r + LOAD_M of its centre and let go (its GPU memory freed) past
// r + DROP_M. On the low tier (phones) it goes without its normal and roughness maps, and its other textures
// are halved (on a phone's lean sub-tier, no side over 1024) before they are sent to the GPU (docs/HERO.md).
'use strict';
window.OEHero = (function () {
  const LOAD_M = 260, DROP_M = 520, SHOW_M = 420, FINE_LOAD_M = 30, FINE_M = 70;
  const LEAN_VERTS = { normal: 'unit8', _bake: 'half' };

  // the baked light (_BAKE) and the glow's hum, in every material of a hero model
  const BAKE_V = `attribute vec4 _bake;\nvarying vec4 vHeroBake;\n`;
  const BAKE_F = `varying vec4 vHeroBake;\nuniform float uHeroBake, uHeroNight;\n`;

  function create(Wd, renderer, opts) {
    const THREE = window.THREE, list = Array.isArray(opts.hero) ? opts.hero : opts.hero ? [opts.hero] : [];
    const tier = opts.tier || 'high', base = opts.base || '', U = Wd.U;
    const group = new THREE.Group();
    group.name = 'hero';
    Wd.world.add(group);
    const levels = list.map(h => ({ h, state: 'idle', root: null, mats: [], tubes: [], chases: [], wins: [], hidden: [], fine: 'idle', fineRoot: null, fineMeshes: [], shared: new Set() }));
    // a texture two levels both carry (the shared surfaces, by their picture's name: OEAsphalt031d_1K-JPG_Color, ...) is
    // held once while either is loaded: at frame 5 a phone holds the Scramble's level and Miyamasu's side by side
    // (tools/mem_check.js AT=521.9,-1074.1). A level's own atlas and its drawn sets ("Color", "NormalGL") are its own
    const sharedTex = new Map();
    const texKey = t => (t && t.name && /_1K/.test(t.name) ? `${t.name}|${t.flipY}|${t.wrapS}|${t.wrapT}` : null);
    const MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'];
    function share(L, m) {
      for (const k of MAPS) {
        const t = m[k], key = texKey(t);
        if (!key) continue;
        const s = sharedTex.get(key);
        if (!s) sharedTex.set(key, { tex: t, n: 1 });
        else if (s.tex !== t) { if (!L.shared.has(key)) s.n++; t.dispose(); m[k] = s.tex; }
        L.shared.add(key);
      }
    }
    function release(L) {
      for (const key of L.shared) {
        const s = sharedTex.get(key);
        if (s && --s.n <= 0) { s.tex.dispose(); sharedTex.delete(key); }
      }
      L.shared = new Set();
    }
    const halving = new WeakMap(); // (a picture being made smaller, once whichever level asked first)
    const uBake = { value: 1 }, uStreet = { value: 1 }, uNight = U && U.uNight ? U.uNight : { value: 0 }, uHour = U && U.uHour ? U.uHour : { value: 20 };
    const aniso = Math.min(tier === 'high' ? 8 : tier === 'medium' ? 4 : 2, renderer && renderer.capabilities ? renderer.capabilities.getMaxAnisotropy() : 1);

    // a shop front's light box (glow_shop*) keeps its shop's hours (buildings.js SHOP_HOURS, docs/STORY.md "Tonight"):
    // each box, a piece of the mesh joined by its faces, is given a number of its own from where it stands (a shop's
    // boxes, a few metres apart, share it), so the street's shop fronts go dark one shop at a time at their hours
    const SHOP_V = 'attribute float _shop;\nvarying float vHeroShop;\n';
    function shopIds(o) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      if (!ms.some(m => m && /^glow_shop/i.test(m.name || '')) || o.geometry.attributes._shop) return;
      const g = o.geometry, P = g.attributes.position, n = P.count, idx = g.index ? g.index.array : null;
      const up = new Int32Array(n).map((_, i) => i), find = i => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
      const nt = idx ? idx.length : n;
      for (let t = 0; t < nt; t += 3) { const a = find(idx ? idx[t] : t); for (let j = 1; j < 3; j++) { const b = find(idx ? idx[t + j] : t + j); if (a !== b) up[b] = a; } }
      const sum = new Map();
      for (let i = 0; i < n; i++) { const r = find(i); let c = sum.get(r); if (!c) sum.set(r, c = [0, 0, 0, 0]); c[0] += P.getX(i); c[1] += P.getY(i); c[2] += P.getZ(i); c[3]++; }
      const h = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
      const id = new Map();
      o.updateWorldMatrix(true, false); // (in metres: a meshopt-packed position is in the node's own units)
      const w = new THREE.Vector3();
      for (const [r, c] of sum) { w.set(c[0] / c[3], c[1] / c[3], c[2] / c[3]).applyMatrix4(o.matrixWorld); const x = Math.floor(w.x / 4), z = Math.floor(w.z / 4); id.set(r, Math.min(255, Math.floor(h(x, z) * 256))); }
      const a = new Uint8Array(n); // (a byte a vertex: a phone's memory is near its budget, tools/mem_check.js)
      for (let i = 0; i < n; i++) a[i] = id.get(find(i));
      g.setAttribute('_shop', new THREE.BufferAttribute(a, 1, true));
    }

    // a hero material, patched once: its baked light and occlusion, then the city's street lights
    function patch(m, h) {
      const name = (m.name || '').toLowerCase(), own = m.onBeforeCompile;
      m.vertexColors = false; // (its _BAKE is read here, not as a vertex colour)
      if (m.userData.tint) m.color.setRGB(...m.userData.tint); // (a texture's tint, the building's colour: Blender's extras)
      // glass at street level mirrors the street across the way, not the sky: the environment is the sky alone, so a
      // pane low on a wall showed a bright sky where a photograph shows the shaded fronts opposite, and read as milk.
      // A material's "sky" (hero_kit) is the share of the environment it mirrors
      if (m.userData.sky != null) m.envMapIntensity = m.userData.sky;
      m.onBeforeCompile = (sh, r) => {
        if (own) own.call(m, sh, r);
        sh.uniforms.uHeroBake = uBake; sh.uniforms.uHeroNight = uNight;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${BAKE_V}`)
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vHeroBake = _bake;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${BAKE_F}`)
          // the occlusion of corners and soffits on the light from the sky, never on the sun or the lamps
          .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n  reflectedLight.indirectDiffuse *= mix(1.0, vHeroBake.a, 0.85); reflectedLight.indirectSpecular *= vHeroBake.a;')
          // the signs' and shop fronts' light on it after dark, in its own colour (an irradiance, baked)
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vHeroBake.rgb * uHeroBake * uHeroNight;');
        // on the low tier, the screens' and the plaza's light comes with the street lights' (neon.js pooled: the area lights'
        // stand-in, on the ground and the walls), except in the rooms behind the windows and on the windows themselves
        if (/^(win|room|refl)/.test(name)) sh.oePool = false;
        if (/^glow_shop/.test(name) && window.OEBuildings && OEBuildings.SHOP_HOURS) { // (shut at its shop's hour: shopIds)
          sh.uniforms.uHour = uHour;
          sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${SHOP_V}`)
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vHeroShop = _shop;');
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying float vHeroShop; uniform float uHour;\nfloat h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }\n${OEBuildings.SHOP_HOURS}\n`)
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= mix(0.03, 1.0, shopOpen(vHeroShop, fract(vHeroShop * 37.0 + 0.31), uHour)); // (its shutter down: a night light behind it)');
        }
        // a room (room*: a hall inside a building) is lit by its own lamps by day too, and takes a share of the sky's
        // light through its windows, not all of it as a street does. Its lamps are no brighter at night: the eye is,
        // and the exposure with it, so the baked light's share falls as night comes or the room burns out
        if (/^room/.test(name)) sh.fragmentShader = sh.fragmentShader.replace('uHeroBake * uHeroNight;', 'uHeroBake * mix(0.8, 0.3, uHeroNight);')
          .replace('reflectedLight.indirectDiffuse *= mix(1.0, vHeroBake.a, 0.85);', 'reflectedLight.indirectDiffuse *= 0.45 * mix(1.0, vHeroBake.a, 0.85);');
        // the city's street lights, at the share the level asks (h.street): its own lamps and signs are baked in
        if (Wd.streetLit && !/^(glow|tube|chase|paper|lamp|refl)/.test(name)) {
          Wd.streetLit(sh);
          sh.uniforms.uHeroStreet = uStreet;
          sh.fragmentShader = sh.fragmentShader.replace('uniform float uHeroBake, uHeroNight;', 'uniform float uHeroBake, uHeroNight, uHeroStreet;')
            .replace('* streetLight(', '* uHeroStreet * streetLight(');
        }
      };
      // a face that gives light (a shop's light box, a lit sign, a lit window) is held under the picture's ceiling for a
      // face (world.js faceCap): bright, with its image still in it. Tubes, bulbs and lanterns are lights, and burn
      if (/^(glow|win)/.test(name) && Wd.faceCap) m.onBeforeCompile = Wd.faceCap(m.onBeforeCompile);
      m.customProgramCacheKey = () => `hero|${h.id}|${name}|${own ? 'o' : ''}`;
      if (/^ground/.test(name)) m.userData.paving = true;
      // (a room's floor is laid on the ground the city draws, a few centimetres over it: in front of it, as a landmark's paving is)
      if (/^room_floor/.test(name)) Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      if (/^(glow|tube|chase)/.test(name)) { m.userData.oeDry = true; m.userData.heroGlow = m.emissiveIntensity || 1; }
      // a light's reflection in a polished floor (refl*: the lines of light in SKY's hall): light added over the stone, its
      // picture in the emissive map; it writes no depth and hides nothing, and dims by day as the glow does
      if (/^refl/.test(name)) { Object.assign(m, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }); m.userData.oeDry = true; m.userData.heroGlow = m.emissiveIntensity || 1; }
      if (/^(paper|lamp)/.test(name)) { m.userData.oeDry = true; m.userData.heroDusk = m.emissiveIntensity || 1; m.emissiveIntensity = 0; }
      // Glass that mirrors what is round it (issue 137: SKY STAGE's glass showed nothing of the roof or of the city's lights
      // behind you, which every photograph at dusk has on its lower half). A level with a probe (h.probe) has a picture of
      // the scene taken from one place in it, as a cube, and its glass* takes that as its environment instead of the sky
      // alone. And the reflection is laid over the pane at full strength: the pane is 0.2 opaque, and with ordinary
      // blending its reflection was drawn at a fifth. Premultiplied, the pane's own colour goes in at its opacity and what
      // it mirrors on top, as glass does
      // Not on a phone (the owner's iPhone, 25 November: "the orange fog on the glass"): its cube is 64 a side, and a warm
      // lamp of the roof's, held in so few texels and prefiltered, spread over degrees of it: four percent of that over the
      // whole pane read as an orange fog over the city behind. Real glass at night is near clear face on, and mirrors a lamp
      // as a point. A phone's glass mirrors the scene's own environment, the sky, dark at night, as any glass does without a
      // probe; and no cube is made or taken for its level (six faces and a conversion each time it is shown, issue 192). A
      // desktop's cube is 256 a side and its lamps stay points (tools/views/shibuya-skyroof.json, glass-bench at night)
      if (h.probe && /^glass/.test(name) && tier !== 'low') {
        m.envMap = probeOf(h).texture; m.premultipliedAlpha = true; m.userData.probeGlass = true;
        const prev = m.onBeforeCompile;
        m.onBeforeCompile = (sh, r) => {
          prev.call(m, sh, r);
          sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'vec3 oeSpec = reflectedLight.indirectSpecular;\n#include <opaque_fragment>')
            .replace('#include <premultiplied_alpha_fragment>', '#include <premultiplied_alpha_fragment>\n#ifdef PREMULTIPLIED_ALPHA\n  gl_FragColor.rgb += oeSpec * (1.0 - gl_FragColor.a);\n#endif');
        };
      }
      m.needsUpdate = true;
    }

    // a level's reflection probe (h.probe: {at: [x, y, z], res, res_low}): a cube the size of res (on the low tier
    // res_low) its glass mirrors, taken from `at` with the glass itself left out; when the level is first shown, and again
    // when the night has moved on by a twelfth (a phone's by a quarter), never more than once in three seconds. Six
    // draws of the scene from one place, once in a while: a cube 256 on a side in half floats is 3 MB, a phone's 64 is
    // 0.2 MB. What it cannot show: whoever stands at the glass, which moves (it is taken from over the pad, where nobody
    // stands), and the roof seen from where you are (one place's picture: the far city, which is most of what the glass
    // mirrors at dusk, is where it should be)
    // The glass's map of the cube (its sky-light map, as three.js samples an environment) is made here with the world's
    // own generator (world.js pmrem), whose blur target is let go once a map is made (Wd.envSpare, #162). Left to three.js,
    // the cube went through a generator of the renderer's own, out of reach, whose blur target (768 x 1024 in half floats,
    // 6 MB) stood idle from the roof's first cube in frame 4's lift ride to the last card; and the cube itself (4 MB at 256
    // a side) stood between one taking and the next though nothing reads it there. Now the cube is drawn into only while
    // one is taken and let go once its map is made (three.js makes it again at the next face drawn into it): 10 MB of a
    // desktop's GPU at frame 5's flight (main red, run 529). p.uv: the map the glass wears. No texture of the page's is
    // handed to three.js's own generator (needsPMREMUpdate, a cube as an envMap): tools/pmrem_check.py
    function probeOf(h) {
      if (h._probe) return h._probe.uv;
      const P = h.probe, res = tier === 'low' ? (P.res_low || 64) : (P.res || 256);
      const rt = new THREE.WebGLCubeRenderTarget(res, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
      const cc = new THREE.CubeCamera(0.5, 8000, rt);
      cc.position.set(P.at[0], P.at[2], -P.at[1]);
      // (a map the size the glass's shader is compiled for, black until the first cube is in: probeSky fills it at once)
      const uv = Wd.pmrem.fromCubemap(rt.texture);
      Wd.envSpare(uv);
      rt.dispose();
      h._probe = { rt, cc, uv, night: -1, t: -99, n: 0, k: null, sky: false };
      return uv;
    }
    // the cube's map made again, worn by the level's glass, and the cube let go until the next is taken (probeOf)
    function probeMap(p, glass) {
      const uv = Wd.pmrem.fromCubemap(p.rt.texture); // (a target of its own each time: the generator's blur target is sized by it, the sky's maps share it)
      Wd.envSpare(uv);
      for (const m of glass) m.envMap = uv.texture;
      p.uv.dispose(); p.uv = uv;
      p.rt.dispose();
    }
    // One face a frame (issue 192): the six faces drawn in one frame were six draws of the scene at once, 1713 draws and
    // 4.6 M triangles in the frame the roof's level came into the lift ride on a phone's tier. A face a frame, from the
    // moment a cube is due, the sixth with the mipmaps; the glass's map of it is made again only once the sixth is in
    // (probeMap), so the glass changes from one whole cube to the next, as before. Before a level's first
    // cube is whole its glass mirrors the sky: the cube is first filled with the scene's environment alone (six draws of
    // the sky's box, probeSky), so that no frame shows the glass mirroring an empty or half-taken cube
    function probe(L, night) {
      const p = L.h._probe;
      if (!p) return;
      if (!p.sky) { p.sky = true; probeSky(p, L); }
      if (p.k == null) {
        if (t - p.t < 3 || Math.abs(night - p.night) < (tier === 'low' ? 0.25 : 1 / 12)) return;
        p.t = t; p.night = night; p.k = 0;
      }
      probeFace(L, p, p.k);
      if (++p.k === 6) { p.k = null; p.n++; }
    }
    let skyScene = null;
    function probeSky(p, L) {
      const env = Wd.world.environment;
      if (!env) return;
      if (!skyScene) skyScene = new THREE.Scene();
      skyScene.background = env;
      const cc = p.cc, rt = p.rt, prevT = renderer.getRenderTarget(), prevF = renderer.getActiveCubeFace(), prevM = renderer.getActiveMipmapLevel(), xr = renderer.xr.enabled, mips = rt.texture.generateMipmaps;
      const D = window.__draw, was = D && [D.on, D.dry];
      if (D) { D.on = true; D.dry = false; }
      try {
        if (cc.coordinateSystem !== renderer.coordinateSystem) { cc.coordinateSystem = renderer.coordinateSystem; cc.updateCoordinateSystem(); }
        cc.updateMatrixWorld();
        renderer.xr.enabled = false;
        for (let i = 0; i < 6; i++) { rt.texture.generateMipmaps = i === 5 ? mips : false; renderer.setRenderTarget(rt, i, 0); renderer.render(skyScene, cc.children[i]); }
        renderer.setRenderTarget(prevT, prevF, prevM);
        probeMap(p, L.mats.filter(m => m.userData.probeGlass));
      } finally {
        rt.texture.generateMipmaps = mips;
        renderer.setRenderTarget(prevT, prevF, prevM);
        renderer.xr.enabled = xr;
        if (D) [D.on, D.dry] = was;
      }
    }
    function probeFace(L, p, i) {
      const glass = L.mats.filter(m => m.userData.probeGlass), shadow = renderer.shadowMap.autoUpdate;
      for (const m of glass) { m.userData.probeVis = m.visible; m.visible = false; }
      // Whoever moves is left out of it (people with what they carry, the cars, the guide: people.js uncovered, as the
      // rain's map of what is under cover leaves them out). The cube is one picture kept for the beat: someone caught
      // in it would stand still in the glass while they walked away. And a cube's cameras are not the screen's: three.js
      // gives them a field of view of -90, and a shader that works a width in pixels from the projection (the guide's
      // whiskers) drew sheets hundreds of metres wide at the half float's ceiling over a third of the cube's sky. The
      // sky-light map made of that was garbage, the glass mirrored it, black on a Mac's GPU, and the lens carried it
      // over whoever stood at the glass (issue 203: seen only after a play from the title, where the guide is on the
      // roof before the cube is taken)
      // (?probe=all: the cube with them in it, as it was, to set beside: tools/story_play.js's check of the glass must fail on it)
      const movers = /[?&]probe=all\b/.test(location.search) ? [] : ((window.OEPeople && OEPeople.uncovered) || []).filter(o => o.visible);
      for (const o of movers) o.visible = false;
      renderer.shadowMap.autoUpdate = false;
      // (what CubeCamera.update does for each face, for one face: three.js r18x. And a check's frame that is not drawn,
      // window.__draw, draws the face all the same, as tools/story_play.js has CubeCamera.update draw: a face is kept)
      const cc = p.cc, rt = p.rt, prevT = renderer.getRenderTarget(), prevF = renderer.getActiveCubeFace(), prevM = renderer.getActiveMipmapLevel(), xr = renderer.xr.enabled, mips = rt.texture.generateMipmaps;
      const D = window.__draw, was = D && [D.on, D.dry];
      if (D) { D.on = true; D.dry = false; }
      try {
        if (cc.coordinateSystem !== renderer.coordinateSystem) { cc.coordinateSystem = renderer.coordinateSystem; cc.updateCoordinateSystem(); }
        cc.updateMatrixWorld();
        renderer.xr.enabled = false;
        rt.texture.generateMipmaps = i === 5 ? mips : false;
        renderer.setRenderTarget(rt, i, 0);
        if (renderer.state.buffers.depth.getReversed && renderer.state.buffers.depth.getReversed() && !renderer.autoClear) renderer.clearDepth();
        renderer.render(Wd.world, cc.children[i]);
        if (i === 5) { renderer.setRenderTarget(prevT, prevF, prevM); probeMap(p, glass); }
      } finally {
        rt.texture.generateMipmaps = mips;
        renderer.setRenderTarget(prevT, prevF, prevM);
        renderer.xr.enabled = xr;
        if (D) [D.on, D.dry] = was;
        renderer.shadowMap.autoUpdate = shadow;
        for (const o of movers) o.visible = true;
        for (const m of glass) m.visible = m.userData.probeVis;
      }
    }
    // (for the harnesses, tools/story_play.js: each cube as the GPU holds it, read back, which waits for the GPU. `lit`,
    // the share of its texels that are not black; `over`, the share at 128 or more, which no texel of a right cube
    // reaches (the roof's at night: none); `bad`, those that are no number)
    function probes() {
      const out = [];
      for (const L of levels) {
        const p = L.h._probe;
        if (!p || !p.n) continue;
        // (the cube's six faces as its map holds them, the cube being let go between takings (probeOf): the map's first
        // level is the six faces as they were drawn, three across and two up, before any blur)
        const res = p.rt.width, buf = new Uint16Array(res * res * 4 * 6), prevT = renderer.getRenderTarget();
        let lit = 0, over = 0, bad = 0;
        try {
          renderer.readRenderTargetPixels(p.uv, 0, 0, 3 * res, 2 * res, buf);
          for (let i = 0; i < buf.length; i += 4) {
            let hi = 0;
            for (let c = 0; c < 3; c++) { const e = buf[i + c] & 0x7c00; if (e === 0x7c00) { hi = 99; break; } if (e >= 0x5800) hi = Math.max(hi, 2); else if (buf[i + c] & 0x7fff) hi = Math.max(hi, 1); }
            if (hi === 99) bad++; else if (hi === 2) over++; if (hi) lit++;
          }
        } finally { renderer.setRenderTarget(prevT); }
        const n = res * res * 6;
        out.push({ id: L.h.id, res, taken: p.n, lit: lit / n, over: over / n, bad: bad / n });
      }
      return out;
    }
    // (and its glass drawn or not, for a harness that sets the picture with it beside the picture without)
    function glass(on) { let n = 0; for (const L of levels) for (const m of L.mats) if (m.userData.probeGlass) { m.visible = !!on; n++; } return n; }

    // a texture made smaller on the low tier before it reaches the GPU: halved, or on a phone's lean sub-tier no
    // side over 1024. Resized by createImageBitmap where it can (no full-size canvas copy, which is tens of MB of
    // passing CPU memory on a phone), else through a canvas that is shrunk to nothing once it is uploaded.
    const lean = () => { try { const q = window.OEQuality && OEQuality.city && OEQuality.city(); return !!(q && q.lean); } catch (e) { return false; } };
    // (lowK: a level's own share on the low tier, game.json hero[].low_k: a small level whose pictures are text and a
    // facade's tile, read at a phone's few pixels, takes a quarter: SKY's hall and Scramble Square's skin at frame 5)
    async function shrink(tex, done, lowK = 0.5) {
      const img = tex && tex.image;
      if (!img || !img.width || img.width <= 256 || tex.userData.heroHalved) return;
      if (done.has(img)) { const o = await done.get(img); if (o) { tex.image = o; tex.userData.heroHalved = true; tex.needsUpdate = true; } return; }
      let fin; done.set(img, new Promise(r => { fin = r; }));
      const k = Math.min(lowK, lean() ? Math.min(0.5, 1024 / Math.max(img.width, img.height)) : 0.5);
      const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
      let out = null;
      if (window.createImageBitmap) {
        try { out = await createImageBitmap(img, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium', imageOrientation: tex.flipY ? 'flipY' : 'from-image' }); } catch (e) { out = null; }
        if (out && tex.flipY) tex.flipY = false; // (flipped as it was made: an ImageBitmap ignores UNPACK_FLIP_Y)
      }
      if (!out) try {
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        tex.onUpdate = () => { cv.width = cv.height = 1; tex.onUpdate = null; };
        out = cv;
      } catch (e) { console.warn('hero texture:', e); }
      fin(out);
      if (!out) return;
      if (img.close) img.close();
      tex.image = out; tex.userData.heroHalved = true; tex.needsUpdate = true;
    }

    function load(L) {
      L.state = 'loading';
      const t0 = performance.now();
      const loader = new THREE.GLTFLoader();
      loader.oeTex = false; // (a phone's pictures in ASTC blocks, tex.js: packed below, once they have been made smaller)
      loader.load(base + L.h.glb, g => {
        if (L.state !== 'loading') { dispose(g.scene); return; } // (let go while it came)
        const root = g.scene, seen = new Set(), shrunk = [];
        root.name = `hero-${L.h.id}`;
        root.traverse(o => {
          if (!o.isMesh) return;
          o.castShadow = !/nocast/i.test(o.name); o.receiveShadow = true;
          shopIds(o);
          o.matrixAutoUpdate = false; o.updateMatrix();
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (!m || seen.has(m)) continue;
            seen.add(m); L.mats.push(m);
            // on the low tier (phones): no normal or roughness maps (the surface's own roughness instead), the rest halved.
            // The paving's roughness comes in glTF's one metallic-roughness picture, its metalness 0 in it (hero_kit
            // fetch_texture), and the factors beside it are left at glTF's default of 1: the picture let go, the asphalt,
            // the crossings' paint, the pavers and Hachiko Square's setts were drawn as a rough metal, lit by the sky's
            // reflection alone and by no lamp, on every phone (November 2026). Without it, what it said: no metal, and
            // the roughness of a paving rather than of chalk
            if (tier === 'low') {
              if (m.metalnessMap && m.metalnessMap === m.roughnessMap) { m.metalness = 0; if (m.roughness >= 0.999) m.roughness = 0.85; }
              for (const k of ['normalMap', 'roughnessMap', 'metalnessMap']) if (m[k]) { m[k].dispose(); m[k] = null; }
            }
            share(L, m);
            if (tier === 'low') {
              for (const k of ['map', 'emissiveMap', 'aoMap']) if (m[k] && !shrunk.includes(m[k])) shrunk.push(m[k]);
            }
            // what you walk on and the walls beside you are seen at a grazing angle: without anisotropic filtering their
            // joints and grain smear to a blur a few metres ahead (the sample is the GPU's, no memory: 8x, 4x, and 2x on the low tier)
            if (aniso > 1) for (const k of ['map', 'normalMap', 'roughnessMap']) if (m[k] && m[k].anisotropy !== aniso) { m[k].anisotropy = aniso; m[k].needsUpdate = true; }
            patch(m, L.h);
            const n = (m.name || '').toLowerCase();
            if (/^tube/.test(n)) L.tubes.push({ m, seed: Math.random() * 1000, off: 0 });
            // a tower's skin whose storeys are offices (game.json hero[].offices: Scramble Square): its rooms traced behind
            // the glass by the hour (interior.js offices), not an emissive picture
            if (/^win/.test(n) && L.h.offices && window.OEInterior && OEInterior.offices) OEInterior.offices(m, L.h.offices, { night: uNight, hour: uHour });
            else if (/^win/.test(n)) { m.userData.heroWin = m.emissiveIntensity || 1; L.wins.push(m); }
            if (/^chase/.test(n) && m.emissiveMap) { m.emissiveMap = m.emissiveMap.clone(); m.emissiveMap.wrapS = THREE.RepeatWrapping; m.emissiveMap.needsUpdate = true; L.chases.push(m); }
            if (opts.mirror && /^ground/.test(n)) opts.mirror.patch(m);
          }
        });
        root.updateMatrixWorld(true);
        // the crossings' bars filtered to the pixel (streets.js zebraCells): each widened to the cell it repeats in, its
        // paint's share of each pixel drawn over the asphalt, so that from across the junction its bars neither step nor
        // break into moiré. Before the batches are made, which take the attribute with the rest
        if (window.OEStreets && OEStreets.zebraCells) {
          const paint = [];
          root.traverse(o => { if (o.isMesh && !Array.isArray(o.material) && /^ground_paint/i.test(o.material.name || '')) paint.push(o); });
          if (paint.length && OEStreets.zebraCells(paint)) {
            for (const m of new Set(paint.map(o => o.material))) OEStreets.zebraMaterial(m);
            for (const o of paint) { o.castShadow = false; o.renderOrder = -1; } // (a cell, whole, would shade the asphalt it lets show: paint a centimetre thick casts none to see)
          }
        }
        if (opts.ground) opts.ground(L.h, root); // (where its paving is: game.js heroCover)
        // its squares of one material in one draw, each still culled by itself (batch.js; after the paving is read from them)
        if (window.OEBatch) OEBatch.merge(root, { name: m => `${L.h.id}_${m.name || 'mat'}`, pack: true, unit: ['_bake'] });
        // (and what the batches left as floats, before any is sent, verts.js: a baked light that runs past 1, which is the
        // Scramble's, the roof's and Miyamasu's, in half floats, in a batch's own buffer too; a mesh that stands alone,
        // its normal in bytes. After the merge: a batch takes its meshes' attributes as plain arrays)
        if (window.OEVerts) OEVerts.leanObject(root, LEAN_VERTS);
        if (Wd.still) Wd.still(root); // (its shadow cached with the city's: world.js shadowCache)
        root.visible = false;
        group.add(root);
        L.root = root;
        // (each step's time kept, for the console and telemetry's level event: game.js holdForLevel)
        const at = { fetch: Math.round(performance.now() - t0) }, step = k => v => { at[k] = Math.round(performance.now() - t0); return v; };
        L.steps = at;
        const ready = Promise.all(shrunk.map(t => shrink(t, halving, L.h.low_k || 0.5))).then(step('shrink'))
          .then(() => (window.OETex && OETex.stats.on ? OETex.packObject(root) : null)).then(step('pack'))
          .then(() => L.root === root && opts.warm ? opts.warm(root) : null).then(step('warm'))
          // (and its vertex buffers sent in slices: on its first draw they went in one, 0.7 s of the tap on Play)
          .then(() => L.root === root && opts.upload ? opts.upload(root) : null).then(step('upload'));
        Promise.resolve(ready).catch(e => console.warn('hero warm-up:', e)).then(() => {
          if (L.root !== root) return;
          L.state = 'ready';
          console.info(`hero ${L.h.id}: ${L.mats.length} materials, ready in ${Math.round(performance.now() - t0)} ms (${Object.entries(at).map(([k, v]) => `${k} ${v}`).join(', ')})`);
        });
      }, undefined, e => { console.warn(`hero ${L.h.id} unavailable:`, e); L.state = 'failed'; });
    }

    // the level's finest parts: a model of plain geometry, fetched once the camera is inside the level (never on
    // the low tier), each of its squares drawn only near the camera
    function loadFine(L) {
      L.fine = 'loading';
      new THREE.GLTFLoader().load(base + L.h.fine, g => {
        if (L.fine !== 'loading' || L.state !== 'ready') { dispose(g.scene); if (L.fine === 'loading') L.fine = 'idle'; return; }
        const root = g.scene, seen = new Set();
        root.name = `hero-${L.h.id}-fine`;
        root.traverse(o => {
          if (!o.isMesh) return;
          o.castShadow = false; o.receiveShadow = true; // (too fine to throw a shadow a shadow map resolves)
          shopIds(o);
          o.matrixAutoUpdate = false; o.updateMatrix();
          o.geometry.computeBoundingSphere();
          o.visible = false;
          L.fineMeshes.push(o);
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && !seen.has(m)) { seen.add(m); L.mats.push(m); patch(m, L.h); }
        });
        if (window.OEVerts) OEVerts.leanObject(root, LEAN_VERTS);
        root.updateMatrixWorld(true);
        group.add(root);
        L.fineRoot = root; L.fine = 'ready';
      }, undefined, e => { console.warn(`hero ${L.h.id} fine parts unavailable:`, e); L.fine = 'failed'; });
    }

    function dispose(root) {
      root.traverse(o => {
        if (!o.isMesh) return;
        if (o.isBatchedMesh) o.dispose(); else o.geometry.dispose(); // (a batch's matrices are a texture of its own)
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          for (const k of MAPS) if (m[k] && !(sharedTex.has(texKey(m[k])) && sharedTex.get(texKey(m[k])).tex === m[k])) m[k].dispose(); // (a shared one: release)
          m.dispose();
        }
      });
    }

    function drop(L) {
      if (L.root) { group.remove(L.root); dispose(L.root); }
      if (L.fineRoot) { group.remove(L.fineRoot); dispose(L.fineRoot); }
      release(L);
      // (the probe's cube, and the sky-light map three.js made of it for the glass: that map is let go when the cube's
      // texture says it is disposed, which a render target's own dispose does not say. 6 MB on a desktop stayed from
      // frame 4 to the last card)
      if (L.h._probe) { L.h._probe.rt.texture.dispose(); L.h._probe.rt.dispose(); if (L.h._probe.uv) L.h._probe.uv.dispose(); L.h._probe = null; }
      showHidden(L, true);
      L.h.shown = false; // (let go: nobody stands on its paving)
      Object.assign(L, { state: 'idle', root: null, mats: [], tubes: [], chases: [], wins: [], fine: 'idle', fineRoot: null, fineMeshes: [] });
    }

    // the city's own landmark meshes the hero level draws instead, hidden while it is shown
    function showHidden(L, on) {
      if (!L.hidden.length) L.hidden = (L.h.hide || []).map(n => Wd.world.getObjectByName(n)).filter(Boolean);
      for (const o of L.hidden) o.visible = on;
    }

    let t = 0;
    const eye = new THREE.Vector3(), ctr = new THREE.Vector3();
    // anchor: [x, y] where the player will be (or a list of such places), loaded round as the camera is (the title and the opening: the camera
    // is away, and the level the story starts in was fetched and compiled as the opening flew into it, a hitch of
    // most of a second for each few of its shaders on a phone, tools/entry_cost.js); shown by the camera alone
    // byCamera false: a level is fetched round the anchors alone, not round the camera (a phone's flights: below)
    function update(camera, dt, anchor = null, byCamera = true) {
      t += dt || 0;
      const cx = camera.position.x, cy = -camera.position.z, cz = camera.position.y, night = uNight.value;
      const anchors = !anchor ? [] : Array.isArray(anchor[0]) ? anchor.filter(Boolean) : [anchor]; // (one [x, y], or a list of them)
      for (const L of levels) {
        // (a level high over the street, h.zr: its half-height about h.z, is as far as the camera is from it in height
        // as well: SKY STAGE's roof is 227 m over frame 5's place, which stands within its plan)
        const dz = L.h.zr ? Math.max(0, Math.abs(cz - L.h.z) - L.h.zr) : 0;
        const plan = Math.hypot(cx - L.h.at[0], cy - L.h.at[1]) - (L.h.r || 150), d = dz > 0 ? Math.hypot(Math.max(0, plan), dz) : plan;
        let near = d, at = byCamera ? d : Infinity;
        if (!L.h.zr) for (const a of anchors) { const da = Math.hypot(a[0] - L.h.at[0], a[1] - L.h.at[1]) - (L.h.r || 150); near = Math.min(near, da); at = Math.min(at, da); }
        // (a level may be fetched nearer than the default: one that only a frame of the story is played in, h.load_m)
        const loadM = L.h.load_m || LOAD_M, dropM = Math.max(L.h.drop_m || DROP_M, loadM + 20);
        if (L.state === 'idle' && at < loadM) load(L);
        else if ((L.state === 'ready' || L.state === 'loading') && near > dropM) drop(L);
        else if (L.state === 'failed' && near > dropM) L.state = 'idle';
        if (L.state !== 'ready') continue;
        const show = d < (L.h.show_m || SHOW_M);
        if (L.root.visible !== show) { L.root.visible = show; showHidden(L, !show); }
        L.h.shown = show; // (its paving walked on only while it is drawn: nav.js lift)
        if (L.fineRoot) L.fineRoot.visible = show;
        if (!show) continue;
        // its finest parts: fetched once the camera is in or by the level, each square drawn within fine_m of the camera
        if (L.h.fine && tier !== 'low' && L.fine === 'idle' && d < FINE_LOAD_M) loadFine(L);
        if (L.fine === 'ready') {
          const fm = L.h.fine_m || FINE_M;
          camera.getWorldPosition(eye);
          for (const o of L.fineMeshes) {
            const bs = o.geometry.boundingSphere;
            o.visible = ctr.copy(bs.center).applyMatrix4(o.matrixWorld).distanceTo(eye) - bs.radius < fm;
          }
        }
        if (L.h._probe) probe(L, night);
        // the rooms behind its windows: dark glass by day, lit after dark
        for (const m of L.wins) m.emissiveIntensity = m.userData.heroWin * (0.05 + 0.95 * night);
        uBake.value = L.h.bake == null ? 1 : L.h.bake;
        uStreet.value = L.h.street == null ? 1 : L.h.street;
        const [gd, gn] = L.h.glow || [0.35, 1.6], k = gd + (gn - gd) * night;
        const dusk = Math.min(1, night * 1.6);
        for (const m of L.mats) {
          if (m.userData.heroGlow != null) m.emissiveIntensity = m.userData.heroGlow * k;
          else if (m.userData.heroDusk != null) m.emissiveIntensity = m.userData.heroDusk * dusk;
        }
        // a tube or two stutters: off for a few frames, now and then
        for (const tb of L.tubes) {
          const s = Math.sin(t * 0.37 + tb.seed) * Math.sin(t * 1.13 + tb.seed * 0.7);
          tb.m.emissiveIntensity *= s > 0.985 ? (Math.sin(t * 61 + tb.seed) > 0 ? 0.15 : 1) : 1;
        }
        for (const m of L.chases) m.emissiveMap.offset.x = (Math.floor(t * 6) % 8) / 8 * (1 / 8);
      }
    }

    return {
      group, levels, update, tier, light: { bake: uBake, street: uStreet }, // (its baked light's gain and its share of the street lights, as update() sets them: tools/stop_grade.js)
      probes, glass,
      // (for the harnesses: whether each is loaded and shown, tools/game_check.js)
      state: () => levels.map(L => ({ id: L.h.id, state: L.state, shown: !!(L.root && L.root.visible), materials: L.mats.length,
        fine: L.fine, fineShown: L.fineMeshes.filter(o => o.visible).length, fineMeshes: L.fineMeshes.length, probe: L.h._probe ? { res: L.h._probe.rt.width, taken: L.h._probe.n } : null })),
    };
  }

  return { create };
})();
