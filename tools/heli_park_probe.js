// Why the helicopter at a spot is or is not an obstacle to the road (heliBlock's parts), on the walk's page.
//   [PHONE=1] xvfb-run -a node tools/heli_park_probe.js x y
// (and again with you 40 m off it, which the detail laid round you changes)
const { chromium } = require('playwright');
const [,, X = '404.4', Y = '-1003.4'] = process.argv;
(async () => {
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const ph = !!process.env.PHONE, p = await b.newPage(ph ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 640, height: 400 } });
  await p.addInitScript(() => { try { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('bh-player', 'W'); sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t: 'night', w: 'clear' })); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const s = document.getElementById('game-stage'); return window.__game && s && s.classList.contains('walk-on'); }, null, { timeout: 1200000, polling: 1000 });
  console.log(await p.evaluate(([x, y]) => {
    const g = window.__game, st = g.heli.st, z = g.nav.groundBelow(x, y, 40);
    Object.assign(st, { x, y, z, landed: true }); g.heli.place(); g.hold(true); g.advance(0.5);
    const r = [];
    for (const rr of [0.3, 2, 6.1]) r.push(rr + ':' + g.roadsNow.depth(x, y, z, rr).toFixed(2));
    const one = () => ({ z: st.z, g0: g.nav.groundBelow(x, y, st.z + 0.5), depth: g.roadsNow.depth(x, y, g.nav.groundBelow(x, y, st.z + 0.5), 6.1).toFixed(2), block: !!g.heliBlock(), visible: g.heli.group.visible });
    const near = one(); g.player.x = x + 40; g.player.y = y; g.advance(2); const far = one();
    return JSON.stringify({ z, depth: r, near, far, district: !!g.D && !!g.D.district });
  }, [+X, +Y]));
  await b.close();
})();
