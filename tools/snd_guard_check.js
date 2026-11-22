// The street's guard on a phone (web/game/audio.js "the street waits"; docs/SOUND.md, "The guard"; issue 166).
// The page's audio script alone, with ?guard=1 (a phone's guard on a desktop's browser) and ?snd=1:
//   - hold(true) suspends the context and keeps it so through a touch and the two-second wake; hold(false) brings it back;
//   - a break the probe counts while the street plays (the context's clock held back 250 ms, as a starved audio thread's
//     is) gives the street up: suspended, kept so through a touch, onGaveUp called, the device's note at 1;
//   - the Sound switch off and on asks again: running (the note stays until three minutes play without a break);
//   - two breaks of 25 ms give it up again, and a third time after asking again; with two give-ups noted the next page
//     makes no context at all (street off, as telemetry says), until the Sound switch asks again.
// Not checked: a real iPhone's audio thread, which is what the guard is for.
//   python3 -m http.server 8800 --directory web &
//   NODE_PATH=$(npm root -g) node tools/snd_guard_check.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }), p = await b.newPage(), port = process.env.PORT || 8800;
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  const url = `http://localhost:${port}/__snd_guard?guard=1&snd=1`;
  await p.route(url, r => r.fulfill({ contentType: 'text/html', body: `<body><script src="http://localhost:${port}/game/audio.js"></script></body>` }));
  await p.goto(url);
  await p.waitForFunction(() => window.OEAudio);
  const r = await p.evaluate(async () => {
    const A = window.OEAudio, wait = ms => new Promise(r => setTimeout(r, ms)), o = {}, touch = () => window.dispatchEvent(new Event('pointerup'));
    localStorage.removeItem('bh-snd-gave');
    o.guard = A.guard;
    let gave = 0; A.onGaveUp(() => { gave++; });
    A.start(); await A.ctx.resume(); await wait(1500);
    A.health();
    // held for a busy page, through a touch and the two-second wake
    A.hold(true); await wait(300); o.heldState = A.ctx.state; touch(); await wait(2300); o.heldAfterTouch = A.ctx.state;
    const hh = A.health(); o.heldTel = [hh.snd_held, hh.snd_holds];
    A.hold(false); await wait(400); o.letGo = A.ctx.state;
    await wait(1200); A.health();
    // the clock held back 250 ms: one break of 100 ms and more, and the street gives up
    const c = A.ctx, proto = Object.getPrototypeOf(Object.getPrototypeOf(c)), d = Object.getOwnPropertyDescriptor(proto, 'currentTime');
    let hold = null;
    Object.defineProperty(c, 'currentTime', { get() { const t = d.get.call(c); return hold !== null ? Math.min(hold, t) : t; } });
    const back = async ms => { hold = d.get.call(c); await wait(ms); hold = null; await wait(350); };
    await back(250); await wait(300);
    o.gave1 = A.gaveUp; o.gave1State = A.ctx.state; o.calls1 = gave; o.note1 = JSON.parse(localStorage.getItem('bh-snd-gave') || 'null');
    touch(); await wait(2300); o.gaveAfterTouch = A.ctx.state;
    o.gaveTel = A.health().snd_gave;
    // the Sound switch off and on: asked again
    A.setMuted(true); await wait(300); A.setMuted(false); await wait(500);
    o.again = [A.gaveUp, A.ctx.state, (JSON.parse(localStorage.getItem('bh-snd-gave') || 'null') || {}).n];
    await wait(1500); A.health();
    // two breaks of 25 ms within half a minute: given up again (the clock held back 60 ms twice)
    await back(60); o.afterOne = A.gaveUp; await back(60); await wait(200);
    o.gave2 = A.gaveUp; o.gave2State = A.ctx.state; o.calls2 = gave;
    // asked again, and given up a second time this page: the note counts two
    A.setMuted(true); await wait(300); A.setMuted(false); await wait(1500); A.health();
    await back(250); await wait(300);
    o.note2 = JSON.parse(localStorage.getItem('bh-snd-gave') || 'null');
    // (the note as the second give-up left it, for the next page)
    localStorage.setItem('bh-snd-gave', JSON.stringify({ n: 2, t: Date.now() }));
    return o;
  });
  // the next page on this device: no context at all, until the Sound switch asks again
  await p.reload(); await p.waitForFunction(() => window.OEAudio);
  const s = await p.evaluate(async () => {
    const A = window.OEAudio, wait = ms => new Promise(r => setTimeout(r, ms)), o = {};
    o.off = A.streetOff; A.start(); await wait(500); o.ctx = !!A.ctx; o.tel = (A.health() || {}).snd;
    const box = document.getElementById('snd-probe'); await wait(300); o.box = box ? box.textContent : '';
    A.setMuted(true); A.setMuted(false); await wait(500);
    o.again = [A.streetOff, A.ctx ? A.ctx.state : null, (JSON.parse(localStorage.getItem('bh-snd-gave') || 'null') || {}).n];
    return o;
  });
  console.log(JSON.stringify(r)); console.log(JSON.stringify(s));
  const fails = [], fail = m => fails.push(m);
  if (r.guard !== true) fail('?guard=1 does not turn the guard on');
  if (r.heldState !== 'suspended') fail(`held, the context is ${r.heldState}, not suspended`);
  if (r.heldAfterTouch !== 'suspended') fail(`held, a touch and the two-second wake left the context ${r.heldAfterTouch}`);
  if (!(r.heldTel[1] >= 1 && r.heldTel[0] >= 2)) fail(`telemetry read the hold as ${r.heldTel} (seconds, holds)`);
  if (r.letGo !== 'running') fail(`let go, the context is ${r.letGo}`);
  if (!/^\d+ ms/.test(r.gave1 || '')) fail(`a break of 250 ms did not give the street up: '${r.gave1}'`);
  if (r.gave1State !== 'suspended') fail(`given up, the context is ${r.gave1State}`);
  if (r.calls1 !== 1) fail(`onGaveUp called ${r.calls1} times for one give-up`);
  if (!(r.note1 && r.note1.n === 1)) fail(`the device's note after one give-up: ${JSON.stringify(r.note1)}`);
  if (r.gaveAfterTouch !== 'suspended') fail(`given up, a touch and the wake left the context ${r.gaveAfterTouch}`);
  if (!r.gaveTel) fail('telemetry has no snd_gave');
  if (!(r.again[0] === '' && r.again[1] === 'running' && r.again[2] === 1)) fail(`the Sound switch off and on left ${JSON.stringify(r.again)} (gave up, state, note)`);
  if (r.afterOne) fail(`one break of 60 ms gave the street up: '${r.afterOne}'`);
  if (!/of 25 ms/.test(r.gave2 || '')) fail(`two breaks of 60 ms did not give it up: '${r.gave2}'`);
  if (r.gave2State !== 'suspended' || r.calls2 !== 2) fail(`the second give-up: ${r.gave2State}, onGaveUp ${r.calls2}`);
  if (!(r.note2 && r.note2.n === 3)) fail(`three give-ups noted as ${JSON.stringify(r.note2)}`);
  if (!(s.off === true && !s.ctx && s.tel === 'street off')) fail(`with two give-ups noted the next page read off ${s.off}, a context ${s.ctx}, telemetry '${s.tel}'`);
  if (!/street off/.test(s.box)) fail(`its panel reads: ${s.box}`);
  if (!(s.again[0] === false && s.again[1] === 'running' && s.again[2] === 2)) fail(`and the Sound switch off and on left ${JSON.stringify(s.again)} (off, state, note)`);
  for (const e of errors) fails.push(`page error: ${e}`);
  for (const f of fails) console.log('FAIL', f);
  console.log(fails.length ? `FAIL the street's guard (${fails.length})` : `PASS the street's guard: held through a touch and let go, given up on a break of 100 ms or two of 25, asked again by the Sound switch, off on the next page after two give-ups`);
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
