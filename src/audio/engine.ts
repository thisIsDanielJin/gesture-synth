/**
 * Tone.js audio engine. A simple monophonic detuned saw → filter → delay →
 * reverb chain. All param setters ramp to avoid zipper noise.
 *
 * The engine is deliberately framework-agnostic: it knows nothing about React
 * or Zustand — App wires a store subscription to `applyParams()`.
 */

import * as Tone from 'tone';
import type { AudioParams } from './mappings';

const RAMP_SEC = 0.05;

export class AudioEngine {
  private osc: Tone.FatOscillator | null = null;
  private filter: Tone.Filter | null = null;
  private delay: Tone.FeedbackDelay | null = null;
  private reverb: Tone.Reverb | null = null;
  private volume: Tone.Volume | null = null;
  private started = false;

  /** Must be called from a user gesture (click / keypress). */
  async start(): Promise<void> {
    if (this.started) return;
    await Tone.start();

    this.osc = new Tone.FatOscillator({
      type: 'sawtooth',
      frequency: 'A2',
      spread: 30,
      count: 3,
      volume: -8,
    });
    this.filter = new Tone.Filter({ frequency: 800, type: 'lowpass', Q: 1, rolloff: -24 });
    this.delay = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.3, wet: 0.4 });
    this.reverb = new Tone.Reverb({ decay: 3, wet: 0.2 });
    this.volume = new Tone.Volume(-12);

    this.osc.chain(this.filter, this.delay, this.reverb, this.volume, Tone.getDestination());
    this.osc.start();
    this.started = true;
  }

  stop(): void {
    if (!this.started) return;
    this.osc?.stop();
    this.osc?.dispose();
    this.filter?.dispose();
    this.delay?.dispose();
    this.reverb?.dispose();
    this.volume?.dispose();
    this.osc = this.filter = this.delay = this.reverb = this.volume = null;
    this.started = false;
  }

  isStarted(): boolean {
    return this.started;
  }

  applyParams(p: AudioParams): void {
    if (!this.started) return;
    const now = Tone.now();
    this.filter!.frequency.rampTo(p.cutoffHz, RAMP_SEC, now);
    this.filter!.Q.rampTo(p.resonance, RAMP_SEC, now);
    this.delay!.delayTime.rampTo(p.delayTimeSec, RAMP_SEC, now);
    this.delay!.feedback.rampTo(p.delayFeedback, RAMP_SEC, now);
    this.reverb!.wet.rampTo(p.reverbWet, RAMP_SEC, now);
    // Mute overrides volume mapping.
    const targetDb = p.muted ? -60 : p.volumeDb;
    this.volume!.volume.rampTo(targetDb, RAMP_SEC, now);
  }
}
