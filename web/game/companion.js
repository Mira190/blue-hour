// A four-legged guide: an animal that goes ahead of the player to where a story wants them, waits when they fall
// behind, comes back for them when they stray, and sits where the way ends. Nothing here names a map or a story: the
// model is a file with the clips `idle`, `walk`, `trot` and `sit` on the spot (blender/build_dog.py's Akita), and
// whoever makes one says where it stands and where it leads (story.js, from a map's data).
//
//   const dog = OECompanion.create({ url, world, W, ground(x, y, z) -> the floor there near z, player, people(x, y, r) -> [[x, y], ...], speeds: { walk, trot, run },
//                                     held() -> true while the world stands still (its people do not move: a way is planned round them) });
//   dog.place(x, y, facing)       where it stands (it is drawn once its model has loaded)
//   dog.lead([x, y], reach)       goes to the player first, then ahead of them to the place, and sits there
//   dog.go([x, y], look, speed)   goes there by itself and sits, looking at `look` ([x, y, z]) if given (at `speed`, else a trot)
//   dog.call()                    comes back to the player now (he is out of their sight: an arrow to him would point at a wall)
//   dog.met()                     he has been met (a film showed him coming to the player): he leads at once, without greeting
//   dog.leave([x, y], done)       runs off there, fading, and is taken away
//   dog.heel()                    walks at the player's side, a pace behind, until it is sent somewhere
//   dog.aboard(on)                in with the player (a story's helicopter): not seen, and at their heels again once out
//   dog.tick(dt)                  every frame (its own time: a stopped world's guide still moves)
//   dog.x, dog.y, dog.z, dog.to (where it is going, or null), dog.state ('away' | 'greet' | 'lead' | 'wait' | 'fetch' | 'go' | 'sit' | 'leave'), dog.ready
'use strict';
window.OECompanion = (function () {
  const AHEAD = 3.4;   // it leads from about this far in front of someone standing, and further in front of someone running
  const FAR = 6.5;      // further than this from the player and it stops to wait
  const LOST = 12;     // and after a while further than this, it comes back for them
  const CLEAR = 1.1;   // it keeps this far from someone standing in its way
  const CATCH = 35;    // left further behind than this (a ride, a lift), it is found at the player's heels again
  const EDGE_KEEP = 0.9; // and where he leads, how far off the edge of the way he bears away from it
  const PASS_ROOM = 0.9; // the room he wants beyond himself, on the side he passes the player on
  // His body and the player's never share ground. He is a spine along his length and half his width either side of it
  // (a capsule); the player a walker's circle with their arms' swing in it (game.js: 0.35). The capsule is measured from
  // the model itself as it loads (its bounds in its own frame, at its scale: it looks along +x), so another dog, or any
  // animal, is held off the player by its own size. Until then, the Akita's (blender/build_dog.py: 0.52 m behind where
  // he stands to 0.72 m in front)
  const SPINE = [-0.33, 0.53], FLANK = 0.19, PLAYER_R = 0.35;
  const THIN_PX = 0.6; // a strand thin() draws is never narrower than this many pixels either side of its middle

  // His whiskers (any strand a fraction of a pixel across): drawn at least a pixel wide, as faint as the part of that
  // pixel they really cover ("phone-wire anti-aliasing", Emil Persson, 2011: the method, no code). Without
  // multisampling, as a phone draws, a strand narrower than a pixel falls between the pixels' centres and comes out as
  // broken dark dots: his cheeks were speckled on an iPhone and clean on a desktop (November 2026). A strand is a tube
  // of rings of three (blender/build_dog.py muzzle_whiskers); each vertex's ring is the two vertices nearest it (a ring
  // is a fraction of a millimetre across, the rings a centimetre apart along it), and its offset from the ring's middle
  // is what the vertex shader stretches, after the skin has posed it, until the tube is THIN_PX either side.
  function thin(o) {
    const g = o.geometry, P = g.attributes.position, n = P.count, off = new Float32Array(n * 3);
    const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
    for (let i = 0; i < n; i++) { X[i] = P.getX(i); Y[i] = P.getY(i); Z[i] = P.getZ(i); }
    for (let i = 0; i < n; i++) {
      let a = i, b = i, da = Infinity, db = Infinity;
      for (let j = 0; j < n; j++) {
        const d = (X[j] - X[i]) ** 2 + (Y[j] - Y[i]) ** 2 + (Z[j] - Z[i]) ** 2;
        if (d < 1e-16) continue; // (itself, or a copy of it where the file split a vertex)
        if (d < da) { db = da; b = a; da = d; a = j; } else if (d < db) { db = d; b = j; }
      }
      off[3 * i] = X[i] - (X[i] + X[a] + X[b]) / 3; off[3 * i + 1] = Y[i] - (Y[i] + Y[a] + Y[b]) / 3; off[3 * i + 2] = Z[i] - (Z[i] + Z[a] + Z[b]) / 3;
    }
    g.setAttribute('thinOff', new THREE.BufferAttribute(off, 3));
    const m = o.material, U = { thinH: { value: 1 } }, before = m.onBeforeCompile, vp = new THREE.Vector4();
    o.onBeforeRender = r => { r.getCurrentViewport(vp); U.thinH.value = vp.w; }; // (the height drawn to, in pixels)
    o.castShadow = false; // (a fraction of a texel of the shadow map: speckles on the cheek under it)
    Object.assign(m, { transparent: true, depthWrite: false });
    m.userData.thin = true;
    m.customProgramCacheKey = () => 'oe-thin';
    m.onBeforeCompile = (sh, r) => {
      if (before) before(sh, r);
      sh.uniforms.thinH = U.thinH;
      sh.vertexShader = 'attribute vec3 thinOff;\nuniform float thinH;\nvarying float vThinCover;\n' + sh.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>
	{
		vec3 tOff = thinOff;
		#ifdef USE_SKINNING
			tOff = ( bindMatrixInverse * ( skinWeight.x * boneMatX + skinWeight.y * boneMatY + skinWeight.z * boneMatZ + skinWeight.w * boneMatW ) * bindMatrix * vec4( tOff, 0.0 ) ).xyz;
		#endif
		vec3 tMid = transformed - tOff;
		float tDepth = max( 1e-4, -( modelViewMatrix * vec4( tMid, 1.0 ) ).z );
		float tPx = length( ( modelViewMatrix * vec4( tOff, 0.0 ) ).xyz ) * projectionMatrix[ 1 ][ 1 ] * 0.5 * thinH / tDepth;
		transformed = tMid + tOff * max( 1.0, ${THIN_PX.toFixed(2)} / max( tPx, 1e-6 ) );
		vThinCover = min( 1.0, tPx / ${THIN_PX.toFixed(2)} );
	}`);
      sh.fragmentShader = 'varying float vThinCover;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n\tdiffuseColor.a *= vThinCover;');
    };
    m.needsUpdate = true;
  }
  // route(x, y, z, tx, ty) -> [[x, y, z], ...] | null: the way on foot (route.js ways.walk), so that it leads along the
  // footways and over the crossings and not in a straight line into a wall
  // edge(x, y, z, fromX, fromY): is that past the edge of the way (a wall, a drop, a well, the carriageway beyond a kerb,
  // a post: route.js ways.edge), for him where he stands: where he passes the player, he keeps a body's width inside it
  // slide(x, y, z, dx, dy) -> {x, y}: a step as the walker takes it, along a wall and round a post (nav.slide), so that it
  // never goes through a fence, a rail or a belt; stand(x, y, z): may a walker stand there
  // The pace is the player's. A player runs at 6 m/s unless they choose to walk (game.js GAIT), and a guide that led at a
  // walk or a trot was overtaken at every step: he was behind them, the arrow to him pointed back at their feet, and he
  // stood waiting for someone who was ahead of him. So he keeps a gap in front that grows with their speed, at their
  // speed (a gallop when they run), stops and looks back when they stop, and when they are further along the way than
  // he is, runs to be in front again
  // A stopped world's people do not move (held()): they are a field of posts, and the way through them is planned once on
  // a grid (GRID m cells, each person a disc of BODY m he may not enter and ROOM m he would rather not), so that he goes
  // between them where there is room and round the edge of the crowd where there is not. Pushing off each one in turn
  // got him nowhere in a crowd shoulder to shoulder, and after a second he went through their coats
  const GRID = 0.35, BODY = 0.5, ROOM = 1.15, SPAN = 26;
  function create({ url, world, W, ground, player, people = null, route = null, slide = null, stand = null, edge = null, wall = null, held = null, speeds = { walk: 0.95, trot: 2.3, run: 6 }, height = 1, lean = false, eye = null }) {
    const RUN = speeds.run || speeds.trot * 2.6;
    const root = new THREE.Group();
    root.visible = false;
    world.add(root);
    // a pale ring on the ground under it while it leads: where the guide is, seen over a crowd's heads from behind
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 40), new THREE.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.renderOrder = 20; ring.frustumCulled = false;
    root.add(ring);
    const s = { x: 0, y: 0, z: 0, h: 0, state: 'away', ready: false, to: null, reach: 3, look: null, done: null, t: 0, speed: 0, fade: 1, greeted: false };
    let mixer = null, acts = {}, cur = '', head = null, neck = null, mats = [], soles = []; // (soles: the paws' points of skin, onSoles)
    const bones = [];
    // his body as the model has it: the capsule's spine (metres along his heading from where he stands), its radius, and
    // how far any of him reaches from where he stands (what game.js keeps off posts, belts and cars)
    const body = { spine: [SPINE[0] * height, SPINE[1] * height], flank: FLANK * height, reach: Math.max(0.52, 0.72) * height };
    new THREE.GLTFLoader().load(url, g => {
      const m = g.scene;
      m.scale.setScalar(height);
      m.traverse(o => {
        if (o.isBone) bones.push(o); // (every bone of him: keepOff holds each off the player as the clip and his look pose it)
        if (o.isBone && o.name === 'head') head = o;
        if (o.isBone && o.name === 'neck') neck = o;
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
        // (it carries a little light of its own, as whoever moves in a stopped world does: a dark coat on a wet night
        // street is not lost among the people standing in it)
        o.material.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * 0.3;'); };
        if (/whisker/i.test(o.material.name || '')) thin(o);
        mats.push(o.material);
      });
      // (his size from the model's own bounds: the length along +x, the width across it; the head and the tail are the
      // capsule's rounded ends)
      m.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(m);
      if (!bb.isEmpty() && bb.max.x - bb.min.x > 0.1) {
        const half = Math.max(0.05, (bb.max.z - bb.min.z) / 2), a0 = bb.min.x + half, a1 = Math.max(a0, bb.max.x - half);
        Object.assign(body, { spine: [a0, a1], flank: half, reach: Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), half) });
      }
      // (his vertices at the size the picture needs, verts.js: 1.9 MB of his 6.3)
      if (window.OEVerts) OEVerts.leanObject(m, { normal: 'unit8', skinWeight: 'unorm16', color: 'unorm8' });
      root.add(m);
      // (he is no roof to the rain's map of what is under cover, any more than a person is: people.js uncovered. Drawn into
      // it he was 55,000 triangles of a 128-pixel map each time it was made, and left a dry patch where he had sat)
      if (window.OEPeople && OEPeople.uncovered) OEPeople.uncovered.push(m);
      if (lean) leanBody(m);
      soles = solesOf(m); // (points of the skin by their vertices: the lean index draws the same ones)
      mixer = new THREE.AnimationMixer(m);
      for (const c of g.animations) acts[c.name] = mixer.clipAction(c);
      s.ready = true;
      play('idle', 0);
      root.visible = s.state !== 'away';
    }, null, e => console.warn('The guide\'s model did not load:', e));
    // A phone (lean): his body in the lighter index over the same vertices (pipeline/lod_index.mjs: 20,000 triangles of
    // 90,000, within a thousandth of his size), and the guard hairs' cards (31,500 triangles) drawn only within COAT_M
    // of the camera, where a phone's screen can show a hair; past it the coat's own picture is the coat. 125,000
    // triangles of a phone's frame were this one animal.
    const COAT_M = 7;
    let coat = null;
    function leanBody(m) {
      m.traverse(o => { if (o.isMesh && /guard|outer/i.test(`${o.name} ${(o.material && o.material.name) || ''}`)) coat = o; });
      fetch(url.replace(/\.glb$/, '.lod.json')).then(r => (r.ok ? r.json() : null)).then(L => {
        if (!L) return;
        for (const part of Object.values(L.parts || {})) m.traverse(o => {
          const g = o.isMesh && o.geometry;
          if (!g || g.userData.lean || !g.index || g.attributes.position.count !== part.vertices) return; // (a model built again without its index: drawn whole)
          const b = Uint8Array.from(atob(part.index), c => c.charCodeAt(0)).buffer, I = part.bits === 16 ? new Uint16Array(b) : new Uint32Array(b);
          g.dispose(); // (what the GPU held of the whole body, if he was drawn before the index came)
          g.setIndex(new THREE.BufferAttribute(I, 1)); g.userData.lean = true;
          if (window.OEVerts) OEVerts.compact(g); // (and only the vertices the lighter index uses)
        });
      }).catch(() => {}); // (no index: drawn whole)
    }
    function play(name, fade = 0.3) {
      if (!acts[name] || cur === name) return;
      const a = acts[name];
      a.reset().setEffectiveWeight(1).play();
      if (cur && acts[cur]) acts[cur].crossFadeTo(a, fade, false); else a.fadeIn(fade);
      cur = name;
    }
    const dist = (x, y) => Math.hypot(x - s.x, y - s.y);
    const turn = (to, rate, dt) => { let d = to - s.h; d = Math.atan2(Math.sin(d), Math.cos(d)); s.h += Math.sign(d) * Math.min(Math.abs(d), rate * dt); return Math.abs(d); };
    // a step towards a point at a speed, turning as it goes (slower through a sharp turn)
    function move(tx, ty, speed, dt) {
      const d = dist(tx, ty);
      if (d < 0.05) { s.speed = 0; return 0; }
      // round whoever stands in the way: pushed off each one within reach, and along them on the side it is already passing
      let vx = (tx - s.x) / d, vy = (ty - s.y) / d;
      const near = s.det ? [] : people && d > 1 && !(s.thru > 0) ? people(s.x, s.y, CLEAR) : [];
      if (s.state === 'lead' || s.state === 'heel') near.push([player.x, player.y]); // (and round the player, whom he passes when they are ahead)
      for (const q of near) {
        const ox = s.x - q[0], oy = s.y - q[1], od = Math.hypot(ox, oy);
        if (od < 0.05 || od > CLEAR) continue;
        const k = (CLEAR - od) / CLEAR, side = Math.sign(ox * vy - oy * vx) || 1;
        vx += (ox / od) * k * 1.0 + (oy / od) * side * k * 1.3; vy += (oy / od) * k * 1.0 - (ox / od) * side * k * 1.3;
      }
      // (and off the edge of the way he is beside, leading: a wall, a kerb, a well within EDGE_KEEP of his flank, and none on
      // the other, and he bears away from it; pushed round the crowd and the player he ran along the kerb at Hachiko)
      if (edge && s.state === 'lead') {
        const vl = Math.hypot(vx, vy) || 1, lx = -vy / vl, ly = vx / vl;
        const L = edge(s.x + lx * EDGE_KEEP, s.y + ly * EDGE_KEEP, s.z, s.x, s.y), R = edge(s.x - lx * EDGE_KEEP, s.y - ly * EDGE_KEEP, s.z, s.x, s.y);
        if (L !== R) { const k = L ? -0.8 : 0.8; vx = vx / vl + lx * k; vy = vy / vl + ly * k; }
      }
      const off = turn(Math.atan2(vy, vx), 5.5, dt);
      const v = speed * Math.max(0.25, 1 - off / 1.6);
      const step = Math.min(d, v * dt), dx = Math.cos(s.h) * step, dy = Math.sin(s.h) * step;
      if (slide) { const m = slide(s.x, s.y, s.z, dx, dy); s.x = m.x; s.y = m.y; } else { s.x += dx; s.y += dy; }
      s.speed = v;
      // a crowd shoulder to shoulder is a wall to this: when it has got nowhere for a second it goes through, as an
      // afterimage may (better seen passing through a coat than left behind a queue)
      if (s.thru > 0) s.thru -= dt;
      s.gain = (s.gain || 0) + (d - Math.hypot(tx - s.x, ty - s.y)); s.gainT = (s.gainT || 0) + dt;
      // (on a way planned round the people of a stopped world he goes through nobody: held up there, the way is planned again)
      if (s.gainT > 1) { if (s.gain < 0.35 * Math.min(speed, speeds.trot)) { s.held = (s.held || 0) + 1; if (s.det) { s.det = null; if (s.held > 3) s.thru = 1.5; } else s.thru = 2.5; if (s.to) replan(); } else s.held = 0; s.gain = 0; s.gainT = 0; } // (held up: through the crowd, never a wall; and the way again from here)
      return d - step;
    }
    // (whether his whole body has room at (x, y) facing h: both ends of him clear of every wall)
    const fits = (x, y, h) => !wall || body.spine.every(a => !wall(x + Math.cos(h) * a, y + Math.sin(h) * a, s.z, body.flank));
    // A turn he makes standing still, only where his body has room for it (issue 182). Sitting at the roof's glass
    // and facing the relic beyond it, or at heel facing the way you face, put his nose through the pane: the walls
    // pushed him off, and he turned back in, every frame of frame 4's Stop and after it. What he would face is kept
    // (s.want), so that when he has to step off a wall he steps to where he can face it.
    const turnStill = (to, rate, dt) => { s.want = to; const h0 = s.h, d = turn(to, rate, dt); if (wall && s.h !== h0 && !fits(s.x, s.y, s.h) && fits(s.x, s.y, h0)) s.h = h0; return d; };
    const face = (x, y, dt) => turnStill(Math.atan2(y - s.y, x - s.x), 4, dt);
    // The player's body has the right of way over his. Each frame, whatever he is doing (leading, at heel, sitting
    // where the picture is taken from, standing where he was put), if the player's circle reaches his spine he is moved
    // off it at once, along the way out from them (as a walker steps, never into a wall); and when he was sitting or
    // standing he gets up, walks a pace aside, out of the way they are going, and sits again looking where he looked.
    // He was steered round the player only while he led or kept at heel, as a pull on his way, and never stood off
    // them at all: the player walked through him where he sat beside the camera's light, and he through their legs.
    // Where a wall holds him and he cannot go, `jammed` says so, and the player stops at his flank (game.js).
    // The rule, where he is pushed against a wall with nowhere to make way (issues 133 and 138): neither body enters
    // the other. His capsule (his spine and his flank) and the player's circle may touch and never overlap: whatever
    // of the push the wall kept from him, the player is stopped short by, in the same frame, and a step or a turn
    // of his own that would end inside the player's circle with the wall still holding him is not taken (tick).
    // He was let 3 cm into the player before he said he was held, and walked or turned further in on his own tick:
    // the check's margin was that same 3 cm, so a run passed or failed by where the crowd he plans round stood.
    const TOUCH = 0.002; // (m: what two bodies set down against each other may differ by, the solver's own)
    // ... and his body off the walls, both ends of it (issue 157). A walker's circle is at his middle, and where he was
    // put, or sat down, with his length across a wall's line, his nose or his rump stood up to 25 cm inside it: the
    // roof's glass for the whole of frame 4's Stop. wall(x, y, z, r) is where a circle of his flank's radius there is
    // pushed to, or nothing where it stands clear (nav.push, as the clip probe asks). He is moved by what his two ends
    // are pushed, all of it at once; and where a wall holds each end
    // from a different side (a corner, a gap narrower than he is long) he turns along it instead.
    function wallsOff(dt) {
      if (!wall) return;
      const hx = Math.cos(s.h), hy = Math.sin(s.h);
      let mx = 0, my = 0, n = 0, against = false;
      for (const a of body.spine) {
        const ex = s.x + hx * a, ey = s.y + hy * a, w = wall(ex, ey, s.z, body.flank);
        if (!w) continue;
        const dx = w.x - ex, dy = w.y - ey;
        if (dx * dx + dy * dy < 1e-4) continue;
        if (n && mx * dx + my * dy < 0) against = true;
        mx += dx; my += dy; n++;
      }
      if (!n) { s.wallT = 0; return; }
      s.wallT = (s.wallT || 0) + Math.max(dt, 1 / 60);
      // (still in it after half a second, held there by the player, a corner or his own turn: the nearest place and
      // heading round him where both ends stand clear of every wall and he is off the player, and he steps there)
      if (s.wallT > 0.5) {
        const x0 = s.x, y0 = s.y, h0 = s.h, clear = () => body.spine.every(a => !wall(s.x + Math.cos(s.h) * a, s.y + Math.sin(s.h) * a, s.z, body.flank)) && offPlayer() >= -TOUCH;
        // (first where he can face what he was facing, s.want, so that his next turn does not take him back in; then
        // any way round)
        const any = [h0, h0 + Math.PI / 2, h0 - Math.PI / 2, h0 + Math.PI];
        for (const hs of s.want != null ? [[s.want], any] : [any]) for (let r = 0.1; r <= 1.5; r += 0.1) for (let k = 0; k < 12; k++) for (const hh of hs) {
          const a = k * Math.PI / 6;
          s.x = x0 + Math.cos(a) * r; s.y = y0 + Math.sin(a) * r; s.h = hh;
          if ((!stand || stand(s.x, s.y, s.z)) && clear()) { s.wallT = 0; return; }
        }
        s.x = x0; s.y = y0; s.h = h0; s.wallT = 0.25; // (nowhere near: tried again in a quarter of a second)
        return;
      }
      if (against) { s.h += Math.min(1, dt * 2); return; }
      // (the whole of the push, in one frame. It was a pace a second, to be seen to shift rather than jump, and he trots
      // at 2.3: walking on into the glass after frame 4's photograph he went in faster than he was pushed out, and stood
      // 11 to 13 cm in it on a machine whose frames are slow, main's checks, issue 157)
      s.x += mx; s.y += my;
    }
    function spineNear(px, py) {
      const hx = Math.cos(s.h), hy = Math.sin(s.h), a0 = body.spine[0], a1 = body.spine[1];
      const t = Math.max(a0, Math.min(a1, (px - s.x) * hx + (py - s.y) * hy));
      return [s.x + hx * t, s.y + hy * t];
    }
    // (and each bone of him, as the last frame posed it, against the player's circle and the flesh round a bone: his
    // head turned to look at them reached out of the capsule's side, and his nose went into their legs. Any skinned
    // model has bones, so this holds for whatever animal stands in for the Akita. True where a wall held him there)
    const v3 = new THREE.Vector3();
    function bonesOff(px, py) {
      if (!bones.length) return false;
      const re = root.matrixWorld.elements, flesh = Math.max(0.08, Math.min(0.15, body.flank * 0.6)), need = PLAYER_R + flesh;
      let worst = 0, wx = 0, wy = 0;
      for (const b of bones) {
        const e = b.matrixWorld.elements, ox = e[12] - re[12], oy = -(e[14] - re[14]);
        if (e[13] - re[13] > 1.7) continue;
        const dx = s.x + ox - px, dy = s.y + oy - py, d = Math.hypot(dx, dy) || 1e-3;
        if (need - d > worst) { worst = need - d; wx = dx / d; wy = dy / d; }
      }
      if (worst <= 0) return false;
      const mx = wx * (worst + 0.01), my = wy * (worst + 0.01), x0 = s.x, y0 = s.y;
      if (slide) { const m = slide(s.x, s.y, s.z, mx, my); s.x = m.x; s.y = m.y; } else { s.x += mx; s.y += my; }
      return Math.hypot(s.x - x0, s.y - y0) < 0.5 * Math.hypot(mx, my);
    }
    // how far his capsule is off the player's circle now (m, less than nothing inside it; a floor apart or the player not on foot: far)
    function offPlayer() {
      if ((player.mode && player.mode !== 'foot') || (player.z != null && Math.abs((s.z ?? player.z) - player.z) > 1.5)) return Infinity;
      const [cx, cy] = spineNear(player.x, player.y);
      return Math.hypot(cx - player.x, cy - player.y) - (PLAYER_R + body.flank);
    }
    function keepOff(dt) {
      s.jam = false;
      if (player.mode && player.mode !== 'foot') return;
      if (player.z != null && Math.abs((s.z ?? player.z) - player.z) > 1.5) return; // (a floor above or below)
      const px = player.x, py = player.y, need = PLAYER_R + body.flank;
      const [cx, cy] = spineNear(px, py);
      let dx = cx - px, dy = cy - py, d = Math.hypot(dx, dy);
      if (d >= need) { s.jam = bonesOff(px, py); return; } // (his capsule clear of them: his bones, a turned head, may not be)
      if (d < 1e-3) { const h = player.h || 0; dx = Math.cos(h); dy = -Math.sin(h); d = 1; } // (right on them: off to their right)
      const k = (need - d + 0.01) / d, mx = dx * k, my = dy * k, x0 = s.x, y0 = s.y;
      if (slide) { const m = slide(s.x, s.y, s.z, mx, my); s.x = m.x; s.y = m.y; } else { s.x += mx; s.y += my; }
      // (along a wall that holds him: round the player's other side of him, then nothing more)
      if (Math.hypot(s.x - x0, s.y - y0) < 0.5 * Math.hypot(mx, my)) {
        const sx = -my, sy = mx;
        for (const g of [1, -1]) { if (!slide) break; const m = slide(s.x, s.y, s.z, sx * g, sy * g); if (Math.hypot(m.x - s.x, m.y - s.y) > 0.5 * Math.hypot(mx, my)) { s.x = m.x; s.y = m.y; break; } }
      }
      const [qx, qy] = spineNear(px, py); s.jam = Math.hypot(qx - px, qy - py) < need - TOUCH;
      if (bonesOff(px, py)) s.jam = true;
      // (sitting, standing or waiting where he was: up, a pace aside out of the way they are going, and down again)
      // (not for a brush, where he only shifts: the film of him coming sits him close beside you)
      if ((s.state === 'sit' || (s.state === 'go' && s.to && dist(s.to[0], s.to[1]) < 0.4)) && !s.jam && need - d > 0.08) {
        const h = player.h || 0, fx = Math.sin(h), fy = Math.cos(h), side = Math.sign((s.x - px) * fy - (s.y - py) * fx) || 1;
        for (const r of [1.1, 1.5, 0.8]) for (const sd of [side, -side]) {
          const qx2 = px + fy * sd * r + fx * 0.3, qy2 = py - fx * sd * r + fy * 0.3;
          if (stand && !stand(qx2, qy2, s.z)) continue;
          const keep = s.look || [px, py, (player.z || 0) + 1.5];
          s.to = [qx2, qy2]; s.look = keep; s.goV = speeds.walk; s.state = 'go'; s.t = 0; s.det = null; s.yielded = (s.yielded || 0) + 1;
          return;
        }
      }
    }
    // the way to s.to, and the next point along it to make for (the place itself when there is no way)
    function replan() { s.path = route && s.to ? route(s.x, s.y, s.z, s.to[0], s.to[1]) : null; s.pi = 0; s.det = null; }
    // the next point to make for, along the way, and round whoever stands still in it
    function next() {
      const w = onWay();
      if (!held || !held() || !people || !w) return w;
      const D = s.det;
      if (D && D.sticky) { const q = step(D); if (q) return q; }
      const P = s.path, far = P && P.length > 1 ? ahead(SPAN) : s.to; // (planned a stretch at a time: the next SPAN m)
      s.det = plan(far[0], far[1], true);
      return s.det ? step(s.det) || far : w;
    }
    // (towards a place that is not on the way, the player or where he is sent: planned again when it moves)
    function through(tx, ty) {
      if (!held || !held() || !people || Math.hypot(tx - s.x, ty - s.y) < 0.8) { s.det = null; return [tx, ty]; }
      const D = s.det;
      if (D && !D.sticky && Math.hypot(D.tx - tx, D.ty - ty) < 1.5) { const q = step(D); if (q) return q; }
      s.det = plan(tx, ty, false);
      return s.det ? step(s.det) || [tx, ty] : [tx, ty];
    }
    // a planned way's next point (null at its end)
    function step(D) {
      while (D.i < D.pts.length && dist(D.pts[D.i][0], D.pts[D.i][1]) < (D.i === D.pts.length - 1 ? 0.35 : 0.7)) D.i++;
      return D.i < D.pts.length ? D.pts[D.i] : null;
    }
    // the point SPAN m on along the way from where he is
    function ahead(m) {
      const P = s.path; let i = Math.max(1, s.pi), [x, y] = [s.x, s.y], left = m;
      for (; i < P.length; i++) { const l = Math.hypot(P[i][0] - x, P[i][1] - y); if (l >= left) return [x + (P[i][0] - x) * left / l, y + (P[i][1] - y) * left / l]; left -= l; x = P[i][0]; y = P[i][1]; }
      return s.to;
    }
    // A* over the stretch from him to (tx, ty) and the ground round it; walls asked of stand() as each cell is reached.
    // Ten metres round first; where the crowd is wider than that, further round (its edge may be twenty metres off);
    // and where it closes every way, between them with less room (a body's width each), but never through anyone
    function plan(tx, ty, sticky) { return planIn(tx, ty, sticky, 10, BODY) || planIn(tx, ty, sticky, 24, BODY) || planIn(tx, ty, sticky, 24, 0.36); }
    function planIn(tx, ty, sticky, pad, body) {
      const x0 = Math.min(s.x, tx) - pad, y0 = Math.min(s.y, ty) - pad, nx = Math.ceil((Math.max(s.x, tx) + pad - x0) / GRID), ny = Math.ceil((Math.max(s.y, ty) + pad - y0) / GRID);
      if (nx * ny > 160000) return null;
      const extra = new Float32Array(nx * ny), wall = new Uint8Array(nx * ny); // (wall: 0 not asked, 1 open, 2 shut)
      const cx = x0 + nx * GRID / 2, cy = y0 + ny * GRID / 2, them = people(cx, cy, Math.max(nx, ny) * GRID / 2 + 1);
      if (s.state === 'lead' || s.state === 'heel') them.push([player.x, player.y]);
      for (const q of them) {
        if (Math.hypot(q[0] - tx, q[1] - ty) < body + 0.3) continue; // (whoever he is going to is not in his way)
        const i0 = Math.max(0, Math.floor((q[0] - ROOM - x0) / GRID)), i1 = Math.min(nx - 1, Math.floor((q[0] + ROOM - x0) / GRID));
        const j0 = Math.max(0, Math.floor((q[1] - ROOM - y0) / GRID)), j1 = Math.min(ny - 1, Math.floor((q[1] + ROOM - y0) / GRID));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const d = Math.hypot(x0 + (i + 0.5) * GRID - q[0], y0 + (j + 0.5) * GRID - q[1]), k = j * nx + i;
          if (d < body) extra[k] = Infinity; else if (d < ROOM) extra[k] += 2.5 * (ROOM - d) / (ROOM - body);
        }
      }
      const cell = (x, y) => Math.max(0, Math.min(nx - 1, Math.floor((x - x0) / GRID))) + Math.max(0, Math.min(ny - 1, Math.floor((y - y0) / GRID))) * nx;
      const open = k => { if (extra[k] === Infinity) return false; if (!wall[k]) wall[k] = !stand || stand(x0 + (k % nx + 0.5) * GRID, y0 + (Math.floor(k / nx) + 0.5) * GRID, s.z) ? 1 : 2; return wall[k] === 1; };
      const a = cell(s.x, s.y); let b = cell(tx, ty);
      if (extra[b] === Infinity) { // (the place itself among them: the nearest cell free of everyone)
        let best = Infinity;
        for (let r = 1; r < 8 && best === Infinity; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const i = (b % nx) + di, j = Math.floor(b / nx) + dj; if (i < 0 || j < 0 || i >= nx || j >= ny) continue; const k = j * nx + i; if (extra[k] !== Infinity && Math.hypot(di, dj) < best) { best = Math.hypot(di, dj); b = k; } }
      }
      const g = new Float32Array(nx * ny).fill(Infinity), from = new Int32Array(nx * ny).fill(-1), heap = [], bi = b % nx, bj = Math.floor(b / nx);
      const H = k => { const di = Math.abs(k % nx - bi), dj = Math.abs(Math.floor(k / nx) - bj); return Math.max(di, dj) + 0.4142 * Math.min(di, dj); };
      const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const u = (i - 1) >> 1; if (heap[u][0] <= heap[i][0]) break; [heap[u], heap[i]] = [heap[i], heap[u]]; i = u; } };
      const pop = () => { const top = heap[0], end = heap.pop(); if (heap.length) { heap[0] = end; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
      g[a] = 0; push(H(a), a);
      let n = 0, found = false;
      while (heap.length && n++ < 60000) {
        const [, k] = pop();
        if (k === b) { found = true; break; }
        const i = k % nx, j = Math.floor(k / nx);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
          const q = jj * nx + ii; if (q !== b && !open(q)) continue;
          if (di && dj && (!open(j * nx + ii) || !open(jj * nx + i))) continue; // (no corner cut between two)
          const c = g[k] + (di && dj ? 1.4142 : 1) * (1 + extra[q]);
          if (c < g[q]) { g[q] = c; from[q] = k; push(c + H(q), q); }
        }
      }
      if (!found) return null;
      const cells = []; for (let k = b; k !== -1; k = from[k]) cells.push(k);
      cells.reverse();
      const at = k => [x0 + (k % nx + 0.5) * GRID, y0 + (Math.floor(k / nx) + 0.5) * GRID];
      // pulled straight: from each point, to the furthest along that can be seen without crossing anyone's disc or a wall
      const clear = (p, q) => { const L = Math.hypot(q[0] - p[0], q[1] - p[1]), m = Math.ceil(L / (GRID * 0.5)); for (let u = 1; u < m; u++) { const k = cell(p[0] + (q[0] - p[0]) * u / m, p[1] + (q[1] - p[1]) * u / m); if (!open(k) || extra[k] > 1.2) return false; } return true; };
      const pts = []; let p = [s.x, s.y], i = 0;
      while (i < cells.length - 1) { let j = cells.length - 1; while (j > i + 1 && !clear(p, at(cells[j]))) j--; p = at(cells[j]); pts.push(p); i = j; }
      if (!pts.length) return null;
      if (extra[cell(tx, ty)] !== Infinity) pts[pts.length - 1] = [tx, ty]; // (and to the place itself, not the middle of its cell)
      return { pts, i: 0, tx, ty, sticky };
    }
    // the player further along the way than he is (they ran past him): each one's distance left along the way, from where
    // they stand on it (and how far off it they are)
    function onAhead() {
      const P = s.path, px = player.x, py = player.y;
      if (!s.to) return false;
      if (!P || P.length < 2) return Math.hypot(s.to[0] - px, s.to[1] - py) < dist(s.to[0], s.to[1]) - 1.5;
      const left = (x, y) => { let best = Infinity, out = Infinity, rest = 0; for (let i = P.length - 1; i > 0; i--) { const a = P[i - 1], b = P[i], ux = b[0] - a[0], uy = b[1] - a[1], L = Math.hypot(ux, uy) || 1e-9, k = Math.max(0, Math.min(1, ((x - a[0]) * ux + (y - a[1]) * uy) / (L * L))), d = Math.hypot(a[0] + ux * k - x, a[1] + uy * k - y); if (d < best - 0.01) { best = d; out = rest + L * (1 - k); } rest += L; } return [out, best]; };
      const [lp, off] = left(px, py), [ld] = left(s.x, s.y);
      return off < 8 && lp < ld - 1.5;
    }
    function onWay() {
      const P = s.path;
      if (!P || !P.length) return s.to;
      while (s.pi < P.length - 1 && dist(P[s.pi][0], P[s.pi][1]) < 1.2) s.pi++;
      // pushed off the stretch it is on (measured to the stretch, not to its far end: a straight way's next point can be
      // thirty metres on, and was taken for being lost, the way planned again from its feet, and the dog stood still)
      const a = P[Math.max(0, s.pi - 1)], b = P[s.pi], ux = b[0] - a[0], uy = b[1] - a[1], k = Math.max(0, Math.min(1, ((s.x - a[0]) * ux + (s.y - a[1]) * uy) / (ux * ux + uy * uy || 1e-9)));
      if (dist(a[0] + ux * k, a[1] + uy * k) > 6 && !s.det) { replan(); return s.path && s.path.length > 1 ? s.path[1] : s.to; } // (a way round a crowd takes him off it for a while)
      return s.pi >= P.length - 1 ? s.to : P[s.pi];
    }
    // found again behind the player, out of the way of their view, when it has been left far behind: on ground a walker
    // may stand on (behind, or beside, or at their feet), and coming into sight there, not there all at once
    const STEP_UP = 0.3; // (a paw's floor further from his middle's than this is a wall's top or a drop, not his floor)
    // and lifted by what the skin of a paw stands under its floor (issue 157): as he sits down or gets up, the crossfade
    // between the clips folds his hind legs below either clip's pose (up to 5 cm in the model by itself, blender/build_dog.py's
    // Akita, and 4 to 9 cm in the story, where a Stop can hold him halfway down). The sole of each paw is the dozen lowest
    // points of skin its bone carries as bound, skinned as the GPU skins them. And where his hind feet stand over a higher
    // floor than his middle (the sky lobby's planks, 11 cm over the ground beside them, as he sat at the lift in frame 4)
    const PAW = /^(lower_f|foot)|paw/i, SV = new THREE.Vector3(), SW = new THREE.Vector3();
    function solesOf(m) {
      const by = new Map(), p = new THREE.Vector3();
      m.traverse(o => {
        if (!o.isSkinnedMesh || !o.geometry.attributes.skinIndex || /guard|outer|whisker/i.test(`${o.name} ${(o.material && o.material.name) || ''}`)) return; // (the body: not the coat's cards)
        const g = o.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = o.skeleton.bones;
        for (let i = 0; i < pos.count; i++) {
          let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } }
          const b = bones[bi]; if (!b || !PAW.test(b.name)) continue;
          let whole = true; for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > 0 && !bones[si.getComponent(i, k)]) whole = false;
          if (!whole) continue; // (a weight on a bone the skeleton has not: three.js would read past its bones)
          const y = p.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix).y;
          const on = []; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > 0) on.push([si.getComponent(i, k), w]); }
          let l = by.get(b); if (!l) by.set(b, l = []); l.push([y, o, p.clone(), on]);
        }
      });
      // (each point as bound, with its bones and weights: skinned here as three.js skins it, and not read again from the
      // geometry, which a phone repacks once loaded, quality.js lean: read from it, a bone past the skeleton's was asked for)
      const out = []; for (const l of by.values()) { l.sort((a, b) => a[0] - b[0]); for (const [, o, q, on] of l.slice(0, 12)) out.push([o, q, on]); }
      return out;
    }
    function onSoles() {
      if (!soles.length) return;
      try { lifted(); } catch (e) { soles = []; console.warn('The guide\'s paws could not be measured:', e); } // (never the game's frame)
    }
    function lifted() {
      root.updateMatrixWorld(true);
      let lift = 0, fx = NaN, fy = NaN, f = null;
      for (const [o, q, on] of soles) {
        const sk = o.skeleton; if (!sk || !on.every(([k]) => sk.bones[k] && sk.boneInverses[k])) continue; // (a skeleton changed since: not this point)
        SV.set(0, 0, 0);
        for (const [k, w] of on) SV.addScaledVector(SW.copy(q).applyMatrix4(sk.boneInverses[k]).applyMatrix4(sk.bones[k].matrixWorld), w);
        SV.applyMatrix4(o.bindMatrixInverse).applyMatrix4(o.matrixWorld);
        // (the floor under it, asked again only a hand's width on: a dozen points of a paw share one)
        if (!(Math.abs(SV.x - fx) < 0.08 && Math.abs(SV.z - fy) < 0.08)) { fx = SV.x; fy = SV.z; f = ground(SV.x, -SV.z, s.z + 0.2); if (f != null && Math.abs(f - s.z) > STEP_UP) f = null; }
        if (f != null) lift = Math.max(lift, f - SV.y);
      }
      if (lift > 0.004) { root.position.y += Math.min(lift, 0.15); root.updateMatrixWorld(true); }
    }
    function catchUp() {
      const h = player.h || 0, sn = Math.sin(h), cs = Math.cos(h);
      let bx = player.x, by = player.y;
      for (const [b, r] of [[2.5, 0.9], [2.5, -0.9], [1.5, 1.2], [1.5, -1.2], [0, 1.2], [0, -1.2]]) {
        const x = player.x - sn * b + cs * r, y = player.y - cs * b - sn * r;
        if (!stand || stand(x, y, player.z)) { bx = x; by = y; break; }
      }
      s.x = bx; s.y = by; s.z = ground(bx, by, player.z); s.h = Math.atan2(player.y - by, player.x - bx); s.thru = 0; s.fade = 0;
      if (s.to) replan();
    }
    // its coat's opacity: faded in where it appears, out where it goes (opaque again when whole, so that it sorts as a solid)
    // (a strand thin() draws is always blended: its opacity is how much of a pixel it covers)
    function shade(a) { for (const m of mats) { m.transparent = a < 1 || !!m.userData.thin; m.opacity = a; m.depthWrite = a > 0.5 && !m.userData.thin; } }
    function tick(dt) {
      if (s.state === 'away') return;
      if (coat && eye) coat.visible = Math.hypot(eye.position.x - root.position.x, eye.position.y - root.position.y, eye.position.z - root.position.z) < COAT_M;
      s.t += dt;
      const px = player.x, py = player.y;
      // (where he is and how far off the player as the tick begins: what it may not end further inside of, keepOff's rule)
      const x0 = s.x, y0 = s.y, h0 = s.h, gap0 = offPlayer();
      s.want = null; // (what he would face standing still: set again by this tick's turn, if he is still)
      // (the player in a car, a lift, the air: he is not seen, and is at their heels again when they are on foot)
      // (the player in a car, a lift, the air: it fades where it stood, and is at their heels again when they are on foot)
      // (a lift he rides with you, at your side in the car: gone at the bottom and found at the top, he was a dog that
      // vanished and came back from nowhere)
      if (player.mode === 'lift' && s.state !== 'leave' && s.state !== 'away') {
        const h = player.h || 0, x = px + Math.cos(h) * 0.55 - Math.sin(h) * 0.25, y = py - Math.sin(h) * 0.55 - Math.cos(h) * 0.25;
        const gap = Math.hypot(x - s.x, y - s.y), k = Math.min(1, dt * 6);
        s.x += (x - s.x) * k; s.y += (y - s.y) * k; s.z = player.z; s.rode = true; s.speed = gap > 0.15 ? speeds.walk : 0; // (walked in beside you, then still)
        turn(gap > 0.4 ? Math.atan2(y - s.y, x - s.x) : Math.atan2(Math.cos(h), Math.sin(h)), 4, dt);
        if (s.fade < 1) { s.fade = Math.min(1, s.fade + dt / 0.5); shade(s.fade); }
        root.visible = s.ready; root.position.copy(W(s.x, s.y, s.z)); root.rotation.y = s.h; ring.material.opacity = 0;
        if (mixer) {
          play(s.speed ? 'walk' : 'idle', 0.3);
          for (const b of [neck, head]) if (b && b.userData.over && b.quaternion.equals(b.userData.over)) b.quaternion.copy(b.userData.raw); // (no turn of the head laid over the clip in the car)
          mixer.update(dt);
        }
        return;
      }
      if (s.rode) { s.rode = false; if (s.to) replan(); }
      if (((player.mode && player.mode !== 'foot') || s.aboard) && s.state !== 'leave') { s.off = true; s.fade = Math.max(0, s.fade - dt / 0.5); shade(s.fade); root.visible = s.ready && s.fade > 0; ring.material.opacity = 0; return; }
      if (s.off) { s.off = false; root.visible = s.ready; catchUp(); }
      if (s.state !== 'leave' && s.fade < 1) { s.fade = Math.min(1, s.fade + dt / 0.7); shade(s.fade); }
      if (s.state !== 'leave' && s.state !== 'go' && s.state !== 'sit' && dist(px, py) > CATCH) catchUp();
      const dp = dist(px, py), ps = player.mode === 'foot' ? Math.max(0, player.speed || 0) : 0, gap = AHEAD + 0.35 * ps, far = Math.max(FAR, gap + 4);
      let lookAt = null;
      if (s.state === 'greet') { // to the player first: a guide is met before it is followed
        if (dp > 2.6) { const w = through(px, py); move(w[0], w[1], Math.max(speeds.trot * 1.25, ps * 1.1), dt); } else { s.speed = 0; face(px, py, dt); if (!s.greeted) { s.greeted = true; s.t = 0; } if (s.t > 1.3) { s.state = 'lead'; s.t = 0; } }
        lookAt = [px, py, player.z + 1.5];
      } else if (s.state === 'lead' || s.state === 'wait' || s.state === 'fetch') {
        const left = dist(s.to[0], s.to[1]);
        if (left < s.reach || (s.held > 1 && left < s.reach + 3)) { s.state = 'sit'; // (or as near as it can get: a belt, a rail between)
          s.t = 0; s.look = null; if (s.done) { const d = s.done; s.done = null; d(); } }
        else if (s.state === 'fetch') { // (to the player: running while they are far, and found at their heels if it takes too long)
          if (dp > AHEAD) { const w = through(px, py); move(w[0], w[1], dp > 9 ? RUN : speeds.trot * 1.3, dt); if (s.t > 6 && dp > 14) catchUp(); } else { s.state = 'lead'; s.t = 0; }
          lookAt = [px, py, player.z + 1.5];
        }
        else if (dp > far && !onAhead()) { // the player has fallen behind: it stops and looks back, and in a while goes to them
          if (s.state !== 'wait') { s.state = 'wait'; s.t = 0; }
          s.speed = 0; face(px, py, dt); lookAt = [px, py, player.z + 1.5];
          if (dp > Math.max(LOST, far + 4) && s.t > 2.5 || s.t > 9) { s.state = 'fetch'; s.t = 0; }
        } else {
          s.state = 'lead';
          // at the player's pace, the gap in front of them kept: further on, he slows and stands; nearer, he goes faster;
          // and when they are further along than he is, he runs past them
          const on = onAhead(), want = on ? Math.max(RUN * 1.25, ps * 1.35) : Math.max(0, Math.min(RUN * 1.45, ps + (gap - dp) * 1.6));
          s.v = (s.v || 0) + (want - (s.v || 0)) * Math.min(1, dt * 4);
          if (s.v < (s.speed ? 0.25 : 0.6)) { s.speed = 0; face(px, py, dt); lookAt = [px, py, player.z + 1.5]; } // (waiting for them, looking back)
          else {
            let w = next();
            // (level with them or behind, while they run his way: he passes wide of them, on the side he is on, and comes
            // in front; aimed through them, he was pushed back off them as fast as he came, and ran at their heel)
            const ph = player.h || 0, fx = Math.sin(ph), fy = Math.cos(ph), rel = (s.x - px) * fx + (s.y - py) * fy, lat = (s.x - px) * fy - (s.y - py) * fx;
            const wl = Math.hypot(w[0] - px, w[1] - py) || 1, toward = ((w[0] - px) * fx + (w[1] - py) * fy) / wl > 0.4;
            // (on the side he is on where there is room for him there, a body's width clear of a wall, a kerb or a well;
            // else on the other; else along the way, round them as round anyone: swung out blind, he ran along the kerb)
            if (ps > 1 && rel < 1.5 && dp < gap && (on || toward)) {
              const sd0 = Math.sign(lat) || 1;
              for (const sd of [sd0, -sd0]) {
                const qx = px + fx * 3.5 + fy * sd * 1.5, qy = py + fy * 3.5 - fx * sd * 1.5;
                const ok = (x, y) => (!stand || stand(x, y, s.z)) && (!edge || !edge(x, y, s.z, s.x, s.y));
                if (ok(qx, qy) && ok(qx + fy * sd * PASS_ROOM, qy - fx * sd * PASS_ROOM) && ok(px + fy * sd * 1.5, py - fx * sd * 1.5)) { w = [qx, qy]; break; }
              }
            }
            move(w[0], w[1], Math.max(speeds.walk * 0.7, s.v), dt); if (dp > gap * 1.3) lookAt = [px, py, player.z + 1.5];
          }
        }
      } else if (s.state === 'heel') { // at the player's side, a pace behind: off when they are, still when they stop
        // (his place a pace behind, on your right; where his body has no room there, facing your way, the left, then
        // straight behind you. You at the roof's glass with it on your right: his place was through the pane, and he
        // walked on the spot against it after the photograph, the walls pushing him back, issue 182)
        const h = player.h || 0, fh = Math.atan2(Math.cos(h), Math.sin(h)), at = side => [px - Math.sin(h) * 1.1 + Math.cos(h) * side, py - Math.cos(h) * 1.1 - Math.sin(h) * side];
        const room = q => fits(q[0], q[1], fh) && (!stand || stand(q[0], q[1], s.z));
        let q = at(s.heelSide ?? 0.8);
        if (wall && !room(q)) { const o = [0.8, -0.8, 0].find(sd => room(at(sd))); if (o != null) { s.heelSide = o; q = at(o); } }
        const [hx, hy] = q, dh = dist(hx, hy), none = wall && !room(q); // (nowhere with room: as near as he gets, he stops)
        if (dh > (none ? 1.5 : 0.6)) { const w = through(hx, hy); move(w[0], w[1], Math.max(speeds.walk, Math.min(RUN * 1.45, ps + (dh - 0.3) * 1.5)), dt); }
        else { s.speed = 0; turnStill(fh, 3, dt); }
      } else if (s.state === 'go') {
        const w = through(s.to[0], s.to[1]);
        move(w[0], w[1], s.goV || speeds.trot, dt);
        if (dist(s.to[0], s.to[1]) < 0.15 || (s.held > 2 && dist(s.to[0], s.to[1]) < 1.2)) { s.state = 'sit'; s.t = 0; s.det = null; } // (or as near as a post or a rail lets him)
      } else if (s.state === 'stand') { // (on his feet where he was put, looking at you)
        s.speed = 0; lookAt = [px, py, player.z + 1.5];
      } else if (s.state === 'sit') {
        s.speed = 0;
        const l = s.look || [px, py, player.z + 1.5];
        if (s.look) face(l[0], l[1], dt); else if (s.t < 1.2) face(px, py, dt);
        lookAt = l;
      } else if (s.state === 'leave') {
        // (along the way home, not the crow's line: from the meeting's kerb the line to Hachiko ran into a building's
        // corner, and he ran on into its wall until he had faded, issue 182)
        const w = onWay() || s.to; move(w[0], w[1], speeds.trot * 1.4, dt);
        const left = dist(s.to[0], s.to[1]);
        if (s.t > 1.2) s.fade = Math.max(0, s.fade - dt / 1.4);
        shade(s.fade);
        if (left < 0.3 || s.fade <= 0) { s.state = 'away'; root.visible = false; if (s.done) { const d = s.done; s.done = null; d(); } return; }
      }
      keepOff(dt);
      // (held by a wall and further into the player than he began: his own step or turn did it, and it is not taken)
      if (s.jam && (s.x !== x0 || s.y !== y0 || s.h !== h0)) { const g1 = offPlayer(); if (g1 < -TOUCH && g1 < gap0) { s.x = x0; s.y = y0; s.h = h0; s.speed = 0; } }
      { const wx = s.x, wy = s.y, wh = s.h, g0 = offPlayer(); wallsOff(dt); if (offPlayer() < Math.min(-TOUCH, g0)) { s.x = wx; s.y = wy; s.h = wh; } } // (off a wall, never into the player)
      s.z = ground(s.x, s.y, s.z);
      root.position.copy(W(s.x, s.y, s.z));
      root.rotation.y = s.h; // (the model looks along +x; the map's y is the scene's -z)
      const leading = s.state === 'greet' || s.state === 'lead' || s.state === 'wait' || s.state === 'fetch';
      ring.material.opacity += ((leading ? 0.7 + 0.2 * Math.sin(s.t * 3) : 0) - ring.material.opacity) * Math.min(1, dt * 3);
      if (!mixer) return;
      const clip = s.state === 'sit' && s.t > 0.15 ? 'sit' : s.speed < 0.15 ? 'idle' : s.speed < 1.5 ? 'walk' : s.speed < 3.6 || !acts.run ? 'trot' : 'run';
      play(clip, clip === 'sit' || cur === 'sit' ? 0.45 : 0.22);
      if (acts.walk) acts.walk.timeScale = Math.max(0.6, Math.min(1.7, s.speed / speeds.walk));
      if (acts.trot) acts.trot.timeScale = Math.max(0.7, Math.min(1.5, s.speed / speeds.trot));
      if (acts.run) acts.run.timeScale = Math.max(0.75, Math.min(1.6, s.speed / RUN));
      // (what was laid over the clip's pose last frame is taken off before the clip is asked for the next: a clip that
      // does not key the head, or a frame with no time in it, leaves the bones where they were, and a turn added to a
      // turn every frame winds the head round)
      for (const b of [neck, head]) if (b && b.userData.over && b.quaternion.equals(b.userData.over)) b.quaternion.copy(b.userData.raw);
      mixer.update(dt);
      onSoles();
      for (const b of [neck, head]) if (b) b.userData.raw = (b.userData.raw || new THREE.Quaternion()).copy(b.quaternion);
      // the head turns to what it is watching, over the clip's own pose
      if (head && lookAt) {
        let yaw = Math.atan2(lookAt[1] - s.y, lookAt[0] - s.x) - s.h; yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
        const up = Math.atan2((lookAt[2] ?? s.z + 0.8) - (s.z + 0.8), Math.max(1, dist(lookAt[0], lookAt[1])));
        s.hy = (s.hy || 0) + (Math.max(-1.25, Math.min(1.25, yaw)) - (s.hy || 0)) * Math.min(1, dt * 5);
        s.hp = (s.hp || 0) + (Math.max(-0.3, Math.min(0.21, up)) - (s.hp || 0)) * Math.min(1, dt * 4);
      } else { s.hy = (s.hy || 0) * Math.max(0, 1 - dt * 4); s.hp = (s.hp || 0) * Math.max(0, 1 - dt * 4); }
      if (head && (Math.abs(s.hy) > 0.01 || Math.abs(s.hp) > 0.01)) {
        const yAxis = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(Math.sin(s.h), 0, Math.cos(s.h)); // (the axis a raised nose turns about)
        for (const [b, k] of [[neck, 0.4], [head, 0.6]]) { if (!b) continue; rotateWorld(b, yAxis, s.hy * k); rotateWorld(b, side, s.hp * k); }
      }
      for (const b of [neck, head]) if (b) b.userData.over = (b.userData.over || new THREE.Quaternion()).copy(b.quaternion);
    }
    // a bone turned about an axis of the scene, whatever its own frame
    const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
    function rotateWorld(bone, axis, angle) {
      bone.parent.getWorldQuaternion(q0);
      q1.setFromAxisAngle(axis, angle);
      bone.quaternion.premultiply(q0).premultiply(q1).premultiply(q0.invert());
    }
    const api = {
      get x() { return s.x; }, get y() { return s.y; }, get z() { return s.z; }, get state() { return s.state; }, get to() { return s.to; }, get ready() { return s.ready; }, get clip() { return cur; }, root,
      // (standing: on his feet, looking at you, and there already, not faded in: a film's first sight of him)
      place(x, y, h = 0, standing = false) { s.x = x; s.y = y; s.h = h; s.z = ground(x, y, player.z); s.state = standing ? 'stand' : 'sit'; s.t = 1; s.fade = standing ? 1 : 0; shade(s.fade); s.det = null; root.visible = s.ready; root.position.copy(W(x, y, s.z)); root.rotation.y = h; return api; },
      // a place near (x, y) he may stand on, clear of the people round it: the nearest within r, or null
      free(x, y, r = 1.5) {
        const them = people ? people(x, y, r + 1) : [];
        let best = null, bd = Infinity;
        for (let j = -r; j <= r + 1e-6; j += 0.3) for (let i = -r; i <= r + 1e-6; i += 0.3) {
          const d = Math.hypot(i, j), qx = x + i, qy = y + j;
          if (d > r || d >= bd || them.some(q => Math.hypot(q[0] - qx, q[1] - qy) < 0.8) || (stand && !stand(qx, qy, player.z))) continue;
          best = [qx, qy]; bd = d;
        }
        return best;
      },
      lead(to, reach = 3, done = null) { s.to = to; s.reach = reach; s.done = done; s.held = 0; s.state = s.greeted ? 'lead' : 'greet'; s.t = 0; replan(); return api; },
      heel() { s.to = null; s.path = null; s.done = null; s.state = 'heel'; s.t = 0; s.heelSide = null; return api; },
      aboard(on) { s.aboard = !!on; return api; }, // (gone in with the player where nothing shows the seat: a story's helicopter; out at their heels after them)
      go(to, look = null, speed = 0) { s.to = to; s.look = look; s.goV = speed; s.state = 'go'; s.t = 0; s.det = null; return api; },
      call() { if (s.state === 'lead' || s.state === 'wait') { s.state = 'fetch'; s.t = 0; } return api; },
      met() { s.greeted = true; if (s.state === 'greet') { s.state = 'lead'; s.t = 0; } return api; },
      get speed() { return s.speed; }, get h() { return s.h; }, get detour() { return s.det ? s.det.pts : null; },
      // (makeWay: game.js, at once after the player has moved: off them, or jammed, in the same frame)
      get jammed() { return !!s.jam; }, makeWay() { if (s.ready && s.state !== 'away') keepOff(0); return api; }, get clearance() { return PLAYER_R + body.flank; }, get reach() { return body.reach; }, get body() { return { spine: body.spine.slice(), flank: body.flank, reach: body.reach }; }, get yielded() { return s.yielded || 0; }, spineNear, // (game.js: the player stops at his flank where a wall holds him; tools/guide_body.js)
      get behind() { return (s.state === 'lead' || s.state === 'fetch') && onAhead(); }, // (the player further along the way than he is)
      leave(to, done = null) { s.to = to; s.done = done; s.state = 'leave'; s.t = 0; replan(); return api; },
      tick,
      remove() { world.remove(root); s.state = 'away'; },
    };
    return api;
  }
  return { create, thin }; // (thin: for tools/coat_shot.js, which draws his model as this draws it)
})();
