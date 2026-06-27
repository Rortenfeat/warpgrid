/**
 * Generic tempo-map export (CSV).
 *
 * A DAW-agnostic fallback: a flat table of tempo change points. Easy to import
 * into a spreadsheet or post-process for any DAW that lacks a dedicated path.
 */

import { deriveTempoEvents } from '../core/tempoMap'
import { quarterBeatToBarBeat } from '../core/timeSignature'
import type { Project } from '../core/types'

export function exportTempoMapCsv(project: Project): Blob {
  const events = deriveTempoEvents(project.anchors)
  const rows = ['time_sec,beat,bar,beat_in_bar,bpm,curve']
  for (const ev of events) {
    const { bar, beat } = quarterBeatToBarBeat(ev.beat, project.timeSignatures)
    rows.push(
      [ev.time.toFixed(6), ev.beat, bar + 1, (beat + 1).toFixed(3), ev.bpm.toFixed(4), ev.curve].join(','),
    )
  }
  return new Blob([rows.join('\n') + '\n'], { type: 'text/csv' })
}
