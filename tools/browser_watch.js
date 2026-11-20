// What the browser itself says while a check plays, in the check's own log (issue 49). On CI the browser checks
// failed with no step named: a screenshot or a click waited 30 s on a page that did not answer, or the page loaded
// itself again in the middle of a step (glcare.js reloads the view when the WebGL context is lost and not given
// back), and the log said nothing of why. With these, a log says it:
//   gpu: <line>   what Chromium's GPU process wrote to its stderr about itself (a crash, a hang, a lost context)
//   gl:  <line>   the page's console on its WebGL context (CONTEXT_LOST_WEBGL, a context restored)
//   page: ...     the page loaded again by itself, or showed glcare's note
//   const { logger, watch } = require('./browser_watch');
//   const b = await chromium.launch({ ..., logger: logger() }); ... watch(page);
const GPU = /gpu|watchdog|context.?lost|lost.?context|SIGSEGV|SIGABRT|SIGILL|Received signal|mesa|llvmpipe|angle|egl|glx|disk_cache|shader_cache/i;
const NOISE = /<launching>|--ignore-gpu-blocklist|ProduceSkia|CreatePlatformSocket|gcm\/engine|ssl_client_socket|dbus|fontconfig/i;

function logger() {
  return {
    isEnabled: name => name === 'browser',
    log: (name, severity, message) => {
      const m = String(message);
      if (GPU.test(m) && !NOISE.test(m)) console.log(`gpu: ${m.replace(/^\[pid=\d+\]\[err\]\s*/, '').slice(0, 300)}`);
    },
  };
}

// a page's own reloads and lost contexts, said as they happen; also the default wait for a click or a still made long
// enough for a software renderer under load (a frame there can take many seconds: it was 30 s, Playwright's own)
function watch(p, { timeout = 180000 } = {}) {
  let loads = 0;
  const t0 = Date.now(), at = () => `${((Date.now() - t0) / 1000).toFixed(0)} s`;
  p.setDefaultTimeout(timeout);
  p.on('console', m => { const t = m.text(); if (/CONTEXT_LOST|context lost|context restored|WebGL context/i.test(t)) console.log(`gl:  ${t.slice(0, 200)} (at ${at()})`); });
  p.on('framenavigated', f => {
    if (f !== p.mainFrame()) return;
    if (++loads > 1) console.log(`page: loaded again at ${at()}: ${f.url().replace(/^https?:\/\/[^/]+/, '')}`);
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

module.exports = { logger, watch };
