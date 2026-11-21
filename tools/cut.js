// Cuts a section of web/game/game.js out into a part of its own (issue 131; docs/SEAMS.md, "The cut of game.js").
//
// game.js is one closure: every function in it can name every variable of it, so nothing says what a section needs
// of the rest or gives it. This moves the closure's statements between two lines into a file of their own, as a
// function of one argument, `g`: the rest of the game, by name. TypeScript's checker says which name is which (a
// local that shadows a name of the closure is left alone), so
//   - every use in the section of a name the rest of the closure declares becomes `g.name`, and the line that takes
//     the section's place in game.js hands over an object with a getter for each (and a setter where the name is a
//     `let`): what the part asks of the game, each name once, in one place;
//   - the names the section declares and the rest uses are returned by the part and taken back, by name, on that
//     same line: what the part offers.
// Nothing else is touched: no line outside the section moves, none inside it is reformatted, comments stay.
// It refuses a section with a statement half inside it, an `await` or a `return` at the closure's level, and a `let`
// of the section that the rest uses (the rest would hold a copy): KEEP=name leaves such a declaration in game.js.
//   node tools/cut.js web/game/game.js <first line> <last line>                      # what the cut would ask and offer
//   node tools/cut.js web/game/game.js <first> <last> web/game/pilot.js OEGamePilot  # make it (then add the script to web/index.html
//                                                                                    # before game.js, and its part to contracts/parts.json)
// Needs TypeScript (installed globally on a session's machine). Play every check after a cut: a name used before the
// part is made (the closure's functions were hoisted; the part's are not) shows at the page's load.
const ts = require('typescript'), fs = require('fs'), path = require('path');
const KEEP = (process.env.KEEP || '').split(',').filter(Boolean), kept = [];   // (KEEP=name,...: those declarations of the section stay in game.js, before the part: a let the rest reads)
const [,, file, A, B, out, glob] = process.argv;
if (!file || !A || !B) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => /^\/\/   node/.test(l)).map(l => l.slice(3)).join('\n')); process.exit(2); }
const a = +A, b = +B;
const program = ts.createProgram([file], { allowJs: true, checkJs: false, noEmit: true, target: ts.ScriptTarget.ESNext, noResolve: true, noLib: true, types: [] });
const checker = program.getTypeChecker(), sf = program.getSourceFile(path.resolve(file)) || program.getSourceFiles().find(s => !s.isDeclarationFile);
const text = sf.text, lineOf = p => sf.getLineAndCharacterOfPosition(p).line + 1, starts = sf.getLineStarts();
let fn = null;
(function find(n) { if ((ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isFunctionDeclaration(n)) && n.body && ts.isBlock(n.body) && (!fn || n.end - n.pos > fn.end - fn.pos)) fn = n; ts.forEachChild(n, find); })(sf);
const from = starts[a - 1], to = b < starts.length ? starts[b] : text.length;   // whole lines
const inside = n => n.getStart() >= from && n.end <= to;
const die = m => { console.error(`cut: ${m}`); process.exit(1); };
// the closure's own names: symbol -> { name, kind, inS }
const names = new Map();
const bind = (name, kind, inS) => { if (ts.isIdentifier(name)) { const s = checker.getSymbolAtLocation(name); if (s) names.set(s, { name: name.text, kind, inS }); } else for (const e of name.elements) if (e.name) bind(e.name, kind, inS); };
for (const p of fn.parameters) bind(p.name, 'const', false);
for (const st of fn.body.statements) {
  let inS = inside(st);
  if (inS && ts.isVariableStatement(st) && st.declarationList.declarations.some(d => ts.isIdentifier(d.name) && KEEP.includes(d.name.text))) {
    const l0 = starts[lineOf(st.getStart()) - 1], l1 = starts[lineOf(st.end)];
    if (text.slice(l0, st.getStart()).trim() || /\S/.test(text.slice(st.end, l1).replace(/\/\/.*/, ''))) die(`the kept statement at line ${lineOf(st.getStart())} shares its line`);
    kept.push([l0, l1]); inS = false;
  }
  if (!inS && !kept.some(k => k[0] <= st.getStart() && st.end <= k[1]) && st.getStart() < to && st.end > from) die(`the statement at line ${lineOf(st.getStart())} to ${lineOf(st.end)} is half inside lines ${a} to ${b}`);
  if (ts.isVariableStatement(st)) { const k = st.declarationList.flags & ts.NodeFlags.Const ? 'const' : 'let'; for (const d of st.declarationList.declarations) bind(d.name, k, inS); }
  else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) bind(st.name, 'function', inS);
  if (inS) (function top(n) { // nothing at the closure's own level that a function of its own could not do
    if (ts.isFunctionLike(n)) return;
    if (ts.isAwaitExpression(n)) die(`an await at the closure's level, line ${lineOf(n.getStart())}`);
    if (ts.isReturnStatement(n)) die(`a return at the closure's level, line ${lineOf(n.getStart())}`);
    ts.forEachChild(n, top);
  })(st);
}
const asks = new Map(), offers = new Map(), edits = [];
(function walk(n) {
  if (ts.isIdentifier(n)) {
    const p = n.parent;
    const short = ts.isShorthandPropertyAssignment(p) && p.name === n;
    const named = (ts.isPropertyAccessExpression(p) && p.name === n) || ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p) || ts.isPropertyDeclaration(p)) && p.name === n)
      || (ts.isBindingElement(p) && p.propertyName === n) || ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p);
    if (!named) {
      const s = short ? checker.getShorthandAssignmentValueSymbol(p) : checker.getSymbolAtLocation(n), d = s && names.get(s);
      const declares = d && (((ts.isVariableDeclaration(p) || ts.isBindingElement(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p)) && p.name === n));
      if (d && !declares) {
        const here = n.getStart() >= from && n.end <= to && !kept.some(k => k[0] <= n.getStart() && n.end <= k[1]);
        if (here && !d.inS) { asks.set(d.name, d.kind); edits.push([n.getStart(), n.end, short ? `${d.name}: g.${d.name}` : `g.${d.name}`]); }
        else if (!here && d.inS) offers.set(d.name, d.kind);
      }
    }
  }
  ts.forEachChild(n, walk);
})(fn.body);
const badLet = [...offers].filter(([, k]) => k === 'let').map(([n]) => n);
console.log(`lines ${a} to ${b}: ${b - a + 1} lines\nasks (${asks.size}): ${[...asks.keys()].sort().join(' ')}\noffers (${offers.size}): ${[...offers.keys()].sort().join(' ')}`);
if (badLet.length) die(`the rest of game.js uses the section's own let ${badLet.join(', ')}: it would hold a copy`);
if (!out) process.exit(0);
if (!/^[A-Z]\w+$/.test(glob || '')) die('the part\'s global, like OEGamePilot');
let sec = text.slice(from, to);
for (const [s, e, t] of [...edits, ...kept.map(k => [k[0], k[1], ''])].sort((x, y) => y[0] - x[0])) sec = sec.slice(0, s - from) + t + sec.slice(e - from);
const give = [...offers.keys()].sort(), want = [...asks.keys()].sort();
const head = `// ${path.basename(out)}: a part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").\n// \`g\` is the rest of the game, by name. What this part asks of it:\n//   ${wrap(want.join(', '))}\n// and what it gives back:\n//   ${wrap(give.join(', '))}\n'use strict';\nwindow.${glob} = function (g) {\n`;
function wrap(s) { const o = []; let l = ''; for (const w of s.split(' ')) { if ((l + ' ' + w).length > 112) { o.push(l); l = w; } else l = l ? `${l} ${w}` : w; } o.push(l); return o.join('\n//   '); }
fs.writeFileSync(out, `${head}${sec.replace(/\n*$/, '\n')}  return { ${give.join(', ')} };\n};\n`);
const getters = want.map(n => `get ${n}() { return ${n}; }${asks.get(n) === 'let' ? `, set ${n}(v) { ${n} = v; }` : ''}`).join(', ');
const first = text.slice(from, to).split('\n')[0];
const line = `${/^\s*\/\/ -{4,}/.test(first) ? `${first.replace(/\s*$/, '')}: ${path.relative(path.dirname(file), out)} (tools/cut.js)\n` : ''}${kept.map(k => text.slice(k[0], k[1])).join('')}  const { ${give.join(', ')} } = ${glob}({ ${getters} });\n${/\n\s*\n$/.test(text.slice(from, to)) ? '\n' : ''}`;
fs.writeFileSync(file, text.slice(0, from) + line + text.slice(to));
console.log(`wrote ${out} (${sec.split('\n').length} lines, ${edits.length} names of the game's now g.name) and one line in ${file}`);
