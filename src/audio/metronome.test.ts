import { describe, expect, it } from 'vitest'
import { generateMetronomeEvents } from './metronome'
import type { TimeSignatureChange, WarpAnchor } from '../core/types'

const anchors: WarpAnchor[] = [
  { id: 'origin', beat: 0, time: 0, curve: 'constant', origin: 'user' },
]

const fourFour: TimeSignatureChange[] = [
  { id: 'ts-0', bar: 0, numerator: 4, denominator: 4 },
]

describe('generateMetronomeEvents', () => {
  it('generates quarter-note clicks at the default tempo', () => {
    const events = generateMetronomeEvents({
      anchors,
      timeSignatures: fourFour,
      startTime: 0.2,
      endTime: 1.55,
    })

    expect(events.map((event) => event.time)).toEqual([0.5, 1, 1.5])
    expect(events.map((event) => event.downbeat)).toEqual([false, false, false])
  })

  it('accents downbeats and honors denominator beats', () => {
    const events = generateMetronomeEvents({
      anchors,
      timeSignatures: [{ id: 'ts-0', bar: 0, numerator: 6, denominator: 8 }],
      startTime: 0,
      endTime: 1.26,
    })

    expect(events.map((event) => event.time)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25])
    expect(events.map((event) => event.downbeat)).toEqual([true, false, false, false, false, false])
  })
})
