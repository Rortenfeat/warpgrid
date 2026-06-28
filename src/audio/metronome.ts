import { beatToTime, timeToBeat } from '../core/tempoMap'
import { barStartInQuarters, quarterBeatToBarBeat, timeSignatureAtBar } from '../core/timeSignature'
import type { TimeSignatureChange, WarpAnchor } from '../core/types'

export interface MetronomeEvent {
  time: number
  beat: number
  downbeat: boolean
}

export interface MetronomeRange {
  anchors: WarpAnchor[]
  timeSignatures: TimeSignatureChange[]
  startTime: number
  endTime: number
}

const EVENT_EPSILON_SEC = 0.001
const MAX_EVENTS = 100_000

export function generateMetronomeEvents({
  anchors,
  timeSignatures,
  startTime,
  endTime,
}: MetronomeRange): MetronomeEvent[] {
  const start = Math.max(0, startTime)
  const end = Math.max(start, endTime)
  if (end <= start) return []

  const startBeat = Math.max(0, timeToBeat(start, anchors))
  let bar = Math.max(0, quarterBeatToBarBeat(startBeat, timeSignatures).bar - 1)
  const events: MetronomeEvent[] = []

  for (let guard = 0; guard < MAX_EVENTS; guard++, bar++) {
    const signature = timeSignatureAtBar(bar, timeSignatures)
    const beatStep = 4 / signature.denominator
    if (!Number.isFinite(beatStep) || beatStep <= 0 || signature.numerator <= 0) break

    const barStartBeat = barStartInQuarters(bar, timeSignatures)
    for (let beatInBar = 0; beatInBar < signature.numerator; beatInBar++) {
      const beat = barStartBeat + beatInBar * beatStep
      const time = beatToTime(beat, anchors)
      if (time >= start - EVENT_EPSILON_SEC && time <= end + EVENT_EPSILON_SEC) {
        events.push({ time, beat, downbeat: beatInBar === 0 })
      }
    }

    const nextBarTime = beatToTime(barStartBeat + signature.numerator * beatStep, anchors)
    if (nextBarTime > end + EVENT_EPSILON_SEC) break
  }

  return events.sort((a, b) => a.time - b.time)
}

export function scheduleMetronome(
  ctx: AudioContext,
  range: MetronomeRange,
): Array<{ osc: OscillatorNode; gain: GainNode }> {
  const scheduled: Array<{ osc: OscillatorNode; gain: GainNode }> = []
  const now = ctx.currentTime + 0.025

  for (const event of generateMetronomeEvents(range)) {
    const startAt = now + Math.max(0, event.time - range.startTime)
    const stopAt = startAt + (event.downbeat ? 0.07 : 0.045)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'square'
    osc.frequency.setValueAtTime(event.downbeat ? 1600 : 1050, startAt)
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(event.downbeat ? 0.11 : 0.065, startAt + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(startAt)
    osc.stop(stopAt + 0.015)
    scheduled.push({ osc, gain })
  }

  return scheduled
}
