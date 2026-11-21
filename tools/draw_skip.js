// A check that reads the game's state, not its pictures, need not draw what nothing looks at (docs/CHECKS.md, "The
// checks faster"). On a software renderer a frame of the street drawn whole takes a second or more of every core, and
// the game moves a twentieth of a second a frame at most, so a play that draws every frame runs its clock many times
// slow. With this, one frame in n is drawn and the others run the game without their draw calls and their clears
// (the world's matrices, every onBeforeRender and the page's own script run as ever); a still is of a frame drawn whole.
// tools/story_play.js has its own, older and finer (frames as tasks, the page held across a still); this is the short
// one, first written in tools/guide_way.js, for the harnesses that only need the draws gone.
//   const { skip, whole } = require('./draw_skip');
//   await skip(page, n);                         // before the page is opened; n < 2: every frame drawn, as without it
//   await whole(page, () => page.screenshot())   // two frames drawn whole, then what is asked, then as before
async function skip(p, n) {
  if (!(n > 1)) return;
  await p.addInitScript(n => {
    const P = WebGL2RenderingContext.prototype, raf = window.requestAnimationFrame.bind(window), D = window.__draw = window.__draw || { all: false, on: true, frames: 0 };
    window.requestAnimationFrame = fn => raf(t => { D.on = D.all || D.frames++ % n === 0; try { fn(t); } finally { D.on = true; } });
    for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'blitFramebuffer', 'clear', 'clearBufferfv', 'clearBufferiv', 'clearBufferuiv', 'clearBufferfi']) {
      const f = P[k]; P[k] = function (...a) { if (D.on) return f.apply(this, a); };
    }
  }, n);
}
async function whole(p, fn) {
  const on = await p.evaluate(() => !!window.__draw).catch(() => false);
  try {
    if (on) await p.evaluate(() => new Promise(r => { window.__draw.all = true; const t = setTimeout(r, 60000); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); }));
    return await fn();
  } finally { if (on) await p.evaluate(() => { window.__draw.all = false; }).catch(() => {}); }
}
module.exports = { skip, whole };
