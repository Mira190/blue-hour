// Safari itself, driven as the harnesses drive Playwright's pages (ENGINE=safari, tools/engine.js). Safari has no
// Playwright: it speaks W3C WebDriver through /usr/bin/safaridriver, once "Allow remote automation" is on (Safari's
// Settings, Developer). This gives a harness the few things of a Playwright page it uses, over WebDriver's HTTP:
// evaluate, waitForFunction, a click, a key, a still, and addInitScript. WebDriver cannot run a script before a
// page's own, so the page is served from here (web/, with byte ranges, which Safari asks of a sound's file) and the
// init scripts are written into the head of index.html; goto() takes the address's path and serves it from this
// port. The console and the page's errors are kept by the first of those scripts and read every second.
// What it is not: a phone (a window of Safari on a Mac, at the display's own pixel ratio, with a mouse: a "tap" is a
// click), and Safari's window must be seen on the screen for its frames to run.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const WEB = path.join(__dirname, '..', 'web');
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', woff2: 'font/woff2', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav', wasm: 'application/wasm', glb: 'model/gltf-binary', ico: 'image/x-icon' };
const KEYS = { Escape: '', Enter: '', Tab: '', Space: ' ', ArrowLeft: '', ArrowUp: '', ArrowRight: '', ArrowDown: '', ShiftLeft: '', Backspace: '' };
const keyOf = c => KEYS[c] || (/^Key[A-Z]$/.test(c) ? c[3].toLowerCase() : /^Digit\d$/.test(c) ? c[5] : c);
const src = (f, arg) => (typeof f === 'function' ? `(${f})(${arg === undefined ? '' : JSON.stringify(arg)});` : `${f};`);

// the console and the errors, kept in the page for the harness to read
const KEEP = () => {
  const W = window.__wd = { log: [], err: [] };
  const safe = a => { try { return JSON.parse(JSON.stringify(a)); } catch (e) { return String(a); } };
  for (const t of ['log', 'info', 'warn', 'error', 'debug']) { const f = console[t].bind(console); console[t] = (...a) => { if (W.log.length < 2000) W.log.push({ type: t, text: a.map(x => (typeof x === 'string' ? x : x instanceof Error ? String(x) : (() => { try { return JSON.stringify(x); } catch (e) { return String(x); } })())).join(' ').slice(0, 4000), args: a.map(safe) }); f(...a); }; }
  window.addEventListener('error', e => W.err.push({ message: String(e.message || e.error || 'error'), stack: `${e.filename || ''}:${e.lineno || ''}` }));
  window.addEventListener('unhandledrejection', e => W.err.push({ message: String(e.reason), stack: (e.reason && e.reason.stack) || '' }));
};

async function launch() {
  const inits = [src(KEEP)];
  const server = http.createServer((q, r) => {
    let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html';
    const file = path.join(WEB, path.normalize(f));
    if (!file.startsWith(WEB)) { r.writeHead(403); r.end(); return; }
    fs.stat(file, (e, st) => {
      if (e || !st.isFile()) { r.writeHead(404); r.end(); return; }
      const type = TYPES[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream', head = { 'Content-Type': type, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
      if (f === '/index.html') { // (the init scripts first in the head, before any of the page's own)
        const html = fs.readFileSync(file, 'utf8').replace(/<head[^>]*>/i, m => `${m}<script>${inits.join('\n').replace(/<\/script/gi, '<\\/script')}</script>`);
        r.writeHead(200, head); r.end(html); return;
      }
      const m = /^bytes=(\d*)-(\d*)$/.exec(q.headers.range || '');
      if (m) {
        const a = m[1] ? +m[1] : Math.max(0, st.size - +m[2]), b = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
        r.writeHead(206, Object.assign(head, { 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1 })); fs.createReadStream(file, { start: a, end: b }).pipe(r); return;
      }
      r.writeHead(200, Object.assign(head, { 'Content-Length': st.size })); fs.createReadStream(file).pipe(r);
    });
  });
  const PORT = +(process.env.SAFARI_PORT || 8856), DRIVER = PORT + 1;
  await new Promise((ok, no) => server.once('error', no).listen(PORT, '127.0.0.1', ok));
  const driver = spawn('/usr/bin/safaridriver', ['-p', String(DRIVER)], { stdio: 'ignore' });
  let chain = Promise.resolve(), sid = null;
  const wd = (method, url, body) => { // (one command at a time: a session answers them in order)
    const run = async () => {
      const r = await fetch(`http://127.0.0.1:${DRIVER}${sid && !url.startsWith('/session') ? `/session/${sid}` : ''}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => ({}));
      if (j.value && j.value.error) throw new Error(`${j.value.error}: ${String(j.value.message).slice(0, 400)}`);
      return j.value;
    };
    const p = chain.then(run, run); chain = p.catch(() => {}); return p;
  };
  for (let i = 0; ; i++) { try { await fetch(`http://127.0.0.1:${DRIVER}/status`); break; } catch (e) { if (i > 50) throw new Error('safaridriver does not answer'); await new Promise(r => setTimeout(r, 100)); } }
  const made = await wd('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } });
  sid = made.sessionId;
  await wd('POST', '/timeouts', { script: 900000, pageLoad: 300000 });
  const version = `Safari ${made.capabilities.browserVersion} on macOS ${made.capabilities['safari:platformVersion']}`;
  const pages = [];
  let poll = null, closed = false;

  function newPage(o = {}) {
    // (one window a session. A second page is only ever asked for to work something out apart from the game, two
    // stills compared: that is done in the page there is)
    if (pages.length) return { evaluate: pages[0].evaluate, close: async () => {} };
    const subs = {}, emit = (ev, x) => { for (const fn of subs[ev] || []) try { fn(x); } catch (e) { console.log('safari:', ev, String(e).slice(0, 200)); } };
    let wait = 180000;
    const evaluate = async (f, arg) => {
      const r = await wd('POST', '/execute/async', { script: typeof f === 'function'
        ? `var cb = arguments[arguments.length - 1]; try { Promise.resolve((${f})(arguments[0])).then(function (v) { cb({ v: v === undefined ? null : v }); }, function (e) { cb({ e: String(e && e.stack || e) }); }); } catch (e) { cb({ e: String(e && e.stack || e) }); }`
        : 'var cb = arguments[arguments.length - 1]; try { Promise.resolve((0, eval)(arguments[0])).then(function (v) { cb({ v: v === undefined ? null : v }); }, function (e) { cb({ e: String(e) }); }); } catch (e) { cb({ e: String(e) }); }',
      args: [typeof f === 'function' ? (arg === undefined ? null : arg) : String(f)] });
      if (!r) throw new Error('safari: the page gave no answer (it was leaving)');
      if (r.e) throw new Error(`page.evaluate: ${r.e.slice(0, 600)}`);
      return r.v === null ? undefined : r.v;
    };
    // (a click or a key reaches the page only while Safari is the application in front: with another window over it
    // the driver answers "done" and the page hears nothing. So Safari is brought forward first, at most once a second)
    let fronted = 0;
    const front = async () => { if (Date.now() - fronted < 1000) return; fronted = Date.now(); try { execFileSync('/usr/bin/open', ['-a', 'Safari']); } catch (e) { /* as it is */ } await new Promise(r => setTimeout(r, 250)); };
    const click = async (x, y) => { await front(); await wd('POST', '/actions', { actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', duration: 0, x: Math.round(x), y: Math.round(y), origin: 'viewport' }, { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 40 }, { type: 'pointerUp', button: 0 }] }] }); await wd('DELETE', '/actions'); };
    const key = async (c, parts = ['keyDown', 'keyUp']) => { await front(); await wd('POST', '/actions', { actions: [{ type: 'key', id: 'keys', actions: parts.map(type => ({ type, value: keyOf(c) })) }] }); };
    const box = sel => evaluate(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.width || b.height ? { x: b.x, y: b.y, width: b.width, height: b.height } : null; }, sel).then(b => b || null);
    const loc = sel => ({ first: () => loc(sel), boundingBox: () => box(sel), click: async () => { const b = await box(sel); if (!b) throw new Error(`safari: nothing to click at ${sel}`); await click(b.x + b.width / 2, b.y + b.height / 2); },
      count: () => evaluate(s => document.querySelectorAll(s).length, sel), evaluate: (f, arg) => evaluate(`(${f})(document.querySelector(${JSON.stringify(sel)}), ${JSON.stringify(arg === undefined ? null : arg)})`) });
    if (o.userAgent) inits.push(src(ua => Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => ua, configurable: true }), o.userAgent));
    const p = {
      version,
      on(ev, fn) { (subs[ev] = subs[ev] || []).push(fn); return p; },
      setDefaultTimeout(ms) { wait = ms; },
      mainFrame: () => p, url: () => '',
      context: () => ({ newCDPSession: async () => { throw new Error('safari: no DevTools session'); } }),
      exposeFunction: async () => { throw new Error('safari: nothing can be exposed to the page'); },
      addInitScript: async (f, arg) => { inits.push(src(f, arg)); },
      addStyleTag: ({ content }) => evaluate(c => { const s = document.createElement('style'); s.textContent = c; document.head.appendChild(s); }, content),
      async goto(url) {
        const u = new URL(url);
        await front();   // (seen whole on the screen: a window under another draws no frames)
        if (o.viewport) { // (the window sized so that the page has the viewport asked for, as near as Safari allows)
          await wd('POST', '/url', { url: `http://127.0.0.1:${PORT}/favicon.ico` }).catch(() => {});
          for (let i = 0; i < 2; i++) {
            const r = await wd('GET', '/window/rect'), inner = await wd('POST', '/execute/sync', { script: 'return [innerWidth, innerHeight]', args: [] });
            await wd('POST', '/window/rect', { x: 40, y: 40, width: r.width + o.viewport.width - inner[0], height: r.height + o.viewport.height - inner[1] });
          }
        }
        await wd('POST', '/url', { url: `http://127.0.0.1:${PORT}${u.pathname}${u.search}${u.hash}` });
      },
      reload: () => wd('POST', '/refresh'),
      evaluate,
      async waitForFunction(f, arg, { timeout = wait, polling = 100 } = {}) {
        const every = typeof polling === 'number' ? polling : 50, t0 = Date.now();
        for (;;) {
          let v = null; try { v = await evaluate(f, arg); } catch (e) { if (!/leaving|no answer|unload|navigat/i.test(String(e))) throw e; }
          if (v) return v;
          if (timeout && Date.now() - t0 > timeout) throw new Error(`page.waitForFunction: Timeout ${timeout}ms exceeded.`);
          await new Promise(r => setTimeout(r, every));
        }
      },
      waitForTimeout: ms => new Promise(r => setTimeout(r, ms)),
      async screenshot({ path: to } = {}) { const b = Buffer.from(await wd('GET', '/screenshot'), 'base64'); if (to) fs.writeFileSync(to, b); return b; },
      mouse: { click },
      touchscreen: { tap: click },   // (a Mac's Safari has no touch screen: a click, which is a user's activation as a tap is)
      keyboard: { press: c => key(c), down: c => key(c, ['keyDown']), up: c => key(c, ['keyUp']) },
      locator: loc,
    };
    pages.push(p);
    const drain = async () => {
      if (closed) return;
      try {
        const d = await wd('POST', '/execute/sync', { script: 'var w = window.__wd; return w ? { log: w.log.splice(0), err: w.err.splice(0) } : null;', args: [] });
        if (d) {
          for (const m of d.log) emit('console', { text: () => m.text, type: () => m.type, args: () => m.args.map(a => ({ jsonValue: async () => a })) });
          for (const e of d.err) { const x = new Error(e.message); x.stack = `${e.message}\n${e.stack}`; emit('pageerror', x); }
        }
      } catch (e) { /* between two pages */ }
      if (!closed) poll = setTimeout(drain, 1000);
    };
    poll = setTimeout(drain, 1000);
    p.drain = drain;
    return p;
  }
  async function close() {
    if (closed) return;
    if (pages[0]) await pages[0].drain().catch(() => {});
    closed = true; clearTimeout(poll);
    await wd('DELETE', `/session/${sid}`).catch(() => {});   // (closes the window)
    driver.kill(); server.close();
  }
  process.on('exit', () => { try { driver.kill(); } catch (e) { /* gone */ } });
  return { newPage: async o => newPage(o), close, version };
}
module.exports = { launch };
