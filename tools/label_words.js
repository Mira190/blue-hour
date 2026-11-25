// A label over someone on the walk swept across the walk's corner words (marks.js see, 'words'): the speech mark of whoever the walk's next story is with (Nagi, by the
// kerb), the camera turned a little at a time so that her mark crosses the corner's lines, and the mark's state read
// every step. Fails if it is drawn over the words, or if it blinks (on, off, on) more than its entry and exit ask while
// it crosses. Stills: one with the mark held off the words and one beside them, at the hour asked.
//   xvfb-run -a node tools/label_words.js out_dir [WxH] [night|blue]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/label-words', size = '390x844', hour = 'night'] = process.argv;
const WHO = process.env.WHO || 'nagi'; // (whoever the walk's next story is with carries its mark: the stories open in order)
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const [w, h] = size.split('x').map(Number), phone = w < 500, tag = `${phone ? 'phone' : 'desk'}-${hour}`;
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone });
  const URL0 = `http://localhost:${process.env.PORT || 8800}/`;
  await p.addInitScript(w => { window.WHO = w; }, WHO);
  await p.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.evaluate(t => { localStorage.setItem('bh-player', 'W'); sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t, w: 'clear' })); }, hour);
  await p.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => document.getElementById('game-stage').classList.contains('walk-on'), null, { timeout: 900000, polling: 500 });
  await p.waitForFunction(() => window.__game.npcs.filter(n => n.id === WHO).every(n => !n.rig.pending), null, { timeout: 600000, polling: 1000 }).catch(() => {});
  // (the walk's first call, the office ringing, passed: no mark is drawn while a talk is open)
  for (let k = 0; k < 20; k++) { await p.waitForTimeout(1000); const open = await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 && g.dlg.open; i++) g.dlg.next(false); return g.dlg.open; }); if (!open && k > 6) break; }
  // (beside Mei at 9 m, then the camera pitched so that heads stand high in the frame, where the corner's words are)
  const words = await p.evaluate(() => { const r = document.createRange(), o = [], tw = document.createTreeWalker(document.getElementById('g-walk-where'), NodeFilter.SHOW_TEXT); for (let t = tw.nextNode(); t; t = tw.nextNode()) { if (!t.data.trim()) continue; r.selectNodeContents(t); for (const q of r.getClientRects()) if (q.width > 2) o.push([q.left, q.top, q.right, q.bottom].map(Math.round)); } return o; });
  console.log(`the corner's lines: ${JSON.stringify(words)}`);
  const state = () => p.evaluate(() => { const e = [...document.querySelectorAll('.g-walk-mark')].find(q => q.dataset.k === 'story'), g = window.__game, n = g.npcs.find(q => q.id === WHO), s = g.marks.see(n.x, n.y, (n.z || 0) + 2.1, { pad: 16 }); return { on: !!e && +e.style.opacity > 0.3, why: s.why, x: Math.round(s.x), y: Math.round(s.y) }; });
  await p.evaluate(() => { const g = window.__game, n = g.npcs.find(q => q.id === WHO); g.spawn([n.x + 9 * 0.55, n.y - 9 * 0.83]); g.player.h = Math.atan2(n.x - g.player.x, n.y - g.player.y); for (let i = 0; i < 10; i++) g.frame(0.05); });
  console.log(`her mark by pitch: ${(await p.evaluate(() => { const g = window.__game, n = g.npcs.find(q => q.id === WHO), o = []; for (const pitch of [-0.4, 0, 0.3, 0.6, 0.9, 1.2]) { g.cam.pitch = pitch; g.cam.yaw = Math.atan2(n.x - g.player.x, n.y - g.player.y); g.frame(0.05); g.frame(0.05); const s = g.marks.see(n.x, n.y, (n.z || 0) + 2.1, { pad: 16, words: false }); o.push(`${pitch}:${Math.round(s.x)},${Math.round(s.y)} ${s.why}`); } return o.join(' | '); }))}`);
  // find a pitch and a yaw that put her mark on the corner's middle line, then sweep the yaw across it
  const L = words.slice().sort((a, c) => (c[2] - c[0]) - (a[2] - a[0]))[0] || [20, 40, 200, 60], ty = (L[1] + L[3]) / 2;
  let best = null;
  for (let pitch = 0.3; pitch <= 1.05 && !best; pitch += 0.05) {
    for (let dy = -1.3; dy <= 1.3; dy += 0.04) {
      const s = await p.evaluate(([pitch, dy]) => { const g = window.__game, n = g.npcs.find(q => q.id === WHO); g.cam.pitch = pitch; g.cam.yaw = Math.atan2(n.x - g.player.x, n.y - g.player.y) + dy; g.frame(0.05); g.frame(0.05); const s2 = g.marks.see(n.x, n.y, (n.z || 0) + 2.1, { pad: 16, words: false }); return { x: s2.x, y: s2.y, why: s2.why }; }, [pitch, dy]);
      if (!s.why && Math.abs(s.y - ty) < 18 && s.x > L[0] && s.x < L[2]) { best = { pitch, dy }; break; }
    }
  }
  if (!best) { console.log('FAIL no camera found that puts her mark on the corner\'s words'); await b.close(); process.exit(1); }
  console.log(`her mark on the corner's words at pitch ${best.pitch.toFixed(1)}, ${best.dy.toFixed(1)} rad off her`);
  // (her mark first seen where it is clear of the words: it fades in over a few frames once she is in reach and in sight)
  await p.evaluate(([pitch]) => { const g = window.__game, n = g.npcs.find(q => q.id === WHO); g.cam.pitch = Math.min(pitch, 0.35); g.cam.yaw = Math.atan2(n.x - g.player.x, n.y - g.player.y); }, [best.pitch]);
  for (let i = 0; i < 60 && !(await state()).on; i++) await p.waitForTimeout(500);
  console.log(`her mark first drawn: ${JSON.stringify(await state())}`);
  console.log(`marks: ${await p.evaluate(() => JSON.stringify([...document.querySelectorAll('.g-walk-mark')].map(e => [e.dataset.k, e.style.opacity, e.textContent.slice(0, 20)])))} list: ${await p.evaluate(() => { try { return JSON.stringify(window.__game.walkTalk().list().map(t => [t.id || t.title, t.state])); } catch (e) { return String(e).slice(0, 80); } })}`);
  const seq = []; let held = null, beside = null;
  for (let k = -24; k <= 24; k++) {
    const dy = best.dy + k * 0.012;
    await p.evaluate(([pitch, dy]) => { const g = window.__game, n = g.npcs.find(q => q.id === WHO); g.cam.pitch = pitch; g.cam.yaw = Math.atan2(n.x - g.player.x, n.y - g.player.y) + dy; }, [best.pitch, dy]); await p.waitForTimeout(700);
    const s = await state(); seq.push(s);
    if (s.why === 'words' && !held) { held = s; await p.screenshot({ path: `${out}/${tag}-held.png` }); }
    if (s.on && !beside && held) { beside = s; await p.screenshot({ path: `${out}/${tag}-beside.png` }); }
  }
  const over = seq.filter(s => s.on && s.why === 'words').length;
  let flips = 0; for (let i = 1; i < seq.length; i++) if (seq[i].on !== seq[i - 1].on) flips++;
  console.log(`swept 49 steps: drawn ${seq.filter(s => s.on).length}, held off the words ${seq.filter(s => s.why === 'words').length}, turned on or off ${flips} times; ${seq.map(s => (s.why === 'words' ? 'w' : s.on ? '#' : '.')).join('')}`);
  const errors = [];
  if (over) errors.push(`drawn over the words in ${over} steps`);
  if (flips > 4) errors.push(`blinked: ${flips} changes in one crossing`);
  for (const e of errors) console.log(`FAIL ${e}`);
  console.log(errors.length ? `FAIL ${errors.length}` : `ok   ${tag}: a label crossing the corner's words is held off them, without blinking`);
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
