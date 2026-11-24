// What the buildings' arena holds against what it uses (batch.js arena), for tools/phone_frame.js EVAL=tools/arena_probe.js:
// read where the walk starts, then with the player taken 500 m away and brought back, twice, the map built round
// each place as the game builds it (the cells swapped for other levels of detail). What is held and not used is
// the GPU's memory for nothing.
(async () => {
  const g = window.__game, wait = ms => new Promise(q => setTimeout(q, ms));
  let b = null; g.Wd.world.traverse(o => { if (o.name === 'buildings-cells') b = o; });
  if (!b || !b.userData.arena) return { arena: null };
  const p = g.player, x0 = p.x, y0 = p.y, out = [['start', b.userData.arena()]];
  const go = async (x, y, name) => { p.x = x; p.y = y; for (let i = 0; i < 40; i++) { const q = g.Wd.mapAt && g.Wd.mapAt(x, y, true); if (q && q.then) await q; await wait(250); } out.push([name, b.userData.arena()]); };
  await go(x0 + 450, y0 - 250, 'away'); await go(x0, y0, 'back'); await go(x0 - 300, y0 + 400, 'away 2'); await go(x0, y0, 'back 2');
  out.push(['indices', b.userData.verify ? b.userData.verify() : 'no check']);
  return out.map(([k, v]) => k === 'indices' ? `indices after the trips: ${JSON.stringify(v)}` : `${k}: ${v.cells} cells, ${v.used_mb} MB used of ${v.mb} held, grown ${v.grown}, trimmed ${v.trimmed}`);
})()
