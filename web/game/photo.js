// photo.js: a part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").
// `g` is the rest of the game, by name. What this part asks of it:
//   $, A, BASE_FOV, CITY, H, MONTHS, RAD, S, Wd, atmos, camera, canvas, cine, cityId, clock, closeup, closeupEnd,
//   dlg, fmtMin, gcHold, joy, k, life, live, mirrorTick, nav, on, player, renderer, sees, setClock, stage, sun,
//   walk, walkTalk, world
// and what it gives back:
//   lensBlur, photo, photoCamera, photoMode, photoSync, snapPhoto
'use strict';
window.OEGamePhoto = function (g) {
  // ------------------------------------------------------------ photo mode
  // The world holds still and the HUD goes. Orbit the camera round a focus that starts on
  // you: drag to turn, scroll (or Distance) to come closer, Aperture for the depth of field, WASD and Space/C to move the
  // focus up to 300 m away. Time sets the sun for the photo (the clock stays there when
  // you leave); Lens is the field of view, shown as a 35 mm focal length. Saving draws a
  // caption with the place, the time and the sun's height into the corner.
  const FSTOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16]; // the aperture: depth of field focused on the focus point
  const photo = { fstop: 2.8, on: false, focus: new THREE.Vector3(), anchor: new THREE.Vector3(), az: 0, pitch: 0.3, dist: 8, fov: g.BASE_FOV, turn: false };
  const distOf = v => 1.5 * Math.pow(400 / 1.5, v / 1000), distTo = d => Math.round(1000 * Math.log(d / 1.5) / Math.log(400 / 1.5)); // a log slider, 1.5 to 400 m
  const focal = fov => Math.round(12 / Math.tan(fov * g.RAD / 2)); // a full-frame 35 mm camera, 24 mm tall
  function photoMode(on) {
    if (on === photo.on || !g.$('#g-title').hidden || g.closeup) return;
    if (on && g.dlg.open) { g.H.toast('Finish the conversation first.'); return; }
    if (on && g.cine.active) g.cine.skip();
    photo.on = on;
    g.stage.classList.toggle('photo', on);
    g.$('#g-photo').hidden = !on;
    if (on) {
      const p = OECine.polar(g.live.look, g.camera.position);
      photo.focus.copy(g.live.look); photo.anchor.copy(g.live.look);
      Object.assign(photo, { az: p.az, pitch: Math.atan2(p.h, Math.max(0.1, p.dist)), dist: Math.max(6, g.camera.position.distanceTo(g.live.look)), fov: g.camera.fov, turn: false });
      g.$('#ph-turn').setAttribute('aria-pressed', 'false');
      g.$('#g-photo').classList.remove('adj'); g.$('#ph-adj').setAttribute('aria-expanded', 'false');
      photoSync();
    } else {
      g.player.rig.root.visible = true;
      g.$('#ph-me').setAttribute('aria-pressed', 'true');
      g.stage.classList.remove('grid'); g.$('#ph-grid').setAttribute('aria-pressed', 'false');
      // back to the chase camera without a jump
      const from = { pos: g.camera.position.clone(), look: photo.focus.clone() };
      g.cine.play(OECine.mix(() => from, () => g.live, k => OECine.ease.smooth(k)), 0.9, { label: 'crane' });
    }
  }
  // the circle of confusion of a full-frame camera at this field of view and f-number, focused at
  // `focus` m, for a point at distance d: lensBlur(...) * |d - focus| / d of the frame's height
  function lensBlur(fov, focus, fstop) {
    const f = 0.012 / Math.tan(fov * g.RAD / 2); // the focal length, m, on a 24 mm tall frame
    return f * f / (fstop * Math.max(0.05, focus - f)) / 0.024;
  }
  function photoSync() { // the sliders follow the camera and the clock
    g.$('#ph-time').value = String(Math.round(g.clock.min));
    g.$('#ph-time-v').textContent = `${g.fmtMin(g.clock.min)} · sun ${g.sun.altitude.toFixed(0)}°`;
    g.$('#ph-fov').value = String(Math.round(photo.fov));
    g.$('#ph-fov-v').textContent = `${focal(photo.fov)} mm`;
    g.$('#ph-f').value = String(FSTOPS.indexOf(photo.fstop)); g.$('#ph-f-v').textContent = `f/${photo.fstop}`;
    g.$('#ph-dist').value = String(distTo(photo.dist));
    g.$('#ph-dist-v').textContent = `${photo.dist < 20 ? photo.dist.toFixed(1) : Math.round(photo.dist)} m`;
  }
  function photoCamera(dt) {
    const p = photo, f = (g.k('KeyW') || g.k('ArrowUp') ? 1 : 0) - (g.k('KeyS') || g.k('ArrowDown') ? 1 : 0) + g.joy.y,
      sd = (g.k('KeyD') || g.k('ArrowRight') ? 1 : 0) - (g.k('KeyA') || g.k('ArrowLeft') ? 1 : 0) + g.joy.x, up = (g.k('Space') ? 1 : 0) - (g.k('KeyC') ? 1 : 0);
    const h = p.az + Math.PI, sp = Math.max(4, p.dist * 0.7) * dt; // the way the camera looks; faster when further out
    p.focus.x += (Math.sin(h) * f + Math.cos(h) * sd) * sp;
    p.focus.z += (-Math.cos(h) * f + Math.sin(h) * sd) * sp;
    p.focus.y += up * sp;
    const off = Math.hypot(p.focus.x - p.anchor.x, p.focus.z - p.anchor.z);
    if (off > 300) { p.focus.x = p.anchor.x + (p.focus.x - p.anchor.x) * 300 / off; p.focus.z = p.anchor.z + (p.focus.z - p.anchor.z) * 300 / off; }
    p.focus.y = Math.min(Math.max(p.focus.y, g.nav.terrainBelow(p.focus.x, -p.focus.z, p.focus.y + 0.5) + 0.3), p.anchor.y + 300);
    if (p.turn) p.az += dt * 2 * Math.PI / 45;
    OECine.around(p.focus, p.az, p.dist * Math.cos(p.pitch), p.dist * Math.sin(p.pitch), g.camera.position);
    g.camera.position.y = Math.max(g.camera.position.y, g.nav.groundBelow(g.camera.position.x, -g.camera.position.z, g.camera.position.y) + 0.4);
    g.camera.up.set(0, 1, 0);
    g.camera.lookAt(p.focus);
    if (g.camera.fov !== p.fov) { g.camera.fov = p.fov; g.camera.updateProjectionMatrix(); }
    g.Wd.fitShadow(p.focus, THREE.MathUtils.clamp(p.dist * 1.6, 150, 1600));
    if (f || sd || up || p.turn) photoSync();
  }
  // render once more and read the canvas back in the same task (it keeps no copy), then caption it
  function snapPhoto() {
    g.mirrorTick();
    if (g.atmos) g.atmos.render(g.world, g.camera); else g.renderer.render(g.world, g.camera);
    const w = g.canvas.width, h = g.canvas.height, out = document.createElement('canvas');
    out.width = w; out.height = h;
    const g_ = out.getContext('2d');
    // a friend's night film (bonds.js "filter"): after sunset, tungsten-balanced, the lamps white and the sky a deeper blue
    const film = g.life && g.sun.altitude < 0 ? g.life.ability('filter') : null;
    if (film) g_.filter = 'contrast(1.07) saturate(1.14) hue-rotate(-9deg) brightness(1.05)';
    g_.drawImage(g.canvas, 0, 0);
    g_.filter = 'none';
    const loc = g.S.utcToLocal(g.S.localToUtc(g.clock.y, g.clock.m, g.clock.d, g.clock.min)), fs = Math.max(12, Math.round(h * 0.017)), pad = Math.round(fs * 0.9);
    const lines = [`${g.CITY.place || g.CITY.name} · ${g.clock.d} ${g.MONTHS[g.clock.m - 1]} ${g.clock.y}, ${g.fmtMin(g.clock.min)} ${loc.zone} · sun ${g.sun.altitude.toFixed(1)}° up${film ? ` · ${film.name.toLowerCase()}` : ''}`,
      'Blue Hour · buildings and streets © OpenStreetMap contributors, via Overture Maps'];
    g_.font = `600 ${fs}px "Public Sans", sans-serif`;
    const tw = Math.max(...lines.map(t => g_.measureText(t).width));
    g_.fillStyle = 'rgba(8, 16, 24, 0.55)';
    g_.fillRect(0, h - pad * 2 - fs * 2.3, tw + pad * 2, pad * 2 + fs * 2.3);
    g_.fillStyle = '#ffffff'; g_.textBaseline = 'bottom';
    g_.fillText(lines[0], pad, h - pad - fs * 1.2);
    g_.font = `400 ${Math.round(fs * 0.8)}px "Public Sans", sans-serif`; g_.fillStyle = 'rgba(255, 255, 255, 0.82)';
    g_.fillText(lines[1], pad, h - pad);
    g.A.shutter();
    // (a photograph someone on the walk asked for, or one of the views of Shibuya, with a small copy for the album: walktalk.js)
    if (g.walk && g.walkTalk) g.walkTalk.photo({ z: g.camera.position.y, sees: g.sees, thumb: () => { const c = document.createElement('canvas'); c.width = 320; c.height = Math.round(320 * h / Math.max(1, w)); c.getContext('2d').drawImage(g.canvas, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.72); } });
    if (g.life) { const b = g.life.day ? g.life.day.bounds() : null, gold = !!b && (Math.abs(g.clock.min - b.golden) < 50 || (g.sun.altitude < 8 && g.sun.altitude > -7)); g.life.emit('photo', { golden: gold, hour: g.sun.altitude < 0 ? 'blue hour' : 'golden hour', alt: g.sun.altitude }); }
    g.stage.classList.remove('flash'); void g.stage.offsetWidth; g.stage.classList.add('flash');
    const name = `blue-hour-${g.cityId}-${g.clock.y}${String(g.clock.m).padStart(2, '0')}${String(g.clock.d).padStart(2, '0')}-${g.fmtMin(g.clock.min).replace(':', '')}.png`;
    // encode now, inside the click or key press: a download started later (toBlob's callback) can
    // outlive the user's gesture and be blocked
    const a = document.createElement('a');
    try { a.href = out.toDataURL('image/png'); } catch (e) { g.H.toast('Could not save the photo.'); return null; }
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    g.H.toast(`Saved <b>${name}</b>`);
    return name;
  }
  g.on(g.$('#ph-time'), 'input', e => { g.setClock(g.clock.y, g.clock.m, g.clock.d, +e.target.value); photoSync(); });
  g.on(g.$('#ph-fov'), 'input', e => { photo.fov = +e.target.value; photoSync(); });
  g.on(g.$('#ph-f'), 'input', e => { photo.fstop = FSTOPS[+e.target.value] || 2.8; photoSync(); });
  g.on(g.$('#ph-dist'), 'input', e => { photo.dist = distOf(+e.target.value); photoSync(); });
  g.on(g.$('#ph-turn'), 'click', e => { photo.turn = !photo.turn; e.currentTarget.setAttribute('aria-pressed', String(photo.turn)); });
  g.on(g.$('#ph-grid'), 'click', e => { const g_ = !g.stage.classList.contains('grid'); g.stage.classList.toggle('grid', g_); e.currentTarget.setAttribute('aria-pressed', String(g_)); });
  g.on(g.$('#ph-me'), 'click', e => { const v = !g.player.rig.root.visible; g.player.rig.root.visible = v; e.currentTarget.setAttribute('aria-pressed', String(v)); });
  g.on(g.$('#ph-snap'), 'click', snapPhoto);
  g.on(g.$('#ph-done'), 'click', () => photoMode(false));
  // (on a phone the lens's settings are a strip put away until asked for: the frame is the photograph's)
  g.on(g.$('#ph-adj'), 'click', e => { const o = !g.$('#g-photo').classList.contains('adj'); g.$('#g-photo').classList.toggle('adj', o); e.currentTarget.setAttribute('aria-expanded', String(o)); });
  g.on(g.$('#g-photo-btn'), 'click', () => photoMode(true));
  g.on(g.$('#gc-snap'), 'click', snapPhoto);
  g.on(g.$('#gc-done'), 'click', g.closeupEnd);
  for (const b of document.querySelectorAll('#g-closer [data-hold]')) {
    const [a, u] = b.dataset.hold.split(',').map(Number);
    g.on(b, 'pointerdown', e => { g.gcHold.along = a; g.gcHold.up = u; b.setPointerCapture(e.pointerId); });
    for (const ev of ['pointerup', 'pointercancel']) g.on(b, ev, () => { g.gcHold.along = g.gcHold.up = 0; });
  }
  return { lensBlur, photo, photoCamera, photoMode, photoSync, snapPhoto };
};
