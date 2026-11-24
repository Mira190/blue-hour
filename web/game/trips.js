// Where the traffic is going (docs/GAME.md "Trips", docs/ROADS.md "Every vehicle has somewhere to go"; issue 196).
//
// A car that picks any exit at every junction is a random walk: it turns back on itself, circles a block, and the
// flow on a street is whatever chance left there. A driver is going somewhere. So each car of the traffic is bound for
// a place, and at a junction takes the exit that brings it nearest by road:
//   an edge    one of the map's gates on a main road (the road plan's ends, pipeline/road_plan.py: where a street
//              leaves the map): the way out of town
//   a centre   a street by one of the places the map names (the start, the stations, the landmarks' labels): the way
//              into town, which ends at the kerb where there is room, or goes on to the next place
// How many go which way follows the hour: into town in the morning, out in the evening.
//
// No route is kept and nothing is searched while a car drives. For each place a field is worked out once, the first
// time a car is sent there: a search back from the place over the road graph as it may be driven (one-ways, the
// banned turns, the roads to keep off, no turning round at a junction), a back street dearer than its length, a
// quiet street or a single track dearer still. The field holds, for every piece and each way along it, the cost from
// where a car comes onto it to the place; junctions.js `choose` looks each exit up and takes the nearest, one 64 m
// dearer a third as likely, so that the traffic spreads over the ways that are nearly as good.
//
// A bus has its line (junctions.js, pipeline/bus_lines.py) and reads no field while it is on it.
window.OETrips = (function () {
  const MAIN = { motorway: 1, trunk: 1, primary: 1, secondary: 1, tertiary: 1 };
  const RANK = { motorway: 5, trunk: 5, primary: 4, secondary: 3, tertiary: 2 };
  const EDGES = 8, CENTRES = 16;
  const BOUND = 0.7;          // the share of the cars bound for a place; the rest take what comes, as before
  const BACK = 2.5;           // a back street's metre against a main road's: through traffic keeps to the roads that carry it
  const NARROW = 1.6;         // and a surveyed carriageway under 5.5 m dearer again: one lane between kerbs, taken for its own sake only
  const ARRIVE = 110;         // a trip into town is over this near its place by road: the car park is round here, not on the place
  const QUIET = 3;            // a quiet street's or a single track's
  const NEAR_M = 250;         // a centre's street is this near it
  const SPREAD_M = 180;       // two centres' places are this far apart

  function create(net, { avoid = null, parkable = () => false, slow = () => 1, hour = () => 12, centres = [] } = {}) {
    const L = net.L, n = L.length;
    let seed = 90210;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const off = i => !!(avoid && avoid[i]);
    const endXY = (i, e) => { const p = L[i].pts, k = e ? p.length - 3 : 0; return [p[k], p[k + 1]]; };
    // a state: a piece driven one way (2 * piece + 1 as its points go, 2 * piece against them)
    const st = (i, d) => 2 * i + (d > 0 ? 1 : 0);
    const may = (i, d) => !off(i) && !(L[i].ow && L[i].ow !== d);
    const weight = i => { const l = L[i]; return Math.max(1, l.len) * (MAIN[l.c] ? 1 : BACK) * (l.cw > 0 && l.cw < 5.5 ? NARROW : 1) * (l.quiet ? QUIET : 1) * slow(i); };
    // where a state leads: the states a car may go on to from its far end
    const banned = (i, e, j, e2) => { const b = net.bans && net.bans.get(i * 2 + e); return !!b && b.some(q => q[0] === j && q[1] === e2); };
    const succ = new Array(2 * n), pred = new Array(2 * n);
    for (let s = 0; s < 2 * n; s++) { succ[s] = []; pred[s] = []; }
    for (let i = 0; i < n; i++) for (const d of [1, -1]) {
      if (!may(i, d)) continue;
      const e = d > 0 ? 1 : 0, [x, y] = endXY(i, e);
      for (const [j, e2] of net.nodes.get(net.key(x, y)) || []) {
        const d2 = e2 === 0 ? 1 : -1;
        if (j === i || !may(j, d2) || banned(i, e, j, e2)) continue;
        succ[st(i, d)].push(st(j, d2)); pred[st(j, d2)].push(st(i, d));
      }
    }
    // ---- the places
    const places = [];
    {
      // the gates on the main roads, one for each of eight ways out of the map, the highest road each way
      let cx = 0, cy = 0, m = 0;
      for (const c of centres) { cx += c[0]; cy += c[1]; m++; }
      if (m) { cx /= m; cy /= m; }
      const best = new Map();
      for (let i = 0; i < n; i++) {
        const l = L[i];
        if (!l.ends || !MAIN[l.c] || off(i)) continue;
        for (const e of [0, 1]) {
          if (l.ends[e] !== 1) continue;
          const d = e ? 1 : -1;
          if (!may(i, d)) continue;
          const [x, y] = endXY(i, e), k = Math.floor((Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI) * EDGES) % EDGES;
          const score = (RANK[l.c] || 1) * 1000 + Math.hypot(x - cx, y - cy) * 0.01, b = best.get(k);
          if (!b || score > b.score) best.set(k, { score, kind: 'edge', line: i, dir: d, x, y });
        }
      }
      for (const b of best.values()) places.push(b);
      // the streets by the named places: where a drive into town is bound is a street that carries traffic near the
      // place (the nearest with room at its kerb, else the nearest of 6 m or more that is not a trunk road), and no
      // two within SPREAD_M of each other: the labels crowd round a centre, and every trip would end at one corner.
      // Sent to the nearest back street instead, thirteen cars at a time made for one lane, and the block behind 109
      // locked in a ring, each junction waiting for room in the next (19 vehicles stood 150 s)
      const taken = new Set();
      for (const c of centres) {
        if (places.length >= EDGES + CENTRES) break;
        if (!(c[0] === c[0]) || places.some(q => q.kind === 'centre' && Math.hypot(q.cx - c[0], q.cy - c[1]) < SPREAD_M)) continue;
        let pick = -1, pd = Infinity, any = -1, ad = Infinity;
        for (const i of net.near(c[0], c[1], 0, NEAR_M)) {
          const l = L[i];
          if (off(i) || l.quiet || l.len < 20 || taken.has(i) || l.c === 'motorway' || l.c === 'trunk' || (!parkable(i) && (l.cw || 7) < 6)) continue;
          const q = l.pts, k = 3 * Math.floor(q.length / 6), dd = Math.hypot(q[k] - c[0], q[k + 1] - c[1]);
          if (dd > NEAR_M) continue;
          if (parkable(i) && dd < pd) { pd = dd; pick = i; }
          if (dd < ad) { ad = dd; any = i; }
        }
        const i = pick >= 0 ? pick : any;
        if (i < 0) continue;
        taken.add(i);
        const q = L[i].pts, k = 3 * Math.floor(q.length / 6);
        places.push({ kind: 'centre', line: i, dir: 0, x: q[k], y: q[k + 1], cx: c[0], cy: c[1] });
      }
    }
    const edges = places.map((p, i) => (p.kind === 'edge' ? i : -1)).filter(i => i >= 0);
    const towns = places.map((p, i) => (p.kind === 'centre' ? i : -1)).filter(i => i >= 0);
    // ---- a place's field: the cost from coming onto each piece, each way, to the place
    const fields = new Array(places.length).fill(null);
    function field(k) {
      if (fields[k]) return fields[k];
      const F = new Float32Array(2 * n).fill(Infinity), P = places[k];
      const heap = [];   // a binary heap of [cost, state]
      const push = (c, s) => { let i = heap.push([c, s]) - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= c) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } };
      const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
          heap[0] = last;
          for (let i = 0; ;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; }
        }
        return top;
      };
      // (an edge is reached on its gate's piece, driven out; a centre on its street, either way, half way along)
      if (P.kind === 'edge') { F[st(P.line, P.dir)] = 0; push(0, st(P.line, P.dir)); }
      else for (const d of [1, -1]) if (may(P.line, d)) { const c = weight(P.line) / 2; F[st(P.line, d)] = c; push(c, st(P.line, d)); }
      while (heap.length) {
        const [c, s] = pop();
        if (c > F[s]) continue;
        for (const q of pred[s]) { const c2 = c + weight(q >> 1); if (c2 < F[q]) { F[q] = c2; push(c2, q); } }
      }
      return (fields[k] = F);
    }
    const cost = (k, line, dir) => (k >= 0 && k < places.length && line >= 0 && line < n ? field(k)[st(line, dir)] : Infinity);
    // the share of the trips that go into town at an hour of the day
    const inbound = h => (h >= 6.5 && h < 9.5 ? 0.75 : h >= 16 && h < 19.5 ? 0.25 : h >= 22 || h < 5 ? 0.6 : 0.5);
    // a place for a car at (x, y): into town or out by the hour; into town, the part of town it is in more often than not
    function pick(x, y) {
      if (!places.length || rnd() >= BOUND) return -1;
      const town = towns.length && (!edges.length || rnd() < inbound(hour()));
      if (!town) return edges.length ? edges[Math.floor(rnd() * edges.length)] : -1;
      if (rnd() < 0.6 && towns.length > 3) {
        const near = towns.slice().sort((a, b) => Math.hypot(places[a].x - x, places[a].y - y) - Math.hypot(places[b].x - x, places[b].y - y)).slice(0, 3);
        return near[Math.floor(rnd() * near.length)];
      }
      return towns[Math.floor(rnd() * towns.length)];
    }
    // a place for a car setting out at (sx, sy) whose way runs past (cx, cy): of the places, one of the three nearest the
    // point as far beyond (cx, cy) as the car starts before it. The cars that come into the part of town the player stands
    // in come through it, as a main road's traffic does: bound for anywhere, they spread over the whole map and the
    // Scramble passed a seventh of its counted traffic, issue 204
    function across(sx, sy, cx, cy) {
      if (!places.length || rnd() >= BOUND) return -1;
      const tx = 2 * cx - sx, ty = 2 * cy - sy, near = [-1, -1, -1], nd = [Infinity, Infinity, Infinity];
      for (let k = 0; k < places.length; k++) {
        const d = Math.hypot(places[k].x - tx, places[k].y - ty);
        for (let m = 0; m < 3; m++) if (d < nd[m]) { for (let r = 2; r > m; r--) { nd[r] = nd[r - 1]; near[r] = near[r - 1]; } nd[m] = d; near[m] = k; break; }
      }
      const got = near.filter(k => k >= 0);
      return got.length ? got[Math.floor(rnd() * got.length)] : -1;
    }
    // the way along a two-way piece that its place lies (1, -1), four times in five; else 0, and chance decides
    function facing(k, line) {
      const a = cost(k, line, 1), b = cost(k, line, -1);
      if (a === b || rnd() >= 0.8) return 0;
      return a < b ? 1 : -1;
    }
    return { places, cost, pick, across, facing, inbound, hour, ARRIVE, fields: () => fields.filter(Boolean).length };
  }
  return { create };
})();
