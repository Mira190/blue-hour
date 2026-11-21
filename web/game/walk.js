// The walk: the story's map with no story in it (docs/STORY.md "The walk"). On the title, over the episode's
// button, a way in of its own: Kagami, whoever you chose, out on the same streets at an hour and under a sky you pick,
// for as long as you like. Nothing stops, nobody asks for a photograph, nothing is owed: the city is all there is.
//
// It is the story's own interface, not a second game's: the title's card and type, the goal's corner for where and
// when you are, the keys' line the first time. Nothing here draws the world or names a city: game.js lends what the
// walk needs (the clock, the weather, the flight down to the street: the walk's opening, game.walk.overture) and keeps what the walk does not offer out of it.
//
//   ctx: { stage, touch, place: { name, native }, date: [month, day] (the evening the story is set in),
//          hourAt(kind) -> minutes on that evening ('live': now, where the map is), fmt(min) -> '17:14',
//          whoGate() -> false while who you play is still to be chosen (it asks), preview(spec): the street behind the
//          title at that hour and under that sky, restore(): the title's own evening again, start(spec): set out,
//          clock() -> { m, d, min }, sky() -> 'clear' | 'rain' | ..., where() -> { name, native } of the area you are
//          in, key(k) -> the key's sign (a pad's while one is in the hand), menu(), photo(), story(),
//          ride() -> { mode: 'foot' | 'car' | 'heli' | ..., kmh, up (m above the ground), rotor (0..1) } }
'use strict';
window.OEWalk = (function () {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // The hour is the walk's one real choice, as a free ride's or a flight's is: the blue hour the story is set in, the
  // night after it, or the hour it is now in Tokyo. The sky: clear, or rain (the wet street that mirrors the screens).
  const HOURS = [['blue', 'Blue hour'], ['night', 'Night'], ['live', 'Now']];
  const SKIES = [['clear', 'Clear'], ['rain', 'Rain']];
  const KEEP = 'oe-walk'; // (the last walk's hour and sky, kept in this browser: the next one is offered at them)
  const SKY_WORD = { clear: 'Clear', overcast: 'Overcast', fog: 'Fog', drizzle: 'Drizzle', rain: 'Rain', storm: 'Storm', snow: 'Snow' };

  function create(ctx) {
    const q = sel => ctx.stage.querySelector(sel), title = q('#g-title');
    let spec = { t: 'blue', w: 'clear' };
    try { const k = JSON.parse(localStorage.getItem(KEEP) || 'null'); if (k && HOURS.some(h => h[0] === k.t) && SKIES.some(s => s[0] === k.w)) spec = { t: k.t, w: k.w }; } catch (e) { /* storage blocked */ }
    let isOpen = false, walking = false;

    // ---- on the menu: a way in, and the step that asks the hour and the sky. The first, and the one Enter and a pad's A
    // take, while the episodes are being finished (the owner's word, November 2026), unless a case is going: then the
    // menu's Continue stands over it, as a game's last save does, and keeps the amber (story.js). Each way in is one row of
    // the menu's list, the same as the others: its name, a word on it, and the Enter key (story.css "the title's ways in")
    const go = document.createElement('button'), row = q('.gt-go'), cont = row && row.querySelector('#gt-cont-go:not([hidden])');
    go.type = 'button'; go.className = cont ? 'btn' : 'btn primary'; go.id = 'gt-walk-go';
    go.innerHTML = '<span>Walk Shibuya</span><small>No story · any hour, any sky</small><kbd>↵</kbd>';
    if (cont) cont.after(go); else if (row) { const s = row.querySelector('#gt-story-go'); if (s) s.before(go); else row.prepend(go); }
    const step = document.createElement('div');
    step.className = 'gt-walk'; step.id = 'gt-walk'; step.hidden = true;
    step.setAttribute('role', 'group'); step.setAttribute('aria-labelledby', 'gt-walk-l');
    const seg = (k, list) => `<div class="gt-walk-seg" role="radiogroup" aria-label="${k === 't' ? 'The hour' : 'The sky'}" data-k="${k}">${list.map(([v, label]) => `<button type="button" role="radio" aria-checked="false" data-v="${v}"><b>${esc(label)}</b><small></small></button>`).join('')}</div>`;
    step.innerHTML = `<span class="eyebrow" id="gt-walk-l">Walk Shibuya</span>
<div class="gt-walk-row"><span>The hour</span>${seg('t', HOURS)}</div>
<div class="gt-walk-row"><span>The sky</span>${seg('w', SKIES)}</div>
<div class="gt-walk-acts"><button type="button" class="btn primary" id="gt-walk-set"><span>Set out</span><kbd>↵</kbd></button><button type="button" class="btn" id="gt-walk-back"><span>Back</span><kbd>Esc</kbd></button></div>`;
    if (row) row.after(step); else if (title) title.querySelector('.gt-card').appendChild(step);
    const blurb = q('#gt-blurb'), eyebrow = q('#gt-city');
    let was = null; // (the title's own lines, put back when the step is left)
    const LINE = 'No case and no clock running out: the crossing as it is, at the hour you choose, for as long as you like. Esc changes the hour and the sky as you go.';
    const dateOf = t => (t === 'live' ? null : ctx.date);
    function sync() {
      for (const b of step.querySelectorAll('[data-k="t"] button')) {
        b.setAttribute('aria-checked', String(b.dataset.v === spec.t));
        b.querySelector('small').textContent = ctx.fmt(ctx.hourAt(b.dataset.v));
      }
      for (const b of step.querySelectorAll('[data-k="w"] button')) b.setAttribute('aria-checked', String(b.dataset.v === spec.w));
      // (over the card, the evening as the walk will have it: the place, the date, the hour)
      if (isOpen && eyebrow) { const d = dateOf(spec.t), c = d ? null : ctx.clock(); eyebrow.textContent = `${ctx.place.name.toUpperCase()} ${ctx.place.native} · ${d ? `${d[1]} ${MONTHS[d[0] - 1]}` : `${c.d} ${MONTHS[c.m - 1]}`} · ${ctx.fmt(ctx.hourAt(spec.t))}`.toUpperCase(); }
    }
    function open(on) {
      if (on === isOpen) return;
      if (on && !ctx.whoGate()) return; // (who you play first, as for the story)
      isOpen = on;
      step.hidden = !on;
      title.toggleAttribute('data-walk', on);
      if (on) {
        was = { blurb: blurb ? blurb.textContent : '', eyebrow: eyebrow ? eyebrow.textContent : '' };
        if (blurb) blurb.textContent = LINE;
        sync(); ctx.preview(spec);
        const b = step.querySelector('#gt-walk-set'); if (b) b.focus({ preventScroll: true });
      } else {
        if (was) { if (blurb) blurb.textContent = was.blurb; if (eyebrow) eyebrow.textContent = was.eyebrow; }
        ctx.restore();
        go.focus({ preventScroll: true });
      }
    }
    function pick(k, v) {
      if (spec[k] === v) return;
      spec = Object.assign({}, spec, { [k]: v });
      try { localStorage.setItem(KEEP, JSON.stringify(spec)); } catch (e) { /* storage blocked */ }
      sync(); ctx.preview(spec);
    }
    const turn = (k, d) => { const list = k === 't' ? HOURS : SKIES, i = list.findIndex(x => x[0] === spec[k]); pick(k, list[(i + d + list.length) % list.length][0]); };
    function setOut() {
      if (!isOpen || walking) return;
      walking = true; isOpen = false; step.hidden = true;
      title.removeAttribute('data-walk');
      if (was) { if (blurb) blurb.textContent = was.blurb; if (eyebrow) eyebrow.textContent = was.eyebrow; }
      try { localStorage.setItem(KEEP, JSON.stringify(spec)); } catch (e) { /* storage blocked */ }
      ctx.start(spec);
    }
    go.addEventListener('click', () => open(true));
    step.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'gt-walk-set') return setOut();
      if (b.id === 'gt-walk-back') return open(false);
      const s = b.closest('[data-k]');
      if (s && b.dataset.v) pick(s.dataset.k, b.dataset.v);
    });
    // the title's keys while the step is up: Enter sets out (or presses what the hand is on), Esc goes back, the arrows
    // change the hour (left and right) and the sky (up and down)
    function titleKey(c) {
      if (!isOpen) return false;
      const f = document.activeElement;
      if (c === 'Enter') { if (f && f.tagName === 'BUTTON' && step.contains(f) && f.id !== 'gt-walk-set') f.click(); else setOut(); return true; }
      if (c === 'Escape' || c === 'Backspace') { open(false); return true; }
      if (c === 'ArrowLeft' || c === 'ArrowRight') { turn('t', c === 'ArrowLeft' ? -1 : 1); return true; }
      if (c === 'ArrowUp' || c === 'ArrowDown') { turn('w', c === 'ArrowUp' ? -1 : 1); return true; }
      return true; // (nothing else on the title while the step is up)
    }

    // ---- out in the street: where and when you are, in the goal's corner; the menu and the camera at the top right;
    // the keys once, at the foot of the frame
    const hud = document.createElement('div');
    hud.id = 'g-walk-where'; hud.setAttribute('aria-live', 'off');
    hud.innerHTML = '<small></small><span class="t"></span><em></em><b class="g" hidden></b><p class="q" hidden><span></span><i></i></p>';
    const acts = document.createElement('div');
    acts.id = 'g-walk-acts';
    // (your car first: called to the kerb nearest you, it is the one way about the walk that is not in the street to be
    // found, and in the menu alone nobody found it: the owner, November 2026)
    acts.innerHTML = `${ctx.car ? `<button type="button" data-do="car" title="Call your car to the kerb nearest you"><i class="car" aria-hidden="true"></i><span>Your car</span>${ctx.touch ? '' : `<kbd>${ctx.key('C')}</kbd>`}</button>` : ''}<button type="button" data-do="photo"><i class="cam" aria-hidden="true"></i><span>Photograph</span>${ctx.touch ? '' : '<kbd>O</kbd>'}</button><button type="button" data-do="menu"><i class="menu" aria-hidden="true"></i><span>Hour · sky · story</span>${ctx.touch ? '' : '<kbd>Esc</kbd>'}</button>`;
    acts.addEventListener('click', e => { const b = e.target.closest('button[data-do]'); if (!b) return; e.stopPropagation(); ({ car: ctx.car, photo: ctx.photo, menu: ctx.menu })[b.dataset.do](); });
    const carBtn = acts.querySelector('[data-do="car"]');
    acts.addEventListener('pointerdown', e => e.stopPropagation());
    const keys = document.createElement('div');
    keys.id = 'g-walk-keys';
    ctx.stage.append(hud, acts, keys);
    let shown = { where: '', t: '', em: '', g: '', q: '' }, keysT = 0, walked = 0, lastXY = null, mode = 'foot';
    const taught = new Set(); // (the ways of getting about whose keys have been shown on this walk: each once, the first time)
    // the keys at the foot of the frame: walking's as you set out, and a car's or the helicopter's the first time you are in one
    const K = k => `<kbd>${ctx.key(k)}</kbd>`;
    const keyLine = (m = 'foot') => {
      if (m === 'car') return ctx.touch ? '<span>The stick drives, brakes and steers</span><span>At the right: the hand brake, the horn, the view</span><span>Stopped: tap Get out</span>'
        : `<span>${K('W')}${K('S')}drive · brake</span><span>${K('A')}${K('D')}steer</span><span>${K('Space')}hand brake</span><span>${K('H')}horn</span><span>${K('V')}view</span><span>${K('E')}get out</span>`;
      if (m === 'heli') return ctx.touch ? '<span>Up and Down climb and descend</span><span>The stick flies and turns</span><span>Set down: tap Get out</span>'
        : `<span>${K('Space')}climb</span><span>${K('Shift')}descend</span><span>${K('W')}${K('S')}fly · slow</span><span>${K('A')}${K('D')}turn</span><span>${K('V')}view</span><span>${K('E')}get out, landed</span>`;
      return ctx.touch
        ? '<span>The stick walks · drag to look</span><span>Top right: your car · the camera · the hour, the sky, the story</span>'
        : `<span>${K('W')}${K('A')}${K('S')}${K('D')}walk</span><span>${K('Shift')}run</span><span>${K('E')}talk</span><span>${K('C')}your car</span><span>${K('O')}photograph</span><span>${K('Esc')}the hour, the sky, the story</span>`;
    };
    function begin() {
      ctx.stage.classList.add('walk-on');
      hud.classList.add('on'); acts.classList.add('on');
      keys.innerHTML = keyLine(); keys.classList.add('on'); keysT = 0; walked = 0; lastXY = null; mode = 'foot'; taught.clear(); taught.add('foot');
      tick(0, null, true);
    }
    // each frame: the clock's minute, the area's name, the sky's word; the keys' line goes once you have walked a little
    function tick(dt, at, force = false) {
      if (!walking) return;
      if (toldT > 0 && (toldT -= dt) <= 0) told.classList.remove('on');
      const c = ctx.clock(), w = ctx.where(), sky = SKY_WORD[ctx.sky()] || '';
      const where = `${w.name} ${w.native || ''}`.trim(), t = ctx.fmt(c.min), em = `${c.d} ${MONTHS[c.m - 1]}${sky ? ` · ${sky}` : ''}`;
      if (force || where !== shown.where) { hud.querySelector('small').textContent = where; if (!force) { hud.classList.remove('new'); void hud.offsetWidth; hud.classList.add('new'); } }
      if (force || t !== shown.t) hud.querySelector('.t').textContent = t;
      if (force || em !== shown.em) hud.querySelector('em').textContent = em;
      // at the wheel or the stick: the one number each needs under the hour (the speed; and in the air the height over
      // the ground, to set it down by, and the rotor while it spools up), in the corner's own type, not a dashboard
      const r = ctx.ride ? ctx.ride() : { mode: 'foot' };
      const g = r.mode === 'car' ? `${Math.round(r.kmh)} km/h` : r.mode === 'heli' ? (r.rotor < 0.9 ? `Rotor ${Math.round(r.rotor * 100)}% · lifts at 90` : `${Math.round(r.kmh)} km/h · ${Math.round(r.up)} m up`) : '';
      if (force || g !== shown.g) { const e = hud.querySelector('.g'); e.textContent = g; e.hidden = !g; }
      if (r.mode !== mode && (r.mode === 'foot' || r.mode === 'car' || r.mode === 'heli')) { // (in or out: the keys for what you are in now, the first time on this walk)
        mode = r.mode;
        if (!taught.has(mode)) { taught.add(mode); keys.innerHTML = keyLine(mode); keys.classList.add('on'); keysT = 0; walked = 0; lastXY = null; }
        else keys.classList.remove('on');
      }
      // your car's button on foot; and what someone on the walk asked of you (walktalk.js), with the metres to it
      if (carBtn && carBtn.hidden !== (r.mode !== 'foot')) carBtn.hidden = r.mode !== 'foot';
      const er = ctx.errand ? ctx.errand() : null;
      const q = er && er.text ? `<span>${esc(er.text)}</span>${er.m != null ? `<i>${er.m < 950 ? `${Math.max(5, Math.round(er.m / 5) * 5)} m` : `${(er.m / 1000).toFixed(1)} km`}</i>` : ''}${er.key && !ctx.touch ? `<kbd>${esc(ctx.key(er.key))}</kbd>` : ''}` : '';
      if (force || q !== shown.q) { const e = hud.querySelector('.q'); e.innerHTML = q; e.hidden = !q; }
      shown = { where, t, em, g, q };
      if (keys.classList.contains('on')) {
        keysT += dt;
        if (at) { if (lastXY) walked += Math.hypot(at[0] - lastXY[0], at[1] - lastXY[1]); lastXY = at; }
        if ((keysT > 6 && walked > 25) || keysT > 16) keys.classList.remove('on');
      }
    }
    // a story of the walk put away (walktalk.js): its name over the street for a few seconds, and how many are told
    const told = document.createElement('div');
    told.id = 'g-walk-told'; told.setAttribute('role', 'status');
    ctx.stage.append(told);
    let toldT = 0; // (the seconds its name has left over the street: the walk's own frames count them, tick)
    function tell(title, n, of) {
      told.innerHTML = `<small>A story of the walk · ${n} of ${of}</small><b>${esc(title)}</b>`;
      told.classList.remove('on'); void told.offsetWidth; told.classList.add('on');
      toldT = 5.2;
    }
    // what was asked done: the corner's line says so with a turn of its amber
    function flash() { const e = hud.querySelector('.q'); e.classList.remove('new'); void e.offsetWidth; e.classList.add('new'); }
    return {
      open, titleKey, begin, tick, told: tell, flash,
      get isOpen() { return isOpen; }, get walking() { return walking; }, get spec() { return spec; },
      // (taken up where the story ended, in the night it ended in: nothing to set out from, game.js walkOnFromStory)
      takeUp() { if (walking) return; walking = true; isOpen = false; begin(); },
      // (set out at once from a fresh page, with the hour and sky given: the story's last card where it could not go on in place, or a harness)
      auto(s) { if (s) spec = { t: HOURS.some(h => h[0] === s.t) ? s.t : 'night', w: SKIES.some(k => k[0] === s.w) ? s.w : 'clear' }; isOpen = true; setOut(); },
    };
  }
  return { create, HOURS, SKIES };
})();
