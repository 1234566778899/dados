import { Quaternion, Vector3 } from "three";

/** Lanzamientos horneados en Blender (ver blender/bake_throws.py). */
export type ImpactEvent = { t: number; v: number; d: number };

export type Take = {
  offset: number;
  frames: number;
  rest: number;
  up: number[];
  events: ImpactEvent[];
};

export type ThrowsManifest = {
  version: number;
  fps: number;
  posScale: number;
  takes: Record<string, Take[]>;
  faces: Record<string, [number, number, number]>;
};

export type ThrowsData = { manifest: ThrowsManifest; samples: Int16Array };

const STRIDE = 7;
const WORLD_UP = new Vector3(0, 1, 0);

const scratchA = new Quaternion();
const scratchB = new Quaternion();

/**
 * Rotacion en el marco del dado que lleva la cara `wanted` al lugar de la cara
 * `landed`. Como ambas normales son ejes del cubo, es una simetria del cubo:
 * la silueta y por tanto la fisica no cambian, solo los puntos que se ven.
 */
export function faceCorrection(manifest: ThrowsManifest, wanted: number, landed: number): Quaternion {
  const from = new Vector3(...manifest.faces[wanted]);
  const to = new Vector3(...manifest.faces[landed]);
  return new Quaternion().setFromUnitVectors(from, to);
}

export function yawRotation(angle: number): Quaternion {
  return new Quaternion().setFromAxisAngle(WORLD_UP, angle);
}

/** Pose de un dado en el segundo `time`: Yaw * pista(t) * correccion. */
export function samplePose(
  data: ThrowsData,
  take: Take,
  die: number,
  time: number,
  correction: Quaternion,
  yaw: Quaternion,
  outPosition: Vector3,
  outRotation: Quaternion,
) {
  const { manifest, samples } = data;
  const frame = Math.min(Math.max(time * manifest.fps, 0), take.frames - 1);
  const f0 = Math.floor(frame);
  const f1 = Math.min(f0 + 1, take.frames - 1);
  const k = frame - f0;
  const base = take.offset / 2 + die * take.frames * STRIDE;
  const a = base + f0 * STRIDE;
  const b = base + f1 * STRIDE;
  const scale = 1 / manifest.posScale;

  outPosition.set(
    (samples[a] + (samples[b] - samples[a]) * k) * scale,
    (samples[a + 1] + (samples[b + 1] - samples[a + 1]) * k) * scale,
    (samples[a + 2] + (samples[b + 2] - samples[a + 2]) * k) * scale,
  );
  outPosition.applyQuaternion(yaw);

  const q = 1 / 32767;
  scratchA.set(samples[a + 3] * q, samples[a + 4] * q, samples[a + 5] * q, samples[a + 6] * q);
  scratchB.set(samples[b + 3] * q, samples[b + 4] * q, samples[b + 5] * q, samples[b + 6] * q);
  scratchA.slerp(scratchB, k).normalize();
  outRotation.copy(yaw).multiply(scratchA).multiply(correction);
}

export async function loadThrows(baseUrl = "/models"): Promise<ThrowsData> {
  const [manifest, buffer] = await Promise.all([
    fetch(`${baseUrl}/throws.json`).then((r) => {
      if (!r.ok) throw new Error(`throws.json ${r.status}`);
      return r.json() as Promise<ThrowsManifest>;
    }),
    fetch(`${baseUrl}/throws.bin`).then((r) => {
      if (!r.ok) throw new Error(`throws.bin ${r.status}`);
      return r.arrayBuffer();
    }),
  ]);
  return { manifest, samples: new Int16Array(buffer) };
}
