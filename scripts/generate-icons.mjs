// Generates PWA / favicon PNGs from the SPARK mark. Run: node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const mark = (padding = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FF6482"/><stop offset="0.55" stop-color="#FF8A73"/><stop offset="1" stop-color="#FFB36B"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${padding ? 0 : 160}" fill="url(#g)"/>
  <g transform="translate(256 256) scale(${padding ? 0.72 : 1}) translate(-256 -256)">
    <path d="M256 104c14.4 73.6 48 107.2 152 152-104 44.8-137.6 78.4-152 152-14.4-73.6-48-107.2-152-152 104-44.8 137.6-78.4 152-152Z" fill="#27212B"/>
    <circle cx="392" cy="128" r="28.8" fill="#fff" opacity=".9"/>
  </g>
</svg>`;

mkdirSync("public/icons", { recursive: true });
const jobs = [
  ["public/icons/icon-192.png", 192, mark()],
  ["public/icons/icon-512.png", 512, mark()],
  ["public/icons/icon-maskable-512.png", 512, mark(1)],
  ["public/icons/apple-touch-icon.png", 180, mark(1)],
];
for (const [file, size, svg] of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
  console.log("wrote", file);
}
