// Pause menu: settings, picture export, save export/import, fresh wall.

import { L } from '../content/lines';
import type { Settings, Store } from '../state';

export interface MenuActions {
  resume(): void;
  savePicture(): void;
  freshWall(): void;
  exportSave(): void;
  importSave(file: File): Promise<boolean>;
  click(): void;
}

export class Menu {
  open = false;
  private freshArmed = false;
  private readonly freshBtn: HTMLButtonElement;
  private readonly note: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly settings: Store<Settings>,
    actions: MenuActions,
  ) {
    root.innerHTML = `
      <div class="menu-card">
        <h2>${L.menu.title}</h2>
        <button class="stone-btn big" data-a="resume">${L.menu.resume}</button>
        <label class="row">${L.menu.sfx}<input type="range" min="0" max="1" step="0.05" data-s="sfx"></label>
        <label class="row">${L.menu.music}<input type="range" min="0" max="1" step="0.05" data-s="music"></label>
        <label class="row check"><input type="checkbox" data-s="leftHanded">${L.menu.leftHanded}</label>
        <label class="row check"><input type="checkbox" data-s="reducedMotion">${L.menu.reducedMotion}</label>
        <div class="menu-grid">
          <button class="stone-btn" data-a="picture">${L.menu.savePicture}</button>
          <button class="stone-btn" data-a="export">${L.menu.exportSave}</button>
          <button class="stone-btn" data-a="import">${L.menu.importSave}</button>
          <button class="stone-btn danger" data-a="fresh">${L.menu.freshWall}</button>
        </div>
        <p class="note" aria-live="polite"></p>
        <p class="credits">${L.menu.credits}</p>
        <input type="file" accept="application/json,.json" hidden>
      </div>`;
    const q = <T extends Element>(s: string) => root.querySelector<T>(s)!;
    this.freshBtn = q<HTMLButtonElement>('[data-a="fresh"]');
    this.note = q<HTMLElement>('.note');
    const file = q<HTMLInputElement>('input[type="file"]');

    q('[data-a="resume"]').addEventListener('click', () => actions.resume());
    q('[data-a="picture"]').addEventListener('click', () => actions.savePicture());
    q('[data-a="export"]').addEventListener('click', () => actions.exportSave());
    q('[data-a="import"]').addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      this.note.textContent = (await actions.importSave(f)) ? L.menu.imported : L.menu.importFailed;
    });
    this.freshBtn.addEventListener('click', () => {
      actions.click();
      if (!this.freshArmed) {
        this.freshArmed = true;
        this.freshBtn.textContent = L.menu.freshWallConfirm;
        return;
      }
      this.disarm();
      actions.freshWall();
    });

    for (const input of root.querySelectorAll<HTMLInputElement>('[data-s]')) {
      const key = input.dataset.s as keyof Settings;
      input.addEventListener('input', () => {
        settings.set({ [key]: input.type === 'checkbox' ? input.checked : Number(input.value) } as Partial<Settings>);
      });
    }
    root.addEventListener('pointerdown', (e) => {
      if (e.target === root) actions.resume();
    });
  }

  private disarm(): void {
    this.freshArmed = false;
    this.freshBtn.textContent = L.menu.freshWall;
  }

  show(): void {
    this.open = true;
    this.disarm();
    this.note.textContent = '';
    for (const input of this.root.querySelectorAll<HTMLInputElement>('[data-s]')) {
      const v = this.settings.value[input.dataset.s as keyof Settings];
      if (input.type === 'checkbox') input.checked = Boolean(v);
      else input.value = String(v);
    }
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.open = false;
    this.root.classList.add('hidden');
  }
}
