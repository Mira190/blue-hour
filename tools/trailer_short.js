// The trailers' short cuts for a phone held upright (docs/TRAILER.md, "The short cuts"): 20 to 30 seconds, cut from a
// film's frames already on disk (tools/trailer.js) by a cut list (tools/views/short-*.json), 1080x1920. Each segment
// takes a stretch of the film from a point in one of its shots, at a pace (faster than it was filmed, never slower: a
// frame is not drawn twice), and lays a 4:5 window of it, cropped round its subject (cx), over the same picture blurred
// to fill the screen, with the cut's own type above it: a hook line for the segment, or a card of its own on black. A
// punch (a quick push in that eases back) on a hit, a flash, and a score of its own (tools/trailer/score.js) on the
// cut list's cues. The type keeps out of a phone app's own buttons: the right edge and the bottom.
//   node tools/trailer_short.js tools/views/short-story.json [--film-frames <dir>] [--frames <dir>] [--out <file.mp4>]
//   (the http server on PORT, 8800, serves the type's faces: python3 -m http.server 8800 --directory web)
'use strict';
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { renderScore } = require('./trailer/render_score');

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i < 0 ? def : argv[i + 1]; };
const cut = JSON.parse(fs.readFileSync(argv[0], 'utf8'));
const film = JSON.parse(fs.readFileSync(path.join(__dirname, '..', cut.film), 'utf8'));
const FILM_FRAMES = opt('film-frames', `/tmp/trailer-${film.name}`);
const FRAMES = opt('frames', `/tmp/trailer-${cut.name}`);
const OUT = opt('out', path.join(FRAMES, `${cut.name}.mp4`));
const [W, H] = String(cut.size || '1080x1920').split('x').map(Number);
const FPS = cut.fps || film.fps || 24;
const PORT = process.env.PORT || 8800;
fs.mkdirSync(FRAMES, { recursive: true });

// the film's shots on its clock, and a point in it ("shot@k", "shot+s", seconds) as the film's time
let T = 0;
const fshots = film.shots.map(s => { const o = { id: s.id, t0: T, dur: s.dur }; T += s.dur; return o; });
const FILM_T = T, FILM_N = Math.round(FILM_T * (film.fps || 24));
function filmTime(at) {
  if (typeof at === 'number') return at;
  const m = /^([\w-]+)(?:@([\d.]+)|([+-][\d.]+))?$/.exec(at), s = m && fshots.find(q => q.id === m[1]);
  if (!s) throw new Error(`no film shot ${at}`);
  return s.t0 + (m[2] != null ? +m[2] * s.dur : m[3] != null ? +m[3] : 0);
}
T = 0;
const segs = cut.segments.map(s => { const o = Object.assign({}, s, { t0: T, src: s.from != null ? filmTime(s.from) : null }); T += s.dur; return o; });
const TOTAL = T;
const filmFrame = t => { const i = Math.max(0, Math.min(FILM_N - 1, Math.floor(t * (film.fps || 24) + 1e-6))); return path.join(FILM_FRAMES, `f${String(i).padStart(5, '0')}.jpg`); };

const PAGE = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/fonts.css"><style>
html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
#bg { position: absolute; left: 0; top: 0; width: ${W / 4}px; height: ${H / 4}px; overflow: hidden; transform: scale(4); transform-origin: 0 0; }
#bg img { position: absolute; height: 100%; left: 50%; transform: translateX(-50%) scale(1.15); filter: blur(5px) brightness(0.38) saturate(1.25); }
#win { position: absolute; left: ${cut.window[0]}px; top: ${cut.window[1]}px; width: ${cut.window[2]}px; height: ${cut.window[3]}px; overflow: hidden; background: #000;
  box-shadow: 0 0 80px rgba(0, 0, 0, 0.7); }
#win img { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
#win::after { content: ""; position: absolute; inset: 0; background: linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0) 14%, rgba(0,0,0,0) 80%, rgba(0,0,0,0.45)); }
#card { position: absolute; left: ${cut.window[0]}px; top: ${cut.window[1]}px; width: ${cut.window[2]}px; height: ${cut.window[3]}px; display: grid; place-items: center; text-align: center; color: #f4f1ea; background: #000; opacity: 0; }
#card small { display: block; font: 400 26px/1.3 "JetBrains Mono", monospace; letter-spacing: 0.42em; margin-right: -0.42em; text-transform: uppercase; color: #ffcf8a; }
#card small::after { content: ""; display: block; width: 64px; height: 2px; margin: 34px auto 38px; background: rgba(255, 207, 138, 0.6); }
#card b { display: block; font: 300 78px/1.12 "Zalando Sans Expanded", sans-serif; letter-spacing: 0.12em; margin-right: -0.12em; text-transform: uppercase; padding: 0 40px; text-shadow: 0 0 40px rgba(120, 150, 255, 0.35); }
#card b.huge { font-size: 230px; font-weight: 200; letter-spacing: 0; margin: 0; text-shadow: 0 0 70px rgba(255, 207, 138, 0.35); }
#card b.title { font-size: 116px; font-weight: 200; letter-spacing: 0.22em; margin-right: -0.22em; line-height: 1.05; text-shadow: 0 0 14px rgba(255,255,255,0.45), 0 0 70px rgba(140, 170, 255, 0.5), 0 0 180px rgba(80, 110, 255, 0.4); }
#card i { display: block; margin-top: 30px; font: 500 46px/1.3 "Shippori Mincho", serif; letter-spacing: 0.5em; margin-right: -0.5em; font-style: normal; color: rgba(244, 241, 234, 0.85); }
#card p { margin: 34px 60px 0; font: 400 34px/1.45 "Inter Tight", sans-serif; letter-spacing: 0.04em; color: rgba(244, 241, 234, 0.85); }
#card .streak { display: block; width: 1000px; height: 6px; margin: -64px auto 58px; background: radial-gradient(ellipse 50% 50% at 50% 50%, rgba(170, 195, 255, 0.95), rgba(90, 120, 255, 0.35) 40%, rgba(60, 80, 255, 0) 70%); filter: blur(2px); }
#head { position: absolute; left: 50px; right: 50px; top: ${cut.window[1] - 300}px; height: 280px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; text-align: center; color: #fff; opacity: 0; }
#head small { font: 400 28px/1.3 "JetBrains Mono", monospace; letter-spacing: 0.34em; margin-right: -0.34em; text-transform: uppercase; color: #ffcf8a; margin-bottom: 18px; }
#head b { font: 500 80px/1.05 "Zalando Sans Expanded", sans-serif; letter-spacing: 0.06em; margin-right: -0.06em; text-transform: uppercase; text-shadow: 0 4px 30px rgba(0, 0, 0, 0.9), 0 0 2px #000; }
#brand { position: absolute; left: 0; right: 0; top: ${cut.window[1] + cut.window[3] + 34}px; text-align: center; font: 300 30px/1 "Zalando Sans Expanded", sans-serif; letter-spacing: 0.5em; margin-right: -0.5em; text-transform: uppercase; color: rgba(244, 241, 234, 0.8); }
#brand span { display: block; margin-top: 16px; font: 400 20px/1 "JetBrains Mono", monospace; letter-spacing: 0.36em; color: #ffcf8a; }
#flash { position: absolute; inset: 0; background: #f6f3ee; opacity: 0; }
#black { position: absolute; inset: 0; background: #000; opacity: 0; }
</style>
<div id="bg"><img id="bgi"></div><div id="win"><img id="pic"></div><div id="card"></div><div id="head"></div>
<div id="brand">${cut.brand ? `${cut.brand.name}<span>${cut.brand.line || ''}</span>` : ''}</div><div id="flash"></div><div id="black"></div>`;

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function cardHtml(c) {
  if (c.kind === 'title') return `<div>${c.eyebrow ? `<small>${esc(c.eyebrow)}</small>` : ''}${[].concat(c.text).map(l => `<b class="title">${esc(l)}</b>`).join('')}<span class="streak"></span>${c.jp ? `<i>${esc(c.jp)}</i>` : ''}${c.line ? `<p>${esc(c.line)}</p>` : ''}</div>`;
  if (c.kind === 'counter') return `<div><b class="huge">${esc(c.text)}</b>${c.line ? `<small style="margin-top:20px">${esc(c.line)}</small>` : ''}</div>`;
  return `<div>${c.eyebrow ? `<small>${esc(c.eyebrow)}</small>` : ''}${[].concat(c.text).map(l => `<b>${esc(l)}</b>`).join('')}${c.jp ? `<i>${esc(c.jp)}</i>` : ''}${(c.lines || []).map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
}
const headHtml = h => (h ? `${h.eyebrow ? `<small>${esc(h.eyebrow)}</small>` : ''}<b>${esc(h.text)}</b>` : '');
const ease = t => 1 - Math.pow(1 - t, 3);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

(async () => {
  const b = await chromium.launch({ args: ['--mute-audio'] });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await p.route('**/__frames/**', r => r.fulfill({ path: decodeURIComponent(new URL(r.request().url()).pathname.replace('/__frames', '')), contentType: 'image/jpeg' }));
  await p.goto(`http://localhost:${PORT}/fonts.css`);
  await p.setContent(PAGE, { waitUntil: 'load' });
  await p.evaluate(() => Promise.all(['500 66px "Zalando Sans Expanded"', '300 78px "Zalando Sans Expanded"', '200 120px "Zalando Sans Expanded"', '400 25px "JetBrains Mono"', '500 46px "Shippori Mincho"', '400 34px "Inter Tight"']
    .map(f => document.fonts.load(f, 'BLUE HOUR 渋谷 遅かったね 不夜城 0123456789'))));
  const cdp = await p.context().newCDPSession(p);
  const n = Math.round(TOTAL * FPS), t0 = Date.now();
  // --stills 0.5,3.2,...: only the frames at those times, to look at (the type, the crop), and no film
  const only = opt('stills', null) ? new Set(String(opt('stills')).split(',').map(x => Math.floor(+x * FPS))) : null;
  let lastSeg = null, lastHead = '';
  const win = cut.window, SCALE = win[3] / 804;
  for (let i = 0; i < n; i++) {
    if (only) { if (!only.has(i)) continue; lastSeg = null; lastHead = ''; }
    const t = (i + 0.5) / FPS;
    let s = segs[0];
    for (const q of segs) if (t >= q.t0 - 1e-6) s = q;
    const k = (t - s.t0) / s.dur, ts = t - s.t0;
    const st = { card: null, head: null, src: null, x: 0, y: 0, z: 1, flash: 0, black: 0, headO: 0, headS: 1, cardO: 0 };
    if (s !== lastSeg) {
      st.card = s.card ? cardHtml(s.card) : '';
      const hk = JSON.stringify(s.head || null);
      st.head = hk !== lastHead ? headHtml(s.head) : null; // (the same line over the next segment stays up, not drawn in again)
      if (hk !== lastHead) s._headIn = s.t0; else s._headIn = lastSeg._headIn;
      lastHead = hk; lastSeg = s;
    }
    if (s.src != null) {
      const srcT = s.src + ts * (s.speed || 1);
      st.src = `/__frames${filmFrame(srcT)}`;
      // the window: cropped round cx (0..1 of the film's width), pushed in by zoom and the punches on the hits
      let z = Array.isArray(s.zoom) ? s.zoom[0] + (s.zoom[1] - s.zoom[0]) * k : (s.zoom || 1);
      for (const hk of [].concat(s.punch || [])) { const d = ts - hk * s.dur; if (d >= 0 && d < 0.5) z *= 1 + 0.07 * Math.pow(1 - d / 0.5, 3); }
      const sc = SCALE * z, iw = 1920 * sc, ih = 804 * sc, cx = s.cx ?? 0.5;
      st.x = Math.max(win[2] - iw, Math.min(0, win[2] / 2 - cx * iw));
      st.y = (win[3] - ih) / 2;
      st.z = sc;
    }
    // the hook line: in fast, a little large, out with the segment's end if the next does not keep it
    const hin = t - s._headIn;
    st.headO = s.head ? clamp(hin / 0.12) : 0;
    st.headS = s.head ? 1 + 0.12 * (1 - ease(clamp(hin / 0.22))) : 1;
    st.cardO = s.card ? Math.min(clamp(ts / (s.card.fadeIn ?? 0.12)), clamp((s.dur - ts) / (s.card.fadeOut ?? 0.12))) : 0;
    for (const [fk, secs] of s.flash || []) { const d = ts - fk * s.dur; if (d >= 0 && d < secs) st.flash = Math.max(st.flash, Math.pow(1 - d / secs, 2)); }
    if (s.fadeOut) st.black = clamp(1 - (s.dur - ts) / s.fadeOut);
    if (s.fadeIn) st.black = Math.max(st.black, clamp(1 - ts / s.fadeIn));
    await p.evaluate(async st => {
      const $ = id => document.getElementById(id);
      if (st.card !== null) $('card').innerHTML = st.card;
      if (st.head !== null) $('head').innerHTML = st.head;
      if (st.src) {
        const pic = $('pic'), bgi = $('bgi');
        if (pic.getAttribute('src') !== st.src) { pic.src = st.src; bgi.src = st.src; await Promise.all([pic.decode(), bgi.decode()]).catch(() => {}); }
        pic.style.transform = `translate(${st.x}px, ${st.y}px) scale(${st.z})`;
      }
      $('card').style.opacity = st.cardO;
      $('head').style.opacity = st.headO;
      $('head').style.transform = `scale(${st.headS})`;
      $('flash').style.opacity = st.flash;
      $('black').style.opacity = st.black;
    }, st);
    const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93 });
    fs.writeFileSync(path.join(FRAMES, `s${String(i).padStart(5, '0')}.jpg`), Buffer.from(r.data, 'base64'));
    if (i % 96 === 0) console.log(`frame ${i}/${n}, ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(2)} s a frame`);
  }
  await b.close();
  if (only) return;
  const wav = await renderScore(cut.score, segs.map(s => ({ id: s.id, t0: s.t0, dur: s.dur })), TOTAL, path.join(FRAMES, 'score.wav'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(FRAMES, 's%05d.jpg'), '-i', wav,
    '-vf', `noise=c0s=${cut.grain ?? 3}:c0f=t,format=yuv420p`, '-t', TOTAL.toFixed(3), '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-maxrate', '10M', '-bufsize', '20M', '-tune', 'film', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', OUT]);
  console.log(`${OUT}: ${TOTAL.toFixed(1)} s, ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB`);
})().catch(e => { console.error(e); process.exit(1); });
