// The Credits screen (web/credits.js) on a desktop's page (1440x900) and a phone's (390x844): opened from the title's
// menu and from the pause menu, read, its measurements switched off and on, and closed. Stills of each go to out_dir.
// It fails: no Credits row on the title's menu; a screen without the map's sources, the works, the version or the
// switch; text wider than the screen; a switch that leaves the visitor id in the browser or lets another event out;
// a page that measures again after it was switched off; Esc or Back that does not give back the screen beneath.
// The page's events are sent to this machine (?telemetry=<url>, as tools/telemetry_check.js does) and counted here.
// (The way in from the story's last card is played by tools/story_play.js, at the last card.)
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/credits_shot.js out_dir            (SCREENS=desk or touch: only that one)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/credits-shot'] = process.argv;
const PORT = process.env.PORT || 8800;
const SCREENS = (process.env.SCREENS || 'desk,touch').split(',');
let fails = 0;
const fail = m => { fails++; console.log(`FAIL ${m}`); };
const ok = m => console.log(`ok   ${m}`);

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  for (const screen of SCREENS) {
    const touch = screen === 'touch', size = touch ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    const ctx = await b.newContext({ viewport: size, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
    const p = await ctx.newPage();
    const tag = m => `${screen}: ${m}`;
    p.on('pageerror', e => fail(tag(`page error: ${String(e).slice(0, 300)}`)));
    let sent = 0;
    await p.route('**/telemetry-sink', r => { sent++; r.fulfill({ status: 204, body: '' }); });
    await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || (touch ? 'low' : 'high'));
    const url = `http://localhost:${PORT}/?telemetry=${encodeURIComponent(`http://localhost:${PORT}/telemetry-sink`)}`;
    const titled = async () => { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 }); await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden && t.dataset.screen === 'press'; }, null, { timeout: 900000, polling: 500 }); };
    const snap = n => p.screenshot({ path: `${out}/${screen}-${n}.png`, timeout: 120000 }).catch(e => console.log(`(no still ${n}: ${String(e).slice(0, 80)})`));
    const store = () => p.evaluate(() => ({ vid: localStorage.getItem('oe3d-vid'), visits: localStorage.getItem('oe3d-visits'), sw: localStorage.getItem('oe3d-telemetry'), phs: sessionStorage.getItem('oe3d-phs'),
      on: !!(window.OETelemetry && OETelemetry.on), state: window.OETelemetry && OETelemetry.consent ? OETelemetry.consent.state() : null }));
    const cr = () => p.evaluate(() => { const c = document.getElementById('g-credits'); if (!c || c.hidden) return { up: false };
      const s = c.querySelector('.cr-scroll'), wide = [...c.querySelectorAll('.cr-in *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 || e.getBoundingClientRect().left < -1).length;
      return { up: true, place: c.querySelectorAll('.cr-place .cr-row').length, attr: c.querySelectorAll('.cr-attr li').length, works: c.querySelectorAll('.cr-side .cr-row').length, sw: c.querySelectorAll('[data-measure]').length,
        ver: (c.querySelector('#g-credits-ver') || {}).textContent || '', note: (c.querySelector('.cr-measure-state') || {}).textContent || '', wide, sideways: s.scrollWidth > s.clientWidth + 1, tall: s.scrollHeight, h: s.clientHeight,
        op: getComputedStyle(c).opacity }; });

    await titled();
    if (touch) await p.tap('#gt-press'); else await p.keyboard.press('Space');
    await p.waitForFunction(() => document.getElementById('g-title').dataset.screen === 'menu', null, { timeout: 20000 });
    await p.waitForTimeout(1600);
    const row = await p.evaluate(() => { const r = document.getElementById('gt-credits-go'), o = document.getElementById('gt-opts-go'), a = r && r.getBoundingClientRect(), c = o.getBoundingClientRect();
      return r && r.offsetParent ? { w: Math.round(a.width), h: Math.round(a.height), ow: Math.round(c.width), oh: Math.round(c.height), bottom: Math.round(a.bottom), vh: innerHeight } : null; });
    if (!row) fail(tag('the title\'s menu has no Credits row'));
    else if (row.w !== row.ow || row.h !== row.oh) fail(tag(`the Credits row is ${row.w}x${row.h}, the Options row ${row.ow}x${row.oh}`));
    else if (row.bottom > row.vh) fail(tag(`the Credits row ends at ${row.bottom}, under the screen's ${row.vh}`));
    else ok(tag(`the title's menu has its Credits row, ${row.w}x${row.h} as the others, ending at ${row.bottom} of ${row.vh}`));
    await snap('1-menu');

    // from the title: by the keys on a desktop (down to the row, Enter), by a tap on a phone
    if (touch) await p.tap('#gt-credits-go');
    else { for (let i = 0; i < 8 && !(await p.evaluate(() => document.activeElement && document.activeElement.id === 'gt-credits-go')); i++) await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); }
    await p.waitForFunction(() => { const c = document.getElementById('g-credits'); return c && !c.hidden && c.querySelector('.cr-place .cr-row'); }, null, { timeout: 20000 }).catch(() => {});
    await p.waitForFunction(() => +getComputedStyle(document.getElementById('g-credits')).opacity > 0.99, null, { timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(300);
    let c = await cr();
    if (!c.up) fail(tag('the Credits did not open from the title\'s menu'));
    else {
      if (c.place < 12 || c.attr < 4 || c.works < 10 || c.sw !== 2 || !/Version/.test(c.ver)) fail(tag(`the Credits lack something: ${JSON.stringify(c)}`));
      else ok(tag(`the Credits: ${c.attr} credit lines, ${c.place} sources, ${c.works} works and notes, the switch, "${c.ver.replace('Version', 'Version ')}"`));
      if (c.wide || c.sideways) fail(tag(`${c.wide} things on the Credits are wider than the screen${c.sideways ? ', and it scrolls sideways' : ''}`));
      if (+c.op < 0.99) fail(tag(`the Credits are at opacity ${c.op}`));
    }
    await snap('2-credits');
    const pages = Math.min(6, Math.ceil(c.tall / (c.h * 0.85)));
    for (let i = 1; i < pages; i++) { await p.evaluate(y => { document.querySelector('#g-credits .cr-scroll').scrollTop = y; }, Math.round(i * c.h * 0.85)); await p.waitForTimeout(250); await snap(`2-credits-${i + 1}`); }

    // the switch: off removes the id and lets nothing more out; on again says from when
    await p.evaluate(() => document.querySelector('#g-credits .cr-measure').scrollIntoView({ block: 'center' }));
    const s0 = await store();
    if (!s0.vid || !s0.on || s0.state !== 'on') fail(tag(`before the switch the page should be measuring under an id: ${JSON.stringify(s0)}`));
    await p.evaluate(() => window.OETelemetry.flush()); await p.waitForTimeout(300);
    const sent0 = sent;
    if (touch) await p.tap('#g-credits [data-measure="off"]'); else await p.click('#g-credits [data-measure="off"]');
    await p.evaluate(() => { window.OETelemetry.track('probe', {}); window.OETelemetry.flush(); }); await p.waitForTimeout(400);
    const s1 = await store(); c = await cr();
    if (s1.vid || s1.visits || s1.phs || s1.sw !== 'off' || s1.on || s1.state !== 'off') fail(tag(`switched off, the browser still holds something: ${JSON.stringify(s1)}`));
    else if (sent !== sent0) fail(tag(`switched off, ${sent - sent0} more batches were sent`));
    else if (!/^Off\./.test(c.note)) fail(tag(`switched off, the screen says "${c.note}"`));
    else ok(tag(`switched off: the id, the visit count and the session are gone, nothing more is sent (${sent0} batches before), and the screen says "${c.note}"`));
    await p.waitForTimeout(300); await snap('3-off');
    // a page opened again stays off, and makes no id
    await titled();
    const s2 = await store();
    if (s2.vid || s2.on || s2.state !== 'off') fail(tag(`opened again after the switch, the page measures: ${JSON.stringify(s2)}`)); else ok(tag('opened again, the page stays off and makes no id'));
    if (sent !== sent0) fail(tag(`opened again after the switch, ${sent - sent0} batches were sent`));
    // from the pause menu (shown as it is in play: its one row is what is looked at), and on again
    await p.evaluate(() => { document.getElementById('g-title').hidden = true; document.getElementById('g-menu').hidden = false; document.getElementById('gm-credits').scrollIntoView({ block: 'center' }); });
    await p.waitForTimeout(300); await snap('4-pause');
    if (touch) await p.tap('#gm-credits'); else await p.click('#gm-credits');
    await p.waitForFunction(() => { const c = document.getElementById('g-credits'); return c && !c.hidden && c.querySelector('.cr-place .cr-row'); }, null, { timeout: 20000 }).catch(() => {});
    c = await cr();
    if (!c.up) fail(tag('the Credits did not open from the pause menu')); else ok(tag('the Credits open from the pause menu'));
    if (c.up && !/^Off\./.test(c.note)) fail(tag(`opened after the switch, the Credits say "${c.note}"`));
    if (c.up) {
      await p.evaluate(() => document.querySelector('#g-credits [data-measure="on"]').click());
      const s3 = await store(); c = await cr();
      if (s3.sw || s3.state !== 'next' || !/next time/.test(c.note)) fail(tag(`switched on again: ${JSON.stringify(s3)} "${c.note}"`)); else ok(tag(`switched on again: "${c.note}"`));
    }
    // closed: Esc on a desktop, Back on a phone; the pause menu is still there under it
    if (touch) await p.tap('#g-credits-back'); else await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    const end = await p.evaluate(() => ({ up: !document.getElementById('g-credits').hidden, menu: !document.getElementById('g-menu').hidden, hand: document.activeElement && document.activeElement.id }));
    if (end.up || !end.menu) fail(tag(`closing the Credits: ${JSON.stringify(end)}`)); else ok(tag(`${touch ? 'Back' : 'Esc'} closes the Credits onto the pause menu${end.hand === 'gm-credits' ? ', the hand back on its row' : ''}`));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `${fails} failed` : 'the Credits pass');
  process.exit(fails ? 1 : 0);
})();
