// What WebGL was asked to hold, counted in the page as it is asked: every texture (each level), buffer and renderbuffer,
// summed per object as it is uploaded, resized and deleted (window.__mem, window.__memReport(top)), and the load's own
// steps with the memory at each (window.__steps). An init script for a page, shared by the checks that weigh one
// (tools/mem_check.js, the story's beats in tools/story_play.js BUDGET=):
//   await ctx.addInitScript(require('./gl_mem').hook);
exports.hook = () => {
  // bytes per texel of the uncompressed internal formats (as tools/tex_mem.js); a buffer's own bytes; a renderbuffer's samples
  const BPP = { 0x8058: 4, 0x8C43: 4, 0x1908: 4, 0x8051: 3, 0x8C41: 3, 0x1907: 3, 0x8229: 1, 0x1909: 1, 0x1903: 1, 0x822B: 2,
    0x881A: 8, 0x8814: 16, 0x822F: 4, 0x822E: 4, 0x8230: 8, 0x822D: 2, 0x8D62: 2, 0x8056: 2, 0x8057: 2, 0x8C3A: 4, 0x8C3D: 4,
    0x81A5: 2, 0x81A6: 3, 0x88F0: 4, 0x8CAC: 4, 0x8CAD: 8, 0x1902: 4, 0x8D9F: 4, 0x8F94: 4, 0x8059: 4, 0x8236: 4, 0x8235: 4, 0x8234: 2, 0x8233: 1,
    0x8232: 1, 0x8231: 1, 0x823C: 8, 0x823B: 4, 0x823A: 4, 0x8239: 2, 0x8238: 2, 0x8237: 2, 0x8D70: 16, 0x8D76: 16, 0x8D7C: 4, 0x8D82: 16, 0x8D88: 16, 0x8D8E: 4,
    0x93B0: 1, 0x93D0: 1, 0x8E8C: 1, 0x8E8D: 1 }; // (ASTC 4x4 and BC7, linear and sRGB: sixteen bytes a block of sixteen texels)
  const M = window.__mem = { tex: new Map(), buf: new Map(), rb: new Map(), peak: 0, peakAt: '', sum: 0, log: [], logged: 0 };
  // the load's own steps (game.js loadStep), each with the GPU memory and the heap when it was named: which step takes the memory
  const SP = window.__steps = [], pm = performance.mark.bind(performance);
  performance.mark = function (n, o) { if (n === 'oe:step') { try { SP.push({ step: o && o.detail && o.detail.step, t: +(performance.now() / 1000).toFixed(1), gpu: M.sum, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 }); } catch (e) { /* no memory reading */ } } return pm(n, o); };
  const total = () => { let s = 0; for (const m of [M.tex, M.buf, M.rb]) for (const e of m.values()) s += e.bytes; return s; };
  // (and its course: each megabyte it rose or fell by, with the second and what was last asked for or let go, so that a
  // peak can be read as what was held together when it fell: mem_check.js TRACE=1)
  const bump = what => {
    M.sum = total(); if (M.sum > M.peak) { M.peak = M.sum; M.peakAt = (performance.now() / 1000).toFixed(1); }
    if (Math.abs(M.sum - M.logged) >= 1048576 && M.log.length < 20000) { M.log.push([+(performance.now() / 1000).toFixed(2), M.sum, what || '']); M.logged = M.sum; }
  };
  const nameOf = a => { for (const x of a) if (x && (x.src || x.currentSrc)) return String(x.src || x.currentSrc).split('/').slice(-2).join('/'); return ''; };
  for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    const tex = new Map(), bufs = new Map();
    let unit = 0, rbBound = null;
    const o = {};
    for (const k of ['activeTexture', 'bindTexture', 'deleteTexture', 'texImage2D', 'texStorage2D', 'texImage3D', 'texStorage3D', 'compressedTexImage2D',
      'bindBuffer', 'bufferData', 'deleteBuffer', 'bindRenderbuffer', 'renderbufferStorage', 'renderbufferStorageMultisample', 'deleteRenderbuffer']) o[k] = proto[k];
    if (!o.activeTexture) continue;
    proto.activeTexture = function (u) { unit = u; return o.activeTexture.call(this, u); };
    proto.bindTexture = function (t, x) { tex.set(`${unit}:${t}`, x); return o.bindTexture.call(this, t, x); };
    proto.deleteTexture = function (x) { const e = M.tex.get(x); M.tex.delete(x); bump(e ? `- ${e.label}` : ''); return o.deleteTexture.call(this, x); };
    const put = (gl, target, level, bytes, label) => {
      const bindT = target >= 0x8515 && target <= 0x851A ? 0x8513 : target; // a cube's face: the cube map
      const x = tex.get(`${unit}:${bindT}`);
      if (!x) return;
      let e = M.tex.get(x);
      if (!e) M.tex.set(x, e = { levels: {}, bytes: 0, label: '' });
      e.levels[`${target}:${level}`] = bytes;
      if (label) e.label = label;
      e.bytes = Object.values(e.levels).reduce((a, b) => a + b, 0);
      // (mem_check.js OWN: where in the page's scripts a big one was made: the first lines of its stack outside three.js)
      if (window.__memOwn && e.bytes > 1 << 20 && !e.stack) e.stack = (new Error().stack || '').split('\n').filter(l => /\.js/.test(l) && !/three|mem_check|gl_mem|__puppeteer|playwright/.test(l)).slice(0, 3).map(l => l.replace(/^.*\/(\w[\w.-]*\.js):(\d+):\d+\)?$/, '$1:$2').trim()).join(' < ');
      bump(e.label);
    };
    proto.texImage2D = function (target, level, ifmt, ...r) {
      let w, h;
      if (r.length >= 6) { w = r[0]; h = r[1]; } else { const s = r[r.length - 1]; w = s.naturalWidth || s.videoWidth || s.width || s.displayWidth; h = s.naturalHeight || s.videoHeight || s.height || s.displayHeight; }
      put(this, target, level, w * h * (BPP[ifmt] || 4), level ? '' : `${w}x${h} ${nameOf(r)}`);
      return o.texImage2D.call(this, target, level, ifmt, ...r);
    };
    proto.texStorage2D = function (target, levels, ifmt, w, h) {
      let s = 0; for (let l = 0, a = w, c = h; l < levels; l++, a = Math.max(1, a >> 1), c = Math.max(1, c >> 1)) s += a * c * (BPP[ifmt] || 4);
      put(this, target, 0, s, `${w}x${h} storage`);
      return o.texStorage2D.call(this, target, levels, ifmt, w, h);
    };
    const sub = proto.texSubImage2D;
    proto.texSubImage2D = function (target, level, ...r) {
      const n = level ? '' : nameOf(r.slice(4));
      if (n) { const x = tex.get(`${unit}:${target >= 0x8515 && target <= 0x851A ? 0x8513 : target}`), e = x && M.tex.get(x); if (e && !/ \S+\.\w+$/.test(e.label)) e.label += ` ${n}`; }
      return sub.call(this, target, level, ...r);
    };
    if (o.texImage3D) proto.texImage3D = function (target, level, ifmt, w, h, d, ...r) { put(this, target, level, w * h * d * (BPP[ifmt] || 4), level ? '' : `${w}x${h}x${d} 3D`); return o.texImage3D.call(this, target, level, ifmt, w, h, d, ...r); };
    if (o.texStorage3D) proto.texStorage3D = function (target, levels, ifmt, w, h, d) { put(this, target, 0, w * h * d * (BPP[ifmt] || 4) * (levels > 1 ? 4 / 3 : 1), `${w}x${h}x${d} 3D storage`); return o.texStorage3D.call(this, target, levels, ifmt, w, h, d); };
    proto.compressedTexImage2D = function (target, level, ifmt, w, h, b, data) { put(this, target, level, data ? data.byteLength : 0, level ? '' : `${w}x${h} compressed`); return o.compressedTexImage2D.apply(this, arguments); };
    proto.bindBuffer = function (t, x) { bufs.set(t, x); return o.bindBuffer.call(this, t, x); };
    proto.bufferData = function (t, d) {
      const x = bufs.get(t);
      if (x) { M.buf.set(x, { bytes: typeof d === 'number' ? d : (d ? d.byteLength : 0), label: t === 0x8893 ? 'index' : 'vertex', src: d && d.buffer && typeof WeakRef === 'function' ? new WeakRef(d.buffer) : null }); bump('buffer'); } // (src: the page's own array, by which a report finds whose buffer it is)
      return o.bufferData.apply(this, arguments);
    };
    proto.deleteBuffer = function (x) { M.buf.delete(x); bump('- buffer'); return o.deleteBuffer.call(this, x); };
    proto.bindRenderbuffer = function (t, x) { rbBound = x; return o.bindRenderbuffer.call(this, t, x); };
    proto.renderbufferStorage = function (t, f, w, h) { if (rbBound) { M.rb.set(rbBound, { bytes: w * h * (BPP[f] || 4), label: `${w}x${h} rb` }); bump(`${w}x${h} rb`); } return o.renderbufferStorage.call(this, t, f, w, h); };
    if (o.renderbufferStorageMultisample) proto.renderbufferStorageMultisample = function (t, s, f, w, h) { if (rbBound) { M.rb.set(rbBound, { bytes: w * h * (BPP[f] || 4) * Math.max(1, s), label: `${w}x${h} rb x${s}` }); bump(`${w}x${h} rb`); } return o.renderbufferStorageMultisample.call(this, t, s, f, w, h); };
    proto.deleteRenderbuffer = function (x) { M.rb.delete(x); bump('- rb'); return o.deleteRenderbuffer.call(this, x); };
  }
  // the largest of each kind now, and what the canvases' own buffers hold (colour, depth, at their size)
  window.__memReport = top => {
    const list = m => [...m.values()].sort((a, b) => b.bytes - a.bytes).slice(0, top).map(e => `${(e.bytes / 1048576).toFixed(1)} MB ${e.label}`);
    const sum = m => [...m.values()].reduce((a, e) => a + e.bytes, 0);
    const canv = [...document.querySelectorAll('canvas')].reduce((a, c) => a + (c.__gl ? c.width * c.height * 8 * 2 : 0), 0);
    return { tex: sum(M.tex), buf: sum(M.buf), rb: sum(M.rb), now: M.sum, peak: M.peak, peakAt: M.peakAt, canvas: canv,
      topTex: list(M.tex), topBuf: list(M.buf), topRb: list(M.rb), nTex: M.tex.size, nBuf: M.buf.size };
  };
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) { const r = get.call(this, type, opts); if (r && /webgl/.test(type)) this.__gl = true; return r; };
};
