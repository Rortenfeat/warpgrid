import { create } from 'zustand'
import { temporal } from 'zundo'
import { immer } from 'zustand/middleware/immer'
import { createEmptyProject } from '../core/types'
import type { Project, SourceMeta, WarpAnchor, Id } from '../core/types'
import type { WaveformPeaks } from '../audio/peaks'
import type { ParsedMidi } from '../midi/parseMidi'

/**
 * Application store.
 *
 * `project` is the serializable, UNDOABLE state (anchors, time signatures,
 * source metadata). `media` (decoded AudioBuffers, peaks, parsed MIDI) and
 * `view`/`status` are runtime-only and excluded from the undo history via
 * zundo's `partialize` — you don't want Ctrl+Z to un-import a file or rewind
 * the scroll position.
 */

/** Heavy decoded payloads kept out of undo history, keyed by source id. */
export interface MediaEntry {
  kind: 'audio' | 'midi'
  audioBuffer?: AudioBuffer
  peaks?: WaveformPeaks
  parsedMidi?: ParsedMidi
}

export interface ViewState {
  /** Horizontal zoom: pixels per second of source time. */
  pxPerSecond: number
  /** Left edge of the viewport, in seconds. */
  scrollSec: number
  /** Playhead position, in seconds. */
  playheadSec: number
}

export interface AppState {
  project: Project
  media: Record<Id, MediaEntry>
  view: ViewState
  status: string

  // ── source import ──────────────────────────────────────────────
  addAudioSource: (meta: Omit<SourceMeta, 'id' | 'kind'>, media: Omit<MediaEntry, 'kind'>) => void
  addMidiSource: (meta: Omit<SourceMeta, 'id' | 'kind'>, parsedMidi: ParsedMidi) => void

  // ── anchors (the warp grid) ────────────────────────────────────
  addAnchor: (beat: number, time: number) => void
  /** Drag a grid line: move an anchor to a new real time, keeping its beat. */
  moveAnchor: (id: Id, time: number) => void
  removeAnchor: (id: Id) => void

  // ── view / status ──────────────────────────────────────────────
  setView: (patch: Partial<ViewState>) => void
  setStatus: (status: string) => void
  reset: () => void
}

const newId = (prefix: string): Id =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Math.round(Math.random() * 1e9)}`

/** Keep anchors sorted by beat and enforce non-decreasing time (monotonic map). */
function normalizeAnchors(anchors: WarpAnchor[]): WarpAnchor[] {
  const sorted = [...anchors].sort((a, b) => a.beat - b.beat)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].time <= sorted[i - 1].time) {
      sorted[i].time = sorted[i - 1].time + 1e-4
    }
  }
  return sorted
}

const initialProject: Project = createEmptyProject()

export const useProjectStore = create<AppState>()(
  temporal(
    immer((set) => ({
      project: initialProject,
      media: {},
      view: { pxPerSecond: 120, scrollSec: 0, playheadSec: 0 },
      status: 'Ready — drop an audio or MIDI file to begin.',

      addAudioSource: (meta, media) =>
        set((s) => {
          const id = newId('src')
          s.project.sources.push({ id, kind: 'audio', ...meta })
          s.media[id] = { kind: 'audio', ...media }
          s.status = `Loaded audio “${meta.name}” — ${meta.duration.toFixed(2)}s, ${meta.channels}ch @ ${meta.sampleRate}Hz`
        }),

      addMidiSource: (meta, parsedMidi) =>
        set((s) => {
          const id = newId('src')
          s.project.sources.push({ id, kind: 'midi', ...meta })
          s.media[id] = { kind: 'midi', parsedMidi }
          s.project.ppq = parsedMidi.ppq
          s.status = `Loaded MIDI “${meta.name}” — ${meta.trackCount} tracks, ${meta.noteCount} notes`
        }),

      addAnchor: (beat, time) =>
        set((s) => {
          s.project.anchors.push({ id: newId('anchor'), beat, time, curve: 'constant', origin: 'user' })
          s.project.anchors = normalizeAnchors(s.project.anchors)
        }),

      moveAnchor: (id, time) =>
        set((s) => {
          const anchor = s.project.anchors.find((a) => a.id === id)
          if (!anchor) return
          anchor.time = time
          s.project.anchors = normalizeAnchors(s.project.anchors)
        }),

      removeAnchor: (id) =>
        set((s) => {
          s.project.anchors = s.project.anchors.filter((a) => a.id !== id)
        }),

      setView: (patch) => set((s) => { Object.assign(s.view, patch) }),
      setStatus: (status) => set((s) => { s.status = status }),
      reset: () => set((s) => {
        s.project = createEmptyProject()
        s.media = {}
        s.view = { pxPerSecond: 120, scrollSec: 0, playheadSec: 0 }
        s.status = 'Ready — drop an audio or MIDI file to begin.'
      }),
    })),
    {
      // Only the project participates in undo/redo.
      partialize: (state) => ({ project: state.project }) as never,
      limit: 100,
    },
  ),
)

/** Convenience hook for undo/redo wired to zundo's temporal store. */
export function useHistory() {
  const undo = () => useProjectStore.temporal.getState().undo()
  const redo = () => useProjectStore.temporal.getState().redo()
  const clear = () => useProjectStore.temporal.getState().clear()
  return { undo, redo, clear }
}
