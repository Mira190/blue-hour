// The page's functions thrown out of their optimised code while it plays (issue 220): V8's own trace of every deopt
// (--trace-deopt-verbose), read from the browser's output, over a window of play after the page has settled, counted
// by function, file and line, and reason. A function deoptimised again and again while the player plays runs as
// unoptimised code in between, several times slower: people.js sliceAt was thrown out 35 times a minute ("wrong map",
// a new Matrix4's elements small integers until their first fraction) and made a slice's frame in 3.8 µs, not 1.1.
//   node tools/deopt_survey.js [WxH] [seconds]     (a width under 500 is an iPhone's page, the low tier)
//   FROM=6: a case left at frame 7 (the frame after the late case's film); WALK=1: the title's Walk Shibuya instead of Play
//   WARM=seconds the page is left before the window (25); DRAW=n: one frame in n drawn (240); TOP=n rows (30)
//   OUT=file: every deopt of the window as JSON lines
// Run under xvfb-run, as a job (tools/job.sh). The counts are this machine's: a deopt is the engine's, and repeats on
// any machine that meets the same objects, but how often depends on how fast the story's clock runs.
process.env.DEBUG = [process.env.DEBUG, 'pw:browser'].filter(Boolean).join(','); // (the browser's own output: Playwright passes it to its debug log only)
const { chromium } = require('playwright');
const fs = require('fs');
const { skip } = require('./draw_skip');
const [,, size = '1440x900', secs = '60'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  let collect = false, t0 = 0;
  const lines = [], pend = new Map(); // (a verbose deopt is several lines: its head, then where it was)
  const take = msg => {
    if (!collect) return;
    for (const l of String(msg).split('\n')) {
      const m = /\[bailout \(kind: ([\w-]+), reason: ([^)]*)\): begin\. deoptimizing 0x[0-9a-f]+ <JSFunction ([^ >]*)/.exec(l);
      if (m) { if (/OSR/.test(m[2])) continue; const d = { t: (Date.now() - t0) / 1000, kind: m[1], reason: m[2], fn: m[3] || '(anon)', at: null }; lines.push(d); pend.set('last', d); continue; }
      const a = /;;; deoptimize at <([^>]+)>/.exec(l) || /deoptimize at <([^>]+)>/.exec(l);
      if (a && pend.get('last') && !pend.get('last').at) pend.get('last').at = a[1].replace(/^https?:\/\/[^/]+\//, '').replace(/\?[^:]*/, '');
    }
  };
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => { const t = String(chunk); if (/pw:browser/.test(t)) { take(t); return true; } return write(chunk, ...rest); }; // (read, not printed: a minute of V8's trace is a hundred thousand lines)
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox', '--disable-gpu-watchdog', '--js-flags=--trace-deopt --trace-deopt-verbose'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 3 : 1, hasTouch: phone, isMobile: phone,
    ...(phone ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' } : {}) });
  const errors = []; p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  if (process.env.FROM) await p.addInitScript(n => { try { localStorage.setItem('bh-story-late', JSON.stringify({ fi: n, left: 7 - n, prints: Array.from({ length: n }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, +process.env.FROM);
  await skip(p, +process.env.DRAW || 240);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${process.env.Q || ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(4000);
  for (let k = 0; k < 15; k++) {
    if (await p.evaluate(([late, walk]) => { const t = document.getElementById('g-title'); if (!t || t.hidden) return true; const vis = id => { const e = document.getElementById(id); return e && e.offsetParent ? e : null; };
      const x = walk ? vis('gt-walk-go') : (late ? vis('gt-continue') || vis('gt-cont-go') : null) || vis('gt-story-go') || vis('gt-cont-go') || document.getElementById('gt-play'); if (x) x.click(); return false; }, [!!process.env.FROM, !!process.env.WALK])) break;
    await p.waitForTimeout(1500);
  }
  if (process.env.FROM) for (let k = 0; k < 60; k++) {
    const st = await p.evaluate(() => { const g = window.__game, s = g.story && g.story.state; if (g.cine && g.cine.active && g.cine.skip) g.cine.skip(); return s ? s.phase : ''; });
    if (st && st !== 'dressed') break;
    await p.waitForTimeout(1000);
  }
  await p.waitForTimeout(1000 * (+process.env.WARM || 25));
  const where = await p.evaluate(() => { const g = window.__game, s = g.story && g.story.state; return { fi: s ? s.fi + 1 : 0, phase: s ? s.phase : '', tier: window.OEQuality.tier().name }; });
  collect = true; t0 = Date.now();
  await p.waitForTimeout(1000 * +secs);
  collect = false;
  await b.close();
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  // (by function and where, with its reasons)
  const by = new Map();
  for (const d of lines) { const k = `${d.fn} ${d.at || ''}`; const e = by.get(k) || { fn: d.fn, at: d.at, n: 0, why: new Map() }; e.n++; e.why.set(d.reason, (e.why.get(d.reason) || 0) + 1); by.set(k, e); }
  const rows = [...by.values()].sort((a, b) => b.n - a.n).slice(0, +process.env.TOP || 30);
  console.log(`${size}${phone ? ' (a phone)' : ''}, ${process.env.WALK ? 'the walk' : `frame ${where.fi}`} (${where.phase}, ${where.tier}): ${lines.length} deopts in ${secs} s of play, ${by.size} places`);
  for (const r of rows) console.log(`${String(r.n).padStart(5)}  ${r.fn}  ${r.at || '?'}  ${[...r.why].map(([k, v]) => `${k} ×${v}`).join(', ')}`);
  if (errors.length) console.log(`page errors: ${errors.slice(0, 3).join(' | ')}`);
})();
