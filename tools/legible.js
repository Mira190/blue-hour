// Can the story's words on the world be read over any picture? Each screen written down at a still of
// tools/story_play.js (UI_DUMP=dir, tools/ui_dump.js) is laid in again with the page's own stylesheets and no game,
// over the brightest things the street has (pale paving at dusk, a lit white sign) and, where the play kept it
// (BARE=regex, out/bare), over the picture the still was of. Every line of the goal, its hint, the captions, the word
// said, the prompt and the finder's words is then measured: the contrast of its colour against what lies under its
// own glyphs once its backing and shadows are drawn (the glyphs themselves left out). Issue 114: the goal lay across
// a lit sign and its hint on pale paving, with no backing of their own.
//
//   python3 -m http.server 8800 --directory web &
//   UI_DUMP=d/desk BARE='find|aimed|ride' xvfb-run -a node tools/story_play.js d/desk-stills 1440x900
//   node tools/legible.js out_dir d/desk [d/touch ...]        (BARE_DIR=d/desk-stills/bare: the pictures themselves)
// ONLY=regex: only the screens whose name matches. WORDS=0,1,2: the word sizes (0). Exits 1 where a line is under
// 4.5:1 on the paving or the picture, or under 3:1 on white; out_dir/report.json lists every line measured.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { lay } = require('./ui_dump');
const [,, out = '/tmp/legible', ...dirs] = process.argv;
const PORT = process.env.PORT || 8800, ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const WORDS = (process.env.WORDS || '0').split(',').map(Number);
const BARE = (process.env.BARE_DIR || '').split(',').filter(Boolean);
// (the words that lie on the picture itself: not the sheets, the cards or the menus, which have a ground of their own)
const TEXT = ['#g-story-goal small', '#g-story-goal span', '#g-story-goal em', '#g-toasts .g-toast', '#g-story-chip', '#g-prompt', '#g-story-keys', '#g-story-finder .rf small', '#g-story-shutter', '#g-story-frames',
  // (and the walk's: its corner, its keys, a name over the street; tools/walk_play.js writes them down too)
  '#g-walk-where small', '#g-walk-where .t', '#g-walk-where em', '#g-walk-where .tn', '#g-walk-where .g', '#g-walk-where .q', '#g-walk-keys', '#g-walk-told', '#g-walk-tonight'];
const GROUNDS = [{ name: 'paving', css: '#cbc6d0', min: 4.5 }, { name: 'white', css: '#ffffff', min: 3 }];

// in the page: every line of the listed words that is shown, with its colour
function lines(sel) {
  const stage = document.getElementById('game-stage'), outL = [];
  const seen = e => { for (let x = e; x && x !== stage.parentElement; x = x.parentElement) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.8) return false; /* (dimmed on purpose, or on its way in or out: not there to be read) */ } return true; };
  // (under a sheet, a card or a menu that covers the stage, the words are not there to be read)
  const covered = [...stage.querySelectorAll('#g-story-log.on, #g-story-album.on, #g-story-end.on, #g-story-fail.on, #g-story-print, .g-overlay:not([hidden]), #g-title:not([hidden])')].some(seen);
  if (covered) return outL;
  for (const q of sel) for (const e of stage.querySelectorAll(q)) {
    if (!seen(e)) continue;
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!/[\p{L}\p{N}]/u.test(n.data) || !seen(n.parentElement)) continue; // (words: not a dot between two of them)
      const c = getComputedStyle(n.parentElement), m = /rgba?\(([^)]+)\)/.exec(c.color), v = m ? m[1].split(/[ ,/]+/).map(Number) : [255, 255, 255, 1];
      const r = document.createRange(); r.selectNodeContents(n);
      for (const b of r.getClientRects()) if (b.width > 2 && b.height > 2 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth) outL.push({ q, text: n.data.trim().slice(0, 60), x: b.left, y: b.top, w: b.width, h: b.height, rgb: v.slice(0, 3), a: v[3] == null ? 1 : v[3], px: parseFloat(c.fontSize) });
    }
  }
  return outL;
}
// in a blank page: the light each line's letters stand against (linear, 0..1). The letters are found as what differs
// between the still and the same without its glyphs; what they stand against is what is drawn under them and for two
// pixels round each stroke: where the eye finds the edge of a letter. Its mean, and its lightest tenth.
async function light(png, bare, L) {
  const load = async src => { const im = new Image(); im.src = `data:image/png;base64,${src}`; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0); return { g, W: im.width, H: im.height }; };
  const A = await load(png), B = await load(bare);
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return L.map(b => {
    const R = 2, x = Math.max(0, Math.floor(b.x) - R), y = Math.max(0, Math.floor(b.y) - R), w = Math.max(1, Math.min(A.W - x, Math.ceil(b.w) + 2 * R)), h = Math.max(1, Math.min(A.H - y, Math.ceil(b.h) + 2 * R));
    const a = A.g.getImageData(x, y, w, h).data, d = B.g.getImageData(x, y, w, h).data, ink = new Uint8Array(w * h);
    for (let i = 0, k = 0; i < d.length; i += 4, k++) if (Math.abs(a[i] - d[i]) + Math.abs(a[i + 1] - d[i + 1]) + Math.abs(a[i + 2] - d[i + 2]) > 60) ink[k] = 1;
    const at = [];
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      let near = false;
      for (let dy = -R; dy <= R && !near; dy++) for (let dx = -R; dx <= R; dx++) { const qx = px + dx, qy = py + dy; if (qx >= 0 && qy >= 0 && qx < w && qy < h && ink[qy * w + qx]) { near = true; break; } }
      if (near) { const i = (py * w + px) * 4; at.push(0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2])); }
    }
    if (!at.length) return null; // (no letter of it drawn: under something, or off the picture)
    at.sort((p, q) => p - q); let s = 0, top = 0; for (const v of at) s += v;
    const n = Math.max(1, Math.floor(at.length / 10)); for (let i = at.length - n; i < at.length; i++) top += at[i];
    return { mean: s / at.length, top: top / n };
  });
}
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const html = (await (await fetch(`http://localhost:${PORT}/index.html`)).text()).replace(/<script\b[\s\S]*?<\/script>/g, '');
  const b = await chromium.launch();
  const report = [], bad = [];
  for (const dir of dirs) {
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort()) {
      const name = f.slice(0, -5); if (ONLY && !ONLY.test(name)) continue;
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), touch = d.ctx === 'touch';
      const p = await b.newPage({ viewport: { width: d.vw, height: d.vh }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
      await p.route('**/__legible.html', r => r.fulfill({ contentType: 'text/html', body: html }));
      await p.goto(`http://localhost:${PORT}/__legible.html`, { waitUntil: 'load' });
      await p.evaluate(() => document.fonts.ready);
      const m = await b.newPage();
      const pic = BARE.map(x => path.join(x, `${name}.png`)).find(x => fs.existsSync(x) && (() => { const s = fs.readFileSync(x); return s.readUInt32BE(16) === d.vw && s.readUInt32BE(20) === d.vh; })());
      const grounds = GROUNDS.concat(pic ? [{ name: 'picture', img: fs.readFileSync(pic).toString('base64'), min: 4.5 }] : []);
      for (const words of WORDS) for (const G of grounds) {
        await p.evaluate(lay, d);
        await p.evaluate(([g, n]) => {
          const gl = document.getElementById('game-gl'), s = document.getElementById('game-stage');
          gl.style.cssText = `position:absolute;inset:0;width:100%;height:100%;background:${g.img ? `url(data:image/png;base64,${g.img}) 0 0/100% 100%` : g.css}`;
          s.classList.remove('words-1', 'words-2'); if (n) s.classList.add(`words-${n}`);
          let st = document.getElementById('legible-off'); if (st) st.remove();
        }, [G, words]);
        const L = await p.evaluate(lines, TEXT);
        const tag = `${touch ? 'touch' : 'desk'}-${name}${words ? `-w${words}` : ''}-${G.name}`;
        if (!L.length) continue;
        const shown = await p.screenshot({ path: `${out}/${tag}.png` });
        // (the same without the glyphs: what each line lies on, its own backing and shadows drawn)
        await p.addStyleTag({ content: '#game-stage *, #game-stage *::before, #game-stage *::after { -webkit-text-fill-color: transparent !important; }' }).then(h => h.evaluate(e => { e.id = 'legible-off'; }));
        const under = (await p.screenshot()).toString('base64');
        const U = await m.evaluate(`(${light})(...${JSON.stringify([shown.toString('base64'), under, L])})`).catch(e => { console.log('(not measured)', String(e).slice(0, 120)); return []; });
        L.forEach((l, i) => {
          const u = U[i]; if (!u) return;
          // (a colour with some of what is under it showing through, as the eye gets it)
          const ink = l.a * (0.2126 * lin(l.rgb[0]) + 0.7152 * lin(l.rgb[1]) + 0.0722 * lin(l.rgb[2])) + (1 - l.a) * u.mean;
          const c = ratio(ink, u.mean), worst = ratio(ink, u.top), row = { screen: tag, ground: G.name, q: l.q, text: l.text, px: l.px, contrast: +c.toFixed(2), worst: +worst.toFixed(2), min: G.min };
          report.push(row);
          if (c < G.min) bad.push(row); // (the lightest tenth is printed, not failed: between two thin strokes a shade that follows the letters is at its thinnest)
        });
      }
      await p.close(); await m.close();
    }
  }
  await b.close();
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
  // (the least of each kind of words on each ground)
  const least = new Map();
  for (const r of report) { const k = `${r.q} | ${r.ground}`, w = least.get(k); if (!w || r.contrast < w.contrast) least.set(k, r); }
  for (const [k, r] of [...least].sort()) console.log(`${r.contrast.toFixed(1).padStart(5)}:1 (worst tenth ${r.worst.toFixed(1)}) ${k}  [${r.screen}] "${r.text.slice(0, 40)}"`);
  console.log(`${report.length} lines measured on ${new Set(report.map(r => r.screen)).size} screens; ${bad.length} too faint`);
  for (const r of bad.slice(0, 40)) console.log(`FAIL ${r.contrast}:1 (worst tenth ${r.worst}, wants ${r.min}) ${r.q} on ${r.ground} [${r.screen}] "${r.text}"`);
  process.exit(bad.length ? 1 : 0);
})();
