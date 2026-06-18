/**
 * A Mode bundles three things behind one interface:
 *   - an AUDIO engine (Tone.js graph + setters)
 *   - a GESTURE → audio mapping (per-frame from store state)
 *   - a VISUAL overlay drawn on top of the camera feed
 *
 * Switching modes disposes the previous engine and instantiates the next one.
 * Each mode is responsible for being self-contained: no one else reaches into
 * its synth graph.
 */

import type { HandState } from '../state/gestureStore';

export interface ModeEngine {
  /** Called once on activation. Must be triggered from a user gesture so
   *  AudioContext.resume() succeeds. Idempotent. */
  start(): Promise<void>;

  /** Called every animation frame with current gesture state. */
  update(left: HandState | null, right: HandState | null): void;

  /** Called on deactivation — release nodes, stop oscillators, etc. */
  dispose(): void;
}

export interface ModeOverlayProps {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  left: HandState | null;
  right: HandState | null;
}

export interface ModeDescriptor {
  id: ModeId;
  name: string;
  hint: string;
  /** Factory — fresh engine per activation. */
  createEngine: () => ModeEngine;
  /** Pure draw, called every animation frame after the camera/skeleton layer. */
  drawOverlay: (props: ModeOverlayProps) => void;
}

export type ModeId = 'theremin' | 'padSculptor';
