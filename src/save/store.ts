// Save data in IndexedDB (idb-keyval), as one versioned object.

import { get, set } from 'idb-keyval';
import { ANIMALS } from '../content/animals';
import type { Action, PaintingDoc } from '../sim/doc';
import { defaultSelection, defaultSettings, type Selection, type Settings } from '../state';
import { PIGMENTS, STENCILS, TOOLS } from '../units';

export interface SaveV1 {
  v: 1;
  doc: PaintingDoc;
  settings: Settings;
  selection: Selection;
}

const KEY = 'cavepainting-save';

export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* best effort */
  }
}

export async function loadSave(): Promise<SaveV1 | null> {
  try {
    return parseSave(await get(KEY));
  } catch {
    return null;
  }
}

export async function writeSave(save: SaveV1): Promise<void> {
  await set(KEY, save);
}

const toolIds = new Set<string>(TOOLS.map((t) => t.id));
const pigmentIds = new Set<string>(PIGMENTS.map((p) => p.id));
const shapeIds = new Set<string>(STENCILS.map((s) => s.id));
const animalIds = new Set<string>(ANIMALS.map((a) => a.id));

function validAction(a: unknown): a is Action {
  if (!a || typeof a !== 'object') return false;
  const o = a as Record<string, unknown>;
  if (!pigmentIds.has(o.pigment as string) || typeof o.seed !== 'number' || typeof o.sizeMul !== 'number') return false;
  if (o.k === 'stroke') return toolIds.has(o.tool as string) && Array.isArray(o.pts) && o.pts.every((n) => typeof n === 'number');
  if (o.k === 'stamp')
    return (
      shapeIds.has(o.shape as string) &&
      [o.x, o.y, o.angle, o.ticks].every((n) => typeof n === 'number') &&
      typeof o.flip === 'boolean'
    );
  return false;
}

/** Validates unknown data (from IndexedDB or an imported file) into a save. */
export function parseSave(data: unknown): SaveV1 | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (o.v !== 1) return null;
  const doc = o.doc as Record<string, unknown> | undefined;
  if (!doc || typeof doc.wallSeed !== 'number' || !Array.isArray(doc.actions)) return null;
  if (!doc.actions.every(validAction)) return null;
  const sel = { ...defaultSelection(), ...(o.selection as object) } as Selection;
  if (sel.holding.kind === 'tool' ? !toolIds.has(sel.holding.id) : !shapeIds.has(sel.holding.id)) {
    sel.holding = defaultSelection().holding;
  }
  if (!pigmentIds.has(sel.pigment)) sel.pigment = defaultSelection().pigment;
  if (sel.tracing !== null && !animalIds.has(sel.tracing)) sel.tracing = null;
  if (!Number.isFinite(sel.tracingX) || !Number.isFinite(sel.tracingY)) {
    sel.tracingX = defaultSelection().tracingX;
    sel.tracingY = defaultSelection().tracingY;
  }
  delete (sel as Partial<Selection> & { flip?: unknown }).flip; // mirror option was removed
  return {
    v: 1,
    doc: { wallSeed: doc.wallSeed, actions: doc.actions as Action[] },
    settings: { ...defaultSettings(), ...(o.settings as object) },
    selection: sel,
  };
}
