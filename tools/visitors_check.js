// The people a place keeps (web/game/visitors.js; game.json `visitors`; issues 112 and 171), on the walk's page, on a
// desktop and (PHONE=1) a phone: each group made when the camera comes near and none before; each person on the floor
// the data names, clear of what stands solid on SHIBUYA SKY's deck (hero[].boxes: benches, nets, searchlights) and of
// one another; the seated sat on something drawn (tools/drawn_seat.js: a ray down through the meshes from the hips and
// the thighs, never the walking grid, which round Hachiko's bed is a metre wider than the stone); each overheard line of the roof (game.json chatter) given two speakers of them, from where a player stands to hear
// it; the seat on Hachiko's wall offered by the person beside it and by no mark; a phone keeping only those marked
// `phone`; and five seconds with the world's time held, in which nobody moves.
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   tools/job.sh run visitors -- xvfb-run -a node tools/visitors_check.js            (PHONE=1: as a phone)
// Exits 1 on any failure.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { startPlay } = require('./start_play');
const { drawnSeat } = require('./drawn_seat');
const G = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'data', 'shibuya', 'game.json'), 'utf8'));
const phone = !!process.env.PHONE;
(async () => {
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = phone ? await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' })
    : await b.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  // (a software renderer picks the low tier for itself, which keeps a phone's few: the desktop's tier on a desktop)
  await p.addInitScript(t => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); localStorage.removeItem('bh-walk-sat'); localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, phone ? 'low' : 'high');
  const logs = [];
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await p.evaluate(() => window.__game.hold(true, true));
  await startPlay(p);
  await p.evaluate(() => { const g = window.__game; g.advance(1); if (g.cine && g.cine.active && g.cine.skip) g.cine.skip(); g.advance(3); }); // (the arrival's shot over)
  const errors = [];
  const fail = m => { errors.push(m); console.log('FAIL ' + m); };
  const ok = m => console.log('ok   ' + m);
  const groups = (G.visitors || {}).groups || [];
  if (!groups.length) fail('no game.visitors groups');
  const want = g => g.people.filter(q => !phone || q.phone).length;
  // stand the player (and so the camera) at (x, y) on the floor nearest z, facing (fx, fy), and run a few frames
  const stand = (x, y, z, fx, fy, n = 40) => p.evaluate(async ([x, y, z, fx, fy, n]) => {
    const g = window.__game, f = g.nav.floorAt(x, y, z + 1);
    Object.assign(g.player, { x, y, z: f ? f.z : z, h: Math.atan2(fx - x, fy - y), speed: 0, vz: 0 });
    g.cam.yaw = g.player.h; g.cam.pitch = 0.08; g.advance(0.3); // (held, the camera moves only with advance())
    for (let i = 0; i < n; i++) { g.frame(0.05); if (i % 8 === 7) await new Promise(r => setTimeout(r, 0)); }
  }, [x, y, z, fx, fy, n]);
  const shown = () => p.evaluate(() => (window.__game.visitors ? window.__game.visitors.shown() : null));
  // before: on the Scramble, nobody of the roof is made or drawn
  await stand(372, -1020, 15.3, 372, -990);
  const s0 = await shown();
  if (!s0) { fail('no visitors in the page (game.js visitors)'); }
  else if (s0.some(v => v.group === 'sky-stage')) fail(`from the Scramble, ${s0.filter(v => v.group === 'sky-stage').length} of SHIBUYA SKY's visitors are drawn`);
  else ok('from the Scramble, nobody of SHIBUYA SKY is drawn');
  const boxes = ((G.hero || []).find(h => h.id === 'skyroof') || {}).boxes || [];
  for (const g of groups) {
    const P = g.people.filter(q => !phone || q.phone), cx = g.at[0], cy = g.at[1];
    if (g.id === 'sky-stage') await stand(cx + 10, cy - 6, g.at[2], cx - 20, cy + 10, 60);
    else { const s = P[0]; await stand(s.at[0] + (s.face[0] - s.at[0]) * 0.9, s.at[1] + (s.face[1] - s.at[1]) * 0.9, g.at[2], s.at[0], s.at[1], 60); }
    // (their bodies may still be loading: the crowd's cast comes in a few at a time; given a minute and a half)
    await p.evaluate(async ([gid, n]) => { const g = window.__game; for (let i = 0; i < 450 && g.visitors.shown().filter(v => v.group === gid).length < n; i++) { g.frame(0.05); await new Promise(r => setTimeout(r, 200)); } }, [g.id, want(g)]);
    const S = (await shown()).filter(v => v.group === g.id);
    if (S.length !== want(g)) fail(`${g.id}: ${S.length} drawn of ${want(g)}${phone ? ' (a phone)' : ''}`);
    else ok(`${g.id}: all ${S.length} drawn${phone ? ' on a phone' : ''} (${S.map(v => v.character.replace(/^R_/, '') + ':' + v.clip + (v.sit ? ':seated' : '')).join(', ')})`);
    // on their floor, clear of the solid things and of each other; the seated, their hips on the seat
    const res = await p.evaluate(gid => {
      const g = window.__game, nav = g.nav, out = [];
      for (const G of g.visitors.groups) if (G.g.id === gid) for (const v of G.people) {
        if (!v.rig) continue;
        const fx = v.p.sit != null ? v.x + Math.sin(v.h) * 0.55 : v.x, fy = v.p.sit != null ? v.y + Math.cos(v.h) * 0.55 : v.y;
        let f = nav.floorAt(fx, fy, v.z + 0.6);
        if (v.p.sit != null && (!f || Math.abs(f.z - v.z) > 1)) f = nav.floorAt(v.x, v.y, v.z + 0.3); // (a bench by the glass: as visitors.js place)
        const hips = v.rig.model.getObjectByName ? (() => { let hb = null; v.rig.model.traverse(o => { if (!hb && o.isBone && /Pelvis$/.test(o.name)) hb = o; }); return hb ? hb.getWorldPosition(new THREE.Vector3()).y : null; })() : null;
        const under = nav.floorAt(v.x, v.y, v.z + 1.2); // (what is under the hips: the seat's top where it is part of the walking, else the floor)
        out.push({ at: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)], floor: f ? +f.z.toFixed(2) : null, sit: v.p.sit != null, hips: hips != null ? +(hips - v.z).toFixed(2) : null, under: under ? +(under.z - v.z).toFixed(2) : null, why: v.p.why });
      }
      return out;
    }, g.id);
    for (const r of res) {
      if (!r.sit && (r.floor == null || Math.abs(r.floor - r.at[2]) > 0.08)) fail(`${g.id}: ${r.why}: stands at ${r.at[2]}, the floor there is ${r.floor}`);
      for (const bx of boxes) {
        if (r.sit) continue; // (a bench is sat on: its box is where the seated are)
        const [x, y, h, hl, hw] = bx, dx = r.at[0] - x, dy = r.at[1] - y, a = dx * Math.sin(h) + dy * Math.cos(h), c = dx * Math.cos(h) - dy * Math.sin(h);
        const gap = Math.max(Math.abs(a) - hl, Math.abs(c) - hw);
        if (Math.abs(r.at[2] - bx[5]) < 2 && gap < 0.3) fail(`${g.id}: ${r.why}: ${gap.toFixed(2)} m from a solid box of the deck at [${x}, ${y}]`);
      }
    }
    // the seated, on something drawn: a ray down through the meshes under the hips and the thighs (the walking grid is
    // not the picture: round Hachiko's bed it is a metre wider than the stone, tools/drawn_seat.js)
    for (const r of (await p.evaluate(drawnSeat, { rigs: 'visitors' })).filter(r => g.people.some(q => q.why === r.who))) {
      if (r.ok === null) console.log(`(${g.id}: ${r.who}: what is drawn under them cannot be read on this device)`);
      else if (!r.ok) fail(`${g.id}: ${r.who}: seated on nothing drawn (from the hips at ${r.pelvis} and each thigh down to a drawn top: ${JSON.stringify(r.under)})`);
      else ok(`${g.id}: ${r.who}: on a drawn seat, the hips ${r.under.pelvis} m over it`);
    }
    for (let i = 0; i < res.length; i++) for (let j = i + 1; j < res.length; j++) {
      const d = Math.hypot(res[i].at[0] - res[j].at[0], res[i].at[1] - res[j].at[1]);
      if (Math.abs(res[i].at[2] - res[j].at[2]) < 1.5 && d < 0.55) fail(`${g.id}: two of them ${d.toFixed(2)} m apart`);
    }
    // the named people of the map: none of them stood on
    for (const n of G.npcs || []) for (const r of res) if (n.at.length > 2 && Math.abs(n.at[2] - r.at[2]) < 1.5 && Math.hypot(n.at[0] - r.at[0], n.at[1] - r.at[1]) < 1.2) fail(`${g.id}: ${r.why}: within 1.2 m of ${n.name}`);
  }
  // each overheard line of the roof said by two of them, heard from where a player stands
  for (const c of (G.chatter || []).filter(c => c.at[2] > 200)) {
    // (from the deck, east of where it is said, looking at it; one said on SKY EDGE's stair, from the stair's head on the
    // deck, looking down it, where a player coming to the corner stands)
    const o = c.at[2] < 241 ? [490.3, -1127.2] : [c.at[0] + 7, c.at[1] - 2];
    await stand(o[0], o[1], 241.8, c.at[0], c.at[1], 30);
    // (looking at the two of them nearest where it is said, as a player looks at people, not at a point: on a phone's
    // narrow screen the point between was a frame with one of them out of it)
    await p.evaluate(([x, y, z, r]) => { const g = window.__game, n = g.visitors.near(x, y, z, r).slice(0, 2); const m = n.length ? n.reduce((a, q) => [a[0] + q.x / n.length, a[1] + q.y / n.length, a[2] + q.z / n.length], [0, 0, 0]) : [x, y, z]; g.camera.lookAt(m[0], m[2] + 1.2, -m[1]); g.camera.updateMatrixWorld(); }, [c.at[0], c.at[1], c.at[2], c.reach || 5]);
    const n = await p.evaluate(([x, y, z, r]) => window.__game.speakers(x, y, z, r).filter(f => f()).length, [c.at[0], c.at[1], c.at[2], c.reach || 5]);
    if (n < 2) fail(`"${c.lines[0][1]}": ${n} speaker(s) of SHIBUYA SKY's visitors within ${c.reach || 5} m and in sight`);
    else ok(`"${c.lines[0][1]}": said by two of SHIBUYA SKY's visitors`);
  }
  // Hachiko's wall: the free place offered by the person sitting beside it, and by no mark
  {
    const s = (G.hero || []).flatMap(h => h.perches || [])[0];
    if (s) {
      await stand(s.at[0] + s.face[0] * 9, s.at[1] + s.face[1] * 9, 15.3, s.at[0], s.at[1], 40);
      const m = await p.evaluate(() => ({ places: window.__game.places ? null : null, marks: [...document.querySelectorAll('.g-walk-mark[data-k="place"]')].map(e => +e.style.opacity || 0) }));
      const near = (await shown()).filter(v => v.group === 'hachiko-wall' && v.sit && Math.hypot(v.x - s.at[0], v.y - s.at[1]) < 2);
      if (!near.length) fail(`nine metres from ${s.name}, nobody sits beside the free place`);
      else ok(`nine metres from ${s.name}: someone sits ${Math.hypot(near[0].x - s.at[0], near[0].y - s.at[1]).toFixed(2)} m from the free place`);
      if (m.marks.some(o => o > 0.05)) fail(`${s.name} is still offered by a mark (${m.marks})`); else ok(`${s.name}: no mark, the person does it`);
      const nagi = (((G.walk || {}).line || {}).wait || {}).beside;
      if (nagi && near.length && Math.hypot(near[0].x - nagi[0], near[0].y - nagi[1]) < 0.6) fail('the sitter is where Nagi sits to wait with you');
    }
  }
  // time held: nobody of them moves in five seconds of frames
  {
    const g0 = groups[0];
    await stand(g0.at[0] + 10, g0.at[1] - 6, g0.at[2], g0.at[0] - 20, g0.at[1] + 10, 20);
    const pose = () => p.evaluate(() => window.__game.visitors.groups.flatMap(G => G.people.filter(v => v.shown).map(v => { const w = []; v.rig.model.traverse(o => { if (o.isBone && /(Head|R_Hand|L_Hand)$/.test(o.name)) w.push(o.getWorldPosition(new THREE.Vector3()).toArray()); }); return w; })).flat(2));
    await p.evaluate(() => { const g = window.__game; g.hold(true); });
    const a = await pose();
    await p.evaluate(async () => { const g = window.__game; for (let i = 0; i < 100; i++) { g.frame(0); if (i % 10 === 9) await new Promise(r => setTimeout(r, 0)); } });
    const c = await pose();
    const moved = Math.max(0, ...a.map((v, i) => Math.abs(v - c[i])));
    if (moved > 0.002) fail(`with time held, a visitor moved ${moved.toFixed(3)} m in five seconds of frames`); else ok('with time held, nobody of them moves');
  }
  for (const l of logs) fail(l);
  await b.close();
  console.log(errors.length ? `${errors.length} failure(s)` : `visitors${phone ? ' (a phone)' : ''}: all passed`);
  process.exit(errors.length ? 1 : 0);
})();
