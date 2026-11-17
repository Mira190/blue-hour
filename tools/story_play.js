// Plays a story's episode from the title to its last card, frame by frame, as a player who knows the way would:
// to each of the living, through what they say and ask, to where the world stops, to the afterimage, to the
// standpoint, the photograph, and on. It walks by being put there (the way between places is not what it checks),
// takes a still at each beat, prints the state at each, and exits 1 if the last card is not reached or the page throws.
//   python3 -m http.server 8800 --directory web &
//   node tools/story_play.js out_dir [WxH]          (GPU=metal on a Mac; under xvfb-run -a elsewhere)
// FROM=6: from the last frame only (FROM=5 UPTO=5: the fifth frame only). LIMIT=seconds: how long the whole play may take.
// SLIP=n: at frame n the first question that can be lost is answered wrongly until the one asked sees through the player; the
// card must come up, and the frame is taken up again and played rightly. SPEND=n: frame n is spent from the wrong place (the
// release twice); its print must be only tonight, and the story must go on without it. Every play sets two prints side by side.
// DRAW=n: one frame in n is drawn, and the others run the game without their draw calls (0, a GPU's default: every one).
// The game moves a twentieth of a second a frame at most, so on a software renderer, at a frame a second or less, the
// story's own clock ran twenty times slow, and the runner's 50 minutes ended in the first frame's first dialogue (#1).
// A frame without its draws takes a few tens of ms: the story keeps its time, and every still is of drawn frames.
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/story-play', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300), (e.stack || '').split('\n').slice(1, 3).join(' | ').slice(0, 300)); });
  p.on('response', r => { if (r.status() >= 400) console.log('http', r.status(), r.url()); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  const DRAW = +(process.env.DRAW || 0);
  if (DRAW > 1) await p.addInitScript(n => {
    const P = WebGL2RenderingContext.prototype, raf = window.requestAnimationFrame.bind(window), D = window.__draw = { all: false, on: true, frames: 0, drawn: 0 };
    window.requestAnimationFrame = fn => raf(t => { D.on = D.all || D.frames++ % n === 0; if (D.on) D.drawn++; fn(t); D.on = true; }); // (outside a frame, the loader's slices and the prints: as they are)
    for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'blitFramebuffer']) { const f = P[k]; P[k] = function (...a) { if (D.on) return f.apply(this, a); }; }
  }, DRAW);
  // FROM=n: as a case left at frame n (counted from 0) and opened again
  if (process.env.FROM) await p.addInitScript(n => { try { localStorage.setItem('oe-story-late', JSON.stringify({ fi: n, left: 7 - n, prints: Array.from({ length: n }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, +process.env.FROM);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${process.env.Q || ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(2000);
  // (a still is of frames drawn whole: every frame drawn from the one before it until it is taken)
  let whole = 0;
  const drawAll = on => { whole += on ? 1 : -1; return DRAW > 1 ? p.evaluate(on => new Promise(r => { window.__draw.all = on; if (!on) return r(); requestAnimationFrame(() => requestAnimationFrame(r)); }), whole > 0) : null; };
  const snap = async name => { await drawAll(true); try { await p.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }); } catch (e) { console.log(`(no still ${name})`); } await drawAll(false); };
  await snap('00-title');
  await p.evaluate(() => document.getElementById('gt-play').click());
  const state = () => p.evaluate(() => { const g = window.__game, s = g.story.state, d = document.getElementById('gd'); return { phase: s.phase, beat: s.beat, fi: s.fi, t: +s.t.toFixed(1), left: s.left, dlg: d && !d.hidden, choices: [...document.querySelectorAll('#gd-choices button')].map(x => x.textContent), goal: document.querySelector('#g-story-goal span').textContent, at: [+g.player.x.toFixed(1), +g.player.y.toFixed(1), +g.player.z.toFixed(1)] }; });
  // put the player a little short of a place, facing it
  const goTo = (at, d = 1.6) => p.evaluate(([at, d]) => { const g = window.__game, pl = g.player; let dx = pl.x - at[0], dy = pl.y - at[1], l = Math.hypot(dx, dy); if (l < 0.5 || l > 60) { dx = 1; dy = 0; l = 1; } pl.x = at[0] + dx / l * d; pl.y = at[1] + dy / l * d; if (at[2] != null) pl.z = at[2] + 0.2; pl.h = Math.atan2(-dx, -dy); if (g.cam) g.cam.yaw = pl.h; }, [at, d]);
  // (and looking up or down at it, where it has a height: the lens looks 0.3 - cam.pitch above the level)
  const face = at => p.evaluate(at => { const g = window.__game, pl = g.player, d = Math.hypot(at[0] - pl.x, at[1] - pl.y); pl.h = Math.atan2(at[0] - pl.x, at[1] - pl.y); if (g.cam) { g.cam.yaw = pl.h; g.cam.pitch = at[2] != null ? Math.max(-0.25, Math.min(1.35, 0.3 - Math.atan2(at[2] - (pl.z + 1.6), d))) : 0.25; } }, at);
  const seen = new Set();
  const mark = async (s, name) => { const k = `${s.fi}-${name}`; if (seen.has(k)) return; seen.add(k); console.log(k, JSON.stringify(s)); await p.waitForTimeout(1200); await snap(`${s.fi + 1}-${name}`); };
  let slipped = 0, spent = false;
  const t0 = Date.now(); let done = false, last = '', same = 0, beatT = 0, tWas = 0, still = 0;
  // the game's next frames run: what a frame sets (the mark, the goal) is read after it, however long a frame takes
  // every question with a right answer costs something to guess at (q.fail): one that does not can be answered by
  // trying each print in turn, and asks nothing of the player (Mr Tanaka's pitch, until it had one)
  { const E = ((JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'cities', 'shibuya', 'city.json'), 'utf8')).game || {}).story) || null;
    for (const ep of (E && E.episodes) || []) (ep.frames || []).forEach((f, i) => { for (const m of [f.meet, f.afterimage, f.task]) for (const q of (m && m.ask) || []) if ((q.frame || q.answer != null) && !q.fail) errors.push(`frame ${i + 1}: "${q.q}" has a right answer and nothing lost by guessing (fail)`); }); }
  const frames = n => p.evaluate(n => new Promise(r => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); }), n);
  while (Date.now() - t0 < (+process.env.LIMIT || 1500) * 1000) {
    const s = await state();
    if (s.phase === 'done') { done = true; break; }
    // (the opening shots, before the first card, are not stuck while their camera still moves: on a software renderer
    // they take many minutes of frames, and were counted as a dead end)
    const film = s.phase === 'dressed' ? await p.evaluate(() => { const c = window.__game.camera; return c ? `${Math.round(c.position.x * 4)},${Math.round(c.position.y * 4)},${Math.round(c.position.z * 4)}` : ''; }) : '';
    const key = `${s.phase}/${s.beat}/${s.fi}/${s.dlg}/${film}`; same = key === last ? same + 1 : 0; last = key;
    // (stuck by the story's own clock, which a slow machine runs slow: two minutes of it in one beat, or a clock that
    // has not moved at all; the last frame's meeting, 40 s of the story, was 240 looks long at a sixth of the pace)
    if (!same) { beatT = tWas = s.t; still = 0; } else { still = s.t === tWas ? still + 1 : 0; tWas = s.t; }
    if (same > 240 && (s.t - beatT > 120 || still > 240 || same > 2400)) { console.log('FAIL stuck', JSON.stringify(s)); break; }
    // seen through: the card is up; the frame is taken up again
    if (await p.evaluate(() => document.getElementById('g-story-fail').classList.contains('on'))) { slipped = 2; console.log(`frame ${s.fi + 1}: seen through`); await snap(`${s.fi + 1}-seen-through`); await p.evaluate(() => document.querySelector('#g-story-fail button').click()); await p.waitForTimeout(600); continue; }
    if (s.dlg) {
      await mark(s, `said-${s.phase}-${s.beat}`);
      if (s.choices.length) { if (!seen.has(`ask-${s.fi}-${s.phase}`) && await p.evaluate(() => !!document.querySelector('#gd-choices .pr'))) { seen.add(`ask-${s.fi}-${s.phase}`); await snap(`${s.fi + 1}-show-a-print`); } // (a question answered with a print: the roll laid out)
        const slip = +process.env.SLIP === s.fi + 1 && slipped < 2 && await p.evaluate(() => !!window.__game.story.state.canFail && window.__game.story.state.want >= 0);
        if (slip) slipped = 1;
        await p.evaluate(slip => { const st = window.__game.story.state, B = document.querySelectorAll('#gd-choices button'); (B[slip ? (st.want + 1) % B.length : st.want] || B[0]).click(); }, slip); } // (story.js says which answer is right: state.want)
      else await p.keyboard.press('KeyE');
      await p.waitForTimeout(350); continue;
    }
    if (s.phase === 'go' && s.beat === 'meet') {
      // while the dog leads, he alone shows the way: no light standing in the street, no gold line, and no mark while he is in the frame
      if (!seen.has(`led-${s.fi}`)) { await frames(4); const g = await p.evaluate(() => { const G = window.__game, st = G.story.state, d = st.dog; return d && d.ready ? { guided: !!st.guided, light: st.lightK || '', gold: G.guide().n, mark: document.getElementById('g-story-mark').classList.contains('on'), kind: document.getElementById('g-story-mark').dataset.kind } : null; });
        if (g) { seen.add(`led-${s.fi}`); console.log(`frame ${s.fi + 1} led:`, JSON.stringify(g)); if (!g.guided || g.light || g.gold || (g.mark && g.kind !== 'guide' && g.kind !== 'meet')) { errors.push(`frame ${s.fi + 1}: the dog leads, and the way is shown twice: ${JSON.stringify(g)}`); console.log(errors[errors.length - 1]); } await snap(`${s.fi + 1}-led`); } }
      const at = await p.evaluate(() => { const t = window.__game.story.state.target; return t ? [t[0], t[1], t[3]] : null; }); if (at) await goTo(at, 1.8);
    }
    else if (s.phase === 'go' && s.beat === 'approach') { const at = await p.evaluate(() => { const st = window.__game.story.state, fr = st.fr, a = fr.stop_at || (fr.afterimage && fr.afterimage.at); if (fr.find && !st.lit && st.target) window.__findMarked = st.fi + 1; return fr.lead_s != null && !st.late ? null : a; }); if (at) await goTo(at, 4); }
    else if (s.phase === 'stop' && s.beat === 'seek') { const at = await p.evaluate(() => { const g = window.__game.story.state.ghost; return g ? [g.x, g.y, g.z] : null; }); await mark(s, 'stop'); if (at) { await goTo(at, 6); await p.waitForTimeout(800); await snap(`${s.fi + 1}-afterimage`); await goTo(at, 2.2); } }
    else if (s.phase === 'stop' && s.beat === 'shoot') {
      const T = await p.evaluate(() => { const st = window.__game.story.state, T = st.fr.task; return { stand: T.stand || null, find: !!T.find, subject: T.relic ? [T.relic.at[0], T.relic.at[1], (T.relic.at[2] != null ? T.relic.at[2] : window.__game.player.z - 0.2) + (T.relic.eye != null ? T.relic.eye : 0.6)] : T.subject || null, both: !!T.both, a: st.ghost && [st.ghost.x, st.ghost.y], b: st.ghost2 && [st.ghost2.x, st.ghost2.y] }; });
      // a frame whose place the player finds has no light standing on it and no mark of where to stand, until they have looked a while
      if (T.find && T.stand && !seen.has(`find-${s.fi}`)) { seen.add(`find-${s.fi}`); await frames(3); const m = await p.evaluate(() => { const st = window.__game.story.state; return { target: st.target, lit: st.lit, on: document.getElementById('g-story-mark').classList.contains('on') }; }); if (!m.lit && (m.target || m.on)) { errors.push(`frame ${s.fi + 1}: its place is to be found, and a mark stands on it`); console.log(errors[errors.length - 1]); } await snap(`${s.fi + 1}-find`); }
      if (+process.env.SPEND === s.fi + 1 && !spent) { // from the wrong place, the release twice: the frame is spent, and the story goes on without it
        spent = true;
        await p.evaluate(() => { const g = window.__game; g.story.raise(true); g.player.h += Math.PI; if (g.cam) g.cam.yaw = g.player.h; });
        await frames(3); await p.evaluate(() => window.__game.story.shoot()); await frames(2); await snap(`${s.fi + 1}-spend-warned`);
        await drawAll(true); await p.evaluate(() => window.__game.story.shoot()); await drawAll(false);
        const pr = await p.evaluate(() => { const P = window.__game.story.state.prints, q = P[P.length - 1]; return { n: P.length, plain: !!(q && q.plain) }; });
        if (pr.n !== s.fi + 1 || !pr.plain) { errors.push(`frame ${s.fi + 1}: spent from the wrong place, and the roll has ${pr.n} prints, the last ${pr.plain ? 'only tonight' : 'not marked spent'}`); console.log(errors[errors.length - 1]); }
        else console.log(`frame ${s.fi + 1}: spent`);
        await p.waitForTimeout(1500); await snap(`${s.fi + 1}-spent`); continue;
      }
      if (T.stand) await goTo(T.stand, 0.6);
      if (T.both) { const m = [(T.a[0] + T.b[0]) / 2, (T.a[1] + T.b[1]) / 2], n = [-(T.b[1] - T.a[1]), T.b[0] - T.a[0]], l = Math.hypot(...n); await goTo([m[0] + n[0] / l * 30, m[1] + n[1] / l * 30], 0); await face(m); }
      else if (T.subject) await face(T.subject);
      // the mark the player follows points at what the frame is judged on (it once pointed 21 m off, up a wall)
      if (T.subject && !T.both) { await frames(3); await p.waitForTimeout(300); const t = await p.evaluate(() => window.__game.story.state.target); const off = t ? Math.hypot(t[0] - T.subject[0], t[1] - T.subject[1]) : Infinity; if (off > 1.5) { errors.push(`frame ${s.fi + 1}: the mark is ${off.toFixed(1)} m from the subject`); console.log(errors[errors.length - 1]); } }
      // and it is the mark of a thing to photograph, with no metres on it (on the roof it read "143 m": a place to walk to)
      if (T.subject && !T.both) { const m = await p.evaluate(() => { const e = document.getElementById('g-story-mark'); return { kind: e.dataset.kind, text: e.querySelector('b').textContent }; }); if (m.kind !== 'frame' || /\d/.test(m.text)) { errors.push(`frame ${s.fi + 1}: at the standpoint the mark is "${m.kind}", reading "${m.text}"`); console.log(errors[errors.length - 1]); } }
      await snap(`${s.fi + 1}-cam-down`); await p.evaluate(() => window.__game.story.raise(true)); // (the camera to the eye: R)
      await p.waitForTimeout(1500); await mark(s, 'aimed');
      await drawAll(true); await p.evaluate(() => window.__game.story.shoot()); await drawAll(false); // (the photograph is the game's own picture of its canvas, taken as the shutter goes: of a frame drawn whole)
      await p.waitForTimeout(1300); await snap(`${s.fi + 1}-print-developing`); await p.waitForTimeout(1900); await snap(`${s.fi + 1}-print`); // (it develops: tonight, then the other year through it; the print in the hand, its postmark struck)
      if (process.env.UPTO && s.fi + 1 >= +process.env.UPTO) { done = true; break; } // (UPTO=n: stop after frame n's print)
    } else if (s.phase === 'stop' && s.beat === 'meeting') await mark(s, 'meeting');
    else if (s.phase === 'dressed' && s.beat === 'preface') { // (the hour in words, on black, before the opening: a still of it typed half way and whole)
      const typed = await p.evaluate(() => document.querySelector('#g-story-pre .tx').textContent.length);
      if (typed > 60) await mark(s, 'preface'); if (typed > 250) await mark(s, 'preface-whole');
    }
    else if (s.phase === 'go' && s.beat === 'ride') { await mark(s, 'ride'); const to = await p.evaluate(() => window.__game.story.state.fr.ride.to); await goTo(to, 6); } // (a frame reached by car: this player walks; tools/story_ride.js takes the car)
    else if (s.phase === 'go' && s.beat === 'flight') await mark(s, 'flight'); // (a frame reached by air: its film plays itself out)
    else if (s.phase === 'after') await mark(s, 'after');
    await p.waitForTimeout(500);
  }
  // the roll as the case board: the first two prints set side by side must say something, and it must be on the file
  if (await p.evaluate(() => window.__game.story.state.prints.length >= 2 && !window.__game.story.state.prints.slice(0, 2).some(q => q.plain))) {
    await p.evaluate(() => { document.getElementById('g-story-frames').click(); for (const k of [0, 1]) document.querySelector(`#g-story-album button[data-c="${k}"]`).click(); });
    const r = await p.evaluate(() => { const st = window.__game.story.state; return { pairs: st.pairs.length, hit: !!document.querySelector('#g-story-album .versus.hit'), file: document.querySelectorAll('#g-story-album .file li').length, filed: st.file.length }; });
    if (!r.pairs || !r.hit || r.file !== r.filed || r.file < 1) { errors.push(`the roll: frames 1 and 2 side by side found ${r.pairs} pairs (shown: ${r.hit}), and the file shows ${r.file} of ${r.filed} lines`); console.log(errors[errors.length - 1]); }
    await p.evaluate(() => { const f = document.querySelector('#g-story-album .file'); if (f) f.scrollIntoView({ block: 'center' }); });
    await snap('roll-file'); await p.evaluate(() => document.querySelector('#g-story-album .table').scrollIntoView({ block: 'start' })); await snap('roll-versus');
    await p.evaluate(() => document.querySelector('#g-story-album button[data-do="close"]').click());
  }
  if (+process.env.SLIP && slipped !== 2) { errors.push(`frame ${process.env.SLIP}: answered wrongly, and nobody saw through it`); console.log(errors[errors.length - 1]); }
  if (+process.env.SPEND && !spent) { errors.push(`frame ${process.env.SPEND}: was to be spent, and was not`); console.log(errors[errors.length - 1]); }
  { const fm = await p.evaluate(() => window.__findMarked || 0); if (fm) { errors.push(`frame ${fm}: its place is to be found, and a ring stands on it`); console.log(errors[errors.length - 1]); } }
  if (done) { await p.waitForTimeout(3000); await snap('end'); console.log('end', JSON.stringify(await state())); }
  else console.log('FAIL the last card was not reached', JSON.stringify(await state()));
  console.log(`played in ${Math.round((Date.now() - t0) / 1000)} s; page errors: ${errors.length}${DRAW > 1 ? `; ${await p.evaluate(() => `${window.__draw.drawn} of ${window.__draw.frames} frames drawn`)}` : ''}`);
  // PRINTS=dir: the photographs taken, as files (the loading screen's frames are made from them)
  if (process.env.PRINTS) { fs.mkdirSync(process.env.PRINTS, { recursive: true }); const pr = await p.evaluate(() => window.__game.story.state.prints.map(q => q.src)); pr.forEach((src, i) => { if (src) fs.writeFileSync(`${process.env.PRINTS}/frame-${i + 1}.jpg`, Buffer.from(src.split(',')[1], 'base64')); }); }
  await b.close();
  process.exit(done && !errors.length ? 0 : 1);
})();
