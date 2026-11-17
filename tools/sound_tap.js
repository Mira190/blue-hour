// In-page half of tools/sound_rec.js: added to the page before its own scripts. Every AudioContext the page makes
// gets a tap in place of its destination: a gain that goes on to the speakers and into a recorder (an AudioWorklet,
// so a busy main thread loses nothing: its chunks queue on the port). The recorder sends what the speakers get, as
// 16-bit stereo, to window.__soundSink (a Playwright binding), with the context's clock against performance.now() so
// that two contexts (the game's and the opening's) can be laid on one timeline. For the game's context it also keeps
// the level, every 512 frames, of three buses that are not the mix: the score (music bus, before it is ducked), the street
// with the score (after the duck) and the story's own sound, so that what masks what can be read afterwards.
// It also posts what the page asked the sound to do (cues, voices, the Stop, stings, the score's state) and the story's
// beats, as events on the same clock.
(() => {
  const Base = window.AudioContext || window.webkitAudioContext;
  if (!Base || window.__soundTap) return;
  const sink = (...a) => { try { if (window.__soundSink) window.__soundSink(...a); } catch (e) { /* the page is closing */ } };
  const ev = (kind, detail) => sink('ev', JSON.stringify({ t: performance.now(), kind, detail }));
  window.__soundTap = { ev, contexts: [] };
  const worklet = `
    class Rec extends AudioWorkletProcessor {
      constructor() { super(); this.n = 0; this.L = new Float32Array(9600); this.R = new Float32Array(9600); this.f0 = -1; this.env = []; this.acc = [0, 0, 0, 0, 0]; this.k = 0;
        // (a band-pass round 2 kHz, an octave each way: where the type's ticks are, to read them against the bed there)
        const w = 2 * Math.PI * 2000 / sampleRate, al = Math.sin(w) / (2 * 0.7), a0 = 1 + al; this.bq = [al / a0, 0, -al / a0, -2 * Math.cos(w) / a0, (1 - al) / a0]; this.z = [[0, 0, 0, 0], [0, 0, 0, 0]]; }
      process(ins) {
        const m = ins[0], len = 128;
        if (this.f0 < 0) this.f0 = currentFrame;
        const l = m[0] || null, r = m[1] || l;
        for (let i = 0; i < len; i++) { this.L[this.n + i] = l ? l[i] : 0; this.R[this.n + i] = r ? r[i] : 0; }
        for (let s = 1; s < ins.length && s <= 3; s++) {
          const c = ins[s]; if (!c || !c[0]) continue; const a = c[0], b = c[1] || a; let q = 0, qb = 0;
          const B = this.bq, z = s > 1 ? this.z[s - 2] : null;
          for (let i = 0; i < len; i++) { const x = (a[i] + b[i]) * 0.5; q += (a[i] * a[i] + b[i] * b[i]) * 0.5; if (z) { const y = B[0] * x + B[1] * z[0] + B[2] * z[1] - B[3] * z[2] - B[4] * z[3]; z[1] = z[0]; z[0] = x; z[3] = z[2]; z[2] = y; qb += y * y; } }
          this.acc[s - 1] += q; if (z) this.acc[s + 1] += qb;
        }
        this.k += len; this.n += len;
        if (this.k >= 512) { /* (every 512 frames: 11.6 ms at 44.1 kHz) */ for (const v of this.acc) this.env.push(v / this.k); this.acc = [0, 0, 0, 0, 0]; this.k = 0; }
        if (this.n >= 9600 - 128) {
          this.port.postMessage({ f0: this.f0, L: this.L.slice(0, this.n), R: this.R.slice(0, this.n), env: this.env });
          this.n = 0; this.f0 = -1; this.env = [];
        }
        return true;
      }
    }
    registerProcessor('oe-rec', Rec);`;
  let next = 0;
  class Tapped extends Base {
    constructor(...a) {
      super(...a);
      const id = next++, me = this, real = Object.getOwnPropertyDescriptor(Base.prototype, 'destination') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Base.prototype), 'destination');
      const dest = real.get.call(this), tap = this.createGain();
      tap.connect(dest);
      Object.defineProperty(this, 'destination', { get: () => tap });
      this.__tap = { id, tap, stems: [null, null, null] };
      window.__soundTap.contexts.push(this);
      sink('ctx', JSON.stringify({ id, rate: this.sampleRate, t: performance.now() }));
      ev('context', { id, state: this.state });
      this.addEventListener('statechange', () => ev('context', { id, state: this.state }));
      const url = URL.createObjectURL(new Blob([worklet], { type: 'application/javascript' }));
      this.audioWorklet.addModule(url).then(() => {
        const rec = new AudioWorkletNode(me, 'oe-rec', { numberOfInputs: 4, numberOfOutputs: 1, outputChannelCount: [1] });
        const mute = me.createGain(); mute.gain.value = 0; rec.connect(mute); mute.connect(dest); // (pulled by the graph, silent)
        tap.connect(rec, 0, 0);
        me.__tap.rec = rec;
        me.__tap.stems.forEach((n, i) => { if (n) n.connect(rec, 0, i + 1); });
        rec.port.onmessage = e => {
          const d = e.data, n = d.L.length, pcm = new Int16Array(n * 2);
          for (let i = 0; i < n; i++) { pcm[2 * i] = Math.max(-32768, Math.min(32767, Math.round(d.L[i] * 32767))); pcm[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(d.R[i] * 32767))); }
          // the frame's time on performance.now()'s clock, from the context's own output timestamp
          const o = me.getOutputTimestamp ? me.getOutputTimestamp() : {}, perf = o.performanceTime ? o.performanceTime + (d.f0 / me.sampleRate - o.contextTime) * 1000 : performance.now() - (me.currentTime - d.f0 / me.sampleRate) * 1000;
          // peaks, for clipping: the float samples before the 16-bit clamp
          let pk = 0; for (let i = 0; i < n; i++) { const a = Math.abs(d.L[i]), b = Math.abs(d.R[i]); if (a > pk) pk = a; if (b > pk) pk = b; }
          sink('pcm', JSON.stringify({ id, f0: d.f0, perf, pk, env: d.env }), b64(pcm.buffer));
        };
      }).catch(e => ev('no-recorder', { id, e: String(e) }));
    }
  }
  function b64(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
  window.AudioContext = Tapped; if (window.webkitAudioContext) window.webkitAudioContext = Tapped;
  const stem = (c, i, node) => { if (!c || !c.__tap || c.__tap.stems[i]) return; c.__tap.stems[i] = node; if (c.__tap.rec) node.connect(c.__tap.rec, 0, i + 1); };

  // what the page asks the sound to do: OEAudio's calls, the score's state and stings (wrapped as they are defined)
  const wrap = (obj, name, label, args = a => a) => { const f = obj[name]; if (typeof f !== 'function' || f.__w) return; const g = function (...a) { ev(label || name, args(a)); return f.apply(this, a); }; g.__w = 1; obj[name] = g; };
  let A = null;
  Object.defineProperty(window, 'OEAudio', { configurable: true, get: () => A, set: v => {
    A = v; if (!v) return;
    for (const k of ['sfx', 'voice', 'hush', 'held', 'beep', 'setMuted', 'thump', 'stop']) wrap(v, k);
    const st = v.start; v.start = function (...a) { const r = st.apply(this, a); const c = v.ctx; if (c && c.__tap) { ev('start', { state: c.state }); try { stem(c, 0, v.musicBus()); } catch (e) { /* none yet */ } } return r; };
    const mb = v.musicBus; v.musicBus = function (...a) { const r = mb.apply(this, a); if (r && v.ctx) stem(v.ctx, 0, r); return r; };
  } });
  // (the duck's output and the story bus are the two nodes that reach the destination: found as they connect to it)
  const conn = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dst, ...rest) {
    const c = this.context;
    if (c && c.__tap && dst === c.__tap.tap && this !== c.__tap.tap) {
      if (window.OEAudio && window.OEAudio.ctx === c) stem(c, this.gain && this.gain.value > 0.52 ? 1 : 2, this); // (main is 0.55, the story bus 0.5)
    }
    return conn.call(this, dst, ...rest);
  };
  let M = null;
  Object.defineProperty(window, 'OEMusic', { configurable: true, get: () => M, set: v => {
    M = v; if (!v || !v.create) return;
    const cr = v.create; v.create = function (...a) { const m = cr.apply(this, a); wrap(m, 'set', 'score', a => [Object.assign({}, a[0])]); wrap(m, 'sting'); return m; };
    const lp = v.loop; v.loop = function (...a) { ev('loop', [a[2], a[3]]); const r = lp.apply(this, a); if (r && r.made) r.made.then(ok => ok && ev('loop-start', { seconds: a[3], lead: a[4] != null ? a[4] : 0.25, at: a[0].currentTime })); return r; };
  } });
  // the story's beats as they change (and the dialogue's line, by its length), every 100 ms
  let was = '';
  setInterval(() => {
    const g = window.__game, s = g && g.story && g.story.state; if (!s) return;
    const d = document.getElementById('gd'), line = d && !d.hidden ? (d.querySelector('.tx, p, .line') || d).textContent.slice(0, 80) : '';
    const k = `${s.phase}|${s.beat}|${s.fi}|${line}`;
    if (k !== was) { was = k; ev('beat', { phase: s.phase, beat: s.beat, fi: s.fi, line }); }
  }, 100);
  // the main thread's stalls: a timer asked for every 100 ms that came late (what the score writes ahead can drop then)
  let beat = performance.now();
  setInterval(() => { const n = performance.now(); if (n - beat > 350) sink('ev', JSON.stringify({ t: beat, kind: 'stall', detail: Math.round(n - beat) })); beat = n; }, 100);
  document.addEventListener('visibilitychange', () => ev('visibility', document.visibilityState));
})();
