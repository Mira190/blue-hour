// Whether the one you play has its hair drawn as hair (issue 123): each skinned mesh of the player's model, its
// material, how many of its vertices are marked as hair (people.js strandHair) and how many are its hem's loose ends
// (hemFringe). Exits 1 when the head's own mesh has none marked.
//   xvfb-run -a node tools/hair_probe.js
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 480, height: 300 } });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', '1'); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 400000 });
  await startPlay(p);
  await p.waitForFunction(() => window.__game.player && window.__game.player.rig && window.__game.player.rig.root, null, { timeout: 400000 });
  const r = await p.evaluate(() => { const out = []; window.__game.player.rig.root.traverse(o => { if (!o.isSkinnedMesh) return; const A = o.geometry.attributes; let marked = 0, hem = 0; if (A.hairSK) for (let i = 0; i < A.hairSK.count; i++) { if (A.hairSK.getY(i) > 0.5) marked++; if (A.hairTR.getW(i) < 0) hem++; } out.push({ loose: o.geometry.userData.oeLoose || 0, tris: o.geometry.index ? o.geometry.index.count / 3 : 0, mesh: o.name, material: [].concat(o.material).map(m => m.name).join(), vertices: A.position.count, hair: !!A.hairSK, marked, hem }); }); return out; });
  for (const m of r) console.log(JSON.stringify(m));
  await b.close();
  const head = r.filter(m => /_head/.test(m.material));
  if (!head.length || !head.some(m => m.marked)) { console.log('FAIL the head\'s own mesh has no hair marked'); process.exit(1); }
  console.log('ok   the head\'s own hair is marked as hair');
})().catch(e => { console.error(e); process.exit(2); });
