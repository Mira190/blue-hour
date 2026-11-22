// What one frame asks of the GPU, counted at the context as the page draws it: the draw calls, the triangles, the
// full-screen passes (a three-vertex draw without an index, as the telemetry counts them: web/telemetry.js), the pixels
// those passes shade, the targets the scene is drawn into and their pixels, and what WebGL holds while it does (with
// tools/gl_mem.js: textures, buffers, renderbuffers). The counts are the page's own asks, so they are the same under a
// software renderer as on a GPU: what a beat of the story brings into its frame (docs/PERFORMANCE.md, "A budget for
// every beat"). What they cost in milliseconds only a device says (`?perf`, the telemetry).
//   await ctx.addInitScript(require('./beat_count').hook);          // after any script that wraps the draw calls itself
//   const c = await require('./beat_count').sample(page);           // two frames of the game's, the heavier of them
exports.hook = () => {
  const P = WebGL2RenderingContext.prototype, B = window.__beat = { on: false, cur: null, group: '' };
  const fresh = () => ({ draws: 0, tris: 0, passes: 0, pass_px: 0, targets: new Map(), clears: 0, blits: 0, by: new Map(), groups: new Map(), sky: 0, sky_draws: 0, sky_tris: 0 });
  B.begin = () => { B.cur = fresh(); B.on = true; };
  B.end = () => {
    B.on = false; const c = B.cur; B.cur = null; if (!c) return null;
    // (a target's pixels: the largest viewport the scene's own draws had in it; a pass's are counted where it is drawn)
    let scene_px = 0, scene_targets = 0; for (const t of c.targets.values()) if (t.scene) { scene_px += t.px; scene_targets++; }
    return { draws: c.draws, tris: Math.round(c.tris), passes: c.passes, pass_px: c.pass_px, scene_px, scene_targets, targets: c.targets.size, clears: c.clears, blits: c.blits,
      sky_refresh: c.sky, sky_draws: c.sky_draws, sky_tris: Math.round(c.sky_tris),
      groups: [...c.groups.entries()].map(([k, v]) => ({ group: k, draws: v.draws, tris: Math.round(v.tris) })).sort((a, b) => b.tris - a.tris).slice(0, 40),
      by: [...c.by.entries()].map(([k, v]) => ({ target: k, draws: v.draws, tris: Math.round(v.tris), passes: v.passes })).sort((a, b) => b.tris - a.tris || b.draws - a.draws) };
  };
  // the context's state as the page sets it: the framebuffer drawn into, and the viewport
  const st = new WeakMap(), of = gl => { let s = st.get(gl); if (!s) st.set(gl, s = { fb: null, id: 0, ids: new WeakMap(), w: gl.drawingBufferWidth, h: gl.drawingBufferHeight }); return s; };
  { const f = P.bindFramebuffer; P.bindFramebuffer = function (t, fb) { if (t !== 0x8CA8) of(this).fb = fb; return f.call(this, t, fb); }; } // (not READ_FRAMEBUFFER)
  { const f = P.viewport; P.viewport = function (x, y, w, h) { const s = of(this); s.w = w; s.h = h; return f.call(this, x, y, w, h); }; }
  const tri = (gl, mode, count, inst, indexed) => {
    const c = B.cur, s = of(gl);
    let k = 'canvas'; if (s.fb) { k = s.ids.get(s.fb); if (!k) s.ids.set(s.fb, k = `fb${++s.id}`); }
    k = `${k} ${s.w}x${s.h}`;
    let t = c.targets.get(k); if (!t) c.targets.set(k, t = { px: 0, scene: false });
    let b = c.by.get(k); if (!b) c.by.set(k, b = { draws: 0, tris: 0, passes: 0 });
    const n = mode === 4 ? (count / 3) * inst : mode === 5 || mode === 6 ? Math.max(0, count - 2) * inst : 0;
    c.draws++; c.tris += n; b.draws++; b.tris += n;
    if (B.group) { const gk = `${s.w}x${s.h} ${B.group}`; let q = c.groups.get(gk); if (!q) c.groups.set(gk, q = { draws: 0, tris: 0 }); q.draws++; q.tris += n; }
    if (mode === 4 && count === 3 && !indexed && inst === 1) { c.passes++; b.passes++; c.pass_px += s.w * s.h; }
    else { t.scene = true; t.px = Math.max(t.px, s.w * s.h); }
  };
  // (a frame the harness does not draw, tools/story_play.js DRAW=n, asks for its draws all the same and they are passed over: not counted)
  const wrap = (k, fn) => { const f = P[k]; if (!f) return; P[k] = function (...a) { if (B.on && !(window.__draw && !window.__draw.on)) { if (B.aside) aside(this, k, a); else fn(this, a); } return f.apply(this, a); }; };
  // The sky's light taken afresh (world.js setSun: three.js's PMREMGenerator.fromScene, the sky dome drawn into a cube and
  // its mips, a dozen targets of 256 x 256 and smaller) when the sun or the sky has moved on enough: once in a while, in
  // whichever frame it falls, and counted with that frame it doubled the frame's targets and showed as a beat's cost
  // (issue 151). It is counted as what it is: sky_refresh, with its draws and triangles beside the frame's, not in them
  const aside = (gl, k, a) => { const c = B.cur; if (!/^draw/.test(k)) return; const mode = a[0], count = k === 'drawRangeElements' ? a[3] : k === 'drawElements' || k === 'drawElementsInstanced' ? a[1] : a[2], inst = k === 'drawArraysInstanced' ? a[3] : k === 'drawElementsInstanced' ? a[4] : 1; c.sky_draws++; c.sky_tris += mode === 4 ? (count / 3) * inst : mode === 5 || mode === 6 ? Math.max(0, count - 2) * inst : 0; };
  addEventListener('three-ready', () => { const G = window.THREE && window.THREE.PMREMGenerator; if (!G || G.prototype.__beat) return; const f = G.prototype.fromScene; G.prototype.__beat = true; G.prototype.fromScene = function (...a) { const was = B.aside; if (B.on && B.cur) B.cur.sky++; B.aside = true; try { return f.apply(this, a); } finally { B.aside = was; } }; }, { once: true });
  wrap('drawArrays', (gl, a) => tri(gl, a[0], a[2], 1, false));
  wrap('drawElements', (gl, a) => tri(gl, a[0], a[1], 1, true));
  wrap('drawRangeElements', (gl, a) => tri(gl, a[0], a[3], 1, true));
  wrap('drawArraysInstanced', (gl, a) => tri(gl, a[0], a[2], a[3], false));
  wrap('drawElementsInstanced', (gl, a) => tri(gl, a[0], a[1], a[4], true));
  wrap('clear', () => { B.cur.clears++; });
  wrap('blitFramebuffer', () => { B.cur.blits++; });
  // names(true): each draw put down to the thing drawn, by the names up its parents. three.js draws every thing through
  // its renderer's renderBufferDirect, the shadows' map and a pass with an override material included (the rain's cover
  // map), so the name is noted there; not in a thing's onBeforeRender, which the rain's cover takes as a sign to leave
  // the thing out (weather.js hidden). names(false): the renderer as it was
  let wrapped = null;
  B.names = on => {
    if (wrapped) { wrapped.r.renderBufferDirect = wrapped.was; wrapped = null; }
    B.group = '';
    const g = window.__game, r = g && g.atmos && g.atmos.composer && g.atmos.composer.renderer;
    if (!on || !r || !g.world) return;
    let root = g.world; while (root.parent) root = root.parent;
    const names = new WeakMap();
    const nameOf = o => { const n = []; for (let q = o; q && q !== root; q = q.parent) if (q.name && !/^(Scene|Group)$/.test(q.name)) n.push(q.name.replace(/[_-]?\d+$/, '')); if (n.length) return n.length > 1 ? `${n[n.length - 1]}/${n[0]}` : n[0]; const m = Array.isArray(o.material) ? o.material[0] : o.material; return `${o.isInstancedMesh ? 'InstancedMesh' : o.isSkinnedMesh ? 'SkinnedMesh' : o.type}:${(m && (m.name || m.type)) || ''}:${o.userData && Object.keys(o.userData).slice(0, 3).join(',')}`; };
    const was = r.renderBufferDirect;
    wrapped = { r, was };
    r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      if (object) { let k = names.get(object); if (!k) names.set(object, k = nameOf(object)); B.group = k; }
      return was.call(this, camera, scene, geometry, material, object, group);
    };
  };
  // the frames counted as one line: the heaviest by its triangles, and element by element the larger of them for what is
  // drawn in one and not another (the passes, the pixels); with what WebGL holds now (tools/gl_mem.js, where its hook is
  // in the page) and the page's own state
  B.report = got => {
    got = got.filter(c => c && c.draws).sort((a, b) => b.tris - a.tris);
    const c = got[0] || { draws: 0, tris: 0, passes: 0, pass_px: 0, scene_px: 0, by: [], groups: [] }, g = window.__game, gl = document.querySelector('#game-gl'), M = window.__memReport ? window.__memReport(0) : null;
    for (const o of got.slice(1)) for (const k of ['draws', 'passes', 'pass_px', 'scene_px']) c[k] = Math.max(c[k], o[k]);
    const mb = v => +(v / 1048576).toFixed(1);
    return { ...c, frames: got.length, canvas: gl ? [gl.width, gl.height] : null, scale: g && g.pxScale ? +g.pxScale().toFixed(2) : null,
      ...(M ? { tex_n: M.nTex, tex_mb: mb(M.tex), buf_mb: mb(M.buf), rb_mb: mb(M.rb), gpu_mb: mb(M.now), gpu_peak_mb: mb(M.peak) } : {}) };
  };
};

// Two of the game's frames counted (a frame the cap passes over draws nothing and is not one), and the heavier kept:
// the wet street's mirror is drawn every other frame, the shadows' cache and the rain's cover in whichever finds them
// stale. by=true: and by what was drawn.
exports.sample = (p, frames = 2, by = false) => p.evaluate(([frames, by]) => new Promise(done => {
  const B = window.__beat, got = []; let tries = 0;
  B.names(by);
  const step = () => {
    const c = B.end(); if (c && c.draws) got.push(c);
    if (got.length >= frames || ++tries > 40) { B.names(false); return done(B.report(got)); }
    B.begin(); requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}), [frames, by]);
// One frame the caller draws itself, counted from begin to end: a still's own frame, drawn whole (tools/story_play.js),
// which costs a play no frame more.
// On a busy runner a second of the game's frames is now and then drawn before the count is ended, and the still was
// given both: twice its draws, triangles and passes (22 passes of 12, 3.07 M triangles of 1.5 M, main red on it,
// issues 151 and 162). The frames drawn between begin and end are counted (the harness's own count, __draw.drawn), and
// a count of more than one is brought to a frame's.
exports.begin = (p, by = false) => p.evaluate(by => { const B = window.__beat; B.names(by); B.drawn0 = window.__draw ? window.__draw.drawn : null; B.begin(); }, by);
exports.end = p => p.evaluate(() => {
  const B = window.__beat, c = B.end(); B.names(false);
  const n = c && B.drawn0 != null && window.__draw ? Math.max(1, window.__draw.drawn - B.drawn0) : 1;
  if (c && n > 1) for (const k of ['draws', 'tris', 'passes', 'pass_px', 'scene_px', 'clears', 'blits']) c[k] = Math.round(c[k] / n);
  return { ...B.report([c]), frames: n };
});
