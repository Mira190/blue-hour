// The log of the evening: everything said in the story, in order, to be read again. Who said it (their age tonight,
// or the year an afterimage is of), the hour of the frame it was said in, every question and the answer the player
// gave. The case is reasoned from what people said, once, a letter at a time; a player who looked away has no other
// way back to a line, and failing a question they could not read again is not fair.
//
// It is the dialogue's record (hud.js dialogue calls line and answer for a story's speakers; game.js's story ctx
// calls aside for what is said over the picture). It is kept in this browser beside the case (story.js keeps
// `bh-story-<episode>`; this keeps `bh-story-log-<episode>`), and only as far as the case is: a case taken up at
// frame n has what was said before frame n, as the frame is played again from its beginning.
//
// The words: three sizes and an opaque backing for the dialogue and the goal (classes on the stage, story.css),
// remembered in this browser; the default is the size the story was set in.
'use strict';
window.OELog = (function () {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const WORDS = 'bh-words', SIZES = ['As set', 'Larger', 'Largest'];
  const words = () => { try { const w = JSON.parse(localStorage.getItem(WORDS) || 'null') || {}; return { size: Math.max(0, Math.min(2, w.size | 0)), solid: !!w.solid }; } catch (e) { return { size: 0, solid: false }; } };
  // ctx: { stage, touch, at() -> { fi, stamp } (the frame the story is at), ep() -> the episode's id, can() -> the log may be
  //        opened now, opened(on) (the game lets go of the pointer, and holds its keys) }
  function create(ctx) {
    const stage = ctx.stage, list = [];
    let ep = '', open = false;
    const box = document.createElement('div');
    box.id = 'g-story-log'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'The log of the evening');
    stage.appendChild(box);
    const KEY = () => `bh-story-log-${ep}`;
    const save = () => { if (!ep) return; try { localStorage.setItem(KEY(), JSON.stringify(list)); } catch (e) { /* storage full or blocked: the log lasts the page */ } };
    // the words, as this browser has them: on the stage, for the dialogue and the goal
    function applyWords(w) {
      for (let i = 1; i < 3; i++) stage.classList.toggle(`words-${i}`, w.size === i);
      stage.classList.toggle('words-solid', w.solid);
    }
    function setWords(patch) {
      const w = Object.assign(words(), patch);
      try { localStorage.setItem(WORDS, JSON.stringify(w)); } catch (e) { /* storage blocked: for this page only */ }
      applyWords(w); if (open) draw(false);
    }
    applyWords(words());
    function push(e) {
      const a = ctx.at ? ctx.at() : {};
      e.fi = a.fi | 0; e.at = a.stamp || ''; list.push(e);
      save(); if (open) draw(true);
    }
    // a line as it begins to be said; a question is the line a choice follows
    function line(who, text, ask) {
      if (!text) return;
      push({ kind: ask ? 'q' : 'line', who: who.name || '', role: who.role || '', past: who.alive === false, text });
    }
    // the answer given (the choice's words; a print shown, by its frame)
    function answer(who, choice) {
      const html = String((choice && choice.text) || ''), pr = /class="pr"/.test(html);
      const d = document.createElement('div'); d.innerHTML = html;
      const text = pr && typeof choice.k === 'string' ? `Frames ${choice.k.replace('-', ' and ')}, side by side` : pr ? `The print of frame ${choice.k}${(d.querySelector('.pr > span') || {}).textContent ? `: ${d.querySelector('.pr > span').textContent}` : ''}` : (d.textContent || '').trim();
      push({ kind: 'a', who: 'You', role: '', to: who.name && who.name !== 'You' ? who.name : '', text, print: pr ? choice.k : 0 }); // (a question in the player's own head is answered to nobody)
    }
    // said over the picture (what the world says as it runs on again): no one's line, but a line of the evening
    function aside(text) { const t = String(text || '').replace(/<[^>]*>/g, '').trim(); if (t) push({ kind: 'aside', who: '', role: '', text: t }); }
    // the case opened in this browser: the log as far as the case is (a case begun again, or ended, has none)
    function restore(id) {
      ep = id || ''; list.length = 0;
      let k = null, saved = [];
      try { k = JSON.parse(localStorage.getItem(`bh-story-${ep}`) || 'null'); saved = JSON.parse(localStorage.getItem(KEY()) || '[]'); } catch (e) { k = null; }
      if (k && k.fi > 0 && Array.isArray(saved)) for (const e of saved) if (e && e.fi < k.fi) list.push(e);
      save();
    }
    // back to a frame (#18, a frame entered again): what was said from it on is not yet said
    function trim(fi) { let n = list.length; while (n && list[n - 1].fi >= fi) n--; list.length = n; save(); if (open) draw(true); }
    function draw(end) {
      const w = words();
      let fi = -1, html = '';
      for (const e of list) {
        if (e.fi !== fi) { fi = e.fi; html += `<li class="fr"><b>Frame ${fi + 1}</b>${e.at ? `<span>${esc(e.at)}</span>` : ''}</li>`; }
        html += e.kind === 'aside' ? `<li class="aside"><p>${esc(e.text)}</p></li>`
          : `<li class="${e.kind}${e.past ? ' past' : ''}"><h4><b>${esc(e.who)}</b>${e.kind === 'a' && e.to ? `<span>to ${esc(e.to)}</span>` : e.role ? `<span>${esc(e.role)}</span>` : ''}</h4><p>${esc(e.text)}</p></li>`;
      }
      box.innerHTML = `<div class="sheet"><header><small>The log</small><h2>The evening</h2><span>${list.length ? (() => { const n = list.filter(e => e.kind !== 'aside' && e.kind !== 'a').length, a = list.filter(e => e.kind === 'a').length; return `${n} line${n === 1 ? '' : 's'} said · ${a} answer${a === 1 ? '' : 's'} given`; })() : 'Nothing said yet'}</span></header>
<div class="words" role="group" aria-label="Words"><small>Words</small>${SIZES.map((s, i) => `<button type="button" data-size="${i}" aria-pressed="${w.size === i}" style="--s:${1 + i * 0.22}">${s}</button>`).join('')}<button type="button" data-solid aria-pressed="${w.solid}">Backing</button></div>${self.gamepad && self.gamepad.connected ? `<div class="words" role="group" aria-label="Controller"><small>${esc(self.gamepad.label('R'))}</small><button type="button" data-hold aria-pressed="${!self.gamepad.toggle}">Held up</button><button type="button" data-hold="t" aria-pressed="${!!self.gamepad.toggle}">Each pull</button></div>` : ''}
<ol>${html || '<li class="none"><p>What is said tonight is written here, in order.</p></li>'}</ol>
<div class="row"><button type="button" class="go" data-do="close">Back${ctx.touch ? '' : ' <kbd>L</kbd>'}</button></div></div>`;
      if (end) { const o = box.querySelector('ol li:last-child'); if (o) requestAnimationFrame(() => o.scrollIntoView({ block: 'end' })); }
    }
    function show(on) {
      if (on === open) return;
      if (on && ctx.can && !ctx.can()) return;
      open = on; box.classList.toggle('on', on);
      if (on) { draw(true); if (document.exitPointerLock) document.exitPointerLock(); const b = box.querySelector('button.go'); if (b) b.focus({ preventScroll: true }); }
      if (ctx.opened) ctx.opened(on);
    }
    box.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) { if (e.target === box) show(false); return; }
      if (b.dataset.do === 'close') show(false);
      else if (b.dataset.size != null) setWords({ size: +b.dataset.size });
      else if (b.dataset.solid != null) setWords({ solid: !words().solid });
      else if (b.dataset.hold != null && self.gamepad) { self.gamepad.setToggle(b.dataset.hold === 't'); draw(false); } // (the trigger raises the camera while held, or each pull raises or lowers it)
    });
    // L opens it and closes it; Esc closes it; while it is up, the game has no keys
    const onKey = e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (open) { if (e.code === 'KeyL' || e.code === 'Escape') show(false); if (e.code !== 'Tab') e.preventDefault(); e.stopImmediatePropagation(); return; } // (Tab moves between its buttons)
      if (e.code === 'KeyL' && !e.repeat && ctx.can && ctx.can()) { e.preventDefault(); e.stopImmediatePropagation(); show(true); }
    };
    addEventListener('keydown', onKey, true);
    const self = {
      line, answer, aside, restore, trim, show, setWords, words,
      get open() { return open; }, get entries() { return list.slice(); },
      dispose() { removeEventListener('keydown', onKey, true); box.remove(); },
      gamepad: null, // (pad.js, set by game.js)
    };
    return self;
  }
  return { create, words };
})();
