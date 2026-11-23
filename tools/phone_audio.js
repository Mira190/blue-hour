// The sound as an iPhone makes it (docs/SOUND.md, "Every sound on the audio thread"). iOS plays Web Audio in blocks of
// 128 frames, and a block the audio thread has not made in time is a click: on a phone, nothing that sounds may wait on
// another thread, which a busy page starves. This opens the page as an iPhone's Safari (its user agent, touch, a phone's
// viewport), touches the loading screen for sound as a player does, presses Play, plays the story's opening to its end
// shot by shot, then sounds the story's own reverbs (a Stop and its held choir, a frame found, every room, the live
// score), and fails on:
//   - more than one AudioContext, an AudioWorklet, a ScriptProcessorNode or a media element's sound (each a thread the
//     sound would wait on, or a second clock);
//   - a ConvolverNode on the live context whose response is longer than WebKit's realtime limit (12,288 frames: the rest
//     is convolved on a background thread of default priority);
//   - the deck and the hybrid reverb not chosen (audio.js: TAPE, VERB);
//   - anything given to speechSynthesis while the opening plays, a page error, or a shot that makes more than MAXNODES
//     nodes a second or keeps more than MAXLIVE sources sounding at once;
//   - FIRST=title (the first touch on the title, not the loading screen: the context is made after the opening's score
//     was rendered with its own bed): more than one piece of music at once in the opening (the loading cue was begun in
//     that touch and played under it, until November 2026).
// It prints what the opening asks of the sound, shot by shot (the calls into audio.js, the nodes made, the level at the
// speakers and how much of it is under 150 Hz, the rooms' reverb), and the audio thread's health as telemetry.js reads it.
//   python3 -m http.server 8800 --directory web &
//   NODE_PATH=$(npm root -g) DRAW=60 xvfb-run -a node tools/phone_audio.js [WxH]
const { launch, phone } = require('./engine');   // (ENGINE=webkit, GPU=metal: tools/engine.js)
const [,, size = '390x844'] = process.argv;
const MAXNODES = +(process.env.MAXNODES || 400), MAXLIVE = +(process.env.MAXLIVE || 160);
(async () => {
  const [w, h] = size.split('x').map(Number);
  const b = await launch(['--autoplay-policy=document-user-activation-required']);
  const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, userAgent: IOS_UA });
  await phone(p);
  const errors = [], fail = m => { errors.push(m); console.log('FAIL', m); };
  p.on('pageerror', e => fail(`pageerror: ${String(e).slice(0, 300)}`));
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'low');
  const DRAW = +(process.env.DRAW || 0);
  if (DRAW > 1) await p.addInitScript(n => {
    const P = WebGL2RenderingContext.prototype, raf = window.requestAnimationFrame.bind(window), D = window.__draw = { frames: 0 };
    let on = true;
    window.requestAnimationFrame = fn => raf(t => { on = D.frames++ % n === 0; fn(t); on = true; });
    for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'blitFramebuffer']) { const f = P[k]; P[k] = function (...a) { if (on) return f.apply(this, a); }; }
  }, DRAW);
  // the log: the sound's calls, the voice's lines, the nodes made and the sources sounding, each at the opening's time
  await p.addInitScript(() => {
    const L = window.__snd = { calls: [], said: [], made: 0, live: 0, peakLive: 0, marks: [] };
    const when = () => { const g = window.__game, o = g && g.overture && g.overture(); if (!o || !o.active) return null; const s = o.shots.find(q => o.t >= q.t0 && o.t < q.t0 + q.dur); return { t: +o.t.toFixed(2), shot: s ? s.id : '-' }; };
    L.when = when;
    // a phone has voices; give this one a voice of each language, and keep what it is asked to say
    if (window.speechSynthesis) {
      const ss = window.speechSynthesis, V = [{ name: 'Kyoko', lang: 'ja-JP', localService: true, default: false, voiceURI: 'kyoko' }, { name: 'Samantha', lang: 'en-US', localService: true, default: true, voiceURI: 'samantha' }];
      ss.getVoices = () => V;
      let speaking = 0;
      ss.speak = u => { L.said.push(Object.assign({ text: u.text.slice(0, 60), lang: u.lang }, when() || { t: null, shot: 'outside' })); speaking++; setTimeout(() => { speaking--; }, 3000); };
      Object.defineProperty(ss, 'speaking', { get: () => speaking > 0 }); Object.defineProperty(ss, 'pending', { get: () => false });
      window.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance || function (t) { this.text = t; };
    }
    // every node a context makes, and every source started and ended
    const AC = window.AudioContext, P = (window.BaseAudioContext || AC).prototype;
    for (const k of Object.getOwnPropertyNames(P)) if (/^create/.test(k) && typeof P[k] === 'function') {
      const f = P[k]; P[k] = function (...a) { const n = f.apply(this, a); if (this instanceof AC) L.made++; return n; };
    }
    const S = window.AudioScheduledSourceNode && window.AudioScheduledSourceNode.prototype;
    if (S) { const st = S.start; S.start = function (...a) { if (this.context instanceof AC) { L.live++; L.peakLive = Math.max(L.peakLive, L.live); this.addEventListener('ended', () => { L.live--; }); } return st.apply(this, a); }; }
    // the music: buffers of 20 s or more sounding (the loading cue, the opening's score)
    L.long = 0;
    const B = window.AudioBufferSourceNode && AudioBufferSourceNode.prototype;
    if (B) { const st = B.start; B.start = function (...a) { if (this.context instanceof AC && this.buffer && this.buffer.duration >= 20) { L.long++; this.addEventListener('ended', () => { L.long--; }); } return st.apply(this, a); }; }
    // the sound's own calls, once it is there
    const wrap = () => {
      const A = window.OEAudio; if (!A || A.__wrapped) return; A.__wrapped = true;
      for (const k of ['place', 'voice', 'sfx', 'held', 'hush', 'murmur', 'screens', 'walkCall', 'trainAt', 'clack', 'platformChime', 'doorChime', 'melody', 'announce', 'rotor', 'engine', 'wind', 'rain', 'thunder', 'car', 'skid', 'beep', 'step', 'horn', 'honk', 'chime', 'bell', 'kan', 'thump', 'shutter']) {
        const f = A[k]; if (typeof f !== 'function') continue;
        A[k] = function (...a) { const w = when(); if (w) { const quiet = (k === 'trainAt' && !a[1]) || (['murmur', 'screens', 'rotor', 'engine', 'wind', 'rain', 'car', 'skid'].includes(k) && !(a[0] > 0.001)); if (!quiet) L.calls.push(Object.assign({ k, a: JSON.stringify(a).slice(0, 80) }, w)); } return f.apply(this, a); };
      }
    };
    const iv = setInterval(() => { if (window.OEAudio) { wrap(); clearInterval(iv); } }, 20);
    // what reaches the speakers: every connection to a context's destination also feeds an analyser
    const outs = L.outs = [], cn = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dst, ...a) {
      const r = cn.call(this, dst, ...a);
      if (dst instanceof AudioDestinationNode && this.context instanceof AC) {
        let o = outs.find(q => q.c === this.context);
        if (!o) { const an = this.context.createAnalyser(); an.fftSize = 4096; an.smoothingTimeConstant = 0; o = { c: this.context, an, d: new Float32Array(4096), f: new Float32Array(2048), peak: 0, rms: 0, low: 0 }; outs.push(o); }
        cn.call(this, o.an);
      }
      return r;
    };
    setInterval(() => { for (const o of outs) { o.an.getFloatTimeDomainData(o.d); let s = 0, pk = 0; for (const v of o.d) { s += v * v; pk = Math.max(pk, Math.abs(v)); } o.peak = Math.max(o.peak, pk); o.rms = Math.max(o.rms, Math.sqrt(s / o.d.length));
      o.an.getFloatFrequencyData(o.f); const hz = o.c.sampleRate / 4096; let lo = 0, all = 0; for (let i = 1; i < o.f.length; i++) { const e = Math.pow(10, o.f[i] / 10); all += e; if (i * hz < 150) lo += e; } if (all > 1e-12) o.low = Math.max(o.low, lo / all); } }, 40);
    // what each convolver gives (the rooms, the story's hall): its level, read from a tap on its output; and every
    // response a convolver on the live context is given
    const taps = L.taps = [], mk = P.createConvolver, irs = L.irs = [];
    P.createConvolver = function (...a) { const c = mk.apply(this, a); if (this instanceof AC) { const an = this.createAnalyser(); an.fftSize = 2048; c.connect(an); taps.push({ an, at: when(), peak: 0, rms: 0, d: new Float32Array(2048) });
      const desc = Object.getOwnPropertyDescriptor(ConvolverNode.prototype, 'buffer'); Object.defineProperty(c, 'buffer', { set(b) { irs.push(b ? b.length : 0); desc.set.call(c, b); }, get() { return desc.get.call(c); } }); } return c; };
    // the threads and clocks a phone's sound must not wait on
    const bad = L.bad = [], note = k => bad.push(k);
    const ACx = window.AudioContext; let made = 0;
    window.AudioContext = window.webkitAudioContext = function (...a) { if (++made > 1) note('a second AudioContext'); return new ACx(...a); };
    window.AudioContext.prototype = ACx.prototype;
    if (window.AudioWorklet) { const am = AudioWorklet.prototype.addModule; AudioWorklet.prototype.addModule = function (...a) { note('an AudioWorklet module added'); return am.apply(this, a); }; }
    for (const k of ['createScriptProcessor', 'createMediaElementSource', 'createMediaStreamSource']) if (P[k]) { const f = P[k]; P[k] = function (...a) { note(k); return f.apply(this, a); }; }
    // once a second while the opening plays: the nodes made in it and the sources sounding
    let made0 = 0;
    setInterval(() => { const w = when(); if (w) L.marks.push(Object.assign({ made: L.made - made0, live: L.live, verb: +Math.max(0, ...L.taps.map(q => q.rms)).toExponential(1), music: L.long, out: L.outs.map(o => [+(20 * Math.log10(o.rms + 1e-9)).toFixed(1), +(20 * Math.log10(o.peak + 1e-9)).toFixed(1), +o.low.toFixed(2)]) }, w)); made0 = L.made; for (const q of L.taps) q.rms = 0; for (const o of L.outs) { o.rms = 0; o.peak = 0; o.low = 0; } }, 1000);
    setInterval(() => { for (const q of L.taps) { q.an.getFloatTimeDomainData(q.d); let s = 0; for (const v of q.d) s += v * v; q.rms = Math.max(q.rms, Math.sqrt(s / q.d.length)); } }, 50);
  });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${process.env.Q || ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => document.querySelector('.roll-sound') && window.OEAudio && (window.OEAudio.ctx || window.OEAudio.pending), null, { timeout: 120000 });
  // FIRST=title: the first touch on the title, after the page has loaded (as a player who never touched the loading screen)
  const touch = async (x = w / 2, y = h / 2) => { await p.touchscreen.tap(x, y); await p.waitForFunction(() => window.OEAudio.ctx && window.OEAudio.ctx.state === 'running', null, { timeout: 20000 }).catch(() => fail('a touch does not start the sound')); };
  if (process.env.FIRST !== 'title') await touch();
  console.log(`the tape: ${await p.evaluate(() => window.OEAudio.tape)}, ${await p.evaluate(() => window.OEAudio.ctx && window.OEAudio.ctx.sampleRate)} Hz`);
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1500);
  if (process.env.FIRST === 'title') { console.log(`the first touch, on the title at its left edge: ${await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + '#' + e.id + '.' + e.className : '-'; }, [3, h / 2])}`); await touch(3, h / 2); }
  await p.evaluate(() => document.getElementById('gt-play').click());
  await p.waitForFunction(() => { const o = window.__game.overture(); return o && o.active; }, null, { timeout: 60000 }).catch(() => fail('the opening does not start'));
  const shots = await p.evaluate(() => window.__game.overture().shots.map(q => ({ id: q.id, t0: q.t0, dur: q.dur })));
  console.log('shots:', shots.map(s => `${s.id} ${s.t0.toFixed(1)}-${(s.t0 + s.dur).toFixed(1)}`).join(', '));
  await p.waitForFunction(() => { const o = window.__game.overture(); return !o || !o.active; }, null, { timeout: 1800000, polling: 500 });
  const L = await p.evaluate(() => { const L = window.__snd; return { calls: L.calls, said: L.said, marks: L.marks, peakLive: L.peakLive }; });
  for (const s of shots) {
    const c = L.calls.filter(q => q.shot === s.id), by = {};
    for (const q of c) by[q.k] = (by[q.k] || 0) + 1;
    const m = L.marks.filter(q => q.shot === s.id), made = Math.max(0, ...m.map(q => q.made)), live = Math.max(0, ...m.map(q => q.live)), verb = Math.max(0, ...m.map(q => q.verb)), music = Math.max(0, ...m.map(q => q.music));
    console.log(`${s.id.padEnd(8)} calls ${JSON.stringify(by)}  nodes a second, most ${made}  sounding, most ${live}  the room's reverb, loudest ${(20 * Math.log10(verb + 1e-9)).toFixed(1)} dBFS rms  music buffers at once, most ${music}`);
    if (made > MAXNODES) fail(`${s.id}: ${made} nodes made in a second (over ${MAXNODES})`);
    // (touched first on the title, the opening's score was made with its own bed: the loading cue must not play with it)
    if (process.env.FIRST === 'title' && music > 1) fail(`${s.id}: ${music} pieces of music at once (the loading cue under the opening's own score and its bed)`);
    if (live > MAXLIVE) fail(`${s.id}: ${live} sources sounding at once (over ${MAXLIVE})`);
  }
  for (const m of L.marks) console.log(`  ${m.t.toFixed(1).padStart(5)} ${m.shot.padEnd(7)} at the speakers (rms dBFS, peak dBFS, share under 150 Hz): ${JSON.stringify(m.out)}`);
  if (L.said.length) for (const q of L.said) fail(`given to speechSynthesis in the opening's ${q.shot} at ${q.t}: ${q.lang} "${q.text}"`);
  else console.log('ok   nothing given to speechSynthesis while the opening plays');
  // the story's own sound: a Stop, its held choir, a frame found (the hall); every room; the live score (its room)
  await p.evaluate(async () => {
    const A = window.OEAudio, wait = ms => new Promise(r => setTimeout(r, ms));
    A.hush(true); A.sfx('stop'); A.held(true); await wait(1500); A.sfx('found'); await wait(800); A.held(false); A.hush(false);
    for (const k of ['viaduct', 'inside', 'roof', 'open']) { A.place(k); await wait(400); }
    const m = window.OEMusic.create({ persist: false }); m.start(A.ctx, A.musicBus()); await wait(2500); m.stop(); await wait(800);
  });
  const G = await p.evaluate(() => { const A = window.OEAudio, L = window.__snd; return { tape: A.tape, verb: A.verb, limit: A.RT_FRAMES, irs: L.irs, bad: L.bad, health: A.health() }; });
  console.log(`the live context's convolvers: ${G.irs.length}, their responses ${Math.min(...G.irs)} to ${Math.max(...G.irs)} frames (the limit ${G.limit})`);
  const long = G.irs.filter(n => n > G.limit);
  if (long.length) fail(`${long.length} convolver(s) on the live context longer than the realtime limit: ${long.slice(0, 4).join(', ')} frames`);
  else console.log('ok   every convolver on the live context within the realtime limit');
  for (const k of [...new Set(G.bad)]) fail(`on a phone: ${k}`);
  if (!G.bad.length) console.log('ok   one AudioContext, no worklet, no script processor, no media element');
  if (G.tape !== 'deck') fail(`the tape is ${G.tape}, not the deck`); if (G.verb !== 'hybrid') fail(`the reverb is ${G.verb}, not the hybrid`);
  if (G.tape === 'deck' && G.verb === 'hybrid') console.log('ok   the deck and the hybrid reverb');
  console.log(`the audio thread as telemetry reads it (this machine's, not a phone's): ${JSON.stringify(G.health)}`);
  await b.close();
  console.log(errors.length ? `FAIL ${errors.length}` : 'PASS');
  process.exit(errors.length ? 1 : 0);
})();
