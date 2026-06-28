import type { ParsedMidi } from './parseMidi'
import type { TimeSignatureChange, WarpAnchor } from '../core/types'

export interface InferredTempoMap {
  anchors: Array<Omit<WarpAnchor, 'id'>>
  timeSignatures: Array<Omit<TimeSignatureChange, 'id'>>
}

const EPSILON = 1e-9

function normalizeFinite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toPositiveInteger(value: unknown, fallback: number): number {
  const normalized = normalizeFinite(value, fallback)
  return Math.max(1, Math.round(Math.abs(normalized)))
}

/**
 * Build a warp-map approximation from MIDI tempo/timesig meta events.
 *
 * - Anchors pin quarter-beat positions (`beat`) to source time (seconds).
 * - Time-signature changes are mapped from bars (`measures`) to Tempogrid's
 *   signature model.
 *
 * The first tempo event is always preserved. If only one tempo event exists,
 * a trailing anchor is derived from source duration so exports preserve that BPM.
 */
export function inferTempoMapFromMidi(parsedMidi: ParsedMidi): InferredTempoMap {
  const ppq = parsedMidi.ppq || parsedMidi.midi.header.ppq || 480
  const tempos = [...(parsedMidi.midi.header.tempos || [])].sort((a, b) => {
    return (a.ticks ?? 0) - (b.ticks ?? 0)
  })

  const anchors: InferredTempoMap['anchors'] = []
  if (tempos.length > 0) {
    const first = tempos[0]
    let prevBeat = normalizeFinite(first.ticks, 0) / ppq
    let prevTime = tempoTime(parsedMidi, first)
    let prevBpm = normalizeFinite(first.bpm, 120)

    anchors.push({
      beat: prevBeat,
      time: prevTime,
      curve: 'constant',
      origin: 'user',
    })

    for (let i = 1; i < tempos.length; i++) {
      const current = tempos[i]
      const currentBeat = normalizeFinite(current.ticks, prevBeat * ppq) / ppq
      const currentTime = tempoTime(parsedMidi, current, prevTime + Math.max(0, currentBeat - prevBeat) * 60 / prevBpm)
      const currentBpm = normalizeFinite(current.bpm, prevBpm)

      if (
        Math.abs(currentBeat - anchors[anchors.length - 1].beat) > EPSILON ||
        Math.abs(currentTime - anchors[anchors.length - 1].time) > EPSILON
      ) {
        anchors.push({
          beat: currentBeat,
          time: currentTime,
          curve: 'constant',
          origin: 'user',
        })
      }
      prevBeat = currentBeat
      prevTime = currentTime
      prevBpm = currentBpm
    }

    if (anchors.length === 1 && Number.isFinite(parsedMidi.duration) && parsedMidi.duration > 0) {
      const terminalBeat = anchors[0].beat + Math.max(4, parsedMidi.duration * prevBpm / 60)
      anchors.push({
        beat: terminalBeat,
        time: Math.max(0, prevTime + parsedMidi.duration),
        curve: 'constant',
        origin: 'user',
      })
    }
  }

  const signatureEvents = [...(parsedMidi.midi.header.timeSignatures || [])].sort(
    (a, b) => normalizeFinite(a.ticks, 0) - normalizeFinite(b.ticks, 0),
  )
  const timeSignatures: InferredTempoMap['timeSignatures'] = []
  const seenBars = new Set<number>()
  for (const sig of signatureEvents) {
    const bar = normalizeFinite(sig.measures, Number.NaN)
    if (!Number.isFinite(bar)) continue
    const barKey = Math.max(0, Math.round(bar))
    if (seenBars.has(barKey)) continue
    seenBars.add(barKey)
    timeSignatures.push({
      bar: barKey,
      numerator: toPositiveInteger(sig.timeSignature?.[0], 4),
      denominator: toPositiveInteger(sig.timeSignature?.[1], 4),
    })
  }

  return { anchors, timeSignatures }
}

function tempoTime(parsedMidi: ParsedMidi, tempo: { ticks: number; time?: number }, fallback = 0): number {
  if (tempo.time != null && Number.isFinite(tempo.time)) return tempo.time
  if (typeof parsedMidi.midi.header.ticksToSeconds === 'function') {
    return parsedMidi.midi.header.ticksToSeconds(tempo.ticks)
  }
  return fallback
}
