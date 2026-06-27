# Warpgrid — Roadmap

Warpgrid is built in phases. Each phase is independently useful and leaves the
app in a runnable state.

## Phase 0 — Scaffold ✅ (current)

- Vite + React + TS project, dark DAW-style single-page shell.
- Core tempo-map model + math (`core/tempoMap.ts`, `core/timeSignature.ts`) with unit tests.
- Import audio (decode + waveform peaks) and MIDI (parse) via drag-drop or picker.
- Canvas timeline: waveform / piano-roll, beat grid from the tempo map, click-to-add & drag-to-warp anchors, playhead.
- Tempo lane (BPM curve), status bar (bar.beat · tempo), audio playback, zoom/scroll.
- Undo/redo (project state).
- Export: MIDI (tempo + time-sig meta) and CSV tempo map. Reaper/Ableton writers stubbed.

## Phase 1 — Import & visualization

- Full waveform polish (multi-resolution peaks, stereo display).
- Proper MIDI piano-roll (velocity, per-track color, note labels).
- Smooth zoom/scroll, minimap, follow-playhead.
- MIDI playback (Tone.js) alongside audio.

## Phase 2 — Grid & manual correction (the core craft)

- Anchor editing UX: snapping, nudging, numeric tempo entry per segment.
- Ramp segments: exact linear-tempo integration in `beatToTime`/`timeToBeat`
  (Phase 0 is piecewise-constant only — see note in `core/tempoMap.ts`).
- Time-signature editor (insert/change at a bar; keyboard-driven).
- Multi-anchor selection, drag groups, undo/redo polish.

## Phase 3 — Assisted detection

- `audio/onsetDetection.ts`: spectral-flux onsets over an STFT with adaptive
  threshold + peak-picking.
- `audio/tempoEstimate.ts`: autocorrelation / inter-onset tempo tracking with
  octave-error handling; per-window estimates for drifting tempo.
- MIDI note-onset tempo inference.
- "Generate candidate anchors" → user accepts / nudges / deletes.

## Phase 4 — DAW project export

- MIDI: re-time an existing source MIDI's notes against the new tempo map
  (`midi/writeMidi.ts` currently emits a tempo-only conductor file).
- Reaper `.rpp`: real `<TEMPOENVEX>` points + time-signature markers; validate
  round-trip import.
- Ableton `.als`: build a real Live XML tree (master Tempo automation envelope),
  gzip via pako. **Needs a target Live version + a reference `.als` to align the
  schema** (schemas differ across versions).
- Generic CSV: already shipped in Phase 0.

## Phase 5 — Polish & performance

- Keyboard shortcut map + cheatsheet overlay.
- Move peak extraction and onset/tempo analysis to Web Workers.
- Optional heavier detection backend (essentia.js / aubio-wasm) behind the
  existing detection interfaces.
- Session save/load (serialize the project JSON).

---

### Known design notes

- **Beats are quarter-notes** (PPQ convention) everywhere; time signatures only
  change how beats group into bars, never a beat's length.
- **Undo history tracks `project` only** — importing media or scrolling is not
  undoable by design.
- **Ramp tempo** is modeled in the type system (`WarpAnchor.curve`) but mapped
  as constant in Phase 0; exact integration is Phase 2.
