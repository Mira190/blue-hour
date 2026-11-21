"""The game's main character (Kagami, whom you play, as a woman or a man), from Microsoft Rocketbox (MIT): its
avatars, made by artists and rigged on a 3ds Max Biped, with its motion-captured clips on the
same skeleton. Each clip is copied onto the avatar bone by bone in world space (the avatars'
bind pose and the clips' rest pose differ, so local rotations would not carry over), with the
walk, run and sprint kept in place and their ground speed read from the clip's own extracted
root motion. Textures are shrunk and written as WebP inside one glTF binary per character. Kagami
wears a Japanese face (another avatar's head, as the NPCs do), clothes taken to the colours Tokyo
wears in October (dress), and a camera round the neck (neck_camera).

The NPCs (--npcs) are Rocketbox avatars too: every R_<avatar>[_<head>][_<tag>...] character a
city's game.npcs, crowd or story names (pipeline/fetch_rocketbox.py, npc_cast). An avatar can wear another
avatar's head (by its model code: R_Pilot_Female_01_f003 is the pilot with Female_Adult_03's
head; every avatar of a sex has the same skeleton, so a head fits any body), and tags retouch
it: HAIR recolours the hair, CLOTH the clothes, TOP the top, PATTERN prints a pattern over it, "bare"
takes off a hat or helmet, "plain" covers lettering and badges (INSIGNIA), SUIT dresses a
swimmer's bare body in lycra or neoprene (a stinger suit, a rash vest and boardshorts, a
wetsuit); a swapped head's skin tone carries to the hands. The NPCs carry no clips of their own: one file per sex
(R_clips_f.glb, R_clips_m.glb) holds the gestures and what each NPC does while it waits
(NPC_CLIPS, city.json look.clip), and drives them all. The reef and alpine sites (web/reef)
cast their people and the visitor you play from the same avatars; someone who runs there
takes FIELD_CLIPS, in a second small file per sex (R_clips_field_f.glb, R_clips_field_m.glb).

    pip install bpy==5.2.3                       # Blender as a Python module
    python pipeline/fetch_rocketbox.py           # the avatars and clips, into data/raw/rocketbox (once)
    python blender/build_people.py --preview     # -> web/assets/people/H_*.glb, docs/images/people/
    python blender/build_people.py --npcs        # -> web/assets/people/R_*.glb (--only R_... for some)

Rocketbox is (c) 2020 Microsoft under the MIT licence; web/assets/people/LICENSE-Rocketbox.txt
carries its notice.
"""
import argparse
import glob
import json
import math
import os
import re
import struct
import subprocess
import sys

import bpy

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pipeline"))
from meshopt import compress  # noqa: E402  (meshopt-compress each model written: issue 148)
import numpy as np
from mathutils import Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RB = os.path.join(ROOT, "data", "raw", "rocketbox", "Assets")
FPS = 30
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
from fetch_rocketbox import face_cast, npc_cast  # noqa: E402  (the cities' NPC characters, and who of them speaks; no bpy there)

# the game's clip name -> the Rocketbox clip (f_ or m_ prefixed by the avatar's sex) and its folder:
# 'static' clips stand in place, 'xy' clips carry their root motion on a separate helper. The game
# runs at 4.5 m/s and sprints at 7, so both use the 5.4 m/s fast run (the 2.8 m/s jog would race)
CLIPS = {"Idle": ("idle_neutral_01", "static"), "Idle_Neutral": ("idle_neutral_02", "static"),
         "Walk": ("walk_neutral_01", "xy"), "Run": ("run_fast_01", "xy"), "Sprint": ("run_fast_01", "xy"),
         "Wave": ("wave_01", "static"), "Talk": ("gestic_talk_neutral_01", "static"),
         "Listen": ("gestic_listen_neutral_01", "static"), "Nod": ("gestic_listen_accept_01", "static"),
         "Interact": ("documents_check", "static")}
LOOPS = {"Idle", "Idle_Neutral", "Walk", "Run", "Sprint", "Talk", "Listen"}
MAX_FRAMES = 12 * FPS
LOOP_BLEND = 24   # frames

# Kagami 鏡 (docs/STORY.md section 5), a photographer of streets in Tokyo, about thirty: one person as a woman or a man.
# head: the avatar whose head (face, scalp and hair) the body wears; tags: as an NPC's (HAIR...); dress: [part, colour,
# (seed)] (DRESS_BONES, sRGB), each part's cloth (or the garment of the seed's colour on it) taken to the colour with its
# folds; camera: the camera round the neck (neck_camera).
# Dressed as Tokyo dresses in October, and as the one who looks into things: camel over black, the colours of a
# trench coat and a black turtleneck, the detective's and the artist's. Clean lines, nothing printed, light over dark,
# no more than four colours, shoes to walk an evening in. She: a camel double-breasted jacket (it reads as a short
# trench) over a plain black turtleneck (its stripes taken out), black wide trousers and flats, her own long black hair,
# lying over the camera's strap (Female_Adult_03's face: Yuna wears another, so that they are not twins at the lift,
# and the crowd's near walkers leave out the faces Kagami wears, game.js realCast). He: a camel chore jacket over a
# black shirt open on a black T-shirt (the brick check taken to black), black denim and dark brown shoes
# (Male_Adult_10's face: Taro on the roof wears another now). Neither body is in the crowd's cast or on anyone the
# story names (docs/STORY.md "Who you are, to look at").
# (the colours, sRGB, written out since pipeline/fetch_rocketbox.py reads this table as a literal: camel
# (0.58, 0.48, 0.34); soft black (0.07, 0.07, 0.075), from her knit's grey and white (0.6, 0.6, 0.6) and his shirt's brick
# (0.39, 0.23, 0.18); black denim (0.11, 0.11, 0.12); dark brown (0.09, 0.066, 0.052), from the shoes' (0.15, 0.106,
# 0.086): the feet's own middle is the trousers' hems)
CHARACTERS = {
    "H_Kagami_W": {"label": "Kagami (woman)", "avatar": "Professions/Business_Female_02", "head": "Adults/Female_Adult_03",
                   "tags": [], "dress": [["top", [0.58, 0.48, 0.34]], ["chest", [0.07, 0.07, 0.075], [0.6, 0.6, 0.6], 0.1]],
                   "camera": True, "sex": "f"},
    "H_Kagami_M": {"label": "Kagami (man)", "avatar": "Adults/Male_Adult_07", "head": "Adults/Male_Adult_10",
                   "tags": [], "dress": [["top", [0.58, 0.48, 0.34]], ["top", [0.07, 0.07, 0.075], [0.39, 0.23, 0.18], 0.25],
                                         ["legs", [0.11, 0.11, 0.12]], ["feet", [0.09, 0.066, 0.052], [0.15, 0.106, 0.086]]], "camera": True,
                   "sex": "m"},
}

# the NPCs' clips: the main characters' gestures (NPC_BASE, in every NPC's file), and what an NPC
# does while it waits (city.json look.clip; in a sex's file when one of its NPCs uses it)
NPC_CLIPS = {"Idle": ("idle_neutral_01", "static"), "Idle_Neutral": ("idle_neutral_02", "static"),
             "Walk": ("walk_neutral_01", "xy"), "Wave": ("wave_01", "static"), "Talk": ("gestic_talk_neutral_01", "static"),
             "Listen": ("gestic_listen_neutral_01", "static"), "Nod": ("gestic_listen_accept_01", "static"),
             "Documents": ("documents_note", "static"), "Reading": ("documents_check", "static"),
             "Phone": ("cell_phone_textmessage", "static"), "Photo": ("take_picture", "static"), "Work": ("work_mid", "static"),
             "Drink": ("drink_idle", "static"), "Stretch": ("idle_stretch_arms_01", "static"),
             "Present": ("gestic_presentation_left_01", "static"), "Cheer": ("cheer_01", "static"),
             "LookAround": ("idle_look_around_01", "static"), "Thoughtful": ("gestic_thoughtful_01", "static")}
NPC_BASE = ["Idle", "Idle_Neutral", "Walk", "Wave", "Talk", "Listen", "Nod"]
# what the visitor you play at a reef or alpine site needs beyond those (web/reef/people.js): the fast run
FIELD_CLIPS = {"Run": ("run_fast_01", "xy")}
LOOPS |= set(NPC_CLIPS) - {"Wave", "Nod"}   # what an NPC does while it waits goes round and round
# hair tags: the colour the hair takes, in sRGB; and the brows' (BROW): an old face's brows go grey later and thinner
# than its hair, and are never white against the skin. The lashes keep their own colour. Sumiko at 84 had white brows
# and white lashes round dark eyes, and her face read as a mask, not as an old Japanese woman's (issue 34)
HAIR = {"grey": (0.60, 0.60, 0.62), "white": (0.80, 0.80, 0.80), "brown": (0.33, 0.19, 0.10)}
BROW = {"grey": (0.31, 0.30, 0.30), "white": (0.42, 0.41, 0.41), "brown": (0.24, 0.14, 0.08)}
# cloth tags: light, unsaturated cloth (a white shirt or robe) dyed this colour
CLOTH = {"dark": (0.085, 0.085, 0.095), "navy": (0.07, 0.09, 0.17)}
# top tags: the top's own colour (a coloured shirt) taken to this one, its folds kept: a ranger's khaki
TOP = {"khaki": (0.50, 0.46, 0.33)}
# suit tags, for an avatar with a bare body (the swimmers, Sports_Male_01 and Sports_Female_01): cloth painted over
# the skin of the body's texture, the hands, feet and head left bare. top and legs in sRGB; legs "ankle" (a full
# suit) or "knee" (shorts over bare shins); arms: another colour for the sleeves; trim: the cuffs and the collar
SUIT = {
    # a stinger suit: full-body lycra, worn on the Great Barrier Reef in the marine stinger season
    "stinger": {"top": (0.086, 0.196, 0.310), "legs": (0.086, 0.196, 0.310), "to": "ankle", "trim": (0.16, 0.42, 0.55)},
    # a long-sleeved rash vest over boardshorts
    "rash": {"top": (0.87, 0.35, 0.19), "legs": (0.114, 0.208, 0.341), "to": "knee", "trim": (0.95, 0.93, 0.88)},
    # a dive instructor's 3 mm wetsuit: black neoprene, blue sleeves
    "wetsuit": {"top": (0.075, 0.08, 0.09), "legs": (0.075, 0.08, 0.09), "to": "ankle", "arms": (0.10, 0.27, 0.42), "trim": (0.03, 0.03, 0.035)},
}
# the "plain" tag: lettering and badges that say who the avatar was (SECURITY, PARAMEDIC, another
# country's flag), and any weapon, go. The badges by texture: boxes (x0, y0, x1, y1, from the top left, as a fraction of the
# texture) each covered with the cloth (dx, dy) beside it
INSIGNIA = {
    "m220_body_color.tga": [(0.095, 0.490, 0.185, 0.550, 0, 0.065), (0.812, 0.490, 0.888, 0.565, 0, 0.08)],   # Police_Male_01's sleeves
    "f170_body_color.tga": [(0.410, 0.222, 0.565, 0.282, 0, -0.065), (0.372, 0.458, 0.442, 0.503, 0, -0.046)],   # Security_Female_01
    "f170_hat_color.tga": [(0.515, 0.745, 0.685, 0.840, 0, -0.1)],
    "f154_body_color_blue.tga": [(0.382, 0.262, 0.608, 0.342, 0, -0.08), (0.545, 0.478, 0.615, 0.555, 0.07, 0),   # Medical_Female_03
                                 (0.820, 0.507, 0.893, 0.593, -0.08, 0)],
}
WEAPON = re.compile(r"_(pistol|shotgun|machinegun|combat_knife)$")   # what "plain" also takes off
# pattern tags: printed over the top (the shirt, jumper or cardigan), as people.js paints the old
# characters' (PAT_GLSL), from where each texel is on the body in the bind pose: three.js model
# space, metres, y up, z forward
PATTERN = {"leopard", "mariniere"}
TOP_BONES = {"Bip01 Spine", "Bip01 Spine1", "Bip01 Spine2", "Bip01 Neck", "Bip01 L Clavicle", "Bip01 R Clavicle",
             "Bip01 L UpperArm", "Bip01 R UpperArm", "Bip01 L Forearm", "Bip01 R Forearm"}
# a main character's dress parts (CHARACTERS "dress"): the bones that move each part's cloth
# (a jacket's skirts hang over the hips and are weighted to the thighs: the top takes them, and the trousers under them
# keep their own colour by their hue; the cuffs are weighted to the hands, whose skin keeps its colour by its hue; a
# trouser's waist is the pelvis's and its hems the feet's)
DRESS_BONES = {"top": TOP_BONES | {"Bip01 Pelvis", "Bip01 L Thigh", "Bip01 R Thigh", "Bip01 L Hand", "Bip01 R Hand"},
               "legs": {"Bip01 L Thigh", "Bip01 R Thigh", "Bip01 L Calf", "Bip01 R Calf", "Bip01 Pelvis", "Bip01 L Foot", "Bip01 R Foot"},
               "feet": {"Bip01 L Foot", "Bip01 R Foot", "Bip01 L Toe0", "Bip01 R Toe0"},
               # (what shows of a knit under a buttoned jacket: the neck and the V of the chest, not the waist, where
               # the trousers have the same grey as its stripes)
               "chest": {"Bip01 Spine1", "Bip01 Spine2", "Bip01 Neck", "Bip01 L Clavicle", "Bip01 R Clavicle"}}

# the old characters' bone names (people.js: accessories, the head turn, the seated legs) on this
# rig, as three.js names its nodes (spaces become underscores)
BONE_ALIAS = {"Head": "Bip01_Head", "Chest": "Bip01_Spine2", "Abdomen": "Bip01_Spine", "Hips": "Bip01_Pelvis", "WristR": "Bip01_R_Hand", "WristL": "Bip01_L_Hand",
              "UpperLeg.L": "Bip01_L_Thigh", "LowerLeg.L": "Bip01_L_Calf", "Foot.L": "Bip01_L_Foot",
              "UpperLeg.R": "Bip01_R_Thigh", "LowerLeg.R": "Bip01_R_Calf", "Foot.R": "Bip01_R_Foot",
              "UpperArm.L": "Bip01_L_UpperArm", "LowerArm.L": "Bip01_L_Forearm", "Wrist.L": "Bip01_L_Hand",
              "UpperArm.R": "Bip01_R_UpperArm", "LowerArm.R": "Bip01_R_Forearm", "Wrist.R": "Bip01_R_Hand"}


def import_fbx(path):
    """The objects an FBX brings in, and its actions."""
    before_o, before_a = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path)
    return [o for o in bpy.data.objects if o not in before_o], [a for a in bpy.data.actions if a not in before_a]


def import_avatar(avatar):
    """An avatar's armature and mesh, its textures relinked from the Textures folder (the FBX
    points at the artists' own paths)."""
    folder = os.path.join(RB, "Avatars", avatar)
    name = os.path.basename(avatar)
    objs, _ = import_fbx(os.path.join(folder, "Export", f"{name}.fbx"))
    arm = next(o for o in objs if o.type == "ARMATURE")
    mesh = next(o for o in objs if o.type == "MESH")
    for o in objs:
        if o.type == "EMPTY":
            bpy.data.objects.remove(o)
    for im in bpy.data.images:
        p = os.path.join(folder, "Textures", os.path.basename(im.filepath))
        if os.path.exists(p) and im.filepath != p:
            im.filepath = p
            im.reload()
    return arm, mesh


def clean_materials():
    """The specular maps (and any texture whose file is missing) go, and every material takes
    one roughness, a plain specular and no metal: the FBX importer leaves Metallic unset, which
    glTF reads as fully metallic, lit only by its reflections."""
    for m in bpy.data.materials:
        for n in list(m.node_tree.nodes):
            if n.type == "TEX_IMAGE" and n.image and ("_specular" in os.path.basename(n.image.filepath) or not os.path.exists(n.image.filepath)):
                m.node_tree.nodes.remove(n)
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Roughness"].default_value = 0.7
            for k, v in (("Metallic", 0.0), ("Specular IOR Level", 0.5)):
                for link in list(bsdf.inputs[k].links):
                    m.node_tree.links.remove(link)
                bsdf.inputs[k].default_value = v


def load_avatar(cid, spec):
    """The avatar's armature, with its mesh, and its specular maps dropped."""
    arm, _ = import_avatar(spec["avatar"])
    clean_materials()
    arm.name = f"{cid}_Rig"
    return arm


def rot(m):
    return m.to_3x3().normalized().to_quaternion()


def copy_clip(src, tgt, action, name, helper=None, helper_action=None, loop=False, still=False):
    """Bake a clip onto the avatar: every bone takes the source bone's world orientation (one
    skeleton design, so the bones' axes agree), the pelvis the source's position less its
    forward drift, and the rest follows the avatar's own bone lengths. Returns the action, its
    length in frames and the ground speed (m/s) from the extracted root motion, if any. A clip
    that stands still is cut to MAX_FRAMES and keyed every second frame (it moves slowly); if it
    loops, it eases back into its first pose over its last LOOP_BLEND frames, so it doesn't jump."""
    sc = bpy.context.scene
    src.animation_data_create()
    src.animation_data.action = action
    if action.slots:
        src.animation_data.action_slot = action.slots[0]
    if helper is not None and helper_action is not None:
        helper.animation_data_create()
        helper.animation_data.action = helper_action
        if helper_action.slots:
            helper.animation_data.action_slot = helper_action.slots[0]
    f0, f1 = (int(round(x)) for x in action.frame_range)
    if still:
        f1 = min(f1, f0 + MAX_FRAMES)       # long idles and gestures, cut to a loop's length
    last = f1 - 1 if loop else f1          # a loop's last frame repeats its first
    Mt = tgt.matrix_world.copy()
    Mt_inv, Mt_rot_inv = Mt.inverted(), rot(Mt).inverted()
    tb = tgt.data.bones
    # the body's bones; the face's (under the head) keep their rest pose, which keeps the files small
    face = {c.name for c in tb["Bip01 Head"].children_recursive}
    names = sorted((b.name for b in tb if b.name in src.data.bones and b.name not in face), key=lambda n: len(tb[n].parent_recursive))
    pelvis = "Bip01 Pelvis"
    # the pelvis's drift over the clip (an in-place clip should have none), removed linearly
    sc.frame_set(f0); p0 = src.matrix_world @ src.pose.bones[pelvis].head
    sc.frame_set(f1); p1 = src.matrix_world @ src.pose.bones[pelvis].head
    drift = (p1 - p0) / max(1, f1 - f0); drift.z = 0
    speed = 0.0
    if helper is not None:
        sc.frame_set(f0); h0 = helper.matrix_world.translation.copy()
        sc.frame_set(f1); h1 = helper.matrix_world.translation.copy()
        speed = math.hypot(h1.x - h0.x, h1.y - h0.y) / ((f1 - f0) / FPS)
    act = bpy.data.actions.new(name)
    tgt.animation_data_create()
    tgt.animation_data.action = act
    for pb in tgt.pose.bones:
        pb.rotation_mode = "QUATERNION"
    prev, keyed = {}, {}
    for f in sorted(set(range(f0, last + 1, 2 if still else 1)) | {last}):
        sc.frame_set(f)
        Ms = src.matrix_world.copy()
        P = {}
        for n in names:
            b = tb[n]
            r = Mt_rot_inv @ rot(Ms @ src.pose.bones[n].matrix)
            par = b.parent
            Pp = P.get(par.name, par.matrix_local) if par else None
            if n == pelvis:
                head = Mt_inv @ ((Ms @ src.pose.bones[n].head) - drift * (f - f0))
            elif par:
                head = (Pp @ par.matrix_local.inverted() @ b.matrix_local).translation
            else:
                head = b.head_local.copy()
            P[n] = Matrix.Translation(head) @ r.to_matrix().to_4x4()
            L = (b.matrix_local.inverted() @ par.matrix_local @ Pp.inverted() @ P[n]) if par else b.matrix_local.inverted() @ P[n]
            q = L.to_quaternion()
            if n in prev and prev[n].dot(q) < 0:
                q.negate()
            prev[n] = q
            pb = tgt.pose.bones[n]
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=f - f0)
            keyed.setdefault(f, {})[n] = (q.copy(), L.translation.copy() if n == pelvis else None)
            if n == pelvis:
                pb.location = L.translation
                pb.keyframe_insert("location", frame=f - f0)
    if loop and still:   # ease the end into the start (a no-op where the clip already loops)
        first = keyed[f0]
        for f, pose in keyed.items():
            w = (f - (last - LOOP_BLEND)) / LOOP_BLEND
            if w <= 0:
                continue
            w = w * w * (3 - 2 * w)
            for n, (q, loc) in pose.items():
                q0, loc0 = first[n]
                if q0.dot(q) < 0:
                    q0 = -q0
                pb = tgt.pose.bones[n]
                pb.rotation_quaternion = q.slerp(q0, w)
                pb.keyframe_insert("rotation_quaternion", frame=f - f0)
                if loc is not None:
                    pb.location = loc.lerp(loc0, w)
                    pb.keyframe_insert("location", frame=f - f0)
    tgt.animation_data.action = None
    return act, last - f0, speed


def animate(rig, sex, clips=CLIPS):
    """Every clip in clips on the character, as NLA tracks named for the game, and the ground
    speed of the walk, run and sprint."""
    sc = bpy.context.scene
    sc.render.fps = FPS
    speeds = {}
    for game_name, (clip, kind) in clips.items():
        path = os.path.join(RB, "Animations", f"all_animations_max_motextr_{kind}", f"{sex}_{clip}.max.fbx")
        if not os.path.exists(path):
            print("  no clip", path); continue
        objs, acts = import_fbx(path)
        src = next(o for o in objs if o.type == "ARMATURE")
        helper = next((o for o in objs if o.name.startswith("MotionExtractionHelper")), None)
        action = next(a for a in acts if a.name.startswith(src.name + "|"))
        h_action = next((a for a in acts if helper and a.name.startswith(helper.name + "|")), None)
        act, n, speed = copy_clip(src, rig, action, game_name, helper, h_action, loop=game_name in LOOPS, still=kind == "static")
        if game_name in ("Walk", "Run", "Sprint"):
            speeds[game_name] = round(speed, 3)
        track = rig.animation_data.nla_tracks.new()
        track.name = game_name
        track.strips.new(game_name, 0, act)
        for o in objs:
            bpy.data.objects.remove(o)
    return speeds


# ------------------------------------------------------------------ export
def export(rig, path, colour_px=1024, data_px=512, mesh=True, clips=True, shared=False):
    """The character as glTF binary: the rig, its mesh (unless not mesh: a file of clips) and
    its clips (unless not clips: an NPC, which takes its sex's); textures shrunk to colour_px
    (normal maps to data_px) and written as WebP. shared: the clips drive other avatars (see
    slim_glb)."""
    for im in bpy.data.images:
        w, h = im.size
        f = os.path.basename(im.filepath)
        lim = data_px if "_normal" in im.name + f else colour_px // 2 if not clips and "_opacity" in f else colour_px
        if max(w, h) > lim:
            im.scale(max(1, lim * w // max(w, h)), max(1, lim * h // max(w, h)))
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for c in rig.children:
        c.select_set(mesh)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_skins=True,
                              export_animations=clips, export_animation_mode="NLA_TRACKS", export_optimize_animation_size=True,
                              export_image_format="WEBP", export_image_quality=80, export_morph=True, export_morph_normal=False,
                              export_morph_tangent=False, export_try_sparse_sk=False, export_yup=True,
                              **({} if clips and mesh else {"export_vertex_color": "NONE"}))
    before = os.path.getsize(path)
    slim_glb(path, shared=shared, quantize=not clips)
    embed_masks(path)
    MASKS.clear()
    compress(path)
    print(f"wrote {path} ({os.path.getsize(path) / 1e6:.2f} MB; {before / 1e6:.2f} MB as exported)")


def quantize_mesh(j, buf):
    """Store the mesh's normals as normalised bytes (KHR_mesh_quantization), its texture
    coordinates as normalised 16-bit integers and its skin weights as normalised bytes that
    still add up to one: about half the mesh's size, nothing anyone can see. The new data goes
    at the end of buf (a bytearray); the float data is left for the repack to drop."""
    acc, bvs = j["accessors"], j["bufferViews"]
    width = {"VEC2": 2, "VEC3": 3, "VEC4": 4}
    def read(a):
        v = bvs[a["bufferView"]]
        return np.frombuffer(bytes(buf), dtype="<f4", count=a["count"] * width[a["type"]],
                             offset=v.get("byteOffset", 0) + a.get("byteOffset", 0)).reshape(a["count"], -1)
    def add(arr, ctype, typ, stride=None):
        buf.extend(b"\0" * (-len(buf) % 4))
        bvs.append({"buffer": 0, "byteOffset": len(buf), "byteLength": arr.nbytes, **({"byteStride": stride} if stride else {})})
        buf.extend(arr.tobytes())
        acc.append({"bufferView": len(bvs) - 1, "componentType": ctype, "count": len(arr), "type": typ, "normalized": True})
        return len(acc) - 1
    done = {}
    for m in j.get("meshes", []):
        for pr in m["primitives"]:
            at = pr["attributes"]
            for k in ("TEXCOORD_1", "COLOR_0", "COLOR_1"):
                at.pop(k, None)
            for k in ("NORMAL", "TEXCOORD_0", "WEIGHTS_0"):
                if k not in at or acc[at[k]]["componentType"] != 5126:
                    continue
                if at[k] in done:
                    at[k] = done[at[k]]
                    continue
                v = read(acc[at[k]])
                if k == "NORMAL":   # padded to four bytes a vertex, as attributes must be
                    q = np.zeros((len(v), 4), dtype="i1")
                    q[:, :3] = np.round(v / np.linalg.norm(v, axis=1, keepdims=True).clip(1e-6) * 127)
                    q = add(q, 5120, "VEC3", stride=4)
                elif k == "TEXCOORD_0":
                    if v.min() < 0 or v.max() > 1:
                        continue
                    q = add(np.round(v * 65535).astype("<u2"), 5123, "VEC2")
                else:
                    w = np.round(v / v.sum(1, keepdims=True).clip(1e-6) * 255).astype(np.int32)
                    w[np.arange(len(w)), w.argmax(1)] += 255 - w.sum(1)   # the largest takes the rounding
                    q = add(w.astype("u1"), 5121, "VEC4")
                done[at[k]] = q
                at[k] = q
    j.setdefault("extensionsUsed", []).append("KHR_mesh_quantization")
    j.setdefault("extensionsRequired", []).append("KHR_mesh_quantization")


def slim_glb(path, eps=1e-5, shared=False, quantize=False):
    """Drop the animation channels that hold the node's own value throughout (the exporter bakes
    every bone's translation, rotation and scale on every frame, the face's included), which is
    what three.js shows without them, then repack the binary. Hair cards (the *_opacity
    materials) are cut out at an alpha threshold rather than blended.

    shared: the clips will drive other avatars of the same sex, whose rest pose may not be this
    one's, so a body bone's rotation that holds still is kept as one key rather than dropped,
    and its rotations are stored as normalised 16-bit integers. Translations stay each
    avatar's own (bone lengths), but the pelvis's."""
    data = open(path, "rb").read()
    jlen = struct.unpack("<I", data[12:16])[0]
    j = json.loads(data[20:20 + jlen])
    off = 20 + jlen
    blen = struct.unpack("<I", data[off:off + 4])[0]
    buf = data[off + 8:off + 8 + blen]
    if quantize:
        buf = bytearray(buf)
        quantize_mesh(j, buf)
        buf = bytes(buf)
    acc, bvs, nodes = j["accessors"], j["bufferViews"], j["nodes"]
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
    def values(ai):
        a = acc[ai]
        v = bvs[a["bufferView"]]
        return np.frombuffer(buf, dtype="<f4", count=a["count"] * width[a["type"]],
                             offset=v.get("byteOffset", 0) + a.get("byteOffset", 0)).reshape(a["count"], -1)
    # the face's bones: under the head, each avatar's own
    face, stack = set(), [i for i, n in enumerate(nodes) if n.get("name") == "Bip01 Head"]
    while stack:
        for c in nodes[stack.pop()].get("children", []):
            face.add(c); stack.append(c)
    rest = {"translation": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1]}
    anims = []   # per animation: [(channel target, interpolation, times, values)]
    for anim in j.get("animations", []):
        keep = []
        for ch in anim["channels"]:
            sm = anim["samplers"][ch["sampler"]]
            t, out = values(sm["input"]), values(sm["output"])
            tg = ch["target"]
            own = np.array(nodes[tg["node"]].get(tg["path"], rest[tg["path"]]), dtype=np.float64)
            tol = {"translation": 1e-3, "scale": 1e-4}.get(tg["path"], eps)   # the bake's float noise, in the rig's units
            moves = np.abs(out - own).max() > tol and not (tg["path"] == "rotation" and np.abs(out + own).max() <= tol)
            if moves:
                keep.append((tg, sm.get("interpolation", "LINEAR"), t, out))
            elif shared and tg["path"] == "rotation" and tg["node"] not in face:
                keep.append((tg, "LINEAR", t[:1], out[:1]))
        anims.append(keep)
    # the accessors still in use (meshes, skins), and their buffer views, repacked in order
    refs = set()
    for m in j.get("meshes", []):
        for pr in m["primitives"]:
            refs.update(pr["attributes"].values())
            for tg in pr.get("targets", []):   # (a face's morph targets, add_face)
                refs.update(tg.values())
            if "indices" in pr:
                refs.add(pr["indices"])
    for sk in j.get("skins", []):
        if "inverseBindMatrices" in sk:
            refs.add(sk["inverseBindMatrices"])
    amap = {o: n for n, o in enumerate(sorted(refs))}
    views = sorted({acc[a]["bufferView"] for a in refs} | {im["bufferView"] for im in j.get("images", []) if "bufferView" in im})
    vmap, out_buf = {}, bytearray()
    for o in views:
        v = dict(bvs[o])
        chunk = buf[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]
        out_buf += b"\0" * (-len(out_buf) % 4)
        v["byteOffset"] = len(out_buf)
        out_buf += chunk
        vmap[o] = len(vmap)
        bvs[o] = v
    new_views = [bvs[o] for o in views]
    new_acc = [dict(acc[o], bufferView=vmap[acc[o]["bufferView"]]) for o in sorted(refs)]
    def add(arr, ctype, typ, normalized=False, minmax=False):
        out_buf.extend(b"\0" * (-len(out_buf) % 4))
        new_views.append({"buffer": 0, "byteOffset": len(out_buf), "byteLength": arr.nbytes})
        out_buf.extend(arr.tobytes())
        a = {"bufferView": len(new_views) - 1, "componentType": ctype, "count": len(arr), "type": typ}
        if normalized:
            a["normalized"] = True
        if minmax:
            a["min"], a["max"] = [float(arr.min())], [float(arr.max())]
        new_acc.append(a)
        return len(new_acc) - 1
    for anim, keep in zip(j.get("animations", []), anims):
        times, anim["samplers"], anim["channels"] = {}, [], []
        for tg, interp, t, out in keep:
            tt = np.ascontiguousarray(t, dtype="<f4").reshape(-1)
            key = tt.tobytes()
            if key not in times:   # channels with the same times share them
                times[key] = add(tt, 5126, "SCALAR", minmax=True)
            if shared and tg["path"] == "rotation":   # normalised int16: 1/32767 is finer than the bake
                q = out / np.linalg.norm(out, axis=1, keepdims=True)
                o = add(np.round(q * 32767).astype("<i2"), 5122, "VEC4", normalized=True)
            else:
                o = add(np.ascontiguousarray(out, dtype="<f4"), 5126, {3: "VEC3", 4: "VEC4"}[out.shape[1]])
            anim["samplers"].append({"input": times[key], "output": o, "interpolation": interp})
            anim["channels"].append({"sampler": len(anim["samplers"]) - 1, "target": tg})
    j["bufferViews"], j["accessors"] = new_views, new_acc
    for im in j.get("images", []):
        if "bufferView" in im:
            im["bufferView"] = vmap[im["bufferView"]]
    for m in j.get("meshes", []):
        for pr in m["primitives"]:
            pr["attributes"] = {k: amap[a] for k, a in pr["attributes"].items()}
            if "targets" in pr:
                pr["targets"] = [{k: amap[a] for k, a in tg.items()} for tg in pr["targets"]]
            if "indices" in pr:
                pr["indices"] = amap[pr["indices"]]
    for sk in j.get("skins", []):
        if "inverseBindMatrices" in sk:
            sk["inverseBindMatrices"] = amap[sk["inverseBindMatrices"]]
    for mat in j.get("materials", []):   # hair cards: cut out, both sides
        if mat.get("name", "").endswith("_opacity") and "glasses" not in mat["name"]:
            mat.update(alphaMode="MASK", alphaCutoff=0.4, doubleSided=True)
    out_buf += b"\0" * (-len(out_buf) % 4)
    j["buffers"][0]["byteLength"] = len(out_buf)
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(out_buf)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack("<II", len(out_buf), 0x004E4942)); f.write(out_buf)


def write_people_json(heroes):
    """The main characters in web/assets/people/people.json, under "heroes" (kept apart from the
    crowd's "characters", which the crowd draws from)."""
    path = os.path.join(ROOT, "web", "assets", "people", "people.json")
    info = json.load(open(path))
    info["heroes"] = {
        "note": "The main characters, built by blender/build_people.py from Microsoft Rocketbox avatars and their "
                "motion-captured clips. Textured, so not recoloured per look.",
        "source": "Microsoft Rocketbox (MIT, (c) 2020 Microsoft): avatars and animations; see LICENSE-Rocketbox.txt",
        "bones": BONE_ALIAS,
        "characters": heroes,
    }
    json.dump(info, open(path, "w"), indent=1)
    print("updated", path)


# ------------------------------------------------------------------ the NPCs
HEADISH = re.compile(r"_(head|opacity)$")   # a head's materials: the face and scalp, and the hair cards and lashes
HAT = re.compile(r"_(hat|helmet)$")


def drop_faces(obj, pred):
    """Delete obj's faces whose material's name pred accepts (and what only they used)."""
    import bmesh
    names = [s.name for s in obj.material_slots]
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if pred(names[f.material_index])], context="FACES")
    bm.to_mesh(obj.data)
    bm.free()


def swap_head(arm, mesh, donor):
    """Put the donor avatar's head (face, scalp, hair cards, lashes) on this one in place of its
    own. Every avatar of a sex has the same skeleton, so the donor's head bone is where this
    one's is; the move between them is applied anyway, and its vertex groups join by name."""
    da, dm = import_avatar(donor)
    drop_faces(dm, lambda n: not HEADISH.search(n))
    drop_faces(mesh, lambda n: bool(HEADISH.search(n)) or n.endswith("_glasses"))   # (glasses were made for the old face)
    to = (arm.matrix_world @ arm.data.bones["Bip01 Head"].matrix_local) @ (da.matrix_world @ da.data.bones["Bip01 Head"].matrix_local).inverted()
    dm.data.transform(mesh.matrix_world.inverted() @ to @ dm.matrix_world)
    for md in list(dm.modifiers):
        dm.modifiers.remove(md)
    dm.parent = None
    dm.matrix_world = mesh.matrix_world
    bpy.ops.object.select_all(action="DESELECT")
    dm.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.join()
    bpy.data.objects.remove(da)


def base_image(mat):
    """The image node feeding a material's base colour."""
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    link = bsdf and next(iter(bsdf.inputs["Base Color"].links), None)
    return link.from_node if link and link.from_node.type == "TEX_IMAGE" else None


def pixels(im):
    a = np.empty(im.size[0] * im.size[1] * 4, dtype=np.float32)
    im.pixels.foreach_get(a)
    return a.reshape(im.size[1], im.size[0], 4)   # rows from the bottom, as v runs


def put_pixels(im, px):
    im.pixels.foreach_set(px.astype(np.float32).ravel())
    im.update()


def luma(px):
    return px[..., 0] * 0.299 + px[..., 1] * 0.587 + px[..., 2] * 0.114


def fix_hair_cards(mesh):
    """The hair cards (the *_opacity materials) take their alpha from their own texture's alpha
    (the importer wires the texture's colour to it), and the texels they cut away take the hair's
    colour, so the cut edges don't pick up the magenta the artists left there."""
    for slot in mesh.material_slots:
        mat = slot.material
        if not mat or not mat.name.endswith("_opacity"):
            continue
        node, bsdf = base_image(mat), mat.node_tree.nodes.get("Principled BSDF")
        if not node:
            continue
        for link in list(bsdf.inputs["Alpha"].links):
            if link.from_node.name != node.name:   # (by name: two wrappers of one node are not the same Python object)
                mat.node_tree.nodes.remove(link.from_node)
        mat.node_tree.links.new(node.outputs["Alpha"], bsdf.inputs["Alpha"])
        px = pixels(node.image)
        solid = px[..., 3] > 0.5
        if solid.any():
            px[~solid, :3] = np.median(px[solid, :3], axis=0)
            put_pixels(node.image, px)


def uv_mask(mesh, polys, w, h, grow=4):
    """Where the given faces lie on a w x h texture, grown a few texels (rows from the bottom)."""
    from PIL import Image, ImageDraw, ImageFilter
    im = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(im)
    uv = mesh.data.uv_layers.active.data
    for p in polys:
        d.polygon([(uv[i].uv[0] * w, uv[i].uv[1] * h) for i in p.loop_indices], fill=255)
    if grow:
        im = im.filter(ImageFilter.MaxFilter(2 * grow + 1))
    return np.asarray(im, dtype=np.float32) / 255


def scalp(arm, mesh):
    """The head's faces that carry hair, by where they are in the bind pose: above the brows,
    behind the line of the ears or out beyond the cheeks; the eyes never."""
    bone = lambda n: arm.matrix_world @ arm.data.bones[n].head_local
    eye = (bone("Bip01 REye") + bone("Bip01 LEye")) / 2
    fwd = eye - bone("Bip01 Head")
    fwd.z = 0
    fwd.normalize()
    side = fwd.cross((0, 0, 1))
    eyes = {mesh.vertex_groups[n].index for n in ("Bip01 REye", "Bip01 LEye") if n in mesh.vertex_groups}
    vs, M = mesh.data.vertices, mesh.matrix_world
    out = []
    for p in mesh.data.polygons:
        if not HEADISH.search(mesh.material_slots[p.material_index].name):
            continue
        if any(g.group in eyes and g.weight > 0.3 for i in p.vertices for g in vs[i].groups):
            continue
        c = M @ p.center
        if c.z - eye.z > 0.018 or (c - eye).dot(fwd) < -0.06 or abs((c - eye).dot(side)) > 0.072:
            out.append(p)
    return out


def face_parts(arm, mesh):
    """The head's faces that carry the brows (weighted to the brow bones), the hair cards that are lashes (within
    3.5 cm of an eye: the upper lashes ride the blink bones, the lower the head's), the lids and the sockets round the
    eyes (weighted to an eye's or a blink's bone), and the faces where the ears are (out at the sides, round the line of
    the eyes and behind them: an ear and the hair round it)."""
    names = {g.index: g.name for g in mesh.vertex_groups}
    bone = lambda n: arm.matrix_world @ arm.data.bones[n].head_local
    eyes = [bone("Bip01 REye"), bone("Bip01 LEye")]
    eye = (eyes[0] + eyes[1]) / 2
    fwd = eye - bone("Bip01 Head")
    fwd.z = 0
    fwd.normalize()
    side = fwd.cross((0, 0, 1))
    vs, M = mesh.data.vertices, mesh.matrix_world
    brows, lashes, lids, ears = [], [], [], []
    for p in mesh.data.polygons:
        name = mesh.material_slots[p.material_index].name
        if name.endswith("_head"):
            w = sum(g.weight for i in p.vertices for g in vs[i].groups if "Eyebrow" in names[g.group]) / len(p.vertices)
            c = M @ p.center - eye
            if any(g.weight > 0.1 and "Eye" in names[g.group] and "Eyebrow" not in names[g.group] for i in p.vertices for g in vs[i].groups):
                lids.append(p)
            elif w > 0.3:
                brows.append(p)
            elif abs(c.dot(side)) > 0.06 and -0.06 < c.z < 0.02 and -0.13 < c.dot(fwd) < -0.04:
                ears.append(p)
        elif name.endswith("_opacity") and min(((M @ p.center) - e).length for e in eyes) < 0.035:
            lashes.append(p)
    return brows, lashes, lids, ears


def skin_faces(mesh, polys, px, size):
    """Of polys, those whose texels round the middle of their place on the texture are skin, not hair: light, or warm
    (the shadowed fold of an ear is as dark as hair, but red where hair is a near-neutral brown)."""
    from PIL import Image, ImageFilter
    blur = lambda a: np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6)), dtype=np.float32) / 255
    Ls, warm = blur(luma(px)), blur((px[..., 0] - px[..., 2]) * 4)
    uv, out = mesh.data.uv_layers.active.data, []
    for p in polys:
        u = sum(uv[i].uv[0] for i in p.loop_indices) / p.loop_total
        v = sum(uv[i].uv[1] for i in p.loop_indices) / p.loop_total
        y, x = min(size[1] - 1, max(0, int(v * size[1]))), min(size[0] - 1, max(0, int(u * size[0])))
        if Ls[y, x] > 0.33 or warm[y, x] > 0.36:
            out.append(p)
    return out


def retouch_hair(arm, mesh, tag):
    """Recolour the hair (HAIR[tag]) where it is painted on the scalp and on the hair cards, and the brows (BROW[tag]),
    keeping each strand's light and dark; the lashes and the ears' skin as they are."""
    polys = scalp(arm, mesh)
    brows, lashes, lids, ears = face_parts(arm, mesh)
    for slot in mesh.material_slots:
        mat = slot.material
        node = mat and base_image(mat)
        if not node or not HEADISH.search(mat.name):
            continue
        px = pixels(node.image)
        L = luma(px)
        size = node.image.size
        mine = lambda ps: [p for p in ps if mesh.material_slots[p.material_index].material is mat]
        parts = []
        if mat.name.endswith("_head"):
            # the dark texels there and just round it (the fringe's ends): hair, not skin; the brows apart; and not the
            # folds of an ear, as dark as hair and next to it (they went white in a grey head's ears), nor the dark round
            # the eyes under the lids (it went white, a pale rim at the corners of the eyes)
            brow = uv_mask(mesh, mine(brows), *size, grow=size[0] // 160)
            ear = uv_mask(mesh, skin_faces(mesh, mine(ears), px, size), *size, grow=0)
            lid = uv_mask(mesh, mine(lids), *size, grow=2)
            warm = np.clip((px[..., 0] - px[..., 2] - 0.07) / 0.04, 0, 1)   # (an ear's fold, not the wisps of hair round it)
            region = uv_mask(mesh, mine(polys), *size, grow=size[0] // 40) * (1 - brow) * (1 - ear * warm) * (1 - lid)
            brow = brow * (1 - lid)
            parts = [(region * np.clip((0.40 - L) / 0.18, 0, 1), HAIR[tag]), (brow * np.clip((0.40 - L) / 0.18, 0, 1), BROW[tag])]
        else:   # every dark texel, the cut-away ones too, so the cards' edges don't darken; but the lashes
            lash = uv_mask(mesh, mine(lashes), *size, grow=size[0] // 80)   # (wide: the cut-away texels round a lash are what its filtered edge shows)
            parts = [(np.clip((0.45 - L) / 0.2, 0, 1) * (1 - lash), HAIR[tag])]
        for m, colour in parts:
            if not (m > 0.5).any():
                continue
            new = np.array(colour) * (0.55 + 0.45 * np.clip(L / np.median(L[m > 0.5]), 0.3, 2.2))[..., None]
            px[..., :3] = px[..., :3] * (1 - m[..., None]) + np.clip(new, 0, 1) * m[..., None]
        put_pixels(node.image, px)


def dye(mesh, colour):
    """Light, unsaturated cloth on the body's texture (a white shirt or robe) takes the colour,
    keeping its folds."""
    for slot in mesh.material_slots:
        node = slot.material and not HEADISH.search(slot.material.name) and base_image(slot.material)
        if not node or not slot.material.name.endswith("_body"):
            continue
        px = pixels(node.image)
        L, mx, mn = luma(px), px[..., :3].max(-1), px[..., :3].min(-1)
        m = np.clip((L - 0.42) / 0.2, 0, 1) * np.clip((0.3 - (mx - mn) / (mx + 1e-4)) / 0.12, 0, 1)
        if not (m > 0.5).any():
            continue
        new = np.array(colour) * np.clip(L / np.median(L[m > 0.5]), 0.4, 1.6)[..., None]
        px[..., :3] = px[..., :3] * (1 - m[..., None]) + new * m[..., None]
        put_pixels(node.image, px)


def plain(mesh):
    """Cover the avatar's lettering and badges (INSIGNIA) with the cloth beside them, feathered
    at the edges."""
    done = set()
    for slot in mesh.material_slots:
        for n in (slot.material.node_tree.nodes if slot.material else []):
            im = n.image if n.type == "TEX_IMAGE" else None
            boxes = im and INSIGNIA.get(os.path.basename(im.filepath))
            if not boxes or im.name in done:
                continue
            done.add(im.name)
            px = pixels(im)
            H, W = px.shape[:2]
            for x0, y0, x1, y1, dx, dy in boxes:
                c0, c1, r0, r1 = int(x0 * W), int(x1 * W), int((1 - y1) * H), int((1 - y0) * H)   # rows from the bottom
                sc, sr = int(dx * W), -int(dy * H)
                yy, xx = np.mgrid[r0:r1, c0:c1]
                edge = np.minimum.reduce([xx - c0, c1 - 1 - xx, yy - r0, r1 - 1 - yy]) / max(2, W // 400)
                w = np.clip(edge, 0, 1)[..., None]
                px[r0:r1, c0:c1, :3] = px[r0:r1, c0:c1, :3] * (1 - w) + px[r0 + sr:r1 + sr, c0 + sc:c1 + sc, :3] * w
            put_pixels(im, px)


def position_map(mesh, mat, w, h):
    """Where each texel of a material's w x h texture is on the body in the bind pose (three.js
    model space), and which texels a face covers: every triangle rasterised in UV space."""
    M = mesh.matrix_world
    uv = mesh.data.uv_layers.active.data
    pos = np.zeros((h, w, 3), np.float32)
    cov = np.zeros((h, w), bool)
    mesh.data.calc_loop_triangles()
    for t in mesh.data.loop_triangles:
        if mesh.material_slots[t.material_index].material is not mat:
            continue
        P = np.array([tuple(M @ mesh.data.vertices[v].co) for v in t.vertices])
        P = P[:, [0, 2, 1]] * (1, 1, -1)   # Blender's z-up, -y-forward world to three.js's
        T = np.array([(uv[l].uv[0] * w, uv[l].uv[1] * h) for l in t.loops])
        x0, y0 = np.floor(T.min(0)).astype(int)
        x1, y1 = np.ceil(T.max(0)).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, w - 1), min(y1, h - 1)
        if x1 < x0 or y1 < y0:
            continue
        yy, xx = np.mgrid[y0:y1 + 1, x0:x1 + 1] + 0.5
        (ax, ay), (bx, by), (cx, cy) = T
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-9:
            continue
        l0 = ((by - cy) * (xx - cx) + (cx - bx) * (yy - cy)) / d
        l1 = ((cy - ay) * (xx - cx) + (ax - cx) * (yy - cy)) / d
        l2 = 1 - l0 - l1
        inside = (l0 >= -0.01) & (l1 >= -0.01) & (l2 >= -0.01)
        sub = pos[y0:y1 + 1, x0:x1 + 1]
        sub[inside] = (l0[..., None] * P[0] + l1[..., None] * P[1] + l2[..., None] * P[2])[inside]
        cov[y0:y1 + 1, x0:x1 + 1] |= inside
    return pos, cov


def print_pattern(mesh, kind):
    """Print a pattern over the top: the cloth whose colour is the colour of the body's middle
    (the faces moved only by the spine), not the hands; its folds stay."""
    vs = mesh.data.vertices
    group = lambda names: {mesh.vertex_groups[n].index for n in mesh.vertex_groups.keys() if any(k in n for k in names)}
    torso, hands = group(("Spine",)), group((" Hand", " Finger"))
    weight = lambda i, gs: sum(g.weight for g in vs[i].groups if g.group in gs)
    for slot in mesh.material_slots:
        mat = slot.material
        node = mat and mat.name.endswith("_body") and base_image(mat)
        if not node:
            continue
        w, h = node.image.size
        mine = [p for p in mesh.data.polygons if mesh.material_slots[p.material_index].material is mat]
        px = pixels(node.image)
        seed_m = uv_mask(mesh, [p for p in mine if all(weight(i, torso) > 0.8 for i in p.vertices)], w, h, grow=0) > 0.5
        if seed_m.sum() < 1000:
            continue
        seed = np.median(px[seed_m, :3], axis=0)
        bare = uv_mask(mesh, [p for p in mine if any(weight(i, hands) > 0.3 for i in p.vertices)], w, h, grow=2)
        pos, cov = position_map(mesh, mat, w, h)
        m = cov * np.clip(1 - (np.linalg.norm(px[..., :3] - seed, axis=-1) - 0.08) / 0.06, 0, 1) * (1 - bare)
        if kind in TOP:   # all of the cloth on the trunk and the arms, whatever its folds do to its colour; never the skin
            tops = group(tuple(TOP_BONES) + ("Bip01 Pelvis",))   # (a shirt's tails hang over the hips)
            on_top = uv_mask(mesh, [p for p in mine if sum(weight(i, tops) for i in p.vertices) > 0.5 * len(p.vertices)], w, h, grow=0)
            d = np.linalg.norm(px[..., :3] / np.maximum(luma(px), 0.02)[..., None] - seed / max(luma(seed), 0.02), axis=-1)   # by hue, not by shade
            m = cov * on_top * np.clip(1 - (d - 0.22) / 0.1, 0, 1) * (1 - bare)
        x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
        if kind in TOP:   # the cloth's colour changed, lit as it was
            col = np.array(TOP[kind]) * np.ones_like(pos)
        elif kind == "leopard":   # tan, with black rosettes round brown hearts; the grid of the old characters' shader, warped
            f = 52
            sv = np.sin(x * f + 0.7 * np.sin(y * f * 1.7)) * np.sin(y * f + 1.7 + 0.7 * np.sin(z * f * 1.3)) * np.sin(z * f - 0.6 + 0.7 * np.sin(x * f * 1.9))
            ss = lambda a, b, v: np.clip((v - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((v - a) / (b - a), 0, 1))
            col = np.array([0.79, 0.64, 0.40]) * np.ones_like(pos)
            col = col * (1 - ss(0.07, 0.13, sv))[..., None] + np.array([0.07, 0.06, 0.05]) * ss(0.07, 0.13, sv)[..., None]
            col = col * (1 - ss(0.26, 0.34, sv))[..., None] + np.array([0.42, 0.24, 0.09]) * ss(0.26, 0.34, sv)[..., None]
        else:   # the marinière: Breton stripes, navy on white, round the body
            band = np.clip((np.abs(np.mod(y * 28, 1) - 0.5) - 0.15) / 0.04, 0, 1)
            col = np.array([0.94, 0.93, 0.90]) * (1 - band[..., None]) + np.array([0.10, 0.13, 0.26]) * band[..., None]
        lo, hi = (0.35, 1.6) if kind in TOP else (0.7, 1.25)   # the folds, not a print underneath
        shade = np.clip(luma(px) / max(1e-3, np.median(luma(px)[m > 0.5])), lo, hi)[..., None]
        px[..., :3] = px[..., :3] * (1 - m[..., None]) + np.clip(col * shade, 0, 1) * m[..., None]
        put_pixels(node.image, px)


DRESSED = {}   # a body picture's name -> its pixels before the first dress (cleared for each main character)


def dress(mesh, part, colour, seed=None, flat=0.4):
    """The cloth of a part of the body (DRESS_BONES) taken to colour (sRGB), lit as it was: every texel on that part
    whose hue is the hue of the part's middle (the faces only its own bones move), or of seed (sRGB: another garment
    on the part, as a shirt under a jacket), whatever its folds do to its shade. A garment picked by its seed loses
    most of its own pattern with its colour (a check taken to ecru would read as a print): its shading is softened, to
    the power flat (a stripe taken to plain black: 0.1).
    The sleeve to its cuff, which a Biped weights to the hand (it has no twist bones; the TOP tag leaves the cuffs), but
    not the skin: round the hands, a texel whose hue is nearer the fingers' than the cloth's.
    Another garment on the same part (a shirt under the jacket, a striped knit) has another hue and keeps it."""
    vs = mesh.data.vertices
    second = seed is not None
    group = lambda names: {mesh.vertex_groups[n].index for n in mesh.vertex_groups.keys() if n in names or any(k in n for k in names if k.startswith(" "))}
    bones, hands = group(DRESS_BONES[part]), group((" Hand", " Finger"))
    middle = group({"top": {"Bip01 Spine", "Bip01 Spine1", "Bip01 Spine2"}, "legs": {"Bip01 L Thigh", "Bip01 R Thigh"}, "feet": DRESS_BONES["feet"],
                    "chest": {"Bip01 Spine1", "Bip01 Spine2"}}[part])
    weight = lambda i, gs: sum(g.weight for g in vs[i].groups if g.group in gs)
    for slot in mesh.material_slots:
        mat = slot.material
        node = mat and mat.name.endswith("_body") and base_image(mat)
        if not node:
            continue
        w, h = node.image.size
        mine = [p for p in mesh.data.polygons if mesh.material_slots[p.material_index].material is mat]
        px = pixels(node.image)
        src = DRESSED.setdefault(node.image.name, px.copy())   # (every part is found on the picture as the artists painted it)
        seed_m = uv_mask(mesh, [p for p in mine if all(weight(i, middle) > 0.8 for i in p.vertices)], w, h, grow=0) > 0.5
        if seed_m.sum() < 1000:
            continue
        seed = np.median(src[seed_m, :3], axis=0) if seed is None else np.array(seed, np.float32)
        on = uv_mask(mesh, [p for p in mine if sum(weight(i, bones) for i in p.vertices) > 0.5 * len(p.vertices)], w, h, grow=1)
        hue = lambda c: c / np.maximum(luma(c), 0.02)[..., None]
        d = np.linalg.norm(hue(src[..., :3]) - hue(seed[None, None])[0, 0], axis=-1)   # by hue, not by shade
        m = on * np.clip(1 - (d - 0.22) / 0.1, 0, 1)
        fingers = uv_mask(mesh, [p for p in mine if all(weight(i, hands) > 0.9 for i in p.vertices)], w, h, grow=0) > 0.5
        if fingers.sum() > 200 and part != "feet":   # the skin, by the colour of the fingers: on and round the hands, a
            # texel nearer it than the cloth is skin (nowhere else: a brown check's dark lines are as near the skin's hue)
            skin = np.median(src[fingers, :3], axis=0)
            near = uv_mask(mesh, [p for p in mine if any(weight(i, hands) > 0.3 for i in p.vertices)], w, h, grow=4) > 0.5
            m *= ~near | (np.linalg.norm(hue(src[..., :3]) - hue(skin[None, None])[0, 0], axis=-1) > d)
        if not (m > 0.5).any():
            continue
        shade = np.clip(luma(src) / max(1e-3, np.median(luma(src)[m > 0.5])), 0.35, 1.6)[..., None]
        if second:
            shade = shade ** flat
        px[..., :3] = px[..., :3] * (1 - m[..., None]) + np.clip(np.array(colour) * shade, 0, 1) * m[..., None]
        put_pixels(node.image, px)


def neck_camera(arm, mesh):
    """A camera hung round the neck, the way a working photographer carries one between pictures: a black digital SLR
    with a standard zoom on a black strap, resting on the chest with its lens tipped down by its weight. It says from
    the front and from the side what Kagami does for a living, and it hangs where the arms do not swing (a bag on the
    hip was in the hand's way at every step). The strap goes round the back of the neck on the collar, over the
    collarbones and down to the camera's lugs, kept just off the cloth and under the hair; it is weighted as the
    cloth under it is, blended into the chest over its last 12 cm, and the camera rides on the chest (Spine2). Made in
    the bind pose and joined to the body's mesh, so it is skinned with it. No maker's shape or name: a camera's form.
    Also the strap for the camera of 1964 (camera_strap1964, which the page shows once Sumiko has given it, and hides
    till then), and where that camera rests on the chest ("old": its middle and its axes, in three.js's model space:
    x to the holder's left, y up, z out of the lens), with this one's lugs and frame."""
    import bmesh
    from mathutils import Vector, Matrix
    from mathutils.bvhtree import BVHTree
    M = mesh.matrix_world
    bone = lambda n: arm.matrix_world @ arm.data.bones[n].head_local
    up = Vector((0, 0, 1))
    fwd = (bone("Bip01 REye") + bone("Bip01 LEye")) / 2 - bone("Bip01 Head")
    fwd.z = 0
    fwd.normalize()
    left = up.cross(fwd).normalized()
    vs = mesh.data.vertices
    names = {g.index: g.name for g in mesh.vertex_groups}
    W = [M @ v.co for v in vs]
    mesh.data.calc_loop_triangles()
    ARMS = (" UpperArm", " Forearm", " Hand", " Finger")
    on_arm = lambda i: sum(g.weight for g in vs[i].groups if any(k in names[g.group] for k in ARMS))
    mat_of = lambda t: mesh.material_slots[t.material_index].name
    # what the strap and the camera lie on: the body and the neck's skin, not the arms (out from the body in the bind
    # pose), the hair cards or the face
    rest = [t for t in mesh.data.loop_triangles if not mat_of(t).endswith("_opacity") and sum(on_arm(i) for i in t.vertices) < 0.5]
    body_tris = [t for t in rest if not mat_of(t).endswith("_head")]
    bvh = BVHTree.FromPolygons(W, [tuple(t.vertices) for t in rest])
    bvh_body = BVHTree.FromPolygons(W, [tuple(t.vertices) for t in body_tris])

    def off(p, gap, n_iter=3):
        """p, lifted out of the body to gap over its nearest surface where it lies nearer or inside."""
        for _ in range(n_iter):
            h, nrm, _, _ = bvh.find_nearest(p)
            if h is None:
                return p
            s = (p - h).dot(nrm)
            if s >= gap:
                return p
            p = p + nrm * (gap - s)
        return p

    # the camera: its back to the chest 26 cm under the base of the neck, tipped 38 degrees, lens down
    neck = bone("Bip01 Neck")
    z_cam = neck.z - 0.26
    front = 0.0
    for dx in (-0.08, -0.04, 0.0, 0.04, 0.08):
        for dz in (0.06, 0.0, -0.06):
            o = Vector((neck.x, neck.y, z_cam + dz)) + left * dx
            hit = bvh_body.ray_cast(o + fwd * 0.5, -fwd)[0]
            if hit is not None:
                front = max(front, (hit - neck).dot(fwd))
    tilt = math.radians(38)
    A = (fwd * math.cos(tilt) - up * math.sin(tilt)).normalized()   # the lens's axis
    T = (up * math.cos(tilt) + fwd * math.sin(tilt)).normalized()   # the camera's top
    R = -left                                                       # its right, as the one carrying it holds it
    BW, BH, BD = 0.136, 0.094, 0.07
    # the body's back corners 1.2 cm off the cloth: the nearest of them sets how far out the camera hangs
    base = Vector((neck.x, neck.y, z_cam)) + fwd * front
    back = min(((base + R * (sx * BW / 2) + T * (sy * BH / 2) - A * (BD / 2)) - base).dot(fwd) for sx in (-1, 1) for sy in (-1, 1))
    C = base + fwd * (0.012 - back)
    verts, faces, kinds = [], [], []

    def add(bm, kind, frame):
        """bmesh's geometry, in the frame (a 4x4 to the world), as faces of kind."""
        b0 = len(verts)
        bm.verts.index_update()
        verts.extend(frame @ v.co for v in bm.verts)
        for f in bm.faces:
            faces.append(tuple(b0 + v.index for v in f.verts)); kinds.append(kind)
        bm.free()

    def frame_at(c):
        return Matrix(((R.x, T.x, A.x, c.x), (R.y, T.y, A.y, c.y), (R.z, T.z, A.z, c.z), (0, 0, 0, 1)))

    def block(c, w, h, d, kind, bevel):
        """A box w x h x d (right, top, lens) at c in the camera's frame, its edges chamfered."""
        bm = bmesh.new()
        for x in (-1, 1):
            for y in (-1, 1):
                for z in (-1, 1):
                    for k in range(3):
                        p = [x * w / 2, y * h / 2, z * d / 2]
                        p[k] -= (x, y, z)[k] * bevel
                        bm.verts.new(p)
        bmesh.ops.convex_hull(bm, input=bm.verts)
        add(bm, kind, frame_at(C + R * c[0] + T * c[1] + A * c[2]))

    def ring(z0, length, r0, r1, kind, segs=28):
        """A ring of the lens from z0 along the axis: radius r0 at its back, r1 at its front."""
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r0, radius2=r1, depth=length)
        add(bm, kind, frame_at(C + A * (z0 + length / 2)))

    block((0, 0, 0), BW, BH, BD, "camera", 0.012)                       # the body
    block((0.052, -0.004, 0.012), 0.034, 0.088, 0.088, "rubber", 0.012)  # the grip, under the right hand
    block((0, BH / 2 + 0.013, -0.006), 0.062, 0.03, 0.056, "camera", 0.01)   # the prism's housing
    block((0, BH / 2 + 0.027, -0.008), 0.04, 0.012, 0.04, "camera", 0.005)
    block((0, 0.014, BD / 2 + 0.001), 0.072, 0.06, 0.004, "camera", 0.002)   # the mount's plate
    ring(BD / 2 + 0.003, 0.007, 0.034, 0.034, "metal")                      # the mount
    ring(BD / 2 + 0.01, 0.024, 0.036, 0.037, "camera")                      # the barrel
    ring(BD / 2 + 0.034, 0.034, 0.039, 0.039, "rubber")                     # the zoom ring
    ring(BD / 2 + 0.068, 0.006, 0.0385, 0.0385, "metal")                    # a thin line of metal
    ring(BD / 2 + 0.074, 0.022, 0.039, 0.039, "rubber")                     # the focus ring
    ring(BD / 2 + 0.096, 0.012, 0.039, 0.041, "camera")                     # the lens's front
    ring(BD / 2 + 0.108, 0.002, 0.031, 0.031, "glass")                      # the front glass
    for sx in (-1, 1):
        block((sx * (BW / 2 + 0.004), BH / 2 - 0.022, -0.012), 0.008, 0.016, 0.012, "metal", 0.002)   # the strap's lugs
    block((-0.042, BH / 2 + 0.006, -0.01), 0.026, 0.012, 0.026, "rubber", 0.004)   # the dials
    block((0.044, BH / 2 + 0.004, -0.004), 0.03, 0.008, 0.03, "rubber", 0.003)
    n_cam = len(verts)
    lugs = [C + R * (sx * (BW / 2 + 0.006)) + T * (BH / 2 - 0.022) - A * 0.012 for sx in (1, -1)]   # right, left

    # the camera of 1964, once Sumiko has given it (people.js camera1964 draws it; its numbers are in people.json): a light
    # rangefinder hangs flat on the chest, nearly level, its back on the coat where the chest stands furthest out under
    # it, lower than this one; on its own thin leather strap, made here and shown by the page in place of this one
    OW, OH, OD = 0.138, 0.076, 0.032   # (as people.js oldCamera: its lugs at its ends, 1.8 cm over its middle)
    otilt = math.radians(10)
    oA, oT = (fwd * math.cos(otilt) - up * math.sin(otilt)).normalized(), (up * math.cos(otilt) + fwd * math.sin(otilt)).normalized()
    oz, ofront = neck.z - 0.25, 0.0
    for dx in (-0.06, -0.03, 0.0, 0.03, 0.06):
        for dz in (0.035, 0.0, -0.035):
            o = Vector((neck.x, neck.y, oz + dz)) + left * dx
            hit = bvh_body.ray_cast(o + fwd * 0.5, -fwd)[0]
            if hit is not None:
                ofront = max(ofront, (hit - neck).dot(fwd))
    obase = Vector((neck.x, neck.y, oz)) + fwd * ofront
    oback = min(((obase + R * (sx * OW / 2) + oT * (sy * OH / 2) - oA * (OD / 2)) - obase).dot(fwd) for sx in (-1, 1) for sy in (-1, 1))
    oC = obase + fwd * (0.004 - oback)
    olugs = [oC + R * (sx * (OW / 2 + 0.002)) + oT * 0.018 for sx in (1, -1)]   # right, left

    # the straps: round the back of the neck at the collar (a ray in from each side to the outermost cloth or skin), and
    # from each side of the neck straight to the camera's lugs, lifted off the cloth where the line would sink into it.
    # They lie close (GAP), under long hair as a strap does: the hair cards hang further out, and cover them
    GAP = 0.0035
    z_col = neck.z + 0.025
    centre = Vector((neck.x, neck.y, z_col))
    back_arc = []
    for k in range(25):   # from the right side round the back to the left
        a = math.radians(-90 - 180 * k / 24)
        d = (fwd * math.cos(a) + left * math.sin(a)).normalized()
        hit = bvh.ray_cast(centre + d * 0.4, -d)[0]
        if hit is not None:
            back_arc.append(hit + d * GAP)
    if len(back_arc) < 12:
        raise SystemExit("neck_camera: no neck found")

    def strap_line(ends):   # right lug -> right side of the neck -> round the back -> left side -> left lug
        down_r = [off(ends[0] + (back_arc[0] - ends[0]) * (j / 16), GAP) for j in range(0, 16)]
        down_l = [off(back_arc[-1] + (ends[1] - back_arc[-1]) * (j / 16), GAP) for j in range(1, 17)]
        line = down_r + back_arc + down_l
        for _ in range(2):   # a strap's curves, not corners; lifted off again after
            line = [line[0]] + [line[i - 1] * 0.25 + line[i] * 0.5 + line[i + 1] * 0.25 for i in range(1, len(line) - 1)] + [line[-1]]
            line = [line[0]] + [off(p, GAP) for p in line[1:-1]] + [line[-1]]
        return line

    strap_end = []   # for each strap vertex, how far along its strap it is from the nearer end (for the weights)

    def ribbon(line, half, kind):   # 2 mm thick; its width lies along the cloth (across the line and the surface's normal)
        s0 = len(verts)
        for i, c in enumerate(line):
            tan = (line[min(i + 1, len(line) - 1)] - line[max(i - 1, 0)]).normalized()
            h, nrm, _, _ = bvh.find_nearest(c)
            nrm = nrm if h is not None else fwd
            wdir = tan.cross(nrm).normalized()
            for o in (-0.001, 0.001):
                verts.extend([c + nrm * o + wdir * half, c + nrm * o - wdir * half])
        for i in range(len(line) - 1):
            a, b = s0 + i * 4, s0 + (i + 1) * 4
            for q in ((0, 2), (2, 3), (3, 1), (1, 0)):
                faces.append((a + q[0], b + q[0], b + q[1], a + q[1])); kinds.append(kind)
        along = [0.0]
        for i in range(1, len(line)):
            along.append(along[-1] + (line[i] - line[i - 1]).length)
        strap_end.extend(min(t, along[-1] - t) for t in along for _ in range(4))

    lines = [strap_line(lugs), strap_line(olugs)]
    ribbon(lines[0], 0.011, "strap")          # 2.2 cm black webbing
    ribbon(lines[1], 0.0075, "strap1964")     # 1.5 cm brown leather
    # long hair lies over the straps: a hair card's vertex within 3 cm of one is lifted off the body to clear it (fully
    # within 1.5 cm, less further off), so that the cards cover the strap and nothing of it shows through them
    from mathutils.kdtree import KDTree
    kd = KDTree(sum(len(ln) for ln in lines))
    for i, c in enumerate(c for ln in lines for c in ln):
        kd.insert(c, i)
    kd.balance()
    clear, inv_m = GAP + 0.009, M.inverted()
    lifted = 0
    for p in mesh.data.polygons:
        if not mesh.material_slots[p.material_index].name.endswith("_opacity"):
            continue
        for i in p.vertices:
            v = W[i]
            _, _, dist = kd.find(v)
            if dist > 0.03:
                continue
            h, nrm, _, _ = bvh.find_nearest(v)
            if h is None:
                continue
            s_ = (v - h).dot(nrm)
            if s_ < clear:
                k = 1.0 if dist < 0.015 else (0.03 - dist) / 0.015
                W[i] = v + nrm * (clear - s_) * k
                vs[i].co = inv_m @ W[i]
                lifted += 1
    if lifted:
        print(f"  neck_camera: {lifted} hair vertices lifted over the straps")

    me = bpy.data.meshes.new("neck_camera")
    inv = M.inverted()
    me.from_pydata([inv @ v for v in verts], [], faces)
    mats = {}
    for kind, col, rough, metal in (("camera", (0.032, 0.032, 0.034), 0.55, 0.0), ("rubber", (0.022, 0.022, 0.023), 0.9, 0.0),
                                    ("metal", (0.46, 0.46, 0.47), 0.32, 1.0), ("glass", (0.02, 0.026, 0.04), 0.06, 0.0),
                                    ("strap", (0.028, 0.028, 0.03), 0.8, 0.0), ("strap1964", (0.20, 0.11, 0.06), 0.55, 0.0)):
        m = bpy.data.materials.new(f"camera_{kind}")
        m.use_nodes = True
        bsdf = m.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (*[c ** 2.2 for c in col], 1)   # (sRGB to the linear the node takes)
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        me.materials.append(m)
        mats[kind] = len(me.materials) - 1
    for p, kind in zip(me.polygons, kinds):
        p.material_index = mats[kind]
        p.use_smooth = kind in ("strap", "strap1964", "rubber", "metal")
    ob = bpy.data.objects.new("neck_camera", me)
    bpy.context.scene.collection.objects.link(ob)
    ob.matrix_world = M
    groups = {}
    vg = lambda name: groups.get(name) or groups.setdefault(name, ob.vertex_groups.new(name=name))
    for vi, v in enumerate(verts):
        if vi < n_cam:
            vg("Bip01 Spine2").add([vi], 1.0, "REPLACE")
            continue
        near = strap_end[vi - n_cam]
        _, _, ti, _ = bvh_body.find_nearest(v)
        wsum = {}
        for i in body_tris[ti].vertices:
            for g in vs[i].groups:
                wsum[names[g.group]] = wsum.get(names[g.group], 0) + g.weight / 3
        wsum.pop("Bip01 Head", None)   # (the strap does not turn with the head)
        hold = max(0.0, min(1.0, (0.12 - near) / 0.12))
        tot0 = sum(wsum.values()) or 1
        wsum = {k2: w2 / tot0 * (1 - hold) for k2, w2 in wsum.items()}
        wsum["Bip01 Spine2"] = wsum.get("Bip01 Spine2", 0) + hold
        top4 = sorted(wsum.items(), key=lambda kv: -kv[1])[:4]
        tot = sum(w2 for _, w2 in top4) or 1
        for name, w2 in top4:
            vg(name).add([vi], w2 / tot, "REPLACE")
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.join()
    # where the strap meets the camera, and which way its lens and top face, in three.js's model space (glTF's y up:
    # Blender's x, z, -y), for another camera hung on the same strap (people.js camera1964: the one of 1964)
    three = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
    return {"lugs": [three(lugs[0]), three(lugs[1])], "lens": three(A), "top": three(T), "centre": three(C),
            "old": {"centre": three(oC), "x": three(left), "y": three(oT), "z": three(oA)}}


# ------------------------------------------------------------------ what the story's people wear and carry (issue 46)
# The case turns on three things said and, until these, not seen: the girl's one white glove (frame 1, "one glove on";
# the other is in a dead man's fist), the little hat of the store's lift girls (frame 4), and the old woman's handbag,
# which has held his camera every tenth of October for sixty-two years (frame 7). Each is an NPC's tag (glove, liftcap,
# handbag), made in the bind pose from this avatar's own bones and skin, weighted to what carries it and joined to the
# body's mesh, as neck_camera is. Their materials are plain (a colour, no picture): one program for all of them.
ACCESSORY = ("glove", "liftcap", "handbag")


def plain_material(name, rgb, rough, metal=0.0):
    """A material of one colour (sRGB), as the camera's parts are."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*[c ** 2.2 for c in rgb], 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    return m


def join_part(mesh, name, verts, faces, kinds, mats, weights, smooth=()):
    """verts (world space) and faces as a mesh of their own, each face's material by its kind (mats: kind -> (sRGB,
    roughness, metal)), vertex i weighted as weights(i) -> {bone: weight} says, joined to the body's mesh."""
    me = bpy.data.meshes.new(name)
    inv = mesh.matrix_world.inverted()
    me.from_pydata([inv @ v for v in verts], [], faces)
    index = {}
    for kind, (rgb, rough, metal) in mats.items():
        me.materials.append(plain_material(f"{name}_{kind}", rgb, rough, metal))
        index[kind] = len(me.materials) - 1
    for p, kind in zip(me.polygons, kinds):
        p.material_index = index[kind]
        p.use_smooth = kind in smooth
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.matrix_world = mesh.matrix_world
    groups = {}
    for i in range(len(verts)):
        for b, w in weights(i).items():
            (groups.get(b) or groups.setdefault(b, ob.vertex_groups.new(name=b))).add([i], w, "REPLACE")
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.join()


def face_texels(mesh, polys, w, h):
    """Each face's texels on a w x h picture, as a picture of face numbers (0: none; k + 1: polys[k])."""
    from PIL import Image, ImageDraw
    ids = Image.new("I", (w, h), 0)
    d = ImageDraw.Draw(ids)
    uv = mesh.data.uv_layers.active.data
    for k, p in enumerate(polys):
        d.polygon([(uv[i].uv[0] * w, uv[i].uv[1] * h) for i in p.loop_indices], fill=k + 1)
    return np.asarray(ids, dtype=np.int64)


def glove(arm, mesh, side="R"):
    """One white cotton glove: a shell over the skin of the hand and the fingers, 1.6 mm off it, and on up the wrist to
    a cuff 5 cm above it that stands 3 mm off the skin; weighted as the skin under it, so it bends as the hand does.
    The hand's own skin under it goes (so nothing of it comes through a knuckle, or through the afterimage's exposure,
    which lets what is behind a surface show); the wrist's stays under the cuff."""
    import bmesh
    names = {g.index: g.name for g in mesh.vertex_groups}
    slots, vs, M = mesh.material_slots, mesh.data.vertices, mesh.matrix_world
    body = next(sl.material for sl in slots if sl.material and sl.material.name.endswith("_body"))
    node = base_image(body)
    w, h = node.image.size
    skin = skin_like(pixels(node.image))
    hand, fore = re.compile(rf" {side} (Hand|Finger)"), re.compile(rf" {side} Forearm")
    wrist = arm.matrix_world @ arm.data.bones[f"Bip01 {side} Hand"].head_local
    up = ((arm.matrix_world @ arm.data.bones[f"Bip01 {side} Forearm"].head_local) - wrist).normalized()
    share = lambda p, rx: sum(g.weight for i in p.vertices for g in vs[i].groups if rx.search(names.get(g.group, ""))) / len(p.vertices)
    along = lambda i: ((M @ vs[i].co) - wrist).dot(up)
    bp = [p for p in mesh.data.polygons if slots[p.material_index].material is body]
    cand = [p for p in bp if share(p, hand) > 0.5 or ((share(p, hand) + share(p, fore)) > 0.5 and max(along(i) for i in p.vertices) < 0.05)]
    ids = face_texels(mesh, cand, w, h)
    tot = np.bincount(ids.ravel(), minlength=len(cand) + 1)[1:]
    hit = np.bincount(ids.ravel(), weights=skin.ravel().astype(np.float64), minlength=len(cand) + 1)[1:]
    polys = [p for k, p in enumerate(cand) if tot[k] and hit[k] / tot[k] > 0.5]
    if len(polys) < 40:
        raise SystemExit(f"glove: no {side} hand's skin found ({len(polys)} faces)")
    N = M.to_3x3().inverted().transposed()
    at, verts = {}, []
    for p in polys:
        for i in p.vertices:
            if i not in at:
                k = max(0.0, min(1.0, along(i) / 0.05))
                at[i] = len(verts)
                verts.append(M @ vs[i].co + (N @ vs[i].normal).normalized() * (0.0016 + 0.0014 * k))
    faces = [tuple(at[i] for i in p.vertices) for p in polys]
    src = {v: i for i, v in at.items()}
    weights = lambda j: {names[g.group]: g.weight for g in vs[src[j]].groups if g.weight > 1e-4}
    drop = {p.index for p in polys if share(p, hand) > 0.5}
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in sorted(drop)], context="FACES_ONLY")
    bm.to_mesh(mesh.data)
    bm.free()
    join_part(mesh, "acc_glove", verts, faces, ["cotton"] * len(faces), {"cotton": ((0.86, 0.86, 0.84), 0.9, 0.0)}, weights, smooth=("cotton",))
    print(f"  glove: {len(faces)} faces over the {side} hand's skin ({len(drop)} of its own taken off)")


def tube(verts, faces, kinds, line, r, kind, sides=8):
    """A round tube of radius r along the points of line (world space)."""
    from mathutils import Vector
    base = len(verts)
    for i, c in enumerate(line):
        t = (line[min(i + 1, len(line) - 1)] - line[max(i - 1, 0)]).normalized()
        a = t.cross(Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))).normalized()
        b = t.cross(a)
        for k in range(sides):
            q = 2 * math.pi * k / sides
            verts.append(c + (a * math.cos(q) + b * math.sin(q)) * r)
    for i in range(len(line) - 1):
        for k in range(sides):
            a0, a1 = base + i * sides + k, base + i * sides + (k + 1) % sides
            faces.append((a0, a1, a1 + sides, a0 + sides))
            kinds.append(kind)


def lathe(verts, faces, kinds, frame, profile, rx, ry, kind, segs=40, top=True):
    """A body of revolution in frame (origin, x, y, axis), elliptical (rx, ry at a radius of 1): profile is
    [(height, radius)] from the bottom up; capped at the top if top."""
    o, X, Y, A = frame
    base = len(verts)
    for z, r in profile:
        for k in range(segs):
            q = 2 * math.pi * k / segs
            verts.append(o + A * z + X * (math.cos(q) * rx * r) + Y * (math.sin(q) * ry * r))
    for j in range(len(profile) - 1):
        for k in range(segs):
            a0, a1 = base + j * segs + k, base + j * segs + (k + 1) % segs
            faces.append((a0, a1, a1 + segs, a0 + segs))
            kinds.append(kind)
    if top:
        last = base + (len(profile) - 1) * segs
        faces.append(tuple(last + k for k in range(segs)))
        kinds.append(kind)


def cloth_colour(arm, mesh, rx=r" UpperArm"):
    """The median colour (sRGB) of the body's picture where rx's bones carry it: a jacket's upper sleeves (its front
    is over a shirt). Not told from skin by its colour: a taupe cloth is as warm as a hand."""
    names = {g.index: g.name for g in mesh.vertex_groups}
    slots, vs = mesh.material_slots, mesh.data.vertices
    body = next(sl.material for sl in slots if sl.material and sl.material.name.endswith("_body"))
    node = base_image(body)
    w, h = node.image.size
    px = pixels(node.image)
    bone = re.compile(rx)
    polys = [p for p in mesh.data.polygons if slots[p.material_index].material is body
             and sum(g.weight for i in p.vertices for g in vs[i].groups if bone.search(names.get(g.group, ""))) > 0.6 * len(p.vertices)]
    m = uv_mask(mesh, polys, w, h, grow=0) > 0.5
    return tuple(float(c) for c in np.median(px[m, :3], axis=0))


def lift_cap(arm, mesh):
    """The little hat of the store's lift girls: a pillbox of the jacket's cloth, 13 by 15 cm and 5.5 cm tall, with a
    band of the same a shade darker round its foot, set on the crown a little forward of the bun and tipped forward 10
    degrees, pinned down over the crown as a pillbox sits: its foot as low as the hair under its lowest edge, so that no
    edge of it stands off the head (set on the crown's top alone, it stood on the round of the head like a lid).
    Weighted to the head. No badge."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    M = mesh.matrix_world
    bone = lambda n: arm.matrix_world @ arm.data.bones[n].head_local
    hd, eye = bone("Bip01 Head"), (bone("Bip01 REye") + bone("Bip01 LEye")) / 2
    fwd = eye - hd
    fwd.z = 0
    fwd.normalize()
    up = Vector((0, 0, 1))
    side = fwd.cross(up).normalized()
    W = [M @ v.co for v in mesh.data.vertices]
    mesh.data.calc_loop_triangles()
    tris = [t for t in mesh.data.loop_triangles if HEADISH.search(mesh.material_slots[t.material_index].name)]
    bvh = BVHTree.FromPolygons(W, [tuple(t.vertices) for t in tris])
    crown = hd + fwd * 0.012
    hit = bvh.ray_cast(Vector((crown.x, crown.y, crown.z + 0.5)), Vector((0, 0, -1)))[0]
    if hit is None:
        raise SystemExit("liftcap: no crown found")
    a = math.radians(10)
    A = (up * math.cos(a) + fwd * math.sin(a)).normalized()
    Y = A.cross(side).normalized()   # (forward, square to the tipped axis)
    RX, RY, H = 0.066, 0.076, 0.055
    sink = []
    for k in range(16):   # the hair under the foot's edge, all round: the foot goes down to the lowest of it
        q = 2 * math.pi * k / 16
        p = hit + side * (math.cos(q) * RX * 0.97) + Y * (math.sin(q) * RY * 0.97)
        h = bvh.ray_cast(p + A * 0.3, -A)[0]
        if h is not None:
            sink.append((h - hit).dot(A))
    if len(sink) < 12:
        raise SystemExit(f"liftcap: the head under the cap's edge not found ({len(sink)} of 16)")
    o = hit + A * max(-0.032, min(sink) - 0.002)
    srgb = cloth_colour(arm, mesh)   # (a picture's pixels are as it is stored, sRGB, as HAIR's colours are written into them)
    band = tuple(c * 0.72 for c in srgb)
    verts, faces, kinds = [], [], []
    # the crown of the cap: straight sides, the top's edge rounded over 6 mm
    lathe(verts, faces, kinds, (o, side, Y, A), [(0.0, 1.0), (H - 0.015, 1.0), (H - 0.009, 0.985), (H - 0.0045, 0.95), (H - 0.0015, 0.89), (H, 0.8)],
          RX, RY, "cloth")
    # the band: 1.2 cm, standing 1.5 mm proud of the sides
    lathe(verts, faces, kinds, (o, side, Y, A), [(0.0, 1.022), (0.012, 1.022)], RX, RY, "band", top=False)
    join_part(mesh, "acc_liftcap", verts, faces, kinds, {"cloth": (srgb, 0.85, 0.0), "band": (band, 0.75, 0.0)}, lambda j: {"Bip01 Head": 1.0},
              smooth=("cloth", "band"))
    print(f"  liftcap: on the crown at {tuple(round(v, 3) for v in o)}, {round((o - hit).dot(A) * 100, 1)} cm into the hair at the top, sRGB {tuple(round(c, 3) for c in srgb)}")


def handbag(arm, mesh, side="L"):
    """An old woman's handbag, held by its two handles in the hand (the left: the right waves and talks): black leather
    over a stiff frame, 25 cm wide at the foot and 22 at the top, 19 cm tall and 8.5 cm deep, a brass frame and clasp
    along its top, hanging 10 cm under the grip and off the leg on the back of the hand's side. Weighted to the hand,
    so it hangs as the hand does. Made in the bind pose, where the hand points down and out: its long axis (wrist to
    the middle finger's tip) is the way the bag hangs."""
    from mathutils import Vector
    bone = lambda n: arm.matrix_world @ arm.data.bones[n].head_local
    wrist = bone(f"Bip01 {side} Hand")
    D = (bone(f"Bip01 {side} Finger22") - wrist).normalized()                      # down the hand
    th = bone(f"Bip01 {side} Finger0") - wrist
    T = (th - D * th.dot(D)).normalized()                                          # to the thumb's side
    Nn = D.cross(T).normalized()
    if Nn.dot(Vector((1 if side == "L" else -1, 0, 0))) < 0:                       # the back of the hand: out from the body
        Nn = -Nn
    G = (bone(f"Bip01 {side} Finger2") + bone(f"Bip01 {side} Finger21")) / 2 - Nn * 0.008   # the grip, in the fingers
    top = G + D * 0.10 + Nn * 0.035
    verts, faces, kinds = [], [], []
    # the body: rounded rectangles from its top to its foot, wider and deeper as they go down; the foot closed
    rows = [(0.0, 0.22, 0.045), (0.012, 0.222, 0.055), (0.05, 0.23, 0.07), (0.12, 0.244, 0.082), (0.175, 0.25, 0.085), (0.19, 0.246, 0.08)]
    rr, seg = 0.018, 6

    def section(cw, cd):
        pts = []
        for cx, cy, q0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
            for s in range(seg + 1):
                q = math.radians(q0 + 90 * s / seg)
                r = min(rr, cd / 2 - 1e-3)
                pts.append((cx * (cw / 2 - r) + math.cos(q) * r, cy * (cd / 2 - r) + math.sin(q) * r))
        return pts
    n_ring = len(section(0.2, 0.05))
    base = len(verts)
    for z, cw, cd in rows:
        for x, y in section(cw, cd):
            verts.append(top + D * z + T * x + Nn * y)
    for j in range(len(rows) - 1):
        for k in range(n_ring):
            a0, a1 = base + j * n_ring + k, base + j * n_ring + (k + 1) % n_ring
            faces.append((a1, a0, a0 + n_ring, a1 + n_ring))
            kinds.append("leather")
    for ring, flip in ((0, True), (len(rows) - 1, False)):   # the top under the frame, and the foot
        f = tuple(base + ring * n_ring + k for k in range(n_ring))
        faces.append(tuple(reversed(f)) if flip else f)
        kinds.append("leather")
    # the frame: a brass bar along each long edge of the top, and the clasp's two balls at its middle
    for s in (1, -1):
        tube(verts, faces, kinds, [top + T * (x * 0.105) + Nn * (s * 0.0215) - D * 0.002 for x in (-1, -0.5, 0, 0.5, 1)], 0.0035, "brass", sides=6)
    from mathutils import Matrix
    for s in (1, -1):
        c = top + Nn * (s * 0.004) - D * 0.012
        k0 = len(verts)
        for i in range(5):
            for j in range(8):
                p, q = math.pi * (i + 0.5) / 5 - math.pi / 2, 2 * math.pi * j / 8
                verts.append(c + (D * math.sin(p) + (T * math.cos(q) + Nn * math.sin(q)) * math.cos(p)) * 0.006)
        for i in range(4):
            for j in range(8):
                a0, a1 = k0 + i * 8 + j, k0 + i * 8 + (j + 1) % 8
                faces.append((a0, a1, a1 + 8, a0 + 8))
                kinds.append("brass")
    # the handles: two arcs of rolled leather from the top's ends up through the grip, one each side of it
    for s in (1, -1):
        A0, B0 = top + T * 0.065 + Nn * (s * 0.018), top - T * 0.065 + Nn * (s * 0.018)
        C = 2 * (G + Nn * (s * 0.004)) - (A0 + B0) / 2
        tube(verts, faces, kinds, [A0 * (1 - u) ** 2 + C * 2 * u * (1 - u) + B0 * u ** 2 for u in [i / 16 for i in range(17)]], 0.0045, "leather")
    join_part(mesh, "acc_handbag", verts, faces, kinds, {"leather": ((0.06, 0.055, 0.055), 0.5, 0.0), "brass": ((0.66, 0.55, 0.34), 0.35, 1.0)},
              lambda j: {f"Bip01 {side} Hand": 1.0}, smooth=("leather", "brass"))
    print(f"  handbag: in the {side} hand, hanging along {tuple(round(v, 2) for v in D)}")


def suit(arm, mesh, kind):
    """Dress a bare body (SUIT[kind]): the cloth's colour over the body's texture from the collar
    to the wrists and to the ankles or the knees, by where each texel is on the body in the bind
    pose; the swimwear painted there goes under it, and its seams leave the normal map. (A
    bikini modelled over the body stays, under the cloth: there is no skin beneath its faces.)"""
    S = SUIT[kind]
    vs = mesh.data.vertices
    group = lambda names: {mesh.vertex_groups[n].index for n in mesh.vertex_groups.keys() if any(k in n for k in names)}
    bare_g, arm_g = group((" Hand", " Finger", " Foot", " Toe")), group(("UpperArm", "Forearm"))
    weight = lambda i, gs: sum(g.weight for g in vs[i].groups if g.group in gs)
    bone = lambda n: (arm.matrix_world @ arm.data.bones[n].head_local).z
    neck, waist, knee = bone("Bip01 Neck"), bone("Bip01 Pelvis") + 0.035, bone("Bip01 L Calf")
    for slot in mesh.material_slots:
        mat = slot.material
        # (the head's texture carries the neck and the top of the chest: the collar is on it)
        node = mat and (mat.name.endswith("_body") or mat.name.endswith("_head")) and base_image(mat)
        if not node:
            continue
        w, h = node.image.size
        mine = [p for p in mesh.data.polygons if mesh.material_slots[p.material_index].material is mat]
        px = pixels(node.image)
        bare = uv_mask(mesh, [p for p in mine if sum(weight(i, bare_g) for i in p.vertices) > 0.5 * len(p.vertices)], w, h, grow=0)
        sleeve = uv_mask(mesh, [p for p in mine if sum(weight(i, arm_g) for i in p.vertices) > 0.5 * len(p.vertices)], w, h, grow=0)
        pos, cov = position_map(mesh, mat, w, h)
        y = pos[..., 1]
        hem = knee + 0.07 if S["to"] == "knee" else -1
        on = cov & (bare < 0.5) & (y < neck + 0.012) & (y > hem)
        top = on & ((y >= waist) | (sleeve > 0.5))
        col = np.where(top[..., None], np.array(S["top"]), np.array(S["legs"])) * np.ones_like(pos)
        if "arms" in S:
            col[sleeve > 0.5] = S["arms"]
        from PIL import Image, ImageFilter
        if "trim" in S:   # a band at the collar and, on shorts, the hem; the cuffs are where the bare hands and feet begin
            edge = np.asarray(Image.fromarray(((bare > 0.5) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * max(2, w // 170) + 1))) > 127
            band = on & (edge | (y > neck - 0.006) | ((y < hem + 0.022) if hem > 0 else False))
            col[band] = S["trim"]
        rng = np.random.default_rng(7)
        col = col * (0.97 + 0.06 * rng.random((h, w, 1)))   # the knit, not a flat fill
        px[..., :3] = np.where(on[..., None], col, px[..., :3])
        # the texels just outside the faces take the cloth beside them, so the seams of the UV islands do not show skin
        done = on.copy()
        for _ in range(max(6, w // 48)):
            for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                src = np.roll(done, (dy, dx), (0, 1)) & ~done & ~cov
                px[src, :3] = np.roll(px[..., :3], (dy, dx), (0, 1))[src]
                done |= src
        m = done[..., None]
        put_pixels(node.image, px)
        for n in mat.node_tree.nodes:   # the trunks' or the bikini's seams, and the navel, flattened out of the normal map
            im = n.image if n.type == "TEX_IMAGE" else None
            if im and "_normal" in os.path.basename(im.filepath):
                nx = pixels(im)
                mm = m if nx.shape[:2] == m.shape[:2] else np.asarray(Image.fromarray(done).resize((nx.shape[1], nx.shape[0])))[..., None]
                nx[..., :3] = np.where(mm, nx[..., :3] * 0.12 + np.array([0.5, 0.5, 1.0]) * 0.88, nx[..., :3])
                put_pixels(im, nx)


def skin_like(px):
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    return (r > g) & (g > b) & (r - b > 0.06) & (r > 0.2) & (r < 0.97)


def match_skin(arm, mesh):
    """After a head swap, the body's bare skin (the hands, and arms or legs of the same tone)
    takes the new face's colour, channel by channel: a hand painted for one face would not
    match another's."""
    hands = {mesh.vertex_groups[n].index for n in mesh.vertex_groups.keys() if " Hand" in n or " Finger" in n}
    vs = mesh.data.vertices
    hair = {p.index for p in scalp(arm, mesh)}
    face_ref = body = None
    for slot in mesh.material_slots:
        mat = slot.material
        node = mat and base_image(mat)
        if node and mat.name.endswith("_head"):
            polys = [p for p in mesh.data.polygons if mesh.material_slots[p.material_index].material is mat and p.index not in hair]
            px = pixels(node.image)
            m = (uv_mask(mesh, polys, *node.image.size, grow=0) > 0.5) & skin_like(px) & (luma(px) > 0.3)
            if m.sum() > 500:
                face_ref = np.median(px[m, :3], axis=0)
        elif node and mat.name.endswith("_body"):
            body = (mat, node)
    if face_ref is None or body is None:
        return
    mat, node = body
    polys = [p for p in mesh.data.polygons if mesh.material_slots[p.material_index].material is mat
             and sum(g.weight for i in p.vertices for g in vs[i].groups if g.group in hands) > 0.5 * len(p.vertices)]
    px = pixels(node.image)
    m = (uv_mask(mesh, polys, *node.image.size, grow=0) > 0.5) & skin_like(px)
    if m.sum() < 500:
        return
    ref = np.median(px[m, :3], axis=0)
    near = np.clip(1 - np.linalg.norm(px[..., :3] - ref, axis=-1) / 0.22, 0, 1) * skin_like(px)
    gain = np.clip(face_ref / np.maximum(ref, 0.02), 0.3, 3)
    px[..., :3] = px[..., :3] * (1 - near[..., None]) + np.clip(px[..., :3] * gain, 0, 1) * near[..., None]
    put_pixels(node.image, px)


KEEP = 204   # the alpha of a body texel the crowd's change of clothes leaves as it is: skin (people.js DRESS; cloth is 255)
BARE = re.compile(r" (Hand|Finger|Forearm|UpperArm|Neck|Clavicle|Thigh|Calf|Foot|Toe)")   # the bones a body can be bare on
LEG = re.compile(r" (Thigh|Calf|Foot|Toe)")


def skin_mask(arm, mesh):
    """Mark the bare skin on the body's picture, in its alpha (KEEP; cloth stays 255): what the crowd's change of
    clothes (people.js DRESS) must leave alone (issue 505). The page found skin by its colour alone, so a tan
    waistcoat or a beige coat was taken for skin and never changed, and a dark hand could be taken for cloth and
    dyed. Here skin is this character's own: the colour of its hands (or its face, in gloves), and only where a
    body can be bare and the skin is joined to a hand, to the neck or is on a leg:

    - a face of the body is a candidate when most of its texels have the hands' hue (the share of red and green in
      the colour, which shading does not move) and a lightness near theirs;
    - candidates count when a walk over the mesh through other candidates reaches a hand or the head's edge, or
      when they are on a leg (a skirt's or shorts' bare legs meet no hand);
    - inside those faces, grown a few texels, each texel is tested again, more loosely for the creases, so a
      watch, a ring or a cuff's edge inside the grown area stays cloth.
    Returns the share of the body's texels marked."""
    from PIL import Image, ImageDraw, ImageFilter
    slots = mesh.material_slots
    body = next((sl.material for sl in slots if sl.material and sl.material.name.endswith("_body") and base_image(sl.material)), None)
    if body is None:
        return 0.0
    node = base_image(body)
    w, h = node.image.size
    px = pixels(node.image)
    names = {g.index: g.name for g in mesh.vertex_groups}
    vs, polys = mesh.data.vertices, mesh.data.polygons

    def share(p, rx):   # how much of a face's weight is on the bones rx names
        return sum(g.weight for i in p.vertices for g in vs[i].groups if rx.search(names.get(g.group, ""))) / max(1, len(p.vertices))

    bp = [p for p in polys if slots[p.material_index].material is body]
    hands = [p for p in bp if share(p, re.compile(r" (Hand|Finger)")) > 0.5]
    ref = None
    m = (uv_mask(mesh, hands, w, h, grow=0) > 0.5) & skin_like(px) if hands else None
    if m is not None and m.sum() > 300:
        ref = np.median(px[m, :3], axis=0)
    else:   # gloves: the face's colour, if the legs or arms are bare
        for sl in slots:
            n2 = sl.material and sl.material.name.endswith("_head") and base_image(sl.material)
            if n2:
                hp = pixels(n2.image)
                hm = skin_like(hp) & (luma(hp) > 0.3)
                if hm.sum() > 500:
                    ref = np.median(hp[hm, :3], axis=0)
    if ref is None:
        return 0.0
    hue = lambda c: c[..., :2] / (c[..., :3].sum(-1, keepdims=True) + 1e-4)
    dh = np.linalg.norm(hue(px) - hue(ref), axis=-1)
    ratio = luma(px) / max(1e-4, float(luma(ref)))
    like = skin_like(px) & (dh < 0.035) & (ratio > 0.35) & (ratio < 1.6)
    loose = skin_like(px) & (dh < 0.06) & (ratio > 0.2) & (ratio < 1.9)
    # each face's texels, by a picture of face numbers
    ids = Image.new("I", (w, h), 0)
    d = ImageDraw.Draw(ids)
    uv = mesh.data.uv_layers.active.data
    for k, p in enumerate(bp):
        d.polygon([(uv[i].uv[0] * w, uv[i].uv[1] * h) for i in p.loop_indices], fill=k + 1)
    ids = np.asarray(ids, dtype=np.int64)
    tot = np.bincount(ids.ravel(), minlength=len(bp) + 1)[1:]
    hit = np.bincount(ids.ravel(), weights=like.ravel().astype(np.float64), minlength=len(bp) + 1)[1:]
    frac = hit / np.maximum(1, tot)
    cand = (frac > 0.5) & (tot > 0)
    bare = np.array([share(p, BARE) > 0.3 for p in bp])
    cand &= bare | (frac > 0.9)
    # the faces that meet at a place (the head's are not welded to the body's after a swap: by place, to 2 mm)
    key = lambda i: tuple(np.round(np.array(vs[i].co) * 500).astype(int))
    at = {}
    for k, p in enumerate(bp):
        for i in p.vertices:
            at.setdefault(key(i), []).append(k)
    head_edge = {key(i) for p in polys if HEADISH.search(slots[p.material_index].name) for i in p.vertices}
    hand_set = {p.index for p in hands}
    seeds = [k for k, p in enumerate(bp) if cand[k] and (p.index in hand_set or share(p, LEG) > 0.5 or any(key(i) in head_edge for i in p.vertices))]
    seen, todo = set(seeds), list(seeds)
    while todo:
        k = todo.pop()
        for i in bp[k].vertices:
            for o in at[key(i)]:
                if cand[o] and o not in seen:
                    seen.add(o)
                    todo.append(o)
    # (and on from those through bare faces that pass the looser test: a tanned thigh's shaded side, a forearm's crease)
    lhit = np.bincount(ids.ravel(), weights=loose.ravel().astype(np.float64), minlength=len(bp) + 1)[1:]
    cand2 = bare & (lhit / np.maximum(1, tot) > 0.6) & (tot > 0)
    todo = list(seen)
    while todo:
        k = todo.pop()
        for i in bp[k].vertices:
            for o in at[key(i)]:
                if cand2[o] and o not in seen:
                    seen.add(o)
                    todo.append(o)
    gate = uv_mask(mesh, [bp[k] for k in seen], w, h, grow=3) > 0.5
    skin = gate & loose
    # (specks gone, pinholes filled: a 3 x 3 majority)
    im = Image.fromarray((skin * 255).astype(np.uint8), "L").filter(ImageFilter.MedianFilter(3))
    skin = np.asarray(im) > 127
    MASKS[body.name] = skin[::-1].copy()   # (rows from the top, as a picture file has them; embed_masks writes it into the exported file)
    return float(skin.mean())


MASKS = {}   # a body material's name -> its skin mask (skin_mask), for the file being built


def embed_masks(path):
    """Write each body picture's skin mask (MASKS) into its alpha in the GLB at path, and repack the binary. The
    exporter writes a base colour's picture without an alpha unless the material is see-through, which a body is
    not: the material stays opaque and three.js ignores the alpha, but for the crowd's shader (people.js DRESS)."""
    import io
    from PIL import Image
    data = open(path, "rb").read()
    jlen = struct.unpack("<I", data[12:16])[0]
    j = json.loads(data[20:20 + jlen])
    off = 20 + jlen
    buf = data[off + 8:off + 8 + struct.unpack("<I", data[off:off + 4])[0]]
    new = {}
    for mat in j.get("materials", []):
        mask = MASKS.get(mat.get("name"))
        tex = mat.get("pbrMetallicRoughness", {}).get("baseColorTexture")
        if mask is None or not tex:
            continue
        t = j["textures"][tex["index"]]
        src = t.get("source", t.get("extensions", {}).get("EXT_texture_webp", {}).get("source"))
        v = j["bufferViews"][j["images"][src]["bufferView"]]
        im = Image.open(io.BytesIO(buf[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])).convert("RGB")
        m = Image.fromarray((mask * 255).astype(np.uint8), "L").resize(im.size, Image.BILINEAR)
        a = np.where(np.asarray(m) > 127, KEEP, 255).astype(np.uint8)
        im.putalpha(Image.fromarray(a, "L"))
        b = io.BytesIO()
        im.save(b, "WEBP", quality=80, method=6, exact=True)   # (the alpha itself is kept exactly)
        new[j["images"][src]["bufferView"]] = b.getvalue()
        mat.pop("alphaMode", None)
        mat.pop("alphaCutoff", None)
    if not new:
        return
    out = bytearray()
    for k, v in enumerate(j["bufferViews"]):
        out += b"\0" * (-len(out) % 4)
        chunk = new.get(k, buf[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])
        v["byteOffset"], v["byteLength"] = len(out), len(chunk)
        out += chunk
    out += b"\0" * (-len(out) % 4)
    j["buffers"][0]["byteLength"] = len(out)
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack("<II", len(out), 0x004E4942)); f.write(out)


# ------------------------------------------------------------------ faces that move (issue 12)
# The speaking cast's faces take blendshapes from HeadBox (Volonte et al., 2022: ARKit-style shapes, FACS action units
# and visemes made for the Rocketbox heads, MIT as the library; in the repository as each avatar's *_facial.fbx, the
# same mesh as its *.fbx). Only what web/game/face.js drives is kept, each eye's or side's pair summed into one (the
# page never moves one side alone): a blink, the brows, a smile, a frown, a set mouth, and five mouth shapes for a jaw
# that moves while a line is said (the visemes Rhubarb's mouths map to, issue 11). The face is its own mesh (the head
# and the hair cards with the lashes, which close with the lids), so that the body carries no morph targets: memory
# and vertex work go to the face alone (docs/PERFORMANCE.md). The eyes look with their bones, which every Rocketbox
# avatar has (Bip01 LEye, REye), and need no shape.
FACE_KEYS = {"eyeBlink": ["AK_09_EyeBlinkLeft", "AK_10_EyeBlinkRight"], "eyeSquint": ["AK_19_EyeSquintLeft", "AK_20_EyeSquintRight"],
             "eyeWide": ["AK_21_EyeWideLeft", "AK_22_EyeWideRight"], "browInnerUp": ["AK_03_BrowInnerUp"],
             "browDown": ["AK_01_BrowDownLeft", "AK_02_BrowDownRight"], "browOuterUp": ["AK_04_BrowOuterUpLeft", "AK_05_BrowOuterUpRight"],
             "mouthSmile": ["AK_44_MouthSmileLeft", "AK_45_MouthSmileRight"], "mouthFrown": ["AK_30_MouthFrownLeft", "AK_31_MouthFrownRight"],
             "mouthPress": ["AK_36_MouthPressLeft", "AK_37_MouthPressRight"],
             "viseme_aa": ["AA_VI_10_aa"], "viseme_E": ["AA_VI_11_E"], "viseme_O": ["AA_VI_13_O"], "viseme_U": ["AA_VI_14_U"],
             "viseme_PP": ["AA_VI_01_PP"]}
FACE_NAME = re.compile(r"_(head|opacity)(\.\d+)?$")   # the face's mesh: the head's material and the hair cards' (the lashes)


def add_face(cid, arm, mesh, head):
    """Give the built mesh the blendshapes of the head it wears (head: that avatar's folder, or the body's own), and
    part the head from the body as a mesh of its own. Each shape's offsets are found on the *_facial.fbx's mesh, moved
    where swap_head moved its head, and laid on the built mesh's vertices that lie where that mesh's do (the head is a
    copy of it, so they match to a hair; a vertex that matches none keeps still)."""
    from mathutils.kdtree import KDTree
    name = os.path.basename(head)
    objs, _ = import_fbx(os.path.join(RB, "Avatars", head, "Export", f"{name}_facial.fbx"))
    da = next(o for o in objs if o.type == "ARMATURE")
    dm = next(o for o in objs if o.type == "MESH")
    to = (arm.matrix_world @ arm.data.bones["Bip01 Head"].matrix_local) @ (da.matrix_world @ da.data.bones["Bip01 Head"].matrix_local).inverted()
    M = np.array(mesh.matrix_world.inverted() @ to @ dm.matrix_world)
    kb = dm.data.shape_keys.key_blocks
    co = lambda k: (lambda a: (k.data.foreach_get("co", a), a.reshape(-1, 3))[1])(np.empty(len(k.data) * 3, dtype=np.float32))
    base = co(kb["Basis"]).astype(np.float64)
    deltas = {}
    for out, src in FACE_KEYS.items():
        d = sum(co(kb[k]) - base for k in src)
        deltas[out] = d @ M[:3, :3].T
    base = base @ M[:3, :3].T + M[:3, 3]
    names = [s.name for s in dm.material_slots]
    on = np.zeros(len(base), bool)
    for p in dm.data.polygons:
        if FACE_NAME.search(names[p.material_index]):
            on[list(p.vertices)] = True
    tree = KDTree(int(on.sum()))
    idx = np.nonzero(on)[0]
    for k, i in enumerate(idx):
        tree.insert(base[i], k)
    tree.balance()
    for o in objs:
        bpy.data.objects.remove(o)
    # the built mesh's face vertices, matched to the facial mesh's
    names = [s.name for s in mesh.material_slots]
    face = set()
    for p in mesh.data.polygons:
        if FACE_NAME.search(names[p.material_index]):
            face.update(p.vertices)
    n = len(mesh.data.vertices)
    vco = np.empty(n * 3, dtype=np.float32)
    mesh.data.vertices.foreach_get("co", vco)
    vco = vco.reshape(-1, 3)
    match, miss = {}, 0
    for i in face:
        _, k, d = tree.find(vco[i])
        if d is not None and d < 0.05:   # (half a millimetre: the mesh is in centimetres)
            match[i] = idx[k]
        else:
            miss += 1
    mesh.shape_key_add(name="Basis", from_mix=False)
    ii = np.array(list(match.keys()), dtype=np.int64)
    jj = np.array(list(match.values()), dtype=np.int64)
    for out, d in deltas.items():
        k = mesh.shape_key_add(name=out, from_mix=False)
        a = vco.copy()
        a[ii] += d[jj].astype(np.float32)
        k.data.foreach_set("co", a.reshape(-1))
    moved = int((np.abs(np.stack([d[jj] for d in deltas.values()])).max(axis=(0, 2)) > 1e-4).sum())
    # the head parted from the body, its normals kept as they were across the cut (custom normals: else the cut is seen
    # as a crease in the light)
    me = mesh.data
    cn = np.empty(len(me.loops) * 3, dtype=np.float32)
    me.corner_normals.foreach_get("vector", cn)
    me.normals_split_custom_set(cn.reshape(-1, 3))
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for p in me.polygons:
        p.select = bool(FACE_NAME.search(names[p.material_index]))
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    head_obj = next(o for o in bpy.context.selected_objects if o is not mesh)
    head_obj.name = f"{cid}_Face"
    mesh.shape_key_clear()
    # (each part keeps only the materials it uses: the exporter writes a primitive for each)
    for o in (mesh, head_obj):
        used = {p.material_index for p in o.data.polygons}
        for i in reversed(range(len(o.material_slots))):
            if i not in used:
                o.active_material_index = i
                bpy.context.view_layer.objects.active = o
                bpy.ops.object.material_slot_remove()
    bpy.data.orphans_purge(do_recursive=True)
    print(f"  {cid}: a face of {len(head_obj.data.vertices)} vertices from {name}_facial.fbx, {len(FACE_KEYS)} shapes, "
          f"{moved} vertices move ({miss} of the head's matched none)")
    return head_obj


SKELETON = {}   # sex -> the first NPC's bind pose, to check the others against


def same_skeleton(cid, arm, sex):
    """Warn when an avatar's skeleton differs from the first of its sex: its clips would still
    turn its bones right, but its own bone lengths would show."""
    pose = {b.name: np.array(b.matrix_local) for b in arm.data.bones}
    ref = SKELETON.setdefault(sex, pose)
    worst = max((np.abs(pose[n] - ref[n]).max() for n in pose if n in ref), default=0)
    if worst > 0.05:
        print(f"  {cid}: its skeleton is not the first {sex} NPC's (off by up to {worst:.2f} cm)")


def build_npc(cid, spec):
    """An NPC: the avatar, with the head it wears, without a hat if bare, its hair and clothes
    retouched by its tags."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    arm, mesh = import_avatar(spec["avatar"])
    retouch(cid, arm, mesh, spec["head"], spec["tags"])
    same_skeleton(cid, arm, spec["sex"])
    arm.name = f"{cid}_Rig"
    spec["skin"] = round(skin_mask(arm, mesh), 4)
    return arm, mesh


def retouch(cid, arm, mesh, head, tags):
    """An avatar with another's head (head: its folder), without a hat if bare, its hair and clothes retouched by its
    tags (an NPC's, or a main character's)."""
    spec = {"head": head, "tags": tags}
    if spec["head"]:
        swap_head(arm, mesh, spec["head"])
    if "bare" in spec["tags"]:
        drop_faces(mesh, lambda n: bool(HAT.search(n)))
    clean_materials()
    fix_hair_cards(mesh)
    if spec["head"]:
        match_skin(arm, mesh)
    for tag in spec["tags"]:
        if tag in HAIR:
            retouch_hair(arm, mesh, tag)
        elif tag in CLOTH:
            dye(mesh, CLOTH[tag])
        elif tag == "plain":
            drop_faces(mesh, lambda n: bool(WEAPON.search(n)))
            plain(mesh)
        elif tag in PATTERN or tag in TOP:
            print_pattern(mesh, tag)
        elif tag in SUIT:
            suit(arm, mesh, tag)
        elif tag == "glove":
            glove(arm, mesh, "R")
        elif tag == "liftcap":
            lift_cap(arm, mesh)
        elif tag == "handbag":
            handbag(arm, mesh, "L")
        elif tag != "bare":
            raise SystemExit(f"{cid}: no tag {tag} (HAIR, CLOTH, PATTERN, TOP, SUIT, ACCESSORY, bare or plain)")


def build_npcs(only=None, clips=True):
    """Every NPC the cities name, and the clips for each sex; people.json's "npcs"."""
    listing = [os.path.relpath(p, os.path.dirname(RB)).replace(os.sep, "/")
               for p in glob.glob(os.path.join(RB, "Avatars", "*", "*", "Textures", "*"))]
    cast = npc_cast(listing)
    faces = face_cast()
    out = os.path.join(ROOT, "web", "assets", "people")
    path = os.path.join(out, "people.json")
    info = json.load(open(path))
    sec = info.get("npcs", {})
    chars = dict(sec.get("characters", {})) if only else {}   # (--only: every other entry as it was, as its file is kept)
    for cid, spec in cast.items():
        if only and cid not in only:   # as built before
            chars[cid] = sec.get("characters", {}).get(cid)
            continue
        rig, mesh = build_npc(cid, spec)
        tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
        height = round(max((mesh.matrix_world @ v.co).z for v in mesh.data.vertices), 3)
        face = cid in faces and add_face(cid, rig, mesh, spec["head"] or spec["avatar"])
        export(rig, os.path.join(out, f"{cid}.glb"), clips=False, data_px=256)
        chars[cid] = {"file": f"{cid}.glb", "sex": spec["sex"], "avatar": spec["avatar"], "head": spec["head"], "tags": spec["tags"],
                      "height_m": height, "triangles": tris, **({"face": sorted(FACE_KEYS)} if face else {}),
                      "cities": sorted(spec["cities"]), **({"mask": spec["skin"]} if spec.get("skin") else {})}   # (mask: its body's picture marks the skin, and how much of it)
        print(f"{cid}: {tris} triangles")
    clip_files = dict(sec.get("clips", {}))
    for sex in sorted({s["sex"] for s in cast.values()}) if clips else []:
        names = NPC_BASE + sorted({c for s in cast.values() if s["sex"] == sex for c in s["clips"]} - set(NPC_BASE))
        bad = [c for c in names if c not in NPC_CLIPS]
        if bad:
            raise SystemExit(f"no clip {bad} in NPC_CLIPS")
        avatar = next(s["avatar"] for s in cast.values() if s["sex"] == sex)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        rig = load_avatar(f"R_clips_{sex}", {"avatar": avatar})
        speeds = animate(rig, sex, {c: NPC_CLIPS[c] for c in names})
        export(rig, os.path.join(out, f"R_clips_{sex}.glb"), mesh=False, shared=True)
        clip_files[sex] = {"file": f"R_clips_{sex}.glb", "clips": [t.name for t in rig.animation_data.nla_tracks], "ground_speed": speeds}
    # the run, for the sexes of the people the reef and alpine sites cast
    field = dict(sec.get("field", {}))
    for sex in sorted({s["sex"] for s in cast.values() if "reef" in s["cities"]}):
        if not clips and os.path.exists(os.path.join(out, f"R_clips_field_{sex}.glb")):   # (--no-clips: only a missing one)
            continue
        avatar = next(s["avatar"] for s in cast.values() if s["sex"] == sex)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        rig = load_avatar(f"R_clips_field_{sex}", {"avatar": avatar})
        speeds = animate(rig, sex, FIELD_CLIPS)
        export(rig, os.path.join(out, f"R_clips_field_{sex}.glb"), mesh=False, shared=True)
        field[sex] = {"file": f"R_clips_field_{sex}.glb", "clips": [t.name for t in rig.animation_data.nla_tracks], "ground_speed": speeds}
    if not only:   # files of characters no city names any more
        for f in glob.glob(os.path.join(out, "R_*.glb")):
            name = os.path.basename(f)[:-4]
            if name not in chars and not name.startswith("R_clips_"):
                os.remove(f)
                print("removed", f)
    info["npcs"] = {
        "note": "The NPCs: Microsoft Rocketbox avatars built by blender/build_people.py --npcs for the characters the cities' "
                "game.npcs name, and the reef and alpine sites' people (web/reef) (R_<avatar>[_<head>][_<tag>...]). Each sex's clips are "
                "in one file that drives them all; \"field\" is the run of the visitor you play at a reef or alpine site.",
        "source": "Microsoft Rocketbox (MIT, (c) 2020 Microsoft): avatars and animations; see LICENSE-Rocketbox.txt",
        "bones": BONE_ALIAS,
        "clips": clip_files,
        "field": field,
        "characters": {k: chars[k] for k in sorted(chars) if chars[k]},
    }
    json.dump(info, open(path, "w"), indent=1)
    print("updated", path)
    # the far crowd's copies of the cast, from the files just written (pipeline/crowd_cast.py)
    subprocess.run([sys.executable, os.path.join(ROOT, "pipeline", "crowd_cast.py")], check=True)


# ------------------------------------------------------------------ preview
def preview(rig, path):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 600, 1000
    world = bpy.data.worlds.new("Studio"); sc.world = world; world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.66, 0.70, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    sun = bpy.data.objects.new("Key", bpy.data.lights.new("Key", "SUN")); sc.collection.objects.link(sun)
    sun.data.energy = 3.2; sun.rotation_euler = (math.radians(55), 0, math.radians(-35))
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); sc.collection.objects.link(cam)
    cam.data.lens = 70
    cam.location = (1.6, -5.2, 1.0); cam.rotation_euler = (math.radians(88.5), 0, math.radians(17))
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("wrote", path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="character ids")
    ap.add_argument("--preview", action="store_true", help="Cycles stills of Idle and Walk -> docs/images/people/")
    ap.add_argument("--no-export", action="store_true", help="build (and preview) without writing the GLB")
    ap.add_argument("--npcs", action="store_true", help="the NPCs the cities name (R_*), and their clips, instead")
    ap.add_argument("--no-clips", action="store_true", help="with --npcs: leave the clip files as they are")
    args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])
    if args.npcs:
        return build_npcs(args.only, clips=not args.no_clips)
    path = os.path.join(ROOT, "web", "assets", "people", "people.json")
    heroes = dict(json.load(open(path)).get("heroes", {}).get("characters", {}))
    for cid, spec in CHARACTERS.items():
        if args.only and cid not in args.only:
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        rig, mesh = import_avatar(spec["avatar"])
        retouch(cid, rig, mesh, spec.get("head"), spec.get("tags", []))
        DRESSED.clear()
        for part, colour, *seed in spec.get("dress", []):
            dress(mesh, part, colour, *seed)
        cam = neck_camera(rig, mesh) if spec.get("camera") else None
        rig.name = f"{cid}_Rig"
        speeds = animate(rig, spec["sex"])
        mesh = next(c for c in rig.children if c.type == "MESH")
        tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
        print(f"{cid}: {tris} triangles, {len(rig.data.bones)} bones, ground speeds {speeds}")
        if args.preview:
            out = os.path.join(ROOT, "docs", "images", "people"); os.makedirs(out, exist_ok=True)
            later = [m.node_tree.nodes["Principled BSDF"] for m in bpy.data.materials if m.name.startswith("camera_strap1964")]
            for n in later:   # (the strap of the camera of 1964 is not on until the first frame's photograph)
                n.inputs["Alpha"].default_value = 0.0
            for clip, frame in (("Idle", 20), ("Walk", 10)):
                for t in rig.animation_data.nla_tracks:
                    t.mute = t.name != clip
                bpy.context.scene.frame_set(frame)
                preview(rig, os.path.join(out, f"{cid}_{clip}.png"))
            for t in rig.animation_data.nla_tracks:
                t.mute = False
            for n in later:
                n.inputs["Alpha"].default_value = 1.0
        if not args.no_export:
            out = os.path.join(ROOT, "web", "assets", "people")
            height = round(max((mesh.matrix_world @ v.co).z for v in mesh.data.vertices), 3)
            add_face(cid, rig, mesh, spec.get("head") or spec["avatar"])
            export(rig, os.path.join(out, f"{cid}.glb"))
            heroes[cid] = {"file": f"{cid}.glb", "label": spec["label"], "avatar": spec["avatar"], "head": spec.get("head"), "ground_speed": speeds,
                           "height_m": height, "triangles": tris, "face": sorted(FACE_KEYS),
                           "clips": [t.name for t in rig.animation_data.nla_tracks], **({"neck_camera": cam} if cam else {})}
    if not args.no_export:
        for cid in [c for c in heroes if c not in CHARACTERS]:   # main characters there are no more of
            heroes.pop(cid)
            f = os.path.join(ROOT, "web", "assets", "people", f"{cid}.glb")
            if os.path.exists(f):
                os.remove(f)
                print("removed", f)
        write_people_json(heroes)


if __name__ == "__main__":
    main()
