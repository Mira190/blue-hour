// Checks the score while the page loads (web/game/music.js loop, web/game/game.js "the score while the roll loads";
// docs/SOUND.md "Before the first frame"), as a browser that gives a page no sound before it is touched:
//   - the loading screen says the score waits for a touch, and stops saying so at the first one;
//   - from then the score sounds on the music bus, through the load and on the title;
//   - the loop has no seam: the step from its end back to its start is no bigger than the steps elsewhere, and it
//     never falls silent.
// Takes a still of the loading screen waiting and sounding. Exits 1 if any of these fails or the page throws.
//   python3 -m http.server 8800 --directory web &
//   node tools/load_score.js out_dir [WxH]          (GPU=metal on a Mac; under xvfb-run -a elsewhere)
// IOS=1: as an iPhone's Safari (its user agent and touch), where the page makes no AudioContext until the touch:
// the loading screen says so before there is a context, and the touch makes it, running, and starts the score.
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/load-score', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: args.concat('--autoplay-policy=document-user-activation-required') });
  const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
  const p = await b.newPage(Object.assign({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500 || !!process.env.IOS, isMobile: w < 500 || !!process.env.IOS }, process.env.IOS ? { userAgent: IOS_UA } : {}));
  const errors = [], fail = m => { errors.push(m); console.log('FAIL', m); };
  p.on('pageerror', e => fail(`pageerror: ${String(e).slice(0, 300)}`));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const waiting = () => p.evaluate(() => document.getElementById('g-loader').classList.contains('no-sound'));
  // the level on the music bus over a second
  const level = () => p.evaluate(async () => {
    const A = window.OEAudio, tap = window.__tap || (window.__tap = (() => { const n = A.ctx.createAnalyser(); n.fftSize = 2048; A.musicBus().connect(n); return n; })());
    const d = new Float32Array(tap.fftSize); let peak = 0;
    for (let i = 0; i < 10; i++) { await new Promise(r => setTimeout(r, 100)); tap.getFloatTimeDomainData(d); for (const v of d) peak = Math.max(peak, Math.abs(v)); }
    return peak;
  });
  await p.waitForFunction(() => document.querySelector('.roll-sound') && window.OEAudio && (window.OEAudio.ctx || window.OEAudio.pending), null, { timeout: 120000 });
  if (!(await waiting())) fail('the loading screen does not say the score waits for a touch');
  // where it can be read: on screen, on the lower bar, clear of the roll and the count, in the bar's own type at the
  // least (dimmed in the bar's corner of the upper one it went unread, and a new site's silent load was taken for a
  // broken one)
  await p.waitForTimeout(800); // (its fade in)
  const hint = await p.evaluate(() => {
    const box = e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; }, e = document.querySelector('.roll-sound'), cs = getComputedStyle(e);
    const bar = box(document.querySelector('.roll-bar.foot')), others = [...document.querySelectorAll('.roll-bar.foot > :not(.roll-sound)')].filter(o => o.offsetWidth).map(box);
    const r = box(e), hit = others.some(o => r.l < o.r && o.l < r.r);
    return { r, bar, hit, px: parseFloat(cs.fontSize), op: +cs.opacity, vis: cs.visibility, text: e.textContent };
  });
  if (hint.vis !== 'visible' || hint.op < 0.9 || hint.px < 9 || hint.hit || hint.r.l < 0 || hint.r.r > w || hint.r.t < hint.bar.t || hint.r.b > hint.bar.b) fail(`the touch is asked for where it is not read: ${JSON.stringify(hint)}`);
  else console.log(`ok   "${hint.text}" on the lower bar, ${hint.px} px, clear of the roll`);
  if (process.env.IOS) { const made = await p.evaluate(() => !!window.OEAudio.ctx); if (made) fail('an AudioContext was made before the touch'); else console.log('ok   no AudioContext before the touch'); }
  await p.screenshot({ path: `${out}/waiting-${size}.png` });
  const t0 = Date.now();
  await p.mouse.click(w / 2, h / 2);
  await p.waitForFunction(() => window.OEAudio.ctx && window.OEAudio.ctx.state === 'running', null, { timeout: 20000 }).catch(() => fail('a touch does not start the sound'));
  console.log(`ok   the tape: ${await p.evaluate(() => window.OEAudio.tape)}`);
  if (await waiting()) fail('the loading screen still asks for a touch after one');
  await p.waitForFunction(() => getComputedStyle(document.querySelector('.roll-sound')).visibility === 'hidden', null, { timeout: 8000 }).catch(() => fail('the ask for a touch is still on screen after one')); // (its fade, late where the load holds the main thread)
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
