// The loading screen's three pictures (web/assets/story/late/key-1..3.webp; web/index.html .roll-art), filmed in the
// game at the hour the first episode is set (its date, the blue hour: city.json game.story.episodes[0]) with nothing of
// the game's own in frame: the map without the story (?walk=1), so no afterimage, no Stop and nothing hanging in its
// air, and every mark the game can put in the world held invisible (the goal's beam, the story's beacon, the route on
// the ground, an NPC's "!"). Only the WebGL canvas is read, so no HUD, label, caption or letterbox bar reaches a still.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/key_shot.js [tools/views/key-art.json] [out_dir]
// tools/views/kagami.json: the title's two portraits of Kagami ("who"), SIZE=1200x1600 halved (crop), to web/assets/story/late/kagami-w/m.webp.
// Writes out_dir/key-N.png (1920x1080, or SIZE=WxH) and, with WEBP=1, web/assets/story/late/key-N.webp (Pillow, the
// quality in the views file). ONLY=key-2 films one. MARKS=1 leaves the marks in (to see what the switches take out).
// A view: {"name", "eye": [x, y, dz], "look": [x, y, dz], "fov", "floor"?, "people"?: [x, y], "crowd_r", "crowd_n",
// "heli"?: [x, y, z, heading_deg, pitch_deg], "muster"?: true, "time"?: minutes after the blue hour, "stand"?: [x, y],
// "clear"?: [half_angle_deg, metres] (nobody in that wedge ahead of the lens)} (z of the helicopter over sea level; dz over the ground or the "floor").
// It prints, for each still, any mark it found visible (there should be none) and the mean brightness of the title's
// band (35-60% of the height) against the frame, so a still whose band is busier or brighter than the rest is seen.
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const [,, viewsFile = path.join(__dirname, 'views/key-art.json'), outDir = '/tmp/key-shot'] = process.argv;
const spec = JSON.parse(fs.readFileSync(viewsFile, 'utf8'));
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const ROOT = path.join(__dirname, '..');
(async () => {
  const [w, h] = (process.env.SIZE || '1920x1080').split('x').map(Number);
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.addInitScript(() => {
    try { localStorage.setItem('oe3d-quality', 'high'); localStorage.setItem('oe-route-line', 'off'); } catch (e) { /* storage blocked */ }
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, opts) {
      return get.call(this, type, /webgl/.test(type) ? Object.assign({}, opts, { preserveDrawingBuffer: true }) : opts);
    };
  });
  const logs = [];
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
  fs.mkdirSync(outDir, { recursive: true });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await startPlay(p, { asIs: true });
  await p.waitForTimeout(1500);
  const ep = await p.evaluate(() => {
    const g = window.__game;
    for (const id of ['g-title', 'g-menu', 'g-bigmap', 'g-pass']) { const el = document.getElementById(id); if (el) el.hidden = true; }
    if (g.cine.active) g.cine.skip();
    if (g.settleArrival) try { g.settleArrival(); } catch (e) { /* no arrival */ }
    g.hold(true);
    window.__shot = { pose: { pos: new THREE.Vector3(), look: new THREE.Vector3() }, fov: 50 };
    const cam = g.camera, upm = cam.updateProjectionMatrix.bind(cam);
    cam.updateProjectionMatrix = () => { cam.fov = window.__shot.fov; upm(); };
    // the episode's evening: its date, and the blue hour on it (what the story's dress() sets)
    const e = (g.G || {}).story ? g.G.story.episodes[0] : null;
    return e ? { date: e.date, light: e.light || 'blue', weather: e.weather || 'clear' } : null;
  }) || { date: [10, 10], light: 'blue', weather: 'clear' };
  // the marks: anything the game puts in the world to point at something, held invisible whatever the game sets
  const marks = !process.env.MARKS;
  await p.evaluate(marks => {
    const g = window.__game;
    window.__marks = () => {
      const found = [];
      g.Wd.world.traverse(o => {
        const m = o.material, add = m && !Array.isArray(m) && m.blending === THREE.AdditiveBlending && m.depthWrite === false;
        const gt = o.geometry && o.geometry.type;
        const mark = (o.isMesh && add && /Cylinder|Ring/.test(gt || '')) // the goal's beam, the story's beacon and its ring
          || (o.isSprite && g.npcs && g.npcs.some(n => n.marker === o)) // an NPC's "!"
          || /^stopfx/.test(o.name || '') || (o.parent && /^stopfx/.test(o.parent.name || '')) // what hangs in a Stop
          || o.userData.mark;
        if (!mark) return;
        if (o.visible) found.push(`${o.name || o.type} (${gt || ''})`);
        if (marks && !o.userData.pinned) { o.userData.pinned = true; Object.defineProperty(o, 'visible', { get: () => false, set: () => {}, configurable: true }); }
      });
      return found;
    };
    window.__marks();
  }, marks);
  const views = spec.views.filter(v => !only || only.includes(v.name));
  for (const v of views) {
    const res = await p.evaluate(async ({ v, ep, settle }) => {
      const g = window.__game, c = g.clock, [m, d] = ep.date;
      const t = (v.time != null ? v.time : 0) + window.Sun.presetTime(ep.light, c.y, m, d);
      g.setClock(c.y, m, d, t);
      if (g.weather && g.weather.set) g.weather.set(ep.weather, { now: true });
      const gz = (x, y) => { if (v.floor != null) return v.floor; const f = g.nav.floorAt(x, y, g.nav.terrain(x, y) + 0.5); return f ? f.z : Math.max(0, g.nav.terrain(x, y)); };
      const W = (x, y, z) => new THREE.Vector3(x, z, -y);
      const S = window.__shot;
      S.pose.pos.copy(W(v.eye[0], v.eye[1], gz(v.eye[0], v.eye[1]) + v.eye[2]));
      S.pose.look.copy(W(v.look[0], v.look[1], gz(v.look[0], v.look[1]) + v.look[2]));
      S.fov = v.fov || 50;
      // the player stands under the camera, out of the frame, so that the map is built and peopled round it
      const at = v.stand || v.eye;
      g.player.x = at[0]; g.player.y = at[1]; g.player.z = v.stand ? gz(at[0], at[1]) : Math.max(0, g.nav.terrain(at[0], at[1]));
      if (g.player.rig) g.player.rig.root.visible = false;
      // "who": Kagami in the frame, as a woman or a man (W, M), standing at "stand" and facing "face" (or the lens), turned
      // "turn" degrees from it: the title's two portraits
      if (v.who && g.playAs) {
        await g.playAs(v.who);
        const f = v.face || v.eye; g.player.h = Math.atan2(f[0] - at[0], f[1] - at[1]) + (v.turn || 0) * Math.PI / 180;
        g.player.rig.root.visible = true;
      }
      g.cine.stop();
      g.cine.play(() => S.pose, 1e9, { label: 'film' });
      if (v.people) {
        if (g.crowdAuto) g.crowdAuto(false);
        const C = g.crowd, net = g.footNet, cand = net.near(v.people[0], v.people[1], 0, v.crowd_r || 90), tmp = {};
        let seed = v.seed || 99;
        const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        C.active = Math.min(C.P.length, v.crowd_n || C.P.length);
        for (const q of C.P.slice(0, C.active)) {
          if (q.seat) { q.seat.by = -1; q.seat = null; }
          q.state = 'walk'; q.mode = 'ground'; q.lat = null; q.pause = 0; q.dodge = 0;
          for (let k = 0; k < 12; k++) {
            q.line = cand[Math.floor(rnd() * cand.length)]; q.s = rnd() * net.L[q.line].len; net.at(q.line, q.s, tmp);
            if (Math.hypot(tmp.x - v.eye[0], tmp.y - v.eye[1]) >= (v.clear_m || 6)) break;
          }
          q.dir = rnd() < 0.5 ? 1 : -1; q.x = tmp.x; q.y = tmp.y; q.z = tmp.z;
        }
      }
      // "muster": the crowd gathered at the Scramble's kerbs, waiting for the lights (game.js musterScramble)
      if (v.muster && g.musterScramble) g.musterScramble();
      // the helicopter, where the view puts it: rotor turning, lights on, in the air
      const H = g.heli;
      const heli = () => {
        if (!v.heli || !H) return;
        const st = H.st; [st.x, st.y, st.z] = v.heli; st.h = (v.heli[3] || 0) * Math.PI / 180; st.pitch = (v.heli[4] || 0) * Math.PI / 180; st.roll = 0;
        st.vx = st.vy = st.vz = 0; st.yawRate = 0; st.on = true; st.landed = false; st.rotor = 1;
        H.update(1e-4, {}, []); H.group.visible = true;
      };
      if (v.heli && H) { H.want(); H.show(); heli(); }
      g.advance(settle);
      // "clear": [half_angle_deg, metres]: nobody stands in that wedge straight ahead of the lens (where the title's
      // band falls on the crossing), and nobody within 3.5 m of it: those are sent out of the frame, behind the camera
      if (v.clear && g.crowd) {
        const [ha, R] = v.clear, ax = Math.atan2(v.look[0] - v.eye[0], v.look[1] - v.eye[1]);
        let k = 0;
        for (const q of g.crowd.P.slice(0, g.crowd.active)) {
          const dx = q.x - v.eye[0], dy = q.y - v.eye[1], d = Math.hypot(dx, dy);
          let da = Math.atan2(dx, dy) - ax; da = Math.atan2(Math.sin(da), Math.cos(da));
          if (d < 3.5 || (d < R && Math.abs(da) < ha * Math.PI / 180)) { q.x = v.eye[0] - Math.sin(ax) * (40 + k); q.y = v.eye[1] - Math.cos(ax) * (40 + k); k += 1.5; }
        }
        g.advance(0.05);
      }
      heli();
      if (g.hero && g.hero()) for (let i = 0; i < 1200; i++) { await new Promise(r => requestAnimationFrame(r)); if (i > 3 && !g.hero().state().some(q => q.state === 'loading')) break; }
      if (v.heli && H) { await H.want(); heli(); }
      g.Wd.fitShadow(S.pose.look, v.shadow_m || 300);
      for (let i = 0; i < 4; i++) { heli(); await new Promise(r => requestAnimationFrame(r)); }
      return { marks: window.__marks(), clock: `${c.m}/${c.d} ${String(Math.floor(c.min / 60)).padStart(2, '0')}:${String(Math.round(c.min % 60)).padStart(2, '0')}` };
    }, { v, ep, settle: +(process.env.SETTLE || v.settle || 6) });
    const png = await p.evaluate(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => res(document.getElementById('game-gl').toDataURL('image/png'))))));
    const file = path.join(outDir, `${v.name}.png`);
    fs.writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'));
    // "crop": the middle of the frame kept, that fraction of each side (a longer lens: the shot's own "fov" does not reach
    // the picture, which is at the game's 55 degrees; filmed at twice the size and halved, the portraits are at 29)
    if (v.crop) execFileSync('python3', ['-c', 'import sys; from PIL import Image; im = Image.open(sys.argv[1]); W, H = im.size; k = float(sys.argv[2]); w, h = int(W * k), int(H * k); im.crop(((W - w) // 2, (H - h) // 2, (W + w) // 2, (H + h) // 2)).save(sys.argv[1])', file, String(v.crop)]);
    // the title's band against the frame: mean luminance and detail (the mean absolute step between neighbours)
    const band = execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageStat, ImageFilter
im = Image.open(sys.argv[1]).convert('L'); W, H = im.size
def st(b):
  r = im.crop(b); e = r.filter(ImageFilter.FIND_EDGES)
  return ImageStat.Stat(r).mean[0], ImageStat.Stat(e).mean[0]
a, ae = st((0, 0, W, H)); t, te = st((0, int(H * .35), W, int(H * .60)))
print(f"band: light {t:.0f} (frame {a:.0f}), detail {te:.1f} (frame {ae:.1f})")`, file]).toString().trim();
    console.log(`${v.name}\t${res.clock}\t${band}${res.marks.length ? `\tMARKS VISIBLE: ${res.marks.join(', ')}` : ''}`);
    if (process.env.WEBP && /^(key-\d|kagami-[wm])$/.test(v.name)) {
      const dst = path.join(ROOT, 'web/assets/story/late', `${v.name}.webp`);
      execFileSync('python3', ['-c', 'import sys; from PIL import Image; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2], "WEBP", quality=int(sys.argv[3]), method=6)', file, dst, String(spec.quality || 80)]);
      console.log(`  ${path.relative(ROOT, dst)}: ${(fs.statSync(dst).size / 1024).toFixed(0)} kB`);
    }
  }
  if (logs.length) console.log(logs.slice(0, 20).join('\n'));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
