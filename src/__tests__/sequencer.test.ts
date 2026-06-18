import { describe, it, expect } from 'vitest';
import { _internal, STEPS, PINCH_TOGGLE_THRESHOLD } from '../modes/sequencer';

const { angleToStep, radiusToPitchIndex, PITCHES_HZ } = _internal;

describe('sequencer: angleToStep', () => {
  it('returns step 0 when hand is directly above center', () => {
    expect(angleToStep({ x: 0.5, y: 0.2 })).toBe(0);
  });

  it('returns the right (3 o\'clock) quadrant ≈ steps 1 or 2', () => {
    const s = angleToStep({ x: 0.8, y: 0.5 });
    expect(s).toBeGreaterThanOrEqual(1);
    expect(s).toBeLessThanOrEqual(2);
  });

  it('returns step 4 (south) when hand is directly below center', () => {
    expect(angleToStep({ x: 0.5, y: 0.8 })).toBe(4);
  });

  it('returns the left (9 o\'clock) quadrant ≈ steps 5 or 6', () => {
    const s = angleToStep({ x: 0.2, y: 0.5 });
    expect(s).toBeGreaterThanOrEqual(5);
    expect(s).toBeLessThanOrEqual(6);
  });

  it('always falls inside [0, STEPS)', () => {
    for (let i = 0; i < 100; i++) {
      const x = (i % 13) / 13;
      const y = (i % 7) / 7;
      const s = angleToStep({ x, y });
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(STEPS);
    }
  });
});

describe('sequencer: radiusToPitchIndex', () => {
  it('clamps to 0 when very close to center', () => {
    expect(radiusToPitchIndex({ x: 0.5, y: 0.5 })).toBe(0);
  });

  it('clamps to last index when far from center', () => {
    const idx = radiusToPitchIndex({ x: 0.95, y: 0.5 });
    expect(idx).toBe(PITCHES_HZ.length - 1);
  });

  it('is monotonic with distance from center', () => {
    const a = radiusToPitchIndex({ x: 0.6, y: 0.5 });
    const b = radiusToPitchIndex({ x: 0.7, y: 0.5 });
    const c = radiusToPitchIndex({ x: 0.85, y: 0.5 });
    expect(a).toBeLessThanOrEqual(b);
    expect(b).toBeLessThanOrEqual(c);
  });
});

describe('sequencer: pinch threshold', () => {
  it('is set to a value that requires intentional pinch', () => {
    expect(PINCH_TOGGLE_THRESHOLD).toBeGreaterThan(0.5);
    expect(PINCH_TOGGLE_THRESHOLD).toBeLessThan(1);
  });
});
