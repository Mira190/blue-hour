// Every WebGL call that raises an error, from the context's first call: the call, how often, and where in the page
// it was made. A refused draw is one kind (tools/gl_mismatch_probe.js names its sampler); a blit, a clear or a
// texture call that fails says nothing either, and what it was to draw into is then stale or empty.
//   [START=0.8/0] [WALK=1] [Q=msaa=on] xvfb-run -a node tools/gl_error_probe.js shibuya [morning|night|...]
// START: the governor's record a device opens the map with (game.js ?gov=); WALK: the ladder walked down and up in play;
// Q: more of the address (msaa=on: the scene multisampled as on a desktop GPU, quality.js; weather=rain; gltrace=1: the
// game's own trace of its load, glcare.js, printed as `game`). tools/check.sh gl runs it; exits 1 on a refused call.
// Asking after every call makes every call wait for the GPU: the shaders then compile one at a time and the buffers go
// up a slice at a time, and on a software renderer the load takes a quarter of an hour where it takes one minute (the
// runner's gl shard timed out on it, #1). So the error is asked for once in EVERY calls (256), and a run that finds one
// names the calls made since the last was asked; EVERY=1 asks after each, slowly, and names the call and where it was made.
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const [,, city = 'shibuya', time = ''] = process.argv;
const EVERY = Math.max(1, +(process.env.EVERY || 256));
const wrap = every => {
  const P = WebGL2RenderingContext.prototype, seen = new Map(), since = new Map();
  let left = every;
  window.__glErr = { seen, calls: 0, on: true, ctx: null };
  for (const fn of Object.getOwnPropertyNames(P)) {
    const d = Object.getOwnPropertyDescriptor(P, fn);
    if (!d || typeof d.value !== 'function' || /^(getError|isContextLost|getExtension|getParameter|getSupportedExtensions|getContextAttributes)$/.test(fn)) continue;
    const orig = d.value, getError = P.getError;
    P[fn] = function (...a) {
      const r = orig.apply(this, a), E = window.__glErr;
      if (!E.on) return r;
      E.calls++;
      E.ctx = this;
      if (every > 1) { since.set(fn, (since.get(fn) || 0) + 1); if (--left > 0 && !E.ask) return r; left = every; }
      const e = getError.call(this);
      if (every > 1 && !e) since.clear();
      if (e && e !== this.CONTEXT_LOST_WEBGL) {
        const at = (new Error().stack || '').split('\n').slice(2, 7).map(l => l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+\//, '')).join(' < ');
        const key = every > 1 ? `one of ${[...since].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} x${n}`).join(' ')} 0x${e.toString(16)} (EVERY=1 names it)` : `${fn} 0x${e.toString(16)} @ ${at}`;
        since.clear();
        const o = seen.get(key) || seen.set(key, { n: 0, first: performance.now() | 0, args: a.slice(0, 10).map(x => (typeof x === 'number' ? x : x && x.constructor ? x.constructor.name : String(x))).join(',') }).get(key);
        o.n++;
      }
      return r;
    };
  }
};
(async () => {
  // (SWIFT=1: SwiftShader, ANGLE's Vulkan backend, in place of Mesa's llvmpipe through its GL one: another set of limits)
  const b = await chromium.launch(process.env.SWIFT || !process.env.DISPLAY ? { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
    : { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1001, height: 894 }, deviceScaleFactor: +(process.env.DPR || 1) });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.addInitScript(wrap, EVERY);
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  p.on('console', m => { if (/WebGL|GL_|INVALID/.test(m.text())) console.log(`console: ${m.text().slice(0, 300)}`); });
  const report = async label => {
    // (the calls since the error was last asked for are asked about now: a call of the page's own, so it is counted)
    await p.evaluate(() => { const E = window.__glErr; if (E.ctx && !E.ctx.isContextLost()) { const was = E.on; E.on = E.ask = true; E.ctx.flush(); E.on = was; E.ask = false; } }); // (flush: wrapped, and it asks)
    const r = await p.evaluate(() => { const E = window.__glErr, out = [...E.seen].map(([k, v]) => ({ call: k, n: v.n, ms: v.first, args: v.args })); E.seen.clear(); const c = E.calls; E.calls = 0; return { calls: c, errors: out }; });
    r.samples = await p.evaluate(() => { const g = window.__game, c = g && g.atmos && g.atmos.composer; return c ? c.samples : null; });
    r.game = await p.evaluate(() => (window.__game && window.__game.glFound ? window.__game.glFound.slice() : null)); // (the game's own watch: game.js glCheck, ?gltrace=1)
    console.log(label, JSON.stringify(r));
    return r.errors.length;
  };
  let bad = 0;
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0${process.env.START ? `&gov=${process.env.START}` : ''}${process.env.Q ? `&${process.env.Q}` : ''}#play-${city}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: EVERY > 1 ? 600000 : 1800000 });
  await p.waitForFunction(() => { const l = document.getElementById('g-loader'); return !l || l.hidden; }, null, { timeout: EVERY > 1 ? 900000 : 3600000, polling: 500 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return t && !t.hidden; }, null, { timeout: 600000, polling: 250 });
  await p.waitForTimeout(3000);
  bad += await report('load and title');
  if (time) await p.evaluate(t => { const x = document.querySelector(`#gt-timechoice [data-t="${t}"]`); if (x) x.click(); }, time);
  await startPlay(p, { asIs: true });
  await p.waitForTimeout(5000);
  bad += await report('playing');
  if (process.env.WALK) for (const [sc, ex] of [[0.8, 1], [0.8, 0.5], [0.6, 0.5], [0.6, 0], [0.65, 0], [0.6, 0], [0.8, 0], [1, 0], [1, 0.5], [1, 1], [0.6, 0], [1, 1]]) {
    await p.evaluate(([s, e]) => window.__game.governor.set(s, e), [sc, ex]);
    await p.waitForTimeout(1200);
    bad += await report(`scale ${sc}, extras ${ex}`);
  }
  await b.close();
  if (bad) { console.log('FAIL'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
