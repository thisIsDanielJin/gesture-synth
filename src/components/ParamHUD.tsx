import type { AudioParams } from '../audio/mappings';

interface KnobProps {
  label: string;
  value: string;
  /** 0..1 fraction of full scale, used to render the bar. */
  fraction: number;
}

function Knob({ label, value, fraction }: KnobProps) {
  const pct = `${Math.round(fraction * 100)}%`;
  return (
    <div className="knob">
      <div className="knob-label">{label}</div>
      <div className="knob-value">{value}</div>
      <div className="knob-bar">
        <div className="knob-bar-fill" style={{ ['--fill' as never]: pct }} />
      </div>
    </div>
  );
}

interface Props {
  params: AudioParams;
}

export function ParamHUD({ params }: Props) {
  // Each fraction maps to the same range used in mappings.ts.
  const cutoffFrac =
    Math.log(Math.max(params.cutoffHz, 1) / 80) / Math.log(12000 / 80);
  const resFrac = (params.resonance - 0.1) / (18 - 0.1);
  const delayFrac = (params.delayTimeSec - 0.05) / (0.8 - 0.05);
  const fbFrac = params.delayFeedback / 0.85;
  return (
    <div className="hud">
      <Knob label="Cutoff" value={`${Math.round(params.cutoffHz)} Hz`} fraction={cutoffFrac} />
      <Knob label="Resonance" value={params.resonance.toFixed(2)} fraction={resFrac} />
      <Knob label="Delay" value={`${(params.delayTimeSec * 1000).toFixed(0)} ms`} fraction={delayFrac} />
      <Knob label="Feedback" value={params.delayFeedback.toFixed(2)} fraction={fbFrac} />
    </div>
  );
}
