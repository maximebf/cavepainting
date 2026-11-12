// Stencil objects as signed distance functions (negative inside), in "shape units":
// each object is centred on (0, 0) and roughly 2 units tall, y pointing down.
// The same SDF masks the blown pigment and draws the held object, so they always match.

import { OUTLINE_STEP, type ShapeId } from '../units';

type V = readonly [number, number];
export type Sdf = (x: number, y: number) => number;

function capsule(px: number, py: number, a: V, b: V, r: number): number {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const pax = px - a[0];
  const pay = py - a[1];
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
}

function ellipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number): number {
  const dx = (px - cx) / rx;
  const dy = (py - cy) / ry;
  return (Math.hypot(dx, dy) - 1) * Math.min(rx, ry);
}

function box(px: number, py: number, cx: number, cy: number, hx: number, hy: number, r: number): number {
  const qx = Math.abs(px - cx) - hx + r;
  const qy = Math.abs(py - cy) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Polynomial smooth minimum: organic joins between primitives. */
function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Exact SDF of a simple polygon (Inigo Quilez). */
function polygon(px: number, py: number, pts: readonly V[]): number {
  const n = pts.length;
  let d = Infinity;
  let s = 1;
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const vi = pts[i]!;
    const vj = pts[j]!;
    const ex = vj[0] - vi[0];
    const ey = vj[1] - vi[1];
    const wx = px - vi[0];
    const wy = py - vi[1];
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    const bx = wx - ex * t;
    const by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= vi[1];
    const c2 = py < vj[1];
    const c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}

const FINGERS: readonly [V, V, number][] = [
  [[-0.36, 0.18], [-0.8, -0.2], 0.12], // thumb
  [[-0.24, -0.22], [-0.36, -0.95], 0.1], // index
  [[-0.04, -0.26], [-0.06, -1.06], 0.105], // middle
  [[0.15, -0.24], [0.24, -0.97], 0.1], // ring
  [[0.32, -0.16], [0.5, -0.7], 0.085], // little finger
];

const hand: Sdf = (x, y) => {
  let d = ellipse(x, y, -0.02, 0.12, 0.4, 0.42);
  for (const [a, b, r] of FINGERS) d = smin(d, capsule(x, y, a, b, r), 0.09);
  d = smin(d, capsule(x, y, [-0.02, 0.45], [0.02, 1.05], 0.27), 0.12); // wrist
  return d;
};

const leaf: Sdf = (x, y) => {
  // Vesica (two-circle lens) for the blade, with a lightly toothed edge.
  const r = 1.0;
  const off = 0.62;
  const blade = Math.max(Math.hypot(x - off, y + 0.1) - r, Math.hypot(x + off, y + 0.1) - r);
  const along = Math.atan2(y + 0.1, Math.abs(x) + 0.0001);
  const teeth = 0.018 * Math.abs(Math.sin(along * 14 + y * 9));
  const stem = capsule(x, y, [0, 0.6], [0.06, 1.12], 0.035);
  return smin(blade + teeth, stem, 0.05);
};

const SHELL_CONE: readonly V[] = [
  [0, 0.78],
  [-1.5, -1.0],
  [1.5, -1.0],
];

const shell: Sdf = (x, y) => {
  // Scallop: ribbed fan + two small "ears" at the hinge.
  const cx = 0;
  const cy = -0.08;
  const ang = Math.atan2(y - cy, x - cx);
  const ribs = 0.035 * Math.abs(Math.cos(ang * 9));
  const disc = Math.hypot(x - cx, y - cy) - (0.82 + ribs);
  const fan = Math.max(disc, polygon(x, y, SHELL_CONE));
  const ears = box(x, y, 0, 0.7, 0.36, 0.11, 0.04);
  return smin(fan, ears, 0.08);
};

export const SHAPES: Record<ShapeId, Sdf> = { hand, leaf, shell };

/** Half-size of the square that contains every shape, in shape units. */
export const SHAPE_EXTENT = 1.3;

export interface OutlinePoint {
  x: number;
  y: number;
  /** Outward normal. */
  nx: number;
  ny: number;
}

const outlineCache = new Map<ShapeId, OutlinePoint[]>();

/** Points on the edge of a shape with their outward normals. Deterministic and cached. */
export function outline(id: ShapeId): OutlinePoint[] {
  const cached = outlineCache.get(id);
  if (cached) return cached;
  const sdf = SHAPES[id];
  const pts: OutlinePoint[] = [];
  const step = OUTLINE_STEP;
  const e = step * 0.5;
  for (let y = -SHAPE_EXTENT; y <= SHAPE_EXTENT; y += step) {
    for (let x = -SHAPE_EXTENT; x <= SHAPE_EXTENT; x += step) {
      const d = sdf(x, y);
      if (Math.abs(d) > step * 0.5) continue;
      const gx = sdf(x + e, y) - sdf(x - e, y);
      const gy = sdf(x, y + e) - sdf(x, y - e);
      const gl = Math.hypot(gx, gy) || 1;
      const nx = gx / gl;
      const ny = gy / gl;
      // Snap onto the zero line.
      pts.push({ x: x - nx * d, y: y - ny * d, nx, ny });
    }
  }
  outlineCache.set(id, pts);
  return pts;
}
