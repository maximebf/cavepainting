// Procedural textures: tool imprints ("dabs"), stencil objects, flame and torch.
// Everything is generated at start-up, so the game ships no image files.

import type Phaser from 'phaser';
import { DAB_VARIANTS } from '../sim/brush';
import { valueNoise } from '../sim/noise';
import { Rng } from '../sim/rng';
import { SHAPES, SHAPE_EXTENT } from '../sim/shapes';
import { ANIMALS, ANIMAL_BOX, type AnimalId } from '../content/animals';
import { STENCILS, TRACING, type DabTexture, type ShapeId } from '../units';

export const DAB_SIZE: Record<DabTexture, number> = {
  finger: 64,
  lump: 48,
  bristle: 64,
  twig: 48,
  speck: 16,
};

export function dabKey(tex: DabTexture, variant: number): string {
  return `dab-${tex}-${variant}`;
}

type AlphaFn = (u: number, v: number, rng: Rng, seed: number) => number;

/** u, v in [-1, 1]; the dab is drawn along +u (the stroke direction). */
const DAB_ALPHA: Record<DabTexture, (rng: Rng) => AlphaFn> = {
  finger: (rng) => {
    const squash = 0.78 + rng.next() * 0.15;
    return (u, v, _r, seed) => {
      const a = Math.atan2(v, u);
      const wobble = 0.82 + 0.12 * valueNoise(Math.cos(a) * 2 + 3, Math.sin(a) * 2 + 3, seed);
      const d = Math.hypot(u, v / squash) / wobble;
      const body = 1 - smooth(0.55, 1, d);
      // Faint fingerprint ridges.
      const ridges = 0.85 + 0.15 * Math.sin(Math.hypot(u * 1.1, v) * 38 + valueNoise(u * 3, v * 3, seed) * 4);
      return body * ridges * (0.75 + 0.25 * valueNoise(u * 5 + 10, v * 5, seed + 1));
    };
  },
  lump: () => (u, v, rng, seed) => {
    const d = Math.hypot(u, v * 1.15);
    const edge = 0.8 + 0.2 * valueNoise(u * 4 + 5, v * 4, seed);
    if (d > edge) return 0;
    // Chalky grain: most of the area is broken up.
    const n = valueNoise(u * 14, v * 14, seed + 2) * 0.7 + rng.next() * 0.3;
    return smooth(0.3, 0.65, n) * (1 - smooth(edge * 0.75, edge, d));
  },
  bristle: (rng) => {
    // A row of hairs across the stroke; dragged along, each hair leaves a streak.
    const hairs = Array.from({ length: 16 }, () => ({
      v: rng.signed() * 0.9,
      w: 0.03 + rng.next() * 0.06,
      a: 0.35 + rng.next() * 0.65,
    }));
    return (u, v) => {
      if (Math.abs(u) > 0.35) return 0;
      let a = 0;
      for (const h of hairs) a = Math.max(a, h.a * (1 - smooth(h.w * 0.4, h.w, Math.abs(v - h.v))));
      return a * (1 - smooth(0.15, 0.35, Math.abs(u))) * (1 - smooth(0.85, 1, Math.abs(v)));
    };
  },
  twig: (rng) => {
    const fibres = Array.from({ length: 7 }, () => ({
      v: rng.signed() * 0.75,
      w: 0.08 + rng.next() * 0.1,
      a: 0.5 + rng.next() * 0.5,
    }));
    return (u, v) => {
      if (Math.abs(u) > 0.45) return 0;
      let a = 0.55 * (1 - smooth(0.2, 0.45, Math.abs(v)));
      for (const f of fibres) a = Math.max(a, f.a * (1 - smooth(f.w * 0.4, f.w, Math.abs(v - f.v))));
      return a * (1 - smooth(0.2, 0.45, Math.abs(u)));
    };
  },
  speck: (rng) => {
    const sx = 0.7 + rng.next() * 0.3;
    return (u, v) => 1 - smooth(0.25, 1, Math.hypot(u / sx, v));
  },
};

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  return [c, ctx];
}

export function createDabTextures(textures: Phaser.Textures.TextureManager): void {
  for (const tex of Object.keys(DAB_ALPHA) as DabTexture[]) {
    const size = DAB_SIZE[tex];
    for (let variant = 0; variant < DAB_VARIANTS; variant++) {
      const key = dabKey(tex, variant);
      if (textures.exists(key)) continue;
      const rng = new Rng(1000 + variant * 31 + tex.length * 7);
      const fn = DAB_ALPHA[tex](rng);
      const [c, ctx] = makeCanvas(size, size);
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = ((x + 0.5) / size) * 2 - 1;
          const v = ((y + 0.5) / size) * 2 - 1;
          const a = Math.max(0, Math.min(1, fn(u, v, rng, variant * 17 + 3)));
          const o = (y * size + x) * 4;
          img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
          img.data[o + 3] = a * 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      textures.addCanvas(key, c);
    }
  }
}

// ------------------------------------------------------------ stencil objects

/** Pixels per shape unit in the object textures. */
export const OBJECT_RES = 110;

const OBJECT_COLORS: Record<ShapeId, [number, number, number]> = {
  hand: [168, 118, 88],
  leaf: [104, 106, 56],
  shell: [214, 196, 168],
};

export function objectKey(id: ShapeId): string {
  return `obj-${id}`;
}

/** The object the painter holds against the wall (drawn above the wall, shaded). */
export function createObjectTextures(textures: Phaser.Textures.TextureManager): void {
  const size = Math.ceil(SHAPE_EXTENT * 2 * OBJECT_RES);
  for (const { id } of STENCILS) {
    const key = objectKey(id);
    if (textures.exists(key)) continue;
    const sdf = SHAPES[id];
    const [c, ctx] = makeCanvas(size, size);
    const img = ctx.createImageData(size, size);
    const [cr, cg, cb] = OBJECT_COLORS[id];
    const px = 1 / OBJECT_RES;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const lx = (x + 0.5) / OBJECT_RES - SHAPE_EXTENT;
        const ly = (y + 0.5) / OBJECT_RES - SHAPE_EXTENT;
        const d = sdf(lx, ly);
        const a = 1 - smooth(-px, px, d);
        if (a <= 0) continue;
        // Light from the upper left, darker rim: reads as a rounded object.
        const gx = sdf(lx + px, ly) - sdf(lx - px, ly);
        const gy = sdf(lx, ly + px) - sdf(lx, ly - px);
        const rim = smooth(-0.12, 0, d);
        let shade = 0.9 - 0.35 * rim + 0.25 * rim * (-(gx + gy) / (Math.hypot(gx, gy) || 1)) * 0.7;
        let detail = 1;
        if (id === 'leaf') {
          const vein = Math.abs(lx) < 0.025 ? 0.75 : 1;
          const side = Math.abs(Math.sin((ly + Math.abs(lx) * 0.9) * 16)) < 0.12 ? 0.86 : 1;
          detail = vein * side;
        } else if (id === 'shell') {
          const ang = Math.atan2(ly + 0.08, lx);
          detail = 0.82 + 0.18 * Math.abs(Math.cos(ang * 9));
          const ring = Math.hypot(lx, ly + 0.08);
          if (Math.abs(Math.sin(ring * 30)) < 0.15 && ly < 0.55) detail *= 0.92;
        } else {
          detail = 0.92 + 0.08 * valueNoise(lx * 20, ly * 20, 4);
          // Knuckle creases.
          if (ly < -0.25 && Math.abs(Math.sin(ly * 14)) < 0.06) detail *= 0.85;
        }
        shade *= detail;
        const o = (y * size + x) * 4;
        img.data[o] = Math.min(255, cr * shade);
        img.data[o + 1] = Math.min(255, cg * shade);
        img.data[o + 2] = Math.min(255, cb * shade);
        img.data[o + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    textures.addCanvas(key, c);
  }
}

// ------------------------------------------------------------ torch

export function createTorchTextures(textures: Phaser.Textures.TextureManager): void {
  if (!textures.exists('flame')) {
    const s = 64;
    const [c, ctx] = makeCanvas(s, s);
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    textures.addCanvas('flame', c);
  }
  if (!textures.exists('glow')) {
    const s = 256;
    const [c, ctx] = makeCanvas(s, s);
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,190,110,0.55)');
    g.addColorStop(0.25, 'rgba(255,140,60,0.22)');
    g.addColorStop(0.6, 'rgba(200,90,30,0.06)');
    g.addColorStop(1, 'rgba(160,60,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    textures.addCanvas('glow', c);
  }
  if (!textures.exists('torch')) {
    // A pine branch with a bundle of resin-soaked bark tied at the top.
    // Origin of the flame = top centre of this texture.
    const w = 64;
    const h = 320;
    const [c, ctx] = makeCanvas(w, h);
    const rng = new Rng(77);
    // Stick.
    const stick = ctx.createLinearGradient(20, 0, 44, 0);
    stick.addColorStop(0, '#2a1a10');
    stick.addColorStop(0.45, '#5a3a22');
    stick.addColorStop(1, '#1e130b');
    ctx.fillStyle = stick;
    ctx.beginPath();
    ctx.moveTo(24, 40);
    ctx.lineTo(40, 40);
    ctx.lineTo(43, h);
    ctx.lineTo(21, h);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 18; i++) {
      ctx.strokeStyle = `rgba(20,12,6,${0.3 + rng.next() * 0.4})`;
      ctx.lineWidth = 1;
      const x = 24 + rng.next() * 16;
      const y = 50 + rng.next() * (h - 60);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rng.signed(), y + 10 + rng.next() * 30);
      ctx.stroke();
    }
    // Charred bundle.
    const bundle = ctx.createLinearGradient(12, 0, 52, 0);
    bundle.addColorStop(0, '#120a06');
    bundle.addColorStop(0.5, '#3a2416');
    bundle.addColorStop(1, '#100804');
    ctx.fillStyle = bundle;
    ctx.beginPath();
    ctx.ellipse(32, 46, 19, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    // Glowing embers in the bundle.
    for (let i = 0; i < 40; i++) {
      const x = 32 + rng.signed() * 14;
      const y = 14 + rng.next() * 34;
      ctx.fillStyle = `rgba(255,${100 + rng.int(90)},30,${0.3 + rng.next() * 0.6})`;
      ctx.fillRect(x, y, 2, 2);
    }
    // Bindings (sinew).
    ctx.strokeStyle = '#6b5236';
    ctx.lineWidth = 3;
    for (const y of [70, 80]) {
      ctx.beginPath();
      ctx.moveTo(17, y);
      ctx.lineTo(47, y + 3);
      ctx.stroke();
    }
    textures.addCanvas('torch', c);
  }
}

// ------------------------------------------------------------ tracing paper

export function tracingKey(id: AnimalId): string {
  return `tracing-${id}`;
}

/** Height of the tracing paper texture for a given width. */
export function tracingHeight(width: number): number {
  return Math.round((width * ANIMAL_BOX.h) / ANIMAL_BOX.w) + 2 * TRACING_MARGIN;
}

const TRACING_MARGIN = 28;

/** A translucent sheet with the animal's outline: a guide that is not part of the painting. */
export function createTracingTexture(textures: Phaser.Textures.TextureManager, id: AnimalId): string {
  const key = tracingKey(id);
  if (textures.exists(key)) return key;
  const def = ANIMALS.find((a) => a.id === id)!;
  const w = TRACING.width + 2 * TRACING_MARGIN;
  const h = tracingHeight(TRACING.width);
  const [c, ctx] = makeCanvas(w, h);
  const rng = new Rng(id.length * 97 + 5);

  // Slightly crumpled sheet.
  ctx.beginPath();
  const pts: [number, number][] = [];
  const m = 6;
  for (let i = 0; i <= 8; i++) pts.push([m + ((w - 2 * m) * i) / 8, m + rng.signed() * 3]);
  for (let i = 1; i <= 6; i++) pts.push([w - m + rng.signed() * 3, m + ((h - 2 * m) * i) / 6]);
  for (let i = 7; i >= 0; i--) pts.push([m + ((w - 2 * m) * i) / 8, h - m + rng.signed() * 3]);
  for (let i = 5; i >= 1; i--) pts.push([m + rng.signed() * 3, m + ((h - 2 * m) * i) / 6]);
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = `rgba(244, 234, 210, ${TRACING.sheetAlpha})`;
  ctx.fill();
  ctx.strokeStyle = 'rgba(244, 234, 210, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // The animal: a pale halo under a dark line, so it reads on dark and light rock.
  const s = TRACING.width / ANIMAL_BOX.w;
  ctx.save();
  ctx.translate(TRACING_MARGIN, TRACING_MARGIN);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const outline = new Path2D(def.outline);
  const details = new Path2D(def.details);
  for (const [path, width] of [
    [outline, 2.6],
    [details, 1.8],
  ] as const) {
    ctx.strokeStyle = `rgba(250, 240, 220, ${TRACING.lineAlpha * 0.45})`;
    ctx.lineWidth = (width + 3) / s;
    ctx.stroke(path);
    ctx.strokeStyle = `rgba(30, 18, 10, ${TRACING.lineAlpha})`;
    ctx.lineWidth = width / s;
    ctx.setLineDash([9 / s, 5 / s]);
    ctx.stroke(path);
    ctx.setLineDash([]);
  }
  ctx.restore();

  // Bone pin at the top.
  const px = w / 2;
  const py = 22;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.arc(px + 3, py + 4, 9, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(px - 3, py - 3, 1, px, py, 10);
  g.addColorStop(0, '#f4ead4');
  g.addColorStop(1, '#a8916c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(px, py, 9, 0, Math.PI * 2);
  ctx.fill();

  textures.addCanvas(key, c);
  return key;
}

/** Pin position relative to the paper's centre. */
export function tracingPinOffset(): number {
  return -tracingHeight(TRACING.width) / 2 + 22;
}
