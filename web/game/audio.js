// Sound, synthesised with Web Audio (no audio files): footsteps,
// the helicopter rotor, the ferry engine and horn, a car's engine through its gears,
// its tyres in a slide and its horn, dialogue voice beeps with a pitch per character,
// little penguins braying in the dark and silver gulls; at a busy crossing the crowd's murmur, the
// screens' music, the walk signal's bird calls and the station's announcements; on a railway
// (trains.js) the trains' rumble, rail joints and motors, the platform's chimes and its departure
// melody. Browsers allow sound only after a click, so start() is called from the Play button.
'use strict';
window.OEAudio = (function () {
  // The mix (docs/SOUND.md): every sound of the street goes into `master`, the world's bus, and from it through the
  // tape (the Stop's brake, below) into `duck` (lowered under dialogue, with the score) and `main` (the Sound switch);
  // a send from the tape's output rings in the place's room (a convolver, place()). The story's own sound is a bus of
  // its own (storyBus), never braked or ducked.
  let ctx = null, master = null, noise = null, muted = false, main = null, duck = null, verbIn = null, tape = null, deck = null, ready = Promise.resolve();
  const ch = {};
  const UA = navigator.userAgent, TOUCH = navigator.maxTouchPoints > 0, HRTF = !TOUCH;
  // (an iPad says it is a Mac; its touch screen gives it away: telemetry.js)
  const IOS = /iPhone|iPad|iPod/.test(UA) || (/Mac OS X/.test(UA) && navigator.maxTouchPoints > 1);
  // The Stop's tape: an AudioWorklet with a mouse, the deck of the browser's own nodes on a touch screen (deckOf, below).
  // ?tape=worklet or ?tape=deck picks one, for the tools.
  const TAPE = (/[?&]tape=(worklet|deck)\b/.exec(location.search) || [])[1] || (TOUCH ? 'deck' : 'worklet');
  // Every sound begun "now" is begun a little later than now: LEAD, about four blocks. A page's audio thread takes up what
  // the page has made only between blocks, and only when the page is not changing the graph at that moment; a sound whose
  // start it took up a block or two late came in part way up its attack, a click, and on a busy phone a run of them. And
  // every sound that has ended is taken off the bus it played into (free): a node left connected is visited by the audio
  // thread in every block, silent or not, until the page lets go of it, and WebKit's sound has crackled once a page had
  // left a couple of thousand of them there (WebKit bug 222098; its fix's own advice: take nodes out of the graph once
  // they are no longer useful). The screens' kick alone left one a beat, two a second, for as long as you stood there.
  const LEAD = 0.012;
  const free = (src, ...nodes) => { src.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch (e) { /* already gone */ } } }; };
  function noiseSource() {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    s.start();
    return s;
  }
  // A browser starts a page's sound only from a user's activation: a key, a click, and for a touch its end (pointerup,
  // touchend), not its start (a touch's pointerdown is not one, so a phone's first tap started nothing). iOS also leaves
  // a context 'interrupted' after a call or a trip to another app. Any of these, anywhere on the page, resumes it.
  // iOS has a context made outside a touch start as it pleases (a context it was not given leave for has come up at the
  // wrong rate and played distorted, WebKit bug 154538): there, the context is made in the first touch, the one that
  // would have resumed it, and until then start() only says that sound is wanted (`pending`)
  let want = false, away = false; // (away: the context suspended by the page as it was put away, below)
  const madeFns = [];
  const allowed = () => !IOS || !navigator.userActivation || navigator.userActivation.isActive;
  const wake = () => {
    if (!ctx) { if (want && !muted) start(); return; }
    if (!muted && !document.hidden && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().then(() => { away = false; }, () => {});
  };
  for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, wake, { capture: true, passive: true });
  // (and while the page is seen, every two seconds: an interruption that has ended leaves the context 'interrupted' until
  // it is asked, a context the page put away below 'suspended' if it was not given back, and a story's long beat may
  // have no touch in it)
  setInterval(() => { if (ctx && !muted && !document.hidden && (ctx.state === 'interrupted' || (away && ctx.state === 'suspended'))) wake(); }, 2000);
  // A page put away is silent: the context is suspended while it is hidden and resumed as it is seen. The game stands
  // still in a tab put away, and its beds went on behind another tab or app; and on a phone a context left running there
  // is an audio thread beside the page being played (the owner's iPhone, 21 November 2026, had two tabs of the story
  // open when the sound of the one in front broke).
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { wake(); return; }
    if (ctx && ctx.state === 'running') { away = true; ctx.suspend().catch(() => {}); }
  });
  // fn() once the context is made (now, if it is): the loading cue waits on this where the context waits on a touch
  function made(fn) { if (ctx) fn(); else madeFns.push(fn); }
  function start() {
    if (ctx) { wake(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!allowed()) { want = true; return; }
    want = false;
    ctx = new AC();
    main = ctx.createGain(); main.gain.value = muted ? 0 : 0.55; main.connect(ctx.destination);
    duck = ctx.createGain(); duck.connect(main);
    verbIn = ctx.createGain();
    master = ctx.createGain(); master.connect(duck); master.connect(verbIn);
    room = null; sbus = null; mbus = null; verbs.length = 0; placeNow = null; irs = {}; tape = null; deck = null; ready = Promise.resolve();
    for (const k of Object.keys(ch)) delete ch[k];
    place('open');
    // the tape: on a touch screen the deck, made now of the browser's own nodes (deckOf). With a mouse an AudioWorklet
    // made from tapeWorklet's source (no file to fetch); until it is loaded, or where there is none, the world goes
    // straight on and the Stop only hushes it
    if (TAPE === 'deck') {
      deck = deckOf();
      master.disconnect(); master.connect(deck.input); deck.output.connect(duck); deck.output.connect(verbIn);
    } else if (ctx.audioWorklet && window.Blob && window.URL) {
      const url = URL.createObjectURL(new Blob([`(${tapeWorklet})()`], { type: 'application/javascript' })), c = ctx;
      ready = c.audioWorklet.addModule(url).then(() => {
        if (ctx !== c) return;
        tape = new AudioWorkletNode(ctx, 'oe-tape', { outputChannelCount: [2] });
        master.disconnect(); master.connect(tape); tape.connect(duck); tape.connect(verbIn);
      }).catch(e => console.warn('audio: no tape, the Stop only hushes the street', e)); // (no worklet: the plain hush)
    }
    if (muted && ctx.suspend) ctx.suspend();
    else if (ctx.state !== 'running') ctx.resume().catch(() => {}); // (in the touch that made it, where that is why it waited)
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // (the street's beds, the rotor to the rain, are made the first time each is heard: bed() below. Made here, a dozen
    // sources and filters ran silent from the loading screen on, on a phone's audio thread while the page loaded)
    for (const fn of madeFns.splice(0)) { try { fn(); } catch (e) { console.warn('audio:', e); } }
    if (!hRun) hRun = setInterval(healthPoll, 100);
  }
  // the street's continuous sounds, each made the first time it is asked to be heard (until then a call that would set
  // it to silence does nothing)
  const BEDS = {
    // rotor: band-passed noise chopped at the blade-pass rate
    rotor() {
      const rn = noiseSource(), bp = ctx.createBiquadFilter(), rg = ctx.createGain(), chop = ctx.createOscillator(), cg = ctx.createGain(), rv = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 140; bp.Q.value = 0.8;
      chop.type = 'square'; chop.frequency.value = 4; cg.gain.value = 0.5; rg.gain.value = 0.5; rv.gain.value = 0;
      chop.connect(cg); cg.connect(rg.gain); chop.start();
      rn.connect(bp); bp.connect(rg); rg.connect(rv); rv.connect(master);
      return { vol: rv, chop };
    },
    // ferry engine: a low saw hum
    engine() {
      const eo = ctx.createOscillator(), el = ctx.createBiquadFilter(), eg = ctx.createGain();
      eo.type = 'sawtooth'; eo.frequency.value = 48; el.type = 'lowpass'; el.frequency.value = 160; eg.gain.value = 0;
      eo.connect(el); el.connect(eg); eg.connect(master); eo.start();
      return { vol: eg, osc: eo };
    },
    // wind at height and speed
    wind() {
      const wn = noiseSource(), wl = ctx.createBiquadFilter(), wg = ctx.createGain();
      wl.type = 'bandpass'; wl.frequency.value = 900; wl.Q.value = 0.4; wg.gain.value = 0;
      wn.connect(wl); wl.connect(wg); wg.connect(master);
      return { vol: wg, f: wl };
    },
    // a car's engine: two saws a fifth apart through a low-pass that opens with the throttle
    car() {
      const co = ctx.createOscillator(), c2 = ctx.createOscillator(), cl = ctx.createBiquadFilter(), cv = ctx.createGain();
      co.type = c2.type = 'sawtooth'; co.frequency.value = 40; c2.frequency.value = 60; cl.type = 'lowpass'; cl.frequency.value = 300; cl.Q.value = 2; cv.gain.value = 0;
      co.connect(cl); c2.connect(cl); cl.connect(cv); cv.connect(master); co.start(); c2.start();
      return { vol: cv, a: co, b: c2, lp: cl };
    },
    // tyres scrubbing sideways: band-passed noise
    skid() {
      const sn = noiseSource(), sb = ctx.createBiquadFilter(), sg = ctx.createGain();
      sb.type = 'bandpass'; sb.frequency.value = 1500; sb.Q.value = 6; sg.gain.value = 0;
      sn.connect(sb); sb.connect(sg); sg.connect(master);
      return { vol: sg };
    },
    // rain: a hiss of fine drops (high-passed noise), the patter on leaves and paving (a band of
    // noise that flutters), and under a roof its drumming (a low band, louder there)
    rain() {
      const hn = noiseSource(), hh = ctx.createBiquadFilter(), hg = ctx.createGain();
      hh.type = 'highpass'; hh.frequency.value = 3200; hg.gain.value = 0;
      hn.connect(hh); hh.connect(hg); hg.connect(master);
      const pn = noiseSource(), pb = ctx.createBiquadFilter(), pg = ctx.createGain(), pl = ctx.createOscillator(), plg = ctx.createGain(), pv = ctx.createGain();
      pb.type = 'bandpass'; pb.frequency.value = 1400; pb.Q.value = 0.7; pg.gain.value = 0.6; pv.gain.value = 0;
      pl.type = 'triangle'; pl.frequency.value = 7.3; plg.gain.value = 0.35; pl.connect(plg); plg.connect(pg.gain); pl.start();
      pn.connect(pb); pb.connect(pg); pg.connect(pv); pv.connect(master);
      const rn2 = noiseSource(), rb = ctx.createBiquadFilter(), rgain = ctx.createGain();
      rb.type = 'bandpass'; rb.frequency.value = 420; rb.Q.value = 0.9; rgain.gain.value = 0;
      rn2.connect(rb); rb.connect(rgain); rgain.connect(master);
      return { hiss: hg, patter: pv, roof: rgain, hp: hh };
    },
  };
  // the bed, made now if it is to be heard (on: the level asked for is over silence); null while it is not there and
  // need not be
  const bed = (name, on) => ch[name] || (on && ctx && !muted ? (ch[name] = BEDS[name]()) : null);
  const ramp = (p, v, t = 0.25) => { if (ctx) p.setTargetAtTime(v, ctx.currentTime, t); };
  function rotor(spin, load = 0) {
    const c = ctx && bed('rotor', spin > 0.001);
    if (!c) return;
    ramp(c.vol.gain, spin * (0.22 + 0.12 * load));
    ramp(c.chop.frequency, 4 + spin * 16, 0.4);
  }
  function engine(level) { const c = ctx && bed('engine', level > 0.001); if (c) { ramp(c.vol.gain, level * 0.09); ramp(c.osc.frequency, 42 + level * 18, 0.6); } }
  // level 0..1: the air's rush (a helicopter's speed, or the weather's wind and its gusts, whichever is louder)
  function wind(level, gust = 0) { const c = ctx && bed('wind', level > 0.001); if (!c) return; ramp(c.vol.gain, Math.min(0.14, level * 0.12), 0.4); ramp(c.f.frequency, 500 + 700 * level + 500 * gust, 0.5); }
  // rpm 0..1 (idle to the red line), throttle 0..1, level 0..1 (0 off; lower from the back seat)
  function car(rpm, throttle = 0, level = 1) {
    const c = ctx && bed('car', level > 0.001);
    if (!c) return;
    const f = 34 + rpm * 120;
    ramp(c.vol.gain, level * (0.035 + 0.05 * throttle), 0.08);
    ramp(c.a.frequency, f, 0.06); ramp(c.b.frequency, f * 1.5, 0.06);
    ramp(c.lp.frequency, 220 + 900 * throttle * rpm + 200 * rpm, 0.08);
  }
  function skid(level) { const c = ctx && bed('skid', level > 0.001); if (c) ramp(c.vol.gain, Math.min(0.06, level * 0.06), 0.06); }
  // level 0..1 (drizzle to a downpour); roof: under one, which drums; inside: a car or a cabin, muffled
  let dripAt = 0;
  // thunder from dist metres: near, a crack and a long roll; far, only the low rumble, later and softer
  function thunder(dist = 2000, inside = false) {
    if (!ctx || muted) return;
    const near = Math.max(0, 1 - dist / 2500), far = Math.max(0.12, 1 - dist / 16000), t = ctx.currentTime + LEAD, len = 3.5 + 5 * (1 - near);
    const src = noiseSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(inside ? 300 : 180 + 2600 * near * near, t); lp.frequency.exponentialRampToValueAtTime(70, t + len * 0.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime((0.22 + 0.5 * near) * far * (inside ? 0.6 : 1), t + 0.03 + 0.25 * (1 - near));
    // the roll: the sound of the channel's far parts arriving later, in swells
    for (let k = 1; k <= 4; k++) g.gain.exponentialRampToValueAtTime((0.05 + 0.18 * Math.random()) * far * (1 - k / 6), t + len * k / 5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(lp); lp.connect(g); g.connect(master);
    setTimeout(() => { try { src.stop(); src.disconnect(); g.disconnect(); } catch (e) { /* already gone */ } }, (len + 0.5) * 1000);
  }
  // summer's cicadas, level 0..1: a high, narrow band of noise rattling at a wing's rate, swelling and
  // fading every few seconds; made the first time it is asked for, so a winter's game never builds it
  function cicadas(level) {
    if (!ctx) return;
    if (!ch.cicada) {
      if (!(level > 0.01)) return;
      const n = noiseSource(), bp = ctx.createBiquadFilter(), am = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), sw = ctx.createOscillator(), sg = ctx.createGain(), out = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 5400; bp.Q.value = 11; am.gain.value = 0.5; out.gain.value = 0;
      lfo.type = 'sawtooth'; lfo.frequency.value = 58; lg.gain.value = 0.45; sw.type = 'sine'; sw.frequency.value = 0.19; sg.gain.value = 0.3;
      n.connect(bp); bp.connect(am); am.connect(out); out.connect(master); lfo.connect(lg); lg.connect(am.gain); sw.connect(sg); sg.connect(am.gain); lfo.start(); sw.start();
      ch.cicada = out;
    }
    ramp(ch.cicada.gain, Math.min(1, level) * 0.022, 2);
  }
  function rain(level, roof = false, inside = false) {
    const c = ctx && bed('rain', level > 0.001);
    if (!c) return;
    const k = inside ? 0.35 : 1;
    ramp(c.hiss.gain, level * 0.05 * k * (roof ? 0.6 : 1), 0.8);
    ramp(c.patter.gain, level * 0.07 * k * (roof ? 0.5 : 1), 0.8);
    ramp(c.roof.gain, (roof ? 0.11 : inside ? 0.05 : 0) * Math.min(1, level * 1.4), 0.6);
    ramp(c.hp.frequency, inside ? 1800 : 3200, 0.5);
    // under a roof, now and then a drop off its edge
    const now = ctx.currentTime;
    if (roof && level > 0.05 && now > dripAt) { dripAt = now + 0.25 + Math.random() * (1.6 - level); blip(900 + Math.random() * 700, 0.05, 'sine', 0.025); }
  }
  function blip(freq, dur, type = 'square', vol = 0.05) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + LEAD;
    o.type = type; o.frequency.value = freq; g.gain.value = 0;
    // (up in 2 ms: it began at its full level in the first sample, a click of its own under the note)
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02); free(o, g);
  }
  function beep(pitch) { duckFor(); blip(pitch * (0.92 + Math.random() * 0.16), 0.045, 'square', 0.035); }
  function step() {
    if (!ctx || muted) return;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime + LEAD;
    s.buffer = noise; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + 0.08); free(s, g);
  }
  function horn() { blip(196, 1.3, 'sawtooth', 0.06); blip(247, 1.3, 'sawtooth', 0.04); }
  // your horn; another driver's at a gain (its distance) and a pitch (a bus's is lower)
  function honk(gain = 1, pitch = 1) { blip(415 * pitch, 0.32, 'square', 0.045 * gain); blip(523 * pitch, 0.32, 'square', 0.035 * gain); }
  function shutter() { sfx('shutter'); } // (the photo mode's: the story's camera, below)
  function thump() { // a rubber stamp on paper: a short low knock and a slap of noise
    if (!ctx || muted) return;
    blip(95, 0.18, 'sine', 0.22);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime + LEAD;
    s.buffer = noise; f.type = 'lowpass'; f.frequency.value = 1400; g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + 0.14); free(s, g);
  }
  // a little penguin's bray: a run of nasal pulses, rising and falling; level 0..1 with distance
  function penguin(level = 1) {
    if (!ctx || muted || level <= 0) return;
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime + LEAD, n = 4 + Math.floor(Math.random() * 5), f0 = 700 + Math.random() * 300;
    o.type = 'sawtooth'; f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 3;
    g.gain.value = 0;
    for (let k = 0; k < n; k++) {
      const a = t + k * 0.16, up = k < n / 2;
      o.frequency.setValueAtTime(f0 * (up ? 1 + k * 0.08 : 1.3 - (k - n / 2) * 0.1), a);
      g.gain.setValueAtTime(0.0001, a); g.gain.linearRampToValueAtTime(0.05 * level, a + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, a + 0.13);
    }
    o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + n * 0.16 + 0.05); free(o, g);
  }
  // a silver gull's call: a harsh, falling "kee-ar", sometimes two; level 0..1 with distance
  function gull(level = 1) {
    if (!ctx || muted || level <= 0) return;
    const t = ctx.currentTime + LEAD, n = Math.random() < 0.4 ? 2 : 1, f0 = 1500 + Math.random() * 500;
    for (let k = 0; k < n; k++) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), a = t + k * 0.32;
      o.type = 'square'; f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 2.5;
      o.frequency.setValueAtTime(f0, a); o.frequency.linearRampToValueAtTime(f0 * 1.15, a + 0.05); o.frequency.exponentialRampToValueAtTime(f0 * 0.62, a + 0.26);
      g.gain.setValueAtTime(0.0001, a); g.gain.linearRampToValueAtTime(0.045 * level, a + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, a + 0.28);
      o.connect(f); f.connect(g); g.connect(master); o.start(a); o.stop(a + 0.3); free(o, g);
    }
  }
  function chime() { [660, 880, 1320].forEach((f, i) => setTimeout(() => blip(f, 0.35, 'sine', 0.07), i * 110)); }
  // a tram's foot gong, struck twice ("ding ding")
  // a level crossing's electronic bell, one stroke: 700 and 750 Hz together, cut off short (130 strokes a minute, rail.js)
  function kan(vol = 1) { if (vol > 0.01) { blip(700, 0.2, 'triangle', 0.09 * vol); blip(750, 0.2, 'triangle', 0.09 * vol); blip(1450, 0.08, 'sine', 0.02 * vol); } }
  function bell() { [0, 320].forEach(d => setTimeout(() => { blip(1180, 0.8, 'sine', 0.06); blip(2840, 0.45, 'sine', 0.02); }, d)); }
  // ---------------------------------------------------------------- a busy crossing (game.look.sound)
  // the crowd's murmur: noise through two voice bands, a little of it pulsing at a syllable's rate,
  // as a thousand people talking at once sound; level 0..1 with how many are round you
  let crowdBed = null, screenBed = null, beatAt = 0, chord = 0;
  function murmur(level) {
    if (!ctx) return;
    if (!crowdBed && level > 0) {
      const n = noiseSource(), a = ctx.createBiquadFilter(), b = ctx.createBiquadFilter(), g = ctx.createGain(), am = ctx.createOscillator(), ag = ctx.createGain(), out = ctx.createGain();
      a.type = 'bandpass'; a.frequency.value = 420; a.Q.value = 0.9; b.type = 'bandpass'; b.frequency.value = 1150; b.Q.value = 1.4;
      am.frequency.value = 4.3; ag.gain.value = 0.25; g.gain.value = 0.75; am.connect(ag); ag.connect(g.gain); am.start();
      n.connect(a); n.connect(b); a.connect(g); b.connect(g); g.connect(out); out.gain.value = 0; out.connect(master);
      crowdBed = { out, am };
    }
    if (crowdBed) { ramp(crowdBed.out.gain, Math.min(1, level) * 0.11, 0.6); ramp(crowdBed.am.frequency, 3.6 + Math.random() * 1.6, 0.8); }
  }
  // the screens' sound: a pop song heard across the street, its kick and its chords through the
  // traffic's noise (muffled: little above 1 kHz carries); level 0..1 with distance
  function screens(level) {
    if (!ctx) return;
    if (!screenBed && level > 0) {
      const lp = ctx.createBiquadFilter(), out = ctx.createGain(), oscs = [];
      lp.type = 'lowpass'; lp.frequency.value = 950; lp.Q.value = 0.7; out.gain.value = 0;
      for (let i = 0; i < 3; i++) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; g.gain.value = 0.18; o.connect(g); g.connect(lp); o.start(); oscs.push(o); }
      lp.connect(out); out.connect(master);
      screenBed = { out, oscs };
    }
    if (!screenBed) return;
    ramp(screenBed.out.gain, Math.min(1, level) * 0.05, 0.8);
    // the beat and the changes, scheduled a little ahead (122 bpm, a chord every bar)
    const t = ctx.currentTime, beat = 60 / 122;
    if (level > 0.02 && beatAt < t + 0.3) {
      if (beatAt < t + LEAD) beatAt = t + 0.05;
      const CH = [[220, 277.2, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 246.9, 311.1]];
      for (let k = 0; k < 4; k++) {
        const at = beatAt + k * beat, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(120, at); o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
        g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.5, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
        o.connect(g); g.connect(screenBed.out); o.start(at); o.stop(at + 0.25); free(o, g);
      }
      CH[chord % 4].forEach((f, i) => screenBed.oscs[i].frequency.setValueAtTime(f, beatAt));
      chord++; beatAt += 4 * beat;
    }
  }
  // ---------------------------------------------------------------- the walk signals' sounds
  // (walkcalls.js says which, when and from where). Japan's guide calls (誘導音, the National Police
  // Agency's guideline: docs/GAME.md "Walk signals' calls"): the chick's "piyo" answered from the far
  // kerb by "piyo-piyo", or the cuckoo's "kakko" answered by "ka-kakko". Elsewhere a push-button
  // box's locator tick (slow, on red) and its walk tick (fast, on green): Australia's with its
  // falling "zap" as the walk comes on, Hong Kong's hard pips, the Netherlands' rateltikker.
  // level 0..1 (with distance); pan -1 (left) to 1 (right)
  function out(level, pan, life = 2) {
    const g = ctx.createGain();
    let last = g;
    g.gain.value = level;
    pan = Math.max(-1, Math.min(1, pan || 0));
    // (with a mouse, a head-related panner, which places a call in front of you or off to a side as ears do; a touch
    // screen's phone keeps the cheap stereo pan. The level is the distance's already: no roll-off of its own)
    if (pan && HRTF && ctx.createPanner) {
      const p = ctx.createPanner(), az = pan * Math.PI / 2;
      p.panningModel = 'HRTF'; p.rolloffFactor = 0;
      if (p.positionX) { p.positionX.value = Math.sin(az); p.positionZ.value = -Math.cos(az); } else p.setPosition(Math.sin(az), 0, -Math.cos(az));
      g.connect(p); p.connect(master); last = p;
    } else if (ctx.createStereoPanner && pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(master); last = p; }
    else g.connect(master);
    // (taken off the bus once the call has sounded: life, its length; its notes go with it)
    const c = ctx; setTimeout(() => { if (ctx === c) { try { last.disconnect(); } catch (e) { /* already gone */ } } }, (life + 0.5) * 1000);
    return g;
  }
  function tone(dst, at, dur, type, f0, f1, vol, attack = 0.008) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    g.gain.value = 0; // (silent until its envelope starts, as the score's voices are: music.js gain())
    o.type = type; o.frequency.value = f0; o.frequency.setValueAtTime(f0, at); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + dur * 0.9);
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(dst); o.start(at); o.stop(at + dur + 0.02); free(o, g);
    return o;
  }
  // a chick's chirp: a quick rise and a longer fall ("pi-yo"), a touch of its octave for the edge
  function chirp(dst, at) {
    const o = tone(dst, at, 0.15, 'sine', 2300, 0, 0.9, 0.006), h = tone(dst, at, 0.12, 'sine', 4600, 0, 0.12, 0.006);
    for (const [q, k] of [[o, 1], [h, 2]]) { q.frequency.setValueAtTime(2300 * k, at); q.frequency.linearRampToValueAtTime(3300 * k, at + 0.028); q.frequency.exponentialRampToValueAtTime(2000 * k, at + 0.13); }
  }
  const CALLS = {
    piyo: (d, t) => chirp(d, t),
    piyopiyo: (d, t) => { chirp(d, t); chirp(d, t + 0.2); },
    // the cuckoo: a higher note and a falling, longer lower one, a major third down
    kakko: (d, t) => { tone(d, t, 0.16, 'sine', 830, 815, 0.75, 0.012); tone(d, t + 0.22, 0.36, 'sine', 665, 640, 0.75, 0.015); },
    kakakko: (d, t) => { tone(d, t, 0.09, 'sine', 830, 820, 0.7, 0.01); tone(d, t + 0.11, 0.15, 'sine', 830, 815, 0.75, 0.012); tone(d, t + 0.32, 0.36, 'sine', 665, 640, 0.75, 0.015); },
    tick: (d, t) => tone(d, t, 0.018, 'square', 1250, 0, 0.5, 0.001), // (a locator's or a walk's tick)
    zap: (d, t) => tone(d, t, 0.3, 'sawtooth', 2400, 420, 0.25, 0.004), // (Australia's: the walk is on)
    pip: (d, t) => tone(d, t, 0.035, 'square', 2050, 0, 0.35, 0.002), // (Hong Kong's)
    ratel: (d, t) => { tone(d, t, 0.012, 'square', 900, 0, 0.55, 0.001); tone(d, t + 0.004, 0.02, 'triangle', 2600, 0, 0.25, 0.001); }, // (the rateltikker's knock)
  };
  function walkCall(kind, level = 1, pan = 0) {
    if (!ctx || muted || level <= 0.002 || !CALLS[kind]) return false;
    CALLS[kind](out(0.09 * Math.min(1, level), pan, 1), ctx.currentTime + LEAD);
    return true;
  }
  function piyo(side = 0, level = 1) { walkCall(side ? 'piyopiyo' : 'piyo', level); }
  function kakko(side = 0, level = 1) { walkCall(side ? 'kakakko' : 'kakko', level); }
  // a station's announcement, carried from the concourse: its two-note chime, then a voice too far
  // off to make out (noise through moving vowel formants)
  function announce(level = 1) {
    if (!ctx || muted || level <= 0) return;
    const t = ctx.currentTime + LEAD;
    [[0, 1046.5], [0.32, 784]].forEach(([d, f]) => { const o = ctx.createOscillator(), g = ctx.createGain(), a = t + d;
      o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, a); g.gain.linearRampToValueAtTime(0.05 * level, a + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, a + 0.9);
      o.connect(g); g.connect(master); o.start(a); o.stop(a + 1); free(o, g); });
    const s = ctx.createBufferSource(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), g = ctx.createGain(), a = t + 1.3, dur = 3.6;
    s.buffer = noise; s.loop = true; f1.type = 'bandpass'; f1.Q.value = 6; f2.type = 'bandpass'; f2.Q.value = 8;
    for (let k = 0; k < 18; k++) { const at = a + k * dur / 18; f1.frequency.setValueAtTime(350 + Math.random() * 500, at); f2.frequency.setValueAtTime(1000 + Math.random() * 1300, at); }
    g.gain.setValueAtTime(0.0001, a);
    for (let k = 0; k < 14; k++) { const at = a + k * dur / 14; g.gain.linearRampToValueAtTime((0.04 + Math.random() * 0.05) * level, at + 0.05); g.gain.linearRampToValueAtTime(0.008 * level, at + dur / 14); }
    g.gain.linearRampToValueAtTime(0.0001, a + dur);
    s.connect(f1); s.connect(f2); f1.connect(g); f2.connect(g); g.connect(master); s.start(a); s.stop(a + dur + 0.1); free(s, g);
  }
  // ---------------------------------------------------------------- the railway (trains.js)
  // A train near the camera, one of three voices: the wheels' rumble on the rail (low noise, louder and
  // brighter with speed), the roll of the wheels near you (a hiss that grows with the square of the speed; the air a
  // Shinkansen pushes, most of what it is), over a steel bridge the bridge itself (a low boom), and the motors'
  // whine while it pulls away or brakes. level 0 silences the voice; nothing plays between trains.
  // close (0..1): how near the wheels are, for what the air takes first with distance (the roll, the whine's edge);
  // bridge (0..1): the train is overhead on a steel deck (trainAt below)
  const trainCh = [];
  function train(i, level, pan = 0, v = 0, a = 0, fast = false, close = 1, bridge = 0) {
    if (!ctx) return;
    let c = trainCh[i];
    if (!c) {
      if (level <= 0) return;
      const mk = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
      const outG = ctx.createGain(), pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      outG.gain.value = 0;
      if (pn) { outG.connect(pn); pn.connect(master); } else outG.connect(master);
      const rum = mk('lowpass', 200, 0.7), rg = ctx.createGain(), air = mk('bandpass', 1800, 0.5), ag = ctx.createGain();
      noiseSource().connect(rum); rum.connect(rg); rg.connect(outG);
      noiseSource().connect(air); air.connect(ag); ag.connect(outG);
      const mo = ctx.createOscillator(), m2 = ctx.createOscillator(), mf = mk('bandpass', 700, 3), mg = ctx.createGain();
      mo.type = 'sawtooth'; m2.type = 'square'; mo.connect(mf); m2.connect(mf); mf.connect(mg); mg.connect(outG); mo.start(); m2.start();
      const deck = mk('bandpass', 64, 4), dg = ctx.createGain(); // (a steel deck's drum: its lowest modes, 50 to 80 Hz)
      noiseSource().connect(deck); deck.connect(dg); dg.connect(outG);
      rg.gain.value = ag.gain.value = mg.gain.value = dg.gain.value = 0;
      c = trainCh[i] = { outG, pn, rum, rg, air, ag, mo, m2, mf, mg, dg };
    }
    const on = muted ? 0 : Math.min(1.2, level), k = Math.min(1.4, v / 25);
    ramp(c.outG.gain, on, 0.12);
    if (c.pn) ramp(c.pn.pan, Math.max(-1, Math.min(1, pan)), 0.1);
    ramp(c.rum.frequency, 110 + 260 * k, 0.2); ramp(c.rg.gain, (fast ? 0.34 : 0.5) * Math.min(1, 0.25 + k), 0.2);
    // (a commuter train's roll is near you or nowhere: heard from 240 m, a bed of hiss swelling slowly and falling as
    // slowly was a jet going over. The wheels' own swells come with each bogie: clack)
    ramp(c.air.frequency, fast ? 2300 : 1100, 0.3); ramp(c.ag.gain, (fast ? 0.42 : 0.07 * close) * k * k, 0.2);
    ramp(c.dg.gain, fast ? 0 : 0.6 * bridge * Math.min(1, 0.3 + k), 0.15);
    // the inverter's whine follows the speed while the motors work, and is gone as the train coasts
    const f = 180 + v * 46;
    ramp(c.mo.frequency, f, 0.1); ramp(c.m2.frequency, f * 1.5, 0.1); ramp(c.mf.frequency, f * 1.6, 0.1);
    ramp(c.mg.gain, (a && !fast ? 0.035 + 0.02 * Math.min(1, v / 8) : fast ? 0.012 * k : 0) * (0.3 + 0.7 * close), 0.35);
  }
  // A train where you stand (trains.js asks for each of the three nearest, each frame): s = { near, above, v, a, len,
  // pan, fast }, near the distance to its nearest car (m), above how far its rail is over your ears (m), len a car's
  // length. A train is not a jet, and what tells the ear so is the wheels: a bogie at a time over the rail's joints and
  // a deck's, its two axles a wheelbase apart, a car's two bogies 0.69 of its length apart and the next car's front bogie
  // close behind the last one's rear (ta-tan . . . ta-tan ta-tan . . . ta-tan); the roll swelling with each bogie as it
  // goes by; and overhead on a steel bridge, the bridge struck by every axle, a boom under the clatter. Far off, only the
  // rumble: the air takes the high sound first, and the wheels are lost in it
  const trainRun = [];
  function trainAt(i, s, dt) {
    if (!ctx) return;
    if (!s) { train(i, 0); if (trainRun[i]) trainRun[i].t = 0; return; }
    const near = s.near, level = Math.pow(Math.max(0, 1 - near / 240), 2.2) * (1 + 0.6 * Math.max(0, 1 - near / 30));
    const close = Math.max(0, Math.min(1, (45 - near) / 35)), bridge = (s.above || 0) > 3 && near < 30 ? Math.min(1, (30 - near) / 14) : 0, pan = s.pan || 0;
    train(i, level, pan, s.v, s.a || 0, !!s.fast, close, bridge);
    const R = trainRun[i] = trainRun[i] || { t: 0, k: 0 };
    if (s.fast || s.v < 1.5 || close <= 0) { R.t = 0; return; }
    if ((R.t -= dt) > 0) return;
    const len = s.len || 20, inner = 0.69 * len;
    clack(level * (0.3 + 0.7 * close * close), pan, s.v, bridge, close);
    R.t = (R.k++ % 2 ? len - inner : inner) / s.v;
  }
  // a bogie over a rail joint: its two axles, the second a wheelbase (2.1 m) behind the first. Each is steel on steel:
  // a bright tick, the wheel's body and the knock of the axle; the roll of the bogie swelling past under them; and on a
  // steel deck the deck itself, boomed by each axle and ringing a little
  function clack(level, pan = 0, v = 10, bridge = 0, close = 1) {
    if (!ctx || muted || level <= 0.004) return;
    // (t: the first axle, after the roll has begun to swell, at now and LEAD: begun 0.12 s before the axle at now, the
    // roll started in the past, part way up its swell, in a single sample)
    const d = out(Math.min(1, level) * 0.3, pan, 1.3), t = ctx.currentTime + LEAD + 0.12, gap = Math.min(0.5, 2.1 / Math.max(2, v)); // (as loud as the wheels were: their rhythm, not their level, is what was missing)
    const nz = (at, type, f, q, vol, a, rel) => { const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + a); g.gain.exponentialRampToValueAtTime(0.0001, at + a + rel); s.connect(fl); fl.connect(g); g.connect(d); s.start(at, Math.random() * 1.5); s.stop(at + a + rel + 0.05); free(s, g); };
    for (const [at, k] of [[t, 1], [t + gap, 0.8]]) {
      nz(at, 'bandpass', 2600, 1.4, 0.3 * k * close, 0.001, 0.012);  // (the tick: wheel on the joint's edge)
      nz(at, 'lowpass', 900, 1.0, 0.85 * k, 0.003, 0.08);            // (the wheel's body)
      tone(d, at, 0.06, 'sine', 160, 75, 0.6 * k, 0.003);             // (the axle's knock)
      if (bridge > 0) { tone(d, at, 0.42, 'sine', 64, 44, 0.9 * k * bridge, 0.004); tone(d, at, 0.28, 'sine', 412, 405, 0.07 * k * bridge, 0.002); tone(d, at, 0.2, 'sine', 683, 676, 0.045 * k * bridge, 0.002); } // (the deck's boom, and its ring)
    }
    nz(t - 0.12, 'bandpass', 1100, 0.8, 0.22 * close, 0.12, 0.45);    // (the bogie's roll swelling past)
  }
  // a struck bar: the note, its octave and a bright partial that dies first (the platform's chimes and melody)
  function bar(dst, at, f, dur, vol) {
    tone(dst, at, dur, 'sine', f, 0, vol, 0.004); tone(dst, at, dur * 0.6, 'sine', f * 2, 0, vol * 0.28, 0.004); tone(dst, at, dur * 0.25, 'triangle', f * 3.01, 0, vol * 0.12, 0.003);
  }
  // before an announcement: four notes rising
  function platformChime(level = 1, pan = 0) {
    if (!ctx || muted || level <= 0) return;
    const d = out(0.11 * Math.min(1, level), pan, 1.8), t = ctx.currentTime + LEAD;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bar(d, t + i * 0.2, f, 0.9, 0.8));
  }
  // the doors: two notes falling, three times
  function doorChime(level = 1, pan = 0) {
    if (!ctx || muted || level <= 0) return;
    const d = out(0.07 * Math.min(1, level), pan, 2.6), t = ctx.currentTime + LEAD;
    for (let k = 0; k < 3; k++) { bar(d, t + k * 0.62, 1318.5, 0.3, 0.8); bar(d, t + k * 0.62 + 0.24, 1046.5, 0.4, 0.8); }
  }
  // a departure melody of this game's own (seven seconds, two of them: one for each direction), on struck
  // bars over a soft bass: none of the railway's own melodies, which are their composers'
  const MELODY = [
    [[0, 76], [0.3, 79], [0.6, 84], [0.9, 79], [1.2, 81], [1.5, 84], [1.8, 88], [2.25, 86], [2.7, 84], [3.0, 81], [3.3, 79], [3.6, 76], [3.9, 77], [4.2, 81], [4.5, 79], [4.95, 83], [5.4, 84]],
    [[0, 79], [0.25, 83], [0.5, 86], [0.75, 91], [1.25, 88], [1.75, 86], [2.0, 84], [2.25, 81], [2.5, 84], [3.0, 86], [3.5, 83], [3.75, 79], [4.0, 81], [4.25, 83], [4.5, 86], [5.0, 84], [5.5, 79]],
  ];
  const BASS = [[[0, 48], [1.2, 53], [2.4, 55], [3.6, 53], [4.8, 48]], [[0, 43], [1.0, 48], [2.0, 50], [3.0, 55], [4.0, 50], [5.0, 48]]];
  function melody(level = 1, pan = 0, which = 0) {
    if (!ctx || muted || level <= 0) return;
    const d = out(0.085 * Math.min(1, level), pan, 8.3), t = ctx.currentTime + LEAD, hz = n => 440 * Math.pow(2, (n - 69) / 12), w = which ? 1 : 0;
    for (const [at, n] of MELODY[w]) bar(d, t + at, hz(n), 1.1, 0.75);
    for (const [at, n] of BASS[w]) tone(d, t + at, 1.3, 'triangle', hz(n), 0, 0.5, 0.02);
    bar(d, t + 5.9, hz(MELODY[w][MELODY[w].length - 1][1] + (w ? 5 : 0)), 2.2, 0.7);
  }
  // ------------------------------------------------------------ the Stop: the street's own sound braked like tape
  // The world's bus is kept, the last five seconds of it, in a ring. When time is held the street is played back from
  // that ring at a speed falling as the story's clock does (st.k from 1 to 0 over 0.95 s, the world's time k², so the
  // tape's speed k²: its pitch and its rate fall together), darkening as it slows (two one-pole low-passes closing from
  // 11 kHz to 150 Hz). Under it, as it slows, grains of the moment it stopped (Hann-like windows 80 to 300 ms long, at
  // the pitch, a fifth, an octave and a twelfth over, high-passed) rise into a held shimmer, made of nothing but the
  // last sound the street made. Let go, the tape spins up again from where it stopped (k from 0 to 1 over 0.6 s) and
  // crosses into the live street in a quarter of a second. Its only control is the k-rate parameter `held`, set at a
  // time, so an offline render (tools/sound_render.js) brakes exactly where a live one does.
  function tapeWorklet() {
    const BRAKE = 0.95, SPIN = 0.6, XF = 0.25, N = 1 << 18, M = N - 1, RATES = [1, 1.5, 2, 2, 3], SH = 0.35;
    class Tape extends AudioWorkletProcessor {
      static get parameterDescriptors() { return [{ name: 'held', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }]; }
      constructor() {
        super();
        this.L = new Float32Array(N); this.R = new Float32Array(N);
        this.w = 0; this.r = 0; this.mode = 0; this.t = 0; this.lp = [0, 0, 0, 0]; this.hp = [0, 0, 0, 0]; this.seed = 7;
        this.g = []; for (let i = 0; i < 7; i++) this.g.push({ n: 0, len: 1, p: 0, rate: 1, pl: 0.7, pr: 0.7, wait: i * 1700 });
      }
      rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
      process(inputs, outputs, params) {
        const inp = inputs[0] || [], o = outputs[0], oL = o[0], oR = o[1] || o[0], n = oL.length, sr = sampleRate;
        const iL = inp[0], iR = inp[1] || inp[0], held = params.held[0] > 0.5, BL = this.L, BR = this.R, lp = this.lp, hp = this.hp;
        // (held while spinning up, or let go mid-brake: from the speed it had)
        if (held && (this.mode === 0 || this.mode === 3)) { this.t = this.mode === 3 ? (1 - Math.min(1, this.t / SPIN)) * BRAKE : 0; if (this.mode === 0) this.r = this.w; this.mode = 1; }
        if (!held && (this.mode === 1 || this.mode === 2)) { this.t = this.mode === 1 ? (1 - this.t / BRAKE) * SPIN : 0; this.mode = 3; }
        if (this.mode === 0) {
          for (let i = 0; i < n; i++) { const xl = iL ? iL[i] : 0, xr = iR ? iR[i] : 0; BL[this.w & M] = xl; BR[this.w & M] = xr; this.w++; oL[i] = xl; if (oR !== oL) oR[i] = xr; }
          return true;
        }
        const k0 = this.mode === 1 ? Math.max(0, 1 - this.t / BRAKE) : this.mode === 3 ? Math.min(1, this.t / SPIN) : 0;
        const a = 1 - Math.exp(-2 * Math.PI * (150 + 11000 * k0 * k0) / sr), ah = Math.exp(-2 * Math.PI * 900 / sr);
        const read = (B, p) => { const i = Math.floor(p), f = p - i; return B[i & M] * (1 - f) + B[(i + 1) & M] * f; };
        for (let i = 0; i < n; i++) {
          const xl = iL ? iL[i] : 0, xr = iR ? iR[i] : 0;
          if (this.mode !== 2) { BL[this.w & M] = xl; BR[this.w & M] = xr; this.w++; }
          const k = this.mode === 1 ? Math.max(0, 1 - this.t / BRAKE) : this.mode === 3 ? Math.min(1, this.t / SPIN) : 0;
          let tl = 0, tr = 0;
          if (k > 0) { this.r += k * k; tl = read(BL, this.r); tr = read(BR, this.r); }
          lp[0] += a * (tl - lp[0]); lp[1] += a * (lp[0] - lp[1]); lp[2] += a * (tr - lp[2]); lp[3] += a * (lp[2] - lp[3]);
          const gk = Math.sqrt(k);
          let L = lp[1] * gk, R = lp[3] * gk;
          // the shimmer: grains of the ring round where the tape is (where it stopped, once it has)
          const s = this.mode === 3 ? (1 - k) * (1 - k) : 1 - k;
          if (s > 0.001) {
            let gl = 0, gr = 0;
            for (const g of this.g) {
              if (g.n <= 0) {
                if (g.wait-- > 0) continue;
                g.len = Math.floor((0.08 + 0.22 * this.rnd()) * sr); g.n = g.len; g.rate = RATES[Math.floor(this.rnd() * RATES.length)] * (1 + (this.rnd() - 0.5) * 0.008);
                g.p = Math.min(this.r - (0.08 + 0.4 * this.rnd()) * sr, this.w - 2 - g.len * g.rate);
                const pan = this.rnd(); g.pl = Math.sqrt(1 - pan); g.pr = Math.sqrt(pan); g.wait = Math.floor(this.rnd() * g.len * 0.6);
              }
              const x = 1 - g.n / g.len, e = 16 * x * x * (1 - x) * (1 - x), v = (read(BL, g.p) + read(BR, g.p)) * 0.5 * e;
              gl += v * g.pl; gr += v * g.pr; g.p += g.rate; g.n--;
            }
            // (high-passed: the air of it, not its weight)
            hp[0] = ah * (hp[0] + gl - hp[1]); hp[1] = gl; hp[2] = ah * (hp[2] + gr - hp[3]); hp[3] = gr;
            L += hp[0] * s * SH; R += hp[2] * s * SH;
          }
          // spun up: across into the live street
          if (this.mode === 3 && this.t > SPIN) { const x = Math.min(1, (this.t - SPIN) / XF); L = L * (1 - x) + xl * x; R = R * (1 - x) + xr * x; if (x >= 1) this.mode = 0; }
          oL[i] = L; if (oR !== oL) oR[i] = R;
          this.t += 1 / sr;
          if (this.mode === 1 && this.t >= BRAKE) { this.mode = 2; this.t = 0; }
        }
        return true;
      }
    }
    registerProcessor('oe-tape', Tape);
  }
  // ------------------------------------------------------------ the tape on a touch screen: a deck of the browser's own nodes
  // An AudioWorklet takes the whole of a context's rendering onto its own thread, and that thread is not a real-time one
  // (Chromium's design notes; WebKit renders the same way): on a phone, under a page that is loading the map or
  // compiling its shaders, it misses blocks, and a missed block is a click. iOS has also, more than once, left a whole
  // context distorted, at full level, once a worklet was added to it (WebKit bugs 251091, 274507). The owner heard the
  // phone "as if it were broken" from the opening on, on iOS 27. So a touch screen brakes the street without one: the
  // street is read through a delay whose length grows as the tape slows, and a line read through a growing delay is
  // heard at the speed 1 - d'(t), pitch and rate falling together as the worklet's do; the same speed k², the same
  // low-pass closing from 11 kHz to 150 Hz (a biquad of Q 0.5, the worklet's two one-pole sections), the same gain √k.
  // The brake over 0.95 s from k = 1 lengthens the delay by 2/3 of that; held, the tape is silent; let go, it spins up
  // over 0.6 s from where it was (a third of 0.6 s more delay) and crosses into the live street in a quarter of a second,
  // when the delay goes back to nothing. What the deck has not got is the worklet's shimmer of grains of the last
  // moment: a phone hears the held street as the room's tail, the story's choir and its glass.
  function deckOf() {
    const BRAKE = 0.95, SPIN = 0.6, XF = 0.25, MAXD = 4;
    const input = ctx.createGain(), dry = ctx.createGain(), dl = ctx.createDelay(MAXD), lp = ctx.createBiquadFilter(), wet = ctx.createGain(), output = ctx.createGain();
    lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = 11150; wet.gain.value = 0; dl.delayTime.value = 0;
    input.connect(dry); dry.connect(output); input.connect(dl); dl.connect(lp); lp.connect(wet); wet.connect(output);
    // a phase: 'live', 'brake' or 'spin' from t0, with the speed k0 and the delay d0 it began at (held is a brake that
    // has run out; a spin's end crosses into the live street)
    let ph = { kind: 'live', t0: 0, k0: 1, d0: 0 };
    const cube = x => x * x * x, run = (kind, k0) => (kind === 'brake' ? k0 * BRAKE : (1 - k0) * SPIN);
    // where the deck is at time t: the speed k, the delay d, the tape's gain w and the live street's y
    function at(t) {
      const s = Math.max(0, t - ph.t0), r = run(ph.kind, ph.k0), sr = Math.min(s, r);
      if (ph.kind === 'brake') {
        const k = Math.max(0, ph.k0 - sr / BRAKE);
        return { k, d: Math.min(MAXD - 0.1, ph.d0 + sr - BRAKE / 3 * (cube(ph.k0) - cube(k))), w: Math.sqrt(k), y: 0 };
      }
      if (ph.kind === 'spin' && s < r + XF + 0.02) {
        const k = Math.min(1, ph.k0 + sr / SPIN), d = Math.min(MAXD - 0.1, ph.d0 + sr - SPIN / 3 * (cube(k) - cube(ph.k0))), x = Math.max(0, (s - r) / XF);
        return { k, d, w: Math.sqrt(k) * (1 - Math.min(1, x)), y: Math.min(1, x), crossing: s > r };
      }
      return { k: 1, d: 0, w: 0, y: 1, live: true };
    }
    const params = [dl.delayTime, lp.frequency, wet.gain, dry.gain];
    // lay a phase on the params from time t, from where the deck is then (q): the delay, the low-pass and the tape's
    // gain in straight segments, the live street crossed out of over the first (both read the same street there)
    function lay(kind, t, k0, d0, q) {
      for (const p of params) { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t); }
      ph = { kind, t0: t, k0, d0 };
      const T = run(kind, k0), n = Math.max(2, Math.ceil(24 * T / BRAKE));
      dl.delayTime.setValueAtTime(d0, t); lp.frequency.setValueAtTime(150 + 11000 * k0 * k0, t); wet.gain.setValueAtTime(q.w, t); dry.gain.setValueAtTime(q.y, t);
      dry.gain.linearRampToValueAtTime(0, t + T / n);
      for (let i = 1; i <= n; i++) {
        const u = t + T * i / n, z = at(u);
        dl.delayTime.linearRampToValueAtTime(z.d, u); lp.frequency.linearRampToValueAtTime(150 + 11000 * z.k * z.k, u); wet.gain.linearRampToValueAtTime(Math.sqrt(z.k), u);
      }
      if (kind === 'spin') { // spun up: across into the live street, and the delay back to nothing once it is not heard
        const e = t + T;
        wet.gain.linearRampToValueAtTime(0, e + XF); dry.gain.setValueAtTime(0, e); dry.gain.linearRampToValueAtTime(1, e + XF);
        dl.delayTime.setValueAtTime(at(e).d, e + XF); dl.delayTime.setValueAtTime(0, e + XF + 0.02);
      }
    }
    function set(on) {
      const t = ctx.currentTime + LEAD, q = at(t);
      // held: from the live street, or from a spin up (from its speed; crossing into the street, from the full speed)
      if (on) { if (ph.kind !== 'brake') lay('brake', t, q.live || q.crossing ? 1 : q.k, q.live ? 0 : q.d, q); }
      else if (ph.kind === 'brake') lay('spin', t, q.k, q.d, q);
    }
    return { input, output, set };
  }
  // the Stop (story.js): the street brakes to a held shimmer, and spins up again (the tape, above; the deck on a touch
  // screen; without either the street's sound only falls away and comes back)
  function hush(on) {
    if (!ctx) return;
    if (deck) deck.set(on);
    else if (tape) { tape.parameters.get('held').setValueAtTime(on ? 1 : 0, ctx.currentTime); if (!on) ramp(master.gain, 1, 0.1); } // (a hush from before the tape was loaded let go)
    else ramp(master.gain, on ? 0.16 : 1, on ? 0.25 : 1.2);
  }
  // ------------------------------------------------------------ a room for each place
  // Convolution with impulse responses made here (exponentially decaying noise that darkens as it decays, after a few
  // discrete early reflections at the distances of the walls that make them): the crossing's tall faces and open sky,
  // the concrete under the viaduct, a lobby or a lift, the open deck 230 m up. place(kind) crossfades to a new
  // convolver in 0.3 s (game.js says which, from where the player is). Each response is scaled to an energy of one (the
  // convolver's own normalising is off), so `wet` is the room's level against the dry sound: the open street's 15 dB
  // under it, the viaduct's 9.
  const PLACES = {
    open: { rt: 1.5, wet: 0.18, pre: 0.012, dark: 2600, er: [[0.031, 0.5], [0.047, -0.35], [0.083, 0.3], [0.121, -0.22], [0.19, 0.15]] },
    viaduct: { rt: 1.9, wet: 0.35, pre: 0.004, dark: 1800, er: [[0.009, 0.7], [0.014, -0.6], [0.021, 0.5], [0.028, -0.45], [0.036, 0.4], [0.045, -0.3]] },
    inside: { rt: 0.7, wet: 0.25, pre: 0.003, dark: 4000, er: [[0.006, 0.6], [0.011, -0.5], [0.017, 0.4], [0.024, -0.3]] },
    roof: { rt: 0.4, wet: 0.05, pre: 0.02, dark: 6000, er: [[0.06, 0.2]] },
  };
  let irs = {}, placeNow = null;
  const verbs = [];
  // the responses' noise from a fixed seed for each room and channel (mulberry32, public domain): every page hears the
  // same room, the one tools/reverb_check.js measured, and not a new draw of it at each load (a draw now and then put
  // the inside's low band past the check's tolerance of the whole convolution)
  const seeded = s => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  function impulse(kind, c0 = ctx) {
    if (c0 === ctx && irs[kind]) return irs[kind];
    const P = PLACES[kind], sr = c0.sampleRate, n = Math.floor(sr * (P.pre + P.rt * 1.1)), b = c0.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c), rnd = seeded(Object.keys(PLACES).indexOf(kind) * 7919 + c * 104729 + 1);
      let lp = 0;
      for (let i = Math.floor(P.pre * sr); i < n; i++) {
        const t = i / sr - P.pre, fc = P.dark + (14000 - P.dark) * Math.exp(-6 * t / P.rt);
        lp += (1 - Math.exp(-2 * Math.PI * fc / sr)) * (rnd() * 2 - 1 - lp);
        d[i] = lp * Math.pow(10, -3 * t / P.rt) * Math.min(1, t / 0.01);
      }
      for (const [at, g] of P.er) { const i = Math.floor((P.pre + at * (c ? 1.07 : 1)) * sr); if (i < n) d[i] += g * 0.6; }
    }
    let e = 0; for (let c = 0; c < 2; c++) for (const v of b.getChannelData(c)) e += v * v;
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c), k = 1 / Math.sqrt(e / 2); for (let i = 0; i < n; i++) d[i] *= k; }
    if (c0 === ctx) irs[kind] = b;
    return b;
  }
  function place(kind) {
    if (!ctx || kind === placeNow || !PLACES[kind]) return;
    placeNow = kind;
    const t = ctx.currentTime, cv = reverb(impulse(kind)), g = ctx.createGain();
    g.gain.value = 0; verbIn.connect(cv.input); cv.output.connect(g); g.connect(duck);
    g.gain.setTargetAtTime(PLACES[kind].wet, t, 0.1);
    for (const v of verbs.splice(0)) { v.g.gain.setTargetAtTime(0, t, 0.1); setTimeout(() => { try { verbIn.disconnect(v.cv.input); v.cv.dispose(); v.g.disconnect(); } catch (e) { /* already gone */ } }, 1500); }
    verbs.push({ cv, g });
  }
  // ------------------------------------------------------------ every sound made on the audio thread (docs/SOUND.md)
  // On a phone a context has one thread that is given real time: iOS plays Web Audio in blocks of 128 frames (2.7 ms at
  // 48 kHz; WebKit's MediaSessionManagerCocoa asks for one render quantum), and a block not ready in time is a click, a
  // run of them a phone that sounds broken. Anything the sound waits on from another thread is starved by a busy page
  // (the opening over the crowd, the flight): the tape's AudioWorklet was one (the deck, above); a long reverb is the
  // other. WebKit convolves the first 12,288 frames of an impulse response on the audio thread and the rest on a
  // background thread of default priority (ReverbConvolver.cpp, RealtimeFrameLimit; "would be better to up the thread
  // priority here"), whose part of the tail then comes late. Cutting the response into pieces short enough for the audio
  // thread is exact but costs it a pair of FFTs per 1,024 frames for every 1,024 frames of response: the rooms, the
  // story's hall and the score's room together would take most of a phone's core. So on a touch screen a reverb is a
  // hybrid, as Moorer's paper proposed (1979, the impulse responses' own source): its first quarter of a second
  // convolved as it is (the room's early reflections, which are its character, on the audio thread at the cost they had),
  // and the rest made by feedback combs on the audio thread (Schroeder, 1962; Moorer's low-passed combs): six a side, each
  // a delay of 67 to 132 ms feeding back into itself, losing what the response loses in that time, through a high shelf
  // for what it loses faster above 3 kHz; fed with the response's own last tenth of a second and set to the level of its
  // own tail (tailOf). Its cost does not grow with the tail. (Its delays do not sway, as Dattorro's do: a delay read
  // between samples dulls the tail a little on every pass, and the hall's goes round fifty times.) Each loop has one delay of its own: loops that
  // share delays (a feedback delay network's matrix) were tried and run away in both Chromium and WebKit, which add a
  // render quantum to some edges of interlocking loops and not to others (tools/reverb_check.js). With a mouse the whole
  // response is convolved, as before (?verb=hybrid or ?verb=whole picks one, for the tools).
  const RT_FRAMES = 12288, HEAD = 0.25, SEED = 0.1, SHELF = 3000, Q128 = 128;
  const COMBS = [[0.0673, 0.0791, 0.0899, 0.1013, 0.1137, 0.1279], [0.0719, 0.0833, 0.0947, 0.1071, 0.1193, 0.1319]];
  const VERB = (/[?&]verb=(hybrid|whole)\b/.exec(location.search) || [])[1] || (TOUCH ? 'hybrid' : 'whole');
  const hann = x => Math.sin(Math.PI * x) ** 2;
  // a reverb from an impulse response: { input, output }. scale: what the browser's own normalising would multiply the
  // response by (normScale), since no piece of it is normalised by the browser
  function reverb(ir, scale = 1, c0 = ctx, how = VERB) {
    const sr = ir.sampleRate, nc = ir.numberOfChannels, len = ir.length, input = c0.createGain(), output = c0.createGain();
    const S = Math.min(Math.round(HEAD * sr), RT_FRAMES);
    const piece = (a, b, w) => {
      const n = b - a, buf = c0.createBuffer(nc, n, sr);
      for (let c = 0; c < nc; c++) { const x = ir.getChannelData(c), d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = x[a + i] * scale * (w ? w((i + 0.5) / n) : 1); }
      const cv = c0.createConvolver(); cv.normalize = false; cv.buffer = buf; return cv;
    };
    if (how !== 'hybrid' || len <= S) { const cv = piece(0, len); input.connect(cv); cv.connect(output); return { input, output, how: 'whole', frames: len, dispose: () => input.disconnect() }; }
    const t = tailOf(ir, scale, S), fade = x => (x > 1 - 64 / S ? (1 - x) * S / 64 : 1);
    // (a response 30 dB down by the end of its head, the roof's: its head alone, the last 64 frames faded)
    const head = piece(0, S, t.none ? fade : null); input.connect(head); head.connect(output);
    if (t.none) return { input, output, how: 'head', frames: S, tail: t, dispose: () => input.disconnect() };
    const seed = piece(S - t.W, S, hann), pre = c0.createDelay(HEAD);
    pre.delayTime.value = t.P / sr; pre.channelCount = 2; pre.channelCountMode = 'explicit';
    const split = c0.createChannelSplitter(2), merge = c0.createChannelMerger(2), out = c0.createGain();
    input.connect(seed); seed.connect(pre); pre.connect(split); merge.connect(out); out.gain.value = t.gain; out.connect(output);
    const loops = [];
    for (let side = 0; side < 2; side++) {
      const flip = c0.createGain(); flip.gain.value = -1; split.connect(flip, nc > 1 ? side : 0); // (every other comb fed the seed upside down: they sum flatter)
      t.C[side].forEach((q, k) => {
        const d = c0.createDelay(0.2); d.delayTime.value = q.D / sr; d.channelCount = 1; d.channelCountMode = 'explicit';
        let o = d;
        if (q.H < -0.05) { const f = c0.createBiquadFilter(); f.type = 'highshelf'; f.frequency.value = SHELF; f.gain.value = q.H; d.connect(f); o = f; }
        const g = c0.createGain(); g.gain.value = q.g; o.connect(g); g.connect(d); loops.push(g);
        if (k % 2) flip.connect(d); else split.connect(d, nc > 1 ? side : 0);
        d.connect(merge, 0, side);
      });
    }
    // (taken down when it is let go: its loops opened, since a loop of nodes left connected to itself is never freed where
    // nodes are counted by reference, as WebKit's are)
    const dispose = () => { for (const n of loops) n.disconnect(); input.disconnect(); };
    return { input, output, how: 'hybrid', frames: S, tail: t, dispose };
  }
  // the biquads as the Web Audio spec has them (the Audio EQ Cookbook): a high shelf (gain in dB, slope 1), or a
  // low-pass or high-pass of quality q
  function biq(type, f, q, gain, sr) {
    const w = 2 * Math.PI * f / sr, cs = Math.cos(w), sn = Math.sin(w);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'highshelf') {
      const A = Math.pow(10, gain / 40), al = sn / 2 * Math.SQRT2, k = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) + (A - 1) * cs + k); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - k);
      a0 = (A + 1) - (A - 1) * cs + k; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - k;
    } else if (type === 'lowpass') { const al = sn / (2 * q); b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else { const al = sn / (2 * q); b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    const B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return v => { const y = B0 * v + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; return y; };
  }
  // the same biquads' coefficients, for a loop that runs them inline: [b0, b1, b2, a1, a2] over a0
  function coef(type, f, q, gain, sr) {
    const w = 2 * Math.PI * f / sr, cs = Math.cos(w), sn = Math.sin(w), A = Math.pow(10, gain / 40), al = sn / 2 * Math.SQRT2, k = 2 * Math.sqrt(A) * al;
    const a0 = (A + 1) - (A - 1) * cs + k;
    return [A * ((A + 1) + (A - 1) * cs + k) / a0, -2 * A * ((A - 1) + (A + 1) * cs) / a0, A * ((A + 1) + (A - 1) * cs - k) / a0, 2 * ((A - 1) - (A + 1) * cs) / a0, ((A + 1) - (A - 1) * cs - k) / a0];
  }
  // the tail fitted to the response after its head: how fast it decays below 1 kHz and above 3 kHz (a line through the
  // first 30 dB of each band's energy decay curve, Schroeder's backward integral: the rooms' responses darken as they
  // die, so their low end lasts longer than their whole), and the combs' level, found by running the combs themselves
  // here, sample by sample, and matching their energy to the response's (once for each response).
  // A loop of one delay in Web Audio goes round in its delay and one render quantum more (Chromium and WebKit both)
  const fits = new WeakMap();
  function tailOf(ir, scale, S) {
    const k = fits.get(ir);
    if (k && k.scale === scale && k.S === S) return k;
    const sr = ir.sampleRate, nc = ir.numberOfChannels, len = ir.length;
    // (the three bands' energies after the head in one pass over the response, in blocks of 32 frames)
    const B = Math.ceil((len - S) / 32), eb = [new Float64Array(B + 1), new Float64Array(B + 1), new Float64Array(B + 1)];
    const pass = (type, f) => { const w = 2 * Math.PI * f / sr, cs = Math.cos(w), al = Math.sin(w) * Math.SQRT1_2, a0 = 1 + al, k = type === 'lowpass' ? (1 - cs) / 2 : (1 + cs) / 2; return [k / a0, (type === 'lowpass' ? 1 - cs : -(1 + cs)) / a0, k / a0, -2 * cs / a0, (1 - al) / a0]; };
    const [l0, l1, l2, la1, la2] = pass('lowpass', 1000), [h0, h1, h2, ha1, ha2] = pass('highpass', SHELF);
    for (let c = 0; c < nc; c++) {
      const x = ir.getChannelData(c), e0 = eb[0], e1 = eb[1], e2 = eb[2];
      let lx1 = 0, lx2 = 0, ly1 = 0, ly2 = 0, hx1 = 0, hx2 = 0, hy1 = 0, hy2 = 0;
      for (let i = 0; i < len; i++) {
        const v = x[i] * scale, l = l0 * v + l1 * lx1 + l2 * lx2 - la1 * ly1 - la2 * ly2, h = h0 * v + h1 * hx1 + h2 * hx2 - ha1 * hy1 - ha2 * hy2;
        lx2 = lx1; lx1 = v; ly2 = ly1; ly1 = l; hx2 = hx1; hx1 = v; hy2 = hy1; hy1 = h;
        if (i >= S) { const b = (i - S) >> 5; e0[b] += v * v; e1[b] += l * l; e2[b] += h * h; }
      }
    }
    const decay = band => {
      const e = eb[band === 'low' ? 1 : band === 'high' ? 2 : 0];
      for (let i = e.length - 2; i >= 0; i--) e[i] += e[i + 1];
      let n = 0, st = 0, sd = 0, stt = 0, std = 0;
      for (let i = 0; i < e.length - 1 && e[0] > 0; i++) { const db = 10 * Math.log10(e[i] / e[0] + 1e-30); if (db < -30) break; const t = i * 32 / sr; n++; st += t; sd += db; stt += t * t; std += t * db; }
      const slope = n > 2 ? (n * std - st * sd) / (n * stt - st * st) : -60;
      return { rt: slope < 0 ? -60 / slope : 1, e: e[0] };
    };
    let total = 0;
    for (let c = 0; c < nc; c++) for (const v of ir.getChannelData(c)) total += v * v * scale * scale;
    const all = decay(), low = decay('low'), hi = decay('high'), rt = Math.max(0.1, low.rt), perS = -60 * Math.max(0, 1 / Math.max(0.05, hi.rt) - 1 / rt);
    const W = Math.round(SEED * sr), P = Math.max(0, S - Math.round(W / 2) - Math.round(COMBS[0][0] * sr));
    const C = COMBS.map(side => side.map(d => { const D = Math.round(d * sr), L = D + Q128; return { D, L, g: Math.pow(10, -3 * L / sr / rt), H: Math.max(-6, perS * L / sr) }; }));
    // the combs run here, fed with the seed at P, for the energy they put out after the head: each side's six together,
    // exactly, for three turns of the longest (while the seed's copies in them still overlap); then each comb alone for
    // six turns more, and the rest as the series its turns are falling by (the shelf takes the high end first, so only
    // its own turns say how fast)
    let E = 0;
    for (let side = 0; side < 2; side++) {
      const x = ir.getChannelData(Math.min(side, nc - 1)), seed = new Float64Array(W);
      for (let i = 0; i < W; i++) seed[i] = x[S - W + i] * scale * hann((i + 0.5) / W);
      const T = P + Math.max(...C[side].map(q => q.D)) + W + 3 * Math.max(...C[side].map(q => q.L)), sum = new Float64Array(T);
      C[side].forEach((q, k) => {
        const L = q.L, g = q.g, ring = new Float64Array(L), cf = q.H < -0.05 ? coef('highshelf', SHELF, 0, q.H, sr) : [1, 0, 0, 0, 0], sg = k % 2 ? -1 : 1, j0 = P + q.D;
        const [b0, b1, b2, a1, a2] = cf;
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0, n = 0, w = 0;
        // (the delay's output o: the seed, and what went round; the shelf's output y is what goes round again)
        for (; n < T; n++, w = w + 1 === L ? 0 : w + 1) {
          const j = n - j0, o = (j >= 0 && j < W ? sg * seed[j] : 0) + g * ring[w], y = b0 * o + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
          x2 = x1; x1 = o; y2 = y1; y1 = y; ring[w] = y; sum[n] += o;
        }
        let last = 0, ratio = 0;
        for (let turn = 0; turn < 6; turn++) {
          let e = 0;
          for (let i = 0; i < L; i++, w = w + 1 === L ? 0 : w + 1) { const o = g * ring[w], y = b0 * o + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = o; y2 = y1; y1 = y; ring[w] = y; e += o * o; }
          E += e;
          if (last > 0) ratio = Math.min(0.999, e / last);
          last = e;
        }
        E += last * ratio / (1 - ratio); // (the turns after: each the last's share of the one before)
      });
      for (let n = S; n < T; n++) E += sum[n] * sum[n];
    }
    const fit = { scale, S, W, P, C, rt, rtHi: hi.rt, gain: E > 0 ? Math.sqrt(all.e / E) : 0, energy: all.e, none: all.e < total * 1e-3 };
    fits.set(ir, fit);
    return fit;
  }
  // the scale a ConvolverNode's normalize applies (WebKit's and Chromium's Reverb.cpp, calculateNormalizationScale): one
  // over the response's RMS, calibrated by -58 dB, at 44.1 kHz
  function normScale(ir) {
    let p = 0;
    for (let c = 0; c < ir.numberOfChannels; c++) for (const v of ir.getChannelData(c)) p += v * v;
    const power = Math.max(0.000125, Math.sqrt(p / (ir.numberOfChannels * ir.length)) || 0);
    return Math.fround(Math.fround(1 / power) * Math.pow(10, -58 * 0.05) * 44100 / ir.sampleRate) * (ir.numberOfChannels === 4 ? 0.5 : 1);
  }
  // under a line of dialogue (and the preface's type) the street and the score step back 8 dB, and come up again half a
  // second after it (5 dB left the type's ticks under the score in their own band: tools/sound_rec.js)
  function duckFor(sec = 0.4) {
    if (!duck) return;
    const g = duck.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t); g.setTargetAtTime(0.4, t, 0.025); g.setTargetAtTime(1, t + sec, 0.45);
  }
  // the Sound switch: off, the context is suspended (nothing is computed on a phone that is not heard)
  function setMuted(m) {
    muted = m;
    if (main) ramp(main.gain, m ? 0 : 0.55, 0.05); if (sbus) ramp(sbus.gain, m ? 0 : 0.5, 0.05);
    if (m) held(false); if (m && window.speechSynthesis) window.speechSynthesis.cancel();
    const c = ctx;
    if (c && c.suspend) { if (m) setTimeout(() => { if (muted && ctx === c) c.suspend(); }, 150); else c.resume(); }
    else if (!c && !m && want) start(); // (sound turned on in a touch, where it was waiting for one)
  }
  // ------------------------------------------------------------ how the audio thread keeps time (telemetry.js)
  // A browser says nothing of the blocks its audio thread missed. Ten times a second, while the sound runs and the page
  // is seen, two clocks are read against the wall's:
  // - the context's own (currentTime), which moves only as blocks are made: while the thread is held up it falls behind
  //   the wall, and when it catches up it jumps. health() gives the most it rose over its least, the two clocks' drift
  //   (parts per million) taken out (snd_late, ms), how many readings were 25 ms or more behind (snd_stall) and where the
  //   worst was (snd_at: the opening's shot or the story's beat);
  // - the output's (getOutputTimestamp: the frame at the speaker and when it is heard there). WebKit's own clock counts the
  //   frames the page's thread has made, not the ones heard, so a block made too late for the output leaves currentTime as
  //   it was; the output plays it late, and everything after it with it ("underruns in the WebContent process's audio
  //   thread lead to extra latency", WebKit bug 293296). The gap between the output's clock and the wall's steps up and
  //   stays: each step of 2 ms or more is a click, a run of them a crackle. snd_xrun counts them, snd_gap is their ms in
  //   all, snd_xat where most were;
  // and snd_off, the seconds the context was not running while sound was wanted and the page seen (iOS leaves it
  // 'interrupted' after a call or another app's sound), snd_mute when the Sound switch is off.
  // A reading from the last second before the page is hidden or the context stops is dropped: iOS stops the sound as you
  // leave the page before it says the page is hidden, and the clock that had stopped read as a stall (the owner's
  // iPhone, 19 November 2026: 58, 158 and 258 ms behind in the three readings before it was hidden, "snd_late 258").
  let hs = [], hRun = null, hLate = 0, hStall = 0, hAt = '', hOff = 0, oBase = null, o3 = [], xr = [], hXr = [];
  const XRUN = 0.002, DROP = 1.0;
  function spotNow() { // where the player is, as telemetry.js names it: the opening's shot, the story's frame and beat
    try {
      const g = window.__game; if (!g) return '';
      const o = g.overture && g.overture();
      if (o && o.active) { const s = o.shots.find(q => o.t >= q.t0 && o.t < q.t0 + q.dur); return `opening ${s ? s.id : ''}`; }
      const S = g.story && g.story.state;
      if (S && S.phase && S.phase !== 'idle' && S.phase !== 'dressed') return S.phase === 'done' ? 'the last card' : `frame ${S.fi + 1}: ${S.phase}${S.beat ? ` ${S.beat}` : ''}`.slice(0, 40);
      const t = document.getElementById('g-title');
      return t && !t.hidden ? 'title screen' : '';
    } catch (e) { return ''; }
  }
  function healthPoll() {
    if (!ctx) return;
    if (!muted && !document.hidden && ctx.state !== 'running' && ctx.state !== 'closed') hOff += 0.1;
    if (ctx.state !== 'running' || document.hidden || muted) { healthClose(true); return; }
    const w = performance.now() / 1000, sp = spotNow();
    hs.push([w, w - ctx.currentTime, sp]);
    const ot = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
    if (ot && ot.performanceTime > 0 && ot.contextTime > 0) {
      // (the median of the last three readings: a step stays, a reading's jitter does not)
      o3.push(ot.performanceTime / 1000 - ot.contextTime); if (o3.length > 3) o3.shift();
      const ol = o3.length < 3 ? null : o3.slice().sort((a, b) => a - b)[1];
      if (ol === null) { /* not three readings yet */ } else if (oBase === null || ol < oBase) oBase = ol;
      else if (ol - oBase >= XRUN) { xr.push([w, ol - oBase, sp]); oBase = ol; }
    }
    if (hs.length >= 3000) healthClose(false);
  }
  // the readings so far taken into the tallies; dropping (the page hidden or the context stopped): the last second's not
  function healthClose(dropping) {
    if (dropping && hs.length) { const end = hs[hs.length - 1][0] - DROP; hs = hs.filter(r => r[0] < end); xr = xr.filter(r => r[0] < end); }
    const n = hs.length;
    if (n >= 10) {
      let st = 0, sg = 0, stt = 0, stg = 0;
      for (const [t, g] of hs) { st += t; sg += g; stt += t * t; stg += t * g; }
      const m = (n * stg - st * sg) / (n * stt - st * st || 1), b = (sg - m * st) / n, r = hs.map(([t, g]) => g - (m * t + b)), lo = Math.min(...r);
      r.forEach((v, i) => { if (v - lo > hLate) { hLate = v - lo; hAt = hs[i][2]; } if (v - lo > 0.025) hStall++; });
    }
    hXr.push(...xr);
    hs = []; xr = [];
    if (dropping) { oBase = null; o3 = []; } // (the output's clock begins again from wherever it is when the sound does)
  }
  function health() {
    if (!ctx) return null;
    healthClose(false);
    const h = { snd: `${deck ? 'deck' : tape ? 'worklet' : 'plain'} ${VERB} ${ctx.sampleRate}`, snd_late: Math.round(hLate * 1000), snd_stall: hStall };
    if (hStall) h.snd_at = hAt;
    if (ctx.getOutputTimestamp) {
      h.snd_xrun = hXr.length; h.snd_gap = Math.round(hXr.reduce((a, r) => a + r[1], 0) * 1000);
      if (hXr.length) { const by = {}; for (const r of hXr) by[r[2]] = (by[r[2]] || 0) + 1; h.snd_xat = Object.keys(by).sort((a, b) => by[b] - by[a]).slice(0, 3).map(k => `${k} ${by[k]}`).join(', '); }
    }
    if (hOff >= 1) h.snd_off = Math.round(hOff);
    if (muted) h.snd_mute = true;
    hLate = 0; hStall = 0; hAt = ''; hOff = 0; hXr = [];
    return h;
  }
  function stop() { want = false; if (hRun) { clearInterval(hRun); hRun = null; } hs = []; xr = []; oBase = null; o3 = []; if (ctx) { ctx.close(); ctx = null; mbus = null; tape = null; deck = null; crowdBed = screenBed = null; trainCh.length = 0; } }
  // for the score (game/music.js): the context it plays on, and a bus into the mix (ducked under dialogue, muted with
  // everything else, not braked: the score is not the street's)
  let mbus = null;
  function musicBus() {
    if (!ctx) return null;
    if (!mbus || mbus.context !== ctx) { mbus = ctx.createGain(); mbus.connect(duck); }
    return mbus;
  }
  // ------------------------------------------------------------ the story's own sound (story.js)
  // A bus of its own, past the world's: the Stop brakes the street, and what the story says and does in a
  // stopped street has to be heard over it. The Sound switch still mutes it.
  let sbus = null, pad = null;
  function storyBus() {
    if (!ctx) return null;
    if (!sbus || sbus.context !== ctx) { sbus = ctx.createGain(); sbus.gain.value = muted ? 0 : 0.5; sbus.connect(ctx.destination); pad = null; }
    return sbus;
  }
  const sTone = (at, dur, type, f0, f1, vol, attack = 0.006) => { const b = storyBus(); if (b && !muted) tone(b, ctx.currentTime + LEAD + at, dur, type, f0, f1, vol * lv, attack); };
  function sNoise(at, dur, freq, q, vol, kind = 'bandpass') { burst(at, { dur, f: freq, q, vol, type: kind, att: Math.min(0.01, dur / 3) }); }
  // a burst of noise through a filter: the stuff of every mechanism here (a transient with att ~1 ms, a body with a
  // longer one); f1 sweeps the filter over its length
  function burst(at, { dur, f, f1 = 0, q = 1, vol, type = 'bandpass', att = 0.001 }) {
    const b = storyBus(); if (!b || muted) return;
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime + LEAD + at;
    // (silent, and at its frequency, from the moment it is made, not only from its start: a recording heard a single
    // sample's tick where a burst began a little after it was made, the goal's second breath; tools/sound_rec.js)
    g.gain.value = 0; fl.frequency.value = f;
    s.buffer = noise; fl.type = type; fl.frequency.setValueAtTime(f, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur); fl.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * lv, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(b); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.03); free(s, g);
  }
  // a short knock of a body: its resonance (a sine falling a little) and the click that excites it
  const knock = (at, f, vol, dur = 0.06) => { sTone(at, dur, 'sine', f, f * 0.8, vol, 0.0015); burst(at, { dur: dur * 0.5, f: f * 4, q: 1.2, vol: vol * 0.7 }); };
  const R = () => Math.random();
  // A voice for a line of dialogue: not words, the sound of someone saying them. v.pitch is the speaker's (Hz), v.breath
  // air in it (the old), v.past a second, fainter tick a moment after (someone speaking from another year)
  function voice(v = {}) {
    // (a pitched syllable for every few letters was tried and read as a toy: what is heard now is the felt tick of
    // type being set, a little higher for a higher voice, and a second fainter one after it for someone of another year)
    if (!storyBus() || muted) return;
    duckFor();
    // (13 dB up from where it was set by its level alone: recorded in the mix, a line's ticks were 3 to 11 dB under the
    // score round 2 kHz, which is to say not heard; now they stand 6 dB or more over it, tools/sound_rec.js)
    const f = 700 + (v.pitch || 180) * 5;
    sNoise(0, 0.022, f * (0.9 + R() * 0.2), 2.2, 0.12 + (v.breath ? 0.035 : 0));
    if (v.past) sNoise(0.09, 0.03, f, 2.2, 0.038);
  }
  // What the story does, heard (docs/SOUND.md). Each is built as a sound designer layers one: a transient (the click
  // or the strike, a millisecond or two of filtered noise), a body (the resonance of what was struck) and a tail (the
  // room, or the mechanism running down). Nothing is a bare oscillator beep, and no tone falls away on its own (that
  // was a telephone running out of battery: stopfx.js).
  // (each cue's trim, in dB, from tools/sound_render.js: its loudest 400 ms at the level docs/SOUND.md gives it)
  const TRIM = { shutter: 2, 'cam-up': 6.5, 'cam-down': 6, found: 3, goal: 14, stamp: 2, wrong: 2.5, end: -1, run: -3, key: 12 };
  let lv = 1, keyAt = 0;
  function sfx(name) {
    if (!storyBus() || muted) return;
    lv = Math.pow(10, (TRIM[name] || 0) / 20);
    try { cue(name); } finally { lv = 1; }
  }
  function cue(name) {
    switch (name) {
      // the Stop: the street brakes itself (hush: the tape). Over it, air drawn in that swells to the moment time
      // stops, the floor of the sound let go (a breath of low air, not a tone) and three notes of glass in a long
      // room, a fifth, a ninth, an octave: nothing resolves, it only opens
      case 'stop':
        burst(0, { dur: 1.05, f: 2500, f1: 7000, q: 0.6, vol: 0.05, att: 0.9 });
        burst(0.9, { dur: 0.9, f: 220, f1: 70, q: 0.7, vol: 0.16, type: 'lowpass', att: 0.04 });
        [1318.5, 1975.5, 2637].forEach((f, k) => glass(0.9 + k * 0.2, f, 0.034 - k * 0.006));
        break;
      // the air comes back with the tape, and the bells come down
      case 'run':
        burst(0, { dur: 0.75, f: 6000, f1: 1800, q: 0.6, vol: 0.06, att: 0.45 });
        [2637, 1975.5, 1318.5, 880].forEach((f, k) => glass(0.1 + k * 0.09, f, 0.04));
        break;
      // a breath of air: here is what to do (no chime). Two bands, the upper one later, as a breath is
      case 'goal': burst(0, { dur: 0.6, f: 1200, q: 0.7, vol: 0.035, att: 0.18 }); burst(0.08, { dur: 0.5, f: 5200, q: 0.8, vol: 0.016, att: 0.16 }); break;
      case 'word': break; // (a word in the frame is read, not rung)
      // a key of the machine the preface is typed on: the slug on the platen, a tick with a little body under it
      // (a typed line is a run of these: no two alike, as no two keys of a machine strike alike. The slug's ring and the
      // body under it vary by a few per cent and a few dB, one in five is struck harder, and two never come closer than
      // 45 ms: a run of identical ticks was a machine gun, not a typist)
      case 'key': {
        const now = ctx.currentTime; if (now - keyAt < 0.045) break; keyAt = now;
        const v = (R() < 0.2 ? 1.35 : 0.75 + R() * 0.35);
        duckFor(0.3); burst(0, { dur: 0.018 + R() * 0.008, f: 2800 + R() * 700, q: 1.2 + R() * 0.5, vol: 0.02 * v, att: 0.001 });
        burst(0.003 + R() * 0.003, { dur: 0.045 + R() * 0.015, f: 380 + R() * 90, q: 1.2, vol: 0.014 * v, type: 'lowpass', att: 0.002 });
        break;
      }
      // the camera brought up: the leather strap's creak (stick-slip: a few grains of a mid band, unevenly spaced),
      // the cloth's swish, then the body in the hand and the catch of the finder
      case 'cam-up': {
        let t = 0; for (let k = 0; k < 6; k++) { burst(t, { dur: 0.016, f: 750 + R() * 500, q: 2.5, vol: 0.05 + R() * 0.04 }); t += 0.012 + R() * 0.016; }
        burst(0.02, { dur: 0.17, f: 2400, q: 0.6, vol: 0.03, att: 0.06 });
        knock(0.15, 240, 0.13, 0.05); burst(0.17, { dur: 0.006, f: 4200, q: 3, vol: 0.06 }); // (the catch: 6 dB under what it was, which struck over a stopped street)
        break;
      }
      case 'cam-down': burst(0, { dur: 0.15, f: 2000, q: 0.6, vol: 0.03, att: 0.05 }); knock(0.1, 200, 0.1, 0.06); break;
      // it is in the frame: the Stop's glass crystallising. Grains of high glass, quick and sparse then settling, and
      // one clear note held under them
      case 'found': {
        const P = [1318.5, 1568, 1975.5, 2349.3, 2637, 3136];
        for (let k = 0; k < 12; k++) glass(0.42 * Math.pow(k / 11, 0.8), P[Math.floor(R() * P.length)] * (R() < 0.3 ? 2 : 1), 0.006 + 0.004 * R(), 0.25);
        glass(0.03, 1318.5, 0.022); burst(0, { dur: 0.6, f: 7000, q: 0.7, vol: 0.012, att: 0.2 });
        break;
      }
      // the film wound on with the lever: its throw (a rustle of metal), the ratchet's teeth over a gear's whirr, the
      // stop at the end of the frame, the lever's spring home
      case 'wind': {
        burst(0.2, { dur: 0.32, f: 1300, q: 1.6, vol: 0.022, att: 0.04 });
        let t = 0.22; for (let k = 0; k < 9; k++) { burst(t, { dur: 0.007, f: 2600 + R() * 900, q: 4, vol: 0.09 + R() * 0.04 }); t += 0.028 + R() * 0.008; }
        knock(t + 0.03, 150, 0.12, 0.05); burst(t + 0.03, { dur: 0.02, f: 2200, q: 2, vol: 0.08 });
        burst(t + 0.12, { dur: 0.012, f: 5200, q: 2, vol: 0.05 });
        break;
      }
      // a focal-plane shutter behind a mirror: the mirror slaps up (a knock of the body, its click), the first curtain
      // and the second a sixtieth of a second after (two dry ticks), the mirror down again with a ring of its spring
      case 'shutter':
        knock(0, 190, 0.32, 0.05); burst(0, { dur: 0.022, f: 2300, q: 0.9, vol: 0.35 }); burst(0.001, { dur: 0.05, f: 600, q: 0.7, vol: 0.12, type: 'lowpass' });
        burst(0.014, { dur: 0.007, f: 5200, q: 1.5, vol: 0.2 });
        burst(0.031, { dur: 0.01, f: 3800, q: 2, vol: 0.24 });
        knock(0.058, 160, 0.2, 0.05); burst(0.058, { dur: 0.026, f: 1900, q: 1, vol: 0.22 });
        sTone(0.06, 0.09, 'sine', 3730, 0, 0.012, 0.001); sTone(0.06, 0.06, 'sine', 5210, 0, 0.006, 0.001);
        break;
      // the postmark struck on paper on a counter: the paper's slap, the wood under it, the stamp's thump, its handle
      // rattling a moment after
      // (recorded through, it struck: 30 dB over a stopped street in 12 ms, as the score's note came in under it. The
      // thump is pressed now, not dropped: 6 ms in and lower, the slap 3 ms in; tools/sound_rec.js)
      case 'stamp':
        burst(0, { dur: 0.04, f: 1800, q: 0.5, vol: 0.15, type: 'lowpass', att: 0.003 });
        burst(0, { dur: 0.14, f: 240, q: 4, vol: 0.2 });
        sTone(0, 0.11, 'sine', 115, 60, 0.22, 0.006);
        burst(0.07, { dur: 0.012, f: 3000, q: 3, vol: 0.05 });
        break;
      // somebody of another year is here: two notes beating against each other a few times a second, a breath moving
      // through the vowels of someone about to speak, and very high glass far off
      case 'ghost':
        sTone(0, 2.4, 'sine', 440, 446, 0.032, 0.6); sTone(0, 2.4, 'sine', 659, 652, 0.022, 0.8);
        burst(0, { dur: 2.2, f: 600, f1: 1300, q: 3, vol: 0.016, att: 0.8 }); burst(0.2, { dur: 2, f: 3000, q: 0.5, vol: 0.008, att: 0.7 });
        glass(0.7, 2637, 0.007); glass(1.1, 3951, 0.004);
        break;
      case 'right': glass(0, 1318.5, 0.035); glass(0.07, 1975.5, 0.02); break;
      case 'wrong': knock(0, 170, 0.18, 0.12); break; // (a dull knock of wood: no buzzer)
      case 'rain': burst(0, { dur: 2.5, f: 4200, q: 0.4, vol: 0.05, type: 'highpass', att: 0.6 }); break;
      // the evening resolves: an open chord (A, E, C sharp, G sharp, B) as a slow pad of soft sines, and its notes in
      // glass laid one by one over it
      case 'end':
        for (const [k, f] of [110, 164.8, 277.2, 415.3, 493.9].entries()) { sTone(k * 0.3, 5 - k * 0.3, 'sine', f, 0, 0.05, 0.9); glass(k * 0.3, f * 4, 0.012); }
        break;
      default: break;
    }
  }
  // a long room for what is holy in it: a few seconds of noise dying away, made once, that the bells and the choir ring in
  let room = null;
  function hall() {
    const b = storyBus(); if (!b) return null;
    if (room && room.context === ctx) return room;
    // (on the audio thread: reverb(), above; normalised as the browser's own convolver did it)
    const ir = hallIR(), cv = reverb(ir, normScale(ir));
    room = cv.input;
    const g = ctx.createGain(); g.gain.value = 0.5; cv.output.connect(g); g.connect(b);
    return room;
  }
  // the hall's response: four seconds and a fifth of noise dying away
  function hallIR(c0 = ctx) {
    const len = Math.floor(c0.sampleRate * 4.2), ir = c0.createBuffer(2, len, c0.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c), rnd = seeded(31 + c * 104729); for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    return ir;
  }
  // a bell of glass: a note, and the partials over it that a struck bar has, each dying faster than the one below
  // (none over the ear's range); len shortens it (a grain of glass)
  function glass(at, f, vol, len = 1) {
    const r = hall(); if (!r || muted) return;
    const t = ctx.currentTime + LEAD + at, out = ctx.createGain(); out.gain.value = 1; out.connect(r); out.connect(storyBus());
    for (const [k, a, d] of [[1, 1, 3.2], [2.76, 0.42, 1.6], [5.4, 0.2, 0.8], [8.93, 0.08, 0.4]]) if (f * k < 16000) tone(out, t, d * len, 'sine', f * k, 0, vol * a * lv, 0.003);
    setTimeout(() => { try { out.disconnect(); } catch (e) { /* already gone */ } }, (at + 4) * 1000);
  }
  // time held: a choir far off, for as long as it is. Four voices on an open chord (a fifth, an octave, a ninth), each a
  // buzz through the two resonances of "ah" with a slow tremor in its pitch, in the long room; a thread of high glass
  // over them. It comes up over two seconds and goes when time runs.
  function held(on) {
    const b = storyBus(); if (!b) return;
    if (on && !pad && !muted) {
      const r = hall(), g = ctx.createGain(), nodes = [];
      for (const [i, f] of [110, 164.8, 220, 246.9, 329.6].entries()) {
        const o = ctx.createOscillator(), vib = ctx.createOscillator(), vg = ctx.createGain(), og = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = f; vib.frequency.value = 4.6 + i * 0.35; vg.gain.value = f * 0.004; vib.connect(vg); vg.connect(o.frequency);
        for (const [F, k] of [[820, 1], [1180, 0.6], [2700, 0.18]]) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = F; bp.Q.value = 9; const fg = ctx.createGain(); fg.gain.value = k; o.connect(bp); bp.connect(fg); fg.connect(og); }
        og.gain.value = [0.5, 0.42, 0.4, 0.26, 0.3][i]; og.connect(g); o.start(); vib.start(); nodes.push(o, vib);
      }
      const hi = ctx.createOscillator(), hg = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      hi.type = 'sine'; hi.frequency.value = 1318.5; hg.gain.value = 0.05; hi.connect(hg); hg.connect(g); lfo.frequency.value = 0.11; lg.gain.value = 0.03; lfo.connect(lg); lg.connect(hg.gain); hi.start(); lfo.start(); nodes.push(hi, lfo);
      g.gain.value = 0.0001; g.connect(r); g.connect(b); ramp(g.gain, 0.08, 2.4); // (under the tape's shimmer)
      pad = { g, os: nodes };
    } else if (!on && pad) {
      const q = pad; pad = null; ramp(q.g.gain, 0.0001, 0.9);
      // (stopped once it has fallen 60 dB: at 3.2 s it was still 31 dB down, and the cut was a click under the street)
      setTimeout(() => { try { q.os.forEach(o => o.stop()); q.g.disconnect(); } catch (e) { /* already gone */ } }, 6500);
    }
  }
  return { reverb, normScale, impulse, hallIR, health, RT_FRAMES, get verb() { return VERB; }, start, made, get pending() { return want && !ctx; }, get tape() { return deck ? 'deck' : tape ? 'worklet' : null; }, get ready() { return ready; }, place, get ctx() { return ctx; }, voice, sfx, held, musicBus, murmur, screens, piyo, kakko, walkCall, train, trainAt, clack, platformChime, doorChime, melody, get on() { return !!ctx; }, announce, rotor, engine, wind, rain, thunder, hush, cicadas, car, skid, beep, step, horn, honk, chime, bell, kan, thump, shutter, penguin, gull, setMuted, stop, get muted() { return muted; } };
})();
