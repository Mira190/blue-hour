// A map's story, and the Stop: the minutes in which the world holds still and only whoever carries the camera
// walks on. Nothing here names a city or draws the world: the story is data (game.json "story", from
// cities/<id>/city.json; docs/STORY.md is the story itself), and game.js lends what a story needs of the game
// (a figure to stand somewhere, the dialogue, the weather, the scramble's lights, the frame as a picture).
//
// An episode is one case, played through in one go: a run of frames, each one photograph. Nothing is scored
// between them; the only card is the last, with the whole roll on it.
//
//   "story": {
//     "title": "Blue Hour", "frames": 7,                      // the film left in the camera
//     "card": { "eyebrow": "...", "native": "...", "line": "..." }, // the title: over the name, under it, the line below
//     "episodes": [{
//       "id": "late", "title": "You came late", "no": 1,
//       "date": [10, 10], "light": "blue", "weather": "clear", // the evening it is set in (sun.js's presets)
//       "overture": { ... },                                   // its own opening (overture.js's spec, over the map's)
//       "walk_in_s": 0,                                        // a scramble by the start turns to walk after this long
//       "cast": [{ "id": "old", "character": "R_...", "name": "...", "at": [x, y] }], // the living, there all evening
//       "frames": [{
//         "stamp": "17:14",                                    // under its print
//         "weather": "rain",                                   // the sky turns as the frame begins
//         "rain_on": "meet",                                   // (rain) the sky lowers as it begins, and the rain comes on the living's first word
//         "meet": { "npc": "shun" | "cast": "old", "goal": "...", "lines": ["..."], // first, a word with the living
//                   "ask": [{ "q": "...", "options": ["..."], "answer": 0, "wrong": "..." }] }, // and what they ask you
//                   (or a print, "frame": n; a cross-examination, "press": [{ "say", "no" }], "lie", "frame"; the summation,
//                   "who": true, "answer": a person's id from the episode's "people", then "proof": [n, "a-b"]: see ask();
//                   never lost, with "file", "wrong2" and "told": see judged(); a choice someone waits on, "wait_s" and "silent")
//         "goal": "...",                                       // then where to go: the line on screen
//         "lead_s": 1,                                         // the world stops this long after (else: on coming near)
//         "stop_r": 12, "stop_s": 420, "stop_at": [x, y],      // how near (to stop_at, else the afterimage); how long the Stop lasts
//         "afterimage": { "character": "R_...", "name": "...", "year": 1964, "at": [x, y, z?], "reach_m": 3.2,
//                         "seek": "...", "lines": ["..."] },   // who moves in the stopped world, and what they say
//         "afterimage2": { ... },                              // a second, who says nothing
//         "task": { "subject": [x, y, z], "within_deg": 40,    // the photograph: of what,
//                   "hold": [0.9, 0.35],                       // the camera held out from the eye (forward, up: over a roof's glass),
//                   "stand": [x, y, z?], "within_m": 4,        // from where (if it matters),
//                   "clear": [[x, y]], "clear_round": 2.5,     // the held crowd out of the way on past the thing, and round it,
//                   "both": true,                              // or: with both afterimages in the frame
//                   "meet": { "speed": 1.1, "frame_m": 9, "say": "..." }, // and taken as they meet: once both are framed,
//                                                              // every light turns green and they walk to the middle
//                   "goals": { "stand": "...", "shoot": "...", "ready": "...", "aim": "...", "wait": "...", "early": "..." },
//                   "lines": ["..."] },                        // and what is said of the print
//         "call": { "who": { "name": "...", "role": "..." }, "voice": { "pitch": 215 }, "lines": ["..."] }, // a message on the phone, as the frame begins
//         "after": ["..."],                                    // said as the world runs on again
//         "finale": true, "crosses": "old", "cross_to": [x, y] // the last frame: the world runs on after it; then one of the living crosses
//       }],
//       "end": { "title": "...", "line": "...", "next": "...", "free": "..." } // the last card
//     }]
//   }
//
// A player is never left without the next thing to do: one line says it (the goal), a light stands where it is
// (the beacon, with its distance when it is out of the frame), and the keys are named the first time they are needed.
// A Stop that runs out costs nothing but the minute: the world runs on, and stops again when you come back.
// The frames taken are kept in this browser, so a page closed in the middle of a case opens again at the frame it was at.
//
// The game asks `stopped` each frame and gives the world no time while it is true: the people, the traffic, the
// trains, the rain and the screens hold; the player, the camera and the afterimages do not.
'use strict';
window.OEStory = (function () {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ctx: { story (the data), stage, player, touch, toast(html), say(who, lines, done), ask(who, lines, choices, done), hush(on),
  //        hold(on): time held or let go (what hangs in the air), air(opts): the scene's leaves and birds, ride({to, name}): a car sent for you, film(spec, then): a flight, dress(date, light, weather), weather(kind), walkIn(seconds), floor(x, y) -> the ground's height there,
  //        figure(look, at) -> { x, y, z, face(x, y), walkTo(x, y, speed), animate(dt), remove() } (look.alive: a living person),
  //        person(id) -> one of the map's people { x, y, z, name, role }, beacon(at | null): a light standing at [x, y, , floor]
  //        (none: taken away), screen(at) -> { x, y, front, dist } where [x, y, z] is in the frame (0..1), aim(at) -> degrees
  //        between the lens and it, seen(at) -> nothing solid between the lens and [x, y, z], clear(a, b) -> the held crowd out of the way from a to b, snap() -> the frame as a data URL, again(), free(): the episode once more; the map without its story }
  function create(ctx) {
    const S = ctx.story, eps = S.episodes || [], N = S.frames || 7;
    let enterLater = () => {}; // (going back into a frame from the title: set once the case's functions exist, below)
    // the story's own interface (story.css): the map's instruments are put away for as long as the story is here
    ctx.stage.classList.add('story');
    { // the title (story.css "the title in three screens"; docs/STORY.md "The title, as a game opens"): the story's name and
      // evening over the street; the menu's ways in, as this browser left them; and the story's own screen, its episode
      const q = sel => ctx.stage.querySelector(sel), ep0 = eps[0] || {}, T = S.card || {};
      if (q('#gt-city')) q('#gt-city').textContent = T.eyebrow || '';
      if (q('#gt-title')) q('#gt-title').innerHTML = `${esc(S.title || '')}${T.native ? `<small lang="ja">${esc(T.native)}</small>` : ''}`;
      if (q('#gt-blurb')) q('#gt-blurb').textContent = T.line || '';
      // who you play, on a screen of its own (game.js whoAsk): the file on Kagami, what anyone who met them tonight could
      // know and nothing of the case; the lines that differ between the two (data-c) shown for the one the hand is on, or
      // the one chosen (story.css "who you play")
      const who = T.who, file = q('#gt-who .gt-who-file');
      if (who && file) {
        const both = f => ['W', 'M'].filter(c => who[c]).map(c => f(c, who[c])).join('');
        file.querySelector('.eyebrow').textContent = who.eyebrow || 'Who you play';
        file.querySelector('.jp').textContent = who.native || '';
        file.querySelector('.nm').textContent = who.name || '';
        file.querySelector('.sub').innerHTML = `${esc(who.age || '')}${both((c, v) => `<span data-c="${c}"> · ${esc(v.sub)}</span>`)}`;
        file.querySelector('.line').textContent = who.line || '';
        file.querySelector('.facts').innerHTML = (who.facts || []).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')
          + both((c, v) => (v.wears ? `<div data-c="${c}"><dt>${esc(who.wears || 'Wears')}</dt><dd>${esc(v.wears)}</dd></div>` : ''));
        file.querySelector('.note').textContent = who.note_line || '';
        for (const b of q('#gt-who').querySelectorAll('.gt-who-row [data-c]')) { const v = who[b.dataset.c]; b.querySelector('b').textContent = who.name || ''; if (v) b.querySelector('small').textContent = v.sub; }
      }
      // how far this browser has got: a case left going (the frame it takes up at; nobody opens the page into the rain of
      // the last frame without being told), or a case closed, any of whose frames can be gone back into
      let left = null;
      try { left = JSON.parse(localStorage.getItem(`oe-story-${ep0.id}`) || 'null'); } catch (e) { left = null; }
      const going = !!(left && left.fi > 0 && left.fi < (ep0.frames || []).length);
      const shut = !going && (() => { try { const c = JSON.parse(localStorage.getItem(`oe-story-${ep0.id}-closed`) || 'null'); return c && Array.isArray(c.snaps) && Array.isArray(c.stamps) ? c : null; } catch (e) { return null; } })();
      const name = `${ep0.no ? `Episode ${ep0.no} · ` : ''}${ep0.title || ''}`, taken = going ? left.prints || [] : shut ? shut.prints || [] : [];
      const photoOf = p => (p && typeof p.src === 'string' && /^data:image\//.test(p.src) ? p.src : null); // (a photograph the player took, kept with the case)
      const lastAt = going ? ((left.prints || [])[left.prints.length - 1] || {}).stamp || '' : '';
      // the menu: Continue first while a case is going, with the last photograph taken in it, as a game's menu puts its last
      // save first with a picture of where it was left (walk.js puts the walk under it); the story's row says how far
      const cont = q('#gt-cont-go');
      if (cont) {
        cont.hidden = !going;
        cont.classList.toggle('primary', going);
        if (going) {
          cont.querySelector('small').textContent = `${ep0.no ? `Episode ${ep0.no} · ` : ''}frame ${left.fi + 1} of ${N}${lastAt ? ` · ${lastAt}` : ''}`; // (short, so that the row holds one line beside the photograph on a phone)
          const ph = [...taken].reverse().map(photoOf).find(Boolean), im = cont.querySelector('img');
          if (ph && im) { im.src = ph; im.hidden = false; }
        }
      }
      const sg = q('#gt-story-go');
      const epNo = ep0.no ? `Episode ${ep0.no}` : ep0.title || ''; // (short, so that the row holds one line on a phone)
      if (sg) sg.querySelector('small').textContent = going ? `${epNo} · ${left.fi} of ${N} frames taken` : shut ? `${epNo} · the case is closed` : name;
      // the story's screen: the episode, its picture and its line; how far, on the roll (a cell a frame, the photograph in
      // each one taken); Begin, Continue or Play it again; the evening again, asked twice, since what was taken tonight is
      // lost; and a closed case's frames, each a way back in
      const E = q('#gt-eps');
      if (E) {
        E.querySelector('.cap .no').textContent = ep0.no ? `Episode ${ep0.no}` : '';
        E.querySelector('.cap h3').textContent = ep0.title || '';
        E.querySelector('.cap .when').textContent = T.eyebrow || '';
        E.querySelector('.line').textContent = ep0.line || T.line || '';
        E.querySelector('.state').textContent = going ? `In progress · ${left.fi} of ${N} frames taken${lastAt ? ` · the last at ${lastAt}` : ''}`
          : shut ? `The case is closed · go back into any frame` : `Not begun · ${N} frames, one evening`;
        E.querySelector('.gt-roll').innerHTML = Array.from({ length: N }, (_, i) => {
          const p = taken[i], src = photoOf(p), back = shut && (shut.snaps[i] || i === 0);
          const inner = `${src ? `<img src="${src}" alt="">` : ''}<b>${i + 1}</b>${shut && shut.stamps[i] ? `<small>${esc(shut.stamps[i])}</small>` : ''}`;
          return `<li class="${p ? 'got' : ''}${going && i === left.fi ? ' now' : ''}">${back ? `<button type="button" data-back="${i}" aria-label="Go back into frame ${i + 1}${shut.stamps[i] ? `, ${esc(shut.stamps[i])}` : ''}">${inner}</button>` : inner}</li>`;
        }).join('');
        E.classList.toggle('shut', !!shut);
        const play = q('#gt-play'), acts = E.querySelector('.gt-ep-acts'), anew = q('#gt-anew');
        if (play && acts) {
          acts.prepend(play); play.type = 'button'; play.classList.add('primary');
          play.innerHTML = going ? `<span>Continue</span><small>Frame ${left.fi + 1} of ${N}${lastAt ? `, after ${lastAt}` : ''}</small><kbd>↵</kbd>`
            : shut ? '<span>Play it again</span><small>The evening from its first frame</small><kbd>↵</kbd>' : `<span>Begin</span><small>${esc(name)}</small><kbd>↵</kbd>`;
        }
        if (anew) {
          anew.hidden = !going;
          const sure = on => { E.classList.toggle('sure', on); const f = q(on ? '#gt-anew-no' : '#gt-anew'); if (f) f.focus({ preventScroll: true }); };
          anew.addEventListener('click', () => sure(true));
          q('#gt-anew-no').addEventListener('click', () => sure(false));
          q('#gt-anew-yes').addEventListener('click', () => { if (ctx.whoGate && !ctx.whoGate()) return; try { localStorage.removeItem(`oe-story-${ep0.id}`); } catch (e) { /* storage blocked */ } E.classList.remove('sure'); play.click(); }); // (who you play chosen first)
          E.sure = () => E.classList.contains('sure') && (sure(false), true); // (Esc or B on the question: keep the case; game.js)
        }
        E.querySelector('.gt-roll').addEventListener('click', e => { const b = e.target.closest('button[data-back]'); if (b && (!ctx.whoGate || ctx.whoGate())) enterLater(+b.dataset.back); });
      }
    }
    const el = (id, html, tag = 'div') => { const e = document.createElement(tag); e.id = id; e.innerHTML = html; ctx.stage.appendChild(e); return e; };
    const frames = el('g-story-frames', `<span><b></b><small>/${String(N).padStart(2, '0')}</small>taken</span><span class="strip">${'<i></i>'.repeat(N)}</span><em>${ctx.touch ? 'Tap' : '<kbd>Tab</kbd>'} · the roll</em>`, 'button'), card = el('g-story-card', '<div><small></small><span></span></div>'), veil = el('g-story-veil', ''), flash = el('g-story-flash', '');
    const goalEl = el('g-story-goal', '<small></small><span></span><em></em>'), mark = el('g-story-mark', '<u></u><i></i><b></b>'), keys = el('g-story-keys', ''), finder = el('g-story-finder', '<i class="rf" aria-hidden="true"><b></b><b></b><small></small></i>');
    const failEl = el('g-story-fail', ''), spendEl = el('g-story-spend', ''), slip = el('g-story-slip', '<small>Entered in the file</small><p></p>');
    // the story's own film (meetGuide): its words at the foot of the frame, over the bars, and how to end it
    // a hint, asked for (hint() below): the button, under the camera's own
    const hintBtn = el('g-story-hint', '', 'button');
    // the camera taught, the first time it is in the hand (task.teach): what to do, in order, and what each step does,
    // ticked as it is done (teachTick below)
    const teachEl = el('g-story-teach', '');
    hintBtn.type = 'button'; hintBtn.addEventListener('click', e => { e.stopPropagation(); hint(); });
    const movEl = el('g-story-mov', `<p></p><button type="button">${ctx.touch ? 'Tap to skip' : 'Space to skip'}</button>`);
    movEl.querySelector('button').addEventListener('click', e => { e.stopPropagation(); movEnd(true); });
    const pre = el('g-story-order', '');
    // the menu (sound, who you play, the crowd, the frame rate), by touch or the mouse: Esc and a pad's own button open it
    // too, but a phone has neither (issue 48). At the top right, as the walk's is; put away under a talk, a film, a card
    const menuBtn = el('g-story-menu', `<i aria-hidden="true"></i><span>Menu</span>${ctx.touch ? '' : ' <kbd>Esc</kbd>'}`, 'button');
    menuBtn.type = 'button'; menuBtn.setAttribute('aria-label', 'Menu');
    menuBtn.addEventListener('click', e => { e.stopPropagation(); if (ctx.menu) ctx.menu(); });
    menuBtn.addEventListener('pointerdown', e => e.stopPropagation());
    const shutter = el('g-story-shutter', `<i></i>Take the picture${ctx.touch ? '' : ' <kbd>F</kbd> · <kbd>Wheel</kbd> the lens'}`, 'button'), endEl = el('g-story-end', '');
    shutter.type = 'button';
    // the camera in the hand or at the eye: a button that says which, and what the key does; and a word in the middle of
    // the frame whenever something changes that the player did not do (time stopping, time running, the camera going down)
    const camBtn = el('g-story-cam', '', 'button'), chip = el('g-story-chip', '');
    camBtn.type = 'button';
    // a key as the prompts name it: the pad's sign while a controller is in the hand (ctx.key, pad.js), else the key
    const K = k => (ctx.key ? ctx.key(k) : k);
    const sfx = name => { if (ctx.sfx) ctx.sfx(name); }, sting = kind => { if (ctx.sting) ctx.sting(kind); };
    const say = text => { sfx('word'); chip.textContent = text; chip.classList.remove('on'); void chip.offsetWidth; chip.classList.add('on'); };
    const camLabel = () => { camBtn.innerHTML = st.cam ? `<i></i>Lower the camera${ctx.touch ? '' : ' <kbd>R</kbd>'}` : `<i></i>Raise the camera${ctx.touch ? '' : ' <kbd>R</kbd>'}`; };
    function raise(on) {
      if (st.phase !== 'stop' || st.beat !== 'shoot' || st.cam === on) return;
      st.cam = on; camLabel(); camBtn.classList.toggle('up', on);
      if (st.fr.task.lens && ctx.lens) ctx.lens(on ? (st.meet ? st.lensNow : st.fr.task.lens) : null, !!st.meet); // (a frame taken through a long lens: task.lens, degrees; the last frame's, closed on the two of them as they meet)
      if (on) fitFinder(); shutter.classList.toggle('on', on); finder.classList.toggle('on', on);
      // (the lens comes up onto the thing, at its height, unless it is behind you: game.js reads story.subject as it raises it)
      const from = on && st.fr.task.stand ? framed().placed : true; // (raised off the place: the finder has tonight only, and says so)
      say(on ? (finder.dataset.year ? (from ? `Camera up · it sees ${finder.dataset.year}` : 'Camera up · not from here') : 'Camera up') : 'Camera down'); sfx(on ? 'cam-up' : 'cam-down');
    }
    camBtn.addEventListener('click', () => raise(!st.cam));
    // a print's postmark: struck on it when it is taken, as a letter's stamp is cancelled; the place round the top,
    // the hour in the middle, the frame under it, and the wavy lines of the cancel running off to the side
    let pmN = 0;
    const postmark = (stamp, n) => { const id = `pm${++pmN}`, parts = String(stamp || '').split(/\s*·\s*/), hour = parts[parts.length - 1], place = parts.length > 1 ? parts.slice(0, -1).join(' · ') : (S.place || 'SHIBUYA · 渋谷');
      return `<svg class="pm" viewBox="0 0 212 120" aria-hidden="true"><defs><path id="${id}a" d="M16 60 a44 44 0 0 1 88 0"/><path id="${id}b" d="M10 60 a50 50 0 0 0 100 0"/></defs>
<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="60" cy="60" r="55"/><circle cx="60" cy="60" r="33" stroke-width="1.4"/>${[30, 46, 62, 78, 94].map(y => `<path d="M122 ${y} q11 -9 22 0 t22 0 t22 0 t22 0"/>`).join('')}</g>
<g fill="currentColor" font-family="ui-monospace, monospace" text-anchor="middle"><text font-size="10.5" letter-spacing="1.5"><textPath href="#${id}a" startOffset="50%">${esc(place.toUpperCase().slice(0, 22))}</textPath></text>
<text font-size="9.5" letter-spacing="2"><textPath href="#${id}b" startOffset="50%">${esc((S.title || '').toUpperCase())}</textPath></text>
<text x="60" y="59" font-size="16" font-weight="600">${esc(hour)}</text><text x="60" y="74" font-size="8.5" letter-spacing="1.5">FRAME ${n} OF ${N}</text></g></svg>`; };
    // the print in your hand for a moment after the shutter: the picture, its postmark struck on it, then away to the roll
    const printEl = el('g-story-print', '');
    // It develops: white paper, then tonight comes up in it, and then the other year comes up through tonight (base:
    // the same frame without what the camera remembers, ctx.snapBase). The double exposure is the reward of every
    // frame, so it is seen to happen. A frame spent has only tonight: the paper waits, and nothing more comes.
    function showPrint(p, n, base) {
      if (!p || !p.src) return;
      const two = !!base && !p.plain;
      printEl.innerHTML = `<figure class="${two ? 'two' : ''}${p.plain ? ' plain' : ''}"><span class="dev"><img alt="" src="${two ? base : p.src}">${two ? `<img alt="" class="then" src="${p.src}">` : ''}</span>${postmark(p.stamp, n)}<figcaption><b>${n}</b>${esc(p.cap || p.stamp || '')}</figcaption></figure>`;
      printEl.classList.remove('on'); void printEl.offsetWidth; printEl.classList.add('on');
      if (two) later(1900, () => sfx('found')); // (glass, as the other year comes up)
      later(3000, () => sfx('stamp')); // (the postmark comes down)
      later(3600, () => sting('note')); // (and the score has one more note of its tune)
      later(6400, () => printEl.classList.remove('on'));
    }
    // the roll so far: every print kept, laid out as prints on a table; opened from the film strip or with Tab
    const album = el('g-story-album', '');
    const fileName = n => `blue-hour-${(st.ep && st.ep.id) || 'roll'}-${n}`;
    // The roll is the case board: two prints set side by side say what neither says alone, where the episode has
    // something for that pair (ep.pairs: [{ of: [a, b], line }]); what was found stays written under the table and is
    // counted on the last card. Nobody asks for it: it is the player's own look at their own evidence.
    let vs = [], vsSaid = '', slipT = 0;
    // The file: a sheet of kraft paper under the prints on which the case is written down by hand, a line at a time.
    // What goes on it is what is established and what the player has said, never what it means: a frame's own note as
    // it is taken, a thing the player committed to (an option's `file`), a pair of prints that argued. A line the
    // player later takes back is struck through, not removed (`strikes` names the `key` of the line it answers).
    function filed(text, { key = '', strikes = '', kind = '', wrong = false } = {}) {
      if (!text) return;
      if (strikes) for (const e of st.file) if (e.key === strikes) e.struck = true;
      st.file.push(Object.assign({ at: (st.fr && st.fr.stamp) || '', text, key, kind }, wrong ? { struck: true, wrong: true } : {})); // (wrong: an answer not taken, written and struck through at once)
      keep(); frames.classList.remove('filed'); void frames.offsetWidth; frames.classList.add('filed');
      // (what the player said is seen to be written down in the same hand, a letter at a time, as it is said: the game has heard it)
      if (kind === 'said') {
        const p = slip.querySelector('p'); clearInterval(slipT); let i = 0;
        slip.querySelector('small').textContent = wrong ? 'Entered, and struck through' : strikes ? 'Struck from the file, and entered' : 'Entered in the file'; slip.classList.toggle('wrong', wrong);
        p.textContent = ''; slip.classList.add('on');
        slipT = setInterval(() => { p.textContent = text.slice(0, ++i); if (i >= text.length) { clearInterval(slipT); later(3600, () => { if (p.textContent === text) slip.classList.remove('on'); }); } }, 30);
      }
    }
    const pairKey = (a, b) => `${Math.min(a, b) + 1}-${Math.max(a, b) + 1}`;
    function versus(i) {
      vs = vs.includes(i) ? vs.filter(k => k !== i) : vs.concat(i).slice(-2);
      vsSaid = '';
      if (vs.length === 2) {
        const key = pairKey(vs[0], vs[1]), hit = ((st.ep && st.ep.pairs) || []).find(p => pairKey(p.of[0] - 1, p.of[1] - 1) === key), dud = vs.some(k => st.prints[k].plain);
        if (hit && !dud) { vsSaid = hit.line; if (!st.pairs.includes(key)) { st.pairs.push(key); filed(`Frames ${key.replace('-', ' and ')}, side by side. ${hit.line}`, { kind: 'pair' }); sfx('found'); sting('note'); } }
        else { vsSaid = dud ? 'One of these is only tonight. It has nothing to set against the other.' : 'These two do not argue with each other.'; sfx('word'); }
      }
      albumDraw(-1);
    }
    function albumDraw(big) {
      const P = st.prints, cell = i => { const p = P[i]; return p ? `<li class="${i === big ? 'big' : ''}" style="--r:${((i * 37) % 7 - 3) * 0.6}deg"><button type="button" data-i="${i}" aria-label="Frame ${i + 1}">${p.src ? `<img alt="" src="${p.src}">` : '<i></i>'}${postmark(p.stamp, i + 1)}<span><b>${i + 1}</b>${esc(p.stamp)}</span></button>${p.cap ? `<p>${esc(p.cap)}</p>` : ''}${P.length > 1 ? `<button type="button" class="vs${vs.includes(i) ? ' on' : ''}" data-c="${i}">${vs.includes(i) ? 'Chosen' : 'Set beside another'}</button>` : ''}${p.src ? `<a download="${fileName(`frame-${i + 1}`)}.jpg" href="${p.src}">Save this print</a>` : ''}</li>` : `<li class="blank"><span><b>${i + 1}</b>not yet taken</span></li>`; };
      album.innerHTML = `<div class="table"><header><small>${esc(S.title || '')}${st.ep && st.ep.no ? ` · Episode ${st.ep.no}` : ''}</small><h2>The roll</h2><span>${P.length} of ${N} frames taken</span></header>
${vs.length === 2 ? `<div class="versus${st.pairs.includes(pairKey(vs[0], vs[1])) ? ' hit' : ''}" role="status"><figure>${vs.slice().sort((a, b) => a - b).map(k => `<span>${P[k].src ? `<img alt="Frame ${k + 1}" src="${P[k].src}">` : '<i></i>'}<b>${k + 1}</b></span>`).join('')}</figure><p>${esc(vsSaid)}</p></div>` : P.length > 1 ? `<p class="how">Set two prints side by side: some of them say together what neither says alone.${st.pairs.length ? ` Found so far: ${st.pairs.length}.` : ''}</p>` : ''}
<ol>${Array.from({ length: N }, (_, i) => cell(i)).join('')}</ol>
${st.file.length ? `<section class="file" aria-label="The file"><h3>The file</h3><ul>${st.file.map(e => `<li class="${e.struck ? 'struck' : ''}${e.kind ? ` ${e.kind}` : ''}"><b>${esc(e.at)}</b><span>${esc(e.text)}</span></li>`).join('')}</ul></section>` : ''}
<div class="row">${ctx.log ? `<button type="button" data-do="log">The log${ctx.touch ? '' : ' <kbd>L</kbd>'}</button>` : ''}${P.some(p => p.src) ? '<button type="button" data-do="sheet">Save the contact sheet</button>' : ''}<button type="button" class="go" data-do="close">${st.reask || (ctx.asking && ctx.asking()) ? 'Back to the question' : 'Back to the street'}${ctx.touch ? '' : ' <kbd>Tab</kbd>'}</button></div></div>`;
    }
    function albumOpen(on) {
      if (on && (st.phase === 'idle' || st.phase === 'dressed')) return;
      album.classList.toggle('on', on);
      if (on) { vs = []; vsSaid = ''; albumDraw(-1); if (document.exitPointerLock) document.exitPointerLock(); }
      else if (st.reask) { const f = st.reask; st.reask = null; later(300, f); } // (looked at from inside a question: it is asked again)
    }
    // the whole roll as one picture, to keep: the frames in a strip of film, numbered and stamped
    function saveSheet() {
      const P = st.prints, w = 560, h = 374, pad = 28, cols = 4, rows = Math.ceil(N / cols), c = document.createElement('canvas'), x = c.getContext('2d');
      c.width = pad + cols * (w + pad); c.height = 150 + rows * (h + 74) + 40;
      x.fillStyle = '#0b0d12'; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#f4efe6'; x.font = '200 54px sans-serif'; x.textBaseline = 'top'; x.fillText((S.title || '').toUpperCase().split('').join(' '), pad, 40);
      x.fillStyle = '#ffcf8a'; x.font = '22px monospace'; x.fillText(`${st.ep && st.ep.no ? `EPISODE ${st.ep.no} · ` : ''}${((st.ep && st.ep.title) || '').toUpperCase()} · ${P.length} OF ${N} FRAMES`, pad, 104);
      Promise.all(P.map(p => new Promise(res => { if (!p.src) return res(null); const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = p.src; }))).then(ims => {
        for (let i = 0; i < N; i++) {
          const X = pad + (i % cols) * (w + pad), Y = 150 + Math.floor(i / cols) * (h + 74), im = ims[i];
          x.fillStyle = '#05060a'; x.fillRect(X, Y, w, h);
          if (im) { const k = Math.max(w / im.width, h / im.height), sw = w / k, sh = h / k; x.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, X, Y, w, h); }
          x.strokeStyle = 'rgba(244,239,230,0.25)'; x.strokeRect(X + 0.5, Y + 0.5, w - 1, h - 1);
          x.fillStyle = '#ffcf8a'; x.font = '20px monospace'; x.fillText(`${i + 1}${P[i] ? ` · ${P[i].stamp}` : ''}`.toUpperCase().slice(0, 44), X, Y + h + 14);
        }
        c.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${fileName('contact-sheet')}.jpg`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/jpeg', 0.9);
      });
    }
    album.addEventListener('click', e => {
      const d = e.target.closest('button[data-do]'), b = e.target.closest('button[data-i]'), c = e.target.closest('button[data-c]');
      if (c) return versus(+c.dataset.c);
      if (d) return d.dataset.do === 'sheet' ? saveSheet() : d.dataset.do === 'log' ? (albumOpen(false), ctx.log.show(true)) : albumOpen(false); // (the log of the evening, log.js)
      if (b) { const li = b.parentNode, was = li.classList.contains('big'); album.querySelectorAll('li.big').forEach(q => q.classList.remove('big')); li.classList.toggle('big', !was); return; }
      if (e.target === album) albumOpen(false);
    });
    goalEl.setAttribute('role', 'status'); goalEl.setAttribute('aria-live', 'polite');
    const pulse = () => { flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on'); };
    // phase: idle, dressed, go (the world runs: a word with the living, the way to the next place), stop, after, done
    const st = { ep: null, phase: 'idle', beat: '', t: 0, left: N, fi: 0, fr: null, ghost: null, ghost2: null, target: null, prints: [], from: null, late: false, miss: 0, cast: {}, hinted: false, asked: 0, k: 1, orbit: 0, flags: {}, pairs: [], slips: 0, file: [], snaps: [], hint: 0, helped: {} };
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    // the roll as a collection: each frame taken lit, with its own picture in it; those still to take dark and empty
    const show = () => { const got = N - st.left; frames.querySelector('b').textContent = String(got).padStart(2, '0'); frames.querySelectorAll('.strip i').forEach((c, i) => { const p = st.prints[i], on = i < got; if (on && !c.classList.contains('got')) { c.classList.add('got', 'new'); setTimeout(() => c.classList.remove('new'), 1400); } else if (!on) c.classList.remove('got', 'new'); c.style.backgroundImage = on && p && p.src ? `url("${p.src}")` : ''; }); };
    function title(small, big, secs) {
      card.querySelector('small').textContent = small; card.querySelector('span').textContent = big;
      card.classList.add('on');
      later(secs * 1000, () => card.classList.remove('on'));
    }
    // the case kept in this browser: the frame it is at and the prints so far
    const KEY = () => `oe-story-${st.ep ? st.ep.id : ''}`;
    const keep = () => { try { localStorage.setItem(KEY(), JSON.stringify({ fi: st.fi, left: st.left, prints: st.prints, flags: st.flags, pairs: st.pairs, file: st.file, failed: st.failed || 0, snaps: st.snaps, helped: st.helped, told: st.told || 0, misses: st.misses || 0 })); } catch (e) { /* storage full or blocked: the case is played in one go */ } };
    const kept = () => { try { const k = JSON.parse(localStorage.getItem(KEY()) || 'null'); return k && k.fi > 0 && k.fi < (st.ep.frames || []).length && Array.isArray(k.prints) ? k : null; } catch (e) { return null; } };
    const forget = () => { try { localStorage.removeItem(KEY()); } catch (e) { /* storage blocked */ } };
    // the goal: one line, under the Stop's minutes or the frame the case is at
    let goalText = '';
    function goal(text) {
      const fresh = !goalText && st.beat !== 'shoot'; // (not with the camera up: the middle of the frame is the picture's) // (a goal where there was none is announced: it arrives large in the middle of the frame, then goes up to its line)
      goalText = text || '';
      if (!goalText) { goalEl.classList.remove('on', 'new'); return; }
      if (fresh) sfx('goal');
      goalEl.querySelector('span').textContent = goalText;
      if (fresh) { goalEl.classList.remove('new'); void goalEl.offsetWidth; goalEl.classList.add('new'); }
      goalEl.classList.add('on');
    }
    const clockOf = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    // a place as the beacon and the mark want it: [x, y, the height of a head there, the floor]
    const spot = p => { const z = p[2] != null ? p[2] : ctx.floor(p[0], p[1]); return [p[0], p[1], z + 1.2, z]; };
    const near = (p, r) => Math.hypot(p[0] - ctx.player.x, p[1] - ctx.player.y) < r && (p[2] == null || Math.abs(p[2] - ctx.player.z) < 4);
    // where the goal is: the light in the world, and its mark in the frame (held at the edge on the side it lies)
    // What the mark is of is said by its shape, so that nobody walks towards a thing they are only to photograph (on the
    // roof the mark on the dome read "143 m" and pointed off the edge): `go` a ring and its metres (a place to walk to);
    // `meet` and `ghost` a speech mark, "Talk" (the living in paper, an afterimage in its blue); `stand` a camera, "Stand
    // here" (where the picture is taken from, and the light there is amber); `frame` the corners of a finder and no
    // metres (the thing the picture is of: turned to, never walked to)
    const MARKS = { meet: 'Talk', ghost: 'Talk', stand: 'Stand here' };
    function aimAt(at, turn, kind) { st.target = at; st.kind = kind || 'go'; mark.dataset.kind = st.kind; guideTo(at); light(null); if (!at) mark.classList.remove('on'); else { if (turn && ctx.look) ctx.look(at); markTick(0); } } // (turn: the view is brought round to it, so that a new goal is in front of you)
    // the light standing in the street, set only when it changes
    // (a standpoint's light has the size of the place: its edge on the ground at task.within_m, so that inside it can be seen)
    function light(at, kind) { const k = at ? `${at}|${kind}` : ''; if (k === st.lightK) return; st.lightK = k; const T = st.fr && st.fr.task, r = at && kind === 'stand' && T && T.stand && Math.hypot(at[0] - T.stand[0], at[1] - T.stand[1]) < 0.5 ? T.within_m || 4 : 0; ctx.beacon(at, kind, r); }
    // Who shows the way. A dog going ahead of you is the way, and anything else that says where to go is a second voice
    // saying it: a column of light over the street, a gold line on the paving, a ring at the edge of the frame with
    // its metres. Each draws the eye off him to a sign, and he becomes something walking beside the instructions. So
    // while he leads to the goal, he alone shows it. The signs come back only where he cannot do it: before he is met,
    // while he is off on his own errand, where the goal is a thing to frame and not a place, and when the player has
    // gone LOST_S seconds without getting any nearer (whatever the reason: the signs are the net under him). Two
    // things stay: someone to talk to is marked once they are near and in sight (TALK_M: across a wall, 116 m off, a
    // speech mark only said there was someone behind it), and when he is out of the frame an arrow at its edge says
    // where he is, not where the goal is
    const TALK_M = 12, LOST_S = 30, LEADS = { greet: 1, lead: 1, wait: 1, fetch: 1, go: 1, sit: 1 };
    function ledBy(to) {
      const d = st.dog;
      return !!(d && d.ready && d.to && LEADS[d.state] && st.kind !== 'frame' && Math.hypot(d.to[0] - to[0], d.to[1] - to[1]) < 6);
    }
    // the guide, once met (in the first Stop), stays the episode through: ahead of you to wherever the goal is while the
    // world runs (someone to meet, where it will stop, the car), at your side when there is nowhere to go; in a Stop
    // he is sent by seek and task instead (to the afterimage, to where the picture is taken from)
    function guideTo(at) { if (!st.dog || st.phase === 'stop') return; if (at) st.dog.lead([at[0], at[1]], st.beat === 'meet' ? 2.2 : 3); else st.dog.heel(); }
    function markTick(dt = 0) {
      if (!st.target) { st.guided = false; light(null); return; }
      const via = ctx.via ? ctx.via(st.target) : null, to = via || st.target; // (a place up a tower: the lift's door first)
      st.via = via;
      const W = ctx.stage.clientWidth, H = ctx.stage.clientHeight, m = 46;
      // (someone to talk to: the mark over their head, not on their chest, where a pale mark on a pale figure was lost)
      const person = !via && (st.kind === 'meet' || st.kind === 'ghost'), head = person ? [to[0], to[1], to[2] + 0.95] : to;
      let q = ctx.screen(head);
      const talk = person && q.front && q.dist <= TALK_M && (!ctx.seen || ctx.seen(head)); // (near and in sight: a speech mark; else a place to walk to)
      // getting nearer? (the leg is the beat and the kind of goal: a car that moves is the same leg)
      // (the way there, where it is a place to walk to: route.js ways.walk, as the gold line draws it and the dog follows it.
      // Its metres are what "nearer" means: a way that first turns from the goal round a block is followed, not strayed from)
      const wy = st.kind !== 'frame' && !st.cam && ctx.way ? ctx.way(st.target, !!via) : null;
      const leg = `${st.fi}|${st.phase}|${st.beat}|${st.kind}`, px = ctx.player.x, py = ctx.player.y, left = wy ? wy.left : Math.hypot(to[0] - px, to[1] - py);
      if (leg !== st.leg) { st.leg = leg; st.best = left; st.idle = 0; st.lost = false; }
      if (left < st.best - 2) { st.best = left; st.idle = 0; } else st.idle += dt;
      const led = !st.lost && ledBy(st.target);
      if (led && st.idle > LOST_S) st.lost = true;
      st.guided = led && !st.lost;
      light((st.guided && !(st.hint >= 3)) || st.kind === 'frame' ? null : to, via ? 'go' : st.kind); // (the third hint is the light, his lead or not)
      let k = via || (person && !talk) ? 'go' : st.kind;
      // Where the signs show the way (he is not leading), the mark is of the way, not of the goal as the crow flies: on
      // the paving by the Shibuchika stair the arrow pointed up and right at the lift "127 m" off, over the station's
      // works, while the way went round to the left, and whoever followed it walked into a dead end. So it points where
      // the way turns next (the furthest point of it that can be walked to straight from here: ctx.way, the route the
      // gold line draws and the dog follows, route.js ways.walk), and its metres are the way's. Where the way runs
      // straight to the goal, it is the goal's own mark (docs/STORY.md "Who shows the way")
      st.wayAim = null;
      if (!st.guided && !talk && wy) {
        if (wy.aim) { st.wayAim = wy.aim; q = ctx.screen([wy.aim[0], wy.aim[1], wy.aim[2] + 1.2]); k = 'go'; }
        q.dist = wy.left;
      }
      if (st.guided && !talk) {
        // he is the way: nothing marked while he is in the frame; out of it, an arrow at its edge to him. But only to him
        // where he can be seen from here and is in front of you on the way: on SHIBUYA SKY's floor the arrow said
        // "Hachi" at the foot of the frame and pointed at the floor (he was behind a player who had run past him), and
        // in the street it pointed at a wall he was behind. Out of sight a while, he is called and comes back to you
        // (companion.js call); behind you on the way, he is already running to be in front again. Either way, no arrow
        const d = st.dog, at = [d.x, d.y, d.z + 0.6], dq = ctx.screen(at), dx = dq.x * W, dy = dq.y * H;
        const inSight = !ctx.seen || ctx.seen(at);
        st.unseen = inSight ? 0 : (st.unseen || 0) + dt;
        if (st.unseen > 1.5 && dq.dist > 10) d.call(); // (not for a post between: further than he leads from, and a while)
        if ((dq.front && dx > m && dx < W - m && dy > m && dy < H - m) || dq.dist < 6 || !inSight || d.behind) { mark.classList.remove('on'); return; } // (at your heels, out of the frame below you, he is not lost: no arrow pointing at your feet)
        q = dq; k = 'guide';
      }
      let x = q.x * W, y = q.y * H;
      if (!q.front) { x = W - x; y = H - m; } // (behind: its mark at the foot of the frame, on its side)
      if (!q.front && k === 'guide') { x = x < W / 2 ? m : W - m; y = H / 2; } // (the dog behind the lens: on the side to turn to, not at the foot, where it read as down)
      // with the camera up the frame lines are the guide: no ring over the thing itself. But while it is outside them
      // an arrow on the frame's edge says which way to turn the lens, and what for (a player on the roof stood at the
      // light looking down for minutes with nothing to say where the thing was)
      const up = st.cam && st.beat === 'shoot', r = up ? finderRect() : null, R = up && st.fr.task.relic;
      if (up && !q.front) { x = x < W / 2 ? 0 : W; y = H / 2; } // (behind: on the frame's left or right edge, the way to turn; at its foot the arrow said look down, and down was the floor)
      const off = up ? !q.front || x < r[0] * W || x > r[2] * W || y < r[1] * H || y > r[3] * H : !q.front || x < m || x > W - m || y < m || y > H - m;
      if (up) { x = Math.max(r[0] * W + 22, Math.min(r[2] * W - 22, x)); y = Math.max(r[1] * H + 22, Math.min(r[3] * H - 40, y)); }
      else { x = Math.max(m, Math.min(W - m, x)); y = Math.max(m + 70, Math.min(H - m, y)); }
      mark.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      mark.classList.toggle('r', x > W - 120); mark.classList.toggle('l', x < 120); // (at a side of the frame its words are set inward, not cut by the edge)
      const lens = !!up && k === 'frame', side = off ? (q.front ? '' : ' · behind you') : ''; // (the lift's door is a place to walk to, whatever waits at the top)
      if (mark.dataset.kind !== k) mark.dataset.kind = k;
      mark.querySelector('b').textContent = lens ? `${(R && R.name) || 'Frame this'}${side}` : k === 'frame' ? `Frame this${side}` : k === 'guide' ? `${(st.ep.guide || {}).name || 'The dog'}${side}` : `${MARKS[k] ? `${MARKS[k]} · ` : ''}${Math.max(1, Math.round(q.dist))} m${side}`;
      // (the thing to photograph: marked while the camera is down; with it up, only the arrow and its name while it is
      // outside the lines; inside them the finder's bright lines are the guide)
      mark.classList.toggle('on', lens ? off : k === 'frame' || k === 'guide' || q.dist > 4); mark.classList.toggle('off', off); mark.classList.toggle('lens', lens); // (lens is a boolean: toggle with undefined flips the class every frame, and the mark trembled)
      if (off) mark.style.setProperty('--a', `${Math.atan2(y - H / 2, x - W / 2).toFixed(3)}rad`); // (its arrow points the way to turn)
    }
    // (with a controller in the hand: its sticks)
    const KEYS = () => (ctx.padOn && ctx.padOn() ? `<span><kbd class="pad">${K('Left stick')}</kbd>walk</span><span><kbd class="pad">${K('Right stick')}</kbd>look</span>` : ctx.touch ? '<span>Left thumb · walk, pushed further · run</span><span>Drag · look</span>' : '<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>walk</span><span><kbd>Shift</kbd>run</span><span>Mouse · look</span>');
    let keysAre = '';
    function keysHint(on) { if (on) { keysAre = KEYS(); keys.innerHTML = keysAre; } keys.classList.toggle('on', on); }
    const voiceOf = a => Object.assign(a.year ? { pitch: 170, past: 1 } : a.age >= 70 ? { pitch: 160, breath: 1 } : { pitch: 200 }, a.voice || {}); // (someone of another year is heard twice; the old have breath in it)
    const who = a => ({ name: a.name || '', role: a.year ? String(a.year) : [a.age ? `${a.age}` : '', a.role || ''].filter(Boolean).join(' · '), alive: !a.year, voice: voiceOf(a) }); // (the living: their age tonight; an afterimage: its year)

    // before the opening shot: the evening the episode is set in
    function dress(id) {
      const ep = eps.find(e => e.id === id) || eps[0];
      if (!ep) return null;
      st.ep = ep; st.phase = 'dressed'; st.t = 0;
      ctx.dress(ep.date || null, ep.light || 'blue', ep.weather || null);
      // the air (leaves coming down, pigeons going over) from the opening shot on, the first frame's own if it has one:
      // made at frame(), it came half a second before the first Stop, after the walk in and the phone call, and to the
      // player the leaves and the birds came with the Stop instead of being caught by it
      { const f = ep.frames[0] || {}, a = JSON.stringify(f.air || (f.weather === 'rain' ? { leaves: 40, birds: 0 } : {})); if (ctx.air && a !== st.air) { st.air = a; ctx.air(JSON.parse(a)); } }
      return ep;
    }
    // The order in the hand. As the player is given the street, the sheet they were sent out with comes up into the
    // frame: who, which kerb, what for, and why at this hour (a survey photograph is taken at blue hour, when the sky
    // and the lamps are equally bright; so the hour the whole story turns on is explained by the job, on a thing the
    // player holds, with the street still running behind it). Its words come up as ink does, a letter at a time, and
    // the old plan's corner is on it with its one pencilled word. E, Enter or a tap puts it away; left alone it goes
    // by itself. It was a black card with typing on it between the title and the opening shot: the street had already
    // been shown on the title, was taken away for the card, and was then come down to again from the air.
    // (ep.order: { head, to, lines, plan: { word, note } }; a case taken up again does not show it.)
    function order(done) {
      const ep = st.ep, O = ep && ep.order;
      if (!O || !(O.lines || []).length) return done();
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      let n = 0;
      const ink = t => [...t].map(c => (c === ' ' ? ' ' : `<i style="animation-delay:${(n++ * (still ? 0 : 20)) + 500}ms">${esc(c)}</i>`)).join('');
      pre.innerHTML = `<div class="sheet"><small>${ink(O.head || '')}</small>${O.to ? `<b>${ink(O.to)}</b>` : ''}${O.lines.map(l => `<p>${ink(l)}</p>`).join('')}
${O.plan ? `<figure><svg viewBox="0 0 220 120" aria-hidden="true"><g fill="none" stroke="#2a1f16" stroke-width="1.1" opacity="0.75"><path d="M8 78 H120 Q138 78 138 96 V116"/><path d="M8 62 H128 Q154 62 154 88 V116" stroke-dasharray="3 3"/><path d="M150 8 V40 Q150 54 164 54 H212"/><path d="M40 78 v-20 M70 78 v-20 M100 78 v-20" opacity="0.5"/></g><circle cx="112" cy="92" r="17" fill="none" stroke="#1d2a4a" stroke-width="1.2" opacity="0.8"/><text x="112" y="99" text-anchor="middle" font-size="17" fill="#1d2a4a" style="font-family: var(--f-jp, serif)">${esc(O.plan.word || '')}</text><text x="12" y="20" font-size="8" letter-spacing="2" fill="#5a2a22" style="font-family: var(--f-mono, monospace)">N-W KERB</text></svg><figcaption>${ink(O.plan.note || '')}</figcaption></figure>` : ''}
<em>${ctx.touch && !(ctx.padOn && ctx.padOn()) ? 'Tap to put it away' : '<kbd>E</kbd> put it away'}</em></div>`;
      st.phase = 'go'; st.beat = 'order'; goal('');
      pre.classList.add('on');
      let over = false; const total = 500 + n * (still ? 0 : 20);
      const end = () => {
        if (over) return;
        over = true; clearTimeout(tm); removeEventListener('keydown', key, true); pre.removeEventListener('pointerdown', end);
        pre.classList.remove('on'); st.beat = '';
        st.file.unshift({ at: '', text: [O.head, O.to].concat(O.lines).filter(Boolean).join(' '), kind: 'order' }); // (the file begins with what the player was sent out with)
        setTimeout(done, 500);
      };
      const key = e => { if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); } };
      const tm = setTimeout(end, total + 14000); // (read at leisure; the Stop waits for it)
      addEventListener('keydown', key, true); pre.addEventListener('pointerdown', end);
    }
    // tonight's own set dressing (an episode's `set`: things only tonight has, past.js models drawn always): put up as the
    // player is given the street, in the story or on the walk (game.js startWalk), once. (SKY GATE's lobby was the first;
    // it is a hero level now, cities/shibuya/hero_skylobby.py)
    function setDress(ep = st.ep) {
      for (const [i, r] of ((ep && ep.set) || []).entries()) if (ctx.relic && !st[`set${i}`]) st[`set${i}`] = ctx.relic(Object.assign({ set: true }, r));
    }
    // as the player is given the street
    function begin() {
      const ep = st.ep || dress();
      if (!ep) return;
      ctx.stage.classList.add('story-on');
      setDress(ep);
      for (const c of ep.cast || []) if (!st.cast[c.id]) { st.cast[c.id] = Object.assign(ctx.figure(Object.assign({ alive: true }, c), c.at), { name: c.name, role: c.role, age: c.age, voice: c.voice }); if (c.face && st.cast[c.id].face) st.cast[c.id].face(c.face[0], c.face[1]); } // (face: where they look all evening, the old man at the crossing)
      const k = kept();
      if (k) { st.left = k.left; st.prints = k.prints; st.flags = k.flags || {}; st.pairs = k.pairs || []; st.file = k.file || k.prints.map(p => ({ at: p.stamp, text: p.note || p.cap || '' })).filter(e => e.text); st.failed = k.failed || 0; st.snaps = Array.isArray(k.snaps) ? k.snaps : []; st.helped = k.helped || {}; st.told = k.told || 0; st.misses = k.misses || 0; }
      else { st.flags = {}; st.pairs = []; st.file = []; st.snaps = []; }
      st.resumed = !!k;
      if (ep.walk_in_s != null && !k) ctx.walkIn(ep.walk_in_s);
      show(); if (k) frames.classList.add('on');
      // a case begun at its first frame opens on a voice: who you are, why you are on this kerb at this hour, and the one
      // odd thing about the job (ep.prologue: {who, voice, lines}); a case taken up again goes straight to its frame
      const P = !k && ep.prologue && !ep.prologue.after && ep.prologue; // (after: the office rings once the first Stop has let go, not before it)
      if (P && (P.lines || []).length) { st.phase = 'go'; st.beat = 'prologue'; ctx.say(Object.assign({ alive: true, auto: true, voice: Object.assign({ pitch: 150 }, P.voice || {}) }, P.who || {}), P.lines, () => frame(0)); }
      else if (!k) order(() => frame(0)); // (a case begun: the order in the hand first, then the street, and a second later the Stop)
      else frame(k.fi);
    }
    // The rain, once in the evening (docs/STORY.md, "Weather, light and sound"). It came on as the last frame began, at
    // once: the street wet and nine in ten umbrellas up in one frame, and the words "It has begun to rain" after it, on no
    // beat of the story. The owner found it abrupt. Now as a shower comes on at the crossing: the cloud lowers while the player
    // crosses to her (the frame's start, rain_on), and on her first word the first drops; the rain builds over half a
    // minute, the street darkens as it wets, and the crowd's umbrellas go up one by one behind her as she speaks
    // (people.js wantUmb), so that when the talk is done the crossing is umbrellas. pace: how fast it builds (0 at once,
    // as the menu's)
    function rain(pace) {
      if (st.rain) return;
      st.rain = true;
      if (pace) { ctx.weather('rain', false, pace); if (ctx.score) ctx.score({ rain: 0.8 }); }
      later(pace ? 4500 : 1500, () => { say('It has begun to rain'); sfx('rain'); }); // (said once the drops can be seen)
    }
    // a frame begins: the sky it has, a word with the living if there is one, and the way to where the world will stop
    function frame(i) {
      const fr = st.ep.frames[i];
      st.fi = i; st.fr = fr; st.phase = 'go'; st.t = 0; st.late = false; st.asked = 0; st.called = false; huntFresh(); // (the hints asked for in one frame are not carried into the next: the third's light stood beside the dog leading to the old man)
      // (rain_on: the cloud first, over half a minute as the player crosses to them, and the rain on the first word, rain())
      const waits = fr.weather === 'rain' && fr.rain_on === 'meet' && fr.meet && !st.rain;
      if (fr.weather) ctx.weather(waits ? 'overcast' : fr.weather, !waits && !!fr.wet, waits ? 0.45 : 0);
      // (the case as it stood on arriving at this frame: what going back into it from the last card restores. Not the
      // prints themselves, which the roll keeps in order, but how many; a frame taken up again after a slip keeps its first)
      if (!(st.again || st.resumed) || !st.snaps[i]) { st.snaps.length = i; st.snaps[i] = { n: st.prints.length, left: st.left, flags: Object.assign({}, st.flags), pairs: st.pairs.slice(), file: st.file.map(e => Object.assign({}, e)), failed: st.failed || 0 }; }
      st.resumed = false; keep();
      // the scene's air (leaves, birds), made again only where the scene's differs; and a car, where the frame sends one
      { const a = JSON.stringify(fr.air || (fr.weather === 'rain' || st.rain ? { leaves: 40, birds: 0 } : {})); if (a !== st.air && ctx.air) { st.air = a; ctx.air(JSON.parse(a)); } }
      // the score, set to the scene: the evening going into night as the frames go, the roof's air, the rain
      if (ctx.score) ctx.score(Object.assign({ slot: i < 3 ? 'evening' : 'night', hour: 17.3 + i * 0.55, rain: (fr.weather === 'rain' && !waits) || st.rain ? 0.8 : 0, mode: i === 3 ? 'heli' : 'foot', theme: i, held: false }, fr.score || {})); // (theme: the score knows as much of its tune as the roll has frames)
      if (fr.weather === 'rain' && !st.rain && !waits) rain(0);
      // the helicopter the next frame's flight goes by (its flight.board) stands parked on its pad through this frame (ctx.board)
      if (ctx.board) { const nx = st.ep.frames[i + 1]; ctx.board(null, nx && nx.flight && nx.flight.board ? 'parked' : null); }
      const go = () => {
        if (st.fr !== fr) return;
        // a frame reached by car: one is sent, the goal is the car until you are in it, and the frame goes on where it sets you down
        // (or where you walk to: nobody has to take it)
        const sent = fr.ride && ctx.ride && !st.rode ? ctx.ride(fr.ride) : false;
        if (sent === 'wait' && (st.rideAsk = (st.rideAsk || 0) + 1) < 240) { goal(fr.ride.line || 'A car is coming for you.'); setTimeout(go, 500); return; } // (the cars still coming in: asked again, for up to two minutes)
        st.rideAsk = 0;
        if (sent && sent !== 'wait') { st.rode = true; st.beat = 'ride'; st.rideGo = go; goal(fr.ride.line || 'A car is coming for you.'); return; }
        st.rode = false;
        // a message on the phone (fr.call: { who, voice, lines }): heard once as the frame begins, before anything is
        // asked of the player; a frame taken up again after a slip does not ring twice
        if (fr.call && !st.called && !st.again && L(fr.call.lines).length) { st.called = true; st.beat = 'call'; goal(''); aimAt(null); return ctx.say(Object.assign({ alive: true, auto: true, voice: Object.assign({ pitch: 150 }, fr.call.voice || {}) }, fr.call.who || {}), L(fr.call.lines), go); }
        if (fr.meet) { st.beat = 'meet'; goal(fr.meet.goal || ''); const m = living(fr.meet); if (m) aimAt(spot([m.x, m.y, m.z]), true, 'meet'); }
        else approach();
      };
      // a frame reached by air: the flight to it first (ctx.film: the helicopter, the city under it, and the place it sets you down)
      // Boarded (flight.board): the helicopter is on its pad with its rotor turning over, the goal is to get in, and E beside
      // it puts you in at once; the flight lifts off from there with you (and the dog) in it. It was once a film that began
      // two seconds after the roof's picture, with no helicopter in it: you were on the street with no way down seen, and
      // what was said on the roof was cut off under it. A case taken up again at this frame, on the street, has the flight alone.
      const fly = () => { st.beat = 'flight'; goal(''); aimAt(null); frames.classList.remove('on'); if (st.dog && st.dog.aboard) st.dog.aboard(true); ctx.film(fr.flight, () => { frames.classList.add('on'); if (st.dog && st.dog.aboard) st.dog.aboard(false); go(); }); };
      const B = fr.flight && ctx.film && !st.again && fr.flight.board, pad = B && ctx.board ? ctx.board(() => { if (st.fr === fr && st.beat === 'board') fly(); }) : null;
      // (why it is there, first: the office rings, in its own voice, the episode prologue's, with flight.board.call)
      const board = () => { if (st.fr !== fr) return; st.beat = 'board'; goal(B.goal || 'Get in the helicopter.'); aimAt(spot(pad), true); if (ctx.look) ctx.look(pad, true); };
      const C = pad && B.call, P = st.ep.prologue || {};
      if (C && L(C.lines).length) { st.beat = 'call'; goal(''); aimAt(null); if (ctx.look) ctx.look(pad, true); ctx.say(Object.assign({ alive: true, auto: true, voice: Object.assign({ pitch: 150 }, P.voice || {}, C.voice || {}) }, C.who || P.who || {}), L(C.lines), board); }
      else if (pad) board();
      else if (fr.flight && ctx.film && !st.again) fly();
      else go();
    }
    const living = m => (m.cast ? st.cast[m.cast] : ctx.person(m.npc));
    function approach() {
      const fr = st.fr, a = fr.afterimage;
      st.beat = 'approach'; st.t = 0;
      goal(fr.goal || '');
      // (a frame whose place the player finds, fr.find: no ring stands there; the goal says what is known of it, the roll
      // has the print that shows it, and more is given only when it is asked for: hint())
      st.findT = 0; st.lit = !fr.find || st.late; huntFresh();
      aimAt(!st.lit || fr.lead_s != null || !(fr.stop_at || a) ? null : spot(fr.stop_at || a.at), true);
    }
    // what the living ask: each question until it is answered rightly (a wrong answer costs nothing but the look they give you)
    // A question with `frame` is answered with a print (the living are shown it; an afterimage, who cannot see a
    // photograph, is told what it has in it): the roll so far is laid out, and the one that settles it is picked.
    // What the player says decides what comes after (the case is the player's, not recited to them):
    // - a line may be { if: flag, not: flag, say }: said only to a player who has (or has not) done the thing (L);
    // - a question with `choice` has no right answer: each option { text, set: flag, say } is something the player
    //   commits to, kept in st.flags (and in the save) for later lines to answer;
    // - a question with `fail: { after, lines, title, line }` can be lost: after that many wrong answers in one talk
    //   the one asked sees through the player, the Stop lets go, and the frame is taken up again from its beginning
    //   (failed, retry). Nothing but the minute is lost, but it is lost in front of the player;
    // - a question that wants a print the player spent on nothing (shoot: plain) is passed over; the frame's
    //   `lost<n>` flag is set, so those who would have answered to it say something else.
    const L = list => [].concat(list || []).filter(l => typeof l === 'string' || ((!l.if || st.flags[l.if]) && (!l.not || !st.flags[l.not]))).map(l => (typeof l === 'string' ? l : l.say));
    function ask(m, w, done, as) {
      let q = as || (m.ask || [])[st.asked];
      while (!as && q && ((q.if && !st.flags[q.if]) || (q.not && st.flags[q.not]) || (q.frame && st.prints[q.frame - 1] && st.prints[q.frame - 1].plain))) q = (m.ask || [])[++st.asked];
      if (!q || (q.frame && !st.prints[q.frame - 1])) { st.want = -1; return done(); } // (a print the roll does not have cannot be asked for)
      if (q.press) return cross(m, w, q, done);
      if (q.proof) return summation(m, w, q, done);
      if (q.choice) {
        const opts = q.options.map((o, i) => ({ k: i, text: o.text }));
        st.want = q.play || 0; // (tools/story_play.js takes this one)
        // (a question someone is waiting on, wait_s: silence is an answer too. Once its answers are up a line under them
        // runs down, held while the roll, the log or the menu is open, and when it has run out the player has said
        // nothing (`silent`, answered as an option is). Frame 3's question after the print held one player half an hour:
        // a choice with no right answer and no time, which sent them to the roll, with the question waiting under it)
        st.waitQ = q.wait_s && q.silent ? { left: q.wait_s, all: q.wait_s } : null; st.silenced = false;
        return ctx.ask(q.own ? Object.assign({}, w, { name: q.own, role: '', alive: true }) : w, [q.q], opts, c => { // (own: the question is the player's own, not in anyone's mouth)
          st.waitQ = null; timed(null);
          const quiet = !c && st.silenced && q.silent; st.silenced = false;
          const o = quiet ? q.silent : q.options[c ? c.k : 0] || q.options[0];
          if (o.set) st.flags[o.set] = true;
          if (o.file) filed(o.file.say || o.file, { key: o.file.key || o.set || '', strikes: o.file.strikes || '', kind: 'said' });
          st.want = -1; st.asked++; keep(); sfx('goal');
          const said = L(o.say);
          return said.length ? ctx.say(w, said, () => ask(m, w, done)) : ask(m, w, done);
        });
      }
      const gone = struck(q), opts = (q.frame ? st.prints.map((p, i) => ({ k: i + 1, text: printOpt(p, i) })) : wordsOf(q)).filter(o => !gone.p.has(o.k)).concat(q.told ? [lookOpt()] : []), right = q.frame || q.answer;
      st.want = opts.findIndex(o => o.k === right); // (which answer is the right one: tools/story_play.js picks it)
      st.canFail = !!(q.fail || q.told);
      ctx.ask(q.frame && !w.alive ? Object.assign({}, w, { name: 'The roll', role: `${st.prints.length} prints`, alive: true }) : w, [q.q], opts, c => { // (what an afterimage is told is yours to choose: the question is not in their mouth)
        if (q.told) { if (c && c.k === LOOK) return atHand(() => ask(m, w, done, as)); return judged(m, w, q, !!c && c.k === right, !!c && c.k === right ? q.right : wrongFor(q, c && c.k), done, { named: c ? c.k : null, okS: !!c && c.k === right }); } // (asked in words alone: lost_q)
        if (!!c && c.k === right && q.frame) sting('turn'); // (a print that settles it: the case turns)
        const ok = !!c && c.k === right, said = L((ok ? q.right : wrongFor(q, c && c.k)) || (ok ? [] : ['No. Look at the prints again.']));
        sfx(ok ? 'right' : 'wrong'); st.want = -1;
        if (ok) st.asked++;
        else if (q.fail && ++st.slips >= (q.fail.after || 1)) { const F = L(q.fail.lines); return F.length ? ctx.say(w, F, () => failed(q.fail)) : failed(q.fail); }
        else if (q.frame && c) gone.p.add(c.k); // (a print that was not it is off the roll for the next try)
        const more = ok ? said : said.concat(helpFor(q));
        return more.length ? ctx.say(w, more, () => ask(m, w, done)) : ask(m, w, done);
      });
    }
    // What a wrong answer takes off the table for the next try (a statement that stands, a print that is not it), so that
    // each try is narrower than the last and a player who cannot work it out still gets to the end of the question by
    // elimination, and the line that says where to look, after the first slip (`help` on the question): the second
    // is the last the one asked allows. Both are forgotten when the frame is taken up again.
    let struckBy = new WeakMap();
    const struck = q => { let g = struckBy.get(q); if (!g) struckBy.set(q, g = { s: new Set(), p: new Set() }); return g; };
    const helpFor = q => (q.help && st.slips === 1 ? L(q.help) : []);
    // A print as an answer (the roll laid out), and the answers that are not prints: one of the case's people (`who`:
    // the episode's `people`, each with what the player knows them as), or one of the question's own sentences
    const printOpt = (p, i) => `<span class="pr${p.plain ? ' spent' : ''}">${p.src ? `<img alt="" src="${p.src}">` : '<i></i>'}<b>${i + 1}</b><span>${esc(p.cap || p.stamp || '')}</span></span>`;
    const wordsOf = q => (q.who ? (st.ep.people || []).filter(o => (!o.if || st.flags[o.if]) && (!o.not || !st.flags[o.not])).map(o => ({ k: o.id, text: `<span class="who"><b>${esc(o.name)}</b><small><i hidden> · </i>${esc(o.role || '')}</small></span>` })) : (q.answer != null ? mixed(q) : (q.options || []).map((_, i) => i)).map(i => ({ k: i, text: q.options[i] })));
    // (answers of which one is right are laid out in an order of their own each time the frame is taken up: the right
    // one was always the first of three, issue 117. Kept for the talk, so that a second try finds them where they were)
    let mixedBy = new WeakMap();
    const mixed = q => { let o = mixedBy.get(q); if (!o) { o = (q.options || []).map((_, i) => i); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } mixedBy.set(q, o); } return o; };
    const wrongFor = (q, k) => (q.wrong_by && k != null && q.wrong_by[k] != null ? q.wrong_by[k] : q.wrong); // (a wrong answer is answered for what was said: a hint at the print to look at again)
    // The summation (a question with `proof`): the challenge to the reader. Answered in words first and then with the
    // evidence: the one asked names it (`who`: one of the case's people, from all of them; else one of `options`), then
    // shows the print or the pair that proves it. Both are judged together, and a wrong one counts once toward `fail`;
    // what is said back says which was wrong. It was the other way round, the print first and then one of three
    // sentences, and the print gave the sentence away (the foreman's own frame, then "the foreman, her brother"), and the
    // question gave the print away ("show me where it changed hands"). `proof` lists the frames (numbers) and the pairs
    // ("a-b") that prove it; those spent, or a pair never set side by side, are not on the roll to be shown. Where none
    // is left, the question is asked another way (`lost_q`), in words alone: the lost<n> flags have said which is gone.
    //   { q, who: true | options, answer: id | index, show: the second line, proof: [5, "4-5"], lost_q, right, wrong, wrong_by: { id: lines }, wrong_print, fail }
    const pairOf = k => String(k).split('-').map(Number);
    const proofOn = q => (q.proof || []).filter(p => (typeof p === 'number' ? !!st.prints[p - 1] && !st.prints[p - 1].plain : st.pairs.includes(p)));
    // (hot: the prints a second wrong answer has pointed at, marked on the roll as it is laid out)
    const rollOpts = (hot = []) => st.prints.map((p, i) => ({ k: i + 1, text: printOpt(p, i).replace('class="pr', `class="pr${hot.includes(i + 1) ? ' hot' : ''}`) }))
      .concat(st.pairs.slice().sort().map(key => { const [a, b] = pairOf(key), th = i => { const p = st.prints[i - 1]; return p && p.src ? `<img alt="" src="${p.src}">` : '<i></i>'; }; return { k: key, text: `<span class="pr pair${hot.includes(key) ? ' hot' : ''}"><span class="pp">${th(a)}${th(b)}</span><b>${a} + ${b}</b><span>Side by side</span></span>` }; }));
    // The record at hand (as a court's record is open on the desk while evidence is presented): one more answer under
    // every question of the summation opens the roll and the file over it, and closing them asks the question again
    const LOOK = '__look';
    const lookOpt = () => ({ k: LOOK, text: `<span class="look"><b>The roll and the file</b><small>Look before you answer${ctx.touch ? '' : ` · ${esc(K('Tab'))}`}</small></span>` });
    function atHand(back) { st.reask = back; st.want = -1; albumOpen(true); }
    const nameOf = k => ((st.ep.people || []).find(o => o.id === k) || {}).name || '';
    // An answer judged. A question with `fail` can be lost: after that many wrong answers in one talk the one asked
    // sees through the player and the frame is taken up again from its beginning (frames 3, 5 and 6). A question with
    // `told` (the summation, frame 7) is never lost, and nobody plays the frame again for one answer: a wrong answer is
    // answered for what was said (wrong_by, wrong_print) and written in the file against the player, struck through; a
    // second says more (`wrong2`) and marks the print that answers it on the roll; a third, and she says it herself
    // (`told`), which the file and the last card keep. A right one is written down too, and when every question of the
    // talk is settled the file says so in one line (three answers that hold together, as a ship's log confirms fates)
    // (how.free: a wrong answer the evidence fairly led to, a statement marked `near`: answered and struck off, and not counted)
    function judged(m, w, q, ok, said, done, how = {}) {
      sfx(ok ? 'right' : 'wrong'); st.want = -1; st.proving = false;
      const nm = q.who && how.named != null ? nameOf(how.named) : '';
      if (ok) { sting('turn'); st.asked++; st.qmiss = 0; if (q.file) { filed(`${q.file}: you said ${nm || 'it'}. She took it.`, { kind: 'said' }); settle(m, true); } }
      else if (!how.free && q.fail && ++st.slips >= (q.fail.after || 1)) { const F = L(q.fail.lines); return F.length ? ctx.say(w, F, () => failed(q.fail)) : failed(q.fail); }
      else if (q.told) {
        const n = st.qmiss = (st.qmiss || 0) + 1; st.misses = (st.misses || 0) + 1;
        if (q.file) filed(`${q.file}: you said ${nm || 'that'}${how.okS ? ', and showed her the wrong print' : ''}. She did not take it.`, { kind: 'said', wrong: true });
        if (n >= 3) { st.qmiss = 0; st.told = (st.told || 0) + 1; st.asked++; keep(); const T = L(q.told); filed(`${q.file}: she told you herself. ${nameOf(q.answer) || ''}`.trim(), { kind: 'said' }); settle(m, false); return ctx.say(w, T, () => ask(m, w, done)); }
        if (n === 2) { st.hot = proofOn(q); said = L(said).concat(L(q.wrong2)); } // (the second: more said, and the print marked)
        keep();
      }
      const S2 = ok ? L(said) : L(said).concat(helpFor(q));
      return S2.length ? ctx.say(w, S2, () => ask(m, w, done)) : ask(m, w, done);
    }
    // (every question of the talk settled: one line in the file, and the case is heard to close)
    function settle(m, own) {
      st.settled = (st.settled || 0) + 1; st.own = (st.own || 0) + (own ? 1 : 0); st.hot = [];
      const all = (m.ask || []).filter(q => q.told).length;
      if (all && st.settled === all) later(600, () => { say(st.own === all ? `The case holds · ${all} of ${all}` : `The case holds · ${st.own} of ${all} yours`); sfx('found'); filed(st.own === all ? `${all} answers, all yours, and they hold together.` : `${all} answers hold together. ${all - st.own === 1 ? 'One' : all - st.own} of them she gave you.`, { kind: 'pair' }); });
    }
    function summation(m, w, q, done) {
      const proofs = proofOn(q);
      if (!proofs.length) return ask(m, w, done, Object.assign({}, q, { proof: null, q: q.lost_q || q.q })); // (asked another way: in words alone)
      const words = wordsOf(q).concat(q.told ? [lookOpt()] : []);
      st.want = words.findIndex(o => o.k === q.answer); st.canFail = !!(q.fail || q.told); st.proving = false;
      ctx.ask(w, [q.q], words, c => {
        if (c && c.k === LOOK) return atHand(() => summation(m, w, q, done));
        const named = c ? c.k : null;
        const prove = () => {
          const opts = rollOpts(st.hot || []).concat(q.told ? [lookOpt()] : []);
          st.want = opts.findIndex(o => proofs.includes(o.k)); st.proving = true;
          ctx.ask(w, [q.show || 'Show me which of your prints says it.'], opts, c2 => {
            if (c2 && c2.k === LOOK) return atHand(prove); // (the name kept: the roll looked at before the print is shown)
            const okS = named === q.answer, okP = !!c2 && proofs.includes(c2.k), ok = okS && okP;
            judged(m, w, q, ok, ok ? q.right : okS ? (q.wrong_print || 'That is so. But that print does not say it. Show me the one that does.') : wrongFor(q, named), done, { named, okS });
          });
        };
        prove();
      });
    }
    // A cross-examination (a question with `press`): the one liar is caught the way a court catches one, by what he
    // said set against what the roll has. His own statements are laid out (`press`), the player picks the one the roll
    // will not let stand, then the print that breaks it (`frame`), and both are judged together. Neither the question
    // nor the picker says which statement is the lie or which print breaks it: the question once said both ("He says he
    // was in the cut all afternoon, minding the pumps. Tell him what the roof saw"). A true statement pressed is answered
    // with its own `no`; the lie with the wrong print, with `wrong_print`; a wrong pair counts once toward `fail`. An
    // afterimage cannot see a photograph: what the print shows is told him, from the roll.
    // A statement the roll fairly seems to break and does not (`near`: nailed boots on the stair against *nobody from my
    // gang went up on any roof*) is answered and struck off and costs nothing: a player who reasoned to it is not told
    // they guessed (what L.A. Noire's interrogations were faulted for: a mistake that is not shown to be one).
    //   { q, press: [{ say, no, near }], lie: index, show: the second line, frame: n, wrong_print, right, help, fail }
    function cross(m, w, q, done) {
      const gone = struck(q), said = q.press.map((o, i) => ({ k: i, text: `<span class="said">“${esc(o.say)}”</span>` })).filter(o => !gone.s.has(o.k));
      st.want = said.findIndex(o => o.k === q.lie); st.canFail = !!q.fail; st.proving = false;
      ctx.ask(Object.assign({}, w, { name: q.own || 'You', role: '', alive: true }), [q.q], said, c => { // (the question is the player's own, not in his mouth)
        const k = c ? c.k : -1, opts = st.prints.map((p, i) => ({ k: i + 1, text: printOpt(p, i) })).filter(o => !gone.p.has(o.k));
        st.want = opts.findIndex(o => o.k === q.frame); st.proving = true;
        ctx.ask(w.alive ? w : Object.assign({}, w, { name: 'The roll', role: `${st.prints.length} prints`, alive: true }), [q.show || 'And what does the roll have against it?'], opts, c2 => {
          const okS = k === q.lie, okP = !!c2 && c2.k === q.frame, ok = okS && okP;
          if (!okS && k >= 0) gone.s.add(k); else if (okS && c2 && !okP) gone.p.add(c2.k); // (a statement that stands, or a print that is not it: off the table for the next try)
          judged(m, w, q, ok, ok ? q.right : !okS ? ((q.press[k] || {}).no || q.wrong || 'That stands.') : q.wrong_print || 'That is nothing to me.', done, { free: !okS && !!(q.press[k] || {}).near });
        });
      });
    }
    // what is said, what is asked, and what is said once it is answered (`then`): of the living, or of an afterimage
    // (a line among them may be another's: { by: a cast id, say }, heard in that one's voice and under no name: the first
    // evening's *You came late* is the old woman's, a beat before the girl turns, and the last evening says so)
    const runs = list => { const out = []; for (const l of [].concat(list || [])) { if (typeof l !== 'string' && ((l.if && !st.flags[l.if]) || (l.not && st.flags[l.not]))) continue; const by = typeof l === 'string' ? '' : l.by || '', text = typeof l === 'string' ? l : l.say; if (out.length && out[out.length - 1].by === by) out[out.length - 1].lines.push(text); else out.push({ by, lines: [text] }); } return out; };
    const sayRuns = (R, w, done) => { if (!R.length) return done(); const [r, ...rest] = R, c = r.by && st.cast[r.by]; const who2 = c ? { name: (st.ep.cast || []).find(q => q.id === r.by)?.unseen || 'A voice', role: 'tonight', alive: true, voice: voiceOf(c) } : w; return ctx.say(who2, r.lines, () => sayRuns(rest, w, done)); };
    const hear = (m, w, done) => { st.slips = 0; st.qmiss = 0; st.hot = []; st.settled = 0; st.own = 0; const go = () => { st.asked = 0; ask(m, w, () => { const T = L(m.then); return T.length ? ctx.say(w, T, done) : done(); }); }, first = runs(m.lines); return first.length ? sayRuns(first, w, go) : go(); };
    function stop() {
      const ep = st.ep, fr = st.fr, a = fr.afterimage, first = st.fi === 0 && !st.late;
      st.phase = 'stop'; st.t = 0; st.beat = 'still';
      veil.classList.add('on'); ctx.stage.classList.add('story-stop');
      ctx.hush(true); ctx.hold(true); sfx('stop'); if (ctx.held) ctx.held(true); if (ctx.score) ctx.score({ held: true }); // (the beat is time's: it stops with it)
      if (fr.light && ctx.light) ctx.light(fr.light); // (a Stop that goes back to an hour: the last one, to the blue hour she waited at)
      pulse();
      // (no word over the moment itself: the street held, its sound braked, and for 2.5 s nothing written on it)
      // the view turns through the held street: once round the first time, a quarter turn every time after, so that
      // what hangs in the air is seen to hang (it is the camera moving that shows a moment is held)
      st.orbit = first ? 0.5 : 0.32; later(first ? 4200 : 1500, () => { st.orbit = 0; }); // (the first time, the view turns round you through the held street)
      if (a && !st.ghost) { st.ghost = ctx.figure(a, a.at); st.ghost.face(ctx.player.x, ctx.player.y); }
      // (someone to go to, across the held street: under the flash, where nobody is seen to move, the held crowd stands
      // out of a lane from you to them a little wider than two walking abreast, so that they are seen at the end of it and
      // the dog leads down it. In the first Stop players looked for her for four minutes: she was thirty metres off across
      // the crossing behind a hundred people standing as still as she did)
      if (st.ghost && (a.lines || []).length && ctx.clear) ctx.clear([ctx.player.x, ctx.player.y], [st.ghost.x, st.ghost.y], 1.3);
      if (fr.afterimage2 && !st.ghost2) { st.ghost2 = ctx.figure(fr.afterimage2, fr.afterimage2.at); st.ghost2.face(ctx.player.x, ctx.player.y); }
      // the world holds a breath (the first time, the title falls on it), and then the one thing to do
      // (a Stop in which something moves that should not, fr.stirs: { cast, line, after_s }: one of the living turns to look)
      if (fr.stirs && st.cast[fr.stirs.cast]) later((fr.stirs.after_s || 7) * 1000, () => { if (st.phase !== 'stop' || st.fr !== fr) return; const c = st.cast[fr.stirs.cast]; if (c.face) c.face(ctx.player.x, ctx.player.y); if (fr.stirs.line) ctx.toast(esc(fr.stirs.line)); sfx('ghost'); });
      if (first) later(900, () => title(`${S.title || ''}${ep.no ? ` · Episode ${ep.no}` : ''}`, ep.title || '', 3.0));
      // (the guide's model asked for now, while the view turns: he is seen first close to, and must be there at the cut)
      const gd0 = ep.guide, film = first && gd0 && gd0.meet !== false && ctx.guide && !st.dog && !ctx.reduced;
      if (film) st.dogNext = ctx.guide(gd0);
      later(first ? 4300 : 2500, () => {
        if (st.phase !== 'stop' || st.beat !== 'still') return;
        if (film && st.dogNext) { const d = st.dogNext; st.dogNext = null; return meetGuide(gd0, d, seek); }
        seek();
      });
      const seek = () => {
        if (st.phase !== 'stop') return;
        show(); frames.classList.add('on');
        if (!a || !(a.lines || []).length) return task();
        st.beat = 'seek'; st.from = [ctx.player.x, ctx.player.y];
        // the guide (ep.guide, companion.js): the dog the bronze by the station is of walks in every Stop. He comes to you
        // (from beside his plinth where that is near, else from a few steps off), goes ahead of you to whoever is still
        // moving, waits when you fall behind, and sits by them
        const gd = st.ep.guide;
        if (gd && ctx.guide && !st.dog) {
          const d = ctx.guide(gd);
          if (d) { const nearHome = gd.from && near(gd.from, 70), at = nearHome ? gd.from : [ctx.player.x + 3, ctx.player.y + 2.5]; d.place(at[0], at[1], Math.atan2(ctx.player.y - at[1], ctx.player.x - at[0])); st.dog = d; if (st.fi === 0 && gd.line) later(3200, () => ctx.toast(esc(gd.line))); } // (after the goal has been read, not over it)
        }
        if (st.dog && st.ghost) st.dog.lead([st.ghost.x, st.ghost.y], a.reach_m || 3.2);
        goal(a.seek || 'Someone is still moving. Go to them.');
        aimAt(spot([st.ghost.x, st.ghost.y, st.ghost.z]), true, 'ghost');
        if (st.ghost.glow) st.ghost.glow(true); // (the halation of an old exposure round them, from across the street: game.js storyFigure glow)
        if (!st.hinted) { st.hinted = true; keysHint(true); }
      };
    }
    // The guide's entrance, the first time the world stops (ep.guide, and `meet` on it: from_m, speed, hold_s, lines).
    // Asked for by the owner: the crowd stopped, then the view given to the dog coming slowly, the words with him, and
    // the camera with him all the way to your side, so that he is met as someone who was coming for you, not found as a
    // marker. The view cuts from you to him, low among the held legs a dozen metres off, on his feet and looking at you;
    // it backs away before him as he comes, swings round behind him as he nears you, and holds on the two of you as he
    // sits at your feet and looks up. Then it is eased round to behind you (game.js). His way to you is planned round the
    // people standing still (companion.js), never through them. Space, Enter, Esc or the button end it with him beside
    // you; a player who asked for less motion is not shown it (prefers-reduced-motion), and he comes as he always did.
    function meetGuide(gd, d, done) {
      st.dog = d;
      const M = Object.assign({ from_m: 11, speed: 1.2, hold_s: 3.6 }, gd.meet || {}), pl = ctx.player, P = [pl.x, pl.y, pl.z];
      const home = gd.from && near(gd.from, 70) ? gd.from : [pl.x + Math.sin(pl.h) * 12, pl.y + Math.cos(pl.h) * 12];
      let ux = home[0] - P[0], uy = home[1] - P[1]; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
      // where he is first seen: on the line from his plinth to you, on ground he may stand on, clear of the crowd
      let S = null;
      for (const m of [M.from_m, M.from_m - 2, M.from_m + 2, M.from_m - 4, M.from_m + 4, M.from_m - 6]) { if (m < 4 || m > ul) continue; S = d.free(P[0] + ux * m, P[1] + uy * m, 1.8); if (S) break; }
      if (!S) S = [P[0] + ux * Math.min(M.from_m, ul), P[1] + uy * Math.min(M.from_m, ul)];
      // where he sits: a pace in front of you and a little to one side, so that the two of you are seen together
      const sx = P[0] + ux * 1.05 - uy * 0.4, sy = P[1] + uy * 1.05 + ux * 0.4, side = d.free(sx, sy, 0.6) || [sx, sy];
      // (and nobody of the crowd there: at a kerb thick with the held crowd no place was free, and he sat down inside a woman
      // waiting there for the rest of the Stop. Moved aside at the cut into his film, where it is not seen; issue 65)
      if (ctx.clearRound) ctx.clearRound(side[0], side[1], 1.0);
      const f0 = [P[0] - S[0], P[1] - S[1]], fl = Math.hypot(f0[0], f0[1]) || 1; f0[0] /= fl; f0[1] /= fl;
      pl.h = Math.atan2(S[0] - P[0], S[1] - P[1]); // (you are turned to see him come)
      st.beat = 'guide';
      st.mov = { t: -1, S, side, P, M, f0, n0: [-f0[1], f0[0]], done, cam: null, look: null, fov: 30, sat: 0, said: 0, len: Math.hypot(side[0] - S[0], side[1] - S[1]) };
      movEl.querySelector('p').textContent = ''; movEl.querySelector('p').style.opacity = '0';
      ctx.stage.classList.add('letterbox'); movEl.classList.add('on');
    }
    function movEnd(skipped) {
      const F = st.mov, d = st.dog; if (!F) return;
      st.mov = null; ctx.stage.classList.remove('letterbox'); movEl.classList.remove('on');
      if (d) { if (skipped || d.state !== 'sit') d.place(F.side[0], F.side[1], Math.atan2(F.P[1] - F.side[1], F.P[0] - F.side[0])); d.met(); }
      F.done();
    }
    // each frame of it: where the lens is and what it looks at, eased after where he is (in the map's frame: x, y, height)
    function movTick(dt) {
      const F = st.mov, d = st.dog; if (!F || !d) return;
      if (F.t < 0) { if (!d.ready && F.wait == null) F.wait = 0; if (!d.ready && (F.wait += dt) < 4) return; F.t = 0; d.place(F.S[0], F.S[1], Math.atan2(F.P[1] - F.S[1], F.P[0] - F.S[0]), true); } // (his model in: the film starts on him)
      F.t += dt;
      const t = F.t, M = F.M, P = F.P, head = [P[0], P[1], P[2] + 1.55], gd = st.ep.guide || {};
      const sm = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
      if (t > 1.4 && !F.went) { F.went = true; d.go(F.side, head, M.speed); }
      if (F.went && d.state === 'sit' && !F.sat) F.sat = t;
      // the words, with him: as he is first seen, and as he looks up at you
      const words = L(M.lines || gd.line || []);
      if (t > 0.6 && F.said < 1 && words[0]) { F.said = 1; F.sayAt = t; movSay(words[0]); }
      if (F.sat && t > F.sat + 0.5 && F.said < 2 && words[1]) { F.said = 2; F.sayAt = t; movSay(words[1]); }
      // (the words drawn from the film's own clock, as the overture's are, not by a CSS animation: on a slow machine the
      // story's clock runs slower than the wall's, and the words had come and gone before he took a step)
      if (F.said) { const u = t - F.sayAt, op = sm(u / 0.9) * (F.said < 2 ? 1 - sm((u - 5.4) / 0.9) : 1), q = movEl.querySelector('p'); q.style.opacity = op.toFixed(3); q.style.transform = `translateY(${(6 * (1 - sm(u / 1.2))).toFixed(2)}px)`; }
      if (F.sat && t > F.sat + M.hold_s) return movEnd(false);
      if (t > 40) return movEnd(true); // (he never got there: beside you all the same)
      // how far he has come (0 where he was first seen, 1 at your feet), and the lens's place from it: in front of him and
      // low (between him and you, looking back at him), then round to behind him and up, so that you are in the frame ahead
      const D = [d.x, d.y, d.z], prog = Math.max(0, Math.min(1, 1 - Math.hypot(F.side[0] - D[0], F.side[1] - D[1]) / (F.len || 1)));
      const a = 2.45 * sm((prog - 0.2) / 0.55), r = 4.3 + 0.9 * sm(prog), up = 0.55 + 0.95 * sm((prog - 0.3) / 0.6); // (a third of the frame, his paws in it, and the held street round him)
      const ox = F.f0[0] * Math.cos(a) + F.n0[0] * Math.sin(a), oy = F.f0[1] * Math.cos(a) + F.n0[1] * Math.sin(a);
      const k = sm((prog - 0.35) / 0.5), mid = [(D[0] + P[0]) / 2, (D[1] + P[1]) / 2, P[2] + 0.95];
      const pos = [D[0] + ox * r + F.n0[0] * 0.5 * (1 - k), D[1] + oy * r + F.n0[1] * 0.5 * (1 - k), D[2] + up];
      const look = [D[0] + (mid[0] - D[0]) * k, D[1] + (mid[1] - D[1]) * k, D[2] + 0.6 + (mid[2] - D[2] - 0.6) * k];
      const fov = 32 + 6 * sm(prog);
      if (!F.cam) { F.cam = pos.slice(); F.look = look.slice(); }
      const e = 1 - Math.exp(-dt * 2.6), e2 = 1 - Math.exp(-dt * 4);
      for (let i = 0; i < 3; i++) { F.cam[i] += (pos[i] - F.cam[i]) * e; F.look[i] += (look[i] - F.look[i]) * e2; }
      F.fov += (fov - F.fov) * e;
    }
    // A place to find is the player's to find (fr.find: where the world stops; task.find: where the picture is taken
    // from). Nothing more is shown until they ask: H (a pad's d-pad up, or the button) gives the next of three, each
    // saying more. The first is a word that narrows it; the second sends the dog, who goes to the place and sits there,
    // looking at what the picture is of (the guide is the one sign inside the story, so he is the hint too); the third
    // is the light on it, as every other frame has. A second line on a timer and a light after a minute and a half
    // decided for the player when they were stuck, and gave the place away to one who was about to find it. After
    // NUDGE_S of looking without one the button is offered, once, and pressed for nobody. The last card says which
    // places were found alone (`hints` on the frame or its task: the three lines; else the frame's own second line)
    const NUDGE_S = 30, NUDGE2_S = 75;
    function hunting() {
      const fr = st.fr; if (!fr || st.lit) return null;
      const dogName = (st.ep.guide || {}).name || 'The dog';
      if (st.phase === 'go' && st.beat === 'approach' && fr.find) { const a = fr.stop_at || (fr.afterimage && fr.afterimage.at); return a ? { at: a, lines: fr.hints || [fr.goal2, `${dogName} knows the place. He takes you to it.`, 'A ring, where he stood.'], go: true } : null; }
      const T = fr.task;
      if (st.phase === 'stop' && st.beat === 'shoot' && T && T.find && T.stand && !framed().placed) return { at: T.stand, look: subjectOf(T), lines: T.hints || [(T.goals || {}).find2, `${dogName} knows the place. He goes to it and sits there.`, 'A light, where it was taken from.'] };
      if (st.phase === 'stop' && st.beat === 'shoot' && T && T.hint_at && T.hints && !st.ready && !st.meet) return { at: T.hint_at, look: null, lines: T.hints, only: true }; // (not once they walk: the place is found)
      return null;
    }
    function huntFresh() { st.hint = 0; st.hintText = ''; st.nudged = false; hintBtn.classList.remove('glow', 'nudge'); st.hk = null; st.hintLight = null; }
    // The offer is made twice, and the button keeps its glow until a hint is asked for: the first time it was a line for
    // 2.6 s and three pulses, and a player on the frame 4 glass did not see either and thought there was no way on.
    function nudge() {
      if (st.hint || st.mov) return;
      const n = st.nudged || 0, due = n === 0 ? st.findT > NUDGE_S : n === 1 && st.findT > NUDGE2_S;
      if (!due) return;
      st.nudged = n + 1; say(ctx.touch && !(ctx.padOn && ctx.padOn()) ? 'Stuck? Tap the hint button' : `Stuck? Press ${K('H')} for a hint`);
      hintBtn.classList.add('glow'); hintBtn.classList.remove('nudge'); void hintBtn.offsetWidth; hintBtn.classList.add('nudge');
    }
    function hint() {
      const H = hunting(); if (!H || st.hint >= 3) return;
      hintBtn.classList.remove('glow', 'nudge');
      const n = ++st.hint, text = H.lines[n - 1] || '';
      st.helped[st.fi] = Math.max(st.helped[st.fi] || 0, n); keep();
      sfx('goal'); say(`A hint · ${n} of 3`);
      if (n === 1 && text) { st.hintText = text; goal(text); }
      if (n === 2) { // (the dog: to the place, and he sits there; one who has not met him yet is met now)
        const gd = st.ep.guide;
        if (!st.dog && gd && ctx.guide) { const d = ctx.guide(gd); if (d) { d.place(ctx.player.x + 1.2, ctx.player.y + 1.2, 0); if (ctx.clearRound) ctx.clearRound(ctx.player.x + 1.2, ctx.player.y + 1.2, 1.0); d.met(); st.dog = d; } } // (and nobody of the crowd where he is put, issue 65)
        if (H.go) aimAt(spot(H.at), false); // (where the world stops: he leads there, and nothing else shows the way)
        else if (st.dog) st.dog.go([H.at[0], H.at[1]], H.look || null, 3.4);
        if (text) { st.hintText = text; goal(text); }
      }
      if (n === 3) { st.lit = true; if (H.go || H.only) aimAt(spot(H.at), false, H.only ? 'stand' : 'go'); if (H.only) st.hintLight = spot(H.at); if (text) say(text); }
    }
    // The camera taught, the first time it is in the hand (task.teach: { title, steps: [{ is, do, say, key }] }; `is` is
    // stand, raise, frame or shoot). A rule is learnt when the player is told what will happen, does it, and sees it
    // happen at once: so each step says what it does before it is done, the world answers the moment it is (the light
    // under your feet, the other year forming in the lines, the lines going amber, the print), and the card ticks it.
    // The steps are live, not a list that only goes forward: with the camera up off the light, the first is not ticked
    // and the second is, and the finder holds tonight only. A release pressed early shakes the step not yet done.
    const TEACH_IS = { stand: f => f.placed, raise: () => !!st.cam, frame: f => f.placed && f.aimed && f.formed && !!st.cam, shoot: () => st.beat === 'shown' };
    function teach(T) {
      st.teach = T && (T.steps || []).length ? T : null; st.teachK = ''; st.teachHand = KEYS();
      if (!st.teach) { teachEl.classList.remove('on', 'done'); return; }
      const bare = ctx.touch && !(ctx.padOn && ctx.padOn()), keyOf = k => (!k || bare ? '' : `<kbd>${esc(K(k))}</kbd>`);
      teachEl.innerHTML = `<small>${esc(T.title || '')}</small><ol>${T.steps.map((q, i) => `<li data-is="${esc(q.is)}"><b>${i + 1}</b><span>${esc(bare && q.do_touch ? q.do_touch : q.do)}${keyOf(q.key)}</span><p>${esc(bare && q.say_touch ? q.say_touch : q.say || '')}</p></li>`).join('')}</ol>`;
      teachEl.classList.remove('done'); teachEl.classList.add('on');
    }
    function teachTick(f) {
      if (!st.teach) return;
      if (KEYS() !== st.teachHand) { const T = st.teach; teach(T); } // (the keys, or the pad's signs, as the hand changes)
      let now = -1, k = '';
      st.teach.steps.forEach((q, i) => { const done = !!(TEACH_IS[q.is] && TEACH_IS[q.is](f)); if (!done && now < 0) now = i; k += done ? '1' : '0'; });
      k += `|${now}`;
      if (k === st.teachK) return;
      st.teachK = k;
      teachEl.querySelectorAll('li').forEach((e, i) => { const done = k[i] === '1'; if (done && !e.classList.contains('done')) { e.classList.remove('ticked'); void e.offsetWidth; e.classList.add('ticked'); } e.classList.toggle('done', done); e.classList.toggle('now', i === now); });
    }
    function teachNudge() { const e = st.teach && teachEl.querySelector('li.now'); if (e) { e.classList.remove('nudge'); void e.offsetWidth; e.classList.add('nudge'); } }
    function teachDone() { // (the picture taken: the last step ticked, and the card goes a moment later)
      if (!st.teach) return;
      teachEl.querySelectorAll('li').forEach(e => { if (!e.classList.contains('done')) { e.classList.add('done', 'ticked'); } e.classList.remove('now'); });
      st.teach = null; later(1800, () => teachEl.classList.add('done'));
    }
    function movSay(text) { movEl.querySelector('p').textContent = text; if (ctx.log && ctx.log.aside) ctx.log.aside(esc(text)); } // (and in the log of the evening, as what was seen)
    // the photograph: of what, from where
    function task() {
      if (!st.fr.task) { resume(); return; }
      st.beat = 'shoot'; goalText = '';
      st.findT = 0; st.lit = !(st.fr.task.find || st.fr.task.hint_at); st.placedOnce = false; st.wasPlaced = false; st.outAt = null; st.spendT = 0; st.ready = false; st.meet = null; st.meetHold = 0; huntFresh(); // (ready: not the last frame's, which was taken: the first H of the last frame went to nothing) // (find, or a picture found with no standpoint: no light stands for it, until the player asks for one)
      if (st.fr.task.both && ctx.clearRound) for (const g of [st.ghost, st.ghost2]) if (g) ctx.clearRound(g.x, g.y, 3.5); // (each alone on their kerb)
      if (st.fr.task.both && st.fr.task.hint_at && ctx.clear) for (const g of [st.ghost, st.ghost2]) if (g) ctx.clear(st.fr.task.hint_at, [g.x, g.y]); // (the held crowd out of the two ways from the corner the hints lead to: two figures among umbrellas forty metres off were not to be found in the print)
      { const T = st.fr.task, from = T.stand || [ctx.player.x, ctx.player.y]; if (ctx.clear) for (const c of T.clear || []) ctx.clear(from, c); if (T.clear_round && ctx.clearRound && T.relic) ctx.clearRound(T.relic.at[0], T.relic.at[1], T.clear_round); } // (task.clear: the way on past the thing kept clear too, to points beyond it; task.clear_round: a ring round it. Frame 2's stool had a held walker a metre off and the crowd standing on it from behind)
      if (st.fr.task.relic && ctx.relic && !st.relic) st.relic = ctx.relic(Object.assign({ from: st.fr.task.stand }, st.fr.task.relic)); // (what the camera sees here that tonight does not have; from: where it is seen from)
      { const R = st.fr.task.relic; finder.dataset.year = (R ? R.year || 1964 : st.fr.afterimage && st.fr.afterimage.year) || ''; } // (the year the finder shows is the year of what it sees: a thing of 1964 even where the one who asks for it is of 2024) // (the year the finder shows: the camera sees the evening it was loaded for)
      st.cam = false; camLabel(); camBtn.classList.remove('up'); camBtn.classList.add('on');
      teach(st.fr.task.teach);
      // (the guide goes to sit where the picture is taken from, or beside what it is of, looking at it)
      if (st.dog) { const T = st.fr.task, R = T.relic, px = ctx.player.x, py = ctx.player.y; let to = T.stand && !T.find ? [T.stand[0] + 1.2, T.stand[1] + 0.8] : null; if (!to && R && Math.hypot(R.at[0] - px, R.at[1] - py) < 30) { const l = Math.hypot(px - R.at[0], py - R.at[1]) || 1, ux = (px - R.at[0]) / l, uy = (py - R.at[1]) / l, q = [R.at[0] + ux * 1.2 - uy * 2.2, R.at[1] + uy * 1.2 + ux * 2.2]; to = (st.dog.free && st.dog.free(q[0], q[1], 1.5)) || q; } /* (beside it, off the line from the lens: on that line, 2.2 m before the lamp, his head filled the foot of the third print) */ if (to) st.dog.go(to, R ? [R.at[0], R.at[1], (R.at[2] != null ? R.at[2] : ctx.floor(R.at[0], R.at[1])) + 0.8] : T.subject || null); } // (in the hand: the player raises it)
    }
    // the finder's rectangle in the picture, as fractions from its top left
    const finderRect = () => { const f = finder.getBoundingClientRect(), s = ctx.stage.getBoundingClientRect(); return [(f.left - s.left) / s.width, (f.top - s.top) / s.height, (f.right - s.left) / s.width, (f.bottom - s.top) / s.height]; };
    // the print's rectangle in the picture (game.js printRect: the middle of it, three by two), and the finder's lines kept
    // inside it (story.css, --print-x and --print-y): what stands in the lines is what the print has. On a phone held upright
    // the lines were drawn for the screen, twice as tall as the print, and frame 2's shoeshine pitch, framed in their lower
    // half, was ready to be taken and was not in the print
    const printRect = () => (ctx.printRect ? ctx.printRect() : [0, 0, 1, 1]);
    let printAt = '';
    function fitFinder() {
      const P = printRect(), x = `${(P[0] * 100).toFixed(2)}%`, y = `${(P[1] * 100).toFixed(2)}%`;
      if (x + y === printAt) return;
      printAt = x + y; finder.style.setProperty('--print-x', x); finder.style.setProperty('--print-y', y);
    }
    // what the shot is of, as the mark points at it and the frame is judged on it: the relic itself when there is one
    // (a task's own subject point was left standing beside a relic, 21 m off and 14 m up, and the mark sent the player there)
    const subjectOf = T => { const R = T.relic; if (!R) return T.subject || null; const z = R.at[2] != null ? R.at[2] : ctx.floor(R.at[0], R.at[1]); return [R.at[0], R.at[1], z + (R.eye ?? 0.6)]; };
    // where the frame stands: in place, on its subject, and the thing of the other year formed in the lines (formed). Its
    // point inside the bright lines, and nine tenths of it in the print (game.js relic frame: the box round its model, where it
    // stands). Judged by the point alone, at the top of frame 2's box and stool, the release was ready with the box and the
    // stool under the print's edge. One too big for the print (the dome in its tower, the river under the street) is judged
    // by its point. And the release is ready once it has come up in the lines (past.js, 0.8 s), never before: in the place,
    // the camera raised, the lens turned onto it, it forms, and then it is taken
    function framed() {
      const T = st.fr.task, placed = !T.stand || near(T.stand, T.within_m || 4);
      let aimed, formed = true;
      if (!st.cam) aimed = false; // (nothing is framed with the camera down)
      else if (T.relic) {
        const r = finderRect(), P = printRect(), q = ctx.screen(subjectOf(T)), b = st.relic && st.relic.frame ? st.relic.frame() : null;
        const inR = (R, x, y) => x > R[0] && x < R[2] && y > R[1] && y < R[3];
        aimed = q.front && inR(r, q.x, q.y); // (the thing itself, inside the bright lines)
        if (aimed && b && b.front && b.x1 - b.x0 < (P[2] - P[0]) * 0.9 && b.y1 - b.y0 < (P[3] - P[1]) * 0.9) { // (and nine tenths of it in the print: all of it, to a hair, was a lens to be held to a tenth of a degree where it nearly filled the frame)
          const ix = Math.max(0, Math.min(b.x1, P[2]) - Math.max(b.x0, P[0])), iy = Math.max(0, Math.min(b.y1, P[3]) - Math.max(b.y0, P[1]));
          aimed = ix * iy >= 0.9 * (b.x1 - b.x0) * (b.y1 - b.y0);
        }
        formed = !st.relic || !!st.relic.missing || st.relic.k >= 1; // (a model not to be had forms nothing, and is not waited for)
      }
      else if (T.both) { const P = printRect(), mx = (P[2] - P[0]) * 0.06, my = (P[3] - P[1]) * 0.06; aimed = [st.ghost, st.ghost2].every(g => { if (!g) return true; const at = [g.x, g.y, g.z + 1.2], q = ctx.screen(at); return q.front && q.x > P[0] + mx && q.x < P[2] - mx && q.y > P[1] + my && q.y < P[3] - my && q.dist < 60 && (!ctx.seen || ctx.seen(at)); }); } // (in the print, near enough to be told, and in sight: a kiosk between the lens and both of them was taken as the last picture; on the screen of a phone held upright, above and below the print's band, they were not in the print)
      else aimed = !T.subject || ctx.aim(T.subject) <= (T.within_deg || 40);
      return { placed, aimed, formed };
    }
    function shoot(yes) { // (yes === true: the frame is spent, answered on the card that asks)
      if (st.phase !== 'stop' || st.beat !== 'shoot' || (st.spendAsk && yes !== true)) return;
      const fr = st.fr, T = fr.task, G = T.goals || {};
      if (!st.cam) return raise(true); // (the release with the camera down brings it up)
      const f = framed();
      // (a frame taken as they meet, task.meet: the release with both in the frame sets them walking, and while they
      // walk it waits; it is the picture once they have met)
      if (T.meet && st.meet !== 'met') { if (st.meet === 'walk') { goal(G.early || 'Not yet. Wait for them.'); st.miss = 2.5; return; } if (f.placed && f.aimed) return meetBegin(); }
      // A frame taken from the wrong place is spent (the rules of the Stop, 5 and 6): the release pressed a second time
      // within a few seconds asks, once, whether to take the picture as it is (spendAsk: a double tap on a phone spent a
      // clue for good, issue 117); answered yes, it is a print of tonight and nothing under it, and the story goes on
      // without what stood here. Not the first frame, which teaches the camera, nor the last, which is the ending.
      const spare = st.fi > 0 && !T.both && !fr.finale, off = !f.placed || !f.aimed, spend = off && spare && yes === true;
      if (off && spare && !spend && st.spendT > 0) return spendAsk();
      if (off && !spend) { teachNudge(); goal(`${!f.placed ? (T.find && !st.lit ? 'Not from here. ' + (G.find || 'Find the place.') : G.stand || 'Not from here. Go to the light.') : G.aim || 'Turn towards the light, then take the picture.'}${spare ? ' The release again asks whether to spend the frame as it is.' : ''}`); st.miss = spare ? 5 : 2.5; st.spendT = spare ? 5 : 0; return; }
      if (!off && !f.formed) { teachNudge(); goal(G.forming || 'Hold it there: it is coming up in the lines.'); st.miss = 1.5; return; } // (the release before the thing has come up in the lines: it is waited for, not taken without it)
      // (the frame without the goal's marks on it: the beacon is a guide, not a thing in the street)
      light(null);
      let print = null;
      try { print = ctx.snap({ ghosts: !!T.both, plain: spend }); } catch (e) { print = null; } // (the frame of the two of them: they come up in it as it develops; spent: only tonight in it, whatever was in the lines)
      if (spend) { st.prints.push({ src: print, stamp: fr.stamp || '', cap: 'Only tonight. Nothing of 1964 came up in it.', note: fr.lost ? `Spent. Not on the roll: ${fr.lost}` : 'Spent.', plain: true }); st.flags[`lost${st.fi + 1}`] = true; }
      else st.prints.push({ src: print, stamp: fr.stamp || '', cap: fr.caption || (T.relic && T.relic.cap) || '', note: fr.note || '' }); // (note: what the frame settled, written under it in the roll)
      st.spendT = 0;
      { const p = st.prints[st.prints.length - 1]; filed(`Frame ${st.prints.length}. ${p.note || p.cap}`, { kind: p.plain ? 'spent' : 'print' }); for (const e of fr.file || []) if ((!e.if || st.flags[e.if]) && (!e.not || !st.flags[e.not])) filed(e.say, { key: e.key || '', strikes: e.strikes || '', kind: 'said' }); } // (fr.file: what the frame makes of something the player said before)
      if (spend) later(700, () => say('Spent: only tonight'));
showPrint(st.prints[st.prints.length - 1], st.prints.length, ctx.snapBase ? ctx.snapBase() : null);
      frames.classList.remove('kept'); void frames.offsetWidth; frames.classList.add('kept'); // (the strip says the print is kept, and where the roll is)
      pulse(); sfx('shutter'); sfx('wind');
      st.left = Math.max(0, st.left - 1); show();
      shutter.classList.remove('on'); finder.classList.remove('on'); camBtn.classList.remove('on', 'up'); st.cam = false; aimAt(null); goal(''); if (ctx.here) ctx.here(null);
      teachDone();
      st.beat = 'shown';
      if (fr.finale) return finale();
      // (what the print shows is said, and what the player makes of it is asked: task.ask, task.then; a frame spent has
      // only its `spent` lines)
      later(4600, () => hear(spend ? { lines: T.spent || [] } : { lines: T.lines, ask: T.ask, then: T.then }, who(fr.afterimage || T.voice || {}), () => resume()));
    }
    // seen through: the card says so, and the frame is taken up again from its beginning (the flight or the ride to it
    // is not made twice)
    function failed(F) {
      st.beat = 'failed'; aimAt(null); goal(''); sfx('wrong'); struckBy = new WeakMap(); mixedBy = new WeakMap(); // (taken up again: nothing is struck off, and the answers are laid out afresh)
      failEl.innerHTML = `<div class="card"><small>${esc(st.fr.stamp || '')} · frame ${st.fi + 1}</small><h2>${esc(F.title || 'Seen through')}</h2><p>${esc(F.line || '')}</p><div class="row"><button type="button" class="go">Take it up again${st.fr.stamp ? ` · ${esc(st.fr.stamp)}` : ''}</button></div></div>`;
      failEl.classList.add('on'); st.failed = (st.failed || 0) + 1;
      if (document.exitPointerLock) document.exitPointerLock();
      const b = failEl.querySelector('button'); if (b) b.focus({ preventScroll: true });
    }
    // A frame about to be spent is asked for, once (issue 117): the card names what the frame would be, and the hand is on
    // Keep. The release does nothing while it is up, and Spend takes no press in its first 0.7 s, so that a third tap
    // of a run of taps is not an answer. Escape keeps.
    function spendAsk() {
      st.spendT = 0; st.miss = 0; st.spendAsk = true; st.spendAt = performance.now();
      spendEl.innerHTML = `<div class="card"><small>${esc(st.fr.stamp || '')} · frame ${st.fi + 1} of ${N}</small><h2>Spend this frame?</h2><p>Taken from here it holds only tonight: nothing of 1964 comes up in it, and what this frame was for is lost to the case. There is no eighth frame.</p><div class="row"><button type="button" class="go" data-spend="0">Keep the frame</button><button type="button" data-spend="1">Spend it here</button></div></div>`;
      spendEl.classList.add('on');
      if (document.exitPointerLock) document.exitPointerLock();
      const b = spendEl.querySelector('button'); if (b) b.focus({ preventScroll: true });
    }
    function spendAnswer(yes) {
      if (!st.spendAsk) return;
      st.spendAsk = false; spendEl.classList.remove('on');
      if (yes) shoot(true);
    }
    function retry() {
      failEl.classList.remove('on');
      veil.classList.remove('on'); ctx.stage.classList.remove('story-stop');
      shutter.classList.remove('on'); finder.classList.remove('on'); camBtn.classList.remove('on', 'up'); st.cam = false; keysHint(false); teach(null); if (ctx.here) ctx.here(null);
      ctx.hush(false); ctx.hold(false); st.orbit = 0; if (ctx.score) ctx.score({ held: false }); if (ctx.held) ctx.held(false);
      for (const k of ['ghost', 'ghost2', 'relic']) if (st[k]) { st[k].remove(); st[k] = null; }
      if (ctx.finder) ctx.finder(null);
      st.again = true; st.rode = true; frame(st.fi); st.again = false;
    }
    // The last frame is taken as they meet (task.meet). Once both kerbs are in the frame, every light at the crossing
    // turns to walk, the held crowd steps out of their way under the flash, and the two of them leave their kerbs and
    // walk to the middle. The lens closes on them as they come and the view is brought round to where they will meet;
    // the score's phrase for it, two lines in contrary motion, is set going so that its chord falls as they meet; and only
    // then is the release the picture. Taken of the two kerbs, the print was two small figures at the edges of a wide
    // frame with a held walker large in front of it, and the card under it said *the first photograph they were ever in
    // together* (#35)
    function meetBegin() {
      const T = st.fr.task, M = T.meet || {}, a = st.ghost, b = st.ghost2 || st.ghost;
      if (!a || st.meet) return;
      const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2], me = [ctx.player.x, ctx.player.y];
      st.meet = 'walk'; st.stung = false; st.walk = [];
      // (each to the middle, along the way between their kerbs, so that each faces the other)
      for (const g of [st.ghost, st.ghost2]) if (g) {
        const dx = g.x - mid[0], dy = g.y - mid[1], l = Math.hypot(dx, dy) || 1, to = [mid[0] + dx / l * 0.2, mid[1] + dy / l * 0.2]; // (a walk ends within a quarter metre of where it goes: about a pace apart)
        st.walk.push([g, Math.hypot(to[0] - g.x, to[1] - g.y)]);
        if (ctx.clear) ctx.clear([g.x, g.y], to, 1.3); // (a lane of their own through the held crowd, a body's width each side)
        g.walkTo(to[0], to[1], M.speed || 1.1);
      }
      const d = Math.hypot(mid[0] - me[0], mid[1] - me[1]), ux = (mid[0] - me[0]) / (d || 1), uy = (mid[1] - me[1]) / (d || 1);
      if (ctx.clearRound) ctx.clearRound(mid[0], mid[1], 3.5); // (alone where they meet)
      // (and nobody between the lens and them, from wherever the player found to stand, nor in a lane on behind them,
      // as wide as two of them each side: through a long lens a crowd crossing behind stood at their shoulders, and they
      // were lost in it; cleared wider, the crossing in the picture was empty. The crowd stands either side of them)
      if (ctx.clear) { ctx.clear(me, mid); ctx.clear(mid, [mid[0] + ux * 18, mid[1] + uy * 18], 3.2); }
      // (the dog, who waited too, sits at your side out of the frame and watches them; one still on his way to you from
      // the middle trotted through the long lens's picture as they met, so from further off he is there under the flash)
      if (st.dog) {
        const q = [me[0] + uy * 1.2 - ux * 0.4, me[1] - ux * 1.2 - uy * 0.4], at = (st.dog.free && st.dog.free(q[0], q[1], 1.5)) || q;
        if (Math.hypot(st.dog.x - at[0], st.dog.y - at[1]) > 4) st.dog.place(at[0], at[1], Math.atan2(mid[1] - at[1], mid[0] - at[0]));
        st.dog.go(at, [mid[0], mid[1], ctx.floor(mid[0], mid[1]) + 1]);
      }
      if (ctx.walkIn) ctx.walkIn(0, true); // (every light at the crossing to walk; the cars and the crowd are moved only when time runs on)
      pulse(); sfx('found'); if (M.say) say(M.say);
      // (the lens: from the frame's own to one that is frame_m metres from top to bottom where they meet, so that the
      // two of them stand about a fifth of its height, near its middle; not longer than lens_min degrees)
      st.lens0 = st.lensNow = T.lens || 50;
      st.lens1 = Math.max(M.lens_min || 12, Math.min(st.lens0, 2 * Math.atan((M.frame_m || 9) / 2 / Math.max(1, d)) * 180 / Math.PI));
      st.mid = [mid[0], mid[1], ctx.floor(mid[0], mid[1]) + 0.9]; // (the lens is eased onto them as they come: story.steer, game.js)
    }
    function meetTick(dt, on) {
      const M = st.fr.task.meet || {};
      if (!st.meet) { st.meetHold = on ? st.meetHold + dt : 0; if (st.meetHold > 0.5) meetBegin(); return; } // (framed for half a second: a lens swung past them does not begin it)
      if (st.meet !== 'walk') return;
      const v = M.speed || 1.1, left = Math.max(0, ...st.walk.map(([g]) => (g.to ? Math.hypot(g.to[0] - g.x, g.to[1] - g.y) : 0))), all = Math.max(1, ...st.walk.map(w => w[1]));
      if (!st.stung && left / v <= 5.9) { st.stung = true; sting('meet'); } // (music.js STINGS.meet: its chord 5.9 s in)
      const k = Math.min(1, 1 - left / all);
      st.lensNow = st.lens0 + (st.lens1 - st.lens0) * k * k * (3 - 2 * k);
      if (st.walk.every(([g]) => !g.to)) { st.meet = 'met'; st.lensNow = st.lens1; if (!st.stung) { st.stung = true; sting('meet'); } }
      if (st.cam && ctx.lens) ctx.lens(st.lensNow, true);
    }
    // the last frame taken: the print in the hand, and then time runs on (the words after it, and the living cross)
    function finale() {
      const fr = st.fr;
      later(6800, () => { if (st.phase === 'stop' && st.fr === fr && st.beat === 'shown') resume(); });
    }
    const rings = () => { const P = st.ep && st.ep.prologue; return !!(P && P.after && !st.rang && L(P.lines).length); };
    function resume(late) {
      const fr = st.fr;
      st.phase = 'after'; st.t = 0; st.beat = ''; st.late = !!late;
      veil.classList.remove('on'); ctx.stage.classList.remove('story-stop');
      shutter.classList.remove('on'); finder.classList.remove('on'); camBtn.classList.remove('on', 'up'); st.cam = false; keysHint(false); aimAt(null); goal(''); if (ctx.here) ctx.here(null);
      if (st.teach) teach(null); // (a Stop run out with the camera untaught: the card goes with it, and comes again with the frame)
      ctx.hush(false); ctx.hold(false); st.orbit = 0; if (ctx.score) ctx.score({ held: false });
      if (!late && fr.turn) later(1500, () => sting(fr.turn)); // (the case turned over, or the false solution: under the first line said after)
      say('Time runs again'); sfx('run'); if (ctx.held) ctx.held(false);
      pulse();
      for (const k of ['ghost', 'ghost2', 'relic']) if (st[k]) { st[k].remove(); st[k] = null; }
      if (st.dog) st.dog.heel(); // (the guide stays with you as the world runs on, to lead you to the next frame)
      if (ctx.finder) ctx.finder(null);
      const said = late ? [fr.late || 'The lights changed. Come back to where it stopped, and it will stop again.'] : L(fr.after);
      said.forEach((line, i) => later(1400 + i * 4200, () => ctx.toast(esc(line))));
      st.wait = late ? 7 : st.fi === 0 && rings() ? 1.6 + said.length * 4.2 : 2.2; // (the next goal as soon as time has run on again; what is said after the picture goes on under it)
      if (!late && fr.finale && st.meet && ctx.walkIn) ctx.walkIn(0); // (the lights went to walk in the Stop: now the street crosses on them)
      if (!late && fr.finale && st.cast[fr.crosses]) { const c = st.cast[fr.crosses]; c.walkTo(fr.cross_to[0], fr.cross_to[1], 0.8); } // (and the living cross)
      // the next frame goes by helicopter: it starts up on its pad as this is said, and the way to it is given once all of it
      // has been (a flight shows nothing of the street's words, and they were lost under it)
      { const nx = !late && st.ep.frames[st.fi + 1]; if (nx && nx.flight && nx.flight.board && ctx.board) { ctx.board(null, 'idle'); st.wait = Math.max(st.wait, 1.4 + Math.max(0, said.length - 1) * 4.2 + 1.6); } }
    }
    // what was in the camera all along (the last card's `found`): a card ticket of that year, its face and its back, as
    // things in the hand. {lines: [from, to], small, date, issuer, back: what is pencilled on the back}
    const ticket = t => { const face = (inner, r) => `<svg viewBox="0 0 230 122" style="--r:${r}deg" aria-hidden="true"><defs><pattern id="tk-w" width="14" height="8" patternUnits="userSpaceOnUse"><path d="M0 4 q3.5 -4 7 0 t7 0" fill="none" stroke="#b9a37c" stroke-width="0.7" opacity="0.5"/></pattern></defs>
<rect x="1" y="1" width="228" height="120" rx="2" fill="#e6d7b6"/><rect x="1" y="1" width="228" height="120" rx="2" fill="url(#tk-w)"/>${inner}</svg>`;
      return `<div class="ticket" role="img" aria-label="${esc(t.alt || '')}">${face(`<g fill="#2a2620" font-family="'Shippori Mincho','Hiragino Mincho ProN','Yu Mincho',serif" text-anchor="middle">
<text x="126" y="44" font-size="21" letter-spacing="2">${esc((t.lines || [])[0] || '')}</text><text x="126" y="76" font-size="21" letter-spacing="2">${esc((t.lines || [])[1] || '')}</text>
<text x="126" y="101" font-size="10.5" letter-spacing="3">${esc(t.small || '')}</text><text x="126" y="114" font-size="7.5" letter-spacing="2" opacity="0.75">${esc(t.issuer || '')}</text></g>
<text x="20" y="61" transform="rotate(-90 20 61)" text-anchor="middle" font-family="ui-monospace, monospace" font-size="11" letter-spacing="1.5" fill="#5a2a2a" opacity="0.8">${esc(t.date || '')}</text>`, -4)}
${face(`<text x="115" y="78" text-anchor="middle" transform="rotate(-7 115 61)" font-family="'Klee One','YuKyokasho','Hiragino Maru Gothic ProN','Shippori Mincho',serif" font-size="44" fill="#4a4a4e" opacity="0.72">${esc(t.back || '')}</text>`, 3)}</div>`; };
    // How the case was worked, on the last card in the file's hand: what the player said, and what they took back (struck
    // through); which frames were spent, and what stood there; which of the pairs of prints were never set side by side,
    // by their frame numbers (what they would have said is for going back in to find); and how often they were seen through.
    function worked() {
      const ep = st.ep, li = [];
      for (const e of st.file) if (e.kind === 'said') li.push(`<li class="said${e.struck ? ' struck' : ''}"><b>${esc(e.at)}</b><span>${esc(e.text)}${e.wrong ? '' : e.struck ? ' <em>Taken back.</em>' : ''}</span></li>`);
      st.prints.forEach((p, i) => { if (p.plain) li.push(`<li class="spent"><b>${esc(p.stamp)}</b><span>Frame ${i + 1} spent: only tonight.${ep.frames[i].lost ? ` What stood there: ${esc(ep.frames[i].lost)}.` : ''}</span></li>`); });
      const P = ep.pairs || [], never = P.map(q => pairKey(q.of[0] - 1, q.of[1] - 1)).filter(k => !st.pairs.includes(k));
      if (P.length) li.push(`<li class="pair"><b>${st.pairs.length}/${P.length}</b><span>${never.length ? `Never set side by side: ${never.map(k => `frames ${k.replace('-', ' and ')}`).join('; ')}.` : 'Every pair of prints that argues was set side by side.'}</span></li>`);
      if (st.misses || st.told) li.push(`<li><b>×${st.misses || 0}</b><span>${st.misses ? `Answered her wrongly ${st.misses === 1 ? 'once' : `${st.misses} times`}.` : ''}${st.told ? ` She answered ${st.told === 1 ? 'one question' : `${st.told} questions`} herself.` : ''}</span></li>`);
      if (st.failed) li.push(`<li><b>×${st.failed}</b><span>Seen through ${st.failed === 1 ? 'once' : `${st.failed} times`}, and taken up again.</span></li>`);
      { const found = ep.frames.map((f, i) => (f.find || (f.task && f.task.find) ? i : -1)).filter(i => i >= 0 && st.prints[i]), alone = found.filter(i => !st.helped[i]), helped = found.filter(i => st.helped[i]);
        const L2 = a => a.map(i => i + 1).join(a.length > 2 ? ', ' : ' and ');
        if (found.length) li.push(`<li class="found"><b>${alone.length}/${found.length}</b><span>${alone.length ? `Found alone: frame${alone.length > 1 ? 's' : ''} ${L2(alone)}.` : ''}${helped.length ? ` With a hint: ${helped.map(i => `${i + 1} (${['a word', 'the dog', 'the light'][st.helped[i] - 1]})`).join(', ')}.` : ''}</span></li>`); }
      return li.length ? `<section class="worked" aria-label="How the case was worked"><h3>How the case was worked</h3><ul>${li.join('')}</ul></section>` : '';
    }
    // Going back in: a case closed in this browser keeps its prints and the snapshot of each frame on arriving at it
    // (`oe-story-<ep>-closed`), so that any frame can be entered again with the roll and the flags as they were then, and
    // another answer tried, from the last card or from the title. Entering frame n writes the case as it stood at n and
    // opens the page again (ctx.again); the first frame is the evening from its beginning.
    const CLOSED = id => `oe-story-${id}-closed`;
    const closedOf = id => { try { const c = JSON.parse(localStorage.getItem(CLOSED(id)) || 'null'); return c && Array.isArray(c.prints) && Array.isArray(c.snaps) ? c : null; } catch (e) { return null; } };
    const closedNow = () => (st.ep ? closedOf(st.ep.id) : null);
    function close() { try { localStorage.setItem(CLOSED(st.ep.id), JSON.stringify({ prints: st.prints, snaps: st.snaps, stamps: st.ep.frames.map(f => f.stamp || '') })); } catch (e) { /* storage full: no going back in */ } }
    const goBack = C => (C ? `<nav class="back" aria-label="Go back into a frame"><small>Go back into a frame</small><span>${C.stamps.map((t, i) => (C.snaps[i] || i === 0 ? `<button type="button" data-back="${i}"><b>${i + 1}</b>${esc(t)}</button>` : '')).join('')}</span></nav>` : '');
    enterLater = (i) => enter(i, eps[0]);
    function enter(i, ep = st.ep) {
      const C = closedOf(ep.id), s = C && C.snaps[i], key = `oe-story-${ep.id}`;
      try {
        if (!s || i === 0) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify({ fi: i, left: s.left, prints: C.prints.slice(0, s.n), flags: s.flags, pairs: s.pairs, file: s.file, failed: s.failed, snaps: C.snaps.slice(0, i + 1) }));
      } catch (e) { /* storage blocked */ }
      ctx.again();
    }
    // the last card: the whole roll, what it was, and two ways on
    function end() {
      const ep = st.ep, E = typeof ep.end === 'string' ? { title: ep.end } : ep.end || {};
      st.phase = 'done';
      close(); forget(); sfx('end'); if (ctx.held) ctx.held(false);
      if (st.dog) { const d = st.dog; st.dog = null; d.leave((st.ep.guide || {}).from || [d.x, d.y], () => d.remove()); st.gone = d; } // (the case closed: he goes home)
      frames.classList.remove('on'); goal('');
      const last = st.prints[st.prints.length - 1];
      endEl.innerHTML = `<div class="card">${last && last.src ? `<figure><img alt="The last photograph you took" src="${last.src}"><figcaption><span>Frame ${st.prints.length} of ${N}</span><span>${esc(last.stamp)}</span></figcaption></figure>` : ''}
${st.prints.length > 1 ? `<ol class="sheet">${st.prints.slice(0, -1).map((p, i) => `<li>${p.src ? `<img alt="Frame ${i + 1}" src="${p.src}">` : ''}<span>${i + 1} · ${esc(p.stamp)}</span></li>`).join('')}</ol>` : ''}
<small>${esc(S.title || '')}${ep.no ? ` · Episode ${ep.no}` : ''}</small><h2>${esc(E.title || '')}</h2>
${E.found ? `<div class="found">${ticket(E.found.ticket || {})}<p>${esc(E.found.line || '')}</p></div>` : ''}
${L(E.line).map(l => `<p>${esc(l)}</p>`).join('')}${worked()}${E.last ? `<p class="last">${esc(E.last)}</p>` : ''}${goBack(closedNow())}
<div class="row">${st.prints.some(p => p.src) ? '<button type="button" data-do="sheet">Save the contact sheet</button>' : ''}<button type="button" class="go" data-do="free">${esc(E.free || 'Walk the city')}</button><button type="button" data-do="again">Play it again</button><button type="button" data-credits>Credits</button></div></div>`;
      endEl.classList.add('on');
      if (E.found) later(2400, () => sting('found')); // (as the ticket comes up)
      requestAnimationFrame(() => endEl.classList.add('in'));
      const go = endEl.querySelector('button.go');
      if (go) go.focus({ preventScroll: true });
    }
    endEl.addEventListener('click', e => { const g = e.target.closest('button[data-back]'); if (g) return enter(+g.dataset.back); const b = e.target.closest('button[data-do]'); if (b) (b.dataset.do === 'sheet' ? saveSheet : b.dataset.do === 'again' ? ctx.again : ctx.free)(); });
    shutter.addEventListener('click', shoot);
    failEl.addEventListener('click', e => { if (e.target.closest('button')) retry(); });
    spendEl.addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('button[data-spend]'); if (b && (b.dataset.spend === '0' || performance.now() - st.spendAt > 700)) spendAnswer(b.dataset.spend === '1'); });
    frames.type = 'button'; frames.addEventListener('click', () => albumOpen(true));
    const onKey = e => {
      if (st.spendAsk) { // (the card that asks before a frame is spent: the release is not an answer; Escape keeps; the arrows go between its two)
        if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); spendAnswer(false); }
        else if (e.code === 'KeyF' || e.code === 'KeyR' || e.code === 'KeyH' || e.code === 'Tab') { e.preventDefault(); e.stopPropagation(); }
        else if (/^Arrow/.test(e.code)) { e.preventDefault(); e.stopPropagation(); const B = [...spendEl.querySelectorAll('button')], i = B.indexOf(document.activeElement); if (B.length) B[(i + 1) % B.length].focus({ preventScroll: true }); }
        return;
      }
      if (e.code === 'KeyF' && !e.repeat && st.beat === 'shoot') { e.preventDefault(); e.stopPropagation(); shoot(); }
      else if (e.code === 'KeyR' && !e.repeat && st.phase === 'stop' && st.beat === 'shoot') { e.preventDefault(); e.stopPropagation(); raise(!st.cam); }
      else if (e.code === 'KeyH' && !e.repeat && hunting()) { e.preventDefault(); e.stopPropagation(); hint(); }
      else if ((e.code === 'Tab' || (e.code === 'Escape' && album.classList.contains('on'))) && !e.repeat && st.phase !== 'idle' && st.phase !== 'dressed' && st.phase !== 'done') { e.preventDefault(); e.stopPropagation(); albumOpen(!album.classList.contains('on')); }
    };
    addEventListener('keydown', onKey, true);

    // (the line under a waited-on question's answers: how much of the wait is left, 0..1; null: none)
    function timed(left) { const C = document.getElementById('gd-choices'); if (!C) return; C.classList.toggle('timed', left != null); if (left != null) C.style.setProperty('--left', left.toFixed(3)); }
    function waitTick(dt) {
      const W = st.waitQ; if (!W) return;
      if (!(ctx.asking && ctx.asking())) return timed(null); // (the question still being typed: the wait has not begun)
      const held = album.classList.contains('on') || !!document.querySelector('#g-story-log.on'); // (the menu: the story is not ticked under it)
      if (!held) W.left -= dt;
      timed(Math.max(0, W.left / W.all));
      if (W.left <= 0) { st.waitQ = null; st.silenced = true; timed(null); if (ctx.unask) ctx.unask(); }
    }
    function tick(dt) {
      const ep = st.ep, fr = st.fr;
      if (st.gone) { st.gone.tick(dt); if (st.gone.state === 'away') st.gone = null; } // (a guide on his way off)
      // (the case closed and the street walked on, release(): tonight's people go once the lens no longer has them, never in view)
      if (st.released) for (const id in st.cast) { const f = st.cast[id], v = ctx.screen([f.x, f.y, (f.z || 0) + 1]); if (!v.front || v.x < -0.15 || v.x > 1.15 || v.y < -0.15 || v.y > 1.15 || v.dist > 80) { f.remove(); delete st.cast[id]; } }
      if (st.dog && st.phase !== 'idle' && st.phase !== 'dressed') st.dog.tick(dt); // (his own time: he moves in a Stop, and between them)
      // (the case closed: time runs, and tonight's people go on living under the last card and on the street walked on
      // after it. They were animated only further down, past the return below, so whoever was crossing as the card
      // came up stood held in mid-step, and was found so by a player who chose to walk on)
      if (st.phase === 'done') for (const id in st.cast) st.cast[id].animate(dt);
      if (!ep || !fr || st.phase === 'idle' || st.phase === 'dressed' || st.phase === 'done') return;
      waitTick(dt);
      if (keys.classList.contains('on') && KEYS() !== keysAre) keysHint(true); // (the keys, or the pad's sticks, as the hand changes)
      { // under the goal, how: one plain line for whoever has not played a game like this (and the first frame says the keys)
        const f = st.beat === 'shoot' && fr.task ? framed() : null;
        const dogN = st.dog ? (st.ep.guide || {}).name || 'the dog' : '', how = !goalText ? '' : st.beat === 'meet' ? (dogN ? `Follow ${dogN}: he takes you to them. They speak when you are close.` : 'Walk up to them: they speak when you are close.') : st.beat === 'approach' ? (fr.find && !st.lit ? `No ring stands there this time. The roll has the place: ${ctx.touch ? 'tap it' : K('Tab')}.` : dogN ? `Follow ${dogN}.` : 'Follow the ring.') : st.beat === 'seek' ? `${st.dog ? `Follow ${(st.ep.guide || {}).name || 'the dog'}: he goes ahead to the pale figure.` : 'Walk to the ring: the pale figure.'}`
          : st.beat === 'ride' ? (st.inCar ? ((ctx.rideNow() || {}).arrived ? `You are there. ${ctx.touch ? 'Tap Get out.' : `Press ${K('E')} to get out.`}` : `${ctx.touch ? 'Tap Skip' : `Press ${K('F')}`} to be there now.`) : `Walk to the car and ${ctx.touch ? 'tap Get in' : `press ${K('E')}`} to get in. Or walk the whole way.`)
          : st.beat === 'board' ? `${dogN ? `Follow ${dogN} to it, and` : 'Walk to it and'} ${ctx.touch ? 'tap Get in' : `press ${K('E')}`} beside it.` : f ? (!f.placed ? (fr.task.find && !st.lit ? 'Raise the camera: the two halves of the line in the middle of the finder come together as you come to the place.' : 'Stand in the light on the ground.') : !st.cam ? 'The camera is in your hand. With it up you see what it sees.' : !f.aimed ? (fr.task.relic ? 'Look through the frame lines: something stands there that tonight does not have. While it is outside them, the arrow on their edge points to it.' : 'Turn until it is inside the frame lines.') : ctx.touch && !(ctx.padOn && ctx.padOn()) ? 'Tap the shutter.' : `Press ${K('F')}, or click the shutter.`) : '';
        if (how !== st.how) { st.how = how; goalEl.querySelector('em').textContent = how; }
        const hk = hunting() && st.hint < 3 && !st.mov ? `${st.hint ? 'Another hint' : 'A hint'}<i>${'●'.repeat(st.hint)}${'○'.repeat(3 - st.hint)}</i>${ctx.touch && !(ctx.padOn && ctx.padOn()) ? '' : `<kbd>${K('H')}</kbd>`}` : '';
        if (hk !== st.hk) { st.hk = hk; hintBtn.innerHTML = hk; hintBtn.classList.toggle('on', !!hk); }
      }
      if (st.phase === 'go' && st.beat === 'ride') { // the car: its mark on it as it comes and waits; gone from the frame while you ride; on when you are out, or have walked there
        const r = ctx.rideNow(), R = fr.ride, there = near(R.to, 45);
        if (r && r.state !== 'in') { if (!st.target || Math.hypot(st.target[0] - r.at[0], st.target[1] - r.at[1]) > 1.5) aimAt(spot(r.at)); const text = r.state === 'coming' ? R.line || 'A car is coming for you.' : R.board || 'Your car is here. Get in.'; if (text !== goalText) goal(text); st.inCar = false; }
        else if (r) { if (!st.inCar) { st.inCar = true; aimAt(null); goal(R.riding || ''); if (ctx.score) ctx.score({ mode: 'ride' }); } }
        if (!r || (there && (!r || r.state !== 'in'))) { if (r && ctx.rideOff) ctx.rideOff(); st.inCar = false; aimAt(null); goal(''); const f = st.rideGo; st.rideGo = null; f(); }
      }
      st.t += dt;
      // time is not cut, it is braked: the world slows to nothing over most of a second, and runs up again faster
      st.k = st.phase === 'stop' ? Math.max(0, st.k - dt / 0.95) : Math.min(1, st.k + dt / 0.6);
      for (const id in st.cast) st.cast[id].animate(dt * st.k * st.k); // (the living slow and hold with the world)
      st.soft = (st.soft || 0) + ((st.phase === 'stop' && st.beat === 'still' ? 1 : 0) - (st.soft || 0)) * Math.min(1, dt * (st.beat === 'still' ? 2.2 : 1.1));
      if (st.phase === 'go') {
        goalEl.querySelector('small').textContent = `${S.title || ''} · Frame ${st.fi + 1} of ${N}`;
        if (st.beat === 'meet') {
          const m = living(fr.meet);
          if (!m) approach();
          else if (near([m.x, m.y, m.z], fr.meet.reach_m || 3) && m.ready !== false) { // (not to someone still to come: ctx.person)
            st.beat = 'talk'; aimAt(null); goal('');
            if (fr.rain_on === 'meet' && fr.weather === 'rain') rain(0.3); // (her first word, and the first drops)
            if (m.face) m.face(ctx.player.x, ctx.player.y);
            const w = { name: m.name || '', role: [m.age ? `${m.age}` : '', m.role || ''].filter(Boolean).join(' · '), alive: true, voice: voiceOf(Object.assign({}, m, { voice: m.voice || fr.meet.voice })) }; // (the living: their age tonight)
            hear(fr.meet, w, () => approach());
          }
        } else if (st.beat === 'approach') {
          const a = fr.afterimage, at = fr.stop_at || (a && a.at);
          if (!st.lit && at) { st.findT += dt; nudge(); }
          if (fr.lead_s != null && !st.late ? st.t >= fr.lead_s : !at || (near(at, fr.stop_r || 12) && st.t > (st.late ? 6 : 0.5))) stop();
        }
        markTick(dt);
      } else if (st.phase === 'stop') {
        const g = st.ghost, a = fr.afterimage, leftS = Math.max(0, (fr.stop_s || 420) - st.t);
        goalEl.querySelector('small').textContent = st.meet ? S.title || '' : `The Stop · ${clockOf(leftS)} left`;
        // (an afterimage looks at whoever carries the camera; the last frame's two, once they walk, at each other)
        for (const q of [g, st.ghost2]) if (q) { q.animate(dt); const o = st.meet && (q === g ? st.ghost2 : g); if (!q.to) { if (o) q.face(o.x, o.y); else q.face(ctx.player.x, ctx.player.y); } }
        if (st.beat === 'seek') {
          // the keys are put away once they have been used
          if (st.from && Math.hypot(ctx.player.x - st.from[0], ctx.player.y - st.from[1]) > 3) { st.from = null; keysHint(false); }
          if (g && near([g.x, g.y, g.z], a.reach_m || 3.2)) {
            st.beat = 'talk'; keysHint(false); aimAt(null); goal(''); if (g.glow) g.glow(false);
            sfx('ghost'); hear(a, who(a), () => task());
          }
        }
        if (st.beat === 'guide') movTick(dt);
        // (the finder's lines, and whether the lens stands where the other year was seen from: off it, nothing of that year forms)
        if (st.beat === 'shoot') fitFinder(); // (a phone turned, a window resized: the lines kept inside the print)
        const inPlace = st.beat !== 'shoot' || !fr.task || framed().placed;
        if (ctx.finder) ctx.finder(st.beat === 'shoot' && st.cam ? finderRect() : null, inPlace);
        if (st.beat === 'shoot') { if (inPlace) delete finder.dataset.off; else finder.dataset.off = ''; }
        if (st.beat === 'shoot') { // the goal says where to stand, then when the lens is on it, and the button shows it
          const T = fr.task, G = T.goals || {}, f = framed(), on = f.placed && f.aimed;
          // (a frame whose place the player finds, task.find: the goal says what is known of it, a second line after
          // half a minute says more, and after find_s the light stands there after all, so nobody is left looking; the
          // patch in the middle of the finder warms as the place comes near, the way a rangefinder's comes into register)
          const hunt = !!T.find && !st.lit && !f.placed;
          if (hunt || (T.hint_at && !on && !st.lit && !st.meet)) { st.findT += dt; nudge(); }
          // (the last frame, taken as they meet: both framed begins it, and then it is the picture only once they have met)
          if (T.meet) meetTick(dt, on);
          const shot = on && f.formed && (!T.meet || st.meet === 'met'); // (and the thing of the other year has come up in the lines)
          // (and it reads at every distance, not only the last nine metres: a split-image rangefinder's line through the
          // patch, its two halves as far apart as the place is far off, closing as you come to it and one line on it; a
          // patch that only warmed within 9 m said nothing to a player 44 m off, and nothing about which way was nearer)
          // (every frame with a place, lit or found: the first frame's light teaches the line that the later frames are found by)
          if (T.stand) {
            const w = T.within_m || 4, d = Math.hypot(T.stand[0] - ctx.player.x, T.stand[1] - ctx.player.y), fix = f.placed ? 'on' : d < Math.max(w * 3, 14) ? 'near' : 'far'; // (nearer within a stone's throw: from the wrong blossom of four, the right one is twelve metres off)
            const split = f.placed ? 0 : 30 * (1 - Math.exp(-Math.max(0, d - w) / 14));
            finder.style.setProperty('--split', split.toFixed(1));
            if (finder.dataset.fix !== fix) { finder.dataset.fix = fix; finder.querySelector('.rf small').textContent = fix === 'on' ? 'The place · here' : fix === 'near' ? 'The place · nearer' : 'The place · far'; }
            if (f.placed && !st.placedOnce) { st.placedOnce = true; if (!st.lit) { sfx('found'); say('This is the place'); } }
            // (stepping into the light: said, and heard, each time it is come into after a while out of it)
            if (f.placed !== st.wasPlaced) { if (f.placed && st.lit && st.t - (st.outAt ?? -9) > 2) { sfx('goal'); say('In the light'); } if (!f.placed) st.outAt = st.t; st.wasPlaced = f.placed; }
            if (ctx.here) ctx.here(f.placed ? spot(T.stand) : null, w);
          }
          else if (finder.dataset.fix) delete finder.dataset.fix;
          teachTick(f);
          const standGoal = hunt ? (st.hintText || G.find || 'No light stands where this one was taken from. Find the place.') : G.stand || 'Find where this was taken from.';
          const raiseText = G.raise || `Raise the camera${ctx.touch && !(ctx.padOn && ctx.padOn()) ? '.' : `: ${K('R')}.`}`;
          const text = st.meet === 'walk' ? G.wait || 'Wait.' : st.meet === 'met' ? (!st.cam ? raiseText : shot ? G.ready || 'Now.' : G.aim || 'Turn back to them.')
            : !st.cam ? (!f.placed ? standGoal : T.both && T.hint_at && !st.ready && G.shoot ? G.shoot : raiseText) : !f.placed ? standGoal : on ? G.ready || 'That is it. Take the picture.' : G.shoot || 'Raise the camera and take the picture.';
          if (text !== goalText && !st.miss) goal(text);
          if (st.miss) st.miss = Math.max(0, st.miss - dt);
          if (st.spendT > 0) st.spendT = Math.max(0, st.spendT - dt);
          if (st.spendAsk && (st.phase !== 'stop' || st.beat !== 'shoot')) spendAnswer(false); // (the frame went on without an answer: the card goes with it)
          const S0 = subjectOf(T), lightAt = st.hintLight && !near(st.hintLight, 3) ? st.hintLight : null, want = hunt || st.meet ? null : lightAt || (!f.placed ? spot(T.stand) : S0 ? [S0[0], S0[1], S0[2], S0[2]] : null); // (once they walk, the place was found: no light stands in the street)
          if (String(want) !== String(st.target)) aimAt(want, false, lightAt || !f.placed ? 'stand' : 'frame');
          if (shot && !st.ready && !T.meet) { sfx('found'); if (T.relic && T.relic.name) say(`In the frame · ${T.relic.name}`); } // (it is in the frame: glass, and its name; as they meet, the score's chord says it)
          st.ready = shot; finder.classList.toggle('ready', shot);
          shutter.classList.toggle('ready', shot);
        }
        markTick(dt);
        if (leftS <= 0 && !st.meet && (st.beat === 'seek' || st.beat === 'shoot' || st.beat === 'still')) resume(true); // (not while they walk to each other, nor once they have met)
      } else if (st.phase === 'after' && st.t > st.wait) {
        if (st.late) { st.phase = 'go'; approach(); }
        else if (st.fi === 0 && rings()) { // the office rings, now that time runs again: who you are, why this kerb, and the one odd thing about the job
          const P = ep.prologue; st.rang = true; st.phase = 'go'; st.beat = 'prologue'; goal('');
          ctx.say(Object.assign({ alive: true, auto: true, voice: Object.assign({ pitch: 150 }, P.voice || {}) }, P.who || {}), L(P.lines), () => frame(1));
        }
        else if (st.fi + 1 < ep.frames.length) frame(st.fi + 1);
        else end();
      }
    }
    return {
      dress, begin, tick, shoot, raise, spendAnswer, state: st,
      get stopped() { return st.phase === 'stop'; },
      get guided() { return !!st.guided; }, // the dog shows the way, and nothing else does: the game draws no gold line
      // the story's own film (the guide coming to you, meetGuide): the lens's place, what it looks at (the map's x, y and
      // height) and its angle, while it plays; and its end, at once, with him beside you
      get film() { const F = st.mov; return F && F.cam ? { pos: F.cam, look: F.look, fov: F.fov } : null; },
      skipFilm() { if (st.mov && st.mov.t > 1.2) movEnd(true); },
      get scale() { return st.phase === 'idle' || st.phase === 'dressed' || st.phase === 'done' ? 1 : st.k * st.k; }, // how much time the world is given: 1 running, 0 held
      get orbit() { return st.orbit; },
      // the lens at the Stop: it pushes in as time brakes and lets go as it runs (degrees off the field of view), and
      // for the wordless first moments the street behind goes soft round you (0..1, the depth of field's weight)
      get push() { return st.phase === 'stop' || st.phase === 'after' ? -6 * (1 - st.k) : 0; },
      get soft() { return st.soft > 0.02 ? st.soft : 0; },
      // the camera's own view: while it is raised; and through the last frame's ending (the two of them meeting, and the
      // words after), which is watched from where the picture was taken, not from a camera behind you that has a wall in it
      get subject() { // what the frame is of, where the raised camera comes up onto: the middle of the thing and all that stands with it, at its point's height (not one too big for the print: the dome in its tower, the river)
        if (!(st.phase === 'stop' && st.beat === 'shoot' && st.cam && st.fr)) return null;
        const T = st.fr.task, S = subjectOf(T), m = S && T.relic && !T.relic.over && st.relic && st.relic.middle ? st.relic.middle() : null;
        return m ? [m[0], m[1], S[2]] : S;
      },
      get span() { const T = st.fr && st.fr.task, m = T && T.relic && !T.relic.over && st.relic && st.relic.middle ? st.relic.middle() : null; return m ? [m[2], m[3]] : null; }, // (the heights of the thing's foot and top: the raised camera tilts so that all of it is in the print, where it fits)
      // (where the lens is eased onto while it is up: the middle of the crossing as the last frame's two walk to it, so that
      // the lens closing on them does not close on the road beside them)
      get steer() { return st.phase === 'stop' && st.meet === 'walk' && st.cam && st.mid ? st.mid : null; },
      get finder() { return (st.phase === 'stop' && ((st.beat === 'shoot' && !!st.cam) || (st.beat === 'shown' && !!(st.fr && st.fr.finale)))) || (st.phase === 'after' && !!(st.fr && st.fr.finale)); }, // the camera is raised: the game shows the lens's view
      get hold() { const T = st.fr && st.fr.task; return (st.phase === 'stop' && st.beat === 'shoot' && T && T.hold) || null; }, // (where a frame's camera is held: [forward, up] from the eye, metres)
      get on() { return st.phase !== 'idle' && st.phase !== 'done'; },
      // the last card's Walk, taken up where the case ended (game.js walkOnFromStory): the card goes, and so does the
      // evening's cast, each once out of the frame (tick); the dog is already on his way home
      // (the walk from the title: the street as tonight has it, with the set dressing the story puts up, and no case)
      dressSet() { setDress(st.ep || eps[0]); }, // (not dress(): that sets the story's own hour and sky over the walk's)
      get setUp() { return Object.keys(st).filter(k => /^set\d+$/.test(k) && st[k]).length; }, // (how many pieces of it are up: tools/walk_play.js)
      release() {
        if (st.phase !== 'done') return false;
        st.released = true; endEl.classList.remove('in'); later(1200, () => endEl.classList.remove('on')); ctx.beacon(null); // (the card fades off the street, as it came on) if (ctx.board) ctx.board(null);
        if (document.activeElement && endEl.contains(document.activeElement)) document.activeElement.blur();
        return true;
      },
      dispose() {
        timers.forEach(clearTimeout); removeEventListener('keydown', onKey, true); ctx.beacon(null); if (ctx.board) ctx.board(null);
        ctx.stage.classList.remove('story', 'story-on', 'story-stop');
        for (const e of [frames, card, veil, flash, goalEl, mark, keys, finder, shutter, endEl, album, printEl, camBtn, chip, pre, failEl, slip, movEl, hintBtn, menuBtn, spendEl]) e.remove();
        if (st.dogNext) st.dogNext.remove();
        for (const k of ['ghost', 'ghost2']) if (st[k]) st[k].remove();
        for (const id in st.cast) st.cast[id].remove();
      },
    };
  }
  return { create };
})();
