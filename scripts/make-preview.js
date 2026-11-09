// Génère docs/preview.png (1200x630) : l'icône de la carte sur fond vert.
// Usage : node scripts/make-preview.js
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const W = 1200, H = 630, SS = 3; // SS : suréchantillonnage pour lisser les bords
const BG = [0x0f, 0x6b, 0x5e], FG = [255, 255, 255];

function inside(x, y) {
  const head = (x - 600) ** 2 + (y - 255) ** 2 <= 105 ** 2;
  const body = y >= 395 && y <= 500 && ((x - 600) / 215) ** 2 + ((y - 500) / 125) ** 2 <= 1;
  return head || body;
}

const png = new PNG({ width: W, height: H });
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let hit = 0;
  for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++)
    if (inside(x + (i + 0.5) / SS, y + (j + 0.5) / SS)) hit++;
  const t = hit / (SS * SS), o = (y * W + x) * 4;
  for (let c = 0; c < 3; c++) png.data[o + c] = Math.round(BG[c] + (FG[c] - BG[c]) * t);
  png.data[o + 3] = 255;
}
const out = path.join(__dirname, "..", "docs", "preview.png");
fs.writeFileSync(out, PNG.sync.write(png));
console.log(out, fs.statSync(out).size, "octets");
