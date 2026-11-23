// The frames a second a real GPU draws in a frame of the story, and where its governor settles (issues 67, 130, 191):
// the page as a player has it, begun from the title, then left standing. Nothing is measured inside the page's frames
// (tools/story_play.js probes every body every frame, and takes stills: its frames are not a player's), and the
// governor runs as on a player's device (under a harness it stands still, quality.js).
//   GPU=metal DPR=2 node tools/fps_probe.js [WxH] [seconds]        (FROM=4: the fifth frame; TIER=; Q='?tex=raw')
// Prints the renderer, then every five seconds the governor's scale/extras and frame time, the tier, the frames drawn
// with their median and slowest tenth; then the medians of the second half.
const { chromium } = require('playwright');
const [,, size = '1440x900', secs = '60'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: process.env.GPU === 'metal' || !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +process.env.DPR || 1 });
  const errors = []; p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  // (a late start, as tools/story_play.js FROM makes it)
  if (process.env.FROM) await p.addInitScript(n => { try { localStorage.setItem('bh-story-late', JSON.stringify({ fi: n, left: 7 - n, prints: Array.from({ length: n }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, +process.env.FROM);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${process.env.Q || ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  console.log(`renderer: ${await p.evaluate(() => { const d = document.createElement('canvas').getContext('webgl2'), x = d && d.getExtension('WEBGL_debug_renderer_info'); return d ? (x ? d.getParameter(x.UNMASKED_RENDERER_WEBGL) : d.getParameter(d.RENDERER)) : 'no WebGL2'; })}`);
  await p.waitForTimeout(5000);
  // the title left as tools/story_play.js leaves it: its Play pressed until it is gone
  for (let k = 0; k < 15; k++) {
    if (await p.evaluate(() => { const t = document.getElementById('g-title'); if (!t || t.hidden) return true; const x = document.getElementById('gt-play'); if (x) x.click(); return false; })) break;
    await p.waitForTimeout(1500);
  }
  await p.evaluate(() => { window.__game.governor.auto = true; const T = window.__gaps = []; let l = 0; const f = t => { if (l) T.push(t - l); l = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const all = [], med = a => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : NaN);
  // (the main thread's time, from the browser's own counters and not from inside a frame: all its tasks, and the script in them)
  const cdp = await p.context().newCDPSession(p); await cdp.send('Performance.enable');
  const busy = async () => { const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value])); return { task: m.TaskDuration * 1000, script: m.ScriptDuration * 1000 }; };
  let was = await busy();
  for (let t = 5; t <= +secs; t += 5) {
    await p.waitForTimeout(5000);
    const now = await busy(), cpu = { task: now.task - was.task, script: now.script - was.script }; was = now;
    const r = await p.evaluate(() => { const g = window.__game, G = g.governor, T = window.__gaps.splice(0).sort((a, b) => a - b), s = g.story && g.story.state, c = g.renderer.domElement;
      return { fi: s ? s.fi + 1 : 0, phase: s ? s.phase : '', scale: G.scale, extras: G.extras, ms: G.frameMs || 0, tier: window.OEQuality.tier().name, n: T.length, med: T.length ? T[T.length >> 1] : 0, p90: T.length ? T[Math.floor(T.length * 0.9)] : 0, canvas: `${c.width}x${c.height}`, title: !document.getElementById('g-title').hidden }; });
    r.cpu = r.n ? cpu.task / r.n : 0; all.push(r);
    console.log(`${String(t).padStart(4)} s  frame ${r.fi} ${r.phase}${r.title ? ' (title still up)' : ''}: ${r.scale.toFixed(2)}/${r.extras}, ${r.ms.toFixed(1)} ms, tier ${r.tier}; ${r.n} frames, median ${(1000 / r.med).toFixed(0)} fps, slowest tenth from ${r.p90.toFixed(0)} ms; main thread ${r.cpu.toFixed(1)} ms a frame (script ${(r.n ? cpu.script / r.n : 0).toFixed(1)}); canvas ${r.canvas}`);
  }
  const late = all.slice(all.length >> 1); // (the second half: after the governor has had time to settle)
  console.log(`settled (the second half): ${(late.reduce((s, r) => s + r.n, 0) / (late.length * 5)).toFixed(0)} frames a second drawn, median gap ${med(late.map(r => r.med)).toFixed(1)} ms, main thread ${med(late.map(r => r.cpu)).toFixed(1)} ms a frame, governor ${late[late.length - 1].scale.toFixed(2)}/${late[late.length - 1].extras}, tier ${late[late.length - 1].tier}`);
  // PROFILE=seconds: then the main thread's script sampled for that long, and its heaviest functions by self time, a frame
  if (+process.env.PROFILE) {
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
    await p.evaluate(() => { window.__gaps.length = 0; }); await p.waitForTimeout(+process.env.PROFILE * 1000);
    const n = await p.evaluate(() => window.__gaps.length), { profile } = await cdp.send('Profiler.stop');
    const self = new Map(), name = new Map(profile.nodes.map(x => [x.id, `${x.callFrame.functionName || '(anon)'} ${x.callFrame.url.replace(/^https?:\/\/[^/]+\//, '')}${x.callFrame.url ? `:${x.callFrame.lineNumber + 1}` : ''}`.trim()]));
    profile.samples.forEach((id, i) => { const k = name.get(id); self.set(k, (self.get(k) || 0) + profile.timeDeltas[i] / 1000); });
    console.log(`the main thread over ${n} frames, ms a frame by self time:\n${[...self].filter(([k]) => !/^\((idle|root)\)/.test(k)).sort((a, z) => z[1] - a[1]).slice(0, 24).map(([k, v]) => `  ${(v / n).toFixed(2).padStart(6)}  ${k}`).join('\n')}`);
  }
  if (errors.length) console.log(`page errors: ${errors.slice(0, 5).join(' | ')}`);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
