// The warm queue's order, measured (issue 194): every picture sent ahead of its first draw waits in one queue (world.js
// upload), a picture a frame. This loads the page to its title, waits, and reads how long each class of job waited: 0 the hero
// level, 1 what a caller waits on to show it (a person's body, a train), 2 the background sent ahead of its first draw
// (uploadRest). It also counts the crowd the title shows as it goes. Q='?wq=fifo' measures the old order, the order they came in.
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   xvfb-run -a node tools/warm_queue.js [WxH]     (TIER=high|low; SECS: how long after the title, 150)
const { chromium } = require('playwright');
const [,, size = '1440x900'] = process.argv;
const [w, h] = size.split('x').map(Number), phone = w < 600;
const SECS = +(process.env.SECS || 150), Q = process.env.Q || '';

(async () => {
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  await ctx.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 200)}`));
  p.on('console', m => { const t = m.text(); if (/^late:/.test(t)) console.log(`  ${t}`); });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${Q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden && getComputedStyle(t).opacity > 0.9; }, null, { timeout: 900000, polling: 500 });
  const t0 = Date.now();
  // BODY=1: the case the order is for. The background is queued now (uploadRest, as the game does once its late models are in),
  // then a stand-in body is asked for: a skinned person's four pictures on a mesh by the camera, as warmFor asks (class 1).
  // Its time to be sent is the time a person the player walks to waits to be shown.
  if (process.env.BODY) {
    // (once what the title queued is sent: a desktop's late models, a picture a frame, minutes on a software renderer)
    await p.waitForFunction(() => window.OEWorld.uploadStats().waiting === 0, null, { timeout: 1500000, polling: 2000 }).catch(() => console.log('(the queue never emptied)'));
    const r = await p.evaluate(async () => {
      const T = window.THREE, g = window.__game, W = window.OEWorld;
      const rest = W.uploadRest(g.renderer, g.world), queued = W.uploadStats().waiting;
      const tex = () => { const n = 256, d = new Uint8Array(n * n * 4).fill(128); const t = new T.DataTexture(d, n, n); t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter; t.needsUpdate = true; return t; };
      const m = new T.Mesh(new T.BoxGeometry(0.5, 1.7, 0.3), new T.MeshStandardMaterial({ map: tex(), normalMap: tex(), roughnessMap: tex(), emissiveMap: tex() }));
      g.world.add(m); m.visible = false;
      m.position.set(0, 0, 0); m.updateMatrixWorld(true);
      const t = performance.now(); await W.upload(g.renderer, m);
      return { queued, ms: Math.round(performance.now() - t), rest: !!rest };
    });
    console.log(`BODY: background queued ${r.queued}; a body asked for behind it was sent in ${r.ms} ms`);
  }
  const read = () => p.evaluate(() => {
    const s = window.OEWorld.uploadStats ? window.OEWorld.uploadStats() : null, v = window.__game.visitors;
    return { s, shown: v && v.shown ? v.shown() : null };
  });
  for (let k = 30; k <= SECS; k += 30) {
    await p.waitForTimeout(Math.max(0, t0 + k * 1000 - Date.now()));
    const r = await read(), s = r.s;
    if (!s) { console.log('no uploadStats in this page'); break; }
    const c = n => `${s[n].n} sent, waited p50 ${s[n].p50} p90 ${s[n].p90} max ${s[n].max} ms`;
    console.log(`${k} s after the title${s.fifo ? ' (fifo)' : ''}: ${s.waiting} waiting; hero ${c(0)}; bodies and models ${c(1)}; background ${c(2)}; the crowd shown ${JSON.stringify(r.shown)}`);
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
