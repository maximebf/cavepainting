// Procedural limestone wall: an albedo map and a normal+height map, from a seed.
// Low-frequency fields are computed on a coarse grid and upsampled to keep start-up fast.

import { fbm, ridged, valueNoise } from '../sim/noise';

export interface WallMaps {
  /** RGB colour of the rock. */
  albedo: ImageData;
  /** R,G = normal xy (y down), B = height. */
  normal: ImageData;
}

const COARSE = 4;
const RELIEF_PX = 70;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function sstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function generateWall(seed: number, w: number, h: number): WallMaps {
  const cw = Math.ceil(w / COARSE) + 2;
  const ch = Math.ceil(h / COARSE) + 2;
  const cHeight = new Float32Array(cw * ch);
  const cTone = new Float32Array(cw * ch);
  const cStain = new Float32Array(cw * ch);
  const cFlow = new Float32Array(cw * ch);

  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const X = (i * COARSE) / 420;
      const Y = (j * COARSE) / 420;
      // Domain warp makes the rock look folded rather than cloudy.
      const wx = X + 0.7 * fbm(X * 0.6, Y * 0.6, seed + 1, 3);
      const wy = Y + 0.7 * fbm(X * 0.6 + 7.3, Y * 0.6, seed + 2, 3);
      const big = fbm(wx * 0.8, wy * 0.8, seed + 3, 4);
      const crack = ridged(wx * 1.9, wy * 1.9, seed + 4, 3);
      const mid = fbm(X * 4.5, Y * 4.5, seed + 5, 3);
      const k = j * cw + i;
      cHeight[k] = 0.66 * big + 0.2 * mid - 0.3 * Math.pow(crack, 7);
      cTone[k] = fbm(wx * 1.4, wy * 1.4, seed + 6, 3);
      cStain[k] = fbm(X * 1.2, Y * 1.2, seed + 7, 3);
      // Calcite flowstone: streaks that run down the wall.
      cFlow[k] = fbm(X * 7, Y * 0.5, seed + 8, 3);
    }
  }

  const sample = (f: Float32Array, x: number, y: number): number => {
    const fx = x / COARSE;
    const fy = y / COARSE;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const tx = fx - i;
    const ty = fy - j;
    const k = j * cw + i;
    return lerp(lerp(f[k]!, f[k + 1]!, tx), lerp(f[k + cw]!, f[k + cw + 1]!, tx), ty);
  };

  const H = new Float32Array(w * h);
  let hMin = Infinity;
  let hMax = -Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fine = valueNoise(x / 6, y / 6, seed + 9) * 0.7 + valueNoise(x / 2.5, y / 2.5, seed + 10) * 0.3;
      const v = sample(cHeight, x, y) + 0.016 * fine;
      H[y * w + x] = v;
      if (v < hMin) hMin = v;
      if (v > hMax) hMax = v;
    }
  }
  const span = hMax - hMin || 1;
  for (let i = 0; i < H.length; i++) H[i] = (H[i]! - hMin) / span;

  const albedo = new ImageData(w, h);
  const normal = new ImageData(w, h);
  const A = albedo.data;
  const N = normal.data;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      const hv = H[k]!;
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(w - 1, x + 1);
      const dx = ((H[y * w + x1]! - H[y * w + x0]!) * RELIEF_PX) / 2;
      const dy = ((H[y1 * w + x]! - H[y0 * w + x]!) * RELIEF_PX) / 2;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const o = k * 4;
      N[o] = (-dx * inv * 0.5 + 0.5) * 255;
      N[o + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      N[o + 2] = hv * 255;
      N[o + 3] = 255;

      // Limestone colour.
      const tone = sample(cTone, x, y);
      let r = lerp(92, 156, tone);
      let g = lerp(78, 136, tone);
      let b = lerp(64, 112, tone);
      // Iron staining (warm patches).
      const stain = sstep(0.55, 0.75, sample(cStain, x, y));
      r = lerp(r, 150, stain * 0.55);
      g = lerp(g, 104, stain * 0.55);
      b = lerp(b, 72, stain * 0.55);
      // Pale calcite flowstone.
      const flow = sstep(0.62, 0.78, sample(cFlow, x, y)) * sstep(0.3, 0.7, hv);
      r = lerp(r, 190, flow * 0.5);
      g = lerp(g, 178, flow * 0.5);
      b = lerp(b, 160, flow * 0.5);
      // Hollows hold soot and shadow.
      const ao = 0.5 + 0.62 * sstep(0.05, 0.75, hv);
      const grain = 0.9 + 0.2 * valueNoise(x / 1.3, y / 1.3, seed + 11);
      A[o] = Math.min(255, r * ao * grain);
      A[o + 1] = Math.min(255, g * ao * grain);
      A[o + 2] = Math.min(255, b * ao * grain);
      A[o + 3] = 255;
    }
  }
  return { albedo, normal };
}
