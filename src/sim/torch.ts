// Torch flame state, stepped at the fixed tick rate. The renderer interpolates between ticks.

import { TORCH } from '../units';
import { Rng } from './rng';

export interface FlameState {
  /** Light multiplier around 1. */
  intensity: number;
  /** Flame offset in px (wind / breathing of the fire). */
  swayX: number;
  swayY: number;
}

export class Flame {
  state: FlameState = { intensity: 1, swayX: 0, swayY: 0 };
  prev: FlameState = { intensity: 1, swayX: 0, swayY: 0 };
  private gust = 0;
  private readonly rng: Rng;

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  tick(motionScale: number): void {
    const r = this.rng;
    this.prev = { ...this.state };
    if (this.gust <= 0 && r.next() < TORCH.gustChance) this.gust = 2 + r.int(4);
    let target = this.state.intensity + r.signed() * TORCH.flickerStep;
    target += (1 - target) * 0.15; // drift back toward a steady flame
    if (this.gust > 0) {
      target -= TORCH.gustDip * r.next();
      this.gust--;
    }
    target = Math.min(TORCH.flickerMax, Math.max(TORCH.flickerMin, target));
    const sway = TORCH.swayPx * (this.gust > 0 ? 2 : 1);
    this.state = {
      intensity: 1 + (target - 1) * motionScale,
      swayX: r.signed() * sway * motionScale,
      swayY: -Math.abs(r.signed()) * sway * 0.5 * motionScale,
    };
  }

  /** Interpolated state between the previous and current tick (alpha in [0, 1]). */
  lerp(alpha: number): FlameState {
    const a = this.prev;
    const b = this.state;
    return {
      intensity: a.intensity + (b.intensity - a.intensity) * alpha,
      swayX: a.swayX + (b.swayX - a.swayX) * alpha,
      swayY: a.swayY + (b.swayY - a.swayY) * alpha,
    };
  }
}
