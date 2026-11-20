import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit
from kit import shape, fill, stroke, rect

HERE = os.path.dirname(os.path.abspath(__file__))
pct = int(os.environ.get("PCT", "50"))
INK = "#0c0c0c"

kit.reset(ambient=0.80)
rect("wall", -600, -500, 2520, 1600, "#8d8499", 6.0)
# desk
shape("desk", [(-600, 985, "c"), (2520, 985, "c"), (2520, 1600, "c"), (-600, 1600, "c")], "#2b2a30", 4.0, None, 6)
# monitor
shape("stand_base", [(700, 1010), (800, 978), (1120, 978), (1220, 1010), (1200, 1040), (720, 1040)], "#232327", 3.2, None, 6)
shape("stand_neck", [(880, 880, "c"), (1040, 880, "c"), (1060, 1000, "c"), (860, 1000, "c")], "#2d2d33", 3.1, None, 6)
shape("bezel", [(232, 62, "c"), (1688, 62, "c"), (1688, 930, "c"), (232, 930, "c")], "#17171a", 3.0, None, 7)
kit.screen("screen", 262, 90, 1658, 875, os.path.join(HERE, "src", "site-home.png"), 2.95)
fill("led", [(1600, 898), (1612, 898), (1612, 908), (1600, 908)], "#7dffb0", 2.9, None, emit=True, thick=0.004)
# keyboard
shape("kbd", [(1180, 1030, "c"), (1900, 1030, "c"), (1960, 1110, "c"), (1140, 1110, "c")], "#3a3940", 2.4, None, 6)
for i in range(9):
    x = 1215 + i * 78
    stroke("key%d" % i, [(x, 1034), (x - 6, 1106)], 2.38, 3.0, INK)
stroke("keyrow", [(1162, 1068), (1930, 1068)], 2.38, 3.0, INK)

# the two of them from behind, close to the lens, out of focus
TF = (1.0, 0, 0)
d = -14.0
shape("wb_hood", [(120, 1020), (180, 930), (300, 880), (460, 872), (600, 900), (700, 980), (760, 1200, "c"), (60, 1200, "c")],
      "#696969", d, TF, 8)
shape("wb_head", [(250, 760), (262, 650), (318, 574), (400, 548), (486, 570), (540, 640), (556, 750), (530, 880), (420, 930), (290, 890)],
      "#f6f6f6", d - 0.2, TF, 8)
fill("wb_shade", [(250, 760), (262, 650), (318, 574), (360, 556), (330, 640), (318, 760), (340, 900), (290, 890)],
     "#c9c9c9", d - 0.24, TF, thick=0.004)
shape("pb_body", [(1190, 1200, "c"), (1210, 1010), (1290, 940), (1420, 930), (1520, 980), (1560, 1200, "c")], "#b5741a", d + 0.3, TF, 8)
shape("pb_head", [(1200, 800), (1220, 690), (1290, 630), (1380, 622), (1470, 660), (1512, 760), (1500, 900), (1420, 970), (1300, 968), (1224, 910)],
      "#b5741a", d, TF, 8)
fill("pb_shade", [(1380, 622), (1470, 660), (1512, 760), (1500, 900), (1420, 970), (1440, 820), (1430, 700)], "#8a5712", d - 0.04, TF, thick=0.004)

cam = kit.camera(dist=50)
kit.dof(cam, 53.0, float(os.environ.get("FSTOP", "1.2")))
kit.area_light("room", (6.0, -20.0, 8.0), 500, "#fff1dc", size=8.0, look=(0, 0, 0))
kit.render(os.path.join(HERE, "out", "monitor.png"), pct)
