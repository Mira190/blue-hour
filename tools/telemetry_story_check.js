// The story page's telemetry, end to end (docs/OBSERVABILITY.md, "Testing"): loads the page with ?telemetry=debug (each batch
// logged, nothing sent), takes the title's way into play as a player does, waits for the first "time" (half a minute into the
// view), and checks what version 7 added: on "load" the stages and the warm-up's parts (warm_prog_ms, warm_tex_ms, warm_buf_ms),
// and on "time" the slowest interaction named (inp_on, inp_type, inp_wait, inp_run, inp_paint). Exits 1 if one is missing.
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   xvfb-run -a node tools/telemetry_story_check.js [WxH]
const { chromium } = require('playwright');
const [,, size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 600;
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  const events = [];
  p.on('console', async m => { if (!/^\[telemetry\]/.test(m.text())) return; try { const a = m.args()[1]; if (a) for (const e of await a.jsonValue()) events.push(e); } catch (e) { /* the page went on */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?telemetry=debug`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(3000);
  const press = async id => { const at = await p.evaluate(i => { const el = i ? document.getElementById(i) : [...document.querySelectorAll('#g-title .btn.primary')].find(x => x.offsetParent); if (!el || !el.offsetParent) return null; const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, id); if (!at) return false; if (phone) await p.touchscreen.tap(at[0], at[1]); else await p.mouse.click(at[0], at[1]); await p.waitForTimeout(1500); return true; };
  await press('gt-press-go');
  for (let k = 0; k < 4 && await p.evaluate(() => !document.getElementById('g-title').hidden); k++) if (!await press(null)) break;
  // (the first "time" goes half a minute into the view; the page is hidden after, which sends the rest)
  await p.waitForTimeout(36000);
  await p.evaluate(() => { try { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); } catch (e) { /* kept */ } });
  await p.waitForTimeout(3000);
  await b.close();
  const name = e => e.event || e.e || e.name, props = e => e.props || e.properties || e;
  const load = events.filter(e => name(e) === 'load').map(props).find(q => q.ok);
  const times = events.filter(e => name(e) === 'time').map(props), slow = times.filter(q => q.inp).sort((x, y) => y.inp - x.inp)[0];
  const bad = [];
  if (!load) bad.push('no "load" with ok');
  else for (const k of ['fetch_ms', 'decode_ms', 'build_ms', 'warm_prog_ms', 'warm_tex_ms', 'warm_buf_ms', 'frame_ms', 'ms']) if (typeof load[k] !== 'number') bad.push(`load without ${k}`);
  if (!times.length) bad.push('no "time"');
  if (slow) for (const k of ['inp_on', 'inp_type', 'inp_wait', 'inp_run', 'inp_paint']) if (slow[k] == null) bad.push(`time with inp ${slow.inp} without ${k}`);
  console.log(`events: ${events.length} (${[...new Set(events.map(name))].join(', ')})`);
  if (load) console.log(`load: ${['fetch_ms', 'decode_ms', 'build_ms', 'warm_prog_ms', 'warm_tex_ms', 'warm_buf_ms', 'frame_ms', 'ms'].map(k => `${k} ${load[k]}`).join(', ')}`);
  console.log(slow ? `slowest interaction: ${slow.inp} ms on ${slow.inp_on} (${slow.inp_type}): wait ${slow.inp_wait}, handlers ${slow.inp_run}, paint ${slow.inp_paint}; at ${slow.inp_spot}` : 'no interaction over 40 ms reported');
  console.log(bad.length ? `FAIL ${bad.join('; ')}` : 'ok   telemetry: the load\'s stages and warm-up, and the slowest interaction named');
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
