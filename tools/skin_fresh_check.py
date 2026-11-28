"""No skin read on the CPU through a stale bindMatrixInverse (issue 157).

three.js sets a SkinnedMesh's bindMatrixInverse only in its updateMatrixWorld (the renderer calls it once a frame drawn;
Object3D.updateWorldMatrix does not). Attached, it is the inverse of the mesh's world at that moment, so a vertex skinned
on the CPU as  matrixWorld x bindMatrixInverse x bones x bindMatrix  lies where the body stood when the mesh was last
brought up to date: a frame back on a device that draws every frame, the last drawn frame in the checks that draw one in
sixty. It put the one you play's points 1.7 m from their body in tools/hold_depth.js, measured one mesh's hand against
another mesh's chest (main's run 578 failed on a hand 10.3 cm in the torso that was not), and turned the arms in
people.js armsClear by levers a run's stride wrong. Attached, the two cancel once fresh, and are left out.

So every read of `bindMatrixInverse` in the page's and the tools' scripts must be one of:
  - for a detached mesh only (the line says `detached`), where three.js keeps it as the bind matrix's inverse;
  - in a shader's text (GLSL: the GPU's own uniform, set fresh at the draw);
  - after a fresh update of the mesh's world in the same function (`updateMatrixWorld(` within the 12 lines before it).
Prints FAIL file:line for any other.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = sorted(list((ROOT / 'web').rglob('*.js')) + list((ROOT / 'tools').glob('*.js')))
SKIP = ('vendor', 'node_modules', 'three.module', 'three.min')
bad = 0
seen = 0
for f in FILES:
    if any(s in str(f) for s in SKIP):
        continue
    try:
        lines = f.read_text(encoding='utf-8').split('\n')
    except (UnicodeDecodeError, OSError):
        continue
    for i, line in enumerate(lines):
        if 'bindMatrixInverse' not in line:
            continue
        seen += 1
        code = line.split('//')[0] if not re.search(r'["\'`].*//', line) else line
        if 'bindMatrixInverse' not in code:
            continue  # (only in a comment)
        if 'detached' in line:
            continue
        if re.search(r'\b(vec4|vec3|mat4|uniform)\b', line):
            continue  # (GLSL)
        if any('updateMatrixWorld(' in lines[j] for j in range(max(0, i - 12), i)):
            continue
        bad += 1
        print(f'FAIL {f.relative_to(ROOT)}:{i + 1}: a skin read through bindMatrixInverse with nothing to say it is fresh: {line.strip()[:140]}')
print(f'{"FAIL" if bad else "ok"}   skin     {seen} reads of bindMatrixInverse, {bad} through a stale one' if bad else f'ok   skin     every CPU skin reads a fresh bind ({seen} mentions of bindMatrixInverse)')
sys.exit(1 if bad else 0)
