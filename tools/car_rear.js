// (car_rear.js: tools/car_look.js's start, then the camera held behind the car)
// The player's car seen from fixed distances, its far copies on and off (issue 192, cars.js far copies): the page on a
// phone (390 x 844 at three to the point, the low tier, as tools/phone_frame.js) or a desktop (SIZE=1440x900, the high
// tier), on foot, the clock set to each hour, and for each distance the player stood that far from the car, between it
// and the Scramble, facing it, the chase camera behind; a still cropped round the car, and what the car draws.
//   JOB_WAIT=540 tools/job.sh run look -- xvfb-run -a node tools/car_look.js out/car_look
// SIZE (390x844), QUERY (&carfar=off: the whole car, to set beside), HOURS=13,18.2,21, DISTS=8,23,27,58,63,80,
// PORT (8800). Prints a line a still: hour, distance, the copy drawn (0 whole, 1, 2), draws, triangles.
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || 'out/car_look';
fs.mkdirSync(out, { recursive: true });
const [W, H] = (process.env.SIZE || '390x844').split('x').map(Number), PHONE = W < 600, PORT = process.env.PORT || 8800, Q = process.env.QUERY || '';
const HOURS = (process.env.HOURS || '13,18.2,21').split(',').map(Number), DISTS = (process.env.DISTS || '8,23,27,58,63,80').split(',').map(Number);
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage(PHONE ? { viewport: { width: W, height: H }, deviceScaleFactor: 3, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' } : { viewport: { width: W, height: H } });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || (PHONE ? 'low' : 'high'));
  await p.goto(`http://localhost:${PORT}/?walk=1${Q}#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await p.waitForFunction(() => { const l = document.getElementById('g-loader'); return !l || l.hidden; }, null, { timeout: 900000, polling: 500 });
  await require('./start_play').startPlay(p);
  for (let i = 0; i < 60 && !(await p.evaluate(() => { const t = document.getElementById('g-title'); return !t || t.hidden; })); i++) {
    await p.evaluate(() => { const b = document.getElementById('gt-play'); if (b) b.click(); }); await p.waitForTimeout(1000);
  }
  await p.evaluate(async () => {
    const g = window.__game;
    for (let t = 0; t < 10 && (!g.arriving || !g.arriving()); t += 0.25) await new Promise(r => setTimeout(r, 250));
    for (let t = 0; t < 10 && g.arriving && g.arriving(); t += 0.25) { g.settleArrival(); g.advance(0.25); await new Promise(r => requestAnimationFrame(r)); }
    const O = window.OEOnboard, t = O && O.current && O.current(); if (t) t.skip();
    if (g.cine && g.cine.active) g.cine.skip();
    for (let t = 0; t < 120 && !(g.myCar && g.myCar()); t++) await new Promise(r => setTimeout(r, 500)); // (the car parked once the cars have come)
  });
  const info = await p.evaluate(() => { const c = window.__game.myCar(); return c ? { x: c.D.st.x, y: c.D.st.y, z: c.D.st.z, build: c.C.far ? c.C.far() : null } : null; });
  console.log('car', JSON.stringify(info));
  if (!info) { await b.close(); return; }
  // behind the car with its lamps lit at night (issue: the owner's iPhone, dots in the tail lights' glow, frame 6): a held camera
  // d m behind its rear on its axis, 1.3 m up, looking at the rear; the whole car (no far copy) and the lamps on
  await p.evaluate(h => { const g = window.__game, c = g.clock; g.setClock(c.y, c.m, c.d, Math.round(h * 60)); if (g.weather) g.weather.set('clear', { now: true }); }, HOURS[0]);
  for (const d of DISTS) {
    await p.evaluate(async d => {
      const g = window.__game, c = g.myCar(), st = c.D.st, T = window.THREE;
      st.lights = true; st.brake = !!(+(new URLSearchParams(location.search).get('brake') || 0));
      const fx = Math.sin(st.h), fy = Math.cos(st.h), at = new T.Vector3(st.x, st.z + 0.75, -st.y), pos = new T.Vector3(st.x - fx * (2.3 + d), st.z + 1.3, -(st.y - fy * (2.3 + d)));
      g.cine.play(() => ({ pos, look: at }), 1e6, { label: 'film' });
      for (let i = 0; i < 40; i++) await new Promise(q => requestAnimationFrame(q));
    }, d);
    await p.screenshot({ path: `${out}/rear-d${d}-${W}x${H}.png` });
    console.log(`rear d${d}`);
  }
  await b.close();
})();
