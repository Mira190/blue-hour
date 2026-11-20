// The look target of tools/check.sh (docs/CHECKS.md, "The router"): the models, pictures and sounds a branch changed,
// each loaded the way the page loads it and set beside the same file as it was, without playing the story.
//
// A rebuilt model whose names, flags and attributes are as they were (tools/model_contract.py) cannot change what the
// story does, only how it looks and what it costs. So instead of the episode played through (a quarter of an hour),
// this opens one small page on the server, with the page's own three.js and its own GLTFLoader (web/gltf.js: meshopt in
// WebAssembly, as every device decodes it), and for each file:
//   - a model: loaded, every texture in it decoded, every material compiled and drawn (a shader that does not compile
//     is a failure), and a still of it as it was (left) and as it is now (right), lit alike and framed alike, with its
//     triangles, textures and size before and after;
//   - a picture: decoded by the browser (createImageBitmap), its size before and after, and a still of the two;
//   - a sound: decoded (an OfflineAudioContext), its length before and after.
// Fails on a file that does not load or decode, a texture that is not decoded, a shader error, or an error on the
// page. What a phone holds of it is mem's to measure (tools/mem_check.js, which tools/check.sh runs with this).
//   xvfb-run -a node tools/look_check.js [out_dir] [file...]   # files relative to the repository, under web/
//   LOOK_BASE=<commit>  what "as it was" is (default origin/main's merge base); none there: the file is new
//   No files: every model, picture and sound under web/assets and the map's hero levels, decoded, with no stills
//   (STILLS=1 for them too).
const { chromium } = require('playwright');
const { logger: browserLog, watch } = require('./browser_watch');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 8800;
const out = process.argv[2] || '/tmp/look';
let files = process.argv.slice(3);
const all = !files.length;
const MODEL = /\.glb$/i, PICTURE = /\.(webp|png|jpe?g|avif)$/i, SOUND = /\.(mp3|ogg|m4a|wav)$/i;
if (all) {
  const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
  files = [...walk('web/assets'), ...walk('web/data/shibuya/hero')];
}
files = files.filter(f => f.startsWith('web/') && (MODEL.test(f) || PICTURE.test(f) || SOUND.test(f)));
const stills = all ? process.env.STILLS === '1' : process.env.STILLS !== '0';
const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, maxBuffer: 1 << 30 }); } catch (e) { return null; } };
const base = all ? null : (process.env.LOOK_BASE || (git('merge-base', 'origin/main', 'HEAD') || '').toString().trim() || null);
fs.mkdirSync(out, { recursive: true });

// the page: the import map and the loader index.html has, nothing of the game
const PAGE = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#202326">
<canvas id=c width=960 height=480 style="display:block"></canvas>
<script type="importmap">{"imports": {"three": "./vendor/three/three.module.min.js", "three/addons/": "./vendor/three/addons/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from './gltf.js';
THREE.ColorManagement.enabled = false;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(960, 480, false);
renderer.setScissorTest(true);
// a studio for the metals to reflect: a grey room with two soft lights (three.js's RoomEnvironment is not vendored)
const room = new THREE.Scene();
room.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x55585c, side: THREE.BackSide })));
for (const [x, y, z, k] of [[-4.9, 2, 0, 6], [3, 4.9, 2, 4]]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide })); l.position.set(x, y, z); l.lookAt(0, 0, 0); room.add(l); }
const pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromScene(room, 0.04).texture;
const loader = new GLTFLoader();
const shaderErrors = [];
const err0 = console.error;
console.error = (...a) => { const t = a.map(String).join(' '); if (/Shader Error|shader|program/i.test(t)) shaderErrors.push(t.slice(0, 300)); err0(...a); };
function stats(root) {
  const s = { tris: 0, meshes: 0, nodes: 0, bones: 0, textures: new Map(), undecoded: [] };
  root.traverse(o => {
    s.nodes++;
    if (o.isBone) s.bones++;
    if (!o.isMesh) return;
    s.meshes++;
    const g = o.geometry, n = g.index ? g.index.count : g.attributes.position.count;
    s.tris += n / 3;
    for (const m of [].concat(o.material)) for (const k in m) {
      const t = m[k];
      if (!t || !t.isTexture) continue;
      const im = t.image, w = im && (im.width || (im.data && im.width)), h = im && im.height;
      if (!w || !h) s.undecoded.push((m.name || '?') + '.' + k);
      else s.textures.set(t.uuid, [w, h]);
    }
  });
  const tex = [...s.textures.values()];
  return { tris: Math.round(s.tris), meshes: s.meshes, nodes: s.nodes, bones: s.bones, textures: tex.length, texMax: tex.reduce((a, [w, h]) => Math.max(a, w, h), 0), undecoded: s.undecoded };
}
function draw(root, x, w, box) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2e33);
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3530, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 5, 4); scene.add(sun);
  scene.add(root);
  const c = box.getCenter(new THREE.Vector3()), r = Math.max(0.05, box.getSize(new THREE.Vector3()).length() / 2);
  const cam = new THREE.PerspectiveCamera(30, w / 480, r / 100, r * 100);
  cam.position.copy(c).add(new THREE.Vector3(0.55, 0.32, 1).normalize().multiplyScalar(r / Math.sin(THREE.MathUtils.degToRad(15)) * 1.05));
  cam.lookAt(c);
  renderer.setViewport(x, 0, w, 480); renderer.setScissor(x, 0, w, 480);
  renderer.compile(scene, cam);
  renderer.render(scene, cam);
  scene.remove(root);
}
window.lookModel = async (now, was, still) => {
  const res = {};
  const g = await loader.loadAsync(now), root = g.scene;
  root.updateMatrixWorld(true);
  res.now = Object.assign(stats(root), { clips: g.animations.length });
  let old = null;
  if (was) { try { old = await loader.loadAsync(was); old.scene.updateMatrixWorld(true); res.was = Object.assign(stats(old.scene), { clips: old.animations.length }); } catch (e) { res.wasError = String(e).slice(0, 200); } }
  if (still) {
    const box = new THREE.Box3().setFromObject(root, true);
    if (old) box.union(new THREE.Box3().setFromObject(old.scene, true));
    renderer.setScissor(0, 0, 960, 480); renderer.setClearColor(0x15171a); renderer.clear();
    if (old) draw(old.scene, 0, 480, box);
    draw(root, old ? 480 : 240, 480, box);
  } else {
    // drawn all the same, small, so that every material's program is compiled and linked
    const box = new THREE.Box3().setFromObject(root, true);
    draw(root, 0, 240, box);
  }
  const gl = renderer.getContext().getError();
  if (gl) res.glError = gl;
  res.shaderErrors = shaderErrors.splice(0);
  return res;
};
window.lookPicture = async (now, was) => {
  const one = async u => { const b = await (await fetch(u)).blob(); const im = await createImageBitmap(b); return im; };
  const a = await one(now), res = { now: [a.width, a.height] };
  let b = null;
  if (was) { try { b = await one(was); res.was = [b.width, b.height]; } catch (e) { res.wasError = String(e).slice(0, 200); } }
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.canvas.width = 960; ctx.canvas.height = 480; ctx.fillStyle = '#15171a'; ctx.fillRect(0, 0, 960, 480);
  const fit = (im, x) => { const s = Math.min(480 / im.width, 480 / im.height); ctx.drawImage(im, x + (480 - im.width * s) / 2, (480 - im.height * s) / 2, im.width * s, im.height * s); };
  if (b) fit(b, 0);
  fit(a, b ? 480 : 240);
  window.__pic = ctx.canvas.toDataURL('image/png');
  return res;
};
window.lookSound = async (now, was) => {
  const one = async u => { const buf = await (await fetch(u)).arrayBuffer(); const ac = new OfflineAudioContext(2, 44100, 44100); const d = await ac.decodeAudioData(buf); return +d.duration.toFixed(2); };
  const res = { now: await one(now) };
  if (was) { try { res.was = await one(was); } catch (e) { res.wasError = String(e).slice(0, 200); } }
  return res;
};
window.lookReady = true;
</script>`;

(async () => {
  const t0 = Date.now();
  const b = await chromium.launch(Object.assign({ logger: browserLog() }, process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }));
  const p = await b.newPage({ viewport: { width: 960, height: 480 }, deviceScaleFactor: 1 });
  watch(p);
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  const origin = `http://localhost:${PORT}`;
  await p.route(`${origin}/__look.html`, r => r.fulfill({ contentType: 'text/html', body: PAGE }));
  // a file as it was: its bytes at the base commit, served beside the page's own
  await p.route(`${origin}/__was/**`, r => {
    const rel = decodeURIComponent(new URL(r.request().url()).pathname.slice('/__was/'.length));
    const bytes = git('show', `${base}:${rel}`);
    return bytes ? r.fulfill({ body: bytes }) : r.fulfill({ status: 404, body: '' });
  });
  await p.goto(`${origin}/__look.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.lookReady, null, { timeout: 120000 });
  let bad = 0;
  const kb = n => `${(n / 1024).toFixed(0)} kB`;
  for (const f of files) {
    const rel = f.slice('web/'.length), url = `${origin}/${rel.split('/').map(encodeURIComponent).join('/')}`;
    const wasBytes = base ? git('cat-file', '-s', `${base}:${f}`) : null;
    const was = wasBytes ? `${origin}/__was/${f.split('/').map(encodeURIComponent).join('/')}` : null;
    const size = fs.statSync(path.join(ROOT, f)).size, sizeWas = wasBytes ? +wasBytes.toString() : null;
    const sz = sizeWas == null ? kb(size) : sizeWas === size ? kb(size) : `${kb(sizeWas)} -> ${kb(size)}`;
    const name = f.replace(/^web\//, '').replace(/[/]/g, '_');
    try {
      if (MODEL.test(f)) {
        const r = await p.evaluate(([u, w, s]) => window.lookModel(u, w, s), [url, was, stills]);
        const ok = !r.now.undecoded.length && !r.glError && !r.shaderErrors.length;
        const tri = r.was && r.was.tris !== r.now.tris ? `${r.was.tris.toLocaleString()} -> ${r.now.tris.toLocaleString()}` : r.now.tris.toLocaleString();
        const tex = r.was && (r.was.textures !== r.now.textures || r.was.texMax !== r.now.texMax) ? `${r.was.textures} (to ${r.was.texMax} px) -> ${r.now.textures} (to ${r.now.texMax} px)` : `${r.now.textures} (to ${r.now.texMax} px)`;
        if (stills) await p.locator('#c').screenshot({ path: path.join(out, `${name}.png`) });
        console.log(`${ok ? 'ok  ' : 'FAIL'} ${f}: ${tri} triangles, ${r.now.meshes} meshes, ${r.now.bones} bones, ${r.now.clips} clips, textures ${tex}, ${sz}${r.was ? '' : r.wasError ? ` (as it was did not load: ${r.wasError})` : base ? ' (new)' : ''}`);
        if (!ok) { bad++; console.log(`     ${[r.now.undecoded.length ? `undecoded: ${r.now.undecoded.slice(0, 4).join(', ')}` : '', r.glError ? `WebGL error ${r.glError}` : '', ...r.shaderErrors.slice(0, 2)].filter(Boolean).join('; ')}`); }
      } else if (PICTURE.test(f)) {
        const r = await p.evaluate(([u, w]) => window.lookPicture(u, w), [url, was]);
        if (stills) fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from((await p.evaluate(() => window.__pic)).split(',')[1], 'base64'));
        console.log(`ok   ${f}: ${r.was && r.was.join('x') !== r.now.join('x') ? `${r.was.join('x')} -> ` : ''}${r.now.join('x')}, ${sz}${r.was || !base ? '' : ' (new)'}`);
      } else {
        const r = await p.evaluate(([u, w]) => window.lookSound(u, w), [url, was]);
        console.log(`ok   ${f}: ${r.was != null && r.was !== r.now ? `${r.was} s -> ` : ''}${r.now} s, ${sz}${r.was != null || !base ? '' : ' (new)'}`);
      }
    } catch (e) {
      bad++;
      console.log(`FAIL ${f}: ${String(e).split('\n')[0].slice(0, 200)}`);
    }
  }
  for (const e of errors) { bad++; console.log(`FAIL pageerror: ${e}`); }
  console.log(`looked at ${files.length} file${files.length === 1 ? '' : 's'} in ${((Date.now() - t0) / 1000).toFixed(0)} s${stills ? `, stills in ${out}` : ''}: ${bad ? `${bad} failed` : 'all loaded'}`);
  await b.close();
  process.exit(bad ? 1 : 0);
})();
