// Kagami's hair as a conversation shows it most: the back of the head over the shoulder, close, against a lit shop
// front at night, and one of the story's people beyond (web/game/talkcam.js's two-shot). Built with the game's own
// people (web/game/people.js), so the hair is drawn with the material the game gives it. One still with four
// samples a pixel (a desktop's MSAA: the hair's alpha to coverage) and one without (a phone's tier), each with a
// close crop of the hair's edge and the face from the front (the lashes and brows are cards too) beside it, for issue 74.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/hair_shot.js out.png [H_Kagami_W] [R_Male_Adult_09] [night|dusk|day]
// The page is the game's lineup page's bootstrap with a night street's light (a dim moon, a sky's hemisphere, the
// street lights' fill) and an emissive shop front with a screen over it behind the one spoken to.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [,, out = '/tmp/hair_shot.png', who = 'H_Kagami_W', other = 'R_Male_Adult_09', hour = 'night'] = process.argv;
const PAGE = (msaa) => `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000;overflow:hidden">
<script type="importmap">{"imports": {"three": "../vendor/three/three.module.min.js", "three/addons/": "../vendor/three/addons/"}}</script>
<script type="module">
import * as T from 'three';
import { GLTFLoader } from '../gltf.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
T.ColorManagement.enabled = false;
window.THREE = Object.assign({}, T, { GLTFLoader, SkeletonUtils });
addEventListener('error', e => console.error(String(e.error && e.error.stack || e.message)));
await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'face.js'; s.onload = res; s.onerror = rej; document.head.append(s); });
await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'people.js'; s.onload = res; s.onerror = rej; document.head.append(s); });
const W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: ${msaa}, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);
const L = c => new THREE.Color(c).convertSRGBToLinear();
const HOUR = ${JSON.stringify(hour)};
const K = { night: { sky: 0x0b1020, hemi: [0x2a3550, 0x1a1712, 0.5], moon: [0x9fb0d0, 0.35], fill: 1.4, shop: 0.85, exp: 1.25 },
            dusk: { sky: 0x3a4a72, hemi: [0xacbcdc, 0xa2957f, 0.5], moon: [0xffc79a, 0.02], fill: 0.25, shop: 0.12, exp: 0.9 }, // (the game's own numbers at 16:30, the story's first frame: tools/cast_probe.js)
            day: { sky: 0xa9c0d8, hemi: [0xdbe8f5, 0x8f8676, 1.6], moon: [0xfff1dc, 2.8], fill: 0, shop: 0.7, exp: 0.9 } }[HOUR];
renderer.toneMappingExposure = K.exp;
const scene = new THREE.Scene(); scene.background = L(K.sky);
scene.add(new THREE.HemisphereLight(L(K.hemi[0]), L(K.hemi[1]), K.hemi[2]));
const moon = new THREE.DirectionalLight(L(K.moon[0]), K.moon[1]); moon.position.set(-3, 8, 2); moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048); Object.assign(moon.shadow.camera, { left: -3, right: 3, top: 3, bottom: -1, near: 1, far: 20 }); moon.shadow.bias = -0.0004;
scene.add(moon);
// (the street lights' fill near the player, as game.js nightFill; and the shop's light falling out onto the pavement)
const fill = new THREE.PointLight(L(0xc9d4ea), K.fill, 40, 1); fill.position.set(1.5, 3.5, 2); scene.add(fill);
const spill = new THREE.PointLight(L(0xffe2b8), K.shop * 3, 14, 1.4); spill.position.set(0.5, 2.2, -4.6); scene.add(spill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: L(0x3b3a38), roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
// the shop front: a bright window band, mullions, a fascia, and a screen over it (what the over-the-shoulder shot sees behind)
const front = new THREE.Group();
const lit = (c, k) => new THREE.MeshBasicMaterial({ color: L(c).multiplyScalar(k) });
const win = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.6), lit(0xffe9c8, Math.max(K.shop, 0.7))); win.position.set(0, 1.5, -5.2); front.add(win);
for (let x = -4.5; x <= 4.5; x += 1.5) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 2.6), lit(0x15151a, 1)); m.position.set(x, 1.5, -5.19); front.add(m); }
const fascia = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.7), lit(0x1c2230, 1)); fascia.position.set(0, 3.15, -5.2); front.add(fascia);
const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.6), lit(0x6fb6ff, K.shop * 0.9)); screen.position.set(-2.4, 5.0, -5.6); front.add(screen);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), new THREE.MeshStandardMaterial({ color: L(0x2a2b2e), roughness: 0.9 })); wall.position.set(0, 7, -5.8); front.add(wall);
scene.add(front);
// (the street's light where they stand, as world.js streetLit gives it to every person: one colour, here the shop's and the screen's)
const ST = { value: L(HOUR === 'day' ? 0x000000 : 0xffd9b0).multiplyScalar(HOUR === 'night' ? 0.5 : 0.15) };
if (!${JSON.stringify(process.env.NOLIGHT || '')}) OEPeople.setLight(sh => { sh.uniforms.uSt = ST; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\\nuniform vec3 uSt; vec3 streetLight(vec3 wp) { return uSt; }')
  .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\\ntotalEmissiveRadiance += diffuseColor.rgb * streetLight(transpose(mat3(viewMatrix)) * (-vViewPosition - viewMatrix[3].xyz));'); });
const lib = await OEPeople.load('../assets/people/');
const rigs = [];
for (const [c, x, z, ry] of [[${JSON.stringify(who)}, 0, 0, Math.PI], [${JSON.stringify(other)}, 0.15, -1.7, 0]]) {
  await lib.require(c);
  const rig = OEPeople.person(lib, { character: c, clip: 'Idle' });
  rig.root.position.set(x, 0, z); rig.root.rotation.y = ry; scene.add(rig.root); rigs.push(rig);
}
for (let t = 0; t < 1.2; t += 1 / 30) for (const r of rigs) r.animate(1 / 30, 0, 'ground', 0);
scene.updateMatrixWorld(true);
const head = new THREE.Vector3(); rigs[0].root.traverse(o => { if (o.isBone && /Head$/.test(o.name) && !head.lengthSq()) o.getWorldPosition(head); });
const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 100);
// (over the right shoulder, a little behind and above the eye, on the face beyond: the two-shot)
head.y += 0.1; // (the head bone is at the skull's foot: its middle a hand higher)
cam.position.set(head.x + 0.32, head.y + 0.04, head.z + 0.62); cam.lookAt(0.12, head.y - 0.1, -1.7);
renderer.render(scene, cam);
// the close crop: the back of the head filling the frame
window.close = () => { const c2 = new THREE.PerspectiveCamera(24, W / H, 0.05, 100); c2.position.set(head.x + 0.3, head.y + 0.08, head.z + 0.95); c2.lookAt(head.x, head.y - 0.12, head.z); renderer.render(scene, c2); return renderer.domElement.toDataURL('image/png'); };
window.face = () => { const c3 = new THREE.PerspectiveCamera(20, W / H, 0.05, 100); c3.position.set(head.x + 0.15, head.y, head.z - 1.0); c3.lookAt(head.x, head.y - 0.05, head.z); renderer.render(scene, c3); return renderer.domElement.toDataURL('image/png'); };
window.wide = () => { renderer.render(scene, cam); return renderer.domElement.toDataURL('image/png'); };
window.info = renderer.info.programs.length;
window.ready = true;
</script>`;
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const shots = [];
  for (const msaa of [true, false]) {
    const p = await b.newPage({ viewport: { width: 720, height: 450 } });
    p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`${m.type()}: ${m.text().slice(0, 300)}`); });
    const base = `http://localhost:${process.env.PORT || 8800}`;
    await p.route(`${base}/game/__hair.html`, r => r.fulfill({ contentType: 'text/html', body: PAGE(msaa) }));
    // (PEOPLE=file: that people.js in the game's place, for a still of the hair before a change beside one after)
    if (process.env.PEOPLE) await p.route(`${base}/game/people.js`, r => r.fulfill({ contentType: 'text/javascript', path: process.env.PEOPLE }));
    await p.goto(`${base}/game/__hair.html`);
    await p.waitForFunction('window.ready', null, { timeout: +(process.env.READY_MS || 240000) });
    for (const v of ['wide', 'close', 'face']) shots.push(Buffer.from((await p.evaluate(v => window[v](), v)).split(',')[1], 'base64'));
    await p.close();
  }
  await b.close();
  const dir = `${out}.d`; fs.mkdirSync(dir, { recursive: true });
  const names = ['msaa-wide', 'msaa-close', 'msaa-face', 'none-wide', 'none-close', 'none-face'].map((n, i) => { const f = path.join(dir, `${n}.png`); fs.writeFileSync(f, shots[i]); return f; });
  require('child_process').execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageDraw
out, fs = sys.argv[1], sys.argv[2:]
o = Image.new('RGB', (2160, 900))
for i, f in enumerate(fs):
    o.paste(Image.open(f).convert('RGB'), ((i % 3) * 720, (i // 3) * 450))
d = ImageDraw.Draw(o)
for i, t in enumerate(['4x MSAA', 'close', 'face', 'no MSAA (phone)', 'close', 'face']):
    d.text(((i % 3) * 720 + 8, (i // 3) * 450 + 6), t, fill=(255, 255, 0))
o.save(out)`, out, ...names]);
  console.log('wrote', out);
})().catch(e => { console.error(e); process.exit(1); });
