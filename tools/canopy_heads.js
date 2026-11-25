// Heads under a stood neighbour's canopy, counted (issue 238: main's walk2 failed twice on a head 0.02 m inside a canopy,
// both of someone standing on a footway beside an open umbrella: #1446 at 393.72, -1033.9 on a phone's walk, and story3's
// frame 7 at 365.6, -979.4). The walk at the hour and the sky asked, you stood at a place, and each second of the game
// (thirty frames), the umbrellas within 12 m measured as tools/umbrella_held.js does with the world's walkers left out
// (held: two stood people), every head inside a canopy noted: how many seconds had one, and the deepest.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/canopy_heads.js [seconds=120] [x,y=393.7,-1033.9]   (TIME=21:00 SKY=rain TIER=low; PORT)
// Exits 1 when any second had a head inside a canopy.
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const { measure } = require('./umbrella_held');
const [,, secs = '120', at = '393.7,-1033.9'] = process.argv;
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'low');
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 200 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); } if (g.cine && g.cine.active) g.cine.skip(); });
  const [hh, mm] = (process.env.TIME || '21:00').split(':').map(Number), [x, y] = at.split(',').map(Number);
  await p.evaluate(async ([min, x, y, sky]) => {
    const g = window.__game, pl = g.player, nav = g.nav;
    await new Promise(ok => { const t0 = Date.now(); const f = () => (!g.hero || g.hero().levels.every(q => q.state !== 'loading') || Date.now() - t0 > 300000 ? ok() : setTimeout(f, 1000)); f(); });
    g.setClock(g.clock.y, 11, 21, min); g.clock.scale = 1; if (g.crowdAuto) g.crowdAuto(true);
    if (g.weather && sky !== 'clear') g.weather.set(sky, { now: true });
    pl.x = x + 3; pl.y = y + 3; const f = nav.floorAt(pl.x, pl.y, nav.terrain(pl.x, pl.y) + 1); pl.z = f ? f.z : nav.terrain(pl.x, pl.y);
    pl.h = Math.atan2(x - pl.x, y - pl.y); pl.vz = 0; pl.ground = true; pl.mode = 'foot'; pl.speed = 0;
  }, [hh * 60 + mm, x, y, process.env.SKY || 'rain']);
  let had = 0, deepest = 0, n = 0;
  const seen = new Map();
  const t0 = Date.now();
  for (let s = 0; s < +secs; s++) {
    await p.evaluate(() => { const g = window.__game; for (let f = 0; f < 30; f++) { g.player.speed = 0; g.frame(1 / 30); } });
    const m = await measure(p, { within: 12, held: true });
    n = Math.max(n, m.n || 0);
    const heads = (m.bad || []).filter(l => /a head/.test(l));
    if (heads.length) {
      had++;
      for (const l of heads) { const d = +(l.match(/a head ([\d.]+) m/) || [0, 0])[1]; deepest = Math.max(deepest, d); const k = (l.match(/#\d+/g) || []).join(' '); if (!seen.has(k)) seen.set(k, l); }
    }
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
  }
  console.log(`canopy_heads: ${secs} s of the game in ${((Date.now() - t0) / 1000).toFixed(0)} s, up to ${n} umbrellas within 12 m; ${had} seconds with a head inside a stood canopy, the deepest ${deepest.toFixed(2)} m`);
  for (const l of [...seen.values()].slice(0, 10)) console.log(`  ${l.slice(0, 260)}`);
  await b.close();
  process.exit(had ? 1 : 0);
})();
