# Warpgrid

**Bend a rigid DAW grid to match the flowing tempo of a human performance.**

When you record or capture a MIDI take, the tempo is rarely constant — it breathes with the player. A DAW's fixed-tempo bar lines then drift out of alignment with the audio. Some DAWs solve this (Ableton warp markers, Logic beat mapping, Cubase tempo detection), but not all do it conveniently. **Warpgrid** is a focused, single-page web tool that does exactly two things well:

1. **Detect** the tempo of an imported audio/MIDI clip and turn it into a tempo map (assisted — you stay in control).
2. **Warp** the grid by hand: drag grid lines onto the beats you hear, and Warpgrid back-solves the tempo and bar lines for you.

Then **export** a tempo map as MIDI (with tempo + time-signature meta) or a DAW project file (Reaper, Ableton) and drop it into your session.

> Single page, no secondary screens. Built for PC/laptop with keyboard + mouse.
> The UI is now moving toward a light, precise, Apple-like tool feel rather than
> a dark DAW clone.

---

## Status

**Phase 1 partial + Phase 2.5 UX reset.** The current build has polished
waveform rendering with stereo/multi-resolution peaks, a minimap, MIDI playback
via a lightweight Web Audio synth, and the manual correction workflow: light UI,
centered-playhead follow mode, direct bar-line dragging that automatically
creates anchors, ripple drag by default, right-click deletion, snapping,
keyboard nudging, numeric segment BPM editing, time-signature editing,
anchor-level smooth tempo, contextual Inspector, and single-step undo for drag
gestures. Full MIDI piano-roll polish, detection, and full DAW-project export
remain stubbed or deferred. See [ROADMAP.md](./ROADMAP.md).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # core tempo-map unit tests (Vitest)
npm run build      # type-check + production build
```

## How it works

The whole app revolves around a **tempo map**: a bidirectional mapping between
musical time (quarter-note beats) and real time (seconds), defined entirely by
**warp anchors** — points that pin a beat to a moment in the audio. Between
anchors the tempo is exact and invertible: most segments are piecewise-constant,
while anchors marked smooth use an exact linear-BPM ramp from the previous
anchor into that anchor. Everything else (bar lines, the tempo curve, the
export) is derived from the anchors plus time-signature changes.

```
 Import (audio / MIDI)
        │  decode → AudioBuffer / parse → Midi
        ▼
 Runtime media registry ──┐
        │                 │ (peaks, parsed notes — not undoable)
        ▼                 │
Warp anchors  ◄── drag bar lines / anchors (Timeline canvas)
        │
        ▼  core/tempoMap.ts  (beat ↔ time, segment BPM)
 Tempo map  ──►  TempoLane (curve)  ·  StatusBar (bar.beat · bpm)
        │
        ▼  export/*
 MIDI · Reaper .rpp · Ableton .als · CSV
```

### Architecture

| Layer | Location | Responsibility |
|---|---|---|
| Core model | `src/core/` | `types.ts`, `tempoMap.ts` (beat↔time math), `timeSignature.ts` |
| State | `src/state/useProjectStore.ts` | Zustand + immer; undo/redo via zundo (project only) |
| Audio | `src/audio/` | `decode`, `peaks`, `onsetDetection`*, `tempoEstimate`* |
| MIDI | `src/midi/` | `parseMidi`, `writeMidi` |
| Export | `src/export/` | `exportMidi`, `exportReaper`*, `exportAbleton`*, `exportTempoMap` |
| UI | `src/components/` | Toolbar · Timeline · TempoLane · TransportBar · StatusBar · ImportDropzone · ExportPanel |

`*` = interface defined, implementation lands in a later phase.

## Controls

| Action | Input |
|---|---|
| Import | Drag a file onto the window, or **Import…** |
| Add warp anchor | Drag a bar line; the line becomes an anchor automatically |
| Warp bar line | Drag a bar line directly |
| Warp anchor | Default: drag an anchor and downstream anchors move with it |
| Isolated anchor drag | Hold **Shift** while dragging to keep downstream anchors fixed |
| Snapping bypass | Hold **Ctrl** while dragging |
| Select | Click an anchor · **Shift+Click** to multi-select · drag a box to rubber-band |
| Nudge selection | **← / →** (hold **Shift** for ×10) |
| Delete anchor | Right-click an anchor, or select + **Delete** |
| Seek | When **Center** is off, click the timeline to move the playhead |
| Pan viewport | Hold the middle mouse button and drag |
| Edit segment tempo | Double-click the tempo lane, or use the Inspector |
| Smooth tempo | Enable **smooth** on an anchor to smooth the segment from the previous anchor to it |
| Time signatures | **+ Time Sig** (at playhead bar); click a ruler marker to edit/delete |
| Select all / clear | **Ctrl+A** / **Esc** |
| Zoom / scroll | **Ctrl+Wheel** / wheel; drag the minimap to reposition the viewport |
| Play / Stop / Seek | Transport bar (audio or MIDI), or **Space** to toggle play/pause; **Center** keeps the playhead fixed in the viewport |
| Undo / Redo | **Ctrl+Z** / **Ctrl+Shift+Z** |
| Shortcuts help | **?** |

## Tech

React 18 · TypeScript · Vite · Zustand + immer + zundo · @tonejs/midi · pako · Web Audio API · Canvas 2D · Vitest.

## License

MIT (see `LICENSE`).
