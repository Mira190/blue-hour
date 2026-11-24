// The rain's cover map kept and taken as a square of the still things' larger map (weather.js renderOcc), against the
// same map drawn whole: for tools/phone_frame.js EVAL=tools/cover_same.js. In rain the player is moved some metres at
// a time so that the cover map's square lies off the middle of the still map, and at each place the kept map is
// read, then the still things are drawn afresh round the same place (cover.draw fresh), and the two compared texel by texel: the
// heights over the base it writes (red) and where it wrote at all (alpha). What moved between the two draws (a car,
// a train) may differ; the still things may not.
(async () => {
  const g = window.__game, r = g.atmos.composer.renderer, W = g.weather, C = W.cover, n = C.size, wait = ms => new Promise(q => setTimeout(q, ms));
  W.set('rain', { now: true }); await wait(3000);
  const read = () => { const b = new Uint16Array(4 * n * n); r.readRenderTargetPixels(W.occ, 0, 0, n, n, b); return b; };
  const H = THREE.DataUtils.fromHalfFloat, out = [], p = g.player, x0 = p.x, y0 = p.y;
  for (const [dx, dy] of [[0, 0], [9, 0], [9, 13], [-8, 13], [-8, -5], [10, -5]]) {
    p.x = x0 + dx; p.y = y0 + dy; await wait(1500);
    C.draw(C.t, false); const a = read(), st = C.still; // (a square of the still map as it was last drawn, some metres off)
    C.draw(C.t, true); const b = read(); // (the still things drawn afresh round this place, the map's place the same)
    let diff = 0, big = 0, cov = 0; for (let i = 0; i < n * n; i++) { const ha = H(a[4 * i]), hb = H(b[4 * i]), ca = a[4 * i + 3] > 0, cb = b[4 * i + 3] > 0; if (cb) cov++; if (ca !== cb || Math.abs(ha - hb) > 0.05) { diff++; if (ca !== cb || Math.abs(ha - hb) > 1) big++; } }
    out.push({ at: [dx, dy], still_before: st, still_after: C.still, covered: cov, differ: diff, by_a_metre: big });
  }
  p.x = x0; p.y = y0;
  return { texels: n * n, places: out, off: C.off };
})()
