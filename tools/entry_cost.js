// What the entry costs a phone's main thread: the tap on the title's Play and the first seconds of the opening (the
// owner's iPhone, November 2026: the tap took 4.4 s to answer, and the opening had six hitches, the worst 0.9 s).
// Loads the story as a phone, waits on the title, taps Play, and reports the time from the tap to the frame after it, every
// frame of the opening longer than 100 ms, the long animation frames' scripts (Chromium's Long Animation Frames API), and
// a CPU profile's heaviest functions in the tap and in the hitches (self time, by function and file).
//   python3 -m http.server 8800 --directory web &
//   NODE_PATH=$(npm root -g) xvfb-run -a node tools/entry_cost.js [out_dir] [WxH]
// SECONDS=n: how much of the opening to watch (20). WAIT=n: seconds on the title before the tap (7). IOS=1: as an iPhone's Safari (its user agent). The page is
// drawn by a software renderer here: what costs most is the thing to read, not the milliseconds.
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/entry-cost', size = '390x844'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500, SECONDS = +(process.env.SECONDS || 20);
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
  const p = await b.newPage(Object.assign({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone }, process.env.IOS ? { userAgent: IOS_UA } : {}));
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  // every frame's time, and the long animation frames with their scripts
  await p.addInitScript(() => {
    const F = window.__frames = [], L = window.__loaf = [];
    const tick = t => { F.push(t); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    // the renderer, for the objects whose programs the tap made (three.js is a plain object on window: index.html)
    addEventListener('three-ready', () => { const R = THREE.WebGLRenderer; THREE.WebGLRenderer = class extends R { constructor(...a) { super(...a); window.__renderer = this; } }; }, { once: true });
    // the shader programs linked, with three.js's name for each (its SHADER_NAME) and when: what the tap compiles
    const G = window.__programs = [], P = WebGL2RenderingContext.prototype, src = new WeakMap(), att = new WeakMap();
    const ss = P.shaderSource; P.shaderSource = function (sh, s) { src.set(sh, s); return ss.call(this, sh, s); };
    const as = P.attachShader; P.attachShader = function (pr, sh) {
      // (three.js's SHADER_NAME, the material's name; for one without, its type and the first uniforms it declares)
      const t = src.get(sh) || '', m = /#define SHADER_NAME (.+)/.exec(t), u = [...t.matchAll(/uniform\s+\w+\s+(\w+)/g)].map(x => x[1]).filter(x => !/^(modelMatrix|modelViewMatrix|projectionMatrix|viewMatrix|normalMatrix|cameraPosition|isOrthographic|toneMappingExposure|logDepthBufFC)$/.test(x)).slice(0, 3);
      const defs = [...t.matchAll(/#define (USE_\w+|STANDARD|PHYSICAL|DOUBLE_SIDED|FLIP_SIDED|DEPTH_PACKING|DISTANCE)\b/g)].map(x => x[1].replace(/^USE_/, '').toLowerCase()).filter(x => !/^(fog|shadowmap|uv|map|normalmap|color|alpha_hash|batching_color)$/.test(x));
      if (m) att.set(pr, m[1]); else if (!att.has(pr) && /gl_Position/.test(t)) att.set(pr, `(${defs.join(' ') || 'raw'}${defs.length ? '' : ` ${u.join(' ')}`})`);
      return as.call(this, pr, sh); };
    const lp = P.linkProgram; P.linkProgram = function (pr) { G.push({ t: performance.now(), name: att.get(pr) || '(unnamed)' }); return lp.call(this, pr); };
    // a program's first use reads back its log (three.js's check): a wait on the GPU, named here with how long it took
    const U = window.__firstUse = [], gl = P.getProgramInfoLog;
    P.getProgramInfoLog = function (pr) { const t = performance.now(), r = gl.call(this, pr); U.push({ t, ms: performance.now() - t, name: att.get(pr) || '(unnamed)' }); return r; };
    try {
      new PerformanceObserver(list => { for (const e of list.getEntries()) L.push({ start: e.startTime, dur: e.duration, block: e.blockingDuration, render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0,
        scripts: (e.scripts || []).map(s => ({ dur: s.duration, fn: s.sourceFunctionName, url: (s.sourceURL || '').replace(/^.*\/web\//, '').replace(/^https?:\/\/[^/]+\//, ''), inv: s.invoker })) }); })
        .observe({ type: 'long-animation-frame', buffered: true });
    } catch (e) { /* no LoAF */ }
  });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${process.env.Q || ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1000 * +(process.env.WAIT || 7)); // (the owner tapped Play 7 s after the title came up)
  const hs = await p.evaluate(() => { const h = window.__game.hero && window.__game.hero(); return h ? h.state().map(l => `${l.id} ${l.state}`).join(', ') : 'none'; });
  console.log(`hero level at the tap: ${hs}`);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
  // (the newest program three.js had made before the tap: the objects drawn with one made after are listed below)
  const idBefore = await p.evaluate(() => { const r = window.__renderer; return r ? Math.max(0, ...r.info.programs.map(q => q.id)) : 0; });
  const t0 = await p.evaluate(() => { const t = performance.now(); window.__tap = t; document.getElementById('gt-play').click(); return t; });
  const answered = await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(t => r(t)))));
  // the objects the tap's frame drew with programs made in it: what was not warmed behind the title
  const fresh = await p.evaluate(id0 => {
    const r = window.__renderer, out = new Map(); if (!r) return [];
    const path = o => { const n = []; for (let q = o; q && n.length < 4; q = q.parent) n.push(q.name || q.type); return n.join(' < '); };
    window.__game.world.traverse(o => { for (const m of [].concat(o.material || [])) { const pr = r.properties.get(m).currentProgram; if (pr && pr.id > id0) { const k = `${m.type} "${m.name}" on ${o.isInstancedMesh ? 'InstancedMesh' : o.type} ${path(o)}`; out.set(k, (out.get(k) || 0) + 1); } } });
    return [...out].map(([k, v]) => `${v}x ${k}`);
  }, idBefore);
  console.log(`drawn with programs the tap made:\n  ${fresh.join('\n  ') || '(none found in the world)'}`);
  await p.waitForTimeout(SECONDS * 1000);
  const { profile } = await cdp.send('Profiler.stop');
  const R = await p.evaluate(t0 => ({ programs: window.__programs.filter(g => g.t >= t0).map(g => [Math.round(g.t - t0), g.name]), before: window.__programs.filter(g => g.t < t0).length, frames: window.__frames.filter(t => t >= t0), loaf: window.__loaf.filter(e => e.start + e.dur >= t0), overture: !!(window.__game.overture() && window.__game.overture().active) }), t0);
  // frames: the gaps
  const gaps = []; for (let i = 1; i < R.frames.length; i++) gaps.push([R.frames[i - 1], R.frames[i] - R.frames[i - 1]]);
  const long = gaps.filter(g => g[1] > 100), sorted = gaps.map(g => g[1]).sort((a, b) => a - b), q = f => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))] || 0;
  console.log(`tap to the frame after it: ${(answered - t0).toFixed(0)} ms`);
  const reads = await p.evaluate(([t0, t1]) => window.__firstUse.filter(u => u.t >= t0 && u.t <= t1).map(u => `${u.name} ${u.ms.toFixed(0)}`), [t0, answered]);
  console.log(`programs first used in the tap (ms waited): ${reads.join(', ') || 'none'}`);
  const inTap = R.programs.filter(g => g[0] <= answered - t0), byName = new Map();
  for (const [, nm] of R.programs) byName.set(nm, (byName.get(nm) || 0) + 1);
  console.log(`shader programs: ${R.before} before the tap, ${inTap.length} linked in the tap, ${R.programs.length} in the ${SECONDS} s after it: ${[...byName].map(([k, v]) => `${k}${v > 1 ? ` x${v}` : ''}`).join(', ')}`);
  console.log(`  after the tap, by time: ${R.programs.filter(g => g[0] > answered - t0).map(g => `${(g[0] / 1000).toFixed(1)}s ${g[1]}`).join(', ')}`);
  console.log(`opening, ${SECONDS} s: ${R.frames.length} frames, median ${q(0.5).toFixed(0)} ms, 95th ${q(0.95).toFixed(0)} ms, ${long.length} over 100 ms: ${long.map(g => `${((g[0] - t0) / 1000).toFixed(1)}s ${g[1].toFixed(0)}`).join(', ')}`);
  // the profile's self time in windows: the tap (to the frame after it) and the hitches
  const nodes = new Map(profile.nodes.map(n => [n.id, n])), dt = profile.timeDeltas, base = profile.startTime / 1000;
  const name = n => { const c = n.callFrame, u = c.url.replace(/^.*\/web\//, '').replace(/^https?:\/\/[^/]+\//, ''); return `${c.functionName || '(anon)'} ${u ? `${u}:${c.lineNumber + 1}` : ''}`.trim(); };
  // (the profile's clock is the trace clock: line it up by the first sample at or after the tap, taking the page's
  // performance.now() offset from the CPU profile start through Date-free arithmetic: both are monotonic, and the
  // first sample is within a millisecond of Profiler.start, just before the tap)
  let t = base; const samples = [];
  for (let i = 0; i < profile.samples.length; i++) { t += dt[i] / 1000; samples.push([t, profile.samples[i]]); }
  const off = samples.length ? samples[0][0] : 0;
  const windows = [['tap', 0, answered - t0]].concat(long.map(g => [`hitch ${((g[0] - t0) / 1000).toFixed(1)}s`, g[0] - t0, g[0] - t0 + g[1]]));
  const report = {};
  for (const [label, a, z] of windows) {
    const self = new Map(); let total = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i][0] - off; if (s < a || s > z) continue;
      const d = i + 1 < samples.length ? samples[i + 1][0] - samples[i][0] : 0, n = nodes.get(samples[i][1]);
      if (!n || n.callFrame.functionName === '(idle)') continue;
      const k = name(n); self.set(k, (self.get(k) || 0) + d); total += d;
    }
    const top = [...self].sort((x, y) => y[1] - x[1]).slice(0, label === 'tap' ? 14 : 6);
    report[label] = { ms: z - a, busy: total, top };
    console.log(`\n${label}: ${(z - a).toFixed(0)} ms, ${total.toFixed(0)} ms of it in script or the engine`);
    for (const [k, v] of top) console.log(`  ${v.toFixed(0).padStart(6)} ms  ${k}`);
  }
  // the long animation frames' scripts over the whole watch, by function
  const by = new Map();
  for (const e of R.loaf) for (const s of e.scripts) { const k = `${s.fn || '(anon)'} ${s.url} [${s.inv}]`; by.set(k, (by.get(k) || 0) + s.dur); }
  console.log('\nlong animation frames: scripts by time');
  for (const [k, v] of [...by].sort((x, y) => y[1] - x[1]).slice(0, 12)) console.log(`  ${v.toFixed(0).padStart(6)} ms  ${k.slice(0, 160)}`);
  fs.writeFileSync(`${out}/entry-${size}.json`, JSON.stringify({ tap: answered - t0, programs: R.programs, frames: R.frames.length, long, report, loaf: R.loaf }, null, 1));
  fs.writeFileSync(`${out}/entry-${size}.cpuprofile`, JSON.stringify(profile));
  await b.close();
  if (errors.length) { console.log(`FAIL ${errors.length} page errors`); process.exit(1); }
})();
