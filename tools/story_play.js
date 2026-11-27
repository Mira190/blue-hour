// Plays a story's episode from the title to its last card, frame by frame, as a player who knows the way would:
// to each of the living, through what they say and ask, to where the world stops, to the afterimage, to the
// standpoint, the photograph, and on. It walks by being put there (the way between places is not what it checks),
// takes a still at each beat, prints the state at each, and exits 1 if the last card is not reached or the page throws.
// Each print is saved as the roll keeps it, too (n-print-own.jpg): the double exposure itself.
//   python3 -m http.server 8800 --directory web &
//   node tools/story_play.js out_dir [WxH]          (GPU=metal on a Mac; under xvfb-run -a elsewhere)
// FROM=6: from the last frame only (FROM counts from 0 and UPTO from 1: FROM=4 UPTO=5 is the fifth frame only). LIMIT=seconds: how long the whole play may take.
// PLAYER=W or M: who is played (the title's Play as; the woman by default).
// SLIP=n (or a list, 3,5,6,7): at frame n the first question that can be lost is answered wrongly until the one asked sees
// through the player; the card must come up, say what it cost and fit the screen, the file must have the line against the
// player, and the talk must be taken up at the question (issue 93: nothing said before it said again, nobody moved; at
// frame 5 by the card's second button, the roll and the file first), then played rightly; the last card counts them. SPEND=n: frame n is spent from the wrong place (the
// release twice asks, issue 117: kept once, then spent); its print must be only tonight, and the story must go on without it. Every play sets two prints side by side.
// The log (log.js): every line the dialogue shows is written down here as it is shown, and after frame 3 the log is opened
// and must have the same lines in the same order; stills of it, and of the words at their largest with their backing.
// The summation (the last frame's questions with `proof`): each is answered with a name (one of the case's people) first, then
// a print or a pair; SLIP=7 answers the first wrongly three times: she must say it herself (never a card that takes the frame
// up again), and the last card must say so. The first question's roll and file are opened from inside it, once. Frame 5's liar is cross-examined: one of his
// statements, then the print that breaks it (SLIP=5). At the last card, how the case was worked must name a frame spent (SPEND=n).
// CHOOSE=3:0,4:0: at frame 3's question with no right answer (the one after the print) the first option, at frame 4's the
// first: the false solution said aloud (accused) and the lecturer named (named_akira); 4:2 is "I cannot tell yet". ACCUSE=1
// is 3:0. Everything the story says only to one who chose so must then be heard, filed or on the last card.
// TOUCH=1: the play by touch on a phone's page (390x844): answers, lines passed, the camera, the release, hints, the roll,
// the cards: each a tap where the thing is on the screen; one that cannot be tapped (off the screen, under another) fails.
// AFTER=1: with UPTO=n, the play goes on past frame n's print through what is said after it, to the next frame's start.
// SILENT=n: the first question at frame n that someone waits on (wait_s) is left to run out; silence must be its answer.
// BACKTO=n: from the last card, frame n is gone back into, and played to its print.
// LOGAT=n: the log is opened after frame n (3). LOGSECS=n: a still of it each second for n seconds more (log-1s ...), time held: nothing in it moves or is drawn twice.
// WORDS=n: the dialogue's words at size n (2: the largest) from the start. LOGRELOAD=1: then the page is opened again, the case continued, and the log must still have them.
// DRAW=n: one frame in n is drawn, and the others run the game without their draw calls (0, a GPU's default: every one).
// The game moves a twentieth of a second a frame at most, so on a software renderer, at a frame a second or less, the
// story's own clock ran twenty times slow, and the runner's 50 minutes ended in the first frame's first dialogue (#1).
// A frame without its draws takes a few tens of ms: the story keeps its time, and every still is of drawn frames.
// Where a frame's time goes (#51): PROFILE=still:seconds profiles the page's script after that still (the top functions to
// the log); with TRACE=1, a trace of the browser's processes instead (trace.json); GLCOUNT=1 counts the WebGL calls made
// in frames not drawn and outside the frames; GPUCOST=still times a frame drawn whole after that still (#70); SHOTCOST=still each part of taking a still after it (#78). ONE=0: a still of the
// second of two frames drawn whole, as before #78 (ONETEST=still: stills of two and of one from the same held state, for tools/still_diff.py). TASKS=0: every frame waits for the display, as it did before; HOLD=0: the
// frames run on, drawn whole, while a still is taken.
// Bodies (issue 65): every frame of the play, the game notes each of the crowd drawn (near or far copy) within 0.45 m of one
// of the story's people, the player or the guide (game.js bodiesCheck); any one fails the play. One within that of a map's
// NPC is printed, not failed; and so is each time the game's last guard (game.js bodiesGuard) had to move one of the crowd
// out of someone and leave it undrawn for a frame, where its steering had not kept it clear.
// Clipping (issue 126): every frame, tools/clip_probe.js measures the player, the story's people, the guide and the map's
// NPCs against each other, their limbs against their own bodies and their neighbours', their feet against the floor and
// their bodies against walls, posts and cars; every case is printed with its frame, beat, place and depth, and one body in
// another or a foot off its floor fails the play (CLIP_OUT=file: the cases as JSON). After each talk, and in each Stop, the
// player is walked straight into everyone within 14 m (a still of each, into-*.png) and must stop at their shoulder.
// Ceiling (issue 208): every frame on foot in the station's free passage on frame 4's way to SKY's lift, the lens must be
// under its ceiling (tools/ceiling_watch.js); a frame with it through fails the play.
const { chromium } = require('playwright');
const { logger: browserLog, watch: watchPage, expectReload } = require('./browser_watch'); // (what the browser says of its GPU, in the log: issue 49)
const fs = require('fs');
const { audit: escalators } = require('./escalator_route');
const clipProbe = require('./clip_probe');
const ceilWatch = require('./ceiling_watch'); // (the lens under the passage's ceiling on frame 4's way to SKY's lift: issue 208)
const { measure: umbrellaHeld } = require('./umbrella_held'); // (frame 7's rain: every umbrella held, issue 165)
const pacing = require('./pacing_watch');
const { dump: uiDump } = require('./ui_dump'); // (UI_DUMP=dir: the interface at each still, for tools/ui_fit.js)
const [,, out = '/tmp/story-play', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox', '--disable-gpu-watchdog'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-watchdog'];
  // (no GPU watchdog on a software renderer: a frame of llvmpipe's packing a medium page's pictures as BC7 took 10 to 18 s,
  // and Chromium's watchdog took the GPU process for hung and ended it, exit 512 (its code 2, hung), budgetm2 on a runner,
  // 24 November. A laptop's GPU takes the pictures packed; the context loss was the software renderer's, not the page's.
  // A real GPU, GPU=metal, keeps its watchdog)
  // (ENGINE=webkit: Playwright's WebKit, which takes none of Chromium's switches; HEADED=1 for its window)
  const b = process.env.ENGINE === 'safari' ? await require('./safari').launch() : process.env.ENGINE === 'webkit' ? await require('playwright').webkit.launch({ headless: !process.env.HEADED }) : await chromium.launch({ headless: !process.env.DISPLAY, args, logger: browserLog() });
  // (DPR=3 PHONE=1: the page as an iPhone has it, three device pixels to the point and its user agent, as tools/mem_check.js opens it)
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +process.env.DPR || 1, hasTouch: w < 500, isMobile: w < 500,
    ...(process.env.PHONE ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' } : {}) });
  watchPage(p);
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300), (e.stack || '').split('\n').slice(1, 3).join(' | ').slice(0, 300)); });
  p.on('response', r => { if (r.status() >= 400) console.log('http', r.status(), r.url()); });
  if (process.env.BIGUP) p.on('console', m => { const t = m.text(); if (t.startsWith('bigup:') || /^hero \w+: /.test(t)) console.log(t.slice(0, 600)); }); // (and each hero level made ready, with its steps' times: hero.js)
  fs.mkdirSync(out, { recursive: true });
  // FPS=1: the page's frames a second beat by beat (issues 8 and 206), counted in the page from its animation frames
  // and named as the telemetry names a beat ("frame 3: stop seek"): for each, the frames, the median and the 95th
  // percentile of the gap between them, and the seconds spent there. Read every half minute and printed when the
  // play ends, however it ends. The harness's own stills fall inside the beats they are taken in.
  // GOV=free: the governor runs as a player's does inside the tier (under automation it stands still, quality.js).
  // In another engine than Chromium a phone's page is told it has a touch screen (tools/engine.js phone).
  if (process.env.FPS) {
    await p.addInitScript(() => {
      const F = window.__fps = {}; let last = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = fn => raf(t => {
        if (t !== last) {
          const g = window.__game, S = g && g.story && g.story.state, T = document.getElementById('g-title');
          const spot = !g ? 'load' : T && !T.hidden ? 'title' : !S ? 'street' : S.phase === 'done' ? 'the last card' : `frame ${S.fi + 1}: ${S.phase}${S.beat ? ` ${S.beat}` : ''}`;
          if (last && t - last < 5000) { const b = F[spot] || (F[spot] = { n: 0, ms: 0, bins: new Array(251).fill(0), first: Math.round(t) }); b.n++; b.ms += t - last; b.bins[Math.min(250, Math.floor((t - last) / 4))]++; }
          last = t;
        }
        fn(t);
      });
    });
    let seen = null;
    const read = () => p.evaluate(() => window.__fps).then(f => { if (f) seen = f; }, () => {});
    const every = setInterval(read, 30000); every.unref();
    const at = (b, q) => { let c = 0; for (let i = 0; i < b.bins.length; i++) { c += b.bins[i]; if (c >= b.n * q) return i * 4 + 2; } return 1000; };
    process.on('exit', () => {
      if (!seen) return;
      console.log('fps by beat (frames a second by the median gap | median gap, 95th, ms | frames | seconds):');
      for (const [k, b] of Object.entries(seen).sort((x, y) => x[1].first - y[1].first)) if (b.n >= 5) console.log(`fps: ${k} | ${(1000 / at(b, 0.5)).toFixed(0)} | ${at(b, 0.5)}, ${at(b, 0.95)} | ${b.n} | ${(b.ms / 1000).toFixed(1)}`);
    });
    p.fpsRead = read;
  }
  if (process.env.GOV === 'free') await p.addInitScript(() => { const id = setInterval(() => { const g = window.__game && window.__game.governor; if (g) { g.auto = true; clearInterval(id); } }, 200); });
  if (process.env.PHONE && process.env.ENGINE && process.env.ENGINE !== 'chromium') await require('./engine').phone(p);
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  const lost = await require('./gl_lost').watch(p); // (a lost WebGL context said in the failure after it)
  // (a phone's music: every element made and every score rendered in the page, read at the flight: a phone plays its
  // scores from files and renders none, issue 166)
  if (process.env.PHONE) await p.addInitScript(() => { const M = window.__music = { els: [], offline: 0 }, Au = window.Audio, O = window.OfflineAudioContext;
    window.Audio = function (...a) { const e = new Au(...a); M.els.push(e); return e; }; window.Audio.prototype = Au.prototype;
    if (O) window.OfflineAudioContext = window.webkitOfflineAudioContext = function (...a) { M.offline++; return new O(...a); }; });
  await p.addInitScript(() => { window.__bodies = []; window.__guarded = []; window.__trunks = []; });
  // (whoever of the crowd jumps or leaves the street in view while the finder is up, not under the shutter's flash: a raise
  // in a living street had a waiter moved out of the view's way in one step and a walker put off the street, #232. Each
  // frame, the crowd within 20 m and in the frame: drawn more than 0.6 m from where it was drawn the frame before, or gone)
  await p.addInitScript(() => {
    const pops = window.__pops = [], was = new Map(); let v = null;
    const tick = () => {
      requestAnimationFrame(tick);
      const g = window.__game, T = window.THREE;
      if (!g || !T || !g.crowd || !g.story || !g.camera) return;
      const fd = !!g.story.finder, flash = !!document.querySelector('.game-stage.flash, #g-story-flash.on'), c = g.camera, C = g.crowd;
      if (!fd) { was.clear(); return; }
      v = v || new T.Vector3();
      const now = new Map();
      for (let i = 0; i < C.active; i++) {
        const q = C.P[i], x = q.rx ?? q.x, y = q.ry ?? q.y;
        if (q.line < 0 && !q.pz) { const o = was.get(i); if (o && o.seen && !flash) pops.push({ i, gone: true, m: +o.d.toFixed(1), fi: g.story.state.fi, phase: g.story.state.phase }); continue; }
        v.set(x, (q.z || 0) + 1, -y); const d = v.distanceTo(c.position); if (d > 20) continue;
        v.project(c); const seen = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1.1;
        const o = was.get(i);
        if (o && (seen || o.seen) && !flash) { const m = Math.hypot(x - o.x, y - o.y); if (m > 0.6) pops.push({ i, m: +m.toFixed(2), at: +d.toFixed(1), fi: g.story.state.fi, phase: g.story.state.phase }); }
        now.set(i, { x, y, d, seen });
      }
      was.clear(); for (const [k, e] of now) was.set(k, e);
    };
    requestAnimationFrame(tick);
  }); // (game.js trunksCheck: a trunk filling the chase view, #233; bodiesCheck and bodiesGuard: the crowd inside someone not of it, issue 65)
  await pacing.install(p); // (nobody of the crowd walks to and fro: tools/pacing_watch.js, issue 168)
  await ceilWatch.install(p);
  await clipProbe.install(p); // (every body against every other, its own limbs, the floor and the things of the place: tools/clip_probe.js, issue 126)
  await require('./cam_intrude').install(p); // (the camera's window in nobody's body, every frame, from every camera: issue 226)
  // LINKLAG=ms: a GPU that links a program in ms, one after another, as a real one does behind KHR_parallel_shader_compile
  // (a software renderer links as it is asked, so no draw here meets a program still linking). A program reads as not
  // complete until its turn in the queue is over; three.js's own wait for a link (LINK_STATUS) is not held. Each still
  // then prints what the page's gate (world.js gate) has left out of frames so far.
  const LINKLAG = +(process.env.LINKLAG || 0);
  if (LINKLAG) await p.addInitScript(lag => {
    const P = WebGL2RenderingContext.prototype, link = P.linkProgram, get = P.getProgramParameter, due = new WeakMap();
    let last = 0;
    P.linkProgram = function (prog) { const t = Math.max(performance.now(), last) + lag; last = t; due.set(prog, t); return link.call(this, prog); };
    P.getProgramParameter = function (prog, what) { if (what === 0x91B1 && due.has(prog) && performance.now() < due.get(prog)) return false; return get.call(this, prog, what); };
  }, LINKLAG);
  const DRAW = +(process.env.DRAW || 0);
  // A cube taken of the scene (a level's reflection probe, hero.js probe) is drawn whatever the frame it falls in: it is
  // taken once and kept for the beat, and in a frame not drawn its six draws were left out with the rest, so every play
  // here mirrored an empty cube in the roof's glass and no check saw what a GPU draws there (issue 203).
  if (DRAW > 1) await p.addInitScript(() => {
    window.addEventListener('three-ready', () => {
      const C = window.THREE && window.THREE.CubeCamera, up = C && C.prototype.update;
      if (!up) return;
      C.prototype.update = function (...a) { const D = window.__draw, was = D && [D.on, D.dry]; if (D) { D.on = true; D.dry = false; } try { return up.apply(this, a); } finally { if (D) [D.on, D.dry] = was; } };
    }, { once: true });
  });
  if (DRAW > 1) await p.addInitScript(([n, tasks, glcount]) => {
    const P = WebGL2RenderingContext.prototype, raf = window.requestAnimationFrame.bind(window), D = window.__draw = { all: false, on: true, frames: 0, drawn: 0, skipped: 0, steps: 0, js: 0, rendered: false, own: 0 };
    // The page's frames are taken over here, as the display gives them: every callback asked for in one frame is called in
    // the next, together, with one time (the harness's own counts of frames, and the raise's samples, are of the game's
    // frames). One frame in n is drawn, and every one while a still is taken; outside a frame (the loader's slices, the
    // prints) everything is drawn as it is.
    // A frame that will not be drawn does not wait for the display either (#51): it runs as a task of its own as soon as
    // the one before it is done (a tenth off the first frame's time on a session's machine). The frames still run on the
    // page's clock (performance.now), a twentieth of a second at most; a frame to be drawn, and every frame while a still
    // is taken, waits for the display as before. TASKS=0: every frame on the display's clock, as it was.
    const mc = new MessageChannel(); let queue = new Map(), id = 0, due = false, last = 0;
    const flush = t => {
      due = false; if (D.hold) return; // (held while a still is taken: below)
      const q = queue; queue = new Map();
      last = Math.max(last, t || performance.now()); // (one clock, never back: a display's frame is stamped as it began)
      D.twice = D.all && D.one; if (D.twice) oneFrame();
      // (and where the still's frame is counted, BUDGET, the count begins and ends here, round this frame's own calls and
      // no other's. It was begun by the harness before it asked for the frame and ended after it heard of it: a frame the
      // play drew of itself in between, one in DRAW, was counted with the still's, twice the passes and the triangles
      // under one still's name, in about one still in twenty: issue 151)
      const B = D.twice && D.count ? window.__beat : null; if (B) B.begin();
      D.frames++; D.on = D.all || D.steps % n === 0; // (n counts the game's frames: not those the frame-rate cap passes over, game.js gov.due)
      const t0 = performance.now(); D.rendered = false; D.inFrame = true;
      for (const fn of q.values()) { try { fn(last); } catch (e) { setTimeout(() => { throw e; }); } }
      const counted = B ? B.end() : null; if (counted && D.rendered) D.counted = counted;
      D.js += performance.now() - t0; if (D.rendered) { D.steps++; if (D.on) { D.drawn++; if (!D.all) D.own++; } split(t0, performance.now() - t0); }
      if (D.rendered && D.hit && D.hit.plate) { const L = document.getElementById('g-loader'); if (!L || L.hidden) D.hit.plate = false; } // (the loader's frames under its plate are not the player's: from the first after it)
      if (D.rendered && D.hit && D.hit.plate) { D.hit.links = 0; D.hit.up = 0; D.hit.names = []; } else if (D.rendered && D.hit) { const H = D.hit; const ms = +(performance.now() - t0).toFixed(1); H.fr.push([ms, D.all ? 2 : D.on ? 1 : 0, H.links, +(H.up / 1048576).toFixed(2)].concat(ms > 100 && H.names.length ? [H.names] : [])); H.links = 0; H.up = 0; H.names = []; } // (HITCH: the frame's own cost, below)
      // (the still's frame drawn, below: the page's frames held at once, so that the still is of it and no frame drawn whole
      // after it is begun while the harness hears of it, a second of llvmpipe's that the screenshot then waited for)
      if (D.twice && D.rendered) { D.one = false; if (D.oneHold) { D.hold = true; D.splitHeld(); } const w = D.oneDone; D.oneDone = null; if (w) w(); }
      D.on = true; D.inFrame = false; D.twice = false;
    };
    // (where the wall's time went, #70: from the start of one of the game's frames to the next, by the kind of the first:
    // drawn or not, and those drawn whole for a still or that its hold fell in; and how far the game's clock moved in it, a twentieth of a second at most)
    const S = D.split = { on: { n: 0, js: 0, wall: 0, game: 0 }, off: { n: 0, js: 0, wall: 0, game: 0 }, still: { n: 0, js: 0, wall: 0, game: 0 } }; let prev = null;
    const split = (t0, js) => {
      if (prev) { const k = prev.held || prev.all ? S.still : prev.on ? S.on : S.off; k.n++; k.js += prev.js; k.wall += t0 - prev.t0; k.game += Math.min(0.05, Math.max(0, last - prev.last) / 1000); }
      prev = { t0, js, on: D.on, all: D.all, last, held: false };
    };
    D.splitHeld = () => { if (prev) prev.held = true; };
    mc.port1.onmessage = () => flush(performance.now()); D.raf = raf;
    window.requestAnimationFrame = fn => {
      queue.set(++id, fn);
      if (!due) { due = true; if (!tasks || D.all || D.steps % n === 0) raf(flush); else mc.port2.postMessage(0); }
      return id;
    };
    window.cancelAnimationFrame = k => { queue.delete(k); };
    // A still is taken of the frame drawn last, with the page's frames held until it is: on a software renderer a
    // screenshot takes seconds, and the frames drawn whole meanwhile (six a still, a second of llvmpipe's each) were two
    // thirds of all the frames drawn in a play (#51). The game's clock moves a twentieth of a second at most across it.
    D.holdOn = () => { D.hold = true; D.splitHeld(); };
    D.holdOff = () => { D.hold = false; if (queue.size && !due) { due = true; raf(flush); } };
    if (glcount) { D.glIn = {}; D.glOut = {}; for (const k of Object.getOwnPropertyNames(P)) { const d = Object.getOwnPropertyDescriptor(P, k); if (typeof d.value !== 'function' || k === 'constructor') continue; const f = d.value; P[k] = function (...a) { const w = !D.on ? D.glIn : D.inFrame ? null : D.glOut; if (w) w[k] = (w[k] || 0) + 1; return f.apply(this, a); }; } }
    // (a clear is drawing too: a frame not drawn cleared its targets a dozen times, each a pass of llvmpipe's)
    for (const k of ['blitFramebuffer', 'clear', 'clearBufferfv', 'clearBufferiv', 'clearBufferuiv', 'clearBufferfi']) { const f = P[k]; P[k] = function (...a) { if (D.on && !D.dry) return f.apply(this, a); }; }
    for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) { const f = P[k]; P[k] = function (...a) { if (D.on && !D.dry) return f.apply(this, a); }; }
    // A still of one frame drawn whole (#78). It was of the second of two, for what the first leaves the second in targets
    // of its own: the ambient occlusion's history (ao.js: the first frame's occlusion, reprojected, is nine tenths of the
    // second's), and the street mirror's picture (mirror.js: drawn every other frame, so one of the two drew it). The
    // shadows' cache and the rain's cover map are drawn in whichever frame finds them stale, the first drawn as well as
    // the second. So in the one frame the occlusion is worked out twice, as the first frame would and then as the second,
    // from the history the first leaves (the camera has not moved between the two: the history lands where it was taken),
    // and the mirror is drawn, by asking for it as after a frame without it. llvmpipe draws a frame whole in 1.1 to 1.6 s,
    // nearly all of it the scene's vertices and the shadows' (tools/gpu_cost.js): one a still, not two. ONE=0: two, as before.
    D.one = false; D.twice = false; D.oneDone = null; D.ones = 0;
    const oneFrame = () => {
      const g = window.__game, ao = g && g.atmos && g.atmos.ao, m = g && g.mirror;
      if (ao && !ao.__twice) { const f = ao.compute; ao.__twice = true; ao.compute = function (...a) { if (D.twice && !D.twiceDone) { D.twiceDone = true; D.ones++; const B = window.__beat, on = B && B.on; if (on) B.on = false; f.apply(this, a); if (on) B.on = true; } return f.apply(this, a); }; } // (the first working-out is this harness's, not the frame's: not counted, tools/beat_count.js)
      D.twiceDone = false;
      if (m && m.uniforms && m.uniforms.uMirrorOn) m.uniforms.uMirrorOn.value = 0; // (mirror.js keeps its last picture only while it is on)
    };
    // (and a frame not drawn does not ask WebGL for its error, #70: the asking waits for the GPU to finish all it was given,
    // the frame drawn last on llvmpipe, and was a sixth of a frame's script in frame 2. An error stays in the context until
    // asked, so the game's glCheck still finds it, in the next ask made in a frame drawn)
    { const f = P.getError; P.getError = function () { return D.on ? f.call(this) : 0; }; }
    D.gls = []; { const gc = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { const c = gc.call(this, t, ...a); if (t === 'webgl2' && c && !D.gls.includes(c)) D.gls.push(c); return c; }; } // (the page's WebGL contexts, for GPUCOST)
    // and on a frame not drawn, renderer.render itself is not run either (#51): without its draw calls it still cost a
    // frame a third of its time, culling, sorting and setting the state of some sixteen passes. What it does that the
    // game reads goes on: the world's matrices are brought up to date, and every onBeforeRender of a thing the camera's
    // layers see is called as the render would have called it (past.js forms and fades a relic there, on its own clock;
    // the cars' lamps turn their glows). A render called from one of those (a mirror's) is skipped whole.
    addEventListener('three-ready', () => {
      const T = window.THREE, W = T.WebGLRenderer, plain = T.Object3D.prototype.onBeforeRender;
      let inside = false;
      const replay = (r, scene, camera) => {
        inside = true;
        try {
          scene.traverseVisible(o => {
            if (o.onBeforeRender === plain || !o.onBeforeRender || !camera.layers.test(o.layers)) return;
            const m = Array.isArray(o.material) ? o.material[0] : o.material;
            o.onBeforeRender(r, scene, camera, o.geometry, m, null);
          });
        } finally { inside = false; }
      };
      T.WebGLRenderer = class extends W {
        constructor(...a) {
          super(...a);
          const render = this.render;
          this.render = (scene, camera) => {
            D.rendered = true;
            if (D.on || !scene || !camera) return render.call(this, scene, camera);
            D.skipped++;
            if (scene.matrixWorldAutoUpdate !== false) scene.updateMatrixWorld();
            if (camera.parent === null && camera.matrixWorldAutoUpdate !== false) camera.updateMatrixWorld();
            if (!inside) replay(this, scene, camera);
          };
        }
      };
    }, { once: true });
  }, [DRAW, process.env.TASKS !== '0', !!process.env.GLCOUNT]);
  if (process.env.GLCALLS) await require('./gl_calls').installBeats(p); // (GLCALLS=1: the WebGL calls a frame by beat, of them the lights' and the uploads, issue 191: tools/gl_calls.js)
  if (process.env.STOPCOST) await require('./stop_cost').install(p); // (STOPCOST=1: each beat's frames, the guide's planning and the programs linked in it, issue 206: tools/stop_cost.js)
  // BUDGET=file: what each still's frame asks of the GPU and what WebGL holds at it, a line of JSON a still (tools/beat_count.js,
  // tools/gl_mem.js), for tools/beat_budget.py: the story's beats against their budgets (docs/PERFORMANCE.md, "A budget for every beat")
  const BUDGET = process.env.BUDGET || '';
  if (BUDGET && +process.env.BUDGET_TOP) await p.addInitScript(require('./gl_mem').own);
  if (BUDGET) { await p.addInitScript(require('./gl_mem').hook); await p.addInitScript(require('./beat_count').hook); fs.writeFileSync(BUDGET, ''); }
  if (BUDGET && process.env.BUDGET_GROUPS) await p.addInitScript(n => { window.__beat.top = n; }, +process.env.BUDGET_GROUPS); // (BUDGET_GROUPS=n: with BUDGET_BY, the n heaviest things drawn, not forty)
  // HITCH=file (with BUDGET and DRAW=n): each of the game's frames by its own cost, the time its callbacks took on the page,
  // not the wall's, which a software renderer stretches; and what may have made a long one long, the programs linked and
  // the megabytes sent to the GPU in it (and, in a frame over 100 ms, the programs it linked, by name). A line a still, of the frames since the one before (tools/beat_hitch.py; issue
  // 220: hitches recorded per beat on a phone's tier, to be held as the budgets are once there is a week of them). Counted
  // from the first frame after the loader's plate: its warm-up under the plate (74 programs, 113 MB) is the loader's, which
  // the plate hides as it animates on the compositor; booked to the title, it read as a second-long first frame
  const HITCH = BUDGET && DRAW > 1 ? process.env.HITCH || '' : '';
  if (HITCH) {
    fs.writeFileSync(HITCH, '');
    await p.addInitScript(() => {
      const D = window.__draw; if (!D) return;
      const H = D.hit = { fr: [], links: 0, up: 0, names: [], plate: true }, P = WebGL2RenderingContext.prototype, link = P.linkProgram;
      // (and the programs a frame linked, by three.js's name for each with the defines that make its variant, so that a long frame
      // that linked says what: tools/beat_hitch.py prints them for the beat's longest frame)
      const src = new WeakMap(), named = new WeakMap(), ss = P.shaderSource, as = P.attachShader;
      P.shaderSource = function (sh, t) { src.set(sh, t); return ss.call(this, sh, t); };
      P.attachShader = function (pr, sh) { const t = src.get(sh) || ''; if (/gl_Position/.test(t)) { const m = /#define SHADER_NAME (.+)/.exec(t), ty = /#define SHADER_TYPE (\w+)/.exec(t), d = [...t.matchAll(/#define (USE_\w+|DOUBLE_SIDED|FLIP_SIDED|DEPTH_PACKING)\b/g)].map(x => x[1].replace(/^USE_/, '').toLowerCase()).filter(x => !['fog', 'shadowmap', 'reversed_depth_buffer'].includes(x)); named.set(pr, `${m ? m[1] : ty ? ty[1] : 'raw'}(${d.join(' ')})`); } return as.call(this, pr, sh); };
      P.linkProgram = function (...a) { H.links++; if (H.names.length < 12) H.names.push(named.get(a[0]) || '?'); return link.apply(this, a); };
      const size = a => { for (const v of a) { if (v && typeof v === 'object') { if (v.byteLength !== undefined) return v.byteLength; if (v.width) return v.width * v.height * 4; } } return 0; };
      for (const k of ['bufferData', 'bufferSubData', 'texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D', 'compressedTexSubImage2D']) {
        const f = P[k]; if (f) P[k] = function (...a) { H.up += size(a); return f.apply(this, a); };
      }
    });
  }
  // BIGUP=mb: every texture upload of mb MB or more (8 if 1) said as it happens, with its size, its format, the story's beat
  // and the page's code that asked for it: what a phone's GPU is handed inside a beat (the Stop's 5 s hold, issue 118)
  if (process.env.BIGUP) await p.addInitScript(mb => {
    const P = WebGL2RenderingContext.prototype, min = mb * 1048576, FMT = { 0x1903: 'R8', 0x8229: 'R8', 0x1908: 'RGBA', 0x8058: 'RGBA8', 0x881A: 'RGBA16F', 0x8C43: 'SRGB8_A8', 0x1907: 'RGB', 0x822B: 'RG8', 0x8227: 'RG' };
    const beat = () => { try { const s = window.__game && window.__game.story && window.__game.story.state; return s ? `frame ${s.fi + 1} ${s.phase}/${s.beat}` : 'title'; } catch (e) { return '?'; } };
    const where = () => (new Error().stack || '').split('\n').slice(2).filter(l => !/three\.module|vendor/.test(l)).slice(0, 4).map(l => l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+\//, '')).join(' < ');
    const bpp = f => (/^R8$/.test(FMT[f]) ? 1 : /RG8|RG$/.test(FMT[f]) ? 2 : /16F/.test(FMT[f]) ? 8 : 4);
    const ti = P.texImage2D; P.texImage2D = function (...a) { if (a.length >= 8 || (a.length === 6 && a[5] && a[5].width)) { const w = a.length >= 8 ? a[3] : a[5].width, h = a.length >= 8 ? a[4] : a[5].height, f = a[2]; if (w * h * bpp(f) >= min) console.log(`bigup: ${w}x${h} ${FMT[f] || f}, ${(w * h * bpp(f) / 1048576).toFixed(1)} MB, at ${beat()}: ${where()}`); } return ti.apply(this, a); };
    const ts = P.texStorage2D; P.texStorage2D = function (t, l, f, w, h) { if (w * h * bpp(f) >= min) console.log(`bigup: ${w}x${h} storage ${FMT[f] || f} x${l} levels, ${(w * h * bpp(f) / 1048576).toFixed(1)} MB, at ${beat()}: ${where()}`); return ts.apply(this, arguments); };
    const tsi = P.texSubImage2D; P.texSubImage2D = function (...a) { const img = a.find(v => v && v.width && v.height && !v.byteLength), w = img ? img.width : a[4], h = img ? img.height : a[5]; if (w * h >= min) console.log(`bigup: sub ${w}x${h}, at ${beat()}: ${where()}`); return tsi.apply(this, a); };
    // (and every program linked, by three.js's name and its variant's defines, with the beat: what a phone compiles inside a beat)
    { const src = new WeakMap(), nm = new WeakMap(), ss = P.shaderSource, as = P.attachShader, lk = P.linkProgram;
      P.shaderSource = function (sh, t) { src.set(sh, t); return ss.call(this, sh, t); };
      P.attachShader = function (pr, sh) { const t = src.get(sh) || ''; if (/gl_Position/.test(t)) { const m = /#define SHADER_NAME (.+)/.exec(t), d = [...t.matchAll(/#define (USE_\w+|DOUBLE_SIDED|FLIP_SIDED|DEPTH_PACKING \d+)/g)].map(x => x[1].replace(/^USE_/, '').toLowerCase()); nm.set(pr, `${m ? m[1].trim() : '?'}(${d.join(' ')})`); } return as.call(this, pr, sh); };
      P.linkProgram = function (pr) { const n = nm.get(pr) || '?', at = beat(), r = lk.call(this, pr); Promise.resolve().then(() => { let x = ''; try { const L = window.__game.renderer.info.programs, q = L[L.length - 1]; x = q ? ` [${q.name || ''} ${String(q.cacheKey).split(',').slice(0, 3).join(',').slice(0, 120)}]` : '';
            // (and how it differs from the nearest program already made of the same shader: which parameter made it new)
            if (q && at !== 'title') { const R = window.__game.renderer, own = []; window.__game.world.traverse(o => { for (const m of [].concat(o.material || [])) { const pp = R.properties.get(m); if (pp && pp.programs && [...pp.programs.values()].includes(q) && own.length < 2) { const path = []; for (let u = o; u && path.length < 3; u = u.parent) path.push(u.name || u.type); own.push(`${m.type}:${m.name || ''} on ${path.join('<')}`); } } }); if (own.length) x += ` {${own.join('; ')}}`; if (n.startsWith('?')) try { x += ` uniforms ${q.getUniforms().seq.map(u => u.id).filter(u => /^u[A-Z]|^t[A-Z]/.test(u)).slice(0, 8).join(' ')}`; } catch (e) { /* none */ } }
            if (q && at !== 'title') { const k = String(q.cacheKey).split(','); let best = null, bd = 1e9; for (const o of L) { if (o === q) continue; const ko = String(o.cacheKey).split(','); if (ko[0] !== k[0] || ko.length !== k.length) continue; const d = k.reduce((n, v, i) => n + (v !== ko[i]), 0); if (d < bd) { bd = d; best = ko; } } if (best) x += ` differs from one made at ${bd} of ${k.length}: ${k.map((v, i) => (v !== best[i] ? `#${i} ${best[i]}->${v}` : '')).filter(Boolean).slice(0, 6).join(' ')}`; } } catch (e) { /* none */ } console.log(`bigup: link ${n}${x}, at ${at}`); }); return r; }; }
    // (and the code that made it: a texture sent by a draw is three.js's upload, named by whoever set its needsUpdate)
    const made = () => { const T = window.THREE; if (!T || !T.Texture) return; const d = Object.getOwnPropertyDescriptor(T.Texture.prototype, 'needsUpdate'); if (!d || !d.set) return;
      Object.defineProperty(T.Texture.prototype, 'needsUpdate', { configurable: true, get: d.get, set(v) { const im = this.image; if (v && im && im.width * im.height >= min && !this.__bigSaid) { this.__bigSaid = 1; console.log(`bigup: made ${im.width}x${im.height} ${this.format === T.RedFormat ? 'R8' : this.format}, at ${beat()}: ${where()}`); } d.set.call(this, v); } }); };
    if (window.THREE) made(); else window.addEventListener('three-ready', made, { once: true });
  }, +process.env.BIGUP === 1 ? 8 : +process.env.BIGUP);
  // FROM=n: as a case left at frame n (counted from 0) and opened again
  if (process.env.FROM) await p.addInitScript(n => { try { localStorage.setItem('bh-story-late', JSON.stringify({ fi: n, left: 7 - n, prints: Array.from({ length: n }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, +process.env.FROM);
  // BACK=n: the menu's Title screen in the middle of frame n (menus.js #gm-title): a case kept at frame n, seeded once (not
  // again when the page opens on the title), taken up; Title screen; the title on its menu, Continue there at frame n; and
  // Continue back in frame n
  if (+process.env.BACK > 1) await p.addInitScript(n => { try { if (sessionStorage.getItem('bh-back-seeded')) return; sessionStorage.setItem('bh-back-seeded', '1'); localStorage.setItem('bh-story-late', JSON.stringify({ fi: n - 1, left: 8 - n, prints: Array.from({ length: n - 1 }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, +process.env.BACK);
  if (process.env.PLAYER) await p.addInitScript(k => { try { localStorage.setItem('bh-player', k); } catch (e) { /* storage blocked */ } }, process.env.PLAYER);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${process.env.Q || ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(2000);
  // (which GPU drew this play: a number from a real device is worth nothing without it)
  console.log(`renderer: ${await p.evaluate(() => { const d = document.createElement('canvas').getContext('webgl2'), x = d && d.getExtension('WEBGL_debug_renderer_info'); return d ? (x ? d.getParameter(x.UNMASKED_RENDERER_WEBGL) : d.getParameter(d.RENDERER)) : 'no WebGL2'; })}`);
  // GOVLOG=1 (a real GPU, DPR=2 for a dense display): the governor runs as on a player's device (under a harness it
  // stands still, quality.js), and every five seconds a line says the frame, the governor's scale/extras and frame time,
  // the tier, and the frames drawn in those five seconds with their median and their slowest tenth.
  if (process.env.GOVLOG) {
    await p.evaluate(() => { window.__game.governor.auto = true; const T = window.__gaps = []; let l = 0; const f = t => { if (l) T.push(t - l); l = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
    setInterval(() => p.evaluate(() => { const g = window.__game, G = g.governor, T = window.__gaps.splice(0).sort((a, b) => a - b), s = g.story && g.story.state, c = g.renderer.domElement;
      return `gov: frame ${s ? s.fi + 1 : '-'} ${s ? s.phase : ''}: ${G.scale.toFixed(2)}/${G.extras}, ${(G.frameMs || 0).toFixed(1)} ms, tier ${window.OEQuality.tier().name}; ${T.length} frames in 5 s, median ${T.length ? (1000 / T[T.length >> 1]).toFixed(0) : '-'} fps, slowest tenth from ${T.length ? T[Math.floor(T.length * 0.9)].toFixed(0) : '-'} ms; canvas ${c.width}x${c.height}`; }).then(l => console.log(l)).catch(() => {}), 5000).unref();
  }
  // (a still is of frames drawn whole: every frame drawn from the one before it until it is taken)
  let whole = 0;
  const ONE = process.env.ONE !== '0';
  const drawAll = on => { whole += on ? 1 : -1; return DRAW > 1 ? p.evaluate(([on, one, held]) => new Promise(r => { const D = window.__draw; D.all = on; if (!on) { if (D.hold) D.holdOff(); return r(); } if (one) { D.one = true; D.oneDone = r; D.oneHold = held; } else requestAnimationFrame(() => requestAnimationFrame(r)); if (!D.inFrame) requestAnimationFrame(() => {}); }), [whole > 0, ONE, process.env.HOLD !== '0']) : null; };
  // PROFILE=still:seconds: the page's script profiled for that long after that still is taken (where a frame's time goes,
  // #51); the functions that took the most of it, by their own time and with what they call, to the log (and profile.cpuprofile)
  const [profAt, profS] = (process.env.PROFILE || '').split(':');
  const profile = async () => {
    if (process.env.TRACE) { // (TRACE=1: a trace of the browser's processes instead, to trace.json, for chrome://tracing or Perfetto)
      await b.startTracing(p, { path: `${out}/trace.json`, categories: ['toplevel', 'gpu', 'cc', 'viz', 'benchmark', 'disabled-by-default-devtools.timeline', 'devtools.timeline', 'v8.execute'] });
      await p.waitForTimeout(1000 * (+profS || 10)); await b.stopTracing(); console.log(`trace after ${profAt}: ${out}/trace.json`); return;
    }
    const c = await p.context().newCDPSession(p); await c.send('Profiler.enable'); await c.send('Profiler.setSamplingInterval', { interval: 500 }); await c.send('Profiler.start');
    await p.waitForTimeout(1000 * (+profS || 20));
    const { profile: P } = await c.send('Profiler.stop'); fs.writeFileSync(`${out}/profile.cpuprofile`, JSON.stringify(P));
    const by = new Map(P.nodes.map(x => [x.id, x])), self = new Map(), dt = P.timeDeltas, total = dt.reduce((a, b) => a + b, 0) / 1000;
    P.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + dt[i] / 1000));
    const name = x => `${x.callFrame.functionName || '(anon)'} ${x.callFrame.url.split('/').pop()}:${x.callFrame.lineNumber + 1}`;
    const own = new Map(), incl = new Map(), parent = new Map();
    for (const x of P.nodes) for (const k of x.children || []) parent.set(k, x.id);
    for (const [id, ms] of self) { const k = name(by.get(id)); own.set(k, (own.get(k) || 0) + ms); const seen = new Set(); for (let q = id; q != null; q = parent.get(q)) { const kk = name(by.get(q)); if (!seen.has(kk)) { seen.add(kk); incl.set(kk, (incl.get(kk) || 0) + ms); } } }
    const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, ms]) => `  ${(ms / 1000).toFixed(1)} s ${(100 * ms / total).toFixed(0)}%  ${k}`).join('\n');
    console.log(`profile after ${profAt}, ${(total / 1000).toFixed(1)} s; by own time:\n${top(own, 25)}\nwith what they call:\n${top(incl, 40)}`);
  };
  // GPUCOST=still: after that still, what a frame drawn whole costs the GPU, five times: from the frame's start to a pixel
  // of the screen read back (which waits for the GPU to finish all it was given), with the page's frames held between (#70)
  const gpuCost = async () => {
    for (let k = 0; k < 5; k++) {
      await hold(true); await p.waitForTimeout(3000);
      const r = await p.evaluate(() => new Promise(res => { const D = window.__draw, gl = D.gls.filter(g => g.canvas.isConnected).sort((a, b) => b.canvas.width * b.canvas.height - a.canvas.width * a.canvas.height)[0], px = new Uint8Array(4);
        const t0 = performance.now(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const idle = performance.now() - t0;
        D.all = true; D.holdOff(); requestAnimationFrame(() => { const t1 = performance.now(); D.holdOn(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t2 = performance.now(); D.all = false; res({ idle, frame: t1 - t0, gpu: t2 - t1 }); }); }));
      console.log(`gpu cost after ${process.env.GPUCOST}: idle read ${r.idle.toFixed(0)} ms; the frame's script ${r.frame.toFixed(0)} ms; then the GPU's wait ${r.gpu.toFixed(0)} ms`);
      await hold(false);
    }
  };
  // SHOTCOST=still: after that still, with the page's frames held, what each part of taking a still costs, three times each (#78)
  const shotCost = async () => {
    await hold(true); await p.waitForTimeout(2000);
    const c = await p.context().newCDPSession(p), T = async (k, f) => { const r = []; for (let i = 0; i < 3; i++) { const t = Date.now(); await f(); r.push(Date.now() - t); } console.log(`shot cost ${k}: ${r.join(' ')} ms`); };
    await T('evaluate', () => p.evaluate(() => 1));
    await T('fonts.ready', () => p.evaluate(() => document.fonts.ready.then(() => 1)));
    await T('getLayoutMetrics', () => c.send('Page.getLayoutMetrics'));
    await T('p.screenshot png', () => p.screenshot({ path: `${out}/shotcost-a.png` }));
    await T('cdp png fast', async () => fs.writeFileSync(`${out}/shotcost-b.png`, Buffer.from((await c.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })).data, 'base64')));
    await T('cdp png', () => c.send('Page.captureScreenshot', { format: 'png' }));
    await T('cdp jpeg', () => c.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 }));
    await T('cdp png fromSurface:false', () => c.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, fromSurface: false }).catch(e => console.log(String(e).slice(0, 100))));
    await hold(false);
    const pix = () => p.evaluate(() => { const D = window.__draw, gl = D.gls.filter(g => g.canvas.isConnected).sort((a, b) => b.canvas.width * b.canvas.height - a.canvas.width * a.canvas.height)[0], px = new Uint8Array(4), t = performance.now(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t; });
    const vsync = () => p.evaluate(() => new Promise(r => window.__draw.raf(() => window.__draw.raf(r))));
    for (const [k, f] of [['read back', pix], ['wait 500', () => p.waitForTimeout(500)], ['two display frames', vsync], ['nothing', () => null]]) for (let i = 0; i < 2; i++) {
      await drawAll(true); await hold(true); const t = Date.now(); const x = await f(); const t1 = Date.now(); await p.screenshot({ path: `${out}/shotcost-d.png` }); const t2 = Date.now(); await hold(false); await drawAll(false);
      console.log(`shot cost after the frames, ${k}: ${t1 - t} ms${typeof x === 'number' ? ` (read ${x.toFixed(0)})` : ''}, then the screenshot ${t2 - t1} ms`); }
    for (let k = 0; k < 3; k++) { const t = Date.now(); await drawAll(true); const t1 = Date.now(); await hold(true); const t2 = Date.now(); await p.screenshot({ path: `${out}/shotcost-c.png` }); const t3 = Date.now(); await hold(false); await drawAll(false); console.log(`shot cost a still: frames whole ${t1 - t} ms, hold ${t2 - t1}, screenshot ${t3 - t2}, release ${Date.now() - t3}`); }
    await c.detach();
  };
  // ONETEST=still: after that still, with the world held (its clock, the lens's grain and the sky's on one time, and no
  // frame passed over by the cap), stills of two frames drawn whole, as before, and of one (#78), each from the same
  // state (the occlusion's noise and the mirror's turn at the same step, the history forgotten), to onetest-*.png for a
  // pixel diff (tools/still_diff.py), with what each took
  const oneTest = async () => {
    const cap = await p.evaluate(() => { const G = window.__game, g = G.governor, c = g.cap; g.cap = 0; G.hold(true); const A = G.atmos, up = A.update, t = performance.now() / 1000; A.__up = up; A.update = (u, s, U) => up.call(A, u, t, U); return c; });
    for (const [k, one] of [['two1', false], ['two2', false], ['one1', true], ['one2', true], ['two3', false]]) {
      await p.evaluate(() => new Promise(r => { const f = () => (window.__draw.steps % 64 === 0 ? r() : requestAnimationFrame(f)); f(); }));
      const t0 = Date.now(), n0 = await p.evaluate(() => window.__draw.drawn);
      await p.evaluate(one => new Promise(r => { const D = window.__draw, a = window.__game.atmos; if (a && a.ao) a.ao.reset(); D.all = true; if (one) { D.one = true; D.oneDone = r; D.oneHold = true; } else requestAnimationFrame(() => requestAnimationFrame(r)); }), one);
      await hold(true); const t1 = Date.now(); await p.screenshot({ path: `${out}/onetest-${k}.png` }); const t2 = Date.now();
      const n1 = await p.evaluate(() => window.__draw.drawn); await hold(false); await p.evaluate(() => { window.__draw.all = false; });
      console.log(`one test ${k}: frames ${t1 - t0} ms, screenshot ${t2 - t1} ms, ${t2 - t0} ms in all; ${n1 - n0} drawn`);
    }
    await p.evaluate(c => { const G = window.__game, A = G.atmos; G.hold(false); G.governor.cap = c; A.update = A.__up; }, cap);
  };
  const hold = on => (DRAW > 1 && process.env.HOLD !== '0' ? p.evaluate(on => (on ? window.__draw.holdOn() : window.__draw.holdOff()), on) : null); // (HOLD=0: the frames run on while a still is taken)
  // (the frame after the still's, counted, drawn whole as the still's was; and the script's time a frame not drawn took since the last still: this machine's, a guide)
  let jsWas = { n: 0, js: 0 };
  // (counted: the still's own frame, where the harness draws one frame whole for a still, DRAW=n: no frame more. It is the
  // heavier of the game's frames: the wet street's mirror is drawn in it, the occlusion worked out once as far as the count goes)
  const budget = async (name, counted) => {
    try {
      const c = counted && counted.draws ? counted : await require('./beat_count').sample(p, 2, !!process.env.BUDGET_BY); // (BUDGET_BY=1: and by what was drawn, the heaviest forty)
      const x = await p.evaluate(() => { const g = window.__game, s = g && g.story && g.story.state, D = window.__draw, o = D && D.split ? D.split.off : null; return { fi: s ? s.fi : -1, phase: s ? s.phase : '', off: o ? { n: o.n, js: o.js } : null, tier: window.OEQuality && OEQuality.tier ? OEQuality.tier().name : '' }; });
      const js = x.off && x.off.n > jsWas.n ? +((x.off.js - jsWas.js) / (x.off.n - jsWas.n)).toFixed(1) : null; if (x.off) jsWas = x.off;
      // (BUDGET_TOP=n: and the n largest textures and buffers WebGL holds, by what each was made from: what a beat brought and what it left behind)
      const top = +process.env.BUDGET_TOP ? await p.evaluate(n => { const r = window.__memReport(n); const g = window.__game, T = window.THREE, M = {}; let root = g.world; while (root.parent) root = root.parent;
        // (and the meshes drawn with shapes, by whose they are: three.js keeps a texture of the shapes for each such geometry)
        root.traverse(o => { if (o.isMesh && o.geometry && o.geometry.morphAttributes && o.geometry.morphAttributes.position) { let vis = true, top = ''; for (let q = o; q && q !== root; q = q.parent) { if (!q.visible) vis = false; if (q.name) top = q.name; } const k = `${top} ${vis ? 'shown' : 'hidden'}`; M[k] = (M[k] || 0) + 1; } });
        // (and whose the textures and the vertex buffers are: each texture a material holds, by the first names up its mesh's
        // parents and whether it is shown, its bytes as it is sent, a third more with mips; each geometry's attributes)
        const own = {}, seenT = new Set(), seenG = new Set(), BPP = t => (t.isCompressedTexture ? 1 : t.format === T.RedFormat ? 1 : t.type === T.HalfFloatType ? 8 : t.type === T.FloatType ? 16 : 4);
        const texOf = (t, k) => { if (!t || !t.isTexture || seenT.has(t)) return; seenT.add(t); const im = t.image || {}, w = im.width || im.videoWidth || 0, h = im.height || im.videoHeight || 0; const o = own[k] || (own[k] = { tex: 0, n: 0, buf: 0 }); o.tex += w * h * BPP(t) * (t.generateMipmaps || (t.mipmaps && t.mipmaps.length > 1) ? 4 / 3 : 1) / 1048576; o.n++; };
        root.traverse(o => { if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return; let vis = true; const names = []; for (let q = o; q && q !== root; q = q.parent) { if (!q.visible) vis = false; if (q.name && !/^(Scene|Group)$/.test(q.name)) names.push(q.name.replace(/[_-]?\d+$/, '')); }
          const k = `${names.length ? names[names.length - 1] : o.type}${names.length > 1 ? `/${names[names.length - 2]}` : ''} ${vis ? 'shown' : 'hidden'}`;
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (!m) continue; for (const p in m) texOf(m[p], k); if (m.uniforms) for (const u in m.uniforms) texOf(m.uniforms[u] && m.uniforms[u].value, k); }
          const g = o.geometry; if (g && !seenG.has(g)) { seenG.add(g); let b = 0; const cnt = new Set(); for (const a of [g.index, o.instanceMatrix, o.instanceColor, ...Object.values(g.attributes || {})]) { const d = a && (a.isInterleavedBufferAttribute ? a.data : a); if (d && d.array && !cnt.has(d)) { cnt.add(d); b += d.array.byteLength; } } (own[k] || (own[k] = { tex: 0, n: 0, buf: 0 })).buf += b / 1048576; } });
        const owners = Object.entries(own).map(([k, v]) => [k, +v.tex.toFixed(1), v.n, +v.buf.toFixed(1)]).sort((x, y) => (y[1] + y[3]) - (x[1] + x[3])).slice(0, 60);
        // (and each of the largest textures by the slot that wears it: "name" mesh/material.slot; one no material wears is a target or a pass's)
        const R = g.renderer, by = new Map();
        const note = (t, who) => { if (!t || !t.isTexture) return; const w = R.properties.get(t).__webglTexture; if (!w) return; if (!by.has(w)) by.set(w, { t, who: new Set() }); by.get(w).who.add(who); };
        root.traverse(o => { for (const m of [].concat(o.material || [])) { if (!m) continue; for (const k in m) if (m[k] && m[k].isTexture) note(m[k], `${o.name || o.type}/${m.name || m.type}.${k}`); if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) note(v, `${o.name || o.type}/${m.name || m.type}.u.${k}`); } } });
        for (const q of window.__texAll || []) { const t = q.deref(); if (t) note(t, `made at ${t.__at}`); }
        const worn = [...window.__mem.tex].sort((x, y) => y[1].bytes - x[1].bytes).slice(0, n).map(([w, e]) => { const h = by.get(w); return `${(e.bytes / 1048576).toFixed(1)} MB ${e.label} ${h ? `"${h.t.name || ''}" ${h.t.isCompressedTexture ? 'blocks' : h.t.isDataTexture ? 'data' : h.t.isCanvasTexture ? 'canvas' : 'picture'} ${[...h.who].slice(0, 2).join(', ')}${h.t.__at ? ` [${h.t.__at}]` : ''}${h.who.size > 2 ? ` +${h.who.size - 2}` : ''}` : '(no material)'}`; });
        // (and what WebGL itself holds, by whose it is: `geo` the vertex and index buffers, found by the array each was sent from,
        // `ownGL` the textures by whose material wears them, `loose` what no material in the scene wears; issue 130)
        const held = (() => {
          // (and the vertices and indices the scene's geometries hold, by whose they are: the two outermost names over each mesh,
          // shown or hidden. A geometry is counted once; one never drawn is counted though WebGL may not hold it yet)
          // (only what WebGL holds: a buffer is found by the array it was sent from, tools/gl_mem.js; `looseBuf`: megabytes whose array the page has let go or no geometry in the scene has)
          const inGL = new Map(); for (const e of window.__mem.buf.values()) { const ab = e.src && e.src.deref(); if (ab) inGL.set(ab, e); }
          const one = []; const G = {}, seenG = new Set(), bytesOf = a => { const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array; const e = arr && inGL.get(arr.buffer); if (!e || seenG.has(e)) return 0; seenG.add(e); return e.bytes; };
          root.traverse(o => { const ge = o.geometry; if (!ge || !ge.attributes) return; let n = 0; for (const k in ge.attributes) n += bytesOf(ge.attributes[k]); if (ge.index) n += bytesOf(ge.index);
            for (const k in ge.morphAttributes || {}) for (const a of ge.morphAttributes[k]) n += bytesOf(a);
            if (o.isInstancedMesh) { if (o.instanceMatrix) n += bytesOf(o.instanceMatrix); if (o.instanceColor) n += bytesOf(o.instanceColor); }
            if (!n) return; let vis = true; const names = []; for (let q = o; q && q !== root; q = q.parent) { if (!q.visible) vis = false; if (q.name) names.unshift(q.name); }
            const k = `${names.slice(0, 2).join('/') || o.type + ':' + Object.keys(o.userData).slice(0, 3).join(',') + ':' + ([].concat(o.material || [])[0] || {}).name} ${vis ? 'shown' : 'hidden'}`; G[k] = (G[k] || 0) + n; if (n > 4e5) { ge.computeBoundingBox && !ge.boundingBox && ge.computeBoundingBox(); const bb = ge.boundingBox, chain = []; for (let q = o.parent; q && q !== root; q = q.parent) chain.push(q.name || q.type + ':' + Object.keys(q.userData).slice(0, 3).join(',')); one.push(`${(n / 1048576).toFixed(2)} MB ${k} | ${o.name || o.type} ${Object.keys(ge.attributes).join(',')} idx ${ge.index ? ge.index.count : 0} ro ${o.renderOrder} ud ${Object.keys(o.userData).join(',')} mat ${[].concat(o.material || []).map(m => m && (m.name || m.type)).join('+')} < ${chain.join(' < ')} box ${bb ? [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map(Math.round).join(',') : ''}`); } });
          const geo = Object.entries(G).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / 1048576).toFixed(2)} MB ${k}`);
          let looseBuf = 0; for (const e of window.__mem.buf.values()) if (!seenG.has(e)) looseBuf += e.bytes; looseBuf = +(looseBuf / 1048576).toFixed(1);
          // (and the textures WebGL holds, by whose material wears them: the same two names; a texture two wear is the first's.
          // `own`: megabytes by owner; `loose`: what no material in the scene wears, the targets and what was left behind, by size)
          const RP = g.renderer && g.renderer.properties, MT = window.__mem.tex, O = {}, seenT = new Set();
          const big = [], wear = (t, k, slot) => { if (!t || !t.isTexture || !RP) return; const x = RP.get(t).__webglTexture, e = x && MT.get(x); if (!e || seenT.has(x)) return; seenT.add(x); O[k] = (O[k] || 0) + e.bytes; if (e.bytes > 6e5) big.push(`${(e.bytes / 1048576).toFixed(2)} MB ${k} ${slot} ${e.label} ${t.name || ''}`); };
          if (RP) root.traverse(o => { const ms = [].concat(o.material || []); if (!ms.length) return; let vis = true; const names = []; for (let q = o; q && q !== root; q = q.parent) { if (!q.visible) vis = false; if (q.name) names.unshift(q.name); }
            const k = `${names.slice(0, 2).join('/') || o.type + ':' + Object.keys(o.userData).slice(0, 3).join(',') + ':' + ([].concat(o.material || [])[0] || {}).name} ${vis ? 'shown' : 'hidden'}`;
            for (const m of ms) { if (!m) continue; for (const key in m) { const v = m[key]; if (v && v.isTexture) wear(v, k, key); } if (m.uniforms) for (const u in m.uniforms) { const v = m.uniforms[u] && m.uniforms[u].value; if (v && v.isTexture) wear(v, k, u); else if (Array.isArray(v)) v.forEach(t => wear(t, k, u)); } } });
          const own = Object.entries(O).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / 1048576).toFixed(2)} MB ${k}`), L = {};
          for (const [x, e] of MT) if (!seenT.has(x)) L[e.label] = (L[e.label] || 0) + e.bytes;
          const loose = Object.entries(L).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / 1048576).toFixed(2)} MB ${k}`);
          return { geo, geoOne: one.sort((a, b) => parseFloat(b) - parseFloat(a)).slice(0, n), looseBuf, ownGL: own, ownBig: big.sort((a, b) => parseFloat(b) - parseFloat(a)).slice(0, n), loose };
        })();
        return { ...held, topTex: r.topTex, own: worn, topBuf: r.topBuf, topRb: r.topRb, owners, morph: M, npcs: (g.npcs || []).length, live: window.OEFace && OEFace.live ? OEFace.live() : null }; }, +process.env.BUDGET_TOP) : {};
      fs.appendFileSync(BUDGET, `${JSON.stringify({ still: name, fi: x.fi, phase: x.phase, tier: x.tier, size, js_ms: js, ...c, ...top })}\n`);
      if (HITCH) { const fr = await p.evaluate(() => { const H = window.__draw && window.__draw.hit; if (!H) return []; const f = H.fr; H.fr = []; return f; }); fs.appendFileSync(HITCH, `${JSON.stringify({ still: name, fi: x.fi, phase: x.phase, tier: x.tier, fr })}\n`); }
    } catch (e) { console.log(`(no count at ${name}: ${String(e).slice(0, 120)})`); }
  };
  const ST = { n: 0, whole: 0, shot: 0 }; // (a still's time: its frames drawn whole, and the screenshot, #70)
  const BARE = process.env.BARE ? new RegExp(process.env.BARE) : null; // (BARE=regex: the picture alone at those stills, in out/bare: what tools/legible.js lays the words over)
  // (STILLS=0: no still is taken: a check that reads the story's state, not its pictures; a play here spent two fifths of
  // its time on 187 stills, 2.1 s each on a software renderer. Where the still's frame is counted (BUDGET) the frame is
  // asked for whole all the same, dry: the page makes every call of it and the counts are of the calls, but no draw or
  // clear is passed on to the renderer. Where nothing is counted, nothing is asked for. The photographs the story itself
  // takes are drawn as ever)
  const NOSTILL = process.env.STILLS === '0', dry = on => (NOSTILL && DRAW > 1 ? p.evaluate(on => { window.__draw.dry = on; }, on) : null);
  const PROBE = (process.env.PROBE || '').split(',').filter(Boolean);
  const snap = async name => { const t0 = Date.now(); const own = BUDGET && DRAW > 1 && ONE; if (NOSTILL && !own) { ST.n++; return; } await dry(true); if (own) await p.evaluate(by => { const D = window.__draw; window.__beat.names(by); D.counted = null; D.count = true; }, !!process.env.BUDGET_BY).catch(() => {}); const who = PROBE.includes(name); if (who) await require('./draw_who').install(p); await drawAll(true); await hold(true); const counted = own ? await p.evaluate(() => { const B = window.__beat, D = window.__draw, c = D.counted; D.count = false; D.counted = null; B.names(false); return c ? B.report([c]) : null; }).catch(() => null) : null; if (who) fs.writeFileSync(`${out}/who-${name}.txt`, (await require('./draw_who').read(p)).join('\n')); /* (PROBE=a,b: each still's draws, thing by thing and target by target: tools/draw_who.js) */ const t1 = Date.now(); if (!NOSTILL) try { await p.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }); } catch (e) { console.log(`(no still ${name})`); } if (BARE && !NOSTILL && BARE.test(name)) { const st = await p.addStyleTag({ content: '#game-stage > :not(#game-gl) { visibility: hidden !important; }' }); try { fs.mkdirSync(`${out}/bare`, { recursive: true }); await p.screenshot({ path: `${out}/bare/${name}.png`, timeout: 120000 }); } catch (e) { console.log(`(no bare still ${name})`); } await st.evaluate(e => e.remove()); } if (LINKLAG) console.log(`  gate at ${name}: ${await p.evaluate(() => (window.__gate ? JSON.stringify(window.__gate.n) : 'none')).catch(() => '?')}`); ST.n++; ST.whole += t1 - t0; ST.shot += Date.now() - t1; if (process.env.COUNT) console.log(`  ${name}: ${await require('./crowd_count').count(p, +process.env.COUNT || 60).catch(e => String(e).slice(0, 120))}`); await hold(false); if (BUDGET && !name.startsWith('into-')) await budget(name, counted); /* (a walk-into's still is the harness's own view from the side, not a beat of the story: issue 126) */ await drawAll(false); await dry(false); if (/^\d+-stop$/.test(name)) await glassLook(name); if (name === profAt) await profile(); if (name === process.env.GPUCOST) await gpuCost(); if (name === process.env.SHOTCOST) await shotCost(); if (name === process.env.ONETEST) await oneTest();  if (process.env.UI_DUMP) await uiDump(p, `${process.env.UI_DUMP}/${name}.json`, { ctx: w < 500 ? 'touch' : 'desk' }).catch(e => console.log('(no dump)', String(e).slice(0, 120))); };
  // The glass that mirrors its place (issue 203: after a play from the title SKY STAGE's glass was black on a Mac's GPU,
  // nothing of the city showing through it, and the man at it had a black mask for a face). At a Stop where a level's
  // cube has been taken: the cube itself is read (drawn, no texel that is no number, none at 128 or more: the guide's
  // whiskers filled a third of its sky with 65504), and the picture is taken twice, with the glass and without it: what is
  // behind a pane must still be there with it.
  const glassLook = async name => {
    const hero = () => { const h = window.__game && window.__game.hero && window.__game.hero(); return h && h.probes ? h : null; };
    const cubes = await p.evaluate(`(${hero})() ? (${hero})().probes() : []`).catch(() => []);
    if (!cubes.length) return;
    for (const q of cubes) {
      const ok = q.lit > 0.5 && q.over < 0.002 && q.bad === 0;
      console.log(`  ${name}: the glass's cube of ${q.id} (${q.res} a side, taken ${q.taken}): ${(q.lit * 100).toFixed(0)}% lit, ${(q.over * 100).toFixed(2)}% at 128 or more, ${(q.bad * 100).toFixed(2)}% no number${ok ? '' : ' (WRONG)'}`);
      if (!ok) { errors.push(`${name}: the cube ${q.id}'s glass mirrors is wrong`); console.log(`error: ${name}: the cube the glass of ${q.id} mirrors is ${q.lit <= 0.5 ? 'not drawn' : 'not light a place gives'} (issue 203)`); }
    }
    // (the picture alone, the interface hidden: a line of words fading in between the two shots, on its dark ground, was
    // counted as the pane's footprint and read as the glass blacking out what is behind it, issue 13)
    const shot = async () => { await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await drawAll(true); await hold(true); let b = null; const bare = await p.addStyleTag({ content: '#game-stage > :not(#game-gl) { visibility: hidden !important; }' }).catch(() => null); try { b = await p.screenshot({ timeout: 120000 }); } catch (e) { /* no picture: nothing compared */ } if (bare) await bare.evaluate(e => e.remove()).catch(() => {}); await hold(false); await drawAll(false); return b; };
    const panes = await p.evaluate(`(${hero})().glass(true)`).catch(() => 0);
    if (!panes) return;
    const withIt = await shot();
    await p.evaluate(`(${hero})().glass(false)`);
    const without = await shot();
    await p.evaluate(`(${hero})().glass(true)`);
    if (!withIt || !without) return;
    if (!NOSTILL) fs.writeFileSync(`${out}/${name}-no-glass.png`, without);
    // (compared in a page of its own, over the pane's footprint, the pixels the two pictures differ in at all: a pane
    // that is right is a fifth opaque and adds what it mirrors, so the footprint is about as light with it as without,
    // lighter where a phone's small cube spreads the towers' lamps over it (1.9 times, measured); a black pane left it
    // at 0.35 to 0.4 of the picture behind, and garbage on Mesa at 3.4 times. The camera eases between the two
    // pictures, so they are not compared pixel by pixel: the share that differs widely is printed, not judged)
    const q = await b.newPage();
    const r = await q.evaluate(async ([A, B]) => {
      const px = async s => { const im = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob()), c = new OffscreenCanvas(im.width, im.height), g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
      const a = await px(A), b2 = await px(B), L = (d, i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
      let n = 0, far = 0, la = 0, lb = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.max(Math.abs(a[i] - b2[i]), Math.abs(a[i + 1] - b2[i + 1]), Math.abs(a[i + 2] - b2[i + 2]));
        if (d > 48) far++;
        if (d > 8) { n++; la += L(a, i); lb += L(b2, i); }
      }
      const all = a.length / 4;
      return { pane: n / all, far: far / all, k: n ? la / Math.max(lb, 1) : 1 };
    }, [withIt.toString('base64'), without.toString('base64')]).catch(e => { console.log('(the glass not compared)', String(e).slice(0, 120)); return null; });
    await q.close();
    if (!r || r.pane < 0.02) return; // (no pane in the picture)
    const wrong = r.k < 0.7 ? 'the glass blacks out what is behind it' : r.k > 3 ? 'the glass is a glare over what is behind it' : '';
    console.log(`  ${name}: with the glass, its ${(r.pane * 100).toFixed(0)}% of the picture is ${r.k.toFixed(2)} times as light as without it (${(r.far * 100).toFixed(1)}% of the picture differs by more than 48 of 255)${wrong ? ' (WRONG)' : ''}`);
    if (wrong) { errors.push(`${name}: ${wrong}`); console.log(`error: ${name}: ${wrong}: ${r.k.toFixed(2)} times as light with it (0.7 to 3; issue 203)`); }
  };
  await snap('00-title');
    // (the lines given to the dialogue for the story's people, as they are given: every line of a talk is shown, one press at a time;
  // read from the call, not the screen, where a line passed between two looks was missed)
  const listen = () => p.evaluate(() => { const d = window.__game.dlg, show = d.show, H = window.__heard = window.__heard || { lines: [] };
    d.show = function (npc, lines, ...rest) { if (npc && npc.log) H.lines.push(...lines); return show.call(this, npc, lines, ...rest); }; });
  await listen();
  // (the job sheet in the hand, seen by the page itself the moment it comes up with its ink: it goes away on the wall clock,
  // 14 s after the ink, and a loop that first saw its beat late, or a still that took longer than that, found it already gone)
  await p.evaluate(() => { const e = document.getElementById('g-story-order'); if (!e) return; const o = new MutationObserver(() => { if (e.classList.contains('on') && e.querySelectorAll('i').length > 80) { window.__orderOk = true; o.disconnect(); } }); o.observe(e, { attributes: true, attributeFilter: ['class'], childList: true }); });
  // WORDS=2: the dialogue's words at that size (log.js setWords: 0 as they come, 2 the largest) from the start, on their
  // backing, for a late start's talk shots at their largest (issue 76)
  if (process.env.WORDS) await p.evaluate(n => window.__game.storyLog && window.__game.storyLog.setWords({ size: n, solid: n > 0 }), +process.env.WORDS);
  // TOUCH=1 (issue 120): the play by touch, on a phone's page: every answer, every line passed, the camera, the release,
  // a hint, the roll, the cards and the helicopter's door are taps of a finger where the thing is on the screen, not a
  // key, a script's click or the story's own functions. A thing that cannot be tapped (off the screen however the page is
  // scrolled, or under something else) fails the play, and is then clicked so that the play goes on and says the rest.
  const TOUCH = !!process.env.TOUCH;
  const tapEl = async (sel, n = 0) => {
    const r = await p.evaluate(([sel, n]) => { const e = document.querySelectorAll(sel)[n]; if (!e) return null; e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const b = e.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2, top = document.elementFromPoint(x, y);
      return { x, y, on: b.width > 4 && b.height > 4 && x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight, hit: !!top && (top === e || e.contains(top)), over: top && top !== e && !e.contains(top) ? `${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}.${String(top.className || '').slice(0, 40)}` : '', small: Math.min(b.width, b.height) }; }, [sel, n]);
    if (!r || !r.on || !r.hit) { const m = `touch: ${sel}${n ? `[${n}]` : ''} cannot be tapped (${!r ? 'not there' : !r.on ? 'off the screen' : `under ${r.over}`})`; if (!errors.includes(m)) { errors.push(m); console.log(m); }
      // (and what the screen was then: where it and its parents stand, which of them is hidden, the stage's state, the action the game offers)
      console.log('  then:', JSON.stringify(await p.evaluate(sel => { const e = document.querySelector(sel), g = window.__game, st = document.querySelector('.game-stage'), out = []; for (let x = e; x && x !== document.body && out.length < 4; x = x.parentElement) { const b = x.getBoundingClientRect(), cs = getComputedStyle(x); out.push(`${x.id || x.className}: ${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}${x.hidden ? ' hidden' : ''} ${cs.display}/${cs.visibility}`); } const a = g && g.currentAction ? g.currentAction() : null, d = document.getElementById('gd'); return { chain: out, stage: st ? st.className : '', act: a ? a.text : null, dlg: !!d && !d.hidden, cine: g && g.cine ? `${g.cine.active}/${g.cine.label}` : '', mode: g ? g.player.mode : '', view: [innerWidth, innerHeight] }; }, sel))); await p.evaluate(([sel, n]) => { const e = document.querySelectorAll(sel)[n]; if (e) e.click(); }, [sel, n]); return false; }
    if (r.small < 40 && !small.has(sel)) { small.add(sel); console.log(`note touch: ${sel} is ${Math.round(r.small)} px across where it is tapped`); }
    if (process.env.TAPLOG) console.log(`tap ${sel}${n ? `[${n}]` : ''} at ${Math.round(r.x)},${Math.round(r.y)}: ${await p.evaluate(([sel, n]) => (document.querySelectorAll(sel)[n].textContent || '').trim().slice(0, 40), [sel, n])}`); // (TAPLOG=1: each tap, where and on what)
    await p.touchscreen.tap(r.x, r.y); taps++;
    { // (the page and its stage never scroll: a stage moved by a scroll took everything laid over the picture with it, out of a thumb's reach)
      const sc = await p.evaluate(() => [document.scrollingElement, document.body, document.querySelector('.game-stage')].map(e => e ? `${Math.round(e.scrollLeft)},${Math.round(e.scrollTop)}` : '0,0'));
      if (sc.some(v => v !== '0,0') && !small.has('scrolled')) { small.add('scrolled'); const m = `touch: the page scrolled (document, body, stage: ${sc.join(' / ')}) after a tap on ${sel}`; errors.push(m); console.log(m); }
    }
    return true;
  };
  let taps = 0; const small = new Set();
  // (the camera by its button, where the story shows one: it comes up when the camera may. Where it does not, a step of
  // this harness that raises it all the same, to see that nothing comes of it, uses the story's own function as before, and says so)
  const raise = async on => { if (!TOUCH) return p.evaluate(on => window.__game.story.raise(on), on);
    const look = () => p.evaluate(on => { const st = window.__game.story.state, e = document.getElementById('g-story-cam'); return { same: !!st.cam === on, shown: !!e && e.classList.contains('on'), at: `frame ${st.fi + 1} ${st.phase} ${st.beat}` }; }, on);
    let b = await look();
    if (b.same) return;
    // (the button comes up when the camera may, a moment after the talk: waited for, as a person waits, not gone round)
    for (let k = 0; k < 10 && !b.shown; k++) { await p.waitForTimeout(250); b = await look(); if (b.same) return; }
    if (b.shown) {
      // (one tap, and the story given a second and a half to take it: the button turns the camera over, so a second tap
      // sent before the first is taken would put it back. Tapped again only if nothing came of it, three times at most)
      // (and looked at again before each tap: a step that has just moved you, off the light, say, found the button still up
      // from the frame before, and the story took it down before the tap came, main's storyp on 3aa33f8. Gone, it is a
      // camera with no button for it, as below; up and tapped three times with nothing coming of it, a fault)
      let gone = false;
      for (let k = 0; k < 3 && !gone; k++) { if (!(b = await look()).shown) { gone = true; break; } await tapEl('#g-story-cam'); for (let i = 0; i < 6; i++) { await p.waitForTimeout(250); if ((await look()).same) return; } }
      if (!gone) { const m = `touch: the camera's button tapped three times at ${b.at}, and the camera is not ${on ? 'up' : 'down'}`; errors.push(m); console.log(m); }
      else console.log(`note touch: the camera's button went as it was to be tapped (${b.at}): the camera ${on ? 'raised' : 'lowered'} by the story's own function`);
    } else console.log(`note touch: the camera ${on ? 'raised' : 'lowered'} with no button for it on the screen (${b.at}): by the story's own function`);
    return p.evaluate(on => window.__game.story.raise(on), on); };
  const shoot = () => (TOUCH ? tapEl('#g-story-shutter') : p.evaluate(() => { window.__game.story.shoot(); }));
  const spendAnswer = async yes => { if (!TOUCH) return p.evaluate(yes => window.__game.story.spendAnswer(yes), yes); if (yes) await p.waitForTimeout(900); return tapEl(`#g-story-spend [data-spend="${yes ? 1 : 0}"]`); }; // (Spend takes no tap in the card's first 0.7 s)
  // (a key, or on a phone what stands for it: a line passed by a tap on the words, the order put away by a tap on it, E by the prompt's own button, H by the hint's)
  const press = async (code, must = false) => { if (!TOUCH) return p.keyboard.press(code); if (code === 'KeyH') return tapEl('#g-story-hint');
    // (a call said hands-free is a subtitle: it goes on by itself, and nothing on a phone passes its lines)
    const k = await p.evaluate(() => { const d = document.getElementById('gd'), o = document.getElementById('g-story-order'); return d && !d.hidden ? (d.classList.contains('free') || d.classList.contains('cut') ? '' : '#gd-text') : o && o.classList.contains('on') ? '#g-story-order' : '#gp-main'; });
    // (E with nothing to do it to is nothing, as the key is; where the play needs it, `must`, the prompt's button has to be there)
    const promptOn = () => p.evaluate(() => { const e = document.getElementById('gp-main'), b = e && e.getBoundingClientRect(); return !!e && b.width > 4 && b.top >= 0 && b.bottom <= innerHeight; });
    if (k === '#gp-main' && !must && !await promptOn()) return p.waitForTimeout(600);
    // (where the play needs it, the prompt is waited for as a person waits for it: a line said hands-free, a call, holds
    // every action until it is said, game.js currentActionAny; up to thirty seconds of the wall: a line said hands-free goes on by itself)
    if (k === '#gp-main') for (let i = 0; i < 60 && !await promptOn(); i++) await p.waitForTimeout(500);
    return k ? tapEl(k) : p.waitForTimeout(1200); };
  const clickEl = (sel, n = 0) => (TOUCH ? tapEl(sel, n) : p.evaluate(([sel, n]) => document.querySelectorAll(sel)[n].click(), [sel, n]));
  // (a phone's title by touch, a screen at a time, as a person goes through it: the picture and Tap to begin; the menu,
  // where Continue takes up a case kept and The story opens the episode's screen; that screen's Begin; and, asked before
  // a case begins, who you play, chosen and confirmed. A script's click on Begin went past all of it)
  const begin = async () => {
    if (!TOUCH) return clickEl('#gt-play');
    for (let k = 0; k < 12; k++) {
      const at = await p.evaluate(() => { const t = document.getElementById('g-title'), g = window.__game, ph = g && g.story && g.story.state.phase; return !t || t.hidden || (ph && ph !== 'idle' && ph !== 'dressed') ? 'in' : t.dataset.screen || 'menu'; });
      if (at === 'in') return true;
      const vis = q => p.evaluate(q => { const e = document.querySelector(q), b = e && e.getBoundingClientRect(); return !!e && !e.hidden && b.width > 4 && b.height > 4 && getComputedStyle(e).visibility !== 'hidden'; }, q);
      if (!seen0.has(at)) { seen0.add(at); await snap(`00-title-${at}`).catch(() => {}); }
      if (at === 'press') await tapEl('#gt-press-go');
      else if (at === 'who') { await tapEl(`#gt-who [data-c="${process.env.PLAYER || 'W'}"]`); await p.waitForTimeout(500); await tapEl('#gt-who-go'); }
      else if (at === 'story') await tapEl((await vis('#gt-play')) ? '#gt-play' : '#gt-continue');
      else if (await vis('#gt-cont-go')) await tapEl('#gt-cont-go');
      else if (await vis('#gt-story-go')) await tapEl('#gt-story-go');
      else await tapEl('#gt-play');
      await p.waitForTimeout(1500);
    }
    errors.push('touch: the title was not got through to the story by taps'); console.log(errors[errors.length - 1]); return clickEl('#gt-play');
  };
  const seen0 = new Set();
  await begin();
  if (+process.env.BACK > 1) { // (BACK=n, above: the beat played alone, then the page is closed)
    const n = +process.env.BACK, still = async k => { try { await p.screenshot({ path: `${out}/back-${k}.png`, timeout: 120000 }); } catch (e) { console.log(`(no still back-${k})`); } };
    const bad = m => { errors.push(`Title screen: ${m}`); console.log(`FAIL Title screen: ${m}`); };
    const inCase = () => p.waitForFunction(n => { const g = window.__game, s = g && g.story.state, t = document.getElementById('g-title'); return t && t.hidden && s && s.fi === n - 1 && s.phase !== 'idle' && s.phase !== 'dressed'; }, n, { timeout: 600000, polling: 500 }).then(() => true, () => false);
    const where = () => p.evaluate(() => { const s = window.__game.story.state, t = document.getElementById('g-title'); return `frame ${s.fi + 1}, ${s.phase}/${s.beat}, title ${t.hidden ? 'gone' : t.dataset.screen}`; }).catch(e => String(e).slice(0, 80));
    if (!(await inCase())) bad(`the case kept at frame ${n} was not taken up (${await where()})`);
    await p.waitForTimeout(4000);
    await clickEl('#g-story-menu');
    await p.waitForTimeout(800);
    const m = await p.evaluate(() => { const e = document.getElementById('gm-title'), r = e && e.getBoundingClientRect(), note = document.getElementById('gm-title-note'); return { on: !!e && !document.getElementById('g-menu').hidden && r.height > 0, first: !!r && r.top >= 0 && r.bottom <= innerHeight + 1, note: note && !note.hidden ? note.textContent : '' }; });
    if (!m.on) bad('the case\'s pause has no Title screen'); else if (!m.first) bad('Title screen is below the menu\'s first screen');
    const loads = /[?&]inplace=0\b/.test(process.env.Q || ''); // (by default the case waits under the title as it is, game.js parkTitle; Q=?inplace=0 takes the page load)
    if (loads && !new RegExp(`frame ${n}\\b`).test(m.note)) bad(`the note does not say Continue takes up frame ${n} ("${m.note}")`);
    if (!loads && m.note) bad(`in place, the note says the frame is taken up from its beginning ("${m.note}")`);
    console.log(`  the pause: Title screen ${m.on ? 'shown' : 'missing'}, "${m.note}"`);
    await still('menu');
    if (loads) expectReload(p, 'the pause\'s Title screen'); await clickEl('#gm-title');
    const back = await p.waitForFunction(() => { const t = document.getElementById('g-title'), l = document.getElementById('g-loader'); return window.__game && t && !t.hidden && t.dataset.screen === 'menu' && l && l.hidden; }, null, { timeout: 900000, polling: 500 }).then(() => true, () => false);
    if (!back) bad('the title never opened on its menu');
    else {
      await p.waitForTimeout(2500);
      const t = await p.evaluate(() => { const v = s => { const e = document.querySelector(s); return !!e && !e.closest('[hidden]') && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden' && +getComputedStyle(e).opacity > 0.05; }, c = document.querySelector('#gt-cont-go small'); return { cont: v('#gt-cont-go') ? (c ? c.textContent : '') : null, left: [v('#g-story-goal.on') && 'the goal line', v('#g-menu') && 'the menu', v('#g-story-frames.on') && 'the roll', v('#gd') && 'a talk'].filter(Boolean), phase: window.__game.story.state.phase }; });
      if (t.cont == null || !new RegExp(`frame ${n}\\b`).test(t.cont)) bad(`the title's Continue is not at frame ${n} ("${t.cont}")`);
      if (t.left.length) bad(`back at the title, left over: ${t.left.join(', ')}`);
      if (loads && t.phase !== 'idle' && t.phase !== 'dressed') bad(`back at the title, the case is under way (${t.phase})`);
      console.log(`  the title again: Continue "${t.cont}", ${t.left.length ? `left over ${t.left.join(', ')}` : 'nothing left over'}`);
      await still('title');
      await clickEl('#gt-cont-go');
      for (let k = 0; k < 6 && await p.evaluate(() => document.getElementById('g-title').dataset.screen === 'who' && !document.getElementById('g-title').hidden); k++) { await clickEl('#gt-who [data-c="W"]'); await p.waitForTimeout(400); await clickEl('#gt-who-go'); await p.waitForTimeout(800); }
      if (!(await inCase())) bad(`Continue did not take the case up at frame ${n} (${await where()})`); else console.log(`ok   Title screen: out of frame ${n}, the title on its menu, and Continue back in frame ${n}`);
      await p.waitForTimeout(3000); await still('continued');
    }
    await b.close();
    process.exit(errors.length ? 1 : 0);
  }
  const state = () => p.evaluate(() => { const g = window.__game, s = g.story.state, d = document.getElementById('gd'); return { phase: s.phase, beat: s.beat, fi: s.fi, t: +s.t.toFixed(1), left: s.left, dlg: d && !d.hidden, choices: [...document.querySelectorAll('#gd-choices button')].map(x => x.textContent), goal: document.querySelector('#g-story-goal span').textContent, at: [+g.player.x.toFixed(1), +g.player.y.toFixed(1), +g.player.z.toFixed(1)] }; });
  // put the player a little short of a place, facing it, on the side they come from, however far (a fixed east beyond 60 m
  // put them in the air outside SHIBUYA SKY's east glass: its 46F lift stands 61 m from Kanbara)
  const goTo = (at, d = 1.6) => p.evaluate(([at, d]) => { const g = window.__game, pl = g.player; let dx = pl.x - at[0], dy = pl.y - at[1], l = Math.hypot(dx, dy); if (l < 0.5) { dx = 1; dy = 0; l = 1; } pl.x = at[0] + dx / l * d; pl.y = at[1] + dy / l * d; if (at[2] != null) pl.z = at[2] + 0.2; pl.h = Math.atan2(-dx, -dy); if (g.cam) g.cam.yaw = pl.h; }, [at, d]);
  // (and looking up or down at it, where it has a height: the lens looks 0.3 - cam.pitch above the level)
  const face = at => p.evaluate(at => { const g = window.__game, pl = g.player, d = Math.hypot(at[0] - pl.x, at[1] - pl.y); pl.h = Math.atan2(at[0] - pl.x, at[1] - pl.y); if (g.cam) { g.cam.yaw = pl.h; g.cam.pitch = at[2] != null ? Math.max(-0.25, Math.min(1.35, 0.3 - Math.atan2(at[2] - (pl.z + 1.6), d))) : 0.25; } }, at);
  const seen = new Set();
  const walkInto = async label => {
    const T = await p.evaluate(() => { const g = window.__game, pl = g.player, out = [], near = o => Math.hypot(o.x - pl.x, o.y - pl.y) < 14 && Math.abs((o.z || 0) - pl.z) < 1.5;
      if (pl.mode !== 'foot' || g.story.state.cam) return out;
      for (const f of g.storyFigs()) if (f.rig && f.rig.root.visible && near(f)) out.push({ name: f.name || f.character, x: f.x, y: f.y });
      for (const n of g.npcs || []) if (n.rig && n.rig.root.visible && !n.away && near(n)) out.push({ name: `npc ${n.name || n.id}`, x: n.x, y: n.y });
      const d = g.story.state.dog; if (d && d.ready && d.root && d.root.visible && near(d)) out.push({ name: 'the guide', x: d.x, y: d.y, guide: true });
      return out; });
    for (const t of T) {
      const r = await p.evaluate(t => new Promise(res => { const g = window.__game, pl = g.player, was = { x: pl.x, y: pl.y, z: pl.z, h: pl.h, yaw: g.cam && g.cam.yaw, pitch: g.cam && g.cam.pitch };
        let dx = pl.x - t.x, dy = pl.y - t.y, l = Math.hypot(dx, dy); if (l < 0.5) { dx = 1; dy = 0; l = 1; }
        pl.x = t.x + dx / l * 1.3; pl.y = t.y + dy / l * 1.3; pl.h = Math.atan2(-dx, -dy); if (g.cam) g.cam.yaw = pl.h;
        const ev = type => window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyW', key: 'w', bubbles: true }));
        ev('keydown'); let n = 50, min = 9;
        const who = () => { if (t.guide) { const d = g.story.state.dog; return d ? Math.hypot(d.x - pl.x, d.y - pl.y) : 9; } let m = 9; for (const f of g.storyFigs()) if ((f.name || f.character) === t.name) m = Math.min(m, Math.hypot(f.x - pl.x, f.y - pl.y)); for (const q of g.npcs || []) if (`npc ${q.name || q.id}` === t.name) m = Math.min(m, Math.hypot(q.x - pl.x, q.y - pl.y)); return m; };
        const f = () => { if (g.cam) g.cam.yaw = Math.atan2(t.x - pl.x, t.y - pl.y); min = Math.min(min, who()); if (--n > 0) requestAnimationFrame(f); else { ev('keyup'); const end = who(); window.__intoWas = was; if (g.cam) { g.cam.yaw = pl.h + 1.15; g.cam.pitch = 0.2; } res({ min: +min.toFixed(2), end: +end.toFixed(2) }); } }; // (seen from the side, where two bodies in one show)
        requestAnimationFrame(f); }), t);
      await frames(3); await snap(`into-${label.replace(/\D+/, '').replace(/ /g, '-')}-${t.name.replace(/[^A-Za-z]+/g, ' ').trim().replace(/ /g, '-').toLowerCase()}`);
      await p.evaluate(() => { const g = window.__game, pl = g.player, was = window.__intoWas; Object.assign(pl, { x: was.x, y: was.y, z: was.z, h: was.h }); if (g.cam) { g.cam.yaw = was.yaw; g.cam.pitch = was.pitch; } });
      console.log(`walked into ${t.name} at ${label}: nearest ${r.min} m from their middle, stopped at ${r.end} m`);
      if (!t.guide && r.min < clipProbe.NEAR) { errors.push(`walked into ${t.name} at ${label}: the player came to ${r.min} m from their middle (a body is ${clipProbe.NEAR} m)`); console.log(errors[errors.length - 1]); }
    }
    await frames(3);
  };
  // (a beat's still was taken 1.2 s after the beat was seen, for the picture to settle; MARKWAIT=ms: another wait)
  const MARKWAIT = +(process.env.MARKWAIT ?? 1200);
  // (one light standing in the street at a time: at every beat's still, the story's own and no other; the free game's
  // objective column stood beside it over the Center Gai arch and SHIBUYA SKY's door)
  const mark = async (s, name) => { const k = `${s.fi}-${name}`; if (seen.has(k)) return; seen.add(k); console.log(k, JSON.stringify(s)); await p.waitForTimeout(MARKWAIT); await snap(`${s.fi + 1}-${name}`);
    if (s.phase === 'stop' && !seen.has(`heads-${s.fi}`)) { seen.add(`heads-${s.fi}`); // (time held: no head turns by itself; a look laid over a look wound Aoi's head round by the Center Gai arch)
      const hs = await p.evaluate(() => new Promise(r => { const g = window.__game, T = window.THREE, rigs = (g.npcs || []).filter(n => n.rig && n.rig.head && n.rig.root.visible).map(n => [n.id, n.rig]).concat(g.player && g.player.rig && g.player.rig.head ? [['player', g.player.rig]] : []);
        const was = rigs.map(([, q]) => q.head.getWorldQuaternion(new T.Quaternion())), worst = rigs.map(() => 0); let n = 12;
        const f = () => { rigs.forEach(([, q], i) => { const now = q.head.getWorldQuaternion(new T.Quaternion()); worst[i] = Math.max(worst[i], was[i].angleTo(now)); was[i].copy(now); }); if (--n > 0) requestAnimationFrame(f); else r(rigs.map(([id], i) => [id, +worst[i].toFixed(3)])); };
        requestAnimationFrame(f); }));
      const spun = hs.filter(([, a]) => a > 0.05);
      if (spun.length) { errors.push(`frame ${s.fi + 1} ${name}: with time held, a head turns by itself: ${JSON.stringify(spun)}`); console.log(errors[errors.length - 1]); } }
    const L = await p.evaluate(() => (window.__game.lights ? window.__game.lights() : null)); if (L && L.objective) { errors.push(`frame ${s.fi + 1} ${name}: a second light stands in the street (the free game's objective)`); console.log(errors[errors.length - 1]); } };
  const LOGAT = +(process.env.LOGAT || 3), LOGSECS = +(process.env.LOGSECS || 0);
  // (SLIP=3,5,6,7: each of those frames in one play; slipAt: how far the frame being played has got, 0, 1 in hand, 2 done)
  const SLIPS = (process.env.SLIP || '').split(',').map(Number).filter(Boolean), slipAt = {}, FIRST = {};
  let afterFail = null;
  const CHOOSE = {}, chose = {}; for (const q of ((process.env.ACCUSE ? '3:0,' : '') + (process.env.CHOOSE || '')).split(',')) { const [f, o] = q.split(':').map(Number); if (f) CHOOSE[f] = o; }
  let slipped = 0, told0 = null, spent = false, logged = !!process.env.FROM, logWas = null, big = 0;
  const t0 = Date.now(); let done = false, last = '', same = 0, beatT = 0, tWas = 0, still = 0;
  // the game's next frames run: what a frame sets (the mark, the goal) is read after it, however long a frame takes
  // every question with a right answer costs something to guess at (q.fail): one that does not can be answered by
  // trying each print in turn, and asks nothing of the player (Mr Tanaka's pitch, until it had one)
  { const E = ((JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'cities', 'shibuya', 'city.json'), 'utf8')).game || {}).story) || null;
    for (const ep of (E && E.episodes) || []) (ep.frames || []).forEach((f, i) => { for (const m of [f.meet, f.afterimage, f.task]) for (const q of (m && m.ask) || []) { if (q.fail && m.lines && m.lines.length) { const l = m.lines[0]; FIRST[i] = typeof l === 'string' ? l : l.say; } if ((q.frame || q.answer != null) && !q.fail && !(q.told && q.wrong2 && q.file)) errors.push(`frame ${i + 1}: "${q.q}" has a right answer and nothing lost by guessing (fail; or told, wrong2 and file)`); } }); }
  const frames = n => p.evaluate(n => new Promise(r => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); }), n);
  let upto = +process.env.UPTO || 0, proved = 0;
  // the roll as the case board: the first two prints set side by side must say something, and it must be on the file
  // (by touch it is done on the street once two prints are on the roll, where a finger can reach the roll: under the last
  // card its button cannot be tapped)
  let boarded = false;
  const rollBoard = async () => {
    boarded = true;
    await clickEl('#g-story-frames'); await p.waitForTimeout(TOUCH ? 600 : 0); for (const k of [0, 1]) await clickEl(`#g-story-album button[data-c="${k}"]`);
    const r = await p.evaluate(() => { const st = window.__game.story.state; return { pairs: st.pairs.length, hit: !!document.querySelector('#g-story-album .versus.hit'), file: document.querySelectorAll('#g-story-album .file li').length, filed: st.file.length }; });
    if (!r.pairs || !r.hit || r.file !== r.filed || r.file < 1) { errors.push(`the roll: frames 1 and 2 side by side found ${r.pairs} pairs (shown: ${r.hit}), and the file shows ${r.file} of ${r.filed} lines`); console.log(errors[errors.length - 1]); }
    await p.evaluate(() => { const f = document.querySelector('#g-story-album .file'); if (f) f.scrollIntoView({ block: 'center' }); });
    await snap('roll-file'); await p.evaluate(() => document.querySelector('#g-story-album .table').scrollIntoView({ block: 'start' })); await snap('roll-versus');
    await clickEl('#g-story-album button[data-do="close"]');
  };
  const play = async () => {
  while (Date.now() - t0 < (+process.env.LIMIT || 1500) * 1000) {
    const s = await state();
    // walked into (issue 126): once the talk is over and the player is free (on the way to where the world stops, and in
    // the Stop before the camera is raised), each of the story's people, the guide and the map's NPCs within 14 m is walked
    // straight at from 1.3 m, the key held; the player must stop at their shoulder. Then the player is put back.
    if (!s.dlg && ((s.phase === 'go' && s.beat === 'approach') || (s.phase === 'stop' && s.beat === 'shoot')) && !seen.has(`into-${s.fi}-${s.phase}`)) { seen.add(`into-${s.fi}-${s.phase}`); await walkInto(`frame ${s.fi + 1} ${s.phase} ${s.beat}`); }
    if (s.phase === 'done') { done = true; break; }
    // (the opening shots, before the first card, are not stuck while their camera still moves: on a software renderer
    // they take many minutes of frames, and were counted as a dead end)
    const film = s.phase === 'dressed' ? await p.evaluate(() => { const c = window.__game.camera; return c ? `${Math.round(c.position.x * 4)},${Math.round(c.position.y * 4)},${Math.round(c.position.z * 4)}` : ''; }) : '';
    if (upto && process.env.AFTER && s.fi >= upto) { done = true; break; } // (AFTER=1: what is said after frame n's print, and the call after it, played too)
    const key = `${s.phase}/${s.beat}/${s.fi}/${s.dlg}/${film}`; same = key === last ? same + 1 : 0; last = key;
    // (stuck by the story's own clock, which a slow machine runs slow: two minutes of it in one beat, or a clock that
    // has not moved at all; the last frame's meeting, 40 s of the story, was 240 looks long at a sixth of the pace)
    if (!same) { beatT = tWas = s.t; still = 0; } else { still = s.t === tWas ? still + 1 : 0; tWas = s.t; }
    if (same > 240 && (s.t - beatT > 120 || still > 240 || same > 2400)) { console.log('FAIL stuck', JSON.stringify(s)); console.log('  up on the screen:', await p.evaluate(() => [...document.querySelectorAll('#g-story-album.on, #g-story-log.on, #g-story-fail.on, #g-story-spend.on, #g-story-end.on, #g-story-order.on, #g-menu:not([hidden]), .g-overlay:not([hidden]), #gd:not([hidden])')].map(e => `${e.id || e.className}${e.id === 'gd' ? `: "${(document.getElementById('gd-text').textContent || '').slice(0, 60)}", ${document.querySelectorAll('#gd-choices button').length} answers` : ''}`).join('; ') || 'nothing of the story\'s')); break; }
    // (issue 114: one line is said over the picture at a time, hud.js)
    if (!seen.has('two-said')) { const two = await p.evaluate(() => [...document.querySelectorAll('#g-toasts > .g-toast')].map(e => e.textContent.slice(0, 50))); if (two.length > 1) { seen.add('two-said'); errors.push(`frame ${s.fi + 1}: ${two.length} lines said over the picture at once: ${two.join(' | ')}`); console.log(errors[errors.length - 1]); await snap(`${s.fi + 1}-two-said`); } }
    // seen through: the card is up; the frame is taken up again
    if (await p.evaluate(() => document.getElementById('g-story-fail').classList.contains('on'))) {
      if (s.fi === 6) { errors.push('frame 7: seen through, and the frame taken up again: the summation is never lost'); console.log(errors[errors.length - 1]); }
      slipped = slipAt[s.fi + 1] = 2; console.log(`frame ${s.fi + 1}: seen through`); await p.waitForTimeout(900); await snap(`${s.fi + 1}-seen-through`); // (once the card has come up whole)
      // (issue 93: the card says what it cost, and the talk is taken up at the question: nothing said before it is said
      // again, nobody has moved, the file has the line against the player. At frame 5 the card's second button, the roll
      // and the file first, and the question asked when they are shut)
      const was = await p.evaluate(() => { const g = window.__game, st = g.story.state, e = st.file[st.file.length - 1] || {}, C = document.querySelector('#g-story-fail .card'); return { phase: st.phase, fi: st.fi, heard: window.__heard.lines.length, at: [g.player.x, g.player.y], last: { text: e.text || '', wrong: !!e.wrong, struck: !!e.struck }, paid: (C.querySelector('.paid') || {}).textContent || '', buttons: [...C.querySelectorAll('button')].map(b => b.textContent.trim()), fits: C.getBoundingClientRect().bottom <= innerHeight + 1 && C.getBoundingClientRect().top >= -1 && [...C.querySelectorAll('button')].every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; }), left: Math.round((st.fr.stop_s || 420) - st.t) }; });
      console.log(`  the card: "${was.paid}"; ${was.buttons.join(' | ')}; in the file: "${was.last.text.slice(0, 70)}"${was.phase === 'stop' ? `; the Stop has ${was.left} s left` : ''}`);
      const bad = m => { errors.push(`frame ${s.fi + 1}: seen through, and ${m}`); console.log(errors[errors.length - 1]); };
      if (!was.last.wrong || !was.last.struck) bad('nothing is written in the file against the player');
      if (!/file/.test(was.paid) || (was.phase === 'stop' && !/Stop/.test(was.paid))) bad(`the card does not say what it cost ("${was.paid}")`);
      if (!was.fits) bad('the card does not fit the screen');
      const roll = s.fi === 4 && was.buttons.length > 1, tapAt = async sel => { const r = await p.locator(sel).first().boundingBox(); if (w < 500 && r) await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); else await p.evaluate(sel => document.querySelector(sel).click(), sel); };
      await tapAt(roll ? '#g-story-fail [data-fail="roll"]' : '#g-story-fail [data-fail="go"]'); await p.waitForTimeout(600);
      if (roll) {
        const on = await p.evaluate(() => document.getElementById('g-story-album').classList.contains('on'));
        if (!on) bad('the roll and the file did not open from the card'); else { await snap(`${s.fi + 1}-seen-through-roll`); await tapAt('#g-story-album button[data-do="close"]'); await p.waitForTimeout(600); }
      }
      afterFail = was; continue;
    }
    if (TOUCH && !boarded && s.phase === 'go' && !s.dlg && (s.beat === 'approach' || s.beat === 'meet') && await p.evaluate(() => { const P = window.__game.story.state.prints; return P.length >= 2 && !P.slice(0, 2).some(q => q.plain) && !document.querySelector('#g-story-album.on'); })) { await rollBoard(); await p.waitForTimeout(500); continue; }
    // after frame 3: the log has every line said so far, in order
    if (!logged && s.fi >= LOGAT) {
      logged = true;
      const r = await p.evaluate(() => { const L = window.__game.story && document.getElementById('g-story-log'); window.__game.storyLog.show(true); const e = window.__game.storyLog.entries; return { on: !!L && L.classList.contains('on'), lines: e.filter(q => q.kind === 'line' || q.kind === 'q').map(q => q.text), answers: e.filter(q => q.kind === 'a').length, shown: document.querySelectorAll('#g-story-log li:not(.fr)').length, n: e.length, heard: window.__heard.lines.slice() }; });
      const miss = r.heard.findIndex((x, i) => r.lines[i] !== x);
      console.log(`log after frame 3: ${r.lines.length} lines, ${r.answers} answers; heard ${r.heard.length}`);
      if (!r.on || r.shown !== r.n || r.lines.length !== r.heard.length || miss >= 0) { errors.push(`the log after frame 3: ${r.on ? '' : 'not open; '}${r.shown} of ${r.n} shown; ${r.lines.length} lines for ${r.heard.length} heard${miss >= 0 ? `; line ${miss + 1} is "${(r.lines[miss] || '').slice(0, 60)}" for "${r.heard[miss].slice(0, 60)}"` : ''}`); console.log(errors[errors.length - 1]); }
      // (issue 114: the log is read by itself. Its still is of the sheet once it has come up, not of the 0.35 s it takes
      // to; and nothing said on the picture is seen under it or over it: the line being said is the log's last entry)
      await p.waitForFunction(() => { const L = document.getElementById('g-story-log'); return L.getAnimations().every(a => a.playState === 'finished'); }, null, { timeout: 20000, polling: 200 }).catch(() => {}); await p.waitForTimeout(300);
      { const under = await p.evaluate(() => ['#gd', '#g-story-goal', '#g-toasts', '#g-story-slip', '#g-story-chip'].filter(q => { const e = document.querySelector(q); if (!e || e.hidden) return false; const c = getComputedStyle(e); return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.05 && e.textContent.trim() && e.getClientRects().length; }));
        if (under.length) { errors.push(`with the log open, still drawn with it: ${under.join(', ')}`); console.log(errors[errors.length - 1]); } }
      await snap('log'); for (let k = 1; k <= LOGSECS; k++) { await p.waitForTimeout(1000); await snap(`log-${k}s`); } await p.evaluate(() => { const o = document.querySelector('#g-story-log ol'); o.firstElementChild.scrollIntoView({ block: 'start' }); }); await snap('log-top');
      await p.evaluate(() => window.__game.storyLog.setWords({ size: 2, solid: true })); await snap('log-largest');
      await p.evaluate(() => window.__game.storyLog.show(false)); await p.waitForTimeout(600); await snap('goal-largest'); big = 1;
      logWas = r.lines;
      if (process.env.LOGRELOAD) { // the page opened again in the middle of the case: the log is as it was
        expectReload(p, 'LOGRELOAD: the page opened again in the middle of the case'); await p.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
        await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
        await p.waitForTimeout(1500); await listen(); await begin();
        await p.waitForFunction(() => !['idle', 'dressed'].includes(window.__game.story.state.phase), null, { timeout: 900000, polling: 500 });
        const back = await p.evaluate(() => window.__game.storyLog.entries.filter(q => q.kind === 'line' || q.kind === 'q').map(q => q.text));
        const f = await p.evaluate(() => window.__game.story.state.fi), want = logWas.length; // (frame 4 begun: what was said before it)
        console.log(`log after a reload at frame ${f + 1}: ${back.length} lines (were ${want})`);
        if (back.length < want - 0 || back.slice(0, want).some((x, i) => x !== logWas[i])) { errors.push(`the log after a reload: ${back.length} lines, were ${want}`); console.log(errors[errors.length - 1]); }
        await p.evaluate(n => { window.__heard.lines = window.__game.storyLog.entries.filter(q => q.kind === 'line' || q.kind === 'q').map(q => q.text).slice(0, n); }, want);
        await p.evaluate(() => window.__game.storyLog.setWords({ size: 2, solid: true }));
      }
      continue;
    }
    // The last frame's rain (story.js rain(), the frame's rain_on): the cloud lowers while the player crosses to her, the
    // first drops come on her first word, and the crowd's umbrellas go up one by one behind her as she speaks. Stills as
    // it comes on, by the world's own clock. It fails rain before she spoke, umbrellas up in the moment it began, most of
    // them up within five seconds (the switch it was until November 2026: nine in ten in one frame), or few after twenty
    if (s.dlg && s.fi === 6 && s.phase === 'go' && s.beat === 'talk' && !seen.has('rain-on')) {
      seen.add('rain-on');
      const W = () => p.evaluate(() => { const g = window.__game, S = window.OEWeather.S; let up = 0, opening = 0, n = 0;
        for (const q of g.crowd.P) if (q.umbAt != null && Math.abs(q.umbAt - S.t) < 0.5) { n++; if (q.umbT > 0) up++; if (q.umbT > 0 && q.umbT < 1) opening++; }
        return { t: S.t, rain: S.rain, cloud: S.cover, wet: S.wet, up, opening, n }; });
      const row = (at, q) => console.log(`frame 7, rain at ${at} s: rain ${q.rain.toFixed(2)}, cloud ${q.cloud.toFixed(2)}, street wet ${q.wet.toFixed(2)}, umbrellas ${q.up} up (${q.opening} opening) of ${q.n} people`);
      const w0 = await W(); row(0, w0); await snap('7-rain-0s');
      if (w0.rain > 0.1 || w0.up > 0) { errors.push(`frame 7: it rained before she spoke (rain ${w0.rain.toFixed(2)}, ${w0.up} umbrellas up)`); console.log(errors[errors.length - 1]); }
      const R = {};
      for (const at of [5, 10, 20]) { await p.waitForFunction(t => window.OEWeather.S.t >= t, w0.t + at, { timeout: 900000, polling: 250 }); R[at] = await W(); row(at, R[at]); await snap(`7-rain-${at}s`); }
      if (R[20].rain < 0.5 || R[20].up < 0.6 * R[20].n) { errors.push(`frame 7: twenty seconds after her first word the rain is ${R[20].rain.toFixed(2)} and ${R[20].up} of ${R[20].n} umbrellas are up`); console.log(errors[errors.length - 1]); }
      // (and each umbrella is held: its handle at its hand, its shaft clear of the body under it, no canopy in another
      // or in a head, measured of everyone drawn near the lens: issue 165, tools/umbrella_held.js)
      { const U = await umbrellaHeld(p, { label: 'frame 7, twenty seconds into the rain', held: true, loose: true, within: 14 }); for (const l of U.lines) console.log(l); if (U.none) errors.push('frame 7: the page has no umbrella report to measure'); for (const b of U.bad) errors.push(`frame 7's rain: ${b}`); }
      if (R[5].up > 0.5 * R[20].up) { errors.push(`frame 7: ${R[5].up} umbrellas up five seconds after the first drops, of ${R[20].up} at twenty: all at once, not one by one`); console.log(errors[errors.length - 1]); }
      continue;
    }
    // (a call is heard, not answered, hud.js dialogue `auto`: at the office's call nothing is pressed, and its first line
    // must go on by itself. It waited on a key at every line, and one player sat on it for twenty-five minutes)
    if (s.dlg && (s.beat === 'prologue' || (s.phase === 'go' && s.beat === 'job')) && !seen.has('call-auto')) { // (the office's call: since the opening was rebuilt, said hands-free in the first frame's job)
      seen.add('call-auto'); await snap(`${s.fi + 1}-call`);
      const was = await p.evaluate(() => document.getElementById('gd-text').textContent);
      const went = await p.waitForFunction(w => { const d = document.getElementById('gd'), t = document.getElementById('gd-text').textContent; return d.hidden || (!t.startsWith(w) && !w.startsWith(t)); }, was, { timeout: 240000, polling: 250 }).then(() => true, () => false);
      console.log(`the office's call, nothing pressed: ${went ? 'its first line went on by itself' : 'it waited on a key'}`);
      if (!went) { errors.push("the office's call waited on a key: a call goes on by itself"); console.log(errors[errors.length - 1]); }
      continue;
    }
    if (s.dlg) {
      { const who =await p.evaluate(() => ((document.getElementById('gd-name') || {}).textContent || '').replace(/[^A-Za-z]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 24)); await mark(s, `said-${s.phase}-${s.beat}${who ? `-${who}` : ''}`); }
      // (the speaker's face moves while they speak: web/game/face.js, issue 12; a voice with nobody in the shot is not asked)
      for (let k = 0, f = null; k < 4 && (!f || !f.on); k++) { if (k) await new Promise(r => setTimeout(r, 300)); f = await p.evaluate(() => { const g = window.__game, sp = g && g.talkCam && g.talkCam.talk && g.talkCam.talk.speaker; if (!sp || !g.faces) return null; for (const [r, o] of g.faces()) if (o.talk) return { on: true, n: Object.values(r.face.state.shapes).filter(x => x > 0.01).length }; return { on: false, name: sp.name }; });
        if (!f) break; if (f.on) console.log(`  the face moves (${f.n} shapes on)`); else if (k === 3) console.log(`  NOTE frame ${s.fi + 1}: ${f.name}'s face does not move while they speak (a stand-in still loading, or no face: tools/face_check.js fails it)`); }
      // (a still for each speaker in a beat, not only the first: frame 5 has the office's call on the roof, then the sister's message)
      if (big === 1) { big = 2; await snap(`${s.fi + 1}-words-largest`); await p.evaluate(() => window.__game.storyLog.setWords({ size: 0, solid: false })); } // (the words at their largest, on their backing; then as they were)
      if (s.choices.length) { await p.waitForTimeout(400); /* (an answer takes no click in its first 0.35 s on the screen: hud.js) */ if (!seen.has(`ask-${s.fi}-${s.phase}`) && await p.evaluate(() => !!document.querySelector('#gd-choices .pr'))) { seen.add(`ask-${s.fi}-${s.phase}`); await snap(`${s.fi + 1}-show-a-print`); } // (a question answered with a print: the roll laid out)
        for (const [cls, name] of [['said', 'press'], ['who', 'name']]) if (!seen.has(`${name}-${s.fi}`) && await p.evaluate(c => !!document.querySelector(`#gd-choices .${c}`), cls)) { seen.add(`${name}-${s.fi}`); await snap(`${s.fi + 1}-${name}`); } // (a statement to press, his own words; one of the case's people to name)
        // (the summation's record at hand, story.js atHand: once, the roll and the file opened from inside a question, a still
        // of them over it, and closed again; the question must be asked again, with the same answers)
        if (s.fi === 6 && !seen.has('at-hand') && await p.evaluate(() => !!document.querySelector('#gd-choices .look'))) {
          seen.add('at-hand');
          const q0 = await p.evaluate(() => document.getElementById('gd-text').textContent);
          await clickEl('#gd-choices button:has(.look)');
          await p.waitForTimeout(900); await snap('7-roll-at-hand');
          const on = await p.evaluate(() => document.getElementById('g-story-album').classList.contains('on'));
          await clickEl('#g-story-album [data-do="close"]');
          await p.waitForFunction(() => document.querySelectorAll('#gd-choices button').length > 0, null, { timeout: 120000, polling: 250 }).catch(() => {});
          const q1 = await p.evaluate(() => document.getElementById('gd-text').textContent);
          console.log(`frame 7: the roll and the file at hand from a question: ${on ? 'opened' : 'NOT opened'}; the question asked again: ${q1 === q0 ? 'yes' : `no ("${q1.slice(0, 60)}")`}`);
          if (!on || q1 !== q0) { errors.push('frame 7: the roll and the file from inside a question did not open, or the question was not asked again'); console.log(errors[errors.length - 1]); }
          continue;
        }
        // (SILENT=n: a question someone waits on at frame n, story.js waitTick, is left unanswered: its line runs down, the
        // player has said nothing, and that is answered and kept as an answer is)
        if (+process.env.SILENT === s.fi + 1 && !seen.has('silent') && await p.evaluate(() => !!window.__game.story.state.waitQ)) {
          seen.add('silent'); await p.waitForTimeout(4000); await snap(`${s.fi + 1}-waiting`);
          await p.waitForFunction(() => !window.__game.story.state.waitQ, null, { timeout: 900000, polling: 500 });
          const r = await p.evaluate(() => ({ flags: window.__game.story.state.flags, file: window.__game.story.state.file.map(e => e.text).slice(-1)[0] || '' }));
          console.log(`frame ${s.fi + 1}: said nothing; the wait ran out; in the file: "${r.file.slice(0, 90)}"`);
          if (!r.flags.withheld || !/said nothing/.test(r.file)) { errors.push(`frame ${s.fi + 1}: the wait ran out, and silence was not taken as an answer`); console.log(errors[errors.length - 1]); }
          continue;
        }
        if (afterFail) { // (asked again where it was lost: issue 93)
          const was = afterFail; afterFail = null;
          const now = await p.evaluate(n => { const g = window.__game, st = g.story.state; return { phase: st.phase, beat: st.beat, fi: st.fi, said: window.__heard.lines.slice(n) }; }, was.heard);
          const at = await p.evaluate(() => [window.__game.player.x, window.__game.player.y]), moved = Math.hypot(at[0] - was.at[0], at[1] - was.at[1]);
          const again = now.said.filter(l => FIRST[s.fi] && l === FIRST[s.fi]).length;
          console.log(`frame ${s.fi + 1}: asked again at the question: ${now.said.length} lines since the card (${now.said.map(l => `"${String(l).slice(0, 40)}"`).join(', ')}), ${moved.toFixed(1)} m moved`);
          if (now.phase !== was.phase || now.fi !== was.fi || now.beat !== 'talk' || again || now.said.length > 4 || moved > 1.5) { errors.push(`frame ${s.fi + 1}: seen through, and not taken up at the question (${now.phase}/${now.beat}, ${now.said.length} lines, the talk's first line again: ${again}, ${moved.toFixed(1)} m moved)`); console.log(errors[errors.length - 1]); }
        }
        if (slipped === 2 && !slipAt[s.fi + 1]) { slipped = 0; told0 = null; } // (another frame of SLIP's list)
        const slip = SLIPS.includes(s.fi + 1) && slipped < 2 && await p.evaluate(() => !!window.__game.story.state.canFail && window.__game.story.state.want >= 0);
        if (slip) { slipped = slipAt[s.fi + 1] = 1; told0 = told0 ?? await p.evaluate(() => window.__game.story.state.told || 0); }
        { const pv = await p.evaluate(() => !!window.__game.story.state.proving); if (pv) proved++; const k = `summation-${pv ? 'evidence' : 'words'}`; if (s.fi === 6 && !seen.has(k)) { seen.add(k); await snap(`7-${k}`); } } // (the summation: the roll laid out with its pairs, then the words)
        // (#186 C: the summation's first question, the right name and then the roof's print, which is not the proof: she
        // must answer for what that print says and what it does not, `wrong_print_by`, never only "not that picture";
        // then it is answered rightly. Not with SLIP=7, which counts its own wrong answers)
        if (s.fi === 6 && !SLIPS.includes(7) && !seen.has('print-speaks') && await p.evaluate(() => { const st = window.__game.story.state; return !!st.proving && (st.asked | 0) === 0; })) {
          seen.add('print-speaks');
          const r = await p.evaluate(() => { const st = window.__game.story.state, q = (st.fr.meet.ask || [])[0] || {}, A = [...document.querySelectorAll('#gd-choices button')], b = A.find(e => (e.querySelector('b') || {}).textContent === '4'); return { i: A.indexOf(b), want: (q.wrong_print_by || {})[4] || '', n: window.__heard.lines.length }; });
          if (r.i < 0 || !r.want) { errors.push(`frame 7: the summation's first question has no roof's print to show wrongly, or no line for it (${JSON.stringify(r)})`); console.log(errors[errors.length - 1]); }
          else {
            await clickEl('#gd-choices button', r.i);
            await p.waitForFunction(n => window.__heard.lines.length > n, r.n, { timeout: 120000, polling: 250 }).catch(() => {});
            const heard = await p.evaluate(n => window.__heard.lines.slice(n), r.n);
            await snap('7-print-speaks');
            console.log(`frame 7: the right name on the roof's print: ${JSON.stringify(heard)}`);
            if (!heard.some(l => String(l).includes(r.want.slice(0, 40)))) { errors.push(`frame 7: the roof's print, shown wrongly, was not answered for what it says: ${JSON.stringify(heard)}`); console.log(errors[errors.length - 1]); }
          }
          await p.waitForTimeout(350); continue;
        }
        { // (CHOOSE=3:0,4:0: at that frame's question with no right answer, that option; ACCUSE=1 is 3:0, the false solution said aloud)
          const pick = await p.evaluate(([slip, choose]) => { const st = window.__game.story.state, A = [...document.querySelectorAll('#gd-choices button')], B = A.filter(b => !b.querySelector('.look')); const free = !st.canFail && choose != null && B.length > choose; const b = free ? B[choose] : B[slip ? (st.want + 1) % B.length : st.want] || B[0]; return { i: A.indexOf(b), free, text: b ? b.textContent.slice(0, 60) : '' }; }, [slip, CHOOSE[s.fi + 1] != null && !chose[s.fi + 1] ? CHOOSE[s.fi + 1] : null]);
          if (pick.free) { chose[s.fi + 1] = pick.text; console.log(`frame ${s.fi + 1}: chose "${pick.text}"`); }
          await clickEl('#gd-choices button', pick.i);
        } // (story.js says which answer is right: state.want; a slip is the next answer, never the roll)
        // (the summation is never lost: answered wrongly three times, she says it herself, and the play goes on rightly)
        if (slipped === 1 && told0 != null && await p.evaluate(t => (window.__game.story.state.told || 0) > t, told0)) { slipped = slipAt[s.fi + 1] = 2; console.log(`frame ${s.fi + 1}: answered wrongly three times; she said it herself`); await snap(`${s.fi + 1}-told`); }
      }
      else await press('KeyE');
      await p.waitForTimeout(350); continue;
    }
    // a frame whose way goes up from a lift's stop by an escalator (frame 4, SHIBUYA SKY's 46F): the way found from the
    // stop rides no escalator against its steps (tools/escalator_route.js), and a still from where the lift lets you out
    // shows the line going the way that does (it once led right, beside the escalator that runs down)
    if (s.phase === 'go' && !s.dlg && !seen.has(`lift-${s.fi}`)) {
      const st = await p.evaluate(() => {
        const g = window.__game, fr = g.story.state.fr || {}, nav = g.nav, MOV = nav.strips.filter(q => q.moving_ms);
        const t0 = g.story.state.target, t = t0 ? [t0[0], t0[1], t0[3] != null ? t0[3] : t0[2]] : fr.stop_at || (fr.afterimage && fr.afterimage.at); // (x, y, z)
        if (!t || !MOV.length || (t[2] != null && Math.abs(t[2] - g.player.z) < 12)) return null; // (up there already: frame 5's helicopter, on the roof)
        for (const l of g.G.lifts || []) for (const q of l.stops) {
          const [x, y, z] = q.at, tz = t[2] != null ? t[2] : 0;
          if (Math.hypot(t[0] - x, t[1] - y) < 120 && tz > z + 2 && MOV.some(m => Math.hypot(m.origin[0] - x, m.origin[1] - y) < 15 && Math.abs(m.zs[0] - z) < 12)) return { at: q.at, face: q.face || null, name: q.name, lift: l.id, stop: l.stops.indexOf(q) };
        }
        return null;
      });
      if (st) { // (once the target is up there: the first goal of the frame is the lift at the street)
        seen.add(`lift-${s.fi}`);
        const r = await escalators(p);
        for (const l of r.lines) { console.log(`frame ${s.fi + 1}: ${l}`); if (l.startsWith('FAIL')) errors.push(`frame ${s.fi + 1}: ${l}`); }
        // The ride itself, as a player takes it (issue 99: the player was put at the top, and the stills there were of a camera
        // this harness had set): stood in the lift's hall at the street, the prompt's own action, stills along the shot
        // (cine.seek puts it at each, rather than playing it at a software renderer's pace), and then the view the game hands
        // over to, as it leaves it. The camera's way up must be clear of every building, and it must end beside you.
        const hall = await p.evaluate(st => { const g = window.__game, l = g.G.lifts.find(q => q.id === st.lift), s = l.stops[st.stop ? 0 : l.stops.length - 1], [ax, ay, az] = s.at, [dx, dy] = s.door || [ax - 1, ay], n = Math.hypot(ax - dx, ay - dy) || 1, pl = g.player; pl.x = ax - (ax - dx) / n * 1.2; pl.y = ay - (ay - dy) / n * 1.2; pl.z = az; pl.h = Math.atan2(ax - dx, ay - dy); pl.speed = 0; pl.vz = 0; pl.ground = true; g.cam.yaw = pl.h; g.cam.pitch = 0.17; g.cam.snap = true; return s.name; }, st);
        await p.waitForFunction(() => { const a = window.__game.currentAction(); return !!a && /lift/i.test(a.text || ''); }, null, { timeout: 300000, polling: 300 }).catch(() => {}); // (the hall is a level fetched as you come to it)
        await frames(4); await snap(`${s.fi + 1}-lift-hall`);
        const took = await p.evaluate(() => { const a = window.__game.currentAction(); if (!a || !/lift/i.test(a.text || '') || !a.act) return a ? a.text : 'no action'; a.act(); return 'ok'; });
        if (took !== 'ok') { errors.push(`frame ${s.fi + 1}: in the hall at ${hall} the lift is not offered ("${took}")`); console.log(errors[errors.length - 1]); }
        else {
          await p.waitForFunction(() => window.__game.cine.active, null, { timeout: 60000, polling: 100 }).catch(() => {});
          await frames(2);
          let last = null;
          for (const [n, k] of [0.06, 0.2, 0.34, 0.47, 0.6, 0.7, 0.78, 0.84, 0.93].entries()) {
            // (a seek is taken only once the shot has begun, web/cine.js: asked again until it has come to k. Under load the
            // shot had not begun at the first four, and the line from the street's sample to the one at 191 m ran through
            // Scramble Square, a way the camera never went: main's storyp on 2f1b4cb, issue 181)
            await p.waitForFunction(k => { const c = window.__game.cine; if (!c.active) return true; c.seek(k); return Math.abs(c.k - k) < 0.05; }, k, { timeout: 60000, polling: 250 }).catch(() => {});
            await frames(2); await snap(`${s.fi + 1}-lift-ride${n ? `-${n}` : ''}`);
            const c = await p.evaluate(last => { const g = window.__game, c = g.camera.position, T3 = window.THREE; return { k: +g.cine.k.toFixed(2), at: [c.x, -c.z, c.y].map(v => +v.toFixed(1)), z: +g.player.z.toFixed(1), clear: last ? +g.nav.clearFraction(new T3.Vector3(last[0], last[2], -last[1]), c).toFixed(2) : 1 }; }, last);
            console.log(`frame ${s.fi + 1} lift ride:`, JSON.stringify(c));
            // (the climb itself: past 0.8 the shot hands over to the chase camera, which stands clear of your head by its own
            // rule, and a straight line between two stills there cuts the corner the shot goes round)
            if (c.clear < 0.99 && c.k <= 0.8) { errors.push(`frame ${s.fi + 1}: the lift's shot goes through a building between ${last} and ${c.at}`); console.log(errors[errors.length - 1]); }
            last = c.at;
          }
          await p.waitForFunction(() => !window.__game.cine.active, null, { timeout: 180000, polling: 200 }).catch(() => {});
          await p.waitForFunction(() => !window.__game.player.auto, null, { timeout: 120000, polling: 200 }).catch(() => {}); // (the steps out of the doors)
          await frames(4); await p.waitForTimeout(1500);
          const up = await p.evaluate(st => { const pl = window.__game.player; return Math.hypot(pl.x - st.at[0], pl.y - st.at[1], pl.z - st.at[2]); }, st);
          console.log(`frame ${s.fi + 1}: out of the lift ${up.toFixed(1)} m from its stop`);
          if (up > 4.5) { errors.push(`frame ${s.fi + 1}: the lift did not set you down at ${st.name} (${up.toFixed(1)} m off)`); console.log(errors[errors.length - 1]); }
        }
        await p.evaluate(st => { const g = window.__game, pl = g.player; if (Math.hypot(pl.x - st.at[0], pl.y - st.at[1], pl.z - st.at[2]) > 4.5) { [pl.x, pl.y, pl.z] = st.at; pl.vz = 0; pl.ground = true; if (st.face) pl.h = Math.atan2(st.face[0], st.face[1]); g.cam.yaw = pl.h; g.cam.seek = g.cam.snap = true; } }, st); // (the view is the game's own: where the lift set you down)
        // the way shown from the stop: the dog's while he leads (route.js's walk to the place, with no height, as companion.js
        // asks it: the top of what stands there), else the gold line (game.js's guide; __game.guide() hands back the guide).
        // It rides no escalator against its steps, and turns the way the one up stands: to the left of where the lift faces at
        // SHIBUYA SKY (the one to the right runs down)
        const guided = await p.evaluate(() => !!window.__game.story.guided);
        if (guided) await p.evaluate(st => { const g = window.__game, d = g.story.state.dog, t = g.story.state.target; if (d && t) { d.place(st.at[0] + (st.face ? st.face[1] : 0) * 0.8, st.at[1] - (st.face ? st.face[0] : 0) * 0.8, g.player.h); d.lead([t[0], t[1]], 3); } }, st);
        else for (let k = 0; k < 20 && !(await p.evaluate(() => (window.__game.guide().pts || []).length)); k++) { await frames(2); await p.waitForTimeout(300); }
        await frames(4); await p.waitForTimeout(1500);
        const way = await p.evaluate(([st, guided]) => {
          const g = window.__game, pl = g.player, t = g.story.state.target;
          let P = [];
          if (guided) { const r = t && g.ways.walk({ x: pl.x, y: pl.y, z: pl.z }, { x: t[0], y: t[1] }); P = r ? r.pts : []; } else P = g.guide().pts || [];
          let i0 = 0, bd = Infinity;
          P.forEach((q, i) => { const d = Math.hypot(q[0] - pl.x, q[1] - pl.y, q[2] - pl.z); if (d < bd) { bd = d; i0 = i; } });
          const ahead = P.slice(i0), fx = st.face ? st.face[0] : Math.sin(pl.h), fy = st.face ? st.face[1] : Math.cos(pl.h);
          const q = ahead.find(q => Math.hypot(q[0] - pl.x, q[1] - pl.y) > 6), side = q ? -(q[0] - pl.x) * fy + (q[1] - pl.y) * fx : 0;
          return { n: P.length, off: bd, against: g.ways.against(ahead), side, rides: g.nav.strips.filter(s => s.moving_ms && ahead.some(q => { const h = g.nav.stripHeight(s, q[0], q[1]); return h != null && Math.abs(h - q[2]) < 0.8; })).map(s => s.name) };
        }, [st, guided]);
        const what = guided ? "the dog's way" : 'the line';
        console.log(`frame ${s.fi + 1}: from ${st.name}, ${what} (${way.n} points, ${way.off.toFixed(1)} m from you) goes ${way.side > 0 ? 'left' : 'right'}, on ${way.rides.join(', ') || 'no escalator'}${way.against > 0.25 ? `, ${way.against.toFixed(1)} m against an escalator's steps` : ''}`);
        if (!way.n || way.off > 3) errors.push(`frame ${s.fi + 1}: from ${st.name} ${what} does not start where you stand (${way.n} points, ${way.off.toFixed(1)} m off)`);
        if (way.against > 0.25) errors.push(`frame ${s.fi + 1}: from ${st.name} ${what} rides an escalator ${way.against.toFixed(1)} m against its steps`);
        // (the stills a second apart, the dog setting off the way he leads; the view as the game left it)
        for (let k = 0; k < 3; k++) { await frames(4); await p.waitForTimeout(800); await snap(`${s.fi + 1}-lift-way${k ? `-${k}` : ''}`);
          // (issue 99: there the camera stood a metre over her head looking straight down at her hair, the frame round her one flat
          // blue. Where the lens is, by the rig's own account: beside her, not over her)
          const c = await p.evaluate(() => { const g = window.__game, c = g.camera.position, pl = g.player, r = v => +v.toFixed(2); g.cam.trace = {}; g.frame(0); const t = g.cam.trace; g.cam.trace = null; return { off: r(Math.hypot(c.x - pl.x, -c.z - pl.y)), over: r(c.y - pl.z), yaw: r(g.cam.yaw), swing: r(g.cam.swing || 0), lift: r(g.cam.lift), pull: r(g.cam.pull), f: r(t.f), want: t.wantLift, mode: g.cam.mode, pmode: pl.mode, cine: !!g.cine.active, fp: !!(g.cam.fp || g.cam.first) }; });
          console.log(`frame ${s.fi + 1} lift-way${k ? `-${k}` : ''} camera:`, JSON.stringify(c));
          if (c.off < 1.2 || c.over > 1.55 + 0.6 + c.off * 0.9) { errors.push(`frame ${s.fi + 1}: where the lift sets you down the camera is ${c.off} m from you and ${c.over} m over your feet (overhead: issue 99)`); console.log(errors[errors.length - 1]); }
          if (process.env.CAMTABLE && !k) console.log(await p.evaluate(() => { const g = window.__game, pl = g.player, T3 = window.THREE, a = new T3.Vector3(pl.x, pl.z + 1.55, -pl.y), b = new T3.Vector3(), rows = []; for (let i = 0; i < 16; i++) { const yaw = pl.h + i * Math.PI / 8, r = []; for (const lift of [0, 0.15, 0.3, 0.45, 0.6, 0.8]) { const pitch = 0.25 + lift, cp = Math.cos(pitch); b.set(a.x - Math.sin(yaw) * cp * 7, a.y + Math.sin(pitch) * 7, a.z + Math.cos(yaw) * cp * 7); r.push(g.nav.clearFraction(a, b).toFixed(2)); } rows.push(`${(i * 22.5).toFixed(0).padStart(4)}  ${r.join(' ')}`); } return `tiles ${g.nav.tiles.join('/')} at ${[pl.x, pl.y, pl.z].map(v => v.toFixed(2))}\n${rows.join('\n')}`; }));
        }
        continue;
      }
    }
    // the first frame's job (docs/STORY.md, "The opening rebuilt"): the office said hands-free while the street runs (the
    // lines above, passed by E), then the player's own camera raised to her corner across the road: raised turned away it
    // does not stop; turned onto the corner and held, the world stops in the finder, and the view is the lens's as it does
    if (s.phase === 'go' && s.beat === 'job') {
      const J = await p.evaluate(() => { const g = window.__game, st = g.story.state, J = st.fr.job; return { ready: !!st.jobReady, at: [J.at[0], J.at[1], g.player.z + 1.3], btn: document.getElementById('g-story-cam').classList.contains('on') }; });
      if (!J.ready) { await p.waitForTimeout(500); continue; }
      if (!seen.has('job')) {
        seen.add('job'); await frames(3); await mark(s, 'job-raise');
        // (the button waited for, up to a minute of the wall: read in the step that found the job ready, it had not been
        // put up yet on a page at 72 ms of script a frame, budgetm on medium with its pictures packed, 24 November)
        if (!J.btn) J.btn = await p.waitForFunction(() => document.getElementById('g-story-cam').classList.contains('on'), null, { timeout: 60000, polling: 250 }).then(() => true, () => false);
        if (!J.btn) { errors.push('frame 1: the office has asked for the picture, and there is no button to raise the camera'); console.log(errors[errors.length - 1]); }
        await p.evaluate(at => { const g = window.__game, pl = g.player, b = Math.atan2(at[0] - pl.x, at[1] - pl.y) + Math.PI; pl.h = b; g.cam.yaw = b; g.cam.pitch = 0.3; }, J.at);
        await frames(3); await raise(true); await frames(30);
        const away = await p.evaluate(() => ({ phase: window.__game.story.state.phase, finder: !!window.__game.story.finder }));
        console.log('frame 1: the camera raised away from her corner:', JSON.stringify(away));
        if (away.phase !== 'go' || !away.finder) { errors.push(`frame 1: raised away from her corner, ${JSON.stringify(away)} (the world still running, the lens's view)`); console.log(errors[errors.length - 1]); }
        await face(J.at);
        // (the world stops once her corner has stood in the frame lines for the job's hold, 0.8 s of the game's own time,
        // story.js jobTick. Waited for by the game's state, up to two minutes of the wall's, not by 400 frames drawn: on a
        // phone's tier a drawn frame carries little of the game's time, the hold reached 0.77 s at the 80th of 200 here, and
        // on main's budget run on 169c9fe the 400 frames ran out with the lens on her corner. The harness's, not the game's:
        // a player holding the lens there 0.8 s always stops it. Where it does not stop, how far the hold came is said)
        let held = 0;
        await p.waitForFunction(() => { const st = window.__game.story.state; window.__jobMax = Math.max(window.__jobMax || 0, st.jobT || 0); return st.phase !== 'go'; }, null, { timeout: 120000, polling: 100 }).catch(() => {});
        held = await p.evaluate(() => +(window.__jobMax || 0).toFixed(2));
        const st0 = await p.evaluate(h => ({ phase: window.__game.story.state.phase, finder: !!window.__game.story.finder, cut: document.getElementById('gd').classList.contains('cut'), held: h }), held);
        console.log('frame 1: her corner held in the finder:', JSON.stringify(st0));
        if (st0.phase !== 'stop' || !st0.finder) { errors.push(`frame 1: her corner held in the finder, ${JSON.stringify(st0)} (the world stopped, seen in the lens)`); console.log(errors[errors.length - 1]); }
        await snap('1-stop-in-the-finder');
      }
      continue;
    }
    if (s.phase === 'go' && s.beat === 'meet') {
      // while the dog leads, he alone shows the way: no light standing in the street, no gold line, and no mark while he is in the frame
      if (!seen.has(`led-${s.fi}`)) { await frames(4); const g = await p.evaluate(() => { const G = window.__game, st = G.story.state, d = st.dog; return d && d.ready ? { guided: !!st.guided, light: st.lightK || '', gold: G.guide().n, mark: document.getElementById('g-story-mark').classList.contains('on'), kind: document.getElementById('g-story-mark').dataset.kind } : null; });
        if (g) { seen.add(`led-${s.fi}`); console.log(`frame ${s.fi + 1} led:`, JSON.stringify(g)); if (!g.guided || g.light || g.gold || (g.mark && g.kind !== 'guide' && g.kind !== 'meet')) { errors.push(`frame ${s.fi + 1}: the dog leads, and the way is shown twice: ${JSON.stringify(g)}`); console.log(errors[errors.length - 1]); } await snap(`${s.fi + 1}-led`); } }
      const at = await p.evaluate(() => { const t = window.__game.story.state.target; return t ? [t[0], t[1], t[3]] : null; }); if (at) await goTo(at, 1.8);
    }
    else if (s.phase === 'go' && s.beat === 'approach') { const at = await p.evaluate(() => { const st = window.__game.story.state, fr = st.fr, a = fr.stop_at || (fr.afterimage && fr.afterimage.at); if (fr.find && !st.lit && st.target) window.__findMarked = st.fi + 1; return fr.lead_s != null && !st.late ? null : a; }); if (at) await goTo(at, 4); }
    // the guide's film, the first time the world stops (story.js meetGuide): a still as he is first seen and as he sits by
    // you; it plays itself out, and must end with him at your side (tools/guide_meet.js checks his way through the crowd)
    else if (s.phase === 'stop' && s.beat === 'guide') {
      const F = await p.evaluate(() => { const g = window.__game, F = g.story.state.mov; return F ? { t: F.t, sat: !!F.sat, film: !!g.story.film } : null; });
      if (F && F.t > 0.4 && F.film) await mark(s, 'guide-film');
      if (F && F.sat) await mark(s, 'guide-sits');
    }
    else if (s.phase === 'stop' && s.beat === 'seek') {
      // (the first Stop as a first-time player meets it, before anyone is walked anywhere: she must be in the picture, and
      // the halation round her up, four seconds of the story after the goal says to walk to her. Players spent four minutes
      // finding her: docs/STORY.md "The first play, from what players did")
      if (s.fi === 0 && !seen.has('seek-look')) {
        seen.add('seek-look');
        const look = () => p.evaluate(() => { const g = window.__game, st = g.story.state, f = st.ghost, c = g.camera, T = window.THREE; if (!f || !c || !T) return null;
          const v = new T.Vector3(f.x, f.z + 1.6, -f.y).project(c), front = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
          return { t: +st.t.toFixed(1), at: front ? [+((v.x + 1) / 2).toFixed(2), +((1 - v.y) / 2).toFixed(2)] : null, d: +Math.hypot(f.x - g.player.x, f.y - g.player.y).toFixed(1), halo: +(f.haloNow ? f.haloNow() : 0).toFixed(2) }; });
        const q0 = await look();
        await p.waitForFunction(t => window.__game.story.state.t >= t || window.__game.story.state.beat !== 'seek', (q0 ? q0.t : 0) + 4, { timeout: 600000, polling: 250 }).catch(() => {});
        const q1 = await look(); await snap('1-seek-4s');
        console.log(`the first Stop, walking to her: ${JSON.stringify(q0)}, then ${JSON.stringify(q1)}`);
        if (!q1 || !q1.at || (q1.d > 12 && q1.halo < 0.1)) { errors.push(`the first Stop: four seconds into the walk to her she is ${!q1 || !q1.at ? 'not in the picture' : `${q1.d} m off with no light round her`}`); console.log(errors[errors.length - 1]); }
        // (#186 C: players who left here had pressed nothing for minutes. One who has not walked yet has the walking keys
        // on the screen, and the goal's second line says which; standing still SEEK_ASK_S, it is said again as their turn,
        // the keys beat, and by touch the stick comes up. Stills of each, readable over the street: #185)
        const k0 = await p.evaluate(() => { const st = window.__game.story.state, K = document.getElementById('g-story-keys'); return { walked: !!st.walked, keys: K.classList.contains('on'), how: document.querySelector('#g-story-goal em').textContent }; });
        console.log(`the first Stop, the walking keys: ${JSON.stringify(k0)}`);
        if (!k0.walked) {
          if (!k0.keys || !/walk/i.test(k0.how)) { errors.push(`the first Stop: not yet walked, and ${!k0.keys ? 'no walking keys on the screen' : `the goal does not say how to walk ("${k0.how}")`}`); console.log(errors[errors.length - 1]); }
          const toasts0 = await p.evaluate(() => document.querySelectorAll('.g-toast').length);
          await p.waitForFunction(() => (window.__game.story.state.seekAsked || 0) >= 1 || window.__game.story.state.beat !== 'seek', null, { timeout: 600000, polling: 250 }).catch(() => {});
          const k1 = await p.evaluate(() => { const st = window.__game.story.state, K = document.getElementById('g-story-keys'), T = [...document.querySelectorAll('.g-toast')].map(e => e.textContent); return { asked: st.seekAsked || 0, beat: st.beat, keys: K.classList.contains('on'), beat2: K.classList.contains('ask'), joy: document.querySelector('.game-stage').classList.contains('story-walk-ask'), toast: T[T.length - 1] || '', next: document.getElementById('g-toasts').dataset.next || '', n: T.length }; });
          await snap('1-seek-ask');
          // ("your turn" said or waiting its turn behind another toast, hud.js said: the sound's own word that a phone's street
          // went quiet stood there first on main's budget on a9737df, and the ask came after it)
          console.log(`the first Stop, standing still: ${JSON.stringify(k1)} (toasts before: ${toasts0})`);
          if (k1.asked < 1 || !k1.keys || !k1.beat2 || !/your turn/i.test(`${k1.toast} | ${k1.next}`) || (w < 500 && !k1.joy)) { errors.push(`the first Stop: standing still, the player was not asked again to walk: ${JSON.stringify(k1)}`); console.log(errors[errors.length - 1]); }
        }
        continue;
      }
      if (!seen.has(`guide-${s.fi}`) && s.fi === 0) { seen.add(`guide-${s.fi}`); const d = await p.evaluate(() => { const g = window.__game, d = g.story.state.dog; return d ? Math.hypot(d.x - g.player.x, d.y - g.player.y) : -1; }); console.log(`the guide met: ${d.toFixed(1)} m from you`); if (d < 0 || d > 6) { errors.push(`the guide's film ended with him ${d.toFixed(1)} m from you`); console.log(errors[errors.length - 1]); } } const at = await p.evaluate(() => { const g = window.__game.story.state.ghost; return g ? [g.x, g.y, g.z] : null; }); await mark(s, 'stop'); if (at) { await goTo(at, 6); await p.waitForTimeout(800); await snap(`${s.fi + 1}-afterimage`); await goTo(at, 2.2); } }
    else if (s.phase === 'stop' && s.beat === 'shoot') {
      const T = await p.evaluate(() => { const st = window.__game.story.state, T = st.fr.task; return { stand: T.stand || null, find: !!T.find, hintAt: T.hint_at || null, subject: T.relic ? [T.relic.at[0], T.relic.at[1], (T.relic.at[2] != null ? T.relic.at[2] : window.__game.player.z - 0.2) + (T.relic.eye != null ? T.relic.eye : 0.6)] : T.subject || null, relic: !!T.relic, both: !!T.both, meet: !!T.meet, a: st.ghost && [st.ghost.x, st.ghost.y], b: st.ghost2 && [st.ghost2.x, st.ghost2.y] }; });
      // a frame whose place the player finds has no light standing on it and no mark of where to stand, until they have looked a while
      if (T.find && T.stand && !seen.has(`find-${s.fi}`)) { seen.add(`find-${s.fi}`); await frames(3); const m = await p.evaluate(() => { const st = window.__game.story.state; return { target: st.target, lit: st.lit, on: document.getElementById('g-story-mark').classList.contains('on') }; }); if (!m.lit && (m.target || m.on)) { errors.push(`frame ${s.fi + 1}: its place is to be found, and a mark stands on it`); console.log(errors[errors.length - 1]); } await snap(`${s.fi + 1}-find`);
        // and its hints, asked for (story.js hint, H): a word, the dog to the place and sitting there, the light on it
        if (process.env.HINTS !== '0') {
          await press('KeyH'); await frames(3);
          const h1 = await p.evaluate(() => ({ n: window.__game.story.state.hint, goal: document.querySelector('#g-story-goal span').textContent }));
          await press('KeyH'); await frames(3); await p.waitForTimeout(2500);
          const h2 = await p.evaluate(stand => { const st = window.__game.story.state, d = st.dog; return { n: st.hint, dog: !!d, to: d && d.to ? Math.hypot(d.to[0] - stand[0], d.to[1] - stand[1]) : -1, state: d ? d.state : '', lit: st.lit }; }, T.stand);
          await snap(`${s.fi + 1}-hint-dog`);
          // (the light is put on at the story's next step, which a whole play's load can take past four frames drawn: waited
          // for, up to ten seconds, and still failed where it never comes; main's budget on d1a6016 read it too soon)
          await press('KeyH'); await frames(4); await p.waitForFunction(() => window.__game.lights().story, null, { timeout: 10000, polling: 200 }).catch(() => {});
          const h3 = await p.evaluate(() => { const st = window.__game.story.state, L = window.__game.lights(); return { n: st.hint, lit: st.lit, kind: st.kind, target: !!st.target, light: L.story, objective: L.objective }; });
          console.log(`frame ${s.fi + 1} hints:`, JSON.stringify({ h1, h2, h3 }));
          if (h1.n !== 1 || h2.n !== 2 || !h2.dog || h2.to < 0 || h2.to > 1.5 || h2.lit || h3.n !== 3 || !h3.lit || !h3.light || h3.objective) { errors.push(`frame ${s.fi + 1}: its hints did not give a word, the dog at the place and the light in turn: ${JSON.stringify({ h1, h2, h3 })}`); console.log(errors[errors.length - 1]); }
        } }
      // a picture found without a standpoint (task.hint_at: both kerbs in one frame): its hints lead to a place that does it
      if (T.hintAt && process.env.HINTS !== '0' && !seen.has(`hintat-${s.fi}`)) {
        seen.add(`hintat-${s.fi}`);
        for (let k = 0; k < 2; k++) { await press('KeyH'); await frames(3); }
        await p.waitForTimeout(2500);
        const h2 = await p.evaluate(at => { const st = window.__game.story.state, d = st.dog; return { n: st.hint, to: d && d.to ? Math.hypot(d.to[0] - at[0], d.to[1] - at[1]) : -1 }; }, T.hintAt);
        await press('KeyH'); await frames(4);
        const h3 = await p.evaluate(() => { const st = window.__game.story.state, L = window.__game.lights(); return { n: st.hint, light: L.story, objective: L.objective, kind: st.kind }; });
        console.log(`frame ${s.fi + 1} hints:`, JSON.stringify({ h2, h3 })); await snap(`${s.fi + 1}-hint-light`);
        if (h2.n !== 2 || h2.to < 0 || h2.to > 1.5 || h3.n !== 3 || !h3.light || h3.objective) { errors.push(`frame ${s.fi + 1}: its hints did not lead to a place that sees both: ${JSON.stringify({ h2, h3 })}`); console.log(errors[errors.length - 1]); }
        // and the place they lead to does it: from there, the camera raised towards the middle of the two, both are in the frame
        await goTo(T.hintAt, 0); const mid = [(T.a[0] + T.b[0]) / 2, (T.a[1] + T.b[1]) / 2]; await face(mid);
        await raise(true); await frames(6); await p.waitForTimeout(1200);
        const ok = await p.evaluate(() => { const st = window.__game.story.state; return !!(st.ready || st.meet || st.meetHold > 0); }); await snap(`${s.fi + 1}-hint-place`); // (a frame taken as they meet is ready only once they have met: framed, they set off)
        console.log(`frame ${s.fi + 1}: from the place the hints lead to, both in the frame: ${ok}`);
        if (!ok) { errors.push(`frame ${s.fi + 1}: from the place its hints lead to, both are not in the frame`); console.log(errors[errors.length - 1]); }
        await raise(false); await frames(2);
      }
      if (+process.env.SPEND === s.fi + 1 && !spent) { // from the wrong place, the release twice: the frame is spent, and the story goes on without it
        spent = true;
        if (T.stand && !T.find) { await goTo(T.stand, 0.6); await frames(3); } // (where a light stands from the start the camera comes up only in it: raised there, and turned away)
        await raise(true); await p.evaluate(() => { const g = window.__game; g.player.h += Math.PI; if (g.cam) g.cam.yaw = g.player.h; });
        await frames(3); await shoot(); await frames(2); await snap(`${s.fi + 1}-spend-warned`);
        // (issue 117: the second press asks, and spends nothing: the card is up with the hand on Keep, a third press of the
        // release is not an answer, Keep keeps the frame; then the release twice again, and Spend spends it)
        const N0 = s.fi, asked = async () => p.evaluate(() => { const g = window.__game.story, e = document.querySelector('#g-story-spend'), f = document.activeElement; return { ask: !!g.state.spendAsk, on: !!e && e.classList.contains('on'), n: g.state.prints.length, keep: !!f && f.dataset && f.dataset.spend === '0' }; });
        await shoot(); await frames(2); await shoot(); await frames(2);
        let q = await asked(); await snap(`${s.fi + 1}-spend-asked`);
        if (!q.ask || !q.on || q.n !== N0 || !q.keep) { errors.push(`frame ${s.fi + 1}: the release twice from the wrong place: ${q.on ? 'asked' : 'not asked'}, ${q.n - N0} frames gone, the hand ${q.keep ? '' : 'not '}on Keep`); console.log(errors[errors.length - 1]); }
        await spendAnswer(false); await frames(2); q = await asked();
        if (q.ask || q.on || q.n !== N0) { errors.push(`frame ${s.fi + 1}: Keep the frame: ${q.on ? 'the card is still up' : ''} ${q.n - N0} frames gone`); console.log(errors[errors.length - 1]); }
        else console.log(`frame ${s.fi + 1}: asked before it was spent, and kept`);
        await shoot(); await frames(2); await shoot(); await frames(2);
        await drawAll(true); await spendAnswer(true); await drawAll(false);
        const pr = await p.evaluate(() => { const P = window.__game.story.state.prints, q = P[P.length - 1]; return { n: P.length, plain: !!(q && q.plain) }; });
        if (pr.n !== s.fi + 1 || !pr.plain) { errors.push(`frame ${s.fi + 1}: spent from the wrong place, and the roll has ${pr.n} prints, the last ${pr.plain ? 'only tonight' : 'not marked spent'}`); console.log(errors[errors.length - 1]); }
        else console.log(`frame ${s.fi + 1}: spent`);
        await p.waitForTimeout(1500); await snap(`${s.fi + 1}-spent`); continue;
      }
      // the camera taught (task.teach, the first frame; story.js teach): raised off the light, nothing of the other year forms
      // in the lines, the year over them says so, and the card still has the light to stand in (the raise ticked); in the
      // light, the ground there is lit and the card ticks it; raised there, the thing forms. For a day the board stood in
      // the finder from anywhere while the goal said to step into the light, and the light meant nothing
      if (T.stand && T.subject && !seen.has(`teach-${s.fi}`) && await p.evaluate(() => !!window.__game.story.state.teach)) {
        seen.add(`teach-${s.fi}`);
        const card = () => p.evaluate(() => { const g = window.__game, st = g.story.state, e = document.getElementById('g-story-teach'), L = [...e.querySelectorAll('li')]; return { on: e.classList.contains('on'), now: L.findIndex(l => l.classList.contains('now')), done: L.map(l => (l.classList.contains('done') ? 1 : 0)).join(''), formed: st.relic ? +st.relic.k.toFixed(2) : -1, off: 'off' in document.getElementById('g-story-finder').dataset, here: g.lights().here, ready: !!st.ready, cam: !!st.cam, btn: document.getElementById('g-story-cam').classList.contains('on') }; });
        const side = await p.evaluate(([st, sub]) => { const g = window.__game, pl = g.player, dx = sub[0] - st[0], dy = sub[1] - st[1], l = Math.hypot(dx, dy) || 1, r = (g.story.state.fr.task.within_m || 4) * 2 + 1; pl.x = st[0] + dy / l * r; pl.y = st[1] - dx / l * r; return r; }, [T.stand, T.subject]);
        await face(T.subject); await raise(true); await frames(24); await p.waitForTimeout(1200);
        const off = await card(); await snap(`${s.fi + 1}-teach-off-the-light`);
        console.log(`frame ${s.fi + 1} taught, raised ${side} m off the light:`, JSON.stringify(off));
        // (the camera comes up only in the light: off it the raise is refused, the card stays on its first step, and the button
        // is not offered. It was offered at once, where the talk's words had been, and the talk's last tap raised it)
        if (!off.on || off.now !== 0 || off.done !== '0000' || off.cam || off.btn || off.formed !== 0 || off.here || off.ready) { errors.push(`frame ${s.fi + 1}: raised off the light, ${JSON.stringify(off)} (the camera still down and no button for it, the card on its first step, nothing of 1964 formed, no light underfoot)`); console.log(errors[errors.length - 1]); }
        await raise(false); await frames(4);
        await goTo(T.stand, 0.6); await face(T.subject); await frames(6); await p.waitForTimeout(600);
        // (each state looked for until it comes, up to a minute of the wall's: on a phone's tier a drawn frame carries little of
        // the game's time, and three of frame 1's reads after so many frames failed on CI on 24 November. What may not happen
        // off the light is still read after its fixed wait)
        const until = async ok => { const t0 = Date.now(); let c = await card(); while (!ok(c) && Date.now() - t0 < 60000) { await frames(4); c = await card(); } return c; };
        const inL = await until(c => c.now === 1 && c.here && c.btn); await snap(`${s.fi + 1}-teach-in-the-light`);
        console.log(`frame ${s.fi + 1} taught, in the light:`, JSON.stringify(inL));
        if (inL.now !== 1 || inL.done !== '1000' || !inL.here || !inL.btn) { errors.push(`frame ${s.fi + 1}: in the light, ${JSON.stringify(inL)} (the light ticked, the raise to do and its button up, the ground lit)`); console.log(errors[errors.length - 1]); }
        await raise(true); await frames(24); await p.waitForTimeout(1500);
        const up = await until(c => c.formed >= 1 && c.ready && c.now === 3); await snap(`${s.fi + 1}-teach-raised-in-the-light`);
        console.log(`frame ${s.fi + 1} taught, raised in the light:`, JSON.stringify(up));
        if (up.formed < 1 || up.off || !up.ready || up.done !== '1110' || up.now !== 3) { errors.push(`frame ${s.fi + 1}: raised in the light, ${JSON.stringify(up)} (the thing formed in the lines, ready, the card at its last step)`); console.log(errors[errors.length - 1]); }
        await raise(false); await frames(4);
      }
      if (T.stand) await goTo(T.stand, 0.6);
      // the camera raised as a player raises it, from wherever the view behind them looks (here 63 degrees off the thing
      // and pitched well down): it comes up onto the thing within half a second, and then holds still with no hand on it.
      // It once came up wherever that view had been pitched (on a wall's upper floors), and drifted on by itself
      if (T.subject && !T.both && !seen.has(`raise-${s.fi}`)) {
        seen.add(`raise-${s.fi}`);
        // (from the camera down: raised already, by the teaching steps before it in frame 1, the lens stayed where it was and
        // nothing came up onto the thing, which sat at -5.37 in the picture: main's budget on ccaf4fd and two local plays. A
        // player raises a lowered camera; the lens comes up onto the thing as it is raised, game.js fpOn)
        // (lowered and raised with no frame of the game's between, as a phone's 30 a second let happen: the raise is an event the
        // game reads, story.state.raised, not a state it must see change)
        if (await p.evaluate(() => !!window.__game.story.state.cam)) await raise(false);
        await p.evaluate(at => { const g = window.__game, pl = g.player, b = Math.atan2(at[0] - pl.x, at[1] - pl.y) + 1.1; pl.h = b; g.cam.yaw = b; g.cam.pitch = 0.9; }, T.subject);
        await frames(4);
        await raise(true);
        // (one sample a frame of the game's: a phone's frames are capped at 30 a second, game.js PHONE_FPS, and the display's
        // frames between them do not move the camera, so counted by the display's the raise was still coming up in "settle")
        const R = await p.evaluate(at => new Promise(r => { const g = window.__game, c = g.camera, V = window.THREE.Vector3, out = [], t0 = performance.now(), D = window.__draw; let last = -1;
          const f = () => { const n = D ? D.steps : out.length; if (n !== last) { last = n; const d = c.getWorldDirection(new V()), q = new V(at[0], at[2], -at[1]).project(c); out.push({ t: performance.now() - t0, d: [d.x, d.y, d.z], q: [q.x, q.y, q.z] }); } if (performance.now() - t0 < 2500 || out.length < 45) requestAnimationFrame(f); else r(out); };
          requestAnimationFrame(f); }), T.subject);
        const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI;
        // (counted in frames, not the wall's time: the game moves 0.05 s a frame at most, so on a software renderer the raise's
        // half a second is many seconds of the wall's; after 20 frames, a second of the game's own time, it is up)
        // (and on a real GPU twenty frames are a third of a second: a phone's page at sixty a second was caught half way up,
        // "moves by itself" by 6 to 10 degrees in five frames of seven. The second is counted in the game's own time, a frame's
        // wall time or 0.05 s, whichever is less; never fewer than the twenty frames)
        let up = 1, gameMs = 0; while (up < R.length - 2 && (up < 20 || gameMs < 1000)) { gameMs += Math.min(50, R[up].t - R[up - 1].t); up++; }
        const settle = R.slice(up), first = settle[0], last = settle[settle.length - 1];
        let jit = 0; for (let i = 1; i < settle.length; i++) jit = Math.max(jit, ang(settle[i].d, settle[i - 1].d));
        const drift = ang(first.d, last.d), q = last.q, inFrame = q[2] < 1 && Math.abs(q[0]) < 0.7 && Math.abs(q[1]) < 0.7;
        await snap(`${s.fi + 1}-raised`);
        console.log(`frame ${s.fi + 1} raised from 63 degrees off: the thing at ${q[0].toFixed(2)}, ${q[1].toFixed(2)} in the picture, the lens drifting ${drift.toFixed(2)} degrees and turning ${jit.toFixed(2)} at most a frame with no hand on it (${settle.length} frames)`);
        // (and what the game had when it did not: the lens comes up onto story.subject only where there is one and it lies
        // within 100 degrees of the view, game.js fpOn; twice in seven of main's whole budget plays it never turned, at -5.37)
        const why = inFrame ? '' : await p.evaluate(at => { const g = window.__game, st = g.story, pl = g.player, sj = st.subject, b = Math.atan2(at[0] - pl.x, at[1] - pl.y), d = Math.atan2(Math.sin(g.cam.yaw - b), Math.cos(g.cam.yaw - b));
          return JSON.stringify({ subject: sj ? sj.map(v => +(+v).toFixed(1)) : sj, cam: !!st.state.cam, phase: st.state.phase, beat: st.state.beat, at: [+pl.x.toFixed(1), +pl.y.toFixed(1)], off: +(d * 180 / Math.PI).toFixed(0), mode: g.cam.mode, photo: !!(g.photo && g.photo.on), cine: !!(g.cine && g.cine.active) }); }, T.subject).catch(e => String(e).slice(0, 80));
        if (!inFrame) { errors.push(`frame ${s.fi + 1}: raised from 63 degrees off, the camera does not come up on the thing (at ${q[0].toFixed(2)}, ${q[1].toFixed(2)}; ${why})`); console.log(errors[errors.length - 1]); }
        if (drift > 0.3 || jit > 0.15) { errors.push(`frame ${s.fi + 1}: the raised camera moves by itself (${drift.toFixed(2)} degrees, ${jit.toFixed(2)} a frame)`); console.log(errors[errors.length - 1]); }
        await raise(false); await frames(6);
      }
      // the print has what the release is ready for. On a phone held upright the finder's lines stood twice as tall as the
      // print, and frame 2's box and stool, framed at their foot, made the release ready and were not in the print. Here the
      // lens is tilted from above the thing to below it and turned from one side of it to the other, a step at a time, and
      // wherever the release is ready, nine tenths of the thing lies in the print (the middle of the picture, three by two,
      // as game.js snap cuts it); and raised onto it in its place, the release is ready
      const inPrint = () => p.evaluate(() => {
        const st = window.__game.story.state, b = st.relic && st.relic.frame ? st.relic.frame() : null, w = innerWidth, h = innerHeight, sw = Math.min(w, h * 1.5), sh = sw / 1.5, P = [(1 - sw / w) / 2, (1 - sh / h) / 2, (1 + sw / w) / 2, (1 + sh / h) / 2];
        if (!b) return { ready: !!st.ready, k: st.relic ? +st.relic.k.toFixed(2) : -1, frac: -1, big: true };
        const ix = Math.max(0, Math.min(b.x1, P[2]) - Math.max(b.x0, P[0])), iy = Math.max(0, Math.min(b.y1, P[3]) - Math.max(b.y0, P[1])), a = (b.x1 - b.x0) * (b.y1 - b.y0);
        return { ready: !!st.ready, k: +st.relic.k.toFixed(2), frac: +(a > 0 ? ix * iy / a : 0).toFixed(2), big: !b.front || b.x1 - b.x0 > (P[2] - P[0]) * 0.9 || b.y1 - b.y0 > (P[3] - P[1]) * 0.9, box: [b.x0, b.y0, b.x1, b.y1].map(v => +v.toFixed(3)), print: P.map(v => +v.toFixed(3)) };
      });
      if (T.relic && T.stand && !seen.has(`sweep-${s.fi}`)) {
        seen.add(`sweep-${s.fi}`);
        await goTo(T.stand, 0.3); await face(T.subject); await raise(true); await frames(24); await p.waitForTimeout(1500); await frames(2);
        const base = await p.evaluate(() => ({ yaw: window.__game.cam.yaw, pitch: window.__game.cam.pitch })), on = await inPrint();
        const bad = [], log = [`on it: ${on.ready ? 'ready' : 'not ready'}, ${on.frac} in the print`];
        await snap(`${s.fi + 1}-sweep-on`);
        if (!on.ready) bad.push(`raised onto the thing in its place, the release is not ready (${JSON.stringify(on)})`);
        if (on.ready && !on.big && on.frac < 0.9) bad.push(`raised onto the thing, the release is ready with ${Math.round(on.frac * 100)}% of it in the print`);
        for (const [dy, dp] of [[0, -0.16], [0, -0.1], [0, -0.06], [0, 0.06], [0, 0.1], [0, 0.16], [-0.12, 0], [-0.07, 0], [0.07, 0], [0.12, 0]]) {
          await p.evaluate(([b, dy, dp]) => { const c = window.__game.cam; c.yaw = b.yaw + dy; c.pitch = b.pitch + dp; }, [base, dy, dp]);
          await frames(8); await p.waitForTimeout(1000); await frames(2);
          const q = await inPrint(), how = dy ? `turned ${dy} rad` : `tilted ${dp} rad`;
          log.push(`${how}: ${q.ready ? 'ready' : 'not ready'}, ${q.frac}`);
          if (q.ready && !q.big && q.frac < 0.9) { bad.push(`${how}, the release is ready with ${Math.round(q.frac * 100)}% of the thing in the print (${JSON.stringify(q)})`); await snap(`${s.fi + 1}-sweep-${dy ? 'turn' : 'tilt'}${dy || dp}`); }
        }
        console.log(`frame ${s.fi + 1}, the lens swept over the thing: ${log.join('; ')}`);
        for (const m of bad) { errors.push(`frame ${s.fi + 1}: ${m}`); console.log(errors[errors.length - 1]); }
        await raise(false); await frames(6);
      }
      if (T.both) { const m = [(T.a[0] + T.b[0]) / 2, (T.a[1] + T.b[1]) / 2], n = [-(T.b[1] - T.a[1]), T.b[0] - T.a[0]], l = Math.hypot(...n); await goTo(T.hintAt || [m[0] + n[0] / l * 30, m[1] + n[1] / l * 30], 0); await face(m); } // (from the corner its hints lead to: 30 m off the middle, a kiosk filled half the last print)
      else if (T.subject) await face(T.subject);
      // the mark the player follows points at what the frame is judged on (it once pointed 21 m off, up a wall)
      if (T.subject && !T.both) { await frames(3); await p.waitForTimeout(300); const t = await p.evaluate(() => window.__game.story.state.target); const off = t ? Math.hypot(t[0] - T.subject[0], t[1] - T.subject[1]) : Infinity; if (off > 1.5) { errors.push(`frame ${s.fi + 1}: the mark is ${off.toFixed(1)} m from the subject`); console.log(errors[errors.length - 1]); } }
      // and it is the mark of a thing to photograph, with no metres on it (on the roof it read "143 m": a place to walk to)
      if (T.subject && !T.both) { const m = await p.evaluate(() => { const e = document.getElementById('g-story-mark'); return { kind: e.dataset.kind, text: e.querySelector('b').textContent }; }); if (m.kind !== 'frame' || /\d/.test(m.text)) { errors.push(`frame ${s.fi + 1}: at the standpoint the mark is "${m.kind}", reading "${m.text}"`); console.log(errors[errors.length - 1]); } }
      // and no route line runs from the player's feet to the thing to photograph: the way ends at the standpoint, and the
      // thing is framed from there, not walked to (a pale band ran from Kagami across the zebra to the kerb in the Stop)
      if (T.subject) { await frames(8); const r = await p.evaluate(() => { const g = window.__game.gold; return { shown: +g.shown.toFixed(3), pts: g.pts ? g.pts.length : 0, kind: window.__game.story.state.kind }; }); if (r.shown > 0.01 || r.pts) { errors.push(`frame ${s.fi + 1}: at the standpoint a route line is drawn to the ${r.kind} (${JSON.stringify(r)})`); console.log(errors[errors.length - 1]); } }
      await snap(`${s.fi + 1}-cam-down`); await raise(true); // (the camera to the eye: R)
      await p.waitForTimeout(1500); await mark(s, 'aimed');
      // from the first frame's photograph to the last card, the camera of 1964 is round Kagami's neck (game.js, people.js camera1964)
      if (!(await p.evaluate(() => !!(window.__game && window.__game.player.rig.oldCam)))) { errors.push(`frame ${s.fi + 1}: the camera of 1964 is not round Kagami's neck`); console.log(errors[errors.length - 1]); }
      // the last frame is taken as they meet (task.meet, #35): framed, both step off their kerbs as every light turns to walk;
      // the release while they walk takes nothing; five stills while they come, the world held; and once they have met they
      // stand a step apart near the middle of the print, both in sight, and nobody of the held crowd stands within 8 m in
      // front of the lens
      if (T.meet) {
        const fail = m => { errors.push(`frame ${s.fi + 1}: ${m}`); console.log(errors[errors.length - 1]); };
        await p.waitForFunction(() => !!window.__game.story.state.meet, null, { timeout: 300000, polling: 250 }).catch(() => {});
        const m0 = await p.evaluate(() => { const st = window.__game.story.state, j = window.__game.junctions.J.find(q => q.scramble && Math.hypot(q.x - window.__game.player.x, q.y - window.__game.player.y) < 80); return { meet: st.meet || '', n: st.prints.length, walk: !!(j && j.walkNow), t: st.t }; });
        console.log(`frame ${s.fi + 1}: framed, and they ${m0.meet === 'walk' ? 'walk' : `do not walk (${m0.meet})`}; every light to walk: ${m0.walk}`);
        if (m0.meet !== 'walk') fail('both in the frame, and they do not step off their kerbs');
        if (!m0.walk) fail('they walk, and the lights at the crossing are not to walk');
        await shoot(); await frames(3);
        const early = await p.evaluate(() => ({ n: window.__game.story.state.prints.length, goal: document.querySelector('#g-story-goal span').textContent }));
        console.log(`frame ${s.fi + 1}: the release while they walk: ${early.n === m0.n ? 'nothing taken' : 'a picture taken'}, "${early.goal}"`);
        if (early.n !== m0.n) fail('the release while they walk took the picture');
        for (let i = 1; i <= 5; i++) { // (a still every two seconds of the story's clock while they walk: anything that moves is looked at for more than one)
          const t1 = (await p.evaluate(() => window.__game.story.state.t)) + 2;
          await p.waitForFunction(t => { const st = window.__game.story.state; return st.t >= t || st.meet !== 'walk'; }, t1, { timeout: 300000, polling: 200 }).catch(() => {});
          await snap(`${s.fi + 1}-walk-${i}`);
        }
        await p.waitForFunction(() => window.__game.story.state.meet === 'met', null, { timeout: 600000, polling: 250 }).catch(() => {});
        await frames(6); await p.waitForTimeout(1200);
        const q = await p.evaluate(() => {
          const g = window.__game, st = g.story.state, T = window.THREE, c = g.camera;
          c.updateMatrixWorld(); const fw = c.getWorldDirection(new T.Vector3());
          const W = (x, y, z) => new T.Vector3(x, z, -y), ndc = v => { const f = v.clone().sub(c.position).dot(fw) > 0, p = v.clone().project(c); return { x: p.x, y: p.y, f }; };
          const w = innerWidth, h = innerHeight, sw = Math.min(w, h * 1.5), xr = sw / w, yr = sw / 1.5 / h; // (the print: the middle of the frame, three by two)
          const two = [st.ghost, st.ghost2].map(f => ({ at: ndc(W(f.x, f.y, f.z + 0.9)) }));
          const apart = Math.hypot(st.ghost.x - st.ghost2.x, st.ghost.y - st.ghost2.y), lens = Math.hypot(c.position.x - (st.ghost.x + st.ghost2.x) / 2, -c.position.z - (st.ghost.y + st.ghost2.y) / 2);
          const near = []; const P = g.crowd && g.crowd.P;
          if (P) for (let i = 0, m = Math.min(g.crowd.active, P.length); i < m; i++) { const r = P[i]; if (r.line < 0 && !r.pz) continue; const x = r.rx ?? r.x, y = r.ry ?? r.y, z = r.rz ?? r.z ?? 0, d = Math.hypot(x - c.position.x, y + c.position.z); if (d > 8) continue; const a = ndc(W(x, y, z + 1)); if (a.f && Math.abs(a.x) < xr && Math.abs(a.y) < yr) near.push(+d.toFixed(1)); }
          const dg = st.dog && st.dog.ready ? ndc(W(st.dog.x, st.dog.y, st.dog.z + 0.5)) : null, dog = dg ? { at: [+st.dog.x.toFixed(1), +st.dog.y.toFixed(1)], state: st.dog.state, inPrint: dg.f && Math.abs(dg.x) < xr && Math.abs(dg.y) < yr } : null;
          return { me: [+g.player.x.toFixed(1), +g.player.y.toFixed(1)], dog, meet: st.meet, two: two.map(o => [+o.at.x.toFixed(2), +o.at.y.toFixed(2), o.at.f]), xr: +xr.toFixed(2), yr: +yr.toFixed(2), apart: +apart.toFixed(2), lens: +lens.toFixed(1), fov: +c.fov.toFixed(1), near, ready: !!st.ready, goal: document.querySelector('#g-story-goal span').textContent };
        });
        console.log(`frame ${s.fi + 1} met:`, JSON.stringify(q));
        if (q.meet !== 'met') fail(`they never met (${q.meet})`);
        else {
          if (q.apart > 1.3) fail(`met, and ${q.apart} m apart`);
          if (q.two.some(([x, y, f]) => !f || Math.abs(x) > q.xr * 0.45 || Math.abs(y) > q.yr * 0.75)) fail(`met, and not near the middle of the print: ${JSON.stringify(q.two)}`);
          if (q.near.length) fail(`met, and the held crowd stands ${q.near.join(', ')} m in front of the lens`);
          if (q.dog && q.dog.inPrint) fail(`met, and the dog is in the print (${JSON.stringify(q.dog)})`);
          if (!q.ready) fail(`met and framed, and the shutter is not ready ("${q.goal}")`);
        }
        await snap(`${s.fi + 1}-met`);
      }
      if (T.relic) { const q = await inPrint(); console.log(`frame ${s.fi + 1}, as the release goes: ${q.ready ? 'ready' : 'not ready'}, ${q.frac} of the thing in the print, formed ${q.k}`); if (q.ready && !q.big && q.frac < 0.9) { errors.push(`frame ${s.fi + 1}: taken with ${Math.round(q.frac * 100)}% of the thing in the print`); console.log(errors[errors.length - 1]); } }
      await drawAll(true); await shoot(); await drawAll(false); // (the photograph is the game's own picture of its canvas, taken as the shutter goes: of a frame drawn whole)
      await p.waitForTimeout(1300); await snap(`${s.fi + 1}-print-developing`); await p.waitForTimeout(1900); await snap(`${s.fi + 1}-print`); // (it develops: tonight, then the other year through it; the print in the hand, its postmark struck)
      { const src = await p.evaluate(() => { const P = window.__game.story.state.prints; return (P[P.length - 1] || {}).src || ''; }); const m = /^data:image\/(\w+);base64,(.*)$/.exec(src); if (m) fs.writeFileSync(`${out}/${s.fi + 1}-print-own.${m[1] === 'jpeg' ? 'jpg' : m[1]}`, Buffer.from(m[2], 'base64')); } // (the print itself, as the roll keeps it: on a slow renderer the still above may be taken after it has gone to the roll)
      // (a frame spent that was not to be: the release refused twice, the second time spending it, and the play went on. Frame 3
      // was spent so on a phone, its lamp not framed from where the player stood, and nothing failed)
      { const q = await p.evaluate(() => { const P = window.__game.story.state.prints, q = P[P.length - 1]; return q ? { plain: !!q.plain, n: P.length } : null; }); if (q && q.n === s.fi + 1 && q.plain && +process.env.SPEND !== s.fi + 1) { errors.push(`frame ${s.fi + 1}: spent, and it was to be taken`); console.log(errors[errors.length - 1]); } }
      if (upto && s.fi + 1 >= upto && !process.env.AFTER) { done = true; break; } // (UPTO=n: stop after frame n's print; with AFTER=1, once the next frame begins)
    }
    else if (s.phase === 'go' && s.beat === 'order') { // (the order in the hand, its ink come up: a still of it, and it is put away)
      // (read from what the page saw as the sheet came up, above: the sheet does not wait for the check or for the still)
      if (!seen.has('order')) { seen.add('order'); const t0 = Date.now(); await p.waitForTimeout(4000); const inHand = await p.evaluate(() => !!window.__orderOk); await snap('1-order'); console.log(`the order: ${inHand ? 'it came up in the hand' : 'it never came up in the hand'}; its still taken at ${((Date.now() - t0) / 1000).toFixed(1)} s`); if (!inHand) { errors.push('the order is not in the hand as the street is given'); console.log(errors[errors.length - 1]); } }
      await press('KeyE');
      // the menu from the story's own button, by touch on a phone (issue 48): it opens, and its close button shuts it
      if (!seen.has('menu')) {
        seen.add('menu');
        const tap = async sel => { const r = await p.locator(sel).first().boundingBox(); if (!r) return false; const x = r.x + r.width / 2, y = r.y + r.height / 2; if (w < 500) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); return true; };
        await p.waitForFunction(() => { const e = document.getElementById('g-story-menu'); return e && getComputedStyle(e).display !== 'none'; }, null, { timeout: 8000, polling: 200 }).catch(() => {});
        // (what lies at the button's middle as it is tapped: a card, a folded goal or a note over it is a phone player's tap
        // lost, and said so; #248)
        const over = await p.evaluate(() => { const e = document.getElementById('g-story-menu'); if (!e) return ''; const r = e.getBoundingClientRect(), t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !t || t === e || e.contains(t) ? '' : `${t.tagName.toLowerCase()}${t.id ? '#' + t.id : ''}${t.className && typeof t.className === 'string' ? '.' + t.className.trim().split(/\s+/).join('.') : ''}`; });
        if (over) { errors.push(`the story's menu button: under ${over} where it is tapped (#248)`); console.log(errors[errors.length - 1]); }
        if (!(await tap('#g-story-menu'))) { errors.push('the story has no menu button to press (issue 48)'); console.log(errors[errors.length - 1]); }
        else {
          // (the menu waited for, ten seconds of the wall, not read 600 ms on: on a phone's page at 30 frames a second of a
          // software renderer's the pause came up after it, #248)
          const open = await p.waitForFunction(() => !document.getElementById('g-menu').hidden, null, { timeout: 10000, polling: 100 }).then(() => true, () => false);
          if (open) await snap('1-menu');
          // (issue 114: the story's pause is a player's, not the builder's: no hour, date, weather, clock speed or route
          // line; going on, the words' size, the case begun again, and by touch the thumbs' controls in place of keys)
          if (open) {
            const m = await p.evaluate(() => { const vis = q => { const e = document.querySelector(q); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; };
              return { tools: ['#gm-time', '#gm-clock', '#gm-date', '#gm-weather', '#gm-speed', '#gm-who', '#gm-density', '#gm-route', '#gm-overture', '#gm-reset'].filter(vis), want: ['#gm-resume', '#gm-title', '#gm-sound', '#gm-words', '#gm-fps', '#gm-again', '#gm-credits', matchMedia('(pointer: coarse)').matches ? '#g-menu .gt-touch' : '#g-menu .gk-case'].filter(q => !vis(q)), at: document.getElementById('gm-case-at').textContent }; });
            if (m.tools.length || m.want.length) { errors.push(`the story's pause: ${m.tools.length ? `the map's tools are in it (${m.tools.join(', ')})` : ''}${m.tools.length && m.want.length ? '; ' : ''}${m.want.length ? `it lacks ${m.want.join(', ')}` : ''}`); console.log(errors[errors.length - 1]); }
            else console.log(`the story's pause: "${m.at}", resume, sound, words, frame rate, ${w < 500 ? "the thumbs' controls" : 'the keys'} the case begun again and the Credits; none of the map's tools`);
          }
          await tap('#g-menu-close');
          const shut = await p.waitForFunction(() => document.getElementById('g-menu').hidden, null, { timeout: 10000, polling: 100 }).then(() => true, () => false);
          if (!open || !shut) { errors.push(`the story's menu button: ${open ? 'the menu opened and its close button did not shut it' : 'the menu did not open'}`); console.log(errors[errors.length - 1]); }
          else console.log(`the menu: opened from the story's own button by ${w < 500 ? 'touch' : 'the mouse'}, and shut again`);
        }
      }
    }
    else if (s.phase === 'go' && s.beat === 'ride') { await mark(s, 'ride'); const to = await p.evaluate(() => window.__game.story.state.fr.ride.to); await goTo(to, 6); } // (a frame reached by car: this player walks; tools/story_ride.js takes the car)
    else if (s.phase === 'go' && s.beat === 'board') { // a flight boarded on its pad (flight.board): the helicopter is there to be seen, turning over;
      // E within reach of it names it, and is the flight at once (no walk to its door first)
      if (!seen.has(`board-${s.fi}`)) {
        seen.add(`board-${s.fi}`); await frames(4);
        const h = await p.evaluate(() => { const g = window.__game, q = g.heli.st; return { at: [+q.x.toFixed(1), +q.y.toFixed(1), +q.z.toFixed(1)], seen: g.heli.group.visible, rotor: +q.rotor.toFixed(2), goal: document.querySelector('#g-story-goal span').textContent, how: document.querySelector('#g-story-goal em').textContent }; });
        console.log(`frame ${s.fi + 1} board:`, JSON.stringify(h));
        if (!h.seen || h.rotor < 0.1) { errors.push(`frame ${s.fi + 1}: the helicopter to get into is ${h.seen ? 'not turning over' : 'not to be seen'} on its pad`); console.log(errors[errors.length - 1]); }
        await snap(`${s.fi + 1}-board`);
        { // (where the lens is as the frame begins: issue 99's other still, from over your head at the roof's east glass)
          const c = await p.evaluate(tab => { const g = window.__game, c = g.camera.position, pl = g.player, r = v => +v.toFixed(2); g.cam.trace = {}; g.frame(0); const t = g.cam.trace; g.cam.trace = null;
            let rows = '';
            if (tab) { const T3 = window.THREE, a = new T3.Vector3(pl.x, pl.z + 1.55, -pl.y), b = new T3.Vector3(); for (let i = 0; i < 16; i++) { const yaw = i * Math.PI / 8, q = []; for (const lift of [0, 0.15, 0.3, 0.45, 0.6, 0.8]) { const pitch = g.cam.pitch + lift, cp = Math.cos(pitch); b.set(a.x - Math.sin(yaw) * cp * g.cam.dist, a.y + Math.sin(pitch) * g.cam.dist, a.z + Math.cos(yaw) * cp * g.cam.dist); q.push(g.nav.clearFraction(a, b).toFixed(2)); } rows += `\n${(yaw).toFixed(2)}  ${q.join(' ')}`; } }
            return { at: [pl.x, pl.y, pl.z].map(r), h: r(pl.h), off: r(Math.hypot(c.x - pl.x, -c.z - pl.y)), over: r(c.y - pl.z), yaw: r(g.cam.yaw), yawTo: g.cam.yawTo, pitch: r(g.cam.pitch), dist: r(g.cam.dist), lift: r(g.cam.lift), pull: r(g.cam.pull), f: r(t.f), want: t.wantLift, hand: g.cam.hand || null, idle: r(g.t() - g.cam.lastInput), rows }; }, !!process.env.CAMTABLE);
          console.log(`frame ${s.fi + 1} board camera:`, JSON.stringify(c).replace(/\\n/g, '\n'));
          // (issue 139: the first view of the roof is from behind your shoulder with the pad and the helicopter ahead, not
          // from over your head at the glass: the lens no more than 3.6 m over your feet and the helicopter inside the frame.
          // And once the view has come round, nothing of it moves: five stills a second apart with you standing, the lens
          // where it was, and five frames given no time, the lens not a millimetre off, which a turn laid on every frame is)
          await p.waitForFunction(() => { const g = window.__game; return g.cam.yawTo == null && !g.player.auto; }, null, { timeout: 20000, polling: 100 }).catch(() => {});
          const v = await p.evaluate(() => {
            const g = window.__game, T3 = window.THREE, q = g.heli.st, cam = g.camera, at = new T3.Vector3(q.x, q.z + 1.5, -q.y), pl = g.player;
            cam.updateMatrixWorld(); const front = at.clone().sub(cam.position).dot(cam.getWorldDirection(new T3.Vector3())) > 0, n = at.clone().project(cam), p0 = cam.position.clone();
            let still = 0; for (let k = 0; k < 5; k++) { g.frame(0); still = Math.max(still, cam.position.distanceTo(p0)); }
            return { front, x: +n.x.toFixed(2), y: +n.y.toFixed(2), p0: [p0.x, p0.y, p0.z], still, over: +(cam.position.y - pl.z).toFixed(2), lift: +(g.cam.lift || 0).toFixed(2) };
          });
          let moved = 0;
          for (let k = 0; k < 5; k++) {
            moved = Math.max(moved, await p.evaluate(p0 => { const c = window.__game.camera.position; return Math.hypot(c.x - p0[0], c.y - p0[1], c.z - p0[2]); }, v.p0));
            await snap(`${s.fi + 1}-board-held-${k}`); await p.waitForTimeout(1000);
          }
          if (v.over > 3.6 || !v.front || Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.95) { errors.push(`frame ${s.fi + 1}: the first view of the roof is not from behind your shoulder with the helicopter ahead (the lens ${v.over} m over your feet, lifted ${v.lift}; the helicopter at ${v.x}, ${v.y} in the frame${v.front ? '' : ', behind the lens'})`); console.log(errors[errors.length - 1]); }
          else if (v.still > 0.001 || moved > 0.05) { errors.push(`frame ${s.fi + 1}: the roof's first view does not hold still: the lens moved ${v.still.toFixed(4)} m over five frames given no time, ${moved.toFixed(3)} m in five seconds standing`); console.log(errors[errors.length - 1]); }
          else console.log(`frame ${s.fi + 1} board: from behind the shoulder (the lens ${v.over} m over your feet), the helicopter at ${v.x}, ${v.y} in the frame; five seconds standing, the lens moved ${moved.toFixed(3)} m`);
        }
        await goTo(h.at, 8); await frames(4); // (on its floor: the pad stands over the deck round it) await p.evaluate(() => { const g = window.__game; g.cam.yaw = g.player.h; g.cam.pitch = 0.3; });
        const act = await p.evaluate(() => { const a = window.__game.currentAction(); return a ? a.text : null; });
        if (act !== 'Get in the helicopter') { errors.push(`frame ${s.fi + 1}: 8 m from the helicopter E is "${act}"`); console.log(errors[errors.length - 1]); }
        await frames(4); await snap(`${s.fi + 1}-board-near`);
        await press('KeyE', true); await frames(2);
        const b = await p.evaluate(() => ({ beat: window.__game.story.state.beat, me: window.__game.player.rig.root.visible }));
        console.log(`frame ${s.fi + 1}: E beside the helicopter, the beat is ${b.beat}`);
        if (b.beat !== 'flight') { errors.push(`frame ${s.fi + 1}: E beside the helicopter, and the beat is ${b.beat}, not the flight`); console.log(errors[errors.length - 1]); }
      }
    }
    else if (s.phase === 'go' && s.beat === 'flight') { // a frame reached by air: its film plays itself out. A still through each shot; in a flight with a
      // helicopter it is in every shot until you are out of it, and you are not (you are in it)
      await mark(s, 'flight');
      if (process.env.PHONE && !seen.has(`fl-music-${s.fi}`)) { // (the flight's score from its file, once it has begun: audio.js tune)
        const m = await p.evaluate(() => { const M = window.__music, o = window.__game.overture(); return M && o && o.t > 4 ? { offline: M.offline, srcs: M.els.filter(e => e.src && !e.paused && e.duration > 0.1).map(e => e.src.replace(/^.*\//, '').replace(/\?.*$/, '')) } : null; });
        if (m) { seen.add(`fl-music-${s.fi}`); console.log(`frame ${s.fi + 1} flight music: ${m.srcs.join(', ') || 'none playing'}; scores rendered in the page ${m.offline}`);
          if (m.offline || !m.srcs.some(u => /^score-[0-9a-f]{8}\.mp3$/.test(u))) { errors.push(`frame ${s.fi + 1}: the flight's score on a phone is not its file (${m.srcs.join(', ') || 'none playing'}; ${m.offline} rendered in the page)`); console.log(errors[errors.length - 1]); } }
      }
      const f = await p.evaluate(() => { const g = window.__game, o = g.overture(); return o && o.active ? { t: o.t, shots: o.shots.map(q => ({ id: q.id, t0: q.t0, dur: q.dur })), heli: g.heli.group.visible, me: g.player.rig.root.visible, craft: g.story.state.fr.flight.craft !== false } : null; });
      const q = f && f.shots.find(q => f.t >= q.t0 + q.dur * 0.35 && !seen.has(`fl-${s.fi}-${q.id}`));
      if (q) {
        seen.add(`fl-${s.fi}-${q.id}`); await snap(`${s.fi + 1}-flight-${q.id}`);
        console.log(`frame ${s.fi + 1} flight ${q.id} at ${f.t.toFixed(1)} s: helicopter ${f.heli ? 'seen' : 'not seen'}, you ${f.me ? 'seen' : 'not seen'}`);
        if (f.craft && q.id !== 'foot' && (!f.heli || f.me)) { errors.push(`frame ${s.fi + 1}: in the flight's ${q.id} shot the helicopter is ${f.heli ? 'seen' : 'not seen'} and you are ${f.me ? 'seen' : 'not seen'}`); console.log(errors[errors.length - 1]); }
        // out of it, in the shot you are seen in: you and the dog at your heels stand outside its hull (both were once set
        // down in its cabin; tools/heli_flight.js measures the flight itself)
        if (f.craft && q.id === 'foot') {
          await frames(3);
          const o = await p.evaluate(() => { const g = window.__game, d = g.guideMade && g.guideMade(), B = g.heli.group.visible && g.heli.boxes ? g.heli.boxes() : [];
            const inn = (x, y, z, r) => B.length > 0 && !!window.OECars.pushOut(x, y, z, r, B).hit;
            return { heli: B.length, me: inn(g.player.x, g.player.y, g.player.z, 0.3), dog: d && d.ready ? inn(d.x, d.y, d.z, 0.35) : null, dogAt: d && d.ready ? [+d.x.toFixed(1), +d.y.toFixed(1)] : null }; });
          console.log(`frame ${s.fi + 1}: out of the helicopter: ${JSON.stringify(o)}`);
          if (!o.heli || o.me || o.dog) { errors.push(`frame ${s.fi + 1}: set down from the flight, ${!o.heli ? 'the helicopter is not on the ground beside you' : [o.me && 'you', o.dog && 'the dog'].filter(Boolean).join(' and ') + " in the helicopter's hull"}`); console.log(errors[errors.length - 1]); }
          await snap(`${s.fi + 1}-flight-out`);
        }
      }
    }
    else if (s.phase === 'after') await mark(s, 'after');
    // (and nobody of the crowd in front of the lens at an after, the finder's picture: frame 7's closing one had a passer-by 2 m in
    // front of it, a third of the frame, #232. A drawn walker within 5 m along the view and within its width there fails)
    if (s.phase === 'after' && !seen.has(`lensfront-${s.fi}`) && await p.evaluate(() => !!window.__game.story.finder)) { seen.add(`lensfront-${s.fi}`);
      const f = await p.evaluate(() => { const g = window.__game, c = g.camera, T = window.THREE, d = c.getWorldDirection(new T.Vector3()), out = [], R = g.crowdDraw && g.crowdDraw();
        if (R && R.active) for (const [i, r] of R.active) { if (!r.root.visible) continue; const v = r.root.position.clone().add(new T.Vector3(0, 1.2, 0)).sub(c.position), t = v.dot(d), side = v.clone().addScaledVector(d, -t).length();
          if (t > 0.3 && t < 5 && side < 0.5 + 0.35 * t) out.push(`walker ${i} ${t.toFixed(1)} m ahead, ${side.toFixed(2)} m off the axis`); }
        return out; });
      if (f.length) { errors.push(`frame ${s.fi + 1}'s after: someone of the crowd in front of the lens (${f.join('; ')})`); console.log(errors[errors.length - 1]); }
      else console.log(`frame ${s.fi + 1}'s after: nobody of the crowd within 5 m in front of the lens`);
    }
    if (s.phase === 'after' && !seen.has(`pops-${s.fi}`)) { seen.add(`pops-${s.fi}`); // (and nobody seen to jump while the finder was up, to here: #232)
      const q = await p.evaluate(() => (window.__pops || []).splice(0));
      if (q.length) { errors.push(`frame ${s.fi + 1}: ${q.length} of the crowd jumped or left the street in view with the finder up (${q.slice(0, 4).map(e => (e.gone ? `walker ${e.i} gone ${e.m} m off` : `walker ${e.i} ${e.m} m at once, ${e.at} m off`) + ` in the ${e.phase}`).join('; ')})`); console.log(errors[errors.length - 1]); }
      else console.log(`frame ${s.fi + 1}: nobody of the crowd jumped in view with the finder up`);
    }
    await p.waitForTimeout(500);
  }
  };
  await play();
  if (!boarded && await p.evaluate(() => window.__game.story.state.prints.length >= 2 && !window.__game.story.state.prints.slice(0, 2).some(q => q.plain))) await rollBoard();
  for (const n of SLIPS) if (slipAt[n] !== 2 && !(upto && n > upto) && !(+process.env.FROM >= n)) { errors.push(`frame ${n}: answered wrongly, and nobody saw through it`); console.log(errors[errors.length - 1]); }
  if (+process.env.SPEND && !spent) { errors.push(`frame ${process.env.SPEND}: was to be spent, and was not`); console.log(errors[errors.length - 1]); }
  { const fm = await p.evaluate(() => window.__findMarked || 0); if (fm) { errors.push(`frame ${fm}: its place is to be found, and a ring stands on it`); console.log(errors[errors.length - 1]); } }
  if (done) { await p.waitForTimeout(3000); await snap('end'); console.log('end', JSON.stringify(await state())); }
  { const q = await p.evaluate(() => (window.__pops || []).splice(0)); // (and nobody seen to jump with the finder up since the last after's count: the last frame's ends on its after, #232)
    if (q.length) { errors.push(`${q.length} of the crowd jumped or left the street in view with the finder up (${q.slice(0, 4).map(e => (e.gone ? `walker ${e.i} gone ${e.m} m off` : `walker ${e.i} ${e.m} m at once, ${e.at} m off`) + ` in frame ${e.fi + 1}'s ${e.phase}`).join('; ')})`); console.log(errors[errors.length - 1]); }
    else console.log('nobody of the crowd jumped in view with the finder up, to the end'); }
  if (done) {
    // under the last card time runs: whoever of tonight's people was on their way as it came up (the old woman, crossing)
    // goes on walking. She stood held in mid-step, and a player who walked on from the card found her so.
    const cast = () => p.evaluate(() => Object.entries(window.__game.story.state.cast).map(([id, f]) => ({ id, x: f.x, y: f.y, to: !!f.to })));
    const a = await cast();
    await p.waitForFunction(was => Object.entries(window.__game.story.state.cast).every(([id, f]) => { const w = was.find(q => q.id === id); return !w || !w.to || !f.to || Math.hypot(f.x - w.x, f.y - w.y) > 0.3; }), a, { timeout: 60000, polling: 250 }).catch(() => {});
    const b = await cast(), held = a.filter(w => w.to).filter(w => { const f = b.find(q => q.id === w.id); return f && f.to && Math.hypot(f.x - w.x, f.y - w.y) <= 0.3; });
    console.log(`under the last card: ${a.filter(w => w.to).length} of tonight's ${a.length} people on their way, ${held.length} held in mid-step`);
    if (held.length) errors.push(`under the last card ${held.map(w => w.id).join(', ')} stood held in mid-step: the story's people are to go on once the case is closed`);
  }
  // (not where UPTO=n stopped at a print: the case is still open there, and the camera rightly round the neck)
  if (done && !upto && await p.evaluate(() => !!(window.__game && window.__game.player.rig.oldCam))) { errors.push('the case is closed, and the camera of 1964 is still round Kagami\'s neck: it is hers again'); console.log(errors[errors.length - 1]); }
  if (!done) console.log('FAIL the last card was not reached', JSON.stringify(await state())); // (its own test: as the camera's else, it was said of every case that closed rightly)
  if (TOUCH) console.log(`touch: ${taps} taps; ${errors.filter(e => /^touch:/.test(e)).length} things that could not be tapped`);
  // (CHOOSE, ACCUSE: what was chosen was taken, and everything the story says only to one who chose it was said: each
  // line with `if: <flag>` in the frames played, heard; each such line of a frame's file, in the file; of the last card, on it)
  if (done && !upto && Object.keys(CHOOSE).length) {
    for (const f in CHOOSE) if (!chose[f]) { errors.push(`frame ${f}: the choice asked for (option ${CHOOSE[f]}) was never offered`); console.log(errors[errors.length - 1]); }
    const got = await p.evaluate(() => { const st = window.__game.story.state, e = document.getElementById('g-story-end'); return { flags: st.flags, heard: window.__heard.lines.concat(window.__game.storyLog.entries.map(q => q.text)), file: st.file.map(q => q.text), end: e ? e.textContent : '' }; }); // (the log too: a line said over the picture as time runs again is in it)
    const ep = (((JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'cities', 'shibuya', 'city.json'), 'utf8')).game || {}).story || {}).episodes || [])[0] || {};
    const SET = ['accused', 'named_akira', 'named_works', 'withheld'].filter(k => got.flags[k]), want = [];
    const walk = (o, where) => { if (Array.isArray(o)) o.forEach(v => walk(v, where)); else if (o && typeof o === 'object') { if (typeof o.if === 'string' && SET.includes(o.if) && typeof o.say === 'string' && !(o.not && got.flags[o.not])) want.push([where, o.if, o.say]); for (const k in o) walk(o[k], k === 'file' ? 'file' : where); } };
    (ep.frames || []).forEach(f => walk(f, 'heard')); walk((ep.end || {}).line, 'end');
    const from = +process.env.FROM || 0, norm = t => String(t).replace(/\s+/g, ' ').trim();
    let n = 0;
    for (const [where, flag, say] of want) { const ok = where === 'file' ? got.file.includes(say) : where === 'end' ? norm(got.end).includes(norm(say)) : got.heard.some(l => norm(l) === norm(say) || norm(say).includes(norm(l)) && norm(l).length > 12); if (ok) n++; else { errors.push(`chose (${flag}), and never ${where === 'file' ? 'filed' : where === 'end' ? 'on the last card' : 'heard'}: "${say.slice(0, 70)}"`); console.log(errors[errors.length - 1]); } }
    console.log(`chosen: ${SET.join(', ') || 'nothing kept'}; ${n} of ${want.length} lines said only to one who chose so were ${from ? 'met (a late start)' : 'met'}`);
    if (process.env.ACCUSE && !got.flags.accused) { errors.push('ACCUSE: the false solution was to be said aloud at frame 3, and was not kept'); console.log(errors[errors.length - 1]); }
  }
  if (done && !upto) { // the last card: how the case was worked, in the file's hand; and the frames to go back into
    const c = await p.evaluate(() => { const e = document.getElementById('g-story-end'), w = e.querySelector('.worked'); if (w) e.scrollTop = Math.max(0, w.offsetTop - e.clientHeight / 3); return { worked: w ? w.textContent : '', back: e.querySelectorAll('[data-back]').length }; });
    console.log('how the case was worked:', c.worked.slice(0, 400));
    if (!proved) { errors.push('the summation was not answered with a print'); console.log(errors[errors.length - 1]); }
    if (!c.worked || !/side by side|Every pair/.test(c.worked)) { errors.push(`the last card does not say how the case was worked: "${c.worked.slice(0, 80)}"`); console.log(errors[errors.length - 1]); }
    { const n = SLIPS.filter(n => n < 7 && slipAt[n] === 2).length; if (n && !new RegExp(`Seen through ${n === 1 ? 'once' : `${n} times`}, and asked again`).test(c.worked)) { errors.push(`the last card does not count ${n} times seen through: "${c.worked.slice(0, 200)}"`); console.log(errors[errors.length - 1]); } }
    if (SLIPS.includes(7) && !/She answered one question herself/.test(c.worked)) { errors.push(`the last card does not say she answered a question herself: "${c.worked.slice(0, 80)}"`); console.log(errors[errors.length - 1]); }
    if (+process.env.SPEND && !c.worked.includes(`Frame ${process.env.SPEND} spent`)) { errors.push(`the last card does not name frame ${process.env.SPEND}, spent`); console.log(errors[errors.length - 1]); }
    // (all seven from a play of the whole case; from a late start (FROM=n), the frames played here and the first, which is
    // always offered: the frames before n were left with no print to go back to)
    const from = +process.env.FROM || 0, backs = from ? 7 - from + 1 : 7;
    if (c.back !== backs) { errors.push(`the last card offers ${c.back} frames to go back into, not ${backs}${from ? ` (a play from frame ${from + 1})` : ''}`); console.log(errors[errors.length - 1]); }
    await snap('end-worked'); await p.evaluate(() => { const e = document.getElementById('g-story-end'), n = e.querySelector('nav.back'); if (n) e.scrollTop = Math.max(0, n.offsetTop - e.clientHeight / 2); }); await snap('end-back');
    { // the last card's Credits (credits.js): the screen comes up over the card with the map's sources on it, and Esc gives the card back
      const got = await p.evaluate(async () => {
        const b = document.querySelector('#g-story-end [data-credits]'); if (!b) return { no: 'the last card has no Credits' };
        b.click();
        const c = document.getElementById('g-credits');
        for (let i = 0; i < 100 && !(c && c.querySelector('.cr-place .cr-row')); i++) await new Promise(r => setTimeout(r, 100));
        return { up: !!c && !c.hidden, rows: c ? c.querySelectorAll('.cr-row').length : 0, attr: c ? c.querySelectorAll('.cr-attr li').length : 0, sw: c ? c.querySelectorAll('[data-measure]').length : 0, ver: c ? (c.querySelector('#g-credits-ver') || {}).textContent : '' };
      });
      if (got.no || !got.up || got.rows < 12 || got.attr < 4 || got.sw !== 2 || !got.ver) { errors.push(`the last card's Credits: ${JSON.stringify(got)}`); console.log(errors[errors.length - 1]); }
      else { await snap('end-credits'); console.log('credits', JSON.stringify(got)); }
      await p.keyboard.press('Escape');
      const after = await p.evaluate(() => ({ up: !document.getElementById('g-credits').hidden, card: document.getElementById('g-story-end').classList.contains('on') }));
      if (after.up || !after.card) { errors.push(`Esc on the Credits did not give the last card back: ${JSON.stringify(after)}`); console.log(errors[errors.length - 1]); }
    }
    if (!(+process.env.BACKTO > 1)) { // the last card's Walk Shibuya: the walk (walk.js) taken up where the case ended, in the same night, on the same page
      await p.evaluate(() => { window.__samePage = true; document.querySelector('#g-story-end button.go').click(); });
      // (the card goes 1.2 s after the walk is taken up, by the page's own timer; on a software renderer the walk's first
      // frames can hold the page's thread past a fixed wait, so wait for the card to go, ten seconds at most)
      await p.waitForFunction(() => { const e = document.getElementById('g-story-end'), s = document.getElementById('game-stage'); return !e.classList.contains('on') && s.classList.contains('walk-on'); }, null, { timeout: 10000, polling: 250 }).catch(() => {});
      await p.waitForTimeout(500);
      const look = () => p.evaluate(() => { const g = window.__game, s = document.getElementById('game-stage'), c = g.clock, pad = n => String(n).padStart(2, '0');
        return { same: !!window.__samePage, on: s.classList.contains('walk-on'), card: document.getElementById('g-story-end').classList.contains('on'), title: !document.getElementById('g-title').hidden,
          at: (document.querySelector('#g-walk-where .t') || {}).textContent || '', clock: `${pad(Math.floor(c.min / 60))}:${pad(Math.floor(c.min) % 60)}`, phase: g.story.state.phase, cast: Object.keys(g.story.state.cast).length, light: g.lights() }; });
      const w = await look();
      console.log('the last card\'s walk:', JSON.stringify(w));
      if (!w.same) errors.push('the last card\'s Walk Shibuya opened the page again: the walk is to go on in the same night');
      else if (!w.on || w.card || w.title) errors.push(`the last card's Walk Shibuya did not take up the walk where the case ended (walk ${w.on}, card ${w.card}, title ${w.title})`);
      else if (w.at !== w.clock || w.light.story || w.light.objective) errors.push(`the walk after the case: the corner says ${w.at} at ${w.clock}, a light stands (${JSON.stringify(w.light)})`);
      if (errors.length && /last card's|walk after the case/.test(errors[errors.length - 1])) console.log(errors[errors.length - 1]);
      await snap('end-walk');
      // the lens turned away from the evening's people and a few seconds given: they go once it no longer has them
      await p.evaluate(async () => { const g = window.__game; g.cam.yaw += Math.PI; for (let i = 0; i < 60; i++) { g.frame(0.05); if (i % 10 === 9) await new Promise(r => setTimeout(r, 0)); } });
      // (and the page's own frames given time with the lens held there: the story's tick, which lets them go, runs in the
      // page's frame, not in the frames stepped here; on a loaded machine none had come before they were counted)
      if (w.cast) await p.waitForFunction(n => Object.keys(window.__game.story.state.cast).length < n, w.cast, { timeout: 60000, polling: 250 }).catch(() => {});
      const w2 = await look();
      console.log(`the walk after the case: the evening's cast ${w.cast} as it began, ${w2.cast} once the lens had turned away`);
      if (w.cast && w2.cast >= w.cast) errors.push(`the walk after the case: the evening's ${w.cast} people still stand there with the lens turned away from them`);
      await snap('end-walk-away');
    }
    if (+process.env.BACKTO > 1) { // into a frame again from the last card: the roll as it was on arriving there, played to its print
      const n = +process.env.BACKTO;
      expectReload(p, `the last card's back into frame ${n}`); await clickEl(`#g-story-end [data-back="${n - 1}"]`);
      await p.waitForFunction(() => !window.__game || !window.__game.story || window.__game.story.state.phase === 'idle', null, { timeout: 120000, polling: 200 }).catch(() => {});
      await p.waitForFunction(() => window.__game && window.__game.story && !['idle', 'dressed'].includes(window.__game.story.state.phase), null, { timeout: 900000, polling: 500 });
      const a = await p.evaluate(() => { const st = window.__game.story.state; return { fi: st.fi, prints: st.prints.length, flags: Object.keys(st.flags).length, file: st.file.length }; });
      console.log(`back into frame ${n}:`, JSON.stringify(a));
      if (a.fi !== n - 1 || a.prints !== n - 1) { errors.push(`back into frame ${n}: at frame ${a.fi + 1} with ${a.prints} prints`); console.log(errors[errors.length - 1]); }
      upto = n; done = false; await play();
      const q = await p.evaluate(() => window.__game.story.state.prints.length);
      if (!done || q !== n) { errors.push(`frame ${n} entered again did not play to its print (${q} prints)`); console.log(errors[errors.length - 1]); }
      else { console.log(`frame ${n} entered again: played to its print`); await snap(`again-${n}-print`); }
    }
  }
  { // the crowd inside the story's people, the player or the guide, as the game noted it every frame (issue 65)
    const B = await p.evaluate(() => window.__game ? window.__bodies || [] : []).catch(() => []);
    const Gd = await p.evaluate(() => window.__guarded || []).catch(() => []);
    for (const r of Gd.slice(0, 40)) console.log(`note guard: one of the crowd (${r.crowd}, ${r.ph}) moved out of ${r.who}, ${r.d} m from them, at ${r.at}, (${r.x}, ${r.y})`);
    console.log(`guard: the last guard moved ${Gd.length} of the crowd out of someone not of it${Gd.length ? ` (${[...new Set(Gd.map(r => r.at))].slice(0, 6).join('; ')})` : ''}`);
    for (const r of B) console.log(`${r.who.startsWith('npc ') ? 'note' : 'FAIL'} bodies: one of the crowd (${r.crowd}, ${r.ph}) ${r.d} m from ${r.who} at ${r.at}, (${r.x}, ${r.y}), ${r.n} frames`);
    const hard = B.filter(r => !r.who.startsWith('npc '));
    if (hard.length) errors.push(`bodies: ${hard.length} times one of the crowd was drawn inside someone not of it (${[...new Set(hard.map(r => r.who))].join(', ')})`);
    else console.log(`bodies: nobody of the crowd drawn within 0.45 m of the story's people, the player or the guide${B.length ? ` (${B.length} near a map's NPC)` : ''}`);
  }
  { // a trunk or a lamp post between the chase lens and you, over 30% of the frame's width, for a second or more (#233)
    const T = await p.evaluate(() => window.__trunks || []).catch(() => []);
    for (const r of T.slice(0, 12)) console.log(`FAIL trunk: a ${r.kind} at (${r.x}, ${r.y}) ${r.m} m from the lens hid you, ${Math.round(r.share * 100)}% of the frame's width (aspect ${r.aspect}), at ${r.at}`);
    if (T.length) errors.push(`trunk: ${T.length} times a trunk or a post between the chase lens and you filled the frame for a second or more (${[...new Set(T.map(r => r.at))].slice(0, 6).join('; ')})`);
    else console.log('trunk: no trunk or post between the chase lens and you filled the frame for a second');
  }
  { // one body in another, a limb in a body, a foot off its floor, a body in a thing: every frame of the play (issue 126)
    const R = await clipProbe.report(p);
    if (process.env.CLIP_OUT && R) fs.writeFileSync(process.env.CLIP_OUT, JSON.stringify(R, null, 1));
    const { hard } = clipProbe.print(R);
    if (!R || R.err) errors.push(`clip: the probe did not measure (${R ? R.err : 'not in the page'})`);
    if (hard.length) errors.push(`clip: ${hard.length} cases of a body in another or a foot off its floor (${[...new Set(hard.map(c => `${c.a} / ${c.b}`))].slice(0, 8).join('; ')})`);
  }
  { // the lens under the station's free passage's ceiling, every frame on foot in it (issue 208)
    const C = await ceilWatch.report(p);
    for (const r of ((C && C.bad) || []).slice(0, 8)) console.log(`FAIL ceiling: frame ${r.frame} ${r.beat}, at ${r.at}, the lens ${r.over} m over the passage's floor (its ceiling at ${ceilWatch.H})${r.shot ? ', in a shot' : ''}`);
    if (C && C.bad.length) errors.push(`ceiling: ${C.bad.length} frames with the lens through the passage's ceiling`);
    else console.log(`ceiling: the lens under the passage's ceiling${C && C.frames ? ` in all ${C.frames} frames on foot in it` : ' (the play did not go through it)'}`);
  }
  { // the camera's window in nobody's body, every frame of the play and from every camera (issue 226: tools/cam_intrude.js)
    const ci = require('./cam_intrude'), R = await ci.report(p), { errs } = ci.print(R);
    if (!R || R.err) errors.push(`cam: the window was not measured (${R ? R.err : 'not in the page'})`);
    for (const e of errs) { errors.push(`cam: ${e}`); console.log(errors[errors.length - 1]); }
  }
  { // nobody of the crowd paced, on any street the play was in (issue 168)
    if (process.env.STOPCOST) { const sc = require('./stop_cost'); sc.print(await sc.report(p)); }
    if (process.env.GLCALLS) { const gc = require('./gl_calls'); gc.printBeats(await gc.beats(p)); }
    const { hard } = pacing.print(await pacing.report(p));
    if (hard.length) errors.push(`pacing: ${hard.length} of the crowd walked to and fro (${hard.slice(0, 6).map(q => `walker ${q.id} at (${q.x}, ${q.y}), frame ${q.frame}`).join('; ')})`);
  }
  for (const e of errors) console.log('error:', lost.tag() + String(e).slice(0, 300)); // (each, at the end: some are found before the play, and were counted but not said)
  console.log(`stills: ${ST.n}, ${(ST.whole / 1000).toFixed(0)} s drawing their frames whole, ${(ST.shot / 1000).toFixed(0)} s taking them`);
  console.log(`played in ${Math.round((Date.now() - t0) / 1000)} s; page errors: ${errors.length}${DRAW > 1 ? `; ${await p.evaluate(() => (D => `${D.drawn} of ${D.steps} frames drawn (${D.own} between the stills; ${D.frames} asked for), ${(D.js / Math.max(1, D.steps)).toFixed(1)} ms of script in each, ${D.skipped} renders skipped; ${['off', 'on', 'still'].map(k => (x => `${{ off: 'not drawn', on: 'drawn', still: 'across a still' }[k]} ${x.n}: ${(x.wall / Math.max(1, x.n)).toFixed(0)} ms of the wall each, ${(x.js / Math.max(1, x.n)).toFixed(0)} of script, ${(x.wall / 1000).toFixed(0)} s in all, the game's clock ${(x.game / Math.max(1e-3, x.wall / 1000)).toFixed(2)} of the wall's`)(D.split[k])).join('; ')}`)(window.__draw))}` : ''}`);
  if (process.env.GLCOUNT) console.log('WebGL calls in frames not drawn:', await p.evaluate(() => JSON.stringify(Object.entries(window.__draw.glIn).sort((a, b) => b[1] - a[1]).slice(0, 30))), '\nand outside the frames:', await p.evaluate(() => JSON.stringify(Object.entries(window.__draw.glOut).sort((a, b) => b[1] - a[1]).slice(0, 40))));
  // PRINTS=dir: the photographs taken, as files (the loading screen's frames are made from them)
  if (process.env.PRINTS) { fs.mkdirSync(process.env.PRINTS, { recursive: true }); const pr = await p.evaluate(() => window.__game.story.state.prints.map(q => q.src)); pr.forEach((src, i) => { if (src) fs.writeFileSync(`${process.env.PRINTS}/frame-${i + 1}.jpg`, Buffer.from(src.split(',')[1], 'base64')); }); }
  if (p.fpsRead) await p.fpsRead();
  await b.close();
  process.exit(done && !errors.length ? 0 : 1);
})();
