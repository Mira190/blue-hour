# Playtesting Blue Hour

Issue 10 asked for playtests (now issue 14) with people who have not seen the story: where they look, where they stall, and
whether they can say who did it before frame 5. A container cannot do this; this page is the script, so that a
session with a person is the same session each time and its notes can be set beside the last one's.

## Who and how many

- Five people per round, none of whom has seen the story or read STORY.md. Five find most of what a round
  can find; a second round after the fixes finds what the first hid.
- At least two on a phone (their own, in their own browser) and two on a desktop; one with a controller if
  one is to hand. One who does not play games at all.
- One at a time, 45 minutes each: 30 to play episode one, 15 to talk.

## Before they start

- A fresh profile or a private window: the story keeps a case left half way (`oe-story-late`), and a second
  player must not inherit the first one's roll.
- Sound on, headphones if they have them. The page at its address as a player would open it (no `?walk=1`,
  no `?preface=0`).
- Say only this: "It is a short detective story set at the Shibuya crossing. Play it as you would at home.
  Please say out loud what you are thinking, especially when you are unsure what to do. I will not help,
  and nothing you do is wrong: when you get stuck, that is what we are here to find."
- Do not explain the controls, the camera, the Stop or the roll. The game must.

## While they play

The observer says nothing except "what are you thinking?" after 20 seconds of silence. A second person,
or a screen recording with the face camera on, notes on the sheet below. Note the time of each event from
the moment they press Begin.

| When | What to note |
|---|---|
| The title and the preface | Did they read the four lines, or press on? Did they find how to begin? |
| Each frame (1 to 7) | Time to reach the living; time to the Stop; time to the standpoint; time to the shutter |
| Each stall (30 s with no progress) | Where they were, what they were looking at, what they said they were trying to do, and what got them moving again |
| The goal line | Each time they read it aloud or look at it: is it what they needed? |
| The roll (Tab, the strip) | Did they open it without being asked? Did they set two prints side by side? |
| The log of the evening (L, View on a pad, the roll) | Did they look back at a line? Why? |
| Each answer they choose | Which, and what they said as they chose it |
| A spent frame | Did they understand that it was spent, and why? |
| The camera | Any time the picture was blocked (a wall, a tree, a car), and what they did |
| Text | Any line they could not read in time, or at all (size, contrast, the picture behind it) |

**The question that matters most.** At the end of frame 4 (after the roof), pause the session and ask:
"Who do you think did it, and why?" Write the answer down word for word. Ask again at the end of frame 5,
and once more after the last card. A story that works has most of them right, for the right reason, at
frame 5, and no one sure of it at frame 4.

## After they play

Ask in this order, and write the answers down word for word:

1. Tell me the story in a few sentences, as you would to a friend.
2. Who did what, in 1964? How do you know?
3. Was there a moment you felt clever? A moment you felt lost?
4. Who was Kagami, and why were they there?
5. What did you think the Stop was? The prints?
6. Was anything hard to read, to hear, or to reach (the keys, the buttons, the controller)?
7. Anything that looked wrong, or broke?

## The record

One file per round under `docs/playtests/` (`YYYY-MM-DD.md`): the five sheets, the answers to the question
at frames 4, 5 and the end, and a table of the stalls ranked by how many players hit each. Every stall hit
by two players or more becomes an issue labelled `story`, with the quotes. A round is finished when its
issues are opened, not when the sessions are over.

## What the game already records

`tools/story_play.js` plays every beat as a player who knows the way, and fails when the last card is not
reached: it finds dead ends, not stalls. The page's own telemetry (docs/OBSERVABILITY.md) counts loads,
frame times and errors; it does not record where a player stalls, and should not without their consent.
A playtest is the only way to see confusion.
