// Where web/game/game.js could be cut (issue 131; docs/SEAMS.md): for each of its sections (the "// ---- name" lines of
// its one closure), the names it declares at the closure's level that the rest uses (what it would offer), and the
// names of the rest it uses (what it would ask for). A section with few of both is a part already; one with many is
// woven in. Needs TypeScript's parser (installed globally on a session's machine).
//   node tools/cut_survey.js [web/game/game.js]        # a line a section: lines, offers, asks
//   node tools/cut_survey.js web/game/game.js 5233     # the section at that line: the names themselves
const ts = require('typescript'), fs = require('fs');
const file = process.argv[2] || 'web/game/game.js', at = +process.argv[3] || 0;
const text = fs.readFileSync(file, 'utf8'), sf = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true);
// the closure: the largest function in the file
let fn = null;
(function find(n) { if ((ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isFunctionDeclaration(n)) && n.body && (!fn || n.end - n.pos > fn.end - fn.pos)) fn = n; ts.forEachChild(n, find); })(sf);
const line = p => sf.getLineAndCharacterOfPosition(p).line + 1;
const heads = [];
text.split('\n').forEach((l, i) => { const m = /^  \/\/ -{4,} ?(.*)$/.exec(l); if (m) heads.push({ line: i + 1, name: m[1].replace(/[:(].*/, '').trim().slice(0, 44) }); });
const sectionOf = l => { let k = -1; for (let i = 0; i < heads.length; i++) if (heads[i].line <= l) k = i; return k; };
const bind = (name, out) => { if (ts.isIdentifier(name)) out.push(name.text); else if (name.elements) for (const e of name.elements) if (e.name) bind(e.name, out); };
// what each statement of the closure declares at its level
const decl = new Map();   // name -> section
for (const st of fn.body.statements) {
  const names = [];
  if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) bind(d.name, names);
  else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) names.push(st.name.text);
  for (const n of names) decl.set(n, sectionOf(line(st.getStart())));
}
// every use of such a name, by the section it is used in (a name declared again inside a function shadows it: counted
// all the same, so the numbers are an upper bound)
const offers = heads.map(() => new Map()), asks = heads.map(() => new Map());
(function walk(n) {
  if (ts.isIdentifier(n) && decl.has(n.text)) {
    const p = n.parent;
    const isProp = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) || (ts.isMethodDeclaration(p) && p.name === n);
    if (!isProp) {
      const from = sectionOf(line(n.getStart())), home = decl.get(n.text);
      if (from >= 0 && home >= 0 && from !== home) { offers[home].set(n.text, (offers[home].get(n.text) || 0) + 1); asks[from].set(n.text, (asks[from].get(n.text) || 0) + 1); }
    }
  }
  ts.forEachChild(n, walk);
})(fn.body);
heads.forEach((h, i) => {
  const end = (heads[i + 1] ? heads[i + 1].line : line(fn.end)) - 1;
  if (at) { if (h.line <= at && at <= end) { console.log(`${h.name} (${h.line}-${end})\noffers: ${[...offers[i]].map(([k, v]) => `${k}:${v}`).join(' ')}\nasks: ${[...asks[i]].map(([k, v]) => `${k}:${v}`).join(' ')}`); } return; }
  console.log(`${String(h.line).padStart(5)} ${String(end - h.line + 1).padStart(5)} lines  offers ${String(offers[i].size).padStart(3)}  asks ${String(asks[i].size).padStart(3)}  ${h.name}`);
});
