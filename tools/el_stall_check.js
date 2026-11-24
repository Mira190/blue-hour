// The probe of a phone's music element (web/game/audio.js tuneProbe; docs/SOUND.md "A phone's music"; issue 166). The
// page's audio script alone, with ?snd=1&music=el and the CPU throttled six times (as tools/opening_audio.js plays the
// opening): a tune played on an element, and
//   - the main thread held twelve times, for 0.2 to 3 s: the element plays on in the system's player, and the probe must
//     count no stall. (CI's walk opening counted one on 24 November, a single reading 414 ms behind while the thread was
//     held 7.8 s; read as the element's clock cached before the hold. It did not come again here in five plays of the
//     probe as it was: this guards the rule, it does not reproduce that reading.)
//   - the element's clock made to fall behind and stay (its rate at 0.3 for two seconds, as a player starved of its file
//     plays late, 1.4 s behind): the probe must count one stall.
// Not checked: an iPhone's player.
//   python3 -m http.server 8800 --directory web &
//   NODE_PATH=$(npm root -g) node tools/el_stall_check.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }), p = await b.newPage(), port = process.env.PORT || 8800;
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  const url = `http://localhost:${port}/__el_stall?snd=1&music=el`;
  await p.route(url, r => r.fulfill({ contentType: 'text/html', body: `<body style="height:100vh"><script src="http://localhost:${port}/game/audio.js"></script></body>` }));
  await p.goto(url);
  await p.waitForFunction(() => window.OEAudio);
  await p.mouse.click(50, 50); // (the touch that begins the elements)
  const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +(process.env.THROTTLE || 6) }); // (as tools/opening_audio.js plays the opening)
  const r = await p.evaluate(async () => {
    const A = window.OEAudio, wait = ms => new Promise(r => setTimeout(r, ms)), o = {}, rate = 24000, n = rate * 60, s = new Float32Array(n);
    for (let i = 0; i < n; i++) s[i] = 0.1 * Math.sin(i * 2 * Math.PI * 220 / rate);
    const t = A.tune(A.tuneWav([s], rate));
    await wait(3000);
    o.playing = !!(t && t.playing);
    const tot0 = A.probe.totEl;
    // the main thread held, twelve times for 0.2 to 3 s
    for (let k = 0; k < 12; k++) { const t0 = performance.now(), ms = 200 + 250 * k; while (performance.now() - t0 < ms) { /* held */ } await wait(300); } // (holds of 0.2 to 3 s)
    o.held = A.probe.totEl - tot0;
    // the element's clock behind and staying behind
    const tot1 = A.probe.totEl;
    const w0 = performance.now(), c0 = t.el.currentTime;
    t.el.playbackRate = 0.3; await wait(2000); t.el.playbackRate = 1; await wait(1000);
    o.slip = Math.round((performance.now() - w0) - (t.el.currentTime - c0) * 1000); o.rs = t.el.readyState; o.seeking = t.el.seeking;
    o.stalled = A.probe.totEl - tot1;
    o.log = A.probe.log.join(' | ');
    t.stop();
    return o;
  });
  console.log(JSON.stringify(r));
  const fails = [];
  if (!r.playing) fails.push('the tune does not play on an element');
  if (r.held) fails.push(`a main thread held for two seconds counted ${r.held} stalls of the element, which played on`);
  if (r.stalled !== 1) fails.push(`an element's clock that fell behind and stayed counted ${r.stalled} stalls, not 1`);
  for (const e of errors) fails.push(`pageerror: ${e.slice(0, 200)}`);
  await b.close();
  for (const f of fails) console.log('FAIL', f);
  console.log(fails.length ? `FAIL the element's probe (${fails.length})` : "PASS the element's probe: a held main thread counts no stall, a clock that falls behind and stays counts one");
  process.exit(fails.length ? 1 : 0);
})();
