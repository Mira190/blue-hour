// Where the vertex buffers the page uploads before the title go, by kind and by distance (issue 20).
// Opens the page as a desktop does (1440 x 900, the high tier unless TIER is given), waits for the title card,
// and prints: the loader's own log lines (`compile:`, `buffers:`), the time to the title, the bytes WebGL was
// given in buffers by then (bufferData, summed per buffer as tools/mem_check.js does), and the scene's geometry
// that is drawable at the title, summed by kind (the object's nearest named ancestor) and by the distance of its
// bounds from the player (0-150 m, -500 m, -1.5 km, -3 km, further).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/upload_map.js ['?walk=1']   (the story by default)
// JSON=1 prints the result as JSON. TOP=n kinds (default 20).
const { chromium } = require('playwright');
const { pinClock } = require('./pin_clock');
const Q = process.argv[2] || '';
const TOP = +(process.env.TOP || 20);
(async () => {
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); localStorage.setItem('oe3d-onboard', '1'); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.addInitScript(() => {
    const M = window.__up = { buf: new Map(), sum: 0 };
    const P = WebGL2RenderingContext.prototype, bind = P.bindBuffer, data = P.bufferData, del = P.deleteBuffer, bound = new Map();
    P.bindBuffer = function (t, x) { bound.set(t, x); return bind.call(this, t, x); };
    P.bufferData = function (t, d) { const x = bound.get(t); if (x) { const n = typeof d === 'number' ? d : d ? d.byteLength : 0; M.sum += n - (M.buf.get(x) || 0); M.buf.set(x, n); } return data.apply(this, arguments); };
    P.deleteBuffer = function (x) { M.sum -= M.buf.get(x) || 0; M.buf.delete(x); return del.call(this, x); };
  });
  await pinClock(p, 'shibuya', process.env.GAME_TIME || '2026-11-02T17:30');
  const logs = [], errors = [];
  p.on('console', m => { const t = m.text(); if (/^(compile|buffers|nav cells|buildings|cells):/.test(t)) logs.push(t); });
  p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  const t0 = Date.now();
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${Q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 250 });
  const title = (Date.now() - t0) / 1000;
  const r = await p.evaluate(() => {
    const g = window.__game, W = g.Wd, P = g.player, at = [P.x, P.y];
    const RINGS = [150, 500, 1500, 3000, Infinity], seen = new WeakSet(), by = {}, ring = RINGS.map(() => 0), kr = {};
    const bytes = o => {
      let n = 0;
      // (an array the GPU alone holds, let go once sent, as a cell of the buildings' is: its size from its count and type)
      const BPE = { position: 4, normal: 1, color: 1, fac: 4, inf: 2, ext: 2, bid: 4, srcCode: 1 }, big = o.geometry.attributes.position && o.geometry.attributes.position.count > 65535;
      for (const [k, a] of [['index', o.geometry.index], ['m', o.instanceMatrix], ['c', o.instanceColor], ...Object.entries(o.geometry.attributes)]) {
        const d = a && (a.isInterleavedBufferAttribute ? a.data : a);
        if (!d || seen.has(d)) continue;
        seen.add(d);
        n += d.array ? d.array.byteLength : d.count * (d.itemSize || 1) * (k === 'index' ? (big ? 4 : 2) : BPE[k] || 4);
      }
      return n;
    };
    // (the ground's tiles, coarse and fine, and the quays have no names: known by the lists the world gives)
    const own = new Map();
    for (const [k, l] of [['the ground tiles', W.groundMeshes], ['the quays', W.quayMeshes]]) for (const m of l || []) if (m && m.traverse) m.traverse(c => own.set(c, k));
    const kind = o => {
      if (own.has(o)) return own.get(o);
      for (let q = o; q; q = q.parent) if (q.name && q !== W.world) return q.name;
      const m = [].concat(o.material)[0], src = m && m.map && m.map.image && (m.map.image.src || m.map.image.currentSrc);
      if (o.geometry && o.geometry.attributes.position && o.geometry.attributes.position.count > 50000 && /Standard/.test(m && m.type) && !src) return `(${o.type} ${m.type}, ${o.geometry.attributes.position.count} vertices)`;
      return `(${o.type} ${m && m.name || m && m.type || ''}${src ? ` ${String(src).split('/').pop().slice(0, 30)}` : ''})`;
    };
    const v = new THREE.Vector3(), box = new THREE.Box3();
    W.world.traverseVisible(o => {
      if (!(o.isMesh || o.isLine || o.isPoints) || !o.geometry) return;
      const n = bytes(o);
      if (!n) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      o.updateWorldMatrix(true, false);
      box.copy(o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox)).applyMatrix4(o.matrixWorld);
      // (the world's x, y on the map are three's x and -z: the nearest point of the bounds to the player)
      const cx = Math.max(box.min.x, Math.min(at[0], box.max.x)), cy = Math.max(-box.max.z, Math.min(at[1], -box.min.z));
      const d = Math.hypot(cx - at[0], cy - at[1]), i = RINGS.findIndex(R => d <= R);
      const k = kind(o);
      by[k] = (by[k] || 0) + n; ring[i] += n;
      (kr[k] = kr[k] || RINGS.map(() => 0))[i] += n;
    });
    return { at, gl: window.__up.sum, drawable: Object.values(by).reduce((a, b) => a + b, 0), ring, by: Object.entries(by).sort((a, b) => b[1] - a[1]), kr, rings: RINGS };
  });
  const MB = v => (v / 1048576).toFixed(1);
  if (process.env.JSON) console.log(JSON.stringify({ title, logs, ...r, errors }));
  else {
    console.log(`page ${Q || '(the story)'}: the title after ${title.toFixed(1)} s; WebGL buffers then ${MB(r.gl)} MB; the scene's drawable geometry ${MB(r.drawable)} MB round ${r.at.map(Math.round)}`);
    for (const l of logs) console.log(`  ${l}`);
    console.log(`  by distance: ${r.rings.map((R, i) => `${R === Infinity ? 'further' : `<=${R} m`} ${MB(r.ring[i])}`).join(', ')}`);
    for (const [k, n] of r.by.slice(0, TOP)) console.log(`  ${MB(n).padStart(7)} MB ${k.slice(0, 60).padEnd(60)} ${r.kr[k].map(MB).join(' / ')}`);
    for (const e of errors) console.log(`  error: ${e}`);
  }
  await b.close();
})();
