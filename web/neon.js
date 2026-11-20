// Neon: the light a city's big LED screens throw on the street, the crowd and the buildings
// across from them, in the colour of what they are playing now.
//
// The screens (pipeline/screens.py, world.js "led_screen") play their programmes on the GPU. Here
// the same programme is followed on the CPU: the mean colour of each keyframe in the sheet is read
// once, and every frame each screen's current keyframe, brightness and hours give its colour. The
// nearest screens (by their size and distance from the camera) each drive one of a fixed set of
// three.js RectAreaLights, the area light three.js evaluates with linearly transformed cosines
// (Heitz, Dupuy, Hill and Neubelt, SIGGRAPH 2016; three.js's LTC tables, MIT): a screen lights
// what is in front of it with the right falloff and spread, never what is behind it, and its
// reflection in a wet street (wet.js) is the screen's own rectangle. A light moving from one screen
// to another fades out and in. (The rectangle is evaluated in closed form, not with three.js's tables: lean(), below.) The number of lights is the tier's (high 8, medium 4, low none,
// web/quality.js): it is fixed for the session, so no material recompiles as the camera moves.
// The street's static pools of the screens' light (night.js uGlowMap) stay for the far city; the low
// tier has the screens' light on the hero levels' ground worked out once instead (pooled(), below).
'use strict';
window.OENeon = (function () {
  const COUNT = { high: 8, medium: 4, low: 0 };
  // The screens are drawn dimmer than they are, so that their pictures read after the tone curve; the
  // light they throw is that of the real panels (some 1,000 nits after dark against a lamp-lit street)
  const SPILL = 13;

  // the n-th clip of a playlist (a bit mask over the clips), counting round: world.js scrClip
  function scrClip(mask, n) {
    let found = 0;
    for (let i = 0; i < 24; i++) if (Math.floor(mask / 2 ** i) % 2 === 1) { if (found === n) return i; found++; }
    return 0;
  }

  // the screens of one programme from their meshes: centre, outward normal, size, programme
  function screensOf(entry) {
    const g = entry.mesh.geometry, pos = g.attributes.position, uv = g.attributes.uv, nor = g.attributes.normal, S = entry.m.screens || [];
    if (!uv || !nor) return [];
    const acc = new Map();
    for (let i = 0; i < pos.count; i++) {
      const id = Math.floor(uv.getX(i));
      if (!S[id]) continue;
      let a = acc.get(id);
      if (!a) acc.set(id, a = { min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity), n: new THREE.Vector3() });
      const p = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(entry.mesh.matrixWorld);
      a.min.min(p); a.max.max(p);
      a.n.x += nor.getX(i); a.n.z += nor.getZ(i);
    }
    const out = [];
    for (const [id, a] of acc) {
      const s = S[id], h = s[8] || (a.max.y - a.min.y), w = Math.max(1, (s[0] || 1) * h);
      if (a.n.lengthSq() < 1e-6) continue;
      a.n.y = 0; a.n.normalize();
      out.push({ id, entry, c: a.min.clone().add(a.max).multiplyScalar(0.5), n: a.n.clone(), w: Math.min(w, a.min.distanceTo(a.max) + 0.5), h,
        phase: s[1], mask: s[2], clips: Math.max(1, s[3]), on: s[4], off: s[5], bright: s[6], sync: s[7], col: new THREE.Color(0, 0, 0), area: w * h });
    }
    return out;
  }

  // the mean linear colour of every keyframe in a programme's sheet
  function cellMeans(m, img) {
    const [cols, rows] = m.sheet, ch = m.sheet[3], K = 8, cv = document.createElement('canvas');
    cv.width = cols * K; cv.height = Math.max(K, Math.round(K / ch));
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, cv.width, cv.height);
    const px = g.getImageData(0, 0, cv.width, cv.height).data, out = [];
    const L = v => Math.pow(v / 255, 2.2);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let R = 0, G = 0, B = 0;
      for (let y = r * K; y < (r + 1) * K && y < cv.height; y++) for (let x = c * K; x < (c + 1) * K; x++) {
        const k = 4 * (y * cv.width + x); R += L(px[k]); G += L(px[k + 1]); B += L(px[k + 2]);
      }
      out.push(new THREE.Color(R / (K * K), G / (K * K), B / (K * K)));
    }
    return out;
  }

  // Wd: the world (world.js); tier: 'high' | 'medium' | 'low'; gain: a city's own scale on the light;
  // fill: light cards over a plaza after dark (game.look.fill: [{at: [x, y], z: height over the
  // ground, w, h metres, colour, k, aim: [x, y, z over the ground] for a card that does not face straight down}]), the light its shopfronts, floodlights and signs put on the
  // middle of a square that no street lamp stands in (Shibuya's scramble); ground(x, y): the ground's height
  // The area light's cost. three.js evaluates a rectangle with linearly transformed cosines: two table lookups, a
  // matrix and four clipped edge integrals, twice (diffuse and specular), for every light at every pixel a lit
  // material covers. With ten lights that was most of a night frame: an Apple M3 drew the same street in 22 ms by
  // day and 60 to 100 ms after dark, at any resolution (telemetry, November 2026). What the eye is given by a
  // screen across a street is its colour on the paving and the crowd, falling off with distance and facing, and a
  // soft highlight where a wet surface faces it; the screen's own picture in the wet street is the mirror's
  // (mirror.js), not this light's. So the rectangle is evaluated in closed form here instead:
  //   diffuse   the form factor of the rectangle seen from the point, A cos(light) / (pi d^2 + A), towards the
  //             point of the rectangle nearest the surface (exact far off, bounded by 1 close to);
  //   specular  Karis's representative point (Real Shading in Unreal Engine 4, SIGGRAPH 2013): the point of
  //             the rectangle nearest the reflected ray, one GGX lobe towards it, its energy kept as the
  //             lobe is widened by the light's size.
  // A few dozen operations a light, no texture: the two LTC tables also leave the sixteen texture units an
  // Apple or a phone GPU has to a material's own layers. ?arealight=ltc brings three.js's own back, to compare.
  const LTC = /[?&]arealight=ltc\b/.test(location.search);
  const LEAN = `
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		if ( rectAreaLight.color.r + rectAreaLight.color.g + rectAreaLight.color.b <= 0.0 ) return; // (a screen that is off, and every one of them by day)
		vec3 oeC = rectAreaLight.position;
		float oeLw = length( rectAreaLight.halfWidth ), oeLh = length( rectAreaLight.halfHeight );
		vec3 oeU = rectAreaLight.halfWidth / oeLw, oeV = rectAreaLight.halfHeight / oeLh, oeN = - cross( oeU, oeV );
		vec3 oeD = geometryPosition - oeC;
		float oeSide = dot( oeD, oeN );
		if ( oeSide <= 0.0 ) return;
		float oeA = 4.0 * oeLw * oeLh;
		vec3 oeP = oeC + oeU * ( clamp( dot( oeD, oeU ), - oeLw, oeLw ) * 0.75 ) + oeV * ( clamp( dot( oeD, oeV ), - oeLh, oeLh ) * 0.75 );
		vec3 oeL = oeP - geometryPosition;
		float oeD2 = dot( oeL, oeL );
		oeL *= inversesqrt( oeD2 );
		float oeW = oeA * saturate( - dot( oeL, oeN ) ) / ( PI * oeD2 + oeA );
		reflectedLight.directDiffuse += rectAreaLight.color * material.diffuseContribution * ( oeW * saturate( dot( geometryNormal, oeL ) ) );
		vec3 oeR = reflect( - geometryViewDir, geometryNormal );
		float oeRn = dot( oeR, oeN );
		vec3 oeS = oeP;
		if ( oeRn < - 1e-4 ) {
			vec3 oeH = oeD + oeR * ( - oeSide / oeRn );
			oeS = oeC + oeU * clamp( dot( oeH, oeU ), - oeLw, oeLw ) + oeV * clamp( dot( oeH, oeV ), - oeLh, oeLh );
		}
		vec3 oeLs = oeS - geometryPosition;
		float oeDs2 = dot( oeLs, oeLs );
		oeLs *= inversesqrt( oeDs2 );
		float oeWs = oeA * saturate( - dot( oeLs, oeN ) ) / ( PI * oeDs2 + oeA );
		float oeA2 = pow2( pow2( material.roughness ) );
		float oeK = oeA2 / ( oeA2 + 0.25 * oeWs );
		reflectedLight.directSpecular += rectAreaLight.color * min( vec3( 4.0 ), ( PI * oeWs * oeK * saturate( dot( geometryNormal, oeLs ) ) ) * BRDF_GGX( oeLs, geometryViewDir, geometryNormal, material ) ); // (bounded: no pixel of a rough wet surface sparks)
	}
`;
  let leaned = null;
  // three.js's shader chunks with the rectangle's closed form in place of the LTC one (once; before the lights exist,
  // so no program has been built with the other)
  function lean() {
    if (leaned != null) return leaned;
    const C = THREE.ShaderChunk, src = C.lights_physical_pars_fragment, i = src.indexOf('void RE_Direct_RectArea_Physical'), DECL = /uniform sampler2D ltc_1;\s*uniform sampler2D ltc_2;/;
    let k = -1; // (the function's own closing brace)
    for (let q = i < 0 ? src.length : src.indexOf('{', i), depth = 0; q < src.length; q++) { if (src[q] === '{') depth++; else if (src[q] === '}' && --depth === 0) { k = q; break; } }
    if (k < 0 || !/BRDF_GGX\s*\(/.test(src.slice(0, i)) || !DECL.test(C.lights_pars_begin)) { console.warn('area lights: three.js has changed its rectangle chunk'); return (leaned = false); }
    C.lights_physical_pars_fragment = src.slice(0, i) + LEAN.trim() + src.slice(k + 1);
    C.lights_pars_begin = C.lights_pars_begin.replace(DECL, '');
    return (leaned = true);
  }

  // The low tier's stand-in (issue 62). A phone has none of the area lights, and at dusk Hachiko's corner was lit by the
  // sky's blue alone: the yellow tactile blocks read olive, (68, 63, 22) where a desktop showed (154, 110, 12). So the light
  // the screens and the plaza's cards (game.look.fill) would put on the ground of the hero levels is worked out once, on
  // the CPU, with the same closed form the area lights use (LEAN's diffuse, towards a ground that faces up), and kept in
  // one small texture over the levels (a metre a texel): the screens' light in its rgb, each in the mean colour of its
  // whole programme, and the cards' in its alpha. A hero material on the low tier adds it to what it gives back, as it
  // does its baked light (hero.js): one texture read a pixel, no light in the shaders. The pools do not change with the
  // picture on the screens, as the area lights do on a desktop; they follow the dusk, the screens' hours and the cards'
  // night as the lights do. pool: [[x, y, r], ...] the hero levels it covers.
  const POOL_CARD = '#ffe6cc'; // (the cards' light, warm white, as theirs are)
  const MEAN = [0.327, 0.211, 0.282];
  // the pools' strength against the area lights': matched on the stills of Hachiko's corner at dusk and at night, the low
  // tier beside the high (issue 62). (The area lights reach only the eight nearest screens, and a phone's grade is its own)
  const POOL_K = 0.6; // the mean linear colour of Shibuya's sheet, for a screen whose sheet cannot be read
  function pooled(Wd, info, { gain = 1, fill = [], ground = () => 0, pool }) {
    const x0 = Math.min(...pool.map(c => c[0] - c[2])) - 10, x1 = Math.max(...pool.map(c => c[0] + c[2])) + 10;
    const y0 = Math.min(...pool.map(c => c[1] - c[2])) - 10, y1 = Math.max(...pool.map(c => c[1] + c[2])) + 10;
    const W = Math.ceil(x1 - x0), H = Math.ceil(y1 - y0); // (a metre a texel)
    const near = (x, y, m) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;
    const screens = [];
    for (const e of info.meshes) { e.mesh.updateMatrixWorld(true); screens.push(...screensOf(e).filter(s => near(s.c.x, -s.c.z, 160))); }
    const card = new THREE.Color(POOL_CARD).convertSRGBToLinear(), cl = 0.2126 * card.r + 0.7152 * card.g + 0.0722 * card.b;
    card.multiplyScalar(1 / cl);
    // each emitter: centre, its two half axes, its outward normal, its colour (rgb, or the card channel)
    const em = [];
    const V3 = THREE.Vector3, up = new V3(0, 1, 0), o = new THREE.Object3D();
    for (const s of screens) {
      const u = new V3().crossVectors(up, s.n).normalize();
      em.push({ s, c: s.c.clone().addScaledVector(s.n, 0.25), u, v: up.clone(), lw: s.w / 2, lh: s.h / 2, n: s.n.clone(), rgb: [0, 0, 0], a: 0 });
    }
    for (const f of fill) {
      const gz = ground(f.at[0], f.at[1]), c = new THREE.Color(f.colour || '#ffd9b0').convertSRGBToLinear();
      o.position.set(f.at[0], gz + (f.z || 30), -f.at[1]);
      if (f.aim) o.lookAt(f.aim[0], gz + (f.aim[2] || 0), -f.aim[1]); else o.lookAt(f.at[0], gz - 10, -f.at[1]);
      o.updateMatrixWorld(true);
      const q = o.quaternion;
      em.push({ c: o.position.clone(), u: new V3(1, 0, 0).applyQuaternion(q), v: new V3(0, 1, 0).applyQuaternion(q), lw: (f.w || 60) / 2, lh: (f.h || 60) / 2,
        n: new V3(0, 0, 1).applyQuaternion(q), rgb: null, a: (f.k ?? 1) * (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) });
    }
    const acc = new Float32Array(W * H * 4), D = new V3(), P = new V3(), L = new V3();
    const zs = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) zs[j * W + i] = ground(x0 + i + 0.5, y0 + j + 0.5) + 0.05;
    // the light at one texel from one emitter: LEAN's form factor towards a ground facing up
    function row(j, e) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        D.set(x0 + i + 0.5, zs[k], -(y0 + j + 0.5)).sub(e.c);
        const side = D.dot(e.n);
        if (side <= 0) continue;
        P.copy(e.c).addScaledVector(e.u, Math.max(-e.lw, Math.min(e.lw, D.dot(e.u))) * 0.75).addScaledVector(e.v, Math.max(-e.lh, Math.min(e.lh, D.dot(e.v))) * 0.75);
        L.copy(P).sub(D.add(e.c)); // (the point on the emitter, from the texel)
        const d2 = L.lengthSq(), A = 4 * e.lw * e.lh;
        L.multiplyScalar(1 / Math.sqrt(d2));
        const w = A * Math.max(0, -L.dot(e.n)) / (Math.PI * d2 + A) * Math.max(0, L.y);
        if (w <= 0) continue;
        if (e.rgb) { acc[k * 4] += e.rgb[0] * w; acc[k * 4 + 1] += e.rgb[1] * w; acc[k * 4 + 2] += e.rgb[2] * w; } else acc[k * 4 + 3] += e.a * w;
      }
    }
    const NU = { uPoolMap: { value: new THREE.DataTexture(new Uint8Array(4), 1, 1) }, uPoolXf: { value: new THREE.Vector4(x0, y0, 1 / W, 1 / H) },
      uPoolScr: { value: 0 }, uPoolCardK: { value: 0 }, uPoolCard: { value: new THREE.Vector3(card.r, card.g, card.b) } };
    let t0 = null, colours = null, jNext = 0, done = false, gainK = 0;
    // each screen's colour: the mean of every keyframe of every clip on its playlist, at its brightness (as colourOf at full night)
    const means = new Map();
    function colour() {
      let all = true;
      for (const e of em) {
        if (!e.rgb) continue;
        const s = e.s, m = s.entry.m, img = s.entry.mat.map && s.entry.mat.map.image;
        let cm = means.get(m);
        if (!cm && img && img.width > 0 && img.complete !== false) try { means.set(m, cm = cellMeans(m, img)); } catch (er) { cm = null; }
        if (!cm) { all = false; continue; }
        const F = m.frames || 1, c = [0, 0, 0];
        let n = 0;
        for (let q = 0; q < s.clips; q++) {
          const clip = scrClip(s.mask, q);
          for (let f = 0; f < F; f++) { const v = cm[clip * F + f]; if (v) { c[0] += v.r; c[1] += v.g; c[2] += v.b; n++; } }
        }
        if (n) e.rgb = c.map(v => v / n * s.bright); else all = false;
      }
      return all;
    }
    const api = {
      lights: [], screens, cards: [], count: 0, pool: NU,
      get poolState() { return { done, gainK, night: info.night.value, hour: info.clock.hour.value, emitters: em.length }; }, // (for the harnesses)
      update(camera, dt) {
        const night = info.night.value, hour = info.clock.hour.value;
        if (!done) {
          if (t0 == null) t0 = performance.now();
          // (the sheets read once they have come: a sheet that cannot be read, a phone's packed one, is given the mean colour)
          if (!colours) { if (colour() || performance.now() - t0 > 12000) { colours = true; for (const e of em) if (e.rgb && !e.rgb.some(v => v > 0)) e.rgb = MEAN.map(v => v * e.s.bright); } else return; }
          // the texture, a few rows a frame (some 60 thousand texels by a few dozen emitters: a few milliseconds a frame)
          const j1 = Math.min(H, jNext + 24);
          for (let j = jNext; j < j1; j++) for (const e of em) if (e.rgb ? e.rgb.some(v => v > 0) : e.a > 0) row(j, e);
          jNext = j1;
          if (jNext < H) return;
          let max = 1e-6;
          for (let k = 0; k < acc.length; k++) max = Math.max(max, acc[k]);
          const px = new Uint8Array(W * H * 4);
          for (let k = 0; k < acc.length; k++) px[k] = Math.round(255 * Math.sqrt(acc[k] / max)); // (fine steps in the dark, as night.js's map)
          const map = new THREE.DataTexture(px, W, H, THREE.RGBAFormat);
          Object.assign(map, { magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, needsUpdate: true });
          NU.uPoolMap.value = map; NU.uPoolXf.value.w = 1 / H;
          gainK = max; done = true;
          if (screens.length && Wd.night && Wd.night.setGlowScale) Wd.night.setGlowScale(0.3); // (its share of the static glow, as with the area lights)
        }
        // as the area lights would be: a screen's light scaled by the dusk (update(), below) and whether its hours have it on,
        // and the cards' by the night
        let on = 0, all = 0;
        for (const e of em) if (e.rgb) {
          const s = e.s, w = s.area * s.bright, lit = s.on < s.off ? hour >= s.on && hour <= s.off : hour >= s.on || hour <= s.off;
          all += w; if (lit) on += w;
        }
        const dusk = (0.06 * Math.min(1, night / 0.05) + 0.94 * night) * (2.4 + (1 - 2.4) * night);
        NU.uPoolScr.value = POOL_K * gainK * gain * SPILL * dusk * (all ? on / all : 0);
        NU.uPoolCardK.value = POOL_K * gainK * night;
      },
    };
    return api;
  }

  async function create(Wd, renderer, { tier = 'low', gain = 1, fill = [], ground = () => 0, pool = null } = {}) {
    const n = COUNT[tier] || 0, info = Wd.screens;
    const none = { lights: [], screens: [], cards: [], update() {}, count: 0 };
    if (!n && pool && pool.length && info) return pooled(Wd, info, { gain, fill, ground, pool });
    if (!n || !info || (!info.meshes.length && !fill.length)) return none;
    if (LTC) {
      try {
        const lib = await import('three/addons/lights/RectAreaLightUniformsLib.js');
        lib.RectAreaLightUniformsLib.init();
      } catch (e) { console.warn('area lights unavailable:', e); return none; }
    } else if (!lean()) return none;
    const screens = [];
    for (const e of info.meshes) { e.mesh.updateMatrixWorld(true); screens.push(...screensOf(e)); }
    const cards = fill.map(f => {
      const L = new THREE.RectAreaLight(new THREE.Color(f.colour || '#ffd9b0').convertSRGBToLinear(), 0, f.w || 60, f.h || 60);
      const gz = ground(f.at[0], f.at[1]);
      L.position.set(f.at[0], gz + (f.z || 30), -f.at[1]);
      if (f.aim) L.lookAt(f.aim[0], gz + (f.aim[2] || 0), -f.aim[1]); // (a card that lights something from its side: a statue)
      else L.lookAt(f.at[0], gz - 10, -f.at[1]);
      L.userData.k = f.k ?? 1;
      Wd.world.add(L);
      return L;
    });
    // each programme's keyframe colours, once its sheet has loaded
    const means = new Map();
    const lights = [];
    for (let i = 0; i < Math.min(n, screens.length); i++) {
      const L = new THREE.RectAreaLight(0x000000, 0, 1, 1);
      L.userData = { screen: null, w: 0 };
      Wd.world.add(L);
      lights.push(L);
    }
    const look = new THREE.Vector3(), tmp = new THREE.Color();
    let last = -1;
    function colourOf(s, t, hour, night) {
      const m = s.entry.m, mat = s.entry.mat;
      let cm = means.get(m);
      if (!cm) {
        const img = mat.map && mat.map.image;
        if (!img || !(img.width > 0) || img.complete === false) return null;
        means.set(m, cm = cellMeans(m, img));
      }
      const F = m.frames || 1, D = (m.frame_s || 4) * F, tt = t + s.phase, k = Math.floor(tt / D);
      let clip = scrClip(s.mask, ((k % s.clips) + s.clips) % s.clips), ct = tt / D - k;
      const [sc, sp, sl] = m.sync || [-1, 1e9, 0], st = ((t % sp) + sp) % sp;
      if (s.sync > 0.5 && sc >= 0 && st < sl) { clip = sc; ct = st / sl; }
      const c = cm[Math.min(cm.length - 1, clip * F + Math.floor(ct * F))];
      if (!c) return null;
      const on = s.on < s.off ? hour >= s.on && hour <= s.off : hour >= s.on || hour <= s.off;
      return tmp.copy(c).multiplyScalar(on ? s.bright * (2.4 + (1 - 2.4) * night) : 0);
    }
    if (screens.length && Wd.night && Wd.night.setGlowScale) Wd.night.setGlowScale(0.3);
    const api = {
      lights, screens, cards, count: lights.length,
      // per frame: each screen's colour now, and the lights on the nearest
      update(camera, dt) {
        const t = info.clock.t.value, hour = info.clock.hour.value, night = info.night.value;
        for (const L of cards) L.intensity = L.userData.k * night;
        if (last < 0) last = t;
        const cp = camera.position;
        for (const s of screens) s.score = cp.distanceTo(s.c) / Math.sqrt(s.area);
        const want = screens.filter(s => s.n.dot(look.copy(cp).sub(s.c)) > -0.3 * cp.distanceTo(s.c) || cp.distanceTo(s.c) < 30)
          .sort((a, b) => a.score - b.score).slice(0, lights.length);
        const k = 1 - Math.exp(-dt / 0.35);
        for (const L of lights) if (L.userData.screen && !want.includes(L.userData.screen)) L.userData.want = 0; else L.userData.want = 1;
        for (const s of want) {
          if (lights.some(L => L.userData.screen === s)) continue;
          const free = lights.find(L => !L.userData.screen) || lights.find(L => L.userData.want === 0 && L.userData.w < 0.02);
          if (!free) continue;
          Object.assign(free.userData, { screen: s, w: 0, want: 1 });
          free.position.copy(s.c).addScaledVector(s.n, 0.25);
          free.width = s.w; free.height = s.h;
          free.lookAt(look.copy(s.c).addScaledVector(s.n, 10));
          free.color.setRGB(0, 0, 0);
        }
        for (const L of lights) {
          const u = L.userData, s = u.screen;
          if (!s) { L.intensity = 0; continue; }
          u.w += ((u.want ? 1 : 0) - u.w) * k * 2;
          if (!u.want && u.w < 0.01) { u.screen = null; L.intensity = 0; continue; }
          const c = colourOf(s, t, hour, night);
          if (c) s.col.lerp(c, k); // the light eases between keyframes, as a wall's glow does
          L.color.copy(s.col);
          // (in the sun a screen lights little round it, and in full daylight nothing: a light of no intensity is passed
          // over in the shaders, lens.js loopAreaLights)
          L.intensity = u.w * gain * SPILL * (0.06 * Math.min(1, night / 0.05) + 0.94 * night);
        }
      },
    };
    return api;
  }
  return { create, COUNT };
})();
