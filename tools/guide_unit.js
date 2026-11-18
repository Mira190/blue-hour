// The story's guide (web/game/companion.js) without a browser, against a stubbed THREE: a held crowd in a band across
// his way, with one gap at its edge, and he is sent through it (he must go round by the gap, never within 0.42 m of a
// person's middle); then led at the player's run (6 m/s: never behind them more than a quarter of the time), stopped
// (he stands, a gap in front), and overtaken (he passes wide of them and is in front again). Exits 1 on a fault.
//   node tools/guide_unit.js
const fs = require('fs'), vm = require('vm');
class V { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
class O { constructor() { this.position = new V(); this.rotation = { x: 0, y: 0 }; this.children = []; this.visible = true; this.material = { opacity: 0 }; } add(c) { this.children.push(c); } traverse() {} }
const THREE = { Group: O, Mesh: O, RingGeometry: class {}, MeshBasicMaterial: class { constructor() { this.opacity = 0; } }, AdditiveBlending: 1, DoubleSide: 2, Vector3: V, Quaternion: class { copy() { return this; } equals() { return false; } }, GLTFLoader: class { load() {} } };
const ctx = { window: {}, THREE, console, Math };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'web', 'game', 'companion.js'), 'utf8'), ctx);
const C = ctx.window.OECompanion;
// a crowd: a band 8 m deep across y = 0..8 between x = -15 and 15, a person every 0.8 m, with one gap only at x = 12
const crowd = [];
for (let x = -15; x <= 15; x += 0.8) for (let y = 0; y <= 8; y += 0.8) if (Math.abs(x - 12) > 1.4) crowd.push([x + (Math.round(y / 0.8) % 2) * 0.4, y]);
const player = { x: 0, y: 20, z: 0, h: Math.PI, speed: 0, mode: 'foot' };
let heldOn = true;
const dog = C.create({ url: '', world: new O(), W: (x, y, z) => new V(x, z, -y), ground: () => 0, player, people: (x, y, r) => crowd.filter(q => Math.abs(q[0] - x) < r && Math.abs(q[1] - y) < r).map(q => q.slice()), route: null, slide: null, stand: () => true, held: () => heldOn });
dog.place(0, -10, Math.PI / 2, true);
dog.go([0.6, 19], [0, 20, 1.6], 1.2);
let near = Infinity, steps = 0;
for (let i = 0; i < 4000 && dog.state !== 'sit'; i++) { dog.tick(1 / 30); steps++; for (const q of crowd) near = Math.min(near, Math.hypot(q[0] - dog.x, q[1] - dog.y)); }
console.log('through the band:', dog.state, `${(steps / 30).toFixed(1)} s`, 'at', dog.x.toFixed(2), dog.y.toFixed(2), 'nearest person', near.toFixed(2), 'detour', dog.detour ? dog.detour.length : null);
if (near < 0.42 || dog.state !== 'sit') { console.log('FAIL: through the crowd'); process.exitCode = 1; }
// the lead at a run, in a running world: the player runs north at 6 m/s from behind him; he must be ahead most of the time
heldOn = false; crowd.length = 0;
player.x = 0; player.y = -14; player.h = 0; dog.place(0, -10, Math.PI / 2); dog.met(); dog.lead([0, 200], 3);
let behind = 0, n = 0, maxSp = 0;
for (let i = 0; i < 30 * 20; i++) { player.speed = i < 30 ? 6 * i / 30 : 6; player.y += player.speed / 30; dog.tick(1 / 30); n++; if (dog.behind) behind++; maxSp = Math.max(maxSp, dog.speed); }
console.log('run:', `behind ${(100 * behind / n).toFixed(0)}%`, 'gap', (dog.y - player.y).toFixed(1), 'max speed', maxSp.toFixed(1), dog.state);
if (behind / n > 0.25 || dog.y < player.y) { console.log('FAIL run'); process.exitCode = 1; }
// stopped: he stands and looks back, a gap in front
for (let i = 0; i < 30 * 4; i++) { player.speed = 0; dog.tick(1 / 30); }
console.log('stopped:', 'gap', (dog.y - player.y).toFixed(1), 'speed', dog.speed.toFixed(2), dog.state);
// overtaken: the player put 6 m past him, running on
player.y = dog.y + 6; let back = 0;
for (let i = 0; i < 30 * 10; i++) { player.speed = 6; player.y += 0.2; dog.tick(1 / 30); if (i === 30 * 4) console.log("  after 4 s: gap", (dog.y - player.y).toFixed(1), "x", dog.x.toFixed(1)); }
console.log('overtaken then:', 'gap', (dog.y - player.y).toFixed(1), dog.state, 'behind', dog.behind);
if (dog.y < player.y) { console.log('FAIL overtake'); process.exitCode = 1; }
if (!process.exitCode) console.log('ok');
