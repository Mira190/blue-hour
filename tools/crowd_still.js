// Who stands stuck near you on the walk: the title's second way in (the walk, set out at the blue hour under a clear
// sky, as the last card's Walk Shibuya sets out), the clock at the owner's hour (17:41), you standing on Hachiko
// square on foot with the chase camera behind, the world stepped a thirtieth of a second at a time for SECS of the
// game (default 120). Every half second the people near you (the crowd's walkers, drawn as a person or as a far
// figure, and the game's own NPCs) are measured, and for each of the TOP (default 10) nearest it records:
//   moved: the ground made over the run, and its longest stand (slower than 0.15 m/s over half a second);
//   in that stand: how far the head turned (the heading's range, degrees), how far the pose changed (the most any bone
//   of the body turned from where it stood at the stand's start, degrees: a clip playing moves it; a figure drawn as a
//   far copy standing, or a rig whose mixer stands still, does not), the clips it played, and what the crowd had it do
//   (its phase: wait at a kerb, stroll, linger about the square, cross; leaning; in a group).
// It fails on anyone of those nearest stood more than WAIT s (default 20) with the heading turned less than TURN degrees
// (default 20) and the pose changed less than POSE degrees (default 6): a person waiting at Hachiko shifts their weight,
// looks round, checks a phone, turns to the one they wait for; one who does none of that for twenty seconds a few
// metres from you reads as stuck.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/crowd_still.js [x,y,face] [secs]     (default 372,-1031 facing the crossing, 120 s)
//   PHONE=1: a phone's page (390x844, touch: its fewer near people); SPOTS=all: also the crossing's kerb by QFRONT,
//   the station's kerb and SHIBUYA SKY's roof (the class elsewhere)
const { chromium, devices } = require('playwright');
const [,, at = '', secs = '120'] = process.argv;
const TOP = +(process.env.TOP || 10), WAIT = +(process.env.WAIT || 20), TURN = +(process.env.TURN || 20), POSE = +(process.env.POSE || 6);
const MIN = +(process.env.MIN || 17 * 60 + 41), PHONE = !!process.env.PHONE;
const SPOTS = {
  hachiko: [372, -1031, 0.2], // (on Hachiko square's paving, between the statue and the planters, looking up at the crossing)
  qfront: [350, -978, 3.4],
  station: [392, -1012, 4.2],
  sky: [516, -1121, 2.4, 'roof'], // (SHIBUYA SKY's roof, by GEO COMPASS: stood on the roof's floor)
};
(async () => {
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(PHONE ? { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } : { viewport: { width: 720, height: 450 } });
  await p.addInitScript(() => {
    try { localStorage.setItem('bh-onboard', '1'); if (!sessionStorage.getItem('bh-still-once')) { sessionStorage.setItem('bh-still-once', '1'); sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t: 'blue', w: 'clear' })); } } catch (e) { /* storage blocked */ }
  });
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 600000, polling: 500 });
  // set out: the walk's opening skipped by a key, as a player may
  const t0 = Date.now();
  for (;;) {
    const s = await p.evaluate(() => { const g = window.__game, o = g.overture && g.overture(); return { on: document.getElementById('game-stage').classList.contains('walk-on'), film: !!(o && o.active) }; });
    if (s.on && !s.film) break;
    if (s.film) await p.keyboard.press('Space');
    if (Date.now() - t0 > 600000) throw new Error('the walk did not set out');
    await p.waitForTimeout(1000);
  }
  const names = at ? { given: at.split(',').map(Number) } : process.env.SPOTS === 'all' ? SPOTS : { hachiko: SPOTS.hachiko };
  let fail = 0;
  for (const [name, spot0] of Object.entries(names)) {
    const r = await p.evaluate(([spot, secs, min, TOP]) => {
      window.requestAnimationFrame = () => 0;
      const g = window.__game, me = g.player, C = g.crowd, D = g.crowdDraw && g.crowdDraw();
      const NPCS = typeof g.npcs === 'function' ? g.npcs() : g.npcs || [];
      const spotAt = spot.slice();
      if (spotAt[3] === 'roof') { const f = g.nav.floorAt(spotAt[0], spotAt[1], 400); if (!f) return { skip: 'no roof to stand on' }; spotAt[3] = f.z; }
      g.setClock(g.clock.y, g.clock.m, g.clock.d, min); g.clock.scale = 1;
      if (g.cine && g.cine.active) g.cine.skip();
      const [x, y, face, z] = spotAt;
      const put = () => { me.x = x; me.y = y; me.h = face || 0; me.z = z != null ? z : g.nav.terrain(x, y); g.cam.yaw = me.h; }; // (the chase camera behind you, as it comes round behind a player standing)
      put();
      for (let t = 0; t < 15; t += 0.1) { g.advance(0.1); put(); } // (the crowd settled round you, the camera come round behind)
      const camBehind = (() => { const c = g.camera.position, dx = c.x - x, dy = -c.z - y; return { d: +Math.hypot(dx, dy).toFixed(1), behind: dx * Math.sin(me.h) + dy * Math.cos(me.h) < 0 }; })();
      const bonesOf = new WeakMap();
      const bones = rig => {
        let L = bonesOf.get(rig);
        if (!L) { L = []; rig.root.traverse(o => { if (o.isBone && /spine|neck|head|clavicle|upperarm|forearm|hand$|thigh|calf|pelvis/i.test(o.name)) L.push(o); }); bonesOf.set(rig, L); }
        return L;
      };
      const pose = rig => bones(rig).map(o => o.quaternion.clone());
      const angle = (a, b) => { let m = 0; for (let k = 0; k < Math.min(a.length, b.length); k++) m = Math.max(m, 2 * Math.acos(Math.min(1, Math.abs(a[k].dot(b[k])))) * 180 / Math.PI); return m; };
      const tracks = new Map();
      const who = () => {
        const out = [];
        for (let i = 0; i < C.active; i++) {
          const q = C.P[i];
          if (!(q.line >= 0 || q.pz) || (D && D.shows && !D.shows(i))) continue;
          const d = Math.hypot(q.x - x, q.y - y);
          if (d > 25 || Math.abs((q.z || 0) - me.z) > 3) continue;
          const rig = D && D.active ? D.active.get(i) : null;
          out.push({ key: 'c' + i, d, x: q.x, y: q.y, h: q.h, rig, kind: rig ? 'person' : 'figure', look: rig ? rig.character : q.look && q.look.character,
            what: q.pz ? `${q.ph}${q.lst ? ':stood' : ''}${q.lface != null && q.ph === 'linger' && !q.mates && !(q.lead >= 0) ? ':leaning' : ''}` : `${q.state}${q.kw > 0 ? ':kerb' : ''}${q.stop ? ':stop' : ''}${q.seat ? ':seat' : ''}${q.pause > 0 ? ':pause' : ''}`,
            group: q.lead >= 0 ? 'mate' : q.mates && q.mates.length ? `leader of ${q.mates.length}` : '', q });
        }
        for (const n of NPCS) {
          if (n.away || !n.rig || n.rig.pending || !n.rig.root.visible) continue; // (pending: its character still coming, nothing drawn)
          const d = Math.hypot(n.x - x, n.y - y);
          if (d > 25 || Math.abs((n.z || 0) - me.z) > 3) continue;
          out.push({ key: 'n' + n.id, d, x: n.x, y: n.y, h: n.h, rig: n.rig, kind: 'npc', look: n.look && n.look.character, what: n.sit ? 'sit' : n.talking ? 'talk' : n.walkSpeed ? 'walk' : 'npc', group: '' });
        }
        return out.sort((a, b) => a.d - b.d);
      };
      const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
      for (let t = 0; t <= secs; t += 0.5) {
        if (t > 0) for (let k = 0; k < 15; k++) { g.advance(1 / 30); put(); }
        const W = who();
        W.forEach((w, rank) => {
          let tr = tracks.get(w.key);
          if (tr && Math.hypot(w.x - tr.x, w.y - tr.y) > 3) { tracks.delete(w.key); tr = null; } // (put elsewhere: someone else now)
          const clip = w.rig && w.rig.clipName ? w.rig.clipName() : w.kind === 'figure' ? '(far copy)' : '?';
          // (a far copy's pose is the shader's (people.js CROWD_POSE): standing, aAnim.z -0.25, its upper body's turn there
          // reckoned as the shader does, as a pose of one number; else it holds still)
          let ps = w.rig ? pose(w.rig) : null;
          if (w.kind === 'figure' && w.q.mesh) {
            const z = w.q.mesh.geometry.attributes.aAnim.getZ(w.q.slot), ax = w.q.mesh.geometry.attributes.aAnim.getX(w.q.slot), T = g.clockT ? g.clockT() : t;
            const tt = T * (0.5 + 0.12 * (((ax * 0.159) % 1 + 1) % 1)) + ax;
            const yaw = z < -0.05 && z > -0.5 ? 0.1 * Math.sin(tt * 0.7) + 0.05 * Math.sin(tt * 1.9 + 1.3) : 0;
            ps = [{ yaw, dot(o) { return Math.cos((this.yaw - o.yaw) / 2); } }];
          }
          if (!tr) { tr = { key: w.key, kind: w.kind, look: w.look, x0: w.x, y0: w.y, x: w.x, y: w.y, made: 0, near: 99, top: false, t0: t, best: null, st: null }; tracks.set(w.key, tr); }
          const v = Math.hypot(w.x - tr.x, w.y - tr.y) / 0.5;
          tr.made += Math.hypot(w.x - tr.x, w.y - tr.y); tr.x = w.x; tr.y = w.y; tr.kind = w.kind; tr.look = w.look; tr.last = t;
          tr.near = Math.min(tr.near, w.d); if (rank < TOP) tr.top = true;
          if (v < 0.15) {
            if (!tr.st) tr.st = { t0: t, h0: w.h, hmin: 0, hmax: 0, p0: ps, pose: 0, clips: new Set(), what: new Set(), group: w.group, d: w.d, at: [+w.x.toFixed(1), +w.y.toFixed(1)] };
            const s = tr.st, dh = wrap(w.h - s.h0);
            s.hmin = Math.min(s.hmin, dh); s.hmax = Math.max(s.hmax, dh);
            if (ps && s.p0 && s.p0.length === ps.length) s.pose = Math.max(s.pose, angle(s.p0, ps)); else if (ps) s.p0 = ps; // (drawn the other way now, a person or a far copy: measured afresh from here)
            s.clips.add(clip); s.what.add(w.what); s.d = Math.min(s.d, w.d); s.len = t - s.t0; s.top = s.top || rank < TOP;
            if (!tr.best || s.len > tr.best.len) tr.best = s;
          } else tr.st = null;
        });
      }
      const out = [...tracks.values()].filter(tr => tr.top).map(tr => {
        const s = tr.best;
        return { key: tr.key, kind: tr.kind, look: tr.look, near: +tr.near.toFixed(1), seen: tr.last - tr.t0, made: +tr.made.toFixed(1),
          stand: s ? { len: s.len || 0, turn: Math.round((s.hmax - s.hmin) * 180 / Math.PI), pose: Math.round(s.pose), clips: [...s.clips], what: [...s.what], group: s.group, at: s.at, d: +s.d.toFixed(1), top: !!s.top } : null };
      }).sort((a, b) => a.near - b.near);
      return { camBehind, out };
    }, [spot0, +secs, MIN, TOP]);
    if (r.skip) { console.log(`[${name}] skipped: ${r.skip}`); continue; }
    console.log(`[${name}] ${String(Math.floor(MIN / 60)).padStart(2, '0')}:${String(MIN % 60).padStart(2, '0')}${PHONE ? ' on a phone' : ''}: camera ${r.camBehind.d} m ${r.camBehind.behind ? 'behind' : 'NOT behind'} you; the ${TOP} nearest over ${secs} s (${r.out.length} people):`);
    for (const o of r.out) {
      const s = o.stand, stuck = s && s.top && s.len > WAIT && s.turn < TURN && s.pose < POSE;
      if (stuck) fail++;
      console.log(`  ${stuck ? 'STUCK' : 'ok   '} ${o.key.padEnd(6)} ${o.kind.padEnd(6)} ${String(o.look).slice(0, 34).padEnd(34)} nearest ${o.near} m, seen ${o.seen} s, moved ${o.made} m` +
        (s ? `; stood ${s.len} s at ${s.at} (${s.d} m) turned ${s.turn} deg, pose ${s.pose} deg, ${s.clips.join('/')}, ${s.what.join('/')}${s.group ? ', ' + s.group : ''}` : '; never stood'));
    }
  }
  await b.close();
  console.log(fail ? `FAIL ${fail} stood stuck` : 'ok   nobody near you stands stuck');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
