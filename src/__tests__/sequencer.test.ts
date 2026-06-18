import { describe, it, expect } from 'vitest';
import { _internal, STEPS } from '../modes/sequencer';

const { PATTERNS, midiToFreq } = _internal;

describe('sequencer: presets', () => {
  it('exposes at least 2 patterns', () => {
    expect(PATTERNS.length).toBeGreaterThanOrEqual(2);
  });

  it('every pattern has exactly STEPS steps', () => {
    for (const p of PATTERNS) {
      expect(p.steps.length).toBe(STEPS);
    }
  });

  it('every step has the required shape', () => {
    for (const p of PATTERNS) {
      for (const s of p.steps) {
        expect(s).toHaveProperty('note');
        expect(s).toHaveProperty('gate');
        expect(s).toHaveProperty('accent');
        expect(s).toHaveProperty('slide');
        if (s.note !== null) expect(typeof s.note).toBe('number');
        expect(s.gate).toBeGreaterThanOrEqual(0);
        expect(s.gate).toBeLessThanOrEqual(1);
      }
    }
  });

  it('at least one accent and one slide per pattern (not boring)', () => {
    for (const p of PATTERNS) {
      expect(p.steps.some((s) => s.accent)).toBe(true);
      expect(p.steps.some((s) => s.slide)).toBe(true);
    }
  });

  it('pattern names are unique', () => {
    const names = new Set(PATTERNS.map((p) => p.name));
    expect(names.size).toBe(PATTERNS.length);
  });
});

describe('sequencer: midiToFreq', () => {
  it('A4 = 440 Hz', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 5);
  });

  it('A1 (33) = 55 Hz', () => {
    expect(midiToFreq(33)).toBeCloseTo(55, 1);
  });
});
