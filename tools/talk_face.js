// Whether the words or the HUD cover the face of whoever is speaking (the owner's iPhone, 28 November 2026: at Mei's
// talk on the walk the dialogue's block lay over her chest and the clock, the date, the walk's line and the buttons over
// her hair and face). An init script for a page (hook) puts window.__talkFace() in it: at a talk with a speaker the talk
// camera is on (talkcam.js talk.speaker), the face as the screen has it, a box from the chin to the crown and a head's
// width, projected through the camera as it stands; and each visible element of the page that overlaps it: the dialogue's
// block, or any HUD element with something to show (text, a button, a picture), whatever its opacity on the way down
// from the body (an element faded out to 0.05 or less is not there to see). null when no one is spoken to on screen.
//   const face = require('./talk_face'); await p.addInitScript(face.hook); ... const r = await p.evaluate(() => window.__talkFace());
//   r: { who, face: [x0, y0, x1, y1] (CSS px), over: [{ what, share }] } (share: of the face's box covered)
'use strict';
const hook = () => {
  const seen = el => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity <= 0.05) return false; } return true; };
  const name = e => (e.id ? `#${e.id}` : '') + (e.className && typeof e.className === 'string' ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '') || e.tagName.toLowerCase();
  window.__talkFace = () => {
    const g = window.__game, T = window.THREE;
    if (!g || !T || !g.dlg || !g.dlg.open || !g.talkCam || !g.talkCam.on || !g.talkCam.talk || !g.talkCam.talk.speaker) return null;
    const sp = g.talkCam.talk.speaker, c = g.camera, cv = document.querySelector('#game-stage canvas') || document.querySelector('canvas');
    if (!c || !cv) return null;
    c.updateMatrixWorld();
    const R = cv.getBoundingClientRect(), eye = sp.eye || 1.58;
    // (the face: from the chin, 0.14 m under the eyes, to the crown, 0.16 over them, 0.11 to either side, square to the lens)
    // (the face the shot is composed on: the speaker's, or yours in the reverse over their shoulder, game.js talkShot)
    const ts = g.talkShot && g.talkShot(); if (!ts) return null; // (a shot drawn this frame: a talk camera left on under another view frames nobody)
    const sub = ts.subject, mine = !!sub && Math.hypot(sub[0] - sp.x, sub[1] - sp.y) > 0.5;
    const at = sub ? new T.Vector3(sub[0], sub[2], -sub[1]) : new T.Vector3(sp.x, sp.z + eye, -sp.y), right = new T.Vector3().setFromMatrixColumn(c.matrixWorld, 0).normalize();
    const pts = [];
    for (const [dx, dy] of [[-0.11, -0.14], [0.11, -0.14], [-0.11, 0.16], [0.11, 0.16]]) {
      const v = at.clone().addScaledVector(right, dx); v.y += dy; v.project(c);
      if (v.z > 1) return null;
      pts.push([R.left + (v.x + 1) / 2 * R.width, R.top + (1 - v.y) / 2 * R.height]);
    }
    const face = [Math.min(...pts.map(q => q[0])), Math.min(...pts.map(q => q[1])), Math.max(...pts.map(q => q[0])), Math.max(...pts.map(q => q[1]))];
    const fa = Math.max(1, (face[2] - face[0]) * (face[3] - face[1])), over = [];
    const stage = document.getElementById('game-stage') || document.body;
    const cands = [document.getElementById('gd'), ...stage.querySelectorAll('button, kbd, img, svg, canvas:not(:first-of-type), [role="img"], b, span, p, small, em, strong, i, h1, h2, h3, div')];
    const took = new Set();
    for (const e of cands) {
      if (!e || took.has(e) || e === cv || e.closest('canvas')) continue;
      // (what shows something: the dialogue's block as a whole, else an element with text of its own, a button or a picture)
      const own = e.id === 'gd' || /^(BUTTON|IMG|SVG|KBD)$/i.test(e.tagName) || [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.width * r.height > 0.8 * R.width * R.height) continue; // (not a veil laid over the whole frame)
      const ix = Math.min(r.right, face[2]) - Math.max(r.left, face[0]), iy = Math.min(r.bottom, face[3]) - Math.max(r.top, face[1]);
      if (ix <= 0 || iy <= 0 || (ix * iy) / fa < 0.02 || !seen(e)) continue; // (a sliver at the chin's edge of the box, under 2% of it, is not over the face)
      took.add(e); if (e.id === 'gd') e.querySelectorAll('*').forEach(x => took.add(x));
      over.push({ what: e.id === 'gd' ? 'the dialogue block' : `${name(e)} "${(e.textContent || '').trim().slice(0, 24)}"`, share: +((ix * iy) / fa).toFixed(2) });
    }
    return { who: mine ? `you (the reverse on ${sp.name || sp.id})` : sp.name || sp.id, face: face.map(v => Math.round(v)), over };
  };
  // (every talk of a play, twice a second: a face covered on two samples running, 0.5 s apart, is written once a talk in
  // window.__talkFaces; one sample alone is a cut or the words growing, not a frame a player reads)
  const bad = window.__talkFaces = [], count = window.__talkFaceSeen = { talks: 0, samples: 0 };
  let was = null, key = null;
  setInterval(() => {
    let r = null; try { r = window.__talkFace(); } catch (e) { r = null; }
    if (!r) { was = null; return; }
    const g = window.__game, k = `${r.who}|${g.story && g.story.state ? `${g.story.state.fi}|${g.story.state.phase}` : ''}`;
    if (k !== key) { key = k; count.talks++; }
    count.samples++;
    const now = r.over.length ? r.over.map(o => o.what).sort().join(';') : null;
    if (now && was === now && !bad.some(e => e.key === k)) bad.push({ key: k, who: r.who, face: r.face, over: r.over, at: g.story && g.story.state ? `frame ${g.story.state.fi + 1} ${g.story.state.phase}` : '' });
    was = now;
  }, 500);
};
module.exports = { hook };
