// Open Earth 3D game: walk a real city, talk to people, take the ferry, fly the
// helicopter. The world is the same open-data model as the viewer (world.js), lit by
// the same sun (sun.js) in the city's own time zone. The NPCs talk like locals: the numbers
// they give (sun on public places, a landmark's height, tonight's sunset) are computed
// while you play, and where the data comes from stays in the viewer's tour and Sources
// panel, not in their mouths (tools/voice_check.py, issue #87).
'use strict';
window.OpenEarthGame = async function game(cityId) {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const S = window.Sun, RAD = Math.PI / 180, A = window.OEAudio, H = window.OEHud;
  const W = (x, y, z) => new THREE.Vector3(x, z, -y);
  const pad = n => String(n).padStart(2, '0');
  const fmtMin = m => { const t = Math.floor(m); return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`; };
  const fmtSec = s => (s === Infinity ? '–' : `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const GULL = '<svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M0.7 4.2Q2.8 0.6 5 3.7Q7.2 0.6 9.3 4.2" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>'; // a gull in flight, for labels
  const idle = () => new Promise(r => setTimeout(r, 0));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = matchMedia('(pointer: coarse)').matches;
  // One tab (issue 166; docs/SOUND.md "One tab"). A phone has the memory, the GPU and the cores for one world: two tabs of
  // the game on the owner's iPhone lost both their WebGL contexts in one second, with the sound breaking as they went.
  // The world is held under a lock of the site's (the Web Locks API). A tab that finds it held asks the other to give way
  // (a BroadcastChannel): that tab becomes tab.html, a page of a few kilobytes, and this one goes on. If the other does
  // not answer within two seconds (iOS has frozen it), this tab becomes tab.html?wait=1 instead and starts by itself once
  // the other is closed. On a touch screen only; ?tabs=many leaves it out. Tabs on two sites cannot see each other.
  if (touch && navigator.locks && window.BroadcastChannel && !/[?&]tabs=many\b/.test(location.search)) {
    const here = '#' + encodeURIComponent(location.search), bc = new BroadcastChannel('blue-hour-world'), hold = () => new Promise(() => {});
    bc.onmessage = e => { if (e.data === 'give way') location.replace('tab.html' + here); };
    navigator.locks.request('blue-hour-world', { ifAvailable: true }, lock => {
      if (lock) return hold();
      bc.postMessage('give way');
      const stop = new AbortController(), t = setTimeout(() => stop.abort(), 2000);
      navigator.locks.request('blue-hour-world', { signal: stop.signal }, () => { clearTimeout(t); return hold(); }).catch(() => location.replace('tab.html?wait=1' + here));
      return undefined;
    }).catch(() => {});
  }
  const ac = new AbortController(), on = (el, ev, fn, o = {}) => el.addEventListener(ev, fn, Object.assign({ signal: ac.signal }, o));
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  // the old free game's keys, which open nothing on the story's map (in the story, or on the walk): the survey lens, the
  // height guess, the route's walk and its line, the map, the passport, the phone, a taxi, the subway map, the diary
  const STORY_OFF = new Set(['KeyQ', 'KeyG', 'KeyT', 'KeyL', 'KeyM', 'KeyP', 'KeyN', 'KeyY', 'KeyB', 'KeyJ']);

  // ------------------------------------------------------------ load
  // The score while the roll loads (music.js loop; docs/SOUND.md "Before the first frame"): the story's own, as much of
  // it as it knows before a frame is taken, from the loading screen through the title and the prologue until the first
  // frame's score takes it over. A browser gives a page no sound before it is touched: where it does, the cue starts
  // with the page; where it does not, the loading screen says so and the first key or touch starts it.
  let cue = null;
  if (window.OEMusic && OEMusic.loop && A && !new URLSearchParams(location.search).has('walk')) {
    // (the loading screen asks for a touch while the context waits for one: suspended, or on iOS not made until then)
    const ld = $('#g-loader'), heard = () => ld.classList.toggle('no-sound', A.tunes ? !!A.needsTouch : !A.muted && (!!A.pending || (!!A.ctx && A.ctx.state !== 'running')));
    const begin = () => {
      A.start();
      // (a phone's: the system's own player, the context not made until the opening is over, audio.js "music outside the
      // context". Its file is the loop six times over at the level the bus would give it: tools/load_cue.js)
      if (A.tunes) { if (cue === null) { cue = A.tune('assets/story/late/cue-phone.mp3', { loop: true }); for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) on(window, ev, () => setTimeout(heard, 0), { capture: true }); } heard(); return; }
      if (cue !== null || !A.ctx) { heard(); return; } // (false: played and let go)
      cue = OEMusic.loop(A.ctx, A.musicBus(), 'assets/story/late/cue.mp3', 320 / 9); // (eight bars at 54: tools/load_cue.js)
      on(A.ctx, 'statechange', heard); heard();
    };
    if (A.quiet) A.quiet(true);
    begin();
    if (A.made) A.made(() => { if (cue === null) begin(); }); // (iOS: the context is made in the first touch, audio.js)
    if (A.pending && !A.tunes) fetch('assets/story/late/cue.mp3').catch(() => {}); // (its file fetched meanwhile, so the touch has only to decode it)
    for (const ev of ['pointerdown', 'keydown']) on(window, ev, () => { if (cue) begin(); }, { capture: true });
  }
  const cueOut = () => { if (cue) { cue.stop(5); cue = false; } }; // (false: it has played, and is not begun again)
  const loadMsg = OEWorld.loadLine('g-'); // (index.html #g-load-msg, #g-load-bar and #g-load-stage)
  // a step of the load, by name, for the telemetry's note of where a page that died was (telemetry.js prev_stage)
  const loadStep = name => { try { performance.mark('oe:step', { detail: { view: 'game', city: cityId, step: name } }); } catch (e) { /* no User Timing */ } };
  let D;
  try {
    D = await OEWorld.load(cityId, { game: true, onMsg: loadMsg });
  } catch (e) {
    loadMsg(`Could not load the game data (${e.message}). Reload the page to try again.`, 0);
    $('#g-loader').classList.add('err');
    return null;
  }
  // the game walks on a 5 m terrain that drops at the seawall (game.json), not the viewer's 10 m grid
  // (the ground mesh uses every second point, 10 m, except on the tiles near the player)
  let Tfine = D.T;
  if (D.G.terrain) {
    const bytesOf = b => (typeof b === 'string' ? Uint8Array.from(atob(b), c => c.charCodeAt(0)) : b); // (bytes from game.bin, base64 from game.json)
    const t = D.G.terrain, raw = bytesOf(t.data), v = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength >> 1);
    Tfine = { data: Float32Array.from(v, q => q * t.scale), nx: t.nx, ny: t.ny, cell: t.cell, x0: D.scene.frame.x[0], y1: D.scene.frame.y[1] };
    // land below the level of the sea (behind Osaka's river walls, in an underpass) would be drawn
    // under the water, which lies level everywhere: keep it just above
    const wm = D.G.water;
    if (wm && wm.nx === t.nx && wm.ny === t.ny) {
      const bits = bytesOf(wm.bits), d = Tfine.data;
      for (let i = 0; i < d.length; i++) if (d[i] < 0.15 && !((bits[i >> 3] >> (7 - (i & 7))) & 1)) d[i] = 0.15;
    }
    const nx = Math.ceil(t.nx / 2), ny = Math.ceil(t.ny / 2), c = new Float32Array(nx * ny);
    for (let r = 0; r < ny; r++) for (let k = 0; k < nx; k++) c[r * nx + k] = Tfine.data[(2 * r) * t.nx + 2 * k];
    D.T = { data: c, nx, ny, cell: t.cell * 2, x0: Tfine.x0, y1: Tfine.y1 };
    D.Tfine = Tfine; // the walls of the buildings reach down to whichever ground is drawn
    if (new URLSearchParams(location.search).get('settle') !== 'off') OEWorld.settleUnderFloors(D.T, Tfine, D.LM); // (the far ground under the landmarks' floors at every distance, #286; ?settle=off: without, to compare)
    if (new URLSearchParams(location.search).get('settle') !== 'off') OEWorld.carveUnderWater([Tfine, D.T], D.LM); // (and under the landmarks' ponds and moats, #399)
    // (and the ground drawn, not walked, deeper under the moats' narrow water: copies for the tiles, #399)
    if (new URLSearchParams(location.search).get('settle') !== 'off' && OEWorld.deepenUnderWater) { const dr = OEWorld.deepenUnderWater([Tfine, D.T], D.LM); if (dr) { D.drawTfine = dr[0]; D.drawT = dr[1]; } }
  }
  const { scene, B, P, G, CITY } = D;
  document.title = 'Blue Hour';
  // "Paris on Foot": the place set large, "on foot" under it
  const tm = /^(.+?)\s+(on foot)$/i.exec(G.title), gtTitle = $('#gt-title');
  gtTitle.textContent = tm ? tm[1] : G.title;
  if (tm) { const sm = document.createElement('small'); sm.textContent = tm[2]; gtTitle.append(sm); }
  if (G.blurb) $('#gt-blurb').textContent = G.blurb;
  $('#gt-city').textContent = `${CITY.place || CITY.name}, ${CITY.country}`;
  if (G.blurb) $('#g-title p').textContent = G.blurb;
  // neighbouring areas you can go on to, such as the bayside from the city (game.links)
  // and the other maps of the same group (Tokyo's districts: cities/index.json groups), as on the subway map
  const me = (window.OE_CITIES || []).find(c => c.id === cityId), kin = me && me.group
    ? window.OE_CITIES.filter(c => c.group === me.group && c.id !== me.id && c.built && c.game).map(c => ({ id: c.id, name: `${c.name}${c.native ? ` ${c.native}` : ''}`, how: c.tagline })) : [];
  // a city drawn as a subway map (Tokyo): its districts are chosen on the map, full screen (metro.js),
  // from the Districts button, B, or the menu; the game holds still under it
  const metro = window.OEMetro ? OEMetro.group(window.OE_CITIES || [], cityId) : null;
  $('#gm-links').innerHTML = (metro ? `<button class="btn primary" id="gm-metro">Change district · ${metro.name} map <kbd>B</kbd></button>` : '')
    + [...(G.links || []), ...kin.filter(k => !(G.links || []).some(l => l.id === k.id))]
      .map(l => `<a class="btn" href="#play-${l.id}">${l.name}</a><span class="note">${l.how || ''}</span>`).join('');
  $('#g-metro-btn').hidden = !metro;
  $('#gm-links').insertAdjacentHTML('afterbegin', G.fishing && G.fishing.spots && G.fishing.spots.length ? '<button class="btn" id="gm-fishlog">Fish log</button><span class="note">What you have caught, and what each fish is</span>' : '');
  if (metro) { $('#g-metro-btn').innerHTML = `${metro.name} <kbd>B</kbd>`; document.querySelectorAll('.g-metro-key').forEach(r => { r.hidden = false; }); }
  function openMetro() {
    if (!metro || OEMetro.isOpen()) return;
    $('#g-menu').hidden = true; $('#g-bigmap').hidden = true; $('#g-pass').hidden = true;
    if (!phone.el.hidden) phoneShow(false);
    keys.clear();
    // which of this map's stations you are at (a map can hold several districts: Sangenjaya is on Shibuya's): the
    // nearest one within a kilometre, else the map's own
    const F = scene.frame, ds = metro.meta.districts;
    let hereAt = -1, bd = 1000;
    ds.forEach((s, i) => {
      if (s.map !== cityId || !playing) return;
      const e = Math.hypot((s.lon - F.lon0) * 111320 * Math.cos(F.lat0 * Math.PI / 180) - player.x, (s.lat - F.lat0) * 110950 - player.y);
      if (e < bd) { bd = e; hereAt = i; }
    });
    OEMetro.full({ g: metro, cities: window.OE_CITIES, here: cityId, hereAt, backLabel: 'Back to the game', backWord: 'Back to the game',
      // another district of the map you are on: a hop across it, not the whole map loaded again
      onGo: (c, play, arrive) => {
        OEMetro.close();
        const t = c.id === cityId && play && playing && (arrive ? (G.travel || []).find(x => x.id === arrive) : { id: 'start', name: CITY.name, at: G.start.at, look: G.start.facing });
        if (t && travelTo({ kind: 'place', id: t.id, name: t.name, at: t.at, look: t.look, pitch: t.pitch, best: t.best })) { history.replaceState(null, '', `#play-${cityId}${arrive ? `@${arrive}` : ''}`); return; }
        if (t) return; // (not now: in the helicopter, on the ferry; the game has said so)
        location.hash = play ? `play-${c.id}${arrive ? `@${arrive}` : ''}` : c.id;
      } });
  }
  const stage = $('#game-stage'), canvas = $('#game-gl');
  // the device's tier (quality.js): pixels, MSAA, shadows and how much detail the world carries;
  // reversed depth (where the GPU has EXT_clip_control) with the post stack's float depth buffer (atmosphere.js)
  const QC = window.OEQuality.city();
  // (the canvas itself is multisampled only where the scene is drawn straight to it: with the post stack the one
  // thing drawn to the canvas is the lens's triangle, which has no edge to smooth)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: QC.antialias && !(QC.post && window.OELens && window.OEAtmos && (G.sky || {}).post !== false), powerPreference: 'high-performance', reversedDepthBuffer: true });
  // (a load traced from the context's first call, where the last one here raised an error no later frame did, or
  // where the address asks: glCheck, below)
  // (a program this GPU will not link: its material is compiled again with less, until it is drawn; glcare.js fit)
  let fitRoot = null;
  if (window.OEGLCare && OEGLCare.fitWatch) OEGLCare.fitWatch(renderer, { roots: () => [fitRoot], key: `game|${cityId}` });
  let glLoad = null;
  try {
    const asked = /[?&]gltrace=1\b/.test(location.search), due = asked || localStorage.getItem('bh-gl-trace') === '1';
    if (due && !asked) localStorage.removeItem('bh-gl-trace');
    if (due && window.OEGLCare && OEGLCare.trace) glLoad = OEGLCare.trace(renderer.getContext());
  } catch (e) { /* storage blocked */ }
  const BASE_FOV = 55, camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.3, 40000);
  // The frame-time governor (quality.js): how much of the canvas's resolution the scene is drawn at, and how much
  // of what a frame can do without (governor.extras), both ways as the frame time allows. Its ceiling is the
  // tier's budget of scene pixels on this canvas. The frame-rate cap is the player's (the menu), 60 unless asked, and on
  // a phone 30: an iPhone drew the story at 17 to 43 frames a second with its GPU never idle, and after a few minutes it
  // was hot in the hand (the owner, November 2026). Thirty even frames, with the time a frame does not need left idle,
  // is what a phone game holds for as long as it is played; the menu's Frame rate gives 60 back.
  const PHONE_FPS = QC.lean && touch ? 30 : 60;
  // (a dense display, two device pixels or more to the CSS pixel: the canvas is drawn at that, and the scene inside it may
  // come down to a little under one pixel to the CSS pixel, sharpened up by the lens, before anything else is given up.
  // At the ordinary floor of 0.6 an M3 MacBook drew the story's street at 1.2 pixels to the CSS pixel and thirty frames
  // a second, its GPU's frame growing with the pixels drawn (telemetry, November 2026); at 0.45 it draws half as many)
  const DENSE = Math.min(window.devicePixelRatio || 1, 2) >= 1.75 && !QC.lean;
  const gov = OEQuality.governor({ min: DENSE ? 0.45 : 0.6, mid: DENSE ? 0.7 : 0.8, cap: (() => { try { const v = localStorage.getItem('bh-fps'); return v === null ? PHONE_FPS : Math.max(0, +v || 0); } catch (e) { return PHONE_FPS; } })() });
  const GOV_KEY = `bh-gov-${cityId}`;
  // What this device held on this map before ("scale/extras"; a bare scale from before issue 375 kept its extras): it
  // starts there. A device with no record starts low and climbs (quality.js startLow, issue 375), not at its ceiling.
  let govRecord = null;
  if (gov.auto) try { const v = localStorage.getItem(GOV_KEY); if (v) { const [sc, ex] = v.split('/').map(Number); if (sc >= gov.min && sc <= 1) govRecord = { scale: Math.round(sc * 20) / 20, extras: [0, 0.5, 1].includes(ex) ? ex : 1 }; } } catch (e) { /* storage blocked */ }
  // (a check starts as a device with that record would, ?gov=0.8/0: the governor itself stands still under a harness,
  // so the state an ordinary device opens the map in was one no check played: issue 485)
  const govAsked = /[?&]gov=([\d.]+)\/([\d.]+)/.exec(location.search);
  if (govAsked) govRecord = { scale: Math.max(gov.min, Math.min(1, Math.round(+govAsked[1] * 20) / 20)), extras: [0, 0.5, 1].includes(+govAsked[2]) ? +govAsked[2] : 1 };
  if (govRecord) gov.resume(govRecord.scale, govRecord.extras); else if (gov.auto) gov.startLow();
  let atmos = null; // clouds, stars, the moon and the post stack (atmosphere.js), once the world is up
  // the multisampling rung's values (the governor's ladder, below) for the view's size as it is now
  let msaaRung = null;
  let stageW = 1, stageH = 1; // (the stage's size in CSS pixels, as resize() last found it: read each frame without asking the layout)
  const msaaFor = () => { const top = QC.samplesAt ? QC.samplesAt(stage.clientWidth, stage.clientHeight) : QC.samples; msaaRung[0] = top; msaaRung[1] = Math.min(2, top); };
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight, pr = QC.pixelRatio(w, h);
    stageW = Math.max(1, w); stageH = Math.max(1, h);
    gov.max = QC.sceneScale ? Math.max(gov.min, QC.sceneScale(w * pr, h * pr)) : 1;
    if (gov.scale > gov.max) gov.scale = gov.max;
    // (the post stack draws the scene at the governor's scale into its own target and the lens brings it up to the
    // canvas, sharpened; without the stack the canvas itself is scaled)
    const stack = !!(atmos && atmos.setScale && atmos.composer);
    renderer.setPixelRatio(stack ? pr : Math.max(0.6, pr * gov.scale));
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    if (stack) atmos.setScale(gov.scale);
    if (msaaRung) { msaaFor(); gov.reapply(); }
    if (atmos) atmos.setSize(w, h);
    if (mirror) { const z = renderer.getDrawingBufferSize(new THREE.Vector2()); mirror.setSize(z.x, z.y); }
  }
  let mirror = null; // a wet street's reflections (mirror.js), once the world is up
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();
  // after dark the far city's traffic is lights (night.js), the cars round the camera real ones (actors.js)
  const Wd = await OEWorld.create(D, renderer, { onMsg: loadMsg, small: QC.small, shadow: QC.shadow, game: true, nearCars: ((G.crowd || {}).radius_m || 450) + 100,
    groundAt: G.start && G.start.at }); // (the aerial tiles round the start before the game opens, the rest after it: issue 335)
  const world = Wd.world, U = Wd.U;
  if (OEWorld.gate) OEWorld.gate(renderer, { scene: world, targets: () => (atmos && atmos.composer ? [atmos.composer.renderTarget1, atmos.composer.renderTarget2] : null) }); // (a mesh not yet drawn whose program is still being linked comes a frame later, not waited for; only in the frame's own targets: world.js gate)
  // The set-up's fixed work, baked (issue 194: tools/bake_setup.js): what the set-up computes from the map's data alone (the decks'
  // plan and columns, the roads' and the footways' lines, which road lines have one lane, how wide a vehicle each lesser street
  // takes), read from setup.bin beside the packs instead of computed, 1.6 s of the M3's set-up. Taken only when it is of this
  // BAKE_V (bumped when what the set-up means by them changes); tools/check.sh fails on a bake stale against the packs, and
  // compares one with the page computing. ?bake=1: computed, and put on window.__bake (the tool's), ?bake=off: computed
  const BAKE_V = 1, bakeQ = new URLSearchParams(location.search).get('bake'), bakeOut = bakeQ === '1' ? (window.__bake = { v: {}, ms: 0, done: false, packs: D.PACKS }) : null;
  const bakeP = bakeQ === '1' || bakeQ === 'off' || typeof DecompressionStream === 'undefined' ? Promise.resolve(null)
    : fetch(D.PACKS + 'setup.bin').then(r => (r.ok ? new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json() : null)).then(b => (b && b.bake === BAKE_V && b.v ? b.v : null), () => null);
  let bakeMs = 0;
  const plainOf = x => JSON.parse(JSON.stringify(x, (k, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v)));
  const bakeIn = (k, fn) => { const t = performance.now(); if (BK && BK[k]) { const v = BK[k]; bakeMs += performance.now() - t; return v; } const v = fn(); bakeMs += performance.now() - t; if (bakeOut) bakeOut.v[k] = plainOf(v); return v; };
  let BK = null;
  fitRoot = world;
  // After dark, a soft fill that goes with you: the city's lights are drawn as an aerial photograph shows
  // them, and between the lamps (a hillside track, a shrine's woods, a deck above the town) the ground was
  // as black as the sky, so a spawn or a hop could land you where nothing at all could be seen. A light
  // a little above head height, drawn towards the camera, lights the ground, the path and the people round
  // you and fades out by about 40 m, so the view near you always reads and the far city keeps its look.
  // It falls off with distance, not its square (decay 1): even over the ground round you rather than a hot
  // spot at your feet, and under the trees' crowns rather than among their leaves. In the scene from the
  // start, dark by day, so that the night does not add a light to every lit shader (a recompile of the
  // city); no shadow. Diffuse light only (lens.js diffusePoints): its highlight on glass and polished stone was a
  // lamp carried over the player's head.
  const nightFill = new THREE.PointLight(OEWorld.lin('#c9d4ea'), 0, 40, 1);
  nightFill.name = 'night fill';
  world.add(nightFill);
  nightFill.userData.cd = 4; // its strength at full night: about 1.3 on the ground under it, a third of the brightest street light's pool
  // the car's headlamp and the helicopter's searchlight (cars.js, vehicles.js) in the world from here too, dark until
  // used: with every light of the game in place this early, the city's shaders compile behind the rest of the set-up
  // (earlyWarm, below) in the variant the game draws (three.js builds the number of lights into each), issue 327
  const earlyLamps = { head: OECars.headlamp(world, G.keep || 'left'), search: OEVehicles.searchlight ? OEVehicles.searchlight(world) : null };
  const show = window.OELights ? OELights.create(world, D, Wd) : null; // the city's nightly light show, if it has one
  if (window.OEVis) OEVis.create({ city: D.id, packs: D.PACKS, terrain: Tfine, tier: QC.name, solids: D.B.s, hidden: D.scene.hidden_solids }); // the occluder raster and its Worker, behind everything else
  atmos = window.OEAtmos ? OEAtmos.create(Wd, renderer, camera, { city: D.scene.city, sky: G.sky || {}, look: G.look || {} }) : null;
  if (atmos) { const z = renderer.getSize(new THREE.Vector2()); atmos.setSize(z.x, z.y); }
  // shaders compiled before their first frame, in the variant the post stack draws with (world.js compile):
  // the scene behind the loader, and what comes once the game is open (the helicopter's model)
  const compileFor = (obj, scene = world, o) => { if (weather && obj && obj.traverse) weather.dress(obj); return compileFor0(obj, scene, o); }; // (what has just loaded takes the weather's patch before its first compile)
  const compileFor0 = (obj, scene = world, o) => OEWorld.compile(renderer, obj, camera, Object.assign({ scene, target: atmos && atmos.composer ? atmos.composer.renderTarget1 : null }, o));
  // a model that comes once the game is open: its textures sent in idle time, a texture a frame, then its
  // shaders compiled, before it is shown (issue 201; world.js upload)
  const uploadFor = (obj, o) => (OEWorld.upload ? OEWorld.upload(renderer, obj, o) : Promise.resolve());
  if (OEWorld.uploadFrom) OEWorld.uploadFrom(() => camera.position); // (the queue's order: what is nearest what you see from first, world.js)
  const warmFor = (obj, o) => uploadFor(obj, o).then(() => compileFor(obj));
  // the first frame drawn (issue 27): what the loader need not wait for is compiled after it, not queued beside the loader's
  // own programs, where a device that compiles one at a time (an iPhone) finished it before the first frame all the same
  let firstFrame = null;
  const firstFramed = new Promise(r => { firstFrame = r; });
  // a model that comes late, its vertex buffers sent in slices before its first draw (world.js uploadBuffers, as the
  // loader sends the city's): while they go, its meshes are on a layer of their own (30), seen by that pass alone and
  // not by the frames between the slices, and then put back as they were (a hero level: hero.js)
  const sendBuffers = root => {
    if (!OEWorld.uploadBuffers) return null;
    const ms = [], was = root.visible;
    root.traverse(o => { if (o.isMesh || o.isPoints || o.isLine) { ms.push([o, o.layers.mask]); o.layers.set(30); } });
    root.visible = true;
    const put = () => { root.visible = was; for (const [o, m] of ms) o.layers.mask = m; };
    return Promise.resolve(OEWorld.uploadBuffers(renderer, world, camera, { late: true, target: atmos && atmos.composer ? atmos.composer.renderTarget1 : null })).then(put, e => { put(); console.warn('buffers', e); });
  };
  // the weather: dry, overcast, drizzle or rain, as the city's climate brings it for the date (weather.js)
  // a far land that reaches past the default far plane (Kamakura's, out to Mount Fuji at 70 km): the camera takes it in
  if ((Wd.world.userData.farHalf || 0) * 1.45 > camera.far) { camera.far = Wd.world.userData.farHalf * 1.45; camera.updateProjectionMatrix(); }
  const weather = window.OEWeather ? OEWeather.create(Wd, renderer, camera, { climate: G.weather || null, QC, sky: G.sky || {}, wind: (scene.water || {}).waves || null, geo: scene.city && Number.isFinite(scene.city.lat) ? { lat: scene.city.lat, lon: scene.city.lon } : null }) : null;
  if (atmos && atmos.composer) {
    Wd.skyHaze = true; // fog mixed before the tone curve: the haze takes the sky's colour (world.js)
    const clear = Wd.world.userData.clarity || 1; // a city's clear air (far.json clarity, world.js)
    Wd.world.fog.near = 1500 * clear; Wd.world.fog.far = 24000 * clear; // and a little of it over the far city, for depth
    if (renderer.capabilities.reversedDepthBuffer) U.uNudge.value = 1.5e-5; // a float depth buffer needs less to order coplanar roofs (buildings.js)
  }
  // a lost WebGL context pauses the game under a note and comes back redrawn (glcare.js)
  // (on a phone the walls' shading lives on the GPU alone, world.js gpuOnly: there a lost context reloads the view)
  // (and a view that cannot be redrawn reloads: where the player was is noted for the next load to take up, noteResume)
  const care = OEGLCare.watch({ renderer, host: stage, onRestored: () => { if (Wd.gpuOnly) throw new Error('held on the GPU only'); Wd.restoreGPU(); resize(); }, onGiveUp: () => noteResume() });
  U.uTime = { value: 0 };
  // Close up, 1 m aerial imagery is a blur, lit twice (the photo's own sun and shadows, then the
  // scene's) and far too pale for paving: a sunlit forecourt read as a white sheet with grey
  // smudges. Near the camera the ground is made into a surface: the photo's baked shadows are
  // flattened towards their surroundings (the scene casts its own), the paving is brought to the
  // albedo concrete and sandstone have (about 0.3) instead of the photo's near-white, and paved
  // ground gets pavers (stretcher bond, joints anti-aliased by their screen size, each paver its
  // own shade), roads a fine aggregate, the rest a fine grain; all of it fades out with distance,
  // so from the air the ground is the photograph.
  // Round each hero level, out to ZONE_M past its circle, the ground is drawn from the street data and not from the
  // aerial photograph, at every height a player reaches (issue 87; the shader below): the level's paving goes on in
  // the same family of tones instead of meeting a blurred photograph at its edge. (x, -y in the world's frame, the
  // zone's outer radius, on.) zoneTile(i): whether ground tile i lies under a zone, so its drawn streets stay on in
  // the helicopter and from any height
  const ZONE_M = 320, ZONE = { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) };
  (G.hero || []).filter(h => h.at && h.r).slice(0, 8).forEach((h, k) => ZONE.value[k].set(h.at[0], -h.at[1], h.r + ZONE_M, 1));
  if (U.uZone) U.uZone.value = ZONE.value; // (the roofs' photo too: buildings.js photoZone)
  // Under a level with a floor of its own (hero[].floor: SKY's street hall, level where the ground under it slopes) the
  // ground is not drawn where that floor is: where the ground rose over the level floor it was drawn over it, a beige
  // patch with a slanting edge across the hall's stone (the owner's screenshot at the lift, November 2026). heroCover
  // marks the floor's half-metre cells in uHeroCut; uHeroCut4 is (x0, y0, its side, on), on only while the level is drawn
  const HERO_CUT = { tex: { value: new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat) }, box: { value: new THREE.Vector4(0, 0, 0, 0) }, h: null, off: false };
  HERO_CUT.tex.value.needsUpdate = true;
  const zoneTile = i => { const t = scene.ground[i]; return ZONE.value.some(z => z.w && Math.hypot(Math.max(t.x0 - z.x, 0, z.x - t.x1), Math.max(t.y0 + z.y, 0, -z.y - t.y1)) < z.z); };
  for (const m of Wd.groundMeshes) m.material.onBeforeCompile = sh => {
    if (Wd.sea) Wd.sea.patchGround(sh); // the wet band and swash along the shore
    sh.uniforms.uStreet = m.material.userData.street = m.material.userData.street || { value: null };
    sh.uniforms.uStreetOn = m.material.userData.streetOn = m.material.userData.streetOn || { value: 0 };
    sh.uniforms.uZone = ZONE;
    sh.uniforms.uHeroCut = HERO_CUT.tex; sh.uniforms.uHeroCut4 = HERO_CUT.box;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWP; uniform sampler2D uStreet; uniform float uStreetOn; uniform vec4 uZone[8]; uniform sampler2D uHeroCut; uniform vec4 uHeroCut4;
#define ZONE_PAVE vec3(0.451, 0.418, 0.356) // (the drawn footways' paving, linear: streetTexture's #b3ada1)
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
// pavers 0.6 x 0.3 m in stretcher bond: x, 1 inside a paver and 0 in a joint; y, the paver's own shade
vec2 pavers(vec2 p) {
  vec2 q = p / vec2(0.6, 0.3);
  float row = floor(q.y);
  q.x += mod(row, 2.0) * 0.5;
  vec2 f = fract(q), w = fwidth(q) * 1.2, j = vec2(0.012 / 0.6, 0.012 / 0.3);
  float inside = smoothstep(j.x, j.x + w.x, f.x) * smoothstep(j.x, j.x + w.x, 1.0 - f.x) * smoothstep(j.y, j.y + w.y, f.y) * smoothstep(j.y, j.y + w.y, 1.0 - f.y);
  // joints finer than a pixel and a half fade to the mean instead of shimmering
  inside = mix(inside, 0.93, smoothstep(0.25, 0.6, max(w.x, w.y)));
  return vec2(inside, h2(floor(q) + vec2(row * 7.0, 3.0)));
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
if (uHeroCut4.w > 0.5) { vec2 hc = (vec2(vWP.x, -vWP.z) - uHeroCut4.xy) / uHeroCut4.z; if (hc.x > 0.0 && hc.y > 0.0 && hc.x < 1.0 && hc.y < 1.0 && texture2D(uHeroCut, hc).r > 0.5) discard; }
float camD = distance(vWP, cameraPosition);
float near = 1.0 - smoothstep(12.0, 70.0, camD);
float street = 1.0 - smoothstep(60.0, 420.0, camD); // street level, out to where the photo takes over
// round a hero level (ZONE): how far the ground is drawn from the street data alone, whatever the height
float zn = 0.0;
for (int i = 0; i < 8; i++) zn = max(zn, uZone[i].w * (1.0 - smoothstep(uZone[i].z - 110.0, uZone[i].z, distance(vWP.xz, uZone[i].xy))));
const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
// the photo's baked shadows and blotches, flattened towards the ground around them
float l0 = dot(texture2D(map, vMapUv).rgb, LUM), l4 = dot(texture2D(map, vMapUv, 4.0).rgb, LUM);
diffuseColor.rgb *= mix(1.0, clamp(sqrt(l4 / max(l0, 0.01)), 0.7, 1.45), 0.75 * (1.0 - smoothstep(25.0, 160.0, camD)));
// At street level a photo pixel (a metre in the alpine cities) is magnified to tens of screen pixels, and its
// hard edges (a roof's shadow, a white kerb line, the leaning roof of an orthophoto) are drawn as smeared
// grey-white and blue streaks over the ground (the luge track under the Skyline deck, issue 265). Where the
// photo is magnified past about four screen pixels to its pixel, its detail is taken towards the mean
// over a few of its pixels with a little of its contrast kept, and the sky's blue in its baked shadows is
// taken out: the drawn grain and pavers below carry the detail at that range instead.
{
  float oeMag = 1.0 / max(length(fwidth(vMapUv * vec2(textureSize(map, 0)))), 1e-4); // screen pixels to a photo pixel
  float soften = smoothstep(3.0, 14.0, oeMag) * (1.0 - smoothstep(40.0, 120.0, camD));
  vec3 mean = photoGrade(textureLod(map, vMapUv, 2.5).rgb);
  float lc = dot(diffuseColor.rgb, LUM), lm = dot(mean, LUM);
  vec3 soft = mean * pow(clamp(lc / max(lm, 1e-3), 0.25, 4.0), 0.3);
  diffuseColor.rgb = mix(diffuseColor.rgb, soft, soften * 0.85);
  vec3 sc0 = diffuseColor.rgb;
  float sky = smoothstep(0.004, 0.03, sc0.b - sc0.g) * smoothstep(0.01, 0.045, sc0.b - sc0.r) * smoothstep(0.22, 0.08, dot(sc0, LUM));
  diffuseColor.rgb = mix(sc0, vec3(dot(sc0, LUM)) * vec3(1.05, 1.0, 0.92), sky * 0.75 * (1.0 - smoothstep(120.0, 420.0, camD)));
}
// the photo's road paint (zebras, stop lines, arrows) where no street is drawn over it, or the drawn
// one has thinned out: a pale, grey pixel much brighter than the grey ground about 6 m round it is
// paint (or a white car's roof), and is brought down to that ground, so roads read as asphalt rather
// than as pale blotches (issue 137). The neighbourhood is the photo's own mip at that size
vec2 oeTx = vec2(textureSize(map, 0));
float oeMpp = length(fwidth(vWP.xz)) / max(length(fwidth(vMapUv * oeTx)), 1e-5); // metres per photo pixel
vec3 nb = textureLod(map, vMapUv, clamp(log2(6.0 / max(oeMpp, 1e-3)), 0.0, 8.0)).rgb;
float lnb = dot(nb, LUM), lpx = dot(diffuseColor.rgb, LUM);
float nbSat = (max(nb.r, max(nb.g, nb.b)) - min(nb.r, min(nb.g, nb.b))) / max(max(nb.r, max(nb.g, nb.b)), 1e-3);
float paint = smoothstep(1.35, 1.9, lpx / max(lnb, 0.01)) * smoothstep(0.35, 0.2, lnb) * smoothstep(0.3, 0.15, nbSat)
  * (1.0 - smoothstep(160.0, 260.0, camD));
diffuseColor.rgb *= mix(1.0, lnb * 0.75 / max(lpx, 1e-3), paint);
// what kind of ground: paved (pale and grey), planted (green), the rest
float mx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)), sat = (mx - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b))) / max(mx, 1e-3);
float green = smoothstep(0.02, 0.08, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
float paved = smoothstep(0.32, 0.18, sat) * smoothstep(0.07, 0.16, dot(diffuseColor.rgb, LUM)) * (1.0 - green) * (1.0 - oeSteep); // (not on a rock face: world.js steepRock)
float roadway = 0.0;
if (uStreetOn > 0.5) { // drawn streets near the camera: no blur, no shadows baked into the photo
  // (the drawing is an sRGB texture: the sampler hands it over linear, so it is not decoded again here. Twice decoded,
  // the drawn asphalt was an albedo of 0.01 and the photograph's road under it was capped near black, issue 148)
  vec4 st = texture2D(uStreet, vMapUv);
  // (Gaps in the drawn carriageway were once filled from the drawing's blurred levels, 8 and 16 m round: where those
  // were mostly asphalt, asphalt was laid. A threshold on a field of 8 m texels has a scalloped edge 8 m to a wave, and
  // on a street with no footway drawn it carried the asphalt past the kerb over the paving and the forecourts: a dark
  // patch with a saw-toothed edge that read as neither a shadow nor a lamp's pool, darkest under the street lamps,
  // where pale paving takes the light and asphalt does not. The hero levels dropped it first, below; now nowhere. A
  // gap in the drawing shows the ground under it, in its own tone.)
  float sl = dot(st.rgb, LUM);
  // The photo's own road paint (zebras, stop lines, arrows, the bright concrete of a junction) under
  // the drawn asphalt is flattened to the asphalt's albedo before the two are mixed, or it shows
  // through the street as pale blotches where the drawn layer thins out with distance (issue 137).
  // The drawn street carries its own markings; the photo keeps its paint only beyond 260 m, where
  // the drawn streets are gone too
  float asph = smoothstep(0.0, 0.5, st.a) * smoothstep(0.2, 0.14, sl) * (1.0 - smoothstep(160.0, 260.0, camD));
  float pl = dot(diffuseColor.rgb, LUM), cap = sl * 1.25 + 0.006;
  if (pl > cap) diffuseColor.rgb *= mix(1.0, (cap + (pl - cap) * 0.12) / pl, asph);
  float k = st.a * (1.0 - smoothstep(35.0, 140.0, camD)) * 0.92;
  diffuseColor.rgb = mix(diffuseColor.rgb, st.rgb, k);
  roadway = k * smoothstep(0.2, 0.14, sl);           // asphalt (dark), not the footways and kerbs drawn beside it
  paved = mix(paved, 1.0 - roadway, k);
  // Round a hero level the photograph is not the ground at any height (issue 87): from the air its blur, its baked
  // shadows and the buses on its terminal read as wet blotches beside the level's crisp paving. There the ground is
  // what the street data says it is, in the level's tones: asphalt, kerbs and footways as drawn, and between them
  // paving of one tone. The drawn edges are taken back to a pixel's width where the drawing is magnified (from a
  // car or on foot), so where one surface meets the next stays crisp
  if (zn > 0.0) {
    // (the drawing's colour without the black of its empty pixels, which a filtered edge takes in: no dark seam
    // where a footway meets the paving of its own tone)
    vec4 r0 = texture2D(uStreet, vMapUv);
    // (and without the gaps filled from its blurred levels, which laid a soft band of asphalt over the paving)
    // (the drawing is an sRGB texture, so the sampler has already made it linear: decoding it a second time here took
    // the asphalt to an albedo of 0.007 and the footways to a brown, and from the air the roads were black, issue 148)
    vec4 sz = vec4(r0.rgb / max(r0.a, 0.02), r0.a);
    float wa = fwidth(sz.a);
    sz.a = mix(sz.a, smoothstep(0.5 - wa, 0.5 + wa, sz.a), smoothstep(0.02, 0.2, wa));
    vec3 zc = mix(ZONE_PAVE, sz.rgb, sz.a);
    diffuseColor.rgb = mix(diffuseColor.rgb, zc, zn);
    float zr = sz.a * smoothstep(0.2, 0.14, dot(sz.rgb, LUM));
    roadway = mix(roadway, zr, zn);
    paved = mix(paved, 1.0 - zr, zn);
    green *= 1.0 - zn;
  }
}
// paving at the albedo it has, not the photo's near-white: a soft knee from 0.28
float L = dot(diffuseColor.rgb, LUM);
if (L > 0.28) diffuseColor.rgb *= mix(1.0, (0.28 + (L - 0.28) * 0.3) / L, max(street, zn) * mix(0.6, 1.0, paved));
// pavers on paved ground, a fine aggregate on the roads, a grain on the rest
vec2 pv = pavers(vWP.xz);
float pnear = 1.0 - smoothstep(8.0, 32.0, camD);
diffuseColor.rgb *= mix(1.0, (0.9 + 0.14 * pv.y) * mix(0.7, 1.0, pv.x), paved * (1.0 - roadway) * pnear * 0.85);
float agg = vn(vWP.xz * 31.0) * 0.6 + vn(vWP.xz * 7.0) * 0.4;
diffuseColor.rgb *= mix(1.0, 0.86 + 0.26 * agg, roadway * near${window.OESurface && OESurface.active ? ' * 0.3' : ''}); // (the scanned asphalt carries it near: surface.js)
float grain = vn(vWP.xz * 2.7) * 0.55 + vn(vWP.xz * 9.0) * 0.3 + vn(vWP.xz * 0.6) * 0.15;
diffuseColor.rgb *= mix(1.0, 0.82 + 0.34 * grain, near * 0.75 * (1.0 - paved * pnear) * (1.0 - zn)); // (none round a hero level: tone the material does not explain)`);
    // photographed asphalt and paving at eye level (surface.js; not on the low tier)
    if (window.OESurface) OESurface.ground(sh, { road: 'roadway', paved: 'paved' });
    // in the rain: darker, glossier ground, and puddles on the roads and the paving (weather.js)
    if (window.OEWeather && (!weather || weather.armed)) OEWeather.patch(sh, { gloss: '1.0 - green', puddles: '1.0 - green', tread: '1.0 - green', porous: 0.42 });
    Wd.gradePhoto(sh); // the photo's haze out (world.js), before the drawn streets go over it
    if (Wd.skyLit) Wd.skyLit(sh); // the sky the ground sees, on its ambient light (world.js, issue 358)
  };
  // the ground's program with the wet look and without it are two programs; the weather compiles
  // its in when it first runs (weather.js arm: a device whose weather the guard keeps off never does)
  for (const m of Wd.groundMeshes) m.material.customProgramCacheKey = () => `ground|${weather && !weather.armed ? 'dry' : 'wet'}`;
  if (weather) weather.onArm(() => { for (const m of Wd.groundMeshes) m.material.needsUpdate = true; });
  loadMsg('Surface model for walking, flying and sunlight', 0.78);
  await idle();
  const T = D.T = Tfine;
  const fineTiles = scene.ground.map(() => null);
  // streets drawn from the footway and road data at 0.5 m per pixel, for the tiles near the player
  const rwOf = OEStreets.widthOf; // a road piece's carriageway, kerb to kerb: surveyed where the map has it, else its class's (streets.js)
  const FOOTW = OEActors.FOOTW;
  // The planned area's ground as surveyed (game.json road_ground, pipeline/road_ground.py; docs/ROADS.md, issue 196):
  // inside its ring the carriageways, footways and islands are the survey's own polygons, painted as such, and a road
  // piece's band is painted only outside it. A band along a centre line has no junction mouth, corner radius or
  // island, and lies off a carriageway the map's line is not the middle of. Paths in metres, made once.
  const RG = G.road_ground || null;
  let rgPaths = null;
  function roadGround() {
    if (!RG || rgPaths) return rgPaths;
    const ring = (P, r) => { for (let k = 0; k < r.length; k += 2) { if (k) P.lineTo(r[k] / 10, r[k + 1] / 10); else P.moveTo(r[k] / 10, r[k + 1] / 10); } P.closePath(); };
    const polys = list => { const P = new Path2D(); for (const p of list || []) for (const r of p) ring(P, r); return P; };
    const area = new Path2D(), out = new Path2D(), box = [Infinity, Infinity, -Infinity, -Infinity];
    ring(area, RG.area); out.rect(-1e6, -1e6, 2e6, 2e6); ring(out, RG.area);
    for (let k = 0; k < RG.area.length; k += 2) { const x = RG.area[k] / 10, y = RG.area[k + 1] / 10; box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); }
    return rgPaths = { area, out, box, asph: polys(RG.a), pave: polys((RG.w || []).concat(RG.s || [], RG.i || [])) };
  }
  function inRoadGround(x, y) { // inside the ring the survey paints
    if (!RG) return false;
    const r = RG.area; let c = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i] / 10, yi = r[i + 1] / 10, xj = r[j] / 10, yj = r[j + 1] / 10; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; }
    return c;
  }
  // two lanes each way on a piece by its surveyed width where its class has one (junctions.js byClass drives the same)
  const twoLanes = r => (r.nl || 1) >= 2 || OEStreets.roomForTwo(r);
  // where three or more road ends meet [x, y, the widest road's half width there], and each zebra crossing of the
  // data on the road it crosses [x, y, the road's direction there, half the road's width less the gutters]
  let nodesMemo = null, zebrasMemo = null;
  function streetNodes() {
    if (nodesMemo) return nodesMemo;
    const at = new Map();
    for (const r of G.paths.road.concat((G.paths.far || {}).road || [])) {
      const w = rwOf(r), p = r.p;
      if (z3(p, 0) || z3(p, p.length - 3)) continue;
      for (const k of [0, p.length - 3]) { const key = Math.round(p[k] / 10) + ',' + Math.round(p[k + 1] / 10), e = at.get(key) || [p[k] / 10, p[k + 1] / 10, 0, 0]; e[2] = Math.max(e[2], w / 2); e[3]++; at.set(key, e); }
    }
    return nodesMemo = [...at.values()].filter(e => e[3] >= 3 && e[2] >= 4.5);
  }
  function z3(p, k) { const x = p[k] / 10, y = p[k + 1] / 10; return p[k + 2] / 10 - nav.terrain(x, y) > 3; } // (on a deck)
  function streetZebras() {
    if (zebrasMemo) return zebrasMemo;
    const Z = (G.props || {}).crossing_zebra || [], out = [], roads = G.paths.road;
    for (let i = 0; i < Z.length; i += 3) {
      const x = Z[i] / 10, y = Z[i + 1] / 10;
      if (inRoadGround(x, y)) continue; // (the survey's own: road_ground.z, kerb to kerb)
      let best = null, bd = 12 * 12;
      for (const r of roads) {
        const p = r.p;
        for (let k = 0; k + 5 < p.length; k += 3) {
          const ax = p[k] / 10, ay = p[k + 1] / 10, bx = p[k + 3] / 10 - ax, by = p[k + 4] / 10 - ay, l2 = bx * bx + by * by;
          if (l2 < 0.01 || Math.abs(ax - x) > 80 || Math.abs(ay - y) > 80) continue;
          const u = Math.max(0, Math.min(1, ((x - ax) * bx + (y - ay) * by) / l2)), dx = ax + bx * u - x, dy = ay + by * u - y, d = dx * dx + dy * dy;
          if (d < bd && !z3(p, k)) { bd = d; const l = Math.sqrt(l2); best = [ax + bx * u, ay + by * u, bx / l, by / l, rwOf(r) / 2 - 0.6]; }
        }
      }
      if (best) out.push(best);
    }
    return zebrasMemo = out;
  }
  function streetTexture(i) {
    const t = scene.ground[i], PX = QC.lean ? 0.75 : 0.5, w = Math.round((t.x1 - t.x0) / PX), h = Math.round((t.y1 - t.y0) / PX);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.lineCap = g.lineJoin = 'round';
    const inTile = p => { for (let k = 0; k < p.length; k += 3) { const x = p[k] / 10, y = p[k + 1] / 10; if (x > t.x0 - 30 && x < t.x1 + 30 && y > t.y0 - 30 && y < t.y1 + 30) return true; } return false; };
    const path = p => {
      g.beginPath();
      let pen = false;
      for (let k = 0; k < p.length; k += 3) {
        const x = p[k] / 10, y = p[k + 1] / 10, z = p[k + 2] / 10;
        if (z - nav.terrain(x, y) > 3) { pen = false; continue; } // on a bridge deck, not on the ground
        const cx = (x - t.x0) / PX, cy = (t.y1 - y) / PX;
        pen ? g.lineTo(cx, cy) : g.moveTo(cx, cy);
        pen = true;
      }
    };
    const FAR = G.paths.far || {}; // (a district's streets past its edge: painted, not walked or driven; pipeline/district.py)
    const foot = G.paths.foot.concat(FAR.foot || []).filter(f => inTile(f.p)), roads = G.paths.road.concat(FAR.road || []).filter(r => inTile(r.p));
    for (const f of foot) { path(f.p); g.strokeStyle = '#b3ada1'; g.lineWidth = (FOOTW[f.c] || 3) / PX; g.stroke(); }
    // the survey's ground where this tile has it: `survey` draws in metres inside its ring, `bands` outside it
    const S = roadGround(), inS = !!S && t.x1 > S.box[0] && t.x0 < S.box[2] && t.y1 > S.box[1] && t.y0 < S.box[3];
    const metres = () => g.setTransform(1 / PX, 0, 0, -1 / PX, -t.x0 / PX, t.y1 / PX);
    const survey = (fn, onAsphalt) => { if (!inS) return; g.save(); metres(); g.clip(S.area); if (onAsphalt) g.clip(S.asph, 'evenodd'); fn(); g.restore(); };
    const bands = fn => { if (!inS) { fn(); return; } g.save(); metres(); g.clip(S.out, 'evenodd'); g.setTransform(1, 0, 0, 1, 0, 0); fn(); g.restore(); };
    survey(() => { g.fillStyle = '#b3ada1'; g.fill(S.pave, 'evenodd'); g.strokeStyle = '#9d988d'; g.lineWidth = 1; g.stroke(S.asph); }); // footways, shared streets and islands; the kerbs
    bands(() => { for (const r of roads) { path(r.p); g.strokeStyle = '#9d988d'; g.lineWidth = (rwOf(r) + 1) / PX; g.stroke(); } }); // kerbs
    // Asphalt as a worn city road is under the sun (an albedo near 0.11: from the air the roads were black ribbons at
    // 0.07, issue 148), in the hero level's own tone, and on it the paint a Tokyo road carries, each line where the
    // road's lanes put it: the edge lines half a metre in from the kerbs, a broken line between two lanes of one way,
    // the centre line of a two-way road (unbroken where it has two lanes each way), and a zebra's bars where the data
    // has a crossing. A line is drawn at its own width (0.2 m, less than a pixel here), so from the air it is as
    // faint as it is from there, and a junction is cleared of the lines that would run through it.
    const ASPHALT = '#5c5f63', PAINT = '#e4e1d8', LW = 0.2;
    const rw = rwOf;
    bands(() => { for (const r of roads) { path(r.p); g.strokeStyle = ASPHALT; g.lineWidth = rw(r) / PX; g.stroke(); } });
    survey(() => { g.fillStyle = ASPHALT; g.fill(S.asph, 'evenodd'); });
    // (the edge lines half a metre in from the surveyed kerbs: the outline's stroke, cut to the asphalt, with its middle taken back)
    survey(() => { g.lineJoin = 'round'; g.strokeStyle = PAINT; g.lineWidth = 1 + LW; g.stroke(S.asph); g.strokeStyle = ASPHALT; g.lineWidth = 1 - LW; g.stroke(S.asph); }, true);
    g.lineCap = 'butt';
    const pair = (r, off, dash) => { // two lines, off metres either side of the road's middle
      g.setLineDash(dash ? [3 / PX, 5 / PX] : []);
      path(r.p); g.strokeStyle = PAINT; g.lineWidth = (2 * off + LW) / PX; g.stroke();
      g.setLineDash([]);
      path(r.p); g.strokeStyle = ASPHALT; g.lineWidth = (2 * off - LW) / PX; g.stroke();
    };
    const lined = roads.filter(r => rw(r) >= 9).sort((a, b) => rw(b) - rw(a));
    bands(() => { for (const r of lined) pair(r, rw(r) / 2 - 0.5, false); });
    for (const r of lined) {
      const w = rw(r), nl = twoLanes(r) ? 2 : 1;
      if (r.o) { if (nl === 2) { g.setLineDash([3 / PX, 5 / PX]); path(r.p); g.strokeStyle = PAINT; g.lineWidth = LW / PX; g.stroke(); g.setLineDash([]); } continue; }
      if (nl >= 2) pair(r, Math.min((w - 1) / 4, 3.2), true); // (the game's second lane is 3 m outside its first, 1.7 m off the line)
      g.setLineDash(nl >= 2 ? [] : [5 / PX, 5 / PX]);
      path(r.p); g.strokeStyle = PAINT; g.lineWidth = LW / PX; g.stroke();
      g.setLineDash([]);
    }
    // a junction cleared of the lines through it: outside the survey's ring a disc, inside it the disc's part on the asphalt
    bands(() => { for (const [x, y, rad] of streetNodes()) if (x > t.x0 - 30 && x < t.x1 + 30 && y > t.y0 - 30 && y < t.y1 + 30) {
      g.beginPath(); g.arc((x - t.x0) / PX, (t.y1 - y) / PX, rad / PX, 0, 6.2832); g.fillStyle = ASPHALT; g.fill();
    } });
    survey(() => { for (const [x, y, rad] of streetNodes()) if (x > t.x0 - 30 && x < t.x1 + 30 && y > t.y0 - 30 && y < t.y1 + 30) {
      g.beginPath(); g.arc(x, y, rad, 0, 6.2832); g.fillStyle = ASPHALT; g.fill();
    } }, true);
    g.setLineDash([0.45 / PX, 0.45 / PX]);
    for (const [x, y, ux, uy, half] of streetZebras()) if (x > t.x0 - 30 && x < t.x1 + 30 && y > t.y0 - 30 && y < t.y1 + 30) {
      g.beginPath(); g.moveTo((x - uy * half - t.x0) / PX, (t.y1 - (y + ux * half)) / PX); g.lineTo((x + uy * half - t.x0) / PX, (t.y1 - (y - ux * half)) / PX);
      g.strokeStyle = PAINT; g.lineWidth = 4 / PX; g.stroke();
    }
    g.setLineDash([]);
    survey(() => { // the zebras of the data inside the ring, each from kerb to kerb
      g.setLineDash([0.45, 0.45]); g.strokeStyle = PAINT; g.lineWidth = 4;
      for (const z of RG.z || []) { g.beginPath(); g.moveTo(z[0] / 10, z[1] / 10); g.lineTo(z[2] / 10, z[3] / 10); g.stroke(); }
      g.setLineDash([]);
    }, true);
    if (window.OETex && OETex.stats.on && typeof createImageBitmap === 'function') {
      // a phone (tex.js): the overlay in ASTC blocks, a quarter of the GPU's memory; the aerial photo shows until it is in (groundLod)
      const tex = new THREE.Texture();
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      tex.userData.pending = true;
      createImageBitmap(cv).then(bm => { cv.width = cv.height = 1; tex.image = bm; tex.needsUpdate = true; return OETex.pack(tex); }, () => { tex.image = cv; tex.needsUpdate = true; })
        .catch(() => {}).then(() => { tex.userData.pending = false; });
      return tex;
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (QC.lean) tex.onUpdate = () => { cv.width = cv.height = 1; }; // (a phone: the canvas let go once it is on the GPU)
    return tex;
  }
  // A fine tile is a kilometre of ground (96,000 triangles at 5 m), and drawn as one mesh it was never out of view: the
  // four round the player were 240,000 triangles of every frame, most of them behind the camera or behind the street's
  // walls. Cut into squares of CHUNK_M (world.js chunkGeo: one index each over the tile's shared vertices, its own bounds), the
  // camera's frustum leaves out what is behind it and the visibility sweep (visibility.js) what the walls hide.
  // ?groundchunk=off draws each tile whole.
  const CHUNK_M = /[?&]groundchunk=off\b/.test(location.search) ? 0 : 240;
  function fineTile(i) { // the 5 m version of a ground tile, built the first time the player comes near
    const g = Wd.tileGeometry(scene.ground[i], D.drawTfine || T), coarse = Wd.groundMeshes[i];
    const parts = Wd.chunkGeo(g, CHUNK_M);
    if (!parts) {
      const m = Wd.groundMesh(g, coarse.material);
      m.receiveShadow = true;
      world.add(m);
      return m;
    }
    const grp = new THREE.Group();
    grp.userData.oeStill = true;
    for (const q of parts) {
      const m = Wd.groundMesh(q, coarse.material);
      m.receiveShadow = true;
      if (window.OEVis) OEVis.gate(m, true); // (read now: on a phone the arrays go once uploaded)
      grp.add(m);
    }
    world.add(grp);
    return grp;
  }
  function groundLod(x, y) {
    if (Wd.mapAt) Wd.mapAt(x, y); // (a phone: the map is built round the player, world.js: the buildings' cells and the aerial pictures nearest here)
    scene.ground.forEach((t, i) => {
      const d = Math.hypot(Math.max(t.x0 - x, 0, x - t.x1), Math.max(t.y0 - y, 0, y - t.y1));
      const near = d < 260;
      if (near && !fineTiles[i]) fineTiles[i] = fineTile(i);
      if (fineTiles[i]) fineTiles[i].visible = near;
      // (a phone: a fine tile left 700 m behind goes, its geometry with it, and is built again on the way back)
      if (QC.lean && fineTiles[i] && d > 700) { const f = fineTiles[i]; fineTiles[i] = null; world.remove(f); f.traverse(c => { if (c.geometry) c.geometry.dispose(); if (window.OEVis) OEVis.ungate(c); }); }
      const ud = Wd.groundMeshes[i].material.userData;
      if (near && ud.street && !ud.street.value) ud.street.value = streetTexture(i);
      else if (d > 700 && ud.street && ud.street.value) { ud.street.value.dispose(); ud.street.value = null; } // (drawn again if you come back: 24 MB a tile)
      // (under a hero level's zone the drawn streets stay on from the helicopter too: the photograph is never that ground)
      if (ud.streetOn) ud.streetOn.value = near && (player.mode !== 'heli' || zoneTile(i)) && !(ud.street && ud.street.value && ud.street.value.userData.pending) ? 1 : 0;
      Wd.groundMeshes[i].visible = !near;
    });
  }
  const FRAME = { cell: 2, x0: scene.frame.x[0], x1: scene.frame.x[1], y0: scene.frame.y[0], y1: scene.frame.y[1] };
  // (made in the worker that built the walls, from the same ground and solids, where there is one: buildings.js start)
  const DSM = D.dsm && D.dsm.nx === Math.round((FRAME.x1 - FRAME.x0) / FRAME.cell) ? D.dsm : S.buildDSM(T, B.s, Object.assign({ ids: true }, FRAME));
  D.dsm = null;
  if (Wd.farSun) Wd.farSun.init(DSM); // the sun's shadow past the shadow map, from this surface model (world.js, issue 358)
  if (D.navJob) { D.navCells = await D.navJob; D.navJob = null; } // (the landmarks on its grid, from the worker: world.js)
  const tNav = performance.now(), nav = OENav.create(D, DSM);
  console.info(`nav: ${Math.round(performance.now() - tNav)} ms (the collision world ${nav.col.count} solids; the landmarks' fine cells sorted ${Math.round(nav.startMs)} ms)`);
  if (window.OESurface) OESurface.load(renderer); // the street's scanned surfaces, which the shaders take when they come (surface.js)
  // the big screens light the street, the crowd and the buildings across from them (neon.js)
  const neon = window.OENeon ? await OENeon.create(Wd, renderer, { tier: QC.name, gain: (G.look || {}).neon ?? 1, fill: (G.look || {}).fill || [], ground: (x, y) => Math.max(0, nav.terrain(x, y)), pool: (G.hero || []).map(h => [h.at[0], h.at[1], h.r || 100]) }) : null;
  // a wet street mirrors the city (mirror.js, high tier): the ground, the paving and the road markings take it
  if (window.OEMirror) {
    mirror = OEMirror.create(Wd, renderer, camera, { tier: QC.name, ground: (x, y) => { const z = Math.max(0, nav.terrain(x, y)), f = nav.floorAt(x, y, z + 0.5); return f ? f.z : z; } });
    for (const m of Wd.groundMeshes) mirror.patch(m.material);
    for (const [k, m] of Object.entries((D.LM && D.LM.materials) || {})) if (m.street_lit || m.decal || m.pattern === 'deck_zones') { mirror.patch(Wd.lmMats[k]); mirror.patch(Wd.floodMats[k]); }
  }
  // a hero level: a street modelled finely, loaded when the player comes near it and let go when they leave (hero.js)
  // where a hero level's paving is drawn, from its model as it comes (its ground meshes: "<level>_ground_*"): a grid of
  // HC m cells over its circle, each holding the paving's height at its middle (the highest triangle over it). The
  // walking grid lifts a walker onto that paving (game.json hero[].lift) only where it is drawn over the game's own
  // ground, and not over the gaps where the game's ground is what shows, nor where the level's ground lies under it
  // (nav.js lift). Made once: the level let go and fetched again draws the same paving
  const HC = 0.5;
  function heroCover(h, root) {
    if (h.cover || !h.at || !h.r) return;
    const t0 = performance.now(), n = Math.ceil(2 * h.r / HC), x0 = h.at[0] - h.r, y0 = h.at[1] - h.r, g = new Float32Array(n * n).fill(-1e9), road = new Uint8Array(n * n), v = new THREE.Vector3(), P = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    // (a level whose floor is its own, hero[].floor: each cell keeps the floor's triangles over it too, so that its height
    // is read where the walker stands and not at the cell's middle. A cell an edge crossed, a plank's step or a mat's,
    // took the height at its middle for all of it, and the guide stood 7 to 9 cm in the air on its low side by SKY's
    // hall, by where the crowd put his way; 1.35% of the hall's floor read more than 6 cm out: tools/floor_grid.js)
    const tri = h.floor ? new Map() : null;
    let tris = 0;
    const cut = h.floor ? new Uint8Array(n * n) : null; // (the level's own floor, where the ground is not drawn: HERO_CUT)
    root.traverse(o => {
      if (!o.isMesh || !/(^|_)(ground|room_floor)_/.test(o.name)) return; // (room_floor: a hall's floor, stood on, never wet: hero[].floor)
      const asphalt = /_ground_(asphalt|paint)/.test(o.name) ? 1 : 0; // (the carriageway and what is painted on it: the crossings' stripes)
      const own = cut && /(^|_)room_floor_/.test(o.name) ? 255 : 0;
      const pos = o.geometry.attributes.position, idx = o.geometry.index, m = idx ? idx.count : pos.count;
      for (let t = 0; t + 2 < m; t += 3) {
        for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, idx ? idx.getX(t + k) : t + k).applyMatrix4(o.matrixWorld); P[k][0] = (v.x - x0) / HC; P[k][1] = (-v.z - y0) / HC; P[k][2] = v.y; }
        const [[ax, ay, az], [bx, by, bz], [cx, cy, cz]] = P, den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(den) < 1e-9) continue;
        tris++;
        const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), i1 = Math.min(n - 1, Math.ceil(Math.max(ax, bx, cx))), j0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), j1 = Math.min(n - 1, Math.ceil(Math.max(ay, by, cy)));
        // (only what faces up is stood on: a plank's underside or a step's riser under the same point is not the floor)
        const up = tri ? (() => { const ux = (bx - ax) * HC, uy = bz - az, uz = -(by - ay) * HC, wx = (cx - ax) * HC, wy = cz - az, wz = -(cy - ay) * HC, nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; return Math.abs(ny) > 0.5 * Math.hypot(nx, ny, nz); })() : false;
        if (tri && up) { const q = [ax, ay, az, bx, by, bz, cx, cy, cz]; for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const c = j * n + i; let l = tri.get(c); if (!l) tri.set(c, l = []); l.push(q); } }
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const px = i + 0.5, py = j + 0.5, l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
          if (l1 >= -0.02 && l2 >= -0.02 && l1 + l2 <= 1.02) { const z = l1 * az + l2 * bz + (1 - l1 - l2) * cz, c = j * n + i; if (z > g[c]) { g[c] = z; road[c] = asphalt; } if (own && l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) cut[c] = own; }
        }
      }
    });
    if (!tris) return;
    if (cut && cut.some(v => v)) {
      // (a cell out round the floor: a cell whose middle fell outside it at a wall's foot left a sliver of the ground
      // standing over its edge; out there the level's own walls, tiles and planks cover what is not drawn)
      const c0 = cut.slice();
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (c0[j * n + i]) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < n && jj < n) cut[jj * n + ii] = 255; }
      const t = new THREE.DataTexture(cut, n, n, THREE.RedFormat);
      t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
      if (HERO_CUT.tex.value) HERO_CUT.tex.value.dispose();
      HERO_CUT.tex.value = t; HERO_CUT.box.value.set(x0, y0, n * HC, 0); HERO_CUT.h = h;
      // (where the ground is not drawn for its floor: there alone its floor stands under the ground, nav.js lift)
      h.cutAt = (x, y) => { const i = Math.floor((x - x0) / HC), j = Math.floor((y - y0) / HC); return i >= 0 && j >= 0 && i < n && j < n && cut[j * n + i] > 0; };
    }
    h.coverMs = Math.round(performance.now() - t0); // (for tools/guide_way.js)
    // (and where its carriageway is, for the routes: route.js inRoad; null outside the level's paving)
    h.road = (x, y) => { const i = Math.floor((x - x0) / HC), j = Math.floor((y - y0) / HC); return i < 0 || j < 0 || i >= n || j >= n || g[j * n + i] < -1e8 ? null : road[j * n + i] === 1; };
    nav.carriageway = (x, y) => { for (const q of G.hero || []) if (q.road) { const r = q.road(x, y); if (r !== null) return r; } return null; };
    h.cover = (x, y) => { const i = Math.floor((x - x0) / HC), j = Math.floor((y - y0) / HC); return i < 0 || j < 0 || i >= n || j >= n || g[j * n + i] > nav.terrain(x, y) + 0.02; };
    // (the drawn floor's own height, or null where it draws none: a level whose floor is its own, hero[].floor, nav.js lift)
    h.height = (x, y) => {
      const i = Math.floor((x - x0) / HC), j = Math.floor((y - y0) / HC);
      if (i < 0 || j < 0 || i >= n || j >= n || g[j * n + i] < -1e8) return null;
      const l = tri && tri.get(j * n + i);
      if (l) { // (the highest of the floor's triangles under the point itself, in the grid's units)
        const px = (x - x0) / HC, py = (y - y0) / HC;
        // (and where none is under the point, none within a joint's width either, as at the floor's edge where another level's
        // paving meets it, the level has no floor there: the cell's highest, a plank beside the point, stood the guide 7 cm over
        // the next level's planks on SKY's forecourt, issue 190)
        for (const e of [1e-4, 0.02]) {
          let best = -1e9;
          for (const [ax, ay, az, bx, by, bz, cx, cy, cz] of l) {
            const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy), l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
            if (l1 >= -e && l2 >= -e && l1 + l2 <= 1 + e) best = Math.max(best, l1 * az + l2 * bz + (1 - l1 - l2) * cz);
          }
          if (best > -1e8) return best;
        }
        return null;
      }
      return g[j * n + i];
    };
  }
  // the ceilings a hero level draws over where you walk (issue 208), as nav.js ceilOver reads the landmarks', and its rails: the chase
  // camera stays under them (rig ceilCut). Read from what is drawn as the level comes: every flat face of its model that
  // stands 1.8 m or more over the ground, in HC m cells with its heights in layers, kept where it covers as a ceiling does
  // (nav.js soffits). h.ceilOver(x, y, z): the lowest over z, or null. Made once, as the paving's grid is
  function heroSoffit(h, root) {
    if (h.ceilOver !== undefined || !h.at || !h.r) return;
    const t0 = performance.now(), tris = [], v = new THREE.Vector3(), box = new THREE.Box3();
    root.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh || !o.geometry || !o.geometry.attributes.position) return;
      const mt = Array.isArray(o.material) ? o.material[0] : o.material;
      if (mt && (mt.transparent || /leaf|tree|foliage|glass/i.test(mt.name || ''))) return; // (seen through, or a crown: not a ceiling)
      if (/(^|_)(ground|room_floor)_/.test(o.name)) return; // (the paving: under your feet)
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      if (box.max.y < Math.max(h.z || 0, nav.terrain((box.min.x + box.max.x) / 2, -(box.min.z + box.max.z) / 2)) + 1.8) return; // (all of it under a walker's head)
      const pos = o.geometry.attributes.position, idx = o.geometry.index, m = idx ? idx.count : pos.count, nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld), nv = new THREE.Vector3();
      const nrm = o.geometry.attributes.normal;
      for (let t = 0; t + 2 < m; t += 3) {
        // (a face that looks down, by its first corner's normal: the ceiling's underside, not the roof over it)
        if (nrm && nv.fromBufferAttribute(nrm, idx ? idx.getX(t) : t).applyMatrix3(nm).normalize().y > -0.7) continue;
        const T = [0, 1, 2].map(k => { v.fromBufferAttribute(pos, idx ? idx.getX(t + k) : t + k).applyMatrix4(o.matrixWorld); return [v.x, -v.z, v.y]; });
        const zl = Math.min(T[0][2], T[1][2], T[2][2]);
        if (zl < Math.max(0, nav.terrain(T[0][0], T[0][1])) + 1.8 && zl < (h.z || 0) + 1.8) continue; // (under a walker's head: a bench's or a step's underside)
        tris.push(T);
      }
    });
    h.ceilOver = OENav.soffits(tris, h.at[0] - h.r, h.at[1] - h.r, Math.ceil(2 * h.r / HC), HC);
    // and its guard rails as drawn (issue 208): the cells of HC m a rail's body crosses, 0.15 to 1.3 m over the ground
    // under it, so that a car that comes for you stops at the kerb where none stands between it and you (rides.js openKerb)
    const n = Math.ceil(2 * h.r / HC), x0 = h.at[0] - h.r, y0 = h.at[1] - h.r, rail = new Set(), P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    root.traverse(o => {
      if (!o.isMesh || !o.geometry || !/(^|_)metal_guard/.test(`${o.name} ${(o.material && o.material.name) || ''}`)) return;
      const pos = o.geometry.attributes.position, idx = o.geometry.index, m = idx ? idx.count : pos.count;
      for (let t = 0; t + 2 < m; t += 3) {
        for (let k = 0; k < 3; k++) P[k].fromBufferAttribute(pos, idx ? idx.getX(t + k) : t + k).applyMatrix4(o.matrixWorld);
        for (let k = 0; k < 3; k++) {
          const a = P[k], b = P[(k + 1) % 3], c = Math.max(1, Math.ceil(a.distanceTo(b) / (HC / 2)));
          for (let i = 0; i <= c; i++) {
            v.lerpVectors(a, b, i / c);
            const x = v.x, y = -v.z, gz = Math.max(h.z || 0, nav.terrain(x, y));
            if (v.y < gz + 0.15 || v.y > gz + 1.3) continue;
            const ci = Math.floor((x - x0) / HC), cj = Math.floor((y - y0) / HC);
            if (ci >= 0 && cj >= 0 && ci < n && cj < n) rail.add(cj * n + ci);
          }
        }
      }
    });
    h.rail = (x, y) => { const ci = Math.floor((x - x0) / HC), cj = Math.floor((y - y0) / HC); return ci >= 0 && cj >= 0 && ci < n && cj < n && rail.has(cj * n + ci); };
    h.railCells = rail.size;
    h.ceilCells = h.ceilOver ? h.ceilOver.cells : 0; h.ceilMs = Math.round(performance.now() - t0); // (for tools/cam_ceiling.js)
  }
  // the lowest drawn ceiling over (x, y) above the height z, of the landmarks and every hero level, or null
  const heroCeil = (x, y, z) => {
    let best = nav.ceilOver(x, y, z); // (and the landmarks' own: the station's free passage, nav.js ceilOver)
    for (const q of G.hero || []) if (q.ceilOver) { const c = q.ceilOver(x, y, z); if (c !== null && (best === null || c < best)) best = c; }
    return best;
  };
  const hero = window.OEHero && G.hero ? OEHero.create(Wd, renderer, { hero: G.hero, base: D.DATA, tier: QC.name, mirror, warm: obj => warmFor(obj, { first: true }), upload: sendBuffers, ground: (h, root) => { heroCover(h, root); heroSoffit(h, root); } }) : null;
  // the city's shaders compiled from here, behind the rest of the set-up (the surface model, the footways, the
  // people and the traffic: seconds of the CPU's time, issue 327) rather than all after it: where the GPU compiles
  // in parallel (KHR_parallel_shader_compile, or a GPU process of its own) the two overlap. Every light is in place
  // (earlyLamps); what joins the world later is compiled with the rest before the first frame (warm, below)
  // (one program at a time while the set-up runs, between its tasks; once it is built (setUp), as many as the GPU takes: the
  // loader is all that is left to wait on. Not a slice a frame, as behind the title: no frame is drawn under the loader, and the
  // set-up's long tasks let a frame through so seldom that its compile all but stopped till the set-up was done, issue 27)
  let setUp = false;
  // (on a desktop whose GPU compiles in parallel, three at a time through the set-up: its synchronous calls do not wait on a program
  // they do not use, and one at a time left the compile threads idle for the set-up's seconds, the first frame waiting on what
  // was left (issue 186 A). A phone keeps one: an iPhone compiles one at a time whatever the extension says, issue 27)
  const setUpFlight = !QC.lean && renderer.extensions.has('KHR_parallel_shader_compile') && !/[?&]flight=1\b/.test(location.search) ? 3 : 1;
  const earlyWarm = Promise.resolve(Wd.skyReady).then(() => OEWorld.compile(renderer, world, camera, { scene: world, target: atmos && atmos.composer ? atmos.composer.renderTarget1 : null, flight: () => (setUp ? 6 : setUpFlight), only: OEWorld.shown })); // (what is shown: the rest behind the title, warmRest)
  // landmark solids (the Opera House shells) and walkable strips (the bridge deck) shade the ground too
  for (const [name, m] of Object.entries(nav.tops)) if ((G.shade_landmarks || []).some(p => name.startsWith(p))) for (const [k, z] of m) if (z > DSM.data[k]) DSM.data[k] = z;
  for (const s of nav.strips) for (let i = 0; i < s.us.length - 1; i++) {
    const a = s.us[i], b = s.us[i + 1], w = s.half_width, P2 = (u, v) => [s.origin[0] + s.axis[0] * u - s.axis[1] * v, s.origin[1] + s.axis[1] * u + s.axis[0] * v];
    S.fillMax(DSM, [[...P2(a, -w), ...P2(b, -w), ...P2(b, w), ...P2(a, w)]], Math.max(s.zs[i], s.zs[i + 1]), -3);
  }
  // the helicopter, ferries and cars every city shares (vehicles.js); the box-built ones if they can't be loaded
  let vlib = null;
  // (the helicopter's model after the game opens, when a pad is in range: heliToPad, enterHeli; issue 148)
  // (and the cars' near models after it too: their far ones before, issue 335; afterPlayable)
  try { vlib = await OEVehicles.load('assets/vehicles/', { ferry: (G.ferries || []).length > 0 && (G.ferry_style || {}), heli: 'later', cars: 'later' }); } catch (e) { console.warn('Vehicle models unavailable, using simple ones:', e); }
  // decks under the mapped bridges and viaducts (decks.js): drawn, walked, and in the shade model. A
  // bridge over a ferry's course clears the boats with someone standing on the upper deck
  const FI = vlib && vlib.ferryInfo, fstyle = G.ferry_style || {};
  const boatTop = (FI ? FI.upper_deck_m * (fstyle.length_m ? fstyle.length_m / FI.length_m : 1) : 4.2) + 2.2;
  BK = await bakeP;
  const tDeck = performance.now(), deckPlan = BK && BK.decks ? BK.decks : OEDecks.plan(G.paths, nav, FRAME, { boats: (G.ferries || []).flatMap(f => (f.legs || []).map(l => l.path)), clear: boatTop, tracks: ((G.trains && G.trains.tracks) || []).map(t => t.p) });
  nav.addDecks(deckPlan.segs);
  for (const d of deckPlan.segs) {
    const L = Math.hypot(d.bx - d.ax, d.by - d.ay) || 1, nx = -(d.by - d.ay) / L * d.hw, ny = (d.bx - d.ax) / L * d.hw;
    S.fillMax(DSM, [[d.ax + nx, d.ay + ny, d.bx + nx, d.by + ny, d.bx - nx, d.by - ny, d.ax - nx, d.ay - ny]], Math.max(d.az, d.bz), -3);
  }
  // the roads as decks.js has laid them, on their bridges' and viaducts' decks (streets.js): the
  // columns under the decks stand clear of the roads below them, and of the buildings
  const roadsNow = OEStreets.carriageways(G.paths.road.map(r => ({ c: r.c, p: r.p.map(v => v / 10), cw: r.cw })));
  // (a landmark's 2 m cells stand in for its fine ones here: laying the fine cells of the whole city
  // would cost seconds at the start, nav.js; paving, padded 0.3 m in those cells, stays under 0.45)
  const inWall = (x, y, z, r) => nav.withoutFine(() => nav.col.overlap(x, y, r, z + 0.3, z + 2.2, i => nav.col.tagOf(i) === 1 && nav.col.zhiOf(i) <= z + 0.3) || nav.landmarkHit(x, y, z + 0.45, z + 2.2));
  if (!(BK && BK.decks)) deckPlan.columns = OEDecks.clearColumns(deckPlan.runs, (x, y, z, r) => roadsNow.depth(x, y, z, r), inWall); // (baked: its columns cleared already)
  // a deck over a railway (the expressway on Circular Quay Station's roof): the station carries it on its own
  // columns, and none of the deck's stands within a train's width of a track
  if (G.trains && !(BK && BK.decks)) {
    const near = (c, t) => { const p = t.p, rz = p[2] / 10; if (c.z1 < rz + 1 || c.z0 > rz + 4) return false; const r = 3.2 + Math.max(c.hx, c.hy);
      for (let k = 0; k + 5 < p.length; k += 3) { const ax = p[k] / 10, ay = p[k + 1] / 10, bx = p[k + 3] / 10 - ax, by = p[k + 4] / 10 - ay, u = Math.max(0, Math.min(1, ((c.x - ax) * bx + (c.y - ay) * by) / (bx * bx + by * by || 1)));
        if (Math.hypot(c.x - ax - bx * u, c.y - ay - by * u) < r) return true; } return false; };
    for (const r of deckPlan.runs) if (r.cols) r.cols = r.cols.filter(c => !G.trains.tracks.some(t => near(c, t)));
  }
  bakeMs += performance.now() - tDeck; if (bakeOut) bakeOut.v.decks = plainOf({ runs: deckPlan.runs, segs: deckPlan.segs });
  world.add(OEDecks.mesh(deckPlan.runs, OEWorld.lin));
  // under the decks drawn over the water, the photograph of the same bridge or expressway lies on the bottom
  // and showed through the water as a road on the riverbed (Tokyo's Nihonbashi under the Shuto, issue 65):
  // the water closes over the bottom there. The mask is a little wider than the deck, more so the higher it
  // stands, since an aerial photograph leans a raised deck off its plan position
  if (Wd.sea && Wd.sea.setCover) {
    // (and under a city's own decks drawn as landmarks, strips marked "cover": the Shuto over the Nihonbashi River)
    const own = (G.surfaces || []).filter(st => st.type === 'strip' && st.cover).map(st => {
      const [u0, z0] = st.profile[0], [u1, z1] = st.profile[st.profile.length - 1], [ox, oy] = st.origin, [ax, ay] = st.axis;
      return { pts: [[ox + ax * u0, oy + ay * u0, z0], [ox + ax * u1, oy + ay * u1, z1]], w: 2 * st.half_width };
    });
    Wd.waterCover([...deckPlan.runs, ...own].filter(r => r.pts.some(q => nav.isWater(q[0], q[1])))); // (world.js: with the landmarks' decks)
  }
  // where a walkable strip (a canal bridge's deck) is carried on to the quay (nav.js), the approach is drawn in the deck's stone
  const LMM = (D.LM && D.LM.materials) || {};
  if (nav.approaches.length) world.add(OEDecks.mesh(nav.approaches.map(a => {
    const s = a.strip, P3 = (u, z) => [s.origin[0] + s.axis[0] * u, s.origin[1] + s.axis[1] * u, z], back = a.to > a.from ? -0.3 : 0.3;
    return { pts: [P3(a.from + back, a.z0), P3(a.to, a.z1)], w: 2 * s.half_width, kind: 'foot', lift: 0, cols: [], parapet: false, colour: (LMM[s.mesh] || {}).color };
  }), OEWorld.lin));
  S.pyramid(DSM);
  // benches, street lamps and trees on the ground drawn under them (their heights in the data are
  // from the survey grid, which the drawn ground between its points can be below or above): on a
  // deck or pier at their height, else on the ground, else, on the bank of the water, a step back
  // from it; a tree the drawn ground would put under the water is not drawn
  const seat = (x, y, z) => {
    let on = Math.abs(nav.surfaceAt(x, y, z) - z) < 0.5;
    nav.decksAt(x, y, h => { if (Math.abs(h - z) < 0.5) on = true; });
    if (on) return [x, y, z];
    if (!nav.offGround(x, y)) return [x, y, nav.terrain(x, y)];
    const p = nav.stand(x, y, z, { rMax: 8 });
    return p ? [p.x, p.y, p.z] : [x, y, z];
  };
  for (const flat of Object.values(G.props || {})) for (let i = 0; i < flat.length; i += 3) {
    const q = seat(flat[i] / 10, flat[i + 1] / 10, flat[i + 2] / 10);
    for (let k = 0; k < 3; k++) flat[i + k] = Math.round(q[k] * 10);
  }
  // none in a wall (the data's points and the model's footprints disagree by a metre or two), nor, after
  // that step back from the water, in a carriageway (streets.js moved them out of those before; here
  // the roads are where decks.js has laid them, on their bridges' and viaducts' decks), nor under a
  // deck too low for it to stand under
  const inRoad = (x, y, z, r) => roadsNow.depth(x, y, z, r) > 0;
  const underDeck = (x, y, z, top) => { let hit = false; nav.decksAt(x, y, h => { if (h > z + 0.5 && h < z + top) hit = true; }); const s = nav.surfaceAt(x, y); return hit || (s > z + 0.5 && s < z + top); };
  for (const [k, r] of [['street_lamp', 0.12], ['bench', 0.3]]) {
    const flat = (G.props || {})[k];
    if (!flat) continue;
    const keep = [];
    for (let i = 0; i < flat.length; i += 3) {
      const x = flat[i] / 10, y = flat[i + 1] / 10, z = flat[i + 2] / 10;
      if (!inWall(x, y, z, r) && !inRoad(x, y, z, k === 'bench' ? 0.6 : r) && !underDeck(x, y, z, k === 'bench' ? 2 : 7)) keep.push(flat[i], flat[i + 1], flat[i + 2]);
    }
    G.props[k] = keep;
  }
  // (a tree on a channel's bank, by its wall, stands in the planting strip beside its lane: clear of the carriageway is
  // enough there, a bank lane being no-parking and narrowed to it, game.json cw, inland_water.py bank_lanes)
  // (only beside a lane narrowed so: by any other road along a channel the kerb's margin stands, or a tree kept there
  // stood in the traffic, Tetsugaku's Philosopher's Path)
  const cwRoads = G.paths.road.filter(r => r.cw);
  const bankLanes = cwRoads.length && D.inland ? OEStreets.carriageways(cwRoads.map(r => ({ c: r.c, p: r.p.map(v => v / 10), cw: r.cw }))) : null;
  // (and not at a junction, where a car turning or backing out swings wider than its lane and a trunk is a post it
  // waits on: within 12 m of a road's end the kerb's margin stands, Tetsugaku)
  const ends = new Set(), EK = (x, y) => `${Math.floor(x / 12)},${Math.floor(y / 12)}`;
  if (bankLanes) for (const r of G.paths.road) { const p = r.p, n = p.length; if (n >= 6) { ends.add(EK(p[0] / 10, p[1] / 10)); ends.add(EK(p[n - 3] / 10, p[n - 2] / 10)); } }
  const nearEnd = (x, y) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (ends.has(EK(x + a * 12, y + b * 12))) return true; return false; };
  const byWall = (x, y) => !!(bankLanes && D.inland.byWall(x, y, 1.2) && bankLanes.depth(x, y, nav.terrain(x, y), 3) > 0 && !nearEnd(x, y));
  // (nor beside a station's open platform, a strip the data knows nothing of: its crown would stand in through the side)
  const byPlatform = (x, y, g) => nav.strips.some(st => { if (st.mapped !== false || st.zs[0] - g > 14) return false; const [u, v] = nav.stripUV(st, x, y); return u >= st.us[0] - 6 && u <= st.us[st.us.length - 1] + 6 && Math.abs(v) <= st.half_width + 6; });
  if (Wd.trees && Wd.trees.reseat) Wd.trees.reseat((x, y) => { const g = nav.terrain(x, y); return g > 0 && !byPlatform(x, y, g) && !inWall(x, y, g, 0.3) && (byWall(x, y) ? !(roadsNow.depth(x, y, g, 0.35) > 0) : !inRoad(x, y, g, 0.4)) && !underDeck(x, y, g, 8) ? g : null; });
  // night.js's poles, behind the kerb: where one would be in a wall, its lamp hangs on a bracket there
  // (and one beside a deck, in the road or under it, goes)
  if (Wd.night && Wd.night.hidePoles) Wd.night.hidePoles((x, y, z) => !inWall(x, y, z, 0.1) && !inRoad(x, y, z, 0.1) && !inRoad(x, y, nav.terrain(x, y), 0.1) && !underDeck(x, y, z, 7));
  // lamp posts and tree trunks are solid: for you on foot and at the wheel, the crowd and the traffic
  const posts = OEStreets.posts();
  { const L = G.props.street_lamp || [], NP = (Wd.night && Wd.night.poles) || [], TR = Wd.trees && Wd.trees.trunks ? Wd.trees.trunks() : [];
    for (let i = 0; i < L.length; i += 3) posts.add(L[i] / 10, L[i + 1] / 10, L[i + 2] / 10, 0.12, 'lamp');
    for (let i = 0; i < NP.length; i += 3) posts.add(NP[i], NP[i + 1], NP[i + 2], 0.12, 'lamp');
    const CW = Wd.trees && Wd.trees.crowns ? Wd.trees.crowns() : []; // (and its crown: where its leaves begin, how far out and up they reach)
    for (let i = 0; i < TR.length; i += 4) { const q = posts.add(TR[i], TR[i + 1], TR[i + 2], TR[i + 3], 'tree'), j = i / 4 * 3; if (CW.length) { q.hb = CW[j]; q.rc = CW[j + 1]; q.top = CW[j + 2]; } } }
  // (and a hero level's own lamp posts, hero[].posts: drawn by its model, solid here)
  // A run of them closer than a body is a wall the level draws (SKY GATE's hall: posts every 0.25 m along its panels), marked
  // q.wall: the chase camera stops at it along the whole line from your head (wallCut), where a lamp post it looks past
  // unless it stands at the lens. Taken for a post, the hall's wall against the tower stood between you and the lens 2.3 m
  // from it, and the frame was the wall's dark back with you behind it (the owner's report, 23 November 2026; issue 181)
  for (const h of G.hero || []) {
    const P = h.posts || [], qs = P.map(([x, y]) => posts.add(x, y, nav.terrain(x, y), 0.14, 'lamp'));
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) if (Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]) < 0.45) { qs[i].wall = qs[j].wall = true; }
  }
  // (and its queue belts, hero[].belts: points along each belt, 0.2 m apart, so that nobody, the guide included, walks through one)
  for (const h of G.hero || []) for (const [x, y] of h.belts || []) posts.add(x, y, (h.z ?? nav.terrain(x, y)) + 0.3, 0.06, 'column');
  // (and what stands round in it and is a fence however low, hero[].rounds [x, y, r]: a planter's rail, which the walker's
  // step would otherwise take them over and onto the soil, with the dog after them)
  for (const h of G.hero || []) for (const [x, y, r] of h.rounds || []) posts.add(x, y, nav.terrain(x, y), r, 'round');
  // (and what stands in it as a box, hero[].boxes [x, y, heading, half length, half width, z0, z1]: SHIBUYA SKY's benches,
  // the nets' frames and the searchlights, which its model draws over a landmark that has none of them, so that a walker
  // went through a bench to the knee; walls in the collision world, as a railway's platform furniture is, below)
  for (const h of G.hero || []) for (const [x, y, hd, hl, hw, z0, z1] of h.boxes || []) {
    const fx = Math.sin(hd), fy = Math.cos(hd), r = [];
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) r.push(x + fx * hl * u - fy * hw * v, y + fy * hl * u + fx * hw * v);
    nav.col.add([r], z0, z1, nav.LFINE, -1);
  }
  nav.posts = posts;
  // What stands between a sound and the ear, for audio.js reach: the path difference over the highest edge on the line
  // from one to the other (m; negative by how much the line clears everything). The line is read in plan every 3 m (60
  // reads at most): where it passes through a solid of the collision world (a building as published, a landmark's 2 m
  // cell: SHIBUYA SKY's deck and its glass among them) or through the ground, the way over that solid's top; where it is
  // clear, how far over the surface model's top it passes. The point that most lengthens the way round is taken as the one
  // edge the sound bends over: the single knife edge of noise and radio propagation (Bullington's construction, ITU-R
  // P.526). The solids, not the surface model alone, say what blocks: the surface model is a height field, and under a
  // platform's canopy or a viaduct it is solid to the top (a train under Shibuya's platform roof, heard from Hachiko, lost
  // 18 dB to the roof over it). Not the first `skip` metres from the sound (6 unless it says), which stand in or on what
  // makes it (a train on its viaduct, a station's announcements out of its hall), nor the metre and a half round the ear.
  // From the deck at 230 m the tower's own roof is the edge to the street, 15 to 40 m longer a way than the straight
  // line: the most a barrier takes, 25 dB
  const dsmTop = (x, y) => {
    const c = Math.floor((x - DSM.x0) / DSM.cell), r = Math.floor((DSM.y1 - y) / DSM.cell);
    return c >= 0 && r >= 0 && c < DSM.nx && r < DSM.ny ? DSM.data[r * DSM.nx + c] : -Infinity;
  };
  const hearEdge = { at: null };
  const hearLine = (sx, sy, sz, ex, ey, ez, skip) => {
    const L = Math.hypot(ex - sx, ey - sy);
    hearEdge.at = null;
    if (L < skip + 2) return -1;
    const d = Math.hypot(L, ez - sz), n = Math.min(60, Math.ceil(L / 3));
    let best = -Infinity;
    for (let k = 1; k < n; k++) {
      const t = k / n, m = t * L;
      if (m < skip || L - m < 1.5) continue;
      const x = sx + (ex - sx) * t, y = sy + (ey - sy) * t, z = sz + (ez - sz) * t, g = nav.terrain(x, y);
      let top;
      if (g > z || nav.col.overlap(x, y, 0.05, z - 0.05, z + 0.05)) top = Math.max(g, nav.col.topAt(x, y)); // (through it: the way over its top)
      else { top = dsmTop(x, y); if (!(top < z)) continue; } // (clear: by how much, over what is under the line; under a canopy, nothing)
      const way = Math.hypot(m, top - sz) + Math.hypot(L - m, ez - top) - d, v = top > z ? way : -way;
      if (v > best) { best = v; hearEdge.at = [+x.toFixed(1), +y.toFixed(1), +top.toFixed(1)]; } // (for a tool: tools/roof_hear.js)
    }
    return best === -Infinity ? -1 : best;
  };
  // Is there a deck or a roof over the ears, for the sound's place (weatherTick)? The weather's own answer
  // (weather.covered) is read from the rain's occlusion map, which is drawn only while it rains: on a dry evening the
  // street under the railway's deck was heard as the open crossing. The surface model is a height field: where its top
  // stands 2.5 to 14 m over the ears, at the ears and at three of the four points a metre and a half round them, something
  // is overhead (a wall beside you is over one or two of them, and a tower's top is further up than a roof is)
  const roofOver = (x, y, z) => {
    let n = 0;
    for (const [dx, dy] of [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) { const over = dsmTop(x + dx, y + dy) - z; if (over > 2.5 && over < 14) n++; else if (!dx && !dy) return false; }
    return n >= 4;
  };
  // (the landmarks' fine cells left unbuilt: a line 300 m long would have laid every tile it crossed)
  if (A.world) A.world({ edge: (sx, sy, sz, ex, ey, ez, skip = 6) => nav.withoutFine(() => hearLine(sx, sy, sz, ex, ey, ez, skip)), last: hearEdge });
  // where someone or a car beside a mapped line stands: its deck, the surface the line is on (a pier, a
  // bridge's walkway, a flight of steps: not the ground under it), or the ground drawn there (null on the bank of the water)
  const lineGround = (x, y, at) => {
    if (at.deck) return at.z;
    const s = nav.surfaceAt(x, y, at.z);
    if (s > -Infinity && Math.abs(s - at.z) < 1.5) return s;
    if (nav.offGround(x, y)) return null;
    // (a hero level's paving over the ground: nav.js lift; and paving a landmark draws over it, stood on as floorAt stands the
    // player on it: the crowd walked 5 cm under the floor of the station's passage, where the player stood on it)
    const t = nav.terrain(x, y) + nav.lift(x, y), pv = nav.paveAt(x, y);
    return pv !== undefined && pv > t && pv < t + 1.5 ? pv : t;
  };
  // footways and roads that run into a building (an arcade, a station's concourse, a street under a
  // railway station's viaduct: the model's buildings are solid from the ground up) end at its wall, so
  // the crowd and the traffic keep to each mapped line only where they can be (r: how far the line
  // keeps from a wall; overDecks: leave what is on a deck alone, a viaduct over a building included)
  function cutAtWalls(lines, r = 0.1, overDecks = false) {
    const out = [];
    for (let r0 = 0; r0 < lines.length; r0++) { // (r0: the piece's place in the lines given, kept on what is cut from it)
      const l = lines[r0];
      if (l.x) continue; // (a road the plan closes to cars, pipeline/road_plan.py: not in the traffic's graph nor the routes')
      const p = l.p, n = p.length / 3;
      let cur = null, curD = null, wallA = 0, wall = 0; // (w: 1 where a piece starts at a wall, 2 where it ends at one)
      const flush = (atWall = false) => {
        if (cur && cur.length >= 6) {
          let len = 0;
          for (let k = 3; k < cur.length; k += 3) len += Math.hypot(cur[k] - cur[k - 3], cur[k + 1] - cur[k - 2]);
          if (len >= 40) out.push(Object.assign({}, l, { p: cur, d: l.d ? Uint8Array.from(curD) : undefined, w: wallA | (atWall ? 2 : 0), r0 }));
        }
        cur = curD = null;
        if (atWall) wall = 1;
      };
      const put = (x, y, z, d) => { if (!cur) { cur = []; curD = []; wallA = wall; wall = 0; } else curD.push(d); cur.push(x, y, z); };
      for (let k = 0; k < n; k++) {
        const x = p[3 * k], y = p[3 * k + 1], z = p[3 * k + 2], deck = l.d && k > 0 ? l.d[k - 1] : 0, skip = overDecks && deck;
        if (k > 0) { // every metre and a half along the stretch from the last point
          const ax = p[3 * k - 3], ay = p[3 * k - 2], az = p[3 * k - 1], m = Math.max(1, Math.ceil(Math.hypot(x - ax, y - ay) / 15));
          for (let j = 1; j < m; j++) {
            const qx = ax + (x - ax) * j / m, qy = ay + (y - ay) * j / m, qz = az + (z - az) * j / m;
            if (!skip && nav.solid(qx / 10, qy / 10, qz / 10, r)) flush(true);
            else if (!cur) put(Math.round(qx), Math.round(qy), Math.round(qz), deck);
          }
        }
        if (!skip && nav.solid(x / 10, y / 10, z / 10, r)) flush(true);
        else put(x, y, z, deck);
      }
      flush();
    }
    return out;
  }

  // A road is painted on the ground, so a car is on the ground its road is painted on. The mapped lines carry a
  // height every 8 m (pipeline/game_data.py), and the ground between two of them, and since they were sampled,
  // is not the chord: in Shibuya 150 of 30,000 places on the roads lay 0.25 to 0.8 m under the ground drawn
  // there (a taxi sunk to its sills, the owner on a phone) and as many floated over it. So each line is laid on
  // the ground a walker would stand on (lineGround), a point every 4 m, wherever that is within a step and a
  // half of the line's own height; what is on a deck (a bridge, a viaduct) keeps the height it has.
  function onGround(lines) {
    const zOn = (x, y, z) => { const g = lineGround(x / 10, y / 10, { z: z / 10, deck: 0 }); return g == null || Math.abs(g - z / 10) > 1.5 ? z : Math.round(g * 10); };
    return lines.map(l => {
      const p = l.p, n = p.length / 3, q = [], d = [];
      for (let k = 0; k < n; k++) {
        const x = p[3 * k], y = p[3 * k + 1], z = p[3 * k + 2], deck = l.d && k > 0 ? l.d[k - 1] : 0, deckNext = l.d && k < n - 1 ? l.d[k] : 0;
        if (k > 0) {
          const ax = p[3 * k - 3], ay = p[3 * k - 2], az = p[3 * k - 1], m = deck ? 1 : Math.max(1, Math.ceil(Math.hypot(x - ax, y - ay) / 40));
          for (let j = 1; j < m; j++) { const qx = ax + (x - ax) * j / m, qy = ay + (y - ay) * j / m; q.push(Math.round(qx), Math.round(qy), zOn(qx, qy, az + (z - az) * j / m)); d.push(0); }
          d.push(deck);
        }
        q.push(x, y, deck || deckNext ? z : zOn(x, y, z));
      }
      return Object.assign({}, l, { p: q, d: l.d ? Uint8Array.from(d) : undefined });
    });
  }

  // ------------------------------------------------------------ street furniture: benches, lamps that light at night
  loadMsg('People, traffic and ferries: downloading the models every city shares', 0.86);
  await idle();
  const lin = OEWorld.lin, dummy = new THREE.Object3D();
  // the traffic keeps off the stretches of road that run through a wall (cutAtWalls); the crowd
  // walks the footways where a walker can, not through the buildings a mapped passage runs into
  // (route.js), nor through a wall
  // (against a landmark's triangles where its 2 m cells would cut the way, nav.js withoutFine: a crowd's
  // way through a gate's passage or between lanterns is kept where a walker gets through)
  const tRoad = performance.now(), footNet = OEActors.network(G.paths.foot), roadNet = OEActors.network(bakeIn('roads', () => nav.withoutFine(() => onGround(cutAtWalls(G.paths.road, 0.5, true)))));
  const roadMs = performance.now() - tRoad;
  // the planned area's edge (bounds.js, docs/BOUNDS.md): the story and the walk keep to it, on foot, by car and in the
  // air; the streets across it shut to cars, with road works on them. ?walk=1 (the builder's map) and ?bounds=off are open
  const bounds = window.OEBounds && G.bounds && !new URLSearchParams(location.search).has('walk') && new URLSearchParams(location.search).get('bounds') !== 'off'
    ? OEBounds.create({ data: G.bounds, toast: s => H.toast(s), floor: (x, y, z) => { const f = nav.floorAt(x, y, z + 1.5); return f ? f.z : null; }, reg: ((G.vehicles || {}).helicopter || {}).registration, clock: () => clockT }) : null;
  if (bounds) { bounds.closeRoads(roadNet); bounds.build(THREE, G.paths, world); }

  loadMsg('Footways people can walk', 0.84);
  await idle();
  const tFoot = performance.now(), crowdNet = OEActors.network(bakeIn('crowd', () => nav.withoutFine(() => OEActors.join(cutAtWalls(OERoute.walkable(nav, G.paths.foot, (x, y, z) => roadsNow.depth(x, y, z, 0.3) > 0)), (x, y, z) => nav.solid(x, y, z, 0.1), 1.6, (x, y, z) => { const w = nav.walk(x, y, z + 0.6, true); return w.ok && Math.abs(w.z - z) < 0.6 && nav.room(x, y, z, 0.3); })))); // (joined where the footways meet, and led round what cut them: a T with no node, or a pier in the way, was the end of the way to a walker, issue 168)
  console.info(`footways: ${Math.round(performance.now() - tFoot)} ms, the roads cut at the walls ${Math.round(roadMs)} ms`);
  // benches face their footway, or the water behind it; each has two seats the crowd can use
  const benches = nav.withoutFine(() => OEActors.benches(G.props.bench || [], crowdNet, nav)), lamps = G.props.street_lamp || [];
  const benchMesh = new THREE.InstancedMesh(OEActors.boxes([ // seat, backrest and two ends; faces +z
    [1.7, 0.06, 0.42, 0, 0.42, 0.03, 0, 0], [1.7, 0.34, 0.05, 0, 0.66, -0.2, 0, 0], [0.07, 0.42, 0.44, 0.72, 0.21, 0, 0, 0], [0.07, 0.42, 0.44, -0.72, 0.21, 0, 0, 0]]),
  new THREE.MeshStandardMaterial({ color: lin('#6e5a44'), roughness: 0.9 }), benches.list.length);
  benches.list.forEach((b, i) => { dummy.position.copy(W(b.x, b.y, b.z)); dummy.rotation.y = Math.PI - b.h; dummy.updateMatrix(); benchMesh.setMatrixAt(i, dummy.matrix); });
  benchMesh.castShadow = benchMesh.receiveShadow = true;
  const nl = lamps.length / 3;
  const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 6.5, 6).translate(0, 3.25, 0), new THREE.MeshStandardMaterial({ color: lin('#3b4248'), roughness: 0.6, metalness: 0.4 }), nl);
  const headMat = new THREE.MeshStandardMaterial({ color: lin('#d8d4c8'), emissive: lin('#ffcf8a'), emissiveIntensity: 0 });
  const headMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.18, 0.7).translate(0, 6.5, 0.25), headMat, nl);
  const glowPos = new Float32Array(nl * 3);
  for (let i = 0; i < nl; i++) {
    dummy.position.copy(W(lamps[3 * i] / 10, lamps[3 * i + 1] / 10, lamps[3 * i + 2] / 10)); dummy.rotation.y = (i * 1.7) % 6.28; dummy.updateMatrix();
    poleMesh.setMatrixAt(i, dummy.matrix); headMesh.setMatrixAt(i, dummy.matrix);
    glowPos.set([dummy.position.x, dummy.position.y + 6.35, dummy.position.z], i * 3);
  }
  poleMesh.castShadow = true;
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,214,150,1)'); gr.addColorStop(0.25, 'rgba(255,190,110,0.45)'); gr.addColorStop(1, 'rgba(255,170,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const glowMat = new THREE.PointsMaterial({ size: 9, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, sizeAttenuation: true });
  const glows = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(glowPos, 3)), glowMat);
  for (const m of [benchMesh, poleMesh, headMesh]) { OEBuildings.cellInstances(m); if (Wd.still) Wd.still(m); }
  for (const m of [benchMesh, poleMesh, headMesh]) m.userData.noRefl = true; // (out of the sea's reflection: water.js)
  world.add(benchMesh, poleMesh, headMesh);
  if (!Wd.night) world.add(glows); // night.js lights these lamps with the rest of the street lights

  // ------------------------------------------------------------ people and traffic
  // realistic characters (people.js); the box-built rigs are the fallback if their files can't be loaded
  // Kagami, whom you play, as a woman or a man (W, M): the main characters (H_Kagami_W, H_Kagami_M); where their
  // file does not load, the crowd's casual characters stand in (never a worker in a hi-vis vest: that was the surveyor)
  const PLAYER_KEY = 'bh-player', PLAYER_LOOKS = {
    W: { character: 'W_Casual', skin: '#e0b494', hair: '#2a211c', scale: 0.92 },
    M: { character: 'M_Casual2', skin: '#d9a984', hair: '#1c1714', scale: 0.97 } };
  for (const [k, v] of Object.entries(G.player_looks || {})) if (PLAYER_LOOKS[k]) Object.assign(PLAYER_LOOKS[k], v); // a city's own look for the player
  let playerChar = 'W';
  try { if (PLAYER_LOOKS[localStorage.getItem(PLAYER_KEY)]) playerChar = localStorage.getItem(PLAYER_KEY); } catch (e) { /* storage blocked */ }
  let lib = null;
  const NPC_LOAD_M = 300;
  try {
    lib = await OEPeople.load('assets/people/', { warmLater: true }); // (its warm-up given once the loader has compiled: lib.setWarm, below)
    if ((G.crowd || {}).style) OEPeople.setStyle(G.crowd.style);
    if (Wd.streetLit) OEPeople.setLight(Wd.streetLit, Wd.U && Wd.U.uFaceCap); // the street lights light the people after dark (and on the low tier the screens' pool where they stand, neon.js pooled)
  } catch (e) { console.warn('Realistic people unavailable, using simple figures:', e); lib = null; }
  // the box-built figures are the last resort, for a device that could load none of the people's
  // files: one character that fails to load (after its retries, gltf.js) leaves the rest of the
  // library in place, and whoever was to wear it wears another realistic character (stand-in)
  if (lib) {
    // Kagami is a main character (blender/build_people.py): the one you play now loads here, the other when you
    // switch; the old characters stand in if their files don't load
    for (const [k, h] of Object.entries({ W: 'H_Kagami_W', M: 'H_Kagami_M' })) if (lib.heroes[h]) PLAYER_LOOKS[k].hero = h;
    const pl = PLAYER_LOOKS[playerChar];
    if (pl.hero) await lib.require(pl.hero).then(() => Object.assign(pl, { character: pl.hero, scale: 1 })).catch(e => console.warn(`${pl.hero} unavailable:`, e));
    await lib.require(pl.character).catch(e => console.warn(`${pl.character} unavailable:`, e));
    // the NPCs' characters once the game can be played, nearest the start first (afterPlayable, issue 335), and as
    // you first come within NPC_LOAD_M of them (npcStream; issue 148)
  }
  // a character that is loaded for one that is not: of the same sex, textured (an NPC's or
  // Kagami's) before the crowd's, at its own size (the crowd's run large)
  const sexOf = c => (/^W_|Female|_W$/.test(c) ? 'W' : 'M');
  function standIn(look) {
    const want = sexOf(look.character), have = Object.keys(lib.tpl), rank = c => (sexOf(c) === want ? 0 : 4) + (/^R_/.test(c) ? 0 : /^H_/.test(c) ? 1 : 2);
    const c = have.sort((a, b) => rank(a) - rank(b))[0];
    return c && Object.assign({}, look, { character: c, scale: /^W_/.test(c) ? 0.91 : /^M_/.test(c) ? 0.96 : 1 });
  }
  const makeRig = (look, opts) => {
    const real = lib && look.character && (lib.tpl[look.character] ? look : standIn(look));
    return withFace(real ? OEPeople.person(lib, Object.assign({}, real)) : OEActors.makePerson(look, opts));
  };
  // Faces that move (face.js, issue 12): a speaking character's face (its model has the shapes, build_people.py add_face)
  // is posed after its clip each frame it is chosen for (faceChoose): who speaks, whom they speak to, and the nearest
  // one or two others the camera is close to. The rest keep a still face, and cost nothing but their shapes' memory.
  // A rig whose head turn is laid after the clip (the story's people, storyFigure) says so (faceLater) and calls
  // faceAfter itself once the turn is laid, so that the eyes look from where the head ends up.
  const faceWho = new Map();
  function withFace(rig) {
    if (!window.OEFace || !rig || !rig.root || rig.pending || rig.face !== undefined) return rig;
    const f = rig.face = OEFace.attach(rig.root, [...(rig.character || 'face')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7));
    if (f) {
      const raw = rig.animate;
      rig.animate = function (dt, ...rest) { f.before(); const out = raw.call(this, dt, ...rest); if (!rig.faceLater) faceAfter(rig, dt); return out; };
    }
    return rig;
  }
  function faceAfter(rig, dt) {
    const f = rig.face;
    if (!f) return;
    const o = faceWho.get(rig);
    if (!o) { if (f.active) f.rest(); return; }
    f.after(o.held ? 0 : dt, o);
  }
  // an NPC whose character is still to load: nobody there yet (npcStream puts them in when it has come)
  const awaited = look => lib && look.character && !lib.tpl[look.character] && (lib.npcs[look.character] || lib.heroes[look.character] || lib.info.characters[look.character]);
  const pendingRig = () => ({ root: new THREE.Group(), pending: true, animate() {} });
  const CR = G.crowd || {};
  // the nearest walkers drawn as real people (people.js crowdRenderer "real"): the city's own NPC cast, and the casts
  // game.crowd.real_from names (Shibuya's takes Tokyo's too), in their everyday clothes (no uniforms). On the low
  // tier too: the far crowd's own figures are dolls, with a doll's painted face, and close up on a phone they were
  // what the owner saw first at the Scramble. A phone has a cast of LOW_CAST, half of them women (each is two or
  // three pictures at 512 px, 256 on the lighter sets: about 4 MB of the GPU a character, quality.js budget)
  // The far crowd is the same cast (people.js lib.far, issue 475), one instanced draw a cast member in the view and
  // again in each shadow pass, so the other tiers' cast is held to HIGH_CAST: twenty (issue 77: with twelve, a view of two
  // hundred people at the Scramble saw one body twenty times; the far copies of twenty are 0.7 MB, in one draw each)
  const LOW_CAST = 8, HIGH_CAST = 20;
  const realCast = () => {
    if (!lib || !lib.npcs || CR.real === false || /[?&]realcrowd=off/.test(location.search)) return null;
    const tier = QC.name !== 'low' ? HIGH_CAST : QC.budget && QC.budget.cast ? Math.min(LOW_CAST, QC.budget.cast) : LOW_CAST;
    // a map names who is on its streets (game.crowd.cast: {f, m}, in order): its own people in everyday clothes, the
    // visitors a place like it has, any character built for any map. Before, the cast was the story's NPCs in the
    // order of their names, which put the office suits first, and a crossing was six suits and their copies
    // and nobody in it wears the face of the one you play (Kagami, as a woman or a man: their head is a cast member's,
    // and a walker at your elbow with your face and hair was your twin in the street), or is one of the people the
    // story names (an old woman in Sumiko's cardigan crossing beside her, or a second Akira, is a clue that lies)
    const faceOf = c => c && (c.head || c.avatar), mine = new Set(Object.values(lib.heroes || {}).map(faceOf).filter(Boolean));
    const named = new Set();
    (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'character' && typeof v === 'string') named.add(v); else walk(v); } })(G.story);
    const walks = n => lib.npcs[n] && !mine.has(faceOf(lib.npcs[n])) && !named.has(n);
    if (CR.cast) { const pick = k => (CR.cast[k] || []).filter(walks); return pick('f').slice(0, Math.ceil(tier / 2)).concat(pick('m').slice(0, Math.floor(tier / 2))); }
    const from = new Set([cityId, ...(CR.real_from || [])]);
    const all = Object.entries(lib.npcs).filter(([n, c]) => (c.cities || []).some(x => from.has(x)) && walks(n) && !/Police|Pilot|Security|Construction|Delivery|Gardener|Worker|Nurse|Chef/.test(n)).map(([n]) => n);
    const cast = QC.name !== 'low' ? HIGH_CAST : QC.budget && QC.budget.cast ? Math.min(LOW_CAST, QC.budget.cast) : LOW_CAST; // (fewer on a phone's lighter sets: quality.js level)
    if (all.length <= cast) return all;
    const f = all.filter(n => lib.npcs[n].sex === 'f'), m = all.filter(n => lib.npcs[n].sex !== 'f');
    return f.slice(0, cast / 2).concat(m.slice(0, cast - Math.min(f.length, cast / 2)));
  };
  let crowdDraw = null; // the crowd's renderer (people.js), for umbrellas in the rain
  // the stair wells of the subway's entrances (the landmarks' ground clips marked "well"): the crowd is not put
  // in one and does not walk the stub of footway that ends in it, for as long as the station under it cannot be
  // entered (nothing to stand on down the stairs: the walkers hung in the air over them). An entrance that is
  // built through drops the mark in its city's landmarks (cities/shibuya/scramble.py) and the crowd uses it again.
  const WELLS = ((D.LM && D.LM.clip) || []).filter(c => c.well && c.ring && c.ring.length >= 3).map(c => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [x, y] of c.ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { ring: c.ring, x0: x0 - 0.5, x1: x1 + 0.5, y0: y0 - 0.5, y1: y1 + 0.5 };
  });
  const wellAt = WELLS.length ? (x, y) => {
    for (const w of WELLS) {
      if (x < w.x0 || x > w.x1 || y < w.y0 || y > w.y1) continue;
      const r = w.ring; let inside = false, near = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const ax = r[i][0], ay = r[i][1], bx = r[j][0], by = r[j][1];
        if ((ay > y) !== (by > y) && x < ax + (bx - ax) * (y - ay) / (by - ay)) inside = !inside;
        const ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
        if (Math.hypot(x - ax - ex * t, y - ay - ey * t) < 0.5) near = true; // (nor on its rim)
      }
      if (inside || near) return true;
    }
    return false;
  } : null;
  // the box-built fallback figures can't sit, so only the realistic crowd uses the benches
  // the walkers there are room for: on the medium and high tiers a city's peak (game.crowd.pedestrians_peak),
  // on the low tier its usual number, so a phone draws no more people than it did
  const crowdPool = QC.name === 'low' ? CR.pedestrians || 300 : CR.pedestrians_peak || CR.pedestrians || 300;
  const crowd = OEActors.crowd(world, crowdNet, U, crowdPool, CR.radius_m || 450, lib && (P => (crowdDraw = OEPeople.crowdRenderer(world, lib, U, P, { near: touch ? 10 : QC.name === 'high' ? 24 : 14, stillNear: touch ? 24 : 40, style: CR.style, camera, real: realCast(), realHeight: CR.height, ...(QC.lean ? { coarseM: 24, farM: 260 } : {}) }))),
    { benches: lib ? benches : null, ground: lineGround, wall: (x, y, z) => nav.solid(x, y, z, 0.2) || (wellAt && wellAt(x, y)) || (bounds && Math.abs(bounds.sd(x, y).s) < 0.8), posts,
      clear: wellAt ? (x, y, z) => nav.room(x, y, z, 0.3) && !wellAt(x, y) : (x, y, z) => nav.room(x, y, z, 0.3), eye: camera, shut: wellAt, sight: (x, y, z) => nav.solid(x, y, z, 0.2) }); // (a shut well is a wall to the crowd: nobody cuts across its mouth)
  // the side of the road the city keeps to: game.keep, its trams', or the country's rule
  const KEEP = G.keep || ((G.rail || {}).tram || {}).keep || (/^(Australia|Japan|United Kingdom|Ireland|New Zealand|Singapore|Malaysia|Indonesia|Thailand|India|South Africa)$/.test(CITY.country)
    || /^(Hong Kong|Macau)/.test(CITY.name) ? 'left' : 'right');
  // the junctions and their rules (junctions.js): the mapped signals, stop and give-way signs, and the signal heads
  const junctions = OEJunctions.create(roadNet, { signals: G.props.traffic_signals || null, stops: G.props.stop || [], giveWay: G.props.give_way || [], keep: KEEP, lane: OECars.LANE,
    midCrossings: { signals: G.props.crossing_signals, zebra: G.props.crossing_zebra },
    // (and the crossings between junctions: signals or zebra stripes); the scrambles, every way at once in
    // a phase of their own: Shibuya's with its mapped crosswalks (scene landmarks), the others a city names
    // (the Scramble's crosswalks from kerb to kerb as surveyed where the map has them, road_ground.x: the crowd waits at their ends)
    scrambles: [(scene.landmarks || {}).scramble && RG && RG.x ? Object.assign({}, scene.landmarks.scramble, { lines: RG.x }) : (scene.landmarks || {}).scramble, ...(G.scrambles || [])].filter(Boolean), foot: crowdNet });
  // a main road whose second lane runs into a solid somewhere between its junctions (a tower beside an
  // expressway's deck, Sydney's Cahill Expressway past one at 33 m, issue 119; the data's lanes are where
  // the line is, not where the second lane is) has one lane there, so no car waits at the facade for room
  // in the first
  const tSweep = performance.now(), oneIdx = [];
  if (BK && BK.one) { for (const i of BK.one) roadNet.L[i].lanes = 1; junctions.oneLane = BK.one.length; } else
  { const side = KEEP === 'right' ? -1 : 1, q = {}, RL = roadNet.L;
    let one = 0;
    nav.withoutFine(() => { for (let i = 0; i < RL.length; i++) {
      const l = RL[i];
      if (junctions.lanesOf(l) < 2 || l.len < 30) continue;
      const lane = side * (OECars.LANE + junctions.shiftOf(l, 1));
      let hit = false;
      for (let s = 12; s <= l.len - 12 && !hit; s += 4) {
        roadNet.at(i, s, q);
        const z = (q.deck ? q.z : lineGround(q.x, q.y, q)) ?? q.z;
        for (const dir of l.ow ? [l.ow] : [1, -1]) {
          const hx = q.hx * dir, hy = q.hy * dir, x = q.x - hy * lane, y = q.y + hx * lane;
          if (!nav.room(x, y, z, 0.75, 1.4, !!q.deck)) { hit = true; break; }
        }
      }
      if (hit) { l.lanes = 1; one++; oneIdx.push(i); }
    } });
    junctions.oneLane = one; }
  // the roads' half-widths as the game draws them
  // how wide a vehicle each lesser street has room for (#202): along each street of a lane each way or
  // narrower, every 3 m (clear of its ends, where the junction's corners are), the widest body (most of its
  // width, knee to 1.4 m, as tools/game_check.js counts a car in a wall) that its lane has room for, the
  // least of them kept per street. The traffic keeps a vehicle wider than that off the street (actors.js
  // fits): a bus or a van doesn't turn into a lane between two facades it would scrape
  if (BK && BK.fit) roadNet.fit = Float32Array.from(BK.fit); else
  { const side = KEEP === 'right' ? -1 : 1, q = {}, RL = roadNet.L, R = [1.15, 1.0, 0.9, 0.8, 0.72, 0.64];
    const fit = roadNet.fit = new Float32Array(RL.length).fill(9);
    nav.withoutFine(() => { for (let i = 0; i < RL.length; i++) {
      const l = RL[i];
      if (rwOf(l) / 2 > 3.5 || junctions.lanesOf(l) > 1 || l.len < 12) continue;
      const lane = side * (OECars.LANE + junctions.shiftOf(l, 0));
      let k = 0; // (the widest still passing: the samples only ever narrow it)
      for (let s = 5; s <= l.len - 5 && k < R.length; s += 3) {
        roadNet.at(i, s, q);
        const z = (q.deck ? q.z : lineGround(q.x, q.y, q)) ?? q.z;
        for (const dir of l.ow ? [l.ow] : [1, -1]) {
          // (in its lane, or edged in towards the middle as a car between two facades is, actors.js narrow)
          let best = R.length;
          for (const f of [1, 0.5, 0]) {
            const hx = q.hx * dir, hy = q.hy * dir, x = q.x - hy * lane * f, y = q.y + hx * lane * f;
            let kk = k;
            while (kk < best && !nav.room(x, y, z, R[kk], 1.4, !!q.deck)) kk++;
            best = kk;
            if (best === k) break;
          }
          k = best;
        }
      }
      fit[i] = k === 0 ? 9 : k < R.length ? R[k] / 0.8 : 0; // (as a vehicle's half-width: most of it, 0.8, must have room)
    } }); }
  bakeMs += performance.now() - tSweep;
  if (bakeOut) { bakeOut.v.one = oneIdx; bakeOut.v.fit = Array.from(roadNet.fit); bakeOut.ms = bakeMs; bakeOut.done = true; }
  console.info(`set-up's fixed work: ${Math.round(bakeMs)} ms, ${BK ? 'from the bake' : 'computed'}`);
  junctions.build(world, { style: Object.assign({ country: CITY.country }, G.signals || {}), ground: lineGround, eye: camera, clear: (x, y, z, r) => roadsNow.kerbside(x, y, z, r, 6, true) });
  // the signal poles, the walk-signal posts and the columns under the decks are solid too
  { const H = junctions.heads;
    for (const o of (H && H.list) || []) posts.add(o.x, o.y, o.z, 0.09, 'signal');
    for (const o of (H && H.peds) || []) posts.add(o.x, o.y, o.z, 0.07, 'signal');
    for (const r of deckPlan.runs) for (const c of r.cols || []) {
      if (c.beam || c.z0 < -1) continue; // (a portal's beam is overhead; a column in the water is the boats' business)
      const rr = Math.min(c.hx, c.hy), long = Math.max(c.hx, c.hy) - rr, ux = c.hx > c.hy ? c.ex : -c.ey, uy = c.hx > c.hy ? c.ey : c.ex;
      for (let u = -long; u <= long + 1e-6; u += Math.max(0.3, rr)) posts.add(c.x + ux * u, c.y + uy * u, c.z0 + 0.3, rr, 'column');
    } }
  if (junctions.heads && junctions.heads.walkPosts) for (const q of junctions.heads.walkPosts) posts.add(q.x, q.y, q.z, 0.09, 'lamp'); // (a scramble's walk signals stand beside its crosswalks: walked round)
  // (is (x, y) in a carriageway, as the game draws the roads? nobody waits there)
  const onRoadQ = {}, onRoad = (x, y) => { const q = roadNet.nearD(x, y, 8, onRoadQ); return !!q && q.d < rwOf(roadNet.L[q.line]) / 2 + 0.3; }; // (nearD: nearest()'s answer without its lists, asked several times a person a frame)
  // the crowd waits at the kerb for the walk signal where its footways cross a junction's roads
  // (and where a footway steps onto a road with no crossing marked, the crowd looks for a gap in the traffic:
  // road says what is carriageway, zebra where a zebra's stripes are, the cars giving way there instead)
  const zebraAt = (x, y) => { const q = roadNet.nearest(x, y, 9); const M = q && junctions.midsOn ? junctions.midsOn(q.line) : null; return !!(M && M.some(X => Math.abs(X.mid - q.s) < 9)); };
  const aq = {}, acrossRoad = (x, y, hx, hy) => { const q = roadNet.nearest(x, y, 10); if (!q) return false; roadNet.at(q.line, q.s, aq); return Math.abs(hx * aq.hy - hy * aq.hx) > 0.5; }; // (at 30° or more to the road)
  // (a major road, crossed only at a crosswalk: a class from tertiary up, or two lanes or more each way; a
  // scramble's own streets are its crowd's, which crosses them on its walk)
  const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
  const majorAt = (x, y) => { const q = roadNet.nearest(x, y, 10); if (!q) return false; const l = roadNet.L[q.line]; return MAJOR.has(l.c) || (junctions.lanesOf ? junctions.lanesOf(l) : l.nl || 1) >= 2; };
  crowd.crossings = { byLine: junctions.crossings(crowdNet, onRoad), walk: junctions.walk, walkLeft: junctions.walkLeft, call: junctions.call, road: onRoad, zebra: zebraAt, across: acrossRoad, major: majorAt };
  // (the crowd was first placed before it knew which roads are major: one standing out in one, away from a crossing, is
  // placed again, as a walker placed later is, so that it doesn't start the game crossing where nobody crosses)
  { const X = crowd.crossings.byLine, at = {};
    for (const p of crowd.P) { if (p.line < 0) continue; crowdNet.at(p.line, p.s, at); if (onRoad(at.x, at.y) && majorAt(at.x, at.y) && !((X.get(p.line) || []).some(q => Math.abs(q.s - p.s) < q.kerb + 0.5))) crowd.respawn(p, at.x, at.y, 0); } }
  // and gathers at the scrambles: a share of it their own, massing at the kerbs and surging across
  // every way at once (actors.js plazas), and more of it on the footways round them
  { const S = junctions.J.filter(j => j.scramble && j.spans && j.spans.length);
    if (S.length) {
      crowd.plazas = S.map(j => { const a = j.arms.find(q => q.in) || j.arms[0]; return (j.plaza = { j, x: j.x, y: j.y, spans: j.spans, weight: j.mapped3 ? 8 : 1, road: onRoad, walk: () => junctions.walk(a), left: () => junctions.walkLeft(a) }); });
      // (the share by each one's weight, as the plazas' is: the landmark's crossing, Shibuya's, gathers a fifth of the
      // crowd round it, five or six times the density of the map's footways on average, as the station's half a million a
      // day make it; split evenly, it had the same 3% as a side street's small scramble, and Hachiko's square stood empty)
      const sw = crowd.plazas.reduce((a, p) => a + p.weight, 0);
      crowd.hot = crowd.plazas.map(p => ({ x: p.x, y: p.y, r: 90, share: (p.weight > 1 ? 0.3 : 0.16) * p.weight / sw, pull: 0.5 }));
    } }
  const cars = OEActors.traffic(world, roadNet, U, CR.cars || 120, (CR.radius_m || 450) + 100, { lib: vlib, cfg: Object.assign({ parked: CITY.country === 'Japan' ? 0.05 : 0.16 }, (G.vehicles || {}).cars), eye: camera, keep: KEEP, ground: lineGround, crowd, nav, posts, junctions, stops: G.props.bus_stop || null });
  const density = { low: 0.35, normal: 1, high: 1 };
  const playerLook = () => Object.assign({ shirt: '#2f4858', pants: '#2b3440', skin: '#e0ac85', hair: '#3b2a20' }, PLAYER_LOOKS[playerChar]);
  const player = { rig: makeRig(playerLook()),
    x: 0, y: 0, z: 0, h: 0, vz: 0, speed: 0, ground: true, floor: 'ground', mode: 'foot', vehicle: null, auto: null, walking: false };
  world.add(player.rig.root);
  let wantChar = null;
  async function setPlayerCharacter(name) { // swap the player's character in place
    if (!lib || !PLAYER_LOOKS[name]) return;
    // (the choice is kept at once, and the last one asked for is the one swapped in: a model still loading when the
    // other was chosen came in after it and stood in its place, and the choice a player made was not the one kept)
    wantChar = name;
    try { localStorage.setItem(PLAYER_KEY, name); } catch (e) { /* storage blocked */ }
    const pl = PLAYER_LOOKS[name];
    if (pl.hero && pl.character !== pl.hero) await lib.require(pl.hero).then(() => Object.assign(pl, { character: pl.hero, scale: 1 })).catch(e => console.warn(`${pl.hero} unavailable:`, e));
    await lib.require(pl.character).catch(() => {});
    if (wantChar !== name) return;
    playerChar = name;
    const old = player.rig, parent = old.root.parent, rig = makeRig(playerLook());
    rig.root.position.copy(old.root.position); rig.root.rotation.copy(old.root.rotation);
    rig.legRake = old.legRake; rig.reach = old.reach; // in a seat, the same way
    if (parent) { parent.remove(old.root); parent.add(rig.root); }
    player.rig = rig;
  }
  const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const npcs = [];
  // the old characters run large; the Rocketbox ones (R_) are life size
  const npcLook = n => Object.assign({ scale: /^W_/.test(n.look.character) ? 0.91 : /^M_/.test(n.look.character) ? 0.96 : 1 }, n.look);
  // where someone stands at (at): on the ground, or a strip or roof below 200 m (not up on a viaduct passing over), or
  // at the height given; off a bank sloping into the water, out of the road (and the room a car pulls in to at the
  // kerb), clear of the lamp posts, trunks and benches, and not on someone else's toes (self: the one moving)
  function npcSpot(n, at, self = null) {
    const others = q => q !== self && Math.hypot(q.x - at[0], q.y - at[1]) < 40;
    const near = npcs.filter(others);
    let f = nav.floorAt(at[0], at[1], at[2] != null ? at[2] + 1 : Math.max(200, nav.terrain(at[0], at[1]) + 1));
    if (f && f.kind === 'deck' && at[2] == null) f = nav.floorAt(at[0], at[1], nav.terrain(at[0], at[1]) + 1);
    const z0 = f ? f.z : Math.max(0, nav.terrain(at[0], at[1]));
    const clear = (x, y) => !near.some(q => Math.hypot(q.x - x, q.y - y) < 1.2) && !inRoad(x, y, z0, 0.3) && !posts.pushOut(x, y, 0.45, z0).hit
      && !benches.list.some(b => Math.abs(b.z - z0) < 1.5 && Math.abs((x - b.x) * Math.sin(b.h) + (y - b.y) * Math.cos(b.h)) < 0.6 && Math.abs(-(x - b.x) * Math.cos(b.h) + (y - b.y) * Math.sin(b.h)) < 1.2);
    return nav.stand(at[0], at[1], z0 + (f ? 0.5 : 1), { rMax: 15, ok: clear }) || nav.stand(at[0], at[1], z0 + (f ? 0.5 : 1),
      { rMax: 15, ok: (x, y) => !near.some(q => Math.hypot(q.x - x, q.y - y) < 1.2) }) || { x: at[0], y: at[1], z: f ? f.z : 0 };
  }
  // someone who keeps another place at this hour (life.json bonds[].places, bonds.js): stood there, facing face
  // (a bearing in radians) or as they were. Not one seated or stood at an exact place by the data
  function npcMove(n, at, face = null) {
    if (n.sit || n.stand || n.talking) return false;
    if (n.post) posts.move(n.post, 1e7, 1e7, 0); // (out of their own way)
    const p = npcSpot(n, at, n);
    n.x = p.x; n.y = p.y; n.z = p.z;
    if (face != null) n.h = face;
    n.rig.root.position.copy(W(n.x, n.y, n.z));
    n.rig.root.rotation.y = Math.PI - n.h;
    if (n.post) posts.move(n.post, n.x, n.y, n.z);
    return true;
  }
  for (const n of G.npcs) {
    const rig = awaited(n.look) ? pendingRig() : makeRig(npcLook(n));
    world.add(rig.root);
    // on the ground, or a strip or roof below 200 m (not up on a viaduct passing over), or at the height given;
    // off a bank sloping into the water, out of the road (and the room a car pulls in to at the kerb), clear
    // of the lamp posts, trunks and benches, and not on someone else's toes
    // seated (game.json npcs[].sit, at a restaurant's table or in a pew: at its place exactly, the chair's seat over
    // the root, facing sit.face), else stood where there is room
    const p = (n.sit || n.stand) && n.at[2] != null ? { x: n.at[0], y: n.at[1], z: n.at[2] } /* ("stand": on their feet at that place exactly, facing stand.face: behind a bar, on a stage) */ : npcSpot(n, n.at);
    const o = Object.assign({}, n, { rig, x: p.x, y: p.y, z: p.z, h: (n.sit || n.stand || {}).face ? Math.atan2((n.sit || n.stand).face[0], (n.sit || n.stand).face[1]) : hash(n.id) % 628 / 100, pitch: 150 + hash(n.id) % 170, color: n.look.top || n.look.shirt, eyes: new THREE.Vector3(),
      marker: OEActors.sprite('!', { bg: '#e0a21a', fg: '#1b1b1b', font: '900 44px "Public Sans", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif' }) });
    o.marker.scale.multiplyScalar(1.4);
    o.marker.visible = false; // (shown only by npcMarks, under the rules every mark keeps: marks.js)
    o.marker.position.set(0, n.sit ? 1.95 : 2.45, 0);
    rig.root.add(o.marker);
    rig.root.position.copy(W(o.x, o.y, o.z));
    rig.root.rotation.y = Math.PI - o.h;
    npcs.push(o);
    // (someone of the walk's own, game.json npcs[].walk: out on the walk only, walkPeople. In the story they are not
    // there at all, neither drawn nor in the crowd's way nor loaded)
    if (n.walk) { rig.root.visible = false; o.away = true; continue; }
    o.post = posts.add(o.x, o.y, o.z, 0.22, 'npc'); // (where they stand: the crowd walks round them, not through them)
  }
  // the walk's own people out on the street (startWalk, walkOnFromStory): drawn, and in the crowd's way
  function walkPeople() {
    for (const n of npcs) if (n.away && !n.event) { n.away = false; n.rig.root.visible = true; n.post = posts.add(n.x, n.y, n.z, 0.22, 'npc'); } // (a street moment's people stay away until one puts them out: walktalk.js events)
  }
  const npcById = id => npcs.find(n => n.id === id);
  // the free game's mark over someone with something for you (?walk=1, goals.js): as every mark is (marks.js), within
  // talking distance and on your level, in sight, and not where you or anyone nearer the eye stands in front of it; the
  // sprite is in the world, depth-tested, and fades in over its last metres
  const NPC_MARK_M = 18;
  function npcMarks(hide) {
    for (const n of npcs) {
      const m = n.marker;
      let a = 0;
      if (!hide && !n.away && n.rig.root.visible && player.mode === 'foot' && wantsTalk(n) && Math.abs(n.z - player.z) < 4) {
        const v = marks.see(n.x, n.y, n.z + m.position.y, { pad: 12, self: n, key: `npc:${n.id}` });
        if (!v.why) a = marks.fade(v.d, NPC_MARK_M, 5);
      }
      m.material.opacity += (a - m.material.opacity) * 0.25;
      if (a === 0 && m.material.opacity < 0.03) m.material.opacity = 0;
      m.visible = m.material.opacity > 0;
    }
  }
  // an NPC's character, loaded and put in their place (or another realistic one if it can't be loaded)
  const npcLoad = n => n.loading || (n.loading = !n.rig.pending ? Promise.resolve() : lib.require(n.look.character).catch(e => console.warn(`${n.look.character} unavailable:`, e)).then(() => {
    const old = n.rig, rig = makeRig(npcLook(n));
    rig.root.position.copy(old.root.position); rig.root.rotation.copy(old.root.rotation);
    // (posed before it is put in the world, as the next frame will pose it: come in its bind pose while time was held,
    // the first held frame turned its head 0.055 rad to the clip's, and the Stop's check saw Yuna's head turn by itself
    // when the case was taken up at frame 4 and her character came late: issue 76, tools/head_spin.js)
    let now = 0; try { now = clockT; } catch (e) { /* (come before the game's clock is: the load's) */ }
    rig.animate(0, 0, n.sit ? 'sit' : n.talking ? 'talk' : 'ground', now + n.pitch);
    rig.root.add(n.marker);
    if (n.away) rig.root.visible = false; // (the walk's own, while it is not the walk)
    if (old.root.parent) old.root.parent.remove(old.root);
    world.add(rig.root);
    n.rig = rig;
  }));
  let npcBudget = 0;
  function npcStream(dt, cx, cy) { // twice a second: those within NPC_LOAD_M of you
    if ((npcBudget -= dt) > 0) return;
    npcBudget = 0.5;
    // (and each one standing near you on the floor as it now is: the hero level's floors are laid after the NPCs are
    // placed, and one placed on the slab under them stood in the planks, Yuna 8 cm into the sky lobby's for the whole
    // story, issue 157. Not one seated or stood at an exact place, nor one walking)
    for (const n of npcs) {
      if (n.away || n.sit || n.stand || n.walkSpeed || Math.abs(n.x - cx) > 40 || Math.abs(n.y - cy) > 40) continue;
      const f = nav.floorAt(n.x, n.y, n.z + 0.3);
      if (f && Math.abs(f.z - n.z) > 0.01 && Math.abs(f.z - n.z) < 0.3) { n.z = f.z; n.rig.root.position.copy(W(n.x, n.y, n.z)); if (n.post) posts.move(n.post, n.x, n.y, n.z); }
    }
    if (QC.lean) { // a phone: one at a time, the nearest first (each is pictures decoded, resized and sent: see afterPlayable)
      if (npcBusy) return;
      let best = null, bd = NPC_LOAD_M;
      for (const n of npcs) if (n.rig.pending && !n.loading && !n.away) { const d = Math.hypot(n.x - cx, n.y - cy); if (d < bd) { bd = d; best = n; } }
      if (best) { npcBusy = true; npcLoad(best).then(() => { npcBusy = false; }); }
      return;
    }
    for (const n of npcs) if (n.rig.pending && !n.loading && !n.away && Math.hypot(n.x - cx, n.y - cy) < NPC_LOAD_M) npcLoad(n);
  }
  let npcBusy = false;
  const npcsReady = () => Promise.all(npcs.filter(n => !n.away).map(npcLoad)); // every NPC in place (for the tools that look at them; not the walk's own until it is the walk: a phone's memory check loaded them where play never does)

  // ------------------------------------------------------------ vehicles
  const vopts = { lib: vlib, cfg: G.vehicles || {}, city: CITY, U, camera, renderer, water: Wd.sea, compile: compileFor, upload: uploadFor, searchlight: earlyLamps.search };
  // a pad the data puts on the ground inside a building's footprint is on its roof (a hospital's, a
  // tower's): there, if the roof is clear above for the rotor, else on the nearest open ground with
  // clear sky (pipeline/game_data.py snaps new data the same way)
  for (const p of G.helipads) {
    const [x, y, z] = p.at, top = nav.col.topAt(x, y, Infinity, nav.BUILDING);
    if (!(top > z + 2)) continue;
    if (nav.free(x, y, top + 0.3, top + 600, 5)) { p.at = [x, y, top]; continue; }
    let best = null;
    for (let r = 4; r <= 120 && !best; r += 4) for (let k = 0, n = Math.ceil(2 * Math.PI * r / 4); k < n && !best; k++) {
      const a = 2 * Math.PI * k / n, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r, f = nav.floorAt(px, py, nav.terrain(px, py) + 0.5);
      if (f && f.kind === 'ground' && !nav.offGround(px, py) && Math.abs(nav.groundBelow(px, py, f.z + 1) - f.z) < 0.5 && nav.free(px, py, f.z + 0.3, f.z + 600, 6)) best = [px, py, f.z];
    }
    if (best) p.at = best.map(v => Math.round(v * 10) / 10);
  }
  const padAt = (G.helipads[0] || { at: [G.start.at[0] + 20, G.start.at[1], 2] }).at;
  const heli = OEVehicles.helicopter(world, nav, padAt, vopts);
  if (G.helipads[0] && G.helipads[0].heading != null) heli.st.h = G.helipads[0].heading * Math.PI / 180;
  // One helicopter serves every pad. It starts on the first, by the start; walk (or ride) towards
  // another pad while it stands shut down far out of sight, and it is waiting there when you
  // arrive, as a pilot's quest expects (the pad within 300 m of you, it more than 700 m away).
  let padCheck = 0;
  function heliToPad() {
    if ((padCheck -= 1) > 0) return;
    padCheck = 30; // every half second or so
    const st = heli.st;
    if (!heli.loaded() && Math.hypot(st.x - player.x, st.y - player.y) < (QC.budget && QC.budget.extras === false ? 150 : 800)) heli.want(); // its model, once you are near it
    if (!st.landed || st.on || st.rotor > 0.02 || st.door > 0 || Math.hypot(st.x - player.x, st.y - player.y) < 700) return;
    for (const p of G.helipads) {
      if (Math.hypot(p.at[0] - player.x, p.at[1] - player.y) > 300 || Math.hypot(p.at[0] - st.x, p.at[1] - st.y) < 20) continue;
      Object.assign(st, { x: p.at[0], y: p.at[1], z: p.at[2], vx: 0, vy: 0, vz: 0, yawRate: 0, pitch: 0, roll: 0, speed: 0, under: null });
      if (p.heading != null) st.h = p.heading * Math.PI / 180;
      heli.update(0, {}, []);
      return;
    }
  }
  // The helicopter set down on a road (a street, a junction, the crossing) is an obstacle to everything that uses it, as a
  // car stopped there is (issue: the traffic drove through it). heliBlock() is its footprint as the road reads it: one box
  // round the hull, cabin and tail boom, and round the whole rotor disc (turning, or stopped and drooping over a bus's
  // roof; and a car queued up to its hull was under the blades as they spooled up), half a metre to spare,
  // facing the way it faces; null when it is not down on a road (up in the air over the cars, on a pad, on a roof, out
  // of sight). The traffic (cars.extra, below), the rides and the autopilot (rides.js inTheWay) and the crowd (actors.js,
  // stepped out of an api.extra's box) all read it; your own car hits its hull boxes (carBoxes).
  const HELI_ROTOR = ((vlib && vlib.info && vlib.info.helicopter) || {}).rotor_radius_m || 5.1;
  let heliRoadAt = null, heliRoad = false;
  function heliOnRoad(z = heli.st.z) {
    const st = heli.st;
    if (!heliRoadAt || Math.hypot(st.x - heliRoadAt[0], st.y - heliRoadAt[1]) > 0.5 || Math.abs(z - heliRoadAt[2]) > 0.5) {
      heliRoadAt = [st.x, st.y, z];
      heliRoad = inRoad(st.x, st.y, z, HELI_ROTOR + 1) && !G.helipads.some(p => Math.hypot(p.at[0] - st.x, p.at[1] - st.y) < 15 && Math.abs(p.at[2] - z) < 4);
    }
    return heliRoad;
  }
  function heliBlock() {
    const st = heli.st;
    if (heliHome && heliHome.phase !== 'spool' && heliHome.phase !== 'up') return null; // (drawn or not: a stand-in waiting on its model is in the road all the same)
    const g0 = nav.groundBelow(st.x, st.y, st.z + 0.5);
    if (st.z - g0 > (st.landed || heliHome ? 4 : 8) || !heliOnRoad(g0)) return null; // (coming down, held off from 8 m up, time for a car at speed to stop short; lifting off, 4 m up, its skids over a bus's roof, the road is the road's again)
    const fx = Math.sin(st.h), fy = Math.cos(st.h);
    let a0 = -2.5, a1 = 2.5, b0 = -1.3, b1 = 1.3, top = 3.6;
    for (const q of heli.boxes()) {
      const dx = q.x - st.x, dy = q.y - st.y, a = dx * fx + dy * fy, b = -dx * fy + dy * fx;
      a0 = Math.min(a0, a - q.hl); a1 = Math.max(a1, a + q.hl); b0 = Math.min(b0, b - q.hw); b1 = Math.max(b1, b + q.hw); top = Math.max(top, q.z - st.z + q.top);
    }
    { a0 = Math.min(a0, -HELI_ROTOR); a1 = Math.max(a1, HELI_ROTOR); b0 = Math.min(b0, -HELI_ROTOR); b1 = Math.max(b1, HELI_ROTOR); }
    const m = 0.5, ac = (a0 + a1) / 2, bc = (b0 + b1) / 2;
    return { id: 'heli', x: st.x + fx * ac - fy * bc, y: st.y + fy * ac + fx * bc, z: st.z, h: st.h, half: (a1 - a0) / 2 + m, hw: (b1 - b0) / 2 + m, top };
  }
  // Left on a road, it does not stay there: once you have walked away from it (30 m off for 8 s, or 12 m off for a minute
  // and a half; never while you stand beside it), its pilot takes it home to SHIBUYA SKY's roof, as an open world's
  // vehicles go back where they belong. In sight, it starts up, lifts straight up off the street the way it came down,
  // turns for the roof, climbs over everything between (the roofs under its way, sampled a rotor and more to either
  // side, with 25 m to spare: tools/flight_clear.py's margins), crosses and comes down onto its pad; out of sight it is
  // put back there unseen. A pad or a roof is parking, not blocking: it is left where it is.
  const HELI_HOME = G.helipads[0] || null;
  let heliFree = null; // (the cars caught under it as it came down: the traffic's pass below)
  let heliHome = null, heliAwayT = 0, heliParkT = 0, heliHomeWhy = '', heliHomeLast = ''; // (why it has not gone yet, for tools/heli_park.js)
  const heliHomeF = new THREE.Frustum(), heliHomeM = new THREE.Matrix4(), heliHomeS = new THREE.Sphere();
  function heliSeen() {
    const st = heli.st;
    if (Math.hypot(st.x - camera.position.x, st.y + camera.position.z) > 600) return false;
    camera.updateMatrixWorld(); // (as it stands now, not as the last frame drew it)
    heliHomeF.setFromProjectionMatrix(heliHomeM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    return heliHomeF.intersectsSphere(heliHomeS.set(W(st.x, st.y, st.z + 1.5), 8));
  }
  function heliHomeNow() {
    const st = heli.st, p = HELI_HOME.at;
    Object.assign(st, { x: p[0], y: p[1], z: p[2], vx: 0, vy: 0, vz: 0, yawRate: 0, pitch: 0, roll: 0, speed: 0, fwd: 0, lift: 0, under: null, on: false, landed: true, scripted: false });
    if (HELI_HOME.heading != null) st.h = HELI_HOME.heading * Math.PI / 180;
    heli.place(); heliHome = null; heliRoadAt = null;
  }
  function heliHomeStep(dt) {
    const st = heli.st;
    if (!HELI_HOME) return;
    if (!heliHome) {
      if (player.mode === 'heli' || heliWait || heliAway || st.on || !st.landed || st.door > 0 || !heliBlock()) { heliHomeWhy = player.mode === 'heli' ? 'flown' : heliWait || heliAway ? 'story' : st.on ? 'on' : !st.landed ? 'up' : st.door > 0 ? 'door' : `off the road at ${st.x.toFixed(1)}, ${st.y.toFixed(1)}, ${st.z.toFixed(2)} over ${nav.groundBelow(st.x, st.y, st.z + 0.5).toFixed(2)}`; heliAwayT = heliParkT = 0; return; }
      const d = Math.hypot(st.x - player.x, st.y - player.y) + (player.mode === 'foot' ? Math.max(0, Math.abs(st.z - player.z) - 3) * 3 : 0);
      if (d < 12) { heliHomeWhy = 'you beside it'; heliAwayT = heliParkT = 0; return; }
      heliParkT += dt; heliAwayT = d > 30 ? heliAwayT + dt : 0;
      heliHomeWhy = 'waiting';
      if (heliAwayT < 8 && heliParkT < 90) return;
      heliAwayT = heliParkT = 0;
      // (straight up from where it stands: anything over it, a viaduct, a deck, an awning, and it waits to be put back unseen)
      let over = false;
      for (let k = 0; k < 9; k++) { const a = k * Math.PI / 4, r = k < 8 ? HELI_ROTOR : 0, x = st.x + Math.sin(a) * r, y = st.y + Math.cos(a) * r; if (nav.groundBelow(x, y, st.z + 400) > st.z + 1.5) over = true; }
      if (!heliSeen() || over) { heliHomeWhy = heliHomeLast = over ? 'something over it' : `put back unseen (the camera ${Math.hypot(st.x - camera.position.x, st.y + camera.position.z).toFixed(0)} m off, at ${camera.position.x.toFixed(0)}, ${(-camera.position.z).toFixed(0)}, ${camera.position.y.toFixed(0)})`; if (!heliSeen()) heliHomeNow(); return; }
      // the height to cross at: over every roof under its way (and a rotor and a margin to either side of it), and over its pad
      const p = HELI_HOME.at, L = Math.hypot(p[0] - st.x, p[1] - st.y), ux = (p[0] - st.x) / (L || 1), uy = (p[1] - st.y) / (L || 1);
      let top = Math.max(st.z, p[2]);
      for (let s = 0; s <= L; s += 4) for (const w of [-16, -8, 0, 8, 16]) { const x = st.x + ux * s - uy * w, y = st.y + uy * s + ux * w; top = Math.max(top, nav.groundBelow(x, y, 2000)); }
      heliHome = { phase: 'spool', t: 0, cruise: top + 25, bear: Math.atan2(ux, uy), v: 0, x0: st.x, y0: st.y, z0: st.z, path: [] };
      st.on = true; st.scripted = true; st.landed = true; st.doorTo = 0;
      H.toast('Its pilot is taking the helicopter back to its pad on SHIBUYA SKY\'s roof.');
      return;
    }
    // (you got back in some other way, or a story took it: the pilot lets go)
    if (player.mode === 'heli' || heliWait || heliAway) { heliHome = null; st.scripted = false; return; }
    const F = heliHome, p = HELI_HOME.at, padH = HELI_HOME.heading != null ? HELI_HOME.heading * Math.PI / 180 : st.h;
    F.t += dt;
    const turnTo = (h, rate = 0.5) => { const d = Math.max(-rate * dt, Math.min(rate * dt, angDiff(h, st.h))); st.h += d; st.yawRate = dt > 0 ? d / dt : 0; };
    const zWas = st.z, xWas = st.x, yWas = st.y;
    let acc = 0;
    if (F.phase === 'spool') { // the rotor up to speed on the street, lights on (vehicles.js update spools it while st.on)
      st.yawRate = 0;
      if (st.rotor > 0.9 && F.t > 2.5) { F.phase = 'up'; F.t = 0; }
    } else if (F.phase === 'up') { // straight up the way it came down, turning for the roof once its skids are clear of the street
      const vz = Math.min(8, Math.max(0.6, (F.cruise - st.z) * 0.6), F.t * 1.5); // (8 m/s at most, a light helicopter's climb)
      st.z = Math.min(F.cruise, st.z + vz * dt); st.landed = false;
      if (st.z > F.z0 + 6) turnTo(F.bear); else st.yawRate = 0;
      if (st.z >= F.cruise - 0.3 && Math.abs(angDiff(F.bear, st.h)) < 0.05) { F.phase = 'cross'; F.t = 0; }
    } else if (F.phase === 'cross') { // over to the pad, nose down to gather speed and up to shed it (2.5 m/s/s each way, at most 22 m/s)
      const dx = p[0] - st.x, dy = p[1] - st.y, d = Math.hypot(dx, dy), want = Math.min(22, Math.sqrt(2 * 2.2 * Math.max(0, d - 0.3)));
      const vWas = F.v; F.v += Math.max(-2.5 * dt, Math.min(2.5 * dt, want - F.v)); acc = dt > 0 ? (F.v - vWas) / dt : 0;
      const step = Math.min(d, F.v * dt);
      if (d > 0.01) { st.x += dx / d * step; st.y += dy / d * step; }
      st.z += (F.cruise - st.z) * Math.min(1, dt * 2);
      if (d > 20) turnTo(Math.atan2(dx, dy)); else st.yawRate = 0;
      if (d < 0.3 && F.v < 0.4) { F.phase = 'down'; F.t = 0; F.v = 0; st.x = p[0]; st.y = p[1]; }
    } else if (F.phase === 'down') { // and down onto the pad, slowing to half a metre a second for the last metres, turned to the pad's heading
      const left = st.z - p[2], vz = Math.max(0.5, Math.min(6, left * 0.45, F.t * 1.5));
      st.z = Math.max(p[2], st.z - vz * dt);
      turnTo(padH);
      if (st.z <= p[2] + 0.01) { heliHomeNow(); return; }
    }
    F.path.push([+st.x.toFixed(2), +st.y.toFixed(2), +st.z.toFixed(2)]); if (F.path.length > 4000) F.path.shift();
    st.vx = dt > 0 ? (st.x - xWas) / dt : 0; st.vy = dt > 0 ? (st.y - yWas) / dt : 0; st.vz = dt > 0 ? (st.z - zWas) / dt : 0; st.speed = Math.hypot(st.vx, st.vy);
    const e = 1 - Math.exp(-dt / 0.4);
    st.pitch += ((st.landed ? 0 : Math.max(-0.24, Math.min(0.3, acc * 0.04 + st.speed * 0.0035))) - st.pitch) * e; st.roll += (-st.yawRate * 0.12 * Math.min(1, st.speed / 8) - st.roll) * e;
    st.fwd = Math.max(-1, Math.min(1, acc / 6 + st.speed / 50)); st.lift = Math.max(-1, Math.min(1, st.vz / 8));
    st.on = true; st.scripted = true; heli.group.visible = true;
    if (!heli.loaded()) heli.want();
    heli.place();
  }
  const fer = OEVehicles.ferries(world, G, nav, name => OEActors.sprite(name, { bg: 'rgba(30,91,58,0.9)' }), vopts);
  // skipping a crossing runs the boats 8 times as fast, and waiting for one 25 times; on a long leg (Queenstown's
  // Earnslaw, 12.5 km to Walter Peak past the frame) fast enough that the crossing passes in about 40 s and the
  // longest wait for her in about a minute
  const LONG_LEG = Math.max(0, ...(G.ferries || []).flatMap(f => f.legs.map(l => l.length_m || 0))), FERRY_V = G.ferry_speed_ms || 9;
  const FERRY_SKIP = Math.max(8, LONG_LEG / (FERRY_V * 40)), FERRY_WAIT = Math.max(25, 2 * LONG_LEG / (FERRY_V * 60));
  const wharfById = id => G.wharves.find(w => w.id === id);
  // where you stand to board at each wharf: by its terminal, or the nearest place on foot to it where
  // the terminal is mapped out on the water
  for (const w of G.wharves) { const p = nav.stand(w.terminal[0], w.terminal[1], 2, { rMax: 90, room: 100 }); w.landing = p ? [p.x, p.y] : w.terminal.slice(); }
  // street trams and a funicular, where the city has them (rail.js)
  let rail = G.rail && window.OERail ? OERail.create(world, G) : null;
  // a railway's level crossings, to the traffic (junctions.js addRail): shut while the alarm is on, its first three
  // seconds a warning (rail.js crossings: closed, on; a track along a street, kind 'street', is no crossing)
  if (rail && rail.crossings) for (const c of rail.crossings) if (c.kind !== 'street') junctions.addRail({ x: c.x, y: c.y, z: c.z, w: 2 * (c.half_m || 3),
    state: () => (!c.closed ? 'open' : c.on >= 0 && c.on < 3 ? 'warning' : 'closed') });
  if (rail && rail.gateAhead) crowd.gate = rail.gateAhead; // (the crowd waits at a closed level crossing)
  // what a walker meets of a railway rail.js draws (issue 399): its platforms' furniture, and its bed where it stands more
  // than a step over the ground (an embankment), but not where a road or a path crosses it
  if (rail && (rail.solids || rail.bed)) {
    const boxRing = b => { const fx = Math.sin(b.h), fy = Math.cos(b.h), lx = -fy, ly = fx, r = [];
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) r.push(b.x + fx * b.hl * u + lx * b.hw * v, b.y + fy * b.hl * u + ly * b.hw * v);
      return [r]; };
    for (const b of rail.solids || []) nav.col.add(boxRing(b), b.zlo, b.zhi, nav.LFINE, -1);
    const xs = rail.crossings || [];
    for (const b of rail.bed || []) {
      let g = Infinity; // (the lowest ground across it: a bed across a slope stands over its downhill side)
      for (const v of [-1.6, 0, 1.6]) { const x = b.x - Math.cos(b.h) * v, y = b.y + Math.sin(b.h) * v, f = nav.floorAt(x, y, b.top + 0.3); g = Math.min(g, nav.terrain(x, y), f ? f.z : Infinity); }
      if (b.top - g < 0.2 || xs.some(c => Math.hypot(c.x - b.x, c.y - b.y) < (c.width_m || 6) / 2 + 3)) continue;
      nav.col.add(boxRing(b), g - 1, b.top + 0.6, nav.LFINE, -1); // (to over a walker's knee beside it: a low bed is no step to take onto the line)
    }
  }
  // a railway's trains: the modelled stock in place of the stand-ins, when it has loaded
  if (rail && rail.useModels) new THREE.GLTFLoader().load('assets/vehicles/trains.glb', g => { try { rail.useModels(g.scene); } catch (e) { console.warn('Train models unavailable, using simple ones:', e); } }, undefined, e => console.warn('Train models unavailable, using simple ones:', e));
  // a main line's trains past its station, where the city has them (trains.js): heard from the camera
  const trains = G.trains && window.OETrains ? OETrains.create(world, G, { hour: () => clock.min / 60, listener: () => ({ x: camera.position.x, y: -camera.position.z, z: camera.position.y, under: sndPlace === 'deck' }), warm: obj => firstFramed.then(() => warmFor(obj)) }) : null; // (a train's cars after the first frame: none runs on the title's first frames)
  // ridden the way rail.js's trains are, where the city has no rail.js line (trains.js ride: its stations, the trains
  // standing at them, boarding, the next stop and getting off)
  if (!rail && trains && trains.ride) rail = trains.ride;
  const railRide = () => (G.rail && (G.rail.funicular || G.rail.gondola || G.rail.train)) || {}; // the line a rider takes: a funicular or a gondola
  // (a main line's station is on its viaduct: only its platforms' level is the station, not the street under it)
  const railStation = (x, y, r = 25, z = null) => (rail ? rail.stations.find(st => Math.hypot(st.x - x, st.y - y) < (st.r || r) && (!st.deck || z == null || Math.abs(z - st.z) < 3)) : null);
  // neighbourhood signs, things to look at and conversations to overhear (places.js), and lifts between a
  // street door and a floor high up (game.json "lifts", from the city's landmarks)
  // who says an overheard line (places.js chatter): of the crowd drawn within r of where it is said, on its level, in the
  // camera's frame and in sight, the two nearest, each as a function that gives where they are now (or null once they are
  // no longer drawn). Only the crowd, and the anonymous people a place keeps (visitors.js): the map's people have names and
  // stories of their own, and a visitor's line said by Taro the photographer would be someone else's words in his mouth
  const chatFr = new THREE.Frustum(), chatM = new THREE.Matrix4(), chatV = new THREE.Vector3();
  const speakers = (x, y, z, r) => {
    if ((!crowd || !crowd.P) && !visitors) return [];
    const near = [];
    for (let i = 0, m = crowd && crowd.P ? Math.min(crowd.active, crowd.P.length) : 0; i < m; i++) {
      const q = crowd.P[i];
      if (!(q.line >= 0 || q.pz) || (crowdDraw && !crowdDraw.shows(i))) continue;
      const qx = q.rx ?? q.x, qy = q.ry ?? q.y, qz = q.rz ?? q.z ?? 0, d = Math.hypot(qx - x, qy - y);
      if (d < r && Math.abs(qz - z) < 3) near.push([d, i, qx, qy, qz]);
    }
    // (and the people a place keeps, visitors.js: on SHIBUYA SKY's roof the crowd never comes, and its lines are theirs)
    if (visitors) for (const v of visitors.near(x, y, z, r)) near.push([v.d, v.who, v.x, v.y, v.z]);
    near.sort((a, b) => a[0] - b[0]);
    chatM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); chatFr.setFromProjectionMatrix(chatM);
    const c = camera.position, out = [];
    for (const [, i, qx, qy, qz] of near) {
      if (!chatFr.containsPoint(chatV.set(qx, qz + 1.6, -qy)) || nav.col.pick(c.x, -c.z, c.y, qx, qy, qz + 1.6)) continue;
      if (typeof i === 'function') { out.push(i); if (out.length === 2) break; continue; } // (one of a place's people: where they stand)
      const q = crowd.P[i];
      out.push(() => (q === crowd.P[i] && (q.line >= 0 || q.pz) && !(crowdDraw && !crowdDraw.shows(i)) ? { x: q.rx ?? q.x, y: q.ry ?? q.y, z: q.rz ?? q.z ?? 0 } : null));
      if (out.length === 2) break;
    }
    return out;
  };
  const places = window.OEPlaces ? OEPlaces.create({ G, W, camera, stage, speakers, see: (x, y, z, o) => marks.see(x, y, z, o) }) : null;
  const lifts = G.lifts || [];
  // doors that open as you come up to them, and the rooms behind them (game.json "doors", "interiors": doors.js)
  const doors = window.OEDoors ? OEDoors.create({ G, world }) : null;
  let room = null; // the room you are in, for its name as you step in
  // seats you can take (a table by the glass, a chair in a foyer, the stalls), and what plays before one (show.js)
  const shows = window.OEShow && ((G.seats || []).length || (G.shows || []).length) ? OEShow.create({ G, A, world, host: $('#g-toasts').parentNode, toast: (...a) => H.toast(...a), npcs: () => npcs,
    people: lib ? { make: look => makeRig(look), need: c => lib.require(c), max: { high: 28, medium: 18, low: 10 }[QC.name] || 12 } : null }) : null;
  // somewhere to sit and watch the crossing on the walk (perch.js; game.json hero[].perches): the stone the hero level has
  const perch = window.OEPerch ? OEPerch.create({ G, floorAt: (x, y) => { const f = nav.floorAt(x, y, Math.max(0, nav.terrain(x, y)) + 1); return f ? f.z : null; } }) : null;
  let perchFov = 0;
  // the people a place keeps (visitors.js, issues 112 and 171): a few anonymous people where the place puts them, at the
  // glass and on the benches of SHIBUYA SKY's roof, on Hachiko's wall beside the free place; each drawn as one of the
  // crowd's own loaded cast (no model or texture of their own), made only when the camera comes near, fewer on a phone
  let visitCast = null;
  const visitors = window.OEVisitors && G.visitors && lib ? OEVisitors.create({ data: G.visitors, make: look => makeRig(look), world, W, posts, few: touch || QC.name === 'low',
    cast: (sex, k, at) => { // (of the crowd's own cast, and never the body of one of the map's named people near the place: Taro's twin at the glass beside him. Not all of them: a phone's cast is eight, and with the story's people taken out it held two women)
      visitCast = visitCast || realCast() || [];
      const named = new Set(G.npcs.filter(n => n.look && Math.hypot(n.at[0] - at[0], n.at[1] - at[1], n.at.length > 2 && at.length > 2 ? n.at[2] - at[2] : 0) < 120).map(n => n.look.character));
      const l = visitCast.filter(c => lib.npcs[c] && lib.npcs[c].sex === sex && !named.has(c)); return l.length ? l[k % l.length] : null; },
    need: c => !!lib.tpl[c] || (lib.require(c), false), // (loaded: the near crowd's own, mostly; else asked for, and taken a frame after it has come)
    floorAt: (x, y, z) => { const f = nav.floorAt(x, y, z); return f ? f.z : null; } }) : null;
  // the seats the walk marks (walktalk.js places): each until it has been sat on once in this browser, by its name, and
  // none where someone of the place already sits beside it (visitors.js: the seat offered by a person, issue 171)
  const SAT_KEY = 'bh-walk-sat';
  let satOn = null, seatList = null;
  const satGet = () => { if (!satOn) { try { satOn = new Set(JSON.parse(localStorage.getItem(SAT_KEY) || '[]')); } catch (e) { satOn = new Set(); } } return satOn; };
  function seatMarks() {
    if (!perch || !walk) return [];
    const sat = satGet();
    const sitting = visitors && visitors.sittingN ? visitors.sittingN() : 0; // (made again as someone of the place sits down by a seat, or goes: visitors.js seated)
    if (!seatList || seatList.n !== sat.size || seatList.sitting !== sitting) { seatList = perch.list.filter(p => !sat.has(p.name) && p.z != null && !(visitors && visitors.seated(p.at[0], p.at[1], 2.5))).map(p => ({ id: p.name, x: p.at[0] + p.face[0] * 0.3, y: p.at[1] + p.face[1] * 0.3, z: p.z, label: `Sit · ${p.name}` })); seatList.n = sat.size; seatList.sitting = sitting; if (perch.list.some(p => p.z == null)) { for (const p of perch.list) perch.near(p.at[0], p.at[1], 0); seatList.n = -1; } }
    return seatList;
  }
  // the next train out of Shibuya, by the walk's clock (game.json tonight.trains, the Yamanote's outer loop): the last
  // until it has gone, then the first; `in`: the minutes to it
  function trainNext() {
    const T = ((G.tonight || {}).trains || {})['yamanote-n'] || ['00:33', '04:33'], last = S.hm(T[0]), first = S.hm(T[1]), m = clock.min;
    const isFirst = m >= last && m < first, at = isFirst ? first : last;
    return { first: isFirst, at, in: (at - m + 1440) % 1440 };
  }
  // Waiting with someone (walktalk.js wait: Nagi, for her train). You sit on Hachiko's wall and they sit beside you, and
  // the night passes by itself while the crossing goes on: faster where nothing happens, slower near the night's moments
  // (`says`: a line at a minute, said over them as it comes round), until a few minutes before the train. Standing up (E)
  // ends it where it is; the wait can be taken up again
  let waitRun = null;
  function waitWith(n, plan) {
    const st = perch && perch.list[0];
    if (!st || st.z == null || player.mode !== 'foot') return false;
    // (you on the seat, its corner; a copy of it, so that who sits beside you is this wait's alone)
    const seat = Object.assign({}, st);
    sitDown(seat);
    if (touch) $('#gt-jump').hidden = true; // (no Time-lapse button: the wait passes the night by itself)
    // (beside you on the stone itself: plan.beside, a point along the wall's end block; the seat is its outer corner, so a
    // step to either side of you along the seat's own line was over the setts, and she sat on the air)
    const [x, y] = plan.beside || [st.at[0] - st.face[1] * 0.75, st.at[1] + st.face[0] * 0.75];
    n.fixed = true; n.sit = true; n.rig.legRake = st.rake; n.rig.seatH = st.seat; n.rig.reach = W(x + st.face[0] * 0.26, y + st.face[1] * 0.26, st.z + 0.5); // (her hands in her lap, as yours are)
    seat.with = [x, y]; // (perch.js: the seat's shot keeps the two of you in it)
    n.x = x; n.y = y; n.z = st.z; n.h = st.h; n.rig.root.position.copy(W(n.x, n.y, n.z)); n.rig.root.rotation.y = Math.PI - n.h;
    if (n.post) posts.move(n.post, n.x, n.y, n.z);
    const left = Math.max(1, trainNext().in - (plan.before || 3));
    waitRun = { n, plan, left, total: left, said: new Set(), st: seat };
    return true;
  }
  function waitEnd(done) {
    const w = waitRun; if (!w) return;
    waitRun = null;
    const n = w.n; n.sit = false; delete n.rig.legRake; n.rig.reach = n.rig.seatH = n.rig.thighDown = null; w.st.with = null;
    const f = nav.stand(n.x + w.st.face[0] * 0.8, n.y + w.st.face[1] * 0.8, w.st.z + 0.5, { rMax: 3 }); // (up off the stone, onto her feet in front of where she sat)
    if (f) { n.x = f.x; n.y = f.y; n.z = f.z; n.rig.root.position.copy(W(n.x, n.y, n.z)); if (n.post) posts.move(n.post, n.x, n.y, n.z); }
    if (player.mode === 'seat') standUp();
    (done ? w.plan.done : w.plan.cancel || (() => {}))();
  }
  function waitStep(dt) {
    const w = waitRun;
    if (player.mode !== 'seat') { waitEnd(false); return; } // (stood up: the wait ends where it is)
    if (dlg.open) return; // (a word said over the wait holds it)
    // (the rate: the whole wait in about forty seconds, never slower than the wall's own time-lapse; slowed to a walk's pace
    // for a few minutes round each of the night's moments, so that it is seen)
    const says = w.plan.says || [], near = says.some(([hm]) => { const d = (S.hm(hm) - clock.min + 1440) % 1440; return d < 5 || d > 1438; });
    const rate = near ? 1.2 : Math.max(2.5, w.total / 40);
    const wm = Math.min(w.left, rate * dt);
    w.left -= wm; clock.own = true; clock.min += wm; if (clock.min >= 1440) setClock(clock.y, clock.m, clock.d, clock.min);
    for (const [hm, line] of says) {
      if (w.said.has(hm)) continue;
      const d = (clock.min - S.hm(hm) + 1440) % 1440;
      if (d < 3 && w.plan.say) { w.said.add(hm); w.plan.say(line); }
    }
    if (w.left <= 0) waitEnd(true);
  }
  function sitDown(st) {
    player.seatFrom = { x: player.x, y: player.y, z: player.z, h: player.h };
    Object.assign(player, { mode: 'seat', x: st.at[0], y: st.at[1], z: st.perch ? st.z : st.at[2], h: st.h, speed: 0, ground: true, vz: 0 });
    cam.lookYaw = 0; cam.lookPitch = st.pitch || 0; cam.lastInput = -10;
    if (st.perch) { // (on a low wall, perch.js: its rake, the feet further out so the hips come down onto the stone, laid each frame in simulate)
      satGet().add(st.name); try { localStorage.setItem(SAT_KEY, JSON.stringify([...satOn])); } catch (e) { /* storage blocked */ }
      perch.sit(st); seatTouch(true); if (touch) $('#gt-jump').hidden = false; stage.classList.add('at-perch'); // (story.css: its button shown)
      blendFrom(1.1, true); // (from over your shoulder round to the seat's tripod, not a cut)
      return;
    }
    // (straight into your own eyes, as before the hand-overs blended: and a hand-over still easing, a stand-up from the
    // seat before, which held a view in the world the eyes are no longer near, is ended)
    viewBlend.t = 1;
    shows.sit(st);
    seatTouch(true);
  }
  // in a seat there is nowhere to walk: on a phone the joystick, Jump, Run and Guess are put away; a finger looks
  // round and the action button stands you up
  function seatTouch(on) { if (touch) for (const id of ['#gt-joy', '#gt-jump', '#gt-run', '#gt-down', '#gt-lens']) $(id).hidden = on; }
  function standUp() {
    const st = (perch && perch.seat) || shows.seat, tri = st && st.perch ? perch.tripod : null;
    if (st && st.perch) { perch.stand(); player.rig.legRake = player.rig.reach = player.rig.seatH = player.rig.thighDown = null; stage.classList.remove('at-perch'); player.seatFrom = { x: st.at[0] + st.face[0] * 0.7, y: st.at[1] + st.face[1] * 0.7, z: st.z }; } else shows.stand(); // (off the wall: up onto your feet at its foot, facing the crossing)
    const f = player.seatFrom;
    seatTouch(false);
    const p = (f && nav.stand(f.x, f.y, f.z + 0.5, { rMax: 3 })) || nav.stand(player.x, player.y, player.z + 0.5, { rMax: 4 }) || f || player;
    Object.assign(player, { mode: 'foot', x: p.x, y: p.y, z: p.z, h: st ? st.h : player.h, speed: 0, ground: true, vz: 0 });
    // (off a perch the camera stays on the tripod's side of you, never swung round over the wall and its lantern behind)
    cam.mode = 'chase'; cam.yaw = tri ? Math.atan2(player.x - tri[0], player.y - tri[1]) : player.h; cam.pitch = FOOT.pitch; cam.dist = FOOT.dist;
    blendFrom(0.7, true); // (from the seat's eyes out to over your shoulder, not a cut)
    player.rig.root.visible = true;
  }
  // The stop a ride has just set you down at offers no ride until you have walked out of it once, as a lift you have just
  // stepped out of in a game does not ask you straight back in: the player is set down on the stop itself, and at
  // SHIBUYA SKY 46F "Take the lift to Shibuya Scramble Square, street level" stood in the middle of a phone's screen the
  // moment you were up, over the way on to the roof (the owner's phone, November 2026). liftLeft: { l, i }, or null
  let liftLeft = null, liftAt = '', liftTurn = false;
  function liftStop(x, y, z) {
    for (const l of lifts) for (let i = 0; i < l.stops.length; i++) {
      const s = l.stops[i], at = Math.hypot(s.at[0] - x, s.at[1] - y) < 3.0 && Math.abs(s.at[2] - z) < 2.5;
      if (liftLeft && liftLeft.l === l && liftLeft.i === i) { if (at) continue; liftLeft = null; } // (out of it: it offers the ride again)
      if (at) return { l, i };
    }
    return null;
  }

  // ------------------------------------------------------------ cars: your own, taxis and rides (cars.js)
  // Your car waits at the kerb near the start (game.vehicles.car: { model, colour, accent, seat }; the supercar unless a city says) and
  // stays where you leave it; the phone brings it to you. Raise your hand at the kerb (Y) and a
  // taxi pulls in: the nearest free one coming your way, or one from round the corner. Or order
  // a ride on the phone (N), as GTA VI's Ryde Me app does: say where first, and a private-hire
  // car comes to your side of the street. You get in the back (a taxi driver asks where to), and
  // the driver takes you by road, talking about what you pass, as a local would. F skips
  // the trip, as in GTA V. Whichever it is arrives within half a minute: it sets out from a
  // street chosen so the trip, timed by driving it in a dry run, takes 14 to 25 s, and it drives
  // briskly while it is well out of your sight. The phone shows it coming as a ride app does: the
  // car on the map moving along its route to the pick-up, and the time it will take.
  const keepSign = KEEP === 'left' ? 1 : -1, kerbSeat = KEEP === 'left' ? 'rear_left' : 'rear_right';
  // the seat you take in a ride: behind the driver's mate, on the kerb side; in a car with no back seat (the story sends your
  // own two-seat supercar round), the front one beside the driver, on the kerb side too. (#94: it fell back to the driver's
  // own seat, where the chauffeur sits, and you got in and out on the side of the traffic, in the lane beside the car.)
  const rideSeat = o => (o.C.seats[kerbSeat] ? kerbSeat : o.C.seats.passenger ? 'passenger' : 'driver');
  const CARS_OK = !!(vlib && vlib.cars && Object.values(vlib.info.cars.models).some(m => m.seats));
  const carCfg = Object.assign({ model: 'Car_Super', colour: '#0b0d11', accent: '#d9a441', seat: '#6e4228' }, (G.vehicles || {}).car);
  if (vlib && vlib.info.cars && !vlib.info.cars.models[carCfg.model]) carCfg.model = 'Car_Hatch';
  // the ways you can actually go, on foot, by road and in the air (route.js), worked out in slices behind the title
  const ways = OERoute.create({ nav, footNet, roadNet, DSM, helipads: G.helipads, lifts: G.lifts || [], ground: lineGround, gentle: () => !playing }); // (built gently behind the title, at full pace once the player is in: route.js slice)
  roadNet.avoid = ways.drive;
  // (a street whose lane has room for no vehicle anywhere along it, by the width pass above, is one a car can't
  // get along, as one the data runs through a building is: kept off by the traffic and the routes alike, #202)
  for (let i = 0; i < roadNet.L.length; i++) if (roadNet.fit[i] === 0) ways.drive[i] = 1;
  const groundZ0 = (x, y) => { const f = nav.floorAt(x, y, Math.max(0, nav.terrain(x, y)) + 1); return f ? f.z : null; };
  // where the traffic is going (trips.js): out to the main roads' ends at the map's edge, or into town, to the streets
  // by the places the map names, the wharves and where you start; into town in the morning, out in the evening
  if (window.OETrips) junctions.setTrips(OETrips.create(roadNet, { avoid: ways.drive, parkable: i => cars.kerbLo(i) > 0, slow: i => (roadNet.fit && roadNet.fit[i] < 9 ? 2.5 : 1), // (a street a facade narrows: Fushimi Inari's and Higashiyama's lanes, jammed nose to nose)
     hour: () => { try { return clock.min / 60; } catch (e) { return 12; } }, // (the clock is set up further down)
    centres: [G.start.at].concat((G.travel || []).map(t => t.at), G.wharves.map(w => w.terminal), Object.values(scene.labels || {})).filter(Boolean).map(p => [p[0], p[1], p[2] ?? groundZ0(p[0], p[1])]) }));
  const roads = OECars.router(roadNet, { avoid: ways.drive }), headlamp = CARS_OK ? earlyLamps.head : null, rq = {};
  if (!CARS_OK) world.remove(earlyLamps.head, earlyLamps.head.target);
  // a pose at the kerb of a place on the roads (router.place), facing the way it goes
  function kerbPose(pl, off) {
    roadNet.at(pl.line, pl.s, rq);
    const hx = rq.hx * pl.dir, hy = rq.hy * pl.dir;
    const l0 = roadNet.L[pl.line];
    let k = off ?? OECars.kerbOf(l0.c, l0.cw);
    // (its outer side inside the asphalt the street's class draws, street_ground.py's half width: kerbOf's 4.4 m on a
    // street drawn 4.5 m out stood half the car on the kerb wherever no hero level draws the ground: docs/ROADS.md, the first drive)
    if (off == null) k = Math.max(OECars.LANE, Math.min(k, rwOf(l0) / 2 - 0.95 - 0.25));
    // (where a hero level draws the carriageway, pulled in only as far as its kerb, never over it onto the paving: by the
    // west exit Jingu-dori's one lane took your car 4.4 m out, onto the footway, as the rides were by Hachiko, #54)
    if (off == null && nav.carriageway) {
      const min = Math.min(k, OECars.LANE), fits = kk => { const lat = (kk + 1.1) * keepSign; for (const a of [-2.3, 0, 2.3]) if (nav.carriageway(rq.x + hx * a - hy * lat, rq.y + hy * a + hx * lat) === false) return false; return true; };
      while (k > min && !fits(k)) k -= 0.2;
      k = Math.max(k, min);
    }
    k *= keepSign;
    // (the floor a car's wheels take there, within a kerb of the road's own height: never a planter's or a plinth's top by it)
    const x = rq.x - hy * k, y = rq.y + hx * k, f = nav.floorAt(x, y, rq.z + 0.3 + OECars.CAR_STEP - nav.STEP);
    return { x, y, z: f ? f.z : rq.z, h: Math.atan2(hx, hy) };
  }
  // a place on the roads moved along its street clear of a scramble: no stopping within 5 m of its
  // crosswalks (Japan's Road Traffic Act, art. 44), where its crowd masses at the kerb and surges out
  // (the crosswalks, each its two ends; a car's centre within 5 m and its half-length of one is too close)
  const SCR_AT = [].concat(...junctions.J.filter(j => j.scramble && j.spans && j.spans.length).map(j => j.spans));
  const nearSpan = (x, y, r) => SCR_AT.some(w => {
    const ex = w[3] - w[0], ey = w[4] - w[1], t = Math.max(0, Math.min(1, ((x - w[0]) * ex + (y - w[1]) * ey) / (ex * ex + ey * ey || 1)));
    return Math.hypot(x - w[0] - ex * t, y - w[1] - ey * t) < r;
  });
  // (and the box between them: out to the farthest crosswalk's middle)
  const SCR_BOX = junctions.J.filter(j => j.scramble && j.spans && j.spans.length).map(j => ({ x: j.x, y: j.y, r: Math.max(...j.spans.map(w => Math.hypot((w[0] + w[3]) / 2 - j.x, (w[1] + w[4]) / 2 - j.y))) }));
  const inScramble = (line, s) => { roadNet.at(line, s, rq); return nearSpan(rq.x, rq.y, 7.5) || SCR_BOX.some(j => Math.hypot(rq.x - j.x, rq.y - j.y) < j.r); };
  function offScramble(pl, room = false) { // (room: a car to drive off from it, the spot with road ahead first; a pick-up, the nearest)
    if (!pl || !SCR_AT.length || (!inScramble(pl.line, pl.s) && !(room && inScramble(pl.line, Math.max(0, Math.min(roadNet.L[pl.line].len, pl.s - 15 * pl.dir)))))) return pl;
    // (the nearest clear spot either way, the one with road ahead to drive off along first)
    const L = roadNet.L[pl.line].len, found = [];
    const clear = s => !inScramble(pl.line, s) && (!room || !inScramble(pl.line, Math.max(0, Math.min(L, s - 15 * pl.dir)))); // (a car: and the kerb behind it, room for a taxi to pull in there)
    for (const sg of [1, -1]) for (let d = 3; d <= 90; d += 3) {
      const s = pl.s + d * sg;
      if (s < 3 || s > L - 3) break;
      if (clear(s)) { found.push({ s, d, room: pl.dir > 0 ? L - s : s }); break; }
    }
    if (!found.length) return pl;
    found.sort((a, b) => (room ? (b.room > 25) - (a.room > 25) : 0) || a.d - b.d);
    roadNet.at(pl.line, found[0].s, rq);
    return Object.assign({}, pl, { s: found[0].s, x: rq.x, y: rq.y, z: rq.z });
  }
  // where to be picked up near (x, y): the nearest kerb within reach that is clear of a scramble, on
  // this street or one round it (a taxi never pulls in on a scramble's crosswalks or in its box)
  function pickupNear(x, y, z, within) {
    const pl = roads.place(x, y, within, keepSign, z);
    if (!pl || !SCR_AT.length || !inScramble(pl.line, pl.s)) return pl;
    let best = offScramble(pl), bd = inScramble(best.line, best.s) ? Infinity : Math.hypot(best.x - x, best.y - y);
    for (let r = 6; r <= Math.min(within, 40); r += 6) for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, q = roads.place(x + Math.sin(a) * r, y + Math.cos(a) * r, 6, keepSign, z);
      if (!q || inScramble(q.line, q.s)) continue;
      roadNet.at(q.line, q.s, rq); // (going the way that keeps you on its kerb side)
      q.dir = roadNet.L[q.line].ow || (((x - rq.x) * -rq.hy + (y - rq.y) * rq.hx) * keepSign >= 0 ? 1 : -1);
      const d = Math.hypot(q.x - x, q.y - y);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }
  // the kerb near (x, y) at about height z, a few metres along the road (so a car isn't put on top of
  // you), at a spot where your car is clear of the traffic, the lamp posts and the trees
  const scrambleJ = junctions.J.filter(j => j.scramble);
  // would a car of half length hl and half width hw stand wedged at pose { x, y, z, h }: its body in a wall (the three
  // circles down it that the walls push, cars.js drive), or part of it over a ledge higher than a kerb (cars.js ledgesUnder)
  function wedged(pose, hl, hw) {
    const fx = Math.sin(pose.h), fy = Math.cos(pose.h);
    for (const o of [hl - hw, 0, hw - hl]) {
      const cx = pose.x + fx * o, cy = pose.y + fy * o, q = nav.push(cx, cy, pose.z, hw + 0.04, 1.6);
      if (Math.hypot(q.x - cx, q.y - cy) > 0.05) return true;
    }
    return OECars.ledgesUnder(nav, pose, hl, hw) > 0;
  }
  function kerbNear(x, y, z, ahead = 9, within = 250) {
    const pl0 = offScramble(roads.place(x, y, within, keepSign, z), true);
    if (!pl0) return null;
    const M = CARS_OK && vlib.info.cars.models[carCfg.model], half = M ? M.length_m / 2 : 2.2, hw = M ? M.width_m / 2 : 0.9;
    let first = null;
    const along = (pl, s0) => {
      const L = roadNet.L[pl.line].len;
      // (not in a junction, nor so close to one that the traffic turning through it can't get round: at Hong
      // Kong's start it was parked at a junction's mouth, and every car behind waited on it for good, issue 128;
      // 12 m clear of one ahead, and 18 m of one behind, where a taxi hailed from beside it pulls in)
      const l0 = roadNet.L[pl.line], n0 = l0.pts.length / 3, jn = k => (roadNet.nodes.get(roadNet.key(l0.pts[3 * k], l0.pts[3 * k + 1])) || []).length > 2;
      const back = d => half + (d ? 18 : 12), nearJ = s => junctions.inner(pl.line) || (jn(0) && s < back(pl.dir > 0)) || (jn(n0 - 1) && L - s < back(pl.dir < 0));
      for (const d of [0, 6, -6, 12, -12, 18, -18, 24, -24, 30, -30, 36, -36]) {
        const q = Object.assign({}, pl, { s: Math.max(3, Math.min(L - 3, s0 + d * pl.dir)) });
        if (SCR_AT.length && (inScramble(q.line, q.s) || inScramble(q.line, Math.max(0, Math.min(L, q.s - 15 * q.dir))) || (q.dir > 0 ? L - q.s : q.s) < 12)) continue; // (not back by the scramble's crosswalks, nor the kerb behind it; and with road ahead to drive off along)
        const pose = kerbPose(q);
        first = first || { pl: q, pose };
        if (nearJ(q.s) || cars.footprint(pose.x, pose.y, pose.z, pose.h, half, hw, 0.3) > 0) continue;
        if (wedged(pose, half, hw)) continue; // (not into a wall nor half over a ledge a car cannot climb: it would stand there wedged)
        if (scrambleJ.some(j => Math.hypot(j.x - pose.x, j.y - pose.y) < 36)) continue; // (not at the mouth of a scramble, its crowd crossing every way)
        let hit = false;
        const fx = Math.sin(pose.h), fy = Math.cos(pose.h);
        posts.near(pose.x, pose.y, half + 1, p => {
          const dx = p.x - pose.x, dy = p.y - pose.y;
          if (Math.abs(dx * fx + dy * fy) < half + p.r + 0.2 && Math.abs(-dx * fy + dy * fx) < hw + p.r + 0.2) hit = true;
        }, pose.z);
        if (!hit) return { pl: q, pose };
      }
      return null;
    };
    let got = along(pl0, pl0.s + ahead * pl0.dir);
    // (by a scramble, its street too short for all that, or a short piece between two junctions: the streets
    // round, nearest first)
    if (!got) for (let r = 15; r <= 75 && !got; r += 15) for (let k = 0; k < 12 && !got; k++) {
      const a = k / 12 * Math.PI * 2, q = roads.place(x + Math.sin(a) * r, y + Math.cos(a) * r, 8, keepSign, z);
      if (q && q.line !== pl0.line) got = along(q, q.s);
    }
    return got || first || { pl: pl0, pose: kerbPose(pl0) };
  }
  // where a car is on the roads, going the way it faces
  function placeOf(st) {
    const pl = roads.place(st.x, st.y, 60, keepSign, st.z);
    if (!pl) return null;
    roadNet.at(pl.line, pl.s, rq);
    pl.dir = Math.sin(st.h) * rq.hx + Math.cos(st.h) * rq.hy >= 0 ? 1 : -1;
    return pl;
  }
  // a route by road from place a to the kerb nearest (x, y) that a road from a reaches: at about height
  // z (the ground's there), else at any height within 800 m (in a park, a castle's grounds); never one
  // on a piece of road cut off from a's streets (a drive mapped at a building's level), which no
  // route reaches (cars.js router group)
  function driveTo(a, x, y, z = groundZ(x, y)) {
    const g = roads.group(a.line), b = (z != null && roads.place(x, y, 300, keepSign, z, g)) || roads.place(x, y, 800, keepSign, null, g);
    return b && (roads.route(a, b, 30000) || roads.route(a, Object.assign({}, b, { dir: -b.dir }), 30000));
  }
  // your car's model comes after the game can be played (issue 335): parked where it was to be as soon as it has
  // come, fetched then (afterPlayable) or at once when asked for later
  let myCar = null, ride = null, parkWait = null, carsHeld = true;
  const sprayCars = [];
  let pilot = null; // the autopilot driving your car (pilotTo, below): a driver as a ride's is, at your own wheel
  const parkLater = () => vlib.loadCars().then(() => {
    const p = parkWait; parkWait = null;
    if (!(p && vlib.carsFull) || myCar) return;
    parkMyCar(p);
    const g = myCar && myCar.C.group; // (shown once its shaders are compiled and its textures sent, not compiled in the frame that draws it)
    if (g) { g.visible = false; warmFor(g).catch(() => {}).then(() => { g.visible = true; }); }
  });
  function parkMyCar(pose) {
    if (pilot) pilotOff(); // (moved by the phone, the map or R: the autopilot's way is no longer its way)
    if (!CARS_OK || !vlib.info.cars.models[carCfg.model]) return;
    if (!myCar && !vlib.carsFull) { parkWait = pose; if (!carsHeld) parkLater(); return; }
    if (!myCar) {
      const C = OECars.car(world, vlib, carCfg.model, { colours: { paint: carCfg.colour, band: carCfg.accent, seat: carCfg.seat }, keep: KEEP });
      myCar = { C, D: OECars.drive(C, nav, pose) };
    }
    Object.assign(myCar.D.st, { x: pose.x, y: pose.y, z: pose.z, h: pose.h, vx: 0, vy: 0, v: 0, speed: 0, r: 0, vz: 0, steer: 0, air: false, pitch: 0, roll: 0 });
    myCar.C.place(pose.x, pose.y, pose.z, pose.h); // there already behind the title
  }
  { const [cx, cy] = G.start.car || G.start.at; // (game.start.car: where it waits, when not by the start: Shibuya's start is at the scramble)
    const z = nav.floorAt(cx, cy, Math.max(0, nav.terrain(cx, cy)) + 1), k = kerbNear(cx, cy, z ? z.z : null); if (k) parkMyCar(k.pose); }
  const stOf = o => (o.D ? o.D.st : o.drv.st);
  // the ground beside a seat's door (o: your car or a ride)
  function doorAt(o, seat) {
    const C = o.C, st = stOf(o), p = C.seats[seat] || C.seats.driver, fx = Math.sin(st.h), fy = Math.cos(st.h);
    const l = Math.sign(p.x || 1) * (C.hw + 0.55), f = p.z + 0.2;
    return { x: st.x + fx * f - fy * l, y: st.y + fy * f + fx * l };
  }
  // how far (x, y) is from the side of a car
  function offCar(o, x, y) {
    const st = stOf(o), fx = Math.sin(st.h), fy = Math.cos(st.h), dx = x - st.x, dy = y - st.y;
    return Math.hypot(Math.max(0, Math.abs(dx * fx + dy * fy) - o.C.half), Math.max(0, Math.abs(-dx * fy + dy * fx) - o.C.hw));
  }
  // the cars near (x, y) as boxes (cars.js), less one (the one you are in)
  // the cars of the traffic your car was handed back overlapping (the autopilot's car is carried along its driver's line,
  // and on a tight corner beside one it can be a little into it): left out of your car's collisions until the two are
  // apart, 3 s at most, rather than shoved out of each other at once, a jump of 2 m mid-corner (#399)
  let handGhost = null, handGhostT = 0;
  function boxesMeet(b, o) {
    const st = o.D.st, fx = Math.sin(st.h), fy = Math.cos(st.h), bx = Math.sin(b.h), by = Math.cos(b.h), dx = b.x - st.x, dy = b.y - st.y;
    for (const [px, py] of [[fx, fy], [-fy, fx], [bx, by], [-by, bx]]) {
      const ra = o.C.half * Math.abs(fx * px + fy * py) + o.C.hw * Math.abs(-fy * px + fx * py), rb = b.hl * Math.abs(bx * px + by * py) + b.hw * Math.abs(-by * px + bx * py);
      if (Math.abs(dx * px + dy * py) >= ra + rb) return false;
    }
    return true;
  }
  function carBoxes(x, y, r, but = null) {
    const out = [];
    for (const c of cars.live) if (c.line >= 0 && Math.abs(c.x - x) < r + c.half && Math.abs(c.y - y) < r + c.half) {
      const b = OECars.boxOf(c, c.half, c.hw || 0.9, c.top || 1.5);
      b.onHit = () => cars.stop(c);
      b.car = c;
      if (handGhost && clockT - handGhostT > 3) handGhost = null;
      if (but === myCar && handGhost && handGhost.has(c)) { if (boxesMeet(b, myCar)) continue; handGhost.delete(c); } // (handed back into it: passed through until apart)
      out.push(b);
    }
    for (const o of [myCar, ride]) if (o && o !== but && Math.hypot(stOf(o).x - x, stOf(o).y - y) < r + 5) out.push((o.D || o.drv).box());
    if (rail && rail.trainBoxes) for (const b of rail.trainBoxes()) if (Math.abs(b.x - x) < r + b.hl && Math.abs(b.y - y) < r + b.hl) out.push(b); // (a train's bodies)
    // (and the helicopter's hull, cabin and tail boom, wherever it stands or hovers within reach, unless you are in it: a
    // walker, a guide dog and a car are kept out of it as out of a car; nothing kept anyone out of it before)
    if ((heli.group.visible || heliOnRoad()) && player.mode !== 'heli' && Math.hypot(heli.st.x - x, heli.st.y - y) < r + 8) for (const b of heli.boxes()) out.push(b);
    if (rail && rail.gateBoxes) for (const b of rail.gateBoxes(x, y, r)) out.push(b); // (and a closed crossing's arms)
    return out;
  }
  // the lamp posts and trunks near (x, y), for a car to hit
  function postsNear(x, y, r) { const out = []; posts.near(x, y, r, q => out.push(q)); return out; }
  // the people near (x, y), for a car to stop for
  function peopleNear(x, y, r) {
    const out = [];
    for (const p of crowd.P) if (p.line >= 0 && Math.abs(p.x - x) < r && Math.abs(p.y - y) < r) out.push({ x: p.x, y: p.y, z: p.z, onHit: () => { p.pause = Math.max(p.pause, 1.5); } });
    for (const n of npcs) if (Math.abs(n.x - x) < r && Math.abs(n.y - y) < r) out.push({ x: n.x, y: n.y, z: n.z });
    return out;
  }
  // into your car (walk round to the driver's door first), and out again
  function enterCar() { // (E and you are in the driver's seat, as for a ride: no walk to the door first)
    player.auto = null; player.speed = 0;
    player.mode = 'car'; player.vehicle = myCar;
    myCar.C.sit(player.rig, 'driver');
    if (headlamp) myCar.C.carry(headlamp);
    const turn = Math.abs(angDiff(myCar.D.st.h, cam.yaw));
    cam.mode = 'chase'; cam.dist = 7.5; cam.pitch = 0.2; cam.yaw = myCar.D.st.h;
    blendFrom(0.8 + turn * 0.16, true); // (round behind the car from where you stood, not swung through it in a frame or two; longer the farther round)
    A.thump();
    if (!walk) H.toast(touch ? 'Your car. Push the stick forward to drive, back to brake and reverse, and to either side to steer. <b>Hand brake</b>, <b>Horn</b>, <b>View</b> and <b>Auto</b> are beside it; <b>E</b> gets out.'
      : 'Your car. <kbd>W</kbd>/<kbd>S</kbd> drive, brake and reverse, <kbd>A</kbd>/<kbd>D</kbd> steer, <kbd>Space</kbd> handbrake, <kbd>H</kbd> horn, <kbd>V</kbd> view, <kbd>E</kbd> get out.');
  }
  // out of a car onto the ground beside a door, on foot again
  function stepOut(o, seat, at = null) {
    const st = stOf(o), d = !at && doorAt(o, seat), p = at || placeNear(d.x, d.y, st.z + 0.5, carBoxes(st.x, st.y, 12));
    if (!p) return false;
    o.C.body.remove(player.rig.root); world.add(player.rig.root);
    player.rig.root.scale.setScalar(1); // (a seat too low for you made you a little smaller: cars.js sit)
    player.rig.legRake = player.rig.reach = null;
    player.mode = 'foot'; player.vehicle = null; player.speed = 0; player.ground = true; player.vz = 0;
    [player.x, player.y, player.z] = p;
    player.h = st.h;
    player.rig.root.visible = true;
    const inside = cam.mode === 'cabin';
    if (inside) cam.mode = 'chase';
    cam.dist = 6.5; camera.up.set(0, 1, 0);
    // (the head it looks at drops from the seat to yours beside the door; from the cabin view a cut to outside, as a film
    // cuts, where a move went out through the roof or the pillar beside you)
    if (inside) viewBlend.t = 1; else blendFrom(0.6, true);
    if (headlamp) o.C.drop(headlamp);
    A.car(0, 0, 0); A.skid(0); A.thump();
    return true;
  }
  function exitCar() {
    if (myCar.D.st.speed > 1.5) { H.toast('Stop first.'); return; }
    if (!stepOut(myCar, 'driver')) { H.toast('No room to get out here.'); return; }
    save();
  }
  function resetCar() { // back on the road, the right way up
    const k = kerbNear(myCar.D.st.x, myCar.D.st.y, myCar.D.st.z, 0);
    if (k) { parkMyCar(k.pose); H.toast('Back on the road.'); }
  }
  // Your car called to the kerb nearest you (C, the walk's corner, the menu): it comes up the kerb's lane over the last
  // twenty metres, slowing as a driver pulls in, and stops beside you with a toot, rather than standing there all at once
  // (the cars that come when called in the open-world games do the same: arrive, never appear)
  let carCome = null;
  function bringCar() {
    if (!myCar) { H.toast('Your car is not here yet. Try again in a moment.'); return; }
    if (player.mode !== 'foot') { H.toast('Get out first.'); return; }
    const k = kerbNear(player.x, player.y, player.z, 10);
    if (!k) { H.toast('There is no street near enough to bring it to.'); return; }
    const st = myCar.D.st, m = Math.round(Math.hypot(k.pose.x - player.x, k.pose.y - player.y));
    if (Math.hypot(st.x - k.pose.x, st.y - k.pose.y) < 6 && !carCome) { A.honk(0.25, 1.15); H.toast(`Your car is here, ${m} m away.`); return; }
    const L = roadNet.L[k.pl.line].len, s1 = k.pl.s, s0 = Math.max(3, Math.min(L - 3, s1 - CAR_COME_M * k.pl.dir)), from = Object.assign({}, k.pl, { s: s0 }), p0 = kerbPose(from);
    const M = vlib.info.cars.models[carCfg.model], half = M ? M.length_m / 2 : 2.2, hw = M ? M.width_m / 2 : 0.9;
    // (from where it comes: clear of the traffic and not wedged, or it stands at the kerb at once)
    const far = Math.abs(s1 - s0) > 4 && !cars.footprint(p0.x, p0.y, p0.z, p0.h, half, hw, 0.3) && !wedged(p0, half, hw);
    parkMyCar(far ? p0 : k.pose);
    carCome = far ? { pl: k.pl, s0, s1, t: 0, dur: 2 * Math.abs(s1 - s0) / 8.5 } : null; // (in at 30 km/h, slowing evenly to the kerb)
    if (!far) A.honk(0.25, 1.15);
    H.toast(far ? `Your car is pulling in at the kerb, ${m} m away.` : `Your car is at the kerb, ${m} m away.`);
    save();
  }
  const CAR_COME_M = 20;
  function carComing(dt) {
    const c = carCome;
    if (!c || !myCar) { carCome = null; return; }
    if (player.mode === 'car' || player.mode === 'heli') { carCome = null; return; } // (got in as it came: it stops where it is)
    c.t += dt;
    const u = Math.min(1, c.t / c.dur), e = 1 - (1 - u) * (1 - u);
    const pose = kerbPose(Object.assign({}, c.pl, { s: c.s0 + (c.s1 - c.s0) * e }));
    Object.assign(myCar.D.st, { x: pose.x, y: pose.y, z: pose.z, h: pose.h });
    myCar.C.place(pose.x, pose.y, pose.z, pose.h);
    if (u >= 1) { carCome = null; A.honk(0.25, 1.15); save(); }
  }
  let bumpCar = -9, carFov = 0, heliFov = 0;
  // your car over a stop line on red (junctions.js), with the cross road's green: a word about it
  const redRq = {};
  let redLast = -99, redAt = null, redT = 0;
  function redLight(st) {
    if ((redT += 1) % 6) return; // (five times a second is enough)
    const q = Math.abs(st.v) > 3 ? roadNet.nearest(st.x, st.y, 5, st.z, 2.5) : null;
    if (!q) { redAt = null; return; }
    roadNet.at(q.line, q.s, redRq);
    const dir = Math.sin(st.h) * redRq.hx + Math.cos(st.h) * redRq.hy > 0 ? 1 : -1, a = junctions.armAt(q.line, dir > 0 ? 1 : 0);
    const toLine = a ? (dir > 0 ? roadNet.L[q.line].len - q.s : q.s) - a.back : null;
    if (a && redAt && redAt.a === a && redAt.d > 0 && toLine <= 0 && junctions.light(a) === 'r' && a.j.st === 'g' && a.j.ph !== 2 /* (on the arrow your turn may have its green) */ && clockT - redLast > 20) {
      redLast = clockT;
      H.toast('Careful! That light was red.');
    }
    redAt = a ? { a, d: toLine } : null;
  }
  function carStep(dt, fwd, side) {
    const D = myCar.D, st = D.st, ev = [];
    // the autopilot: at the wheel itself (true), or bringing the car onto its lane through the pedals (its inputs)
    const auto = pilot ? pilotStep(dt, fwd, side) : null;
    if (auto && auto !== true) { fwd = auto.fwd; side = auto.turn; }
    else if (!pilot && (assist.lane || assist.cruise)) { const a = assistStep(fwd, side); fwd = a.fwd; side = a.turn; }
    else assist.on.lane = assist.on.cruise = false;
    if (bounds && playing && auto !== true) { const b = bounds.drive(st, fwd, side, myCar.C.half); if (b) { fwd = b.fwd; side = b.side; } } // (braked short of the road works: bounds.js)
    if (auto !== true) D.step(dt, { fwd: Math.max(-1, Math.min(1, fwd)), turn: Math.max(-1, Math.min(1, side)), handbrake: k('Space') },
      { boxes: carBoxes(st.x, st.y, 14, myCar), people: peopleNear(st.x, st.y, 12), posts: postsNear(st.x, st.y, 10) }, ev);
    for (const e of ev) {
      if (e.speed > 2.5) A.thump();
      if (clockT - bumpCar < 2.5 || e.speed < 3) continue;
      bumpCar = clockT;
      if (e.type === 'bump') H.toast(e.what === 'person' ? 'Watch out for people!' : e.what === 'car' ? 'Careful! That was another car.' : e.what === 'lamp' ? 'Careful! That was a lamp post.' : e.what === 'tree' ? 'Careful! That was a tree.' : 'Careful! That was a wall.');
      if (e.type === 'edge') { const ax = st.x + Math.sin(st.h) * 3, ay = st.y + Math.cos(st.h) * 3, up = nav.floorAt(ax, ay, st.z + 2); H.toast(nav.isWater(st.x + Math.sin(st.h) * 5, st.y + Math.cos(st.h) * 5) ? `That's the edge of ${G.water_name || 'the water'}.` : up && up.z > st.z + OECars.CAR_STEP ? 'Too high a step for the car.' : 'Too steep a drop.'); } // (a rise ahead, or the ground falling away)
    }
    if (bounds && playing) bounds.driveHold(st, dt, myCar.C.half);
    Object.assign(player, { x: st.x, y: st.y, z: st.z, h: st.h, speed: st.speed });
    if (!pilot) redLight(st);
    A.car(st.rpm, auto === true ? st.pull || 0 : Math.abs(fwd), 1);
    if (A.indicator) A.indicator(!!st.signal);
    A.skid(Math.min(1, Math.max(0, st.slip - 2.2) / 6));
    player.rig.animate(dt, 0, 'sit', clockT);
  }
  // ------------------------------------------------------------ the autopilot of your own car (J) and the driver assists (I, K): pilot.js
  // (cut out by tools/cut.js, issue 131: the object handed over is what the part asks of the game, the names taken back what it gives)
  let pilotEnd = ''; // (how the last drive ended: 'arrived', 'blocked', or '' for the wheel taken or switched off)
  const { assist, assistStep, assistToggle, carsTick, laneHere, pilotAsk, pilotHud, pilotOff, pilotStep, pilotTo, scenicWeights } = OEGamePilot({ get A() { return A; }, get G() { return G; }, get H() { return H; }, get U() { return U; }, get angDiff() { return angDiff; }, get boxesMeet() { return boxesMeet; }, get cam() { return cam; }, get cars() { return cars; }, get clockT() { return clockT; }, set clockT(v) { clockT = v; }, get crowd() { return crowd; }, get destinations() { return destinations; }, get dlg() { return dlg; }, get driveTo() { return driveTo; }, get driverStep() { return driverStep; }, get eta() { return eta; }, get handGhost() { return handGhost; }, set handGhost(v) { handGhost = v; }, get handGhostT() { return handGhostT; }, set handGhostT(v) { handGhostT = v; }, get junctions() { return junctions; }, get k() { return k; }, get keepSign() { return keepSign; }, get myCar() { return myCar; }, set myCar(v) { myCar = v; }, get nav() { return nav; }, get npcs() { return npcs; }, get pilot() { return pilot; }, set pilot(v) { pilot = v; }, get pilotEnd() { return pilotEnd; }, set pilotEnd(v) { pilotEnd = v; }, get placeOnRoute() { return placeOnRoute; }, get player() { return player; }, get reduced() { return reduced; }, get ride() { return ride; }, set ride(v) { ride = v; }, get rideClock() { return rideClock; }, get rideGuard() { return rideGuard; }, get rideStep() { return rideStep; }, get roadNet() { return roadNet; }, get roads() { return roads; }, get rq() { return rq; }, get save() { return save; }, get scene() { return scene; }, get waypoint() { return waypoint; }, set waypoint(v) { waypoint = v; } });

  // ------------------------------------------------------------ taxis and rides: rides.js
  // (cut out by tools/cut.js, issue 131: the object handed over is what the part asks of the game, the names taken back what it gives)
  const { HELI_IDLE, HELI_REACH, altAction, backAgain, backIn, boardRide, cancelRide, destinations, driverStep, eta, groundZ, hail, kerbAction, leaveRide, orderRide, placeOnRoute, rideAway, rideCar, rideClock, rideGuard, rideStep, skipRide, srnd, turnRound } = OEGameRides({ get $() { return $; }, get A() { return A; }, get CARS_OK() { return CARS_OK; }, get CITY() { return CITY; }, get CR() { return CR; }, get G() { return G; }, get H() { return H; }, get KEEP() { return KEEP; }, get PLAYER_LOOKS() { return PLAYER_LOOKS; }, get rwOf() { return rwOf; }, get SCR_AT() { return SCR_AT; }, get SCR_BOX() { return SCR_BOX; }, get W() { return W; }, get angDiff() { return angDiff; }, get blendFrom() { return blendFrom; }, get cam() { return cam; }, get camera() { return camera; }, get carCfg() { return carCfg; }, get cars() { return cars; }, get cine() { return cine; }, get clockT() { return clockT; }, set clockT(v) { clockT = v; }, get crowd() { return crowd; }, get dlg() { return dlg; }, get driveTo() { return driveTo; }, get fmtSec() { return fmtSec; }, get guideMade() { return guideMade; }, set guideMade(v) { guideMade = v; }, get headlamp() { return headlamp; }, get heliBlock() { return heliBlock; }, get hopTo() { return hopTo; }, get inScramble() { return inScramble; }, get junctions() { return junctions; }, get keepSign() { return keepSign; }, get lib() { return lib; }, set lib(v) { lib = v; }, get life() { return life; }, get makeRig() { return makeRig; }, get metro() { return metro; }, get myCar() { return myCar; }, set myCar(v) { myCar = v; }, get nav() { return nav; }, get npcs() { return npcs; }, get objective() { return objective; }, get phone() { return phone; }, get pickupNear() { return pickupNear; }, get pilot() { return pilot; }, set pilot(v) { pilot = v; }, get placeOf() { return placeOf; }, get player() { return player; }, get resetCar() { return resetCar; }, get ride() { return ride; }, set ride(v) { ride = v; }, get rideSeat() { return rideSeat; }, get roadNet() { return roadNet; }, get roads() { return roads; }, get rq() { return rq; }, get save() { return save; }, get scene() { return scene; }, get smalltalk() { return smalltalk; }, get stepOut() { return stepOut; }, get story() { return story; }, get takeHelm() { return takeHelm; }, get touch() { return touch; }, get vlib() { return vlib; }, set vlib(v) { vlib = v; }, get waypoint() { return waypoint; }, set waypoint(v) { waypoint = v; }, get world() { return world; }, get bounds() { return bounds; } });

  // ------------------------------------------------------------ the phone (N): order a ride, bring your car: handset.js (tools/cut.js)
  const { phone, phoneRender, phoneShow, rideMapFrame, rideOn } = OEGameHandset({ get $() { return $; }, get H() { return H; }, get base() { return base; }, get bringCar() { return bringCar; }, get cancelRide() { return cancelRide; }, get clockT() { return clockT; }, set clockT(v) { clockT = v; }, get destinations() { return destinations; }, get eta() { return eta; }, get fmtSec() { return fmtSec; }, get life() { return life; }, get myCar() { return myCar; }, set myCar(v) { myCar = v; }, get on() { return on; }, get orderRide() { return orderRide; }, get player() { return player; }, get ride() { return ride; }, set ride(v) { ride = v; }, get rideCar() { return rideCar; }, get touch() { return touch; } });

  // ------------------------------------------------------------ trig stations: survey points with a view: trig.js (tools/cut.js)
  const { VP, trigDone } = OEGameTrig({ get G() { return G; }, get W() { return W; }, get lin() { return lin; }, get nav() { return nav; }, get qs() { return qs; }, get world() { return world; } });

  // ------------------------------------------------------------ wildlife: little penguins on their colony's rocks (penguins.js)
  const colonies = (G.wildlife || []).map(c => OEPenguins.create(world, c, A, nav.terrain)).filter(Boolean);
  // and silver gulls round a dropped box of chips by the water (gulls.js), marked on the map
  const flocks = (G.flocks || []).map(f => (f.kind === 'black_kite' ? OEGulls.kites(world, f) : OEGulls.create(world, f, A, nav)));
  // ------------------------------------------------------------ fishing from the shore (docs/FISHING.md). Only where the spots are: fishing.js (tools/cut.js)
  let viewingNoted = false;
  const { dayLimits, fish, fishLoad, fishSpot, fishTick } = OEGameFishing({ get A() { return A; }, get D() { return D; }, set D(v) { D = v; }, get G() { return G; }, get H() { return H; }, get QC() { return QC; }, get S() { return S; }, get cam() { return cam; }, get camera() { return camera; }, get cine() { return cine; }, get cityId() { return cityId; }, get clock() { return clock; }, get clockT() { return clockT; }, set clockT(v) { clockT = v; }, get dlg() { return dlg; }, get fmtMin() { return fmtMin; }, get k() { return k; }, get nav() { return nav; }, get photo() { return photo; }, get player() { return player; }, get qs() { return qs; }, get reduced() { return reduced; }, get renderPassport() { return renderPassport; }, get running() { return running; }, set running(v) { running = v; }, get save() { return save; }, get stage() { return stage; }, get sun() { return sun; }, set sun(v) { sun = v; }, get touch() { return touch; }, get uiOpen() { return uiOpen; }, set uiOpen(v) { uiOpen = v; }, get weather() { return weather; }, get world() { return world; } });

  // ------------------------------------------------------------ objective marker and GPS route in the world: objective.js (tools/cut.js)
  let routeMode = 'on', routePeek = -1; // (clockT until which a line asked for stays up)
  const { ROUTE_PEEK, beam, gold, peekRoute, routeShow, setRouteMode } = OEGameObjective({ get $() { return $; }, get $$() { return $$; }, get G() { return G; }, get H() { return H; }, get U() { return U; }, get cine() { return cine; }, get clockT() { return clockT; }, set clockT(v) { clockT = v; }, get dlg() { return dlg; }, get guide() { return guide; }, get lin() { return lin; }, get objective() { return objective; }, get photo() { return photo; }, get routeMode() { return routeMode; }, set routeMode(v) { routeMode = v; }, get routePeek() { return routePeek; }, set routePeek(v) { routePeek = v; }, get story() { return story; }, get uiOpen() { return uiOpen; }, set uiOpen(v) { uiOpen = v; }, get waypoint() { return waypoint; }, set waypoint(v) { waypoint = v; }, get world() { return world; } });

  // ------------------------------------------------------------ text from the model: modeltext.js (tools/cut.js)
  const { SRC_TEXT, centroid, fill, inPlace, placeByName, said, smalltalk } = OEGameModelText({ get B() { return B; }, get DSM() { return DSM; }, get G() { return G; }, get P() { return P; }, get RAD() { return RAD; }, get S() { return S; }, get clock() { return clock; }, get colonies() { return colonies; }, get dayLimits() { return dayLimits; }, get fmtMin() { return fmtMin; }, get fmtSec() { return fmtSec; }, get nextFerry() { return nextFerry; }, get scene() { return scene; }, get srnd() { return srnd; }, get sun() { return sun; }, set sun(v) { sun = v; }, get touch() { return touch; }, get trainNext() { return trainNext; } });

  // ------------------------------------------------------------ clock: the place's own time, now, running in real time: clock.js (tools/cut.js)
  let sun = null, clockUtc = Date.now();
  const { applySun, clock, setClock } = OEGameClock({ get $() { return $; }, get CITY() { return CITY; }, get MONTHS() { return MONTHS; }, get S() { return S; }, get U() { return U; }, get Wd() { return Wd; }, get clockUtc() { return clockUtc; }, set clockUtc(v) { clockUtc = v; }, get fmtMin() { return fmtMin; }, get glowMat() { return glowMat; }, get headMat() { return headMat; }, get junctions() { return junctions; }, get show() { return show; }, get sun() { return sun; }, set sun(v) { sun = v; }, get weather() { return weather; } });

  // ------------------------------------------------------------ benches in the sun: benches.js (tools/cut.js)
  let benchBudget = 0;
  const { benchLit, benchTalk, fillTimes, menuSync, presetTime, sunWant } = OEGameBenches({ get $() { return $; }, get $$() { return $$; }, get DISTRICT() { return DISTRICT; }, get DSM() { return DSM; }, get G() { return G; }, get S() { return S; }, get clock() { return clock; }, get crowd() { return crowd; }, get fmtMin() { return fmtMin; }, get pad() { return pad; }, get setClock() { return setClock; }, get sun() { return sun; }, set sun(v) { sun = v; }, get weather() { return weather; } });

  // ------------------------------------------------------------ quests, in parallel lines: quests.js (tools/cut.js)
  const { LINES, Q, checkSteps, completeQuest, completeStep, cycleTrack, gaitChip, goals, ls, objective, openLines, qs, quest, renderLines, sideObjectives, step, stepOf, talkTo, trackNear, tracked, wantsTalk } = OEGameQuests({ get $() { return $; }, get A() { return A; }, get G() { return G; }, get H() { return H; }, get MONTHS() { return MONTHS; }, get S() { return S; }, get centroid() { return centroid; }, get clock() { return clock; }, get colonies() { return colonies; }, get dayLimits() { return dayLimits; }, get dlg() { return dlg; }, get fill() { return fill; }, get fmtMin() { return fmtMin; }, get guide() { return guide; }, get heli() { return heli; }, get inPlace() { return inPlace; }, get life() { return life; }, get nav() { return nav; }, get npcById() { return npcById; }, get placeByName() { return placeByName; }, get player() { return player; }, get rail() { return rail; }, set rail(v) { rail = v; }, get renderPassport() { return renderPassport; }, get said() { return said; }, get save() { return save; }, get setClock() { return setClock; }, get smalltalk() { return smalltalk; }, get srnd() { return srnd; }, get story() { return story; }, get sun() { return sun; }, set sun(v) { sun = v; }, get sunState() { return sunState; }, set sunState(v) { sunState = v; }, get touch() { return touch; }, get weather() { return weather; }, get wharfById() { return wharfById; } });

  // ------------------------------------------------------------ save (this browser only)
  const KEY = `bh-game-${cityId}`;
  function save() {
    const car = myCar && [myCar.D.st.x, myCar.D.st.y, myCar.D.st.z, myCar.D.st.h].map(v => Math.round(v * 100) / 100);
    try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), qs, pos: [player.x, player.y, player.z], car, clock: { y: clock.y, m: clock.m, d: clock.d, min: clock.min, scale: clock.scale, own: clock.own } })); } catch (e) { /* storage blocked */ }
  }
  function loadSave() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  // where you stand is kept too, not only at a quest's steps: every half minute of play, and when the tab
  // is put away or the page closes. Not before the game has started (the title would write the spawn
  // over a saved game the player has not chosen to continue yet).
  let playing = false, sndQuiet = A && A.quiet && A.tunes ? 1 : 0, sndQuietAt = 0;
  // A phone's street waits for a page with room for it (audio.js hold and the guard; docs/SOUND.md, "The guard"): held
  // while a level or a person is being sent to the GPU, while the phone's late parts come in, or while frames come slower
  // than 18 a second (the owner's iPhone broke 98 times in six seconds at 17, none at 27 and over), and let go once none
  // of that has been so for three seconds; the context is first made only then (sndQuiet, in the frame). Until the street
  // plays the walk keeps the loading cue (sndCueOut), and a phone whose street gave up, or is off, gets that loop back in
  // its place (sndBed), so play is never silent. Frames are not counted under automation, where a software renderer's
  // frames say nothing of a device (the governor stands still there too): ?guardfps=1 counts them.
  const SND_GUARD = !!(A && A.hold && A.guard && A.tunes), SND_FPS = !navigator.webdriver || /[?&]guardfps=1\b/.test(location.search);
  let sndCueOut = false, sndBed = null, sndFilmAt = -1e9, sndBusyAt = -1e9, sndSlow = false, sndCheckAt = 0, sndLoading = false, lateBusy = false, sndHeldAt = 0;
  function sndHold(now) {
    if (now - sndCheckAt > 250) {
      sndCheckAt = now;
      sndLoading = !!levelHold || lateBusy || !!(hero && hero.levels.some(L => L.state === 'loading')) || npcs.some(n => { if (!n.loading) return false; if (n.sndIn === undefined) { n.sndIn = true; n.loading.finally(() => { n.sndIn = false; }).catch(() => {}); } return n.sndIn; }); // (a person while their character comes: one that failed does not keep the street waiting)
    }
    const ms = gov.frameMs;
    if (SND_FPS) sndSlow = sndSlow ? ms > 45 : ms > 55; // (on below 18 frames a second, off above 22)
    if (sndLoading || sndSlow) sndBusyAt = now;
    return playing && now - sndBusyAt < 3000;
  }
  if (SND_GUARD && A.onGaveUp) A.onGaveUp(() => H.toast('The street\'s sound is off: this phone needs all it has to draw the street. Music plays on. To try the street again, turn Sound off and on in the menu.'));
  const keep = () => { if (playing) save(); };
  on(document, 'visibilitychange', () => { if (document.hidden) keep(); });
  on(window, 'pagehide', keep);
  const keepTimer = setInterval(() => { if (!document.hidden) keep(); }, 30000);
  ac.signal.addEventListener('abort', () => clearInterval(keepTimer));

  // ------------------------------------------------------------ HUD
  const base = H.baseMap(D);
  const drawMini = H.minimap($('#g-minimap'), base);
  const mini = { r: 200 }; // the minimap's radius, eased as it opens out and closes in
  const dlg = H.dialogue(A);
  // ------------------------------------------------------------ daily life (life.js and the modules on it: the day
  // and its diary, bonds, jobs, the phone). The game lends them the clock, the HUD and the player, tells them what
  // happens (life.emit) and asks them what E does at a place of theirs; none of them draws the world.
  const life = window.OELife ? OELife.create({ quiet: () => !!(window.__game && window.__game.shows && window.__game.shows.playing), cityId, cityName: CITY.place || CITY.name, country: CITY.country, G, S, H, A, dlg, $, on, stage, touch, reduced, signal: ac.signal,
    clock, setClock: (...a) => setClock(...a), player, npcs, npcById: id => npcById(id), npcMove: (...a) => npcMove(...a), pilot: () => pilot, fmtMin, said: t => said(t), fill: t => fill(t), get weather() { return weather; },
    get sun() { return sun; }, now: () => clockT, labels: () => scene.labels || {}, travel: () => G.travel || [],
    waypoint: w => { waypoint = w; }, held: () => simHold, place: (x, y, z) => placeNear(x, y, z, null, 30), ground: (x, y) => nav.terrain(x, y), get cam() { return cam; }, world, map: () => toggleMap(), photo: () => photoMode(true), camera, W: (...a) => W(...a), car: () => myCar, ride: () => ride,
    busy: kind => (kind === 'pass' ? player.mode !== 'foot' && !(player.mode === 'car' && myCar.D.st.speed < 1) : cine.active || (overture && overture.active) || OEOnboard.active() || dlg.open || uiOpen() || photo.on || !!closeup || !!arriving) }) : null;
  if (life) {
    if (window.OEDay) OEDay.create(life);
    for (const k of ['OEStyle', 'OEBonds', 'OEJobs', 'OEKeeps', 'OEPhone', 'OEFares', 'OEFx']) if (window[k]) window[k].create(life);
    fetch('data/life.json', { signal: ac.signal }).then(r => r.json()).then(ix => (ix.maps.includes(cityId) ? fetch(`data/${cityId}/life.json`, { signal: ac.signal }).then(r => r.json()) : null)).then(d => life.load(d)).catch(() => {});
  }
  // ------------------------------------------------------------ the story (story.js): a map's episodes, and the Stop, in which
  // the world is given no time while the player walks on. Asked for with ?story=1 while it is being made.
  let storyBeacon = null, storyHere = null, lensWas = null, lensWide = false, storySnapBase = null;
  // the print: the middle of the picture, three by two, as fractions of it from its top left. The story's photograph is
  // cut from it (snap), and its finder's lines are kept inside it (story.js fitFinder), so that what stands in the lines is
  // in the print. On a phone held upright the lines stood twice as tall as the print, and a thing framed in their lower
  // half was ready to be taken and was cut off the print (frame 2's shoeshine pitch, at the foot of the finder)
  const printRect = () => { const W = Math.max(1, canvas.width), H = Math.max(1, canvas.height), sw = Math.min(W, H * 1.5), sh = sw / 1.5; return [(1 - sw / W) / 2, (1 - sh / H) / 2, (1 + sw / W) / 2, (1 + sh / H) / 2]; };
  const relicV = new THREE.Vector3(), relicD = new THREE.Vector3(), relicF = new THREE.Vector3();
  // a disc or a ring of radius r (from r0 to r, shares of r) laid on the ground a walker stands on round at (x, y, its floor z0),
  // 3 cm over it, in the frame of a group placed at (x, y, z0): a polar grid fine enough (20 cm round, 17 cm out at a
  // 4 m place) that a kerb crossed is a step in it. aP: where each point is in the unit disc, for a shader. Flat at
  // one height, a standpoint's edge that reached over a kerb into the road hung over the asphalt and sank under the
  // paving, and only a lone pale arc of it lay across the zebra from the player's feet to the kerb
  function storyDrape(x, y, z0, r, r0 = 0) {
    const NA = Math.max(48, Math.min(160, Math.round(2 * Math.PI * r / 0.2))), NR = Math.max(1, Math.min(32, Math.round(r * (1 - r0) / 0.17))), pos = [], uv = [], idx = [];
    const put = (u, v) => { const g = lineGround(x + u * r, y + v * r, { z: z0, deck: 0 }); pos.push(u * r, (g == null ? 0 : g - z0) + 0.03, -v * r); uv.push(u, v); };
    if (!r0) put(0, 0);
    const first = r0 ? 0 : 1, base = r0 ? 0 : 1;
    for (let i = first; i <= NR; i++) { const f = r0 + (1 - r0) * i / NR; for (let k = 0; k < NA; k++) { const t = k / NA * 2 * Math.PI; put(Math.cos(t) * f, Math.sin(t) * f); } }
    if (!r0) for (let k = 0; k < NA; k++) idx.push(0, 1 + k, 1 + (k + 1) % NA);
    for (let i = 0; i < NR - first; i++) for (let k = 0; k < NA; k++) { const a = base + i * NA + k, b = base + i * NA + (k + 1) % NA, c = a + NA, d = b + NA; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aP', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  }
  let guideMade = null; // (the story's guide as last made: tools/lobby_shot.js)
  const GUIDE_BODY = 0.7; // (the guide's reach from where it stands until his model has said: blender/build_dog.py's Akita, 0.52 m behind to 0.72 m in front)
  // (and once it has, his own: companion.js measures it from the model, so another animal is kept off posts by its size)
  const guideReach = g => (guideMade && guideMade.reach) || GUIDE_BODY * (g.scale || 1);
  // (the boxes round a cell the guide's planner asks of, for its stand: carBoxes(x, y, 4)'s, from one gathering a frame of
  // all within 34 m of where the first ask fell, kept while the asks stay within 30 m of it, issue 206)
  let standAt = null;
  const standBoxes = (x, y) => { if (!standAt || standAt.t !== last || Math.abs(x - standAt.x) > 30 || Math.abs(y - standAt.y) > 30) standAt = { t: last, x, y, b: carBoxes(x, y, 34) }; return standAt.b; };
  // (and while the world is held, nothing stand reads moves (the cars, the trains, the gates, the posts): each answer is
  // kept for the hold, by the place asked to 5 cm. A plan that found no way was made again the next frame on the same
  // grid, 226,000 asks in one talk of frame 3. A post added, moved or taken away, or the world running, and they are
  // asked again)
  let standMemo = null;
  for (const k of ['add', 'move', 'remove']) { const f = posts[k]; posts[k] = (...a) => { standMemo = null; return f.apply(posts, a); }; }
  const standHeld = (x, y, z, ask) => {
    if (!(story && story.stopped && story.scale === 0)) { standMemo = null; return ask(); }
    if (!standMemo || standMemo.size > 250000) standMemo = new Map();
    const k = (Math.round(x * 20) * 100003 + Math.round(y * 20)) * 1000 + Math.round(z * 2);
    let v = standMemo.get(k); if (v === undefined) { v = ask(); standMemo.set(k, v); }
    return v;
  };
  // the way from where a frame is taken to what it is of, kept clear: of the crowd who stand in it, a walker is sent on
  // elsewhere (out of sight, as anyone the crowd is done with) and someone crossing a square or the Scramble steps to
  // the side of it, so that a stopped crowd at a kerb does not stand between the lens and the thing the frame is of (a
  // person waiting at the kerb's edge filled the finder from where the last frame is taken)
  // (half: a lane of that half-width along the whole way, not a sightline widening from a lens: the way someone walks)
  // (whether one of the crowd moved aside to (x, y) stands clear there of the player, the story's people and the guide)
  const roomAt = (x, y) => {
    if (Math.hypot(player.x - x, player.y - y) < 0.75) return false;
    for (const f of storyFigs) if (Math.hypot(f.x - x, f.y - y) < 0.75) return false;
    const g = guideSeg && guideSeg();
    if (g) { const dx = g[2] - g[0], dy = g[3] - g[1], L2 = dx * dx + dy * dy, t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - g[0]) * dx + (y - g[1]) * dy) / L2)) : 0; if (Math.hypot(g[0] + dx * t - x, g[1] + dy * t - y) < g[4] + 0.6) return false; }
    return true;
  };
  // (one of the crowd moved aside: a number of its own for each try, and whether the place is clear of the rest of the crowd)
  const asideHash = (i, k) => { const v = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const asideRoom = (p, x, y) => {
    for (let i = 0, m = Math.min(crowd.active, crowd.P.length); i < m; i++) {
      const o = crowd.P[i];
      if (o === p || (o.line < 0 && !o.pz)) continue;
      const ex = (o.rx ?? o.x) - x, ey = (o.ry ?? o.y) - y;
      if (ex * ex + ey * ey < 0.3) return false; // (0.55 m, middle to middle: shoulder to shoulder)
    }
    return true;
  };
  const clearSight = (a, b, half = 0) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    if (crowd.keep) crowd.keep(a[0], a[1], b[0], b[1], (half || 1.4 + 0.15 * L) + 1); // (and nobody begins to stop or stand about in it while it lasts)
    if (!half && cars && cars.clearLane) cars.clearLane(a[0], a[1], b[0], b[1], 1.4); // (nor a car held in it: a lens's sightline, not the lane someone walks)
    for (const p of crowd.P.slice(0, crowd.active)) {
      if (p.line < 0 && !p.pz) continue;
      // (where it is drawn: in a Stop the drawn place does not catch up with the simulated one, and one drawn in the way
      // and simulated out of it was left standing in someone, issue 65)
      const px = p.rx ?? p.x, py = p.ry ?? p.y;
      const t = (px - a[0]) * ux + (py - a[1]) * uy, side = (px - a[0]) * -uy + (py - a[1]) * ux, w = half || (t < 3.5 ? 3.5 : 1.4 + 0.15 * Math.max(0, t)); // (wider as it goes: a tram's length at 24 m)
      if ((half ? t < -half || t > L + half : t < -2.5 || t > L - 0.6) || Math.abs(side) > w) continue;
      if (!p.pz) { p.line = -1; continue; }
      // (a crosser or one waiting: out past the edge of the way, on the side they stand. Each was put on the edge itself,
      // 0.4 m outside it, so a crowd moved aside stood in two ruled files down the sides of the sightline, facing each
      // other across it: the last frame's finder and frame 6's photograph, issue 75. A crowd that parts keeps its order
      // and its depth: the nearer the middle one stood the nearer the edge it ends, those by the edge up to 3 m beyond
      // it, each a step along the way as chance has it, and never onto another of the crowd or out into a road)
      const sg = Math.sign(side) || 1, D = Math.min(3, w), was = p.pz.road && p.pz.road(px, py);
      let to = sg * (w + 0.4) - side, ok = false;
      for (let k = 0; k < 8 && !ok; k++) {
        const out = sg * (w + 0.4 + (Math.abs(side) / w) * D + k * 0.4) - side, al = (asideHash(p.id, k) - 0.5) * (k ? 1.6 : 0.7), x = px - uy * out + ux * al, y = py + ux * out + uy * al;
        if (roomAt(x, y) && (was || !p.pz.road || !p.pz.road(x, y)) && asideRoom(p, x, y)) { p.x = x; p.y = y; ok = true; }
      }
      if (!ok) {
        for (let k = 0; k < 4 && !roomAt(px - uy * to, py + ux * to); k++) to += sg * 0.5; // (not onto someone not of the crowd, issue 65)
        p.x = px - uy * to; p.y = py + ux * to;
      }
      if (p.T && (p.ph === 'wait' || p.ph === 'linger')) { p.T.x = p.x; p.T.y = p.y; } // (and it waits there, not walking back into the way)
      p.rx = null; // (and drawn there at once: drawn where it was, eased over frames, a held one stayed in the way)
    }
  };
  // ... and round someone the frame is of, so that they stand alone where they stand (the last frame's two, each on a kerb:
  // forty metres off among a held crowd of umbrellas, neither could be found in the print)
  const clearRound = (x, y, r) => {
    if (crowd.keep) crowd.keep(x, y, x, y, r + 1);
    for (let i = 0, m = Math.min(crowd.active, crowd.P.length); i < m; i++) {
      const p = crowd.P[i];
      if (p.line < 0 && !p.pz) continue;
      const dx = (p.rx ?? p.x) - x, dy = (p.ry ?? p.y) - y, d = Math.hypot(dx, dy); // (where it is drawn, as clearSight)
      if (d >= r) continue;
      if (!p.pz) { p.line = -1; if (crowdDraw) crowdDraw.hide(i); continue; } // (and not drawn there this frame either)
      // (out past the ring, as clearSight parts a crowd: those nearest its edge furthest beyond it, not all on one circle)
      const ux = d ? dx / d : 1, uy = d ? dy / d : 0, was = p.pz.road && p.pz.road(x + dx, y + dy);
      let ok = false;
      for (let j = 0; j < 8 && !ok; j++) {
        const R = r + 0.4 + (d / r) * Math.min(2, r) + j * 0.4, a = (asideHash(p.id, j) - 0.5) * (j ? 0.5 : 0.2), c = Math.cos(a), sn = Math.sin(a), qx = x + (ux * c - uy * sn) * R, qy = y + (uy * c + ux * sn) * R;
        if (roomAt(qx, qy) && (was || !p.pz.road || !p.pz.road(qx, qy)) && asideRoom(p, qx, qy)) { p.x = qx; p.y = qy; ok = true; }
      }
      if (!ok) {
        let k = (r + 0.4) / (d || 1);
        for (let j = 0; j < 4 && !roomAt(x + (d ? dx : 1) * k, y + (d ? dy : 0) * k); j++) k += 0.5 / (d || 1); // (not onto someone not of the crowd, issue 65)
        p.x = x + (d ? dx : 1) * k; p.y = y + (d ? dy : 0) * k; // (dx, dy: from where it is drawn)
      }
      if (p.T && (p.ph === 'wait' || p.ph === 'linger')) { p.T.x = p.x; p.T.y = p.y; }
      p.rx = null;
    }
  };
  // the camera of a conversation (talkcam.js): the story's people, where they stand, and what stands round them
  const storyFigs = new Set();
  const talkCam = window.OETalkCam ? OETalkCam.create({
    walls: (a, b) => nav.clearFraction(W(a[0], a[1], a[2]), W(b[0], b[1], b[2])),
    trees: (x, y, r) => postsNear(x, y, r).filter(q => q.kind === 'tree' || q.kind === 'lamp'),
    bodies: (x, y, r) => {
      const out = [{ id: 'player', x: player.x, y: player.y, z: player.z }];
      for (const f of storyFigs) out.push({ id: f.id, x: f.x, y: f.y, z: f.z });
      for (const n of npcs) if (!n.away && Math.abs(n.x - x) < r && Math.abs(n.y - y) < r) out.push({ id: `npc:${n.id}`, x: n.x, y: n.y, z: n.z });
      // (the crowd where each is drawn, rx: held in a Stop, that is not always where it is simulated)
      if (crowd && crowd.P) for (let i = 0, m = Math.min(crowd.active, crowd.P.length); i < m; i++) { const q = crowd.P[i], qx = q.rx ?? q.x, qy = q.ry ?? q.y; if ((q.line >= 0 || q.pz) && Math.abs(qx - x) < r && Math.abs(qy - y) < r) out.push({ id: `crowd:${i}`, crowd: i, x: qx, y: qy, z: q.rz ?? q.z ?? nav.terrain(qx, qy) }); } // (one at a scramble's kerb is drawn whatever its line)
      return out;
    } }) : null;
  // those standing among the crowd who are not of it, for the crowd to keep clear of as it keeps clear of the player
  // (actors.js api.bodies, issue 65): the story's people while they are drawn, the guide along his spine, the map's NPCs.
  // The one a talk is with is given the room of the talk camera's ring (talkcam.js RING), so that nobody of the crowd
  // comes to stand at the shoulder of a long shot such as the summation
  const keepList = [];
  // (you: the player as one of them, where the crowd is stepped without the player: under the title and the opening shots,
  // where a waiter at Sumiko's kerb stood inside Kagami)
  // (one on the move is kept clear of a half second ahead too: the crowd steps aside for them before they get there)
  const keepWas = new Map();
  const crowdKeep = (cx, cy, you = false, dt = 0) => {
    let n = 0;
    const put = (ax, ay, bx, by, r) => { const k = keepList[n] || (keepList[n] = {}); k.ax = ax; k.ay = ay; k.bx = bx; k.by = by; k.r = r; n++; };
    if (you && player.mode === 'foot' && player.rig.root.visible) put(player.x, player.y, player.x, player.y, 0.15);
    const near = (x, y) => Math.abs(x - cx) < 150 && Math.abs(y - cy) < 150;
    const sp = talkCam && talkCam.on ? talkCam.talk.speaker.id : null;
    // (an afterimage too before it is drawn: it is drawn in the Stop, where the held crowd cannot step out of it)
    for (const f of storyFigs) if (near(f.x, f.y)) {
      put(f.x, f.y, f.x, f.y, sp === f.id ? 1.0 : 0.15);
      if (f.to) { const dx = f.to[0] - f.x, dy = f.to[1] - f.y, d = Math.hypot(dx, dy) || 1, a = Math.min(d, f.to[2] * 0.6); put(f.x, f.y, f.x + dx / d * a, f.y + dy / d * a, 0.15); }
    }
    for (const q of npcs) if (near(q.x, q.y)) put(q.x, q.y, q.x, q.y, sp === `npc:${q.id}` ? 1.0 : 0.15);
    const g = guideSeg();
    if (g && near(g[0], g[1])) {
      put(g[0], g[1], g[2], g[3], g[4] + 0.15); // (and a hand's width more: he moves among them, and they step aside after he has)
      // (and where he is going: the end of his spine that leads, carried on a half second at the pace he goes)
      const mx = (g[0] + g[2]) / 2, my = (g[1] + g[3]) / 2, w = keepWas.get('guide');
      if (w && dt > 0) {
        const vx = (mx - w[0]) / dt, vy = (my - w[1]) / dt, v = Math.hypot(vx, vy);
        if (v > 0.2 && v < 8) { const e = (g[0] - mx) * vx + (g[1] - my) * vy > 0 ? [g[0], g[1]] : [g[2], g[3]]; put(e[0], e[1], e[0] + vx * 0.5, e[1] + vy * 0.5, g[4]); }
      }
      keepWas.set('guide', [mx, my]);
    }
    keepList.length = n;
    return keepList;
  };
  // the guide as the crowd sees him: the ends of his spine and half his width [ax, ay, bx, by, flank], or null when he is
  // not on the street (the point of his spine nearest four far points, two of which lie past its ends)
  const guideSeg = () => {
    const gd = guideMade;
    if (!(gd && gd.ready && gd.root && gd.root.visible && gd.state !== 'away' && gd.spineNear)) return null;
    const E = [[1e3, 0], [-1e3, 0], [0, 1e3], [0, -1e3]].map(([u, v]) => gd.spineNear(gd.x + u, gd.y + v));
    const a = Math.hypot(E[0][0] - E[1][0], E[0][1] - E[1][1]) >= Math.hypot(E[2][0] - E[3][0], E[2][1] - E[3][1]) ? [E[0], E[1]] : [E[2], E[3]];
    const b = gd.body;
    return [a[0][0], a[0][1], a[1][0], a[1][1], (b && b.flank) || 0.2, gd.z];
  };
  // whether the guide moved from (x0, y0) to (x1, y1) keeps his spine clear of the crowd as it is drawn: a step that comes
  // within his flank and a shoulder of someone, closer than he was, is not taken (one away from them always is)
  const guideClear = (x0, y0, x1, y1) => {
    const g = guideSeg();
    if (!g || !crowd || !crowd.P || (x0 === x1 && y0 === y1)) return true;
    const ox = x1 - x0, oy = y1 - y0, need = g[4] + 0.3;
    const room = (ax, ay, bx, by, x, y) => { const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0; return Math.hypot(ax + dx * t - x, ay + dy * t - y); };
    for (let i = 0, m = Math.min(crowd.active, crowd.P.length); i < m; i++) {
      const q = crowd.P[i];
      if (!(q.line >= 0 || q.pz) || (crowdDraw && !crowdDraw.shows(i))) continue;
      const x = q.rx ?? q.x, y = q.ry ?? q.y;
      if (Math.abs(x - x1) > 2.5 || Math.abs(y - y1) > 2.5 || Math.abs((q.rz ?? q.z ?? g[5]) - g[5]) > 1.5) continue;
      const after = room(g[0] + ox, g[1] + oy, g[2] + ox, g[3] + oy, x, y);
      if (after < need && after < room(g[0], g[1], g[2], g[3], x, y) - 1e-4) return false;
    }
    return true;
  };
  // for tools/story_play.js, which sets window.__bodies to an array: each time one of the crowd is drawn (near or far
  // copy) within 0.45 m of one of the story's people, the player or the guide (no: an NPC), on the same level, who and where
  // and when, once while it lasts with the closest it came (issue 65)
  const bodiesOn = new Map();
  // who the crowd must not be drawn in: [name, ax, ay, bx, by, z, less] (less: taken off the distance to the segment)
  const bodiesWho = withNpcs => {
    const who = [];
    if (player.mode === 'foot' && player.rig.root.visible) who.push(['you', player.x, player.y, player.x, player.y, player.z, 0]);
    for (const f of storyFigs) if (!(f.rig && f.rig.root && !f.rig.root.visible)) who.push([`${f.name || f.id}${f.seen < 30 ? ` (put there ${f.seen} frames before)` : ''}`, f.x, f.y, f.x, f.y, f.z, 0]);
    const g = guideSeg();
    if (g) who.push(['guide', g[0], g[1], g[2], g[3], g[5], g[4] - 0.2]); // (from his spine less the flank a person's own centre to its edge is held to)
    if (withNpcs) for (const q of npcs) if (!(q.rig && q.rig.root && !q.rig.root.visible)) who.push([`npc ${q.name || q.id}`, q.x, q.y, q.x, q.y, q.z, 0]);
    return who;
  };
  // The last guard, each frame before it is drawn: one of the crowd drawn inside the player, one of the story's people or
  // the guide (within 0.45 m), whatever brought it there (the world held in a Stop, where nobody can step aside; someone
  // set down by the story beside a held waiter; the crowd not stepped at all), is moved out of them and not drawn this
  // frame: one at a scramble out to a shoulder's width from them, a walker sent on elsewhere. The crowd's own steering
  // (crowdKeep) is what keeps them clear; this is what is left. tools/story_play.js counts every time it acts (issue 65)
  const guardOn = new Map();
  const bodiesGuard = () => {
    if (!crowd || !crowd.P) return;
    for (const f of storyFigs) f.seen = (f.seen || 0) + 1;
    const who = bodiesWho(false);
    if (!who.length) return;
    const now = window.__guarded ? new Set() : null;
    for (let i = 0, m = Math.min(crowd.active, crowd.P.length); i < m; i++) {
      const q = crowd.P[i];
      if (!(q.line >= 0 || q.pz) || (crowdDraw && !crowdDraw.shows(i))) continue;
      const x = q.rx ?? q.x, y = q.ry ?? q.y, z = q.rz ?? q.z ?? 0;
      for (const w of who) {
        if (Math.abs(w[1] - x) > 3 || Math.abs(w[2] - y) > 3 || Math.abs((w[5] ?? z) - z) > 1.5) continue;
        const dx = w[3] - w[1], dy = w[4] - w[2], L2 = dx * dx + dy * dy, t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - w[1]) * dx + (y - w[2]) * dy) / L2)) : 0;
        const cx = w[1] + dx * t, cy = w[2] + dy * t, e = Math.hypot(cx - x, cy - y);
        if (e - w[6] >= 0.45) continue;
        if (q.pz) {
          const k = (w[6] + 0.6) / (e || 1), ex = e ? x - cx : 1, ey = e ? y - cy : 0;
          q.x = cx + ex * k; q.y = cy + ey * k; q.rx = null;
          if (q.T && (q.ph === 'wait' || q.ph === 'linger')) { q.T.x = q.x; q.T.y = q.y; }
        } else q.line = -1;
        if (crowdDraw) crowdDraw.hide(i);
        if (now) {
          const key = `${w[0].replace(/ \(put there.*$/, '')}|${i}`; now.add(key);
          if (!guardOn.has(key)) { const r = { who: w[0], crowd: i, d: +(e - w[6]).toFixed(3), at: bodiesAt(), x: +x.toFixed(2), y: +y.toFixed(2), ph: q.pz ? q.ph : 'footway' }; guardOn.set(key, r); window.__guarded.push(r); }
        }
        break;
      }
    }
    if (now) for (const k of guardOn.keys()) if (!now.has(k)) guardOn.delete(k);
  };
  const bodiesAt = () => (story && story.state ? `frame ${story.state.fi + 1} ${story.state.phase}${story.state.beat != null ? ` ${story.state.beat}` : ''}${story.stopped ? ' (Stop)' : ''}${talkShot ? ' (talk)' : ''}` : '');
  const bodiesCheck = () => {
    const B = window.__bodies;
    if (!crowd || !crowd.P || B.length > 300) return;
    const who = bodiesWho(true);
    const at = bodiesAt();
    const now = new Set();
    for (let i = 0, m = Math.min(crowd.active, crowd.P.length); i < m; i++) {
      const q = crowd.P[i];
      if (!(q.line >= 0 || q.pz) || (crowdDraw && !crowdDraw.shows(i))) continue;
      const x = q.rx ?? q.x, y = q.ry ?? q.y, z = q.rz ?? q.z ?? 0;
      for (const w of who) {
        if (Math.abs(w[1] - x) > 3 || Math.abs(w[2] - y) > 3 || Math.abs((w[5] ?? z) - z) > 1.5) continue;
        const dx = w[3] - w[1], dy = w[4] - w[2], L2 = dx * dx + dy * dy, t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - w[1]) * dx + (y - w[2]) * dy) / L2)) : 0;
        const d = Math.hypot(w[1] + dx * t - x, w[2] + dy * t - y) - w[6];
        if (d >= 0.45) continue;
        const key = `${w[0].replace(/ \(put there.*$/, '')}|${i}`; now.add(key);
        const e = bodiesOn.get(key);
        if (e) { if (d < e.d) e.d = +d.toFixed(3); e.n++; }
        else { const r = { who: w[0], crowd: i, d: +d.toFixed(3), at, x: +x.toFixed(2), y: +y.toFixed(2), ph: `${q.pz ? q.ph : 'footway'}${Math.hypot(q.x - x, q.y - y) > 0.05 ? `, drawn ${Math.hypot(q.x - x, q.y - y).toFixed(2)} m behind` : ''}`, n: 1 }; bodiesOn.set(key, r); B.push(r); }
      }
    }
    for (const k of bodiesOn.keys()) if (!now.has(k)) bodiesOn.delete(k);
  };
  let talkShot = null, talkPrint = false, talkTyped = '';
  const talkText = document.getElementById('gd-text'), talkBox = document.getElementById('gd');
  // the share of the frame's height the dialogue's words cover, from its foot (issue 76: the talk's shot is composed
  // above them; at their largest they took the lower 28% of a desktop's frame, and Yuna's body under them)
  const talkPanel = () => {
    if (!talkBox || talkBox.hidden) return 0;
    const b = talkBox.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    return b.height > 0 && c.height > 0 ? Math.max(0, Math.min(0.7, (c.bottom - b.top) / c.height)) : 0;
  };
  // the talk's lens shift (camera.setViewOffset): set at a cut, eased as the words grow (a question's answers come in
  // under them) and back to none as the talk gives way to the chase view, over the same half second
  const talkLens = { shift: 0, t: 0 };
  const talkShift = (want, snap) => {
    const now = performance.now(), dt = Math.min(0.1, Math.max(0, (now - talkLens.t) / 1000)); talkLens.t = now;
    talkLens.shift = snap ? want : talkLens.shift + (want - talkLens.shift) * Math.min(1, dt * 6);
    if (!want && Math.abs(talkLens.shift) < 1e-3) talkLens.shift = 0;
    if (talkLens.shift) camera.setViewOffset(camera.aspect, 1, 0, talkLens.shift, camera.aspect, 1);
    else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  };
  // who is speaking, by the name the story gives them: the nearest of its people (or of the map's) with that name
  const talkSpeaker = who => {
    const nm = who && who.name; let best = null, bd = 40;
    const live = (id, src, eye) => ({ id, name: nm, eye, get x() { return src.x; }, get y() { return src.y; }, get z() { return src.z; } });
    for (const f of storyFigs) { const d = Math.hypot(f.x - player.x, f.y - player.y); if (f.name === nm && d < bd) { bd = d; best = live(f.id, f, f.eye); } }
    if (!best) for (const n of npcs) { const d = Math.hypot(n.x - player.x, n.y - player.y); if (n.name === nm && d < bd) { bd = d; best = live(`npc:${n.id}`, n, 1.58); } }
    return best;
  };
  // ... and the one who says it, if they stand here to be seen (a living one of the story's people, or a map's NPC, by
  // name, within 15 m): they talk while it is said and listen while your answer is waited for (the NPCs' loop,
  // storyFigure). done, wrapped to let them go when the box closes
  const talking = (who, done) => {
    const nm = who && who.name; let t = null, bd = 15;
    if (nm) for (const f of storyFigs) { const d = Math.hypot(f.x - player.x, f.y - player.y); if (!f.ghost && f.name === nm && d < bd) { bd = d; t = f; } }
    if (nm && !t) for (const n of npcs) { const d = Math.hypot(n.x - player.x, n.y - player.y); if (!n.away && n.name === nm && d < bd) { bd = d; t = n; } }
    if (!t) return done;
    t.talking = true;
    return (...a) => { t.talking = false; if (done) return done(...a); };
  };
  // a line said (who: as story.js gives it; choices: the answers under it): which shot it is cut to
  const talkLine = (who, choices) => {
    if (!talkCam || player.mode !== 'foot') return;
    const sp = talkSpeaker(who), next = talkPrint ? 'close' : null;
    talkPrint = false;
    if (!sp && !talkCam.talk && !(choices && choices.length)) return; // (a voice with nobody here: the office on the phone)
    talkCam.open(sp, { x: player.x, y: player.y, z: player.z, eye: 1.58 }, sp ? next : 'reverse');
    talkTyped = '';
  };
  // The walk's people with something to say (walktalk.js; game.json walk): a speech mark over each, E beside them, their
  // talk in the story's box and camera, and what they ask under the hour in the walk's corner
  // What a mark over the picture may do (marks.js, docs/MARKS.md): not over the player's body, nor anyone drawn in front
  // of its point, nor through a wall, a deck or a floor; and only within its reach. Every world-space mark asks it
  const marks = OEMarks.create({ camera, W, size: () => [stageW, stageH],
    // (the player's figure: on foot her body, 1.8 m with her hair and 0.3 m round at the shoulders; in her car the car's;
    // not drawn, or in the air, none)
    body: () => {
      if (!player.rig.root.visible || player.mode === 'heli' || player.mode === 'lift') return null;
      if (player.mode === 'car' && myCar) return { x: myCar.D.st.x, y: myCar.D.st.y, z: myCar.D.st.z, h: 1.55, r: 1.0 };
      if (player.mode !== 'foot' && player.mode !== 'seat') return null;
      return { x: player.x, y: player.y, z: player.z, h: player.mode === 'seat' ? 1.35 : 1.8, r: 0.3 };
    },
    from: () => { const m = player.mode, o = m === 'car' && myCar ? myCar.D.st : m === 'heli' ? heli.st : player; return o; },
    // (those drawn near the eye: the map's people, the story's figures and the crowd as drawn)
    people: (cx, cy, cz, reach) => {
      const out = [], by = (x, y) => Math.abs(x - cx) < reach && Math.abs(y - cy) < reach;
      for (const n of npcs) if (!n.away && n.rig && n.rig.root.visible && by(n.x, n.y)) out.push({ x: n.x, y: n.y, z: n.z, h: n.sit ? 1.3 : 1.7, r: 0.26, who: n });
      for (const f of storyFigs) if (!(f.rig && f.rig.root && !f.rig.root.visible) && by(f.x, f.y)) out.push({ x: f.x, y: f.y, z: f.z || 0, h: 1.7, r: 0.26, who: f });
      if (guideMade && guideMade.ready && guideMade.root && guideMade.root.visible && by(guideMade.x, guideMade.y)) out.push({ x: guideMade.x, y: guideMade.y, z: guideMade.z, h: 0.75, r: 0.32, who: guideMade });
      if (crowd && crowd.P) for (let i = 0, m = Math.min(crowd.active, crowd.P.length); i < m; i++) {
        const q = crowd.P[i];
        if (!(q.line >= 0 || q.pz) || (crowdDraw && !crowdDraw.shows(i))) continue;
        const qx = q.rx ?? q.x, qy = q.ry ?? q.y;
        if (by(qx, qy)) out.push({ x: qx, y: qy, z: q.rz ?? q.z ?? 0, h: q.state === 'sit' ? 1.3 : 1.7, r: 0.24, who: q });
      }
      return out;
    },
    solid: (cx, cy, cz, x, y, z) => nav.col.pick(cx, cy, cz, x, y, z) });
  const markV = new THREE.Vector3(), seeM = new THREE.Matrix4(), seeF = new THREE.Frustum();
  const sees = (x, y, z) => { seeM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); seeF.setFromProjectionMatrix(seeM); return seeF.containsPoint(markV.set(x, z, -y)); };
  const walkTalk = window.OEWalkTalk && G.walk && G.story && !new URLSearchParams(location.search).has('walk') ? OEWalkTalk.create({ data: G.walk, stage,
    project: (x, y, z) => { markV.set(x, z, -y).project(camera); return markV.z > 1 || markV.z < -1 ? null : { x: (markV.x + 1) / 2 * stageW, y: (1 - markV.y) / 2 * stageH }; },
    see: (x, y, z, o) => marks.see(x, y, z, o),
    npc: id => npcById(id),
    here: () => { const m = player.mode, o = m === 'car' && myCar ? myCar.D.st : m === 'heli' ? heli.st : player; return { x: o.x, y: o.y, z: o.z, mode: m }; },
    places: () => seatMarks(), // (somewhere to sit, until it has been sat on once: its mark, as the street's offer of it)
    say: (runs, done) => { // one speaker after another, each in the box and the conversation's camera
      // (and everyone in the talk who is not speaking listens to the one who is: the NPCs' loop)
      const all = [...new Set(runs.map(r => r[0]))];
      let i = 0;
      const next = () => {
        if (i >= runs.length) { for (const m of all) m.listening = null; done(); return; }
        const [n, lines] = runs[i++];
        for (const m of all) m.listening = m === n ? null : n;
        n.talking = true; A.start();
        talkLine({ name: n.name });
        dlg.show(n, lines, null, () => { n.talking = false; next(); });
      };
      next();
    },
    // a call-out (walktalk.js bark): a wave to you from where they stand, as someone calls a stranger over
    called: n => { if (n.rig && !n.talking && !n.walkSpeed && !n.sit) n.rig.wave(clockT + n.pitch); },
    fill: t => said(t),
    unseen: n => !sees(n.x, n.y, n.z + 1) || Math.hypot(n.x - player.x, n.y - player.y) > 70,
    seen: (x, y, z) => { const c = camera.position; return !nav.col.pick(c.x, -c.z, c.y, x, y, z); }, // (a head in sight: no solid between the camera and it)
    // the way to someone on another level: the stop on the player's level of a lift with a stop on theirs, the nearest
    via: (me, who) => {
      let best = null, bd = Infinity;
      for (const l of lifts) {
        if (!l.stops.some(s => Math.abs(s.at[2] - (who.z || 0)) < 15 && Math.hypot(s.at[0] - who.x, s.at[1] - who.y) < 80)) continue;
        for (const s of l.stops) { const d = Math.hypot(s.at[0] - me.x, s.at[1] - me.y); if (Math.abs(s.at[2] - me.z) < 15 && d < bd) { bd = d; best = { x: s.at[0], y: s.at[1], z: s.at[2] }; } }
      }
      return best;
    },
    move: (m, to) => { // someone sent on ahead, there when you come back: beside the one they were to meet, facing them
      const a = Math.atan2(player.x - to.x, player.y - to.y) + 1.4;
      if (!npcMove(m, [to.x + Math.sin(a) * 1.1, to.y + Math.cos(a) * 1.1])) return;
      m.h = Math.atan2(to.x - m.x, to.y - m.y); m.rig.root.rotation.y = Math.PI - m.h;
      to.h = Math.atan2(m.x - to.x, m.y - to.y); to.rig.root.rotation.y = Math.PI - to.h;
    },
    // the walk's line (walktalk.js, its incident): someone who walks (the story's own figure, alive), a small thing lying
    // on the ground, and one of the walk's people moved a step or stood somewhere else
    figure: (a, at) => storyFigure(Object.assign({ alive: true }, a), [at[0], at[1], at[2] != null ? at[2] : Math.max(0, nav.terrain(at[0], at[1]))]), // (where the line puts them exactly: a place found for them was four metres off, in the road)
    thing: (x, y, o = {}) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(o.w || 0.075, o.h || 0.009, o.d || 0.152), new THREE.MeshStandardMaterial({ color: o.color || 0x14171c, emissive: o.glow || 0x8fa6d8, emissiveIntensity: o.glow === 0 ? 0 : 0.85, roughness: 0.25 }));
      m.position.copy(W(x, y, Math.max(0, nav.terrain(x, y)) + (o.h || 0.009) / 2 + 0.004)); m.rotation.y = o.yaw || 0;
      world.add(m);
      return { remove() { world.remove(m); m.geometry.dispose(); m.material.dispose(); } };
    },
    shift: (n, x, y, h) => { n.x = x; n.y = y; n.z = Math.max(0, nav.terrain(x, y)); if (h != null) n.h = h; n.rig.root.position.copy(W(n.x, n.y, n.z)); n.rig.root.rotation.y = Math.PI - n.h; if (n.post) posts.move(n.post, n.x, n.y, n.z); },
    put: (n, at, to) => { if (!npcMove(n, at)) return false; if (to) { n.h = Math.atan2(to[0] - n.x, to[1] - n.y); n.rig.root.rotation.y = Math.PI - n.h; } return true; },
    thud: () => { try { if (A.thump) A.thump(); } catch (e) { /* no sound */ } },
    waitWith: (n, plan) => waitWith(n, plan), // (sat beside someone on Hachiko's wall while the night passes: below)
    clockMin: () => clock.min,
    snapped: () => { A.shutter(); stage.classList.remove('flash'); void stage.offsetWidth; stage.classList.add('flash'); }, // (someone takes your picture: the shutter and the flash, no picture of your own)
    loaded: c => !lib || !!lib.tpl[c], // (a character come: until then whoever is made of it is somebody standing in)
    met: () => { if (walkUi && walkUi.flash) walkUi.flash(); },
    told: (title, n, of) => { if (walkUi && walkUi.told) walkUi.told(title, n, of); },
    view: (v, n, of) => { if (walkUi && walkUi.told) walkUi.told(v.name, n, of, 'view'); A.chime(); }, // (a view of Shibuya found: its name over the street, and a chime)
    when: () => `${clock.d} ${MONTHS[clock.m - 1]}, ${fmtMin(clock.min)}`,
    // a street moment's people (walktalk.js events): put where they would stand, out of sight, facing what they look at
    // (the crossing, or the one they are with), in the crowd's way, and drawn once their model has come; and away again
    place: (n, at, faceTo) => {
      if (n.away) { n.away = false; n.rig.root.visible = true; n.post = posts.add(n.x, n.y, n.z, 0.22, 'npc'); }
      npcMove(n, at);
      const t = faceTo || { x: 368, y: -1002 }; n.h = Math.atan2(t.x - n.x, t.y - n.y); n.rig.root.rotation.y = Math.PI - n.h;
    },
    hide: n => { n.away = true; n.talking = false; n.listening = null; n.walkSpeed = 0; n.rig.root.visible = false; if (n.post) posts.move(n.post, 1e7, 1e7, 0); },
    // someone of a street moment walking: a step on the ground (its floor or the terrain), turned the way they go, in the
    // crowd's way as they go, and walking as fast as the step (the NPCs' loop animates them by n.walkSpeed)
    step: (n, x, y, h, speed) => {
      const f = nav.floorAt(x, y, (n.z || 0) + 1);
      n.x = x; n.y = y; n.z = f ? f.z : Math.max(0, nav.terrain(x, y)); n.h = h; n.walkSpeed = speed;
      n.rig.root.position.copy(W(n.x, n.y, n.z)); n.rig.root.rotation.y = Math.PI - n.h;
      if (n.post) posts.move(n.post, n.x, n.y, n.z);
    },
    // a clear way on foot from one point to another: a floor all along, no step up or down a person would not take, off
    // the road, and no post, trunk or bench in the way
    clear: (x0, y0, x1, y1) => {
      const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(d / 0.8));
      const f0 = nav.floorAt(x0, y0, (groundZ(x0, y0) ?? Math.max(0, nav.terrain(x0, y0))) + 1);
      let z = f0 ? f0.z : null;
      if (z == null) return false;
      for (let i = 1; i <= n; i++) {
        const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n, f = nav.floorAt(x, y, z + 0.6);
        if (!f || Math.abs(f.z - z) > 0.35 || inRoad(x, y, f.z, 0.3) || posts.pushOut(x, y, 0.35, f.z).hit) return false;
        z = f.z;
      }
      return true;
    },
    unseenAt: (x, y, z) => !sees(x, y, z),
    ask: (n, lines, choices, done) => { n.talking = true; A.start(); talkLine({ name: n.name }, choices); dlg.show(n, lines, choices, c => { n.talking = false; done(c); }); } }) : null;
  const stopFx = window.OEStopFX ? OEStopFX.create({ THREE, world, audio: () => A.ctx, sound: () => { const c = $('#gm-sound'); return !c || c.checked; }, floor: (x, y, z) => { const f = nav.floorAt(x, y, z); return f ? f.z : null; } }) : null; // what hangs in the air of a stopped world (stopfx.js)
  const past = window.OEPast ? OEPast.create({ THREE, world }) : null; // what only the story's camera sees (past.js)
  // someone the story places: an afterimage (someone of another year, in an old exposure laid over tonight, who moves in the stopped
  // world) or, with a.alive, a living person of this evening. Stood where there is room near `at`, or at at[2] exactly
  // An afterimage looked for across a held street (story.js seek: glow): the halation an old exposure has round its
  // brightest part, a soft pale column about them that the eye finds among the held crowd from across the crossing, and
  // that fades as you come near, so that close to they are only a person. In the first Stop players looked for her for
  // four minutes among hundreds of people standing as still as she did (November 2026)
  let haloTex = null;
  const haloMap = () => {
    if (haloTex) return haloTex;
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 64, 0, 32, 64, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.setTransform(1, 0, 0, 2, 0, -64); x.fillStyle = g; x.fillRect(0, 0, 64, 128); // (an ellipse twice as tall as it is wide: a standing figure's)
    haloTex = new THREE.CanvasTexture(c); if ('colorSpace' in haloTex) haloTex.colorSpace = THREE.SRGBColorSpace;
    return haloTex;
  };
  // (an afterimage's look compiled before the Stop it stands in, as the title waits: people.js exposure makes a program of
  // its own for each of their materials, and each Stop's afterimage, made under the flash, linked three to five of them in
  // the Stop's first frames, with the halation's when it first came up: a frame of 0.2 to 2.9 s on a session's machine,
  // and taps that waited 3.7 s on an iPhone, issue 206. One rig of each, never shown, the exposure laid on, compiled)
  const warmGhosts = () => {
    if (!lib || !G.story || !OEPeople.exposure) return Promise.resolve();
    // (the frame the case is at first: a story taken up again at its Stop finds its afterimage made; the rest in order)
    const who = new Set(), at = story && story.state ? story.state.fi || 0 : 0;
    for (const ep of G.story.episodes || []) { const F = ep.frames || []; for (const fr of [...F.slice(at), ...F.slice(0, at)]) for (const a of [fr.afterimage, fr.afterimage2]) if (a && a.character && !a.alive) who.add(a.character); }
    let p = Promise.resolve(), halo = true;
    for (const c of who) p = p.then(() => lib.require(c)).then(() => {
      if (!lib.tpl[c]) return null;
      // (two of them: one still, one with its face's shapes live, as it is while it speaks, face.js: a program of its own)
      const g = new THREE.Group(), r = makeRig({ character: c }), q = makeRig({ character: c });
      for (const x of [r, q]) { OEPeople.exposure(x.root); x.animate(0, 0, 'ground', 0); g.add(x.root); }
      if (q.face) q.face.after(0, {});
      if (halo) { halo = false; g.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: haloMap(), color: 0xd6e4ff, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))); }
      return warmFor(g).then(() => { if (q.face) q.face.rest(); });
    }).catch(() => null);
    return p;
  };
  const storyFigure = (a, at) => {
    // (someone old, a.age: a head shorter than the model was made, and bent a little at the back and the neck)
    const old = a.alive && a.age >= 70, bend = [], look = [];
    let rig = makeRig({ character: a.character, scale: old ? 0.93 : 1 }), gone = false;
    // (an afterimage: a person in an old exposure laid over tonight's street, people.js exposure; and the one thing
    // that tells them from the held crowd is that they move: the head turns to the player, the body follows only
    // when the head cannot reach)
    const dress = r => {
      bend.length = 0; look.length = 0;
      r.faceLater = true; // (its eyes after the head's turn: faceAfter at the end of animate)
      // (the back only: the same turn at the neck threw her head back)
      if (old) r.root.traverse(o => { if (o.isBone && /Spine1$|Spine2$/.test(o.name)) bend.push(o); });
      if (!a.alive) {
        if (OEPeople.exposure) OEPeople.exposure(r.root);
        r.root.traverse(o => { if (o.isBone && /Neck$/.test(o.name)) look[0] = o; else if (o.isBone && /Head$/.test(o.name)) look[1] = o; });
      }
    };
    dress(rig);
    const p = at[2] != null ? { x: at[0], y: at[1], z: at[2] } : npcSpot({ id: `story-${a.name || a.character}`, r: 0.3 }, at);
    const f = { x: p.x, y: p.y, z: p.z, to: null, name: a.name || '', character: a.character, id: `story:${a.name || a.character}:${storyFigs.size}`, eye: 1.58 * (old ? 0.93 : 1), ghost: !a.alive };
    storyFigs.add(f);
    // (and nobody of the crowd where they are put: in a Stop the held crowd cannot step out of them, and one stood inside
    // the last frame's afterimage as it formed, issue 65)
    if (crowd && crowd.P) clearRound(f.x, f.y, 0.6);
    // (and a place of their own, as a map's NPC has: the player's step stops at their shoulder, the guide keeps his body
    // off them and a car brakes for them. Until issue 126 nothing held the player out of the story's own people: frame 6's
    // goal sent the player to the stone blossom the old man stands on, and the two stood in one body. An afterimage too:
    // it is somebody standing there)
    f.post = posts.add(f.x, f.y, f.z, 0.28, 'story'); // (a hand's width more than an NPC's: run at, the player's leading hand reached 6 cm into a chest at 0.22)
    const put = () => { rig.root.position.copy(W(f.x, f.y, f.z)); posts.move(f.post, f.x, f.y, f.z); };
    put(); world.add(rig.root);
    // (made before their own character had come, they are someone else standing in for them, people.js: the moment
    // it comes they are themselves, where they stood and facing as they faced. Five of the cast were one man in a vest)
    if (lib && a.character && !lib.tpl[a.character] && (lib.npcs[a.character] || lib.heroes[a.character] || lib.info.characters[a.character]))
      Promise.resolve(lib.require(a.character)).then(() => {
        if (gone || !lib.tpl[a.character]) return;
        const r = makeRig({ character: a.character, scale: old ? 0.93 : 1 });
        dress(r);
        r.root.position.copy(rig.root.position); r.root.rotation.copy(rig.root.rotation);
        r.animate(0, 0, 'ground', t); // (posed before it is put in the world, as npcLoad's are: issue 76)
        if (rig.face) rig.face.rest(); world.remove(rig.root); world.add(r.root); rig = r; f.rig = r;
      }).catch(e => console.warn(`${a.character} unavailable:`, e));
    let t = 0;
    const turn = (x, y) => { f.yaw = Math.atan2(x - f.x, y - f.y); rig.root.rotation.y = Math.PI - f.yaw; };
    f.face = (x, y) => { if (!look[1] || f.yaw == null) turn(x, y); else f.want = [x, y]; }; // (an afterimage looks first, and turns after)
    const hq = new THREE.Quaternion(), hp = new THREE.Quaternion(), hv = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    let hYaw = 0, hPitch = 0;
    f.walkTo = (x, y, speed = 1.15) => { f.to = [x, y, speed]; };
    let halo = null;
    f.glow = on => {
      if (on && !halo && !a.alive) { halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloMap(), color: 0xd6e4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); halo.scale.set(2.4, 4.2, 1); halo.visible = false; world.add(halo); }
      if (halo) halo.userData.on = !!on;
    };
    const haloTick = dt => {
      if (!halo) return;
      const d = Math.hypot(f.x - player.x, f.y - player.y), want = halo.userData.on ? 0.45 * Math.max(0, Math.min(1, (d - 6) / 18)) : 0; // (none within six metres, all of it from twenty-four)
      const o = halo.material.opacity + (want - halo.material.opacity) * Math.min(1, dt * 2.5);
      halo.material.opacity = o; halo.visible = o > 0.004; if (halo.visible) halo.position.copy(W(f.x, f.y, f.z + 1.3));
    };
    f.animate = dt => {
      t += dt; haloTick(dt);
      let v = 0;
      if (f.to) {
        const dx = f.to[0] - f.x, dy = f.to[1] - f.y, d = Math.hypot(dx, dy);
        if (d < 0.25) f.to = null;
        else {
          v = f.to[2]; const k = Math.min(1, v * dt / d), x0 = f.x, y0 = f.y; turn(f.to[0], f.to[1]); f.x += dx * k; f.y += dy * k;
          // (round whoever stands in the way, the player first: a step that would end inside a body ends at its shoulder,
          // and the next goes on along it. Where the place walked to is itself held, the walk ends beside it)
          const round = (ox, oy, oz) => { if (Math.abs((oz || 0) - f.z) > 1.5) return; let ex = f.x - ox, ey = f.y - oy, e = Math.hypot(ex, ey); if (e >= 0.62) return; if (e < 1e-3) { ex = dy; ey = -dx; e = Math.hypot(ex, ey) || 1; } f.x = ox + ex / e * 0.62; f.y = oy + ey / e * 0.62; };
          if (player.mode === 'foot' && player.rig.root.visible) round(player.x, player.y, player.z);
          for (const o of storyFigs) if (o !== f && !(o.rig && o.rig.root && !o.rig.root.visible)) round(o.x, o.y, o.z);
          for (const o of npcs) if (!o.away && Math.abs(o.x - f.x) < 2 && Math.abs(o.y - f.y) < 2) round(o.x, o.y, o.z);
          const went = Math.hypot(f.x - x0, f.y - y0), on = dt > 0 ? ((f.x - x0) * dx + (f.y - y0) * dy) / d : 1;
          f.held = on < 0.3 * v * dt ? (f.held || 0) + dt : 0; // (not getting nearer: someone holds the way, or the place)
          if (f.held > 0.8 && (d < 1.3 || f.held > 4)) { f.to = null; f.held = 0; }
          if (dt > 0) v = Math.min(v, went / dt);
          f.z = Math.max(0, nav.terrain(f.x, f.y)); put();
        }
      }
      // (the bend is laid over the clip's pose, and taken off again before the clip is asked for the next: with time
      // held the clip does not move the bones, and a bend added every frame turned her round and round)
      for (const b of bend) if (b.userData.bent && b.quaternion.equals(b.userData.bent)) b.quaternion.copy(b.userData.raw);
      for (const b of look) if (b && b.userData.turned && b.quaternion.equals(b.userData.turned)) b.quaternion.copy(b.userData.raw);
      // (one living, talked with: talks while their line is said, listens for your answer; no wave, the scene is under way)
      rig.noWave = true;
      rig.animate(dt, v, f.talking && a.alive && dlg.open ? (dlg.hasChoices ? 'listen' : 'talk') : 'ground', t);
      for (const b of bend) { b.userData.raw = (b.userData.raw || new THREE.Quaternion()).copy(b.quaternion); b.rotation.z -= 0.09; b.userData.bent = (b.userData.bent || new THREE.Quaternion()).copy(b.quaternion); }
      // the head to the player: laid over the clip's pose after the mixer, as the bend is, and taken off before it.
      // The neck takes two fifths of the turn and the head the rest, up to 70 degrees each way; past that the body
      // comes round, at a walker's pace. Eased, so that it is seen to turn (in a Stop the clip runs, dt is real)
      if (look[1] && f.want && !f.to) {
        const [x, y] = f.want, want = Math.atan2(x - f.x, y - f.y), off = angDiff(want, f.yaw);
        if (Math.abs(off) > 1.0) turn(f.x + Math.sin(f.yaw + Math.sign(off) * Math.min(Math.abs(off) - 1.0, dt * 1.4)), f.y + Math.cos(f.yaw + Math.sign(off) * Math.min(Math.abs(off) - 1.0, dt * 1.4)));
        const yw = Math.max(-1.2, Math.min(1.2, angDiff(want, f.yaw))), dz = (player.z + 1.55) - (f.z + 1.55), pt = Math.max(-0.35, Math.min(0.35, Math.atan2(dz, Math.hypot(x - f.x, y - f.y) || 1)));
        const k = Math.min(1, dt * 3.2); hYaw += (yw - hYaw) * k; hPitch += (pt - hPitch) * k;
      } else { const k = Math.min(1, dt * 2); hYaw -= hYaw * k; hPitch -= hPitch * k; }
      rig.root.updateMatrixWorld(true);
      for (const [i, b] of look.entries()) {
        if (!b) continue;
        b.userData.raw = (b.userData.raw || new THREE.Quaternion()).copy(b.quaternion);
        const share = i === 0 ? 0.4 : 0.6;
        // (turned in the world: about the vertical, then about the line across the face, whatever the bone's own axes)
        b.parent.getWorldQuaternion(hp);
        b.getWorldQuaternion(hq);
        hv.set(Math.cos(f.yaw + hYaw), 0, Math.sin(f.yaw + hYaw)); // (the right hand's way, across the face: the map's (cos, -sin) in three.js's axes)
        hq.premultiply(new THREE.Quaternion().setFromAxisAngle(UP, -hYaw * share)).premultiply(new THREE.Quaternion().setFromAxisAngle(hv, hPitch * share));
        b.quaternion.copy(hp.invert().multiply(hq));
        b.updateMatrixWorld(true);
        b.userData.turned = (b.userData.turned || new THREE.Quaternion()).copy(b.quaternion);
      }
      faceAfter(rig, dt);
    };
    f.remove = () => { gone = true; if (rig.face) rig.face.rest(); world.remove(rig.root); storyFigs.delete(f); posts.remove(f.post); if (halo) { world.remove(halo); halo.material.dispose(); halo = null; } }; // (its face let go: face.js frees what a moving face holds; and the halation round it)
    f.haloNow = () => (halo && halo.visible ? halo.material.opacity : 0); // (tools/story_play.js, the first Stop)
    f.rig = rig; f.look = look; // (for tools/afterimage_shot.js: the bones the head turn lays its pose on)
    return f;
  };
  // the log of the evening (log.js): what the story's people say, and what the player answered, to be read again
  const storyLog = window.OELog && G.story && !new URLSearchParams(location.search).has('walk') ? OELog.create({ stage, touch,
    at: () => (story ? { fi: story.state.fi, stamp: (story.state.fr && story.state.fr.stamp) || '' } : {}),
    can: () => !!story && $('#g-title').hidden && !['idle', 'dressed'].includes(story.state.phase) }) : null;
  H.log = storyLog;
  // a guide (companion.js): an animal that goes ahead of you to where the story wants you
  // walked as the player walks: slid along walls, round posts, trunks, rails and cars (nav.slide), never onto ground the
  // walker may not stand on, so that it goes round a fence and not through it
  // the guide's floor near z: what a walker stands on there, but not a landmark's top more than a dog's step (GUIDE_STEP) over
  // where he is while a floor at his own level is there too. The walking grid spreads a ledge's top by a walker's foot,
  // so that one brushing past steps up onto it (nav.js STEP 0.75 m); walked 0.5 m from Hachiko Square's planter, 0.72 m of
  // granite, the guide rose onto that spread and went on 0.67 m in the air over the setts, issue 190
  const GUIDE_STEP = 0.3;
  const guideGround = (x, y, z) => {
    const f = nav.floorAt(x, y, z + 0.5);
    if (f && f.kind === 'landmark' && f.z > z + GUIDE_STEP) { const l = nav.floorAt(x, y, z + GUIDE_STEP - nav.STEP); if (l && l.z > z - 1) return l.z; }
    return f ? f.z : Math.max(0, nav.terrain(x, y));
  };
  const makeGuide = g => (guideMade = window.OECompanion && g.model ? OECompanion.create({ url: g.model, world, W, lean: QC.lean, eye: camera, ground: guideGround, player, height: g.scale || 1,
    route: (x, y, z, tx, ty) => { const r = ways.walk({ x, y, z }, { x: tx, y: ty }); return r ? r.pts : null; },
    edge: (x, y, z, fx, fy) => ways.edge(x, y, z, fx, fy),
    wall: (x, y, z, r) => { const w = nav.push(x, y, z, r); return w && Math.hypot(w.x - x, w.y - y) > 0.01 ? w : null; }, // (each end of him off a wall, issue 157)
    // (and its body kept off every post, belt and trunk: the walker's circle is at its middle, and its nose and rump
    // reach GUIDE_BODY from there whichever way it turns; a queue belt passed through it at the lift's doors)
    // (and off a car, a train and the helicopter, as you are kept off them, carBoxes: he was put at your heels in its cabin)
    // (and never a step that takes his body into one of the crowd, issue 65: he waits, and they step aside for him, crowdKeep)
    slide: (x, y, z, dx, dy) => { const m = nav.slide(x, y, z, dx, dy), r = guideReach(g), c = OECars.pushOut(m.x, m.y, z, r, carBoxes(m.x, m.y, 4)), o = posts.pushOut(c.x, c.y, r, z); return nav.walk(o.x, o.y, z, true).ok && guideClear(x, y, o.x, o.y) ? o : { x, y }; },
    // (stand is asked once a cell of his planner's grid, thousands of times a plan round the held crowd: the boxes of the
    // cars, the trains, the helicopter and the gates are gathered once a frame for 30 m round, not once a cell. Each cell
    // made every train's boxes again, and the Stop's seek ran at 1 to 5 fps on an iPhone, issue 206)
    stand: (x, y, z) => standHeld(x, y, z, () => nav.walk(x, y, z, true).ok && !posts.pushOut(x, y, guideReach(g), z).hit && !OECars.pushOut(x, y, z, guideReach(g), standBoxes(x, y)).hit),
    // (the Scramble's own crowd too, q.pz: waiting at its kerbs, out crossing, standing about the square. They are kept on
    // no footway line, and he walked into the waiters at Sumiko's kerb as if nobody stood there, issue 65)
    people: (x, y, r) => { const out = []; if (crowd && crowd.P) for (let i = 0, n = Math.min(crowd.active, crowd.P.length); i < n; i++) { const q = crowd.P[i], qx = q.rx ?? q.x, qy = q.ry ?? q.y; if ((q.line >= 0 || q.pz) && Math.abs(qx - x) < r && Math.abs(qy - y) < r) out.push([qx, qy]); } return out; },
    held: () => !!(story && story.stopped && story.scale === 0) }) : null); // (the world held still: its people are planned round, not pushed off)
  // the story's people, asked for as the game opens, so that each is themselves when they are first seen
  if (lib && G.story && !new URLSearchParams(location.search).has('walk')) {
    const want = new Set();
    for (const ep of G.story.episodes || []) for (const c of [...(ep.cast || []), ...(ep.frames || []).flatMap(fr => [fr.afterimage, fr.afterimage2])]) if (c && c.character) want.add(c.character);
    for (const c of want) if (!lib.tpl[c] && (lib.npcs[c] || lib.heroes[c] || lib.info.characters[c])) Promise.resolve(lib.require(c)).catch(() => {});
  }
  const story = window.OEStory && G.story && !new URLSearchParams(location.search).has('walk') ? OEStory.create({
    story: G.story, stage, player, touch, reduced, log: storyLog, toast: t => { if (storyLog) storyLog.aside(t); H.toast(t); },
    menu: () => toggleMenu(), // (the story's own menu button: a phone has no Esc, issue 48)
    // the goal's light: a pale column standing where the next thing to do is, and a ring at its foot
    // (kind 'stand', where a picture is taken from: the camera's amber, so that it is not taken for someone to go to)
    beacon: (at, kind, r) => {
      if (!storyBeacon) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.5, 26, 20, 1, true), new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uT: { value: 0 }, uC: { value: new THREE.Color(0.62, 0.78, 1.0) } },
          vertexShader: 'varying float vH; void main() { vH = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: 'uniform float uT; uniform vec3 uC; varying float vH; void main() { float a = (1.0 - vH) * (1.0 - vH) * (0.5 + 0.12 * sin(uT * 2.6 - vH * 9.0)); gl_FragColor = vec4(uC * a * 2.2, a); }' }));
        col.position.y = 13 + 2.6; // (from over a head upward: whoever stands under it is seen, not lost in it)
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 48), new THREE.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
        // (and round a standpoint, the edge of where the picture can be taken from: a fine line at task.within_m, so that
        // the light is a place with a size, and the player sees when they are inside it)
        // (laid on the ground round the place, storyDrape, made again when the place or its size changes)
        const edge = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
        edge.visible = false;
        storyBeacon = new THREE.Group(); storyBeacon.add(col, ring, edge); storyBeacon.userData = { col, ring, edge };
        storyBeacon.traverse(o => { o.frustumCulled = false; o.renderOrder = 20; });
        world.add(storyBeacon);
      }
      storyBeacon.visible = !!at;
      const E = storyBeacon.userData.edge, z0 = at ? (at[3] != null ? at[3] : Math.max(0, nav.terrain(at[0], at[1]))) : 0, eKey = at ? `${at[0].toFixed(1)},${at[1].toFixed(1)},${r}` : '';
      E.visible = !!(at && kind === 'stand' && r > 1.2);
      if (E.visible && E.userData.key !== eKey) { E.userData.key = eKey; E.geometry.dispose(); E.geometry = storyDrape(at[0], at[1], z0, r, 1 - 0.08 / r); } // (the same fine line, 8 cm)
      if (at) { const amber = kind === 'stand'; storyBeacon.userData.col.material.uniforms.uC.value.setRGB(amber ? 1.0 : 0.62, amber ? 0.8 : 0.78, amber ? 0.52 : 1.0); storyBeacon.userData.ring.material.color.setHex(amber ? 0xffcf8a : 0x9fc4ff); }
      if (at) storyBeacon.position.copy(W(at[0], at[1], z0)); // (at[3]: the floor it stands on, a roof's)
    },
    // standing in the light (a frame's standpoint, reached): the column goes, the edge of the place is lit, the ground
    // inside it is warmed a little, and a ring goes out once from your feet to its edge as you step in. What the camera
    // sees from here is the other year; the light says, in the street, that this is where it is seen from
    here: (at, r = 2.5) => {
      if (!at) { if (storyHere) storyHere.visible = false; return; }
      if (!storyHere) {
        const amber = new THREE.Color(1.0, 0.8, 0.52), wave = new THREE.Color(0xffcf8a).convertSRGBToLinear();
        // one mesh, the place's light and the ring that goes out to its edge (uWave: the ring's radius, a share of the
        // place's; uWaveA its strength), laid on the ground as it is (storyDrape), the ring with it
        // Its edge is a fine line, 8 cm in metres (uR: the place's radius) whatever the place's size: a third of the radius
        // as before was a 30 cm cream stroke at a 4 m place, which at night read as a band of light of its own
        const disc = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
          uniforms: { uT: { value: 0 }, uC: { value: amber }, uW: { value: wave }, uWave: { value: 1 }, uWaveA: { value: 0 }, uR: { value: 4 } },
          vertexShader: 'attribute vec2 aP; varying vec2 vP; void main() { vP = aP; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: 'uniform float uT, uWave, uWaveA, uR; uniform vec3 uC, uW; varying vec2 vP; void main() { float r = length(vP), e = (1.0 - r) * uR; float a = 0.11 * smoothstep(1.0, 0.2, r) * (0.85 + 0.15 * sin(uT * 2.2)) + 0.22 * smoothstep(0.7, 0.94, r) * smoothstep(1.0, 0.94, r) + 0.62 * smoothstep(0.0, 0.015, e) * (1.0 - smoothstep(0.05, 0.085, e)); float w = uWaveA * step(0.94 * uWave, r) * step(r, uWave); gl_FragColor = vec4(uC * a * a + uW * w, 1.0); }' }));
        // (additive at alpha 1: the light as its alpha times itself, as the disc was, and the ring at its strength, as its own mesh was)
        disc.frustumCulled = false; disc.renderOrder = 20;
        storyHere = new THREE.Group(); storyHere.add(disc); storyHere.userData = { disc, t0: 0, key: '' };
        world.add(storyHere);
      }
      const U = storyHere.userData, key = `${at[0].toFixed(1)},${at[1].toFixed(1)}`, z0 = at[3] != null ? at[3] : Math.max(0, nav.terrain(at[0], at[1]));
      if (!storyHere.visible || U.key !== key) U.t0 = performance.now(); // (stepped in: the ring goes out)
      if (U.key !== key || U.r !== r) { U.disc.geometry.dispose(); U.disc.geometry = storyDrape(at[0], at[1], z0, r); U.disc.material.uniforms.uR.value = r; } // (laid on the ground there: storyDrape)
      U.key = key; U.r = r; storyHere.visible = true;
      storyHere.position.copy(W(at[0], at[1], z0));
    },
    // where a point of the map is in the frame (0..1 from its top left), whether it is ahead, and how far from you
    screen: at => { const v = W(at[0], at[1], at[2] ?? player.z + 1.2), d = Math.hypot(at[0] - player.x, at[1] - player.y), f = v.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())) > 0; v.project(camera); return { x: v.x * 0.5 + 0.5, y: 0.5 - v.y * 0.5, front: f, dist: d }; },
    // the way on foot to a story's goal (story.js markTick): the metres left along it, and `aim`, where it turns next,
    // or null where it runs straight to the goal (toDoor: to the lift's door, where the way's ride up begins)
    way: (at, toDoor) => wayOnFoot(at, toDoor),
    // whether nothing solid (a wall, a roof, a landmark's stone) stands between the lens and a point of the map
    seen: at => { const c = camera.position; return !nav.col.pick(c.x, -c.z, c.y, at[0], at[1], at[2] ?? player.z + 1.2); },
    see: (x, y, z, o) => marks.see(x, y, z, o), // (a mark drawn in the frame keeps its perspective: marks.js)
    // (by the compass only: how far the lens must turn to face it; nobody is asked to tilt the camera up a tower)
    aim: at => { const v = W(at[0], at[1], 0).sub(camera.position), f = camera.getWorldDirection(new THREE.Vector3()); v.y = 0; f.y = 0; if (v.lengthSq() < 1e-6 || f.lengthSq() < 1e-6) return 0; return Math.acos(Math.max(-1, Math.min(1, v.normalize().dot(f.normalize())))) * 180 / Math.PI; },
    // the frame as it is drawn now, small, for the episode's print (drawn and read back in one task: the canvas keeps no copy)
    // (ghosts: the afterimages come up in the print as the thing of 1964 does, not in tonight's first image: the last
    // frame is of them, and the print develops the crossing first and then the two of them in the middle of it)
    // (plain: a frame spent from the wrong place, only tonight in it, whatever was in the finder's lines)
    snap: ({ ghosts = false, plain = false } = {}) => {
      // (what the camera in your hands sees: not yourself, and not the goal's light, nor the light you stand in)
      const me = player.rig.root.visible, bc = storyBeacon && storyBeacon.visible, gl = gold.mesh.visible, hc = storyHere && storyHere.visible;
      player.rig.root.visible = false; if (storyBeacon) storyBeacon.visible = false; gold.mesh.visible = false; if (storyHere) storyHere.visible = false; // (nor the way's band on the ground)
      mirrorTick();
      const out = document.createElement('canvas'), h = Math.min(480, canvas.height);
      out.height = h; out.width = Math.round(h * 1.5);
      const P = printRect(), sx = P[0] * canvas.width, sy = P[1] * canvas.height, sw = (P[2] - P[0]) * canvas.width, sh = (P[3] - P[1]) * canvas.height;
      const take = q => { if (atmos) atmos.render(world, camera); else renderer.render(world, camera); out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height); return out.toDataURL('image/jpeg', q); };
      // (tonight alone first, smaller: the print comes up as tonight, and the other year comes up in it, story.js showPrint)
      let base = null;
      const later = ghosts ? [...storyFigs].filter(f => f.ghost && f.rig && f.rig.root.visible) : [];
      if (past || later.length) { if (past) past.none(); for (const f of later) f.rig.root.visible = false; try { base = take(0.7); } catch (e) { base = null; } for (const f of later) f.rig.root.visible = true; }
      if (past && !plain) past.whole(true); // (the photograph is the finder's picture, edge to edge; a frame spent from the wrong place has only tonight in it)
      const src = take(0.86);
      if (past) past.whole(false);
      player.rig.root.visible = me; if (storyBeacon) storyBeacon.visible = bc; gold.mesh.visible = gl; if (storyHere) storyHere.visible = hc;
      storySnapBase = base;
      return src;
    },
    snapBase: () => storySnapBase,
    printRect, // (the print's rectangle in the picture: story.js keeps the finder's lines inside it)
    again: () => { try { sessionStorage.setItem('bh-story-auto', cityId); } catch (e) { /* storage blocked */ } location.reload(); },
    // the last card's "Walk Shibuya": the walk (walk.js), taken up where the case ended, in the same night (walkOnFromStory).
    // Only where that cannot be, from a fresh page at the hour it ended in and under its sky. It was the map's old free
    // game, under another game's name and with its quests
    free: () => { if (walkOnFromStory()) return; try { sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t: sun && sun.altitude < -10 ? 'night' : 'blue', w: weather && /rain|drizzle|storm/.test(weather.state.kind) ? 'rain' : 'clear' })); } catch (e) { /* storage blocked */ } const u = new URL(location.href); u.searchParams.delete('walk'); u.searchParams.delete('overture'); location.href = u.toString(); },
    say: (who, lines, done, opts) => ((opts && opts.free) || talkLine(who), dlg.show(Object.assign({ color: who.alive ? '#ffcf8a' : '#9fc4ff', log: true }, who), lines.map(l => fill(l)), null, opts && opts.free ? done : talking(who, done), opts)), // (opts.free: a call said hands-free, hud.js)
    cut: () => dlg.cut(), // (a call cut off by the Stop) // (log: kept in the evening's log)
    hush: on => { if (A.hush) A.hush(on); if (on && window.speechSynthesis) window.speechSynthesis.cancel(); }, // (a platform's spoken announcement is the browser's own voice, past the tape: cut at a Stop)
    // the score under the story (music.js), set to the scene: {slot: 'evening' | 'night', hour, rain, mode: 'foot' | 'ride' | 'heli'}
    score: state => { if (!window.OEMusic || !A.ctx) return; if (!storyMusic) { cueOut(); storyMusic = OEMusic.create(); storyMusic.start(A.ctx, A.musicBus()); } storyMusic.set(Object.assign({ palette: G.story.palette || 'tokyo' }, state)); },
    sting: kind => { if (storyMusic) storyMusic.sting(kind); }, // (a phrase of the score at a beat of the story: music.js's stings)
    // the story's own sound (audio.js): a cue by name, and the still chord of time held
    sfx: name => { if (name === 'wrong' || (name === 'right' && talkPrint)) talkPrint = true; else if (name === 'right') talkPrint = false; if (A.sfx) A.sfx(name); if (gamepad && (name === 'stop' || name === 'shutter')) gamepad.rumble(name); }, // (an answer judged: the line after it is a closer single; and the pad's rumble, where it has one)
    held: on => { if (A.held) A.held(on); },
    // time held and let go: what was falling or flying hangs where it was (stopfx.js)
    // a flight between two places (a frame's `flight`: an overture's spec, its shots, captions and where you stand at the end):
    // the helicopter is the film's guide, the camera flies with it, and a key sets you down at once
    film: (spec, then) => {
      const was = overture, st = heli.st, pad = [st.x, st.y, st.z, st.h];
      const sp = Object.assign({}, G.overture, G.story.episodes[0].overture || {}, spec, { night: null, skip_keys: 'Space to skip', end: Object.assign({}, spec.end || {}) });
      const craft = spec.craft !== false;
      // Its attitude is read off the film's path in the film's own time: the nose along the way it goes once it is going
      // anywhere (and left where it is in a hover), nose down with speed and to gather it and up to shed it, banked into a
      // turn by as much as the turn needs, as the flight's own physics asks (vehicles.js update), eased over a third of a
      // second. It was once worked out from the step since the last frame: pitch half the metres per frame, the nose
      // wherever that step pointed, a leaf's flutter in its path, and the flight's physics easing it back towards level
      // under the film every frame. At an uneven frame rate its tail shook, and in a hover its nose swung after the flutter.
      const att = { h: st.h, p: 0, r: 0, t: null };
      // Where it sets down and which way it faces there (set): the end of its path, its door towards where you stand at the
      // end (spec.end), so that you get out of its door onto that spot; and the spot itself outside its hull. It once faced
      // whichever way the last step of its path had pointed it, and you (and the dog at your heels) were set down in its cabin
      let set = null;
      const fly = (g, s, k) => {
        // (you are in it: nobody stands on the ground it is coming down to; you are seen once it is down, in the shot the spec names, out of its door)
        player.rig.root.visible = !g || !!(s && s.id === (spec.out_shot || 'foot'));
        if (guideMade && guideMade.aboard) guideMade.aboard(!player.rig.root.visible); // (the dog in it with you, and out at your heels after you)
        if (!g) { // set down: it lifts off again and goes back the way it came, and is put back on its pad once it is out of sight
          // (straight up 40 m over its spot, which it came down through, turning in a hover to face the way it came, then away
          // along that way climbing: it had turned and flown off its nose, into whatever stood there, the tower south of it)
          let t = 0; const z0 = st.z, away = set && set.away != null ? set.away : st.h;
          heliAway = dt => {
            t += dt;
            const climb = 40 * smoothK(1.2, 9, t), rise = 40 * (smoothK(1.2, 9, t + 0.05) - smoothK(1.2, 9, t - 0.05)) / 0.1, v = Math.min(25, Math.max(0, t - 8) * 3);
            const zWas = st.z;
            st.z = z0 + climb + Math.max(0, t - 9) * 4;
            if (t > 1.6) st.h += Math.max(-0.5 * dt, Math.min(0.5 * dt, angDiff(away, st.h)));
            st.x += Math.sin(st.h) * v * dt; st.y += Math.cos(st.h) * v * dt;
            st.pitch += ((v > 0 && v < 25 ? 0.12 : 0) + v * 0.0035 - st.pitch) * (1 - Math.exp(-dt / 0.5)); st.roll *= Math.exp(-dt / 0.4); // (eased in the world's time, not set each frame)
            st.vx = Math.sin(st.h) * v; st.vy = Math.cos(st.h) * v; st.vz = dt > 0 ? (st.z - zWas) / dt : rise; st.on = true; st.landed = false; st.rotor = 1; st.scripted = true; heli.place(); heli.group.visible = true;
            if (A.rotor) A.rotor(Math.max(0, 1 - t / 13), 0.4);
            if (t > 14) { heliAway = null; st.on = false; st.scripted = false; st.rotor = 0; st.landed = true; [st.x, st.y, st.z, st.h] = pad; st.pitch = st.roll = 0; st.vx = st.vy = st.vz = 0; heli.place(); heli.group.visible = false; }
          };
          return;
        }
        const x = g.x, y = -g.z;
        let z = g.y;
        const f = film.f, t = f.t, dt = att.t == null ? 0 : Math.max(0, Math.min(0.1, t - att.t));
        att.t = t;
        // the way the path goes here: its points a quarter of a second either side of now, in the film's time (the same
        // whatever the frame rate), as velocity and acceleration (game coordinates)
        // (the film's own path, spec.path, runs on through the cuts: read either side of now whatever shot it is in; a shot's
        // own guide is read within the shot)
        const own = s.guide === 'path' && f.hasPath, T = s.t0 + k * s.dur, end = own ? f.pathEnd : 0;
        const P = kk => { if (own) return f.pathAt(s.t0 + kk * s.dur); const q = f.path(s, kk); return q ? [q.x, -q.z, q.y] : [x, y, z]; };
        const kd = 0.25 / Math.max(0.1, s.dur), h1 = own ? Math.min(kd, T / s.dur) : Math.min(kd, k), h2 = own ? Math.min(kd, Math.max(0, end - T) / s.dur) : Math.min(kd, 1 - k), ta = h1 * s.dur, tb = h2 * s.dur;
        const pa = P(k - h1), pb = P(k + h2), m = [x, y, z], v = [0, 0, 0], acc = [0, 0, 0];
        for (let i = 0; i < 3; i++) {
          if (ta + tb > 1e-3) v[i] = (pb[i] - pa[i]) / (ta + tb);
          if (ta > 1e-3 && tb > 1e-3) acc[i] = ((pb[i] - m[i]) / tb - (m[i] - pa[i]) / ta) / ((ta + tb) / 2);
        }
        const vh = Math.hypot(v[0], v[1]), w = smoothK(0.6, 3, vh);
        // never into the ground: down on it within 5 cm, and landed (its strobes off, level)
        const floor = nav.groundBelow(x, y, z + 0.5), landed = z <= floor + 0.05;
        if (landed) z = Math.max(z, floor);
        // heading: towards the way it goes, as much as it is going anywhere (and left where it is in a hover); coming down
        // where it sets down, to its door towards your spot; at most 29 degrees a second, a pedal turn's steady rate
        const down = set && set.h != null && (set.from != null ? T >= set.from : set.shots.has(s.id));
        const pathH = Math.atan2(v[0], v[1]) + (spec.heading_offset || 0);
        const want = down ? set.h : att.h + angDiff(pathH, att.h) * w;
        const yaw = Math.max(-0.5 * dt, Math.min(0.5 * dt, angDiff(want, att.h) * (1 - Math.exp(-dt / 0.4))));
        att.h += yaw;
        // pitch and bank, as the flight's physics would have them (vehicles.js update), with the flare a pilot gives it: nose
        // up about ten degrees as it sheds speed into a hover, a few degrees down at a cruise, banked by what the turn needs
        const fx = Math.sin(att.h), fy = Math.cos(att.h), along = v[0] * fx + v[1] * fy, aAlong = acc[0] * fx + acc[1] * fy;
        const turn = vh > 1 ? (v[1] * acc[0] - v[0] * acc[1]) / (vh * vh) : 0;
        const pitchT = landed ? 0 : Math.max(-0.24, Math.min(0.3, aAlong * 0.04 + along * 0.0035));
        const rollT = landed ? 0 : -Math.max(-0.6, Math.min(0.6, Math.atan(along * turn / 9.81))) * w;
        const e = 1 - Math.exp(-dt / 0.35);
        att.p += (pitchT - att.p) * e; att.r += (rollT - att.r) * e;
        Object.assign(st, { x, y, z, h: att.h, pitch: att.p, roll: att.r, vx: v[0], vy: v[1], vz: v[2], speed: vh, yawRate: dt > 0 ? yaw / dt : 0, fwd: Math.max(-1, Math.min(1, aAlong / 6 + along / 50)), lift: Math.max(-1, Math.min(1, v[2] / 8)), on: true, landed, scripted: true });
        if (!heli.loaded()) { heli.want(); heli.show(); }
        heli.place(); heli.group.visible = true; // (its rotor spools up to full as it lifts, vehicles.js update: from turning over on its pad, not at once)
        if (A.rotor) A.rotor(1, 0.55); // (heard, as it is seen)
        flightSnd = clockT; // (and from its cabin: weatherTick's mix)
      };
      const go = () => {
        const f = makeFilm && !reduced ? makeFilm(sp, craft ? fly : null) : null; // (craft false: the air's own view, no helicopter in it)
        film.f = f;
        if (f && craft) set = heliSetDown(f, sp);
        // (and whatever the film did, you are let go standing outside it: a skip ends it with the helicopter wherever it was)
        const done = () => { overture = was; clearOfHeli(); then(); };
        if (f) { overture = f; f.story = performance.now(); if (f.play(done)) return; overture = was; }
        if (sp.end && sp.end.at) spawn(sp.end.at.slice(0, 2), undefined, sp.end.facing);
        then();
      };
      const film = { f: null };
      // (its model first: a case taken up again at this frame, on the street, never had it on the roof, and flew the whole
      // film in the plain stand-in, its blades flickering; a few seconds at most, then the stand-in after all)
      if (craft && !heli.loaded()) { let once = false; const one = () => { if (!once) { once = true; go(); } }; heli.want().then(one, one); setTimeout(one, 6000); return; }
      go();
    },
    // the helicopter a flight goes by, on its pad (a frame's flight.board): board(null, 'parked') stands it there, seen,
    // through the frame before; board(null, 'idle') starts it turning over once that frame's picture is taken;
    // board(then) waits for you to get in (E beside it: then() plays the flight), and gives where it stands, or null where
    // you are nowhere near it (a case taken up again at that frame, on the street: the flight alone); board(null) puts it away
    board: (then, how = null) => {
      const st = heli.st;
      if (!then) { heliWait = how ? { then: null, idle: how === 'idle' } : null; return null; }
      if (player.mode !== 'foot' || Math.hypot(st.x - player.x, st.y - player.y) > 150 || Math.abs(st.z - player.z) > 30) { heliWait = null; return null; }
      if (!heli.loaded()) heli.want();
      heliWait = { then, idle: true };
      return [st.x, st.y, st.z];
    },
    // what only the camera sees (past.js): a thing of the frame's year stood where it stood (a frame's task.relic:
    // {model, at: [x, y, z?], h: degrees, over, scale}), and the finder's rectangle it is seen in ([x0, y0, x1, y1] as
    // fractions of the picture from its top left, or null with the camera down)
    relic: r => { if (!past) return null; if (r.from) for (const q of [r, ...(r.with || [])]) clearSight(r.from, q.at); /* (and to what stands with it: someone stood between the pillar box and the board behind it) */ const one = q => past.relic(q.model, W(q.at[0], q.at[1], (q.at[2] ?? Math.max(0, nav.terrain(q.at[0], q.at[1]))) + 0.04), (q.h || 0) * Math.PI / 180, q), all = [r].concat(r.with || []).map(one);
      return { remove: () => all.forEach(q => q.remove()), get k() { return Math.max(0, ...all.map(q => q.k || 0)); }, get missing() { return all.every(q => q.missing); },
        // (where it stands in the picture: the box round all of it, as fractions from the picture's top left, and whether all of
        // it is in front of the lens; null while its model is loading)
        frame: () => {
          camera.getWorldDirection(relicF);
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, front = true, any = false;
          const corner = v => {
            if (relicD.copy(v).sub(camera.position).dot(relicF) < 0.05) front = false;
            relicV.copy(v).project(camera); const x = relicV.x * 0.5 + 0.5, y = 0.5 - relicV.y * 0.5;
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          };
          for (const q of all) if (q.corners && q.corners(corner)) any = true;
          return any ? { x0, y0, x1, y1, front } : null;
        },
        // (the middle of all of it on the map, x and y: what the raised camera comes up onto, the pillar box, her umbrella and
        // the board of frame 6 together, and not the pillar box alone with the board off the print's edge)
        middle: () => {
          let x0 = Infinity, z0 = Infinity, h0 = Infinity, x1 = -Infinity, z1 = -Infinity, h1 = -Infinity, any = false;
          const corner = v => { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); h0 = Math.min(h0, v.y); h1 = Math.max(h1, v.y); };
          for (const q of all) if (q.corners && q.corners(corner)) any = true;
          return any ? [(x0 + x1) / 2, -(z0 + z1) / 2, h0, h1] : null; // (x, y on the map; and the heights of its foot and its top)
        } };
    }, // (r.with: other things that stand with it; k: how far it has formed in the finder, 0..1; missing: its model is not to be had)
    clear: (a, b, half) => clearSight(a, b, half), // (the held crowd out of the way from a to b: the last frame's two sightlines, from the corner its hints lead to; half: a lane for someone to walk)
    clearRound: (x, y, r) => clearRound(x, y, r), // (and out of a ring round someone the frame is of)
    finder: (q, open = true) => { if (past) { past.rect(q ? [q[0] * 2 - 1, 1 - q[3] * 2, q[2] * 2 - 1, 1 - q[1] * 2] : null); past.open(open); } }, // (open: the lens stands where the other year was seen from; off it the finder has tonight only)
    lens: (fov, wide = false) => { cam.distTo = 0; lensWide = !!wide && fov != null; if (fov == null) { if (lensWas != null) cam.dist = lensWas; lensWas = null; return; } if (lensWas == null) lensWas = cam.dist; cam.dist = 2.5 + (Math.max(12, Math.min(60, fov)) - 22) / 5.5; }, // (the lens's ring set for a frame, and back as it was after: the wheel's, rig() below; wide: kept the film frame's width on a narrow screen, however long)
    // where to make for on the way to a place that is up a tower (or down from one): the nearer stop of the lift that
    // goes there, so that the mark is on a door that can be walked to and not on a roof 230 m overhead
    via: at => {
      const z = at[3] != null ? at[3] : at[2];
      if (z == null || Math.abs(z - player.z) < 12 || player.mode !== 'foot') return null;
      let best = null;
      for (const l of lifts) { const far = l.stops.find(s => Math.abs(s.at[2] - z) < 16 && Math.hypot(s.at[0] - at[0], s.at[1] - at[1]) < 120), near = l.stops.find(s => Math.abs(s.at[2] - player.z) < 8); if (far && near && far !== near) best = near; }
      return best ? [best.at[0], best.at[1], best.at[2] + 1.2, best.at[2]] : null;
    },
    guide: makeGuide,
    // the view turned towards a place (gently, and never against the player's own hand on it)
    // (level: and up from looking down, or down from looking up, to the chase camera's own height: the roof's picture is taken
    // looking straight down at the street, and the helicopter to get into after it was out of a view still pointed down)
    // (room: where the chase camera has no place behind your shoulder that way, the story walks you the few steps to
    // where it has, and turns the view then. Issue 139: frame 5 begins 0.9 m from the roof's east glass with the
    // helicopter behind you. Turned to it at once, the camera's place was outside the glass, which it cannot look in
    // through, and only its highest lift cleared the pane: the first view of the roof was straight down on your head.
    // Now you turn from the glass and walk in, seen from the deck with the city behind you, and the view comes round
    // to the pad over your shoulder as you stop. The game's own walk, player.auto: a step of yours ends it)
    look: (at, level = false, room = false) => {
      if (player.mode !== 'foot') return;
      const turn = () => { cam.yawTo = Math.atan2(at[0] - player.x, at[1] - player.y); if (level) cam.pitchTo = FOOT.pitch; };
      const to = room && !reduced ? lookRoom(at) : null;
      if (to) player.auto = { x: to[0], y: to[1], t: 0, label: '', then: turn, cancel: turn };
      else turn();
    },
    // the air of the scene (stopfx.js): leaves coming down and birds going over, there before time stops and held when it does
    air: opts => { if (stopFx) stopFx.air(W(player.x, player.y, player.z), opts || {}); },
    // a car sent for you (a frame's `ride`: {to: [x, y], name}): it comes to the kerb, E gets in, and it drives you there
    // ('wait' while the cars' near models are still coming: the story asks again, rather than go on without its car)
    ride: spec => (player.mode !== 'foot' ? false : vlib && vlib.loadCars && !vlib.carsFull ? (carsNow(), 'wait') : orderRide({ id: 'story', name: spec.name || 'there', at: spec.to.slice(0, 2) })),
    rideOff: () => { if (ride && player.mode !== 'ride') rideAway(); }, // (walked there instead: the car goes on its way, and is not left at the kerb in the next frame's shot)
    // where that car is and what it is doing: {at: [x, y, z], state: 'coming' | 'waiting' | 'in'}, or null once it has gone
    rideNow: () => (!ride || ride.phase === 'leaving' ? null : { at: [ride.drv.st.x, ride.drv.st.y, ride.drv.st.z], state: player.mode === 'ride' ? 'in' : ride.phase === 'coming' ? 'coming' : 'waiting', arrived: ride.phase === 'arrived' }),
    hold: on => { if (!stopFx) return; if (on) stopFx.start(W(player.x, player.y, player.z), { rain: !!(weather && weather.state && weather.state.rain > 0.15) }); else stopFx.release(); },
    asking: () => dlg.hasChoices, unask: () => dlg.quit(), // (a question's answers up and waiting; and closed with none given, story.js silence)
    ask: (who, lines, choices, done) => (talkLine(who, choices), talkPrint = choices.some(c => /class="pr"/.test(c.text)), dlg.show(Object.assign({ color: who.alive ? '#ffcf8a' : '#9fc4ff', log: true }, who), lines.map(l => fill(l)), choices, talking(who, done))), // (a question: the lines, then answers to pick from)
    dress: (date, light, wx) => {
      const [m, d] = date || [clock.m, clock.d];
      setClock(clock.y, m, d, S.presetTime(light, clock.y, m, d));
      if (wx && weather) weather.set(wx, { now: true }); // (as it has been for a while: the street already wet in the opening's first frame)
    },
    // (lights: the signals only, as the last frame's two step off their kerbs in a held world, where cars cleared from
    // the box and a crowd mustered at the kerbs would be seen to go and come; the street follows when time runs on)
    walkIn: (secs, lights = false) => {
      const j = junctions.J.find(q => q.scramble && Math.hypot(q.x - player.x, q.y - player.y) < 80);
      if (!j) return;
      junctions.walkIn(j, secs);
      if (lights) { if (junctions.heads) junctions.heads.update(new Set([j])); return; }
      cars.clearBox(j.x, j.y, 45); musterScramble();
    },
    figure: storyFigure,
    // one of the map's own people, lent to the story (where they stand, and their name for the line)
    // (one of the map's people the story asks for: their character loaded now, ahead of the rest, and ready once it has
    // come. Taken up at frame 4, Yuna was still to load when the player was put at her door, and the talk's shot was on
    // the empty place where she was to stand: issue 76)
    person: id => { const n = npcs.find(q => q.id === id); if (n && n.rig.pending && lib) npcLoad(n); return n ? { x: n.x, y: n.y, z: n.z, name: n.name, role: n.role, color: n.color, ready: !n.rig.pending } : null; },
    weather: (kind, now, pace) => { if (weather) weather.set(kind, now ? { now: true } : { pace: pace || 1 }); }, // (now: as if it had been so for a while, the street already wet; pace: slower than the menu's, a sky that lowers over half a minute)
    // the hour of the light, by name ('blue': the blue hour), on the evening the story is dressed in
    light: kind => { const t = S.presetTime(kind, clock.y, clock.m, clock.d); if (t != null) setClock(clock.y, clock.m, clock.d, t); },
    floor: (x, y) => Math.max(0, nav.terrain(x, y)),
    whoGate: () => whoGate(), // (every way on from the title waits for who you play: game.js whoGate)
    key: k => (gamepad ? gamepad.label(k) : k), padOn: () => !!(gamepad && gamepad.on), // (the prompts name the pad's buttons while it is in the hand: pad.js)
  }) : null;
  // the walk (walk.js): the story's map with no story in it, the title's first way in. walk: the hour and the sky set
  // out in ({ t, w }), null on the title and in the story; walkUi: its title step and its corner of the screen
  let walk = null, walkUi = null, tonight = null, regulars = null; // (regulars: the street's own people, regulars.js)
  // a controller (pad.js): its buttons are the keys the keyboard has for them, its sticks are read in simulate, and the
  // card or panel that is up has its buttons moved through and pressed
  const padOpen = () => (window.OECredits && OECredits.open() ? OECredits.el : null) || [['#g-story-log', 'on'], ['#g-story-fail', 'on'], ['#g-story-spend', 'on'], ['#g-story-end', 'on'], ['#g-story-album', 'on']].map(([q, c]) => { const e = $(q); return e && e.classList.contains(c) ? e : null; }).find(Boolean)
    || (!$('#g-menu').hidden ? $('#g-menu') : !$('#g-title').hidden && !preTitle ? $('#g-title') : null);
  const gamepad = window.OEPad ? OEPad.create({ stage, open: padOpen,
    dialogue: () => (dlg.hasChoices ? [...document.querySelectorAll('#gd-choices button')] : null),
    camera: on => { if (story) story.raise(on); }, cameraUp: () => !!(story && story.state.cam),
    lens: d => zoom(d > 0 ? 0.89 : 1.12), // (the ring: RB longer, LB wider, a notch of the wheel each)
    log: () => { if (storyLog) storyLog.show(!storyLog.open); },
    back: () => { if (dlg.open) dlg.back(); },
    close: el => { if (el.id === 'g-credits') OECredits.show(false); else if (el.id === 'g-story-log' && storyLog) storyLog.show(false); else if (el.id === 'g-story-album' || el.id === 'g-menu') gamepad.key('Escape'); else if (el.id === 'g-title') gamepad.key('Escape'); } }) : null; // (B on the title: one screen back, as Esc, the title's keys below: the walk's step to the menu, who you play to the menu, the menu to the press)
  if (storyLog && gamepad) storyLog.gamepad = gamepad; // (the log's sheet has the trigger's setting while a pad is in the hand)
  let postCame = null; // the postcards asked for, once a visit (postcards.js brings nothing sooner than six hours after the last)
  function renderPassport() {
    $('#gp-stamps').innerHTML = LINES.flatMap(l => l.quests).map(q => {
      const got = qs.stamps.find(s => s.id === q.id);
      return `<li class="${got ? 'got' : ''}"><span class="stamp">${got ? q.stamp : '?'}</span><span><b>${got ? q.title : 'Not yet'}</b><span class="note">${got ? got.at : ''}</span></span></li>`;
    }).join('') + spotStamps().map(sp => {
      const got = qs.stamps.find(s => s.id === `spot:${sp.id}`);
      return `<li class="${got ? 'got' : ''}"><span class="stamp">${got ? sp.stamp : '?'}</span><span><b>${got ? sp.name : 'A stop not yet seen'}</b><span class="note">${got ? got.at : ''}</span></span></li>`;
    }).join('') + (qs.stamps.some(s => s.id === 'ferry-master') ? '<li class="got"><span class="stamp">Ferry master</span><span><b>Docked by hand</b></span></li>' : '')
      + (VP.length ? (() => { const n = VP.filter(v => trigDone()[v.id]).length; return `<li class="${n === VP.length ? 'got' : ''}"><span class="stamp">${n === VP.length ? 'Trig master' : `△ ${n}/${VP.length}`}</span>`
        + `<span><b>Trig stations</b><span class="note">${n ? VP.filter(v => trigDone()[v.id]).map(v => v.name).join(', ') : 'Survey the view from each one'}</span></span></li>`; })() : '');
    $('#g-pass-count').textContent = `${qs.stamps.filter(s => Q.some(q => q.id === s.id) || spotStamps().some(sp => s.id === `spot:${sp.id}`)).length}/${Q.length + spotStamps().length}`;
    if (life && life.passport) life.passport($('#g-pass .g-panel')); // the skills, under the stamps (jobs.js)
    // the postcards (postcards.js), newest first: those that have come from this map, then the album's others, each
    // with its map's name. What has come since the last visit is added first: a link straight into a game never
    // passes the title screen, which is where they were added before, so a player who came that way got none.
    if (window.OEPostcards) {
      const all = window.OE_CITIES || [];
      if (!postCame) postCame = OEPostcards.collect(all.filter(c => c.built && c.game)).then(came => { const T = window.OETelemetry; if (came.length && T && T.track) T.track('postcards_came', { new: came.length }); }).catch(() => {});
      postCame.then(() => OEPostcards.album(null, all)).then(cards => {
        for (const [id, here] of [['#gp-post', true], ['#gp-post-else', false]]) {
          const box = $(id), mine = cards.filter(k => (k.card.c === CITY.id) === here);
          if (!box) continue;
          box.hidden = !mine.length;
          const list = box.querySelector('ol');
          list.textContent = '';
          for (const k of mine) {
            const li = document.createElement('li'), img = new Image(240, 160), b = document.createElement('b'), n = document.createElement('span');
            img.src = k.src; img.alt = ''; img.loading = 'lazy';
            b.textContent = k.spot.name; n.className = 'note'; n.textContent = `${here ? '' : `${k.where} · `}${k.date} · ${k.time}`;
            li.append(img, b, n); list.append(li);
          }
        }
      }).catch(() => {});
    }
  }  // labels: landmarks, wharves, the helipad, NPC names
  const labelsEl = $('#g-labels'), labels = [];
  const addLabel = (text, get, maxD, cls = '') => { const el = document.createElement('div'); el.className = `lbl ${cls}`; el.innerHTML = text; el.hidden = true; labelsEl.appendChild(el); const l = { el, get, maxD }; labels.push(l); return l; };
  // a landmark's name stands where the landmark is seen: 6 m up its foot when that is in sight, over its top when
  // only that shows above the roofs between, and not at all behind a street's walls (on foot a tower half a
  // kilometre off had its name floating at head height in the middle of the crossing, through every building)
  const sightLabels = [];
  for (const [name, p] of Object.entries(scene.labels || {})) {
    const l = addLabel(name, () => W(p[0], p[1], l.at === 1 ? l.top + 3 : p[2] + 6), 1400);
    Object.assign(l, { p, at: -1, top: null });
    sightLabels.push(l);
  }
  let sightK = 0;
  function sightLabel() { // one a frame
    const l = sightLabels[sightK++ % sightLabels.length], p = l.p;
    if (player.mode === 'heli') { l.at = 0; return; }
    const cx = camera.position.x, cy = -camera.position.z, cz = camera.position.y, D = Math.hypot(p[0] - cx, p[1] - cy);
    if (D > l.maxD) return;
    // (clear, or met only by the landmark itself: within its own breadth of the point)
    const clear = z => { const h = nav.col.pick(cx, cy, cz, p[0], p[1], z); return !h || h.t * D > D - Math.max(40, 0.12 * D); };
    if (l.top === null) { const t = nav.col.topAt(p[0], p[1]); l.top = t > -Infinity ? t : p[2]; }
    l.at = clear(p[2] + 6) ? 0 : l.top > p[2] + 12 && clear(l.top + 3) ? 1 : -1;
  }
  for (const w of G.wharves) addLabel(`<span class="tag f">F</span>${w.name}`, () => W(w.terminal[0], w.terminal[1], 6), 300, 'wharf');
  for (const h of G.helipads) addLabel(`<span class="tag h">H</span>${h.name}`, () => W(h.at[0], h.at[1], h.at[2] + 6), 400, 'wharf');
  for (const v of VP) addLabel(`<span class="tag t">△</span>${v.name}`, () => W(v.x, v.y, v.z + 3.2), 260, 'wharf');
  for (const f of flocks) if (!f.soaring) addLabel(`<span class="tag g">${GULL}</span>${f.flock.name}`, () => W(f.at[0], f.at[1], f.at[2] + 3.4), 220, 'wharf');
  if (fish) for (const sp of fish.spots) { const p = W(sp.at[0], sp.at[1], Math.max(0, nav.terrain(sp.at[0], sp.at[1])) + 3.2); addLabel(`<span class="tag f">≈</span>${sp.name}`, () => p, 240, 'wharf'); }
  // (a person's name from where they can be told apart, not across the square: within 12 m, as a talk's reach is)
  for (const n of npcs) { const l = addLabel(`${n.name}<span class="role">${n.role}</span>`, () => W(n.x, n.y, n.z + (n.marker.visible ? 3.0 : 2.15)), 12, 'npc'); l.who = n; }
  const tmpV = new THREE.Vector3();
  function updateLabels() {
    const w = stage.clientWidth, h = stage.clientHeight, placed = [];
    const far = player.mode === 'heli' ? 2.2 : 1;
    if (sightLabels.length) sightLabel();
    for (const l of labels) {
      if (surveyLabels.length && !l.survey) { l.el.hidden = true; continue; } // during a survey, only what is in sight
      if (l.at === -1) { l.el.hidden = true; continue; } // (a landmark out of sight: sightLabel)
      const p = l.get();
      tmpV.copy(p).project(camera);
      const d = camera.position.distanceTo(p);
      let vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.05 && Math.abs(tmpV.y) < 1.05 && d < l.maxD * far && !(l.el.classList.contains('npc') && dlg.open);
      // (and as every mark is, marks.js: not on the player's body, nor on anyone nearer the eye; a person's name not through a wall)
      if (vis) { const v = marks.see(p.x, -p.z, p.y, { pad: 10, self: l.who, people: !!l.who, solid: !!l.who, key: l.who ? `lbl:${l.who.id}` : null }); vis = !v.why; }
      const x = (tmpV.x * 0.5 + 0.5) * w, y = (-tmpV.y * 0.5 + 0.5) * h;
      if (vis) {
        if (!l.w) { l.el.hidden = false; l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; }
        const r = [x - l.w / 2 - 3, y - l.h - 2, x + l.w / 2 + 3, y + 2];
        vis = !placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
        if (vis) placed.push(r);
      }
      l.el.hidden = !vis;
      if (vis) { l.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`; l.el.style.opacity = String(Math.min(1, (l.maxD * far - d) / (l.maxD * far * 0.3))); }
    }
  }

  // ------------------------------------------------------------ the route to go (route.js): routeline.js (cut out by tools/cut.js)
  const { guide, updateRoute, wayOnFoot } = OEGameRouteLine({ get firstFramed() { return firstFramed; }, get G() { return G; }, get H() { return H; }, get driveTo() { return driveTo; }, get gold() { return gold; }, get groundZ() { return groundZ; }, get heli() { return heli; }, get keepSign() { return keepSign; }, get myCar() { return myCar; }, set myCar(v) { myCar = v; }, get nav() { return nav; }, get npcs() { return npcs; }, get pilot() { return pilot; }, set pilot(v) { pilot = v; }, get player() { return player; }, get ride() { return ride; }, set ride(v) { ride = v; }, get roadNet() { return roadNet; }, get roads() { return roads; }, get rq() { return rq; }, get stepOf() { return stepOf; }, get story() { return story; }, get waypoint() { return waypoint; }, set waypoint(v) { waypoint = v; }, get ways() { return ways; }, get wharfById() { return wharfById; } });

  // ------------------------------------------------------------ input
  const keys = new Set();
  let preTitle = true; // until the loader hands over to the title screen (once the scene has been drawn)
  const settings = { density: 'normal' };
  // How busy the streets are now: game.crowd.hours, [[hour, share of the pool], ...] through the day,
  // weekend_night, more on Friday and Saturday nights (18:00 to 04:00), and weekend, more all day on
  // Saturday and Sunday, as Shibuya is (390,000 a day crossing at the weekend against 260,000 on a weekday). A city
  // without hours keeps its whole crowd out all day. crowdAuto off: a tool sets the crowd itself.
  function busy() {
    const H = CR.hours;
    if (!H || !H.length) return 1;
    const h = clock.min / 60;
    let v = H[H.length - 1][1];
    for (let i = 0; i < H.length; i++) {
      const [h1, v1] = H[i];
      if (h < h1) { const [h0, v0] = i ? H[i - 1] : [H[H.length - 1][0] - 24, H[H.length - 1][1]]; v = v0 + (v1 - v0) * (h - h0) / Math.max(1e-6, h1 - h0); break; }
    }
    const wd = new Date(Date.UTC(clock.y, clock.m - 1, clock.d)).getUTCDay();
    const party = ((wd === 5 || wd === 6) && h >= 18) || ((wd === 6 || wd === 0) && h < 4);
    return Math.max(0, Math.min(1, v * (party ? CR.weekend_night || 1 : 1) * (wd === 0 || wd === 6 ? CR.weekend || 1 : 1)));
  }
  // A busy crossing's sound (game.look.sound: {at, r, station: [x, y]}): the screens' music while they play (?noise=1), and now and then the station's
  // announcement, all rising as you come to it (heard from the camera, so a film hears what it
  // sees). The walk signals' calls, there and at every signalled crossing: walkcalls.js.
  const walkCalls = OEWalkCalls.create({ junctions, audio: A, country: CITY.country, cfg: (G.signals || {}).sound, hour: () => clock.min / 60 });
  // The screens' music is off: too loud, always there; ?noise=1 brings it back. The crowd's murmur and the city's bed are
  // gone (24 November 2026). What has a source still sounds: the station's announcements, the walk signals' calls,
  // footsteps, engines, horns, the trains, the weather, the birds and the score.
  const CITY_NOISE = new URLSearchParams(location.search).get('noise') === '1';
  const SND = (G.look || {}).sound;
  let sndJ = null, sndAnn = 20 + Math.random() * 30, sndNear = 0, sndCount = 0, sndFar = 25 + Math.random() * 40, sndPlace = 'kerb', flightSnd = -10, sndCover = false, sndCoverT = 0, liftHop = -1;
  if (SND) {
    let best = 60;
    for (const j of junctions.J) {
      if (!j.sig || !j.arms.length) continue;
      const d = Math.hypot(j.arms.reduce((s, a) => s + a.x, 0) / j.arms.length - SND.at[0], j.arms.reduce((s, a) => s + a.y, 0) / j.arms.length - SND.at[1]);
      if (d < best) { best = d; sndJ = j; }
    }
  }
  // Each heard from where it is made, through the air (audio.js reach): the crowd and the screens from the crossing, the
  // announcements from the station, at their height. They were read in plan, and the height only lowered the beds to a
  // fifth: on SHIBUYA SKY's roof, 104 m from the station in plan, the announcements played at nine tenths of their level
  const sndAt = SND ? { x: SND.at[0], y: SND.at[1], z: nav.terrain(SND.at[0], SND.at[1]) + 2 } : null, sndMemo = {};
  // (the announcements come out of the station's doors all round it, not its middle: what stands within 45 m of that,
  // the station itself, is not between them and you)
  const stnAt = SND && SND.station ? { x: SND.station[0], y: SND.station[1], z: nav.terrain(SND.station[0], SND.station[1]) + 4, skip: 45 } : null;
  function crossingSound(dt) {
    if (!SND || !A.screens) return;
    const cx = camera.position.x, cy = -camera.position.z, r = SND.r || 150, ear = { x: cx, y: cy, z: camera.position.y };
    const P = A.reach ? A.reach(sndAt, ear, sndMemo, dt) : { d: Math.hypot(cx - SND.at[0], cy - SND.at[1]), g: 1, fc: 20000 }, d = P.d;
    const level = Math.max(0, Math.min(1, (r - d) / (0.6 * r))) * P.g;
    if ((sndNear -= dt) <= 0) { // how many people are round you, twice a second
      sndNear = 0.5; sndCount = 0;
      for (let i = 0; i < crowd.active; i++) { const p = crowd.P[i]; if (p.line >= 0 && Math.abs(p.x - cx) < 40 && Math.abs(p.y - cy) < 40) sndCount++; }
    }
    const hr = clock.min / 60;
    // (the crowd's murmur that was here, and the city's bed, are gone: a sound with no source the ear can pin it to reads
    // as hiss (docs/SOUND.md "No bed without a source"). The count above stays for the tools: sound().near)
    A.screens(CITY_NOISE ? level * (hr >= 9 || hr < 0.1 ? 1 : 0) : 0, P.fc);
    // the city's far events, every minute or two: a siren, now and then a train's horn, from 350 to 900 m off, heard late
    // by that distance (audio.js far). On the roof they are the only single sounds the city has
    if (A.far && (sndFar -= dt) <= 0) { sndFar = 70 + Math.random() * 90; A.far(Math.random() < 0.75 ? 'siren' : 'horn', 350 + Math.random() * 550, Math.random() * 1.6 - 0.8); }
    if (stnAt && (sndAnn -= dt) <= 0) {
      sndAnn = 45 + Math.random() * 60;
      const Q = A.reach ? A.reach(stnAt, ear) : { d: Math.hypot(cx - stnAt.x, cy - stnAt.y), g: 1, fc: 20000 };
      if (Q.d < 260) A.announce(Math.min(1, (260 - Q.d) / 160) * Q.g, Q.fc);
    }
  }
  // The traffic going by: the three nearest moving cars and buses within 90 m of the ears (a street's traffic carries:
  // at the Scramble's red the nearest moving car is 40 to 90 m off), each kept on its own voice
  // while it stays among them (audio.js traffic), panned to its side, quieter and duller with its distance through the
  // air. A sound with a source: the street at a red signal is its traffic (docs/SOUND.md "No bed without a source")
  const tSlot = [null, null, null], tPick = [], tL = [];
  function trafficSound() {
    if (!A.traffic || !A.on) return; // (nothing to hear before the sound is made: a phone's opening has no context)
    const cx = camera.position.x, cy = -camera.position.z, cz = camera.position.y, e = camera.matrixWorld.elements, rl = Math.hypot(e[0], e[2]) || 1, rx = e[0] / rl, ry = -e[2] / rl;
    tPick.length = 0;
    for (const c of cars.live) {
      if (c.line < 0 || !(c.v > 1)) continue;
      const dx = c.x - cx, dy = c.y - cy; if (Math.abs(dx) > 90 || Math.abs(dy) > 90) continue;
      const d = Math.hypot(dx, dy, (c.z || 0) + 0.6 - cz); if (d > 90) continue;
      tPick.push([d, c]);
    }
    tPick.sort((a, b) => a[0] - b[0]); if (tPick.length > 3) tPick.length = 3;
    for (let i = 0; i < 3; i++) if (tSlot[i] && !tPick.some(p => p[1] === tSlot[i])) tSlot[i] = null;
    for (const [, c] of tPick) if (!tSlot.includes(c)) tSlot[tSlot.indexOf(null)] = c;
    for (let i = 0; i < 3; i++) {
      const c = tSlot[i], p = c && tPick.find(q => q[1] === c);
      if (!p) { tL[i] = null; continue; }
      const d = p[0];
      tL[i] = { g: Math.min(1, 8 / Math.max(4, d)) * Math.min(1, (90 - d) / 20), v: c.v, pan: ((c.x - cx) * rx + (c.y - cy) * ry) / Math.max(1, d), fc: 9000 * Math.exp(-0.02 * d) + 500, bus: c.half > 4 };
    }
    A.traffic(tL);
  }
  let crowdAuto = true, govCrowd = 1; // (govCrowd: the frame-time governor's share of the crowd, its ladder below)
  // (a phone's crowd as many as its faces can fill: the walkers near you are drawn whole from QC.budget.cast scanned people,
  // 4 on a phone's usual set and 2 on its lightest (quality.js), and a phone's whole crowd, far copies too, is those same
  // people (people.js realOf, farOf). Round 2 people a crowd of 640 was the same man and the same woman at every elbow
  // (the owner's iPhone, the walk's opening, 22 November 2026). The crowd is now as large as LOW_CAST faces would fill
  // and no larger: half on the usual set, a quarter on the lightest; any other device keeps all of it)
  const faceShare = QC.lean && QC.budget && QC.budget.cast ? Math.min(1, QC.budget.cast / LOW_CAST) : 1;
  function applyDensity() { if (crowdAuto) crowd.want = Math.round(crowd.P.length * density[settings.density] * busy() * govCrowd * faceShare); }
  // mode: 'chase', 'bird' (the helicopter's bird's-eye view) or 'cockpit' (the pilot's eyes, looking lookYaw left and lookPitch up)
  // distTo and yawTo, when set, ease the chase camera somewhere (out to the helicopter's view, round to its door)
  // on foot the chase camera rests 5.5 m behind the head at 0.17 rad (issue 71): its eye about 2.5 m over the street, at
  // a tall man's shoulder, and the horizon on the upper third of the frame (BASE_FOV's 55 degrees: atan(tan(27.5)/3) is
  // 0.17). From 7.5 m at 0.36 it stood at a first-floor window, the paving filled two thirds of the picture, and the
  // fronts' signs and screens and the blue sky over them were cut off at the top: a crowd reads from inside it
  const FOOT = { dist: 5.5, pitch: 0.17 };
  const cam = { yaw: 0, pitch: FOOT.pitch, tilt: 0, dist: FOOT.dist, distTo: 0, yawTo: null, lastInput: -10, mode: 'chase', birdAlt: 320, lookYaw: 0, lookPitch: -0.1, lift: 0, liftHold: 0, pull: 1, floor: null, snap: false };
  const cine = OECine.director({ reduced }); // camera shots, on the game clock (clockT)
  let overture = null; // the map's opening film (overture.js), made once the player is placed
  let makeFilm = null; // (overture.js's films, made on this map)
  let heliAway = null; // (the helicopter of a story's flight, leaving once it has set you down)
  const smoothK = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  // where a story's flight sets down (story ctx film), worked out from its film before it plays: the last point of its path,
  // the shots that end there (it hovers down in those), and the heading its door faces the end spot from (spec.land_heading,
  // degrees, if the spec gives one). The end spot, if it is in its hull there (or nearer it than a person's shoulder), is
  // moved out from its door until it is clear and can be stood on; the film's shots that are placed from "end" go with it
  function heliSetDown(f, sp) {
    const shots = sp.shots || [], last = sh => { const g = Array.isArray(sh.guide) ? sh.guide : []; return g.length ? f.point(g[g.length - 1]) : null; };
    let L = null, from = null;
    if (sp.path && sp.path.length > 1) {
      // (a film with a path of its own: it comes down from the moment it is last over its spot slower than a walk, its final hover)
      const q = sp.path[sp.path.length - 1];
      L = f.point(q.slice(0, 3)); from = q[3];
      for (let i = sp.path.length - 2; i >= 0; i--) { const a = sp.path[i]; if (Math.hypot(a[0] - L[0], a[1] - L[1]) > 6) break; from = a[3]; }
      from -= 1.5; // (turning as it slows into the hover, not once it hangs there)
    } else for (let i = shots.length - 1; i >= 0 && !L; i--) L = last(shots[i]);
    if (!L) return null;
    const ids = new Set(shots.filter(sh => { const q = last(sh); return q && Math.hypot(q[0] - L[0], q[1] - L[1]) < 1.5; }).map(sh => sh.id));
    const E = sp.end && sp.end.at ? f.point(sp.end.at) : null, door = heli.door || { x: 1.5, y: 1.5 }, doorA = Math.atan2(door.x, door.y);
    let h = sp.land_heading != null ? sp.land_heading * Math.PI / 180 : E && Math.hypot(E[0] - L[0], E[1] - L[1]) > 0.5 && Math.hypot(E[0] - L[0], E[1] - L[1]) < 15 ? Math.atan2(E[0] - L[0], E[1] - L[1]) - doorA : null;
    if (E && h != null) {
      const z = nav.groundBelow(L[0], L[1], (L[2] ?? 0) + 0.5), boxes = heli.boxesAt(L[0], L[1], z, h), ez = nav.groundBelow(E[0], E[1], z + 1.5);
      if (OECars.pushOut(E[0], E[1], ez, 0.6, boxes).hit) {
        const a = h + doorA, d0 = Math.hypot(door.x, door.y);
        for (let r = d0; r < d0 + 8; r += 0.25) {
          const x = L[0] + Math.sin(a) * r, y = L[1] + Math.cos(a) * r, w = nav.walk(x, y, nav.groundBelow(x, y, z + 1.5), true);
          if (w.ok && !OECars.pushOut(x, y, w.z, 0.6, boxes).hit) { sp.end.at = [x, y]; break; }
        }
      }
    }
    // the way it came in, reversed: where it goes once it has set you down (back along a way already flown)
    let away = null;
    const way = sp.path && sp.path.length > 1 ? sp.path.map(q => q.slice(0, 3)) : (shots.slice().reverse().find(sh => Array.isArray(sh.guide) && sh.guide.length > 1) || {}).guide;
    if (way) for (let i = way.length - 1; i > 0 && away == null; i--) { const a = f.point(way[i - 1]), dx = L[0] - a[0], dy = L[1] - a[1]; if (Math.hypot(dx, dy) > 12) away = Math.atan2(-dx, -dy); }
    return { at: L, h, shots: ids, from, away };
  }
  // you stand outside the helicopter once a flight has let you go (or the film skipped with it low over you): pushed out of
  // its hull to the nearest spot clear of it that can be stood on
  function clearOfHeli() {
    if (player.mode !== 'foot' || !heli.group.visible) return;
    const boxes = heli.boxes();
    if (!OECars.pushOut(player.x, player.y, player.z, 0.45, boxes).hit) return;
    const p = placeNear(player.x, player.y, player.z + 0.5, boxes);
    if (p) [player.x, player.y, player.z] = p;
  }
  let heliWait = null; // (and before it: on its pad, seen, { then: E beside it gets you in, idle: its rotor turning over } (story ctx board)
  let storyMusic = null; // (the score under the story: music.js, started with the first scene)
  let joy = { x: 0, y: 0 }, touchLift = 0, uiOpen = () => (window.OEMetro && OEMetro.isOpen()) || !$('#g-menu').hidden || !$('#g-bigmap').hidden || !$('#g-pass').hidden || !$('#g-title').hidden || !!(life && life.open) || !!(fish && fish.api && fish.api.logOpen());
  const k = c => keys.has(c);
  on(window, 'keydown', e => {
    // (typing in a field is the field's; on the title's options, its checkbox lets Esc and up and down through to the screen)
    if (e.target.closest && e.target.closest('input, select, textarea') && !(e.target.closest('#gt-opts') && /^(Escape|ArrowUp|ArrowDown)$/.test(e.code))) return;
    if (window.OEMetro && OEMetro.isOpen()) return; // the subway map has the keys (metro.js)
    const c = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(c)) e.preventDefault();
    if (e.repeat) { keys.add(c); return; }
    keys.add(c);
    if (preTitle) return; // the loader is still up
    if (!$('#g-title').hidden) { // (the title's keys, by its screen: the press, the menu, who you play; titleScreen)
      // (Enter is the title's own: the button's native press came after a choice had moved the hand to the button, and one
      // Enter chose who you play and began)
      const scr = screenOf();
      if (scr === 'press') { // (any key but a modifier opens the menu; the same key starts the score, the loader's cue above)
        if (!/^(Shift|Control|Alt|Meta|OS|Tab|Fn)/.test(c)) { e.preventDefault(); titleScreen('menu'); }
        return;
      }
      if (walkUi && walkUi.titleKey(c)) { e.preventDefault(); return; } // (the walk's step, while it is up: its own keys, walk.js)
      const f = document.activeElement, onBtn = f && f.tagName === 'BUTTON' && f.closest('#g-title') ? f : null;
      // (a press by the keys is a person's, though the click it makes is a script's: the ways in ask who you play for it, ownPress)
      const press = b => { if (!b) return; titleKeyed = true; try { b.click(); } finally { titleKeyed = false; } };
      if (scr === 'who') { // (left and right choose, Enter presses what the hand is on or confirms, Esc goes back)
        if (c === 'Enter') { e.preventDefault(); if (onBtn) press(onBtn); else whoDone(); }
        else if (c === 'Escape' || c === 'Backspace') whoBack();
        else if (c === 'ArrowLeft' || c === 'ArrowRight') whoPick(c === 'ArrowLeft' ? 'W' : 'M');
        return;
      }
      // (the menu, the story's screen and the options: Enter presses the button the hand is on, else the screen's first way
      // in; up and down move the hand along what the screen offers, from that first way; Esc goes back a screen: the
      // question of the evening again to its episode, the story and the options to the menu, the menu to the press)
      const along = scr === 'story' ? [...$$('#gt-eps .gt-roll button'), ...$$('#gt-eps .gt-go > .btn')] : scr === 'opts' ? $$('#gt-opts :is(.gt-opts-list :is(button, input), #gt-opts-credits)')
        : [...$$('#g-title .gt-card .gt-go > .btn'), $('#gt-who-line')];
      if (c === 'Enter') { e.preventDefault(); press(onBtn || titleLead()); }
      else if (c === 'Escape' || (c === 'Backspace' && scr !== 'menu')) {
        const E = $('#gt-eps');
        if (scr === 'story' && E && E.sure && E.sure()) return;
        titleScreen(scr === 'menu' ? 'press' : 'menu');
      } else if (c === 'ArrowUp' || c === 'ArrowDown') {
        const list = along.filter(b => b && b.offsetParent), i = list.indexOf(f) >= 0 ? list.indexOf(f) : Math.max(0, list.indexOf(titleLead()));
        const to = list[Math.min(list.length - 1, Math.max(0, i + (c === 'ArrowDown' ? 1 : -1)))]; if (to) to.focus({ preventScroll: true });
      }
      return;
    }
    if (photo.on) { // photo mode: move with WASD (read in photoCamera), Enter saves, Esc or O leaves
      if (c === 'Enter') snapPhoto(); else if (c === 'Escape' || c === 'KeyO') photoMode(false);
      return;
    }
    if (closeup) { // looking closer: WASD read in closeupCamera, Enter saves a photo, E or Esc steps back
      if (c === 'Enter') snapPhoto(); else if (c === 'KeyE' || c === 'Escape') closeupEnd();
      return;
    }
    // a key ends the overture, easing down to the player. A story's flight is part of the telling, not an opening to get past:
    // it is skipped only by a key meant for it (Space, Enter, Esc), and not in its first moments, when the E that closed the
    // last line or the first step taken once the words had gone cut it, and the player was on the street with no way down
    if (overture && overture.active) { if (overture.story && (!['Space', 'Enter', 'Escape'].includes(c) || performance.now() - overture.story < 1500)) return; overture.skip(); return; }
    if (story && story.film) { if (['Space', 'Enter', 'Escape'].includes(c)) story.skipFilm(); return; } // (the story's own film, the guide coming: the same keys end it, and no other key walks or opens anything under it)
    if (arriving) settleArrival(); // a key settles the arrival (and still walks, looks or opens what it opens)
    else if (cine.active && cine.label !== 'crane') { cine.skip(); return; } // a key ends a hop or a survey shot
    if (c === 'Escape' && life && life.open) { life.close(); return; }
    if (c === 'Escape' && fish && fish.api && fish.api.logOpen()) { fish.api.showLog(false); return; }
    if (life && life.open) { life.key(c); return; } // (the diary and its pages have the keys while they are up)
    if (c === 'Escape') { if (!phone.el.hidden) phoneShow(false); else if (!$('#g-bigmap').hidden || !$('#g-pass').hidden) { $('#g-bigmap').hidden = $('#g-pass').hidden = true; } else toggleMenu(); return; }
    if (uiOpen()) {
      if (c === 'KeyM' && !story) toggleMap(); // (not over the story's menu: STORY_OFF)
      else if (!$('#g-bigmap').hidden && /^(Equal|NumpadAdd|Minus|NumpadSubtract)$/.test(c)) zoomMap(/Equal|Add/.test(c) ? 1.6 : 1 / 1.6); // + and − zoom the map
      return;
    }
    if (dlg.free && (c === 'KeyE' || c === 'Enter')) { dlg.next(false, true); return; } // (a call said hands-free: E passes a line, every other key is the street's)
    if (dlg.holds) {
      // the answers by the arrows, as a pad's d-pad goes through them (pad.js): the hand on one, then E, Enter or Space takes it
      const B = dlg.hasChoices ? [...document.querySelectorAll('#gd-choices button')] : [], f = document.activeElement;
      if (B.length && /^Arrow(Up|Down|Left|Right)$/.test(c)) { const d = /Up|Left/.test(c) ? -1 : 1, i = B.indexOf(f); B[i < 0 ? (d > 0 ? 0 : B.length - 1) : (i + d + B.length) % B.length].focus({ preventScroll: true }); return; }
      if (B.length && B.includes(f) && (c === 'KeyE' || c === 'Enter' || c === 'Space')) { e.preventDefault(); f.click(); return; }
      if (c === 'KeyE' || c === 'Enter' || c === 'Space' || c === 'KeyF') dlg.next(false, true);
      if (c === 'KeyQ' || c === 'Backspace') dlg.back(); // (one step back: the line said before)
      if (/^Digit[1-9]$/.test(c)) dlg.choose(+c.slice(5) - 1);
      return;
    }
    if (!phone.el.hidden && /^Digit[1-9]$/.test(c) && phone.acts[+c.slice(5) - 1]) { phone.acts[+c.slice(5) - 1](); return; }
    if (fish && fish.api && fish.api.busy() && fish.api.key(c)) return; // the rod's own keys while a line is out
    // (the story's map, in the story or on the walk: none of the old free game's instruments. Its survey lens, its
    // height guess, its passport, its map that sent you anywhere at once, the phone, the taxi at the kerb and the route
    // keys opened panels of a game the story is not, and the map's Travel here could take a player out of a case)
    if (story && STORY_OFF.has(c)) return;
    if (c === 'KeyE' || c === 'KeyF' && !(player.mode === 'ferry' || player.mode === 'rail' || player.mode === 'ride')) interact();
    else if (c === 'KeyF' && (player.mode === 'ferry' || player.mode === 'rail')) skip = !skip;
    else if (c === 'KeyF' && player.mode === 'ride') skipRide();
    else if (c === 'KeyY') hail();
    else if (c === 'KeyN') phoneShow(phone.el.hidden ? undefined : false);
    else if (c === 'KeyH' && player.mode === 'car') A.honk();
    else if (c === 'KeyV' && (player.mode === 'car' || player.mode === 'ride')) { cam.mode = cam.mode === 'cabin' ? 'chase' : 'cabin'; cam.lastInput = -10; if (cam.mode === 'cabin') cam.pitch = 0.2; }
    else if (c === 'KeyV' && onTrain()) nextView();
    else if (c === 'KeyR' && player.mode === 'car') resetCar();
    else if (c === 'KeyJ' && player.mode === 'car') pilotAsk(e.shiftKey);
    else if (c === 'KeyI' && player.mode === 'car') assistToggle('lane');
    else if (c === 'KeyK' && player.mode === 'car') assistToggle('cruise');
    else if (c === 'KeyQ') lens();
    else if (c === 'KeyG') guessStart();
    else if (c === 'KeyT') cycleTrack();
    else if (c === 'KeyL') peekRoute();
    else if (c === 'KeyC' && player.mode === 'foot' && (walk || !story)) bringCar(); // (your car to the kerb nearest you: the walk's corner says so)
    else if (c === 'KeyO') photoMode(true);
    else if (c === 'Enter' && guess.bi >= 0 && !guess.revealed) guessCheck();
    else if (c === 'KeyV') nextView();
    else if (c === 'KeyM') toggleMap();
    else if (c === 'KeyB' && metro) openMetro();
    else if (c === 'KeyP') togglePass();
    else if (life && life.key(c)) { /* the diary (J) and what the modules on life.js take */ }
    else if (c === 'KeyH' && player.mode === 'ferry') takeHelm();
    else if (c === 'KeyR' && player.mode === 'foot') unstuck();
    else if (c === 'KeyX' && player.mode === 'foot') { player.walking = !player.walking; H.toast(player.walking ? 'Walking. <kbd>X</kbd> to run, hold <kbd>Shift</kbd> to sprint.' : 'Running. <kbd>X</kbd> to walk, hold <kbd>Shift</kbd> to sprint.'); }
  });
  on(window, 'keyup', e => keys.delete(e.code));
  on(window, 'blur', () => keys.clear());
  let drag = null;
  on(canvas, 'pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); A.start(); if (overture && overture.active) { if (!overture.story || performance.now() - overture.story > 1500) overture.skip(); } else if (arriving) settleArrival(); else if (cine.active) cine.skip(); });
  on(canvas, 'pointermove', e => {
    if (!drag || drag.id !== e.pointerId || fingers.size > 1) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (photo.on) { photo.az += dx * 0.006; photo.pitch = Math.max(-0.35, Math.min(1.5, photo.pitch + dy * 0.005)); photoSync(); return; }
    if (closeup) { closeup.c.turn(-dx * 0.004, -dy * 0.003); return; }
    if (player.mode === 'heli' && cam.mode === 'cockpit') { cam.lookYaw = Math.max(-2.4, Math.min(2.4, cam.lookYaw - dx * 0.005)); cam.lookPitch = Math.max(-1.1, Math.min(0.8, cam.lookPitch - dy * 0.004)); }
    else if (onTrain() && cam.mode !== 'chase') { cam.lookYaw = Math.max(-2.6, Math.min(2.6, cam.lookYaw + dx * 0.005)); cam.lookPitch = Math.max(-0.9, Math.min(0.8, cam.lookPitch - dy * 0.004)); }
    else if (player.mode === 'seat' && perch && perch.seat) perch.turn(dx, dy); // (on a perch: your head, and the tripod's aim with it)
    else if (player.mode === 'seat') { cam.lookYaw = Math.max(-1.9, Math.min(1.9, cam.lookYaw + dx * 0.004)); cam.lookPitch = Math.max(-0.7, Math.min(0.9, cam.lookPitch - dy * 0.0035)); } // in a seat: you turn your head
    else { const ls = fpOn ? lensTurn() : 1; cam.yawTo = cam.pitchTo = null; cam.yaw += dx * 0.006 * ls; cam.pitch = Math.max(fpOn ? -0.6 : -0.25, Math.min(fpOn ? 1.62 : 1.35, cam.pitch + dy * 0.005 * ls)); } // (through the lens, slower the longer it is, and up as far as the eye looks)
    cam.lastInput = clockT;
  });
  on(canvas, 'pointerup', e => { if (drag && drag.moved < 6 && dlg.holds) dlg.next(false, true); drag = null; });
  on($('#gp-alt'), 'click', () => { const a = altAction(); if (a) { A.start(); a.act(); } });
  // on a phone the prompt is a button too, and two fingers on the picture zoom as the wheel does
  if (touch) on($('#gp-main'), 'click', () => interact());
  function zoom(f) {
    if (photo.on) { photo.dist = Math.max(1.5, Math.min(400, photo.dist * f)); photoSync(); return; }
    if (player.mode === 'heli' && cam.mode === 'bird') cam.birdAlt = Math.max(120, Math.min(1200, cam.birdAlt * f));
    else { cam.distTo = 0; cam.dist = Math.max(fpOn ? 0.68 : 2.5, Math.min(player.mode === 'foot' ? 30 : 120, cam.dist * f)); } // (with the camera up the ring turns on to 12 degrees: the wheel's 0.68)
  }
  const fingers = new Map(); let pinch = 0;
  const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
  on(canvas, 'pointerdown', e => { if (e.pointerType !== 'touch') return; fingers.set(e.pointerId, [e.clientX, e.clientY]); pinch = fingers.size === 2 ? spread() : 0; });
  on(canvas, 'pointermove', e => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (fingers.size === 2 && pinch > 0) { const d = Math.max(8, spread()); zoom(Math.max(0.8, Math.min(1.25, pinch / d))); pinch = d; }
  });
  for (const ev of ['pointerup', 'pointercancel']) on(canvas, ev, e => { fingers.delete(e.pointerId); pinch = 0; });
  on(canvas, 'wheel', e => {
    e.preventDefault();
    zoom(photo.on ? (e.deltaY > 0 ? 1.1 : 0.91) : e.deltaY > 0 ? 1.12 : 0.89);
  }, { passive: false });
  // touch: joystick on the left, buttons on the right
  if (touch) {
    $('#g-touch').hidden = false;
    const pad = $('#gt-joy'), knob = $('#gt-knob');
    let jid = null, c0 = null;
    on(pad, 'pointerdown', e => { jid = e.pointerId; c0 = [e.clientX, e.clientY]; pad.setPointerCapture(jid); pad.classList.add('on'); A.start(); settleArrival(); });
    on(pad, 'pointermove', e => {
      if (e.pointerId !== jid) return;
      let dx = (e.clientX - c0[0]) / 50, dy = (e.clientY - c0[1]) / 50;
      const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      joy = { x: dx, y: -dy }; knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
    });
    const end = () => { jid = null; joy = { x: 0, y: 0 }; knob.style.transform = ''; pad.classList.remove('on'); };
    on(pad, 'pointerup', end); on(pad, 'pointercancel', end);
    const hold = (id, down, up) => { on($(id), 'pointerdown', e => { e.preventDefault(); down(); }); on($(id), 'pointerup', up || (() => {})); on($(id), 'pointercancel', up || (() => {})); };
    hold('#gt-act', () => (dlg.open ? dlg.next(false, true) : interact()));
    hold('#gt-jump', () => { if (player.mode === 'heli') touchLift = 1; else keys.add('Space'); }, () => { touchLift = 0; keys.delete('Space'); });
    // Down in the air, the horn in a car, Skip for a passenger (a taxi's trip, a ferry's or a train's leg), Guess on foot
    hold('#gt-down', () => {
      const m = player.mode;
      if (m === 'heli') touchLift = -1; else if (m === 'car') A.honk(); else if (m === 'ride') skipRide(); else if (m === 'ferry' || m === 'rail') skip = !skip; else guessStart();
    }, () => { touchLift = 0; });
    hold('#gt-run', () => { if (player.mode === 'car') { pilotAsk(); return; } keys.has('ShiftLeft') ? keys.delete('ShiftLeft') : keys.add('ShiftLeft'); $('#gt-run').setAttribute('aria-pressed', String(keys.has('ShiftLeft'))); });
    hold('#gt-cam', () => { if (player.mode === 'car' || player.mode === 'ride') cam.mode = cam.mode === 'cabin' ? 'chase' : 'cabin'; else nextView(); });
    hold('#gt-lens', () => (player.mode === 'car' ? assistToggle() : lens()));
  }
  let nearXing = null; // (the closed level crossing you stand at)
  let skip = false, waitFerry = null, lastDock = null, lastBoard = null, waitRail = null; // (waitRail: the station whose next train you are waiting for, the railway's clock run fast)
  // V: the chase camera and the bird's-eye view, and in the helicopter the pilot's own view between them
  // the pilot's view (issue 335): the lens, the look ahead's pitch, and any move of the eye from the model's Eye_Pilot
  // (+x left, +y up, +z forward, m). As in the flight sims' pilot views (MSFS's VFR view), most of the picture is
  // the world outside: the eye (blender/build_vehicles.py) leaning to the cyclic under the line of the windscreen's
  // top, looking ahead through the bubble nose, the low glare shield a band along the bottom
  const COCKPIT = { fov: 66, pitch: -0.08, eye: new THREE.Vector3(0, 0, 0) };
  // and from the seat (while the cockpit view is up; put back after): the glass all but clear, as the flight sims
  // show the pilot only faint reflections (its clear coat mirrored the bright sky from inside); the outer skin
  // drawn from outside only, so that where the cabin's lining leaves a gap under the nose the pilot sees down
  // through it, not the white paint's inside, which showed as a white disc under the panel; and the lining a
  // cabin's dark grey rather than near black, which in the cabin's shade drew every frame as a black mask
  let cabinKept = null;
  function cockpitGlass(on) {
    if (on && !cabinKept) {
      cabinKept = [];
      const seen = new Set();
      heli.group.traverse(o => { for (const m of [].concat(o.material || [])) {
        if (seen.has(m)) continue;
        seen.add(m);
        if (m.isMeshPhysicalMaterial && m.transparent && !m.depthWrite && m.clearcoat > 0.5) { cabinKept.push([m, { opacity: m.opacity, clearcoat: m.clearcoat }]); m.opacity = 0.08; m.clearcoat = 0.12; }
        else if (/^Paint_|^Stripe/.test(m.name)) { cabinKept.push([m, { side: m.side }]); m.side = THREE.FrontSide; m.needsUpdate = true; }
        else if (m.name === 'Lining' || m.name === 'Interior') { cabinKept.push([m, { color: m.color.clone() }]); m.color.setRGB(0.045, 0.05, 0.055); }
        // (and what showed at the foot of the view, below the panel: the windscreen's and the chin windows' gaskets, a
        // black arc round the nose; the lining of the nose's lower half, a grey wedge between the windscreen's two lower
        // edges; the wire cutter under the nose. Left out from the seat, so the pilot looks down through the nose to the
        // ground, and kept from outside)
        else if (/^Gasket/.test(m.name) || m.name === 'Lining_Nose' || m.name === 'Cutter') { cabinKept.push([m, { visible: m.visible }]); m.visible = false; }
      } });
    } else if (!on && cabinKept) {
      for (const [m, was] of cabinKept) { if (was.color) m.color.copy(was.color); else Object.assign(m, was); if ('side' in was) m.needsUpdate = true; }
      cabinKept = null;
    }
  }
  const VIEWS = { chase: ['Chase view', 'chase view'], cockpit: ['Cockpit view: drag to look round', 'cockpit'], bird: ["Bird's-eye view: scroll to change height", "bird's-eye"],
    cabin: ['From the window seat: drag to look round', 'window seat'], cab: ['Behind the driver: drag to look round', 'cab'] };
  const onTrain = () => player.mode === 'rail' && player.vehicle && player.vehicle.train;
  const viewOrder = () => (player.mode === 'heli' ? ['chase', 'cockpit', 'bird'] : onTrain() ? (rail.train && rail.train.modelled ? ['chase', 'cabin', 'cab'] : ['chase']) : ['chase', 'bird']);
  const nextViewOf = m => { const o = viewOrder(); return o[(o.indexOf(m) + 1) % o.length]; };
  function nextView() {
    cam.mode = nextViewOf(cam.mode);
    if (cam.mode === 'cockpit') { cam.lookYaw = 0; cam.lookPitch = COCKPIT.pitch; }
    if (onTrain()) { cam.lookYaw = 0; cam.lookPitch = -0.04; }
    camera.up.set(0, 1, 0);
    blendFrom(); // (a short move from the old view to the new, not a cut; issue 335)
    H.toast(VIEWS[cam.mode][0]);
  }
  // the camera eased from where it is to the new view over VIEW_BLEND s (an ease-out, as games move between
  // their views): the view it left is held where it was and the new one runs on, so nothing in it lags
  // (the view left is held where it was relative to you, so that at speed in the air it travels with you)
  const VIEW_BLEND = 0.45, viewBlend = { t: 1, pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(), fov: BASE_FOV, at: new THREE.Vector3() };
  const focusW = out => (player.mode === 'heli' ? out.copy(W(heli.st.x, heli.st.y, heli.st.z)) : out.copy(W(player.x, player.y, player.z)));
  // (a scene changing under you, into or out of a car, a taxi or a seat: from where the camera was, over `dur` s,
  // eased in and out, where the chase rig would have cut to the new view or swung round it at 16 rad/s)
  function blendFrom(dur = VIEW_BLEND, inOut = false) {
    viewBlend.dur = dur; viewBlend.inOut = viewBlend.world = inOut; // (held where it was in the world: you are put into the seat or beside the door in the meantime)
    viewBlend.t = 0; focusW(viewBlend.at);
    viewBlend.pos.copy(camera.position).sub(viewBlend.at); viewBlend.up.copy(camera.up); viewBlend.fov = camera.fov;
    camera.getWorldDirection(viewBlend.look).multiplyScalar(30).add(camera.position).sub(viewBlend.at);
    if (inOut) viewBlend.look.copy(live.look).sub(viewBlend.at); // (what it looked at: you, where you stood)
  }

  // ------------------------------------------------------------ interaction
  // the next ferry calling at a wharf; with a destination, only ferries whose route goes there
  function nextFerry(wid, toward) {
    let best = null;
    for (const v of fer.vessels) if (v.stops.includes(wid) && (!toward || v.stops.includes(toward))) { const t = fer.eta(v, wid); if (!best || t < best.t) best = { v, t }; }
    return best;
  }
  const rideSteps = goals.rideSteps;
  const rideTarget = wid => { const r = rideSteps().find(([, s]) => s.from === wid); return r ? r[1].to : null; };
  function nearWharf(x, y, r = 30) {
    let best = null, bd = r;
    for (const w of G.wharves) { const d = Math.min(Math.hypot(w.terminal[0] - x, w.terminal[1] - y), Math.hypot(w.berth[0] - x, w.berth[1] - y), Math.hypot(w.landing[0] - x, w.landing[1] - y)); if (d < bd) { bd = d; best = w; } }
    return best;
  }
  // in a story, of everything the map offers (cars, the helicopter, a word with a passer-by) only what the story has a
  // part for is offered: a lift to ride, and getting out of what you are in
  // (and on the walk the same: the story's map with nothing of the old free game's in it, a lift and a way out of it)
  // (in the story only what the story offers; on the walk that, and your car and the helicopter as well: walk, below)
  function currentAction() { const a = currentActionAny(); return story && (story.on || walk) && a && a.act && !a.story && !(walk && a.walk) ? null : a; } // (walk: set only from the title or the last card, and left only by opening the page again, so no case runs under it; story.on is true on it, the evening being dressed)
  function currentActionAny() {
    if (closeup) return { key: 'E', text: 'Step back', act: closeupEnd };
    if (dlg.open || uiOpen() || cine.active || OEOnboard.active()) return null; // nothing to start while the tour is showing
    // a story's helicopter on its pad: E beside it and you are in (story ctx board), before anyone near it is talked to
    if (heliWait && heliWait.then && player.mode === 'foot' && Math.hypot(heli.st.x - player.x, heli.st.y - player.y) < HELI_REACH && Math.abs(heli.st.z - player.z) < 4) return { key: 'E', story: true, text: 'Get in the helicopter', act: () => { const w = heliWait; heliWait = null; A.thump(); w.then(); } };
    if (player.mode === 'seat') return { key: 'E', walk: !!(perch && perch.seat), text: 'Stand up', act: standUp }; // (off a perch on the walk too)
    if (fish && fish.api && fish.api.busy()) return fish.api.action(); // a line is out (fishing.js)
    if (player.mode === 'lift') return { key: '', text: liftRide && liftRide.phase === 'ride' ? `To ${liftRide.b.name}…` : liftRide && liftRide.phase === 'call' ? 'The car is coming…' : '' };
    if (player.mode === 'heli') {
      if (heli.st.landed && heli.st.speed < 1) return { key: 'E', walk: true, text: 'Get out', act: exitHeli };
      return null;
    }
    if (player.mode === 'ferry') {
      const v = player.vehicle, here = fer.stopOf(v);
      if (here) return { key: 'E', text: `Get off at ${wharfById(here).name}`, act: alight };
      return null;
    }
    if (player.mode === 'rail') {
      const here = rail.stationOf(player.vehicle.id);
      if (here && player.vehicle.moved) return { key: 'E', text: `Get off at ${here.name}`, act: alightRail };
      return null;
    }
    if (player.mode === 'car') return myCar.D.st.speed < 1.5 ? { key: 'E', walk: true, text: 'Get out', act: exitCar } : null;
    if (player.mode === 'ride') return ride && ride.phase !== 'asking' && ride.drv.st.v < 0.5 ? { key: 'E', story: true, text: ride.phase === 'arrived' ? `Get out at ${ride.dest.name}` : 'Get out here', act: leaveRide } : null;
    if (player.auto) return player.auto.label ? { key: '', text: player.auto.label } : null;
    let bn = null, bd = 3.2;
    // (within reach, 3.2 m, and on your level: the prompt is offered only at arm's length, never across the street, and in
    // the frame or not, as someone beside you on a phone held upright is out of its narrow frame. A ray through the solids
    // was tried too, and took the talk from Riko at 1.6 m: a post between your chest and hers is not a wall)
    for (const n of npcs) { const d = Math.hypot(n.x - player.x, n.y - player.y); if (!n.away && d < bd && Math.abs(n.z - player.z) < 2) { bd = d; bn = n; } }
    // (not on the story's page, which offers no talk of the old game's: there it stood first and was then put away, and
    // so hid what comes after it, your car beside someone on the walk, a lift with its attendant beside it)
    if (bn && !(story && (story.on || walk))) return { key: 'E', text: `Talk to ${bn.name}`, act: () => talkTo(bn) };
    // (on the walk: someone on the ground, who can be helped up; then whoever has something to say, a part of a story or a
    // word in passing; walktalk.js)
    if (bn && walk && walkTalk && !walkTalk.busy && !waitRun && player.mode === 'foot' && walkTalk.waits(bn.id)) return { key: 'E', walk: true, text: walkTalk.waits(bn.id), act: () => walkTalk.wait(bn) };
    if (bn && walk && walkTalk && !walkTalk.busy && walkTalk.helps(bn.id)) return { key: 'E', walk: true, text: walkTalk.helps(bn.id), act: () => walkTalk.help(bn) };
    if (bn && walk && walkTalk && !walkTalk.busy && !bn.rig.pending && walkTalk.want(bn.id)) return { key: 'E', walk: true, text: `Talk to ${bn.name.replace(/\s*[\u3000-\u9fff\uff00-\uffef].*$/, '')}`, act: () => walkTalk.talk(bn) };
    // (on the walk: a stretch of stone to sit on and watch the crossing from; perch.js)
    const ph = walk && perch && player.mode === 'foot' && perch.near(player.x, player.y, player.z);
    if (ph) return { key: 'E', walk: true, text: ph.verb, act: () => sitDown(ph) };
    if (fish) { // at a fishing spot (the first time, the code comes with the key press)
      const sp = fish.api ? null : fishSpot(14), a = fish.api ? fish.api.action() : sp && { key: 'E', text: `Fish at ${sp.name}`, act: () => fishLoad().then(api => (api ? api.start() : H.toast('The tackle did not arrive. Try again in a moment.'))) };
      if (a) return a;
    }
    if (ride && (ride.phase === 'waiting' || backIn(ride)) && offCar(ride, player.x, player.y) < 4 && Math.abs(ride.drv.st.z - player.z) < 2) {
      const again = ride.phase === 'leaving' || ride.prev ? 'back ' : '';
      return { key: 'E', story: true, text: ride.kind === 'taxi' ? `Get ${again}in the taxi` : `Get ${again}in ${ride.name}'s ${rideCar(ride)}`, act: () => { if (ride.phase === 'leaving') backAgain(); boardRide(); } };
    }
    // (your car at the kerb and the helicopter on its pad: on the walk too, as a free ride's own car and a sim's aircraft are)
    if (myCar && offCar(myCar, player.x, player.y) < 2.5 && Math.abs(myCar.D.st.z - player.z) < 2) return { key: 'E', walk: true, text: 'Drive your car', act: enterCar };
    if (Math.abs(heli.st.z - player.z) < 3 && (!story || heli.group.visible) && offHeli(player.x, player.y) < HELI_STEPS) return { key: 'E', walk: true, text: 'Board the helicopter', act: enterHeli }; // (a few steps from its cabin or its boom, wherever you stand round it: in at once, enterHeli)
    const st = railStation(player.x, player.y, 25, player.z);
    if (st && (rail.cars.length || st.deck)) {
      // (a railway's station: the train standing nearest you, of the two directions' at a loop)
      const car = rail.cars.filter(c => rail.stationOf(c.id) === st && (!c.train || rail.nextStop(c))).sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0], other = rail.stations.find(o => o !== st);
      if (car && car.train && bounds) return { key: '', text: `${st.name}: the trains run on to ${rail.towards(car)}, past the streets that are open tonight.` }; // (bounds.js)
      if (car) return { key: 'E', text: car.train ? `Board the ${car.line || railRide().name || 'train'} for ${rail.towards(car)}` : `Board the ${railRide().name || 'funicular'} to ${other.name}`, act: () => boardRail(car, st) };
      if (st.train && bounds) return { key: '', text: `${st.name}: the trains run on past the streets that are open tonight.` };
      if (st.train) return { key: 'E', text: `${st.name}: the next train in ${fmtSec(rail.eta(st))} · ${waitRail === st ? 'stop waiting' : 'wait for it'}`, act: () => { waitRail = waitRail === st ? null : st; } };
      return { key: '', text: `${st.name}: the next car is due in ${fmtSec(rail.eta())}` };
    }
    const ls_ = liftStop(player.x, player.y, player.z);
    // (come to a lift's stop, the view left alone for a second: it goes to the lift. Issue 144: in SKY GATE's hall with the
    // view left facing its lacquered wall, the frame was that wall from edge to edge behind the offer of the lift. Where
    // the stop has no hall, a view hemmed in there turns to the nearest open side at once, as where a ride sets you down)
    // (once for each time you come to it, as soon as no hand has been on the view for a second: it waited for that, and
    // was given up if a hand had just been on it, which on the walk's check left the wall in the frame one run in a few)
    const lk_ = ls_ ? ls_.l.id + ls_.i : '';
    if (lk_ !== liftAt) { liftAt = lk_; liftTurn = !!ls_; }
    if (liftTurn && ls_ && player.mode === 'foot' && clockT - cam.lastInput > 1) {
      liftTurn = false;
      const sd = ls_.l.stops[ls_.i];
      // (a stop with a hall of its own, entered by its door: the view goes to the way in, its cars ahead and the hall round you)
      // (the way in, or the nearest turn of it whose camera stands clear with room to spare: SKY GATE's hall is open to
      // the west beside the tower's base, and the view straight in put the lens a hand from the base's skin, which is
      // drawn and not solid, so on a phone the frame was that pale skin from edge to edge one run in a few)
      if (sd.door && Math.hypot(sd.at[0] - sd.door[0], sd.at[1] - sd.door[1]) > 0.5) { cam.yawTo = hallYaw(Math.atan2(sd.at[0] - sd.door[0], sd.at[1] - sd.door[1])); cam.pitchTo = FOOT.pitch; }
      else cam.seek = true;
    }
    if (ls_) { const to = (ls_.i + 1) % ls_.l.stops.length; return { key: 'E', story: true, text: `${ls_.l.verb || 'Take the lift to'} ${ls_.l.stops[to].name}`, act: () => rideLift(ls_.l, ls_.i, to) }; } // (a flight of stairs the game does not draw is climbed as a lift is ridden: game.json lifts[].verb)
    const seatHere = shows && shows.near(player.x, player.y, player.z);
    if (seatHere) return { key: 'E', text: seatHere.verb || 'Sit down', act: () => sitDown(seatHere) };
    const sp = places && places.spotNear(player.x, player.y, player.z);
    if (sp) return { key: 'E', walk: true, text: sp.verb || `Look at ${sp.name}`, act: () => lookAt(sp) }; // (on the walk too: Hachiko's story, the compass's bearings, the net on the roof)
    const tv = VP.find(v => Math.hypot(v.x - player.x, v.y - player.y) < 7 && Math.abs(v.z - player.z) < 3);
    if (tv) return { key: 'E', text: `${trigDone()[tv.id] ? 'Survey again' : 'Survey the view'} from ${tv.name}`, act: () => survey(tv) };
    const w = nearWharf(player.x, player.y);
    if (w) {
      const toward = rideTarget(w.id);
      const docked = fer.vessels.find(v => fer.stopOf(v) === w.id && (!toward || v.stops.includes(toward)));
      if (docked) return { key: 'E', text: `Board ${docked.name} to ${wharfById(fer.nextStop(docked)).name}`, act: () => board(docked, w) };
      const nf = nextFerry(w.id, toward);
      if (waitFerry === w.id) return { key: '', text: `Waiting at ${w.name} for ${nf ? nf.v.name : 'the next ferry'}…` };
      return nf ? { key: 'E', text: `Wait for ${nf.v.name} (due in ${fmtSec(nf.t)})`, act: () => { waitFerry = w.id; } } : { key: '', text: w.name };
    }
    const la = life && life.action(); // a shop's counter, an event, a job's hand-over (life.js)
    if (la) return la;
    const pi = crowd.nearest(player.x, player.y, 2.4);
    if (pi >= 0) return { key: 'E', text: 'Say hello', act: () => {
      const p = crowd.P[pi];
      p.pause = 6; p.face = Math.atan2(player.x - p.x, player.y - p.y); p.wave = true;
      setTimeout(() => { p.face = null; }, 6000);
      dlg.show({ name: 'Passer-by', role: G.local_name || 'Local', pitch: 180 + (pi * 37) % 160, color: '#5b7f99' }, [p.state === 'sit' && p.seat ? benchTalk(p.seat.bench) : smalltalk(p.x, p.y)]);
    } };
    return null;
  }
  function interact() { if (dlg.quiet) return; const a = currentAction(); if (a && a.act) { A.start(); a.act(); } } // (not the press that ended a talk: hud.js dialogue quiet)
  // a spot (places.js): its lines, and a step waiting for it ("spot": its id) moves on
  function lookAt(sp) {
    if (sp.look && places) { closeupStart(sp); return; }
    // a spot with a frame (game.json spots[].frame {eye, look, fov}) opens the camera on it once you have read it:
    // the angle a film or a game made the place known by, from where it was taken (#359)
    dlg.show({ name: sp.name, role: sp.role || '', color: sp.color || '#6d5a3a', pitch: sp.pitch || 260 }, places.lines(sp).map(fill), null,
      sp.frame ? () => framePhoto(sp) : undefined);
    if (!walk) spotDone(sp); // (the old game's stamp and its quests' steps: not on the walk, whose passport there is none)
  }
  function framePhoto(sp) {
    const fr = sp.frame;
    if (!fr || photo.on) return;
    photoMode(true);
    if (!photo.on) return;
    const look = W(...fr.look), eye = W(...fr.eye), p = OECine.polar(look, eye);
    photo.focus.copy(look); photo.anchor.copy(look);
    Object.assign(photo, { az: p.az, pitch: Math.atan2(p.h, Math.max(0.1, p.dist)), dist: Math.max(1, eye.distanceTo(look)), fov: fr.fov || photo.fov });
    photoSync();
    H.toast(`<b>${sp.name}</b><span>${fr.note || 'The angle it is known by.'} <kbd>Enter</kbd> to save the photo, <kbd>Esc</kbd> to step back.</span>`);
  }
  // a spot with a stamp (game.json spots[].stamp) stamps the passport the first time you look at it: a pilgrimage's
  // stops, each its own stamp beside the quests'
  const spotStamps = () => (G.spots || []).filter(sp => sp.stamp);
  function spotDone(sp) {
    if (life) life.emit('spot', { id: sp.id, name: sp.name });
    goals.spotSeen(sp.id);
    if (sp.stamp && !qs.stamps.some(s => s.id === `spot:${sp.id}`)) {
      qs.stamps.push({ id: `spot:${sp.id}`, stamp: sp.stamp, title: sp.name, at: `${clock.d} ${MONTHS[clock.m - 1]} ${fmtMin(clock.min)}` });
      A.chime();
      H.stamp(sp.stamp, sp.name);
      if (life) life.note(`Stamp: ${sp.stamp}`, 'stamp');
      renderPassport();
      save();
    }
  }
  // a photo spot's look closer (places.js closer): the eye a metre off the thing, the walker out of the
  // way, and you look along it with A/D (or the stick) and W/S, drag to turn your head, read what is in
  // the middle of the view, save a photo with Enter, and step back with E or Esc
  let closeup = null;
  function closeupStart(sp) {
    if (photo.on || closeup) return;
    closeup = { sp, c: places.closer(sp, player.x, player.y), text: null };
    stage.classList.add('closer');
    $('#g-closer').hidden = false;
    $('#gc-name').textContent = sp.name + (sp.role ? ` · ${sp.role}` : '');
    player.rig.root.visible = false;
    spotDone(sp);
    const to = closeup.c.step(0, 0, 0), from = { pos: camera.position.clone(), look: live.look.clone() };
    const end = { pos: W(...to.pos), look: W(...to.look) };
    cine.play(OECine.mix(() => from, () => end, q => OECine.ease.smooth(q)), 0.8, { label: 'closer' });
  }
  function closeupEnd() {
    if (!closeup) return;
    closeup = null;
    stage.classList.remove('closer');
    $('#g-closer').hidden = true;
    player.rig.root.visible = true;
    const from = { pos: camera.position.clone(), look: live.look.clone() };
    cine.play(OECine.mix(() => from, () => live, q => OECine.ease.smooth(q)), 0.8, { label: 'closer' }); // (down at the eye's height: not lifted over the roofs)
  }
  const gcHold = { along: 0, up: 0 }; // the panel's arrows, held down on a touch screen
  function closeupCamera(dt) {
    if (cine.active && cine.label === 'closer') { updateCamera(dt, false); return; }
    const along = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) + joy.x + gcHold.along;
    const up = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) + joy.y + gcHold.up;
    const r = closeup.c.step(dt, Math.max(-1, Math.min(1, along)), Math.max(-1, Math.min(1, up)));
    if (camera.fov !== CLOSE_FOV || camera.near !== 0.05) { camera.fov = CLOSE_FOV; camera.near = 0.05; camera.updateProjectionMatrix(); }
    camera.up.set(0, 1, 0);
    camera.position.copy(W(...r.pos));
    const look = W(...r.look);
    camera.lookAt(look);
    live.look.copy(look); // (where the crane back to the walker starts from)
    Wd.fitShadow(look, 40);
    if (r.text !== closeup.text) { closeup.text = r.text; $('#gc-text').textContent = fill(r.text || ''); }
  }
  const CLOSE_FOV = 50;

  function board(v, w) {
    player.mode = 'ferry'; player.vehicle = v; v.rider = true; lastBoard = w.id;
    if (life) life.emit('board', { kind: 'ferry', from: w.id, name: w.name, route: v.route }); // (the tap on: fares.js)
    goals.boarded(w.id);
    cam.yaw = v.h + 0.9; cam.dist = 42; cam.pitch = 0.32;
    blendFrom(1, true); // (out over the deck from your shoulder, not a cut)
    H.toast(`Aboard ${v.name}, ${v.route}. Next stop: ${wharfById(fer.nextStop(v)).name}. <kbd>F</kbd> to skip ahead, <kbd>H</kbd> to take the helm.`);
    A.engine(0.5);
  }
  function boardRail(car, st) {
    player.mode = 'rail'; player.vehicle = car; car.rider = true; car.moved = false; car.from = st.id; car.fromAt = [st.x, st.y]; waitRail = null;
    if (life) life.emit('board', { kind: 'rail', from: st.id, name: st.name, route: car.line || railRide().name || '' });
    cam.yaw = car.h + 1.4; cam.dist = 30; cam.pitch = 0.3;
    if (car.mainline) { player.rig.root.visible = false; cam.dist = 11; cam.pitch = 0.16; } // (in the car, seen only through its windows; the camera close beside it, under a station's roof)
    blendFrom(1, true);
    if (car.train) { const nx = rail.nextStop(car); H.toast(`Aboard the ${car.line || railRide().name || 'train'} for ${rail.towards(car)}${nx ? `. Next stop: ${nx.name}` : ''}.${rail.train && rail.train.modelled ? ' <kbd>V</kbd> for the window seat and the cab,' : ''} <kbd>F</kbd> to skip ahead.`); return; }
    H.toast(`Aboard the ${railRide().name || 'funicular'}. ${railRide().note || ''} <kbd>F</kbd> to skip ahead.`);
  }
  function alightRail() {
    const car = player.vehicle, here = rail.stationOf(car.id);
    const off = rail.alightAt && car.train && rail.alightAt(car); // (a train: onto the platform of its side)
    const p = (off && placeNear(off[0], off[1], off[2] + 0.5, null, 6)) || placeNear(here.x, here.y, here.z + 1) || placeNear(car.x, car.y, car.z + 1);
    if (!p) { H.toast('No safe way off here.'); return; }
    car.rider = false; skip = false;
    if (cam.mode === 'cabin' || cam.mode === 'cab') cam.mode = 'chase';
    player.rig.root.visible = true;
    player.mode = 'foot'; player.vehicle = null;
    [player.x, player.y, player.z] = p;
    cam.distTo = FOOT.dist; cam.pitchTo = FOOT.pitch; blendFrom(0.8, true); // (in from the train's 30 m to over your shoulder, eased: on foot it was left out there)
    if (life && car.moved) life.emit('ride', { kind: 'rail', from: car.from, to: here.id, name: here.name, route: car.line || railRide().name || '', m: car.fromAt ? Math.hypot(here.x - car.fromAt[0], here.y - car.fromAt[1]) : 0 });
    goals.railed(car.from, here.id);
    save();
  }
  // a walkable spot close to (x, y), on the floor reached from z0 (the ground there if not given),
  // not inside any of the boxes in avoid (cars)
  function placeNear(x, y, z0, avoid = null, maxR = 45) {
    if (z0 == null) z0 = Math.max(0, nav.terrain(x, y));
    for (let r = 0; r < maxR; r += r < 45 ? 1.5 : 5) for (let a = 0; a < 6.28; a += r ? Math.max(0.5 / Math.max(1, r / 3), 3 / r) : 7) {
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r, f = nav.floorAt(px, py, z0 + 3), w = f && nav.walk(px, py, f.z, true);
      if (w && w.ok && !(avoid && OECars.pushOut(px, py, w.z, 0.4, avoid).hit)) return [px, py, w.z];
    }
    return null;
  }
  function alight() {
    const v = player.vehicle, here = fer.stopOf(v), w = wharfById(here);
    const p = placeNear(w.landing[0], w.landing[1]) || placeNear(w.berth[0], w.berth[1], 2);
    if (!p) { H.toast('No safe way off here.'); return; }
    v.rider = false; skip = false;
    if (v.helm) fer.finishHelm(v);
    player.mode = 'foot'; player.vehicle = null;
    [player.x, player.y, player.z] = p;
    cam.distTo = FOOT.dist; cam.pitchTo = FOOT.pitch; blendFrom(0.8, true); // (in from the ferry's 42 m to over your shoulder, eased: on foot it was left out there)
    qs.visited[here] = true;
    if (life && lastBoard && lastBoard !== here) { const w0 = wharfById(lastBoard); life.emit('ride', { kind: 'ferry', from: lastBoard, to: here, name: w.name, route: v.route, m: w0 ? Math.hypot(w.berth[0] - w0.berth[0], w.berth[1] - w0.berth[1]) : 0 }); }
    goals.landedAt(here);
    A.engine(0);
    save();
  }
  function takeHelm() {
    const v = player.vehicle;
    if (!v || v.phase !== 'sail') { H.toast('Wait until she is under way.'); return; }
    v.helm = { manual: false, throttle: 0.6, input: {} };
    H.toast('The skipper hands you the wheel for the next wharf. Autopilot until the approach, then it\'s yours: ' + (touch ? 'the stick is her throttle and her rudder.' : 'W/S throttle, A/D rudder.'));
  }
  // Getting in, as your car and a taxi are got into, and as the open-world games on a phone do it (a Get in button,
  // and you are in the seat): E within a few steps of the helicopter and you are in the pilot's seat, the view going
  // round behind it from where you stood, the door seen swinging shut and the rotor spooling up. It was once a walk round
  // to the pilot's door (round the nose from the far side) and a climb onto the skid and into the seat, posed from the
  // walk and the sitting clips with nothing of its own for the climb: seconds of nothing between the key and the seat;
  // on a phone the camera was pressed into the hull as you climbed, and from behind the tail the walk round never got
  // to the door at all. The games whose climb in is shown (GTA) have a captured clip for each door of each machine and
  // fit the hands to it; without one, the cut hidden in a move of the camera is what reads as getting in. Out the same
  // way: on your feet beside the door, the view coming down to you there, the door swinging shut behind you.
  const HALF_PI = Math.PI / 2, HELI_STEPS = 4;
  // how far (x, y) is from the helicopter's hull, its cabin or its boom, in metres (0 under it)
  function offHeli(x, y) {
    let d = Infinity;
    for (const q of heli.boxes()) {
      const dx = x - q.x, dy = y - q.y, f = dx * Math.sin(q.h) + dy * Math.cos(q.h), s = dx * Math.cos(q.h) - dy * Math.sin(q.h);
      d = Math.min(d, Math.hypot(Math.max(0, Math.abs(f) - q.hl), Math.max(0, Math.abs(s) - q.hw)));
    }
    return d;
  }
  function enterHeli() {
    if (!heli.loaded()) { heli.want(); heli.show(); } // in before its model has come: the simple one until you are out again
    const root = player.rig.root, st = heli.st;
    player.auto = null; player.speed = 0;
    heli.group.attach(root); // (you ride in the helicopter's frame from here)
    root.position.copy(heli.way.seat); root.rotation.set(0, 0, 0);
    heliSit();
    player.mode = 'heli'; player.vehicle = heli;
    st.on = true; st.door = 1; st.doorTo = 0; // (shut behind you, a third of a second, as the view comes round)
    // the chase view behind it (near enough that it fills a sixth of the picture's height), come round to from where you
    // stood by bearing, height and distance (blendFrom), longer the farther round: a straight line went through the cabin
    const turn = Math.abs(angDiff(st.h, cam.yaw));
    cam.mode = 'chase'; cam.dist = 20; cam.distTo = 0; cam.yawTo = null; cam.pitchTo = null; cam.pitch = 0.24; cam.yaw = st.h;
    blendFrom(0.9 + turn * 0.16, true);
    A.thump();
    if (!walk && !heliCoach()) H.toast(touch ? 'Door shut, rotor spooling up: it lifts at 90%. Hold <b>Up</b> to climb and <b>Down</b> to descend; the stick flies and turns; <b>View</b> changes the view.'
      : 'Door shut, rotor spooling up: it lifts at 90%. <kbd>Space</kbd> climb, <kbd>C</kbd> descend, <kbd>W</kbd>/<kbd>S</kbd>, <kbd>A</kbd>/<kbd>D</kbd> turn, <kbd>V</kbd> change view.');
  }
  // Seated in the helicopter as in a car (cars.js sit): the top of the head kept clear of the cabin's roof over it, the
  // body sunk a little into the cushion and, if still too tall for this cabin, a little smaller about the seat; and the
  // hands in the lap. (At the seat's own place the player's head stood 9 cm through the roof, hair showing over it from
  // outside, and the hands hung into the seat's sides: tools/clip_people.js seats, issue 157)
  const heliLapV = new THREE.Vector3();
  const heliLap = () => { const root = player.rig.root; root.updateWorldMatrix(true, false); return root.localToWorld(heliLapV.set(0, 0.56, 0.27)); };
  function heliSit() {
    const rig = player.rig, root = rig.root, seatY = heli.way.seat.y, REACH = 0.4, own = root.scale.x; // (own: its size in the helicopter's frame as it got in)
    if (!rig.headTop || !heli.roofOver) return;
    const top = new THREE.Vector3(), foot = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let k = 0; k < 5; k++) {
      rig.reach = heliLap(); rig.animate(0, 0, 'sit', clockT);
      heli.group.updateWorldMatrix(true, true);
      rig.headTop(top);
      const up = heli.roofOver(foot.copy(top).setY(top.y - REACH), root); // (from inside the head: a roof it is already through is still over the ray's foot)
      if (up == null) break;
      const over = REACH - up + 0.06; // (6 cm of room, for the seated idle's sway)
      if (over <= 0.002) break;
      const s = heli.group.getWorldScale(sc).y || 1, sunk = (seatY - root.position.y) * s;
      if (sunk < 0.08 - 1e-4) { root.position.y -= Math.min(0.08 - sunk, over) / s; continue; }
      const h = top.y - root.getWorldPosition(foot).y, to = root.scale.x * Math.max(0.86 * own / root.scale.x, (h - over) / Math.max(0.3, h));
      if (Math.abs(to - root.scale.x) < 1e-4) break;
      root.scale.setScalar(to);
    }
  }
  function exitHeli() {
    const st = heli.st, d = heli.doorAt(), p = placeNear(d.x, d.y, st.z + 0.5, heli.boxes()); // (beside its door, outside its hull)
    if (!p) { H.toast('Land somewhere you can step out.'); return; }
    if (coachHeli && coachHeli.active && coachHeli.id !== 'land') coachHeli.end(); // out before the end: again next flight
    world.attach(player.rig.root);
    player.rig.root.scale.setScalar(1); player.rig.reach = null; // (a cabin too low for you made you a little smaller, and your hands lay in your lap: heliSit)
    player.mode = 'foot'; player.vehicle = null; player.speed = 0; player.ground = true; player.vz = 0; player.auto = null;
    [player.x, player.y, player.z] = p;
    player.h = st.h + HALF_PI; // (facing out from the door: three-quarters to the view)
    player.rig.root.rotation.set(0, Math.PI - player.h, 0);
    st.on = false; st.door = 1; st.doorTo = 0; // (engine off, and the door shut behind you)
    // the view down to you from the chase view or the bird's-eye view, from outside the door and a little behind it, the
    // helicopter beside you (from the other side of you it would stand in the cabin); from the pilot's eyes a cut to it,
    // as a film cuts: a move from there went out through the door's pillar
    const inside = cam.mode === 'cockpit';
    if (cam.mode !== 'chase') { cam.mode = 'chase'; camera.up.set(0, 1, 0); }
    cam.dist = FOOT.dist; cam.distTo = 0; cam.pitchTo = null; cam.pitch = FOOT.pitch; cam.yawTo = null; cam.yaw = st.h - HALF_PI + 0.55;
    if (inside) viewBlend.t = 1; else blendFrom(0.8, true);
    A.thump();
    save();
  }
  // the first flight in this browser (any map): a short coach, a step at a time, each ticked off as you do
  // it (onboard.js): wait for the rotor, climb, fly and turn, come down and land. Out before the end, it
  // runs again on the next flight; finished or skipped, never again (the menu's Show the intro again resets it)
  let coachHeli = null;
  function heliCoach() {
    if (coachHeli && coachHeli.active) return coachHeli;
    const s = heli.st, z0 = s.z;
    let top = z0, h0 = null, turned = 0, flew = false;
    const watch = () => { top = Math.max(top, s.z); if (h0 != null) { turned = Math.max(turned, Math.abs(angDiff(s.h, h0))); } else if (!s.landed) h0 = s.h; if (s.speed > 10) flew = true; };
    coachHeli = OEOnboard.coach('heli', [
      { id: 'spool', title: 'The rotor spools up', done: () => { watch(); return s.rotor >= 0.9; },
        text: 'The door is shut and the engine is starting. It can lift once the rotor reaches 90% (ROTOR, bottom left).',
        touch: 'The door is shut and the engine is starting. It can lift once the rotor reaches 90% (ROTOR, bottom left).' },
      { id: 'climb', title: 'Climb', done: () => { watch(); return top > z0 + 15; },
        text: 'Hold <kbd>Space</kbd> to climb. Let go and it holds its height.',
        touch: 'Hold <b>Up</b> to climb. Let go and it holds its height.' },
      { id: 'fly', title: 'Fly and turn', done: () => { watch(); return flew && turned > 0.8; },
        text: '<kbd>W</kbd> flies forward, <kbd>S</kbd> slows and backs off, <kbd>A</kbd>/<kbd>D</kbd> turn. <kbd>V</kbd> changes the view.',
        touch: 'Push the stick forward to fly, back to slow down, and to either side to turn.' },
      { id: 'land', title: 'Come down and land', done: () => { watch(); return s.landed && top > z0 + 15; },
        text: 'Hold <kbd>C</kbd> to descend and set it down on open ground or a roof. Once down, <kbd>E</kbd> gets out.',
        touch: 'Hold <b>Down</b> to descend and set it down on open ground or a roof. Once down, <b>E</b> gets out.' },
    ], { label: 'First flight', onEnd: () => { coachHeli = null; } });
    return coachHeli;
  }
  function unstuck() {
    const p = placeNear(player.x, player.y, player.z) || placeNear(G.start.at[0], G.start.at[1]);
    if (p) { [player.x, player.y, player.z] = p; player.vz = 0; H.toast('Back on your feet.'); }
  }
  // survey lens: what is this building, and where does its height come from?
  const ray = new THREE.Raycaster();
  ray.firstHitOnly = true;
  function aimed() { // the building under the reticle, within 600 m
    camera.updateMatrixWorld();
    ray.setFromCamera({ x: 0, y: 0.08 }, camera);
    ray.far = 600;
    // (the collision world's solids, the buildings as published, which the walls are drawn from: the drawn mesh
    // keeps no copy for picking here, world.js; local x, y, z are the scene's x, -z, y)
    const o = ray.ray.origin, d = ray.ray.direction, F = ray.far;
    const h = nav.col.pick(o.x, -o.z, o.y, o.x + d.x * F, -(o.z + d.z * F), o.y + d.y * F, nav.BUILDING);
    return h ? { bi: nav.col.idOf(h.pi), distance: h.t * F } : null;
  }
  // Amsterdam: the gables a house's fronts carry (rooftop kind 5 in buildings.json), by building, and
  // when each type was built (Grachtenmuseum); a 'gable' step asks the lens to find the kinds it lists
  const GABLE_KINDS = ['spout', 'step', 'neck', 'bell', 'cornice'];
  const GABLE_DATES = { spout: 'c. 1620-1720, mostly on warehouses', step: 'c. 1600-1665', neck: 'c. 1640-1770', bell: 'c. 1660-1790', cornice: '18th and 19th centuries' };
  let gablesOf = null;
  const gables = bi => {
    if (!gablesOf) {
      gablesOf = new Map();
      for (const p of B.p || []) if (p[1] === 5 && p.length > 9) {
        const b = B.s[p[0]][0], k = GABLE_KINDS[p[9]];
        if (!gablesOf.has(b)) gablesOf.set(b, []);
        if (!gablesOf.get(b).includes(k)) gablesOf.get(b).push(k);
      }
    }
    return gablesOf.get(bi) || [];
  };
  function lens() {
    if (player.mode !== 'foot') return;
    guess.bi = -1;
    const hit = aimed();
    if (!hit) { H.toast('Aim at a building and press Q.'); return; }
    const bi = hit.bi, m = B.b[bi];
    U.uSel.value = bi;
    const name = m[0] || (m[1] ? `Unnamed ${m[1].replace(/_/g, ' ')}` : 'Unnamed building');
    const osm = m[6] && /^[wr]\d+$/.test(m[6]) ? `<a href="https://www.openstreetmap.org/${m[6][0] === 'w' ? 'way' : 'relation'}/${m[6].slice(1)}" target="_blank" rel="noopener">${m[6]}</a>` : '–';
    const SRC = { plateau: 'Measured by aerial survey (Project PLATEAU)', plateau_lod1: 'Block height in Project PLATEAU (no survey record)', survey: 'Surveyed by the mapping agency', lidar: 'Measured by airborne LiDAR', '3dbag': 'Measured by airborne LiDAR (3DBAG)', bdtopo: 'Surveyed eaves (IGN BD TOPO) + typical roof', mapped: 'Surveyed in OpenStreetMap', floors: 'Floor count × storey height', estimate: 'Estimated from neighbours', typical: 'Typical height for its kind', ml: 'ML estimate, bias-corrected', reference: 'Published height (corrected)', verified: 'Verified from a cited source', parametric: 'Parametric landmark' };
    $('#g-lens').innerHTML = `<span class="eyebrow">Survey lens · ${Math.round(hit.distance)} m away</span><b>${name}</b>
      <dl class="kv"><dt>Height</dt><dd class="num">${m[2].toFixed(1)} m</dd><dt>Source</dt><dd>${SRC[m[4]] || m[4]}</dd>${m[3] ? `<dt>Floors</dt><dd class="num">${m[3]}</dd>` : ''}${B.roof_shapes && typeof m[15] === 'number' ? `<dt>Roof</dt><dd>${(B.roof_shapes[m[15]] || 'flat').replace(/_/g, ' ')}${B.roof_materials[m[13]] && m[15] ? `, ${B.roof_materials[m[13]]}` : ''}${(B.roof_sources || [])[m[16]] === 'measured' ? ' (measured)' : ''}</dd>` : ''}${gables(bi).length ? `<dt>Gable</dt><dd>${gables(bi).map(k => k === 'cornice' ? 'cornice front' : `${k} gable`).join(', ')} (${GABLE_DATES[gables(bi)[0]]})</dd>` : ''}${m[4] === 'reference' ? `<dt>Open data said</dt><dd class="num">${m[9].toFixed(1)} m</dd>` : ''}<dt>OSM</dt><dd>${osm}</dd></dl>`;
    $('#g-lens').hidden = false;
    clearTimeout(lens.t);
    lens.t = setTimeout(() => { $('#g-lens').hidden = true; U.uSel.value = -1; }, 6000);
    for (const l of openLines()) {
      const s = stepOf(l), got = ls(l).inspected;
      if (s && s.type === 'inspect' && s.sources.includes(m[4]) && !got.includes(m[4])) { got.push(m[4]); A.chime(); H.toast(`Found one: ${SRC[m[4]]} (${got.length}/${s.sources.length})`); checkSteps(); }
      if (s && s.type === 'gable') for (const k of gables(bi)) if (s.kinds.includes(k) && !got.includes(k)) {
        got.push(k); A.chime(); H.toast(`Found one: a ${k} gable, ${GABLE_DATES[k]} (${got.length}/${s.kinds.length})`); checkSteps();
      }
    }
  }

  // ------------------------------------------------------------ height challenge: guess, then see how good the data is: heights.js (tools/cut.js)
  const { guess, guessCheck, guessStart } = OEGameHeights({ get $() { return $; }, get A() { return A; }, get B() { return B; }, get D() { return D; }, set D(v) { D = v; }, get H() { return H; }, get SRC_TEXT() { return SRC_TEXT; }, get U() { return U; }, get aimed() { return aimed; }, get lens() { return lens; }, get life() { return life; }, get player() { return player; }, get qs() { return qs; }, get save() { return save; } });

  // ------------------------------------------------------------ surveying from a trig station: survey.js (tools/cut.js)
  let surveyLabels = [], surveyFov = BASE_FOV;
  const { survey, viewshed } = OEGameSurvey({ get A() { return A; }, get B() { return B; }, get BASE_FOV() { return BASE_FOV; }, get DSM() { return DSM; }, get H() { return H; }, get MONTHS() { return MONTHS; }, get SRC_TEXT() { return SRC_TEXT; }, get VP() { return VP; }, get W() { return W; }, get cam() { return cam; }, get chasePolar() { return chasePolar; }, get cine() { return cine; }, get clock() { return clock; }, get dlg() { return dlg; }, get fmtMin() { return fmtMin; }, get handOver() { return handOver; }, get head() { return head; }, get labels() { return labels; }, get labelsEl() { return labelsEl; }, get life() { return life; }, get live() { return live; }, get player() { return player; }, get qs() { return qs; }, get renderPassport() { return renderPassport; }, get save() { return save; }, get scene() { return scene; }, get stage() { return stage; }, get surveyFov() { return surveyFov; }, set surveyFov(v) { surveyFov = v; }, get surveyLabels() { return surveyLabels; }, set surveyLabels(v) { surveyLabels = v; }, get trigDone() { return trigDone; } });

  // ------------------------------------------------------------ photo mode: photo.js (tools/cut.js)
  const { lensBlur, photo, photoCamera, photoMode, photoSync, snapPhoto } = OEGamePhoto({ get $() { return $; }, get A() { return A; }, get BASE_FOV() { return BASE_FOV; }, get CITY() { return CITY; }, get H() { return H; }, get MONTHS() { return MONTHS; }, get RAD() { return RAD; }, get S() { return S; }, get Wd() { return Wd; }, get atmos() { return atmos; }, set atmos(v) { atmos = v; }, get camera() { return camera; }, get canvas() { return canvas; }, get cine() { return cine; }, get cityId() { return cityId; }, get clock() { return clock; }, get closeup() { return closeup; }, set closeup(v) { closeup = v; }, get closeupEnd() { return closeupEnd; }, get dlg() { return dlg; }, get fmtMin() { return fmtMin; }, get gcHold() { return gcHold; }, get joy() { return joy; }, set joy(v) { joy = v; }, get k() { return k; }, get life() { return life; }, get live() { return live; }, get mirrorTick() { return mirrorTick; }, get nav() { return nav; }, get on() { return on; }, get player() { return player; }, get renderer() { return renderer; }, get sees() { return sees; }, get setClock() { return setClock; }, get stage() { return stage; }, get sun() { return sun; }, set sun(v) { sun = v; }, get walk() { return walk; }, set walk(v) { walk = v; }, get walkTalk() { return walkTalk; }, get world() { return world; } });

  // ------------------------------------------------------------ menus, map, passport: menus.js (tools/cut.js)
  let bigView = null, waypoint = null, bigPins = [], picked = null, travelKey = '';
  const { bigCanvas, mapPop, toggleMap, toggleMenu, togglePass } = OEGameMenus({ get $() { return $; }, get $$() { return $$; }, get drawBig() { return drawBig; }, get menuSync() { return menuSync; }, get on() { return on; }, get picked() { return picked; }, set picked(v) { picked = v; }, get renderPassport() { return renderPassport; }, get parkTitle() { return parkTitle; }, get story() { return story; }, get storyLog() { return storyLog; }, get tonight() { return tonight; }, set tonight(v) { tonight = v; }, get travelKey() { return travelKey; }, set travelKey(v) { travelKey = v; }, get walk() { return walk; }, set walk(v) { walk = v; }, get walkTalk() { return walkTalk; }, get walkUi() { return walkUi; }, set walkUi(v) { walkUi = v; } });

  // ------------------------------------------------------------ map travel
  // Any time, from the map, as Genshin Impact's and Breath of the Wild's maps let you: to the city's
  // landmarks (scene.labels), its travel points, trig stations and wharves, your car, the start, or
  // any spot you pick, the way Flight Simulator's world map drops you anywhere. On foot, in your car
  // (it comes along to a kerb there) or in a taxi (it lets you out). A landmark is framed on arrival
  // as Google Earth's fly-to frames a place: you stand back from it by about its height, on a spot
  // with a clear line of sight to its upper part through the 2 m surface model, lit from behind you
  // by day, facing it, with the camera low enough to take in its top.
  const landmarks = Object.entries(scene.labels || {}).map(([name, p]) => ({ kind: 'landmark', id: `lm-${name}`, name, at: [p[0], p[1]], top: p[2] }));
  // ------------------------------------------------------------ the region round this map: region.js (tools/cut.js)
  let mapDrag = null, dragged = false, bigNames = []; // a pan under way, and whether the press that ends it moved (then it is no click)
  let bigChips = []; // the chips at the map's edge for the districts out of view: [x0, y0, x1, y1, map]
  let titleKeyed = false; // (a press made by the title's keys, for ownPress)
  const { DISTRICT_AIR, bodyOf, deckOf, deckStand, districtEdge, drawBig, inFrame, lookOf, mapZ, moreTray, ownPress, region, screenOf, seenNow, standFor, titleEl, titleLead, titleScreen, travelGroups, travelTo, whoAsk, whoBack, whoDone, whoGate, whoNeeded, whoPick, whoSync, zoomMap } = OEGameRegion({ get $() { return $; }, get $$() { return $$; }, get A() { return A; }, get B() { return B; }, get BASE_FOV() { return BASE_FOV; }, get CITY() { return CITY; }, get DSM() { return DSM; }, get FOOT() { return FOOT; }, get FRAME() { return FRAME; }, get G() { return G; }, get H() { return H; }, get KEY() { return KEY; }, get MONTHS() { return MONTHS; }, get P() { return P; }, get PLAYER_KEY() { return PLAYER_KEY; }, get PLAYER_LOOKS() { return PLAYER_LOOKS; }, get VP() { return VP; }, get W() { return W; }, get applyDensity() { return applyDensity; }, get applySun() { return applySun; }, get base() { return base; }, get bigCanvas() { return bigCanvas; }, get bigChips() { return bigChips; }, set bigChips(v) { bigChips = v; }, get bigNames() { return bigNames; }, set bigNames(v) { bigNames = v; }, get bigPins() { return bigPins; }, set bigPins(v) { bigPins = v; }, get bigView() { return bigView; }, set bigView(v) { bigView = v; }, get bounds() { return bounds; }, get cam() { return cam; }, get camera() { return camera; }, get carBoxes() { return carBoxes; }, get cars() { return cars; }, get cityId() { return cityId; }, get clock() { return clock; }, get clockT() { return clockT; }, set clockT(v) { clockT = v; }, get cycleTrack() { return cycleTrack; }, get density() { return density; }, get doorAt() { return doorAt; }, get dragged() { return dragged; }, set dragged(v) { dragged = v; }, get fer() { return fer; }, get fish() { return fish; }, get fishLoad() { return fishLoad; }, get flocks() { return flocks; }, get fmtMin() { return fmtMin; }, get gamepad() { return gamepad; }, get goals() { return goals; }, get gold() { return gold; }, get gov() { return gov; }, get groundLod() { return groundLod; }, get groundZ() { return groundZ; }, get guide() { return guide; }, get heli() { return heli; }, get hopTo() { return hopTo; }, get kerbNear() { return kerbNear; }, get landmarks() { return landmarks; }, get lib() { return lib; }, set lib(v) { lib = v; }, get life() { return life; }, get lifts() { return lifts; }, get mapDrag() { return mapDrag; }, set mapDrag(v) { mapDrag = v; }, get mapPop() { return mapPop; }, get me() { return me; }, get menuSync() { return menuSync; }, get metro() { return metro; }, get myCar() { return myCar; }, set myCar(v) { myCar = v; }, get nav() { return nav; }, get npcs() { return npcs; }, get objective() { return objective; }, get on() { return on; }, get openMetro() { return openMetro; }, get overture() { return overture; }, set overture(v) { overture = v; }, get parkMyCar() { return parkMyCar; }, get peekRoute() { return peekRoute; }, get picked() { return picked; }, set picked(v) { picked = v; }, get pilot() { return pilot; }, set pilot(v) { pilot = v; }, get placeNear() { return placeNear; }, get player() { return player; }, get playerChar() { return playerChar; }, set playerChar(v) { playerChar = v; }, get presetTime() { return presetTime; }, get rail() { return rail; }, set rail(v) { rail = v; }, get reduced() { return reduced; }, get renderPassport() { return renderPassport; }, get ride() { return ride; }, set ride(v) { ride = v; }, get rideAway() { return rideAway; }, get rideSeat() { return rideSeat; }, get routeMode() { return routeMode; }, set routeMode(v) { routeMode = v; }, get save() { return save; }, get scene() { return scene; }, get setClock() { return setClock; }, get setPlayerCharacter() { return setPlayerCharacter; }, get setRouteMode() { return setRouteMode; }, get settings() { return settings; }, get sideObjectives() { return sideObjectives; }, get spawn() { return spawn; }, get startGame() { return startGame; }, get startTour() { return startTour; }, get stepOut() { return stepOut; }, get story() { return story; }, get sun() { return sun; }, set sun(v) { sun = v; }, get titleKeyed() { return titleKeyed; }, set titleKeyed(v) { titleKeyed = v; }, get toggleMap() { return toggleMap; }, get toggleMenu() { return toggleMenu; }, get togglePass() { return togglePass; }, get touch() { return touch; }, get travelKey() { return travelKey; }, set travelKey(v) { travelKey = v; }, get trigDone() { return trigDone; }, get wantsTalk() { return wantsTalk; }, get waypoint() { return waypoint; }, set waypoint(v) { waypoint = v; }, get weather() { return weather; }, get world() { return world; } });

  // ------------------------------------------------------------ start
  // A city's opening shot (game.start.shot, #110): the title looks at shot.look (absolute, in metres) from behind
  // the start's view, and Play cranes down from there to over the player's shoulder in shot.dur seconds, the player
  // facing the start's way. At a scramble near the start (Shibuya's), its walk turns green shot.walk_in seconds into
  // the move, with the crowd gathered at its kerbs (musterScramble), so it is a few seconds into its walk, the crowd
  // stepping out round you, as control comes to you.
  const OPENING = G.start.shot ? (sh => ({ look: sh.look, dur: sh.dur || 4.2, walkIn: sh.walk_in ?? 2.2, sway: (sh.sway_deg ?? 8) * Math.PI / 180,
    face: Math.atan2((G.start.facing || [0, 1])[0] - G.start.at[0], (G.start.facing || [0, 1])[1] - G.start.at[1]), yaw: null, r: 470, h: 150 }))(G.start.shot) : null;
  // the story's title is a shot from the street, not from the air: low behind the start's kerb, looking up past the
  // screens into the blue hour, the sky the top of the frame and the crossing under it, pushing in slowly (the air is
  // the map's least finished view, and the story is one kerb's). TITLE_LOW: metres behind the start, the eye's height,
  // and how far the push goes
  const TITLE_LOW = { back: 9, eye: 1.25, push: 7 };
  if (OPENING && G.story) {
    const [lx, ly, lz] = OPENING.look, [sx, sy] = G.start.at, d = Math.hypot(lx - sx, ly - sy);
    OPENING.yaw = Math.atan2(lx - sx, ly - sy); OPENING.r = d + TITLE_LOW.back; OPENING.h = Math.max(0, nav.terrain(sx, sy)) + TITLE_LOW.eye - lz; OPENING.push = TITLE_LOW.push;
  }
  // the title's view for the opening shot: from behind the start's view, turned by up to 30 degrees and raised
  // as far as it takes to see the screens clear of the towers in front of them (Shibuya's station towers)
  function openingView() {
    if (OPENING.yaw != null) return OPENING;
    const [lx, ly, lz] = OPENING.look;
    let best = null;
    for (const h of [150, 190, 240, 300]) for (let k = 0; k <= 12; k++) {
      const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 5 * Math.PI / 180, yaw = OPENING.face + off, r = 470;
      const cx = lx - Math.sin(yaw) * r, cy = ly - Math.cos(yaw) * r, cz = lz + h;
      let block = 0; // (over a fan of lines to points about the screens: the frame's middle open, not a slot between towers)
      for (const [u, w] of [[0, 0], [-90, 0], [90, 0], [-45, 40], [45, 40], [0, -15]]) {
        const tx = lx + Math.cos(yaw) * u, ty = ly - Math.sin(yaw) * u, tz = lz + w;
        for (let i = 1; i < 40; i++) { const t = i / 40, z = cz + (tz - cz) * t; block += Math.max(0, roofBelow(cx + (tx - cx) * t, cy + (ty - cy) * t) - z); }
      }
      const cost = block + h * 0.05 + Math.abs(off) * 20;
      if (!best || cost < best.cost) best = { cost, yaw, h };
    }
    return Object.assign(OPENING, { yaw: best.yaw, h: best.h });
  }
  const openingHere = () => !!OPENING && player.mode === 'foot' && Math.hypot(player.x - G.start.at[0], player.y - G.start.at[1]) < 8;
  // the crowd at a scramble near the player as its walk begins: a few at each kerb of every crosswalk, more at
  // the player's, ready to step out (the walkers farthest off are moved, out of sight)
  function musterScramble() {
    const j = junctions.J.find(q => q.scramble && Math.hypot(q.x - player.x, q.y - player.y) < 80);
    if (!j) return 0;
    const spots = [], tmp = {};
    for (const [line, xs] of crowd.crossings.byLine) for (const x of xs) {
      if (!x.scramble || x.a.j !== j) continue;
      for (const end of [-1, 1]) {
        const len = crowdNet.L[line].len, sk = Math.max(0, Math.min(len, x.s + end * x.kerb));
        crowdNet.at(line, sk, tmp);
        const mine = Math.hypot(tmp.x - player.x, tmp.y - player.y) < 6, n = Math.max(1, Math.round((mine ? 11 : 4) * faceShare)); // (a phone's as its faces can fill: faceShare)
        // behind the kerb, facing across; where the footway ends at the kerb, the first steps out onto the stripes
        const back = end > 0 ? len - sk : sk;
        for (let i = 0; i < n; i++) spots.push({ line, s: back > 1.5 ? sk + end * (0.3 + srnd() * Math.min(back - 0.3, mine ? 3.5 : 2.5)) : sk - end * srnd() * (mine ? 3 : 2), dir: -end, side: -1.6 + srnd() * 3.6 });
      }
    }
    return crowd.muster(spots, player.x, player.y);
  }
  function spawn(pos, zRef, facing = null) { // at ground level (or on steps built on it) unless a height is given
    const at = pos || G.start.at;
    if (!pos && zRef == null && G.start.z != null) zRef = G.start.z; // a start on a floor over the ground (game.start.z: Queenstown's deck)
    padCheck = 0; // a fresh start: the helicopter is brought to the pad near it at the next look, not half a second on
    let z0 = Math.max(0, nav.terrain(at[0], at[1]));
    for (const st of nav.strips) { const h = st.drape ? nav.stripHeight(st, at[0], at[1]) : null; if (h != null && h > z0) z0 = h; }
    // the nearest firm spot: not over the water or on the bank going down to it, not inside an NPC,
    // and not cut off (on a pier fragment below the quay, in a yard closed in by walls); at the start,
    // with a few steps clear towards the view (not at the very edge of the quay, facing the water)
    const fa = facing || G.start.facing || [at[0], at[1] + 10];
    const ahead = (x, y) => {
      const h = Math.atan2(fa[0] - x, fa[1] - y), f = nav.floorAt(x, y, Math.max(zRef ?? z0 + 1, nav.terrain(x, y) + 1));
      let z = f ? f.z : 0;
      for (let d = 0.5; d <= 4 && f; d += 0.5) { const w = nav.walk(x + Math.sin(h) * d, y + Math.cos(h) * d, z, true); if (!w.ok) return false; z = w.z; }
      return !!f;
    };
    const ok = (x, y) => !npcs.some(n => Math.hypot(n.x - x, n.y - y) < 1.4), okStart = (x, y) => ok(x, y) && (pos || G.start.z != null || ahead(x, y)); // (a deck's start faces out over its balustrade)
    const p = nav.stand(at[0], at[1], zRef ?? z0 + 1, { ok: okStart, room: !pos && G.start.z != null ? 0 : 100 }) || nav.stand(at[0], at[1], zRef ?? z0 + 1, { ok });
    player.x = p ? p.x : at[0]; player.y = p ? p.y : at[1]; player.z = p ? p.z : z0;
    player.vz = 0; player.ground = true;
    player.h = Math.atan2(fa[0] - player.x, fa[1] - player.y);
    cam.yaw = player.h; cam.pitch = FOOT.pitch; cam.dist = FOOT.dist;
    if (typeof groundLod === 'function' && Wd.groundMeshes[0].material.userData.street) groundLod(player.x, player.y);
  }
  spawn();
  // a link to a district of the map ("#play-shibuya@t-sancha", from the subway map or shared): the title
  // screen is set there, over that place and under its name, and the game starts there, not at the map's start
  // or where a postcard was taken ("#play-kyoto@pc-gate.dusk": postcards.js):
  // the game starts on the photographer's spot, looking the way the photograph does, in its light
  const DISTRICT = window.OE_ARRIVE && ((G.travel || []).find(t => t.id === window.OE_ARRIVE)
    || (/^pc-/.test(window.OE_ARRIVE) && window.OEPostcards ? OEPostcards.arrival(await OEPostcards.load(), CITY.id, window.OE_ARRIVE) : null));
  if (DISTRICT) {
    spawn(DISTRICT.at, DISTRICT.at[2] != null ? DISTRICT.at[2] + 0.5 : undefined, lookOf(DISTRICT));
    const nm = /^(.*?)\s+([\u3000-\u9fff\uff00-\uffef][^A-Za-z]*)$/.exec(DISTRICT.name) || [0, DISTRICT.name]; // (the name in its own script after it, if it ends the name)
    gtTitle.textContent = nm[1];
    if (nm[2]) { const sm = document.createElement('small'); sm.lang = 'ja'; sm.textContent = nm[2]; gtTitle.append(sm); }
    // under the game's name without its map's ("Tokyo Pilgrimage"), and where the district is, if not where the map is
    // (game.travel "place": Sangenjaya is in Setagaya, on Shibuya's map)
    const series = G.title.replace(/\s+[\u3000-\u9fff].*$/, '').replace(/:.*$/, '');
    $('#gt-city').textContent = `${series} · ${DISTRICT.place || CITY.place || CITY.name}, ${CITY.country}`;
    if (DISTRICT.blurb) { $('#gt-blurb').textContent = DISTRICT.blurb; $('#g-title p').textContent = DISTRICT.blurb; }
    document.title = `${nm[1]} · Blue Hour`;
  }
  presetTime('live');
  if (story) story.dress(); // (the story's evening from the first frame drawn: the map is never seen at the hour on the player's wall)
  // the map's overture (overture.js, game.json "overture"): its score is rendered while the title card is up
  // (a story's first episode opens on its own overture, laid over the map's: its shots, score and grade, and no night
  // variant to be swapped for as the sun goes down)
  const epOv = story && G.story.episodes && G.story.episodes[0] && G.story.episodes[0].overture;
  // (a film: the overture, or a flight a story plays between two places; `guideAt` is given the film's guide each frame)
  // (a film played while the story's score is: the loading cue through the opening, the score itself in a flight. Its
  // own score then leaves the bed to that one: film-score.js plan.under)
  // (opts.own: a film whose score is the only music while it plays, its own bed and all, whatever plays now: the walk's, which
  // lets the loading cue go as it sets out; opts.walk, opts.fill: the walk's film, and what its type's {tokens} say)
  // (a phone's music plays on media elements, one at a time, audio.js tune: the loading cue is let go as the film's score
  // begins, so that score has its own bed; issue 166)
  makeFilm = (ov, guideAt = null, opts = {}) => OEOverture.create({ G: Object.assign({}, G, { overture: ov && ov.score && !opts.own && ((cue && !A.tunes) || storyMusic) ? Object.assign({}, ov, { score: Object.assign({}, ov.score, { under: true }) }) : ov }), guideAt, scene, CITY, W, world, camera, stage, cine, get live() { return live; }, handOver: (k, f) => handOver(k, f),
    walk: !!opts.walk, fill: opts.fill || null, levelReady: () => levelReady(), get levelWait() { return LEVEL_WAIT_S; }, // (both read when played: they are declared further on)
    junctions, crowd, faceShare, footNet, crowdNet, nav, clock, setClock: (y, m, d, min) => setClock(y, m, d, min, !clock.own), player, spawn, tier: QC.name, reduced, sun: () => sun, U, DSM, Wd, weather, show, get atmos() { return atmos; },
    walkIn: (j, inS) => { junctions.walkIn(j, inS); if (inS > 0) { cars.clearBox(j.x, j.y, 45); musterScramble(); } }, holdForLevel: done => holdForLevel(done) });
  overture = window.OEOverture && (G.overture || epOv) ? makeFilm(epOv ? Object.assign({}, G.overture, epOv, { night: null }) : G.overture) : null;
  if (overture && (story || OEOverture.due(CITY.id))) overture.prepareScore();
  if (overture) $('#gm-overture').hidden = false;
  fillTimes($('#gt-timechoice'));
  if (DISTRICT && DISTRICT.postcard) { // a postcard's light, offered first: the place as the photograph has it
    presetTime('postcard');
    $$('#gt-timechoice button').forEach(b => b.setAttribute('aria-pressed', 'false'));
    const b = document.createElement('button');
    b.dataset.t = 'postcard'; b.dataset.label = 'As on the postcard'; b.setAttribute('aria-pressed', 'true');
    b.innerHTML = `As on the postcard<span class="num">${fmtMin(clock.min)}</span>`;
    $('#gt-now').after(b);
  }
  const saved = loadSave();
  if (saved) $('#gt-continue').hidden = false;
  $('#gt-skip').hidden = !OEOnboard.done(); // a returning player (any map): the intro is skipped unless they untick it
  // the title orbit's centre, so the camera can be carried with the player when the game starts somewhere else
  // (Continue, a district from the subway map): the arrival then starts from the same view of the new place
  // A lost context the page cannot redraw reloads it (glcare.js: on a phone always, since the walls live on the GPU alone
  // there, world.js gpuOnly), a level lighter on a phone (quality.js lost). The player was on the title before (#118: four
  // losses in five minutes in frame 1, each back to the title, its film and the first frame's call). Now the page notes
  // where they were as it gives up (noteResume: in this tab's session storage, nothing else), and the next load takes
  // them up there (takeResume, at the title): the story at the frame it was at, from that frame's beginning (what a
  // frame's Stop holds, the afterimage's words and the photograph, is not kept part way), with no film and no call
  // again; the walk at its hour and sky; on foot, where they stood (in a car, the helicopter or
  // a film, where the frame or the walk begins).
  const RESUME = 'bh-resume';
  let resumeAt = null;
  function noteResume() {
    if (!playing) return;
    const S = story && story.state, inStory = !walk && !!(S && story.on && S.phase !== 'done'), kind = walk ? 'walk' : inStory ? 'story' : null; // (walk first: story.on is true on the walk, its evening dressed)
    if (!kind) return;
    const film = !!(S && (S.mov || /^(flight|ride)$/.test(S.beat))) || !!(overture && overture.active);
    const foot = player.mode === 'foot' && !player.vehicle && !film && Number.isFinite(player.x);
    const o = { city: cityId, t: Date.now(), kind, pos: foot ? [+player.x.toFixed(2), +player.y.toFixed(2), +player.z.toFixed(2)] : null, h: +(player.h || 0).toFixed(3) };
    if (inStory) o.story = { fi: S.fi | 0, begun: !(S.phase === 'idle' || S.phase === 'dressed' || ((S.fi | 0) === 0 && S.phase === 'go' && (S.beat === 'prologue' || S.beat === 'order'))) };
    else o.walk = walk.t === 'here' ? { t: sun && sun.altitude < -10 ? 'night' : 'blue', w: walk.w } : { t: walk.t, w: walk.w };
    try { sessionStorage.setItem(RESUME, JSON.stringify(o)); } catch (e) { /* storage blocked: the title, as before */ }
  }
  function takeResume() {
    let o = null;
    try { o = JSON.parse(sessionStorage.getItem(RESUME) || 'null'); sessionStorage.removeItem(RESUME); } catch (e) { o = null; }
    return o && o.city === cityId && Date.now() - o.t < 6 * 3600e3 && (o.kind === 'story' ? !!story : o.kind === 'walk' && !!walkUi) ? o : null;
  }
  // where a resumed player stands: as they stood, if that is still somewhere to stand
  const resumeSpot = R => {
    if (!R || !Array.isArray(R.pos) || !R.pos.every(Number.isFinite) || !nav.floorAt(R.pos[0], R.pos[1], R.pos[2] + 1)) return false;
    spawn(R.pos, R.pos[2] + 0.5, [R.pos[0] + Math.sin(R.h || 0) * 10, R.pos[1] + Math.cos(R.h || 0) * 10]);
    return true;
  };
  const startGame = cont => {
    if (parked && parkedWay('story')) return; // (the title over a parked case or walk: parkTitle below)
    A.start();
    playing = true;
    const was = [player.x, player.y, player.z];
    const R = !cont && resumeAt && resumeAt.kind === 'story' ? resumeAt : null;
    resumeAt = null;
    if (R) resumeSpot(R);
    if (cont && saved) {
      goals.load(saved.qs);
      // back on the deck or roof where you left off; at the start if that is no longer in the map (a map split in two)
      const F = scene.frame, inMap = p => Array.isArray(p) && p[0] > F.x[0] + 20 && p[0] < F.x[1] - 20 && p[1] > F.y[0] + 20 && p[1] < F.y[1] - 20;
      if (inMap(saved.pos)) spawn(saved.pos, saved.pos[2] != null ? saved.pos[2] + 0.5 : undefined);
      else spawn();
      if (saved.car && myCar && nav.floorAt(saved.car[0], saved.car[1], saved.car[2] + 1)) parkMyCar({ x: saved.car[0], y: saved.car[1], z: saved.car[2], h: saved.car[3] });
      // the hour too, if the player had picked one; otherwise the place's time now, as at a new start
      if (saved.clock && saved.clock.own) {
        clock.scale = saved.clock.scale || 1; setClock(saved.clock.y, saved.clock.m, saved.clock.d, saved.clock.min);
        $$('#gm-speed button').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.s === clock.scale)));
      }
    }
    // arriving at a district of the map from the subway map (index.html router, "@<travel id>")
    const arrive = !cont && DISTRICT;
    if (arrive) { spawn(arrive.at, arrive.at[2] != null ? arrive.at[2] + 0.5 : undefined, lookOf(arrive)); trackNear(arrive.at); }
    const tc = $('#gt-timechoice [aria-pressed="true"]');
    if (!cont && tc) presetTime(tc.dataset.t);
    $('#g-title').hidden = true;
    const dv = W(player.x, player.y, player.z).sub(W(...was));
    if (dv.lengthSq() > 1) { camera.position.add(dv); titleLook.add(dv); }
    const skip = OEOnboard.done() && $('#gt-skip-on').checked;
    const then = () => (story && !cont ? (story.tidy(), storyLog && storyLog.restore(story.state.ep && story.state.ep.id), story.begin(R && R.story)) : cont ? OEOnboard.markDone(CITY.id) : skip ? welcome(true) : startTour(() => welcome(false)));
    if (story && !cont) story.dress(); // (the evening its first episode is set in, before the opening shot)
    // the map's overture (overture.js) the first time here, unless you continue or arrive at a district; else the opening shot
    // (a story opens on the overture every time, in the evening its first episode is set in; ?overture=0 goes straight to the street)
    const open = () => {
      const filmIt = overture && !cont && !arrive && !R && !reduced && (story ? !/[?&]overture=0\b/.test(location.search) : OEOverture.due(CITY.id));
      // (on iOS the first touch may be Play itself: the loading cue is begun in that touch, after the opening's score was
      // rendered with its own bed because there was no cue yet (film-score.js plan.under); and a phone's score always has
      // its own, its music being one element at a time (audio.js tune). One piece of music: the opening's own, and the cue
      // let go before it sounds, faded out as the score's first second swells in from silence)
      if (filmIt && cue && overture.scorePlan && !overture.scorePlan().under) cueOut();
      if (filmIt && overture.play(then)) { renderPassport(); return; }
      if (!R && openingHere()) { // (#110: the opening shot, the scramble's walk turning green as it comes down)
        const j = junctions.J.find(q => q.scramble && Math.hypot(q.x - player.x, q.y - player.y) < 80);
        if (j) { junctions.walkIn(j, OPENING.walkIn); cars.clearBox(j.x, j.y, 45); musterScramble(); }
      }
      craneIn(then);
      renderPassport();
    };
    open();
  };
  // The menus' Title screen in place (issue 215; ?inplace=0 opens the page again, as before): the case or the walk is parked under the
  // title, not torn down. The game holds both still while the title is up (paused, story.tick and the walk's talk), so
  // leaving is the title shown over the live street with the mode's own interface put away (story.css "parked"), and
  // the same mode's way in takes it up where it was, in the middle of a frame or a drive; the street's hour and sky put
  // back as they were, for the walk's step on the title dresses the street as it is chosen. The other mode's way in
  // opens the page again straight into that mode (bh-story-auto, bh-walk-auto): one load, never a title in between.
  // Nothing is made or let go, so going back and forth costs nothing (tools/title_inplace.js counts it).
  const INPLACE = !/[?&]inplace=0\b/.test(location.search); // (?inplace=0: the page load, as before; the fallback below either way)
  let parked = null; // { mode: 'story' | 'walk', cam, clock, sky, walkLine }
  // (the page load is the fallback: whenever the street cannot be kept as it is, a lost context, or anything that throws
  // on the way out, parkTitle says no and the menu opens the page again, menus.js)
  function parkTitle() {
    if (!INPLACE || !playing || parked || (overture && overture.active) || cine.active) return false;
    try { if (renderer.getContext().isContextLost()) return false; } catch (e) { return false; }
    try { return parkIn(); } catch (e) {
      try { console.warn('the title in place failed, opening the page again', e); stage.classList.remove('parked', 'parked-story', 'parked-walk'); $('#g-title').hidden = true; parked = null; } catch (e2) { /* the page load clears it */ }
      return false;
    }
  }
  function parkIn() {
    const mode = walk ? 'walk' : story && story.on ? 'story' : null;
    if (!mode) return false;
    parked = { mode, cam: { mode: cam.mode, yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, tilt: cam.tilt }, clock: { y: clock.y, m: clock.m, d: clock.d, min: clock.min, scale: clock.scale }, sky: weather ? weather.state.kind : null };
    $('#g-menu').hidden = true;
    stage.classList.add('parked', `parked-${mode}`); stage.classList.remove('story-auto'); // (a page that set out by itself, from the last card or a link, kept the title out of sight: story.css)
    titleYaw = null; titleT = 0;
    const cont = $('#gt-cont-go'), wg = $('#gt-walk-go'), at = story && story.at;
    if (mode === 'story' && cont && at) { // (Continue first, at the frame the case is at: kept or not, it is here)
      parked.cont = { hidden: cont.hidden, primary: cont.classList.contains('primary'), small: cont.querySelector('small').textContent };
      cont.hidden = false; cont.classList.add('primary');
      cont.querySelector('small').textContent = `frame ${at.fi + 1} of ${at.of}${at.stamp ? ` · ${at.stamp}` : ''} · where you left it`;
      const sg = $('#gt-story-go'); if (sg) { parked.sgPrimary = sg.classList.contains('primary'); sg.classList.remove('primary'); }
    }
    if (mode === 'walk' && wg) { // (the walk leads the list, Enter's and a pad's A, over a case kept from before)
      parked.walkLine = wg.querySelector('small').textContent; wg.querySelector('small').textContent = `${fmtMin(clock.min)} · go on where you were`;
      parked.wgPrimary = wg.classList.contains('primary'); wg.classList.add('primary');
      if (cont) { parked.contPrimary = cont.classList.contains('primary'); cont.classList.remove('primary'); }
      const sg = $('#gt-story-go'); if (sg) { parked.sgPrimary = sg.classList.contains('primary'); sg.classList.remove('primary'); }
    }
    $('#g-title').hidden = false;
    titleScreen('menu');
    try { performance.mark('oe:title', { detail: { from: mode, inplace: true } }); } catch (e) { /* no User Timing */ }
    return true;
  }
  // the mode's own way back in: the title away, the street's hour and sky as they were, the camera as it was, a cut
  function unpark() {
    const P = parked;
    if (!P) return;
    parked = null;
    setClock(P.clock.y, P.clock.m, P.clock.d, P.clock.min); clock.scale = P.clock.scale;
    if (weather && P.sky && weather.state.kind !== P.sky) weather.set(P.sky, { now: true });
    Object.assign(cam, P.cam); camSmooth.set(0, 0, 0);
    const cont = $('#gt-cont-go'), wg = $('#gt-walk-go'), sg = $('#gt-story-go');
    if (P.cont && cont) { cont.hidden = P.cont.hidden; cont.classList.toggle('primary', P.cont.primary); cont.querySelector('small').textContent = P.cont.small; }
    if (P.sgPrimary && sg) sg.classList.add('primary');
    if (P.walkLine != null && wg) { wg.querySelector('small').textContent = P.walkLine; wg.classList.toggle('primary', !!P.wgPrimary); if (cont && P.contPrimary) cont.classList.add('primary'); }
    $('#g-title').hidden = true;
    stage.classList.remove('parked', 'parked-story', 'parked-walk');
    stage.classList.remove('arrive-fade'); void stage.offsetWidth; stage.classList.add('arrive-fade'); // (from the title's view to your shoulder in a cut under a short fade, as reduced motion arrives)
  }
  // a way in pressed while a mode is parked: its own mode taken up, the other opened on a page of its own
  function parkedWay(want, sp) {
    if (!parked) return false;
    if (parked.mode === want) { unpark(); return true; }
    try {
      if (want === 'walk') sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t: (sp && sp.t) || 'night', w: (sp && sp.w) || 'clear' }));
      else sessionStorage.setItem('bh-story-auto', cityId);
    } catch (e) { /* storage blocked: the title, as on a fresh page */ }
    const u = new URL(location.href); u.searchParams.delete('walk'); u.hash = '';
    if (u.toString() === location.href.replace(/#$/, '')) location.reload(); else location.href = u.toString();
    return true;
  }
  // (the walk's way in on the title takes a parked walk up at once, without its step of the hour and the sky)
  if (INPLACE) on($('#g-title'), 'click', e => { const b = e.target.closest('#gt-walk-go'); if (b && parked && parked.mode === 'walk') { e.stopImmediatePropagation(); e.preventDefault(); unpark(); } }, { capture: true });
  // Onboarding, once in this browser across every map (onboard.js, #89): the first time, a short tour of the
  // HUD and then the guide's directions; on a later map, with "Skip the intro" (on for a returning player),
  // straight to the guide's own short welcome. "Show the intro again" in the menu runs the tour now.
  function welcome(short) {
    const q = quest(), n = npcById(q ? q.giver : npcs[0].id);
    if (!n) return;
    // (not the quest's first line: several begin "You're the new surveyor?", which a returning player is not)
    const way = routeMode === 'on' ? 'follow the gold route' : 'the route is on the minimap'; // (the menu's Route line, #90)
    H.toast(short ? `<b>${n.name}</b>: ${G.greeting || 'Hello!'} Welcome to ${CITY.name}. <span>${routeMode === 'on' ? 'Follow the gold line' : 'The minimap shows the way'} and come and find me.</span>`
      : `Find ${n.name}: ${way}, or ${touch ? 'tap <b>Map</b>' : 'press <kbd>M</kbd>'} for the map.`);
  }
  const tourSteps = () => [
    { id: 'move', title: 'Walk and look', target: touch ? '#gt-joy' : null,
      text: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk the way the camera faces. Hold <kbd>Shift</kbd> to sprint, <kbd>X</kbd> switches walking and running, <kbd>Space</kbd> jumps. Drag to look around, scroll to zoom.',
      touch: 'The stick walks the way the camera faces; <b>Run</b> switches to running and <b>Jump</b> jumps. Drag anywhere else to look around.' },
    { id: 'map', title: 'The map', target: '#g-map-btn',
      text: '<kbd>M</kbd> opens the map of the whole area: your objective, the people to meet, the ferries, the helipads and the trig stations (△).',
      touch: '<b>Map</b> opens the map of the whole area: your objective, the people to meet, the ferries, the helipads and the trig stations (△).' },
    { id: 'travel', title: 'Travel anywhere', target: '#g-minimap',
      text: 'On the map, pick a place, or a district from the list beside it, and <b>Travel here</b> takes you there in a few seconds. <b>Set waypoint</b> puts the gold line on it instead.',
      touch: 'On the map, tap a place, or a district from the list, and <b>Travel here</b> takes you there in a few seconds. <b>Set waypoint</b> puts the gold line on it instead.' },
    { id: 'taxi', title: 'Taxis and rides', target: null,
      text: 'At the kerb, <kbd>Y</kbd> raises your hand and a passing taxi pulls in. <kbd>E</kbd> gets in, pick where to go, <kbd>F</kbd> skips the trip and <kbd>E</kbd> gets out when it stops.',
      touch: 'At the kerb, <b>Hail a taxi</b> raises your hand and a passing taxi pulls in. <b>E</b> gets in, pick where to go, and <b>E</b> gets out when it stops.' },
    { id: 'passport', title: 'Your passport', target: '#g-pass-btn',
      text: 'Every place you survey and every quest you finish stamps your passport (<kbd>P</kbd>). The count is beside the button.',
      touch: 'Every place you survey and every quest you finish stamps your <b>Passport</b>. The count is beside the button.' },
    { id: 'phone', title: 'Your phone', target: '#g-phone-btn',
      text: '<kbd>N</kbd> takes out your phone: order a ride to anywhere on the map and watch it come to you, or have your car brought round.',
      touch: '<b>Phone</b>: order a ride to anywhere on the map and watch it come to you, or have your car brought round.' },
    { id: 'diary', title: 'Your diary', target: '#g-diary-btn',
      text: '<kbd>J</kbd> opens your diary: today\'s date and weather here, what is on, who is free to talk and what work is going. A day has four parts; people and shops keep their hours, and you can pass the time whenever you like.',
      touch: '<b>Diary</b>: today\'s date and weather here, what is on, who is free to talk and what work is going. People and shops keep their hours, and you can pass the time whenever you like.' },
    { id: 'photo', title: 'Photo mode', target: '#g-photo-btn',
      text: '<kbd>O</kbd> holds the world still: set the sun, the lens and the angle, and save a picture.',
      touch: '<b>Photo</b> holds the world still: set the sun, the lens and the angle, and save a picture.' },
    { id: 'more', title: 'The rest, folded away', target: '#g-more-btn',
      text: 'The passport, diary, photo mode and phone fold away behind this button once the tour is over, so the street stays clear. Their keys work either way.',
      touch: 'The passport, diary, photo mode and phone fold away behind this button once the tour is over, so the street stays clear.' },
    { id: 'menu', title: 'The menu', target: '#g-menu-btn',
      text: '<kbd>Esc</kbd> pauses: the time of day and the date, the clock\'s speed, who you play, sound, every key, and <b>Show the intro again</b>.',
      touch: '<b>Menu</b> pauses: the time of day and the date, the clock\'s speed, who you play, sound, and <b>Show the intro again</b>.' },
    // (the menu's route setting: a three-way Route line, On, Only when I ask and Off, or a single checkbox)
    $('#gm-route [data-r]') ? { id: 'route', title: 'The route line', target: '#g-quest',
      text: 'This card is your objective. The gold line on the ground and on the minimap leads there. In the menu, <b>Route line</b> sets it On, Only when I ask (<kbd>L</kbd> shows it for a few seconds) or Off.',
      touch: 'This card is your objective. The gold line on the ground and on the minimap leads there. In the <b>Menu</b>, <b>Route line</b> sets it On, Only when I ask (<b>Show route</b> on this card) or Off.' }
      : { id: 'route', title: 'The route line', target: '#g-quest',
        text: 'This card is your objective. The gold line on the ground and on the minimap leads there; turn it off in the menu (<b>Show the route to the objective</b>).',
        touch: 'This card is your objective. The gold line on the ground and on the minimap leads there; turn it off in the <b>Menu</b> (<b>Show the route to the objective</b>).' },
  ];
  function startTour(then = null) {
    const was = $('#g-btns').classList.contains('open');
    moreTray(true, false); // (the tour points at the buttons behind "more")
    return OEOnboard.tour(tourSteps(), { root: document.body, onEnd: () => { moreTray(was, false); OEOnboard.markDone(CITY.id); if (then) then(); } });
  }
  on($('#gt-play'), 'click', e => { if (ownPress(e) && whoNeeded()) { whoAsk(); return; } startGame(false); }); // (a player's own press, the mouse's, a tap, the keys' or a pad's, the first time: who they play is asked first)
  // ---- the walk (walk.js, docs/STORY.md "The walk"): the title's first way in. The same Kagami on the same streets,
  // at the hour and under the sky the player picks, with nothing of the story in it and nothing owed. Set out from this
  // page as it stands: the street on the title is the street walked, nothing loaded again
  const EP0 = G.story && G.story.episodes ? G.story.episodes[0] || {} : {};
  const walkDate = () => EP0.date || [clock.m, clock.d]; // (the evening the story is set in: its screens, its season)
  const walkHour = t => (t === 'live' ? S.utcToLocal(Date.now()).minutes : S.presetTime(t, clock.y, walkDate()[0], walkDate()[1]) ?? 18 * 60);
  const AREA0 = (G.areas || []).find(a => Math.hypot(a.at[0] - G.start.at[0], a.at[1] - G.start.at[1]) < a.radius);
  const walkPlace = { name: AREA0 ? AREA0.romaji : CITY.name, native: AREA0 ? AREA0.name : CITY.native || '' };
  let walkWas = null; // (the title's own sky, put back when the walk's step is left: the story's evening sets no weather of its own)
  const walkDress = sp => {
    if (sp.t === 'live') presetTime('live');
    else { const [m, d] = walkDate(); setClock(clock.y, m, d, walkHour(sp.t)); }
    if (weather) weather.set(sp.w, { now: true }); // (as it has been for a while: a rainy street already wet)
  };
  const startWalk = sp => {
    if (parked && parkedWay('walk', sp)) return; // (parkTitle below)
    if (playing) return;
    A.start();
    playing = true; walk = Object.assign({}, sp);
    const R = resumeAt && resumeAt.kind === 'walk' ? resumeAt : null; // (taken up after a lost context: noteResume)
    resumeAt = null;
    if (R) { const was = W(player.x, player.y, player.z); if (resumeSpot(R)) { const dv = W(player.x, player.y, player.z).sub(was); camera.position.add(dv); titleLook.add(dv); } }
    stage.classList.add('walk');
    if (SND_GUARD && cue && !(walkFilmDue() && !walkNoFilm)) sndCueOut = true; else cueOut(); // (the walk's sound is the city's own: the crossing's calls, the crowd, the trains, the rain. On a phone with no film to play, the cue plays on until the street does: sndHold. The walk's film has a score of its own)
    walkDress(sp);
    $('#g-title').hidden = true;
    try { performance.mark('oe:walk', { detail: { view: 'game', city: cityId, hour: sp.t, sky: sp.w } }); } catch (e) { /* no User Timing */ }
    if (story.dressSet) story.dressSet(); // (an episode's own set dressing, as the story has it, on the walk too)
    walkPeople(); if (walkTalk) walkTalk.begin(); // (the walk's own people out on the street, and their speech marks)
    // the walk's opening (game.walk.overture, docs/STORY.md "The walk's opening"): the city from the air at the hour and under
    // the sky chosen, flown down in one flight to your shoulder at the kerb; any key or a tap eases down to you at once.
    // Not with reduced motion or ?overture=0, where the crane comes down from the title's view as before
    if (walkFilmDue() && !walkNoFilm) {
      const film = walkFilmMake(), was = overture;
      overture = film;
      if (film.play(() => { overture = was; walkUi.begin(); if (walkIntroDue()) setTimeout(walkIntro, 900); })) return; // (and the first time, the office rings as you reach your shoulder: walkIntro)
      overture = was;
    }
    if (!R && openingHere()) { // (down from the title's view to your shoulder, the scramble turning to walk as you come down, as the story's opening does without its film)
      const j = junctions.J.find(q => q.scramble && Math.hypot(q.x - player.x, q.y - player.y) < 80);
      if (j) { junctions.walkIn(j, OPENING.walkIn); cars.clearBox(j.x, j.y, 45); musterScramble(); }
    }
    craneIn(() => { walkUi.begin(); if (walkIntroDue()) setTimeout(walkIntro, 900); }); // (and the first time, the office rings: walkIntro)
  };
  // the walk's film, made the first time the walk's step opens (its score rendered and its things compiled while the hour
  // and the sky are chosen, so that Set out plays it at once), and played as the walk sets out (startWalk)
  const WALK_OV = story && G.walk && G.walk.overture;
  let walkFilm = null, walkNoFilm = false; // (no film for a walk taken up from the story's last card on a fresh page: it goes on at the kerb, as in place)
  const walkFilmDue = () => !!(WALK_OV && window.OEOverture && makeFilm && !reduced && !/[?&]overture=0\b/.test(location.search));
  const SKY_WORD = { clear: 'Clear', overcast: 'Overcast', fog: 'Fog', drizzle: 'Drizzle', rain: 'Rain', storm: 'Storm', snow: 'Snow' };
  const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function walkFilmMake() {
    if (!walkFilm) walkFilm = makeFilm(WALK_OV, null, { own: true, walk: true,
      fill: k => (k === 'hour' ? fmtMin(clock.min) : k === 'date' ? `${clock.d} ${MONTH[clock.m - 1]}` : k === 'sky' ? SKY_WORD[(walk && walk.w) || (weather ? weather.state.kind : 'clear')] || 'Clear' : null) }); // (the sky chosen: the weather's own word comes a frame or two after it is set)
    return walkFilm;
  }
  const walkFilmReady = () => { if (!walkFilmDue() || playing) return; const f = walkFilmMake(); if (!f) return; f.prepareScore(); if (f.prewarm) f.prewarm(o => compileFor(o)); };
  // The walk's way in, the first time in this browser from the title (game.json walk.intro; docs/STORY.md "The walk's way
  // in"): as you come down to your shoulder, the office rings, as it rings in the story, in its own voice: no job tonight,
  // take the evening, your car comes when you call it (its button lit while that is said), people here will talk if you
  // let them. Four lines, each passed with E or a tap; then the street is yours, and the corner already says who has the
  // first story. Not from the story's last card, nor from a page opened straight onto the walk, nor a second time.
  const WALK_INTRO = 'bh-walk-intro';
  let walkAuto = false;
  const walkIntroDue = () => { if (walkAuto || !G.walk || !G.walk.intro || !walkUi) return false; try { return !localStorage.getItem(WALK_INTRO); } catch (e) { return false; } };
  function walkIntro() {
    const I = G.walk.intro, who = Object.assign({ alive: true, voice: Object.assign({ pitch: 150 }, I.voice || {}) }, I.who || {}), hl = I.highlight || {};
    if (dlg.open || player.mode !== 'foot') return;
    try { localStorage.setItem(WALK_INTRO, '1'); } catch (e) { /* storage blocked */ }
    A.start();
    let i = 0;
    const next = () => {
      if (walkUi.highlight) walkUi.highlight(null);
      if (i >= I.lines.length) { introEnd(); return; }
      if (hl[i] && walkUi.highlight) walkUi.highlight(hl[i]);
      dlg.show(who, [fill(I.lines[i++])], null, next);
    };
    next();
  }
  // the call over, the street takes it up (no line that tells you people will talk: one of them does): the view eased round
  // to whoever has the first story, if they are near, and they call you over. Any turn of the mouse or the stick takes the
  // view back at once (cam.yawTo)
  function introEnd() {
    const s = walkTalk ? walkTalk.people.find(q => !(walkTalk.state()[q.id] || {}).done) : null, n = s ? npcById(s.npc) : null;
    if (!n || player.mode !== 'foot' || Math.hypot(n.x - player.x, n.y - player.y) > 70) return;
    cam.yawTo = Math.atan2(n.x - player.x, n.y - player.y);
    setTimeout(() => { if (walkTalk && s.bark) walkTalk.bark(n.id, s.bark); }, 700);
  }
  // The walk taken up where the story ends (its last card's Walk Shibuya): the case is closed and you are standing at a
  // kerb, so that is where the walk begins. No page again, no title, no crane down from the air: the card fades off the
  // street, the score lets go into the street's own sound over a few bars, the evening's people go once the lens has
  // left them (story.js release), the dog is already on his way home, and the same night goes on round you, at its hour
  // and under its sky. The menu has both to change from there.
  function walkOnFromStory() {
    if (!walkUi || walk || !story || !story.release || !story.release()) return false;
    walk = { t: 'here', w: weather ? weather.state.kind : 'clear' };
    stage.classList.add('walk'); stage.classList.remove('story-on');
    if (storyMusic && A.ctx) { // (the score down over some eight seconds on the music's bus, then let go, and the bus up again for whatever comes)
      const m = storyMusic, bus = A.musicBus(), c = A.ctx;
      storyMusic = null;
      try { bus.gain.cancelScheduledValues(c.currentTime); bus.gain.setTargetAtTime(0, c.currentTime, 2); } catch (e) { /* the context closed */ }
      setTimeout(() => { m.stop(); try { bus.gain.cancelScheduledValues(c.currentTime); bus.gain.setTargetAtTime(1, c.currentTime + 0.8, 0.05); } catch (e) { /* the context closed */ } }, 8500);
    }
    try { performance.mark('oe:walk', { detail: { view: 'game', city: cityId, hour: 'here', sky: walk.w, from: 'story' } }); } catch (e) { /* no User Timing */ }
    { const gs = $('#gm-story'); if (gs && gs.firstChild) gs.firstChild.textContent = 'Play it again · '; } // (the case is closed: the menu's way back into it is the story again)
    walkPeople(); if (walkTalk) walkTalk.begin();
    walkUi.takeUp();
    return true;
  }
  if (story && window.OEWalk) {
    walkUi = OEWalk.create({ stage, touch, place: walkPlace, date: walkDate(), hourAt: walkHour, fmt: fmtMin, whoGate: () => whoGate(),
      preview: sp => { if (!walkWas) walkWas = { w: weather ? weather.state.mode : null }; walkDress(sp); walkFilmReady(); },
      restore: () => { story.dress(); if (weather && walkWas && walkWas.w) weather.set(walkWas.w, { now: true }); walkWas = null; },
      start: startWalk,
      clock: () => ({ m: clock.m, d: clock.d, min: clock.min }),
      sky: () => (weather ? weather.state.kind : 'clear'),
      where: () => { const a = (G.areas || []).filter(q => Math.hypot(q.at[0] - player.x, q.at[1] - player.y) < q.radius).sort((p, q) => Math.hypot(p.at[0] - player.x, p.at[1] - player.y) - Math.hypot(q.at[0] - player.x, q.at[1] - player.y))[0]; return a ? { name: a.romaji, native: a.name } : walkPlace; },
      key: k => (gamepad ? gamepad.label(k) : k),
      menu: () => toggleMenu(), photo: () => photoMode(true),
      // (from the walk's menu: one of its hours, one of its skies, or any minute of the same evening)
      dress: sp => { if (sp.t === 'live') presetTime('live'); else if (sp.t) { const [m, d] = walkDate(); setClock(clock.y, m, d, walkHour(sp.t)); } else if (sp.min != null) setClock(clock.y, clock.m, clock.d, sp.min); if (sp.w && weather) weather.set(sp.w, { now: true }); if (walk) Object.assign(walk, sp.t ? { t: sp.t } : sp.w ? { w: sp.w } : { t: 'any' }); menuSync(); },
      car: () => bringCar(), // (your car to the kerb nearest you: C, or the corner's button)
      errand: () => (walkTalk ? walkTalk.errand() : null), // (what someone on the walk asked of you, and the metres to it)
      yaw: () => (player.mode !== 'heli' ? cam.yaw : cam.mode === 'bird' ? heli.st.h : cam.mode === 'cockpit' ? heli.st.h - cam.lookYaw : cam.yaw), // (the way the view looks, for the corner's arrow: as the minimap turns)
      ride: () => (player.mode === 'car' && myCar ? { mode: 'car', kmh: myCar.D.st.speed * 3.6 }
        : player.mode === 'heli' ? { mode: 'heli', kmh: heli.st.speed * 3.6, up: Math.max(0, heli.st.z - nav.groundBelow(heli.st.x, heli.st.y, heli.st.z)), rotor: heli.st.rotor }
          : { mode: waitRun && player.mode === 'seat' ? 'wait' : player.mode }) }); // (sat waiting with someone: the night passes by itself, walk.js says so)
    whoSync(); // (the walk's way in waits for who you play, as the episode's does)
    // tonight (tonight.js): the night's moments by the walk's clock, told in its corner, over the street and in its menu;
    // the last trains are the railway's own (trains.js setNight)
    if (window.OETonight && G.tonight) {
      tonight = OETonight.create({ stage, data: G.tonight, show, fmt: fmtMin, clock: () => clock.min, on: () => !!walk && walkUi.walking });
      if (trains && trains.setNight && G.tonight.trains) { const n = {}; for (const [k, v] of Object.entries(G.tonight.trains)) n[k] = v.map(S.hm); trains.setNight(n); }
    }
    // the menu's Bring your car: to the kerb nearest you, as a free ride's own car is called (and the menu put away to see it)
    { const gc = $('#gm-car'); if (gc) on(gc, 'click', () => { toggleMenu(); bringCar(); }); }
    // the menu's way into the story from the walk: the page again, straight into its first episode (as Play it again)
    const gs = $('#gm-story');
    if (gs) { gs.querySelector('span').textContent = `${EP0.no ? `Episode ${EP0.no} · ` : ''}${EP0.title || 'The story'}`; on(gs, 'click', () => { try { sessionStorage.setItem('bh-story-auto', cityId); } catch (e) { /* storage blocked */ } const u = new URL(location.href); u.searchParams.delete('walk'); location.href = u.toString(); }); }
  }
  on($('#gt-continue'), 'click', () => startGame(true));
  on($('#gt-timechoice'), 'click', e => { const b = e.target.closest('button'); if (b) $$('#gt-timechoice button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  const nowLoc = S.utcToLocal(Date.now());
  $('#gt-now').textContent = `Now in ${DISTRICT ? gtTitle.firstChild.textContent : CITY.name} (${fmtMin(nowLoc.minutes)})`;
  // the loader (its plate, plate.js) fades onto the title orbit; the title card is held back until
  // then, so it never shows over the loader, while the scene under it waits as on the title screen
  // (preTitle). fromFlyover() is for a recorded flyover that ends on the orbit's first pose
  // (tools/flyover.js); the plate has none, and resolves false
  // the loader stays up until the scene has been drawn twice: the shaders compile on the first
  // draw, which can take seconds, and a loader that faded before it showed a black frame
  let framesDrawn = 0, firstDrawn, cleanBy = 0;
  const drawn = new Promise(r => { firstDrawn = r; });
  // (and the passes the title doesn't draw: the opening shot's depth of field and motion blur, atmosphere.js)
  try { performance.mark('oe:built', { detail: { view: 'game', city: cityId } }); } catch (e) { /* no User Timing */ } // the scene built (telemetry.js)
  setUp = true;
  loadMsg('Compiling the shaders for this view', 1);
  // (the loader's first set, issue 27: what is shown and the passes that are on; the rest behind the title, warmRest)
  // (each part's time from "built", in the log as "warm: ...": what the loader waits for, tools/entry_cost.js)
  const wt0 = performance.now(), wlog = [], wpart = (k, p) => Promise.resolve(p).then(r => { wlog.push(`${k} ${((performance.now() - wt0) / 1000).toFixed(1)} s`); try { performance.mark(`oe:warm-${k.replace(' ', '-')}`, { detail: { view: 'game', city: cityId } }); } catch (e) { /* no User Timing */ } return r; }); // (and marked for the telemetry's load: warm_prog_ms, warm_tex_ms, warm_buf_ms)
  const warm = Promise.all([wpart('programs', earlyWarm.then(() => compileFor(world, world, { only: OEWorld.shown }))), wpart('passes', atmos && atmos.warm ? atmos.warm({ first: true }) : null), wpart('textures', OEWorld.uploadSliced ? (window.OETex ? OETex.settled() : Promise.resolve()).then(() => OEWorld.uploadSliced(renderer, world)) : null), wpart('far trees', Wd.ready)]) // (and its textures sent, in slices too, and the far trees' atlas drawn)
    .then(() => wpart('buffers', OEWorld.uploadBuffers && OEWorld.uploadBuffers(renderer, world, camera, { target: atmos && atmos.composer ? atmos.composer.renderTarget1 : null }))) // (then its vertex buffers, in slices)
    .finally(() => console.info(`warm: from built, ${wlog.join(', ')}`));
  // and behind the loader the rain's passes are drawn once too (its streaks, the occlusion map from
  // above and the wet street's mirror), so that the first rain of a visit comes on without a stall; the
  // mirror's variant of every shader compiles in slices behind the title, not holding the loader up
  const warmRain = () => {
    try {
      if (!weather || weather.armed === false) return;
      const t0 = performance.now();
      if (weather.warm) weather.warm(o => compileFor(o));
      return Promise.resolve(mirror && mirror.warm && !mirror.off ? mirror.warm(world, { hold: () => playing && (!!arriving || cine.active || player.mode === 'lift') }) : null) // (compiled in slices, then drawn)
        .then(() => console.info(`rain warm-up: ${Math.round(performance.now() - t0)} ms`), e => console.warn('rain warm-up', e));
    } catch (e) { console.warn('rain warm-up', e); }
  };
  // what the loader left out (issue 27: a third of its programs, on an iPhone a third of its 22 s): the passes that are off
  // (the opening's depth of field and motion blur: first, for the tap), then what is hidden in the world (the rain, the
  // stopped air's spares, a car's parts), compiled behind the title, a slice a frame, held through the opening's shots
  // The level the story starts in comes first (issue 69). Behind the title it was queued with the city's rest, the opening's
  // own things and the stopped air, and on a software renderer, which compiles and uploads one thing at a time, its warm-up
  // (its pictures sent, then its programs) waited behind theirs: 107 s, and the way in's veil ran out on the city's own
  // Scramble. While the level round the player's start is still coming in (at most LEVEL_FIRST_S from the title), the rest
  // waits for it: the city's rest compiles no slice, and the stopped air's warm-up starts once it is ready (the opening's own
  // things do not wait: a tap on Play soon after the title would compile them in its first frame, 4.4 s on an iPhone)
  const LEVEL_FIRST_S = 30;
  const levelComing = () => !!hero && hero.levels.some(L => (L.state === 'loading' || L.state === 'idle') && Math.hypot(player.x - L.h.at[0], player.y - L.h.at[1]) <= (L.h.r || 100));
  let levelFirstT = null;
  const levelFirst = () => { if (levelFirstT == null) levelFirstT = performance.now(); return levelComing() && performance.now() - levelFirstT < LEVEL_FIRST_S * 1000; };
  const afterLevel = () => new Promise(r => { const t = () => (levelFirst() ? setTimeout(t, 250) : r()); t(); });
  const warmRest = () => Promise.resolve(atmos && atmos.warm ? atmos.warm() : null)
    .then(() => OEWorld.compile(renderer, world, camera, { scene: world, target: atmos && atmos.composer ? atmos.composer.renderTarget1 : null, behind: true, hold: () => levelFirst() || (playing && (!!arriving || cine.active || player.mode === 'lift')) }))
    .catch(e => console.warn('warm the rest', e));
  // (the characters that came while the loader compiled, and those to come, warmed from as soon as it is done: an NPC's
  // waits for this, people.js ready, and is shown once its programs are made; issue 31)
  // (after the first frame, issue 27: given with the loader's last programs, the umbrellas and the palette's eight programs were
  // queued ahead of the first frame's own, and on a device that compiles one at a time the first frame waited for them)
  { const give = () => { if (lib && !lib.warm) { lib.setWarm(warmFor); if (lib.warmPalette) lib.warmPalette(); } }; warm.then(() => firstFramed).then(give, give); }
  if (lib && weather) lib.dressNew = o => weather.dress(o); // (a crowd walker's change of clothes, people.js rig.dress: the weather's patch on it before its first draw)
  if (Wd.trees && weather) Wd.trees.dressNew = o => weather.dress(o); // (and the near trees, trees.js addNear)
  Promise.all([OEPlate.finish($('#g-loader')), warm.then(() => drawn).then(() => { warmRest().then(warmRain); })]).then(([flew]) => {
    if (flew) fromFlyover();
    if (lib && !lib.warm) { lib.setWarm(warmFor); if (lib.warmPalette) lib.warmPalette(); } // (as the loader's compile is done, below: the characters that come from now on are warmed before they are shown, people.js)
    setTimeout(afterPlayable, reduced ? 0 : 700); // (once the loader has faded)
    preTitle = false;
    if (story) story.dress(); // (the title stands over the evening its first episode is set in)
    titleScreen('press'); // (the title opens on its press: the street and the name; titleScreen)
    // (come back from a menu's Title screen, menus.js: the press was made already, so the title opens on its menu)
    { let back = false; try { back = sessionStorage.getItem('bh-title-auto') === '1'; sessionStorage.removeItem('bh-title-auto'); } catch (e) { /* storage blocked */ }
      if (back) titleScreen('menu'); }
    $('#g-title').hidden = false;
    // a load after a lost context the page could not redraw: the player taken up where they were (noteResume), no card
    { const R = takeResume();
      if (R) { resumeAt = R; stage.classList.add('story-auto'); if (R.kind === 'story') setTimeout(() => startGame(false), 0); else { walkAuto = true; walkNoFilm = true; setTimeout(() => walkUi.auto(R.walk), 0); } } }
    // come from a story's link on the globe (title.js): no card to press, the story starts
    { let auto = false; try { auto = !!story && sessionStorage.getItem('bh-story-auto') === cityId; if (auto) sessionStorage.removeItem('bh-story-auto'); } catch (e) { /* storage blocked */ }
      if (auto && !resumeAt) { stage.classList.add('story-auto'); setTimeout(() => startGame(false), 0); } }
    // come from the story's last card (its Walk Shibuya, story ctx free): no card to press, the walk sets out
    { let sp = null; try { sp = walkUi ? JSON.parse(sessionStorage.getItem('bh-walk-auto') || 'null') : null; sessionStorage.removeItem('bh-walk-auto'); } catch (e) { sp = null; }
      if (sp && !playing && !resumeAt) { stage.classList.add('story-auto'); walkAuto = true; walkNoFilm = !sp.film; setTimeout(() => walkUi.auto(sp), 0); } } // (sp.film: a harness's, tools/walk_open.js)
    $('#g-loader').classList.add('out');
    if (window.OEBoot) OEBoot.done(); // (the first frame is behind the loader: what fails from here is the game's to say, not the loader's)
    setTimeout(() => {
      $('#g-loader').hidden = true; OEPlate.stop($('#g-loader'));
    }, reduced ? 0 : 700);
    // the helicopter's model while the title is up, if it waits within reach of the start (it is left out of the
    // loader's wait, issue 148): fetched, built, its shaders compiled and its textures sent now, not during the
    // opening shot; it lands on its pad once the game opens (heliToPad), not in the title's shot
    // (on a phone, after what afterPlayable fetches: one thing at a time)
    const heliIn = () => { if (running && !(QC.budget && QC.budget.extras === false) && !heli.loaded() && heli.prefetch && Math.hypot(heli.st.x - player.x, heli.st.y - player.y) < 800) { loadStep('late helicopter'); heli.prefetch(); } };
    // the opening's own things (its guide, the air it drifts in, the glows, the painted sky) built and their shaders
    // compiled behind the title too, so that the tap on Play draws them rather than compiles them (overture.js prewarm)
    if (overture && overture.prewarm && !playing && (story ? !/[?&]overture=0\b/.test(location.search) : OEOverture.due(CITY.id))) setTimeout(() => { if (!playing) overture.prewarm(o => compileFor(o)); }, reduced ? 0 : 800);
    // and the story's stopped air: its leaves, birds and motes, made at the first beat after the tap (stopfx.js warm)
    if (story && stopFx && stopFx.warm) setTimeout(() => afterLevel().then(() => Promise.all([stopFx.warm(warmFor), warmGhosts()])), reduced ? 0 : 1000); // (and the afterimages' look, warmGhosts)
    setTimeout(() => { if (QC.lean) afterPlayable().then(heliIn); else heliIn(); }, reduced ? 0 : 900);
  });
  // What the first frame doesn't need, fetched once the game can be played, as the helicopter's model is (issue 335):
  // the aerial tiles beyond a kilometre of the start; the NPCs' characters, nearest the start first; the traffic's near and mid cars (their far models stand in until
  // then: actors.js upgrade) and the car you drive; the near trees (trees.js loadNear: the mid ones stand in)
  // On a phone (quality.js lean) they come one after another, with a breath between: all at once, each picture is
  // decoded, resized and sent to the GPU beside the others, and the phone's tab died in the seconds after its first
  // frame (issue 443: the telemetry's load reported the frame, then nothing). In turn, the most held at once is one
  // step's; the far models stand in a few seconds longer.
  let lateOn = null;
  // the cars' near models, fetched and laid over the far ones once (afterPlayable, or sooner where the story sends a car)
  function carsNow() { return carsNow.p || (carsNow.p = vlib.loadCars().then(g => { if (g && vlib.carsFull && cars.upgrade) cars.upgrade(g); })); }
  function afterPlayable() {
    if (lateOn) return lateOn;
    if (levelFirst()) return (lateOn = afterLevel().then(() => { lateOn = null; return afterPlayable(); })); // (the level first, above)
    const near = () => (lib ? npcs.filter(n => n.rig.pending && !n.away && Math.hypot(n.x - player.x, n.y - player.y) < NPC_LOAD_M) // (not the walk's own: in the story they cost a phone's memory for nothing)
      .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y)) : []);
    const carsIn = () => (vlib && vlib.loadCars && !vlib.carsFull ? Promise.all([carsNow(), parkWait ? parkLater() : null]) : null);
    const treesIn = () => (Wd.trees && Wd.trees.loadNear && !(QC.budget && QC.budget.extras === false) ? Wd.trees.loadNear() : null); // (the lightest set keeps the mid trees: quality.js level)
    const pictures = () => { if (Wd.groundPictures) Wd.groundPictures.release(); }; // the aerial tiles further out (world.js groundPictures)
    if (!QC.lean) {
      pictures();
      const people = near().map(npcLoad);
      carsHeld = false;
      lateBusy = true;
      lateOn = Promise.all([...people, carsIn(), treesIn()]).finally(() => { lateBusy = false; });
      // then the pictures of what is in the scene and not drawn yet, one a frame (world.js uploadRest, issue 184)
      lateOn.then(() => (OEWorld.uploadRest ? OEWorld.uploadRest(renderer, world) : 0)).then(n => { if (n) console.info(`late: ${n} pictures sent ahead of their first draw`); }).catch(() => {});
    } else {
      // (and none of it under the opening's film, before any step or any one of the people: the city seen whole from the
      // air is the most a phone holds, and what came in beside it was the step its GPU died on, eight seconds into the
      // walk's opening, the near trees; the owner heard the music break into a loud noise with it, as WebKit draws and
      // plays media in one process. The chain begins behind the title, and went on into the film when it began. The film
      // needs none of it from up there, and the far models stand in until it is over: issues 118 and 166)
      const clearOfFilm = async () => { if (!(overture && overture.active)) return; loadStep('late after the film'); while (overture && overture.active) await new Promise(r => setTimeout(r, 400)); };
      const breath = () => new Promise(r => setTimeout(r, 250)).then(clearOfFilm);
      lateBusy = true; // (the street's sound waits for all of it: sndHold)
      lateOn = (async () => {
        await clearOfFilm();
        loadStep('late people');
        for (const n of near()) { await npcLoad(n); await breath(); }
        await clearOfFilm();
        loadStep('late cars');
        carsHeld = false;
        await carsIn(); await breath();
        loadStep('late trees');
        await treesIn(); await breath();
        loadStep('late pictures');
        pictures();
        if (Wd.groundPictures && Wd.groundPictures.all) await Wd.groundPictures.all();
        lateBusy = false;
        loadStep('late in');
        // a minute of play with everything in: this level fits this phone, and the next visit may try the one above
        // (quality.js held). Counted in seconds on screen, so a tab put away does not earn it.
        let on = 0;
        const iv = setInterval(() => { if (!running) { clearInterval(iv); return; } if (document.hidden) return; if (++on >= 60) { clearInterval(iv); loadStep('held'); if (window.OEQuality && OEQuality.held) OEQuality.held(cityId); } }, 1000);
      })().finally(() => { lateBusy = false; }); // (one that failed does not keep the street waiting)
    }
    return lateOn;
  }
  // (for the tools: what afterPlayable fetches, come and in place: the world then as it was at the start before, issue 335)
  const lateReady = () => afterPlayable().then(() => new Promise(r => setTimeout(r, 0)));
  const late = () => ({ carsFull: !vlib || !vlib.cars || !!vlib.carsFull, myCar: !parkWait, // (your car parked, or none to park)
   
    fleetNear: !cars.fleet || Object.values(cars.fleet).every(f => f[0].geometry.index.count > f[2].geometry.index.count),
    treesNear: !Wd.trees || !Wd.trees.nearReady || Wd.trees.nearReady(), npcsPending: npcs.filter(n => n.rig.pending).length });
  renderPassport();

  // ------------------------------------------------------------ the loop
  let last = performance.now(), clockT = 0, sunTimer = 0, sunState = 'sun', stepPhase = 0, bumpT = -9, waterT = -99;
  const fpDir = new THREE.Vector3(), fpUp = new THREE.Vector3(), fpQ = new THREE.Quaternion(); let fpOn = false, filmOn = false, filmYaw = 0; // (the story's camera raised: the lens's view; the story's own film, and where it looked last)
  const fp = { yaw: 0, pitch: 0, yawT: 0, pitchT: 0, k: 1, eyeZ: 0, fov: null, from: null, dur: 0.28 }; // (the lens's own aim, as it is and as the hand turns it; how far up it has come; its angle)
  // (the hand turns a long lens less, by the ratio of its angle to the eye's: the same move of the mouse takes the same
  // share of the picture whatever the lens, as Rainbow Six Siege scales its aim, not the same degrees)
  const lensTurn = () => Math.tan((fp.fov || 40) * Math.PI / 360) / Math.tan(40 * Math.PI / 360);
  const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), camSmooth = new THREE.Vector3(), camOff = new THREE.Vector3(), camWant = new THREE.Vector3();
  // What a device that can't keep up gives up, and gets back when it can (the governor, quality.js): resolution
  // first, a step at a time, which the lens's sharpened upscale hides; then the extras (the far rain and its
  // splashes, the wet street's reflections, the fuller contact shadows; then the weather altogether: weather.js,
  // remembered for the next visit, and a weather the player chose keeps its wet streets and grey sky and loses
  // only the drops); then resolution to its floor. The people keep their models and the city its detail: a
  // crowd of boxes is not a city. Resolution, the reflections and the contact shadows come back as the frame
  // time allows, and so does the weather this session's shedding took (weather.js shed: a device that began with it off keeps it off).
  // The ladder's rungs (quality.js rung: the value with every extra, at half, with none), in the order of what is
  // missed least; resolution moves on its own between them (above). Two-way: each comes back as the frames allow.
  // (weather.js gives back what this session's shedding took, and keeps off what started off)
  if (weather) gov.rung('weather', [0, 1, 2], v => { weather.shed = v; });
  gov.rung('mirror', [false, true, true], v => { if (mirror && mirror.on) mirror.off = v; });
  // the sea's reflection: every frame while the camera moves, every second, none (water.js reflEvery)
  if (Wd.sea && Wd.sea.reflections) gov.rung('reflection', [1, 2, 0], v => { Wd.sea.reflEvery = v; });
  if (atmos && atmos.ao && atmos.ao.limit) gov.rung('ao', [2, 1, 0], v => atmos.ao.limit(v));
  // the scene's multisampling: the tier's (four on high) with every extra, two at half, none at the floor, where the
  // sharpened upscale and the lens's grain hide the edges more cheaply than four samples a pixel
  // (the tier's: two on a dense display, where the scene has two device pixels or more under each CSS pixel already:
  // quality.js samplesAt; followed when the window changes size, resize())
  if (atmos && atmos.setSamples && QC.samples) { msaaRung = [0, 0, 0]; msaaFor(); gov.rung('msaa', msaaRung, v => atmos.setSamples(v)); }
  // the sun's shadow map: the tier's, then half the texels on a side (the box keeps its size: softer edges), then 1024
  if (Wd.setShadowSize) { const S = Wd.shadowSize; gov.rung('shadow', [S, Math.max(1024, S / 2), 1024], v => Wd.setShadowSize(v)); }
  // the crowd: whole, whole, and three in four with none (crowd.active, as the menu's density sets it)
  gov.rung('crowd', [1, 1, 0.75], v => { govCrowd = v; applyDensity(); });
  // A tier down, or back up, when the governor has nothing left to give on this one (quality.js tierStep, issue 184): the
  // new tier's canvas, scene budget, multisampling and shadow map at once; what the world was built with (its set of
  // details, the woods, the cast) from the next load, which starts on the tier this one ended on.
  gov.tierRoom = gov.auto ? OEQuality.room() : 0; gov.tierDown = QC.stepped || 0; gov.upWait = OEQuality.stepped(cityId).wait;
  gov.onTier(dir => {
    const was = QC.name;
    gov.tierDown = OEQuality.tierStep(dir, cityId);
    Object.assign(QC, OEQuality.city());
    gov.tierRoom = OEQuality.room(); gov.upWait = OEQuality.stepped(cityId).wait;
    if (Wd.setShadowSize) { const S = QC.shadow; gov.revalue('shadow', [S, Math.max(1024, S / 2), 1024]); }
    resize();
    console.info(`Frame budget: tier ${was} → ${QC.name} (${gov.frameMs.toFixed(1)} ms a frame at ${gov.scale.toFixed(2)}/${gov.extras})`);
    if (window.OETelemetry) { if (OETelemetry.set) OETelemetry.set({ tier: QC.name }); if (OETelemetry.track) OETelemetry.track('tier_step', { from: was, to: QC.name, ms: +gov.frameMs.toFixed(1), scale: +gov.scale.toFixed(2), shed: 2 - 2 * gov.extras }); }
  });
  gov.on((extras, scale, extrasChanged) => {
    resize();
    if (window.OETelemetry && OETelemetry.set) OETelemetry.set({ scale: +scale.toFixed(2), shed: 2 - 2 * extras, msaa: atmos && atmos.composer ? atmos.composer.samples : QC.samples || 0, cap: gov.cap }); // (each step is a "quality" event: telemetry.js)
    // what this device held on this map, for the next visit to start from (it climbs again from there if it can)
    if (gov.auto) try { localStorage.setItem(GOV_KEY, `${+scale.toFixed(2)}/${extras}`); } catch (e) { /* storage blocked */ }
    if (!extrasChanged) return;
    console.info(`Frame budget: extras ${extras}, scene scale ${scale.toFixed(2)}`, gov.ladder);
  });
  // The frame's own writes to the page (issue 352): each of the HUD's nodes is looked up once, and its text is
  // written only when it changes. A text node replaced every frame, though with the same words, is a style and
  // layout pass every frame.
  const hudNodes = {};
  const hud = s => { const n = hudNodes[s]; return n && n.isConnected ? n : (hudNodes[s] = document.querySelector(s)); };
  const put = (s, text) => { const n = hud(s); if (n.textContent !== text) n.textContent = text; };
  let running = true;
  // a harness's hold (__game.hold): the world stands still between its steps while it waits on something
  // that only takes time to load (tools/game_check.js), so a slower load doesn't send the traffic down
  // another way; advance() still moves it
  let simHold = false;
  // the fill over the player (above): where they stand, raised and drawn a little towards the camera so the
  // faces it sees are the lit ones; off in the air (from a helicopter's height it would light nothing)
  function placeNightFill() {
    const n = U.uNight.value, air = player.mode === 'heli';
    // (a hero level is lit by its own signs and shop fronts, baked: there the fill is the share it asks for, hero.fill,
    // or it washes the people and the paving at your feet to a flat white the street's own light never gives them)
    let heroFill = 1;
    // (the level you are on: SHIBUYA SKY's roof stands over Scramble Square's foot, and took the street level's share)
    for (const h of G.hero || []) if (h.fill != null && Math.hypot(h.at[0] - player.x, h.at[1] - player.y) < (h.r || 100) && (h.z == null || Math.abs(player.z - h.z) < (h.zr || 4) + 20)) heroFill = Math.min(heroFill, h.fill);
    // (in the air a third of it, carried with the helicopter: it lights nothing below from its height, and the body,
    // dark paint against a dark city, read as a hole with four coloured dots on it)
    nightFill.intensity = nightFill.userData.cd * n * (air ? 0.35 : heroFill);
    if (!nightFill.intensity) return;
    const v = air ? heli.st : player.mode === 'ferry' && player.vehicle ? player.vehicle : player, z = air ? heli.st.z - 1 : player.mode === 'ferry' ? 5 : player.z;
    const p = W(v.x, v.y, z + 3), dx = camera.position.x - p.x, dz = camera.position.z - p.z, d = Math.hypot(dx, dz) || 1, k = Math.min(2.5, d * 0.4) / d;
    nightFill.position.set(p.x + dx * k, p.y, p.z + dz * k);
  }
  // A page nobody is looking at gives the GPU back. Its window behind another (the tab still showing, so the browser
  // keeps calling it), it draws ten frames a second; the title left untouched for a minute, thirty. The owner played the
  // walk in one browser with the title open in another, on an M3: the title drew at full rate the whole time behind it,
  // its GPU's frame went from 20 ms to 100 ms, and the walk in front ran at ten frames a second (telemetry, November 2026).
  // A desktop game's background frame limit, as the PC ports have; never under a harness, whose page has no focus.
  const AWAY_CAP = !navigator.webdriver;
  let awayLast = 0, touchedAt = performance.now(), awayCapped = false;
  for (const t of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) on(window, t, () => { touchedAt = performance.now(); }, { capture: true, passive: true });
  function awayHold(now) {
    awayCapped = false;
    if (!AWAY_CAP) return false;
    const away = !document.hasFocus(), idle = (preTitle || !hud('#g-title').hidden) && now - touchedAt > 60000 && !(gamepad && gamepad.on);
    const cap = away ? 10 : idle ? 30 : 0;
    if (!cap) return false;
    awayCapped = true;
    if (now - awayLast < 1000 / cap - 4) return true;
    awayLast = now;
    return false;
  }
  // A frame a check runs without drawing it (tools/story_play.js DRAW=n: one in n drawn on a software renderer, #51): what
  // only a drawn frame shows is left to the next one drawn (#70). Never on a player's page, where every frame is drawn
  const unseenFrame = () => !!window.__draw && window.__draw.on === false;
  function frame(now) {
    if (!running) return;
    if (care.lost) { last = now; requestAnimationFrame(frame); return; } // the game holds still until the picture is back
    gov.raf(now);
    if (awayHold(now)) { requestAnimationFrame(frame); return; } // (nobody looking: a frame now and then, above)
    if (!awayCapped && !gov.due(now)) { requestAnimationFrame(frame); return; } // (the frame-rate cap on a faster display: this frame is not drawn)
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // the first frame can be stamped before the loop started
    last = now; if (!simHold) clockT += dt * (story ? story.scale : 1); // (the Stop holds the world's clock; a harness's hold: only advance() moves the world's clock)
    U.uTime.value = clockT;
    const titleOn = preTitle || !hud('#g-title').hidden, paused = titleOn || !hud('#g-menu').hidden || (window.OEMetro && OEMetro.isOpen()) || photo.on || simHold;
    stage.classList.toggle('titled', titleOn);
    if (gamepad) gamepad.tick(dt); // (the controller is read every frame, the title's and a held world's too: pad.js)
    // time of day
    if (!clock.frozen && !paused) { clock.min += dt * clock.scale / 60; if (clock.min >= 1440) setClock(clock.y, clock.m, clock.d, clock.min, !clock.own); }
    sunTimer -= dt;
    if (sunTimer <= 0) {
      sunTimer = 0.25;
      // the place's own time: read from the wall clock, not counted, so a pause, a menu or a tab left in the
      // background never leaves it behind
      if (!clock.own && !clock.frozen && clock.scale === 1 && !simHold) { const now = S.utcToLocal(Date.now()); Object.assign(clock, { y: now.y, m: now.m, d: now.d, min: now.minutes }); }
      applySun();
      const px = player.mode === 'heli' ? heli.st.x : player.mode === 'ferry' ? player.vehicle.x : player.x, py = player.mode === 'heli' ? heli.st.y : player.mode === 'ferry' ? player.vehicle.y : player.y;
      const pz = player.mode === 'heli' ? heli.st.z + 1 : player.mode === 'ferry' ? 3 : player.z + 1.6;
      sunState = sun.altitude <= 0 ? 'night' : S.sunlit(DSM, px, py, pz, sun) ? 'sun' : 'shade';
      $('#g-sun').dataset.s = sunState;
      const wx = weather ? weather.state : null;
      if (wx && (wx.rain > 0.06 || wx.snow > 0.06)) { sunState = 'rain'; $('#g-sun').dataset.s = 'rain'; }
      else if (wx && wx.kind === 'fog') { sunState = 'fog'; $('#g-sun').dataset.s = 'shade'; }
      $('#g-sun span').textContent = sunState === 'rain' ? `${wx.kind === 'storm' ? 'Thunderstorm' : wx.kind === 'snow' ? 'Snow' : wx.kind === 'rain' ? 'Rain' : 'Drizzle'} · ${wx.covered ? 'under cover' : 'in the open'}`
        : sunState === 'fog' ? `Fog · ${Math.round(wx.temp)}°`
        : sunState === 'night' ? 'Sun down' : sunState === 'sun' ? `In sun · ${sun.altitude.toFixed(0)}°` : `In shade · sun ${sun.altitude.toFixed(0)}°`;
      if (!paused) checkSteps();
    }
    if (!paused) simulate(dt);
    if (!paused && !(story && story.stopped)) { crossingSound(dt); trafficSound(); if (!(overture && overture.active)) walkCalls.update(dt, camera); } // (the overture's score has the birds' calls in it)
    else { if (places) places.hush(); if (trains) trains.hush(); } // a paused game (the title, the menu, photo mode) shows no caption
    if (player.mode !== 'heli' && !simHold) nav.prefetch(player.x, player.y); // the landmarks' fine collision ahead of the walker or the car, a few ms a frame (held by a harness: advance() lays them, below)
    if (Math.floor(clockT) !== Math.floor(clockT - dt)) groundLod(player.mode === 'heli' ? heli.st.x : player.x, player.mode === 'heli' ? heli.st.y : player.y);
    if (titleOn && titleYaw != null && !simHold) { titleT += dt; titleYaw = openingHere() ? openingView().yaw + OPENING.sway * Math.sin(titleT * 0.06) : DISTRICT ? titleYaw0 + 0.3 * Math.sin(titleT * 0.05) : titleYaw + dt * 0.05; }
    if (simHold) { /* (held by a harness: the camera too, which the traffic reads, what is in view; advance() moves it) */ } else if (photo.on) photoCamera(dt); else if (closeup && !titleOn) closeupCamera(dt); else updateCamera(dt, titleOn);
    if (!titleOn) lensGuard(); // (whichever camera it was, its window in nobody: issue 226)
    if (photo.on && crowdDraw && crowdDraw.still) crowdDraw.still(); // (a photograph's crowd: everyone near enough to be seen drawn whole, the world held: issue 174)
    placeNightFill();
    marks.frame(); // (the camera as it stands for this frame, and who is drawn near it: what every mark over the picture asks, marks.js)
    stage.classList.toggle('cine', cine.active && (cine.label !== 'crane' || cine.k < 0.5));
    // world clocks and fades
    Wd.tick(now, camera);
    if (overture) overture.update(dt);
    if (neon) neon.update(camera, dt);
    if (hero) hero.update(camera, dt, (titleOn && !preTitle) || (overture && overture.active) || levelHold ? [player.x, player.y] : null); // (the level the story starts in, fetched behind the title, not the loader, and ready before the opening flies into it)
    if (HERO_CUT.h) HERO_CUT.box.value.w = HERO_CUT.h.shown && !HERO_CUT.off ? 1 : 0; // (the ground cut under a level's floor only while the floor is drawn)
    if (Math.floor(clockT) !== Math.floor(clockT - dt)) applyDensity();
    if (atmos) atmos.update(clockUtc, now / 1000, U);
    if (SND_GUARD) { // (a phone's street: held while the page is busy, above sndHold; the loading cue until it plays, and in its place if it gave up)
      const film = !!(overture && overture.active), held = sndHold(now);
      if (film) sndFilmAt = now;
      if (!held) sndHeldAt = 0; else if (!sndHeldAt) sndHeldAt = now;
      A.hold(held);
      if (sndQuiet) { // (the context made once the opening's film is over and the page has room for it, or two seconds into a start that has none: audio.js quiet)
        if (film) sndQuiet = 2;
        if (playing && !film && !held && (sndQuiet === 2 || now - (sndQuietAt || (sndQuietAt = now)) > 2000)) { sndQuiet = 0; A.quiet(false); }
      }
      if (sndBed && sndBed.dead) sndBed = null; // (let go for a film's score: one tune at a time, audio.js tune; begun again after it)
      if (cue && cue.dead) cue = false;
      if (playing && !film) {
        const street = !!A.ctx && A.ctx.state === 'running' && !A.holding && !A.gaveUp;
        if (sndCueOut && street) { sndCueOut = false; cueOut(); }
        if (sndBed && street) { sndBed.stop(3); sndBed = null; }
        else if (!sndBed && !cue && (A.gaveUp || A.streetOff || (sndHeldAt && now - sndHeldAt > 8000)) && now - sndFilmAt > 2500) sndBed = A.tune('assets/story/late/cue-phone.mp3', { loop: true }); // (or held for long: a phone at its limit hears music, not nothing)
      }
    } else if (sndQuiet) { // (a phone's context is made once the opening's film is over, or two seconds into a start that has none: audio.js quiet)
      const film = !!(overture && overture.active); if (film) sndQuiet = 2;
      if (playing && !film && (sndQuiet === 2 || now - (sndQuietAt || (sndQuietAt = now)) > 2000)) { sndQuiet = 0; A.quiet(false); }
    }
    weatherTick(simHold ? 0 : dt * (story ? story.scale : 1), titleOn, titleOn || paused || photo.on); // (held by a harness: the weather eases on only with advance(), which ticks it; stepped by the frames too, it eased by however many the machine drew, #420)
    if (show) show.tick(now);
    if (window.OEKit) OEKit.setNight(U.uNight.value); // cabin windows and navigation lights
    fer.vessels.forEach(v => (v.events || []).splice(0).forEach(ev => onFerryEvent(ev)));
    if (life && !simHold) life.tick(dt, paused, titleOn); // (held by a harness: the day moves on only with advance())
    if (walk && walkUi) walkUi.tick(dt, [player.x, player.y]); // (where and when you are, on the walk)
    if (tonight) tonight.tick(dt); // (what the night has at this hour: tonight.js)
    if (walk && walkTalk) walkTalk.tick(dt, paused || photo.on || dlg.open || cine.active || !!closeup); // (who has something to say, and what was asked of you met)
    npcMarks(titleOn || paused || photo.on || dlg.open || cine.active || !!closeup || !!(overture && overture.active));
    if (story && !paused) { story.tick(dt); if (stopFx) stopFx.tick(dt, story.scale, W(player.x, player.y, player.z), player.z > 60); if (heliAway) heliAway(dt); if (story.orbit && player.mode === 'foot' && !fpOn) cam.yaw += story.orbit * dt; } // (and what hangs in the stopped air; the first Stop turns the view round you once)
    // the camera of 1964 round your neck, on your own camera's strap, from when Sumiko gives it (the first frame's
    // afterimage has spoken and its photograph is to be taken: the frame's words say you put your own away) until the
    // case is closed and it is hers again; never in the free game (people.js camera1964, hung where the main
    // character's people.json neck_camera says the strap ends). Asked of the rig each frame, so a character swapped in
    // the menu has it too
    if (player.rig.setLook) {
      const s = story && story.on && story.state, holds = !!s && (s.fi > 0 || (s.phase === 'stop' && /^(shoot|shown|failed)$/.test(s.beat)) || s.phase === 'after');
      if (player.rig.oldCam !== holds) {
        const h = lib && lib.heroes && lib.heroes[player.rig.character];
        player.rig.oldCam = holds;
        player.rig.setLook({ acc: holds ? ['camera1964'] : null, neckcam: (h && h.neck_camera) || null });
      }
    }
    if (story && heli.group && !heli.st.on) {
      // (the story's helicopter is seen only on its pad before the flight it plays, and in that flight: story ctx board,
      // film. On the walk it stands on its pad, or wherever you set it down, for anyone to fly: fetched once you are near
      // enough to see it, on the roof or round it, and drawn once it has come; out of sight, not drawn)
      const near = !!walk && Math.hypot(heli.st.x - player.x, heli.st.y - player.y) < 260 && Math.abs(heli.st.z - player.z) < 60;
      if (near && !heli.loaded()) heli.want();
      // (and wherever it stands off its pad, in the stand-in until its model is swapped in once the rotor has stopped: you
      // climbed out of it on the street and it was gone from where it stood for those seconds, though still in the road)
      heli.group.visible = !!heliWait || (near && (heli.loaded() || !!heliHome || heliOnRoad()));
      heli.st.idle = heliWait && heliWait.idle && heli.loaded() ? HELI_IDLE : 0;
    }
    if (storyBeacon && storyBeacon.visible) storyBeacon.userData.col.material.uniforms.uT.value = performance.now() / 1000;
    if (storyHere && storyHere.visible) { const U = storyHere.userData, t = (performance.now() - U.t0) / 900, e = 1 - Math.pow(1 - Math.min(1, t), 3), u = U.disc.material.uniforms; u.uT.value = performance.now() / 1000; u.uWave.value = 0.15 + 0.85 * e; u.uWaveA.value = 0.7 * (1 - Math.min(1, t)); }
    if (!simHold) dlg.tick(paused || uiOpen() || document.querySelector('#g-story-log.on, #g-story-album.on') ? 0 : dt); // (not under the menu, the log or the roll: a call that goes on by itself waits while they are up) (held by a harness: a conversation goes on only as it asks, dlg.tick, so that one closing on the real clock starts nothing at another step of its run)
    // HUD
    const ob = titleOn || walk ? null : objective(); // (the walk owes nobody anything: no objective, no line, no light)
    const target = waypoint || (ob && ob.at);
    // on foot with a ride on its way, the route leads to the pick-up first
    const toPickup = player.mode === 'foot' && ride && (ride.phase === 'coming' || ride.phase === 'waiting') && Math.hypot(ride.pickup.x - player.x, ride.pickup.y - player.y) > 40 ? [ride.pickup.x, ride.pickup.y] : null;
    updateRoute(clockT, toPickup || target, toPickup ? null : ob, titleOn);
    gold.tick(clockT);
    // (one light standing in the street at a time: while the story is on, its own light is the only one. The free game's
    // objective went on under it, and its column stood over the Center Gai arch, then over SHIBUYA SKY's door, beside the
    // story's light, and in the finder over the picture being taken)
    beam.visible = !(story && (story.on || walk)) && !!target && !titleOn && Math.hypot(target[0] - (player.mode === 'heli' ? heli.st.x : player.x), target[1] - (player.mode === 'heli' ? heli.st.y : player.y)) > 45;
    if (target) { const f = nav.floorAt(target[0], target[1], Math.max(300, nav.terrain(target[0], target[1]) + 1)); beam.position.copy(W(target[0], target[1], f ? f.z : 0)); beam.scale.set(1, player.mode === 'heli' ? 4 : 1, 1); }
    const me = player.mode === 'heli' ? heli.st : player.mode === 'ferry' ? player.vehicle : player;
    put('#gq-title', ob ? ob.title : (Q.length && goals.allDone() ? 'Free roam' : ''));
    if (!titleOn) renderLines();
    let trigLeft = 0;
    { const done = trigDone(); for (const v of VP) if (!done[v.id]) trigLeft++; }
    put('#gq-step', ob ? ob.text : trigLeft ? `The city is yours. ${trigLeft} trig station${trigLeft > 1 ? 's' : ''} still to survey (△ on the map), or change the time and fly anywhere.`
      : 'The city is yours. Change the time, ride the ferries, fly anywhere.');
    put('#gq-dist', target ? `${Math.round(Math.hypot(target[0] - me.x, target[1] - me.y))} m` : '');
    if (photo.on) beam.visible = false;
    routeShow(dt, titleOn);
    if (!titleOn && !photo.on) {
      const icons = [];
      for (const w of G.wharves) icons.push({ kind: 'wharf', x: w.terminal[0], y: w.terminal[1] });
      for (const h of G.helipads) icons.push({ kind: 'pad', x: h.at[0], y: h.at[1] });
      for (const v of VP) icons.push({ kind: 'trig', x: v.x, y: v.y, done: !!trigDone()[v.id] });
      if (fish) for (const f of fish.spots) icons.push({ kind: 'fish', x: f.at[0], y: f.at[1] });
      for (const f of flocks) if (!f.soaring) icons.push({ kind: 'gull', x: f.at[0], y: f.at[1] });
      for (const v of fer.vessels) icons.push({ kind: 'ferry', x: v.x, y: v.y });
      if (player.mode !== 'heli') icons.push({ kind: 'heli', x: heli.st.x, y: heli.st.y });
      if (myCar && player.mode !== 'car') icons.push({ kind: 'car', x: myCar.D.st.x, y: myCar.D.st.y });
      let rideRoute = null, radius = player.mode === 'heli' ? 700 : player.mode === 'ferry' ? 450 : player.mode === 'car' || player.mode === 'ride' ? 260 + Math.min(220, player.speed * 7) : 200;
      if (ride && player.mode !== 'ride' && ride.phase !== 'leaving') {
        const st = ride.drv.st;
        if (ride.phase === 'coming') { const P = ride.drv.path; rideRoute = [[st.x, st.y]].concat(P.pts.slice(P.pos(st.s, {}).i + 1)); }
        if (ride.phase !== 'arrived') icons.push({ kind: 'pickup', x: ride.pickup.x, y: ride.pickup.y, pin: true });
        icons.push({ kind: 'ridecar', x: st.x, y: st.y, h: st.h, pin: true });
        // on foot, the minimap opens out to show the car coming and the pick-up, as the app's map does
        if (player.mode === 'foot') radius = Math.max(radius, Math.min(480, 1.18 * Math.max(Math.hypot(st.x - player.x, st.y - player.y), Math.hypot(ride.pickup.x - player.x, ride.pickup.y - player.y))));
      }
      for (const n of npcs) if (wantsTalk(n)) icons.push({ kind: 'npc', x: n.x, y: n.y, color: '#e0a21a', pin: true });
      for (const o of sideObjectives()) icons.push({ kind: 'quest2', x: o.at[0], y: o.at[1] });
      if (ob && ob.at) icons.push({ kind: 'quest', x: ob.at[0], y: ob.at[1], pin: true });
      if (waypoint) icons.push({ kind: 'waypoint', x: waypoint[0], y: waypoint[1], pin: true });
      drawMini({ x: me.x, y: me.y, yaw: player.mode !== 'heli' ? cam.yaw : cam.mode === 'bird' ? heli.st.h : cam.mode === 'cockpit' ? heli.st.h - cam.lookYaw : cam.yaw, heading: player.mode === 'heli' ? heli.st.h : player.mode === 'ferry' ? player.vehicle.h : player.h,
        radius: mini.r += (radius - mini.r) * Math.min(1, dt * 2.5), route: guide.pts ? [[me.x, me.y]].concat(gold.ahead()) : null, icons, ride: rideRoute });
      if (!hud('#g-bigmap').hidden && Math.floor(clockT * 2) !== Math.floor((clockT - dt) * 2)) drawBig();
      const a = currentAction(), alt = altAction();
      hud('#g-prompt').hidden = !a && !alt;
      hud('#gp-main').hidden = !a; hud('#gp-alt').hidden = !alt;
      if (alt) { put('#gp-alt-key', alt.key); put('#gp-alt-text', alt.text); }
      if (a) { put('#gp-key', a.key || ''); hud('#gp-key').hidden = !a.key; put('#gp-text', a.text); }
      if (!phone.el.hidden && phone.view === 'ride') {
        if (clockT - phone.at > 0.5) { phone.at = clockT; phoneRender(); }
        if (rideOn() && !phone.map.hidden) rideMapFrame();
      }
      vehicleHud();
      if (player.mode !== 'foot') gaitChip('');
    }
    // the frame's time, for the governor: in play only (the title's orbit and a menu are lighter than play)
    // (the title's orbit too: the telemetry's slowest frames were a city's title screen, where nothing held them)
    gov.tick(now, !simHold && framesDrawn >= 2 && !document.hidden && !awayCapped); // (a frame held back for a page nobody looks at says nothing of its cost)
    if (player.rig.hideHead) player.rig.hideHead(player.mode === 'heli' && cam.mode === 'cockpit' && !photo.on && !(cine.active && cine.label !== 'crane'));
    // depth of field in photo mode, and with the camera's motion blur in the opening shot; never in play
    if (atmos && atmos.camFx) atmos.camFx(overture && overture.active ? overture.fx : photo.on ? { focus: camera.position.distanceTo(photo.focus), aperture: lensBlur(camera.fov, camera.position.distanceTo(photo.focus), photo.fstop || 2.8) }
      : arriving && cine.active ? { focus: camera.position.distanceTo(live.look), aperture: lensBlur(camera.fov, camera.position.distanceTo(live.look), 4), blur: 0.5 }
      : talkShot ? { focus: talkShot.focus, aperture: lensBlur(camera.fov, talkShot.focus, 2.8) } // (a conversation: the face sharp, the street behind it soft, where the tier draws depth of field)
      : story && story.soft ? { focus: camera.position.distanceTo(W(player.x, player.y, player.z + 1.5)), aperture: lensBlur(camera.fov, 7, 2) * story.soft } : null); // (the Stop's first moments: held round you, the street behind soft)
    bodiesGuard();
    if (window.__bodies) bodiesCheck();
    // (tools/clip_probe.js, issue 126: what stands inside what, measured every frame of a play from the bones as they are drawn)
    if (window.__probe) window.__probe.frame({ THREE, player, storyFigs, npcs, crowd, crowdDraw, guide: guideMade, guideSeg, nav, posts, carBoxes, heli, car: myCar, story, at: bodiesAt(), talk: !!talkShot, camera });
    mirrorTick();
    if (window.OEVis) { const sy = Wd.sunDir.y; OEVis.cot = sy > 0.03 ? Math.sqrt(1 - sy * sy) / sy : 0; } // (how far a shadow reaches, for the crowd's and the cars' culling)
    if (window.OEVis) OEVis.at(camera); // what cannot be seen from here is left out (visibility.js)
    // (a phone: the roofs' kit, the stair huts, tanks and plant on them, only from a camera above the street. From the
    // street it is behind the parapets, and its instanced meshes, each over a cell of the map, were never out of view:
    // 72,000 triangles of every frame on foot. On a roof, in a lift's glass and from the helicopter the camera is up)
    if (QC.lean && Wd.roofKit) Wd.roofKit.visible = camera.position.y - Math.max(0, nav.terrain(camera.position.x, -camera.position.z)) > 12;
    const held0 = renderer.__gate ? renderer.__gate.n.held + renderer.__gate.n.late : 0;
    if (atmos) atmos.render(world, camera); else renderer.render(world, camera);
    const gc0 = performance.now();
    glCheck(now); // (on the first frame it waits for the GPU to draw it: the first draw of each program is where a driver finishes it)
    if (!framesDrawn) console.info(`warm: the first frame ${((performance.now() - wt0) / 1000).toFixed(1)} s from built, ${((performance.now() - gc0) / 1000).toFixed(1)} s of it waiting for the GPU to draw it`);
    care.drawn();
    // (the loader goes on a frame the gate left nothing out of, world.js gate: no mesh comes in under the title; 1.5 s at most, past
    // which what is still linking comes in under the title: a software renderer's links took longer, and each of its frames 1.4 s)
    const heldF = renderer.__gate ? renderer.__gate.n.held + renderer.__gate.n.late - held0 : 0;
    if (framesDrawn === 1 && heldF && performance.now() < (cleanBy || (cleanBy = performance.now() + 1500))) { /* drawn again next frame */ }
    else if (framesDrawn < 2 && ++framesDrawn === 2) { firstDrawn(); if (cleanBy) console.info(`warm: the loader waited ${((performance.now() - cleanBy + 1500) / 1000).toFixed(1)} s for a frame the gate left nothing out of${heldF ? ' (and went without it)' : ''}`); }
    else if (framesDrawn === 1) try { performance.mark('oe:frame', { detail: { view: 'game', city: cityId } }); } catch (e) { /* no User Timing */ } // the load's first frame (telemetry.js)
    if (framesDrawn === 1) firstFrame();
    if (!unseenFrame()) updateLabels(); // (the names over the street are placed for the frame drawn: none in a check's frame not drawn)
    requestAnimationFrame(frame);
  }

  // a wet street's reflections (mirror.js): a second render of the scene, given up by shed (above) on
  // a device that can't keep up, and not drawn on a dry street (the weather off: weather.js)
  function mirrorTick() {
    if (mirror) mirror.update(world, clockT);
  }
  // who leaves tracks in lying snow this frame (weather.js tread): you first (on foot or in your car), then the
  // walkers and the cars within 30 m of you
  const treadList = [], treadPool = [];
  function treaders(fx, fy) {
    let k = 0;
    const put = (id, x, y, h, car) => { const o = treadPool[k] || (treadPool[k] = {}); k++; o.id = id; o.x = x; o.y = y; o.h = h; o.car = car; treadList.push(o); };
    treadList.length = 0;
    if (player.mode === 'car' && myCar) put('me', myCar.D.st.x, myCar.D.st.y, myCar.D.st.h, true);
    else if (player.mode === 'foot') put('me', player.x, player.y, player.h, false);
    else put('me', fx, fy, 0, false); // (in the air or aboard: only the trail's frame follows you)
    const R2 = 30 * 30;
    if (crowd && crowd.P) for (let i = 0, n = Math.min(crowd.active, crowd.P.length); i < n && k < 60; i++) { const p = crowd.P[i]; if (p.line >= 0 && p.mode !== 'sit' && (p.x - fx) ** 2 + (p.y - fy) ** 2 < R2) put(i, p.x, p.y, p.h, false); }
    if (cars && cars.C) for (let i = 0; i < cars.C.length && k < 80; i++) { const c = cars.C[i]; if (c.x != null && (c.x - fx) ** 2 + (c.y - fy) ** 2 < R2) put('c' + i, c.x, c.y, c.h, true); }
    return treadList;
  }
  // the weather's frame (weather.js): the rain round the camera, the umbrellas, the sound of it
  function weatherTick(dt, titleOn, idle = titleOn) {
    if (!weather) return;
    // what the weather gave up for a slow device (shed, above, or the last visit's), said once in play
    if (!idle) { const n = weather.takeNote(); if (n) H.toast(n); }
    const fx = player.mode === 'heli' ? heli.st.x : player.mode === 'ferry' ? player.vehicle.x : player.x, fy = player.mode === 'heli' ? heli.st.y : player.mode === 'ferry' ? player.vehicle.y : player.y;
    const fz = player.mode === 'heli' ? heli.st.z + 1 : player.mode === 'ferry' ? 3 : player.z + 1.7;
    weather.groundY = W(fx, fy, Math.max(0, nav.terrain(fx, fy))).y; // (the ground where you are: fog thins above it, lightning strikes down to it)
    weather.update(dt, clockT, W(fx, fy, fz));
    if (weather.tread && OEWeather.S.snowDepth > 0.02) weather.tread(treaders(fx, fy), dt); // tracks in the snow (weather.js)
    const wS = OEWeather.S, inside = player.mode === 'car' || player.mode === 'ride' || player.mode === 'heli';
    if ((sndCoverT -= dt) <= 0 || dt === 0) { sndCoverT = 0.25; sndCover = roofOver(fx, fy, fz); } // (four times a second. Not the weather's answer: it is read from the rain's map, which is drawn only while it rains, lags a walker by its readings and kept its last answer after the rain, so that the roof was once mixed as under a deck and Hachiko's kerb in the rain as one too)
    // the room the street's sound rings in (audio.js place): a lift or a room, high in the open air (a deck, the
    // helicopter), under a roof outside (the viaduct, an arcade), or the open crossing
    if (A.place) A.place(player.mode === 'lift' || room ? 'inside' : fz - Math.max(0, nav.terrain(fx, fy) || 0) > 40 ? 'roof' : sndCover && player.mode === 'foot' ? 'viaduct' : 'open');
    // and the mix of the place (audio.js mix, docs/SOUND.md "The mix, place by place"): a lift or a room, the
    // helicopter's cabin (at its stick, or aboard a story's flight), a car's, under a deck on foot, or the open air at
    // your height over the street, which takes the kerb's mix to the roof's
    const closed = player.mode === 'lift' || !!room || clockT < liftHop, upM0 = Math.max(0, fz - Math.max(0, nav.terrain(fx, fy) || 0));
    sndPlace = closed ? 'lift' : player.mode === 'heli' || clockT - flightSnd < 0.5 ? 'heli' : player.mode === 'car' || player.mode === 'ride' ? 'car' : sndCover && player.mode === 'foot' ? 'deck' : 'kerb';
    if (A.mix) A.mix(titleOn ? 'kerb' : sndPlace, Math.max(0, fz - Math.max(0, nav.terrain(fx, fy) || 0)));
    if (A.lift) A.lift(player.mode === 'lift' || clockT < liftHop ? 1 : 0, clockT < liftHop || (liftRide && liftRide.phase === 'ride') ? 1 : 0);
    if (A.road) A.road(player.mode === 'car' || player.mode === 'ride' ? Math.min(1, Math.abs(player.vehicle && (player.vehicle.D || player.vehicle.drv) ? stOf(player.vehicle).v || 0 : player.speed || 0) / 16) : 0);
    if (crowdDraw && crowdDraw.setRain) crowdDraw.setRain(Math.max(wS.rain, wS.snow * 0.7), wS.snow > wS.rain ? Math.min(1, wS.snow * 2) : wS.wet); // (umbrellas go up in the snow too; one by one as it has rained a while: the street's wetness says how long, people.js wantUmb)
    if (A.rain) A.rain(titleOn || closed ? 0 : wS.rain, sndCover && player.mode === 'foot', inside, player.mode === 'foot' && upM0 < 25 ? Math.min(1, wS.wet * 2) : 0); // (none in a lift or a room; on the street the umbrellas round you, up once it has rained a while)
    // the cicadas of a hot day: from 25 degrees up, by daylight, silent in the rain
    if (A.cicadas) A.cicadas(titleOn || closed ? 0 : Math.max(0, Math.min(1, (wS.temp - 24.5) / 4)) * wS.day * (1 - Math.min(1, wS.rate * 4)) * (inside ? 0.2 : 1));
    if (!weather.onThunder) weather.onThunder = d => { if (A.thunder && $('#g-title').hidden) A.thunder(d, player.mode === 'car' || player.mode === 'ride' || player.mode === 'heli'); };
    // the wind's own sound, from a fresh breeze up, louder in the gusts (the helicopter's rush of air is its own: simulate).
    // The weather's wind is the one at 10 m, and the wind grows with height over a city by the power law (Hellmann's
    // exponent, 0.3 over a city's roofs): on SHIBUYA SKY's deck, 230 m over the street, 2.5 times as strong, and never
    // quite still there. Where the street's sounds are lost below the roof's edge (audio.js reach), the wind is what
    // the deck is heard as, as a game's rooftop is
    const upM = Math.max(0, fz - Math.max(0, nav.terrain(fx, fy) || 0)), upK = Math.pow(Math.max(10, upM) / 10, 0.3), highK = smoothK(40, 200, upM);
    if (A.wind && player.mode !== 'heli') A.wind(titleOn ? 0 : Math.max(Math.max(0, Math.min(1, (wS.windSpeed * upK - 4.5) / 14)), 0.34 * highK) * (inside ? 0.35 : closed ? 0 : 1), wS.gust); // (none in a lift or a room)
  }
  // whose face moves this frame (faceWho, read by faceAfter as each is posed): the one whose line is being said, looking
  // at the player; the player, looking back at them (or with the camera close); and the nearest FACE_NEAR others within FACE_R of the camera, at
  // whomever their head turns to. In the Stop the held world's faces hold too (the afterimages', who move in it, do not)
  const FACE_NEAR = touch ? 1 : 2, FACE_R = touch ? 8 : 14;
  const faceRigOf = who => {
    if (!who) return null;
    if (who.rig && who.rig.face) return who.rig;
    let best = null, bd = 40;
    for (const f of storyFigs) { const d = Math.hypot(f.x - player.x, f.y - player.y); if (f.name && f.name === who.name && f.rig && d < bd) { bd = d; best = f.rig; } }
    if (!best) for (const n of npcs) { const d = Math.hypot(n.x - player.x, n.y - player.y); if (n.name === who.name && n.rig && d < bd) { bd = d; best = n.rig; } }
    return best && best.face ? best : null;
  };
  const faceWas = new Set(); // (the rigs whose faces were in play last frame)
  function faceChoose() {
    faceWho.clear();
    if (!window.OEFace) return;
    const held = !!(story && story.stopped && story.scale === 0);
    const ln = dlg.line, sp = ln ? faceRigOf(ln.npc) : null;
    // (one the talk is with while nothing of theirs is typed, a question put as answers only: they look at the player and wait)
    const tk = !sp && talkCam && talkCam.talk && talkCam.talk.speaker, wait = tk ? faceRigOf(tk) : null;
    const pEye = W(player.x, player.y, player.z + 1.55);
    let spEye = null;
    const near = [];
    const cand = (rig, x, y, z, eye, name, still, looks) => {
      if (!rig || !rig.face || !rig.root.visible) return;
      const at = W(x, y, z + eye);
      if (rig === sp) { spEye = at; faceWho.set(rig, { name, look: pEye, line: { text: ln.text, at: ln.at }, talk: true, held: still }); return; }
      if (rig === wait) { spEye = at; faceWho.set(rig, { name, look: pEye, listen: true, talk: true, held: still }); return; }
      const d = at.distanceTo(camera.position);
      if (d < FACE_R) near.push({ rig, d, o: { name, look: looks, listen: !!(sp && Math.hypot(x - player.x, y - player.y) < 6), held: still } });
    };
    for (const f of storyFigs) cand(f.rig, f.x, f.y, f.z, f.eye || 1.58, f.name, held && !f.ghost, f.want || f.ghost ? pEye : null);
    for (const n of npcs) if (!n.away) cand(n.rig, n.x, n.y, n.z, 1.58, n.name, held, n.rig.lookTarget || null);
    near.sort((a, b) => a.d - b.d);
    for (const c of near.slice(0, FACE_NEAR)) faceWho.set(c.rig, c.o);
    // (the player's own face in a talk, or with the camera close to it: from the chase view it is the back of a head)
    if (player.rig.face && (spEye || W(player.x, player.y, player.z + 1.55).distanceTo(camera.position) < 3.5)) faceWho.set(player.rig, { name: 'Kagami', look: spEye || player.rig.lookTarget || null, listen: !!sp, held: false });
    // A face no longer chosen is put to rest here, not left to its rig's next animate (faceAfter): one whose rig is not
    // animated again (someone gone away, hidden, their frame over) kept its moving geometry and the shapes' texture
    // three.js makes for it, for good. A phone played from the title held 55 of them by frame 7 where one opened at
    // frame 7 holds 16: 19 MB (issue 130).
    for (const r of faceWas) if (!faceWho.has(r)) { faceWas.delete(r); if (r.face && r.face.active) r.face.rest(); }
    for (const r of faceWho.keys()) faceWas.add(r);
  }
  function simulate(dt) {
    faceChoose();
    if (carCome) carComing(dt); // (your car pulling in at the kerb, called: the world's step, so a harness's advance() moves it too)
    // (on a perch, Space or the Time-lapse button held: the evening runs fast, the crowd at its own pace; perch.js warp)
    if (waitRun) waitStep(dt); // (waiting with someone on the wall: the night passes by itself, walktalk.js wait)
    { const wm = perch && !clock.frozen && !waitRun ? perch.warp(dt, keys.has('Space')) : 0; if (wm) { clock.own = true; clock.min += wm; if (clock.min >= 1440) setClock(clock.y, clock.m, clock.d, clock.min); } }
    // the controller: its sticks walk and look as the keys and the mouse do (pad.js); its buttons are keys already
    if (gamepad) {
      const lk = gamepad.look;
      if ((lk.x || lk.y) && player.mode === 'foot' && !photo.on && !closeup && !dlg.holds && !uiOpen()) { const ls = fpOn ? lensTurn() : 1; cam.yawTo = cam.pitchTo = null; cam.yaw += lk.x * 2.6 * dt * ls; cam.pitch = Math.max(fpOn ? -0.6 : -0.25, Math.min(fpOn ? 1.62 : 1.35, cam.pitch + lk.y * 1.7 * dt * ls)); cam.lastInput = clockT; }
    }
    if (D.district && playing && (player.mode === 'foot' || player.mode === 'car') && !inFrame(player.x, player.y, 8)) districtEdge(); // (a phone's district: its edge, said)
    const fwd = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) + joy.y + (gamepad ? gamepad.move.y : 0);
    const side = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) + joy.x + (gamepad ? gamepad.move.x : 0);
    const held = dlg.holds || !!closeup || cine.label === 'hop' || cine.label === 'survey' || cine.label === 'closer' || (cine.active && cine.label === 'overture') || !!(story && story.film);
    const angling = !!fish && !!fish.api && fish.api.on(); // standing with a line out: the rod has the keys
    if (player.mode === 'foot' && angling) { player.speed = 0; gaitChip(player.walking ? 'walk' : 'run'); player.rig.animate(dt, 0, 'ground', clockT); }
    else if (player.mode === 'foot') { const bw = bounds && playing && !held && !player.auto ? bounds.walk(dt, player, cam, fwd, side) : null; walkStep(dt, held ? 0 : bw ? bw.fwd : fwd, held ? 0 : bw ? bw.side : side); if (bw) bounds.walkHold(player, dt, (x, y) => nav.walk(x, y, player.z, true).ok); } // (the planned area's edge: bounds.js)
    else if (player.mode === 'heli') {
      const lift = (k('Space') ? 1 : 0) - (k('KeyC') || k('ShiftLeft') || k('ShiftRight') ? 1 : 0) + touchLift;
      const events = [];
      const hin = { fwd: Math.max(-1, Math.min(1, fwd)), turn: Math.max(-1, Math.min(1, side)), lift: Math.max(-1, Math.min(1, lift)) };
      heli.update(dt, bounds && playing ? bounds.fly(dt, heli.st, hin) : hin, events); // (turned back in an arc at the air's edge: bounds.js)
      if (D.district) { // a phone's district (pipeline/district.py): the helicopter keeps to it, and to the streets still built just past its edge
        const hs = heli.st, bx = Math.max(FRAME.x0 - DISTRICT_AIR, Math.min(FRAME.x1 + DISTRICT_AIR, hs.x)), by = Math.max(FRAME.y0 - DISTRICT_AIR, Math.min(FRAME.y1 + DISTRICT_AIR, hs.y));
        if (bx !== hs.x) { hs.x = bx; hs.vx = 0; }
        if (by !== hs.y) { hs.y = by; hs.vy = 0; }
        if (!inFrame(hs.x, hs.y, -DISTRICT_AIR + 2)) districtEdge();
      }
      for (const ev of events) {
        if (ev.type === 'under_bridge') { H.toast(`<b>Under the ${ev.name || 'bridge'}!</b> ${G.under_bridge_note || ''}`); A.chime(); goals.flewUnder(ev.surface); }
        if (ev.type === 'bump' && clockT - bumpT > 2) { bumpT = clockT; H.toast('Careful! That was a building.'); }
      }
      A.rotor(heli.st.rotor, Math.abs(lift) + Math.abs(fwd) * 0.5);
      A.wind(Math.min(1, heli.st.speed / 60));
      player.rig.reach = heliLap(); // (the hands in the lap, wherever the helicopter now is: heliSit)
      player.rig.animate(dt, 0, 'sit', clockT);
    } else if (player.mode === 'seat') {
      if (perch && perch.seat) { // (each frame: a figure swapped in while you sit, its model come late, sits on the stone too)
        const l = perch.lap(); player.rig.legRake = perch.seat.rake; player.rig.seatH = perch.seat.seat; player.rig.reach = l ? W(...l) : null; // (the hands in the lap, not down through the stone)
      }
      player.rig.animate(dt, 0, 'sit', clockT);
    } else if (player.mode === 'lift') {
      liftStep(dt);
    } else if (player.mode === 'rail') {
      player.rig.animate(dt, 0, 'ground', clockT);
    } else if (player.mode === 'car') {
      carStep(dt, held ? 0 : fwd, held ? 0 : side);
    } else if (player.mode === 'ferry') {
      const v = player.vehicle;
      if (v.helm) v.helm.input = { fwd, turn: side };
      if (v.helm && v.helm.manual && v.helm.started && clockT - v.helm.started > 100) { fer.finishHelm(v); H.toast('The skipper takes over and brings her in.'); }
      A.engine(0.3 + Math.min(1, Math.abs(v.speed) / 9) * 0.7);
      player.rig.animate(dt, 0, 'ground', clockT);
    }
    if (story) dt *= story.scale; // (it slows into the Stop and runs up out of it: story.js)
    if (story && story.stopped && story.scale === 0) dt = 0; // the Stop: you have moved; from here on the world is given no time
    if (fish) fishTick(dt, held ? 0 : Math.max(-1, Math.min(1, side)));
    if (coachHeli) coachHeli.update(dt); // (on into the step out, once landed)
    if (bounds && bounds.tick) bounds.tick(clockT, !sun || sun.altitude < 3); // (the road works' lamps blink)
    if (player.mode !== 'heli') { heli.update(dt, {}, []); A.rotor(heli.st.rotor * Math.max(0, 1 - Math.hypot(heli.st.x - player.x, heli.st.y - player.y) / 300)); }
    if (player.mode !== 'heli') { heliHomeStep(dt); heliToPad(); }
    if (waitFerry && (player.mode !== 'foot' || !nearWharf(player.x, player.y, 40))) waitFerry = null;
    const wantTo = waitFerry && rideTarget(waitFerry);
    const here = waitFerry && fer.vessels.find(q => fer.stopOf(q) === waitFerry && (!wantTo || q.stops.includes(wantTo)));
    if (here) { waitFerry = null; H.toast(`${here.name} is alongside. <kbd>E</kbd> to board.`); }
    fer.update(dt, skip && player.mode === 'ferry' ? FERRY_SKIP : 1, clockT, waitFerry ? FERRY_WAIT : 1);
    if (trains) trains.update(dt, camera);
    if (rail) {
      if (waitRail && (player.mode !== 'foot' || railStation(player.x, player.y, 25, player.z) !== waitRail || rail.cars.some(c => rail.stationOf(c.id) === waitRail))) { if (player.mode === 'foot' && railStation(player.x, player.y, 25, player.z) === waitRail) H.toast(`The train is in. <kbd>E</kbd> to board.`); waitRail = null; }
      rail.ear = { x: camera.position.x, y: -camera.position.z }; // (the trains' detail is by the camera: in a film it is not where you stand)
      if (rail.crossingClosed) { // (a crossing's alarm starting beside you: said once)
        const xc = player.mode === 'foot' ? rail.crossingClosed(player.x, player.y, 12) : null;
        if (xc && xc !== nearXing) H.toast(xc.arms.length ? 'The crossing is closing: wait behind the barrier until the train has passed.' : 'A train is coming: keep off the rails.');
        nearXing = xc;
      }
      rail.update(dt, clockT, [player.mode === 'foot' ? player : null, ...npcs], (player.mode === 'rail' && skip) || !!waitRail);
      for (const ev of rail.events.splice(0)) {
        if (player.mode !== 'rail') continue;
        const car = player.vehicle;
        if (ev.car && ev.car !== car) continue;
        if (ev.type === 'depart') car.moved = true;
        if (ev.type === 'arrive' && car.moved) {
          const st = rail.stationOf(car.id);
          skip = false;
          if (st && st.under) { alightRail(); viewBlend.t = 1; cam.distTo = 0; cam.mode = 'chase'; cam.dist = FOOT.dist; cam.pitch = FOOT.pitch; cam.yaw = player.h; H.toast(`${st.name}. ${st.under.text || 'Up the stairs to the street.'}`); } // (out of sight under the ground: up to its street at once)
          else H.toast(`${st.name}. <kbd>E</kbd> to get off.`);
        }
      }
      // in the tunnel (a ride to or from a station under the ground): the view veiled, the clock run on to the next station
      if (trains && trains.veil) {
        const c = player.mode === 'rail' ? player.vehicle : null, dark = !!(c && c.train && rail.hidden && rail.hidden(c));
        if (dark) { const nx = rail.nextStop(c); skip = true; trains.veil(true, `<div><div style="opacity:.7;font-size:12px;text-transform:uppercase;letter-spacing:.16em">${c.line || 'The train'} · in the tunnel</div><div style="font-size:20px;margin-top:6px">${nx ? `Next: ${nx.name}` : rail.towards(c)}</div></div>`); }
        else if (trains.veiled) trains.veil(false);
      }
      if (player.mode === 'rail') { // standing in the car, by the downhill window
        const c = player.vehicle;
        const q = rail.riderPos && rail.riderPos(c);
        // (a train leaving the map: off at its last station here, as its doors close)
        if (c.train && c.moved && rail.stationOf(c.id) && !rail.nextStop(c) && rail.departsIn(c) < 2) { H.toast(`${rail.stationOf(c.id).name} is the last stop on this map: the train goes on to ${rail.towards(c)}.`); alightRail(); }
        else if (q) { player.x = q.x; player.y = q.y; player.z = q.z; player.h = q.h + Math.PI; } // in a gondola cabin, in a train
        else { player.x = c.x + Math.sin(c.h) * 3; player.y = c.y + Math.cos(c.h) * 3; player.z = c.z + 0.6 + Math.sin(c.pitch) * 3; player.h = c.h + Math.PI; }
      }
    }
    if (player.mode === 'ferry') { // stand on the upper deck
      const v = player.vehicle, c = Math.cos(v.h), s = Math.sin(v.h), D = fer.deck;
      player.x = v.x + s * D.fwd + c * D.right; player.y = v.y + c * D.fwd - s * D.right; player.z = D.up; player.h = v.h;
      if (v.phase === 'dwell') skip = false;
    }
    carsTick(dt);
    if (player.mode !== 'heli' && player.mode !== 'car' && player.mode !== 'ride') { player.rig.root.position.copy(W(player.x, player.y, player.z)); player.rig.root.rotation.y = Math.PI - player.h;
      // on a stair or an escalator the floor walked on is the slope under the steps: the feet are set on the tread, not in it
      // (a stair: the tread you are over, its top the slope's height at its upper edge; an escalator, whose treads are not
      // modelled moving: most of a riser up)
      const stp = player.mode === 'foot' && player.ground ? nav.strips.find(q => q.name === player.floor && q.profile) : null;
      if (stp) {
        const u = (player.x - stp.origin[0]) * stp.axis[0] + (player.y - stp.origin[1]) * stp.axis[1], P = stp.profile, T = 0.4;
        const kAt = uu => { for (let i = 0; i < P.length - 1; i++) if (uu >= P[i][0] && uu <= P[i + 1][0]) return (P[i + 1][1] - P[i][1]) / Math.max(1e-3, P[i + 1][0] - P[i][0]); return 0; };
        // (an escalator's: the steepest of the slope here and a step ahead, so the feet go up onto the first riser as it
        // rises under them, not 0.23 m into it while the slope has yet to begin)
        const k = stp.moving_ms ? [0, 0.1, 0.2, 0.3].map(d => kAt(u + d)).reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0) : kAt(u);
        if (Math.abs(k) > 0.25) player.rig.root.position.y += stp.moving_ms ? Math.abs(k) * T * 0.8 : Math.abs(k) * (k > 0 ? Math.ceil(u / T) * T - u : u - Math.floor(u / T) * T);
      }
    }
    // The map's named people. Alone they wait as who they are waits (people.js idleClip: never a gesture to nobody; now
    // and then a look round, rig.waits), and the one thing they do for you is look: their head comes round to you from
    // nine metres, and their body only as far as the head cannot reach. Talked to, they face you and talk; in a talk of
    // several (walktalk.js say), whoever is not speaking listens, turned between the speaker and you, eyes on the speaker;
    // and with a question of yours up (dlg.hasChoices) the one who asked it listens for your answer
    let gaze = null;
    for (const n of npcs) {
      if (n.away) continue; // (the walk's own, while it is not the walk)
      const d = Math.hypot(player.x - n.x, player.y - n.y), foot = player.mode === 'foot';
      const to = n.listening && !n.talking && !n.listening.away ? n.listening : null; // (the one they listen to)
      if (foot && !n.sit && !n.walkSpeed && ((!n.stand && !n.fixed) || n.talking)) { // (not while walking: walktalk.js events; one stood at an exact place facing its way, or held by the walk's line looking elsewhere (n.fixed), turns only to talk)
        const want = to ? Math.atan2((to.x + player.x) / 2 - n.x, (to.y + player.y) / 2 - n.y) : Math.atan2(player.x - n.x, player.y - n.y);
        const off = angDiff(want, n.h), reach = n.talking || to ? 0 : 1.0; // (alone: what the head cannot take, 57 degrees each way)
        if ((n.talking || to || d < 5) && Math.abs(off) > reach) n.h += (off - Math.sign(off) * reach) * Math.min(1, dt * (reach ? 2 : 4));
      }
      n.rig.root.rotation.y = Math.PI - n.h;
      // look at the player when close (at the speaker while listening); the player looks at whoever they are talking to
      n.rig.waits = true;
      n.rig.lookTarget = to ? n.eyes.copy(W(to.x, to.y, to.z + 1.55)) : d < 9 && foot && !n.fixed ? n.eyes.copy(W(player.x, player.y, player.z + 1.55)) : null;
      if (n.talking) gaze = W(n.x, n.y, n.z + 1.55);
      const mode = n.sit ? 'sit' : n.talking ? (dlg.hasChoices ? 'listen' : 'talk') : to ? 'listen' : 'ground';
      n.rig.animate(dt, n.walkSpeed || 0, mode, clockT + n.pitch);
    }
    player.rig.lookTarget = gaze;
    if (visitors) visitors.update(dt, clockT, { x: camera.position.x, y: -camera.position.z, z: camera.position.y }, !story || (walk && walkUi.walking)); // (the people a place keeps: near the camera only)
    const cx = player.mode === 'heli' ? heli.st.x : player.x, cy = player.mode === 'heli' ? heli.st.y : player.y;
    npcStream(dt, cx, cy);
    crowd.bodies = crowdKeep(cx, cy, false, dt);
    if (regulars && (!story || (walk && walkUi.walking))) regulars.tick(dt); // (before the crowd's step: whoever is lent to a routine knows where to be)
    crowd.update(dt, cx, cy, clockT, player.mode === 'foot' ? player : player.mode === 'car' ? { x: player.x, y: player.y, h: player.h, speed: myCar.D.st.v, r: 1.1 } : null);
    if (colonies.length) {
      const L = dayLimits();
      for (const c of colonies) c.update(dt, { min: clock.min, sunset: L.sunset, sunrise: L.sunrise }, cx, cy, U.uNight.value);
      // on the viewing platform after dark, the colony's rule for visitors
      const c0 = colonies[0].colony;
      if (!viewingNoted && player.mode === 'foot' && player.floor === 'pier' && sun && sun.altitude < 0 && c0.viewing_note && c0.viewing.some(p => Math.hypot(p[0] - player.x, p[1] - player.y) < 40)) { viewingNoted = true; H.toast(c0.viewing_note); }
    }
    for (const f of flocks) f.update(dt, cx, cy, player.mode === 'foot', U.uNight.value);
    benchBudget += dt * 60; // keep what the benches near the player offer up to date, about 60 a second
    if (benchBudget >= 1) { benches.refresh(benchLit, cx, cy, CR.radius_m || 450, Math.floor(benchBudget)); benchBudget -= Math.floor(benchBudget); }
    // the traffic brakes for you on foot and for your car, and swings out round a car pulled in at the kerb
    const blockers = player.mode === 'foot' ? [player] : [];
    for (const n of npcs) if (Math.abs(n.x - cx) < 700 && Math.abs(n.y - cy) < 700) blockers.push({ x: n.x, y: n.y, z: n.z, fixed: true }); // (they stand their ground)
    // your car and a ride: the traffic won't drive into them, nor the crowd walk through them. A ride on
    // the move is left to its driver (soft: the traffic doesn't wait on it), so that one swinging out
    // round a queue and a car coming the other way never wait on each other for good
    cars.extra.length = 0;
    if (rail && rail.trainBoxes) { // a railway, to the traffic: each body of its trains (a closed crossing is junctions.js addRail's, above)
      for (const b of rail.trainBoxes()) if (Math.abs(b.x - cx) < 700 && Math.abs(b.y - cy) < 700) cars.extra.push({ id: 'train', x: b.x, y: b.y, z: b.z, h: b.h, half: b.hl + 0.4, hw: b.hw + 0.3, v: 0, line: 0, top: b.top, soft: false, ps: null, np: 0, mv: null, live: true });
    }
    for (const o of [myCar, ride]) if (o) {
      // (your car with the autopilot at its wheel is read as a ride with you in it is: by its driver's own state, its way
      // ahead and its way across a junction, under its own name, so that a ride near it is still told from it)
      const R = o === ride ? ride : pilot && !pilot.join ? pilot : null, st = R ? R.drv.st : stOf(o), id = o === ride ? 'ride' : R ? 'pilot' : 'car';
      // (a ride on its way, stopped for a moment, is not parked: the traffic gives way to it, or not, by the rule
      // it reads of a ride on the move, as the ride reads it, never one by one rule and the other by another)
      // (on its way to you, a ride is left to its own driver as before, soft: the traffic doesn't wait on it,
      // so that it comes in good time; with you in it, it is read by the rule, never stepped into)
      // (and one coming for you, stopped on its way, is not parked either: read so, a car crossing a junction in front
      // of it stood for it as for a car parked across its bonnet while the ride waited for that car, #243)
      const live = !!R && !st.done && (R.phase === 'driving' || R.phase === 'leaving' || (R.phase === 'coming' && !R.turn)), soft = o === ride && ride.phase === 'coming' && Math.abs(st.v) >= 0.3;
      // (turning round in the road: its way is no way ahead, so it goes to the traffic with none, and a car whose way it
      // is across waits for it, never first by the give-way rule, nor swung round it as round a parked car)
      const turning = !!R && !!R.turn;
      blockers.push({ id, x: st.x, y: st.y, z: st.z, half: o.C.half, hw: o.C.hw, parked: !turning && Math.abs(st.v) < 0.3 && !live && (o === ride || player.mode !== 'car'), q: !!R && !!st.q, qBy: R ? st.qBy : null });
      if (turning) {
        const gm = 0.7; // (turning round, a wide berth: a car creeping up to it at an angle touched it, Sydney, and one met a three-point turn in Shinjuku)
        cars.extra.push({ id, x: st.x, y: st.y, z: st.z, h: st.h, half: o.C.half + gm, hw: o.C.hw + gm, v: 0, line: 0, top: o.C.top, soft: false, ps: null, np: 0, mv: null, live: true });
        // (backing out of a one-way street: where it goes next too, every 6 m of its way back from 3 m on, and where it stops backing,
        // in the mouth of the junction behind, so that a car crossing that junction, or turning into the street, stops
        // short of it rather than in its way, each then waiting for the other, #283)
        const T = R.turn;
        const stopAt = T.rev ? T.poses.findIndex(p => p.stop) : -1, aheads = [];
        if (T.rev) { for (let a = 12; T.i + a < stopAt; a += 24) aheads.push(a); aheads.push(stopAt - T.i); }
        for (const ahead of aheads) { if (!(ahead > 0)) continue; const q = T.poses[Math.min(T.poses.length - 1, T.i + ahead)]; if (q !== T.poses[T.i]) cars.extra.push({ id, x: q.x, y: q.y, z: st.z, h: q.h, half: o.C.half + 0.3, hw: o.C.hw + 0.3, v: 0, line: 0, top: o.C.top, soft: false, ps: null, np: 0, mv: null, live: true, ahead: true }); }
        continue;
      }
      // (a ride with its way ahead, its movement through a junction and its line, which the traffic reads to
      // give way to it or not, as it reads its own cars: actors.js first)
      const x = { id, x: st.x, y: st.y, z: st.z, h: st.h, half: o.C.half, hw: o.C.hw, v: Math.max(0, st.v), line: 0, top: o.C.top, soft };
      if (R && !soft) Object.assign(x, { ps: st.ps, np: st.np || 0, pst: st.pst, mv: st.mv || null, mvT: st.mvT, toLine: st.toLine, live, q: !!st.q, qBy: st.qBy || null, xBlock: st.xBlock || null, block: st.block || null });
      cars.extra.push(x);
    }
    // and the helicopter set down on the road (heliBlock): stood in the way as a car stopped there with nobody coming back to it
    // is, its whole footprint (its rotor's reach while it turns), never driven into: every car's way ahead is read against it
    // (live, as a car stopped in its way, not one parked at the kerb to swing out round by a straight line from its bonnet,
    // which a car turning across the crossing missed), and one waits at its line rather than go in where it stands; the crowd
    // steps out of it as out of a car (actors.js, an api.extra's box)
    // (a car caught under it as it came down, and only that one, drives on out from under it rather than stand there: heliFree,
    // the cars inside its footprint the moment it became one, each let go of once it is out; one that crept up to its edge later
    // and was let through as being inside drove in under the rotor)
    { const hb = heliBlock();
      if (!hb) heliFree = null;
      else {
        // (any of it under it: the two boxes overlap, by their four axes; a car alongside, its side over the edge, its corners and
        // middle all outside, was not counted and drove out under the rotor's edge)
        const boxesOverlap2 = (A, B) => { for (const P of [A, B]) for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4], nx = b[1] - a[1], ny = a[0] - b[0];
          let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (const q of A) { const d = q[0] * nx + q[1] * ny; a0 = Math.min(a0, d); a1 = Math.max(a1, d); } for (const q of B) { const d = q[0] * nx + q[1] * ny; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
          if (a1 <= b0 || b1 <= a0) return false; } return true; };
        const rect = (x, y, h, hl, hw) => { const ux = Math.sin(h), uy = Math.cos(h); return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([u, v]) => [x + ux * hl * u - uy * hw * v, y + uy * hl * u + ux * hw * v]); };
        const HB = rect(hb.x, hb.y, hb.h, hb.half, hb.hw), inside = c => boxesOverlap2(HB, rect(c.x, c.y, c.h, c.half, c.hw || 0.9));
        if (!heliFree) heliFree = new Set(cars.live.filter(c => c.line >= 0 && Math.abs(c.z - hb.z) < 3 && inside(c)));
        else for (const c of heliFree) if (c.line < 0 || !inside(c)) heliFree.delete(c);
        cars.extra.push(Object.assign(hb, { v: 0, line: 0, soft: false, ps: null, np: 0, mv: null, live: true, free: heliFree }));
      } }
    // the weather as drivers meet it (cars.js setWeather): the traffic, the rides and your own tyres read it from there;
    // headlamps on by day in rain, snow or fog
    (U.uLamps || (U.uLamps = { value: 0 })).value = OECars.setWeather(weather ? (window.OEWeather && OEWeather.S) || weather.state : null).lamps; // (the weather's one state, weather.js S: grip, wet, visibility)
    cars.update(dt, cx, cy, clockT, blockers);
    // on a wet road the cars near you throw up spray behind their wheels (cars.js sprayStep: nothing made until it first rains)
    if (OECars.weather.spray >= 0.25 || OECars.sprayState()) {
      sprayCars.length = 0;
      for (const c of cars.live) if (c.v > 5) sprayCars.push(c);
      for (const o of [myCar, ride]) if (o) { const st = stOf(o); sprayCars.push({ x: st.x, y: st.y, z: st.z, h: st.h, v: Math.abs(st.v), hw: o.C.hw, half: o.C.half }); }
      OECars.sprayStep(dt, { world, cars: sprayCars, eye: camera, night: U.uNight.value });
    }
    // a driver getting out of your car's way sounds its horn, fainter the farther off (actors.js DODGE_T)
    // (each from its car, through the air: a honk at you in the road below is not heard on a roof, audio.js reach)
    for (const h of cars.honks.splice(0)) {
      const P = A.reach ? A.reach({ x: h.x, y: h.y, z: (h.z || 0) + 1 }, { x: camera.position.x, y: -camera.position.z, z: camera.position.y }) : { d: h.d, g: 1, fc: 20000 };
      if (P.d < 90) A.honk(Math.max(0.15, 1 - P.d / 40) * Math.min(1, (90 - P.d) / 40) * 0.8 * P.g, h.bus ? 0.72 : 0.9 + Math.random() * 0.2, P.fc);
    }
    if (shows) shows.update(dt, player, clockT);
    if (places) {
      // the area caption waits for a quiet screen: no conversation, menu, map, phone, photo mode or
      // onboarding (anything marked data-hush that is showing holds it too)
      const active = player.mode === 'foot' && !cine.active;
      const calm = active && !dlg.open && !uiOpen() && phone.el.hidden && !photo.on && !document.querySelector('[data-hush]:not([hidden])');
      places.update(dt, player.x, player.y, player.z, active, calm);
    }
    if (doors && doors.doors.length) {
      // (you open them: the locals stand or sit where they are, and one at a table near the door
      // mustn't hold it open)
      doors.update(dt, [player.mode === 'foot' || player.mode === 'seat' ? player : null]); // (seated in the stalls, the curtain stays up)
      const r = player.mode === 'foot' || player.mode === 'seat' ? doors.roomAt(player.x, player.y, player.z) : null;
      if (r !== room) { if (r && !cine.active) H.toast(`<b>${r.name}</b>${r.note ? `<span>${r.note}</span>` : ''}`); room = r; if (window.OEVis) OEVis.hold('room', !!r); }
    }
  }

  // on foot, m/s: a stroll, the default run (Kagami's run clip is cut at 5.4 to 5.8 m/s, so it plays
  // near its own pace and the feet keep to the ground) and a sprint while Shift is held
  const GAIT = { walk: 1.4, run: 6, sprint: 8.5 };
  function walkStep(dt, fwd, side) {
    if (player.auto && player.auto.t > 0.2 && Math.hypot(fwd, side) > 0.3) { const a = player.auto; player.auto = null; if (a.cancel) a.cancel(); } // moving off cancels it
    if (player.auto) { // walking up to a door
      const a = player.auto, dx = a.x - player.x, dy = a.y - player.y, d = Math.hypot(dx, dy);
      a.t += dt;
      if (d < 0.7 || a.t > 5) { player.auto = null; a.then(); return; }
      fwd = 1; side = 0;
      player.h += angDiff(Math.atan2(dx, dy), player.h) * Math.min(1, dt * 8);
      const sp = 2.2, nx = player.x + Math.sin(player.h) * sp * dt, ny = player.y + Math.cos(player.h) * sp * dt, w = nav.walk(nx, ny, player.z, true);
      if (w.ok) { const c = OECars.pushOut(nx, ny, w.z, 0.35, carBoxes(nx, ny, 6)), o = posts.pushOut(c.x, c.y, 0.35, w.z); player.x = o.x; player.y = o.y; player.z = w.z; } else a.t = 9;
      player.rig.animate(dt, sp, 'ground', clockT);
      return;
    }
    const m = Math.min(1, Math.hypot(fwd, side));
    const run = k('ShiftLeft') || k('ShiftRight');
    // (and with a stick, how far it is pushed is how fast you go: to three quarters of the way a walk, its pace with the push,
    // and past that on to a run at the edge, so a phone needs no Run button. Pushed all the way, as a key is, a run)
    const pace = GAIT.walk * Math.min(1, m / 0.75) + (GAIT.run - GAIT.walk) * Math.max(0, (m - 0.75) / 0.25);
    const target = m > 0.05 ? (fpOn ? GAIT.walk * m : run ? GAIT.sprint * m : player.walking ? GAIT.walk * m : pace) : 0; // run, walk (X) or sprint (hold Shift); with the camera at your eye, a walk
    gaitChip(m > 0.05 ? (run ? 'sprint' : player.walking || m < 0.75 ? 'walk' : 'run') : player.walking ? 'walk' : 'run');
    player.speed += (target - player.speed) * Math.min(1, dt * (target > player.speed ? 6 : 10));
    if (m > 0.05) {
      let dir = cam.yaw + Math.atan2(side, fwd);
      // (pressed on slantwise into a wall or a glass, the body turns to the way the wall lets it go, as a person does: faced
      // into it while the feet slid along, the hand on that side swung into it. For as long as the way pressed is the same)
      if (player.along && clockT < player.along.until && Math.abs(angDiff(dir, player.along.dir)) < 0.3) dir = player.along.h;
      player.h += angDiff(dir, player.h) * Math.min(1, dt * 10);
    }
    // move as Unreal's CharacterMovementComponent does: sweep the capsule and slide along the
    // walls it meets, then check the floor where it ends up (water, a drop). At the seawall,
    // where the floor check fails, try one axis at a time.
    const sx = Math.sin(player.h) * player.speed * dt, sy = Math.cos(player.h) * player.speed * dt, x0 = player.x, y0 = player.y;
    let moved = 0;
    for (const [mx, my] of [[sx, sy], [sx, 0], [0, sy]]) {
      if (!mx && !my) continue;
      const m = nav.slide(player.x, player.y, player.z, mx, my);
      // an escalator's balustrades hold whoever is on its steps: between its two landings nobody leaves them sideways.
      // (Its glass is no wall, standing closer to the steps than a body is wide, and the drop beside the steps was to
      // do it; but where a floor or a stair lay within a step's reach of them a walker stepped off, into the slot
      // between the escalator and the stair, and stood in the balustrade)
      if (player.ground) for (const s of nav.strips) {
        if (!s.moving_ms) continue;
        const [u0, v0] = nav.stripUV(s, player.x, player.y), h = nav.stripHeight(s, player.x, player.y), lim = s.half_width - 0.03, end = s.us[s.us.length - 1];
        if (h == null || Math.abs(h - player.z) > 0.3 || u0 < s.us[0] + 0.5 || u0 > end - 0.5) continue;
        const [, v] = nav.stripUV(s, m.x, m.y);
        if (Math.abs(v) > lim) { const dv = v - Math.sign(v) * Math.max(lim, Math.min(Math.abs(v0), s.half_width)); m.x += s.axis[1] * dv; m.y -= s.axis[0] * dv; }
        break;
      }
      const w = nav.walk(m.x, m.y, player.z, true);
      if (w.ok) {
        moved = Math.hypot(m.x - player.x, m.y - player.y);
        player.x = m.x; player.y = m.y;
        if (player.ground && w.z < player.z - 0.6) player.ground = false; // stepped off an edge: fall
        player.floorZ = w.z; player.floor = w.kind;
        break;
      } else if (w.why === 'nogo' && clockT - waterT > 20) { waterT = clockT; H.toast(colonies[0] ? colonies[0].colony.keep_off_note : 'Keep out.');
      } else if (w.why === 'water' && clockT - waterT > 20) { waterT = clockT; H.toast(`No swimming in ${G.water_name || 'the water'}.${G.wharves.length ? ' Ferries leave from the wharves marked F.' : ''}`); }
    }
    // and a body comes to a wall or a glass with its stride ahead of it: the foot and hand that lead a walk reach a
    // hand's width past the capsule, a run's a forearm, and the clip eases to a stand in 0.3 s. So the middle stops
    // that much short of whatever is ahead along the way it goes (tools/glass_body.js: feet 0.2 m, hands 0.1 m into the
    // escalator's glass and the walls, walked or run at); along a wall, only the part of it the wall takes away
    if (moved > 0 && target > 0) {
      const lead = Math.min(0.28, 0.08 + 0.03 * target), hx = Math.sin(player.h) * lead, hy = Math.cos(player.h) * lead;
      const a = nav.slide(player.x, player.y, player.z, hx, hy), bx = player.x + hx - a.x, by = player.y + hy - a.y;
      const bl = Math.hypot(bx, by);
      if (a.hit && bl > 1e-3 && nav.walk(player.x - bx, player.y - by, player.z, true).ok) {
        player.x -= bx; player.y -= by;
        // (what was gained along the wall: the step into it and back out again is no walk, and counted as one the clip
        // trod on the spot at a third of its pace)
        const dx = player.x - x0, dy = player.y - y0, dn = (dx * bx + dy * by) / bl;
        moved = Math.sqrt(Math.max(0, dx * dx + dy * dy - dn * dn));
      }
      // and to someone stood ahead, one of the map's people or the story's: the hand that leads the stride reached 2 to 4.5 cm
      // into a back or an arm in the frame the middle stopped at their shoulder, from every side and deepest at a run
      // (tools/clip_people.js, issue 157). The point the stride reaches is kept out of them as the middle is, so the middle
      // stops that much short of them along the way it goes, and slides round them as before where it only passes
      { let px = player.x + hx, py = player.y + hy, hit = false;
        posts.near(px, py, 0.35, q => { if (q.kind !== 'npc' && q.kind !== 'story') return;
          const dx = px - q.x, dy = py - q.y, d = Math.hypot(dx, dy), m = q.r + 0.35 - d;
          if (m > 0 && d > 1e-6) { px += dx / d * m; py += dy / d * m; hit = true; } }, player.z);
        const nx = px - hx, ny = py - hy;
        if (hit && nav.walk(nx, ny, player.z, true).ok) { player.x = nx; player.y = ny; moved = Math.hypot(player.x - x0, player.y - y0); } }
    }
    // cars are solid too: out of any the move went into, or one that drove into you (back where you
    // were if that is a wall), and then out of the lamp posts and trunks, which a car can't shove you into
    const boxes = carBoxes(player.x, player.y, 6);
    if (boxes.length) {
      let o = OECars.pushOut(player.x, player.y, player.z, 0.35, boxes);
      if (o.hit) {
        o = posts.pushOut(o.x, o.y, 0.35, player.z);
        if (nav.walk(o.x, o.y, player.z, true).ok) { player.x = o.x; player.y = o.y; } else { player.x = x0; player.y = y0; }
        moved = Math.hypot(player.x - x0, player.y - y0);
      }
    }
    // and so are people: a step into someone stops at their shoulder (a step away from someone you already stand
    // against is let go). In the Stop above all, where nobody can make way
    for (let k = 0; k < 3; k++) {
      const i = crowd.nearest(player.x, player.y, 0.55);
      if (i < 0) break;
      const q = crowd.P[i], dx = player.x - q.x, dy = player.y - q.y, d = Math.hypot(dx, dy) || 1e-3, d0 = Math.hypot(x0 - q.x, y0 - q.y);
      if (Math.abs((q.z ?? player.z) - player.z) > 2 || (d0 < 0.55 && d >= d0)) break;
      const nx = q.x + dx / d * 0.55, ny = q.y + dy / d * 0.55;
      if (nav.walk(nx, ny, player.z, true).ok) { player.x = nx; player.y = ny; } else { player.x = x0; player.y = y0; }
      moved = Math.hypot(player.x - x0, player.y - y0);
    }
    // and the guide: he is asked to make way at once (companion.js keepOff, which moves him off you whenever he can),
    // and where a wall holds him and he cannot, a step into his flank stops at it, in this same frame
    { const gd = guideMade; if (gd && gd.makeWay && gd.root && gd.root.visible) gd.makeWay();
      if (gd && gd.jammed && gd.spineNear && gd.root && gd.root.visible) {
      const [cx, cy] = gd.spineNear(player.x, player.y), dx = player.x - cx, dy = player.y - cy, d = Math.hypot(dx, dy) || 1e-3, need = gd.clearance;
      if (d < need) { const nx = cx + dx / d * need, ny = cy + dy / d * need; if (nav.walk(nx, ny, player.z, true).ok) { player.x = nx; player.y = ny; } else { player.x = x0; player.y = y0; } moved = Math.hypot(player.x - x0, player.y - y0); }
    } }
    // and someone who has come to stand where you are (one of the story's people set down or walked there, a map's NPC
    // back at its place): you step out of them at a walk, with or without a key held (issue 126)
    { const o = posts.pushOut(player.x, player.y, 0.3, player.z);
      if (o.hit && (o.hit.kind === 'npc' || o.hit.kind === 'story')) {
        const dx = o.x - player.x, dy = o.y - player.y, d = Math.hypot(dx, dy), s = Math.min(d, GAIT.walk * dt);
        if (d > 1e-3 && nav.walk(player.x + dx / d * s, player.y + dy / d * s, player.z, true).ok) { player.x += dx / d * s; player.y += dy / d * s; moved = Math.max(moved, s); }
      } }
    if (dt > 0) player.speed = Math.min(player.speed, moved / dt); // the speed is what the move achieved, so the walk cycle slows against a wall
    if (m > 0.05 && player.ground) { // (a wall slantwise across the way pressed: a short step that way slides off it, and the way it slides is the way faced)
      const dir = cam.yaw + Math.atan2(side, fwd), q = nav.slide(player.x, player.y, player.z, Math.sin(dir) * 0.15, Math.cos(dir) * 0.15);
      const dx = q.x - player.x, dy = q.y - player.y, went = Math.atan2(dx, dy);
      if (q.hit && Math.hypot(dx, dy) > 0.02 && Math.abs(angDiff(went, dir)) > 0.1) player.along = { h: went, dir, until: clockT + 0.25 };
    }
    // an escalator (a surface with moving_ms) carries whoever stands on its moving stretch along its axis; the
    // steps take you through whatever stands beside them (a well's rim, the floor you come up through). Where its
    // flat ends lie flush with a floor a hair higher than them (a landing's stone, a deck's boards), the floor is
    // the one stood on, yet the steps under it still carry you
    // (and at its far end it sets you down on the landing, as the steps going under the comb do: on past the
    // strip's end by a metre where the floor takes you, so that no one is left standing on the comb)
    const esc = player.ground && (nav.strips.find(s => s.moving_ms && s.name === player.floor) ||
      nav.strips.find(s => { if (!s.moving_ms) return false; const h = nav.stripHeight(s, player.x, player.y); return h != null && Math.abs(h - player.z) < 0.15; }) ||
      (player.escOff && player.ground ? player.escOff : null));
    if (esc) {
      const [u] = nav.stripUV(esc, player.x, player.y), mu = esc.moving_u || [-Infinity, Infinity], end = esc.us[esc.us.length - 1] + 1.0;
      player.escOff = u > mu[1] && u < end ? esc : null;
      if (u >= mu[0] && u < end) {
        const nx = player.x + esc.axis[0] * esc.moving_ms * dt, ny = player.y + esc.axis[1] * esc.moving_ms * dt;
        if (nav.stripHeight(esc, nx, ny) != null) { player.x = nx; player.y = ny; } else if (u > mu[1]) {
          const w = nav.walk(nx, ny, player.z, true);
          if (w.ok && Math.abs(w.z - player.z) < 0.15) { player.x = nx; player.y = ny; } else player.escOff = null;
        }
      }
      // (and on the steps you stand on a step, not half off it: the strip is the steps' whole width and the glass stands
      // just past it, so a body that stepped on at its side rode the whole way with a shoulder in the glass; drawn in,
      // eased, to within 0.2 m of the middle, a hand's width clear of the glass)
      if (u >= esc.us[0] && u <= esc.us[esc.us.length - 1]) {
        const [, v] = nav.stripUV(esc, player.x, player.y), keep = Math.max(0, Math.min(0.2, esc.half_width - 0.3)), dv = Math.max(-keep, Math.min(keep, v)) - v;
        if (Math.abs(dv) > 1e-4) { const e = 1 - Math.exp(-dt / 0.12); player.x += -esc.axis[1] * dv * e; player.y += esc.axis[0] * dv * e; }
      }
    } else player.escOff = null;
    // (and out of an escalator's glass when not moving too: put there, or stood still as the steps carry you)
    if (player.ground) { const q = nav.paneOut(player.x, player.y, player.x, player.y, player.z); if (q && nav.walk(q[0], q[1], player.z, true).ok) { player.x = q[0]; player.y = q[1]; } }
    const f = nav.floorAt(player.x, player.y, player.z);
    const floorZ = f ? f.z : player.z;
    if (f) player.floor = f.kind;
    if ((k('Space')) && player.ground) { player.vz = 5.2; player.ground = false; }
    if (!player.ground) {
      player.vz -= 14 * dt;
      player.z += player.vz * dt;
      if (player.z <= floorZ) { player.z = floorZ; player.vz = 0; player.ground = true; }
    } else {
      player.z += (floorZ - player.z) * Math.min(1, dt * 18); // steps and slopes
      if (floorZ < player.z - 0.6) player.ground = false;
    }
    player.rig.animate(dt, player.ground ? player.speed : 0, player.ground ? 'ground' : 'air', clockT);
    // footsteps on the beat of the walk cycle
    const ph = Math.floor(player.rig.phase / Math.PI);
    if (ph !== stepPhase && player.ground && player.speed > 0.5) A.step();
    stepPhase = ph;
  }

  // The camera: the title orbit, then the rig (chase or bird's-eye) unless a shot is
  // playing. Shots get the rig's live pose, so they can land exactly where it is.
  const titleLook = new THREE.Vector3(), live = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), half: 170 };
  // The title orbit, round a point near the start, ORBIT.r out and ORBIT.h up: from the bearing with
  // the most open foreground (openYaw) or, after a loading flyover, from the video's last frame
  // (FLY_END, where tools/flyover.js ends it: 420 m south and 210 m up, the orbit the videos were
  // made under), easing out to the orbit's own radius and height.
  // (arriving at a district: a closer orbit, so its own streets fill the title and not the skyline beyond)
  const ORBIT = DISTRICT ? { r: 300, h: 115 } : { r: 470, h: 150 }, FLY_END = { yaw: 0, r: 420, h: 210 };
  let titleYaw0 = 0, titleYaw = null, titleR = ORBIT.r, titleH = ORBIT.h, flyCam = null, titleT = 0;
  if (OPENING) { titleR = openingView().r; titleH = OPENING.h; } // (no ease into the opening's own height on the first frame)
  // A mark for each of the title's screens (docs/STORY.md "A mark for each screen"). The press is the promise and is
  // framed as one: centred, low at the kerb, looking up past the screens into the blue hour. Pressed, the world answers as
  // the score comes in: the camera stands up and steps back and aside (MARK.rise, MARK.back, MARK.truck to the left) and turns, so the screens
  // go to the frame's upper right third, away from the menu's list (on a phone upright, to its top, over the list), and
  // the crossing and its crowd come into the frame. The screens behind the menu (who you play, the story, options) take
  // it MARK.deep further in, and Back brings it out again. MARK.x and MARK.y: where the screens stand in a landscape frame,
  // as a fraction of its half width and half height from the middle; MARK.px and MARK.py, upright, where the frame is a
  // third as wide and the tower fills it, so it steps further back and up there (MARK.pback, MARK.prise). Each move is two
  // critically damped springs in a row (MARK.time each), so it sets off and settles gently and a press made mid-move turns
  // it round without a jolt; under reduced motion, a cut. The look it ends on is titleLook, where the crane down to your
  // shoulder starts from (craneIn).
  const MARK = { truck: 4, rise: 1.4, back: 6, x: 0.36, y: 0.06, prise: 2.2, pback: 10, px: 0, py: 0.2, deep: 2, time: 0.42 };
  const mark = { k: 0, d: 0, s: [0, 0, 0, 0, 0, 0, 0, 0] }; // (s: each spring's value and speed, the press's two then the depth's two)
  const damp = (s, i, want, st, dt) => { // (a critically damped spring: s[i] the value, s[i + 1] its speed)
    const w = 2 / st, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x), ch = s[i] - want, tmp = (s[i + 1] + w * ch) * dt;
    s[i + 1] = (s[i + 1] - w * tmp) * e; s[i] = want + (ch + tmp) * e;
    return s[i];
  };
  const markF = new THREE.Vector3(), markR = new THREE.Vector3();
  function titleMarks(dt) {
    const sc = titleEl.dataset.screen, want = !sc || sc === 'press' ? 0 : 1, deep = sc === 'who' || sc === 'story' || sc === 'opts' ? 1 : 0, s = mark.s;
    if (reduced) { s.fill(0); s[0] = s[2] = mark.k = want; s[4] = s[6] = mark.d = deep; } else if (dt > 0) {
      mark.k = damp(s, 2, damp(s, 0, want, MARK.time, dt), MARK.time, dt);
      mark.d = damp(s, 6, damp(s, 4, deep, MARK.time, dt), MARK.time, dt);
    }
    const k = mark.k, d = mark.d;
    if (Math.abs(k) < 1e-4 && Math.abs(d) < 1e-4) return;
    markF.subVectors(titleLook, camera.position);
    const dist = markF.length();
    markF.y = 0; markF.normalize(); markR.set(-markF.z, 0, markF.x); // (level forward and right)
    const a = camera.aspect || 1.6, up = Math.max(0, Math.min(1, (a - 0.8) / 0.5)), by = (p, l) => p + (l - p) * up; // (upright to landscape)
    camera.position.addScaledVector(markR, -MARK.truck * k).addScaledVector(markF, MARK.deep * d - by(MARK.pback, MARK.back) * k);
    camera.position.y += by(MARK.prise, MARK.rise) * k;
    // the screens put where the frame wants them: the turn and the tilt their place in the frame takes, at this lens
    const tanV = Math.tan(camera.fov * Math.PI / 360), sx = by(MARK.px, MARK.x), sy = by(MARK.py, MARK.y);
    markF.subVectors(titleLook, camera.position);
    const az = Math.atan2(markF.x, -markF.z) - Math.atan(sx * tanV * a) * k, el = Math.atan2(markF.y, Math.hypot(markF.x, markF.z)) - Math.atan(sy * tanV) * k;
    titleLook.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(markF.length() || dist).add(camera.position);
    camera.lookAt(titleLook);
  }
  // the orbit's centre: north-east of the start, or with an opening shot (game.start.shot, #110) the point it
  // looks at (Shibuya's: the screen over the scramble), the camera then swaying gently behind the start's view
  // and not orbiting, so the crane down from it to over the player's shoulder never swings round
  const titleAt = () => (openingHere() ? OPENING.look : DISTRICT ? [player.x + 30, player.y + 40, player.z + 12] : [player.x + 120, player.y + 160, player.z + 20]);
  const titlePose = () => { const c = titleAt(), yaw = openingHere() ? openingView().yaw : FLY_END.yaw; return { look: c,
    cam: [c[0] - Math.sin(yaw) * FLY_END.r, c[1] - Math.cos(yaw) * FLY_END.r, c[2] + FLY_END.h] }; };
  function fromFlyover() { if (DISTRICT) return; titleYaw = openingHere() ? openingView().yaw : FLY_END.yaw; titleR = FLY_END.r; titleH = FLY_END.h; }
  // where the title orbit starts: the bearing with the most open foreground (the least building
  // over the nearer part of the line of sight), so the title does not open on one big flat roof
  // (for a district near the map's edge, Sangenjaya's: only the bearings that look back into the map, the camera
  // over it and the city behind what it looks at, not the haze past the edge)
  function openYaw(cx, cy, r) {
    let best = 0, least = Infinity;
    const F = scene.frame, inMap = (x, y) => x > F.x[0] && x < F.x[1] && y > F.y[0] && y < F.y[1];
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * 2 * Math.PI, x0 = cx - Math.sin(a) * r, y0 = cy - Math.cos(a) * r;
      let h = DISTRICT && !(inMap(x0, y0) && inMap(cx + Math.sin(a) * 900, cy + Math.cos(a) * 900)) ? 1e9 : 0;
      for (let i = 1; i <= 12; i++) { const t = i / 12 * 0.7, x = x0 + (cx - x0) * t, y = y0 + (cy - y0) * t; h += roofBelow(x, y) - nav.terrain(x, y); }
      if (h < least) { least = h; best = a; }
    }
    return best;
  }
  let titleMustered = false;
  function updateCamera(dt, titleOn) {
    lensNear.out = 0; // (nobody of the crowd taken out for being near the lens, unless the chase view on foot below says so: issues 82, 129)
    if (titleOn && flyCam) { // a scripted camera over the title screen, for recording the flyover
      camera.up.set(0, 1, 0);
      camera.position.copy(flyCam.pos);
      camera.lookAt(flyCam.look);
      live.pos.copy(camera.position);
      Wd.fitShadow(flyCam.look, flyCam.shadow);
      return;
    }
    if (titleOn) { // slow orbit near the start for the title screen, low enough to see the skyline against the sky
      const c = titleAt();
      const O = openingHere() ? openingView() : ORBIT;
      if (titleYaw == null) titleYaw = titleYaw0 = O !== ORBIT ? O.yaw : openYaw(c[0], c[1], ORBIT.r);
      const k = Math.min(1, dt * 0.4);
      titleR += (O.r - titleR) * k; titleH += (O.h - titleH) * k;
      titleLook.copy(W(c[0], c[1], c[2]));
      camera.up.set(0, 1, 0);
      const tr = titleR - (O.push || 0) * (1 - Math.exp(-titleT / 30)); // (the slow push in)
      camera.position.copy(titleLook).add(new THREE.Vector3(Math.sin(titleYaw) * -tr, titleH, Math.cos(titleYaw) * tr));
      camera.lookAt(titleLook);
      if (O.push) titleMarks(dt); // (the press's frame, or the menu's and the screens' behind it: titleMarks)
      // (the title is paused, so nothing is simulated under it; the crowd is stepped here, gathered once at the scramble's
      // kerbs, and waits there under the screens, not an empty crossing)
      if (O.push && crowd) {
        crowd.bodies = crowdKeep(player.x, player.y, true, dt); crowd.update(dt, player.x, player.y, clockT, null); if (!titleMustered && crowd.crossings) { titleMustered = true; musterScramble(); }
        // (nobody in the lens: at eye height in the crowd a passer-by a pace off filled half the poster)
        if (crowdDraw) { const ex = camera.position.x, ey = -camera.position.z; for (let i = 0; i < crowd.active; i++) { const q = crowd.P[i]; if ((q.line >= 0 || q.pz) && Math.abs(q.x - ex) < 4.5 && Math.abs(q.y - ey) < 4.5) crowdDraw.hide(i); } }
      }
      live.pos.copy(camera.position);
      Wd.fitShadow(titleLook, 600);
      return;
    }
    rig(dt);
    // in a car the view widens with speed, and from a seat it is a little wider still
    const veh = player.mode === 'car' ? myCar.D.st : player.mode === 'ride' && ride ? ride.drv.st : null;
    carFov += ((veh ? (cam.mode === 'cabin' ? 8 : Math.max(0, Math.min(13, ((veh.speed ?? Math.abs(veh.v)) - 9) * 0.32))) : 0) - carFov) * Math.min(1, dt * 2);
    if (veh) player.rig.root.visible = cam.mode !== 'cabin';
    const seated = onTrain() && cam.mode !== 'chase'; // (in a train, from the window seat or the cab)
    if (onTrain()) player.rig.root.visible = !seated;
    // the cockpit view takes a wider lens, as cockpit views in games do, and a near plane inside the cabin
    const shot = cine.step(clockT), cockpit = !shot && player.mode === 'heli' && cam.mode === 'cockpit';
    // (and in the helicopter's chase view with its speed, up to 6 degrees at top speed: the sense of speed in the air)
    heliFov += ((player.mode === 'heli' && cam.mode === 'chase' ? Math.min(6, heli.st.speed * 0.12) : 0) - heliFov) * Math.min(1, dt * 1.5);
    const fov = shot && cine.label === 'overture' ? overture.fov : shot && cine.label === 'survey' ? surveyFov : cockpit ? COCKPIT.fov : BASE_FOV + (shot ? 0 : Math.round((carFov + heliFov) * 4) / 4) + (seated && !shot ? 6 : 0) + (story && !shot ? story.push : 0) + (shot ? 0 : perchFov), near = cockpit || seated ? 0.12 : 0.3;
    if (camera.fov !== fov || camera.near !== near) { camera.fov = fov; camera.near = near; camera.updateProjectionMatrix(); }
    if (shot) {
      camera.up.set(0, 1, 0);
      camera.position.copy(shot.pos);
      // never inside a building; a film's shots (tools/film) are checked against the surface model when
      // they are planned, and go down to eye level among the crowd, so they are left where they are
      // the arrival and the hops keep clear of the roofs themselves (calmElevation) and come down into a street to the
      // player, where this clamp (the tallest roof in the cells round it) would pin them at the roofline: within 25 m
      // of what they look at they are left alone, as the chase camera is; the look closer is at the eye's height
      const own = (cine.label === 'crane' || cine.label === 'hop') && (camera.position.distanceTo(shot.look) < 25 || clockT < liftHop); // (a lift's climb is beside its tower, under its roofline all the way and found clear when it was planned: rideLift)
      if (cine.label !== 'film' && cine.label !== 'closer' && cine.label !== 'overture' && !own) camera.position.y = Math.max(camera.position.y, roofBelow(camera.position.x, -camera.position.z) + 3);
      camera.lookAt(shot.look);
      lensClear({ look: [shot.look.x, -shot.look.z] }, true);
      Wd.fitShadow(shot.look, THREE.MathUtils.clamp(camera.position.distanceTo(shot.look) * 1.2, live.half, 1600));
      return;
    }
    // the story's own film (story.js `film`: the guide coming to you through the stopped crowd): its pose is given in the
    // map's frame from the story's clock, which runs while the world's is held; when it ends, the chase view takes up
    // from the side the film ended on (you seen from in front, with him at your feet), not swung round behind you
    // through the held crowd, and the view is eased to it
    const sf = story && story.film;
    if (sf && player.mode === 'foot') {
      camera.up.set(0, 1, 0);
      camera.position.copy(W(sf.pos[0], sf.pos[1], sf.pos[2]));
      camera.lookAt(W(sf.look[0], sf.look[1], sf.look[2]));
      if (camera.fov !== sf.fov) { camera.fov = sf.fov; camera.updateProjectionMatrix(); }
      filmOn = true; filmYaw = Math.atan2(sf.look[0] - sf.pos[0], sf.look[1] - sf.pos[1]); lensClear(sf); Wd.fitShadow(W(sf.look[0], sf.look[1], sf.look[2]), 60);
      return;
    }
    if (filmOn) { filmOn = false; cam.yaw = filmYaw; blendFrom(1.2, true); } // (and then round to whoever is next, where the goal turns the view: cam.yawTo)
    camera.up.copy(live.up);
    camera.position.copy(live.pos);
    if (viewBlend.t < 1) { // (between two views: from the one left to this one)
      viewBlend.t = Math.min(1, viewBlend.t + dt / (viewBlend.dur || VIEW_BLEND));
      const u = viewBlend.t, e = viewBlend.inOut ? u * u * u * (u * (u * 6 - 15) + 10) : 1 - Math.pow(1 - u, 3), at = viewBlend.world ? viewBlend.at : focusW(blendAt);
      const lk = blendLook.copy(viewBlend.look).add(at).lerp(live.look, e);
      if (viewBlend.world) { // (round what it looks at, by bearing, height and distance: a straight line between two sides of you went through your head)
        const a = blendA.copy(viewBlend.pos).sub(viewBlend.look), b = blendB.copy(live.pos).sub(live.look);
        const ra = a.length(), rb = b.length(), ya = Math.atan2(a.x, a.z), pa = Math.asin(THREE.MathUtils.clamp(a.y / (ra || 1), -1, 1)), pb = Math.asin(THREE.MathUtils.clamp(b.y / (rb || 1), -1, 1));
        const yw = ya + angDiff(Math.atan2(b.x, b.z), ya) * e, pt = pa + (pb - pa) * e, r = ra + (rb - ra) * e;
        camera.position.set(Math.sin(yw) * Math.cos(pt) * r, Math.sin(pt) * r, Math.cos(yw) * Math.cos(pt) * r).add(lk);
      } else camera.position.copy(viewBlend.pos).add(at).lerp(live.pos, e);
      camera.up.lerpVectors(viewBlend.up, live.up, e).normalize();
      const f = viewBlend.fov + (camera.fov - viewBlend.fov) * e;
      if (Math.abs(f - camera.fov) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
      camera.lookAt(lk);
    } else camera.lookAt(live.look);
    // a conversation of the story (talkcam.js): its shot over the chase view, cut to at each line, and the chase view
    // eased back over half a second when the talk is over
    talkShot = null;
    if (talkCam && talkCam.talk) {
      if (!dlg.holds || player.mode !== 'foot' || shot) { talkCam.close(); blendFrom(0.5, true); player.rig.root.visible = true; }
      else if (!(story && story.finder)) {
        // (a new line of what is said: the text in the box is no longer the last frame's carried on; hud.js types each line out)
        const typed = talkText ? talkText.textContent : '';
        if (talkTyped && !typed.startsWith(talkTyped) && !talkCam.talk.cut) talkCam.line();
        talkTyped = typed;
        const cut = talkCam.talk.cut, t = talkCam.shot(player, camera.aspect, talkPanel());
        if (t) {
          talkShot = t;
          { const sp = talkCam.talk.speaker; if (crowd.keep) crowd.keep(player.x, player.y, sp ? sp.x : player.x, sp ? sp.y : player.y, 7); } // (nobody begins to stop along the way in the conversation's shot)
          // (at the cut, the crowd in the frame before the face or at its shoulder: a walker among them is sent on
          // elsewhere, as one the crowd is done with, and one at a scramble's kerb is left undrawn while the shot lasts.
          // A cut hides the change, in a Stop as in the running street; issue 45)
          if (cut && crowd && crowd.P) { const F = talkCam.framed(), keep = []; for (const i of F) { const q = crowd.P[i]; if (!q) continue; if (q.pz) keep.push(i); else { q.line = -1; if (crowdDraw) crowdDraw.hide(i); } } talkCam.talk.framed = keep; }
          // (whoever of the crowd still stands in the way is not drawn while the shot lasts: the title's way, which the
          // held crowd of a Stop allows where moving them aside would not be seen)
          if (crowdDraw) for (const i of talkCam.clearing()) crowdDraw.hide(i);
          if (cut) { // (at a cut: the player faces the one they talk to)
            const sp = talkCam.talk.speaker; if (sp && Math.hypot(sp.x - player.x, sp.y - player.y) > 0.3) player.h = Math.atan2(sp.x - player.x, sp.y - player.y);
          }
          camera.up.set(0, 1, 0);
          camera.position.copy(W(t.pos[0], t.pos[1], t.pos[2]));
          camera.lookAt(W(t.look[0], t.look[1], t.look[2]));
          if (Math.abs(camera.fov - t.fov) > 0.01) { camera.fov = t.fov; camera.updateProjectionMatrix(); }
          talkShift(t.shift || 0, cut);
          player.rig.root.visible = t.shoulder !== null || t.kind === 'reverse' || Math.hypot(t.pos[0] - player.x, t.pos[1] - player.y) > 0.5; // (through the player's own eyes, the last resort: not their own head)
          if (cut) { // (what the shot cut to shows, for tools/talk_check.js: where the face is in the frame, what stands before it, and whether the lens is in a wall)
            const L = talkCam.log[talkCam.log.length - 1], v = W(t.subject[0], t.subject[1], t.subject[2]), P = camera.position, d = v.clone().sub(P);
            const undrawn = new Set(); if (crowd && crowd.P) for (let i = 0, m = Math.min(crowd.active, crowd.P.length); i < m; i++) if (!crowdDraw || !crowdDraw.shows(i)) undrawn.add(i);
            camera.updateMatrixWorld(); const front = d.dot(camera.getWorldDirection(new THREE.Vector3())) > 0; v.project(camera);
            if (L) Object.assign(L, { x: +v.x.toFixed(3), y: +v.y.toFixed(3), front, block: talkCam.check(undrawn), crowd: talkCam.framing(undrawn), inWall: nav.clearFraction(d.clone().normalize().multiplyScalar(Math.min(0.6, d.length() / 2)).add(P), P) < 0.999, aspect: +camera.aspect.toFixed(3), panel: +talkCam.talk.panel.toFixed(3) });
          }
        }
      }
    }
    // (no talk on screen: the lens shift eased off with the blend back to the chase view, at once under another camera)
    if (!talkShot && (talkLens.shift || (camera.view && camera.view.enabled))) talkShift(0, !!(shot || (story && story.finder) || player.mode !== 'foot'));
    // the story's camera raised (story.js): the view is the lens's, from your own eye, not from behind you. It has an aim of
    // its own (fp: where the lens points, and where the hand turns it), so nothing that moves the view behind you moves it
    // (that view's turn round you in the Stop, its swing round behind a walk, its ease towards the goal, its lift over a
    // wall): it was read off that view every frame, and came up turning by itself, wherever that view had been pitched.
    // It comes up as a camera is raised to the face, a third of a second from where the view was to the eye, onto what
    // the frame is of (story.subject: the thing, at its height) unless that is behind you; then the lens's ring turns to
    // the frame's own lens (task.lens) in about a second, as a hand would. The drag that turns the view behind you turns
    // the lens, slower as the lens is longer; the wheel is the lens's ring: 12 degrees, a long lens, to 60, a wide one
    if (story && story.finder && player.mode === 'foot' && !shot) {
      const hold = story.hold, eyeZ = player.z + 1.56 + (hold ? hold[1] : 0);
      // (the lens's angle is across a film frame, three by two; a screen narrower than that, a phone held upright, keeps
      // the frame's width and sees more above and below, or the last picture, both kerbs in one frame, cannot be taken on it).
      // A frame with a lens of its own (task.lens: a thing of 1964 that should fill a third of the finder) is seen on a
      // narrow screen through that angle across its width, so that on a phone the thing is a little larger in the finder
      // than in a desktop's, and its lettering can be read. It was 0.7 of the angle while the finder was drawn for the whole
      // screen; with the finder's lines inside the print, a band across a phone held upright (story.js fitFinder), the
      // board of frame 1 stood taller than the print through 0.7, and frame 6's pillar box, umbrella and board wider
      const lensOf = (v, ring) => camera.aspect >= 1.5 ? v : Math.min(lensWas != null && (ring >= 45 || lensWide) ? 105 : 95, 2 * Math.atan(Math.tan(v * Math.PI / 360) * (lensWas != null && ring < 45 && !lensWide ? 1 : 1.5) / camera.aspect) * 180 / Math.PI); // (a lens closed on the last frame's two as they meet keeps the film frame's width too, lensWide, so that a phone's print is a desktop's; a frame's wide lens, the last frame's two kerbs 44 to 50 degrees apart, keeps the film frame's width on a phone too: at 95 degrees from top to bottom a phone held upright saw 53 across)
      if (!fpOn) {
        // (from the view as it was: where it stood, which way it looked, its lens)
        fp.from = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov };
        // (the way the view behind you faces, and its pitch as the eye's: 0.3 of it is level. Not that view's own downward
        // look at you from over your shoulder, which brought the lens up 17 degrees low and the last frame's two kerbs out of it)
        const yaw0 = cam.yaw, pitch0 = 0.3 - cam.pitch;
        let yaw = yaw0, pitch = Math.max(-0.3, Math.min(0.3, pitch0)); // (raised to the eye, the lens is held about level)
        const at = story.subject;
        if (at) {
          const dx = at[0] - player.x, dy = at[1] - player.y, ys = Math.atan2(dx, dy);
          if (Math.abs(angDiff(ys, yaw0)) < 1.75) { yaw = ys; pitch = Math.max(-1.32, Math.min(0.8, Math.atan2((at[2] ?? player.z + 1.2) - eyeZ, Math.hypot(dx, dy)))); /* (down to 75 degrees: from SKY's roof the dome's building is 67 under the lens, and at 57 it sat on the picture's lower edge) */ // (within 100 degrees of where you looked; behind you, the view is not spun round: the arrow on the frame lines points there)
            // (and tilted, if it must be, so that all of the thing is in the print: story.span, its foot and its top. Aimed at
            // the red lamp on its post, 7 m off on a phone, the post's foot was below the print's band and the frame was not
            // ready. Its point stays where the frame puts it wherever all of it fits from there)
            const span = story.span;
            if (span) {
              const d = Math.hypot(dx, dy), P = printRect(), f0 = Math.max(12, Math.min(60, 22 + (cam.dist - 2.5) * 5.5)), a = Math.atan(0.88 * Math.tan(lensOf(f0, f0) * Math.PI / 360) * (P[3] - P[1]));
              const top = Math.atan2(span[1] - eyeZ, d), foot = Math.atan2(span[0] - eyeZ, d);
              pitch = top - foot < 2 * a ? Math.max(top - a, Math.min(foot + a, pitch)) : (top + foot) / 2;
            }
          }
        }
        fp.yaw = fp.yawT = yaw; fp.pitch = fp.pitchT = pitch; fp.k = 0; fp.eyeZ = eyeZ;
        fp.dur = 0.28 + 0.25 * Math.abs(angDiff(yaw, yaw0)) / (Math.PI / 2); // (a shooter's aim is 0.25 to 0.38 s; a turn onto the thing takes its time, never a whip)
        cam.yaw = yaw; cam.pitch = Math.max(-0.6, Math.min(1.62, 0.3 - pitch)); cam.yawTo = cam.pitchTo = null; // (the hand turns it from there)
        fp.fov = null; fpOn = true;
      }
      cam.yawTo = cam.pitchTo = null;
      // (the story's steer: the lens eased onto a point while it asks, as the last frame's two walk to the middle and the lens
      // closes on them; the hand still turns it, and is pulled back gently)
      const steer = story.steer;
      if (steer) { const dx = steer[0] - player.x, dy = steer[1] - player.y, k = 1 - Math.exp(-dt / 0.6); cam.yaw += angDiff(Math.atan2(dx, dy), cam.yaw) * k; const pw = 0.3 - Math.atan2((steer[2] ?? player.z + 0.9) - fp.eyeZ, Math.hypot(dx, dy)); cam.pitch += (pw - cam.pitch) * k; }
      fp.yawT = cam.yaw; fp.pitchT = Math.max(-1.32, Math.min(0.9, 0.3 - cam.pitch));
      const e = 1 - Math.exp(-dt / 0.06); // (the hand's turn, eased over a few hundredths of a second: smooth, never behind it)
      fp.yaw += angDiff(fp.yawT, fp.yaw) * e; fp.pitch += (fp.pitchT - fp.pitch) * e;
      fp.eyeZ += (eyeZ - fp.eyeZ) * (1 - Math.exp(-dt / 0.08)); // (a step up or down is not a jolt in the finder)
      const hx = Math.sin(fp.yaw), hy = Math.cos(fp.yaw), cp = Math.cos(fp.pitch);
      // (a frame taken with the camera held out, over a roof's glass: task.hold, metres forward and up from the eye;
      // from the eye itself a lens pointed sixty degrees down saw the deck's rim and its light, not the street)
      // (and held out as a photographer presses the lens to the glass: to the roof's edge along its heading and a hand's
      // breadth past it, never nearer than hold's own reach. From that reach alone, a player standing a pace back from
      // the glass had the parapet's ledge and the light along its foot under the lens, and frame 4's dome came out with a
      // white veil over the lower half of the finder and of the print)
      let reach = hold ? hold[0] : 0.12;
      if (hold) for (let d = hold[0]; d <= hold[0] + 2.5; d += 0.1) if (nav.groundBelow(player.x + hx * d, player.y + hy * d, player.z + 0.6) < player.z - 2) { reach = d + 0.15; break; }
      fp.reach = hold && fp.reach != null ? fp.reach + (reach - fp.reach) * (1 - Math.exp(-dt / 0.12)) : reach;
      const eye = W(player.x + hx * fp.reach, player.y + hy * fp.reach, fp.eyeZ);
      fpUp.copy(eye).add(fpDir.set(hx * cp, Math.sin(fp.pitch), -hy * cp));
      const f0 = Math.max(12, Math.min(60, 22 + (cam.dist - 2.5) * 5.5));
      // (it comes up at an eye's own angle, 40 degrees, a 35 mm lens, and the ring is turned to the frame's lens once it is up)
      if (fp.fov == null) fp.fov = 40;
      fp.k = Math.min(1, fp.k + dt / (fp.dur || 0.28));
      const up = fp.k * fp.k * (3 - 2 * fp.k);
      if (fp.k >= 1) fp.fov += (f0 - fp.fov) * (1 - Math.exp(-dt / 0.3));
      const f = lensOf(fp.fov, f0); // (the narrow screen's rule from the ring's lens, not the angle easing to it: the last frame's 50 degrees came up from 40 through 45, and a phone's view jumped from narrow to wide in the raise)
      camera.up.set(0, 1, 0);
      camera.position.copy(eye); camera.lookAt(fpUp);
      if (up < 1 && fp.from) { // (the raise: from the view as it was to the eye, the lens swinging round onto its aim)
        fpQ.copy(camera.quaternion);
        camera.position.lerpVectors(fp.from.pos, eye, up);
        camera.quaternion.copy(fp.from.quat).slerp(fpQ, up);
      }
      const fov = up < 1 && fp.from ? fp.from.fov + (f - fp.from.fov) * up : f;
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      player.rig.root.visible = up < 0.5; // (yourself, until the camera is at your face)
    } else if (fpOn) {
      fpOn = false; player.rig.root.visible = true; lensWide = false;
      // (lowered: the view behind you looks where the lens did, and comes back from the eye in a third of a second)
      cam.yaw = fp.yaw; cam.pitch = Math.max(-0.25, Math.min(1.35, 0.3 - fp.pitch)); cam.yawTo = cam.pitchTo = null;
      if (lensWas != null) { cam.dist = lensWas; lensWas = null; } else cam.dist = Math.max(2.5, cam.dist); // (a frame's own lens is given back when the finder's view ends)
      if (!shot) blendFrom(0.22);
    }
    // (someone of the crowd a pace beside the lens, in the chase view on foot, is out of the picture: lensClear, issues 82
    // and 129. Not in a talk's shot, a film, a scripted shot or the finder, whose framing is made with whoever is in it)
    // (out within 2 m from the lens to the person's middle: with the eye 2.5 m up that is 1.3 m from under the lens, and
    // nearer than that a person is mostly under a phone's frame; back once 2.3 m off. The far edge 1.2 m short of you,
    // so that a lens pulled in close by a wall never takes out someone standing by the one you play)
    if (player.mode === 'foot' && cam.mode === 'chase' && !shot && !talkShot && !fpOn && !photo.on) {
      const me = Math.hypot(camera.position.x - player.x, camera.position.y - player.z - 1, -camera.position.z - player.y), far = Math.min(LENS_NEAR.back, me - 1.2);
      if (far > 0.6) { lensNear.out = far; lensNear.in = Math.max(0.3, far - (LENS_NEAR.back - LENS_NEAR.out)); }
    }
    lensClear();
    Wd.fitShadow(live.look, live.half);
  }
  // nobody the lens is inside (issue 22): the camera keeps out of walls, and in a tight place (a lift's lobby) it is
  // pulled in among the people standing there, where its near plane cut through a face. As games do with someone
  // between the camera and the player, whoever of the named cast, the story's people, the guide or the crowd's near
  // people has the lens within their body is not drawn for that frame (layer 0, which nothing else in the game
  // turns off), and is drawn again the moment it is out
  const lensHid = new Set();
  // Someone of the crowd near the lens (issue 129). Either a person is in the picture, whole, or they are out of it:
  // until then whoever stood between 2 and 3.2 m from the chase camera was drawn through a dither for as long as they
  // stood there, a screen of dots at a desktop's size with the street seen through them. Now each of the crowd is out
  // (not drawn at all: body, umbrella and shadow, in one frame) once their middle is within lensNear.in of the lens,
  // and back, whole, once it is lensNear.out away: the half metre between keeps someone at the edge from blinking as
  // the camera eases. It is a near plane that takes whole people, set where a person is mostly under the frame; the
  // crowd's walkers and those waiting are steered out of that space (actors.js, the lens's room), so it is rare.
  // Only the crowd: the story's people, the named cast, the guide and the one you play are never taken out by it
  const LENS_NEAR = { out: 2.0, back: 2.3 }, lensNear = { in: 0, out: 0, gone: 0 };
  let lensNearOn = true; // (false: for a harness, the frame with everyone in it)
  // A film of the story's (film: its pose) is low among people held still, and someone a pace in front of the lens filled
  // half a phone's upright frame with the back of their head as the dog walked behind them: in a film, whoever stands
  // within 3 m in front of the lens and in its line to what it looks at is not drawn either, as a film crew would ask
  // them to step out of the shot
  function lensClear(film = null, shot = false) {
    for (const o of lensHid) o.traverse(q => q.layers.enable(0));
    lensHid.clear();
    // (a scripted shot frames the story's people, the map's and the guide itself, and they stay as it put them; the crowd
    // does not know the shot, and a walker passing the lens filled the last frame's (issue 232). So in a shot only the
    // crowd's part runs, as for a film, on the line from the lens to what the shot looks at: updateCamera passes it)
    const cx = camera.position.x, cy = -camera.position.z, cz = camera.position.y;
    let fx = 0, fy = 0, fl = 0;
    if (film) { fx = film.look[0] - cx; fy = film.look[1] - cy; fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl; }
    const inShot = (x, y) => { if (!film) return false; const dx = x - cx, dy = y - cy, t = dx * fx + dy * fy; return t > 0 && t < Math.min(3, fl - 0.9) && Math.abs(dx * fy - dy * fx) < 0.75 + 0.15 * t; };
    const near = (root, x, y, z, h, r) => {
      if (!root || (!inShot(x, y) && (Math.abs(x - cx) > r || Math.abs(y - cy) > r || Math.hypot(x - cx, y - cy) > r || cz < z - 0.1 || cz > z + h))) return;
      root.traverse(q => q.layers.disable(0)); lensHid.add(root);
    };
    if (!shot) for (const n of npcs) if (n.rig && n.rig.root) near(n.rig.root, n.x, n.y, n.z, 1.95, 0.62); // (a body's reach from its middle, 0.3 m, and the near plane's, 0.3)
    // (behind you, one of the story's people within a metre of the lens is not drawn either: an afterimage there, a pace off
    // where frame 5's stand is, filled a phone's whole frame with his back. Not in a film or a talk, which frame them)
    if (!shot) for (const f of storyFigs) if (f.rig && f.rig.root) near(f.rig.root, f.x, f.y, f.z, 1.95, film || talkShot ? 0.62 : 1.0);
    const gd = guideMade; if (gd && gd.root && !film && !shot) near(gd.root, gd.x, gd.y, gd.z, 1.0, 0.75); // (in a film of him, he is what it is of)
    lensNear.gone = 0;
    if (crowdDraw && crowd && crowd.P) for (let i = 0, m = Math.min(crowd.active, crowd.P.length); i < m; i++) {
      const q = crowd.P[i], x = q.rx ?? q.x, y = q.ry ?? q.y, z = q.rz ?? q.z ?? 0;
      if (!(q.line >= 0 || q.pz)) { q.lensOut = false; continue; }
      if ((Math.abs(x - cx) < 0.55 && Math.abs(y - cy) < 0.55 && cz < z + 1.95) || (inShot(x, y) && (!shot || cz < z + 2.2))) { crowdDraw.hide(i); continue; }
      // (near the lens: out at lensNear.in, back at lensNear.out; with the band off, everyone back at once)
      if (lensNear.out > 0 && lensNearOn) { const d = Math.hypot(x - cx, y - cy, z + 1 - cz); q.lensOut = d < (q.lensOut ? lensNear.out : lensNear.in); } else q.lensOut = false;
      if (q.lensOut) { crowdDraw.hide(i, true); lensNear.gone++; }
    }
  }
  // The lens's window (issue 226). A camera takes its picture through a window, not from a point: the near plane's
  // rectangle, camera.near in front of the lens and as wide as the lens's angle makes it, and whatever that window is
  // inside is drawn from within. The owner's still of frame 3 had the chase view over the head looking down, the window
  // through the hair and the skull, the eyes and the lashes seen from behind. So, every frame and from every camera (the
  // chase view, a talk, a film, a scripted shot, the finder raised and lowered, a photograph, the close look), once the
  // frame's camera is set: when the window is in someone's body (the one you play, the story's people, the map's people,
  // the guide, the crowd's near people), the window first comes in towards the lens, the near plane from where that camera
  // has it down to the close look's own 0.05 m (the depth is reversed: a near plane that close costs the far city
  // nothing), and nobody is touched. Only someone the lens itself is inside, whom no window clears, is out of the picture
  // for that frame, whole, as lensClear takes people out (a person of this game is in the picture whole or out of it
  // whole: people.js, issue 129). That last case is what the chase view keeps from happening (rig: its pull-in and its
  // lifts), and tools/cam_intrude.js measures the window against the skinned bodies every frame of a play and reads what
  // this did (window.__lensGuard). A body here is its parts as capsules, fitted once to the vertices each bone carries,
  // generous (the 97th hundredth of a part's vertices round its axis, and 2 cm): the measure's are the 80th, under the skin
  const NEARS = [0.3, 0.22, 0.16, 0.12, 0.09, 0.07, 0.05];
  const guardHid = new Set(), guardCaps = new WeakMap(), guardInv = new THREE.Matrix4(), guardA = new THREE.Vector3(), guardB = new THREE.Vector3(), guardPt = [], guardRay = [0, 0, 0, 0];
  const GUARD_PART = /(Pelvis|Spine2|Spine1|Spine|Neck|Head|Clavicle|UpperArm|Forearm|Hand|Thigh|Calf|Foot)$/;
  function guardFit(root) { // (once a model: its parts' capsules in their bones' own space)
    const meshes = [], parts = new Map(), p = guardA;
    root.traverse(o => { if (o.isSkinnedMesh && o.skeleton && o.geometry.attributes.skinIndex && !o.userData.fadeGhost) meshes.push(o); });
    if (!meshes.length) return null;
    const human = meshes.some(o => o.skeleton.bones.some(b => /Bip01/.test(b.name)));
    for (const o of meshes) {
      const g = o.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = o.skeleton.bones, binv = o.skeleton.boneInverses;
      for (let i = 0; i < pos.count; i++) {
        let bi = 0, bw = -1;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } }
        let b = bones[bi]; if (!b) continue;
        if (human) for (let q = b; q && q.isBone; q = q.parent) if (GUARD_PART.test(q.name)) { b = q; break; }
        const pi = bones.indexOf(b); if (pi < 0) continue;
        p.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix).applyMatrix4(binv[pi]);
        let L = parts.get(b); if (!L) parts.set(b, L = []);
        L.push(p.x, p.y, p.z);
      }
    }
    const caps = [];
    for (const [bone, L] of parts) {
      const n = L.length / 3; if (n < 12) continue;
      const lo = [0, 0, 0], hi = [0, 0, 0];
      for (let k = 0; k < 3; k++) { const s = []; for (let i = 0; i < n; i++) s.push(L[i * 3 + k]); s.sort((x, y) => x - y); lo[k] = s[Math.floor(n * 0.02)]; hi[k] = s[Math.min(n - 1, Math.floor(n * 0.98))]; }
      let ax = 0; for (let k = 1; k < 3; k++) if (hi[k] - lo[k] > hi[ax] - lo[ax]) ax = k;
      const u = (ax + 1) % 3, w = (ax + 2) % 3, cu = (lo[u] + hi[u]) / 2, cw = (lo[w] + hi[w]) / 2, rad = [];
      for (let i = 0; i < n; i++) rad.push(Math.hypot(L[i * 3 + u] - cu, L[i * 3 + w] - cw));
      rad.sort((x, y) => x - y);
      const r = rad[Math.floor(n * 0.97)], half = Math.max(0, (hi[ax] - lo[ax]) / 2 - r * 0.7), mid = (lo[ax] + hi[ax]) / 2, e0 = [0, 0, 0], e1 = [0, 0, 0];
      e0[u] = e1[u] = cu; e0[w] = e1[w] = cw; e0[ax] = mid - half; e1[ax] = mid + half;
      caps.push({ bone, a: new THREE.Vector3(...e0), b: new THREE.Vector3(...e1), r });
    }
    return caps;
  }
  // the deepest the window at depth n goes into the capsules laid out in guardPt (camera space): > 0 is inside
  const guardDepth = (m, n) => {
    const x0 = n * guardRay[0], x1 = n * guardRay[1], y0 = n * guardRay[2], y1 = n * guardRay[3];
    let worst = -Infinity;
    for (let i = 0; i < m; i += 28) {
      const r = guardPt[i];
      for (let k = 0; k < 9; k++) {
        const x = guardPt[i + 1 + k * 3], y = guardPt[i + 2 + k * 3], z = guardPt[i + 3 + k * 3];
        const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1), dz = z + n, d = r - Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > worst) worst = d;
      }
    }
    return worst;
  };
  // one body: laid out in camera space; the largest near (of NEARS, from `base` down) whose window clears it, or 0 for none
  const guardSig = { v: 0, k: 1 }, guardSigOf = o => { if (o.isSkinnedMesh && !o.userData.fadeGhost) guardSig.v += o.geometry.id * guardSig.k++; };
  function guardCapsOf(root) { // (a model's, kept: fitted again only when the copy is dressed as someone else)
    guardSig.v = 0; guardSig.k = 1; root.traverse(guardSigOf); const sig = guardSig.v;
    let c = guardCaps.get(root);
    if (!c || c.sig !== sig) { try { c = { sig, caps: guardFit(root) }; } catch (err) { c = { sig, caps: null }; } guardCaps.set(root, c); }
    return c;
  }
  // (a fit takes about 11 ms for the one you play on a session's machine: the one you play and the guide are fitted while the
  // page is idle, ahead of the first camera to come near them, not in that camera's frame)
  const guardWarm = () => { for (const r of [player.rig && player.rig.root, guideMade && guideMade.root]) if (r && r.parent) { guardCapsOf(r); fadeWarm(r); } };
  function guardBody(root, base) {
    guardS.deep = -Infinity;
    const e = root.matrixWorld.elements, P = camera.position;
    if (Math.abs(e[12] - P.x) > 1.8 || Math.abs(e[14] - P.z) > 1.8 || P.y < e[13] - 0.8 || P.y > e[13] + 2.8) return base;
    const c = guardCapsOf(root);
    if (!c.caps) return base;
    root.updateWorldMatrix(true, true);
    let m = 0;
    for (const q of c.caps) {
      guardA.copy(q.a).applyMatrix4(q.bone.matrixWorld).applyMatrix4(guardInv); guardB.copy(q.b).applyMatrix4(q.bone.matrixWorld).applyMatrix4(guardInv);
      const me = q.bone.matrixWorld, r = q.r * Math.cbrt(Math.abs(me.determinant())) + 0.02;
      guardPt[m] = r;
      for (let j = 0; j < 9; j++) { const t = j / 8; guardPt[m + 1 + j * 3] = guardA.x + (guardB.x - guardA.x) * t; guardPt[m + 2 + j * 3] = guardA.y + (guardB.y - guardA.y) * t; guardPt[m + 3 + j * 3] = guardA.z + (guardB.z - guardA.z) * t; }
      m += 28;
    }
    guardS.deep = guardDepth(m, NEARS[NEARS.length - 1]); // (how near the smallest window comes: the fade below begins a few cm short of it)
    for (const n of NEARS) if (n <= base + 1e-6 && guardDepth(m, n) <= 0) return n;
    return 0;
  }
  // The last resort, faded (issue 226, the owner's ask): where no window clears someone the lens cannot leave (you, the
  // story's people, the map's people, the guide), they go out of the picture over FADE_S, uniformly, and come back the same
  // way, begun FADE_NEAR short of the smallest window touching them. Not issue 129's fade: that was a dither held for as long
  // as someone stood near, read as a screen of dots, with the street and a clear umbrella seen through a body. This is never
  // held (it runs to out or back to whole), has no pattern (one opacity over the whole person), and shows no inner faces or
  // sorting faults: their depth is drawn first, alone (their own materials with colour writes off: the same programs), and
  // then their colour blended at that opacity where it is the nearest surface (depthFunc LessEqual over that depth), by a
  // copy of each of their meshes sharing its geometry, skeleton and morphs (a ghost). The blended materials are the one
  // program each person's material needs that it had not, warmed with the one you play and the guide (guardWarm). The crowd
  // stays as issue 129 left it: in the picture whole, or out of it whole
  const FADE_S = 0.2, FADE_NEAR = 0.04, FADE_BACK = 0.08;
  const fadeKits = new WeakMap(), fading = new Map();
  const fadeMat = (mt, depth) => {
    const c = mt.clone();
    c.onBeforeCompile = mt.onBeforeCompile; c.customProgramCacheKey = mt.customProgramCacheKey; // (a clone is given neither: the people's light and hair patches)
    if (depth) c.colorWrite = false;
    else { c.transparent = true; c.depthWrite = false; c.depthFunc = THREE.LessEqualDepth; c.userData.fadeBase = mt.transparent ? mt.opacity : 1; }
    return c;
  };
  const fadeSet = (mt, a) => { if (Array.isArray(mt)) for (const q of mt) q.opacity = q.userData.fadeBase * a; else mt.opacity = mt.userData.fadeBase * a; };
  function fadeKitOf(root) {
    guardSig.v = 0; guardSig.k = 1; root.traverse(guardSigOf); const sig = guardSig.v;
    let k = fadeKits.get(root);
    if (k && k.sig === sig) return k;
    if (k) for (const e of k.e) { e.m.material = e.orig; if (e.g.parent) e.g.parent.remove(e.g); }
    const list = [];
    root.traverse(o => { if (o.isMesh && o.material && !o.userData.fadeGhost) list.push(o); });
    if (!list.length) { fadeKits.set(root, k = { sig, e: [], warm: true }); return k; }
    k = { sig, a: 1, t: 0, warm: false, e: list.map(m => {
      const orig = m.material, many = Array.isArray(orig);
      const depth = many ? orig.map(q => fadeMat(q, true)) : fadeMat(orig, true), colour = many ? orig.map(q => fadeMat(q, false)) : fadeMat(orig, false);
      const g = m.isSkinnedMesh ? new THREE.SkinnedMesh(m.geometry, colour) : new THREE.Mesh(m.geometry, colour);
      if (m.isSkinnedMesh) { g.bindMode = m.bindMode; g.bind(m.skeleton, m.bindMatrix); }
      if (m.morphTargetInfluences) { g.morphTargetInfluences = m.morphTargetInfluences; g.morphTargetDictionary = m.morphTargetDictionary; }
      g.userData.fadeGhost = true; g.visible = false; g.castShadow = false; g.receiveShadow = m.receiveShadow; g.frustumCulled = m.frustumCulled; g.renderOrder = m.renderOrder; g.layers.mask = m.layers.mask;
      m.add(g);
      return { m, orig, depth, colour, g };
    }) };
    fadeKits.set(root, k);
    return k;
  }
  // (its blended programs compiled now, off the frame: the ghosts shown for the compile's own gathering, which three.js does at once)
  function fadeWarm(root) {
    const k = fadeKitOf(root);
    if (!k || k.warm) return;
    k.warm = true;
    for (const e of k.e) e.g.visible = true;
    try { compileFor0(root); } finally { for (const e of k.e) e.g.visible = false; }
  }
  const fadeShow = (k, a) => {
    for (const e of k.e) {
      if (a >= 1) { e.m.material = e.orig; e.g.visible = false; continue; }
      e.m.material = e.depth; e.g.visible = a > 0; fadeSet(e.colour, a);
    }
  };
  // one of them this frame: out (the window too near them) or back; true while they are not whole
  function fadeStep(root, out) {
    let k = fading.get(root);
    if (!k) { if (!out) return false; k = fadeKitOf(root); if (window.__fadeLog && root === player.rig.root) window.__fadeLog.meshes = k.e.length; if (!k.e.length) return false; k.a = 1; k.t = performance.now(); fading.set(root, k); }
    const now = performance.now(), dt = Math.min(0.1, (now - k.t) / 1000);
    k.t = now;
    k.a = Math.max(0, Math.min(1, k.a + (out ? -dt : dt) / (window.__fadeS || FADE_S))); // (__fadeS: slower, for a harness's stills of it)
    fadeShow(k, k.a);
    if (window.__fadeLog && root === player.rig.root) window.__fadeLog.a = k.a; // (for a harness: tools/cam_fade.js)
    if (k.a >= 1 && !out) { fading.delete(root); return false; } // (whole again only coming back: going out, its first step may be nought)
    if (k.a <= 0) { root.traverse(layerOff); guardHid.add(root); }
    return true;
  }
  // (a frame's state, kept here so that a frame of it makes nothing new: guardOne is called for each body near the lens)
  const guardS = { base: 0.3, near: 0.3, warmAt: -1e9, deep: -Infinity };
  const layerOn = q => q.layers.enable(0), layerOff = q => q.layers.disable(0);
  function guardOne(root, who, i) {
    if (!root || !root.visible || !root.parent || !root.layers.test(camera.layers)) { if (root && fading.has(root)) { fadeShow(fading.get(root), 1); fading.delete(root); } return; }
    const n = guardBody(root, guardS.base);
    if (n > 0 && n < guardS.near) guardS.near = n;
    if (i == null) { // (one the lens cannot leave: faded, out and back)
      const k = fading.get(root), out = n === 0 || guardS.deep > -(k && k.a < 1 ? FADE_BACK : FADE_NEAR);
      if (!fadeStep(root, out) || fading.get(root).a > 0) { if (n === 0 && !fading.has(root)) { root.traverse(layerOff); guardHid.add(root); if (window.__fadeLog && root === player.rig.root) window.__fadeLog.hard = (window.__fadeLog.hard || 0) + 1; } else return; }
    } else if (n > 0) return;
    else crowdDraw.hide(i, true);
    const G = window.__lensGuard; // (for a harness: who was taken out, from which camera)
    if (G) { const mode = cine.active ? `shot ${cine.label || ''}` : talkShot ? 'talk' : story && story.film ? 'film' : fpOn ? 'finder' : photo.on ? 'photo' : closeup ? 'closeup' : `${player.mode} ${cam.mode}`, key = `${typeof who === 'function' ? who() : who} | ${mode}`; G[key] = (G[key] || 0) + 1; }
  }
  const guardCrowd = (r, i) => guardOne(r.root, 'crowd', i);
  function lensGuard() {
    if (window.__lensGuardOff) return; // (for a harness weighing what it costs: tools/walk_play.js LENSGUARD=0)
    const gT = window.__lensGuardT, t0 = gT ? performance.now() : 0; // (and timing it: tools/cam_cost.js)
    for (const o of guardHid) if (!lensHid.has(o)) o.traverse(layerOn);
    guardHid.clear();
    camera.updateMatrixWorld();
    guardInv.copy(camera.matrixWorld).invert();
    // (the window's edges per metre of depth, from the corners' rays: a talk's lens shift and a phone's narrow frame and all)
    guardA.set(-1, -1, 0.5).applyMatrix4(camera.projectionMatrixInverse); guardB.set(1, 1, 0.5).applyMatrix4(camera.projectionMatrixInverse);
    guardRay[0] = guardA.x / -guardA.z; guardRay[1] = guardB.x / -guardB.z; guardRay[2] = guardA.y / -guardA.z; guardRay[3] = guardB.y / -guardB.z;
    guardS.base = guardS.near = camera.near;
    if (clockT - guardS.warmAt > 5) { guardS.warmAt = clockT; (window.requestIdleCallback || (f => setTimeout(f, 300)))(guardWarm); }
    guardOne(player.rig && player.rig.root, 'you');
    for (let k = 0; k < storyFigs.length; k++) { const f = storyFigs[k]; if (f.rig) guardOne(f.rig.root, f.name || f.id); }
    for (let k = 0; k < npcs.length; k++) { const q = npcs[k]; if (q.rig) guardOne(q.rig.root, q.id); }
    if (guideMade) guardOne(guideMade.root, 'guide');
    if (crowdDraw && crowdDraw.active) crowdDraw.active.forEach(guardCrowd);
    if (guardS.near < guardS.base) { camera.near = guardS.near; camera.updateProjectionMatrix(); }
    if (gT) { const d = performance.now() - t0; gT.ms += d; gT.n++; if (d > gT.max) gT.max = d; }
  }
  const blendLook = new THREE.Vector3(), blendAt = new THREE.Vector3(), blendA = new THREE.Vector3(), blendB = new THREE.Vector3();
  const cabinQ = new THREE.Quaternion(), camProbe = new THREE.Vector3(), UP_Y = new THREE.Vector3(0, 1, 0), camSide = new THREE.Vector3(), camSideA = new THREE.Vector3(), camSideB = new THREE.Vector3(), heliMid = new THREE.Vector3(), aheadT = new THREE.Vector3(), aheadP = new THREE.Vector3(), aheadM = new THREE.Vector3();
  const CEIL_GAP = 0.3; // how far under a drawn ceiling the lens keeps (its near plane and a lamp's depth: heroSoffit)
  const CAM_LIFTS = [0, 0.15, 0.3, 0.45, 0.6, 0.8]; // the chase camera's lifts over a wall behind, in radians of pitch
  // (the steepest a view on foot may look down from an arm that long: a lift over a wall behind that is then pulled in
  // short stands the lens over your head looking down at your hair, the owner's still of issue 226 and issue 99's; from
  // 2.5 m out any pitch, from 0.8 m in 0.5 rad, about the lowest lift's view over a shoulder. Issue 209)
  const pitchRoom = arm => 0.5 + 0.85 * Math.min(1, Math.max(0, (arm - 0.8) / 1.7));
  const CROWD_LIFT = 0.3; // (the most it lifts over people: from FOOT.pitch to about the old 0.47, the eye 4 m up at most)
  // the people standing or walking within the camera's reach of your head (the crowd's near people, the named cast, the
  // story's figures), as [x, y, z] in the game's ground plan, for folkAcross below
  const folkBuf = [];
  function folkNear(at, dist) {
    const ax = at.x, ay = -at.z, r = dist + 1;
    let n = 0;
    const add = (x, y, z) => { if (Math.abs(x - ax) > r || Math.abs(y - ay) > r) return; const k = n++ * 3; folkBuf[k] = x; folkBuf[k + 1] = y; folkBuf[k + 2] = z || 0; };
    if (crowd && crowd.P) for (let i = 0, m = Math.min(crowd.active, crowd.P.length); i < m; i++) { const q = crowd.P[i]; if (q.line >= 0 || q.pz) add(q.rx ?? q.x, q.ry ?? q.y, q.rz ?? q.z); }
    for (const q of npcs) if (q.rig && q.rig.root && q.rig.root.visible) add(q.x, q.y, q.z);
    for (const q of storyFigs) if (q.rig && q.rig.root && q.rig.root.visible) add(q.x, q.y, q.z);
    return { n, b: folkBuf };
  }
  // whether one of them stands across the line from the camera (c) to the head (a): a body 0.28 m round and 1.75 m tall,
  // met between a pace from the lens (whom the lens is inside is not drawn: lensClear) and a pace short of the head
  function folkAcross(folk, a, c) {
    const ax = a.x, ay = -a.z, az = a.y, dx = c.x - ax, dy = -c.z - ay, dz = c.y - az, L2 = dx * dx + dy * dy;
    if (L2 < 1) return false;
    const L = Math.sqrt(L2), t0 = 0.6 / L, t1 = 1 - 0.6 / L, b = folk.b;
    for (let i = 0; i < folk.n; i++) {
      const px = b[i * 3], py = b[i * 3 + 1], pz = b[i * 3 + 2], t = ((px - ax) * dx + (py - ay) * dy) / L2;
      if (t < t0 || t > t1) continue;
      const ex = ax + dx * t - px, ey = ay + dy * t - py;
      if (ex * ex + ey * ey < 0.28 * 0.28 && az + dz * t < pz + 1.75) return true;
    }
    return false;
  }
  function rig(dt) {
    const k2 = Math.min(1, dt * 6);
    cockpitGlass(player.mode === 'heli' && cam.mode === 'cockpit' && !photo.on);
    if (player.mode === 'heli' && cam.mode === 'cockpit') {
      // the pilot's eyes, pitching and banking with the cabin; drag to look round. In flight the
      // view drifts back to straight ahead when you let it be
      if (clockT - cam.lastInput > 2.5 && heli.st.speed > 3) { const r = Math.min(1, dt * 1.2); cam.lookYaw -= cam.lookYaw * r; cam.lookPitch += (COCKPIT.pitch - cam.lookPitch) * r; }
      heli.group.updateMatrixWorld();
      live.pos.copy(heli.way.eye).add(COCKPIT.eye).applyMatrix4(heli.group.matrixWorld);
      heli.group.getWorldQuaternion(cabinQ);
      const cp = Math.cos(cam.lookPitch);
      live.look.set(Math.sin(cam.lookYaw) * cp, Math.sin(cam.lookPitch), Math.cos(cam.lookYaw) * cp).applyQuaternion(cabinQ).add(live.pos);
      // (the horizon tilts with the cabin's bank by half: the bank still reads, without the whole city swinging)
      live.up.set(0, 1, 0).applyQuaternion(cabinQ).lerp(UP_Y, 0.5).normalize();
      live.half = 520;
      return;
    }
    if (player.mode === 'heli' && cam.mode === 'bird') {
      const st = heli.st, g = nav.groundBelow(st.x, st.y, st.z);
      live.pos.lerp(W(st.x, st.y, Math.max(st.z, g) + cam.birdAlt), 1 - Math.exp(-dt * 6)); // (eased the same at any frame time)
      live.up.set(Math.sin(st.h), 0, -Math.cos(st.h));
      live.look.copy(W(st.x, st.y, st.z));
      live.half = Math.min(2400, cam.birdAlt * 1.4);
      return;
    }
    live.up.set(0, 1, 0);
    const veh = player.mode === 'car' ? myCar : player.mode === 'ride' ? ride : null, vs = veh && stOf(veh);
    if (veh && cam.mode === 'cabin') { cabinView(dt, veh, vs); return; }
    if (onTrain() && cam.mode !== 'chase') { // the eyes of someone in the train (rail.js eye), looking where you drag
      const e = rail.eye(player.vehicle, cam.mode), yaw = e.h + cam.lookYaw, p = cam.lookPitch + e.pitch * Math.cos(cam.lookYaw);
      eye.copy(W(e.x, e.y, e.z));
      live.pos.copy(eye);
      live.look.set(eye.x + Math.sin(yaw) * Math.cos(p) * 10, eye.y + Math.sin(p) * 10, eye.z - Math.cos(yaw) * Math.cos(p) * 10);
      live.half = 170;
      camTarget.copy(eye); camSmooth.copy(eye);
      return;
    }
    if (player.mode === 'seat' && perch && perch.seat) { // on a perch: the tripod behind your shoulder, framing the scramble (perch.js)
      const j = junctions.scrambles.find(q => Math.hypot(q.x - player.x, q.y - player.y) < 120);
      const s = perch.camera(dt, !!(j && j.ph === 3), camera.aspect || 1.6, BASE_FOV + perchFov);
      eye.copy(W(...s.pos));
      live.pos.copy(eye); live.look.copy(W(...s.look));
      live.half = 170; perchFov = s.fovAdd;
      camTarget.copy(eye); camSmooth.copy(eye);
      player.rig.root.visible = true;
      return;
    }
    perchFov = 0;
    if (player.mode === 'seat' && shows && shows.seat) { // from the seat, through your own eyes
      const st = shows.seat, yaw = st.h + cam.lookYaw, p = cam.lookPitch;
      eye.copy(W(st.at[0] + st.face[0] * 0.08, st.at[1] + st.face[1] * 0.08, st.at[2] + (st.eye || 1.12)));
      live.pos.copy(eye);
      live.look.set(eye.x + Math.sin(yaw) * Math.cos(p) * 10, eye.y + Math.sin(p) * 10, eye.z - Math.cos(yaw) * Math.cos(p) * 10);
      live.half = 170;
      camTarget.copy(eye); camSmooth.copy(eye);
      player.rig.root.visible = photo.on; // (through your own eyes: your hard hat is not in them)
      return;
    }
    let tx, ty, tz, follow;
    // (in the helicopter it looks a little ahead into a turn, as a chase camera leads a vehicle round a bend)
    if (player.mode === 'heli') { tx = heli.st.x; ty = heli.st.y; tz = heli.st.z + 2.5; follow = heli.st.h + heli.st.yawRate * 0.3 * Math.min(1, heli.st.speed / 15); }
    else if (player.mode === 'ferry') { tx = player.vehicle.x; ty = player.vehicle.y; tz = 5; follow = null; }
    else if (player.mode === 'rail') { tx = player.vehicle.x; ty = player.vehicle.y; tz = player.vehicle.z + 3; follow = null; }
    else if (veh) { tx = vs.x; ty = vs.y; tz = vs.z + 1.5; follow = vs.h; }
    else { tx = player.x; ty = player.y; tz = player.z + 1.55; follow = player.h; }
    // the autopilot's film (autopilot.js film): shots round the car on this same rig, a cut between them; a drag
    // of the view gives it back to you for eight seconds
    let shot = pilot && veh === myCar && !pilot.join && clockT - cam.lastInput > 8 ? pilot.film.step(dt) : null;
    // (a shot whose camera, or its view of the car, is in a tree's crown is cut short for the next: the crane in
    // Sydney's street trees filled the frame with leaves. Read at the cut and every half second through the shot)
    if (shot && (shot.cut || (pilot.filmLook = (pilot.filmLook || 0) - dt) <= 0)) {
      pilot.filmLook = 0.5;
      const yw = vs.h + shot.yaw, hd = shot.dist * Math.cos(shot.pitch), cx = tx - Math.sin(yw) * hd, cy = ty - Math.cos(yw) * hd, cz = tz + shot.dist * Math.sin(shot.pitch);
      const leafy = q => q.kind === 'tree' && cz > q.z + 1.5 && (() => { // (in the crown, 4.5 m round the trunk, from 1.5 m up)
        const ex = tx - cx, ey = ty - cy, L2 = ex * ex + ey * ey || 1, u = Math.max(0, Math.min(1, ((q.x - cx) * ex + (q.y - cy) * ey) / L2));
        return Math.hypot(cx + ex * u - q.x, cy + ey * u - q.y) < 4.5 && u < 0.85; // (along the way from the camera to the car, not over the car itself)
      })();
      // (and a wall across the view: the camera pressed to a facade with the car behind it. Five points along the way
      // to the car, at the camera's height falling to the car's)
      const walled = () => { for (let k = 1; k <= 5; k++) { const u = k / 6, x = cx + (tx - cx) * u, y = cy + (ty - cy) * u, z = cz + (tz - cz) * u - 1; const w = nav.push(x, y, z, 0.4, 1.2); if (Math.hypot(w.x - x, w.y - y) > 0.05) return true; } return false; };
      if ((postsNear((cx + tx) / 2, (cy + ty) / 2, hd / 2 + 5).some(leafy) || walled()) && (pilot.filmSkips = (pilot.filmSkips || 0) + 1) < 6) { pilot.film.skip(); shot = pilot.film.step(0); pilot.filmLook = 0; }
      else pilot.filmSkips = 0;
    }
    if (shot) {
      follow = vs.h + shot.yaw;
      if (shot.cut) { cam.yaw = follow; cam.dist = shot.dist; cam.pitch = shot.pitch; cam.snap = true; cam.distTo = 0; }
      else { cam.yaw += angDiff(follow, cam.yaw) * Math.min(1, dt * 5); cam.dist += (shot.dist - cam.dist) * Math.min(1, dt * 2); cam.pitch += (shot.pitch - cam.pitch) * Math.min(1, dt * 2); }
      cam.filmOut = false; follow = null;
    } else if (cam.filmOut) { cam.pitch += (0.2 - cam.pitch) * Math.min(1, dt * 2.5); if (Math.abs(cam.pitch - 0.2) < 0.01 || !veh) cam.filmOut = false; }
    // drift behind the direction of travel when the player is not steering the camera (in a car, sooner and faster)
    const moving = veh ? Math.abs(vs.v) > 1 : player.mode === 'heli' ? heli.st.speed > 3 : player.speed > 1;
    const air = player.mode === 'heli';
    // on foot it comes round by the sideways part of the walk (the sine of the angle between them), eased in over a
    // second once the wait is over, and never faster than 0.9 rad/s: the walk is steered from the camera, so walking
    // back towards it turned the walk with the camera and the view spun round and round at 150 degrees a second, and a
    // walk across it swung the view the moment the wait ran out
    const idle = clockT - cam.lastInput;
    if (follow != null && idle > (veh || air ? 0.9 : 1.6) && moving && !fpOn) { // (not with the camera at your eye: the lens turns only with the hand)
      if (veh || air) cam.yaw += angDiff(follow, cam.yaw) * Math.min(1, dt * (veh ? 2.6 : 1.4 + Math.min(1.6, heli.st.speed * 0.04)));
      else cam.yaw += Math.sin(angDiff(follow, cam.yaw)) * 0.9 * Math.min(1, (idle - 1.6) / 1) * Math.min(1, player.speed / 2) * Math.min(dt, 0.1);
    }
    if (cam.distTo) { cam.dist += (cam.distTo - cam.dist) * Math.min(1, dt * 2.5); if (Math.abs(cam.distTo - cam.dist) < 0.05) cam.distTo = 0; } // easing in or out
    if (cam.yawTo != null) { const d = angDiff(cam.yawTo, cam.yaw); cam.yaw += d * Math.min(1, dt * 2.5); if (Math.abs(d) < 0.01) cam.yawTo = null; }
    if (cam.pitchTo != null) { const d = cam.pitchTo - cam.pitch; cam.pitch += d * Math.min(1, dt * 2); if (Math.abs(d) < 0.01) cam.pitchTo = null; } // (and up or down: story ctx look, level)
    // (in a car it stands back a little more with the speed, eased: a knock that stopped the car dead brought it in half a metre in a frame)
    cam.back = veh ? (cam.back || 0) + (Math.min(2.5, Math.abs(vs.v) * 0.05) - (cam.back || 0)) * Math.min(1, dt * 3) : 0;
    const dist = player.mode === 'heli' ? Math.max(cam.distTo ? cam.dist : 14, cam.dist) + Math.min(4, heli.st.speed * 0.08) : player.mode === 'ferry' || player.mode === 'rail' ? Math.max(25, cam.dist) : veh ? Math.max(5, cam.dist) + cam.back : cam.dist;
    const close = player.mode === 'foot';
    // (at the wheel: on the car along the ground, its bumps eased; a lag behind a moving car that is
    // eased frame by frame grows and shrinks with the frame time, and the car seems to lurch back and
    // forth in the picture whenever the frames come unevenly)
    if (veh) { const w = W(tx, ty, tz); camTarget.set(w.x, camTarget.y + (w.y - camTarget.y) * (1 - Math.exp(-dt * 14)), w.z); }
    // (the helicopter too: on it across, its climbs eased; a lag eased frame by frame grew with its speed and
    // with the frame time, so it jittered back and forth in the picture at speed, issue 335)
    else if (air) { const w = W(tx, ty, tz); camTarget.set(w.x, camTarget.y + (w.y - camTarget.y) * (1 - Math.exp(-dt * 6)), w.z); }
    else camTarget.lerp(W(tx, ty, tz), close ? 1 : k2);
    // keep the camera out of walls and cars: first rise over them (look down on the player), then come
    // closer. The lift and the pull-in are eased at a bounded rate rather than switched between steps,
    // so a tight spot never makes the view jump from one frame to the next (#97): it rises steadily when
    // a wall comes between (pulled in meanwhile), holds while it is needed, and settles back slowly once the way behind is open
    // Only what stays and hides the player moves it: a pole, a sign's post or a tree's trunk between (blocking the
    // line to the head but neither of two lines 0.6 m to each side of it) is looked past, and the traffic is not
    // probed at all. Both pumped the camera in and out as you walked past them or a car went by behind; a car that
    // comes to the camera itself still has it look down over its roof (below)
    const near = carBoxes(tx, ty, dist + 6, veh);
    const side = camSide, sa = camSideA, sb = camSideB;
    const thin = (a, b) => {
      side.set(b.z - a.z, 0, a.x - b.x);
      if (side.lengthSq() < 1e-6) return false;
      side.normalize();
      for (const s of [1, -1]) if (nav.clearFraction(sa.copy(side).multiplyScalar(s * 0.45).add(a), sb.copy(side).multiplyScalar(s * 0.6).add(b)) < 0.97) return false;
      return true;
    };
    // a tree's crown is not a wall, but a view through it is a screen of leaves (issue 19: the first line of a frame was
    // said through one): on foot the way from the head to the camera stops where it goes into the dense middle of a
    // crown (from its lowest leaves to its top, within three quarters of its reach), and the camera comes closer or
    // lower as it does for a wall. Not in a vehicle or the air, which look down over crowns
    const leafy = close ? postsNear(camTarget.x, -camTarget.z, dist + 8).filter(q => q.kind === 'tree' && q.hb != null) : [];
    const leaves = (a, b) => {
      let f = 1;
      for (const q of leafy) {
        const R = q.rc * 0.75, lo = q.z + q.hb + 0.2, hi = q.z + q.top;
        // (the way in plan, a.x/-a.z to b.x/-b.z, against the circle of the crown; then the heights where it is inside it)
        const ax = a.x, ay = -a.z, dx = b.x - a.x, dy = -b.z + a.z, A = dx * dx + dy * dy, B = 2 * ((ax - q.x) * dx + (ay - q.y) * dy), C = (ax - q.x) ** 2 + (ay - q.y) ** 2 - R * R;
        if (A < 1e-9) continue;
        const D = B * B - 4 * A * C;
        if (D <= 0) continue;
        const t0 = Math.max(0, (-B - Math.sqrt(D)) / (2 * A)), t1 = Math.min(1, (-B + Math.sqrt(D)) / (2 * A));
        if (t1 <= t0) continue;
        for (let k = 0; k <= 6; k++) { const t = t0 + (t1 - t0) * k / 6, z = a.y + (b.y - a.y) * t; if (z > lo && z < hi) { f = Math.min(f, Math.max(0, t - 0.04)); break; } }
      }
      return f;
    };
    // a trunk or a lamp post at the lens. The probe above does not see them (nav.clearFraction: the buildings, the
    // landmarks, the decks), and one between that is away from the lens is looked past, as a post is; but within 1.5 m of
    // it a trunk filled half a phone's frame and hid you (the planters' trees round Hachiko, since the camera came down
    // to the shoulder in issue 71): the camera comes in to stand in front of it, eased as for a wall
    const postAtLens = (a, b) => {
      if (!close || player.mode !== 'foot' || fpOn) return 1;
      const ax = a.x, ay = -a.z, dx = b.x - ax, dy = -b.z - ay, L = Math.hypot(dx, dy);
      if (L < 0.8) return 1;
      let t = 1;
      for (const q of postsNear(b.x, -b.z, 2.5)) {
        if ((q.kind !== 'tree' && q.kind !== 'lamp') || q.wall) continue; // (a planter's low rail and a queue belt are under the lens; a level's wall is wallCut's)
        if (b.y < q.z || b.y > q.z + (q.kind === 'tree' && q.hb != null ? q.hb + 0.5 : 7)) continue; // (over a tree's trunk, its crown is leaves(): above)
        const R = q.r + 0.4, s = Math.max(0, Math.min(1, ((q.x - ax) * dx + (q.y - ay) * dy) / (L * L))), px = ax + dx * s - q.x, py = ay + dy * s - q.y, d2 = px * px + py * py;
        if (d2 > R * R || (1 - s) * L > 1.5) continue;
        t = Math.min(t, Math.max(0, (s * L - Math.sqrt(R * R - d2)) / L));
      }
      return t;
    };
    // (riding a glass lift, the camera holds outside it, looking in through its glass: not pulled in by the shaft)
    // (a post is looked past only where it stands away from the lens: within 1.5 m of it, since the camera came down to the
    // shoulder (issue 71), a trunk or a pole filled half a phone's frame and hid you behind it, at Hachiko and frame 7's
    // corner; there the camera comes in past it, as for a wall)
    // (in the air nothing is looked past: what the probe meets up there is a tower's corner, not a post)
    // a hero level's walls (posts in a row, q.wall), which nav.clearFraction does not hold: the fraction of the line from your
    // head to the lens before it meets one, from its foot to 6 m over it, never looked past (in the air, over them)
    const wallCut = (a, b) => {
      if (air) return 1;
      const ax = a.x, ay = -a.z, dx = b.x - ax, dy = -b.z - ay, L = Math.hypot(dx, dy);
      if (L < 0.3) return 1;
      let t = 1;
      for (const q of postsNear(ax + dx / 2, ay + dy / 2, L / 2 + 0.6)) {
        if (!q.wall) continue;
        const R = q.r + 0.3, s = Math.max(0, Math.min(1, ((q.x - ax) * dx + (q.y - ay) * dy) / (L * L))), px = ax + dx * s - q.x, py = ay + dy * s - q.y, d2 = px * px + py * py;
        if (d2 > R * R) continue;
        const e = Math.max(0, (s * L - Math.sqrt(R * R - d2)) / L), z = a.y + (b.y - a.y) * e;
        if (z < q.z - 0.5 || z > q.z + 6) continue;
        t = Math.min(t, e);
      }
      return t;
    };
    // a hero level's drawn ceiling (heroSoffit, issue 208): the fraction of the line from your head to the lens before it
    // comes within CEIL_GAP of a ceiling over your head, sampled every 0.25 m; never looked past. Only on foot and at the
    // wheel (in the air the lens is over the roofs by design)
    const ceilCut = (a, b) => {
      if (air) return 1;
      const L = a.distanceTo(b), k = Math.max(1, Math.ceil(L / 0.25)), z0 = a.y - 0.4;
      for (let i = 1; i <= k; i++) {
        const t = i / k, y = a.y + (b.y - a.y) * t, c = heroCeil(a.x + (b.x - a.x) * t, -(a.z + (b.z - a.z) * t), z0);
        if (c !== null && y > c - CEIL_GAP) return (i - 1) / k;
      }
      return 1;
    };
    // (what of that is solid: all of it but the leaves, for the lens never to stand behind it, below)
    const solidCut = (a, b) => { const f = nav.clearFraction(a, b); return Math.min(f < 0.97 && (1 - f) * a.distanceTo(b) > 1.5 && thin(a, b) ? 1 : f, wallCut(a, b), ceilCut(a, b)); };
    const clear = player.mode === 'lift' ? () => 1 : (a, b) => { const f = nav.clearFraction(a, b), g = leafy.length ? leaves(a, b) : 1; return Math.min(f < 0.97 && (1 - f) * a.distanceTo(b) > 1.5 && !air && thin(a, b) ? 1 : f, g, wallCut(a, b), ceilCut(a, b)); };
    const orbit = (lift, out) => { const pitch = Math.min(1.35, cam.pitch + lift), cp = Math.cos(pitch); return out.set(camTarget.x - Math.sin(cam.yaw) * cp * dist, camTarget.y + Math.sin(pitch) * dist, camTarget.z + Math.cos(cam.yaw) * cp * dist); };
    // (and on foot, low among the people since issue 71, over whoever stands in the line from the lens to your head: the
    // lowest lift clear of the walls that is clear of them too, up to CROWD_LIFT; past that the view waits for them to
    // pass, as they do in a second or two, rather than climb to a first-floor window again. Not pulled in for them)
    const folk = close && player.mode === 'foot' && !fpOn ? folkNear(camTarget, dist) : null;
    let want = null, open = null;
    for (const lift of CAM_LIFTS) {
      const f = clear(camTarget, orbit(lift, camProbe));
      if ((!want || f > want.f + 0.05) && (!close || !lift || cam.pitch + lift <= pitchRoom(f * dist))) want = { f, lift };
      if (f >= 0.97) {
        if (!open) open = { f, lift }; else if (lift > CROWD_LIFT) break; // (not over a wall for them: the lowest clear of it)
        const by = !!(folk && folk.n && lift < CROWD_LIFT && folkAcross(folk, camTarget, camProbe));
        if (by) open.by = true; // (for cam.trace: someone stood across a lift clear of the walls)
        else { want = { f, lift, by: !!open.by }; open = null; break; }
      }
    }
    if (open) want = open; // (no lift clear of them: the lowest clear of the walls, as before)
    const jumped = cam.snap || camSmooth.lengthSq() === 0 || camSmooth.distanceTo(orbit(cam.lift, camProbe)) > 60; // after a teleport, or a stretch of advance()
    cam.snap = false;
    // Hemmed in (issue 99): a wall behind that no lift clears (a deck's flank 9 m high at the foot of SHIBUYA SKY's
    // escalators, a tower's face on the street) took the highest lift, since the steeper line gets a little further, and
    // then pulled the camera in along it: a metre over your head, looking straight down at your hair and the floor. And
    // something at your back that only the highest lift clears (a column at the foot of the escalator) stood it over
    // you the same. A passage narrower than the camera stands back is looked along instead: the view turns to the
    // nearest side that is open at shoulder height (cam.yawTo, as the story turns it), at once where the view was just put
    // there, after a third of a second where you walked into it. A hand on the view is not fought: not for a second after,
    // and not while you stand where you, or the story, turned it to (cam.hand: looking that way is what was asked for).
    // (cam.seek: a ride sets you down facing on; there the view is wanted near shoulder height though a higher lift is clear)
    if (clockT - cam.lastInput < 0.2) cam.hand = { yaw: cam.yaw, x: player.x, y: player.y };
    if (cam.yawTo == null) cam.swung = false; else if (!cam.swung) cam.hand = { yaw: cam.yawTo, x: player.x, y: player.y }; // (and where the story turns the view to, as a hand's)
    const seek = !!cam.seek, hemmed = want.f < 0.5 || want.lift >= 0.8 || (seek && want.lift > 0.3);
    const chose = !!cam.hand && Math.abs(angDiff(cam.yaw, cam.hand.yaw)) < 0.25 && Math.hypot(player.x - cam.hand.x, player.y - cam.hand.y) < 2;
    cam.seek = false;
    if (close && player.mode === 'foot' && !fpOn && hemmed && (seek || (cam.yawTo == null && !cine.active && !chose && clockT - cam.lastInput > 1))) {
      cam.hem = (cam.hem || 0) + dt;
      if (seek || jumped || cam.hem > 0.3) {
        const yaw0 = cam.yaw, first = angDiff(player.h, yaw0) < 0 ? -1 : 1, LOW = [0, 0.15, 0.3]; // (towards behind where you face first: you look where you go)
        const low = () => LOW.find(l => clear(camTarget, orbit(l, camProbe)) >= 0.97);
        let to = null;
        for (let k = 1; k <= (seek ? 10 : 6) && to == null; k++) for (const sg of [first, -first]) {
          cam.yaw = yaw0 + sg * k * 0.3;
          if (low() != null) { to = cam.yaw; break; }
        }
        cam.yaw = yaw0; cam.hem = 0;
        if (to != null) { if (seek || jumped) { cam.yaw = to; cam.yawTo = null; want = { f: 1, lift: low() }; cam.lift = want.lift; cam.liftHold = 0; } else { cam.yawTo = to; cam.swung = true; } }
      }
    } else cam.hem = 0;
    if (jumped) { cam.lift = want.lift; cam.liftHold = 0; }
    // (up at 0.8 rad/s at most, the pull-in covering the wall meanwhile: at 2 rad/s it reared up 45 degrees in half a
    // second. It comes down only once a lower lift has been clear for 0.6 s running: a wall's edge flickering in and
    // out of the probe from one frame to the next no longer starts it down and back up)
    else if (want.lift > cam.lift) { cam.lift = Math.min(want.lift, cam.lift + Math.min((want.lift - cam.lift) * dt * 4, dt * 0.8)); cam.liftHold = 0.6; }
    else if (want.lift > cam.lift - 0.01) cam.liftHold = 0.6;
    else if ((cam.liftHold -= dt) <= 0) cam.lift = Math.max(want.lift, cam.lift - Math.min((cam.lift - want.lift) * dt * 2, dt * 0.5));
    // (in the air the helicopter's body as well as the point over it the lens looks at: beside a tower's roof one was in
    // sight and the other not, and the helicopter was hidden behind the roof's edge for seconds)
    const f = Math.min(clear(camTarget, orbit(cam.lift, camPos)), postAtLens(camTarget, camPos), air ? clear(heliMid.set(heli.st.x, heli.st.z + 0.8, -heli.st.y), camPos) : 1), pull = f < 1 ? Math.max(close ? 0.06 / dist : 0.15, f - 0.04) : 1;
    if (jumped) cam.pull = pull;
    // (behind a level's wall the lens comes in front of it at once, as in the air: eased in, a swing round put it behind the
    // wall for a few frames, the wall's back filling the picture. And behind any wall: where the lens eased in so far would
    // stand this frame, past a building's wall, a ceiling or a level's wall on the line from your head (not leaves, nor a post
    // or a column looked past), it is in front of it in this frame. Under the canopies south-west of the Scramble a turn on the
    // spot put the lens 2.6 m behind a building cell's wall for 7 frames, the pull-in easing in at 0.79: issue 217)
    const wallIn = pull < 1 && (wallCut(camTarget, camPos) < 0.97 || (!air && pull < cam.pull && solidCut(camTarget, camProbe.lerpVectors(camTarget, camPos, cam.pull)) < 0.97));
    // (in the air a tower comes between in a frame: the lens is in front of it in that frame, and eases back out after it.
    // Eased in as on the street, at 170 km/h the helicopter went behind a tower's corner for a few frames and came out
    // again, hidden and shown, as if the model had a hole in it: the owner's report, November 2026)
    // And it looks half a second ahead along the helicopter's way, so that it is usually already coming in, eased, when
    // the tower comes between (a lens that only met the wall when it was there jumped 15 to 20 m in one frame)
    let pullAhead = pull;
    if (air && !jumped) {
      const T = 0.5, ax = heli.st.vx * T, ay = heli.st.vy * T, az = (heli.st.vz || 0) * T;
      aheadT.set(camTarget.x + ax, camTarget.y + az, camTarget.z - ay); aheadP.set(camPos.x + ax, camPos.y + az, camPos.z - ay); aheadM.set(heliMid.x + ax, heliMid.y + az, heliMid.z - ay);
      const fa = Math.min(clear(aheadT, aheadP), clear(aheadM, aheadP));
      if (fa < 1) pullAhead = Math.min(pull, Math.max(0.15, fa - 0.04));
    }
    if (jumped) { /* (set above) */ } else if ((air || wallIn) && pull < cam.pull) cam.pull = pull;
    else cam.pull += pullAhead < cam.pull ? -Math.min(cam.pull - pullAhead, Math.max(dt * (air ? 3 : 2), (cam.pull - pullAhead) * dt * 4)) : Math.min(pullAhead - cam.pull, dt * 0.8);
    if (cam.pull < 1) camPos.lerpVectors(camTarget, camPos, cam.pull);
    // pulled in that close by a wall, it may be over a car: then it looks down over the roof
    for (const q of near) if (OECars.pushOut(camPos.x, -camPos.z, q.z + 0.5, 0.35, [q]).hit) camPos.y = Math.max(camPos.y, q.z + q.top + 0.45);
    // eased as an offset from what it looks at, not as a place in the world: moving with the car (or
    // the walker) at any speed it keeps its distance exactly, whatever the frame time, and only the
    // swing round, the lift and the pull-in are eased
    camWant.subVectors(camPos, camTarget);
    if (jumped || camSmooth.distanceTo(camPos) > 60 || camOff.distanceTo(camWant) > 60) camOff.copy(camWant);
    camOff.lerp(camWant, close ? 1 - Math.exp(-dt * 10) : veh ? 1 - Math.exp(-dt * 16) : air ? 1 - Math.exp(-dt * 7) : 1);
    if ((air || wallIn) && cam.pull < 1 && camOff.lengthSq() > camWant.lengthSq()) camOff.setLength(camWant.length()); // (and its easing never holds it out past the wall)
    camPos.addVectors(camTarget, camOff);
    // (and where the swing's easing leaves it, on foot: the offset eased round as you turn cuts a wall's corner on its way, the
    // lens a few decimetres behind the station passage's walls for up to 10 frames of a turn on the spot. On the line it is on,
    // in front of whatever solid stands there, in this frame: issue 217)
    if (close && !jumped) { const fs = solidCut(camTarget, camPos); if (fs < 0.97) camPos.lerpVectors(camTarget, camPos, Math.max(0.06 / Math.max(0.06, camTarget.distanceTo(camPos)), fs - 0.04)); }
    camSmooth.copy(camPos);
    // the floor under the camera: the ground (or the water; under a slab, the floor) at once, steps and
    // decks below the player's head eased in, so walking onto a stair or a deck lifts the view smoothly
    const ground = Math.max(0, nav.terrainBelow(camPos.x, -camPos.z, camTarget.y + 0.5));
    let gz = ground;
    for (const st of nav.strips) {
      const h = nav.stripHeight(st, camPos.x, -camPos.z);
      if (h != null && h < camTarget.y + 0.5 && h > gz) gz = h;
    }
    nav.decksAt(camPos.x, -camPos.z, h => { if (h < camTarget.y + 0.5 && h > gz) gz = h; });
    const y0 = camPos.y;
    cam.floor = jumped || cam.floor == null ? gz : cam.floor + (gz - cam.floor) * Math.min(1, dt * 8);
    camPos.y = Math.max(camPos.y, ground + 0.5, cam.floor + 0.5);
    const yFloor = camPos.y;
    const ceil = nav.ceilingAt(camPos.x, -camPos.z, camTarget.y - 1); // under a slab (a colonnade): below its soffit
    if (ceil !== null && camPos.y > ceil - 0.2) camPos.y = Math.max(ground + 0.5, ceil - 0.2);
    // and under a ceiling a hero level draws (heroSoffit, issue 208): below it whatever the floor under the lens says (the
    // ground modelled under the station rises through the passage's floor, and lifted the lens to it: the drawn ceiling is
    // what the player sees, so it wins)
    const hceil = air ? null : heroCeil(camPos.x, -camPos.z, camTarget.y - 0.4);
    if (hceil !== null && camPos.y > hceil - CEIL_GAP) camPos.y = Math.max(camTarget.y - 0.4, hceil - CEIL_GAP);
    // lifted over steps (a stairwell's flight beside a colonnade), the line to the head can graze what the
    // probe went round, the edge of the slab over the well: then closer in along it
    if (camPos.y !== y0 && player.mode === 'foot') {
      const f = solidCut(camTarget, camPos); // (the walls, the levels and the ceilings, as the line test above: issue 217)
      if (f < 1) camPos.lerpVectors(camTarget, camPos, Math.max(close ? 0.06 / Math.max(0.06, camTarget.distanceTo(camPos)) : 0.15, f - 0.04));
    }
    // (what this frame did, for a harness that sets cam.trace to an object: tools/cam_jumps.js)
    if (cam.trace) Object.assign(cam.trace, { jumped, f, wallIn, pullWant: pull, wantLift: want.lift, folk: !!want.by, floorUp: yFloor - y0, ceilDown: yFloor - camPos.y, gz, floor: cam.floor, pre: camSmooth.toArray() });
    live.pos.copy(camPos);
    live.look.copy(camTarget);
    // looking up at a landmark on arrival (cam.tilt): over your head, until you move, steer or drag the view
    if (cam.tilt > 0.001) {
      if (moving || clockT - cam.lastInput < 0.5 || !(player.mode === 'foot' || player.mode === 'car')) cam.tilt *= Math.max(0, 1 - dt * 2.5);
      live.look.y += Math.tan(cam.tilt) * Math.hypot(camPos.x - camTarget.x, camPos.z - camTarget.z);
    } else cam.tilt = 0;
    live.half = player.mode === 'heli' ? 520 : player.mode === 'ferry' ? 320 : veh ? 220 : 170;
  }
  // from your seat: the eye over the cushion, looking ahead as the car turns (drag to look
  // round; the look comes back ahead when let go)
  const eye = new THREE.Vector3();
  function cabinView(dt, o, st) {
    const seat = o === myCar ? 'driver' : rideSeat(o), back = clockT - cam.lastInput > 1.2 ? Math.max(0, 1 - dt * 3) : 1;
    o.C.body.updateWorldMatrix(true, false); // where the car is this frame, not where it was last drawn
    // (from the back seat, leaning in towards the middle, as a passenger does to see the road between the front seats' headrests)
    const s0 = o.C.seats[seat];
    o.C.body.localToWorld(seat === 'driver' || seat === 'passenger' ? eye.copy(s0).add(new THREE.Vector3(0, 0.7, 0.08)) : eye.set(s0.x * 0.3, s0.y + 0.66, s0.z + 0.12));
    cam.yaw = st.h + angDiff(cam.yaw, st.h) * back;
    cam.pitch = 0.2 + (cam.pitch - 0.2) * back;
    const p = -(cam.pitch - 0.2) * 0.8 - 0.06;
    live.pos.copy(eye);
    live.look.set(eye.x + Math.sin(cam.yaw) * Math.cos(p) * 10, eye.y + Math.sin(p) * 10, eye.z - Math.cos(cam.yaw) * Math.cos(p) * 10);
    live.half = 170;
    camTarget.copy(eye); camSmooth.copy(eye);
  }

  // ------------------------------------------------------------ camera shots (cine.js)
  // the highest surface (roof, deck or ground) within a cell of (x, y), and along a line in 16 m blocks
  function roofBelow(x, y) {
    const c = Math.floor((x - DSM.x0) / DSM.cell), r = Math.floor((DSM.y1 - y) / DSM.cell);
    let top = 0;
    for (let i = r - 1; i <= r + 1; i++) for (let j = c - 1; j <= c + 1; j++) if (i >= 0 && j >= 0 && i < DSM.ny && j < DSM.nx) top = Math.max(top, DSM.data[i * DSM.nx + j]);
    return top;
  }
  function roofAlong(x0, y0, x1, y1) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 12), bs = 8 * DSM.cell;
    let top = 0;
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n, bc = Math.floor((x - DSM.x0) / bs), br = Math.floor((DSM.y1 - y) / bs);
      if (bc >= 0 && br >= 0 && bc < DSM.bx && br < DSM.by) top = Math.max(top, DSM.M[br * DSM.bx + bc]);
    }
    return top;
  }
  // the chase camera's bearing, distance and height from the player's head
  const head = () => W(player.x, player.y, player.z + 1.55);
  const chasePolar = () => ({ az: cam.yaw + Math.PI, dist: Math.cos(cam.pitch) * cam.dist, h: Math.sin(cam.pitch) * cam.dist });
  // where the chase camera will really be, lifted over a wall behind or pulled in (rig): a move lands on that, not on
  // the pose cam asks for, or the hand-over has to tilt the difference in its last half second (#340: the stairs)
  const livePolar = () => { cam.snap = true; rig(0); cam.snap = true; return OECine.polar(head(), live.pos); };
  const handOver = (k, from = 0.8) => OECine.ease.smooth(OECine.span(k, from, 1)); // weight of the live rig at the end of a shot
  // Start (#89): one eased move from the title shot down to over the player's shoulder, calm enough not to
  // make anyone dizzy. The camera dollies in along the bearing it is already on, turning about the player by
  // at most ARRIVE.turn, spread evenly over the whole move (so it never swings round them, spins or changes
  // direction), with the horizon level. Its distance closes on a log scale, so the approach is a steady glide
  // and not a rush at the end, and the point it looks at closes on the player at the same rate, so the view's
  // direction hardly turns. The player turns to face the way the shot looks, as near the start's own view as
  // that turn allows with a few steps clear in front. The camera lifts smoothly over any roof on its line,
  // never jumping. A key or a tap settles it in under a second (settleArrival); with reduced motion it is a
  // cut under a short fade. Moving is allowed throughout. onDone runs once it has handed over.
  const ARRIVE = { dur: 3.6, turn: 50 * Math.PI / 180, pitch: 14 * Math.PI / 180, settle: 0.7 };
  let arriving = null;
  const clearAhead = h => { // a few steps' walk in front of the player along bearing h
    let z = player.z;
    for (let d = 0.5; d <= 3; d += 0.5) { const w = nav.walk(player.x + Math.sin(h) * d, player.y + Math.cos(h) * d, z, true); if (!w.ok) return false; z = w.z; }
    return true;
  };
  // the chase bearing (behind the player) within ARRIVE.turn of az0 that is nearest to want, with room to walk on
  function calmBearing(az0, want) {
    const t = OECine.turn(az0, want);
    if (Math.abs(t) <= ARRIVE.turn && clearAhead(want - Math.PI)) return want;
    const c = [];
    for (let a = -ARRIVE.turn; a <= ARRIVE.turn + 1e-6; a += ARRIVE.turn / 5) c.push(az0 + a);
    c.sort((a, b) => Math.abs(OECine.turn(a, want)) - Math.abs(OECine.turn(b, want)));
    return c.find(a => clearAhead(a - Math.PI)) ?? c[0];
  }
  // The elevation of a camera move about a centre c (bearing az(k), range r(k), elevation e(k), k 0..1 over dur
  // seconds), raised where the line would pass within `clear` m (8) of a roof while the camera is over rMin away, and made
  // into an envelope that rises and falls no faster than rate (rad/s): the camera comes over a tower and down again
  // without a jolt. Near the player the chase camera's own clearance takes over. With e0, the first frame keeps
  // that elevation and any lift is eased in. Returns k -> elevation.
  function calmElevation({ c, az, r, e, dur, rate, e0 = null, rMin = 40, upto = 0.85, clear = 8 }) {
    const N = 60, el = new Float32Array(N + 1), tmp = new THREE.Vector3(), S = OECine.ease.smooth;
    for (let i = 0; i <= N; i++) {
      const k = i / N, rk = r(k);
      let ek = e(k);
      if (k < upto && rk > rMin) for (let n = 0; n < 14; n++) { // up in steps until it is 8 m over what is below it
        OECine.around(c, az(k), rk * Math.cos(ek), rk * Math.sin(ek), tmp);
        if (tmp.y >= roofBelow(tmp.x, -tmp.z) + clear || ek > 1.3) break;
        ek = Math.min(1.3, ek + 0.08);
      }
      el[i] = ek;
    }
    const step = rate * dur / N;
    for (let i = 1; i <= N; i++) el[i] = Math.max(el[i], el[i - 1] - step);
    for (let i = N - 1; i >= 0; i--) el[i] = Math.max(el[i], el[i + 1] - step);
    const early = e0 != null ? el[0] - e0 : 0; // how far above the first frame the roofs want it straight away
    // (eased in over a third of the move, or longer if that would tilt faster than rate: the smootherstep peaks at 1.875)
    if (early > 0) { const M = Math.min(N, Math.max(N / 3, Math.ceil(1.875 * early / step))); for (let i = 0; i <= M; i++) el[i] -= early * (1 - S(i / M)); }
    const fn = k => { const f = Math.max(0, Math.min(N, k * N)), i = Math.floor(f), j = Math.min(N, i + 1); return el[i] + (el[j] - el[i]) * (f - i); };
    fn.late = el[N] - e(1); // how far above its own last elevation the roofs held it: more time is needed to come down calmly
    fn.max = Math.max(...el); // the steepest it gets
    fn.early = early;
    return fn;
  }
  // The level the player stands in (hero.js) comes seconds after the game opens on a phone: until it is ready the city's
  // own Scramble is drawn there (its plaza, flat asphalt and paint), and the level then took its place in view. The owner's
  // iPhone skipped the opening and saw it in frame 1, six seconds after the load (issue 62). So the way in (the opening's
  // skip, the crane down from the title, a story taken up again) waits for it behind a veil, the loader's ground with the
  // place's name on it, at most LEVEL_WAIT_S; the shot is held under it, and the camera reaches the player once the level is drawn.
  const LEVEL_WAIT_S = +((location.search.match(/[?&]levelwait=(\d+)/) || [])[1] || 6); // (?levelwait=s: a harness's own bound, tools/level_wait.js)
  const levelReady = () => !hero || hero.levels.every(L => L.state === 'ready' || L.state === 'failed' || Math.hypot(player.x - L.h.at[0], player.y - L.h.at[1]) > (L.h.r || 100));
  let levelHold = null;
  // done: what the way in does once the level is ready (or the wait is over); false when there is nothing to wait for
  // telemetry's level_wait (issue 69): how long a way in waited, whether the level came, and its warm-up's steps so far (hero.js
  // load: ms from the level being asked for to its file, shrunk, packed, compiled, uploaded), the real phone's numbers
  const levelSay = (s, ready) => {
    if (!(window.OETelemetry && OETelemetry.track)) return;
    const L = hero && hero.levels.find(L => Math.hypot(player.x - L.h.at[0], player.y - L.h.at[1]) <= (L.h.r || 100));
    OETelemetry.track('level_wait', Object.assign({ s: +s.toFixed(1), ready, tier: QC.name, level: L ? L.h.id : undefined, state: L ? L.state : undefined }, L && L.steps ? Object.fromEntries(Object.entries(L.steps).map(([k, v]) => [`${k}_ms`, v])) : {}));
  };
  function holdForLevel(done) {
    if (levelReady()) { levelSay(0, true); return false; }
    const v = document.createElement('div'), t0 = performance.now();
    v.className = 'g-veil'; v.setAttribute('aria-hidden', 'true');
    v.innerHTML = `<b>${((G.overture || {}).title || {}).name || CITY.native || CITY.name}</b><i style="animation-duration:${LEVEL_WAIT_S}s"></i>`;
    stage.appendChild(v); void v.offsetWidth; v.classList.add('on');
    levelHold = { t0 };
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (t < 0.5 || (!levelReady() && t < LEVEL_WAIT_S)) { setTimeout(tick, 100); return; } // (the veil up first: the level never comes in half seen)
      levelHold = null;
      console.info(`the way in waited ${t.toFixed(1)} s for the level${levelReady() ? '' : ', and went on without it'}`);
      levelSay(t, levelReady());
      done();
      setTimeout(() => { v.classList.remove('on'); setTimeout(() => v.remove(), 700); }, 300); // (a few frames for it to be drawn under the veil)
    };
    setTimeout(tick, 100);
    return true;
  }
  function craneIn(onDone = null, waited = false) {
    // (held on the title's view behind the veil until the level is ready, or the wait is over; a tap meanwhile does not end it)
    if (!waited && holdForLevel(() => craneIn(onDone, true))) { const pos = camera.position.clone(), look = titleLook.clone(); arriving = { onDone: null, settling: true }; cine.play(() => ({ pos, look }), 60, { label: 'crane' }); return; }
    const H0 = head(), lk0 = titleLook.clone().sub(H0), p0 = OECine.polar(H0, camera.position);
    const shot = openingHere(), dur = shot ? OPENING.dur : ARRIVE.dur;
    if (shot) player.h = OPENING.face; // (the start's own view: the shot was framed behind it)
    const best = calmBearing(p0.az, player.h + Math.PI);
    player.h = best - Math.PI;
    cam.mode = 'chase'; cam.yaw = player.h; cam.pitch = FOOT.pitch; cam.dist = FOOT.dist; cam.tilt = 0;
    camSmooth.set(0, 0, 0);
    const p1 = livePolar(), az1 = p0.az + OECine.turn(p0.az, p1.az);
    const r0 = Math.max(10, Math.hypot(p0.dist, p0.h)), r1 = Math.hypot(p1.dist, p1.h), e0 = Math.atan2(p0.h, p0.dist), e1 = Math.atan2(p1.h, p1.dist);
    const S = OECine.ease.smooth, pos = new THREE.Vector3(), lk = new THREE.Vector3();
    const rAt = k => r0 * Math.pow(r1 / r0, S(k)), azAt = k => p0.az + (az1 - p0.az) * S(k);
    const elAt = calmElevation({ c: H0, az: azAt, r: rAt, e: k => e0 + (e1 - e0) * S(k), dur, rate: ARRIVE.pitch, e0, clear: shot ? 24 : 8 }); // (an opening shot passes over the roofs' screens and signs, which the DSM leaves out)
    // the title's point of interest, closing on the player faster than the camera; in an opening shot held on
    // it (the screens) while the camera comes down to the street, then down to the player: the crane's tilt
    const lkW = shot ? k => 1 - S(OECine.span(k, 0.4, 0.92)) : (k, r) => Math.pow(r / r0, 1.5);
    const path = k => {
      const c = head(), r = rAt(k), e = elAt(k);
      OECine.around(c, azAt(k), r * Math.cos(e), r * Math.sin(e), pos);
      lk.copy(lk0).multiplyScalar(lkW(k, r)).add(c);
      return { pos, look: lk };
    };
    arriving = { onDone, settling: false };
    if (reduced) { stage.classList.remove('arrive-fade'); void stage.offsetWidth; stage.classList.add('arrive-fade'); }
    cine.play(OECine.mix(path, () => live, k => handOver(k)), dur, { label: 'crane', onEnd: () => { if (arriving && !arriving.settling) arrived(); } });
  }
  function arrived() {
    const a = arriving;
    arriving = null;
    if (a && a.onDone) a.onDone();
  }
  // a key or a tap during the arrival: ease from where the camera is to the chase camera, quickly but not a cut
  function settleArrival() {
    if (!arriving || arriving.settling || !cine.active || cine.label !== 'crane') return;
    arriving.settling = true;
    const from = { pos: camera.position.clone(), look: camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(Math.max(5, camera.position.distanceTo(head()))).add(camera.position) };
    cine.play(OECine.mix(() => from, () => live, k => OECine.ease.smooth(k)), ARRIVE.settle, { label: 'crane', onEnd: arrived });
  }
  // A lift: the camera climbs the tower's face (or comes down it) while the player rides, at the lift's own
  // speed with the time shortened, and hands back to the chase camera at the far stop, facing on.
  function rideLift(l, from, to) {
    if (life) life.emit('ride', { kind: 'lift', route: l.id, from: l.stops[from].name, to: l.stops[to].name, name: l.name, toName: l.stops[to].name });
    if (liftCar(l)) { rideLiftCar(l, from, to); return; }
    if (l.pod) { podRide(l, from, to); return; }
    const a = l.stops[from], b = l.stops[to], dz = b.at[2] - a.at[2];
    const realS = Math.abs(dz) / ((l.m_per_min || 240) / 60), dur = Math.min(12, Math.max(4.5, realS / 3.2));
    // One shot (issue 99), from the shoulder you had to the shoulder you get: the camera leaves you at the doors looking
    // up the face to where the lift goes, climbs the tower beside its shaft with the floors going by, standing off the
    // face in the middle of the climb so that the height is seen, and comes in over the glass where you step out. It
    // was a spiral about the line between the stops, which runs inside the tower: 20 m off at once (a cut), looking at
    // a point nobody can see, and at the top it handed over to a view from over your head.
    // The side it climbs on is the open one: of the two sides of the line between the stops, the one whose way up is
    // clear of the buildings (nav.clearFraction along it); a shaft that goes straight up is climbed on the camera's side.
    const A = head(), B = W(b.at[0], b.at[1], b.at[2] + 1.55), S0 = camera.position.clone(), run = Math.hypot(b.at[0] - a.at[0], b.at[1] - a.at[1]);
    const t = run > 8 ? new THREE.Vector3(B.x - A.x, 0, B.z - A.z).normalize() : new THREE.Vector3(A.x - S0.x, 0, A.z - S0.z).normalize(), n0 = new THREE.Vector3(-t.z, 0, t.x);
    const OUT = Math.min(26, Math.max(12, Math.abs(dz) * 0.1)), OFF = 13, UP = 7;
    const cv = Math.abs(dz) > 60 ? l.view || (G.start && G.start.at) : null, city = cv ? W(cv[0], cv[1], (nav.terrain(cv[0], cv[1]) || 0) + 8) : null, d1 = new THREE.Vector3(), d2 = new THREE.Vector3();
    // (S1: where the climb sets off from. Where no way up from the chase camera's own place is clear, the shot first comes in
    // toward your shoulder over its first sixth, into the open air of the hall, and climbs from there: SKY GATE's chase camera
    // stands 5.5 m west of the stop under the edge of Scramble Square's base, and every way up from it went through the
    // overhang, the clearest of them taken anyway, issue 181)
    const way = (n, h0 = 0, h1 = 0, S1 = S0) => {
      const E = B.clone().addScaledVector(n, OFF).addScaledVector(t, run > 8 ? -9 : 0); E.y += UP;
      const pos = new THREE.Vector3(), lk = new THREE.Vector3(), Sk = new THREE.Vector3();
      return k => {
        const e = OECine.ease.inOut(k), g = Math.min(1, e + 0.24 * Math.sin(Math.PI * k)); // (the look runs on ahead of the camera: up the face, to where you are going)
        const eh = h0 || h1 ? OECine.ease.inOut(OECine.span(k, h0, 1 - h1)) : e; // (across: held back while it rises out of a well, below)
        Sk.lerpVectors(S0, S1, OECine.ease.inOut(OECine.span(k, 0, 0.16)));
        pos.lerpVectors(Sk, E, eh).addScaledVector(n, OUT * Math.sin(Math.PI * eh));
        pos.y = Sk.y + (E.y - Sk.y) * e;
        lk.lerpVectors(A, B, g);
        // The climb is the city's (issue 144: the shot looked up the tower's face all the way, curtain wall and sky, and
        // the night it rises through was behind the lens). Once it has left your shoulder the view turns out from the
        // face to the place the story is played (the lift's own `view`, else where the map starts), which falls away
        // under the frame as the floors go by, and comes round to where you step out over the last third. The turn is
        // of the view's direction, not of a point looked at: a point 400 m off mixed with one 15 m off turns in a snap.
        const w = city ? OECine.ease.smooth(OECine.span(k, Math.max(0.06, h0 * 0.7), Math.max(0.3, h0 + 0.12))) * (1 - OECine.ease.smooth(OECine.span(k, 0.5, 0.86))) : 0;
        if (w > 0) {
          d1.subVectors(lk, pos).normalize(); d2.subVectors(city, pos).normalize();
          lk.copy(pos).addScaledVector(d1.lerp(d2, w).normalize(), 60);
        }
        return { pos, look: lk };
      };
    };
    // And it leaves a stop that stands under something by the air over it (issue 144): SKY GATE's hall is open to the sky
    // beside the tower's overhanging base, and a camera that set off across at once went through the overhang (a frame of
    // pale panel edge to edge), or was put on the roofline by the shot's clamp, a jump. So the way across can be held back
    // while the camera rises where it stands (h0, for a ride up) or brought to its end early (h1, for one down): the first
    // of these, on either side, that is clear all the way is taken, else the clearest.
    const open = f => { const q = f(0).pos.clone(); let c = 1; for (let i = 1; i <= 24 && c > 0; i++) { const r = f(i / 24).pos; c = Math.min(c, nav.clearFraction(q, r)); q.copy(r); } return c; };
    const n1 = n0.clone().negate();
    let climb = null, best = -1;
    for (const s of [1, 0.6, 0.3]) {
      const S1 = s === 1 ? S0 : A.clone().lerp(S0, s);
      if (s < 1 && nav.clearFraction(A, S1) < 0.99) continue; // (a start in toward you only where the chase camera itself could stand)
      for (const h of [0, 0.15, 0.3, 0.4]) {
        for (const n of [n0, n1]) { const f = dz >= 0 ? way(n, h, 0, S1) : way(n, 0, h, S1), c = open(f); if (c > best + 1e-6) { best = c; climb = f; } }
        if (best >= 0.99) break;
      }
      if (best >= 0.99) break;
    }
    // (the far stop's fine collision is laid on the way there, a few ms a frame: where you step out to and where the
    // camera can stand are asked of it the moment you arrive)
    const path = k => { if (k < 0.5) nav.prefetch(b.at[0], b.at[1], 30, 3); return climb(k); };
    H.toast(`<b>${l.line || l.name}</b><span>${b.name}: ${Math.round(Math.abs(dz))} m in ${Math.round(realS)} s at ${l.m_per_min || 240} m a minute</span>`);
    liftHop = clockT + dur; // (in its car for the ride, to the sound: weatherTick's mix)
    cine.play(OECine.mix(path, () => live, k => handOver(k, 0.8)), dur, { label: 'hop',
      cues: [[0.5, () => {
        [player.x, player.y, player.z] = b.at;
        if (b.face) player.h = Math.atan2(b.face[0], b.face[1]);
        player.speed = 0; player.vz = 0; player.ground = true;
        cam.mode = 'chase'; cam.yaw = player.h; cam.pitch = FOOT.pitch; cam.dist = FOOT.dist; cam.snap = true;
        groundLod(player.x, player.y);
        liftLeft = { l, i: to }; // (no ride offered back until you have walked out of the stop: liftStop)
        save();
        // Out of the doors: a stop that says which way it lets out (face) is walked out of, the few steps to where the
        // camera has room behind your shoulder (SHIBUYA SKY 46F sets you down 2.5 m from the corner's glass: stood there,
        // the view had to climb over the glass or turn from the escalators), while the camera comes in over the glass. The
        // game's own walk (player.auto): a step of yours ends it. Where there is no such place, the view turns (cam.seek).
        nav.prefetch(b.at[0], b.at[1], 12, Infinity); // (what is left of it round the stop, where the shot was skipped)
        const out = b.face ? liftOut(b) : null;
        if (out) player.auto = { x: out[0], y: out[1], t: 0, label: '', then: () => { cam.seek = true; }, cancel: () => { cam.seek = true; } };
        else cam.seek = true;
      }]],
      onEnd: () => { liftHop = -1; if (A.liftChime) A.liftChime(); H.toast(`${b.name}.`); } });
  }
  // a view turned to yaw, or to the nearest of the turns either side of it (up to 0.6 rad) where the chase camera's place
  // behind your shoulder, and 1.5 m past it, is clear (nav.clearFraction): the first that is, else yaw
  function hallYaw(yaw) {
    const hd = W(player.x, player.y, player.z + 1.55), c = new THREE.Vector3(), r = FOOT.dist + 1.5, cp = Math.cos(FOOT.pitch) * r;
    for (const d of [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6, -0.6]) {
      const y = yaw + d;
      c.set(hd.x - Math.sin(y) * cp, hd.y + Math.sin(FOOT.pitch) * r, hd.z + Math.cos(y) * cp);
      if (nav.clearFraction(hd, c) >= 0.99) return y;
    }
    return yaw;
  }
  // where to step to for a view turned to `at` [x, y]: null where the chase camera already has its place behind your
  // shoulder that way, else the nearest place toward it, within 6 m and walked to in a straight line, where it has
  function lookRoom(at) {
    const dx = at[0] - player.x, dy = at[1] - player.y, L = Math.hypot(dx, dy);
    if (L < 3) return null;
    const fx = dx / L, fy = dy / L, z = player.z, yaw = Math.atan2(fx, fy), cp = Math.cos(FOOT.pitch) * FOOT.dist;
    const clearAt = (x, y) => { const hd = W(x, y, z + 1.55), c = new THREE.Vector3(hd.x - Math.sin(yaw) * cp, hd.y + Math.sin(FOOT.pitch) * FOOT.dist, hd.z + Math.cos(yaw) * cp); return nav.clearFraction(hd, c) >= 0.97; };
    if (clearAt(player.x, player.y)) return null;
    for (let d = 0.5; d <= Math.min(6, L - 2) + 0.01; d += 0.5) {
      const x = player.x + fx * d, y = player.y + fy * d;
      if (!nav.walk(x, y, z, true).ok || !nav.room(x, y, z, 0.35)) return null;
      if (clearAt(x, y)) return [x + fx * 1.2, y + fy * 1.2]; // (the walk ends 0.7 m short of where it is sent; half a metre past the first clear place)
    }
    return null;
  }
  // where a lift's stop lets you out to: along its face, the nearest place within 3.5 m that can be walked to in a
  // straight line and has the chase camera's place behind your shoulder clear (nav.clearFraction); [x, y] or null
  function liftOut(b) {
    const [fx, fy] = b.face, z = b.at[2], yaw = Math.atan2(fx, fy), cp = Math.cos(FOOT.pitch) * FOOT.dist;
    for (let d = 0.5; d <= 3.51; d += 0.5) {
      const x = b.at[0] + fx * d, y = b.at[1] + fy * d;
      if (!nav.walk(x, y, z, true).ok || !nav.room(x, y, z, 0.35)) return null;
      if (d < 1.5) continue;
      const hd = W(x, y, z + 1.55), c = new THREE.Vector3(hd.x - Math.sin(yaw) * cp, hd.y + Math.sin(FOOT.pitch) * FOOT.dist, hd.z + Math.cos(yaw) * cp);
      if (nav.clearFraction(hd, c) >= 0.97) return [x + fx * 0.6, y + fy * 0.6]; // (the walk ends 0.7 m short of where it is sent)
    }
    return null;
  }

  // A lift ridden in the dark (game.json lifts[].pod; SHIBUYA SKY's SKY GATE was, until the owner found the tower climbed
  // from outside the better and the dark ride odd, November 2026: rideLift above; docs/cities/shibuya.md). The real one is
  // a car with black walls, its whole ceiling a screen whose picture keeps pace with the climb, lines of light that
  // change as it moves and its floor lamps dark until it stops (Hitachi; Rhizomatiks; Elevator Journal 28). So the ride
  // is that, not the camera climbing the tower's face outside, which read as a jump across the map and spent the view
  // from the roof before the roof: the doors close on the lobby, the car's dark, its ceiling going from the street's
  // light to the sky's and its lines running down as it climbs, the floors it passes not shown; then the doors open on
  // the top stop. Its time is the real one shortened (30 s to some 7), and a key or a tap still ends it at once.
  let pod = null;
  function podRide(l, from, to) {
    const P = l.pod, a = l.stops[from], b = l.stops[to], up = b.at[2] >= a.at[2], dz = Math.abs(b.at[2] - a.at[2]);
    const realS = P.s || dz / ((l.m_per_min || 240) / 60), dur = reduced ? 0.01 : Math.min(8, Math.max(6, realS / 4.5));
    if (!pod) {
      pod = document.createElement('div');
      pod.id = 'g-pod'; pod.setAttribute('aria-hidden', 'true');
      pod.innerHTML = '<i class="ceil"></i><i class="lines"></i><div class="say"><small></small><b></b><em></em></div><i class="leaf l"></i><i class="leaf r"></i>';
      stage.appendChild(pod);
    }
    pod.querySelector('small').textContent = P.name || l.name;
    pod.querySelector('b').textContent = up ? `${P.from || ''} → ${P.to || ''}` : `${P.to || ''} → ${P.from || ''}`;
    pod.querySelector('em').textContent = `${Math.round(dz)} m · ${l.m_per_min || 240} m a minute`;
    pod.style.setProperty('--pod-s', `${dur}s`);
    pod.classList.toggle('down', !up);
    pod.className = pod.className.replace(/\b(shut|ride|open)\b/g, '').trim();
    void pod.offsetWidth;
    const from0 = { pos: camera.position.clone(), look: live.look.clone() };
    const end = () => { if (!pod) return; pod.classList.remove('shut', 'ride'); pod.classList.add('open'); setTimeout(() => { if (pod) pod.classList.remove('open'); }, 1200); };
    cine.play(OECine.mix(() => from0, () => live, k => (k < 0.5 ? 0 : 1)), dur, { label: 'hop',
      cues: [[0, () => { pod.classList.add('shut'); A.thump(); }],
        [0.12, () => pod.classList.add('ride')],
        [0.5, () => { // (the doors are shut and the car is dark: the far stop, with nobody to see the cut)
          [player.x, player.y, player.z] = b.at;
          if (b.face) player.h = Math.atan2(b.face[0], b.face[1]);
          player.speed = 0; player.vz = 0; player.ground = true;
          cam.mode = 'chase'; cam.yaw = player.h; cam.pitch = FOOT.pitch; cam.dist = FOOT.dist;
          groundLod(player.x, player.y);
          liftLeft = { l, i: to }; // (no ride offered back until you have walked out of the stop: liftStop)
          save();
        }],
        [0.88, () => { A.chime(); end(); }]],
      onEnd: skipped => { end(); if (!skipped) H.toast(`${b.name}.`); } });
  }

  // A lift whose car is drawn (game.json lifts[].car: Queenstown's glass lift) is ridden in its car. Its car,
  // its doors, its counterweight and its ropes are the landmark's own meshes (city.py lift_meshes), drawn with
  // the car at one stop (car.drawn_at) and moved here: the car comes to your stop if it is not there, the
  // landing and car doors slide open, you step in and turn to the glass, the doors close, and the car runs to
  // the far stop (the counterweight passing it the other way, the ropes paying out from the head) at the lift's
  // speed, the time shortened to at most 8 s, while the camera holds outside the glass; then the doors open
  // and you step out onto the far landing.
  const liftCars = new Map();
  function liftCar(l) {
    if (!l || !l.car) return null;
    if (liftCars.has(l.id)) return liftCars.get(l.id);
    const find = names => (names || []).map(n => world.getObjectByName(n)).filter(Boolean);
    const C = l.car, car = find(C.meshes);
    if (!car.length) { liftCars.set(l.id, null); return null; }
    const c = { l, car, cw: find(C.counter), at: C.drawn_at, dz: 0,
      ropes: (C.ropes || []).map(([n, top, sgn]) => ({ m: world.getObjectByName(n), top, sgn })).filter(r => r.m),
      doors: (C.doors || []).map(d => ({ stop: d.stop, landing: find(d.landing), car: find(d.car), k: 0 })) };
    for (const r of c.ropes) { r.m.geometry.computeBoundingBox(); const bb = r.m.geometry.boundingBox; r.len0 = Math.max(0.05, bb.max.y - bb.min.y); }
    liftCars.set(l.id, c);
    return c;
  }
  // the car dz metres off where it is drawn, and each stop's doors open by k (0 shut, 1 open)
  function liftPose(c, dz) {
    c.dz = dz;
    for (const m of c.car) m.position.y = dz;
    for (const m of c.cw) m.position.y = -dz;
    for (const r of c.ropes) { const s = Math.max(0.05, r.len0 - r.sgn * dz) / r.len0; r.m.scale.y = s; r.m.position.y = r.top * (1 - s); }
    const [sx, sy] = c.l.car.slide || [0, 0];
    for (const d of c.doors) {
      for (const m of d.landing) { m.position.x = sx * d.k; m.position.z = -sy * d.k; }
      for (const m of d.car) { m.position.x = sx * d.k; m.position.z = -sy * d.k; }
    }
  }
  const liftFloor = (l, i) => (l.stops[i].floor ?? l.stops[i].at[2]);
  let liftRide = null;
  function rideLiftCar(l, from, to) {
    const c = liftCar(l), C = l.car, a = l.stops[from], b = l.stops[to];
    const z0 = liftFloor(l, C.drawn_at), zA = liftFloor(l, from) - z0, zB = liftFloor(l, to) - z0;
    const v = Math.max((l.m_per_min || 60) / 60, Math.abs(zB - zA) / 8); // m/s: its own, or quicker to keep the ride to 8 s
    const out = [C.axis[1], -C.axis[0]]; // across the shaft, to the view side
    liftRide = { c, l, from, to, a, b, zA, zB, v, out, phase: 'call', t: 0, from0: [player.x, player.y, player.z], h0: player.h };
    player.mode = 'lift'; player.vehicle = null; player.speed = 0; player.vz = 0;
    cam.mode = 'chase'; cam.distTo = 8; cam.yawTo = Math.atan2(C.axis[0], C.axis[1]) - 0.35; cam.pitch = 0.06; cam.lastInput = -10; // (from the open side along the shaft: the deck and the sky behind)
    H.toast(`<b>${l.line || l.name}</b><span>${b.name}: ${Math.round(Math.abs(zB - zA))} m at ${l.m_per_min || 60} m a minute</span>`);
  }
  function liftStep(dt) {
    const R = liftRide;
    if (!R) { player.mode = 'foot'; return; }
    const c = R.c, door = i => c.doors.find(d => d.stop === i);
    R.t += dt;
    const ease = k => k * k * (3 - 2 * k), z = () => liftFloor(R.l, R.l.car.drawn_at) + c.dz;
    const inside = () => [R.l.car.centre[0], R.l.car.centre[1]];
    let walk = 0;
    if (R.phase === 'call') { // the car comes to this stop
      const d = R.zA - c.dz, step = Math.sign(d) * Math.min(Math.abs(d), R.v * 1.5 * dt);
      liftPose(c, c.dz + step);
      if (Math.abs(R.zA - c.dz) < 1e-3) { R.phase = 'open'; R.t = 0; }
    } else if (R.phase === 'open' || R.phase === 'close' || R.phase === 'open2' || R.phase === 'close2') {
      const dr = door(R.phase.endsWith('2') ? R.to : R.from), k = Math.min(1, R.t / 1.1);
      if (dr) dr.k = R.phase.startsWith('open') ? ease(k) : 1 - ease(k);
      liftPose(c, c.dz);
      if (k >= 1) { R.phase = { open: 'in', close: 'ride', open2: 'out', close2: 'done' }[R.phase]; R.t = 0; R.p0 = [player.x, player.y, player.z]; }
    } else if (R.phase === 'in' || R.phase === 'out') { // step in to the car's middle, or out to the landing
      const k = Math.min(1, R.t / 1.4), [ix, iy] = inside(), to = R.phase === 'in' ? [ix, iy] : R.b.at;
      player.x = R.p0[0] + (to[0] - R.p0[0]) * k; player.y = R.p0[1] + (to[1] - R.p0[1]) * k;
      player.z = R.phase === 'in' ? z() : R.b.at[2];
      const want = R.phase === 'in' ? Math.atan2(R.out[0], R.out[1]) : Math.atan2(to[0] - R.p0[0], to[1] - R.p0[1]);
      player.h += angDiff(k < 0.7 ? Math.atan2(to[0] - R.p0[0], to[1] - R.p0[1]) : want, player.h) * Math.min(1, dt * 6);
      walk = k < 1 ? 1.2 : 0;
      if (k >= 1) { R.phase = R.phase === 'in' ? 'close' : 'close2'; R.t = 0; }
    } else if (R.phase === 'ride') {
      const T = Math.abs(R.zB - R.zA) / R.v, k = Math.min(1, R.t / Math.max(0.5, T));
      liftPose(c, R.zA + (R.zB - R.zA) * ease(k));
      [player.x, player.y] = inside(); player.z = z();
      player.h += angDiff(Math.atan2(R.out[0], R.out[1]), player.h) * Math.min(1, dt * 4);
      if (k >= 1) { R.phase = 'open2'; R.t = 0; if (A.liftChime) A.liftChime(); }
    } else if (R.phase === 'done') {
      liftRide = null; liftLeft = { l: R.l, i: R.to }; // (no ride offered back until you have walked out of the stop: liftStop)
      if (R.b.face) player.h = Math.atan2(R.b.face[0], R.b.face[1]);
      player.mode = 'foot'; player.speed = 0; player.vz = 0; player.ground = true;
      cam.distTo = FOOT.dist; cam.yawTo = player.h;
      groundLod(player.x, player.y);
      H.toast(`${R.b.name}.`);
      save();
      return;
    }
    player.rig.animate(dt, walk, 'ground', clockT);
  }

  // Fast travel: rise over the player, fly across the city at a height that grows with
  // the distance, and come down behind them facing the way they flew. The player moves
  // at the top of the climb, out of sight.
  // (opts.cue, if given, moves whatever is travelling at the top of the climb instead of you; quiet: no arrival toast)
  const HOP_TURN_RATE = 45 * Math.PI / 180, HOP_PITCH_RATE = 30 * Math.PI / 180; // rad/s
  // (coming down into a street between towers it may tilt back a little faster, so it has tilted back before the hand-over
  // to the chase camera rather than during it, which added the two: #340, the hop to the scramble from Sangenjaya)
  const HOP_FALL_RATE = 40 * Math.PI / 180;
  function hopTo(x, y, z, name, opts = {}) {
    const span = Math.hypot(x - player.x, y - player.y), bearing = Math.atan2(x - player.x, y - player.y);
    const roofs = roofAlong(player.x, player.y, x, y) - player.z; // cruise well clear of the tallest roof on the way
    const alt = Math.max(THREE.MathUtils.clamp(140 + span * 0.12, 180, 520), roofs + 110), top = { dist: alt * 0.84, h: alt }, az = bearing + Math.PI;
    const A = head(), B = W(x, y, z + 1.55), p0 = OECine.polar(A, camera.position), c = new THREE.Vector3();
    // the camera's bearing about the player turns once, evenly over the whole hop, and never faster than
    // HOP_TURN_RATE at its peak (#89): to frame a landmark (opts.yaw) the hop takes longer if it must; otherwise
    // it comes down only as far round towards the way you flew as that rate allows in the time
    const pe = opts.pitch ?? FOOT.pitch;
    let dur = Math.min(4.6, 3.2 + span / 2000), turnBy = OECine.turn(p0.az, opts.yaw != null ? opts.yaw + Math.PI : az);
    const peak = t => 1.875 * Math.abs(t) / dur; // the smootherstep's top speed
    if (opts.yaw != null) dur = Math.min(6.5, Math.max(dur, 1.875 * Math.abs(turnBy) / HOP_TURN_RATE));
    else if (peak(turnBy) > HOP_TURN_RATE) turnBy = Math.sign(turnBy) * HOP_TURN_RATE * dur / 1.875;
    const azAt = k => p0.az + turnBy * OECine.ease.smooth(k), azEnd = azAt(1);
    // up and down on a log scale of the range; the elevation one gentle rise to eT by 45% of the way and one fall to
    // the chase camera's, raised over the roofs on the way down (calmElevation): no plunge at the end
    const pos = new THREE.Vector3(), lk = new THREE.Vector3(), E = OECine.ease, L = OECine.lerp;
    const r0 = Math.max(2, Math.hypot(p0.dist, p0.h)), e0 = Math.atan2(p0.h, p0.dist), rT = Math.hypot(top.dist, top.h), eT = Math.atan2(top.h, top.dist);
    let r1 = FOOT.dist; // (the chase camera's range on landing: set again at the top of the climb from where it really is)
    const a = 0.26, b = 0.6, km = 0.45;
    // (out of the street it cranes up over the player's head before it pulls back: the range grows late in the rise)
    const rAt = k => (k < a ? r0 * Math.pow(rT / r0, E.in(OECine.span(k, 0, a))) : k < b ? rT : rT * Math.pow(r1 / rT, E.smooth(OECine.span(k, b, 1 - 0.2 * (1 - b))))); // (in to the chase camera's range by 92%: the rest is for tilting back level)
    let eTop = eT, peL = pe; // the elevation at the top, and the chase camera's pitch on landing (likewise)
    const eBase = k => (k < km ? L(e0, eTop, E.smooth(k / km)) : L(eTop, peL, E.smooth(OECine.span(k, km, 1))));
    // Over tall roofs the way down has to be steeper. The top then already holds the steepest it will need, so the
    // camera only ever tilts one way on the way down; the hop takes the time it needs to tilt back calmly (to 6.5 s),
    // and the hand-over to the chase camera (the last 22%) takes what is left
    const fallOf = d => calmElevation({ c: B, az: k => azAt(L(b, 1, k)), r: k => rAt(L(b, 1, k)), e: k => eBase(L(b, 1, k)), dur: d * (1 - b), rate: HOP_FALL_RATE, rMin: 30, upto: 0.7 }); // (within 30 m the chase camera keeps itself clear of the walls)
    const riseOf = d => calmElevation({ c: A, az: k => azAt(L(0, a, k)), r: k => rAt(L(0, a, k)), e: k => eBase(L(0, a, k)), dur: d * a, rate: HOP_PITCH_RATE, rMin: 14, upto: 1, e0 });
    let fallEl = fallOf(dur), riseEl = riseOf(dur);
    for (let n = 0; n < 4; n++) {
      eTop = Math.min(1.2, Math.max(eT, fallEl.max, riseEl(1)));
      const short = Math.max(fallEl.late, riseEl.early); // the roofs want more tilt than the time allows
      if (short > 0.02 && dur < 6.5) dur = Math.min(6.5, dur + 1.3 * (fallEl.late > riseEl.early ? short / HOP_FALL_RATE : short / HOP_PITCH_RATE));
      fallEl = fallOf(dur); riseEl = riseOf(dur);
    }
    const path = k => {
      const ctr = k < a ? A : k < b ? c.lerpVectors(A, B, E.inOut(OECine.span(k, a, b))) : head(), r = rAt(k);
      const e = k < a ? Math.max(eBase(k), riseEl(k / a)) : k < b ? eBase(k) : Math.max(eBase(k), fallEl(OECine.span(k, b, 1)));
      OECine.around(ctr, azAt(k), r * Math.cos(e), r * Math.sin(e), pos);
      return { pos, look: lk.copy(ctr) };
    };
    const yawEnd = azEnd - Math.PI; // where the chase camera will be: behind the player, facing on
    cine.play(OECine.mix(path, () => live, k => handOver(k, 0.78)), dur, { label: 'hop',
      cues: [[a, opts.cue ? () => { opts.cue(); if (opts.yaw == null) cam.yaw = yawEnd; if (peL > pe + 0.01) cam.pitch = peL; groundLod(x, y); } : () => {
        [player.x, player.y, player.z] = [x, y, z];
        player.h = yawEnd; player.speed = 0; player.vz = 0; player.ground = true;
        cam.mode = 'chase'; cam.yaw = yawEnd; cam.pitch = peL; cam.dist = FOOT.dist;
        groundLod(x, y);
        const pl = livePolar(); // (lifted over a wall behind, or pulled in: the way down lands where it will be)
        r1 = Math.max(2, Math.hypot(pl.dist, pl.h)); peL = Math.atan2(pl.h, pl.dist);
        save();
      }]],
      onEnd: () => { if (!opts.quiet) H.toast(`You're at ${name}.`); } });
  }

  function onFerryEvent(ev) {
    const v = ev.v, mine = player.vehicle === v;
    const near = Math.hypot(v.x - player.x, v.y - player.y) < 700;
    if (ev.type === 'depart') { if (near) A.horn(); if (mine) H.toast(`Departing for ${wharfById(fer.nextStop(v)).name}.`); }
    if (ev.type === 'arrive' && mine) H.toast(`${wharfById(ev.at).name}. <kbd>E</kbd> to get off.`);
    if (ev.type === 'helm' && mine) H.toast('Approaching the wharf. You have the helm: W/S throttle, A/D rudder. Come alongside under 1.2 m/s.');
    if (ev.type === 'scrape' && mine && clockT - bumpT > 2) { bumpT = clockT; H.toast('Scraped the seawall. Ease off and steer clear.'); }
    if (ev.type === 'docked' && mine) {
      const sc = Math.max(10, ev.score);
      lastDock = sc;
      H.toast(`<b>Made fast!</b> Docking score ${sc}/100.`, 'stamp');
      A.chime();
      if (sc >= 60 && !qs.stamps.some(s => s.id === 'ferry-master')) { qs.stamps.push({ id: 'ferry-master', stamp: 'Ferry master', title: 'Docked by hand', at: fmtMin(clock.min) }); renderPassport(); save(); A.thump(); H.stamp('Ferry master', 'Docked by hand'); }
    }
    if (ev.type === 'helm' && mine) v.helm.started = clockT;
  }

  // on a phone the vehicle's readout stands over the stick, where the prompt and the messages are: they move up by
  // its height (--vhud-h, index.html), or a thumb could not reach "Get out" behind it
  let vhudH = -1, vhudT = 0, riding = false;
  let atWas = '';
  function vehicleHud() {
    vehicleHudFill();
    const at = player.mode === 'car' || player.mode === 'heli' ? player.mode : ''; // (at the wheel or the stick: the walk's phone buttons for each, story.css)
    if (at !== atWas) { stage.classList.toggle('at-car', at === 'car'); stage.classList.toggle('at-heli', at === 'heli'); atWas = at; }
    if (!touch) return;
    // a passenger (in a taxi, aboard a ferry or a train, on a seat) has nowhere to walk: the stick, Jump, Run and Lens
    // are put away, the readout takes the width of the screen over one row of buttons (View, Skip, E), and the
    // picture is left clear
    const m = player.mode, pass = m === 'seat' || m === 'ride' || m === 'rail' || (m === 'ferry' && !(player.vehicle && player.vehicle.helm));
    if (pass !== riding) {
      riding = pass; vhudT = -1;
      stage.classList.toggle('riding', pass);
      for (const id of ['#gt-joy', '#gt-jump', '#gt-run', '#gt-lens']) $(id).hidden = pass && !(id === '#gt-jump' && perch && perch.seat); // (on a perch the Time-lapse button stays)
    }
    if (clockT - vhudT < 0.3) return;
    vhudT = clockT;
    // (measured only while it is drawn: the story's page keeps it out of sight with a style, not hidden, and a box that is
    // not drawn measures its top as 0, which read as a readout the screen's whole height and lifted the prompt and the
    // messages off its top, so that on a phone at the wheel of the walk's car Get out could not be seen or tapped)
    const el = $('#g-vhud'), er = el.getBoundingClientRect(), h = el.hidden || !er.height ? 0 : Math.max(0, Math.round(stage.getBoundingClientRect().bottom - er.top) + 8 - 200);
    if (h !== vhudH) { vhudH = h; stage.style.setProperty('--vhud-h', `${h}px`); }
  }
  function vehicleHudFill() {
    const el = $('#g-vhud');
    if (touch) {
      const m = player.mode, dn = $('#gt-down'), rides = m === 'ride' || m === 'ferry' || m === 'rail';
      dn.hidden = m === 'seat' || (m === 'ride' && !(ride && ride.phase === 'driving')) || (m === 'ferry' && !!(player.vehicle && player.vehicle.helm));
      const dt_ = m === 'heli' ? 'Down' : m === 'car' ? 'Horn' : rides ? 'Skip' : 'Guess';
      if (dn.textContent !== dt_) dn.textContent = dt_;
      dn.setAttribute('aria-pressed', String((m === 'ferry' || m === 'rail') && skip));
      $('#gt-jump').textContent = player.mode === 'seat' ? 'Time-lapse' : player.mode === 'heli' ? 'Up' : player.mode === 'car' ? 'Hand brake' : (fish && fish.api && fish.api.button()) || 'Jump'; // (Cast and Reel with a line out: fishing.js)
      // (at the wheel there is nothing to run: the button is the autopilot's)
      const run = $('#gt-run'), txt = player.mode === 'car' ? 'Auto' : 'Run';
      if (run.textContent !== txt) run.textContent = txt;
      run.setAttribute('aria-pressed', String(player.mode === 'car' ? !!pilot : keys.has('ShiftLeft')));
      const ln = $('#gt-lens'), lt = player.mode === 'car' ? (assist.lane && assist.cruise ? 'Lane + cruise' : assist.lane ? 'Lane keep' : 'Assist') : 'Lens';
      if (ln.textContent !== lt) ln.textContent = lt;
    }
    if (player.mode === 'heli') {
      const st = heli.st, g = nav.groundBelow(st.x, st.y, st.z);
      el.hidden = false;
      el.innerHTML = `<div><b class="num">${Math.round(st.z)} m</b><span>altitude</span></div><div><b class="num">${Math.round(st.z - g)} m</b><span>above ground</span></div>
        <div><b class="num">${Math.round(st.speed * 3.6)}</b><span>km/h</span></div><div><b class="num">${Math.round(st.rotor * 100)}%</b><span>rotor</span></div>
        <p class="note">${st.rotor < 0.9 ? `<b>Rotor spooling up: it lifts at 90%</b> · ` : ''}Space climb · C descend · W/S · A/D turn · V ${VIEWS[nextViewOf(cam.mode)][1]}${st.landed ? ' · E get out' : ''}</p>`;
    } else if (player.mode === 'ferry') {
      const v = player.vehicle, nxt = wharfById(fer.nextStop(v));
      const t = v.phase === 'dwell' ? v.t : fer.eta(v, nxt.id);
      el.hidden = false;
      el.innerHTML = `<div><b>${v.name}</b><span>${v.route}</span></div><div><b>${v.phase === 'dwell' ? 'Departs' : nxt.name}</b><span>${v.phase === 'dwell' ? `in ${fmtSec(t)}` : `in ${fmtSec(t)}`}</span></div>
        <div><b class="num">${(Math.abs(v.speed) * 1.94).toFixed(0)}</b><span>knots</span></div>${v.helm && v.helm.manual ? `<div><b class="num">${Math.round(v.helm.dist || 0)} m</b><span>to berth</span></div>` : ''}
        <p class="note">${v.phase === 'dwell' ? 'E get off · ' : ''}F ${skip ? 'normal speed' : 'skip ahead'} · H take the helm · drag to look around</p>`;
    } else if (player.mode === 'car') {
      const st = myCar.D.st;
      el.hidden = false;
      if (pilot) {
        // the autopilot's screen, as a navigator's: where to and when, the next turn, and what the driver is doing
        const o = pilot, c = o.drv.st, { nt, left, eta: t } = o.hud || pilotHud(o);
        el.innerHTML = `<div><b>Autopilot</b><span>${o.scenic && o.share > 0.15 ? 'the scenic way' : 'on'}</span></div><div><b>${o.dest.name}</b><span>in ${fmtSec(Math.ceil(t))}</span></div>
          <div><b class="num">${(left / 1000).toFixed(1)} km</b><span>to go</span></div><div><b class="num">${Math.round(st.speed * 3.6)}</b><span>km/h</span></div>
          <p class="note"><b class="intent">${nt ? `${OEAutopilot.turnGlyph(nt)} ${OEAutopilot.turnText(nt)}` : 'Pulling out onto the lane'}${c.intent && !o.join ? ` · ${c.intent}` : ''}</b>J, the wheel or the brake: you drive · V ${cam.mode === 'cabin' ? 'the film' : 'from the seat'} · drag to look around</p>`;
      } else
      el.innerHTML = `<div><b class="num">${Math.round(st.speed * 3.6)}</b><span>km/h</span></div><div><b class="num">${st.gear === 0 ? 'R' : st.speed < 0.3 ? 'N' : st.gear}</b><span>gear</span></div>
        <div><b class="num">${Math.round(st.z)} m</b><span>altitude</span></div><div><b class="num">${Math.round(st.rpm * 7000 / 100) * 100}</b><span>rpm</span></div>
        <p class="note">${assist.lane || assist.cruise ? `<b class="intent">${[assist.lane ? `Lane keeping${assist.on.lane ? '' : ' (standing by)'}` : '', assist.cruise ? `Cruise ${Math.round(assist.set * 3.6)} km/h${assist.line != null ? ' · red light ahead' : assist.lead && assist.lead.gap < 40 ? ' · following' : ''}` : ''].filter(Boolean).join(' · ')}</b>` : ''}W/S drive, brake, reverse · A/D steer · Space handbrake · J autopilot · I lane keeping · K cruise · H horn · V ${cam.mode === 'cabin' ? 'chase view' : 'from the seat'} · R back on the road${st.speed < 1.5 ? ' · E get out' : ''}</p>`;
    } else if (player.mode === 'ride' && ride) {
      const o = ride, st = o.drv.st;
      el.hidden = false;
      el.innerHTML = `<div><b>${o.name}</b><span>${o.kind === 'taxi' ? 'taxi' : rideCar(o)}${o.kind === 'hire' ? ` · ${o.plate}` : ''}</span></div><div><b>${o.dest ? o.dest.name : 'Where to?'}</b><span>${o.phase === 'driving' ? `in ${fmtSec(eta(o))}` : o.phase === 'arrived' ? 'here' : ''}</span></div>
        <div><b class="num">${o.phase === 'driving' ? (o.drv.remaining() / 1000).toFixed(1) : '0.0'} km</b><span>to go</span></div><div><b class="num">${Math.round(st.v * 3.6)}</b><span>km/h</span></div>
        <p class="note">${o.phase === 'driving' && st.intent ? `<b class="intent">${st.intent}</b>` : ''}${o.phase === 'driving' ? 'F skip the trip · ' : ''}V ${cam.mode === 'cabin' ? 'chase view' : 'from the back seat'} · drag to look around${st.v < 0.5 && o.phase !== 'asking' ? ' · E get out' : ''}</p>`;
    } else if (player.mode === 'foot' && ride && (ride.phase === 'coming' || ride.phase === 'waiting')) {
      const o = ride;
      el.hidden = false;
      const walk = Math.hypot(o.pickup.x - player.x, o.pickup.y - player.y);
      el.innerHTML = `<div><b>${o.name}</b><span>${o.kind === 'taxi' ? 'taxi' : `${rideCar(o)} · ${o.plate}`}</span></div><div><b class="num">${o.phase === 'coming' ? (eta(o) < 4 ? 'now' : fmtSec(Math.ceil(eta(o)))) : 'here'}</b><span>${o.phase === 'coming' ? 'arriving' : 'at the pick-up'}</span></div>
        ${walk > 20 ? `<div><b class="num">${Math.round(walk)} m</b><span>walk to the pick-up</span></div>` : ''}
        <p class="note">${o.phase === 'coming' ? (walk > 20 ? 'Follow the route to the pick-up. ' : 'Wait at the kerb. ') : 'E beside it to get in. '}N your phone${o.kind === 'hire' ? ': the map, or cancel.' : '.'}</p>`;
    } else if (player.mode === 'rail') {
      const c = player.vehicle, F = rail.funicular, here = rail.stationOf(c.id);
      el.hidden = false;
      if (c.train) {
        const nx = rail.nextStop(c);
        el.innerHTML = `<div><b>${c.line || railRide().name || 'Train'}</b><span>${c.name} · for ${rail.towards(c)}</span></div><div><b class="num">${(c.speed * 3.6).toFixed(0)}</b><span>km/h</span></div>
        <div><b>${here ? here.name : nx ? nx.name : rail.towards(c)}</b><span>${here ? 'standing at' : 'next stop'}</span></div>
        <p class="note">${here ? `${c.moved ? 'E get off · ' : ''}departs in ${fmtSec(rail.departsIn(c))} · ` : ''}V ${VIEWS[nextViewOf(cam.mode)][1]} · F ${skip ? 'normal speed' : 'skip ahead'}${cam.mode === 'chase' ? '' : ' · drag to look round'}</p>`;
      } else el.innerHTML = `<div><b>${railRide().name || 'Funicular'}</b><span>${c.name}</span></div><div><b class="num">${Math.round(c.z)} m</b><span>above the datum</span></div>
        <div><b class="num">${Math.round(Math.tan(Math.abs(c.pitch)) * 100)}%</b><span>gradient</span></div><div><b class="num">${(c.speed * 3.6).toFixed(0)}</b><span>km/h</span></div>
        <p class="note">${here ? (c.moved ? 'E get off · ' : `Departs in ${fmtSec(F.cyc.t)} · `) : ''}F ${skip ? 'normal speed' : 'skip ahead'} · drag to look around</p>`;
    } else el.hidden = true;
  }

  // A draw WebGL refuses is not drawn, and nothing else says so: the ground and the walls were missing on a page
  // opened after dark (world.js shadowDrawnOnce) while every check passed. Every three seconds, and after the first
  // frame, the context is asked for its error; one is reported once, with the shadow map's state, and the map is
  // drawn into again, which is the cure for the case known. (getError waits on the GPU process: not a call for
  // every frame.) The flag does not say which call raised it, and on the device that reported it (issue 485) no
  // software renderer raises it at all, so the device is asked to name the call: the next three frames are traced
  // (glcare.js trace: the error asked for after every call) and what they refuse is reported, the call, its
  // arguments and the lines that made it. An error the first frame had and those three do not was raised once,
  // while the map loaded: the next load of this map on this device is traced from its first call instead (glLoad,
  // a slower load, once). ?gltrace=1 asks for that trace; a check reads what it found in __game.glTrace.
  const GL_KEY = 'bh-gl-trace';
  const glState = () => { const st = Wd.shadowState ? Wd.shadowState() : {}; return `shadow map ${st.tex ? 'on the GPU' : 'not on the GPU'}, ${st.size} px, pass ${st.auto ? 'on' : 'off'}; extras ${gov.extras}, scale ${gov.scale}, msaa ${atmos && atmos.composer ? atmos.composer.samples : '-'}; ${weather ? weather.state.kind || '' : ''} ${fmtMin(clock.min)}`; };
  const glNames = list => list.slice(0, 4).map(o => `${o.call}(${o.args}) ${o.err} x${o.n} at ${o.at}`).join(' | ');
  const glSay = msg => { console.warn(msg); glFound.push(msg); if (window.OETelemetry && OETelemetry.track) OETelemetry.track('error', { kind: 'gl', msg: msg.slice(0, 900), src: 'game.js glCheck' }); };
  const glFound = [];
  let glAsked = 0, glTold = false, glTrace = null, glTraceN = 0, glFirst = false;
  function glCheck(now) {
    const gl = renderer.getContext();
    if (glLoad) { // a load traced from its first call: what it and the first frame refused
      const found = glLoad.stop(), calls = glLoad.calls; glLoad = null;
      glSay(found.length ? `WebGL refused, in the load and the first frame: ${glNames(found)}; ${glState()}` : `WebGL refused nothing in a traced load (${calls} calls); ${glState()}`);
      if (found.length) { glTold = true; if (Wd.shadowRedraw) Wd.shadowRedraw(); }
      glAsked = now;
      return;
    }
    if (glTrace) { // the frames after an error: which call
      if (++glTraceN < 3) return;
      const found = glTrace.stop(); glTrace = null;
      if (found.length) glSay(`WebGL refused, each frame: ${glNames(found)}; ${glState()}`);
      else {
        glSay(`WebGL refused nothing in the three frames after${glFirst ? ': raised once, in the load or the first frame; the next load here is traced' : ''}; ${glState()}`);
        if (glFirst) try { localStorage.setItem(GL_KEY, '1'); } catch (e) { /* storage blocked */ }
      }
      glAsked = now;
      return;
    }
    if (now - glAsked < 3000 && framesDrawn !== 0) return;
    if (framesDrawn !== 0 && OEWorld.compiling && OEWorld.compiling()) return; // (not while shaders compile behind the title: getError waits for them all; asked once they are done)
    glAsked = now;
    const e = gl.getError();
    if (!e || e === gl.CONTEXT_LOST_WEBGL) return;
    if (Wd.shadowRedraw) Wd.shadowRedraw();
    if (glTold) return;
    glTold = true; glFirst = framesDrawn === 0;
    glSay(`WebGL error 0x${e.toString(16)} after ${glFirst ? 'the first frame' : 'a frame'}: ${glState()}`);
    if (window.OEGLCare && OEGLCare.trace) { glTrace = OEGLCare.trace(gl); glTraceN = 0; }
  }
  warm.finally(() => requestAnimationFrame(frame)); // (the first draw waits for the shaders, compiled in slices: world.js compile)
  function advance(seconds, hold = []) {
    for (const c of hold) keys.add(c);
    const n = Math.round(seconds * 30);
    for (let i = 0; i < n; i++) {
      clockT += 1 / 30; U.uTime.value = clockT;
      if (!clock.frozen) { clock.min += clock.scale / 60 / 30; if (clock.min >= 1440) setClock(clock.y, clock.m, clock.d, clock.min, !clock.own); }
      simulate(1 / 30);
      if (cine.active) cine.step(clockT);
      if (closeup) closeupCamera(1 / 30); // (looking closer reads the held keys as it goes)
      fer.vessels.forEach(v => (v.events || []).splice(0).forEach(ev => onFerryEvent(ev)));
      if (i % 8 === 0) { sunTimer = 0; applySun(); const px = player.mode === 'heli' ? heli.st.x : player.x, py = player.mode === 'heli' ? heli.st.y : player.y;
        sunState = sun.altitude <= 0 ? 'night' : S.sunlit(DSM, px, py, player.mode === 'heli' ? heli.st.z + 1 : player.z + 1.6, sun) ? 'sun' : 'shade'; checkSteps(); }
    }
    for (const c of hold) keys.delete(c);
    // (held by a harness, the tiles round you are laid here, all of them, as a player's frames lay them a few ms at a
    // time: at the same point of the run however long the machine takes, nav.js; laid by the frames, what a wide query
    // met depended on how far they had got, #243)
    if (simHold && player.mode !== 'heli') nav.prefetch(player.x, player.y, 48, Infinity);
    weatherTick(seconds, false);
    if (life) life.tick(seconds, false, preTitle || !$('#g-title').hidden);
    // and the route, as a frame works it out (by the way you are going now)
    const titled = preTitle || !$('#g-title').hidden, ob = titled ? null : objective();
    updateRoute(clockT, waypoint || (ob && ob.at), ob, titled);
    routeShow(Infinity, titled);
    groundLod(player.mode === 'heli' ? heli.st.x : player.x, player.mode === 'heli' ? heli.st.y : player.y);
    camTarget.copy(player.mode === 'heli' ? W(heli.st.x, heli.st.y, heli.st.z + 2.5) : player.mode === 'ferry' ? W(player.vehicle.x, player.vehicle.y, 5) : W(player.x, player.y, player.z + 1.55));
    cam.snap = n > 1; // a stretch run without the camera lands it where it would have settled (a step at a time, it eases)
    if (closeup) closeupCamera(0); else updateCamera(1 / 30, false);
    cam.snap = false;
    camera.updateMatrixWorld();
    placeNightFill();
  }
  // ?perf: this device's own frame, part by part (perf.js), a few seconds after the street is the player's
  if (/[?&]perf\b/.test(location.search)) {
    const ps = document.createElement('script');
    ps.src = window.OEV('game/perf.js');
    // (ready: the loader gone and the title down, the walk or the story set out, the crane and any cut over: perf.js waits on it)
    const ready = () => !preTitle && playing && $('#g-title').hidden && $('#g-loader').hidden && !arriving && !levelHold && !cine.active && !(overture && overture.active) && !photo.on && !closeup && $('#g-menu').hidden;
    ps.onload = () => OEPerf.run({ renderer, world, camera, atmos, gov, mirror, weather, hero, stage, tick: mirrorTick, ready, label: o => (Wd.groundMeshes && Wd.groundMeshes.includes(o) ? 'the ground\'s tiles' : fineTiles.includes(o) ? 'the ground\'s fine tiles' : null) }).catch(e => console.warn('perf', e));
    document.head.appendChild(ps);
  }
  // the recorder's handles (tools/flyover.js): the title pose, a scripted title camera, and the orbit restarted from the video's last frame
  const flyover = { titlePose, marks: { MARK, mark }, camera: o => { flyCam = o ? { pos: W(...o.cam), look: W(...o.look), shadow: o.shadow || 600 } : null; }, restart: () => fromFlyover() };
  // the street's own people (regulars.js, issue 168): a few of the crowd with a routine the clock carries, on the walk
  if (window.OERegulars && G.regulars && crowd.enlist) regulars = OERegulars.create({ data: G.regulars, crowd, redress: (p, d) => !!(crowdDraw && crowdDraw.redress && crowdDraw.redress(crowd.P.indexOf(p), d)), clock: () => clock.min, day: () => clock.y * 372 + clock.m * 31 + clock.d, rain: () => !!(weather && weather.state && weather.state.rain > 0.15), here: () => player, ground: (x, y) => { const w = nav.walk(x, y, nav.terrain(x, y) + 0.6, true); return w.ok ? w.z : null; } }); // (the street's ground there, whatever floor you are on)
  window.__game = { marks, stopFx, bounds: () => bounds, visitors, speakers, walkStart: sp => startWalk(sp), heroCut: off => { if (off != null) HERO_CUT.off = !!off; return { on: HERO_CUT.box.value.w, box: HERO_CUT.box.value.toArray(), level: HERO_CUT.h && HERO_CUT.h.id }; }, perch, storyTalking: talking, tonight: () => tonight, regulars: () => regulars, regulars: () => regulars, lightShow: () => show, lights: () => ({ objective: beam.visible, story: !!(storyBeacon && storyBeacon.visible), here: !!(storyHere && storyHere.visible) }), storyFigure, faces: () => faceWho, storyFigs: () => storyFigs, playAs: name => setPlayerCharacter(name), titleScreen: s => titleScreen(s), screen: () => screenOf(), talkCam, talkShot: () => talkShot, past, guide: () => ({ key: guide.key, n: guide.pts ? guide.pts.length : 0, fail: guide.fail, ready: ways.ready }), life, hero: () => hero, renderer, trips: () => junctions.trips(), pilot: () => pilot, pilotEnd: () => pilotEnd, pilotTo, pilotOff, pilotAsk, assist, assistToggle, laneHere, destinations, scenicWeights, shows, world, fishing: () => fish, fishLoad: () => (fish ? fishLoad() : Promise.resolve(null)), groundShown: () => { const g = Wd.groundPictures; if (!g || !g.shown) return null; g.release(); return g.shown(); }, // (every aerial tile in, the far ones fetched now if the loader hasn't gone yet: issue 335)
    afoot: () => player.mode !== 'car' || stepOut(myCar, 'driver', [player.x, player.y, player.z]), // (for a harness: out of the car where it stands, when no door has room)
    hold: (on, zero = false) => { simHold = on !== false; if (zero) { clockT = 0; U.uTime.value = 0; titleT = 0; titleYaw = null; if (preTitle || !$('#g-title').hidden) updateCamera(0, true); } }, // (zero: the world's clock from 0, and the title's orbit from its start, for a harness that holds it from the title on: the title's frames ran both on by however long the load took, and the arrival sets out from the orbit's pose)
     lensNear: () => Object.assign({ on: lensNearOn }, lensNear), lensNearSet: on => { lensNearOn = on !== false; },
     story, storyLog, gamepad, makeGuide, guideMade: () => guideMade, GUIDE_BODY, npcLoad: n => npcLoad(n), held: () => simHold, turnRide: () => { if (!ride) return 'no ride'; if (ride.turn) return 'turning'; ride.turnNo = ''; turnRound(ride, 0, true); return ride.turn ? 'turning' : ride.turnNo || 'not turned'; }, governor: gov, glFound, pxScale: () => gov.scale, walkTalk: () => walkTalk, carComing: () => !!carCome, walkCalls, npcsReady, lateReady, late, neon, mirror, busy, cityNoise: () => CITY_NOISE, soundPlace: () => sndPlace, sound: () => (SND ? { junction: sndJ ? sndJ.id : null, walk: !!(sndJ && sndJ.arms.some(a => junctions.walk(a))), near: sndCount } : null), crowdAuto: v => { crowdAuto = v !== false; if (!crowdAuto) crowd.want = null; applyDensity(); }, t: () => clockT, overture: () => overture, frame: dt => { simulate(dt); updateCamera(dt, false); }, deckPlan, roadsNow, arriving: () => !!arriving, settleArrival, musterScramble, opening: () => OPENING, openingHere, startTour, welcome, onboard: OEOnboard, route: { get mode() { return routeMode; }, set: setRouteMode, peek: peekRoute, PEEK: ROUTE_PEEK }, vlib, peopleLib: lib, posts, junctions, rideEta: () => (ride ? eta(ride) : 0), flyover, Wd, colonies, flocks, dayLimits, footNet, crowdNet, travelTo, travelGroups, standFor, seenNow, bodyOf, B, landmarks, GAIT, toggleMap, scene, mapPins: () => bigPins, mapChips: () => bigChips.map(c => ({ x0: c[0], y0: c[1], x1: c[2], y1: c[3], id: c[4].id })), region, mapView: () => ({ z: mapZ.z, cx: mapZ.cx, cy: mapZ.cy, names: bigNames.slice(), picked: !mapPop.hidden }), benches, sunWant, benchTalk, advance, nextView, viewBlend, COCKPIT, cockpitGlass, atmos, nightFill, dlg, cine, photo, photoMode, snapPhoto, hopTo, craneIn, live, VP, viewshed, survey, renderPassport, guess, guessStart, guessCheck, completeQuest, LINES, ls, tracked, cycleTrack, openLines, lastDock: () => lastDock, waypoint: w => { waypoint = w; }, player, myCar: () => myCar, ride: () => ride, rideSeat, kerbAction, hail, orderRide, cancelRide, boardRide, leaveRide, skipRide, enterCar, exitCar, bringCar, resetCar, destinations, roads, carBoxes, phoneShow, KEEP, heli, heliBlock, heliHome: () => heliHome, heliFree: () => heliFree, heliHomeWhy: () => heliHomeWhy, heliHomeLast: () => heliHomeLast, helipads: G.helipads, fer, rail, trains, npcs, crowd, cars, nav, clock, setClock, qs: () => qs, quest, step, completeStep, talkTo, board, alight, boardRail, alightRail, railStation, interact, enterHeli, exitHeli, heliCoach: () => coachHeli, spawn, objective, lens, camera, cam, DSM, G, ways, gold, guide: () => guide, roadNet, currentAction, keys, lifts, rideLift, liftRide: () => liftRide, doors, room: () => room, liftCar, deckOf, deckStand, places, lookAt, framePhoto, trackNear, care, weather, crowdDraw: () => crowdDraw, life };
  // (for the walk's line and its checks, tools/walk_line.js and tools/walk_play.js: on a line of their own)
  Object.assign(window.__game, { npcById: id => npcById(id), npcMove: (...q) => npcMove(...q), walkLine: () => (walkTalk && walkTalk.line ? walkTalk.line() : null) });
  return {
    stop() { if (window.OEMetro) OEMetro.close(); if (window.OEVis) OEVis.dispose(); keep(); if (fish && fish.api) fish.api.dispose(); running = false; ac.abort(); ro.disconnect(); care.dispose(); if (atmos) atmos.dispose(); if (weather) weather.dispose(); renderer.dispose(); Wd.dispose(); A.stop(); window.__game = null; },
  };
};
