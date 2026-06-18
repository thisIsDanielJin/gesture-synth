import { describe, it, expect } from 'vitest';
import { _internal, STEPS } from '../modes/drumMachine';
import type { DrumVoiceId } from '../audio/drumKit';

const { PATTERNS, MIDI_NOTE_BY_VOICE } = _internal;
const VOICES: DrumVoiceId[] = ['kick', 'snare', 'clap', 'closedHat', 'openHat', 'tom'];

describe('drumMachine: presets', () => {
  it('exposes at least 4 patterns', () => {
    expect(PATTERNS.length).toBeGreaterThanOrEqual(4);
  });

  it('every pattern has 16 steps for every voice', () => {
    for (const p of PATTERNS) {
      for (const v of VOICES) {
        expect(p.rows[v]).toHaveLength(STEPS);
      }
    }
  });

  it('every pattern has a kick on step 0', () => {
    for (const p of PATTERNS) {
      expect(p.rows.kick[0].hit).toBe(1);
    }
  });

  it('pattern names are unique', () => {
    const names = new Set(PATTERNS.map((p) => p.name));
    expect(names.size).toBe(PATTERNS.length);
  });

  it('every step has hit ∈ {0,1}', () => {
    for (const p of PATTERNS) {
      for (const v of VOICES) {
        for (const step of p.rows[v]) {
          expect([0, 1]).toContain(step.hit);
        }
      }
    }
  });
});

describe('drumMachine: MIDI mapping', () => {
  it('uses GM drum note numbers', () => {
    expect(MIDI_NOTE_BY_VOICE.kick).toBe(36);
    expect(MIDI_NOTE_BY_VOICE.snare).toBe(38);
    expect(MIDI_NOTE_BY_VOICE.clap).toBe(39);
    expect(MIDI_NOTE_BY_VOICE.closedHat).toBe(42);
    expect(MIDI_NOTE_BY_VOICE.openHat).toBe(46);
    expect(MIDI_NOTE_BY_VOICE.tom).toBe(45);
  });
});
