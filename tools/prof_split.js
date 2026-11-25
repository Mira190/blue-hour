// A sampled profile's time split by the nearest named caller on its stack (issue 220, the simulation off the main
// thread): which of the crowd's update is the simulation (what could step elsewhere) and which is the drawing (what
// must stay with the scene). The profile is one `OUT=` of tools/crowd_cost.js (HZ mode: the crowd's update alone).
//   node tools/prof_split.js <file.cpuprofile> [calls] [RATE]
// Each sample is booked to the innermost of the names below on its stack (file:function), else to "other". calls: the
// number of update calls the profile spans (crowd_cost.js prints it), for ms a call.
const fs = require('fs');
const [,, file, calls = '1', rate = '1'] = process.argv;
const prof = JSON.parse(fs.readFileSync(file, 'utf8'));
// (people.js's renderer: place/begin/end/hide and what they call, armsClear among them; actors.js's simulation)
const NAMES = [
  ['people.js', 'armsClear', 'draw: arms'], ['people.js', 'place', 'draw: place'], ['people.js', 'begin', 'draw: begin'],
  ['people.js', 'end', 'draw: end'], ['people.js', 'hide', 'draw: place'],
  ['actors.js', 'seen', 'sim: seen (camera)'], ['actors.js', 'canopyAcross', 'sim: canopyAcross'],
  ['actors.js', 'respawn', 'sim: respawn'], ['actors.js', 'walk', 'sim: walk'], ['actors.js', 'plazaStep', 'sim: plazaStep'],
  ['actors.js', 'regStep', 'sim: regStep'], ['actors.js', 'waysStep', 'sim: waysStep'], ['actors.js', 'plazas', 'sim: plazas'],
  ['actors.js', 'gait', 'sim: gait'], ['actors.js', 'groupSync', 'sim: groupSync'], ['actors.js', 'lensUpdate', 'sim: lens'],
  ['actors.js', 'formGroup', 'sim: groups'], ['actors.js', 'update', 'sim: update loop'],
];
const node = new Map(prof.nodes.map(n => [n.id, n])), parent = new Map();
for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
const label = new Map();
const own = id => { const f = node.get(id).callFrame, u = f.url || ''; for (const [fl, fn, lab] of NAMES) if (u.includes(fl) && f.functionName === fn) return lab; return null; };
const book = id => { if (label.has(id)) return label.get(id); const l = own(id) || (parent.has(id) ? book(parent.get(id)) : 'other'); label.set(id, l); return l; };
const sum = new Map(); let all = 0;
prof.samples.forEach((id, i) => { const f = node.get(id).callFrame; if (/^\((idle|root|program|garbage collector)\)$/.test(f.functionName)) return; const ms = prof.timeDeltas[i] / 1000 / +rate; const l = book(id); sum.set(l, (sum.get(l) || 0) + ms); all += ms; });
const rows = [...sum].sort((a, b) => b[1] - a[1]);
let sim = 0, draw = 0;
for (const [l, ms] of rows) { if (l.startsWith('sim')) sim += ms; else if (l.startsWith('draw')) draw += ms; console.log(`${(ms / +calls).toFixed(3).padStart(8)}  ${l}`); }
console.log(`all ${(all / +calls).toFixed(2)} ms a call: simulation ${(sim / +calls).toFixed(2)}, drawing ${(draw / +calls).toFixed(2)}, other ${((all - sim - draw) / +calls).toFixed(2)}`);
