// The probe that counts the sound's breaks (web/game/audio.js "the probe"; docs/SOUND.md, "What a page can see"; issue 166).
// The page's audio script alone, with ?snd=1: the context's clock is held back for a quarter of a second, three times, as
// a starved audio thread's is (WebKit's catches up afterwards: the clock is let go again), and the probe must count three
// breaks of 100 ms and more, say where, give them to telemetry (health()) and show them on the page; a clock that runs
// true counts none; and a clock that falls behind and stays (a browser that drops the sound's time) is counted once, as
// time lost, and not at every reading after it. Not checked: a real phone's audio thread.
//   python3 -m http.server 8800 --directory web &
//   NODE_PATH=$(npm root -g) node tools/snd_probe_check.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }), p = await b.newPage(), port = process.env.PORT || 8800;
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  const url = `http://localhost:${port}/__snd_probe?snd=1`;
  await p.route(url, r => r.fulfill({ contentType: 'text/html', body: `<body><script src="http://localhost:${port}/game/audio.js"></script></body>` }));
  await p.goto(url);
  await p.waitForFunction(() => window.OEAudio);
  const r = await p.evaluate(async () => {
    const A = window.OEAudio, wait = ms => new Promise(r => setTimeout(r, ms)), o = {};
    A.start(); await A.ctx.resume(); await wait(1500);
    A.health();
    await wait(1500);
    const quiet = A.health(); o.quiet = quiet.snd_lag; o.polls = quiet.snd_polls; o.fields = ['snd_polls', 'snd_lag', 'snd_lag_max', 'snd_olate', 'snd_main', 'snd_wk', 'snd_lat', 'snd_live'].filter(k => !(k in quiet));
    // the context's clock held back, then let go: a thread starved and catching up
    const c = A.ctx, proto = Object.getPrototypeOf(Object.getPrototypeOf(c)), d = Object.getOwnPropertyDescriptor(proto, 'currentTime');
    let hold = null, drop = 0;
    Object.defineProperty(c, 'currentTime', { get() { const t = d.get.call(c); return (hold !== null ? Math.min(hold, t) : t) - drop; } });
    for (let i = 0; i < 3; i++) { hold = d.get.call(c); await wait(250); hold = null; await wait(400); }
    const held = A.health(); o.held = held.snd_lag; o.heldMax = held.snd_lag_max; o.lost0 = held.snd_lost || 0;
    // the clock falls 80 ms behind and stays: the sound's time dropped, once
    drop = 0.08; await wait(2600);
    const lost = A.health(); o.lost = lost.snd_lost || 0; o.lostLag = lost.snd_lag;
    await wait(800);
    o.after = A.health().snd_lag;
    const box = document.getElementById('snd-probe'); o.box = box ? box.textContent : null;
    o.total = A.probe.tot.slice();
    return o;
  });
  console.log(JSON.stringify(r));
  const fails = [], fail = m => fails.push(m);
  if (r.fields.length) fail(`telemetry lacks ${r.fields.join(', ')}`);
  if (!(r.polls > 40)) fail(`${r.polls} readings in a second and a half: the probe is not reading every frame and timer`);
  if (r.quiet !== '0/0/0') fail(`a clock that ran true read ${r.quiet}`);
  if (!/^3\/3\/3$/.test(r.held)) fail(`three holds of 250 ms read ${r.held}, not 3/3/3`);
  if (!(r.heldMax >= 200 && r.heldMax <= 320)) fail(`the worst of them read ${r.heldMax} ms, not about 250`);
  if (r.lost0) fail(`a clock that caught up was counted as ${r.lost0} ms lost`);
  if (!(r.lost >= 60 && r.lost <= 110)) fail(`a clock 80 ms behind for good read ${r.lost} ms lost`);
  if (!/^1\/1\/0$/.test(r.lostLag)) fail(`and was counted ${r.lostLag}, not once (1/1/0)`);
  if (r.after !== '0/0/0') fail(`and went on being counted after it: ${r.after}`);
  if (!r.box || !/BREAKS\s+\d+ms\+ 4\s+25ms\+ 4\s+100ms\+ 3/.test(r.box)) fail(`the page's own panel reads: ${r.box}`);
  for (const e of errors) fails.push(`page error: ${e}`);
  for (const f of fails) console.log('FAIL', f);
  console.log(fails.length ? `FAIL the probe (${fails.length})` : `PASS the probe counts a held clock (${r.held}, worst ${r.heldMax} ms), a clock that stays behind once (${r.lost} ms lost), and nothing on a true one`);
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
