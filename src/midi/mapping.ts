/**
 * Per-mode MIDI channel + CC mapping.
 *
 * Each mode owns a MIDI channel so multiple modes can later play out of the
 * same instance without clobbering each other. CC numbers are picked to be
 * close to common DAW conventions (74 = filter cutoff, 71 = resonance, etc.)
 * so factory mappings in Ableton / VCV often "just work".
 */

import type { ModeId } from '../modes/types';

export interface ModeMidiConfig {
  /** 1-based channel, or null to disable MIDI for this mode. */
  channel: number | null;
}

/** Channel assignments. null disables MIDI for that mode. */
const DEFAULT_CHANNELS: Record<ModeId, number> = {
  theremin: 1,
  padSculptor: 2,
  sequencer: 3,
  drumMachine: 10, // GM drum channel
};

const channels: Record<ModeId, number | null> = { ...DEFAULT_CHANNELS };

export function getModeMidiChannels(): Record<ModeId, number | null> {
  return { ...channels };
}

export function setModeChannel(mode: ModeId, ch: number | null): void {
  channels[mode] = ch;
}

/** CC numbers per mode — chosen to align with common DAW factory templates. */
export const CC = {
  cutoff: 74,
  resonance: 71,
  drive: 76,
  delayMix: 91,
  reverbMix: 93,
  modulation: 1,
  expression: 11,
  // Drum-machine specific
  kickPitch: 20,
  snareSnap: 21,
  hatBrightness: 22,
} as const;
