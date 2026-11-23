// menus.js: a part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").
// `g` is the rest of the game, by name. What this part asks of it:
//   $, $$, drawBig, menuSync, on, picked, renderPassport, story, storyLog, tonight, travelKey, walk, walkTalk,
//   walkUi
// and what it gives back:
//   bigCanvas, mapPop, toggleMap, toggleMenu, togglePass
'use strict';
window.OEGameMenus = function (g) {
  // ------------------------------------------------------------ menus, map, passport
  function toggleMenu() { g.$('#g-menu').hidden = !g.$('#g-menu').hidden; if (!g.$('#g-menu').hidden) { g.menuSync(); talesSync(); tonightSync(); caseSync(); if (g.walk && g.walkUi && g.walkUi.menuSync) g.walkUi.menuSync(true); } }
  // the story's own pause (issue 114): the frame the case is at, the words' size as the log has it, and the case begun
  // again, asked twice (the frames taken are lost with it)
  function caseSync() {
    const at = g.story && g.story.at, w = g.storyLog ? g.storyLog.words() : null, again = g.$('#gm-again'), note = g.$('#gm-again-note');
    if (g.$('#gm-case-at')) g.$('#gm-case-at').textContent = at ? `Frame ${at.fi + 1} of ${at.of}${at.stamp ? ` · ${at.stamp}` : ''}` : '';
    if (w) g.$$('#gm-words button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.solid != null ? w.solid : +b.dataset.size === w.size)));
    if (again) { again.classList.remove('sure'); again.textContent = 'Start the case again'; again.parentNode.hidden = !at; }
    if (note) note.hidden = true;
  }
  g.on(g.$('#gm-resume'), 'click', () => { g.$('#g-menu').hidden = true; });
  g.on(g.$('#gm-words'), 'click', e => {
    const b = e.target.closest('button'); if (!b || !g.storyLog) return;
    g.storyLog.setWords(b.dataset.solid != null ? { solid: !g.storyLog.words().solid } : { size: +b.dataset.size });
    caseSync();
  });
  g.on(g.$('#gm-again'), 'click', e => {
    const b = e.currentTarget, at = g.story && g.story.at, note = g.$('#gm-again-note');
    if (!at) return;
    if (!b.classList.contains('sure')) {
      b.classList.add('sure'); b.textContent = 'Yes, from the first card';
      note.textContent = at.taken ? `The ${at.taken === 1 ? 'frame' : `${at.taken} frames`} taken, the file and the log go with it. Close the menu to keep the case.` : 'The case begins again from its first card. Close the menu to keep it.'; note.hidden = false;
      return;
    }
    g.story.beginAgain();
  });
  // the walk's stories in its menu (walktalk.js list): each by its name, told, under way with what was asked, or not yet
  // met with where to look
  function talesSync() {
    const el = g.$('#gm-tales');
    if (!el) return;
    const L = g.walk && g.walkTalk ? g.walkTalk.list() : [];
    el.hidden = !L.length;
    if (!L.length) return;
    const n = L.filter(t => t.state === 'told').length, esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const V = g.walkTalk.views(), nv = V.filter(v => v.found).length;
    el.innerHTML = `<span class="eyebrow">Stories of the walk · ${n} of ${L.length}</span><ol>${L.map(t => `<li data-s="${t.state}"><b>${esc(t.title)}</b><span>${esc(t.text)}</span></li>`).join('')}</ol>`
      + (V.length ? `<span class="eyebrow">Views of Shibuya · ${nv} of ${V.length}</span><ul class="gm-album">${V.map(v => `<li data-f="${v.found ? 1 : 0}">${v.found && v.pic ? `<img alt="" src="${v.pic}">` : ''}<b>${esc(v.name)}</b><span>${esc(v.found ? v.when : v.hint)}</span></li>`).join('')}</ul>` : '');
  }
  // tonight's timetable in the walk's menu, under its stories (tonight.js)
  function tonightSync() {
    const el = g.$('#gm-tonight');
    if (!el) return;
    const h = g.walk && g.tonight ? g.tonight.menuHtml() : '';
    el.hidden = !h;
    if (h) el.innerHTML = h;
  }
  function togglePass() { g.renderPassport(); g.$('#g-pass').hidden = !g.$('#g-pass').hidden; }
  const bigCanvas = g.$('#g-bigmap-c'), mapPop = g.$('#g-mappop');
  function toggleMap() {
    const el = g.$('#g-bigmap');
    el.hidden = !el.hidden;
    g.picked = null; mapPop.hidden = true;
    if (!el.hidden) { g.travelKey = ''; g.drawBig(); }
  }
  return { bigCanvas, mapPop, toggleMap, toggleMenu, togglePass };
};
