// A lost WebGL context at the story's beats and on the walk, on a desktop and on a phone (issue 118; web/glcare.js, the
// game's noteResume). The context is lost (WEBGL_lose_context) and given back as a driver's reset or a phone's GPU
// process would:
//   - a desktop (the high tier) restores in place: no script error, the next frame drawn, nothing reloaded, the story at
//     the same frame and beat and the player where they stood;
//   - a phone (the low tier, an iPhone's page, where the walls live on the GPU alone and a loss reloads the page a level
//     lighter) reloads and is taken up there: no script error from what the phone let go of, no title, the story at the
//     frame it was at, or the walk at its hour and sky, and the player where they stood. At the Stop, standing where the
//     world stopped, the Stop comes again by itself.
// The beats: the third frame's street (the case taken up there, as a player continuing would: FROM), its Stop with the
// afterimage sought (where #118's phone lost its context, in the first frame's), and the walk.
//   xvfb-run -a node tools/ctx_beats.js                 (the page served on PORT, 8800)
// TIERS=high or low: one of the two (default both, the desktop first). BEATS=street,stop,walk: some of them.
const { chromium } = require('playwright');
require('./browser_watch'); // (which functions the page ran, for tools/check_cache.py)
const PORT = process.env.PORT || 8800, BASE = `http://localhost:${PORT}/?overture=0`;
const TIERS = (process.env.TIERS || 'high,low').split(','), BEATS = (process.env.BEATS || 'street,stop,walk').split(',');
const FI = 2; // the third frame: no one to meet first, its afterimage in the street
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; };
(async () => {
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  for (const tier of TIERS) {
    const phone = tier === 'low', T = phone ? 'phone' : 'desktop';
    const ctx = await b.newContext(phone ? {
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
    } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(([t, fi]) => {
      try {
        localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', '1');
        // (the case at the third frame, once for the tab: a reload finds what the story itself kept)
        if (!sessionStorage.getItem('cb-once')) { sessionStorage.setItem('cb-once', '1'); localStorage.setItem('bh-story-late', JSON.stringify({ fi, left: 7 - fi, prints: Array.from({ length: fi }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); }
      } catch (e) { /* storage blocked */ }
      Error.stackTraceLimit = 40;
    }, [tier, FI]);
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 200), (e.stack || '').split('\n').slice(1).map(l => l.trim()).filter(l => !/three\.module/.test(l)).slice(0, 4).join(' | ').slice(0, 500)); });
    const until = (fn, arg, ms = 600000) => p.waitForFunction(fn, arg, { timeout: ms, polling: 500 });
    const loaded = async () => {
      await until(() => window.__game && window.__game.care, null, 900000);
      await until(() => { const l = document.getElementById('g-loader'); return !l || l.hidden || l.classList.contains('out'); }, null, 900000);
    };
    const state = () => p.evaluate(() => { const g = window.__game, s = g.story.state, st = document.getElementById('game-stage'); return { fi: s.fi, phase: s.phase, beat: s.beat, at: [g.player.x, g.player.y, g.player.z], title: !document.getElementById('g-title').hidden, walk: st.classList.contains('walk'), care: Object.assign({}, g.care.stats), lost: !!g.care.lost, note: (() => { const n = st.querySelector('.gl-note'); return n && !n.hidden ? n.textContent.slice(0, 60) : ''; })() }; });
    const lose = () => p.evaluate(() => { const gl = document.getElementById('game-gl').getContext('webgl2'); window.__lc = gl.getExtension('WEBGL_lose_context'); window.__lc.loseContext(); });
    const restore = () => p.evaluate(() => window.__lc.restoreContext());
    const far = (a, c) => Math.hypot(a[0] - c[0], a[1] - c[1]);
    // the context lost and given back where the player is now; then what the tier promises
    async function lossAt(name, after) {
      await p.waitForTimeout(2500);
      const s0 = await state(), e0 = errors.length;
      await p.evaluate(() => { try { sessionStorage.removeItem('bh-gl-reload'); } catch (e) { /* storage blocked */ } window.__same = true; }); // (a loss inside a minute of the last reload stays on the note: here each is a first)
      const nav = phone ? p.waitForNavigation({ timeout: 60000 }).then(() => true).catch(() => false) : null;
      await lose();
      await p.waitForTimeout(800);
      const held = await p.evaluate(() => !!window.__game.care.lost).catch(() => null);
      await restore();
      if (!phone) {
        await until(n => window.__game.care.stats.drawn > n, s0.care.drawn, 300000).catch(() => {});
        await p.waitForTimeout(3000);
        const s1 = await state(), errs = errors.slice(e0);
        check(held && !errs.length, `${T} ${name}: lost, the game held (${held}), and no script error after (${errs.length ? errs[0].slice(0, 120) : 'none'})`);
        check(s1.care.drawn > s0.care.drawn && s1.care.reloads === 0 && !s1.note, `${T} ${name}: restored in place, drawn again, the note gone, nothing reloaded (drawn ${s0.care.drawn} to ${s1.care.drawn}, reloads ${s1.care.reloads}${s1.note ? `, note "${s1.note}"` : ''})`);
        check(s1.fi === s0.fi && s1.phase === s0.phase && (s1.beat === s0.beat || s0.phase !== 'stop') && far(s1.at, s0.at) < 1.5, `${T} ${name}: the story where it was (frame ${s0.fi + 1} ${s0.phase} ${s0.beat}, then frame ${s1.fi + 1} ${s1.phase} ${s1.beat}) and the player too (${far(s1.at, s0.at).toFixed(2)} m)`);
        return s1;
      }
      const went = await nav;
      check(held !== false && went, `${T} ${name}: lost while seen, the frames held (${held}) and the page reloaded (${went})`);
      await loaded();
      await until(() => document.getElementById('g-title').hidden && window.__game.story && (window.__game.story.state.phase !== 'idle' && window.__game.story.state.phase !== 'dressed' || document.getElementById('game-stage').classList.contains('walk')), null, 300000).catch(() => {});
      await p.waitForTimeout(4000);
      const s1 = await state(), errs = errors.slice(e0), same = await p.evaluate(() => !!window.__same);
      check(!same && !errs.some(e => /byteLength|null is not an object|Cannot read properties of null/.test(e)), `${T} ${name}: no script error from what the phone let go of (${errs.length ? errs[0].slice(0, 120) : 'none'})`);
      check(!s1.title && (s0.walk ? s1.walk : s1.fi === s0.fi && s1.phase !== 'idle' && s1.phase !== 'dressed'), `${T} ${name}: taken up with no title (${s0.walk ? `the walk ${s1.walk}` : `frame ${s0.fi + 1} ${s0.phase} ${s0.beat}, then frame ${s1.fi + 1} ${s1.phase} ${s1.beat}`})`);
      check(far(s1.at, s0.at) < 3, `${T} ${name}: the player where they stood (${far(s1.at, s0.at).toFixed(1)} m off)`);
      if (after) await after(s0, s1);
      return s1;
    }
    await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await loaded();
    if (BEATS.includes('street') || BEATS.includes('stop')) {
      await until(() => { const t = document.getElementById('g-title'); return t && !t.hidden; });
      await p.evaluate(() => document.getElementById('gt-play').click());
      await until(fi => { const s = window.__game.story.state; return s.fi === fi && s.phase === 'go' && s.beat === 'approach'; }, FI);
      console.log(`${T}: frame ${FI + 1}, ${JSON.stringify(await state())}`);
      if (BEATS.includes('street')) await lossAt(`frame ${FI + 1} in the street`);
      if (BEATS.includes('stop')) {
        // to the afterimage's place: the world stops, and the afterimage is to be found
        const at = await p.evaluate(fi => { const f = window.__game.story.state.ep.frames[fi]; return f.stop_at || f.afterimage.at; }, FI);
        await p.evaluate(at => { const g = window.__game, pl = g.player; pl.x = at[0] + 4; pl.y = at[1] + 4; pl.h = Math.atan2(-4, -4); }, at);
        await until(() => { const s = window.__game.story.state; return s.phase === 'stop' && s.beat === 'seek'; });
        await lossAt(`frame ${FI + 1} at the Stop (${(await state()).beat})`, async () => {
          const stopped = await until(() => window.__game.story.state.phase === 'stop', null, 240000).then(() => true).catch(() => false);
          check(stopped, `${T} at the Stop: standing where it stopped, the world stops again by itself (${(await state()).phase} ${(await state()).beat})`);
        });
      }
    }
    if (BEATS.includes('walk')) {
      await p.evaluate(() => { try { sessionStorage.clear(); localStorage.removeItem('bh-story-late'); sessionStorage.setItem('cb-once', '1'); sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t: 'blue', w: 'clear' })); } catch (e) { /* storage blocked */ } });
      await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await loaded();
      await until(() => document.getElementById('game-stage').classList.contains('walk') && document.getElementById('g-title').hidden);
      await p.waitForTimeout(6000);
      await p.evaluate(() => { const pl = window.__game.player; pl.x += 6; }); // (off the start, so that "where they stood" is not the walk's own start)
      await lossAt('on the walk');
    }
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `FAIL: ${fails}` : 'PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
