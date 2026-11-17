// Listens to a recording made by tools/sound_rec.js (docs/SOUND.md "Listened to") and says what grates:
//   strike   a sound that arrives 20 dB over the 60 ms before it within 5 ms, loud enough to be heard over the bed;
//   click    a lone step in the waveform (its second difference 30 times the local one and over 0.02): a node stopped or
//            a gain set at once, a buffer that ends off zero;
//   clip     a sample at full scale, or a peak over -1 dBFS;
//   seam     the loading cue's loop point: the step there against the steps in the rest of the turn;
//   masked   a line of dialogue whose type ticks stand less than 6 dB over the street and the score under them, in their
//            own band (round 2 kHz, where the ear hears the one against the other);
//   jump     the momentary loudness (ITU-R BS.1770 K-weighting, 400 ms) rising more than 10 LU in half a second, or
//            falling more than 14, over -40 LUFS.
// Each is named by what the story or the sound did nearest to it (events.json). What falls in a stall of the page's
// main thread (a software renderer's, not a device's) is listed apart and does not count.
//   node tools/sound_analyse.js out_dir          (writes out_dir/report.json; exits 1 if anything grates)
'use strict';
const fs = require('fs');
const path = require('path');
const db = x => 20 * Math.log10(Math.max(1e-9, x));
const pw = x => 10 * Math.log10(Math.max(1e-12, x));

function readWav(file) {
  const b = fs.readFileSync(file), ch = b.readUInt16LE(22), rate = b.readUInt32LE(24);
  let o = 12; while (b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4);
  const n = b.readUInt32LE(o + 4) / (2 * ch), d = o + 8, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = b.readInt16LE(d + (i * ch) * 2) / 32768; R[i] = ch > 1 ? b.readInt16LE(d + (i * ch + 1) * 2) / 32768 : L[i]; }
  return { rate, L, R, n };
}
// BS.1770's two filters, from the analogue prototype for any rate (the 48 kHz coefficients the standard lists come out)
function kFilter(rate) {
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196, K = Math.tan(Math.PI * f0 / rate);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416), a0 = 1 + K / Q + K * K;
  const s1 = { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
  const f1 = 38.13547087602444, Q1 = 0.5003270373238773, K1 = Math.tan(Math.PI * f1 / rate), a1 = 1 + K1 / Q1 + K1 * K1;
  const s2 = { b: [1, -2, 1], a: [2 * (K1 * K1 - 1) / a1, (1 - K1 / Q1 + K1 * K1) / a1] };
  return x => { const y = new Float32Array(x.length); for (const s of [s1, s2]) { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; const src = s === s1 ? x : y; for (let i = 0; i < x.length; i++) { const v = src[i], o = s.b[0] * v + s.b[1] * x1 + s.b[2] * x2 - s.a[0] * y1 - s.a[1] * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o; } } return y; };
}

function analyse(dir, opts = {}) {
  const wav = readWav(path.join(dir, 'mix.wav')), { rate, L, R, n } = wav;
  const events = fs.existsSync(path.join(dir, 'events.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'events.json'), 'utf8')) : [];
  const env = fs.existsSync(path.join(dir, 'env.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'env.json'), 'utf8')).rows : [];
  const stalls = events.filter(e => e.kind === 'stall').map(e => [e.t, e.t + e.detail / 1000]);
  const inStall = t => stalls.some(([a, b]) => t >= a - 0.35 && t <= b + 0.35);
  const named = events.filter(e => !['stall', 'beat', 'context', 'visibility', 'place'].includes(e.kind));
  const tail = n / rate - 0.5; // (the recording's own last half second: cut off, not a click)
  const near = (t, w = 0.6) => { let best = null, bd = w; for (const e of named) { const d = Math.abs(e.t - t); if (d <= bd) { bd = d; best = e; } } return best ? `${best.kind}${best.detail != null && typeof best.detail !== 'object' ? ' ' + best.detail : Array.isArray(best.detail) && typeof best.detail[0] !== 'object' ? ' ' + best.detail[0] : best.detail && best.detail.held != null ? ` held:${best.detail.held}` : ''} (${(best.t - t >= 0 ? '+' : '') + (best.t - t).toFixed(2)} s)` : ''; };
  const beatAt = t => { let b = null; for (const e of events) { if (e.kind !== 'beat') continue; if (e.t > t) break; b = e.detail; } return b ? `${b.phase}/${b.beat}/frame ${b.fi + 1}` : 'loading'; };

  // clipping and peaks
  let clip = 0, peak = 0; const hot = [];
  for (let i = 0; i < n; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; if (a >= 0.999) clip++; if (a > 0.891 && (!hot.length || i / rate - hot[hot.length - 1].t > 0.5)) hot.push({ t: +(i / rate).toFixed(2), dbfs: +db(a).toFixed(1) }); }
  // 2 ms blocks of rms: strikes
  const B = Math.round(rate * 0.002), nb = Math.floor(n / B), blk = new Float32Array(nb);
  for (let k = 0; k < nb; k++) { let s = 0; for (let i = k * B; i < (k + 1) * B; i++) s += (L[i] * L[i] + R[i] * R[i]) * 0.5; blk[k] = s / B; }
  const strikes = [];
  for (let k = 33; k < nb - 3; k++) {
    let now = 0, before = 0; for (let j = 0; j < 3; j++) now += blk[k + j]; now /= 3; for (let j = k - 30; j < k; j++) before += blk[j]; before /= 30;
    const rise = pw(now) - pw(before), lvl = pw(now);
    if (rise > 20 && lvl > -42) { const t = k * B / rate; if (!strikes.length || t - strikes[strikes.length - 1].t > 0.15) strikes.push({ t: +t.toFixed(3), rise: +rise.toFixed(1), dbfs: +lvl.toFixed(1) }); else if (rise > strikes[strikes.length - 1].rise) Object.assign(strikes[strikes.length - 1], { rise: +rise.toFixed(1), dbfs: +lvl.toFixed(1) }); }
  }
  // clicks: a lone step in the second difference, against its neighbourhood (±10 ms, leaving out ±1 ms round it)
  const clicks = [];
  for (const x of [L, R]) {
    const d2 = new Float32Array(n); for (let i = 2; i < n; i++) d2[i] = Math.abs(x[i] - 2 * x[i - 1] + x[i - 2]);
    const W = Math.round(rate * 0.01), G = Math.round(rate * 0.001), pre = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + d2[i];
    for (let i = W; i < n - W; i++) {
      if (d2[i] < 0.02) continue;
      const around = (pre[i - G] - pre[i - W] + pre[i + W] - pre[i + G]) / (2 * (W - G));
      if (d2[i] > 30 * around) { const t = i / rate; if (!clicks.length || t - clicks[clicks.length - 1].t > 0.05) clicks.push({ t: +t.toFixed(3), step: +d2[i].toFixed(3), ratio: Math.round(d2[i] / Math.max(1e-6, around)) }); }
    }
  }
  clicks.sort((a, b) => a.t - b.t);
  // momentary loudness, 400 ms every 100 ms
  const kf = kFilter(rate), kL = kf(L), kR = kf(R), hop = Math.round(rate * 0.1), win = 4 * hop, M = [];
  { const sq = new Float64Array(Math.floor(n / hop)); for (let k = 0; k < sq.length; k++) { let s = 0; for (let i = k * hop; i < (k + 1) * hop; i++) s += kL[i] * kL[i] + kR[i] * kR[i]; sq[k] = s / hop; }
    for (let k = 3; k < sq.length; k++) M.push([+((k + 1) * 0.1).toFixed(1), +(-0.691 + pw((sq[k] + sq[k - 1] + sq[k - 2] + sq[k - 3]) / 4)).toFixed(1)]); }
  const jumps = [];
  for (let k = 5; k < M.length; k++) {
    const d = M[k][1] - M[k - 5][1];
    if ((d > 10 && M[k][1] > -40 && M[k - 5][1] > -50) || (d < -14 && M[k - 5][1] > -40)) { /* (a sound coming out of silence is a start, not a jump) */ const t = M[k][0]; if (!jumps.length || t - jumps[jumps.length - 1].t > 1) jumps.push({ t, from: M[k - 5][1], to: M[k][1] }); else if (Math.abs(d) > Math.abs(jumps[jumps.length - 1].to - jumps[jumps.length - 1].from)) Object.assign(jumps[jumps.length - 1], { t, from: M[k - 5][1], to: M[k][1] }); }
  }
  // integrated (gated) loudness
  const gated = (() => { const blocks = M.map(m => m[1]).filter(v => v > -70); if (!blocks.length) return null; const mean = v => -0.691 + pw(v.reduce((s, x) => s + Math.pow(10, (x + 0.691) / 10), 0) / v.length); const rel = mean(blocks) - 10; return +mean(blocks.filter(v => v > rel)).toFixed(1); })();
  // the loading cue's loop seams
  const seams = [];
  for (const e of events.filter(q => q.kind === 'loop-start')) {
    const len = e.detail.seconds, step = t => { const i = Math.round(t * rate); let mx = 0; for (let j = Math.max(2, i - Math.round(rate * 0.02)); j < Math.min(n, i + Math.round(rate * 0.02)); j++) mx = Math.max(mx, Math.abs(L[j] - 2 * L[j - 1] + L[j - 2])); return mx; };
    const end = (events.find(q => q.kind === 'score' && q.t > e.t) || { t: n / rate }).t + 5;
    for (let s = e.t + len; s < Math.min(end, n / rate - 0.1); s += len) {
      let typical = 0; for (let k = 1; k < 20; k++) typical = Math.max(typical, step(s - len * k / 20)); // (the same window at twenty places in the turn)
      const at = step(s), lv = (a, b) => { let q = 0; const i0 = Math.round(a * rate), i1 = Math.round(b * rate); for (let i = i0; i < i1; i++) q += L[i] * L[i]; return pw(q / Math.max(1, i1 - i0)); };
      // (a seam under another sound, a cue or a voice, is not judged: the step there is that sound's)
      const busy = named.some(q => q.kind !== 'loop' && q.kind !== 'loop-start' && q.kind !== 'score' && Math.abs(q.t - s) < 1.5) || undefined;
      seams.push({ t: +s.toFixed(2), step: +at.toFixed(4), typical: +typical.toFixed(4), level: +(lv(s, s + 0.05) - lv(s - 0.05, s)).toFixed(1), busy });
    }
  }
  // dialogue over the street and the score: each tick of a line's type (a 'voice' event) in the band it sounds in (round
  // 2 kHz), against the street and the score in that band while it sounds; a line is as clear as its median tick
  const lines = []; let cur = null;
  for (const e of events.filter(q => q.kind === 'beat')) { const ln = e.detail.line || ''; if (!ln) { cur = null; continue; } if (!cur || ln.slice(0, 6) !== cur.line.slice(0, 6)) { cur = { t: e.t, line: ln, ticks: [] }; lines.push(cur); } else cur.line = ln; }
  const masked = [], said = [], typed = [];
  if (env.length && env[0].length >= 6) {
    const T = env.map(r => r[0]);
    const idx = t => { let lo = 0, hi = T.length; while (lo < hi) { const m = (lo + hi) >> 1; if (T[m] < t) lo = m + 1; else hi = m; } return lo; };
    const span = (a, b) => env.slice(idx(a), idx(b));
    // (a tick is what it adds to the story bus over the 50 ms before it: the bus can hold a cue or the held choir too)
    for (const e of events.filter(q => q.kind === 'voice' || q.kind === 'beep' || (q.kind === 'sfx' && q.detail[0] === 'key'))) {
      // (the page's clock and the audio's agree to a few tens of ms: the tick is looked for within 60 ms of its call, and
      // what was under it is the bus's median over the 0.8 s round it, which the ticks themselves, a third of it, leave)
      const r = span(e.t - 0.06, e.t + 0.06), b = span(e.t - 0.4, e.t + 0.4).map(x => x[5]).sort((p, q) => p - q); if (!r.length) continue;
      const under = b.length ? b[Math.floor(b.length / 2)] : 0;
      const tick = pw(Math.max(...r.map(x => x[5])) - under), bed = pw(r.reduce((s, x) => s + x[4], 0) / r.length), music = pw(r.reduce((s, x) => s + x[1], 0) / r.length);
      let l = e.kind === 'sfx' ? null : lines.filter(q => q.t <= e.t + 0.3).pop();
      if (e.kind === 'sfx') { l = typed.find(q => e.t - q.last < 3); if (!l) { l = { t: e.t, line: '(the preface, typed)', ticks: [] }; typed.push(l); } l.last = e.t; }
      if (l) l.ticks.push({ tick, bed, music });
    }
    for (const l of lines.concat(typed)) {
      if (!l.ticks.length) continue;
      const med = k => l.ticks.map(x => x[k]).sort((a, b) => a - b)[Math.floor(l.ticks.length / 2)];
      const o = { t: +l.t.toFixed(1), line: l.line.slice(0, 50), ticks: l.ticks.length, tick: +med('tick').toFixed(1), bed: +med('bed').toFixed(1), music: +med('music').toFixed(1) };
      o.margin = +(o.tick - o.bed).toFixed(1); said.push(o); if (o.margin < 6) masked.push(o);
    }
  }
  const tag = list => list.map(x => Object.assign(x, { near: near(x.t), beat: beatAt(x.t), stall: inStall(x.t) || undefined }));
  for (const l of [strikes, clicks]) for (let i = l.length - 1; i >= 0; i--) if (l[i].t > tail) l.splice(i, 1);
  said.sort((a, b) => a.t - b.t); masked.sort((a, b) => a.t - b.t);
  [strikes, clicks, jumps, hot, seams, masked].forEach(tag);
  // (a click within half a second of a mechanism's cue is its own transient: the shutter's curtains, the strap, the ratchet)
  const MECH = ['shutter', 'wind', 'cam-up', 'cam-down', 'stamp', 'key', 'wrong', 'thump'];
  for (const c of clicks) if (named.some(e => e.kind === 'sfx' && MECH.includes(e.detail[0]) && c.t - e.t > -0.15 && c.t - e.t < 0.6)) c.designed = true;
  const real = l => l.filter(x => !x.stall && !x.designed);
  const badSeams = seams.filter(s => !s.busy && s.step > Math.max(0.01, s.typical * 1.5) || Math.abs(s.level) > 6);
  const report = {
    seconds: +(n / rate).toFixed(1), rate, peak_dbfs: +db(peak).toFixed(2), clipped_samples: clip, integrated_lufs: gated,
    loudest_momentary: M.reduce((a, m) => (m[1] > a[1] ? m : a), [0, -99]),
    stalls: stalls.length, stalled_seconds: +stalls.reduce((s, [a, b]) => s + b - a, 0).toFixed(1),
    over_minus1: hot, strikes, clicks, jumps, seams, lines: said.length, masked, said,
    margin_median: said.length ? said.map(q => q.margin).sort((a, b) => a - b)[Math.floor(said.length / 2)] : null,
    momentary: M.filter((m, i) => i % 5 === 0), events: events.filter(e => e.kind !== 'stall'),
  };
  report.grating = clip > 0 || hot.length > 0 || real(clicks).length > 0 || badSeams.length > 0 || masked.length > 0 || real(strikes).filter(s => s.rise > 30).length > 0;
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report));
  if (!opts.quiet) {
    const p = (label, l, f) => { const r = real(l); console.log(`${r.length ? '!!' : 'ok'}   ${label}: ${r.length}${l.length - r.length ? ` (and ${l.length - r.length} in stalls)` : ''}`); r.slice(0, 25).forEach(x => console.log(`       ${String(x.t).padStart(7)} s  ${f(x)}  [${x.beat}] ${x.near}`)); };
    console.log(`listened to ${report.seconds} s at ${rate} Hz: peak ${report.peak_dbfs} dBFS, integrated ${gated} LUFS, loudest 400 ms ${report.loudest_momentary[1]} LUFS at ${report.loudest_momentary[0]} s; ${report.stalls} main-thread stalls (${report.stalled_seconds} s)`);
    console.log(`${clip ? '!!' : 'ok'}   samples at full scale: ${clip}`);
    p('peaks over -1 dBFS', hot, x => `${x.dbfs} dBFS`);
    p('strikes (20 dB in 5 ms)', strikes, x => `+${x.rise} dB to ${x.dbfs} dBFS`);
    p('clicks', clicks, x => `step ${x.step}, ${x.ratio}x its neighbourhood`); { const d = clicks.filter(x => x.designed); if (d.length) console.log(`       (and ${d.length} the mechanisms' own: ${[...new Set(d.map(x => x.near.split(' (')[0]))].join(', ')})`); }
    p('loudness jumps', jumps, x => `${x.from} -> ${x.to} LUFS`);
    console.log(`${badSeams.length ? '!!' : 'ok'}   loop seams: ${seams.length} heard, ${badSeams.length} rough`); seams.forEach(s => console.log(`       ${String(s.t).padStart(7)} s  step ${s.step} against ${s.typical} in the turn, level ${s.level} dB`));
    console.log(`${masked.length ? '!!' : 'ok'}   lines of dialogue: ${said.length}, ticks under 6 dB over the bed: ${masked.length}${said.length ? `; margin median ${said.map(s => s.margin).sort((a, b) => a - b)[Math.floor(said.length / 2)]} dB` : ''}`);
    masked.slice(0, 12).forEach(x => console.log(`       ${String(x.t).padStart(7)} s  tick ${x.tick}, bed ${x.bed} (score ${x.music}) dB: "${x.line}"`));
    console.log(report.grating ? 'GRATES' : 'nothing grates');
  }
  return report;
}
module.exports = { analyse, readWav };
if (require.main === module) { const r = analyse(process.argv[2] || '/tmp/sound-rec'); process.exit(r.grating ? 1 : 0); }
