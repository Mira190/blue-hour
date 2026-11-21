// Routes on foot ride a moving escalator only the way it runs. The gold line from SHIBUYA SKY's 46F lift lobby to the
// roof once led to the west escalator, which runs down to SKY EDGE, beside the north one that runs up (route.js: the
// network's edges and the ground search are one-way along a strip with moving_ms). Checked here, for every moving
// escalator on the map:
//   - from each lift's stop near one to every place on the roof a story frame stands the player at, the way found uses
//     no escalator against its steps;
//   - from the floor before each escalator to the floor past it, and back: never against its steps (the way back goes
//     by a stair or the escalator beside it, or there is none).
// audit(page) runs the checks in a page whose ways are built and returns { lines, bad }; tools/story_play.js calls it
// at the frame that sends the player up (frame 4 of the first episode). Run by itself:
//   cd web && python3 -m http.server 8800 &
//   xvfb-run -a node tools/escalator_route.js shibuya
async function audit(p) {
  return p.evaluate(async () => {
    const g = window.__game, nav = g.nav, ways = g.ways, G = g.G || {};
    if (!ways.ready) await ways.build();
    const MOV = nav.strips.filter(s => s.moving_ms), lines = [];
    let bad = 0;
    const end = (s, u) => { const x = s.origin[0] + s.axis[0] * u, y = s.origin[1] + s.axis[1] * u, f = nav.floorAt(x, y, (u < s.us[0] ? s.zs[0] : s.zs[s.zs.length - 1]) + 0.6); return { x, y, z: f ? f.z : (u < s.us[0] ? s.zs[0] : s.zs[s.zs.length - 1]) }; };
    // the escalators a way rides, and which way: [[name, +1 with its steps | -1 against]]
    const rides = pts => {
      const out = [];
      for (let i = 1; i < pts.length; i++) {
        if (pts[i][3]) continue;
        const [ax, ay, az] = pts[i - 1], [bx, by, bz] = pts[i], m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5));
        for (let k = 0; k < m; k++) {
          const t = (k + 0.5) / m, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
          for (const s of MOV) {
            const h = nav.stripHeight(s, x, y);
            if (h == null || Math.abs(h - z) > 0.6) continue;
            const du = (bx - ax) * s.axis[0] + (by - ay) * s.axis[1], dl = Math.hypot(bx - ax, by - ay) || 1;
            if (Math.abs(du) < 0.2 * dl) continue; // (across the steps: off them at a landing)
            const d = du > 0 ? Math.sign(s.moving_ms) : -Math.sign(s.moving_ms);
            const l = out[out.length - 1];
            if (!l || l[0] !== s.name || l[1] !== d) out.push([s.name, d]);
          }
        }
      }
      return out;
    };
    const one = (what, a, b, must) => {
      const r = ways.walk(a, b);
      if (!r) { const ok = !must; if (!ok) bad++; lines.push(`${ok ? 'ok  ' : 'FAIL'} ${what}: no way on foot${ok ? ' (none the right way: fine)' : ''}`); return; }
      const m = ways.against ? ways.against(r.pts) : 0, rd = rides(r.pts), wrong = m > 0.25 || rd.some(q => q[1] < 0);
      if (wrong) bad++;
      lines.push(`${wrong ? 'FAIL' : 'ok  '} ${what}: ${r.len.toFixed(0)} m, ${rd.length ? `rides ${rd.map(q => `${q[0]} ${q[1] > 0 ? 'with' : 'AGAINST'} its steps`).join(', ')}` : 'rides no escalator'}${m > 0 ? `, ${m.toFixed(1)} m against the steps` : ''}`);
      return r;
    };
    // the lifts' stops near an escalator, to the places a story frame stands the player at on the floor its top reaches
    const stories = (G.story && G.story.episodes) || [], stands = [];
    for (const ep of stories) (ep.frames || []).forEach((f, i) => { const st = f.task && f.task.stand; if (st && st.length > 2) stands.push({ at: st, what: `episode ${ep.no || ep.id} frame ${i + 1}` }); });
    for (const l of G.lifts || []) for (const st of l.stops) {
      const [x, y, z] = st.at;
      const near = MOV.filter(s => { const [u, v] = nav.stripUV(s, x, y); return Math.abs(v) < 12 && u > s.us[0] - 12 && u < s.us[s.us.length - 1] + 12 && Math.abs(z - s.zs[0]) < 12; });
      if (!near.length) continue;
      for (const q of stands) if (Math.hypot(q.at[0] - x, q.at[1] - y) < 120 && q.at[2] > z + 2) one(`${st.name} to ${q.what}'s place`, { x, y, z }, { x: q.at[0], y: q.at[1], z: q.at[2] }, true);
      // (and to the top of each escalator near it that goes up from its floor)
      for (const s of near) {
        const lo = s.zs[0] < s.zs[s.zs.length - 1] ? s.us[0] - 2.5 : s.us[s.us.length - 1] + 2.5, hi = lo < s.us[0] ? s.us[s.us.length - 1] + 2.5 : s.us[0] - 2.5;
        if (Math.abs(end(s, lo).z - z) < 2) one(`${st.name} to the top of ${s.name}`, { x, y, z }, end(s, hi), true);
      }
    }
    for (const s of MOV) {
      const a = end(s, s.us[0] - 2.5), b = end(s, s.us[s.us.length - 1] + 2.5);
      one(`${s.name}, the way it runs`, a, b, true);
      one(`${s.name}, back the other way`, b, a, false);
    }
    return { lines, bad, n: MOV.length };
  });
}
module.exports = { audit };

if (require.main === module) (async () => {
  const { chromium } = require('playwright');
  const [,, city = 'shibuya'] = process.argv;
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  const logs = [];
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-${city}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.ways', null, { timeout: 600000 });
  const r = await audit(p);
  console.log(`${r.n} moving escalators`);
  console.log(r.lines.join('\n'));
  if (logs.length) console.log(logs.join('\n'));
  await b.close();
  process.exit(r.bad || logs.length ? 1 : 0);
})();
