// Where SKY GATE's lift sets you down (SHIBUYA SKY 46F, the foot of the escalators to the roof: issue 99): what the chase
// camera does there, and stills of it. The player is put at the lift's top stop facing the way it lets out, at 17:31 with
// the day held; the rig's own account of the frame is printed (game.js cam.trace: the lift it took over a wall, how far it
// was pulled in, the floor and the ceiling it found), then stills: as the game hands the view over, turned to each
// side, and walking out along the way to the roof while time is held (five stills a second apart).
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   tools/job.sh run lifttop -- xvfb-run -a node tools/lift_top_shot.js out_dir [WxH]
// A width under 500 is a phone (its user agent, touch, the low tier). FREE=1: also from outside, over the corner.
// RIDE=1: the ride up from the street hall first, a still every second of it.
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const [,, out = '/tmp/lift-top', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), lean = w < 500;
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext(lean ? { viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' }
    : { viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, lean ? 'low' : 'high');
  require('fs').mkdirSync(out, { recursive: true });
  const logs = [];
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
  const shot = async name => { await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await p.screenshot({ path: `${out}/${name}.png` }); };
  const run = (s, hold) => p.evaluate(async ([s, hold]) => { const g = window.__game; for (let i = 0; i < s / 0.25; i++) { if (hold) g.frame(0); else g.advance(0.25); await new Promise(r => requestAnimationFrame(r)); } }, [s, !!hold]);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await startPlay(p);
  await p.evaluate(() => { const g = window.__game; g.advance(1); if (g.cine && g.cine.active && g.cine.skip) g.cine.skip(); g.advance(3); g.clock.min = 17 * 60 + 31; g.clock.scale = 0; });
  const lift = await p.evaluate(() => { const l = (window.__game.G.lifts || []).find(q => q.id === 'sky-gate'); return l ? { a: l.stops[0], b: l.stops[l.stops.length - 1] } : null; });
  if (!lift) { console.log('FAIL no SKY GATE lift on the map'); process.exit(1); }
  if (process.env.RIDE) {
    await p.evaluate(s => { const g = window.__game, [ax, ay, az] = s.at, [dx, dy] = s.door || s.at, n = Math.hypot(ax - dx, ay - dy) || 1; g.player.x = ax - (ax - dx) / n * 1.2; g.player.y = ay - (ay - dy) / n * 1.2; g.player.z = az; g.player.h = Math.atan2(ax - dx, ay - dy); g.player.speed = 0; g.cam.yaw = g.player.h; g.cam.pitch = 0.17; g.advance(0.5); }, lift.a);
    await p.waitForFunction(() => { const m = document.getElementById('g-prompt'), t = document.getElementById('gp-text'); return m && !m.hidden && t && /lift/i.test(t.textContent); }, null, { timeout: 300000, polling: 250 }).catch(() => {});
    await shot('ride-0');
    await p.evaluate(() => { const g = window.__game, l = g.G.lifts.find(q => q.id === 'sky-gate'); g.rideLift(l, 0, l.stops.length - 1); });
    // (the shot is moved to each still's place in it, game.js cine.seek, rather than played at a software renderer's pace)
    await run(0.2);
    let last = null;
    for (const [n, k] of [0.03, 0.1, 0.2, 0.32, 0.45, 0.55, 0.66, 0.78, 0.86, 0.93, 0.98].entries()) {
      const s = await p.evaluate(async ([k, last]) => { const g = window.__game; g.cine.seek(k); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const c = g.camera.position, T3 = window.THREE; return { k: +g.cine.k.toFixed(2), z: +g.player.z.toFixed(1), cam: [c.x, -c.z, c.y].map(v => +v.toFixed(1)), clear: last ? +g.nav.clearFraction(new T3.Vector3(last[0], last[2], -last[1]), c).toFixed(2) : 1 }; }, [k, last]);
      console.log(`ride k ${k}`, JSON.stringify(s)); last = s.cam;
      await p.screenshot({ path: `${out}/ride-${n + 1}.png` });
    }
    await p.evaluate(async () => { const g = window.__game; for (let i = 0; i < 80 && g.cine.active; i++) { g.advance(0.1); await new Promise(r => requestAnimationFrame(r)); } });
    await run(2);
  } else {
    await p.evaluate(s => { const g = window.__game, pl = g.player; [pl.x, pl.y, pl.z] = s.at; pl.vz = 0; pl.speed = 0; pl.ground = true; if (s.face) pl.h = Math.atan2(s.face[0], s.face[1]); g.cam.mode = 'chase'; g.cam.yaw = pl.h; g.cam.pitch = 0.17; g.cam.dist = 5.5; g.cam.snap = true; }, lift.b);
    await run(2); // (the stop's fine collision laid: game.js advance)
    await p.evaluate(() => { const g = window.__game; g.cam.yaw = g.player.h; g.cam.snap = g.cam.seek = true; }); // (as a ride that finds no place to step out to leaves the view: game.js rideLift)
    await run(1);
  }
  // the roof's level is fetched as the camera comes near it: wait for it, as a player's first seconds up there do
  await p.waitForFunction(() => { const g = window.__game; return !g.busy || !g.busy(); }, null, { timeout: 240000, polling: 500 }).catch(() => {});
  await run(1.5);
  const tell = async name => {
    const t = await p.evaluate(() => {
      const g = window.__game, c = g.camera.position, pl = g.player, nav = g.nav;
      g.cam.trace = {}; g.frame(0);
      const t = Object.assign({}, g.cam.trace); g.cam.trace = null;
      const r = v => (typeof v === 'number' ? +v.toFixed(2) : v);
      const o = {}; for (const k of ['jumped', 'f', 'pullWant', 'wantLift', 'floorUp', 'ceilDown', 'gz', 'floor']) o[k] = r(t[k]);
      return { at: [pl.x, pl.y, pl.z].map(r), h: r(pl.h), yaw: r(g.cam.yaw), pitch: r(g.cam.pitch), dist: r(g.cam.dist), lift: r(g.cam.lift), pull: r(g.cam.pull),
        cam: [c.x, -c.z, c.y].map(r), over: r(c.y - pl.z), off: r(Math.hypot(c.x - pl.x, -c.z - pl.y)), ceil: r(nav.ceilingAt(pl.x, pl.y, pl.z + 0.5)), ground: r(nav.terrainBelow(pl.x, pl.y, pl.z + 2)), trace: o };
    });
    console.log(name, JSON.stringify(t));
    await shot(name);
    return t;
  };
  let bad = 0;
  // TABLE=1: how far the probe gets from your head to where the camera would be, by where it is turned (rows, from
  // your facing round) and the lift it takes (columns, radians over cam.pitch), here and at AT="x,y,z;x,y,z"; then it ends
  if (process.env.TABLE) {
    const P = [lift.b.at].concat((process.env.AT || '').split(';').filter(Boolean).map(q => q.split(',').map(Number)));
    for (const at of P) {
      await p.evaluate(at => { const g = window.__game, pl = g.player; [pl.x, pl.y, pl.z] = at; pl.vz = 0; pl.ground = true; g.cam.snap = true; }, at);
      await run(1.5);
      const T = await p.evaluate(() => {
        const g = window.__game, pl = g.player, T3 = window.THREE, a = new T3.Vector3(pl.x, pl.z + 1.55, -pl.y), b = new T3.Vector3(), rows = [];
        for (let i = 0; i < 16; i++) { const yaw = pl.h + i * Math.PI / 8, r = []; for (const lift of [0, 0.15, 0.3, 0.45, 0.6, 0.8]) { const pitch = 0.25 + lift, cp = Math.cos(pitch); b.set(a.x - Math.sin(yaw) * cp * 7, a.y + Math.sin(pitch) * 7, a.z + Math.cos(yaw) * cp * 7); r.push(g.nav.clearFraction(a, b).toFixed(2)); } rows.push(`${(i * 22.5).toFixed(0).padStart(4)}  ${r.join(' ')}`); }
        return { h: pl.h, z: pl.z, tiles: g.nav.tiles, rows };
      });
      console.log(`table at ${at.join(', ')} (z now ${T.z.toFixed(2)}, facing ${T.h.toFixed(2)}, fine tiles ${T.tiles.join('/')})\n${T.rows.join('\n')}`);
      await shot(`table-${P.indexOf(at)}`);
    }
    await b.close(); process.exit(0);
  }
  const first = await tell('out');
  // (issue 99: the camera stood a metre over her head looking straight down; behind the shoulder it is beside her, not over her)
  if (first.off < 1.2 || first.over > 1.55 + first.off * 1.2) { bad++; console.log(`FAIL where the lift sets you down the camera is ${first.off} m off you and ${first.over} m over your feet: overhead`); }
  for (const [d, name] of [[-0.9, 'left'], [0.9, 'right'], [Math.PI, 'back']]) {
    await p.evaluate(d => { const g = window.__game; g.cam.yaw = g.player.h + d; }, d);
    await run(1.2, false); await tell(`turn-${name}`);
  }
  await p.evaluate(() => { const g = window.__game; g.cam.yaw = g.player.h; }); await run(1.2);
  // out along the way the frame goes: the escalator up (the story's own way, or the nearest moving strip's foot)
  const way = await p.evaluate(() => { const g = window.__game, pl = g.player, m = g.nav.strips.filter(s => s.moving_ms).map(s => ({ n: s.name, o: s.origin, d: Math.hypot(s.origin[0] - pl.x, s.origin[1] - pl.y) + Math.abs(s.zs[0] - pl.z) * 4 })).sort((a, b) => a.d - b.d)[0]; return m || null; });
  console.log('way', JSON.stringify(way));
  if (way) for (let k = 0; k < 5; k++) {
    await p.evaluate(([o, k]) => { const g = window.__game, pl = g.player, dx = o[0] - pl.x, dy = o[1] - pl.y, n = Math.hypot(dx, dy) || 1, s = Math.min(1.4, n); if (n > 0.3) { pl.x += dx / n * s; pl.y += dy / n * s; pl.h = Math.atan2(dx, dy); g.cam.yaw = pl.h; } }, [way.o, k]);
    await run(1); await tell(`walk-${k}`);
  }
  // five seconds held: nothing may move in a stopped frame
  const held = [];
  for (let k = 0; k < 5; k++) { await p.evaluate(async () => { const g = window.__game; for (let i = 0; i < 3; i++) { g.frame(0); await new Promise(r => requestAnimationFrame(r)); } }); await p.waitForTimeout(1000); const c = await p.evaluate(() => window.__game.camera.position.toArray()); held.push(c); await shot(`held-${k}`); }
  const drift = Math.max(...held.map(c => Math.hypot(c[0] - held[0][0], c[1] - held[0][1], c[2] - held[0][2])));
  console.log(`held five seconds: the camera moved ${drift.toFixed(3)} m`);
  if (drift > 0.02) { bad++; console.log('FAIL the camera moves while time is held'); }
  if (process.env.FREE) {
    await p.evaluate(() => { const g = window.__game, pl = g.player; g.cam.pitch = 1.0; g.cam.dist = 30; });
    await run(1.5); await shot('free-over');
  }
  if (logs.length) console.log(logs.join('\n'));
  await b.close();
  process.exit(bad || logs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
