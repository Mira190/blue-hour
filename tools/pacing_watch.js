// Nobody of the crowd paces (issue 168), watched while a play goes on: tools/walk_play.js and tools/story_play.js
// install this in their page, and at the end ask what it saw. tools/crowd_pacing.js is the survey (the whole level, hour
// by hour, the world stepped by hand); this is the same measure taken on the side of a play, on whatever street the play
// is in. Five times a second each walker of the crowd is looked at: over every WINDOW seconds of the world's time (30:
// the crowd's own clock, so a held world or a slow frame does not count) its path, the ground it covered, is set against
// its net progress, how far it is from where the window began. One who has covered more than FAR metres (12), ended
// within NEAR (4) of where it began and turned round at least twice has paced for that window. A play fails on a walker
// who paced two windows running (a minute to and fro) or turned four times in one; one window alone is told as a note
// (a walker held at a kerb by a car turns once and comes back: a street's life).
//   const pacing = require('./pacing_watch'); await pacing.install(page); ... const R = await pacing.report(page);
//   pacing.print(R) -> { hard: [...] }
const WINDOW = 30, FAR = 12, NEAR = 4;
async function install(page) {
  await page.addInitScript(([WINDOW, FAR, NEAR]) => {
    const W = window.__pace = { T: new Map(), paced: [], followed: 0, windows: 0 };
    setInterval(() => {
      const g = window.__game, C = g && g.crowd;
      if (!C || !C.P || C.t === undefined) return;
      const P = C.P, T = W.T, t = C.t;
      if (W.t0 !== undefined && t < W.t0) T.clear(); // (the world's time put back: a frame begun again)
      W.t0 = t;
      for (let i = 0; i < C.active; i++) {
        const q = P[i];
        let k = T.get(i);
        if (q.line < 0 || q.state !== 'walk' || q.seat) { T.delete(i); continue; }
        if (!k || Math.hypot(q.x - k.px, q.y - k.py) > 3) { if (!k) W.followed++; T.set(i, { x0: q.x, y0: q.y, t0: t, px: q.x, py: q.y, path: 0, turns: 0, dir: q.dir, line: q.line, run: 0 }); continue; } // (new, or somewhere else now)
        k.path += Math.hypot(q.x - k.px, q.y - k.py); k.px = q.x; k.py = q.y;
        if (q.line === k.line && q.dir !== k.dir) k.turns++;
        k.dir = q.dir; k.line = q.line;
        if (t - k.t0 >= WINDOW) {
          W.windows++;
          const net = Math.hypot(q.x - k.x0, q.y - k.y0), did = k.path > FAR && net < NEAR && k.turns >= 2, run = did ? k.run + 1 : 0;
          if (did) W.paced.push({ id: i, x: +q.x.toFixed(1), y: +q.y.toFixed(1), z: +q.z.toFixed(1), line: q.line, path: +k.path.toFixed(1), net: +net.toFixed(1), turns: k.turns, run, at: +t.toFixed(0), frame: g.story && g.story.state ? g.story.state.fi + 1 : 0 });
          T.set(i, { x0: q.x, y0: q.y, t0: t, px: q.x, py: q.y, path: 0, turns: 0, dir: q.dir, line: q.line, run });
        }
      }
    }, 200);
  }, [WINDOW, FAR, NEAR]);
}
async function report(page) {
  return page.evaluate(() => (window.__pace ? { followed: window.__pace.followed, windows: window.__pace.windows, paced: window.__pace.paced } : null)).catch(() => null);
}
// what it saw, said; hard: the walkers a play fails on
function print(R, say = console.log) {
  if (!R) { say('pacing: not measured (the watch was not in the page)'); return { hard: [] }; }
  const hard = R.paced.filter(q => q.run >= 2 || q.turns >= 4);
  for (const q of R.paced) say(`${hard.includes(q) ? 'FAIL' : 'note'} pacing: walker ${q.id} at (${q.x}, ${q.y}) on line ${q.line}: ${q.path} m walked, ${q.net} m from where it began, ${q.turns} turns in ${WINDOW} s${q.run > 1 ? `, ${q.run} windows running` : ''}${q.frame ? `, frame ${q.frame}` : ''}`);
  say(`pacing: ${R.followed} walkers followed over ${R.windows} windows of ${WINDOW} s, ${hard.length} paced${R.paced.length > hard.length ? ` (${R.paced.length - hard.length} turned back once and went on)` : ''}`);
  return { hard };
}
module.exports = { install, report, print, WINDOW, FAR, NEAR };
