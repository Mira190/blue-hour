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
//             "load_m": 60, "show_m": 300, "drop_m": 85}]  // fetched within r + load_m (260), shown within show_m (420),
//                                                     // let go past r + drop_m (520): a level only one place uses comes later
//                                                     // and goes sooner (Miyamasu, frame 5's place)
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
    const uBake = { value: 1 }, uStreet = { value: 1 }, uNight = U && U.uNight ? U.uNight : { value: 0 };
    const aniso = Math.min(tier === 'high' ? 8 : tier === 'medium' ? 4 : 2, renderer && renderer.capabilities ? renderer.capabilities.getMaxAnisotropy() : 1);

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
        // a room (room*: a hall inside a building) is lit by its own lamps by day too, and takes a share of the sky's
        // light through its windows, not all of it as a street does. Its lamps are no brighter at night: the eye is,
        // and the exposure with it, so the baked light's share falls as night comes or the room burns out
        if (/^room/.test(name)) sh.fragmentShader = sh.fragmentShader.replace('uHeroBake * uHeroNight;', 'uHeroBake * mix(0.8, 0.3, uHeroNight);')
          .replace('reflectedLight.indirectDiffuse *= mix(1.0, vHeroBake.a, 0.85);', 'reflectedLight.indirectDiffuse *= 0.45 * mix(1.0, vHeroBake.a, 0.85);');
        // the city's street lights, at the share the level asks (h.street): its own lamps and signs are baked in
        if (Wd.streetLit && !/^(glow|tube|chase|paper|lamp)/.test(name)) {
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
      if (/^(paper|lamp)/.test(name)) { m.userData.oeDry = true; m.userData.heroDusk = m.emissiveIntensity || 1; m.emissiveIntensity = 0; }
      m.needsUpdate = true;
    }

    // a texture made smaller on the low tier before it reaches the GPU: halved, or on a phone's lean sub-tier no
    // side over 1024. Resized by createImageBitmap where it can (no full-size canvas copy, which is tens of MB of
    // passing CPU memory on a phone), else through a canvas that is shrunk to nothing once it is uploaded.
    const lean = () => { try { const q = window.OEQuality && OEQuality.city && OEQuality.city(); return !!(q && q.lean); } catch (e) { return false; } };
    async function shrink(tex, done) {
      const img = tex && tex.image;
      if (!img || !img.width || img.width <= 256 || tex.userData.heroHalved) return;
      if (done.has(img)) { const o = await done.get(img); if (o) { tex.image = o; tex.userData.heroHalved = true; tex.needsUpdate = true; } return; }
      let fin; done.set(img, new Promise(r => { fin = r; }));
      const k = lean() ? Math.min(0.5, 1024 / Math.max(img.width, img.height)) : 0.5;
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
            if (/^win/.test(n)) { m.userData.heroWin = m.emissiveIntensity || 1; L.wins.push(m); }
            if (/^chase/.test(n) && m.emissiveMap) { m.emissiveMap = m.emissiveMap.clone(); m.emissiveMap.wrapS = THREE.RepeatWrapping; m.emissiveMap.needsUpdate = true; L.chases.push(m); }
            if (opts.mirror && /^ground/.test(n)) opts.mirror.patch(m);
          }
        });
        root.updateMatrixWorld(true);
        if (opts.ground) opts.ground(L.h, root); // (where its paving is: game.js heroCover)
        if (Wd.still) Wd.still(root); // (its shadow cached with the city's: world.js shadowCache)
        root.visible = false;
        group.add(root);
        L.root = root;
        // (each step's time kept, for the console and telemetry's level event: game.js holdForLevel)
        const at = { fetch: Math.round(performance.now() - t0) }, step = k => v => { at[k] = Math.round(performance.now() - t0); return v; };
        L.steps = at;
        const ready = Promise.all(shrunk.map(t => shrink(t, halving))).then(step('shrink'))
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
          o.matrixAutoUpdate = false; o.updateMatrix();
          o.geometry.computeBoundingSphere();
          o.visible = false;
          L.fineMeshes.push(o);
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && !seen.has(m)) { seen.add(m); L.mats.push(m); patch(m, L.h); }
        });
        root.updateMatrixWorld(true);
        group.add(root);
        L.fineRoot = root; L.fine = 'ready';
      }, undefined, e => { console.warn(`hero ${L.h.id} fine parts unavailable:`, e); L.fine = 'failed'; });
    }

    function dispose(root) {
      root.traverse(o => {
        if (!o.isMesh) return;
        o.geometry.dispose();
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
    // anchor: [x, y] where the player will be, loaded round as the camera is (the title and the opening: the camera
    // is away, and the level the story starts in was fetched and compiled as the opening flew into it, a hitch of
    // most of a second for each few of its shaders on a phone, tools/entry_cost.js); shown by the camera alone
    function update(camera, dt, anchor = null) {
      t += dt || 0;
      const cx = camera.position.x, cy = -camera.position.z, night = uNight.value;
      for (const L of levels) {
        const d = Math.hypot(cx - L.h.at[0], cy - L.h.at[1]) - (L.h.r || 150);
        const near = anchor ? Math.min(d, Math.hypot(anchor[0] - L.h.at[0], anchor[1] - L.h.at[1]) - (L.h.r || 150)) : d;
        // (a level may be fetched nearer than the default: one that only a frame of the story is played in, h.load_m)
        const loadM = L.h.load_m || LOAD_M, dropM = Math.max(L.h.drop_m || DROP_M, loadM + 20);
        if (L.state === 'idle' && near < loadM) load(L);
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
      // (for the harnesses: whether each is loaded and shown, tools/game_check.js)
      state: () => levels.map(L => ({ id: L.h.id, state: L.state, shown: !!(L.root && L.root.visible), materials: L.mats.length,
        fine: L.fine, fineShown: L.fineMeshes.filter(o => o.visible).length, fineMeshes: L.fineMeshes.length })),
    };
  }

  return { create };
})();
