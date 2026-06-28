import { describe, expect, it } from 'vitest'
import { detectOnsetsFromMono } from './onsetDetection'

describe('detectOnsetsFromMono', () => {
  it('detects separated transient bursts', () => {
    const sampleRate = 8000
    const samples = new Float32Array(sampleRate * 2)
    for (const time of [0.5, 1.0, 1.5]) {
      const start = Math.floor(time * sampleRate)
      for (let i = 0; i < 80; i++) samples[start + i] = Math.exp(-i / 18) * (i % 2 === 0 ? 1 : -1)
    }

    const result = detectOnsetsFromMono(samples, sampleRate, {
      fftSize: 256,
      hopSize: 64,
      threshold: 0.6,
      minIntervalSec: 0.18,
    })

    expect(result.onsets).toHaveLength(3)
    expect(result.onsets[0]).toBeCloseTo(0.5, 1)
    expect(result.onsets[1]).toBeCloseTo(1.0, 1)
    expect(result.onsets[2]).toBeCloseTo(1.5, 1)
    expect(result.strength.every((value) => value > 0)).toBe(true)
  })
})
