#!/usr/bin/env python3
"""Cuts the hero's moving parts out of the lossless drawing and writes the page's copy of it.

    python3 web/src/prototypes/hero/cut-assets.py [--preview DIR]

Reads   refs/hero/06-extended-upscaled.png  (3808x1280, lossless)
Writes  web/public/hero/base-plate.webp      the drawing with the tree and the stars painted out (the
        web/public/hero/base-plate-1x.webp   tree sways and the stars twinkle, so both are drawn on top)
        web/public/hero/tree.webp            the tree, line only, transparent
        web/public/hero/walker-{white,orange,blue}.png   the three figures near the TV, line only

It prints every box it cut as fractions of the drawing; those numbers are what `asset.ts` holds.
Every pixel coordinate below is in the 3808x1280 source. If the drawing changes, re-check the boxes
(run with --preview and look at the sheets) before trusting the output.

Needs python3 with numpy, scipy and PIL.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[4]
SRC = ROOT / 'refs/hero/06-extended-upscaled.png'
OUT = ROOT / 'web/public/hero'
PREVIEW = Path(sys.argv[sys.argv.index('--preview') + 1]) if '--preview' in sys.argv else None

PAINT_OUT_STARS = True  # False keeps the drawn stars in the plate (then drop `stars[].baked` in asset.ts)
SKY = np.array([13, 16, 11], np.float32)  # #0d100b, the median of the empty sky

src = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
H, W, _ = src.shape
R, G, B = src[..., 0], src[..., 1], src[..., 2]
LUM = 0.299 * R + 0.587 * G + 0.114 * B


def ramp(v, lo, hi):
    return np.clip((v - lo) / (hi - lo), 0, 1)


def frac(x0, y0, x1, y1):
    return f'x {x0 / W:.4f}  y {y0 / H:.4f}  w {(x1 - x0) / W:.4f}  h {(y1 - y0) / H:.4f}'


def keep_touching(alpha, core, thresh=0.3, join=2):
    """Drop every blob of line that does not reach into `core` (a boolean mask): the hill outlines nearby."""
    lab, _ = ndi.label(ndi.binary_dilation(alpha > thresh, iterations=join), structure=np.ones((3, 3)))
    ids = np.unique(lab[core & (lab > 0)])
    return alpha * ndi.binary_dilation(np.isin(lab, ids), iterations=2)


def unmix(rgb, alpha, behind, line):
    """The line's own colour: take the ground back out of the soft edge pixels, lean on `line` where thin."""
    a = np.maximum(alpha, 0.2)[..., None]
    fg = np.clip((rgb - (1 - a) * behind) / a, 0, 255)
    w = ramp(alpha, 0.25, 0.8)[..., None]
    return fg * w + np.asarray(line, np.float32) * (1 - w)


def save_sprite(name, rgb, alpha, x0, y0, fmt='png'):
    ys, xs = np.nonzero(alpha > 0.03)
    t, b, l, r = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    pad = 2
    t, l = max(0, t - pad), max(0, l - pad)
    b, r = min(alpha.shape[0], b + pad), min(alpha.shape[1], r + pad)
    out = np.dstack([rgb[t:b, l:r], alpha[t:b, l:r, None] * 255]).round().astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    path = OUT / f'{name}.{fmt}'
    if fmt == 'png':
        im.save(path, optimize=True)
    else:
        im.save(path, lossless=True, method=6, exact=False)
    box = (x0 + l, y0 + t, x0 + r, y0 + b)
    print(f'{name:14s} {path.name:20s} {r - l}x{b - t}px  {path.stat().st_size // 1024} KB   {frac(*box)}')
    return im, box


# ───────── the three figures ─────────
# Each is keyed on the channel where its line stands furthest from the green fill and the dark inside,
# then the cream hill outline it stands on is thrown out (by colour where the colours differ, and by
# keeping only the lines connected to the figure).

GREENISH = np.array([40, 52, 27], np.float32)  # between the green fill and the dark inside of a figure


def figure(name, box, alpha_of, core, line, cream=None, join=2):
    x0, y0, x1, y1 = box
    sl = (slice(y0, y1), slice(x0, x1))
    r, g, b = R[sl], G[sl], B[sl]
    alpha = alpha_of(r, g, b, x0, y0)
    if cream is not None:
        alpha = alpha * ~ndi.binary_dilation(cream(r, g, b, x0, y0), iterations=3)
    cx0, cy0, cx1, cy1 = core
    cm = np.zeros(alpha.shape, bool)
    cm[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0] = True
    alpha = keep_touching(alpha, cm, join=join)
    rgb = unmix(src[sl], alpha, GREENISH, line)
    return save_sprite(name, rgb, alpha, x0, y0)


def white_alpha(r, g, b, x0, y0):
    a = ramp(b, 55, 190)
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    X, Y = xx + x0, yy + y0
    # the hill outline runs past the raised arm (upper right) and under the feet
    a[(Y < 700 + (X - 1000) * 1.3) & (X > 1000)] = 0
    a[Y > 930 - np.maximum(0, 905 - X) * 0.45] = 0
    return a


def orange_alpha(r, g, b, x0, y0):
    a = ramp(r, 70, 180) * ramp(r - b, 22, 40)
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    X, Y = xx + x0, yy + y0
    sword = (X < 803) & (Y > 832) & (Y < 866)  # the white blade it holds out
    a = np.where(sword, ramp(b, 55, 190), a)
    a[Y > 907 + (X - 800) * 0.07] = 0  # the hill outline under its feet
    a[(X < 800) & (Y > 868)] = 0
    return a


def blue_alpha(r, g, b, x0, y0):
    return ramp(b, 55, 175) * ramp(b - r, -6, 6)


sprites = {}
sprites['walker-white'] = figure('walker-white', (878, 688, 1080, 948), white_alpha, (930, 720, 1050, 900), (233, 229, 214))
sprites['walker-orange'] = figure('walker-orange', (755, 785, 892, 920), orange_alpha, (800, 800, 870, 890), (207, 179, 141), join=7)
sprites['walker-blue'] = figure('walker-blue', (1116, 810, 1304, 1002), blue_alpha, (1170, 840, 1270, 960), (190, 200, 216))

# ───────── the tree ─────────
# White line on empty sky. Its box is everything right of the couple and above the couch back, and the
# trunk stops where it goes behind the couch back (a slanted line, `trunk_cut`), which is also where it pivots.
PIVOT = (3400, 672)


def trunk_cut(x):
    return 676 - (x - 3360) * 0.11


tx0, ty0, tx1, ty1 = 3120, 320, W, 740
sl = (slice(ty0, ty1), slice(tx0, tx1))
yy, xx = np.mgrid[ty0:ty1, tx0:tx1]
region = ((yy < 560) | ((xx > 3352) & (yy < trunk_cut(xx))) | ((xx > 3500) & (yy < 735)))
region &= ~((xx < 3352) & (yy > 560))
tree_alpha = ramp(LUM[sl], 30, 185) * region
tree_alpha *= ~ndi.binary_dilation((B[sl] - R[sl] > 12) & (LUM[sl] > 70), iterations=2)  # the couch and the couple
tree_alpha *= ~ndi.binary_dilation((G[sl] > R[sl] + 12) & (G[sl] > B[sl] + 12) & (G[sl] > 45), iterations=2)  # the ridge
seed = np.zeros(tree_alpha.shape, bool)
seed[400 - ty0:660 - ty0, 3360 - tx0:3520 - tx0] = True  # the trunk
lab, _ = ndi.label(ndi.binary_dilation(tree_alpha > 0.25, iterations=14))  # foliage is many loose marks
ids = np.unique(lab[seed & (lab > 0)])
tree_alpha *= np.isin(lab, ids)
tree_rgb = unmix(src[sl], tree_alpha, SKY, (238, 234, 226))
sprites['tree'] = save_sprite('tree', tree_rgb, tree_alpha, tx0, ty0, fmt='webp')
print(f'tree trunk base  x {PIVOT[0] / W:.4f}  y {PIVOT[1] / H:.4f}')

# ───────── stars ─────────
sky_zone = np.zeros((H, W), bool)
sky_zone[60:600, 1100:3120] = True
sky_zone[60:330, 1100:3760] = True
lab, n = ndi.label(ndi.binary_dilation((LUM > 46) & sky_zone, iterations=2))
stars = []
for i, s in enumerate(ndi.find_objects(lab)):
    h, w = s[0].stop - s[0].start, s[1].stop - s[1].start
    blob = (lab[s] == i + 1) & (LUM[s] > 46)
    if blob.sum() >= 20 and h < 70 and w < 70 and LUM[s][blob].max() > 120:
        cy, cx = ndi.center_of_mass(LUM[s] * blob)
        stars.append((s[1].start + cx, s[0].start + cy, max(h, w) - 4, s))
print('stars (centre as a fraction, size as a fraction of the height):')
for cx, cy, size, _ in sorted(stars):
    print(f'  {{ x: {cx / W:.4f}, y: {cy / H:.4f}, r: {size / 2 / H:.4f} }},')

# ───────── the plate: the drawing without the tree and the stars ─────────
# The holes are filled with the sky that is around them (its slow mottling, carried across the hole)
# plus real grain copied from an empty stretch of the same drawing.
patch = src[300:600, 1750:2300]
assert LUM[300:600, 1750:2300].max() < 90, 'the sky patch is not empty'
patch = patch - np.dstack([ndi.gaussian_filter(patch[..., c], 12) for c in range(3)])
tile = np.block([[[patch], [patch[:, ::-1]]], [[patch[::-1]], [patch[::-1, ::-1]]]])
grain = np.tile(tile, (H // tile.shape[0] + 1, W // tile.shape[1] + 1, 1))[:H, :W]

hole = np.zeros((H, W), bool)
glow = ramp(LUM[sl], 20, 30) * region  # the faint bloom round the tree's line goes too
glow_lab, _ = ndi.label(ndi.binary_dilation(tree_alpha > 0.02, iterations=10))
hole[sl] = ndi.binary_dilation(tree_alpha > 0.02, iterations=7) | ((glow > 0.5) & (glow_lab > 0))
hole[sl] &= region
# never paint over the couch, the couple or the ridge
keepers = ndi.binary_dilation(((B - R > 12) & (LUM > 70)) | ((G > R + 12) & (G > B + 12) & (G > 45)), iterations=2)
hole &= ~keepers
if PAINT_OUT_STARS:
    for cx, cy, size, s in stars:
        hole[max(0, s[0].start - 8):s[0].stop + 8, max(0, s[1].start - 8):s[1].stop + 8] = True
known = (~ndi.binary_dilation(hole, iterations=10) & (LUM < 27)).astype(np.float32)  # empty sky only, clear of the bloom
weight = ndi.gaussian_filter(known, 40)
around = np.dstack([ndi.gaussian_filter(src[..., c] * known, 40) / np.maximum(weight, 1e-3) for c in range(3)])
around = np.where(weight[..., None] > 0.02, around, SKY)
soft = ndi.gaussian_filter(hole.astype(np.float32), 1.5)[..., None]
plate = np.clip(src * (1 - soft) + (around + grain) * soft, 0, 255)
plate_im = Image.fromarray(plate.round().astype(np.uint8), 'RGB')
for name, size, q in (('base-plate.webp', (W, H), 90), ('base-plate-1x.webp', (W // 2, H // 2), 90)):
    im = plate_im if size == (W, H) else plate_im.resize(size, Image.LANCZOS)
    im.save(OUT / name, quality=q, method=6)
    print(f'{name:22s} {size[0]}x{size[1]}  {(OUT / name).stat().st_size // 1024} KB')

# ───────── check sheets ─────────
if PREVIEW:
    PREVIEW.mkdir(parents=True, exist_ok=True)
    # the tree laid back on the plate must give the drawing back
    back = plate_im.convert('RGBA')
    tree_im, tbox = sprites['tree']
    back.alpha_composite(tree_im, (tbox[0], tbox[1]))
    diff = np.abs(np.asarray(back.convert('RGB')).astype(np.float32) - src).max(2)
    print(f'tree back on the plate vs the drawing, tree box: mean diff {diff[ty0:ty1, tx0:tx1].mean():.2f}, 99.9th pct {np.percentile(diff[ty0:ty1, tx0:tx1], 99.9):.0f} (of 255)')
    plate_im.crop((2900, 100, W, 1000)).save(PREVIEW / 'plate-right.png')
    back.crop((2900, 100, W, 1000)).save(PREVIEW / 'plate-right-with-tree.png')
    for name, (im, box) in sprites.items():
        if name == 'tree':
            sheet = Image.new('RGBA', (im.width * 2, im.height), (13, 16, 11, 255))
            sheet.paste((70, 30, 90, 255), (im.width, 0, im.width * 2, im.height))
            sheet.alpha_composite(im, (0, 0))
            sheet.alpha_composite(im, (im.width, 0))
        else:
            k = 3
            big = im.resize((im.width * k, im.height * k), Image.LANCZOS)
            sheet = Image.new('RGBA', (big.width * 3, big.height), (13, 16, 11, 255))
            sheet.paste((48, 66, 33, 255), (big.width, 0, big.width * 2, big.height))
            sheet.paste((120, 40, 110, 255), (big.width * 2, 0, big.width * 3, big.height))
            for i in range(3):
                sheet.alpha_composite(big, (big.width * i, 0))
        sheet.convert('RGB').save(PREVIEW / f'{name}.png')
