// The mix, place by place (docs/SOUND.md "The mix, place by place"; issue 127): the owner heard the trains on SHIBUYA
// SKY's roof, 229 m up, as at the kerb. This stands the player at set listening points on the real page (the kerb at
// Hachiko, the kerb by the station with the viaduct beside it, under the railway's deck, SKY GATE's lift, the roof,
// the helicopter's cabin, the car's), lets the game drive its own sound there, and reads the level of each of the
// world's buses from the audio graph (an AnalyserNode on each bus's output: its RMS over four seconds, dBFS). Each
// must stand in the range docs/SOUND.md's table gives for that place: the table is read from the page, so the two
// cannot drift. A train is run past each point on a voice of its own (the nearest point of the real tracks, 54 km/h),
// through audio.js trainAt as trains.js calls it, so the same train is measured at every place. It also fails when:
//   - the game does not take a point for the place it is (the mix it chose);
//   - under the deck the train is not weight and rumble alone: more than 0.5 % of the rail bus's power is over 500 Hz
//     (the wheels' edge, which the deck is between you and), or not a fifth or less of that share at the kerb by the
//     station, where the same train is a pass-by with its wheels in it (1.5 % or more);
//   - at a Stop anything of the moving world is heard past the tape (a touch screen's deck: under -70 dBFS; with a
//     mouse the tape's held shimmer of the last moment is all there is: 6 dB or more under the running street).
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   tools/job.sh run places -- xvfb-run -a node tools/sound_places.js            (PHONE=1: as a touch screen, 390x844)
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const PHONE = process.env.PHONE === '1', SEC = +(process.env.SEC || 4);
// the table: | place | near | rail | weather | self | city |, each cell "-40 to -30" or "silent" (under -70 dBFS)
function table() {
  const md = fs.readFileSync(path.join(__dirname, '..', 'docs', 'SOUND.md'), 'utf8'), at = md.indexOf('<!-- sound_places:table -->');
  if (at < 0) throw new Error('docs/SOUND.md has no sound_places table');
  const rows = {};
  for (const line of md.slice(at).split('\n').slice(1)) {
    if (!line.startsWith('|')) { if (Object.keys(rows).length) break; continue; }
    const c = line.split('|').slice(1, -1).map(s => s.trim());
    const key = (/`([a-z-]+)`/.exec(c[0]) || [])[1];
    if (!key) continue;
    rows[key] = c.slice(1, 6).map(cell => {
      const t = cell.replace(/−/g, '-');
      if (/silent/.test(t)) return [-Infinity, -70];
      const m = /(-?\d+(?:\.\d+)?) to (-?\d+(?:\.\d+)?)/.exec(t);
      if (!m) throw new Error(`docs/SOUND.md: cannot read "${cell}" for ${key}`);
      return [+m[1], +m[2]];
    });
  }
  return rows;
}
(async () => {
  const T = table();
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } : { viewport: { width: 800, height: 500 }, deviceScaleFactor: 1 });
  await p.addInitScript(phone => {
    try { localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ }
    if (phone) Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
  }, PHONE);
  const logs = [];
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&weather=clear${PHONE ? '&shed=0' : ''}#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(async () => {
    const g = window.__game, A = window.OEAudio;
    if (g.overture && g.overture() && g.overture().active && g.overture().skip) g.overture().skip();
    A.start(); if (A.ctx && A.ctx.state !== 'running') await A.ctx.resume();
    // (the episode's hour, whatever hour the walk opened at: it opens at the place's own, and after midnight the
    // street is empty; the crowd mustered again for the hour)
    g.clock.scale = 1; g.clock.min = 17 * 60 + 30; g.clock.own = true; g.crowdAuto(true); for (let i = 0; i < 20; i++) g.advance(0.5);
    g.hold(true);
  });
  await p.waitForFunction(() => window.OEAudio.ctx && window.OEAudio.ctx.state === 'running', null, { timeout: 60000 });
  // the taps: an analyser on each bus's output, on the world's bus and after the tape
  await p.evaluate(() => {
    const A = window.OEAudio, an = window.__an = {};
    for (const k of [...A.BUSES, 'world', 'tape']) { const n = A.ctx.createAnalyser(); n.fftSize = 32768; n.smoothingTimeConstant = 0; A.tap(k).connect(n); an[k] = n; }
    window.__buf = new Float32Array(32768); window.__spec = new Float32Array(16384);
  });
  // the world run for `sec` of the wall's time with the player kept where `pin` puts them and a train run past on a
  // voice of its own; the levels read over the last `read` seconds
  const listen = (pin, sec, read, o = {}) => p.evaluate(async ([pinSrc, sec, read, o]) => {
    const g = window.__game, A = window.OEAudio, an = window.__an, buf = window.__buf, pinFn = pinSrc ? new Function('g', pinSrc) : null;
    const TR = (g.G && g.G.trains && g.G.trains.tracks) || [];
    const nearest = e => { let best = null, bd = Infinity; for (const t of TR) for (let i = 0; i < t.p.length; i += 3) { const x = t.p[i] / 10, y = t.p[i + 1] / 10, z = t.p[i + 2] / 10 + 1.5, d = Math.hypot(x - e.x, y - e.y, z - e.z); if (d < bd) { bd = d; best = { x, y, z, d }; } } return best; };
    const pw = {}, lo = {}; let n = 0, t0 = performance.now(), last = t0, railLow = 0, railAll = 0, railHigh = 0, tr = null;
    while (performance.now() - t0 < sec * 1000) {
      if (pinFn) pinFn(g);
      g.advance(0.1);
      const c = g.camera.position, ear = { x: c.x, y: -c.z, z: c.y, under: g.soundPlace() === 'deck' };
      tr = nearest(ear);
      if (tr && !o.noTrain) A.trainAt(3, { near: tr.d, above: tr.z - 1.5 - ear.z, v: 15, a: 0, len: 20, pan: 0, under: ear.under, at: tr, pts: [], ear }, 0.1);
      else A.trainAt(3, null, 0.1);
      await new Promise(r => setTimeout(r, 90));
      const now = performance.now();
      if (now - t0 > (sec - read) * 1000 && now - last > 340) {
        last = now; n++;
        for (const k of Object.keys(an)) { an[k].getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; pw[k] = (pw[k] || 0) + s / buf.length; }
        const sp = window.__spec; an.rail.getFloatFrequencyData(sp);
        const hz = A.ctx.sampleRate / 32768; for (let i = 1; i < sp.length; i++) { const v = Math.pow(10, sp[i] / 10); railAll += v; if (i * hz < 200) railLow += v; if (i * hz > 500) railHigh += v; }
      }
    }
    const db = {}; for (const k of Object.keys(pw)) db[k] = pw[k] > 0 ? +(10 * Math.log10(pw[k] / n)).toFixed(1) : -Infinity;
    const c = g.camera.position, W = g.weather && g.weather.state;
    return { db, place: g.soundPlace(), mix: A.mixNow, mode: g.player.mode, ear: [+c.x.toFixed(0), +(-c.z).toFixed(0), +c.y.toFixed(0)], train: tr ? +tr.d.toFixed(0) : null, railLow: railAll > 0 ? +(railLow / railAll).toFixed(2) : null, railHigh: railAll > 0 ? +(railHigh / railAll).toFixed(3) : null, rain: W ? W.rain : 0, hour: +(g.clock.min / 60).toFixed(2), near: g.sound() ? g.sound().near : 0 };
  }, [pin, sec, read, o]);
  const foot = (x, y, z) => `if (g.player.mode !== 'foot') return; const f = g.nav.floorAt(${x}, ${y}, 400); g.player.x = ${x}; g.player.y = ${y}; g.player.z = ${z != null ? z : `f ? f.z : g.nav.terrain(${x}, ${y})`}; g.player.speed = 0; g.player.vz = 0; g.player.ground = true;`;
  // under the railway's deck east of the station: the first place along the main line where the rail is 4 m or more
  // over the street and the game hears a roof over the ears
  const deck = await p.evaluate(async () => {
    const g = window.__game, TR = (g.G.trains && g.G.trains.tracks) || [], S = ((g.G.look || {}).sound || {}).station || [430, -1070];
    const cand = [];
    for (const t of TR) for (let i = 0; i < t.p.length; i += 3) { const x = t.p[i] / 10, y = t.p[i + 1] / 10, z = t.p[i + 2] / 10, gz = g.nav.terrain(x, y), d = Math.hypot(x - S[0], y - S[1]); if (z - gz > 4 && z - gz < 14 && d > 40 && d < 260 && x > S[0]) cand.push([d, x, y, gz]); }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, x, y, gz] of cand.filter((c, i) => i % 3 === 0).slice(0, 60)) {
      if (g.player.mode !== 'foot') break;
      g.player.x = x; g.player.y = y; g.player.z = gz; g.player.ground = true; g.player.vz = 0;
      g.advance(0.1); g.advance(0.3);
      if (g.soundPlace() === 'deck' && Math.hypot(g.player.x - x, g.player.y - y) < 2) return [+x.toFixed(1), +y.toFixed(1)];
    }
    return null;
  });
  const out = [], fails = [], fail = m => { fails.push(m); console.log('FAIL', m); };
  const judge = (key, want, r) => {
    const row = T[key];
    if (!row) { fail(`docs/SOUND.md's table has no row \`${key}\``); return; }
    const cells = ['near', 'rail', 'weather', 'self', 'city'].map((k, i) => { const v = r.db[k], [lo, hi] = row[i], ok = (v >= lo || (lo === -Infinity && !(v > hi))) && v <= hi; if (!ok) fail(`${key}: the ${k} bus at ${v} dBFS, outside ${lo === -Infinity ? 'silent (under -70)' : `${lo} to ${hi}`}`); return `${k} ${String(v).padStart(6)}${ok ? '' : '!'}`; });
    console.log(`${key.padEnd(13)} ${cells.join('  ')}   (mix ${r.mix}, ${r.mode}, ear ${r.ear}, the train ${r.train} m off, ${r.near} people near at ${r.hour} h, rail under 200 Hz ${r.railLow}, over 500 Hz ${r.railHigh})`);
    if (want && r.place !== want) fail(`${key}: the game mixes this place as "${r.place}", not "${want}"`);
    out.push({ key, ...r });
  };
  // 1. the kerb at Hachiko (frames 1, 2, 3, 6, 7)
  judge('kerb', 'kerb', await listen(foot(380, -1028), SEC + 5, SEC));
  // 2. the kerb by the station, the viaduct beside it
  const st = await listen(foot(440, -1080), SEC + 3, SEC); judge('kerb-station', 'kerb', st);
  if (!(st.railHigh >= 0.015)) fail(`at the kerb by the station ${(st.railHigh * 100).toFixed(1)} % of the train is over 500 Hz: a pass-by has its wheels in it (1.5 % or more)`);
  // 3. under the deck
  if (!deck) fail('no place under the railway\'s deck east of the station is heard as under a deck');
  else {
    const r = await listen(foot(deck[0], deck[1]), SEC + 3, SEC); judge('deck', 'deck', r);
    if (!(r.railHigh <= 0.005 && r.railHigh <= st.railHigh / 5)) fail(`under the deck ${(r.railHigh * 100).toFixed(2)} % of the train is over 500 Hz (${(st.railHigh * 100).toFixed(1)} % at the kerb): it should be weight and rumble`);
    if (!(r.db.rail >= st.db.rail - 3)) fail(`under the deck the train (${r.db.rail} dBFS) is quieter than beside the viaduct (${st.db.rail})`);
  }
  // 4. the rain at Hachiko (frame 7)
  await p.evaluate(() => window.__game.weather.set('rain', { now: true }));
  judge('kerb-rain', 'kerb', await listen(foot(380, -1028), SEC + 5, SEC));
  await p.evaluate(() => window.__game.weather.set('clear', { now: true }));
  // 5. the roof, 229 m
  judge('roof', 'kerb', await listen(foot(541, -1124, 241.8), SEC + 4, SEC));
  // 6. a lift, riding (SKY GATE's, or the first with a car)
  const rode = await p.evaluate(() => {
    const g = window.__game, L = (g.lifts || []).filter(l => l.stops.length > 1).sort((a, b) => Math.abs(b.stops[b.stops.length - 1].at[2] - b.stops[0].at[2]) - Math.abs(a.stops[a.stops.length - 1].at[2] - a.stops[0].at[2]))[0];
    if (!L) return null;
    const s = L.stops[0]; g.player.x = s.at[0]; g.player.y = s.at[1]; g.player.z = s.at[2];
    g.rideLift(L, 0, L.stops.length - 1);
    return L.name || L.id;
  });
  if (!rode) fail('no lift to ride');
  else {
    // (to the ride itself: the car called, its doors, the steps in)
    await p.evaluate(async () => { const g = window.__game; for (let i = 0; i < 400 && !(g.soundPlace() === 'lift' && (g.player.mode !== 'lift' || i > 40)); i++) g.advance(0.05); });
    // (read from 2 s in: an analyser holds the last 0.7 s, and the roof's city, the point before, is 28 dB to close)
    judge('lift', 'lift', await listen(null, 3.6, 1.6, { }));
    await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 600 && (g.player.mode === 'lift' || g.soundPlace() === 'lift'); i++) g.advance(0.1); });
  }
  // 7. the helicopter's cabin, at its stick on the roof's pad, the rotor run up
  await p.evaluate(() => { const g = window.__game, s = g.heli.st; g.player.x = s.x + 2; g.player.y = s.y; g.player.z = s.z; g.enterHeli(); for (let i = 0; i < 80; i++) g.advance(0.1, ['Space']); });
  judge('heli', 'heli', await listen(`g.heli.st.rotor = Math.max(g.heli.st.rotor, 1);`, SEC + 2, SEC));
  await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 200 && !g.heli.st.landed; i++) g.advance(0.25, ['KeyC']); });
  // 8. the car's cabin, standing at the kerb with its engine running (a touch screen's car is parked once its late parts
  // are in, game.js afterPlayable: got into before that, there was no car, now and then)
  await p.waitForFunction(() => window.__game.myCar(), null, { timeout: 180000, polling: 500 }).catch(() => fail('your car is not parked three minutes in'));
  const car = await p.evaluate(() => {
    const g = window.__game;
    if (g.player.mode === 'heli') { g.player.mode = 'foot'; g.player.vehicle = null; }
    const f = g.nav.floorAt(380, -1028, 400); g.player.x = 380; g.player.y = -1028; g.player.z = f ? f.z : g.nav.terrain(380, -1028);
    g.advance(0.2); g.enterCar(); g.advance(0.2);
    return g.player.mode;
  });
  if (car !== 'car') fail(`could not get into the car (${car})`);
  else judge('car', 'car', await listen(null, SEC + 2, SEC));
  await p.evaluate(() => { const g = window.__game; if (g.afoot) g.afoot(); });
  // 9. the Stop, at Hachiko with a train passing: nothing of the moving world past the tape
  const live = await listen(foot(440, -1080), SEC + 2, 2);
  await p.evaluate(() => window.OEAudio.hush(true));
  const held = await listen(foot(440, -1080), 4.5, 2);
  await p.evaluate(() => window.OEAudio.hush(false));
  const back = await listen(foot(440, -1080), 4, 2);
  const tape = await p.evaluate(() => window.OEAudio.tape);
  console.log(`the Stop (${tape || 'no tape'}): past the tape ${live.db.tape} dBFS running, ${held.db.tape} held (the world's bus still at ${held.db.world}), ${back.db.tape} let go`);
  if (tape === 'deck' ? !(held.db.tape < -70) : !(held.db.tape <= live.db.tape - 6)) fail(`at a Stop the moving world is heard past the tape: ${held.db.tape} dBFS held, ${live.db.tape} running`);
  if (!(back.db.tape > live.db.tape - 6)) fail(`let go, the street did not come back: ${back.db.tape} dBFS, ${live.db.tape} before the Stop`);
  if (PHONE && tape !== 'deck') fail(`a touch screen's tape is "${tape}", not the deck`);
  for (const l of logs) fail(l);
  console.log(fails.length ? `FAIL ${fails.length}` : `PASS ${out.length} places in their ranges, the Stop silent of the moving world`);
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
