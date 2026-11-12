// Turns stroke points into "dabs" (one imprint of the tool on the wall).
// Pure and deterministic: replaying the same points with the same seed gives the same dabs.

import { MIN_POINT_DIST, TOOLS, type DabTexture, type ToolDef, type ToolId } from '../units';
import { Rng } from './rng';

export interface Dab {
  x: number;
  y: number;
  /** Diameter in px. */
  size: number;
  alpha: number;
  /** Radians. */
  angle: number;
  tex: DabTexture;
  /** Which of the texture's variants to use (0..3). */
  variant: number;
}

export const DAB_VARIANTS = 4;

export function toolDef(id: ToolId): ToolDef {
  const t = TOOLS.find((t) => t.id === id);
  if (!t) throw new Error(`unknown tool ${id}`);
  return t;
}

export class StrokeBuilder {
  private readonly tool: ToolDef;
  private readonly rng: Rng;
  private lastX = 0;
  private lastY = 0;
  private lastP = 0.5;
  private started = false;
  /** Total distance travelled (drives how dry the tool gets). */
  private travelled = 0;
  /** Distance left before the next dab. */
  private carry = 0;
  private angle = 0;

  constructor(
    toolId: ToolId,
    private readonly sizeMul: number,
    seed: number,
  ) {
    this.tool = toolDef(toolId);
    this.rng = new Rng(seed);
  }

  /** Adds a point and returns the dabs it produced. Returns null if the point was ignored. */
  add(x: number, y: number, p: number): Dab[] | null {
    const out: Dab[] = [];
    if (!this.started) {
      this.started = true;
      this.lastX = x;
      this.lastY = y;
      this.lastP = p;
      out.push(this.dab(x, y, p));
      return out;
    }
    const dx = x - this.lastX;
    const dy = y - this.lastY;
    const len = Math.hypot(dx, dy);
    if (len < MIN_POINT_DIST) return null;
    this.angle = Math.atan2(dy, dx);
    let pos = this.carry;
    while (pos <= len) {
      const t = pos / len;
      const pp = this.lastP + (p - this.lastP) * t;
      out.push(this.dab(this.lastX + dx * t, this.lastY + dy * t, pp));
      const step = Math.max(0.6, this.sizeAt(pp) * this.tool.spacing);
      pos += step;
      this.travelled += step;
    }
    this.carry = pos - len;
    this.lastX = x;
    this.lastY = y;
    this.lastP = p;
    return out;
  }

  private sizeAt(p: number): number {
    const ps = this.tool.pressureSize;
    const pressure = 1 - ps + ps * 2 * Math.min(1, Math.max(0, p));
    return this.tool.size * this.sizeMul * pressure;
  }

  private load(): number {
    const t = this.tool;
    if (t.loadLength <= 0) return 1;
    return t.minLoad + (1 - t.minLoad) * Math.exp(-this.travelled / t.loadLength);
  }

  private dab(x: number, y: number, p: number): Dab {
    const t = this.tool;
    const r = this.rng;
    const size = this.sizeAt(p) * (1 + t.sizeJitter * r.signed());
    const baseAngle = t.follow ? this.angle : r.next() * Math.PI * 2;
    return {
      x: x + t.posJitter * r.signed(),
      y: y + t.posJitter * r.signed(),
      size,
      alpha: Math.min(1, t.flow * this.load() * (0.85 + 0.3 * r.next())),
      angle: baseAngle + t.angleJitter * r.signed(),
      tex: t.texture,
      variant: r.int(DAB_VARIANTS),
    };
  }
}

/** Dabs for a whole recorded stroke (used on replay). `pts` is flat [x, y, p, x, y, p, ...]. */
export function strokeDabs(toolId: ToolId, sizeMul: number, seed: number, pts: readonly number[]): Dab[] {
  const b = new StrokeBuilder(toolId, sizeMul, seed);
  const out: Dab[] = [];
  for (let i = 0; i + 2 < pts.length; i += 3) {
    const d = b.add(pts[i]!, pts[i + 1]!, pts[i + 2]!);
    if (d) out.push(...d);
  }
  return out;
}
