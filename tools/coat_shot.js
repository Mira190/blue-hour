// The guide's coat as a phone draws it: web/assets/animals/akita.glb loaded with the page's own GLTFLoader (web/gltf.js),
// once with its colour pictures left as they are (what a desktop sends the GPU) and once packed into ASTC blocks on the
// device (web/tex.js, what a phone sends), lit alike at dusk, at the distances the story shows him from: the close shot
// of episode one's "A dog is walking through the stopped crowd", a few metres, and across the square. Software
// SwiftShader decodes ASTC (Mesa's llvmpipe offers none), so it runs without a display.
//   python3 -m http.server 8800 --directory web &
//   node tools/coat_shot.js [out_dir]      # -> out_dir/coat_raw.png, coat_astc.png and coat.png (the two side by side)
// The two should look alike: a coat that darkens or greys only in the packed one is the encoder's (issue: the guard
// hairs' cut-away texels came back black from the canvas and were averaged into the strands' mipmaps).
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 8800;
const out = process.argv[2] || '/tmp/coat';
const W = 390, H = 844, PR = 2; // (a phone's screen, at the pixel ratio a phone's low tier draws at most)
fs.mkdirSync(out, { recursive: true });

const PAGE = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#000">
<canvas id=c style="display:block"></canvas>
<script src="./tex.js"></script>
<script type="importmap">{"imports": {"three": "./vendor/three/three.module.min.js", "three/addons/": "./vendor/three/addons/"}}</script>
<script type="module">
import * as THREE from 'three';
window.THREE = THREE;
const { GLTFLoader } = await import('./gltf.js');
const W = ${W}, H = ${H}, PR = ${PR};
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(PR);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.setScissorTest(true);
window.texOn = OETex.on(renderer, false); // (on with ?tex=astc only)
const g = await new GLTFLoader().loadAsync('./assets/animals/akita.glb');
await OETex.settled();
// lit as the story's dusk is: a blue sky over a warm street, a low key light, and the little light of his own that
// companion.js gives him in a stopped world
g.scene.traverse(o => {
  if (!o.isMesh) return;
  o.frustumCulled = false;
  o.material.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\\n\\ttotalEmissiveRadiance += diffuseColor.rgb * 0.3;'); };
});
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a3f4c);
scene.add(new THREE.HemisphereLight(0x8fa3c8, 0x4a3a34, 1.1));
const key = new THREE.DirectionalLight(0xffe2c0, 1.4); key.position.set(2, 3, 4); scene.add(key);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x5a4846, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
// three of him: near, a few metres off and across the square, each facing the camera (he looks along +x)
const { clone } = await import('three/addons/utils/SkeletonUtils.js');
const views = [[1.3, 0], [4.5, 1], [12, 2]];
const third = H / 3;
for (const [d, k] of views) {
  const m = k ? clone(g.scene) : g.scene;
  m.rotation.y = -Math.PI / 2;
  scene.add(m);
  const cam = new THREE.PerspectiveCamera(50, W / third, 0.05, 100);
  cam.position.set(0, 0.62, d); cam.lookAt(0, 0.45, 0);
  const y = (2 - k) * third;
  renderer.setViewport(0, y, W, third); renderer.setScissor(0, y, W, third);
  renderer.render(scene, cam);
  scene.remove(m);
}
window.done = { on: window.texOn, stats: { packed: OETex.stats.packed, kept: OETex.stats.kept, log: OETex.stats.log } };
</script>`;

(async () => {
  const b = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const shots = [];
  for (const mode of ['raw', 'astc']) {
    const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: PR });
    p.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
    const origin = `http://localhost:${PORT}`;
    await p.route(`${origin}/__coat.html*`, r => r.fulfill({ contentType: 'text/html', body: PAGE }));
    await p.goto(`${origin}/__coat.html?tex=${mode}`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.done, null, { timeout: 180000 });
    const r = await p.evaluate(() => window.done);
    console.log(`${mode}: ASTC ${r.on ? 'on' : 'off'}, ${r.stats.packed} packed, ${r.stats.kept} kept`, r.stats.log.map(l => `${l.name} ${l.w}x${l.h} ${l.db} dB${l.adb !== undefined ? ` alpha ${l.adb} dB` : ''}${l.kept ? ' kept' : ''}`).join('; '));
    if (mode === 'astc' && !r.on) { console.log('FAIL no ASTC here'); process.exitCode = 1; }
    const f = path.join(out, `coat_${mode}.png`);
    await p.locator('#c').screenshot({ path: f });
    shots.push(f);
    await p.close();
  }
  await b.close();
  execFileSync('python3', [path.join(__dirname, 'contact_sheet.py'), path.join(out, 'coat.png'), '2', String(W), ...shots]);
  console.log(`wrote ${path.join(out, 'coat.png')}`);
})().catch(e => { console.error(e); process.exit(1); });
