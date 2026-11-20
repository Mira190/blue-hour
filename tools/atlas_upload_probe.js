// The leaf atlas sent to the GPU by itself, as a phone's game sends it (issue 68): the trees' far model loaded by
// three.js's GLTFLoader (the atlas an ImageBitmap), the renderer's texture cap set to the phone's (quality.js tex,
// CAP=1024), the atlas drawn onto a quad and read back, the mean colour of each species' cell. Done N times, each with
// a renderer of its own: alone, and just after a texture that flips (what a game's other pictures leave set). The
// cap had three.js send an ImageBitmap made smaller with the flags the texture before it left: the atlas upside down,
// the zelkovas' cell the cherries' blossom (pipeline/fetch_vendor.py PATCHES). Exits 1 if any comes out wrong.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/atlas_upload_probe.js            (N=4, CAP=1024; CAP=0: no cap; HOW=alone,after)
'use strict';
const { chromium } = require('playwright');
(async () => {
  const port = process.env.PORT || 8800, N = +(process.env.N || 4), CAP = +(process.env.CAP ?? 1024);
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const page = `<!doctype html><meta charset="utf-8"><body><script type="importmap">{"imports": {"three": "./vendor/three/three.module.min.js", "three/addons/": "./vendor/three/addons/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
window.run = async (cap, how) => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; document.body.appendChild(cv);
  const R = new THREE.WebGLRenderer({ canvas: cv });
  if (cap) R.capabilities.maxTextureSize = cap;
  const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await new Promise((ok, no) => L.load('assets/trees/trees_far.glb?' + Math.random(), ok, null, no));
  let tex = null; gltf.scene.traverse(o => { if (o.isMesh && o.material.name === 'Leaves') tex = o.material.map; });
  if (how === 'after') { // a texture sent just before it that flips and premultiplies (a TextureLoader's or a canvas's, flipY by default)
    const c2 = document.createElement('canvas'); c2.width = c2.height = 4; c2.getContext('2d').fillRect(0, 0, 2, 2);
    const t2 = new THREE.CanvasTexture(c2); t2.premultiplyAlpha = true; R.initTexture(t2);
  }
  const W = 64, H = 224, rt = new THREE.WebGLRenderTarget(W, H), sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { t: { value: tex } },
    vertexShader: 'varying vec2 u; void main(){ u = vec2(uv.x, 1.0 - uv.y); gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D t; varying vec2 u; void main(){ gl_FragColor = textureLod(t, u, 0.0); }' })));
  R.setRenderTarget(rt); R.render(sc, cam);
  const px = new Uint8Array(W * H * 4); R.readRenderTargetPixels(rt, 0, 0, W, H, px);
  const cells = [];
  for (const c of [10, 11, 12, 16]) {
    const cx = c % 4, cy = Math.floor(c / 4), s = [0, 0, 0]; let k = 0;
    for (let y = cy * 32; y < cy * 32 + 32; y++) for (let x = cx * 16; x < cx * 16 + 16; x++) {
      const i = 4 * ((H - 1 - y) * W + x);
      if (px[i + 3] > 200) { s[0] += px[i]; s[1] += px[i + 1]; s[2] += px[i + 2]; k++; }
    }
    cells.push(k ? s.map(v => Math.round(v / k)) : null);
  }
  rt.dispose(); R.dispose(); R.forceContextLoss(); cv.remove();
  return cells;
};
window.ready = true;
</script>`;
  await p.route(`http://localhost:${port}/__atlas_probe.html`, r => r.fulfill({ contentType: 'text/html', body: page }));
  await p.goto(`http://localhost:${port}/__atlas_probe.html`);
  await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
  const out = [];
  for (const how of (process.env.HOW || 'alone,after').split(',')) for (let i = 0; i < N; i++) {
    const cells = await p.evaluate(([c, h]) => window.run(c, h), [CAP, how]);
    const bad = cells.some(c => c && c[0] > c[1] + 10); // (a leaf cell redder than it is green)
    out.push(bad);
    console.log(how, i, bad ? 'WRONG' : 'ok', JSON.stringify(cells));
  }
  await b.close();
  process.exit(out.some(Boolean) ? 1 : 0);
})();
