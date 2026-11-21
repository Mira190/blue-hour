// What lights a person in the game, in numbers: the scene's lights as the page has them at a clock time, the exposure,
// and for the one you play each material's name, whether it is drawn as hair, and whether its compiled program has
// the cast's light (people.js castPatch) and the hair's (hairMaterial). For when a still shows no change (issue 123).
//   xvfb-run -a node tools/cast_probe.js [HH:MM]
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__game && window.__game.scene', null, { timeout: 600000 });
  await p.waitForFunction(() => { const l = document.getElementById('g-loader'); return !l || l.hidden; }, null, { timeout: 900000, polling: 500 });
  const [h, m] = (process.argv[2] || '16:30').split(':').map(Number);
  console.log(JSON.stringify(await p.evaluate(async ([h, m]) => {
    const g = window.__game; let ROOT = g.Wd.hemi; while (ROOT.parent) ROOT = ROOT.parent; const out = { keys: Object.keys(g).filter(k => /clock|time|player|rig|me\b/i.test(k)) };
    if (g.setClock && g.clock) g.setClock(g.clock.y, g.clock.m, g.clock.d, h * 60 + m);
    await new Promise(r => setTimeout(r, 4000));
    out.lights = []; out.night = g.Wd.nightU ? Object.fromEntries(Object.entries(g.Wd.nightU).filter(([k, v]) => typeof v.value === 'number' || (v.value && v.value.isColor)).map(([k, v]) => [k, v.value.isColor ? v.value.toArray().map(x => +x.toFixed(3)) : +v.value.toFixed(3)])) : null;
    ROOT.traverse(o => { if (o.isLight && o.visible && o.intensity > 0) out.lights.push([o.type, +o.intensity.toFixed(3), o.color.toArray().map(v => +v.toFixed(3)), o.groundColor ? o.groundColor.toArray().map(v => +v.toFixed(3)) : 0]); });
    out.mats = [];
    ROOT.traverse(o => { if (o.isSkinnedMesh && out.mats.length < 14) for (const mt of [].concat(o.material)) {
      const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
      try { if (mt.onBeforeCompile) mt.onBeforeCompile(sh, null); } catch (e) { sh.fragmentShader = String(e); }
      out.mats.push([mt.name, !!mt.userData.oeStrand, /cDk/.test(sh.fragmentShader), /hSd/.test(sh.fragmentShader), mt.color.toArray().map(v => +v.toFixed(2)), mt.visible, o.visible]); } });
    return out;
  }, [h, m]), null, 1).replace(/\n\s+(?=[\d\-"\]tf])/g, ' '));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
