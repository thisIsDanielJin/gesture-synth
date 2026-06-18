import { describe, it, expect } from 'vitest';
import { clamp, linMap, expMap, dist, Smoother } from '../utils/mapping';

describe('clamp', () => {
  it('keeps values inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('clamps below', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });
  it('clamps above', () => {
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe('linMap', () => {
  it('maps midpoint to midpoint', () => {
    expect(linMap(0.5, 0, 1, 0, 100)).toBe(50);
  });
  it('clamps the input fraction', () => {
    expect(linMap(2, 0, 1, 0, 100)).toBe(100);
    expect(linMap(-1, 0, 1, 0, 100)).toBe(0);
  });
  it('returns outMin when input range collapses', () => {
    expect(linMap(0.5, 1, 1, 10, 20)).toBe(10);
  });
});

describe('expMap', () => {
  it('hits endpoints exactly', () => {
    expect(expMap(0, 0, 1, 80, 12000)).toBeCloseTo(80, 5);
    expect(expMap(1, 0, 1, 80, 12000)).toBeCloseTo(12000, 1);
  });
  it('is monotonic', () => {
    const a = expMap(0.25, 0, 1, 80, 12000);
    const b = expMap(0.5, 0, 1, 80, 12000);
    const c = expMap(0.75, 0, 1, 80, 12000);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

describe('dist', () => {
  it('is zero for the same point', () => {
    expect(dist({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
  });
  it('matches pythagoras', () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('Smoother', () => {
  it('returns the first value verbatim', () => {
    const s = new Smoother(0.5);
    expect(s.next(10)).toBe(10);
  });

  it('moves toward the target without overshooting (alpha < 1)', () => {
    const s = new Smoother(0.5);
    s.next(0);
    const a = s.next(10);
    const b = s.next(10);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(10);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(10);
  });

  it('handles NaN by reseeding to target', () => {
    const s = new Smoother(0.5);
    s.next(NaN);
    expect(s.next(7)).toBe(7);
  });

  it('reset clears state', () => {
    const s = new Smoother(0.5);
    s.next(0);
    s.next(10);
    s.reset();
    expect(s.next(42)).toBe(42);
  });
});
