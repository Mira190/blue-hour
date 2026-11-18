// Plays a story's episode from the title to its last card, frame by frame, as a player who knows the way would:
// to each of the living, through what they say and ask, to where the world stops, to the afterimage, to the
// standpoint, the photograph, and on. It walks by being put there (the way between places is not what it checks),
// takes a still at each beat, prints the state at each, and exits 1 if the last card is not reached or the page throws.
// Each print is saved as the roll keeps it, too (n-print-own.jpg): the double exposure itself.
//   python3 -m http.server 8800 --directory web &
//   node tools/story_play.js out_dir [WxH]          (GPU=metal on a Mac; under xvfb-run -a elsewhere)
// FROM=6: from the last frame only (FROM=5 UPTO=5: the fifth frame only). LIMIT=seconds: how long the whole play may take.
// SLIP=n: at frame n the first question that can be lost is answered wrongly until the one asked sees through the player; the
// card must come up, and the frame is taken up again and played rightly. SPEND=n: frame n is spent from the wrong place (the
// release twice); its print must be only tonight, and the story must go on without it. Every play sets two prints side by side.
// The log (log.js): every line the dialogue shows is written down here as it is shown, and after frame 3 the log is opened
// and must have the same lines in the same order; stills of it, and of the words at their largest with their backing.
// The summation (the last frame's questions with `proof`): each is answered with a name (one of the case's people) first, then
// a print or a pair; SLIP=7 answers it wrongly until she is not answered. Frame 5's liar is cross-examined: one of his
// statements, then the print that breaks it (SLIP=5). At the last card, how the case was worked must name a frame spent (SPEND=n).
// BACKTO=n: from the last card, frame n is gone back into, and played to its print.
// LOGRELOAD=1: then the page is opened again, the case continued, and the log must still have them.
// DRAW=n: one frame in n is drawn, and the others run the game without their draw calls (0, a GPU's default: every one).
// The game moves a twentieth of a second a frame at most, so on a software renderer, at a frame a second or less, the
// story's own clock ran twenty times slow, and the runner's 50 minutes ended in the first frame's first dialogue (#1).
// A frame without its draws takes a few tens of ms: the story keeps its time, and every still is of drawn frames.
const { chromium } = require('playwright');
const fs = require('fs');
const { audit: escalators } = require('./escalator_route');
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
    // (the lines given to the dialogue for the story's people, as they are given: every line of a talk is shown, one press at a time;
  // read from the call, not the screen, where a line passed between two looks was missed)
  const listen = () => p.evaluate(() => { const d = window.__game.dlg, show = d.show, H = window.__heard = window.__heard || { lines: [] };
    d.show = function (npc, lines, ...rest) { if (npc && npc.log) H.lines.push(...lines); return show.call(this, npc, lines, ...rest); }; });
  await listen();
  // (the job sheet in the hand, seen by the page itself the moment it comes up with its ink: it goes away on the wall clock,
  // 14 s after the ink, and a loop that first saw its beat late, or a still that took longer than that, found it already gone)
  await p.evaluate(() => { const e = document.getElementById('g-story-order'); if (!e) return; const o = new MutationObserver(() => { if (e.classList.contains('on') && e.querySelectorAll('i').length > 80) { window.__orderOk = true; o.disconnect(); } }); o.observe(e, { attributes: true, attributeFilter: ['class'], childList: true }); });
  await p.evaluate(() => document.getElementById('gt-play').click());
  const state = () => p.evaluate(() => { const g = window.__game, s = g.story.state, d = document.getElementById('gd'); return { phase: s.phase, beat: s.beat, fi: s.fi, t: +s.t.toFixed(1), left: s.left, dlg: d && !d.hidden, choices: [...document.querySelectorAll('#gd-choices button')].map(x => x.textContent), goal: document.querySelector('#g-story-goal span').textContent, at: [+g.player.x.toFixed(1), +g.player.y.toFixed(1), +g.player.z.toFixed(1)] }; });
  // put the player a little short of a place, facing it, on the side they come from, however far (a fixed east beyond 60 m
  // put them in the air outside SHIBUYA SKY's east glass: its 46F lift stands 61 m from Kanbara)
  const goTo = (at, d = 1.6) => p.evaluate(([at, d]) => { const g = window.__game, pl = g.player; let dx = pl.x - at[0], dy = pl.y - at[1], l = Math.hypot(dx, dy); if (l < 0.5) { dx = 1; dy = 0; l = 1; } pl.x = at[0] + dx / l * d; pl.y = at[1] + dy / l * d; if (at[2] != null) pl.z = at[2] + 0.2; pl.h = Math.atan2(-dx, -dy); if (g.cam) g.cam.yaw = pl.h; }, [at, d]);
  // (and looking up or down at it, where it has a height: the lens looks 0.3 - cam.pitch above the level)
  const face = at => p.evaluate(at => { const g = window.__game, pl = g.player, d = Math.hypot(at[0] - pl.x, at[1] - pl.y); pl.h = Math.atan2(at[0] - pl.x, at[1] - pl.y); if (g.cam) { g.cam.yaw = pl.h; g.cam.pitch = at[2] != null ? Math.max(-0.25, Math.min(1.35, 0.3 - Math.atan2(at[2] - (pl.z + 1.6), d))) : 0.25; } }, at);
  const seen = new Set();
  // (one light standing in the street at a time: at every beat's still, the story's own and no other; the free game's
  // objective column stood beside it over the Center Gai arch and SHIBUYA SKY's door)
  const mark = async (s, name) => { const k = `${s.fi}-${name}`; if (seen.has(k)) return; seen.add(k); console.log(k, JSON.stringify(s)); await p.waitForTimeout(1200); await snap(`${s.fi + 1}-${name}`);
    if (s.phase === 'stop' && !seen.has(`heads-${s.fi}`)) { seen.add(`heads-${s.fi}`); // (time held: no head turns by itself; a look laid over a look wound Aoi's head round by the Center Gai arch)
      const hs = await p.evaluate(() => new Promise(r => { const g = window.__game, T = window.THREE, rigs = (g.npcs || []).filter(n => n.rig && n.rig.head && n.rig.root.visible).map(n => [n.id, n.rig]).concat(g.player && g.player.rig && g.player.rig.head ? [['player', g.player.rig]] : []);
        const was = rigs.map(([, q]) => q.head.getWorldQuaternion(new T.Quaternion())), worst = rigs.map(() => 0); let n = 12;
        const f = () => { rigs.forEach(([, q], i) => { const now = q.head.getWorldQuaternion(new T.Quaternion()); worst[i] = Math.max(worst[i], was[i].angleTo(now)); was[i].copy(now); }); if (--n > 0) requestAnimationFrame(f); else r(rigs.map(([id], i) => [id, +worst[i].toFixed(3)])); };
        requestAnimationFrame(f); }));
      const spun = hs.filter(([, a]) => a > 0.05);
      if (spun.length) { errors.push(`frame ${s.fi + 1} ${name}: with time held, a head turns by itself: ${JSON.stringify(spun)}`); console.log(errors[errors.length - 1]); } }
    const L = await p.evaluate(() => (window.__game.lights ? window.__game.lights() : null)); if (L && L.objective) { errors.push(`frame ${s.fi + 1} ${name}: a second light stands in the street (the free game's objective)`); console.log(errors[errors.length - 1]); } };
  let slipped = 0, spent = false, logged = !!process.env.FROM, logWas = null, big = 0;
  const t0 = Date.now(); let done = false, last = '', same = 0, beatT = 0, tWas = 0, still = 0;
  // the game's next frames run: what a frame sets (the mark, the goal) is read after it, however long a frame takes
  // every question with a right answer costs something to guess at (q.fail): one that does not can be answered by
  // trying each print in turn, and asks nothing of the player (Mr Tanaka's pitch, until it had one)
  { const E = ((JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'cities', 'shibuya', 'city.json'), 'utf8')).game || {}).story) || null;
    for (const ep of (E && E.episodes) || []) (ep.frames || []).forEach((f, i) => { for (const m of [f.meet, f.afterimage, f.task]) for (const q of (m && m.ask) || []) if ((q.frame || q.answer != null) && !q.fail) errors.push(`frame ${i + 1}: "${q.q}" has a right answer and nothing lost by guessing (fail)`); }); }
  const frames = n => p.evaluate(n => new Promise(r => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); }), n);
  let upto = +process.env.UPTO || 0, proved = 0;
  const play = async () => {
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
    // after frame 3: the log has every line said so far, in order
    if (!logged && s.fi >= 3) {
      logged = true;
      const r = await p.evaluate(() => { const L = window.__game.story && document.getElementById('g-story-log'); window.__game.storyLog.show(true); const e = window.__game.storyLog.entries; return { on: !!L && L.classList.contains('on'), lines: e.filter(q => q.kind === 'line' || q.kind === 'q').map(q => q.text), answers: e.filter(q => q.kind === 'a').length, shown: document.querySelectorAll('#g-story-log li:not(.fr)').length, n: e.length, heard: window.__heard.lines.slice() }; });
      const miss = r.heard.findIndex((x, i) => r.lines[i] !== x);
      console.log(`log after frame 3: ${r.lines.length} lines, ${r.answers} answers; heard ${r.heard.length}`);
      if (!r.on || r.shown !== r.n || r.lines.length !== r.heard.length || miss >= 0) { errors.push(`the log after frame 3: ${r.on ? '' : 'not open; '}${r.shown} of ${r.n} shown; ${r.lines.length} lines for ${r.heard.length} heard${miss >= 0 ? `; line ${miss + 1} is "${(r.lines[miss] || '').slice(0, 60)}" for "${r.heard[miss].slice(0, 60)}"` : ''}`); console.log(errors[errors.length - 1]); }
      await snap('log'); await p.evaluate(() => { const o = document.querySelector('#g-story-log ol'); o.firstElementChild.scrollIntoView({ block: 'start' }); }); await snap('log-top');
      await p.evaluate(() => window.__game.storyLog.setWords({ size: 2, solid: true })); await snap('log-largest');
      await p.evaluate(() => window.__game.storyLog.show(false)); await p.waitForTimeout(600); await snap('goal-largest'); big = 1;
      logWas = r.lines;
      if (process.env.LOGRELOAD) { // the page opened again in the middle of the case: the log is as it was
        await p.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
        await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
        await p.waitForTimeout(1500); await listen(); await p.evaluate(() => document.getElementById('gt-play').click());
        await p.waitForFunction(() => !['idle', 'dressed'].includes(window.__game.story.state.phase), null, { timeout: 900000, polling: 500 });
        const back = await p.evaluate(() => window.__game.storyLog.entries.filter(q => q.kind === 'line' || q.kind === 'q').map(q => q.text));
        const f = await p.evaluate(() => window.__game.story.state.fi), want = logWas.length; // (frame 4 begun: what was said before it)
        console.log(`log after a reload at frame ${f + 1}: ${back.length} lines (were ${want})`);
        if (back.length < want - 0 || back.slice(0, want).some((x, i) => x !== logWas[i])) { errors.push(`the log after a reload: ${back.length} lines, were ${want}`); console.log(errors[errors.length - 1]); }
        await p.evaluate(n => { window.__heard.lines = window.__game.storyLog.entries.filter(q => q.kind === 'line' || q.kind === 'q').map(q => q.text).slice(0, n); }, want);
        await p.evaluate(() => window.__game.storyLog.setWords({ size: 2, solid: true }));
      }
      continue;
    }
    if (s.dlg) {
      { const who = await p.evaluate(() => ((document.getElementById('gd-name') || {}).textContent || '').replace(/[^A-Za-z]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 24)); await mark(s, `said-${s.phase}-${s.beat}${who ? `-${who}` : ''}`); }
      // (a still for each speaker in a beat, not only the first: frame 5 has the office's call on the roof, then the sister's message)
      if (big === 1) { big = 2; await snap(`${s.fi + 1}-words-largest`); await p.evaluate(() => window.__game.storyLog.setWords({ size: 0, solid: false })); } // (the words at their largest, on their backing; then as they were)
      if (s.choices.length) { if (!seen.has(`ask-${s.fi}-${s.phase}`) && await p.evaluate(() => !!document.querySelector('#gd-choices .pr'))) { seen.add(`ask-${s.fi}-${s.phase}`); await snap(`${s.fi + 1}-show-a-print`); } // (a question answered with a print: the roll laid out)
        for (const [cls, name] of [['said', 'press'], ['who', 'name']]) if (!seen.has(`${name}-${s.fi}`) && await p.evaluate(c => !!document.querySelector(`#gd-choices .${c}`), cls)) { seen.add(`${name}-${s.fi}`); await snap(`${s.fi + 1}-${name}`); } // (a statement to press, his own words; one of the case's people to name)
        const slip = +process.env.SLIP === s.fi + 1 && slipped < 2 && await p.evaluate(() => !!window.__game.story.state.canFail && window.__game.story.state.want >= 0);
        if (slip) slipped = 1;
        { const pv = await p.evaluate(() => !!window.__game.story.state.proving); if (pv) proved++; const k = `summation-${pv ? 'evidence' : 'words'}`; if (s.fi === 6 && !seen.has(k)) { seen.add(k); await snap(`7-${k}`); } } // (the summation: the roll laid out with its pairs, then the words)
        await p.evaluate(slip => { const st = window.__game.story.state, B = document.querySelectorAll('#gd-choices button'); (B[slip ? (st.want + 1) % B.length : st.want] || B[0]).click(); }, slip); } // (story.js says which answer is right: state.want)
      else await p.keyboard.press('KeyE');
      await p.waitForTimeout(350); continue;
    }
    // a frame whose way goes up from a lift's stop by an escalator (frame 4, SHIBUYA SKY's 46F): the way found from the
    // stop rides no escalator against its steps (tools/escalator_route.js), and a still from where the lift lets you out
    // shows the line going the way that does (it once led right, beside the escalator that runs down)
    if (s.phase === 'go' && !s.dlg && !seen.has(`lift-${s.fi}`)) {
      const st = await p.evaluate(() => {
        const g = window.__game, fr = g.story.state.fr || {}, nav = g.nav, MOV = nav.strips.filter(q => q.moving_ms);
        const t0 = g.story.state.target, t = t0 ? [t0[0], t0[1], t0[3] != null ? t0[3] : t0[2]] : fr.stop_at || (fr.afterimage && fr.afterimage.at); // (x, y, z)
        if (!t || !MOV.length || (t[2] != null && Math.abs(t[2] - g.player.z) < 12)) return null; // (up there already: frame 5's helicopter, on the roof)
        for (const l of g.G.lifts || []) for (const q of l.stops) {
          const [x, y, z] = q.at, tz = t[2] != null ? t[2] : 0;
          if (Math.hypot(t[0] - x, t[1] - y) < 120 && tz > z + 2 && MOV.some(m => Math.hypot(m.origin[0] - x, m.origin[1] - y) < 15 && Math.abs(m.zs[0] - z) < 12)) return { at: q.at, face: q.face || null, name: q.name };
        }
        return null;
      });
      if (st) { // (once the target is up there: the first goal of the frame is the lift at the street)
        seen.add(`lift-${s.fi}`);
        const r = await escalators(p);
        for (const l of r.lines) { console.log(`frame ${s.fi + 1}: ${l}`); if (l.startsWith('FAIL')) errors.push(`frame ${s.fi + 1}: ${l}`); }
        await p.evaluate(st => { const g = window.__game, pl = g.player; [pl.x, pl.y, pl.z] = st.at; pl.vz = 0; pl.ground = true; if (st.face) pl.h = Math.atan2(st.face[0], st.face[1]); if (g.cam) { g.cam.yaw = pl.h; g.cam.pitch = 0.4; g.cam.dist = 9; } }, st); // (from behind and above: the lobby's ceiling is high, the line and both escalators in view)
        // the way shown from the stop: the dog's while he leads (route.js's walk to the place, with no height, as companion.js
        // asks it: the top of what stands there), else the gold line (game.js's guide; __game.guide() hands back the guide).
        // It rides no escalator against its steps, and turns the way the one up stands: to the left of where the lift faces at
        // SHIBUYA SKY (the one to the right runs down)
        const guided = await p.evaluate(() => !!window.__game.story.guided);
        if (guided) await p.evaluate(st => { const g = window.__game, d = g.story.state.dog, t = g.story.state.target; if (d && t) { d.place(st.at[0] + (st.face ? st.face[1] : 0) * 0.8, st.at[1] - (st.face ? st.face[0] : 0) * 0.8, g.player.h); d.lead([t[0], t[1]], 3); } }, st);
        else for (let k = 0; k < 20 && !(await p.evaluate(() => (window.__game.guide().pts || []).length)); k++) { await frames(2); await p.waitForTimeout(300); }
        await frames(4); await p.waitForTimeout(1500);
        const way = await p.evaluate(([st, guided]) => {
          const g = window.__game, pl = g.player, t = g.story.state.target;
          let P = [];
          if (guided) { const r = t && g.ways.walk({ x: pl.x, y: pl.y, z: pl.z }, { x: t[0], y: t[1] }); P = r ? r.pts : []; } else P = g.guide().pts || [];
          let i0 = 0, bd = Infinity;
          P.forEach((q, i) => { const d = Math.hypot(q[0] - pl.x, q[1] - pl.y, q[2] - pl.z); if (d < bd) { bd = d; i0 = i; } });
          const ahead = P.slice(i0), fx = st.face ? st.face[0] : Math.sin(pl.h), fy = st.face ? st.face[1] : Math.cos(pl.h);
          const q = ahead.find(q => Math.hypot(q[0] - pl.x, q[1] - pl.y) > 6), side = q ? -(q[0] - pl.x) * fy + (q[1] - pl.y) * fx : 0;
          return { n: P.length, off: bd, against: g.ways.against(ahead), side, rides: g.nav.strips.filter(s => s.moving_ms && ahead.some(q => { const h = g.nav.stripHeight(s, q[0], q[1]); return h != null && Math.abs(h - q[2]) < 0.8; })).map(s => s.name) };
        }, [st, guided]);
        const what = guided ? "the dog's way" : 'the line';
        console.log(`frame ${s.fi + 1}: from ${st.name}, ${what} (${way.n} points, ${way.off.toFixed(1)} m from you) goes ${way.side > 0 ? 'left' : 'right'}, on ${way.rides.join(', ') || 'no escalator'}${way.against > 0.25 ? `, ${way.against.toFixed(1)} m against an escalator's steps` : ''}`);
        if (!way.n || way.off > 3) errors.push(`frame ${s.fi + 1}: from ${st.name} ${what} does not start where you stand (${way.n} points, ${way.off.toFixed(1)} m off)`);
        if (way.against > 0.25) errors.push(`frame ${s.fi + 1}: from ${st.name} ${what} rides an escalator ${way.against.toFixed(1)} m against its steps`);
        // (the camera eases after the player: from the street it comes up 217 m, so it is set again and given time to settle; the
        // stills a second apart, the dog setting off the way he leads)
        for (let k = 0; k < 3; k++) { await p.evaluate(() => { const g = window.__game; g.cam.yaw = g.player.h - (innerWidth > innerHeight ? 0.6 : 0); g.cam.pitch = 0.25; g.cam.dist = 7; }); await frames(4); await p.waitForTimeout(800); await snap(`${s.fi + 1}-lift-way${k ? `-${k}` : ''}`); }
        continue;
      }
    }
    if (s.phase === 'go' && s.beat === 'meet') {
      // while the dog leads, he alone shows the way: no light standing in the street, no gold line, and no mark while he is in the frame
      if (!seen.has(`led-${s.fi}`)) { await frames(4); const g = await p.evaluate(() => { const G = window.__game, st = G.story.state, d = st.dog; return d && d.ready ? { guided: !!st.guided, light: st.lightK || '', gold: G.guide().n, mark: document.getElementById('g-story-mark').classList.contains('on'), kind: document.getElementById('g-story-mark').dataset.kind } : null; });
        if (g) { seen.add(`led-${s.fi}`); console.log(`frame ${s.fi + 1} led:`, JSON.stringify(g)); if (!g.guided || g.light || g.gold || (g.mark && g.kind !== 'guide' && g.kind !== 'meet')) { errors.push(`frame ${s.fi + 1}: the dog leads, and the way is shown twice: ${JSON.stringify(g)}`); console.log(errors[errors.length - 1]); } await snap(`${s.fi + 1}-led`); } }
      const at = await p.evaluate(() => { const t = window.__game.story.state.target; return t ? [t[0], t[1], t[3]] : null; }); if (at) await goTo(at, 1.8);
    }
    else if (s.phase === 'go' && s.beat === 'approach') { const at = await p.evaluate(() => { const st = window.__game.story.state, fr = st.fr, a = fr.stop_at || (fr.afterimage && fr.afterimage.at); if (fr.find && !st.lit && st.target) window.__findMarked = st.fi + 1; return fr.lead_s != null && !st.late ? null : a; }); if (at) await goTo(at, 4); }
    // the guide's film, the first time the world stops (story.js meetGuide): a still as he is first seen and as he sits by
    // you; it plays itself out, and must end with him at your side (tools/guide_meet.js checks his way through the crowd)
    else if (s.phase === 'stop' && s.beat === 'guide') {
      const F = await p.evaluate(() => { const g = window.__game, F = g.story.state.mov; return F ? { t: F.t, sat: !!F.sat, film: !!g.story.film } : null; });
      if (F && F.t > 0.4 && F.film) await mark(s, 'guide-film');
      if (F && F.sat) await mark(s, 'guide-sits');
    }
    else if (s.phase === 'stop' && s.beat === 'seek') {
      if (!seen.has(`guide-${s.fi}`) && s.fi === 0) { seen.add(`guide-${s.fi}`); const d = await p.evaluate(() => { const g = window.__game, d = g.story.state.dog; return d ? Math.hypot(d.x - g.player.x, d.y - g.player.y) : -1; }); console.log(`the guide met: ${d.toFixed(1)} m from you`); if (d < 0 || d > 6) { errors.push(`the guide's film ended with him ${d.toFixed(1)} m from you`); console.log(errors[errors.length - 1]); } } const at = await p.evaluate(() => { const g = window.__game.story.state.ghost; return g ? [g.x, g.y, g.z] : null; }); await mark(s, 'stop'); if (at) { await goTo(at, 6); await p.waitForTimeout(800); await snap(`${s.fi + 1}-afterimage`); await goTo(at, 2.2); } }
    else if (s.phase === 'stop' && s.beat === 'shoot') {
      const T = await p.evaluate(() => { const st = window.__game.story.state, T = st.fr.task; return { stand: T.stand || null, find: !!T.find, hintAt: T.hint_at || null, subject: T.relic ? [T.relic.at[0], T.relic.at[1], (T.relic.at[2] != null ? T.relic.at[2] : window.__game.player.z - 0.2) + (T.relic.eye != null ? T.relic.eye : 0.6)] : T.subject || null, both: !!T.both, meet: !!T.meet, a: st.ghost && [st.ghost.x, st.ghost.y], b: st.ghost2 && [st.ghost2.x, st.ghost2.y] }; });
      // a frame whose place the player finds has no light standing on it and no mark of where to stand, until they have looked a while
      if (T.find && T.stand && !seen.has(`find-${s.fi}`)) { seen.add(`find-${s.fi}`); await frames(3); const m = await p.evaluate(() => { const st = window.__game.story.state; return { target: st.target, lit: st.lit, on: document.getElementById('g-story-mark').classList.contains('on') }; }); if (!m.lit && (m.target || m.on)) { errors.push(`frame ${s.fi + 1}: its place is to be found, and a mark stands on it`); console.log(errors[errors.length - 1]); } await snap(`${s.fi + 1}-find`);
        // and its hints, asked for (story.js hint, H): a word, the dog to the place and sitting there, the light on it
        if (process.env.HINTS !== '0') {
          await p.keyboard.press('KeyH'); await frames(3);
          const h1 = await p.evaluate(() => ({ n: window.__game.story.state.hint, goal: document.querySelector('#g-story-goal span').textContent }));
          await p.keyboard.press('KeyH'); await frames(3); await p.waitForTimeout(2500);
          const h2 = await p.evaluate(stand => { const st = window.__game.story.state, d = st.dog; return { n: st.hint, dog: !!d, to: d && d.to ? Math.hypot(d.to[0] - stand[0], d.to[1] - stand[1]) : -1, state: d ? d.state : '', lit: st.lit }; }, T.stand);
          await snap(`${s.fi + 1}-hint-dog`);
          await p.keyboard.press('KeyH'); await frames(4);
          const h3 = await p.evaluate(() => { const st = window.__game.story.state, L = window.__game.lights(); return { n: st.hint, lit: st.lit, kind: st.kind, target: !!st.target, light: L.story, objective: L.objective }; });
          console.log(`frame ${s.fi + 1} hints:`, JSON.stringify({ h1, h2, h3 }));
          if (h1.n !== 1 || h2.n !== 2 || !h2.dog || h2.to < 0 || h2.to > 1.5 || h2.lit || h3.n !== 3 || !h3.lit || !h3.light || h3.objective) { errors.push(`frame ${s.fi + 1}: its hints did not give a word, the dog at the place and the light in turn: ${JSON.stringify({ h1, h2, h3 })}`); console.log(errors[errors.length - 1]); }
        } }
      // a picture found without a standpoint (task.hint_at: both kerbs in one frame): its hints lead to a place that does it
      if (T.hintAt && process.env.HINTS !== '0' && !seen.has(`hintat-${s.fi}`)) {
        seen.add(`hintat-${s.fi}`);
        for (let k = 0; k < 2; k++) { await p.keyboard.press('KeyH'); await frames(3); }
        await p.waitForTimeout(2500);
        const h2 = await p.evaluate(at => { const st = window.__game.story.state, d = st.dog; return { n: st.hint, to: d && d.to ? Math.hypot(d.to[0] - at[0], d.to[1] - at[1]) : -1 }; }, T.hintAt);
        await p.keyboard.press('KeyH'); await frames(4);
        const h3 = await p.evaluate(() => { const st = window.__game.story.state, L = window.__game.lights(); return { n: st.hint, light: L.story, objective: L.objective, kind: st.kind }; });
        console.log(`frame ${s.fi + 1} hints:`, JSON.stringify({ h2, h3 })); await snap(`${s.fi + 1}-hint-light`);
        if (h2.n !== 2 || h2.to < 0 || h2.to > 1.5 || h3.n !== 3 || !h3.light || h3.objective) { errors.push(`frame ${s.fi + 1}: its hints did not lead to a place that sees both: ${JSON.stringify({ h2, h3 })}`); console.log(errors[errors.length - 1]); }
        // and the place they lead to does it: from there, the camera raised towards the middle of the two, both are in the frame
        await goTo(T.hintAt, 0); const mid = [(T.a[0] + T.b[0]) / 2, (T.a[1] + T.b[1]) / 2]; await face(mid);
        await p.evaluate(() => window.__game.story.raise(true)); await frames(6); await p.waitForTimeout(1200);
        const ok = await p.evaluate(() => { const st = window.__game.story.state; return !!(st.ready || st.meet || st.meetHold > 0); }); await snap(`${s.fi + 1}-hint-place`); // (a frame taken as they meet is ready only once they have met: framed, they set off)
        console.log(`frame ${s.fi + 1}: from the place the hints lead to, both in the frame: ${ok}`);
        if (!ok) { errors.push(`frame ${s.fi + 1}: from the place its hints lead to, both are not in the frame`); console.log(errors[errors.length - 1]); }
        await p.evaluate(() => window.__game.story.raise(false)); await frames(2);
      }
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
      // the camera taught (task.teach, the first frame; story.js teach): raised off the light, nothing of the other year forms
      // in the lines, the year over them says so, and the card still has the light to stand in (the raise ticked); in the
      // light, the ground there is lit and the card ticks it; raised there, the thing forms. For a day the board stood in
      // the finder from anywhere while the goal said to step into the light, and the light meant nothing
      if (T.stand && T.subject && !seen.has(`teach-${s.fi}`) && await p.evaluate(() => !!window.__game.story.state.teach)) {
        seen.add(`teach-${s.fi}`);
        const card = () => p.evaluate(() => { const g = window.__game, st = g.story.state, e = document.getElementById('g-story-teach'), L = [...e.querySelectorAll('li')]; return { on: e.classList.contains('on'), now: L.findIndex(l => l.classList.contains('now')), done: L.map(l => (l.classList.contains('done') ? 1 : 0)).join(''), formed: st.relic ? +st.relic.k.toFixed(2) : -1, off: 'off' in document.getElementById('g-story-finder').dataset, here: g.lights().here, ready: !!st.ready }; });
        const side = await p.evaluate(([st, sub]) => { const g = window.__game, pl = g.player, dx = sub[0] - st[0], dy = sub[1] - st[1], l = Math.hypot(dx, dy) || 1, r = (g.story.state.fr.task.within_m || 4) * 2 + 1; pl.x = st[0] + dy / l * r; pl.y = st[1] - dx / l * r; return r; }, [T.stand, T.subject]);
        await face(T.subject); await p.evaluate(() => window.__game.story.raise(true)); await frames(24); await p.waitForTimeout(1200);
        const off = await card(); await snap(`${s.fi + 1}-teach-off-the-light`);
        console.log(`frame ${s.fi + 1} taught, raised ${side} m off the light:`, JSON.stringify(off));
        if (!off.on || off.now !== 0 || off.done !== '0100' || off.formed !== 0 || !off.off || off.here || off.ready) { errors.push(`frame ${s.fi + 1}: raised off the light, ${JSON.stringify(off)} (the card on its first step with the raise ticked, nothing of 1964 formed, the year saying not from here, no light underfoot)`); console.log(errors[errors.length - 1]); }
        await p.evaluate(() => window.__game.story.raise(false)); await frames(4);
        await goTo(T.stand, 0.6); await face(T.subject); await frames(6); await p.waitForTimeout(600);
        const inL = await card(); await snap(`${s.fi + 1}-teach-in-the-light`);
        console.log(`frame ${s.fi + 1} taught, in the light:`, JSON.stringify(inL));
        if (inL.now !== 1 || inL.done !== '1000' || !inL.here) { errors.push(`frame ${s.fi + 1}: in the light, ${JSON.stringify(inL)} (the light ticked, the raise to do, the ground lit)`); console.log(errors[errors.length - 1]); }
        await p.evaluate(() => window.__game.story.raise(true)); await frames(24); await p.waitForTimeout(1500);
        const up = await card(); await snap(`${s.fi + 1}-teach-raised-in-the-light`);
        console.log(`frame ${s.fi + 1} taught, raised in the light:`, JSON.stringify(up));
        if (up.formed < 1 || up.off || !up.ready || up.done !== '1110' || up.now !== 3) { errors.push(`frame ${s.fi + 1}: raised in the light, ${JSON.stringify(up)} (the thing formed in the lines, ready, the card at its last step)`); console.log(errors[errors.length - 1]); }
        await p.evaluate(() => window.__game.story.raise(false)); await frames(4);
      }
      if (T.stand) await goTo(T.stand, 0.6);
      // the camera raised as a player raises it, from wherever the view behind them looks (here 63 degrees off the thing
      // and pitched well down): it comes up onto the thing within half a second, and then holds still with no hand on it.
      // It once came up wherever that view had been pitched (on a wall's upper floors), and drifted on by itself
      if (T.subject && !T.both && !seen.has(`raise-${s.fi}`)) {
        seen.add(`raise-${s.fi}`);
        await p.evaluate(at => { const g = window.__game, pl = g.player, b = Math.atan2(at[0] - pl.x, at[1] - pl.y) + 1.1; pl.h = b; g.cam.yaw = b; g.cam.pitch = 0.9; }, T.subject);
        await frames(4);
        await p.evaluate(() => window.__game.story.raise(true));
        const R = await p.evaluate(at => new Promise(r => { const g = window.__game, c = g.camera, V = window.THREE.Vector3, out = [], t0 = performance.now();
          const f = () => { const d = c.getWorldDirection(new V()), q = new V(at[0], at[2], -at[1]).project(c); out.push({ t: performance.now() - t0, d: [d.x, d.y, d.z], q: [q.x, q.y, q.z] }); if (performance.now() - t0 < 2500 || out.length < 45) requestAnimationFrame(f); else r(out); };
          requestAnimationFrame(f); }), T.subject);
        const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI;
        // (counted in frames, not the wall's time: the game moves 0.05 s a frame at most, so on a software renderer the raise's
        // half a second is many seconds of the wall's; after 20 frames, a second of the game's own time, it is up)
        const settle = R.slice(20), first = settle[0], last = settle[settle.length - 1];
        let jit = 0; for (let i = 1; i < settle.length; i++) jit = Math.max(jit, ang(settle[i].d, settle[i - 1].d));
        const drift = ang(first.d, last.d), q = last.q, inFrame = q[2] < 1 && Math.abs(q[0]) < 0.7 && Math.abs(q[1]) < 0.7;
        await snap(`${s.fi + 1}-raised`);
        console.log(`frame ${s.fi + 1} raised from 63 degrees off: the thing at ${q[0].toFixed(2)}, ${q[1].toFixed(2)} in the picture, the lens drifting ${drift.toFixed(2)} degrees and turning ${jit.toFixed(2)} at most a frame with no hand on it (${settle.length} frames)`);
        if (!inFrame) { errors.push(`frame ${s.fi + 1}: raised from 63 degrees off, the camera does not come up on the thing (at ${q[0].toFixed(2)}, ${q[1].toFixed(2)})`); console.log(errors[errors.length - 1]); }
        if (drift > 0.3 || jit > 0.15) { errors.push(`frame ${s.fi + 1}: the raised camera moves by itself (${drift.toFixed(2)} degrees, ${jit.toFixed(2)} a frame)`); console.log(errors[errors.length - 1]); }
        await p.evaluate(() => window.__game.story.raise(false)); await frames(6);
      }
      if (T.both) { const m = [(T.a[0] + T.b[0]) / 2, (T.a[1] + T.b[1]) / 2], n = [-(T.b[1] - T.a[1]), T.b[0] - T.a[0]], l = Math.hypot(...n); await goTo(T.hintAt || [m[0] + n[0] / l * 30, m[1] + n[1] / l * 30], 0); await face(m); } // (from the corner its hints lead to: 30 m off the middle, a kiosk filled half the last print)
      else if (T.subject) await face(T.subject);
      // the mark the player follows points at what the frame is judged on (it once pointed 21 m off, up a wall)
      if (T.subject && !T.both) { await frames(3); await p.waitForTimeout(300); const t = await p.evaluate(() => window.__game.story.state.target); const off = t ? Math.hypot(t[0] - T.subject[0], t[1] - T.subject[1]) : Infinity; if (off > 1.5) { errors.push(`frame ${s.fi + 1}: the mark is ${off.toFixed(1)} m from the subject`); console.log(errors[errors.length - 1]); } }
      // and it is the mark of a thing to photograph, with no metres on it (on the roof it read "143 m": a place to walk to)
      if (T.subject && !T.both) { const m = await p.evaluate(() => { const e = document.getElementById('g-story-mark'); return { kind: e.dataset.kind, text: e.querySelector('b').textContent }; }); if (m.kind !== 'frame' || /\d/.test(m.text)) { errors.push(`frame ${s.fi + 1}: at the standpoint the mark is "${m.kind}", reading "${m.text}"`); console.log(errors[errors.length - 1]); } }
      await snap(`${s.fi + 1}-cam-down`); await p.evaluate(() => window.__game.story.raise(true)); // (the camera to the eye: R)
      await p.waitForTimeout(1500); await mark(s, 'aimed');
      // from the first frame's photograph to the last card, the camera of 1964 is round Kagami's neck (game.js, people.js camera1964)
      if (!(await p.evaluate(() => !!(window.__game && window.__game.player.rig.oldCam)))) { errors.push(`frame ${s.fi + 1}: the camera of 1964 is not round Kagami's neck`); console.log(errors[errors.length - 1]); }
      // the last frame is taken as they meet (task.meet, #35): framed, both step off their kerbs as every light turns to walk;
      // the release while they walk takes nothing; five stills while they come, the world held; and once they have met they
      // stand a step apart near the middle of the print, both in sight, and nobody of the held crowd stands within 8 m in
      // front of the lens
      if (T.meet) {
        const fail = m => { errors.push(`frame ${s.fi + 1}: ${m}`); console.log(errors[errors.length - 1]); };
        await p.waitForFunction(() => !!window.__game.story.state.meet, null, { timeout: 300000, polling: 250 }).catch(() => {});
        const m0 = await p.evaluate(() => { const st = window.__game.story.state, j = window.__game.junctions.J.find(q => q.scramble && Math.hypot(q.x - window.__game.player.x, q.y - window.__game.player.y) < 80); return { meet: st.meet || '', n: st.prints.length, walk: !!(j && j.walkNow), t: st.t }; });
        console.log(`frame ${s.fi + 1}: framed, and they ${m0.meet === 'walk' ? 'walk' : `do not walk (${m0.meet})`}; every light to walk: ${m0.walk}`);
        if (m0.meet !== 'walk') fail('both in the frame, and they do not step off their kerbs');
        if (!m0.walk) fail('they walk, and the lights at the crossing are not to walk');
        await p.evaluate(() => window.__game.story.shoot()); await frames(3);
        const early = await p.evaluate(() => ({ n: window.__game.story.state.prints.length, goal: document.querySelector('#g-story-goal span').textContent }));
        console.log(`frame ${s.fi + 1}: the release while they walk: ${early.n === m0.n ? 'nothing taken' : 'a picture taken'}, "${early.goal}"`);
        if (early.n !== m0.n) fail('the release while they walk took the picture');
        for (let i = 1; i <= 5; i++) { // (a still every two seconds of the story's clock while they walk: anything that moves is looked at for more than one)
          const t1 = (await p.evaluate(() => window.__game.story.state.t)) + 2;
          await p.waitForFunction(t => { const st = window.__game.story.state; return st.t >= t || st.meet !== 'walk'; }, t1, { timeout: 300000, polling: 200 }).catch(() => {});
          await snap(`${s.fi + 1}-walk-${i}`);
        }
        await p.waitForFunction(() => window.__game.story.state.meet === 'met', null, { timeout: 600000, polling: 250 }).catch(() => {});
        await frames(6); await p.waitForTimeout(1200);
        const q = await p.evaluate(() => {
          const g = window.__game, st = g.story.state, T = window.THREE, c = g.camera;
          c.updateMatrixWorld(); const fw = c.getWorldDirection(new T.Vector3());
          const W = (x, y, z) => new T.Vector3(x, z, -y), ndc = v => { const f = v.clone().sub(c.position).dot(fw) > 0, p = v.clone().project(c); return { x: p.x, y: p.y, f }; };
          const w = innerWidth, h = innerHeight, sw = Math.min(w, h * 1.5), xr = sw / w, yr = sw / 1.5 / h; // (the print: the middle of the frame, three by two)
          const two = [st.ghost, st.ghost2].map(f => ({ at: ndc(W(f.x, f.y, f.z + 0.9)) }));
          const apart = Math.hypot(st.ghost.x - st.ghost2.x, st.ghost.y - st.ghost2.y), lens = Math.hypot(c.position.x - (st.ghost.x + st.ghost2.x) / 2, -c.position.z - (st.ghost.y + st.ghost2.y) / 2);
          const near = []; const P = g.crowd && g.crowd.P;
          if (P) for (let i = 0, m = Math.min(g.crowd.active, P.length); i < m; i++) { const r = P[i]; if (r.line < 0 && !r.pz) continue; const x = r.rx ?? r.x, y = r.ry ?? r.y, z = r.rz ?? r.z ?? 0, d = Math.hypot(x - c.position.x, y + c.position.z); if (d > 8) continue; const a = ndc(W(x, y, z + 1)); if (a.f && Math.abs(a.x) < xr && Math.abs(a.y) < yr) near.push(+d.toFixed(1)); }
          const dg = st.dog && st.dog.ready ? ndc(W(st.dog.x, st.dog.y, st.dog.z + 0.5)) : null, dog = dg ? { at: [+st.dog.x.toFixed(1), +st.dog.y.toFixed(1)], state: st.dog.state, inPrint: dg.f && Math.abs(dg.x) < xr && Math.abs(dg.y) < yr } : null;
          return { me: [+g.player.x.toFixed(1), +g.player.y.toFixed(1)], dog, meet: st.meet, two: two.map(o => [+o.at.x.toFixed(2), +o.at.y.toFixed(2), o.at.f]), xr: +xr.toFixed(2), yr: +yr.toFixed(2), apart: +apart.toFixed(2), lens: +lens.toFixed(1), fov: +c.fov.toFixed(1), near, ready: !!st.ready, goal: document.querySelector('#g-story-goal span').textContent };
        });
        console.log(`frame ${s.fi + 1} met:`, JSON.stringify(q));
        if (q.meet !== 'met') fail(`they never met (${q.meet})`);
        else {
          if (q.apart > 1.3) fail(`met, and ${q.apart} m apart`);
          if (q.two.some(([x, y, f]) => !f || Math.abs(x) > q.xr * 0.45 || Math.abs(y) > q.yr * 0.75)) fail(`met, and not near the middle of the print: ${JSON.stringify(q.two)}`);
          if (q.near.length) fail(`met, and the held crowd stands ${q.near.join(', ')} m in front of the lens`);
          if (q.dog && q.dog.inPrint) fail(`met, and the dog is in the print (${JSON.stringify(q.dog)})`);
          if (!q.ready) fail(`met and framed, and the shutter is not ready ("${q.goal}")`);
        }
        await snap(`${s.fi + 1}-met`);
      }
      await drawAll(true); await p.evaluate(() => window.__game.story.shoot()); await drawAll(false); // (the photograph is the game's own picture of its canvas, taken as the shutter goes: of a frame drawn whole)
      await p.waitForTimeout(1300); await snap(`${s.fi + 1}-print-developing`); await p.waitForTimeout(1900); await snap(`${s.fi + 1}-print`); // (it develops: tonight, then the other year through it; the print in the hand, its postmark struck)
      { const src = await p.evaluate(() => { const P = window.__game.story.state.prints; return (P[P.length - 1] || {}).src || ''; }); const m = /^data:image\/(\w+);base64,(.*)$/.exec(src); if (m) fs.writeFileSync(`${out}/${s.fi + 1}-print-own.${m[1] === 'jpeg' ? 'jpg' : m[1]}`, Buffer.from(m[2], 'base64')); } // (the print itself, as the roll keeps it: on a slow renderer the still above may be taken after it has gone to the roll)
      if (upto && s.fi + 1 >= upto) { done = true; break; } // (UPTO=n: stop after frame n's print)
    }
    else if (s.phase === 'go' && s.beat === 'order') { // (the order in the hand, its ink come up: a still of it, and it is put away)
      // (read from what the page saw as the sheet came up, above: the sheet does not wait for the check or for the still)
      if (!seen.has('order')) { seen.add('order'); const t0 = Date.now(); await p.waitForTimeout(4000); const inHand = await p.evaluate(() => !!window.__orderOk); await snap('1-order'); console.log(`the order: ${inHand ? 'it came up in the hand' : 'it never came up in the hand'}; its still taken at ${((Date.now() - t0) / 1000).toFixed(1)} s`); if (!inHand) { errors.push('the order is not in the hand as the street is given'); console.log(errors[errors.length - 1]); } }
      await p.keyboard.press('KeyE');
    }
    else if (s.phase === 'go' && s.beat === 'ride') { await mark(s, 'ride'); const to = await p.evaluate(() => window.__game.story.state.fr.ride.to); await goTo(to, 6); } // (a frame reached by car: this player walks; tools/story_ride.js takes the car)
    else if (s.phase === 'go' && s.beat === 'board') { // a flight boarded on its pad (flight.board): the helicopter is there to be seen, turning over;
      // E within reach of it names it, and is the flight at once (no walk to its door first)
      if (!seen.has(`board-${s.fi}`)) {
        seen.add(`board-${s.fi}`); await frames(4);
        const h = await p.evaluate(() => { const g = window.__game, q = g.heli.st; return { at: [+q.x.toFixed(1), +q.y.toFixed(1), +q.z.toFixed(1)], seen: g.heli.group.visible, rotor: +q.rotor.toFixed(2), goal: document.querySelector('#g-story-goal span').textContent, how: document.querySelector('#g-story-goal em').textContent }; });
        console.log(`frame ${s.fi + 1} board:`, JSON.stringify(h));
        if (!h.seen || h.rotor < 0.1) { errors.push(`frame ${s.fi + 1}: the helicopter to get into is ${h.seen ? 'not turning over' : 'not to be seen'} on its pad`); console.log(errors[errors.length - 1]); }
        await snap(`${s.fi + 1}-board`);
        await goTo(h.at, 8); await frames(4); // (on its floor: the pad stands over the deck round it) await p.evaluate(() => { const g = window.__game; g.cam.yaw = g.player.h; g.cam.pitch = 0.3; });
        const act = await p.evaluate(() => { const a = window.__game.currentAction(); return a ? a.text : null; });
        if (act !== 'Get in the helicopter') { errors.push(`frame ${s.fi + 1}: 8 m from the helicopter E is "${act}"`); console.log(errors[errors.length - 1]); }
        await frames(4); await snap(`${s.fi + 1}-board-near`);
        await p.keyboard.press('KeyE'); await frames(2);
        const b = await p.evaluate(() => ({ beat: window.__game.story.state.beat, me: window.__game.player.rig.root.visible }));
        console.log(`frame ${s.fi + 1}: E beside the helicopter, the beat is ${b.beat}`);
        if (b.beat !== 'flight') { errors.push(`frame ${s.fi + 1}: E beside the helicopter, and the beat is ${b.beat}, not the flight`); console.log(errors[errors.length - 1]); }
      }
    }
    else if (s.phase === 'go' && s.beat === 'flight') { // a frame reached by air: its film plays itself out. A still through each shot; in a flight with a
      // helicopter it is in every shot until you are out of it, and you are not (you are in it)
      await mark(s, 'flight');
      const f = await p.evaluate(() => { const g = window.__game, o = g.overture(); return o && o.active ? { t: o.t, shots: o.shots.map(q => ({ id: q.id, t0: q.t0, dur: q.dur })), heli: g.heli.group.visible, me: g.player.rig.root.visible, craft: g.story.state.fr.flight.craft !== false } : null; });
      const q = f && f.shots.find(q => f.t >= q.t0 + q.dur * 0.35 && !seen.has(`fl-${s.fi}-${q.id}`));
      if (q) {
        seen.add(`fl-${s.fi}-${q.id}`); await snap(`${s.fi + 1}-flight-${q.id}`);
        console.log(`frame ${s.fi + 1} flight ${q.id} at ${f.t.toFixed(1)} s: helicopter ${f.heli ? 'seen' : 'not seen'}, you ${f.me ? 'seen' : 'not seen'}`);
        if (f.craft && q.id !== 'foot' && (!f.heli || f.me)) { errors.push(`frame ${s.fi + 1}: in the flight's ${q.id} shot the helicopter is ${f.heli ? 'seen' : 'not seen'} and you are ${f.me ? 'seen' : 'not seen'}`); console.log(errors[errors.length - 1]); }
        // out of it, in the shot you are seen in: you and the dog at your heels stand outside its hull (both were once set
        // down in its cabin; tools/heli_flight.js measures the flight itself)
        if (f.craft && q.id === 'foot') {
          await frames(3);
          const o = await p.evaluate(() => { const g = window.__game, d = g.guideMade && g.guideMade(), B = g.heli.group.visible && g.heli.boxes ? g.heli.boxes() : [];
            const inn = (x, y, z, r) => B.length > 0 && !!window.OECars.pushOut(x, y, z, r, B).hit;
            return { heli: B.length, me: inn(g.player.x, g.player.y, g.player.z, 0.3), dog: d && d.ready ? inn(d.x, d.y, d.z, 0.35) : null, dogAt: d && d.ready ? [+d.x.toFixed(1), +d.y.toFixed(1)] : null }; });
          console.log(`frame ${s.fi + 1}: out of the helicopter: ${JSON.stringify(o)}`);
          if (!o.heli || o.me || o.dog) { errors.push(`frame ${s.fi + 1}: set down from the flight, ${!o.heli ? 'the helicopter is not on the ground beside you' : [o.me && 'you', o.dog && 'the dog'].filter(Boolean).join(' and ') + " in the helicopter's hull"}`); console.log(errors[errors.length - 1]); }
          await snap(`${s.fi + 1}-flight-out`);
        }
      }
    }
    else if (s.phase === 'after') await mark(s, 'after');
    await p.waitForTimeout(500);
  }
  };
  await play();
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
  // (not where UPTO=n stopped at a print: the case is still open there, and the camera rightly round the neck)
  if (done && !upto && await p.evaluate(() => !!(window.__game && window.__game.player.rig.oldCam))) { errors.push('the case is closed, and the camera of 1964 is still round Kagami\'s neck: it is hers again'); console.log(errors[errors.length - 1]); }
  if (!done) console.log('FAIL the last card was not reached', JSON.stringify(await state())); // (its own test: as the camera's else, it was said of every case that closed rightly)
  if (done && !upto) { // the last card: how the case was worked, in the file's hand; and the frames to go back into
    const c = await p.evaluate(() => { const e = document.getElementById('g-story-end'), w = e.querySelector('.worked'); if (w) e.scrollTop = Math.max(0, w.offsetTop - e.clientHeight / 3); return { worked: w ? w.textContent : '', back: e.querySelectorAll('[data-back]').length }; });
    console.log('how the case was worked:', c.worked.slice(0, 400));
    if (!proved) { errors.push('the summation was not answered with a print'); console.log(errors[errors.length - 1]); }
    if (!c.worked || !/side by side|Every pair/.test(c.worked)) { errors.push(`the last card does not say how the case was worked: "${c.worked.slice(0, 80)}"`); console.log(errors[errors.length - 1]); }
    if (+process.env.SPEND && !c.worked.includes(`Frame ${process.env.SPEND} spent`)) { errors.push(`the last card does not name frame ${process.env.SPEND}, spent`); console.log(errors[errors.length - 1]); }
    if (c.back < 7) { errors.push(`the last card offers ${c.back} frames to go back into`); console.log(errors[errors.length - 1]); }
    await snap('end-worked'); await p.evaluate(() => { const e = document.getElementById('g-story-end'), n = e.querySelector('nav.back'); if (n) e.scrollTop = Math.max(0, n.offsetTop - e.clientHeight / 2); }); await snap('end-back');
    if (!(+process.env.BACKTO > 1)) { // the last card's Walk Shibuya: the walk (walk.js) taken up where the case ended, in the same night, on the same page
      await p.evaluate(() => { window.__samePage = true; document.querySelector('#g-story-end button.go').click(); });
      await p.waitForTimeout(2500);
      const look = () => p.evaluate(() => { const g = window.__game, s = document.getElementById('game-stage'), c = g.clock, pad = n => String(n).padStart(2, '0');
        return { same: !!window.__samePage, on: s.classList.contains('walk-on'), card: document.getElementById('g-story-end').classList.contains('on'), title: !document.getElementById('g-title').hidden,
          at: (document.querySelector('#g-walk-where .t') || {}).textContent || '', clock: `${pad(Math.floor(c.min / 60))}:${pad(Math.floor(c.min) % 60)}`, phase: g.story.state.phase, cast: Object.keys(g.story.state.cast).length, light: g.lights() }; });
      const w = await look();
      console.log('the last card\'s walk:', JSON.stringify(w));
      if (!w.same) errors.push('the last card\'s Walk Shibuya opened the page again: the walk is to go on in the same night');
      else if (!w.on || w.card || w.title) errors.push(`the last card's Walk Shibuya did not take up the walk where the case ended (walk ${w.on}, card ${w.card}, title ${w.title})`);
      else if (w.at !== w.clock || w.light.story || w.light.objective) errors.push(`the walk after the case: the corner says ${w.at} at ${w.clock}, a light stands (${JSON.stringify(w.light)})`);
      if (errors.length && /last card's|walk after the case/.test(errors[errors.length - 1])) console.log(errors[errors.length - 1]);
      await snap('end-walk');
      // the lens turned away from the evening's people and a few seconds given: they go once it no longer has them
      await p.evaluate(async () => { const g = window.__game; g.cam.yaw += Math.PI; for (let i = 0; i < 60; i++) { g.frame(0.05); if (i % 10 === 9) await new Promise(r => setTimeout(r, 0)); } });
      const w2 = await look();
      console.log(`the walk after the case: the evening's cast ${w.cast} as it began, ${w2.cast} once the lens had turned away`);
      if (w.cast && w2.cast >= w.cast) errors.push(`the walk after the case: the evening's ${w.cast} people still stand there with the lens turned away from them`);
      await snap('end-walk-away');
    }
    if (+process.env.BACKTO > 1) { // into a frame again from the last card: the roll as it was on arriving there, played to its print
      const n = +process.env.BACKTO;
      await p.evaluate(n => document.querySelector(`#g-story-end [data-back="${n - 1}"]`).click(), n);
      await p.waitForFunction(() => !window.__game || !window.__game.story || window.__game.story.state.phase === 'idle', null, { timeout: 120000, polling: 200 }).catch(() => {});
      await p.waitForFunction(() => window.__game && window.__game.story && !['idle', 'dressed'].includes(window.__game.story.state.phase), null, { timeout: 900000, polling: 500 });
      const a = await p.evaluate(() => { const st = window.__game.story.state; return { fi: st.fi, prints: st.prints.length, flags: Object.keys(st.flags).length, file: st.file.length }; });
      console.log(`back into frame ${n}:`, JSON.stringify(a));
      if (a.fi !== n - 1 || a.prints !== n - 1) { errors.push(`back into frame ${n}: at frame ${a.fi + 1} with ${a.prints} prints`); console.log(errors[errors.length - 1]); }
      upto = n; done = false; await play();
      const q = await p.evaluate(() => window.__game.story.state.prints.length);
      if (!done || q !== n) { errors.push(`frame ${n} entered again did not play to its print (${q} prints)`); console.log(errors[errors.length - 1]); }
      else { console.log(`frame ${n} entered again: played to its print`); await snap(`again-${n}-print`); }
    }
  }
  for (const e of errors) console.log('error:', String(e).slice(0, 300)); // (each, at the end: some are found before the play, and were counted but not said)
  console.log(`played in ${Math.round((Date.now() - t0) / 1000)} s; page errors: ${errors.length}${DRAW > 1 ? `; ${await p.evaluate(() => `${window.__draw.drawn} of ${window.__draw.frames} frames drawn`)}` : ''}`);
  // PRINTS=dir: the photographs taken, as files (the loading screen's frames are made from them)
  if (process.env.PRINTS) { fs.mkdirSync(process.env.PRINTS, { recursive: true }); const pr = await p.evaluate(() => window.__game.story.state.prints.map(q => q.src)); pr.forEach((src, i) => { if (src) fs.writeFileSync(`${process.env.PRINTS}/frame-${i + 1}.jpg`, Buffer.from(src.split(',')[1], 'base64')); }); }
  await b.close();
  process.exit(done && !errors.length ? 0 : 1);
})();
