import { DEFAULT_BPM } from './types'
import type { TempoEvent, TempoSegment, WarpAnchor } from './types'

/**
 * Tempo-map math — the foundation of Warpgrid.
 *
 * A tempo map is defined entirely by a set of WarpAnchors, each pinning a
 * musical position (quarter-note `beat`) to a real-time position (`time`, in
 * seconds). Between two adjacent anchors the tempo is treated as PIECEWISE
 * CONSTANT: the segment's BPM is the average implied by its endpoints, so real
 * time is a linear function of beat across the segment. This makes both
 * directions (beat->time, time->beat) exact, closed-form, and mutually inverse.
 *
 * The average tempo of the segment between anchors A and B is:
 *     bpm = (B.beat - A.beat) * 60 / (B.time - A.time)
 *
 * NOTE: WarpAnchor.curve may be 'ramp' for future linear-tempo segments. Exact
 * ramp integration (tempo varying within a segment) is a Phase 2 refinement;
 * Phase 0 maps every segment as constant. The stored curve flag is preserved
 * and surfaced by deriveTempoSegments / deriveTempoEvents for display & export.
 */

/** Return anchors sorted by beat ascending (does not mutate the input). */
export function sortedAnchors(anchors: WarpAnchor[]): WarpAnchor[] {
  return [...anchors].sort((a, b) => a.beat - b.beat)
}

/**
 * Average BPM of the segment between two anchors. Returns `fallback` if the
 * endpoints are degenerate (non-increasing beat or time), which keeps callers
 * robust while the store enforces monotonicity.
 */
export function segmentBpm(a: WarpAnchor, b: WarpAnchor, fallback = DEFAULT_BPM): number {
  const dBeat = b.beat - a.beat
  const dTime = b.time - a.time
  if (dBeat <= 0 || dTime <= 0) return fallback
  return (dBeat * 60) / dTime
}

/**
 * Convert a musical position (quarter beat) to real time (seconds).
 *
 * - 0 anchors: maps from the origin at `defaultBpm`.
 * - 1 anchor: extrapolates from it at `defaultBpm`.
 * - n anchors: linear within each segment; extrapolates beyond the first/last
 *   anchor using that edge segment's tempo.
 */
export function beatToTime(beat: number, anchors: WarpAnchor[], defaultBpm = DEFAULT_BPM): number {
  const a = sortedAnchors(anchors)
  if (a.length === 0) return (beat * 60) / defaultBpm
  if (a.length === 1) return a[0].time + ((beat - a[0].beat) * 60) / defaultBpm

  // Before the first anchor: extrapolate with the first segment's tempo.
  if (beat <= a[0].beat) {
    const bpm = segmentBpm(a[0], a[1], defaultBpm)
    return a[0].time + ((beat - a[0].beat) * 60) / bpm
  }
  // After the last anchor: extrapolate with the last segment's tempo.
  const last = a[a.length - 1]
  if (beat >= last.beat) {
    const bpm = segmentBpm(a[a.length - 2], last, defaultBpm)
    return last.time + ((beat - last.beat) * 60) / bpm
  }
  // Interior: find the bracketing segment and interpolate linearly in time.
  for (let i = 0; i < a.length - 1; i++) {
    const lo = a[i]
    const hi = a[i + 1]
    if (beat >= lo.beat && beat <= hi.beat) {
      const frac = (beat - lo.beat) / (hi.beat - lo.beat)
      return lo.time + frac * (hi.time - lo.time)
    }
  }
  return last.time // unreachable
}

/**
 * Convert a real-time position (seconds) to a musical position (quarter beat).
 * Exact inverse of beatToTime under the piecewise-constant model.
 */
export function timeToBeat(time: number, anchors: WarpAnchor[], defaultBpm = DEFAULT_BPM): number {
  const a = sortedAnchors(anchors)
  if (a.length === 0) return (time * defaultBpm) / 60
  if (a.length === 1) return a[0].beat + ((time - a[0].time) * defaultBpm) / 60

  if (time <= a[0].time) {
    const bpm = segmentBpm(a[0], a[1], defaultBpm)
    return a[0].beat + ((time - a[0].time) * bpm) / 60
  }
  const last = a[a.length - 1]
  if (time >= last.time) {
    const bpm = segmentBpm(a[a.length - 2], last, defaultBpm)
    return last.beat + ((time - last.time) * bpm) / 60
  }
  for (let i = 0; i < a.length - 1; i++) {
    const lo = a[i]
    const hi = a[i + 1]
    if (time >= lo.time && time <= hi.time) {
      const frac = (time - lo.time) / (hi.time - lo.time)
      return lo.beat + frac * (hi.beat - lo.beat)
    }
  }
  return last.beat // unreachable
}

/** Instantaneous tempo (BPM) at a given beat under the piecewise-constant model. */
export function tempoAtBeat(beat: number, anchors: WarpAnchor[], defaultBpm = DEFAULT_BPM): number {
  const a = sortedAnchors(anchors)
  if (a.length < 2) return defaultBpm
  if (beat <= a[0].beat) return segmentBpm(a[0], a[1], defaultBpm)
  const last = a[a.length - 1]
  if (beat >= last.beat) return segmentBpm(a[a.length - 2], last, defaultBpm)
  for (let i = 0; i < a.length - 1; i++) {
    if (beat >= a[i].beat && beat <= a[i + 1].beat) {
      return segmentBpm(a[i], a[i + 1], defaultBpm)
    }
  }
  return defaultBpm
}

/**
 * Derive the resolved tempo segments between consecutive anchors. Each segment
 * carries the constant BPM implied by its endpoints. With fewer than two
 * anchors a single open segment at `defaultBpm` is returned.
 */
export function deriveTempoSegments(anchors: WarpAnchor[], defaultBpm = DEFAULT_BPM): TempoSegment[] {
  const a = sortedAnchors(anchors)
  if (a.length === 0) {
    return [{ startBeat: 0, endBeat: Infinity, startTime: 0, startBpm: defaultBpm, endBpm: defaultBpm, curve: 'constant' }]
  }
  if (a.length === 1) {
    return [{ startBeat: a[0].beat, endBeat: Infinity, startTime: a[0].time, startBpm: defaultBpm, endBpm: defaultBpm, curve: 'constant' }]
  }
  const segments: TempoSegment[] = []
  for (let i = 0; i < a.length - 1; i++) {
    const bpm = segmentBpm(a[i], a[i + 1], defaultBpm)
    segments.push({
      startBeat: a[i].beat,
      endBeat: a[i + 1].beat,
      startTime: a[i].time,
      startBpm: bpm,
      endBpm: bpm, // Phase 0: constant; ramp endpoints are a Phase 2 refinement.
      curve: a[i].curve,
    })
  }
  // Trailing open segment continues at the last computed tempo.
  const last = a[a.length - 1]
  const lastBpm = segmentBpm(a[a.length - 2], last, defaultBpm)
  segments.push({ startBeat: last.beat, endBeat: Infinity, startTime: last.time, startBpm: lastBpm, endBpm: lastBpm, curve: last.curve })
  return segments
}

/**
 * Derive a flat list of tempo events (one per anchor) suitable for export to
 * MIDI / DAW project formats. Each event marks the BPM that begins at its beat.
 */
export function deriveTempoEvents(anchors: WarpAnchor[], defaultBpm = DEFAULT_BPM): TempoEvent[] {
  return deriveTempoSegments(anchors, defaultBpm).map((s) => ({
    beat: s.startBeat,
    time: s.startTime,
    bpm: s.startBpm,
    curve: s.curve,
  }))
}
