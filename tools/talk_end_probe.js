// The first frame's talk ended as a player ends it: what the camera does the moment the afterimage stops speaking.
// The camera is raised by the player alone (R, the camera button, the left trigger, or the release with it down), and
// only once they have found where the picture is taken from: the talk's last press must not raise it, nor put the lens's
// view on the screen. Plays the episode from the title to Sumiko, passes her lines one press at a time (E on a desktop,
// a tap on the words on a phone; MASH=1 presses the way an impatient player does, F, several a second, and keeps on
// a moment after the last line), then watches the camera for a few seconds and takes stills.
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   xvfb-run -a node tools/talk_end_probe.js out_dir [WxH]          (390x844: a phone, by touch)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/talk-end', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500, MASH = !!process.env.MASH;
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const errors = [], fail = m => { errors.push(m); console.log('FAIL', m); };
  p.on('pageerror', e => fail(`pageerror: ${String(e).slice(0, 200)}`));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'low');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0&preface=0`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.evaluate(() => document.getElementById('gt-play').click());
  await p.waitForFunction(() => !['idle', 'dressed'].includes(window.__game.story.state.phase), null, { timeout: 900000, polling: 500 });
  const snap = name => p.screenshot({ path: `${out}/${name}.png` }).catch(() => console.log(`(no still ${name})`));
  const state = () => p.evaluate(() => { const g = window.__game, s = g.story.state, d = document.getElementById('gd'), c = g.camera, pl = g.player;
    return { phase: s.phase, beat: s.beat, fi: s.fi, t: +s.t.toFixed(1), dlg: !!(d && !d.hidden), cam: !!s.cam, finder: !!g.story.finder, goal: (document.querySelector('#g-story-goal span') || {}).textContent || '',
      eye: c ? +Math.hypot(c.position.x - pl.x, c.position.z + pl.y, c.position.y - (pl.z + 1.56)).toFixed(2) : -1, // (the view's distance from your eye: 0 when it is the lens's)
      camBtn: (document.getElementById('g-story-cam') || {}).className || '', at: [+pl.x.toFixed(1), +pl.y.toFixed(1)] }; });
  const goTo = (at, d) => p.evaluate(([at, d]) => { const g = window.__game, pl = g.player; let dx = pl.x - at[0], dy = pl.y - at[1], l = Math.hypot(dx, dy); if (l < 0.5) { dx = 1; dy = 0; l = 1; } pl.x = at[0] + dx / l * d; pl.y = at[1] + dy / l * d; pl.h = Math.atan2(-dx, -dy); if (g.cam) g.cam.yaw = pl.h; }, [at, d]);
  let tapAt = null; // (where the last tap on the words was: an impatient thumb taps there again)
  const press = async () => {
    if (phone) { const r = await p.evaluate(() => { const q = document.getElementById('gd-text').getBoundingClientRect(); return q.width ? [q.left + q.width / 2, q.top + q.height / 2] : null; }); if (r) tapAt = r; const q = tapAt || [w / 2, h * 0.8]; await p.touchscreen.tap(q[0], q[1]); }
    else await p.keyboard.press(MASH ? 'KeyF' : 'KeyE');
  };
  const t0 = Date.now();
  let presses = 0, last = '';
  while (Date.now() - t0 < 1500e3) {
    const s = await state(), k = `${s.phase}/${s.beat}/${s.dlg}`;
    if (k !== last) { console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s ${k} t ${s.t} at ${s.at} cam ${s.cam} finder ${s.finder} · ${s.goal.slice(0, 90)}`); last = k; }
    if (s.phase === 'stop' && s.beat === 'shoot') break;
    if (s.phase === 'go' && s.beat === 'order') { if (phone) await p.touchscreen.tap(w / 2, h * 0.83); else await p.keyboard.press('KeyE'); await p.waitForTimeout(1500); continue; }
    if (s.phase === 'go' && s.beat === 'job') { if (s.dlg) await p.keyboard.press('KeyE'); else await p.evaluate(() => { const g = window.__game, st = g.story.state, J = st.fr.job; if (!st.jobReady) return; const pl = g.player; g.cam.yaw = Math.atan2(J.at[0] - pl.x, J.at[1] - pl.y); g.cam.pitch = 0.3; g.story.raise(true); }); await p.waitForTimeout(600); continue; } // (the opening's job: the office passed by E, your own camera raised to her corner)
    if (s.dlg) {
      if (s.phase === 'stop' && s.beat === 'talk' && !presses) await snap('1-talk');
      presses++; await press(); await p.waitForTimeout(MASH ? 150 : 700); continue;
    }
    if (s.phase === 'go' && s.beat === 'meet') { const at = await p.evaluate(() => { const t = window.__game.story.state.target; return t ? [t[0], t[1]] : null; }); if (at) await goTo(at, 1.8); }
    else if (s.phase === 'go' && s.beat === 'approach') { const at = await p.evaluate(() => { const fr = window.__game.story.state.fr; return fr.stop_at || (fr.afterimage && fr.afterimage.at); }); if (at) await goTo(at, 6); }
    else if (s.phase === 'stop' && s.beat === 'seek') { const at = await p.evaluate(() => window.__game.story.state.fr.afterimage.at); await goTo(at, 2.2); }
    await p.waitForTimeout(400);
  }
  // the talk is over: the camera must still be down, and the view behind you, until the player raises it
  if (MASH) for (let i = 0; i < 4; i++) { await press(); await p.waitForTimeout(150); } // (the presses that came after the last line)
  const seen = [];
  for (let i = 0; i < 16; i++) {
    const s = await state(); seen.push(s);
    if (i === 1) await snap('2-talk-over');
    if (i === 10) await snap('3-talk-over-later');
    await p.waitForTimeout(300);
  }
  const up = seen.filter(s => s.cam || s.finder);
  console.log(`after ${presses} presses, the camera ${up.length ? `came up in ${up.length} of ${seen.length} looks` : 'stayed down'}; view from the eye ${seen.map(s => s.eye).join(' ')}`);
  console.log(`goal: ${seen[seen.length - 1].goal}`);
  console.log(`where you stand ${seen[0].at}; the place ${JSON.stringify(await p.evaluate(() => window.__game.story.state.fr.task.stand))}`);
  if (up.length) fail(`the camera came up by itself when the talk ended (${MASH ? 'presses of F' : phone ? 'taps' : 'presses of E'})`);
  if (seen.some(s => /\bon\b/.test(s.camBtn))) fail('off the light, the button to raise the camera is offered');
  // then the place found: in the light the button comes up, and the camera comes up with it (R, or a tap on the button)
  const stand = await p.evaluate(() => window.__game.story.state.fr.task.stand);
  await goTo(stand, 0.6); await p.waitForTimeout(1500);
  let s = await state();
  if (!/\bon\b/.test(s.camBtn)) fail(`in the light, no button to raise the camera (${s.camBtn})`);
  await snap('4-in-the-light');
  if (phone) await p.tap('#g-story-cam'); else await p.keyboard.press('KeyR');
  await p.waitForTimeout(2000); s = await state();
  console.log(`in the light: raised ${s.cam}, finder ${s.finder}, view from the eye ${s.eye} · ${s.goal.slice(0, 90)}`);
  if (!s.cam || !s.finder) fail('in the light, the camera did not come up');
  await snap('5-raised-in-the-light');
  await b.close();
  if (errors.length) { console.log(`${errors.length} failure(s)`); process.exit(1); }
  console.log('ok');
})().catch(e => { console.error(e); process.exit(1); });
