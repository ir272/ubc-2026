#!/usr/bin/env python3
"""Rough 05 (8 s): as rough 04, with a deeper zoom on the last comment and a red circle drawn round
"Confirms dead internet theory". Composited at 3840x2160 so the zoom stays as sharp as the
screenshots allow, then delivered at 1920x1080.
"""
import math, os, subprocess
from PIL import Image, ImageDraw
os.chdir(os.path.dirname(os.path.abspath(__file__)))
DUR, K = 8.0, 2                      # K: working scale (2 = 4K canvas)
CLIP, P, S = "src/n3on-first-15s.mp4", "src/posts/", "src/sfx/earshot/"
# file, time it lands, (centre x, centre y, width, turn in degrees), in 1080p units
posts = [
    ("reddit-lsf-backlash-headline.png", 4.00, (700, 250, 1120, -3)),
    ("x-zigzagfilla-dumbest.png",        4.80, (1220, 440, 1120, 2.5)),
    ("x-maya-never-has-to-stop.png",     5.45, (740, 640, 1120, -1.5)),
    ("x-thefloor-wild-concept.png",      5.95, (1230, 190, 1060, 3)),
    ("x-pttcoin-ai-take-over.png",       6.30, (1150, 860, 1120, -2)),
    ("reddit-dead-internet-theory.png",  6.55, (960, 560, 1380, 0)),
]
sfx = ["pop_1.wav", "pop_2.wav", "pop_3.wav", "pop_4.wav", "pop_1.wav", "hit_1.wav"]
ZOOM_FROM, ZOOM_LEN, ZOOM_TO = 6.70, 0.60, 2.2
FX, FY = 0.1944, 0.5338              # lands the view centre on (640, 560): the comment's name and text
CIRCLE_AT, CIRCLE_FRAMES = 7.30, 7   # the circle draws on over 7 frames (0.29 s)
RED = (233, 25, 22, 255)

# The red circle, drawn by hand-ish: one loop that overshoots its start. 1080p units: centre of the
# comment text is (609, 571); the text is about 424 px wide.
cx, cy, rx, ry, stroke, pad, SS = 609 * K, 579 * K, 250 * K, 40 * K, 6 * K, 40 * K, 3
bw, bh = 2 * (rx + pad), 2 * (ry + pad)
os.makedirs("out/.circle", exist_ok=True)
def pt(a):
    wob = 1 + 0.035 * math.sin(a * 1.5 + 0.6)
    return ((bw / 2 + rx * wob * math.cos(a)) * SS, (bh / 2 + ry * wob * math.sin(a)) * SS)
START, SWEEP = math.radians(205), math.radians(385)
for f in range(CIRCLE_FRAMES):
    im = Image.new("RGBA", (bw * SS, bh * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    end = SWEEP * (f + 1) / CIRCLE_FRAMES
    pts = [pt(START + end * i / 240) for i in range(241)]
    d.line(pts, fill=RED, width=stroke * SS, joint="curve")
    r = stroke * SS / 2
    for q in (pts[0], pts[-1]): d.ellipse((q[0] - r, q[1] - r, q[0] + r, q[1] + r), fill=RED)
    im.resize((bw, bh), Image.LANCZOS).save(f"out/.circle/c{f:02d}.png")

W, H = 1920 * K, 1080 * K
cmd = ["ffmpeg", "-v", "error", "-y", "-t", str(DUR), "-i", CLIP]
for f, _, _ in posts: cmd += ["-loop", "1", "-framerate", "24", "-t", str(DUR), "-i", P + f]
for f in sfx: cmd += ["-i", S + f]
cmd += ["-framerate", "24", "-i", "out/.circle/c%02d.png"]
CI = 1 + 2 * len(posts)
fc = [f"[0:v]scale={W}:{H}:flags=lanczos[v0]"]
prev = "v0"
for i, (f, T, (px, py, pw, rot)) in enumerate(posts, start=1):
    chain = f"[{i}:v]format=rgba,pad=iw+8:ih+8:4:4:color=0xBDBDBD"
    if rot: chain += f",rotate={rot}*PI/180:c=none:ow=rotw({rot}*PI/180):oh=roth({rot}*PI/180)"
    chain += f",scale=w='2*trunc({pw * K}*(0.80+0.20*min(max(t-{T}\\,0)/0.10\\,1))/2)':h=-2:eval=frame:flags=lanczos[p{i}]"
    fc += [chain, f"[{prev}][p{i}]overlay=x='{px * K}-w/2':y='{py * K}-h/2':eval=frame:enable='gte(t,{T})'[v{i}]"]
    prev = f"v{i}"
fc.append(f"[{CI}:v]format=rgba,tpad=stop_mode=clone:stop_duration=3,setpts=PTS+{CIRCLE_AT}/TB[circ]")
fc.append(f"[{prev}][circ]overlay=x={cx - bw // 2}:y={cy - bh // 2}:enable='gte(t,{CIRCLE_AT})':eof_action=pass[vc]")
p = f"clip((it-{ZOOM_FROM})/{ZOOM_LEN}\\,0\\,1)"
z = f"1+{ZOOM_TO - 1}*({p})*({p})*(3-2*({p}))"
fc.append(f"[vc]zoompan=z='{z}':x='(iw-iw/zoom)*{FX}':y='(ih-ih/zoom)*{FY}':d=1:s=1920x1080:fps=24[vz]")
mix = "[0:a]"
for k, (_, T, _) in enumerate(posts):
    fc.append(f"[{1 + len(posts) + k}:a]adelay={int(T * 1000)}:all=1,volume=-7dB[s{k}]"); mix += f"[s{k}]"
fc.append(f"{mix}amix=inputs={len(posts) + 1}:normalize=0:duration=first,afade=t=out:st={DUR - 0.25}:d=0.25[a]")
out = "out/rough-05-stream-8s-circle.mp4"
cmd += ["-filter_complex", ";".join(fc), "-map", "[vz]", "-map", "[a]", "-t", str(DUR),
        "-c:v", "libx264", "-crf", "17", "-preset", "fast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", out]
subprocess.run(cmd, check=True); print(out)
