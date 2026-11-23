// The opening's sound under a starved page (issue 166; docs/SOUND.md, "A phone's music"). The page as an iPhone (its user
// agent, touch, a phone's viewport, the loading screen touched once for sound) with the main thread's CPU throttled
// (THROTTLE, 6) from the title on, played from Play to the end of the opening's film: the story's, or with WALK=1 the
// walk's. It reads the page's own probe (audio.js) and, where the context runs, Chromium's count of its output's
// underruns (AudioContext.playbackStats), every quarter of a second, and fails when
//   - a context exists at any reading from the page's load to the film's end (a phone's opening has no Web Audio to break);
//   - the music is not playing on a media element through the film (the walk's: through its first twenty seconds, its score
//     being shorter than a film the throttle has stretched), or its clock stalls (400 ms and more behind the wall's);
//   - after the film and one touch the context is not made and running within ten seconds (the street's sound);
//   - a page error.
// MUSIC=web plays it the way it was (the music on the context, ?music=web) and fails on nothing: it prints the same
// readings, the context's breaks and underruns, to put beside the first.
// What this can show: that the page asks nothing of Web Audio in a phone's opening, and how the two ways behave when this
// machine's main thread is slowed. What it cannot: an iPhone. Chromium's audio is not WebKit's (no GPU-process ring, no
// 128-frame hardware cycle, no stale buffer on a late render), and its throttle slows the main thread, not the audio
// thread or the system. Playwright's WebKit is not installed on a session's machine, and its Linux build plays through
// GStreamer, not the Cocoa path the fault is in.
//   python3 -m http.server 8800 --directory web &
//   NODE_PATH=$(npm root -g) DRAW=60 xvfb-run -a node tools/opening_audio.js [WxH]
const { chromium } = require('playwright');
const [,, size = '390x844'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), WEB = process.env.MUSIC === 'web', WALK = !!process.env.WALK, RATE = +(process.env.THROTTLE || 6);
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: args.concat('--autoplay-policy=document-user-activation-required') });
  const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, userAgent: IOS_UA });
  const errors = [], fail = m => { errors.push(m); console.log('FAIL', m); };
  p.on('pageerror', e => fail(`pageerror: ${String(e).slice(0, 300)}`));
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'low');
  const DRAW = +(process.env.DRAW || 0);
  if (DRAW > 1) await p.addInitScript(n => { // (one frame in n drawn, as tools/phone_audio.js does: a software renderer's frame is a tenth of a second and more)
    const P = WebGL2RenderingContext.prototype, raf = window.requestAnimationFrame.bind(window), D = window.__draw = { frames: 0 };
    let on = true;
    window.requestAnimationFrame = fn => raf(t => { on = D.frames++ % n === 0; fn(t); on = true; });
    for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'blitFramebuffer']) { const f = P[k]; P[k] = function (...a) { if (on) return f.apply(this, a); }; }
  }, DRAW);
  // the readings, taken in the page so that a slow harness loses none
  await p.addInitScript(() => {
    const R = window.__snd = { rows: [], phase: 'load', steps: [], taps: [] };
    // (when the context is made, by what, and every touch: a context made while the street is to wait says which let it in)
    addEventListener('pointerup', () => R.taps.push([performance.now(), R.phase]), { capture: true });
    const AC0 = window.AudioContext;
    if (AC0) { window.AudioContext = window.webkitAudioContext = function (...a) { R.ctxAt = [performance.now(), R.phase, (new Error().stack || '').split('\n').slice(2, 6).map(l => l.trim().replace(/https?:\/\/[^/]+\//, '')).join(' < ')]; return new AC0(...a); }; window.AudioContext.prototype = AC0.prototype; }
    // (each step of the load as game.js marks it, and whether the opening's film was on at that moment: read in the mark
    // itself, not in an observer, whose entries come later, when the film may have begun after a step taken just before it)
    { const mark = performance.mark.bind(performance);
      performance.mark = function (name, o) { if (name === 'oe:step' && o && o.detail) { const g = window.__game, f = g && g.overture && g.overture(); R.steps.push({ step: o.detail.step, t: performance.now(), film: !!(f && f.active) }); } return mark(name, o); }; }
    setInterval(() => {
      const A = window.OEAudio; if (!A) return;
      const g = window.__game, o = g && g.overture && g.overture(), P = A.probe, c = A.ctx, ps = c && c.playbackStats;
      R.rows.push({ t: performance.now(), phase: R.phase, film: !!(o && o.active), ctx: c ? c.state : null, tot: P.tot.slice(), el: P.totEl, under: ps ? ps.underrunEvents : null, underMs: ps ? ps.underrunDuration * 1000 : null,
        main: P.main, held: !!A.holding, lateIn: !!R.lateIn, act: !!(navigator.userActivation && navigator.userActivation.isActive), log: c && !R.made ? (R.made = P.log.slice(-4).join(' | ')) : undefined });
    }, 250);
  });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?snd=1${WEB ? '&music=web' : ''}${process.env.Q ? '&' + process.env.Q : ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => document.querySelector('.roll-sound') && window.OEAudio, null, { timeout: 120000 });
  const mode = await p.evaluate(() => ({ tunes: window.OEAudio.tunes, touch: window.OEAudio.needsTouch }));
  console.log(`the music: ${mode.tunes ? 'media elements, no context until the opening is over' : 'on the context'}; the main thread's CPU throttled ${RATE} times from the title on; ${WALK ? "the walk's opening" : "the story's opening"}`);
  if (!WEB && !mode.tunes) fail('an iPhone\'s page does not play its music on media elements');
  const playingNow = () => p.evaluate(() => { const box = document.getElementById('snd-probe'); const m = box && /music: (\d+) playing/.exec(box.textContent); return m ? +m[1] : -1; });
  // the loading screen touched for sound, and again as a person does while it still asks for a touch (its sound mark,
  // game.js heard): read 800 ms after one touch, a touch that landed before the page took touches failed the check now
  // and then, the elements begun at the next (main's audio shard and a session's, 22 November)
  for (let k = 0; k < 2; k++) {
    await p.touchscreen.tap(w / 2, h / 2);
    for (let i = 0; i < 15 && (WEB || (await playingNow()) < 1); i++) await p.waitForTimeout(200);
    if (WEB || (await playingNow()) >= 1 || !(await p.evaluate(() => { const l = document.getElementById('g-loader'); return !!(l && !l.hidden && l.classList.contains('no-sound')); }))) break;
    console.log('the loading screen still asks for a touch after one: touched again');
  }
  if (!WEB) { const n = await playingNow(); if (n < 1) fail(`after the loading screen's touch ${n < 0 ? 'the elements still wait for one' : 'no music plays'}`); else console.log(`after the loading screen's touch: ${n} playing on an element, context ${await p.evaluate(() => (window.OEAudio.ctx ? window.OEAudio.ctx.state : 'not made'))}`); }
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1500);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await p.evaluate(() => { window.__snd.phase = 'title'; });
  if (WALK) { // (the title's second way in, then "set out", as tools/walk_play.js presses them)
    const press = async sel => { // (only what is on top where it would be touched)
      const r = await p.evaluate(q => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2, top = b.width > 0 && document.elementFromPoint(x, y); return top && (top === e || e.contains(top)) ? [x, y] : null; }, sel);
      if (!r) return false; await p.touchscreen.tap(r[0], r[1]); return true; };
    const filming = () => p.evaluate(() => { const o = window.__game.overture(); return !!(o && o.active); });
    for (let i = 0; i < 40 && !(await press('#gt-walk-go')); i++) { await press('#gt-press-go'); await p.waitForTimeout(1500); } // (the title's "press" first, then its list)
    await p.waitForTimeout(3000);
    for (let i = 0; i < 60 && !(await filming()); i++) { const a = await press('#gt-walk-set'); let c = false; if (!a) { const card = await p.evaluate(() => { const e = [...document.querySelectorAll('#g-title button')].find(q => !q.id && q.getBoundingClientRect().width > 0); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); if (card) { await p.touchscreen.tap(card[0], card[1]); await p.waitForTimeout(800); } c = await press('#gt-who-go'); } if (process.env.TRACE) console.log(`  step ${i}: screen ${await p.evaluate(() => window.__game.screen && window.__game.screen())}, set out ${a}, who ${c}, stage ${await p.evaluate(() => document.getElementById('game-stage').className)}`); await p.waitForTimeout(2500); } // (who walks, then the hour and the sky as offered, then "set out")
  } else await p.evaluate(() => document.getElementById('gt-play').click());
  await p.waitForFunction(() => { const o = window.__game.overture(); return o && o.active; }, null, { timeout: 240000, polling: 250 }).catch(() => fail('the opening does not start'));
  await p.evaluate(() => { window.__snd.phase = 'film'; });
  const t0 = Date.now(), music = [];
  for (;;) { // (the film's own length on the wall's clock, however slowly it is drawn)
    const on = await p.evaluate(() => { const o = window.__game.overture(); return !!(o && o.active); }).catch(() => false);
    if (!on || Date.now() - t0 > 1500000) break;
    if (!WEB) music.push(await playingNow());
    await p.waitForTimeout(1000);
  }
  console.log(`the film: ${((Date.now() - t0) / 1000).toFixed(0)} s on the wall's clock`);
  // after it the phone's late parts come in (game.js afterPlayable), and the street waits for them (audio.js hold, the
  // guard: docs/SOUND.md "The guard"): a touch meanwhile, as a player's first on the street, makes no context that runs
  const guard = !WEB && await p.evaluate(() => !!window.OEAudio.guard);
  if (guard) {
    await p.evaluate(() => { window.__snd.phase = 'late'; window.__snd.lateIn = false; window.__game.lateReady().then(() => { window.__snd.lateIn = true; }); });
    await p.waitForTimeout(1500);
    await p.touchscreen.tap(w / 2, h * 0.3);
    const tl = Date.now();
    await p.waitForFunction(() => window.__snd.lateIn, null, { timeout: 600000, polling: 500 }).catch(() => fail('the late parts are not in ten minutes after the film'));
    console.log(`the late parts: in ${((Date.now() - tl) / 1000).toFixed(0)} s after the film on the wall's clock`);
    // (the street let go three seconds after the page is still: then a touch makes the context)
    await p.waitForFunction(() => !window.OEAudio.holding, null, { timeout: 30000, polling: 250 }).catch(() => fail('the street is still held 30 s after the late parts are in'));
  }
  await p.evaluate(() => { window.__snd.phase = 'after'; });
  // then one touch, as a player's on the street, and the context is made
  await p.waitForTimeout(guard ? 500 : 2500);
  await p.touchscreen.tap(w / 2, h * 0.3);
  const made = await p.waitForFunction(() => window.OEAudio.ctx && window.OEAudio.ctx.state === 'running', null, { timeout: 10000, polling: 250 }).then(() => true, () => false);
  await p.waitForTimeout(3000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const R = await p.evaluate(() => window.__snd.rows);
  // (and none of the late parts fetched under the film: what came in beside the city seen whole from the air was the step
  // an iPhone's GPU died on, eight seconds into the walk's opening, its music breaking into a loud noise: issues 118 and
  // 166, game.js afterPlayable)
  { const S = await p.evaluate(() => window.__snd.steps || []), under = S.filter(s => s.film && /^late (people|cars|trees|pictures|in)$/.test(s.step));
    console.log(`the load's steps: ${S.map(s => `${s.step} at ${(s.t / 1000).toFixed(1)} s${s.film ? ' (in the film)' : ''}`).join(', ')}`);
    if (under.length) fail(`the late parts fetched under the opening's film: ${under.map(s => s.step).join(', ')}`); }
  const by = ph => R.filter(r => r.phase === ph), film = by('film'), before = R.filter(r => r.phase === 'load' || r.phase === 'title' || (r.phase === 'film' && r.film)), ended = R.filter(r => r.phase === 'film' && !r.film && r.ctx !== null), last = R[R.length - 1], f0 = film[0] || last, f1 = film[film.length - 1] || last;
  const withCtx = before.filter(r => r.ctx !== null).length;
  console.log(`readings: ${R.length} (load ${by('load').length}, title ${by('title').length}, film ${film.length}, after ${by('after').length})`);
  console.log(`before the film's end: a context at ${withCtx} of ${before.length} readings`);
  if (ended.length) console.log(`  (made ${ended.length} readings after the film ended and before this tool's touch: ${ended[0].ctx})`);
  for (const r of before.filter(q => q.ctx !== null).slice(0, 3)) console.log(`  a context (${r.ctx}) at ${(r.t / 1000).toFixed(1)} s, phase ${r.phase}, film ${r.film}; the film's last reading at ${(f1.t / 1000).toFixed(1)} s`);
  console.log(`in the film: the context's breaks ${f1.tot.map((v, i) => v - f0.tot[i]).join('/')} (first threshold, 25 ms, 100 ms)${f1.under !== null && f0.under !== null ? `, Chromium's underruns ${f1.under - f0.under} (${Math.round(f1.underMs - f0.underMs)} ms)` : ''}, the music's stalls ${f1.el - f0.el}, the main thread held ${Math.round(Math.max(...film.map(r => r.main), 0))} ms at most`);
  if (!WEB) {
    const silent = music.filter(n => n < 1).length;
    console.log(`in the film: music on an element at ${music.length - silent} of ${music.length} readings`);
    if (withCtx) fail(`a context exists at ${withCtx} of ${before.length} readings before the film's end: a phone's opening is to have none`);
    // (the walk's film has its score alone, which is as long as the film on a phone's clock and shorter than it here, where
    // the throttle stretches the film: it is held to its first twenty seconds; the story's has the loading cue under it throughout)
    const head = music.slice(0, 20), quietHead = head.filter(n => n < 1).length;
    if (WALK ? quietHead > 3 : music.length && silent > Math.max(2, music.length * 0.1)) fail(`no music plays at ${WALK ? `${quietHead} of the film's first ${head.length}` : `${silent} of ${music.length}`} readings in the film`);
    if (f1.el - f0.el > 0) fail(`the music's clock stalled ${f1.el - f0.el} times in the film`);
    const late = by('late').filter(r => !r.lateIn), lateRun = late.filter(r => r.ctx === 'running').length; // (until the late parts are in: the street is let go three seconds after, and may be made then)
    if (guard) { console.log(`while the late parts came in: ${late.length} readings, the context running at ${lateRun}, the street held at ${late.filter(r => r.held).length}`); for (const r of late.filter(q => q.ctx === 'running' || q.log)) console.log(`  at ${(r.t / 1000).toFixed(1)} s: context ${r.ctx}, held ${r.held}, activation ${r.act}${r.log ? `, made: ${r.log}` : ''}`); const mk = R.find(q => q.log); if (mk) console.log(`the context made at ${(mk.t / 1000).toFixed(1)} s (${mk.phase}): ${mk.log}`); const X = await p.evaluate(() => ({ at: window.__snd.ctxAt, taps: window.__snd.taps })); console.log(`  made by: ${JSON.stringify(X.at)}; touches: ${X.taps.map(t => `${(t[0] / 1000).toFixed(1)} s ${t[1]}`).join(', ')}`); if (lateRun) fail(`the context ran at ${lateRun} of ${late.length} readings while the phone's late parts came in: the street is to wait for a page with room for it`); }
    if (!made) fail('ten seconds after the film and a touch, the context is not made and running: the street has no sound');
    else console.log(`after the film and a touch: context ${last.ctx}`);
  }
  console.log(errors.length ? `FAIL the opening's sound (${errors.length})` : WEB ? 'DONE the opening as it was, for the comparison' : `PASS a phone's opening asks nothing of Web Audio: no context until the film is over, its music on an element without a stall under a main thread throttled ${RATE} times, ${guard ? 'no context running while the late parts came in, ' : ''}the context made at the first touch after it`);
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
