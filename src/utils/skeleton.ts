/**
 * Simple line + dot hand skeleton.
 *
 * Draws the 21-point MediaPipe skeleton as plain colored lines with small
 * solid dots at each joint. The video is mirrored by CSS but the canvas is
 * NOT — so we mirror x ourselves here so the skeleton lands on the visible
 * (mirrored) hand.
 */

import type { Hand } from './gestures';

export interface DrawSkeletonOpts {
  ctx: CanvasRenderingContext2D;
  hand: Hand | null;
  /** Hex color string (#rrggbb). */
  color: string;
  width: number;
  height: number;
}

const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export function drawSkeleton({
  ctx,
  hand,
  color,
  width,
  height,
}: DrawSkeletonOpts): void {
  if (!hand) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  // Bones.
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = hand[a];
    const pb = hand[b];
    if (!pa || !pb) continue;
    ctx.moveTo((1 - pa.x) * width, pa.y * height);
    ctx.lineTo((1 - pb.x) * width, pb.y * height);
  }
  ctx.stroke();

  // Joint dots.
  for (const p of hand) {
    ctx.beginPath();
    ctx.arc((1 - p.x) * width, p.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export const DEFAULT_LEFT_COLOR = '#6cf0c4';
export const DEFAULT_RIGHT_COLOR = '#ff7ad9';
