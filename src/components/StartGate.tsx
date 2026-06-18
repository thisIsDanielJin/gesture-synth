import type { ReactNode } from 'react';

interface Props {
  onStart: () => void;
}

export function StartGate({ onStart }: Props) {
  return (
    <div className="start-gate">
      <div className="start-gate-card">
        <h1>gesture-synth</h1>
        <p>
          A hand-tracked instrument. Switch modes from the dropdown in the
          top-right (or press <kbd>1</kbd>/<kbd>2</kbd>) to play different
          synths with the same hands.
        </p>
        <Modes />
        <button className="primary" onClick={onStart}>
          Start camera + audio
        </button>
      </div>
    </div>
  );
}

function Modes(): ReactNode {
  return (
    <ul className="start-modes">
      <li>
        <strong>Theremin</strong> — right hand height = pitch, pinch = volume.
      </li>
      <li>
        <strong>Pad Sculptor</strong> — both hands. Spread = chord brightness,
        pinch = shimmer, fist = freeze.
      </li>
      <li>
        <strong>Sequencer</strong> — 16-step techno bass loop. Hands sculpt
        cutoff, resonance, drive, tempo, delay, reverb. Right fist cycles
        patterns.
      </li>
      <li>
        <strong>Drum Machine</strong> — 16-step grid across 6 voices, 5
        preset grooves. Right hand: kick pitch, snare snap, low-pass
        filter. Left hand: tempo, hat brightness, reverb. Right fist
        cycles patterns.
      </li>
    </ul>
  );
}
