import { describe, it, expect } from 'vitest'
import {
  timeForSegmentBpm,
  snapTime,
  segmentIndexAtBeat,
  setSegmentBpmEdits,
  segmentBpmAt,
} from './tempoEdit'
import { segmentBpm, deriveTempoSegments } from './tempoMap'
import type { WarpAnchor } from './types'

function anchor(beat: number, time: number, id = `a-${beat}`): WarpAnchor {
  return { id, beat, time, curve: 'constant', origin: 'user' }
}

describe('timeForSegmentBpm', () => {
  it('is the inverse of segmentBpm', () => {
    const start = anchor(0, 0)
    const end = anchor(4, 99) // time will be recomputed
    for (const bpm of [60, 90, 120, 137.5]) {
      const t = timeForSegmentBpm(start, end, bpm)
      const moved = { ...end, time: t }
      expect(segmentBpm(start, moved)).toBeCloseTo(bpm)
    }
  })

  it('120 BPM puts 4 beats at 2 seconds', () => {
    expect(timeForSegmentBpm(anchor(0, 0), anchor(4, 0), 120)).toBeCloseTo(2)
  })
})

describe('snapTime', () => {
  it('snaps to the nearest candidate within tolerance', () => {
    expect(snapTime(1.02, [0, 1, 2], 0.05)).toBeCloseTo(1)
    expect(snapTime(1.48, [0, 1, 2], 0.05)).toBeCloseTo(1.48) // nothing close
    expect(snapTime(1.97, [0, 1, 2], 0.1)).toBeCloseTo(2)
  })

  it('picks the closest when several are in range', () => {
    expect(snapTime(1.4, [1, 1.5], 1)).toBeCloseTo(1.5)
  })
})

describe('segmentIndexAtBeat', () => {
  const anchors = [anchor(0, 0), anchor(4, 2), anchor(8, 6)]
  it('locates the bracketing segment', () => {
    expect(segmentIndexAtBeat(anchors, 1)).toBe(0)
    expect(segmentIndexAtBeat(anchors, 5)).toBe(1)
  })
  it('returns the open tail index at/after the last anchor', () => {
    expect(segmentIndexAtBeat(anchors, 8)).toBe(2)
    expect(segmentIndexAtBeat(anchors, 99)).toBe(2)
  })
  it('returns -1 with fewer than two anchors', () => {
    expect(segmentIndexAtBeat([anchor(0, 0)], 1)).toBe(-1)
  })
})

describe('setSegmentBpmEdits — downstream tempo invariance', () => {
  // seg0 0..4 / 0..2s = 120, seg1 4..8 / 2..6s = 60, seg2 8..12 / 6..10s = 60
  const anchors = [anchor(0, 0, 'A'), anchor(4, 2, 'B'), anchor(8, 6, 'C'), anchor(12, 10, 'D')]

  it('changes only the targeted segment BPM and shifts the rest rigidly', () => {
    // Re-target seg0 (A->B) to 90 BPM.
    const edits = setSegmentBpmEdits(anchors, 'A', 90)
    // B,C,D all move; A stays.
    expect(edits['A']).toBeUndefined()
    const applied = anchors.map((a) => (edits[a.id] != null ? { ...a, time: edits[a.id] } : a))

    // seg0 now exactly 90 BPM.
    expect(segmentBpm(applied[0], applied[1])).toBeCloseTo(90)
    // Downstream segments keep their original tempos (60 and 60).
    expect(segmentBpm(applied[1], applied[2])).toBeCloseTo(60)
    expect(segmentBpm(applied[2], applied[3])).toBeCloseTo(60)
  })

  it('shifts all downstream anchors by the same delta', () => {
    const edits = setSegmentBpmEdits(anchors, 'A', 90)
    const dB = edits['B'] - 2
    const dC = edits['C'] - 6
    const dD = edits['D'] - 10
    expect(dC).toBeCloseTo(dB)
    expect(dD).toBeCloseTo(dB)
  })

  it('returns no edits for the open trailing segment', () => {
    expect(setSegmentBpmEdits(anchors, 'D', 100)).toEqual({})
  })
})

describe('segmentBpmAt', () => {
  const anchors = [anchor(0, 0, 'A'), anchor(4, 2, 'B'), anchor(8, 6, 'C')]
  it('reports the segment tempo at an anchor', () => {
    expect(segmentBpmAt(anchors, 'A')).toBeCloseTo(120)
    expect(segmentBpmAt(anchors, 'B')).toBeCloseTo(60)
  })
  it('uses the prior segment for the open tail anchor', () => {
    expect(segmentBpmAt(anchors, 'C')).toBeCloseTo(60)
  })
  it('agrees with deriveTempoSegments', () => {
    const segs = deriveTempoSegments(anchors)
    expect(segmentBpmAt(anchors, 'A')).toBeCloseTo(segs[0].startBpm)
    expect(segmentBpmAt(anchors, 'B')).toBeCloseTo(segs[1].startBpm)
  })
})
