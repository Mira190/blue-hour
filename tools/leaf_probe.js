// The street trees round a place as the game draws them (issue 68): each tree's species, the season's uniforms, the
// leaf atlas as the GPU has it (drawn by itself onto a quad and read back: the mean colour of each cell's opaque
// texels), and the leaf material's program (which material it was compiled for, and its atlas defines). With LEAN=1, a
// phone's game (quality.js lean, the district's packs); OUT=file.png keeps a still of the place.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/leaf_probe.js            (AT=392.1,-1014.6: the tree by Hachiko's koban; R=30 metres)
'use strict';
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
(async () => {
  const lean = !!process.env.LEAN;
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const ctx = lean ? await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' }) : b;
  const p = lean ? await ctx.newPage() : await b.newPage({ viewport: { width: 960, height: 600 } });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || (lean ? 'low' : 'high'));
  // the renderer the game draws with (three.js makes its methods in the constructor, so the class is wrapped, not its prototype)
  await p.addInitScript(() => addEventListener('three-ready', () => {
    const W = THREE.WebGLRenderer;
    THREE.WebGLRenderer = class extends W { constructor(...a) { super(...a); window.__R = this; } };
  }));
  const logs = [];
  p.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/resized from/.test(m.text())) logs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${process.env.QUERY || '?walk=1'}#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const l = document.getElementById('g-loader'); return window.__game && (!l || l.hidden); }, null, { timeout: 900000, polling: 500 });
  await startPlay(p);
  const at = (process.env.AT || '392.1,-1014.6').split(',').map(Number), R = +(process.env.R || 30);
  const out = await p.evaluate(async ({ at, R }) => {
    const g = window.__game, T = g.Wd.trees, near = [];
    await Promise.race([g.lateReady ? g.lateReady() : null, new Promise(r => setTimeout(r, 120000))]);
    g.setClock(g.clock.y, 10, 10, 15 * 60 + 30);
    g.player.x = at[0] + 5; g.player.y = at[1] - 10;
    for (let i = 0; i < 30; i++) { g.advance(0.1); await new Promise(r => requestAnimationFrame(r)); }
    for (let i = 0; i < T.n; i++) {
      const q = T.at(i);
      if (q && Math.hypot(q[0] - at[0], q[1] - at[1]) < R) near.push([T.species[T.kind(i)], +q[0].toFixed(1), +q[1].toFixed(1)]);
    }
    const RR = window.__R, seen = new Set(), mats = new Set();
    g.Wd.world.traverse(o => { for (const m of [].concat(o.material || [])) if (m && m.map && m.map.image && m.map.image.height === 3584) { seen.add(m.map); mats.add(m); } });
    const tex = [...seen][0], cells = [];
    if (RR && tex) {
      const W = 64, H = 224, rt = new THREE.WebGLRenderTarget(W, H), sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { t: { value: tex } },
        vertexShader: 'varying vec2 u; void main(){ u = vec2(uv.x, 1.0 - uv.y); gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform sampler2D t; varying vec2 u; void main(){ gl_FragColor = textureLod(t, u, 0.0); }' })));
      const was = RR.getRenderTarget(); RR.setRenderTarget(rt); RR.render(sc, cam);
      const px = new Uint8Array(W * H * 4); RR.readRenderTargetPixels(rt, 0, 0, W, H, px); RR.setRenderTarget(was); rt.dispose();
      for (let c = 0; c < 28; c++) {
        const cx = c % 4, cy = Math.floor(c / 4), s = [0, 0, 0]; let k = 0;
        for (let y = cy * 32; y < cy * 32 + 32; y++) for (let x = cx * 16; x < cx * 16 + 16; x++) {
          const i = 4 * ((H - 1 - y) * W + x); // (rows read back from the bottom)
          if (px[i + 3] > 200) { s[0] += px[i]; s[1] += px[i + 1]; s[2] += px[i + 2]; k++; }
        }
        cells.push(k ? s.map(v => Math.round(v / k)) : null);
      }
    }
    const progs = [...mats].map(m => {
      const P = RR && RR.properties.get(m), pr = P && P.currentProgram;
      let defs = null;
      if (pr && RR) { const gl = RR.getContext(), sh = gl.getAttachedShaders(pr.program) || []; const src = sh.map(s => gl.getShaderSource(s)).join('\n'); defs = (src.match(/#define (LEAVES|ATLAS_\w+|CELL_\w+|SAKURA_N)\b.*/g) || []).filter((v, i, a) => a.indexOf(v) === i); }
      return { type: m.type, version: m.version, prog: pr ? pr.id : null, usedTimes: pr ? pr.usedTimes : null, defs, sakuraU: P && P.uniforms && P.uniforms.uSakuraV ? P.uniforms.uSakuraV.value : null };
    });
    return { tier: window.OEQuality && OEQuality.city().name, lean: window.OEQuality && OEQuality.city().lean, near, season: T.season(),
      tex: tex ? { kind: tex.image && tex.image.constructor.name, w: tex.image && tex.image.width, h: tex.image && tex.image.height, flipY: tex.flipY, version: tex.version } : null, cells, progs };
  }, { at, R });
  if (process.env.OUT) await p.screenshot({ path: process.env.OUT });
  console.log(JSON.stringify(out));
  for (const l of logs.slice(0, 20)) console.log(l);
  await b.close();
})();
