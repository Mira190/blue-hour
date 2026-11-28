// What the browser itself says while a check plays, in the check's own log (issue 49). On CI the browser checks
// failed with no step named: a screenshot or a click waited 30 s on a page that did not answer, or the page loaded
// itself again in the middle of a step (glcare.js reloads the view when the WebGL context is lost and not given
// back), and the log said nothing of why. With these, a log says it:
//   gpu: <line>   what Chromium and its GPU process wrote in their log about the GPU (a crash, a hang, a lost context)
//   gl:  <line>   the page's console on its WebGL context (CONTEXT_LOST_WEBGL, a context restored)
//   page: ...     the page loaded again by itself, or showed glcare's note
//   const { logger, watch } = require('./browser_watch');
//   const b = await chromium.launch({ ..., logger: logger() }); ... watch(page);
const fs = require('fs'), os = require('os'), path = require('path');
const GPU = /gpu|watchdog|context.?lost|lost.?context|SIGSEGV|SIGABRT|SIGILL|Received signal|mesa|llvmpipe|angle|egl|glx|disk_cache|shader_cache|crash/i;
const NOISE = /ProduceSkia|CreatePlatformSocket|dbus|DBus|InitializeSandbox|drmGetDevices|dri3 extension|Floss|UPower|ScreenSaver|ALSA|sqlite/i;

// Playwright's own logger is never given the browser's stderr, so Chromium writes its log to a file (CHROME_LOG, else a
// file of its own in the temp folder; its GPU process writes there too), and what it says of its GPU is printed with
// the check's output when the harness exits, however it exits
const pw = require('playwright');
const launch0 = pw.chromium.launch.bind(pw.chromium);
const logs = [];
pw.chromium.launch = (o = {}) => {
  const f = process.env.CHROME_LOG ? `${process.env.CHROME_LOG}${logs.length ? `.${logs.length}` : ''}` : path.join(os.tmpdir(), `chrome-${process.pid}-${logs.length}.log`);
  try { fs.rmSync(f, { force: true }); } catch (e) { /* not there */ }
  logs.push(f);
  return launch0(Object.assign({}, o, { args: [...(o.args || []), '--enable-logging', `--log-file=${f}`, '--v=0'] })).then(covered);
};

// Which of the page's functions a check ran (COVER=dir, set by tools/check.sh; docs/CHECKS.md, "Checks by reach"): V8's
// own count, function by function and yes or no only, which leaves its optimiser on. Asked of every page the browser
// opens, taken every twenty seconds (a take gives what ran since the last one) and when the browser is closed, and
// written as one file a browser: for each script the page ran, every function's place in its source and whether it ran.
// tools/check_cache.py keeps it with the pass: a change inside a function the check never ran cannot alter its result.
function covered(b) {
  const dir = process.env.COVER;
  if (!dir) return b;
  const seen = new Map(), sessions = [];   // url -> Map("start-end" -> [start, end, ran, name])
  const tag = `${process.pid}-${logs.length}`;
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `launch-${tag}`), ''); } catch (e) { /* as below */ }   // (a launch with no count beside it: the check's count is not whole)
  const take = async s => {
    let r; try { r = await s.send('Profiler.takePreciseCoverage'); } catch (e) { return; }
    for (const sc of r.result) {
      if (!/^https?:/.test(sc.url)) continue;
      let m = seen.get(sc.url); if (!m) seen.set(sc.url, m = new Map());
      for (const fn of sc.functions) {
        const g = fn.ranges[0], k = `${g.startOffset}-${g.endOffset}`, was = m.get(k);
        if (was) was[2] = was[2] || (g.count ? 1 : 0); else m.set(k, [g.startOffset, g.endOffset, g.count ? 1 : 0, fn.functionName]);
      }
    }
  };
  const write = () => {
    const out = {};
    for (const [url, m] of seen) out[url.replace(/^https?:\/\/[^/]+\//, '').split(/[?#]/)[0]] = [...m.values()].sort((x, y) => x[0] - y[0] || y[1] - x[1]);
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `cover-${tag}.json`), JSON.stringify(out)); } catch (e) { /* no place for it: the pass is kept by its files alone */ }
  };
  const start = async p => {
    try {
      const s = await p.context().newCDPSession(p);
      await s.send('Profiler.enable');
      await s.send('Profiler.startPreciseCoverage', { callCount: false, detailed: false });
      sessions.push(s);
    } catch (e) { broken = true; }
  };
  let broken = false;
  const timer = setInterval(() => { for (const s of sessions) take(s); }, 20000); timer.unref();
  const newPage0 = b.newPage.bind(b), newContext0 = b.newContext.bind(b), close0 = b.close.bind(b);
  const ctx = c => { const np = c.newPage.bind(c); c.newPage = async (...a) => { const p = await np(...a); await start(p); return p; }; return c; };
  b.newPage = async (...a) => { const p = await newPage0(...a); await start(p); return p; };
  b.newContext = async (...a) => ctx(await newContext0(...a));
  b.close = async (...a) => {
    clearInterval(timer);
    for (const s of sessions) await take(s);
    if (!broken) write();   // (a page it could not ask leaves no file: the pass is then kept by its files alone)
    return close0(...a);
  };
  return b;
}
process.on('exit', () => {
  const seen = new Set();
  for (const f of logs) {
    let text = '';
    try { text = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    for (const l of text.split('\n')) {
      const m = l.replace(/^\[[^\]]*\]\s*/, '');
      if (!m || !GPU.test(l) || NOISE.test(l) || seen.has(m)) continue;
      seen.add(m);
      if (seen.size <= 40) console.log(`gpu: ${l.slice(0, 300)}`);
    }
    if (!process.env.CHROME_LOG) try { fs.rmSync(f, { force: true }); } catch (e) { /* gone */ }
  }
});
// (kept for the harnesses that pass it: the browser's log is taken as above)
function logger() { return undefined; }

// a page's own reloads and lost contexts, said as they happen; also the default wait for a click or a still made long
// enough for a software renderer under load (a frame there can take many seconds: it was 30 s, Playwright's own)
// a reload the play asks for (the last card's back into a frame, its Walk Shibuya, Play it again, the title's return):
// marked at the step that clicks it, so the next load is said as asked for, and one nobody asked for stays a `page:` line
function expectReload(p, why) { p.__reloadWhy = why; }
// how many times the page has loaded since watch() began: a step that must stay on the same page (the menus' Title screen
// in place, game.js putAway) reads it before and after, and fails on any load, asked for or not
const loadsOf = p => p.__loads || 0;
function watch(p, { timeout = 180000 } = {}) {
  let loads = 0;
  const t0 = Date.now(), at = () => `${((Date.now() - t0) / 1000).toFixed(0)} s`;
  p.setDefaultTimeout(timeout);
  p.on('console', m => { const t = m.text(); if (/CONTEXT_LOST|context lost|context restored|WebGL context/i.test(t)) console.log(`gl:  ${t.slice(0, 200)} (at ${at()})`); });
  p.on('framenavigated', f => {
    if (f !== p.mainFrame()) return;
    p.__loads = ++loads;
    if (loads < 2) return;
    if (p.__reloadWhy) { console.log(`(the page loaded again at ${at()}, as the play asked: ${p.__reloadWhy})`); p.__reloadWhy = null; } // (expectReload)
    else { console.log(`page: loaded again at ${at()}: ${f.url().replace(/^https?:\/\/[^/]+/, '')}`); p.__unasked = true; } // (unasked: a play that reads the game waits for it to be back, walk_play.js)
  });
  p.on('crash', () => console.log(`page: the renderer crashed at ${at()}`));
  p.exposeFunction('__glNote', t => console.log(`page: glcare's note at ${at()}: ${t}`)).catch(() => {});
  p.addInitScript(() => {
    // glcare.js puts its note up when the context is lost, and before it reloads the view
    const seen = new WeakSet();
    new MutationObserver(() => {
      const n = document.querySelector('.gl-note:not([hidden])');
      if (n && !seen.has(n.firstChild || n)) { seen.add(n.firstChild || n); if (window.__glNote) window.__glNote(n.textContent.slice(0, 200)); }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  }).catch(() => {});
}

module.exports = { logger, watch, expectReload, loadsOf };
