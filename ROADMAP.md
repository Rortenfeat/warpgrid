# Warpgrid — Roadmap

Warpgrid is built in phases. Each phase is independently useful and leaves the
app in a runnable state.

## Phase 0 — Scaffold ✅

- Vite + React + TS project, single-page shell.
- Core tempo-map model + math (`core/tempoMap.ts`, `core/timeSignature.ts`) with unit tests.
- Import audio (decode + waveform peaks) and MIDI (parse) via drag-drop or picker.
- Canvas timeline: waveform / piano-roll, beat grid from the tempo map, click-to-add & drag-to-warp anchors, playhead.
- Tempo lane (BPM curve), status bar (bar.beat · tempo), audio playback, zoom/scroll.
- Undo/redo (project state).
- Export: MIDI (tempo + time-sig meta) and CSV tempo map. Reaper/Ableton writers stubbed.

## Phase 1 — Import & visualization ◐

- ✅ Waveform polish: multi-resolution peaks and stereo display.
- ◐ MIDI piano-roll: lightweight note display with velocity tinting is present;
  full per-track color, note labels, and piano-key affordances are deferred.
- ✅ Smooth zoom/scroll basics, minimap, and follow-playhead / centered-playhead
  viewport behavior.
- ✅ MIDI playback alongside audio via a lightweight Web Audio synth.

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

## Phase 2.5 — UX reset & warp editing model ✅

This phase aligns the product with the intended dedicated Warpgrid workflow,
instead of treating anchors as the only editable object.

- Visual design reset: light UI, white/near-white surfaces, black text, restrained
  accent colors, thin dividers, and less boxed-in paneling. Target a lighter,
  precise, Apple-like tool feel rather than the original dark DAW clone.
- Transport upgrade: complete playback controls, stable play/stop/seek behavior,
  and a centered-follow mode where the playhead can remain fixed in the middle of
  the viewport while the waveform/grid moves underneath it.
- Direct bar-line warping: dragging a bar line creates or updates a warp anchor on
  that line automatically. The user should not need to explicitly add an anchor
  before correcting the grid.
- Movable first bar line: bar 1 / beat 1 is no longer visually or behaviorally
  pinned to the left edge. It can be dragged earlier or later to match audio that
  does not start exactly on the downbeat.
- Anchor deletion shortcut: right-click an anchor to delete it.
- Ripple drag becomes the default: dragging an anchor or selected anchors moves
  downstream anchors with it, preserving the tempo after the moved anchor. This
  makes the edit change the previous segment without disturbing later musical
  timing.
- Non-ripple drag moves to Shift: hold Shift while dragging an anchor or selection
  to use the current isolated-drag behavior, where downstream anchors stay fixed.
- Multi-anchor drag follows the same rule: default drag ripples downstream anchors;
  Shift-drag edits only the selected anchors.
- Shortcuts overlay and README controls must be updated after the interaction
  change so the visible help matches the actual editing model.

## Phase 2.6 — Smooth tempo anchors ✅

- Smooth tempo is an anchor property, not a global segment type. If anchor N is
  marked smooth, the tempo between anchor N-1 and anchor N is interpolated
  smoothly; otherwise the segment remains piecewise-constant.
- Implement exact integration for smooth segments in `beatToTime`/`timeToBeat`
  while keeping constant segments exact and invertible.
- Surface the smooth flag in the Inspector and, if useful, as a compact inline
  affordance on selected anchors.

## Phase 3 — Assisted detection

- Snapping to audio transients.
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
- **Smooth tempo belongs to the destination anchor**: a smooth flag on anchor N
  affects the segment from anchor N-1 to anchor N.
