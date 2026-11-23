// fishing.js: a part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").
// `g` is the rest of the game, by name. What this part asks of it:
//   A, D, G, H, QC, S, cam, camera, cine, cityId, clock, clockT, dlg, fmtMin, k, nav, photo, player, qs, reduced,
//   renderPassport, running, save, stage, sun, touch, uiOpen, weather, world
// and what it gives back:
//   dayLimits, fish, fishLoad, fishSpot, fishTick
'use strict';
window.OEGameFishing = function (g) {
  // ------------------------------------------------------------ fishing from the shore (docs/FISHING.md). Only where the spots are
  // comes with the game (game.json "fishing", a city that has it: pipeline/fishing.py). fishing.js and the city's
  // fishing.json are fetched the first time you are on foot within sight of a spot, and what they draw is made on
  // the first cast and freed when you walk away, so nobody pays for fishing they do not do.
  const fish = g.G.fishing && g.G.fishing.spots && g.G.fishing.spots.length ? { spots: g.G.fishing.spots, api: null, loading: null, look: 0 } : null;
  const fishSpot = r => (g.player.mode === 'foot' ? fish.spots.find(sp => Math.hypot(sp.at[0] - g.player.x, sp.at[1] - g.player.y) < r) : null);
  function fishLoad() {
    if (fish.loading) return fish.loading;
    const script = (src, have) => (have ? Promise.resolve() : new Promise((ok, no) => { const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = () => no(new Error(`${src} did not load`)); document.head.appendChild(el); }));
    const code = Promise.all([script('game/fishing.js', window.OEFishing), script('game/fishart.js', window.OEFishArt)]);
    fish.loading = Promise.all([code, fetch(g.D.DATA + g.G.fishing.file).then(r => { if (!r.ok) throw new Error(`${g.G.fishing.file}: ${r.status}`); return r.json(); })]).then(([, data]) => {
      if (!g.running) return null;
      fish.api = OEFishing.create({ THREE, world: g.world, nav: g.nav, player: g.player, cam: g.cam, camera: g.camera, H: g.H, A: g.A, data, cityId: g.cityId, clock: g.clock, sun: () => g.sun, rain: () => (g.weather ? g.weather.state.rain : 0), tier: g.QC.name, reduced: g.reduced, touch: g.touch, stage: g.stage,
        key: g.k, time: () => g.clockT, ui: () => g.dlg.open || g.uiOpen() || g.cine.active || g.photo.on,
        walkTo: (x, y, label, then, cancel) => { g.player.auto = { x, y, t: 0, label, then, cancel }; },
        stamp: (stamp, title) => { const id = `fish-${stamp.toLowerCase().replace(/\W+/g, '-')}`; if (!g.qs.stamps.some(q => q.id === id)) { g.qs.stamps.push({ id, stamp, title, at: g.fmtMin(g.clock.min) }); g.renderPassport(); g.save(); } g.A.thump(); g.H.stamp(stamp, title); } });
      return fish.api;
    }).catch(e => { fish.loading = null; fish.look = g.clockT + 30; console.warn(`fishing: ${e.message}`); return null; }); // (offline, say: asked for again in half a minute)
    return fish.loading;
  }
  // each step: fetch it when a spot comes within sight, and then run it (the rises on the water, a line that is out)
  function fishTick(dt, side) {
    if (fish.api) fish.api.step(dt, side);
    else if (g.clockT > fish.look) { fish.look = g.clockT + 1; if (fishSpot(160)) { fish.near = true; fishLoad(); } }
  }
  let dayLim = null; // sunrise and sunset for the game's date, worked out once a day
  const dayLimits = () => { const k = `${g.clock.y}-${g.clock.m}-${g.clock.d}`; if (!dayLim || dayLim.k !== k) dayLim = Object.assign({ k }, g.S.dayLimits(g.clock.y, g.clock.m, g.clock.d)); return dayLim; };
  return { dayLimits, fish, fishLoad, fishSpot, fishTick };
};
