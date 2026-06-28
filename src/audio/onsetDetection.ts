/**
 * Onset detection.
 *
 * Spectral-flux onset detection over an STFT of the mono signal, with adaptive
 * thresholding and peak picking. This intentionally stays dependency-free; a
 * heavier essentia.js / aubio-wasm backend can sit behind this same interface
 * later.
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
  /** Minimum gap between accepted onsets, in seconds. */
  minIntervalSec?: number
}

export async function detectOnsets(buffer: AudioBuffer, options: OnsetOptions = {}): Promise<OnsetResult> {
  const mono = mixToMono(buffer)
  return detectOnsetsFromMono(mono, buffer.sampleRate, options)
}

export function detectOnsetsFromMono(samples: Float32Array, sampleRate: number, options: OnsetOptions = {}): OnsetResult {
  const fftSize = nextPowerOfTwo(options.fftSize ?? 1024)
  const hopSize = Math.max(64, options.hopSize ?? Math.floor(fftSize / 2))
  const threshold = options.threshold ?? 1.25
  const minIntervalSec = options.minIntervalSec ?? 0.08
  if (samples.length < fftSize || sampleRate <= 0) return { onsets: [], strength: [] }

  const window = hann(fftSize)
  const real = new Float32Array(fftSize)
  const imag = new Float32Array(fftSize)
  const previous = new Float32Array(fftSize / 2)
  const flux: number[] = []

  for (let start = 0; start + fftSize <= samples.length; start += hopSize) {
    for (let i = 0; i < fftSize; i++) {
      real[i] = samples[start + i] * window[i]
      imag[i] = 0
    }
    fft(real, imag)
    let value = 0
    for (let bin = 1; bin < fftSize / 2; bin++) {
      const mag = Math.hypot(real[bin], imag[bin])
      const diff = mag - previous[bin]
      if (diff > 0) value += diff
      previous[bin] = mag
    }
    flux.push(value)
  }

  const maxFlux = Math.max(...flux, 1)
  const normalized = flux.map((value) => value / maxFlux)
  const onsets: number[] = []
  const strength: number[] = []
  const radius = Math.max(3, Math.round(0.12 * sampleRate / hopSize))
  let lastOnset = -Infinity

  for (let i = radius; i < normalized.length - radius; i++) {
    const local = normalized.slice(i - radius, i + radius + 1)
    const mean = local.reduce((sum, value) => sum + value, 0) / local.length
    const variance = local.reduce((sum, value) => sum + (value - mean) ** 2, 0) / local.length
    const gate = mean + Math.sqrt(variance) * threshold
    const isPeak = normalized[i] > gate && normalized[i] >= normalized[i - 1] && normalized[i] > normalized[i + 1]
    const time = (i * hopSize + fftSize / 2) / sampleRate
    if (!isPeak || time - lastOnset < minIntervalSec) continue
    onsets.push(time)
    strength.push(normalized[i])
    lastOnset = time
  }

  return { onsets, strength }
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length)
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < buffer.length; i++) mono[i] += data[i] / buffer.numberOfChannels
  }
  return mono
}

function hann(size: number): Float32Array {
  const out = new Float32Array(size)
  for (let i = 0; i < size; i++) out[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)))
  return out
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)))
}

function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = real[i]; real[i] = real[j]; real[j] = tr
      const ti = imag[i]; imag[i] = imag[j]; imag[j] = ti
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len
    const wLenR = Math.cos(angle)
    const wLenI = Math.sin(angle)
    for (let i = 0; i < n; i += len) {
      let wr = 1
      let wi = 0
      for (let j = 0; j < len / 2; j++) {
        const uR = real[i + j]
        const uI = imag[i + j]
        const vR = real[i + j + len / 2] * wr - imag[i + j + len / 2] * wi
        const vI = real[i + j + len / 2] * wi + imag[i + j + len / 2] * wr
        real[i + j] = uR + vR
        imag[i + j] = uI + vI
        real[i + j + len / 2] = uR - vR
        imag[i + j + len / 2] = uI - vI
        const nextWr = wr * wLenR - wi * wLenI
        wi = wr * wLenI + wi * wLenR
        wr = nextWr
      }
    }
  }
}
