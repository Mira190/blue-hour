// The chase camera under the station's free passage's ceiling (issue 208), every frame of a story's play: frame 4's way
// to SKY's lift goes through the passage from Hachiko Square to Miyamasuzaka (cities/shibuya/scramble.py HACHIKO_EXIT:
// its bends, 5.6 m wide, 3.2 m clear over its floor), and the lens rose through its ceiling and looked down through the
// open top of its roof. Each frame the page runs with the player on foot in the passage, the camera is read against the
// passage as built (a phone lets go of the drawn mesh's arrays, so a ray through what is drawn is not the test here;
// tools/cam_ceiling.js holds it against the drawn meshes on a desktop, and the class of covered places).
//   const ceil = require('./ceiling_watch'); await ceil.install(page); ... const r = await ceil.report(page) -> { frames, bad: [...] }
const WAY = [[420.2, -1027.8], [424.7, -1023.7], [432.4, -1022.0], [441.0, -1021.1]], W = 5.6, H = 3.2;
function pageSide(WAY, W, H) {
  const R = window.__ceilWatch = { frames: 0, bad: [] };
  const off = (x, y) => { let d = Infinity; for (let i = 1; i < WAY.length; i++) { const [ax, ay] = WAY[i - 1], [bx, by] = WAY[i], L2 = (bx - ax) ** 2 + (by - ay) ** 2, t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L2)); d = Math.min(d, Math.hypot(ax + (bx - ax) * t - x, ay + (by - ay) * t - y)); } return d; };
  const tick = () => {
    requestAnimationFrame(tick);
    const g = window.__game;
    if (!g || !g.player || g.player.mode !== 'foot' || !g.camera || off(g.player.x, g.player.y) > W / 2) return;
    R.frames++;
    const c = g.camera.position, cx = c.x, cy = -c.z;
    if (off(cx, cy) < W / 2 && c.y > g.player.z + H + 0.05 && R.bad.length < 400) {
      const st = g.story && g.story.state;
      R.bad.push({ frame: st ? st.fi + 1 : 0, beat: st ? st.beat || '' : '', at: [+g.player.x.toFixed(1), +g.player.y.toFixed(1)], over: +(c.y - g.player.z).toFixed(2), shot: !!(g.cine && g.cine.active) });
    }
  };
  requestAnimationFrame(tick);
}
async function install(page) { await page.addInitScript(`(${pageSide.toString()})(${JSON.stringify(WAY)}, ${W}, ${H})`); }
const report = page => page.evaluate(() => window.__ceilWatch || null).catch(() => null);
module.exports = { install, report, WAY, W, H };
