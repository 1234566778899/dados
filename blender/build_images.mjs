// Convierte el render de la bandeja en el poster de carga.
// Uso: node blender/build_images.mjs <carpeta-con-renders>
// La marca (iconos, imagen social) sale de art/build_brand.mjs.
import sharp from "sharp";

const input = process.argv[2];
const root = new URL("../", import.meta.url).pathname;
await sharp(`${input}/poster.png`).resize(900).webp({ quality: 82, alphaQuality: 90 }).toFile(`${root}public/poster.webp`);
console.log("POSTER OK");
