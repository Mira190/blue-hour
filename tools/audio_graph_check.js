// The sound's graph does not grow (docs/SOUND.md, "Every sound on the audio thread"). A node left connected to the mix
// is visited by the audio thread in every block, silent or not, until the page lets go of it; WebKit's sound crackled
// once a page had left a couple of thousand there (WebKit bug 222098), and the screens' kick here left one a beat. This
// plays every one-shot the street and the story make (as a phone's page makes them: a touch screen, the deck and the
// hybrid reverb), many times over, waits for them to end, and counts the nodes still feeding the mix: the graph must be
// as small as it was before them, give or take the street's beds, which are made once and kept. It also fails on a
// one-shot that starts before the audio thread can take it up (scheduled at or before the context's time when made),
// and on the clocks telemetry reads (audio.js health) misreading an output clock made to step twice (two underruns, and
// where) or a context's clock stopped in the last half second before the page is hidden (a stall: it is the page left).
//   python3 -m http.server 8800 --directory web &
//   NODE_PATH=$(npm root -g) node tools/audio_graph_check.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }), p = await b.newPage(), port = process.env.PORT || 8800;
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  const init = () => {
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
    // every connection made and taken down, and every source's start against its context's time
    const E = window.__edges = new Map(), early = window.__early = [];
    const key = n => n.__id || (n.__id = Math.random().toString(36).slice(2));
    const cn = AudioNode.prototype.connect, dc = AudioNode.prototype.disconnect;
    AudioNode.prototype.connect = function (dst, ...a) { const r = cn.call(this, dst, ...a); if (dst instanceof AudioNode) { const s = E.get(key(this)) || { n: this, to: new Set() }; s.to.add(dst); E.set(key(this), s); } return r; };
    AudioNode.prototype.disconnect = function (dst, ...a) { const r = dc.call(this, dst, ...a); const s = E.get(key(this)); if (s) { if (dst instanceof AudioNode) s.to.delete(dst); else s.to.clear(); } return r; };
    const S = AudioScheduledSourceNode.prototype, st = S.start;
    S.start = function (when = 0, ...a) { if (when <= this.context.currentTime && !(this instanceof AudioBufferSourceNode && this.loop)) early.push(`${this.constructor.name} at ${when.toFixed(4)}, now ${this.context.currentTime.toFixed(4)}: ${new Error().stack.split('\n')[2].trim()}`); return st.call(this, when, ...a); };
  };
  await p.setContent(`<script>(${init})()</script><script src="http://localhost:${port}/game/audio.js"></script><script src="http://localhost:${port}/game/music.js"></script>`);
  await p.waitForFunction(() => window.OEAudio && window.OEMusic);
  const r = await p.evaluate(async () => {
    const A = window.OEAudio, wait = ms => new Promise(r => setTimeout(r, ms));
    A.start(); await A.ctx.resume(); await wait(300);
    // the nodes from which the destination can be reached: what the audio thread visits in a block
    const live = () => {
      const into = new Map();
      for (const s of window.__edges.values()) for (const d of s.to) { const l = into.get(d) || []; l.push(s.n); into.set(d, l); }
      const seen = new Set(), q = [A.ctx.destination];
      while (q.length) { const n = q.pop(); for (const u of into.get(n) || []) if (!seen.has(u)) { seen.add(u); q.push(u); } }
      return seen.size;
    };
    // the beds the street keeps and the story's hall (made once): made first, so that they are in the count before
    A.sfx('found'); A.murmur(0.5); A.screens(0.5); A.trainAt(0, { near: 20, above: 0, v: 12, a: 0, len: 20, pan: 0 }, 0.1); A.rain(0.3, true, false);
    await wait(6000);
    window.__early.length = 0;
    const before = live();
    const calls = {
      blip: () => A.beep(1), step: () => A.step(), thump: () => A.thump(), honk: () => A.honk(1, 1), kan: () => A.kan(1), bell: () => A.bell(), chime: () => A.chime(),
      piyo: () => A.walkCall('piyopiyo', 1, 0.4), kakko: () => A.walkCall('kakakko', 1, -0.4), clack: () => A.clack(1, 0.2, 14, 1, 1), announce: () => A.announce(1),
      platform: () => A.platformChime(1, 0.2), doors: () => A.doorChime(1, -0.2), melody: () => A.melody(1, 0, 0), thunder: () => A.thunder(800), far: () => A.far('siren', 400, 0.3), horn: () => A.far('horn', 350, -0.3), lift: () => A.liftChime(), blink: () => A.indicator(true), penguin: () => A.penguin(1), gull: () => A.gull(1),
      cues: () => { for (const k of ['shutter', 'stamp', 'right', 'wrong', 'found', 'goal', 'cam-up', 'cam-down', 'run', 'ghost']) A.sfx(k); },
    };
    const made = {};
    for (let round = 0; round < 6; round++) for (const [k, f] of Object.entries(calls)) { f(); made[k] = (made[k] || 0) + 1; await wait(30); }
    // the screens' song and the trains' wheels, for a while, as the street calls them each frame
    for (let i = 0; i < 120; i++) { A.screens(0.5); A.trainAt(0, { near: 20, above: 4, v: 12, a: 0, len: 20, pan: 0 }, 0.05); await wait(50); }
    const during = live();
    await wait(11000); // (the melody is eight seconds, the thunder's roll nine; a call's own level goes half a second after it)
    const after = live();
    // the clocks telemetry reads (audio.js health): an output clock that steps twice by 3 ms is two underruns, where they
    // were; a context's clock that stops for the last half second before the page is hidden is not a stall
    A.health();
    window.__game = { overture: () => ({ active: true, t: 18, shots: [{ id: 'above', t0: 16.5, dur: 6.5 }] }) };
    const real = A.ctx.getOutputTimestamp.bind(A.ctx), t0 = performance.now();
    A.ctx.getOutputTimestamp = () => { const o = real(), e = performance.now() - t0; return { contextTime: o.contextTime - (e > 2000 ? 0.006 : e > 1000 ? 0.003 : 0), performanceTime: o.performanceTime }; };
    await wait(3000);
    const xr = A.health();
    A.ctx.getOutputTimestamp = real;
    await wait(2500);
    const frozen = A.ctx.currentTime;
    Object.defineProperty(A.ctx, 'currentTime', { get: () => frozen, configurable: true });
    await wait(450);
    Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
    await wait(300);
    const left = A.health();
    delete document.hidden; delete A.ctx.currentTime;
    // a page put away is silent (its context suspended), and seen again sounds (resumed)
    const vis = h => { Object.defineProperty(document, 'hidden', { get: () => h, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); };
    await A.ctx.resume(); await wait(200);
    vis(true); await wait(400);
    const hidden = A.ctx.state;
    vis(false); await wait(800);
    const shown = A.ctx.state;
    delete document.hidden;
    return { before, during, after, made, early: window.__early.slice(0, 8), nearly: window.__early.length, xr, left, away: { hidden, shown } };
  });
  console.log(`nodes the audio thread visits: ${r.before} with the street's beds; ${r.during} while every one-shot sounds; ${r.after} once they have ended`);
  const fails = [], fail = m => fails.push(m);
  if (r.after > r.before + 2) fails.push(`${r.after - r.before} nodes still feed the mix after every one-shot has ended (one-shots made: ${JSON.stringify(r.made)})`);
  if (r.nearly) fails.push(`${r.nearly} sources started at or before the context's time when they were made: ${r.early.join(' | ')}`);
  console.log(`the output's clock stepped twice by 3 ms in the opening's shot above: ${JSON.stringify(r.xr)}`);
  // (at least: this machine's audio device is a timer, whose own output clock jitters by a few ms now and then)
  if (!(r.xr.snd_xrun >= 2) || !(r.xr.snd_gap >= 6) || !/^opening above \d+/.test(r.xr.snd_xat || '')) fail(`two steps of the output's clock read as ${r.xr.snd_xrun} underruns of ${r.xr.snd_gap} ms at "${r.xr.snd_xat}", not 2 of 6 ms at "opening above"`);
  console.log(`the context's clock stopped for the last half second before the page was hidden: ${JSON.stringify(r.left)}`);
  if (r.left.snd_stall || r.left.snd_late >= 25) fail(`a clock stopped as the page was left read as a stall: snd_late ${r.left.snd_late}, snd_stall ${r.left.snd_stall}`);
  console.log(`the page put away: its context ${r.away.hidden}; seen again: ${r.away.shown}`);
  if (r.away.hidden !== 'suspended' || r.away.shown !== 'running') fail(`a page put away should suspend its sound and resume it when seen: ${r.away.hidden}, then ${r.away.shown}`);
  for (const e of errors) fails.push(`page error: ${e}`);
  for (const f of fails) console.log('FAIL', f);
  console.log(fails.length ? `FAIL ${fails.length}` : 'PASS');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
