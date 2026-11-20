"""Paper-cut 2.5D kit for the skit. Shapes are authored in a 1920x1080 design
space (x right, y down) and built as Blender curves standing on layers in depth.
Run inside Blender:  Blender -b -P shot_x.py
"""
import bpy, math

S = 0.01  # design px -> Blender units


def hexc(h, a=1.0):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b), a)


_mats = {}


def mat(color, emit=False):
    key = (color, emit)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(("E" if emit else "P") + color)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    if emit:
        sh = nt.nodes.new("ShaderNodeEmission")
        sh.inputs["Color"].default_value = hexc(color)
        sh.inputs["Strength"].default_value = 1.0
        nt.links.new(sh.outputs[0], out.inputs[0])
    else:
        sh = nt.nodes.new("ShaderNodeBsdfDiffuse")
        sh.inputs["Color"].default_value = hexc(color)
        nt.links.new(sh.outputs[0], out.inputs[0])
    _mats[key] = m
    return m


def reset(w=1920, h=1080, world="#ffffff", ambient=0.9):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()
    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            pass
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "Standard"
    sc.render.film_transparent = False
    wd = bpy.data.worlds.new("W")
    wd.use_nodes = True
    bg = next(n for n in wd.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = hexc(world)
    bg.inputs[1].default_value = ambient
    sc.world = wd
    try:
        sc.eevee.taa_render_samples = 32
    except Exception:
        pass
    return sc


def _xf(p, tf):
    x, y = p[0], p[1]
    if tf:
        sx, ox, oy = tf
        x, y = x * sx + ox, y * sx + oy
    return ((x - 960) * S, (540 - y) * S)


def _spline(cu, pts, closed, tf, radii=None):
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        bp = sp.bezier_points[i]
        x, y = _xf(p, tf)
        bp.co = (x, y, 0)
        t = "VECTOR" if (len(p) > 2 and p[2] == "c") else "AUTO"
        bp.handle_left_type = bp.handle_right_type = t
        if radii:
            bp.radius = radii[i]
    sp.use_cyclic_u = closed
    return sp


def _obj(name, cu, depth, material):
    ob = bpy.data.objects.new(name, cu)
    ob.rotation_euler = (math.pi / 2, 0, 0)
    ob.location = (0, depth, 0)
    cu.materials.append(material)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def fill(name, pts, color, depth, tf=None, emit=False, thick=0.02):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    cu.resolution_u = 20
    cu.extrude = thick
    _spline(cu, pts, True, tf)
    return _obj(name, cu, depth, mat(color, emit))


def stroke(name, pts, depth, width=5.0, color="#0c0c0c", tf=None, closed=False, taper=True):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.resolution_u = 20
    cu.bevel_depth = width * S / 2 * (tf[0] if tf else 1)
    cu.bevel_resolution = 2
    cu.fill_mode = "FULL"
    cu.use_fill_caps = True
    n = len(pts)
    radii = None
    if taper and not closed and n >= 2:
        radii = [1.0] * n
        radii[0] = radii[-1] = 0.45
    elif closed:
        # uneven pressure, like a pen
        radii = [1.0 + 0.16 * math.sin(i * 2.3) for i in range(n)]
    _spline(cu, pts, closed, tf, radii)
    return _obj(name, cu, depth - 0.03, mat(color, True))


def shape(name, pts, color, depth, tf=None, line=5.0, line_color="#0c0c0c", emit=False):
    f = fill(name, pts, color, depth, tf, emit)
    s = stroke(name + "_ol", pts, depth, line, line_color, tf, closed=True) if line else None
    return f, s


def rect(name, x0, y0, x1, y1, color, depth, emit=False, line=0):
    pts = [(x0, y0, "c"), (x1, y0, "c"), (x1, y1, "c"), (x0, y1, "c")]
    return shape(name, pts, color, depth, None, line, emit=emit)


def camera(dist=50.0, shift=(0, 0), width_px=1920):
    cam = bpy.data.cameras.new("Cam")
    cam.sensor_width = 36
    cam.lens = 36 * dist / (width_px * S)
    ob = bpy.data.objects.new("Cam", cam)
    ob.location = (shift[0] * S, -dist, -shift[1] * S)
    ob.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.scene.camera = ob
    cam.clip_end = 500
    return ob


def area_light(name, loc, power, color="#ffffff", size=4.0, look=(0, 0, 0)):
    li = bpy.data.lights.new(name, "AREA")
    li.energy = power
    li.color = hexc(color)[:3]
    li.size = size
    ob = bpy.data.objects.new(name, li)
    ob.location = loc
    bpy.context.scene.collection.objects.link(ob)
    import mathutils
    d = mathutils.Vector(look) - mathutils.Vector(loc)
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return ob


def render(path, pct=100):
    sc = bpy.context.scene
    sc.render.resolution_percentage = pct
    sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def screen(name, x0, y0, x1, y1, image_path, depth, strength=1.0):
    """A glowing picture (the monitor's screen)."""
    import bmesh
    me = bpy.data.meshes.new(name)
    a, b = _xf((x0, y0), None), _xf((x1, y1), None)
    verts = [(a[0], depth, b[1]), (b[0], depth, b[1]), (b[0], depth, a[1]), (a[0], depth, a[1])]
    me.from_pydata(verts, [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="uv")
    for i, c in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[i].uv = c
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(image_path)
    tex.extension = "CLIP"
    em.inputs["Strength"].default_value = strength
    nt.links.new(tex.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs[0])
    me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob, tex


def dof(cam, focus_dist, fstop):
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = focus_dist
    cam.data.dof.aperture_fstop = fstop
