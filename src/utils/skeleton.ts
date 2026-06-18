/**
 * Glowing energy-style hand skeleton.
 *
 * Each bone is rendered as multiple passes with increasing line widths and
 * decreasing alpha to fake an HDR bloom — cheap, runs at 60 fps, looks much
 * better than a flat polyline. Fingertips get a pulsing halo whose phase is
 * driven by `performance.now()` so each hand breathes slightly.
 */

import type { Hand } from './gestures';

export interface DrawSkeletonOpts {
  ctx: CanvasRenderingContext2D;
  hand: Hand | null;
  /** Hex color string (#rrggbb or #rrggbbaa) used as the hand's energy color. */
  color: string;
  width: number;
  height: number;
  /** Monotonic time in ms — used to phase the fingertip pulse. */
  timeMs: number;
  /** Phase offset to keep two hands out of sync. */
  phaseOffset?: number;
}

const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const FINGERTIPS: readonly number[] = [4, 8, 12, 16, 20];

/** Bone glow passes — outer halo first, then crisp core last. */
const GLOW_PASSES: ReadonlyArray<{ widthMul: number; alpha: number; blur: number }> = [
  { widthMul: 6, alpha: 0.08, blur: 18 },
  { widthMul: 3, alpha: 0.22, blur: 8 },
  { widthMul: 1.4, alpha: 0.6, blur: 0 },
  { widthMul: 0.6, alpha: 1, blur: 0 },
];

/** Convert "#rrggbb" → "rgba(r,g,b,a)" with the supplied alpha. */
function toRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function drawGlowSkeleton({
  ctx,
  hand,
  color,
  width,
  height,
  timeMs,
  phaseOffset = 0,
}: DrawSkeletonOpts): void {
  if (!hand) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Bones — multi-pass glow.
  for (const pass of GLOW_PASSES) {
    ctx.lineWidth = 2.5 * pass.widthMul;
    ctx.strokeStyle = toRgba(color, pass.alpha);
    ctx.shadowBlur = pass.blur;
    ctx.shadowColor = pass.blur > 0 ? color : 'transparent';
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = hand[a];
      const pb = hand[b];
      if (!pa || !pb) continue;
      ctx.moveTo(pa.x * width, pa.y * height);
      ctx.lineTo(pb.x * width, pb.y * height);
    }
    ctx.stroke();
  }

  // Joint dots — small bright cores with halo.
  ctx.shadowBlur = 0;
  for (let i = 0; i < hand.length; i++) {
    const p = hand[i];
    const x = p.x * width;
    const y = p.y * height;
    const halo = ctx.createRadialGradient(x, y, 0, x, y, 8);
    halo.addColorStop(0, toRgba(color, 0.95));
    halo.addColorStop(1, toRgba(color, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pulsing fingertip halos.
  const t = timeMs * 0.001;
  for (const tipIdx of FINGERTIPS) {
    const p = hand[tipIdx];
    if (!p) continue;
    const x = p.x * width;
    const y = p.y * height;
    // Each fingertip has its own phase so the pulse looks organic.
    const phase = t * 2.4 + tipIdx * 0.31 + phaseOffset;
    const pulse = 0.5 + 0.5 * Math.sin(phase);
    const r = 14 + pulse * 14;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, toRgba(color, 0.55 * pulse + 0.2));
    grad.addColorStop(0.5, toRgba(color, 0.18 * pulse));
    grad.addColorStop(1, toRgba(color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** Default per-hand colors. Modes may pass overrides. */
export const DEFAULT_LEFT_COLOR = '#6cf0c4';   // teal
export const DEFAULT_RIGHT_COLOR = '#ff7ad9';  // magenta
