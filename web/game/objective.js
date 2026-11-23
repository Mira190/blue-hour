// objective.js: a part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").
// `g` is the rest of the game, by name. What this part asks of it:
//   $, $$, G, H, U, cine, clockT, dlg, guide, lin, objective, photo, routeMode, routePeek, story, uiOpen, waypoint,
//   world
// and what it gives back:
//   ROUTE_PEEK, beam, gold, peekRoute, routeShow, setRouteMode
'use strict';
window.OEGameObjective = function (g) {
  // ------------------------------------------------------------ objective marker and GPS route in the world
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 90, 12, 1, true).translate(0, 45, 0),
    new THREE.MeshBasicMaterial({ color: g.lin('#ffc23d'), transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.visible = false;
  g.world.add(beam);
  // the route: on the ground, or in the air when flying (in a story it is the pale blue of the story's own marks, so
  // that it is not taken for the yellow tactile paving it runs beside)
  const gold = OERoute.line(g.world, g.lin(g.G.story && !new URLSearchParams(location.search).has('walk') ? '#9fd0ff' : '#f2bd52'));
  // The route line in the world: always on, only when asked (L, or Show route in the quest card), or
  // off. The minimap keeps its route whichever: the quiet reference. Remembered in this browser.
  const ROUTE_KEY = 'bh-route-line', ROUTE_MODES = { on: 'On', ask: 'Only when I ask', off: 'Off' };
  try { const v = localStorage.getItem(ROUTE_KEY); if (ROUTE_MODES[v]) g.routeMode = v; } catch (e) { /* storage blocked */ }
  function setRouteMode(m) {
    if (!ROUTE_MODES[m]) return;
    g.routeMode = m; g.routePeek = -1;
    try { localStorage.setItem(ROUTE_KEY, m); } catch (e) { /* storage blocked */ }
    g.$$('#gm-route button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.r === m)));
  }
  const ROUTE_PEEK = 8; // seconds a line asked for stays up
  function peekRoute() {
    if (!g.guide.pts) { g.H.toast(g.waypoint || g.objective() ? 'No route from here.' : 'No objective to lead you to. Set a waypoint on the map (<kbd>M</kbd>).'); return; }
    g.routePeek = g.clockT + ROUTE_PEEK;
  }
  // whether the line is up, and its fade toward that: hidden in a conversation, a menu, a map, photo
  // mode or a cinematic shot, and in the last few metres to the objective
  function routeShow(dt, titled) {
    const want = (g.routeMode === 'on' || g.clockT < g.routePeek) && !!g.guide.pts && !titled && !g.photo.on && !g.dlg.open && !g.uiOpen() && !g.cine.active && gold.left > 6 && !(g.story && g.story.finder); // (nor through the story's raised camera: seen from the eye along the ground, the band stood up in the finder as a shaft of light, issue 19)
    gold.fade(want ? 1 : 0, dt);
    gold.night(g.U.uNight.value);
    const b = g.$('#gq-route');
    if (b) b.hidden = g.routeMode === 'on' || !g.guide.pts || g.clockT < g.routePeek || titled;
  }
  return { ROUTE_PEEK, beam, gold, peekRoute, routeShow, setRouteMode };
};
