// All tuning numbers live here so balancing never means touching logic.
// Tools, pigments and stencils are data: add an entry and it appears in the game.

export const TICK_HZ = 10;
export const TICK_MS = 1000 / TICK_HZ;

/** Logical size of the wall (game board), in pixels. Phaser scales it to fit. */
export const WALL_W = 1600;
export const WALL_H = 1000;

// ---------------------------------------------------------------- pigments
// Only colours that Upper Palaeolithic painters could actually make.
// Values are approximations of the dry pigment on limestone.

export type PigmentId =
  | 'redOchre'
  | 'yellowOchre'
  | 'burntOchre'
  | 'umber'
  | 'charcoal'
  | 'manganese'
  | 'kaolin';

export interface Pigment {
  id: PigmentId;
  /** 0xRRGGBB */
  color: number;
}

export const PIGMENTS: readonly Pigment[] = [
  { id: 'redOchre', color: 0x8c3a24 }, // hematite
  { id: 'burntOchre', color: 0xa35a2e }, // heated goethite
  { id: 'yellowOchre', color: 0xb98d45 }, // goethite / limonite
  { id: 'umber', color: 0x5c3d27 }, // iron + manganese earth
  { id: 'manganese', color: 0x2f2722 }, // pyrolusite
  { id: 'charcoal', color: 0x1b1715 }, // burnt pine / juniper
  { id: 'kaolin', color: 0xd8ccb4 }, // kaolin clay / calcite
];

// ---------------------------------------------------------------- tools

export type ToolId = 'finger' | 'lump' | 'brush' | 'twig';
export type DabTexture = 'finger' | 'lump' | 'bristle' | 'twig' | 'speck';

export interface ToolDef {
  id: ToolId;
  /** Dab diameter in px at size multiplier 1. */
  size: number;
  /** Distance between dabs as a fraction of dab size. */
  spacing: number;
  /** Opacity of one dab at full load. */
  flow: number;
  /** Random size variation (fraction). */
  sizeJitter: number;
  /** Random position offset in px. */
  posJitter: number;
  /** Random angle variation in radians. */
  angleJitter: number;
  /** Rotate dabs along the stroke direction. */
  follow: boolean;
  /** How far (px) a stroke travels before the tool runs half dry. 0 = never runs dry. */
  loadLength: number;
  /** Load left when the tool is "dry". */
  minLoad: number;
  /** How much pen pressure changes size (0..1). Mouse reports 0.5 = neutral. */
  pressureSize: number;
  texture: DabTexture;
}

export const TOOLS: readonly ToolDef[] = [
  {
    // Fingertip dipped in wet pigment paste: wide, soft, runs dry quickly.
    id: 'finger',
    size: 26,
    spacing: 0.14,
    flow: 0.34,
    sizeJitter: 0.1,
    posJitter: 1.5,
    angleJitter: 0.6,
    follow: false,
    loadLength: 900,
    minLoad: 0.18,
    pressureSize: 0.45,
    texture: 'finger',
  },
  {
    // Lump of ochre or a charred stick used like chalk: thin, grainy, never dries.
    id: 'lump',
    size: 11,
    spacing: 0.18,
    flow: 0.6,
    sizeJitter: 0.15,
    posJitter: 0.6,
    angleJitter: 0.4,
    follow: true,
    loadLength: 0,
    minLoad: 1,
    pressureSize: 0.5,
    texture: 'lump',
  },
  {
    // Tuft of animal hair bound to a stick: streaky, wide, long strokes.
    id: 'brush',
    size: 30,
    spacing: 0.06,
    flow: 0.2,
    sizeJitter: 0.05,
    posJitter: 0.8,
    angleJitter: 0.08,
    follow: true,
    loadLength: 1600,
    minLoad: 0.12,
    pressureSize: 0.6,
    texture: 'bristle',
  },
  {
    // Chewed twig: fibrous fine line, for contours and details.
    id: 'twig',
    size: 7,
    spacing: 0.15,
    flow: 0.6,
    sizeJitter: 0.12,
    posJitter: 0.4,
    angleJitter: 0.2,
    follow: true,
    loadLength: 900,
    minLoad: 0.15,
    pressureSize: 0.6,
    texture: 'twig',
  },
];

export const SIZE_MUL_MIN = 0.5;
export const SIZE_MUL_MAX = 2.2;
/** Points closer than this (px) to the previous one are ignored. */
export const MIN_POINT_DIST = 0.75;

// ---------------------------------------------------------------- stencils (blowpipe)

export type ShapeId = 'hand' | 'leaf' | 'shell';

export interface StencilDef {
  id: ShapeId;
  /** Pixels per shape unit at size multiplier 1 (shapes are about 2 units tall). */
  scale: number;
}

export const STENCILS: readonly StencilDef[] = [
  { id: 'hand', scale: 92 },
  { id: 'leaf', scale: 80 },
  { id: 'shell', scale: 70 },
];

export const SPRAY = {
  /** Particles blown per tick once the breath is at full strength. */
  particlesPerTick: 300,
  /** Seconds before the breath reaches full strength. */
  rampSeconds: 0.7,
  /** Halo width (px) at the start of the press, and after holding `growSeconds`. */
  spreadStart: 5,
  spreadMax: 26,
  growSeconds: 5,
  /** Fraction of particles that overspray far from the edge. */
  oversprayChance: 0.12,
  oversprayMul: 2.6,
  /** Particle diameter range in px. */
  sizeMin: 1.4,
  sizeMax: 4.8,
  /** Particle opacity range. */
  alphaMin: 0.22,
  alphaMax: 0.65,
  /** A press stops adding pigment after this long (the painter is out of breath). */
  maxSeconds: 12,
};

/** Grid step (shape units) used to find a shape's outline. */
export const OUTLINE_STEP = 0.012;

/** One press of the rotate button turns the stencil a quarter turn. */
export const STAMP_ROTATE_STEP = Math.PI / 2;

export const TRACING = {
  /** Width of the tracing paper on the wall, in px (the animal box is 400 x 260). */
  width: 760,
  /** Opacity of the paper sheet itself, and of the guide lines. */
  sheetAlpha: 0.13,
  lineAlpha: 0.75,
  /** Grab radius around the pin, in px. */
  pinRadius: 46,
};

// ---------------------------------------------------------------- torch & light

export const TORCH = {
  /** Home position of the flame, as a fraction of the wall size. */
  homeX: 0.9,
  homeY: 0.84,
  /** Flame height above the wall surface, in px (bigger = flatter light). */
  height: 260,
  /** Distance (px) at which light falls to half. */
  radius: 760,
  intensity: 1.55,
  /** Flicker amount per tick (random walk) and its limits. */
  flickerStep: 0.09,
  flickerMin: 0.78,
  flickerMax: 1.12,
  /** Chance per tick of a short gust that dims and sways the flame. */
  gustChance: 0.04,
  gustDip: 0.2,
  swayPx: 7,
  /** Seconds it takes the torch to swing back home once dropped. */
  returnSeconds: 0.9,
  /** Grab radius around the torch in px. */
  grabRadius: 95,
  /** Flicker is scaled by this when "reduce motion" is on. */
  reducedMotionScale: 0.25,
};

export const LIGHT = {
  ambient: [0.05, 0.043, 0.04] as const,
  torchColor: [1.0, 0.64, 0.33] as const,
  exposure: 1.35,
  bump: 0.78,
};

// ---------------------------------------------------------------- audio

export const AUDIO = {
  sfx: 0.8,
  music: 0.16,
  voice: 1.0,
};

export const UNDO_LIMIT = 400;
export const AUTOSAVE_MS = 1200;
