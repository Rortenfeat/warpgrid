import { describe, expect, it } from 'vitest'
import { Midi } from '@tonejs/midi'
import { exportMidi } from './exportMidi'
import { createEmptyProject } from '../core/types'

function makeSourceMidi() {
  const midi = new Midi()
  const track = midi.addTrack()
  track.addNote({ midi: 60, ticks: 480, durationTicks: 240, velocity: 0.8 })
  track.addNote({ midi: 61, ticks: 960, durationTicks: 240, velocity: 0.7 })
  return { midi, ppq: midi.header.ppq }
}

describe('exportMidi', () => {
  it('adds a sentinel note to tempo-only MIDI so DAWs import the file', async () => {
    const project = createEmptyProject()
    project.ppq = 480
    project.anchors = [
      { id: 'anchor-origin', beat: 0, time: 0, curve: 'constant', origin: 'user' },
      { id: 'anchor-late', beat: 4, time: 2, curve: 'constant', origin: 'user' },
    ]

    const blob = exportMidi(project)
    const exported = new Midi(new Uint8Array(await blob.arrayBuffer()))

    expect(exported.tracks.length).toBeGreaterThan(0)
    expect(exported.tracks.some((track) => track.notes.length > 0)).toBe(true)
  })

  it('retimes source notes by beat-to-time mapping when source MIDI is supplied', async () => {
    const project = createEmptyProject()
    project.ppq = 480
    project.anchors = [
      { id: 'anchor-origin', beat: 0, time: 0, curve: 'constant', origin: 'user' },
      { id: 'anchor-late', beat: 4, time: 8, curve: 'constant', origin: 'user' },
    ]

    const source = makeSourceMidi()
    const blob = exportMidi(
      project,
      {
        midi: source.midi,
        ppq: source.ppq,
        duration: 0,
        trackCount: 0,
        noteCount: 0,
        onsetTimes: [],
      },
    )
    const buffer = await blob.arrayBuffer()
    const exported = new Midi(new Uint8Array(buffer))
    expect(exported.tracks.length).toBe(1)
    expect(exported.tracks[0].notes.length).toBe(2)

    // With 4 beats over 8s, 1 beat = 2s. Source ticks are quarter beats.
    expect(exported.tracks[0].notes[0].time).toBeCloseTo(2)
    expect(exported.tracks[0].notes[1].time).toBeCloseTo(4)
  })
})
