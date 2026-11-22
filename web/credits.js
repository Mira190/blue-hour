// The Credits screen: who made what the page shows, under which licence, what the page measures, and its version.
// One screen in the story's look (credits.css), over whatever is up, reached from the title's options, the pause menu and
// the story's last card: any element with `data-credits` opens it (a press anywhere on the page, so the screens that
// offer it need no code of their own), and OECredits.show(true) does.
//   - the place: the map's own sources (data/<city>/scene.json `sources`, as the pipeline wrote them), led by the
//     credit lines their licences ask for and followed by what lies past the map's frame (credits.json);
//   - the works: the third-party works the page ships (credits.json `works`), each with its licence and its text;
//   - made here: what was made for the story and has no third party in it (credits.json `own`);
//   - measurements: what telemetry.js counts and why, in a sentence, with its switch (OETelemetry.consent): off stops
//     it and removes the visitor id from this browser;
//   - the version of the deployed build (version.js).
// It is built the first time it is opened, so a page that never opens it fetches and builds nothing for it.
// While it is up the keys are its own: Esc or Backspace closes it, and nothing reaches the game under it.
'use strict';
window.OECredits = (function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const link = (url, text) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text));
  // the map's sources, in the order a reader asks: what the buildings are, how high, what they stand on, what is seen
  // from the air, then the rest. A key not named here is shown after them under its own name.
  const KEYS = [['buildings', 'Buildings'], ['heights', 'Heights and massing'], ['terrain', 'Terrain'], ['imagery', 'Aerial photographs'], ['places', 'Land use'],
    ['trees', 'Street trees'], ['canopy', 'Woods and canopy'], ['landmarks', 'Landmarks'], ['fonts', 'Lettering on signs']];
  const SKIP = { reference_heights: 1 };
  // (a source's line as the pipeline wrote it, less the notes that are not a credit: the rules a study once read)
  const tidy = s => String(s).replace(/;\s*rules:.*$/, '');
  const MEASURE = 'Blue Hour counts visits and measures how the page runs: how long it takes to load, the frame rate, errors, the kind of device, '
    + 'and how far into the story a visit got. It is how a slow phone or a broken frame is found and fixed. The events go to PostHog in the EU under a random id '
    + 'kept in this browser: no name, no account, no cookie, nothing for advertising. A browser that asks not to be tracked is not measured.';
  const STATE = {
    on: 'On. Turning it off stops it now and removes the id from this browser.',
    off: 'Off. Nothing is sent, and the id has been removed from this browser.',
    next: 'On again from the next time the page is opened, under a new id.',
    browser: 'Off: this browser asks not to be tracked (Do Not Track or Global Privacy Control), and the page keeps to it.',
    idle: 'On, though this copy of the page sends nothing: it is a local or an automated one.',
  };
  let el = null, body = null, opener = null, built = false, up = false;
  const stage = () => document.getElementById('game-stage') || document.body;
  const city = () => { const m = /^#(?:play|city)-([a-z0-9_-]+)/i.exec(location.hash); return m ? m[1] : 'shibuya'; };

  function shell() {
    el = document.createElement('section');
    el.id = 'g-credits'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'gc-credits-l');
    el.innerHTML = `<button type="button" class="gt-scr-back" id="g-credits-back"><i aria-hidden="true"></i><span>Back</span><kbd>Esc</kbd></button>
<div class="cr-scroll" tabindex="-1"><div class="cr-in">
  <header class="cr-head"><span class="eyebrow" id="gc-credits-l">Credits</span>
    <h2>Blue Hour</h2>
    <p class="cr-line">A story in episodes at the Shibuya Scramble, rebuilt from open data.</p>
    <p class="cr-ver" id="g-credits-ver"></p></header>
  <div class="cr-cols"><p class="cr-wait">Reading the sources</p></div>
</div></div>`;
    stage().appendChild(el);
    body = el.querySelector('.cr-cols');
    el.querySelector('#g-credits-back').addEventListener('click', () => show(false));
    el.addEventListener('click', e => {
      const b = e.target.closest('button[data-measure]');
      if (!b) return;
      const T = window.OETelemetry;
      if (T && T.consent) T.consent.set(b.dataset.measure === 'on');
      measureSync();
    });
  }
  function version() {
    const v = el && el.querySelector('#g-credits-ver'), V = window.OEVersion;
    if (!v) return;
    const line = V ? V.line() : 'Local build', href = V ? V.link() : '';
    v.innerHTML = `<span>Version</span>${href ? link(href, line) : esc(line)}`;
  }
  function measureSync() {
    if (!el) return;
    const T = window.OETelemetry, s = T && T.consent ? T.consent.state() : 'idle', isOn = s === 'on' || s === 'next' || s === 'idle';
    for (const b of el.querySelectorAll('button[data-measure]')) {
      b.setAttribute('aria-pressed', String((b.dataset.measure === 'on') === isOn));
      b.disabled = s === 'browser' || !(T && T.consent);
    }
    const note = el.querySelector('.cr-measure-state');
    if (note) { note.textContent = STATE[s] || ''; note.dataset.s = s; }
  }
  const row = (name, html) => `<div class="cr-row"><dt>${esc(name)}</dt><dd>${html}</dd></div>`;
  function fill(scene, list) {
    const src = (scene && scene.sources) || {}, seen = {};
    const place = [];
    for (const [k, name] of KEYS) if (src[k]) { seen[k] = 1; place.push(row(name, esc(tidy(src[k])))); }
    for (const k of Object.keys(src)) if (!seen[k] && !SKIP[k]) place.push(row(k.replace(/_/g, ' '), esc(tidy(src[k]))));
    for (const b of list.beyond || []) place.push(row(b.name, b.url ? `${esc(b.text)} · ${link(b.url, new URL(b.url).host)}` : esc(b.text)));
    const works = (list.works || []).map(w => row(w.kind || '', `<b>${esc(w.name)}</b><span class="cr-use">${esc(w.use)}</span><span class="cr-by">${[esc(w.by), w.text ? link(w.text, w.licence) : esc(w.licence), w.url ? link(w.url, new URL(w.url).host.replace(/^www\./, '')) : ''].filter(Boolean).join(' · ')}</span>`));
    const own = (list.own || []).map(o => row(o.name, esc(o.text)));
    body.innerHTML = `<section class="cr-sec cr-place" aria-labelledby="cr-place-l"><h3 id="cr-place-l">The place</h3>
  <ul class="cr-attr">${(list.attribution || []).map(a => `<li>${link(a.url, a.text)}</li>`).join('')}</ul>
  <dl>${place.join('')}</dl></section>
<div class="cr-side">
  <section class="cr-sec cr-measure" aria-labelledby="cr-measure-l"><h3 id="cr-measure-l">What the page measures</h3>
    <p>${esc(MEASURE)}</p>
    <div class="cr-switch" role="group" aria-labelledby="cr-measure-l"><span>Measurements</span><div class="seg"><button type="button" data-measure="on" aria-pressed="true">On</button><button type="button" data-measure="off" aria-pressed="false">Off</button></div></div>
    <p class="cr-measure-state" aria-live="polite"></p></section>
  <section class="cr-sec" aria-labelledby="cr-works-l"><h3 id="cr-works-l">Works in the page</h3><dl>${works.join('')}</dl></section>
  <section class="cr-sec" aria-labelledby="cr-own-l"><h3 id="cr-own-l">Made for the story</h3><dl>${own.join('')}</dl></section>
</div>`;
    measureSync();
  }
  function build() {
    built = true;
    const get = u => fetch(u).then(r => { if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); });
    Promise.all([get(`data/${city()}/scene.json`).catch(() => null), get('credits.json')]).then(([scene, list]) => fill(scene, list))
      .catch(() => { built = false; body.innerHTML = '<p class="cr-wait">The credits did not arrive. Close this and open it again.</p>'; });
  }
  function show(on) {
    on = !!on;
    if (on === up) return;
    if (on) {
      if (!el) shell();
      if (!built) build();
      opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      version(); measureSync();
      el.hidden = false; up = true;
      const scroller = el.querySelector('.cr-scroll');
      scroller.scrollTop = 0;
      scroller.focus({ preventScroll: true }); // (the page itself: the arrows and the space bar scroll it, Tab goes to the way back)
    } else {
      up = false; el.hidden = true;
      if (opener && opener.isConnected && opener.offsetParent) opener.focus({ preventScroll: true });
      opener = null;
    }
  }
  // any element that offers the credits opens them
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-credits]');
    if (b) { e.preventDefault(); show(true); }
  });
  // the keys, while it is up: its own, ahead of the game's and the story's (both listen on the window)
  addEventListener('keydown', e => {
    if (!up) return;
    e.stopImmediatePropagation();
    if (e.code === 'Escape' || (e.code === 'Backspace' && !(e.target.closest && e.target.closest('input, textarea')))) { e.preventDefault(); show(false); }
  }, true);
  addEventListener('oe-version', version);
  return { show, open: () => up, get el() { return el; } };
})();
