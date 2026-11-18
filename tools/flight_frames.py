"""The story's flight cut as a storyboard, without a browser: for every frame with a `flight` whose shots fly its own `path`
(cities/<city>/city.json), each shot's camera is worked out as web/game/overture.js works it out (move, with `aim`;
escort), every tenth of a second, on a desktop (1440x900) and a phone held upright (390x844), behind the film's bars.
It reports where the helicopter is in the picture and how big, how fast the lens turns, and which way the helicopter
crosses the frame, and fails where:
  - the helicopter leaves the picture in a shot that is about it (all but the first's lift and the last, where you are);
  - the lens turns faster than PAN degrees a second (an aerial unit's pan is no faster than a frame's width in about
    seven seconds; the brief in docs/STORY.md, The flight);
  - the helicopter crosses the frame right to left in a shot after the first, where every camera is on its right
    (screen direction, the 180-degree rule).

    python tools/flight_frames.py [city]
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAN = 12.0       # degrees a second at most, the lens's turn (a pan that follows the helicopter, not a whip)
BARS = 0.085     # the film's bars, top and bottom, as a share of the screen's height (index.html .letterbox)
SCREENS = {"desktop": 1440 / 900, "phone": 390 / 844}


def ease(name, t):
    t = min(1.0, max(0.0, t))
    if name == "linear":
        return t
    if name == "inOut":
        return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2
    if name == "smooth":
        return t ** 3 * (t * (6 * t - 15) + 10)
    a = 0.18  # glide
    if t < a:
        return t * t / (2 * a * (1 - a))
    if t > 1 - a:
        return 1 - (1 - t) ** 2 / (2 * a * (1 - a))
    return (t - a / 2) / (1 - a)


def ch(v, k, e):
    return v[0] + (v[1] - v[0]) * e(k) if isinstance(v, list) else v


class Path:
    """overture.js pathAt: a cubic in time through [x, y, z, t] points, each point's velocity from its neighbours,
    nought at an end and at a point repeated."""

    def __init__(self, pts):
        self.P = [q[:3] for q in pts]
        self.T = [q[3] for q in pts]
        n = len(pts)
        same = lambda u, v: sum((u[a] - v[a]) ** 2 for a in range(3)) < 1e-6
        self.M = []
        for i in range(n):
            if i == 0 or i == n - 1 or same(self.P[i - 1], self.P[i]) or same(self.P[i], self.P[i + 1]):
                self.M.append([0.0, 0.0, 0.0])
            else:
                self.M.append([(self.P[i + 1][a] - self.P[i - 1][a]) / max(1e-3, self.T[i + 1] - self.T[i - 1]) for a in range(3)])

    def at(self, t):
        P, T, M = self.P, self.T, self.M
        if t <= T[0]:
            return list(P[0])
        if t >= T[-1]:
            return list(P[-1])
        i = 0
        while i < len(P) - 2 and t > T[i + 1]:
            i += 1
        h = max(1e-3, T[i + 1] - T[i])
        u = (t - T[i]) / h
        h00, h10, h01, h11 = 2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2
        return [h00 * P[i][a] + h10 * h * M[i][a] + h01 * P[i + 1][a] + h11 * h * M[i + 1][a] for a in range(3)]


def point(p, end):
    if isinstance(p[0], str):
        return [end[0] + (p[1] if len(p) > 1 else 0), end[1] + (p[2] if len(p) > 2 else 0), end[2] + (p[3] if len(p) > 3 else 0)]
    return list(p[:3])


last_hd = [0.0, 1.0]


def heading(path, T, lag):
    sx = sy = 0.0
    for i in range(9):
        t1 = T - lag * (1 - i / 8)
        a, b = path.at(t1 - 0.15), path.at(t1 + 0.15)
        dx, dy = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(dx, dy)
        w = 0.5 + i / 8
        if ln > 0.05:
            sx += dx / ln * w * min(1, ln / 1.5)
            sy += dy / ln * w * min(1, ln / 1.5)
    ln = math.hypot(sx, sy)
    if ln > 0.2:
        last_hd[0], last_hd[1] = sx / ln, sy / ln
    return last_hd


def pose(s, k, path, end):
    e = lambda t: ease(s.get("ease", "glide"), t)
    T = s["t0"] + k * s["dur"]
    g = path.at(T)
    if s["type"] == "move":
        a, b = point(s["from"], end), point(s["to"], end)
        pos = [a[i] + (b[i] - a[i]) * e(k) for i in range(3)]
        if "look" in s:
            look = point(s["look"], end)
        else:
            a, b = point(s["lookFrom"], end), point(s["lookTo"], end)
            look = [a[i] + (b[i] - a[i]) * e(k) for i in range(3)]
        aim = s.get("aim")
        if aim is not None:
            w = ease("smooth", (k - aim[0]) / max(1e-3, aim[1] - aim[0])) if isinstance(aim, list) else aim
            q = path.at(T + s.get("lead_s", 0))
            if s.get("lead_s"):
                q[2] = g[2]  # (room ahead of it, at its own height)
            q[2] += s.get("aim_up", 0)
            look = [look[i] + (q[i] - look[i]) * w for i in range(3)]
    elif s["type"] == "escort":
        hx, hy = heading(path, T, s.get("lag", 1.2))
        az = math.radians(ch(s.get("az", 25), k, e))
        dist, h = ch(s.get("dist", 20), k, e), ch(s.get("h", 3), k, e)
        bx, by = -hx * math.cos(az) + hy * math.sin(az), -hy * math.cos(az) - hx * math.sin(az)
        pos = [g[0] + bx * dist, g[1] + by * dist, g[2] + h]
        look = path.at(T + s.get("lead_s", 0.3))
        look[2] = g[2] + s.get("aim_up", 0)
    else:
        return None
    return pos, look, ch(s.get("fov", 45), k, e), g


def lens(v, aspect):
    k = 1.2 / aspect
    return v if k <= 1 else min(90, 2 * math.degrees(math.atan(math.tan(math.radians(v) / 2) * k)))


def project(pos, look, fov, aspect, p):
    f = [look[i] - pos[i] for i in range(3)]
    fl = math.sqrt(sum(c * c for c in f))
    f = [c / fl for c in f]
    r = [f[1], -f[0], 0.0]  # forward x up(z)
    rl = math.hypot(r[0], r[1]) or 1e-6
    r = [c / rl for c in r]
    u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]
    d = [p[i] - pos[i] for i in range(3)]
    z = sum(d[i] * f[i] for i in range(3))
    if z <= 0.1:
        return None, z
    ty = math.tan(math.radians(fov) / 2)
    return (sum(d[i] * r[i] for i in range(3)) / z / (ty * aspect), sum(d[i] * u[i] for i in range(3)) / z / ty), z


def main():
    city = sys.argv[1] if len(sys.argv) > 1 else "shibuya"
    cfg = json.load(open(os.path.join(ROOT, "cities", city, "city.json"), encoding="utf8"))
    bad = 0
    for ep in cfg["game"]["story"]["episodes"]:
        for fi, fr in enumerate(ep["frames"]):
            fl = fr.get("flight") or {}
            if not fl.get("path"):
                continue
            path = Path(fl["path"])
            e = fl.get("end", {}).get("at", path.P[-1])
            end = [e[0], e[1], path.P[-1][2]]
            t0 = 0.0
            shots = []
            for s in fl["shots"]:
                shots.append(dict(s, t0=t0))
                t0 += s["dur"]
            print(f"frame {fi + 1}: {len(shots)} shots, {t0:.1f} s; the path {path.T[-1]:.1f} s")
            for n, s in enumerate(shots):
                if s.get("guide") != "path":
                    continue
                about = 0 < n < len(shots) - 1  # (the lift, where it may leave the frame over the edge, and the last, where you are)
                for scr, aspect in SCREENS.items():
                    xs, ys, sizes, pans, dirs, out = [], [], [], [], [], 0
                    prev = None
                    steps = max(2, int(s["dur"] / 0.1))
                    for j in range(steps + 1):
                        k = j / steps
                        pos, look, fov, g = pose(s, k, path, end)
                        fov = lens(fov, aspect)
                        c = [g[0], g[1], g[2] + 1.5]
                        q, z = project(pos, look, fov, aspect, c)
                        f = [look[i] - pos[i] for i in range(3)]
                        if prev is not None:
                            a = sum(f[i] * prev[0][i] for i in range(3)) / (math.sqrt(sum(c2 * c2 for c2 in f)) * math.sqrt(sum(c2 * c2 for c2 in prev[0])))
                            pans.append(math.degrees(math.acos(max(-1, min(1, a)))) / (s["dur"] / steps))
                            a2, b2 = path.at(s["t0"] + k * s["dur"] - 0.1), path.at(s["t0"] + k * s["dur"] + 0.1)
                            v = [(b2[i] - a2[i]) / 0.2 for i in range(3)]
                            if math.hypot(v[0], v[1]) > 2:  # (its way across the frame, whatever the camera does: which side of its line the camera is on)
                                rr = [f[1], -f[0]]
                                dirs.append((v[0] * rr[0] + v[1] * rr[1]) / (math.hypot(*rr) or 1))
                        prev = (f, q)
                        if q is None or abs(q[0]) > 0.98 or abs(q[1]) > 1 - 2 * BARS - 0.02:
                            out += 1
                        if q:
                            xs.append(q[0])
                            ys.append(q[1])
                            sizes.append(10.7 / z / (2 * math.tan(math.radians(fov) / 2) * aspect))  # its length as a share of the frame's width
                    pan = max(pans) if pans else 0
                    lr = sum(1 for d in dirs if d > 0.5) - sum(1 for d in dirs if d < -0.5)
                    line = (f"  {s['id']:9s} {scr:7s} x {min(xs):+.2f}..{max(xs):+.2f}  y {min(ys):+.2f}..{max(ys):+.2f}  size {min(sizes):.2f}..{max(sizes):.2f} of the width"
                            f"  pan {pan:4.1f}°/s  {'left to right' if lr > 0 else 'right to left' if lr < 0 else 'still'}{f'  OUT {out} of {steps + 1}' if out else ''}")
                    print(line)
                    if about and out:
                        print(f"FAIL frame {fi + 1} {s['id']} {scr}: the helicopter is out of the picture in {out} of {steps + 1} steps")
                        bad += 1
                    if about and pan > PAN:
                        print(f"FAIL frame {fi + 1} {s['id']} {scr}: the lens turns {pan:.1f} degrees a second")
                        bad += 1
                    if n > 0 and about and lr < 0:
                        print(f"FAIL frame {fi + 1} {s['id']} {scr}: it crosses the frame right to left")
                        bad += 1
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
