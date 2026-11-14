// The game board: draws what the simulation reports (wall, pigment, torch light)
// and turns pointer input into simulation commands.

import Phaser from 'phaser';
import type { AudioEngine } from '../audio/audio';
import type { Dab } from '../sim/brush';
import { actionDabs } from '../sim/doc';
import type { CaveSim } from '../sim/sim';
import { stencilScale, type StampPlacement } from '../sim/spray';
import type { Selection, Settings, Store } from '../state';
import type { AnimalId } from '../content/animals';
import { LIGHT, PIGMENTS, STAMP_ROTATE_STEP, TICK_MS, TORCH, TRACING, WALL_H, WALL_W, type PigmentId } from '../units';
import { LIGHT_FRAG } from './lightShader';
import {
  DAB_SIZE,
  OBJECT_RES,
  createDabTextures,
  createObjectTextures,
  createTorchTextures,
  createTracingTexture,
  dabKey,
  objectKey,
  tracingPinOffset,
} from './textures';
import { generateWall } from './wallgen';

export interface SceneDeps {
  sim: CaveSim;
  selection: Store<Selection>;
  settings: Store<Settings>;
  audio: AudioEngine;
  /** True while a menu covers the wall. */
  blocked: () => boolean;
  /** The painting changed (autosave, undo button state). */
  changed: () => void;
}

const PIGMENT_COLOR = new Map<PigmentId, number>(PIGMENTS.map((p) => [p.id, p.color]));
const CLAMP = { wrapS: 'clamp_to_edge', wrapT: 'clamp_to_edge' };
const TORCH_TILT = -0.38;
const TORCH_HOME_X = WALL_W * TORCH.homeX;
/** Gap kept between the torch's home and the right edge of the visible wall. */
const TORCH_HOME_INSET = WALL_W - TORCH_HOME_X;
const TORCH_HOME_Y = WALL_H * TORCH.homeY;

interface QueuedDabs {
  color: number;
  dabs: Dab[];
  /** Spread over several frames (blowpipe puffs) instead of drawn at once. */
  trickle: boolean;
}

type Drag =
  | { kind: 'torch'; id: number; dx: number; dy: number }
  | { kind: 'stroke'; id: number; lastX: number; lastY: number; lastT: number; speed: number }
  | { kind: 'stamp'; id: number }
  | { kind: 'paper'; id: number; dx: number; dy: number };

export class CaveScene extends Phaser.Scene {
  private paint!: Phaser.Textures.DynamicTexture;
  private light!: Phaser.GameObjects.Shader;
  private albedoCanvas!: Phaser.Textures.CanvasTexture;
  private normalCanvas!: Phaser.Textures.CanvasTexture;
  private torch!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Image;
  private flames!: Phaser.GameObjects.Particles.ParticleEmitter;
  private embers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private held!: Phaser.GameObjects.Image;
  private paper!: Phaser.GameObjects.Image;
  private paperId: AnimalId | null = null;
  private lastWheel = 0;
  private torchTween: Phaser.Tweens.Tween | null = null;
  private torchVel = 0;
  private lastTorchX = TORCH_HOME_X;

  private acc = 0;
  private queue: QueuedDabs[] = [];
  private trickle: QueuedDabs[] = [];
  private drag: Drag | null = null;
  private hover: { x: number; y: number } | null = null;
  private wallSeed = -1;
  private flameNow = { x: TORCH_HOME_X, y: TORCH_HOME_Y, intensity: 1 };

  constructor(private readonly deps: SceneDeps) {
    super({ key: 'cave' });
  }

  create(): void {
    const tm = this.textures;
    createDabTextures(tm);
    createObjectTextures(tm);
    createTorchTextures(tm);

    this.albedoCanvas = tm.createCanvas('wall-albedo', WALL_W, WALL_H)!;
    this.normalCanvas = tm.createCanvas('wall-normal', WALL_W, WALL_H)!;
    this.buildWall(this.deps.sim.doc.wallSeed);

    this.paint = tm.addDynamicTexture('paint', WALL_W, WALL_H)!;

    const base = new Phaser.Display.BaseShader('light', LIGHT_FRAG, undefined, {
      uTorch: { type: '3f', value: { x: TORCH_HOME_X, y: TORCH_HOME_Y, z: TORCH.height } },
      uIntensity: { type: '1f', value: TORCH.intensity },
      uRadius: { type: '1f', value: TORCH.radius },
      uPaintFlipY: { type: '1f', value: 0 },
      uAmbient: { type: '3f', value: { x: LIGHT.ambient[0], y: LIGHT.ambient[1], z: LIGHT.ambient[2] } },
      uTorchColor: { type: '3f', value: { x: LIGHT.torchColor[0], y: LIGHT.torchColor[1], z: LIGHT.torchColor[2] } },
      uExposure: { type: '1f', value: LIGHT.exposure },
      uBump: { type: '1f', value: LIGHT.bump },
    });
    this.light = this.add.shader(base, WALL_W / 2, WALL_H / 2, WALL_W, WALL_H);
    this.light.setChannel0('wall-albedo', { ...CLAMP });
    this.light.setChannel1('wall-normal', { ...CLAMP });
    this.light.setChannel2('paint');

    // The object held against the wall when using a stencil.
    // Tracing paper: a guide laid over the wall, never part of the painting.
    this.paper = this.add.image(0, 0, '__DEFAULT').setVisible(false);
    this.held = this.add.image(0, 0, objectKey('hand')).setVisible(false);

    this.createTorch();
    // Keep the resting torch on screen when the visible part of the wall changes.
    const placeTorch = () => {
      if (this.drag?.kind === 'torch') return;
      this.torchTween?.stop();
      this.torchTween = null;
      this.torch.x = this.torchHomeX();
      this.torch.y = TORCH_HOME_Y;
    };
    placeTorch();
    this.scale.on(Phaser.Scale.Events.RESIZE, placeTorch);
    this.bindInput();
    this.replayAll();
  }

  // ------------------------------------------------------------ wall

  private buildWall(seed: number): void {
    if (seed === this.wallSeed) return;
    this.wallSeed = seed;
    const maps = generateWall(seed, WALL_W, WALL_H);
    this.albedoCanvas.context.putImageData(maps.albedo, 0, 0);
    this.albedoCanvas.refresh();
    this.normalCanvas.context.putImageData(maps.normal, 0, 0);
    this.normalCanvas.refresh();
  }

  private replayAll(): void {
    this.paint.clear();
    this.queue = [];
    this.trickle = [];
    for (const a of this.deps.sim.doc.actions) {
      this.queue.push({ color: PIGMENT_COLOR.get(a.pigment)!, dabs: actionDabs(a), trickle: false });
    }
  }

  private drawDabs(color: number, dabs: readonly Dab[]): void {
    if (!dabs.length) return;
    const p = this.paint;
    p.beginDraw();
    for (const d of dabs) {
      p.stamp(dabKey(d.tex, d.variant), undefined, d.x, d.y, {
        alpha: d.alpha,
        tint: color,
        rotation: d.angle || 0.0001,
        scale: d.size / DAB_SIZE[d.tex],
        skipBatch: true,
      });
    }
    p.endDraw();
  }

  private flushQueues(): void {
    for (const q of this.queue) this.drawDabs(q.color, q.dabs);
    this.queue = [];
    // Blowpipe puffs arrive once per tick: spread them over the frames until the next one.
    const next: QueuedDabs[] = [];
    for (const q of this.trickle) {
      const n = Math.max(1, Math.ceil(q.dabs.length / 5));
      this.drawDabs(q.color, q.dabs.slice(0, n));
      if (q.dabs.length > n) next.push({ ...q, dabs: q.dabs.slice(n) });
    }
    this.trickle = next;
  }

  // ------------------------------------------------------------ torch

  private createTorch(): void {
    this.glow = this.add.image(TORCH_HOME_X, TORCH_HOME_Y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setScale(3.2);
    this.smoke = this.add.particles(0, 0, 'flame', {
      lifespan: { min: 1800, max: 2800 },
      speedY: { min: -70, max: -40 },
      speedX: { min: -12, max: 12 },
      scale: { start: 0.6, end: 2.6 },
      alpha: { start: 0.18, end: 0 },
      tint: 0x0d0907,
      frequency: 110,
    });
    this.torch = this.add.image(TORCH_HOME_X, TORCH_HOME_Y, 'torch').setOrigin(0.5, 0.05).setRotation(TORCH_TILT);
    this.flames = this.add.particles(0, 0, 'flame', {
      lifespan: { min: 320, max: 620 },
      speedY: { min: -150, max: -60 },
      speedX: { min: -20, max: 20 },
      accelerationY: -110,
      scale: { start: 0.85, end: 0.08 },
      alpha: { start: 0.85, end: 0 },
      color: [0xfff1c2, 0xffc457, 0xff7a1c, 0x9c2606],
      colorEase: 'quad.out',
      blendMode: Phaser.BlendModes.ADD,
      frequency: 12,
      quantity: 2,
    });
    this.embers = this.add.particles(0, 0, 'flame', {
      lifespan: { min: 1400, max: 2600 },
      speedY: { min: -130, max: -50 },
      speedX: { min: -35, max: 35 },
      scale: { start: 0.09, end: 0.02 },
      alpha: { start: 1, end: 0 },
      color: [0xffe08a, 0xff7a1c, 0x5a1204],
      blendMode: Phaser.BlendModes.ADD,
      frequency: 170,
    });
  }

  private torchHit(x: number, y: number): boolean {
    const t = this.torch;
    if (Math.hypot(x - t.x, y - t.y + 20) < TORCH.grabRadius) return true;
    // Along the stick.
    const len = 300;
    const ex = t.x - Math.sin(t.rotation) * len;
    const ey = t.y + Math.cos(t.rotation) * len;
    const vx = ex - t.x;
    const vy = ey - t.y;
    const h = Math.max(0, Math.min(1, ((x - t.x) * vx + (y - t.y) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(x - t.x - vx * h, y - t.y - vy * h) < 42;
  }

  /** Horizontal range of the wall actually on screen (the sides are cropped on narrow screens). */
  private visibleX(): { x0: number; x1: number } {
    const shown = this.scale.displaySize.width;
    const vw = shown > 0 ? Math.min(WALL_W, (WALL_W * this.scale.parentSize.width) / shown) : WALL_W;
    return { x0: (WALL_W - vw) / 2, x1: (WALL_W + vw) / 2 };
  }

  private torchHomeX(): number {
    return this.visibleX().x1 - TORCH_HOME_INSET;
  }

  private sendTorchHome(): void {
    this.torchTween?.stop();
    this.torchTween = this.tweens.add({
      targets: this.torch,
      x: this.torchHomeX(),
      y: TORCH_HOME_Y,
      duration: TORCH.returnSeconds * 1000,
      ease: 'Back.easeOut',
      onComplete: () => (this.torchTween = null),
    });
  }

  private updateTorch(alpha: number, time: number, dt: number): void {
    const { sim, settings } = this.deps;
    const motion = settings.value.reducedMotion ? TORCH.reducedMotionScale : 1;
    const f = sim.flame.lerp(alpha);
    // Fast shimmer on top of the simulated flicker (presentation only).
    const shimmer = 1 + motion * (0.035 * Math.sin(time * 0.031) + 0.025 * Math.sin(time * 0.057 + 1.3));
    const intensity = f.intensity * shimmer;

    const t = this.torch;
    // Swing: the torch leans against its motion.
    const vx = dt > 0 ? (t.x - this.lastTorchX) / dt : 0;
    this.lastTorchX = t.x;
    this.torchVel += (vx - this.torchVel) * 0.2;
    const lean = Phaser.Math.Clamp(-this.torchVel * 0.35, -0.5, 0.5) * motion;
    t.rotation += (TORCH_TILT + lean - t.rotation) * 0.15;

    const fx = t.x + f.swayX;
    const fy = t.y - 22 + f.swayY;
    this.flameNow = { x: fx, y: fy, intensity };
    this.flames.particleX = t.x;
    this.flames.particleY = t.y - 4;
    this.embers.particleX = t.x;
    this.embers.particleY = t.y - 10;
    this.smoke.particleX = t.x;
    this.smoke.particleY = t.y - 60;
    this.glow.setPosition(fx, fy).setAlpha(0.55 + 0.4 * (intensity - 0.8));

    const u = this.light.uniforms as Record<string, { value: unknown }>;
    u.uTorch!.value = { x: fx, y: fy, z: TORCH.height };
    u.uIntensity!.value = TORCH.intensity * intensity;
    u.time!.value = time / 1000;
  }

  /** Approximate torch light at a point, as a tint for objects drawn over the wall. */
  private tintAt(x: number, y: number): number {
    const f = this.flameNow;
    const d2 = (x - f.x) ** 2 + (y - f.y) ** 2 + TORCH.height ** 2;
    const att = (TORCH.intensity * f.intensity) / (1 + d2 / TORCH.radius ** 2);
    const ch = (amb: number, c: number) => {
      const v = 1 - Math.exp(-(amb * 1.6 + c * att * 0.85) * LIGHT.exposure * 1.25);
      return Math.round(Math.min(1, v) * 255);
    };
    return (
      (ch(LIGHT.ambient[0], LIGHT.torchColor[0]) << 16) |
      (ch(LIGHT.ambient[1], LIGHT.torchColor[1]) << 8) |
      ch(LIGHT.ambient[2], LIGHT.torchColor[2])
    );
  }

  // ------------------------------------------------------------ stencil object

  private placement(x: number, y: number): StampPlacement | null {
    const s = this.deps.selection.value;
    if (s.holding.kind !== 'stencil') return null;
    return { shape: s.holding.id, x, y, angle: s.angle, sizeMul: s.sizeMul, flip: false };
  }

  private showHeld(pl: StampPlacement, pressed: boolean): void {
    const sc = stencilScale(pl.shape, pl.sizeMul) / OBJECT_RES;
    this.held
      .setTexture(objectKey(pl.shape))
      .setPosition(pl.x, pl.y)
      .setRotation(pl.angle)
      .setScale(sc, sc)
      .setAlpha(pressed ? 1 : 0.4)
      .setTint(this.tintAt(pl.x, pl.y))
      .setVisible(true);
  }

  private updateHeld(): void {
    if (this.drag?.kind === 'stamp') {
      this.held.setTint(this.tintAt(this.held.x, this.held.y));
      return;
    }
    if (this.held.getData('lifting')) return;
    const pl = this.hover && !this.deps.blocked() ? this.placement(this.hover.x, this.hover.y) : null;
    if (pl) this.showHeld(pl, false);
    else this.held.setVisible(false);
  }

  private liftHeld(): void {
    this.held.setData('lifting', true);
    this.tweens.add({
      targets: this.held,
      alpha: 0,
      scaleX: this.held.scaleX * 1.06,
      scaleY: this.held.scaleY * 1.06,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.held.setData('lifting', false).setVisible(false);
      },
    });
  }

  // ------------------------------------------------------------ input

  private toWall(e: PointerEvent): { x: number; y: number } {
    return { x: this.scale.transformX(e.pageX), y: this.scale.transformY(e.pageY) };
  }

  private pressure(e: PointerEvent): number {
    return e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
  }

  private bindInput(): void {
    const canvas = this.game.canvas;
    const { sim, selection, audio } = this.deps;

    const down = (e: PointerEvent) => {
      if (this.drag || this.deps.blocked() || !e.isPrimary) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      audio.unlock();
      const p = this.toWall(e);
      if (this.torchHit(p.x, p.y)) {
        this.torchTween?.stop();
        this.torchTween = null;
        this.drag = { kind: 'torch', id: e.pointerId, dx: this.torch.x - p.x, dy: this.torch.y - p.y };
        audio.torchGrab();
        return;
      }
      if (this.pinHit(p.x, p.y)) {
        this.drag = { kind: 'paper', id: e.pointerId, dx: this.paper.x - p.x, dy: this.paper.y - p.y };
        audio.torchDrop();
        return;
      }
      const sel = selection.value;
      if (sel.holding.kind === 'tool') {
        sim.beginStroke(sel.holding.id, sel.pigment, sel.sizeMul, p.x, p.y, this.pressure(e));
        this.drag = { kind: 'stroke', id: e.pointerId, lastX: p.x, lastY: p.y, lastT: e.timeStamp, speed: 0 };
        audio.strokeStart(sel.holding.id);
      } else {
        const pl = this.placement(p.x, p.y)!;
        this.tweens.killTweensOf(this.held);
        this.held.setData('lifting', false);
        this.showHeld(pl, true);
        sim.beginStamp(pl, sel.pigment);
        this.drag = { kind: 'stamp', id: e.pointerId };
        audio.blowStart();
      }
    };

    const move = (e: PointerEvent) => {
      const p = this.toWall(e);
      if (e.pointerType === 'mouse') this.hover = p;
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      if (d.kind === 'torch') {
        const { x0, x1 } = this.visibleX();
        this.torch.x = Phaser.Math.Clamp(p.x + d.dx, x0 + 30, x1 - 30);
        this.torch.y = Phaser.Math.Clamp(p.y + d.dy, 40, WALL_H - 20);
      } else if (d.kind === 'paper') {
        this.paper.x = Phaser.Math.Clamp(p.x + d.dx, 0, WALL_W);
        this.paper.y = Phaser.Math.Clamp(p.y + d.dy, -tracingPinOffset(), WALL_H);
      } else if (d.kind === 'stroke') {
        const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
        for (const ce of events.length ? events : [e]) {
          const q = this.toWall(ce);
          sim.strokeTo(q.x, q.y, this.pressure(ce));
        }
        const dt = Math.max(1, e.timeStamp - d.lastT);
        const v = Math.hypot(p.x - d.lastX, p.y - d.lastY) / dt;
        d.speed += (v - d.speed) * 0.3;
        d.lastX = p.x;
        d.lastY = p.y;
        d.lastT = e.timeStamp;
      }
    };

    const up = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      if (d.kind === 'torch') {
        this.sendTorchHome();
        audio.torchDrop();
      } else if (d.kind === 'paper') {
        selection.set({ tracingX: Math.round(this.paper.x), tracingY: Math.round(this.paper.y) });
      } else if (d.kind === 'stroke') {
        sim.endStroke();
        audio.strokeEnd();
      } else {
        sim.endStamp();
        this.liftHeld();
        audio.blowEnd();
      }
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.hover = null;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        const s = selection.value;
        if (s.holding.kind !== 'stencil') return;
        e.preventDefault();
        // One wheel notch = a quarter turn, like the rotate button.
        if (e.timeStamp - this.lastWheel < 250) return;
        this.lastWheel = e.timeStamp;
        const turn = Math.sign(e.deltaY) * STAMP_ROTATE_STEP;
        selection.set({ angle: (s.angle + turn + Math.PI * 2) % (Math.PI * 2) });
      },
      { passive: false },
    );
  }

  /** Ends whatever the pointer was doing (e.g. when the game is paused). */
  releaseAll(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.kind === 'torch') this.sendTorchHome();
    if (d.kind === 'stamp') this.liftHeld();
    if (d.kind === 'paper') {
      this.deps.selection.set({ tracingX: Math.round(this.paper.x), tracingY: Math.round(this.paper.y) });
    }
    this.deps.sim.cancelActive();
    this.deps.audio.strokeEnd();
    this.deps.audio.blowEnd();
  }

  // ------------------------------------------------------------ tracing paper

  private pinHit(x: number, y: number): boolean {
    if (!this.paper.visible) return false;
    return Math.hypot(x - this.paper.x, y - (this.paper.y + tracingPinOffset())) < TRACING.pinRadius;
  }

  private updatePaper(): void {
    const sel = this.deps.selection.value;
    if (sel.tracing !== this.paperId) {
      this.paperId = sel.tracing;
      if (sel.tracing) this.paper.setTexture(createTracingTexture(this.textures, sel.tracing));
      this.paper.setVisible(sel.tracing !== null);
    }
    if (!this.paper.visible) return;
    if (this.drag?.kind !== 'paper') this.paper.setPosition(sel.tracingX, sel.tracingY);
    // Lit by the torch, but kept readable even in the dark.
    const t = this.tintAt(this.paper.x, this.paper.y);
    const lift = (c: number) => Math.round(c + (255 - c) * 0.5);
    this.paper.setTint((lift((t >> 16) & 255) << 16) | (lift((t >> 8) & 255) << 8) | lift(t & 255));
  }

  /** Hides the tracing paper so a saved picture shows only the painting. */
  setGuidesHidden(hidden: boolean): void {
    this.paper.setAlpha(hidden ? 0 : 1);
  }

  // ------------------------------------------------------------ frame

  update(time: number): void {
    const { sim, audio, settings } = this.deps;
    // Phaser smooths and caps its delta; the fixed-rate simulation needs real elapsed time.
    const delta = Math.min(this.game.loop.rawDelta, 250);
    sim.motionScale = settings.value.reducedMotion ? TORCH.reducedMotionScale : 1;
    if (!sim.paused) {
      this.acc += delta;
      while (this.acc >= TICK_MS) {
        sim.tick();
        this.acc -= TICK_MS;
      }
    }

    for (const ev of sim.drain()) {
      if (ev.k === 'dabs') {
        this.queue.push({ color: PIGMENT_COLOR.get(ev.pigment)!, dabs: ev.dabs, trickle: sim.pressing });
      } else if (ev.k === 'redraw') {
        this.replayAll();
      } else if (ev.k === 'wall') {
        this.buildWall(ev.seed);
      } else if (ev.k === 'changed') {
        this.deps.changed();
      }
    }
    // Move puffs from the main queue to the trickle queue.
    const now: QueuedDabs[] = [];
    for (const q of this.queue) (q.trickle ? this.trickle : now).push(q);
    this.queue = now;
    this.flushQueues();

    this.updateTorch(this.acc / TICK_MS, time, delta);
    this.updateHeld();
    this.updatePaper();

    const d = this.drag;
    if (d?.kind === 'stroke') {
      audio.strokeSpeed(d.speed);
      d.speed *= 0.9;
    }
    if (d?.kind === 'stamp') audio.blowStrength(sim.pressSeconds);
    audio.torchSpeed(Math.abs(this.torchVel));
    audio.fireLevel(this.flameNow.intensity);
  }
}
