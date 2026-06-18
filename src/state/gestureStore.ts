import { create } from 'zustand';
import type { Hand } from '../utils/gestures';

export interface HandState {
  landmarks: Hand;
  centroid: { x: number; y: number };
  pinch: number;       // [0..1]
  fist: boolean;
}

interface GestureStore {
  left: HandState | null;
  right: HandState | null;
  muted: boolean;
  running: boolean;

  setHand: (which: 'left' | 'right', state: HandState | null) => void;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
  setRunning: (running: boolean) => void;
  reset: () => void;
}

export const useGestureStore = create<GestureStore>((set) => ({
  left: null,
  right: null,
  muted: false,
  running: false,

  setHand: (which, state) =>
    set((s) => (which === 'left' ? { ...s, left: state } : { ...s, right: state })),
  setMuted: (muted) => set({ muted }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setRunning: (running) => set({ running }),
  reset: () => set({ left: null, right: null, muted: false, running: false }),
}));

/** Lightweight selectors so subscribers only re-render on what they need. */
export const selectLeft = (s: GestureStore) => s.left;
export const selectRight = (s: GestureStore) => s.right;
export const selectMuted = (s: GestureStore) => s.muted;
export const selectRunning = (s: GestureStore) => s.running;
