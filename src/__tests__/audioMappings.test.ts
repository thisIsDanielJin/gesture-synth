import { describe, it, expect } from 'vitest';
import { paramsFromGesture, DEFAULT_PARAMS } from '../audio/mappings';
import type { HandState } from '../state/gestureStore';

const handAt = (x: number, y: number, pinch = 0, fist = false): HandState => ({
  landmarks: [],
  centroid: { x, y },
  pinch,
  fist,
});

describe('paramsFromGesture', () => {
  it('returns defaults when no hands are present', () => {
    expect(paramsFromGesture(null, null)).toEqual(DEFAULT_PARAMS);
  });

  it('left hand X drives cutoff: x=0 → low, x=1 → high', () => {
    const lo = paramsFromGesture(handAt(0, 0.5), null);
    const hi = paramsFromGesture(handAt(1, 0.5), null);
    expect(lo.cutoffHz).toBeLessThan(hi.cutoffHz);
    expect(lo.cutoffHz).toBeCloseTo(80, 0);
    expect(hi.cutoffHz).toBeCloseTo(12000, 0);
  });

  it('left hand Y inverted drives resonance: y=0 (top) → high res', () => {
    const top = paramsFromGesture(handAt(0.5, 0), null);
    const bot = paramsFromGesture(handAt(0.5, 1), null);
    expect(top.resonance).toBeGreaterThan(bot.resonance);
  });

  it('right hand X drives delay time, Y inverted drives feedback', () => {
    const slowLowFb = paramsFromGesture(null, handAt(0, 1));
    const fastHighFb = paramsFromGesture(null, handAt(1, 0));
    expect(slowLowFb.delayTimeSec).toBeLessThan(fastHighFb.delayTimeSec);
    expect(slowLowFb.delayFeedback).toBeLessThan(fastHighFb.delayFeedback);
  });

  it('left pinch drives reverb wet, right pinch drives volume', () => {
    const noPinch = paramsFromGesture(handAt(0.5, 0.5, 0), handAt(0.5, 0.5, 0));
    const fullPinch = paramsFromGesture(handAt(0.5, 0.5, 1), handAt(0.5, 0.5, 1));
    expect(fullPinch.reverbWet).toBeGreaterThan(noPinch.reverbWet);
    expect(fullPinch.volumeDb).toBeGreaterThan(noPinch.volumeDb);
  });

  it('fist on either hand mutes', () => {
    expect(paramsFromGesture(handAt(0.5, 0.5, 0, true), null).muted).toBe(true);
    expect(paramsFromGesture(null, handAt(0.5, 0.5, 0, true)).muted).toBe(true);
    expect(paramsFromGesture(handAt(0.5, 0.5, 0, false), null).muted).toBe(false);
  });

  it('missing hand holds previous params', () => {
    const seeded = { ...DEFAULT_PARAMS, cutoffHz: 5000, delayTimeSec: 0.5 };
    const next = paramsFromGesture(null, null, seeded);
    expect(next.cutoffHz).toBe(5000);
    expect(next.delayTimeSec).toBe(0.5);
  });
});
