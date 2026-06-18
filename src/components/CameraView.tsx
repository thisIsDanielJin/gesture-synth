import { useRef, useCallback, useEffect } from 'react';
import { useHandTracking } from '../vision/useHandTracking';
import type { Hand } from '../utils/gestures';
import type { HandState } from '../state/gestureStore';
import type { ModeDescriptor } from '../modes/types';
import {
  drawGlowSkeleton,
  DEFAULT_LEFT_COLOR,
  DEFAULT_RIGHT_COLOR,
} from '../utils/skeleton';

interface Props {
  enabled: boolean;
  mode: ModeDescriptor;
  /** Refs the overlay reads so it stays in sync with the live store. */
  leftRef: React.RefObject<HandState | null>;
  rightRef: React.RefObject<HandState | null>;
}

export function CameraView({ enabled, mode, leftRef, rightRef }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestRef = useRef<{ left: Hand | null; right: Hand | null }>({
    left: null,
    right: null,
  });

  const onFrame = useCallback(
    (frame: { leftLandmarks: Hand | null; rightLandmarks: Hand | null }) => {
      latestRef.current.left = frame.leftLandmarks;
      latestRef.current.right = frame.rightLandmarks;
    },
    [],
  );

  useHandTracking({ videoRef, onFrame, enabled });

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // Additive blend makes overlapping glows feel hot.
          ctx.globalCompositeOperation = 'lighter';

          // 1) Mode visualization underneath the skeleton.
          mode.drawOverlay({
            ctx,
            width: canvas.width,
            height: canvas.height,
            left: leftRef.current,
            right: rightRef.current,
          });

          // 2) Glowing hands on top, mirrored to match the camera flip.
          const colors = mode.handColors ?? {
            left: DEFAULT_LEFT_COLOR,
            right: DEFAULT_RIGHT_COLOR,
          };
          ctx.save();
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          const t = performance.now();
          drawGlowSkeleton({
            ctx,
            hand: latestRef.current.left,
            color: colors.left,
            width: canvas.width,
            height: canvas.height,
            timeMs: t,
            phaseOffset: 0,
          });
          drawGlowSkeleton({
            ctx,
            hand: latestRef.current.right,
            color: colors.right,
            width: canvas.width,
            height: canvas.height,
            timeMs: t,
            phaseOffset: Math.PI / 2,
          });
          ctx.restore();
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [enabled, mode, leftRef, rightRef]);

  return (
    <div className="camera-stage">
      <video ref={videoRef} muted playsInline />
      <canvas ref={canvasRef} />
    </div>
  );
}
