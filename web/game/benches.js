// benches.js: a part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").
// `g` is the rest of the game, by name. What this part asks of it:
//   $, $$, DISTRICT, DSM, G, S, clock, crowd, fmtMin, pad, setClock, sun, weather
// and what it gives back:
//   benchLit, benchTalk, fillTimes, menuSync, presetTime, sunWant
'use strict';
window.OEGameBenches = function (g) {
  // ------------------------------------------------------------ benches in the sun
  // People take the sun when it's cool and the shade when it's hot. The guide is the city's
  // average daily top for the month (game.json "climate") against a comfortable 22 °C, and a
  // low sun is gentler, so mornings and evenings lean towards the sun.
  const CLIMATE = g.G.climate && g.G.climate.mean_max_c;
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function sunWant() { // -1 looks for shade .. +1 looks for sun
    if (!CLIMATE || !g.sun || g.sun.altitude <= 0) return 0;
    const month = Math.max(-1, Math.min(1, (22 - CLIMATE[g.clock.m - 1]) / 4));
    return Math.max(-1, Math.min(1, month + 0.8 * (1 - Math.min(1, g.sun.altitude / 50))));
  }
  const benchLit = b => (g.sun && g.sun.altitude > 0 ? g.S.sunlit(g.DSM, b.x, b.y, b.z + 1, g.sun) : null);
  // how likely a passer-by is to take a free seat on a bench: what it offers against what people want
  g.crowd.sitChance = b => {
    if (!g.sun || g.sun.altitude <= 0) return 0.06; // a few still sit out after dark
    if (b.lit == null) return 0.25;
    const w = sunWant();
    return 0.25 * (b.lit ? 1 + 0.9 * w : 1 - 0.9 * w);
  };
  // what someone on a bench says: when the sun comes to it or leaves it today, and why that suits
  function benchTalk(b) {
    if (!g.sun || g.sun.altitude <= 0) return 'Quiet out here after dark. I like it.';
    const lit = benchLit(b), w = sunWant(), tmax = CLIMATE ? `${Math.round(CLIMATE[g.clock.m - 1])}°` : null;
    let at = null, sets = false;
    for (let m = Math.ceil((g.clock.min + 1) / 10) * 10; m < 1440; m += 10) {
      const sp = g.S.position(g.S.localToUtc(g.clock.y, g.clock.m, g.clock.d, m));
      if (sp.altitude <= 0) { sets = true; at = m; break; }
      if (g.S.sunlit(g.DSM, b.x, b.y, b.z + 1, sp) !== lit) { at = m; break; }
    }
    const when = at == null ? null : g.fmtMin(at), month = MONTH_NAMES[g.clock.m - 1];
    if (lit) {
      const until = sets ? `until the sun goes down at about ${when}` : when ? `until about ${when}` : 'for the rest of the day';
      if (w > 0.3) return `This bench has the sun ${until}.${tmax ? ` On a ${tmax} ${month} day, that's what you want.` : ''}`;
      if (w < -0.3) return `Bit hot in the sun, honestly. It's on this bench ${until}.`;
      return `This bench has the sun ${until}.`;
    }
    const comes = when && !sets ? `The sun gets to this bench at about ${when}.` : 'The sun won\'t get to this bench again today.';
    if (w < -0.3) return `${tmax ? `${month} averages ${tmax} here. ` : ''}${when && !sets ? `This bench is in the shade until about ${when}.` : 'This bench is in the shade for the rest of the day.'}`;
    return `Shady here. ${comes}`;
  }

  // the time of day: now, or one of sun.js's presets (sunrise, morning, noon, golden hour, sunset, blue hour,
  // night), worked out from the sun on the clock's date, so a quest's date stays when you change the hour
  function presetTime(kind) {
    if (kind === 'live') { const now = g.S.utcToLocal(Date.now()); return g.setClock(now.y, now.m, now.d, now.minutes, true); } // ("Now" follows the place's clock from here on)
    if (kind === 'postcard') return g.setClock(g.clock.y, g.clock.m, g.clock.d, OEPostcards.lightTime(g.DISTRICT.light, g.clock.y, g.clock.m, g.clock.d)); // (the light of the postcard you came by)
    g.setClock(g.clock.y, g.clock.m, g.clock.d, g.S.presetTime(kind, g.clock.y, g.clock.m, g.clock.d) ?? 600);
  }
  // the buttons for those, each with its clock time on the clock's date (the title's choice and the menu's row)
  function fillTimes(box) {
    const was = box.querySelector('[aria-pressed="true"]'), pick = was ? was.dataset.t : null, now = box.querySelector('[data-t="live"]');
    box.querySelectorAll('[data-t]:not([data-t="live"])').forEach(b => b.remove());
    for (const [k, label] of g.S.PRESETS) {
      const b = document.createElement('button');
      b.dataset.t = k; b.dataset.label = label;
      b.innerHTML = `${label}<span class="num">${g.fmtMin(g.S.presetTime(k, g.clock.y, g.clock.m, g.clock.d))}</span>`;
      if (pick) b.setAttribute('aria-pressed', String(k === pick));
      box.insertBefore(b, null);
    }
    if (now) { now.dataset.label = 'Now'; box.insertBefore(now, box.firstChild); }
  }
  function menuSync() { // the menu's slider and date follow the clock
    g.$('#gm-clock').value = String(Math.round(g.clock.min));
    g.$('#gm-clock-v').textContent = `${g.fmtMin(g.clock.min)} · sun ${g.sun.altitude.toFixed(0)}°`;
    g.$('#gm-date').value = `${g.clock.y}-${g.pad(g.clock.m)}-${g.pad(g.clock.d)}`;
    if (g.weather) g.$$('#gm-weather button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.w === g.weather.mode)));
    fillTimes(g.$('#gm-time'));
  }
  return { benchLit, benchTalk, fillTimes, menuSync, presetTime, sunWant };
};
