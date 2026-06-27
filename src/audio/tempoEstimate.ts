/**
 * Tempo estimation from onsets (Phase 3 — STUB).
 *
 * Plan: build an inter-onset-interval / autocorrelation profile of the onset
 * strength signal to estimate a local tempo over time, then convert into a set
 * of candidate WarpAnchors that the user can refine. Handles tempo drift by
 * estimating per-window rather than a single global BPM.
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

// TODO(phase-3): autocorrelation / IOI tempo tracking with octave-error handling.
export function estimateTempo(_onsets: OnsetResult, _options: TempoEstimateOptions = {}): TempoEstimate {
  throw new Error('estimateTempo: not implemented yet (Phase 3)')
}
