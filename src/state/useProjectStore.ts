import { create } from 'zustand'
import { temporal } from 'zundo'
import { immer } from 'zustand/middleware/immer'
import { createEmptyProject } from '../core/types'
import type { Project, SourceMeta, WarpAnchor, TimeSignatureChange, Id, SegmentCurve } from '../core/types'
import type { WaveformPeaks } from '../audio/peaks'
import type { OnsetResult } from '../audio/onsetDetection'
import type { ParsedMidi } from '../midi/parseMidi'
import { timeToBeat } from '../core/tempoMap'
import { sortedTimeSignatures } from '../core/timeSignature'
import { setSegmentBpmEdits } from '../core/tempoEdit'

/**
 * Application store.
 *
 * `project` is the serializable, UNDOABLE state (anchors, time signatures,
 * source metadata). `media` (decoded AudioBuffers, peaks, parsed MIDI),
 * `selection`, `view`, and `status` are runtime-only and excluded from the undo
 * history via zundo's `partialize` — Ctrl+Z shouldn't un-import a file, change
 * the selection, or rewind the scroll position.
 */

/** Heavy decoded payloads kept out of undo history, keyed by source id. */
export interface MediaEntry {
  kind: 'audio' | 'midi'
  audioBuffer?: AudioBuffer
  peaks?: WaveformPeaks
  onsets?: OnsetResult
  parsedMidi?: ParsedMidi
}

export interface ViewState {
  /** Horizontal zoom: pixels per second of source time. */
  pxPerSecond: number
  /** Left edge of the viewport, in seconds. */
  scrollSec: number
  /** Playhead position, in seconds. */
  playheadSec: number
  /** Keep the playhead fixed in the viewport center while the grid scrolls. */
  followPlayhead: boolean
}

/** What the Inspector is currently editing. */
export type SelectionKind = 'anchors' | 'segment' | 'timeSignature' | 'none'

export interface Selection {
  kind: SelectionKind
  /** Selected anchor ids (kind === 'anchors'). */
  anchorIds: Id[]
  /** Anchor id that starts the selected segment (kind === 'segment'). */
  segmentStartId?: Id
  /** Selected time-signature id (kind === 'timeSignature'). */
  timeSignatureId?: Id
}

const emptySelection: Selection = { kind: 'none', anchorIds: [] }

export interface AppState {
  project: Project
  media: Record<Id, MediaEntry>
  view: ViewState
  selection: Selection
  status: string

  // ── source import ──────────────────────────────────────────────
  addAudioSource: (meta: Omit<SourceMeta, 'id' | 'kind'>, media: Omit<MediaEntry, 'kind'>) => void
  addMidiSource: (meta: Omit<SourceMeta, 'id' | 'kind'>, parsedMidi: ParsedMidi) => void
  setAudioOnsets: (sourceId: Id, onsets: OnsetResult) => void
  clearAudioOnsets: (sourceId: Id) => void
  generateCandidateAnchors: (sourceId?: Id) => Id[]

  // ── anchors (the warp grid) ────────────────────────────────────
  /** Add an anchor; returns the new id so callers can select it. */
  addAnchor: (beat: number, time: number) => Id
  /** Drag a single grid line: move an anchor to a new real time (keeps beat). */
  moveAnchor: (id: Id, time: number) => void
  /** Move several anchors by the same time delta (group drag / nudge). */
  moveAnchorsBy: (ids: Id[], deltaTime: number) => void
  /** Set an anchor's exact time (numeric entry). */
  setAnchorTime: (id: Id, time: number) => void
  /** Set how the segment ending at this anchor behaves. */
  setAnchorCurve: (id: Id, curve: SegmentCurve) => void
  removeAnchor: (id: Id) => void
  removeAnchors: (ids: Id[]) => void
  /** Retune the segment starting at `startId`, keeping downstream tempos. */
  setSegmentBpm: (startId: Id, bpm: number) => void

  // ── time signatures ────────────────────────────────────────────
  addTimeSignature: (bar: number, numerator: number, denominator: number) => Id
  updateTimeSignature: (id: Id, patch: Partial<Pick<TimeSignatureChange, 'numerator' | 'denominator'>>) => void
  removeTimeSignature: (id: Id) => void

  // ── selection (not undoable) ───────────────────────────────────
  selectAnchors: (ids: Id[]) => void
  toggleAnchor: (id: Id) => void
  selectSegment: (startId: Id) => void
  selectTimeSignature: (id: Id) => void
  selectAll: () => void
  clearSelection: () => void

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
    immer((set, get) => ({
      project: initialProject,
      media: {},
      view: { pxPerSecond: 120, scrollSec: 0, playheadSec: 0, followPlayhead: true },
      selection: emptySelection,
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

      setAudioOnsets: (sourceId, onsets) =>
        set((s) => {
          const entry = s.media[sourceId]
          if (!entry) return
          entry.onsets = onsets
          s.status = `Detected ${onsets.onsets.length} audio transients`
        }),

      clearAudioOnsets: (sourceId) =>
        set((s) => {
          const entry = s.media[sourceId]
          if (!entry) return
          entry.onsets = { onsets: [], strength: [] }
          s.status = `Cleared transient guide points`
        }),

      generateCandidateAnchors: (sourceId) => {
        const state = get()
        const source = sourceId
          ? state.project.sources.find((s) => s.id === sourceId)
          : state.project.sources.find((s) => state.media[s.id]?.onsets)
        const onsets = source ? state.media[source.id]?.onsets : undefined
        if (!onsets || onsets.onsets.length === 0) return []
        const existingBeats = new Set(state.project.anchors.map((a) => Math.round(a.beat * 1000) / 1000))
        const existingTimes = state.project.anchors.map((a) => a.time)
        const selected = onsets.onsets
          .map((time, i) => ({ time, strength: onsets.strength[i] ?? 0 }))
          .filter((o) => o.strength >= 0.12)
          .sort((a, b) => b.strength - a.strength)
          .slice(0, 160)
          .sort((a, b) => a.time - b.time)
        const ids: Id[] = []
        const baseAnchors = state.project.anchors
        const anchors: WarpAnchor[] = []
        for (const onset of selected) {
          if (existingTimes.some((time) => Math.abs(time - onset.time) < 0.04)) continue
          const beat = Math.max(0, Math.round(timeToBeat(onset.time, baseAnchors)))
          const beatKey = Math.round(beat * 1000) / 1000
          if (existingBeats.has(beatKey)) continue
          const id = newId('anchor')
          ids.push(id)
          existingBeats.add(beatKey)
          existingTimes.push(onset.time)
          anchors.push({ id, beat, time: onset.time, curve: 'constant', origin: 'detected' })
        }
        if (ids.length === 0) return []
        set((s) => {
          s.project.anchors.push(...anchors)
          s.project.anchors = normalizeAnchors(s.project.anchors)
          s.selection = { kind: 'anchors', anchorIds: ids }
          s.status = `Generated ${ids.length} candidate anchors from detected transients`
        })
        return ids
      },

      addAnchor: (beat, time) => {
        const id = newId('anchor')
        set((s) => {
          s.project.anchors.push({ id, beat, time, curve: 'constant', origin: 'user' })
          s.project.anchors = normalizeAnchors(s.project.anchors)
        })
        return id
      },

      moveAnchor: (id, time) =>
        set((s) => {
          const anchor = s.project.anchors.find((a) => a.id === id)
          if (!anchor) return
          anchor.time = time
          s.project.anchors = normalizeAnchors(s.project.anchors)
        }),

      moveAnchorsBy: (ids, deltaTime) =>
        set((s) => {
          const idset = new Set(ids)
          for (const a of s.project.anchors) {
            if (idset.has(a.id)) a.time += deltaTime
          }
          s.project.anchors = normalizeAnchors(s.project.anchors)
        }),

      setAnchorTime: (id, time) =>
        set((s) => {
          const anchor = s.project.anchors.find((a) => a.id === id)
          if (!anchor) return
          anchor.time = time
          s.project.anchors = normalizeAnchors(s.project.anchors)
        }),

      setAnchorCurve: (id, curve) =>
        set((s) => {
          const anchor = s.project.anchors.find((a) => a.id === id)
          if (!anchor) return
          anchor.curve = curve
        }),

      removeAnchor: (id) =>
        set((s) => {
          s.project.anchors = s.project.anchors.filter((a) => a.id !== id)
        }),

      removeAnchors: (ids) =>
        set((s) => {
          const idset = new Set(ids)
          s.project.anchors = s.project.anchors.filter((a) => !idset.has(a.id))
        }),

      setSegmentBpm: (startId, bpm) => {
        const edits = setSegmentBpmEdits(get().project.anchors, startId, bpm)
        if (Object.keys(edits).length === 0) return
        set((s) => {
          for (const a of s.project.anchors) {
            if (edits[a.id] != null) a.time = edits[a.id]
          }
          s.project.anchors = normalizeAnchors(s.project.anchors)
        })
      },

      addTimeSignature: (bar, numerator, denominator) => {
        const id = newId('ts')
        set((s) => {
          // Replace an existing change at the same bar rather than duplicating.
          s.project.timeSignatures = s.project.timeSignatures.filter((t) => t.bar !== bar)
          s.project.timeSignatures.push({ id, bar, numerator, denominator })
          s.project.timeSignatures.sort((a, b) => a.bar - b.bar)
        })
        return id
      },

      updateTimeSignature: (id, patch) =>
        set((s) => {
          const ts = s.project.timeSignatures.find((t) => t.id === id)
          if (!ts) return
          if (patch.numerator != null) ts.numerator = Math.max(1, Math.round(patch.numerator))
          if (patch.denominator != null) ts.denominator = Math.max(1, Math.round(patch.denominator))
        }),

      removeTimeSignature: (id) =>
        set((s) => {
          const ts = s.project.timeSignatures.find((t) => t.id === id)
          if (!ts || ts.bar === 0) return // never delete the bar-0 signature
          s.project.timeSignatures = s.project.timeSignatures.filter((t) => t.id !== id)
        }),

      // ── selection ────────────────────────────────────────────────
      selectAnchors: (ids) =>
        set((s) => { s.selection = { kind: ids.length ? 'anchors' : 'none', anchorIds: ids } }),

      toggleAnchor: (id) =>
        set((s) => {
          const cur = s.selection.kind === 'anchors' ? s.selection.anchorIds : []
          const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
          s.selection = { kind: next.length ? 'anchors' : 'none', anchorIds: next }
        }),

      selectSegment: (startId) =>
        set((s) => { s.selection = { kind: 'segment', anchorIds: [], segmentStartId: startId } }),

      selectTimeSignature: (id) =>
        set((s) => { s.selection = { kind: 'timeSignature', anchorIds: [], timeSignatureId: id } }),

      selectAll: () =>
        set((s) => {
          const ids = s.project.anchors.map((a) => a.id)
          s.selection = { kind: ids.length ? 'anchors' : 'none', anchorIds: ids }
        }),

      clearSelection: () => set((s) => { s.selection = emptySelection }),

      setView: (patch) => set((s) => { Object.assign(s.view, patch) }),
      setStatus: (status) => set((s) => { s.status = status }),
      reset: () => set((s) => {
        s.project = createEmptyProject()
        s.media = {}
        s.view = { pxPerSecond: 120, scrollSec: 0, playheadSec: 0, followPlayhead: true }
        s.selection = emptySelection
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

// ── undo/redo + drag-batching ────────────────────────────────────────────────

/** Convenience hook for undo/redo wired to zundo's temporal store. */
export function useHistory() {
  const undo = () => useProjectStore.temporal.getState().undo()
  const redo = () => useProjectStore.temporal.getState().redo()
  const clear = () => useProjectStore.temporal.getState().clear()
  return { undo, redo, clear }
}

/** Pause history recording (used mid-drag so a gesture is one undo step). */
export const pauseHistory = () => useProjectStore.temporal.getState().pause()
/** Resume history recording after a drag gesture completes. */
export const resumeHistory = () => useProjectStore.temporal.getState().resume()

export { sortedTimeSignatures }
