"""A three-way merge of a generated JSON file by its top-level keys, for a merge that conflicts in one (game.json is
one line: git cannot merge it, and both sides are usually right, each in its own keys: the pipeline's ground and
heights on one side, the story's text on the other).

    python3 tools/merge_json.py web/data/shibuya/game.json      # during a merge with that file in conflict

Each key is taken from the side that changed it since the merge base; a key both sides changed differently is listed
and the file is left as it is (exit 1): make that part again with the pipeline. Then run pipeline/pack.py."""
import json
import subprocess
import sys


def side(n, path):
    return json.loads(subprocess.check_output(["git", "show", f":{n}:{path}"]))


def main():
    path = sys.argv[1]
    base, ours, theirs = (side(n, path) for n in (1, 2, 3))
    out, both = {}, []
    for k in list(dict.fromkeys(list(theirs) + list(ours))):
        b, o, t = base.get(k), ours.get(k), theirs.get(k)
        if o == t or t == b:
            v = o
        elif o == b:
            v = t
        else:
            both.append(k)
            continue
        if v is not None:
            out[k] = v
    if both:
        print(f"FAIL {path}: changed on both sides: {', '.join(both)}")
        sys.exit(1)
    json.dump(out, open(path, "w", encoding="utf8"), separators=(",", ":"), ensure_ascii=False)
    print(f"ok {path}: merged by key")


if __name__ == "__main__":
    main()
