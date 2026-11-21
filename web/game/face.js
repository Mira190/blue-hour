// Faces that move (issue 12). The speaking cast's heads carry blendshapes (blender/build_people.py add_face: HeadBox's
// ARKit-style shapes and visemes for the Rocketbox heads, MIT), and every Rocketbox head has eye bones. A face here:
//   blinks       on a timer drawn from how people blink (every 2 to 6 s, more often while speaking and at the end of a
//                phrase; one in eight a double blink; a big jump of the eyes often brings one), closing in 70 ms and
//                opening in 130, the lids lowered a little when the eyes look down
//   looks        with its eyes at what it is given (the player, the one it talks to), within what eyes do before the
//                head has to turn, in saccades: a jump, then still. Held on a face, the eyes go between its two eyes and
//                its mouth; a speaker looks away for a moment as a line begins, as people do while they find words
//   carries      what its line says: a brow raised at a question, the brows drawn together over grief, a set mouth at a
//                refusal, a small smile at something kind, over the speaker's own temper (TEMPER)
//   speaks       while its line is typed: the jaw opens and closes a syllable at a time, each shaped by the vowel being
//                typed (the visemes aa, E, O, U and the closed PP), and shuts at a comma or a stop. When the voices come
//                (issue 11) the mouths follow each line's Rhubarb track instead
//
// The eyes are a pose laid over the clip (AGENTS.md, "A pose laid over an animation"): before() puts each eye bone back
// to the pose the clip left, if the bone still holds what after() laid, and is called before the mixer; after() keeps
// the pose the clip left and lays the turn over it. Twice a turn added every frame wound a bone round while time was
// held; here nothing builds on the frame before, and nothing moves without time: every timer runs on the dt it is
// given, so a held world (dt 0) holds every face as it was. The shapes are set whole each frame.
//
//   const face = OEFace.attach(rig.root)    -> null when the model has no face (the crowd's, the old characters')
//   face.before()                           before the mixer poses the bones
//   face.after(dt, { look, line, mood, listen })
//            look: a THREE.Vector3 in the world, or null (the eyes rest ahead, wandering a little)
//            line: { text, at } the line being said and how far it has been typed, or null when not speaking
//            listen: the one it talks to is speaking (attentive: a brow up, the eyes held on them)
//   face.rest()                             back to a still face (shapes at nought, the eyes left to the clip)
//   face.state                              for tools/face_check.js: { blink, gaze: [yaw, pitch], shapes }
'use strict';
window.OEFace = (function () {
  // the speaker's own temper, under every line (by a word of their name, lower case); else DEFAULT
  const TEMPER = {
    sumiko: { browInnerUp: 0.18, mouthPress: 0.08 }, detective: { browDown: 0.22, mouthPress: 0.18 },
    kanbara: { browDown: 0.28, mouthPress: 0.22 }, tatsuo: { browDown: 0.18, mouthFrown: 0.12 },
    mizuno: { mouthSmile: 0.14, browOuterUp: 0.08 }, tanaka: { mouthSmile: 0.18, eyeSquint: 0.08 },
  };
  const DEFAULT = { mouthSmile: 0.06 };
  // what a line says, from its words: the strongest that is found
  const CUES = [
    { re: /\b(dead|died|die|dying|never|lost|alone|gone|grave|sorry|waited|late|nobody|no one|killed|cold|forgot|forget|cannot see|sixty(?:-two)? years|could not|last)\b|遅かった/i,
      w: { browInnerUp: 0.42, mouthFrown: 0.22, browDown: -0.1 } },
    { re: /\b(no|not|don't|lie|lied|liar|must|closed|police|stop|enough|wrong|nothing|deny|refuse)\b/i, w: { browDown: 0.3, mouthPress: 0.26 } },
    { re: /\b(thank|thanks|glad|good|kind|love|smile|laugh|beautiful|lovely|welcome|hope|careful|friend|grandmother|chose)\b|ありがとう/i,
      w: { mouthSmile: 0.34, eyeSquint: 0.16 } },
  ];
  const SHAPES = ['eyeBlink', 'eyeSquint', 'eyeWide', 'browInnerUp', 'browDown', 'browOuterUp', 'mouthSmile', 'mouthFrown', 'mouthPress',
    'viseme_aa', 'viseme_E', 'viseme_O', 'viseme_U', 'viseme_PP'];
  const MOODS = ['eyeSquint', 'eyeWide', 'browInnerUp', 'browDown', 'browOuterUp', 'mouthSmile', 'mouthFrown', 'mouthPress'];
  const EYE_YAW = 0.33, EYE_UP = 0.22, EYE_DOWN = 0.32; // (how far eyes go before a head turns, radians)
  const DEG = Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // the line's mood: the speaker's temper and what the line says
  function moodOf(name, text) {
    const m = {};
    const key = Object.keys(TEMPER).find(k => (name || '').toLowerCase().includes(k));
    Object.assign(m, key ? TEMPER[key] : DEFAULT);
    if (text) {
      const add = w => { for (const k in w) m[k] = (m[k] || 0) + w[k]; };
      const cue = CUES.find(c => c.re.test(text));
      if (cue) add(cue.w);
      const end = text.trim().slice(-2);
      if (/[?？]/.test(end)) add({ browOuterUp: 0.3, browInnerUp: 0.12 });
      else if (/[!！]/.test(end)) add({ eyeWide: 0.22, browOuterUp: 0.18 });
    }
    for (const k in m) m[k] = clamp(m[k], 0, 0.75);
    return m;
  }
  // the vowel a syllable is shaped by: the first after the typed point
  const KANA = { a: 'あかさたなはまやらわがざだばぱアカサタナハマヤラワガザダバパ', E: 'いきしちにひみりぎじぢびぴイキシチニヒミリギジヂビピえけせてねへめれげぜでべぺエケセテネヘメレゲゼデベペ',
    U: 'うくすつぬふむゆるぐずづぶぷウクスツヌフムユルグズヅブプ', O: 'おこそとのほもよろをごぞどぼぽオコソトノホモヨロヲゴゾドボポ' };
  function vowelAt(text, i) {
    for (let k = i; k < Math.min(text.length, i + 8); k++) {
      const c = text[k];
      if (/[.,;:!?。、！？—…]/.test(c)) return null;
      if (/[aA]/.test(c)) return 'aa'; if (/[eiEIyY]/.test(c)) return 'E'; if (/[oO]/.test(c)) return 'O'; if (/[uUwW]/.test(c)) return 'U';
      if (KANA.a.includes(c)) return 'aa'; if (KANA.E.includes(c)) return 'E'; if (KANA.U.includes(c)) return 'U'; if (KANA.O.includes(c)) return 'O';
      if (c.charCodeAt(0) > 0x3000) return 'aa';
    }
    return 'aa';
  }

  // A face is drawn still until it is chosen to move. Its shapes cost the GPU a float texture (16 bytes a vertex a shape),
  // which three.js makes the first time a mesh is drawn with them and keeps as long as its geometry: so every face mesh
  // is drawn from a still geometry (the same buffers, no shapes: the program the crowd's faces use) and only a face
  // that moves is given its geometry with the shapes (live: its own small copies of the buffers, so that letting it go
  // can dispose it, texture and all, without touching the still one's). The phone's budget pays only for the faces in
  // play (docs/PERFORMANCE.md, "The speaking cast's faces").
  const FULL = new WeakMap(), LIVE = new Map(), STILL = new WeakMap();
  function stillOf(g) {
    let s = STILL.get(g);
    if (!s) {
      s = new THREE.BufferGeometry();
      s.setIndex(g.index);
      for (const k in g.attributes) s.setAttribute(k, g.attributes[k]);
      for (const gr of g.groups) s.addGroup(gr.start, gr.count, gr.materialIndex);
      s.boundingBox = g.boundingBox; s.boundingSphere = g.boundingSphere; s.userData = g.userData;
      STILL.set(g, s); FULL.set(s, g);
    }
    return s;
  }
  const isFace = o => o.isMesh && o.morphTargetDictionary && o.morphTargetDictionary.eyeBlink !== undefined;
  // (a model as it comes: its face meshes drawn still, people.js ready; so are the crowd's copies of it)
  function prepare(root) { root.traverse(o => { if (isFace(o) && o.geometry.morphAttributes.position) o.geometry = stillOf(o.geometry); }); }
  function liveOf(full) {
    let L = LIVE.get(full);
    if (!L) {
      const g = new THREE.BufferGeometry(), own = a => (a.isInterleavedBufferAttribute ? null : new THREE.BufferAttribute(a.array, a.itemSize, a.normalized));
      let shared = false;
      if (full.index) g.setIndex(own(full.index));
      for (const k in full.attributes) { const a = own(full.attributes[k]); if (a) g.setAttribute(k, a); else { g.setAttribute(k, full.attributes[k]); shared = true; } }
      for (const gr of full.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
      g.morphAttributes = full.morphAttributes; g.morphTargetsRelative = full.morphTargetsRelative;
      g.boundingBox = full.boundingBox; g.boundingSphere = full.boundingSphere; g.userData = full.userData;
      L = { g, n: 0, shared }; LIVE.set(full, L);
    }
    return L;
  }
  function attach(root, seed) {
    const meshes = [], bones = {};
    let headB = null;
    root.traverse(o => {
      if (isFace(o)) { if (o.geometry.morphAttributes.position) o.geometry = stillOf(o.geometry); if (FULL.has(o.geometry)) meshes.push(o); }
      if (o.isBone) { if (/LEye$/.test(o.name)) bones.L = o; else if (/REye$/.test(o.name)) bones.R = o; else if (/_Head$|Head$/.test(o.name) && !headB) headB = o; }
    });
    if (!meshes.length) return null; // (a face without shapes, the crowd's: still, docs/PERFORMANCE.md)
    // (each shape's index in each mesh of the face: the head and its lashes are two meshes of one dictionary)
    const idx = meshes.map(m => SHAPES.map(s => m.morphTargetDictionary[s]));
    // the eyes' and the head's own ways (ahead, up), from the bind pose: a model of the people stands facing +z, y up
    const sk = meshes[0] && meshes[0].skeleton;
    const T = THREE, q0 = new T.Quaternion(), q1 = new T.Quaternion(), q2 = new T.Quaternion(), v0 = new T.Vector3(), v1 = new T.Vector3(), v2 = new T.Vector3();
    const mtx = new T.Matrix4(), sc = new T.Vector3(), ps = new T.Vector3();
    const ownAxes = b => {
      let rq = null;
      if (sk) { const i = sk.bones.indexOf(b); if (i >= 0) { mtx.copy(sk.boneInverses[i]).invert().decompose(ps, q0, sc); rq = q0.clone().invert(); } }
      if (!rq) { root.updateMatrixWorld(true); b.getWorldQuaternion(q0); root.getWorldQuaternion(q1); rq = q0.invert().multiply(q1); }
      return { fwd: new T.Vector3(0, 0, 1).applyQuaternion(rq), up: new T.Vector3(0, 1, 0).applyQuaternion(rq) };
    };
    const eyes = [bones.L, bones.R].filter(Boolean).map(b => ({ b, raw: new T.Quaternion(), laid: new T.Quaternion(), has: false, ...ownAxes(b) }));
    const head = headB ? ownAxes(headB) : null;
    // a small random of its own, the same every run (tools/face_check.js compares stills)
    let s = (seed >>> 0) || 0x9e3779b9;
    const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    const st = {
      blink: 0, blinkT: -1, nextBlink: 1 + rnd() * 3, double: false,
      gy: 0, gp: 0, ty: 0, tp: 0, offY: 0, offP: 0, nextSac: 0.3 + rnd(), away: 0,
      mood: {}, want: {}, line: '', syl: 0, sylRate: 4.6, sylAmp: 0.5, open: 0, vowel: 'aa', pp: 0, accent: 0, typedWas: 0,
      shapes: new Float32Array(SHAPES.length), active: false,
    };
    function before() {
      for (const e of eyes) if (e.has && e.b.quaternion.equals(e.laid)) e.b.quaternion.copy(e.raw);
    }
    function setShapes(w) {
      for (let m = 0; m < meshes.length; m++) {
        const inf = meshes[m].morphTargetInfluences, ix = idx[m];
        for (let k = 0; k < SHAPES.length; k++) if (ix[k] !== undefined) inf[ix[k]] = w[k];
      }
    }
    const stills = meshes.map(m => m.geometry);
    function live(on) {
      meshes.forEach((m, i) => {
        const full = FULL.get(stills[i]);
        if (on) { const L = liveOf(full); L.n++; m.geometry = L.g; return; }
        m.geometry = stills[i];
        const L = LIVE.get(full);
        if (L && --L.n <= 0) { LIVE.delete(full); if (!L.shared) L.g.dispose(); }
      });
    }
    function rest() {
      st.shapes.fill(0); setShapes(st.shapes);
      for (const e of eyes) { if (e.has && e.b.quaternion.equals(e.laid)) e.b.quaternion.copy(e.raw); e.has = false; }
      if (st.active) live(false);
      st.active = false;
    }
    function startBlink() { st.blinkT = 0; }
    // where the target lies from the head, in the head's own yaw and pitch
    function aim(look) {
      if (!headB || !head || !look) return null;
      headB.getWorldQuaternion(q0); headB.getWorldPosition(v0);
      const f = v1.copy(head.fwd).applyQuaternion(q0), u = v2.copy(head.up).applyQuaternion(q0);
      const d = new T.Vector3().copy(look).sub(v0);
      const len = d.length(); if (len < 0.05) return null;
      d.divideScalar(len);
      const r = new T.Vector3().crossVectors(u, f); // (to the head's left: yaw positive turns that way)
      return [Math.atan2(d.dot(r), d.dot(f)), Math.asin(clamp(d.dot(u), -1, 1))];
    }
    function after(dt, o = {}) {
      if (!st.active) live(true);
      st.active = true;
      dt = Math.max(0, Math.min(dt || 0, 0.1));
      const line = o.line && o.line.text ? o.line : null;
      // ---- the mood: the line's, eased in; a listener's attention
      const text = line ? line.text : '';
      if (text !== st.line) {
        st.line = text; st.want = text ? moodOf(o.name, text) : moodOf(o.name, '');
        if (text) { st.accent = 1; if (rnd() < 0.35) st.away = 0.6 + rnd() * 0.6; } // (a line begins: the brows lift on it, and the eyes may leave to find the words)
      }
      const want = o.listen && !text ? Object.assign({}, moodOf(o.name, ''), { browOuterUp: 0.16 }) : st.want;
      const kM = 1 - Math.exp(-dt / 0.3);
      for (const k of MOODS) st.mood[k] = (st.mood[k] || 0) + ((want[k] || 0) - (st.mood[k] || 0)) * kM;
      st.accent = Math.max(0, st.accent - dt * 2.2);
      // ---- the mouth: a syllable at a time while the line is typed
      const typing = !!line && line.at < line.text.length;
      if (typing) {
        const at = Math.floor(line.at), c = line.text[Math.max(0, at - 1)] || '';
        const pause = /[.,;:!?。、！？—…]/.test(c);
        st.syl += dt * st.sylRate;
        if (st.syl >= 1) {
          st.syl -= 1; st.sylRate = 3.8 + rnd() * 1.6; st.sylAmp = 0.35 + rnd() * 0.4;
          st.vowel = vowelAt(line.text, at) || st.vowel;
          st.pp = /[mbpMBP]/.test(line.text.slice(at, at + 3)) ? 1 : 0;
          if (pause && rnd() < 0.4 && st.blinkT < 0) startBlink(); // (a phrase ends: a blink, often)
        }
        const shape = Math.pow(Math.sin(Math.PI * st.syl), 1.2) * st.sylAmp * (pause ? 0.15 : 1);
        st.open += (shape - st.open) * (1 - Math.exp(-dt / 0.035));
      } else st.open += (0 - st.open) * (1 - Math.exp(-dt / 0.08));
      if (st.open < 1e-3) st.open = 0;
      // ---- the eyes: saccades round the target, held still between them
      const a = aim(o.look);
      st.nextSac -= dt;
      if (st.away > 0) st.away -= dt;
      if (st.nextSac <= 0) {
        const was = [st.offY, st.offP];
        if (a) {
          // (held on a face: one eye, the other, now and then the mouth; a speaker's eyes leave it while finding words)
          const p = rnd();
          if (st.away > 0) { st.offY = (rnd() < 0.5 ? -1 : 1) * (7 + rnd() * 8) * DEG; st.offP = -(2 + rnd() * 6) * DEG; }
          else if (p < 0.4) { st.offY = 1.2 * DEG; st.offP = 0.4 * DEG; } else if (p < 0.8) { st.offY = -1.2 * DEG; st.offP = 0.4 * DEG; } else { st.offY = 0; st.offP = -2.6 * DEG; }
          st.nextSac = (o.listen ? 0.9 : 0.5) + rnd() * (o.listen ? 2.2 : 1.6);
        } else { st.offY = (rnd() * 2 - 1) * 12 * DEG; st.offP = (rnd() * 2 - 1) * 5 * DEG - 2 * DEG; st.nextSac = 0.8 + rnd() * 2.4; }
        const jump = Math.hypot(st.offY - was[0], st.offP - was[1]);
        if (jump > 8 * DEG && st.blinkT < 0 && rnd() < 0.4) startBlink();
      }
      st.ty = clamp((a ? a[0] : 0) + st.offY, -EYE_YAW, EYE_YAW);
      st.tp = clamp((a ? a[1] : 0) + st.offP, -EYE_DOWN, EYE_UP);
      const kE = 1 - Math.exp(-dt / 0.022); // (a saccade: there in a few hundredths of a second)
      st.gy += (st.ty - st.gy) * kE; st.gp += (st.tp - st.gp) * kE;
      // ---- the blink
      st.nextBlink -= dt * (typing ? 1.35 : 1);
      if (st.nextBlink <= 0 && st.blinkT < 0) startBlink();
      if (st.blinkT >= 0) {
        st.blinkT += dt;
        const t = st.blinkT;
        st.blink = t < 0.07 ? t / 0.07 : t < 0.1 ? 1 : t < 0.23 ? 1 - (t - 0.1) / 0.13 : 0;
        if (t >= 0.23) {
          st.blinkT = -1; st.blink = 0;
          if (!st.double && rnd() < 0.12) { st.double = true; st.blinkT = -1; st.nextBlink = 0.12; }
          else { st.double = false; st.nextBlink = 2 + rnd() * 4; }
        }
      }
      // ---- the shapes, set whole
      const w = st.shapes, m = st.mood, open = st.open;
      const down = Math.max(0, -st.gp) / EYE_DOWN, up = Math.max(0, st.gp) / EYE_UP;
      w[0] = clamp(st.blink + down * 0.32 + (m.eyeSquint || 0) * 0.25, 0, 1);          // eyeBlink (the lids follow the eyes down)
      w[1] = clamp((m.eyeSquint || 0) * (1 - st.blink), 0, 1);                           // eyeSquint
      w[2] = clamp(((m.eyeWide || 0) + up * 0.15) * (1 - st.blink), 0, 1);               // eyeWide
      w[3] = clamp((m.browInnerUp || 0) + st.accent * 0.1, 0, 1);                        // browInnerUp
      w[4] = clamp(m.browDown || 0, 0, 1);                                               // browDown
      w[5] = clamp((m.browOuterUp || 0) + st.accent * 0.14, 0, 1);                       // browOuterUp
      w[6] = clamp((m.mouthSmile || 0) * (1 - open * 0.6), 0, 1);                        // mouthSmile
      w[7] = clamp((m.mouthFrown || 0) * (1 - open * 0.5), 0, 1);                        // mouthFrown
      w[8] = clamp((m.mouthPress || 0) * (1 - open * 1.5), 0, 1);                        // mouthPress
      const vw = { aa: 0, E: 0, O: 0, U: 0 }; vw[st.vowel] = open;
      w[9] = vw.aa * 0.8; w[10] = vw.E * 0.75; w[11] = vw.O * 0.8; w[12] = vw.U * 0.7;
      w[13] = st.pp * Math.max(0, 1 - st.syl * 4) * (typing ? 0.7 : 0);                  // viseme_PP (the lips meet as the syllable starts)
      setShapes(w);
      // ---- the eyes' bones: the clip's pose kept, the turn laid over it
      if (eyes.length && headB && head) {
        headB.updateWorldMatrix(true, true);
        headB.getWorldQuaternion(q0);
        const f = v1.copy(head.fwd).applyQuaternion(q0), u = v2.copy(head.up).applyQuaternion(q0);
        const r = new T.Vector3().crossVectors(u, f);
        // (the way the eyes look, in the world: the head's ahead turned by the gaze's yaw and pitch)
        const dir = new T.Vector3().copy(f).multiplyScalar(Math.cos(st.gy) * Math.cos(st.gp)).addScaledVector(r, Math.sin(st.gy) * Math.cos(st.gp)).addScaledVector(u, Math.sin(st.gp)).normalize();
        for (const e of eyes) {
          e.raw.copy(e.b.quaternion);
          e.b.getWorldQuaternion(q1);
          const now = new T.Vector3().copy(e.fwd).applyQuaternion(q1);
          q2.setFromUnitVectors(now, dir).multiply(q1); // (the eye's turn in the world)
          e.b.parent.getWorldQuaternion(q1);
          e.b.quaternion.copy(q1.invert().multiply(q2));
          e.b.updateMatrixWorld(true);
          e.laid.copy(e.b.quaternion); e.has = true;
        }
      }
    }
    return {
      before, after, rest, meshes, eyes: eyes.map(e => e.b),
      get active() { return st.active; },
      get state() { return { blink: st.blink, gaze: [st.gy, st.gp], open: st.open, shapes: Object.fromEntries(SHAPES.map((k, i) => [k, +st.shapes[i].toFixed(3)])) }; },
    };
  }
  return { attach, prepare, moodOf, SHAPES };
})();
