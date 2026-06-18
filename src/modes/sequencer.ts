/**
 * Sequencer mode — Doepfer A-155 / Buchla 185 / TB-303 style.
 *
 * A fixed 16-step techno bass pattern runs continuously the moment the mode
 * starts. The synth is a TB-303-ish mono saw with envelope-modulated filter,
 * routed through a drive stage, a feedback delay, and a hall reverb. The
 * hands do not pick steps or notes — they sculpt the SYNTH:
 *
 *   Right hand X    → filter cutoff (the "squelch")     [exp 100..6000 Hz]
 *   Right hand Y    → filter resonance                   [0.5..14]
 *   Right pinch     → drive (overdrive distortion)       [0..0.85]
 *   Right fist      → cycle to next preset pattern (debounced)
 *
 *   Left hand X     → tempo                              [90..160 bpm]
 *   Left hand Y     → delay feedback                     [0..0.7]
 *   Left pinch      → reverb wet                         [0..0.6]
 *   Left fist       → mute (sequencer keeps running silently)
 *
 * Step data: { note: midi number | null, gate: 0..1, accent: bool, slide: bool }
 * Slide ramps the next step's pitch from the current one (acid line glide).
 * Accent boosts that step's velocity and briefly bumps filter envelope mod.
 */

import * as Tone from 'tone';
import type { HandState } from '../state/gestureStore';
import type { ModeEngine, ModeDescriptor, ModeOverlayProps } from './types';
import { clamp, expMap, linMap } from '../utils/mapping';
import { sendCc, sendNoteOn, sendNoteOff } from '../midi/out';
import { getModeMidiChannels, CC } from '../midi/mapping';

export const STEPS = 16;

export interface PatternStep {
  /** MIDI note number, or null for a rest. */
  note: number | null;
  /** Gate length 0..1 of the step duration. 0 = silent. */
  gate: number;
  accent: boolean;
  slide: boolean;
}

/** Three classic-shaped acid bass patterns in A minor, A1 = 33. */
function n(midi: number): number {
  return midi;
}

const PATTERNS: ReadonlyArray<{ name: string; steps: readonly PatternStep[] }> = [
  {
    name: 'Drift',
    steps: [
      // Driving 1/16 line: A1, rest, A1, A2, A1, A1+slide, C2, A1
      // Repeat octaves with accents on 1, 5, 9, 13.
      { note: n(33), gate: 0.55, accent: true, slide: false },
      { note: null,  gate: 0,     accent: false, slide: false },
      { note: n(33), gate: 0.5,  accent: false, slide: false },
      { note: n(45), gate: 0.5,  accent: false, slide: true  },
      { note: n(33), gate: 0.55, accent: true,  slide: false },
      { note: n(33), gate: 0.5,  accent: false, slide: true  },
      { note: n(36), gate: 0.5,  accent: false, slide: false },
      { note: n(33), gate: 0.5,  accent: false, slide: false },
      { note: n(33), gate: 0.55, accent: true,  slide: false },
      { note: null,  gate: 0,     accent: false, slide: false },
      { note: n(40), gate: 0.5,  accent: false, slide: false },
      { note: n(33), gate: 0.5,  accent: false, slide: true  },
      { note: n(33), gate: 0.55, accent: true,  slide: false },
      { note: n(45), gate: 0.5,  accent: false, slide: false },
      { note: n(36), gate: 0.5,  accent: false, slide: false },
      { note: n(40), gate: 0.5,  accent: false, slide: true  },
    ],
  },
  {
    name: 'Pulse',
    steps: [
      // 4-on-the-floor feel: every 4th step accented, octave hops between.
      { note: n(33), gate: 0.6, accent: true,  slide: false },
      { note: n(33), gate: 0.4, accent: false, slide: false },
      { note: n(45), gate: 0.4, accent: false, slide: true  },
      { note: n(40), gate: 0.4, accent: false, slide: false },
      { note: n(33), gate: 0.6, accent: true,  slide: false },
      { note: n(36), gate: 0.4, accent: false, slide: false },
      { note: n(33), gate: 0.4, accent: false, slide: true  },
      { note: n(45), gate: 0.4, accent: false, slide: false },
      { note: n(33), gate: 0.6, accent: true,  slide: false },
      { note: n(33), gate: 0.4, accent: false, slide: false },
      { note: n(40), gate: 0.4, accent: false, slide: true  },
      { note: n(43), gate: 0.4, accent: false, slide: false },
      { note: n(33), gate: 0.6, accent: true,  slide: false },
      { note: n(45), gate: 0.4, accent: false, slide: false },
      { note: n(43), gate: 0.4, accent: false, slide: true  },
      { note: n(36), gate: 0.4, accent: false, slide: false },
    ],
  },
  {
    name: 'Acid',
    steps: [
      // Classic acid line — lots of slides + accents.
      { note: n(33), gate: 0.5, accent: true,  slide: false },
      { note: n(33), gate: 0.5, accent: false, slide: true  },
      { note: n(45), gate: 0.5, accent: false, slide: true  },
      { note: n(33), gate: 0.5, accent: false, slide: false },
      { note: null,  gate: 0,    accent: false, slide: false },
      { note: n(36), gate: 0.5, accent: true,  slide: true  },
      { note: n(40), gate: 0.5, accent: false, slide: false },
      { note: n(33), gate: 0.5, accent: false, slide: true  },
      { note: n(45), gate: 0.5, accent: true,  slide: false },
      { note: n(45), gate: 0.5, accent: false, slide: true  },
      { note: n(43), gate: 0.5, accent: false, slide: false },
      { note: null,  gate: 0,    accent: false, slide: false },
      { note: n(33), gate: 0.5, accent: true,  slide: true  },
      { note: n(33), gate: 0.5, accent: false, slide: false },
      { note: n(40), gate: 0.5, accent: false, slide: true  },
      { note: n(36), gate: 0.5, accent: false, slide: false },
    ],
  },
];

const FIST_COOLDOWN_MS = 500;

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

class SequencerEngine implements ModeEngine {
  private synth: Tone.MonoSynth | null = null;
  private drive: Tone.Distortion | null = null;
  private filter: Tone.Filter | null = null;
  private delay: Tone.FeedbackDelay | null = null;
  private reverb: Tone.Reverb | null = null;
  private volume: Tone.Volume | null = null;
  private sequence: Tone.Sequence<number> | null = null;

  private patternIdx = 0;
  /** View state for the overlay. */
  private playheadStep = 0;
  private lastTriggerAt: number[] = Array(STEPS).fill(0);
  private lastFistAt = 0;
  private muted = false;
  private started = false;

  /** Live sculpting params (filtered by ramps in update). */
  private cutoffHz = 1200;
  private resonance = 4;

  async start(): Promise<void> {
    if (this.started) return;
    await Tone.start();

    // The TB-303 essence: saw oscillator into a resonant LP filter whose
    // envelope is short and snappy. Accent steps briefly increase env amount.
    this.synth = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.001, decay: 0.18, sustain: 0.4, release: 0.08 },
      filter: { Q: 4, type: 'lowpass', rolloff: -24 },
      filterEnvelope: {
        attack: 0.005,
        decay: 0.12,
        sustain: 0.05,
        release: 0.1,
        baseFrequency: 200,
        octaves: 4,
      },
      portamento: 0,
      volume: -6,
    });

    this.drive = new Tone.Distortion({ distortion: 0.15, wet: 0.4 });
    this.filter = new Tone.Filter({ frequency: 1200, Q: 4, type: 'lowpass' });
    this.delay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.25, wet: 0.25 });
    this.reverb = new Tone.Reverb({ decay: 4, wet: 0.18 });
    this.volume = new Tone.Volume(-4);

    this.synth.chain(this.drive, this.filter, this.delay, this.reverb, this.volume, Tone.getDestination());

    Tone.getTransport().bpm.value = 124;
    this.sequence = new Tone.Sequence<number>(
      (time, stepIdx) => {
        this.playheadStep = stepIdx;
        const pat = PATTERNS[this.patternIdx].steps;
        const step = pat[stepIdx];
        if (!step || step.note === null || step.gate <= 0) return;

        const freq = midiToFreq(step.note);
        const dur = step.gate * Tone.Time('16n').toSeconds();
        const vel = step.accent ? 1 : 0.7;
        // Accent bumps filter envelope amount briefly.
        if (step.accent && this.synth) {
          this.synth.filterEnvelope.octaves = 5;
        } else if (this.synth) {
          this.synth.filterEnvelope.octaves = 3.5;
        }
        // Slide = no retrigger envelope, just glide pitch over to the next note.
        if (step.slide && this.synth) {
          this.synth.portamento = Tone.Time('16n').toSeconds() * 0.6;
        } else if (this.synth) {
          this.synth.portamento = 0;
        }
        this.synth?.triggerAttackRelease(freq, dur, time, vel);
        this.lastTriggerAt[stepIdx] = performance.now();

        // MIDI: send the same note on the sequencer channel.
        const ch = getModeMidiChannels().sequencer;
        if (ch !== null) {
          const midiVel = step.accent ? 110 : 88;
          sendNoteOn(ch, step.note, midiVel, time);
          sendNoteOff(ch, step.note, time + dur);
        }
      },
      Array.from({ length: STEPS }, (_, i) => i),
      '16n',
    ).start(0);

    Tone.getTransport().start();
    this.started = true;
  }

  update(left: HandState | null, right: HandState | null): void {
    if (!this.started || !this.synth || !this.filter || !this.drive || !this.delay || !this.reverb || !this.volume) return;
    const now = Tone.now();
    const realNow = performance.now();

    // ---- right hand: filter / resonance / drive / pattern cycle ----
    if (right) {
      // X mirrored already; flipping back so "left side of frame = low cutoff"
      // matches what the user sees.
      const x = 1 - right.centroid.x;
      const y = right.centroid.y;
      this.cutoffHz = expMap(x, 0, 1, 100, 6000);
      this.resonance = linMap(1 - y, 0, 1, 0.5, 14);
      this.filter.frequency.rampTo(this.cutoffHz, 0.04, now);
      this.filter.Q.rampTo(this.resonance, 0.05, now);
      this.drive.distortion = clamp(linMap(right.pinch, 0, 1, 0, 0.85), 0, 0.85);
      this.drive.wet.rampTo(linMap(right.pinch, 0, 1, 0.2, 0.85), 0.1, now);

      // MIDI CCs.
      const ch = getModeMidiChannels().sequencer;
      if (ch !== null) {
        sendCc(ch, CC.cutoff, linMap(x, 0, 1, 0, 127));
        sendCc(ch, CC.resonance, linMap(1 - y, 0, 1, 0, 127));
        sendCc(ch, CC.drive, linMap(right.pinch, 0, 1, 0, 127));
      }

      if (right.fist && realNow - this.lastFistAt > FIST_COOLDOWN_MS) {
        this.patternIdx = (this.patternIdx + 1) % PATTERNS.length;
        this.lastFistAt = realNow;
      }
    }

    // ---- left hand: tempo / delay / reverb / mute ----
    if (left) {
      const x = 1 - left.centroid.x;
      const bpm = linMap(x, 0, 1, 90, 160);
      Tone.getTransport().bpm.rampTo(bpm, 0.2, now);
      this.delay.feedback.rampTo(linMap(1 - left.centroid.y, 0, 1, 0, 0.7), 0.1, now);
      this.reverb.wet.rampTo(linMap(left.pinch, 0, 1, 0, 0.6), 0.2, now);

      const ch = getModeMidiChannels().sequencer;
      if (ch !== null) {
        sendCc(ch, CC.delayMix, linMap(1 - left.centroid.y, 0, 1, 0, 127));
        sendCc(ch, CC.reverbMix, linMap(left.pinch, 0, 1, 0, 127));
      }

      const wantMute = left.fist;
      if (wantMute !== this.muted) {
        this.muted = wantMute;
        this.volume.volume.rampTo(this.muted ? -60 : -4, 0.15, now);
      }
    }
  }

  dispose(): void {
    if (!this.started) return;
    this.sequence?.stop().dispose();
    Tone.getTransport().stop();
    this.synth?.triggerRelease();
    this.synth?.dispose();
    this.drive?.dispose();
    this.filter?.dispose();
    this.delay?.dispose();
    this.reverb?.dispose();
    this.volume?.dispose();
    this.synth = this.drive = this.filter = this.delay = this.reverb = this.volume = null;
    this.sequence = null;
    this.started = false;
  }

  getViewState(): SequencerView {
    return {
      pattern: PATTERNS[this.patternIdx],
      patternCount: PATTERNS.length,
      patternIdx: this.patternIdx,
      playheadStep: this.playheadStep,
      lastTriggerAt: [...this.lastTriggerAt],
      cutoffHz: this.cutoffHz,
      resonance: this.resonance,
      muted: this.muted,
    };
  }
}

export interface SequencerView {
  pattern: { name: string; steps: readonly PatternStep[] };
  patternCount: number;
  patternIdx: number;
  playheadStep: number;
  lastTriggerAt: number[];
  cutoffHz: number;
  resonance: number;
  muted: boolean;
}

let activeEngine: SequencerEngine | null = null;

function createEngine(): ModeEngine {
  const e = new SequencerEngine();
  const origStart = e.start.bind(e);
  const origDispose = e.dispose.bind(e);
  e.start = async () => {
    await origStart();
    activeEngine = e;
  };
  e.dispose = () => {
    if (activeEngine === e) activeEngine = null;
    origDispose();
  };
  return e;
}

function drawOverlay({ ctx, width, height }: ModeOverlayProps): void {
  const view = activeEngine?.getViewState();
  if (!view) return;

  ctx.save();

  // ---- Step strip across the bottom ----
  const stripPad = width * 0.04;
  const stripY = height - 110;
  const stripW = width - stripPad * 2;
  const cellW = stripW / STEPS;
  const cellH = 44;

  // Background bar.
  ctx.fillStyle = 'rgba(15, 18, 26, 0.7)';
  ctx.fillRect(stripPad - 8, stripY - 8, stripW + 16, cellH + 16);

  const now = performance.now();
  for (let i = 0; i < STEPS; i++) {
    const step = view.pattern.steps[i];
    const x = stripPad + i * cellW;
    const isPlayhead = i === view.playheadStep;
    const sinceTrigger = now - view.lastTriggerAt[i];
    const triggerPulse = clamp(1 - sinceTrigger / 250, 0, 1);

    // Cell background.
    ctx.fillStyle = isPlayhead
      ? 'rgba(255, 122, 217, 0.22)'
      : 'rgba(108, 240, 196, 0.07)';
    ctx.fillRect(x + 2, stripY, cellW - 4, cellH);

    // Note bar (height encodes pitch within the pattern's range).
    if (step.note !== null && step.gate > 0) {
      const allNotes = view.pattern.steps
        .map((s) => s.note)
        .filter((n): n is number => n !== null);
      const minN = Math.min(...allNotes);
      const maxN = Math.max(...allNotes);
      const t = maxN === minN ? 0.5 : (step.note - minN) / (maxN - minN);
      const barH = 8 + t * (cellH - 14);
      const baseAlpha = step.accent ? 0.95 : 0.65;
      const alpha = clamp(baseAlpha + triggerPulse * 0.4, 0, 1);
      ctx.fillStyle = step.accent
        ? `rgba(255, 122, 217, ${alpha})`
        : `rgba(108, 240, 196, ${alpha})`;
      ctx.fillRect(x + 4, stripY + (cellH - barH) - 2, cellW - 8, barH);

      // Slide tick.
      if (step.slide) {
        ctx.strokeStyle = 'rgba(255, 240, 180, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 4, stripY + cellH - 2);
        ctx.lineTo(x + cellW - 4, stripY + cellH - 2);
        ctx.stroke();
      }
    }

    // Cell outline.
    ctx.strokeStyle = isPlayhead
      ? 'rgba(255, 255, 255, 0.95)'
      : 'rgba(232, 236, 242, 0.18)';
    ctx.lineWidth = isPlayhead ? 2 : 1;
    ctx.strokeRect(x + 2, stripY, cellW - 4, cellH);
  }

  // Pattern label above the strip.
  ctx.fillStyle = 'rgba(232, 236, 242, 0.85)';
  ctx.font = '600 13px ui-sans-serif, system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `Pattern ${view.patternIdx + 1}/${view.patternCount} · ${view.pattern.name}` +
      (view.muted ? '  (muted)' : ''),
    stripPad,
    stripY - 14,
  );

  // ---- Filter / resonance meter (top-left corner) ----
  const meterX = 24;
  const meterY = 80;
  const meterW = 200;
  const meterH = 48;
  ctx.fillStyle = 'rgba(15, 18, 26, 0.7)';
  ctx.fillRect(meterX, meterY, meterW, meterH);
  ctx.strokeStyle = 'rgba(232, 236, 242, 0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(meterX, meterY, meterW, meterH);

  ctx.fillStyle = 'rgba(232, 236, 242, 0.65)';
  ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.fillText(`CUTOFF  ${Math.round(view.cutoffHz)} Hz`, meterX + 10, meterY + 18);
  ctx.fillText(`RES     ${view.resonance.toFixed(1)}`, meterX + 10, meterY + 36);

  // Cutoff bar.
  const cutoffT = Math.log(view.cutoffHz / 100) / Math.log(6000 / 100);
  ctx.fillStyle = 'rgba(108, 240, 196, 0.85)';
  ctx.fillRect(meterX + 110, meterY + 10, clamp(cutoffT, 0, 1) * 80, 4);
  // Resonance bar.
  const resT = (view.resonance - 0.5) / (14 - 0.5);
  ctx.fillStyle = 'rgba(255, 122, 217, 0.85)';
  ctx.fillRect(meterX + 110, meterY + 28, clamp(resT, 0, 1) * 80, 4);

  ctx.restore();
}

export const sequencerMode: ModeDescriptor = {
  id: 'sequencer',
  name: 'Sequencer',
  hint: 'Right hand: X = cutoff, Y = resonance, pinch = drive, fist = next pattern. Left hand: X = tempo, Y = delay, pinch = reverb, fist = mute.',
  createEngine,
  drawOverlay,
  handColors: { left: '#7df9ff', right: '#ffb86c' },
};

export const _internal = { PATTERNS, midiToFreq };
