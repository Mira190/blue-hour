// Getting into the helicopter and out again, a still every few frames, from where a player stands when they press E:
// beside the pilot's door, on the far side, and behind the tail. On the walk (set out as from the story's last card, at
// blue hour, its opening film left out), where the helicopter is offered (the story itself offers it only as a flight's
// way in). Also prints, frame by frame, whether the walker stood inside the helicopter's hull and whether the camera
// was inside it (the two ways boarding was seen to clip).
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   tools/job.sh run board -- xvfb-run -a node tools/heli_board_shot.js out_dir [WxH] [from,from,...]
// WxH: 1440x900 by default, 390x844 a phone (touch, the phone's tier). from: door, far, tail (all three by default), and
// cockpit: in from the door's side and out from the cockpit view.
// Writes <out>/<WxH>-<from>-<nn>.png, a still every 0.1 s (EVERY=6: every 0.2 s), and prints a line for each frame.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [,, outDir = 'board_shots', size = '1440x900', fromArg = 'door,far,tail'] = process.argv;
const [VW, VH] = size.split('x').map(Number), phone = VW < 700, EVERY = +(process.env.EVERY || 3); // (a still every EVERY frames)
(async () => {
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  await p.addInitScript(([t, hour]) => {
    try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', '1'); sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t: hour, w: 'clear', film: false })); } catch (e) { /* storage blocked */ }
  }, [process.env.TIER || (phone ? 'low' : 'high'), process.env.HOUR || 'blue']);
  await p.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, opts) {
      return get.call(this, type, /webgl/.test(type) ? Object.assign({}, opts, { preserveDrawingBuffer: true }) : opts);
    };
  });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  fs.mkdirSync(outDir, { recursive: true });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => document.getElementById('game-stage').classList.contains('walk-on'), null, { timeout: 900000, polling: 500 });
  await p.evaluate(async () => {
    const g = window.__game;
    // (the arrival waits behind its veil, in real time, for the level round you: waited out, then eased down to you)
    for (let t = 0; t < 300 && (g.arriving() || g.cine.active); t += 0.5) { g.settleArrival(); g.advance(0.25); await new Promise(r => setTimeout(r, 500)); }
    g.hold(true);
    if (g.heli.want) await g.heli.want();
    g.advance(1);
  });
  // the whole page as a player sees it, the prompt and the buttons over the picture
  const grab = async name => { await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await p.screenshot({ path: path.join(outDir, `${name}.png`) }); };
  // where the walker and the camera are against the helicopter's hull boxes (game coordinates: x east, y north, z up)
  // (a frame of the game's at a time, 1/30 s: advance() moves the camera by one frame whatever it is given, so a longer
  // step would show its moves at a fraction of their pace)
  const probe = () => p.evaluate(() => {
    const g = window.__game;
    g.advance(1 / 30);
    const pl = g.player, cam = g.camera.position, inBox = (x, y, z, r) => g.heli.boxes().some(q => {
      const dx = x - q.x, dy = y - q.y, f = dx * Math.sin(q.h) + dy * Math.cos(q.h), s = dx * Math.cos(q.h) - dy * Math.sin(q.h);
      return Math.abs(f) < q.hl + r && Math.abs(s) < q.hw + r && z > q.z - 0.1 && z < q.z + q.top;
    });
    const a = g.currentAction();
    return { mode: pl.mode, body: pl.mode === 'foot' && inBox(pl.x, pl.y, pl.z + 0.9, 0.2), cam: inBox(cam.x, -cam.z, cam.y, 0.05), prompt: a ? a.text : '', model: g.heli.loaded(), blend: g.viewBlend.t };
  });
  const tag = `${VW}x${VH}`;
  for (const from of fromArg.split(',')) {
    // stood a few metres off, facing the helicopter, the camera settled behind the walker
    const r = await p.evaluate(async from => {
      const g = window.__game, st = g.heli.st, w = g.heli.way, V = THREE.Vector3;
      if (g.player.mode === 'heli') g.exitHeli();
      const at = { door: new V(w.stand.x - 2.5, 0, w.stand.z), cockpit: new V(w.stand.x - 2.5, 0, w.stand.z), far: new V(-w.stand.x + 3, 0, w.stand.z), tail: new V(0.6, 0, -9) }[from];
      const q = g.heli.toWorld(at);
      Object.assign(g.player, { x: q.x, y: q.y, z: st.z, mode: 'foot', auto: null, speed: 0, vz: 0, ground: true });
      g.player.h = Math.atan2(st.x - q.x, st.y - q.y);
      g.cam.yaw = g.player.h; g.cam.yawTo = null;
      g.advance(1.5);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); // (whether the helicopter is drawn is the frame's to say)
      g.advance(1 / 30);
      const a = g.currentAction();
      return a ? a.text : `no prompt (helicopter ${g.heli.group.visible ? 'seen' : 'unseen'}, ${g.heli.loaded() ? 'its model' : 'the stand-in'}, ${Math.hypot(st.x - g.player.x, st.y - g.player.y).toFixed(1)} m off, z ${st.z.toFixed(1)} and you ${g.player.z.toFixed(1)}, ${g.player.mode}, cine ${g.cine.active ? g.cine.label : "off"}, arriving ${g.arriving()})`;
    }, from);
    console.log(`${tag} ${from}: offered "${r}"`);
    if (r.startsWith('no prompt')) continue;
    await grab(`${tag}-${from}-00`);
    await p.evaluate(() => window.__game.interact());
    let n = 1, inT = null;
    const line = async (t, k) => { const s = await probe(); console.log(`${tag} ${from} ${k} t=${t.toFixed(2)} ${s.mode}${s.body ? ' BODY-IN-HULL' : ''}${s.cam ? ' CAM-IN-HULL' : ''} "${s.prompt}"${s.model ? '' : ' (stand-in model)'}`); return s; };
    // in: a still every 0.1 s until the view has come round and settled, a third of a second after (12 s at most: the
    // walk round to the door that boarding once was)
    for (let k = 1, end = null; k <= 360; k++) {
      const t = k / 30, s = await line(t, 'in');
      if (s.mode === 'heli' && inT == null) inT = t;
      if (inT != null && s.blend >= 1 && end == null) end = t + 0.34;
      if (n < 40 && k % EVERY === 0) await grab(`${tag}-${from}-${String(n++).padStart(2, '0')}`);
      if (end != null && t >= end) break;
    }
    if (inT == null) { console.log(`${tag} ${from}: never got in`); continue; }
    // and out again, from the helicopter where it stands
    await p.evaluate(cockpit => {
      const g = window.__game;
      g.heli.st.rotor = 1;
      if (cockpit) for (let i = 0; i < 4 && g.cam.mode !== 'cockpit'; i++) g.nextView();
      for (let i = 0; i < 45; i++) g.advance(1 / 30); // (a frame at a time: the change of view is a move of its own, blendFrom)
      g.interact();
    }, from === 'cockpit');
    if (from === 'cockpit') await grab(`${tag}-${from}-${String(n++).padStart(2, '0')}`);
    for (let k = 1, end = null; k <= 180; k++) {
      const t = k / 30, s = await line(t, 'out');
      if (s.mode === 'foot' && s.blend >= 1 && end == null) end = t + 0.34;
      if (n < 64 && k % EVERY === 0) await grab(`${tag}-${from}-${String(n++).padStart(2, '0')}`);
      if (end != null && t >= end) break;
    }
  }
  if (errs.length) console.log('page errors:\n' + errs.join('\n'));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
