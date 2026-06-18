/**
 * Pure helpers for mapping normalized hand-landmark values [0..1] to
 * audio-parameter ranges. Kept side-effect-free so they're trivial to test.
 */

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** Linear map of x in [inMin..inMax] -> [outMin..outMax]. */
export const linMap = (
  x: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number => {
  if (inMax === inMin) return outMin;
  const t = (x - inMin) / (inMax - inMin);
  return outMin + clamp(t, 0, 1) * (outMax - outMin);
};

/** Exponential map — useful for frequency-like params (cutoff). */
export const expMap = (
  x: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number => {
  const t = clamp((x - inMin) / (inMax - inMin), 0, 1);
  const logMin = Math.log(outMin);
  const logMax = Math.log(outMax);
  return Math.exp(logMin + t * (logMax - logMin));
};

/** Euclidean distance between two normalized landmark points. */
export const dist = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * One-pole low-pass smoother. Higher `alpha` = snappier, lower = smoother.
 * Hand-tracking is jittery; every value flows through this before reaching audio.
 */
export class Smoother {
  private value: number | null = null;
  private readonly alpha: number;

  constructor(alpha: number = 0.25) {
    this.alpha = alpha;
  }

  next(target: number): number {
    if (this.value === null || Number.isNaN(this.value)) {
      this.value = target;
      return target;
    }
    this.value = this.value + this.alpha * (target - this.value);
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}
