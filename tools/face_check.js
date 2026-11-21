// The story's faces (web/game/face.js, issue 12) as the talks show them: the episode is played by tools/story_play.js, and
// at every talk shot the speaker's face is looked at. It fails a speaker of the story without a face that moves (the
// speaking cast's models carry the shapes: blender/build_people.py add_face), and, on the first talk:
//   held   five seconds of stills with time held (the frame run with no time in it, as a paused game or the held world of
//          the Stop runs it): every eye bone and every shape must stay exactly as it was (a pose laid over the clip that
//          builds on the frame before winds round while time is held: AGENTS.md)
//   run    five seconds stepped a thirtieth of a second at a time, the line typed on: the eyes must stay within what eyes
//          do (35 degrees of the head's ahead), turn back to the clip's pose when the face is let go, the mouth must
//          move while the line is typed and the lids must blink
// It writes face-held-NN.png and face-run-NN.png (the face cropped from the frame, at the shot's size) and a still of each
// talk's opening face (face-talk-NN-*.png). FILM=0: the talks only.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/face_check.js out_dir [WxH]        (story_play.js's own settings: DRAW, FROM, UPTO, LIMIT ...; the
//   stills slow the play: LIMIT=3000 for the whole episode)
// Prints a line a talk and exits 1 if any fails, or if story_play.js does.
'use strict';
const path = require('path');
const fs = require('fs');
const [,, out = '/tmp/face-check', size = '1440x900'] = process.argv;
const pw = require('playwright');
const launch = pw.chromium.launch.bind(pw.chromium);
const bad = [], talks = [];
let page = null, film = null, polling = null, busy = false, seen = 0;
const crop = async file => {
  const r = await page.evaluate(() => {
    const g = window.__game, f = g && g.faces && g.faces(), cam = g.camera;
    for (const [rig, o] of f || []) {
      if (!o.talk) continue;
      let head = null; rig.root.traverse(b => { if (b.isBone && /Head$/.test(b.name) && !head) head = b; });
      if (!head) return null;
      const v = head.getWorldPosition(new cam.position.constructor()).add(new cam.position.constructor(0, 0.06, 0)).project(cam);
      const d = head.getWorldPosition(new cam.position.constructor()).distanceTo(cam.position);
      const px = Math.max(160, Math.min(520, 0.55 / (d * Math.tan(cam.fov * Math.PI / 360)) * innerHeight / 2));
      return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, s: px };
    }
    return null;
  });
  await page.evaluate(() => new Promise(r => { if (!window.__draw) return r(); window.__draw.all = true; requestAnimationFrame(() => requestAnimationFrame(r)); }));
  try {
    const vp = page.viewportSize();
    const clip = r ? { x: Math.max(0, r.x - r.s / 2), y: Math.max(0, r.y - r.s / 2), width: Math.min(r.s, vp.width), height: Math.min(r.s, vp.height) } : undefined;
    if (clip) { clip.x = Math.min(clip.x, vp.width - clip.width); clip.y = Math.min(clip.y, vp.height - clip.height); }
    await page.screenshot({ path: path.join(out, file), clip, timeout: 300000 });
  } finally { await page.evaluate(() => { if (window.__draw) window.__draw.all = false; }).catch(() => {}); }
};
// the faces chosen this frame: each one's eye bones, shapes, and how far its eyes are from the head's ahead (degrees)
const faces = () => page.evaluate(() => {
  const g = window.__game, f = g && g.faces && g.faces();
  const out = [];
  for (const [rig, o] of f || []) {
    const F = rig.face; if (!F) continue;
    let head = null; rig.root.traverse(b => { if (b.isBone && /Head$/.test(b.name) && !head) head = b; });
    const V = head.position.constructor, Q = head.quaternion.constructor;
    const hq = head.getWorldQuaternion(new Q()), hf = new V(0, 0, 1);
    // (the head's ahead, from its bind pose as face.js takes it)
    const sk = F.meshes[0].skeleton, bi = sk.bones.indexOf(head);
    const bq = new Q(); sk.boneInverses[bi].clone().invert().decompose(new V(), bq, new V());
    hf.applyQuaternion(bq.invert()).applyQuaternion(hq);
    const eyes = F.eyes.map(b => {
      const ei = sk.bones.indexOf(b), eq = new Q(); sk.boneInverses[ei].clone().invert().decompose(new V(), eq, new V());
      const ef = new V(0, 0, 1).applyQuaternion(eq.invert()).applyQuaternion(b.getWorldQuaternion(new Q()));
      return { q: b.quaternion.toArray().map(x => +x.toFixed(6)), off: +(Math.acos(Math.max(-1, Math.min(1, ef.dot(hf)))) * 180 / Math.PI).toFixed(2) };
    });
    const inf = F.meshes.map(m => Array.from(m.morphTargetInfluences).map(x => +x.toFixed(5)));
    out.push({ name: o.name, speaking: !!o.talk, typed: !!o.line, eyes, inf, st: F.state });
  }
  return out;
});
async function poll() {
  if (busy || !page || page.isClosed()) return;
  busy = true;
  try {
    const L = await page.evaluate(n => { const T = window.__game && window.__game.talkCam; return T ? T.log.slice(n) : []; }, seen);
    for (const s of L) {
      if (s.x == null) break;
      seen++;
      // (who is speaking, and whether their face moves: the line's speaker is in faceWho with the line)
      // (asked again for a second: at a cut the line can be a frame from being typed)
      let F = await faces(), sp = F.find(f => f.speaking);
      for (let k = 0; k < 5 && !sp && s.kind !== 'reverse'; k++) { await new Promise(r => setTimeout(r, 200)); F = await faces(); sp = F.find(f => f.speaking); }
      const name = (s.name || '').split(' ')[0];
      const line = `face talk ${seen}: ${s.name} ${s.kind} ${sp ? `face moving (${sp.inf[0].filter(x => x > 0.01).length} shapes on, eyes ${sp.eyes.map(e => e.off).join('/')} deg)` : s.kind === 'reverse' ? '(the player\'s own)' : 'NO FACE'}`;
      console.log(line);
      talks.push({ n: seen, name: s.name, kind: s.kind, face: !!sp });
      // (a talk already over when looked at, or someone standing in while their own character loads, is not failed)
      const why = sp || s.kind === 'reverse' || !s.name ? null : await page.evaluate(nm => {
        const g = window.__game;
        if (!g.dlg.open || !g.talkCam.talk || !g.talkCam.talk.speaker) return 'over';
        const f = [...g.storyFigs()].find(x => x.name === nm);
        return f && f.rig && f.character && f.rig.character !== f.character ? 'stand-in' : null;
      }, s.name);
      if (why) console.log(`  (${why === 'over' ? 'the talk was over when looked at' : 'a stand-in while their own character loads'})`);
      else if (!sp && s.kind !== 'reverse' && s.name) bad.push(`talk ${seen} (${s.name}): the speaker's face does not move`);
      if (sp) await crop(`face-talk-${String(seen).padStart(2, '0')}-${s.kind}-${name}.png`);
      if (sp && process.env.FILM !== '0' && !film && s.kind === 'two') {
        film = true;
        let release; const gate = new Promise(r => { release = r; });
        film = gate;
        await page.evaluate(() => window.__game.hold(true));
        try {
          // held: no time in the frames; nothing may move
          const first = JSON.stringify((await faces()).map(f => [f.eyes.map(e => e.q), f.inf]));
          for (let i = 0; i < 10; i++) {
            await page.evaluate(() => { const g = window.__game; for (let k = 0; k < 15; k++) { g.frame(0); if (g.story) g.story.tick(0); g.dlg.tick(0); } });
            await crop(`face-held-${String(i).padStart(2, '0')}.png`);
            const now = JSON.stringify((await faces()).map(f => [f.eyes.map(e => e.q), f.inf]));
            if (now !== first) { bad.push(`held ${i}: a face moved with time held`); console.log(`face held ${i}: MOVED`); break; }
          }
          console.log('face held: 5 s of stills, nothing moved');
          // run: a thirtieth of a second a step, the line typed on
          let blinks = 0, open = 0, maxOff = 0, was = 0, shapesMoved = 0, last = null;
          for (let i = 0; i < 10; i++) {
            for (let k = 0; k < 15; k++) {
              // (the game's own frame: the world's step, the story's, whose people's faces are posed in it, and the line's)
              await page.evaluate(() => { const g = window.__game; g.frame(1 / 30); if (g.story) g.story.tick(1 / 30); g.dlg.tick(1 / 30); });
              const F2 = await faces(), f = F2.find(x => x.speaking) || F2[0];
              if (!f) continue;
              const b = f.st.blink;
              if (b > 0.9 && was <= 0.9) blinks++;
              was = b; open = Math.max(open, f.st.open);
              for (const fx of F2) for (const e of fx.eyes) maxOff = Math.max(maxOff, e.off);
              const key = JSON.stringify(f.inf[0]); if (last !== null && key !== last) shapesMoved++; last = key;
            }
            await crop(`face-run-${String(i).padStart(2, '0')}.png`);
            if (i === 4) await page.evaluate(() => window.__game.dlg.next(false)); // (the next line, typed from its start)
          }
          console.log(`face run: ${blinks} blinks, mouth open up to ${open.toFixed(2)}, eyes up to ${maxOff.toFixed(1)} deg off the head's ahead, shapes changed in ${shapesMoved} of 150 steps`);
          if (!blinks) bad.push('run: no blink in five seconds');
          if (open < 0.15) bad.push(`run: the mouth did not move while the line was typed (${open.toFixed(2)})`);
          if (maxOff > 35) bad.push(`run: the eyes ${maxOff.toFixed(1)} deg off the head's ahead`);
          // let go: the eyes back to the clip's pose
          const back = await page.evaluate(() => {
            const g = window.__game, f = g.faces(); let worst = 0;
            for (const [rig] of f) { if (!rig.face) continue; const qs = rig.face.eyes.map(b => b.quaternion.clone()); rig.face.rest(); rig.face.eyes.forEach((b, i) => { worst = Math.max(worst, b.quaternion.angleTo(qs[i])); }); }
            return worst * 180 / Math.PI;
          });
          console.log(`face let go: the eyes went back ${back.toFixed(1)} deg to the clip's pose`);
          if (back > 40) bad.push(`let go: the eyes were ${back.toFixed(1)} deg off the clip's pose (wound round?)`);
        } catch (e) { bad.push(`film: ${String(e).slice(0, 200)}`); console.log(`face film failed: ${String(e).slice(0, 300)}`); }
        finally { await page.evaluate(() => window.__game.hold(false)).catch(() => {}); release(); film = true; }
      }
    }
  } catch (e) { if (!/closed|Target/.test(String(e))) console.log(`(face check: ${String(e).slice(0, 200)})`); }
  busy = false;
}
pw.chromium.launch = async (...a) => {
  const b = await launch(...a), newPage = b.newPage.bind(b), close = b.close.bind(b);
  b.newPage = async (...q) => {
    page = await newPage(...q);
    const press = page.keyboard.press.bind(page.keyboard);
    page.keyboard.press = async (...k) => { if (film && film.then) await film; return press(...k); };
    polling = setInterval(() => { poll(); }, 200);
    return page;
  };
  b.close = async () => {
    clearInterval(polling);
    while (busy) await new Promise(r => setTimeout(r, 100));
    busy = false; await poll();
    if (!talks.length) bad.push('no conversation was seen');
    console.log(`face check: ${talks.length} talk shots, ${talks.filter(t => t.face).length} with a moving face; ${bad.length} failing`);
    for (const l of bad) console.log(`FAIL ${l}`);
    fs.writeFileSync(path.join(out, 'faces.json'), JSON.stringify(talks, null, 1));
    return close();
  };
  return b;
};
const exit = process.exit.bind(process);
process.exit = code => exit(code || (bad.length ? 1 : 0));
fs.mkdirSync(out, { recursive: true });
process.argv = [process.argv[0], path.join(__dirname, 'story_play.js'), out, size];
require('./story_play.js');
