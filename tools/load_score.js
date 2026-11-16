// Checks the score while the page loads (web/game/music.js loop, web/game/game.js "the score while the roll loads";
// docs/SOUND.md "Before the first frame"), as a browser that gives a page no sound before it is touched:
//   - the loading screen says the score waits for a touch, and stops saying so at the first one;
//   - from then the score sounds on the music bus, through the load and on the title;
//   - the loop has no seam: the step from its end back to its start is no bigger than the steps elsewhere, and it
//     never falls silent.
// Takes a still of the loading screen waiting and sounding. Exits 1 if any of these fails or the page throws.
//   python3 -m http.server 8800 --directory web &
//   node tools/load_score.js out_dir [WxH]          (GPU=metal on a Mac; under xvfb-run -a elsewhere)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/load-score', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: args.concat('--autoplay-policy=document-user-activation-required') });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  const errors = [], fail = m => { errors.push(m); console.log('FAIL', m); };
  p.on('pageerror', e => fail(`pageerror: ${String(e).slice(0, 300)}`));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const waiting = () => p.evaluate(() => document.getElementById('g-loader').classList.contains('no-sound'));
  // the level on the music bus over a second
  const level = () => p.evaluate(async () => {
    const A = window.OEAudio, tap = window.__tap || (window.__tap = (() => { const n = A.ctx.createAnalyser(); n.fftSize = 2048; A.musicBus().connect(n); return n; })());
    const d = new Float32Array(tap.fftSize); let peak = 0;
    for (let i = 0; i < 10; i++) { await new Promise(r => setTimeout(r, 100)); tap.getFloatTimeDomainData(d); for (const v of d) peak = Math.max(peak, Math.abs(v)); }
    return peak;
  });
  await p.waitForFunction(() => document.querySelector('.roll-sound') && window.OEAudio && window.OEAudio.ctx, null, { timeout: 120000 });
  if (!(await waiting())) fail('the loading screen does not say the score waits for a touch');
  await p.screenshot({ path: `${out}/waiting-${size}.png` });
  const t0 = Date.now();
  await p.mouse.click(w / 2, h / 2);
  await p.waitForFunction(() => window.OEAudio.ctx.state === 'running', null, { timeout: 20000 }).catch(() => fail('a touch does not start the sound'));
  if (await waiting()) fail('the loading screen still asks for a touch after one');
  let first = 0;
  for (let i = 0; i < 10 && !first; i++) if (await level() > 0.004) first = (Date.now() - t0) / 1000;
  if (!first) fail('no score on the music bus within 10 s of the touch'); else console.log(`ok   the score sounds ${first.toFixed(1)} s after the touch`);
  await p.screenshot({ path: `${out}/sounding-${size}.png` });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1500);
  const onTitle = await level();
  if (!(onTitle > 0.004)) fail(`the score has stopped by the title (peak ${onTitle.toFixed(4)})`); else console.log(`ok   the score plays on under the title (peak ${onTitle.toFixed(3)})`);
  // the loop as the page takes it from the file: one turn from LEAD in, and the step from its end back to its start
  const seam = await p.evaluate(async ([url, len, lead]) => {
    const c = window.OEAudio.ctx, buf = await c.decodeAudioData(await (await fetch(url)).arrayBuffer()), x = buf.getChannelData(0), rate = buf.sampleRate;
    const a = Math.round(lead * rate), n = Math.round(len * rate), at = i => x[a + ((i % n) + n) % n];
    let step = 0, join = 0, quiet = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.abs(at(i + 1) - at(i)); if (i > 64 && i < n - 64) step = Math.max(step, d); else join = Math.max(join, d); }
    for (let i = 0; i < n; i += rate) { let s = 0; for (let j = i; j < i + rate * 2; j++) s += at(j) * at(j); quiet = Math.min(quiet, Math.sqrt(s / (rate * 2))); }
    return { has: buf.duration, step, join, quiet };
  }, ['assets/story/late/cue.mp3', 320 / 9, 0.25]).catch(e => ({ err: String(e) }));
  if (seam.err) fail(`the loop: ${seam.err}`);
  else {
    if (!(seam.has >= 320 / 9 + 0.25)) fail(`the file is ${seam.has.toFixed(2)} s, shorter than one turn from its lead`);
    if (!(seam.join <= seam.step * 0.6)) fail(`the loop clicks at its join (a step of ${seam.join.toFixed(4)} against ${seam.step.toFixed(4)} elsewhere)`);
    if (!(seam.quiet > 0.002)) fail(`the loop falls silent (${seam.quiet.toFixed(5)} rms over two seconds)`);
    console.log(`${errors.length ? '     ' : 'ok   '}the loop: ${seam.has.toFixed(2)} s decoded, join ${seam.join.toFixed(4)} against ${seam.step.toFixed(4)} elsewhere, quietest 2 s ${seam.quiet.toFixed(4)} rms`);
  }
  await b.close();
  console.log(errors.length ? `FAIL ${errors.length}` : 'PASS');
  process.exit(errors.length ? 1 : 0);
})();
