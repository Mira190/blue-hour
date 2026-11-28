// The people a place keeps (issues 112, 171; docs/STORY.md "The people of the places"). A place is read by who is in
// it: SHIBUYA SKY's roof at the blue hour has couples at the glass, someone photographing the crossing, someone resting
// on a bench; Hachiko's wall has somebody already sitting on it. The crowd is a flow along the footways and never
// reaches a roof or stops on a wall, so these are a few people who stay where the place puts them, anonymous (nothing
// of their own to say; an overheard line of the place is theirs to say: game.js speakers), standing or seated.
//
// What it costs, from first principles:
//  - No model, no texture: each is drawn as one of the crowd's own cast (game.crowd.cast, already loaded for the near
//    crowd: cast(sex, k)), a copy of its skeleton over the same geometry and pictures.
//  - Nothing until near: a group's people are made when the camera comes within its `r` (counted in height as well, as
//    a hero level is: from the street 230 m under the roof they do not exist), one a frame, and drawn only while within
//    it. A phone (few) makes only those marked `phone`.
//  - What they do is one of the cast's clips (look.clip), seated or standing, with the rest of the named people's
//    manners (rig.waits: now and then a look round). A stopped world holds them as it holds everyone.
//
// data (game.json `visitors`, from cities/<city>/city.json game.visitors):
//   groups: [{ id, at: [x, y, z] the place, r (m: made and drawn within it), walk (on the walk only),
//              people: [{ at: [x, y, z] (z: which floor; the floor there is found again), face: [x, y] a point they look
//                         toward, sex 'f' | 'm', clip, sit: the rake of a seat (perch.js: the feet out from the stone;
//                         0.15 a bench at chair height), seat: the seat's top over the floor at the feet (the thighs
//                         slope down to it: people.js rig.seatH), phone: kept on a phone }] }]
//
//   create({ data, make(look) -> rig, cast(sex, k, at) -> character | null (never one of the map's named people near `at`), need(character) -> loaded (asks for it if not), world, W, floorAt(x, y, z) -> z,
//            posts, few })
//     -> { update(dt, t, eye: {x, y, z}, walking), near(x, y, z, r) -> [() => {x, y, z} | null], shown(), seated(x, y, r) }
'use strict';
window.OEVisitors = (function () {
  function create({ data, make, cast, need = null, world, W, floorAt, posts = null, few = false }) {
    const groups = ((data && data.groups) || []).map((g, gi) => {
      const seen = { f: 0, m: 0 };
      const people = (g.people || []).filter(p => !few || p.phone).map(p => {
        const sex = p.sex === 'm' ? 'm' : 'f';
        return { p, g, sex, k: gi * 3 + seen[sex]++, x: p.at[0], y: p.at[1], z: p.at[2] ?? g.at[2] ?? 0, h: p.face ? Math.atan2(p.face[0] - p.at[0], p.face[1] - p.at[1]) : 0, rig: null, post: null, shown: false, pitch: 0 };
      });
      return { g, people, r: g.r || 90, on: false };
    });
    function place(v) {
      // the floor there now (a seat's: where the feet are, in front of the stone, as the player's on a perch)
      // (the seated keep the floor the data gives: the walking grid is not the picture, and round Hachiko's bed it is a raised
      // block a metre wider than the stone drawn, so the floor it gave in front of the wall was the air at the stone's height,
      // and he sat in the air with his feet on it (owner's still, issue 171). Only a floor within 5 cm of the data's is taken)
      const s = v.p.sit != null, fx = s ? v.x + Math.sin(v.h) * 0.55 : v.x, fy = s ? v.y + Math.cos(v.h) * 0.55 : v.y;
      const z = floorAt(fx, fy, v.z + 0.6);
      if (z != null && Math.abs(z - v.z) < (s ? 0.05 : 1.2)) v.z = z;
    }
    function build(v, used) {
      // one of the crowd's cast of their sex, a different one for each of a group (k), never one already in the group
      let c = null;
      for (let j = 0; j < 12 && !c; j++) { const o = cast(v.sex, v.k + j, v.g.at); if (o && !used.has(o)) c = o; }
      if (!c) return false;
      if (need && !need(c)) return false; // (its body still to come: tried again next frame)
      used.add(c);
      const look = { character: c, clip: v.p.clip || 'Idle' };
      const rig = make(look);
      if (!rig || rig.pending) return false;
      place(v);
      v.rig = rig; v.pitch = 97 + (v.k * 61) % 173;
      if (v.p.sit != null) { rig.legRake = v.p.sit; if (v.p.seat != null) rig.seatH = v.p.seat; } // (the thighs sloped to the seat's height: people.js seat)
      rig.root.position.copy(W(v.x, v.y, v.z));
      rig.root.rotation.y = Math.PI - v.h;
      rig.root.visible = false;
      world.add(rig.root);
      return true;
    }
    function show(v, on) {
      if (v.shown === on) return;
      v.shown = on; v.rig.root.visible = on;
      if (!posts) return;
      if (on) { if (v.post) posts.move(v.post, v.x, v.y, v.z); else v.post = posts.add(v.x, v.y, v.z, 0.22, 'npc'); } // (solid to the player and the crowd, as the named people are)
      else if (v.post) posts.move(v.post, 1e7, 1e7, 0);
    }
    function update(dt, t, eye, walking) {
      for (const G of groups) {
        const g = G.g, d = Math.hypot(Math.max(0, Math.hypot(eye.x - g.at[0], eye.y - g.at[1]) - 6), (eye.z ?? g.at[2]) - g.at[2]);
        const want = (!g.walk || walking) && d < (G.on ? G.r + 15 : G.r); // (15 m of slack, so that one at the edge does not come and go)
        G.on = want;
        if (!want) { for (const v of G.people) if (v.rig) show(v, false); continue; }
        let made = false;
        const used = new Set(G.people.filter(v => v.rig).map(v => v.rig.character));
        for (const v of G.people) {
          if (!v.rig) { // (one a frame: a skeleton's copy is not free)
            if (made || !build(v, used)) continue;
            made = true;
            v.rig.animate(0, 0, v.p.sit != null ? 'sit' : 'ground', t + v.pitch); // (posed once before it is first drawn: a seat's fit, people.js rig.seatH, is worked out from the frame before)
          }
          if (need && !need(v.rig.character)) { show(v, false); continue; } // (its character let go from the GPU while nobody looked, people.js lib.letGo: shown again once it is back, not drawn sending its pictures in that frame)
          show(v, true);
          v.rig.waits = true;
          v.rig.animate(dt, 0, v.p.sit != null ? 'sit' : 'ground', t + v.pitch);
        }
      }
    }
    // those drawn within r of (x, y) on that level (|dz| < 3), the nearest first: each a function that gives where they
    // stand, or null once they are no longer drawn (game.js speakers: an overheard line said by someone there)
    function near(x, y, z, r) {
      const out = [];
      for (const G of groups) for (const v of G.people) {
        if (!v.shown) continue;
        const d = Math.hypot(v.x - x, v.y - y);
        if (d < r && Math.abs(v.z - z) < 3) out.push([d, v]);
      }
      return out.sort((a, b) => a[0] - b[0]).map(([d, v]) => ({ d, x: v.x, y: v.y, z: v.z, who: () => (v.shown ? { x: v.x, y: v.y, z: v.z } : null) }));
    }
    // someone seated within r of (x, y) (kept on this device): the place beside them is offered by a person, and needs no
    // mark (game.js seatMarks, walktalk.js places)
    // (shown: a body drawn there, not one the data seats there whose body is still coming. It waits on its load and its warm-up,
    // behind the city's own, and the seat's mark was taken away for it: until it came the wall was empty and nothing offered
    // the seat, walk1's flake. sittingN: how many of the seated are drawn, for the marks to be made again as one comes or goes)
    const seated = (x, y, r) => groups.some(G => G.people.some(v => v.shown && v.p.sit != null && Math.hypot(v.x - x, v.y - y) < r));
    const sittingN = () => { let n = 0; for (const G of groups) for (const v of G.people) if (v.shown && v.p.sit != null) n++; return n; };
    const shown = () => groups.flatMap(G => G.people.filter(v => v.shown).map(v => ({ group: G.g.id, x: v.x, y: v.y, z: v.z, h: v.h, sit: v.p.sit != null, clip: v.rig.clipName ? v.rig.clipName() : null, character: v.rig.character })));
    return { update, near, seated, sittingN, shown, groups, cast };
  }
  return { create };
})();
