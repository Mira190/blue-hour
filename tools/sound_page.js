// A page to listen to recordings made by tools/sound_rec.js, before and after a change (docs/SOUND.md "Listened to"):
// each recording whole as an MP3, its loudness from the first card to the last with the story's beats under it and what
// the analysis found marked on it, the findings side by side, and short excerpts of the same moments in each.
//   node tools/sound_page.js out_dir before=dir1 after=dir2 [phone-before=dir3 phone-after=dir4 ...]
// Writes out_dir/index.html and out_dir/*.mp3 (ffmpeg with libmp3lame). Recordings are named by their key: "x-before"
// and "x-after" are paired as one view x.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { analyse } = require('./sound_analyse.js');
const [,, out = '/tmp/sound-page', ...pairs] = process.argv;
fs.mkdirSync(out, { recursive: true });
const recs = pairs.map(a => { const [k, d] = a.split('='); return { key: k, dir: d }; });
const mp3 = (src, dst, from, len, kbps = 96) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...(from != null ? ['-ss', String(Math.max(0, from)), '-t', String(len)] : []), '-i', src, '-codec:a', 'libmp3lame', '-b:a', `${kbps}k`, dst]);
// the moments to hear in every recording, found by what the story did (so that two runs at different paces line up)
const MOMENTS = [
  { id: 'preface', name: 'The preface typed on black', find: ev => ev.find(e => e.kind === 'sfx' && e.detail[0] === 'key'), pre: 1, len: 7 },
  { id: 'opening-end', name: 'The opening ends, the prologue begins', find: ev => ev.find(e => e.kind === 'beat' && e.detail.phase === 'go' && e.detail.beat === 'prologue'), pre: 8, len: 12 },
  { id: 'prologue', name: 'The first line of dialogue over the score', find: ev => ev.find(e => e.kind === 'voice'), pre: 1, len: 8 },
  { id: 'stop', name: 'The first Stop', find: ev => ev.find(e => e.kind === 'hush' && e.detail[0] === true), pre: 2, len: 9 },
  { id: 'shutter', name: 'The first photograph: shutter, wind, stamp, the score\'s note', find: ev => ev.find(e => e.kind === 'sfx' && e.detail[0] === 'shutter'), pre: 1.5, len: 6 },
  { id: 'run', name: 'Time runs on after the first frame', find: ev => ev.find(e => e.kind === 'hush' && e.detail[0] === false), pre: 2, len: 8 },
];
const data = [];
for (const r of recs) {
  const rep = analyse(r.dir, { quiet: true }), rec = JSON.parse(fs.readFileSync(path.join(r.dir, 'recording.json'), 'utf8'));
  const ev = rep.events;
  mp3(path.join(r.dir, 'mix.wav'), path.join(out, `${r.key}.mp3`), null, null, 80);
  const moments = [];
  for (const m of MOMENTS) { const e = m.find(ev); if (!e) continue; const f = `${r.key}-${m.id}.mp3`; mp3(path.join(r.dir, 'mix.wav'), path.join(out, f), e.t - m.pre, m.len, 192); moments.push({ id: m.id, file: f, at: +(e.t - m.pre).toFixed(1) }); }
  const real = l => l.filter(x => !x.stall && !x.designed);
  // the story's beats as bands (phase changes), and the frames
  const beats = []; let was = '';
  for (const e of ev) if (e.kind === 'beat') { const k = `${e.detail.phase}/${e.detail.fi}`; if (k !== was) { beats.push({ t: e.t, phase: e.detail.phase, beat: e.detail.beat, fi: e.detail.fi }); was = k; } }
  data.push({ key: r.key, size: rec.size, gesture: rec.gesture, seconds: rep.seconds, peak: rep.peak_dbfs, lufs: rep.integrated_lufs, loud: rep.loudest_momentary, stalls: rep.stalled_seconds,
    M: rep.momentary, beats, clicks: real(rep.clicks), designed: rep.clicks.filter(x => x.designed && !x.stall).length, strikes: real(rep.strikes), jumps: real(rep.jumps), hot: rep.over_minus1, clip: rep.clipped_samples,
    seams: rep.seams, masked: rep.masked, lines: rep.lines, margin: rep.margin_median, moments, grating: rep.grating });
}
const html = fs.readFileSync(path.join(__dirname, 'sound_page.html'), 'utf8').replace('/*DATA*/null', JSON.stringify({ data, moments: MOMENTS.map(m => ({ id: m.id, name: m.name })) }));
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log(`wrote ${out}/index.html and ${fs.readdirSync(out).filter(f => f.endsWith('.mp3')).length} MP3s (${(fs.readdirSync(out).reduce((s, f) => s + fs.statSync(path.join(out, f)).size, 0) / 1e6).toFixed(1)} MB)`);
