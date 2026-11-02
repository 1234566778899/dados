// Convierte los renders de Blender en poster, iconos e imagen social.
// Uso: node blender/build_images.mjs <carpeta-con-renders>
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const input = process.argv[2];
const root = new URL("../", import.meta.url).pathname;
const BG = "#f3efe7";
mkdirSync(`${root}public/icons`, { recursive: true });

await sharp(`${input}/poster.png`).resize(900).webp({ quality: 82, alphaQuality: 90 }).toFile(`${root}public/poster.webp`);
const ogText = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" fill="#1c1815">
  <text x="72" y="300" font-size="92" font-weight="700" letter-spacing="-3">Tirada</text>
  <text x="74" y="362" font-size="33" fill="#6f675d">Dados 3D con física real.</text>
  <text x="74" y="406" font-size="33" fill="#6f675d">Justos y sin anuncios.</text>
</svg>`;
await sharp({ create: { width: 1200, height: 630, channels: 4, background: BG } })
  .composite([{ input: `${input}/og.png` }, { input: Buffer.from(ogText) }])
  .flatten({ background: BG })
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(`${root}src/app/opengraph-image.jpg`);

const die = (size) => sharp(`${input}/icon.png`).trim().resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
const onBackground = async (canvas, dieSize) =>
  sharp({ create: { width: canvas, height: canvas, channels: 4, background: BG } })
    .composite([{ input: await die(dieSize), gravity: "center" }])
    .png();

await sharp(await die(64)).toFile(`${root}src/app/icon.png`);
await (await onBackground(180, 136)).toFile(`${root}src/app/apple-icon.png`);
await sharp(await die(192)).toFile(`${root}public/icons/icon-192.png`);
await sharp(await die(512)).toFile(`${root}public/icons/icon-512.png`);
await (await onBackground(512, 300)).toFile(`${root}public/icons/maskable-512.png`);
console.log("IMAGENES OK");
