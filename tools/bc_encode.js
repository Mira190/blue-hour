// A raw RGBA picture into BC7 or BC5 blocks by the page's own encoder (web/bc7.js), as a DDS file a decoder outside
// the browser can open: tools/bc_check.py's half in Node.
//   node tools/bc_encode.js in.rgba width height out.dds [bc5]     prints { db, adb, modes, ms } as JSON
const fs = require('fs');
const Bc = require('../web/bc7.js');
const [,, src, W, H, out, kind] = process.argv;
const w = +W, h = +H, px = new Uint8Array(fs.readFileSync(src));
if (px.length !== w * h * 4) { console.error(`${src}: ${px.length} bytes, not ${w} x ${h} x 4`); process.exit(2); }
Bc.stats.reset();
const t0 = process.hrtime.bigint(), blocks = kind === 'bc5' ? Bc.encode5(px, w, h) : Bc.encode(px, w, h), ms = Number(process.hrtime.bigint() - t0) / 1e6;
const head = Buffer.alloc(148);
head.write('DDS ', 0);
head.writeUInt32LE(124, 4); head.writeUInt32LE(0x1 | 0x2 | 0x4 | 0x1000 | 0x80000, 8); head.writeUInt32LE(h, 12); head.writeUInt32LE(w, 16);
head.writeUInt32LE(blocks.length, 20); head.writeUInt32LE(1, 28);
head.writeUInt32LE(32, 76); head.writeUInt32LE(0x4, 80); head.write('DX10', 84); head.writeUInt32LE(0x1000, 108);
head.writeUInt32LE(kind === 'bc5' ? 83 : 98, 128); head.writeUInt32LE(3, 132); head.writeUInt32LE(1, 140);
fs.writeFileSync(out, Buffer.concat([head, Buffer.from(blocks.buffer)]));
console.log(JSON.stringify({ db: +Bc.stats.db().toFixed(2), adb: +Bc.stats.alphaDb().toFixed(2), modes: Bc.stats.modes, ms: Math.round(ms), mtps: +(w * h / ms / 1000).toFixed(1) }));
