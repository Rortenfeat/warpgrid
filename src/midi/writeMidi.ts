/**
 * MIDI writing helpers (Phase 4 — partial STUB).
 *
 * Builds a Standard MIDI File whose tempo map and time-signature meta events
 * come from the Warpgrid project. Used by export/exportMidi.ts. When a source
 * MIDI exists we re-time its notes against the new tempo map; otherwise we emit
 * a tempo-only "conductor" file (a track carrying just the map).
 */

import { Midi } from '@tonejs/midi'
import { barStartInQuarters } from '../core/timeSignature'
import type { TempoEvent, TimeSignatureChange } from '../core/types'

export interface TempoMapMidiOptions {
  tempoEvents: TempoEvent[]
  timeSignatures: TimeSignatureChange[]
  ppq: number
  sentinelDurationSec?: number
}

/**
 * Create a tempo-only MIDI carrying just the tempo map and time signatures.
 * TODO(phase-4): also support re-timing an existing source Midi's note ticks.
 */
export function buildTempoMapMidi({ tempoEvents, timeSignatures, ppq, sentinelDurationSec }: TempoMapMidiOptions): Midi {
  const midi = new Midi()
  // ppq is a getter; set the whole header via fromJSON to honor the project PPQ.
  midi.header.fromJSON({
    name: 'Warpgrid Tempo Map',
    ppq,
    meta: [],
    keySignatures: [],
    tempos: tempoEvents.map((ev) => ({ ticks: Math.round(ev.beat * ppq), bpm: ev.bpm })),
    timeSignatures: timeSignatures.map((ts) => ({
      // Bar index -> ticks, accounting for the lengths of any prior signatures.
      ticks: Math.round(barStartInQuarters(ts.bar, timeSignatures) * ppq),
      timeSignature: [ts.numerator, ts.denominator],
    })),
  })
  midi.header.update()

  if (sentinelDurationSec != null && sentinelDurationSec > 0) {
    const track = midi.addTrack()
    track.name = 'Warpgrid Sentinel'
    track.addNote({
      midi: 48,
      time: 0,
      duration: sentinelDurationSec,
      velocity: 0.01,
    })
  }

  return midi
}
