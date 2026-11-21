// The way in waits for the level the player stands in (issue 62): on a phone the Scramble's hero level came seconds after
// the game opened, and a skip of the opening showed the city's own Scramble and then the level taking its place. Here the
// story is begun, its opening skipped as soon as it can be, and every fifth of a second the page is read: the veil
// (game.js holdForLevel), the level's state, whether it is drawn, and how far the camera is from the player. It fails if
// the camera is at the player while the level is not drawn and the veil is not up (before the wait's bound ran out), if
// the veil stays up past the bound, or if the page throws. Stills: the veil, the first frame after it, and frame 1 a few
// seconds on.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/level_wait.js out_dir [WxH]
// DELAY=s holds the level's file back that long (the default 12: a phone's wait, on any machine; 0 leaves it as it comes;
// more than the level takes tests the bound: the veil lifts at 6 s without it). BOUND=s gives the page a bound of its own
// (?levelwait=s), longer than a software renderer takes to make the level ready, to see the veil lift once it is drawn.
// LOG=1 prints the page's compiles and warm-ups as they finish, with the time since the page was opened.
// CRANE=1: no opening (?overture=0, as reduced motion and a story continued have): the crane down from the title waits.
// A width under 600 is a phone (low tier, an iPhone's memory path).
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = 'level_wait', size = '390x844'] = process.argv;
const DELAY = +(process.env.DELAY ?? 12), BOUND = +(process.env.BOUND || 6), CRANE = !!process.env.CRANE, LOG = !!process.env.LOG;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 600;
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext(phone ? { viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' } : { viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, phone ? 'low' : 'high');
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  let waited = null;
  const T0 = Date.now();
  p.on('console', m => { const t = m.text(), w = t.match(/the way in waited ([\d.]+) s/); if (w) waited = +w[1]; if (/the way in waited|hero scramble/.test(t) || (LOG && /compile|warm|hero|overture/i.test(t))) console.log(`  page ${((Date.now() - T0) / 1000).toFixed(1)} s: ${t.slice(0, 200)}`); });
  // the level's file held back DELAY seconds from the moment it is asked for
  let asked = null;
  if (DELAY > 0) await p.route(/hero\/scramble\.glb$/, async r => { asked = Date.now(); await new Promise(k => setTimeout(k, DELAY * 1000)); await r.continue(); });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?${[process.env.BOUND ? `levelwait=${BOUND}` : '', CRANE ? 'overture=0' : ''].filter(Boolean).join('&')}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  const level = () => p.evaluate(() => { const s = window.__game.hero(); return s ? s.state()[0] : null; });
  console.log(`${((Date.now() - T0) / 1000).toFixed(1)} s: title up; the level: ${JSON.stringify(await level())}${asked ? `, asked for ${((Date.now() - asked) / 1000).toFixed(1)} s ago` : ''}`);
  await p.evaluate(() => document.getElementById('gt-play').click());
  // the opening's skip, as soon as it is taken (a story's: 1.5 s in, Space)
  if (!CRANE) await p.waitForFunction(() => { const o = window.__game.overture(); return o && o.active && o.t > 1.8; }, null, { timeout: 300000, polling: 100 });
  const pre = await level();
  if (!CRANE) await p.keyboard.press('Space');
  const t0 = Date.now();
  console.log(`${((Date.now() - T0) / 1000).toFixed(1)} s: ${CRANE ? 'played' : 'skipped'}; the level then: ${pre.state}`);
  const rows = [];
  let veilShot = false, afterShot = false, veilSeen = false, veilGoneAt = null;
  const shoot = async name => { try { await p.screenshot({ path: `${out}/${name}.png`, timeout: 60000 }); } catch (e) { console.log(`(no still ${name})`); } };
  while (Date.now() - t0 < (BOUND + 40) * 1000) {
    const r = await p.evaluate(() => {
      const g = window.__game, v = document.querySelector('.g-veil'), L = g.hero().state()[0], c = g.camera.position, pl = g.player;
      return { veil: !!(v && v.classList.contains('on') && getComputedStyle(v).opacity > 0.9), state: L.state, shown: L.shown,
        cam: Math.round(Math.hypot(c.x - pl.x, -c.z - pl.y)), ov: !!(g.overture() && g.overture().active) };
    });
    r.t = +((Date.now() - t0) / 1000).toFixed(1);
    rows.push(r);
    if (r.veil) veilSeen = true;
    if (veilSeen && !r.veil && veilGoneAt == null) veilGoneAt = r.t;
    if (r.veil && !veilShot && r.t > 0.8) { veilShot = true; await shoot('1-veil'); }
    if (veilGoneAt != null && !afterShot && r.t > veilGoneAt + 0.6) { afterShot = true; await shoot('2-after'); }
    if (!r.ov && veilGoneAt != null && r.t > veilGoneAt + 3) break;
    if (!veilSeen && !r.ov && r.t > 3) break;
    await p.waitForTimeout(200);
  }
  await p.waitForTimeout(3000);
  await shoot('3-frame1');
  // what was seen: once the veil had come up, the camera at the player (within 25 m) with the level not drawn and no veil,
  // inside the bound (before it, the opening's shot, or on the crane's way the title's own view, which is the title's)
  const up = rows.findIndex(r => r.veil), bad = up < 0 ? [] : rows.slice(up).filter(r => r.cam < 25 && !r.shown && !r.veil && r.t < BOUND);
  for (const r of rows.filter((r, i) => i % 3 === 0 || r.veil !== (rows[i - 1] || {}).veil)) console.log(`  ${r.t.toFixed(1)} s  veil ${r.veil ? 'up  ' : 'down'}  level ${r.state}${r.shown ? ' (drawn)' : ''}  camera ${r.cam} m from the player${r.ov ? '  (opening)' : ''}`);
  if (pre.state === 'ready' && veilSeen) errors.push('the level was ready at the skip, and the veil came up all the same');
  if (pre.state !== 'ready' && !veilSeen) errors.push('the level was not ready at the skip, and no veil came up');
  if (bad.length) errors.push(`the city's own Scramble seen at the player before the level: ${bad.length} samples from ${bad[0].t} s`);
  // the page's own count of the wait (a software renderer's frame is a second or two, and a timer waits for it: the page's
  // 6 s bound measured 8 s here, and the veil was seen down 9.5 s after the skip)
  if (waited != null && waited > BOUND + 3) errors.push(`the way in waited ${waited} s, past the bound of ${BOUND} s`);
  console.log(`veil ${veilSeen ? `up, down at ${veilGoneAt} s` : 'not shown'}; page errors: ${errors.length}`);
  for (const e of errors) console.log(`FAIL ${e}`);
  await b.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
