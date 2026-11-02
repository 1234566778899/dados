// Recorta las hojas generadas con IA en piezas limpias para la web.
// Uso: node art/slice.mjs <carpeta-con-hojas>
// Cada recorte: limpia motas sueltas (componentes pequenos), recorta al contenido y exporta webp.
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const input = process.argv[2];
const root = new URL("../public/art/", import.meta.url).pathname;
mkdirSync(root, { recursive: true });

async function clean(file, [x0, y0, x1, y1], minArea) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const seen = new Uint8Array(width * height);
  const alpha = (i) => data[i * 4 + 3];
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || alpha(start) < 40) continue;
    const stack = [start];
    const members = [];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      members.push(i);
      const px = i % width;
      for (const n of [px > 0 ? i - 1 : -1, px < width - 1 ? i + 1 : -1, i - width, i + width]) {
        if (n >= 0 && n < width * height && !seen[n] && alpha(n) >= 40) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (members.length < minArea) for (const i of members) data[i * 4 + 3] = 0;
  }
  // Lo casi transparente fuera de las piezas son restos de la generacion.
  for (let i = 0; i < width * height; i++) if (alpha(i) < 40) data[i * 4 + 3] = 0;
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function piece(sheet, rect, name, width, minArea = 400) {
  const buffer = await clean(`${input}/${sheet}`, rect, minArea);
  const trimmed = await sharp(buffer).trim({ threshold: 1 }).png().toBuffer();
  const out = sharp(trimmed).resize({ width, withoutEnlargement: true });
  const result = await out.webp({ quality: 88, alphaQuality: 95, effort: 6 }).toFile(`${root}${name}.webp`);
  console.log(name, `${result.width}x${result.height}`, `${(result.size / 1024).toFixed(1)}KB`);
}

const UI = "tirada-sheet-ui.png";
await piece(UI, [20, 175, 422, 352], "btn-red", 402);
await piece(UI, [428, 175, 828, 352], "btn-green", 400);
await piece(UI, [830, 175, 1238, 352], "btn-cream", 408);
await piece(UI, [20, 398, 422, 550], "btn-red-down", 402);
await piece(UI, [428, 398, 828, 550], "btn-green-down", 400);
await piece(UI, [830, 398, 1238, 550], "btn-cream-down", 408);
await piece(UI, [25, 600, 262, 842], "ic-sound", 128);
await piece(UI, [266, 600, 502, 842], "ic-mute", 128);
await piece(UI, [508, 600, 744, 842], "ic-history", 128);
await piece(UI, [750, 600, 988, 842], "ic-trophy", 128);
await piece(UI, [992, 600, 1228, 842], "ic-help", 128);
await piece(UI, [20, 925, 684, 1145], "banner", 660);
await piece(UI, [690, 885, 988, 1168], "panel", 298);
await piece(UI, [1000, 918, 1228, 1148], "coin", 96);

const M = "tirada-sheet-mascot.png";
await piece(M, [60, 20, 1205, 412], "logo", 640, 2000);
await piece(M, [10, 470, 372, 825], "m-wave", 280, 600);
await piece(M, [425, 400, 812, 815], "m-jackpot", 280, 300);
await piece(M, [858, 488, 1230, 825], "m-happy", 280, 600);
await piece(M, [45, 895, 340, 1238], "m-sad", 240, 600);
await piece(M, [412, 865, 792, 1228], "m-dizzy", 280, 300);
await piece(M, [848, 850, 1240, 1240], "m-sleep", 280, 300);

const MEDALS = "tirada-sheet-medals.png";
const columns = [[30, 395], [410, 775], [790, 1165]];
const rows = [[15, 425], [438, 848], [858, 1275]];
const medalIds = ["first", "doubles", "triple", "straight", "crown", "snake", "streak", "hundred", "clover"];
for (let i = 0; i < 9; i++) {
  const [x0, x1] = columns[i % 3];
  const [y0, y1] = rows[Math.floor(i / 3)];
  await piece(MEDALS, [x0, y0, x1, y1], `medal-${medalIds[i]}`, 176);
}

const S = "tirada-sheet-stickers.png";
await piece(S, [25, 5, 720, 348], "st-dobles", 560);
await piece(S, [830, 5, 1350, 338], "st-trio", 480);
await piece(S, [25, 365, 748, 702], "st-escalera", 600);
await piece(S, [808, 365, 1412, 708], "st-pleno", 520);
await piece(S, [90, 720, 628, 1072], "st-seis", 460);
await piece(S, [768, 725, 1408, 1072], "st-logro", 520);
