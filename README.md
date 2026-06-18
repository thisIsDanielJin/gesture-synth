# gesture-synth

Browser web app that uses the laptop camera to track both hands and turns gestures into a real-time instrument. Multiple **modes** are bundled — each one is its own audio engine + gesture mapping + visualizer. Switch between them from the dropdown in the top-right (or press <kbd>1</kbd>/<kbd>2</kbd>).

Built as a step toward driving **VCV Rack** and **Ableton** via Web MIDI from the same gesture stream.

## Modes

### 🎻 Theremin

The classic. Right hand height = pitch, snapped to A-minor pentatonic across four octaves. Pinch right hand for volume. Left hand X drives a vibrato; pinch left fully to switch to free continuous pitch (no scale snap). Visual: glowing pitch line, scale ticks across the screen, halo on the active hand, sine ribbon on the vibrato hand.

### 🌫️ Pad Sculptor

Both hands shape a continuously evolving chord. **Distance between hands** crossfades through three voicings: close = tight cluster, medium = minor 9, wide = bright maj9 spread. **Average height** sets the octave. **Pinch** (either hand) brings up shimmer reverb + opens the filter. **Closed fist** freezes the chord so you can sculpt the texture without the chord moving. Visual: soft cloud bloom that grows with hand spread and shifts hue with chord brightness; dashed ring when frozen.

### 🔁 Sequencer

A circular 8-step loop runs as soon as you switch in. **Right hand** is a cursor: angle around the center picks one of 8 steps; distance from center picks the pitch (10-note A-minor pentatonic, two octaves). **Pinching** the right hand toggles the hovered step on/off; **closing it into a fist** clears every step. **Left hand**: X drives tempo (60–160 bpm), pinch sweeps the low-pass filter, fist mutes. Visual: glowing ring of 8 cells, white outline pulses on the playhead, ripples emit on triggered cells, magenta diamond highlights the hovered step.

## Run it

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, click **Start camera + audio**, allow the camera prompt. The first run downloads the MediaPipe hand-landmarker model (~6 MB) from the public CDN.

Use **Chrome / Edge** for the best `getUserMedia` + WebGL story.

## Tests

```bash
npm test
npm run test:watch
```

Vitest + jsdom + Testing Library. Coverage:

- `mapping.test.ts` — `clamp / linMap / expMap / dist / Smoother`
- `gestures.test.ts` — `isFist / pinchAmount / handCentroid` against synthetic 21-point fixtures
- `gestureStore.test.ts` — Zustand actions
- `theremin.test.ts` — scale spans, snapping, A4 = 440 Hz
- `padSculptor.test.ts` — voicing crossfade endpoints + monotonicity
- `sequencer.test.ts` — angle/radius cursor math, pinch threshold

The MediaPipe + camera path is exercised manually in the browser, not in CI.

## Architecture

```
camera (getUserMedia)
   └─► HandLandmarker (MediaPipe, WASM+GPU)
          └─► useHandTracking() — emits {leftHand?, rightHand?} per frame
                 └─► gestureStore (Zustand)
                        ├─► active ModeEngine (Tone.js graph)
                        └─► CameraView — calls mode.drawOverlay() each frame
```

Each mode implements `ModeDescriptor`:

```ts
interface ModeDescriptor {
  id: ModeId;
  name: string;
  hint: string;
  createEngine(): ModeEngine;          // Tone.js graph + start/update/dispose
  drawOverlay(props: ModeOverlayProps) // canvas viz drawn over the camera feed
}
```

Switching mode disposes the old engine and instantiates the new one. The store is the seam — replacing a `ModeEngine` with a `MidiOutAdapter` later doesn't touch the vision code.

## Roadmap

- [ ] More modes: Granular Stretcher, Drum Loom (multi-row sequencer)
- [ ] Web MIDI CC out adapter (Ableton, any DAW that listens to a virtual MIDI bus)
- [ ] VCV Rack via macOS IAC bus
- [ ] Per-mode parameter overrides (root, scale, voicing palette)
- [ ] Preset save / recall

## Stack

Vite • React 19 • TypeScript • MediaPipe Tasks Vision • Tone.js • Zustand • Vitest

## License

MIT
