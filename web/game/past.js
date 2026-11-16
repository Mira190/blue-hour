// What only the camera sees. The story's camera sees the evening it was loaded for: through its finder, a thing of
// that year that is gone from the street stands where it stood (a pillar box, a shoeshine boy's stool, the river open
// under its bridge), in the tones of an old print, and outside the finder's bright lines there is only tonight. Each
// is what a frame's photograph is of.
//
// The things are models (blender/build_past.py, assets/past/past.glb; what they are drawn from: docs/PAST.md). One
// material draws them all: it throws away every fragment outside a rectangle of the screen (the finder's, given in the
// picture's own -1..1 so that it holds at any render size), and none at all while the camera is down.
//   relic(model, at, heading, { scale, over })   at: a THREE.Vector3; over: drawn through what has been built where it
//                                                stood; returns { remove(), shown }
//   rect([x0, y0, x1, y1] | null)                the finder's rectangle, or null: the camera is down
//   whole(on)                                    the whole picture is the finder's (the photograph being taken)
//
// The look of the past is one look, a silver print's: warm grey tones with a little of the colour left in them,
// blacks lifted to the paper's, a fine grain that lives, and a soft light round each form's edge. A thing forms the
// first time it is inside the finder's lines: out of grain and light into the solid in 0.8 s (REVEAL_MS).
'use strict';
window.OEPast = (function () {
  const REVEAL_MS = 800;
  function create({ THREE, world }) {
    let kit = null;
    const U = { uPast: { value: new THREE.Vector4(1, 1, -1, -1) }, uT: { value: 0 } }, keep = new THREE.Vector4(1, 1, -1, -1);
    const waiting = [], live = new Set();
    // (two files: the things of the other year, and tonight's own set dressing, which is always seen: `set`)
    let pending = 2; const got = {};
    for (const file of ['assets/past/past.glb', 'assets/story/set.glb']) new THREE.GLTFLoader().load(file, gl => {
      gl.scene.updateMatrixWorld(true);
      gl.scene.traverse(o => { if (o.isMesh) { got[o.name] = o.geometry.clone().applyMatrix4(o.matrixWorld); got[o.name].computeBoundingSphere(); } });
      if (!--pending) { kit = got; waiting.splice(0).forEach(f => f()); }
    }, undefined, e => { console.warn(`${file} is unavailable:`, e); if (!--pending) { kit = got; waiting.splice(0).forEach(f => f()); } });
    // A thing of that year is a thing: it stands on the ground with its shadow under it, the people of tonight who
    // stand in front of it hide it as they would hide anything, and it is lit as a lamp over that street would have
    // lit it (tonight's light is not its light), so that its form is seen. Only what stood where something has since
    // been built (a dome inside a tower, a river under a street: `over`) is drawn through what is there now: its depth
    // is laid just past the near plane, in its own order, so that it hides itself as a solid does and tonight hides
    // none of it.
    const make = (over, set) => {
      const own = { uReveal: { value: set ? 1 : 0 }, uTone: { value: set ? 0 : 1 }, uOver: { value: over ? 1 : 0 } };
      const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: over ? 0.86 : 1 });
      m.customProgramCacheKey = () => 'past';
      m.onBeforeCompile = sh => {
        sh.uniforms.uPast = set ? { value: new THREE.Vector4(-1, -1, 1, 1) } : U.uPast; // (tonight's own things are seen with or without the camera)
        Object.assign(sh.uniforms, own, { uT: U.uT });
        sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec4 vPastClip; uniform float uOver;\nfloat pastZ(float d) { return (projectionMatrix[2][2] * -d + projectionMatrix[3][2]) / d; }\nvoid main() {')
          .replace('#include <project_vertex>', '#include <project_vertex>\n vPastClip = gl_Position;\n if (uOver > 0.5) gl_Position.z = mix(pastZ(0.32), pastZ(0.6), clamp(-mvPosition.z / 4000.0, 0.0, 1.0)) * gl_Position.w;');
        sh.fragmentShader = sh.fragmentShader.replace('void main() {', `uniform vec4 uPast; uniform float uReveal, uTone, uT; varying vec4 vPastClip;
float pastHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() { vec2 nd = vPastClip.xy / vPastClip.w; if (nd.x < uPast.x || nd.x > uPast.z || nd.y < uPast.y || nd.y > uPast.w) discard;
 float pastGrain = pastHash(floor(gl_FragCoord.xy / 1.5)); if (pastGrain > uReveal * 1.3) discard;`) // (it forms out of grain: more of its points each frame of the reveal)
          // its own light: a key from above and a little to one side, a fill from the other, and a floor so that no face is black
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
 vec3 pastN = normalize(normal);
 float pastKey = max(dot(pastN, normalize((viewMatrix * vec4(0.35, 0.85, 0.4, 0.0)).xyz)), 0.0), pastFill = max(dot(pastN, normalize((viewMatrix * vec4(-0.6, 0.25, -0.5, 0.0)).xyz)), 0.0);
 totalEmissiveRadiance += diffuseColor.rgb * (0.36 + 0.72 * pastKey + 0.2 * pastFill);
 float pastRim = pow(1.0 - abs(dot(pastN, normalize(vViewPosition))), 2.5);`)
          // a silver print's tones: most of the colour gone to a warm grey, the blacks lifted to the paper's, a light round
          // the edges, a grain that moves; and while it forms, a glow it comes out of
          .replace('#include <dithering_fragment>', `#include <dithering_fragment>
 vec3 pastC = gl_FragColor.rgb; float pastL = dot(pastC, vec3(0.3, 0.59, 0.11));
 vec3 pastP = mix(vec3(0.075, 0.064, 0.052), vec3(1.02, 0.94, 0.8), smoothstep(-0.05, 1.0, pastL));
 pastC = mix(pastC, mix(pastP, pastP * (0.7 + 0.6 * pastC / max(pastL, 0.02)), 0.35), 0.82 * uTone);
 pastC += vec3(1.0, 0.9, 0.74) * pastRim * 0.3 * uTone;
 pastC += (pastHash(gl_FragCoord.xy + floor(uT * 24.0) * vec2(17.0, 31.0)) - 0.5) * 0.07 * uTone;
 pastC = mix(vec3(1.0, 0.93, 0.8) * (0.6 + pastGrain * 0.6), pastC, smoothstep(0.35, 1.0, uReveal));
 gl_FragColor.rgb = pastC;`);
      };
      m.userData.own = own;
      return m;
    };
    const setMat = make(false, true);
    const at = new THREE.Vector3(), ORIGIN = new THREE.Vector3();
    function relic(model, pos, heading = 0, { scale = 1, over = false, set = false } = {}) {
      const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = heading; g.scale.setScalar(scale); // (heading: radians anticlockwise from the model's own axes, which are the map's: +x east, +y north)
      const mat = set ? setMat : make(over, false), one = { shown: set, t0: set ? -1e9 : null };
      const put = () => {
        if (!kit[model]) return console.warn(`No thing of the other year called ${model}`);
        const m = new THREE.Mesh(kit[model], mat); m.frustumCulled = false; m.renderOrder = over ? 40 : 2;
        // it forms the first time the camera is up and it is inside the lines
        if (!set) m.onBeforeRender = (r, s, cam) => {
          const now = performance.now(); U.uT.value = now / 1000;
          // (its middle or its own origin, the point a frame aims at: a river's middle can be beside the one who looks along it)
          if (one.t0 == null && U.uPast.value.x < U.uPast.value.z) for (const p of [kit[model].boundingSphere.center, ORIGIN]) {
            at.copy(p).applyMatrix4(m.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
            const front = at.z < 0, q = U.uPast.value;
            at.applyMatrix4(cam.projectionMatrix);
            if (front && at.x > q.x && at.x < q.z && at.y > q.y && at.y < q.w) { one.t0 = now; break; }
          }
          const k = one.t0 == null ? 0 : Math.min(1, (now - one.t0) / REVEAL_MS);
          mat.userData.own.uReveal.value = k; one.shown = k >= 1;
        };
        g.add(m);
      };
      if (kit) put(); else waiting.push(put);
      world.add(g); live.add(one);
      return { remove() { world.remove(g); live.delete(one); }, get shown() { return one.shown; } };
    }
    return {
      relic,
      rect(r) { if (r) keep.set(r[0], r[1], r[2], r[3]); else keep.set(1, 1, -1, -1); U.uPast.value.copy(keep); },
      whole(on) { if (on) { U.uPast.value.set(-1, -1, 1, 1); live.forEach(o => { o.t0 = -1e9; }); } else U.uPast.value.copy(keep); }, // (the photograph has it whole)
    };
  }
  return { create };
})();
