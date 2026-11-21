// Is this text one whole function, and nothing else? (tools/check_cache.py, docs/CHECKS.md "Checks by reach".)
// A check's pass is kept when a change lies inside a function the check never ran. That holds only if the changed
// text is still that one function: a brace closed early would put new statements outside it, where they run. V8
// itself is asked, without a parser: the text is evaluated as an expression in an empty context (a function
// expression runs none of its body) and the function it yields must print back as exactly that text. A method or a
// getter is tried inside an object literal. Anything else (a syntax error, a second expression, a call) is not whole.
//   echo '["function a() { return 1; }", "x => x }; evil(); (y => { y"]' | node tools/fn_whole.js   ->   [true,false]
//   echo '[["a(); // one", "a();   // two"]]' | node tools/fn_whole.js same                          ->   [true]
const vm = require('vm');
function whole(src) {
  const t = String(src);
  const tries = [
    () => vm.runInNewContext(`(${t}\n)`, Object.create(null), { timeout: 2000 }),
    () => { const o = vm.runInNewContext(`({ ${t}\n })`, Object.create(null), { timeout: 2000 }); const k = Reflect.ownKeys(o); if (k.length !== 1) return null; const d = Object.getOwnPropertyDescriptor(o, k[0]); return d.get || d.set || d.value; },
    () => { const C = vm.runInNewContext(`(class { ${t}\n })`, Object.create(null), { timeout: 2000 }); const k = Reflect.ownKeys(C.prototype).filter(x => x !== 'constructor'); if (k.length !== 1) return null; const d = Object.getOwnPropertyDescriptor(C.prototype, k[0]); return d.get || d.set || d.value; },
  ];
  for (const f of tries) {
    try { const fn = f(); if (typeof fn === 'function' && Function.prototype.toString.call(fn) === t) return true; } catch (e) { /* not this way */ }
  }
  return false;
}
// The same code, but for its comments and its spacing? ("same": pairs of a source as it was and as it is.) TypeScript's
// printer is asked where it is installed (a session's machine has it globally): both are printed without comments and
// compared. Without it the answer is no, and the change is judged as code.
function sameCode(a, b) {
  let ts; try { ts = require('typescript'); } catch (e) { return false; }
  const o = { compilerOptions: { removeComments: true, target: ts.ScriptTarget.ESNext }, reportDiagnostics: true }, bad = r => r.diagnostics.some(d => d.file); // (a syntax error names its file)
  try {
    const x = ts.transpileModule(a, o), y = ts.transpileModule(b, o);
    return !bad(x) && !bad(y) && x.outputText === y.outputText;
  } catch (e) { return false; }
}
if (require.main === module && process.argv[2] === 'same') {
  let s = ''; process.stdin.on('data', d => { s += d; }).on('end', () => { process.stdout.write(JSON.stringify(JSON.parse(s || '[]').map(([a, b]) => sameCode(a, b)))); });
} else if (require.main === module) {
  let s = ''; process.stdin.on('data', d => { s += d; }).on('end', () => { process.stdout.write(JSON.stringify(JSON.parse(s || '[]').map(whole))); });
}
module.exports = { whole, sameCode };
