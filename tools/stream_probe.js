// What streaming the map round the player costs a frame (issue 220), for tools/phone_frame.js EVAL=tools/stream_probe.js:
// the player is carried along a fixed way (STEP metres a frame, east then back: the buildings' cells are built again for
// other levels of detail as it goes, world.js mapAt) and every frame is timed. Each frame's wall time, and, where the
// buildings' arena says what it did (batch.js arena: ms of the page's script in it and bytes sent to the GPU, by frame),
// that too. Read: p50, p99 and the longest frame, the frames over 100 ms with the arena's share of each, and the arena's
// total. Deterministic in distance, not in time: a software renderer's frame is slow, and the way is the same each run.
(async () => {
  const g = window.__game, raf = () => new Promise(r => requestAnimationFrame(r));
  let ar = null; g.Wd.world.traverse(o => { if (o.name === 'buildings-cells') ar = o; });
  const S = ar && ar.userData.stream ? ar.userData.stream : null; // (per frame: { ms, bytes, moved } since the last read)
  const p = g.player, x0 = p.x, y0 = p.y, STEP = 3, N = 150, frames = [];
  for (let i = 0; i < 20; i++) await raf(); // (settled)
  if (S) S.take();
  let t = performance.now();
  for (let i = 0; i < 2 * N; i++) {
    p.x = x0 + STEP * (i < N ? i : 2 * N - i); p.y = y0;
    await raf();
    const now = performance.now(), a = S ? S.take() : null;
    frames.push({ i, ms: now - t, ar_ms: a ? a.ms : 0, bytes: a ? a.bytes : 0, moved: a ? a.moved : 0 });
    t = now;
  }
  p.x = x0; p.y = y0;
  const ms = frames.map(f => f.ms).sort((a, b) => a - b), q = k => +ms[Math.min(ms.length - 1, Math.floor(k * ms.length))].toFixed(1);
  const big = frames.filter(f => f.ms > 100).sort((a, b) => b.ms - a.ms).slice(0, 8);
  const sum = k => +frames.reduce((n, f) => n + f[k], 0).toFixed(1);
  return { arena: !!S, by: S && S.all ? S.all() : null, frames: frames.length, p50: q(0.5), p99: q(0.99), max: q(1), over100: frames.filter(f => f.ms > 100).length,
    arena_ms: sum('ar_ms'), arena_ms_max: +Math.max(0, ...frames.map(f => f.ar_ms)).toFixed(1), arena_mb: +(sum('bytes') / 1048576).toFixed(1), arena_mb_max: +(Math.max(0, ...frames.map(f => f.bytes)) / 1048576).toFixed(2), moved_mb: +(sum('moved') / 1048576).toFixed(1),
    longest: big.map(f => `#${f.i} ${f.ms.toFixed(0)} ms (arena ${f.ar_ms.toFixed(0)} ms, ${(f.bytes / 1048576).toFixed(1)} MB sent, ${(f.moved / 1048576).toFixed(1)} MB moved)`) };
})()
