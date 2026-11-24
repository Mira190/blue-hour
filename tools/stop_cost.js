// What a beat of the story costs the page's script, beat by beat, watched on the side of a play (issue 206: the Stop's
// seek ran at 1 to 5 fps on the owner's iPhone while the walks beside it ran at 21 to 32). tools/story_play.js installs
// it with STOPCOST=1 and prints its report at each beat's end and at the end of the play:
//   - the frames the beat ran, their script's median and longest (the game's frame callback, timed from outside);
//   - the guide's planning round the held crowd (companion.js plan): how often his options' stand() was asked, the
//     time it took, and the most in one frame; stand() is asked once a cell of the planner's grid
//   - the shader programs linked while the beat ran, by their material's name or type (a program linked in a frame
//     stalls it: a second or more on a phone).
//   const stopCost = require('./stop_cost'); await stopCost.install(page); ... stopCost.print(await stopCost.report(page))
async function install(page) {
  await page.addInitScript(() => {
    const C = window.__stopCost = { beats: [], cur: null, progs: 0, dc: 0, tri: 0 };
    // every draw call and its triangles, counted per frame (the heaviest frame of a beat: a cube's six faces in one, issue 192)
    for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) for (const [k, n, inst] of [['drawElements', 1, -1], ['drawArrays', 2, -1], ['drawElementsInstanced', 1, 4], ['drawArraysInstanced', 2, 3]]) {
      const f = P[k]; if (!f) continue;
      P[k] = function (...a) { if (a[0] === 4) { C.dc++; C.tri += a[n] / 3 * (inst >= 0 ? a[inst] : 1); } else C.dc++; return f.apply(this, a); };
    }
    const key = () => { const g = window.__game, s = g && g.story && g.story.state; return s ? `${s.fi + 1}-${s.phase}-${s.beat || ''}` : 'none'; };
    const beat = () => {
      const k = key();
      if (!C.cur || C.cur.k !== k) { C.cur = { k, frames: [], stand: 0, standMs: 0, standMax: 0, f: { n: 0, ms: 0 }, progs: [], long: [], dcMax: 0, triMax: 0 }; C.beats.push(C.cur); if (C.beats.length > 80) C.beats.shift(); }
      return C.cur;
    };
    // the guide's options: stand() timed (game.js makeGuide passes it to OECompanion.create)
    let comp;
    Object.defineProperty(window, 'OECompanion', { configurable: true, get: () => comp, set: v => {
      comp = v; const make = v.create;
      v.create = o => { if (o && o.stand) { const st = o.stand; o.stand = (...a) => { const t = performance.now(), r = st(...a), d = performance.now() - t, b = beat(); b.stand++; b.standMs += d; b.f.n++; b.f.ms += d; return r; }; } return make(o); };
    } });
    // each frame: the game's callbacks timed, and the programs the renderer holds counted
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(t => {
      const t0 = performance.now(); cb(t); const ms = performance.now() - t0;
      const g = window.__game; if (!g || !g.story) return;
      const b = beat(); if (ms > 0.5) b.frames.push(ms);
      if (C.dc > b.dcMax) b.dcMax = C.dc; if (C.tri > b.triMax) b.triMax = C.tri; C.dc = 0; C.tri = 0;
      const sMs = b.f.ms; if (b.f.n) { b.standMax = Math.max(b.standMax, b.f.ms); b.f.n = 0; b.f.ms = 0; }
      const P = g.renderer && g.renderer.info && g.renderer.info.programs, made = [];
      if (P && P.length !== C.progs) { for (const q of P.slice(Math.min(C.progs, P.length))) made.push(`${q.name || '?'}${q.cacheKey && /exposure/.test(q.cacheKey) ? ' (exposure)' : ''}`); b.progs.push(...made); C.progs = P.length; }
      if (ms > 100 && b.long.length < 8) b.long.push(`${ms.toFixed(0)} ms${sMs > 1 ? `, stand ${sMs.toFixed(0)}` : ''}${made.length ? `, linked ${made.join(', ')}` : ''}`);
    });
  });
}
const report = page => page.evaluate(() => (window.__stopCost ? window.__stopCost.beats.map(b => { const f = b.frames.slice().sort((x, y) => x - y); return { k: b.k, frames: f.length, med: f.length ? +f[f.length >> 1].toFixed(1) : 0, p90: f.length ? +f[Math.floor(f.length * 0.9)].toFixed(1) : 0, max: f.length ? +f[f.length - 1].toFixed(0) : 0, stand: b.stand, standMs: +b.standMs.toFixed(0), standMax: +b.standMax.toFixed(1), progs: b.progs, long: b.long, dcMax: b.dcMax, triMax: Math.round(b.triMax) }; }) : []));
const print = R => { for (const b of R) { console.log(`stop cost ${b.k}: ${b.frames} frames, script median ${b.med} ms, 90% ${b.p90}, longest ${b.max}; guide's stand() ${b.stand}x, ${b.standMs} ms, at most ${b.standMax} ms a frame; the heaviest frame ${b.dcMax} draws, ${(b.triMax / 1e6).toFixed(2)} M triangles; programs linked ${b.progs.length}${b.progs.length ? ` (${b.progs.slice(0, 12).join(', ')})` : ''}`); for (const l of b.long || []) console.log(`  a long frame in ${b.k}: ${l}`); } };
module.exports = { install, report, print };
