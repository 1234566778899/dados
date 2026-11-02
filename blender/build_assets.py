"""Modela dado y bandeja y exporta public/models/scene.glb.

Uso: blender -b -P blender/build_assets.py
"""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "models", "scene.glb")


def main():
    common.reset_scene()
    die = common.build_die(common.die_material(), common.pip_material())
    tray, felt = common.build_tray(common.wood_material(), common.felt_material())
    # El dado esta en el origen: sin ocultarlo, su oclusion quedaria horneada en el fieltro.
    die.hide_render = True
    common.bake_felt(felt)
    die.hide_render = False

    print("DIE tris:", sum(len(p.vertices) - 2 for p in die.data.polygons))
    print("TRAY tris:", sum(len(p.vertices) - 2 for p in tray.data.polygons))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=78,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )
    print("EXPORTED", OUT, os.path.getsize(OUT))


main()
