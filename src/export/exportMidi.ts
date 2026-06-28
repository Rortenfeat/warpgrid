/**
 * MIDI export (Phase 4).
 *
 * Exports tempo map + time signatures, and if a source MIDI is provided, retimes
 * its notes and automation events into the current Warpgrid tempo map.
 */

import { Midi } from '@tonejs/midi'
import { buildTempoMapMidi } from '../midi/writeMidi'
import { deriveTempoEvents } from '../core/tempoMap'
import { beatToTime } from '../core/tempoMap'
import { barStartInQuarters } from '../core/timeSignature'
import { sortedTimeSignatures } from '../core/timeSignature'
import type { Project } from '../core/types'
import type { ParsedMidi } from '../midi/parseMidi'

export interface MidiExportOptions {
  project: Project
  sourceMidi?: ParsedMidi
}

/**
 * Serialize the project as MIDI.
 * - No source MIDI: tempo-map-only conductor MIDI.
 * - With source MIDI: retime all source events into the current map.
 */
export function exportMidi(project: Project, sourceMidi?: ParsedMidi): Blob
export function exportMidi(options: MidiExportOptions): Blob
export function exportMidi(first: Project | MidiExportOptions, maybeSource?: ParsedMidi): Blob {
  const resolvedProject = isProject(first)
    ? first
    : first.project
  const resolvedSource = isProject(first)
    ? maybeSource
    : first.sourceMidi

  if (!resolvedSource) {
    const defaultDuration = estimateSentinelDuration(resolvedProject)
    const tempoEvents = deriveTempoEvents(resolvedProject.anchors)
    const midi = buildTempoMapMidi({
      tempoEvents,
      timeSignatures: resolvedProject.timeSignatures,
      ppq: resolvedProject.ppq,
      sentinelDurationSec: defaultDuration,
    })
    return new Blob([midi.toArray() as unknown as BlobPart], { type: 'audio/midi' })
  }

  const midi = retimeSourceMidi(resolvedProject, resolvedSource)
  return new Blob([midi.toArray() as unknown as BlobPart], { type: 'audio/midi' })
}

function isProject(value: Project | MidiExportOptions): value is Project {
  return 'anchors' in value && 'sources' in value
}

function retimeSourceMidi(project: Project, source: ParsedMidi): Midi {
  const sourcePpq = source.ppq || 480
  const outputPpq = project.ppq || 480
  const base = source.midi.clone()

  // Replace tempo/time-signature map from Warpgrid.
  const tempoEvents = deriveTempoEvents(project.anchors)
  base.header.fromJSON({
    name: 'Warpgrid Retimed',
    ppq: outputPpq,
    meta: [],
    keySignatures: [],
    tempos: tempoEvents.map((ev) => ({
      ticks: Math.round(ev.beat * outputPpq),
      bpm: ev.bpm,
    })),
    timeSignatures: project.timeSignatures.map((ts) => ({
      ticks: Math.round(barStartInQuarters(ts.bar, project.timeSignatures) * outputPpq),
      timeSignature: [ts.numerator, ts.denominator],
    })),
  })

  const anchors = project.anchors
  if (!anchors.length) return base

  for (const track of base.tracks) {
    for (const note of track.notes) {
      const startBeat = note.ticks / sourcePpq
      const endBeat = (note.ticks + note.durationTicks) / sourcePpq
      const startTime = beatToTime(startBeat, anchors)
      const endTime = beatToTime(endBeat, anchors)
      note.ticks = Math.max(0, base.header.secondsToTicks(startTime))
      note.durationTicks = Math.max(1, base.header.secondsToTicks(endTime) - note.ticks)
    }

    for (const key in track.controlChanges) {
      const ccList = track.controlChanges[key]
      if (!ccList) continue
      for (const cc of ccList) {
        const beat = cc.ticks / sourcePpq
        cc.ticks = Math.max(0, base.header.secondsToTicks(beatToTime(beat, anchors)))
      }
    }

    for (const bend of track.pitchBends) {
      const beat = bend.ticks / sourcePpq
      bend.ticks = Math.max(0, base.header.secondsToTicks(beatToTime(beat, anchors)))
    }

    track.name = track.name || 'Track'
  }

  if (!base.tracks.some((track) => track.notes.length > 0)) {
    const sentinelDurationSec = estimateSentinelDuration(project, source)
    const track = base.addTrack()
    track.name = 'Warpgrid Sentinel'
    track.addNote({
      midi: 48,
      time: 0,
      duration: Math.max(0.5, sentinelDurationSec),
      velocity: 0.01,
    })
  }

  base.header.update()
  return base
}

function estimateSentinelDuration(project: Project, source?: ParsedMidi): number {
  if (source?.duration && source.duration > 0) return Math.max(0.5, source.duration)
  const anchors = sortedTimeSignatures(project.timeSignatures)
  if (project.anchors.length >= 2) {
    const first = project.anchors.reduce((min, cur) => (cur.time < min.time ? cur : min), project.anchors[0]).time
    const last = project.anchors.reduce((max, cur) => (cur.time > max.time ? cur : max), project.anchors[0]).time
    return Math.max(0.5, last - first)
  }
  const lastTs = anchors.length ? anchors[anchors.length - 1] : undefined
  const beatSpan = lastTs ? barStartInQuarters(lastTs.bar, project.timeSignatures) + 4 : 4
  return Math.max(0.5, beatSpan * (60 / 120))
}
