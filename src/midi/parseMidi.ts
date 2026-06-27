/**
 * MIDI import via @tonejs/midi.
 *
 * Parses a Standard MIDI File into note/timing data we can render as a piano
 * roll and analyse for tempo. The parsed Midi object is heavy and lives in the
 * runtime media registry, not in the undoable project state.
 */

import { Midi } from '@tonejs/midi'

export interface ParsedMidi {
  midi: Midi
  duration: number
  trackCount: number
  noteCount: number
  /** Header PPQ (ticks per quarter) for faithful re-export. */
  ppq: number
  /** Note onset times in seconds across all tracks, ascending (for analysis). */
  onsetTimes: number[]
}

export async function parseMidiFile(file: File): Promise<ParsedMidi> {
  const arrayBuffer = await file.arrayBuffer()
  const midi = new Midi(arrayBuffer)

  let noteCount = 0
  const onsetTimes: number[] = []
  for (const track of midi.tracks) {
    noteCount += track.notes.length
    for (const note of track.notes) onsetTimes.push(note.time)
  }
  onsetTimes.sort((a, b) => a - b)

  return {
    midi,
    duration: midi.duration,
    trackCount: midi.tracks.length,
    noteCount,
    ppq: midi.header.ppq,
    onsetTimes,
  }
}
