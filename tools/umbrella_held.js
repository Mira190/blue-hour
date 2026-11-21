// An umbrella is held (issue 165). The owner's stills, 21 November: the walk at 21:00 in the rain, the phone's
// photograph mode at the kerb; the people waiting under umbrellas stood with their arms at their sides, the shaft came
// down through a shoulder or a chest, no hand was on the handle, and where they stood close the canopies ran through
// one another and through heads. An umbrella's place is its hand's (people.js umbHold, holdOf), and people under
// umbrellas take an umbrella's room (actors.js umbRoom).
//
// measure(page, { within, label }) asks the page for everyone of the crowd drawn within `within` metres of the lens
// (people.js umbrellaReport: a near person's from the bones as posed, a far copy's from the matrices it was drawn with)
// and holds each one under an open umbrella to:
//   - the handle within a fist's width (FIST) of the holding hand's bone;
//   - the shaft outside the capsule of the trunk and the ball of the head, their own;
//   - no canopy's rim inside another's canopy by more than a rim's width (RIM), nor a head inside a canopy.
// It returns { n, bad, lines }: how many umbrellas it measured, and what fails, each with its place on the map.
// tools/story_play.js calls it in frame 7's rain and tools/walk_play.js in the walk's rain.
//
// Run by itself it takes the stills of the issue: at frame 7's kerb (17:53) and at the kerb of the report (21:00), in
// the rain, from the walker's camera for five seconds of the game (a still each second, t0 to t5, the lights changing
// and the crowd walking), then the photograph mode and a close lens with the world held; it measures at every still
// and fails (exit 1) on a page error or on anything measured out of place.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/umbrella_held.js out_dir [WxH, default 1440x900]     (ONLY=f7-kerb | walk-21; TIER; PORT)
// The stills run against a page from before the change too (PORT of a server of that tree): it has no report, and
// the measurements are left out.
const FIST = 0.11, RIM = 0.06, HEAD_IN = 0.015;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k], len = a => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// the least distance between two segments (p1 q1, p2 q2), sampled finely: these are a shaft and a spine, short
function segSeg(p1, q1, p2, q2) {
  let best = Infinity;
  const d2 = sub(q2, p2), l2 = dot(d2, d2) || 1e-9;
  for (let k = 0; k <= 24; k++) {
    const a = add(p1, sub(q1, p1), k / 24), t = Math.max(0, Math.min(1, dot(sub(a, p2), d2) / l2));
    best = Math.min(best, len(sub(a, add(p2, d2, t))));
  }
  return best;
}
// how deep a point is inside a canopy's solid (the cone from its rim's plane to its skin), m; 0 and less: outside
function inCanopy(pt, C) {
  const v = sub(pt, C.c), t = dot(v, C.n), rho = len(add(v, C.n, -t));
  if (t <= -C.h / 2 || t >= C.h / 2) return 0;
  const skin = (C.r * (C.h / 2 - t) / C.h - rho) * C.h / Math.hypot(C.h, C.r);
  return Math.max(0, Math.min(t + C.h / 2, skin));
}
// points of a canopy's skin: its tip, and rings out to its rim
function skinPoints(C, rings = 5, n = 16) {
  const u0 = Math.abs(C.n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], a = cross(C.n, u0), la = len(a), u = [a[0] / la, a[1] / la, a[2] / la], w = cross(C.n, u), out = [add(C.c, C.n, C.h / 2)];
  for (let j = 1; j <= rings; j++) for (let k = 0; k < n; k++) {
    const th = (k + j / 2) / n * 2 * Math.PI, f = j / rings;
    out.push(add(add(add(C.c, C.n, C.h / 2 - C.h * f), u, Math.cos(th) * C.r * f), w, Math.sin(th) * C.r * f));
  }
  return out;
}
// How far canopy A's rim is inside canopy B, m: 0 when their skins do not cross (apart, or one riding clear over the
// other), else how far the two rims overlap in B's plan. The skins cross when A has skin on both sides of B's, over B
// (EPS: a skin's own thickness and the measure's)
function rimInside(A, B) {
  const EPS = 0.012;
  let over = false, under = false;
  for (const pt of skinPoints(A)) {
    const v = sub(pt, B.c), t = dot(v, B.n), rho = len(add(v, B.n, -t));
    if (rho > B.r) continue;
    const s = t - (B.h / 2 - B.h * rho / B.r);
    if (s > EPS) over = true; else if (s < -EPS && t > -B.h / 2 - 0.25) under = true; // (far below it is under an umbrella, not in one)
  }
  if (!(over && under)) return 0;
  const v = sub(A.c, B.c), t = dot(v, B.n);
  return Math.max(0, A.r + B.r - len(add(v, B.n, -t)));
}
function judge(rows, { held = false } = {}) {
  const who = r => `#${r.i} ${r.character} (${r.near ? 'near' : 'far copy'}, ${r.wait ? 'waiting' : r.moving ? 'walking' : 'standing'}) at ${r.x}, ${r.y}, ${r.d} m from the lens`;
  const umb = rows.filter(r => r.umb && r.up >= 1), bad = [];
  let worstHand = 0, worstShaft = Infinity, worstRim = 0;
  for (const r of umb) {
    const dh = len(sub(r.handle, r.hand));
    worstHand = Math.max(worstHand, dh);
    if (dh > FIST) bad.push(`the handle ${dh.toFixed(2)} m from the holding hand: ${who(r)}`);
    if (!r.held) bad.push(`no arm holds it up: ${who(r)}`);
    const trunk = segSeg(r.shaft[0], r.shaft[1], r.torso.a, r.torso.b) - r.torso.r, head = segSeg(r.shaft[0], r.shaft[1], r.head.c, r.head.c) - r.head.r;
    worstShaft = Math.min(worstShaft, trunk, head);
    if (trunk < 0) bad.push(`the shaft ${(-trunk).toFixed(2)} m inside the trunk: ${who(r)}`);
    if (head < 0) bad.push(`the shaft ${(-head).toFixed(2)} m inside the head: ${who(r)}`);
  }
  for (const a of umb) for (const b of umb) {
    if (a === b || len(sub(a.canopy.c, b.canopy.c)) > a.canopy.r + b.canopy.r + 0.3) continue;
    if (held && (a.moving || b.moving)) continue;
    const deep = rimInside(a.canopy, b.canopy);
    worstRim = Math.max(worstRim, deep);
    if (deep > RIM) bad.push(`a rim ${deep.toFixed(2)} m inside another canopy: ${who(a)}, in that of ${who(b)}`);
  }
  for (const h of rows) for (const b of umb) {
    if (len(sub(h.head.c, b.canopy.c)) > b.canopy.r + 0.4) continue;
    if (held && (h.moving || b.moving)) continue;
    let deep = 0;
    for (const o of [[0, 1, 0], [0.7, 0.7, 0], [-0.7, 0.7, 0], [0, 0.7, 0.7], [0, 0.7, -0.7], [0, 0, 0]]) deep = Math.max(deep, inCanopy(add(h.head.c, o, h.head.r), b.canopy));
    if (deep > HEAD_IN) bad.push(`a head ${deep.toFixed(2)} m inside ${h === b ? 'its own' : 'a'} canopy: ${who(h)}${h === b ? '' : `, in that of ${who(b)}`}`);
  }
  return { n: umb.length, near: umb.filter(r => r.near).length, people: rows.length, bad, worstHand, worstShaft, worstRim };
}
// held: the canopies and heads of those walking are left out (pressed through a crossing they lean and brush; the
// hand and the shaft are held to for everyone)
async function measure(page, { within = 12, label = '', held = false } = {}) {
  const rows = await page.evaluate(w => { const g = window.__game, R = g && g.crowdDraw && g.crowdDraw(); return R && R.umbrellaReport ? R.umbrellaReport(w) : null; }, within);
  if (!rows) return { n: 0, bad: [], lines: [`${label}: the page has no umbrella report (a page from before issue 165)`], none: true };
  const j = judge(rows, { held });
  const head = `${label}: ${j.n} open umbrellas within ${within} m of the lens (${j.near} on near people, ${j.n - j.near} on far copies; ${j.people} people drawn): `
    + (j.n ? `the handle at most ${j.worstHand.toFixed(3)} m from the hand, the shaft at least ${j.worstShaft.toFixed(3)} m clear of its trunk and head, a rim at most ${j.worstRim.toFixed(3)} m inside another canopy` : 'nothing to measure');
  if (process.env.UMB_ROWS) for (const r of rows.filter(q => q.d < +process.env.UMB_ROWS)) console.log(`    #${r.i} ${r.character} ${r.near ? 'near' : 'far'} ${r.d} m up ${r.up}${r.umb ? ` hand ${r.hand} handle ${r.handle} top ${r.canopy.c} head ${r.head.c}` : ' no umbrella'}`);
  return { ...j, rows, lines: [head, ...j.bad.map(b => `  FAIL ${b}`)] };
}
module.exports = { measure, judge };

if (require.main === module) (async () => {
  const { chromium } = require('playwright');
  const { startPlay } = require('./start_play');
  const fs = require('fs');
  const [,, out = '/tmp/umbrella-held', size = '1440x900'] = process.argv;
  // [name, minutes of the day, where you stand, what you face]
  const CASES = [
    ['f7-kerb', 17 * 60 + 53, [377.0, -1013.2], [359.4, -983.0]],
    ['walk-21', 21 * 60, [357.6, -985.6], [345.6, -980.4]],
  ].filter(c => !process.env.ONLY || process.env.ONLY.split(',').includes(c[0]));
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log(`pageerror: ${String(e).slice(0, 300)}`); });
  p.on('console', m => { if (/shader|program/i.test(m.text()) && /error|fail/i.test(m.text())) { errors.push(m.text()); console.log(`${m.type()}: ${m.text().slice(0, 300)}`); } });
  fs.mkdirSync(out, { recursive: true });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0${process.env.QUERY || ''}#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 200 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); } if (g.cine && g.cine.active) g.cine.skip(); });
  let fail = 0;
  const report = [];
  const shot = async (name, label, held) => {
    await p.screenshot({ path: `${out}/${name}.png`, timeout: 180000 });
    const m = await measure(p, { label, held });
    for (const l of m.lines) console.log(l);
    fail += m.bad.length;
    report.push({ name, n: m.n, bad: m.bad });
  };
  for (const [name, min, at, to] of CASES) {
    await p.evaluate(async ([min, at, to]) => {
      const g = window.__game, pl = g.player, nav = g.nav;
      await new Promise(ok => { const t0 = Date.now(); const f = () => (!g.hero || g.hero().levels.every(q => q.state !== 'loading') || Date.now() - t0 > 300000 ? ok() : setTimeout(f, 1000)); f(); });
      if (g.photo && g.photo.on) g.photoMode(false);
      g.setClock(g.clock.y, 11, 21, min); g.clock.scale = 1; if (g.crowdAuto) g.crowdAuto(true);
      if (g.weather) g.weather.set('rain', { now: true });
      pl.x = at[0]; pl.y = at[1]; const f = nav.floorAt(pl.x, pl.y, nav.terrain(pl.x, pl.y) + 1); pl.z = f ? f.z : nav.terrain(pl.x, pl.y);
      pl.h = Math.atan2(to[0] - pl.x, to[1] - pl.y); pl.vz = 0; pl.ground = true; pl.mode = 'foot'; pl.speed = 0;
      Object.assign(g.cam, { mode: 'chase', yaw: pl.h, yawTo: null, pitchTo: null, distTo: 0, tilt: 0, snap: true, lastInput: -10, dist: 5.5, pitch: 0.17 });
    }, [min, at, to]);
    // the crowd round the place, the rain on it, and the cast's people come: twenty seconds of the game
    for (let k = 0; k < 20; k++) await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 30; i++) { g.player.speed = 0; if (g.cine && g.cine.active) g.cine.skip(); g.frame(1 / 30); } });
    // the walker's camera, five seconds of the game
    for (let t = 0; t <= (process.env.HANDS ? -1 : 5); t++) {
      if (t) await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 30; i++) { g.player.speed = 0; g.frame(1 / 30); } });
      await shot(`${name}-${size}-walk-t${t}`, `${name} ${size}, the walker's camera at ${t} s`, true);
    }
    // the photograph mode, the world held: from a pace off the kerb's crowd at eye height, then a close lens on whoever
    // stands nearest under an umbrella
    const views = await p.evaluate(() => {
      const g = window.__game, c = g.camera, P = g.crowd.P, R = g.crowdDraw(), near = [];
      for (let i = 0; i < Math.min(g.crowd.active, P.length); i++) {
        const q = P[i]; if (q.rx == null || !R.shows(i) || !(q.umbT >= 1) || (q.av ?? q.v ?? 0) > 0.15) continue;
        near.push({ i, x: q.rx, y: q.ry, z: q.rz, h: q.h, d: Math.hypot(q.rx - c.position.x, q.ry + c.position.z) });
      }
      near.sort((a, b) => a.d - b.d);
      return near.filter(q => q.d > 3).slice(0, 3);
    });
    if (!views.length) { console.log(`${name}: nobody stands under an umbrella near the lens`); fail++; continue; }
    await p.evaluate(() => window.__game.photoMode(true));
    await p.addStyleTag({ content: '#g-photo{visibility:hidden!important}' }); // (the picture, without the mode's panel over half of a phone's)
    const look = async (q, dist, pitch, fov, side) => p.evaluate(([q, dist, pitch, fov, side]) => {
      const g = window.__game;
      g.photo.focus.set(q.x, q.z + 1.35, -q.y); g.photo.anchor.copy(g.photo.focus);
      Object.assign(g.photo, { az: Math.PI - q.h + side, pitch, dist, fov, turn: false }); // (from in front of them, a little to one side)
      for (let i = 0; i < 4; i++) g.frame(1 / 30);
    }, [q, dist, pitch, fov, side]);
    // the hand on the handle, close, from either side and from in front: of the nearest near people under umbrellas
    // (HANDS=1: these alone)
    const hands = await p.evaluate(() => { const R = window.__game.crowdDraw(); return R.umbrellaReport ? R.umbrellaReport(14).filter(r => r.umb && r.near && r.up >= 1 && !r.moving).sort((a, b) => a.d - b.d).slice(0, 2).map(r => ({ i: r.i, hand: r.handle, h: window.__game.crowd.P[r.i].h })) : []; });
    // (HANDS=1 with FISTS, a JSON list of people.js UMB_FIST's numbers: each laid on the first of them, to be looked at side by side)
    const fists = process.env.HANDS && process.env.FISTS ? JSON.parse(process.env.FISTS) : [null];
    for (const [k, q] of hands.entries()) for (const [n, t] of fists.entries()) for (const [v, side, pitch] of [['front', 0, 0.12], ['half', 0.65, 0.12], ['left', 1.3, 0.12], ['under', 0.4, -0.55]]) {
      if (t && k) continue;
      await p.evaluate(([q, side, pitch, t]) => {
        const g = window.__game;
        if (t) g.crowdDraw().active.get(q.i).umbTune(t);
        g.photo.focus.set(q.hand[0], q.hand[1] + 0.03, q.hand[2]); g.photo.anchor.copy(g.photo.focus);
        Object.assign(g.photo, { az: Math.PI - q.h + side, pitch, dist: 0.8, fov: 24, fstop: 16, turn: false });
        for (let i = 0; i < 4; i++) g.frame(1 / 30);
      }, [q, side, pitch, t]);
      await p.screenshot({ path: `${out}/${name}-${size}-hand${k}${t ? `-fist${n}` : ''}-${v}.png`, timeout: 180000 });
    }
    await p.evaluate(() => { window.__game.photo.fstop = 2.8; });
    if (process.env.HANDS) { await p.evaluate(() => window.__game.photoMode(false)); continue; }
    await look(views[0], 4.2, 0.1, 50, 0.5); await shot(`${name}-${size}-photo`, `${name} ${size}, the photograph mode`, true);
    await look(views[0], 2.4, 0.06, 28, 0.75); await shot(`${name}-${size}-close`, `${name} ${size}, a close lens`, true);
    if (views[1]) { await look(views[1], 2.6, 0.02, 32, -0.6); await shot(`${name}-${size}-close2`, `${name} ${size}, a close lens on the next`, true); }
    await p.evaluate(() => window.__game.photoMode(false));
  }
  fs.writeFileSync(`${out}/umbrella_held-${size}.json`, JSON.stringify({ size, report, errors }, null, 1));
  console.log(errors.length || fail ? `FAIL ${errors.length} page errors, ${fail} umbrellas out of place` : 'ok   no page errors, every umbrella held');
  await b.close();
  process.exit(errors.length || fail ? 1 : 0);
})();
