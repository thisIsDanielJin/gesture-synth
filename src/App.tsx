import { useEffect, useRef, useState } from 'react';
import { CameraView } from './components/CameraView';
import { ModePicker } from './components/ModePicker';
import { StartGate } from './components/StartGate';
import { useGestureStore } from './state/gestureStore';
import { ALL_MODES, DEFAULT_MODE_ID, MODES_BY_ID } from './modes';
import type { ModeEngine, ModeId } from './modes/types';
import type { HandState } from './state/gestureStore';

export default function App() {
  const [running, setRunning] = useState(false);
  const [modeId, setModeId] = useState<ModeId>(DEFAULT_MODE_ID);

  // Refs the visual overlay reads from (so it stays in sync with the engine).
  const leftRef = useRef<HandState | null>(null);
  const rightRef = useRef<HandState | null>(null);
  const engineRef = useRef<ModeEngine | null>(null);

  const handleStart = async () => {
    if (!engineRef.current) {
      engineRef.current = MODES_BY_ID[modeId].createEngine();
      await engineRef.current.start();
    }
    useGestureStore.getState().setRunning(true);
    setRunning(true);
  };

  // Mode swap: dispose previous, instantiate next, start it.
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    (async () => {
      engineRef.current?.dispose();
      engineRef.current = MODES_BY_ID[modeId].createEngine();
      await engineRef.current.start();
      if (cancelled) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modeId, running]);

  // Single store subscription drives the active engine + overlay refs.
  useEffect(() => {
    if (!running) return;
    const unsub = useGestureStore.subscribe((s) => {
      leftRef.current = s.left;
      rightRef.current = s.right;
      engineRef.current?.update(s.left, s.right);
    });
    return () => unsub();
  }, [running]);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const left = useGestureStore((s) => s.left);
  const right = useGestureStore((s) => s.right);
  const currentMode = MODES_BY_ID[modeId] ?? ALL_MODES[0];

  return (
    <div className="app-shell">
      <CameraView enabled={running} mode={currentMode} leftRef={leftRef} rightRef={rightRef} />

      {running && (
        <>
          <div className="status-bar">
            <span className={`pill ${left ? 'active' : ''}`}>L {left ? '●' : '○'}</span>
            <span className={`pill ${right ? 'active' : ''}`}>R {right ? '●' : '○'}</span>
          </div>
          <ModePicker current={modeId} onChange={setModeId} />
          <div className="mode-hint-bar">{currentMode.hint}</div>
        </>
      )}

      {!running && <StartGate onStart={handleStart} />}
    </div>
  );
}
