// The reverbs a phone hears (web/game/audio.js reverb(), docs/SOUND.md "Every sound on the audio thread"): on a touch
// screen a response's first quarter of a second is convolved as it is and the rest is made by a feedback delay network,
// so that nothing waits on WebKit's background convolution thread. This renders, offline, each reverb the game has (the
// four rooms, the story's hall, the score's room) at 44.1 and 48 kHz, both ways (whole: one ConvolverNode, as the
// browser's own normalising would have it; hybrid: as a phone plays it), and compares their impulse responses:
//   - the whole path is the browser's own convolver (normScale reproduces its normalising): within -80 dB;
//   - the energy decay curve (Schroeder's backward integral, both channels) after the head, broadband and below 500 Hz
//     and above 3 kHz: within 2 dB (3.5 in a band, where a short tail's noise alone moves it by a dB or two) of the whole
//     response's, down to 30 dB (25 in a band) under it, and more by as much as the whole response's own decay bends
//     away from an exponential's (the hall's, (1 - t/4.2)^2.6, by 3.3 dB: a tail of feedback loops is a sum of
//     exponentials and can come no closer); a response 30 dB down by the end of its head (the roof's) is its head alone,
//     and must carry the whole's energy within 0.2 dB;
//   - the seam: in 20 ms windows from 0.15 to 0.6 s, no window more than 4 dB off the whole response's, smoothed;
//   - the tail is noise, as the whole response's is: its echo density (Abel and Huang, 2006: the share of samples over
//     one standard deviation in 20 ms windows, against a Gaussian's) at least 0.85 on average from 20 ms after the seam,
//     and the left and right channels' correlation within 0.3;
//   - the level the page found by running the network itself (tailOf) is the level the browser renders: within 0.5 dB;
//   - no convolver longer than WebKit's realtime limit in the hybrid.
// Exits 1 on any failure. ENGINE=webkit runs it where Playwright has WebKit (its Linux build's convolver is not exact:
// the comparisons there are only indicative, and only the limit and the calibration are checked).
//   python3 -m http.server 8800 --directory web &
//   NODE_PATH=$(npm root -g) node tools/reverb_check.js
const pw = require('playwright');
(async () => {
  const engine = process.env.ENGINE || 'chromium', b = await pw[engine].launch();
  const p = await b.newPage();
  const errors = [], port = process.env.PORT || 8800;
  p.on('pageerror', e => errors.push(String(e)));
  await p.setContent(`<script src="http://localhost:${port}/game/audio.js"></script><script src="http://localhost:${port}/game/music.js"></script>`);
  await p.waitForFunction(() => window.OEAudio && window.OEAudio.reverb && window.OEMusic);
  for (const rate of [44100, 48000]) for (const kind of ['open', 'viaduct', 'inside', 'roof', 'hall', 'score']) {
    const r = await p.evaluate(async ([rate, kind]) => {
      const A = window.OEAudio, mk = new OfflineAudioContext(2, rate, rate);
      const ir = kind === 'hall' ? A.hallIR(mk) : kind === 'score' ? window.OEMusic.create({ persist: false }).impulse(mk, 3.6) : A.impulse(kind, mk);
      const norm = kind === 'hall' || kind === 'score', scale = norm ? A.normScale(ir) : 1, len = ir.length, T = len + Math.round(0.5 * rate);
      const render = async (how, plain) => {
        const c = new OfflineAudioContext(2, T, rate), long = [];
        const mkc = c.createConvolver.bind(c);
        c.createConvolver = () => { const n = mkc(); const d = Object.getOwnPropertyDescriptor(AudioNode.prototype, 'buffer') || Object.getOwnPropertyDescriptor(ConvolverNode.prototype, 'buffer');
          Object.defineProperty(n, 'buffer', { set(b) { long.push(b.length); d.set.call(n, b); }, get() { return d.get.call(n); } }); return n; };
        const s = c.createBuffer(1, 1, rate); s.getChannelData(0)[0] = 1;
        const src = c.createBufferSource(); src.buffer = s; src.start(0);
        let fit = null, got = 'whole';
        if (plain) { const cv = mkc(); cv.normalize = norm; cv.buffer = ir; src.connect(cv); cv.connect(c.destination); }
        else { const v = A.reverb(ir, scale, c, how); fit = v.tail || null; got = v.how; src.connect(v.input); v.output.connect(c.destination); }
        const o = await c.startRendering();
        return { L: o.getChannelData(0), R: o.getChannelData(1), long, fit, how: got };
      };
      const own = await render(null, true), whole = await render('whole'), hyb = await render('hybrid');
      const S = hyb.fit ? hyb.fit.S : Math.round(0.25 * rate);
      // the whole path against the browser's own
      let pk = 0, df = 0; for (let i = 0; i < T; i++) { pk = Math.max(pk, Math.abs(own.L[i])); df = Math.max(df, Math.abs(own.L[i] - whole.L[i]), Math.abs(own.R[i] - whole.R[i])); }
      // a band of a response (first-order sections in turn, two each way: enough to tell low from high)
      const band = (x, lo, hi) => { const o = new Float64Array(x.length); for (let i = 0; i < x.length; i++) o[i] = x[i];
        const lp = f => { const k = 1 - Math.exp(-2 * Math.PI * f / rate); for (let pass = 0; pass < 2; pass++) { let y = 0; for (let i = 0; i < o.length; i++) { y += k * (o[i] - y); o[i] = y; } } };
        const hp = f => { const k = 1 - Math.exp(-2 * Math.PI * f / rate); for (let pass = 0; pass < 2; pass++) { let y = 0; for (let i = 0; i < o.length; i++) { y += k * (o[i] - y); o[i] -= y; } } };
        if (hi) lp(hi); if (lo) hp(lo); return o; };
      const edc = (L, R) => { const e = new Float64Array(T + 1); for (let i = T - 1; i >= 0; i--) e[i] = e[i + 1] + L[i] * L[i] + R[i] * R[i]; return e; };
      const cmp = (eW, eH, floor) => { let worst = 0; const ref = eW[S]; for (let i = S; i < T; i += 64) { if (eW[i] < ref * Math.pow(10, -floor / 10)) break; worst = Math.max(worst, Math.abs(10 * Math.log10(eH[i] / eW[i]))); } return worst; };
      // how far the whole response's own decay is from an exponential's (a straight line through its first 30 dB): a
      // tail made by feedback loops is a sum of exponentials, and can come no closer than this
      const bend = e => { const pts = []; for (let i = S; i < T; i += 64) { const db = 10 * Math.log10(e[i] / e[S] + 1e-30); if (db < -30) break; pts.push([(i - S) / rate, db]); }
        const n = pts.length, st = pts.reduce((a, q) => a + q[0], 0), sd = pts.reduce((a, q) => a + q[1], 0), stt = pts.reduce((a, q) => a + q[0] * q[0], 0), std = pts.reduce((a, q) => a + q[0] * q[1], 0);
        const m = (n * std - st * sd) / (n * stt - st * st), b0 = (sd - m * st) / n; return Math.max(...pts.map(q => Math.abs(q[1] - (m * q[0] + b0)))); };
      const eW = edc(whole.L, whole.R), eH = edc(hyb.L, hyb.R);
      const lowW = edc(band(whole.L, 0, 500), band(whole.R, 0, 500)), lowH = edc(band(hyb.L, 0, 500), band(hyb.R, 0, 500));
      const hiW = edc(band(whole.L, 3000, 0), band(whole.R, 3000, 0)), hiH = edc(band(hyb.L, 3000, 0), band(hyb.R, 3000, 0));
      // the seam: 20 ms windows, each against the whole response's, three windows smoothed
      const win = Math.round(0.02 * rate), en = (x, y, a) => { let s = 0; for (let i = a; i < a + win; i++) s += x[i] * x[i] + y[i] * y[i]; return s; };
      const seam = []; for (let a = Math.round(0.15 * rate); a + 3 * win < Math.min(T, Math.round(0.6 * rate)); a += win) { let w = 0, h = 0; for (let k = 0; k < 3; k++) { w += en(whole.L, whole.R, a + k * win); h += en(hyb.L, hyb.R, a + k * win); } if (w > 0) seam.push(10 * Math.log10(h / w)); }
      // density and the channels' correlation, after the seam
      const ned = x => { const out = []; for (let a = S + win; a + win < Math.min(T, S + Math.round(0.5 * rate)); a += win) { let s2 = 0; for (let i = a; i < a + win; i++) s2 += x[i] * x[i]; const sd = Math.sqrt(s2 / win); let n = 0; for (let i = a; i < a + win; i++) if (Math.abs(x[i]) > sd) n++; out.push(n / win / 0.3173); } return out.reduce((a, b) => a + b, 0) / out.length; };
      let xy = 0, xx = 0, yy = 0; for (let i = S; i < T; i++) { xy += hyb.L[i] * hyb.R[i]; xx += hyb.L[i] ** 2; yy += hyb.R[i] ** 2; }
      // repetition: the tail's own correlation at lags of 40 to 160 ms (the combs' delays and their sums), against the whole
      // response's, which is noise
      const rep = (L, R) => { let worst = 0; const a0 = S, a1 = Math.min(T, S + Math.round(1.2 * rate)); for (let lag = Math.round(0.04 * rate); lag <= Math.round(0.16 * rate); lag += 8) { let xy = 0, xx = 0, yy = 0; for (let i = a0; i + lag < a1; i++) { xy += L[i] * L[i + lag] + R[i] * R[i + lag]; xx += L[i] * L[i] + R[i] * R[i]; yy += L[i + lag] * L[i + lag] + R[i + lag] * R[i + lag]; } worst = Math.max(worst, Math.abs(xy / Math.sqrt(xx * yy || 1))); } return worst; };
      const repH = rep(hyb.L, hyb.R), repW = rep(whole.L, whole.R);
      // where the decay is furthest off (s after the head)
      let wAt = 0, wDb = 0; for (let i = S; i < T; i += 64) { if (eW[i] < eW[S] * 1e-3) break; const d = Math.abs(10 * Math.log10(eH[i] / eW[i])); if (d > wDb) { wDb = d; wAt = (i - S) / rate; } }
      // the tail's energy as rendered, against what the page found
      let eTail = 0; for (let i = S; i < T; i++) eTail += hyb.L[i] ** 2 + hyb.R[i] ** 2;
      return { len, S, how: hyb.how, bend: bend(eW), total: 10 * Math.log10(eH[0] / eW[0]), whole: 20 * Math.log10(df / pk + 1e-12), edc: cmp(eW, eH, 30), low: cmp(lowW, lowH, 25), high: cmp(hiW, hiH, 25), seam: Math.max(...seam.map(Math.abs)),
        ned: Math.min(ned(hyb.L), ned(hyb.R)), nedWhole: Math.min(ned(whole.L), ned(whole.R)), corr: xy / Math.sqrt(xx * yy || 1), cal: 10 * Math.log10(eTail / (eW[S] || 1)),
        fitCal: hyb.fit ? 10 * Math.log10((eTail) / hyb.fit.energy) : null, repH, repW, wAt, rt: hyb.fit && hyb.fit.rt, longest: Math.max(...hyb.long), limit: A.RT_FRAMES, pieces: hyb.long.length };
    }, [rate, kind]);
    const exact = engine === 'chromium' && r.how === 'hybrid', f = [], tol = 2 + r.bend;
    if (engine === 'chromium' && r.how === 'head' && !(Math.abs(r.total) <= 0.2)) f.push(`its head alone ${r.total.toFixed(2)} dB off the whole`);
    if (engine === 'chromium' && !(r.whole < -80)) f.push(`whole ${r.whole.toFixed(1)} dB`);
    if (exact && !(r.edc <= tol)) f.push(`decay ${r.edc.toFixed(1)} dB off (allowed ${tol.toFixed(1)})`);
    if (exact && !(r.low <= tol + 1.5)) f.push(`low band ${r.low.toFixed(1)} dB off`);
    if (exact && !(r.high <= tol + 1.5)) f.push(`high band ${r.high.toFixed(1)} dB off`);
    if (exact && !(r.seam <= 4)) f.push(`seam ${r.seam.toFixed(1)} dB off`);
    if (exact && !(r.ned >= 0.85)) f.push(`echo density ${r.ned.toFixed(2)}`);
    if (exact && !(Math.abs(r.corr) <= 0.3)) f.push(`channels correlated ${r.corr.toFixed(2)}`);
    if (r.how === 'hybrid' && r.fitCal != null && !(Math.abs(r.fitCal) <= 0.5)) f.push(`the page's level ${r.fitCal.toFixed(2)} dB off what renders`);
    if (exact && !(r.repH <= Math.max(0.2, r.repW + 0.1))) f.push(`the tail repeats itself (correlation ${r.repH.toFixed(2)} at a comb's lag)`);
    if (!(r.longest <= r.limit)) f.push(`a convolver of ${r.longest} frames, over the limit ${r.limit}`);
    console.log(`${f.length ? 'FAIL' : 'ok  '} ${engine} ${kind.padEnd(7)} ${rate}: ${(r.len / rate).toFixed(2)} s, ${r.how}, head ${r.S} frames, its own bend from an exponential ${r.bend.toFixed(1)} dB, rt ${r.rt ? r.rt.toFixed(2) : '-'} s; whole ${r.whole.toFixed(0)} dB; decay within ${r.edc.toFixed(1)} dB (worst ${r.wAt.toFixed(2)} s on; low ${r.low.toFixed(1)}, high ${r.high.toFixed(1)}); seam ${r.seam.toFixed(1)} dB; density ${r.ned.toFixed(2)} (whole ${r.nedWhole.toFixed(2)}); L/R ${r.corr.toFixed(2)}; repeats ${r.repH.toFixed(2)} (whole ${r.repW.toFixed(2)}); level found ${r.fitCal == null ? '-' : r.fitCal.toFixed(2)} dB; convolvers ${r.pieces}, longest ${r.longest}${f.length ? '   ' + f.join('; ') : ''}`);
    if (f.length) errors.push(`${kind} ${rate}: ${f.join('; ')}`);
  }
  await b.close();
  console.log(errors.length ? `FAIL ${errors.length}` : 'PASS');
  process.exit(errors.length ? 1 : 0);
})();
