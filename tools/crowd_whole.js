// Who is whole goes by what the eye resolves (issue 174). At the Scramble's kerb in the rain, from the walker's camera
// and then in the photograph mode (a pace off the kerb's crowd, and a close lens), every person of the crowd whose head
// stands in the frame is listed with the height of that head on the screen, in CSS pixels, and with how they are drawn:
// a whole skinned person or a far copy (crowd_cast.glb, a blurred face and a hand of a few facets).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/crowd_whole.js [out dir] [WxH, 1440x900]      (a width under 500: a phone, touch, the low tier)
//   HEAD=px: the head's height that must be whole (30); MID: the frame's middle, as a share of its half-width and
//   half-height (0.55,0.7); SECS: the walker's camera's held stills, one a second (4); TIER: the quality tier
// It fails when, at a held still of the walker's camera, a person whose head is over HEAD pixels in the frame's middle
// is drawn as a far copy, or when in the photograph mode or through the close lens anyone in the frame with a head over
// HEAD pixels is (the world is held there, the frame rate is not at stake). Prints each still's counts; the stills and
// a JSON of the readings go to the out dir, for tools/contact_sheet.py.
const MEASURE = ([HEAD, MX, MY]) => {
  const g = window.__game, cam = g.camera, R = g.crowdDraw(), P = g.crowd.P, H = innerHeight, V = new THREE.Vector3(), rows = [];
  cam.updateMatrixWorld();
  const proj = cam.projectionMatrix.elements[5], L = cam.position;
  for (let i = 0; i < Math.min(g.crowd.active, P.length); i++) {
    const q = P[i];
    if (!q.inPic || (q.line < 0 && !q.pz) || q.rx == null) continue;
    const crown = q.crown || 1.6, sit = q.mode === 'sit';
    V.set(q.rx, q.rz + crown * (sit ? 0.6 : 0.93), -q.ry);
    if (V.distanceTo(L) < 1.2) continue; // (within the lens's clearance: left out of the picture whole, game.js lensGuard)
    const depth = -V.clone().applyMatrix4(cam.matrixWorldInverse).z;
    if (depth < 0.3) continue;
    V.project(cam);
    if (Math.abs(V.x) > 1 || Math.abs(V.y) > 1) continue;
    const head = 0.14 * crown * H * Math.abs(proj) / 2 / depth, r = R.active.get(i), whole = !!(r && !r.cold && r.root.visible);
    const warming = !!(r && r.cold), wait = !warming && q.pickWait != null && q.pickWait >= (R.nearInfo().frame || 0) - 1; // (warming: made, its programs looked up off the frame; wait: its character not come)
    rows.push({ i, head: +head.toFixed(1), d: +depth.toFixed(2), mid: Math.abs(V.x) < MX && Math.abs(V.y) < MY, whole, cold: warming || wait, warming, wait });
  }
  const I = R.nearInfo ? R.nearInfo() : {};
  return { rows, nNear: I.nNear, active: I.active, want: I.want, unloaded: I.unloaded, capped: I.capped, big: I.big, fov: +cam.fov.toFixed(1), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
};
// the far copies that should not be: over HEAD (in play over a tenth more, a frame's lag and the pick's HOLD), in the
// frame's middle (strict: anywhere in the frame), not being warmed, and not past the pick's cap (more people over HEAD in
// view than a tier draws whole: the middle's go first, so only then may one be a copy). One waiting for their character
// is let off only while the cast may still be on its way (late: false); once it is due, waiting is a far copy like any
// other (issue 261: at the kerb on a desktop twenty of twenty-four such heads waited six minutes, and passed as waiting)
function judge(m, { HEAD = 30, strict = false, late = false } = {}) {
  if (!strict && m.big != null && m.big > m.nNear) return [];
  return m.rows.filter(r => !r.whole && !r.warming && (late || !r.wait) && (strict || r.mid) && r.head >= HEAD * (strict ? 1 : 1.1));
}
if (require.main === module) (async () => {
  const { chromium } = require('playwright');
  const { startPlay } = require('./start_play');
  const fs = require('fs');
  const [,, out = '/tmp/crowd-whole', size = '1440x900'] = process.argv;
  const HEAD = +(process.env.HEAD || 30), [MX, MY] = (process.env.MID || '0.55,0.7').split(',').map(Number), SECS = +(process.env.SECS ?? 4);
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log(`pageerror: ${String(e).slice(0, 300)}`); });
  fs.mkdirSync(out, { recursive: true });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0${process.env.QUERY || ''}#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 200 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); } if (g.cine && g.cine.active) g.cine.skip(); });
  const tag = phone ? 'phone' : 'desktop';
  let fail = 0;
  const report = [];
  // (strict: anyone in the frame over HEAD must be whole; else only those in the frame's middle)
  const shot = async (name, label, strict) => {
    await p.screenshot({ path: `${out}/${tag}-${name}.png`, timeout: 180000 });
    const m = await p.evaluate(MEASURE, [HEAD, MX, MY]);
    const big = m.rows.filter(r => r.head >= HEAD), copies = big.filter(r => !r.whole), bad = judge(m, { HEAD, strict, late: true }); // (late: the stills come after the cast's way in, below, which holds its own deadline)
    console.log(`${label}: ${m.rows.length} in the frame, ${big.length} with a head over ${HEAD} px (${big.filter(r => r.mid).length} in the middle), ${copies.length} of those far copies${copies.length ? ` (${copies.map(r => `${r.head} px at ${r.d} m${r.mid ? ', middle' : ''}${r.cold ? ', warming' : ''}`).join('; ')})` : ''}; whole drawn ${m.active}, the pick ${m.nNear}${m.big != null ? ` (${m.big} by size)` : ''}, waiting ${m.unloaded}, fov ${m.fov}, heap ${m.heapMB} MB`);
    if (bad.length) { fail++; console.log(`  FAIL ${bad.length} far ${bad.length > 1 ? 'copies' : 'copy'} with a head over ${HEAD} px ${strict ? 'in the frame' : "in the frame's middle"}`); }
    report.push({ name, label, ...m });
  };
  const CASES = [['kerb', 17 * 60 + 53, [377.0, -1013.2], [359.4, -983.0]]];
  for (const [name, min, at, to] of CASES) {
    await p.evaluate(async ([min, at, to]) => {
      const g = window.__game, pl = g.player, nav = g.nav;
      await new Promise(ok => { const t0 = Date.now(); const f = () => (!g.hero || g.hero().levels.every(q => q.state !== 'loading') || Date.now() - t0 > 300000 ? ok() : setTimeout(f, 1000)); f(); });
      g.setClock(g.clock.y, 11, 21, min); g.clock.scale = 1; if (g.crowdAuto) g.crowdAuto(true);
      if (g.weather) g.weather.set('rain', { now: true });
      pl.x = at[0]; pl.y = at[1]; const f = nav.floorAt(pl.x, pl.y, nav.terrain(pl.x, pl.y) + 1); pl.z = f ? f.z : nav.terrain(pl.x, pl.y);
      pl.h = Math.atan2(to[0] - pl.x, to[1] - pl.y); pl.vz = 0; pl.ground = true; pl.mode = 'foot'; pl.speed = 0;
      Object.assign(g.cam, { mode: 'chase', yaw: pl.h, yawTo: null, pitchTo: null, distTo: 0, tilt: 0, snap: true, lastInput: -10, dist: 5.5, pitch: 0.17 });
    }, [min, at, to]);
    // the crowd round the place, the rain on it, and the cast's people come: twenty seconds of the game
    for (let k = 0; k < 20; k++) await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 30; i++) { g.player.speed = 0; if (g.cine && g.cine.active) g.cine.skip(); g.frame(1 / 30); } });
    // the near cast's characters streamed in (the frames above run back to back, with no time for a load between them):
    // up to two minutes of the page's own time, frames with the page's tasks between them, until none is waited for
    const t0 = Date.now();
    let st0 = 0;
    for (let k = 0; k < 240; k++) {
      const st = st0 = await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 3; i++) { g.player.speed = 0; g.frame(1 / 30); } const R = g.crowdDraw(), I = R.nearInfo(); let cold = 0; for (const r of R.active.values()) if (r.cold) cold++; return I.unloaded + cold; });
      if (!st) break;
      await p.waitForTimeout(500);
    }
    // (and the cast is due within CAST_SLOTS of the upload queue's slots since the page opened (world.js upload: one a
    // frame, a few pictures each): a measure of the pace and order the cast streams in that a software renderer's slow
    // frames do not change. On a display at 60 Hz a hundred slots are under two seconds. Before issue 261 the queue sent
    // a picture a slot, in the order the cast was asked for, and the desktop's twenty characters of five pictures each
    // took 134 slots and more behind the hero level's; with the texel budget and the pick's order, 57. A phone's eight, 15)
    const slots = await p.evaluate(() => (window.OEWorld && OEWorld.uploadStats ? OEWorld.uploadStats().slots : null)), CAST_SLOTS = +(process.env.CAST_SLOTS || 100), late = st0 > 0;
    console.log(`${name} ${size}: the near cast in after ${((Date.now() - t0) / 1000).toFixed(0)} s${late ? `, ${st0} still waited for or warming` : ''}, ${slots ?? '?'} slots of the upload queue since the page opened`);
    if (late) { fail++; console.log(`  FAIL the near cast not in after ${((Date.now() - t0) / 1000).toFixed(0)} s: ${st0} near people still far copies (people.js lib.require, world.js upload)`); }
    if (slots != null && slots > CAST_SLOTS) { fail++; console.log(`  FAIL the near cast took ${slots} slots of the upload queue (over ${CAST_SLOTS}): the cast streams too slowly or out of the pick's order (world.js upload, people.js lib.urge)`); }
    // where each character's time went (people.js lib.stream, ms of the page's clock): its file, its parse and hair, the
    // wait for its warm-up, the warm-up (its pictures up, a frame each, and its programs)
    const sm = await p.evaluate(() => { const g = window.__game, S = g.peopleLib && g.peopleLib.stream; if (!S) return null; const up = window.OEWorld && OEWorld.uploadStats ? OEWorld.uploadStats() : null; return { S, up }; });
    if (sm) {
      const rows = Object.entries(sm.S).filter(([, T]) => T.ask != null).sort((a, b) => a[1].ask - b[1].ask), a0 = rows.length ? rows[0][1].ask : 0, s = (x, y) => (x != null && y != null ? ((y - x) / 1000).toFixed(1) : '-');
      console.log(`${name} ${size}: the cast's way in, s (asked at / file / parse+hair / to the warm-up / warm-up / in at):`);
      for (const [n, T] of rows) console.log(`  ${n.padEnd(34)} ${s(a0, T.ask).padStart(6)} ${s(T.ask, T.glb).padStart(6)} ${s(T.glb, T.hair).padStart(6)} ${s(T.hair, T.warm0).padStart(6)} ${s(T.warm0, T.done).padStart(6)} ${s(a0, T.done).padStart(6)}`);
      if (sm.up) console.log(`  the upload queue: ${JSON.stringify(sm.up)}`);
    }
    if (process.env.CAST_ONLY) { await b.close(); process.exit(0); } // (CAST_ONLY=1: only how the cast comes in, to measure)
    // the swap in step (STRIDE=0 leaves it out): the walking whole people sent back to their far copies for a few frames
    // and taken over again, and at that frame the foot forward on the whole person (its feet in its own space) set beside
    // the foot the far copy had forward (its shader's sin(ph)): the same foot, or the walk hitches at the swap
    if (process.env.STRIDE !== '0') {
      const st = await p.evaluate(() => {
        const g = window.__game, R = g.crowdDraw(), P = g.crowd.P, F = new THREE.Vector3(), G = new THREE.Vector3(), out = [];
        const ids = [...R.active.keys()].filter(i => P[i].moving && R.active.get(i).root.visible);
        R.nearCap = 0; for (let k = 0; k < 6; k++) g.frame(1 / 30);
        R.nearCap = null; g.frame(1 / 30);
        for (const i of ids) {
          const q = P[i], r = R.active.get(i); if (!r || r.cold || !q.moving || q.animF == null) continue;
          const a = r.mixer._actions.find(x => x.getClip().leftAt != null && x.isRunning()); if (!a) continue;
          let fl = null, fr = null; r.model.traverse(o => { if (o.isBone && /Foot\.?L$|FootL$|L_?Foot$/i.test(o.name)) fl = fl || o; if (o.isBone && /Foot\.?R$|FootR$|R_?Foot$/i.test(o.name)) fr = fr || o; });
          if (!fl || !fr) continue;
          r.model.updateMatrixWorld(true); fl.getWorldPosition(F); fr.getWorldPosition(G); r.model.worldToLocal(F); r.model.worldToLocal(G);
          const fwd = a.getClip().fwd, rig = (F.z - G.z) * fwd, copy = -Math.sin(q.animO + q.animF * g.t()) * fwd; // (each: the left foot forward, +)
          out.push({ rig: +rig.toFixed(2), copy: +copy.toFixed(2) });
        }
        const clear = out.filter(o => Math.abs(o.copy) > 0.4 && Math.abs(o.rig) > 0.05);
        return { n: out.length, clear: clear.length, same: clear.filter(o => Math.sign(o.rig) === Math.sign(o.copy)).length, out: out.slice(0, 12) };
      });
      console.log(`${name} ${size}: the swap in step: ${st.same} of ${st.clear} walkers taken over mid-stride had the far copy's foot forward (${st.n} taken over) ${JSON.stringify(st.out)}`);
      if (st.clear >= 3 && st.same < 0.75 * st.clear) { fail++; console.log(`  FAIL the walk out of step at the swap: ${st.clear - st.same} of ${st.clear} with the other foot forward (people.js walkAt)`); }
    }
    // the kerb's crowd gathered (who waits there goes with the lights: a run that came at the green had nobody near the
    // lens and one at the red thirty): up to three minutes of the game until twelve wait within 15 m, then the walker put
    // among them, IN m (1.2) short of their middle, facing it, the chase camera behind; and the cast let in again
    const gathered = await p.evaluate(async IN => {
      const g = window.__game, pl = g.player, nav = g.nav, P = g.crowd.P;
      const waiting = () => { const w = []; for (let i = 0; i < g.crowd.active; i++) { const q = P[i]; if (q.pz && q.ph === 'wait' && Math.hypot(q.x - pl.x, q.y - pl.y) < 15) w.push(q); } return w; };
      let w = waiting(), k = 0;
      for (; k < 180 * 30 && w.length < 12; k++) { pl.speed = 0; g.frame(1 / 30); if (k % 30 === 29) { w = waiting(); await new Promise(r => setTimeout(r, 10)); } }
      if (w.length < 4) return { n: w.length, t: k / 30 };
      const cx = w.reduce((a, q) => a + q.x, 0) / w.length, cy = w.reduce((a, q) => a + q.y, 0) / w.length, h = Math.atan2(cx - pl.x, cy - pl.y);
      pl.x = cx - IN * Math.sin(h); pl.y = cy - IN * Math.cos(h); const f = nav.floorAt(pl.x, pl.y, nav.terrain(pl.x, pl.y) + 1); pl.z = f ? f.z : nav.terrain(pl.x, pl.y);
      pl.h = h; Object.assign(g.cam, { yaw: h, yawTo: null, pitchTo: null, snap: true, lastInput: -10 });
      for (let i = 0; i < 15; i++) { pl.speed = 0; g.frame(1 / 30); }
      return { n: w.length, t: k / 30 };
    }, +(process.env.IN || 1.2));
    console.log(`${name} ${size}: ${gathered.n} waiting within 15 m after ${gathered.t.toFixed(0)} s of the game`);
    for (let k = 0; k < 120; k++) {
      const st = await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 3; i++) { g.player.speed = 0; g.frame(1 / 30); } const R = g.crowdDraw(), I = R.nearInfo(); let cold = 0; for (const r of R.active.values()) if (r.cold) cold++; return I.unloaded + cold; });
      if (!st) break;
      await p.waitForTimeout(500);
    }
    // the walker's camera, a still each second of the game, and between them the frames let go (a new person is warmed
    // off the frame, people.js begin: the warm's promises settle between the page's tasks)
    for (let t = 0; t <= SECS; t++) {
      if (t) for (let k = 0; k < 3; k++) { await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 10; i++) { g.player.speed = 0; g.frame(1 / 30); } }); await p.waitForTimeout(50); }
      await shot(`${name}-walk-t${t}`, `${name} ${size}, the walker's camera at ${t} s`, false);
    }
    // the photograph mode, the world held: from a pace off the kerb's crowd at eye height, then a close lens on whoever
    // stands nearest under an umbrella (or nearest)
    const views = await p.evaluate(() => {
      const g = window.__game, c = g.camera, P = g.crowd.P, R = g.crowdDraw(), near = [];
      for (let i = 0; i < Math.min(g.crowd.active, P.length); i++) {
        const q = P[i]; if (q.rx == null || !R.shows(i) || (q.av ?? q.v ?? 0) > 0.15) continue;
        near.push({ i, x: q.rx, y: q.ry, z: q.rz, h: q.h, d: Math.hypot(q.rx - c.position.x, q.ry + c.position.z), u: q.umbT >= 1 });
      }
      near.sort((a, b) => (b.u - a.u) || a.d - b.d);
      return near.filter(q => q.d > 3).slice(0, 2);
    });
    if (!views.length) { console.log(`${name}: nobody stands near the lens`); fail++; continue; }
    await p.evaluate(() => window.__game.photoMode(true));
    await p.addStyleTag({ content: '#g-photo{visibility:hidden!important}' }); // (the picture, without the mode's panel over half of a phone's)
    const look = async (q, dist, pitch, fov, side) => p.evaluate(async ([q, dist, pitch, fov, side]) => {
      const g = window.__game;
      g.photo.focus.set(q.x, q.z + 1.35, -q.y); g.photo.anchor.copy(g.photo.focus);
      Object.assign(g.photo, { az: Math.PI - q.h + side, pitch, dist, fov, turn: false, fstop: 2.8 }); // (from in front of them, a little to one side)
      // (frames with the page's tasks between them: a still makes four of the crowd new a frame, warmed off the frame)
      // and until the pick has settled (none waited for, none warming, none held to a later frame), up to a minute
      let k = 0;
      for (; k < 400; k++) {
        g.frame(1 / 30); await new Promise(r => setTimeout(r, k < 16 ? 30 : 150));
        if (k < 16) continue;
        const R = g.crowdDraw(), I = R.nearInfo(); let cold = 0; for (const r of R.active.values()) if (r.cold) cold++;
        if (!I.unloaded && !I.capped && !cold) break;
      }
      return k;
    }, [q, dist, pitch, fov, side]);
    const settle = async (...a) => { const k = await look(...a); console.log(`  (the pick settled after ${k + 1} frames)`); };
    await settle(views[0], 4.2, 0.1, 50, 0.5); await shot(`${name}-photo`, `${name} ${size}, the photograph mode`, true);
    await settle(views[0], 2.4, 0.06, 28, 0.75); await shot(`${name}-close`, `${name} ${size}, a close lens`, true);
    if (views[1]) { await settle(views[1], 6, 0.04, 24, -0.4); await shot(`${name}-long`, `${name} ${size}, a long lens on the kerb`, true); }
    await p.evaluate(() => window.__game.photoMode(false));
  }
  fs.writeFileSync(`${out}/crowd_whole-${tag}.json`, JSON.stringify({ size, HEAD, report, errors }, null, 1));
  if (errors.length) fail++;
  console.log(fail ? `crowd_whole ${size}: FAIL at ${fail} still(s)` : `crowd_whole ${size}: every head over ${HEAD} px that had to be whole was`);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(`FAIL ${e.stack || e}`); process.exit(1); });
module.exports = { MEASURE, judge };
