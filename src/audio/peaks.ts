/**
 * Waveform peak extraction.
 *
 * Renders an AudioBuffer down to a compact min/max envelope ("peaks") that the
 * Canvas timeline can draw at any zoom without touching the raw samples. One
 * bucket per output column; we keep both min and max so the waveform reads
 * correctly (not just rectified amplitude).
 */

export interface WaveformPeaks {
  /** Interleaved [min, max] per bucket, range -1..1. Length = channels * buckets * 2. */
  data: Float32Array
  /** Number of buckets (columns) represented. */
  buckets: number
  /** Number of source channels represented in `data`. */
  channels: number
  /** Source duration in seconds (for time<->column mapping). */
  duration: number
  /** Optional higher/lower resolution peak sets for different zoom levels. */
  levels?: WaveformPeakLevel[]
}

export interface WaveformPeakLevel {
  data: Float32Array
  buckets: number
}

/**
 * Compute min/max peak envelopes per channel. For very large buffers this is
 * O(samples * levels); Phase 5 will move it to a Web Worker.
 */
export function computePeaks(buffer: AudioBuffer, buckets = 2000): WaveformPeaks {
  const levelBuckets = Array.from(new Set([
    Math.max(512, Math.floor(buckets / 2)),
    buckets,
    buckets * 4,
    buckets * 16,
  ])).filter((count) => count <= buffer.length)
  const levels = levelBuckets.map((count) => computePeakLevel(buffer, count))
  const base = levels.find((level) => level.buckets === buckets) ?? levels[levels.length - 1]
  return {
    data: base.data,
    buckets: base.buckets,
    channels: buffer.numberOfChannels,
    duration: buffer.duration,
    levels,
  }
}

function computePeakLevel(buffer: AudioBuffer, buckets: number): WaveformPeakLevel {
  const length = buffer.length
  const channels = buffer.numberOfChannels
  const data = new Float32Array(channels * buckets * 2)
  const samplesPerBucket = Math.max(1, Math.floor(length / buckets))

  for (let b = 0; b < buckets; b++) {
    const start = b * samplesPerBucket
    const end = Math.min(length, start + samplesPerBucket)
    for (let c = 0; c < channels; c++) {
      const samples = buffer.getChannelData(c)
      let min = 0
      let max = 0
      for (let i = start; i < end; i++) {
        const v = samples[i]
        if (v < min) min = v
        if (v > max) max = v
      }
      const idx = (c * buckets + b) * 2
      data[idx] = min
      data[idx + 1] = max
    }
  }
  return { data, buckets }
}
