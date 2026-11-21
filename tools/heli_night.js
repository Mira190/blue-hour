// The helicopter at night on the walk, as the owner flew it on a phone (November 2026): up from SHIBUYA SKY's pad, then
// low over the roofs at speed past the towers, in the chase view, with its lights and searchlight on. Frames in bursts
// at the game's 30 a second, to see what a still cannot: the helicopter hidden and shown again as it passes a tower (a
// building between the lens and it), and its lights (the glows, the searchlight's pool on the roofs) frame to frame.
// Prints, for each frame, whether a solid stands between the lens and the helicopter (nav.clearFraction) and where the
// camera is.
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   xvfb-run -a node tools/heli_night.js out_dir [WxH] [night|blue] [quality]
// The quality defaults to a phone's (low) at a phone's size, the desktop's (high) otherwise. RUN=name picks one run;
// QS=vis=off adds to the page's address.
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/heli-night', size = '390x844', hour = 'night', qArg] = process.argv;
const PORT = process.env.PORT || 8800;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const [w, h] = size.split('x').map(Number), phone = w < 500, Q = qArg || (phone ? 'low' : 'high');
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  await p.addInitScript(([t, q]) => { try { localStorage.setItem('oe3d-quality', q); localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('oe3d-player', 'W'); localStorage.removeItem('oe-walk-talk'); sessionStorage.setItem('oe-walk-auto', JSON.stringify({ t, w: 'clear' })); } catch (e) { /* storage blocked */ } }, [hour, Q]);
  p.on('pageerror', e => console.log(`page error: ${String(e).slice(0, 200)}`));
  await p.goto(`http://localhost:${PORT}/${process.env.QS ? `?${process.env.QS}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => document.getElementById('game-stage') && document.getElementById('game-stage').classList.contains('walk-on'), null, { timeout: 1200000, polling: 1000 });
  console.log(`tier ${await p.evaluate(() => (window.OEQuality && OEQuality.current ? OEQuality.current() : '') || localStorage.getItem('oe3d-quality'))}`);
  // aboard on the roof, and up
  await p.evaluate(() => { const g = window.__game, s = g.heli.st, d = g.heli.doorAt(); g.player.x = d.x + (d.x - s.x) * 0.8; g.player.y = d.y + (d.y - s.y) * 0.8; g.player.z = s.z; g.player.speed = 0; g.player.vz = 0; });
  const seen = await p.waitForFunction(() => window.__game.heli.loaded() && window.__game.heli.group.visible, null, { timeout: 900000, polling: 500 }).then(() => true, () => false);
  if (!seen) { console.log('the helicopter never stood on its pad'); process.exit(1); }
  const aboard = await p.evaluate(() => {
    const g = window.__game, st = g.heli.st, d = g.heli.doorAt();
    g.player.x = d.x; g.player.y = d.y; g.player.z = st.z; g.advance(0.3); g.enterHeli();
    for (let i = 0; i < 20 && g.player.mode !== 'heli'; i++) g.advance(0.5);
    for (let i = 0; i < 40 && st.z < 280; i++) g.advance(0.5, ['Space']);
    return g.player.mode === 'heli';
  });
  if (!aboard) { console.log('not aboard'); process.exit(1); }
  // a run: put at a place and heading, at a height, up to speed with W held, then frames
  const runs = [
    // along Scramble Square's south face, 35 m off it and half way up, westward (the owner's "past the tall buildings")
    { name: 'tower', at: [640, -1185, 120], to: [380, -1185], frames: 60, pre: 2 },
    // between Scramble Square and Hikarie, northward, below both tops
    { name: 'between', at: [585, -1300, 110], to: [585, -950], frames: 60, pre: 2 },
    // low over the roofs west of the station at speed, the searchlight on them (the owner's third picture)
    { name: 'roofs', at: [300, -880, 60], to: [100, -700], frames: 24, pre: 3 },
    // slowly round Scramble Square's south-west corner, 30 to 50 km/h, below its top: where the visibility sweep gates what
    // is drawn (visibility.js: it lets go above about 60 km/h)
    { name: 'slow', at: [470, -1215, 140], to: [430, -1080], frames: 60, pre: 1, keys: [] },
  ].filter(r => !process.env.RUN || process.env.RUN === r.name);
  // SURVEY=1: no stills, a hundred straight runs through the towers round the station at 50 to 150 m and 40 to 180 km/h,
  // in the game's own steps (no drawing), counting the frames in which a solid stands between the lens and the
  // helicopter, the lens is in a building, or the lens jumps; each such frame printed
  if (process.env.SURVEY) {
    const r = await p.evaluate(() => {
      const g = window.__game, st = g.heli.st, c = g.camera.position, T = new THREE.Vector3(), out = [];
      let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      let frames = 0, hid = 0, inside = 0, jumps = 0, bumped = 0, spells = 0;
      for (let k = 0; k < 100; k++) {
        const x = 300 + rnd() * 450, y = -1350 + rnd() * 400, z = 50 + rnd() * 100, h = rnd() * Math.PI * 2, v = (40 + rnd() * 140) / 3.6;
        Object.assign(st, { x, y, z, vx: Math.sin(h) * v, vy: Math.cos(h) * v, vz: 0, landed: false, h });
        g.cam.yaw = h; g.cam.snap = true;
        let last = null, prevHid = false, spell = null;
        for (let i = 0; i < 150; i++) {
          g.frame(1 / 30); st.z += (z - st.z) * 0.3;
          const sp = Math.hypot(st.vx, st.vy);
          if (sp < v * 0.6) { bumped++; break; } // (into a building: put there by hand, not flown there)
          if (sp < v * 0.95) { st.vx *= v / Math.max(0.1, sp); st.vy *= v / Math.max(0.1, sp); } // (held at its speed)
          if (i < 15) { last = c.clone(); continue; }
          frames++;
          T.set(st.x, st.z + 0.8, -st.y);
          const f = g.nav.clearFraction(c.clone(), T), inB = g.nav.col && g.nav.col.topAt ? null : null;
          const jump = last ? c.distanceTo(last) : 0; last = c.clone();
          // (a helicopter under a slab, held there by this harness against the game's own push out of it, is not counted)
          const under = g.nav.groundBelow(st.x, st.y, st.z + 6) > st.z + 0.5;
          if (f < 0.98 && !under) {
            if (!prevHid) { spells++; spell = { k, i, n: 0, min: 1, at: `${st.x.toFixed(0)},${st.y.toFixed(0)},${st.z.toFixed(0)} ${Math.round(Math.hypot(st.vx, st.vy) * 3.6)} km/h` }; }
            spell.n++; spell.min = Math.min(spell.min, f); hid++;
          } else if (prevHid && spell) { out.push(`run ${spell.k} from frame ${spell.i}: hidden ${spell.n} frames (clear down to ${spell.min.toFixed(2)}) at ${spell.at}`); spell = null; }
          prevHid = f < 0.98 && !under;
          if (jump > Math.hypot(st.vx, st.vy) / 30 * 2.5 + 1) { jumps++; out.push(`run ${k} frame ${i}: lens jumped ${jump.toFixed(1)} m`); }
        }
      }
      return { frames, hid, jumps, bumped, spells, out };
    });
    console.log(`survey: ${r.frames} frames, the helicopter hidden in ${r.hid} (${r.spells} spells), the lens jumped in ${r.jumps}; ${r.bumped} runs into a building left out`);
    for (const l of r.out) console.log(l);
    await b.close().catch(() => {});
    process.exit(0);
  }
  // the page's frames from here are the harness's: each one a step of the game's own loop at 1/30 s (its simulation and its
  // drawing), with W held, so that nothing runs between them in the wall clock's time (the helicopter slowed to a hover
  // in the seconds a software renderer took over each still)
  await p.evaluate(() => {
    window.__frames = { cbs: [], t: performance.now() };
    window.requestAnimationFrame = cb => { window.__frames.cbs.push(cb); return window.__frames.cbs.length; };
    window.__frames.step = (keys = []) => { const g = window.__game, F = window.__frames; keys.forEach(k => g.keys.add(k)); F.t += 1000 / 30; const q = F.cbs; F.cbs = []; for (const f of q) f(F.t); keys.forEach(k => g.keys.delete(k)); };
  });
  await p.waitForFunction(() => window.__frames.cbs.length, null, { timeout: 30000 });
  for (const r of runs) {
    await p.evaluate(r => {
      const g = window.__game, st = g.heli.st, [x, y, z] = r.at;
      Object.assign(st, { x, y, z, vx: 0, vy: 0, vz: 0, landed: false, h: Math.atan2(r.to[0] - x, r.to[1] - y) });
      g.cam.yaw = st.h; g.cam.snap = true;
      for (let i = 0; i < r.pre * 30; i++) { g.advance(1 / 30, ['KeyW']); st.z += (r.at[2] - st.z) * 0.2; }
      for (let i = 0; i < 6; i++) { window.__frames.step(['KeyW']); st.z += (r.at[2] - st.z) * 0.2; }
    }, r);
    for (let i = 0; i < r.frames; i++) {
      const s = await p.evaluate(([z, keys]) => {
        const g = window.__game, st = g.heli.st, c = g.camera.position;
        window.__frames.step(keys); st.z += (z - st.z) * 0.2; // (held at the run's height: low over the roofs)
        const T = new (window.THREE.Vector3)(st.x, st.z + 1, -st.y), f = g.nav.clearFraction(c.clone(), T);
        return { x: +st.x.toFixed(1), y: +st.y.toFixed(1), z: +st.z.toFixed(1), kmh: Math.round(st.speed * 3.6), cam: [+c.x.toFixed(1), +(-c.z).toFixed(1), +c.y.toFixed(1)], clear: +f.toFixed(2), vis: g.heli.group.visible, gate: window.OEVis ? `${OEVis.live ? 'live' : 'off'} ${OEVis.stats.hidden}` : '', meshes: (() => { let n = 0; g.world.traverseVisible(o => { if (o.isMesh || o.isInstancedMesh) n++; }); return n; })() };
      }, [r.at[2], r.keys || ['KeyW']]);
      await p.screenshot({ path: `${out}/${phone ? 'phone' : 'desk'}-${r.name}-${String(i).padStart(3, '0')}.png` });
      console.log(`${r.name} ${i}: ${JSON.stringify(s)}`);
    }
  }
  await b.close().catch(() => {});
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
