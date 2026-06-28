import { describe, it, expect } from 'vitest'
import {
  beatToTime,
  timeToBeat,
  tempoAtBeat,
  segmentBpm,
  deriveTempoEvents,
  deriveTempoSegments,
} from './tempoMap'
import type { WarpAnchor } from './types'

function anchor(beat: number, time: number, partial: Partial<WarpAnchor> = {}): WarpAnchor {
  return { id: `a-${beat}`, beat, time, curve: 'constant', origin: 'user', ...partial }
}

describe('segmentBpm', () => {
  it('computes average BPM from endpoints', () => {
    // 4 beats over 2 seconds = 2 beats/sec = 120 BPM
    expect(segmentBpm(anchor(0, 0), anchor(4, 2))).toBeCloseTo(120)
    // 4 beats over 4 seconds = 60 BPM
    expect(segmentBpm(anchor(0, 0), anchor(4, 4))).toBeCloseTo(60)
  })

  it('falls back on degenerate endpoints', () => {
    expect(segmentBpm(anchor(0, 0), anchor(0, 1), 99)).toBe(99)
    expect(segmentBpm(anchor(0, 0), anchor(4, 0), 99)).toBe(99)
  })
})

describe('beatToTime / timeToBeat with no anchors', () => {
  it('maps from origin at default BPM (120)', () => {
    // At 120 BPM, 1 beat = 0.5s
    expect(beatToTime(8, [])).toBeCloseTo(4)
    expect(timeToBeat(4, [])).toBeCloseTo(8)
  })
})

describe('beatToTime / timeToBeat with one anchor', () => {
  it('extrapolates from the single anchor at default BPM', () => {
    const a = [anchor(4, 10)]
    // 4 more beats at 120bpm = +2s
    expect(beatToTime(8, a)).toBeCloseTo(12)
    expect(timeToBeat(12, a)).toBeCloseTo(8)
  })
})

describe('piecewise-constant tempo map', () => {
  // Segment 1: beats 0..4 over 0..2s  -> 120 BPM
  // Segment 2: beats 4..8 over 2..6s  -> 60 BPM (slowing down)
  const anchors = [anchor(0, 0), anchor(4, 2), anchor(8, 6)]

  it('reports the correct tempo per segment', () => {
    expect(tempoAtBeat(2, anchors)).toBeCloseTo(120)
    expect(tempoAtBeat(6, anchors)).toBeCloseTo(60)
  })

  it('interpolates time linearly within a segment', () => {
    expect(beatToTime(2, anchors)).toBeCloseTo(1) // halfway through seg 1
    expect(beatToTime(6, anchors)).toBeCloseTo(4) // halfway through seg 2
  })

  it('extrapolates beyond the last anchor at the last tempo', () => {
    // After beat 8 tempo stays 60 BPM (1 beat = 1s)
    expect(beatToTime(10, anchors)).toBeCloseTo(8)
  })

  it('extrapolates before the first anchor at the first tempo', () => {
    // Before beat 0 tempo is 120 BPM (1 beat = 0.5s) -> beat -2 = -1s
    expect(beatToTime(-2, anchors)).toBeCloseTo(-1)
  })

  it('round-trips beat -> time -> beat across segments', () => {
    for (const beat of [0, 1.5, 4, 5.25, 8, 9.5]) {
      expect(timeToBeat(beatToTime(beat, anchors), anchors)).toBeCloseTo(beat)
    }
  })

  it('round-trips time -> beat -> time across segments', () => {
    for (const time of [0, 0.75, 2, 3.3, 6, 7.5]) {
      expect(beatToTime(timeToBeat(time, anchors), anchors)).toBeCloseTo(time)
    }
  })

  it('matches anchor pin points exactly', () => {
    for (const a of anchors) {
      expect(beatToTime(a.beat, anchors)).toBeCloseTo(a.time)
      expect(timeToBeat(a.time, anchors)).toBeCloseTo(a.beat)
    }
  })
})

describe('smooth destination anchors', () => {
  const anchors = [
    anchor(0, 0),
    anchor(4, 2),
    anchor(8, 6, { curve: 'ramp' }),
  ]

  it('uses the destination anchor curve for the preceding segment', () => {
    const segs = deriveTempoSegments(anchors)
    expect(segs[0]).toMatchObject({ startBeat: 0, endBeat: 4, curve: 'constant' })
    expect(segs[1]).toMatchObject({ startBeat: 4, endBeat: 8, curve: 'ramp' })
    expect(segs[1].startBpm).toBeCloseTo(120)
    expect(segs[1].endBpm).toBeLessThan(60)
  })

  it('pins smooth segment endpoints exactly and changes tempo within the segment', () => {
    expect(beatToTime(4, anchors)).toBeCloseTo(2)
    expect(beatToTime(8, anchors)).toBeCloseTo(6)
    expect(tempoAtBeat(4, anchors)).toBeCloseTo(120)
    expect(tempoAtBeat(8, anchors)).toBeLessThan(60)
    expect(beatToTime(6, anchors)).not.toBeCloseTo(4)
  })

  it('round-trips through smooth segments', () => {
    for (const beat of [4, 4.5, 6, 7.25, 8]) {
      expect(timeToBeat(beatToTime(beat, anchors), anchors)).toBeCloseTo(beat)
    }
    for (const time of [2, 2.4, 3.5, 5.5, 6]) {
      expect(beatToTime(timeToBeat(time, anchors), anchors)).toBeCloseTo(time)
    }
  })
})

describe('deriveTempoSegments / deriveTempoEvents', () => {
  const anchors = [anchor(0, 0), anchor(4, 2), anchor(8, 6)]

  it('produces one segment per gap plus a trailing open segment', () => {
    const segs = deriveTempoSegments(anchors)
    expect(segs).toHaveLength(3)
    expect(segs[0]).toMatchObject({ startBeat: 0, endBeat: 4, startBpm: 120 })
    expect(segs[1]).toMatchObject({ startBeat: 4, endBeat: 8, startBpm: 60 })
    expect(segs[2].endBeat).toBe(Infinity)
  })

  it('produces one tempo event per anchor for export', () => {
    const events = deriveTempoEvents(anchors)
    expect(events.map((e) => Math.round(e.bpm))).toEqual([120, 60, 60])
    expect(events.map((e) => e.beat)).toEqual([0, 4, 8])
  })

  it('handles the empty/single-anchor cases at default tempo', () => {
    expect(deriveTempoSegments([])[0].startBpm).toBe(120)
    expect(deriveTempoSegments([anchor(0, 0)])[0].startBpm).toBe(120)
  })
})
