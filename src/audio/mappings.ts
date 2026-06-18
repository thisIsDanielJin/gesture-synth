/**
 * Pure gesture-state → audio-parameter mappings.
 *
 * Mapping spec (from POC clarifying questions):
 *   left  hand X (0..1) → filter cutoff   (80 Hz .. 12 kHz, exponential)
 *   left  hand Y (0..1) → filter resonance (0.1 .. 18, linear; Y inverted so up = brighter)
 *   right hand X (0..1) → delay time      (0.05 .. 0.8 s,  linear)
 *   right hand Y (0..1) → delay feedback  (0.0 .. 0.85,    linear; Y inverted)
 *   left  pinch  (0..1) → reverb wet      (0.0 .. 0.9,     linear)
 *   right pinch  (0..1) → master volume   (-30 dB .. 0 dB, linear)
 *   either fist         → muted
 */

import { expMap, linMap } from '../utils/mapping';
import type { HandState } from '../state/gestureStore';

export interface AudioParams {
  cutoffHz: number;
  resonance: number;
  delayTimeSec: number;
  delayFeedback: number;
  reverbWet: number;
  volumeDb: number;
  muted: boolean;
}

export const DEFAULT_PARAMS: AudioParams = {
  cutoffHz: 800,
  resonance: 1,
  delayTimeSec: 0.25,
  delayFeedback: 0.3,
  reverbWet: 0.2,
  volumeDb: -12,
  muted: false,
};

/**
 * Compute target params given current hand state. When a hand is missing, that
 * hand's params hold at their previous value (passed in as `prev`) — so losing
 * tracking for a frame doesn't slam the filter shut.
 */
export function paramsFromGesture(
  left: HandState | null,
  right: HandState | null,
  prev: AudioParams = DEFAULT_PARAMS,
): AudioParams {
  const next: AudioParams = { ...prev };

  if (left) {
    next.cutoffHz = expMap(left.centroid.x, 0, 1, 80, 12000);
    // Y is 0 at top of frame, 1 at bottom — invert so "hand higher" = more resonance.
    next.resonance = linMap(1 - left.centroid.y, 0, 1, 0.1, 18);
    next.reverbWet = linMap(left.pinch, 0, 1, 0, 0.9);
  }

  if (right) {
    next.delayTimeSec = linMap(right.centroid.x, 0, 1, 0.05, 0.8);
    next.delayFeedback = linMap(1 - right.centroid.y, 0, 1, 0, 0.85);
    next.volumeDb = linMap(right.pinch, 0, 1, -30, 0);
  }

  next.muted = Boolean(left?.fist) || Boolean(right?.fist);

  return next;
}
