// Renders public/icons/*.png from public/icons/icon.svg. Run: node scripts/make-icons.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync("public/icons/icon.svg");
const out = "public/icons";

await sharp(svg, { density: 384 }).resize(192, 192).png().toFile(`${out}/icon-192.png`);
await sharp(svg, { density: 384 }).resize(512, 512).png().toFile(`${out}/icon-512.png`);
// Apple draws its own rounded corners, so the icon must be full-bleed and opaque.
const full = readFileSync("public/icons/icon.svg", "utf8").replace('rx="112"', 'rx="0"');
await sharp(Buffer.from(full), { density: 384 }).resize(180, 180).png().toFile(`${out}/apple-touch-icon.png`);
// Maskable: full-bleed background, the tomato shrunk into the central safe zone (80%).
const inner = full.replace(/<svg[^>]*>/, "").replace("</svg>", "");
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#f6f1e9"/><g transform="translate(51 51) scale(0.8)">${inner}</g></svg>`;
await sharp(Buffer.from(maskable), { density: 384 }).resize(512, 512).png().toFile(`${out}/icon-maskable-512.png`);
