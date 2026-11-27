// Every avatar the street casts, through every clip it holds something in, measured: how deep the forearms, the hands and
// what the right hand holds go inside the person's own torso (tools/hold_depth.js), five times a second through each clip, as
// people.js poses them (rig.animate, with whatever it lays over the clip). One clip file per sex drives every avatar of
// that sex, so a pose made on one body plays on broader ones: the owner saw a texting forearm inside a jacket. people.js
// lays the arms out of the body over the clip (armsClear); each moment is measured as posed and as the clip alone, and the
// wrists are watched for a jerk the correction would add (a change of pace from one frame to the next).
//   node tools/hold_check.js [out.json]        # web/ on PORT (8871): the server there, or one of its own; exits 1 on a limb in a body or a jerk
//   CLIPS=Phone,Drink CHARS=R_a,R_b node tools/hold_check.js
// The cast: the walkers drawn as people (game.json crowd.cast) and the map's named people (game.json npcs), both sexes.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const H = require('./hold_depth');
const WEB = path.join(__dirname, '..', 'web'), PORT = +(process.env.PORT || 8871);
const CLIPS = (process.env.CLIPS || 'Phone,Reading,Documents,Drink,Photo,Talk,Idle').split(',');
const EVERY = +(process.env.EVERY || 6); // frames between two depth readings (a fifth of a second)
const KICK = 0.006, KICK0 = 0.004; // m per frame per frame: a wrist's pace changed by more than this, and by KICK0 more than the
// clip alone changes it, is a jerk the correction added
const out = process.argv[2];

function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ktx2': 'image/ktx2', '.bin': 'application/octet-stream' };
  return new Promise(res => {
    const s = http.createServer((q, r) => {
      const f = path.join(WEB, decodeURIComponent(q.url.split('?')[0]));
      if (!f.startsWith(WEB)) { r.writeHead(403); r.end(); return; }
      fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
    }).listen(PORT, () => res(s));
  });
}

(async () => {
  const G = JSON.parse(fs.readFileSync(path.join(WEB, 'data/shibuya/game.json')));
  let chars = [...G.crowd.cast.f, ...G.crowd.cast.m, ...G.npcs.map(n => n.look.character)].filter(c => /^R_/.test(c));
  chars = [...new Set(process.env.CHARS ? process.env.CHARS.split(',') : chars)];
  // (the server of the run when one answers, tools/check.sh's, whose log keeps what this read; else one of its own)
  const up = await new Promise(res => http.get(`http://localhost:${PORT}/game/lineup.html`, r => { r.resume(); res(r.statusCode === 200); }).on('error', () => res(false)));
  const srv = up ? null : await serve();
  const b = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 320, height: 240 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 400)));
  await p.addInitScript(H.script);
  await p.goto(`http://localhost:${PORT}/game/lineup.html?chars=${chars.join(',')}&labels=0&shadows=0&t=0&gap=1.2`);
  await p.waitForFunction('window.__ready || (document.getElementById("err") && document.getElementById("err").textContent)', null, { timeout: 300000 });
  if (errs.length) console.log(errs.join('\n'));
  const R = await p.evaluate(async ({ CLIPS, EVERY }) => {
    const L = window.__lineup, rows = [], O = OEPeople.opts, v = new THREE.Vector3();
    for (const clip of CLIPS) {
      for (const { rig } of L.rigs) {
        const look = rig.look, act = rig.mixer._actions.find(a => a.getClip().name === clip);
        if (!act) { rows.push({ character: look.character, clip, missing: true }); continue; }
        rig.setLook({ clip });
        const dur = act.getClip().duration, mode = 'ground', dt = 1 / 30; // (Talk as what one waits doing: 'talk' would wave first)
        const worst = {}, alone = {}, wr = { on: [], off: [] };
        const wrists = () => { const o = []; rig.root.traverse(b => { if (b.isBone && /_[RL]_Hand$/.test(b.name)) o.push(b.getWorldPosition(v).clone()); }); return o; };
        const keep = (into, m, t) => { if (m) for (const n in m) if (!into[n] || m[n] > into[n][0]) into[n] = [m[n], +t.toFixed(2)]; };
        // the clip alone, then as the page poses it: each from the clip's start, a second in to let the fade from the last
        // clip end, then the whole clip at 30 frames a second
        for (const on of [false, true]) {
          O.clearArms = on; rig.animate(0, 0, mode, 100); act.time = 0; // (the clip playing first, then both passes from its start: play() begins it at a moment of the person's own)
          for (let t = 0; t < 1; t += dt) rig.animate(dt, 0, mode, 100);
          for (let k = 0, n = Math.ceil(dur / dt); k < n; k++) {
            rig.animate(dt, 0, mode, 100);
            (on ? wr.on : wr.off).push(wrists());
            if (k % EVERY === 0) keep(on ? worst : alone, window.__holdDepth.measure(rig.root), k * dt);
          }
        }
        let moved = 0;
        wr.on.forEach((w, k) => w.forEach((p, i) => { moved = Math.max(moved, p.distanceTo(wr.off[k][i])); }));
        // how hard the wrists change their pace from one frame to the next (a jerk of the correction shows here)
        const kick = W => { let m = 0; for (let k = 1; k < W.length - 1; k++) for (let i = 0; i < W[k].length; i++) m = Math.max(m, W[k + 1][i].clone().add(W[k - 1][i]).sub(W[k][i]).sub(W[k][i]).length()); return m; };
        rows.push({ character: look.character, clip, dur: +dur.toFixed(2), worst, alone, moved: +moved.toFixed(3), kick: +kick(wr.on).toFixed(4), kick0: +kick(wr.off).toFixed(4) });
        await new Promise(r => setTimeout(r, 0));
      }
    }
    O.clearArms = true;
    return rows;
  }, { CLIPS, EVERY });
  await b.close(); if (srv) srv.close();
  let bad = 0;
  const f = (w, n) => (w[n] ? `${w[n][0].toFixed(3)}@${String(w[n][1]).padEnd(5)}` : '-'.padEnd(11));
  for (const clip of CLIPS) {
    console.log(`\n${clip.padEnd(36)} R forearm   R hand      L forearm   L hand      held        (m inside the torso @ s; as made)  moved  kick`);
    for (const r of R.filter(x => x.clip === clip)) {
      if (r.missing) continue;
      const over = Object.keys(r.worst).filter(n => r.worst[n][0] > H.limitOf(r.character)), jerk = r.kick > Math.max(KICK, r.kick0 + KICK0);
      if (over.length || jerk) bad++;
      const was = Math.max(...Object.values(r.alone).map(x => x[0]));
      console.log(`${over.length || jerk ? 'FAIL' : '  ok'} ${r.character.padEnd(34)} ${['R_forearm', 'R_hand', 'L_forearm', 'L_hand', 'held'].map(n => f(r.worst, n)).join(' ')} (${was.toFixed(3)})  ${r.moved.toFixed(3)}  ${r.kick.toFixed(4)}/${r.kick0.toFixed(4)}${jerk ? ' a jerk' : ''}`);
    }
  }
  if (out) fs.writeFileSync(out, JSON.stringify(R, null, 1));
  const n = R.filter(r => !r.missing), asMade = n.filter(r => Math.max(...Object.values(r.alone).map(x => x[0])) > H.LIMIT).length;
  console.log(`\nhold: ${n.length} avatar-clips measured; as the clips were made ${asMade} had a limb or a held thing over ${H.LIMIT} m inside the torso, as the page poses them ${bad} (or a jerk)`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
