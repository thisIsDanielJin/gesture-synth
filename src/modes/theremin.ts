/**
 * Theremin mode.
 *
 * Right hand:
 *   Y → pitch, snapped to A-minor-pentatonic across 3 octaves (A2..A5).
 *   pinch → volume (-30 dB .. 0 dB).
 *   X → unused (kept open for future stereo pan).
 *
 * Left hand:
 *   X → vibrato rate (0..10 Hz). Fist stops vibrato.
 *
 * Pitch sits on a continuous semitone curve until the user opens both hands
 * (no fist) — opening a fist on the LEFT hand toggles "free pitch" off (stays
 * snapped). Pinching the LEFT hand all the way switches to free continuous
 * pitch, which is the classic theremin feel.
 */

import * as Tone from 'tone';
import type { HandState } from '../state/gestureStore';
import type { ModeEngine, ModeDescriptor, ModeOverlayProps } from './types';
import { clamp, expMap, linMap } from '../utils/mapping';
import { sendCc, sendNoteOn, sendNoteOff } from '../midi/out';
import { getModeMidiChannels, CC } from '../midi/mapping';

// A minor pentatonic in MIDI numbers across A2..A5 (33..81).
const SCALE_INTERVALS = [0, 3, 5, 7, 10]; // semitone offsets within an octave
const A2_MIDI = 45; // A2

const ALL_SCALE_MIDI: number[] = (() => {
  const out: number[] = [];
  for (let oct = 0; oct < 4; oct++) {
    for (const interval of SCALE_INTERVALS) {
      out.push(A2_MIDI + oct * 12 + interval);
    }
  }
  return out;
})();

const MIN_MIDI = ALL_SCALE_MIDI[0];
const MAX_MIDI = ALL_SCALE_MIDI[ALL_SCALE_MIDI.length - 1];

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function snapMidi(continuous: number): number {
  let best = ALL_SCALE_MIDI[0];
  let bestD = Infinity;
  for (const m of ALL_SCALE_MIDI) {
    const d = Math.abs(m - continuous);
    if (d < bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

class ThereminEngine implements ModeEngine {
  private synth: Tone.MonoSynth | null = null;
  private vibrato: Tone.Vibrato | null = null;
  private reverb: Tone.Reverb | null = null;
  private volume: Tone.Volume | null = null;
  private started = false;
  private noteHeld = false;
  /** Last MIDI note we sent on (so we know when to swap notes during glide). */
  private currentMidiNote: number | null = null;

  async start(): Promise<void> {
    if (this.started) return;
    await Tone.start();

    this.synth = new Tone.MonoSynth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.04, decay: 0.1, sustain: 0.9, release: 0.4 },
      filterEnvelope: { attack: 0.05, decay: 0.1, sustain: 1, release: 0.2, baseFrequency: 800, octaves: 3 },
      volume: -6,
    });
    this.vibrato = new Tone.Vibrato({ frequency: 0, depth: 0.08 });
    this.reverb = new Tone.Reverb({ decay: 4, wet: 0.35 });
    this.volume = new Tone.Volume(-12);

    this.synth.chain(this.vibrato, this.reverb, this.volume, Tone.getDestination());
    this.started = true;
  }

  update(left: HandState | null, right: HandState | null): void {
    if (!this.started || !this.synth || !this.vibrato || !this.volume) return;
    const now = Tone.now();

    // Pitch from right-hand Y. Y=0 (top) → highest, Y=1 → lowest.
    if (right) {
      const continuousMidi = linMap(1 - right.centroid.y, 0, 1, MIN_MIDI, MAX_MIDI);
      // Free pitch when LEFT hand is fully pinched, otherwise snap to scale.
      const freePitch = left ? left.pinch > 0.7 : false;
      const targetMidi = freePitch ? continuousMidi : snapMidi(continuousMidi);
      const freq = midiToFreq(targetMidi);
      // First time we see the right hand, trigger an attack; afterwards just
      // glide the frequency. Glide time is short for snapped, long for free.
      if (!this.noteHeld) {
        this.synth.triggerAttack(freq, now);
        this.noteHeld = true;
      } else {
        const glide = freePitch ? 0.05 : 0.02;
        this.synth.frequency.rampTo(freq, glide, now);
      }

      // Volume from right pinch.
      const vol = linMap(right.pinch, 0, 1, -30, 0);
      this.volume.volume.rampTo(vol, 0.05, now);

      // ---- MIDI ----
      const ch = getModeMidiChannels().theremin;
      if (ch !== null) {
        const midiNote = Math.round(targetMidi);
        if (this.currentMidiNote !== midiNote) {
          if (this.currentMidiNote !== null) sendNoteOff(ch, this.currentMidiNote);
          sendNoteOn(ch, midiNote, 100);
          this.currentMidiNote = midiNote;
        }
        sendCc(ch, CC.expression, linMap(right.pinch, 0, 1, 0, 127));
      }
    } else if (this.noteHeld) {
      this.synth.triggerRelease(now);
      this.noteHeld = false;
      const ch = getModeMidiChannels().theremin;
      if (ch !== null && this.currentMidiNote !== null) {
        sendNoteOff(ch, this.currentMidiNote);
        this.currentMidiNote = null;
      }
    }

    // Vibrato from left hand X (mirrored — moving left increases). Fist disables.
    if (left && !left.fist) {
      const rate = linMap(1 - left.centroid.x, 0, 1, 0, 10);
      const depth = linMap(1 - left.centroid.x, 0, 1, 0.02, 0.18);
      this.vibrato.frequency.rampTo(rate, 0.1, now);
      this.vibrato.depth.rampTo(depth, 0.1, now);
      const ch = getModeMidiChannels().theremin;
      if (ch !== null) sendCc(ch, CC.modulation, linMap(rate, 0, 10, 0, 127));
    } else {
      this.vibrato.frequency.rampTo(0, 0.1, now);
    }
  }

  dispose(): void {
    if (!this.started) return;
    if (this.noteHeld) this.synth?.triggerRelease();
    const ch = getModeMidiChannels().theremin;
    if (ch !== null && this.currentMidiNote !== null) {
      sendNoteOff(ch, this.currentMidiNote);
    }
    this.currentMidiNote = null;
    this.synth?.dispose();
    this.vibrato?.dispose();
    this.reverb?.dispose();
    this.volume?.dispose();
    this.synth = this.vibrato = this.reverb = this.volume = null;
    this.started = false;
    this.noteHeld = false;
  }
}

function drawOverlay({ ctx, width, height, left, right }: ModeOverlayProps): void {
  // Faint horizontal scale ticks across the right half — one per snapped pitch.
  const usableLeft = width * 0.05;
  const usableRight = width * 0.95;
  ctx.save();
  // Canvas is already mirrored by CSS, so draw in landmark coordinates.

  ctx.lineWidth = 1;
  for (let i = 0; i < ALL_SCALE_MIDI.length; i++) {
    const t = i / (ALL_SCALE_MIDI.length - 1);
    const y = (1 - t) * height;
    const isOctaveRoot = (ALL_SCALE_MIDI[i] - MIN_MIDI) % 12 === 0;
    ctx.strokeStyle = isOctaveRoot
      ? 'rgba(255, 122, 217, 0.55)'
      : 'rgba(108, 240, 196, 0.18)';
    ctx.beginPath();
    ctx.moveTo(usableLeft, y);
    ctx.lineTo(usableRight, y);
    ctx.stroke();
  }

  // Right-hand pitch indicator: thick glowing line + halo.
  if (right) {
    // centroid.x is already mirrored for parameter mapping; canvas is NOT
    // mirrored, so drawing at centroid.x * width lands on the visible hand.
    const handX = right.centroid.x * width;
    const handY = right.centroid.y * height;
    const continuousMidi = linMap(1 - right.centroid.y, 0, 1, MIN_MIDI, MAX_MIDI);
    const freePitch = left ? left.pinch > 0.7 : false;
    const targetMidi = freePitch ? continuousMidi : snapMidi(continuousMidi);
    const t = (targetMidi - MIN_MIDI) / (MAX_MIDI - MIN_MIDI);
    const targetY = (1 - t) * height;

    // Snap line.
    ctx.strokeStyle = 'rgba(108, 240, 196, 0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(usableLeft, targetY);
    ctx.lineTo(usableRight, targetY);
    ctx.stroke();

    // Halo at the hand, scaled by pinch (volume).
    const haloR = clamp(40 + right.pinch * 80, 30, 140);
    const grad = ctx.createRadialGradient(handX, handY, 0, handX, handY, haloR);
    grad.addColorStop(0, 'rgba(108, 240, 196, 0.6)');
    grad.addColorStop(1, 'rgba(108, 240, 196, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(handX, handY, haloR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Left-hand vibrato indicator: a small horizontal sine ribbon at hand pos.
  if (left && !left.fist) {
    const lx = left.centroid.x * width;
    const ly = left.centroid.y * height;
    const rate = linMap(1 - left.centroid.x, 0, 1, 0, 10);
    const depth = linMap(1 - left.centroid.x, 0, 1, 4, 26);
    ctx.strokeStyle = 'rgba(255, 122, 217, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const span = 90;
    const phase = performance.now() * 0.001 * rate * Math.PI * 2;
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const x = lx - span / 2 + t * span;
      const y = ly + Math.sin(t * Math.PI * 4 + phase) * depth;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.restore();
  // expMap is required only by tests; reference it so the import isn't elided.
  void expMap;
}

export const thereminMode: ModeDescriptor = {
  id: 'theremin',
  name: 'Theremin',
  hint: 'Right hand: Y = pitch, pinch = volume. Left hand X = vibrato. Left full pinch = free pitch (no scale snap).',
  createEngine: () => new ThereminEngine(),
  drawOverlay,
};

// Exported for testability.
export const _internal = { ALL_SCALE_MIDI, snapMidi, midiToFreq };
