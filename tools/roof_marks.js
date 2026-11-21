// SHIBUYA SKY's roof on the walk, as the owner found it (November 2026): up the lift with Yuna's story asked ("Up to
// the roof"), and what the corner says and which speech marks stand over the deck. A mark is a promise that someone is
// there to talk to: this prints every mark drawn, whose it is, how far they are (in plan and in height), whether their
// body is drawn and in sight, and a still of each place. Then the corner's line on the roof (the errand's words and
// metres) and back on the street beside Yuna.
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   xvfb-run -a node tools/roof_marks.js out_dir [WxH] [night|blue]
// SPOTS=x,y;x,y the places on the deck to stand (default: four round the deck, and the owner's 15 m from Yuna); FACE=taro
// looks at someone from each instead of at the helicopter's pad.
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/roof-marks', size = '390x844', hour = 'night'] = process.argv;
const PORT = process.env.PORT || 8800;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  // (Yuna's story asked, Taro's told: as the owner had it when they came up)
  const st = { roof: { part: 1, met: false, done: false }, air: { part: 2, met: false, done: true } };
  await p.addInitScript(([t, st]) => { try { localStorage.setItem('oe3d-quality', 'high'); localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('oe3d-player', 'W'); localStorage.setItem('oe-walk-talk', JSON.stringify(st)); sessionStorage.setItem('oe-walk-auto', JSON.stringify({ t, w: 'clear' })); } catch (e) { /* storage blocked */ } }, [hour, st]);
  p.on('pageerror', e => console.log(`page error: ${String(e).slice(0, 200)}`));
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => document.getElementById('game-stage') && document.getElementById('game-stage').classList.contains('walk-on'), null, { timeout: 1200000, polling: 1000 });
  await p.evaluate(() => { const g = window.__game; if (g.overture && g.overture() && g.overture().skip) g.overture().skip(); });
  const marks = () => p.evaluate(() => {
    const g = window.__game, me = g.player, outp = [];
    for (const el of document.querySelectorAll('.g-walk-mark')) {
      if (+getComputedStyle(el).opacity < 0.05) continue;
      outp.push({ k: el.dataset.k || '', name: el.querySelector('span').textContent, tf: el.style.transform.slice(0, 40) });
    }
    const near = g.npcs.filter(n => Math.hypot(n.x - me.x, n.y - me.y) < 60).map(n => ({ id: n.id, d: +Math.hypot(n.x - me.x, n.y - me.y).toFixed(1), dz: +((n.z || 0) - me.z).toFixed(1), drawn: !!(n.rig && !n.rig.pending && n.rig.root.visible), want: (g.walkTalk().want(n.id) || {}).kind || '' }));
    const e = g.walkTalk().errand();
    return { me: [+me.x.toFixed(1), +me.y.toFixed(1), +me.z.toFixed(1)], marks: outp, near, errand: e ? `${e.text} · ${e.m == null ? '' : Math.round(e.m) + ' m'}` : null, corner: (document.querySelector('#g-walk-where') || {}).innerText || '' };
  });
  // up on the roof: where the helicopter stands, and round it
  const pad = await p.evaluate(() => { const s = window.__game.heli.st; return [s.x, s.y, s.z]; });
  console.log(`pad at ${pad.map(v => v.toFixed(1)).join(', ')}`);
  const spots = process.env.SPOTS ? process.env.SPOTS.split(';').map(s => s.split(',').map(Number)) : [[pad[0] + 18, pad[1] + 12], [pad[0] - 18, pad[1] + 12], [pad[0] - 18, pad[1] - 14], [pad[0] + 18, pad[1] - 14], [525, -1092]];
  let i = 0;
  for (const [x, y] of spots) {
    const r = await p.evaluate(async ([x, y, z, face]) => {
      const g = window.__game; g.spawn([x, y], z + 1); g.player.speed = 0;
      // (looking across the deck toward the pad, the camera behind)
      const s = g.heli.st, n = face && g.npcs.find(q => q.id === face), t = n || s; g.player.h = Math.atan2(t.x - x, t.y - y); g.cam.yaw = g.player.h; g.cam.pitch = 0.12;
      for (let k = 0; k < 40; k++) g.frame(0.05);
      return [g.player.x, g.player.y, g.player.z];
    }, [x, y, pad[2], process.env.FACE || '']);
    // (the roof's level fetched and drawn, and the NPCs on it: up to two minutes on a software renderer)
    await p.waitForFunction(() => { const g = window.__game, n = g.npcs.find(q => q.id === 'taro'); return !n || (n.rig && !n.rig.pending); }, null, { timeout: 240000, polling: 1000 }).catch(() => {});
    await p.evaluate(() => { const g = window.__game; for (let k = 0; k < 10; k++) g.frame(0.05); });
    await p.waitForTimeout(1500);
    const m = await marks();
    console.log(`spot ${i} at ${r.map(v => v.toFixed(1)).join(', ')}: ${JSON.stringify(m)}`);
    await p.screenshot({ path: `${out}/${phone ? 'phone' : 'desk'}-roof-${i}.png` });
    i++;
  }
  await b.close().catch(() => {});
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
