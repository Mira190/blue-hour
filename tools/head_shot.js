// The guide's head beside photographs of the breed: the model at the angles the photographs were taken from
// (front, profile, three-quarter), under a soft daylight, each still the size of the head in its photograph.
//   xvfb-run -a node tools/head_shot.js [model.glb] out.png      (stills in out.png.d/, the sheet in out.png)
// The photographs are not in the repository (docs/HERO.md names them and their licences); with REFS=dir holding
// front.jpg, profile.jpg and three.jpg, each still is set beside its photograph. HIDE=name,name leaves out the meshes so
// named ("Outer coat": the skin under the guard hairs), to tell what a mark in a still is made of.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [,, model = 'assets/animals/akita.glb', out = '/tmp/head_shot.png'] = process.argv;
const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#888">
<script type="importmap">{"imports": {"three": "./vendor/three/three.module.min.js", "three/addons/": "./vendor/three/addons/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const S = 420, r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(S, S); r.shadowMap.enabled = true; r.toneMapping = THREE.ACESFilmicToneMapping; document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9aa3a0);
const sun = new THREE.DirectionalLight(0xfff2e0, 2.2); sun.position.set(2, 4, 2.5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5 });
scene.add(sun, new THREE.HemisphereLight(0xd6dde6, 0x5d6a4a, 1.6));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x6f8a52, roughness: 0.95 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const g = await new Promise((res, rej) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(${JSON.stringify(model)}, res, null, rej));
const HIDE = ${JSON.stringify((process.env.HIDE || '').split(',').filter(Boolean))};
g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false;
  if (HIDE.some(h => o.name === h || (o.parent && o.parent.name === h))) o.visible = false;
  // (as web/game/companion.js lights him)
  o.material.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\\n\\ttotalEmissiveRadiance += diffuseColor.rgb * 0.3;'); }; } });
scene.add(g.scene);
const mixer = new THREE.AnimationMixer(g.scene), idle = g.animations.find(c => c.name === 'idle');
if (idle) { mixer.clipAction(idle).play(); mixer.setTime(0.3); }
g.scene.updateMatrixWorld(true);
const head = new THREE.Vector3(); g.scene.traverse(o => { if (o.isBone && o.name === 'head') o.getWorldPosition(head); });
const cam = new THREE.PerspectiveCamera(14, 1, 0.05, 50);
// (a photographer a few metres off with a long lens: little perspective, as in the photographs)
const at = new THREE.Vector3(head.x + 0.07, head.y - 0.01, 0);
const VIEWS = { front: [1, 0.06, 0], profile: [0, 0.03, -1], three: [0.75, 0.22, -0.62], high: [0.79, 0.15, 0.61] };   // (high: tools/model_shot.js's front view)
window.views = Object.keys(VIEWS);
window.shot = v => {
  const d = new THREE.Vector3(...VIEWS[v]).normalize();
  cam.position.copy(at).addScaledVector(d, 1.9); cam.lookAt(at); r.render(scene, cam);
  return r.domElement.toDataURL('image/png');
};
window.ready = true;
</script>`;
(async () => {
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: 500, height: 500 } });
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  const base = `http://localhost:${process.env.PORT || 8800}`;
  await p.route(`${base}/__head.html`, r => r.fulfill({ contentType: 'text/html', body: PAGE }));
  await p.goto(`${base}/__head.html`);
  await p.waitForFunction('window.ready', null, { timeout: 180000 });
  const dir = `${out}.d`; fs.mkdirSync(dir, { recursive: true });
  const names = [];
  for (const v of await p.evaluate(() => window.views)) {
    const url = await p.evaluate(v => window.shot(v), v);
    const f = path.join(dir, `${v}.png`); fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); names.push(f);
  }
  await b.close();
  require('child_process').execFileSync('python3', ['-c', `
import os, sys
from PIL import Image
out, refs, fs = sys.argv[1], sys.argv[2], sys.argv[3:]
rows = []
for f in fs:
    v = os.path.splitext(os.path.basename(f))[0]
    ref = os.path.join(refs, v + '.jpg') if refs else ''
    rows.append([Image.open(ref).convert('RGB').resize((420, 420))] if ref and os.path.exists(ref) else [])
    rows[-1].append(Image.open(f).convert('RGB'))
w = max(len(r) for r in rows)
o = Image.new('RGB', (420 * w, 420 * len(rows)))
for y, r in enumerate(rows):
    for x, im in enumerate(r): o.paste(im, (x * 420, y * 420))
o.save(out)`, out, process.env.REFS || '', ...names]);
  console.log('wrote', out);
})().catch(e => { console.error(e); process.exit(1); });
