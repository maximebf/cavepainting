// The toolbar: tools, stencils, pigments, size and history buttons. Built from data.

import { ANIMALS, type AnimalId } from '../content/animals';
import { L } from '../content/lines';
import type { Holding, Selection, Store } from '../state';
import { PIGMENTS, SIZE_MUL_MAX, SIZE_MUL_MIN, STAMP_ROTATE_STEP, STENCILS, TOOLS } from '../units';
import { ICONS, animalIcon, type IconName } from './icons';

export interface HudActions {
  undo(): void;
  redo(): void;
  menu(): void;
  click(): void;
  firstStencil(): void;
  firstTracing(): void;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function iconButton(icon: IconName, label: string, cls = 'tool'): HTMLButtonElement {
  const b = el('button', cls, ICONS[icon]);
  b.type = 'button';
  b.title = label;
  b.setAttribute('aria-label', label);
  return b;
}

const same = (a: Holding, b: Holding) => a.kind === b.kind && a.id === b.id;

export class Hud {
  private readonly holdButtons: { h: Holding; b: HTMLButtonElement }[] = [];
  private readonly animalButtons: { id: AnimalId; b: HTMLButtonElement }[] = [];
  private readonly pigmentButtons: { id: string; b: HTMLButtonElement }[] = [];
  private readonly stencilOpts: HTMLElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly size: HTMLInputElement;
  private stencilHinted = false;
  private tracingHinted = false;
  /** Unwrapped stencil angle shown on the icons. */
  private iconAngle = 0;

  constructor(
    root: HTMLElement,
    private readonly sel: Store<Selection>,
    actions: HudActions,
  ) {
    root.innerHTML = '';
    const pick = (h: Holding) => () => {
      actions.click();
      sel.set({ holding: h });
      if (h.kind === 'stencil' && !this.stencilHinted) {
        this.stencilHinted = true;
        actions.firstStencil();
      }
    };

    const tools = this.section(root, L.sections.tools);
    for (const t of TOOLS) {
      const info = L.tools[t.id];
      const b = iconButton(t.id, `${info.name} : ${info.info}`);
      b.addEventListener('click', pick({ kind: 'tool', id: t.id }));
      this.holdButtons.push({ h: { kind: 'tool', id: t.id }, b });
      tools.append(b);
    }

    const stencils = this.section(root, L.sections.stencils);
    for (const s of STENCILS) {
      const info = L.stencils[s.id];
      const b = iconButton(s.id, `${info.name} : ${info.info}`);
      b.addEventListener('click', pick({ kind: 'stencil', id: s.id }));
      this.holdButtons.push({ h: { kind: 'stencil', id: s.id }, b });
      stencils.append(b);
    }
    this.stencilOpts = el('div', 'stencil-opts');
    const rotate = iconButton('rotate', L.actions.rotate, 'mini');
    rotate.addEventListener('click', () => {
      actions.click();
      sel.set({ angle: (sel.value.angle + STAMP_ROTATE_STEP) % (Math.PI * 2) });
    });
    this.stencilOpts.append(rotate);
    stencils.append(this.stencilOpts);

    const tracing = this.section(root, L.sections.tracing, 'tracing');
    for (const a of ANIMALS) {
      const b = el('button', 'tool animal', animalIcon(a.outline));
      b.type = 'button';
      b.title = L.animals[a.id];
      b.setAttribute('aria-label', L.animals[a.id]);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        actions.click();
        // Tapping the animal already on the wall takes the paper away.
        sel.set({ tracing: sel.value.tracing === a.id ? null : a.id });
        if (!this.tracingHinted && sel.value.tracing) {
          this.tracingHinted = true;
          actions.firstTracing();
        }
      });
      this.animalButtons.push({ id: a.id, b });
      tracing.append(b);
    }

    const pig = this.section(root, L.sections.pigments, 'pigments');
    for (const p of PIGMENTS) {
      const b = el('button', 'pigment');
      b.type = 'button';
      b.title = L.pigments[p.id];
      b.setAttribute('aria-label', L.pigments[p.id]);
      b.style.setProperty('--pigment', hex(p.color));
      b.addEventListener('click', () => {
        actions.click();
        sel.set({ pigment: p.id });
      });
      this.pigmentButtons.push({ id: p.id, b });
      pig.append(b);
    }

    const sizeSec = this.section(root, L.sections.size, 'size');
    this.size = el('input');
    this.size.type = 'range';
    this.size.min = String(SIZE_MUL_MIN);
    this.size.max = String(SIZE_MUL_MAX);
    this.size.step = '0.05';
    this.size.setAttribute('aria-label', L.sections.size);
    this.size.addEventListener('input', () => sel.set({ sizeMul: Number(this.size.value) }));
    sizeSec.append(this.size);

    const bottom = el('div', 'actions');
    this.undoBtn = iconButton('undo', L.actions.undo, 'mini');
    this.redoBtn = iconButton('redo', L.actions.redo, 'mini');
    const menu = iconButton('menu', L.actions.menu, 'mini');
    this.undoBtn.addEventListener('click', () => actions.undo());
    this.redoBtn.addEventListener('click', () => actions.redo());
    menu.addEventListener('click', () => actions.menu());
    bottom.append(this.undoBtn, this.redoBtn, menu);
    root.append(bottom);

    sel.on(() => this.render());
    this.render();
  }

  private section(root: HTMLElement, title: string, cls = ''): HTMLElement {
    const s = el('section', cls);
    s.append(el('h2', '', title));
    const grid = el('div', 'grid');
    s.append(grid);
    root.append(s);
    return grid;
  }

  setHistory(canUndo: boolean, canRedo: boolean): void {
    this.undoBtn.disabled = !canUndo;
    this.redoBtn.disabled = !canRedo;
  }

  render(): void {
    const s = this.sel.value;
    for (const { h, b } of this.holdButtons) b.classList.toggle('active', same(h, s.holding));
    // Stencil icons turn with the stencil, so the buttons show how it will land on the wall.
    // Follow the shortest way round so 270° -> 0° animates as one more quarter turn.
    let d = (s.angle - this.iconAngle) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.iconAngle += d;
    for (const { h, b } of this.holdButtons) {
      if (h.kind === 'stencil') b.style.setProperty('--stencil-angle', `${this.iconAngle}rad`);
    }
    for (const { id, b } of this.pigmentButtons) b.classList.toggle('active', id === s.pigment);
    for (const { id, b } of this.animalButtons) {
      b.classList.toggle('active', id === s.tracing);
      b.setAttribute('aria-pressed', String(id === s.tracing));
    }
    this.stencilOpts.classList.toggle('hidden', s.holding.kind !== 'stencil');
    if (document.activeElement !== this.size) this.size.value = String(s.sizeMul);
    const pigment = PIGMENTS.find((p) => p.id === s.pigment)!;
    document.documentElement.style.setProperty('--current-pigment', hex(pigment.color));
  }
}
