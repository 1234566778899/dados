"""Geometria y constantes compartidas por el pipeline de Blender.

Unidades: el dado mide 1 unidad de arista. Z es arriba en Blender.
Se usa una gravedad escalada (ver bake_throws.py) para que un dado de 1 m se
mueva como uno de mano.
"""
import math

import bmesh
import bpy
from mathutils import Vector

# --- Dimensiones -----------------------------------------------------------
DIE_SIZE = 1.0
TRAY_INNER = 3.6  # mitad del lado interior de la bandeja
TRAY_CORNER = 0.7  # radio de esquina interior
WALL_TOP = 0.8  # altura de la pared visible
WALL_THICK = 0.42

# Caras del dado occidental: opuestas suman 7 y 1-2-3 giran antihorario
# alrededor del vertice (+,+,+).
FACES = {
    1: Vector((0, 0, 1)),
    2: Vector((1, 0, 0)),
    3: Vector((0, 1, 0)),
    4: Vector((0, -1, 0)),
    5: Vector((-1, 0, 0)),
    6: Vector((0, 0, -1)),
}

# Posicion de los puntos en coordenadas de cara (u, v), en pasos de PIP_STEP.
PIP_STEP = 0.25
PIPS = {
    1: [(0, 0)],
    2: [(-1, -1), (1, 1)],
    3: [(-1, -1), (0, 0), (1, 1)],
    4: [(-1, -1), (-1, 1), (1, -1), (1, 1)],
    5: [(-1, -1), (-1, 1), (0, 0), (1, -1), (1, 1)],
    6: [(-1, -1), (-1, 0), (-1, 1), (1, -1), (1, 0), (1, 1)],
}


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_color(value):
    value = value.lstrip("#")
    rgb = [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return (*[srgb_to_linear(c) for c in rgb], 1.0)


def make_material(name, color, roughness, coat=0.0, coat_roughness=0.1, specular=0.5):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = hex_color(color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Specular IOR Level"].default_value = specular
    bsdf.inputs["Coat Weight"].default_value = coat
    bsdf.inputs["Coat Roughness"].default_value = coat_roughness
    return mat


def apply_modifier(obj, modifier):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def rounded_cube(name, size, bevel, segments):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=size)
    bmesh.ops.bevel(
        bm,
        geom=list(bm.edges) + list(bm.verts),
        offset=bevel,
        segments=segments,
        profile=0.5,
        affect="EDGES",
        clamp_overlap=True,
    )
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def build_die(body_mat, pip_mat):
    """Cubo redondeado con hoyuelos reales para cada punto."""
    die = rounded_cube("Die", DIE_SIZE, 0.14, 6)
    die.data.materials.append(body_mat)
    die.data.materials.append(pip_mat)

    # Cortador: una esfera por punto, todas en una sola malla.
    cutter_mesh = bpy.data.meshes.new("cutter")
    bm = bmesh.new()
    half = DIE_SIZE / 2
    radius = 0.118
    lift = 0.058  # el centro queda sobre la cara: hoyuelo poco profundo
    for value, normal in FACES.items():
        axis_u = Vector((0, 1, 0)) if abs(normal.x) > 0.5 else Vector((1, 0, 0))
        axis_v = normal.cross(axis_u)
        for u, v in PIPS[value]:
            center = normal * (half + lift) + axis_u * u * PIP_STEP + axis_v * v * PIP_STEP
            matrix = bpy_translation(center)
            bmesh.ops.create_uvsphere(
                bm, u_segments=24, v_segments=14, radius=radius, matrix=matrix
            )
    bm.to_mesh(cutter_mesh)
    bm.free()
    cutter_mesh.materials.append(pip_mat)
    for poly in cutter_mesh.polygons:
        poly.use_smooth = True
    cutter = bpy.data.objects.new("cutter", cutter_mesh)
    bpy.context.collection.objects.link(cutter)

    boolean = die.modifiers.new("pips", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.solver = "EXACT"
    boolean.material_mode = "TRANSFER"
    boolean.object = cutter
    apply_modifier(die, boolean)
    bpy.data.objects.remove(cutter)

    # Bisel minusculo en el borde del hoyuelo: atrapa la luz como un dado real.
    rim = die.modifiers.new("rim", "BEVEL")
    rim.limit_method = "ANGLE"
    rim.angle_limit = math.radians(25)
    rim.width = 0.006
    rim.segments = 2
    rim.harden_normals = False
    apply_modifier(die, rim)

    die.data.shade_smooth()
    die.data.set_sharp_from_angle(angle=math.radians(40))

    # Normales ponderadas por area: las caras grandes quedan planas de verdad.
    weighted = die.modifiers.new("weighted", "WEIGHTED_NORMAL")
    weighted.mode = "FACE_AREA"
    weighted.weight = 100
    weighted.keep_sharp = True
    apply_modifier(die, weighted)
    return die


def bpy_translation(v):
    from mathutils import Matrix

    return Matrix.Translation(v)


def rounded_rect_ring(half, radius, z, corner_segments):
    """Anillo CCW de un rectangulo redondeado. Mismo numero de vertices siempre."""
    radius = max(min(radius, half), 0.001)
    corners = [
        (half - radius, half - radius, 0),
        (-half + radius, half - radius, 90),
        (-half + radius, -half + radius, 180),
        (half - radius, -half + radius, 270),
    ]
    ring = []
    for cx, cy, start in corners:
        for i in range(corner_segments + 1):
            a = math.radians(start + 90 * i / corner_segments)
            ring.append((cx + math.cos(a) * radius, cy + math.sin(a) * radius, z))
    return ring


def build_tray(wood_mat, felt_mat):
    """Bandeja hecha por loft de anillos, de afuera hacia adentro."""
    outer = TRAY_INNER + WALL_THICK
    top = WALL_TOP
    base = -0.35
    corner = TRAY_CORNER + WALL_THICK
    lip = 0.09  # redondeo del canto superior

    profile = [(outer, corner, base)]
    for i in range(7):  # canto exterior
        a = math.radians(90 * i / 6)
        profile.append(
            (outer - lip + math.cos(a) * lip, corner - lip + math.cos(a) * lip, top - lip + math.sin(a) * lip)
        )
    inner_lip_center = TRAY_INNER + lip
    for i in range(7):  # canto interior
        a = math.radians(90 + 90 * i / 6)
        profile.append(
            (
                inner_lip_center + math.cos(a) * lip,
                TRAY_CORNER + lip + math.cos(a) * lip,
                top - lip + math.sin(a) * lip,
            )
        )
    fillet = 0.1  # transicion suave entre pared y fieltro
    for i in range(1, 7):
        a = math.radians(90 * i / 6)
        profile.append(
            (
                TRAY_INNER - fillet + math.cos(a) * fillet,
                TRAY_CORNER - fillet + math.cos(a) * fillet,
                fillet - math.sin(a) * fillet,
            )
        )

    segments = 12
    bm = bmesh.new()
    rings = []
    for half, radius, z in profile:
        rings.append([bm.verts.new(p) for p in rounded_rect_ring(half, radius, z, segments)])
    count = len(rings[0])
    for r in range(len(rings) - 1):
        a, b = rings[r], rings[r + 1]
        for i in range(count):
            j = (i + 1) % count
            face = bm.faces.new((a[i], a[j], b[j], b[i]))
            face.material_index = 0
    # Fondo de la bandeja
    bottom = bm.faces.new(list(reversed(rings[0])))
    bottom.material_index = 0
    felt_outline = [v.co.copy() for v in rings[-1]]
    bm.normal_update()
    bmesh.ops.triangulate(bm, faces=[bottom])

    mesh = bpy.data.meshes.new("Tray")
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(wood_mat)
    mesh.shade_smooth()
    mesh.set_sharp_from_angle(angle=math.radians(50))
    tray = bpy.data.objects.new("Tray", mesh)
    bpy.context.collection.objects.link(tray)

    # El fieltro es un objeto aparte con UV plana para hornearle su textura.
    felt_bm = bmesh.new()
    felt_face = felt_bm.faces.new([felt_bm.verts.new(co) for co in felt_outline])
    uv_layer = felt_bm.loops.layers.uv.new("UVMap")
    span = 2 * TRAY_INNER
    for loop in felt_face.loops:
        loop[uv_layer].uv = (loop.vert.co.x / span + 0.5, loop.vert.co.y / span + 0.5)
    bmesh.ops.triangulate(felt_bm, faces=[felt_face])
    felt_mesh = bpy.data.meshes.new("Felt")
    felt_bm.to_mesh(felt_mesh)
    felt_bm.free()
    felt_mesh.materials.append(felt_mat)
    felt = bpy.data.objects.new("Felt", felt_mesh)
    bpy.context.collection.objects.link(felt)
    return tray, felt


def die_material():
    return make_material("DieBody", "#D4351C", 0.32, coat=1.0, coat_roughness=0.08)


def pip_material():
    return make_material("DiePip", "#F7F2E7", 0.55)


def wood_material():
    return make_material("TrayWood", "#2B211B", 0.42, coat=0.35, coat_roughness=0.3)


def felt_material():
    return make_material("TrayFelt", "#1E3A34", 0.95, specular=0.2)


def bake_felt(felt, size=1024, samples=96):
    """Hornea fibra procedural + oclusion real de las paredes a una textura.

    El resultado sustituye el color base del fieltro: glTF no puede exportar
    nodos procedurales, pero si una imagen. Queda sin sombras directas: esas
    las pinta la luz en tiempo real.
    """
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for device in prefs.devices:
        device.use = True
    scene.cycles.device = "GPU"

    mat = felt.data.materials[0]
    tree = mat.node_tree
    nodes, links = tree.nodes, tree.links
    bsdf = nodes["Principled BSDF"]
    base_rgb = tuple(bsdf.inputs["Base Color"].default_value)

    coords = nodes.new("ShaderNodeTexCoord")
    fine = nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 340
    fine.inputs["Detail"].default_value = 3
    broad = nodes.new("ShaderNodeTexNoise")
    broad.inputs["Scale"].default_value = 7
    links.new(coords.outputs["UV"], fine.inputs["Vector"])
    links.new(coords.outputs["UV"], broad.inputs["Vector"])

    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = 1.5
    ao.samples = 16

    def mix(a, b, factor=1.0):
        node = nodes.new("ShaderNodeMix")
        node.data_type = "RGBA"
        node.blend_type = "MULTIPLY"
        node.inputs["Factor"].default_value = factor
        links.new(a, node.inputs["A"]) if not isinstance(a, tuple) else None
        if isinstance(a, tuple):
            node.inputs["A"].default_value = a
        links.new(b, node.inputs["B"])
        return node.outputs["Result"]

    def remap(source, low, high):
        node = nodes.new("ShaderNodeMapRange")
        node.inputs["From Min"].default_value = 0.3
        node.inputs["From Max"].default_value = 0.7
        node.inputs["To Min"].default_value = low
        node.inputs["To Max"].default_value = high
        links.new(source, node.inputs["Value"])
        return node.outputs["Result"]

    color = mix(base_rgb, remap(fine.outputs["Fac"], 0.86, 1.14))
    color = mix(color, remap(broad.outputs["Fac"], 0.95, 1.05))
    color = mix(color, ao.outputs["Color"])
    emit = nodes.new("ShaderNodeEmission")
    links.new(color, emit.inputs["Color"])
    output = nodes["Material Output"]
    original = bsdf.outputs["BSDF"]
    links.new(emit.outputs["Emission"], output.inputs["Surface"])

    image = bpy.data.images.new("FeltBaked", size, size, alpha=False)
    image_node = nodes.new("ShaderNodeTexImage")
    image_node.image = image
    nodes.active = image_node

    bpy.ops.object.select_all(action="DESELECT")
    felt.select_set(True)
    bpy.context.view_layer.objects.active = felt
    bpy.ops.object.bake(type="EMIT", margin=8)

    links.new(original, output.inputs["Surface"])
    links.new(image_node.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    image.pack()
    return image
