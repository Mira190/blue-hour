// What streaming the map costs a phone driven round the drive area (docs/BOUNDS.md; docs/PERFORMANCE.md "A map built
// round the player"), for tools/phone_frame.js EVAL=tools/drive_stream_probe.js: the player is carried at a car's pace
// (STEP metres a frame) from the start to each corner of the drive area (game.bounds.ground) 60 m in from it and back,
// and every frame is timed, with the buildings' arena's work in it (batch.js arena: ms of script and bytes sent to the
// GPU) and the GPU memory WebGL holds (tools/gl_mem.js, when hooked). Read: p50, p99 and the longest frame, the frames
// over 100 ms with the arena's share, the arena's total and its worst frame, the peak GPU memory, the cells changed.
// Deterministic in distance, not in time: a software renderer's frame is slow, and the way is the same each run.
(async () => {
  const g = window.__game, raf = () => new Promise(r => requestAnimationFrame(r));
  let ar = null; g.Wd.world.traverse(o => { if (o.name === 'buildings-cells') ar = o; });
  const S = ar && ar.userData.stream ? ar.userData.stream : null;
  const p = g.player, x0 = p.x, y0 = p.y, STEP = 1.2, frames = [];
  const poly = g.G.bounds.ground.poly, cx = poly.reduce((s, q) => s + q[0], 0) / poly.length, cy = poly.reduce((s, q) => s + q[1], 0) / poly.length;
  const legs = [];
  for (const [qx, qy] of poly) { const d = Math.hypot(qx - cx, qy - cy), k = (d - 60) / d; legs.push([cx + (qx - cx) * k, cy + (qy - cy) * k]); }
  const gpu = () => (window.__mem ? +(window.__mem.sum / 1048576).toFixed(1) : null);
  let peak = gpu() || 0;
  for (let i = 0; i < 20; i++) await raf();
  if (S) S.take();
  let t = performance.now(), px = x0, py = y0;
  const go = async (tx, ty) => {
    const n = Math.ceil(Math.hypot(tx - px, ty - py) / STEP);
    const ax = px, ay = py;
    for (let i = 1; i <= n; i++) {
      p.x = ax + (tx - ax) * i / n; p.y = ay + (ty - ay) * i / n;
      await raf();
      const now = performance.now(), a = S ? S.take() : null, m = gpu();
      if (m) peak = Math.max(peak, m);
      frames.push({ ms: now - t, ar_ms: a ? a.ms : 0, bytes: a ? a.bytes : 0, at: [Math.round(p.x), Math.round(p.y)] });
      t = now;
    }
    px = tx; py = ty;
  };
  for (const [lx, ly] of legs) { await go(lx, ly); await go(x0, y0); }
  p.x = x0; p.y = y0;
  const ms = frames.map(f => f.ms).sort((a, b) => a - b), q = k => +ms[Math.min(ms.length - 1, Math.floor(k * ms.length))].toFixed(1);
  const big = frames.filter(f => f.ms > 100).sort((a, b) => b.ms - a.ms).slice(0, 8);
  const sum = k => +frames.reduce((n, f) => n + f[k], 0).toFixed(1);
  return { arena: !!S, frames: frames.length, km: +(frames.length * STEP / 1000).toFixed(1), p50: q(0.5), p99: q(0.99), max: q(1), over100: frames.filter(f => f.ms > 100).length,
    arena_ms: sum('ar_ms'), arena_ms_max: +Math.max(0, ...frames.map(f => f.ar_ms)).toFixed(1), arena_mb: +(sum('bytes') / 1048576).toFixed(1),
    gpu_mb_peak: peak || null, gpu_mb_peak_page: window.__mem ? +(window.__mem.peak / 1048576).toFixed(1) : null,
    longest: big.map(f => `${f.ms.toFixed(0)} ms at ${f.at} (arena ${f.ar_ms.toFixed(0)} ms, ${(f.bytes / 1048576).toFixed(1)} MB sent)`) };
})()
