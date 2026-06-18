# gesture-synth

Browser web app that uses the laptop camera to track both hands and maps gestures to electronic-music synth parameters in real time. POC ships with an internal Tone.js synth so you can hear gestures change parameters with no external setup.

Built as a step toward driving **VCV Rack** and **Ableton** via Web MIDI from the same gesture stream.

## Gesture map

| Hand          | Gesture          | Parameter           | Range            |
|---------------|------------------|---------------------|------------------|
| Left          | move horizontal  | Filter cutoff       | 80 Hz – 12 kHz   |
| Left          | move vertical    | Filter resonance    | 0.1 – 18         |
| Left          | pinch            | Reverb wet          | 0 – 0.9          |
| Right         | move horizontal  | Delay time          | 50 ms – 800 ms   |
| Right         | move vertical    | Delay feedback      | 0 – 0.85         |
| Right         | pinch            | Master volume       | -30 dB – 0 dB    |
| Either        | closed fist      | Mute                | toggle           |

X axis is intuitive (move left = parameter goes left). Y axis is inverted so that hand-up = brighter / more.

## Run it

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, click **Start camera + audio**, allow the camera prompt. The first run downloads the MediaPipe hand-landmarker model (~6 MB) from the public CDN.

Use **Chrome / Edge** for the best `getUserMedia` + WebGL story. The synth chain uses Tone.js's default Web Audio output.

## Tests

```bash
npm test          # one-shot
npm run test:watch
npm run test:ui   # browser UI
```

Vitest + jsdom + Testing Library. Coverage:

- `mapping.test.ts` — `clamp / linMap / expMap / dist / Smoother`
- `gestures.test.ts` — `isFist / pinchAmount / handCentroid` against synthetic 21-point fixtures
- `audioMappings.test.ts` — gesture state → audio parameters
- `gestureStore.test.ts` — Zustand actions
- `engine.test.ts` — Tone.js mocked, verifies ramp targets and lifecycle

The MediaPipe + camera path is exercised manually in the browser, not in CI.

## Architecture

```
camera (getUserMedia)
   └─► HandLandmarker (MediaPipe, WASM+GPU)
          └─► useHandTracking() — emits {leftHand?, rightHand?} per frame
                 └─► gestureStore (Zustand) — smoothed normalized values
                        ├─► AudioEngine (Tone.js) — subscribes, drives params
                        └─► HUD overlays — knob meters, video + landmark draw
```

The store is the seam — replacing `AudioEngine` with a `MidiOutAdapter` later (next milestone) doesn't touch the vision code.

## Roadmap

- [ ] Web MIDI CC out adapter (Ableton, any DAW that listens to a virtual MIDI bus)
- [ ] VCV Rack via macOS IAC bus
- [ ] Gesture-to-CC mapping UI (drag a parameter, perform a gesture, save)
- [ ] Preset save / recall
- [ ] Mobile / touch fallback

## Stack

Vite • React 19 • TypeScript • MediaPipe Tasks Vision • Tone.js • Zustand • Vitest

## License

MIT
