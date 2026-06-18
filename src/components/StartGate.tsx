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
        <strong>Sequencer</strong> — circular 8-step loop. Right hand picks a
        step, pinch toggles it; left hand sets tempo + filter.
      </li>
    </ul>
  );
}
