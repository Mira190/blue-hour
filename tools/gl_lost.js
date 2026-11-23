// A lost WebGL context, said where the plays say what failed. On a session's machine two browsers share llvmpipe, and
// under that load it can take a page's context away; glcare.js restores it, and the page stalls while it uploads
// everything again. A check that failed just after reads as a fault of the story when it was the loss (main's checks
// of 23 November: mem's 625 MB, the guide's and the walk's failures beside a second browser). So each loss and restore
// is printed as it happens, with the page's second and where the story stood, and a failure after one is tagged:
//   const lost = await require('./gl_lost').watch(p);   (before the page loads)
//   console.log(`FAIL ${lost.tag()}${what}`);           ('' where no context was lost)
const hook = () => {
  const get = HTMLCanvasElement.prototype.getContext;
  const where = () => {
    try {
      const g = window.__game, st = g && g.story && g.story.state;
      return `${st && st.fr ? `frame ${st.fi + 1} ${st.phase || ''} ${st.beat || ''}`.trim() : 'no frame'}, the game's clock ${g && g.t ? g.t().toFixed(1) : '?'} s`;
    } catch (e) { return '?'; }
  };
  const say = ev => console.log(`gl-lost ${JSON.stringify({ ev, s: +(performance.now() / 1000).toFixed(1), at: where() })}`);
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    const r = get.call(this, type, opts);
    if (r && /webgl/.test(type) && !this.__glLost) {
      this.__glLost = true;
      this.addEventListener('webglcontextlost', () => say('lost'));
      this.addEventListener('webglcontextrestored', () => say('restored'));
    }
    return r;
  };
};
exports.watch = async p => {
  await p.addInitScript(hook);
  const seen = [];
  p.on('console', m => {
    const t = m.text();
    if (!t.startsWith('gl-lost ')) return;
    try { const o = JSON.parse(t.slice(8)); seen.push(o); console.log(`(the WebGL context ${o.ev} at ${o.s} s of the page: ${o.at})`); } catch (e) { /* not ours */ }
  });
  return {
    seen,
    tag: () => {
      const l = seen.filter(o => o.ev === 'lost');
      return l.length ? `[after ${l.length} lost WebGL context${l.length > 1 ? 's' : ''}, the last at ${l[l.length - 1].s} s, ${l[l.length - 1].at}] ` : '';
    },
  };
};
