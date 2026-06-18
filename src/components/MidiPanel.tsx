import { useEffect, useRef, useState } from 'react';
import {
  ensureMidi,
  isSupported,
  listOutputs,
  setOutput,
  getOutputId,
  setEnabled,
  isEnabled,
  subscribeMidi,
  startClock,
  stopClock,
  panic,
  type MidiDeviceInfo,
} from '../midi/out';
import * as Tone from 'tone';

interface Props {
  /** When the user toggles MIDI on, we make sure clock follows BPM. */
  bpm: number;
}

export function MidiPanel({ bpm }: Props) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabledState] = useState(isEnabled());
  const [outputs, setOutputs] = useState<MidiDeviceInfo[]>([]);
  const [outputId, setOutputIdState] = useState<string | null>(getOutputId());
  const [sendingClock, setSendingClock] = useState(false);
  const [supported] = useState(isSupported());
  const [available, setAvailable] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Subscribe to MIDI subsystem changes (devices added/removed).
  useEffect(() => {
    const refresh = () => {
      setOutputs(listOutputs());
      setOutputIdState(getOutputId());
      setEnabledState(isEnabled());
    };
    refresh();
    return subscribeMidi(refresh);
  }, []);

  // Click-outside to close menu.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  // When clock is enabled, start it; reflect bpm changes.
  useEffect(() => {
    if (sendingClock && enabled && outputId) {
      startClock(bpm);
    } else {
      stopClock();
    }
    return () => stopClock();
  }, [sendingClock, enabled, outputId, bpm]);

  const onToggle = async () => {
    if (!enabled) {
      const ok = await ensureMidi();
      setAvailable(ok);
      if (!ok) return;
      setEnabled(true);
      setEnabledState(true);
      setOutputs(listOutputs());
      // Auto-pick first device if none chosen.
      const ids = listOutputs();
      if (!getOutputId() && ids[0]) {
        setOutput(ids[0].id);
        setOutputIdState(ids[0].id);
      }
    } else {
      setEnabled(false);
      setEnabledState(false);
      panic();
    }
  };

  // Resume audio context when toggling — required for getUserMedia/Tone start.
  useEffect(() => {
    if (enabled && Tone.getContext().state !== 'running') {
      Tone.start();
    }
  }, [enabled]);

  if (!supported) {
    return (
      <div className="midi-panel">
        <button className="midi-pill disabled" title="Web MIDI is not supported in this browser">
          MIDI · n/a
        </button>
      </div>
    );
  }

  return (
    <div className="midi-panel" ref={ref}>
      <button
        className={`midi-pill ${enabled ? 'active' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`midi-dot ${enabled ? 'on' : ''}`} />
        MIDI{enabled ? ' on' : ''}
        <span className="midi-caret">▾</span>
      </button>
      {open && (
        <div className="midi-menu">
          <label className="midi-row">
            <span>Enabled</span>
            <input type="checkbox" checked={enabled} onChange={onToggle} />
          </label>
          <label className="midi-row">
            <span>Output</span>
            <select
              value={outputId ?? ''}
              disabled={!enabled || outputs.length === 0}
              onChange={(e) => {
                const id = e.target.value || null;
                setOutput(id);
                setOutputIdState(id);
              }}
            >
              {outputs.length === 0 && <option value="">(no devices)</option>}
              {outputs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="midi-row">
            <span>Send clock</span>
            <input
              type="checkbox"
              checked={sendingClock}
              disabled={!enabled || !outputId}
              onChange={(e) => setSendingClock(e.target.checked)}
            />
          </label>
          <div className="midi-hint">
            Channels: Theremin 1 · Pad 2 · Sequencer 3 · Drums 10. CC 74=cutoff,
            71=res, 76=drive, 91=delay, 93=reverb, 1=mod.
          </div>
          <button
            className="midi-panic"
            disabled={!enabled || !outputId}
            onClick={() => panic()}
            title="All notes off, all channels"
          >
            Panic
          </button>
          {available === false && (
            <div className="midi-error">Permission denied or no MIDI subsystem.</div>
          )}
        </div>
      )}
    </div>
  );
}
