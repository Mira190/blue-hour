// A swap seen (issue 174): someone of the crowd on the screen within R m (15) of the lens changing between a far copy and a
// whole person (people.js crowdRenderer's near pick) while in view. Every frame is drawn and a still taken after each; when
// a swap happens between two stills, both are kept, cropped round that person, side by side (before | after), with how far
// off they stand and which way they changed. Whether a player can see it: a jump of pose, clothes or face, a step of light.
//   node tools/crowd_swap_shot.js <out_dir> [WxH, 390x844] [swaps, 3]     (FROM=n: the frame; PORT=; MAX_S=300)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const [,, out = '/tmp/swaps', size = '390x844', want = '3'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500, R = +(process.env.R || 15);
  fs.mkdirSync(out, { recursive: true });
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 3 : 1, hasTouch: phone, isMobile: phone,
    ...(phone ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' } : {}) });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  if (process.env.FROM) await p.addInitScript(n => { try { localStorage.setItem('bh-story-late', JSON.stringify({ fi: n, left: 7 - n, prints: Array.from({ length: n }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, +process.env.FROM);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(4000);
  // (as tools/crowd_cost.js: a late case is continued, then the story left to leave the title's 'dressed')
  for (let k = 0; k < 15; k++) {
    const done = await p.evaluate(late => { const t = document.getElementById('g-title'); if (!t || t.hidden) return true; const vis = id => { const e = document.getElementById(id); return e && e.offsetParent ? e : null; };
      const x = (late ? vis('gt-continue') || vis('gt-cont-go') : null) || vis('gt-story-go') || vis('gt-cont-go') || document.getElementById('gt-play'); if (x) x.click(); return false; }, !!process.env.FROM);
    if (done) break; await p.waitForTimeout(1500);
  }
  await p.waitForFunction(() => { const s = window.__game.story && window.__game.story.state; return !s || s.phase !== 'dressed'; }, null, { timeout: 300000, polling: 1000 }).catch(() => {});
  await p.waitForTimeout(1000 * (+process.env.WARM || 15));
  // who is on the screen within R m, and drawn how; the box of each on the screen
  const look = () => p.evaluate(R => { const g = window.__game, D = g.crowdDraw(), cam = g.camera, c = cam.position, P = g.crowd.P, V = new THREE.Vector3(), o = {};
    for (let i = 0; i < g.crowd.active; i++) { const q = P[i]; if (!q.inPic || (q.line < 0 && !q.pz)) continue; const d = Math.hypot(q.x - c.x, q.y + c.z); if (d > R) continue;
      const pt = []; for (const y of [0, 1.8]) { V.set(q.x, q.z + y, -q.y); if (V.clone().applyMatrix4(cam.matrixWorldInverse).z >= -0.1) break; V.project(cam); pt.push([(V.x + 1) / 2 * innerWidth, (1 - V.y) / 2 * innerHeight]); }
      if (pt.length < 2) continue; const [f, t] = pt; if (f[0] < 0 || f[0] > innerWidth || t[1] > innerHeight || f[1] < 0) continue;
      o[i] = { whole: D.active.has(i), d: +d.toFixed(1), x: f[0], y0: t[1], y1: f[1], moving: !!q.moving }; }
    return o; }, R);
  let was = await look(), prev = await p.screenshot({ timeout: 120000 }), found = 0, frames = 0;
  const t0 = Date.now(), list = [];
  while (found < +want && Date.now() - t0 < 1000 * (+process.env.MAX_S || 300)) {
    const png = await p.screenshot({ timeout: 120000 }), now = await look(); frames++;
    for (const i in now) if (was[i] && was[i].whole !== now[i].whole) {
      const a = was[i], z = now[i], hh = Math.max(40, z.y1 - z.y0), box = [Math.max(0, z.x - hh * 0.6), Math.max(0, z.y0 - hh * 0.15), Math.min(w, z.x + hh * 0.6), Math.min(h, z.y1 + hh * 0.1)];
      const k = found++, fa = path.join(out, `swap-${k}-before.png`), fb = path.join(out, `swap-${k}-after.png`);
      fs.writeFileSync(fa, prev); fs.writeFileSync(fb, png);
      list.push({ k, i: +i, d: z.d, from: a.whole ? 'whole' : 'far copy', to: z.whole ? 'whole' : 'far copy', moving: z.moving, px: Math.round(hh), box });
      break;
    }
    was = now; prev = png;
  }
  await b.close();
  // each swap: the two crops side by side, scaled to one height (Pillow, as tools/contact_sheet.py)
  for (const s of list) execFileSync('python3', ['-c', `
import sys
from PIL import Image
a, b, out, x0, y0, x1, y1, dpr = sys.argv[1], sys.argv[2], sys.argv[3], *map(float, sys.argv[4:9])
A = [Image.open(f).crop((int(x0 * dpr), int(y0 * dpr), int(x1 * dpr), int(y1 * dpr))) for f in (a, b)]
H = 480; A = [i.resize((max(1, int(i.width * H / max(1, i.height))), H)) for i in A]
S = Image.new('RGB', (A[0].width + A[1].width + 8, H), (12, 12, 14)); S.paste(A[0], (0, 0)); S.paste(A[1], (A[0].width + 8, 0)); S.save(out)
`, path.join(out, `swap-${s.k}-before.png`), path.join(out, `swap-${s.k}-after.png`), path.join(out, `swap-${s.k}.png`), ...s.box.map(String), String(phone ? 3 : 1)]);
  console.log(`swaps: ${list.length} in ${frames} frames drawn (${((Date.now() - t0) / 1000).toFixed(0)} s): ${JSON.stringify(list.map(s => ({ k: s.k, d: s.d, px: s.px, from: s.from, to: s.to, moving: s.moving })))}`);
})().catch(e => { console.error(e); process.exit(1); });
