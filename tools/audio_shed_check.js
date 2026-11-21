// What the sound gives up before a click (docs/SOUND.md, "Giving up sound before a click"). Played as a phone's page
// (touch, the deck, the hybrid reverb): the street's voices are capped; three steps of the output's clock within twenty
// seconds (a made-up output clock, as audio_graph_check.js does) take the level to 1, which lets go of the room's reverb
// (place() builds no convolver); level 2 builds no crowd, no screens' song and no cicadas; the dialogue's beeps are never
// given up; and ninety seconds without a step bring the room back. Not checked: a real phone's audio thread.
//   python3 -m http.server 8800 --directory web &
//   NODE_PATH=$(npm root -g) node tools/audio_shed_check.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }), p = await b.newPage(), port = process.env.PORT || 8800;
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  const init = () => {
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
    const n = window.__made = { conv: 0, osc: 0 }, C = BaseAudioContext.prototype, cc = C.createConvolver, co = C.createOscillator;
    C.createConvolver = function (...a) { n.conv++; return cc.apply(this, a); };
    C.createOscillator = function (...a) { n.osc++; return co.apply(this, a); };
    const real = performance.now.bind(performance); window.__skew = 0; performance.now = () => real() + window.__skew;
  };
  await p.setContent(`<script>(${init})()</script><script src="http://localhost:${port}/game/audio.js"></script>`);
  await p.waitForFunction(() => window.OEAudio);
  const r = await p.evaluate(async () => {
    const A = window.OEAudio, M = window.__made, wait = ms => new Promise(r => setTimeout(r, ms)), o = {};
    A.start(); await A.ctx.resume(); await wait(300);
    A.health(); o.level0 = A.shed;
    // a crowd of footsteps at once: the street's voices are capped at 28 at level 0
    for (let i = 0; i < 60; i++) A.step();
    o.drop = A.health().snd_drop || 0;
    // dialogue's beeps are never dropped, whatever the street holds
    for (let i = 0; i < 40; i++) A.step();
    const osc0 = M.osc; A.beep(440); o.beepMade = M.osc - osc0;
    // the output's clock steps by 3 ms at every reading, as a crackling phone's does
    const real = A.ctx.getOutputTimestamp.bind(A.ctx); let k = 0;
    A.ctx.getOutputTimestamp = () => { const t = real(); k++; return { contextTime: t.contextTime - 0.003 * k, performanceTime: t.performanceTime }; };
    await wait(1800);
    A.ctx.getOutputTimestamp = real;
    o.afterSteps = A.shed;
    const c0 = M.conv; A.place('inside'); await wait(100); o.convWhileShed = M.conv - c0;
    A.shedTo(2); const s0 = M.osc; A.murmur(1); A.screens(1); A.cicadas(1); A.penguin(1); A.gull(1); await wait(100); o.bedsMadeAt2 = M.osc - s0;
    A.shedTo(1);
    // ninety seconds without a step: the room comes back
    window.__skew = 100000; await wait(400);
    o.afterQuiet = A.shed; o.convBack = M.conv - c0;
    const h = A.health(); o.snd_shed = h.snd_shed; o.dev = h.snd_dev;
    return o;
  });
  console.log(JSON.stringify(r));
  const fails = [], fail = m => fails.push(m);
  if (r.level0 !== 0) fail(`a quiet start is at level ${r.level0}, not 0`);
  if (r.drop < 30) fail(`60 footsteps at once dropped ${r.drop}, not at least 32 (28 voices)`);
  if (r.beepMade < 1) fail('a dialogue beep was dropped with the street full');
  if (r.afterSteps !== 1) fail(`three steps of the output's clock took the level to ${r.afterSteps}, not 1`);
  if (r.convWhileShed !== 0) fail(`${r.convWhileShed} convolvers built for a room while the reverb was given up`);
  if (r.bedsMadeAt2 !== 0) fail(`${r.bedsMadeAt2} oscillators built for the crowd, the screens, the cicadas or the animals at level 2`);
  if (r.afterQuiet !== 0) fail(`ninety seconds without a click left the level at ${r.afterQuiet}, not 0`);
  if (!(r.convBack > 0)) fail('the room did not come back at level 0');
  if (!(r.snd_shed >= 1)) fail(`telemetry says the most shed was ${r.snd_shed}, not 1 or more`);
  if (!/^touch c\d+ s\d+x/.test(r.dev || '')) fail(`snd_dev reads "${r.dev}"`);
  for (const e of errors) fails.push(`page error: ${e}`);
  for (const f of fails) console.log('FAIL', f);
  console.log(fails.length ? `FAIL ${fails.length}` : 'PASS');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
