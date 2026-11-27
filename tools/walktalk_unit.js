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
const npc = id => npcs[id] || (npcs[id] = { id, name: id, x: 377, y: -1015, z: 0, rig: {} });
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
console.log(`${RUNS} walks of ${STEPS} steps: ${talks} talks heard, the line's person asked ${nagiFirst} times on her feet with her first part unsaid`);
if (!nagiFirst && line) fail('the line\'s person was never on her feet with her first part unsaid: the check checked nothing');
if (fails) { console.log(`FAIL ${fails} failures`); process.exit(1); }
console.log('ok: every talk is lines of words, and the line\'s person speaks once she is up');
