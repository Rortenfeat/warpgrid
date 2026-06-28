import { DEFAULT_BPM } from './types'
import type { TempoEvent, TempoSegment, WarpAnchor } from './types'

/**
 * Tempo-map math — the foundation of Warpgrid.
 *
 * A tempo map is defined entirely by WarpAnchors, each pinning a musical
 * position (quarter-note `beat`) to a real-time position (`time`, seconds).
 * Constant segments use the average BPM implied by their endpoints. Smooth
 * segments use a linear BPM ramp over musical beats, with exact closed-form
 * beat<->time conversion.
 *
 * WarpAnchor.curve belongs to the destination anchor: if anchor N is 'ramp',
 * the segment from anchor N-1 to N is smoothed.
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

interface ResolvedSegment {
  start: WarpAnchor
  end: WarpAnchor
  startBpm: number
  endBpm: number
  curve: 'constant' | 'ramp'
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9
}

function solveRampEndBpm(startBpm: number, dBeat: number, dTime: number, fallback: number): number {
  if (startBpm <= 0 || dBeat <= 0 || dTime <= 0) return fallback
  const target = dTime / ((60 * dBeat) / startBpm)
  if (nearlyEqual(target, 1)) return startBpm

  // f(q) = ln(q)/(q - 1), q = endBpm / startBpm. f is monotonic decreasing
  // for q > 0, spanning infinity..0, so bisection is stable.
  const f = (q: number) => Math.log(q) / (q - 1)
  let lo = 1e-6
  let hi = 1e6
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) > target) lo = mid
    else hi = mid
  }
  return startBpm * ((lo + hi) / 2)
}

function rampBeatToTimeOffset(localBeat: number, dBeat: number, startBpm: number, endBpm: number): number {
  if (localBeat <= 0) return 0
  if (nearlyEqual(startBpm, endBpm)) return (localBeat * 60) / startBpm
  const slope = (endBpm - startBpm) / dBeat
  return (60 / slope) * Math.log((startBpm + slope * localBeat) / startBpm)
}

function rampTimeToBeatOffset(localTime: number, dBeat: number, startBpm: number, endBpm: number): number {
  if (localTime <= 0) return 0
  if (nearlyEqual(startBpm, endBpm)) return (localTime * startBpm) / 60
  const slope = (endBpm - startBpm) / dBeat
  return (startBpm / slope) * (Math.exp((slope * localTime) / 60) - 1)
}

function resolveSegments(anchors: WarpAnchor[], defaultBpm = DEFAULT_BPM): ResolvedSegment[] {
  const a = sortedAnchors(anchors)
  const resolved: ResolvedSegment[] = []
  let previousEndBpm = defaultBpm
  for (let i = 0; i < a.length - 1; i++) {
    const start = a[i]
    const end = a[i + 1]
    const averageBpm = segmentBpm(start, end, defaultBpm)
    if (end.curve === 'ramp') {
      const startBpm = i === 0 ? averageBpm : previousEndBpm
      const endBpm = solveRampEndBpm(startBpm, end.beat - start.beat, end.time - start.time, averageBpm)
      resolved.push({ start, end, startBpm, endBpm, curve: 'ramp' })
      previousEndBpm = endBpm
    } else {
      resolved.push({ start, end, startBpm: averageBpm, endBpm: averageBpm, curve: 'constant' })
      previousEndBpm = averageBpm
    }
  }
  return resolved
}

/**
 * Convert a musical position (quarter beat) to real time (seconds).
 */
export function beatToTime(beat: number, anchors: WarpAnchor[], defaultBpm = DEFAULT_BPM): number {
  const a = sortedAnchors(anchors)
  if (a.length === 0) return (beat * 60) / defaultBpm
  if (a.length === 1) return a[0].time + ((beat - a[0].beat) * 60) / defaultBpm
  const segments = resolveSegments(a, defaultBpm)

  if (beat <= a[0].beat) {
    const bpm = segments[0].startBpm
    return a[0].time + ((beat - a[0].beat) * 60) / bpm
  }

  const last = a[a.length - 1]
  if (beat >= last.beat) {
    const bpm = segments[segments.length - 1].endBpm
    return last.time + ((beat - last.beat) * 60) / bpm
  }

  for (const seg of segments) {
    if (beat >= seg.start.beat && beat <= seg.end.beat) {
      const localBeat = beat - seg.start.beat
      if (seg.curve === 'ramp') {
        return seg.start.time + rampBeatToTimeOffset(localBeat, seg.end.beat - seg.start.beat, seg.startBpm, seg.endBpm)
      }
      const frac = localBeat / (seg.end.beat - seg.start.beat)
      return seg.start.time + frac * (seg.end.time - seg.start.time)
    }
  }
  return last.time
}

/**
 * Convert a real-time position (seconds) to a musical position (quarter beat).
 */
export function timeToBeat(time: number, anchors: WarpAnchor[], defaultBpm = DEFAULT_BPM): number {
  const a = sortedAnchors(anchors)
  if (a.length === 0) return (time * defaultBpm) / 60
  if (a.length === 1) return a[0].beat + ((time - a[0].time) * defaultBpm) / 60
  const segments = resolveSegments(a, defaultBpm)

  if (time <= a[0].time) {
    const bpm = segments[0].startBpm
    return a[0].beat + ((time - a[0].time) * bpm) / 60
  }

  const last = a[a.length - 1]
  if (time >= last.time) {
    const bpm = segments[segments.length - 1].endBpm
    return last.beat + ((time - last.time) * bpm) / 60
  }

  for (const seg of segments) {
    if (time >= seg.start.time && time <= seg.end.time) {
      const localTime = time - seg.start.time
      if (seg.curve === 'ramp') {
        return seg.start.beat + rampTimeToBeatOffset(localTime, seg.end.beat - seg.start.beat, seg.startBpm, seg.endBpm)
      }
      const frac = localTime / (seg.end.time - seg.start.time)
      return seg.start.beat + frac * (seg.end.beat - seg.start.beat)
    }
  }
  return last.beat
}

/** Instantaneous tempo (BPM) at a given beat. */
export function tempoAtBeat(beat: number, anchors: WarpAnchor[], defaultBpm = DEFAULT_BPM): number {
  const a = sortedAnchors(anchors)
  if (a.length < 2) return defaultBpm
  const segments = resolveSegments(a, defaultBpm)
  if (beat <= a[0].beat) return segments[0].startBpm

  const last = a[a.length - 1]
  if (beat >= last.beat) return segments[segments.length - 1].endBpm

  for (const seg of segments) {
    if (beat >= seg.start.beat && beat <= seg.end.beat) {
      if (seg.curve === 'ramp') {
        const frac = (beat - seg.start.beat) / (seg.end.beat - seg.start.beat)
        return seg.startBpm + (seg.endBpm - seg.startBpm) * frac
      }
      return seg.startBpm
    }
  }
  return defaultBpm
}

/**
 * Derive the resolved tempo segments between consecutive anchors. With fewer
 * than two anchors, a single open segment at `defaultBpm` is returned.
 */
export function deriveTempoSegments(anchors: WarpAnchor[], defaultBpm = DEFAULT_BPM): TempoSegment[] {
  const a = sortedAnchors(anchors)
  if (a.length === 0) {
    return [{ startBeat: 0, endBeat: Infinity, startTime: 0, startBpm: defaultBpm, endBpm: defaultBpm, curve: 'constant' }]
  }
  if (a.length === 1) {
    return [{ startBeat: a[0].beat, endBeat: Infinity, startTime: a[0].time, startBpm: defaultBpm, endBpm: defaultBpm, curve: 'constant' }]
  }

  const resolved = resolveSegments(a, defaultBpm)
  const segments: TempoSegment[] = resolved.map((seg) => ({
    startBeat: seg.start.beat,
    endBeat: seg.end.beat,
    startTime: seg.start.time,
    startBpm: seg.startBpm,
    endBpm: seg.endBpm,
    curve: seg.curve,
  }))

  const last = a[a.length - 1]
  const lastBpm = resolved[resolved.length - 1].endBpm
  segments.push({
    startBeat: last.beat,
    endBeat: Infinity,
    startTime: last.time,
    startBpm: lastBpm,
    endBpm: lastBpm,
    curve: 'constant',
  })
  return segments
}

/**
 * Derive a flat list of tempo events suitable for export. Each event marks the
 * BPM that begins at its beat; ramp curve values describe the following gap.
 */
export function deriveTempoEvents(anchors: WarpAnchor[], defaultBpm = DEFAULT_BPM): TempoEvent[] {
  return deriveTempoSegments(anchors, defaultBpm).map((s) => ({
    beat: s.startBeat,
    time: s.startTime,
    bpm: s.startBpm,
    curve: s.curve,
  }))
}
