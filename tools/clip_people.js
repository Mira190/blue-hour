// People against people, measured at the skin (issue 157). tools/clip_probe.js reads every frame of a play against
// ellipsoids fitted to each part of a body: quick enough for every frame, and 4 cm of its reading may be the fit. This
// looks closely at the few cases it leaves open, with the models skinned on the CPU as the GPU skins them: a point of one
// body is inside another when rays from it along the axes cross that body's triangles an odd number of times, and its
// depth is how far it is from the nearest of them.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/clip_people.js out_dir [WxH] [mode] [names]
// mode:
//   into   (names: the map's people, "Aoi,Shun") the player is walked straight into each from DIRS directions (8), W held
//          for fifty frames as tools/story_play.js walks into them: how near the middles came, how deep the player's hands
//          and forearms went into them and for how many frames. Then walked past each at a run on lines 0, 0.3 and 0.6 m
//          to one side: how far the player got in four seconds, beside a run with nobody in the way (held up, or not).
//          STILL=1: every frame drawn, and a still of the deepest frame of each approach from the side (slow).
//   look   (names: the map's people, the story's with STORY=n, or "you") each one's head, hair and jaw against their own
//          chest and shoulders through SECS seconds (5) of their clip: the deepest, for how many frames, and a still each
//          second from two sides, close. The same over the arms (hands and forearms in the trunk).
//   seats  the player at the wheel of their car and in the helicopter (the map without the story): the hands, forearms,
//          thighs and calves against the vehicle's own model by rays from the hips, the hips over the seat, the head under
//          the roof (tools/clip_probe.js's seat measure, which no play of the story runs: its flight shows no player), and
//          stills from outside and from the next seat.
// STORY=n: the story opened at frame n+1 instead of the map without it. TIER=low PHONE=1 with 390x844: a phone's page.
// Exits 1 on a hand more than DEEP (0.03 m) in someone for more than 2 frames, an arm more than 5 cm in someone run past,
// or a head more than DEEP in its own chest for more than a second. How far a run past someone gets is printed for a
// look beside the same run on main: head on, a body stops a body, so the distance alone fails nothing.
const { chromium } = require('playwright');
const fs = require('fs');
const probe = require('./clip_probe');
const { skip, whole } = require('./draw_skip');
const [,, out = '/tmp/clip-people', size = '1440x900', mode = 'into', names = 'Aoi,Shun'] = process.argv;
const DEEP = +process.env.DEEP || 0.03;

function pageSide() {
  const S = window.__skin = {};
  const MAIN = /(Pelvis|Spine2|Spine1|Spine|Neck|Head|Clavicle|UpperArm|Forearm|Hand|Thigh|Calf|Foot)$/;
  const cache = new WeakMap();
  const meshes = root => { const o = []; root.traverse(m => { if (!m.isSkinnedMesh || !m.geometry.attributes.skinIndex) return; for (let q = m; q && q !== root.parent; q = q.parent) if (!q.visible) return; o.push(m); }); return o; };
  // each vertex's part: the bone that carries it most, and up from it to the first of the body's main parts
  const parts = m => {
    let c = cache.get(m.geometry); if (c) return c;
    const g = m.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = g.attributes.position.count, bones = m.skeleton.bones;
    const of = bones.map(b => { for (let q = b; q && q.isBone; q = q.parent) if (MAIN.test(q.name)) return q.name.replace(/^Bip01_?/, '').replace(/_/g, ' ').trim(); return b.name; });
    c = new Array(n);
    for (let i = 0; i < n; i++) { let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } } c[i] = of[bi] || ''; }
    cache.set(m.geometry, c); return c;
  };
  // every vertex of a model in the world, as posed (morphs and bones, as the GPU has them)
  const skinned = root => {
    const T = window.THREE, v = new T.Vector3(); root.updateWorldMatrix(true, true);
    return meshes(root).map(m => { const n = m.geometry.attributes.position.count, P = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
      return { m, P, part: parts(m) }; });
  };
  const tris = (sk, re, not) => { const out = [];
    for (const { m, P, part } of sk) { const ix = m.geometry.index, n = ix ? ix.count : P.length / 3;
      for (let i = 0; i < n; i += 3) { const a = ix ? ix.getX(i) : i, b = ix ? ix.getX(i + 1) : i + 1, c = ix ? ix.getX(i + 2) : i + 2;
        if (re && !(re.test(part[a]) && re.test(part[b]) && re.test(part[c]))) continue;
        if (not && (not.test(part[a]) || not.test(part[b]) || not.test(part[c]))) continue;
        out.push(P[a * 3], P[a * 3 + 1], P[a * 3 + 2], P[b * 3], P[b * 3 + 1], P[b * 3 + 2], P[c * 3], P[c * 3 + 1], P[c * 3 + 2]); } }
    return new Float32Array(out); };
  const points = (sk, re, max = 260) => { const all = [];
    for (const { P, part } of sk) for (let i = 0; i < part.length; i++) if (re.test(part[i])) all.push([P[i * 3], P[i * 3 + 1], P[i * 3 + 2], part[i]]);
    const k = Math.max(1, Math.ceil(all.length / max)); return all.filter((_, i) => i % k === 0); };
  // crossings of a ray from p along an axis (ax 0..2, sign) with the triangles
  const cross = (p, Tr, ax, sg) => { const u = (ax + 1) % 3, w = (ax + 2) % 3, pu = p[u], pw = p[w], pa = p[ax]; let n = 0;
    for (let i = 0; i < Tr.length; i += 9) {
      const au = Tr[i + u], bu = Tr[i + 3 + u], cu = Tr[i + 6 + u]; if ((au < pu && bu < pu && cu < pu) || (au > pu && bu > pu && cu > pu)) continue;
      const aw = Tr[i + w], bw = Tr[i + 3 + w], cw = Tr[i + 6 + w]; if ((aw < pw && bw < pw && cw < pw) || (aw > pw && bw > pw && cw > pw)) continue;
      const d = (bw - cw) * (au - cu) + (cu - bu) * (aw - cw); if (Math.abs(d) < 1e-14) continue;
      const l1 = ((bw - cw) * (pu - cu) + (cu - bu) * (pw - cw)) / d, l2 = ((cw - aw) * (pu - cu) + (au - cu) * (pw - cw)) / d, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const h = l1 * Tr[i + ax] + l2 * Tr[i + 3 + ax] + l3 * Tr[i + 6 + ax];
      if ((h - pa) * sg > 0) n++; }
    return n; };
  const dist = (p, Tr) => { const T = window.THREE, tri = S._t || (S._t = new T.Triangle()), q = S._q || (S._q = new T.Vector3()), c = S._c || (S._c = new T.Vector3()); q.set(p[0], p[1], p[2]); let best = 1e9;
    for (let i = 0; i < Tr.length; i += 9) {
      if (Math.abs(Tr[i] - p[0]) > best + 0.3 || Math.abs(Tr[i + 1] - p[1]) > best + 0.3) continue;
      tri.a.set(Tr[i], Tr[i + 1], Tr[i + 2]); tri.b.set(Tr[i + 3], Tr[i + 4], Tr[i + 5]); tri.c.set(Tr[i + 6], Tr[i + 7], Tr[i + 8]);
      const d = tri.closestPointToPoint(q, c).distanceTo(q); if (d < best) best = d; }
    return best; };
  // the deepest of `pts` inside the body `Tr` makes. rays: [[axis, sign], ...]; inside: more than half of them cross it an odd number of times
  const RAYS6 = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]], DOWN = [[1, -1], [0, 1], [0, -1], [2, 1], [2, -1]];
  S.deep = (pts, Tr, rays = RAYS6) => { let deep = 0, part = '', n = 0, at = null; if (!Tr.length) return { deep, part, n };
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < Tr.length; i += 3) for (let k = 0; k < 3; k++) { if (Tr[i + k] < lo[k]) lo[k] = Tr[i + k]; if (Tr[i + k] > hi[k]) hi[k] = Tr[i + k]; }
    for (const p of pts) { if (p[0] < lo[0] || p[0] > hi[0] || p[1] < lo[1] || p[1] > hi[1] || p[2] < lo[2] || p[2] > hi[2]) continue;
      let odd = 0; for (const [ax, sg] of rays) if (cross(p, Tr, ax, sg) % 2) odd++;
      if (odd * 2 <= rays.length) continue;
      const d = dist(p, Tr); n++; if (d > deep) { deep = d; part = p[3]; at = [p[0], -p[2], p[1]]; } }
    return { deep: +deep.toFixed(3), part, n, at }; };
  // one person's parts in another's body (legs left out of the other: a hand does not reach them)
  S.touch = (aRoot, bRoot, re = /(Hand|Forearm)$/) => S.deep(points(skinned(aRoot), re), tris(skinned(bRoot), null, /(Calf|Foot)$/));
  // a person's own parts in the rest of their own body: `re` the parts looked for, `into` the parts they may be in.
  // (rays down and level only: the body is open where the part looked for was cut away, above or beside)
  S.own = (root, re, into) => { const sk = skinned(root); return S.deep(points(sk, re, 500), tris(sk, into, null), DOWN); };
  S.who = name => { const g = window.__game, pl = g.player; if (name === 'you') return { o: pl, rig: pl.rig, name: 'you' };
    const all = (g.npcs || []).map(n => ({ name: n.name || n.id, o: n, rig: n.rig })).concat([...g.storyFigs()].map(f => ({ name: f.name || f.character, o: f, rig: f.rig })));
    return all.find(a => a.name.toLowerCase().includes(name.toLowerCase()) && a.rig && a.rig.root) || null; };
  S.cam = (pos, look) => { const g = window.__game, T = window.THREE; const P = S.pose || (S.pose = { pos: new T.Vector3(), look: new T.Vector3() }); P.pos.set(pos[0], pos[2], -pos[1]); P.look.set(look[0], look[2], -look[1]); if (!g.cine.active) g.cine.play(() => S.pose, 1e9, { label: 'film' }); };
}

(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500, tag = phone ? 'phone' : 'desk';
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone,
    ...(process.env.PHONE ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' } : {}) });
  const errors = [], fails = [];
  const fail = s => { fails.push(s); console.log(`FAIL ${s}`); };
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await probe.install(p);
  await p.addInitScript(pageSide);
  const STILL = !!process.env.STILL;
  await skip(p, STILL && mode === 'into' ? 1 : +process.env.DRAW || 30);
  const story = process.env.STORY != null;
  if (story) await p.addInitScript(n => { try { localStorage.setItem('bh-story-late', JSON.stringify({ fi: n, left: 7 - n, prints: Array.from({ length: n }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, +process.env.STORY);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${story ? '' : '?walk=1'}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('gt-play').click());
  await p.waitForTimeout(story ? 20000 : 8000);
  await p.evaluate(() => { const g = window.__game; if (g.cine && g.cine.active && g.cine.skip) g.cine.skip(); });
  await p.waitForTimeout(2000);
  const shot = name => whole(p, () => p.screenshot({ path: `${out}/${tag}-${name}.png`, timeout: 120000 }));
  const frames = n => p.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  // someone's own model comes once the player is near: put the player by them and wait for it
  const near = async (name, d = 3) => {
    const ok = await p.evaluate(([name, d]) => { const q = window.__skin.who(name); if (!q) return false; if (name !== 'you') { const g = window.__game, pl = g.player, o = q.o; pl.x = o.x + d; pl.y = o.y + 0.3; pl.z = (o.z || 0) + 0.05; pl.vz = 0; } return true; }, [name, d]);
    if (!ok) return false;
    await p.waitForFunction(name => { const q = window.__skin.who(name); return q && q.rig && !q.rig.pending && q.rig.root.visible; }, name, { timeout: 180000, polling: 500 }).catch(() => {});
    await frames(20); return true;
  };

  if (mode === 'into') {
    const DIRS = +process.env.DIRS || 8;
    for (const name of names.split(',')) {
      if (!(await near(name, 1.5))) { console.log(`${name}: not there`); continue; }
      const head = await p.evaluate(name => { const q = window.__skin.who(name); return { h: q.o.h ?? null, at: [q.o.x, q.o.y, q.o.z] }; }, name);
      console.log(`${name} at (${head.at.map(v => +v.toFixed(2))}), facing ${head.h == null ? '?' : head.h.toFixed(2)}`);
      let worst = { deep: 0 };
      for (let k = 0; k < DIRS; k++) {
        const a = k / DIRS * Math.PI * 2;
        const r = await p.evaluate(([name, a, STILL]) => new Promise(res => { const g = window.__game, S = window.__skin, pl = g.player, q = S.who(name), t = q.o;
          const dx = Math.sin(a), dy = Math.cos(a); // (the side the player comes from)
          pl.x = t.x + dx * 1.3; pl.y = t.y + dy * 1.3; pl.z = (t.z || 0) + 0.02; pl.h = Math.atan2(-dx, -dy); pl.speed = 0; if (g.cam) g.cam.yaw = pl.h;
          const side = () => S.cam([(pl.x + t.x) / 2 + dy * 2.3, (pl.y + t.y) / 2 - dx * 2.3, pl.z + 1.25], [(pl.x + t.x) / 2, (pl.y + t.y) / 2, pl.z + 1.1]);
          const ev = type => window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyW', key: 'w', bubbles: true }));
          ev('keydown'); let n = 62, min = 9, deep = 0, part = '', in1 = 0, in3 = 0, png = null, i = 0, at = 0;
          const f = () => { i++; if (g.cam) g.cam.yaw = Math.atan2(t.x - pl.x, t.y - pl.y); if (STILL) side();
            const d = Math.hypot(t.x - pl.x, t.y - pl.y); min = Math.min(min, d);
            if (d < 1.0) { const m = S.touch(pl.rig.root, q.rig.root); if (m.deep > 0.01) in1++; if (m.deep > 0.03) in3++;
              if (m.deep > deep) { deep = m.deep; part = m.part; at = i; if (STILL && m.deep > 0.01) png = document.getElementById('game-gl').toDataURL('image/png'); } }
            if (n === 12) ev('keyup');
            if (--n > 0) requestAnimationFrame(f); else res({ min: +min.toFixed(3), end: +d.toFixed(3), deep, part, in1, in3, at, png }); };
          requestAnimationFrame(f); }), [name, a, STILL]);
        const deg = Math.round(a * 180 / Math.PI), rel = head.h == null ? '' : `, ${Math.round((((a - head.h) * 180 / Math.PI) % 360 + 360) % 360)} deg round from their front`;
        console.log(`into ${name} from ${deg} deg${rel}: nearest ${r.min} m, stopped at ${r.end} m; the hand or forearm ${r.deep} m in (${r.part || 'nothing'}, frame ${r.at}), ${r.in1} frames past 1 cm, ${r.in3} past 3 cm`);
        if (r.png) fs.writeFileSync(`${out}/${tag}-into-${name.toLowerCase()}-${deg}-deepest.png`, Buffer.from(r.png.split(',')[1], 'base64'));
        if (STILL) await shot(`into-${name.toLowerCase()}-${deg}-end`);
        if (r.deep > worst.deep) worst = { ...r, deg, png: null };
        if (r.deep > DEEP && r.in3 > 2) fail(`walked into ${name} from ${deg} deg: a hand or forearm ${r.deep} m in them for ${r.in3} frames`);
        if (r.min < probe.NEAR) fail(`walked into ${name} from ${deg} deg: the middles came to ${r.min} m`);
      }
      console.log(`${name}: the deepest ${worst.deep} m (${worst.part || 'nothing'}) from ${worst.deg ?? '-'} deg`);
      // past them at a run: on a line beside them, the view held along it
      await p.evaluate(() => { const g = window.__game; if (g.cine.active) g.cine.stop(); });
      const run = (name, off, free) => p.evaluate(([name, off, free]) => new Promise(res => { const g = window.__game, S = window.__skin, pl = g.player, t = S.who(name).o;
        const a = (t.h ?? 0) + Math.PI / 2, dx = Math.sin(a), dy = Math.cos(a), sx = dy, sy = -dx, fx = free ? 4 : 0; // (across their front; free: the same line four metres to the side)
        const x0 = t.x - dx * 3 + sx * (off + fx), y0 = t.y - dy * 3 + sy * (off + fx);
        if (!g.nav.walk(x0, y0, pl.z, true).ok) return res(null);
        pl.x = x0; pl.y = y0; pl.h = a; pl.speed = 0; if (g.cam) g.cam.yaw = a;
        const ev = type => window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyW', key: 'w', bubbles: true }));
        ev('keydown'); let n = 80, deep = 0;
        const f = () => { if (g.cam) g.cam.yaw = a; if (!free && Math.hypot(t.x - pl.x, t.y - pl.y) < 1.0) deep = Math.max(deep, S.touch(pl.rig.root, S.who(name).rig.root, /(Hand|Forearm|UpperArm)$/).deep);
          if (--n > 0) requestAnimationFrame(f); else { ev('keyup'); res({ went: +((pl.x - x0) * dx + (pl.y - y0) * dy).toFixed(2), deep }); } };
        requestAnimationFrame(f); }), [name, off, free]);
      for (const off of [0, 0.3, 0.6]) {
        const r = await run(name, off, false), fr = await run(name, off, true);
        if (!r || !fr) { console.log(`past ${name}, ${off} m to one side: no room for the line`); continue; }
        console.log(`past ${name} at a run, ${off} m to one side: ${r.went} m in four seconds (nobody in the way: ${fr.went} m), an arm ${r.deep} m in them`);
        if (r.deep > DEEP + 0.02) fail(`a run past ${name} ${off} m to one side: an arm ${r.deep} m in them`);
      }
    }
  }

  if (mode === 'look') {
    const SECS = +process.env.SECS || 5;
    for (const name of names.split(',')) {
      if (!(await near(name, 3.2))) { console.log(`${name}: not there`); continue; }
      await p.evaluate(name => { const g = window.__game, q = window.__skin.who(name); if (name !== 'you' && g.player.rig) g.player.rig.root.visible = false; void q; }, name);
      const one = () => p.evaluate(name => { const S = window.__skin, q = S.who(name), root = q.rig.root;
        const head = S.own(root, /(Head|Neck)$/, /(Spine2|Spine1|Spine|Clavicle|UpperArm)$/), arms = S.own(root, /(Hand|Forearm)$/, /(Pelvis|Spine2|Spine1|Spine|Thigh|Neck|Head)$/);
        let clip = ''; try { clip = (q.o.look && q.o.look.clip) || (q.rig.look && q.rig.look.clip) || ''; } catch (e) { /* none */ }
        return { head, arms, clip, h: q.o.h ?? 0, at: [q.o.x, q.o.y, q.o.z || 0] }; }, name);
      let hd = { deep: 0 }, ar = { deep: 0 }, hn = 0, an = 0, N = 0, clip = '';
      for (let s = 0; s < SECS; s++) {
        for (let k = 0; k < 4; k++) { // (four readings a second of the story's clock: twenty frames of a twentieth)
          const r = await one(); N++; clip = r.clip;
          if (r.head.deep > DEEP) hn++; if (r.arms.deep > DEEP) an++;
          if (r.head.deep > hd.deep) hd = r.head; if (r.arms.deep > ar.deep) ar = r.arms;
          if (k === 0) for (const [vn, da, dist, dz] of [['front', 0.5, 1.15, 1.5], ['side', 1.6, 1.15, 1.5], ['body', 0.7, 2.7, 1.2]]) {
            await p.evaluate(([name, da, dist, dz]) => { const S = window.__skin, o = S.who(name).o, a = (o.h ?? 0) + da; S.cam([o.x + Math.sin(a) * dist, o.y + Math.cos(a) * dist, (o.z || 0) + dz], [o.x, o.y, (o.z || 0) + (dist > 2 ? 1.0 : 1.45)]); }, [name, da, dist, dz]);
            await frames(2); await shot(`look-${name.toLowerCase().replace(/[^a-z]+/g, '-')}-${vn}-${s}s`);
          }
          await frames(5);
        }
      }
      console.log(`${name}${clip ? ` (${clip})` : ''}: head, hair and neck in own chest or shoulders ${hd.deep} m at most (${hd.part || 'nothing'}, ${hd.n || 0} points${hd.at ? `, at ${hd.at.map(v => +v.toFixed(2))}` : ''}), past ${DEEP} m in ${hn} of ${N} readings; hands and forearms in own trunk ${ar.deep} m at most (${ar.part || 'nothing'}), past ${DEEP} m in ${an} of ${N}`);
      if (hd.deep > DEEP && hn > 4) fail(`${name}: head, hair or neck ${hd.deep} m in their own chest for ${hn} of ${N} readings`);
      await p.evaluate(() => { const g = window.__game; if (g.cine.active) g.cine.stop(); if (g.player.rig) g.player.rig.root.visible = true; });
    }
  }

  if (mode === 'seats') {
    const seat = async (what) => {
      const R0 = await probe.report(p), n0 = R0 ? R0.cases.filter(c => c.kind === 'seat').length : 0; void n0;
      for (let k = 0; k < 6; k++) { await p.waitForTimeout(1200); await frames(8); } // (the probe's seat measure runs once a second of the wall clock)
      const st = await p.evaluate(() => { const g = window.__game, pl = g.player; return { mode: pl.mode, seen: !!(pl.rig && pl.rig.root && pl.rig.root.visible), at: [pl.x, pl.y, pl.z].map(v => +v.toFixed(2)), h: pl.h }; });
      console.log(`${what}: mode ${st.mode}, the player ${st.seen ? 'drawn' : 'not drawn'}, at (${st.at})`);
      if (st.seen) for (const [vn, da, dist, dz] of [['door', Math.PI / 2, 2.6, 1.3], ['front', 0.35, 3.2, 1.5], ['in', -Math.PI / 2, 0.75, 1.25]]) {
        await p.evaluate(([da, dist, dz]) => { const g = window.__game, pl = g.player, T = window.THREE, S = window.__skin, w = pl.rig.root.getWorldPosition(new T.Vector3()), a = pl.h + da; S.cam([w.x + Math.sin(a) * dist, -w.z + Math.cos(a) * dist, w.y + dz], [w.x, -w.z, w.y + 0.9]); }, [da, dist, dz]);
        await frames(2); await shot(`seat-${what}-${vn}`);
      }
      await p.evaluate(() => { const g = window.__game; if (g.cine.active) g.cine.stop(); });
      await frames(3); await shot(`seat-${what}-own-view`);
      return st;
    };
    // the car: brought to the kerb, then at its wheel
    const car = await p.evaluate(async () => { const g = window.__game; try { if (g.bringCar) g.bringCar(); } catch (e) { return String(e); } for (let i = 0; i < 400 && !(g.myCar && g.myCar()); i++) await new Promise(r => setTimeout(r, 250)); for (let i = 0; i < 60 && g.carComing && g.carComing(); i++) await new Promise(r => setTimeout(r, 500)); try { g.enterCar(); } catch (e) { return String(e); } return g.player.mode; });
    console.log(`the car: ${car}`);
    if (car === 'car') { await seat('car'); await p.evaluate(() => window.__game.exitCar()); await frames(10); } else fail(`could not sit at the wheel (${car})`);
    const heli = await p.evaluate(async () => { const g = window.__game; try { g.enterHeli(); } catch (e) { return String(e); } await new Promise(r => setTimeout(r, 1500)); return g.player.mode; });
    console.log(`the helicopter: ${heli}`);
    if (heli === 'heli') { await seat('heli'); } else fail(`could not board the helicopter (${heli})`);
  }

  const R = await probe.report(p);
  if (R) { const c = R.cases.filter(c => mode === 'seats' ? c.kind === 'seat' : c.kind === 'touch' || c.kind === 'limb' || c.kind === 'bodies'); probe.print({ ...R, cases: c }); }
  console.log(`clip_people ${mode}: ${fails.length ? `${fails.length} failed` : 'ok'}; page errors: ${errors.length}`);
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
