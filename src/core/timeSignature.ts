import type { TimeSignatureChange } from './types'

/**
 * Time-signature helpers.
 *
 * Throughout Warpgrid a "quarter beat" is one quarter-note (the MIDI/PPQ unit).
 * Time signatures change how quarter beats group into bars; they do NOT change
 * the length of a quarter beat. A bar in n/d spans `n * 4 / d` quarter beats:
 *   4/4 -> 4,  3/4 -> 3,  6/8 -> 3,  7/8 -> 3.5.
 */

/** Length of one bar of the given signature, in quarter-note beats. */
export function barLengthInQuarters(ts: Pick<TimeSignatureChange, 'numerator' | 'denominator'>): number {
  return (ts.numerator * 4) / ts.denominator
}

/** Return a copy sorted by bar ascending. Always has an effective entry at bar 0. */
export function sortedTimeSignatures(list: TimeSignatureChange[]): TimeSignatureChange[] {
  const sorted = [...list].sort((a, b) => a.bar - b.bar)
  if (sorted.length === 0 || sorted[0].bar !== 0) {
    sorted.unshift({ id: 'ts-implicit-origin', bar: 0, numerator: 4, denominator: 4 })
  }
  return sorted
}

/** The signature in effect at a given (0-based) bar. */
export function timeSignatureAtBar(bar: number, list: TimeSignatureChange[]): TimeSignatureChange {
  const sorted = sortedTimeSignatures(list)
  let current = sorted[0]
  for (const ts of sorted) {
    if (ts.bar <= bar) current = ts
    else break
  }
  return current
}

/** Cumulative quarter beats from project start to the downbeat of `bar`. */
export function barStartInQuarters(bar: number, list: TimeSignatureChange[]): number {
  const sorted = sortedTimeSignatures(list)
  let quarters = 0
  for (let i = 0; i < sorted.length; i++) {
    const ts = sorted[i]
    const nextBar = i + 1 < sorted.length ? sorted[i + 1].bar : Infinity
    const segEndBar = Math.min(bar, nextBar)
    if (segEndBar > ts.bar) {
      quarters += (segEndBar - ts.bar) * barLengthInQuarters(ts)
    }
    if (nextBar >= bar) break
  }
  return quarters
}

/** A musical position split into bar / beat-within-bar (both 0-based), in the local denominator unit. */
export interface BarBeat {
  /** 0-based bar index. */
  bar: number
  /** 0-based beat within the bar, in denominator-note units (e.g. eighths in x/8). */
  beat: number
  /** The signature in effect at this position. */
  signature: TimeSignatureChange
}

/** Convert an absolute quarter-beat position to bar / beat-within-bar. */
export function quarterBeatToBarBeat(quarterBeat: number, list: TimeSignatureChange[]): BarBeat {
  const sorted = sortedTimeSignatures(list)
  let acc = 0 // quarter beats consumed up to the start of `barCursor`
  for (let i = 0; i < sorted.length; i++) {
    const ts = sorted[i]
    const barLen = barLengthInQuarters(ts)
    const nextChangeBar = i + 1 < sorted.length ? sorted[i + 1].bar : Infinity
    const barsInSegment = nextChangeBar - ts.bar // may be Infinity
    const quartersInSegment = barsInSegment * barLen
    if (quarterBeat < acc + quartersInSegment || !isFinite(quartersInSegment)) {
      const offsetQuarters = quarterBeat - acc
      const barOffset = Math.floor(offsetQuarters / barLen)
      const remainderQuarters = offsetQuarters - barOffset * barLen
      // Convert remainder quarter-beats to denominator-note beats.
      const beat = (remainderQuarters * ts.denominator) / 4
      return { bar: ts.bar + barOffset, beat, signature: ts }
    }
    acc += quartersInSegment
  }
  // Fallback (shouldn't reach): treat as last signature.
  const last = sorted[sorted.length - 1]
  return { bar: last.bar, beat: 0, signature: last }
}

/** Convert a bar + beat-within-bar (denominator units) to an absolute quarter-beat position. */
export function barBeatToQuarterBeat(bar: number, beatInBar: number, list: TimeSignatureChange[]): number {
  const ts = timeSignatureAtBar(bar, list)
  const beatQuarters = (beatInBar * 4) / ts.denominator
  return barStartInQuarters(bar, list) + beatQuarters
}

/** Human-readable "bar.beat" label, 1-based for display (musicians count from 1). */
export function formatBarBeat(quarterBeat: number, list: TimeSignatureChange[]): string {
  const { bar, beat } = quarterBeatToBarBeat(quarterBeat, list)
  const beatWhole = Math.floor(beat)
  const tick = Math.round((beat - beatWhole) * 1000)
  return `${bar + 1}.${beatWhole + 1}.${tick.toString().padStart(3, '0')}`
}
