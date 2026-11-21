// The title's marks (game.js titleMarks; docs/STORY.md "A mark for each screen"): a camera for each of the title's
// screens. On a desktop's page and a phone's: the press, framed centred; pressed, the camera moves to the menu's mark (the
// screens to the frame's upper right third, upright to its top) and settles there; the screens behind the menu (options,
// the story, who you play) take it further in, and Back brings it out; Esc from the menu goes back to the press's frame.
// It fails a press that does not move the camera, a move that overshoots or turns back on itself, a screen behind the
// menu that does not take it in or a Back that does not bring it out, and a jump where the walk's crane down to your
// shoulder takes over from the menu's mark. Stills of each go to out_dir.
//
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/title_marks.js out_dir          (SCREENS=desk or touch: only that one)
//   TUNES='[{"x":0.4},{"truck":4}]': the menu's frame again with each of these laid over MARK, a still of each
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/title-marks'] = process.argv;
const PORT = process.env.PORT || 8800;
const SCREENS = (process.env.SCREENS || 'desk,touch').split(',');
const TUNES = JSON.parse(process.env.TUNES || '[]');
let fails = 0;
const fail = m => { fails++; console.log(`FAIL ${m}`); };
const ok = m => console.log(`ok   ${m}`);

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  for (const screen of SCREENS) {
    const touch = screen === 'touch', size = touch ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    const ctx = await b.newContext({ viewport: size, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    const p = await ctx.newPage();
    p.on('pageerror', e => fail(`pageerror (${screen}): ${String(e).slice(0, 200)}`));
    await p.addInitScript(`try { localStorage.setItem('bh-quality', 'high'); localStorage.setItem('bh-player', 'M'); localStorage.removeItem('bh-story-late'); localStorage.removeItem('bh-story-late-closed'); } catch (e) {}`);
    await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && window.__game.flyover && t && !t.hidden && document.getElementById('gt-walk-go'); }, null, { timeout: 900000, polling: 500 });
    await p.waitForTimeout(3000);
    const settle = () => p.evaluate(() => document.getAnimations().forEach(a => { try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (e) { /* */ } }));
    const shot = async n => { await settle(); await p.screenshot({ path: `${out}/${screen}-${n}.png` }); };
    // the camera's pose and the marks' state, from the page
    const pose = () => p.evaluate(() => { const g = window.__game, c = g.camera, m = g.flyover.marks.mark;
      return { pos: c.position.toArray(), q: c.quaternion.toArray(), k: m.k, d: m.d, screen: g.screen() }; });
    const angle = (a, b) => { const dot = Math.abs(a.q[0] * b.q[0] + a.q[1] * b.q[1] + a.q[2] * b.q[2] + a.q[3] * b.q[3]); return 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI; };
    const dist = (a, b) => Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
    const until = (fn, arg, ms = 240000) => p.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true, () => false);
    // every frame's mark and pose, recorded in the page from now until stop()
    const record = () => p.evaluate(() => { const g = window.__game, rec = window.__marks = []; let on = true;
      const f = () => { if (!on) return; const m = g.flyover.marks.mark, c = g.camera; rec.push({ t: performance.now(), k: m.k, d: m.d, pos: c.position.toArray(), q: c.quaternion.toArray(), title: !document.getElementById('g-title').hidden }); requestAnimationFrame(f); };
      requestAnimationFrame(f); window.__marksStop = () => { on = false; return rec; }; });
    const stop = () => p.evaluate(() => window.__marksStop());
    const back = () => p.keyboard.press('Escape');
    const open = async sel => { if (touch) await p.tap(sel); else await p.click(sel); };

    // the press: framed centred
    const P0 = await pose();
    if (P0.screen !== 'press' || P0.k > 1e-3) fail(`${screen}: the title does not open on the press's frame (${P0.screen}, mark ${P0.k.toFixed(3)})`);
    await shot('0-press');
    // pressed: the menu's mark, the move on the way and settled
    await record();
    if (touch) await p.touchscreen.tap(size.width / 2, size.height / 2); else await p.keyboard.press('Space');
    await p.waitForTimeout(700); await p.screenshot({ path: `${out}/${screen}-1-moving.png` });
    const there = await until(() => window.__game.flyover.marks.mark.k > 0.995, null, 300000);
    const rec = await stop();
    const P1 = await pose();
    if (!there) fail(`${screen}: pressed, and the camera never came to the menu's mark (mark ${P1.k.toFixed(3)} after 300 s)`);
    const ks = rec.map(r => r.k), over = Math.max(...ks), back1 = ks.some((k, i) => i && k < ks[i - 1] - 1e-4);
    if (over > 1.01 || back1) fail(`${screen}: the move overshoots or turns back (peak ${over.toFixed(3)}, ${back1 ? 'turned back' : 'one way'})`);
    const moved = dist(P0, P1), turned = angle(P0, P1);
    if (moved < 1.5 || turned < 5) fail(`${screen}: the menu's frame is the press's (${moved.toFixed(2)} m, ${turned.toFixed(1)} degrees from it)`);
    else ok(`${screen}: pressed, the camera moves ${moved.toFixed(2)} m and turns ${turned.toFixed(1)} degrees to the menu's mark, in ${((rec[rec.length - 1].t - rec[0].t) / 1000).toFixed(1)} s over ${rec.length} frames, peak ${over.toFixed(3)}`);
    await shot('1-menu');
    for (const [i, t] of TUNES.entries()) {
      await p.evaluate(t => Object.assign(window.__game.flyover.marks.MARK, t), t);
      await p.waitForTimeout(400); await shot(`1-menu-t${i}`);
      console.log(`tune ${i}: ${JSON.stringify(t)}`);
    }
    // the screens behind the menu: further in, and out again with Back
    for (const [n, sel, s] of [['2-opts', '#gt-opts-go', 'opts'], ['3-story', '#gt-story-go', 'story'], ['4-who', '#gt-who-line', 'who']]) {
      if (!(await p.$eval(sel, e => !!e.offsetParent).catch(() => false))) { console.log(`skip ${s}: ${sel} not shown`); continue; }
      const A = await pose();
      await open(sel);
      if (!(await until(s => window.__game.screen() === s, s, 20000))) { fail(`${screen}: ${sel} did not open ${s}`); continue; }
      const inn = await until(() => window.__game.flyover.marks.mark.d > 0.995);
      const B = await pose();
      if (!inn || dist(A, B) < 1) fail(`${screen}: ${s} does not take the camera in (${dist(A, B).toFixed(2)} m, depth ${B.d.toFixed(3)})`);
      await shot(n);
      await back();
      const outd = await until(() => window.__game.screen() === 'menu' && window.__game.flyover.marks.mark.d < 0.005);
      if (!outd) fail(`${screen}: Back from ${s} does not bring the camera out again`);
      else ok(`${screen}: ${s} takes the camera ${dist(A, B).toFixed(2)} m in, and Back brings it out`);
    }
    // Esc from the menu: the press's frame again
    await back();
    const pressed = await until(() => window.__game.screen() === 'press' && window.__game.flyover.marks.mark.k < 0.005);
    if (!pressed) fail(`${screen}: Esc from the menu does not give the press its frame again`);
    else { ok(`${screen}: Esc, and the press's frame again`); await shot('5-press-again'); }
    // the walk set out from the menu's mark: the crane down to the shoulder takes over without a jump
    if (touch) await p.touchscreen.tap(size.width / 2, size.height / 2); else await p.keyboard.press('Space');
    await until(() => window.__game.flyover.marks.mark.k > 0.995, null, 300000);
    await open('#gt-walk-go');
    await until(() => { const s = document.getElementById('gt-walk-set'); return s && s.offsetParent; }, null, 30000);
    await record();
    await p.waitForTimeout(500);
    await open('#gt-walk-set');
    await until(() => document.getElementById('g-title').hidden, null, 60000);
    await p.waitForTimeout(4000);
    const run = await stop();
    const i0 = run.findIndex(r => !r.title);
    if (i0 < 1) fail(`${screen}: no frame recorded across setting out (${run.length} frames, first untitled ${i0})`);
    else {
      const steps = run.slice(1).map((r, i) => angle(run[i], r)), jump = Math.max(...steps.slice(Math.max(0, i0 - 2), i0 + 2));
      const after = steps.slice(i0 + 2, i0 + 30).sort((a, c) => a - c), med = after.length ? after[after.length >> 1] : 0;
      if (jump > 2 && jump > 3 * med) fail(`${screen}: the crane jumps from the menu's mark (${jump.toFixed(2)} degrees in a frame, the move's median ${med.toFixed(2)})`);
      else ok(`${screen}: the crane takes over from the menu's mark without a jump (${jump.toFixed(2)} degrees at most in a frame there, the move's median ${med.toFixed(2)})`);
    }
    await shot('6-crane');
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `${fails} failed` : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
