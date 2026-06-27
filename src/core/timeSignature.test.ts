import { describe, it, expect } from 'vitest'
import {
  barLengthInQuarters,
  quarterBeatToBarBeat,
  barBeatToQuarterBeat,
  timeSignatureAtBar,
} from './timeSignature'
import type { TimeSignatureChange } from './types'

function ts(bar: number, n: number, d: number): TimeSignatureChange {
  return { id: `ts-${bar}`, bar, numerator: n, denominator: d }
}

describe('barLengthInQuarters', () => {
  it('measures a bar in quarter-note beats', () => {
    expect(barLengthInQuarters({ numerator: 4, denominator: 4 })).toBe(4)
    expect(barLengthInQuarters({ numerator: 3, denominator: 4 })).toBe(3)
    expect(barLengthInQuarters({ numerator: 6, denominator: 8 })).toBe(3)
    expect(barLengthInQuarters({ numerator: 7, denominator: 8 })).toBe(3.5)
  })
})

describe('quarterBeatToBarBeat in 4/4', () => {
  const list = [ts(0, 4, 4)]
  it('splits a quarter-beat into bar and beat', () => {
    expect(quarterBeatToBarBeat(0, list)).toMatchObject({ bar: 0, beat: 0 })
    expect(quarterBeatToBarBeat(2, list)).toMatchObject({ bar: 0, beat: 2 })
    expect(quarterBeatToBarBeat(4, list)).toMatchObject({ bar: 1, beat: 0 })
    expect(quarterBeatToBarBeat(9, list)).toMatchObject({ bar: 2, beat: 1 })
  })
})

describe('time-signature changes', () => {
  // bars 0-1 in 4/4 (4 quarters each = 8 quarters), then 3/4 from bar 2.
  const list = [ts(0, 4, 4), ts(2, 3, 4)]

  it('selects the effective signature at a bar', () => {
    expect(timeSignatureAtBar(1, list)).toMatchObject({ numerator: 4 })
    expect(timeSignatureAtBar(2, list)).toMatchObject({ numerator: 3 })
    expect(timeSignatureAtBar(5, list)).toMatchObject({ numerator: 3 })
  })

  it('accounts for the change when converting position', () => {
    // 8 quarters consumed by bars 0-1 (4/4). Bar 2 is 3/4 -> beat 0 at q=8.
    expect(quarterBeatToBarBeat(8, list)).toMatchObject({ bar: 2, beat: 0 })
    // q=11 -> bar 2 used 3 quarters -> bar 3 beat 0
    expect(quarterBeatToBarBeat(11, list)).toMatchObject({ bar: 3, beat: 0 })
  })

  it('round-trips bar/beat <-> quarter beat', () => {
    for (const [bar, beat] of [[0, 0], [1, 3], [2, 1], [4, 2]] as const) {
      const q = barBeatToQuarterBeat(bar, beat, list)
      expect(quarterBeatToBarBeat(q, list)).toMatchObject({ bar, beat })
    }
  })
})

describe('eighth-based meter (6/8)', () => {
  const list = [ts(0, 6, 8)]
  it('reports beats in denominator units', () => {
    // 6/8 bar = 3 quarters; q=1.5 is the midpoint -> beat 3 (eighths)
    expect(quarterBeatToBarBeat(1.5, list)).toMatchObject({ bar: 0, beat: 3 })
    expect(quarterBeatToBarBeat(3, list)).toMatchObject({ bar: 1, beat: 0 })
  })
})
