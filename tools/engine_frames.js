// A page's frames in another engine (issues 184 and 191): the walk or the story's title opened in Playwright's WebKit
// (ENGINE=webkit; chromium with GPU=metal to set beside it) on the machine's own GPU, left to itself as a player's page
// is (no tier forced, the governor free), and read every ten seconds for SECS: the frames a second, the script's time
// inside the frame's callbacks, the WebGL draw calls and all WebGL calls a frame, and what the page says of itself
// (?telemetry=debug: its "time", "quality" and "tier_step" events, and the governor's lines on the console).
// Playwright's WebKit on a Mac is WebKit's own build with the system's frameworks: its JavaScript, WebGL (ANGLE on
// Metal) and audio are Safari's kind, but it is not Safari: no Low Power Mode, no Safari's process limits or settings.
//   python3 -m http.server 8800 --directory web &
//   ENGINE=webkit NODE_PATH=$(npm root -g) node tools/engine_frames.js [WxH] [seconds]     Q='walk=1' (default), DPR=2, HEADED=1, TIER=
const pw = require('playwright');
const { startPlay } = require('./start_play');
const [,, size = '1440x900', secs = '120'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), ENGINE = process.env.ENGINE || 'chromium';
  const b = ENGINE === 'safari' ? await require('./safari').launch() : await pw[ENGINE].launch(ENGINE === 'chromium'
    ? { args: process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
    : { headless: !process.env.HEADED });
  if (b.version) console.log(b.version);
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +(process.env.DPR || 2) });
  const errs = [];
  p.on('pageerror', e => { errs.push(String(e).slice(0, 300)); console.log('pageerror', String(e).slice(0, 300)); });
  p.on('console', async m => {
    const t = m.text();
    if (/^Frame budget|did not link|CONTEXT_LOST|context lost/i.test(t)) console.log('page:', t.slice(0, 240));
    if (!t.startsWith('[telemetry]')) return;
    let evs; try { evs = await m.args()[1].jsonValue(); } catch (e) { return; }
    for (const e of [].concat(evs || [])) {
      const n = e.event || e.name, q = e.properties || e.props || e;
      if (!['time', 'quality', 'tier_step', 'gl_lost', 'error'].includes(n)) continue;
      const keep = ['fps', 'hz', 'slow', 'f95', 'f99', 'hitch', 'cpu_ms', 'cpu95', 'gpu_ms', 'draws', 'tris_k', 'passes', 'px_k', 'bound', 'tier', 'scale', 'shed', 'msaa', 'cap', 'from', 'to', 'ms', 's', 'fit', 'gpu', 'browser', 'message'];
      console.log(`event ${n}`, JSON.stringify(Object.fromEntries(keep.filter(k => q[k] != null).map(k => [k, q[k]]))));
    }
  });
  // FREE=1: the page is not told it is automated, so its governor runs as a player's does (quality.js governor's `auto`);
  // with Q='walk=1&weather=clear&overture=0', which automation otherwise chooses for it
  // (and the page is told it has the focus: a player's page without it draws ten frames a second, game.js awayHold,
  // and an automated window loses it to whatever else opens on the screen)
  if (process.env.FREE) await p.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true }); document.hasFocus = () => true; });
  if (process.env.TIER) await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER);
  await p.addInitScript(count => {
    // each frame (COUNT=0: the WebGL calls left uncounted, to see what the counting itself costs): its gap from the last, the time inside its callbacks, its draw calls and every WebGL call
    const F = window.__frames = { gap: [], js: [], draws: [], calls: [] };
    let last = 0, js = 0, draws = 0, calls = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = fn => raf(t => {   // (a frame's callbacks are all given the same time)
      if (t !== last) { if (last) { F.gap.push(t - last); F.js.push(js); F.draws.push(draws); F.calls.push(calls); } last = t; js = 0; draws = 0; calls = 0; }
      const t0 = performance.now(); try { fn(t); } finally { js += performance.now() - t0; }
    });
    const P = WebGL2RenderingContext.prototype;
    if (count) for (const k of Object.getOwnPropertyNames(P)) {
      const d = Object.getOwnPropertyDescriptor(P, k);
      if (!d || typeof d.value !== 'function' || k === 'constructor') continue;
      const f = d.value, draw = /^(draw|multiDraw)/.test(k);
      P[k] = function (...a) { calls++; if (draw) draws++; return f.apply(this, a); };
    }
  }, process.env.COUNT !== '0');
  const t0 = Date.now();
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?${process.env.Q || 'walk=1'}&telemetry=debug#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await startPlay(p, { asIs: true });
  console.log(`title up and Play pressed ${((Date.now() - t0) / 1000).toFixed(1)} s after the address`);
  const dev = await p.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2'), x = c && c.getExtension('WEBGL_debug_renderer_info'), Q = window.OEQuality;
    return { ua: navigator.userAgent, gpu: c ? c.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : c.RENDERER) : 'no webgl2', units: c && c.getParameter(c.MAX_TEXTURE_IMAGE_UNITS),
      multiDraw: !!(c && c.getExtension('WEBGL_multi_draw')), parallel: !!(c && c.getExtension('KHR_parallel_shader_compile')), timer: !!(c && c.getExtension('EXT_disjoint_timer_query_webgl2')),
      tier: Q && Q.city && Q.city().name, dpr: devicePixelRatio };
  });
  console.log('device', JSON.stringify(dev));
  const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : 0; };
  for (let at = 10; at <= +secs; at += 10) {
    await p.waitForTimeout(10000);
    const r = await p.evaluate(() => { const F = window.__frames, o = { gap: F.gap, js: F.js, draws: F.draws, calls: F.calls }; F.gap = []; F.js = []; F.draws = []; F.calls = [];
      const c = document.querySelector('#game-stage canvas, canvas'), Q = window.OEQuality; const G = window.__game && window.__game.governor;
      return Object.assign(o, { canvas: c ? [c.width, c.height] : null, tier: Q && Q.city && Q.city().name, hidden: document.hidden,
        gov: G ? `${G.auto ? 'free' : 'held'} ${G.scale.toFixed(2)}/${G.extras}, its frame ${G.frameMs.toFixed(1)} ms for ${G.targetMs.toFixed(1)}, display ${G.refreshMs ? G.refreshMs.toFixed(1) + ' ms' : 'not read'}, a tier down ${G.tierRoom > 0 ? 'open' : 'shut'}` : 'none' }); });
    const n = r.gap.length;
    console.log(`${String(at).padStart(4)} s: ${n ? (1000 / q(r.gap, 0.5)).toFixed(0) : 0} fps (median gap ${q(r.gap, 0.5).toFixed(1)} ms, 95th ${q(r.gap, 0.95).toFixed(1)}, fastest ${q(r.gap, 0).toFixed(1)}), script ${q(r.js, 0.5).toFixed(1)} ms a frame (95th ${q(r.js, 0.95).toFixed(1)}), draws ${q(r.draws, 0.5)}, WebGL calls ${q(r.calls, 0.5)}, canvas ${r.canvas && r.canvas.join('x')}, tier ${r.tier}, governor ${r.gov}${r.hidden ? ', hidden' : ''}`);
  }
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // (the page sends its "time" when it is hidden or asked)
  await p.waitForTimeout(500);
  await b.close();
  console.log(errs.length ? `FAIL ${errs.length} page errors` : 'no page error');
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
