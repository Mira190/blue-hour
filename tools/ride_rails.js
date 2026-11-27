// The cars that come for you against the rails as drawn (issue 208: the car that came to pick you up drove through a
// railing). From kerbs round the Scramble, Hachiko Square, the station's east side and Miyamasu (frame 5's and frame 6's
// places), a ride is ordered as the phone orders one (the walk's, and the story's frame 6 sends yours the same way:
// rides.js orderRide) and stepped a game frame at a time (advance(1/30)) until it has pulled in, with its box (less 5 cm)
// held against the guard rails, bollards and posts the hero levels draw on every step (tools/rails_drawn.js); and at its
// stop, the line from its kerb-side door 2.2 m out over the pavement must cross none of them: a car stops at a kerb with
// nothing between it and you.
//   PORT=8800 xvfb-run -a node tools/ride_rails.js              (PHONE=1: as a phone; HAIL=1: a taxi hailed, rides.js hail)
// Exits 1 when a ride meets a rail or stops behind one, 2 when the page fails.
const { open } = require('./cam_jumps');
const { railsInPage } = require('./rails_drawn');

// where you stand to order it: on the pavement, round the places the story and the walk take you
const SPOTS = process.env.AT ? JSON.parse(process.env.AT) : [[498, -1046], [503.2, -1040.6], [494, -1012], [520, -1030], [372.5, -1042.5], [356, -1030], [385, -1020], [395, -990], [345, -985], [360, -960], [408, -1052], [452, -1018]];

if (require.main === module) (async () => {
  const { b, p } = await open('shibuya', { width: 800, height: 500 });
  await p.evaluate(railsInPage);
  let bad = 0;
  const blind = await p.evaluate(() => window.__rails.selfTest());
  if (blind) { console.log(`the rail check is blind: ${blind}`); bad++; }
  for (const [x, y] of SPOTS.slice(0, +(process.env.SPOTS || SPOTS.length))) {
    const r = await p.evaluate(async ([x, y, hail]) => {
      const g = window.__game, R = window.__rails, st0 = g.nav.stand(x, y, g.nav.terrain(x, y) + 1.5, { rMax: 3 });
      if (!st0) return { at: [x, y], skip: 'nowhere to stand' };
      if (g.ride()) { g.cancelRide(); g.advance(1); }
      g.player.x = st0.x; g.player.y = st0.y; g.player.z = st0.z; g.player.mode = 'foot';
      g.advance(1);
      for (let i = 0; i < 60; i++) { R.levels(); g.advance(0.1); await new Promise(r => setTimeout(r, 100)); if (g.hero().state().every(L => L.state !== 'loading')) break; }
      R.levels();
      if (hail) g.hail(); else g.orderRide({ id: 'test', name: 'Hachiko', at: [372.5, -1042.5] });
      const o = g.ride();
      if (!o) return { at: [x, y], skip: 'no ride came' };
      const hits = [], out = { at: [+st0.x.toFixed(1), +st0.y.toFixed(1)], pickup: [+o.pickup.x.toFixed(1), +o.pickup.y.toFixed(1)] };
      let t = 0;
      for (; t < 150 && g.ride() === o && o.phase === 'coming'; t += 1 / 30) {
        g.advance(1 / 30);
        const c = o.drv.st, h = R.inBox(c.x, c.y, c.z, c.h, o.C.half - 0.05, o.C.hw - 0.05);
        if (h && hits.length < 6) hits.push({ t: +t.toFixed(1), toEnd: +(c.end - c.s).toFixed(1), car: [+c.x.toFixed(2), +c.y.toFixed(2), +c.h.toFixed(2)], v: +c.v.toFixed(1), rail: h });
        if (Math.round(t * 30) % 60 === 0) await new Promise(r => setTimeout(r, 0));
      }
      out.t = +t.toFixed(0); out.phase = o.phase;
      // (still coming: what holds it, as the ride's check prints a ride's state: its reason, the junction and its light, what
      // it brakes for, and the head of the queue in front of it)
      if (o.phase === 'coming') { const d = o.drv.st, a = d.lineAt, bk = d.block; let hd = bk; for (let k = 0; k < 30 && hd && hd.front && (hd.why === 'car' || hd.why === 'held'); k++) hd = hd.front;
        out.held = { why: d.why, intent: d.intent || '', jn: d.junction || '', sig: a && a.j ? `${a.j.id} arm ${a.i}${a.j.scramble ? ' scr' : ''} ph${a.j.ph}/${a.phase} ${a.j.st} t${(+a.j.t).toFixed(0)}` : '', blk: bk ? `${bk.walker ? 'walker' : 'car'} at ${(+bk.x).toFixed(1)},${(+bk.y).toFixed(1)} v${(+(bk.v || 0)).toFixed(1)} ${bk.why || ''}` : '',
          head: hd && hd !== bk ? `${(+hd.x).toFixed(1)},${(+hd.y).toFixed(1)} ${hd.why || ''} still ${(+(hd.still || 0)).toFixed(0)} s${hd.lineArm ? ` at ${hd.lineArm.j.id} arm ${hd.lineArm.i}` : ''}` : '' }; }
      const c = o.drv.st, seat = o.C.seats[g.rideSeat(o)], fx = Math.sin(c.h), fy = Math.cos(c.h), l = Math.sign(seat.x || 1) * (o.C.hw + 0.05), f = seat.z;
      const dx = c.x + fx * f - fy * l, dy = c.y + fy * f + fx * l, ox = -fy * Math.sign(l), oy = fx * Math.sign(l);
      out.stop = [+c.x.toFixed(1), +c.y.toFixed(1)];
      out.door = R.across(dx + ox * 2.2, dy + oy * 2.2, dx - ox * 0.3, dy - oy * 0.3, c.z).slice(0, 2);
      out.hits = hits;
      if (out.door.length) { const [rx, ry] = out.door[0]; out.why = { gameRail: (g.G.hero || []).some(h => h.rail && h.rail(rx, ry)), cells: (g.G.hero || []).map(h => h.railCells || 0), back: o.kerbBack || 0 }; }
      return out;
    }, [x, y, !!process.env.HAIL]);
    const fail = !r.skip && (r.hits.length || r.door.length || r.phase === 'coming');
    if (fail) bad++;
    console.log(`${fail ? 'FAIL' : r.skip ? 'skip' : 'ok  '} from ${r.at.join(', ')}: ${r.skip || `pick-up ${r.pickup.join(', ')}, ${r.phase} after ${r.t} s, stopped at ${r.stop.join(', ')}${r.held ? `; held: ${JSON.stringify(r.held)}` : ''}${r.hits.length ? `; through a rail ${JSON.stringify(r.hits)}` : ''}${r.door.length ? `; a rail between its door and the pavement at ${JSON.stringify(r.door)} ${JSON.stringify(r.why)}` : ''}`}`);
  }
  console.log(`rails read: ${await p.evaluate(() => window.__rails.points())} points`);
  await b.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
