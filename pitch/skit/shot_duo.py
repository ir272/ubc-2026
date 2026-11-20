import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit, chars

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
pct = int(os.environ.get("PCT", "50"))

kit.reset(ambient=0.80)
# room
kit.rect("wall", -400, -300, 2320, 1400, "#a892c0", 3.6)
kit.rect("panel", -400, 150, 330, 1400, "#5f7d79", 3.5, line=5)
kit.rect("door", 1090, 110, 1560, 1400, "#4f3862", 3.5, line=5)
kit.stroke("wall_line", [(560, -300), (548, 1400)], 3.5, 4.0, "#6f5a8a")
kit.stroke("tick1", [(640, 20), (668, 36)], 3.5, 3.0, "#6f5a8a")
kit.stroke("tick2", [(650, 40), (672, 52)], 3.5, 3.0, "#6f5a8a")

TF = (1.2, 400, -140)
chars.pepe(TF, d=1.3)
chars.wojak(TF, d=0.0)

kit.camera(dist=50)
# the monitor's glow, from in front, low and to the left
kit.area_light("glow", (-5.5, -7.0, -2.5), 420, "#bfe0ff", size=5.0, look=(-1.0, 0, 0.5))
kit.area_light("key", (6.0, -9.0, 6.0), 120, "#fff1dc", size=6.0, look=(0, 0, 0))

kit.render(os.path.join(OUT, "duo.png"), pct)
