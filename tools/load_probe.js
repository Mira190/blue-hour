// The load and the slowest interaction, measured as the telemetry measures them (issue 186 A): the load's stages (the
// page's oe: marks), the main thread's heaviest functions between each stage and the next (a CPU profile, self time), the
// programs a draw linked rather than a warm-up, and the title's tap into play timed by Event Timing (the duration the
// telemetry's `inp` reads: from the tap to the frame painted after it), with the draws the gate held back (world.js gate).
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   xvfb-run -a node tools/load_probe.js [WxH] [out.json]     (TIER=high|medium|low; Q='?gate=0' for the page without the gate)
// RUNS=n loads it n times in fresh pages and prints each run's line and the median. TAP=0 leaves the tap out. WAIT=s: seconds on
// the title before the tap (5). The page is drawn by a software renderer here: read what costs most, not the milliseconds.
const { chromium } = require('playwright');
const fs = require('fs');
const [,, size = '1440x900', outFile = ''] = process.argv;
const [w, h] = size.split('x').map(Number), phone = w < 600;
const RUNS = +(process.env.RUNS || 1), WAIT = +(process.env.WAIT || 5);
// BASE=https://host/path/: a real host instead of the local server (the page as deployed: its network, compression and cache
// headers). The User-Agent then names the project, and the visitor's own switch turns the telemetry off (a harness's page
// is navigator.webdriver, which telemetry.js leaves out already).
const BASE = process.env.BASE || '';
const med = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };

async function once(b, run) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone, ...(BASE ? { userAgent: 'blue-hour-tools (+https://github.com/Mira190/blue-hour)' } : {}) });
  const p = await ctx.newPage();
  const logs = [];
  p.on('console', m => { const t = m.text(); if (/^(warm|compile|buffers|gate|set-up)/.test(t)) logs.push(t.slice(0, 300)); });
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 200)}`));
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); if (location.hostname !== 'localhost') localStorage.setItem('oe3d-telemetry', 'off'); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  await p.addInitScript(() => {
    // programs linked, by a warm-up's compile or by a draw (the stack names compile for the first)
    const P = WebGL2RenderingContext.prototype, G = window.__links = [];
    const lp = P.linkProgram; P.linkProgram = function (pr) { G.push({ t: performance.now(), draw: !/compile/i.test(new Error().stack) }); return lp.call(this, pr); };
    // the waits on the GPU in a program's first use (three.js's diagnostics read its log)
    const W = window.__waits = [], gl = P.getProgramInfoLog;
    P.getProgramInfoLog = function (pr) { const t = performance.now(), r = gl.call(this, pr); W.push({ t, ms: performance.now() - t }); return r; };
    // Event Timing, as telemetry.js reads it: the interactions and their durations
    // when the loader's warm-up was done (game.js logs it: "warm: from built, ...")
    const ci = console.info; console.info = function (...a) { if (typeof a[0] === 'string' && a[0].startsWith('warm: from built')) window.__warmDone = performance.now(); if (typeof a[0] === 'string' && a[0].startsWith('routes:')) window.__routesAt = performance.now(); return ci.apply(this, a); };
    // (every frame's time, for the title's frames between the title and the press)
    const FT = window.__ft = []; const tick = t => { FT.push(t); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    const LF = window.__loaf = [];
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) LF.push({ t: e.startTime, ms: e.duration, render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0, style: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0, script: (e.scripts || []).reduce((q, x) => q + x.duration, 0), top: [...(e.scripts || [])].sort((x, y) => y.duration - x.duration).slice(0, 2).map(x => `${x.sourceFunctionName || x.invoker} ${Math.round(x.duration)}`) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) { /* no LoAF */ }
    const E = window.__events = [];
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.interactionId) E.push({ t: e.startTime, ms: e.duration, type: e.name, proc: e.processingEnd - e.processingStart, delay: e.processingStart - e.startTime }); }).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch (e) { /* no Event Timing */ }
  });
  // LINKLAG=ms: a GPU that links a program in ms, one after another (as tools/story_play.js): a software renderer links as it is
  // asked, so without it the gate (world.js) never meets a program still linking
  if (+process.env.LINKLAG) await p.addInitScript(lag => {
    const P = WebGL2RenderingContext.prototype, link = P.linkProgram, get = P.getProgramParameter, due = new WeakMap();
    let last = 0;
    P.linkProgram = function (prog) { const t = Math.max(performance.now(), last) + lag; last = t; due.set(prog, t); return link.call(this, prog); };
    P.getProgramParameter = function (prog, what) { if (what === 0x91B1 && due.has(prog) && performance.now() < due.get(prog)) return false; return get.call(this, prog, what); };
  }, +process.env.LINKLAG);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start');
  // the page's clock and the profile's: performance.timeOrigin (ms since the epoch) and the profile's start (µs, monotonic)
  await p.goto(`${BASE || `http://localhost:${process.env.PORT || 8800}/`}${process.env.Q || ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: BASE ? 180000 : 1500000 /* (a real host under the GPU lock: three minutes, not twenty-five) */, polling: 500 });
  const st = await p.evaluate(() => { const o = {}; for (const k of ['fetched', 'decoded', 'built', 'frame']) { const m = performance.getEntriesByName(`oe:${k}`, 'mark').pop(); if (m) o[k] = m.startTime; } o.ready = performance.now(); return o; });
  const warmAt = await p.evaluate(() => window.__warmDone || null);
  let tap = null;
  if (process.env.TAP !== '0') {
    await p.waitForTimeout(WAIT * 1000);
    // (the title opens on its press: the street and the name; a press shows the menu, whose Begin is the tap into play)
    const pressBox = await p.evaluate(() => { const b = document.getElementById('gt-press-go'); if (!b || !b.offsetParent) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    if (pressBox) { if (phone) await p.touchscreen.tap(pressBox[0], pressBox[1]); else await p.mouse.click(pressBox[0], pressBox[1]); await p.waitForTimeout(2500); }
    // then the menu's way in as a player takes it: its lit button pressed, then whatever the next screen leads with (who you
    // play, the story's Begin), until the title is gone; each press's id is kept, to name the slowest
    const press = async bx => { if (phone) await p.touchscreen.tap(bx[0], bx[1]); else await p.mouse.click(bx[0], bx[1]); };
    const t0 = await p.evaluate(() => performance.now()), pressed = [];
    // (the title's frames from the title's showing to the press: the median, the 95th, the longest and those over 50 ms)
    const titleFrames = await p.evaluate(([a, z]) => { const F = window.__ft.filter(t => t >= a && t <= z), g = []; for (let i = 1; i < F.length; i++) g.push(F[i] - F[i - 1]); g.sort((x, y) => x - y); const q = f => Math.round(g[Math.min(g.length - 1, Math.floor(f * g.length))] || 0); return { n: g.length, med: q(0.5), p95: q(0.95), max: Math.round(g[g.length - 1] || 0), over50: g.filter(x => x > 50).length }; }, [st.ready, t0]);
    for (let k = 0; k < 4; k++) {
      const lead = await p.evaluate(() => { const t = document.getElementById('g-title'); if (!t || t.hidden) return null; const b = [...t.querySelectorAll('.btn.primary')].find(x => x.offsetParent); if (!b) return null; const r = b.getBoundingClientRect(); return { id: b.id, at: [r.x + r.width / 2, r.y + r.height / 2], t: performance.now() }; });
      if (!lead) break;
      pressed.push(lead); await press(lead.at); await p.waitForTimeout(1500);
    }
    await p.waitForTimeout(8000);
    tap = await p.evaluate(t0 => {
      const ev = window.__events.filter(e => e.t >= t0 - 50), worst = ev.sort((a, b) => b.ms - a.ms)[0] || null;
      const lf = worst ? window.__loaf.filter(f => f.t + f.ms >= worst.t && f.t <= worst.t + worst.ms) : [];
      if (worst) worst.loaf = lf.map(f => `${Math.round(f.ms)} ms (script ${Math.round(f.script)}, render ${Math.round(f.render)}, of it style and layout ${Math.round(f.style)}; ${f.top.join(', ')})`);
      return { t0, routesAt: window.__routesAt || null, worst, all: ev.map(e => `${e.type} ${Math.round(e.ms)}`).slice(0, 8), links: window.__links.filter(g => g.t >= t0 && g.t < t0 + 9500).length, drawLinks: window.__links.filter(g => g.draw && g.t >= t0 && g.t < t0 + 9500).length,
        waited: Math.round(window.__waits.filter(x => x.t >= t0 && x.t < t0 + 9500).reduce((s, x) => s + x.ms, 0)), gate: window.__gate ? Object.assign({}, window.__gate.n) : null };
    }, t0);
    tap.pressed = pressed.map(q => q.id);
    tap.title = titleFrames; tap.begin = pressed.length ? pressed[pressed.length - 1].t : null;
    tap.routes = tap.routesAt ? (tap.begin ? Math.round(tap.routesAt - tap.begin) : null) : 'not ready';
    if (tap.worst) { const q = pressed.filter(x => x.t <= tap.worst.t + 50).pop(); tap.worst.on = q ? q.id : '?'; }
  }
  const endPage = await p.evaluate(() => performance.now());
  const { profile } = await cdp.send('Profiler.stop');
  const links = await p.evaluate(() => window.__links);
  const timeOrigin = await p.evaluate(() => performance.timeOrigin);
  await ctx.close();
  // the profile's samples on the page's clock: the profile clock (µs) is the browser's monotonic clock, as is the page's
  // performance.now() + timeOrigin's monotonic base; line them up on the first frame mark is not possible from here, so use
  // the offset between the profile's end and the page's clock when it was read (within a few ms)
  const nodes = new Map(profile.nodes.map(n => [n.id, n]));
  const name = n => { const c = n.callFrame, u = c.url.replace(/^.*\/web\//, '').replace(/^https?:\/\/[^/]+\//, ''); return `${c.functionName || '(anon)'}${u ? ` ${u}:${c.lineNumber + 1}` : ''}`; };
  // (the profile's endTime matches the page's performance.now() at Profiler.stop to within the evaluate's round trip)
  const off = profile.endTime / 1000 - endPage;
  let t = profile.startTime / 1000; const samples = [];
  for (let i = 0; i < profile.samples.length; i++) { t += profile.timeDeltas[i] / 1000; samples.push([t - off, profile.samples[i]]); }
  const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const top = (a, z, k = 40) => {
    const self = new Map(), incl = new Map(); let all = 0;
    for (let i = 1; i < samples.length; i++) {
      const [ts, id] = samples[i]; if (ts < a || ts > z) continue;
      const n = nodes.get(id), nm = name(n); if (/^\(idle\)/.test(nm)) continue;
      const d = ts - samples[i - 1][0]; all += d; self.set(nm, (self.get(nm) || 0) + d);
      // (inclusive: each of the page's own functions on the stack once, the vendor's left out; SUBTREE='fn file:line': only the
      // samples whose stack runs through that function, to see what is inside it)
      if (process.env.SUBTREE) { let inside = false; for (let q = id; q != null; q = parent.get(q)) if (name(nodes.get(q)) === process.env.SUBTREE) { inside = true; break; } if (!inside) continue; }
      const seen = new Set();
      for (let q = id; q != null; q = parent.get(q)) { const qn = nodes.get(q); if (!qn.callFrame.url || /vendor\//.test(qn.callFrame.url)) continue; const m = name(qn); if (!seen.has(m)) { seen.add(m); incl.set(m, (incl.get(m) || 0) + d); } }
    }
    const fmt = m => [...m].sort((x, y) => y[1] - x[1]).slice(0, k).map(([k2, v]) => `${Math.round(v)} ms ${k2}`);
    return { busy: Math.round(all), top: fmt(self), incl: fmt(incl).concat([]).slice(0, process.env.INCL ? +process.env.INCL : 40) };
  };
  const win = { 'start-fetched': [0, st.fetched], 'fetched-decoded': [st.fetched, st.decoded], 'decoded-built': [st.decoded, st.built], 'built-frame': [st.built, st.frame], 'frame-ready': [st.frame, st.ready] };
  if (warmAt) { win['built-warm'] = [st.built, warmAt]; win['warm-frame'] = [warmAt, st.frame]; }
  if (tap && tap.worst) win.tap = [tap.t0, tap.t0 + tap.worst.ms];
  const prof = {}; for (const [k, [a, z]] of Object.entries(win)) if (a != null && z != null) prof[k] = top(a, z);
  const drawLinksLoad = links.filter(g => g.draw && g.t >= st.built && g.t <= st.frame).length;
  return { run, st, warmAt, tap, prof, drawLinksLoad, logs };
}

(async () => {
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu'] /* (a Mac's own GPU) */ : process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox', '--enable-experimental-web-platform-features'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const out = [];
  { const p = await b.newPage(); console.log(`renderer: ${await p.evaluate(() => { const d = document.createElement('canvas').getContext('webgl2'), x = d && d.getExtension('WEBGL_debug_renderer_info'); return d ? (x ? d.getParameter(x.UNMASKED_RENDERER_WEBGL) : d.getParameter(d.RENDERER)) : 'no WebGL2'; })}`); await p.close(); }
  for (let r = 1; r <= RUNS; r++) {
    const o = await once(b, r); out.push(o);
    const s = x => (x == null ? '—' : (x / 1000).toFixed(1));
    console.log(`run ${r} ${size} ${process.env.TIER || (phone ? 'low' : 'high')}${process.env.Q ? ` ${process.env.Q}` : ''}: fetched ${s(o.st.fetched)} · decoded ${s(o.st.decoded)} · built ${s(o.st.built)} · warm ${s(o.warmAt)} · frame ${s(o.st.frame)} · ready ${s(o.st.ready)} s; programs a draw linked in the load ${o.drawLinksLoad}`
      + (o.tap ? `; tap ${o.tap.worst ? `${Math.round(o.tap.worst.ms)} ms (${o.tap.worst.type} on #${o.tap.worst.on}, handler ${Math.round(o.tap.worst.proc)} ms; pressed ${o.tap.pressed.join(' > ')}; events ${o.tap.all.join(', ')}; its long frames ${(o.tap.worst.loaf || []).join(' / ')})` : 'no event'}, ${o.tap.drawLinks} programs a draw linked in the 8 s after it, ${o.tap.waited} ms waiting on program logs; the title's frames ${JSON.stringify(o.tap.title)}; routes ready ${typeof o.tap.routes === 'number' ? `${o.tap.routes} ms after the last press` : o.tap.routes}${o.tap.gate ? `, gate ${JSON.stringify(o.tap.gate)}` : ''}` : ''));
    for (const [k, v] of Object.entries(o.prof)) console.log(`  ${k}: ${v.busy} ms busy; self ${v.top.slice(0, 5).join(' | ')}\n    inclusive ${v.incl.slice(0, +(process.env.INCL || 8)).join(' | ')}`);
    for (const l of o.logs) console.log(`  [page] ${l}`);
  }
  if (RUNS > 1) {
    const m = k => med(out.map(o => o.st[k]));
    console.log(`median of ${RUNS}: fetched ${(m('fetched') / 1000).toFixed(1)} · decoded ${(m('decoded') / 1000).toFixed(1)} · built ${(m('built') / 1000).toFixed(1)} · frame ${(m('frame') / 1000).toFixed(1)} · ready ${(m('ready') / 1000).toFixed(1)} s; tap ${med(out.map(o => o.tap && o.tap.worst && o.tap.worst.ms))} ms`);
  }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
