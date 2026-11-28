// modeltext.js: a part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").
// `g` is the rest of the game, by name. What this part asks of it:
//   B, DSM, G, P, RAD, S, clock, colonies, dayLimits, fmtMin, fmtSec, nextFerry, scene, srnd, sun, touch, trainNext
// and what it gives back:
//   SRC_TEXT, centroid, fill, inPlace, placeByName, said, smalltalk
'use strict';
window.OEGameModelText = function (g) {
  // ------------------------------------------------------------ text from the model
  const areaShare = (() => {
    const a = {};
    let tot = 0;
    for (const s of g.B.s) { const r = s[4]; let q = 0; for (let k = 0, n = r.length / 2; k < n; k++) { const j = (k + 1) % n; q += r[2 * k] * r[2 * j + 1] - r[2 * j] * r[2 * k + 1]; } q = Math.abs(q) / 200; const src = g.B.b[s[0]][4]; a[src] = (a[src] || 0) + q; tot += q; }
    for (const k in a) a[k] = Math.round(1000 * a[k] / tot) / 10;
    return a;
  })();
  const placeByName = n => g.P.places.find(p => p.name === n);
  const inPlace = (pl, x, y) => {
    if (!pl) return false;
    for (const poly of pl.polygons) {
      let inside = false;
      for (const ring of poly) for (let k = 0, n = ring.length / 2, j = n - 1; k < n; j = k++) {
        const xi = ring[2 * k] / 10, yi = ring[2 * k + 1] / 10, xj = ring[2 * j] / 10, yj = ring[2 * j + 1] / 10;
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  };
  const centroid = pl => { let x = 0, y = 0, n = 0; for (const poly of pl.polygons) for (let k = 0; k < poly[0].length; k += 2) { x += poly[0][k] / 10; y += poly[0][k + 1] / 10; n++; } return [x / n, y / n]; };
  const sunLine = () => {
    if (!g.sun || g.sun.altitude <= 0) { const L = g.S.dayLimits(g.clock.y, g.clock.m, g.clock.d); return `The sun is down; it rises at ${g.fmtMin(L.sunrise)}.`; }
    return `The sun is ${g.sun.altitude.toFixed(0)}° up, so you cast a shadow ${(1.75 / Math.tan(g.sun.altitude * g.RAD)).toFixed(1)} m long.`;
  };
  const acc = g.scene.accuracy && g.scene.accuracy.summary;
  function fill(text) {
    return (text || '').replace(/\{([a-z_]+)(?::([^}]+))?\}/g, (all, kind, arg) => {
      if (kind === 'buildings') return g.B.b.length.toLocaleString();
      if (kind === 'time') return `${g.fmtMin(g.clock.min)} ${g.S.utcToLocal(g.S.localToUtc(g.clock.y, g.clock.m, g.clock.d, g.clock.min)).zone}`;
      if (kind === 'sun_line') return sunLine();
      // the next train out of Shibuya (game.json tonight.trains: the Yamanote's last and first): the last until it has gone,
      // then the first; and when (the walk's line: Nagi's)
      if (kind === 'train_at') return g.fmtMin(g.trainNext().at); // (its time by the clock: the corner's call, walktalk.js trainDue)
      if (kind === 'train' || kind === 'train_when') { const t = g.trainNext(); return kind === 'train' ? (t.first ? 'the first train' : 'the last train') : (t.first ? 'this morning' : 'tonight'); }
      if (kind === 'sunset') return g.fmtMin(g.dayLimits().sunset);
      // the part of the day and the season, in the guide's words ("this evening", "autumn"), for lines about what to see now
      if (kind === 'now') return !g.sun || g.sun.altitude < -6 ? 'tonight' : g.clock.min < 720 ? 'this morning' : g.sun.altitude < 12 && g.clock.min > 900 ? 'this evening' : 'this afternoon';
      if (kind === 'season') return ['winter', 'spring', 'summer', 'autumn'][(Math.floor((g.clock.m % 12) / 3) + (g.scene.frame.lat0 < 0 ? 2 : 0)) % 4];
      if (kind === 'penguins_from' || kind === 'penguins_to') { // when the first and the last rafts come in tonight
        const c = g.colonies[0] && g.colonies[0].colony;
        return c ? g.fmtMin(g.dayLimits().sunset + c.ashore_after_sunset_min[kind === 'penguins_from' ? 0 : 1]) : '–';
      }
      if (kind === 'share') return String(areaShare[arg] || 0);
      if (kind === 'acc') return acc && acc[arg] != null ? String(acc[arg]) : '–';
      if (kind === 'lidar') { const v = (arg.includes('.') ? arg : `survey.${arg}`).split('.').reduce((o, k) => (o == null ? o : o[k]), g.scene.lidar_check); return v == null ? '–' : String(v); }
      if (kind === 'landmark') { const v = arg.split('.').reduce((o, k) => (o == null ? o : o[k]), g.scene.landmarks); return typeof v === 'number' ? String(Math.round(v * 10) / 10) : String(v ?? '–'); }
      if (kind === 'sun') {
        const [name, md, hhmm] = arg.split('|'), pl = placeByName(name), [m, d] = md.split('-').map(Number);
        if (!pl) return '–';
        const smp = sampleCache[name] || (sampleCache[name] = g.S.samplePlace(g.DSM, pl.polygons, pl.area_m2 > 60000 ? 5 : 3));
        return String(Math.round(100 * g.S.fractionSunlit(g.DSM, smp, g.S.position(g.S.localToUtc(g.clock.y, m, d, g.S.hm(hhmm))))));
      }
      return all;
    });
  }
  const sampleCache = {};
  // a line as the player reads it: tokens filled, and on a touch screen without the keyboard's keys (the
  // walking and flying keys are the stick and the buttons there, and Q and G are the Lens and Guess buttons)
  function said(text) {
    const t = fill(text);
    if (!g.touch || !t) return t;
    return t.replace(/ ?\((?:a hand up at the kerb, )?Y\)/g, m => (m.includes('kerb') ? ' (a hand up at the kerb)' : ''))
      .replace(/\bpress Q\b/g, 'tap Lens').replace(/\bpress G\b/g, 'tap Guess').replace(/\(Q\)/g, '(Lens)')
      .split(/(?<=[.!?。])\s+/).filter(s => !/^(WASD|Space to climb|V (switches|is)|[A-Z] and [A-Z] )/.test(s)).join(' ').trim();
  }
  const SRC_TEXT = { mapped: 'its height is surveyed in OpenStreetMap', survey: 'its top level is surveyed by the mapping agency', lidar: 'its height was measured by an airborne LiDAR scan', '3dbag': 'its height was measured by the national airborne LiDAR and modelled in the 3DBAG', floors: 'its height is its floor count times a storey height', estimate: 'its height is estimated from its neighbours', typical: 'its height is the typical one for its kind (none is mapped)', plateau: 'its height was measured from the air for Project PLATEAU', plateau_lod1: 'its height is the block height in Project PLATEAU (no survey record)', bdtopo: 'its eaves were surveyed by IGN and its roof is the typical one',
    ml: 'its height is a machine-learning estimate, bias-corrected', reference: 'its height is the published figure (the open data was far too short)', verified: 'its height was checked by hand against a cited source', parametric: 'it is built from its published dimensions' };
  function smalltalk(x, y) {
    const opts = [`It's ${fill('{time}')}. ${sunLine()}`];
    // the nearest named building in view
    let best = null, bd = 160;
    for (const [name, p] of Object.entries(g.scene.labels || {})) { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = name; } }
    if (best) {
      const m = g.B.b.find(b => b[0] && (b[0] === best || b[0].startsWith(best)));
      if (m) opts.push(m[2] > 60 ? `That's ${best} up there, ${Math.round(m[2])} metres of it.` : `That's ${best}, just there.`);
    }
    const w = g.G.wharves.reduce((a, q) => (Math.hypot(q.terminal[0] - x, q.terminal[1] - y) < (a ? Math.hypot(a.terminal[0] - x, a.terminal[1] - y) : 400) ? q : a), null);
    if (w) { const e = g.nextFerry(w.id); if (e) opts.push(`The next ferry from ${w.name} is ${e.v.name}, ${e.t < 5 ? 'boarding now' : `in ${g.fmtSec(e.t)}`}.`); }
    opts.push(...(g.G.smalltalk || [g.G.greeting || 'G\'day.', 'Lovely spot, isn\'t it?']));
    return opts[Math.floor(g.srnd() * opts.length)];
  }
  return { SRC_TEXT, centroid, fill, inPlace, placeByName, said, smalltalk };
};
