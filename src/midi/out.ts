/**
 * Web MIDI output adapter.
 *
 * Goals:
 *  - Pick a single output device + listen for hot-plug.
 *  - Send note-on / note-off / CC / clock from any caller (modes, transport).
 *  - Throttle CCs so we don't flood — at most one value per (channel,cc) per
 *    frame's tick (~60 Hz). Tone schedules audio at hundreds of Hz; that's
 *    too fast for slow MIDI gear and DAWs choke.
 *  - Be a no-op when MIDI is disabled or unsupported (Safari, Firefox <108).
 *
 * Channels are 1-based in the public API, 0-based on the wire (per spec).
 */

export type MidiAccessLike = {
  outputs: Map<string, MIDIOutput>;
  onstatechange: ((e: MIDIConnectionEvent) => void) | null;
};

interface MidiState {
  access: MidiAccessLike | null;
  outputId: string | null;
  enabled: boolean;
  lastCcValue: Map<string, number>;
  lastCcSentAt: Map<string, number>;
  /** Subscribers to device list / settings changes (for the settings panel). */
  listeners: Set<() => void>;
  clockTimer: number | null;
  /** Cached BPM the clock loop is using. */
  clockBpm: number;
}

const state: MidiState = {
  access: null,
  outputId: null,
  enabled: false,
  lastCcValue: new Map(),
  lastCcSentAt: new Map(),
  listeners: new Set(),
  clockTimer: null,
  clockBpm: 120,
};

const CC_THROTTLE_MS = 16; // ~60 Hz max per (channel,cc).
const CLOCK_PPQ = 24;       // MIDI clock standard.

/** Subscribe to settings/device changes; returns unsubscribe. */
export function subscribeMidi(listener: () => void): () => void {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

function notify(): void {
  for (const l of state.listeners) l();
}

export interface MidiDeviceInfo {
  id: string;
  name: string;
}

export function isSupported(): boolean {
  return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
}

/** Idempotent — first call prompts the browser permission. */
export async function ensureMidi(): Promise<boolean> {
  if (state.access) return true;
  if (!isSupported()) return false;
  try {
    const access = await (navigator as unknown as {
      requestMIDIAccess: (opts: { sysex: boolean }) => Promise<MidiAccessLike>;
    }).requestMIDIAccess({ sysex: false });
    state.access = access;
    access.onstatechange = () => notify();
    notify();
    return true;
  } catch (err) {
    console.warn('[midi] requestMIDIAccess failed', err);
    return false;
  }
}

export function listOutputs(): MidiDeviceInfo[] {
  if (!state.access) return [];
  const out: MidiDeviceInfo[] = [];
  for (const dev of state.access.outputs.values()) {
    out.push({ id: dev.id, name: dev.name ?? '(unnamed)' });
  }
  return out;
}

export function setOutput(id: string | null): void {
  state.outputId = id;
  notify();
}

export function getOutputId(): string | null {
  return state.outputId;
}

export function setEnabled(enabled: boolean): void {
  state.enabled = enabled;
  if (!enabled) stopClock();
  notify();
}

export function isEnabled(): boolean {
  return state.enabled;
}

function output(): MIDIOutput | null {
  if (!state.enabled || !state.access || !state.outputId) return null;
  return state.access.outputs.get(state.outputId) ?? null;
}

/** Convert seconds-from-Tone to a `performance.now()`-aligned timestamp.
 *  We pass 0 = "send immediately"; Tone's default lookahead (~100ms) means
 *  most DAWs receive these in time. For tight MIDI sync, prefer MIDI clock. */
function toMidiTime(_timeSec?: number): number {
  return 0;
}

export function sendNoteOn(channel: number, note: number, velocity: number, timeSec?: number): void {
  const o = output();
  if (!o) return;
  const ch = clampCh(channel);
  o.send([0x90 | ch, clamp7(note), clamp7(velocity)], toMidiTime(timeSec));
}

export function sendNoteOff(channel: number, note: number, timeSec?: number): void {
  const o = output();
  if (!o) return;
  const ch = clampCh(channel);
  o.send([0x80 | ch, clamp7(note), 0], toMidiTime(timeSec));
}

/** Throttled CC. Drops same-value-as-last and same-ms-as-last sends. */
export function sendCc(channel: number, cc: number, value0to127: number): void {
  const o = output();
  if (!o) return;
  const ch = clampCh(channel);
  const v = clamp7(Math.round(value0to127));
  const key = `${ch}:${cc}`;
  if (state.lastCcValue.get(key) === v) return;
  const nowMs = performance.now();
  if ((state.lastCcSentAt.get(key) ?? 0) > nowMs - CC_THROTTLE_MS) return;
  state.lastCcValue.set(key, v);
  state.lastCcSentAt.set(key, nowMs);
  o.send([0xb0 | ch, cc, v]);
}

/** All-notes-off across every channel — cleanup when modes dispose. */
export function panic(): void {
  const o = output();
  if (!o) return;
  for (let ch = 0; ch < 16; ch++) o.send([0xb0 | ch, 123, 0]);
}

// ---- MIDI clock ----

export function startClock(bpm: number): void {
  state.clockBpm = bpm;
  if (state.clockTimer !== null) return;
  if (!output()) return;
  // 24 ticks per quarter note. interval ms = 60000 / bpm / 24.
  const tick = () => {
    const o = output();
    if (o) o.send([0xf8]);
  };
  // Send Start once.
  output()?.send([0xfa]);
  const period = 60000 / state.clockBpm / CLOCK_PPQ;
  state.clockTimer = window.setInterval(tick, period);
}

export function setClockBpm(bpm: number): void {
  if (state.clockBpm === bpm) return;
  state.clockBpm = bpm;
  if (state.clockTimer === null) return;
  window.clearInterval(state.clockTimer);
  state.clockTimer = null;
  startClock(bpm);
}

export function stopClock(): void {
  if (state.clockTimer !== null) {
    window.clearInterval(state.clockTimer);
    state.clockTimer = null;
    output()?.send([0xfc]);
  }
}

// ---- helpers ----

function clamp7(v: number): number {
  return Math.max(0, Math.min(127, Math.round(v)));
}
function clampCh(ch1Based: number): number {
  // Public API is 1-based; bytes need 0-based.
  return Math.max(0, Math.min(15, Math.round(ch1Based) - 1));
}
