import { describe, it, expect, beforeEach } from 'vitest';
import { useGestureStore } from '../state/gestureStore';
import type { HandState } from '../state/gestureStore';

const sampleHand = (): HandState => ({
  landmarks: [],
  centroid: { x: 0.3, y: 0.7 },
  pinch: 0.4,
  fist: false,
});

describe('gestureStore', () => {
  beforeEach(() => {
    useGestureStore.getState().reset();
  });

  it('starts empty', () => {
    const s = useGestureStore.getState();
    expect(s.left).toBeNull();
    expect(s.right).toBeNull();
    expect(s.muted).toBe(false);
    expect(s.running).toBe(false);
  });

  it('setHand stores per-side state independently', () => {
    const h = sampleHand();
    useGestureStore.getState().setHand('left', h);
    expect(useGestureStore.getState().left).toEqual(h);
    expect(useGestureStore.getState().right).toBeNull();
  });

  it('setHand(null) clears the hand', () => {
    useGestureStore.getState().setHand('right', sampleHand());
    useGestureStore.getState().setHand('right', null);
    expect(useGestureStore.getState().right).toBeNull();
  });

  it('toggleMuted flips the mute flag', () => {
    useGestureStore.getState().toggleMuted();
    expect(useGestureStore.getState().muted).toBe(true);
    useGestureStore.getState().toggleMuted();
    expect(useGestureStore.getState().muted).toBe(false);
  });

  it('setRunning toggles the running flag', () => {
    useGestureStore.getState().setRunning(true);
    expect(useGestureStore.getState().running).toBe(true);
  });

  it('reset clears all state', () => {
    useGestureStore.getState().setHand('left', sampleHand());
    useGestureStore.getState().setMuted(true);
    useGestureStore.getState().setRunning(true);
    useGestureStore.getState().reset();
    const s = useGestureStore.getState();
    expect(s.left).toBeNull();
    expect(s.muted).toBe(false);
    expect(s.running).toBe(false);
  });
});
