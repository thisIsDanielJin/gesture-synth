/**
 * MIDI helpers: tests don't have a real Web MIDI device, so we exercise the
 * pure parts (channel/value clamping, throttle behavior) by using a fake
 * MIDIOutput stuck onto the singleton's internals via the public API.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Build a minimal MIDIAccess stub before importing the module so that
// requestMIDIAccess returns it.
const sentMessages: Array<{ data: number[]; t: number }> = [];

function fakeOutput(name = 'Fake'): MIDIOutput {
  return {
    id: 'fake-1',
    name,
    type: 'output',
    state: 'connected',
    connection: 'open',
    manufacturer: '',
    version: '',
    onstatechange: null,
    send(data: number[] | Uint8Array, t = 0) {
      sentMessages.push({ data: Array.from(data), t });
    },
    open() { return Promise.resolve(this as unknown as MIDIOutput); },
    close() { return Promise.resolve(this as unknown as MIDIOutput); },
    clear() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
  } as unknown as MIDIOutput;
}

beforeEach(() => {
  sentMessages.length = 0;
  vi.resetModules();
  const out = fakeOutput();
  const access = {
    outputs: new Map<string, MIDIOutput>([[out.id, out]]),
    onstatechange: null,
  };
  // @ts-expect-error inject for tests
  globalThis.navigator = globalThis.navigator ?? {};
  // @ts-expect-error inject for tests
  globalThis.navigator.requestMIDIAccess = () => Promise.resolve(access);
});

describe('midi/out', () => {
  it('sendCc clamps values to 0..127 and respects same-value throttle', async () => {
    const mod = await import('../midi/out');
    await mod.ensureMidi();
    mod.setOutput('fake-1');
    mod.setEnabled(true);

    mod.sendCc(1, 74, 50);
    mod.sendCc(1, 74, 50); // same value — should NOT send a second message

    // Wait past the time-based throttle so the next (different) value sends.
    await new Promise((r) => setTimeout(r, 30));
    mod.sendCc(1, 74, 200); // clamped to 127

    const ccs = sentMessages.filter((m) => (m.data[0] & 0xf0) === 0xb0);
    expect(ccs.length).toBe(2);
    expect(ccs[0].data).toEqual([0xb0, 74, 50]);
    expect(ccs[1].data).toEqual([0xb0, 74, 127]);
  });

  it('sendNoteOn/Off use 1-based channels and clamp velocity', async () => {
    const mod = await import('../midi/out');
    await mod.ensureMidi();
    mod.setOutput('fake-1');
    mod.setEnabled(true);

    mod.sendNoteOn(10, 60, 200);  // ch 10 → status 0x99; vel clamped to 127
    mod.sendNoteOff(10, 60);

    const notes = sentMessages.filter(
      (m) => (m.data[0] & 0xf0) === 0x90 || (m.data[0] & 0xf0) === 0x80,
    );
    expect(notes.length).toBe(2);
    expect(notes[0].data).toEqual([0x99, 60, 127]);
    expect(notes[1].data).toEqual([0x89, 60, 0]);
  });

  it('does nothing when disabled', async () => {
    const mod = await import('../midi/out');
    await mod.ensureMidi();
    mod.setOutput('fake-1');
    mod.setEnabled(false);

    mod.sendCc(1, 74, 50);
    mod.sendNoteOn(1, 60, 100);
    expect(sentMessages.length).toBe(0);
  });

  it('panic sends all-notes-off on every channel', async () => {
    const mod = await import('../midi/out');
    await mod.ensureMidi();
    mod.setOutput('fake-1');
    mod.setEnabled(true);
    mod.panic();
    const ccs = sentMessages.filter(
      (m) => (m.data[0] & 0xf0) === 0xb0 && m.data[1] === 123 && m.data[2] === 0,
    );
    expect(ccs.length).toBe(16);
  });
});
