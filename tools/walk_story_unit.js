// The walk's storyline without a browser (web/game/walktalk.js, game.json walk): its stories played through in their
// order by talking to whoever has the part, meeting what each asks the way the game would report it (arrived by car, up
// on the roof, a photograph from the helicopter over the crossing), and checked at every step: exactly one person with
// the story's amber mark, nobody else's story begun meanwhile, the corner's line saying what to do next, the menu's
// list told / under way / next / later in order, a photograph from the roof on foot not taken for the helicopter's,
// and at the end every story told and nobody with a part left.
//   node tools/walk_story_unit.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const G = JSON.parse(fs.readFileSync(path.join(root, 'web/data/shibuya/game.json'), 'utf8'));
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const el = () => ({ className: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {}, querySelector: () => el(), innerHTML: '', textContent: '' });
global.document = { createElement: el };
global.window = global;
eval(fs.readFileSync(path.join(root, 'web/game/walktalk.js'), 'utf8')); // (a classic script: it sets window.OEWalkTalk)
const errors = [];
const fail = m => { errors.push(m); console.log(`FAIL ${m}`); };
const byId = Object.fromEntries(G.npcs.map(n => [n.id, Object.assign({}, n, { x: n.at[0], y: n.at[1], z: n.at[2] ?? 15, rig: { root: { visible: true } } })]));
const me = { x: 376.9, y: -1013.1, z: 15, mode: 'foot' };
let told = [];
const T = OEWalkTalk.create({ data: G.walk, stage: el(), project: () => null, npc: id => byId[id], here: () => me,
  say: (runs, done) => done(), fill: t => t, unseen: () => true, move: () => {}, told: (title, n, of) => told.push(`${title} ${n}/${of}`) });
T.begin();
const ids = Object.keys(byId);
const amber = () => ids.filter(id => { const w = T.want(id); return w && w.kind === 'story'; });
const begun = () => Object.entries(T.state()).filter(([k, v]) => k !== '_chat' && v && v.part > 0 && !v.done).map(([k]) => k);
const at = id => { const n = byId[id]; Object.assign(me, { x: n.x + 1, y: n.y, z: n.z, mode: 'foot' }); };
function step(label) {
  const a = amber(), b = begun(), e = T.errand();
  if (a.length > 1) fail(`${label}: ${a.length} people with a part for you (${a.join(', ')})`);
  if (b.length > 1) fail(`${label}: ${b.length} stories begun at once (${b.join(', ')})`);
  if (T.count().done < T.count().of && !(e && e.text)) fail(`${label}: nothing in the corner`);
  return { a, e };
}
const talkTo = (id, label) => { const r = step(label); if (!r.a.includes(id)) fail(`${label}: ${id} has no part for you (the part is ${r.a.join(', ') || 'nobody'}'s)`); at(id); if (!T.talk(byId[id])) fail(`${label}: talking to ${id} said nothing`); };
// the start: one person with the amber mark, and the corner says who
{ const r = step('the start'); if (r.a.join() !== 'mei') fail(`at the start the amber mark is over ${r.a.join(', ') || 'nobody'}, not Mei`); if (!/Mei has something to say/.test(r.e && r.e.text)) fail(`at the start the corner says "${r.e && r.e.text}"`); }
// a story to come is not begun by talking to its giver early: a word, and no part
{ const w = T.want('taro'); if (!w || w.kind !== 'wait') fail(`Taro before his turn: ${w ? w.kind : 'nothing'} (want a word in passing)`); at('taro'); T.talk(byId.taro); if (begun().length) fail(`talking to Taro early began ${begun().join(', ')}`); }
// 1. Which Hachiko
talkTo('mei', 'Mei'); talkTo('riko', 'Riko'); talkTo('mei', 'back to Mei');
// 2. Once round by car: the drive met as check() sees it, in the car at 109
talkTo('oda', 'Mr Oda');
{ const e = T.errand(); if (!/109/.test(e && e.text)) fail(`after Mr Oda the corner says "${e && e.text}"`); }
Object.assign(me, { x: 268, y: -998.6, z: 15, mode: 'car' }); T.tick(0.1, true);
talkTo('oda', 'back to Mr Oda');
// 3. The shot everyone takes: a photograph from in the crossing
talkTo('shun', 'Shun');
Object.assign(me, { x: 368, y: -1004, z: 15, mode: 'foot' }); if (!T.photo({ z: 16.6, sees: () => true })) fail('a photograph from in the crossing did not meet what Shun asked');
talkTo('shun', 'back to Shun');
// 4. Forty-five floors: up on the roof, and the next part is Taro's
talkTo('yuna', 'Yuna');
Object.assign(me, { x: 495, y: -1110, z: 241.8, mode: 'foot' }); T.tick(0.1, true);
{ const e = T.errand(); if (!/Taro/.test(e && e.text)) fail(`up on the roof the corner says "${e && e.text}"`); }
talkTo('taro', 'Taro for Yuna');
// 5. Above the crossing: not from the roof on foot; from the helicopter over the crossing
talkTo('taro', 'Taro');
if (T.photo({ z: 243, sees: () => true })) fail('a photograph from the roof on foot was taken for the helicopter\'s');
Object.assign(me, { x: 370, y: -1010, z: 140, mode: 'heli' }); if (!T.photo({ z: 150, sees: () => true })) fail('a photograph from the helicopter over the crossing did not meet what Taro asked');
{ const e = T.errand(); if (!/Back to Taro/.test(e && e.text)) fail(`after the aerial photograph the corner says "${e && e.text}"`); }
talkTo('taro', 'back to Taro');
// the end
const c = T.count();
if (c.done !== c.of) fail(`at the end ${c.done} of ${c.of} told`);
if (amber().length) fail(`at the end ${amber().join(', ')} still has a part`);
if (T.errand()) fail(`at the end the corner still says "${T.errand().text}"`);
if (told.length !== c.of) fail(`${told.length} stories put away, of ${c.of}: ${told.join('; ')}`);
// the menu's list mid-way: told, then the one under way, then later
T.startAt('shot');
{ const L = T.list().map(t => t.state).join(' '); if (L !== 'told told next later later') fail(`the menu's list at Shun's turn: ${L}`); }
console.log(errors.length ? `FAIL ${errors.length}` : `ok   walk story  ${c.of} stories told in order, one at a time: ${told.join('; ')}`);
process.exit(errors.length ? 1 : 0);
