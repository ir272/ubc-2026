#!/usr/bin/env python3
"""Rough 04 (8 s): the N3ON clip plays alone for 4 s; then the reaction posts pop on and stack,
each one sooner than the last; the final post ("Confirms dead internet theory") lands on top in
the middle and the picture zooms in on it.
"""
import subprocess, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
DUR = 8.0
CLIP = "src/n3on-first-15s.mp4"
P = "src/posts/"
S = "src/sfx/earshot/"
# file, time it lands, (centre x, centre y, width, turn in degrees)
posts = [
    ("reddit-lsf-backlash-headline.png", 4.00, (700, 250, 1120, -3)),
    ("x-zigzagfilla-dumbest.png",        4.90, (1220, 440, 1120, 2.5)),
    ("x-maya-never-has-to-stop.png",     5.60, (740, 640, 1120, -1.5)),
    ("x-thefloor-wild-concept.png",      6.10, (1230, 190, 1060, 3)),
    ("x-pttcoin-ai-take-over.png",       6.45, (1150, 860, 1120, -2)),
    ("reddit-dead-internet-theory.png",  6.75, (960, 560, 1380, 0)),
]
sfx = ["pop_1.wav", "pop_2.wav", "pop_3.wav", "pop_4.wav", "pop_1.wav", "hit_1.wav"]
ZOOM_FROM, ZOOM_LEN, ZOOM_TO = 6.95, 0.8, 1.34   # push in on the last post
FY = 0.566                                        # keeps the last post's centre (y 560) in the middle

cmd = ["ffmpeg", "-v", "error", "-y", "-t", str(DUR), "-i", CLIP]
for f, _, _ in posts: cmd += ["-loop", "1", "-framerate", "24", "-t", str(DUR), "-i", P + f]
for f in sfx: cmd += ["-i", S + f]
fc = ["[0:v]scale=1920:1080:flags=lanczos[v0]"]
prev = "v0"
for i, (f, T, (cx, cy, W, rot)) in enumerate(posts, start=1):
    chain = f"[{i}:v]format=rgba,pad=iw+8:ih+8:4:4:color=0xBDBDBD"
    if rot: chain += f",rotate={rot}*PI/180:c=none:ow=rotw({rot}*PI/180):oh=roth({rot}*PI/180)"
    chain += f",scale=w='2*trunc({W}*(0.80+0.20*min(max(t-{T}\\,0)/0.10\\,1))/2)':h=-2:eval=frame:flags=lanczos[p{i}]"
    fc += [chain, f"[{prev}][p{i}]overlay=x='{cx}-w/2':y='{cy}-h/2':eval=frame:enable='gte(t,{T})'[v{i}]"]
    prev = f"v{i}"
p = f"clip((it-{ZOOM_FROM})/{ZOOM_LEN}\\,0\\,1)"
z = f"1+{ZOOM_TO - 1}*({p})*({p})*(3-2*({p}))"
fc.append(f"[{prev}]scale=3840:2160:flags=bicubic,zoompan=z='{z}':x='(iw-iw/zoom)*0.5':y='(ih-ih/zoom)*{FY}':d=1:s=1920x1080:fps=24[vz]")
mix = "[0:a]"
for k, (_, T, _) in enumerate(posts):
    idx = 1 + len(posts) + k
    fc.append(f"[{idx}:a]adelay={int(T*1000)}:all=1,volume=-7dB[s{k}]"); mix += f"[s{k}]"
fc.append(f"{mix}amix=inputs={len(posts)+1}:normalize=0:duration=first,afade=t=out:st={DUR-0.25}:d=0.25[a]")
out = "out/rough-04-stream-8s.mp4"
cmd += ["-filter_complex", ";".join(fc), "-map", "[vz]", "-map", "[a]", "-t", str(DUR),
        "-c:v", "libx264", "-crf", "18", "-preset", "fast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", out]
subprocess.run(cmd, check=True); print(out)
