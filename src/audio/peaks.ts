/**
 * Waveform peak extraction.
 *
 * Renders an AudioBuffer down to a compact min/max envelope ("peaks") that the
 * Canvas timeline can draw at any zoom without touching the raw samples. One
 * bucket per output column; we keep both min and max so the waveform reads
 * correctly (not just rectified amplitude).
 */

export interface WaveformPeaks {
  /** Interleaved [min, max] per bucket, range -1..1. Length = buckets * 2. */
  data: Float32Array
  /** Number of buckets (columns) represented. */
  buckets: number
  /** Source duration in seconds (for time<->column mapping). */
  duration: number
}

/**
 * Compute a min/max peak envelope. Channels are summed to mono first. For very
 * large buffers this is O(samples); Phase 5 will move it to a Web Worker.
 */
export function computePeaks(buffer: AudioBuffer, buckets = 2000): WaveformPeaks {
  const length = buffer.length
  const channels = buffer.numberOfChannels
  const data = new Float32Array(buckets * 2)
  const samplesPerBucket = Math.max(1, Math.floor(length / buckets))

  for (let b = 0; b < buckets; b++) {
    const start = b * samplesPerBucket
    const end = Math.min(length, start + samplesPerBucket)
    let min = 0
    let max = 0
    for (let i = start; i < end; i++) {
      let sum = 0
      for (let c = 0; c < channels; c++) sum += buffer.getChannelData(c)[i]
      const v = sum / channels
      if (v < min) min = v
      if (v > max) max = v
    }
    data[b * 2] = min
    data[b * 2 + 1] = max
  }
  return { data, buckets, duration: buffer.duration }
}
