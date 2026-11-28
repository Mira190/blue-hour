// The one you play, walking and running, measured at the skin every frame for a hand or a forearm inside their own torso
// (tools/hold_depth.js, the measure tools/clip_probe.js's hold reads a few times a second in every play), and looked at
// from three sides, close, with time held, at the deepest frame of each gait (issue 157: main's run 578 failed storyp on
// "you / L hand, 0.103 m" at frame 6, played by touch on a phone's page, while the player ran).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/hold_pose.js out_dir [WxH]       (TIER=low PHONE: a phone's page with 390x844; SECS=n a gait, 6)
// Prints for each gait the deepest reading of each hand and forearm, the clip at full weight, and where the point lay from
// the feet in the body's own frame. Exits 1 on a reading past tools/hold_depth.js's limit in three frames of a gait.
const { chromium } = require('playwright');
const fs = require('fs');
const H = require('./hold_depth');
const [,, out = '/tmp/hold-pose', size = '1440x900'] = process.argv;
const SECS = +process.env.SECS || 6, DT = 0.05;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  await p.addInitScript(H.script);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('gt-play').click());
  await p.waitForFunction(() => { const g = window.__game; return g.player && g.player.rig && g.player.rig.root && !g.player.rig.pending; }, null, { timeout: 600000, polling: 500 });
  await p.waitForTimeout(8000);
  await p.evaluate(() => { const g = window.__game; if (g.cine && g.cine.active && g.cine.skip) g.cine.skip(); });
  await p.waitForTimeout(2000);
  let bad = 0;
  const tag = phone ? 'phone' : 'desk', shotAt = {};
  const shoot = async name => {
    for (const [side, ang] of [['front', 0], ['left', Math.PI / 2], ['right', -Math.PI / 2], ['back', Math.PI]]) {
      await p.evaluate(ang => {
        const g = window.__game, T = window.THREE, o = g.player, S = window.__look = window.__look || { pose: { pos: new T.Vector3(), look: new T.Vector3() } };
        const hd = o.h + ang, dx = Math.sin(hd), dy = Math.cos(hd);
        S.pose.pos.set(o.x + dx * 1.5, o.z + 1.15, -(o.y + dy * 1.5)); S.pose.look.set(o.x, o.z + 1.0, -o.y);
        g.cine.stop(); g.cine.play(() => S.pose, 1e9, { label: 'film' });
        g.frame(0);
      }, ang);
      await p.waitForTimeout(300);
      await p.screenshot({ path: `${out}/${tag}-${name}-${side}.png` });
    }
    const after = await p.evaluate(() => window.__holdDepth.measure(window.__game.player.rig.root));
    console.log(`  (as drawn in the stills: ${JSON.stringify(after)})`);
    await p.evaluate(() => window.__game.cine.stop());
  };
  for (const [gait, keys] of [['walk', ['KeyW']], ['run', ['KeyW', 'ShiftLeft']]]) {
    // (open paving by Hachiko, facing along the plaza: a straight run with nobody to stop at)
    await p.evaluate(() => { const g = window.__game; g.spawn([395, -1052]); g.player.h = Math.atan2(-1, 0.2); g.cam.yaw = g.player.h; for (let i = 0; i < 10; i++) g.frame(0.05); });
    const frames = Math.round(SECS / DT);
    const worst = {}, n = {};
    for (let i = 0; i < frames; i++) {
      const r = await p.evaluate(([keys, DT]) => {
        const g = window.__game, T = window.THREE, pl = g.player, root = pl.rig.root;
        for (const k of keys) g.keys.add(k);
        g.frame(DT);
        for (const k of keys) g.keys.delete(k);
        window.__holdDepth.where = true; const m = window.__holdDepth.measure(root); window.__holdDepth.where = false;
        if (!m) return null;
        const wh = m.where || {}; delete m.where;
        const mx = pl.rig.mixer, clips = mx && mx._actions ? mx._actions.filter(a => a.isRunning() && a.getEffectiveWeight() > 0.05).map(a => `${a.getClip().name} ${a.getEffectiveWeight().toFixed(2)} @${a.time.toFixed(2)}`).join(', ') : '';
        const at = {}; for (const k in wh) { const l = new T.Vector3(...wh[k]); root.worldToLocal(l); at[k] = [+l.x.toFixed(2), +l.y.toFixed(2), +l.z.toFixed(2)]; }
        return { m, clips, at, speed: +pl.speed.toFixed(2) };
      }, [keys, DT]);
      if (!r) { console.log(`${gait}: the player's model has no torso to measure`); break; }
      // (the first frame of a gait past twice the limit is looked at as it is, time held, before the next frame: played again
      // from the start the same frame read nothing, the arm's springs being where the frames' pace left them)
      const top = Math.max(...Object.values(r.m));
      if (top > 2 * H.limitOf('you') && !shotAt[gait]) { shotAt[gait] = i; await shoot(`${gait}-at`); console.log(`  ${gait}: frame ${i} read ${JSON.stringify(r.m)} (${r.clips}); stills ${tag}-${gait}-at-*`); }
      for (const k in r.m) {
        if (r.m[k] > H.limitOf('you')) n[k] = (n[k] || 0) + 1;
        if (!worst[k] || r.m[k] > worst[k].d) worst[k] = { d: r.m[k], i, clips: r.clips, at: r.at[k], speed: r.speed };
      }
    }
    for (const k in worst) {
      const x = worst[k], over = (n[k] || 0) >= 3;
      if (over) bad++;
      console.log(`${over ? 'FAIL' : 'ok  '} ${gait} ${k}: deepest ${x.d} m at frame ${x.i} (${x.clips}; ${x.speed} m/s; at ${JSON.stringify(x.at || null)} from the feet), ${n[k] || 0} frames past ${H.limitOf('you')}`);
    }
    // the deepest frame of the deepest part played again from the start, and looked at from three sides with time held
    const k = Object.keys(worst).sort((a, b2) => worst[b2].d - worst[a].d)[0];
    if (!k || !(worst[k].d > 0.01)) continue;
    await p.evaluate(() => { const g = window.__game; g.spawn([395, -1052]); g.player.h = Math.atan2(-1, 0.2); g.cam.yaw = g.player.h; for (let i = 0; i < 10; i++) g.frame(0.05); });
    await p.evaluate(([keys, DT, upto]) => { const g = window.__game; for (let i = 0; i <= upto; i++) { for (const k of keys) g.keys.add(k); g.frame(DT); for (const k of keys) g.keys.delete(k); } }, [keys, DT, worst[k].i]);
    const again = await p.evaluate(() => { const m = window.__holdDepth.measure(window.__game.player.rig.root); return m; });
    console.log(`  ${gait}: played again to frame ${worst[k].i}: ${JSON.stringify(again)}`);
    for (const [side, ang] of [['front', 0], ['left', Math.PI / 2], ['right', -Math.PI / 2]]) {
      await p.evaluate(ang => {
        const g = window.__game, T = window.THREE, o = g.player, S = window.__look = window.__look || { pose: { pos: new T.Vector3(), look: new T.Vector3() } };
        const hd = o.h + ang, dx = Math.sin(hd), dy = Math.cos(hd);
        S.pose.pos.set(o.x + dx * 1.7, o.z + 1.1, -(o.y + dy * 1.7)); S.pose.look.set(o.x, o.z + 0.95, -o.y);
        g.cine.stop(); g.cine.play(() => S.pose, 1e9, { label: 'film' });
        for (let i = 0; i < 3; i++) g.frame(0);
      }, ang);
      await p.waitForTimeout(400);
      await p.screenshot({ path: `${out}/${tag}-${gait}-${side}.png` });
    }
    await p.evaluate(() => window.__game.cine.stop());
  }
  await b.close();
  console.log(bad ? `hold_pose: ${bad} part(s) past the limit` : 'hold_pose: no hand or forearm past the limit');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
