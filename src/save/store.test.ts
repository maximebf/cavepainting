import { describe, expect, it } from 'vitest';
import { defaultSelection, defaultSettings } from '../state';
import { parseSave } from './store';

describe('save parsing', () => {
  it('round-trips a valid save', () => {
    const save = {
      v: 1 as const,
      doc: {
        wallSeed: 3,
        actions: [
          { k: 'stroke' as const, tool: 'finger' as const, pigment: 'redOchre' as const, sizeMul: 1, seed: 1, pts: [1, 2, 0.5] },
          { k: 'stamp' as const, shape: 'hand' as const, pigment: 'kaolin' as const, x: 1, y: 2, angle: 0, sizeMul: 1, flip: false, seed: 2, ticks: 10 },
        ],
      },
      settings: defaultSettings(),
      selection: defaultSelection(),
    };
    expect(parseSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });

  it('rejects junk and modern colours', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave({ v: 2 })).toBeNull();
    expect(
      parseSave({ v: 1, doc: { wallSeed: 1, actions: [{ k: 'stroke', tool: 'finger', pigment: 'neonPink', sizeMul: 1, seed: 1, pts: [] }] } }),
    ).toBeNull();
  });
});
