# gesture-synth

Browser web app that uses the laptop camera to track both hands and turns gestures into a real-time instrument. Multiple **modes** are bundled — each one is its own audio engine + gesture mapping + visualizer. Switch between them from the dropdown in the top-right (or press <kbd>1</kbd>/<kbd>2</kbd>).

Built as a step toward driving **VCV Rack** and **Ableton** via Web MIDI from the same gesture stream.

## Modes

### 🎻 Theremin

The classic. Right hand height = pitch, snapped to A-minor pentatonic across four octaves. Pinch right hand for volume. Left hand X drives a vibrato; pinch left fully to switch to free continuous pitch (no scale snap). Visual: glowing pitch line, scale ticks across the screen, halo on the active hand, sine ribbon on the vibrato hand.

### 🌫️ Pad Sculptor

Both hands shape a continuously evolving chord. **Distance between hands** crossfades through three voicings: close = tight cluster, medium = minor 9, wide = bright maj9 spread. **Average height** sets the octave. **Pinch** (either hand) brings up shimmer reverb + opens the filter. **Closed fist** freezes the chord so you can sculpt the texture without the chord moving. Visual: soft cloud bloom that grows with hand spread and shifts hue with chord brightness; dashed ring when frozen.

### 🥁 Drum Machine

A 16-step × 6-voice synthesized drum machine (kick, snare, clap, closed hat, open hat, tom — all generated, no samples). Five preset grooves ship in: **House, Techno, Breaks, Halftime, TwoStep**. Hands sculpt the kit, not the steps:

- **Right hand**: X = kick pitch, Y = snare snap, pinch = master high-pass filter (20 Hz – 4 kHz with a touch of resonance — pinching cuts the lows out for the classic "filter sweep into the drop"), fist = next pattern.
- **Left hand**: X = tempo, Y = hat brightness (closed + open), pinch = reverb, fist = mute.

Visual: 6-row grid showing every voice's hits with the playhead column pulsing white; live meters for kick pitch, snare snap, high-pass cutoff in the top-left.

## MIDI out (Ableton, VCV Rack, hardware…)

Click the **MIDI** pill in the top-right, allow the browser permission, pick your device, optionally enable **Send clock**. Local Tone.js audio still plays — your DAW receives the same thing.

Per-mode MIDI channels (configurable in code, `src/midi/mapping.ts`):

| Mode         | Channel | Notes / CCs                                                                |
|--------------|---------|----------------------------------------------------------------------------|
| Theremin     | 1       | Held note tracks pitch; CC 11 = expression (volume), CC 1 = mod (vibrato). |
| Pad Sculptor | 2       | Chord notes retrigger on change; CC 74 / 93 = filter / reverb.             |
| Sequencer    | 3       | Pattern notes; CC 74 / 71 / 76 = cutoff / res / drive; CC 91 / 93 = delay / reverb. |
| Drum Machine | 10      | GM drum map (kick = C1 / 36, snare = D1 / 38, etc.); CC 74 = master HPF cutoff. |

CCs follow the conventional MIDI spec where possible (74 = cutoff, 71 = resonance, 91 = delay, 93 = reverb, 1 = mod, 11 = expression) so factory templates often "just work". CCs are throttled to ~60 Hz to avoid flooding slow gear.

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
- `sequencer.test.ts` — pattern shape, midiToFreq
- `drumMachine.test.ts` — pattern shape, GM drum note mapping
- `midiOut.test.ts` — Web MIDI helpers: clamp, channel, throttle, panic

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

- [ ] Master shared transport so multiple modes can layer
- [ ] Audio-reactive background + hand motion trails
- [ ] Live looper (bar-quantized capture, layer up to 4 loops)
- [ ] Key / scale picker shared across modes
- [ ] OSC over WebSocket for native VCV Rack integration
- [ ] Per-mode parameter overrides (root, scale, voicing palette)
- [ ] Preset save / recall (localStorage)

## Stack

Vite • React 19 • TypeScript • MediaPipe Tasks Vision • Tone.js • Zustand • Vitest

## License

MIT
