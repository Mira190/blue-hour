// The set-up's fixed work, baked (issue 194, item 2): what the game's set-up computes from the map's data alone, and the first
// frame waits for (the decks' plan and their columns, the roads' and the footways' lines the traffic and the crowd walk, the
// benches, which road lines have one lane and how wide a vehicle each lesser street takes), computed once here and read by the
// page instead: 1.6 s of the 5.4 s the set-up keeps the main thread busy on the owner's M3, more on a phone.
// The bake runs the page's own set-up in a browser and keeps what it computed (?bake=1 puts it on window.__bake), so the baked
// result is the computed one by construction; --compare loads the page twice, from the bake and computing, and checks every
// field alike. Each file carries a hash of the packs it was computed from and the set-up's BAKE_V (game.js: bumped when what the
// set-up means by these changes); --check fails on one stale against them, as on a stale pack (tools/check.sh), and pipeline/pack.py
// bakes again after it packs. The code that computes them (decks, nav, collision, route, actors) is not hashed, five sessions edit
// it at once: a change to it that changes the result is caught by --compare (the page computing against the bake), which tools/check.sh
// runs where a page change is played. setup.bin is the values as JSON, gzipped (the page reads it through DecompressionStream).
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   xvfb-run -a node tools/bake_setup.js            (writes web/data/<map>/setup.bin, and d/setup.bin from a phone's district)
//   node tools/bake_setup.js --check                (exit 1 if a bake is missing or stale)
//   node tools/bake_setup.js --if-stale             (bakes only if --check would fail: pipeline/pack.py's last step; serves web/ itself)
//   xvfb-run -a node tools/bake_setup.js --compare  (exit 1 if the page from the bake differs from the page computing)
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const MAP = process.env.MAP || 'shibuya';
// what the baked values are computed from: the packs the set-up reads them from, and the set-up's BAKE_V
const PACKS = ['game.bin', 'buildings.bin', 'landmarks.bin'];
// the two places a bake is read from: the whole map (a desktop) and a phone's district (d/, pipeline/district.py)
const KINDS = [{ name: 'map', dir: `web/data/${MAP}`, size: '1440x900', phone: false }, { name: 'district', dir: `web/data/${MAP}/d`, size: '390x844', phone: true }];
const BAKE_V = +(/const BAKE_V = (\d+)/.exec(fs.readFileSync(path.join(ROOT, 'web/game/game.js'), 'utf8')) || [0, 0])[1];

function inputsHash(dir) {
  const h = crypto.createHash('sha256');
  h.update(`v${BAKE_V}`);
  for (const f of PACKS) { const p = path.join(ROOT, dir, f); h.update(f); if (fs.existsSync(p)) h.update(fs.readFileSync(p)); }
  return h.digest('hex').slice(0, 16);
}
const read = f => JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'));

function check() {
  let bad = 0;
  for (const k of KINDS) {
    if (!fs.existsSync(path.join(ROOT, k.dir, 'game.bin'))) continue; // (a map without a district)
    const f = path.join(ROOT, k.dir, 'setup.bin');
    if (!fs.existsSync(f)) { console.log(`FAIL bake    ${path.relative(ROOT, f)} missing: xvfb-run -a node tools/bake_setup.js`); bad++; continue; }
    const want = inputsHash(k.dir), b = read(f);
    if (b.hash !== want || b.bake !== BAKE_V) { console.log(`FAIL bake    ${path.relative(ROOT, f)} is stale against the packs or BAKE_V (${b.hash} v${b.bake}, now ${want} v${BAKE_V}): xvfb-run -a node tools/bake_setup.js`); bad++; }
  }
  if (!bad) console.log(`ok   bake     the set-up's fixed work baked from the packs as they are (BAKE_V ${BAKE_V})`);
  return bad ? 1 : 0;
}

async function load(b, k) {
  const [w, h] = k.size.split('x').map(Number);
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: k.phone, isMobile: k.phone });
  await ctx.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, k.phone ? 'low' : 'high');
  const p = await ctx.newPage();
  // (and the load's order, issue 194: the guide's routes are built after the first frame, not beside the loader's warm-up; their
  // log line's time against the first frame's mark)
  await p.addInitScript(() => { const ci = console.info; console.info = function (...a) { if (typeof a[0] === 'string' && a[0].startsWith('routes:')) window.__routesAt = performance.now(); return ci.apply(this, a); }; });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?bake=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__bake && window.__bake.done, null, { timeout: 1500000, polling: 500 });
  if (k.order) await p.waitForFunction(() => window.__routesAt, null, { timeout: 300000, polling: 500 }).catch(() => {});
  const out = await p.evaluate(() => { const f = performance.getEntriesByName('oe:frame', 'mark').pop(); return { v: window.__bake.v, ms: window.__bake.ms, packs: window.__bake.packs, frameAt: f ? f.startTime : null, routesAt: window.__routesAt || null }; });
  await ctx.close();
  return out;
}

// every field alike, numbers to a millimetre (the values are metres, and a JSON round trip)
function diff(a, b, at = '', out = []) {
  if (out.length > 20) return out;
  if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(a - b) > 1e-3) out.push(`${at}: ${a} against ${b}`); return out; }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) { out.push(`${at}: ${Array.isArray(a) ? a.length : typeof a} items against ${Array.isArray(b) ? b.length : typeof b}`); return out; }
    a.forEach((x, i) => diff(x, b[i], `${at}[${i}]`, out)); return out;
  }
  if (a && b && typeof a === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${at}.${k}`, out); return out; }
  if (a !== b) out.push(`${at}: ${a} against ${b}`);
  return out;
}

// a server for the page: the one on PORT (8800) if it answers, else one of its own on a free port (pipeline/pack.py's call)
async function serve() {
  const http = require('http'), { spawn } = require('child_process');
  const answers = port => new Promise(r => { const q = http.get(`http://localhost:${port}/`, res => { res.resume(); r(res.statusCode === 200); }); q.on('error', () => r(false)); q.setTimeout(2000, () => { q.destroy(); r(false); }); });
  const port = +(process.env.PORT || 8800);
  if (await answers(port)) return { port, stop: () => {} };
  const own = 8890 + Math.floor(Math.random() * 100), sv = spawn('python3', ['-m', 'http.server', String(own), '--directory', path.join(ROOT, 'web')], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await answers(own)); i++) await new Promise(r => setTimeout(r, 200));
  return { port: own, stop: () => sv.kill() };
}

(async () => {
  if (process.argv.includes('--check')) process.exit(check());
  // --if-stale: bake only what --check finds missing or stale (pipeline/pack.py, after it packs)
  if (process.argv.includes('--if-stale') && check() === 0) process.exit(0);
  const server = await serve(); process.env.PORT = String(server.port);
  const { chromium } = require('playwright');
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let bad = 0;
  const only = process.env.KIND;
  for (const k of KINDS) {
    if (only && k.name !== only) continue;
    if (!fs.existsSync(path.join(ROOT, k.dir, 'game.bin'))) continue;
    k.order = process.argv.includes('--compare');
    const got = await load(b, k), file = path.join(ROOT, k.dir, 'setup.bin');
    // (the page read the packs this bake is for: a phone its district's, d/, a desktop the map's)
    if (`web/${got.packs}`.replace(/\/$/, '') !== k.dir) { console.log(`FAIL bake    ${k.name}: the page read ${got.packs}, not ${k.dir}`); bad++; continue; }
    if (process.argv.includes('--compare')) {
      // (the routes after the first frame: on a phone's tier their build was 1 to 2 s of the main thread before it, routeline.js)
      if (got.routesAt == null || got.frameAt == null || got.routesAt < got.frameAt) { console.log(`FAIL order    ${k.name}: the guide's routes ${got.routesAt == null ? 'never built' : `built at ${Math.round(got.routesAt)} ms, before the first frame at ${Math.round(got.frameAt)}`} (routeline.js builds them after it)`); bad++; }
      else console.log(`ok   order    ${k.name}: the guide's routes built after the first frame (${((got.routesAt - got.frameAt) / 1000).toFixed(1)} s after it)`);
      if (!fs.existsSync(file)) { console.log(`FAIL bake    ${k.name}: no ${path.relative(ROOT, file)}: rebake with \`node tools/bake_setup.js\``); bad++; continue; }
      const d = diff(read(file).v, got.v);
      console.log(d.length ? `FAIL bake    ${k.name}: the set-up's output changed: rebake with \`node tools/bake_setup.js\`\n  ${d.join('\n  ')}` : `ok   bake     ${k.name}: the bake is what the page computes (it computed it in ${Math.round(got.ms)} ms)`);
      if (d.length) bad++;
      continue;
    }
    fs.writeFileSync(file, zlib.gzipSync(JSON.stringify({ bake: BAKE_V, hash: inputsHash(k.dir), v: got.v }), { level: 9 }));
    console.log(`baked ${path.relative(ROOT, file)}: ${(fs.statSync(file).size / 1024).toFixed(0)} KB, from the packs at ${got.packs}; the page computed it in ${Math.round(got.ms)} ms`);
  }
  await b.close(); server.stop();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
