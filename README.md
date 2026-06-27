# Warpgrid

**Bend a rigid DAW grid to match the flowing tempo of a human performance.**

When you record or capture a MIDI take, the tempo is rarely constant — it breathes with the player. A DAW's fixed-tempo bar lines then drift out of alignment with the audio. Some DAWs solve this (Ableton warp markers, Logic beat mapping, Cubase tempo detection), but not all do it conveniently. **Warpgrid** is a focused, single-page web tool that does exactly two things well:

1. **Detect** the tempo of an imported audio/MIDI clip and turn it into a tempo map (assisted — you stay in control).
2. **Warp** the grid by hand: drag grid lines onto the beats you hear, and Warpgrid back-solves the tempo and bar lines for you.

Then **export** a tempo map as MIDI (with tempo + time-signature meta) or a DAW project file (Reaper, Ableton) and drop it into your session.

> Single page, no secondary screens. Built for PC/laptop with keyboard + mouse. Dark, professional, DAW-like — but simpler.

---

## Status

**Phase 2 — Manual correction (current).** On top of the Phase 0 import/visualize/export base, the grid is now properly editable: select anchors (click / Shift-click / rubber-band), group-drag with snapping, nudge with the keyboard, retune any segment's BPM numerically (downstream tempos preserved), and add/edit/delete time signatures with the bar lines re-flowing live. A contextual Inspector edits the selected anchor / segment / time signature, and a whole drag is a single undo step. Detection and full DAW-project export remain stubbed. See [ROADMAP.md](./ROADMAP.md).

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
anchors the tempo is piecewise-constant, so beat↔time is exact and invertible.
Everything else (bar lines, the tempo curve, the export) is derived from the
anchors plus time-signature changes.

```
 Import (audio / MIDI)
        │  decode → AudioBuffer / parse → Midi
        ▼
 Runtime media registry ──┐
        │                 │ (peaks, parsed notes — not undoable)
        ▼                 │
 Warp anchors  ◄── click / drag (Timeline canvas)
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
| Add warp anchor | Click empty timeline (or **A** at the playhead) |
| Warp (move anchor) | Drag an anchor handle — hold **Ctrl** to disable snapping |
| Select | Click an anchor · **Shift+Click** to multi-select · drag a box to rubber-band |
| Nudge selection | **← / →** (hold **Shift** for ×10) |
| Delete anchor | **Alt+Click**, or select + **Delete** |
| Edit segment tempo | Double-click the tempo lane, or use the Inspector |
| Time signatures | **+ Time Sig** (at playhead bar); click a ruler marker to edit/delete |
| Select all / clear | **Ctrl+A** / **Esc** |
| Zoom / scroll | **Ctrl+Wheel** / wheel |
| Play / Stop | Transport bar (audio) |
| Undo / Redo | **Ctrl+Z** / **Ctrl+Shift+Z** |
| Shortcuts help | **?** |

## Tech

React 18 · TypeScript · Vite · Zustand + immer + zundo · @tonejs/midi · pako · Web Audio API · Canvas 2D · Vitest.

## License

MIT (see `LICENSE`).
