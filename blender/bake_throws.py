"""Simula lanzamientos con rigid bodies y hornea las pistas a public/models/throws.bin.

Uso: blender -b -P blender/bake_throws.py -- [tomas_por_cantidad] [--probe]

Para cada cantidad de dados (1..6) se guardan N tomas validas. Una toma solo es
valida si todos los dados terminan quietos, planos, dentro de la bandeja y sin
apilarse. La cara que queda arriba no importa: la web gira el dado sobre su eje
propio con la simetria del cubo para mostrar el resultado sorteado.

Formato de throws.bin (little endian), por cada toma y dado, por cada frame:
  pos: 3 x int16 (valor / POS_SCALE), quat: 4 x int16 (valor / 32767)
Coordenadas ya convertidas a Y-up (x, z, -y) como el GLB.
"""
import json
import math
import os
import random
import struct
import sys

import bpy
from mathutils import Euler, Quaternion, Vector

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "models")

args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
PROBE = "--probe" in args
numeric = [a for a in args if a.isdigit()]
TAKES = int(numeric[0]) if numeric else 12

FPS = 60  # frames de simulacion por segundo
KEEP_EVERY = 2  # se guarda 1 de cada N (30 fps efectivos, la web interpola)
MAX_FRAMES = 300
GRAVITY = -42.0  # 1 unidad = arista del dado; gravedad escalada para que se sienta de mano
POS_SCALE = 1000.0
LAUNCH_FRAMES = 4  # frames cinematicos que dan la velocidad inicial
FLOOR_Z = 0.0
MAX_REST = 2.4  # segundos: una tirada no debe hacer esperar


def add_box(name, center, size, rot_z=0.0, friction=0.5, restitution=0.35):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    obj.rotation_euler = (0, 0, rot_z)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.rigidbody.object_add(type="PASSIVE")
    obj.rigid_body.collision_shape = "BOX"
    obj.rigid_body.friction = friction
    obj.rigid_body.restitution = restitution
    obj.rigid_body.collision_margin = 0.0
    return obj


def build_world():
    common.reset_scene()
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = MAX_FRAMES
    bpy.ops.rigidbody.world_add()
    world = scene.rigidbody_world
    world.substeps_per_frame = 8
    world.solver_iterations = 30
    world.point_cache.frame_start = 1
    world.point_cache.frame_end = MAX_FRAMES
    scene.gravity = (0, 0, GRAVITY)

    h = common.TRAY_INNER
    t = 3.0  # grosor de colision: evita que un dado atraviese la pared
    add_box("floor", (0, 0, FLOOR_Z - 1), (40, 40, 2), friction=1.0, restitution=0.8)
    tall = 40.0
    # Paredes altas en 3 lados; la del sur (-Y) tiene la altura visible para dejar entrar.
    # Bullet multiplica los coeficientes de ambos cuerpos.
    wall_kw = dict(friction=0.4, restitution=1.0)
    add_box("north", (0, h + t / 2, tall / 2), (2 * h + 2 * t, t, tall), **wall_kw)
    add_box("east", (h + t / 2, 0, tall / 2), (t, 2 * h + 2 * t, tall), **wall_kw)
    add_box("west", (-h - t / 2, 0, tall / 2), (t, 2 * h + 2 * t, tall), **wall_kw)
    add_box("south", (0, -h - t / 2, common.WALL_TOP / 2), (2 * h + 2 * t, t, common.WALL_TOP), **wall_kw)
    # Esquinas a 45 grados que aproximan el radio interior de la bandeja.
    r = common.TRAY_CORNER
    offset = h - r * (1 - math.sqrt(0.5)) + t / 2 * math.sqrt(0.5)
    for sx, sy, height in ((1, 1, tall), (-1, 1, tall), (1, -1, common.WALL_TOP), (-1, -1, common.WALL_TOP)):
        add_box(
            f"corner{sx}{sy}",
            (sx * offset, sy * offset, height / 2),
            (t, t, height),
            rot_z=math.radians(45),
            **wall_kw,
        )


def add_die(index, rng, count):
    """Dado proxy (el visual se aplica en la web) con velocidad inicial por cinematica."""
    # Proxy de baja resolucion: rueda como cubo redondeado, no como caja perfecta.
    obj = common.rounded_cube(f"die{index}", common.DIE_SIZE, 0.11, 2)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.rigidbody.object_add(type="ACTIVE")
    obj.select_set(False)
    body = obj.rigid_body
    body.collision_shape = "CONVEX_HULL"
    body.mesh_source = "BASE"
    body.collision_margin = 0.0
    body.mass = 1.0
    body.friction = 0.85
    body.restitution = 0.55
    # Mas dados en la misma bandeja = menos energia, para que se asienten pronto.
    body.linear_damping = 0.08 + 0.03 * (count - 1)
    body.angular_damping = 0.12 + 0.05 * (count - 1)
    body.use_deactivation = True
    body.use_start_deactivated = False
    body.deactivate_linear_velocity = 0.25
    body.deactivate_angular_velocity = 0.35

    # Salida fuera de cuadro, al sur, en rejilla de 3 columnas. La separacion
    # supera la diagonal del cubo (1.73): si nacieran solapados, Bullet los
    # separaria de un latigazo.
    spacing = 1.85
    columns = min(count, 3)
    rows = math.ceil(count / 3)
    column = index % 3
    row = index // 3
    in_row = columns if row < rows - 1 or count % 3 == 0 else count % 3
    x0 = (column - (in_row - 1) / 2) * spacing + rng.uniform(-0.03, 0.03)
    start = Vector((x0, -13.0 - row * spacing, 3.2 + rng.uniform(0, 0.08)))
    target_x = x0 * 0.7 + rng.uniform(-0.7, 0.7)
    target_y = rng.uniform(-2.8, -0.9)
    speed_y = rng.uniform(14.0, 18.0) - 0.5 * (count - 1)
    flight = (target_y - start.y) / speed_y
    velocity = Vector((
        (target_x - start.x) / flight,
        speed_y,
        # z = z0 + vz*t + g*t^2/2 => cae sobre el objetivo a media altura
        (0.8 - start.z - 0.5 * GRAVITY * flight * flight) / flight,
    ))
    euler0 = Euler((rng.uniform(0, 6.28), rng.uniform(0, 6.28), rng.uniform(0, 6.28)))
    spin = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))).normalized()
    spin_speed = rng.uniform(14.0, 24.0)  # rad/s

    obj.rotation_mode = "QUATERNION"
    dt = 1.0 / FPS
    # Keyframes de cinematica: al soltar, Bullet hereda la velocidad del ultimo tramo.
    q = euler0.to_quaternion()
    for f in range(1, LAUNCH_FRAMES + 1):
        tt = (f - 1) * dt
        pos = start + velocity * tt + Vector((0, 0, 0.5 * GRAVITY * tt * tt))
        obj.location = pos
        obj.rotation_quaternion = Quaternion(spin, spin_speed * tt) @ q
        obj.keyframe_insert("location", frame=f)
        obj.keyframe_insert("rotation_quaternion", frame=f)
    body.kinematic = True
    body.keyframe_insert("kinematic", frame=LAUNCH_FRAMES)
    body.kinematic = False
    body.keyframe_insert("kinematic", frame=LAUNCH_FRAMES + 1)
    return obj


def linear_fcurves(obj):
    """Interpolacion lineal/constante en la cinematica (Blender 5 usa slots/capas)."""
    bag = None
    action = obj.animation_data.action
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in strip.channelbags:
                bag = channelbag
    if bag is None:
        return
    for curve in bag.fcurves:
        for point in curve.keyframe_points:
            point.interpolation = "CONSTANT" if "kinematic" in curve.data_path else "LINEAR"


def simulate(rng, count):
    """Devuelve (frames, eventos) o None si la toma no es valida."""
    scene = bpy.context.scene
    dice = [add_die(i, rng, count) for i in range(count)]
    for die in dice:
        linear_fcurves(die)

    scene.frame_set(1)
    tracks = [[] for _ in dice]
    for frame in range(1, MAX_FRAMES + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        for track, die in zip(tracks, dice):
            matrix = die.matrix_world.copy()
            loc, rot, _ = matrix.decompose()
            track.append((loc.copy(), rot.copy()))

    for die in dice:
        bpy.data.objects.remove(die, do_unlink=True)
    return tracks


def speeds(track, frame):
    (p0, q0), (p1, q1) = track[frame - 1], track[frame]
    linear = (p1 - p0).length * FPS
    angular = q0.rotation_difference(q1).angle * FPS
    return linear, angular


def analyse(tracks):
    """Valida el final y calcula frame de reposo y eventos de impacto para el sonido."""
    rest_frame = 0
    for track in tracks:
        last_moving = 0
        for f in range(LAUNCH_FRAMES + 2, len(track)):
            lin, ang = speeds(track, f)
            if lin > 0.05 or ang > 0.08:
                last_moving = f
        if last_moving >= len(track) - 2:
            return None, "no se detuvo"
        rest_frame = max(rest_frame, last_moving + 1)

    if rest_frame / FPS > MAX_REST:
        return None, "lento"

    finals = []
    half = common.DIE_SIZE / 2
    limit = common.TRAY_INNER - half * 0.9
    for track in tracks:
        pos, rot = track[-1]
        if abs(pos.x) > limit or abs(pos.y) > limit:
            return None, f"fuera de bandeja {pos.x:.2f},{pos.y:.2f}"
        if abs(pos.z - half) > 0.02:
            return None, f"apilado o inclinado z={pos.z:.3f}"
        best = max(abs((rot @ n).z) for n in common.FACES.values())
        if best < 0.9995:
            return None, f"cara inclinada {best:.4f}"
        finals.append(pos)
    for i in range(len(finals)):
        for j in range(i + 1, len(finals)):
            if (finals[i] - finals[j]).length < 1.05:
                return None, "dados pegados"

    events = []
    for die_index, track in enumerate(tracks):
        last_event = -10
        for f in range(LAUNCH_FRAMES + 3, rest_frame + 1):
            p0, p1, p2 = track[f - 2][0], track[f - 1][0], track[f][0]
            v0 = (p1 - p0) * FPS
            v1 = (p2 - p1) * FPS
            # Se descuenta la gravedad; lo que queda es un golpe.
            dv = (v1 - v0 - Vector((0, 0, GRAVITY / FPS))).length
            if dv > 1.0 and f - last_event > 3:
                events.append({"t": round((f - 1) / FPS, 3), "v": round(min(dv / 22.0, 1.0), 3), "d": die_index})
                last_event = f
    events.sort(key=lambda e: e["t"])
    return {"rest": rest_frame, "events": events}, None


def to_yup_pos(p):
    return (p.x, p.z, -p.y)


def to_yup_quat(q):
    return (q.x, q.z, -q.y, q.w)  # orden x, y, z, w de three.js


def main():
    build_world()
    rng = random.Random(20261102)
    out = bytearray()
    manifest = {
        "version": 1,
        "fps": FPS / KEEP_EVERY,
        "posScale": POS_SCALE,
        "takes": {},
    }
    counts = [1, 6] if PROBE else [1, 2, 3, 4, 5, 6]
    target = 2 if PROBE else TAKES
    for count in counts:
        takes = []
        attempts = 0
        rejected = {}
        while len(takes) < target and attempts < target * 40:
            attempts += 1
            tracks = simulate(rng, count)
            info, reason = analyse(tracks)
            if info is None:
                key = reason.split(" ")[0]
                rejected[key] = rejected.get(key, 0) + 1
                if PROBE:
                    p = tracks[0]
                    print(f"  REJECT n={count}: {reason}; f10={p[9][0][:]} f30={p[29][0][:]}")
                continue
            rest = info["rest"]
            frames = rest // KEEP_EVERY + 2
            offset = len(out)
            for track in tracks:
                for k in range(frames):
                    f = min(k * KEEP_EVERY, len(track) - 1)
                    pos, rot = track[f]
                    x, y, z = to_yup_pos(pos)
                    qx, qy, qz, qw = to_yup_quat(rot.normalized())
                    out += struct.pack(
                        "<7h",
                        round(x * POS_SCALE) if abs(x) < 32 else int(math.copysign(32000, x)),
                        round(y * POS_SCALE) if abs(y) < 32 else 32000,
                        round(z * POS_SCALE) if abs(z) < 32 else int(math.copysign(32000, z)),
                        round(qx * 32767),
                        round(qy * 32767),
                        round(qz * 32767),
                        round(qw * 32767),
                    )
            # Cara visible al final por dado, en el marco del cuerpo.
            ups = []
            for track in tracks:
                rot = track[-1][1]
                value = max(common.FACES, key=lambda v: (rot @ common.FACES[v]).z)
                ups.append(value)
            takes.append({
                "offset": offset,
                "frames": frames,
                "rest": round(rest / FPS, 3),
                "up": ups,
                "events": info["events"],
            })
            print(f"OK n={count} take={len(takes)} rest={rest / FPS:.2f}s impactos={len(info['events'])}")
        print(f"RESUMEN n={count}: {len(takes)}/{attempts} rechazos={rejected}")
        manifest["takes"][str(count)] = takes

    if PROBE:
        print("PROBE: sin escribir archivos")
        return
    with open(os.path.join(OUT_DIR, "throws.bin"), "wb") as fh:
        fh.write(out)
    manifest["faces"] = {
        str(v): list(to_yup_pos(n)) for v, n in common.FACES.items()
    }
    with open(os.path.join(OUT_DIR, "throws.json"), "w") as fh:
        json.dump(manifest, fh, separators=(",", ":"))
    print("BYTES", len(out))


main()
