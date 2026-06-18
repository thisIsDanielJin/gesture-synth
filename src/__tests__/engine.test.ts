import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted to the top of the file; outer-scope vars
// aren't available to them. vi.hoisted() lets us share state safely.
const { ramps, startedSpy } = vi.hoisted(() => {
  const r = {
    filterFreq: vi.fn(),
    filterQ: vi.fn(),
    delayTime: vi.fn(),
    delayFeedback: vi.fn(),
    reverbWet: vi.fn(),
    volume: vi.fn(),
  };
  return { ramps: r, startedSpy: vi.fn(async () => {}) };
});

vi.mock('tone', () => {
  class FakeOsc {
    constructor(_opts: unknown) {}
    chain(..._dests: unknown[]) { return this; }
    start() {}
    stop() {}
    dispose() {}
  }
  class FakeFilter {
    frequency = { rampTo: ramps.filterFreq };
    Q = { rampTo: ramps.filterQ };
    constructor(_opts: unknown) {}
    dispose() {}
  }
  class FakeDelay {
    delayTime = { rampTo: ramps.delayTime };
    feedback = { rampTo: ramps.delayFeedback };
    constructor(_opts: unknown) {}
    dispose() {}
  }
  class FakeReverb {
    wet = { rampTo: ramps.reverbWet };
    constructor(_opts: unknown) {}
    dispose() {}
  }
  class FakeVolume {
    volume = { rampTo: ramps.volume };
    constructor(_db: number) {}
    dispose() {}
  }
  return {
    start: startedSpy,
    now: () => 0,
    getDestination: () => ({}),
    FatOscillator: FakeOsc,
    Filter: FakeFilter,
    FeedbackDelay: FakeDelay,
    Reverb: FakeReverb,
    Volume: FakeVolume,
  };
});

import { AudioEngine } from '../audio/engine';
import { DEFAULT_PARAMS } from '../audio/mappings';

describe('AudioEngine', () => {
  beforeEach(() => {
    Object.values(ramps).forEach((m) => m.mockClear());
    startedSpy.mockClear();
  });

  it('start() initializes Tone and start is idempotent', async () => {
    const e = new AudioEngine();
    expect(e.isStarted()).toBe(false);
    await e.start();
    expect(e.isStarted()).toBe(true);
    expect(startedSpy).toHaveBeenCalledTimes(1);
    await e.start(); // second call no-ops
    expect(startedSpy).toHaveBeenCalledTimes(1);
  });

  it('applyParams ramps every audio param', async () => {
    const e = new AudioEngine();
    await e.start();
    e.applyParams(DEFAULT_PARAMS);
    expect(ramps.filterFreq).toHaveBeenCalledWith(DEFAULT_PARAMS.cutoffHz, expect.any(Number), 0);
    expect(ramps.filterQ).toHaveBeenCalledWith(DEFAULT_PARAMS.resonance, expect.any(Number), 0);
    expect(ramps.delayTime).toHaveBeenCalledWith(DEFAULT_PARAMS.delayTimeSec, expect.any(Number), 0);
    expect(ramps.delayFeedback).toHaveBeenCalledWith(DEFAULT_PARAMS.delayFeedback, expect.any(Number), 0);
    expect(ramps.reverbWet).toHaveBeenCalledWith(DEFAULT_PARAMS.reverbWet, expect.any(Number), 0);
    expect(ramps.volume).toHaveBeenCalledWith(DEFAULT_PARAMS.volumeDb, expect.any(Number), 0);
  });

  it('mute overrides volume mapping with -60 dB', async () => {
    const e = new AudioEngine();
    await e.start();
    e.applyParams({ ...DEFAULT_PARAMS, muted: true, volumeDb: 0 });
    expect(ramps.volume).toHaveBeenLastCalledWith(-60, expect.any(Number), 0);
  });

  it('applyParams is a no-op before start()', () => {
    const e = new AudioEngine();
    e.applyParams(DEFAULT_PARAMS);
    expect(ramps.filterFreq).not.toHaveBeenCalled();
  });

  it('stop() releases resources and applyParams becomes a no-op again', async () => {
    const e = new AudioEngine();
    await e.start();
    e.stop();
    expect(e.isStarted()).toBe(false);
    Object.values(ramps).forEach((m) => m.mockClear());
    e.applyParams(DEFAULT_PARAMS);
    Object.values(ramps).forEach((m) => expect(m).not.toHaveBeenCalled());
  });
});
