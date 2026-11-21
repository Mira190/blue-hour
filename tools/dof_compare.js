// The depth of field as one pass beside the two it was (issue 130; atmosphere.js camFx.merged): the walk at an hour and a
// weather, photo mode on (its lens blurs by depth), the world held, and the same frame drawn both ways: a still of each,
// the passes and the pixels each shades (tools/beat_count.js), and how far the two pictures differ, pixel by pixel.
// Then eight seconds and more without the effect: the full-size targets it used must be let go.
//   xvfb-run -a node tools/dof_compare.js out_dir [WxH] [HH:MM] [weather]      TIER=high|low  PHONE=1 DPR=3  FSTOP=1.4
// Exits 1 when the one pass is not a pass and a target fewer, the pictures differ by more than MAXDIFF (mean levels of
// 255, default 1.5), or the targets stay.
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const fs = require('fs');
const [,, out = '/tmp/dof', size = '1440x900', time = '19:30', weather = 'clear'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +process.env.DPR || 1, hasTouch: w < 500, isMobile: w < 500,
    ...(process.env.PHONE ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' } : {}) });
  fs.mkdirSync(out, { recursive: true });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log(`pageerror: ${String(e).slice(0, 300)}`); });
  p.on('console', m => { if (/did not link|Shader Error|WebGL error|refused/.test(m.text())) { errors.push(m.text()); console.log(`console: ${m.text().slice(0, 300)}`); } });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || (w < 500 ? 'low' : 'high'));
  await p.addInitScript(require('./gl_mem').hook);
  await p.addInitScript(require('./beat_count').hook);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(([t, wx]) => {
    const g = window.__game, [hh, mm] = t.split(':').map(Number);
    g.setClock(g.clock.y, 10, 10, hh * 60 + mm); if (g.weather) g.weather.set(wx, { now: true });
    for (let i = 0; i < 200 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); }
    if (g.governor) g.governor.auto = false;
  }, [time, weather]);
  await p.waitForTimeout(+(process.env.WARM || 30000));
  // photo mode: the lens open wide, focused on what the player looks at, so that the street behind is well out of focus
  await p.evaluate(f => { const g = window.__game; g.photoMode(true); g.photo.fstop = f; }, +process.env.FSTOP || 1.4);
  await p.waitForTimeout(6000);
  const state = () => p.evaluate(() => { const g = window.__game, c = g.atmos.composer, fx = c.passes.find(q => q.merged); return { on: !!(fx && fx.enabled), pings: c.pings, merged: !!(fx && fx.merged && fx.merged.isMaterial) }; });
  const s0 = await state();
  console.log(`photo mode: depth of field ${s0.on ? 'on' : 'OFF'}, the one pass ${s0.merged ? 'made' : 'NOT made'}`);
  await p.evaluate(() => { window.__game.hold(true); for (const e of document.querySelectorAll('#game-gl ~ *, .game-stage > *')) if (e.tagName !== 'CANVAS') e.style.visibility = 'hidden'; });
  const draw = n => p.evaluate(n => {
    const g = window.__game, B = window.__beat, c = g.atmos.composer;
    c.camFxPasses = n;
    g.atmos.render(g.world, g.camera); // (once for the targets this way needs)
    B.begin(); g.atmos.render(g.world, g.camera); const r = B.end();
    const gl = document.querySelector('#game-gl'), M = window.__memReport(0);
    return { passes: r.passes, canvases: +((r.pass_px + r.scene_px) / (gl.width * gl.height)).toFixed(2), pings: c.pings, gpu_mb: +(M.now / 1048576).toFixed(1), canvas: [gl.width, gl.height] };
  }, n);
  // (the one pass first: the second target is made by the two; and the two a second time, for what two draws of the same
  // held frame differ by themselves: the film's grain, the occlusion's history)
  const one = await draw(1); await p.screenshot({ path: `${out}/dof-one.png` });
  const two = await draw(2); await p.screenshot({ path: `${out}/dof-two.png` });
  await draw(2); await p.screenshot({ path: `${out}/dof-two-again.png` });
  console.log(`two passes: ${JSON.stringify(two)}`);
  console.log(`one pass:   ${JSON.stringify(one)}`);
  // the two pictures, pixel by pixel (the canvas alone is on the page): the mean and the largest difference of a channel
  const differ = ([a, c]) => p.evaluate(async ([a, c]) => {
    const load = s => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `data:image/png;base64,${s}`; });
    const [ia, ic] = await Promise.all([load(a), load(c)]), cv = document.createElement('canvas'); cv.width = ia.width; cv.height = ia.height;
    const x = cv.getContext('2d'); x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, cv.width, cv.height).data; x.drawImage(ic, 0, 0); const dc = x.getImageData(0, 0, cv.width, cv.height).data;
    let sum = 0, max = 0, over = 0; for (let i = 0; i < da.length; i += 4) for (let k = 0; k < 3; k++) { const d = Math.abs(da[i + k] - dc[i + k]); sum += d; if (d > max) max = d; if (d > 12) over++; }
    return { mean: +(sum / (da.length * 0.75)).toFixed(3), max, over12: +(over / (da.length * 0.75) * 100).toFixed(3) };
  }, [a, c].map(n => fs.readFileSync(`${out}/${n}.png`).toString('base64')));
  const self = await differ(['dof-two', 'dof-two-again']), diff = await differ(['dof-two', 'dof-one']);
  console.log(`the two passes drawn twice differ by: mean ${self.mean} of 255, largest ${self.max}, ${self.over12}% of the channels over 12`);
  console.log(`difference: mean ${diff.mean} of 255, largest ${diff.max}, ${diff.over12}% of the channels over 12`);
  // and without the effect: the targets let go after eight seconds
  await p.evaluate(() => { const g = window.__game; for (const e of document.querySelectorAll('#game-gl ~ *, .game-stage > *')) e.style.visibility = ''; g.hold(false); g.photoMode(false); });
  await p.waitForTimeout(3000);
  const t0 = Date.now(); let left = (await state()).pings;
  while (left > 0 && Date.now() - t0 < 60000) { await p.waitForTimeout(1000); left = (await state()).pings; }
  const M = await p.evaluate(() => +(window.__memReport(0).now / 1048576).toFixed(1));
  console.log(`without the effect: ${left} full-size targets kept after ${((Date.now() - t0) / 1000 + 3).toFixed(0)} s; GPU memory ${M} MB`);
  const max = +(process.env.MAXDIFF || 1.5), fails = [];
  if (!s0.on) fails.push('photo mode did not turn the depth of field on');
  if (!s0.merged) fails.push('the one pass was not made');
  if (!(one.passes === two.passes - 1)) fails.push(`the one pass is not a pass fewer (${one.passes} against ${two.passes})`);
  if (!(one.pings === 1)) fails.push(`the one pass keeps ${one.pings} full-size targets, not one`);
  if (diff.mean > self.mean + max) fails.push(`the pictures differ by ${diff.mean} levels on average (the same frame drawn twice by ${self.mean}; over ${max} more)`);
  if (left > 0) fails.push(`${left} full-size targets are kept after the effect`);
  if (errors.length) fails.push(`${errors.length} errors on the page`);
  for (const f of fails) console.log(`FAIL ${f}`);
  if (!fails.length) console.log('ok   the depth of field in one pass: a pass and a target fewer, the picture as it was, the target let go after');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
