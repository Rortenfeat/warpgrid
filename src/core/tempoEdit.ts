import type { WarpAnchor } from './types'
import { sortedAnchors, segmentBpm } from './tempoMap'

/**
 * Pure editing helpers for manual tempo correction (Phase 2).
 *
 * These keep the (beat, time) pairs as the exact ground truth — none of them
 * introduce ramps or approximate the time mapping. They compute the precise
 * times/edits the store then applies.
 */

/**
 * The real time an anchor's END point must have for the segment between two
 * anchors to run at exactly `bpm`. Inverse of `segmentBpm` from tempoMap.ts:
 *   bpm = Δbeat * 60 / Δtime   ⇒   endTime = startTime + Δbeat * 60 / bpm
 */
export function timeForSegmentBpm(start: WarpAnchor, end: WarpAnchor, bpm: number): number {
  const dBeat = end.beat - start.beat
  if (dBeat <= 0 || bpm <= 0) return end.time
  return start.time + (dBeat * 60) / bpm
}

/**
 * Snap a candidate time to the nearest value in `candidates` within `tolSec`.
 * Returns the snapped time, or the original if nothing is close enough. Used
 * while dragging anchors (snap to other anchors / beat-grid times).
 */
export function snapTime(time: number, candidates: number[], tolSec: number): number {
  let best = time
  let bestDist = tolSec
  for (const c of candidates) {
    const d = Math.abs(c - time)
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  return best
}

/**
 * Index of the segment (gap between anchors i and i+1) that contains `beat`,
 * operating on a beat-sorted anchor list. Returns -1 if fewer than 2 anchors.
 * Beats at/after the last anchor map to the trailing (open) segment index
 * `n-1` is NOT returned — the last real segment is `n-2`; the open tail beyond
 * the last anchor returns `n-1` to denote "no closing anchor".
 */
export function segmentIndexAtBeat(anchors: WarpAnchor[], beat: number): number {
  const a = sortedAnchors(anchors)
  if (a.length < 2) return -1
  if (beat >= a[a.length - 1].beat) return a.length - 1 // open tail
  for (let i = 0; i < a.length - 1; i++) {
    if (beat >= a[i].beat && beat < a[i + 1].beat) return i
  }
  return 0
}

/**
 * Compute the anchor time updates needed to set the segment starting at
 * `startId` to `bpm`, keeping every downstream segment's tempo unchanged.
 *
 * We move the segment's END anchor to the time that yields `bpm`, then shift
 * every later anchor by the same delta so their mutual spacing (and thus their
 * tempos) is preserved. Returns a map of anchorId -> newTime to apply.
 * No-op (empty map) for the trailing open segment (no end anchor to move).
 */
export function setSegmentBpmEdits(anchors: WarpAnchor[], startId: string, bpm: number): Record<string, number> {
  const a = sortedAnchors(anchors)
  const idx = a.findIndex((x) => x.id === startId)
  if (idx < 0 || idx >= a.length - 1) return {} // unknown, or open tail
  const start = a[idx]
  const end = a[idx + 1]
  const newEndTime = timeForSegmentBpm(start, end, bpm)
  const delta = newEndTime - end.time
  if (delta === 0) return {}
  const edits: Record<string, number> = {}
  for (let i = idx + 1; i < a.length; i++) {
    edits[a[i].id] = a[i].time + delta
  }
  return edits
}

/** Current BPM of the segment starting at the given anchor (open tail uses prior). */
export function segmentBpmAt(anchors: WarpAnchor[], startId: string, defaultBpm = 120): number {
  const a = sortedAnchors(anchors)
  const idx = a.findIndex((x) => x.id === startId)
  if (idx < 0) return defaultBpm
  if (idx >= a.length - 1) {
    return a.length >= 2 ? segmentBpm(a[a.length - 2], a[a.length - 1], defaultBpm) : defaultBpm
  }
  return segmentBpm(a[idx], a[idx + 1], defaultBpm)
}
