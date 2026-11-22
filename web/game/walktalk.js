// People with something to say, on the walk (docs/STORY.md "The walk", "People with something to say"). The walk has
// no case and owes nothing, but a street with nobody to talk to is a set, not a city. So a few people of this evening
// stand where they would (a girl waiting at Hachiko, a retired taxi driver with his can of coffee, the vintage shop's
// owner, the lift's attendant, a photographer on the roof), each with a small story told in two or three parts, and each
// part asks one thing the walk can do: cross on the green, drive your car, take a photograph, ride the lift to the roof,
// fly the helicopter. The stories are one night's line, told one at a time in their order, each ending on the person
// the next is with, from the street to the air. Nothing of the case is in any of them.
//
// How a player finds them, as the open-world games that do this best (design only, below in the docs): a speech mark
// over the one person with a part of the story for you, amber, and pale over someone with a word in passing,
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
//            move(npc, [x, y], faceTo) puts someone somewhere else, told(title, n, of): a story put away,
//            called(npc): someone has called out to you (a wave from them) })
//   then: { goal: the words under the hour, and one of: talk (the next part's speaker, at once), go [x, y] r on foot,
//           drive [x, y] r in your car, up z (higher than z, as on SHIBUYA SKY's roof), photo [x, y, z] (a photograph
//           with that point in it, taken from within `r` of it or from `above` metres over it; from 'heli': from the
//           helicopter, within `r` of it and `above` metres over it) ; meet: an npc id who,
//           unseen, goes to stand by the next part's speaker }
'use strict';
window.OEWalkTalk = (function () {
  const KEEP = 'bh-walk-talk', ROLL = 'bh-walk-roll';
  // (a speech mark seen from this far, and only over someone in sight; the name under it from this close. It was 42 m:
  // on a phone a person there is a few pixels tall, and on SHIBUYA SKY's roof Taro's mark stood over the glass with
  // him out of sight behind the heliport's deck, a mark over nobody. As an open world's: near enough to see who it is)
  const SEE_M = 24, NAME_M = 11, PLACE_M = 20; // (PLACE_M: a place the street offers, a seat, marked from this far)
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const first = name => String(name || '').replace(/\s*[\u3000-\u9fff\uff00-\uffef].*$/, '').trim(); // (the name as it is read: "Mr Oda 小田さん" is Mr Oda)

  function create(ctx) {
    const people = (ctx.data && ctx.data.people) || [], chat = (ctx.data && ctx.data.chat) || {}, views = (ctx.data && ctx.data.views) || [];
    let roll = {}; // (the views' pictures, small, kept apart from where the stories have got to: walk.views, photo())
    try { roll = JSON.parse(localStorage.getItem(ROLL) || '{}') || {}; } catch (e) { roll = {}; }
    let st = {};
    try { st = JSON.parse(localStorage.getItem(KEEP) || '{}') || {}; } catch (e) { st = {}; }
    const keep = () => { try { localStorage.setItem(KEEP, JSON.stringify(st)); } catch (e) { /* storage blocked */ } };
    const of = s => st[s.id] || (st[s.id] = { part: 0, met: false, done: false });
    let on = false, busy = false;
    // ---- the walk's line (docs/STORY.md "The walk's line"): the one story of the walk that happens to you. Its first
    // part is not found but seen: as you come down at the kerb a man walks into its person's shoulder and walks on, and
    // she is on the ground before anyone understands (incident: { by: { character, from, via, to, speed }, after_s, near,
    // down_s, help, corner }). Nobody is held to it: helped up (E beside her) or left, she is on her feet again and has
    // her part to say; walked away from, she gets up alone. Once it has happened in this browser it does not happen again.
    const lineS = people.find(s => s.incident) || null;
        let inc = null; // { ph: 'wait' | 'come' | 'hit' | 'down' | 'up', t, man, thing, u }
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    function manGoes(dt) {
      const m = inc && inc.man;
      if (!m) return;
      m.animate(dt);
      if (inc.ph === 'come' || inc.ph === 'wait') return;
      if (!m.to && inc.legs.length) { const q = inc.legs.shift(); m.walkTo(q[0], q[1], inc.v); }
      else if (!m.to && (inc.goneT = (inc.goneT || 0) + dt) > 1 && (ctx.unseen(m) || inc.goneT > 90)) { m.remove(); inc.man = null; } // (gone into the station: taken away once nobody sees him)
    }
    function getUp(helped) {
      const n = ctx.npc(lineS.npc), k = of(lineS);
      if (n) { n.sit = false; n.fixed = false; delete n.rig.legRake; }
      if (inc.thing) { inc.thing.remove(); inc.thing = null; }
      k.inc = helped ? 'helped' : 'alone'; inc.ph = 'up'; keep();
    }
    function lineOff() { waitOn = false; if (gate && gate.n) gate.n.fixed = false; gate = null; if (inc) { if (inc.man) inc.man.remove(); if (inc.thing) inc.thing.remove(); inc = null; } if (lineS) { const n = ctx.npc(lineS.npc); if (n) { n.sit = false; n.fixed = false; if (n.rig) delete n.rig.legRake; } } } // (for the checks: the stories from the start, or from another: no incident under way)
    // ---- the line's end (lineS.wait): waited with by the wall until a few minutes before her train (game.js waitWith),
    // she stands ("That's mine"), walks to the station's gate and stops there; asked, she wants one more photograph, not
    // with the lights behind her; shown it, she takes yours, says one thing, goes in, and turns round once. Then she is gone
    // for good in this browser (k.w 'gone'). Left half done (a page closed at the gate), she is by the wall again
    let waitOn = false, gate = null; // gate: { ph: 'walk' | 'ask' | 'shot' | 'shown' | 'going', n }
    const runsOf = (n, lines) => { const runs = []; for (const l of lines || []) { const who = typeof l === 'string' ? n : ctx.npc(l.npc) || n, text = ctx.fill(typeof l === 'string' ? l : l.text); if (runs.length && runs[runs.length - 1][0] === who) runs[runs.length - 1][1].push(text); else runs.push([who, [text]]); } return runs; };
    const faceMe = n => { const me = ctx.here(); if (ctx.shift) ctx.shift(n, n.x, n.y, Math.atan2(me.x - n.x, me.y - n.y)); };
    function gateBegin(n) {
      const W = lineS.wait;
      gate = { ph: 'walk', n }; n.fixed = true;
      bark(n.id, W.up, 3.4);
      setTimeout(() => { if (gate && gate.ph === 'walk') walk(n, W.gate, 1.3, () => { if (!gate) return; gate.ph = 'ask'; faceMe(n); }); }, 1400);
    }
    function gateTalk(n) {
      const W = lineS.wait;
      if (busy || !gate) return false;
      busy = true;
      if (gate.ph === 'ask') { ctx.say(runsOf(n, W.ask), () => { busy = false; if (gate) gate.ph = 'shot'; }); return true; }
      ctx.say(runsOf(n, W.shown), () => {
        if (ctx.snapped) ctx.snapped(); // (she takes yours)
        setTimeout(() => ctx.say(runsOf(n, W.last), () => { busy = false; gateGo(n); }), 900);
      });
      return true;
    }
    function gateGo(n) {
      const W = lineS.wait, k = of(lineS);
      gate.ph = 'going';
      walk(n, W.turn, 1.2, () => { // (in through the gate a few steps, and round once)
        faceMe(n);
        setTimeout(() => walk(n, W.gone, 1.3, () => {
          const t0 = Date.now(), away = () => { if (!gate) return; if (!ctx.unseen || ctx.unseen(n) || Date.now() - t0 > 20000) { if (ctx.hide) ctx.hide(n); n.fixed = false; gate = null; k.w = 'gone'; keep(); } else setTimeout(away, 500); };
          away();
        }), 2600);
      });
    }
    // the incident made ready: she stands where the line has her, looking where it says, and he waits out of the way
    function lineArm() {
      if (!lineS || !ctx.figure) return;
      const k = of(lineS), I = lineS.incident, n = ctx.npc(lineS.npc);
      if (k.inc === 'down') k.inc = 'alone';
      if (n && I.face && !k.rested) ctx.shift(n, n.x, n.y, Math.atan2(I.face[0] - n.x, I.face[1] - n.y));
      if (n && !k.inc && k.part === 0 && !inc) { n.fixed = true; inc = { ph: 'wait', t: 0, legs: [], man: ctx.figure({ character: I.by.character, name: '' }, I.by.from) }; }
    }
    function incident(dt, hide) {
      if (!inc) return;
      const I = lineS.incident, n = ctx.npc(lineS.npc), me = ctx.here(), k = of(lineS);
      if (!n) return;
      manGoes(dt);
      if (inc.ph === 'wait') {
        if (hide || me.mode !== 'foot' || !n.rig || n.rig.pending || (ctx.loaded && !ctx.loaded(I.by.character)) || dist(me, n) > (I.near || 16)) return; // (both of them come as themselves, and the street the player's)
        if ((inc.t += dt) < (I.after_s || 3)) return;
        inc.ph = 'come'; inc.v = I.by.speed || 1.7;
        if (inc.man) inc.man.walkTo(n.x, n.y, inc.v);
      } else if (inc.ph === 'come') {
        const m = inc.man;
        if (m && dist(m, n) > 0.78 && m.to) return;
        // the shoulder: she goes the way he was going, and down; he does not turn
        const d = m ? Math.hypot(n.x - I.by.from[0], n.y - I.by.from[1]) || 1 : 1;
        inc.u = m ? [(n.x - I.by.from[0]) / d, (n.y - I.by.from[1]) / d] : [1, 0];
        inc.legs = [I.by.via, I.by.to].filter(Boolean);
        if (m) m.to = null;
        inc.ph = 'hit'; inc.t = 0; n.fixed = true;
        if (ctx.thud) ctx.thud();
      } else if (inc.ph === 'hit') {
        const T = 0.42, s = Math.min(dt, T - inc.t) / T * 0.6;
        inc.t += dt;
        ctx.shift(n, n.x + inc.u[0] * s, n.y + inc.u[1] * s, n.h + dt * 1.6);
        if (inc.t < T) return;
        n.sit = true; n.rig.legRake = 4; // (sat on the ground where she fell, her legs out in front of her: people.js seat)
        inc.thing = ctx.thing ? ctx.thing(n.x + inc.u[0] * 0.95 - inc.u[1] * 0.4, n.y + inc.u[1] * 0.95 + inc.u[0] * 0.4, { yaw: 0.7 }) : null; // (her phone, face up, a step further on)
        k.inc = 'down'; keep();
        inc.ph = 'down'; inc.t = 0;
      } else if (inc.ph === 'down') {
        if (busy) return;
        if ((inc.t += dt) > (I.down_s || 24) && (dist(me, n) > 6 || inc.t > (I.down_s || 24) * 2)) getUp(false); // (nobody stopped: she gets up by herself)
      }
    }
    // the parts' speakers: the story's own unless a part names another
    const speaker = (s, i) => (s.parts[i] && s.parts[i].npc) || s.npc;
    // One story at a time, in the walk's order (game.json walk.people), as one night's line: the one under way, else the
    // first not yet told. Several begun at once (the owner talked to everyone and could not keep what each had asked) was
    // a list to remember, not a story; now there is always one thing to do and one person with the amber mark
    function current() {
      return people.find(s => { const k = of(s); return !k.done && k.part > 0; }) || people.find(s => !of(s).done) || null;
    }
    // what someone has to say now: a part of the story under way ('story'), a word in passing ('chat': a mark of its
    // own, pale), the word of someone whose story is still to come ('wait': no mark, but E has it), or nothing
    function want(id) {
      if (gate && lineS.npc === id) return gate.ph === 'ask' || gate.ph === 'shown' ? { kind: 'gate' } : null; // (at the gate: her last words, below)
      if (waitOn && lineS.npc === id) return null;
      if (inc && lineS.npc === id && inc.ph !== 'up') return null; // (the walk's line: before she is on her feet again she has nothing to say)
      if (ev && ev.e.people[0] === id && (ev.phase === 'waiting' || ev.phase === 'met')) return { kind: 'event' }; // (a street moment's favour, below)
      if (ev && ev.e.people.includes(id) && ev.phase !== 'gone') return null; // (and its others: they are with them)
      const s = current();
      if (s) { const k = of(s); if (speaker(s, k.part) === id && (k.part === 0 || k.met)) return { kind: 'story', s, k }; }
      if (chat[id] && chat[id].length) return { kind: 'chat', lines: chat[id] };
      for (const q of people) if (of(q).done && q.npc === id && q.after) return { kind: 'chat', lines: q.after };
      for (const q of people) if (!of(q).done && q.npc === id && q.wait) return { kind: 'wait', lines: q.wait };
      return null;
    }
    // the corner's line: what the story under way asks, with the metres to it; before a story is begun, who has it
    // the metres and the way to someone for the corner, and its arrow: on your level, the map's bearing and the metres in
    // plan. On another level (Yuna at the lift's foot while you are on SHIBUYA SKY's roof 226 m over her, where it read
    // "Back to Yuna 15 m", the metres in plan to a point under your feet): the way to them is the lift, so the line says so,
    // and the metres and the arrow are to its stop on your level (ctx.via); with no lift between the two, the arrow stands
    // up or down and the metres are the whole way, the height counted. In the air or a car, the bearing to them and the
    // metres through the air: you can fly or drive there
    function toward(me, n, e = {}) {
      const dz = (n.z || 0) - (me.z || 0);
      Object.assign(e, { m: Math.hypot(n.x - me.x, n.y - me.y), dir: Math.atan2(n.x - me.x, n.y - me.y) });
      if (Math.abs(dz) <= 12) return e;
      if (me.mode !== 'foot') return Object.assign(e, { m: Math.hypot(e.m, dz) });
      const v = ctx.via ? ctx.via(me, n) : null;
      if (v) return Object.assign(e, { text: `${dz < 0 ? 'Down' : 'Up'} the lift to ${first(n.name)}`, m: Math.hypot(v.x - me.x, v.y - me.y), dir: Math.atan2(v.x - me.x, v.y - me.y) });
      return Object.assign(e, { m: Math.hypot(e.m, dz), dir: null, lvl: dz > 0 ? 'up' : 'down' });
    }
    function errand() {
      if (gate && gate.ph === 'going') return null; // (she is going: nothing asked of you while she does)
      if (gate) { const n = ctx.npc(lineS.npc), me = ctx.here(), W = lineS.wait; return n ? toward(me, n, { text: gate.ph === 'walk' ? W.follow : gate.ph === 'ask' ? W.at : gate.ph === 'shot' ? W.goal : `Back to ${first(n.name)}`, key: gate.ph === 'shot' ? 'O' : '' }) : null; } // (the walk's line, its end: at the gate)
      if (inc && inc.ph === 'down') { const n = ctx.npc(lineS.npc), me = ctx.here(); return n ? toward(me, n, { text: lineS.incident.corner || '', key: '' }) : null; } // (the walk's line: what he did, and the metres to her)
      if (inc && inc.ph !== 'up') { const n = ctx.npc(lineS.npc), me = ctx.here(); return n && lineS.incident.lead ? toward(me, n, { text: lineS.incident.lead, key: '', next: true }) : null; } // (before it: where to look, and the way; never what is about to happen)
      if (ev && (ev.phase === 'asked' || ev.phase === 'met')) { // (a favour asked of you on the street: the corner's while it lasts)
        const me = ctx.here(), n = ctx.npc(ev.e.people[0]);
        if (n) return toward(me, n, { text: ev.phase === 'met' ? ev.e.back : ev.e.goal, key: ev.phase === 'asked' ? 'O' : '' });
      }
      const s = current();
      if (!s) return null;
      const k = of(s), me = ctx.here(), who = ctx.npc(speaker(s, k.part));
      // (dir: the way to it on the map, a bearing from north, for the corner's arrow)
      const dirTo = (x, y) => Math.atan2(x - me.x, y - me.y);
      if (k.part === 0) return who ? toward(me, who, { text: `${first(who.name)} has something to say`, key: '', next: true }) : null;
      const then = s.parts[k.part - 1].then || {};
      // (sent on to someone, or what was asked done: the metres are to the one who speaks next)
      if (then.talk && who) return toward(me, who, { text: then.goal, key: '' });
      if (k.met && who) return toward(me, who, { text: then.next || `Back to ${first(who.name)}${then.back ? `, ${then.back}` : ''}`, key: '' });
      const sn = then.shot ? ctx.npc(then.shot) : null; // (a photograph with someone in it: the metres are to them)
      const at = then.go || then.drive || then.photo || (sn ? [sn.x, sn.y] : null);
      return { text: then.goal || '', m: at ? Math.hypot(at[0] - me.x, at[1] - me.y) : null, dir: at ? dirTo(at[0], at[1]) : null, key: then.key || '' };
    }
    // a part said: the next is waiting, or the story is put away
    function said(s) {
      const k = of(s), part = s.parts[k.part], then = part.then;
      k.part++; k.met = !!(then && then.talk);
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
      if (w.kind === 'event') { busy = false; return evTalk(n); }
      if (w.kind === 'gate') { busy = false; return gateTalk(n); }
      if (w.kind === 'story') {
        const part = w.s.parts[w.k.part], runs = [];
        for (const l of (w.k.inc === 'alone' && part.alone) || part.lines) { // (alone: what she says to someone who did not stop)
          const who = typeof l === 'string' ? n : ctx.npc(l.npc) || n, text = ctx.fill(typeof l === 'string' ? l : l.text);
          if (runs.length && runs[runs.length - 1][0] === who) runs[runs.length - 1][1].push(text); else runs.push([who, [text]]);
        }
        ctx.say(runs, () => { said(w.s); done(); });
        return true;
      }
      const lines = w.lines; // (a word in passing, or the word of someone whose story is to come: one after another)
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
        if (met) { k.met = true; keep(); if (ctx.met) ctx.met(s, ctx.npc(speaker(s, k.part))); }
      }
      // a story told whose person goes somewhere else for the rest of the night (rest: [x, y], facing `rest_to`): there
      // when you next come, never seen going
      for (const s of people) {
        const k = of(s);
        if (!k.done || !s.rest || k.rested || k.w === 'gone') continue;
        const n = ctx.npc(s.npc);
        if (n && Math.hypot(n.x - me.x, n.y - me.y) > 28 && Math.hypot(s.rest[0] - me.x, s.rest[1] - me.y) > 22 && ctx.unseen(n) && ctx.put && ctx.put(n, s.rest, s.rest_to)) { k.rested = true; keep(); }
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
          k.moved = k.meet; delete k.meet; keep();
        }
      }
    }
    // a photograph was taken (game.js snapPhoto): a story waiting on one of a place is met if the place is in it
    function photo(cam) {
      let hit = null;
      if (gate && gate.ph === 'shot') { const n = ctx.npc(lineS.npc), me = ctx.here(), d = n ? dist(me, n) : 1e9; if (n && d < 14 && d > 1 && cam.sees(n.x, n.y, (n.z || 0) + 1.3)) { gate.ph = 'shown'; if (ctx.met) ctx.met(null, n); return true; } } // (her last photograph, at the gate)
      if (ev && ev.phase === 'asked' && ev.e.kind === 'photo') { // (them, from close by: the favour done, and the corner sends you back to show them)
        const n = ctx.npc(ev.e.people[0]), me = ctx.here();
        if (n && Math.hypot(n.x - me.x, n.y - me.y) < 14 && cam.sees(n.x, n.y, n.z + 1.5)) { ev.phase = 'met'; if (ctx.met) ctx.met(null, n); }
      }
      for (const s of people) {
        const k = of(s);
        if (k.done || k.part === 0 || k.met) continue;
        const then = s.parts[k.part - 1].then || {};
        if (then.shot) { // (a photograph with someone in it: taken from near them, with them in the frame)
          const n = ctx.npc(then.shot), me = ctx.here(), d = n ? dist(me, n) : 1e9;
          if (n && d < (then.r || 14) && d > 1 && cam.sees(n.x, n.y, (n.z || 0) + 1.3)) { k.met = true; hit = s; }
          continue;
        }
        if (!then.photo) continue;
        const [x, y, z] = then.photo, me = ctx.here();
        const near = Math.hypot(x - me.x, y - me.y) < (then.r || 25), high = then.above != null && cam.z - z > then.above;
        // (from the helicopter: over the place, within r of it, and that high; otherwise from in it or from up high)
        const ok = then.from === 'heli' ? me.mode === 'heli' && near && high : near || high;
        if (ok && cam.sees(x, y, z)) { k.met = true; hit = s; }
      }
      if (hit) { keep(); if (ctx.met) ctx.met(hit, ctx.npc(speaker(hit, of(hit).part))); }
      // and the views of Shibuya (game.json walk.views): each the first time it is in a photograph from where it is seen
      const seen = (st._views = st._views || {}), me = ctx.here();
      for (const v of views) {
        if (seen[v.id]) continue;
        const [x, y, z] = v.at, d = Math.hypot(x - me.x, y - me.y);
        if (d > (v.r || 30) || (v.above != null && cam.z - z < v.above) || (v.below != null && cam.z > v.below) || !cam.sees(x, y, z)) continue;
        seen[v.id] = { when: ctx.when ? ctx.when() : '' };
        let pic = null; try { pic = cam.thumb ? cam.thumb() : null; } catch (e) { pic = null; }
        if (pic) { roll[v.id] = pic; try { localStorage.setItem(ROLL, JSON.stringify(roll)); } catch (e) { delete roll[v.id]; } } // (a full store keeps the find without its picture)
        keep();
        const n = views.filter(q => seen[q.id]).length;
        if (ctx.view) ctx.view(v, n, views.length);
        break; // (one a photograph: two at once would put one name over the other)
      }
      return !!hit;
    }

    // ---- street moments (game.json walk.events): every two or three minutes someone of the street with a small favour to
    // ask (a photograph of them, the way somewhere), put where they would stand at one of event_spots, out of the player's
    // sight and between 30 and 110 m away, so that they are found, not seen arriving. One at a time; nothing to fail and
    // nothing kept. Unanswered for two and a half minutes, or left far behind, they go, unseen; a favour asked and walked
    // away from lapses the same way. As an open world's random encounters (Red Dead Redemption 2's strangers on the road,
    // GTA's random events, Yakuza's street events), in the walk's own small scale.
    const events = (ctx.data && ctx.data.events) || [], spots = (ctx.data && ctx.data.event_spots) || [];
    const rnd = ctx.rand || Math.random;
    let ev = null, evNext = 75 + rnd() * 45, evLast = null, evDone = 0;
    function evBegin(e, at) {
      if (!ctx.place || !at) return false;
      const ns = e.people.map(id => ctx.npc(id));
      if (ns.some(n => !n)) return false;
      const spot = (n, i) => (i ? [at[0] + 1.1 * i, at[1] - 0.4] : at);
      // (they walk in to where they stop, from a dozen metres off along a clear way, out of sight; with none, they are there)
      const from = ctx.clear ? away(at, 12, 16) : null;
      ns.forEach((n, i) => {
        const to = spot(n, i);
        if (from) { ctx.place(n, [from[0] + (to[0] - at[0]), from[1] + (to[1] - at[1])], null); walk(n, to, 1.25, () => face(n, i ? ns[0] : null)); }
        else ctx.place(n, to, i ? ns[0] : null);
      });
      ev = { e, at, phase: 'waiting', t: 0 }; evLast = e.id;
      return true;
    }
    // a point d metres from p along a clear way (ctx.clear: on foot, off the road, nothing in the way), else null; unseen
    // too where they come from (a walk in is found, not seen arriving), but not where they go (a walk off is seen going)
    function away(p, d, tries = 12, unseen = true) {
      const a0 = rnd() * Math.PI * 2;
      for (let k = 0; k < tries; k++) {
        const a = a0 + k * 2.4, q = [p[0] + Math.sin(a) * d, p[1] + Math.cos(a) * d];
        if (ctx.clear(p[0], p[1], q[0], q[1]) && (!unseen || !ctx.unseenAt || ctx.unseenAt(q[0], q[1], 16))) return q;
      }
      return null;
    }
    const face = (n, to) => { const t = to || { x: 368, y: -1002 }; if (ctx.step) ctx.step(n, n.x, n.y, Math.atan2(t.x - n.x, t.y - n.y), 0); };
    // someone walking from where they are to `to` at `speed`, then `then`: stepped each frame by street()
    const moving = new Map();
    function walk(n, to, speed, then) { moving.set(n.id, { n, to, speed, then }); }
    function stepWalkers(dt) {
      for (const [id, m] of moving) {
        const dx = m.to[0] - m.n.x, dy = m.to[1] - m.n.y, d = Math.hypot(dx, dy), h = Math.atan2(dx, dy);
        if (d <= m.speed * dt || d < 0.05) { moving.delete(id); if (ctx.step) ctx.step(m.n, m.to[0], m.to[1], h, 0); if (m.then) m.then(); continue; }
        if (m.n.talking) { if (ctx.step) ctx.step(m.n, m.n.x, m.n.y, m.n.h, 0); continue; } // (stopped to talk)
        if (ctx.step) ctx.step(m.n, m.n.x + dx / d * m.speed * dt, m.n.y + dy / d * m.speed * dt, h, m.speed);
      }
    }
    // the moment over: they walk off along a clear way, together, and are put away once nobody sees them
    function leave() {
      if (!ev || ev.phase === 'gone') return;
      ev.phase = 'gone'; ev.t = 0;
      const ns = ev.e.people.map(id => ctx.npc(id)).filter(Boolean);
      const to = ns[0] && ctx.clear ? away([ns[0].x, ns[0].y], 26, 12, false) || away([ns[0].x, ns[0].y], 14, 12, false) : null;
      if (to) ns.forEach(n => walk(n, [to[0] + (n.x - ns[0].x), to[1] + (n.y - ns[0].y)], 1.3, null));
    }
    function street(dt, hide) {
      stepWalkers(dt);
      const me = ctx.here();
      if (!ev) {
        if (!events.length || me.mode !== 'foot' || hide || busy) return;
        if (lineS && (waitOn || gate || (inc && inc.ph !== 'up') || (of(lineS).part > 0 && !of(lineS).done))) return; // (not while the walk's line has the street: one thing happens at a time)
        if ((evNext -= dt) > 0) return;
        evNext = 12; // (none fit now: asked again in a while)
        const pick = events.filter(e => e.id !== evLast && !e.people.some(id => people.some(s => speaker(s, of(s).part) === id)));
        const e = pick[Math.floor(rnd() * pick.length)];
        const at = spots.filter(p => { const d = Math.hypot(p[0] - me.x, p[1] - me.y); return d > 30 && d < 110 && Math.abs((me.z || 0) - 15) < 12 && (!ctx.unseenAt || ctx.unseenAt(p[0], p[1], 16)); })[0];
        if (e && at) evBegin(e, at);
        return;
      }
      ev.t += dt;
      const n = ctx.npc(ev.e.people[0]), d = n ? Math.hypot(n.x - me.x, n.y - me.y) : Infinity;
      if (ev.phase === 'waiting' && (ev.t > 150 || d > 160)) leave();
      else if ((ev.phase === 'asked' || ev.phase === 'met') && (ev.t > 150 || d > 70)) leave(); // (a favour walked away from: they ask someone else)
      if (ev.phase === 'gone') {
        const ns = ev.e.people.map(id => ctx.npc(id)).filter(Boolean);
        if (ns.every(q => !moving.has(q.id) && Math.hypot(q.x - me.x, q.y - me.y) > 25 && (!ctx.unseen || ctx.unseen(q))) || (ev.t > 40 && ns.every(q => !ctx.unseen || ctx.unseen(q)))) { ns.forEach(q => { moving.delete(q.id); if (ctx.hide) ctx.hide(q); }); ev = null; evNext = 120 + rnd() * 80; }
      }
    }
    function evTalk(n) {
      const e = ev.e, run = lines => { const runs = []; for (const l of lines) { const who = typeof l === 'string' ? n : ctx.npc(l.npc) || n, text = ctx.fill(typeof l === 'string' ? l : l.text); if (runs.length && runs[runs.length - 1][0] === who) runs[runs.length - 1][1].push(text); else runs.push([who, [text]]); } return runs; };
      busy = true;
      if (ev.phase === 'met') { ctx.say(run(e.thanks), () => { busy = false; evDone++; leave(); }); return true; }
      if (e.kind === 'photo') { ctx.say(run(e.ask), () => { busy = false; if (ev) { ev.phase = 'asked'; ev.t = 0; } }); return true; }
      // (the way: the answers are choices, and the right one is thanked; the other, a shrug)
      const ask = run(e.ask), last = ask.pop();
      const choose = () => ctx.ask ? ctx.ask(last[0], last[1], e.choices, c => { const right = !!(c && c.right); ctx.say(run(right ? e.right : e.wrong), () => { busy = false; if (right) evDone++; leave(); }); }) : (busy = false);
      if (ask.length) ctx.say(ask, choose); else choose();
      return true;
    }

    // ---- a call-out: someone with something for you calls you over the first time you come near (a story's giver, its
    // `bark`; a street moment's, its event's), a few words in a small bubble over their mark for a few seconds, and again
    // only after a minute and a half: an open world's people bark, and a player learns that the marked will talk without a
    // line that says so
    const barks = new Map(), barked = {};
    let bClock = 0;
    function bark(id, text, secs = 3.6) {
      const n = ctx.npc(id);
      if (!n || !text) return false;
      let b = barks.get(id);
      if (!b) { const el = document.createElement('div'); el.className = 'g-walk-bark'; layer.appendChild(el); b = { el }; barks.set(id, b); }
      b.el.textContent = ctx.fill(text); b.t = secs; b.el.style.opacity = '0';
      barked[id] = bClock;
      if (ctx.called) ctx.called(n); // (and a wave from them, game.js)
      return true;
    }
    function barkNear(me, hide) {
      if (hide || busy || me.mode !== 'foot' || waitOn || gate) return; // (nobody calls you over while you wait with her or walk her to her train)
      const cur = current(), k = cur ? of(cur) : null;
      const who = [];
      if (cur && k.part === 0 && cur.bark) who.push([cur.npc, cur.bark]);
      if (ev && ev.phase === 'waiting' && ev.e.bark) who.push([ev.e.people[0], ev.e.bark]);
      for (const [id, text] of who) {
        const n = ctx.npc(id);
        if (!n || !n.rig || n.rig.pending || !n.rig.root.visible || n.talking || moving.has(id)) continue;
        if (Math.hypot(n.x - me.x, n.y - me.y) > 18 || Math.abs((n.z || 0) - (me.z || 0)) > 6 || bClock - (barked[id] ?? -1e9) < 90) continue; // (not through a floor)
        bark(id, text);
      }
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
    const fade = (el, v) => { if (el && el._o !== v) { el._o = v; el.style.opacity = v; } }; // (written only when it changes: a style set each frame is a style pass each frame)
    // whether someone's head is in the player's sight (ctx.seen: no wall, deck or floor between the camera and it), asked
    // again every eighth frame and kept between: a ray through the city's solids each frame for each mark is not free
    const sightOf = new Map();
    function sight(id, n) {
      if (!ctx.seen) return true;
      let s = sightOf.get(id);
      if (!s) sightOf.set(id, s = { ok: false, n: 0 });
      if (--s.n <= 0) { s.ok = ctx.seen(n.x, n.y, (n.z || 0) + 1.6); s.n = 8; }
      return s.ok;
    }
    function draw(hide, dt = 0) {
      const me = ctx.here(), ids = new Set();
      bClock += dt;
      for (const [id, b] of barks) { // (the call-outs over the marks, their few seconds)
        const n = ctx.npc(id);
        if (b.t <= 0) continue;
        b.t -= dt;
        const p = n && !hide && n.rig && n.rig.root.visible ? ctx.project(n.x, n.y, n.z + 2.62) : null;
        const o = !p || b.t <= 0 ? '0' : b.t < 0.6 ? (b.t / 0.6).toFixed(2) : '1';
        if (b.el._o !== o) { b.el._o = o; b.el.style.opacity = o; }
        if (p) b.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      }
      for (const s of people) { ids.add(s.npc); for (const p of s.parts) if (p.npc) ids.add(p.npc); }
      for (const id of Object.keys(chat)) ids.add(id);
      for (const e of events) for (const id of e.people) ids.add(id);
      for (const id of ids) {
        const n = ctx.npc(id), el = marks.get(id);
        if (!n || hide || !n.rig || n.rig.pending || !n.rig.root.visible || n.talking) { fade(el, '0'); continue; } // (nobody's mark before they are there to be seen)
        const w = want(id), d = Math.hypot(n.x - me.x, n.y - me.y), dz = Math.abs((n.z || 0) - (me.z || 0));
        const far = w && (w.kind === 'story' || w.kind === 'event' || w.kind === 'gate') ? SEE_M : 18;
        if (!w || w.kind === 'wait' || d > far || dz > 12 || me.mode !== 'foot') { fade(el, '0'); continue; } // (and not through a floor: sight)
        const p = ctx.project(n.x, n.y, n.z + 2.12);
        const e = mark(id);
        if (!p || !sight(id, n)) { fade(e, '0'); continue; }
        const k = w.kind === 'gate' ? 'story' : w.kind; // (at the station her mark is a story's: amber)
        if (e._k !== k) { e._k = k; e.dataset.k = k; }
        const name = d < NAME_M ? `${first(n.name)}${n.role ? ` · ${String(n.role).replace(/\s*[　-鿿＀-￯].*$/, '')}` : ''}` : '';
        if (e._n !== name) { e._n = name; e.querySelector('span').textContent = name; e.classList.toggle('named', !!name); }
        fade(e, String(Math.round(Math.max(0, Math.min(1, (far - d) / 8)) * 20) / 20));
        e.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${Math.max(0.72, Math.min(1, 14 / Math.max(1, d))).toFixed(3)})`;
      }
      // what the street offers besides its people (ctx.places: a free place on a wall to sit and watch the crossing
      // from, until it has been sat on once in this browser): a pale mark over the place from a little way off, named
      // from close, as a word in passing is; the prompt beside it does the rest (issue 146)
      const places = ctx.places ? ctx.places() : [];
      for (const [id, el] of marks) if (id.startsWith('place:') && !places.some(s => `place:${s.id}` === id)) fade(el, '0');
      for (const s of places) {
        const id = `place:${s.id}`, d = Math.hypot(s.x - me.x, s.y - me.y);
        if (hide || d > PLACE_M || d < 1.2 || Math.abs((s.z || 0) - (me.z || 0)) > 3 || me.mode !== 'foot') { fade(marks.get(id), '0'); continue; }
        const p = ctx.project(s.x, s.y, (s.z || 0) + 1.5), e = mark(id);
        if (!p || !sight(id, { x: s.x, y: s.y, z: (s.z || 0) - 0.1 })) { fade(e, '0'); continue; }
        if (e._k !== 'place') { e._k = 'place'; e.dataset.k = 'place'; }
        const name = d < NAME_M ? s.label : '';
        if (e._n !== name) { e._n = name; e.querySelector('span').textContent = name; e.classList.toggle('named', !!name); }
        fade(e, String(Math.round(Math.max(0, Math.min(1, (PLACE_M - d) / 6)) * 20) / 20));
        e.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${Math.max(0.72, Math.min(1, 14 / Math.max(1, d))).toFixed(3)})`;
      }
    }
    return {
      // on the walk (game.js startWalk, walkOnFromStory): the marks are drawn
      begin() {
        on = true; layer.classList.add('on');
        // (a walk taken up again in this browser: whoever went to meet someone is with them already, as they were left)
        for (const s of people) {
          const k = of(s), id = k.moved || k.meet, m = id && ctx.npc(id), to = ctx.npc(speaker(s, k.part));
          if (m && to) { ctx.move(m, to, id); k.moved = id; delete k.meet; }
          if (k.rested && s.rest && ctx.put) { const n = ctx.npc(s.npc); if (n) ctx.put(n, s.rest, s.rest_to); }
          if (s === lineS && k.w === 'gone' && ctx.hide) { const n = ctx.npc(s.npc); if (n) ctx.hide(n); } // (gone home on her train: not on the walk again)
        }
        // the walk's line: its incident still to come (never seen in this browser), or seen and left (she got up alone)
        lineArm();
        keep();
      },
      want, talk, photo, errand,
      // someone on the ground beside you: what is offered (the words of the prompt), and taking it
      lineAgain() { lineOff(); if (lineS) { delete st[lineS.id]; const n = ctx.npc(lineS.npc); if (n && ctx.put) ctx.put(n, lineS.at || [n.x, n.y]); } lineArm(); keep(); }, // (for the checks: the incident from its start)
      // beside her by the wall once her story is told: wait with her for her train (the words of the prompt), and taking it
      waits: id => (lineS && lineS.wait && id === lineS.npc && of(lineS).done && (of(lineS).rested || (n => n && lineS.rest && Math.hypot(n.x - lineS.rest[0], n.y - lineS.rest[1]) < 3)(ctx.npc(id))) && !waitOn && !gate && of(lineS).w !== 'gone' ? ctx.fill(lineS.wait.verb) : ''),
      wait(n) {
        if (!ctx.waitWith || waitOn || gate || busy) return false;
        const W = lineS.wait;
        waitOn = true;
        const ok = ctx.waitWith(n, { beside: W.beside, before: W.before || 3, says: W.says, say: line => bark(n.id, line, 4.5), done: () => { waitOn = false; gateBegin(n); }, cancel: () => { waitOn = false; n.fixed = false; } });
        if (!ok) waitOn = false;
        return ok;
      },
      helps: id => (inc && inc.ph === 'down' && lineS.npc === id ? lineS.incident.help || 'Help her up' : ''),
      help(n) { if (!inc || inc.ph !== 'down' || busy) return false; getUp(true); return talk(n); },
      line: () => (lineS ? { ph: inc ? inc.ph : '', inc: of(lineS).inc || '', part: of(lineS).part, done: !!of(lineS).done, man: inc && inc.man ? [+inc.man.x.toFixed(1), +inc.man.y.toFixed(1)] : null, at: (n => (n ? [+n.x.toFixed(1), +n.y.toFixed(1), n.rig && n.rig.pending ? 'pending' : n.sit ? 'down' : 'up'] : null))(ctx.npc(lineS.npc)) , gate: gate ? gate.ph : '', wait: waitOn, w: of(lineS).w || '' } : null),
      // each frame on the walk: what was asked met, and the marks drawn (hide: a talk, a menu, the camera up)
      tick(dt, hide) { if (!on) return; incident(dt, hide); check(); street(dt, hide); barkNear(ctx.here(), hide); draw(hide, dt); },
      // the street moments, for the checks: start one now (by its id, at one of event_spots), and where it stands
      events: { start: (id, i) => { const e = events.find(q => q.id === id); return e ? evBegin(e, spots[i || 0]) : false; }, get now() { return ev ? { id: ev.e.id, phase: ev.phase } : null; }, get done() { return evDone; }, get moving() { return moving.size; } },
      bark, // (someone calls out: the walk's way in ends on the first story's giver calling you over)
      get barked() { return Object.keys(barked); }, // (who has called out, for the checks)
      get busy() { return busy; },
      // where each story has got to, for the checks; and from the start again
      state: () => JSON.parse(JSON.stringify(st)),
      reset() { st = {}; roll = {}; lineOff(); keep(); try { localStorage.removeItem(ROLL); } catch (e) { /* storage blocked */ } },
      // the views of Shibuya for the menu's album: each found (with its picture and when) or still to find (with its hint)
      views: () => views.map(v => { const f = (st._views || {})[v.id]; return { id: v.id, name: v.name, hint: v.hint || '', found: !!f, when: f ? f.when : '', pic: roll[v.id] || null }; }),
      // (for the checks: every story before this one told, so that it is the one under way)
      startAt(id) { st = {}; lineOff(); for (const s of people) { if (s.id === id) break; Object.assign(of(s), { part: s.parts.length, met: false, done: true }); } keep(); },
      count: () => ({ done: people.filter(s => of(s).done).length, of: people.length }),
      // the walk's stories for its menu, as a game's list of side stories: told, under way (what was asked), or not yet met
      // (where to look: the story's hint, never its giver on a map)
      // (one under way, or the next with where to look; the rest later tonight, in their order)
      list() {
        const cur = current();
        return people.map(s => {
          const k = of(s);
          if (k.done) return { title: s.title, state: 'told', text: 'Told' };
          if (s !== cur) return { title: s.title, state: 'later', text: 'Later tonight' };
          if (k.part > 0) { const e = errand(); return { title: s.title, state: 'asked', text: (e && e.text) || '' }; }
          return { title: s.title, state: 'next', text: s.hint || '' };
        });
      },
      people,
    };
  }
  return { create };
})();
