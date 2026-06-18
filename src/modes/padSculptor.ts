/**
 * Pad Sculptor mode.
 *
 * Both hands play a 4-note voicing whose intervals come from the distance
 * between the hands:
 *   close hands  → tight cluster (root, b2, 5, b7)
 *   medium       → minor 9 (root, m3, 5, 9)
 *   wide         → big maj9 spread (root, 5, 9, M3 up an octave)
 *
 * Average Y → octave (top of frame = high). Either pinch → shimmer reverb wet.
 * Either fist → freeze the chord (engine stops following hand position so you
 * can sculpt the reverb / shimmer without the chord drifting).
 *
 * If only one hand is visible, falls back to a stationary "medium" chord at
 * that hand's Y.
 */

import * as Tone from 'tone';
import type { HandState } from '../state/gestureStore';
import type { ModeEngine, ModeDescriptor, ModeOverlayProps } from './types';
import { clamp, dist, linMap } from '../utils/mapping';

// Voicings as semitone offsets from the root.
type Voicing = readonly [number, number, number, number];
const TIGHT: Voicing = [0, 1, 7, 10];   // root, b9, 5, b7
const MID: Voicing   = [0, 3, 7, 14];   // root, m3, 5, 9
const WIDE: Voicing  = [0, 7, 14, 16];  // root, 5, 9, M3 up oct

// Fixed root for the POC — A. (Could be exposed in UI later.)
const ROOT_PC = 9; // A

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Crossfade between three voicings based on hand-distance t in [0..1]. */
function blendedVoicing(t: number): Voicing {
  // t in [0, 0.5) blends TIGHT→MID; [0.5, 1] blends MID→WIDE.
  if (t < 0.5) {
    const u = t / 0.5;
    return [
      Math.round(TIGHT[0] * (1 - u) + MID[0] * u),
      Math.round(TIGHT[1] * (1 - u) + MID[1] * u),
      Math.round(TIGHT[2] * (1 - u) + MID[2] * u),
      Math.round(TIGHT[3] * (1 - u) + MID[3] * u),
    ];
  }
  const u = (t - 0.5) / 0.5;
  return [
    Math.round(MID[0] * (1 - u) + WIDE[0] * u),
    Math.round(MID[1] * (1 - u) + WIDE[1] * u),
    Math.round(MID[2] * (1 - u) + WIDE[2] * u),
    Math.round(MID[3] * (1 - u) + WIDE[3] * u),
  ];
}

class PadSculptorEngine implements ModeEngine {
  private synth: Tone.PolySynth | null = null;
  private filter: Tone.Filter | null = null;
  private chorus: Tone.Chorus | null = null;
  private reverb: Tone.Reverb | null = null;
  private volume: Tone.Volume | null = null;
  private started = false;
  private heldFreqs: number[] = [];
  private frozen = false;

  async start(): Promise<void> {
    if (this.started) return;
    await Tone.start();

    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 22 },
      envelope: { attack: 0.8, decay: 0.5, sustain: 0.9, release: 1.5 },
      volume: -16,
    });
    this.filter = new Tone.Filter({ frequency: 1800, Q: 0.7, type: 'lowpass' });
    this.chorus = new Tone.Chorus({ frequency: 0.5, depth: 0.5, wet: 0.5 }).start();
    this.reverb = new Tone.Reverb({ decay: 8, wet: 0.4 });
    this.volume = new Tone.Volume(-10);

    this.synth.chain(this.filter, this.chorus, this.reverb, this.volume, Tone.getDestination());
    this.started = true;
  }

  update(left: HandState | null, right: HandState | null): void {
    if (!this.started || !this.synth || !this.reverb || !this.volume) return;
    const now = Tone.now();

    // Freeze when either hand is a fist.
    const wantFreeze = (left?.fist ?? false) || (right?.fist ?? false);
    this.frozen = wantFreeze;

    if (!left && !right) {
      this.releaseAll(now);
      return;
    }

    if (this.frozen) {
      // Hold the current chord; only let pinch modulate reverb wet.
      const pinch = Math.max(left?.pinch ?? 0, right?.pinch ?? 0);
      this.reverb.wet.rampTo(linMap(pinch, 0, 1, 0.2, 0.95), 0.2, now);
      return;
    }

    // Compute target chord.
    let widthT = 0.5;
    let avgY = 0.5;
    if (left && right) {
      widthT = clamp(dist(left.centroid, right.centroid) / 0.7, 0, 1);
      avgY = (left.centroid.y + right.centroid.y) / 2;
    } else {
      const h = (left ?? right)!;
      avgY = h.centroid.y;
    }

    const voicing = blendedVoicing(widthT);
    const octave = Math.round(linMap(1 - avgY, 0, 1, 2, 5));
    const rootMidi = ROOT_PC + 12 * octave;
    const targetFreqs = voicing.map((iv) => midiToFreq(rootMidi + iv));

    // If chord changed enough, retrigger.
    if (!arraysClose(targetFreqs, this.heldFreqs, 0.5)) {
      this.releaseAll(now);
      this.synth.triggerAttack(
        targetFreqs.map((f) => Tone.Frequency(f, 'hz').toNote()),
        now,
      );
      this.heldFreqs = targetFreqs;
    }

    // Shimmer / reverb wet from max pinch.
    const pinch = Math.max(left?.pinch ?? 0, right?.pinch ?? 0);
    this.reverb.wet.rampTo(linMap(pinch, 0, 1, 0.2, 0.95), 0.2, now);
    this.filter!.frequency.rampTo(linMap(pinch, 0, 1, 1200, 6000), 0.3, now);
    this.volume.volume.rampTo(linMap(pinch, 0, 1, -14, -4), 0.2, now);
  }

  private releaseAll(now: number): void {
    if (this.synth && this.heldFreqs.length > 0) {
      this.synth.releaseAll(now);
      this.heldFreqs = [];
    }
  }

  dispose(): void {
    if (!this.started) return;
    this.releaseAll(Tone.now());
    this.synth?.dispose();
    this.filter?.dispose();
    this.chorus?.dispose();
    this.reverb?.dispose();
    this.volume?.dispose();
    this.synth = this.filter = this.chorus = this.reverb = this.volume = null;
    this.started = false;
  }
}

function arraysClose(a: number[], b: number[], epsHz: number): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > epsHz) return false;
  return true;
}

function drawOverlay({ ctx, width, height, left, right }: ModeOverlayProps): void {
  ctx.save();
  // Canvas is already mirrored by CSS.

  if (left && right) {
    // Overlay reads centroid.x which is mirrored for mapping; flip back so
    // the cloud lands on the visible hands.
    const lx = (1 - left.centroid.x) * width;
    const ly = left.centroid.y * height;
    const rx = (1 - right.centroid.x) * width;
    const ry = right.centroid.y * height;

    // The cloud lives at the midpoint, scaled by hand distance.
    const mx = (lx + rx) / 2;
    const my = (ly + ry) / 2;
    const d = Math.hypot(rx - lx, ry - ly);
    const radius = clamp(d * 0.85, 80, Math.max(width, height) * 0.55);

    // Hue shifts from violet (tight) to teal (wide).
    const widthT = clamp(d / (width * 0.6), 0, 1);
    const hue = linMap(widthT, 0, 1, 280, 170);

    const pinch = Math.max(left.pinch, right.pinch);
    const alphaInner = 0.18 + pinch * 0.35;

    const grad = ctx.createRadialGradient(mx, my, radius * 0.05, mx, my, radius);
    grad.addColorStop(0, `hsla(${hue}, 80%, 70%, ${alphaInner})`);
    grad.addColorStop(0.5, `hsla(${hue}, 80%, 55%, ${alphaInner * 0.4})`);
    grad.addColorStop(1, `hsla(${hue}, 80%, 40%, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(mx, my, radius, 0, Math.PI * 2);
    ctx.fill();

    // Connecting filament between hands.
    ctx.strokeStyle = `hsla(${hue}, 80%, 75%, 0.6)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(rx, ry);
    ctx.stroke();

    // Frozen indicator: dashed outline.
    const frozen = left.fist || right.fist;
    if (frozen) {
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = `hsla(${hue}, 90%, 80%, 0.9)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, radius * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  } else if (left || right) {
    const h = (left ?? right)!;
    const x = (1 - h.centroid.x) * width;
    const y = h.centroid.y * height;
    const grad = ctx.createRadialGradient(x, y, 5, x, y, 140);
    grad.addColorStop(0, 'hsla(220, 80%, 70%, 0.4)');
    grad.addColorStop(1, 'hsla(220, 80%, 40%, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, 140, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export const padSculptorMode: ModeDescriptor = {
  id: 'padSculptor',
  name: 'Pad Sculptor',
  hint: 'Both hands open. Spread for chord brightness, height for octave, pinch for shimmer. Fist freezes the chord.',
  createEngine: () => new PadSculptorEngine(),
  drawOverlay,
};

// Exported for tests.
export const _internal = { blendedVoicing, midiToFreq, TIGHT, MID, WIDE };
