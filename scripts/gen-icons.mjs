// Builds the app icons from one source image (assets-src/icon.png if present,
// otherwise a generated negative hand stencil on torch-lit rock).
import { existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const OUT = 'public/icons';
mkdirSync(OUT, { recursive: true });

function svgSource() {
  // Hand silhouette built from the same proportions as the in-game stencil.
  const fingers = [
    [-0.36, 0.18, -0.8, -0.2, 0.12],
    [-0.24, -0.22, -0.36, -0.95, 0.1],
    [-0.04, -0.26, -0.06, -1.06, 0.105],
    [0.15, -0.24, 0.24, -0.97, 0.1],
    [0.32, -0.16, 0.5, -0.7, 0.085],
  ];
  const S = 200;
  const cx = 512;
  const cy = 470;
  const P = (v) => (v * S).toFixed(1);
  const shape = (extra) => `
    <ellipse cx="${cx + -0.02 * S}" cy="${cy + 0.12 * S}" rx="${0.4 * S + extra}" ry="${0.42 * S + extra}"/>
    ${fingers
      .map(
        ([ax, ay, bx, by, r]) =>
          `<line x1="${cx + +P(ax)}" y1="${cy + +P(ay)}" x2="${cx + +P(bx)}" y2="${cy + +P(by)}" stroke-width="${2 * r * S + 2 * extra}" stroke-linecap="round"/>`,
      )
      .join('')}
    <line x1="${cx}" y1="${cy + 0.45 * S}" x2="${cx}" y2="${cy + 1.05 * S}" stroke-width="${0.54 * S + 2 * extra}" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <defs>
    <radialGradient id="light" cx="0.78" cy="0.85" r="1.1">
      <stop offset="0" stop-color="#c99a6a"/><stop offset="0.45" stop-color="#6e5040"/><stop offset="1" stop-color="#140d09"/>
    </radialGradient>
    <filter id="spray" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="26" result="b"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="3" result="n"/>
      <feDisplacementMap in="b" in2="n" scale="18"/>
    </filter>
    <filter id="rock"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="5" seed="7"/>
      <feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.4  0 0 0 0 0.3  0 0 0 0.35 0"/></filter>
    <mask id="cut"><rect width="1024" height="1024" fill="white"/><g fill="black" stroke="black">${shape(0)}</g></mask>
  </defs>
  <rect width="1024" height="1024" fill="url(#light)"/>
  <rect width="1024" height="1024" filter="url(#rock)"/>
  <g mask="url(#cut)"><g fill="#8c3a24" stroke="#8c3a24" filter="url(#spray)" opacity="0.95">${shape(34)}</g></g>
</svg>`;
}

const src = existsSync('assets-src/icon.png') ? sharp('assets-src/icon.png') : sharp(Buffer.from(svgSource()));
const base = await src.resize(1024, 1024).png().toBuffer();

await sharp(base).resize(192, 192).png().toFile(`${OUT}/icon-192.png`);
await sharp(base).resize(512, 512).png().toFile(`${OUT}/icon-512.png`);
await sharp(base).resize(180, 180).png().toFile(`${OUT}/apple-touch-icon.png`);
// Maskable: keep the subject inside the 80% safe zone.
const inner = await sharp(base).resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#2a1c14' } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile(`${OUT}/icon-maskable-512.png`);
console.log('icons written to', OUT);
