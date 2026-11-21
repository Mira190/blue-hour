// The walk's storyline without a browser (web/game/walktalk.js, game.json walk): its stories played through in their
// order by talking to whoever has the part, meeting what each asks the way the game would report it (arrived by car, up
// on the roof, a photograph from the helicopter over the crossing), and checked at every step: exactly one person with
// the story's amber mark, nobody else's story begun meanwhile, the corner's line saying what to do next, the menu's
// list told / under way / next / later in order, a photograph from the roof on foot not taken for the helicopter's,
// and at the end every story told and nobody with a part left; the corner's arrow pointing the way; and the views of
// Shibuya each found once, by a photograph from where it is seen, with its picture kept for the album.
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
let seed = 7; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const T = OEWalkTalk.create({ data: G.walk, stage: el(), project: () => null, npc: id => byId[id], here: () => me, rand,
  say: (runs, done) => done(), fill: t => t, unseen: () => true, move: () => {}, told: (title, n, of) => told.push(`${title} ${n}/${of}`),
  place: (n, at) => { n.x = at[0]; n.y = at[1]; n.away = false; }, hide: n => { n.away = true; }, unseenAt: () => true, ask: (n, lines, choices, done) => done(choices[0]),
  step: (n, x, y, h, speed) => { n.x = x; n.y = y; n.h = h; n.walkSpeed = speed; }, clear: () => true });
const arrive = () => { for (let i = 0; i < 80 && T.events.moving; i++) T.tick(0.5, false); return !T.events.moving; };
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
// the first story's giver calls you over once you come near, and not again at once
Object.assign(me, { x: byId.mei.x + 9, y: byId.mei.y, z: byId.mei.z }); T.tick(0.1, false); T.tick(0.1, false);
if (!T.barked.includes('mei')) fail('nine metres from Mei, she does not call out');
Object.assign(me, { x: 376.9, y: -1013.1, z: 15, mode: 'foot' });
// the start: one person with the amber mark, and the corner says who, and which way (Mei is south of the start)
{ const r = step('the start'); if (r.a.join() !== 'mei') fail(`at the start the amber mark is over ${r.a.join(', ') || 'nobody'}, not Mei`); if (!/Mei has something to say/.test(r.e && r.e.text)) fail(`at the start the corner says "${r.e && r.e.text}"`);
  if (!(r.e && typeof r.e.dir === 'number' && Math.cos(r.e.dir) < -0.7)) fail(`at the start the corner's arrow does not point south to Mei (${r.e && r.e.dir})`); }
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
// (out of the lift at 46F, under the roof: not up yet, the deck is 9 m higher, up the escalator)
Object.assign(me, { x: 530.5, y: -1077, z: 232.8, mode: 'foot' }); T.tick(0.1, true);
{ const e = T.errand(); if (!/Up to the roof/.test(e && e.text)) fail(`out of the lift at 46F the corner already says "${e && e.text}" (the roof is the deck, 241.8 m)`); }
Object.assign(me, { x: 495, y: -1110, z: 241.8, mode: 'foot' }); T.tick(0.1, true);
{ const e = T.errand(); if (!/Taro/.test(e && e.text)) fail(`up on the roof the corner says "${e && e.text}"`); }
talkTo('taro', 'Taro for Yuna');
// 5. Above the crossing: not from the roof on foot; from the helicopter over the crossing
talkTo('taro', 'Taro');
if (T.photo({ z: 243, sees: () => true })) fail('a photograph from the roof on foot was taken for the helicopter\'s');
Object.assign(me, { x: 370, y: -1010, z: 140, mode: 'heli' }); if (!T.photo({ z: 150, sees: () => true })) fail('a photograph from the helicopter over the crossing did not meet what Taro asked');
{ const e = T.errand(); if (!/Back to Taro/.test(e && e.text)) fail(`after the aerial photograph the corner says "${e && e.text}"`);
  // (Taro on the roof, 100 m over the helicopter: the bearing to fly on, and the metres through the air)
  else if (e.lvl || e.dir == null || !(e.m > 100)) fail(`Taro on the roof from the helicopter: ${JSON.stringify({ lvl: e.lvl, dir: e.dir, m: e.m })} (want the bearing, over 100 m)`); }
// (and on foot in the street under him, with no lift named between: the needle up, no bearing on the map, the metres
// counting the 226 m of height)
Object.assign(me, { x: 372, y: -1012, z: 15, mode: 'foot' });
{ const e = T.errand(); if (!e || e.lvl !== 'up' || e.dir != null || !(e.m > 200)) fail(`Taro on the roof from the street on foot: ${JSON.stringify(e && { text: e.text, lvl: e.lvl, dir: e.dir, m: e.m })} (want up, no bearing, over 200 m)`); }
Object.assign(me, { x: 370, y: -1010, z: 140, mode: 'heli' });
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
// the views of Shibuya: each found once, by a photograph with it in frame from where it is seen, with its picture kept
T.reset();
const pic = 'data:image/jpeg;base64,AAAA', only = (px, py) => (x, y) => Math.hypot(x - px, y - py) < 1;
Object.assign(me, { x: 380, y: -1040, z: 15, mode: 'foot' });
T.photo({ z: 16.5, sees: only(374.79, -1046.45), thumb: () => pic });
T.photo({ z: 16.5, sees: only(374.79, -1046.45), thumb: () => pic });
{ const V = T.views(), h = V.find(v => v.id === 'hachiko'); if (!h || !h.found || h.pic !== pic) fail(`a photograph of Hachiko from beside it: ${JSON.stringify(h)}`); if (V.filter(v => v.found).length !== 1) fail(`two photographs of Hachiko found ${V.filter(v => v.found).length} views`); }
Object.assign(me, { x: 495, y: -1110, z: 241.8, mode: 'foot' });
T.photo({ z: 243.4, sees: only(500, -1110) });
if (T.views().find(v => v.id === 'tower').found) fail('SHIBUYA SKY "from the street" was found from its own roof');
T.photo({ z: 243.4, sees: only(368, -1002) });
if (!T.views().find(v => v.id === 'edge').found) fail('the scramble from SKY EDGE was not found from the roof');
Object.assign(me, { x: 420, y: -1050, z: 15, mode: 'foot' });
T.photo({ z: 16.5, sees: only(500, -1110) });
if (!T.views().find(v => v.id === 'tower').found) fail('SHIBUYA SKY from the street was not found from the street');
// street moments: one begins on its own a while after setting out, out of sight and 30 to 110 m away; a photograph's
// favour takes the corner while it lasts and is thanked; the way asked is answered by a choice; one ignored lapses
T.reset();
Object.assign(me, { x: 376.9, y: -1013.1, z: 15, mode: 'foot' });
for (let i = 0; i < 300 && !T.events.now; i++) T.tick(1, false);
{ const e = T.events.now; if (!e) fail('no street moment began in five minutes on foot by the crossing'); else { const n = byId[G.walk.events.find(q => q.id === e.id).people[0]], d = Math.hypot(n.x - me.x, n.y - me.y); if (d < 30 || d > 110) fail(`a street moment began ${d.toFixed(0)} m away`); } }
for (let i = 0; i < 200 && T.events.now; i++) { Object.assign(me, { x: 600, y: -1300 }); T.tick(1, false); } // (ignored, and walked far from: it lapses)
if (T.events.now) fail(`a street moment ignored and walked away from is still there (${JSON.stringify(T.events.now)})`);
Object.assign(me, { x: 376.9, y: -1013.1, z: 15, mode: 'foot' });
T.startAt('taxi'); // (a story under way meanwhile: the favour takes the corner, and gives it back)
if (!T.events.start('photo-endo', 1)) fail('photo-endo did not start');
{ const sp = G.walk.event_spots[1], d0 = Math.hypot(byId.endo.x - sp[0], byId.endo.y - sp[1]); if (!T.events.moving || d0 < 8) fail(`Mrs Endo does not walk in to her corner (${d0.toFixed(1)} m from it, ${T.events.moving} walking)`); if (!arrive()) fail('Mrs Endo never arrives at her corner'); else if (Math.hypot(byId.endo.x - sp[0], byId.endo.y - sp[1]) > 0.1) fail('Mrs Endo stops short of her corner'); }
{ const w = T.want('endo'); if (!w || w.kind !== 'event') fail(`Mrs Endo with a favour: ${w && w.kind}`); }
at('endo'); T.talk(byId.endo);
{ const e = T.errand(); if (!/Photograph Mrs Endo/.test(e && e.text)) fail(`Mrs Endo's favour asked, the corner says "${e && e.text}"`); }
Object.assign(me, { x: byId.endo.x + 4, y: byId.endo.y }); T.photo({ z: 16.5, sees: () => true });
{ const e = T.errand(); if (!/Show Mrs Endo/.test(e && e.text)) fail(`her photograph taken, the corner says "${e && e.text}"`); }
at('endo'); T.talk(byId.endo);
if (!T.events.moving) fail('Mrs Endo thanked, she does not walk off');
for (let i = 0; i < 80 && T.events.now; i++) { Object.assign(me, { x: 600, y: -1300 }); T.tick(1, false); }
{ const e = T.errand(); if (T.events.now) fail('Mrs Endo thanked, the moment is not over'); if (!/Mr Oda/.test(e && e.text)) fail(`after the favour the corner does not give the story back ("${e && e.text}")`); }
Object.assign(me, { x: 376.9, y: -1013.1, z: 15 });
if (!T.events.start('way-sky', 2)) fail('way-sky did not start');
arrive(); at('ren'); T.talk(byId.ren);
for (let i = 0; i < 80 && T.events.now; i++) { Object.assign(me, { x: 600, y: -1300 }); T.tick(1, false); }
if (T.events.done !== 2) fail(`two favours done, the count says ${T.events.done}`);
console.log(errors.length ? `FAIL ${errors.length}` : `ok   walk story  ${c.of} stories told in order, one at a time: ${told.join('; ')}; ${T.views().filter(v => v.found).length} of ${T.views().length} views found by their photographs; street moments begin unseen, lapse, and are thanked`);
process.exit(errors.length ? 1 : 0);
