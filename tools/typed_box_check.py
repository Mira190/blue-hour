"""No harness judges words from the dialogue box as far as it is typed (docs/CHECKS.md "Words read off the box").

The box types a line in at 55 letters a second of the game's clock (hud.js dialogue), which on a software renderer
runs at a third of the wall's: read a moment after it opens it holds "Th" or "Thank yo". Twice a walk check failed on
it (Nagi's thanks, 27 November 2026; Shun's cold opening, run 560, 28 November): the game said the right line, the
check read two letters. A harness asks the game for the whole line (window.__game.dlg.line.text) instead.

Fails if a script in tools/ reads #gd-text's textContent into a name and, within the next three lines, tests that
name against a pattern (.test(name), .match(, startsWith(, includes( on it). Reading the box to see that it changed,
or how much of it is shown, is not judging its words, and stays allowed.

    python3 tools/typed_box_check.py
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
READ = re.compile(r"const\s+(\w+)\s*=\s*await\s+p\.evaluate\([^\n]*gd-text[^\n]*textContent")


def main():
    bad = []
    for path in sorted(glob.glob(os.path.join(ROOT, "tools", "*.js"))):
        lines = open(path, encoding="utf8").read().split("\n")
        for i, line in enumerate(lines):
            m = READ.search(line)
            if not m:
                continue
            name = re.escape(m.group(1))
            judge = re.compile(rf"\.test\({name}\)|\b{name}\.(match|startsWith|includes)\(")
            for j in range(i, min(len(lines), i + 4)):
                if judge.search(lines[j]):
                    bad.append(f"{os.path.relpath(path, ROOT)}:{j + 1}: judges the words of the box as typed ({m.group(1)}); ask window.__game.dlg.line.text")
                    break
    for b in bad:
        print(f"FAIL {b}")
    if bad:
        return 1
    print(f"ok   typed    no harness judges a line by what the box has typed of it")
    return 0


if __name__ == "__main__":
    sys.exit(main())
