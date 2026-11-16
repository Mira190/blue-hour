// Makes the score the loading screen plays (web/assets/story/late/cue.mp3; web/game/music.js loop; docs/SOUND.md
// "Before the first frame"): eight bars of the story's score as it is before a frame is taken, bounced by the score's
// own code, the tail of the render (the room, the releases past the last bar) laid over its start so that it loops
// without a seam, then LEAD seconds of its end before it and of its start after it, so that one turn of the loop can
// be taken from LEAD in whatever a decoder pads the file with. Run it again after a change to the bluehour palette.
//   node tools/load_cue.js          (needs ffmpeg with libmp3lame)
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const STATE = { palette: 'bluehour', slot: 'evening', hour: 17.2, theme: 0 }, BARS = 8, BPM = 54, TAIL = 6, LEAD = 0.25, RATE = 44100;
const OUT = path.join(__dirname, '..', 'web', 'assets', 'story', 'late', 'cue.mp3');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.addScriptTag({ path: path.join(__dirname, '..', 'web', 'game', 'music.js') });
  const len = BARS * 240 / BPM;
  const r = await p.evaluate(async ([state, len, tail, lead, rate]) => {
    const buf = await window.OEMusic.bounce(len + tail, state, rate), n = Math.round(len * rate), k = Math.round(lead * rate);
    const pcm = new Int16Array((n + 2 * k) * 2); let peak = 0;
    for (let ch = 0; ch < 2; ch++) {
      const a = buf.getChannelData(ch), turn = Float32Array.from(a.subarray(0, n));
      for (let i = n; i < a.length; i++) turn[i - n] += a[i];
      for (let i = 0; i < n + 2 * k; i++) { const v = turn[(i - k + n) % n]; peak = Math.max(peak, Math.abs(v)); pcm[i * 2 + ch] = Math.round(Math.max(-1, Math.min(1, v)) * 32767); }
    }
    let s = ''; const u = new Uint8Array(pcm.buffer);
    for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
    return { b64: btoa(s), peak, what: window.OEMusic.describe(state) };
  }, [STATE, len, TAIL, LEAD, RATE]);
  await b.close();
  const pcm = Buffer.from(r.b64, 'base64'), head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
  const wav = path.join(os.tmpdir(), 'blue-hour-cue.wav');
  fs.writeFileSync(wav, Buffer.concat([head, pcm]));
  // (nothing on the score's bus is above 5 kHz: a low-pass at 9 kHz keeps the encoder from spending bits on nothing)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-map_metadata', '-1', '-c:a', 'libmp3lame', '-q:a', '5', '-cutoff', '9000', OUT]);
  fs.unlinkSync(wav);
  console.log(`${path.relative(process.cwd(), OUT)}: ${r.what}; one turn ${len.toFixed(3)} s from ${LEAD} s in, peak ${(20 * Math.log10(r.peak)).toFixed(1)} dBFS, ${Math.round(fs.statSync(OUT).size / 1024)} kB`);
})();
