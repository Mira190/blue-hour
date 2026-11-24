// How dense the traffic is where the player stands (issue 204): stand at a kerb for some minutes of the game's time,
// the game's clock at the real rate, and sample once a second
//   the nearest moving vehicle (over 1 m/s): its median and 90th percentile, and the share of samples with one
//   within 30 m
//   the vehicles within 60 and 120 m, and the traffic's cars on the roads (live) and its count (active)
//   the vehicles into the Scramble's box: each car of the traffic that comes within 22 m of its middle, counted once a
//   visit, per hour
//   xvfb-run -a node tools/traffic_near.js [minutes=5] [x,y=362,-1012]     (PHONE=1: a phone's district and tier;
//   GAME_TIME=17:57 by default; HELI=1: from the helicopter over the place, 250 m up)
const { chromium, devices } = require('playwright');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, MIN = '5', AT = '362,-1012'] = process.argv;
const [X, Y] = AT.split(',').map(Number);
const BOX = [372, -1010];
if (!process.env.GAME_TIME) process.env.GAME_TIME = '17:57';

(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const ctx = await b.newContext(process.env.PHONE ? { ...devices['iPhone 13'] } : { viewport: { width: 1100, height: 650 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 400)));
  await p.addInitScript(t => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || (process.env.PHONE ? 'low' : 'high'));
  await pinClock(p, 'shibuya');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.cars', null, { timeout: 400000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); if (g.lateReady) await g.lateReady(); });
  await startPlay(p, { asIs: true });
  const r = await p.evaluate(({ X, Y, secs, BOX, heli }) => {
    const g = window.__game, cars = g.cars;
    g.clock.scale = 1;
    for (let t = 0; g.arriving() && t < 10; t += 0.25) g.advance(0.25);
    g.hopTo(X, Y, g.player.z, 'the kerb');
    if (heli) { g.enterHeli && g.enterHeli(); }
    g.advance(60); g.frame(1 / 30);
    const near = [], n60 = [], n120 = [], live = [], inBox = new Set(); let boxN = 0;
    const t0 = performance.now();
    for (let t = 0; t < secs; t++) {
      g.advance(1); g.frame(1 / 30);
      const px = g.player.x, py = g.player.y;
      let d0 = Infinity, a = 0, c = 0;
      for (const o of cars.live) {
        if (o.line < 0) continue;
        const d = Math.hypot(o.x - px, o.y - py);
        if (o.v > 1 && d < d0) d0 = d;
        if (d < 60) a++;
        if (d < 120) c++;
      }
      near.push(d0); n60.push(a); n120.push(c); live.push(cars.live.length);
      const now = new Set();
      for (const o of cars.live) if (o.line >= 0 && Math.hypot(o.x - BOX[0], o.y - BOX[1]) < 22) { now.add(o); if (!inBox.has(o)) boxN++; }
      inBox.clear(); for (const o of now) inBox.add(o);
    }
    return { near, n60, n120, live, boxN, active: cars.active, slots: cars.slots, ring: cars.ring, ms: performance.now() - t0, hour: g.clock.min / 60 };
  }, { X, Y, secs: +MIN * 60, BOX, heli: !!process.env.HELI });
  const q = (a, f) => { const s = a.slice().sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const f0 = v => (v === Infinity ? 'none' : Math.round(v));
  console.log(`at ${X},${Y}, ${MIN} min from ${process.env.GAME_TIME} (now ${Math.floor(r.hour)}:${String(Math.round(r.hour % 1 * 60)).padStart(2, '0')}), ${process.env.PHONE ? 'phone' : 'desktop'}: active ${r.active} of ${r.slots}, ring ${r.ring ? Math.round(r.ring) : '?'} m, live ${Math.round(mean(r.live))} on average`);
  console.log(`  nearest moving: median ${f0(q(r.near, 0.5))} m, 90% within ${f0(q(r.near, 0.9))} m; one within 30 m in ${Math.round(100 * r.near.filter(d => d < 30).length / r.near.length)}% of samples`);
  console.log(`  within 60 m: ${mean(r.n60).toFixed(1)} on average; within 120 m: ${mean(r.n120).toFixed(1)}`);
  console.log(`  into the Scramble's box: ${r.boxN} in ${MIN} min = ${Math.round(r.boxN * 60 / +MIN)} an hour`);
  await b.close();
})();
