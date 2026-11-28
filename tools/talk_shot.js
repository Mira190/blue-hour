// Stills of the walk's talks as a player opens them (the owner's iPhone, 28 November 2026: at Mei's talk the words lay
// over her chest and the HUD over her face): out on the walk at once at the hour and sky asked, beside each of WHO in turn,
// the talk opened as a player opens it (E, or a tap on the prompt), and a still once its first line is typed; with
// tools/talk_face.js's measure of what covers the speaker's face. Exits 1 when anything does.
//   PORT=8800 xvfb-run -a node tools/talk_shot.js out_dir [WxH] [hour] [sky]      (WHO=mei,nagi by default)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const face = require('./talk_face');
const [,, out = 'out/talk-shot', size = '1440x900', hour = 'dusk', sky = 'clear'] = process.argv;
const [w, h] = size.split('x').map(Number), phone = w < 600;
const WHO = (process.env.WHO || 'mei,nagi').split(',');
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  p.on('pageerror', e => console.log('page error:', String(e).slice(0, 300)));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high'); // (stills on the desktop tier: AGENTS.md)
  await p.addInitScript(face.hook);
  const url = `http://localhost:${process.env.PORT || 8800}/`;
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.evaluate(([t, s]) => { sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t, w: s })); }, [hour, sky]);
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const s = document.getElementById('game-stage'); return s && s.classList.contains('walk-on') && window.__game; }, null, { timeout: 900000, polling: 1000 });
  await p.waitForTimeout(4000);
  let bad = 0;
  for (const id of WHO) {
    const ok = await p.evaluate(id => { const g = window.__game, n = g.npcs.find(q => q.id === id); if (!n) return false; const a = Math.atan2(g.player.x - n.x, g.player.y - n.y) || 0; g.player.x = n.x + Math.sin(a) * 1.6; g.player.y = n.y + Math.cos(a) * 1.6; g.player.z = n.z; g.player.h = a + Math.PI; g.player.speed = 0; g.cam.yaw = g.player.h; g.cam.snap = true; g.advance(0.3); for (let i = 0; i < 8; i++) g.frame(0.05); return true; }, id);
    if (!ok) { console.log(`${id}: not on the walk`); continue; }
    // (the talk opened as the walk opens one, whatever its stories stand at: game.js talkAs; the two lines are the
    // longest the walk's people say, as long as the box holds)
    await p.evaluate(id => window.__game.talkAs(id, ['She said Hachiko. Which side of Hachiko, though? There are two of him tonight, and I have been at the wrong one for twenty minutes.']), id);
    const open = await p.waitForFunction(() => window.__game.dlg.open && window.__game.talkCam.on, null, { timeout: 60000, polling: 300 }).then(() => true, () => false);
    if (!open) { console.log(`${id}: the talk did not open with its camera`); continue; }
    // (the first line typed out: its frames drawn, a software renderer's frame being a second or more)
    await p.waitForFunction(() => { const t = document.getElementById('gd-text'); return t && t.textContent.length > 20; }, null, { timeout: 60000, polling: 300 }).catch(() => {});
    await p.waitForTimeout(2500);
    const r = await p.evaluate(() => window.__talkFace());
    // (DUMP=1: every visible element of the stage with something to show, outside the words: what a talk leaves up)
    if (process.env.DUMP) console.log('up during the talk:', JSON.stringify(await p.evaluate(() => { const st = document.getElementById('game-stage'), out = new Set();
      for (const e of st.querySelectorAll('*')) { if (e.closest('#gd') || e.tagName === 'CANVAS') continue; const own = /^(BUTTON|IMG|SVG|KBD)$/i.test(e.tagName) || [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); if (!own) continue;
        const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue; let vis = true; for (let x = e; x && x !== document.documentElement; x = x.parentElement) { const s = getComputedStyle(x); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity <= 0.05) { vis = false; break; } } if (!vis) continue;
        let top = e; while (top.parentElement && top.parentElement !== st) top = top.parentElement; out.add((top.id ? '#' + top.id : '') + '.' + String(top.className).trim().split(/\s+/).join('.')); }
      return [...out]; })));
    await p.screenshot({ path: `${out}/${id}-${hour}-${w}x${h}.png` });
    if (!r) console.log(`${id}: no face measured`);
    else if (r.over.length) { bad++; console.log(`FAIL ${id}: the face at ${r.face} covered by ${r.over.map(o => `${o.what} (${Math.round(o.share * 100)}%)`).join('; ')}`); }
    else console.log(`${id}: the face at ${r.face} clear of the words and the HUD`);
    await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 80 && g.dlg.open; i++) g.dlg.next(false); });
    await p.waitForTimeout(1500);
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
