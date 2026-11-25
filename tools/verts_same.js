// web/verts.js against another version of itself, byte for byte (issue 220): the attributes the page leans, packed by
// both, every packed byte compared. A change to how verts.js packs that is meant to change nothing (one read for
// another, a faster loop) is checked here before it lands.
//   node tools/verts_same.js [git ref, main] [model]
// In the page: the player's car built once more (OECars.car, every part's colours leant, 'unorm8'), each attribute
// leant copied before it is packed, then packed by the other version too; and colours made up to sit on every edge
// (0, 1, each step of 1/255 and halfway between, the range's ends a hair either side), as floats and as normalised
// sixteen bits, three and four to a vertex. Prints how many attributes and bytes were compared and any that differ.
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const { skip } = require('./draw_skip');
const [,, ref = 'main', model = ''] = process.argv;
(async () => {
  const other = execSync(`git show ${ref}:web/verts.js`, { encoding: 'utf8', maxBuffer: 1 << 24 });
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-watchdog'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errors = []; p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await skip(p, 240);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__game && window.__game.vlib && window.OECars && window.OEVerts, null, { timeout: 900000, polling: 500 });
  await p.waitForFunction(() => { const v = window.__game.vlib; return !!(v.carsFull || (v.loadCars && (v.loadCars(), false))); }, null, { timeout: 600000, polling: 1000 }).catch(() => {});
  const r = await p.evaluate(([src, model]) => {
    // (the other version, made in a window of its own so that it does not take the page's place)
    const box = { location, THREE }; new Function('window', 'location', src)(box, location);
    const A = window.OEVerts, B = box.OEVerts, out = { attrs: 0, bytes: 0, differ: [], nulls: 0 };
    const bytesOf = att => { if (!att) return null; const a = att.isInterleavedBufferAttribute ? att.data.array : att.array; return new Uint8Array(a.buffer, a.byteOffset, a.byteLength); };
    const same = (g0, spec, what) => {
      const g1 = g0.clone(); g1.userData = {}; // (a fresh copy for each version: lean rewrites the geometry it is given, and marks it done in a userData a clone shares)
      A.lean(g0, spec); B.lean(g1, spec);
      for (const name of Object.keys(spec)) {
        const x = bytesOf(g0.attributes[name]), y = bytesOf(g1.attributes[name]);
        if (!x || !y) { out.differ.push(`${what} ${name}: one of them has none`); continue; }
        out.attrs++; out.bytes += x.length;
        if (g0.attributes[name].isInterleavedBufferAttribute !== g1.attributes[name].isInterleavedBufferAttribute || x.length !== y.length) { out.differ.push(`${what} ${name}: another kind or length (${g0.attributes[name].isInterleavedBufferAttribute ? 'rows' : 'plain'} ${x.length} against ${g1.attributes[name].isInterleavedBufferAttribute ? 'rows' : 'plain'} ${y.length})`); continue; }
        for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) { out.differ.push(`${what} ${name}: byte ${i} ${x[i]} against ${y[i]}`); break; }
        if (!g0.userData.oeLean) out.nulls++;
      }
    };
    // the player's car once more, each part's geometry caught before it is leant
    const g = window.__game, parts = [], lean = A.lean;
    A.lean = (geo, spec) => { if (spec && spec.color) { const c = geo.clone(); c.userData = {}; parts.push(c); } return 0; }; // (caught, not packed: packed below by both)
    try { OECars.car(g.world, g.vlib, model || (g.carCfg && g.carCfg.model) || 'Car_Sedan', { colours: { paint: '#8a9099' }, keep: g.KEEP || 'left' }); } finally { A.lean = lean; }
    parts.forEach((geo, k) => same(geo, { color: 'unorm8' }, `car part ${k}`));
    // colours on every edge
    const edge = [0, 1, -1e-4, 1.0001, -2e-4, 1.0002, 0.5, NaN];
    for (let s = 0; s <= 255; s++) edge.push(s / 255, (s + 0.5) / 255, Math.fround((s + 0.5) / 255), (s + 0.5) / 255 - 1e-9);
    for (const k of [3, 4]) {
      const n = Math.ceil(edge.length / k), f = new Float32Array(n * k);
      for (let i = 0; i < f.length; i++) f[i] = edge[i % edge.length];
      const ok = f.map(v => (v >= -1e-4 && v <= 1.0001 ? v : 0.25));
      for (const [arr, what] of [[ok, 'floats'], [f, 'floats with one out of range']]) {
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('color', new THREE.BufferAttribute(arr, k));
        same(geo, { color: 'unorm8' }, `${what}, ${k} a vertex`);
      }
      const u = new Uint16Array(n * k); for (let i = 0; i < u.length; i++) u[i] = (i * 257 + 13) % 65536;
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('color', new THREE.BufferAttribute(u, k, true));
      same(geo, { color: 'unorm8' }, `sixteen bits, ${k} a vertex`);
    }
    out.parts = parts.length;
    return out;
  }, [other, model]);
  await b.close();
  console.log(`verts.js against ${ref}: ${r.attrs} attributes, ${r.bytes} bytes compared (${r.parts} parts of the player's car, and colours on every edge), ${r.nulls} left unpacked by both`);
  if (r.differ.length) { console.log(`FAIL ${r.differ.length} differ: ${r.differ.slice(0, 8).join('; ')}`); process.exitCode = 1; }
  else console.log('ok   every byte the same');
  if (errors.length) console.log(`page errors: ${errors.slice(0, 3).join(' | ')}`);
})();
