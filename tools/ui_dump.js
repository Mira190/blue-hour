// The story's interface as it stands at a beat, written down so tools/ui_fit.js can lay it out again at every screen
// size without playing the episode once per size: the stage's overlays (everything in #game-stage but the canvas) as
// HTML, the classes on the page, the scroll of anything scrolled, and where each running animation is.
//   const { dump } = require('./ui_dump');  await dump(page, 'dir/name.json', { ctx: 'desk' })
// story_play.js and walk_play.js call it at each still when UI_DUMP=dir is set.
const fs = require('fs');
const path = require('path');
async function dump(page, file, extra = {}) {
  const d = await page.evaluate(() => {
    const stage = document.getElementById('game-stage');
    if (!stage) return null;
    // (an element named by its place under the stage: child indexes, the same after the HTML is laid in again)
    const at = e => { const p = []; while (e && e !== stage) { const par = e.parentElement; if (!par) return null; p.unshift([...par.children].indexOf(e)); e = par; } return e === stage ? p : null; };
    const kids = [...stage.children], keep = kids.filter(e => e.id !== 'game-gl');
    const anims = document.getAnimations().map(a => { const t = a.effect && a.effect.target; const p = t && at(t); return p ? { p, name: a.animationName || a.transitionProperty || '', t: a.currentTime, run: a.playState } : null; }).filter(Boolean);
    const scrolled = [...stage.querySelectorAll('*')].filter(e => e.scrollTop > 0 || e.scrollLeft > 0).map(e => ({ p: at(e), top: e.scrollTop, left: e.scrollLeft }));
    // (the canvas's place among the stage's children, so the overlays go back on the same side of it)
    return { html: kids.map(e => (e.id === 'game-gl' ? null : e.outerHTML)), stage: stage.className, stageStyle: stage.getAttribute('style') || '', root: document.documentElement.className,
      body: document.body.className, anims, scrolled, vw: innerWidth, vh: innerHeight, kept: keep.length };
  });
  if (!d) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(Object.assign(d, extra)));
}
module.exports = { dump };
