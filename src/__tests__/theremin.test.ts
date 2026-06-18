import { describe, it, expect } from 'vitest';
import { _internal } from '../modes/theremin';

const { ALL_SCALE_MIDI, snapMidi, midiToFreq } = _internal;

describe('theremin: scale + pitch helpers', () => {
  it('scale spans 4 octaves of A minor pentatonic', () => {
    expect(ALL_SCALE_MIDI[0]).toBe(45); // A2
    expect(ALL_SCALE_MIDI[ALL_SCALE_MIDI.length - 1]).toBe(45 + 3 * 12 + 10); // A5+b7? – we span 4 octaves * 5 notes = 20 entries
    expect(ALL_SCALE_MIDI.length).toBe(20);
    // strictly ascending
    for (let i = 1; i < ALL_SCALE_MIDI.length; i++) {
      expect(ALL_SCALE_MIDI[i]).toBeGreaterThan(ALL_SCALE_MIDI[i - 1]);
    }
  });

  it('snapMidi picks the closest scale note', () => {
    expect(snapMidi(45)).toBe(45);    // A2 exactly
    expect(snapMidi(46)).toBe(45);    // 1 semi above A2 → A2
    expect(snapMidi(47.4)).toBe(48);  // closer to C3 (48) than A2 (45)
  });

  it('midiToFreq matches A4 = 440 Hz', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 5);
    expect(midiToFreq(57)).toBeCloseTo(220, 4); // A3
  });
});
