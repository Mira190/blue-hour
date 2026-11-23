// The main thread's script a frame in a frame of the story, by function and by file (issue 130, "CPU"): the page
// as a player has it, begun from the title and left standing, with one frame in DRAW drawn so that a software
// renderer's frame is the script and not the rasteriser. The same view before and after a change compares the two.
//   node tools/crowd_cost.js [WxH] [seconds]     (FROM=4: the fifth frame; a width under 500 is an iPhone's page)
//   HZ=60: the crowd's update alone, called `seconds` of its time at sixty a second (a player's pace: see below)
//   THROTTLE=4: the main thread's CPU slowed four times (a phone's), the times then divided by it
//   WARM=seconds the page is left before the sampling (25); DRAW=n (240); OUT=file: the profile kept (.cpuprofile)
//   LAYOUTS=n: only the count of the walkers' and the cars' hidden layouts, failing over n (the check)
//   TURN=1: with STILLS, eight stills, the camera turned by a drag between them
//   STILLS=dir: five stills a second apart of frames drawn whole, after the sampling (the crowd moving)
// Prints the frames run, the script a frame, the heaviest files and functions by self time a frame, and what the
// crowd held (walkers simulated, near people drawn) at the end. The milliseconds are this machine's.
const { chromium } = require('playwright');
const fs = require('fs');
const { skip, whole } = require('./draw_skip');
const [,, size = '1440x900', secs = '30'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500, RATE = +process.env.THROTTLE || 1;
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  args.push('--js-flags=--allow-natives-syntax'); // (for the count of layouts below: V8's own word on whether two objects are laid out alike)
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +process.env.DPR || (phone ? 3 : 1), hasTouch: phone, isMobile: phone,
    ...(phone ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' } : {}) });
  const errors = []; p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  if (process.env.FROM) await p.addInitScript(n => { try { localStorage.setItem('bh-story-late', JSON.stringify({ fi: n, left: 7 - n, prints: Array.from({ length: n }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, +process.env.FROM);
  await skip(p, +process.env.DRAW || 240);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${process.env.Q || ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(4000);
  for (let k = 0; k < 15; k++) {
    if (await p.evaluate(() => { const t = document.getElementById('g-title'); if (!t || t.hidden) return true; const x = document.getElementById('gt-play'); if (x) x.click(); return false; })) break;
    await p.waitForTimeout(1500);
  }
  await p.evaluate(() => { window.__frames = 0; const f = () => { window.__frames++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const cdp = await p.context().newCDPSession(p);
  if (RATE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  // (what a frame pays once and never again is let end first: the crowd's ways worked out a slice a frame, the shaders' first use)
  await p.waitForFunction(() => { const c = window.__game && window.__game.crowd; return !c || !c.crossings || !!c.ways; }, null, { timeout: 600000, polling: 1000 }).catch(() => console.log("the crowd's ways were not ready after ten minutes"));
  await p.waitForTimeout(1000 * (+process.env.WARM || 25));
  const state = () => p.evaluate(() => { const g = window.__game, s = g.story && g.story.state, c = g.crowd; let walk = 0, plaza = 0, seen = 0;
    if (c) for (let i = 0; i < c.active; i++) { const q = c.P[i]; if (q.line < 0 && !q.pz) continue; if (q.pz) plaza++; else walk++; if (c.seen(q.x, q.y, q.z)) seen++; }
    // (layouts: how many different hidden layouts the walkers' objects have, and the cars'. A field read in a loop over
    // them is quick while they are a few; 1,600 walkers had 159, each field added where it was first needed, issue 130)
    let same = null; try { same = new Function('a', 'b', 'return %HaveSameMap(a, b)'); } catch (e) { /* the flag is off */ }
    const layouts = L => { if (!same || !L) return null; const reps = []; for (const o of L) if (!reps.some(r => same(r, o))) reps.push(o); return reps.length; };
    return { fi: s ? s.fi + 1 : 0, phase: s ? s.phase : '', tier: window.OEQuality.tier().name, crowd: c ? { pool: c.P.length, active: c.active, walking: walk, plaza, seen, layouts: layouts(c.P) } : null, cars: g.cars && g.cars.C ? { n: g.cars.C.length, layouts: layouts(g.cars.C) } : null }; });
  console.log(`before: ${JSON.stringify(await state())}`);
  // (the road test's kept search against the one it stands for: every walker's place and eight points round it)
  console.log(await p.evaluate(() => { const g = window.__game, N = g.roadNet, c = g.crowd, o = {}; if (!N || !N.nearD || !c) return 'nearD: not there to compare'; let n = 0, bad = 0;
    for (let i = 0; i < c.active; i++) { const q = c.P[i]; if (q.line < 0 && !q.pz) continue; for (let k = 0; k < 9; k++) { const x = q.x + (k ? Math.cos(k) * k * 1.3 : 0), y = q.y + (k ? Math.sin(k) * k * 1.3 : 0), a = N.nearest(x, y, 8), b = N.nearD(x, y, 8, o); n++; if (!a !== !b || (a && (a.line !== b.line || a.d !== b.d))) bad++; } }
    return `nearD against nearest at ${n} points: ${bad ? bad + ' DIFFER' : 'the same line and distance at every one'}`; }));
  // LAYOUTS=n: the check (tools/check.sh mem): no more than n hidden layouts among the walkers, nor among the cars. A
  // field first set on one of them outside the literal that makes it (actors.js crowd(), traffic()'s whole()) splits
  // them again, and every read of a field in their steps goes the slow way without anything else showing it.
  if (+process.env.LAYOUTS) {
    const st = await state(), most = +process.env.LAYOUTS, bad = [['walkers', st.crowd && st.crowd.layouts], ['cars', st.cars && st.cars.layouts]].filter(([, n]) => n == null || n > most);
    console.log(bad.length ? `LAYOUTS: ${bad.map(([k, n]) => `${n == null ? 'no count of' : n + ' layouts among'} the ${k}`).join(', ')} (${most} at most): name the new field where they are made, actors.js crowd() and traffic()'s whole()` : `layouts: the walkers ${st.crowd.layouts}, the cars ${st.cars.layouts} (${most} at most)`);
    await b.close(); process.exit(bad.length ? 1 : 0);
  }
  // HZ=60: the crowd's own step alone, at a device's pace. On a software renderer a frame takes a third of a second,
  // the game moves a twentieth of a second in it, and whatever steps by the time gone by (a walker out of the picture,
  // ten times a second) steps every other frame as it would at twenty frames a second: not a player's sixty. So the
  // crowd's update is called here as the game last called it (the same centre, the same player, the camera where it
  // is), `seconds` of the crowd's time at 1/HZ a call, each call timed and all of them profiled.
  if (+process.env.HZ) {
    await p.evaluate(() => { const c = window.__game.crowd, u = c.update; window.__cu = null; c.update = function (...a) { window.__cu = a; return u.apply(this, a); }; window.__cuRaw = u; });
    await p.waitForFunction(() => !!window.__cu, null, { timeout: 120000 });
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
    const r = await p.evaluate(([hz, secs]) => { const g = window.__game, c = g.crowd, a = window.__cu.slice(), dt = 1 / hz, n = Math.round(hz * secs), T = new Float64Array(n);
      for (let k = 0; k < n; k++) { a[0] = dt; a[3] += dt; const t0 = performance.now(); window.__cuRaw.apply(c, a); T[k] = performance.now() - t0; }
      const S = Array.from(T).sort((x, y) => x - y); return { n, mean: S.reduce((x, y) => x + y, 0) / n, med: S[n >> 1], p90: S[Math.floor(n * 0.9)] }; }, [+process.env.HZ, +secs]);
    const { profile } = await cdp.send('Profiler.stop');
    if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(profile));
    const by = new Map(profile.nodes.map(x => [x.id, x.callFrame])), fn = new Map(), file = new Map();
    profile.samples.forEach((id, i) => { const f = by.get(id), ms = profile.timeDeltas[i] / 1000 / RATE; if (!f.url || !/^https?:/.test(f.url)) return; const u = /vendor\/three\//.test(f.url) ? 'three.js' : f.url.replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
      file.set(u, (file.get(u) || 0) + ms); const k = `${f.functionName || '(anon)'} ${u}:${f.lineNumber + 1}`; fn.set(k, (fn.get(k) || 0) + ms); });
    const top = (m, k) => [...m].sort((x, z) => z[1] - x[1]).slice(0, k).map(([name, v]) => `  ${(v / r.n).toFixed(3).padStart(7)}  ${name}`).join('\n');
    console.log(`${size}${phone ? ' (a phone)' : ''}, frame ${(+process.env.FROM || 0) + 1}: the crowd's update at ${process.env.HZ} a second, ${r.n} calls: mean ${(r.mean / RATE).toFixed(2)} ms, median ${(r.med / RATE).toFixed(2)}, slowest tenth from ${(r.p90 / RATE).toFixed(2)}${RATE > 1 ? ` (the CPU slowed ${RATE} times, the times divided by it)` : ''}`);
    console.log(`by file, ms a call:\n${top(file, 8)}\nby function, ms a call:\n${top(fn, +process.env.TOP || 24)}`);
    console.log(`after: ${JSON.stringify(await state())}`);
    if (errors.length) console.log(`page errors: ${errors.slice(0, 5).join(' | ')}`);
    await b.close(); return;
  }
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
  const n0 = await p.evaluate(() => window.__frames); await p.waitForTimeout(+secs * 1000);
  const n = (await p.evaluate(() => window.__frames)) - n0, { profile } = await cdp.send('Profiler.stop');
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(profile));
  const by = new Map(profile.nodes.map(x => [x.id, x.callFrame])), fn = new Map(), file = new Map(); let busy = 0;
  profile.samples.forEach((id, i) => { const f = by.get(id), ms = profile.timeDeltas[i] / 1000 / RATE; if (/^\((idle|root|program)\)$/.test(f.functionName)) return;
    const u = f.url.replace(/^https?:\/\/[^/]+\//, '').split('?')[0], where = !f.url ? `(browser${f.functionName.startsWith('(') ? ': ' + f.functionName.slice(1, -1) : ''})` : /vendor\/three\//.test(u) ? 'three.js' : /^https?:/.test(f.url) ? u : '(harness)';
    busy += ms; file.set(where, (file.get(where) || 0) + ms); const k = `${f.functionName || '(anon)'} ${where}${f.url ? ':' + (f.lineNumber + 1) : ''}`; fn.set(k, (fn.get(k) || 0) + ms); });
  const top = (m, k) => [...m].sort((a, z) => z[1] - a[1]).slice(0, k).map(([name, v]) => `  ${(v / n).toFixed(2).padStart(6)}  ${name}`).join('\n');
  console.log(`${size}${phone ? ' (a phone)' : ''}, frame ${(+process.env.FROM || 0) + 1}: ${n} frames in ${secs} s, script ${(busy / n).toFixed(1)} ms a frame${RATE > 1 ? ` (the CPU slowed ${RATE} times, the times divided by it)` : ''}`);
  console.log(`by file, ms a frame:\n${top(file, 16)}\nby function, ms a frame:\n${top(fn, +process.env.TOP || 40)}`);
  console.log(`after: ${JSON.stringify(await state())}`);
  if (process.env.STILLS) { // (five seconds of the crowd moving, each still of a frame drawn whole)
    fs.mkdirSync(process.env.STILLS, { recursive: true }); if (RATE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    // (TURN=1: the camera turned a sixth of the screen's width between stills, by a drag: the edge of the view is where a
    // walker stepped coarsely out of the picture becomes one drawn)
    const turn = async () => { if (!process.env.TURN) return; const y = h * 0.45; await p.mouse.move(w * 0.5, y); await p.mouse.down(); for (let k = 1; k <= 8; k++) await p.mouse.move(w * 0.5 + k * w / 48, y); await p.mouse.up(); };
    for (let k = 0; k < (process.env.TURN ? 8 : 5); k++) { await whole(p, () => p.screenshot({ path: `${process.env.STILLS}/${phone ? 'phone' : 'desktop'}-${k}.png`, timeout: 120000 })); await turn(); await p.waitForTimeout(1000); }
  }
  if (errors.length) console.log(`page errors: ${errors.slice(0, 5).join(' | ')}`);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
