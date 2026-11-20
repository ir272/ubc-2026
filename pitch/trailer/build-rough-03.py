#!/usr/bin/env python3
"""Rough 03: the N3ON clip plays through; the reaction posts pop on one at a time and STACK over it.
Variant A: a neat column, top down.  Variant B: an overlapping pile that fills the frame.
Usage: python3 build-rough-03.py A|B
"""
import subprocess, sys, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
V = sys.argv[1]
CLIP = "src/n3on-first-15s.mp4"
P = "src/posts/"
S = "src/sfx/earshot/"
posts = [  # file, (w, h), time it lands
    ("reddit-lsf-backlash-headline.png", (1474, 244), 4.0),
    ("x-zigzagfilla-dumbest.png", (1302, 302), 5.7),
    ("x-maya-never-has-to-stop.png", (1324, 262), 7.3),
    ("x-thefloor-wild-concept.png", (1318, 216), 8.7),
    ("x-pttcoin-ai-take-over.png", (1320, 216), 9.9),
    ("reddit-dead-internet-theory.png", (1252, 216), 11.2),
]
sfx = ["pop_1.wav", "pop_2.wav", "pop_3.wav", "pop_4.wav", "pop_1.wav", "hit_1.wav"]

if V == "A":   # column: same width, stacked top down with a gap
    W, gap = 860, 14
    hs = [round(W * h / w) for _, (w, h), _ in posts]
    y = (1080 - sum(hs) - gap * (len(hs) - 1)) / 2
    lay = []
    for h in hs:
        lay.append((960, y + h / 2, W, 0)); y += h + gap
else:          # pile: overlapping, slightly turned, last one on top in the middle
    lay = [(700, 250, 1120, -3), (1220, 440, 1120, 2.5), (740, 640, 1120, -1.5),
           (1230, 190, 1060, 3), (1150, 860, 1120, -2), (960, 560, 1380, 0)]

cmd = ["ffmpeg", "-v", "error", "-y", "-i", CLIP]
for f, _, _ in posts: cmd += ["-loop", "1", "-framerate", "24", "-t", "15", "-i", P + f]
for f in sfx: cmd += ["-i", S + f]
fc = ["[0:v]scale=1920:1080:flags=lanczos[v0]"]
prev = "v0"
for i, ((f, _, T), (cx, cy, W, rot)) in enumerate(zip(posts, lay), start=1):
    chain = f"[{i}:v]format=rgba"
    if V == "B":
        chain += ",pad=iw+8:ih+8:4:4:color=0xBDBDBD"
        if rot: chain += f",rotate={rot}*PI/180:c=none:ow=rotw({rot}*PI/180):oh=roth({rot}*PI/180)"
    chain += f",scale=w='2*trunc({W}*(0.80+0.20*min(max(t-{T}\\,0)/0.10\\,1))/2)':h=-2:eval=frame:flags=lanczos[p{i}]"
    fc.append(chain)
    fc.append(f"[{prev}][p{i}]overlay=x='{cx}-w/2':y='{cy}-h/2':eval=frame:enable='gte(t,{T})'[v{i}]")
    prev = f"v{i}"
mix = "[0:a]"
for k, (_, _, T) in enumerate(posts):
    idx = 1 + len(posts) + k
    fc.append(f"[{idx}:a]adelay={int(T*1000)}:all=1,volume=-7dB[s{k}]"); mix += f"[s{k}]"
fc.append(f"{mix}amix=inputs={len(posts)+1}:normalize=0:duration=first[a]")
out = f"out/rough-03{V.lower()}-stack-{'column' if V=='A' else 'pile'}.mp4"
cmd += ["-filter_complex", ";".join(fc), "-map", f"[{prev}]", "-map", "[a]", "-t", "15",
        "-c:v", "libx264", "-crf", "18", "-preset", "fast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", out]
subprocess.run(cmd, check=True); print(out)
