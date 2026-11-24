// The walk's frames while the city streams in round a moving player (issue 192, cells-192): the walk set out at an
// hour held, the player stood 20 s at the Scramble, then carried round a loop of about 1.4 km at SPEED m/s with the
// camera looking the way they go (the buildings' cells coming and going as on a run through the streets), then stood
// 20 s again. The page runs by itself as a player's does (its own frames, the governor held still by the harness);
// every frame's interval is taken in the page, and the cells drawn are read from the buildings' arena where there is
// one. Prints, for standing and for moving: frames, median and 95th percentile interval, frames over 50 ms and over
// 100 ms. Run it on two commits to set them side by side (served each from its own port).
//   python3 -m http.server 8800 --directory web &
//   GPU=metal NODE_PATH=$(npm root -g) node tools/walk_stream.js [WxH, 1440x900]      ENGINE=webkit HEADED=1 | ENGINE=safari
//   SPEED (7), HOUR (21:00), TIER (the device's own when unset), Q (more of the address)
const [,, size = '1440x900'] = process.argv;
const ENGINE = process.env.ENGINE || 'chromium';
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500, SPEED = +(process.env.SPEED || 7);
  let b;
  if (ENGINE === 'chromium') b = await require('playwright').chromium.launch({ headless: process.env.GPU !== 'metal', args: process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  else b = await require('./engine').launch();
  const p = ENGINE === 'safari' ? await b.newPage({ viewport: { width: w, height: h } }) : await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone && ENGINE === 'chromium' })).newPage();
  const errs = [];
  if (p.on) p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.addInitScript(t => { try { if (t) localStorage.setItem('bh-quality', t); localStorage.setItem('bh-player', 'kagami'); localStorage.setItem('bh-walk-intro', '1'); } catch (e) { /* storage blocked */ } }, process.env.TIER || '');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0${process.env.Q ? '&' + process.env.Q : ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  const r = await p.evaluate(async ([hour, speed]) => {
    const g = window.__game, P = g.player, wait = ms => new Promise(f => setTimeout(f, ms));
    if (g.lateReady) await g.lateReady();
    g.walkStart({ t: hour, w: 'clear' });
    for (let i = 0; i < 40 && g.dlg && g.dlg.open; i++) { g.dlg.quit(); await wait(100); }
    await wait(8000); // (the walk's first seconds: not counted)
    const W = [[368, -1002], [20, -1002], [20, -650], [368, -650], [368, -1002]];
    const legs = W.slice(1).map((q, i) => { const a = W[i]; return { a, q, len: Math.hypot(q[0] - a[0], q[1] - a[1]) }; });
    const total = legs.reduce((s, l) => s + l.len, 0), runMs = (total / speed) * 1000;
    let cellsMesh = null; (g.world || g.scene || { traverse() {} }).traverse && (g.world || g.scene).traverse(o => { if (o.name === 'buildings-cells' || (o.userData && o.userData.last && 'cells' in o.userData.last)) cellsMesh = o; });
    const T = { stand1: [], move: [], stand2: [] }, cells = [];
    const at = d => { for (const l of legs) { if (d <= l.len) { const k = d / l.len; return [l.a[0] + (l.q[0] - l.a[0]) * k, l.a[1] + (l.q[1] - l.a[1]) * k, Math.atan2(l.q[0] - l.a[0], l.q[1] - l.a[1])]; } d -= l.len; } return [...W[W.length - 1], 0]; };
    const place = (x, y, yaw) => { const wk = g.nav && g.nav.walk ? g.nav.walk(x, y, P.z + 2, true) : null; P.x = x; P.y = y; if (wk && wk.ok) P.z = wk.z; P.speed = 0; P.h = yaw; Object.assign(g.cam, { yaw, yawTo: null, pitchTo: null }); };
    place(368, -1002, Math.PI * 1.5);
    const BS = () => (window.__buildings && window.__buildings.stream) || null, b0 = BS() ? BS().builds : null;
    let bMs = 0, bLast = b0;
    await new Promise(done => {
      let t0 = 0, last = 0;
      const f = t => {
        if (!t0) t0 = t;
        const e = t - t0;
        if (last) { const dt = t - last; (e < 20000 ? T.stand1 : e < 20000 + runMs ? T.move : T.stand2).push(dt); }
        last = t;
        if (e >= 20000 && e < 20000 + runMs) { const [x, y, yaw] = at(((e - 20000) / 1000) * speed); place(x, y, yaw); }
        if (BS() && BS().builds !== bLast) { bLast = BS().builds; bMs += BS().ms; }
        if (cellsMesh && cellsMesh.userData.last && (cells.length === 0 || e - cells[cells.length - 1][0] > 1000)) cells.push([e, cellsMesh.userData.last.cells, cellsMesh.userData.last.drawn]);
        if (e < 40000 + runMs) requestAnimationFrame(f); else done();
      };
      requestAnimationFrame(f);
    });
    const sum = a => { const s = a.slice().sort((x, y) => x - y), q = k => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * k))] : 0); return { n: s.length, med: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), over50: s.filter(x => x > 50).length, over100: s.filter(x => x > 100).length }; };
    const cl = cells.map(c => c[1]);
    return { stand1: sum(T.stand1), move: sum(T.move), stand2: sum(T.stand2), km: +(total / 1000).toFixed(2), builds: b0 === null ? 'no stream' : `${bLast - b0} builds of cells, ${Math.round(bMs)} ms of them`, cells: cl.length ? `${Math.min(...cl)} to ${Math.max(...cl)}` : 'no arena', scale: g.governor ? g.governor.scale : null, tier: window.OEQuality ? window.OEQuality.tier().name : '' };
  }, [process.env.HOUR || '21:00', SPEED]);
  const line = (k, s) => `${k.padEnd(7)} ${String(s.n).padStart(5)} frames, median ${s.med} ms, p95 ${s.p95} ms, over 50 ms ${s.over50}, over 100 ms ${s.over100}`;
  console.log(`${ENGINE}${process.env.GPU ? ' ' + process.env.GPU : ''} ${size}, tier ${r.tier}, ${r.km} km at ${SPEED} m/s, cells in the arena ${r.cells}, ${r.builds}`);
  console.log(line('stand', r.stand1)); console.log(line('moving', r.move)); console.log(line('stand', r.stand2));
  if (errs.length) console.log(`page errors: ${errs.join(' | ')}`);
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
