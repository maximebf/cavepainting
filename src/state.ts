// What the painter currently holds, plus user settings. Shared by the UI and the scene.

import type { AnimalId } from './content/animals';
import { WALL_H, WALL_W, type PigmentId, type ShapeId, type ToolId } from './units';

export type Holding = { kind: 'tool'; id: ToolId } | { kind: 'stencil'; id: ShapeId };

export interface Settings {
  sfx: number;
  music: number;
  leftHanded: boolean;
  reducedMotion: boolean;
}

export interface Selection {
  holding: Holding;
  pigment: PigmentId;
  sizeMul: number;
  /** Stencil rotation in radians (quarter turns). */
  angle: number;
  /** Animal on the tracing paper, or null when there is no paper on the wall. */
  tracing: AnimalId | null;
  /** Centre of the tracing paper on the wall. */
  tracingX: number;
  tracingY: number;
}

export const defaultSettings = (): Settings => ({
  sfx: 0.8,
  music: 0.5,
  leftHanded: false,
  reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
});

export const defaultSelection = (): Selection => ({
  holding: { kind: 'tool', id: 'finger' },
  pigment: 'redOchre',
  sizeMul: 1,
  angle: 0,
  tracing: null,
  tracingX: WALL_W * 0.45,
  tracingY: WALL_H * 0.45,
});

type Listener = () => void;

/** Tiny observable store. */
export class Store<T extends object> {
  private listeners: Listener[] = [];
  constructor(public value: T) {}
  set(patch: Partial<T>): void {
    this.value = { ...this.value, ...patch };
    for (const l of this.listeners) l();
  }
  on(l: Listener): void {
    this.listeners.push(l);
  }
}
