// The frame-time governor (web/quality.js) against devices modelled as a frame's cost for a scale and the extras,
// shown through vertical sync as a display shows them (a frame that misses a refresh waits for the next). No
// browser: the governor is a function of the frame times it is fed. Checked:
//   - a fast device with no record is at its ceiling with every extra within twenty seconds;
//   - a device whose limit lies between two steps (issue 485: an Apple M3 in Shibuya went between 0.6 and 0.8 every
//     few seconds all session) settles: after its first two minutes, no more than a change a minute on average
//     over the next twenty, and none of them a change of the extras;
//   - it still gives way at once when the scene gets heavier, and has its resolution and the display's full rate
//     back a minute after the scene is light again;
//   - a device that cannot hold the floor ends there with the extras shed, and one far out of its depth (frames of
//     a third of a second) is there within five seconds;
//   - a device with a record starts from it and does not try the step above for half a minute;
//   - frames that cost the same at any resolution get the resolution back (web/quality.js `flat`), and frames
//     that are half pixels keep the floor;
//   - hitches (a frame in thirty held up by the page's script) are not taken for the scene's cost (issue 184);
//   - a device under twenty frames a second with nothing left to give steps a tier down, and back up once it holds
//     its ceiling for a minute; a fast device, a hitchy one and one settled below its ceiling keep their tier.
//   node tools/governor_unit.js [--old <path to an older quality.js>]    (prints each model's changes a minute)
const fs = require('fs'), path = require('path'), vm = require('vm');
const file = process.argv.includes('--old') ? process.argv[process.argv.indexOf('--old') + 1] : path.join(__dirname, '..', 'web', 'quality.js');
function load() {
  const window = {}, ctx = { window, navigator: { webdriver: false }, location: { search: '', hash: '' }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { createElement: () => ({ getContext: () => null }) }, matchMedia: () => ({ matches: false }), innerWidth: 1440, innerHeight: 900, console, Math, Date };
  ctx.globalThis = ctx; window.devicePixelRatio = 2;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx);
  return window.OEQuality;
}
// a seeded noise, so that a run is the same every time
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// seconds of play on a 60 Hz display: cost(scale, extras, t) ms of work a frame, ±6% from frame to frame
function play(g, seconds, cost, seed = 1) {
  const R = 1000 / 60, rnd = rng(seed), log = [];
  let t = g.__t || 1e6, prev = `${g.scale.toFixed(2)}/${g.extras}`;
  const t0 = t;
  if (!g.__t) for (let i = 0; i < 120; i++) { t += R; g.raf(t); } // (the display's rate, as the page's frames show it)
  while (t - t0 < seconds * 1000) {
    const ms = cost(g.scale, g.extras, (t - t0) / 1000) * (0.94 + 0.12 * rnd());
    t += Math.max(1, Math.ceil(ms / R - 1e-9)) * R;
    g.raf(t); g.tick(t);
    const now = `${g.scale.toFixed(2)}/${g.extras}`;
    if (now !== prev) { log.push({ s: (t - t0) / 1000, from: prev, to: now }); prev = now; }
  }
  g.__t = t; // (the next piece of play goes on from here)
  return log;
}
const between = (log, a, b) => log.filter(c => c.s >= a && c.s < b);
const extrasMoved = c => c.from.split('/')[1] !== c.to.split('/')[1];
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const Q = load();
const gov = () => { const g = Q.governor({ auto: true }); g.max = 1; return g; };
const has = k => typeof gov()[k] === 'function';

// 1. a fast device
{ const g = gov(); g.startLow(); play(g, 20, (s, e) => 3 + 6 * s * s + 2 * e);
  check(g.scale === 1 && g.extras === 1, `a fast device with no record is at its ceiling with every extra in twenty seconds (${g.scale.toFixed(2)}/${g.extras})`); }

// 2. the limit between two steps: 0.85 fits and 0.9 does not, with the extras shed (the M3's place)
for (const [name, cost] of [['between 0.85 and 0.90, the extras shed', (s, e) => 5.2 + 13.5 * s * s + 4 * e], ['between 0.65 and 0.70', (s, e) => 9 + 16.5 * s * s + 3 * e], ['on the edge at 0.80 with half the extras', (s, e) => 4 + 15 * s * s + 6.2 * e],
  ['whose scene drifts by a tenth as the player walks (a try holds, and fails seconds later)', (s, e, t) => (8 + 17 * s * s + 3 * e) * (1 + 0.1 * Math.sin(t / 5.3) * Math.sin(t / 17))]]) {
  const g = gov(); g.startLow();
  const log = play(g, 22 * 60, cost, 7), late = between(log, 120, 22 * 60), ex = late.filter(extrasMoved).length;
  const first = between(log, 0, 120).length, worst = Math.max(...Array.from({ length: 20 }, (_, i) => between(log, 120 + i * 60, 180 + i * 60).length));
  if (process.env.SHOW) console.log(log.map(c => `${Math.round(c.s)}s ${c.to}`).join('  '));
  check(late.length <= 20 && worst <= 6 && ex <= 2, `a device ${name} settles: ${late.length} changes in the twenty minutes after its first two (${first} in those; the busiest minute ${worst}; of the extras ${ex}), at ${g.scale.toFixed(2)}/${g.extras}`);
}

// 3. a heavier scene for half a minute, then light again
{ const g = gov(); g.startLow();
  const cost = (s, e) => 5.2 + 13.5 * s * s + 4 * e, st = () => `${g.scale.toFixed(2)}/${g.extras}`;
  play(g, 300, cost, 3);
  const before = st(), b = g.scale + g.extras;
  play(g, 6, (s, e) => cost(s, e) * 1.6, 4);
  const during = st(), d = g.scale + g.extras;
  play(g, 26, (s, e) => cost(s, e) * 1.6, 5);
  const low = st();
  play(g, 60, cost, 6);
  check(d < b, `a heavier scene: it gives way within six seconds (${before} → ${during}, then ${low})`);
  check(g.scale >= +before.split('/')[0] - 1e-9 && g.targetMs < 20, `and has its resolution back a minute after the scene is light again (${st()} from ${before}, by way of ${low}; aiming at ${Math.round(1000 / g.targetMs)} frames a second)`);
}

// 4. a device that cannot hold the floor
{ const g = gov(); g.startLow(); play(g, 90, (s, e) => 30 + 40 * s * s + 8 * e);
  check(Math.abs(g.scale - g.min) < 1e-6 && g.extras === 0, `a device that cannot hold the floor ends there, the extras shed (${g.scale.toFixed(2)}/${g.extras})`); }
// 4b. a device far out of its depth: frames of a third of a second and more (they were left out as stalls, and such a
// device was never governed: an Apple M3 in the story's rain, at five frames a second for minutes)
{ const g = gov(); g.startLow(); play(g, 5, (s, e) => 200 + 300 * s * s + 60 * e);
  check(Math.abs(g.scale - g.min) < 1e-6 && g.extras === 0, `a device at three frames a second is at the floor with the extras shed within five seconds (${g.scale.toFixed(2)}/${g.extras})`); }

// 5. a record: settled from the start
if (has('resume')) { const g = gov(); g.resume(0.85, 0);
  const log = play(g, 25, (s, e) => 5.2 + 13.5 * s * s + 4 * e, 5), all = play(g, 600, (s, e) => 5.2 + 13.5 * s * s + 4 * e, 6);
  check(log.length === 0 && all.length <= 12, `a device with a record starts from it and holds it (${log.length} changes in its first 25 s, ${all.length} in the next ten minutes)`); }

// 6. frames that cost the same at any resolution (a phone in a dense city: its draw calls and its triangles): the
// floor buys them nothing, so the resolution comes back while they are still slow, and then stays put
for (const [name, cost] of [['at 40 a second', () => 24], ['at 25 a second', () => 38]]) {
  if (!Object.getOwnPropertyDescriptor(gov(), 'flat')) break; // (--old: a governor from before it)
  const g = gov(); g.startLow();
  const log = play(g, 120, cost, 8), late = play(g, 20 * 60, cost, 9);
  if (process.env.SHOW) console.log(log.concat(late).map(c => `${Math.round(c.s)}s ${c.to}`).join('  '));
  check(g.scale >= 0.8 - 1e-9 && late.length <= 20, `frames as slow at any resolution, ${name}: the resolution is given back (${g.scale.toFixed(2)}/${g.extras} after two minutes and twenty more; ${log.length} changes, then ${late.length})`);
}
// and where the pixels are half of a slow frame, the floor is kept: it was worth having
{ const g = gov(); g.startLow(); play(g, 120, s => 14 + 30 * s * s, 10);
  check(Math.abs(g.scale - g.min) < 1e-6, `frames that are half pixels keep the floor (${g.scale.toFixed(2)}/${g.extras})`); }
// 7. hitches are not load (issue 184): a device whose scene costs it 4 to 13 ms, with 3 frames in 100 held up 60 to 140 ms
// by the page's script and one in 300 by 300 ms (a model arriving, a texture sent), keeps its ceiling with every
// extra. (The governor took each hitch for the scene's cost: modelled, such a device ended at 0.45 with every extra
// shed, as an Apple M3 at 59 frames a second sat at 0.45 to 0.55 for hours.)
{ const g = Q.governor({ auto: true, min: 0.45, mid: 0.7 }); g.max = 1; g.startLow();
  const r = rng(42);
  play(g, 600, (s, e) => { const x = r(); return x < 0.003 ? 300 : x < 0.03 ? 60 + 80 * r() : 4 + 7 * s * s + 2 * e; }, 3);
  check(g.scale === 1 && g.extras === 1, `a light scene with 3% hitches keeps its ceiling and every extra (${g.scale.toFixed(2)}/${g.extras})`); }

// 8. a tier down, and back up (issue 184 item 2): the game's part modelled (each tier down draws the scene at
// 0.55 of the pixels' cost of the one above, and the rest of the frame at 0.8)
if (has('onTier')) {
  const tiered = (g, base) => {
    let tier = 0; const asks = [];
    g.tierRoom = 2; g.tierDown = 0; g.upWait = 60000;
    g.onTier(d => { tier = Math.max(0, Math.min(2, tier - d)); g.tierDown = tier; g.tierRoom = 2 - tier; asks.push({ d, t: g.__t }); });
    return { asks, get tier() { return tier; }, cost: (s, e, t) => base(s, e, t) * [1, 0.7, 0.5][tier] };
  };
  // a Mac's Safari: 13 to 26 frames a second at its floor with the extras shed, on the high tier
  { const g = Q.governor({ auto: true, min: 0.45, mid: 0.7 }); g.max = 1; g.startLow();
    const T = tiered(g, (s, e) => 18 + 70 * s * s + 14 * e);
    play(g, 30, T.cost, 11); const at30 = T.tier;
    play(g, 90, T.cost, 12);
    check(at30 >= 1 && T.tier === 2 && T.asks.every(a => a.d < 0), `a device under 20 frames a second at its floor steps a tier down within thirty seconds (${at30} down at 30 s) and on to low (${T.tier} down at two minutes)`);
    // the scene lightens (the device was busy, or the player went where there is less to draw): back up after a minute held
    const T2 = { n: T.asks.length };
    play(g, 200, (s, e) => (4 + 6 * s * s + 2 * e) * [1, 0.7, 0.5][T.tier], 13);
    check(T.tier < 2 && T.asks.slice(T2.n).every(a => a.d > 0), `and climbs back a tier after a minute held at its ceiling (${T.tier} down, ${T.asks.length - T2.n} up)`);
  }
  // a fast device, and the light one with hitches, never step down
  for (const [name, cost] of [['a fast device', (s, e) => 3 + 6 * s * s + 2 * e], ['a light scene with hitches', (() => { const r = rng(5); return (s, e) => { const x = r(); return x < 0.03 ? 60 + 80 * r() : 4 + 7 * s * s + 2 * e; }; })()]]) {
    const g = Q.governor({ auto: true, min: 0.45, mid: 0.7 }); g.max = 1; g.startLow();
    const T = tiered(g, cost); play(g, 300, T.cost, 14);
    check(T.asks.length === 0, `${name} keeps its tier (${T.asks.length} steps in five minutes)`);
  }
  // a device at its limit between two steps of resolution, at 60 frames a second, keeps its tier
  { const g = gov(); g.startLow(); const T = tiered(g, (s, e) => 5.2 + 13.5 * s * s + 4 * e); play(g, 600, T.cost, 15);
    check(T.asks.length === 0, `a device settled below its ceiling keeps its tier (${T.asks.length} steps in ten minutes, at ${g.scale.toFixed(2)}/${g.extras})`); }
}
// 9. the tier a desktop draws at (quality.js auto, tierStep, issue 184), on a WebGL 2 context faked as a desktop GPU's
function desktop(ua) {
  const store = new Map(), window = { devicePixelRatio: 2 };
  const gl = { MAX_TEXTURE_SIZE: 1, MAX_SAMPLES: 2, RENDERER: 3, FRAMEBUFFER: 4, FRAMEBUFFER_COMPLETE: 5, TEXTURE_2D: 6, RGBA16F: 7, RGBA: 8, HALF_FLOAT: 9, COLOR_ATTACHMENT0: 10, RENDERBUFFER: 11,
    getParameter: k => ({ 1: 16384, 2: 8, 3: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3)' })[k], getExtension: () => null, getSupportedExtensions: () => [], getError: () => 0,
    createFramebuffer() {}, bindFramebuffer() {}, deleteFramebuffer() {}, createTexture() {}, bindTexture() {}, texImage2D() {}, framebufferTexture2D() {}, deleteTexture() {},
    createRenderbuffer() {}, bindRenderbuffer() {}, renderbufferStorageMultisample() {}, framebufferRenderbuffer() {}, deleteRenderbuffer() {}, checkFramebufferStatus: () => 5 };
  const ctx = { window, navigator: { webdriver: false, userAgent: ua, maxTouchPoints: 0, hardwareConcurrency: 8, deviceMemory: 8 }, location: { search: '', hash: '' },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    document: { createElement: () => ({ getContext: () => gl }), documentElement: { dataset: { map: 'shibuya' } }, hidden: false }, matchMedia: () => ({ matches: false }), innerWidth: 1440, innerHeight: 900, console, Math, Date, JSON };
  ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx);
  return window.OEQuality;
}
if (desktop('x').tierStep) {
  const chrome = desktop('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36');
  const seen = [chrome.tier().name, chrome.city().samples];
  chrome.tierStep(-1); seen.push(chrome.tier().name, chrome.city().samples, chrome.room());
  chrome.tierStep(-1); chrome.tierStep(-1); seen.push(chrome.tier().name, chrome.room());
  chrome.tierStep(1); seen.push(chrome.tier().name, chrome.stepped().wait);
  chrome.tierStep(-1); seen.push(chrome.stepped().wait); // (a climb that failed at once: the next waits twice as long)
  check(seen.join(' ') === 'high 4 medium 2 1 low 0 medium 60000 120000', `a desktop steps high → medium → low and no lower, back up, and waits twice as long after a climb that failed (${seen.join(' ')})`);
  const safari = desktop('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15');
  check(safari.tier().name === 'medium' && safari.city().samples === 0 && safari.tier().settings.samples === 0, `a Mac's Safari starts on medium without multisampling (${safari.tier().name}, ${safari.city().samples} samples)`);
}
process.exit(fails ? 1 : 0);
