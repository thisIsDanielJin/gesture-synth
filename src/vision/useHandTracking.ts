/**
 * Hook that wires camera → MediaPipe HandLandmarker → gesture store.
 *
 * Lifecycle:
 *   1. Caller passes a <video> ref.
 *   2. Hook requests `getUserMedia({ video })` and attaches the stream.
 *   3. Once the video has dimensions, it spins a rAF loop calling
 *      `landmarker.detectForVideo(...)` per frame.
 *   4. Detected hands are classified left/right and pushed to the store via
 *      the same Smoother instances frame-over-frame to keep audio jitter low.
 */

import { useEffect, useRef } from 'react';
import { getHandLandmarker } from './handLandmarker';
import { useGestureStore } from '../state/gestureStore';
import { handCentroid, isFist, pinchAmount } from '../utils/gestures';
import { Smoother } from '../utils/mapping';
import type { Hand } from '../utils/gestures';

export interface UseHandTrackingOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Called every frame with results so a canvas overlay can draw landmarks. */
  onFrame?: (frame: {
    leftLandmarks: Hand | null;
    rightLandmarks: Hand | null;
  }) => void;
  enabled: boolean;
}

interface HandSmoothers {
  cx: Smoother;
  cy: Smoother;
  pinch: Smoother;
}

const newSmoothers = (): HandSmoothers => ({
  cx: new Smoother(0.35),
  cy: new Smoother(0.35),
  pinch: new Smoother(0.4),
});

export function useHandTracking({
  videoRef,
  onFrame,
  enabled,
}: UseHandTrackingOptions): void {
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastTsRef = useRef<number>(-1);
  const leftSmoothRef = useRef<HandSmoothers>(newSmoothers());
  const rightSmoothRef = useRef<HandSmoothers>(newSmoothers());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      const video = videoRef.current;
      if (!video) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 1280, height: 720 },
        audio: false,
      });
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();

      const landmarker = await getHandLandmarker();
      if (cancelled) return;

      const setHand = useGestureStore.getState().setHand;

      const tick = () => {
        if (cancelled) return;
        const now = performance.now();
        if (video.readyState >= 2 && now !== lastTsRef.current) {
          lastTsRef.current = now;
          const result = landmarker.detectForVideo(video, now);

          let leftLandmarks: Hand | null = null;
          let rightLandmarks: Hand | null = null;

          for (let i = 0; i < (result.landmarks?.length ?? 0); i++) {
            const handed = result.handedness?.[i]?.[0]?.categoryName;
            const lm = result.landmarks[i] as Hand;
            // MediaPipe is mirrored vs the user's perspective when using the
            // front camera — its "Left" is the user's right hand and vice
            // versa. We mirror back so the user's *actual* left hand drives
            // the left-hand parameters.
            if (handed === 'Left') rightLandmarks = lm;
            else if (handed === 'Right') leftLandmarks = lm;
          }

          if (leftLandmarks) {
            const c = handCentroid(leftLandmarks);
            const sm = leftSmoothRef.current;
            // We see the camera mirrored on screen, so flip x for intuitive
            // "move left = parameter goes left" mapping.
            const mirroredX = 1 - c.x;
            setHand('left', {
              landmarks: leftLandmarks,
              centroid: { x: sm.cx.next(mirroredX), y: sm.cy.next(c.y) },
              pinch: sm.pinch.next(pinchAmount(leftLandmarks)),
              fist: isFist(leftLandmarks),
            });
          } else {
            leftSmoothRef.current = newSmoothers();
            setHand('left', null);
          }

          if (rightLandmarks) {
            const c = handCentroid(rightLandmarks);
            const sm = rightSmoothRef.current;
            const mirroredX = 1 - c.x;
            setHand('right', {
              landmarks: rightLandmarks,
              centroid: { x: sm.cx.next(mirroredX), y: sm.cy.next(c.y) },
              pinch: sm.pinch.next(pinchAmount(rightLandmarks)),
              fist: isFist(rightLandmarks),
            });
          } else {
            rightSmoothRef.current = newSmoothers();
            setHand('right', null);
          }

          onFrame?.({ leftLandmarks, rightLandmarks });
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    })().catch((err) => {
      console.error('[useHandTracking] failed to start', err);
    });

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const video = videoRef.current;
      if (video) video.srcObject = null;
      useGestureStore.getState().setHand('left', null);
      useGestureStore.getState().setHand('right', null);
    };
  }, [enabled, videoRef, onFrame]);
}
