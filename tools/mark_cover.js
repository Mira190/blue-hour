// Every mark laid over the picture keeps its perspective (web/game/marks.js, docs/MARKS.md): this stands the player
// between the camera and someone marked (or the story's goal) at several distances, the camera pitched from looking
// down to looking up so that her head passes over the mark's point, and fails if a mark is drawn over her body while
// its point lies beyond her, drawn where a wall, a deck or a floor stands between the eye and its point, or drawn over
// someone further off than the mark's reach. The owner's stills of 22 November 2026: a yellow "!" over a man beyond
// the player, on the back of her head.
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   xvfb-run -a node tools/mark_cover.js out_dir [WxH] [blue|night|blue,night] [walk|free|story]
// walk: the walk from the title, Mei's amber speech mark (walktalk.js), the call-outs, the seats' marks.
// free: the builder's map (?walk=1), the old game's "!" over a quest's giver (a sprite in the world) and the names.
// story: the first episode, the goal's mark in the frame (story.js markTick).
// DISTS=4,8,14,22 the metres from the marked; PITCH=-0.1,0.15,0.45 the camera's pitches; SHOTS=0: no stills. Each hour
// listed is played in the same page (blue: dusk, 17:05; night: 21:00), set by the page's clock.
// Exits 1 on any failure, 2 when the page never came to the place.
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/mark-cover', size = '1440x900', hour = 'blue', mode = 'walk'] = process.argv;
const PORT = process.env.PORT || 8800;
const DISTS = (process.env.DISTS || '4,8,14,22').split(',').map(Number);
const PITCH = (process.env.PITCH || '-0.1,0.15,0.45').split(',').map(Number);
const REACH = { walk: { story: 18, event: 18, chat: 10, place: 12 }, free: 18, story: 12 };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const [w, h] = size.split('x').map(Number), phone = w < 500, HOURS = hour.split(','), dev = `${mode}-${phone ? 'phone' : 'desk'}`;
  let tag = `${dev}-${HOURS[0]}`;
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  await p.addInitScript(([t, mode]) => {
    try {
      localStorage.setItem('bh-quality', 'high'); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('bh-player', 'W');
      localStorage.removeItem('bh-walk-talk'); localStorage.removeItem('bh-story-late');
      if (mode === 'walk') sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t, w: 'clear' }));
    } catch (e) { /* storage blocked */ }
  }, [HOURS[0], mode]);
  const errors = [], fail = m => { errors.push(m); console.log(`FAIL ${m}`); };
  p.on('pageerror', e => fail(`page error: ${String(e).slice(0, 200)}`));
  await p.goto(`http://localhost:${PORT}/${mode === 'free' ? '?walk=1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const rafs = n => p.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  let who = null; // the marked: { id, x, y, z } (an NPC's id, or 'goal')
  try {
    if (mode === 'walk') {
      await p.waitForFunction(() => document.getElementById('game-stage') && document.getElementById('game-stage').classList.contains('walk-on'), null, { timeout: 1500000, polling: 1000 });
      await p.evaluate(() => { const t = window.__game.walkTalk(); if (t) t.reset(); });
      await p.waitForFunction(() => { const n = window.__game.npcs.find(q => q.id === 'mei'); return n && !n.rig.pending; }, null, { timeout: 900000, polling: 1000 });
      who = await p.evaluate(() => { const n = window.__game.npcs.find(q => q.id === 'mei'); return { id: n.id, x: n.x, y: n.y, z: n.z }; });
    } else if (mode === 'free') {
      await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 1500000, polling: 1000 });
      await p.evaluate(() => document.getElementById('gt-play').click());
      await p.waitForFunction(() => document.getElementById('g-title').hidden, null, { timeout: 600000, polling: 1000 });
      // (a quest's giver: the old game marks them; the nearest drawn)
      // (the first quest's giver, whom the old game marks from the start: Aoi; WHO=id another)
      const id = process.env.WHO || await p.evaluate(() => ((window.__game.G || {}).quests || [{}])[0].giver || 'aoi');
      await p.waitForFunction(id => { const n = window.__game.npcs.find(q => q.id === id); return n && !n.rig.pending; }, id, { timeout: 900000, polling: 1000 });
      who = await p.evaluate(id => { const n = window.__game.npcs.find(q => q.id === id); return { id: n.id, x: n.x, y: n.y, z: n.z }; }, id);
    } else {
      await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 1500000, polling: 1000 });
      await p.evaluate(() => document.getElementById('gt-play').click());
      // (through the opening and the first words to the first place to go)
      const t0 = Date.now();
      while (Date.now() - t0 < 900000) {
        const s = await p.evaluate(() => { const g = window.__game, o = g.overture && g.overture(); if (o && o.active && o.skip) o.skip(); if (g.dlg && g.dlg.open) for (let i = 0; i < 20 && g.dlg.open; i++) g.dlg.next(false); const st = g.story && g.story.state; return st && st.target && st.phase !== 'stop' ? st.target : null; });
        if (s) { who = { id: 'goal', x: s[0], y: s[1], z: s[3] != null ? s[3] : s[2] - 1.2 }; break; }
        await p.waitForTimeout(2000);
      }
    }
  } catch (e) { console.log(`never came to the place: ${String(e).slice(0, 200)}`); }
  if (!who) { console.log('nobody marked to stand before'); await b.close(); process.exit(2); }
  console.log(`${tag}: before ${who.id} at ${who.x.toFixed(1)}, ${who.y.toFixed(1)}, ${who.z.toFixed(1)}`);
  // what is drawn over the picture now, and what it is drawn over (the player's bones as the camera sees them, the
  // city's solids between the eye and each mark's point)
  const look = () => p.evaluate(([mode, REACH]) => {
    const g = window.__game, T = window.THREE, camera = g.camera, me = g.player, out = { marks: [], bad: [] };
    const stage = document.getElementById('game-stage').getBoundingClientRect();
    const Wv = (x, y, z) => new T.Vector3(x, z, -y);
    const scr = v => { const q = v.clone().applyMatrix4(camera.matrixWorldInverse), dep = -q.z; const s = v.clone().project(camera); return { x: (s.x + 1) / 2 * stage.width + stage.left, y: (1 - s.y) / 2 * stage.height + stage.top, dep }; };
    const f = stage.height / 2 / Math.tan(camera.fov * Math.PI / 360);
    // her figure: every bone, the segment to its parent, and the top of her head, each 0.11 m round
    const bones = [];
    if (me.rig && me.rig.root.visible) me.rig.root.traverse(o => { if (o.isBone) bones.push(o); });
    const segs = [], wp = o => o.getWorldPosition(new T.Vector3());
    for (const o of bones) { const a = wp(o); segs.push([a, o.parent && o.parent.isBone ? wp(o.parent) : a]); if (/head$/i.test(o.name)) segs.push([a, a.clone().add(new T.Vector3(0, 0.16, 0))]); }
    const body = segs.map(([a, c]) => [scr(a), scr(c)]).filter(([a, c]) => a.dep > 0.3 && c.dep > 0.3);
    const meDep = body.length ? Math.max(...body.map(([a, c]) => Math.max(a.dep, c.dep))) : 0;
    const overBody = r => body.some(([a, c]) => { for (let k = 0; k <= 4; k++) { const t = k / 4, x = a.x + (c.x - a.x) * t, y = a.y + (c.y - a.y) * t, dep = a.dep + (c.dep - a.dep) * t, rr = 0.11 * f / dep; const nx = Math.max(r.left, Math.min(r.right, x)), ny = Math.max(r.top, Math.min(r.bottom, y)); if (Math.hypot(nx - x, ny - y) < rr - 1) return true; } return false; });
    const c = camera.position;
    const blocked = (x, y, z) => !!g.nav.col.pick(c.x, -c.z, c.y, x, y, z);
    const check = (kind, r, pt, d, reach, solidOk) => {
      const v = scr(Wv(pt[0], pt[1], pt[2])), m = { kind, d: +d.toFixed(1), x: Math.round((r.left + r.right) / 2), y: Math.round(r.bottom) };
      out.marks.push(m);
      if (v.dep > meDep + 0.2 && overBody(r)) out.bad.push(`${kind} ${d.toFixed(1)} m off is drawn over the player's body`);
      if (!solidOk && blocked(pt[0], pt[1], pt[2])) out.bad.push(`${kind} ${d.toFixed(1)} m off is drawn through a wall, deck or floor`);
      if (reach && d > reach + 0.5) out.bad.push(`${kind} is drawn over someone ${d.toFixed(1)} m off, beyond its reach of ${reach} m`);
    };
    const dist = n => Math.hypot(n.x - me.x, n.y - me.y);
    const on = el => el && +(el.style.opacity || getComputedStyle(el).opacity) > 0.05 && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
    // the walk's marks over people and seats (data-id: whose), and the call-outs
    for (const el of document.querySelectorAll('.g-walk-mark')) {
      if (!on(el)) continue;
      const id = el.dataset.id || '', k = el.dataset.k || '', r = (el.querySelector('i') || el).getBoundingClientRect();
      if (id.startsWith('place:')) { const s = (g.perch && g.perch.list || []).find(q => `place:${q.id}` === id); if (s) check(`the seat's mark (${id})`, r, [s.at[0], s.at[1], (s.at[2] || 0) + 1.5], Math.hypot(s.at[0] - me.x, s.at[1] - me.y), REACH.walk.place, false); continue; }
      const n = g.npcs.find(q => q.id === id);
      if (n) check(`${n.id}'s ${k} mark`, r, [n.x, n.y, n.z + 2.12], dist(n), REACH.walk[k] || 18, false);
      else out.marks.push({ kind: `${k} mark of nobody known (${id})` });
    }
    for (const el of document.querySelectorAll('.g-walk-bark')) if (on(el)) out.marks.push({ kind: 'call-out', text: el.textContent.slice(0, 30) });
    // the old game's "!" (a sprite in the world: its rectangle as drawn)
    for (const n of g.npcs) {
      const s = n.marker;
      if (!s || !s.visible || !n.rig.root.visible || (s.material && s.material.opacity < 0.05)) continue;
      const v = scr(s.getWorldPosition(new T.Vector3()));
      if (v.dep < 0.3) continue;
      const hw = s.scale.x / 2 * f / v.dep, hh = s.scale.y / 2 * f / v.dep, r = { left: v.x - hw, right: v.x + hw, top: v.y - hh, bottom: v.y + hh };
      if (r.right < stage.left || r.left > stage.right || r.bottom < stage.top || r.top > stage.bottom) continue;
      const pt = s.getWorldPosition(new T.Vector3());
      check(`${n.id}'s "!"`, r, [pt.x, -pt.z, pt.y], dist(n), REACH.free, false);
    }
    // the names over people (the free map)
    for (const el of document.querySelectorAll('.lbl.npc')) if (!el.hidden && on(el)) out.marks.push({ kind: `name ${el.textContent.slice(0, 20)}` });
    // the story's goal in the frame (not its arrow at the edge)
    const gm = document.getElementById('g-story-mark');
    if (gm && gm.classList.contains('on') && !gm.classList.contains('off') && g.story) {
      const st = g.story.state, t = st.wayAim ? [st.wayAim[0], st.wayAim[1], st.wayAim[2] + 1.2] : st.target ? [st.target[0], st.target[1], st.target[2] + (/meet|ghost/.test(gm.dataset.kind) ? 0.95 : 0)] : null;
      if (t) check(`the goal's ${gm.dataset.kind} mark`, gm.querySelector('i').getBoundingClientRect(), t, Math.hypot(t[0] - me.x, t[1] - me.y), /meet|ghost/.test(gm.dataset.kind) ? REACH.story : 0, /go|frame/.test(gm.dataset.kind)); // (the way's sign is not asked of the walls: story.js markTick)
    }
    out.veil = g.marks ? g.marks.stat : null;
    return out;
  }, [mode, REACH]);
  let shown = 0, n = 0;
  for (const hr of HOURS) {
  tag = `${dev}-${hr}`;
  await p.evaluate(night => { const g = window.__game, c = g.clock; if (g.setClock && c) g.setClock(c.y, c.m, c.d, night ? 21 * 60 : 17 * 60 + 5); }, hr === 'night');
  for (const D of DISTS) {
    let worst = null;
    for (const pitch of PITCH) {
      // her back to the camera, the marked straight ahead D metres beyond her, on their level
      await p.evaluate(([who, D, pitch]) => {
        const g = window.__game, pl = g.player;
        let dx = pl.x - who.x, dy = pl.y - who.y, l = Math.hypot(dx, dy); if (l < 0.5) { dx = 0; dy = -1; l = 1; }
        const x = who.x + dx / l * D, y = who.y + dy / l * D;
        g.spawn([x, y], who.z + 1); pl.speed = 0;
        pl.h = Math.atan2(who.x - pl.x, who.y - pl.y); g.cam.yaw = pl.h; g.cam.pitch = pitch;
      }, [who, D, pitch]);
      await rafs(14); await p.waitForTimeout(500); await rafs(4);
      const r = await look(); n++;
      const mine = r.marks.filter(m => m.kind && m.kind.startsWith(who.id === 'goal' ? 'the goal' : who.id));
      if (mine.length) shown++;
      console.log(`${tag} ${D} m, pitch ${pitch}: ${r.marks.length ? r.marks.map(m => `${m.kind}${m.d != null ? ` ${m.d} m` : ''}`).join('; ') : 'no marks'}${r.bad.length ? ` | ${r.bad.join('; ')}` : ''}`);
      for (const e of r.bad) fail(`${tag} ${D} m, pitch ${pitch}: ${e}`);
      if (!worst || r.bad.length > worst.bad) worst = { pitch, bad: r.bad.length };
    }
    // a still of the distance at its worst pitch (or the first, the camera low behind her, her head over the point)
    if (process.env.SHOTS !== '0') {
      await p.evaluate(p => { window.__game.cam.pitch = p; }, worst.pitch);
      await rafs(10); await p.waitForTimeout(400);
      await p.screenshot({ path: `${out}/${tag}-${String(D).padStart(2, '0')}m.png` });
    }
  }
  }
  // (the check means nothing if it never saw a mark: within reach, uncovered, the marked's mark must have been drawn)
  if (!shown && mode !== 'story') fail(`${dev}: in ${n} placings the marked's own mark was never drawn`);
  console.log(`${dev}: ${shown} of ${n} placings drew the marked's mark; ${errors.length ? `${errors.length} failures` : 'no mark over her body, through a solid, or out of reach'}`);
  await b.close().catch(() => {});
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
