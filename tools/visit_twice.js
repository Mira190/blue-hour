// A first visit and a second one, on a real host or a local server: the time to the title, the load's stages, what came
// over the network and what from the browser's cache, and what the pictures' encoders did each time (web/tex.js): does a
// second visit download or encode anything again? (issues 199 and 194: a local server has no network, no compression
// and no cache headers to speak of).
//   GPU=metal node tools/visit_twice.js https://host/path/ ['?tex=raw']      (xvfb-run -a elsewhere; TIER=, SIZE=, VISITS=n)
// One browser context, so the HTTP cache is kept between the visits; each visit is a new page. The visits send no
// telemetry: a harness's page is navigator.webdriver, which telemetry.js leaves out, the visitor's own switch
// (localStorage "oe3d-telemetry" = "off") is set as well, and a request to the telemetry's host fails the run.
// The User-Agent names the project and its URL.
const { chromium } = require('playwright');
const [,, base = `http://localhost:${process.env.PORT || 8800}/`, query = ''] = process.argv;
(async () => {
  const [w, h] = (process.env.SIZE || '1440x900').split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: process.env.GPU === 'metal' || !process.env.DISPLAY, args });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, userAgent: 'blue-hour-tools (+https://github.com/Mira190/blue-hour)' });
  await ctx.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('oe3d-telemetry', 'off'); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  let told = 0, bad = 0;
  for (let v = 1; v <= +(process.env.VISITS || 2); v++) {
    const p = await ctx.newPage(), errors = [], net = { n: 0, cached: 0, bytes: 0, revalidated: 0, biggest: [] }, ids = new Map();
    p.on('pageerror', e => errors.push(String(e).slice(0, 160)));
    p.on('request', r => { if (/posthog|\/batch\//.test(r.url())) told++; });
    // (what crossed the network: the bytes on the wire of each response, and which were answered by the cache or by a 304)
    const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable');
    cdp.on('Network.responseReceived', e => { ids.set(e.requestId, { url: e.response.url, cache: !!e.response.fromDiskCache || !!e.response.fromPrefetchCache, status: e.response.status }); });
    cdp.on('Network.requestServedFromCache', e => { const x = ids.get(e.requestId); if (x) x.cache = true; else ids.set(e.requestId, { url: '', cache: true }); });
    cdp.on('Network.loadingFinished', e => { const x = ids.get(e.requestId) || {}; net.n++; if (x.cache) net.cached++; else { net.bytes += e.encodedDataLength; if (x.status === 304) net.revalidated++; net.biggest.push([e.encodedDataLength, (x.url || '').replace(base, '').split('?')[0]]); } });
    const t0 = Date.now();
    await p.goto(base + query, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 100 });
    const title = (Date.now() - t0) / 1000;
    await p.evaluate(() => (window.OETex && OETex.settled ? OETex.settled() : null));
    const settled = (Date.now() - t0) / 1000;
    const atTitle = { n: net.n, cached: net.cached, bytes: net.bytes };
    await p.waitForTimeout(4000);
    const r = await p.evaluate(() => { const o = {}; for (const k of ['fetched', 'decoded', 'built', 'frame']) { const m = performance.getEntriesByName(`oe:${k}`, 'mark').pop(); if (m) o[k] = m.startTime / 1000; }
      const T = (window.OETex && OETex.stats) || {}, d = document.createElement('canvas').getContext('webgl2'), x = d && d.getExtension('WEBGL_debug_renderer_info'), B = window.OEBoot || {};
      const nav = performance.getEntriesByType('navigation')[0] || {};
      return { st: o, build: String(B.build || '').slice(0, 8) || 'unstamped', tex: { on: !!T.on, fmt: T.fmt || '', packed: T.packed || 0, kept: T.kept || 0, mtexels: +((T.texels || 0) / 1e6).toFixed(1) }, renderer: d ? (x ? d.getParameter(x.UNMASKED_RENDERER_WEBGL) : d.getParameter(d.RENDERER)) : 'no WebGL2', ttfb: nav.responseStart, proto: nav.nextHopProtocol, sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller) }; });
    const s = x => (x == null ? '—' : x.toFixed(1)), MB = x => (x / 1048576).toFixed(1);
    if (v === 1) console.log(`${base}${query}  build ${r.build}; renderer: ${r.renderer}; ${r.proto || '?'}${r.sw ? ', a service worker' : ''}`);
    console.log(`visit ${v}: the title at ${title.toFixed(1)} s (first byte ${Math.round(r.ttfb || 0)} ms; fetched ${s(r.st.fetched)} · decoded ${s(r.st.decoded)} · built ${s(r.st.built)} · first frame ${s(r.st.frame)}); pictures ${r.tex.on ? `${r.tex.fmt}: ${r.tex.packed} packed (${r.tex.mtexels} M texels), ${r.tex.kept} kept, encoders idle at ${settled.toFixed(1)} s` : 'as pixels (no encoder)'}; to the title ${atTitle.n} responses, ${atTitle.cached} from the cache, ${MB(atTitle.bytes)} MB over the network; 4 s later ${net.n}, ${net.cached}, ${MB(net.bytes)} MB${net.revalidated ? `, ${net.revalidated} answered 304` : ''}`);
    if (process.env.BIGGEST) console.log(`  the largest over the network: ${net.biggest.sort((a, z) => z[0] - a[0]).slice(0, +process.env.BIGGEST).map(([n, u]) => `${u} ${MB(n)}`).join(', ')}`);
    if (errors.length) { bad++; console.log(`  page errors: ${errors.slice(0, 4).join(' | ')}`); }
    await p.close();
  }
  if (told) { bad++; console.log(`FAIL ${told} requests to the telemetry's host: these visits were to send none`); }
  await b.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
