/**
 * MIDI export (Phase 4 — STUB wiring done, note re-timing TODO).
 *
 * Serializes the project's tempo map + time signatures into an .mid file via
 * buildTempoMapMidi. Returns a Blob the UI can download.
 */

import { buildTempoMapMidi } from '../midi/writeMidi'
import { deriveTempoEvents } from '../core/tempoMap'
import type { Project } from '../core/types'

export function exportMidi(project: Project): Blob {
  const tempoEvents = deriveTempoEvents(project.anchors)
  const midi = buildTempoMapMidi({
    tempoEvents,
    timeSignatures: project.timeSignatures,
    ppq: project.ppq,
  })
  // TODO(phase-4): merge re-timed notes from a source MIDI when present.
  return new Blob([midi.toArray() as unknown as BlobPart], { type: 'audio/midi' })
}
