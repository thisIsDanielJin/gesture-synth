import { useEffect, useRef, useState } from 'react';
import { ALL_MODES } from '../modes';
import type { ModeId } from '../modes/types';

interface Props {
  current: ModeId;
  onChange: (id: ModeId) => void;
}

export function ModePicker({ current, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Keyboard 1..9 → switch mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = parseInt(e.key, 10) - 1;
      if (Number.isFinite(idx) && idx >= 0 && idx < ALL_MODES.length) {
        onChange(ALL_MODES[idx].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChange]);

  // Click outside closes.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const currentMode = ALL_MODES.find((m) => m.id === current) ?? ALL_MODES[0];

  return (
    <div className="mode-picker" ref={ref}>
      <button className="mode-pill" onClick={() => setOpen((o) => !o)}>
        <span className="mode-dot" /> {currentMode.name}
        <span className="mode-caret">▾</span>
      </button>
      {open && (
        <div className="mode-menu">
          {ALL_MODES.map((m, i) => {
            const active = m.id === current;
            return (
              <button
                key={m.id}
                className={`mode-item ${active ? 'active' : ''}`}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                <div className="mode-item-row">
                  <span className="mode-key">{i + 1}</span>
                  <span className="mode-name">{m.name}</span>
                </div>
                <div className="mode-hint">{m.hint}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
