// quests.js: a part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").
// `g` is the rest of the game, by name. What this part asks of it:
//   $, A, G, H, MONTHS, S, centroid, clock, colonies, dayLimits, dlg, fill, fmtMin, guide, heli, inPlace, life, nav,
//   npcById, placeByName, player, rail, renderPassport, said, save, setClock, smalltalk, srnd, story, sun, sunState,
//   touch, weather, wharfById
// and what it gives back:
//   LINES, Q, checkSteps, completeQuest, completeStep, cycleTrack, gaitChip, goals, ls, objective, openLines, qs,
//   quest, renderLines, sideObjectives, step, stepOf, talkTo, trackNear, tracked, wantsTalk
'use strict';
window.OEGameQuests = function (g) {
  // ------------------------------------------------------------ quests, in parallel lines
  // The lines, what is done of them and the rules a step is met by are goals.js (OEGoals), which knows no
  // city and draws nothing; here is what the game shows when they move on, and where each step leads.
  const goals = OEGoals.create(g.G, {
    when: () => `${g.clock.d} ${g.MONTHS[g.clock.m - 1]} ${g.fmtMin(g.clock.min)}`,
    save: () => g.save(),
    next: s => g.H.toast(`<b>Next:</b> ${g.said(s.text)}`),
    begun: q => g.H.toast(`<b>${q.title}</b><span>${g.said(q.steps[0].text)}</span>`),
    done: (q, l, opened) => {
      g.A.chime(); g.A.thump();
      g.H.stamp(q.stamp, q.title);
      if (g.life) { g.life.note(`Stamp: ${q.stamp}`, 'stamp'); g.life.emit('stamp', { id: q.id, stamp: q.stamp }); }
      for (const x of opened) if (x.on_open) setTimeout(() => g.H.toast(x.on_open), 2600);
      g.renderPassport();
    },
    met: s => { if (s.type === 'sun' && g.life) g.life.emit('sun', { place: s.place }); },
    tracking: (l, asked) => { g.guide.key = ''; if (asked) g.H.toast(`Tracking <b>${l.title || questOf(l).title}</b>`); },
  });
  const { Q, LINES, qs, ls, lineById, lineDone, lineOpen, openLines, tracked, questOf, stepOf, quest, step, completeStep, completeQuest, startQuest } = goals;
  function objective(l = tracked()) {
    const q = questOf(l);
    if (!q) return null;
    if (!ls(l).started) { const n = g.npcById(q.giver); return { text: `Talk to ${n.name} (${n.role})`, at: [n.x, n.y], title: q.title, line: l }; }
    const s = stepOf(l);
    if (!s) return null;
    const out = { text: g.said(s.text), title: q.title, line: l };
    if (s.type === 'talk') { const n = g.npcById(s.npc); out.at = [n.x, n.y]; }
    else if (s.type === 'spot') { const sp = (g.G.spots || []).find(q => q.id === s.spot); if (sp) out.at = sp.at.slice(0, 2); }
    else if (s.type === 'ride') { const w = g.wharfById(g.player.mode === 'ferry' ? s.to : s.from); out.at = w.landing; }
    else if (s.type === 'rail' && g.rail) { const st = g.rail.stations.find(o => o.id === (g.player.mode === 'rail' ? s.to : s.from)); if (st) out.at = [st.x, st.y]; }
    else if (s.type === 'surface' || s.type === 'under_bridge') { const st = g.nav.strips.find(x => x.name === (s.surface || x.name)); if (st) out.at = st.origin.slice(); }
    else if (s.type === 'land' || s.type === 'sun' || (s.type === 'visit' && s.place)) { const pl = g.placeByName(s.place); if (pl) out.at = g.centroid(pl); }
    else if (s.type === 'visit' || s.type === 'penguins') out.at = s.at || (g.colonies[0] && g.colonies[0].colony.viewing[0]);
    if (s.type === 'visit' && s.after_dark && g.sun.altitude >= -0.5) out.text += ` (after dark: sunset is ${g.fmtMin(g.dayLimits().sunset)})`;
    if (s.type === 'penguins') { const n = g.colonies.reduce((a, c) => a + c.near(g.player.x, g.player.y, s.radius || 40), 0); out.text += ` (${n} ashore near you)`; }
    if (s.type === 'inspect' || s.type === 'gable') out.text += ` (${ls(l).inspected.length}/${(s.sources || s.kinds).length})`;
    return out;
  }
  function talkTo(n) {
    n.talking = true;
    const finish = () => { n.talking = false; };
    const given = goals.talked(n.id); // a line waiting to talk to this person moves on, and may hand over its next quest
    if (given) return giveQuest(n, given.line, given.quest);
    if (g.life && g.life.talk(n)) return; // someone you are getting to know, when they are free (bonds.js)
    g.dlg.show(n, [g.said(n.idle[Math.floor(g.srnd() * n.idle.length)]) || g.smalltalk(n.x, n.y)], null, finish);
  }
  function giveQuest(n, l, q) {
    const talk = q.talk.map(g.said).filter(Boolean);
    g.dlg.show(n, talk.length ? talk : q.talk.map(g.fill), q.choices, c => {
      n.talking = false;
      if (c && c.action === 'set_time') { const [m, d] = c.date; g.setClock(g.clock.y, m, d, g.S.hm(c.time)); g.H.toast(`Time set to ${c.time}, ${d} ${g.MONTHS[m - 1]}`); }
      if (c && c.action === 'set_weather' && g.weather) {
        if (c.date || c.time) { const [m, d] = c.date || [g.clock.m, g.clock.d]; g.setClock(g.clock.y, m, d, c.time ? g.S.hm(c.time) : g.clock.min); }
        g.weather.set(c.weather || 'rain');
        g.H.toast(`${OEWeather.NAMES[c.weather || 'rain']}${c.time ? ` at ${c.time}` : ''}${c.date ? `, ${c.date[1]} ${g.MONTHS[c.date[0] - 1]}` : ''}. Change it in the menu${g.touch ? '' : ' (Esc)'}.`);
      }
      if (c && c.action === 'dusk') { const t = Math.round(g.dayLimits().sunset) - 10; g.setClock(g.clock.y, g.clock.m, g.clock.d, t); g.H.toast(`Time set to ${g.fmtMin(t)}, ten minutes before sunset`); }
      startQuest(l, q);
      if (c && c.action === 'track' && lineById(c.line)) { qs.track = c.line; g.save(); } // the prologue lets you pick where to start
    });
  }
  // arriving at a district: track the open line whose next quest is given by someone standing there (#359: Haru at
  // Sangenjaya), not the map's first line, whose giver may be across the map
  function trackNear(at, within = 250) { if (goals.trackNear(at, id => { const n = g.npcById(id); return n ? [n.x, n.y] : null; }, within)) g.guide.key = ''; }
  const cycleTrack = id => goals.cycle(id); // track the next open line (T, or a tap on its name in the quest card)
  // the gait on foot, shown beside the sun chip with its keys (hidden off foot)
  let gaitShown = '', gaitRest = 0;
  function gaitChip(g_) {
    const el = g.$('#g-gait');
    if (!el) return;
    const want = g.player.mode === 'foot' ? g_ : '';
    if (want === gaitShown) return;
    gaitShown = want;
    el.hidden = !want;
    if (!want) return;
    el.dataset.g = want;
    // said when it changes, then out of the way: a HUD holds what is read at a glance, not its key list
    el.classList.remove('rest'); clearTimeout(gaitRest); gaitRest = setTimeout(() => el.classList.add('rest'), 4000);
    el.innerHTML = g.touch ? `<b>${{ walk: 'Walking', run: 'Running', sprint: 'Sprinting' }[want]}</b>`
      : `<b>${{ walk: 'Walking', run: 'Running', sprint: 'Sprinting' }[want]}</b><span><kbd>X</kbd> ${want === 'walk' ? 'run' : 'walk'} · <kbd>Shift</kbd> sprint</span>`;
  }
  // the world as the goals' rules read it (goals.js met)
  const goalWorld = {
    get mode() { return g.player.mode; }, get x() { return g.player.x; }, get y() { return g.player.y; }, get floor() { return g.player.floor; },
    get sunState() { return g.sunState; }, get sunAlt() { return g.sun.altitude; }, clock: g.clock,
    get landed() { return g.heli.st.landed ? [g.heli.st.x, g.heli.st.y] : null; },
    stripU: name => g.nav.stripUV(g.nav.strips.find(x => x.name === name), g.player.x, g.player.y)[0],
    inPlace: (name, x, y) => g.inPlace(g.placeByName(name), x, y),
    colonyNear: r => g.colonies.reduce((m, c) => Math.max(m, c.near(g.player.x, g.player.y, r)), 0),
  };
  const checkSteps = () => goals.check(goalWorld);
  // who an open line wants to talk to, and where the lines you are not tracking lead
  const wantsTalk = n => !g.story && goals.wantsTalk(n.id); // (in a story the people are the story's: it says who is to be spoken to)
  const sideObjectives = () => openLines().filter(l => l !== tracked()).map(l => objective(l)).filter(o => o && o.at);
  // the quest card's row of open lines: tap one to track it
  let linesKey = '';
  function renderLines() {
    const open = openLines().filter(l => l.quests.length), cur = tracked();
    const key = open.map(l => `${l.id}:${ls(l).qi}`).join('|') + `>${cur ? cur.id : ''}`;
    if (key === linesKey) return;
    linesKey = key;
    const el = g.$('#gq-lines');
    el.hidden = open.length < 2;
    el.innerHTML = open.map(l => `<button data-line="${l.id}" aria-pressed="${l === cur}" title="Track this walk">${l.title || questOf(l).title}<span class="num">${ls(l).qi}/${l.quests.length}</span></button>`).join('')
      + (g.touch ? '' : '<span class="key"><kbd>T</kbd> switch</span>');
  }
  return { LINES, Q, checkSteps, completeQuest, completeStep, cycleTrack, gaitChip, goals, ls, objective, openLines, qs, quest, renderLines, sideObjectives, step, stepOf, talkTo, trackNear, tracked, wantsTalk };
};
