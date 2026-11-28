// The walk's opening (cities/shibuya/city.json game.walk.overture, played by web/game/overture.js from game.js
// startWalk; docs/STORY.md "The walk's opening"), looked at as a player sees it: the page opened as the story's last card
// opens it for a walk (no title to press, the walk set out at the hour and under the sky given, here with its film), the film let run, and
// then held on a virtual clock (tools/film/clock.js) while each shot is sought and a still of the page taken at a few
// points through it, with the bars, the title and the names over it. Prints, shot by shot, the camera's lowest
// clearance over the map's surface model and its height, and fails a shot that goes within 4 m of a roof (the land
// shot, which comes down to the chase camera, is left out) or of a tree's crown (any shot), a film that does not play, or an error on the page.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/walk_open.js out_dir [WxH] [hour] [sky]        (hour blue|night|live, sky clear|rain)
// K=0.1,0.5,0.9 (the points of each shot), SHOTS=a,b (those shots only), TIER=high|medium|low, GAME_TIME=13:00 (the
// wall clock "live" reads, tools/pin_clock.js), FILM=1 (every frame of the film at FPS (24) as JPEGs in out_dir/frames,
// and out_dir/walk-open.mp4 with its score), VIEWS=file.json (no film: free cameras over the walk, for scouting, as
// tools/scramble_shot.js's views with absolute heights: {"views": [{"name", "eye": [x, y, z], "look": [x, y, z], "fov"}]}).
const { chromium } = require('playwright');
const { landPitch } = require('./land_pitch');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pinClock } = require('./pin_clock.js');
const [,, out = '/tmp/walk-open', size = '1440x900', hour = 'blue', sky = 'clear'] = process.argv;
const [W, H] = size.split('x').map(Number), phone = W < 600, tag = phone ? 'phone' : 'desk';
const KS = String(process.env.K || '0.1,0.5,0.9').split(',').map(Number);
const ONLY = process.env.SHOTS ? process.env.SHOTS.split(',') : null;
const FPS = +(process.env.FPS || 24);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => { errors.push(`pageerror: ${String(e).slice(0, 300)}`); console.log(`  [page] ${errors[errors.length - 1]}`); });
  p.on('console', m => { if (m.type() === 'error' || /overture|walk film/.test(m.text())) console.log(`  [page] ${m.type()}: ${m.text().slice(0, 240)}`); });
  await p.addInitScript({ path: path.join(__dirname, 'film', 'clock.js') });
  await p.addInitScript(([t, spec]) => {
    try { localStorage.setItem('bh-quality', t); sessionStorage.setItem('bh-walk-auto', JSON.stringify(spec)); } catch (e) { /* storage blocked */ }
  }, [process.env.TIER || 'high', { t: hour, w: sky, film: true }]); // (film: as Set out plays it; from the last card it does not)
  if (pinClock) await pinClock(p, 'shibuya');
  const t0 = Date.now();
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${process.env.VIEWS ? '?overture=0' : ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const shoot = async (name, jpeg = false) => {
    const f = path.join(out, `${tag}-${hour}-${sky}-${name}.${jpeg ? 'jpg' : 'png'}`);
    await p.screenshot({ path: f, type: jpeg ? 'jpeg' : 'png', quality: jpeg ? 90 : undefined, timeout: 180000 });
    return f;
  };
  // (the page's frame back on the virtual clock: its next frame, asked of the real one before the clock was started, has
  // come and asked again. Stepped before that, nothing ran, and a still was of the frame drawn last: two stills alike)
  const vtOn = () => p.waitForFunction(() => __vt.pending > 0, null, { timeout: 180000, polling: 50 }).catch(() => console.log('  (no frame came back to the virtual clock)'));
  const step = (n, ms = 1000 / FPS) => p.evaluate(([n, ms]) => { for (let i = 0; i < n; i++) __vt.step(ms); }, [n, ms]);
  // a hero level near the camera still loading: the page let run in real time until it is drawn (its warm-up runs in the
  // page's own frames, which a software renderer draws a second or more apart), the film held where it was meanwhile
  const level = async () => {
    const busy = () => p.evaluate(() => { const g = window.__game, h = g.hero && g.hero(); return !!h && h.state().some(q => q.state === 'loading'); });
    if (!(await busy())) return 0;
    const k = await p.evaluate(() => { const o = window.__game.overture(); return o && o.active ? o.t / o.total : null; });
    await p.evaluate(() => __vt.stop());
    const t = Date.now();
    while (Date.now() - t < 900000 && await busy()) { if (k != null) await p.evaluate(k => window.__game.cine.seek(k), k); await p.waitForTimeout(1000); }
    await p.evaluate(() => __vt.start());
    await vtOn();
    if (k != null) await p.evaluate(k => window.__game.cine.seek(k), k);
    console.log(`  (a level drawn ${Math.round((Date.now() - t) / 1000)} s later)`);
    return Date.now() - t;
  };

  if (process.env.VIEWS) {
    const spec = JSON.parse(fs.readFileSync(process.env.VIEWS, 'utf8'));
    await p.waitForFunction(() => document.getElementById('game-stage').classList.contains('walk-on'), null, { timeout: 900000, polling: 500 });
    console.log(`out on the walk in ${Math.round((Date.now() - t0) / 1000)} s`);
    await p.waitForTimeout(3000);
    await p.evaluate(() => {
      __vt.start();
      const g = window.__game;
      document.getElementById('game-stage').classList.add('overture'); // (the HUD hidden as in a film)
      window.__shot = { pose: { pos: new THREE.Vector3(), look: new THREE.Vector3() }, fov: 50 };
      const cam = g.camera, upm = cam.updateProjectionMatrix.bind(cam);
      cam.updateProjectionMatrix = () => { cam.fov = window.__shot.fov; upm(); };
      g.cine.play(() => window.__shot.pose, 1e9, { label: 'film' });
    });
    await level();
    for (const v of spec.views) {
      if (ONLY && !ONLY.includes(v.name)) continue;
      await p.evaluate(v => {
        const S = window.__shot, Wv = (x, y, z) => new THREE.Vector3(x, z, -y);
        S.pose.pos.copy(Wv(...v.eye)); S.pose.look.copy(Wv(...v.look)); S.fov = v.fov || 45;
        window.__game.Wd.fitShadow(S.pose.look, Math.min(1600, S.pose.pos.distanceTo(S.pose.look) * 1.2));
      }, v);
      await step(6, 40);
      console.log(await shoot(v.name));
    }
    if (errors.length) console.log(errors.slice(0, 10).join('\n'));
    await b.close();
    return;
  }

  // the film: it must start as the walk sets out
  const began = await p.waitForFunction(() => { const g = window.__game, o = g && g.overture && g.overture(); return !!(o && o.active && o.walk); }, null, { timeout: 900000, polling: 200 }).then(() => true, () => false);
  if (!began) { console.log('FAIL the walk set out and its opening did not play'); await shoot('no-film'); await b.close(); process.exit(1); }
  await p.evaluate(() => __vt.start());
  await vtOn();
  const info = await p.evaluate(() => { window.__game.cine.seek(0); const o = window.__game.overture(); return { total: o.total, t: o.t, shots: o.shots.map(s => ({ id: s.id, t0: s.t0, dur: s.dur, type: s.type })) }; });
  await level(); // (the level under the player, which a player's title fetches while they choose: drawn before the film is looked at)
  console.log(`the walk's opening began ${Math.round((Date.now() - t0) / 1000)} s after the page opened: ${info.total.toFixed(1)} s, ${info.shots.map(s => `${s.id} ${s.dur}`).join(', ')}`);
  // the cut against the surface model: the lowest clearance of the camera over what is under it, and its height
  const clear = await p.evaluate(() => {
    const G = window.__game, o = G.overture(), D = G.DSM, res = [];
    const dsm = (x, y) => { const c = Math.floor((x - D.x0) / D.cell), r = Math.floor((D.y1 - y) / D.cell); return c < 0 || r < 0 || c >= D.nx || r >= D.ny ? 0 : D.data[r * D.nx + c]; };
    for (const s of o.shots) {
      // (a land shot comes down from where the shot before it ends, which the film sets as it cuts: set here, as the cut would)
      const i = o.shots.indexOf(s);
      if (s.type === 'land' && i > 0) { const e = o.sample(o.shots[i - 1], 1); o.setFrom({ pos: e.pos, look: e.look }); }
      let lo = Infinity, at = 0, top = -Infinity, bot = Infinity, where = null;
      for (let j = 0; j <= 60; j++) {
        const q = o.sample(s, j / 60), x = q.pos.x, y = -q.pos.z, z = q.pos.y;
        let m = Infinity; // (the highest surface within 3 m of the camera, not only straight under it)
        for (const [dx, dy] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) m = Math.min(m, z - dsm(x + dx, y + dy));
        if (m < lo) { lo = m; at = j / 60; where = [Math.round(x), Math.round(y), Math.round(z)]; }
        top = Math.max(top, z); bot = Math.min(bot, z);
      }
      // and the trees: how near the camera comes to a crown (its foot, how high its lowest leaves hang, how far out it
      // reaches and how high its top is, as web/trees.js draws it); a crown close under a low camera fills the frame
      // (a crown as an ellipsoid between its lowest leaves and its top, as wide as it reaches: inside it the lens is in the
      // leaves; near it, it counts only if it is ahead of the lens, within 60 degrees of where it looks)
      let tree = { d: Infinity };
      const T = G.Wd && G.Wd.trees, tr = T ? T.trunks() : [], cw = T && T.crowns ? T.crowns() : [];
      for (let j = 0; j <= 60; j++) {
        const q = o.sample(s, j / 60), x = q.pos.x, y = -q.pos.z, z = q.pos.y, lx = q.look.x - q.pos.x, ly = -q.look.z + q.pos.z, lz = q.look.y - q.pos.y, ll = Math.hypot(lx, ly, lz) || 1;
        for (let i = 0, c = 0; i < tr.length; i += 4, c += 3) {
          const h = Math.hypot(tr[i] - x, tr[i + 1] - y);
          if (h > 60) continue;
          const lo = tr[i + 2] + cw[c], hi = tr[i + 2] + cw[c + 2], cz = (lo + hi) / 2, rz = Math.max(0.5, (hi - lo) / 2), rr = Math.max(0.5, cw[c + 1]);
          const e = Math.hypot(h / rr, (z - cz) / rz), d = e <= 1 ? 0 : (e - 1) * Math.min(rr, rz);
          const dx = tr[i] - x, dy = tr[i + 1] - y, dz = cz - z, dl = Math.hypot(dx, dy, dz) || 1, ahead = (dx * lx + dy * ly + dz * lz) / (dl * ll) > 0.5;
          if ((d === 0 || ahead) && d < tree.d) tree = { d, k: j / 60, at: [Math.round(tr[i]), Math.round(tr[i + 1])], top: Math.round(hi) };
        }
      }
      res.push({ id: s.id, type: s.type, clear: +lo.toFixed(1), at: +at.toFixed(2), where, z: [Math.round(bot), Math.round(top)], tree });
      if (s.type === 'land') o.setFrom(null);
    }
    return res;
  });
  for (const c of clear) {
    const bad = c.type !== 'land' && c.clear < 4;
    const tb = c.tree.d < 4; // (through a crown, or within 4 m of one: its leaves fill the frame)
    console.log(`${bad || tb ? 'FAIL' : 'ok  '} ${c.id.padEnd(8)} clearance ${String(c.clear).padStart(6)} m (at k ${c.at}, ${c.where.join(', ')}), height ${c.z[0]}-${c.z[1]} m; nearest crown ${c.tree.d === Infinity ? '-' : `${c.tree.d.toFixed(1)} m (at k ${c.tree.k.toFixed(2)}, the tree at ${c.tree.at.join(', ')}, top ${c.tree.top} m)`}`);
    if (bad) errors.push(`${c.id}: the camera passes ${c.clear} m over a roof`);
    if (tb) errors.push(`${c.id}: the camera passes ${c.tree.d.toFixed(1)} m from a tree's crown (at ${c.tree.at.join(', ')})`);
  }
  // the land shot read whole, at every hundredth of it: never tipped onto the tops of heads (issue 239; tools/land_pitch.js)
  const lp = await landPitch(p);
  if (!lp) errors.push('the walk\'s opening has no land shot to read');
  else if (!lp.ok) errors.push(`${lp.id} at k ${lp.at}: the look ${lp.worst} degrees under the horizon from ${lp.y} m, past the bound of ${lp.bound} (the chase camera's own ${lp.chase}): onto the tops of heads`);
  else console.log(`ok   ${lp.id}: the look at most ${lp.worst} degrees under the horizon (at k ${lp.at}, ${lp.y} m up) over ${lp.n} points of the shot, the bound ${lp.bound}`);
  if (process.env.FILM) {
    const dir = path.join(out, 'frames'); fs.mkdirSync(dir, { recursive: true });
    await p.evaluate(() => window.__game.cine.seek(0));
    const n = Math.round(info.total * FPS), tf = Date.now();
    for (let i = 0; i < n; i++) {
      await step(1);
      if (i === Math.round(info.shots[info.shots.length - 1].t0 * FPS)) await level(); // (the level under the player drawn before the camera comes down to it, as the page holds for it)
      await p.screenshot({ path: path.join(dir, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92, timeout: 180000 });
      if (i % 48 === 0) console.log(`frame ${i}/${n}, ${((Date.now() - tf) / 1000 / (i + 1)).toFixed(2)} s a frame`);
    }
    const pcm = await p.evaluate(async () => {
      const o = window.__game.overture();
      if (!window.OEFilmScore) await new Promise((ok, no) => { const el = document.createElement('script'); el.src = 'film-score.js'; el.onload = ok; el.onerror = no; document.head.appendChild(el); });
      const ch = await OEFilmScore.render(o.scorePlan()), m = ch[0].length, buf = new Int16Array(m * 2);
      for (let i = 0; i < m; i++) { buf[2 * i] = Math.max(-1, Math.min(1, ch[0][i])) * 32767; buf[2 * i + 1] = Math.max(-1, Math.min(1, ch[1][i])) * 32767; }
      let s = ''; const u8 = new Uint8Array(buf.buffer);
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    });
    const raw = Buffer.from(pcm, 'base64'), hd = Buffer.alloc(44);
    hd.write('RIFF', 0); hd.writeUInt32LE(36 + raw.length, 4); hd.write('WAVEfmt ', 8); hd.writeUInt32LE(16, 16); hd.writeUInt16LE(1, 20); hd.writeUInt16LE(2, 22);
    hd.writeUInt32LE(48000, 24); hd.writeUInt32LE(48000 * 4, 28); hd.writeUInt16LE(4, 32); hd.writeUInt16LE(16, 34); hd.write('data', 36); hd.writeUInt32LE(raw.length, 40);
    const wav = path.join(out, 'score.wav'), mp4 = path.join(out, `walk-open-${tag}-${hour}-${sky}.mp4`), dur = n / FPS;
    fs.writeFileSync(wav, Buffer.concat([hd, raw]));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.jpg'), '-i', wav,
      '-af', `afade=t=out:st=${(dur - 1.5).toFixed(2)}:d=1.5`, '-t', dur.toFixed(3), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', mp4]);
    console.log(`${mp4}: ${n} frames, ${dur.toFixed(1)} s`);
  } else {
    for (const s of info.shots) {
      if (ONLY && !ONLY.includes(s.id)) continue;
      for (const k of KS) {
        const t = s.t0 + k * s.dur;
        // (sought, a few frames for the ground's detail and the type, a level near the camera drawn, and sought again: the
        // still is of that moment)
        await p.evaluate(k => window.__game.cine.seek(k), t / info.total);
        await step(4);
        await level();
        await p.evaluate(k => window.__game.cine.seek(k), t / info.total);
        await step(1);
        console.log(await shoot(`${s.id}-${Math.round(k * 100)}`));
        if (s.type === 'land') { // (never tipped onto the tops of heads, issue 239: the land shot's look at most 25 degrees under the horizon, or the chase camera's own)
          const dn = await p.evaluate(() => { const c = window.__game.camera, T = window.THREE, d = c.getWorldDirection(new T.Vector3()); return { pitch: Math.asin(d.y) * 180 / Math.PI, y: c.position.y }; });
          if (dn.pitch < -25) errors.push(`${s.id} at k ${k}: the camera looks ${(-dn.pitch).toFixed(0)} degrees down from ${dn.y.toFixed(1)} m, onto the tops of heads`);
          else console.log(`ok   ${s.id} at k ${k}: the look ${(-dn.pitch).toFixed(0)} degrees under the horizon from ${dn.y.toFixed(1)} m`);
        }
      }
    }
  }
  // and the end: skipped from the last shot, the walk comes to you (its corner up, the film gone)
  await p.evaluate(() => { window.__game.cine.seek(0.985); });
  for (let i = 0; i < 400; i++) { await step(3, 40); if (await p.evaluate(() => document.getElementById('game-stage').classList.contains('walk-on'))) break; }
  const end = await p.evaluate(() => { const g = window.__game, o = g.overture(); return { on: document.getElementById('game-stage').classList.contains('walk-on'), film: !!(o && o.active), bars: document.getElementById('game-stage').classList.contains('letterbox'), mode: g.player.mode }; });
  if (!end.on || end.film || end.bars) errors.push(`the film ended and the walk did not come to you: ${JSON.stringify(end)}`);
  else console.log('ok   the film ends on your shoulder, and the walk is yours');
  await step(30, 40);
  console.log(await shoot('control'));
  for (const e of errors) console.log(`FAIL ${e}`);
  await b.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
