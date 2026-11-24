// The set-up's fixed work, baked (issue 194, item 2): what the game's set-up computes from the map's data alone, and the first
// frame waits for (the decks' plan and their columns, the roads' and the footways' lines the traffic and the crowd walk, the
// benches, which road lines have one lane and how wide a vehicle each lesser street takes), computed once here and read by the
// page instead: 1.6 s of the 5.4 s the set-up keeps the main thread busy on the owner's M3, more on a phone.
// The bake runs the page's own set-up in a browser and keeps what it computed (?bake=1 puts it on window.__bake), so the baked
// result is the computed one by construction; --compare loads the page twice, from the bake and computing, and checks every
// field alike. Each file carries a hash of what it was computed from (the packs it read and the code that computed it): the page
// takes a bake only when the hash is its own, and computes as before otherwise; --check fails on a stale one (tools/check.sh).
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   xvfb-run -a node tools/bake_setup.js            (writes web/data/<map>/setup.json, and d/setup.json from a phone's district)
//   node tools/bake_setup.js --check                (exit 1 if a bake is missing or stale)
//   xvfb-run -a node tools/bake_setup.js --compare  (exit 1 if the page from the bake differs from the page computing)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..'), WEB = path.join(ROOT, 'web');
const MAP = process.env.MAP || 'shibuya';
// what the baked values are computed from: the packs, and the code of every function the set-up's part runs
const CODE = ['web/game/decks.js', 'web/game/nav.js', 'web/game/collision.js', 'web/game/route.js', 'web/game/actors.js', 'web/game/junctions.js', 'web/streets.js', 'web/game/bounds.js'];
const PACKS = ['game.bin', 'buildings.bin', 'landmarks.bin', 'terrain.bin', 'scene.bin'];
// the two places a bake is read from: the whole map (a desktop) and a phone's district (d/, pipeline/district.py)
const KINDS = [{ name: 'map', dir: `web/data/${MAP}`, size: '1440x900', phone: false }, { name: 'district', dir: `web/data/${MAP}/d`, size: '390x844', phone: true }];

function inputsHash(dir) {
  const h = crypto.createHash('sha256');
  for (const f of PACKS) { const p = path.join(ROOT, dir, f); h.update(f); if (fs.existsSync(p)) h.update(fs.readFileSync(p)); }
  for (const f of CODE) { const p = path.join(ROOT, f); h.update(f); if (fs.existsSync(p)) h.update(fs.readFileSync(p)); }
  // (and the set-up's own lines in game.js that compute and use the bake: between its two markers)
  const g = fs.readFileSync(path.join(ROOT, 'web/game/game.js'), 'utf8'), a = g.indexOf('/* bake: from here */'), z = g.indexOf('/* bake: to here */');
  h.update(a >= 0 && z > a ? g.slice(a, z) : g);
  return h.digest('hex').slice(0, 16);
}

function check() {
  let bad = 0;
  for (const k of KINDS) {
    const f = path.join(ROOT, k.dir, 'setup.json');
    if (!fs.existsSync(f)) { console.log(`FAIL bake    ${path.relative(ROOT, f)} missing: xvfb-run -a node tools/bake_setup.js`); bad++; continue; }
    const want = inputsHash(k.dir), got = JSON.parse(fs.readFileSync(f, 'utf8')).hash;
    if (got !== want) { console.log(`FAIL bake    ${path.relative(ROOT, f)} is stale (${got} against ${want}): xvfb-run -a node tools/bake_setup.js`); bad++; }
  }
  if (!bad) console.log('ok   bake     the set-up\'s fixed work baked from the packs and code as they are');
  return bad ? 1 : 0;
}

async function load(b, k, q) {
  const [w, h] = k.size.split('x').map(Number);
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: k.phone, isMobile: k.phone });
  await ctx.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, k.phone ? 'low' : 'high');
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?${q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__bake && window.__bake.done, null, { timeout: 1500000, polling: 500 });
  const out = await p.evaluate(() => JSON.parse(JSON.stringify(window.__bake)));
  await ctx.close();
  return out;
}

// every field alike, numbers to a millimetre (the values are metres and a JSON round trip)
function diff(a, b, at = '', out = []) {
  if (out.length > 20) return out;
  if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(a - b) > 1e-3) out.push(`${at}: ${a} against ${b}`); return out; }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) { out.push(`${at}: ${Array.isArray(a) ? a.length : typeof a} items against ${Array.isArray(b) ? b.length : typeof b}`); return out; }
    a.forEach((x, i) => diff(x, b[i], `${at}[${i}]`, out)); return out;
  }
  if (a && b && typeof a === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (k !== 'done' && k !== 'from' && k !== 'ms') diff(a[k], b[k], `${at}.${k}`, out); return out; }
  if (a !== b) out.push(`${at}: ${a} against ${b}`);
  return out;
}

(async () => {
  if (process.argv.includes('--check')) process.exit(check());
  const { chromium } = require('playwright');
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let bad = 0;
  for (const k of KINDS) {
    if (process.argv.includes('--compare')) {
      const baked = await load(b, k, 'bake=check'), computed = await load(b, k, 'bake=1');
      if (baked.from !== 'bake') { console.log(`FAIL bake    ${k.name}: the page did not take the bake (${baked.from})`); bad++; continue; }
      const d = diff(baked.v, computed.v);
      console.log(d.length ? `FAIL bake    ${k.name}: the page from the bake differs from the page computing:\n  ${d.join('\n  ')}` : `ok   bake     ${k.name}: the page from the bake and the page computing alike (computing ${Math.round(computed.ms)} ms, from the bake ${Math.round(baked.ms)} ms)`);
      if (d.length) bad++;
      continue;
    }
    const got = await load(b, k, 'bake=1'), file = path.join(ROOT, k.dir, 'setup.json');
    fs.writeFileSync(file, JSON.stringify({ hash: inputsHash(k.dir), v: got.v }));
    console.log(`baked ${path.relative(ROOT, file)}: ${(fs.statSync(file).size / 1024).toFixed(0)} KB, the set-up's part took ${Math.round(got.ms)} ms in the page`);
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
