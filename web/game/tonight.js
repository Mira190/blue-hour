// Tonight: the walk's night as a timetable you can see happen (docs/STORY.md "Tonight"). The open worlds that change by
// the hour (Red Dead Redemption 2's and Ghost of Tsushima's, the Yakuza series' city at night) keep a few things to a
// time and let the player find them; a Tokyo evening has its own: the searchlights on the roof, the shutters coming
// down, the screens going dark, the last train. Each happens by the walk's own clock (game.js clock), whatever hour the
// player chose or set it to, and comes round again when the clock is set back: what is shown is worked out from the
// minute alone, and nothing is kept of an evening.
//
// What makes each happen is the world's own, by the same clock: lights.js runs the searchlights, buildings.js shuts the
// shops at their hours, the screens keep their hours (pipeline/screens.py), trains.js sends out no train after the last.
// This only tells of them, quietly, in the walk's own type:
//   - a line under the date in the walk's corner, from a few minutes before (CROSSING LIGHT · 20:00 · SHIBUYA SKY's
//     roof) and while it lasts (Now · ...). The corner's own line under it is the storyline's (walktalk.js errand): this
//     one is the date's mono, not the errand's words, and never more than one;
//   - as it begins, its name over the street for a few seconds, as a story of the walk's is when it is put away;
//   - in the walk's menu, under its stories, tonight's timetable, the next in amber.
//
//   data (city.json game.tonight): { lead (minutes of notice), moments: [{ id, name, where, now (the line while it
//     lasts), at: 'hh:mm' | from, to, every (a show that repeats), minutes (how long it lasts) }] }, and
//   ctx: { stage, clock() -> minutes after midnight, fmt(min) -> '20:00', show: lights.js's light show (its cfg gives the
//     times of a moment with "of": "light_show"), on() -> whether the walk is out and its corner shown }
'use strict';
window.OETonight = (function () {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hm = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
  const EVE = 16 * 60; // (an evening's order: from four in the afternoon to the small hours, as the walk's night runs)
  const ord = m => (m - EVE + 1440) % 1440;

  function create(ctx) {
    const D = ctx.data || {}, lead = D.lead || 6;
    // (the corner names tonight's next moment from an hour before it, so that a walk set out on at any hour knows from
    // its first minute that the night has a timetable: issue 146. It was `lead`, six minutes, and a walk begun at
    // 17:38 said nothing of the night until 19:54; `lead` is the data's own notice, kept for it)
    const AHEAD = D.ahead || 60;
    // each moment's times tonight, in minutes after midnight
    const moments = (D.moments || []).map(m => {
      let at = [], len = m.minutes || 3;
      const cfg = m.of === 'light_show' && ctx.show && ctx.show.cfg;
      const from = cfg ? cfg.start : m.from, every = cfg ? cfg.every : m.every, to = cfg ? cfg.until : m.to;
      if (cfg) len = cfg.minutes || len;
      if (m.at) at = [].concat(m.at).map(hm);
      else if (from && every) { const a = hm(from), b = hm(to || from); for (let t = a; ord(t) <= ord(b) - (cfg ? len : 0); t = (t + every) % 1440) { at.push(t); if (at.length > 48) break; } }
      return Object.assign({}, m, { times: at, len, from, to, every });
    }).filter(m => m.times.length);

    // what is on now, or coming within the lead, or next tonight: { m, t, now, inMin }. Two at one minute (21:00: a show
    // and the shutters): the one that comes once a night has the line
    function state(min) {
      let on = null, soon = null;
      for (const m of moments) for (const t of m.times) {
        const d = (min - t + 1440) % 1440; // (minutes since it began)
        if (d < m.len && (!on || d < on.since || (d === on.since && m.times.length < on.m.times.length))) on = { m, t, now: true, since: d, inMin: 0 };
        const ahead = (t - min + 1440) % 1440;
        if (ahead > 0 && (!soon || ahead < soon.inMin || (ahead === soon.inMin && m.times.length < soon.m.times.length))) soon = { m, t, now: false, inMin: ahead };
      }
      return { on, soon };
    }

    // ---- in the walk's corner: one line under the date
    let line = null, card = null, cardT = 0, shownLine = '', last = null, lastMin = null;
    function ensure() {
      if (line) return true;
      const where = ctx.stage.querySelector('#g-walk-where');
      if (!where) return false;
      line = document.createElement('p');
      line.className = 'tn'; line.hidden = true;
      const em = where.querySelector('em');
      if (em) em.after(line); else where.appendChild(line);
      card = document.createElement('div');
      card.id = 'g-walk-tonight'; card.setAttribute('role', 'status');
      ctx.stage.append(card);
      return true;
    }
    const lineOf = s => {
      if (s.on) return `<b>Now</b> · ${esc(s.on.m.name)} · ${esc(s.on.m.where || '')}`;
      if (s.soon && s.soon.inMin <= AHEAD) return `${esc(s.soon.m.name)} · <span>${ctx.fmt(s.soon.t)}</span> · ${esc(s.soon.m.where || '')}`;
      return '';
    };
    function tick(dt) {
      if (!ensure()) return;
      const min = ctx.clock(), s = state(min), on = ctx.on();
      const html = on ? lineOf(s) : '';
      if (html !== shownLine) {
        line.innerHTML = html; line.hidden = !html;
        line.classList.toggle('now', !!s.on);
        if (html && (!shownLine || (s.on && !/^<b>Now/.test(shownLine)))) { line.classList.remove('new'); void line.offsetWidth; line.classList.add('new'); }
        shownLine = html;
      }
      // its name over the street as it begins: when the clock comes to it (not when it is set into the middle of one)
      const key = s.on ? `${s.on.m.id}@${s.on.t}` : null;
      const ran = lastMin != null && ((min - lastMin + 1440) % 1440) < 2;
      if (on && key && key !== last && ran && s.on.since < 1) {
        card.innerHTML = `<small>Tonight · ${ctx.fmt(s.on.t)}</small><b>${esc(s.on.m.name)}</b><span>${esc(s.on.m.now || s.on.m.where || '')}</span>`;
        card.classList.remove('on'); void card.offsetWidth; card.classList.add('on');
        cardT = 6;
      }
      last = key; lastMin = min;
      if (cardT > 0 && (cardT -= dt) <= 0) card.classList.remove('on');
      if ((!on || !key) && card.classList.contains('on')) { card.classList.remove('on'); cardT = 0; } // (gone with its moment, or with the clock set past it)
    }

    // ---- tonight's timetable, for the walk's menu: in the evening's order, the next in amber, those gone by dimmed
    function list(min = ctx.clock()) {
      const s = state(min), now = ord(min);
      return moments.slice().sort((a, b) => ord(a.times[0]) - ord(b.times[0])).map(m => {
        const t0 = m.times[0], t1 = m.times[m.times.length - 1];
        const when = m.every && m.times.length > 1 ? `${ctx.fmt(t0)}–${ctx.fmt(t1)} · every ${m.every} min` : m.times.map(ctx.fmt).join(' · ');
        const st = s.on && s.on.m === m ? 'now' : s.soon && s.soon.m === m ? 'next' : ord(t1) + m.len <= now ? 'gone' : 'later';
        return { id: m.id, name: m.name, where: m.where || '', when, state: st, next: s.soon && s.soon.m === m ? ctx.fmt(s.soon.t) : null };
      });
    }
    function menuHtml(min) {
      const L = list(min);
      if (!L.length) return '';
      return `<span class="eyebrow">Tonight in ${esc(D.place || 'the city')}</span><ol>${L.map(t => `<li data-s="${t.state}"><i>${esc(t.state === 'next' && t.next ? t.next : t.when)}</i><b>${esc(t.name)}</b><span>${esc(t.where)}</span></li>`).join('')}</ol>`;
    }
    return { tick, list, menuHtml, state, moments };
  }
  return { create };
})();
