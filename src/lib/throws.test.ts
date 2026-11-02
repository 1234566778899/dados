import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { fairFace } from "./fair";
import { faceCorrection, samplePose, yawRotation, type ThrowsData, type ThrowsManifest } from "./throws";

const dir = resolve(__dirname, "../../public/models");
const manifest = JSON.parse(readFileSync(resolve(dir, "throws.json"), "utf8")) as ThrowsManifest;
const raw = readFileSync(resolve(dir, "throws.bin"));
const data: ThrowsData = {
  manifest,
  samples: new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)),
};

describe("poses horneadas", () => {
  it("muestra arriba la cara pedida en toda toma, dado, valor y direccion", () => {
    const up = new Vector3(0, 1, 0);
    const position = new Vector3();
    const rotation = new Quaternion();
    let checked = 0;
    for (const [count, takes] of Object.entries(manifest.takes)) {
      for (const take of takes) {
        for (let die = 0; die < Number(count); die++) {
          for (let value = 1; value <= 6; value++) {
            for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
              const correction = faceCorrection(manifest, value, take.up[die]);
              samplePose(data, take, die, take.rest + 1, correction, yawRotation(angle), position, rotation);
              const normal = new Vector3(...manifest.faces[value]).applyQuaternion(rotation);
              expect(normal.dot(up)).toBeGreaterThan(0.999);
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBe(252 * 6 * 4);
  });

  it("la correccion es una simetria del cubo: ejes en ejes", () => {
    for (let a = 1; a <= 6; a++) {
      for (let b = 1; b <= 6; b++) {
        const q = faceCorrection(manifest, a, b);
        for (const axis of [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]) {
          const v = axis.applyQuaternion(q);
          expect(Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z))).toBeCloseTo(1, 5);
        }
      }
    }
  });

  it("las caras opuestas suman 7", () => {
    for (let v = 1; v <= 6; v++) {
      const a = new Vector3(...manifest.faces[v]);
      const b = new Vector3(...manifest.faces[7 - v]);
      expect(a.dot(b)).toBe(-1);
    }
  });

  it("los dados terminan en el piso y dentro de la bandeja, sea cual sea la direccion", () => {
    const position = new Vector3();
    const rotation = new Quaternion();
    for (const [count, takes] of Object.entries(manifest.takes)) {
      for (const take of takes) {
        for (let die = 0; die < Number(count); die++) {
          samplePose(data, take, die, 99, new Quaternion(), yawRotation(Math.PI / 2), position, rotation);
          expect(position.y).toBeCloseTo(0.5, 1);
          expect(Math.abs(position.x)).toBeLessThan(3.6);
          expect(Math.abs(position.z)).toBeLessThan(3.6);
        }
      }
    }
  });
});

describe("fairFace", () => {
  it("descarta los bytes que introducirian sesgo", () => {
    const sequence = [255, 252, 0];
    let i = 0;
    expect(fairFace((out) => (out[0] = sequence[i++]))).toBe(1);
    expect(i).toBe(3);
  });

  it("cada byte aceptado cae exactamente igual de veces en cada cara", () => {
    const counts = [0, 0, 0, 0, 0, 0];
    for (let byte = 0; byte < 252; byte++) {
      counts[fairFace((out) => (out[0] = byte)) - 1]++;
    }
    expect(counts).toEqual([42, 42, 42, 42, 42, 42]);
  });

  it("pasa chi-cuadrado con el generador real", () => {
    const n = 600_000;
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) counts[fairFace() - 1]++;
    const expected = n / 6;
    const chi = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    // 5 grados de libertad; p = 0.001 => 20.52
    expect(chi).toBeLessThan(20.52);
  });
});
