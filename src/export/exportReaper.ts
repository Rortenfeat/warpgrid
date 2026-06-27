/**
 * Reaper project (.rpp) export (Phase 4 — STUB).
 *
 * .rpp is a plain-text, indented s-expression-like format. The tempo map lives
 * in a <TEMPOENVEX> ... </TEMPOENVEX> block as PT (point) lines, and time
 * signatures ride alongside tempo points. This is the most tractable DAW
 * project target, hence a first-class export.
 *
 * PT line shape (approx): `PT <time> <bpm> <shape> <flags> <num> <den>`
 *   - time: seconds
 *   - bpm: tempo at this point
 *   - shape: 0 = square (constant until next), 1 = linear ramp
 */

import { deriveTempoEvents } from '../core/tempoMap'
import type { Project } from '../core/types'

// TODO(phase-4): emit time-signature markers and validate against Reaper import.
export function exportReaper(project: Project): string {
  const events = deriveTempoEvents(project.anchors)
  const initialBpm = events[0]?.bpm ?? 120

  const points = events
    .map((ev) => {
      const shape = ev.curve === 'ramp' ? 1 : 0
      return `    PT ${ev.time.toFixed(6)} ${ev.bpm.toFixed(6)} ${shape}`
    })
    .join('\n')

  return [
    '<REAPER_PROJECT 0.1 "7.0/warpgrid" 0',
    `  TEMPO ${initialBpm.toFixed(6)} 4 4`,
    '  <TEMPOENVEX',
    points,
    '  >',
    '>',
    '',
  ].join('\n')
}
