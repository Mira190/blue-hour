// Open Earth 3D: a picture into ASTC blocks (a phone's, astc.js) or BC7 and BC5 blocks (a desktop's, bc7.js), off the main thread (tex.js; issue 443). The page hands over
// a decoded picture (an ImageBitmap) and says how large it may be, whether it is stored upside down for the GPU,
// and whether its colour is sRGB; this draws it at that size, reads its pixels, encodes each mipmap level and hands
// the blocks back. Where the encoder's own count says the picture would lose too much (floor, dB), or there is no
// canvas to read it with, the picture goes back as it came and the page keeps it uncompressed.
'use strict';
// (a deployed page gives its workers the build, ?b=: what a worker imports is asked for by it, so that it is that commit's; index.html's guard)
{ const b = /[?&]b=(\w+)/.exec(self.location.search), raw = self.importScripts; if (b) self.importScripts = (...u) => raw.apply(self, u.map(x => `${x}?b=${b[1]}`)); }
importScripts('astc.js', 'bc7.js');
self.onmessage = e => {
  const { id, bitmap, max, flipY, srgb, mips, floor, alphaFloor, fmt = 'astc', thumb = 0 } = e.data;
  try {
    const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    let w = Math.max(1, Math.floor(bitmap.width * k)), h = Math.max(1, Math.floor(bitmap.height * k));
    // (WebGL takes a BC texture only where its top level is whole blocks: a side that is not a multiple of four is
    // drawn at the multiple under it, a third of a percent smaller at most at the sizes packed; ASTC has no such rule)
    if (fmt !== 'astc') { w = Math.max(4, w & ~3); h = Math.max(4, h & ~3); }
    const cv = new OffscreenCanvas(w, h), g = cv.getContext('2d', { willReadFrequently: true });
    if (flipY) { g.translate(0, h); g.scale(1, -1); } // (blocks cannot be flipped as they are sent: the rows are, here)
    g.imageSmoothingQuality = 'high';
    g.drawImage(bitmap, 0, 0, w, h);
    // (a desktop's blocks, bc7.js: BC7 for colour, BC5 for a normal map's red and green, which has no alpha to read)
    const bc = fmt !== 'astc', two = fmt === 'bc5';
    const px = g.getImageData(0, 0, w, h).data, alpha = !two && !self.OEAstc.opaque(px), S = bc ? self.OEBc.stats : self.OEAstc.stats;
    const enc = two ? (d, a, b) => self.OEBc.encode5(d, a, b) : bc ? (d, a, b) => self.OEBc.encode(d, a, b) : (d, a, b) => self.OEAstc.encode(d, a, b, alpha);
    cv.width = cv.height = 0;
    if (alpha) self.OEAstc.bleed(px, w, h); // (what the canvas handed back black where nothing shows, given its neighbours' colour)
    S.reset();
    const top = enc(px, w, h), db = S.db(), adb = S.alphaDb();
    if (db < floor || (alpha && adb < alphaFloor)) { self.postMessage({ id, keep: true, bitmap, db, adb }, [bitmap]); return; }
    const levels = [{ data: top, width: w, height: h }];
    if (mips) for (let cur = { data: px, width: w, height: h }; cur.width > 1 || cur.height > 1;) {
      cur = self.OEAstc.half(cur.data, cur.width, cur.height, srgb);
      levels.push({ data: enc(cur.data, cur.width, cur.height), width: cur.width, height: cur.height });
    }
    // (thumb: a small copy as the picture lay, for a reader of its pixels on the page: neon.js's means of a screen's programme)
    let small = null;
    if (thumb) { const k2 = Math.min(1, thumb / Math.max(bitmap.width, bitmap.height)), tc = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * k2)), Math.max(1, Math.round(bitmap.height * k2))); tc.getContext('2d').drawImage(bitmap, 0, 0, tc.width, tc.height); small = tc.transferToImageBitmap(); }
    bitmap.close();
    self.postMessage({ id, levels, alpha, db, adb, fmt, thumb: small, width: w, height: h }, levels.map(l => l.data.buffer).concat(small ? [small] : []));
  } catch (err) {
    try { self.postMessage({ id, keep: true, bitmap, error: String(err && err.message || err) }, [bitmap]); } catch (e2) { self.postMessage({ id, keep: true, error: String(err && err.message || err) }); }
  }
};
