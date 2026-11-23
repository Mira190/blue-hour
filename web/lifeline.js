// The page's notes to itself about its own life, kept whatever the measurements do (issue 128). A phone that killed the
// page for its memory is told so by the next load, which then loads a level lighter (quality.js level); that was
// written only by web/telemetry.js, which returns before any of it with Do Not Track, Global Privacy Control, the
// visitor's own switch, ?telemetry=off or an automated browser, so a visitor who opted out was killed the same way load
// after load. Nothing here leaves the device: two notes in its own storage, read back by its own next load.
//   - While the page is seen, a note says it is alive (`bh-alive-<page id>`, refreshed every five seconds and at each
//     step of a load), with the map, the view, the phone's level and whether its WebGL context was lost (already
//     counted then: quality.js lost). It is taken away when the tab is put away or the page closes.
//   - A load that finds a note left behind (older than half a minute: another tab of the site keeps its own fresh; this
//     tab's own last page's at any age, by the tab's session storage, which outlives a killed page) knows that page
//     died on screen, and counts the death against its map and level (`bh-died-<map>`, quality.js died and level).
// telemetry.js, where it runs, adds what it knows to the note (the spot, the mode, how much the view had downloaded:
// extra()) and reports each dead page it finds (found) as a "crash".
'use strict';
window.OELifeline = (function () {
  const ALIVE = 'bh-alive-', DAYS = 14 * 864e5;
  const now = () => performance.now();
  const rid = () => { const a = new Uint8Array(12); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); };
  const sid = rid();
  let going = false, ready = false, stage = '', more = null;
  // the view, as telemetry.js names it: the story's page (no address after #) is its map's game
  function where() {
    const h = location.hash.replace(/^#/, '').split(/[?&]/)[0];
    if (!h || h === 'globe') return document.getElementById('game-stage') ? { view: 'game', city: document.documentElement.dataset.map || 'shibuya' } : { view: 'globe', city: '' };
    if (/^play-/.test(h)) return { view: 'game', city: h.slice(5) };
    return { view: 'city', city: h };
  }
  // (lv: the level of a phone's set the page runs at, quality.js level: a death is counted against that level)
  const lvNow = () => { try { const Q = window.OEQuality; return Q && Q.lean() ? Q.city().lighter : undefined; } catch (e) { return undefined; } };
  const lostNow = () => { try { return !!(window.OEQuality && OEQuality.lostHere && OEQuality.lostHere()); } catch (e) { return false; } };
  function alive() {
    if (going) return;
    let x = {};
    try { x = more ? more() || {} : {}; } catch (e) { x = {}; }
    try { localStorage.setItem(ALIVE + sid, JSON.stringify(Object.assign({ t: Date.now(), up: Math.round(now() / 1000), ready, stage, lv: lvNow(), lost: lostNow() || undefined }, where(), x))); } catch (e) { /* storage blocked */ }
  }
  const gone = () => { try { localStorage.removeItem(ALIVE + sid); } catch (e) { /* storage blocked */ } };

  // the notes left behind by pages that died (telemetry.js reports them: found)
  const found = [];
  let before = null;
  try { before = sessionStorage.getItem('bh-sid'); sessionStorage.setItem('bh-sid', sid); } catch (e) { /* storage blocked */ }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || k.indexOf(ALIVE) || k === ALIVE + sid) continue;
      let o = null; try { o = JSON.parse(localStorage.getItem(k)); } catch (e) { o = null; }
      const age = o ? Date.now() - o.t : 1e12;
      if (age < 30000 && k !== ALIVE + before) continue; // (another tab's, still alive; this tab's own last page is dead whatever its age)
      localStorage.removeItem(k);
      // the memory loop (quality.js died; issue 443): a map whose page died on this device loads lighter the next
      // time, one step for each death, so that a phone it killed once is not killed the same way again. (lv: the
      // lightest level a page of this map has died at; a page from before levels were written died at 0 or 1, the sets
      // of that time. A page whose context was lost was counted then, quality.js lost: not twice.)
      if (o && o.city && (o.view === 'game' || o.view === 'city') && age < DAYS && !o.lost) try {
        let d = null; try { d = JSON.parse(localStorage.getItem(`bh-died-${o.city}`)); } catch (e) { d = null; }
        const was = d && d.n > 0 ? (d.lv != null ? d.lv : 1) : -1, lv = Math.max(was, o.lv != null ? o.lv : 1);
        localStorage.setItem(`bh-died-${o.city}`, JSON.stringify({ n: Math.min(9, ((d && d.n) || 0) + 1), t: Date.now(), ready: !!o.ready, lv }));
      } catch (e) { /* storage blocked */ }
      if (o) found.push(Object.assign({ age }, o));
    }
  } catch (e) { /* storage blocked */ }

  // the load's steps, as the game names them (performance marks "oe:..."): the last is kept in the note, so that a page
  // that died says where; its first frame drawn makes it ready
  try {
    new PerformanceObserver(l => {
      for (const e of l.getEntries()) {
        if (e.name.indexOf('oe:')) continue;
        stage = e.detail && e.detail.step ? String(e.detail.step).slice(0, 40) : e.name.slice(3);
        if (e.name === 'oe:frame') ready = true;
        if (!document.hidden) alive();
      }
    }).observe({ type: 'mark' });
  } catch (e) { /* no User Timing: the five seconds' note only */ }
  setInterval(() => { if (!document.hidden) alive(); }, 5000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) gone(); else alive(); });
  addEventListener('pagehide', () => { gone(); going = true; });
  // back from the back-forward cache: the page lives again
  addEventListener('pageshow', e => { if (e.persisted) { going = false; alive(); } });
  if (!document.hidden) alive();
  return {
    sid, found, alive, gone,
    // telemetry.js: what it knows of the page, laid over the note each time it is written
    extra(fn) { more = fn; alive(); },
    get going() { return going; },
  };
})();
