#!/usr/bin/env python3
"""The rules by which a check's pass is kept though a file it read has changed (tools/check_cache.py `reach`;
docs/CHECKS.md, "Checks by reach"), each tried on a small script in a clone of its own: a change inside a function
the check never ran, inside one it ran, a comment, a function renamed, a brace closed early, a new function, and
main's change beside the branch's own. A rule that kept a pass it should not have would let a broken change land
unplayed, so every rule is held here, in a second, with the static checks.
  python3 tools/reach_unit.py
"""
import os
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_cache as cc  # noqa: E402

BASE = '''\'use strict\';
window.M = (function () {
  const table = { a: 1 };
  // what ran
  function ran(x) {
    return x + table.a;
  }
  function idle(x) {
    return x * 2;
  }
  const late = () => {
    return 3;
  };
  return { ran, idle, late };
})();
'''


def sh(d, *a):
    return subprocess.run(a, cwd=d, capture_output=True, text=True, check=True).stdout.strip()


def table(text, ran):
    """Every function of BASE and whether the check ran it, as the browser would count them."""
    out = [[0, len(text), 1, '']]
    for name, head, tail in (('', 'function () {', '})();'), ('ran', 'function ran', '  function idle'), ('idle', 'function idle', '  const late'),
                             ('late', '() => {\n    return 3', '  return { ran')):
        s = text.index(head)
        e = text.index(tail, s)
        e = text.rindex('}', s, e) + 1
        out.append([s, e, 1 if name in ran or name == '' else 0, name])
    return out


def main():
    fails = 0
    ts = bool(cc.node(['same'], [['a(); // x', 'a(); // y']])[0])
    with tempfile.TemporaryDirectory() as d:
        os.makedirs(os.path.join(d, 'web'))
        sh(d, 'git', 'init', '-q', '-b', 'main')
        sh(d, 'git', 'config', 'user.email', 'check@example.invalid'); sh(d, 'git', 'config', 'user.name', 'check')
        p = os.path.join(d, 'web/a.js')
        cc.ROOT = d

        def commit(text, msg):
            open(p, 'w').write(text)
            sh(d, 'git', 'add', '-A'); sh(d, 'git', 'commit', '-q', '-m', msg, '--allow-empty')

        def case(name, want, now, main=BASE, was=BASE, ran=('ran',), needs_ts=False, table_of=None):
            nonlocal fails
            # origin/main as given; the pass read `was`; the file is `now`
            sh(d, 'git', 'checkout', '-q', '-B', 'main'); commit(main, 'main')
            sh(d, 'git', 'update-ref', 'refs/remotes/origin/main', 'HEAD')
            open(p, 'w').write(was)
            blob = cc.keep_blobs(['web/a.js'])['web/a.js']
            open(p, 'w').write(now)
            fns = table(was, ran)
            if table_of:   # (and the nine small functions of the larger closure, none of them run)
                import re
                fns += [[m.start(), m.end(), 0, m.group(1)] for m in re.finditer(r'function (f\d)\(\) \{ return \d; \}', was)]
            r, why = cc.reach('web/a.js', blob, fns)
            if needs_ts and not ts:
                print(f'ok   {name}: not tried (no TypeScript here to print a script without its comments)')
                return
            if r != want:
                fails += 1
                print(f'FAIL {name}: {"reaches" if r else "kept"} ({why}), should {"reach" if want else "be kept"}')
            else:
                print(f'ok   {name}: {"reaches" if r else "apart"}, {why}')

        case('a function the check never ran', False, BASE.replace('x * 2', 'x * 3'))
        case('a function the check ran', True, BASE.replace('x + table.a', 'x - table.a'))
        case('an arrow that never ran', False, BASE.replace('return 3', 'return 4'))
        case('outside any function', True, BASE.replace('{ a: 1 }', '{ a: 2 }'))
        case('a comment in what ran', False, BASE.replace('// what ran', '// what ran, said otherwise'), needs_ts=True)
        case('a function that never ran, renamed', True, BASE.replace('function idle(x)', 'function idle2(x)'))
        case('a brace closed early in a function that never ran', True, BASE.replace('    return x * 2;\n', '    return x * 2;\n  }\n  table.a = 5;\n  function more() {\n'))
        case('a new function by a new name', False, BASE.replace('  const late', '  // helps nobody yet\n  function helper(y) {\n    return y;\n  }\n  const late'))
        case('a new function after one alike (the diff puts it down late)', False, BASE.replace('  const late', '  function idle3(x) {\n    return x * 2;\n  }\n  const late'))
        case('a new function by a name already said', True, BASE.replace('  const late', '  function table(y) {\n    return y;\n  }\n  const late'))
        case('a new statement', True, BASE.replace('  const late', '  table.a = 2;\n  const late'))
        # main moved: the pass was of the branch's change to idle(); main then changed ran(), and is merged in
        mine = BASE.replace('x * 2', 'x * 3')
        theirs = BASE.replace('x + table.a', 'x - table.a')
        both = mine.replace('x + table.a', 'x - table.a')
        case("main's change in another function than the branch's", False, both, main=theirs, was=mine)
        case("main's change in a function the branch changed too", True,
             both.replace('    return x - table.a;', '    const k = 0;\n    return x - table.a;'), main=theirs,
             was=mine.replace('    return x + table.a;', '    const k = 0;\n    return x + table.a;'))
        # a closure of many functions is a scope: main's statement and the branch's, both at its own level, stand apart
        big = BASE.replace('  return { ran, idle, late };', ''.join(f'  function f{i}() {{ return {i}; }}\n' for i in range(9)) + '  const mine = 1;\n  return { ran, idle, late };')
        big_mine = big.replace('const mine = 1;', 'const mine = 2;')
        big_theirs = big.replace('{ a: 1 }', '{ a: 2 }')
        case("main's statement and the branch's in a closure of many functions", False, big_mine.replace('{ a: 1 }', '{ a: 2 }'),
             main=big_theirs, was=big_mine, table_of=big)
        case("main's file as main has it", False, theirs, main=theirs, was=BASE)
        case("the branch's change undone, the file main's again", False, BASE, main=BASE, was=mine)
        case('a function that did run', True, BASE.replace('x * 2', 'x * 3'), ran=('ran', 'idle', 'late'))
        # a model whose ground main moved: main's file as main has it, before the model's own contract is asked
        glb = os.path.join(d, 'web/m.glb')
        open(glb, 'wb').write(b'glTF as the pass read it')
        was = cc.keep_blobs(['web/m.glb'])['web/m.glb']
        open(glb, 'wb').write(b'glTF as main has it now')
        sh(d, 'git', 'add', '-A'); sh(d, 'git', 'commit', '-q', '-m', 'main moved a model')
        sh(d, 'git', 'update-ref', 'refs/remotes/origin/main', 'HEAD')
        j = cc.judge('a-check', {'blobs': {'web/m.glb': was}, 'cover': {}})
        if [r for _, r, _ in j] != [False]:
            fails += 1
            print(f'FAIL a model that is main\'s as main has it: {j}')
        else:
            print(f'ok   a model that is main\'s as main has it: apart, {j[0][2]}')
    wholes = cc.node([], ['function a() { return 1; }', 'x => x }; evil(); (y => { y', 'get g() { return 3; }', 'function(){} , evil()', 'function a() {} function b() {}'])
    if wholes != [True, False, True, False, False]:
        fails += 1
        print(f'FAIL one whole function: {wholes}')
    # every script a target's run_<name> in tools/check.sh starts with node is in that target's harness: a probe left
    # out let its own change keep the target's pass (trips_probe.js under roads, run 470's fix)
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'check.sh')).read()
    for m in re.finditer(r'^run_([a-z0-9]+)\(\) \{(.*?)^\}', src, re.S | re.M):
        k = m.group(1)
        if k not in cc.HARNESS:
            continue
        miss = sorted(set(re.findall(r'node (?:\S*/)?(tools/[A-Za-z_0-9]+\.js)', m.group(2))) - set(cc.HARNESS[k]))
        if miss:
            fails += 1
            print(f'FAIL {k} runs {", ".join(miss)}, not in its harness (tools/check_cache.py HARNESS)')
    print('ok   reach    a pass is kept only where the change cannot reach it' if not fails else f'FAIL reach    {fails} rules')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
