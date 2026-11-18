// Stills of the roll's file (the kraft paper the case is written on, story.js filed) with an evening's lines on it,
// on a desktop and a phone, without playing the episode: the first episode's frame notes, a thing said, one taken back,
// a pair that argued and a spent frame, written onto the story's state, and the roll opened over the title.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/file_shot.js out_dir
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/file-shot'] = process.argv;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: w < 500, isMobile: w < 500 });
    p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
    await p.addInitScript(() => { try { localStorage.setItem('oe3d-quality', 'low'); } catch (e) { /* storage blocked */ } });
    await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction(() => window.__game && window.__game.story && window.__game.story.state, null, { timeout: 900000, polling: 500 });
    await p.evaluate(() => {
      const st = window.__game.story.state, frames = (window.__game.G.story.episodes[0].frames || []);
      st.phase = 'go';
      st.prints = frames.slice(0, 4).map((f, i) => ({ src: null, stamp: f.stamp, cap: f.cap || '', plain: i === 3 }));
      st.file = [
        ...frames.slice(0, 3).map((f, i) => ({ at: f.stamp, text: `Frame ${i + 1}. ${f.note || f.cap}`, kind: 'print' })),
        { at: frames[2].stamp, text: 'I said the detective lied about the minute.', kind: 'said', struck: true },
        { at: frames[2].stamp, text: "I said he spent the minute at the boy's pitch.", kind: 'said' },
        { at: frames[2].stamp, text: 'Frames 1 and 2, side by side. Thirty steps of road. Whatever kept him from her that evening, it was not the distance.', kind: 'pair' },
        { at: frames[3].stamp, text: 'Frame 4. Only tonight.', kind: 'spent' },
      ];
      document.getElementById('g-story-frames').click();
    });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(800);
    await p.evaluate(() => { const f = document.querySelector('#g-story-album .file'); if (f) f.scrollIntoView({ block: 'center' }); });
    await p.waitForTimeout(400);
    const font = await p.evaluate(() => { const li = document.querySelector('#g-story-album .file li span'); return li && document.fonts.check(`21px Caveat`) && getComputedStyle(li).fontFamily; });
    console.log(`${w}x${h}`, 'font:', font);
    await p.screenshot({ path: `${out}/file-${w}x${h}.png` });
    await p.close();
  }
  await b.close();
})();
