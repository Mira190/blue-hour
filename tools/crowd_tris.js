// The far crowd's share of a frame (issue 61): loads the story as a phone, taps Play on the title, and every STEP seconds
// for SECONDS of the opening counts the triangles the scanned cast's instanced copies draw (people.js crowdRenderer), the
// copy and the coarser copy past COARSE_M apart, and the frame's own (renderer.info). Q=?farcoarse=off draws every far
// walker as the copy, as before the coarser one: run both to see what it saved.
//   python3 -m http.server 8800 --directory web &
//   NODE_PATH=$(npm root -g) xvfb-run -a node tools/crowd_tris.js [WxH]
// SECONDS=n (60), STEP=n (3), WAIT=n seconds on the title before the tap (7), TIER (low on a phone's size, high otherwise).
const { chromium } = require('playwright');
const [,, size = '390x844'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500, SECONDS = +(process.env.SECONDS || 60), STEP = +(process.env.STEP || 3);
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  // the renderer, for its count of the frame's triangles, read after each frame's render
  await p.addInitScript(() => {
    addEventListener('three-ready', () => {
      const R = THREE.WebGLRenderer;
      THREE.WebGLRenderer = class extends R { constructor(...a) { super(...a); window.__renderer = this; const r0 = this.render.bind(this); let tri = 0, f = -1; this.render = (s, c) => { r0(s, c); const fr = window.__frameNo || 0; if (fr !== f) { f = fr; window.__tris = tri; tri = 0; } tri += this.info.render.triangles; }; } };
      const tick = () => { window.__frameNo = (window.__frameNo || 0) + 1; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    }, { once: true });
  });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${process.env.Q || ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1000 * +(process.env.WAIT || 7));
  await p.evaluate(() => document.getElementById('gt-play').click());
  const rows = [];
  for (let t = 0; t < SECONDS; t += STEP) {
    await p.waitForTimeout(STEP * 1000);
    const r = await p.evaluate(() => {
      const o = { copy: 0, coarse: 0, nCopy: 0, nCoarse: 0, frame: window.__tris || 0 };
      window.__game.world.traverse(m => {
        if (!m.isInstancedMesh || !m.visible || !m.count || !m.userData.who || !m.material.map) return; // (a cast member's copies: the dolls have no picture)
        const tris = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * m.count;
        if (m.userData.k === 1) { o.coarse += tris; o.nCoarse += m.count; } else { o.copy += tris; o.nCopy += m.count; }
      });
      return o;
    });
    rows.push(r);
    console.log(`${String(t + STEP).padStart(3)} s  far crowd ${Math.round((r.copy + r.coarse) / 1000)}k triangles (copy ${r.nCopy} walkers ${Math.round(r.copy / 1000)}k, coarse ${r.nCoarse} walkers ${Math.round(r.coarse / 1000)}k)  frame ${Math.round(r.frame / 1000)}k`);
  }
  const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  console.log(`median: far crowd ${Math.round(med(rows.map(r => r.copy + r.coarse)) / 1000)}k triangles, frame ${Math.round(med(rows.map(r => r.frame)) / 1000)}k; walkers drawn ${med(rows.map(r => r.nCopy + r.nCoarse))}, coarse ${med(rows.map(r => r.nCoarse))}`);
  await b.close();
})();
