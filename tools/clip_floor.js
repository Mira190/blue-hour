// The guide's clips against the floor, from the model alone (issue 157: his paws read 4 to 12 cm under the floor as he
// sits or gets up). The model's root stands on the floor (companion.js puts root.position at the ground), so in every clip
// the lowest skinned vertex should be at y >= 0 and, for a clip that keeps a paw down, near 0. For each clip it prints the
// lowest vertex over its time (cm, + over the floor) and the time it was lowest at, from the bones as the clip poses them,
// with no story and no collision floor between the number and the model.
//   python3 -m http.server 8800 --directory web &
//   node tools/clip_floor.js [model.glb]        (GPU or not: it draws nothing)
const { chromium } = require('playwright');
const model = process.argv[2] || 'assets/animals/akita.glb';
const PAGE = `<!doctype html><meta charset="utf-8"><body>
<script type="importmap">{"imports": {"three": "./vendor/three/three.module.min.js", "three/addons/": "./vendor/three/addons/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const g = await new Promise((res, rej) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(${JSON.stringify(model)}, res, null, rej));
const skins = []; g.scene.traverse(o => { if (o.isSkinnedMesh) skins.push(o); });
g.scene.updateMatrixWorld(true);
const mixer = new THREE.AnimationMixer(g.scene), v = new THREE.Vector3(), out = {};
for (const clip of g.animations) {
  const a = mixer.clipAction(clip).reset().play(); a.paused = true;
  let low = 1e9, at = 0, lowMesh = '';
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = clip.duration * i / N; a.time = t; mixer.update(0); g.scene.updateMatrixWorld(true);
    for (const m of skins) { m.skeleton.update(); const P = m.geometry.attributes.position, step = Math.max(1, Math.floor(P.count / 6000));
      for (let k = 0; k < P.count; k += step) { m.getVertexPosition(k, v); v.applyMatrix4(m.matrixWorld); if (v.y < low) { low = v.y; at = t; lowMesh = m.name; } } }
  }
  a.stop(); out[clip.name] = { low_cm: +(low * 100).toFixed(1), at_s: +at.toFixed(2), dur_s: +clip.duration.toFixed(2), mesh: lowMesh };
}
window.result = out;
</script>`;
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
  const base = `http://localhost:${process.env.PORT || 8800}`;
  await p.route(`${base}/__clipfloor.html`, r => r.fulfill({ contentType: 'text/html', body: PAGE }));
  await p.goto(`${base}/__clipfloor.html`);
  await p.waitForFunction('window.result', null, { timeout: 120000 });
  const res = await p.evaluate(() => window.result); await b.close();
  let bad = 0;
  for (const [n, r] of Object.entries(res)) { console.log(n.padEnd(8), JSON.stringify(r)); if (r.low_cm < -2) bad++; }
  process.exit(bad ? 1 : 0);
})();
