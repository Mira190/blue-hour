// Places to sit and watch the crossing, on the walk (docs/STORY.md "The walk", *Somewhere to sit*). A seat is a
// stretch of stone the hero level already has, where people sit in the photographs of it: the outer corner of the
// low granite wall round Hachiko's bed, sat across with the legs over it, facing north across the square to the scramble
// (game.json hero[].perches, from cities/shibuya/city.json game.hero). E beside one sits you on it, facing the crossing.
//
// Seated, the camera is a calm one on a tripod a little behind you and to one side (each seat's `cam`, out past the
// end of Hachiko's bed, where its lantern and rocks would stand in the view): you sit at the edge of the frame and the
// scramble fills the rest, as the benches and vistas of the open worlds that have them frame their view. It eases in a
// little when the lights turn and everyone goes, and back out while the crowd waits at the kerbs. A drag (or the mouse)
// turns your head and the camera with it; let go and after a few seconds the view drifts back to the crossing. Held,
// Space (on a phone the Time-lapse button) runs the evening's clock fast, the sky going on from the blue hour into the
// night while the crowd keeps its own pace.
//
// Nothing here draws: game.js asks near() for a seat, camera() for the shot each frame, and warp() for the clock.
//
//   create({ G, floorAt(x, y) -> z of the ground there, or null })
'use strict';
window.OEPerch = (function () {
  const REACH = 1.6;         // m from the seat's front at which E offers it
  const BACK = 2.9, SIDE = 0.9, HIGH = 1.4; // the tripod, where a seat gives none: behind the hips, off to the right, over the feet
  const IDLE_S = 5;          // seconds without a hand on the view before it drifts back to the crossing
  const WARP = 150;          // the clock held fast: two and a half minutes a second (the blue hour into the night in about 25 s)

  function create({ G, floorAt }) {
    const list = [];
    for (const h of G.hero || []) for (const p of h.perches || []) {
      const face = p.face, fh = Math.atan2(face[0], face[1]); // (a heading as the player's: 0 north, clockwise; game.js h)
      list.push({ perch: true, name: p.name, at: p.at.slice(0, 2), face, h: fh, look: p.look, cam: p.cam || null, rake: p.rake ?? 0.7, verb: p.verb || 'Sit and watch the crossing', z: null });
    }
    // where the feet rest (in front of the stone), resolved once the ground there is loaded
    const ground = p => {
      if (p.z == null) { const z = floorAt(p.at[0] + p.face[0] * 0.55, p.at[1] + p.face[1] * 0.55); if (z != null) p.z = z; }
      return p.z;
    };
    function near(x, y, z) {
      let best = null, bd = REACH;
      for (const p of list) {
        const fx = p.at[0] + p.face[0] * 0.5, fy = p.at[1] + p.face[1] * 0.5, d = Math.hypot(fx - x, fy - y);
        if (d < bd && ground(p) != null && Math.abs(p.z - z) < 1.2) { bd = d; best = p; }
      }
      return best;
    }
    let seat = null, push = 0, t = 0, back = 0, last = null;
    const look = { yaw: 0, pitch: 0, idle: 99 };
    function sit(p) { seat = p; push = 0; t = 0; back = 0; look.yaw = 0; look.pitch = 0; look.idle = 99; }
    function stand() { seat = null; }
    // a hand on the view: dx, dy in pixels
    function turn(dx, dy) {
      look.yaw = Math.max(-1.6, Math.min(1.6, look.yaw + dx * 0.004));
      look.pitch = Math.max(-0.45, Math.min(0.6, look.pitch - dy * 0.0035));
      look.idle = 0;
    }
    // the shot, each frame: walking (the scramble's all-walk phase, everyone going) eases the lens in
    function camera(dt, walking, aspect = 1.6, fov = 49) {
      const p = seat; if (!p) return null;
      t += dt;
      push += ((walking ? 1 : 0) - push) * Math.min(1, dt / 2.5);
      look.idle += dt;
      if (look.idle > IDLE_S) { // (left alone, the head comes back round to the crossing, slowly)
        const k = Math.min(1, dt / 2.2);
        look.yaw -= look.yaw * k; look.pitch -= look.pitch * k;
      }
      const fx = p.face[0], fy = p.face[1], rx = fy, ry = -fx; // (the seat's right hand: x east, y north)
      const z0 = p.z ?? 0;
      // the tripod, breathing a little (a hand-held calm, a few centimetres over ten seconds)
      const bx = Math.sin(t * 0.21) * 0.035, bz = Math.sin(t * 0.33 + 1) * 0.02;
      // (the seat's own tripod, out past whatever stands behind it: the bed's lantern stays off the line to you)
      // (and on a tall screen further back and higher, so that the whole of you sits in its lower corner and the crossing
      // fills the rest: close in, a phone's frame was your back from the shoulders, cut off at its edge)
      const tall = Math.max(0, Math.min(1, (1.6 - aspect) / 1.15));
      const c = p.cam || {}, back = (c.back ?? BACK) + 1.0 * tall, side = c.side ?? SIDE, up = (c.up ?? HIGH) + 0.6 * tall;
      const pos = [p.at[0] - fx * back + rx * (side + bx), p.at[1] - fy * back + ry * (side + bx), z0 + up + bz];
      // the aim: at the crossing, turned by the head
      let dx = p.look[0] - pos[0], dy = p.look[1] - pos[1];
      const L = Math.hypot(dx, dy) || 1, dz = (p.look[2] ?? z0 - 2.0) - pos[2]; // (a few degrees down: the crowd in the middle of the frame, the screens over it)
      let a0 = Math.atan2(dx, dy);
      // (and you kept in the frame: where the crossing's bearing would leave you past seven tenths of the half-width, the
      // aim swings towards you by the difference)
      const H = Math.atan(Math.tan(fov * Math.PI / 360) * aspect) * (0.7 - 0.4 * tall), // (on a tall screen nearer the middle, clear of the buttons at its edge)
        ap = Math.atan2(p.at[0] - pos[0], p.at[1] - pos[1]);
      const off = Math.atan2(Math.sin(ap - a0), Math.cos(ap - a0));
      if (Math.abs(off) > H) a0 += off - Math.sign(off) * H;
      // (and tilted further down on a tall screen: you above the prompt, the crossing in the upper half of the frame)
      const a = a0 + look.yaw, el = Math.atan2(dz, L) - 0.15 * tall + look.pitch;
      const aim = [pos[0] + Math.sin(a) * Math.cos(el) * 30, pos[1] + Math.cos(a) * Math.cos(el) * 30, pos[2] + Math.sin(el) * 30];
      last = pos;
      return { pos, look: aim, fovAdd: -6 - 7 * push * push * (3 - 2 * push) };
    }
    // where your hands rest seated: on your lap, a quarter of a metre out from the hips and over the thighs (x, y, z),
    // for people.js rig.reach; without it the standing clip's arms hung straight down into the stone
    const lap = () => (seat && seat.z != null ? [seat.at[0] + seat.face[0] * 0.26, seat.at[1] + seat.face[1] * 0.26, seat.z + 0.5] : null);
    // the clock held fast: minutes to add this frame
    const warp = (dt, held) => (seat && held ? dt * WARP / 60 : 0);
    return { list, near, sit, stand, turn, camera, warp, lap, get seat() { return seat; }, get tripod() { return last; }, look, WARP };
  }
  return { create };
})();
