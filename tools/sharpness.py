#!/usr/bin/env python3
"""How sharp a recording sounds: Zwicker's sharpness (DIN 45692), in acum, from a WAV.

The owner's test for the street's sound (24 November 2026): to the ear it is not sharp, it is soft. Sharpness is the
psychoacoustic measure of that: the centre of gravity of a sound's loudness along the ear's critical bands (Bark),
weighted up steeply above 15.8 Bark (about 3 kHz), where the ear hears a sound as shrill. 1 acum is a band of noise
one critical band wide at 1 kHz and 60 dB. Here the specific loudness of each half-Bark band is Zwicker's
(1 + E/E_TQ)^0.23 - 1 against the threshold of hearing in quiet (Terhardt's fit), with full scale taken as SPL dB
(100 by default: a phone near the ear, turned up), and no masking between bands: a ranking of sounds against each other
and against one the owner has accepted, not a calibrated meter.
  python3 tools/sharpness.py a.wav [b.wav ...]          prints acum, the spectral centroid and the share over 4 kHz
"""
import sys, wave
import numpy as np

def bark(f):
    return 13 * np.arctan(0.00076 * f) + 3.5 * np.arctan((f / 7500.0) ** 2)

def tq(f):
    k = np.maximum(f, 20) / 1000.0
    return 3.64 * k ** -0.8 - 6.5 * np.exp(-0.6 * (k - 3.3) ** 2) + 1e-3 * k ** 4

def measure(path, start=None, end=None, spl=100.0):
    w = wave.open(path); r = w.getframerate(); n = w.getnchannels()
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, n).astype(float).mean(1) / 32768
    if start is not None: x = x[int(start * r):int(end * r)]
    acum, cents, hi = [], [], []
    win = r // 2
    for i in range(0, len(x) - win, win):
        seg = x[i:i + win] * np.hanning(win)
        S = np.abs(np.fft.rfft(seg)) ** 2; f = np.fft.rfftfreq(win, 1 / r)
        if S.sum() < 1e-12: continue
        z = bark(f); edges = np.arange(0, 24.5, 0.5)
        E = np.array([S[(z >= a) & (z < a + 0.5)].sum() for a in edges[:-1]]); zc = edges[:-1] + 0.25
        # (the band's level in dB SPL against the threshold at its centre; the window's sum taken as the band's power)
        fc = np.array([f[(z >= a) & (z < a + 0.5)].mean() if ((z >= a) & (z < a + 0.5)).any() else 20000 for a in edges[:-1]])
        L = 10 * np.log10(E / (win * win / 8) + 1e-30) + spl
        N = np.maximum(0, (1 + 10 ** ((L - tq(fc)) / 10)) ** 0.23 - 1)
        if N.sum() <= 0: continue
        g = np.where(zc < 15.8, 1.0, 0.15 * np.exp(0.42 * (zc - 15.8)) + 0.85)
        acum.append(0.11 * (N * g * zc).sum() * 0.5 / max(1e-12, N.sum() * 0.5))
        cents.append((S * f).sum() / S.sum()); hi.append(S[f >= 4000].sum() / S.sum())
    return float(np.median(acum)), float(np.median(cents)), float(np.median(hi))

if __name__ == '__main__':
    for p in sys.argv[1:]:
        a, c, h = measure(p)
        print(f'{a:5.2f} acum  centroid {c:6.0f} Hz  over 4 kHz {100 * h:4.1f} %  {p}')
