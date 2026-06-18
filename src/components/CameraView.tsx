import { useRef, useCallback, useEffect } from 'react';
import { useHandTracking } from '../vision/useHandTracking';
import type { Hand } from '../utils/gestures';

const HAND_CONNECTIONS: Array<[number, number]> = [
  // thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // middle
  [5, 9], [9, 10], [10, 11], [11, 12],
  // ring
  [9, 13], [13, 14], [14, 15], [15, 16],
  // pinky
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

interface Props {
  enabled: boolean;
}

export function CameraView({ enabled }: Props) {
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

  // Separate rAF loop for drawing — keeps detection logic in the hook clean.
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
          drawHand(ctx, latestRef.current.left, '#6cf0c4', canvas.width, canvas.height);
          drawHand(ctx, latestRef.current.right, '#ff7ad9', canvas.width, canvas.height);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  return (
    <div className="camera-stage">
      <video ref={videoRef} muted playsInline />
      <canvas ref={canvasRef} />
    </div>
  );
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  hand: Hand | null,
  color: string,
  w: number,
  h: number,
): void {
  if (!hand) return;
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = hand[a];
    const pb = hand[b];
    if (!pa || !pb) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x * w, pa.y * h);
    ctx.lineTo(pb.x * w, pb.y * h);
    ctx.stroke();
  }
  for (const p of hand) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
