import { beatToTime, deriveTempoEvents, timeToBeat } from '../core/tempoMap'
import { barStartInQuarters, sortedTimeSignatures } from '../core/timeSignature'
import type { Project, SegmentCurve, WarpAnchor } from '../core/types'

interface TempoPoint {
  beat: number
  time: number
  bpm: number
  curve: SegmentCurve
}

export function exportReaper(project: Project): string {
  const events = deriveTempoEvents(project.anchors)
  const initialBpm = events[0]?.bpm ?? 120
  const sortedTs = sortedTimeSignatures(project.timeSignatures)

  const firstTs = sortedTs[0]
  const numerator = firstTs?.numerator ?? 4
  const denominator = firstTs?.denominator ?? 4

  const points = mergeTempoAndSignaturePoints(events, project.anchors, sortedTs)

  const signatureLookup = createSignatureLookup(sortedTs)
  const tempoPointLines = points.map((point, i) => {
    const sig = signatureLookup(point.beat)
    const prevSig = i === 0 ? sig : signatureLookup(points[i - 1].beat)
    const isSignatureChange = i === 0 || prevSig.numerator !== sig.numerator || prevSig.denominator !== sig.denominator
    // Reaper's tempo envelope parser in existing .rpp templates appears to expect
    // PT shape=1 for stable behavior (legacy reference files use 1 consistently).
    const shape = 1
    return isSignatureChange
      ? `    PT ${point.time.toFixed(12)} ${point.bpm.toFixed(10)} ${shape} ${262144 + sig.numerator} 0 1 0 "" 0 0 0`
      : `    PT ${point.time.toFixed(12)} ${point.bpm.toFixed(10)} ${shape}`
  })

  const projectLength = points.length ? points[points.length - 1].time + 4 : 4
  const sentinelLengthTicks = Math.max(4, Math.ceil(timeToBeat(projectLength, project.anchors))) * 480

  const headerLines = [
    '<REAPER_PROJECT 0.1 "7.72/win64" 1782641470 0',
    '  <NOTES 0 2',
    '  >',
    '  RIPPLE 0 0',
    '  GROUPOVERRIDE 0 0 0 0',
    '  AUTOXFADE 129',
    '  ENVATTACH 3',
    '  POOLEDENVATTACH 0',
    '  TCPUIFLAGS 0',
    '  MIXERUIFLAGS 11 48',
    '  ENVFADESZ10 40',
    '  PEAKGAIN 1',
    '  FEEDBACK 0',
    '  PANLAW 1',
    '  PROJOFFS 0 0 0',
    '  MAXPROJLEN 0 0',
    '  GRID 3199 8 1 8 1 0 0 0',
    '  TIMEMODE 1 5 -1 30 0 0 -1 0',
    '  VIDEO_CONFIG 0 0 65792',
    '  PANMODE 3',
    '  PANLAWFLAGS 3',
    '  USE_REC_CFG 0',
    '  RECMODE 1',
    '  SMPTESYNC 0 30 100 40 1000 300 0 0 1 0 0',
    '  LOOP 0',
    '  LOOPGRAN 0 4',
    '  RECORD_PATH "Media" ""',
    '  <RECORD_CFG',
    '    ZXZhdxgAAQ==',
    '  >',
    '  <APPLYFX_CFG',
    '  >',
    '  RENDER_FILE ""',
    '  RENDER_PATTERN ""',
    '  RENDER_FMT 0 2 0',
    '  RENDER_1X 0',
    '  RENDER_RANGE 1 0 0 0 1000',
    '  RENDER_RESAMPLE 3 0 1',
    '  RENDER_ADDTOPROJ 0',
    '  RENDER_STEMS 0',
    '  RENDER_DITHER 0',
    '  RENDER_TRIM 0.000001 0.000001 0 0',
    '  TIMELOCKMODE 0',
    '  TEMPOENVLOCKMODE 1',
    '  ITEMMIX 1',
    '  DEFPITCHMODE 589824 0',
    '  TAKELANE 1',
    '  SAMPLERATE 44100 0 0',
    '  <RENDER_CFG',
    '    ZXZhdxgAAQ==',
    '  >',
    '  LOCK 1',
    '  <METRONOME 6 2',
    '    VOL 0.25 0.125',
    '    BEATLEN 4',
    '    FREQ 1760 880 1',
    '    SAMPLES "" "" "" ""',
    '    SPLIGNORE 0 0',
    '    SPLDEF 2 660 "" 0 ""',
    '    SPLDEF 3 440 "" 0 ""',
    '    PATTERN 0 169',
    '    PATTERNSTR ABBB',
    '    MULT 1',
    '  >',
    '  GLOBAL_AUTO -1',
    `  TEMPO ${initialBpm.toFixed(6)} ${numerator} ${denominator} 0`,
    '  PLAYRATE 1 0 0.25 4',
    '  SELECTION 0 0',
    '  SELECTION2 0 0',
    '  MASTERAUTOMODE 0',
    '  MASTERTRACKHEIGHT 0 0',
    '  MASTERPEAKCOL 16576',
    '  MASTERMUTESOLO 0',
    '  MASTERTRACKVIEW 0 0.6667 0.5 0.5 0 0 0 0 0 0 0 0 0 0 1',
    '  MASTERHWOUT 0 0 1 0 0 0 0 -1',
    '  MASTER_NCH 2 2',
    '  MASTER_VOLUME 1 0 -1 -1 1',
    '  MASTER_PANMODE 3',
    '  MASTER_PANLAWFLAGS 3',
    '  MASTER_FX 1',
    '  MASTER_SEL 0',
    '  <MASTERPLAYSPEEDENV',
    '    EGUID {83368691-A8B1-4A6E-A126-6649F345A553}',
    '    ACT 0 -1',
    '    VIS 0 1 1',
    '    LANEHEIGHT 0 0',
    '    ARM 0',
    '    DEFSHAPE 0 -1 -1',
    '  >',
    '  <TEMPOENVEX',
    '    EGUID {17061C45-8AFC-4947-A0C4-9FF0AA41B437}',
    '    ACT 1 -1',
    '    VIS 1 0 1',
    '    LANEHEIGHT 0 0',
    '    ARM 0',
    '    DEFSHAPE 1 -1 -1',
    ...tempoPointLines,
    '  >',
    '  RULERHEIGHT 86 86',
    '  RULERLANE 1 4 "" 0 -1 0',
    '  RULERLANE 2 8 "" 0 -1 0',
    '  <PROJBAY',
    '  >',
  ]

  const trackBlock = [
    '  <TRACK {00000000-0000-0000-0000-111111111111}',
    '    NAME "Warpgrid Tempo Map"',
    '    PEAKCOL 16576',
    '    BEAT -1',
    '    AUTOMODE 0',
    '    SEL 0',
    '    NCHAN 2',
    '    VOLPAN 1 0 -1 -1 1',
    '    IPHASE 0',
    '    PLAYOFFS 0 1',
    '    MUTESOLO 0 0 0',
    '    <ITEM',
    '      POSITION 0',
    `      LENGTH ${projectLength.toFixed(6)}`,
    '      LOOP 0',
    '      ALLTAKES 0',
    '      NAME "Warpgrid Tempo Map"',
    '      SOFFS 0 0',
    '      PLAYRATE 1 1 0 -1 0 0.0025',
    '      CHANMODE 0',
    '      <SOURCE MIDI',
    '        HASDATA 1 480 QN',
    '        CCINTERP 32',
    ...tsMetaEvents(sortedTs),
    `        E 0 c0 00 00`,
    `        E 0 90 ${formatHex(48)} 00`,
    `        E ${sentinelLengthTicks} ${formatHex(80)} ${formatHex(48)} 00`,
    `        E 960 b0 7b 00`,
    '        CHASE_CC_TAKEOFFS 1',
    '        IGNTEMPO 0 120 4 4',
    '        EVTFILTER 0 -1 -1 -1 -1 0 0 0 0 -1 -1 -1 -1 0 -1 0 -1 -1',
    '      >',
    '    >',
    '  >',
  ]

  return [...headerLines, ...trackBlock, '>'].join('\n')
}

function createSignatureLookup(tsList: ReturnType<typeof sortedTimeSignatures>) {
  const sorted = [...tsList].sort((a, b) => a.bar - b.bar)
  const sortedBarStarts = sorted.map((ts) => barStartInQuarters(ts.bar, sorted))

  return (beat: number) => {
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (beat >= sortedBarStarts[i]) return sorted[i]
    }
    return sorted[0] || { numerator: 4, denominator: 4 }
  }
}

function mergeTempoAndSignaturePoints(
  tempoEvents: ReturnType<typeof deriveTempoEvents>,
  anchors: WarpAnchor[],
  signatures: ReturnType<typeof sortedTimeSignatures>,
) {
  const points: TempoPoint[] = tempoEvents.map((ev) => ({
    beat: ev.beat,
    time: ev.time,
    bpm: ev.bpm,
    curve: ev.curve,
  }))

  for (let i = 1; i < signatures.length; i++) {
    const beat = barStartInQuarters(signatures[i].bar, signatures)
    if (points.some((point) => Math.abs(point.beat - beat) < 1e-9)) continue
    const source = tempoPointAtBeat(beat, points)
    points.push({
      beat,
      time: beatToTime(beat, anchors),
      bpm: source?.bpm ?? tempoEvents[0]?.bpm ?? 120,
      curve: source?.curve ?? 'constant',
    })
  }

  return points
    .slice()
    .sort((a, b) => a.beat - b.beat)
    .reduce<TempoPoint[]>((acc, point) => {
      if (!acc.length || Math.abs(point.beat - acc[acc.length - 1].beat) >= 1e-9) acc.push(point)
      return acc
    }, [])
}

function tempoPointAtBeat(beat: number, points: TempoPoint[]) {
  if (!points.length) return undefined
  const ordered = [...points].sort((a, b) => a.beat - b.beat)
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (ordered[i].beat <= beat) return ordered[i]
  }
  return points[0]
}

function formatHex(value: number): string {
  return value.toString(16).padStart(2, '0')
}

function tsMetaEvents(tsList: ReturnType<typeof sortedTimeSignatures>) {
  const sorted = [...tsList].sort((a, b) => a.bar - b.bar)
  const seen = new Set<number>()
  return sorted.flatMap((ts) => {
    const tick = Math.round(barStartInQuarters(ts.bar, sorted) * 480)
    if (seen.has(tick)) return []
    seen.add(tick)
    const denomExp = Math.round(Math.log2(ts.denominator))
    const bytes = [ts.numerator, denomExp, 24, 8].map((value) => value.toString(16).padStart(2, '0'))
    return [`        E ${tick} ff 58 04 ${bytes.join(' ')}`]
  })
}
