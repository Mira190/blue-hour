// The title's press and the move to the menu's mark (game.js titleMarks), filmed a frame at a time at 30 frames a second,
// as a person would see it on a real GPU: a software renderer draws a frame in seconds, so the page's clock is held and
// stepped a thirtieth of a second a frame (the game's frames, its crowd and its camera), its type's animations set to the
// same moment, and each frame taken as a still. The film opens on the press for half a second, then presses, and runs on
// until the menu's frame has settled. Writes out_dir/<screen>.mp4 (and its frames under out_dir/<screen>/).
//
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/title_film.js out_dir          (SCREENS=desk or touch; SECS=3.5, the film after the press)
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
const [,, out = '/tmp/title-film'] = process.argv;
const PORT = process.env.PORT || 8800, FPS = 30, HOLD = 0.5, SECS = +(process.env.SECS || 3.5);
const SCREENS = (process.env.SCREENS || 'desk,touch').split(',');

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  for (const screen of SCREENS) {
    const touch = screen === 'touch', size = touch ? { width: 390, height: 844 } : { width: 1280, height: 800 };
    const ctx = await b.newContext({ viewport: size, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log(`pageerror (${screen}): ${String(e).slice(0, 200)}`));
    // (the page's frames get the held clock once the film starts: every requestAnimationFrame is given __vt, not the time)
    await p.addInitScript(`try { localStorage.setItem('oe3d-quality', 'high'); localStorage.setItem('oe3d-player', 'M'); localStorage.removeItem('oe-story-late'); localStorage.removeItem('oe-story-late-closed'); } catch (e) {}
      (() => { const raf = window.requestAnimationFrame.bind(window); window.__vt = null; window.__ts = 0;
        window.requestAnimationFrame = cb => raf(ts => { window.__ts = ts; cb(window.__vt == null ? ts : window.__vt); }); })();`);
    await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && window.__game.flyover && t && !t.hidden && document.getElementById('gt-walk-go'); }, null, { timeout: 900000, polling: 500 });
    await p.waitForTimeout(4000);
    // the springs held where they are (the film sets the mark itself, along the same curve: game.js damp), the press's
    // type at rest, and the clock held
    const T = await p.evaluate(() => { const M = window.__game.flyover.marks.MARK, t = M.time; M.time = 1e9; window.__vt = window.__ts;
      document.getAnimations().forEach(a => { try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (e) { /* */ } }); return t; });
    const s = [0, 0, 0, 0], damp = (i, want, dt) => { const w = 2 / T, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x), ch = s[i] - want, tmp = (s[i + 1] + w * ch) * dt; s[i + 1] = (s[i + 1] - w * tmp) * e; s[i] = want + (ch + tmp) * e; return s[i]; };
    const dir = `${out}/${screen}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const n0 = Math.round(HOLD * FPS), n = n0 + Math.round(SECS * FPS);
    for (let i = 0; i < n; i++) {
      if (i === n0) { if (touch) await p.touchscreen.tap(size.width / 2, size.height / 2); else await p.keyboard.press('Space'); }
      const k = i < n0 ? 0 : damp(2, damp(0, 1, 1 / FPS), 1 / FPS), t = (i - n0) / FPS;
      await p.evaluate(([k, t, pressed]) => new Promise(r => {
        const m = window.__game.flyover.marks.mark; m.s[0] = m.s[2] = k; m.s[1] = m.s[3] = 0;
        if (pressed) document.getAnimations().forEach(a => { if (a.__born == null) a.__born = t; try { a.pause(); a.currentTime = Math.max(0, (t - a.__born) * 1000); } catch (e) { /* */ } });
        window.__vt += 1000 / 30; requestAnimationFrame(() => r());
      }), [k, t, i >= n0]);
      await p.screenshot({ path: `${dir}/f${String(i).padStart(4, '0')}.png` });
      if (i % 15 === 0) console.log(`${screen} frame ${i}/${n} mark ${k.toFixed(3)}`);
    }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}/f%04d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', `${out}/${screen}.mp4`]);
    console.log(`wrote ${out}/${screen}.mp4`);
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
