/**
 * Gesture detection on top of MediaPipe's 21-point hand-landmark model.
 *
 * Landmark index reference (MediaPipe HandLandmarker):
 *   0  = wrist
 *   4  = thumb tip
 *   5  = index MCP   (knuckle)
 *   8  = index tip
 *   9  = middle MCP
 *   12 = middle tip
 *   13 = ring MCP
 *   16 = ring tip
 *   17 = pinky MCP
 *   20 = pinky tip
 *
 * All landmarks are normalized to [0..1] in image space.
 */

import { clamp, dist } from './mapping';

export interface Landmark {
  x: number;
  y: number;
  z: number;
}
export type Hand = Landmark[]; // length 21

const TIP_MCP_PAIRS: Array<[number, number]> = [
  [8, 5],   // index
  [12, 9],  // middle
  [16, 13], // ring
  [20, 17], // pinky
];

/**
 * True when all four non-thumb fingertips are closer to the wrist than their
 * own MCP (knuckle) — i.e. the fingers are curled. Thumb is ignored because
 * its motion plane confuses simple distance heuristics.
 */
export function isFist(hand: Hand): boolean {
  if (!hand || hand.length < 21) return false;
  const wrist = hand[0];
  let curled = 0;
  for (const [tipIdx, mcpIdx] of TIP_MCP_PAIRS) {
    const tipToWrist = dist(hand[tipIdx], wrist);
    const mcpToWrist = dist(hand[mcpIdx], wrist);
    if (tipToWrist < mcpToWrist) curled += 1;
  }
  return curled >= 3; // at least 3 of 4 fingers curled
}

/**
 * Pinch amount: 0 = far apart, 1 = thumb-tip touching index-tip.
 * Normalized against the hand's index-MCP→wrist span so it doesn't depend on
 * how close the hand is to the camera.
 */
export function pinchAmount(hand: Hand): number {
  if (!hand || hand.length < 21) return 0;
  const span = dist(hand[5], hand[0]);
  if (span < 1e-6) return 0;
  const d = dist(hand[4], hand[8]);
  // d/span typically lives in roughly [0.1 .. 1.5]; map closed→open to 1→0.
  const ratio = d / span;
  return clamp(1 - linearize(ratio, 0.15, 1.0), 0, 1);
}

function linearize(x: number, lo: number, hi: number): number {
  return clamp((x - lo) / (hi - lo), 0, 1);
}

/** Centroid (x,y) of the whole hand — used for "where on screen is this hand". */
export function handCentroid(hand: Hand): { x: number; y: number } {
  if (!hand || hand.length === 0) return { x: 0.5, y: 0.5 };
  let sx = 0;
  let sy = 0;
  for (const p of hand) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / hand.length, y: sy / hand.length };
}
