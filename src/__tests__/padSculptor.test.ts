import { describe, it, expect } from 'vitest';
import { _internal } from '../modes/padSculptor';

const { blendedVoicing, midiToFreq, TIGHT, MID, WIDE } = _internal;

describe('padSculptor: voicing crossfade', () => {
  it('returns TIGHT at t=0', () => {
    expect(blendedVoicing(0)).toEqual([...TIGHT]);
  });

  it('returns MID at t=0.5', () => {
    expect(blendedVoicing(0.5)).toEqual([...MID]);
  });

  it('returns WIDE at t=1', () => {
    expect(blendedVoicing(1)).toEqual([...WIDE]);
  });

  it('produces ascending intervals at every t', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const v = blendedVoicing(t);
      for (let i = 1; i < v.length; i++) {
        expect(v[i]).toBeGreaterThanOrEqual(v[i - 1]);
      }
    }
  });
});

describe('padSculptor: midiToFreq', () => {
  it('A4 = 440', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 5);
  });
});
