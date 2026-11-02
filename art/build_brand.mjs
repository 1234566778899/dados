// Fondos, iconos e imagen social a partir de las imagenes generadas.
// Uso: node art/build_brand.mjs <carpeta-con-hojas>
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const input = process.argv[2];
const root = new URL("../", import.meta.url).pathname;
const art = `${root}public/art/`;
mkdirSync(`${root}public/icons`, { recursive: true });

await sharp(`${input}/tirada-bg.png`).webp({ quality: 78, effort: 6 }).toFile(`${art}bg-wide.webp`);
await sharp(`${input}/tirada-bg-portrait.png`).webp({ quality: 78, effort: 6 }).toFile(`${art}bg-tall.webp`);

const icon = `${input}/tirada-icon.png`;
const rounded = (size) =>
  Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.22}"/></svg>`);
const roundedIcon = (size) =>
  sharp(icon).resize(size, size).composite([{ input: rounded(size), blend: "dest-in" }]).png();

await roundedIcon(64).toFile(`${root}src/app/icon.png`);
await sharp(icon).resize(180, 180).flatten().png().toFile(`${root}src/app/apple-icon.png`);
await roundedIcon(192).toFile(`${root}public/icons/icon-192.png`);
await roundedIcon(512).toFile(`${root}public/icons/icon-512.png`);
// Enmascarable: Android recorta en circulo, el personaje debe caber en la zona segura.
await sharp({ create: { width: 512, height: 512, channels: 3, background: "#13402f" } })
  .composite([{ input: await sharp(icon).resize(410, 410).png().toBuffer(), gravity: "center" }])
  .png()
  .toFile(`${root}public/icons/maskable-512.png`);

// El logo ya recortado y limpio de restos de la hoja (art/slice.mjs).
const logo = await sharp(`${art}logo.webp`).resize({ width: 620 }).png().toBuffer();
const mascot = await sharp(`${art}m-jackpot.webp`).resize({ height: 440 }).png().toBuffer();
const tagline = Buffer.from(`<svg width="620" height="110" xmlns="http://www.w3.org/2000/svg" font-family="Arial Rounded MT Bold, Helvetica Neue, Arial, sans-serif" font-weight="700" text-anchor="middle">
  <text x="310" y="46" font-size="38" fill="#f7f2e7" stroke="#2b211b" stroke-width="7" paint-order="stroke">Lanza dados con física 3D real</text>
  <text x="310" y="98" font-size="38" fill="#f6c343" stroke="#2b211b" stroke-width="7" paint-order="stroke">Gratis y sin anuncios</text>
</svg>`);
await sharp(`${input}/tirada-bg.png`)
  .resize(1200, 630, { fit: "cover" })
  .composite([
    { input: logo, left: 40, top: 130 },
    { input: tagline, left: 40, top: 380 },
    { input: mascot, left: 720, top: 110 },
  ])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(`${root}src/app/opengraph-image.jpg`);
console.log("MARCA OK");
