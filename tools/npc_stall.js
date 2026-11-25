// A character's load that never settles (the walk's paired runs: "Nagi is not drawn ten minutes after setting out" and
// "Ren is not drawn ten minutes after his street moment began", each with {"pending":true,"loading":true}: her npcLoad
// started and lib.require of her character never resolved; only with a second browser on the machine). Here the stall
// is made: the request for one NPC's character model is held unanswered (STALL=drop: refused instead), the walk set
// out, you put beside them, and the page's own frames run until they are drawn as someone (their rig no longer pending)
// or LATE seconds of the wall clock pass. On a phone's page (PHONE=1 TIER=low 390x844) the loads go one at a time
// (game.js npcStream), so a second NPC beside them is asked of too: a stalled one must not hold the next.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/npc_stall.js [npc=nagi] [WxH=800x500]   (LATE=120 STALL=hold|drop PHONE=1 TIER=low)
// Exits 1 if they are still not drawn.
const { chromium } = require('playwright');
const [,, who = 'nagi', size = '800x500'] = process.argv;
const LATE = +process.env.LATE || 120;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox', '--disable-gpu-watchdog'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone,
    ...(process.env.PHONE ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' } : {}) });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', '1'); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  // (the character's file: from the map's own cast, game.json npcs[].look.character, and the people's index, people.json)
  const base = `http://localhost:${process.env.PORT || 8800}/`;
  const G = await (await fetch(`${base}data/shibuya/game.json`)).json(), I = await (await fetch(`${base}assets/people/people.json`)).json();
  const npc = (G.npcs || []).find(n => n.id === who);
  if (!npc) { console.log(`no NPC ${who} in game.json`); process.exit(2); }
  const ch = npc.look.character, file = ((I.npcs && I.npcs.characters && I.npcs.characters[ch]) || (I.heroes && I.heroes.characters && I.heroes.characters[ch]) || {}).file || `${ch}.glb`;
  console.log(`stalling ${who}'s character ${ch}: ${file} (${process.env.STALL || 'hold'})`);
  const held = [];
  await p.route(u => u.pathname.endsWith('/' + file.split('/').pop()), route => { if (process.env.STALL === 'drop') route.abort('failed'); else held.push(route); });
  await p.goto(`${base}?overture=0`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 250 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return t && getComputedStyle(t).opacity > 0.9; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(2500); await p.keyboard.press('Space'); await p.waitForTimeout(1600);
  await p.waitForSelector('#gt-walk-go', { state: 'visible', timeout: 600000 }); await p.waitForTimeout(3000);
  await p.evaluate(() => window.__game.walkStart({ t: '21:00', w: 'clear' }));
  await p.waitForFunction(id => window.__game.player && window.__game.player.rig && window.__game.npcById(id), who, { timeout: 400000 });
  await p.waitForTimeout(6000); await p.keyboard.press('Space'); await p.waitForTimeout(3000);
  // (you beside them, and on a phone a second NPC put beside them too, whose load waits on the first's)
  const other = await p.evaluate(id => { const g = window.__game, n = g.npcById(id), o = (g.G.npcs || []).map(q => g.npcById(q.id)).find(q => q && q !== n && q.rig.pending && !q.away);
    g.spawn([n.x + 1.2, n.y + 1.2]); if (o) g.npcMove(o, [n.x + 2.5, n.y]); return o ? o.id : null; }, who);
  const t0 = Date.now();
  let st = null;
  while (Date.now() - t0 < LATE * 1000) {
    await p.waitForTimeout(2000);
    st = await p.evaluate(([id, oid]) => { const g = window.__game, n = g.npcById(id), o = oid && g.npcById(oid); return { pending: !!n.rig.pending, loading: !!n.loading, as: n.rig.character || (n.rig.root && n.rig.root.name) || '', other: o ? { id: oid, pending: !!o.rig.pending } : null }; }, [who, other]);
    if (!st.pending && (!st.other || !st.other.pending)) break;
  }
  const s = Math.round((Date.now() - t0) / 1000), ok = st && !st.pending && (!st.other || !st.other.pending);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${who}, her character held unanswered (${held.length} request${held.length === 1 ? '' : 's'} held): ${ok ? `drawn after ${s} s` : `still not drawn after ${s} s`} ${JSON.stringify(st)}`);
  await b.close();
  process.exit(ok ? 0 : 1);
})();
