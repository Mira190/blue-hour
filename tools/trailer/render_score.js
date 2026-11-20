// A shot list's score rendered to a wav (tools/trailer/score.js in a blank page's OfflineAudioContext): used by
// tools/trailer.js for the films and tools/trailer_short.js for their short cuts.
//   const { renderScore } = require('./trailer/render_score'); await renderScore(score, shots, total, 'out.wav');
// shots: [{id, t0, dur}], the cues' times named by them (score.js when()).
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function renderScore(score, shots, total, file) {
  const b = await chromium.launch({ args: ['--mute-audio'] });
  try {
    const p = await b.newPage();
    await p.setContent('<!doctype html><title>score</title>');
    await p.addScriptTag({ path: path.join(__dirname, 'score.js') });
    const b64 = await p.evaluate(async ({ score, shots, total }) => {
      const ch = await window.OETrailerScore.render(score, shots, total), n = ch[0].length, buf = new Int16Array(n * 2);
      for (let i = 0; i < n; i++) { buf[2 * i] = Math.max(-1, Math.min(1, ch[0][i])) * 32767; buf[2 * i + 1] = Math.max(-1, Math.min(1, ch[1][i])) * 32767; }
      let s = ''; const u8 = new Uint8Array(buf.buffer);
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    }, { score, shots, total });
    const raw = Buffer.from(b64, 'base64'), wav = Buffer.alloc(44);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + raw.length, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
    wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(48000 * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(raw.length, 40);
    fs.writeFileSync(file, Buffer.concat([wav, raw]));
    console.log(`${file}: ${(raw.length / 4 / 48000).toFixed(1)} s`);
    return file;
  } finally { await b.close(); }
}
module.exports = { renderScore };
