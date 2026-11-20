// The trailers' score (docs/TRAILER.md): synthesised in an OfflineAudioContext from the shot list's own cues, so that
// every hit, shutter and silence falls on its cut, and a shot made longer or shorter moves its sound with it. No audio
// files: a felt piano, a low drone, the "braam" of low brass, impacts, risers, a drum ensemble, a string ostinato, a
// choir, a camera's shutter and film advance, the Scramble's own crossing calls, the city's air, rain and thunder.
// Run by tools/trailer.js --score in a blank page (it is not part of the game: the game's sound is web/game/audio.js).
//
//   score: {root: 49 (midi), scale: [0, 2, 3, 5, 7, 8, 10], events: [{at, kind, ...}]}
//   at: seconds, "shot" (its start), "shot@0.5" (half way through it), "shot+1.2" / "shot-0.3" (seconds from its start)
//   kinds: city, drone, piano, arp, motif, braam, hit, boom, riser, reverse, shutter, advance, chirp, stop, shimmer, heart,
//          pulse, drums, choir, strings, rain, thunder, whoosh, tick, duck (the city's air taken down, for a silence)
'use strict';
window.OETrailerScore = (function () {
  const SR = 48000;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function when(at, shots) {
    if (typeof at === 'number') return at;
    const m = /^([\w-]+)(?:@([\d.]+)|([+-][\d.]+))?$/.exec(at);
    if (!m) throw new Error(`score: at ${at}`);
    const s = shots.find(q => q.id === m[1]);
    if (!s) throw new Error(`score: no shot ${m[1]}`);
    return s.t0 + (m[2] != null ? +m[2] * s.dur : m[3] != null ? +m[3] : 0);
  }

  async function render(plan, shots, total) {
    const ctx = new OfflineAudioContext(2, Math.ceil((total + 0.5) * SR), SR);
    const T = x => when(x, shots);
    // the mix: everything into a bus, a glue compressor, a limiter; a long hall for what asks for it
    const bus = ctx.createGain(); bus.gain.value = 0.9;
    const glue = ctx.createDynamicsCompressor(); Object.assign(glue, {}); glue.threshold.value = -16; glue.ratio.value = 3; glue.attack.value = 0.02; glue.release.value = 0.3; glue.knee.value = 8;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -3; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12; lim.knee.value = 0;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 30; hp.Q.value = 0.7; // (nothing under hearing eats the headroom)
    bus.connect(hp); hp.connect(glue); glue.connect(lim); lim.connect(ctx.destination);
    const hall = ctx.createConvolver(); hall.buffer = impulse(ctx, 4.2, 2.6); const hallIn = ctx.createGain(); hallIn.gain.value = 0.55; hallIn.connect(hall); hall.connect(bus);
    const room = ctx.createConvolver(); room.buffer = impulse(ctx, 1.4, 3.5); const roomIn = ctx.createGain(); roomIn.gain.value = 0.5; roomIn.connect(room); room.connect(bus);
    const white = noise(ctx, 6), brown = brownNoise(ctx, 6), pink = pinkNoise(ctx, 6);
    const root = plan.root ?? 49, scale = plan.scale || [0, 2, 3, 5, 7, 8, 10];
    const deg = (d, oct = 0) => root + 12 * oct + scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    // the city's air: what a silence takes away (duck events)
    const cityGain = ctx.createGain(); cityGain.gain.value = 1; cityGain.connect(bus);

    // ---- building blocks
    function out(node, { gain = 1, pan = 0, wet = 0, dry = 1, room: rw = 0, to = bus } = {}) {
      const g = ctx.createGain(); g.gain.value = gain; node.connect(g);
      let o = g;
      if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); o = p; }
      if (dry) { const d = ctx.createGain(); d.gain.value = dry; o.connect(d); d.connect(to); }
      if (wet) { const w = ctx.createGain(); w.gain.value = wet; o.connect(w); w.connect(hallIn); }
      if (rw) { const w = ctx.createGain(); w.gain.value = rw; o.connect(w); w.connect(roomIn); }
      return g;
    }
    function src(buf, t, dur, { rate = 1, offset = Math.random() * 3, loop = true } = {}) {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = loop; s.playbackRate.value = rate;
      s.start(Math.max(0, t), offset % (buf.duration - 0.01)); s.stop(Math.max(0, t) + dur + 0.05);
      return s;
    }
    function osc(type, f, t, dur, detune = 0) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; o.start(Math.max(0, t)); o.stop(Math.max(0, t) + dur + 0.05); return o; }
    function filt(type, f, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
    function env(g, t, pts) { // pts: [[dt, value, 'lin'|'exp'|'set'], ...] from t
      const p = g.gain || g;
      p.setValueAtTime(pts[0][1], Math.max(0, t + pts[0][0]));
      for (const [dt, v, k] of pts.slice(1)) {
        const at = Math.max(0, t + dt);
        if (k === 'exp') p.exponentialRampToValueAtTime(Math.max(1e-5, v), at); else if (k === 'set') p.setValueAtTime(v, at); else p.linearRampToValueAtTime(v, at);
      }
      return g;
    }
    const gainNode = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const shaper = amt => { const w = ctx.createWaveShaper(), n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * amt) / Math.tanh(amt); } w.curve = c; return w; };

    // ---- instruments
    const I = {
      // the city's air: a low rumble of traffic, a murmur of the crowd, a lift of the screens' hum
      city(t, e) {
        const dur = T(e.until) - t, g = gainNode(0);
        const r = src(brown, t, dur), lp = filt('lowpass', 420), lh = filt('highpass', 80), rg = gainNode(0.2); r.connect(lh); lh.connect(lp); lp.connect(rg); rg.connect(g);
        const m = src(pink, t, dur), bp = filt('bandpass', 650, 0.6), am = gainNode(0.5), lfo = osc('sine', 0.23, t, dur); const lg = gainNode(0.3); lfo.connect(lg); lg.connect(am.gain);
        m.connect(bp); bp.connect(am); am.connect(g);
        const hp = src(white, t, dur), hf = filt('bandpass', 5200, 0.8), hg = gainNode(0.11); hp.connect(hf); hf.connect(hg); hg.connect(g);
        env(g, t, [[0, 0], [e.fade ?? 2, e.gain ?? 0.22], [dur - (e.fadeOut ?? 1), e.gain ?? 0.22], [dur, 0]]);
        out(g, { to: cityGain, room: 0.15 });
      },
      // a long low note, two detuned saws and a sine an octave under, opening slowly
      drone(t, e) {
        const dur = T(e.until) - t, n = e.note ?? root - 24, g = gainNode(0), lp = filt('lowpass', e.cut ?? 260, 0.9);
        for (const [m, d] of [[n, -7], [n, 7], [n + 7, 4], [n + 12, -3]]) osc('sawtooth', mtof(m), t, dur, d).connect(lp);
        const sb = gainNode(0.5); osc('sine', mtof(n), t, dur).connect(sb); sb.connect(g);
        lp.connect(g);
        lp.frequency.setValueAtTime(e.cut ?? 260, t); lp.frequency.linearRampToValueAtTime(e.open ?? 520, t + dur * 0.7);
        env(g, t, [[0, 0], [e.fade ?? 3, e.gain ?? 0.12], [dur - (e.fadeOut ?? 2), e.gain ?? 0.12], [dur, 0]]);
        out(g, { wet: 0.3 });
      },
      // a felt piano: partials a little stretched, the higher dying sooner, a soft hammer, a big room
      piano(t, e) {
        const notes = e.notes || [e.note ?? root], every = e.every ?? 0;
        notes.forEach((m, i) => pianoNote(t + i * every, m, e.vel ?? 0.5, e.len ?? 4));
      },
      // an ostinato on the piano: the notes in turn, `div` to a beat, louder or softer from `from` to 1 over its length
      arp(t, e) {
        const until = T(e.until), step = 60 / (e.bpm ?? 112) / (e.div ?? 2), ns = e.notes || [deg(0, 0), deg(2, 0), deg(4, 0), deg(2, 1)];
        let i = 0;
        for (let s = t; s < until - 0.01; s += step, i++) { const r = (e.from ?? 1) + (1 - (e.from ?? 1)) * (s - t) / Math.max(0.1, until - t); pianoNote(s, ns[i % ns.length], (e.vel ?? 0.3) * r * (i % (e.div ?? 2) ? 0.8 : 1), e.len ?? 2.5); }
      },
      motif(t, e) { // the story's own phrase (game.json overture.score.motif) in the scale, from degree to degree
        const ds = e.degrees || [4, 2, 1, 0, 2], every = e.every ?? 0.75;
        ds.forEach((d, i) => pianoNote(t + i * every, deg(d, e.oct ?? 1), (e.vel ?? 0.45) * (i === ds.length - 1 ? 0.8 : 1), e.len ?? 5));
      },
      // low brass, the trailer's horn: a cluster of saws an octave apart, driven, the filter swelling open and shut
      braam(t, e) {
        const dur = e.dur ?? 3, n = e.note ?? root - 24, g = gainNode(0), lp = filt('lowpass', 120, 1.4), dr = shaper(2.2), mix = gainNode(0.22);
        for (const m of [n, n, n + 12, n + 12, n + 7 + 12, n + 24]) for (const d of [-11, 0, 9]) osc('sawtooth', mtof(m), t, dur, d + (Math.random() - 0.5) * 4).connect(mix);
        mix.connect(lp); lp.connect(dr); dr.connect(g);
        lp.frequency.setValueAtTime(110, t); lp.frequency.exponentialRampToValueAtTime(e.bright ?? 1500, t + (e.peak ?? 0.35)); lp.frequency.exponentialRampToValueAtTime(260, t + dur);
        env(g, t, [[0, 0], [0.06, e.gain ?? 0.5], [dur * 0.6, (e.gain ?? 0.5) * 0.7], [dur, 0.0001, 'exp']]);
        const sub = osc('sine', mtof(n - 12), t, dur), sg = env(gainNode(0), t, [[0, 0], [0.04, 0.5 * (e.gain ?? 0.5)], [dur, 0.0001, 'exp']]); sub.connect(sg);
        out(sg, {});
        out(g, { wet: 0.35, room: 0.2 });
      },
      // an impact: a sub falling away, a burst of air, a struck low metal
      hit(t, e) {
        const k = e.gain ?? 0.8;
        const s = osc('sine', 110, t, 3); s.frequency.setValueAtTime(e.from ?? 120, t); s.frequency.exponentialRampToValueAtTime(e.to ?? 34, t + (e.fall ?? 0.8));
        const sg = env(gainNode(0), t, [[0, 0], [0.004, k], [2.6, 0.0001, 'exp']]); s.connect(sg); out(sg, { wet: 0.2 });
        const nb = src(white, t, 0.6), nl = filt('lowpass', 2600), ng = env(gainNode(0), t, [[0, 0], [0.002, 0.5 * k], [0.45, 0.0001, 'exp']]); nb.connect(nl); nl.connect(ng); out(ng, { wet: 0.5 });
        const mg = env(gainNode(0), t, [[0, 0], [0.003, 0.12 * k], [3.5, 0.0001, 'exp']]);
        for (const r of [1, 2.76, 5.4, 8.93, 13.3]) osc('sine', (e.metal ?? 62) * r, t, 3.6).connect(mg);
        out(mg, { wet: 0.8 });
      },
      // a deep boom with no metal: for the cards
      boom(t, e) {
        const k = e.gain ?? 0.7, s = osc('sine', 80, t, 2.5); s.frequency.setValueAtTime(e.from ?? 85, t); s.frequency.exponentialRampToValueAtTime(30, t + 1.4);
        const g = env(gainNode(0), t, [[0, 0], [0.008, k], [2.2, 0.0001, 'exp']]); s.connect(g); out(g, { wet: 0.4 });
        const nb = src(brown, t, 1), nl = filt('lowpass', 300), ng = env(gainNode(0), t, [[0, 0], [0.01, 0.7 * k], [1.2, 0.0001, 'exp']]); nb.connect(nl); nl.connect(ng); out(ng, { wet: 0.4 });
      },
      // air rising to the next cut: noise through a climbing band, a climbing saw, louder all the way, cut off at the end
      riser(t, e) {
        const end = T(e.until), dur = end - t, g = gainNode(0);
        const n = src(white, t, dur), bp = filt('bandpass', 300, 2.5); n.connect(bp); bp.connect(g);
        bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(e.top ?? 7000, end);
        const o = osc('sawtooth', 90, t, dur), og = gainNode(0.25), ol = filt('lowpass', 2000); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(e.pitch ?? 700, end); o.connect(ol); ol.connect(og); og.connect(g);
        env(g, t, [[0, 0.0001], [dur - 0.02, e.gain ?? 0.3, 'exp'], [dur, 0]]);
        out(g, { wet: 0.4 });
      },
      // a cymbal played backwards, swelling into the cut
      reverse(t, e) {
        const end = T(e.until), dur = end - t, g = gainNode(0), n = src(white, t, dur), hp = filt('highpass', 3500); n.connect(hp); hp.connect(g);
        env(g, t, [[0, 0.0001], [dur - 0.01, e.gain ?? 0.25, 'exp'], [dur, 0]]);
        out(g, { wet: 0.6 });
      },
      // a rangefinder's shutter: the first curtain, the second, the click of the mechanism
      shutter(t, e) {
        const k = e.gain ?? 0.5;
        for (const [dt, f, a] of [[0, 3200, 1], [0.018, 1800, 0.6], [0.042, 2600, 0.85]]) {
          const n = src(white, t + dt, 0.04), bp = filt('bandpass', f, 1.8), g = env(gainNode(0), t + dt, [[0, 0], [0.0008, k * a], [0.025, 0.0001, 'exp']]);
          n.connect(bp); bp.connect(g); out(g, { room: 0.6, wet: e.wet ?? 0.15 });
        }
        const th = osc('sine', 190, t, 0.1), tg = env(gainNode(0), t, [[0, 0], [0.002, 0.3 * k], [0.07, 0.0001, 'exp']]); th.connect(tg); out(tg, { room: 0.4 });
      },
      // the film wound on: a ratchet
      advance(t, e) {
        const n = e.clicks ?? 7, len = e.len ?? 0.32;
        for (let i = 0; i < n; i++) { const dt = len * i / n * (1 + 0.1 * Math.sin(i)); I.tick(t + dt, { gain: (e.gain ?? 0.18) * (0.7 + 0.3 * (i % 2)), f: 4200 }); }
        const z = src(white, t, len), bp = filt('bandpass', 1400, 1.5), g = env(gainNode(0), t, [[0, 0], [0.03, 0.03], [len, 0.0001, 'exp']]); z.connect(bp); bp.connect(g); out(g, { room: 0.5 });
      },
      tick(t, e) {
        const n = src(white, t, 0.02), bp = filt('bandpass', e.f ?? 2400, 4), g = env(gainNode(0), t, [[0, 0], [0.0005, e.gain ?? 0.2], [0.012, 0.0001, 'exp']]);
        n.connect(bp); bp.connect(g); out(g, { room: 0.5 });
      },
      // the Scramble's crossing calls: the chick's "piyo" and the cuckoo's two notes, from across the road
      chirp(t, e) {
        const until = T(e.until ?? t + 4), g = gainNode(e.gain ?? 0.05);
        for (let s = t, i = 0; s < until; s += 1.0, i++) {
          if (e.cuckoo && i % 2) { for (const [dt, f] of [[0, 1180], [0.32, 960]]) { const o = osc('sine', f, s + dt, 0.25), og = env(gainNode(0), s + dt, [[0, 0], [0.01, 0.8], [0.22, 0.0001, 'exp']]); o.connect(og); og.connect(g); } continue; }
          for (const dt of [0, 0.16]) {
            const o = osc('sine', 3300, s + dt, 0.12); o.frequency.setValueAtTime(3400, s + dt); o.frequency.exponentialRampToValueAtTime(2300, s + dt + 0.07);
            const og = env(gainNode(0), s + dt, [[0, 0], [0.006, 0.9], [0.09, 0.0001, 'exp']]); o.connect(og); og.connect(g);
          }
        }
        out(g, { room: 0.7, wet: 0.2, pan: e.pan ?? -0.2 });
      },
      // time stopped: the air sucked out (a short reverse swell into the moment), then a still glass chord over nothing
      stop(t, e) {
        I.reverse(t - 0.45, { until: t, gain: 0.18 });
        I.hit(t, { gain: e.gain ?? 0.7, from: 90, to: 28, fall: 1.4, metal: 48 });
        I.shimmer(t + 0.05, { until: e.until ?? t + 6, gain: e.shimmer ?? 0.05 });
      },
      // high sines beating slowly against each other: the held world's ringing
      shimmer(t, e) {
        const dur = T(e.until) - t, g = gainNode(0);
        for (const [m, d] of [[deg(0, 3), 0], [deg(4, 3), 3], [deg(2, 4), -4], [deg(6, 4), 2], [deg(0, 5), 6]]) {
          const o = osc('sine', mtof(m), t, dur, d), og = gainNode(0.2), l = osc('sine', 0.15 + Math.random() * 0.3, t, dur), lg = gainNode(0.12); l.connect(lg); lg.connect(og.gain); o.connect(og); og.connect(g);
        }
        env(g, t, [[0, 0], [e.attack ?? 1.2, e.gain ?? 0.05], [Math.max(1.3, dur - (e.fadeOut ?? 1.5)), e.gain ?? 0.05], [dur, 0]]);
        out(g, { wet: 0.9, dry: 0.5 });
      },
      heart(t, e) {
        const until = T(e.until), per = 60 / (e.bpm ?? 54);
        for (let s = t; s < until; s += per) for (const [dt, a] of [[0, 1], [0.22, 0.6]]) {
          const o = osc('sine', 52, s + dt, 0.3); o.frequency.setValueAtTime(70, s + dt); o.frequency.exponentialRampToValueAtTime(40, s + dt + 0.15);
          const g = env(gainNode(0), s + dt, [[0, 0], [0.01, (e.gain ?? 0.35) * a], [0.22, 0.0001, 'exp']]); o.connect(g); out(g, {});
        }
      },
      // the low strings' ostinato: sixteenths on the root and fifth, opening as it builds
      pulse(t, e) {
        const until = T(e.until), dur = until - t, step = 60 / (e.bpm ?? 120) / 4, g = gainNode(0), lp = filt('lowpass', 500, 1.2);
        const notes = e.notes || [root - 12, root - 12, root - 5, root - 12];
        let i = 0;
        for (let s = t; s < until - 0.01; s += step, i++) {
          const m = notes[i % notes.length], ng = env(gainNode(0), s, [[0, 0], [0.008, 0.5], [step * 0.85, 0.0001, 'exp']]);
          for (const d of [-6, 6]) osc('sawtooth', mtof(m), s, step, d).connect(ng);
          ng.connect(lp);
        }
        lp.frequency.setValueAtTime(e.cut ?? 450, t); lp.frequency.exponentialRampToValueAtTime(e.open ?? 2600, until);
        lp.connect(g);
        env(g, t, [[0, 0.0001], [Math.min(1.5, dur), (e.gain ?? 0.16) * 0.5, 'exp'], [dur, e.gain ?? 0.16, 'lin']]);
        out(g, { wet: 0.2, room: 0.3 });
      },
      // the ensemble: taiko and low toms on the beat, a snare's air on the backbeat, louder as it goes
      drums(t, e) {
        const until = T(e.until), beat = 60 / (e.bpm ?? 120), pat = e.pattern || 'Tt.t T.tt Tt.T T.Tt';
        const steps = pat.replace(/ /g, ''), st = beat / 2, dur = until - t;
        let i = 0;
        for (let s = t; s < until - 0.01; s += st, i++) {
          const c = steps[i % steps.length], ramp = (e.from ?? 0.4) + (1 - (e.from ?? 0.4)) * ((s - t) / dur), k = (e.gain ?? 0.6) * ramp;
          if (c === 'T') taiko(s, 58, k);
          else if (c === 't') taiko(s, 92, k * 0.55);
          if (e.snare && i % 4 === 2) snare(s, k * 0.5);
        }
      },
      // a choir's "ah": saws through two vowel formants, slow to come
      choir(t, e) {
        const dur = e.dur ?? 4, g = gainNode(0), f1 = filt('bandpass', 760, 5), f2 = filt('bandpass', 1150, 6), mix = gainNode(0.3);
        for (const m of e.notes || [deg(0, 0), deg(4, 0), deg(2, 1)]) for (const d of [-9, 0, 8]) osc('sawtooth', mtof(m), t, dur, d).connect(mix);
        mix.connect(f1); mix.connect(f2); f1.connect(g); f2.connect(g);
        env(g, t, [[0, 0], [e.attack ?? 1.2, e.gain ?? 0.35], [dur - (e.release ?? 1.5), e.gain ?? 0.35], [dur, 0]]);
        out(g, { wet: 0.9 });
      },
      strings(t, e) {
        const dur = e.dur ?? 4, g = gainNode(0), lp = filt('lowpass', e.cut ?? 1800, 0.8), mix = gainNode(0.12);
        for (const m of e.notes || [deg(0, -1), deg(2, 0), deg(4, 0)]) for (const d of [-12, -4, 5, 11]) { const o = osc('sawtooth', mtof(m), t, dur, d), v = osc('sine', 5 + Math.random(), t, dur), vg = gainNode(6); v.connect(vg); vg.connect(o.detune); o.connect(mix); }
        mix.connect(lp); lp.connect(g);
        env(g, t, [[0, 0], [e.attack ?? 1.5, e.gain ?? 0.3], [dur - (e.release ?? 1.5), e.gain ?? 0.3], [dur, 0]]);
        out(g, { wet: 0.6, room: 0.2 });
      },
      rain(t, e) {
        const dur = T(e.until) - t, g = gainNode(0), n = src(white, t, dur), hp = filt('highpass', 900), lp = filt('lowpass', 9000); n.connect(hp); hp.connect(lp); lp.connect(g);
        const p = src(pink, t, dur), pl = filt('lowpass', 1500), pg = gainNode(0.6); p.connect(pl); pl.connect(pg); pg.connect(g);
        env(g, t, [[0, 0], [e.fade ?? 1.5, e.gain ?? 0.12], [dur - 0.8, e.gain ?? 0.12], [dur, 0]]);
        out(g, { room: 0.3 });
      },
      thunder(t, e) {
        const k = e.gain ?? 0.6, n = src(brown, t, 6), lp = filt('lowpass', 260), g = env(gainNode(0), t, [[0, 0], [0.05, k], [0.8, k * 0.5], [5.5, 0.0001, 'exp']]); n.connect(lp); lp.connect(g); out(g, { wet: 0.5 });
        const c = src(white, t, 0.6), cl = filt('bandpass', 900, 0.8), cg = env(gainNode(0), t, [[0, 0], [0.01, k * 0.35], [0.5, 0.0001, 'exp']]); c.connect(cl); cl.connect(cg); out(cg, { wet: 0.6 });
      },
      whoosh(t, e) {
        const dur = e.dur ?? 0.8, n = src(white, t, dur), bp = filt('bandpass', 400, 1.6), g = env(gainNode(0), t, [[0, 0], [dur * 0.6, e.gain ?? 0.2], [dur, 0]]);
        bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(3000, t + dur * 0.6); bp.frequency.exponentialRampToValueAtTime(600, t + dur);
        n.connect(bp); bp.connect(g); out(g, { wet: 0.3, pan: e.pan ?? 0 });
      },
      // the city's air taken down (and brought back after `back` seconds, if given)
      duck(t, e) {
        const p = cityGain.gain;
        p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(e.to ?? 0, t + (e.fade ?? 0.08));
        if (e.back != null) { p.setValueAtTime(e.to ?? 0, T(e.back)); p.linearRampToValueAtTime(1, T(e.back) + (e.fadeBack ?? 1.5)); }
      },
    };
    function pianoNote(t, m, vel, len) {
      const f0 = mtof(m), g = gainNode(0), lp = filt('lowpass', 900 + 5000 * vel, 0.5), B = 0.00035;
      for (let n = 1; n <= 9; n++) {
        const f = f0 * n * Math.sqrt(1 + B * n * n);
        if (f > 12000) break;
        const o = osc('sine', f, t, len), og = env(gainNode(0), t, [[0, 0], [0.004, vel / Math.pow(n, 1.25)], [len / (1 + n * 0.6), 0.0001, 'exp']]);
        o.connect(og); og.connect(lp);
      }
      const h = src(white, t, 0.05), hl = filt('lowpass', 1800), hg = env(gainNode(0), t, [[0, 0], [0.001, 0.05 * vel], [0.04, 0.0001, 'exp']]); h.connect(hl); hl.connect(hg); hg.connect(lp);
      lp.connect(g); g.gain.value = 0.55;
      out(g, { wet: 0.55, room: 0.2 });
    }
    function taiko(t, f, k) {
      const o = osc('sine', f, t, 0.8); o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      const g = env(gainNode(0), t, [[0, 0], [0.003, k], [0.55, 0.0001, 'exp']]); o.connect(g); out(g, { room: 0.35, wet: 0.15 });
      const n = src(white, t, 0.1), bp = filt('bandpass', f * 4, 1.2), ng = env(gainNode(0), t, [[0, 0], [0.001, k * 0.35], [0.07, 0.0001, 'exp']]); n.connect(bp); bp.connect(ng); out(ng, { room: 0.4 });
    }
    function snare(t, k) {
      const n = src(white, t, 0.25), bp = filt('bandpass', 2200, 0.7), g = env(gainNode(0), t, [[0, 0], [0.002, k], [0.18, 0.0001, 'exp']]); n.connect(bp); bp.connect(g); out(g, { room: 0.5, wet: 0.3 });
    }

    for (const e of plan.events) {
      const f = I[e.kind];
      if (!f) throw new Error(`score: no instrument ${e.kind}`);
      f(T(e.at), e);
    }
    const buf = await ctx.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let peak = 1e-6;
    for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const k = 0.89 / peak; // (to -1 dBFS)
    const n = Math.round(total * SR), out0 = new Float32Array(n), out1 = new Float32Array(n);
    for (let i = 0; i < n; i++) { out0[i] = L[i] * k; out1[i] = R[i] * k; }
    return [out0, out1];
  }

  // ---- noises and the halls (made here, once; seeded, so a score renders the same each time)
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  function noise(ctx, sec) { const b = ctx.createBuffer(2, sec * SR, SR); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = rnd(); } return b; }
  function brownNoise(ctx, sec) { const b = ctx.createBuffer(2, sec * SR, SR); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let v = 0; for (let i = 0; i < d.length; i++) { v = (v + 0.02 * rnd()) / 1.02; d[i] = v * 3.5; } } return b; }
  function pinkNoise(ctx, sec) {
    const b = ctx.createBuffer(2, sec * SR, SR);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < d.length; i++) { const w = rnd(); b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; } }
    return b;
  }
  function impulse(ctx, sec, decay) {
    const b = ctx.createBuffer(2, Math.round(sec * SR), SR);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) { const t = i / d.length; d[i] = rnd() * Math.pow(1 - t, decay) * (i < 0.01 * SR ? i / (0.01 * SR) : 1); } }
    return b;
  }
  return { render, when };
})();
