// The walk's line (docs/STORY.md "The walk's line"; issue 164): stills of its opening and its beats, taken in the page
// itself at the places and hours the line names, for the storyboard and for looking at a change to the incident.
// Sets out on the walk from a fresh page (no film: ?overture=0), then takes what SET asks:
//   - SET=open: the first minute as it falls, a still every EVERY seconds for SECS seconds from the landing (the man
//     through the crowd, the shoulder, her on the ground), then beside her: the prompt, her talk, the photograph asked;
//   - SET=beats: each later beat's place at its hour (the menu's clock set to it), the people stood where the line has
//     them: a storyboard, staged with the people that exist.
// Prints where the line's people are at each still and what the corner says.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/walk_line.js out_dir [WxH] [hour] [sky]     (390x844: a phone; hour blue|night, sky clear|rain)
const { chromium } = require('playwright');
const fs = require('fs');
const { skip, whole } = require('./draw_skip');
const [,, out = '/tmp/walk-line', size = '1440x900', hour = 'blue', sky = 'clear'] = process.argv;
const PORT = process.env.PORT || 8800, SETS = (process.env.SET || 'open').split(',');
const SECS = +(process.env.SECS || 14), EVERY = +(process.env.EVERY || 2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const [w, h] = size.split('x').map(Number), phone = w < 500, tag = phone ? 'phone' : 'desk';
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  await skip(p, +(process.env.DRAW || 6)); // (one frame in six drawn between the stills: the street's clock nearer the wall's on a software renderer)
  let bad = 0;
  p.on('pageerror', e => { bad++; console.log(`pageerror: ${String(e).slice(0, 300)}`); });
  p.on('console', m => { if (/unavailable|rror/.test(m.text())) console.log(`console: ${m.text().slice(0, 240)}`); });
  p.on('crash', () => { console.log('the page crashed'); process.exit(1); });
  await p.addInitScript(([t, sp, seen]) => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-player', 'W'); if (!sessionStorage.getItem('wl-once')) { sessionStorage.setItem('wl-once', '1'); sessionStorage.setItem('bh-walk-auto', JSON.stringify(sp)); if (seen) localStorage.setItem('bh-walk-talk', JSON.stringify({ last: { part: 2, met: false, done: true, inc: 'helped', rested: true } })); } } catch (e) { /* storage blocked */ } },
    [process.env.TIER || (phone ? 'low' : 'high'), { t: hour, w: sky }, !SETS.includes('open')]);
  const t0 = Date.now(), el = () => `${Math.round((Date.now() - t0) / 1000)}s`;
  await p.goto(`http://localhost:${PORT}/?overture=0`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  const set = await p.waitForFunction(() => { const s = document.getElementById('game-stage'); return !!s && /\bwalk-on\b/.test(s.className) && window.__game; }, null, { timeout: 40 * 60000, polling: 250 }).then(() => true, () => false);
  if (!set) { console.log('the walk did not set out'); await b.close(); process.exit(1); }
  console.log(`${el()} out on the walk`);
  const say = () => p.evaluate(() => {
    const g = window.__game, P = g.player, L = g.walkLine ? g.walkLine() : null, q = s => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent.trim() : ''; };
    return `you ${P.x.toFixed(1)},${P.y.toFixed(1)}${L ? `; line ${JSON.stringify(L)}` : ''}; corner "${q('#g-walk-where .q')}"; prompt "${q('#g-prompt')}"; box "${q('#gd').slice(0, 90)}"`;
  });
  const shot = async name => { await whole(p, () => p.screenshot({ path: `${out}/${tag}-${name}.png`, timeout: 120000 }).catch(() => console.log(`(no still ${name})`))); console.log(`${el()} ${name}: ${await say()}`); };
  const stand = (at, yaw, pitch = -0.05, dist = 5) => p.evaluate(([at, yaw, pitch, dist]) => { const g = window.__game; g.spawn(at); g.player.h = yaw; g.cam.yaw = yaw; g.cam.pitch = pitch; g.cam.dist = dist; }, [at, yaw, pitch, dist]);
  const yawTo = (a, c) => Math.atan2(c[0] - a[0], c[1] - a[1]);
  const act = async () => { if (phone) { const r = await p.locator('#g-prompt').first().boundingBox().catch(() => null); if (r) await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); } else await p.keyboard.press('e'); };
  const next = async () => { if (phone) await p.touchscreen.tap(w / 2, h * 0.86); else await p.keyboard.press('Enter'); };

  console.log(`${el()} ${await say()}`);
  if (SETS.includes('probe')) { await p.waitForTimeout(6000); console.log(`${el()} ${await say()}`); console.log(await p.evaluate(async () => { const g = window.__game, n = g.npcById('nagi'), t = performance.now(); let r = 'none'; try { r = await Promise.race([g.npcLoad(n).then(() => 'loaded'), new Promise(q => setTimeout(() => q('timeout 60 s'), 60000))]); } catch (e) { r = `threw ${e}`; } return `nagi loading ${!!n.loading} away ${!!n.away} -> ${r} after ${Math.round(performance.now() - t)} ms; pending ${!!n.rig.pending}; others ${['mei', 'oda', 'riko', 'shun'].map(i => { const m = g.npcById(i); return `${i}:${m.rig.pending ? 'pending' : 'in'}`; }).join(' ')}`; })); console.log(`${el()} ${await say()}`); }
  if (SETS.includes('open')) {
    // (her character comes a while after the street does on a software renderer: the incident waits for her, and so do the stills)
    await shot('0-landed');
    const L = (fn, arg, ms = 15 * 60000) => p.waitForFunction(fn, arg, { timeout: ms, polling: 50 }).then(() => true, () => false);
    const gap = () => { const g = window.__game, l = g.walkLine(), n = g.npcById('nagi'); return l && l.man && n ? Math.hypot(l.man[0] - n.x, l.man[1] - n.y) : 99; };
    if (!(await L(() => { const l = window.__game.walkLine(); return l && l.ph && l.ph !== 'wait'; }))) console.log('THE INCIDENT NEVER BEGAN');
    await shot('1-sets-off');
    await L(`(${gap})() < 3.2`); await shot('2-comes');
    await L(() => window.__game.walkLine().ph === 'hit'); await shot('3-shoulder');
    await L(() => window.__game.walkLine().ph === 'down'); await shot('4-down');
    await L(`(${gap})() > 5`); await shot('5-walks-on');
    // beside her: what is offered, what she says, what she asks
    const at = await p.evaluate(() => { const n = window.__game.npcById('nagi'); return n ? [n.x, n.y] : null; });
    const me = [at[0] + 1.3, at[1] - 2.0]; // (on the square's side of her: the crossing is behind her)
    await stand(me, yawTo(me, at), -0.1, 3.4);
    await L(() => /Help/.test((document.getElementById('g-prompt') || {}).textContent || ''), null, 60000); await shot('6-beside');
    await act();
    const box = () => p.evaluate(() => { const e = document.getElementById('gd'); return e && !document.getElementById('gd').hidden ? e.textContent.trim() : ''; });
    let last = '';
    for (let i = 0; i < 12; i++) {
      await L(t => { const d = document.getElementById('gd'); return !d || d.hidden || d.textContent.trim() !== t; }, last, 40000);
      const t = await box(); if (!t) break;
      await p.waitForTimeout(1500); last = await box(); if (!last) break;
      if (i < 5) await shot(`7-says-${i}`);
      await next();
    }
    await L(() => { const e = document.querySelector('#g-walk-where .q'); return e && !e.hidden && /Photograph/.test(e.textContent); }, null, 60000); await shot('8-asked');
    // the photograph: the camera up, her in it, the crossing behind
    await p.evaluate(() => { const g = window.__game, n = g.npcById('nagi'); g.photoMode(true); const me = document.getElementById('ph-me'); if (me && me.getAttribute('aria-pressed') === 'true') me.click(); g.photo.anchor.set(n.x, n.z + 1.25, -n.y); g.photo.focus.copy(g.photo.anchor); Object.assign(g.photo, { dist: innerWidth < 500 ? 3.6 : 3.0, pitch: 0.06 }); });
    await p.waitForTimeout(2500); await shot('9-finder');
    const took = await p.evaluate(() => { const g = window.__game; g.snapPhoto(); g.photoMode(false); const e = g.walkTalk().errand(); return e ? e.text : ''; });
    console.log(`the photograph taken: the corner says "${took}"`);
    await L(() => /Talk to Nagi/.test((document.getElementById('g-prompt') || {}).textContent || ''), null, 60000); await act();
    last = '';
    for (let i = 0; i < 12; i++) {
      await L(t => { const d = document.getElementById('gd'); return !d || d.hidden || d.textContent.trim() !== t; }, last, 40000);
      const t = await box(); if (!t) break;
      await p.waitForTimeout(1500); last = await box(); if (!last) break;
      if (i === 3) await shot('10-last-train');
      await next();
    }
    await p.waitForTimeout(2500); await shot('11-told');
  }
  if (SETS.includes('beats')) {
    // the later beats, as a storyboard: the menu's clock at the beat's hour, her stood where the line has her, you beside
    const BOARD = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'views/walk_line.json'), 'utf8')).beats;
    await p.waitForFunction(() => { const n = window.__game.npcById('nagi'); return n && n.rig && !n.rig.pending; }, null, { timeout: 15 * 60000, polling: 500 }).catch(() => console.log('Nagi never came'));
    for (const bt of BOARD) {
      await p.evaluate(([hm, id, at]) => { const g = window.__game, [hh, mm] = hm.split(':').map(Number); g.setClock(g.clock.y, g.clock.m, g.clock.d, hh * 60 + mm); const n = g.npcById(id); if (n) g.npcMove(n, at); }, [bt.at, 'nagi', bt.stand]);
      await stand(bt.you, yawTo(bt.you, bt.look), bt.pitch == null ? -0.06 : bt.pitch, bt.dist || 4.2);
      await p.evaluate(s => new Promise(r => { const g = window.__game; let n = Math.round(s / 0.05); const f = () => { for (let i = 0; i < 20 && n > 0; i++, n--) g.frame(0.05); if (n > 0) setTimeout(f, 0); else r(); }; f(); }), +(process.env.SETTLE || 14));
      await shot(`beat-${bt.n}-${bt.at.replace(':', '')}`);
    }
  }
  if (SETS.includes('seat')) {
    // waiting with her on the wall: the seat's own shot a few seconds in, then the two of them from the side and from in
    // front with the world held (photo mode), to see that each sits on the stone
    const L = (fn, arg, ms = 10 * 60000) => p.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true, () => false);
    await L(() => { const n = window.__game.npcById('nagi'); return n && n.rig && !n.rig.pending; }, null, 15 * 60000);
    await p.evaluate(() => { const g = window.__game, n = g.npcById('nagi'); g.npcMove(n, [372.6, -1043.2]); g.setClock(g.clock.y, g.clock.m, g.clock.d, 19 * 60 - 20); });
    const at = await p.evaluate(() => { const n = window.__game.npcById('nagi'); return [n.x, n.y]; });
    const me = [at[0] + 0.9, at[1] + 1.6];
    await stand(me, yawTo(me, at), -0.1, 3.4);
    await L(() => /Wait with her/.test((document.getElementById('g-prompt') || {}).textContent || ''), null, 60000); await act();
    await L(() => window.__game.walkLine().wait, null, 20000);
    for (const s of [3, 8]) { await p.waitForTimeout(s === 3 ? 3000 : 5000); await shot(`s-tripod-${s}`); }
    console.log(`  seated: ${await p.evaluate(() => { const g = window.__game, n = g.npcById('nagi'), P = g.player, f = g.nav.floorAt(n.x, n.y, n.z + 1.2); return `you ${P.x.toFixed(2)},${P.y.toFixed(2)} mode ${P.mode}; her root ${n.x.toFixed(2)},${n.y.toFixed(2)} z ${n.z.toFixed(2)}, the stone there ${f ? (f.z - n.z).toFixed(2) : 'none'}`; })}`);
    for (const [name, az] of [['side', 2.0], ['front', 0.0], ['back', Math.PI]]) {
      await p.evaluate(az => { const g = window.__game, n = g.npcById('nagi'), P = g.player; g.photoMode(true); const me = document.getElementById('ph-me'); if (me && me.getAttribute('aria-pressed') !== 'true') me.click(); g.photo.anchor.set((n.x + P.x) / 2, n.z + 0.6, -(n.y + P.y) / 2); g.photo.focus.copy(g.photo.anchor); Object.assign(g.photo, { az, pitch: 0.12, dist: 3.4 }); }, az);
      await p.waitForTimeout(2000); await shot(`s-${name}`);
      await p.evaluate(() => window.__game.photoMode(false));
    }
  }
  if (SETS.includes('look')) {
    // LOOKS='[[[x,y],[lx,ly],pitch,dist],...]': stood at each, looking at the other, a still each (for finding a place)
    for (const [i, [at, lk, pitch, dist]] of JSON.parse(process.env.LOOKS || '[]').entries()) {
      await stand(at, yawTo(at, lk), pitch ?? -0.05, dist ?? 5);
      await p.waitForTimeout(6000); await shot(`look-${i}`);
      console.log(`  look ${i}: floor ${await p.evaluate(at => { const g = window.__game, f = g.nav.floorAt(at[0], at[1], 17); return f ? f.z.toFixed(2) : 'none'; }, lk)} at the place looked at`);
    }
  }
  if (SETS.includes('end')) {
    // the line's end: her story told, she is by the wall; Wait with her sits you both and the night passes until her train;
    // she stands, walks to the gate, asks for one more photograph, takes yours, goes in and turns round
    const L = (fn, arg, ms = 10 * 60000) => p.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true, () => false);
    await L(() => { const n = window.__game.npcById('nagi'); return n && n.rig && !n.rig.pending; }, null, 15 * 60000);
    await p.evaluate(() => { const g = window.__game, n = g.npcById('nagi'), t = g.walkTalk(); const s = t.state(); g.npcMove(n, [372.6, -1043.2]); });
    await p.waitForTimeout(1500);
    const at = await p.evaluate(() => { const n = window.__game.npcById('nagi'); return [n.x, n.y]; });
    const me = [at[0] + 0.9, at[1] + 1.6];
    await stand(me, yawTo(me, at), -0.1, 3.4);
    if (!(await L(() => /Wait with her/.test((document.getElementById('g-prompt') || {}).textContent || ''), null, 60000))) console.log(`NO WAIT OFFERED: ${await say()}`);
    await shot('e0-offered');
    if (process.env.START) await p.evaluate(hm => { const g = window.__game, [h, m] = hm.split(':').map(Number); g.setClock(g.clock.y, g.clock.m, g.clock.d, h * 60 + m); }, process.env.START); // (START=23:50: the wait from near the train)
    await act();
    await L(() => window.__game.walkLine().wait, null, 20000); await p.waitForTimeout(2500); await shot('e1-sat');
    console.log(`  seated: ${await p.evaluate(() => { const g = window.__game, n = g.npcById('nagi'), f = g.nav.floorAt(n.x, n.y, n.z + 1.2); return `her root ${n.x.toFixed(2)},${n.y.toFixed(2)} at ${n.z.toFixed(2)}; the floor under her hips ${f ? (f.z - n.z).toFixed(2) + ' m over her feet' : 'none'}`; })}`);
    for (const m of (process.env.START ? ['23:59'] : ['18:59', '20:59', '23:59'])) { if (await L(hm => { const g = window.__game, [h, mm] = hm.split(':').map(Number); return !g.walkLine().wait || g.clock.min >= h * 60 + mm + 1.5; }, m, 8 * 60000)) { await shot(`e2-${m.replace(':', '')}`); console.log(`  over her: "${await p.evaluate(() => [...document.querySelectorAll('.g-walk-bark')].filter(e => +getComputedStyle(e).opacity > 0.1).map(e => e.textContent).join(' | '))}"`); } }
    await L(() => window.__game.walkLine().gate, null, 10 * 60000); await p.waitForTimeout(1200); await shot('e3-up');
    await L(() => window.__game.walkLine().gate === 'ask', null, 25 * 60000);
    const gt = await p.evaluate(() => { const n = window.__game.npcById('nagi'); return [n.x, n.y]; });
    const gm = [gt[0] - 2.4, gt[1] + 0.6];
    await stand(gm, yawTo(gm, gt), -0.06, 3.2); await p.waitForTimeout(1500); await shot('e4-gate');
    await L(() => /Talk to Nagi/.test((document.getElementById('g-prompt') || {}).textContent || ''), null, 30000); await act();
    for (let i = 0; i < 6; i++) { await p.waitForTimeout(2600); if (!(await p.evaluate(() => { const d = document.getElementById('gd'); return d && !d.hidden; }))) break; if (i === 1) await shot('e5-ask'); await next(); }
    await L(() => window.__game.walkLine().gate === 'shot', null, 20000);
    await p.evaluate(() => { const g = window.__game, n = g.npcById('nagi'); g.photoMode(true); const me = document.getElementById('ph-me'); if (me && me.getAttribute('aria-pressed') === 'true') me.click(); g.photo.anchor.set(n.x, n.z + 1.25, -n.y); g.photo.focus.copy(g.photo.anchor); Object.assign(g.photo, { dist: 3.0, pitch: 0.05 }); });
    await p.waitForTimeout(2500); await shot('e6-finder');
    await p.evaluate(() => { const g = window.__game; g.snapPhoto(); g.photoMode(false); });
    for (let k = 0; k < 4; k++) { await L(() => /Talk to Nagi/.test((document.getElementById('g-prompt') || {}).textContent || ''), null, 30000); await p.waitForTimeout(800); await act(); if (await L(() => { const d = document.getElementById('gd'); return d && !d.hidden; }, null, 8000)) break; console.log('  (E did not open her talk: again)'); }
    for (let i = 0; i < 8; i++) { await p.waitForTimeout(2600); if (!(await p.evaluate(() => { const d = document.getElementById('gd'); return d && !d.hidden; }))) { await p.waitForTimeout(1200); if (!(await p.evaluate(() => { const d = document.getElementById('gd'); return d && !d.hidden; }))) break; } if (i === 2) await shot('e7-you'); await next(); }
    await L(() => window.__game.walkLine().gate === 'going', null, 20000); await p.waitForTimeout(3500); await shot('e8-turns');
    const gone = await L(() => window.__game.walkLine().w === 'gone', null, 90000); await shot('e9-gone');
    console.log(`the line's end: ${gone ? 'she is gone' : 'SHE NEVER WENT'}; ${await say()}`);
    if (process.env.MEI) { // (after it, Mei's mark from fourteen metres, as tools/walk_play.js looks for it)
      await p.evaluate(() => { const g = window.__game, t = g.walkTalk(); t.startAt('hachiko'); const n = g.npcs.find(q => q.id === 'mei'); g.spawn([n.x + 14, n.y]); g.player.h = Math.atan2(-14, 0); g.cam.yaw = g.player.h; });
      for (let i = 0; i < 6; i++) { await p.waitForTimeout(5000); console.log(`  mei ${i}: ${JSON.stringify(await p.evaluate(() => { const g = window.__game, n = g.npcs.find(q => q.id === 'mei'), c = g.camera.position; return { marks: [...document.querySelectorAll('.g-walk-mark')].map(e => `${e.dataset.k}:${e.style.opacity}`), cine: !!(g.cine && g.cine.active), dlg: g.dlg.open, photo: g.photo.on, seen: !g.nav.col.pick(c.x, -c.z, c.y, n.x, n.y, n.z + 1.6), talking: !!n.talking, layer: document.querySelector('.g-walk-marks').className }; }))}`); }
      await shot('mei-14');
    }
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
