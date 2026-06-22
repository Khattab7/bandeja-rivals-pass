import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

async function generate() {
  const W = 750, H = 288;

  // Resize logo to fit nicely (height 56px, transparent bg preserved)
  const logoResized = await sharp(path.join(root, "public/bandeja-logo.png"))
    .resize({ height: 56, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const logoMeta = await sharp(logoResized).metadata();
  const logoW = logoMeta.width ?? 220;
  const logoX = Math.floor((W - logoW) / 2);
  const logoY = 72;

  const svg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <!-- Decorative diagonal lines bottom-left -->
      <line x1="0" y1="${H}" x2="${W * 0.35}" y2="0" stroke="#8CF702" stroke-width="2.5" opacity="0.35"/>
      <line x1="0" y1="${H * 0.78}" x2="${W * 0.28}" y2="0" stroke="white" stroke-width="1" opacity="0.12"/>

      <!-- Decorative diagonal lines top-right -->
      <line x1="${W}" y1="0" x2="${W * 0.65}" y2="${H}" stroke="#8CF702" stroke-width="2.5" opacity="0.35"/>
      <line x1="${W}" y1="${H * 0.22}" x2="${W * 0.72}" y2="${H}" stroke="white" stroke-width="1" opacity="0.12"/>

      <!-- Tagline below logo -->
      <text
        x="${W / 2}" y="${logoY + 56 + 38}"
        fill="rgba(255,255,255,0.35)"
        font-family="Arial, Helvetica, sans-serif"
        font-size="15"
        letter-spacing="6"
        text-anchor="middle"
      >SWIPE . BATTLE . REPEAT.</text>

      <!-- Green footer bar -->
      <rect y="${H - 20}" width="${W}" height="20" fill="#8CF702"/>

      <!-- Footer text -->
      <text
        x="${W / 2}" y="${H - 6}"
        fill="#0d0d0d"
        font-family="Arial, Helvetica, sans-serif"
        font-size="11"
        font-weight="bold"
        letter-spacing="4"
        text-anchor="middle"
      >★ OFFICIAL BANDEJA RIVALS MEMBER ★</text>
    </svg>
  `);

  const strip2x = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 13, g: 13, b: 13, alpha: 255 } },
  })
    .composite([
      { input: svg, top: 0, left: 0 },
      { input: logoResized, top: logoY, left: logoX },
    ])
    .png()
    .toBuffer();

  const strip1x = await sharp(strip2x).resize(375, 144).png().toBuffer();

  const outDir = path.join(root, "public/pass-model/bandeja.pass");
  fs.writeFileSync(path.join(outDir, "strip@2x.png"), strip2x);
  fs.writeFileSync(path.join(outDir, "strip.png"), strip1x);
  fs.writeFileSync(path.join(outDir, "strip@3x.png"),
    await sharp(strip2x).resize(1125, 432).png().toBuffer()
  );

  console.log("Strip images generated successfully.");
}

generate().catch(console.error);
