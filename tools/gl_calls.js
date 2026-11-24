// What a frame asks of WebGL, call by call (issue 191: Safari spends 18 to 19 ms a frame outside the page's script, the
// same at any scale and tier, so per call and not per pixel). Every method of the WebGL 2 context is counted for a run
// of frames, and for each kind it says how many calls a frame are made and how many of them change nothing:
//   - a uniform set to the value its program's location already holds (from any earlier frame), by uniform name;
//   - useProgram, bindTexture, bindBuffer, bindVertexArray, bindFramebuffer to what is already bound;
//   - enable/disable, depthMask, colorMask, blendFunc(Separate), blendEquation(Separate), depthFunc, cullFace, frontFace,
//     viewport, scissor, clearColor, polygonOffset, stencil*, activeTexture, pixelStorei to the state they already have.
// And where the calls go: by pass (the framebuffer drawn into), and by what three.js was drawing when they were made
// (renderer.renderBufferDirect wrapped from here: the material's type and name, the object's name), so a cut can be
// aimed at the systems that make the most.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/gl_calls.js [WxH] [frames]          (the night walk where it starts, the governor held)
//     TIER=high|medium|low (bh-quality), PHONE=1 (a phone's page: touch, 390x844 at 3), TIME=HH:MM (default 21:30),
//     Q= (default walk=1&weather=clear&overture=0), OUT=file.json (the whole tally), GPU=gl (Mesa's llvmpipe; default)
//   In a play: const gc = require('./gl_calls'); await gc.install(page); ... gc.print(await gc.sample(page, 30, 'label'))
'use strict';
async function install(page) {
  await page.addInitScript(() => {
    const T = window.__glCalls = { texN: 0, beats: [], beatsOn: false, on: false, frames: 0, calls: {}, same: {}, uni: {}, uniSame: {}, pass: {}, who: {}, by: {}, progs: new Set(), switches: 0, draws: 0 };
    // (these methods also by what was drawn: the work redone each frame, and the lights' uniforms)
    const BY = /^(createBuffer|deleteBuffer|bufferData|bufferSubData|createVertexArray|texParameteri|texSubImage2D|texImage2D|texStorage2D|generateMipmap|useProgram|draw|multiDraw)/;
    const P = WebGL2RenderingContext.prototype, orig = {};
    const names = new WeakMap(), lastU = new WeakMap(), fbName = new WeakMap(); let fbN = 0;
    const st = { prog: null, vao: null, fb: null, unit: 0, tex: {}, buf: {}, cap: {}, misc: {} };
    let pass = 'screen', who = 'other';
    const add = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
    const same = k => add(T.same, k);
    const key = a => { let s = ''; for (const v of a) s += (v && v.length !== undefined && typeof v !== 'string' ? Array.prototype.join.call(v, ',') : String(v)) + '|'; return s; };
    const MISC = ['depthMask', 'colorMask', 'blendFunc', 'blendFuncSeparate', 'blendEquation', 'blendEquationSeparate', 'depthFunc', 'cullFace', 'frontFace', 'viewport', 'scissor', 'clearColor', 'clearDepth', 'polygonOffset', 'stencilFunc', 'stencilOp', 'stencilMask', 'pixelStorei', 'lineWidth', 'blendColor', 'clearStencil'];
    for (const k of Object.getOwnPropertyNames(P)) {
      const d = Object.getOwnPropertyDescriptor(P, k);
      if (!d || typeof d.value !== 'function' || k === 'constructor') continue;
      const f = orig[k] = d.value;
      const draw = /^(draw|multiDraw)/.test(k);
      P[k] = function (...a) {
        if (k === 'getUniformLocation') { const l = f.apply(this, a); if (l) names.set(l, a[1]); return l; }
        if (!T.on) {
          // (the state is followed while not counting too, so the first counted call is judged against the real state)
          if (k === 'useProgram') st.prog = a[0]; else if (k === 'bindVertexArray') st.vao = a[0]; else if (k === 'activeTexture') st.unit = a[0];
          else if (k === 'bindTexture') st.tex[st.unit + ':' + a[0]] = a[1]; else if (k === 'bindBuffer') st.buf[a[0]] = a[1];
          else if (k === 'bindFramebuffer') st.fb = a[1]; else if (k === 'enable') st.cap[a[0]] = true; else if (k === 'disable') st.cap[a[0]] = false;
          else if (MISC.includes(k)) st.misc[k + (k === 'pixelStorei' ? a[0] : '')] = key(a);
          else if (k.startsWith('uniform') && a[0] && !T.beatsOn) lastU.set(a[0], key(a.slice(1)));
          return f.apply(this, a);
        }
        add(T.calls, k); add(T.who, who);
        if (!T.beatsOn && /^(createBuffer|deleteBuffer|createVertexArray|deleteVertexArray)$/.test(k)) { const at = (new Error().stack || '').split('\n').slice(2).filter(l => !/three\.module|three\.core|gl_calls|<anonymous>/.test(l)).slice(0, 3).map(l => l.replace(/^\s*at\s*/, '').replace(/https?:\/\/[^/]+\//, '')).join(' < '); add(T.by[k + ' at'] || (T.by[k + ' at'] = {}), at || '?'); }
        if (k === 'texSubImage2D' || k === 'texImage2D' || k === 'compressedTexSubImage2D') { const tx = st.tex[st.unit + ':' + a[0]]; if (tx) { if (!tx.__gc) tx.__gc = ++T.texN; add(T.by['upload textures'] || (T.by['upload textures'] = {}), `#${tx.__gc} ${a[3] !== undefined && typeof a[3] === 'number' ? (k === 'texImage2D' ? a[3] + 'x' + a[4] : a[4] + 'x' + a[5]) : ''} by ${who.slice(0, 50)}`); } }
        if (BY.test(k)) { const m = /^(draw|multiDraw)/.test(k) ? 'draw' : k; add(T.by[m] || (T.by[m] = {}), who); }
        if (k.startsWith('uniform') && a[0] && /^(rectAreaLights|spotLights|pointLights|spotLightMatrix|directionalShadowMatrix)/.test(names.get(a[0]) || '')) add(T.by['lights'] || (T.by['lights'] = {}), who);
        if (draw) { T.draws++; add(T.pass, pass); }
        if (k === 'useProgram') { if (a[0] === st.prog) same(k); else { T.switches++; st.prog = a[0]; } if (a[0]) T.progs.add(a[0]); }
        else if (k === 'bindVertexArray') { if (a[0] === st.vao) same(k); st.vao = a[0]; }
        else if (k === 'activeTexture') { if (a[0] === st.unit) same(k); st.unit = a[0]; }
        else if (k === 'bindTexture') { const u = st.unit + ':' + a[0]; if (st.tex[u] === a[1]) same(k); st.tex[u] = a[1]; }
        else if (k === 'bindBuffer') { if (st.buf[a[0]] === a[1]) same(k); st.buf[a[0]] = a[1]; }
        else if (k === 'bindFramebuffer') {
          if (st.fb === a[1]) same(k); st.fb = a[1];
          if (!a[1]) pass = 'screen'; else { if (!fbName.has(a[1])) fbName.set(a[1], 'fb' + (++fbN)); pass = fbName.get(a[1]); }
        }
        else if (k === 'enable' || k === 'disable') { const v = k === 'enable'; if (st.cap[a[0]] === v) same(k); st.cap[a[0]] = v; }
        else if (MISC.includes(k)) { const m = k + (k === 'pixelStorei' ? a[0] : ''), v = key(a); if (st.misc[m] === v) same(k); st.misc[m] = v; }
        else if (k.startsWith('uniform') && a[0]) {
          const n = names.get(a[0]) || '?';
          add(T.uni, n);
          if (!T.beatsOn) { const v = key(a.slice(1)); if (lastU.get(a[0]) === v) { same('uniform'); add(T.uniSame, n); } lastU.set(a[0], v); } // (a play's beats count only: comparing every value slows a play to a stop)
        }
        return f.apply(this, a);
      };
    }
    // what three.js was drawing (and the pass's own name, where a target says it)
    const hook = () => {
      const r = window.__game && window.__game.renderer;
      if (!r || r.__glCalls) return !!r;
      r.__glCalls = true;
      const rr = r.render.bind(r);
      r.render = function (scene, camera) { if (T.on) { const t = r.getRenderTarget(); add(T.by.render || (T.by.render = {}), `${scene.name || scene.type}${scene.isScene ? '' : ' (' + scene.type + ')'} / ${camera.type}${camera.name ? ' ' + camera.name : ''} -> ${t ? (t.isWebGLCubeRenderTarget ? 'cube' : t.texture && t.texture.name || 'target ' + t.width + 'x' + t.height) : 'screen'}`); } return rr(scene, camera); };
      const rbd = r.renderBufferDirect.bind(r);
      r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
        const was = who;
        who = `${material.type}${material.name ? ' ' + material.name : ''} | ${object.isInstancedMesh ? 'inst ' : object.isBatchedMesh ? 'batch ' : object.isSkinnedMesh ? 'skin ' : ''}${object.name || object.parent && object.parent.name || object.type}`;
        try { return rbd(camera, scene, geometry, material, object, group); } finally { who = was; }
      };
      return true;
    };
    // frames: counted between one animation frame and the next
    const raf = window.requestAnimationFrame.bind(window);
    let last = 0;
    // beats (a play's GLCALLS=1, installBeats below): every frame counted, totalled by the story's beat
    let beat = null, mark = null;
    const snap = () => ({ calls: Object.values(T.calls).reduce((x, y) => x + y, 0), draws: T.draws, uni: Object.values(T.uni).reduce((x, y) => x + y, 0), lights: Object.values(T.by.lights || {}).reduce((x, y) => x + y, 0), up: Object.values(T.by['upload textures'] || {}).reduce((x, y) => x + y, 0), same: Object.values(T.same).reduce((x, y) => x + y, 0) });
    const beatTick = () => {
      const g = window.__game, s = g && g.story && g.story.state, k = s ? `frame ${s.fi + 1}: ${s.phase} ${s.beat || ''}`.trim() : null;
      const now = snap();
      if (beat && mark && now.draws > mark.draws) { for (const q in now) beat[q] += now[q] - mark[q]; beat.frames++; } // (frames drawn only: a play's DRAW=n leaves most undrawn)
      mark = now;
      if (k && (!beat || beat.k !== k)) { beat = T.beats.find(b => b.k === k) || (T.beats.push({ k, frames: 0, calls: 0, draws: 0, uni: 0, lights: 0, up: 0, same: 0 }), T.beats[T.beats.length - 1]); }
    };
    window.requestAnimationFrame = cb => raf(t => { if (t !== last) { last = t; if (T.on) T.frames++; if (T.want && T.frames >= T.want) T.on = false; try { hook(); if (T.beatsOn) beatTick(); } catch (e) { T.err = String(e && e.stack || e).slice(0, 300); } } cb(t); }); // (never in the page's way: a throw here would stop its frames)
  });
}
// a play's beats: every frame counted from the start, a frame's calls by beat (tools/story_play.js GLCALLS=1)
async function installBeats(page) {
  await install(page);
  await page.addInitScript(() => { const T = window.__glCalls; T.beats = []; T.beatsOn = true; T.on = true; });
}
const beats = page => page.evaluate(() => (window.__glCalls ? window.__glCalls.beats : []).filter(b => b.frames >= 5));
function printBeats(bs) {
  console.log('\nWebGL calls a frame by beat (tools/gl_calls.js): calls, draws, uniforms (of them the lights\' and shadow matrices\'), textures uploaded, calls that set what was set (not compared in a play: 0)');
  for (const b of bs) { const f = b.frames; console.log(`  ${b.k.padEnd(28)} ${String(f).padStart(5)} frames  ${String(Math.round(b.calls / f)).padStart(6)} calls  ${String(Math.round(b.draws / f)).padStart(4)} draws  ${String(Math.round(b.uni / f)).padStart(5)} uniforms (${Math.round(b.lights / f)})  ${String(Math.round(b.up / f)).padStart(4)} uploads  ${Math.round(b.same / f)} same`); }
}
// count n frames from the next one; returns the tally a frame
async function sample(page, n = 30, label = '') {
  await page.evaluate(n => { const T = window.__glCalls; Object.assign(T, { by: {}, calls: {}, same: {}, uni: {}, uniSame: {}, pass: {}, who: {}, progs: new Set(), switches: 0, draws: 0, frames: 0, want: n + 1, on: true }); }, n);
  await page.waitForFunction(() => !window.__glCalls.on, null, { timeout: 30 * 60000, polling: 500 });
  return page.evaluate(label => {
    const T = window.__glCalls, f = Math.max(1, T.frames - 1), per = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v / f * 10) / 10]).sort((a, b) => b[1] - a[1]));
    const total = Object.values(T.calls).reduce((a, b) => a + b, 0);
    const g = window.__game, Q = window.OEQuality;
    return { label, frames: f, tier: Q && Q.city && Q.city().name, scale: g && g.governor && g.governor.scale, total: Math.round(total / f), draws: Math.round(T.draws / f), programs: T.progs.size, switches: Math.round(T.switches / f),
      by: Object.fromEntries(Object.entries(T.by).map(([k, o]) => [k, per(o)])), calls: per(T.calls), same: per(T.same), uni: per(T.uni), uniSame: per(T.uniSame), pass: per(T.pass), who: per(T.who) };
  }, label);
}
function print(r, top = 12) {
  const pct = (a, b) => (b ? `${Math.round(100 * a / b)}%` : '-');
  const sameN = Object.values(r.same).reduce((a, b) => a + b, 0);
  console.log(`\n== ${r.label}  (${r.frames} frames, tier ${r.tier}, scale ${r.scale})`);
  console.log(`   ${r.total} WebGL calls a frame, ${r.draws} draws (${(r.total / Math.max(1, r.draws)).toFixed(1)} calls a draw), ${r.switches} program switches over ${r.programs} programs; ${Math.round(sameN)} calls (${pct(sameN, r.total)}) set what was already set`);
  const groups = { uniform: 0, bindTexture: 0, activeTexture: 0, bindBuffer: 0, bindVertexArray: 0, useProgram: 0, draw: 0, 'state set': 0, 'buffer/texture data': 0, other: 0 };
  for (const [k, v] of Object.entries(r.calls)) {
    const g = k.startsWith('uniform') && !k.startsWith('uniformBlock') ? 'uniform' : /^(draw|multiDraw)/.test(k) ? 'draw' : groups[k] !== undefined ? k
      : /^(enable|disable|depth|color|blend|cull|front|viewport|scissor|clear|polygonOffset|stencil|pixelStorei|lineWidth)/.test(k) ? 'state set' : /(Data|SubData|texImage|texSubImage|texStorage|copyBuffer)/.test(k) ? 'buffer/texture data' : 'other';
    groups[g] += v;
  }
  console.log(`   by kind: ${Object.entries(groups).filter(e => e[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')}`);
  console.log(`   by method: ${Object.entries(r.calls).slice(0, top).map(([k, v]) => `${k} ${v}${r.same[k] ? ` (${r.same[k]} same)` : ''}`).join(', ')}`);
  console.log(`   set to what it was: ${Object.entries(r.same).slice(0, top).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`   uniforms by name (same as before): ${Object.entries(r.uni).slice(0, top + 8).map(([k, v]) => `${k} ${v} (${r.uniSame[k] || 0})`).join(', ')}`);
  console.log(`   draws by pass: ${Object.entries(r.pass).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const [m, o] of Object.entries(r.by || {})) console.log(`   ${m} by what was drawn: ${Object.entries(o).slice(0, 8).map(([k, v]) => `${k.slice(0, 70)} ${v}`).join('; ')}`);
  console.log(`   calls by what was drawn:\n${Object.entries(r.who).slice(0, top + 8).map(([k, v]) => `     ${String(Math.round(v)).padStart(5)}  ${k.slice(0, 110)}`).join('\n')}`);
}
module.exports = { install, installBeats, beats, printBeats, sample, print };

if (require.main === module) (async () => {
  const pw = require('playwright');
  const { startPlay } = require('./start_play');
  const [,, size = '1440x900', frames = '30'] = process.argv;
  const phone = !!process.env.PHONE, [w, h] = (phone ? '390x844' : size).split('x').map(Number);
  const b = await pw.chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl'] });
  const ctx = await b.newContext(phone ? { viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 300)));
  if (process.env.TIER) await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER);
  if (process.env.BEATS) await installBeats(p); else await install(p);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?${process.env.Q || 'walk=1&weather=clear&overture=0'}#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await startPlay(p, { asIs: true });
  const time = process.env.TIME || '21:30';
  await p.evaluate(t => { const g = window.__game, [H, M] = t.split(':').map(Number), c = g.clock; g.setClock(c.y, c.m, c.d, H * 60 + M); c.frozen = true; }, time);
  await p.waitForTimeout(+(process.env.WAIT || 60) * 1000); // (the street round the player in, its late parts too: WAIT=s, default 60)
  if (process.env.BEATS) { console.log('err', await p.evaluate(() => window.__glCalls.err)); printBeats(await beats(p)); await b.close(); return; }
  const r = await sample(p, +frames, `the walk where it starts, ${time}, ${phone ? 'a phone 390x844' : size}`);
  print(r);
  if (process.env.OUT) require('fs').writeFileSync(process.env.OUT, JSON.stringify(r, null, 1));
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
