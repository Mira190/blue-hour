// The crowd's step off the main thread, a prototype behind ?simworker=1 (issue 220; docs/PERFORMANCE.md, "The crowd's
// step off the main thread"). Off by default; nothing here runs without the flag.
//
// What it steps: a walker of the crowd out of the picture (the renderer did not draw it last frame) and more than OUT_M
// from the crowd's centre, walking alone along a stretch of its footway where nothing waits for it (no crossing, no
// step into a road, no bench, not within END_M of either end: actors.js simSpan). There the street's whole step (its
// neighbours, the cars, the walls, the player) is paid for nobody: the walker is kept as a flow along its line at its
// own pace and offset, and given back to actors.js's walk() the moment anything about it changes (it comes into the
// picture or near, leaves its stretch, or the game moves it).
//
// How state crosses: the main thread owns every walker. Each frame it sends what changed (who was handed over, who
// was taken back) and the frame's time in one buffer, handed over (transferred, not copied); the Worker steps all it
// holds and hands back one buffer of results, which the main thread lays on at the start of its next step: a frame
// behind, and only for walkers nobody sees. Two buffers go round, so nothing is allocated a frame. A result is laid on
// only while the walker is still the one handed over (its epoch and its line), so whatever the game did to it in
// between wins. Where a Worker cannot be made (or with ?simworker=main) the same step runs on the main thread, in the
// same order: the measure of what the Worker itself buys.
//
// The same file is the Worker's script: loaded as a Worker it has no window and answers messages.
'use strict';
(function (root) {
  // ------------------------------------------------------------- the step (both threads)
  // a line's point and heading at distance s, the heading turned through each bend over up to 1.5 m either side of
  // its vertex: actors.js network().at and crowd().lineAt, the same arithmetic
  function lineAt(pts, cum, len, s, out) {
    const n = pts.length / 3;
    s = Math.max(0, Math.min(len, s));
    let k = 1;
    if (n > 6) { let hi = n - 1; while (hi - k > 0) { const m = (k + hi) >> 1; if (cum[m] < s) k = m + 1; else hi = m; } }
    else while (k < n - 1 && cum[k] < s) k++;
    const t = (s - cum[k - 1]) / Math.max(1e-6, cum[k] - cum[k - 1]);
    const ax = pts[3 * k - 3], ay = pts[3 * k - 2], az = pts[3 * k - 1], bx = pts[3 * k], by = pts[3 * k + 1], bz = pts[3 * k + 2];
    out.x = ax + (bx - ax) * t; out.y = ay + (by - ay) * t; out.z = az + (bz - az) * t;
    let hx = bx - ax, hy = by - ay; const h = Math.hypot(hx, hy) || 1; hx /= h; hy /= h;
    out.hx = hx; out.hy = hy;
    if (n < 3) return out;
    const v = s - cum[k - 1] < cum[k] - s ? k - 1 : k;
    if (v <= 0 || v >= n - 1) return out;
    const R = Math.min(1.5, (cum[v] - cum[v - 1]) / 2, (cum[v + 1] - cum[v]) / 2), d = s - cum[v];
    if (!(R > 0.05) || Math.abs(d) >= R) return out;
    let px = pts[3 * v] - pts[3 * v - 3], py = pts[3 * v + 1] - pts[3 * v - 2], qx = pts[3 * v + 3] - pts[3 * v], qy = pts[3 * v + 4] - pts[3 * v + 1];
    const la = Math.hypot(px, py) || 1, lb = Math.hypot(qx, qy) || 1, f = (d + R) / (2 * R);
    px = px / la * (1 - f) + qx / lb * f; py = py / la * (1 - f) + qy / lb * f;
    const hh = Math.hypot(px, py);
    if (hh > 1e-3) { out.hx = px / hh; out.hy = py / hh; }
    return out;
  }
  // a stepper over the lines: holds the walkers handed to it, by their place in the crowd
  // ADD: i, epoch, line, s, dir, lat, v, lo, hi (9); a result: i, epoch, s, x, y, z, hx, hy, out (9)
  const ADD = 9, RES = 9;
  function stepper(lines) {
    const held = new Map(), at = {}; // (i -> its record)
    return {
      held,
      apply(buf) { // [dt, nAdd, nDel, adds..., dels...]: the changes, then the step; returns dt
        const nA = buf[1], nD = buf[2];
        let o = 3;
        for (let k = 0; k < nA; k++, o += ADD) held.set(buf[o], { i: buf[o], e: buf[o + 1], line: buf[o + 2], s: buf[o + 3], dir: buf[o + 4], lat: buf[o + 5], v: buf[o + 6], lo: buf[o + 7], hi: buf[o + 8] });
        for (let k = 0; k < nD; k++, o++) held.delete(buf[o]);
        return buf[0];
      },
      step(dt, out) { // every walker held moved on by dt; their results into out (grown as needed): [n, results...]
        const need = 1 + held.size * RES;
        if (!out || out.length < need) out = new Float64Array(Math.max(need, out ? out.length * 2 : 1024));
        let o = 1, n = 0;
        for (const r of held.values()) {
          const l = lines[r.line];
          let s = r.s + r.dir * r.v * dt, gone = 0;
          if (s <= r.lo) { s = r.lo; gone = 1; } else if (s >= r.hi) { s = r.hi; gone = 1; } // (its stretch ends: back to walk())
          r.s = s;
          lineAt(l.pts, l.cum, l.len, s, at);
          const hx = at.hx * r.dir, hy = at.hy * r.dir;
          out[o] = r.i; out[o + 1] = r.e; out[o + 2] = s; out[o + 3] = at.x - hy * r.lat; out[o + 4] = at.y + hx * r.lat; out[o + 5] = at.z;
          out[o + 6] = hx; out[o + 7] = hy; out[o + 8] = gone;
          o += RES; n++;
          if (gone) held.delete(r.i);
        }
        out[0] = n;
        return out;
      },
    };
  }

  // ------------------------------------------------------------- the Worker
  if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof importScripts === 'function') {
    let S = null, spare = null;
    self.onmessage = e => {
      const m = e.data;
      if (m.lines) { S = stepper(m.lines); return; }
      if (!S) return;
      const t0 = performance.now(), dt = S.apply(m.buf);
      const out = S.step(dt, m.back || spare); spare = null; // (the results' buffer the main thread gave back, if it had one)
      self.postMessage({ res: out, buf: m.buf, ms: performance.now() - t0, held: S.held.size }, [out.buffer, m.buf.buffer]);
    };
    return;
  }

  // ------------------------------------------------------------- the main thread's side
  // create(lines, { mode }): mode 'worker' (a Worker, else the main thread) or 'main' (the main thread only).
  // add(i, epoch, line, s, dir, lat, v, lo, hi) and drop(i) queue changes; post(dt) sends them with the frame's time;
  // results() gives the latest results not yet laid on (a Float64Array [n, ...]) or null; give it back with done(r)
  // once laid on, and it goes back to the Worker with the next post (two buffers each way, none made a frame).
  const SRC = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : null;
  function create(lines, { mode = 'worker' } = {}) {
    let worker = null, busy = false, inBuf = new Float64Array(1024), spareIn = null, ready = null, spareRes = null, owedDt = 0;
    const adds = [], dels = [], stats = { mode: 'main', ghosts: 0, posts: 0, replies: 0, workerMs: 0, waitFrames: 0, linesKB: 0, mainMs: 0 };
    const local = mode === 'main' ? stepper(lines) : null;
    if (!local) {
      try {
        const src = SRC || new URL('game/simworker.js', document.baseURI).href;
        worker = new Worker(root.OEV ? root.OEV(new URL(src), true) : src);
        // (the footways once, as their points and lengths: copied, the page keeps its own)
        const L = lines.map(l => ({ pts: l.pts, cum: l.cum, len: l.len }));
        stats.linesKB = Math.round(lines.reduce((a, l) => a + l.pts.byteLength + l.cum.byteLength, 0) / 1024);
        worker.postMessage({ lines: L });
        worker.onmessage = e => { const m = e.data; ready = m.res; spareIn = m.buf; busy = false; stats.replies++; stats.workerMs += m.ms; stats.ghosts = m.held; };
        worker.onerror = e => { console.warn('simworker', e.message || e); worker = null; };
        stats.mode = 'worker';
      } catch (e) { console.warn('simworker: no Worker, the main thread steps', e); worker = null; }
    }
    const fallback = local || (worker ? null : stepper(lines));
    let outLocal = null;
    return {
      stats,
      add(i, e, line, s, dir, lat, v, lo, hi) { adds.push(i, e, line, s, dir, lat, v, lo, hi); },
      drop(i) { dels.push(i); },
      post(dt) {
        owedDt += dt;
        if (busy) { stats.waitFrames++; return; } // (the last frame's step not back yet: the time and the changes wait for it)
        const need = 3 + adds.length + dels.length;
        let b = spareIn && spareIn.length >= need ? spareIn : inBuf && inBuf.length >= need ? inBuf : new Float64Array(Math.max(need, 1024));
        spareIn = null; inBuf = null;
        b[0] = owedDt; b[1] = adds.length / ADD; b[2] = dels.length;
        b.set(adds, 3); b.set(dels, 3 + adds.length);
        adds.length = 0; dels.length = 0; owedDt = 0;
        stats.posts++;
        if (worker) { busy = true; const back = spareRes; spareRes = null; worker.postMessage({ buf: b, back }, back ? [b.buffer, back.buffer] : [b.buffer]); return; }
        const t0 = performance.now(), S = fallback, d = S.apply(b);
        outLocal = S.step(d, outLocal); ready = outLocal; inBuf = b; stats.ghosts = S.held.size;
        stats.mainMs += performance.now() - t0;
      },
      results() { const r = ready; ready = null; return r; },
      done(r) { if (worker && r) spareRes = r; },
      stop() { if (worker) worker.terminate(); worker = null; },
    };
  }
  root.OESimWorker = { create, lineAt, stepper };
})(typeof window !== 'undefined' ? window : self);
