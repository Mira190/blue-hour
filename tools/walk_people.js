// Stills of the walk's people (web/game/walktalk.js; game.json walk), to look at each as a player meets them: set out on
// the walk at an hour and under a sky, wait for each to be drawn (a character's pictures go to the GPU a frame at a time,
// minutes on a software renderer), then for each a still from about twelve metres with the speech mark over them and one
// of their talk as a player sees it (E beside them: the conversation's camera on its first line). Prints where each stands and what is under their feet.
//   cd web && python3 -m http.server 8800 &
//   xvfb-run -a node tools/walk_people.js out_dir [WxH] [night|blue] [clear|rain]
// WHO=mei,riko picks some of them.
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/walk-people', size = '1440x900', hour = 'night', sky = 'clear'] = process.argv;
const PORT = process.env.PORT || 8800;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  await p.addInitScript(([t, s]) => { try { localStorage.setItem('bh-quality', 'high'); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('bh-player', 'W'); localStorage.removeItem('bh-walk-talk'); sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t, w: s })); } catch (e) { /* storage blocked */ } }, [hour, sky]);
  p.on('pageerror', e => console.log(`page error: ${String(e).slice(0, 200)}`));
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => document.getElementById('game-stage') && document.getElementById('game-stage').classList.contains('walk-on'), null, { timeout: 1200000, polling: 1000 });
  const ids = await p.evaluate(() => { const g = window.__game, t = g.walkTalk(); const s = new Set(); for (const q of t.people) { s.add(q.npc); for (const x of q.parts) if (x.npc) s.add(x.npc); } return [...s]; });
  const who = process.env.WHO ? process.env.WHO.split(',') : ids;
  for (const id of who) {
    // (to them, and wait until they are drawn)
    await p.evaluate(id => { const g = window.__game, n = g.npcs.find(q => q.id === id); if (n) g.spawn([n.x + 8, n.y - 8]); }, id);
    const ok = await p.waitForFunction(id => { const n = window.__game.npcs.find(q => q.id === id); return n && !n.rig.pending; }, id, { timeout: 600000, polling: 1000 }).then(() => true, () => false);
    if (!ok) { console.log(`${id}: not drawn in ten minutes`); continue; }
    for (const [name, dist, pitch] of [['far', 12, 0.3]]) {
      const at = await p.evaluate(([id, dist, pitch]) => {
        const g = window.__game, n = g.npcs.find(q => q.id === id), a = n.h; // (in front of them, as they face)
        const x = n.x + Math.sin(a) * dist, y = n.y + Math.cos(a) * dist;
        g.spawn([x, y]); g.player.h = Math.atan2(n.x - g.player.x, n.y - g.player.y);
        g.cam.yaw = g.player.h; g.cam.pitch = pitch; g.cam.dist = dist < 5 ? 2.6 : 6;
        for (let i = 0; i < 12; i++) g.frame(0.05);
        return { at: [+n.x.toFixed(1), +n.y.toFixed(1), +n.z.toFixed(2)], floor: g.nav.floorAt(n.x, n.y, n.z + 1) ? g.nav.floorAt(n.x, n.y, n.z + 1).kind || 'floor' : 'ground', road: !!(g.roads && g.roads.place && g.roads.place(n.x, n.y, 1.5, 1, n.z)) };
      }, [id, dist, pitch]);
      await p.waitForTimeout(2500);
      await p.screenshot({ path: `${out}/${phone ? 'phone' : 'desk'}-${id}-${name}.png` });
      if (name === 'far') console.log(`${id}: at ${JSON.stringify(at.at)} on ${at.floor}${at.road ? ', in a road' : ''}`);
    }
    // close to, as a player sees them: E beside them, and the talk's own camera (talkcam.js) on its first line
    const talked = await p.evaluate(id => { const g = window.__game, n = g.npcs.find(q => q.id === id), a = n.h; g.spawn([n.x + Math.sin(a) * 1.6, n.y + Math.cos(a) * 1.6]); g.player.h = Math.atan2(n.x - g.player.x, n.y - g.player.y); g.advance(0.3); return g.walkTalk().talk(n); }, id);
    if (talked) {
      await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 60; i++) g.frame(0.05); });
      await p.waitForTimeout(3000);
      await p.screenshot({ path: `${out}/${phone ? 'phone' : 'desk'}-${id}-talk.png` });
      await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 && g.dlg.open; i++) g.dlg.next(false); });
    } else console.log(`${id}: nothing to say`);
  }
  await p.evaluate(() => window.__game.walkTalk().reset()); // (this browser's walk as it was: nobody's story moved on by the stills)
  await b.close().catch(() => {});
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
