/**
 * Drum Machine mode — generative.
 *
 * Five preset 16-step grooves (House, Techno, Breaks, Halftime, TwoStep) loop
 * continuously. Hands sculpt the kit, not the steps:
 *
 *   Right hand X    → kick pitch (35..70 Hz)
 *   Right hand Y    → snare snap (body ↔ noise mix)
 *   Right pinch     → master low-pass filter (200 Hz .. 18 kHz, slight Q bump)
 *   Right fist      → cycle to next groove (debounced)
 *
 *   Left hand X     → tempo (90..160 bpm)
 *   Left hand Y     → hat brightness (closed + open, swept hi-pass)
 *   Left pinch      → reverb wet on the kit bus
 *   Left fist       → mute
 *
 * Pattern format: per-voice array of { hit: 0|1, accent: bool }, length 16.
 * Same Tone.Sequence-driven loop architecture as the bass sequencer mode.
 */

import * as Tone from 'tone';
import type { HandState } from '../state/gestureStore';
import type { ModeEngine, ModeDescriptor, ModeOverlayProps } from './types';
import { clamp, expMap, linMap } from '../utils/mapping';
import { createKit, type DrumKit, type DrumVoiceId } from '../audio/drumKit';
import { sendCc, sendNoteOn, sendNoteOff } from '../midi/out';
import { getModeMidiChannels, CC } from '../midi/mapping';

export const STEPS = 16;

export interface DrumStep {
  hit: 0 | 1;
  accent?: boolean;
}

export interface DrumPattern {
  name: string;
  /** voice → 16 steps. */
  rows: Record<DrumVoiceId, readonly DrumStep[]>;
}

const off: DrumStep = { hit: 0 };
const X = (accent = false): DrumStep => ({ hit: 1, accent });

function row(spec: ReadonlyArray<0 | 1 | 'A'>): DrumStep[] {
  return spec.map((v) => (v === 'A' ? X(true) : v === 1 ? X() : off));
}

export const PATTERNS: ReadonlyArray<DrumPattern> = [
  {
    name: 'House',
    rows: {
      kick:      row(['A',0,0,0, 'A',0,0,0, 'A',0,0,0, 'A',0,0,0]),
      snare:     row([0,0,0,0,   1,0,0,0,   0,0,0,0,   1,0,0,0]),
      clap:      row([0,0,0,0,   0,0,0,1,   0,0,0,0,   0,0,0,1]),
      closedHat: row([1,0,1,0,   1,0,1,0,   1,0,1,0,   1,0,1,0]),
      openHat:   row([0,0,1,0,   0,0,0,0,   0,0,1,0,   0,0,0,0]),
      tom:       row([0,0,0,0,   0,0,0,0,   0,0,0,0,   0,0,0,1]),
    },
  },
  {
    name: 'Techno',
    rows: {
      kick:      row(['A',0,0,0, 'A',0,0,1, 'A',0,0,0, 'A',0,1,0]),
      snare:     row([0,0,0,0,   0,0,0,0,   0,0,0,0,   0,0,0,0]),
      clap:      row([0,0,0,0,   1,0,0,0,   0,0,0,0,   1,0,0,0]),
      closedHat: row([0,1,0,1,   0,1,0,1,   0,1,0,1,   0,1,0,1]),
      openHat:   row([0,0,0,1,   0,0,0,0,   0,0,0,1,   0,0,0,0]),
      tom:       row([0,0,0,0,   0,0,0,0,   0,0,0,0,   0,0,0,0]),
    },
  },
  {
    name: 'Breaks',
    rows: {
      kick:      row(['A',0,0,1, 0,0,0,1,   0,0,1,0,   'A',0,0,0]),
      snare:     row([0,0,0,0,   1,0,0,0,   0,1,0,0,   1,0,0,1]),
      clap:      row([0,0,0,0,   0,0,0,0,   0,0,0,0,   0,0,1,0]),
      closedHat: row([1,1,0,1,   1,0,1,1,   1,1,0,1,   0,1,1,0]),
      openHat:   row([0,0,1,0,   0,0,0,0,   0,0,1,0,   0,0,0,0]),
      tom:       row([0,0,0,0,   0,0,0,0,   0,1,0,0,   0,0,0,0]),
    },
  },
  {
    name: 'Halftime',
    rows: {
      kick:      row(['A',0,0,0, 0,0,0,0,   0,0,0,0,   0,0,0,1]),
      snare:     row([0,0,0,0,   0,0,0,0,   1,0,0,0,   0,0,0,0]),
      clap:      row([0,0,0,0,   0,0,0,0,   1,0,0,0,   0,0,1,0]),
      closedHat: row([1,0,1,1,   0,1,1,0,   1,1,0,1,   1,0,1,0]),
      openHat:   row([0,0,0,0,   0,0,0,1,   0,0,0,0,   0,1,0,0]),
      tom:       row([0,0,0,0,   0,0,0,0,   0,0,0,0,   0,0,1,0]),
    },
  },
  {
    name: 'TwoStep',
    rows: {
      kick:      row(['A',0,0,0, 0,0,1,0,   0,0,0,0,   1,0,0,0]),
      snare:     row([0,0,0,0,   1,0,0,0,   0,0,0,1,   0,0,0,0]),
      clap:      row([0,0,0,0,   1,0,0,0,   0,0,0,0,   1,0,0,0]),
      closedHat: row([1,1,1,0,   1,0,1,1,   1,1,0,1,   1,1,0,1]),
      openHat:   row([0,0,0,1,   0,0,0,0,   0,0,1,0,   0,0,1,0]),
      tom:       row([0,0,0,0,   0,0,0,0,   0,0,1,0,   0,0,0,0]),
    },
  },
];

const FIST_COOLDOWN_MS = 500;

/** GM drum note numbers — used when emitting MIDI. */
const MIDI_NOTE_BY_VOICE: Record<DrumVoiceId, number> = {
  kick: 36,       // C1 — Bass Drum 1
  snare: 38,      // D1 — Acoustic Snare
  clap: 39,       // D#1 — Hand Clap
  closedHat: 42,  // F#1 — Closed Hi-Hat
  openHat: 46,    // A#1 — Open Hi-Hat
  tom: 45,        // A1 — Low Tom
};

class DrumMachineEngine implements ModeEngine {
  private kit: DrumKit | null = null;
  /** Master low-pass filter — what right-hand pinch sweeps. */
  private filter: Tone.Filter | null = null;
  private reverb: Tone.Reverb | null = null;
  private volume: Tone.Volume | null = null;
  private sequence: Tone.Sequence<number> | null = null;

  private patternIdx = 0;
  private playheadStep = 0;
  private lastTriggerAt: Record<DrumVoiceId, number[]> = makeTriggerMap();
  private lastFistAt = 0;
  private muted = false;
  private started = false;
  /** Cached cutoff for the overlay meter. */
  private cutoffHz = 18000;

  async start(): Promise<void> {
    if (this.started) return;
    await Tone.start();

    this.kit = createKit();
    this.filter = new Tone.Filter({ frequency: 18000, Q: 0.6, type: 'lowpass', rolloff: -24 });
    this.reverb = new Tone.Reverb({ decay: 2.4, wet: 0.12 });
    this.volume = new Tone.Volume(-3);
    this.kit.bus.chain(this.filter, this.reverb, this.volume, Tone.getDestination());

    if (Tone.getTransport().state !== 'started') {
      Tone.getTransport().bpm.value = 124;
    }

    this.sequence = new Tone.Sequence<number>(
      (time, stepIdx) => {
        this.playheadStep = stepIdx;
        const pattern = PATTERNS[this.patternIdx];
        for (const voice of Object.keys(pattern.rows) as DrumVoiceId[]) {
          const step = pattern.rows[voice][stepIdx];
          if (!step.hit) continue;
          const vel = step.accent ? 1 : 0.78;
          this.kit![voice].trigger(time, vel);
          this.lastTriggerAt[voice][stepIdx] = performance.now();

          // MIDI: send a short note-on/off pair on the drum channel.
          const ch = getModeMidiChannels().drumMachine;
          if (ch !== null) {
            const midiVel = Math.round(vel * 100) + 27;
            sendNoteOn(ch, MIDI_NOTE_BY_VOICE[voice], midiVel, time);
            sendNoteOff(ch, MIDI_NOTE_BY_VOICE[voice], time + 0.05);
          }
        }
      },
      Array.from({ length: STEPS }, (_, i) => i),
      '16n',
    ).start(0);

    Tone.getTransport().start();
    this.started = true;
  }

  update(left: HandState | null, right: HandState | null): void {
    if (!this.started || !this.kit || !this.filter || !this.reverb || !this.volume) return;
    const now = Tone.now();
    const realNow = performance.now();

    if (right) {
      // X (mirrored already): low to high → kick pitch up.
      this.kit.kick.pitch = expMap(1 - right.centroid.x, 0, 1, 35, 70);
      // Y inverted → snare snap.
      this.kit.snare.snap = clamp(linMap(1 - right.centroid.y, 0, 1, 0, 1), 0, 1);
      // Pinch → master low-pass cutoff. Closed pinch = dark/closed, open hand =
      // wide open. Tiny resonance bump near the top for that "filter sweep
      // into the drop" feel.
      this.cutoffHz = expMap(right.pinch, 0, 1, 200, 18000);
      this.filter.frequency.rampTo(this.cutoffHz, 0.05, now);
      this.filter.Q.rampTo(linMap(right.pinch, 0, 1, 0.6, 2.5), 0.1, now);

      // CCs.
      const ch = getModeMidiChannels().drumMachine;
      if (ch !== null) {
        sendCc(ch, CC.kickPitch, linMap(this.kit.kick.pitch, 35, 70, 0, 127));
        sendCc(ch, CC.snareSnap, linMap(this.kit.snare.snap, 0, 1, 0, 127));
        sendCc(ch, CC.cutoff, linMap(right.pinch, 0, 1, 0, 127));
      }

      if (right.fist && realNow - this.lastFistAt > FIST_COOLDOWN_MS) {
        this.patternIdx = (this.patternIdx + 1) % PATTERNS.length;
        this.lastFistAt = realNow;
      }
    }

    if (left) {
      const x = 1 - left.centroid.x;
      Tone.getTransport().bpm.rampTo(linMap(x, 0, 1, 90, 160), 0.2, now);
      const bright = linMap(1 - left.centroid.y, 0, 1, 0, 1);
      this.kit.closedHat.brightness = bright;
      this.kit.openHat.brightness = bright;
      this.reverb.wet.rampTo(linMap(left.pinch, 0, 1, 0.05, 0.6), 0.2, now);

      const ch = getModeMidiChannels().drumMachine;
      if (ch !== null) {
        sendCc(ch, CC.hatBrightness, linMap(bright, 0, 1, 0, 127));
        sendCc(ch, CC.reverbMix, linMap(left.pinch, 0, 1, 0, 127));
      }

      const wantMute = left.fist;
      if (wantMute !== this.muted) {
        this.muted = wantMute;
        this.volume.volume.rampTo(this.muted ? -60 : -3, 0.15, now);
      }
    }
  }

  dispose(): void {
    if (!this.started) return;
    this.sequence?.stop().dispose();
    Tone.getTransport().stop();
    this.kit?.dispose();
    this.filter?.dispose();
    this.reverb?.dispose();
    this.volume?.dispose();
    this.kit = null;
    this.filter = this.reverb = this.volume = null;
    this.sequence = null;
    this.started = false;
  }

  getViewState(): DrumView {
    return {
      pattern: PATTERNS[this.patternIdx],
      patternIdx: this.patternIdx,
      patternCount: PATTERNS.length,
      playheadStep: this.playheadStep,
      lastTriggerAt: this.lastTriggerAt,
      muted: this.muted,
      kickPitch: this.kit?.kick.pitch ?? 50,
      snareSnap: this.kit?.snare.snap ?? 0.5,
      hatBrightness: this.kit?.closedHat.brightness ?? 0.6,
      cutoffHz: this.cutoffHz,
    };
  }
}

function makeTriggerMap(): Record<DrumVoiceId, number[]> {
  const ids: DrumVoiceId[] = ['kick', 'snare', 'clap', 'closedHat', 'openHat', 'tom'];
  return Object.fromEntries(ids.map((id) => [id, Array(STEPS).fill(0)])) as Record<
    DrumVoiceId,
    number[]
  >;
}

export interface DrumView {
  pattern: DrumPattern;
  patternIdx: number;
  patternCount: number;
  playheadStep: number;
  lastTriggerAt: Record<DrumVoiceId, number[]>;
  muted: boolean;
  kickPitch: number;
  snareSnap: number;
  hatBrightness: number;
  cutoffHz: number;
}

let activeEngine: DrumMachineEngine | null = null;

function createEngine(): ModeEngine {
  const e = new DrumMachineEngine();
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

const VOICE_ROW_LABEL: Record<DrumVoiceId, string> = {
  kick: 'KCK',
  snare: 'SNR',
  clap: 'CLP',
  closedHat: 'HHC',
  openHat: 'HHO',
  tom: 'TOM',
};

const VOICE_ORDER: DrumVoiceId[] = ['kick', 'snare', 'clap', 'closedHat', 'openHat', 'tom'];

function drawOverlay({ ctx, width, height }: ModeOverlayProps): void {
  const view = activeEngine?.getViewState();
  if (!view) return;

  ctx.save();

  // ---- 6-row × 16-col grid at the bottom ----
  const cellW = (width - 80) / STEPS;
  const cellH = 16;
  const rowGap = 4;
  const gridH = VOICE_ORDER.length * (cellH + rowGap);
  const gridY = height - gridH - 30;
  const gridX = 60;

  // Background panel.
  ctx.fillStyle = 'rgba(15, 18, 26, 0.78)';
  ctx.fillRect(gridX - 50, gridY - 24, width - gridX + 50 - 16, gridH + 36);

  // Pattern label.
  ctx.fillStyle = 'rgba(232, 236, 242, 0.9)';
  ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(
    `Pattern ${view.patternIdx + 1}/${view.patternCount} · ${view.pattern.name}` +
      (view.muted ? '  (muted)' : ''),
    gridX - 40,
    gridY - 8,
  );

  const now = performance.now();
  for (let r = 0; r < VOICE_ORDER.length; r++) {
    const voice = VOICE_ORDER[r];
    const y = gridY + r * (cellH + rowGap);
    // Row label.
    ctx.fillStyle = 'rgba(232, 236, 242, 0.55)';
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillText(VOICE_ROW_LABEL[voice], gridX - 44, y + cellH - 4);

    for (let i = 0; i < STEPS; i++) {
      const x = gridX + i * cellW;
      const step = view.pattern.rows[voice][i];
      const isPlayhead = i === view.playheadStep;
      const sinceTrigger = now - view.lastTriggerAt[voice][i];
      const triggerPulse = clamp(1 - sinceTrigger / 220, 0, 1);

      // Cell base.
      ctx.fillStyle = isPlayhead
        ? 'rgba(255, 122, 217, 0.18)'
        : 'rgba(108, 240, 196, 0.05)';
      ctx.fillRect(x + 1, y, cellW - 2, cellH);

      // Hit fill.
      if (step.hit) {
        const baseAlpha = step.accent ? 0.95 : 0.65;
        const alpha = clamp(baseAlpha + triggerPulse * 0.4, 0, 1);
        ctx.fillStyle = step.accent
          ? `rgba(255, 122, 217, ${alpha})`
          : `rgba(108, 240, 196, ${alpha})`;
        ctx.fillRect(x + 3, y + 2, cellW - 6, cellH - 4);
      }

      // Outline (brighter on playhead).
      ctx.strokeStyle = isPlayhead
        ? 'rgba(255, 255, 255, 0.9)'
        : 'rgba(232, 236, 242, 0.12)';
      ctx.lineWidth = isPlayhead ? 1.5 : 1;
      ctx.strokeRect(x + 1, y, cellW - 2, cellH);
    }
  }

  // ---- Live param meters (top-left) ----
  const meterX = 24;
  const meterY = 80;
  const meterW = 220;
  const meterH = 64;
  ctx.fillStyle = 'rgba(15, 18, 26, 0.7)';
  ctx.fillRect(meterX, meterY, meterW, meterH);
  ctx.strokeStyle = 'rgba(232, 236, 242, 0.18)';
  ctx.strokeRect(meterX, meterY, meterW, meterH);

  ctx.fillStyle = 'rgba(232, 236, 242, 0.65)';
  ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.fillText(`KICK PITCH ${Math.round(view.kickPitch)} Hz`, meterX + 10, meterY + 18);
  ctx.fillText(`SNARE SNAP ${(view.snareSnap * 100).toFixed(0)}%`, meterX + 10, meterY + 36);
  ctx.fillText(`LP CUTOFF  ${Math.round(view.cutoffHz)} Hz`, meterX + 10, meterY + 54);

  ctx.restore();
}

export const drumMachineMode: ModeDescriptor = {
  id: 'drumMachine',
  name: 'Drum Machine',
  hint: 'Right hand: X = kick pitch, Y = snare snap, pinch = LP filter, fist = next pattern. Left hand: X = tempo, Y = hat brightness, pinch = reverb, fist = mute.',
  createEngine,
  drawOverlay,
  handColors: { left: '#ffd166', right: '#06d6a0' },
};

export const _internal = { PATTERNS, MIDI_NOTE_BY_VOICE };
