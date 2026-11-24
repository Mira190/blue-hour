// A camera never enters a body (issue 209). The owner's still of frame 3: the chase view stood over the player's head
// looking straight down, the near plane through the hair and the skull, the eyes seen from behind. What is wrong in
// such a picture is one thing whoever the body and whichever the camera: the near plane's rectangle, the window the
// picture is taken through, is inside something drawn, and the far side of it is drawn from within. So that is what is
// read here, every frame the game runs, drawn or not, just before it would be drawn:
//
//   the window   the camera's near rectangle, from its own projection (the fov, the aspect, a talk's lens shift and all);
//   the bodies   the one you play, the story's people and their afterimages, the map's named people, the guide, and the
//                crowd's near copies (the skinned ones people.js draws as people). Each model is cut into its parts by the
//                bone that carries each vertex (as tools/clip_probe.js does), and a part is a capsule fitted to its own
//                vertices in the bone's space: along the part's longest axis, as thick as 80% of its vertices lie within.
//                A little under the skin on purpose: what it calls inside is inside. A part whose meshes are not drawn
//                (the whole person taken out by the lens's guard, a head scaled away in the cockpit) is not there;
//   the measure  how deep the window is in a capsule (its radius less the distance from its axis to the rectangle).
//
// Every case is kept once per person, part, beat and camera, with its deepest frame and the camera's own figures
// there (the chase rig's distance, pitch, lift and pull-in). `hard` are those deeper than DEEP (1 cm); the nearest the
// window came to anyone without touching is printed too, so a fix can be seen to leave room and not only to pass.
// And what the game's last guard did (game.js lensGuard, `window.__lensGuard`): whom it took out of a frame because the
// lens itself was in them, by camera. That is the last resort, printed and counted, not failed: what fails is a window
// in a body that was drawn. Where the one you play is taken out often in the chase view, the chase view is wrong.
//
//   const camIn = require('./cam_intrude'); await camIn.install(page); ... const R = await camIn.report(page); camIn.print(R)
// (tools/story_play.js and tools/walk_play.js do, and fail on `hard`.)
//
// By itself it plays the forced cases, the ones a play of the story does not reach. The player is put where the view
// has least room, found on the page from the walk's own solids round where the frame begins: the back against a wall
// (`wall`), in a corner (`corner`), under the lowest thing overhead (`under`), beside a tree's trunk under its crown
// (`tree`) and against a hero level's wall (`rail`). At each the view is held by a hand (cam.lastInput kept now, so
// nothing turns it away) at every bearing in sixteenths and every pitch from below the horizon to straight overhead,
// at the walk's distance and at the wheel's nearest; put there at once, and then swung through the same continuously,
// as a drag does; and then let go, to settle by itself. The sweep runs on a page a third the size (the same aspect,
// so the same window), and the worst pose of each spot is taken again at the full size for a still.
//   xvfb-run -a node tools/cam_intrude.js out_dir [WxH]        (PORT=8800; FROM=n the frame it opens at, 2 by default:
//                                                              frame 3, the police box by Hachiko; SPOTS=name,name)
'use strict';
const DEEP = 0.01;

function pageSide(DEEP) {
  const MAIN = /(Pelvis|Spine2|Spine1|Spine|Neck|Head|Clavicle|UpperArm|Forearm|Hand|Thigh|Calf|Foot)$/;
  const C = window.__camIn = { cases: new Map(), frames: 0, err: null, rigs: new WeakMap(), near: null, guard: {}, DEEP, last: null };
  let T = null, inv = null, a = null, b = null, m = null;
  const build = root => {
    const parts = new Map(), meshes = [];
    root.traverse(o => { if (o.isSkinnedMesh && o.skeleton && o.geometry.attributes.skinIndex) meshes.push(o); });
    if (!meshes.length) return null;
    const human = meshes.some(o => o.skeleton.bones.some(q => /Bip01/.test(q.name)));
    const partOf = q0 => { if (!human) return q0; for (let q = q0; q && q.isBone; q = q.parent) if (MAIN.test(q.name)) return q; return q0; };
    const p = new T.Vector3();
    for (const o of meshes) {
      const g = o.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = o.skeleton.bones, binv = o.skeleton.boneInverses;
      for (let i = 0; i < pos.count; i++) {
        let bi = 0, bw = -1;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } }
        const bone = bones[bi]; if (!bone) continue;
        const pb = partOf(bone), pi = bones.indexOf(pb); if (pi < 0) continue;
        p.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix).applyMatrix4(binv[pi]);
        let part = parts.get(pb);
        if (!part) parts.set(pb, part = { bone: pb, name: pb.name.replace(/^Bip01_?/, '').replace(/_/g, ' ').trim() || 'body', loc: [], meshes: new Set() });
        part.loc.push(p.x, p.y, p.z); part.meshes.add(o);
      }
    }
    const out = [];
    for (const part of parts.values()) {
      const n = part.loc.length / 3; if (n < 24) continue;
      const lo = [], hi = [];
      for (let k = 0; k < 3; k++) { const s = []; for (let i = 0; i < n; i++) s.push(part.loc[i * 3 + k]); s.sort((x, y) => x - y); lo[k] = s[Math.floor(n * 0.05)]; hi[k] = s[Math.min(n - 1, Math.floor(n * 0.95))]; }
      let ax = 0; for (let k = 1; k < 3; k++) if (hi[k] - lo[k] > hi[ax] - lo[ax]) ax = k;
      const u = (ax + 1) % 3, w = (ax + 2) % 3, cu = (lo[u] + hi[u]) / 2, cw = (lo[w] + hi[w]) / 2, rad = [];
      for (let i = 0; i < n; i++) rad.push(Math.hypot(part.loc[i * 3 + u] - cu, part.loc[i * 3 + w] - cw));
      rad.sort((x, y) => x - y);
      const r = rad[Math.floor(n * 0.8)], half = Math.max(0, (hi[ax] - lo[ax]) / 2 - r), mid = (lo[ax] + hi[ax]) / 2;
      const e0 = [0, 0, 0], e1 = [0, 0, 0]; e0[u] = e1[u] = cu; e0[w] = e1[w] = cw; e0[ax] = mid - half; e1[ax] = mid + half;
      out.push({ bone: part.bone, name: part.name, a: new T.Vector3(...e0), b: new T.Vector3(...e1), r, meshes: [...part.meshes] });
    }
    return out.length ? { parts: out, human } : null;
  };
  const rigOf = root => {
    let r = C.rigs.get(root);
    if (r === undefined || (r && r.none && C.frames - r.at > 90)) { try { r = build(root) || { none: true, at: C.frames }; } catch (e) { r = { none: true, at: 1e12 }; C.err = C.err || `build: ${e && e.message}`; } C.rigs.set(root, r); }
    return r.none ? null : r;
  };
  const shown = (o, cam) => { if (!o.layers.test(cam.layers)) return false; for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  const modeOf = ctx => {
    const g = window.__game || {}, pl = ctx.player, st = ctx.story;
    if (g.cine && g.cine.active) return `shot ${g.cine.label || ''}`.trim();
    if (ctx.talk) return 'talk';
    if (st && st.film) return 'film';
    if (st && st.finder) return 'finder';
    if (g.photo && g.photo.on) return 'photo';
    return `${pl.mode} ${g.cam ? g.cam.mode : ''}`.trim();
  };
  const frame = ctx => {
    T = ctx.THREE; if (!inv) { inv = new T.Matrix4(); a = new T.Vector3(); b = new T.Vector3(); m = new T.Matrix4(); }
    C.frames++;
    const cam = ctx.camera, pl = ctx.player;
    cam.updateMatrixWorld(); inv.copy(cam.matrixWorld).invert();
    // the window: the near rectangle's corners in the camera's own space
    m.copy(cam.projectionMatrix).invert();
    // (the corners' rays, from any depth in the box, scaled to the near distance: the page's depth runs the other way
    // from three.js's default, reversed, and NDC z = -1 is not the near plane there)
    a.set(-1, -1, 0.5).applyMatrix4(m); b.set(1, 1, 0.5).applyMatrix4(m);
    const zn = -cam.near, ka = zn / a.z, kb = zn / b.z;
    const x0 = Math.min(a.x * ka, b.x * kb), x1 = Math.max(a.x * ka, b.x * kb), y0 = Math.min(a.y * ka, b.y * kb), y1 = Math.max(a.y * ka, b.y * kb);
    const reach = Math.hypot(Math.max(-x0, x1), Math.max(-y0, y1), zn) + 1.6;
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    C.last = [cx, cy, cz, -zn];
    const who = [];
    const add = (root, name, kind) => { if (!root || !root.parent) return; const p = root.position; if (Math.abs(p.x - cx) > reach + 1 || Math.abs(p.z - cz) > reach + 1 || cy < p.y - reach || cy > p.y + 2.2 + reach) return; who.push([root, name, kind]); };
    if (pl.rig && pl.rig.root) add(pl.rig.root, 'you', 'you');
    for (const f of ctx.storyFigs) if (f.rig) add(f.rig.root, (f.name || f.character || f.id) + (f.ghost ? ' (afterimage)' : ''), 'story');
    for (const q of ctx.npcs) if (q.rig) add(q.rig.root, `npc ${q.name || q.id}`, 'npc');
    if (ctx.guide && ctx.guide.root) add(ctx.guide.root, 'guide', 'guide');
    if (ctx.crowdDraw && ctx.crowdDraw.active) for (const [i, r] of ctx.crowdDraw.active) add(r.root, `walker ${i}`, 'crowd');
    if (!who.length) return;
    let mode = null;
    for (const [root, name, kind] of who) {
      const rig = rigOf(root); if (!rig) continue;
      let posed = false;
      for (const part of rig.parts) {
        if (!part.meshes.some(o => shown(o, cam))) continue;
        if (!posed) { root.updateWorldMatrix(true, true); posed = true; }
        const mw = part.bone.matrixWorld, e = mw.elements, sc = Math.cbrt(Math.abs(mw.determinant())) || 0, r = part.r * sc;
        if (r < 0.005) continue;
        a.copy(part.a).applyMatrix4(mw).applyMatrix4(inv); b.copy(part.b).applyMatrix4(mw).applyMatrix4(inv);
        let d = Infinity;
        for (let k = 0; k <= 16; k++) {
          const t = k / 16, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
          const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1), dz = z - zn, q = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (q < d) d = q;
        }
        const gap = d - r;
        if (gap > 0.5) continue;
        if (!mode) mode = modeOf(ctx);
        if (gap >= 0) { if (!C.near || gap < C.near.gap) C.near = { gap: +gap.toFixed(3), who: name, part: part.name, at: ctx.at, mode, frame: C.frames }; continue; }
        const key = `${name}|${part.name}|${ctx.at.replace(/ \((Stop|talk)\)/g, '')}|${mode}`;
        let c = C.cases.get(key);
        if (!c) { if (C.cases.size > 2000) continue; c = { who: name, kind, part: part.name, at: ctx.at, mode, depth: 0, n: 0, f0: C.frames }; C.cases.set(key, c); }
        c.n++; c.f1 = C.frames;
        if (-gap > c.depth) {
          c.depth = +(-gap).toFixed(3);
          const g = window.__game || {}, k = g.cam;
          c.cam = [cx, -cz, cy].map(v => +v.toFixed(2)); c.you = [pl.x, pl.y, pl.z].map(v => +v.toFixed(2)); c.near = +(-zn).toFixed(2); c.fov = +cam.fov.toFixed(1);
          if (k) c.rig = { dist: +k.dist.toFixed(2), pitch: +k.pitch.toFixed(2), lift: +(k.lift || 0).toFixed(2), pull: +(k.pull ?? 1).toFixed(2), idle: +(performance.now() / 1000).toFixed(0) };
        }
      }
    }
  };
  // (beside tools/clip_probe.js when a play installs both: the game calls one hook, window.__probe.frame)
  const run = ctx => { try { frame(ctx); } catch (e) { if (!C.err) C.err = `${e && e.message} ${(e && e.stack || '').split('\n')[1] || ''}`; } };
  const hook = () => {
    const P = window.__probe;
    if (P && P.__camIn) return;
    if (P && typeof P.frame === 'function') { const f = P.frame; P.frame = ctx => { f(ctx); run(ctx); }; P.__camIn = true; }
    else window.__probe = { frame: run, __camIn: true };
  };
  hook();
  C.hook = hook;
}

async function install(page) { await page.addInitScript(pageSide, DEEP); await page.addInitScript(() => { window.__lensGuard = window.__lensGuard || {}; }); }
async function report(page) {
  return page.evaluate(() => { const C = window.__camIn; if (!C) return null; const G = window.__lensGuard || null; return { frames: C.frames, err: C.err, near: C.near, cases: [...C.cases.values()], guard: G ? { ...G } : null, DEEP: C.DEEP }; }).catch(() => null);
}
// clears what was counted (between the forced cases)
async function reset(page) { await page.evaluate(() => { const C = window.__camIn; if (C) { C.cases.clear(); C.near = null; C.frames = 0; } const G = window.__lensGuard; if (G) for (const k of Object.keys(G)) delete G[k]; }); }
function print(R, log = console.log) {
  if (!R) { log('camera in a body: not measured (the page was gone)'); return { hard: [] }; }
  if (R.err) log(`camera in a body: the measure threw: ${R.err}`);
  const cases = R.cases.slice().sort((x, y) => y.depth - x.depth), hard = cases.filter(c => c.depth > R.DEEP);
  log(`camera in a body: ${R.frames} frames read; ${hard.length ? `${hard.length} case(s) of the near plane inside someone drawn` : 'the near plane inside nobody drawn'}${R.near ? `; nearest without touching ${R.near.gap} m (${R.near.who}'s ${R.near.part}, ${R.near.mode}, ${R.near.at || 'no beat'})` : ''}`);
  for (const c of hard.slice(0, 40)) log(`  IN ${c.who}'s ${c.part}: ${c.depth} m deep, ${c.n} frame(s) from ${c.f0}; ${c.mode}; ${c.at || 'no beat'}; camera ${c.cam} (near ${c.near}, fov ${c.fov}), you ${c.you}${c.rig ? `; rig dist ${c.rig.dist} pitch ${c.rig.pitch} lift ${c.rig.lift} pull ${c.rig.pull}` : ''}`);
  if (hard.length > 40) log(`  and ${hard.length - 40} more`);
  const errs = hard.length ? [`the camera's near plane inside a body: ${hard.length} case(s), the worst ${hard[0].depth} m into ${hard[0].who}'s ${hard[0].part} (${hard[0].mode}; ${hard[0].at || 'no beat'})`] : [];
  if (R.guard) {
    const g = Object.entries(R.guard).sort((x, y) => y[1] - x[1]);
    log(`  the lens's guard took out: ${g.length ? g.map(([k, n]) => `${k} ${n} frame(s)`).join('; ') : 'nobody'}`);
  }
  return { hard, errs };
}
module.exports = { install, report, reset, print, DEEP };

// ---------------------------------------------------------------- the forced cases
if (require.main === module) (async () => {
  const { chromium } = require('playwright');
  const fs = require('fs');
  const [,, out = 'out/cam-intrude', size = '1440x900'] = process.argv;
  const [w, h] = size.split('x').map(Number), phone = w < 600, sw = Math.round(w / 3), sh = Math.round(h / 3);
  const br = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await br.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  const errors = [];
  p.on('pageerror', e => { errors.push(`page error: ${String(e).slice(0, 300)}`); console.log(errors[errors.length - 1]); });
  fs.mkdirSync(out, { recursive: true });
  const FROM = +(process.env.FROM ?? 2);
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  await p.addInitScript(n => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('bh-story-late', JSON.stringify({ fi: n, left: 7 - n, prints: Array.from({ length: n }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, FROM);
  await install(p);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.setViewportSize({ width: sw, height: sh });
  await p.evaluate(() => document.getElementById('gt-play').click());
  for (let i = 0; i < 400; i++) { // (the opening skipped, the case taken up at its frame: the street is the player's)
    const s = await p.evaluate(() => { const g = window.__game, o = g.overture && g.overture(); return { phase: g.story.state.phase, film: !!(o && o.active), cine: g.cine.active, dlg: g.dlg.open }; });
    if (s.phase === 'go' && !s.film && !s.cine && !s.dlg) break;
    if (s.dlg) await p.evaluate(() => window.__game.dlg.next(false)); else if (phone) await p.touchscreen.tap(sw / 2, sh / 2); else await p.keyboard.press('Space');
    await p.waitForTimeout(1500);
  }
  await p.waitForTimeout(3000);
  const spots = await p.evaluate(() => {
    const g = window.__game, pl = g.player, nav = g.nav, T = window.THREE;
    const free = (x, y, z) => { const q = nav.push(x, y, z, 0.3, 1.7); return Math.hypot(q.x - x, q.y - y) < 0.02; };
    const A = new T.Vector3(), B = new T.Vector3();
    const open = (x, y, z, hd, d) => nav.clearFraction(A.set(x, z + 1.55, -y), B.set(x + Math.sin(hd) * d, z + 1.55, -(y + Math.cos(hd) * d))) * d;
    const up = (x, y, z) => nav.clearFraction(A.set(x, z + 1.55, -y), B.set(x, z + 1.55 + 5, -y)) * 5;
    const best = {};
    const stand = (x, y) => { const q = nav.walk(x, y, pl.z + 0.6, true); return q && q.ok && Math.abs(q.z - pl.z) < 2.5 && free(x, y, q.z) ? q.z : null; };
    for (let r = 1; r <= 90; r += 1) for (let k = 0; k < 36; k++) {
      const x = pl.x + Math.sin(k * Math.PI / 18) * r, y = pl.y + Math.cos(k * Math.PI / 18) * r, z = stand(x, y);
      if (z == null) continue;
      const D = []; for (let j = 0; j < 16; j++) D.push(open(x, y, z, j * Math.PI / 8, 6));
      const lo = Math.min(...D), jb = D.indexOf(lo), back = jb * Math.PI / 8, side = Math.min(D[(jb + 4) % 16], D[(jb + 12) % 16]), u = up(x, y, z);
      if (lo < 0.6 && D[(jb + 8) % 16] > 5) {
        if (side > 4 && (!best.wall || lo < best.wall.back)) best.wall = { x, y, z, h: back + Math.PI, back: +lo.toFixed(2) };
        if (side < 1 && (!best.corner || lo + side < best.corner.back + best.corner.side)) best.corner = { x, y, z, h: back + Math.PI, back: +lo.toFixed(2), side: +side.toFixed(2) };
      }
      if (u < 4.9 && (!best.under || u < best.under.over)) best.under = { x, y, z, h: pl.h, over: +u.toFixed(2) };
    }
    const P = []; if (g.posts && g.posts.near) g.posts.near(pl.x, pl.y, 90, q => P.push(q));
    for (const kind of ['tree', 'rail']) {
      let b = null;
      for (const q of P) {
        if (kind === 'tree' ? !(q.kind === 'tree' && q.hb != null) : !q.wall) continue;
        for (let k = 0; k < 8; k++) { const d = q.r + 0.45, x = q.x + Math.sin(k * Math.PI / 4) * d, y = q.y + Math.cos(k * Math.PI / 4) * d, z = stand(x, y); if (z == null) continue; const far = Math.hypot(x - pl.x, y - pl.y); if (!b || (kind === 'tree' ? q.hb < b.hb - 0.05 || (Math.abs(q.hb - b.hb) <= 0.05 && far < b.far) : far < b.far)) b = { x, y, z, h: Math.atan2(x - q.x, y - q.y), hb: q.hb, far }; }
      }
      if (b) best[kind] = b;
    }
    return best;
  });
  console.log('spots:', JSON.stringify(spots, (k, v) => (typeof v === 'number' ? +v.toFixed(2) : v)));
  const only = process.env.SPOTS ? process.env.SPOTS.split(',') : null;
  const fails = [], worst = {};
  const frames = n => p.evaluate(n => new Promise(r => { const C = window.__camIn, f0 = C.frames, t0 = performance.now(); const go = () => (C.frames - f0 >= n || performance.now() - t0 > 20000 ? r() : requestAnimationFrame(go)); go(); }), n);
  // the view put at a pose with a hand on it (at once, or left to ease there), and what the measure says of it since
  const pose = (s, yaw, pitch, dist, snap) => p.evaluate(([s, yaw, pitch, dist, snap]) => { const g = window.__game, pl = g.player, c = g.cam; pl.x = s.x; pl.y = s.y; pl.z = s.z; pl.h = s.h; pl.speed = 0; c.yaw = yaw; c.pitch = pitch; c.dist = dist; c.distTo = 0; c.yawTo = c.pitchTo = null; c.lastInput = 1e12; if (snap) c.snap = true; }, [s, yaw, pitch, dist, snap]);
  const deep = () => p.evaluate(() => { let d = 0; for (const q of window.__camIn.cases.values()) if (q.who === 'you' && q.depth > d) d = q.depth; return d; });
  const PITCH = [-0.25, 0, 0.17, 0.5, 0.9, 1.2, 1.35];
  for (const [name, s] of Object.entries(spots)) {
    if (only && !only.includes(name)) continue;
    await pose(s, s.h, 0.17, 5.5, true); await frames(20); await reset(p);
    let at = null, d0 = 0;
    for (const dist of [2.5, 5.5]) for (const pitch of PITCH) for (let k = 0; k < 16; k++) {
      await pose(s, s.h + k * Math.PI / 8, pitch, dist, true); await frames(3);
      const d = await deep(); if (d > d0) { d0 = d; at = { yaw: s.h + k * Math.PI / 8, pitch, dist }; }
    }
    // (swung through, eased: a drag's turn of the view round you at each pitch, and from the horizon to overhead at each quarter)
    for (const pitch of [0.17, 0.9, 1.35]) for (let k = 0; k <= 48; k++) { await pose(s, s.h + k * Math.PI / 24, pitch, 2.5, false); await frames(2); }
    for (let q = 0; q < 4; q++) for (let k = 0; k <= 16; k++) { await pose(s, s.h + q * Math.PI / 2, -0.25 + 1.6 * k / 16, 2.5, false); await frames(2); }
    // (and let go, behind you and to the wall, to settle by itself: issue 99's turn)
    for (const yaw of [s.h, s.h + Math.PI]) { await pose(s, yaw, 0.17, 5.5, true); await p.evaluate(() => { window.__game.cam.lastInput = -10; }); await frames(90); }
    const R = await report(p);
    console.log(`-- ${name}`);
    const { hard, errs } = print(R);
    const mine = hard.filter(c => c.who === 'you');
    worst[name] = { you: mine.length ? mine[0].depth : 0, cases: hard.length, deepest: hard.length ? hard[0].depth : 0, near: R && R.near ? R.near.gap : null, pose: at, guardYou: R && R.guard ? Object.entries(R.guard).filter(([k]) => /^you /.test(k)).reduce((t, [, n]) => t + n, 0) : 0 };
    for (const e of errs) fails.push(`${name}: ${e}`);
    // the still: the worst pose where there was one, else straight overhead at the nearest, at the full size
    const v = at || { yaw: s.h, pitch: 1.35, dist: 2.5 };
    await p.setViewportSize({ width: w, height: h });
    await pose(s, v.yaw, v.pitch, v.dist, true); await frames(6); await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}/${name}-${w}x${h}.png` });
    await p.setViewportSize({ width: sw, height: sh }); await frames(3);
  }
  console.log('forced cases:', JSON.stringify(worst));
  for (const e of errors) fails.push(e);
  await br.close();
  if (fails.length) { console.log(`FAIL\n${fails.join('\n')}`); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
