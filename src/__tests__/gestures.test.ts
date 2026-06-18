import { describe, it, expect } from 'vitest';
import { isFist, pinchAmount, handCentroid, type Hand } from '../utils/gestures';

/** Build a 21-point hand fixture by spreading points along a synthetic skeleton. */
function makeHand(spec: { open: boolean; pinch: 'open' | 'closed' }): Hand {
  // Wrist at (0.5, 0.9). Knuckles in a row above. Tips either above (open) or
  // pulled back down toward the wrist (closed/fist).
  const wrist = { x: 0.5, y: 0.9, z: 0 };
  const mcps = [
    { x: 0.42, y: 0.7, z: 0 }, // index   (5)
    { x: 0.48, y: 0.68, z: 0 }, // middle (9)
    { x: 0.54, y: 0.7, z: 0 }, // ring   (13)
    { x: 0.6, y: 0.74, z: 0 }, // pinky  (17)
  ];

  // Tip direction: open = further up (smaller y), fist = below MCP toward wrist (larger y).
  const tipOffsetY = spec.open ? -0.18 : 0.12;
  const tips = mcps.map((m) => ({ x: m.x, y: m.y + tipOffsetY, z: 0 }));

  // Build the full 21-point array following MediaPipe's index order.
  const hand: Hand = new Array(21).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));
  hand[0] = wrist;

  // Thumb (1..4).
  // For pinch: thumb tip near or far from index tip.
  const indexTip = tips[0];
  const thumbTip =
    spec.pinch === 'closed'
      ? { x: indexTip.x + 0.005, y: indexTip.y + 0.005, z: 0 }
      : { x: 0.3, y: 0.65, z: 0 };
  hand[1] = { x: 0.4, y: 0.85, z: 0 };
  hand[2] = { x: 0.36, y: 0.78, z: 0 };
  hand[3] = { x: 0.33, y: 0.72, z: 0 };
  hand[4] = thumbTip;

  // Index 5..8
  hand[5] = mcps[0];
  hand[6] = { x: mcps[0].x, y: mcps[0].y + tipOffsetY * 0.33, z: 0 };
  hand[7] = { x: mcps[0].x, y: mcps[0].y + tipOffsetY * 0.66, z: 0 };
  hand[8] = tips[0];

  // Middle 9..12
  hand[9] = mcps[1];
  hand[10] = { x: mcps[1].x, y: mcps[1].y + tipOffsetY * 0.33, z: 0 };
  hand[11] = { x: mcps[1].x, y: mcps[1].y + tipOffsetY * 0.66, z: 0 };
  hand[12] = tips[1];

  // Ring 13..16
  hand[13] = mcps[2];
  hand[14] = { x: mcps[2].x, y: mcps[2].y + tipOffsetY * 0.33, z: 0 };
  hand[15] = { x: mcps[2].x, y: mcps[2].y + tipOffsetY * 0.66, z: 0 };
  hand[16] = tips[2];

  // Pinky 17..20
  hand[17] = mcps[3];
  hand[18] = { x: mcps[3].x, y: mcps[3].y + tipOffsetY * 0.33, z: 0 };
  hand[19] = { x: mcps[3].x, y: mcps[3].y + tipOffsetY * 0.66, z: 0 };
  hand[20] = tips[3];

  return hand;
}

describe('isFist', () => {
  it('is false for an open palm', () => {
    expect(isFist(makeHand({ open: true, pinch: 'open' }))).toBe(false);
  });

  it('is true when fingertips curl toward the wrist', () => {
    expect(isFist(makeHand({ open: false, pinch: 'open' }))).toBe(true);
  });

  it('returns false for invalid input', () => {
    expect(isFist([] as Hand)).toBe(false);
  });
});

describe('pinchAmount', () => {
  it('approaches 1 when thumb tip touches index tip', () => {
    const hand = makeHand({ open: true, pinch: 'closed' });
    expect(pinchAmount(hand)).toBeGreaterThan(0.9);
  });

  it('approaches 0 when thumb is far from index', () => {
    const hand = makeHand({ open: true, pinch: 'open' });
    expect(pinchAmount(hand)).toBeLessThan(0.4);
  });

  it('is zero on empty input', () => {
    expect(pinchAmount([] as Hand)).toBe(0);
  });
});

describe('handCentroid', () => {
  it('falls back to (0.5, 0.5) on empty input', () => {
    expect(handCentroid([])).toEqual({ x: 0.5, y: 0.5 });
  });

  it('averages all points', () => {
    const hand: Hand = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
    ];
    const c = handCentroid(hand);
    expect(c.x).toBeCloseTo(0.5);
    expect(c.y).toBeCloseTo(0.5);
  });
});
