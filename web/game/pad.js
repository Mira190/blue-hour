// A controller, through the Gamepad API's standard mapping (no library). A walk, a camera raised to the eye, a lens ring
// and a shutter are a controller's game: the left stick walks and the right one looks; the left trigger raises the camera
// while it is held (or each pull raises or lowers it: `oe-pad` { toggle } in this browser), the right trigger is the
// release; the bumpers turn the lens's ring; A talks and passes a line, B steps back (and closes what is open), Y opens
// the roll, View the log; the d-pad (or the left stick, flicked) moves through choices, prints, the roll's two-print
// compare and a card's buttons, and A presses the one it is on.
//
// It speaks to the game in the game's own words: a button is the key the keyboard has for it (a KeyboardEvent with that
// code, so that everything that reads keys reads the pad the same way), the sticks are read by game.js (move, look),
// and an open card's buttons are focused and pressed as a hand would. While the pad is the last thing touched the
// prompts on screen show its signs (each <kbd> naming a key it has: the stage's class `pad`, and the sign in the kbd);
// a key or the mouse brings the keys back. A light rumble on the Stop and on the shutter, where the pad has one.
'use strict';
window.OEPad = (function () {
  const DEAD = 0.18;
  const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  // the signs of a pad, by its maker: the face buttons by their letters, or a PlayStation's shapes
  const SIGNS = {
    xbox: { LENS: 'LB · RB', ANY: 'Any button', LSTICK: 'Left stick', RSTICK: 'Right stick', A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', VIEW: 'View', MENU: 'Menu', LS: 'L', RS: 'R', UP: '↑', DOWN: '↓' },
    ps: { LENS: 'L1 · R1', ANY: 'Any button', LSTICK: 'Left stick', RSTICK: 'Right stick', A: '✕', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', VIEW: 'Create', MENU: 'Options', LS: 'L', RS: 'R', UP: '↑', DOWN: '↓' },
  };
  // a key named on screen, and the pad's button for it
  const KEY_PAD = { Wheel: 'LENS', 'Any key': 'ANY', 'Left stick': 'LSTICK', 'Right stick': 'RSTICK', E: 'A', Enter: 'A', '↵': 'A', Space: 'A', F: 'RT', R: 'LT', Tab: 'Y', H: 'UP', C: 'DOWN', L: 'VIEW', Q: 'B', Esc: 'B', Escape: 'B', Shift: 'LS', X: 'LS', W: 'LS', A: 'LS', S: 'LS', D: 'LS' };
  const dz = v => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));
  const opts = () => { try { return JSON.parse(localStorage.getItem('oe-pad') || '{}') || {}; } catch (e) { return {}; } };
  // ctx: { stage, open() -> the card or panel up now whose buttons the pad moves through (or null), dialogue() -> the
  //        choices' buttons while a question waits, camera(on) / cameraUp() -> the story's camera to the eye, lens(dir),
  //        roll(), log(), back(): one step back in a dialogue }
  function create(ctx) {
    const stage = ctx.stage, was = [];
    let on = false, kind = 'xbox', pad = null, lastT = 0;
    const move = { x: 0, y: 0 }, look = { x: 0, y: 0 };
    // (sent where a key pressed is: the focused element, or the body. Sent to the window itself, every listener on the window
    // ran whatever stopped it, as the target's own: B closed the roll and the game's Escape opened the pause menu under it)
    const key = (code, k) => { const at = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body; for (const t of ['keydown', 'keyup']) at.dispatchEvent(new KeyboardEvent(t, { code, key: k || code, bubbles: true, cancelable: true })); };
    const sign = b => SIGNS[kind][b] || b;
    // the prompts: every kbd that names a key the pad has shows the pad's sign while the pad is in the hand
    function signs() {
      for (const k of stage.querySelectorAll('kbd')) {
        if (on) { const t = k.dataset.key != null ? k.dataset.key : k.textContent.trim(), b = KEY_PAD[t]; if (!b) continue; if (k.dataset.key == null) k.dataset.key = t; const s = sign(b); if (k.textContent !== s) { k.textContent = s; k.classList.add('pad'); k.dataset.b = b; } }
        else if (k.dataset.key != null) { k.textContent = k.dataset.key; delete k.dataset.key; delete k.dataset.b; k.classList.remove('pad'); }
      }
    }
    function mode(v) {
      if (v === on) return;
      on = v; stage.classList.toggle('pad', on); signs();
      if (ctx.mode) ctx.mode(on);
    }
    // a key or the mouse: the keys again (only a person's, not the keys this sends)
    const human = e => { if (e.isTrusted) mode(false); };
    addEventListener('keydown', human, true); addEventListener('mousemove', e => { if (e.isTrusted && (Math.abs(e.movementX) + Math.abs(e.movementY) > 3)) mode(false); }, true);
    addEventListener('pointerdown', e => { if (e.isTrusted && e.pointerType !== 'mouse') mode(false); }, true);
    // focus moves through the buttons of what is open; A presses the one it is on. With the hand on none, A presses the
    // card's first way (lead, below), so the d-pad moves on from that one: down from the title's first way in is the second
    function cycle(list, dir, from) {
      if (!list.length) return;
      let i = list.indexOf(document.activeElement); if (i < 0 && from) i = list.indexOf(from);
      const n = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
      list[n].focus({ preventScroll: false }); if (list[n].scrollIntoView) list[n].scrollIntoView({ block: 'nearest' });
    }
    const usable = root => [...root.querySelectorAll('button, a[href]')].filter(b => b.offsetParent && !b.disabled);
    const lead = root => [...root.querySelectorAll('button.go, .btn.primary')].find(x => x.offsetParent && !x.disabled);
    // (a button pressed by the pad is a person's press, though the browser counts the click as a script's: while it runs,
    // pressing says so, and the title's episode asks who you play first as it does for a click, game.js)
    let pressing = false;
    const own = b => { if (!b) return; pressing = true; try { b.click(); } finally { pressing = false; } };
    function press(b) {
      const choices = ctx.dialogue ? ctx.dialogue() : null, open = ctx.open ? ctx.open() : null;
      if (b === 'UP' || b === 'DOWN' || b === 'LEFT' || b === 'RIGHT') {
        const dir = b === 'DOWN' || b === 'RIGHT' ? 1 : -1;
        if (open) return cycle(usable(open), dir, lead(open));
        if (choices && choices.length) return cycle(choices, dir);
        if (b === 'UP') return key('KeyH', 'h'); // (nothing open: up on the d-pad asks for a hint, where a place is to be found)
        if (b === 'DOWN') return key('KeyC', 'c'); // (and down calls your car, on the walk)
        return;
      }
      if (b === 'A') {
        const f = document.activeElement;
        if (open && open.hasAttribute('data-choose')) { const r = usable(open).filter(x => x.getAttribute('role') === 'radio'); return r.includes(f) ? f.click() : cycle(r, 1); } // (a card that asks for a choice first, the title's who you play: A presses only an answer, and the first press puts the hand on the first)
        if (open) { const l = usable(open); return own(l.includes(f) ? f : lead(open) || l[0]); } // (a card that asks for a choice first, the title's who you play: the first press puts the hand on its first answer)
        if (choices && choices.length) { if (choices.includes(f)) return f.click(); return cycle(choices, 1); } // (the first press on a question puts the hand on its first answer)
        return key('KeyE', 'e');
      }
      if (b === 'B') { if (open) return ctx.close ? ctx.close(open) : null; return ctx.back ? ctx.back() : key('KeyQ', 'q'); }
      if (b === 'Y') return key('Tab');
      if (b === 'VIEW') return ctx.log ? ctx.log() : key('KeyL', 'l');
      if (b === 'MENU') return key('Escape');
      if (b === 'RT') return key('KeyF', 'f');
      if (b === 'LT') return ctx.camera ? ctx.camera(opts().toggle ? !ctx.cameraUp() : true) : key('KeyR', 'r');
      if (b === 'LB' || b === 'RB') return ctx.lens && ctx.lens(b === 'RB' ? 1 : -1);
      if (b === 'LS') return key('KeyX', 'x');
    }
    function release(b) { if (b === 'LT' && !opts().toggle && ctx.camera) ctx.camera(false); }
    // the left stick flicked moves through what is open as the d-pad does
    let flick = 0;
    function tick(dt) {
      const all = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
      pad = all.find(g => g.connected && g.mapping === 'standard') || all.find(g => g.connected) || null;
      move.x = move.y = look.x = look.y = 0;
      if (!pad) return;
      kind = /054c|playstation|dualsense|dualshock/i.test(pad.id) ? 'ps' : 'xbox';
      const ax = pad.axes, bt = pad.buttons, down = i => !!bt[i] && (bt[i].pressed || bt[i].value > 0.5);
      let any = false;
      for (const [name, i] of Object.entries(B)) {
        const d = down(i);
        if (d !== !!was[i]) { was[i] = d; any = true; if (d) press(name); else release(name); }
      }
      const lx = dz(ax[0] || 0), ly = dz(ax[1] || 0), rx = dz(ax[2] || 0), ry = dz(ax[3] || 0);
      if (lx || ly || rx || ry) any = true;
      const menu = (ctx.open && ctx.open()) || (ctx.dialogue && (ctx.dialogue() || []).length);
      if (menu) { // (in a card or a question the left stick is a d-pad)
        flick = Math.max(0, flick - dt);
        const d = Math.abs(ly) > 0.6 ? Math.sign(ly) : Math.abs(lx) > 0.6 ? Math.sign(lx) : 0;
        if (d && !flick) { press(d > 0 ? 'DOWN' : 'UP'); flick = 0.28; } else if (!d) flick = 0;
      } else { move.x = lx; move.y = -ly; look.x = rx; look.y = ry; }
      if (any) { lastT = performance.now(); mode(true); }
      if (on) signs();
    }
    // a light rumble, where the pad has one: the Stop (long and soft), the shutter (a short knock)
    function rumble(kind) {
      const a = pad && pad.vibrationActuator; if (!a || !on) return;
      const e = kind === 'stop' ? { duration: 420, weakMagnitude: 0.35, strongMagnitude: 0.15 } : { duration: 70, weakMagnitude: 0.1, strongMagnitude: 0.55 };
      try { if (a.playEffect) a.playEffect('dual-rumble', Object.assign({ startDelay: 0 }, e)).catch(() => {}); } catch (err) { /* no rumble here */ }
    }
    const label = k => (on && KEY_PAD[k] ? sign(KEY_PAD[k]) : k);
    return { tick, rumble, move, look, sign, label, key, get pressing() { return pressing; }, get on() { return on; }, get connected() { return !!pad; }, get toggle() { return !!opts().toggle; }, setToggle(v) { try { localStorage.setItem('oe-pad', JSON.stringify(Object.assign(opts(), { toggle: !!v }))); } catch (e) { /* storage blocked */ } } };
  }
  return { create };
})();
