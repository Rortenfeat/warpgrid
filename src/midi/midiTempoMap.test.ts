import { describe, expect, it } from 'vitest'
import { inferTempoMapFromMidi } from './midiTempoMap'
import { createEmptyProject } from '../core/types'
import { exportReaper } from '../export/exportReaper'

function makeParsedMidi() {
  return {
    midi: {
      header: {
        tempos: [
          { ticks: 0, time: 0, bpm: 140.5204878871 },
          { ticks: 3360, time: 2.9888879999999998, bpm: 86.9165904939 },
          { ticks: 5760, time: 6.440472999999999, bpm: 86.9165904939 },
        ],
        timeSignatures: [
          { ticks: 0, measures: 0, timeSignature: [7, 4] },
          { ticks: 3360, measures: 1, timeSignature: [7, 4] },
          { ticks: 6720, measures: 2, timeSignature: [3, 4] },
        ],
      },
    },
    ppq: 480,
    duration: 8,
    trackCount: 0,
    noteCount: 0,
    onsetTimes: [],
  } as any
}

describe('inferTempoMapFromMidi', () => {
  it('infers anchor beats from tempo timing (beat positions in quarter-notes)', () => {
    const parsed = makeParsedMidi()
    const inferred = inferTempoMapFromMidi(parsed)

    expect(inferred.anchors).toHaveLength(3)
    expect(inferred.anchors[0].beat).toBeCloseTo(0)
    expect(inferred.anchors[1].beat).toBeCloseTo(7)
    expect(inferred.anchors[2].beat).toBeCloseTo(12)
    expect(inferred.anchors[1].time).toBeCloseTo(2.9888879999999998)
    expect(inferred.anchors[2].time).toBeCloseTo(6.440472999999999)
  })

  it('keeps tempo signature mapping in inferred project state and re-exported PT values', () => {
    const parsed = makeParsedMidi()
    const inferred = inferTempoMapFromMidi(parsed)
    const project = createEmptyProject()
    project.anchors = inferred.anchors.map((anchor, index) => ({ ...anchor, id: `a${index}` }))
    project.timeSignatures = inferred.timeSignatures.map((signature, index) => ({ ...signature, id: `ts${index}` }))

    const text = exportReaper(project)
    const lines = text
      .split('\n')
      .filter((line) => /^\s*PT /.test(line))
      .map((line) => line.replace(/\s+/g, ' '))
      .slice(0, 4)

    expect(lines[0]).toContain('PT 0.000000000000 140.5204878871')
    expect(lines[1]).toContain('PT 2.988888000000 86.9165904939')
    expect(lines[2]).toContain('PT 6.440473000000 86.9165904939')
  })
})
