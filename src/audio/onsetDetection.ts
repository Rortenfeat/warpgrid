/**
 * Onset detection (Phase 3 — STUB).
 *
 * Plan: spectral-flux onset detection over an STFT of the mono signal, with
 * adaptive thresholding and peak-picking, yielding candidate onset times. These
 * feed tempoEstimate + the "generate candidate anchors" action so the user can
 * accept/nudge them. A heavier essentia.js / aubio-wasm backend is an optional
 * upgrade behind this same interface (see ROADMAP Phase 5).
 */

export interface OnsetResult {
  /** Candidate onset times in seconds, ascending. */
  onsets: number[]
  /** Normalized onset strength per onset (0..1), same length as `onsets`. */
  strength: number[]
}

export interface OnsetOptions {
  /** STFT window size in samples. */
  fftSize?: number
  /** Hop size in samples. */
  hopSize?: number
  /** Peak-picking sensitivity (higher = fewer onsets). */
  threshold?: number
}

// TODO(phase-3): implement spectral-flux onset detection over OfflineAudioContext / STFT.
export async function detectOnsets(_buffer: AudioBuffer, _options: OnsetOptions = {}): Promise<OnsetResult> {
  throw new Error('detectOnsets: not implemented yet (Phase 3)')
}
