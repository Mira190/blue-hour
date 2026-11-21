// The walk looked over as a launch review looks (issue 134): stills of the page, the walk's interface in them, from a
// list of standpoints at each hour and sky the walk's menu offers. tools/walk_play.js says whether the walk works; this
// is for what a person sees there. Sets out on the walk from a fresh page (as the story's last card does), then for
// each condition presses the menu's own hour and sky, and for each standpoint stands you there and takes the page.
//   - SET=hud: round the scramble, turned to each of eight ways, so that the corner, the buttons and the keys' line are
//     seen over every picture the crossing has (lit signs, the sky, the dark);
//   - SET=edge: out along six ways from the hero level's centre, at each distance in RINGS (metres; the footway nearest
//     that point), looking on outward and back: where the picture falls below the hero level, and what the map's own
//     edge is (a phone plays inside its district);
//   - SET=menu: the walk's menu, as it opens and scrolled to its foot, and the camera (photo mode).
// Prints, for each still, where you stand, how many of the crowd are out (and what the frame governor has cut, on a
// slow renderer), where the corner says you are and what of the interface lies outside the screen or under a
// phone's safe area (EDGE px, 12 by default).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/walk_review.js out_dir [WxH] [conditions]
// conditions: a comma list of hour.sky, the hour a button of the menu's (data-t) or hh:mm, the sky a button's data-w:
// "blue.clear,night.rain" by default. TIER=high|medium|low; SETTLE=seconds the world runs before each still (5).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [,, out = '/tmp/walk-review', size = '1440x900', conds = 'blue.clear,night.rain'] = process.argv;
const PORT = process.env.PORT || 8800, SETS = (process.env.SET || 'hud,edge,menu').split(',');
const SETTLE = +(process.env.SETTLE || 5) * 1000, EDGE = +(process.env.EDGE || 12);
const RINGS = (process.env.RINGS || '60,100,140,200,300,500,800').split(',').map(Number);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const [w, h] = size.split('x').map(Number), phone = w < 500, tag = phone ? 'phone' : 'desk';
  const G = JSON.parse(fs.readFileSync(path.join(__dirname, '../web/data/shibuya/game.json'), 'utf8'));
  const city = JSON.parse(fs.readFileSync(path.join(__dirname, '../cities/shibuya/city.json'), 'utf8'));
  const hero = G.hero[0], C = hero.at, D = city.phone_district;
  // every vertex of the footways, in metres
  const foot = [];
  for (const f of G.paths.foot) for (let i = 0; i < f.p.length; i += 3) foot.push([f.p[i] / 10, f.p[i + 1] / 10]);
  const inside = q => !phone || (q[0] > D.x[0] + 8 && q[0] < D.x[1] - 8 && q[1] > D.y[0] + 8 && q[1] < D.y[1] - 8);
  const nearest = (x, y) => { let b = null, bd = 1e9; for (const q of foot) { if (!inside(q)) continue; const d = Math.hypot(q[0] - x, q[1] - y); if (d < bd) { bd = d; b = q; } } return { at: b, off: bd }; };

  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e).slice(0, 200)); console.log(`pageerror: ${String(e).slice(0, 200)}`); });
  p.on('crash', () => { console.log('the page crashed'); process.exit(1); });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); localStorage.setItem('oe3d-player', 'W'); if (!sessionStorage.getItem('wr-once')) { sessionStorage.setItem('wr-once', '1'); sessionStorage.setItem('oe-walk-auto', JSON.stringify({ t: 'blue', w: 'clear' })); } } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  const t0 = Date.now(), el = () => `${Math.round((Date.now() - t0) / 1000)}s`;
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  const set = await p.waitForFunction(() => { const s = document.getElementById('game-stage'); return !!s && /\bwalk-on\b/.test(s.className) && window.__game; }, null, { timeout: 40 * 60000, polling: 1000 }).then(() => true, () => false);
  if (!set) { console.log('the walk did not set out'); await b.close(); process.exit(1); }
  console.log(`${el()} out on the walk`);
  await p.waitForTimeout(8000);

  const stand = (at, yaw, pitch = -0.05, dist = 5) => p.evaluate(([at, yaw, pitch, dist]) => { const g = window.__game; g.spawn(at); g.player.h = yaw; g.cam.yaw = yaw; g.cam.pitch = pitch; g.cam.dist = dist; }, [at, yaw, pitch, dist]);
  // what of the interface is on the screen, and what of it is cut by the screen's edge
  const ui = () => p.evaluate(EDGE => {
    const W = innerWidth, H = innerHeight, cut = [], seen = [];
    for (const e of document.querySelectorAll('#g-walk-where > *, #g-walk-acts button, #g-walk-keys.on, #g-walk-told.on, #g-walk-tonight.on, #g-prompt, #g-touch > *, .g-stick, #g-menu-btn, #g-photo-btn, #g-toast, #g-hint')) {
      if (e.hidden) continue;
      const c = getComputedStyle(e), r = e.getBoundingClientRect();
      if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.05 || r.width < 2 || r.height < 2) continue;
      const id = e.id || `${e.parentElement.id}>${e.tagName.toLowerCase()}${e.className ? '.' + String(e.className).split(' ')[0] : ''}`;
      seen.push(id);
      if (r.left < EDGE || r.top < EDGE || r.right > W - EDGE || r.bottom > H - EDGE) cut.push(`${id} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
    const q = s => { const e = document.querySelector(s); return e ? e.textContent.trim() : ''; };
    return { where: `${q('#g-walk-where small')} · ${q('#g-walk-where .t')} · ${q('#g-walk-where em')}`, cut, seen: seen.length };
  }, EDGE);
  const shot = async name => {
    await p.waitForTimeout(SETTLE);
    await p.screenshot({ path: `${out}/${tag}-${name}.png`, timeout: 120000 }).catch(() => console.log(`(no still ${name})`));
    const u = await ui(), g = await p.evaluate(() => { const g = window.__game, P = g.player, C = g.crowd, gv = g.governor; return `${P.x.toFixed(0)},${P.y.toFixed(0)},${P.z.toFixed(1)}${C ? `, crowd ${C.active} of ${C.P.length}` : ''}${gv && gv.crowd != null ? `, governor's crowd ${(+gv.crowd).toFixed(2)}` : ''}`; });
    console.log(`${el()} ${name}: at ${g}; ${u.where}${u.cut.length ? `; AT THE EDGE: ${u.cut.join('; ')}` : ''}`);
  };
  const menu = async on => { // (the walk's own menu, by its key or its button)
    const isOn = () => p.evaluate(() => { const m = document.getElementById('g-menu'); return !!m && !m.hidden && m.offsetHeight > 0; });
    if ((await isOn()) === on) return;
    if (phone) { const r = await p.locator('#g-walk-acts [data-do="menu"]').first().boundingBox().catch(() => null); if (r && on) await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); else await p.keyboard.press('Escape'); } else await p.keyboard.press('Escape');
    await p.waitForTimeout(1200);
  };
  const cond = async c => {
    const [t, sky] = c.split('.');
    await menu(true);
    const got = await p.evaluate(([t, sky]) => {
      const g = window.__game, r = {};
      r.times = [...document.querySelectorAll('#gm-time button')].map(b => b.dataset.t), r.skies = [...document.querySelectorAll('#gm-weather button')].map(b => b.dataset.w);
      if (/^\d+:\d+$/.test(t)) { const [hh, mm] = t.split(':').map(Number); g.setClock(g.clock.y, g.clock.m, g.clock.d, hh * 60 + mm); r.t = 'set'; }
      else { const bt = document.querySelector(`#gm-time button[data-t="${t}"]`); if (bt) { bt.click(); r.t = 'pressed'; } }
      const bw = document.querySelector(`#gm-weather button[data-w="${sky}"]`); if (bw) { bw.click(); r.w = 'pressed'; }
      return r;
    }, [t, sky]);
    console.log(`${el()} ${c}: the menu's hours ${got.times.join(' ')}; skies ${got.skies.join(' ')}; hour ${got.t || 'NOT OFFERED'}, sky ${got.w || 'NOT OFFERED'}`);
    await p.waitForTimeout(1500);
    await menu(false);
    await p.waitForTimeout(12000); // (the sky eases over to what was asked)
  };

  const yawTo = (a, b2) => Math.atan2(b2[0] - a[0], b2[1] - a[1]);
  for (const c of conds.split(',')) {
    await cond(c);
    const cn = c.replace(/[:.]/g, '');
    if (SETS.includes('hud')) {
      const at = G.start.at;
      for (let i = 0; i < 8; i++) { await stand(at, i * Math.PI / 4, i % 2 ? 0.1 : -0.08, 5); await shot(`${cn}-hud-${i}`); }
      // (the middle of the scramble, looking up at the screens, and by the wall the seat is on)
      await stand([354, -985], yawTo([354, -985], [340, -960]), 0.25, 4); await shot(`${cn}-hud-mid`);
    }
    if (SETS.includes('edge')) {
      const ways = { n: 0, ne: 60, e: 100, s: 180, sw: 235, nw: 300 }; // (degrees from north: Koen-dori, Miyamasuzaka, the station, Meiji-dori south, Dogenzaka, Center Gai)
      for (const [k, deg] of Object.entries(ways)) for (const r of RINGS) {
        const a = deg * Math.PI / 180, q = nearest(C[0] + Math.sin(a) * r, C[1] + Math.cos(a) * r);
        if (!q.at || q.off > 60) { console.log(`${k}-${r}: no footway within 60 m (${q.off.toFixed(0)} m)`); continue; }
        await stand(q.at, a, -0.04, 5); await shot(`${cn}-edge-${k}-${String(r).padStart(3, '0')}-out`);
        if (r >= 200) { await stand(q.at, a + Math.PI, -0.04, 5); await shot(`${cn}-edge-${k}-${String(r).padStart(3, '0')}-back`); }
      }
    }
    if (SETS.includes('menu')) {
      await stand(G.start.at, yawTo(G.start.at, G.start.facing));
      await menu(true); await shot(`${cn}-menu`);
      await p.evaluate(() => { const m = document.querySelector('#g-menu .gm-card, #g-menu'); const s = [...document.querySelectorAll('#g-menu, #g-menu *')].find(e => e.scrollHeight > e.clientHeight + 8 && /auto|scroll/.test(getComputedStyle(e).overflowY)) || m; s.scrollTop = s.scrollHeight; });
      await shot(`${cn}-menu-foot`);
      await menu(false);
      await p.evaluate(() => { const e = document.querySelector('#g-walk-acts [data-do="photo"]'); if (e) e.click(); });
      await shot(`${cn}-photo`);
      await p.keyboard.press('Escape'); await p.waitForTimeout(800);
    }
  }
  await b.close().catch(() => {});
  console.log(`${errors.length} page error(s) (${el()})`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
