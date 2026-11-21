// The camera's effects drawn two ways from one held state, pixel for pixel (issue 105): the post stack's one-target tail
// (the merge writes the distance into its target's alpha, the effects draw back into the scene's target) against the
// two-target tail it stands in for (a pass that does nothing put between the effects and the lens sends the frame that
// way). Each pair is drawn in one task, with nothing of the world moved between them; the same path drawn twice is the
// control. Prints the pixels that differ and the largest difference, per case, and exits 1 if more than SHARE (default
// 0.1%) of the frame's pixels differ by more than MAXD (default 4 of 255), or WebGL reports a feedback loop. (The one-target
// tail reads each pixel's distance from a half float: within a thousandth of it, where the depth gave it whole; the depth
// of field's "a nearer sample doesn't bleed behind" then breaks a tie the other way on a few pixels of a far edge.)
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/fx_ab.js [x,y] [WxH]        (default frame 5's place, 390x844, the phone's tier)
// TIER=low|medium|high; HOUR=minutes (default 1290, half past nine at night); OUT=dir writes a.png and b.png per case.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { startPlay } = require('./start_play');
const [,, atArg = '521.9,-1074.1', size = '390x844'] = process.argv;
const MAXD = +(process.env.MAXD || 4), SHARE = +(process.env.SHARE || 0.001);
(async () => {
  const [w, h] = size.split('x').map(Number), at = atArg.split(',').map(Number), phone = w < 600;
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1 });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); localStorage.setItem('oe3d-onboard', '1'); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  if (process.env.OUT) await p.addInitScript(() => { window.__abOut = true; });
  const errs = [];
  p.on('console', m => { if (/feedback|INVALID_OPERATION|GL_INVALID/i.test(m.text())) errs.push(m.text().slice(0, 200)); });
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await startPlay(p);
  await p.waitForTimeout(1500);
  await p.evaluate(async ([x, y, hour]) => {
    const g = window.__game;
    if (g.cine.active) g.cine.skip();
    if (g.settleArrival) try { g.settleArrival(); } catch (e) { /* none */ }
    g.spawn([x, y]);
    const c = g.clock; g.setClock(c.y, c.m, c.d, hour); c.frozen = true; c.scale = 0;
    for (let i = 0; i < 10; i++) g.advance(1 / 30);
    for (let i = 0; i < 1200; i++) { await new Promise(r => requestAnimationFrame(r)); if (i > 30 && !g.hero().state().some(q => q.state === 'loading')) break; }
  }, [at[0], at[1], +(process.env.HOUR || 1290)]);
  const cases = [
    { name: 'depth of field near', fx: { focus: 3, aperture: 0.08 } },
    { name: 'depth of field far', fx: { focus: 40, aperture: 0.2 } },
    { name: 'depth of field and motion blur', fx: { focus: 8, aperture: 0.05, blur: 0.5 } },
  ];
  let worst = 0;
  for (const cs of cases) {
    // (a few frames with the effect on first, so its last camera is this one: the motion blur's)
    await p.evaluate(async fx => {
      const A = window.__game.atmos;
      if (!A.__fx0) { A.__fx0 = A.camFx; A.camFx = o => A.__fx0.call(A, A.__force || o); }
      A.__force = Object.assign({}, fx);
      for (let i = 0; i < 4; i++) await new Promise(r => requestAnimationFrame(r));
    }, cs.fx);
    const r = await p.evaluate(({ MAXD, ...fx }) => {
      const g = window.__game, A = g.atmos, R = g.renderer, gl = R.getContext(), C = A.composer || null;
      const passes = (A.passes && A.passes()) || (C && C.passes);
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const grab = () => { const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
      const scene = g.Wd.world.parent || g.Wd.world, cam = g.camera;
      const noop = { enabled: true, needsSwap: false, renderToScreen: false, render() {} };
      const draw = two => {
        const lensAt = passes.findIndex(q => q && q.material && q.merged);
        if (two) passes.splice(lensAt, 0, noop);
        A.camFx(Object.assign({}, fx));
        try { A.render(scene, cam); } finally { if (two) passes.splice(passes.indexOf(noop), 1); }
        return grab();
      };
      const diff = (a, b) => { let n = 0, m = 0, big = 0; for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); if (d) n++; if (d > m) m = d; if (d > MAXD) big++; } return { n, m, big }; };
      const one = draw(false), one2 = draw(false), two = draw(true), two2 = draw(true);
      const toUrl = px => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c2 = cv.getContext('2d'), im = c2.createImageData(W, H); for (let y = 0; y < H; y++) im.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); c2.putImageData(im, 0, 0); return cv.toDataURL('image/png'); };
      return { W, H, ctlOne: diff(one, one2), ctlTwo: diff(two, two2), ab: diff(one, two), enabled: !!(passes.find(q => q && q.uniforms && q.uniforms.uDistA) || {}).enabled, a: window.__abOut ? toUrl(one) : null, b: window.__abOut ? toUrl(two) : null };
    }, Object.assign({}, cs.fx, { MAXD }));
    if (process.env.OUT) {
      fs.mkdirSync(process.env.OUT, { recursive: true });
      const k = cs.name.replace(/\W+/g, '-');
      if (r.a) { fs.writeFileSync(path.join(process.env.OUT, `${k}-one.png`), Buffer.from(r.a.split(',')[1], 'base64')); fs.writeFileSync(path.join(process.env.OUT, `${k}-two.png`), Buffer.from(r.b.split(',')[1], 'base64')); }
    }
    const share = r.ab.big / (r.W * r.H);
    worst = Math.max(worst, share);
    console.log(`${share > SHARE ? 'DIFF' : 'same'} ${cs.name} (${r.W}x${r.H}, effects ${r.enabled ? 'on' : 'off'}): one target against two ${r.ab.n} px differ, at most ${r.ab.m}, ${r.ab.big} by more than ${MAXD} (${(share * 100).toFixed(3)}%); controls: one against one ${r.ctlOne.n} px (${r.ctlOne.m}), two against two ${r.ctlTwo.n} px (${r.ctlTwo.m})`);
  }
  for (const e of errs.slice(0, 5)) console.log(`  console: ${e}`);
  await b.close();
  process.exit(worst > SHARE || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
