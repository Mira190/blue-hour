// What a player who comes back meets (issue 116; docs/CHECKS.md "A load is of one commit"). The site is published
// many times a day, so every one of these is met by somebody:
//
//   keys   the page's storage keys are its own (bh-*): none of the project it was split from is read or written in
//          web/, and a visit's old keys are copied once.
//   start  a start that fails says so, on a desktop and a phone: a script that does not arrive, an error before the
//          first frame after which the loader stands still, a browser without import maps, a pack that stalls
//          (given up, fetched again twice, then the loader's error state with its Reload); and a pack that fails
//          once is fetched again and the load goes on. Stills of each state in OUT.
//   save   a case kept by a build of another story (its shape, story.js) is not taken up: the title says why and
//          offers tonight again, on a desktop and a phone; a browser whose storage is full keeps the case without
//          its pictures, and the evening is not stopped.
//   cache  one load, one commit. The site as two commits, each stamped as a deploy stamps it (tools/stamp.js), from
//          a server that keeps what GitHub Pages keeps (ten minutes, the page itself too). The page is loaded at the
//          commit before; then the site is the new commit and the page is loaded again in the same browser, its
//          cache full of the commit before. Every file the second load used that differs between the two must be
//          the new commit's, every request of the page's own must carry a hash or the build, the page must be the
//          new commit's, and a case left going is still offered. vercel.json's cache rules are read the same way.
//
//   xvfb-run -a node tools/launch_check.js [keys] [start] [save] [cache]     (all four when none is named)
//   OUT=/tmp/launch for the stills and the server's log; the tool serves web/ itself, on LAUNCH_PORT (8816).
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), crypto = require('crypto');
const { stamp } = require('./stamp.js');

const ROOT = path.resolve(__dirname, '..'), WEB = path.join(ROOT, 'web');
const PORT = +(process.env.LAUNCH_PORT || 8816), // (its own: PORT is the page's server, which tools/check.sh has up beside it)
   OUT = process.env.OUT || path.join(os.tmpdir(), 'launch-check');
const want = process.argv.slice(2), on = t => !want.length || want.includes(t);
fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; return ok; };
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);

const ALL_SCREENS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' },
};
const SCREENS = Object.fromEntries(Object.entries(ALL_SCREENS).filter(([k]) => !process.env.SCREEN || process.env.SCREEN === k)); // (SCREEN=phone: one of them, while working on it)

// ---------------------------------------------------------------- the server
// web/ under layers (the first that has the file), with a host's cache headers, and a fault for a path:
//   { status: 503, times: 1 }   answered so, that many times     { stall: true, times: n }  headers, a few bytes, then nothing
//   { silent: true, times: n }  never answered
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg',
  webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', woff2: 'font/woff2', glb: 'model/gltf-binary', bin: 'application/octet-stream', mp3: 'audio/mpeg', wasm: 'application/wasm', ktx2: 'image/ktx2' };
function vercelHeaders(urlPath, query) { // vercel.json's headers, as Vercel applies them: every rule that matches, the later over the earlier
  const out = {};
  for (const rule of JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).headers || []) {
    if (!new RegExp(`^${rule.source}$`).test(urlPath)) continue;
    if ((rule.has || []).some(h => h.type !== 'query' || !query.has(h.key))) continue;
    if ((rule.missing || []).some(h => h.type === 'query' && query.has(h.key))) continue;
    for (const h of rule.headers) out[h.key.toLowerCase()] = h.value;
  }
  return out;
}
function serve() {
  const S = { layers: [WEB], host: 'pages', faults: {}, log: [], open: new Set() };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const entry = { path: rel, query: u.search, status: 0 };
    S.log.push(entry);
    // (for tools/check_cache.py, in the words of the server tools/check.sh starts: what this check read)
    if (process.env.SERVER_LOG) res.on('finish', () => { if (entry.status === 200 || entry.status === 304) try { fs.appendFileSync(process.env.SERVER_LOG, `127.0.0.1 - - [launch] "GET /${encodeURI(rel)} HTTP/1.1" ${entry.status} -\n`); } catch (e) { /* no log */ } });
    const fault = S.faults[rel];
    if (fault && fault.times > 0 && fault.silent) { fault.times--; fault.hits = (fault.hits || 0) + 1; entry.status = 'silent'; S.open.add(res); return; }
    if (fault && fault.times > 0 && fault.status) { fault.times--; fault.hits = (fault.hits || 0) + 1; entry.status = fault.status; res.writeHead(fault.status); res.end(); return; }
    const file = S.layers.map(l => path.join(l, rel)).find(f => f.startsWith(path.resolve(f, '.')) && fs.existsSync(f) && fs.statSync(f).isFile());
    if (!file) { entry.status = 404; res.writeHead(404); res.end(); return; }
    const body = fs.readFileSync(file), etag = `"${sha(body)}"`;
    const head = { 'content-type': TYPES[path.extname(rel).slice(1)] || 'application/octet-stream', etag };
    if (S.host === 'pages') head['cache-control'] = 'max-age=600';
    else Object.assign(head, vercelHeaders(u.pathname, u.searchParams));
    if (req.headers['if-none-match'] === etag) { entry.status = 304; res.writeHead(304, head); res.end(); return; }
    entry.status = 200;
    if (fault && fault.times > 0 && fault.stall) {
      fault.times--; fault.hits = (fault.hits || 0) + 1; entry.status = 'stalled';
      res.writeHead(200, Object.assign(head, { 'content-length': body.length }));
      res.write(body.subarray(0, Math.min(2048, body.length >> 1))); S.open.add(res); return; // (and no more)
    }
    res.writeHead(200, Object.assign(head, { 'content-length': body.length }));
    res.end(body);
  });
  S.close = () => { for (const r of S.open) r.destroy(); server.closeAllConnections && server.closeAllConnections(); server.close(); };
  return new Promise(ok => server.listen(PORT, '127.0.0.1', () => ok(S)));
}

const ARGS = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const URL0 = `http://localhost:${PORT}/?overture=0`;
const loaderState = p => p.evaluate(() => { const L = document.getElementById('g-loader'), m = document.getElementById('g-load-msg'), b = L && L.querySelector('[data-reload]');
  return { err: !!L && L.classList.contains('err'), shown: !!L && !L.hidden && !L.classList.contains('out') && getComputedStyle(L).opacity !== '0', msg: m ? m.textContent : '',
    reload: !!b && !!b.offsetParent, failed: !!(window.OEBoot && window.OEBoot.failed) }; });
const titled = p => p.waitForFunction(() => { const l = document.getElementById('g-loader'), t = document.getElementById('g-title'); return window.__game && l && (l.hidden || l.classList.contains('out')) && t && !t.hidden; }, null, { timeout: 480000, polling: 1000 })
  .catch(async () => { throw new Error(`the page did not reach its title in 8 minutes: the loader at "${await p.evaluate(() => (document.getElementById('g-load-msg') || {}).textContent).catch(() => '?')}"`); });
// the story's shape as the page works it out (story.js is the browser's: read here with a window of its own)
function shapeNow() {
  const w = {}; new Function('window', fs.readFileSync(path.join(WEB, 'game/story.js'), 'utf8'))(w);
  const ep = JSON.parse(fs.readFileSync(path.join(WEB, 'data/shibuya/game.json'), 'utf8')).story.episodes[0];
  return { v: w.OEStory.shape(ep), ep, shape: w.OEStory.shape, save: w.OEStory.save };
}

// ---------------------------------------------------------------- keys
function keys() {
  const bad = [];
  const scan = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'data' && e.name !== 'assets') scan(f); continue; }
    if (!/\.(js|html)$/.test(e.name)) continue;
    const text = fs.readFileSync(f, 'utf8');
    // every key given to the storage as a literal, and every constant the files name a key by
    for (const m of text.matchAll(/(?:local|session)Storage\.(?:get|set|remove)Item\(\s*(['"`])([^'"`$]*)/g)) if (!m[2].startsWith('bh-')) bad.push(`${path.relative(ROOT, f)}: ${m[2]}`);
    for (const m of text.matchAll(/\b(?:[A-Z_]*KEY|KEEP|WORDS|ALIVE|CLOSED)\b\s*=\s*(?:\(?\w*\)?\s*=>\s*)?(['"`])(oe3d-|oe-)/g)) bad.push(`${path.relative(ROOT, f)}: ${m[0].slice(0, 40)}`);
  } };
  scan(WEB);
  check(!bad.length, `every storage key in web/ is the page's own, bh-* (${bad.length ? bad.slice(0, 4).join('; ') : 'none of the old project\'s'})`);
}
async function keysMoved(b, S) {
  const ctx = await b.newContext(SCREENS.desktop), p = await ctx.newPage();
  // (the old keys as a visit before the change left them; the page itself held before its scripts: only the guard runs)
  await p.route('**/telemetry.js*', r => r.abort());
  await p.addInitScript(() => { if (!sessionStorage.getItem('lc-once')) { sessionStorage.setItem('lc-once', '1');
    localStorage.setItem('bh-story-late', '{"fi":3}'); localStorage.setItem('bh-quality', 'high'); localStorage.setItem('bh-pad', 'x'); localStorage.setItem('bh-alive-abc', '1');
    localStorage.setItem('bh-music', 'kept'); localStorage.setItem('bh-music', 'old'); localStorage.setItem('other-site', '1'); } });
  await p.goto(URL0, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.OEBoot, null, { timeout: 60000 });
  const k = await p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) o[localStorage.key(i)] = localStorage.getItem(localStorage.key(i)); return o; });
  check(k['bh-story-late'] === '{"fi":3}' && k['bh-quality'] === 'high' && k['bh-pad'] === 'x' && k['bh-moved'] === '1',
    `a visit's old keys are copied to the page's own, once (bh-story-late ${k['bh-story-late']}, bh-quality ${k['bh-quality']}, bh-pad ${k['bh-pad']}, bh-moved ${k['bh-moved']})`);
  check(k['bh-music'] === 'kept' && !('bh-alive-abc' in k) && !('bh-other-site' in k) && k['bh-story-late'] === '{"fi":3}',
    `a key the page already has is not written over, a dead page's note and another site's keys are not brought, and the old project keeps its own (bh-music ${k['bh-music']})`);
  await p.evaluate(() => { localStorage.setItem('bh-story-late', '{"fi":5}'); });
  await p.reload({ waitUntil: 'commit' }); await p.waitForFunction(() => window.OEBoot, null, { timeout: 60000 });
  check(await p.evaluate(() => localStorage.getItem('bh-story-late')) === '{"fi":3}', 'the old project\'s later writes do not come over: the keys are copied once');
  await ctx.close();
}

// ---------------------------------------------------------------- start
async function start(b, S) {
  for (const [name, screen] of Object.entries(SCREENS)) {
    const run = async (label, { init = null, faults = {}, routes = [], until, still, wait = 90000 }) => {
      S.faults = JSON.parse(JSON.stringify(faults)); S.log.length = 0;
      const ctx = await b.newContext(screen), p = await ctx.newPage();
      await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', '1'); } catch (e) { /* storage blocked */ } });
      if (init) await p.addInitScript(init);
      for (const [pat, fn] of routes) await p.route(pat, fn);
      await p.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 120000 });
      let st = null;
      const t0 = Date.now();
      for (;;) { st = await loaderState(p).catch(() => null); if ((st && until(st)) || Date.now() - t0 > wait) break; await p.waitForTimeout(500); }
      if (still) { await p.waitForTimeout(900); await p.screenshot({ path: path.join(OUT, `start-${still}-${name}.png`) }); }
      const r = { st, ms: Date.now() - t0, faults: S.faults, log: S.log.slice() };
      await ctx.close(); S.faults = {};
      return r;
    };
    const errShown = st => st.err && st.shown;
    // a script of the page's list that does not arrive
    let r = await run('script', { faults: { 'game/game.js': { status: 404, times: 99 } }, until: errShown, still: 'script' });
    check(r.st && errShown(r.st) && r.st.reload && /did not arrive/.test(r.st.msg), `${name}: a script that does not arrive ends in the loader's error state with Reload ("${r.st && r.st.msg.slice(0, 60)}", ${Math.round(r.ms / 100) / 10} s)`);
    // an error before the first frame, and the loader standing still after it (the map's list never answered)
    r = await run('error', { init: () => { window.OE_NET = { still_ms: 4000, head_ms: 600000 }; addEventListener('DOMContentLoaded', () => setTimeout(() => { throw new Error('a start that broke'); }, 0)); },
      faults: { 'data/cities.json': { silent: true, times: 99 } }, until: errShown, still: 'error', wait: 60000 });
    check(r.st && errShown(r.st) && r.st.reload && /could not start/.test(r.st.msg), `${name}: an error before the first frame, and a loader that stands still after it, ends in the error state with Reload ("${r.st && r.st.msg.slice(0, 60)}")`);
    // a browser that cannot run the page
    r = await run('old', { init: () => { try { delete HTMLScriptElement.supports; } catch (e) { HTMLScriptElement.supports = undefined; } }, until: errShown, still: 'old' });
    check(r.st && errShown(r.st) && !r.st.reload && /too old/.test(r.st.msg), `${name}: a browser without import maps is told so, with no Reload to press in vain ("${r.st && r.st.msg.slice(0, 70)}")`);
    // a pack that stalls every time: given up, fetched again twice, then the error state
    const pack = name === 'phone' ? 'data/shibuya/d/buildings.bin' : 'data/shibuya/buildings.bin';
    // (a desktop's pack has its JSON beside it, asked for when the pack cannot be had: stalled too)
    r = await run('stall', { init: () => { window.OE_NET = { stall_ms: 2500, retry_ms: 200 }; }, faults: { [pack]: { stall: true, times: 99 }, 'data/shibuya/buildings.json': { stall: true, times: 99 } }, until: errShown, still: 'stall', wait: 240000 });
    check(r.st && errShown(r.st) && r.st.reload && r.faults[pack].hits === 3 && /stalled/.test(r.st.msg),
      `${name}: a pack that stalls is given up and fetched again twice, then the loader says so with Reload (${r.faults[pack].hits} requests; "${r.st && r.st.msg.slice(0, 80)}")`);
    // a request never answered: the guard's own wait, three tries
    r = await run('silent', { init: () => { window.OE_NET = { head_ms: 1500, retry_ms: 200 }; }, faults: { 'data/cities.json': { silent: true, times: 99 } }, until: errShown, wait: 60000 });
    check(r.st && errShown(r.st) && r.faults['data/cities.json'].hits === 3, `${name}: a request that is never answered is given up and asked twice more, and the loader ends in its error state (${r.faults['data/cities.json'].hits} requests, ${Math.round(r.ms / 100) / 10} s)`);
    // a pack that fails once (a 503, then a stall) is fetched again and the load goes on
    r = await run('retry', { init: () => { window.OE_NET = { stall_ms: 2500, retry_ms: 200 }; }, faults: { [pack]: { status: 503, times: 1 } },
      until: st => /Unpacking|Building|Compiling|Laying|Raising/i.test(st.msg) || st.err || !st.shown, wait: 240000 });
    const asked = r.log.filter(e => e.path === pack);
    check(r.st && !r.st.err && asked.length === 2 && asked[1].status === 200, `${name}: a pack answered 503 once is fetched again and the load goes on (${asked.map(e => e.status).join(', ')}; the loader at "${r.st && r.st.msg.slice(0, 50)}")`);
  }
}

// ---------------------------------------------------------------- save
function saveUnit() {
  const { save } = shapeNow();
  // a browser whose storage holds 4000 characters more
  const mk = room => { const store = {}; global.localStorage = { setItem(k, v) { if (String(v).length > room) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } store[k] = String(v); }, removeItem(k) { delete store[k]; } }; return store; };
  const big = { v: 'x', fi: 3, left: 4, prints: [1, 2, 3].map(n => ({ src: `data:image/jpeg;base64,${'A'.repeat(30000)}`, stamp: `17:1${n}`, cap: 'c' })), flags: { a: true }, pairs: [], file: [], failed: 0, snaps: [], helped: {} };
  let store = mk(1e9); const full = save('k', big);
  store = mk(4000); const lean = save('k', big), kept = store.k ? JSON.parse(store.k) : null;
  store = mk(10); store.k = 'older'; const none = save('k', big);
  check(full === 'full' && lean === 'lean' && kept && kept.fi === 3 && kept.flags.a && kept.prints.length === 3 && !kept.prints[0].src && kept.prints[0].stamp === '17:11' && none === 'none' && !('k' in store),
    `a case too big for the browser's storage is kept without its pictures, and with no room at all nothing older is left to be taken up (${full}, ${lean}, ${none})`);
  delete global.localStorage;
}
async function save(b, S) {
  const { v, ep } = shapeNow();
  const N = ep.frames.length;
  for (const [name, screen] of Object.entries(SCREENS)) {
    const ctx = await b.newContext(screen), p = await ctx.newPage();
    const errors = []; p.on('pageerror', e => errors.push(String(e)));
    // a case left at its fourth frame by a build whose story was another shape, with the log it kept; and a browser
    // with no room for another photograph (the guard and the story still write their small notes)
    await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', '1'); if (!sessionStorage.getItem('lc-once')) { sessionStorage.setItem('lc-once', '1');
      localStorage.setItem('bh-story-late', JSON.stringify({ v: 'another', fi: 3, left: 4, prints: [{ stamp: '17:14', cap: 'a' }, { stamp: '17:22', cap: 'b' }, { stamp: '17:31', cap: 'c' }], flags: { accused: true }, pairs: [], file: [], snaps: [] }));
      localStorage.setItem('bh-story-log-late', JSON.stringify([{ fi: 1, kind: 'q', who: 'x', text: 'an old line' }])); } } catch (e) { /* storage blocked */ } });
    await p.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await titled(p); await p.waitForTimeout(1500);
    await p.evaluate(() => document.querySelector('#gt-press').click()); await p.waitForTimeout(2500); // (past "press any key", to the menu)
    const t = await p.evaluate(() => { const q = s => document.querySelector(s), vis = e => !!e && !e.hidden && !!e.offsetParent, c = q('#gt-cont-go'), w = q('#gt-stale');
      return { cont: vis(c), contText: c ? c.textContent : '', why: vis(w) ? w.textContent : '', story: q('#gt-story-go') ? q('#gt-story-go').textContent : '',
        fits: !w || (w.getBoundingClientRect().right <= innerWidth + 1 && w.getBoundingClientRect().bottom <= innerHeight + 1) }; });
    await p.screenshot({ path: path.join(OUT, `save-stale-${name}.png`) });
    check(t.cont && /Start tonight again/i.test(t.contText) && !/Continue/i.test(t.contText) && /story has changed/i.test(t.why) && t.fits,
      `${name}: a case of another shape is not offered to continue: the title says why and offers tonight again ("${t.contText.replace(/\s+/g, ' ').trim().slice(0, 60)}"; "${t.why.slice(0, 60)}"${t.fits ? '' : '; the note runs off the screen'})`);
    // tonight again: the evening begins at its first frame, the old case and its log gone
    await p.evaluate(() => document.querySelector('#gt-cont-go').click());
    await p.waitForFunction(() => window.__game && window.__game.story && window.__game.story.state.phase && window.__game.story.state.phase !== 'dressed', null, { timeout: 300000, polling: 500 }).catch(() => {});
    const a = await p.evaluate(() => { const s = window.__game.story.state; return { fi: s.fi, prints: s.prints.length, flags: Object.keys(s.flags || {}).length, kept: localStorage.getItem('bh-story-late'), log: localStorage.getItem('bh-story-log-late') }; });
    check(a.fi === 0 && a.prints === 0 && a.flags === 0 && !(a.kept && /another/.test(a.kept)) && !/an old line/.test(a.log || ''),
      `${name}: tonight again starts at the first frame with nothing carried over (frame ${a.fi + 1} of ${N}, ${a.prints} prints, ${a.flags} flags)`);
    // storage full while the evening is played: the case written without its pictures, a word said once, and no error
    const q = await p.evaluate(sig => {
      const raw = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, val) { if (String(val).length > 3000) throw new DOMException('full', 'QuotaExceededError'); return raw.call(this, k, val); };
      const how = window.OEStory.save('bh-story-late', { v: sig, fi: 2, left: 5, prints: [{ src: `data:image/jpeg;base64,${'A'.repeat(20000)}`, stamp: '17:14' }, { src: `data:image/jpeg;base64,${'B'.repeat(20000)}`, stamp: '17:22' }], flags: {}, pairs: [], file: [], failed: 0, snaps: [], helped: {} });
      Storage.prototype.setItem = raw;
      const k = JSON.parse(localStorage.getItem('bh-story-late') || 'null');
      return { how, fi: k && k.fi, n: k && k.prints.length, src: !!(k && k.prints[0].src) };
    }, v);
    check(q.how === 'lean' && q.fi === 2 && q.n === 2 && !q.src && !errors.length, `${name}: with the browser's storage full the case is kept without its pictures, and nothing throws (${q.how}; ${errors.length} page errors${errors.length ? `: ${errors[0].slice(0, 80)}` : ''})`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------- cache
function vercelRules() {
  const cc = (p, q) => vercelHeaders(p, new URLSearchParams(q))['cache-control'] || '';
  const fresh = v => /max-age=0\b/.test(v) && /must-revalidate|no-cache/.test(v) || /no-cache|no-store/.test(v), kept = v => (+(/max-age=(\d+)/.exec(v) || [0, 0])[1]) > 0;
  const plain = ['/', '/index.html', '/world.js', '/data/shibuya/buildings.bin', '/assets/people/x.glb', '/vendor/three/three.module.min.js', '/version.json', '/fonts.css'].filter(p => !fresh(cc(p, '')));
  const hashed = ['/world.js', '/data/shibuya/buildings.bin', '/assets/people/x.glb'].filter(p => !kept(cc(p, 'v=abc')) || !kept(cc(p, 'b=abc')));
  check(!plain.length && !hashed.length, `vercel.json: an address without a hash is asked for again every time, and one with a hash is kept (${plain.concat(hashed).join(', ') || 'data, assets, vendor, scripts and the page'})`);
}
async function cache(b, S) {
  // the commit before: the same site with a script, a module, a worker and what it imports, a stylesheet, a vendor
  // file, data and a model that differ (a comment or white space after the text; bytes after the model's end. Not a
  // pack: its stream takes no byte after its end, and a pack is asked for as the JSON files here are)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-cache-')), before = path.join(tmp, 'before'), A = path.join(tmp, 'a'), B = path.join(tmp, 'b');
  const ALTER = ['world.js', 'gltf.js', 'pack-worker.js', 'pack.js', 'game/story.js', 'game/story.css', 'vendor/three/addons/utils/SkeletonUtils.js', 'data/cities.json', 'data/shibuya/trees.json',
    'data/shibuya/skyvis.json', 'assets/vehicles/vehicles.json', 'assets/vehicles/cars_far.glb', 'assets/trees/trees.json'].filter(f => fs.existsSync(path.join(WEB, f)));
  for (const f of ALTER) {
    const to = path.join(before, f); fs.mkdirSync(path.dirname(to), { recursive: true });
    const body = fs.readFileSync(path.join(WEB, f)), ext = path.extname(f);
    fs.writeFileSync(to, ext === '.js' ? Buffer.concat([body, Buffer.from('\n// the commit before\n')]) : ext === '.css' ? Buffer.concat([body, Buffer.from('\n/* the commit before */\n')])
      : ext === '.json' ? Buffer.concat([body, Buffer.from('\n \n')]) : Buffer.concat([body, Buffer.alloc(8)]));
  }
  const ca = 'a'.repeat(40), cb = 'b'.repeat(40);
  const sa = stamp({ root: WEB, layers: [before], out: A, commit: ca, version: '0.0.1' }), sb = stamp({ root: WEB, out: B, commit: cb, version: '0.0.2' });
  const differs = Object.keys(sb.files).filter(f => sa.files[f] !== sb.files[f]);
  check(differs.length === ALTER.length, `two commits of the site, stamped as a deploy stamps them: ${differs.length} files differ between them`);
  const { v } = shapeNow();
  for (const [name, screen] of Object.entries(SCREENS)) {
    const dir = path.join(tmp, `profile-${name}`);
    const ctx = await chromium.launchPersistentContext(dir, Object.assign({ headless: !process.env.DISPLAY, args: ARGS }, screen)); // (a profile on disk: its HTTP cache is kept from load to load)
    const p = ctx.pages()[0] || await ctx.newPage();
    const errors = []; p.on('pageerror', e => { errors.push(String(e)); console.log(`   (${name}) pageerror: ${String(e).slice(0, 160)}`); });
    await p.addInitScript(sig => { try { localStorage.setItem('bh-onboard', '1'); if (!localStorage.getItem('lc-once')) { localStorage.setItem('lc-once', '1');
      localStorage.setItem('bh-story-late', JSON.stringify({ v: sig, fi: 2, left: 5, prints: [{ stamp: '17:14', cap: 'a' }, { stamp: '17:22', cap: 'b' }], flags: {}, pairs: [], file: [], snaps: [] })); } } catch (e) { /* storage blocked */ } }, v);
    const got = []; // every answer the page was given: its path, its query, the hash of its body
    p.on('response', async r => {
      const u = new URL(r.url()); if (u.host !== `localhost:${PORT}` || r.request().method() !== 'GET') return;
      const e = { path: decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html', query: u.search, status: r.status(), doc: r.request().resourceType() === 'document', frameUrl: r.frame() ? r.frame().url() : '', cached: r.fromCache ? r.fromCache() : null, hash: null };
      got.push(e);
      try { e.hash = sha(await r.body()); } catch (err) { e.hash = `? ${String(err.message).slice(0, 40)}`; }
    });
    const build = () => p.evaluate(() => (window.OEBoot && window.OEBoot.build) || '');
    const offered = () => p.evaluate(() => { const c = document.querySelector('#gt-cont-go'); return !!c && !c.hidden && /Continue/i.test(c.textContent) && !document.querySelector('#gt-stale:not([hidden])'); });
    // 1. the commit before
    S.layers = [A, before, WEB]; S.host = 'pages'; S.log.length = 0;
    await p.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await titled(p); await p.waitForTimeout(3000);
    const first = { build: await build(), n: got.length, offered: await offered(), served: S.log.filter(e => e.status === 200).length };
    check(first.build === ca && first.offered && !errors.length, `${name}: the commit before loads to its title and offers the case left going (${first.n} answers, ${first.served} from the server; ${errors.length} page errors${errors.length ? `: ${errors[0].slice(0, 100)}` : ''})`);
    // 2. the site is the new commit; the same browser, its cache as the first load left it
    await p.goto('about:blank'); got.length = 0; errors.length = 0;
    S.layers = [B, WEB]; S.log.length = 0;
    await p.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await titled(p); await p.waitForTimeout(3000);
    await Promise.all(got.map(e => new Promise(ok => { const t0 = Date.now(), w = () => (e.hash || Date.now() - t0 > 5000 ? ok() : setTimeout(w, 50)); w(); })));
    const b2 = await build(), url = p.url();
    // (what the page of the commit before asked for until it saw the site was newer is not the load: from the new page on)
    const from = got.map(e => e.doc && e.path === 'index.html').lastIndexOf(true), load = got.slice(Math.max(0, from));
    const want = f => (f === 'index.html' ? sha(fs.readFileSync(path.join(B, f))) : sb.files[f]);
    // (of the files that differ between the two, and the page: the body the page was given, or where the browser
    // will not give a cached body up, whether the new commit's server was asked for it in this load)
    const fresh = new Set(S.log.filter(e => e.status === 200).map(e => e.path + e.query));
    const stale = load.filter(e => e.status === 200 && (differs.includes(e.path) || e.path === 'index.html') && (/^\?/.test(e.hash || '?') ? !fresh.has(e.path + e.query) : e.hash !== want(e.path)));
    const bare = load.filter(e => !e.doc && e.path !== 'version.json' && sb.files[e.path] && !/[?&](v|b)=/.test(e.query));
    const used = new Set(load.map(e => e.path)), seen = differs.filter(f => used.has(f));
    check(b2 === cb, `${name}: the second load is the new commit's page (${b2.slice(0, 7)}; ${/[?&]b=/.test(url) ? 'the page of the commit before, kept ten minutes by the host, loaded itself anew' : 'the page was asked for again'})`);
    check(!stale.length, `${name}: every file the second load used is the new commit's (${load.length} answers, ${seen.length} of the ${differs.length} files that differ among them${stale.length ? `; of the commit before: ${stale.slice(0, 5).map(e => e.path).join(', ')}` : ''})`);
    check(seen.length >= Math.min(8, differs.length - 4), `${name}: the load used the files that differ, so the comparison says something (${seen.join(', ')})`);
    check(!bare.length, `${name}: every request of the page's own files carries its hash or the build (${bare.length ? `${bare.length} without: ${[...new Set(bare.map(e => e.path))].slice(0, 8).join(', ')}` : `${load.length} requests`})`);
    check(await offered() && !errors.length, `${name}: the case left going is offered again by the new commit, and nothing threw (${errors.length} page errors${errors.length ? `: ${errors[0].slice(0, 100)}` : ''})`);
    fs.writeFileSync(path.join(OUT, `cache-${name}.json`), JSON.stringify({ first, load, stale, bare }, null, 1));
    await ctx.close();
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

(async () => {
  const S = await serve();
  let b = null;
  try {
    if (on('keys')) keys();
    if (on('save')) saveUnit();
    if (on('cache')) vercelRules();
    if (on('keys') || on('start') || on('save')) b = await chromium.launch({ headless: !process.env.DISPLAY, args: ARGS });
    if (on('keys')) await keysMoved(b, S);
    if (on('start')) await start(b, S);
    if (on('save')) await save(b, S);
    if (b) { await b.close(); b = null; }
    if (on('cache')) await cache(b, S);
  } catch (e) { check(false, `the check itself: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e}`); }
  if (b) await b.close().catch(() => {});
  S.close();
  console.log(fails ? `${fails} failed` : 'launch: all passed');
  process.exit(fails ? 1 : 0);
})();
