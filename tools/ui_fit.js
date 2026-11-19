// Does the story's interface fit every screen? Each screen the story and the walk show, at ten sizes from a small phone
// to a large desktop and at the log's three word sizes, checked for words that run out of their box or off the
// screen, words cut by a box that clips them, the page scrolling sideways, and buttons lying over one another.
//
// The title is opened for real in each of its states (first visit, a case going, a case closed with frames to go back
// into); every other screen is laid in again from what tools/story_play.js and tools/walk_play.js wrote down at their
// stills (UI_DUMP=dir, tools/ui_dump.js), over the title's live street, so that one play of the episode serves every
// size. A desktop's recordings are laid out at the desktop sizes, a phone's (touch) at the phone and tablet sizes.
//
//   python3 -m http.server 8800 --directory web &
//   UI_DUMP=d/desk xvfb-run -a node tools/story_play.js d/desk-stills 1440x900     (and 390x844 into d/touch, walk_play too)
//   xvfb-run -a node tools/ui_fit.js out_dir [dump_dir ...]
// SIZES=390x844,1440x900: only these. WORDS=0: only that word size. ONLY=regex: only the screens whose name matches.
// STILLS=all (every screen at every size, words 0) | some (the default: failures, and the screens in SHOW) | none.
// TITLE=0: not the title's own states (only the laid-in screens). Exits 1 on any failure; out_dir/report.json lists them.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [,, out = '/tmp/ui-fit', ...dirs] = process.argv;
const ALL = { touch: ['320x568', '360x740', '390x844', '412x915', '844x390', '768x1024'], desk: ['1024x768', '1280x720', '1440x900', '1920x1080'] };
const pick = process.env.SIZES ? process.env.SIZES.split(',') : null;
const SIZES = Object.fromEntries(Object.entries(ALL).map(([k, v]) => [k, pick ? v.filter(s => pick.includes(s)) : v]));
const WORDS = process.env.WORDS != null ? process.env.WORDS.split(',').map(Number) : [0, 1, 2];
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const STILLS = process.env.STILLS || 'some';
// (the screens put in front of a person at every size: one of each kind)
const SHOW = /^(title-.*|fail-card|1-order|1-teach-in-the-light|1-raised|1-print|.*-met|.*-show-a-print|.*-seen-through|.*-hint-place|roll-file|roll-versus|log|end|end-worked|end-back|walk-2-step|walk-4-out|walk-6-menu)$/;
const PORT = process.env.PORT || 8800;

// The audit, in the page: what does not fit, at this size. Only what is seen counts (shown, not transparent, not
// hidden behind a card), and a scroller's own content is the scroller's to show.
function audit() {
  const W = innerWidth, H = innerHeight, bad = [], warn = [];
  const stage = document.getElementById('game-stage');
  const name = e => { if (!e || e === document) return '?'; const id = e.id ? `#${e.id}` : ''; const c = typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''; const own = id || c ? '' : `:nth-child(${[...e.parentElement.children].indexOf(e) + 1})`; return `${e.tagName.toLowerCase()}${id}${c}${own}`; };
  const where = e => { const p = []; for (let x = e; x && x !== stage && p.length < 4; x = x.parentElement) p.unshift(name(x)); return p.join(' > '); };
  const words = e => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const seen = e => {
    if (e.closest('[hidden]')) return false;
    let o = 1;
    for (let x = e; x && x.nodeType === 1; x = x.parentElement) { const c = getComputedStyle(x); if (c.display === 'none') return false; o *= +c.opacity; if (o < 0.08) return false; }
    const c = getComputedStyle(e); if (c.visibility !== 'visible') return false;
    // (wholly off the screen is put away there, as the order sheet waits under the foot of the frame: not seen)
    const r = e.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return false;
    if (r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight) return true;
    for (let x = e.parentElement; x && x !== stage; x = x.parentElement) if (/(auto|scroll)/.test(getComputedStyle(x).overflowY)) return true; // (off the screen in a scroller: there to be reached, or lost)
    return false;
  };
  const scroller = c => /(auto|scroll)/.test(c.overflowX + c.overflowY);
  const clips = c => c.overflowX !== 'visible' || c.overflowY !== 'visible';
  // (the box an element's words must stay inside: its own, or a block's for words set inline)
  const blockOf = e => { let x = e; while (x && x !== stage && getComputedStyle(x).display === 'inline') x = x.parentElement; return x; };
  const textRect = e => { let L = 1e9, T = 1e9, R = -1e9, B = -1e9, any = false; for (const n of e.childNodes) { if (n.nodeType !== 3 || !n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()) { if (r.width < 0.5) continue; any = true; L = Math.min(L, r.left); T = Math.min(T, r.top); R = Math.max(R, r.right); B = Math.max(B, r.bottom); } } return any ? { left: L, top: T, right: R, bottom: B } : null; };
  const els = [...stage.querySelectorAll('*')].filter(e => e.id !== 'game-gl' && !e.closest('svg, canvas'));
  const shown = new Set(els.filter(seen));
  // is any of it the top thing on the screen at some point? (a card over the map's buttons hides them: not theirs to fit)
  const onTop = e => { const r = e.getBoundingClientRect(); const pts = [[0.5, 0.5], [0.15, 0.2], [0.85, 0.2], [0.15, 0.8], [0.85, 0.8]]; return pts.some(([a, b]) => { const x = r.left + r.width * a, y = r.top + r.height * b; if (x < 0 || y < 0 || x >= W || y >= H) return false; const t = document.elementFromPoint(x, y); return t && (t === e || e.contains(t)); }); };
  const covered = e => { const r = e.getBoundingClientRect(); const x = Math.min(W - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(H - 1, Math.max(0, r.top + r.height / 2)); const t = document.elementFromPoint(x, y); if (!t || t === e || e.contains(t) || t.contains(e) || t === stage || t.id === 'game-gl') return false; return !t.contains(e); };
  const T = 2; // px of slack: a letter's spacing after the last letter, a hairline
  for (const e of shown) {
    const tr = textRect(e);
    if (!tr) continue;
    const c = getComputedStyle(e), box = blockOf(e);
    if (!box) continue;
    const b = box.getBoundingClientRect(), bc = getComputedStyle(box);
    const pl = parseFloat(bc.borderLeftWidth), pr = parseFloat(bc.borderRightWidth);
    const ls = Math.max(0, parseFloat(c.letterSpacing) || 0);
    const what = `"${words(e)}" (${where(e)})`;
    // off the screen
    if (tr.left < -T || tr.right > W + T + ls || tr.top < -T || tr.bottom > H + T) {
      let inScroll = false; for (let x = e.parentElement; x && x !== stage; x = x.parentElement) if (scroller(getComputedStyle(x))) { inScroll = true; break; }
      if (inScroll) { // (in a scroller: only what scrolling can bring on: words above or left of where it starts are lost)
        let sc = e.parentElement; while (sc && !scroller(getComputedStyle(sc))) sc = sc.parentElement;
        const r = sc.getBoundingClientRect(); if (tr.top < r.top - sc.scrollTop - T || tr.left < r.left - sc.scrollLeft - T) bad.push(`out of reach above a scroller: ${what} in ${where(sc)}`);
      }
      if (!inScroll && !covered(e)) bad.push(`off the screen: ${what} at ${Math.round(tr.left)}..${Math.round(tr.right)} x ${Math.round(tr.top)}..${Math.round(tr.bottom)} in ${W}x${H}`);
    }
    // out of its own box (sideways: the box is what the words are set in; downwards only where the box is drawn)
    if (tr.right > b.right - pr + T + ls || tr.left < b.left + pl - T) bad.push(`words out of their box: ${what} ${Math.round(tr.right - tr.left)} px of words in ${Math.round(b.width)} px`);
    // cut by something that clips them
    for (let x = e; x && x !== stage; x = x.parentElement) {
      const xc = getComputedStyle(x);
      if (!clips(xc)) continue;
      if (scroller(xc)) break; // (a scroller shows the rest when scrolled)
      const r = x.getBoundingClientRect();
      if (tr.right > r.right + T + ls || tr.left < r.left - T || (xc.overflowY !== 'visible' && (tr.bottom > r.bottom + T || tr.top < r.top - T))) { bad.push(`words cut: ${what} by ${where(x)}`); break; }
    }
    if (c.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) bad.push(`words cut short (…): ${what}`);
    const fs = parseFloat(c.fontSize);
    if (fs < 9) warn.push(`small words (${fs.toFixed(1)} px): ${what}`);
  }
  // the page itself scrolling sideways
  if (document.documentElement.scrollWidth > W + 1) bad.push(`the page scrolls sideways: ${document.documentElement.scrollWidth} px in ${W}`);
  // buttons over buttons, and buttons off the screen
  const act = [...shown].filter(e => e.matches('button, a[href], input, select, textarea, [role=button], [role=radio], [role=tab], [tabindex]:not([tabindex="-1"])') && getComputedStyle(e).pointerEvents !== 'none' && onTop(e));
  for (const e of act) { const r = e.getBoundingClientRect(); if (r.left < -T || r.right > W + T || r.top < -T || r.bottom > H + T) { let inScroll = false; for (let x = e.parentElement; x && x !== stage; x = x.parentElement) if (scroller(getComputedStyle(x))) { inScroll = true; break; } if (!inScroll) bad.push(`button off the screen: "${words(e)}" (${where(e)})`); } }
  for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
    const a = act[i], b = act[j]; if (a.contains(b) || b.contains(a)) continue;
    const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
    const ix = Math.min(A.right, B.right) - Math.max(A.left, B.left), iy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
    if (ix > 2 && iy > 2) bad.push(`buttons overlap: "${words(a)}" (${where(a)}) and "${words(b)}" (${where(b)}) by ${Math.round(ix)}x${Math.round(iy)}`);
  }
  return { bad: [...new Set(bad)], warn: [...new Set(warn)] };
}

// A screen written down by ui_dump.js, laid in over the live page: the overlays, the classes, the scroll, the animations
function lay(d) {
  const stage = document.getElementById('game-stage'), gl = document.getElementById('game-gl');
  for (const e of [...stage.children]) if (e !== gl) e.remove();
  let before = true;
  for (const h of d.html) { if (h === null) { before = false; continue; } const t = document.createElement('template'); t.innerHTML = h; const e = t.content.firstElementChild; if (before) stage.insertBefore(e, gl); else stage.appendChild(e); }
  stage.className = d.stage; stage.setAttribute('style', d.stageStyle || '');
  document.documentElement.className = d.root; document.body.className = d.body;
  const at = p => p.reduce((e, i) => (e ? e.children[i] : null), stage);
  for (const s of d.scrolled || []) { const e = at(s.p); if (e) { e.scrollTop = s.top; e.scrollLeft = s.left; } }
  // (each animation where it was at the still; one the still did not have had finished)
  const was = new Map((d.anims || []).map(a => [`${a.p.join('.')}|${a.name}`, a]));
  for (const a of document.getAnimations()) {
    const t = a.effect && a.effect.target; if (!t || !stage.contains(t)) continue;
    let p = []; for (let e = t; e && e !== stage; e = e.parentElement) p.unshift([...e.parentElement.children].indexOf(e));
    const k = `${p.join('.')}|${a.animationName || a.transitionProperty || ''}`, r = was.get(k);
    try { if (r && r.t != null) { a.currentTime = r.t; a.pause(); } else if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (e) { /* not seekable */ }
  }
}
const setWords = n => { const s = document.getElementById('game-stage'); s.classList.remove('words-1', 'words-2'); if (n) s.classList.add(`words-${n}`); };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dumps = { desk: [], touch: [] };
  for (const d of dirs) for (const f of fs.readdirSync(d).filter(f => f.endsWith('.json')).sort()) {
    const n = f.replace(/\.json$/, ''); if (ONLY && !ONLY.test(n)) continue;
    const j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); (dumps[j.ctx] || (dumps[j.ctx] = [])).push({ name: n, d: j });
  }
  // (screens no still caught, staged on one that did with the story's own template and its longest words: the card of a
  // frame failed, story.js failed(), with frame 6's line)
  const STAGED = [{ name: 'fail-card', base: /^\d-stop$/, run: () => { const f = document.getElementById('g-story-fail'); f.innerHTML = '<div class="card"><small>17:46 · frame 6</small><h2>He turned back to the station</h2><p>An old man asked to be shown where he sat as a boy, and was shown somewhere else twice. He will not tell the rest to someone guessing. The roll has his pitch in it: find it before you go back to him.</p><div class="row"><button type="button" class="go">Take it up again · 17:46</button></div></div>'; f.classList.add('on'); } }];
  for (const k of Object.keys(dumps)) for (const S of STAGED) { if (ONLY && !ONLY.test(S.name)) continue; const b = dumps[k].find(x => S.base.test(x.name)); if (b && !dumps[k].some(x => x.name === S.name)) dumps[k].push({ name: S.name, d: b.d, then: S.run }); }
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const report = [];
  let fails = 0, checked = 0;
  const TITLES = process.env.TITLE === '0' ? [] : [
    ['title-first', () => { for (const k of ['oe3d-player', 'oe-story-late', 'oe-story-late-closed']) localStorage.removeItem(k); }],
    ['title-chosen', () => { for (const k of ['oe-story-late', 'oe-story-late-closed']) localStorage.removeItem(k); localStorage.setItem('oe3d-player', JSON.stringify('M')); }],
    ['title-going', () => { localStorage.setItem('oe-story-late', JSON.stringify({ fi: 2, left: 5, prints: [{ src: null, stamp: 'frame 1', cap: '' }, { src: null, stamp: 'frame 2', cap: '' }] })); }],
    ['title-closed', () => { localStorage.removeItem('oe-story-late'); const st = ['Hachikō · 17:14', 'The scramble · 17:19', 'Tsutaya · 17:26', 'Under the screens · 17:31', 'Center-gai · 17:40', 'The bridge · 17:52', 'The scramble · 18:03']; localStorage.setItem('oe-story-late-closed', JSON.stringify({ prints: st.map(s => ({ src: null, stamp: s, cap: '' })), snaps: st.map(() => 'x'), stamps: st })); }],
  ];
  for (const ctxName of ['touch', 'desk']) {
    const sizes = SIZES[ctxName]; if (!sizes.length) continue;
    const want = TITLES.length || dumps[ctxName].length; if (!want) continue;
    const [w0, h0] = sizes[0].split('x').map(Number), touch = ctxName === 'touch';
    const ctx = await b.newContext({ viewport: { width: w0, height: h0 }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    let p = null, prepNow = null;
    const open = async (prep, size) => {
      prepNow = prep;
      if (p) await p.close();
      p = await ctx.newPage();
      if (size) await p.setViewportSize(size);
      p.on('pageerror', e => console.log(`pageerror (${ctxName}):`, String(e).slice(0, 200)));
      // (the street held still while the screens are measured, a frame of it drawn only for a still: window.__hold)
      await p.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window), q = []; window.__hold = false; window.requestAnimationFrame = fn => (window.__hold ? (q.push(fn), 0) : raf(fn)); window.__release = () => { window.__hold = false; q.splice(0).forEach(f => raf(f)); }; });
      await p.addInitScript(`try { localStorage.setItem('oe3d-quality', ${JSON.stringify(process.env.TIER || 'high')}); (${prep || (() => {})})(); } catch (e) {}`);
      await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
      await p.waitForTimeout(3000);
      await p.evaluate(() => { window.__hold = true; });
      await p.evaluate(() => document.getAnimations().forEach(a => { try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (e) { /* */ } }));
    };
    const still = async file => { await p.evaluate(() => window.__release()); await p.waitForTimeout(1500); await p.screenshot({ path: file, timeout: 120000 }).catch(() => console.log(`(no still ${file})`)); await p.evaluate(() => { window.__hold = true; }); };
    const check = async (name, lay) => {
      for (const size of sizes) {
        const [w, h] = size.split('x').map(Number);
        await p.setViewportSize({ width: w, height: h });
        // (a phone's page made wider stays zoomed out in Chromium's emulation, as no phone does: opened again at the size)
        const z = await p.evaluate(() => [innerWidth, visualViewport.scale]);
        if (z[0] !== w || Math.abs(z[1] - 1) > 0.01) await open(prepNow, { width: w, height: h });
        if (lay) await lay();
        await p.waitForTimeout(60);
        for (const n of WORDS) {
          await p.evaluate(setWords, n);
          const r = await p.evaluate(audit);
          checked++;
          const key = `${name} ${ctxName} ${size} words ${n}`;
          if (r.bad.length) { fails++; console.log(`FAIL ${key}\n  - ${r.bad.slice(0, 12).join('\n  - ')}`); }
          report.push({ name, ctx: ctxName, size, words: n, bad: r.bad, warn: r.warn });
          const want = STILLS === 'all' ? n === 0 : STILLS === 'some' ? (n === 0 && SHOW.test(name)) || r.bad.length : false;
          if (want && (n === 0 || r.bad.length)) await still(`${out}/${name}-${size}${n ? `-w${n}` : ''}.png`);
        }
        await p.evaluate(setWords, 0);
      }
    };
    for (const [name, prep] of TITLES) { if (ONLY && !ONLY.test(name)) continue; await open(prep); await check(name, null); }
    if (dumps[ctxName].length) {
      if (!p) await open(null);
      for (const { name, d, then } of dumps[ctxName]) await check(name, async () => { await p.evaluate(lay, d); if (then) await p.evaluate(then); });
    }
    await ctx.close();
  }
  await b.close();
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
  const warns = [...new Set(report.flatMap(r => r.warn.map(x => x.replace(/ \(.*/, ''))))];
  if (warns.length) console.log(`(small words: ${warns.slice(0, 8).join('; ')})`);
  console.log(fails ? `FAIL ${fails} of ${checked} screens do not fit (${out}/report.json)` : `ok   all ${checked} screens fit: words in their boxes and on the screen, no button over another`);
  process.exit(fails ? 1 : 0);
})();
