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
// SAFE=1: with a notched phone's safe area, and nothing of the interface under the notch or the home bar.
// TITLE=0: not the title's own states (only the laid-in screens). Exits 1 on any failure; out_dir/report.json lists them.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [,, out = '/tmp/ui-fit', ...dirs] = process.argv;
// (a tablet's page of its own: a phone's page made that large stays zoomed out in Chromium's emulation, in its stills)
const ALL = { touch: ['320x568', '360x740', '390x844', '412x915', '844x390'], tablet: ['768x1024'], desk: ['1024x768', '1280x720', '1440x900', '1920x1080'] };
const pick = process.env.SIZES ? process.env.SIZES.split(',') : null;
const SIZES = Object.fromEntries(Object.entries(ALL).map(([k, v]) => [k, pick ? v.filter(s => pick.includes(s)) : v]));
const WORDS = process.env.WORDS != null ? process.env.WORDS.split(',').map(Number) : [0, 1, 2];
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const STILLS = process.env.STILLS || 'some';
// (the screens put in front of a person at every size: one of each kind)
const SHOW = /^(title-.*|fail-card|1-order|1-teach-in-the-light|1-raised|1-print|.*-met|.*-show-a-print|.*-seen-through|.*-hint-place|roll-file|roll-versus|log|end|end-worked|end-back|walk-2-step|walk-4-out|walk-6-menu|walk-6-menu-open|walk-7-photo|walk-7-photo-adjust)$/;
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
  // photo mode (issue 147): the frame is the photograph's. What the camera's controls paint over is held to a share of
  // the frame (a fifth on a desktop, a quarter on a phone with the lens's settings out, a sixteenth with them put
  // away), and none of it lies over the middle of the frame (the centre cell of the thirds), where the subject stands
  if (stage.classList.contains('photo')) {
    const mid = { l: W / 3, r: W * 2 / 3, t: H / 3, b: H * 2 / 3 }, on = [], all = [...stage.querySelectorAll('#g-photo, #g-photo *')];
    let area = 0;
    for (const e of all) {
      if (!shown.has(e)) continue;
      const c = getComputedStyle(e), r = e.getBoundingClientRect();
      const paints = c.backgroundImage !== 'none' || !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(c.backgroundColor) || (c.backdropFilter && c.backdropFilter !== 'none');
      if (!paints || on.some(o => o.contains(e))) continue; // (a box inside a box that paints is counted once)
      on.push(e); area += r.width * r.height;
      if (r.left < mid.r && r.right > mid.l && r.top < mid.b && r.bottom > mid.t) bad.push(`photo mode: ${where(e)} lies over the middle of the frame`);
    }
    const adj = !!stage.querySelector('#g-photo.adj'), strip = getComputedStyle(stage.querySelector('#ph-adj') || stage).display !== 'none' && !!stage.querySelector('#ph-adj');
    const lim = strip ? (adj ? 0.25 : 0.0625) : 0.2, share = area / (W * H);
    if (share > lim) bad.push(`photo mode: the camera's controls cover ${(share * 100).toFixed(0)}% of the frame (${(lim * 100).toFixed(0)}% allowed)`);
  }
  return { bad: [...new Set(bad)], warn: [...new Set(warn)] };
}

// SAFE=1: a phone's notch and home bar. Chromium is told the safe area a phone with a notch reports (upright 47 px at
// the head and 34 at the foot; on its side 47 at each end and 21 at the foot), which the page reads as
// env(safe-area-inset-*), and every word and button shown is held clear of it: in the page, what lies in those bands.
const SAFE = process.env.SAFE === '1';
const insetsFor = (w, h) => (Math.max(w, h) < 700 ? { top: w > h ? 0 : 20, bottom: 0, left: 0, right: 0 } /* (a small phone has a status bar and no notch) */ : w > h ?{ top: 0, bottom: 21, left: 47, right: 47 } : { top: 47, bottom: 34, left: 0, right: 0 });
function safeAudit(ins) {
  const W = innerWidth, H = innerHeight, stage = document.getElementById('game-stage'), bad = [];
  const seen = e => { if (e.closest('[hidden]')) return false; let o = 1; for (let x = e; x && x.nodeType === 1; x = x.parentElement) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden') return false; o *= +c.opacity; if (o < 0.08) return false; } return true; };
  const inScroll = e => { for (let x = e.parentElement; x && x !== stage; x = x.parentElement) if (/(auto|scroll)/.test(getComputedStyle(x).overflowY) && x.scrollHeight > x.clientHeight + 4) return true; return false; };
  const name = e => (e.id ? `#${e.id}` : `${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/)[0]}` : ''}`);
  for (const e of stage.querySelectorAll('*')) {
    if (e.closest('svg, canvas, .g-walk-marks, .g-labels, .g-chatter') || !seen(e)) continue; // (a mark or a call over someone's head is in the world, where they stand: not the interface's to place)
    const own = [...e.childNodes].some(n => n.nodeType === 3 && /[\p{L}\p{N}]/u.test(n.data)), btn = e.matches('button, input, summary, [role="button"]');
    if (!own && !btn) continue;
    let r = e.getBoundingClientRect();
    if (own && !btn) { const rg = document.createRange(); rg.selectNodeContents(e); const q = [...rg.getClientRects()].filter(b => b.width > 1); if (!q.length) continue; r = { left: Math.min(...q.map(b => b.left)), right: Math.max(...q.map(b => b.right)), top: Math.min(...q.map(b => b.top)), bottom: Math.max(...q.map(b => b.bottom)) }; }
    if (!(r.right > 0 && r.bottom > 0 && r.left < W && r.top < H) || inScroll(e)) continue;
    const t = 2, where = r.top < ins.top - t ? 'the notch' : r.bottom > H - ins.bottom + t ? 'the home bar' : r.left < ins.left - t ? 'the notch at the left' : r.right > W - ins.right + t ? 'the right end' : '';
    if (where) bad.push(`under ${where}: "${(e.innerText || e.textContent || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40)}" (${name(e.parentElement)} > ${name(e)})`);
  }
  return [...new Set(bad)];
}

const { lay } = require('./ui_dump'); // (a screen written down by ui_dump.js, laid in over the live page)
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
    ['title-press', () => { for (const k of ['bh-player', 'bh-story-late', 'bh-story-late-closed']) localStorage.removeItem(k); }],
    ['title-first', () => { for (const k of ['bh-player', 'bh-story-late', 'bh-story-late-closed']) localStorage.removeItem(k); }, 'menu'],
    ['title-who-first', () => { for (const k of ['bh-player', 'bh-story-late', 'bh-story-late-closed']) localStorage.removeItem(k); }, 'who'],
    ['title-story-first', () => { for (const k of ['bh-player', 'bh-story-late', 'bh-story-late-closed']) localStorage.removeItem(k); }, 'story'],
    ['title-opts', () => { for (const k of ['bh-story-late', 'bh-story-late-closed']) localStorage.removeItem(k); }, 'opts'],
    ['title-chosen', () => { for (const k of ['bh-story-late', 'bh-story-late-closed']) localStorage.removeItem(k); localStorage.setItem('bh-player', 'M'); }, 'menu'],
    ['title-who-chosen', () => { for (const k of ['bh-story-late', 'bh-story-late-closed']) localStorage.removeItem(k); localStorage.setItem('bh-player', 'M'); }, 'who'],
    ['title-going', () => { localStorage.setItem('bh-story-late', JSON.stringify({ fi: 2, left: 5, prints: [{ src: null, stamp: 'frame 1', cap: '' }, { src: null, stamp: 'frame 2', cap: '' }] })); }, 'menu'],
    ['title-story-going', () => { localStorage.setItem('bh-story-late', JSON.stringify({ fi: 2, left: 5, prints: [{ src: null, stamp: 'frame 1', cap: '' }, { src: null, stamp: 'frame 2', cap: '' }] })); }, 'story'],
    ['title-story-sure', () => { localStorage.setItem('bh-story-late', JSON.stringify({ fi: 2, left: 5, prints: [{ src: null, stamp: 'frame 1', cap: '' }, { src: null, stamp: 'frame 2', cap: '' }] })); }, 'sure'],
    ['title-closed', () => { localStorage.removeItem('bh-story-late'); const st = ['Hachikō · 17:14', 'The scramble · 17:19', 'Tsutaya · 17:26', 'Under the screens · 17:31', 'Center-gai · 17:40', 'The bridge · 17:52', 'The scramble · 18:03']; localStorage.setItem('bh-story-late-closed', JSON.stringify({ prints: st.map(s => ({ src: null, stamp: s, cap: '' })), snaps: st.map(() => 'x'), stamps: st })); }, 'menu'],
    ['title-story-closed', () => { localStorage.removeItem('bh-story-late'); const st = ['Hachikō · 17:14', 'The scramble · 17:19', 'Tsutaya · 17:26', 'Under the screens · 17:31', 'Center-gai · 17:40', 'The bridge · 17:52', 'The scramble · 18:03']; localStorage.setItem('bh-story-late-closed', JSON.stringify({ prints: st.map(s => ({ src: null, stamp: s, cap: '' })), snaps: st.map(() => 'x'), stamps: st })); }, 'story'],
  ];
  for (const ctxName of ['touch', 'tablet', 'desk']) {
    const src = ctxName === 'tablet' ? 'touch' : ctxName; // (a tablet lays out a phone's recordings: both by touch)
    const sizes = SIZES[ctxName]; if (!sizes.length) continue;
    const want = TITLES.length || dumps[src].length; if (!want) continue;
    const [w0, h0] = sizes[0].split('x').map(Number), touch = ctxName !== 'desk';
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
      await p.addInitScript(`try { localStorage.setItem('bh-quality', ${JSON.stringify(process.env.TIER || 'high')}); (${prep || (() => {})})(); } catch (e) {}`);
      await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
      await p.waitForTimeout(3000);
      await p.evaluate(() => { window.__hold = true; });
      await p.evaluate(() => document.getAnimations().forEach(a => { try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (e) { /* */ } }));
    };
    const still = async file => { await p.evaluate(() => window.__release()); await p.waitForFunction(() => { const c = document.getElementById('game-gl'); return c && c.height > 0 && Math.abs(c.width / c.height - innerWidth / innerHeight) < 0.03; }, null, { timeout: 20000, polling: 200 }).catch(() => {}); await p.waitForTimeout(1500); // (the street drawn again at the new size first)
      await p.screenshot({ path: file, timeout: 120000 }).catch(() => console.log(`(no still ${file})`)); await p.evaluate(() => { window.__hold = true; }); };
    const check = async (name, lay) => {
      for (const size of sizes) {
        const [w, h] = size.split('x').map(Number);
        await p.setViewportSize({ width: w, height: h });
        // (a phone's page made wider stays zoomed out in Chromium's emulation, as no phone does: opened again at the size)
        const z = await p.evaluate(() => [innerWidth, visualViewport.scale]);
        if (z[0] !== w || Math.abs(z[1] - 1) > 0.01) await open(prepNow, { width: w, height: h });
        const ins = SAFE && touch ? insetsFor(w, h) : null;
        if (ins) { const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: ins }).catch(e => console.log(`(no safe area here: ${String(e).slice(0, 80)})`)); await cdp.detach().catch(() => {}); }
        if (lay) await lay();
        await p.waitForTimeout(60);
        for (const n of WORDS) {
          await p.evaluate(setWords, n);
          const r = await p.evaluate(audit);
          if (ins) r.bad.push(...await p.evaluate(safeAudit, ins));
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
    // (each state on the screen it is about: the press as the title opens, else the menu or who you play, game.js titleScreen)
    const toScreen = scr => async () => { await p.evaluate(s => { window.__game.titleScreen(s === 'sure' ? 'story' : s); if (s === 'sure') document.getElementById('gt-eps').classList.add('sure'); }, scr); await p.waitForTimeout(400); await p.evaluate(() => document.getAnimations().forEach(a => { try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (e) { /* */ } })); };
    for (const [name, prep, scr] of TITLES) { if (ONLY && !ONLY.test(name)) continue; await open(prep); await check(name, scr ? toScreen(scr) : null); }
    if (dumps[src].length) {
      if (!p) await open(null);
      for (const { name, d, then } of dumps[src]) await check(name, async () => { await p.evaluate(lay, d); if (then) await p.evaluate(then); });
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
