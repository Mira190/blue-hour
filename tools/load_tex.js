// The story's load on a desktop, stage by stage, with what WebGL holds at each and what the pictures' packing cost
// (web/tex.js): for a change to how pictures reach the GPU, before and after.
//   xvfb-run -a node tools/load_tex.js ['?tex=bc7' | '?tex=raw']        (1440 x 900, the high tier; TIER=, SIZE=)
// Prints each of the loader's steps (game.js loadStep) with its second and the GPU's megabytes, then the time to the
// title and the last step, the textures and buffers held, and OETex.stats: pictures packed, kept, their texels, the encoders' seconds
// (summed over the Workers) and the worst picture's decibels. On a software renderer the seconds are a guide only.
const { chromium } = require('playwright');
const [,, query = ''] = process.argv;
(async () => {
  const [w, h] = (process.env.SIZE || '1440x900').split('x').map(Number);
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.addInitScript(require('./gl_mem').hook);
  const t0 = Date.now();
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  // (the load is over when the title is up, as tools/story_play.js waits for it, and nothing is being packed)
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 250 });
  const title = (Date.now() - t0) / 1000;
  await p.evaluate(() => (window.OETex ? OETex.settled() : null));
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => { const m = window.__memReport(0), T = window.OETex ? OETex.stats : {};
    return { steps: window.__steps, tex: m.tex, buf: m.buf, rb: m.rb, peak: m.peak, nTex: m.nTex,
      tex_stats: { on: T.on, fmt: T.fmt, normals: T.normals, packed: T.packed, kept: T.kept, mtexels: +(T.texels / 1e6).toFixed(1), mb: +(T.bytes / 1048576).toFixed(1), s: +(T.ms / 1000).toFixed(1), worst: T.worst, keptList: (T.log || []).filter(l => l.kept).map(l => `${l.name} ${l.w}x${l.h} ${l.db}`) } }; });
  const MB = v => (v / 1048576).toFixed(0);
  for (const s of r.steps) console.log(`${String(s.t).padStart(6)} s  ${MB(s.gpu).padStart(5)} MB  ${s.step}`);
  console.log(`${query || '(default)'}: the title at ${title.toFixed(1)} s; last step at ${r.steps.length ? r.steps[r.steps.length - 1].t : '?'} s; textures ${MB(r.tex)} MB (${r.nTex}), buffers ${MB(r.buf)} MB, renderbuffers ${MB(r.rb)} MB, peak ${MB(r.peak)} MB`);
  console.log(`pictures: ${JSON.stringify(r.tex_stats)}`);
  if (errors.length) console.log(`page errors: ${errors.join(' | ')}`);
  // MAX_TEX=MB: fails over that many megabytes of textures at the title, or where blocks were asked for and nothing was
  // packed, or a picture was left as pixels under the encoder's floor (tools/check.sh mem)
  let bad = errors.length;
  const MAX = +process.env.MAX_TEX || 0, T = r.tex_stats;
  if (MAX && r.tex / 1048576 > MAX) { bad++; console.log(`FAIL textures ${MB(r.tex)} MB at the title, over ${MAX}`); }
  if (MAX && /tex=(bc7|astc)/.test(query) && !(T.packed > 50)) { bad++; console.log(`FAIL ${T.packed || 0} pictures packed: blocks were asked for (${T.fmt || 'no format'})`); }
  if (MAX && T.kept) { bad++; console.log(`FAIL ${T.kept} pictures under the encoder's floor: ${T.keptList.join(', ')}`); }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
