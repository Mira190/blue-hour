// heights.js: a part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").
// `g` is the rest of the game, by name. What this part asks of it:
//   $, A, B, D, H, SRC_TEXT, U, aimed, lens, life, player, qs, save
// and what it gives back:
//   guess, guessCheck, guessStart
'use strict';
window.OEGameHeights = function (g) {
  // ------------------------------------------------------------ height challenge: guess, then see how good the data is
  // Aim at a building and press G. Your guess is scored against the model's height, and
  // set beside the error of the data itself: a floor-count height is good to about ±20%,
  // an estimate much less, so a guess can be as good as the open data.
  const guess = { bi: -1, revealed: false };
  const sigmaOf = src => (g.D.UNC && g.D.UNC.sigma && g.D.UNC.sigma[src]) || { mapped: 0.03, reference: 0.03, verified: 0.02 }[src] || 0.2;
  const sliderH = v => 3 * Math.pow(320 / 3, v / 1000); // a log scale, 3 to 320 m
  function guessStart() {
    if (g.player.mode !== 'foot') return;
    const hit = g.aimed();
    if (!hit) { g.H.toast('Aim at a building and press G to guess its height.'); return; }
    const m = g.B.b[hit.bi];
    if (m[4] === 'parametric') { g.H.toast('That one is built from its published dimensions. Try another building.'); return; }
    Object.assign(guess, { bi: hit.bi, revealed: false });
    g.U.uSel.value = hit.bi;
    clearTimeout(g.lens.t);
    const name = m[0] || (m[1] ? `Unnamed ${m[1].replace(/_/g, ' ')}` : 'Unnamed building');
    g.$('#g-lens').innerHTML = `<span class="eyebrow">Height challenge · ${Math.round(hit.distance)} m away</span><b>${name}</b>
      <span class="note">How tall is it, ground to roof?</span>
      <label class="g-guess"><input type="range" id="gg-range" min="0" max="1000" value="${Math.round(1000 * Math.log(30 / 3) / Math.log(320 / 3))}" aria-label="Your guess, in metres"><output id="gg-val" class="num"></output></label>
      <div class="row"><button class="btn primary" id="gg-go">Check <kbd>Enter</kbd></button><button class="btn" id="gg-no">Not now</button></div>`;
    g.$('#g-lens').hidden = false;
    const show = () => { g.$('#gg-val').textContent = `${Math.round(sliderH(+g.$('#gg-range').value))} m`; };
    show();
    g.$('#gg-range').addEventListener('input', show);
    g.$('#gg-range').addEventListener('keydown', e => { if (e.key === 'Enter') guessCheck(); });
    g.$('#gg-go').addEventListener('click', guessCheck);
    g.$('#gg-no').addEventListener('click', guessClose);
  }
  function guessClose() { guess.bi = -1; g.$('#g-lens').hidden = true; g.U.uSel.value = -1; }
  function guessCheck() {
    if (guess.bi < 0 || guess.revealed) return;
    guess.revealed = true;
    const m = g.B.b[guess.bi], h = m[2], g_ = Math.round(sliderH(+g.$('#gg-range').value));
    const err = Math.log(g_ / h), pts = Math.max(0, Math.round(100 * (1 - Math.abs(err) / Math.LN2))); // 0 points at twice or half
    const sig = sigmaOf(m[4]), lo = h * Math.exp(-1.645 * sig), hi = h * Math.exp(1.645 * sig), inside = g_ >= lo && g_ <= hi;
    const rec = g.qs.guesses || (g.qs.guesses = { n: 0, pts: 0, inside: 0 });
    rec.n++; rec.pts += pts; rec.inside += inside ? 1 : 0;
    if (g.life) g.life.emit('guess', { score: pts, inside, name: m[0] || '', height: h });
    g.save();
    const off = Math.round(100 * (g_ / h - 1));
    g.$('#g-lens').innerHTML = `<span class="eyebrow">Height challenge</span><b>${m[0] || 'This building'}: ${h.toFixed(1)} m</b>
      <span class="verdict">${pts} points${inside ? ' · as good as the data' : ''}</span>
      <span>Your guess, ${g_} m, is ${off === 0 ? 'spot on' : `${Math.abs(off)}% ${off > 0 ? 'high' : 'low'}`}. ${g.SRC_TEXT[m[4]] ? g.SRC_TEXT[m[4]][0].toUpperCase() + g.SRC_TEXT[m[4]].slice(1) : 'Its height comes from the open data'},
      good to ${Math.round(lo)}–${Math.round(hi)} m nine times in ten.${inside ? ' Your guess is inside that range.' : ''}</span>
      <span class="note">${rec.n} guess${rec.n > 1 ? 'es' : ''}, ${Math.round(rec.pts / rec.n)} points on average; ${rec.inside} as good as the data. G for another.</span>`;
    if (inside) g.A.chime();
    clearTimeout(g.lens.t);
    g.lens.t = setTimeout(guessClose, 12000);
  }
  return { guess, guessCheck, guessStart };
};
