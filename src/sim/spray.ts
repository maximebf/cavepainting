// Blowpipe stencil: an object is held against the wall and pigment is blown around it.
// Only the area just outside the object's edge gets paint, so the result is an outline.
// The longer the press, the more pigment lands and the wider the halo.

import { SPRAY, STENCILS, TICK_HZ, type ShapeId } from '../units';
import type { Dab } from './brush';
import { Rng } from './rng';
import { SHAPES, outline } from './shapes';

export interface StampPlacement {
  shape: ShapeId;
  x: number;
  y: number;
  /** Radians. */
  angle: number;
  /** Size multiplier (1 = default). */
  sizeMul: number;
  /** Mirror horizontally (left hand vs right hand). */
  flip: boolean;
}

export function stencilScale(shape: ShapeId, sizeMul: number): number {
  const def = STENCILS.find((s) => s.id === shape);
  if (!def) throw new Error(`unknown stencil ${shape}`);
  return def.scale * sizeMul;
}

/** Breath strength in [0, 1] after `tick` ticks of pressing. */
export function breath(tick: number): number {
  const t = tick / TICK_HZ;
  if (t >= SPRAY.maxSeconds) return 0;
  return Math.min(1, (t + 1 / TICK_HZ) / SPRAY.rampSeconds);
}

/** Halo width in px after `tick` ticks. */
export function spreadAt(tick: number): number {
  const t = Math.min(1, tick / TICK_HZ / SPRAY.growSeconds);
  return SPRAY.spreadStart + (SPRAY.spreadMax - SPRAY.spreadStart) * Math.sqrt(t);
}

/** Converts a wall position to the shape's local units. */
export function toLocal(pl: StampPlacement, wx: number, wy: number): [number, number] {
  const s = stencilScale(pl.shape, pl.sizeMul);
  const dx = wx - pl.x;
  const dy = wy - pl.y;
  const c = Math.cos(-pl.angle);
  const sn = Math.sin(-pl.angle);
  let lx = (dx * c - dy * sn) / s;
  const ly = (dx * sn + dy * c) / s;
  if (pl.flip) lx = -lx;
  return [lx, ly];
}

/** Is this wall position covered by the held object? */
export function covered(pl: StampPlacement, wx: number, wy: number): boolean {
  const [lx, ly] = toLocal(pl, wx, wy);
  return SHAPES[pl.shape](lx, ly) < 0;
}

/**
 * The pigment particles that land during one tick of a press.
 * Each tick uses its own RNG stream so live play and replay always agree.
 */
export function sprayTick(pl: StampPlacement, seed: number, tick: number): Dab[] {
  const strength = breath(tick);
  if (strength <= 0) return [];
  const rng = new Rng((seed ^ Math.imul(tick + 1, 0x9e3779b1)) >>> 0);
  const pts = outline(pl.shape);
  const sdf = SHAPES[pl.shape];
  const s = stencilScale(pl.shape, pl.sizeMul);
  const spread = spreadAt(tick) * Math.sqrt(pl.sizeMul);
  const cos = Math.cos(pl.angle);
  const sin = Math.sin(pl.angle);
  const fx = pl.flip ? -1 : 1;
  const n = Math.round(SPRAY.particlesPerTick * strength * Math.sqrt(pl.sizeMul));
  const out: Dab[] = [];
  for (let i = 0; i < n; i++) {
    const o = pts[rng.int(pts.length)]!;
    const over = rng.next() < SPRAY.oversprayChance;
    const dist = Math.abs(rng.gauss()) * spread * (over ? SPRAY.oversprayMul : 1) + 0.5;
    const tang = rng.gauss() * spread * 0.35;
    // Local position in shape units, then to the wall.
    const lx = o.x + (o.nx * dist - o.ny * tang) / s;
    const ly = o.y + (o.ny * dist + o.nx * tang) / s;
    if (sdf(lx, ly) < 0.002) continue; // the object shields the wall here
    const mx = lx * fx * s;
    const my = ly * s;
    const falloff = Math.exp(-dist / (spread * 1.6));
    out.push({
      x: pl.x + mx * cos - my * sin,
      y: pl.y + mx * sin + my * cos,
      size: SPRAY.sizeMin + (SPRAY.sizeMax - SPRAY.sizeMin) * rng.next() * (over ? 0.6 : 1),
      alpha: (SPRAY.alphaMin + (SPRAY.alphaMax - SPRAY.alphaMin) * rng.next()) * (0.35 + 0.65 * falloff),
      angle: rng.next() * Math.PI * 2,
      tex: 'speck',
      variant: rng.int(4),
    });
  }
  return out;
}

/** Every particle of a finished press (used on replay). */
export function stampDabs(pl: StampPlacement, seed: number, ticks: number): Dab[] {
  const out: Dab[] = [];
  for (let k = 0; k < ticks; k++) out.push(...sprayTick(pl, seed, k));
  return out;
}
