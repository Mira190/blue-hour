// Blue Hour: a desktop's pictures block-compressed on the device (docs/PERFORMANCE.md, "A desktop's pictures in
// blocks"). What astc.js is to a phone: the files stay what they are, a Worker (astc-worker.js) encodes each picture
// after it is decoded, and the GPU is handed blocks of a byte a texel in place of four. A desktop's GPU decodes BC7
// (EXT_texture_compression_bptc) and BC5 (EXT_texture_compression_rgtc), not ASTC.
//
// BC7 has eight block layouts; a block names its own. This encoder writes three:
//   mode 6   one line through the block in red, green, blue and alpha: endpoints of 7 bits a channel and a bit more
//            shared by an endpoint's four channels, a 4-bit step a texel (16 steps). An opaque block's shared bits are
//            both 1, so that its alpha is 255 exactly. Every smooth block is this: a sky, a wall, a face.
//   mode 1   two lines, the block's texels divided between them by one of 32 of the format's patterns: endpoints of
//            6 bits a channel and a bit shared by a line's two, a 3-bit step a texel. Taken by an opaque block that
//            one line fits badly: a sign's letter in one colour on a ground of another beside a third.
//   mode 5   colour and alpha each on a line of their own: colour endpoints of 7 bits, alpha's of 8, a 2-bit step a
//            texel for each. Taken by a block of a cut-out where alpha does not follow the colour (a leaf's edge).
// A line is the principal axis of its texels, its endpoints refined once by least squares against the steps chosen
// and stored as the layout stores them; the block takes the layout that decodes nearest to what it was given.
//
// BC5 is two channels, each a block of its own: two 8-bit endpoints and a 3-bit step a texel (eight values). A normal
// map's red and green go in; three.js works its blue out again (USE_PACKED_NORMALMAP), so no channel leans on another
// and nothing is tinted.
//
// No code was taken: the layouts are the Khronos data format specification's (BPTC, RGTC), the method the textbook one.
//
// OEBc.encode(rgba, w, h, alpha) -> Uint8Array of ceil(w/4) * ceil(h/4) BC7 blocks of 16 bytes
// OEBc.encode5(rgba, w, h)       -> the same count of BC5 blocks, from red and green
// OEBc.stats: the error of what was written since stats.reset(): stats.db() (colour, by how much shows),
//   stats.alphaDb(), and stats.modes, how many blocks took each layout
(function (root) {
  'use strict';
  const W4 = new Uint8Array([0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64]), W3 = new Uint8Array([0, 9, 18, 27, 37, 46, 55, 64]), W2 = new Uint8Array([0, 21, 43, 64]);
  // the first 32 of the two-line patterns: bit i is the line texel i lies on; and the second line's anchor texel
  // (the texel whose step is stored a bit short; the first line's is texel 0)
  const PART = new Uint16Array([0xCCCC, 0x8888, 0xEEEE, 0xECC8, 0xC880, 0xFEEC, 0xFEC8, 0xEC80, 0xC800, 0xFFEC, 0xFE80, 0xE800, 0xFFE8, 0xFF00, 0xFFF0, 0xF000,
    0xF710, 0x008E, 0x7100, 0x08CE, 0x008C, 0x7310, 0x3100, 0x8CCE, 0x088C, 0x3110, 0x6666, 0x366C, 0x17E8, 0x0FF0, 0x718E, 0x399C]);
  const ANCHOR = new Uint8Array([15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 2, 8, 2, 2, 8, 8, 15, 2, 8, 2, 2, 8, 8, 2, 2]);
  const POP = new Uint8Array(65536);
  for (let i = 1; i < 65536; i++) POP[i] = POP[i >> 1] + (i & 1);
  // the nearest value a layout can store: N7 (mode 5's colour: 7 bits, the top bit again below them), N1[p] (mode 1:
  // 6 bits and the shared bit p, the top bit again below)
  const N7 = new Uint8Array(256), N1 = [new Uint8Array(256), new Uint8Array(256)];
  const nearest = (out, vals) => { for (let v = 0; v < 256; v++) { let b = vals[0]; for (const x of vals) if (Math.abs(x - v) < Math.abs(b - v)) b = x; out[v] = b; } };
  nearest(N7, Array.from({ length: 128 }, (_, q) => (q << 1) | (q >> 6)));
  for (let p = 0; p < 2; p++) nearest(N1[p], Array.from({ length: 64 }, (_, q) => { const x = (q << 1) | p; return (x << 1) | (x >> 6); }));

  const stats = { se: 0, sa: 0, n: 0, texels: 0, modes: { 1: 0, 5: 0, 6: 0 },
    reset() { this.se = this.sa = this.n = this.texels = 0; this.modes = { 1: 0, 5: 0, 6: 0 }; },
    db() { return this.se > 0 ? 10 * Math.log10(255 * 255 / (this.se / (3 * Math.max(1, this.n)))) : 99; },
    alphaDb() { return this.sa > 0 ? 10 * Math.log10(255 * 255 / (this.sa / Math.max(1, this.texels))) : 99; } };

  const px = new Float32Array(64), wgt = new Float32Array(16);
  const ALL = new Uint8Array(16).map((_, i) => i), sub = [new Uint8Array(16), new Uint8Array(16)];
  const m = new Float64Array(4), u = new Float64Array(4), v = new Float64Array(4), d = new Float64Array(4), sa = new Float64Array(4), sb = new Float64Array(4), cov = new Float64Array(10), ax = new Float64Array(4);
  // a line's result: its two endpoints as stored (0..255 a channel) and each texel's step
  const slot = () => ({ a: new Uint8Array(4), b: new Uint8Array(4), sel: new Uint8Array(16), p: 0 });
  const R6 = slot(), R5 = slot(), T0 = slot(), T1 = slot(), B0 = slot(), B1 = slot(), A5 = { a: 0, b: 0, sel: new Uint8Array(16) };

  // the endpoints u, v as a layout stores them, into r.a and r.b. q: 0 mode 6 opaque (odd values: the shared bits 1),
  // 1 mode 6 with alpha (each endpoint's shared bit the better of the two), 2 mode 5's colour, 3 mode 1 (one bit shared by both)
  function store(r, C, q) {
    if (q === 0) { for (let c = 0; c < 3; c++) { let a = Math.round((u[c] - 1) / 2), b = Math.round((v[c] - 1) / 2); a = a < 0 ? 0 : a > 127 ? 127 : a; b = b < 0 ? 0 : b > 127 ? 127 : b; r.a[c] = 2 * a + 1; r.b[c] = 2 * b + 1; } r.a[3] = r.b[3] = 255; return; }
    if (q === 1) {
      for (let e = 0; e < 2; e++) {
        const s = e ? v : u, o = e ? r.b : r.a;
        let best = Infinity, bp = 0;
        for (let p = 0; p < 2; p++) { let err = 0; for (let c = 0; c < 4; c++) { let k = Math.round((s[c] - p) / 2); k = k < 0 ? 0 : k > 127 ? 127 : k; const x = 2 * k + p - s[c]; err += x * x; } if (err < best) { best = err; bp = p; } }
        for (let c = 0; c < 4; c++) { let k = Math.round((s[c] - bp) / 2); k = k < 0 ? 0 : k > 127 ? 127 : k; o[c] = 2 * k + bp; }
      }
      return;
    }
    const cl = x => (x < 0 ? 0 : x > 255 ? 255 : Math.round(x));
    if (q === 2) { for (let c = 0; c < 3; c++) { r.a[c] = N7[cl(u[c])]; r.b[c] = N7[cl(v[c])]; } return; }
    let best = Infinity, bp = 0;
    for (let p = 0; p < 2; p++) { let err = 0; for (let c = 0; c < 3; c++) { const a = cl(u[c]), b = cl(v[c]), x = N1[p][a] - a, y = N1[p][b] - b; err += x * x + y * y; } if (err < best) { best = err; bp = p; } }
    for (let c = 0; c < 3; c++) { r.a[c] = N1[bp][cl(u[c])]; r.b[c] = N1[bp][cl(v[c])]; }
    r.p = bp;
  }

  // one line through the texels ids[0..n): its endpoints and steps into r; returns the squared error of what it will
  // decode to (colour by how much each texel shows, alpha as it is)
  function fit(ids, n, C, WT, q, r) {
    for (let c = 0; c < C; c++) m[c] = 0;
    for (let j = 0; j < n; j++) { const k = ids[j] << 2; for (let c = 0; c < C; c++) m[c] += px[k + c]; }
    for (let c = 0; c < C; c++) m[c] /= n;
    cov.fill(0);
    for (let j = 0; j < n; j++) {
      const k = ids[j] << 2, x = px[k] - m[0], y = px[k + 1] - m[1], z = px[k + 2] - m[2], w = C > 3 ? px[k + 3] - m[3] : 0;
      cov[0] += x * x; cov[1] += x * y; cov[2] += x * z; cov[3] += x * w; cov[4] += y * y; cov[5] += y * z; cov[6] += y * w; cov[7] += z * z; cov[8] += z * w; cov[9] += w * w;
    }
    // the principal axis by power iteration
    ax[0] = cov[0] + cov[1] + cov[2] + cov[3]; ax[1] = cov[1] + cov[4] + cov[5] + cov[6]; ax[2] = cov[2] + cov[5] + cov[7] + cov[8]; ax[3] = cov[3] + cov[6] + cov[8] + cov[9];
    if (ax[0] * ax[0] + ax[1] * ax[1] + ax[2] * ax[2] + ax[3] * ax[3] < 1e-6) { ax[0] = ax[1] = ax[2] = 1; ax[3] = C > 3 ? 1 : 0; }
    for (let it = 0; it < 4; it++) {
      const x = cov[0] * ax[0] + cov[1] * ax[1] + cov[2] * ax[2] + cov[3] * ax[3], y = cov[1] * ax[0] + cov[4] * ax[1] + cov[5] * ax[2] + cov[6] * ax[3],
        z = cov[2] * ax[0] + cov[5] * ax[1] + cov[7] * ax[2] + cov[8] * ax[3], w = cov[3] * ax[0] + cov[6] * ax[1] + cov[8] * ax[2] + cov[9] * ax[3];
      const l = Math.sqrt(x * x + y * y + z * z + w * w);
      if (l < 1e-9) break;
      ax[0] = x / l; ax[1] = y / l; ax[2] = z / l; ax[3] = w / l;
    }
    const al = Math.sqrt(ax[0] * ax[0] + ax[1] * ax[1] + ax[2] * ax[2] + ax[3] * ax[3]) || 1;
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < n; j++) {
      const k = ids[j] << 2;
      let t = 0;
      for (let c = 0; c < C; c++) t += (px[k + c] - m[c]) * ax[c];
      t /= al;
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    for (let c = 0; c < C; c++) { u[c] = m[c] + ax[c] / al * lo; v[c] = m[c] + ax[c] / al * hi; }
    const top = WT.length - 1;
    for (let pass = 0; pass < 2; pass++) {
      store(r, C, q);
      let dd = 0;
      for (let c = 0; c < C; c++) { d[c] = r.b[c] - r.a[c]; dd += d[c] * d[c]; sa[c] = sb[c] = 0; }
      let saa = 0, sab = 0, sbb = 0;
      const k64 = dd > 0 ? 64 / dd : 0;
      for (let j = 0; j < n; j++) {
        const i = ids[j], k = i << 2;
        let t = 0;
        for (let c = 0; c < C; c++) t += (px[k + c] - r.a[c]) * d[c];
        t *= k64;
        let best = Math.round(t * top / 64);
        best = best < 0 ? 0 : best > top ? top : best;
        if (best > 0 && Math.abs(WT[best - 1] - t) < Math.abs(WT[best] - t)) best--;
        else if (best < top && Math.abs(WT[best + 1] - t) < Math.abs(WT[best] - t)) best++;
        r.sel[i] = best;
        const b = WT[best] / 64, a = 1 - b;
        saa += a * a; sab += a * b; sbb += b * b;
        for (let c = 0; c < C; c++) { sa[c] += a * px[k + c]; sb[c] += b * px[k + c]; }
      }
      if (pass) break;
      const det = saa * sbb - sab * sab;
      if (det < 1e-4) break;
      for (let c = 0; c < C; c++) { u[c] = (sa[c] * sbb - sb[c] * sab) / det; v[c] = (sb[c] * saa - sa[c] * sab) / det; }
    }
    let err = 0;
    for (let j = 0; j < n; j++) {
      const i = ids[j], k = i << 2, w = WT[r.sel[i]];
      let e = 0;
      for (let c = 0; c < 3; c++) { const x = (((64 - w) * r.a[c] + w * r.b[c] + 32) >> 6) - px[k + c]; e += x * x; }
      err += e * wgt[i];
      if (C > 3) { const x = (((64 - w) * r.a[3] + w * r.b[3] + 32) >> 6) - px[k + 3]; err += x * x; }
    }
    return err;
  }
  // The same for the layout nearly every block takes (mode 6, opaque: three channels, sixteen steps, odd endpoints),
  // written out channel by channel: nine tenths of a picture's blocks go through here, and a desktop packs a hundred
  // and fifty million texels before its first frame. A block whose texels lie within a step of each other has no
  // axis to find: its endpoints are its least and its most.
  function fit6(r) {
    let mr = 0, mg = 0, mb = 0, lr = 255, lg = 255, lb = 255, hr = 0, hg = 0, hb = 0;
    for (let k = 0; k < 64; k += 4) {
      const x = px[k], y = px[k + 1], z = px[k + 2];
      mr += x; mg += y; mb += z;
      if (x < lr) lr = x; if (x > hr) hr = x; if (y < lg) lg = y; if (y > hg) hg = y; if (z < lb) lb = z; if (z > hb) hb = z;
    }
    let ur, ug, ub, vr, vg, vb, passes = 2;
    if (hr - lr <= 2 && hg - lg <= 2 && hb - lb <= 2) { ur = lr; ug = lg; ub = lb; vr = hr; vg = hg; vb = hb; passes = 1; }
    else {
      mr /= 16; mg /= 16; mb /= 16;
      let c0 = 0, c1 = 0, c2 = 0, c4 = 0, c5 = 0, c7 = 0;
      for (let k = 0; k < 64; k += 4) { const x = px[k] - mr, y = px[k + 1] - mg, z = px[k + 2] - mb; c0 += x * x; c1 += x * y; c2 += x * z; c4 += y * y; c5 += y * z; c7 += z * z; }
      let x = c0 + c1 + c2, y = c1 + c4 + c5, z = c2 + c5 + c7;
      if (x * x + y * y + z * z < 1e-6) { x = y = z = 1; }
      for (let it = 0; it < 3; it++) {
        const nx = c0 * x + c1 * y + c2 * z, ny = c1 * x + c4 * y + c5 * z, nz = c2 * x + c5 * y + c7 * z, l = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (l < 1e-9) break;
        x = nx / l; y = ny / l; z = nz / l;
      }
      const al = Math.sqrt(x * x + y * y + z * z) || 1;
      x /= al; y /= al; z /= al;
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < 64; k += 4) { const t = (px[k] - mr) * x + (px[k + 1] - mg) * y + (px[k + 2] - mb) * z; if (t < lo) lo = t; if (t > hi) hi = t; }
      ur = mr + x * lo; ug = mg + y * lo; ub = mb + z * lo; vr = mr + x * hi; vg = mg + y * hi; vb = mb + z * hi;
    }
    const sel = r.sel;
    let ar = 0, ag = 0, ab = 0, br = 0, bg = 0, bb = 0;
    for (let pass = 0; pass < passes; pass++) {
      // (as stored: seven bits and the shared bit 1, so odd)
      ar = ur <= 1 ? 1 : ur >= 255 ? 255 : (Math.round((ur - 1) * 0.5) << 1) | 1; ag = ug <= 1 ? 1 : ug >= 255 ? 255 : (Math.round((ug - 1) * 0.5) << 1) | 1; ab = ub <= 1 ? 1 : ub >= 255 ? 255 : (Math.round((ub - 1) * 0.5) << 1) | 1;
      br = vr <= 1 ? 1 : vr >= 255 ? 255 : (Math.round((vr - 1) * 0.5) << 1) | 1; bg = vg <= 1 ? 1 : vg >= 255 ? 255 : (Math.round((vg - 1) * 0.5) << 1) | 1; bb = vb <= 1 ? 1 : vb >= 255 ? 255 : (Math.round((vb - 1) * 0.5) << 1) | 1;
      const dr = br - ar, dg = bg - ag, db = bb - ab, dd = dr * dr + dg * dg + db * db, k15 = dd > 0 ? 15 / dd : 0;
      let saa = 0, sab = 0, sbb = 0, sar = 0, sag = 0, sab_ = 0, sbr = 0, sbg = 0, sbb_ = 0;
      const last = pass === passes - 1;
      for (let k = 0, i = 0; k < 64; k += 4, i++) {
        const x = px[k], y = px[k + 1], z = px[k + 2];
        let best = Math.round(((x - ar) * dr + (y - ag) * dg + (z - ab) * db) * k15);
        best = best < 0 ? 0 : best > 15 ? 15 : best;
        sel[i] = best;
        if (last) continue;
        const b = W4[best] * (1 / 64), a = 1 - b;
        saa += a * a; sab += a * b; sbb += b * b;
        sar += a * x; sag += a * y; sab_ += a * z; sbr += b * x; sbg += b * y; sbb_ += b * z;
      }
      if (last) break;
      const det = saa * sbb - sab * sab;
      if (det < 1e-4) break;
      const inv = 1 / det;
      ur = (sar * sbb - sbr * sab) * inv; ug = (sag * sbb - sbg * sab) * inv; ub = (sab_ * sbb - sbb_ * sab) * inv;
      vr = (sbr * saa - sar * sab) * inv; vg = (sbg * saa - sag * sab) * inv; vb = (sbb_ * saa - sab_ * sab) * inv;
    }
    r.a[0] = ar; r.a[1] = ag; r.a[2] = ab; r.a[3] = 255; r.b[0] = br; r.b[1] = bg; r.b[2] = bb; r.b[3] = 255;
    let err = 0;
    for (let k = 0, i = 0; k < 64; k += 4, i++) {
      const w = W4[sel[i]], q = 64 - w, x = ((q * ar + w * br + 32) >> 6) - px[k], y = ((q * ag + w * bg + 32) >> 6) - px[k + 1], z = ((q * ab + w * bb + 32) >> 6) - px[k + 2];
      err += x * x + y * y + z * z;
    }
    return err;
  }
  const copy = (to, from) => { to.a.set(from.a); to.b.set(from.b); to.sel.set(from.sel); to.p = from.p; };

  let out = null, base = 0, bit = 0;
  function put(val, bits) {
    while (bits > 0) { const s = bit & 7, n = bits < 8 - s ? bits : 8 - s; out[base + (bit >> 3)] |= (val & ((1 << n) - 1)) << s; val >>>= n; bit += n; bits -= n; }
  }
  // a line's anchor texel stores its step a bit short: where the step's top bit is set, the line is turned end for end
  function turn(r, ids, n, anchor, L) {
    if (r.sel[anchor] < L >> 1) return;
    for (let c = 0; c < 4; c++) { const t = r.a[c]; r.a[c] = r.b[c]; r.b[c] = t; }
    for (let j = 0; j < n; j++) r.sel[ids[j]] = L - 1 - r.sel[ids[j]];
  }

  function block(src, w, h, bx, by, o) {
    let solid = true, n = 0;
    for (let y = 0; y < 4; y++) {
      const sy = Math.min(h - 1, by + y) * w;
      for (let x = 0; x < 4; x++, n += 4) {
        const i = 4 * (sy + Math.min(w - 1, bx + x));
        px[n] = src[i]; px[n + 1] = src[i + 1]; px[n + 2] = src[i + 2]; px[n + 3] = src[i + 3];
        if (src[i + 3] !== 255) solid = false;
      }
    }
    base = o; bit = 0;
    stats.texels += 16;
    if (solid) {
      wgt.fill(1);
      stats.n += 16;
      const e6 = fit6(R6);
      let e1 = Infinity, part = -1;
      if (e6 > 600) { // (a mean error of some 3.5 steps a channel: the block is not one line)
        // the texels on either side of the line's middle are the two lines' texels, more or less: the patterns nearest that division are tried
        let mask = 0;
        for (let i = 0; i < 16; i++) if (R6.sel[i] >= 8) mask |= 1 << i;
        let c0 = -1, c1 = -1, c2 = -1, d0 = 99, d1 = 99, d2 = 99;
        for (let p = 0; p < 32; p++) {
          const x = PART[p] ^ mask, dist = Math.min(POP[x], 16 - POP[x]);
          if (dist < d0) { c2 = c1; d2 = d1; c1 = c0; d1 = d0; c0 = p; d0 = dist; } else if (dist < d1) { c2 = c1; d2 = d1; c1 = p; d1 = dist; } else if (dist < d2) { c2 = p; d2 = dist; }
        }
        for (const p of [c0, c1, c2]) {
          if (p < 0) continue;
          let n0 = 0, n1 = 0;
          for (let i = 0; i < 16; i++) if ((PART[p] >> i) & 1) sub[1][n1++] = i; else sub[0][n0++] = i;
          const e = fit(sub[0], n0, 3, W3, 3, T0) + fit(sub[1], n1, 3, W3, 3, T1);
          if (e < e1) { e1 = e; part = p; copy(B0, T0); copy(B1, T1); }
        }
      }
      if (e1 < e6 * 0.85) {
        stats.se += e1; stats.modes[1]++;
        let n0 = 0, n1 = 0;
        for (let i = 0; i < 16; i++) if ((PART[part] >> i) & 1) sub[1][n1++] = i; else sub[0][n0++] = i;
        turn(B0, sub[0], n0, 0, 8); turn(B1, sub[1], n1, ANCHOR[part], 8);
        put(2, 2); put(part, 6);
        for (let c = 0; c < 3; c++) { put(B0.a[c] >> 2, 6); put(B0.b[c] >> 2, 6); put(B1.a[c] >> 2, 6); put(B1.b[c] >> 2, 6); }
        put(B0.p, 1); put(B1.p, 1);
        for (let i = 0; i < 16; i++) put((PART[part] >> i) & 1 ? B1.sel[i] : B0.sel[i], i === 0 || i === ANCHOR[part] ? 2 : 3);
        return;
      }
      stats.se += e6; stats.modes[6]++;
      turn(R6, ALL, 16, 0, 16);
      put(64, 7);
      for (let c = 0; c < 3; c++) { put(R6.a[c] >> 1, 7); put(R6.b[c] >> 1, 7); }
      put(127, 7); put(127, 7); put(1, 1); put(1, 1);
      // (the sixteen steps in two words: texel 0's three bits and seven of four, then eight of four)
      { const q = R6.sel; put(q[0] | (q[1] << 3) | (q[2] << 7) | (q[3] << 11) | (q[4] << 15) | (q[5] << 19) | (q[6] << 23) | (q[7] << 27), 31);
        put((q[8] | (q[9] << 4) | (q[10] << 8) | (q[11] << 12) | (q[12] << 16) | (q[13] << 20) | (q[14] << 24) | (q[15] << 28)) >>> 0, 32); }
      return;
    }
    // a block with alpha in it: what is cut away has no colour of its own and no say in where the lines lie (it takes
    // the mean of what shows, by how much it shows), and the colour's error counts by how much a texel shows
    let wr = 0, wg = 0, wb = 0, ws = 0;
    for (let k = 0; k < 64; k += 4) { const a = px[k + 3]; wr += px[k] * a; wg += px[k + 1] * a; wb += px[k + 2] * a; ws += a; wgt[k >> 2] = a / 255; }
    if (ws > 0) { wr /= ws; wg /= ws; wb /= ws; for (let k = 0; k < 64; k += 4) if (px[k + 3] < 8) { px[k] = wr; px[k + 1] = wg; px[k + 2] = wb; } }
    stats.n += ws / 255;
    const e6 = fit(ALL, 16, 4, W4, 1, R6);
    // mode 5: the colour's line, and alpha between the least and the most in the block
    let e5 = fit(ALL, 16, 3, W2, 2, R5), lo = 255, hi = 0, ea = 0;
    for (let k = 3; k < 64; k += 4) { if (px[k] < lo) lo = px[k]; if (px[k] > hi) hi = px[k]; }
    A5.a = lo; A5.b = hi;
    for (let k = 3, i = 0; k < 64; k += 4, i++) {
      let best = hi > lo ? Math.round((px[k] - lo) / (hi - lo) * 3) : 0;
      best = best < 0 ? 0 : best > 3 ? 3 : best;
      A5.sel[i] = best;
      const x = (((64 - W2[best]) * lo + W2[best] * hi + 32) >> 6) - px[k];
      ea += x * x;
    }
    if (e5 + ea < e6) {
      // (the colour's share of the error, for the count: the whole less alpha's)
      stats.se += e5; stats.sa += ea; stats.modes[5]++;
      turn(R5, ALL, 16, 0, 4);
      if (A5.sel[0] >= 2) { const t = A5.a; A5.a = A5.b; A5.b = t; for (let i = 0; i < 16; i++) A5.sel[i] = 3 - A5.sel[i]; }
      put(32, 6); put(0, 2);
      for (let c = 0; c < 3; c++) { put(R5.a[c] >> 1, 7); put(R5.b[c] >> 1, 7); }
      put(A5.a, 8); put(A5.b, 8);
      for (let i = 0; i < 16; i++) put(R5.sel[i], i ? 2 : 1);
      for (let i = 0; i < 16; i++) put(A5.sel[i], i ? 2 : 1);
      return;
    }
    // (mode 6's error is colour and alpha together: divided for the count by what each decodes to)
    for (let i = 0, k = 0; i < 16; i++, k += 4) {
      const wv = W4[R6.sel[i]];
      for (let c = 0; c < 3; c++) { const x = (((64 - wv) * R6.a[c] + wv * R6.b[c] + 32) >> 6) - px[k + c]; stats.se += x * x * wgt[i]; }
      const x = (((64 - wv) * R6.a[3] + wv * R6.b[3] + 32) >> 6) - px[k + 3]; stats.sa += x * x;
    }
    stats.modes[6]++;
    turn(R6, ALL, 16, 0, 16);
    put(64, 7);
    for (let c = 0; c < 4; c++) { put(R6.a[c] >> 1, 7); put(R6.b[c] >> 1, 7); }
    put(R6.a[0] & 1, 1); put(R6.b[0] & 1, 1);
    for (let i = 0; i < 16; i++) put(R6.sel[i], i ? 4 : 3);
  }

  function encode(rgba, w, h) {
    const bw = (w + 3) >> 2, bh = (h + 3) >> 2;
    out = new Uint8Array(bw * bh * 16);
    for (let j = 0, o = 0; j < bh; j++) for (let i = 0; i < bw; i++, o += 16) block(rgba, w, h, i * 4, j * 4, o);
    const r = out;
    out = null;
    return r;
  }

  // BC5: red and green, a block of eight bytes each: the most and the least in the block, and each texel's step of
  // the eight between them (the first endpoint the greater: the layout with six values between the two)
  const ch = new Float32Array(16);
  function half5(src, w, h, bx, by, c, o) {
    let lo = 255, hi = 0;
    for (let y = 0, n = 0; y < 4; y++) {
      const sy = Math.min(h - 1, by + y) * w;
      for (let x = 0; x < 4; x++, n++) { const val = src[4 * (sy + Math.min(w - 1, bx + x)) + c]; ch[n] = val; if (val < lo) lo = val; if (val > hi) hi = val; }
    }
    // (the endpoints once more by least squares against the steps chosen, as the lines above)
    for (let pass = 0; pass < 2 && hi > lo; pass++) {
      let saa = 0, sab = 0, sbb = 0, sA = 0, sB = 0;
      for (let n = 0; n < 16; n++) { let k = Math.round((hi - ch[n]) / (hi - lo) * 7); k = k < 0 ? 0 : k > 7 ? 7 : k; const b = k / 7, a = 1 - b; saa += a * a; sab += a * b; sbb += b * b; sA += a * ch[n]; sB += b * ch[n]; }
      const det = saa * sbb - sab * sab;
      if (pass || det < 1e-4) break;
      const nh = Math.round((sA * sbb - sB * sab) / det), nl = Math.round((sB * saa - sA * sab) / det);
      if (!(nh > nl)) break;
      hi = nh > 255 ? 255 : nh; lo = nl < 0 ? 0 : nl;
    }
    out[o] = hi; out[o + 1] = lo;
    base = o + 2; bit = 0;
    for (let n = 0; n < 16; n++) {
      let k = hi > lo ? Math.round((hi - ch[n]) / (hi - lo) * 7) : 0;
      k = k < 0 ? 0 : k > 7 ? 7 : k;
      const x = hi - (hi - lo) * k / 7 - ch[n];
      stats.se += x * x;
      put(k === 0 ? 0 : k === 7 ? 1 : k + 1, 3);
    }
  }
  function encode5(rgba, w, h) {
    const bw = (w + 3) >> 2, bh = (h + 3) >> 2;
    out = new Uint8Array(bw * bh * 16);
    for (let j = 0, o = 0; j < bh; j++) for (let i = 0; i < bw; i++, o += 16) { half5(rgba, w, h, i * 4, j * 4, 0, o); half5(rgba, w, h, i * 4, j * 4, 1, o + 8); }
    stats.texels += bw * bh * 16; stats.n += bw * bh * 16 * 2 / 3; // (two channels: db() divides by three a texel)
    const r = out;
    out = null;
    return r;
  }

  const api = { encode, encode5, stats };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OEBc = api;
})(typeof self !== 'undefined' ? self : globalThis);
