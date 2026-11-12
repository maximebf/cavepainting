// The rules engine: owns the painting document, the active stroke or stencil press,
// and the torch flame. No drawing code here. The renderer drains `events`.

import { SPRAY, TICK_HZ, type PigmentId, type ToolId } from '../units';
import { StrokeBuilder, type Dab } from './brush';
import { History, actionDabs, type Action, type PaintingDoc, type StampAction, type StrokeAction } from './doc';
import { randomSeed } from './rng';
import { sprayTick, type StampPlacement } from './spray';
import { Flame } from './torch';

export type SimEvent =
  /** New pigment to lay on the wall. */
  | { k: 'dabs'; pigment: PigmentId; dabs: Dab[] }
  /** The document changed (undo, load...): clear the paint and replay everything. */
  | { k: 'redraw' }
  /** A different rock wall. */
  | { k: 'wall'; seed: number }
  /** Something worth saving happened. */
  | { k: 'changed' };

const r2 = (v: number) => Math.round(v * 2) / 2;
const p2 = (v: number) => Math.round(v * 100) / 100;

export class CaveSim {
  readonly history: History;
  readonly flame = new Flame(randomSeed());
  ticks = 0;
  paused = false;
  /** 1 = full flicker, smaller when "reduce motion" is on. */
  motionScale = 1;

  private events: SimEvent[] = [];
  private stroke: { b: StrokeBuilder; a: StrokeAction } | null = null;
  private stamp: StampAction | null = null;

  constructor(doc?: PaintingDoc) {
    this.history = new History(doc ?? { wallSeed: randomSeed(), actions: [] });
  }

  get doc(): PaintingDoc {
    return this.history.doc;
  }

  drain(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  tick(): void {
    if (this.paused) return;
    this.ticks++;
    this.flame.tick(this.motionScale);
    if (this.stamp) this.blow();
  }

  get pressing(): boolean {
    return this.stamp !== null;
  }
  get drawing(): boolean {
    return this.stroke !== null;
  }
  /** Seconds the current stencil has been pressed. */
  get pressSeconds(): number {
    return this.stamp ? this.stamp.ticks / TICK_HZ : 0;
  }

  // ------------------------------------------------------------ strokes

  beginStroke(tool: ToolId, pigment: PigmentId, sizeMul: number, x: number, y: number, p: number, seed = randomSeed()): void {
    this.cancelActive();
    const a: StrokeAction = { k: 'stroke', tool, pigment, sizeMul: p2(sizeMul), seed, pts: [] };
    this.stroke = { b: new StrokeBuilder(tool, a.sizeMul, seed), a };
    this.strokeTo(x, y, p);
  }

  strokeTo(x: number, y: number, p: number): void {
    const s = this.stroke;
    if (!s) return;
    const rx = r2(x);
    const ry = r2(y);
    const rp = p2(p);
    const dabs = s.b.add(rx, ry, rp);
    if (!dabs) return;
    s.a.pts.push(rx, ry, rp);
    if (dabs.length) this.events.push({ k: 'dabs', pigment: s.a.pigment, dabs });
  }

  endStroke(): void {
    const s = this.stroke;
    if (!s) return;
    this.stroke = null;
    this.history.push(s.a);
    this.events.push({ k: 'changed' });
  }

  // ------------------------------------------------------------ stencils

  beginStamp(pl: StampPlacement, pigment: PigmentId, seed = randomSeed()): void {
    this.cancelActive();
    this.stamp = {
      k: 'stamp',
      shape: pl.shape,
      pigment,
      x: r2(pl.x),
      y: r2(pl.y),
      angle: Math.round(pl.angle * 1000) / 1000,
      sizeMul: p2(pl.sizeMul),
      flip: pl.flip,
      seed,
      ticks: 0,
    };
  }

  private blow(): void {
    const s = this.stamp!;
    if (s.ticks >= SPRAY.maxSeconds * TICK_HZ) return;
    const dabs = sprayTick(s, s.seed, s.ticks);
    s.ticks++;
    if (dabs.length) this.events.push({ k: 'dabs', pigment: s.pigment, dabs });
  }

  endStamp(): StampAction | null {
    const s = this.stamp;
    if (!s) return null;
    if (s.ticks === 0) this.blow(); // a quick tap still leaves a faint puff
    this.stamp = null;
    this.history.push(s);
    this.events.push({ k: 'changed' });
    return s;
  }

  /** Commits whatever is in progress (used when pausing or switching tools). */
  cancelActive(): void {
    if (this.stroke) this.endStroke();
    if (this.stamp) this.endStamp();
  }

  // ------------------------------------------------------------ history

  undo(): void {
    this.cancelActive();
    if (this.history.undo()) this.events.push({ k: 'redraw' }, { k: 'changed' });
  }

  redo(): void {
    this.cancelActive();
    const a = this.history.redo();
    if (a) this.events.push({ k: 'dabs', pigment: a.pigment, dabs: actionDabs(a) }, { k: 'changed' });
  }

  newWall(seed = randomSeed()): void {
    this.cancelActive();
    this.history.reset({ wallSeed: seed, actions: [] });
    this.events.push({ k: 'wall', seed }, { k: 'redraw' }, { k: 'changed' });
  }

  load(doc: PaintingDoc): void {
    this.cancelActive();
    this.history.reset(doc);
    this.events.push({ k: 'wall', seed: doc.wallSeed }, { k: 'redraw' });
  }
}

/** All dabs of a document grouped by action, in painting order (for replay). */
export function* replay(doc: PaintingDoc): Generator<{ a: Action; dabs: Dab[] }> {
  for (const a of doc.actions) yield { a, dabs: actionDabs(a) };
}
