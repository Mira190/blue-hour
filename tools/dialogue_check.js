// The story's dialogue as a hand or a key works it, on a desktop and on a phone by touch (#17): a line typed a letter
// at a time is shown whole on the first press and passed on the second; one step back shows the line before and on
// again comes back; the log opens from the dialogue and has what was said and the answer given; the words' three
// sizes and their backing are kept across a reload. Stills of each at the size asked for. Exits 1 on a failure.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/dialogue_check.js out_dir [WxH]       (390x844: a phone, by touch)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/dialogue-check', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const errors = [], fail = m => { errors.push(m); console.log('FAIL', m); };
  p.on('pageerror', e => fail(`pageerror: ${String(e).slice(0, 200)}`));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(() => { try { localStorage.setItem('oe-quality', 'high'); if (!sessionStorage.getItem('dc-once')) { sessionStorage.setItem('dc-once', '1'); localStorage.removeItem('oe-words'); } } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0&preface=0`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.evaluate(() => document.getElementById('gt-play').click());
  await p.waitForFunction(() => !['idle', 'dressed'].includes(window.__game.story.state.phase), null, { timeout: 600000, polling: 500 });
  // (the order in the hand comes up first: put away, as a player does, before anyone speaks)
  for (let i = 0; i < 40 && await p.evaluate(() => window.__game.story.state.beat === 'order'); i++) { await p.waitForTimeout(1500); if (phone) await p.touchscreen.tap(195, 700); else await p.keyboard.press('KeyE'); }
  await p.waitForTimeout(1500);
  const snap = name => p.screenshot({ path: `${out}/${name}.png` });
  // a press: a tap on the words on a phone, E on a desktop
  const press = async () => { if (phone) { const r = await p.evaluate(() => { const q = document.getElementById('gd-text').getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; }); await p.touchscreen.tap(r[0], r[1]); } else await p.keyboard.press('KeyE'); await p.waitForTimeout(120); };
  const D = () => p.evaluate(() => ({ open: window.__game.dlg.open, text: document.getElementById('gd-text').textContent, back: document.getElementById('gd').classList.contains('back'), choices: document.querySelectorAll('#gd-choices button').length, name: document.getElementById('gd-name').textContent }));
  const A = 'Kagami left the camera with the stationmaster at a quarter past five, and said that whoever came for it would know what it was for.';
  const B = 'Nobody came. The stationmaster kept it in a drawer for sixty years, with the film still in it.';
  const Q = 'What did he leave it for?';
  // (the world held while the lines are typed: the dialogue's own clock, dlg.tick, is all that runs)
  await p.evaluate(([A, B, Q]) => { const g = window.__game; window.__picked = null;
    g.dlg.show({ name: 'Sumiko', role: '81', alive: true, color: '#ffcf8a', log: true }, [A], null, () => g.dlg.show({ name: 'Kagami', role: '1964', alive: false, color: '#9fc4ff', log: true }, [B, Q], [{ k: 0, text: 'For the evening to be taken' }, { k: 1, text: 'For someone to come' }], c => { window.__picked = c && c.k; })); }, [A, B, Q]);
  await p.waitForTimeout(250);
  let d = await D();
  if (!(d.open && d.text.length < A.length)) fail(`the first line is not being typed: "${d.text.slice(0, 40)}" (${d.text.length} of ${A.length})`);
  await snap('1-typing');
  await press(); d = await D();
  if (d.text !== A) fail(`the first press did not show the line whole: ${d.text.length} of ${A.length}`); else console.log('first press: the line whole');
  await press(); await p.waitForTimeout(250); d = await D();
  if (!(d.open && d.name === 'Kagami' && d.text.length < B.length)) fail(`the second press did not pass to the next line: ${d.name} "${d.text.slice(0, 40)}"`); else console.log('second press: the next line');
  await press(); await press(); await p.waitForTimeout(200); d = await D(); // (B whole, then on to the question)
  for (let i = 0; i < 40 && !(await D()).choices; i++) await p.waitForTimeout(100);
  d = await D();
  if (d.text !== Q || d.choices !== 2) fail(`the question is not up with its two answers: "${d.text}" ${d.choices}`);
  await snap('2-question');
  // one step back, and on again
  if (phone) await p.tap('#gd [data-gd="back"]'); else await p.keyboard.press('KeyQ');
  await p.waitForTimeout(150); d = await D();
  if (!(d.back && d.text === B && d.choices === 0)) fail(`a step back did not show the line before: back ${d.back}, "${d.text.slice(0, 40)}", ${d.choices} answers`); else console.log('back: the line before');
  await snap('3-back');
  if (phone) await p.tap('#gd [data-gd="back"]'); else await p.keyboard.press('KeyQ');
  await p.waitForTimeout(150); d = await D();
  if (!(d.back && d.text === A && d.name === 'Sumiko')) fail(`two steps back is not the first line, in its speaker's name: ${d.name} "${d.text.slice(0, 40)}"`);
  await press(); await press(); d = await D();
  if (!(!d.back && d.text === Q && d.choices === 2)) fail(`on again did not come back to the question: back ${d.back}, "${d.text.slice(0, 40)}", ${d.choices}`); else console.log('on again: the question, and its answers');
  // the answer, and the log
  // (on a desktop by the arrows: the hand on the first answer, then the second, ringed by an outline and not only by its
  // colour; E gives it)
  if (phone) await p.tap('#gd-choices button[data-k="1"]');
  else {
    await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(150);
    const on = await p.evaluate(() => { const f = document.activeElement; return f && f.closest('#gd-choices') ? { k: f.dataset.k, ring: getComputedStyle(f).outlineStyle } : null; });
    if (!on || on.k !== '1' || on.ring === 'none') fail(`the arrows did not put the hand on the second answer, ringed: ${JSON.stringify(on)}`); else console.log('arrows: the hand on the second answer, ringed');
    await p.keyboard.press('KeyE');
  }
  await p.waitForTimeout(200);
  if ((await p.evaluate(() => window.__picked)) !== 1) fail('the answer was not taken');
  await p.evaluate(() => { window.__game.dlg.show({ name: 'Sumiko', role: '81', alive: true, color: '#ffcf8a', log: true }, ['Then you know what I know.'], null, null); });
  await p.waitForTimeout(300);
  if (phone) await p.tap('#gd [data-gd="log"]'); else await p.keyboard.press('KeyL');
  await p.waitForTimeout(400);
  const L = await p.evaluate(() => ({ on: document.getElementById('g-story-log').classList.contains('on'), e: window.__game.storyLog.entries.filter(q => q.kind !== 'aside').map(q => `${q.kind}|${q.who}|${q.text}`) }));
  // (what the story says over the picture meanwhile, its asides, is the log's too, and left out here)
  const want = [`line|Sumiko|${A}`, `line|Kagami|${B}`, `q|Kagami|${Q}`, 'a|You|For someone to come', 'line|Sumiko|Then you know what I know.'];
  const tail = L.e.slice(-want.length);
  if (!L.on) fail('the log did not open from the dialogue');
  if (want.some((x, i) => tail[i] !== x)) fail(`the log's last lines: ${JSON.stringify(tail)}`); else console.log('the log: every line, the question and the answer, in order');
  await snap('4-log');
  // the words: the largest, with a backing; kept across a reload
  await p.click('#g-story-log [data-size="2"]'); await p.click('#g-story-log [data-solid]'); await p.waitForTimeout(200);
  await snap('5-log-largest');
  if (phone) await p.tap('#g-story-log button.go'); else await p.keyboard.press('KeyL');
  await p.waitForTimeout(300);
  if (await p.evaluate(() => document.getElementById('g-story-log').classList.contains('on'))) fail('the log did not close');
  await snap('6-words-largest');
  // nothing cut by the frame's edge: the dialogue and the goal inside the window
  const cut = await p.evaluate(() => { const W = innerWidth, H = innerHeight, r = [...document.querySelectorAll('#gd-text, #gd-name, .gd-tools button, #g-story-goal span')].filter(e => e.offsetParent && e.textContent).map(e => [e.id || e.className || e.tagName, e.getBoundingClientRect()]); return r.filter(([, q]) => q.left < -1 || q.right > W + 1 || q.top < -1 || q.bottom > H + 1).map(([n, q]) => `${n} ${Math.round(q.left)},${Math.round(q.top)}-${Math.round(q.right)},${Math.round(q.bottom)}`); });
  if (cut.length) fail(`cut by the edge at the largest size: ${cut.join('; ')}`);
  for (let i = 0; i < 4 && (await D()).open; i++) await press();
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.getElementById('game-stage') && window.__game, null, { timeout: 900000, polling: 500 });
  const kept = await p.evaluate(() => [document.getElementById('game-stage').classList.contains('words-2'), document.getElementById('game-stage').classList.contains('words-solid')]);
  if (!kept[0] || !kept[1]) fail(`the words were not kept across a reload: ${kept}`); else console.log('the words: kept across a reload');
  console.log(`${errors.length ? 'FAIL' : 'ok'}: ${errors.length} failures`);
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
