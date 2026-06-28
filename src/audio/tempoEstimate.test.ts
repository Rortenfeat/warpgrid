import { describe, expect, it } from 'vitest'
import { estimateTempo } from './tempoEstimate'

describe('estimateTempo', () => {
  it('estimates a regular tempo from onset intervals', () => {
    const onsets = {
      onsets: [0, 0.5, 1.0, 1.5, 2.0, 2.5],
      strength: [1, 0.8, 0.9, 0.85, 0.95, 0.9],
    }

    const estimate = estimateTempo(onsets, { minBpm: 80, maxBpm: 160 })

    expect(estimate.beats.length).toBeGreaterThan(3)
    expect(estimate.bpm[0]).toBeCloseTo(120, 0)
  })
})
