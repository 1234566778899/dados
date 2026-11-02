"""Renders en Cycles para validar el modelo y generar poster, icono y OG.

Uso: blender -b -P blender/render_stills.py -- <preview|poster|icon|og> <salida.png>
"""
import math
import os
import random
import sys

import bpy
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1 :]
MODE, OUT = args[0], os.path.abspath(args[1])


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_area(name, loc, target, size, power, color=(1, 1, 1)):
    data = bpy.data.lights.new(name, "AREA")
    data.size = size
    data.energy = power
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    look_at(obj, target)


def setup_render(width, height, samples=128, transparent=False):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for device in prefs.devices:
        device.use = True
    scene.cycles.device = "GPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.film_transparent = transparent
    scene.render.filepath = OUT
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.9, 0.92, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.35
    scene.world = world


def camera(location, target, lens=70):
    data = bpy.data.cameras.new("cam")
    data.lens = lens
    obj = bpy.data.objects.new("cam", data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    bpy.context.scene.camera = obj


def clone_die(die, loc, up_value, yaw):
    copy = bpy.data.objects.new("d", die.data)
    bpy.context.collection.objects.link(copy)
    normal = common.FACES[up_value]
    q = normal.rotation_difference(Vector((0, 0, 1)))
    copy.rotation_mode = "QUATERNION"
    copy.rotation_quaternion = Euler((0, 0, yaw)).to_quaternion() @ q
    copy.location = (loc[0], loc[1], common.DIE_SIZE / 2)
    return copy


def main():
    common.reset_scene()
    die = common.build_die(common.die_material(), common.pip_material())
    die.hide_render = True

    if MODE == "icon":
        die.hide_render = False
        die.rotation_euler = (math.radians(35), math.radians(-28), math.radians(20))
        setup_render(1024, 1024, transparent=True)
        camera((0, -6, 0), (0, 0, 0), lens=88)
        add_area("key", (-3, -4, 5), (0, 0, 0), 5, 300)
        add_area("fill", (4, -3, -1), (0, 0, 0), 5, 70)
        bpy.ops.render.render(write_still=True)
        return

    common.build_tray(common.wood_material(), common.felt_material())

    if MODE == "closeup":
        random.seed(3)
        clone_die(die, (-0.9, 0.2), 5, 0.5)
        clone_die(die, (0.9, -0.4), 3, -0.3)
        setup_render(1400, 900)
        camera((1.5, -5.5, 3.6), (0, 0, 0.3), lens=85)
    elif MODE == "og":
        clone_die(die, (-2.1, 0.3), 6, 0.5)
        clone_die(die, (-0.7, -1.0), 3, -0.35)
        clone_die(die, (0.5, 1.1), 5, 1.1)
        setup_render(1200, 630, samples=192, transparent=True)
        # Bandeja a la derecha: a la izquierda va la marca (build_images.mjs).
        camera((-4.3, -8.5, 17), (-4.3, 0, 0), lens=55)
    else:  # poster: bandeja vacia con la misma camara que la web (engine.ts)
        setup_render(1200, 1200, transparent=True)
        camera((0, -5.9, 22.03), (0, 0, 0), lens=84.68)

    add_area("key", (-5, -4, 14), (0, 0, 0), 9, 1500)
    add_area("rim", (8, 7, 7), (0, 0, 0), 6, 350)
    bpy.ops.render.render(write_still=True)
    print("RENDERED", OUT)


main()
