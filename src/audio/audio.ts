// All sound goes through one AudioContext with separate buses for effects, music and voice.
// Every sound is synthesised (fire, breath, scraping, water drips): no audio files.

import { AUDIO, type ToolId } from '../units';

interface NavigatorWithAudioSession extends Navigator {
  audioSession?: { type: string };
}

const TOOL_SOUND: Record<ToolId, { type: BiquadFilterType; freq: number; q: number; gain: number }> = {
  finger: { type: 'lowpass', freq: 520, q: 0.7, gain: 0.5 },
  lump: { type: 'bandpass', freq: 3400, q: 0.9, gain: 0.55 },
  brush: { type: 'bandpass', freq: 1500, q: 0.6, gain: 0.35 },
  twig: { type: 'bandpass', freq: 2600, q: 1.4, gain: 0.4 },
};

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly sfx: GainNode;
  readonly music: GainNode;
  readonly voice: GainNode;
  private readonly reverb: ConvolverNode;
  private noise!: AudioBuffer;
  private unlocked = false;
  private started = false;

  private fireGain!: GainNode;
  private roarGain!: GainNode;
  private strokeGain!: GainNode;
  private strokeFilter!: BiquadFilterNode;
  private strokeTool: ToolId = 'finger';
  private blowGain!: GainNode;
  private blowFilter!: BiquadFilterNode;
  private crackleTimer = 0;
  private dripTimer = 0;

  constructor() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    const nav = navigator as NavigatorWithAudioSession;
    if (nav.audioSession) {
      try {
        nav.audioSession.type = 'playback'; // play even with the iPad's silent switch on
      } catch {
        /* not supported */
      }
    }
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfx = this.bus(AUDIO.sfx);
    this.music = this.bus(AUDIO.music);
    this.voice = this.bus(AUDIO.voice);
    // The cave itself: a long, dark reverb shared by everything.
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.6);
    const wet = this.ctx.createGain();
    wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(this.master);
    this.sfx.connect(this.reverb);
    this.music.connect(this.reverb);
  }

  private bus(volume: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = volume;
    g.connect(this.master);
    return g;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  setVolumes(sfx: number, music: number): void {
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(AUDIO.sfx * sfx, t, 0.05);
    this.music.gain.setTargetAtTime(AUDIO.music * music * 2, t, 0.05);
  }

  /** Call from touchend/click: iOS only unlocks audio from those events. */
  unlock(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.unlocked) return;
    this.unlocked = true;
    // One silent buffer for older iOS.
    const b = this.ctx.createBuffer(1, 1, 22050);
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.connect(this.ctx.destination);
    s.start(0);
    this.start();
  }

  suspend(): void {
    void this.ctx.suspend();
    if ('speechSynthesis' in window) speechSynthesis.pause();
  }

  resume(): void {
    if (this.unlocked) void this.ctx.resume();
    if ('speechSynthesis' in window) speechSynthesis.resume();
  }

  // ------------------------------------------------------------ continuous layers

  private loopNoise(): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start(0, Math.random() * 2);
    return s;
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    // Slightly brown noise: warmer than white.
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.6 + (Math.random() * 2 - 1) * 0.4;
      d[i] = last * 1.6;
    }

    // Fire: low roar + random crackles.
    const roarF = ctx.createBiquadFilter();
    roarF.type = 'lowpass';
    roarF.frequency.value = 380;
    this.roarGain = ctx.createGain();
    this.roarGain.gain.value = 0.25;
    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 1;
    this.loopNoise().connect(roarF).connect(this.roarGain).connect(this.fireGain).connect(this.sfx);

    // Tool on rock.
    this.strokeFilter = ctx.createBiquadFilter();
    this.strokeGain = ctx.createGain();
    this.strokeGain.gain.value = 0;
    this.loopNoise().connect(this.strokeFilter).connect(this.strokeGain).connect(this.sfx);

    // Breath through the blowpipe.
    this.blowFilter = ctx.createBiquadFilter();
    this.blowFilter.type = 'bandpass';
    this.blowFilter.frequency.value = 900;
    this.blowFilter.Q.value = 0.6;
    this.blowGain = ctx.createGain();
    this.blowGain.gain.value = 0;
    this.loopNoise().connect(this.blowFilter).connect(this.blowGain).connect(this.sfx);

    // Ambience on the music bus: a low cave drone.
    for (const [f, g] of [
      [55, 0.22],
      [82.6, 0.1],
      [110.4, 0.05],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + Math.random() * 0.08;
      const lfoG = ctx.createGain();
      lfoG.gain.value = g * 0.6;
      const og = ctx.createGain();
      og.gain.value = g;
      lfo.connect(lfoG).connect(og.gain);
      o.connect(og).connect(this.music);
      o.start();
      lfo.start();
    }
    const windF = ctx.createBiquadFilter();
    windF.type = 'bandpass';
    windF.frequency.value = 240;
    windF.Q.value = 2;
    const windG = ctx.createGain();
    windG.gain.value = 0.25;
    this.loopNoise().connect(windF).connect(windG).connect(this.music);

    this.scheduleCrackle();
    this.scheduleDrip();
  }

  private scheduleCrackle(): void {
    window.clearTimeout(this.crackleTimer);
    this.crackleTimer = window.setTimeout(() => {
      if (this.ctx.state === 'running') this.crackle();
      this.scheduleCrackle();
    }, 60 + Math.random() * 420);
  }

  private crackle(): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1500 + Math.random() * 3500;
      const g = ctx.createGain();
      const at = t + i * (0.01 + Math.random() * 0.04);
      const amp = 0.15 + Math.random() * 0.45;
      g.gain.setValueAtTime(amp, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.015 + Math.random() * 0.04);
      s.connect(f).connect(g).connect(this.fireGain);
      s.start(at, Math.random() * 2, 0.08);
    }
  }

  private scheduleDrip(): void {
    window.clearTimeout(this.dripTimer);
    this.dripTimer = window.setTimeout(() => {
      if (this.ctx.state === 'running') this.drip();
      this.scheduleDrip();
    }, 2500 + Math.random() * 7000);
  }

  /** A water drop falling in a pool somewhere in the dark. */
  private drip(): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f0 = 900 + Math.random() * 900;
    o.frequency.setValueAtTime(f0 * 0.6, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.6, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    o.connect(g).connect(pan).connect(this.music);
    o.start(t);
    o.stop(t + 0.15);
  }

  // ------------------------------------------------------------ game hooks

  fireLevel(intensity: number): void {
    if (!this.started) return;
    this.roarGain.gain.setTargetAtTime(0.18 + 0.25 * (intensity - 0.8), this.ctx.currentTime, 0.08);
  }

  torchSpeed(pxPerMs: number): void {
    if (!this.started) return;
    this.fireGain.gain.setTargetAtTime(1 + Math.min(2.5, pxPerMs * 1.2), this.ctx.currentTime, 0.05);
  }

  torchGrab(): void {
    this.knock(140, 0.3);
  }
  torchDrop(): void {
    this.knock(90, 0.18);
  }

  strokeStart(tool: ToolId): void {
    if (!this.started) return;
    this.strokeTool = tool;
    const s = TOOL_SOUND[tool];
    this.strokeFilter.type = s.type;
    this.strokeFilter.frequency.value = s.freq;
    this.strokeFilter.Q.value = s.q;
  }

  strokeSpeed(pxPerMs: number): void {
    if (!this.started) return;
    const s = TOOL_SOUND[this.strokeTool];
    const g = Math.min(1, pxPerMs / 1.6) * s.gain;
    this.strokeGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.03);
  }

  strokeEnd(): void {
    if (!this.started) return;
    this.strokeGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  blowStart(): void {
    if (!this.started) return;
    this.blowGain.gain.setTargetAtTime(0.25, this.ctx.currentTime, 0.08);
  }

  blowStrength(seconds: number): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    // A long breath gets rougher, then runs out.
    const g = seconds > 11 ? 0.05 : 0.35 + Math.min(0.25, seconds * 0.04);
    this.blowGain.gain.setTargetAtTime(g, t, 0.1);
    this.blowFilter.frequency.setTargetAtTime(800 + Math.sin(seconds * 3) * 120, t, 0.1);
  }

  blowEnd(): void {
    if (!this.started) return;
    this.blowGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
  }

  /** Stone-on-stone tap used for UI buttons. */
  click(): void {
    this.knock(320, 0.22);
  }

  private knock(freq: number, amp: number): void {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.15);
  }
}
