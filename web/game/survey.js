// survey.js: a part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").
// `g` is the rest of the game, by name. What this part asks of it:
//   A, B, BASE_FOV, DSM, H, MONTHS, SRC_TEXT, VP, W, cam, chasePolar, cine, clock, dlg, fmtMin, handOver, head,
//   labels, labelsEl, life, live, player, qs, renderPassport, save, scene, stage, surveyFov, surveyLabels, trigDone
// and what it gives back:
//   survey, viewshed
'use strict';
window.OEGameSurvey = function (g) {
  // ------------------------------------------------------------ surveying from a trig station
  // What can you see from here? A straight line of sight through the 2 m surface model
  // (with the Opera House shells and the bridge deck in it) to a point just under each
  // roof: the tallest part of every building within range.
  const roofs = (() => {
    const r = g.B.b.map(() => null);
    for (const sd of g.B.s) {
      const top = (sd[1] + sd[3]) / 10, ring = sd[4];
      if (r[sd[0]] && r[sd[0]][2] >= top) continue;
      let x = 0, y = 0;
      for (let k = 0; k < ring.length; k += 2) { x += ring[k]; y += ring[k + 1]; }
      r[sd[0]] = [x / (ring.length / 2) / 10, y / (ring.length / 2) / 10, top];
    }
    return r;
  })();
  function viewshed(ex, ey, ez, range) {
    const seen = [], { nx, ny, cell, x0, y1, data, ids } = g.DSM;
    for (let b = 0; b < roofs.length; b++) {
      const t = roofs[b];
      if (!t) continue;
      const dx = t[0] - ex, dy = t[1] - ey, d = Math.hypot(dx, dy);
      if (d > range || d < 4) continue;
      const tz = t[2] - 0.5, n = Math.ceil(d / 1.5);
      let ok = true;
      for (let i = 1; i < n; i++) {
        const f = i / n, c = Math.floor((ex + dx * f - x0) / cell), r = Math.floor((y1 - ey - dy * f) / cell);
        if (c < 0 || r < 0 || c >= nx || r >= ny) continue;
        const k = r * nx + c;
        if (data[k] > ez + (tz - ez) * f + 0.2) { ok = ids[k] === b; break; }
      }
      if (ok) seen.push(b);
    }
    return seen;
  }
  const SRC_GROUP = { mapped: 'surveyed', reference: 'surveyed', verified: 'surveyed', survey: 'surveyed', plateau: 'surveyed', plateau_lod1: 'surveyed', lidar: 'surveyed', bdtopo: 'surveyed', '3dbag': 'surveyed',
    floors: 'floors', ml: 'estimated', estimate: 'estimated', typical: 'estimated' };
  function survey(vp) {
    const ez = g.player.z + 1.6, seen = viewshed(g.player.x, g.player.y, ez, 3000);
    // label what is in sight: the named landmarks, then the tallest named buildings
    const named = seen.filter(b => g.B.b[b][0]).sort((a, b) => roofs[b][2] - roofs[a][2]);
    const marks = Object.entries(g.scene.labels || {}).map(([n, p]) => ({ n, p, b: named.find(b => g.B.b[b][0].startsWith(n)) })).filter(m => m.b != null);
    const extra = named.filter(b => !marks.some(m => m.b === b)).slice(0, 6).map(b => ({ n: g.B.b[b][0], p: roofs[b], b }));
    for (const m of [...marks, ...extra]) {
      // a parametric landmark's row is only its base; its label point carries its published height
      const row = g.B.b[m.b], para = row[4] === 'parametric', el = document.createElement('div');
      el.className = 'lbl npc survey';
      el.innerHTML = `${para ? m.n : row[0]}<span class="role">${para ? `${Math.round(m.p[2])} m · built from published dimensions`
        : `${Math.round(row[2])} m · ${{ surveyed: 'surveyed', floors: 'from floors', estimated: 'estimated' }[SRC_GROUP[row[4]]]}`}</span>`;
      el.hidden = true;
      g.labelsEl.appendChild(el);
      const at = para ? g.W(m.p[0], m.p[1], m.p[2] + 4) : g.W(roofs[m.b][0], roofs[m.b][1], roofs[m.b][2] + 4);
      g.surveyLabels.push({ el, get: () => at, maxD: 3200, survey: true });
    }
    g.labels.unshift(...g.surveyLabels);
    g.stage.classList.add('letterbox');
    g.A.chime();
    // You turn once round on the spot and the camera turns with you, over your right
    // shoulder with a longer lens, the horizon at eye level, then settles back into the
    // chase camera.
    g.cam.yaw = g.player.h;
    const c = g.head(), h0 = g.player.h, p0 = g.chasePolar(), pos = new THREE.Vector3(), lk = new THREE.Vector3();
    const round = k => {
      const b = Math.pow(Math.sin(Math.PI * k), 0.5), az = h0 + 2 * Math.PI * OECine.ease.inOut(k);
      g.player.h = az;
      OECine.around(c, az + Math.PI - 0.32 * b, OECine.lerp(p0.dist, 6, b), OECine.lerp(p0.h, 1, b), pos);
      OECine.around(c, az, 300 * b, -8 * b, lk); // the skyline ahead, just below eye level
      g.surveyFov = OECine.lerp(g.BASE_FOV, 34, b);
      return { pos, look: lk };
    };
    g.cine.play(OECine.mix(round, () => g.live, k => g.handOver(k, 0.92)), 11, { label: 'survey', onEnd: () => {
      g.player.h = g.cam.yaw = h0;
      g.stage.classList.remove('letterbox');
      for (const l of g.surveyLabels) { l.el.remove(); g.labels.splice(g.labels.indexOf(l), 1); }
      g.surveyLabels = [];
      fieldNotes(vp, ez, seen);
    } });
  }
  function fieldNotes(vp, ez, seen) {
    const first = !g.trigDone()[vp.id];
    g.trigDone()[vp.id] = true;
    if (g.life) g.life.emit('survey', { id: vp.id, name: vp.name, first });
    const done = g.VP.filter(v => g.trigDone()[v.id]).length, all = done === g.VP.length;
    const lines = [`${vp.name}: your eyes are ${Math.round(ez)} m above sea level, and ${seen.length.toLocaleString()} buildings are in sight within 3 km.`];
    const top = seen.filter(b => g.B.b[b][0] && g.B.b[b][4] !== 'parametric').sort((a, b) => g.B.b[b][2] - g.B.b[a][2])[0];
    if (top != null) lines.push(`The tallest in sight is ${g.B.b[top][0]}, ${Math.round(g.B.b[top][2])} m tall: ${g.SRC_TEXT[g.B.b[top][4]] || 'its height comes from the open data'}.`);
    const n = { surveyed: 0, floors: 0, estimated: 0 };
    for (const b of seen) if (SRC_GROUP[g.B.b[b][4]]) n[SRC_GROUP[g.B.b[b][4]]]++;
    const tot = n.surveyed + n.floors + n.estimated;
    if (tot) lines.push(`Of the heights in sight, ${Math.round(100 * n.surveyed / tot)}% are surveyed or published, ${Math.round(100 * n.floors / tot)}% come from floor counts and ${Math.round(100 * n.estimated / tot)}% are estimated.`);
    lines.push(all ? `That's every trig station: ${done} of ${done}. The Trig master stamp is yours.` : `Trig stations surveyed: ${done} of ${g.VP.length}.`);
    if (first && all && !g.qs.stamps.some(s => s.id === 'trig-master')) {
      g.qs.stamps.push({ id: 'trig-master', stamp: 'Trig master', title: 'Every trig station surveyed', at: `${g.clock.d} ${g.MONTHS[g.clock.m - 1]} ${g.fmtMin(g.clock.min)}` });
      g.A.chime(); g.A.thump();
      g.H.stamp('Trig master', 'Every trig station surveyed');
    }
    g.renderPassport();
    g.save();
    g.dlg.show({ name: 'Field notes', role: vp.name, color: '#a8740b', pitch: 330 }, lines);
  }
  return { survey, viewshed };
};
