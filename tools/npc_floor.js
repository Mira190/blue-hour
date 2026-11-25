// Does every one of the map's people stand on the floor that is drawn (issue 241: the walk's woman, turned to the screens as
// control was handed over, was put on the bare terrain under the paving and stood in the road with only her head over it)?
// The walk (?walk=1) played as a player starts it, then stepped headless a thirtieth of a second at a time for `seconds`;
// each frame, every NPC shown within 60 m of you is set against the walk's floor where it stands (nav.floorAt from 1.5 m
// over its feet). Prints the worst and exits 1 if anyone stood more than 0.15 m off it.
//   xvfb-run -a node tools/npc_floor.js [seconds, 40]       (PORT=)
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, secs = '40'] = process.argv;
(async () => {
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  await pinClock(p, 'shibuya');
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 400000 });
  await startPlay(p);
  const out = await p.evaluate(secs => {
    window.requestAnimationFrame = () => 0;
    const g = window.__game, me = g.player, dt = 1 / 30, worst = new Map();
    for (let f = 0; f < secs * 30; f++) {
      g.advance(dt);
      for (const n of g.npcs) {
        if (!n.rig || !n.rig.root || !n.rig.root.visible || n.away || Math.hypot(n.x - me.x, n.y - me.y) > 60) continue;
        const fl = g.nav.floorAt(n.x, n.y, n.z + 1.5); if (!fl) continue;
        const off = n.z - fl.z, w = worst.get(n.id);
        if (!w || Math.abs(off) > Math.abs(w.off)) worst.set(n.id, { id: n.id, off: +off.toFixed(2), t: +(f * dt).toFixed(1), x: +n.x.toFixed(1), y: +n.y.toFixed(1), kind: fl.kind });
      }
      // (and the crowd: each of its people within 60 m, where it is drawn)
      for (let i = 0; i < g.crowd.active; i++) {
        const q = g.crowd.P[i]; if (!(q.line >= 0 || q.pz || q.reg)) continue;
        const x = q.rx ?? q.x, y = q.ry ?? q.y, z = q.rz ?? q.z ?? 0; if (Math.hypot(x - me.x, y - me.y) > 60) continue;
        const fl = g.nav.floorAt(x, y, z + 1.5), t = g.nav.terrain(x, y); if (!fl) continue;
        const off = Math.abs(z - fl.z) > 0.15 ? z - fl.z : z < t - 0.5 ? z - t : 0, id = 'crowd ' + i + (q.reg ? ' (a routine)' : q.pz ? ' (a crossing)' : ''), w = worst.get(id);
        if (Math.abs(off) > 0.15 && (!w || Math.abs(off) > Math.abs(w.off))) worst.set(id, { id, off: +off.toFixed(2), t: +(f * dt).toFixed(1), x: +x.toFixed(1), y: +y.toFixed(1), kind: fl.kind, state: q.state, line: q.line, terrain: +t.toFixed(2) });
      }
    }
    return [...worst.values()].sort((a, c) => Math.abs(c.off) - Math.abs(a.off));
  }, +secs);
  const bad = out.filter(w => Math.abs(w.off) > 0.15);
  console.log(`over ${secs} s, ${out.length} of the map's people shown near you; ${bad.length} off their floor by more than 0.15 m${bad.length ? ': ' + JSON.stringify(bad.slice(0, 6)) : ''}; the worst ${out[0] ? JSON.stringify(out[0]) : '-'}`);
  if (bad.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
