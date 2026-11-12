import Phaser from 'phaser';
import './ui/style.css';
import { AudioEngine } from './audio/audio';
import { registerServiceWorker, syncPrecache } from './boot/precache';
import { L } from './content/lines';
import { download, enterFullscreen, lockGestures, onBackground, query } from './platform/platform';
import { CaveScene } from './render/CaveScene';
import { loadSave, parseSave, requestPersistence, writeSave, type SaveV1 } from './save/store';
import { CaveSim } from './sim/sim';
import { Store, defaultSelection, defaultSettings } from './state';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { AUTOSAVE_MS, SIZE_MUL_MAX, SIZE_MUL_MIN, WALL_H, WALL_W } from './units';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function boot(): Promise<void> {
  lockGestures();
  registerServiceWorker();
  void requestPersistence();

  $('title').textContent = L.title;
  $('tagline').textContent = L.tagline;
  $('load-status').textContent = L.loading;
  $('rotate').querySelector('p')!.textContent = L.rotate;
  const play = $<HTMLButtonElement>('play');
  play.textContent = L.ready;

  // ---------------------------------------------------------------- state
  const q = query();
  const saved = q.has('fresh') ? null : await loadSave();
  const seedParam = Number(q.get('seed'));
  const settings = new Store(saved?.settings ?? defaultSettings());
  const selection = new Store(saved?.selection ?? defaultSelection());
  const sim = new CaveSim(
    saved?.doc ?? (Number.isFinite(seedParam) && q.has('seed') ? { wallSeed: seedParam >>> 0, actions: [] } : undefined),
  );
  const audio = new AudioEngine();
  const unlock = () => audio.unlock();
  document.addEventListener('touchend', unlock, { passive: true });
  document.addEventListener('click', unlock);

  let inCave = false;
  let saveTimer = 0;
  const snapshot = (): SaveV1 => ({ v: 1, doc: sim.doc, settings: settings.value, selection: selection.value });
  const scheduleSave = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void writeSave(snapshot()).catch(() => {}), AUTOSAVE_MS);
  };

  // ---------------------------------------------------------------- UI
  const toast = document.createElement('div');
  toast.className = 'toast';
  document.body.append(toast);
  let toastTimer = 0;
  const showToast = (text: string, ms = 5000) => {
    toast.textContent = text;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), ms);
  };

  const menu = new Menu($('menu'), settings, {
    resume: () => closeMenu(),
    click: () => audio.click(),
    savePicture: () => {
      audio.click();
      scene.setGuidesHidden(true);
      game.renderer.snapshot((img) => {
        scene.setGuidesHidden(false);
        if (!(img instanceof HTMLImageElement)) return;
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        c.getContext('2d')!.drawImage(img, 0, 0);
        c.toBlob((b) => b && download(`peinture-rupestre-${Date.now()}.png`, b), 'image/png');
      });
    },
    freshWall: () => {
      sim.newWall();
      closeMenu();
    },
    exportSave: () => {
      audio.click();
      download(`peinture-rupestre-${Date.now()}.json`, new Blob([JSON.stringify(snapshot())], { type: 'application/json' }));
    },
    importSave: async (file) => {
      try {
        const s = parseSave(JSON.parse(await file.text()));
        if (!s) return false;
        sim.load(s.doc);
        settings.set(s.settings);
        selection.set(s.selection);
        scheduleSave();
        return true;
      } catch {
        return false;
      }
    },
  });

  const hud = new Hud($('toolbar'), selection, {
    undo: () => {
      audio.click();
      sim.undo();
    },
    redo: () => {
      audio.click();
      sim.redo();
    },
    menu: () => openMenu(),
    click: () => audio.click(),
    firstStencil: () => showToast(L.hintStencil, 7000),
    firstTracing: () => showToast(L.hintTracing, 7000),
  });

  // ---------------------------------------------------------------- game
  const scene = new CaveScene({
    sim,
    selection,
    settings,
    audio,
    blocked: () => !inCave || menu.open,
    changed: () => {
      hud.setHistory(sim.history.canUndo(), sim.history.canRedo());
      scheduleSave();
    },
  });
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'game',
    width: WALL_W,
    height: WALL_H,
    backgroundColor: '#000000',
    banner: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    audio: { noAudio: true },
    render: { antialias: true, powerPreference: 'high-performance' },
    scene: [scene],
  });
  hud.setHistory(sim.history.canUndo(), false);
  if (q.has('debug')) Object.assign(window, { cave: { game, sim, selection, settings } });

  function openMenu(): void {
    if (menu.open) return;
    scene.releaseAll();
    sim.paused = true;
    menu.show();
  }
  function closeMenu(): void {
    audio.click();
    menu.hide();
    sim.paused = false;
    scheduleSave();
  }

  const applySettings = () => {
    const s = settings.value;
    document.body.classList.toggle('left-handed', s.leftHanded);
    audio.setVolumes(s.sfx, s.music);
    requestAnimationFrame(() => game.scale.refresh());
    scheduleSave();
  };
  settings.on(applySettings);
  selection.on(scheduleSave);
  applySettings();

  // Pause in the background: stop the sound and the simulation, open the menu.
  onBackground(
    () => {
      audio.suspend();
      void writeSave(snapshot()).catch(() => {});
      if (inCave) openMenu();
    },
    () => audio.resume(),
  );

  document.addEventListener('keydown', (e) => {
    if (!inCave) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') (menu.open ? closeMenu : openMenu)();
    else if (menu.open) return;
    else if (mod && e.key.toLowerCase() === 'z') (e.shiftKey ? sim.redo() : sim.undo(), e.preventDefault());
    else if (mod && e.key.toLowerCase() === 'y') (sim.redo(), e.preventDefault());
    else if (e.key === '[' || e.key === ']') {
      const d = e.key === ']' ? 0.1 : -0.1;
      selection.set({ sizeMul: Math.min(SIZE_MUL_MAX, Math.max(SIZE_MUL_MIN, selection.value.sizeMul + d)) });
    }
  });

  // ---------------------------------------------------------------- loading screen
  const fill = $('bar-fill');
  let ok = true;
  try {
    ok = await syncPrecache((loaded, total) => {
      fill.style.width = `${Math.round((loaded / total) * 100)}%`;
    });
  } catch {
    ok = false;
  }
  fill.style.width = '100%';
  $('load-status').textContent = ok ? '' : L.loadingFailed;
  play.disabled = false;
  play.addEventListener('click', () => {
    enterFullscreen();
    audio.unlock();
    $('loader').classList.add('hidden');
    inCave = true;
    requestAnimationFrame(() => game.scale.refresh());
    showToast(L.hintTorch);
  });
}

void boot();
