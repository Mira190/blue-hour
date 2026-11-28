// No passer-by changes colour as the page comes in (the owner's report, 27 November 2026: "when you go in, the passers-by's
// clothes change colour"). From the moment the loader lifts the page is recorded for SECS seconds as it plays, in real time
// (the title over the street, then, with WALK=1, the walk set out from it): every frame drawn, at most one each STEP ms,
// each walker on the screen within FAR metres has its clothes' colour read off the frame itself (the canvas, a box at the
// chest), with what it was drawn as (a whole person and whose body, a stand-in for someone not yet come, or a far copy).
// A walker whose colour jumps by more than LIMIT (in sRGB, 0..255, the box's mean) between two frames and stays there,
// while nothing stood in front of it, is a change: the run fails on any. A change of what someone is drawn as is listed
// too, with the colour before and after, so that a failure says which swap it was.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/crowd_colour.js [WxH, 1440x900] [seconds, 20]
//   OUT=dir: stills every SHOT ms (1000; 0 none) for tools/contact_sheet.py, and the log as JSON
//   WALK=1: set out on the walk when the title is up (the walk's entry), else the title's street (the story's first frame)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, size = '1440x900', secs = '20'] = process.argv;
const LIMIT = +(process.env.LIMIT || 28), FAR = +(process.env.FAR || 30), STEP = +(process.env.STEP || 100), OUT = process.env.OUT || '', SHOT = +(process.env.SHOT ?? 1000);
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  let bad = false;
  p.on('pageerror', e => { bad = true; console.log(`FAIL pageerror: ${String(e).slice(0, 200)}`); });
  await p.addInitScript(([t, step, far]) => {
    try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-player', 'kagami'); localStorage.setItem('bh-walk-intro', '1'); } catch (e) { /* storage blocked */ }
    // the recorder, in the page: the game's state each frame (__probe), and the frame itself read back right after it is
    // drawn to the screen, in the same task (a microtask after the last draw to the canvas), before it is composited
    const R = window.__cc = { on: false, t0: 0, rows: [], last: 0, ctx: null };
    window.__probe = { frame(c) { R.ctx = c; } };
    const hook = () => {
      const G = window.__game; if (!G || !G.renderer || G.renderer.__cc) return false;
      const r = G.renderer, render = r.render.bind(r); r.__cc = true;
      let due = false;
      r.render = (s, cam) => {
        render(s, cam);
        if (!(R.on || R.want) || due || r.getRenderTarget() !== null) return;
        const now = performance.now(); if (!R.want && now - R.last < step) return;
        due = true; queueMicrotask(() => { due = false; R.last = now; try { sample(r, now); } catch (e) { R.err = String(e); } });
      };
      return true;
    };
    const iv = setInterval(() => { if (hook()) clearInterval(iv); }, 200);
    const box = new Uint8Array(4 * 64 * 64);
    function sample(r, now) {
      const c = R.ctx; if (!c || !c.crowd || !c.crowdDraw || !c.camera) return;
      const THREE = c.THREE, cam = c.camera, P = c.crowd.P, D = c.crowdDraw, gl = r.getContext();
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, v = new THREE.Vector3(), props = r.properties;
      cam.updateMatrixWorld();
      const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
      const NI = D.nearInfo ? D.nearInfo() : {}, row = { t: +((now - R.t0) / 1000).toFixed(2), who: [], near: [NI.active, NI.nNear, NI.want, NI.unloaded] }, boxes = [];
      for (let i = 0; i < Math.min(P.length, c.crowd.active); i++) {
        const q = P[i]; if (!(q.line >= 0 || q.pz) || q.rx == null || !D.shows(i)) continue;
        const crown = q.crown || 1.6, cx = q.rx, cy = q.rz + (q.mode === 'sit' ? crown * 0.4 : crown * 0.62), cz = -q.ry;
        const d = Math.hypot(cx - cam.position.x, cy - cam.position.y, cz - cam.position.z);
        if (d > far || (cx - cam.position.x) * fwd.x + (cy - cam.position.y) * fwd.y + (cz - cam.position.z) * fwd.z < 0.5) continue;
        v.set(cx, cy, cz).project(cam);
        if (Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.95) continue;
        const px = (v.x + 1) / 2 * W, py = (v.y + 1) / 2 * H, tall = crown * H * cam.projectionMatrix.elements[5] / 2 / d;
        if (tall < 60) continue;
        const half = Math.max(2, Math.min(31, Math.round(tall * 0.035)));
        boxes.push({ i, px, py, half, d, tall });
      }
      for (const B of boxes) {
        // (someone nearer whose figure covers this one's box: not read, it is their colour)
        if (boxes.some(o => o !== B && o.d < B.d && Math.abs(o.px - B.px) < o.tall * 0.22 + B.half && B.py < o.py + o.tall * 0.62 && B.py > o.py - o.tall * 0.45)) continue;
        const n = B.half * 2, x0 = Math.round(B.px) - B.half, y0 = Math.round(B.py) - B.half;
        if (x0 < 0 || y0 < 0 || x0 + n > W || y0 + n > H) continue;
        gl.readPixels(x0, y0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, box);
        let sr = 0, sg = 0, sb = 0; const k = n * n;
        for (let j = 0; j < k; j++) { sr += box[j * 4]; sg += box[j * 4 + 1]; sb += box[j * 4 + 2]; }
        const q = P[B.i], a = D.active.get(B.i);
        let as;
        if (a) {
          let maps = 0, ready = 0, progs = [];
          a.root.traverse(o => { if (!o.isMesh || !o.material) return; for (const m of [].concat(o.material)) { if (m.map) { maps++; if (props.get(m.map).__webglTexture) ready++; } const pr = props.get(m).currentProgram; progs.push(pr ? pr.id : '-'); } });
          as = { kind: a.standFor ? 'standin' : 'rig', body: a.character, for: a.standFor || null, maps, ready, prog: progs.join('.'), parts: (() => { const o = []; a.root.traverse(x => { if (x.isMesh) o.push(`${x.name}:${x.visible ? 1 : 0}:${[].concat(x.material).map(m => (m.name || '?') + '/' + (props.get(m).currentProgram ? props.get(m).currentProgram.id : '-')).join(',')}`); }); return o; })() };
        } else as = { kind: q.far ? 'far' : 'doll', body: q.far || q.look.character, lod: q.lod | 0 };
        row.who.push({ i: B.i, c: [Math.round(sr / k), Math.round(sg / k), Math.round(sb / k)], d: +B.d.toFixed(1), tall: Math.round(B.tall), dress: q.dress, as, x: Math.round(B.px), y: Math.round(H - B.py) });
      }
      if (R.grab) { R.grab = false; try { R.still = r.domElement.toDataURL('image/jpeg', 0.8); } catch (e) { R.still = null; } } // (the canvas, in the task it was drawn in)
      if (R.want) { R.snap = row; R.want = false; } else R.rows.push(row);
    }
  }, [process.env.TIER || (phone ? 'low' : 'high'), STEP, FAR]);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0${process.env.QUERY || ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  // from the loader's lifting (its class 'out'): the first frame a player sees the street in
  await p.waitForFunction(() => { const l = document.getElementById('g-loader'); return window.__game && l && (l.classList.contains('out') || l.hidden); }, null, { timeout: 900000, polling: 50 });
  if (process.env.MODE === 'swap') return swapMode(p, b, size, () => bad);
  await p.evaluate(() => { window.__cc.on = true; window.__cc.t0 = performance.now(); });
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now(); let shots = 0, walked = false;
  while (Date.now() - t0 < secs * 1000) {
    if (process.env.WALK === '1' && !walked && Date.now() - t0 > 2500) {
      walked = true;
      await p.evaluate(() => { const g = window.__game; g.walkStart({ t: 'blue', w: 'clear' }); });
    }
    if (OUT && SHOT && Date.now() - t0 >= shots * SHOT) { await p.screenshot({ path: `${OUT}/f${String(shots).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 70 }); shots++; }
    await p.waitForTimeout(50);
  }
  const R = await p.evaluate(() => ({ rows: window.__cc.rows, err: window.__cc.err || null }));
  await b.close();
  if (R.err) console.log(`sampler error: ${R.err}`);
  // the judge: per walker, its colours frame by frame; a jump that holds (the two frames before alike, the two after alike)
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const by = new Map();
  for (const row of R.rows) for (const x of row.who) { if (!by.has(x.i)) by.set(x.i, []); by.get(x.i).push(Object.assign({ t: row.t }, x)); }
  // (two frames read one after the other, however far apart a slow renderer draws them: a pair is one no more than a few
  // frames apart, 0.6 s at least)
  const dts = R.rows.slice(1).map((r, k) => r.t - R.rows[k].t).sort((a, b) => a - b), GAP = Math.max(0.6, 2.5 * (dts[dts.length >> 1] || 0));
  const jumps = [], swaps = [];
  for (const [i, s] of by) for (let k = 1; k < s.length; k++) {
    const a = s[k - 1], c = s[k], A = a.as, C = c.as;
    if (c.t - a.t > GAP) continue; // (not seen in between: no pair)
    const key = o => `${o.kind}:${o.body}:${o.for || ''}:${o.prog || ''}:${o.ready ?? ''}`;
    const jump = dist(a.c, c.c);
    if (key(A) !== key(C) || A.lod !== C.lod) swaps.push({ i, t: c.t, from: A, to: C, before: a.c, after: c.c, jump: Math.round(jump), d: c.d, tall: c.tall });
    if (jump <= LIMIT) continue;
    const pre = s[k - 2], post = s[k + 1];
    const held = pre && post && post.t - c.t < GAP && a.t - pre.t < GAP && dist(pre.c, a.c) < LIMIT / 2 && dist(post.c, c.c) < LIMIT / 2;
    if (held) jumps.push({ i, t: c.t, before: a.c, after: c.c, jump: Math.round(jump), from: A, to: C, d: c.d, tall: c.tall, at: [c.x, c.y] });
  }
  const frames = R.rows.length, seen = by.size;
  console.log(`${frames} frames read in ${secs} s (${size}), ${seen} walkers seen on the screen within ${FAR} m`);
  const fmt = o => o.kind === 'far' || o.kind === 'doll' ? `${o.kind} ${o.body}${o.lod ? ' coarse' : ''}` : `${o.kind} ${o.body}${o.for ? ` for ${o.for}` : ''} maps ${o.ready}/${o.maps} prog ${o.prog}`;
  const kinds = {}; for (const s of swaps) { const k = `${s.from.kind}>${s.to.kind}`; (kinds[k] = kinds[k] || []).push(s.jump); }
  for (const [k, js] of Object.entries(kinds)) { js.sort((a, b) => a - b); console.log(`  swaps ${k}: ${js.length}, colour moved by a median ${js[js.length >> 1]}, most ${js[js.length - 1]}`); }
  for (const j of jumps) console.log(`  CHANGE walker ${j.i} at ${j.t} s, ${j.d} m (${j.tall} px tall, at ${j.at}): rgb ${j.before} -> ${j.after} (${j.jump}); ${fmt(j.from)} -> ${fmt(j.to)}`);
  if (OUT) fs.writeFileSync(`${OUT}/crowd_colour.json`, JSON.stringify({ size, secs, LIMIT, jumps, swaps, rows: R.rows }));
  const fails = jumps.length;
  console.log(fails || bad ? `FAIL ${fails} walkers changed colour on the screen` : `ok: no walker changed colour by more than ${LIMIT}`);
  process.exit(fails || bad ? 1 : 0);
})().catch(e => { console.log(`FAIL ${e.stack || e}`); process.exit(1); });

// MODE=swap: the step from far to near, the world held. Once the cast round the camera has come, each walker drawn whole
// is read, then the same frame again with everyone drawn as their far copy (crowdRenderer nearCap 0), and back: a whole
// person and their far copy are the same person in the same clothes, so the two colours are alike. At the title's street
// (the story's first frame) and at the walk's start. Fails on a walker whose colour moves by more than LIMIT across the step.
async function swapMode(p, b, size, bad) {
  const views = [];
  const until = async (fn, secs) => { const t0 = Date.now(); while (Date.now() - t0 < secs * 1000) { if (await p.evaluate(fn)) return true; await p.waitForTimeout(500); } return false; };
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.evaluate(() => window.__game.hold(true));
  const read = cap => p.evaluate(async cap => {
    const g = window.__game, D = g.crowdDraw(), R = window.__cc, frames = n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    D.nearCap = cap;
    for (let k = 0; k < 40; k++) { g.frame(1e-4); await frames(1); if (![...D.active.values()].some(r => r.cold)) break; }
    g.frame(1e-4); await frames(3);
    R.want = true; await frames(2);
    return R.snap;
  }, cap);
  for (const view of (process.env.VIEWS || 'title,walk').split(',')) {
    if (view === 'walk') await p.evaluate(() => { const g = window.__game; g.walkStart({ t: 'blue', w: 'clear' }); for (let i = 0; i < 40; i++) { g.advance(0.25); if (g.dlg.open) g.dlg.quit(); } });
    // (the cast round the camera come: every near walker's own character, not a far copy waiting on it; ten minutes at most)
    const came = await until(() => { const g = window.__game, D = g.crowdDraw(); g.frame(1e-4); const n = D.nearInfo(); return n.unloaded === 0 && ![...D.active.values()].some(r => r.cold); }, 600);
    const A = await read(null), B = await read(0), C = await read(null);
    // (and the first frames of people made new, the pool emptied: each drawn as their far copy or whole, never as nobody)
    const F = await p.evaluate(async () => {
      const g = window.__game, D = g.crowdDraw(), R = window.__cc, frame = () => new Promise(r => requestAnimationFrame(r)), out = [];
      D.nearCap = 0; g.frame(1e-4); await frame(); await frame();
      D.dropPool(); D.nearCap = null; g.frame(1e-4); R.grab = true;
      for (let k = 0; k < 6; k++) { R.want = true; await frame(); await frame(); if (R.snap) out.push(R.snap); R.snap = null; }
      return out;
    });
    if (OUT) {
      fs.mkdirSync(OUT, { recursive: true });
      const still = await p.evaluate(() => window.__cc.still);
      if (still) fs.writeFileSync(`${OUT}/${view}-first-frame.jpg`, Buffer.from(still.split(',')[1], 'base64'));
      await p.screenshot({ path: `${OUT}/${view}-settled.jpg`, type: 'jpeg', quality: 80 });
    }
    views.push({ view, came, A, B, C, F });
  }
  await b.close();
  const dist = (a, c) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
  let fails = 0;
  for (const { view, came, A, B, C, F } of views) {
    if (!came) console.log(`  ${view}: the cast round the camera had not all come in ten minutes; read as it was`);
    const far = new Map(B.who.map(x => [x.i, x])), back = new Map(C.who.map(x => [x.i, x]));
    const rows = [];
    for (const x of A.who) {
      const f = far.get(x.i), c = back.get(x.i);
      if (x.as.kind !== 'rig' || !f || f.as.kind !== 'far') continue;
      if (c && dist(x.c, c.c) > LIMIT / 3) continue; // (the whole person read differently twice over: something passed in front)
      rows.push({ i: x.i, near: x.c, far: f.c, jump: Math.round(dist(x.c, f.c)), body: x.as.body, d: x.d, tall: x.tall });
    }
    rows.sort((a, c) => c.jump - a.jump);
    const over = rows.filter(r => r.jump > LIMIT);
    fails += over.length;
    const js = rows.map(r => r.jump).sort((a, c) => a - c);
    console.log(`${view}: ${rows.length} walkers read whole and as their far copy (${size}); colour moved by a median ${js[js.length >> 1] ?? '-'}, most ${js[js.length - 1] ?? '-'}`);
    for (const r of rows.slice(0, 8)) console.log(`  ${r.jump > LIMIT ? 'CHANGE' : '      '} walker ${r.i} ${r.body} ${r.d} m (${r.tall} px): whole ${r.near}, far copy ${r.far} (${r.jump})`);
    const whole = new Map(rows.map(r => [r.i, r])), holes = [];
    for (const [k, S] of F.entries()) for (const x of S.who) { const r = whole.get(x.i); if (!r) continue; const d = Math.min(dist(x.c, r.near), dist(x.c, r.far)); if (d > LIMIT) holes.push(`walker ${r.i} in frame ${k + 1} of being made: ${x.c} as ${x.as.kind}, whole ${r.near}, far copy ${r.far} (${Math.round(d)})`); }
    console.log(`${view}: ${F.length} first frames of people made new read, ${holes.length} drawn as neither their far copy nor whole`);
    for (const h of holes.slice(0, 8)) console.log(`  CHANGE ${h}`);
    fails += holes.length;
  }
  if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/crowd_swap.json`, JSON.stringify(views)); }
  console.log(fails || bad() ? `FAIL ${fails} walkers change colour from their far copy to whole` : `ok: no walker's colour moves by more than ${LIMIT} from far copy to whole`);
  process.exit(fails || bad() ? 1 : 0);
}
