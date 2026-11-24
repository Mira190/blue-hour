// The guide close, and what his materials are as the page has them (issue 203: Hachi near-black at 6-stop on a phone's
// tier under llvmpipe, in his colours on a Mac's GPU). Opens the story at a frame (STORY=n, as tools/story_play.js FROM=n),
// waits for the guide, takes stills of him from three sides at the hour the frame is set, and prints for each of his meshes
// its material (type, colour, map and its format, vertex colours, roughness, metalness, envMap), its geometry's normal,
// colour and uv attributes (array type, normalized) and the colour of a few of his vertices as read back.
//   python3 -m http.server 8800 --directory web &
//   STORY=5 xvfb-run -a node tools/guide_look.js out_dir [WxH]          (TIER=low PHONE=1 with 390x844: a phone's page)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/guide-look', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500, tag = phone ? 'phone' : 'desk';
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +process.env.DPR || 1, hasTouch: phone, isMobile: phone,
    ...(process.env.PHONE ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' } : {}) });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  const n = +(process.env.STORY ?? 5);
  await p.addInitScript(n => { try { localStorage.setItem('bh-story-late', JSON.stringify({ fi: n, left: 7 - n, prints: Array.from({ length: n }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, n);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${process.env.Q || ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const c = document.getElementById('gt-continue'); (c && c.offsetParent ? c : document.getElementById('gt-play')).click(); });
  await p.waitForTimeout(3000);
  // (on to the frame's Stop as a player who knows the way: what is said passed, the first answer taken, put a few metres
  // short of where the world stops; until the world is stopped and the guide is out and drawn)
  let st = null;
  for (let i = 0; i < 400; i++) {
    st = await p.evaluate(() => { const g = window.__game, s = g.story && g.story.state; if (!s) return null;
      for (const id of ['#gt-cont-go', '#gt-story-go']) { const e = document.querySelector(id); if (e && e.offsetParent) e.click(); }
      if (g.cine && g.cine.active && g.cine.skip) g.cine.skip();
      const ch = document.querySelector('#gd-choices button'); if (ch && ch.offsetParent) ch.click(); else if (g.dlg && g.dlg.open) g.dlg.next(false);
      if (s.phase === 'go' && s.beat === 'approach' && !(g.dlg && g.dlg.open)) { const fr = s.fr, a = fr.stop_at || (fr.afterimage && fr.afterimage.at), pl = g.player;
        if (a) { const dx = pl.x - a[0], dy = pl.y - a[1], l = Math.hypot(dx, dy) || 1; if (l > 4.5) { pl.x = a[0] + dx / l * 4; pl.y = a[1] + dy / l * 4; if (a[2] != null) pl.z = a[2] + 0.2; } } }
      if (s.phase === 'go' && s.beat === 'meet' && !(g.dlg && g.dlg.open) && s.target) { const t = s.target, pl = g.player, dx = pl.x - t[0], dy = pl.y - t[1], l = Math.hypot(dx, dy) || 1;
        if (l > 2.2) { pl.x = t[0] + dx / l * 1.8; pl.y = t[1] + dy / l * 1.8; if (t[3] != null) pl.z = t[3] + 0.2; pl.h = Math.atan2(-dx, -dy); }
        else for (const ty of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(ty, { code: 'KeyE', key: 'e', bubbles: true })); }
      const d = s.dog; return { phase: s.phase, beat: s.beat, fi: s.fi, dog: !!(d && d.ready && d.root && d.root.visible) }; });
    if (st && st.phase === 'stop' && st.dog) break;
    await p.waitForTimeout(500);
  }
  console.log('reached', JSON.stringify(st));
  await p.waitForTimeout(3000);
  const info = await p.evaluate(() => {
    const g = window.__game, d = g.story.state.dog, T = window.THREE, out = [];
    d.root.traverse(o => { if (!o.isMesh) return; const m = o.material, ge = o.geometry, at = k => { const a = ge.attributes[k]; return a ? `${(a.array || (a.data && a.data.array) || {}).constructor.name}${a.normalized ? ' norm' : ''} x${a.itemSize}` : '-'; };
      const col = ge.attributes.color, few = []; if (col) for (let i = 0; i < Math.min(4, col.count); i += 1) few.push([col.getX(i * 97 % col.count), col.getY(i * 97 % col.count), col.getZ(i * 97 % col.count)].map(v => +v.toFixed(2)));
      out.push({ mesh: o.name, type: m.type, name: m.name, color: m.color && m.color.getHexString(), map: m.map ? `${m.map.image ? (m.map.image.width + 'x' + m.map.image.height) : '?'} ${m.map.isCompressedTexture ? 'blocks' : 'picture'} cs ${m.map.colorSpace}` : null,
        vertexColors: m.vertexColors, rough: m.roughness, metal: m.metalness, env: !!m.envMap, envI: m.envMapIntensity, emissive: m.emissive && m.emissive.getHexString(), visible: o.visible,
        normal: at('normal'), color_attr: at('color'), uv: at('uv'), skinW: at('skinWeight'), cols: few }); });
    return { tier: window.OEQuality ? (OEQuality.name || (OEQuality.tier && OEQuality.tier())) : '?', at: [d.x, d.y, d.z].map(v => +v.toFixed(1)), meshes: out, env: g.scene && g.scene.environment ? 'scene env' : 'no scene env' };
  });
  console.log(JSON.stringify(info, null, 1));
  const S = { pos: null };
  // AB=1: in with the player and out again (dog.aboard, as frame 5's flight does), then the same stills: the coat as a
  // frame played after the flight has it
  const views = [['side', Math.PI / 2, 2.2, 0.8], ['front', 0, 2.0, 0.7], ['back', Math.PI, 2.2, 0.9]];
  const shoot = async pre => { for (const [vn, a, dist, dz] of views) {
    await p.evaluate(([a, dist, dz]) => { const g = window.__game, T = window.THREE, d = g.story.state.dog, h = d.h || 0, P = window.__gl || (window.__gl = { pos: new T.Vector3(), look: new T.Vector3() });
      P.pos.set(d.x + Math.sin(h + a) * dist, (d.z || 0) + dz, -(d.y + Math.cos(h + a) * dist)); P.look.set(d.x, (d.z || 0) + 0.45, -d.y);
      if (g.cine.active) g.cine.stop(); g.cine.play(() => P, 1e9, { label: 'film' }); }, [a, dist, dz]);
    await p.evaluate(() => new Promise(r => { let k = 0; const f = () => (++k >= 4 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
    await p.screenshot({ path: `${out}/${tag}-guide-${pre}${vn}.png`, timeout: 120000 });
  } };
  const mats = () => p.evaluate(() => { const d = window.__game.story.state.dog, o = []; d.root.traverse(m => { if (m.isMesh && m.material && m.material.name) o.push(`${m.material.name}: transparent ${m.material.transparent}, opacity ${m.material.opacity}, depthWrite ${m.material.depthWrite}, version ${m.material.version}`); }); return o; });
  // COAT=1: from the same place, 5 m off, with the guard hairs' cards drawn and without them (a phone draws them only within
  // companion.js COAT_M): the coat as near and as far
  if (process.env.COAT) {
    for (const [pre, on] of [['coat-on-', true], ['coat-off-', false]]) {
      await p.evaluate(on => { const d = window.__game.story.state.dog; d.root.traverse(o => { if (o.isMesh && /guard/i.test(`${o.name} ${o.material.name}`)) o.material.visible = on; }); }, on);
      views.length = 2; views[0] = ['side', Math.PI / 2, 4.5, 1.2]; views[1] = ['front', 0.4, 4.5, 1.2];
      await shoot(pre);
    }
    await b.close(); return;
  }
  if (process.env.AB) {
    await shoot('before-');
    console.log('before:', (await mats()).join(' | '));
    await p.evaluate(async () => { const g = window.__game, d = g.story.state.dog, fr = n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      d.aboard(true); for (let i = 0; i < 30; i++) { g.advance(0.05); await fr(1); } d.aboard(false); for (let i = 0; i < 60; i++) { g.advance(0.05); await fr(1); } });
    console.log('after aboard and out:', (await mats()).join(' | '));
    await shoot('after-');
    await b.close(); return;
  }
  for (const [vn, a, dist, dz] of [['side', Math.PI / 2, 2.2, 0.8], ['front', 0, 2.0, 0.7], ['back', Math.PI, 2.2, 0.9]]) {
    await p.evaluate(([a, dist, dz]) => { const g = window.__game, T = window.THREE, d = g.story.state.dog, h = d.h || 0, P = window.__gl || (window.__gl = { pos: new T.Vector3(), look: new T.Vector3() });
      P.pos.set(d.x + Math.sin(h + a) * dist, (d.z || 0) + dz, -(d.y + Math.cos(h + a) * dist)); P.look.set(d.x, (d.z || 0) + 0.45, -d.y);
      if (g.cine.active) g.cine.stop(); g.cine.play(() => P, 1e9, { label: 'film' }); }, [a, dist, dz]);
    await p.evaluate(() => new Promise(r => { let k = 0; const f = () => (++k >= 4 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
    await p.screenshot({ path: `${out}/${tag}-guide-${vn}.png`, timeout: 120000 });
  }
  void S;
  await b.close();
})();
