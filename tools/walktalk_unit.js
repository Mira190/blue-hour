// The walk's people, talked to in any order (web/game/walktalk.js), without a browser: every story played in random orders
// with the walk's line's incident falling at any point of them (helped up or left), and after every step everyone with
// something to say is talked to. Each talk must be lines of words, said by someone; the line's person, once on her feet,
// must have her first part to say whatever story is under way. Helped up while Mei's story was begun, Nagi was asked for
// a word in waiting and her line's wall (an object, then under the same key as the other stories' waiting words) was
// said as a line: the box opened on her name with nothing in it, and no press passed it (November 2026).
//   node tools/walktalk_unit.js            (RUNS=400 STEPS=40)
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..');
const RUNS = +(process.env.RUNS || 400), STEPS = +(process.env.STEPS || 40);
let fails = 0;
const fail = m => { fails++; if (fails <= 20) console.log(`FAIL ${m}`); };

const store = {};
const el = () => ({ classList: { add() {}, toggle() {}, remove() {} }, appendChild() {}, setAttribute() {}, dataset: {}, style: {}, querySelector: () => el() });
global.window = global;
global.document = { createElement: el };
global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } };
eval(fs.readFileSync(path.join(R, 'web/game/walktalk.js'), 'utf8')); // (defines window.OEWalkTalk)
const G = JSON.parse(fs.readFileSync(path.join(R, 'web/data/shibuya/game.json'), 'utf8'));
const W0 = G.walk || {}, people = W0.people || [], chat = W0.chat || {};

// what the walk's data says, by kind: words are strings; a line in a part is words or { npc, text }
const words = (a, where) => { if (!Array.isArray(a) || !a.length || a.some(t => typeof t !== 'string' || !t.trim())) fail(`${where}: not a list of words`); };
for (const s of people) {
  for (const [i, p] of (s.parts || []).entries()) {
    for (const k of ['lines', 'alone']) if (p[k] != null) { if (!Array.isArray(p[k]) || p[k].some(l => typeof l === 'string' ? !l.trim() : !(l && typeof l.text === 'string' && l.text.trim() && typeof l.npc === 'string'))) fail(`${s.id} part ${i} ${k}: not lines of words`); }
  }
  for (const k of ['after', 'wait']) if (s[k] != null) words(s[k], `${s.id}.${k}`);
}
for (const [id, a] of Object.entries(chat)) words(a, `chat.${id}`);

// a fixed random, so that a failure is played again
let seed = 1;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];

const npcs = {};
const npc = id => npcs[id] || (npcs[id] = { id, name: id, x: 377, y: -1015, z: 0, rig: { root: { visible: false } } });
const ids = [...new Set([...people.flatMap(s => [s.npc, ...(s.parts || []).map(p => p.npc).filter(Boolean), ...(s.parts || []).flatMap(p => (p.lines || []).map(l => l && l.npc).filter(Boolean))]), ...Object.keys(chat)])];
let heard = null;
const ctx = {
  data: W0, stage: el(), npc,
  here: () => ({ x: 377, y: -1014, z: 0, mode: 'foot' }),
  fill: t => t, unseen: () => false, shift() {}, put: () => false, move() {},
  say: (runs, done) => { heard = runs; done(); },
};
const KEEP = 'bh-walk-talk';
const st = () => JSON.parse(store[KEEP] || '{}');
const line = people.find(s => s.incident);
let talks = 0, nagiFirst = 0;
for (let r = 0; r < RUNS; r++) {
  seed = r + 1;
  for (const k of Object.keys(store)) delete store[k];
  const fallAt = Math.floor(rnd() * STEPS * 0.6), how = rnd() < 0.5 ? 'helped' : 'alone';
  for (let t = 0; t < STEPS; t++) {
    if (line && t === fallAt) { const s = st(); const k = s[line.id] || (s[line.id] = { part: 0, met: false, done: false }); if (!k.inc && !k.done && k.part === 0) { k.inc = how; store[KEEP] = JSON.stringify(s); } }
    // everyone asked what they have to say now (each on a walk as it stands: asked, not told): words, or nothing
    for (const id of ids) {
      const W = OEWalkTalk.create(ctx), w = W.want(id);
      if (!w) continue;
      const before = store[KEEP];
      heard = null;
      if (!W.talk(npc(id))) { fail(`run ${r} step ${t}: ${id} has ${w.kind} to say and the talk did not open`); continue; }
      talks++;
      if (!heard || !heard.length || heard.some(([who, ls]) => !who || !who.id || !Array.isArray(ls) || !ls.length || ls.some(l => typeof l !== 'string' || !l.trim())))
        fail(`run ${r} step ${t}: ${id} (${w.kind}) said ${JSON.stringify(heard && heard.map(([who, ls]) => [who && who.id, ls]))}`);
      store[KEEP] = before; // (the play below moves the stories on)
    }
    const W = OEWalkTalk.create(ctx);
    // the line's person on her feet with her first part unsaid: it is hers to say, whatever story is under way
    if (line) { const k = st()[line.id]; if (k && k.inc && k.part === 0 && !k.done) { const w = W.want(line.npc); if (!w || w.kind !== 'story' || w.s !== line) fail(`run ${r} step ${t}: ${line.npc} is on her feet (${k.inc}) and has ${w ? w.kind : 'nothing'} to say, not her story`); else nagiFirst++; } }
    // one step of play: talk to someone, or do what the story under way asked (it is met)
    if (rnd() < 0.6) { const id = pick(ids); if (W.want(id)) W.talk(npc(id)); }
    else { const s = st(); for (const q of people) { const k = s[q.id]; if (k && !k.done && k.part > 0 && !k.met && rnd() < 0.7) { k.met = true; break; } } store[KEEP] = JSON.stringify(s); }
  }
}
// A returning visit (the owner's still, 27 November 2026): this browser kept her fall (helped, left, or still on the
// ground when the page closed) but not her first part, with Oda's story under way. The incident is played again, the
// corner leads to her and nobody else is begun meanwhile, her first words fit what was seen this visit, and only once
// they are said is the fall kept. And a man whose model never comes does not hold the walk's hook for ever.
let visits = 0;
if (line) {
  const I = line.incident, taxi = people.find(s => s.id === 'taxi');
  for (const [was, how, modelIn, outOfSight] of [['helped', 'helped', true], ['alone', 'alone', true], ['down', 'helped', false], ['helped', 'alone', false], ['helped', 'helped', true, true]]) {
    for (const k of Object.keys(store)) delete store[k];
    const kept = { [line.id]: { part: 0, met: false, done: false, inc: was } };
    if (taxi) kept[taxi.id] = { part: 1, met: false, done: false };
    store[KEEP] = JSON.stringify(kept);
    const her = npc(line.npc); Object.assign(her, { x: 374, y: -1018, z: 0, h: 0, rig: { root: { visible: true } }, sit: false, fixed: false });
    let me = { x: 377, y: -1014, z: 0, mode: 'foot' }, hurried = 0, looked = 0;
    const man = { x: I.by.from[0], y: I.by.from[1], to: null, v: 0, rig: {}, walkTo(x, y, v) { this.to = [x, y]; this.v = v; }, animate(dt) { if (!this.to) return; const dx = this.to[0] - this.x, dy = this.to[1] - this.y, d = Math.hypot(dx, dy), s = this.v * dt; if (d <= s) { this.x = this.to[0]; this.y = this.to[1]; this.to = null; } else { this.x += dx / d * s; this.y += dy / d * s; } }, remove() {} };
    const W = OEWalkTalk.create(Object.assign({}, ctx, { here: () => me, figure: () => man, loaded: () => modelIn, hurry: () => { hurried++; }, look: () => { looked++; }, unseen: () => !!outOfSight, thing: () => ({ remove() {} }), shift: (n, x, y, h) => { n.x = x; n.y = y; if (h != null) n.h = h; } }));
    W.begin();
    const tag = `returning visit (kept ${was}, ${modelIn ? 'his model in' : 'his model never comes'}${outOfSight ? ', she kept out of sight' : ''})`;
    if (W.line().ph !== 'wait') { fail(`${tag}: the incident is not played again (${JSON.stringify(W.line())})`); continue; }
    if (!hurried) fail(`${tag}: his pictures are not hurried`);
    if (W.want(line.npc)) fail(`${tag}: before the fall she already has ${W.want(line.npc).kind} to say`);
    const e0 = W.errand();
    if (!e0 || e0.text !== I.lead) fail(`${tag}: while it waits the corner says "${e0 && e0.text}", not its lead to her`);
    if (taxi && W.list().find(q => q.title === taxi.title).text !== taxi.parts[0].then.goal) fail(`${tag}: the menu's line for Oda's story is not what he asked`);
    for (const s of people) if (s !== line && of(W, s).part === 0 && W.want(s.npc) && W.want(s.npc).kind === 'story') fail(`${tag}: ${s.npc} offers a story to begin while the walk's line waits`);
    let t = 0;
    for (; t < 400 && W.line().ph !== 'down'; t += 0.1) W.tick(0.1, false);
    if (W.line().ph !== 'down') { fail(`${tag}: after ${t.toFixed(0)} s nobody has walked into her (${JSON.stringify(W.line())})`); continue; }
    if (outOfSight && looked !== 1) fail(`${tag}: the view was eased round to her ${looked} times, not once`);
    if (W.line().startedAt < (I.calm_s ?? 25)) fail(`${tag}: it began ${W.line().startedAt} s into control`);
    if (!/walked into her/.test(W.errand().text)) fail(`${tag}: she is down and the corner says "${W.errand().text}"`);
    if (how === 'helped') { heard = null; if (!W.help(her)) fail(`${tag}: Help her up did nothing`); }
    else { me = { x: 400, y: -990, z: 0, mode: 'foot' }; for (let u = 0; u < 120 && W.line().ph === 'down'; u += 0.1) W.tick(0.1, false); me = { x: 375, y: -1016, z: 0, mode: 'foot' }; heard = null; if (W.line().ph !== 'up') fail(`${tag}: left, she does not get up`); else { const e = W.errand(); if (!e || !/^nagi has something to say/i.test(e.text)) fail(`${tag}: on her feet with her words unsaid, the corner says "${e && e.text}"`); W.talk(her); } }
    const first = heard && heard[0] && heard[0][1][0], want0 = (how === 'alone' ? line.parts[0].alone : null) || line.parts[0].lines;
    if (first !== want0[0]) fail(`${tag}: ${how}, her first words are "${first}", not "${want0[0]}"`);
    const k = JSON.parse(store[KEEP])[line.id];
    if (k.part !== 1 || k.inc !== how) fail(`${tag}: her first part said, the fall is not kept (${JSON.stringify(k)})`);
    const e1 = W.errand();
    if (!e1 || e1.text !== line.parts[0].then.goal) fail(`${tag}: her part said, the corner says "${e1 && e1.text}"`);
    // and the visit after that: no incident, her story where it was
    const W2 = OEWalkTalk.create(Object.assign({}, ctx, { here: () => me, figure: () => man, loaded: () => true }));
    W2.begin();
    if (W2.line().ph) fail(`${tag}: her first part said, a later visit plays the incident again`);
    visits++;
  }
}
// The corner's rule (the owner, 27 November 2026: "if I come in right next to Nagi, shouldn't the corner be Nagi's?"):
// a story begun stays the corner's, whoever is near; with none begun it leads to the one story there is to begin (each
// later story's first words name the one before: "Mr Oda sent you?", so the next is never a choice); the walk's line's
// incident takes it while it is to come and while she is down. Nearness shows on the marks, never on the corner.
if (line) {
  const mei = people.find(s => s.id === 'hachiko'), taxi = people.find(s => s.id === 'taxi');
  const corner = (kept, at) => { for (const k of Object.keys(store)) delete store[k]; store[KEEP] = JSON.stringify(kept); const n = npc(line.npc); Object.assign(n, { x: 374, y: -1018, rig: { root: { visible: true } }, sit: false }); const man = { x: 371, y: -1020, rig: {}, walkTo() {}, animate() {}, remove() {} }; const W = OEWalkTalk.create(Object.assign({}, ctx, { here: () => at, figure: () => man, loaded: () => true, look() {}, hurry() {}, unseen: () => false })); W.begin(); return W; };
  const told = s => ({ part: s.parts.length, met: false, done: true, inc: 'helped', rested: true });
  let W = corner({}, { x: 377, y: -1014, z: 0, mode: 'foot' });
  if ((W.errand() || {}).text !== line.incident.lead) fail(`nothing begun, beside her: the corner says "${(W.errand() || {}).text}", not the incident's lead`);
  if (mei) { W = corner({ [line.id]: told(line) }, { x: 377, y: -1014, z: 0, mode: 'foot' }); if (!/^mei has something/i.test((W.errand() || {}).text)) fail(`her story told, nothing else begun: the corner says "${(W.errand() || {}).text}", not Mei's`); }
  if (mei && taxi) {
    W = corner({ [line.id]: told(line), [mei.id]: told(mei), [taxi.id]: { part: 1, met: false, done: false } }, { x: 374, y: -1016, z: 0, mode: 'foot' });
    if ((W.errand() || {}).text !== taxi.parts[0].then.goal) fail(`Oda's story begun, beside Nagi: the corner says "${(W.errand() || {}).text}", not Oda's goal`);
    const w = W.want(line.npc); if (!w || w.kind !== 'chat') fail(`Oda's story begun, Nagi told: she has ${w ? w.kind : 'nothing'} to say, not a word in passing (her pale mark)`);
  }
}
function of(W, s) { return W.state()[s.id] || { part: 0 }; }
if (line && visits < 5) fail(`returning visits: ${visits} of 5 played through`);
else if (line) console.log('returning visits: the incident played again each time, her first words matched it, the fall kept once they were said');
console.log(`${RUNS} walks of ${STEPS} steps: ${talks} talks heard, the line's person asked ${nagiFirst} times on her feet with her first part unsaid`);
if (!nagiFirst && line) fail('the line\'s person was never on her feet with her first part unsaid: the check checked nothing');
if (fails) { console.log(`FAIL ${fails} failures`); process.exit(1); }
console.log('ok: every talk is lines of words, and the line\'s person speaks once she is up');
