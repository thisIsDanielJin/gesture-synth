/**
 * 808/909-style drum voices, all synthesized — no samples.
 *
 * Each voice exposes a `.trigger(time, vel?)` method matched to Tone's
 * scheduling so a sequencer can call them inside a Sequence callback. Voices
 * share a single output bus that you chain into your effects + master.
 */

import * as Tone from 'tone';

export interface DrumVoice {
  trigger(time: number, velocity?: number): void;
  dispose(): void;
  /** Lets the parent connect this voice to a destination node. */
  output: Tone.ToneAudioNode;
}

export class Kick implements DrumVoice {
  private osc = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 6,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 0.4 },
  });
  /** Hz — base frequency for the punch. */
  pitch = 50;

  get output(): Tone.ToneAudioNode { return this.osc; }
  trigger(time: number, velocity = 1): void {
    this.osc.triggerAttackRelease(this.pitch, '8n', time, velocity);
  }
  dispose(): void { this.osc.dispose(); }
}

export class Snare implements DrumVoice {
  private noise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.13, sustain: 0 },
    volume: -8,
  });
  private body = new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 2,
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.07, sustain: 0 },
    volume: -6,
  });
  private bus = new Tone.Gain(1);
  /** 0..1 — how much body vs noise (1 = mostly tonal body). */
  snap = 0.5;

  constructor() {
    this.noise.connect(this.bus);
    this.body.connect(this.bus);
  }
  get output(): Tone.ToneAudioNode { return this.bus; }
  trigger(time: number, velocity = 1): void {
    this.noise.volume.setValueAtTime(-8 + this.snap * 4, time);
    this.body.volume.setValueAtTime(-12 + (1 - this.snap) * 8, time);
    this.noise.triggerAttackRelease('8n', time, velocity);
    this.body.triggerAttackRelease(220 - this.snap * 60, '32n', time, velocity);
  }
  dispose(): void {
    this.noise.dispose();
    this.body.dispose();
    this.bus.dispose();
  }
}

export class Clap implements DrumVoice {
  private noise = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.005, decay: 0.18, sustain: 0 },
    volume: -10,
  });
  private filter = new Tone.Filter({ frequency: 1200, type: 'bandpass', Q: 1.2 });
  private bus = new Tone.Gain(1);

  constructor() {
    this.noise.connect(this.filter);
    this.filter.connect(this.bus);
  }
  get output(): Tone.ToneAudioNode { return this.bus; }
  trigger(time: number, velocity = 1): void {
    // Three quick bursts for the classic clap stutter.
    const dt = 0.012;
    this.noise.triggerAttackRelease('16n', time, velocity * 0.7);
    this.noise.triggerAttackRelease('16n', time + dt, velocity * 0.85);
    this.noise.triggerAttackRelease('16n', time + dt * 2, velocity);
  }
  dispose(): void {
    this.noise.dispose();
    this.filter.dispose();
    this.bus.dispose();
  }
}

export class Hat implements DrumVoice {
  private noise: Tone.NoiseSynth;
  private filter = new Tone.Filter({ frequency: 8000, type: 'highpass', Q: 0.7 });
  private bus = new Tone.Gain(1);
  private decay: number;
  /** Brightness 0..1 — sweeps the high-pass cutoff. */
  brightness = 0.6;

  constructor(opts: { open: boolean }) {
    this.decay = opts.open ? 0.32 : 0.045;
    this.noise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: this.decay, sustain: 0 },
      volume: opts.open ? -12 : -14,
    });
    this.noise.connect(this.filter);
    this.filter.connect(this.bus);
  }
  get output(): Tone.ToneAudioNode { return this.bus; }
  trigger(time: number, velocity = 1): void {
    this.filter.frequency.setValueAtTime(4000 + this.brightness * 8000, time);
    this.noise.triggerAttackRelease(this.decay, time, velocity);
  }
  dispose(): void {
    this.noise.dispose();
    this.filter.dispose();
    this.bus.dispose();
  }
}

export class Tom implements DrumVoice {
  private osc = new Tone.MembraneSynth({
    pitchDecay: 0.08,
    octaves: 3,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 },
    volume: -8,
  });
  pitch = 110;

  get output(): Tone.ToneAudioNode { return this.osc; }
  trigger(time: number, velocity = 1): void {
    this.osc.triggerAttackRelease(this.pitch, '16n', time, velocity);
  }
  dispose(): void { this.osc.dispose(); }
}

export interface DrumKit {
  kick: Kick;
  snare: Snare;
  clap: Clap;
  closedHat: Hat;
  openHat: Hat;
  tom: Tom;
  bus: Tone.Gain;
  dispose(): void;
}

/** Build a kit and route every voice through a shared bus. */
export function createKit(): DrumKit {
  const bus = new Tone.Gain(1);
  const voices = {
    kick: new Kick(),
    snare: new Snare(),
    clap: new Clap(),
    closedHat: new Hat({ open: false }),
    openHat: new Hat({ open: true }),
    tom: new Tom(),
  };
  for (const v of Object.values(voices)) v.output.connect(bus);
  return {
    ...voices,
    bus,
    dispose(): void {
      for (const v of Object.values(voices)) v.dispose();
      bus.dispose();
    },
  };
}

export type DrumVoiceId = 'kick' | 'snare' | 'clap' | 'closedHat' | 'openHat' | 'tom';
