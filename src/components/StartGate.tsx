interface Props {
  onStart: () => void;
}

export function StartGate({ onStart }: Props) {
  return (
    <div className="start-gate">
      <div className="start-gate-card">
        <h1>gesture-synth</h1>
        <p>
          Hand-tracked controller for an internal Tone.js synth.
          <br />
          Left hand → filter (X = cutoff, Y = resonance), pinch = reverb wet.
          <br />
          Right hand → delay (X = time, Y = feedback), pinch = volume.
          <br />
          Make a fist with either hand to mute.
        </p>
        <button className="primary" onClick={onStart}>
          Start camera + audio
        </button>
      </div>
    </div>
  );
}
