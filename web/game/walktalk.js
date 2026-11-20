// People with something to say, on the walk (docs/STORY.md "The walk", "People with something to say"). The walk has
// no case and owes nothing, but a street with nobody to talk to is a set, not a city. So a few people of this evening
// stand where they would (a girl waiting at Hachiko, a taxi driver on his break, the vintage shop's owner, the lift's
// attendant), each with a small story told in two or three parts, and each part asks one thing the walk can do: cross
// on the green, drive your car, take a photograph, ride the lift to the roof. Nothing of the case is in any of them.
//
// How a player finds them, as the open-world games that do this best (design only, below in the docs): a speech mark
// over whoever has something to say, amber while they have a part of a story for you and pale for a word in passing,
// seen from about forty metres and named once you are close; E (or a tap) beside them opens the talk in the story's own
// box and camera; what you were asked sits under the hour in the walk's corner with the metres to it; and the story
// is put away with its name when its last part is said. Where each story has got to is kept in this browser.
//
//   create({ data: game.walk { people: [{ id, npc, title, parts: [{ npc?, lines: [text | { npc, text }], then? }],
//            after? }], chat: { npcId: [lines] } },
//            stage, project(x, y, z) -> { x, y } on the stage in CSS pixels or null behind the camera,
//            npc(id) -> the game's NPC { id, name, role, x, y, z, rig }, here() -> { x, y, z, mode },
//            say(runs, done): a talk in runs of [npc, lines], one speaker after another; done() when the last closes,
//            fill(text) -> the text with {time} and {sun_line} said, unseen(npc) -> true when nobody sees them now,
//            move(npc, [x, y], faceTo) puts someone somewhere else, told(title, n, of): a story put away })
//   then: { goal: the words under the hour, and one of: talk (the next part's speaker, at once), go [x, y] r on foot,
//           drive [x, y] r in your car, up z (higher than z, as on SHIBUYA SKY's roof), photo [x, y, z] (a photograph
//           with that point in it, taken from within `r` of it or from `above` metres over it) ; meet: an npc id who,
//           unseen, goes to stand by the next part's speaker }
'use strict';
window.OEWalkTalk = (function () {
  const KEEP = 'oe-walk-talk';
  const SEE_M = 42, NAME_M = 11; // (a speech mark seen from this far; the name under it from this close)
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const first = name => String(name || '').replace(/\s*[\u3000-\u9fff\uff00-\uffef].*$/, '').trim(); // (the name as it is read: "Mr Oda 小田さん" is Mr Oda)

  function create(ctx) {
    const people = (ctx.data && ctx.data.people) || [], chat = (ctx.data && ctx.data.chat) || {};
    let st = {};
    try { st = JSON.parse(localStorage.getItem(KEEP) || '{}') || {}; } catch (e) { st = {}; }
    const keep = () => { try { localStorage.setItem(KEEP, JSON.stringify(st)); } catch (e) { /* storage blocked */ } };
    const of = s => st[s.id] || (st[s.id] = { part: 0, met: false, done: false });
    let lastAsked = null; // (the story whose errand the corner shows: the one asked last)
    let on = false, busy = false;
    // the parts' speakers: the story's own unless a part names another
    const speaker = (s, i) => (s.parts[i] && s.parts[i].npc) || s.npc;
    // what someone has to say now: a part of a story ('story'), or a word in passing ('chat'), or nothing
    function want(id) {
      for (const s of people) {
        const k = of(s);
        if (k.done || speaker(s, k.part) !== id) continue;
        const gate = k.part === 0 || k.met;
        if (gate) return { kind: 'story', s, k };
      }
      if (chat[id] && chat[id].length) return { kind: 'chat' };
      for (const s of people) if (of(s).done && s.npc === id && s.after) return { kind: 'chat', after: s };
      return null;
    }
    // the errand still open: the one asked last, else any
    function open() {
      const list = people.filter(s => { const k = of(s); return !k.done && k.part > 0; });
      return list.find(s => s.id === lastAsked) || list[0] || null;
    }
    function errand() {
      const s = open();
      if (!s) return null;
      const k = of(s), then = s.parts[k.part - 1].then || {}, me = ctx.here();
      const who = ctx.npc(speaker(s, k.part));
      // (sent on to someone, or what was asked done: the metres are to the one who speaks next)
      if ((then.talk || k.met) && who) return { text: then.talk ? then.goal : `Back to ${first(who.name)}${then.back ? `, ${then.back}` : ''}`, m: Math.hypot(who.x - me.x, who.y - me.y), key: '' };
      const at = then.go || then.drive || then.photo;
      return { text: then.goal || '', m: at ? Math.hypot(at[0] - me.x, at[1] - me.y) : null, key: then.key || '' };
    }
    // a part said: the next is waiting, or the story is put away
    function said(s) {
      const k = of(s), part = s.parts[k.part], then = part.then;
      k.part++; k.met = !!(then && then.talk);
      lastAsked = s.id;
      if (k.part >= s.parts.length) {
        k.done = true; k.met = false;
        const n = people.filter(q => of(q).done).length;
        if (ctx.told) ctx.told(s.title, n, people.length);
      } else if (then && then.meet) k.meet = then.meet;
      keep();
    }
    // the talk with someone the player stands beside (E): a part of a story, else a word in passing
    function talk(n) {
      const w = want(n.id);
      if (!w || busy) return false;
      busy = true;
      const done = () => { busy = false; };
      if (w.kind === 'story') {
        const part = w.s.parts[w.k.part], runs = [];
        for (const l of part.lines) {
          const who = typeof l === 'string' ? n : ctx.npc(l.npc) || n, text = ctx.fill(typeof l === 'string' ? l : l.text);
          if (runs.length && runs[runs.length - 1][0] === who) runs[runs.length - 1][1].push(text); else runs.push([who, [text]]);
        }
        ctx.say(runs, () => { said(w.s); done(); });
        return true;
      }
      const lines = w.after ? w.after.after : chat[n.id];
      const k = (st._chat = st._chat || {});
      const i = (k[n.id] = ((k[n.id] ?? -1) + 1) % lines.length);
      keep();
      ctx.say([[n, [ctx.fill(lines[i])]]], done);
      return true;
    }
    // what was asked, met by what the player does: arrived on foot, by car, up on the roof (a photograph: photo())
    function check() {
      const me = ctx.here();
      for (const s of people) {
        const k = of(s);
        if (k.done || k.part === 0 || k.met) continue;
        const then = s.parts[k.part - 1].then || {};
        let met = false;
        if (then.go) met = Math.hypot(then.go[0] - me.x, then.go[1] - me.y) < (then.r || 15);
        else if (then.drive) met = me.mode === 'car' && Math.hypot(then.drive[0] - me.x, then.drive[1] - me.y) < (then.r || 30);
        else if (then.up != null) met = me.z > then.up;
        if (met) { k.met = true; lastAsked = s.id; keep(); if (ctx.met) ctx.met(s, ctx.npc(speaker(s, k.part))); }
      }
      // someone sent to stand by another: there before you are back, never seen going
      for (const s of people) {
        const k = of(s);
        if (!k.meet) continue;
        const m = ctx.npc(k.meet), to = ctx.npc(speaker(s, k.part));
        if (!m || !to) { delete k.meet; continue; }
        if (Math.hypot(m.x - to.x, m.y - to.y) < 2.5) { delete k.meet; keep(); continue; }
        if (Math.hypot(m.x - me.x, m.y - me.y) > 30 && Math.hypot(to.x - me.x, to.y - me.y) > 22 && ctx.unseen(m) && ctx.unseen(to)) {
          ctx.move(m, to, k.meet);
          delete k.meet; keep();
        }
      }
    }
    // a photograph was taken (game.js snapPhoto): a story waiting on one of a place is met if the place is in it
    function photo(cam) {
      let hit = null;
      for (const s of people) {
        const k = of(s);
        if (k.done || k.part === 0 || k.met) continue;
        const then = s.parts[k.part - 1].then || {};
        if (!then.photo) continue;
        const [x, y, z] = then.photo, me = ctx.here();
        const near = Math.hypot(x - me.x, y - me.y) < (then.r || 25), high = then.above != null && cam.z - z > then.above;
        if ((near || high) && cam.sees(x, y, z)) { k.met = true; hit = s; lastAsked = s.id; }
      }
      if (hit) { keep(); if (ctx.met) ctx.met(hit, ctx.npc(speaker(hit, of(hit).part))); }
      return !!hit;
    }

    // ---- the speech marks over people's heads
    const layer = document.createElement('div');
    layer.className = 'g-walk-marks'; layer.setAttribute('aria-hidden', 'true');
    ctx.stage.appendChild(layer);
    const marks = new Map(); // npc id -> element
    function mark(id) {
      let el = marks.get(id);
      if (!el) { el = document.createElement('div'); el.className = 'g-walk-mark'; el.innerHTML = '<i><b></b><b></b><b></b></i><span></span>'; layer.appendChild(el); marks.set(id, el); el._k = ''; el._n = ''; }
      return el;
    }
    function draw(hide) {
      const me = ctx.here(), ids = new Set();
      for (const s of people) { ids.add(s.npc); for (const p of s.parts) if (p.npc) ids.add(p.npc); }
      for (const id of Object.keys(chat)) ids.add(id);
      for (const id of ids) {
        const n = ctx.npc(id), el = marks.get(id);
        if (!n || hide || !n.rig || !n.rig.root.visible || n.talking) { if (el) el.style.opacity = '0'; continue; }
        const w = want(id), d = Math.hypot(n.x - me.x, n.y - me.y), dz = Math.abs((n.z || 0) - (me.z || 0));
        const far = w && w.kind === 'story' ? SEE_M : 18;
        if (!w || d > far || dz > 12 || me.mode !== 'foot') { if (el) el.style.opacity = '0'; continue; }
        const p = ctx.project(n.x, n.y, n.z + 2.12);
        const e = mark(id);
        if (!p) { e.style.opacity = '0'; continue; }
        const k = w.kind;
        if (e._k !== k) { e._k = k; e.dataset.k = k; }
        const name = d < NAME_M ? `${first(n.name)}${n.role ? ` · ${String(n.role).replace(/\s*[　-鿿＀-￯].*$/, '')}` : ''}` : '';
        if (e._n !== name) { e._n = name; e.querySelector('span').textContent = name; e.classList.toggle('named', !!name); }
        e.style.opacity = String(Math.max(0, Math.min(1, (far - d) / 8)));
        e.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${Math.max(0.72, Math.min(1, 14 / Math.max(1, d))).toFixed(3)})`;
      }
    }
    return {
      // on the walk (game.js startWalk, walkOnFromStory): the marks are drawn
      begin() { on = true; layer.classList.add('on'); },
      want, talk, photo, errand,
      // each frame on the walk: what was asked met, and the marks drawn (hide: a talk, a menu, the camera up)
      tick(dt, hide) { if (!on) return; check(); draw(hide); },
      get busy() { return busy; },
      // where each story has got to, for the checks; and from the start again
      state: () => JSON.parse(JSON.stringify(st)),
      reset() { st = {}; lastAsked = null; keep(); },
      count: () => ({ done: people.filter(s => of(s).done).length, of: people.length }),
      people,
    };
  }
  return { create };
})();
