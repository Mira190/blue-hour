// The trailers' director, run inside the game page by tools/trailer.js (docs/TRAILER.md). The map plays on as it does
// for a player (the crowd, the traffic, the signals, the rain, the lights), and the director takes the camera, the
// clock, the world's pace and the grade, stages what a shot needs (the story's people and dog, a thing of 1964, the
// helicopter, a train) and lays the trailer's type over the picture. Time is virtual (tools/film/clock.js): each frame
// is drawn on demand, however long software WebGL takes, so a shot moves exactly as written.
//
// A spec (tools/views/trailer-*.json) is a list of shots, one after another:
//   {id, dur, type, ...}   type is
//     orbit  {at, az: [from, to] (compass degrees of the camera from at), dist, h, look?}
//     move   {from, to, look | lookFrom + lookTo}                      a dolly, a crane or a drone's straight run
//     path   {path: [p, p, ...], look | lookPath: [p, ...]}             a curve through the points (a drone's flight)
//     card   {}                                                         black: only the type (nothing is drawn)
//   A point is [x, y, dz] (the map's metres; dz over the ground or deck there), [x, y, z, "abs"], ["@anchor", dx, dy,
//   dz] (scene.json's landmarks: "scramble", "hachiko", "shibuya_sky", "center_gai") or ["label:QFRONT", dx, dy, dz].
//   Any of dist, h, fov, roll (degrees) may be [from, to]; ease names the curve (glide, inOut, smooth, out, in, linear).
//   time      minutes after the blue hour on the spec's date (a number or [from, to]: a time-lapse), "HH:MM", or
//             {light: "night" | "blue" | "golden" ..., plus: minutes}
//   weather   "clear" | "rain" | "storm" ... (at once, as if it had been so for a while); strikes: [[k, {dist, bearing}]]
//   speed     the world's pace: a number, or [[k, pace], ...] (1 running, 0.2 slow motion, 0 time held: the Stop)
//   stop      {at: k, centre: point}: the Stop at k: the ring along the ground, the street drained and cold, the air held
//   crowd     "muster" (gathered at the Scramble's kerbs) or {at: point, r, n, clear}; signal: [[k, "red" | "green"]]
//   figures   [{who: "girl" | "old" | "tanaka" | "akira" | "detective" | "kanbara" | "tatsuo", at, face, walk: [k, point, speed]}]
//   dog       {at, face, go: [k, point, speed], standing}
//   relic     {model, at, h, from: k, over}: a thing of 1964, formed out of grain at k, laid over the whole picture
//   heli      [x, y, z, heading, pitch] (z over the datum); train: {at: [x, y], in: s, dir}
//   dof       {focus: point | metres, fstop, blur}: depth of field and the camera's motion blur
//   grade     {ev, sat, tint: [r, g, b], bloom, sky}: trims on the game's own grade for the hour
//   hand      0..1: a hand-held camera; shake: [[k, amount, seconds]]: a hit felt in the lens
//   fadeIn / fadeOut (seconds, from and to black), flash: [[k, seconds]] (to white and back)
//   text      [{at, until, kind, ...}] in k: kind "card" (centred), "title", "sub" (a line said), "stamp" (a place
//             and an hour), "counter" (frames left), "finder" (the camera's bright lines), "end" (the closing plate)
//   stand     where the player is put (out of sight) so that the map is built and peopled round the shot: a point
'use strict';
window.OETrailer = (function () {
  const RAD = Math.PI / 180;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const EASE = {
    linear: t => t,
    glide: t => { const a = 0.18; return t < a ? t * t / (2 * a * (1 - a)) : t > 1 - a ? 1 - (1 - t) * (1 - t) / (2 * a * (1 - a)) : (t - a / 2) / (1 - a); },
    inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    out: t => 1 - Math.pow(1 - t, 3),
    in: t => t * t * t,
    smooth: t => t * t * t * (t * (6 * t - 15) + 10),
    sine: t => 0.5 - 0.5 * Math.cos(Math.PI * t),
  };
  const ch = (v, k, e) => (Array.isArray(v) ? lerp(v[0], v[1], e(k)) : v);
  // keys [[k, v], ...] read at k, linearly between them
  const keyed = (keys, k, def) => {
    if (keys == null) return def;
    if (!Array.isArray(keys)) return keys;
    if (k <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (k <= keys[i][0]) { const [k0, v0] = keys[i - 1], [k1, v1] = keys[i]; return lerp(v0, v1, EASE.sine(clamp((k - k0) / Math.max(1e-6, k1 - k0)))); }
    return keys[keys.length - 1][1];
  };
  // smooth value noise for a hand-held camera
  const nz = (t, seed) => { let v = 0, a = 1; for (let o = 0; o < 3; o++) { v += Math.sin(t * (0.9 + o * 1.7) * (1 + seed * 0.13) + seed * 7.1 + o * 2.3) * a; a *= 0.5; } return v / 1.75; };

  let G, T3, spec, shots = [], total = 0, cur = null, ov = null, sfx = null, year = 2026, date = [10, 10];
  const pose = { pos: null, look: null, roll: 0, fov: 40 };
  let fx = null, wxKey = '', staged = [], dog = null, relic = null, stopOn = false, frameDt = 1 / 24, drawing = true;
  const struck = new Set(), fired = new Set();

  // ------------------------------------------------------------------ places
  function floor(x, y) {
    const nav = G.nav;
    let z0 = Math.max(0, nav.terrain(x, y));
    for (const st of nav.strips) { const h = st.drape ? nav.stripHeight(st, x, y) : null; if (h != null && h > z0) z0 = h; }
    const f = nav.floorAt(x, y, z0 + 1);
    return f ? f.z : z0;
  }
  function anchor(name) {
    const sc = G.scene || {};
    if (name.startsWith('label:')) {
      const want = name.slice(6), L = sc.labels || {}, k = Object.keys(L).find(n => n === want) || Object.keys(L).find(n => n.startsWith(want));
      if (!k) throw new Error(`trailer: no label ${want}`);
      return [L[k][0], L[k][1], floor(L[k][0], L[k][1])];
    }
    const v = (sc.landmarks || {})[name];
    if (!v) throw new Error(`trailer: no landmark ${name}`);
    const xy = v.node || v.at || v.centre;
    const z = typeof v.deck_z === 'number' ? v.deck_z : typeof v.z === 'number' ? v.z : floor(xy[0], xy[1]);
    return [xy[0], xy[1], z];
  }
  const memo = new Map();
  function point(p) {
    if (!p) return null;
    const key = JSON.stringify(p);
    if (memo.has(key)) return memo.get(key).slice();
    let out;
    if (typeof p[0] === 'string') { const a = anchor(p[0].replace(/^@/, '')); out = [a[0] + (p[1] || 0), a[1] + (p[2] || 0), a[2] + (p[3] || 0)]; }
    else if (p[3] === 'abs') out = p.slice(0, 3);
    else out = [p[0], p[1], floor(p[0], p[1]) + (p[2] || 0)];
    memo.set(key, out);
    return out.slice();
  }
  const W = (x, y, z) => new T3.Vector3(x, z, -y);
  const Wp = p => W(p[0], p[1], p[2]);
  // a Catmull-Rom curve through points, at u in 0..1 (by the points' index: spacing sets the speed)
  function curve(pts, u) {
    const n = pts.length - 1, f = clamp(u) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
    const P = j => pts[Math.max(0, Math.min(n, j))];
    const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2), t2 = t * t, t3 = t2 * t;
    return [0, 1, 2].map(q => 0.5 * (2 * b[q] + (-a[q] + c[q]) * t + (2 * a[q] - 5 * b[q] + 4 * c[q] - d[q]) * t2 + (-a[q] + 3 * b[q] - 3 * c[q] + d[q]) * t3));
  }

  // ------------------------------------------------------------------ the overlay: the trailer's type
  function overlay() {
    const st = document.createElement('style');
    st.textContent = `
#tr-ov { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; overflow: hidden; --paper: #f4f1ea; --amber: #ffcf8a; --cold: #bcd0ff; font-size: calc(100vh / 80); }
#tr-ov > * { position: absolute; inset: 0; }
#tr-black { background: #000; opacity: 0; }
#tr-white { background: #f6f3ee; opacity: 0; mix-blend-mode: normal; }
#tr-veil { position: fixed; inset: 0; z-index: 2147482999; pointer-events: none; opacity: 0; background: radial-gradient(ellipse at 50% 45%, #e6edff 35%, #8e9fdc 100%); mix-blend-mode: multiply; }
#tr-vig { background: radial-gradient(ellipse 75% 85% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%); }
#tr-text > div { position: absolute; inset: 0; display: grid; place-items: center; opacity: 0; will-change: opacity, filter, transform; }
.tr-card { text-align: center; color: var(--paper); }
.tr-card small { display: block; font: 400 1.25em/1 "JetBrains Mono", monospace; letter-spacing: 0.5em; margin-right: -0.5em; text-transform: uppercase; color: var(--amber); }
.tr-card small::after { content: ""; display: block; width: 3.2em; height: 1px; margin: 2.2em auto 2.4em; background: rgba(255, 207, 138, 0.6); }
.tr-card span { display: block; font: 200 4.6em/1.12 "Zalando Sans Expanded", sans-serif; letter-spacing: var(--ls, 0.3em); margin-right: calc(-1 * var(--ls, 0.3em)); text-transform: uppercase; text-shadow: 0 0 2.4em rgba(120, 150, 255, 0.25), 0 0.2em 3em rgba(0, 0, 0, 0.8); }
.tr-card span.big { font-size: 6.4em; }
.tr-card span.jp { font: 500 3.4em/1.3 "Shippori Mincho", serif; letter-spacing: 0.4em; margin-right: -0.4em; text-transform: none; }
.tr-card em { display: block; margin-top: 1.8em; font: 400 2.2em/1.3 "Newsreader", serif; font-style: normal; color: rgba(244, 241, 234, 0.82); letter-spacing: 0.02em; }
.tr-over { background: radial-gradient(ellipse 55% 40% at 50% 50%, rgba(2, 4, 12, 0.55), rgba(2, 4, 12, 0) 100%); }
.tr-sub { place-items: end center !important; padding-bottom: 9vh; text-align: center; }
.tr-sub div { color: var(--paper); text-shadow: 0 0.1em 1.2em #000, 0 0 0.25em rgba(0,0,0,0.9); }
.tr-sub b { display: block; font: 500 2.9em/1.3 "Shippori Mincho", serif; letter-spacing: 0.24em; margin-right: -0.24em; color: var(--cold); }
.tr-sub i { display: block; margin-top: 0.4em; font: 400 2.9em/1.3 "Newsreader", serif; font-style: normal; letter-spacing: 0.01em; }
.tr-sub i.warm { color: var(--amber); }
.tr-sub i.cold { color: #9fc4ff; }
.tr-stamp { place-items: end start !important; padding: 0 0 7vh 5.5vw; }
.tr-stamp div { font: 400 1.25em/1.6 "JetBrains Mono", monospace; letter-spacing: 0.36em; text-transform: uppercase; color: rgba(244, 241, 234, 0.92); text-shadow: 0 0 0.8em #000; }
.tr-stamp div::before { content: ""; display: inline-block; width: 0.55em; height: 0.55em; border-radius: 50%; background: var(--amber); margin-right: 1.1em; box-shadow: 0 0 0.8em var(--amber); vertical-align: 0.05em; }
.tr-stamp div span { display: block; margin-left: 1.65em; color: var(--amber); letter-spacing: 0.3em; }
.tr-title { text-align: center; }
.tr-title .t { position: relative; font: 200 11.5em/1 "Zalando Sans Expanded", sans-serif; letter-spacing: var(--ls, 0.36em); margin-right: calc(-1 * var(--ls, 0.36em)); color: #fbfaf7; text-transform: uppercase;
  text-shadow: 0 0 0.12em rgba(255, 255, 255, 0.45), 0 0 0.6em rgba(140, 170, 255, 0.45), 0 0 1.6em rgba(80, 110, 255, 0.35); }
.tr-title .streak { position: absolute; left: 50%; top: 50%; width: 120vw; height: 0.5vh; margin: -0.25vh 0 0 -60vw; background: radial-gradient(ellipse 50% 50% at 50% 50%, rgba(170, 195, 255, 0.95), rgba(90, 120, 255, 0.35) 40%, rgba(60, 80, 255, 0) 70%); filter: blur(0.25vh); mix-blend-mode: screen; }
.tr-title small { display: block; margin-top: 3.4em; font: 400 1.35em/1 "JetBrains Mono", monospace; letter-spacing: 0.62em; margin-right: -0.62em; text-transform: uppercase; color: var(--amber); }
.tr-title .jp { display: block; margin-top: 1.6em; font: 500 2.2em/1 "Shippori Mincho", serif; letter-spacing: 1.1em; margin-right: -1.1em; color: rgba(244, 241, 234, 0.8); }
.tr-counter { text-align: center; color: var(--paper); }
.tr-counter b { display: block; font: 200 16em/1 "Zalando Sans Expanded", sans-serif; letter-spacing: 0; color: #fbfaf7; text-shadow: 0 0 0.4em rgba(255, 207, 138, 0.35); }
.tr-counter small { display: block; margin-top: 1.6em; font: 400 1.3em/1 "JetBrains Mono", monospace; letter-spacing: 0.6em; margin-right: -0.6em; text-transform: uppercase; color: var(--amber); }
.tr-finder > i { position: absolute; inset: 12% 22%; --l: rgba(244, 239, 230, 0.95); background:
  linear-gradient(var(--l), var(--l)) 0 0 / 3.4em 2px no-repeat, linear-gradient(var(--l), var(--l)) 0 0 / 2px 3.4em no-repeat,
  linear-gradient(var(--l), var(--l)) 100% 0 / 3.4em 2px no-repeat, linear-gradient(var(--l), var(--l)) 100% 0 / 2px 3.4em no-repeat,
  linear-gradient(var(--l), var(--l)) 0 100% / 3.4em 2px no-repeat, linear-gradient(var(--l), var(--l)) 0 100% / 2px 3.4em no-repeat,
  linear-gradient(var(--l), var(--l)) 100% 100% / 3.4em 2px no-repeat, linear-gradient(var(--l), var(--l)) 100% 100% / 2px 3.4em no-repeat; filter: drop-shadow(0 0 3px rgba(0,0,0,0.8)); }
.tr-finder > i::after { content: ""; position: absolute; left: 50%; top: 50%; width: 7.4em; height: 5em; margin: -2.5em 0 0 -3.7em; border-radius: 3px; background: rgba(255, 207, 138, 0.3); box-shadow: inset 0 0 0 1.5px var(--amber), 0 0 2.6em rgba(255, 207, 138, 0.5); }
.tr-finder > u { position: absolute; left: 22%; right: 22%; bottom: calc(12% - 3.2em); display: flex; justify-content: space-between; font: 400 1.15em/1 "JetBrains Mono", monospace; letter-spacing: 0.34em; text-transform: uppercase; color: var(--amber); text-decoration: none; text-shadow: 0 0 0.8em #000; }
.tr-end { text-align: center; color: var(--paper); }
.tr-end .t { font: 200 6.4em/1 "Zalando Sans Expanded", sans-serif; letter-spacing: 0.36em; margin-right: -0.36em; text-transform: uppercase; text-shadow: 0 0 1em rgba(120, 150, 255, 0.35); }
.tr-end small { display: block; margin-top: 3em; font: 400 1.3em/1 "JetBrains Mono", monospace; letter-spacing: 0.5em; margin-right: -0.5em; text-transform: uppercase; color: var(--amber); }
.tr-end p { margin: 1.6em 0 0; font: 400 1.9em/1.5 "Inter Tight", sans-serif; letter-spacing: 0.08em; color: rgba(244, 241, 234, 0.78); }
.tr-end p.url { margin-top: 2.4em; font: 400 1.35em/1 "JetBrains Mono", monospace; letter-spacing: 0.3em; color: rgba(244, 241, 234, 0.9); }
`;
    document.head.appendChild(st);
    ov = document.createElement('div');
    ov.id = 'tr-ov';
    ov.innerHTML = '<div id="tr-vig"></div><div id="tr-black"></div><div id="tr-text"></div><div id="tr-white"></div>'; // (the type over the black of a card)
    // (the Stop's veil multiplies the picture under it: it must be in the page's own stacking context, beside the
    // stage, not inside the overlay's, where it had only the overlay's empty backdrop and laid a pale blue fog over all)
    const veil = document.createElement('div');
    veil.id = 'tr-veil';
    document.body.appendChild(veil);
    document.body.appendChild(ov);
  }
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function textHtml(q) {
    const k = q.kind || 'card';
    if (k === 'card') return `<div class="tr-card">${q.eyebrow ? `<small>${esc(q.eyebrow)}</small>` : ''}${(Array.isArray(q.text) ? q.text : [q.text]).map(l => `<span class="${q.big ? 'big' : ''}${/[぀-ヿ一-鿿]/.test(l) && !/[A-Z]/.test(l) ? ' jp' : ''}">${esc(l)}</span>`).join('')}${q.line ? `<em>${esc(q.line)}</em>` : ''}</div>`;
    if (k === 'sub') return `<div>${q.jp ? `<b>${esc(q.jp)}</b>` : ''}${q.text ? `<i class="${q.warm ? 'warm' : q.cold ? 'cold' : ''}">${esc(q.text)}</i>` : ''}</div>`;
    if (k === 'stamp') return `<div>${esc(q.text)}${q.line ? `<span>${esc(q.line)}</span>` : ''}</div>`;
    if (k === 'title') return `<div class="tr-title"><div class="t">${esc(q.text)}<i class="streak"></i></div>${q.jp ? `<span class="jp">${esc(q.jp)}</span>` : ''}${q.line ? `<small>${esc(q.line)}</small>` : ''}</div>`;
    if (k === 'counter') return `<div class="tr-counter"><b>${esc(q.text)}</b>${q.line ? `<small>${esc(q.line)}</small>` : ''}</div>`;
    if (k === 'finder') return `<i></i><u><span>${esc(q.left || '')}</span><span>${esc(q.right || '')}</span></u>`;
    if (k === 'end') return `<div class="tr-end"><div class="t">${esc(q.text)}</div>${q.line ? `<small>${esc(q.line)}</small>` : ''}${(q.lines || []).map(l => `<p>${esc(l)}</p>`).join('')}${q.url ? `<p class="url">${esc(q.url)}</p>` : ''}</div>`;
    return esc(q.text || '');
  }
  function buildText(s) {
    const box = ov.querySelector('#tr-text');
    box.innerHTML = '';
    s._text = (s.text || []).map(q => {
      const el = document.createElement('div');
      el.className = `tr-${q.kind || 'card'}${q.over ? ' tr-over' : ''}`;
      el.innerHTML = textHtml(q);
      box.appendChild(el);
      return { q, el };
    });
  }
  // each piece of type at time t of its shot: in over `fade` seconds (from a blur, a little large), out the same way;
  // the tracking of a card's words widens slowly while it is up (the breath of a trailer's card)
  function drawText(s, k) {
    for (const { q, el } of s._text || []) {
      const t = k * s.dur, a = (q.at ?? 0) * s.dur, b = (q.until ?? 1) * s.dur, fi = q.fadeIn ?? q.fade ?? 0.45, fo = q.fadeOut ?? q.fade ?? 0.45;
      const tin = fi > 0 ? clamp((t - a) / fi) : (t >= a ? 1 : 0), tout = fo > 0 ? clamp((b - t) / fo) : (t <= b ? 1 : 0), o = Math.min(tin, tout);
      el.style.opacity = (t < a || t > b) ? 0 : EASE.smooth(o);
      const life = clamp((t - a) / Math.max(0.01, b - a)), blur = (1 - EASE.out(tin)) * (q.blur ?? 0.7) + (1 - EASE.out(tout)) * (q.blur ?? 0.7);
      const sc = (q.zoom ?? 0.035) * (1 - life) + 1;
      el.style.filter = blur > 0.01 ? `blur(${blur.toFixed(2)}vh)` : 'none';
      el.style.transform = q.kind === 'finder' ? 'none' : `scale(${sc.toFixed(4)})`;
      el.style.setProperty('--ls', `${(q.ls0 ?? (q.kind === 'title' ? 0.6 : 0.26)) + ((q.ls1 ?? (q.kind === 'title' ? 0.36 : 0.34)) - (q.ls0 ?? (q.kind === 'title' ? 0.6 : 0.26))) * EASE.out(life)}em`);
      if (q.kind === 'title') { const st = el.querySelector('.streak'); if (st) { const g = clamp((t - a) / 0.9); st.style.opacity = (1 - g) * 0.95 + 0.25 * (1 - life); st.style.transform = `scaleX(${(0.2 + 1.3 * EASE.out(g)).toFixed(3)})`; } }
    }
  }

  // ------------------------------------------------------------------ setup
  function hideAllBut(keep) {
    // every element of the page but the picture and the overlay out of sight: the HUD, the walk's panel, the prompts
    let el = keep;
    while (el && el !== document.body) {
      for (const sib of el.parentElement.children) if (sib !== el && sib !== ov && sib.id !== 'tr-veil' && sib.tagName !== 'SCRIPT' && sib.tagName !== 'STYLE') sib.style.setProperty('visibility', 'hidden', 'important');
      el = el.parentElement;
    }
  }
  function setup(s) {
    spec = s;
    G = window.__game; T3 = window.THREE;
    pose.pos = new T3.Vector3(); pose.look = new T3.Vector3();
    year = s.year || G.clock.y; date = s.date || [10, 10];
    overlay();
    const canvas = document.getElementById('game-gl');
    hideAllBut(canvas);
    for (const id of ['g-title', 'g-menu', 'g-bigmap', 'g-pass']) { const el = document.getElementById(id); if (el) el.hidden = true; }
    if (G.cine.active) G.cine.stop();
    G.clock.frozen = true;
    if (G.crowdAuto) G.crowdAuto(false);
    G.crowd.active = G.crowd.P.length;
    if (G.cars && G.cars.C) G.cars.active = G.cars.C.length;
    // the film's own focal lengths (the game sets its own each frame)
    const cam = G.camera, upm = cam.updateProjectionMatrix.bind(cam);
    cam.updateProjectionMatrix = () => { cam.fov = pose.fov; upm(); };
    cam.near = 0.25; cam.far = 60000;
    // the frame is drawn from the director's pose, whatever the game's camera did this frame (held, it does nothing)
    const atm = G.atmos, draw = atm.render.bind(atm), camFx = atm.camFx.bind(atm);
    atm.camFx = () => camFx(fx);
    atm.render = (scene, c) => {
      if (!drawing) return undefined; // (a shot's set waiting for what it loads: the frames run, nothing is drawn)
      // the player stands where the map is to be built round the shot, out of sight: the game shows them again each
      // frame (a shot that put them a step in front of the lens had their back filling a third of the picture)
      if (G.player.rig) G.player.rig.root.visible = false;
      c.position.copy(pose.pos); c.up.set(0, 1, 0); c.lookAt(pose.look);
      if (pose.roll) c.rotateZ(pose.roll * RAD);
      if (c.fov !== pose.fov) { c.fov = pose.fov; c.updateProjectionMatrix(); }
      c.updateMatrixWorld();
      camFx(fx);
      return draw(scene, c);
    };
    G.cine.play(() => pose, 1e9, { label: 'film' });
    // the story's dog, made from the episode's own (the guide of the first Stop), held until a shot asks for him
    const gd = G.G && G.G.story && G.G.story.episodes[0].guide;
    if (gd && G.makeGuide) { dog = G.makeGuide(gd); if (dog && dog.root) dog.root.visible = false; }
    // the air of a stopped world: its own, ticked here (stopfx.js)
    sfx = window.OEStopFX ? OEStopFX.create({ THREE: T3, world: G.world, audio: () => null, sound: () => false }) : null;
    let T = 0;
    shots = s.shots.map(q => { const o = Object.assign({}, q, { t0: T }); T += q.dur; return o; });
    total = T;
    return { total, shots: shots.map(q => ({ id: q.id, t0: q.t0, dur: q.dur, type: q.type })) };
  }
  const shotAt = t => { let s = shots[0]; for (const q of shots) if (t >= q.t0 - 1e-6) s = q; return s; };

  // ------------------------------------------------------------------ the cast
  const ep = () => G.G.story.episodes[0];
  function castOf(who) {
    const E = ep(), fr = E.frames;
    const a = { girl: fr[0].afterimage, detective: fr[2].afterimage, kanbara: fr[3].afterimage, tatsuo: fr[4].afterimage, akira: fr[5].afterimage }[who];
    if (a) return a;
    const c = (E.cast || []).find(q => q.id === who);
    if (c) return Object.assign({ alive: true }, c);
    throw new Error(`trailer: nobody called ${who}`);
  }
  function clearStage() {
    for (const q of hiddenNpcs.splice(0)) if (q.rig && q.rig.root) q.rig.root.visible = true;
    for (const f of staged) f.remove();
    staged = [];
    if (relic) { relic.remove(); relic = null; }
    if (G.past) { G.past.whole(false); if (G.past.rect) G.past.rect(null); }
    if (dog && dog.root) { dog.root.visible = false; dog._on = false; }
  }
  function stage(s) {
    clearStage();
    for (const q of s.figures || []) {
      const at = point(q.at), a = castOf(q.who), f = G.storyFigure(a, at);
      f._q = q;
      // (made before their model has come, they are a stand-in until it does: the player's own body, in their place)
      f._standin = !!(G.peopleLib && !G.peopleLib.tpl[a.character]);
      if (q.face) { const fc = q.face === 'cam' ? [pose.pos.x, -pose.pos.z] : point(q.face); f.face(fc[0], fc[1]); f.face(fc[0], fc[1]); }
      for (let i = 0; i < 20; i++) f.animate(1 / 30);
      staged.push(f);
    }
    if (s.dog && dog) {
      const at = point(s.dog.at), fc = s.dog.face ? point(s.dog.face) : [at[0], at[1] + 1];
      dog.place(at[0], at[1], Math.atan2(fc[0] - at[0], fc[1] - at[1]), s.dog.standing !== false);
      dog._on = true; dog._go = false;
    }
    if (s.relic && G.past) {
      const r = s.relic, at = point(r.at);
      relic = G.past.relic(r.model, W(at[0], at[1], at[2] + (r.dz || 0.02)), (r.h || 0) * RAD, { over: !!r.over, scale: r.scale || 1 });
      G.past.whole(false);
    }
  }

  // ------------------------------------------------------------------ the world round a shot
  function minutesOf(s, k) {
    const tm = s.time ?? spec.time ?? 0;
    const blue = Sun.presetTime('blue', year, date[0], date[1]);
    const one = v => {
      if (typeof v === 'number') return blue + v;
      if (typeof v === 'string') { const [h, m] = v.split(':').map(Number); return h * 60 + m; }
      return Sun.presetTime(v.light || 'blue', year, date[0], date[1]) + (v.plus || 0);
    };
    if (Array.isArray(tm)) return lerp(one(tm[0]), one(tm[1]), EASE[s.timeEase || 'linear'](k));
    return one(tm);
  }
  function placeCrowd(c, cam) {
    if (c === 'muster') { if (G.musterScramble) G.musterScramble(); return; }
    const C = G.crowd, net = G.footNet, at = point(c.at), cand = net.near(at[0], at[1], 0, c.r || 90), tmp = {};
    if (!cand.length) return;
    let seed = c.seed || 7;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    C.active = Math.min(C.P.length, c.n || C.P.length);
    for (const q of C.P.slice(0, C.active)) {
      if (q.seat) { q.seat.by = -1; q.seat = null; }
      q.state = 'walk'; q.mode = 'ground'; q.lat = null; q.pause = 0; q.dodge = 0;
      for (let i = 0; i < 12; i++) {
        q.line = cand[Math.floor(rnd() * cand.length)]; q.s = rnd() * net.L[q.line].len; net.at(q.line, q.s, tmp);
        if (!cam || Math.hypot(tmp.x - cam[0], tmp.y - cam[1]) >= (c.clear ?? 4)) break;
      }
      q.dir = rnd() < 0.5 ? 1 : -1; q.x = tmp.x; q.y = tmp.y; q.z = tmp.z;
    }
  }
  function scramble() { const P = G.junctions && G.junctions.J; return P ? P.find(q => q.scramble) : null; }
  function signal(s, name) {
    const j = scramble();
    if (!j || !G.junctions.walkIn) return;
    if (name === 'red') {
      let g = null;
      for (const [ck, n] of s.signal || []) if (n === 'green') g = (ck * s.dur) - 0;
      G.junctions.walkIn(j, g != null ? Math.max(0.1, g) : 6);
      if (G.cars && G.cars.clearBox) G.cars.clearBox(j.x, j.y, 45);
      if (G.musterScramble) G.musterScramble();
    }
    if (name === 'green') G.junctions.walkIn(j, -0.01);
  }
  // the helicopter where the shot puts it ([x, y, z, heading, pitch, roll], z over the datum), or along {from, to} by k:
  // flown by the film (vehicles.js st.scripted), its rotor turning and its lights on
  function heliPut(v, k = 0, dt = 1e-4) {
    const H = G.heli;
    if (!v || !H) return;
    const q = Array.isArray(v) ? v : v.from.map((a, i) => lerp(a, v.to[i], EASE[v.ease || 'linear'](k)));
    const st = H.st;
    [st.x, st.y, st.z] = q; st.h = (q[3] || 0) * RAD; st.pitch = (q[4] || 0) * RAD; st.roll = (q[5] || 0) * RAD;
    st.vx = st.vy = st.vz = 0; st.yawRate = 0; st.on = true; st.landed = false; st.rotor = 1; st.scripted = true;
    H.update(dt, {}, []); H.group.visible = true;
  }

  // "clear": [half_angle_deg, metres, near]: nobody in that wedge ahead of the lens out to that distance, and nobody
  // within `near` of it: they are sent behind the camera, out of the frame (key_shot.js has the same)
  function clearWedge([ha, R, near = 2.5]) {
    const ex = pose.pos.x, ey = -pose.pos.z, ax = Math.atan2(pose.look.x - ex, -pose.look.z - ey);
    let n = 0;
    for (const q of G.crowd.P.slice(0, G.crowd.active)) {
      const dx = q.x - ex, dy = q.y - ey, d = Math.hypot(dx, dy);
      let da = Math.atan2(dx, dy) - ax; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (d < near || (d < R && Math.abs(da) < ha * RAD)) { q.x = ex - Math.sin(ax) * (40 + n); q.y = ey - Math.cos(ax) * (40 + n); n += 1.5; }
    }
    // and the map's own people standing there (game.npcs, not the crowd): out of sight for the shot
    for (const q of G.npcs || []) {
      if (!q.rig || !q.rig.root) continue;
      const dx = q.x - ex, dy = q.y - ey, d = Math.hypot(dx, dy);
      let da = Math.atan2(dx, dy) - ax; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (d < near || (d < R && Math.abs(da) < ha * RAD)) { q.rig.root.visible = false; hiddenNpcs.push(q); }
    }
  }
  const hiddenNpcs = [];
  // "clearAround": [point, r]: nobody of the crowd within r of there (round someone the shot is of)
  function clearAround([p, r]) {
    const c = point(p), ex = pose.pos.x, ey = -pose.pos.z, ax = Math.atan2(pose.look.x - ex, -pose.look.z - ey);
    let n = 0;
    for (const q of G.crowd.P.slice(0, G.crowd.active)) if (Math.hypot(q.x - c[0], q.y - c[1]) < r) { q.x = ex - Math.sin(ax) * (60 + n); q.y = ey - Math.cos(ax) * (60 + n); n += 1.5; }
  }
  // a shot begins: the clock, the weather, the player (out of sight, where the map is to be built), the crowd, the cast
  function enter(s) {
    wxKey = ''; fired.clear();
    if (s.type === 'card') return;
    G.setClock(year, date[0], date[1], minutesOf(s, 0));
    if (G.weather && G.weather.set) G.weather.set(s.weather || spec.weather || 'clear', { now: true });
    shotPose(s, 0);
    const st = s.stand ? point(s.stand) : [pose.look.x, -pose.look.z, 0];
    const sp = s.stand ? st : [st[0], st[1], floor(st[0], st[1])];
    const P = G.player;
    P.x = sp[0]; P.y = sp[1]; P.z = sp[2];
    if (P.rig) P.rig.root.visible = false;
    if (s.crowd) placeCrowd(s.crowd, [pose.pos.x, -pose.pos.z]);
    else if (G.crowd) G.crowd.active = G.crowd.P.length;
    if (s.clear) clearWedge(s.clear);
    if (s.clearAround) clearAround(s.clearAround);
    if (s.clear_cars && G.cars && G.cars.clearBox) { const c = point(s.clear_cars); G.cars.clearBox(c[0], c[1], s.clear_cars[3] || 30); }
    if (s.train && G.rail && G.rail.cue) G.rail.cue(G.rail.sNear(s.train.at[0], s.train.at[1]), s.train.in ?? 6, s.train.dir || 0);
    if (G.heli) { if (s.heli) { G.heli.want(); G.heli.show(); heliPut(s.heli); } }
    stage(s);
    if (sfx) { sfx.release(); sfx.tick(10, 1, Wp(sp)); if (s.air) sfx.air(Wp(sp), s.air); }
    stopOn = false;
    G.hold(false);
  }

  // ------------------------------------------------------------------ the camera
  function shotPose(s, k) {
    const e = EASE[s.ease || 'glide'];
    if (s.type === 'orbit') {
      const at = point(s.at), az = ch(s.az, k, e) * RAD, d = ch(s.dist, k, e), h = ch(s.h, k, e);
      pose.pos.copy(W(at[0] + Math.sin(az) * d, at[1] + Math.cos(az) * d, at[2] + h));
      pose.look.copy(Wp(s.look ? point(s.look) : at));
      if (s.lookRise) pose.look.y += ch(s.lookRise, k, e);
    } else if (s.type === 'move') {
      pose.pos.lerpVectors(Wp(point(s.from)), Wp(point(s.to)), e(k));
      if (s.look) pose.look.copy(Wp(point(s.look)));
      else if (s.lookFrom) pose.look.lerpVectors(Wp(point(s.lookFrom)), Wp(point(s.lookTo)), e(k));
    } else if (s.type === 'path') {
      const P = s.path.map(point), u = e(k);
      pose.pos.copy(Wp(curve(P, u)));
      if (s.lookPath) pose.look.copy(Wp(curve(s.lookPath.map(point), u)));
      else if (s.look) pose.look.copy(Wp(point(s.look)));
      else { const a = curve(P, Math.min(1, u + 0.02)); pose.look.copy(Wp(a)); }
    } else if (s.type === 'card') {
      return;
    }
    // "lookHeli": the lens kept on the helicopter as it flies the shot's way (with lookLead m ahead of it)
    if (s.lookHeli && s.heli) {
      const v = s.heli, q = Array.isArray(v) ? v : v.from.map((a, i) => lerp(a, v.to[i], EASE[v.ease || 'linear'](k)));
      pose.look.copy(W(q[0], q[1], q[2] + (s.lookUp || 0)));
    }
    if (s.hand) {
      const t = (s.t0 + k * s.dur) * 0.8, d = pose.pos.distanceTo(pose.look) * 0.004 * s.hand;
      pose.look.x += nz(t, 1) * d; pose.look.y += nz(t, 2) * d * 0.7; pose.look.z += nz(t, 3) * d;
      pose.pos.y += nz(t, 4) * 0.04 * s.hand;
    }
    // a hit felt in the lens: a short shake that dies away
    for (const [kk, amt, secs] of s.shake || []) {
      const dt = (k - kk) * s.dur;
      if (dt < 0 || dt > (secs || 0.6)) continue;
      const a = amt * Math.exp(-dt * 7) * pose.pos.distanceTo(pose.look) * 0.01, t = dt * 60;
      pose.look.x += Math.sin(t * 1.3) * a; pose.look.y += Math.sin(t * 1.7 + 1) * a; pose.look.z += Math.sin(t * 1.1 + 2) * a;
    }
    pose.fov = ch(s.fov ?? 40, k, e);
    pose.roll = ch(s.roll ?? 0, k, e);
  }

  // ------------------------------------------------------------------ one frame
  // set everything at film time t; returns how much world time the frame is to be given (ms) and whether it is held
  function apply(t) {
    const s = shotAt(t), k = clamp((t - s.t0) / s.dur);
    let entered = false;
    if (s !== cur) { cur = s; enter(s); buildText(s); entered = true; }
    drawText(s, k);
    const black = ov.querySelector('#tr-black'), white = ov.querySelector('#tr-white'), veil = document.getElementById('tr-veil'), canvas = document.getElementById('game-gl');
    // fades and flashes
    let f = 1;
    if (s.fadeIn) f = Math.min(f, EASE.smooth(clamp((t - s.t0) / s.fadeIn)));
    if (s.fadeOut) f = Math.min(f, EASE.smooth(clamp((s.t0 + s.dur - t) / s.fadeOut)));
    if (s.type === 'card') f = 0;
    black.style.opacity = (1 - f).toFixed(4);
    let w = 0;
    for (const [kk, secs] of s.flash || []) { const d = (k - kk) * s.dur; if (d >= -0.05 && d < secs) w = Math.max(w, d < 0 ? 1 + d / 0.05 : Math.pow(1 - d / secs, 2.2)); }
    white.style.opacity = w.toFixed(4);
    ov.querySelector('#tr-vig').style.opacity = s.type === 'card' ? 0 : (s.vignette ?? 1);
    if (s.type === 'card') { veil.style.opacity = 0; canvas.style.filter = ''; return { shot: s.id, k, card: true, ms: 0, entered }; }

    G.setClock(year, date[0], date[1], minutesOf(s, k));
    // weather in time, and lightning
    if (G.weather && s.weatherAt) {
      let key = null;
      for (const q of s.weatherAt) if (k >= q[0]) key = q;
      const id = `${s.id}:${key ? key[0] : ''}`;
      if (key && id !== wxKey) { wxKey = id; G.weather.set(key[1], key[2] ? { now: true } : { pace: key[3] || 1 }); }
    }
    if (G.weather && s.strikes) for (const [kk, o] of s.strikes) {
      const id = `${s.id}:${kk}`;
      if (k >= kk && !struck.has(id)) { struck.add(id); G.weather.strike(G.t(), Object.assign({}, o, { bearing: (o.bearing || 0) * RAD })); }
    }
    // the signal's cues
    for (const [kk, name] of s.signal || []) { const id = `sig:${s.id}:${kk}`; if (k >= kk && !fired.has(id)) { fired.add(id); signal(s, name); } }
    // the world's pace
    const pace = keyed(s.speed, k, 1);
    const held = pace <= 1e-3;
    if (held !== !!G.held()) G.hold(held);
    // the Stop: the ring, the cold drained street, the air held
    const stop = s.stop;
    let stopK = 0;
    if (stop) {
      const d = (k - stop.at) * s.dur;
      if (d >= 0 && !stopOn) {
        stopOn = true;
        const c = point(stop.centre || s.stand || s.look || s.at);
        if (sfx) sfx.start(Wp(c), { rain: !!(G.weather && G.weather.state && G.weather.state.rain > 0.15) });
      }
      stopK = d < 0 ? 0 : EASE.out(clamp(d / 0.5));
      if (stop.until != null && k >= stop.until) { stopK = Math.max(0, 1 - (k - stop.until) * s.dur / 0.8); if (sfx && stopK <= 0) sfx.release(); }
    }
    veil.style.opacity = (stopK * (stop && stop.veil != null ? stop.veil : 1)).toFixed(3);
    canvas.style.filter = stopK > 0 ? `brightness(${(1 - 0.08 * stopK).toFixed(3)}) contrast(${(1 + 0.12 * stopK).toFixed(3)}) saturate(${(1 - 0.5 * stopK).toFixed(3)})` : '';
    // the camera
    shotPose(s, k);
    if (held || s.cam_fixed) { G.camera.position.copy(pose.pos); G.camera.lookAt(pose.look); }
    // the cast: they move in film time (an afterimage moves in a stopped world); the dog too
    for (const fg of staged) {
      const q = fg._q;
      if (q.from != null && fg.rig && fg.rig.root) fg.rig.root.visible = k >= q.from; // (one who is seen only once time stops)
      if (q.walk && k >= q.walk[0] && !fg._walking) { fg._walking = true; const p = point(q.walk[1]); fg.walkTo(p[0], p[1], q.walk[2] || 1.1); }
      if (q.face && !fg.to) { const fc = q.face === 'cam' ? [pose.pos.x, -pose.pos.z] : point(q.face); fg.face(fc[0], fc[1]); }
      fg.animate(frameDt);
    }
    if (dog && dog._on) {
      dog.root.visible = true;
      const g = s.dog.go;
      if (g && k >= g[0] && !dog._go) { dog._go = true; const p = point(g[1]), lk = g[3] ? point(g[3]) : null; dog.go([p[0], p[1]], lk, g[2] || 0); }
      dog.tick(frameDt);
    }
    // a thing of 1964: formed out of grain at k, over the whole picture
    if (relic && G.past) {
      const on = k >= (s.relic.from ?? 0);
      G.past.whole(on);
      if (G.past.open) G.past.open(on);
    }
    if (s.heli) heliPut(s.heli, k, frameDt);
    // the air: held with the world, carried on with it
    if (sfx) sfx.tick(frameDt, pace, Wp([G.player.x, G.player.y, G.player.z]), G.player.z > 60);
    // depth of field and the camera's motion blur
    if (s.dof) {
      const fd = typeof s.dof.focus === 'number' ? s.dof.focus : s.dof.focus ? pose.pos.distanceTo(Wp(point(s.dof.focus))) : pose.pos.distanceTo(pose.look);
      const fl = 0.012 / Math.tan(pose.fov * RAD / 2), fs = s.dof.fstop ?? 2.8;
      fx = { focus: fd, aperture: s.dof.fstop === 0 ? 0 : fl * fl / (fs * Math.max(0.05, fd - fl)) / 0.024, blur: s.dof.blur ?? 0.35, fresh: entered };
    } else fx = (s.blur ? { focus: 1e4, aperture: 0, blur: s.blur, fresh: entered } : null);
    // the grade: trims on the game's own for the hour
    // (no grade: the game's own for the hour, its flare and light shafts when the sun is in the frame)
    const gr = s.grade || spec.grade || null;
    G.atmos.lens.trim = gr ? { ev: Math.pow(2, keyed(gr.ev, k, 0)), sat: gr.sat ?? 1, tint: gr.tint || [1, 1, 1], bloom: gr.bloom ?? 1, skySat: gr.sky ?? 1, stars: gr.stars ?? 1 } : null;
    const L = G.atmos.lens.uniforms;
    if (gr && L.uSunVis) L.uSunVis.value = 0;
    if (L.uGrain) L.uGrain.value = 0; // (grain goes on in the encoder's pass, not into the picture it compresses)
    return { shot: s.id, k, held, ms: held ? 1000 * frameDt : 1000 * frameDt * pace, entered };
  }

  // is the map round this shot built yet (the hero level, the characters asked for)?
  function waiting() {
    const h = G.hero && G.hero(), lib = G.peopleLib, want = (cur && cur.figures || []).map(q => castOf(q.who).character);
    return { hero: h ? h.state().filter(q => q.state === 'loading').map(q => q.id) : [], cast: lib ? want.filter(c => !lib.tpl[c]) : [], dog: !!(dog && dog._on && !dog.ready) };
  }
  function ready() {
    const h = G.hero && G.hero();
    const lvl = !h || !h.state().some(q => q.state === 'loading');
    const cast = staged.every(f => !f.rig || !f.rig.root || f.rig.root.children.length > 0);
    const lib = G.peopleLib, want = (cur && cur.figures || []).map(q => castOf(q.who).character);
    const chars = !lib || want.every(c => lib.tpl[c]);
    // a figure made as a stand-in is made again once its model has come (a shot filmed first in a run showed the
    // player's body where the girl stands for its first two seconds)
    if (chars && staged.some(f => f._standin)) { stage(cur); return false; }
    return lvl && cast && chars && (!dog || !dog._on || dog.ready);
  }
  // after a shot's characters have come, the stage is made again with them (a figure made before its model came is a
  // stand-in)
  function restage() { if (cur && cur.type !== 'card') { stage(cur); } }

  function setDt(fps) { frameDt = 1 / fps; }
  // the type's faces loaded before the first card (a face is fetched when first used: the card's first frames were the fallback's)
  function fonts() {
    const want = ['200 40px "Zalando Sans Expanded"', '400 20px "JetBrains Mono"', '400 30px "Newsreader"', '500 30px "Shippori Mincho"', '400 20px "Inter Tight"'];
    return Promise.all(want.map(f => document.fonts.load(f, 'BLUE HOUR 遅かったね 渋谷 忠犬ハチ公 センター街').catch(() => null))).then(r => r.map(x => (x ? x.length : 0)));
  }
  // after the world's moment to settle (tools/trailer.js settle): the lens's wedge cleared again, of whoever walked in
  function settled() {
    if (!cur || cur.type === 'card') return;
    shotPose(cur, 0);
    if (cur.clear) clearWedge(cur.clear);
    if (cur.clearAround) clearAround(cur.clearAround);
    if (cur.clear_cars && G.cars && G.cars.clearBox) { const c = point(cur.clear_cars); G.cars.clearBox(c[0], c[1], cur.clear_cars[3] || 30); } // (and of a car that drove in)
  }
  // the next apply() begins its shot afresh
  function reset() { cur = null; clearStage(); stopOn = false; if (sfx) sfx.release(); G.hold(false); }
  // on to film time t within the shot begun, the frames between not drawn: their cues fired, the cast moved on and
  // the world simulated for the time they would have given it (for a still from the middle of a shot)
  function seek(t) {
    if (!cur) return apply(t);
    let acc = 0;
    const catchUp = () => { if (acc <= 0) return; const was = G.held(); G.hold(true); G.advance(acc / 1000); G.hold(was); acc = 0; };
    for (let ti = cur.t0 + frameDt; ti < t - 1e-6; ti += frameDt) { const r = apply(ti); if (!r.held) acc += r.ms; if (acc >= 100) catchUp(); }
    catchUp();
    return apply(t);
  }
  return { setup, apply, seek, reset, ready, waiting, settled, fonts, draw: on => { drawing = on !== false; }, restage, setDt, point, get total() { return total; }, get shots() { return shots; }, EASE };
})();
