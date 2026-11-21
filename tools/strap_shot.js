// The camera's strap round Kagami's neck, where it meets the hair: from behind and from each side behind, close, in
// daylight, standing, walking and running (four moments of each clip). The strap goes under long hair, as a strap
// does; a still of the game from behind showed it lying over the hair instead. Built with the game's own people
// (web/game/people.js), as tools/hair_shot.js is.
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   xvfb-run -a node tools/strap_shot.js out.png [H_Kagami_W] [old]
// "old" shows the camera of 1964's strap in place of Kagami's own.
// It prints, for each still, how many pixels of the strap show (the strap drawn in one colour, everything else black
// and in its way) and how many would with the head and its hair taken away, and fails when a view from straight
// behind shows more than two fifths of it on a character with long hair (LONG below): under the hair the strap
// shows only where it comes out beside the hair onto the collar (a sixth of it); over the hair, all of it.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [,, out = '/tmp/strap_shot.png', who = 'H_Kagami_W', which = 'own'] = process.argv;
const LONG = ['H_Kagami_W'];
const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000;overflow:hidden">
<script type="importmap">{"imports": {"three": "../vendor/three/three.module.min.js", "three/addons/": "../vendor/three/addons/"}}</script>
<script type="module">
import * as T from 'three';
import { GLTFLoader } from '../gltf.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
T.ColorManagement.enabled = false;
window.THREE = Object.assign({}, T, { GLTFLoader, SkeletonUtils });
addEventListener('error', e => console.error(String(e.error && e.error.stack || e.message)));
for (const f of ['face.js', 'people.js']) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = f; s.onload = res; s.onerror = rej; document.head.append(s); });
const W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
document.body.prepend(renderer.domElement);
const L = c => new THREE.Color(c).convertSRGBToLinear();
const scene = new THREE.Scene(); scene.background = L(0xa9c0d8);
scene.add(new THREE.HemisphereLight(L(0xdbe8f5), L(0x8f8676), 1.6));
const sun = new THREE.DirectionalLight(L(0xfff1dc), 2.8); sun.position.set(-3, 8, 4); scene.add(sun);
const lib = await OEPeople.load('../assets/people/');
await lib.require(${JSON.stringify(who)});
const rig = OEPeople.person(lib, { character: ${JSON.stringify(who)}, clip: 'Idle' });
scene.add(rig.root);
const OLD = ${JSON.stringify(which === 'old')};
const straps = [], rest = [], hairs = [];
rig.root.traverse(o => {
  const n = (o.isMesh && o.material && o.material.name) || '';
  if (/^camera_/.test(n)) { const mine = /^camera_strap/.test(n) && (n === 'camera_strap1964') === OLD; o.visible = mine || (!OLD && !/^camera_strap/.test(n)); if (mine) straps.push(o); }
  else if (o.isMesh) { rest.push(o); if (/_opacity$|_head$/.test(n)) hairs.push(o); }
});
const head = new THREE.Vector3(), neck = new THREE.Vector3();
const cam = new THREE.PerspectiveCamera(22, W / H, 0.05, 100);
const flat = new THREE.MeshBasicMaterial({ color: 0xff00ff }), black = new THREE.MeshBasicMaterial({ color: 0x000000 });
const count = () => { const gl = renderer.getContext(), px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); let n = 0; for (let i = 0; i < px.length; i += 4) if (px[i] > 200 && px[i + 1] < 60 && px[i + 2] > 200) n++; return n; };
// one still: the clip at a moment, seen from an angle round the back (0: straight behind). Returns the picture and
// how many of the strap's pixels show above the shoulders' line, where hair lies
window.shot = (speed, t, deg) => {
  for (let k = 0; k < Math.round(t * 30); k++) rig.animate(1 / 30, speed, 'ground', k / 30);
  scene.updateMatrixWorld(true);
  rig.root.traverse(o => { if (o.isBone && /Head$/.test(o.name)) o.getWorldPosition(head); if (o.isBone && /Neck$/.test(o.name)) o.getWorldPosition(neck); });
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.root.getWorldQuaternion(new THREE.Quaternion())), a = deg * Math.PI / 180;
  const back = fwd.clone().multiplyScalar(-1).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
  cam.position.copy(neck).addScaledVector(back, 1.25).add(new THREE.Vector3(0, 0.22, 0)); cam.lookAt(neck.x, neck.y - 0.02, neck.z);
  // the strap alone in one colour, everything else black and in its way
  const keep = new Map();
  for (const o of rest.concat(straps)) keep.set(o, o.material);
  const tone = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
  const mats = new Map();
  const as = (o, base) => { const k = o.material.uuid + base.uuid; let m = mats.get(k); if (!m) { m = base.clone(); if (o.material.alphaTest) { m.map = o.material.map; m.alphaTest = o.material.alphaTest; if (base === black) m.color.set(0x000000); } m.side = o.material.side; mats.set(k, m); } return m; };
  for (const o of rest) o.material = as(o, black);
  for (const o of straps) o.material = as(o, flat);
  const bg = scene.background; scene.background = new THREE.Color(0x000000);
  renderer.render(scene, cam);
  const n = count();
  for (const o of hairs) o.visible = false;
  renderer.render(scene, cam);
  const bare = count();
  for (const o of hairs) o.visible = true;
  for (const [o, m] of keep) o.material = m;
  scene.background = bg; renderer.toneMapping = tone;
  renderer.render(scene, cam);
  return { n, bare, png: renderer.domElement.toDataURL('image/png') };
};
window.ready = true;
</script>`;
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 360, height: 360 } });
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  p.on('console', m => { if (m.type() === 'error') console.log(`error: ${m.text().slice(0, 300)}`); });
  const base = `http://localhost:${process.env.PORT || 8800}`;
  await p.route(`${base}/game/__strap.html`, r => r.fulfill({ contentType: 'text/html', body: PAGE }));
  await p.goto(`${base}/game/__strap.html`);
  await p.waitForFunction('window.ready', null, { timeout: +(process.env.READY_MS || 240000) });
  const dir = `${out}.d`; fs.mkdirSync(dir, { recursive: true });
  const files = [], labels = [];
  let worst = 0;
  for (const [clip, speed] of [['stand', 0], ['walk', 1.4], ['run', 4.5]])
    for (const t of [0.5, 0.3]) // (each call plays on from the last: four moments a clip over the three angles)
      for (const deg of [0, 55, -55]) {
        const r = await p.evaluate(([s, t, d]) => window.shot(s, t, d), [speed, t, deg]);
        const f = path.join(dir, `${clip}-${files.length}.png`);
        fs.writeFileSync(f, Buffer.from(r.png.split(',')[1], 'base64'));
        files.push(f); labels.push(`${clip} ${deg} strap ${r.n} of ${r.bare} px`);
        if (deg === 0) worst = Math.max(worst, r.n / Math.max(1, r.bare));
      }
  await b.close();
  require('child_process').execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageDraw
out, n = sys.argv[1], (len(sys.argv) - 2) // 2
fs, ls = sys.argv[2:2 + n], sys.argv[2 + n:]
o = Image.new('RGB', (6 * 360, (n // 6) * 360))
d = ImageDraw.Draw(o)
for i, f in enumerate(fs):
    o.paste(Image.open(f).convert('RGB'), ((i % 6) * 360, (i // 6) * 360))
    d.text(((i % 6) * 360 + 6, (i // 6) * 360 + 4), ls[i], fill=(255, 255, 0))
o.save(out)`, out, ...files, ...labels]);
  console.log(labels.join('\n'));
  console.log('wrote', out);
  if (LONG.includes(who) && worst > 0.4) { console.error(`FAIL: ${who}: ${Math.round(worst * 100)}% of the strap shows over the hair from behind`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
