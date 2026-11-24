// The Stop's held rain seen from across the crossing (issue 206: in frame 7's ending, on the owner's iPhone, a band of white
// specks over the crossing hid the two afterimages). On the walk's page at night in the rain, the Stop's air is started at
// frame 7's stop_at with its rain held, and looked at from where the owner stood to frame the two of them, about 30 m off;
// a still, and the count of the beads' points the camera draws.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/stop_beads_shot.js out.png [WxH]       DPR=3 PHONE=1 TIER=low for a phone
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const [,, out = '/tmp/stop-beads.png', size = '390x844'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +process.env.DPR || 1, hasTouch: w < 500, isMobile: w < 500 });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.stopFx', null, { timeout: 600000 });
  await startPlay(p, { asIs: true });
  const STOP = [368.7, -1000.6], EYE = [392.0, -1013.5];
  await p.evaluate(([S, E, process_scale]) => {
    const g = window.__game, c = g.clock;
    g.setClock(c.y, c.m, c.d, 20 * 60 + 20);
    if (g.governor && process_scale) { g.governor.auto = false; g.governor.scale = process_scale; } // (SCALE=: the render scale a phone's governor settles on, 0.65 on the owner's iPhone)
    if (g.weather && g.weather.set) g.weather.set('rain', { now: true });
    g.spawn(E); g.player.h = Math.atan2(S[0] - E[0], S[1] - E[1]); if (g.cam) { g.cam.yaw = g.player.h; g.cam.yawTo = null; }
  }, [STOP, EYE, +process.env.SCALE || 0]);
  await p.waitForTimeout(8000);
  await p.evaluate(S => { const g = window.__game, T = window.THREE; g.stopFx.start(new T.Vector3(S[0], g.player.z, -S[1]), { rain: true }); setInterval(() => { const q = g.player; g.stopFx.tick(0.03, 0, new T.Vector3(q.x, q.z, -q.y), false); }, 30); }, STOP); // (the walk has no story to tick it: held, as a Stop holds it)
  await p.waitForTimeout(6000);
  await p.screenshot({ path: out });
  console.log(`a still of the Stop's held rain at ${STOP} from ${EYE}: ${out}`);
  await b.close();
})();
