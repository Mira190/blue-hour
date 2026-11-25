// Through a rail on foot (issue 157: on the owner's iPhone the player and the guide stood with a white guard rail through
// the waist, at frame 5's foot of Scramble Square and at frame 6's kerb under the station's deck). The rails a hero level
// draws (tools/rails_drawn.js: its metal_guard and fence meshes, read from the triangles drawn) are each met head on by
//   - you: put 0.9 m off the rail on one side, the way across faced, and W held for three seconds of the game (walkStep as
//     a player walks it, every slide and push of it);
//   - the guide: his step as game.js gives it to him (nav.slide, then off the posts at his reach, onto ground nav.walk
//     allows), the same way across;
//   - the crowd: a minute of the world at the level, every one of the crowd drawn within RANGE m read each frame, and one
//     whose middle is within 0.12 m of a rail's point at a body's height counted.
// Where both sides of a rail are ground a walker may stand on at one level (a rail at a drop or a step is not crossed
// here), one that ends on the far side, or with its middle nearer the rail than BODY (0.2 m), fails.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/rail_walk.js [levels=scramble,miyamasu,scramblesq] [WxH=1440x900]   (TIER=low PHONE=1 with 390x844:
//   a phone's page; EVERY=n: every n-th metre of rail; CROWD=0: no crowd minute; PORT)
// Exits 1 on a body through a rail.
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const { railsInPage } = require('./rails_drawn');
const [,, which = 'scramble,miyamasu,scramblesq', size = '1440x900'] = process.argv;
const EVERY = +process.env.EVERY || 2, BODY = 0.2, CROWD_S = process.env.CROWD === '0' ? 0 : +(process.env.CROWD || 40);
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone,
    ...(process.env.PHONE ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' } : {}) });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 200 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); } if (g.cine && g.cine.active) g.cine.skip(); });
  await p.evaluate(railsInPage);
  let fails = 0;
  // STILLS=dir AT='x,y;x,y': at each place, you walked into the rail nearest it from AT's side for two seconds, and a
  // still from behind you (the place as a player meets it); nothing counted
  if (process.env.STILLS) {
    require('fs').mkdirSync(process.env.STILLS, { recursive: true });
    for (const [k, at] of (process.env.AT || '').split(';').filter(Boolean).entries()) {
      const [ax, ay] = at.split(',').map(Number);
      const id = await p.evaluate(async ([ax, ay]) => {
        const g = window.__game, H = g.hero(), L = H.levels.find(q => Math.hypot(q.h.at[0] - ax, q.h.at[1] - ay) < q.h.r && (q.h.z == null || q.h.z < 5)) || H.levels[0], pl = g.player;
        const f = g.nav.floorAt(ax, ay, g.nav.terrain(ax, ay) + 1); pl.x = ax; pl.y = ay; pl.z = f ? f.z : g.nav.terrain(ax, ay); pl.vz = 0; pl.ground = true; pl.mode = 'foot'; pl.speed = 0;
        const t0 = Date.now(); while (Date.now() - t0 < 300000 && !(L.root && L.root.visible)) { g.frame(1 / 30); await new Promise(r => setTimeout(r, 200)); }
        window.__rails.levels();
        let best = null, bd = 9; for (const l of window.__rails.cells()) for (let i = 0; i < l.length; i += 4) if (l[i + 3]) { const d = Math.hypot(l[i] - ax, l[i + 1] - ay); if (d < bd) { bd = d; best = [l[i], l[i + 1]]; } }
        if (!best) return null;
        pl.x = ax; pl.y = ay; pl.h = Math.atan2(best[0] - ax, best[1] - ay); pl.speed = 0;
        Object.assign(g.cam, { mode: 'chase', yaw: pl.h, yawTo: null, pitchTo: null, distTo: 0, tilt: 0, snap: true, lastInput: -10, dist: 3.2, pitch: 0.12 });
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
        for (let i = 0; i < 60; i++) { g.cam.yaw = pl.h = Math.atan2(best[0] - ax, best[1] - ay); g.frame(1 / 30); }
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
        for (let i = 0; i < 10; i++) g.frame(1 / 30);
        return [L.h.id, +pl.x.toFixed(2), +pl.y.toFixed(2), +bd.toFixed(2)];
      }, [ax, ay]);
      await p.evaluate(() => new Promise(r => { let k = 0; const f = () => (++k >= 6 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
      await p.screenshot({ path: `${process.env.STILLS}/${phone ? 'phone' : 'desk'}-rail-${k + 1}.png`, timeout: 120000 });
      console.log(`still ${k + 1} at ${at}: ${JSON.stringify(id)}`);
    }
    await b.close(); return;
  }
  for (const id of which.split(',')) {
    // (to the level, until it is in and shown)
    const there = await p.evaluate(async id => {
      const g = window.__game, H = g.hero(), L = H && H.levels.find(q => q.h.id === id);
      if (!L) return `no level ${id}`;
      const pl = g.player, [x, y] = L.h.at, f = g.nav.floorAt(x, y, (L.h.z ?? g.nav.terrain(x, y)) + 1);
      pl.x = x; pl.y = y; pl.z = f ? f.z : g.nav.terrain(x, y); pl.vz = 0; pl.ground = true; pl.mode = 'foot'; pl.speed = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < 300000 && !(L.root && L.root.visible)) { g.frame(1 / 30); await new Promise(r => setTimeout(r, 200)); }
      return L.root && L.root.visible ? null : `level ${id} never shown (${L.state})`;
    }, id);
    if (there) { console.log(there); fails++; continue; }
    const r = await p.evaluate(async ([id, EVERY, BODY]) => {
      const g = window.__game, nav = g.nav, pl = g.player, cam = g.cam, Rl = window.__rails, L = g.hero().levels.find(q => q.h.id === id);
      Rl.levels();
      const cells = Rl.cells(), all = [];
      for (const l of cells) for (let k = 0; k < l.length; k += 4) if (l[k + 3]) all.push([l[k], l[k + 1], l[k + 2]]);
      const near = (x, y, z, r) => { let best = Infinity; for (const q of all) { if (Math.abs(q[0] - x) > r || Math.abs(q[1] - y) > r || q[2] < z + 0.1 || q[2] > z + 1.4) continue; best = Math.min(best, Math.hypot(q[0] - x, q[1] - y)); } return best; };
      const inLevel = (x, y) => Math.hypot(x - L.h.at[0], y - L.h.at[1]) < L.h.r;
      const key = (x, y) => `${Math.floor(x)},${Math.floor(y)}`, tried = new Set(), out = { tried: 0, skipped: 0, you: [], guide: [] };
      const press = on => { for (const ty of [on ? 'keydown' : 'keyup']) window.dispatchEvent(new KeyboardEvent(ty, { code: 'KeyW', key: 'w', bubbles: true })); };
      let m = 0;
      for (const l of cells) {
        if (!l[3]) continue;
        const [px, py, pz] = l; if (!inLevel(px, py) || tried.has(key(px, py))) continue; tried.add(key(px, py));
        if (m++ % EVERY) continue;
        // (the rail's way here: the points of rails within 1 m, their main axis)
        let sx = 0, sy = 0, n = 0; const P = all.filter(q => Math.abs(q[0] - px) < 1 && Math.abs(q[1] - py) < 1 && Math.abs(q[2] - pz) < 1);
        for (const q of P) { sx += q[0]; sy += q[1]; n++; }
        if (n < 6) { out.skipped++; continue; }
        const cx = sx / n, cy = sy / n; let a = 0, bb = 0, c = 0;
        for (const q of P) { const dx = q[0] - cx, dy = q[1] - cy; a += dx * dx; bb += dx * dy; c += dy * dy; }
        const th = 0.5 * Math.atan2(2 * bb, a - c), ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux;
        const l1 = (a + c) / 2 + Math.sqrt(((a - c) / 2) ** 2 + bb * bb), l2 = (a + c) / 2 - Math.sqrt(((a - c) / 2) ** 2 + bb * bb);
        if (l2 > 0.05 * l1) { out.skipped++; continue; } // (a corner or a post: not a line to cross)
        // (both sides ground at one level, a walker may stand on each, and nothing else drawn between them)
        const side = s => { const x = cx + nx * 0.9 * s, y = cy + ny * 0.9 * s, f = nav.floorAt(x, y, pz + 0.5); const z = f ? f.z : nav.terrain(x, y); return { x, y, z, ok: nav.walk(x, y, z, true).ok && pz - z > 0.15 && pz - z < 1.3 }; };
        const A = side(1), B = side(-1);
        if (!A.ok || !B.ok || Math.abs(A.z - B.z) > 0.25) { out.skipped++; continue; }
        out.tried++;
        const sd = (x, y) => (x - cx) * nx + (y - cy) * ny;
        for (const [S, E, s0] of [[A, B, 1], [B, A, -1]]) {
          // you: W held, facing across
          pl.x = S.x; pl.y = S.y; pl.z = S.z; pl.vz = 0; pl.ground = true; pl.speed = 0; pl.h = Math.atan2(E.x - S.x, E.y - S.y);
          Object.assign(cam, { yaw: pl.h, yawTo: null, snap: true });
          press(true);
          // (through: a frame's step from this side to the other within 1 m along of here, where the rail is; one slid
          // along it and round the end of its run went round it)
          let through = false, lx = pl.x, ly = pl.y, yd = Infinity;
          for (let i = 0; i < 90; i++) {
            cam.yaw = Math.atan2(E.x - S.x, E.y - S.y); g.frame(1 / 30);
            const a0 = sd(lx, ly) * s0, a1 = sd(pl.x, pl.y) * s0;
            if (a0 >= 0 && a1 < 0) { const t = a0 / (a0 - a1), ax = lx + (pl.x - lx) * t, ay = ly + (pl.y - ly) * t; if (Math.abs((ax - cx) * ux + (ay - cy) * uy) < 1 && near(ax, ay, pl.z, 0.5) < 0.3) through = true; } // (and a rail drawn there: not a gap between two runs)
            if (Math.abs((pl.x - cx) * ux + (pl.y - cy) * uy) < 1) yd = Math.min(yd, near(pl.x, pl.y, pl.z, 1));
            lx = pl.x; ly = pl.y;
          }
          press(false); for (let i = 0; i < 6; i++) g.frame(1 / 30);
          const ys = through ? -1 : 1;
          if (ys < 0 || yd < BODY) out.you.push({ at: [+cx.toFixed(1), +cy.toFixed(1)], end: [+pl.x.toFixed(2), +pl.y.toFixed(2)], across: ys < 0, d: +yd.toFixed(2) });
          // the guide: his step, 0.05 m at a time for 1.8 m
          let x = S.x, y = S.y; const z = S.z, dx = (E.x - S.x) / 36, dy = (E.y - S.y) / 36, reach = 0.7;
          for (let i = 0; i < 36; i++) {
            const mm = nav.slide(x, y, z, dx, dy), o = nav.posts.pushOut(mm.x, mm.y, reach, z);
            if (nav.walk(o.x, o.y, z, true).ok) { x = o.x; y = o.y; }
          }
          const gs = sd(x, y) * s0, gd = near(x, y, z, 1);
          if (gs < 0 || gd < BODY) out.guide.push({ at: [+cx.toFixed(1), +cy.toFixed(1)], end: [+x.toFixed(2), +y.toFixed(2)], across: gs < 0, d: +gd.toFixed(2) });
        }
      }
      out.points = all.length; out.boxes = L.h.fenceBoxes;
      window.__railAll = all;
      return out;
    }, [id, EVERY, BODY]);
    console.log(`${id}: ${r.points} rail points, ${r.boxes} boxes solid; ${r.tried} places crossed both ways (${r.skipped} not: a corner, a post, a drop); you through ${r.you.length}, the guide through ${r.guide.length}`);
    for (const f of r.you.slice(0, 8)) console.log(`FAIL you ${JSON.stringify(f)}`);
    for (const f of r.guide.slice(0, 8)) console.log(`FAIL guide ${JSON.stringify(f)}`);
    fails += r.you.length + r.guide.length;
    if (!CROWD_S) continue;
    // the crowd: a while of the world at the level, every frame read
    const c = await p.evaluate(async ([id, S]) => {
      const g = window.__game, all = window.__railAll, L = g.hero().levels.find(q => q.h.id === id), pl = g.player, seen = new Map();
      const [x, y] = L.h.at, f = g.nav.floorAt(x, y, (L.h.z ?? g.nav.terrain(x, y)) + 1); pl.x = x; pl.y = y; pl.z = f ? f.z : g.nav.terrain(x, y);
      if (g.crowdAuto) g.crowdAuto(true);
      const grid = new Map(); for (const q of all) { const k = `${Math.floor(q[0])},${Math.floor(q[1])}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(q); }
      for (let t = 0; t < S * 30; t++) {
        g.player.speed = 0; g.frame(1 / 30);
        if (t % 3) continue;
        const P = g.crowd.P, n = Math.min(g.crowd.active, P.length);
        for (let i = 0; i < n; i++) {
          const q = P[i], qx = q.rx ?? q.x, qy = q.ry ?? q.y, qz = q.rz ?? q.z ?? 0;
          if (!Number.isFinite(qx) || Math.hypot(qx - x, qy - y) > L.h.r) continue;
          for (let a = -1; a <= 1; a++) for (let bb = -1; bb <= 1; bb++) for (const r of grid.get(`${Math.floor(qx) + a},${Math.floor(qy) + bb}`) || []) {
            if (r[2] < qz + 0.1 || r[2] > qz + 1.4 || Math.hypot(r[0] - qx, r[1] - qy) > 0.12) continue;
            const s = seen.get(i) || { i, at: [+qx.toFixed(1), +qy.toFixed(1)], n: 0, state: q.state }; s.n++; seen.set(i, s);
          }
        }
        if (t % 90 === 0) await new Promise(r => setTimeout(r, 0));
      }
      return [...seen.values()];
    }, [id, CROWD_S]);
    const long = c.filter(s => s.n > 3);
    console.log(`${id}: the crowd, ${CROWD_S} s: ${c.length} of them at a rail's point, ${long.length} for more than three reads`);
    for (const s of long.slice(0, 8)) console.log(`FAIL crowd ${JSON.stringify(s)}`);
    fails += long.length;
  }
  await b.close();
  process.exit(fails ? 1 : 0);
})();
