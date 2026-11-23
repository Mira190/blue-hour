// clock.js: a part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").
// `g` is the rest of the game, by name. What this part asks of it:
//   $, CITY, MONTHS, S, U, Wd, clockUtc, fmtMin, glowMat, headMat, junctions, show, sun, weather
// and what it gives back:
//   applySun, clock, setClock
'use strict';
window.OEGameClock = function (g) {
  // ------------------------------------------------------------ clock: the place's own time, now, running in real time
  // unless the player picks another hour or speed (the menu: 30 times real time as in GTA, 120, or paused)
  const clock = { y: g.CITY.year || new Date().getFullYear(), m: 3, d: 21, min: 600, scale: 1, frozen: false, own: false };
  // the traffic's rules by the hour (junctions.js: turns banned and streets shut at some hours) go by this clock
  let dowKey = '', dow = 0;
  g.junctions.setClock(() => { const k = `${clock.y}-${clock.m}-${clock.d}`; if (k !== dowKey) { dowKey = k; dow = (new Date(Date.UTC(clock.y, clock.m - 1, clock.d)).getUTCDay() + 6) % 7; } return { dow, min: clock.min }; });
  // (live: the place's own time, which the clock then follows; any other hour set is kept as set)
  function setClock(y, m, d, min, live = false) {
    clock.own = !live;
    const t = new Date(Date.UTC(y, m - 1, d) + Math.floor(min / 1440) * 864e5);
    Object.assign(clock, { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), min: ((min % 1440) + 1440) % 1440 });
    applySun();
  }
  function applySun() {
    g.clockUtc = g.S.localToUtc(clock.y, clock.m, clock.d, clock.min);
    g.sun = g.S.position(g.clockUtc);
    g.Wd.setSun(g.sun, clock.min);
    if (g.weather) { g.weather.clock(clock.y, clock.m, clock.d, clock.min); g.weather.light(); } // a weaker sun and a greyer sky under cloud
    g.Wd.setSeason(clock.m, clock.d);
    if (g.show) g.show.setClock(clock.min);
    const night = g.U.uNight.value;
    g.headMat.emissiveIntensity = 1.6 * night;
    g.glowMat.opacity = 0.85 * night;
    if (g.junctions.heads) g.junctions.heads.setNight(night);
    const loc = g.S.utcToLocal(g.S.localToUtc(clock.y, clock.m, clock.d, clock.min));
    g.$('#g-time').textContent = `${g.fmtMin(clock.min)} ${loc.zone}`;
    g.$('#g-date').textContent = `${clock.d} ${g.MONTHS[clock.m - 1]}${clock.frozen ? ' · paused' : clock.scale === 1 ? ' · real time' : ''}`;
  }
  return { applySun, clock, setClock };
};
