// menus.js: a part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").
// `g` is the rest of the game, by name. What this part asks of it:
//   $, $$, drawBig, menuSync, on, parkTitle, picked, renderPassport, story, storyLog, tonight, travelKey, walk, walkTalk,
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
    // (the title screen: the case is kept as each frame begins, so a frame left part-way is taken up from its beginning;
    // a first frame is not kept at all, and the case begins again at its first card)
    const tn = g.$('#gm-title-note');
    if (tn) { tn.textContent = !at || !/[?&]inplace=0\b/.test(location.search) ? '' : // (in place the case waits under the title as it is: nothing to say, game.js parkTitle)
 at.fi > 0 ? `Continue, on the title, takes up frame ${at.fi + 1} from its beginning.` : 'The case is kept from its second frame: from here it begins again at its first card.'; tn.hidden = !tn.textContent; }
  }
  g.on(g.$('#gm-resume'), 'click', () => { g.$('#g-menu').hidden = true; });
  // back to the title, from the case or the walk: the page opened again on the title's menu, past its press (game.js reads
  // bh-title-auto). Not in place: a case's people, its guide and its timers, and the walk's people, car and helicopter,
  // have no way off the street, and the ways between the two were page loads already (#gm-story, the case begun again).
  // What is kept is kept as the case goes (story.js keep), the walk's stories as they are told (walktalk.js)
  g.on(g.$('#gm-title'), 'click', e => {
    const b = e.currentTarget;
    if (b.disabled) return;
    if (g.parkTitle && g.parkTitle()) return; // (the mode parked under the title, no page load; the page load where it cannot be: game.js parkTitle)
    b.disabled = true;
    try { sessionStorage.setItem('bh-title-auto', '1'); } catch (err) { /* storage blocked: the title opens on its press */ }
    const u = new URL(location.href); u.searchParams.delete('walk'); u.searchParams.delete('overture'); u.hash = '';
    document.documentElement.classList.add('bh-leave'); // (the street dims at once: story.css, "Title screen")
    const go = () => { if (u.toString() === location.href.replace(/#$/, '')) location.reload(); else location.href = u.toString(); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) go(); else setTimeout(go, 240);
  });
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
