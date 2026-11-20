// The story's guide led along each frame's way with a player following him, and the marks checked against him. Every
// quarter second of the walk it measures:
//   - his feet against what is drawn under them: a ray down onto the scene's solid surfaces (paving, steps, a deck),
//     not the walking grid; more than FLOAT_M above it or SINK_M into it is a fault (he stood on his ring in the air
//     over the stair well of the Shibuchika entrance by Hachiko, where the paving is not drawn);
//   - his room either side, across the way he goes (route.js ways.room: a wall, a drop, a well, a carriageway, a post):
//     where the way is wider than WIDE_M and he runs nearer than EDGE_M to one side for more than RUN_M, a fault (a
//     guide leads down the middle of a footway, not along its hoarding);
//   - and the same for the way planned (ways.walk, the line he follows), every metre;
//   (neither within MOUTH_M of where the way goes out onto a crossing or comes off one: there it steps over the kerb's line
//   on its way, and the kerb is beside it for a pace or two however it is laid, issue 63)
//   - the mark (story.js markTick), with the signs out as for a player who is lost, the view turned four ways: what it
//     points at must be on the way and reachable from the player in a straight line (the way's next turn, never the
//     goal across a block), and its metres the way's, not the crow's.
// Stills behind the player at the start of each way and when he is halfway. Exits 1 on any fault.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/guide_way.js out_dir [WxH]       (LEADS=f4,f6: only those)
const { chromium } = require('playwright');
const { logger: browserLog, watch: watchPage } = require('./browser_watch'); // (what the browser says of its GPU, in the log: issue 49)
const fs = require('fs');
const [,, out = '/tmp/guide-way', size = '1440x900'] = process.argv;
// (RUN_M for the way planned; DOG_RUN_M for him, who steps round the people waiting at a kerb and the player he passes)
const FLOAT_M = 0.06, SINK_M = 0.08, WIDE_M = 3.2, EDGE_M = 0.8, RUN_M = 1.5, DOG_RUN_M = 2.5, MOUTH_M = 2.5;
// each frame's lead: from where the player stands when it is given to whom or where the story sends them
// (f4 is the frame as the story gives it: from where the page leaves you at its start; the others from the data)
const LEADS = [
  { name: 'f2-kerb-to-shun', from: [362.3, -988.6], to: [342.1, -978.4] },
  { name: 'f3-centergai-to-hachiko', from: [342.1, -978.4], to: [374.79, -1046.45] },
  { name: 'f6-lift-to-tanaka', from: [521.87, -1074.06], to: [378.79, -1030.7] },
  { name: 'f7-hachiko-to-kerb', from: [377.0, -1013.2], to: [359.4, -983.0] },
  // (last: it ends at Yuna, and the story starts her talk and calls him to heel)
  { name: 'f4-hachiko-to-lift', live: 3 },
].filter(l => !process.env.LEADS || process.env.LEADS.split(',').some(k => l.name.startsWith(k)));
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args, logger: browserLog() });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  watchPage(p);
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  // DRAW=n: one frame in n drawn, the others run the game without their draw calls (as tools/story_play.js: on a software
  // renderer the game's clock runs at its frames' pace, and a lead of 200 m took ten minutes); stills are drawn whole
  const DRAW = +(process.env.DRAW ?? (process.env.GPU === 'metal' ? 0 : 20));
  if (DRAW > 1) await p.addInitScript(n => {
    const P = WebGL2RenderingContext.prototype, raf = window.requestAnimationFrame.bind(window), D = window.__draw = { all: false, on: true, frames: 0 };
    window.requestAnimationFrame = fn => raf(t => { D.on = D.all || D.frames++ % n === 0; fn(t); D.on = true; });
    for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'blitFramebuffer']) { const f = P[k]; P[k] = function (...a) { if (D.on) return f.apply(this, a); }; }
  }, DRAW);
  // (a still is for looking at, not a check: on a software renderer a whole frame drawn mid-lead took over Playwright's
  // 30 s, and the timeout ended the run; it is given longer, and one that still fails is reported, not fatal)
  const shoot = async path => {
    try {
      if (DRAW > 1) await p.evaluate(() => new Promise(r => { window.__draw.all = true; const t = setTimeout(r, 60000); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); }));
      await p.screenshot({ path, timeout: 180000 });
    } catch (e) { console.log('still missed:', path, String(e).split('\n')[0]); }
    finally { if (DRAW > 1) await p.evaluate(() => { window.__draw.all = false; }).catch(() => {}); }
  };
  // (as a case left at frame 4 and opened again: the dog is met, and the frame's goal is the lift)
  await p.addInitScript(() => { try { localStorage.setItem('oe-story-late', JSON.stringify({ fi: 3, left: 4, prints: [0, 1, 2].map(i => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.evaluate(() => document.getElementById('gt-play').click());
  const t0 = Date.now();
  let live = null;
  while (Date.now() - t0 < 1200000) {
    const s = await p.evaluate(() => { const st = window.__game.story.state, d = document.getElementById('gd'), pl = window.__game.player; return { dog: !!(st.dog && st.dog.ready), target: st.target, via: st.via, beat: st.beat, fi: st.fi, dlg: d && !d.hidden, at: [pl.x, pl.y, pl.z], ready: window.__game.ways.ready && (!window.__game.hero || !window.__game.hero() || window.__game.hero().levels.every(L => L.state === 'ready' || L.state === 'idle')) }; });
    // (a case opened again at frame 4 has not met him in this sitting: he is made and met as the story's hint makes him)
    if (!s.dog && s.target && s.ready && s.beat === 'meet') await p.evaluate(() => { const g = window.__game, st = g.story.state; if (st.dog) return; const d = g.makeGuide(st.ep.guide); if (d) { d.place(g.player.x + 1.2, g.player.y + 1.2, 0); d.met(); st.dog = d; } });
    if (s.dog && s.target && s.ready && s.beat === 'meet') { live = s; break; }
    if (process.env.DEBUG && Math.round((Date.now() - t0) / 500) % 40 === 0) console.log('waiting', JSON.stringify(s), await p.evaluate(() => { const st = window.__game.story.state; return JSON.stringify({ phase: st.phase, made: !!st.dog, dogReady: st.dog && st.dog.ready, dogState: st.dog && st.dog.state, ways: window.__game.ways.ready, mg: typeof window.__game.makeGuide, ch: [...document.querySelectorAll('#gd-choices button')].map(x => x.textContent) }); }));
    if (s.dlg) await p.evaluate(() => document.getElementById('gd').click());
    await p.waitForTimeout(500);
  }
  if (!live) { console.log('FAIL: frame 4 never gave its lead'); await b.close(); process.exit(1); }
  console.log('frame 4:', JSON.stringify({ fi: live.fi, at: live.at.map(v => +v.toFixed(2)), target: live.target.map(v => +v.toFixed(2)), via: live.via }));
  await p.waitForTimeout(3000);
  await shoot(`${out}/f4-start-as-given.png`);
  let fails = 0;
  for (const L of LEADS) {
    const lead = L.live ? { name: L.name, from: live.at, to: live.target, live: true } : L;
    if (L.live) await p.evaluate(({ at, target }) => { const g = window.__game, st = g.story.state, pl = g.player; pl.x = at[0]; pl.y = at[1]; pl.z = at[2]; st.target = target; const d = st.dog, f = d.free(pl.x + 1.2, pl.y + 1.2, 2) || [pl.x, pl.y]; d.place(f[0], f[1], 0); d.met(); }, live);
    // (no hero level half come: a level loading is not drawn yet, and the ground under him would read as the game's own; a
    // second level, frame 5's place, comes as the way nears it)
    await p.evaluate(L => new Promise(ok => { const g = window.__game, t0 = Date.now(); const f = () => (!g.hero || g.hero().levels.every(q => q.state !== 'loading') || Date.now() - t0 > 900000 ? ok() : setTimeout(f, 1000)); f(); }), L.live ? {} : L);
    let r = null;
    const run = p.evaluate(({ L, FLOAT_M, SINK_M, WIDE_M, EDGE_M, RUN_M, DOG_RUN_M, MOUTH_M }) => new Promise(async done => {
      // (the story held off its own beat while a way it is not on is led: passing Yuna on the way to Tanaka began her talk,
      // and the story moved on under the check; the live lead has it back)
      { const st0 = window.__game.story.state; if (!L.live) { st0.beat = 'check'; } else st0.beat = 'meet'; }
      const g = window.__game, st = g.story.state, dog = st.dog, pl = g.player, nav = g.nav, ways = g.ways, THREE = window.THREE;
      if (!L.live) {
        pl.x = L.from[0]; pl.y = L.from[1]; const f = nav.floorAt(pl.x, pl.y, (L.from[2] ?? nav.terrain(pl.x, pl.y)) + 1); pl.z = f ? f.z : pl.z;
        const sp = nav.floorAt(L.to[0], L.to[1], (L.to[2] ?? nav.terrain(L.to[0], L.to[1])) + 1);
        st.target = [L.to[0], L.to[1], (sp ? sp.z : 0) + 1.2, sp ? sp.z : 0]; // (as story.js spot() makes it)
        // (a place to walk to, as story.js aimAt gives one: the live lead's kind was left on it, someone to talk to, and the
        // mark read "Talk" with the metres to whoever the last lead ended at, issue 63)
        st.kind = 'go'; document.getElementById('g-story-mark').dataset.kind = 'go';
        const free = dog.free(pl.x + 1.5 * Math.sin(pl.h || 0), pl.y + 1.5 * Math.cos(pl.h || 0), 2) || [pl.x, pl.y];
        dog.place(free[0], free[1], 0); dog.met();
      }
      const to = st.target;
      // the way as the dog plans it from where he is, measured every metre (each stretch's own level)
      const way = ways.walk({ x: dog.x, y: dog.y, z: dog.z }, { x: to[0], y: to[1], z: to[3] });
      const wayBad = [], mouths = [], nearMouth = (x, y) => mouths.some(q => Math.hypot(q[0] - x, q[1] - y) < MOUTH_M);
      if (way) {
        const P = way.pts; let run = 0, len = 0;
        // (where it is out on a crossing, first: the kerbs it steps over going on and coming off)
        for (let i = 1; i < P.length; i++) { if (P[i][3]) continue; const [ax, ay, az] = P[i - 1], [bx, by, bz] = P[i], d = Math.hypot(bx - ax, by - ay), m = Math.max(1, Math.round(d * 2)), nx = -(by - ay) / (d || 1), ny = (bx - ax) / (d || 1); for (let k = 0; k <= m; k++) { const x = ax + (bx - ax) * k / m, y = ay + (by - ay) * k / m; if (ways.crossing(x, y, az + (bz - az) * k / m, nx, ny)) mouths.push([x, y]); } }
        for (let i = 1; i < P.length; i++) {
          if (P[i][3]) continue;
          const [ax, ay, az] = P[i - 1], [bx, by, bz] = P[i], d = Math.hypot(bx - ax, by - ay), m = Math.max(1, Math.round(d));
          const nx = -(by - ay) / (d || 1), ny = (bx - ax) / (d || 1);
          for (let k = 0; k < m; k++) {
            const t = k / m, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t; len += d / m;
            if (len < 4 || way.len - len < 4 || nearMouth(x, y)) { run = 0; continue; } // (its ends are where the player and the goal are)
            const [l, rr] = ways.room(x, y, z, nx, ny);
            if (l + rr > WIDE_M && Math.min(l, rr) < EDGE_M) { run += d / m; if (run > RUN_M && wayBad.length < 12) wayBad.push([+x.toFixed(1), +y.toFixed(1), +l.toFixed(2), +rr.toFixed(2)]); } else run = 0;
          }
        }
      }
      // The signs, as they come back when the player is lost (story.js LOST_S): the view turned four ways from where the
      // lead begins, and each time the mark is read. What it points at (story.state.wayAim, or the goal itself where the
      // way runs straight to it) must be on the way (within 1.5 m of ways.walk's line), reachable from the player in a
      // straight line, and its metres the way's (within a tenth and 5 m), never the crow's across a block
      async function signs() {
        // (the way as the mark works it out: from where the player stands)
        const own = ways.walk({ x: pl.x, y: pl.y, z: pl.z }, { x: to[0], y: to[1], z: to[3] }), faults = [], P = own ? own.pts : null;
        if (!P) return ['no way'];
        st.lost = true; st.guided = false;
        const onWay = (x, y) => { let b = Infinity; for (let i = 1; i < P.length; i++) { const [ax, ay] = P[i - 1], [bx, by] = P[i], ux = bx - ax, uy = by - ay, k = Math.max(0, Math.min(1, ((x - ax) * ux + (y - ay) * uy) / (ux * ux + uy * uy || 1e-9))); b = Math.min(b, Math.hypot(ax + ux * k - x, ay + uy * k - y)); } return b; };
        const straight = (x, y) => { const d = Math.hypot(x - pl.x, y - pl.y), m = Math.ceil(d / 0.5); let z = pl.z; for (let i = 1; i < m; i++) { const w = nav.walk(pl.x + (x - pl.x) * i / m, pl.y + (y - pl.y) * i / m, z + 0.3, true); if (!w.ok) return false; z = w.z; } return true; };
        const plen = own.len;
        for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          if (g.cam) g.cam.yaw = (pl.h || 0) + yaw;
          st.lost = true; await new Promise(r => setTimeout(r, 1200)); // (the lens comes round, and the story's tick marks it)
          // (and the game has drawn at least one whole frame since: on a software renderer one frame can take longer than the
          // wait, and the mark read was still the last lead's, issue 63)
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          const mk = document.getElementById('g-story-mark'), txt = mk.querySelector('b').textContent, a = st.wayAim || st.target;
          const m = /([0-9]+) m/.exec(txt), metres = m ? +m[1] : null;
          const f = [];
          if (!mk.classList.contains('on')) f.push('no mark');
          if (st.wayAim && onWay(a[0], a[1]) > 2) f.push(`aim ${onWay(a[0], a[1]).toFixed(1)} m off the way`);
          if (!straight(a[0], a[1])) f.push('aim not reachable straight');
          if (metres != null && Math.abs(metres - plen) > Math.max(5, plen * 0.1)) f.push(`says ${metres} m, the way is ${plen.toFixed(0)} m`);
          if (f.length) faults.push(`${(yaw * 180 / Math.PI).toFixed(0)}: ${f.join(', ')} [${txt}]`);
        }
        st.lost = false; st.idle = 0; st.best = Infinity; if (g.cam) g.cam.yaw = pl.h || 0;
        return faults;
      }
      // what is drawn under his feet: the solid surfaces of the scene, by a ray down from his knee
      const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
      const solidMesh = m => {
        if (!m.isMesh || !m.visible) return false;
        for (let q = m; q; q = q.parent) { if (q === dog.root || q.visible === false) return false; }
        const mt = Array.isArray(m.material) ? m.material[0] : m.material;
        return !(mt && (mt.transparent && mt.opacity < 0.95 || mt.depthWrite === false || mt.visible === false));
      };
      // (each mesh's box in the scene once, and a ray tried only on those over him: the whole world's meshes, every quarter
      // second, held the page for seconds a time)
      // (and listed again when a hero level comes or goes on the way: a level fetched as the dog nears it, SKY's hall and its
      // forecourt on the way from Hachiko, was not in a list made at the start, and what he stood on read as the game's ground)
      let meshes = [], heroSeen = '';
      const listMeshes = () => { meshes = []; (g.world || g.scene).traverse(m => { if (m.isMesh && !m.isInstancedMesh && !m.isSkinnedMesh && m.geometry && m.geometry.attributes.position) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); m.updateMatrixWorld(); meshes.push({ m, b: m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld) }); } }); };
      const heroKey = () => (g.hero && g.hero() ? g.hero().state().map(q => q.id + q.state + q.shown).join() : '');
      listMeshes(); heroSeen = heroKey();
      const surface = (x, y, z) => {
        { const k = heroKey(); if (k !== heroSeen) { heroSeen = k; listMeshes(); } }
        o.set(x, z + 0.9, -y); ray.set(o, down); ray.far = 4;
        const over = meshes.filter(q => x >= q.b.min.x && x <= q.b.max.x && -y >= q.b.min.z && -y <= q.b.max.z && q.b.min.y <= z + 0.9 && q.b.max.y >= z - 3.1).map(q => q.m);
        // (and the hero levels' own meshes as they are now, whatever came or went since the list: they are small)
        const H = g.hero && g.hero(), hm = [];
        if (H && H.group) H.group.traverse(m => { if (m.isMesh && !over.includes(m)) hm.push(m); });
        const hits = ray.intersectObjects(over.concat(hm), false).filter(h => solidMesh(h.object)).sort((a, b) => a.distance - b.distance);
        return hits.length ? hits[0].point.y : null; // (the scene's y is the map's height: game.js W)
      };
      const arrows = await signs();
      dog.lead([to[0], to[1]], 2.2);
      const bad = [], side = []; let t = 0, run = 0, lastX = dog.x, lastY = dog.y, trail = [[dog.x, dog.y]], maxGap = 0, minGap = 0, was = performance.now();
      // a game frame at a time (the page's own: on a software renderer a frame is slow, and the dog moves a frame's step)
      const step = now => {
        const dt = Math.min(0.05, Math.max(0, (now - was) / 1000)); was = now; t += dt;
        // the player keeps to the dog's own trail, 2.5 m behind him, at a walker's pace
        if (Math.hypot(dog.x - trail[trail.length - 1][0], dog.y - trail[trail.length - 1][1]) > 0.4) trail.push([dog.x, dog.y]);
        let left = 0, k = trail.length - 1; for (; k > 0; k--) { left += Math.hypot(trail[k][0] - trail[k - 1][0], trail[k][1] - trail[k - 1][1]); if (left > 2.5) break; }
        const aim = trail[Math.max(0, k)], dx = aim[0] - pl.x, dy = aim[1] - pl.y, d = Math.hypot(dx, dy);
        if (d > 0.3 && pl.mode === 'foot') { const s = Math.min(2.4 * dt, d) / d, m = nav.slide(pl.x, pl.y, pl.z, dx * s, dy * s), wk = nav.walk(m.x, m.y, pl.z + 0.3, true); if (wk.ok) { pl.x = m.x; pl.y = m.y; pl.z = wk.z; } pl.h = Math.atan2(dx, dy); pl.speed = 2.4; if (g.cam) g.cam.yaw = pl.h; } else pl.speed = 0;
        // every half metre he goes: his feet against what is drawn, and his room either side
        const mv = Math.hypot(dog.x - lastX, dog.y - lastY);
        if (mv > 0.5 && pl.mode === 'foot') {
          const sz = surface(dog.x, dog.y, dog.z), gap = sz == null ? null : dog.z - sz;
          if (gap != null) { maxGap = Math.max(maxGap, gap); minGap = Math.min(minGap, gap); }
          if (gap == null || gap > FLOAT_M || gap < -SINK_M) bad.push([+dog.x.toFixed(2), +dog.y.toFixed(2), +dog.z.toFixed(2), gap == null ? 'nothing drawn' : +gap.toFixed(3), (nav.floorAt(dog.x, dog.y, dog.z + 0.5) || {}).kind]);
          const nx = -(dog.y - lastY) / mv, ny = (dog.x - lastX) / mv, [l, rr] = ways.room(dog.x, dog.y, dog.z, nx, ny);
          if (ways.crossing(dog.x, dog.y, dog.z, nx, ny)) mouths.push([dog.x, dog.y]);
          if (nearMouth(dog.x, dog.y)) run = 0;
          else if (l + rr > WIDE_M && Math.min(l, rr) < EDGE_M) { run += mv; if (run > DOG_RUN_M && side.length < 12) side.push([+dog.x.toFixed(1), +dog.y.toFixed(1), +l.toFixed(2), +rr.toFixed(2)]); } else run = 0;
          lastX = dog.x; lastY = dog.y;
        } else if (mv > 0.5) { lastX = dog.x; lastY = dog.y; }
        if (dog.state === 'sit' || t > 240) return done({ t: +t.toFixed(1), state: dog.state, at: [+dog.x.toFixed(2), +dog.y.toFixed(2), +dog.z.toFixed(2)], left: +Math.hypot(dog.x - to[0], dog.y - to[1]).toFixed(2), wayLen: way ? +way.len.toFixed(1) : null, maxGap: +maxGap.toFixed(3), minGap: +minGap.toFixed(3), float: bad.slice(0, 8), nfloat: bad.length, edge: side, wayEdge: wayBad, arrows });
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }), { L: lead, FLOAT_M, SINK_M, WIDE_M, EDGE_M, RUN_M, DOG_RUN_M, MOUTH_M }).then(v => { r = v; }, e => { r = { error: String(e).slice(0, 300) }; });
    // stills behind the player as he leads: soon after he sets off, and further on
    const w0 = Date.now(); let shot = 0;
    while (!r) {
      await p.waitForTimeout(1000);
      const s = (Date.now() - w0) / 1000;
      if ((shot === 0 && s > 15) || (shot === 1 && s > 45)) await shoot(`${out}/${lead.name}-${++shot}.png`);
    }
    await run;
    const ok = !r.error && !r.nfloat && !r.edge.length && !r.wayEdge.length && !r.arrows.length && r.state === 'sit';
    if (!ok) fails++;
    console.log(ok ? 'ok  ' : 'FAIL', lead.name, JSON.stringify(r));
    await shoot(`${out}/${lead.name}-end.png`);
  }
  console.log(`page errors: ${errors.length}`);
  await b.close();
  process.exit(fails || errors.length ? 1 : 0);
})();
