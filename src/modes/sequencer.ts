/**
 * Sequencer mode.
 *
 * A circular 8-step loop runs as soon as the mode starts. The right hand is
 * a cursor: its angle around screen center → which of the 8 steps you're
 * hovering, its distance from center → which scale degree that step plays
 * (5 degrees of A minor pentatonic, two-octave range). Pinching the right
 * hand past 0.7 toggles the hovered step (with debounce so a sustained
 * pinch doesn't flip it 60 times). Closing the right hand into a fist
 * clears every step.
 *
 * Left hand controls macro params:
 *   X → tempo (60..160 bpm)
 *   pinch → low-pass filter cutoff (300..6000 Hz)
 *   fist → mute the loop (sequencer keeps running, just goes silent)
 *
 * Visual: ring of 8 cells around screen center, active cells glow, the
 * current playhead step pulses, hovered cell highlights, ripples emit on
 * each trigger, a tempo arc grows around the ring.
 */

import * as Tone from 'tone';
import type { HandState } from '../state/gestureStore';
import type { ModeEngine, ModeDescriptor, ModeOverlayProps } from './types';
import { clamp, linMap } from '../utils/mapping';

export const STEPS = 8;
const PITCHES_HZ: readonly number[] = [
  // A minor pentatonic, A2..A4 — 5 degrees × 2 octaves = 10 entries.
  // Cursor distance picks among them by ring (inner = low, outer = high).
  midi(45), midi(48), midi(50), midi(52), midi(55),
  midi(57), midi(60), midi(62), midi(64), midi(67),
];

function midi(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export interface SequencerStep {
  on: boolean;
  pitchIndex: number; // index into PITCHES_HZ
}

export const PINCH_TOGGLE_THRESHOLD = 0.7;
const TOGGLE_COOLDOWN_MS = 350;

/** Pure helper: where on the ring is the right hand pointing? */
export function angleToStep(
  centroid: { x: number; y: number },
  cx = 0.5,
  cy = 0.5,
  steps = STEPS,
): number {
  const dx = centroid.x - cx;
  const dy = centroid.y - cy;
  // -PI..PI, with 0 = pointing right. Rotate by +PI/2 so step 0 is at the top.
  let a = Math.atan2(dy, dx) + Math.PI / 2;
  if (a < 0) a += Math.PI * 2;
  if (a >= Math.PI * 2) a -= Math.PI * 2;
  // Quantize to [0..steps).
  const idx = Math.floor((a / (Math.PI * 2)) * steps);
  return clamp(idx, 0, steps - 1);
}

/** Distance from center → pitch index. r in [0..1]. */
export function radiusToPitchIndex(
  centroid: { x: number; y: number },
  cx = 0.5,
  cy = 0.5,
): number {
  const r = Math.hypot(centroid.x - cx, centroid.y - cy);
  // Useful range: 0.10 (close to center) → 0.45 (near edge).
  const t = clamp((r - 0.1) / (0.45 - 0.1), 0, 1);
  return clamp(Math.floor(t * PITCHES_HZ.length), 0, PITCHES_HZ.length - 1);
}

class SequencerEngine implements ModeEngine {
  private synth: Tone.PolySynth | null = null;
  private filter: Tone.Filter | null = null;
  private delay: Tone.FeedbackDelay | null = null;
  private reverb: Tone.Reverb | null = null;
  private volume: Tone.Volume | null = null;
  private sequence: Tone.Sequence<number> | null = null;

  private steps: SequencerStep[] = Array.from({ length: STEPS }, () => ({
    on: false,
    pitchIndex: 5,
  }));

  /** Updated by update(); read by overlay via getViewState(). */
  private playheadStep = 0;
  /** Set when a step fires so the overlay can ripple. */
  private lastTriggerAt: number[] = Array(STEPS).fill(0);
  private hoveredStep: number | null = null;
  private toggleArmedAt = 0;
  private muted = false;
  private started = false;

  async start(): Promise<void> {
    if (this.started) return;
    await Tone.start();

    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.18, sustain: 0.2, release: 0.4 },
      volume: -10,
    });
    this.filter = new Tone.Filter({ frequency: 2400, Q: 1.2, type: 'lowpass' });
    this.delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.32, wet: 0.35 });
    this.reverb = new Tone.Reverb({ decay: 3.5, wet: 0.28 });
    this.volume = new Tone.Volume(-4);
    this.synth.chain(this.filter, this.delay, this.reverb, this.volume, Tone.getDestination());

    Tone.getTransport().bpm.value = 110;
    this.sequence = new Tone.Sequence<number>(
      (time, stepIdx) => {
        this.playheadStep = stepIdx;
        const step = this.steps[stepIdx];
        if (!step.on) return;
        const freq = PITCHES_HZ[step.pitchIndex];
        this.synth?.triggerAttackRelease(freq, '16n', time, 0.85);
        // Tone's draw callback is the safe place to update view state from
        // an audio-thread tick — but we're already updating in the main
        // tick path; the overlay just reads the latest.
        this.lastTriggerAt[stepIdx] = performance.now();
      },
      Array.from({ length: STEPS }, (_, i) => i),
      '16n',
    ).start(0);

    Tone.getTransport().start();
    this.started = true;
  }

  update(left: HandState | null, right: HandState | null): void {
    if (!this.started || !this.synth || !this.filter || !this.volume) return;
    const now = Tone.now();
    const realNow = performance.now();

    // ---- right hand: hover + toggle + clear ----
    if (right) {
      this.hoveredStep = angleToStep(right.centroid);
      const pitchIdx = radiusToPitchIndex(right.centroid);
      this.steps[this.hoveredStep].pitchIndex = pitchIdx;

      if (right.fist) {
        // Clear on fist (debounced via the same cooldown).
        if (realNow - this.toggleArmedAt > TOGGLE_COOLDOWN_MS) {
          this.steps.forEach((s) => (s.on = false));
          this.toggleArmedAt = realNow;
        }
      } else if (right.pinch > PINCH_TOGGLE_THRESHOLD) {
        if (realNow - this.toggleArmedAt > TOGGLE_COOLDOWN_MS) {
          this.steps[this.hoveredStep].on = !this.steps[this.hoveredStep].on;
          this.toggleArmedAt = realNow;
        }
      }
    } else {
      this.hoveredStep = null;
    }

    // ---- left hand: tempo, filter, mute ----
    if (left) {
      const bpm = linMap(1 - left.centroid.x, 0, 1, 60, 160);
      Tone.getTransport().bpm.rampTo(bpm, 0.2, now);
      const cutoff = linMap(left.pinch, 0, 1, 300, 6000);
      this.filter.frequency.rampTo(cutoff, 0.1, now);
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
    this.synth?.releaseAll();
    this.synth?.dispose();
    this.filter?.dispose();
    this.delay?.dispose();
    this.reverb?.dispose();
    this.volume?.dispose();
    this.synth = this.filter = this.delay = this.reverb = this.volume = null;
    this.sequence = null;
    this.started = false;
  }

  /** Snapshot for the overlay to read; called every draw frame. */
  getViewState(): SequencerView {
    return {
      steps: this.steps.map((s) => ({ ...s })),
      playheadStep: this.playheadStep,
      lastTriggerAt: [...this.lastTriggerAt],
      hoveredStep: this.hoveredStep,
      muted: this.muted,
    };
  }
}

export interface SequencerView {
  steps: SequencerStep[];
  playheadStep: number;
  lastTriggerAt: number[];
  hoveredStep: number | null;
  muted: boolean;
}

// Engine instance is held by the App via the ModeEngine interface, but the
// overlay needs to peek into its view state. We keep a module-scoped weak
// reference set at start() / cleared at dispose() so drawOverlay can read it
// without piping it through the generic ModeEngine type.
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

function drawOverlay({ ctx, width, height, right }: ModeOverlayProps): void {
  const view = activeEngine?.getViewState();
  if (!view) return;

  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);

  const cx = width / 2;
  const cy = height / 2;
  const ringR = Math.min(width, height) * 0.32;

  // Subtle base ring.
  ctx.strokeStyle = 'rgba(108, 240, 196, 0.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.stroke();

  // Cells.
  const cellAngle = (Math.PI * 2) / STEPS;
  const cellR = ringR * 0.18;
  const now = performance.now();

  for (let i = 0; i < STEPS; i++) {
    // Step 0 at top, going clockwise.
    const angle = -Math.PI / 2 + i * cellAngle;
    const x = cx + Math.cos(angle) * ringR;
    const y = cy + Math.sin(angle) * ringR;
    const step = view.steps[i];
    const isPlayhead = i === view.playheadStep;
    const isHover = i === view.hoveredStep;
    const sinceTrigger = now - view.lastTriggerAt[i];
    const triggerPulse = clamp(1 - sinceTrigger / 350, 0, 1);

    // Trigger ripple.
    if (triggerPulse > 0) {
      const rippleR = cellR + (1 - triggerPulse) * cellR * 3;
      ctx.strokeStyle = `rgba(255, 122, 217, ${triggerPulse * 0.7})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, rippleR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cell fill.
    if (step.on) {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, cellR * 1.6);
      grad.addColorStop(0, `rgba(108, 240, 196, ${0.55 + triggerPulse * 0.4})`);
      grad.addColorStop(1, 'rgba(108, 240, 196, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, cellR * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Outline (brighter when playhead).
    ctx.lineWidth = isPlayhead ? 2.5 : 1.5;
    ctx.strokeStyle = isPlayhead
      ? 'rgba(255, 255, 255, 0.95)'
      : step.on
      ? 'rgba(108, 240, 196, 0.9)'
      : 'rgba(232, 236, 242, 0.35)';
    ctx.beginPath();
    ctx.arc(x, y, cellR, 0, Math.PI * 2);
    ctx.stroke();

    // Hover diamond.
    if (isHover) {
      ctx.strokeStyle = 'rgba(255, 122, 217, 0.95)';
      ctx.lineWidth = 2;
      const r2 = cellR * 1.35;
      ctx.beginPath();
      ctx.moveTo(x, y - r2);
      ctx.lineTo(x + r2, y);
      ctx.lineTo(x, y + r2);
      ctx.lineTo(x - r2, y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  // Cursor line from center to right-hand position when in use.
  if (right) {
    const hx = (1 - right.centroid.x) * width;
    const hy = right.centroid.y * height;
    ctx.strokeStyle = 'rgba(255, 122, 217, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Mute scrim overlay when muted.
  if (view.muted) {
    ctx.fillStyle = 'rgba(255, 93, 108, 0.08)';
    ctx.fillRect(0, 0, width, height);
  }

  ctx.restore();
}

export const sequencerMode: ModeDescriptor = {
  id: 'sequencer',
  name: 'Sequencer',
  hint: 'Right hand: angle = step, distance from center = pitch, pinch = toggle, fist = clear. Left hand: X = tempo, pinch = filter, fist = mute.',
  createEngine,
  drawOverlay,
  // Sequencer feels electric — punchier hand colors.
  handColors: { left: '#7df9ff', right: '#ffb86c' },
};

export const _internal = { angleToStep, radiusToPitchIndex, PITCHES_HZ };
