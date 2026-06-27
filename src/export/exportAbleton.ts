/**
 * Ableton Live set (.als) export (Phase 4 — STUB).
 *
 * An .als file is a gzip-compressed XML document. Tempo lives as an automation
 * envelope on the master track's Tempo parameter (a list of float events keyed
 * by beat time). Exporting means building that XML from the tempo map and
 * gzip-compressing it with pako.
 *
 * Live's schema varies across versions; a concrete target version + a reference
 * .als template will be locked in during Phase 4 (see ROADMAP risks).
 */

import { gzip } from 'pako'
import { deriveTempoEvents } from '../core/tempoMap'
import type { Project } from '../core/types'

// TODO(phase-4): build a real Live XML tree (master Tempo automation envelope).
export function exportAbleton(project: Project): Blob {
  const events = deriveTempoEvents(project.anchors)

  // Placeholder XML skeleton — NOT yet a valid Live set. Demonstrates the
  // gzip pipeline; the automation envelope is filled in during Phase 4.
  const automationEvents = events
    .map((ev, i) => `        <FloatEvent Id="${i}" Time="${ev.beat}" Value="${ev.bpm}" />`)
    .join('\n')

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Ableton MajorVersion="5" MinorVersion="0" Creator="Warpgrid">',
    '  <!-- TODO(phase-4): real LiveSet / MasterTrack / Tempo automation tree -->',
    '  <TempoAutomation>',
    automationEvents,
    '  </TempoAutomation>',
    '</Ableton>',
    '',
  ].join('\n')

  const compressed = gzip(xml)
  return new Blob([compressed as unknown as BlobPart], { type: 'application/gzip' })
}
