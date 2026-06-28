/**
 * Tempo estimation from onsets.
 *
 * This is intentionally conservative: it builds an IOI histogram inside an
 * expected BPM range and returns a regular beat grid aligned to a strong onset.
 * It is a first-pass guide for candidate generation, not a full beat tracker.
 */

import type { OnsetResult } from './onsetDetection'

export interface TempoEstimate {
  /** Estimated beat times in seconds, ascending. */
  beats: number[]
  /** Smoothed instantaneous BPM aligned to `beats`. */
  bpm: number[]
}

export interface TempoEstimateOptions {
  /** Expected BPM range to disambiguate octave errors. */
  minBpm?: number
  maxBpm?: number
}

export function estimateTempo(onsets: OnsetResult, options: TempoEstimateOptions = {}): TempoEstimate {
  const minBpm = options.minBpm ?? 60
  const maxBpm = options.maxBpm ?? 180
  if (onsets.onsets.length < 2) return { beats: [], bpm: [] }

  const minIoi = 60 / maxBpm
  const maxIoi = 60 / minBpm
  const binCount = 96
  const bins = new Float32Array(binCount)

  for (let i = 0; i < onsets.onsets.length; i++) {
    for (let j = i + 1; j < onsets.onsets.length; j++) {
      const ioi = onsets.onsets[j] - onsets.onsets[i]
      if (ioi < minIoi) continue
      if (ioi > maxIoi) break
      const bin = Math.floor(((ioi - minIoi) / (maxIoi - minIoi)) * binCount)
      const weight = (onsets.strength[i] ?? 1) * (onsets.strength[j] ?? 1)
      bins[Math.min(binCount - 1, Math.max(0, bin))] += weight
    }
  }

  let bestBin = 0
  for (let i = 1; i < bins.length; i++) if (bins[i] > bins[bestBin]) bestBin = i
  if (bins[bestBin] <= 0) return { beats: [], bpm: [] }

  const beatInterval = minIoi + ((bestBin + 0.5) / binCount) * (maxIoi - minIoi)
  const bpmValue = 60 / beatInterval
  const strongestIndex = strongestOnsetIndex(onsets)
  const anchorTime = onsets.onsets[strongestIndex] ?? onsets.onsets[0]
  const first = onsets.onsets[0]
  const last = onsets.onsets[onsets.onsets.length - 1]
  const beats: number[] = []
  let t = anchorTime
  while (t - beatInterval >= first) t -= beatInterval
  for (; t <= last + beatInterval * 0.5; t += beatInterval) beats.push(t)
  return { beats, bpm: beats.map(() => bpmValue) }
}

function strongestOnsetIndex(onsets: OnsetResult): number {
  let best = 0
  for (let i = 1; i < onsets.onsets.length; i++) {
    if ((onsets.strength[i] ?? 0) > (onsets.strength[best] ?? 0)) best = i
  }
  return best
}
