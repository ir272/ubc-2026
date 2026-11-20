# Crop a PNG: python3 -I tools/crop.py in.png out.png x y w h   (uses Pillow if present, else sips)
import sys, subprocess
src, dst, x, y, w, h = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:7])
try:
    from PIL import Image
    Image.open(src).crop((x, y, x + w, y + h)).save(dst)
except ImportError:
    subprocess.run(['sips', '-c', str(h), str(w), '--cropOffset', str(y), str(x), src, '--out', dst], check=True, stdout=subprocess.DEVNULL)
