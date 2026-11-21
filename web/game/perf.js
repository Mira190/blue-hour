// What a frame costs on the device that is drawing it, part by part (?perf on a game's address). A software renderer
// in a check knows nothing of a real GPU, and a player's telemetry says only that a frame was slow: this draws the
// frame as it stands several times over, finished each time (gl.finish and a pixel read back, so the time is the
// GPU's as well as the script's), then again with one thing taken away at a time: the post stack and each of its
// passes, the shadow map's drawing and its sampling, the screens' area lights, the wet street's mirror, the weather,
// the multisampling, the scene at the governor's floor and at full size, every material swapped for a flat one (what
// the geometry alone costs), the hero level's materials without their pictures, and each of the scene's top-level
// parts. What a part costs is the frame's time with it less the time without.
//
// It waits until the street is the player's (game.js h.ready: the loader gone, the title and the crane down over, no
// cut playing) and the camera has stood still for a few seconds: the first version started while the page was still
// loading, measured a camera at the map's origin, starved the loading of the rest, and took the real street arriving
// half way through for a page it had made seven times slower (docs/PERFORMANCE.md, "The frame budget, fourth round").
// The frame as it is is measured again every few rows, and each row is set against the two measures round it, so a
// camera that moved or a crowd that thickened shows as drift, not as a part's cost. The governor is held meanwhile.
//
// The table is shown on the page and sent with the telemetry ("perf"), so a device's own numbers decide what is
// worth making cheaper. It loads only when asked for: game.js adds this script on ?perf.
'use strict';
window.OEPerf = (function () {
  const CSS = `#g-perf { position: absolute; left: 12px; top: 12px; z-index: 50; max-height: calc(100% - 24px); max-width: calc(100% - 24px); overflow: auto; margin: 0; padding: 12px 14px; border-radius: 10px;
  background: rgba(6, 10, 20, 0.88); color: #e8eefc; font: 12px/1.45 ui-monospace, Menlo, Consolas, monospace; white-space: pre; pointer-events: auto; user-select: text; }
  #g-perf button { font: inherit; color: inherit; background: rgba(255, 255, 255, 0.12); border: 0; border-radius: 6px; padding: 2px 8px; margin-left: 8px; cursor: pointer; }`;
  const W = 36;
  // h: { renderer, world, camera, atmos, gov, mirror, weather, hero, stage, tick() (what a frame does before it draws),
  //      ready() (the street is the player's) }
  async function run(h) {
    const { renderer, world, camera, atmos, gov } = h, gl = renderer.getContext(), px = new Uint8Array(4);
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const out = document.createElement('pre'); out.id = 'g-perf'; h.stage.appendChild(out);
    const rows = [], bases = [];
    const fmt = r => `${r.name.slice(0, W).padEnd(W)} ${(isFinite(r.ms) ? r.ms.toFixed(1) : '-').padStart(7)}${(r.d == null ? '' : r.d >= 0 ? `   costs ${r.d.toFixed(1)}` : `   (${(-r.d).toFixed(1)} slower)`).padEnd(18)}${r.note ? `  ${r.note}` : ''}`;
    const show = note => { out.textContent = `Frame cost on this device (ms a frame; lower is better)\n\n${rows.map(fmt).join('\n')}${rows.length ? '\n\n' : ''}${note}`; };
    const pause = (ms = 30) => new Promise(r => setTimeout(r, ms));

    // ---- until the street is the player's, and the camera has stood still for a while
    {
      let held = 0, last = null;
      const t0 = performance.now();
      for (;;) {
        const p = camera.position, still = last && p.distanceTo(last) < 0.6 && p.lengthSq() > 1;
        last = p.clone();
        held = (!h.ready || h.ready()) && still && !document.hidden ? held + 1 : 0;
        const s = Math.round((performance.now() - t0) / 1000);
        show(held ? `The street is yours: measuring in ${Math.max(0, 8 - held)} s. Stand still until it is done.` : `Waiting for the street to be yours (${s} s). Set out on the walk or start the story, then stand still.`);
        if (held >= 8) break;
        await pause(1000);
      }
    }

    const draw = () => { if (h.tick) h.tick(); if (atmos) atmos.render(world, camera); else renderer.render(world, camera); };
    const finish = () => { renderer.setRenderTarget(null); gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
    // the median of n samples, after warm frames; a sample is the mean of enough frames to take 30 ms at least (Safari's
    // clock counts whole milliseconds, and a fast GPU's frame is ten of them)
    const time = (fn = draw, n = 7, warm = 3) => {
      let w = 0;
      for (let i = 0; i < warm; i++) { const t0 = performance.now(); fn(); finish(); w = performance.now() - t0; }
      const per = Math.max(1, Math.min(8, Math.ceil(30 / Math.max(w, 1)))), ts = [];
      for (let i = 0; i < n; i++) { const t0 = performance.now(); for (let k = 0; k < per; k++) { fn(); finish(); } ts.push((performance.now() - t0) / per); }
      ts.sort((a, b) => a - b);
      return ts[ts.length >> 1];
    };
    // the governor held while measuring (it would take the measuring's long frames for the scene's), and given back
    const auto = gov ? gov.auto : false;
    if (gov) gov.auto = false;
    const counts = () => { const a = renderer.info.autoReset; renderer.info.autoReset = false; renderer.info.reset(); draw(); finish(); const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; renderer.info.autoReset = a; return r; };
    // the frame as it is, again every few rows: each row's cost is against the measure interpolated at it
    let seq = 0;
    const baseAt = i => {
      let a = bases[0], b = bases[bases.length - 1];
      for (const x of bases) { if (x.i <= i) a = x; if (x.i >= i) { b = x; break; } }
      return a === b || b.i === a.i ? a.ms : a.ms + (b.ms - a.ms) * (i - a.i) / (b.i - a.i);
    };
    const remeasure = () => { bases.push({ i: seq, ms: time(draw, 5, 1) }); };
    // one row: the frame with something changed (set), then put back (unset)
    async function test(name, set, unset, fn, note) {
      if (seq && seq % 4 === 0 && bases[bases.length - 1].i !== seq) { remeasure(); await pause(); }
      let ms = NaN;
      try { set(); ms = time(fn); } catch (e) { note = String(e).slice(0, 60); }
      try { unset(); } catch (e) { /* left as it is */ }
      const r = { name, ms, i: seq++, note };
      r.d = isFinite(ms) ? baseAt(r.i) - ms : null;
      rows.push(r);
      show('Measuring ... (stand still)');
      await pause();
    }
    const restore = [];
    try {
      show('Measuring ... (stand still)'); await pause();
      time(draw, 4, 8); // (whatever the first frames compile)
      bases.push({ i: 0, ms: time(draw, 11, 2) });
      const info = counts(), size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const head = { name: 'the frame as it is', ms: bases[0].ms, d: null, note: `${size.x} x ${size.y}, scale ${gov ? gov.scale.toFixed(2) : 1}, extras ${gov ? gov.extras : 1}, ${info.calls} draws, ${Math.round(info.tris / 1000)}k triangles` };
      rows.push(head);

      // ---- the post stack
      await test('without the post stack', () => {}, () => {}, () => { if (h.tick) h.tick(); renderer.setRenderTarget(null); renderer.render(world, camera); }, 'the scene straight to the canvas');
      const passes = atmos && atmos.composer && atmos.composer.passes ? atmos.composer.passes : [];
      const passName = p => (atmos.ao && p === atmos.ao.pass ? 'the ambient occlusion' : p.constructor && p.constructor.name === 'UnrealBloomPass' ? 'the bloom' : p.name || (p.constructor && p.constructor.name) || 'a pass');
      // (the lens is the pass that writes the canvas: without it the frame is not drawn, so it is left in; the post
      // stack's row above has it)
      for (let i = 1; i < passes.length; i++) { const p = passes[i]; if (p.enabled === false || p === atmos.lens) continue; await test(`without ${passName(p)}`, () => { p.enabled = false; }, () => { p.enabled = true; }); }
      if (atmos && atmos.setSamples && atmos.composer) { const was = atmos.composer.samples || 0; await test(was ? `without multisampling (x${was})` : 'with multisampling x4', () => atmos.setSamples(was ? 0 : 4), () => atmos.setSamples(was)); }
      if (gov && gov.set) {
        const s = gov.scale, e = gov.extras;
        if (s > gov.min + 0.01) await test(`the scene at scale ${gov.min}`, () => gov.set(gov.min, e), () => gov.set(s, e), draw, 'what the pixels cost');
        if (s < 0.99) await test('the scene at scale 1', () => gov.set(1, e), () => gov.set(s, e));
        if (e !== 1) await test('with every extra', () => gov.set(s, 1), () => gov.set(s, e));
        if (e !== 0) await test('with no extras', () => gov.set(s, 0), () => gov.set(s, e));
      }

      // ---- the lights and the shading
      const flat = new THREE.MeshBasicMaterial({ color: 0x808080 });
      restore.push(() => flat.dispose());
      await test('every material flat', () => { world.overrideMaterial = flat; }, () => { world.overrideMaterial = null; }, draw, 'what the geometry alone costs');
      const lights = [], rects = [];
      world.traverse(o => { if (o.isLight && o.castShadow) lights.push(o); if (o.isRectAreaLight && o.visible) rects.push(o); });
      const SM = renderer.shadowMap;
      if (lights.length && SM.enabled) {
        // the map kept as it is and sampled, but not drawn again: what drawing it costs a frame (the rest of "without
        // shadows" is the sampling, in every lit material)
        if (SM.autoUpdate) await test('the shadow map not redrawn', () => { SM.autoUpdate = false; }, () => { SM.autoUpdate = true; }, draw, `${lights[0].shadow.mapSize.x} px`);
        await test('without shadows', () => lights.forEach(l => { l.castShadow = false; }), () => lights.forEach(l => { l.castShadow = true; }), draw, 'drawn and sampled');
      }
      if (rects.length) await test(`without the ${rects.length} area lights`, () => rects.forEach(l => { l.visible = false; }), () => rects.forEach(l => { l.visible = true; }));
      if (h.mirror && h.mirror.on) { const was = !!h.mirror.off; await test(was ? 'with the wet street\'s mirror' : 'without the wet street\'s mirror', () => { h.mirror.off = !was; }, () => { h.mirror.off = was; }); }
      if (h.weather && 'shed' in h.weather) { const was = h.weather.shed; await test(was >= 2 ? 'with the weather' : 'without the weather', () => { h.weather.shed = was >= 2 ? 0 : 2; }, () => { h.weather.shed = was; }); }
      // the hero level's materials as they are, less their pictures (colour, normal, roughness maps): what its texture
      // reads cost against its geometry (a tile-based GPU pays for each read of each pixel it shades)
      const heroRoot = h.hero && h.hero.group;
      if (heroRoot && heroRoot.visible) {
        const swaps = [], made = new Map();
        heroRoot.traverse(o => {
          if (!o.isMesh || !o.visible || Array.isArray(o.material) || !o.material || !o.material.isMeshStandardMaterial) return;
          const m = o.material;
          if (!made.has(m)) made.set(m, new THREE.MeshStandardMaterial({ color: m.color, roughness: m.roughness, metalness: m.metalness, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, side: m.side, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, vertexColors: m.vertexColors }));
          swaps.push([o, m]);
        });
        restore.push(() => made.forEach(m => m.dispose()));
        if (swaps.length) await test('the hero level without its maps', () => swaps.forEach(([o, m]) => { o.material = made.get(m); }), () => swaps.forEach(([o, m]) => { o.material = m; }), draw, `${made.size} materials`);
      }

      // ---- the scene's own parts: its top-level objects, by name (or the material of an unnamed one), the most
      // triangles first, and the named ones of any size (the hero level, the far land, the night's lights)
      const kids = world.children.filter(o => o.visible && !o.isLight && !o.isCamera), groups = new Map();
      const tris = o => { let n = 0; o.traverse(m => { if (!m.isMesh || !m.geometry || !m.visible) return; const g = m.geometry, c = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0; n += c / 3 * (m.isInstancedMesh ? m.count : 1); }); return n; };
      // (an unnamed part by what it is: the game's own word for it (h.label), the crowd, the people near, the trees, a
      // group by the first name in it, or else its kind and material)
      const label = o => {
        const own = o.name || (o.userData && (o.userData.kind || o.userData.name)) || (h.label && h.label(o));
        if (own) return own;
        if (o.userData && o.userData.who) return 'the crowd';
        const kind = o.isInstancedMesh ? 'instanced' : o.isSkinnedMesh ? 'skinned' : o.isGroup ? 'group' : o.type.toLowerCase();
        let rig = false, first = '', mat = null;
        o.traverse(m => { if (/_Rig$/.test(m.name)) rig = true; if (!first && m !== o && m.name) first = m.name; if (!mat && m.material && !Array.isArray(m.material)) mat = m.material; });
        if (rig) return 'the people near';
        if (first) return `${kind}: ${first}`;
        const map = mat && mat.map ? mat.map.name || 'textured' : '';
        if (/^(leaves|bark)/.test(map)) return 'the trees';
        return `${kind}: ${mat ? mat.name || `${map ? `${map} ` : ''}${mat.type.replace(/^Mesh|Material$/g, '')}` : 'unnamed'}${o.userData && o.userData.shadowStatic ? ' (still)' : ''}`;
      };
      for (const o of kids) {
        const k = label(o);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(o);
      }
      const all = [...groups].map(([k, os]) => ({ k, os, t: os.reduce((n, o) => n + tris(o), 0) })).filter(g => g.t > 0).sort((a, b) => b.t - a.t);
      const named = g => /^(hero|far-land|night|inland|buildings|quay|the )/.test(g.k);
      const list = all.filter((g, i) => i < 16 || named(g));
      for (const g of list) {
        const was = g.os.map(o => o.visible);
        await test(`without ${g.k}`, () => g.os.forEach(o => { o.visible = false; }), () => g.os.forEach((o, i) => { o.visible = was[i]; }), draw, `${g.os.length} object${g.os.length > 1 ? 's' : ''}, ${Math.round(g.t / 1000)}k triangles`);
      }
      bases.push({ i: seq, ms: time(draw, 11, 2) }); // (as the first was)
      const again = bases[bases.length - 1].ms;
      for (const r of rows) if (r.i != null && isFinite(r.ms)) r.d = baseAt(r.i) - r.ms; // (each against the measures either side of it)
      rows.push({ name: 'the frame as it is, again', ms: again, d: null, note: `${again >= head.ms ? '+' : ''}${(100 * (again / head.ms - 1)).toFixed(1)}% on the first (measured ${bases.length} times: ${bases.map(b => b.ms.toFixed(1)).join(', ')})` });

      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
      const sent = !!(window.OETelemetry && OETelemetry.on);
      show(`${gpu}\n${sent ? 'Sent with the telemetry.' : 'Not sent: telemetry is off here.'} The second column is what the part costs: the frame's time less the time without it.`);
      const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close';
      close.onclick = () => { out.remove(); st.remove(); };
      const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy';
      copy.onclick = () => { try { navigator.clipboard.writeText(out.firstChild.textContent); copy.textContent = 'Copied'; } catch (e) { /* no clipboard */ } };
      out.append(copy, close);
      console.info('perf', JSON.stringify(rows));
      if (window.OETelemetry && OETelemetry.track) {
        OETelemetry.track('perf', { base_ms: +head.ms.toFixed(1), again_ms: +again.toFixed(1), w: size.x, h: size.y, gpu: gpu.slice(0, 120), draws: info.calls, ktris: Math.round(info.tris / 1000),
          rows: JSON.stringify(rows.map(r => [r.name, isFinite(r.ms) ? +r.ms.toFixed(1) : null, r.d == null ? null : +r.d.toFixed(1), r.note || ''])).slice(0, 7000) });
        if (OETelemetry.flush) OETelemetry.flush();
      }
      return rows;
    } finally {
      for (const fn of restore) { try { fn(); } catch (e) { /* left */ } }
      if (gov) { gov.auto = auto; if (gov.reset) gov.reset(); }
    }
  }
  return { run };
})();
