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

## Phase 2 — Grid & manual correction (the core craft) ✅

- Selection: click / Shift-click / rubber-band; group drag preserves spacing.
- Snapping while dragging (to other anchors / playhead / origin); Ctrl bypasses.
- Keyboard: ←/→ nudge (Shift ×10), Delete, Ctrl+A, Esc, A (add at playhead),
  plus a `?` shortcuts overlay.
- Per-segment numeric tempo entry: double-click the tempo lane or use the
  Inspector; retunes one segment while keeping downstream tempos (exact times).
- Time-signature editor: add at the playhead bar, edit numerator/denominator,
  delete (bar-1 protected). Bar lines re-flow live.
- Inspector bar: contextual numeric editing of the selected anchor / segment /
  time signature (single page, no secondary screen).
- Undo/redo polish: a whole drag gesture collapses into one undo step
  (`pauseHistory`/`resumeHistory` around the gesture).

### Phase 2b — deferred

- True smooth **ramp** segments: exact linear-tempo (logarithmic) integration in
  `beatToTime`/`timeToBeat`, with explicit BPM markers so the curve is
  well-determined. Phase 0/2 keep the exact piecewise-constant model.
- Snapping to audio transients (needs onset detection — Phase 3).

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
