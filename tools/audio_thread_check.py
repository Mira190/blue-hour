#!/usr/bin/env python3
"""Every sound on the audio thread (docs/SOUND.md): the static half of the check, no browser.

iOS plays Web Audio in blocks of 128 frames (2.7 ms at 48 kHz), and a block the audio thread has not made in time is a
click; a run of them is a phone that sounds broken. So nothing that sounds may wait on a thread a busy page can starve.
Twice that rule was broken without anyone seeing it in the code: the Stop's tape as an AudioWorklet (its own thread,
not a real-time one) and the reverbs as ConvolverNodes with long responses (WebKit convolves all but the first 12,288
frames on a background thread of default priority). This reads web/ (not the vendored libraries) and fails on any use of
the things that do so outside the one place each is allowed, and says why it is allowed there:

  - an AudioWorklet (addModule, AudioWorkletNode) or a ScriptProcessorNode: the first only for the desktop's tape;
  - a ConvolverNode: only in audio.js's reverb() (which keeps a phone's within the limit), and in the offline renders
    (film-score.js, music.js's offline path), where there is no audio thread to keep up;
  - an AudioContext made: only audio.js's, and the fallbacks of overture.js and music.js for a page without it;
  - a media element's or stream's sound brought into the context (createMediaElementSource, createMediaStreamSource):
    none. A media element by itself (new Audio): only audio.js's tune(), a phone's music, which the system's own player
    decodes and plays in another process and which waits on nothing of the page's (docs/SOUND.md, "A phone's music").

tools/phone_audio.js is the other half: the page played as an iPhone, every convolver on the live context measured.
  python3 tools/audio_thread_check.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / 'web'
# (what, the pattern, {file: (how many uses, why)})
RULES = [
    ('an AudioWorklet', re.compile(r'audioWorklet\.addModule|new AudioWorkletNode'),
     {'web/game/audio.js': (2, "the Stop's tape with a mouse only; a touch screen brakes the street with the deck")}),
    ('a ScriptProcessorNode', re.compile(r'createScriptProcessor'), {}),
    ('a ConvolverNode', re.compile(r'createConvolver\s*\('),
     {'web/game/audio.js': (1, 'reverb(): a phone convolves only a head within the realtime limit'),
      'web/film-score.js': (1, 'an OfflineAudioContext: the opening\'s score rendered ahead'),
      'web/game/music.js': (1, 'the offline render only; live, the score\'s room is audio.js reverb()')}),
    ('an AudioContext made', re.compile(r'new\s+(?:window\.)?(?:webkit)?AudioContext\b|new\s+AC\s*\('),
     {'web/game/audio.js': (1, 'the one context, made in the first touch on iOS'),
      'web/game/overture.js': (1, 'only where there is no OEAudio, which the story page always has'),
      'web/game/music.js': (1, 'only when started without a context, which the game never does')}),
    ('a media element\'s or stream\'s sound brought into the context', re.compile(r'createMediaElementSource|createMediaStreamSource|createMediaStreamDestination'), {}),
    ('a media element made', re.compile(r'new\s+Audio\s*\('),
     {'web/game/audio.js': (1, 'tune(): a phone\'s music played by the system\'s own player, outside the context and its thread')}),
]


def main():
    fails, seen = [], {}
    files = sorted(p for p in WEB.rglob('*') if p.suffix in ('.js', '.html', '.mjs') and 'vendor' not in p.parts)
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding='utf-8', errors='replace')
        for what, pat, allowed in RULES:
            for m in pat.finditer(text):
                line = text.count('\n', 0, m.start()) + 1
                seen.setdefault((what, rel), []).append(line)
    for what, pat, allowed in RULES:
        for (w, rel), lines in sorted(seen.items()):
            if w != what:
                continue
            if rel not in allowed:
                fails.append(f'{rel}:{lines[0]}: {what}, which a phone\'s audio thread would wait on (docs/SOUND.md)')
            elif len(lines) > allowed[rel][0]:
                fails.append(f'{rel}:{lines[-1]}: {what} used {len(lines)} times where {allowed[rel][0]} is allowed ({allowed[rel][1]})')
    for f in fails:
        print('FAIL', f)
    n = sum(len(v) for v in seen.values())
    print(f'{"FAIL" if fails else "ok  "} audio    {n} uses of what runs off the audio thread, each where it is allowed' if not fails else f'FAIL {len(fails)}')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
