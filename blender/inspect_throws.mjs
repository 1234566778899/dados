// Audita throws.bin: trayectorias, saltos entre frames, tomas distintas y tamano.
// Uso: node blender/inspect_throws.mjs
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const dir = new URL("../public/models/", import.meta.url);
const m = JSON.parse(readFileSync(new URL("throws.json", dir)));
const raw = readFileSync(new URL("throws.bin", dir));
const data = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
console.log("bin", raw.length, "gz", gzipSync(raw).length, "json", JSON.stringify(m).length);

const STRIDE = 7;
const signatures = new Set();
const faces = {};
const finals = [];
let worstJump = 0;
let worstSpin = 0;
for (const [countKey, takes] of Object.entries(m.takes)) {
  const count = Number(countKey);
  const rests = takes.map((t) => t.rest);
  console.log(`n=${count} tomas=${takes.length} reposo ${Math.min(...rests)}-${Math.max(...rests)}s`);
  takes.forEach((take, ti) => {
    for (let d = 0; d < count; d++) {
      const start = take.offset / 2 + d * take.frames * STRIDE;
      const at = (f) => Array.from(data.subarray(start + f * STRIDE, start + (f + 1) * STRIDE));
      const p = (f) => at(f).slice(0, 3).map((v) => v / m.posScale);
      let maxY = -Infinity;
      for (let f = 1; f < take.frames; f++) {
        const [a, b] = [p(f - 1), p(f)];
        worstJump = Math.max(worstJump, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
        const qa = at(f - 1).slice(3).map((v) => v / 32767);
        const qb = at(f).slice(3).map((v) => v / 32767);
        const dot = Math.min(1, Math.abs(qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3]));
        worstSpin = Math.max(worstSpin, 2 * Math.acos(dot));
        maxY = Math.max(maxY, a[1]);
      }
      faces[take.up[d]] = (faces[take.up[d]] ?? 0) + 1;
      finals.push(p(take.frames - 1));
      signatures.add(p(take.frames - 1).map((v) => v.toFixed(2)).join());
      if (ti === 0 && d === 0) {
        const line = [0, 3, 6, 9, 12, 18, 24, take.frames - 1]
          .filter((f) => f < take.frames)
          .map((f) => `f${f}(${p(f).map((v) => v.toFixed(1)).join(",")})`)
          .join(" ");
        console.log("  ", line, `alturaMax=${maxY.toFixed(1)}`);
      }
    }
  });
}
const total = Object.entries(m.takes).reduce((s, [c, t]) => s + Number(c) * t.length, 0);
console.log(`posiciones finales unicas ${signatures.size}/${total}`);
console.log("caras arriba", faces);
console.log(`mayor salto entre frames ${worstJump.toFixed(2)}u, mayor giro ${worstSpin.toFixed(2)}rad`);
const mean = (i) => finals.reduce((a, f) => a + f[i], 0) / finals.length;
const std = (i) => Math.sqrt(finals.reduce((a, f) => a + (f[i] - mean(i)) ** 2, 0) / finals.length);
console.log(`final x media ${mean(0).toFixed(2)} sd ${std(0).toFixed(2)} | z media ${mean(2).toFixed(2)} sd ${std(2).toFixed(2)}`);
