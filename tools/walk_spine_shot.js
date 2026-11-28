// Stills of the walk's structure (walktalk.js: the spine and the free stories; docs/STORY.md "The walk's line, beat by
// beat"): the corner beside Shun with Nagi's story told and his cold opening; the amber marks of the open stories; her
// train's call in the corner; and the plain card when it is missed. Prints what the corner and the box say at each.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/walk_spine_shot.js out_dir [WxH]          (390x844: a phone)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/walk-spine', size = '1440x900'] = process.argv;
const PORT = process.env.PORT || 8800;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const [w, h] = size.split('x').map(Number), phone = w < 500, tag = phone ? 'phone' : 'desk';
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone })).newPage();
  let bad = 0;
  p.on('pageerror', e => { bad++; console.log(`pageerror: ${String(e).slice(0, 200)}`); });
  await p.addInitScript(([t]) => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-player', 'W'); localStorage.setItem('bh-walk-intro', '1'); localStorage.removeItem('bh-walk-talk'); if (!sessionStorage.getItem('ws-once')) { sessionStorage.setItem('ws-once', '1'); sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t: 'night', w: 'clear' })); } } catch (e) { /* storage blocked */ } }, [process.env.TIER || (phone ? 'low' : 'high')]);
  await p.goto(`http://localhost:${PORT}/?overture=0`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  if (!(await p.waitForFunction(() => window.__game && document.getElementById('game-stage').classList.contains('walk-on'), null, { timeout: 15 * 60000, polling: 500 }).then(() => true, () => false))) { console.log('the walk did not set out'); process.exit(1); }
  const say = () => p.evaluate(() => { const q = s => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent.replace(/\s+/g, ' ').trim() : ''; }; return `corner "${q('#g-walk-where .q')}"; box "${q('#gd-text')}"; card "${q('#g-walk-told.on')}"; marks ${JSON.stringify([...document.querySelectorAll('.g-walk-mark')].filter(e => +e.style.opacity > 0.3).map(e => e.dataset.id + ':' + e.dataset.k))}`; });
  const frames = n => p.evaluate(n => { const g = window.__game; for (let i = 0; i < n; i++) g.frame(0.05); }, n);
  const shot = async n => { await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/${tag}-${n}.png`, timeout: 120000 }).catch(() => {}); console.log(`${n}: ${await say()}`); };
  const near = (id, d, side = 0) => p.evaluate(([id, d, side]) => { const g = window.__game, n = g.npcById(id); const a = Math.atan2(g.player.x - n.x, g.player.y - n.y) + side; g.spawn([n.x + Math.sin(a) * d, n.y + Math.cos(a) * d]); g.player.h = a + Math.PI; g.cam.yaw = g.player.h; }, [id, d, side]);
  // her story told: the free stories open; nearest Shun
  await p.evaluate(() => window.__game.walkTalk().startAt('hachiko'));
  await p.waitForFunction(() => ['shun', 'mei', 'oda'].every(id => { const n = window.__game.npcById(id); return n && !n.rig.pending; }), null, { timeout: 15 * 60000, polling: 1000 }).catch(() => console.log('not everyone drawn'));
  await near('shun', 11); await frames(10); await shot('1-near-shun');
  await near('shun', 1.6); await frames(6);
  await p.evaluate(() => { const g = window.__game, n = g.npcById('shun'); g.walkTalk().talk(n); }); await frames(40); await shot('2-shun-cold');
  await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 40 && g.dlg.open; i++) g.dlg.next(false); });
  await frames(6); await shot('3-shun-asked');
  // her train: her story told and she by the wall, the clock at 0:20, its call in the corner whatever is under way
  await p.evaluate(() => { const g = window.__game, t = g.walkTalk(), n = g.npcById('nagi'); g.npcMove(n, [372.6, -1043.2]); g.setClock(g.clock.y, g.clock.m, g.clock.d, 20); g.spawn([382, -1030]); g.player.h = Math.atan2(372.6 - 382, -1043.2 + 1030); g.cam.yaw = g.player.h; });
  await frames(10); await shot('4-train-call');
  // missed: past 0:33 with her still by the wall
  await p.waitForTimeout(2000); // (the page's own frames read the clock as it was: walktalk.js check)
  await p.evaluate(() => { const g = window.__game; g.setClock(g.clock.y, g.clock.m, g.clock.d, 34); });
  await p.waitForFunction(() => (window.__game.walkTalk().state().last || {}).w === 'missed', null, { timeout: 120000, polling: 250 }).catch(() => console.log('not missed in two minutes'));
  await frames(10); await shot('5-missed');
  console.log(`line ${JSON.stringify(await p.evaluate(() => window.__game.walkTalk().state().last))}; ${bad} page errors`);
  await b.close();
})();
