import { useEffect, useRef, useState } from 'react';
import { CameraView } from './components/CameraView';
import { ParamHUD } from './components/ParamHUD';
import { StartGate } from './components/StartGate';
import { AudioEngine } from './audio/engine';
import { DEFAULT_PARAMS, paramsFromGesture } from './audio/mappings';
import type { AudioParams } from './audio/mappings';
import { useGestureStore } from './state/gestureStore';

export default function App() {
  const [running, setRunning] = useState(false);
  const [params, setParams] = useState<AudioParams>(DEFAULT_PARAMS);
  const engineRef = useRef<AudioEngine | null>(null);

  const handleStart = async () => {
    if (!engineRef.current) engineRef.current = new AudioEngine();
    await engineRef.current.start();
    useGestureStore.getState().setRunning(true);
    setRunning(true);
  };

  // Subscribe to store changes; recompute params; push to engine.
  useEffect(() => {
    if (!running) return;
    let prev: AudioParams = DEFAULT_PARAMS;
    const unsub = useGestureStore.subscribe((s) => {
      const next = paramsFromGesture(s.left, s.right, prev);
      prev = next;
      setParams(next);
      engineRef.current?.applyParams(next);
    });
    return () => unsub();
  }, [running]);

  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  const left = useGestureStore((s) => s.left);
  const right = useGestureStore((s) => s.right);

  return (
    <div className="app-shell">
      <CameraView enabled={running} />

      {running && (
        <>
          <div className="status-bar">
            <span className={`pill ${left ? 'active' : ''}`}>L {left ? '●' : '○'}</span>
            <span className={`pill ${right ? 'active' : ''}`}>R {right ? '●' : '○'}</span>
            {params.muted && <span className="pill muted">muted</span>}
          </div>
          <ParamHUD params={params} />
        </>
      )}

      {!running && <StartGate onStart={handleStart} />}
    </div>
  );
}
