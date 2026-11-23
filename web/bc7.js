// Blue Hour: a desktop's pictures block-compressed on the device (issue 130), as a phone's are in ASTC (astc.js,
// issue 443). An RGBA8 texture is four bytes a texel on the GPU; a desktop on the high tier held 1.24 GB of
// textures in the story's first frame, 640 MB of it colour pictures, none in blocks. BC7 (BPTC) is one byte a texel
// and every desktop GPU decodes it (Direct3D 11 class hardware, Apple's M-series among them), which ASTC is not.
// The files stay what they are; the same Worker (astc-worker.js) encodes a picture after it is decoded.
//
// The encoder writes two of BC7's eight modes, each one subset (no partitions):
//   mode 6   opaque blocks: endpoints RGBA at 7 bits and a shared low bit each, a 4-bit index a texel (16 steps
//            between the endpoints). Alpha's endpoints are 255 (127 and the low bit 1), so red, green and blue end
//            on odd values: 7 bits of each are free
//   mode 5   blocks with alpha: endpoints RGB at 7 bits, alpha's at 8, two planes of 2-bit indices, the second for
//            alpha alone, so that a cut-out's edge does not have to follow its colour (as astc.js's alpha layout)
// A block of a picture with alpha that has none in it takes mode 6: each block names its own. Endpoints are the
// ends of the texels' principal axis, refined once by least squares against the indices chosen: the textbook
// single-subset encoder. With 16 steps where astc.js's opaque layout has 8, a photograph comes out some 3 dB
// better (tools/astc_check.js FMT=bc7 decodes them on a real decoder). No code was taken: the layout is the
// Khronos data format specification's (BPTC: mode 5 and mode 6 bit fields, the interpolation weights, the anchor
// index's implied top bit).
//
// OEBc7.encode(rgba, w, h, alpha) -> Uint8Array of ceil(w/4) * ceil(h/4) blocks of 16 bytes
// OEBc7.stats: the error of what encode() wrote since stats.reset(): stats.db(), stats.alphaDb(), as OEAstc.stats
(function (root) {
  'use strict';
  const W4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64], W2 = [0, 21, 43, 64];
  const px = new Float64Array(64), sel = new Uint8Array(16), asel = new Uint8Array(16), show = new Uint8Array(16), own = new Float64Array(64);
  const m = new Float64Array(3), e0 = new Float64Array(3), e1 = new Float64Array(3), d = new Float64Array(3), sa = new Float64Array(3), sb = new Float64Array(3);
  const stats = { se: 0, sa: 0, n: 0, texels: 0,
    reset() { this.se = this.sa = this.n = this.texels = 0; },
    db() { return this.se > 0 ? 10 * Math.log10(255 * 255 / (this.se / (3 * Math.max(1, this.n)))) : 99; },
    alphaDb() { return this.sa > 0 ? 10 * Math.log10(255 * 255 / (this.sa / Math.max(1, this.texels))) : 99; } };
  // an endpoint as the block stores it and a decoder reads it back
  const q6 = v => { const k = Math.round((v - 1) / 2); return ((k < 0 ? 0 : k > 127 ? 127 : k) << 1) | 1; }; // (mode 6: 7 bits and the low bit 1)
  const q5 = v => { const k = Math.round(v * 127 / 255), c = k < 0 ? 0 : k > 127 ? 127 : k; return (c << 1) | (c >> 6); }; // (mode 5: 7 bits, the top bit again below)

  function block(src, w, h, bx, by, alpha, out, o) {
    let n = 0, solid = true;
    for (let y = 0; y < 4; y++) {
      const sy = Math.min(h - 1, by + y) * w;
      for (let x = 0; x < 4; x++) {
        const i = 4 * (sy + Math.min(w - 1, bx + x));
        px[n] = src[i]; px[n + 1] = src[i + 1]; px[n + 2] = src[i + 2]; px[n + 3] = src[i + 3];
        if (src[i + 3] !== 255) solid = false;
        n += 4;
      }
    }
    const dual = alpha && !solid, WT = dual ? W2 : W4, top = WT.length - 1, quant = dual ? q5 : q6;
    // what is cut away has no colour of its own: for the axis it takes the mean of what shows, by how much it shows
    // (as astc.js), and afterwards the step of the line nearest the colour bleed() gave it
    let swapped = false;
    m[0] = m[1] = m[2] = 0;
    if (dual) {
      let wr = 0, wg = 0, wb = 0, ws = 0;
      for (let k = 0; k < 64; k += 4) { const a = px[k + 3]; wr += px[k] * a; wg += px[k + 1] * a; wb += px[k + 2] * a; ws += a; }
      if (ws > 0) { wr /= ws; wg /= ws; wb /= ws; }
      for (let k = 0; k < 64; k += 4) {
        if (px[k + 3] < 8) { if (ws > 0) { own[k] = px[k]; own[k + 1] = px[k + 1]; own[k + 2] = px[k + 2]; px[k] = wr; px[k + 1] = wg; px[k + 2] = wb; swapped = true; } show[k >> 2] = 0; } else show[k >> 2] = 1;
        m[0] += px[k]; m[1] += px[k + 1]; m[2] += px[k + 2];
      }
    } else for (let k = 0; k < 64; k += 4) { m[0] += px[k]; m[1] += px[k + 1]; m[2] += px[k + 2]; }
    m[0] /= 16; m[1] /= 16; m[2] /= 16;
    let c00 = 0, c01 = 0, c02 = 0, c11 = 0, c12 = 0, c22 = 0;
    for (let k = 0; k < 64; k += 4) {
      const r = px[k] - m[0], g = px[k + 1] - m[1], b = px[k + 2] - m[2];
      c00 += r * r; c01 += r * g; c02 += r * b; c11 += g * g; c12 += g * b; c22 += b * b;
    }
    // the principal axis by power iteration, from the diagonal
    let ax = c00 + c01 + c02, ay = c01 + c11 + c12, az = c02 + c12 + c22;
    if (ax * ax + ay * ay + az * az < 1e-6) { ax = ay = az = 1; }
    for (let it = 0; it < 4; it++) {
      const x = c00 * ax + c01 * ay + c02 * az, y = c01 * ax + c11 * ay + c12 * az, z = c02 * ax + c12 * ay + c22 * az, l = Math.sqrt(x * x + y * y + z * z);
      if (l < 1e-9) break;
      ax = x / l; ay = y / l; az = z / l;
    }
    const al = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
    ax /= al; ay /= al; az /= al;
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < 64; k += 4) {
      const t = (px[k] - m[0]) * ax + (px[k + 1] - m[1]) * ay + (px[k + 2] - m[2]) * az;
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    e0[0] = m[0] + ax * lo; e0[1] = m[1] + ay * lo; e0[2] = m[2] + az * lo;
    e1[0] = m[0] + ax * hi; e1[1] = m[1] + ay * hi; e1[2] = m[2] + az * hi;
    if (swapped) for (let k = 0; k < 64; k += 4) if (!show[k >> 2]) { px[k] = own[k]; px[k + 1] = own[k + 1]; px[k + 2] = own[k + 2]; }
    // indices against the endpoints as they will be stored, then the endpoints once more by least squares
    for (let pass = 0; pass < 2; pass++) {
      let dd = 0;
      for (let c = 0; c < 3; c++) { e0[c] = quant(e0[c]); e1[c] = quant(e1[c]); d[c] = e1[c] - e0[c]; dd += d[c] * d[c]; sa[c] = sb[c] = 0; }
      let saa = 0, sab = 0, sbb = 0;
      const k64 = dd > 0 ? 64 / dd : 0;
      for (let k = 0, i = 0; k < 64; k += 4, i++) {
        const t = ((px[k] - e0[0]) * d[0] + (px[k + 1] - e0[1]) * d[1] + (px[k + 2] - e0[2]) * d[2]) * k64;
        // the nearest of the index's steps (all but evenly spaced: the step by rounding, then its neighbours)
        let best = Math.round(t * top / 64);
        best = best < 0 ? 0 : best > top ? top : best;
        if (best > 0 && Math.abs(WT[best - 1] - t) < Math.abs(WT[best] - t)) best--;
        else if (best < top && Math.abs(WT[best + 1] - t) < Math.abs(WT[best] - t)) best++;
        sel[i] = best;
        if (dual && !show[i]) continue; // (cut away: it takes whatever step, and has no say in the endpoints)
        const b = WT[best] / 64, a = 1 - b;
        saa += a * a; sab += a * b; sbb += b * b;
        for (let c = 0; c < 3; c++) { sa[c] += a * px[k + c]; sb[c] += b * px[k + c]; }
      }
      if (pass) break;
      const det = saa * sbb - sab * sab;
      if (det < 1e-4) break; // (every texel on one step: the endpoints stay)
      for (let c = 0; c < 3; c++) { e0[c] = (sa[c] * sbb - sb[c] * sab) / det; e1[c] = (sb[c] * saa - sa[c] * sab) / det; }
    }
    // alpha on its own plane: its endpoints the least and the most in the block, a 2-bit index a texel
    let a0 = 255, a1 = 255;
    if (dual) {
      a0 = 255; a1 = 0;
      for (let k = 3; k < 64; k += 4) { if (px[k] < a0) a0 = px[k]; if (px[k] > a1) a1 = px[k]; }
      const da = a1 - a0;
      for (let k = 3, i = 0; k < 64; k += 4, i++) {
        const t = da ? (px[k] - a0) / da * 64 : 0;
        let best = Math.round(t * 3 / 64);
        best = best < 0 ? 0 : best > 3 ? 3 : best;
        if (best > 0 && Math.abs(W2[best - 1] - t) < Math.abs(W2[best] - t)) best--;
        else if (best < 3 && Math.abs(W2[best + 1] - t) < Math.abs(W2[best] - t)) best++;
        asel[i] = best;
      }
    }
    // what the block will decode to (a decoder's own integers), against what it was given: summed for the caller
    for (let k = 0, i = 0; k < 64; k += 4, i++) {
      const f = WT[sel[i]], sh = dual ? px[k + 3] / 255 : 1;
      for (let c = 0; c < 3; c++) { const v = (((64 - f) * e0[c] + f * e1[c] + 32) >> 6) - px[k + c]; stats.se += v * v * sh; }
      if (dual) { const g = W2[asel[i]], v = (((64 - g) * a0 + g * a1 + 32) >> 6) - px[k + 3]; stats.sa += v * v; }
      stats.n += sh;
    }
    stats.texels += 16;
    // the first texel's index is stored without its top bit, which a decoder takes as 0: where it is not, the
    // endpoints change places and every index is counted from the other end
    if (sel[0] > top >> 1) {
      for (let c = 0; c < 3; c++) { const t = e0[c]; e0[c] = e1[c]; e1[c] = t; }
      for (let i = 0; i < 16; i++) sel[i] = top - sel[i];
    }
    if (dual && asel[0] > 1) { const t = a0; a0 = a1; a1 = t; for (let i = 0; i < 16; i++) asel[i] = 3 - asel[i]; }
    // ---- the 128 bits, least significant first
    for (let k = 0; k < 16; k++) out[o + k] = 0;
    let bit = 0;
    const put = (v, bits) => { const at = o + (bit >> 3), s = bit & 7, x = v << s; out[at] |= x & 255; if (x > 255) out[at + 1] |= (x >> 8) & 255; if (x > 65535) out[at + 2] |= x >> 16; bit += bits; };
    if (!dual) {
      put(64, 7); // (mode 6: six zeros and a one)
      for (let c = 0; c < 3; c++) { put(e0[c] >> 1, 7); put(e1[c] >> 1, 7); }
      put(127, 7); put(127, 7); // (alpha 255 at both ends, with the low bits below)
      put(1, 1); put(1, 1);
      put(sel[0], 3);
      for (let i = 1; i < 16; i++) put(sel[i], 4);
      return;
    }
    put(32, 6); // (mode 5: five zeros and a one)
    put(0, 2); // (no rotation: alpha is the channel on the second plane)
    for (let c = 0; c < 3; c++) { put(e0[c] >> 1, 7); put(e1[c] >> 1, 7); }
    put(a0, 8); put(a1, 8);
    put(sel[0], 1);
    for (let i = 1; i < 16; i++) put(sel[i], 2);
    put(asel[0], 1);
    for (let i = 1; i < 16; i++) put(asel[i], 2);
  }

  function encode(rgba, w, h, alpha = false) {
    const bw = (w + 3) >> 2, bh = (h + 3) >> 2, out = new Uint8Array(bw * bh * 16);
    for (let j = 0, o = 0; j < bh; j++) for (let i = 0; i < bw; i++, o += 16) block(rgba, w, h, i * 4, j * 4, alpha, out, o);
    return out;
  }

  root.OEBc7 = { encode, stats };
})(typeof self !== 'undefined' ? self : this);
