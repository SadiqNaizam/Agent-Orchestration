# GuitarVision

An interactive guitar learning app with real-time mic-based chord detection, animated chord diagrams, a tab builder, and guided song lessons.

## Features

### 🎙️ Live Chord Detector
- Captures mic input with the Web Audio API
- Detects pitch using the **YIN algorithm** (avoids octave errors vs simple autocorrelation)
- Identifies played chords from a rolling note buffer
- Shows a live waveform, tuner needle (cents deviation), note history

### 🎸 Chord Library
- 20+ chords with full voicings: open chords, barre chords, 7ths, sus chords
- Animated SVG chord diagrams with finger numbers and barre indicators
- Search + filter by difficulty (Beginner / Intermediate / Advanced)

### 🎵 Tab Builder
- Click the interactive fretboard to place notes on any string/fret
- Multi-measure support with playback (animates through notes)
- Technique labels: hammer-on, pull-off, bend, slide, vibrato
- Export to ASCII tab notation (.txt)

### 📚 Learn Mode
- Guided lessons for classic songs (Knockin' on Heaven's Door, Smoke on the Water, Wish You Were Here, Hotel California)
- Animated fretboard highlights the next note during playback
- Chord progression display with interactive diagrams
- Practice tips per song

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS |
| Animation | Framer Motion |
| Audio | Web Audio API (native) |
| Pitch Detection | YIN algorithm (custom impl.) |
| Icons | Lucide React |

## Getting Started

```bash
cd guitar-vision
npm install
npm run dev
```

Open http://localhost:5173 — allow microphone access when prompted.

## Project Structure

```
guitar-vision/
├── src/
│   ├── components/
│   │   ├── ChordDetector/   # Mic → note → chord pipeline + UI
│   │   ├── ChordDiagram/    # SVG chord diagrams + library browser
│   │   ├── TabBuilder/      # Interactive tab editor + notation export
│   │   ├── Fretboard/       # Animated 6-string fretboard
│   │   ├── LearningMode/    # Song lessons with playback
│   │   ├── Navigation.tsx
│   │   └── HomePage.tsx
│   ├── hooks/
│   │   └── useAudioDetection.ts  # RAF loop driving pitch detection
│   ├── lib/
│   │   ├── pitchDetection.ts     # YIN algo + chord matching
│   │   └── audioEngine.ts        # AudioContext lifecycle manager
│   ├── data/
│   │   ├── chords.ts             # 20+ chord voicings
│   │   └── songs.ts              # Learning song library
│   └── types/index.ts
└── package.json
```

## How Chord Detection Works

1. **Mic capture** — `getUserMedia` → `MediaStreamAudioSourceNode` → `AnalyserNode`
2. **Time-domain buffer** — 4096-sample Float32 buffer pulled at ~60fps via `requestAnimationFrame`
3. **YIN pitch detection** — difference function → cumulative mean normalization → absolute threshold → parabolic interpolation
4. **Note mapping** — Hz → nearest semitone → `NoteName + octave + cents deviation`
5. **Chord matching** — rolling 20-frame note buffer → interval pattern matching against chord templates
6. **Confidence gating** — RMS < 0.01 → skip frame (silence rejection)

## Browser Support

Requires a browser with Web Audio API + `getUserMedia` (all modern browsers). HTTPS required for mic access in production.
