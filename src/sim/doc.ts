// The painting as data: a list of actions that can be replayed onto a blank wall.

import { UNDO_LIMIT, type PigmentId, type ShapeId, type ToolId } from '../units';
import { strokeDabs, type Dab } from './brush';
import { stampDabs } from './spray';

export interface StrokeAction {
  k: 'stroke';
  tool: ToolId;
  pigment: PigmentId;
  sizeMul: number;
  seed: number;
  /** Flat [x, y, pressure, ...]. */
  pts: number[];
}

export interface StampAction {
  k: 'stamp';
  shape: ShapeId;
  pigment: PigmentId;
  x: number;
  y: number;
  angle: number;
  sizeMul: number;
  flip: boolean;
  seed: number;
  /** How many ticks the press lasted. */
  ticks: number;
}

export type Action = StrokeAction | StampAction;

export interface PaintingDoc {
  wallSeed: number;
  actions: Action[];
}

export function actionDabs(a: Action): Dab[] {
  if (a.k === 'stroke') return strokeDabs(a.tool, a.sizeMul, a.seed, a.pts);
  return stampDabs(a, a.seed, a.ticks);
}

/** Undo/redo history over a painting document. */
export class History {
  private redoStack: Action[] = [];

  constructor(public doc: PaintingDoc) {}

  push(a: Action): void {
    this.doc.actions.push(a);
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.doc.actions.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): Action | undefined {
    const a = this.doc.actions.pop();
    if (a) {
      this.redoStack.push(a);
      if (this.redoStack.length > UNDO_LIMIT) this.redoStack.shift();
    }
    return a;
  }

  redo(): Action | undefined {
    const a = this.redoStack.pop();
    if (a) this.doc.actions.push(a);
    return a;
  }

  reset(doc: PaintingDoc): void {
    this.doc = doc;
    this.redoStack = [];
  }
}
