// Steering your car with the mouse: a setting, off by default (the menu's Steering, `bh-mouse-steer` in this browser), as
// the PC's open-world driving games offer it beside the keys (GTA V's mouse steering among them). Off, the mouse is the
// camera, as on foot: drag to look round, and the camera comes back behind the car a moment after.
//
// On, and at the wheel of your car: a click into the picture takes the pointer lock, and from then the mouse's sideways
// movement turns a wheel that is kept here (-1 left to 1 right). A small dead zone round the middle, so a hand resting on
// the mouse drives straight; less of the wheel for the same movement at speed (as the keys get less lock there, cars.js);
// and the wheel going back to the middle by itself once the mouse rests, as a car's wheel does through the hands. The
// right button held is free look: the mouse turns the camera while it is held, and the camera follows the car again once
// let go. Escape, the menu, someone talking to you, a scene, or stepping out of the car lets the pointer go (the browser
// lets it go on Escape itself). The keys steer alongside throughout: the two add, as a controller's stick does.
//
// game.js asks: step(dt, speed) the wheel this frame (0 unless locked), tick() each frame (the lock let go where it no
// longer may be held), locked, enabled; and the module wires the menu's buttons (#gm-steer) and the keys tables' mouse
// lines (.gk-mouse, shown under :root.msteer) itself. A harness may hold the lock without the browser's (harness(true)): a page with no focus is
// granted none.
'use strict';
window.OEMouseSteer = (function () {
  const KEY = 'bh-mouse-steer';
  const DEAD = 0.05; // (of the wheel's travel, either side of the middle)
  const PX = 420; // (pixels of movement for the whole wheel, one side, standing still: a comfortable sweep of the wrist)
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const write = v => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* storage blocked: for this visit only */ } };
  // ctx: { canvas, on(target, type, fn, opts), allowed() -> may the lock be held now (at the wheel, nothing up over the
  //        picture), look(dx, dy) -> the camera turned by the mouse (free look), $, $$, changed(on) -> said to the player }
  function create(ctx) {
    const { canvas, on } = ctx;
    let enabled = read(), pos = 0, rest = 0, free = false, fake = false, held = false;
    // (held: the lock granted and not let go since; the browser's own word comes a task later, so a frame after the menu
    // opened it still named the picture)
    const locked = () => enabled && (fake || (held && document.pointerLockElement === canvas));
    // (less wheel for the same movement as the car goes faster: half of it at 25 m/s)
    const gain = speed => 1 / (PX * (1 + Math.abs(speed || 0) / 25));
    let speedNow = 0;
    function lock() {
      if (!enabled || locked() || !ctx.allowed() || !canvas.requestPointerLock) return;
      // (raw movement where the browser has it, without the system's acceleration: a wheel turns by how far the hand went)
      const plain = () => { try { const q = canvas.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) { /* refused: the click again */ } };
      try { const q = canvas.requestPointerLock({ unadjustedMovement: true }); if (q && q.catch) q.catch(plain); } catch (e) { plain(); }
    }
    function release() {
      pos = 0; free = false; fake = false; held = false;
      if (document.pointerLockElement === canvas) { try { document.exitPointerLock(); } catch (e) { /* already gone */ } }
    }
    on(document, 'pointerlockchange', () => { held = document.pointerLockElement === canvas && enabled && ctx.allowed(); if (!held) { pos = 0; free = false; if (document.pointerLockElement === canvas) release(); } });
    on(canvas, 'mousedown', e => { if (e.button === 0 && enabled && !locked() && ctx.allowed()) lock(); });
    on(document, 'mousedown', e => { if (e.button === 2 && locked()) free = true; });
    on(document, 'mouseup', e => { if (e.button === 2) free = false; });
    on(canvas, 'contextmenu', e => { if (enabled && ctx.allowed()) e.preventDefault(); });
    on(document, 'mousemove', e => {
      if (!locked()) return;
      const dx = e.movementX || 0, dy = e.movementY || 0;
      if (free) { ctx.look(dx, dy); return; }
      if (!dx) return;
      pos = clamp(pos + dx * gain(speedNow), -1, 1);
      rest = 0;
    });
    // the wheel this frame: the dead zone taken out, then a gentle curve (finer near the middle, all of it at the end)
    function step(dt, speed) {
      speedNow = speed;
      if (!locked()) { pos = 0; return 0; }
      rest += dt;
      // (the hand at rest: back to the middle, slowly at first and quicker as it goes on resting, a car's caster through
      // the hands; a slow, steady sweep through a long bend keeps it where it is put)
      if (rest > 0.12) pos *= Math.exp(-dt * Math.min(3.2, 1.2 + (rest - 0.12) * 4));
      if (Math.abs(pos) < 1e-3) pos = 0;
      const a = Math.abs(pos);
      return a <= DEAD ? 0 : Math.sign(pos) * Math.pow((a - DEAD) / (1 - DEAD), 1.25);
    }
    // each frame: the lock let go where it may no longer be held (out of the car, the menu, a talk, a scene)
    function tick() { if ((held || fake) && (!enabled || !ctx.allowed())) release(); }
    // the menu's buttons and the keys table's mouse lines
    const btns = () => (ctx.$$ ? ctx.$$('#gm-steer button') : []);
    function show() {
      for (const b of btns()) b.setAttribute('aria-pressed', String((b.dataset.m === 'mouse') === enabled));
      document.documentElement.classList.toggle('msteer', enabled); // (the keys tables' .gk-mouse lines, wherever a menu builds them)
    }
    function set(v) {
      enabled = !!v; write(enabled);
      if (!enabled) release();
      show();
      if (ctx.changed) ctx.changed(enabled);
    }
    const el = ctx.$ && ctx.$('#gm-steer');
    if (el) on(el, 'click', e => { const b = e.target.closest('button'); if (b) set(b.dataset.m === 'mouse'); });
    show();
    return {
      step, tick, set, release, lock,
      get enabled() { return enabled; },
      get locked() { return locked(); },
      get free() { return locked() && free; },
      get pos() { return pos; },
      gain,
      harness(v) { fake = !!v && enabled; if (!fake) pos = 0; },
    };
  }
  return { create };
})();
