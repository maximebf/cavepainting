import { describe, expect, it } from 'vitest';
import { PIGMENTS, SPRAY, STENCILS, TICK_HZ, TOOLS } from '../units';
import { strokeDabs, StrokeBuilder } from './brush';
import { actionDabs } from './doc';
import { CaveSim } from './sim';
import { SHAPES, outline } from './shapes';
import { breath, covered, sprayTick, spreadAt, stampDabs, type StampPlacement } from './spray';

const hand: StampPlacement = { shape: 'hand', x: 800, y: 500, angle: 0.3, sizeMul: 1, flip: false };

function line(n: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) pts.push(100 + i * 6, 200 + Math.sin(i / 5) * 30, 0.5);
  return pts;
}

describe('pigments', () => {
  it('only uses earth colours (no modern saturated hues)', () => {
    for (const p of PIGMENTS) {
      const r = (p.color >> 16) & 255;
      const g = (p.color >> 8) & 255;
      const b = p.color & 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      expect(sat, p.id).toBeLessThan(0.8);
      // red >= green >= blue: the ochre / umber / black / white family
      expect(r, p.id).toBeGreaterThanOrEqual(g);
      expect(g, p.id).toBeGreaterThanOrEqual(b);
    }
  });
});

describe('brush', () => {
  it('is deterministic for a given seed', () => {
    for (const t of TOOLS) {
      const a = strokeDabs(t.id, 1, 42, line(40));
      const b = strokeDabs(t.id, 1, 42, line(40));
      expect(a).toEqual(b);
      expect(a.length).toBeGreaterThan(5);
    }
  });

  it('live drawing and replay give identical dabs', () => {
    const pts = line(60);
    const live = new StrokeBuilder('brush', 1.3, 7);
    const got = [];
    for (let i = 0; i < pts.length; i += 3) got.push(...(live.add(pts[i]!, pts[i + 1]!, pts[i + 2]!) ?? []));
    expect(got).toEqual(strokeDabs('brush', 1.3, 7, pts));
  });

  it('a finger runs dry along a long stroke, a lump does not', () => {
    const f = strokeDabs('finger', 1, 1, line(200));
    const avg = (d: typeof f) => d.reduce((s, x) => s + x.alpha, 0) / d.length;
    expect(avg(f.slice(-20))).toBeLessThan(avg(f.slice(0, 20)) * 0.5);
    const l = strokeDabs('lump', 1, 1, line(200));
    expect(avg(l.slice(-20))).toBeGreaterThan(avg(l.slice(0, 20)) * 0.8);
  });

  it('pressure makes the brush wider', () => {
    const soft = new StrokeBuilder('brush', 1, 3).add(10, 10, 0.1)!;
    const hard = new StrokeBuilder('brush', 1, 3).add(10, 10, 1)!;
    expect(hard[0]!.size).toBeGreaterThan(soft[0]!.size);
  });
});

describe('stencil shapes', () => {
  it('every stencil has a closed outline and a solid centre', () => {
    for (const s of STENCILS) {
      expect(outline(s.id).length, s.id).toBeGreaterThan(200);
      expect(SHAPES[s.id](0, 0), s.id).toBeLessThan(0);
      expect(SHAPES[s.id](1.29, 1.29), s.id).toBeGreaterThan(0);
    }
  });
});

describe('blowpipe spray', () => {
  it('never paints under the held object (outline only)', () => {
    const dabs = stampDabs(hand, 9, 30);
    expect(dabs.length).toBeGreaterThan(1000);
    for (const d of dabs) expect(covered(hand, d.x, d.y)).toBe(false);
  });

  it('stays close to the edge', () => {
    const dabs = stampDabs(hand, 9, 30);
    const far = dabs.filter((d) => Math.hypot(d.x - hand.x, d.y - hand.y) > 92 * 1.6);
    expect(far.length / dabs.length).toBeLessThan(0.05);
  });

  it('pressing longer gives a stronger stamp', () => {
    const ink = (ticks: number) => stampDabs(hand, 5, ticks).reduce((s, d) => s + d.alpha * d.size * d.size, 0);
    const short = ink(Math.round(0.5 * TICK_HZ));
    const medium = ink(2 * TICK_HZ);
    const long = ink(5 * TICK_HZ);
    expect(medium).toBeGreaterThan(short * 2);
    expect(long).toBeGreaterThan(medium * 2);
    expect(spreadAt(5 * TICK_HZ)).toBeGreaterThan(spreadAt(0) * 2);
  });

  it('breath ramps up and runs out', () => {
    expect(breath(0)).toBeLessThan(breath(TICK_HZ));
    expect(breath(SPRAY.maxSeconds * TICK_HZ)).toBe(0);
  });

  it('mirrored hand is masked by the mirrored shape', () => {
    const left = { ...hand, flip: true };
    for (const d of sprayTick(left, 3, 10)) expect(covered(left, d.x, d.y)).toBe(false);
  });
});

describe('simulation', () => {
  it('records strokes that replay to the same dabs', () => {
    const sim = new CaveSim();
    const pts = line(50);
    sim.beginStroke('twig', 'redOchre', 1, pts[0]!, pts[1]!, 0.5, 99);
    for (let i = 3; i < pts.length; i += 3) sim.strokeTo(pts[i]! + 0.13, pts[i + 1]!, 0.5);
    sim.endStroke();
    const live = sim.drain().flatMap((e) => (e.k === 'dabs' ? e.dabs : []));
    expect(actionDabs(sim.doc.actions[0]!)).toEqual(live);
  });

  it('stencil strength follows how long it is held (ticks)', () => {
    const sim = new CaveSim();
    sim.beginStamp(hand, 'charcoal', 1);
    for (let i = 0; i < 25; i++) sim.tick();
    const a = sim.endStamp()!;
    expect(a.ticks).toBe(25);
    const live = sim.drain().flatMap((e) => (e.k === 'dabs' ? e.dabs : []));
    expect(actionDabs(a)).toEqual(live);
  });

  it('a quick tap still leaves pigment', () => {
    const sim = new CaveSim();
    sim.beginStamp(hand, 'charcoal', 1);
    expect(sim.endStamp()!.ticks).toBe(1);
  });

  it('pausing stops the press from growing', () => {
    const sim = new CaveSim();
    sim.beginStamp(hand, 'kaolin', 1);
    sim.tick();
    sim.paused = true;
    sim.tick();
    sim.tick();
    expect(sim.endStamp()!.ticks).toBe(1);
  });

  it('undo and redo', () => {
    const sim = new CaveSim();
    sim.beginStroke('finger', 'umber', 1, 10, 10, 0.5);
    sim.strokeTo(80, 80, 0.5);
    sim.endStroke();
    sim.undo();
    expect(sim.doc.actions.length).toBe(0);
    sim.redo();
    expect(sim.doc.actions.length).toBe(1);
    sim.newWall(5);
    expect(sim.doc).toEqual({ wallSeed: 5, actions: [] });
    expect(sim.history.canRedo()).toBe(false);
  });

  it('the torch flickers within its limits', () => {
    const sim = new CaveSim();
    for (let i = 0; i < 500; i++) {
      sim.tick();
      expect(sim.flame.state.intensity).toBeGreaterThan(0.5);
      expect(sim.flame.state.intensity).toBeLessThan(1.3);
    }
  });
});
