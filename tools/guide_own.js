// In the page (Playwright's evaluate): frame 4's lead with a player who takes their own line, not the guide's trail
// (issue 207). The player runs the way on foot from R.from (or where the story put them) to the goal at R.speed; the
// guide is led there. Faults: 'stuck' (a step asked for and not gone, STUCK_S running), 'waits-behind' (he waits while
// the player is further along the way than he is), 'held-by-him' (the player stopped at his flank). Used by
// tools/guide_follow.js (the sweep) and tools/guide_way.js (one leg in the checks).
module.exports = ({ R, live, STUCK_S, STUCK_M, TRACE }) => new Promise(done => {
  const g = window.__game, st = g.story.state, dog = st.dog, pl = g.player, nav = g.nav, ways = g.ways;
  // (the story kept off its own beat: Yuna's talk would begin as the player arrives, and the check ends there itself)
  st.beat = 'meet';
  pl.x = live.at[0]; pl.y = live.at[1]; pl.z = live.at[2]; pl.h = live.h; st.target = live.target;
  if (R.from) { const fl = nav.floorAt(R.from[0], R.from[1], nav.terrain(R.from[0], R.from[1]) + 1); pl.x = R.from[0]; pl.y = R.from[1]; if (fl) pl.z = fl.z; pl.h = Math.atan2(live.target[0] - pl.x, live.target[1] - pl.y); }
  const to = st.target;
  const f = dog.free(pl.x + 1.2 * Math.sin(pl.h + 0.6), pl.y + 1.2 * Math.cos(pl.h + 0.6), 2) || [pl.x + 1, pl.y];
  dog.place(f[0], f[1], 0); dog.met();
  // the player's own line: the way on foot from them to the goal
  const own = ways.walk({ x: pl.x, y: pl.y, z: pl.z }, { x: to[0], y: to[1], z: to[3] ?? to[2] });
  if (!own) return done({ error: 'no way for the player' });
  const P = own.pts;
  // (along the way: the point s m on, and how far is left from the nearest point of it to (x, y))
  const along = m => { let l = m; for (let i = 1; i < P.length; i++) { const L = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (L >= l) return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * l / L, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * l / L, i]; l -= L; } return [P[P.length - 1][0], P[P.length - 1][1], P.length - 1]; };
  const left = (x, y) => { let best = Infinity, out = 0, rest = 0; for (let i = P.length - 1; i > 0; i--) { const a = P[i - 1], c = P[i], ux = c[0] - a[0], uy = c[1] - a[1], L = Math.hypot(ux, uy) || 1e-9, k = Math.max(0, Math.min(1, ((x - a[0]) * ux + (y - a[1]) * uy) / (L * L))), d = Math.hypot(a[0] + ux * k - x, a[1] + uy * k - y); if (d < best - 0.01) { best = d; out = rest + L * (1 - k); } rest += L; } return out; };
  if (R.start) { const q = along(R.start), fl = nav.floorAt(q[0], q[1], pl.z + 1); pl.x = q[0]; pl.y = q[1]; if (fl) pl.z = fl.z; }
  dog.lead([to[0], to[1]], 2.2);
  let s = R.start, was = performance.now(), t = 0;
  const hist = [], faults = [], seen = {}, trace = [];
  const fault = (kind, msg) => { if (seen[kind] && seen[kind] > 3) return; seen[kind] = (seen[kind] || 0) + 1; faults.push(`${kind} t=${t.toFixed(1)} ${msg}`); if (!window.__f207) window.__f207 = kind; };
  let waitT = 0, heldT = 0, backT = 0, went = 0, last = null, runT = 0;
  const step = now => {
    const dt = Math.min(0.05, Math.max(0, (now - was) / 1000)); was = now; t += dt; window.__t207 = t; // (the lead's own clock, for timed stills)
    // the player: along their own line at their speed (as a walker steps: nav.slide), never waiting for him
    const pl0 = [pl.x, pl.y];
    // (what the player has really gone, whatever moved them: the page's own step adds to the harness's, and a player
    // said to run at 6 m/s went at 9 to 12, which no dog keeps ahead of. They step only while within R.speed of the time)
    if (last) went += Math.hypot(pl.x - last[0], pl.y - last[1]);
    last = [pl.x, pl.y];
    const paused = R.pause && t >= R.pause[0] && t < R.pause[1]; // (R.pause [from, to] s: the player drops back, standing still)
    if (!paused) runT += dt;
    if (!paused && went < R.speed * runT && pl.mode === 'foot' && Math.hypot(to[0] - pl.x, to[1] - pl.y) > (R.short || 2.5)) { // (R.short: stopped outside the reach that starts the goal's talk, story.js meet_m)
      s = own.len - left(pl.x, pl.y); const q = along(s + 3), // (a point 3 m on from where they are on it: a carrot that cannot run ahead of a held player and point through a wall)
           dx = q[0] - pl.x, dy = q[1] - pl.y, d = Math.hypot(dx, dy);
      if (d > 1e-3) { const k = Math.min(1, R.speed * dt / d), m = nav.slide(pl.x, pl.y, pl.z, dx * k, dy * k), wk = nav.walk(m.x, m.y, pl.z + 0.3, true); if (wk.ok) { pl.x = m.x; pl.y = m.y; pl.z = wk.z; } pl.h = Math.atan2(dx, dy); if (g.cam) g.cam.yaw = pl.h; }
      pl.speed = R.speed;
      // (the page's own step does the rest: makeWay and the stop at his flank are game.js's, called from the walk;
      // here the same, so that a jammed guide stops this player as he would stop yours)
      if (dog.makeWay) dog.makeWay();
      if (dog.jammed && dog.spineNear) { const [cx, cy] = dog.spineNear(pl.x, pl.y), ex = pl.x - cx, ey = pl.y - cy, e = Math.hypot(ex, ey) || 1e-3; if (e < dog.clearance) { heldT += dt; if (heldT > 0.3) fault('held-by-him', `the player stopped at his flank at ${pl.x.toFixed(1)}, ${pl.y.toFixed(1)}`); pl.x = pl0[0]; pl.y = pl0[1]; s -= R.speed * dt; } else heldT = 0; } else heldT = 0;
    } else pl.speed = paused || Math.hypot(to[0] - pl.x, to[1] - pl.y) <= (R.short || 2.5) ? 0 : R.speed; // (between steps held back by the distance cap they are still running: their pace, as a player's at a run)
    hist.push([t, dog.x, dog.y, dog.speed]);
    while (hist.length && t - hist[0][0] > STUCK_S) hist.shift();
    const lp = left(pl.x, pl.y), ld = left(dog.x, dog.y), arrived = Math.hypot(to[0] - dog.x, to[1] - dog.y) < 3.5;
    // a step asked for and not gone, STUCK_S running
    if (!arrived && hist.length > 5 && t - hist[0][0] > STUCK_S * 0.9 && hist.every(q => q[3] > 0.5) && Math.hypot(dog.x - hist[0][1], dog.y - hist[0][2]) < STUCK_M) fault('stuck', `${dog.state} at ${dog.x.toFixed(2)}, ${dog.y.toFixed(2)}, ${dog.z.toFixed(2)} (player ${pl.x.toFixed(1)}, ${pl.y.toFixed(1)}; ${(lp - ld).toFixed(1)} m ${lp < ld ? 'ahead of' : 'behind'} him on the way)`);
    // The owner's rule, both ways (issue 207). The player ahead of him (past him on his line, or further on along
    // another): he does not wait; he runs, and is in front again within BACK_S. The player behind him (dropped back):
    // he waits, turned to look back, and does not run off: never more than RUNOFF_M ahead of them along the way, and
    // standing by the end of the pause
    if (lp < ld - 1.5 && !paused) { backT += dt; if (backT > 8) fault('never-in-front', `the player ${(ld - lp).toFixed(1)} m further on for 8 s; he is at ${dog.x.toFixed(1)}, ${dog.y.toFixed(1)}, ${dog.state}`); } else backT = 0;
    if (paused && lp - ld > 14) fault('runs-off', `he is ${(lp - ld).toFixed(1)} m ahead of a player who stopped, at ${dog.x.toFixed(1)}, ${dog.y.toFixed(1)}`);
    if (R.pause && t >= R.pause[1] - 0.3 && t < R.pause[1] && !arrived && dog.speed > 0.5 && lp > ld) fault('no-wait', `still going at ${dog.speed.toFixed(1)} m/s ${(lp - ld).toFixed(1)} m ahead of a player who stopped ${(R.pause[1] - R.pause[0]).toFixed(0)} s ago`);
    // waiting while the player is further along than he is
    if (dog.state === 'wait' && lp < ld - 1.5) { waitT += dt; if (waitT > 0.5) fault('waits-behind', `he waits at ${dog.x.toFixed(1)}, ${dog.y.toFixed(1)} with the player ${(ld - lp).toFixed(1)} m further along`); } else waitT = 0;
    if (Math.round(t * 4) !== Math.round((t - dt) * 4)) trace.push([+t.toFixed(2), dog.state, +dog.x.toFixed(2), +dog.y.toFixed(2), +dog.speed.toFixed(2), +pl.x.toFixed(1), +pl.y.toFixed(1), +(lp - ld).toFixed(1)]);
    if (dog.state === 'sit' || dog.state === 'heel' || t > (R.until || 150)) return done({ t: +t.toFixed(1), state: dog.state, at: [+dog.x.toFixed(2), +dog.y.toFixed(2)], left: +Math.hypot(dog.x - to[0], dog.y - to[1]).toFixed(2), player: [+pl.x.toFixed(1), +pl.y.toFixed(1)], faults, trace: faults.length || TRACE ? trace : [] });
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});
