// The story's conversations seen as a film covers them (web/game/talkcam.js, issue 15): the episode is played by
// tools/story_play.js, and every shot a talk cuts to is judged as the game records it at the cut (game.js: where the
// speaker's face is in the frame, what stands between it and the lens, whether the lens is in a wall). It fails a talk
// whose face is off the screen or has a wall, a tree's trunk or leaves, a body or the crowd in front of it (or the crowd
// anywhere in the frame before the face, or at its shoulder: what the renderer draws, issue 45), a lens in a
// wall, or no clear shot at all; it writes a still of every talk's opening shot (talk-NN-*.png), and five seconds of
// stills across the episode's first cut with time held (cut-NN.png: the world stepped half a second a still, the line
// moved on after the fourth, so that the two-shot gives way to the single). FILM=0: not those.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/talk_check.js out_dir [WxH]         (story_play.js's own settings: DRAW, FROM, UPTO, LIMIT ...)
// Prints one line a shot and exits 1 if any fails, or if story_play.js does.
'use strict';
const path = require('path');
const fs = require('fs');
const [,, out = '/tmp/talk-check', size = '1440x900'] = process.argv;
const pw = require('playwright');
const launch = pw.chromium.launch.bind(pw.chromium);
const bad = [], seen = [];
let page = null, film = null, polling = null, busy = false;
// (a still of frames drawn whole: story_play.js's DRAW runs most frames without their draws)
const still = async file => {
  await page.evaluate(() => new Promise(r => { if (!window.__draw) return r(); window.__draw.all = true; requestAnimationFrame(() => requestAnimationFrame(r)); }));
  try { await page.screenshot({ path: path.join(out, file), timeout: 300000 }); } finally { await page.evaluate(() => { if (window.__draw) window.__draw.all = false; }).catch(() => {}); }
};
const judge = s => [
  (!s.front || Math.abs(s.x) > 0.92 || Math.abs(s.y) > 0.92) && `face off the screen (${s.x}, ${s.y})`,
  s.block && `${s.block} between the lens and the face`,
  s.crowd > 0 && `${s.crowd} of the crowd drawn in the frame before the face or at its shoulder`, // (issue 45)
  s.inWall && 'the lens in a wall',
  s.why === 'eyes' && 'no clear shot on either side: through the eyes',
].filter(Boolean);
// the shots cut to since the last look, each judged; a still of the one on screen now if it opens a talk
async function poll() {
  if (busy || !page || page.isClosed()) return;
  busy = true;
  try {
    const L = await page.evaluate(n => { const T = window.__game && window.__game.talkCam; return T ? T.log.slice(n) : []; }, seen.length);
    for (const s of L) {
      if (s.x == null) break; // (cut to, not yet drawn: next look)
      seen.push(s);
      const why = judge(s);
      console.log(`talk shot ${seen.length}: ${s.name} ${s.kind} side ${s.side}${s.crossed ? ' (line crossed)' : ''}${s.k < 1 ? ` (in to ${s.k})` : ''} face at (${s.x}, ${s.y})${why.length ? ` FAIL ${why.join('; ')}` : ''}`);
      if (why.length) bad.push(`${s.name} (${s.kind}): ${why.join('; ')}`);
    }
    const last = seen[seen.length - 1], now = await page.evaluate(() => { const g = window.__game; return !!(g && g.talkShot && g.talkShot()); });
    if (last && now && !last.still) {
      last.still = true;
      if (last.fresh || judge(last).length) await still(`talk-${String(seen.length).padStart(2, '0')}-${last.kind}-${(last.name || '').split(' ')[0]}${judge(last).length ? '-FAIL' : ''}.png`);
      // five seconds of stills across the first cut, time held: the world and the line stepped by this, not by the machine
      if (process.env.FILM !== '0' && !film && last.kind === 'two') {
        film = true;
        let release; const gate = new Promise(r => { release = r; });
        film = gate; // (story_play.js's keys wait: nothing moves the talk on but this)
        await page.evaluate(() => window.__game.hold(true));
        try { for (let i = 0; i < 10; i++) {
          await page.evaluate(i => { const g = window.__game; if (i === 4) g.dlg.next(false); for (let k = 0; k < 15; k++) { g.frame(1 / 30); g.dlg.tick(1 / 30); } }, i);
          await still(`cut-${String(i).padStart(2, '0')}.png`);
          const r = await page.evaluate(() => { const g = window.__game, t = g.talkShot && g.talkShot(), c = g.camera; return t ? { kind: t.kind, inWall: g.nav.clearFraction(new c.position.constructor(t.subject[0], t.subject[2], -t.subject[1]).sub(c.position).normalize().multiplyScalar(0.5).add(c.position), c.position) < 0.999 } : null; });
          console.log(`cut film ${i} (${(i * 0.5).toFixed(1)} s): ${r ? `${r.kind}${r.inWall ? ' THE LENS IN A WALL' : ''}` : 'chase view'}`);
          if (r && r.inWall) bad.push(`cut film ${i}: the lens in a wall`);
        } } catch (e) { bad.push(`cut film: ${String(e).slice(0, 200)}`); console.log(`cut film failed: ${String(e).slice(0, 300)}`); }
        finally { await page.evaluate(() => window.__game.hold(false)).catch(() => {}); release(); film = true; }
      }
    }
  } catch (e) { if (!/closed|Target/.test(String(e))) console.log(`(talk check: ${String(e).slice(0, 200)})`); }
  busy = false;
}
pw.chromium.launch = async (...a) => {
  const b = await launch(...a), newPage = b.newPage.bind(b), close = b.close.bind(b);
  b.newPage = async (...q) => {
    page = await newPage(...q);
    const press = page.keyboard.press.bind(page.keyboard);
    page.keyboard.press = async (...k) => { if (film && film.then) await film; return press(...k); };
    polling = setInterval(() => { poll(); }, 200);
    return page;
  };
  b.close = async () => {
    clearInterval(polling);
    while (busy) await new Promise(r => setTimeout(r, 100));
    busy = false; await poll();
    if (!seen.length) bad.push('no conversation was seen');
    console.log(`talk check: ${seen.length} shots; ${bad.length} failing`);
    for (const l of bad) console.log(`FAIL ${l}`);
    fs.writeFileSync(path.join(out, 'talks.json'), JSON.stringify(seen, null, 1));
    return close();
  };
  return b;
};
const exit = process.exit.bind(process);
process.exit = code => exit(code || (bad.length ? 1 : 0));
fs.mkdirSync(out, { recursive: true });
process.argv = [process.argv[0], path.join(__dirname, 'story_play.js'), out, size];
require('./story_play.js');
