/**
 * Ableton Live set (.als) export (Phase 4).
 *
 * .als is a gzip-compressed XML document. Live stores arrangement tempo as
 * automation on the Main track's Tempo parameter; automation time is musical
 * time in quarter-note beats, not seconds.
 */

import { gzip } from 'pako'
import { deriveTempoEvents } from '../core/tempoMap'
import { barStartInQuarters, sortedTimeSignatures } from '../core/timeSignature'
import type { Project, TempoEvent, TimeSignatureChange } from '../core/types'

const NEGATIVE_INFINITY_TIME = -63072000
const SESSION_SLOT_COUNT = 8

interface AbletonFloatEvent {
  time: number
  value: number
}

interface AbletonEnumEvent {
  time: number
  value: number
}

export function exportAbleton(project: Project): Blob {
  const tempoEvents = deriveTempoEvents(project.anchors)
  const timeSignatures = sortedTimeSignatures(project.timeSignatures)
  const startTempo = tempoEvents[0]?.bpm ?? 120
  const startSignature = timeSignatures[0] ?? { numerator: 4, denominator: 4, bar: 0, id: 'ts-origin' }
  const endBeat = estimateEndBeat(project, tempoEvents, timeSignatures)

  const xml = buildLiveSetXml({
    startTempo,
    startSignatureValue: abletonTimeSignatureValue(startSignature),
    tempoEvents: buildTempoAutomationEvents(tempoEvents),
    timeSignatureEvents: buildTimeSignatureAutomationEvents(timeSignatures),
    endBeat,
  })

  const compressed = gzip(xml)
  return new Blob([compressed as unknown as BlobPart], { type: 'application/gzip' })
}

function buildTempoAutomationEvents(events: TempoEvent[]): AbletonFloatEvent[] {
  const sorted = [...events].sort((a, b) => a.beat - b.beat)
  const start = sorted[0]?.bpm ?? 120
  const result: AbletonFloatEvent[] = [{ time: NEGATIVE_INFINITY_TIME, value: start }]

  if (sorted.length === 0) {
    result.push({ time: 0, value: start })
    return result
  }

  result.push({ time: sorted[0].beat, value: sorted[0].bpm })
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const current = sorted[i]
    if (prev.curve === 'ramp') {
      result.push({ time: current.beat, value: current.bpm })
    } else {
      result.push({ time: current.beat, value: prev.bpm })
      result.push({ time: current.beat, value: current.bpm })
    }
  }
  return result
}

function buildTimeSignatureAutomationEvents(timeSignatures: TimeSignatureChange[]): AbletonEnumEvent[] {
  const sorted = sortedTimeSignatures(timeSignatures)
  const firstValue = abletonTimeSignatureValue(sorted[0])
  const result: AbletonEnumEvent[] = [{ time: NEGATIVE_INFINITY_TIME, value: firstValue }]
  const seen = new Set<string>()

  for (const ts of sorted) {
    const time = barStartInQuarters(ts.bar, sorted)
    const value = abletonTimeSignatureValue(ts)
    const key = `${time}:${value}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ time, value })
  }
  return result
}

function abletonTimeSignatureValue(ts: Pick<TimeSignatureChange, 'numerator' | 'denominator'>): number {
  const denominatorPower = Math.max(0, Math.round(Math.log2(ts.denominator || 4)))
  return denominatorPower * 99 + Math.max(1, Math.round(ts.numerator)) - 1
}

function estimateEndBeat(project: Project, tempoEvents: TempoEvent[], timeSignatures: TimeSignatureChange[]): number {
  const lastTempoBeat = tempoEvents.length ? Math.max(...tempoEvents.map((event) => event.beat)) : 0
  const lastSignatureBeat = timeSignatures.length
    ? Math.max(...timeSignatures.map((ts) => barStartInQuarters(ts.bar, timeSignatures)))
    : 0
  const lastAnchorBeat = project.anchors.length ? Math.max(...project.anchors.map((anchor) => anchor.beat)) : 0
  return Math.max(4, Math.ceil(Math.max(lastTempoBeat, lastSignatureBeat, lastAnchorBeat) + 4))
}

function buildTempoEventXml(events: AbletonFloatEvent[]): string {
  return events
    .map((event, index) => `\t\t\t\t\t\t\t\t<FloatEvent Id="${index + 1}" Time="${formatNumber(event.time)}" Value="${formatNumber(event.value)}" />`)
    .join('\n')
}

function buildTimeSignatureEventXml(events: AbletonEnumEvent[]): string {
  return events
    .map((event, index) => `\t\t\t\t\t\t\t\t<EnumEvent Id="${index + 1}" Time="${formatNumber(event.time)}" Value="${event.value}" />`)
    .join('\n')
}

function buildClipSlotsXml(indent: string): string {
  return Array.from(
    { length: SESSION_SLOT_COUNT },
    (_, slot) => `${indent}<ClipSlot Id="${slot}"><LomId Value="0" /><ClipSlot><Value /></ClipSlot><HasStop Value="true" /></ClipSlot>`,
  ).join('\n')
}

function buildMidiFreezeSequencerXml(): string {
  const clipSlotsXml = buildClipSlotsXml('\t\t\t\t\t\t\t')
  return `\t\t\t\t\t<FreezeSequencer>
\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t<LomIdView Value="0" />
\t\t\t\t\t\t<IsExpanded Value="true" />
\t\t\t\t\t\t<BreakoutIsExpanded Value="false" />
\t\t\t\t\t\t<On>
\t\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t\t<Manual Value="true" />
\t\t\t\t\t\t\t<AutomationTarget Id="220"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t\t<MidiCCOnOffThresholds><Min Value="64" /><Max Value="127" /></MidiCCOnOffThresholds>
\t\t\t\t\t\t</On>
\t\t\t\t\t\t<ModulationSourceCount Value="0" />
\t\t\t\t\t\t<ParametersListWrapper LomId="0" />
\t\t\t\t\t\t<Pointee Id="221" />
\t\t\t\t\t\t<LastSelectedTimeableIndex Value="0" />
\t\t\t\t\t\t<LastSelectedClipEnvelopeIndex Value="0" />
\t\t\t\t\t\t<LastPresetRef><Value /></LastPresetRef>
\t\t\t\t\t\t<LockedScripts />
\t\t\t\t\t\t<IsFolded Value="false" />
\t\t\t\t\t\t<ShouldShowPresetName Value="false" />
\t\t\t\t\t\t<UserName Value="" />
\t\t\t\t\t\t<Annotation Value="" />
\t\t\t\t\t\t<SourceContext><Value /></SourceContext>
\t\t\t\t\t\t<MpePitchBendUsesTuning Value="true" />
\t\t\t\t\t\t<ViewData Value="{}" />
\t\t\t\t\t\t<ClipSlotList>
${clipSlotsXml}
\t\t\t\t\t\t</ClipSlotList>
\t\t\t\t\t\t<MonitoringEnum Value="1" />
\t\t\t\t\t\t<KeepRecordMonitoringLatency Value="true" />
\t\t\t\t\t\t<Sample>
\t\t\t\t\t\t\t<ArrangerAutomation>
\t\t\t\t\t\t\t\t<Events />
\t\t\t\t\t\t\t\t<AutomationTransformViewState><IsTransformPending Value="false" /><TimeAndValueTransforms /></AutomationTransformViewState>
\t\t\t\t\t\t\t</ArrangerAutomation>
\t\t\t\t\t\t</Sample>
\t\t\t\t\t\t<Recorder><IsArmed Value="false" /><TakeCounter Value="1" /></Recorder>
\t\t\t\t\t</FreezeSequencer>`
}

function buildMainFreezeSequencerXml(): string {
  const clipSlotsXml = buildClipSlotsXml('\t\t\t\t\t\t\t')
  return `\t\t\t\t<FreezeSequencer>
\t\t\t\t\t<AudioSequencer Id="0">
\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t<LomIdView Value="0" />
\t\t\t\t\t\t<IsExpanded Value="true" />
\t\t\t\t\t\t<BreakoutIsExpanded Value="false" />
\t\t\t\t\t\t<On>
\t\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t\t<Manual Value="true" />
\t\t\t\t\t\t\t<AutomationTarget Id="222"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t\t<MidiCCOnOffThresholds><Min Value="64" /><Max Value="127" /></MidiCCOnOffThresholds>
\t\t\t\t\t\t</On>
\t\t\t\t\t\t<ModulationSourceCount Value="0" />
\t\t\t\t\t\t<ParametersListWrapper LomId="0" />
\t\t\t\t\t\t<Pointee Id="223" />
\t\t\t\t\t\t<LastSelectedTimeableIndex Value="0" />
\t\t\t\t\t\t<LastSelectedClipEnvelopeIndex Value="0" />
\t\t\t\t\t\t<LastPresetRef><Value /></LastPresetRef>
\t\t\t\t\t\t<LockedScripts />
\t\t\t\t\t\t<IsFolded Value="false" />
\t\t\t\t\t\t<ShouldShowPresetName Value="false" />
\t\t\t\t\t\t<UserName Value="" />
\t\t\t\t\t\t<Annotation Value="" />
\t\t\t\t\t\t<SourceContext><Value /></SourceContext>
\t\t\t\t\t\t<MpePitchBendUsesTuning Value="true" />
\t\t\t\t\t\t<ViewData Value="{}" />
\t\t\t\t\t\t<ClipSlotList>
${clipSlotsXml}
\t\t\t\t\t\t</ClipSlotList>
\t\t\t\t\t\t<MonitoringEnum Value="1" />
\t\t\t\t\t\t<KeepRecordMonitoringLatency Value="true" />
\t\t\t\t\t\t<Sample>
\t\t\t\t\t\t\t<ArrangerAutomation>
\t\t\t\t\t\t\t\t<Events />
\t\t\t\t\t\t\t\t<AutomationTransformViewState><IsTransformPending Value="false" /><TimeAndValueTransforms /></AutomationTransformViewState>
\t\t\t\t\t\t\t</ArrangerAutomation>
\t\t\t\t\t\t</Sample>
\t\t\t\t\t\t<Recorder><IsArmed Value="false" /><TakeCounter Value="1" /></Recorder>
\t\t\t\t\t</AudioSequencer>
\t\t\t\t</FreezeSequencer>`
}

function buildPlayerTrackXml(): string {
  const clipSlotsXml = buildClipSlotsXml('\t\t\t\t\t\t\t')
  const freezeSequencerXml = buildMidiFreezeSequencerXml()
  const controllerTargetsXml = Array.from({ length: 128 }, (_, controller) => {
    const lockEnvelope = controller === 1 || controller === 11 ? 1 : 0
    return `\t\t\t\t\t\t\t<ControllerTargets.${controller} Id="${64 + controller}"><LockEnvelope Value="${lockEnvelope}" /></ControllerTargets.${controller}>`
  }).join('\n')

  return `\t\t<Tracks>
\t\t\t<MidiTrack Id="16" SelectedToolPanel="2" SelectedTransformationName="" SelectedGeneratorName="">
\t\t\t\t<LomId Value="0" />
\t\t\t\t<LomIdView Value="0" />
\t\t\t\t<IsContentSelectedInDocument Value="false" />
\t\t\t\t<PreferredContentViewMode Value="0" />
\t\t\t\t<TrackDelay>
\t\t\t\t\t<Value Value="0" />
\t\t\t\t\t<IsValueSampleBased Value="false" />
\t\t\t\t</TrackDelay>
\t\t\t\t<Name>
\t\t\t\t\t<EffectiveName Value="Warpgrid MIDI" />
\t\t\t\t\t<UserName Value="" />
\t\t\t\t\t<Annotation Value="" />
\t\t\t\t\t<MemorizedFirstClipName Value="" />
\t\t\t\t</Name>
\t\t\t\t<Color Value="12" />
\t\t\t\t<AutomationEnvelopes><Envelopes /></AutomationEnvelopes>
\t\t\t\t<TrackGroupId Value="-1" />
\t\t\t\t<TrackUnfolded Value="true" />
\t\t\t\t<DevicesListWrapper LomId="0" />
\t\t\t\t<ClipSlotsListWrapper LomId="0" />
\t\t\t\t<ArrangementClipsListWrapper LomId="0" />
\t\t\t\t<TakeLanesListWrapper LomId="0" />
\t\t\t\t<ViewData Value="{}" />
\t\t\t\t<TakeLanes><TakeLanes /><AreTakeLanesFolded Value="true" /></TakeLanes>
\t\t\t\t<LinkedTrackGroupId Value="-1" />
\t\t\t\t<SavedPlayingSlot Value="-1" />
\t\t\t\t<SavedPlayingOffset Value="0" />
\t\t\t\t<Freeze Value="false" />
\t\t\t\t<PostProcessFreezeClips Value="0" />
\t\t\t\t<DeviceChain>
\t\t\t\t\t<AutomationLanes>
\t\t\t\t\t\t<AutomationLanes>
\t\t\t\t\t\t\t<AutomationLane Id="0">
\t\t\t\t\t\t\t\t<SelectedDevice Value="1" />
\t\t\t\t\t\t\t\t<SelectedEnvelope Value="0" />
\t\t\t\t\t\t\t\t<IsContentSelectedInDocument Value="false" />
\t\t\t\t\t\t\t\t<LaneHeight Value="68" />
\t\t\t\t\t\t\t</AutomationLane>
\t\t\t\t\t\t</AutomationLanes>
\t\t\t\t\t\t<AreAdditionalAutomationLanesFolded Value="false" />
\t\t\t\t\t</AutomationLanes>
\t\t\t\t\t<ClipEnvelopeChooserViewState>
\t\t\t\t\t\t<SelectedDevice Value="0" />
\t\t\t\t\t\t<SelectedEnvelope Value="0" />
\t\t\t\t\t\t<PreferModulationVisible Value="false" />
\t\t\t\t\t</ClipEnvelopeChooserViewState>
\t\t\t\t\t<AudioInputRouting>
\t\t\t\t\t\t<Target Value="AudioIn/External/S0" />
\t\t\t\t\t\t<UpperDisplayString Value="Ext. In" />
\t\t\t\t\t\t<LowerDisplayString Value="1/2" />
\t\t\t\t\t\t<MpeSettings><ZoneType Value="0" /><FirstNoteChannel Value="1" /><LastNoteChannel Value="15" /></MpeSettings>
\t\t\t\t\t\t<MpePitchBendUsesTuning Value="true" />
\t\t\t\t\t</AudioInputRouting>
\t\t\t\t\t<MidiInputRouting>
\t\t\t\t\t\t<Target Value="MidiIn/External.All/-1" />
\t\t\t\t\t\t<UpperDisplayString Value="Ext: All Ins" />
\t\t\t\t\t\t<LowerDisplayString Value="" />
\t\t\t\t\t\t<MpeSettings><ZoneType Value="0" /><FirstNoteChannel Value="1" /><LastNoteChannel Value="15" /></MpeSettings>
\t\t\t\t\t\t<MpePitchBendUsesTuning Value="true" />
\t\t\t\t\t</MidiInputRouting>
\t\t\t\t\t<AudioOutputRouting>
\t\t\t\t\t\t<Target Value="AudioOut/Main" />
\t\t\t\t\t\t<UpperDisplayString Value="Main" />
\t\t\t\t\t\t<LowerDisplayString Value="" />
\t\t\t\t\t\t<MpeSettings><ZoneType Value="0" /><FirstNoteChannel Value="1" /><LastNoteChannel Value="15" /></MpeSettings>
\t\t\t\t\t\t<MpePitchBendUsesTuning Value="true" />
\t\t\t\t\t</AudioOutputRouting>
\t\t\t\t\t<MidiOutputRouting>
\t\t\t\t\t\t<Target Value="MidiOut/None" />
\t\t\t\t\t\t<UpperDisplayString Value="None" />
\t\t\t\t\t\t<LowerDisplayString Value="" />
\t\t\t\t\t\t<MpeSettings><ZoneType Value="0" /><FirstNoteChannel Value="1" /><LastNoteChannel Value="15" /></MpeSettings>
\t\t\t\t\t\t<MpePitchBendUsesTuning Value="true" />
\t\t\t\t\t</MidiOutputRouting>
\t\t\t\t\t<Mixer>
\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t<LomIdView Value="0" />
\t\t\t\t\t\t<IsExpanded Value="true" />
\t\t\t\t\t\t<BreakoutIsExpanded Value="false" />
\t\t\t\t\t\t<On>
\t\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t\t<Manual Value="true" />
\t\t\t\t\t\t\t<AutomationTarget Id="32"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t\t<MidiCCOnOffThresholds><Min Value="64" /><Max Value="127" /></MidiCCOnOffThresholds>
\t\t\t\t\t\t</On>
\t\t\t\t\t\t<ModulationSourceCount Value="0" />
\t\t\t\t\t\t<ParametersListWrapper LomId="0" />
\t\t\t\t\t\t<Pointee Id="52" />
\t\t\t\t\t\t<LastSelectedTimeableIndex Value="0" />
\t\t\t\t\t\t<LastSelectedClipEnvelopeIndex Value="0" />
\t\t\t\t\t\t<LastPresetRef><Value /></LastPresetRef>
\t\t\t\t\t\t<LockedScripts />
\t\t\t\t\t\t<IsFolded Value="false" />
\t\t\t\t\t\t<ShouldShowPresetName Value="false" />
\t\t\t\t\t\t<UserName Value="" />
\t\t\t\t\t\t<Annotation Value="" />
\t\t\t\t\t\t<SourceContext><Value /></SourceContext>
\t\t\t\t\t\t<MpePitchBendUsesTuning Value="true" />
\t\t\t\t\t\t<ViewData Value="{}" />
\t\t\t\t\t\t<Sends />
\t\t\t\t\t\t<Speaker>
\t\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t\t<Manual Value="true" />
\t\t\t\t\t\t\t<AutomationTarget Id="33"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t\t<MidiCCOnOffThresholds><Min Value="64" /><Max Value="127" /></MidiCCOnOffThresholds>
\t\t\t\t\t\t</Speaker>
\t\t\t\t\t\t<SoloSink Value="false" />
\t\t\t\t\t\t<PanMode Value="0" />
\t\t\t\t\t\t<Pan>
\t\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t\t<Manual Value="0" />
\t\t\t\t\t\t\t<MidiControllerRange><Min Value="-1" /><Max Value="1" /></MidiControllerRange>
\t\t\t\t\t\t\t<AutomationTarget Id="34"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t\t<ModulationTarget Id="35"><LockEnvelope Value="0" /></ModulationTarget>
\t\t\t\t\t\t</Pan>
\t\t\t\t\t\t<SplitStereoPanL>
\t\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t\t<Manual Value="-1" />
\t\t\t\t\t\t\t<MidiControllerRange><Min Value="-1" /><Max Value="1" /></MidiControllerRange>
\t\t\t\t\t\t\t<AutomationTarget Id="36"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t\t<ModulationTarget Id="37"><LockEnvelope Value="0" /></ModulationTarget>
\t\t\t\t\t\t</SplitStereoPanL>
\t\t\t\t\t\t<SplitStereoPanR>
\t\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t\t<Manual Value="1" />
\t\t\t\t\t\t\t<MidiControllerRange><Min Value="-1" /><Max Value="1" /></MidiControllerRange>
\t\t\t\t\t\t\t<AutomationTarget Id="38"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t\t<ModulationTarget Id="39"><LockEnvelope Value="0" /></ModulationTarget>
\t\t\t\t\t\t</SplitStereoPanR>
\t\t\t\t\t\t<Volume>
\t\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t\t<Manual Value="1" />
\t\t\t\t\t\t\t<MidiControllerRange><Min Value="0.0003162277571" /><Max Value="1.99526238" /></MidiControllerRange>
\t\t\t\t\t\t\t<AutomationTarget Id="40"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t\t<ModulationTarget Id="41"><LockEnvelope Value="0" /></ModulationTarget>
\t\t\t\t\t\t</Volume>
\t\t\t\t\t\t<ViewStateSessionTrackWidth Value="103" />
\t\t\t\t\t\t<CrossFadeState>
\t\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t\t<Manual Value="1" />
\t\t\t\t\t\t\t<AutomationTarget Id="42"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t\t<MidiControllerRange><Min Value="0" /><Max Value="2" /></MidiControllerRange>
\t\t\t\t\t\t</CrossFadeState>
\t\t\t\t\t\t<SendsListWrapper LomId="0" />
\t\t\t\t\t</Mixer>
\t\t\t\t\t<MainSequencer>
\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t<LomIdView Value="0" />
\t\t\t\t\t\t<IsExpanded Value="true" />
\t\t\t\t\t\t<BreakoutIsExpanded Value="false" />
\t\t\t\t\t\t<On>
\t\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t\t<Manual Value="true" />
\t\t\t\t\t\t\t<AutomationTarget Id="43"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t\t<MidiCCOnOffThresholds><Min Value="64" /><Max Value="127" /></MidiCCOnOffThresholds>
\t\t\t\t\t\t</On>
\t\t\t\t\t\t<ModulationSourceCount Value="0" />
\t\t\t\t\t\t<ParametersListWrapper LomId="0" />
\t\t\t\t\t\t<Pointee Id="53" />
\t\t\t\t\t\t<LastSelectedTimeableIndex Value="0" />
\t\t\t\t\t\t<LastSelectedClipEnvelopeIndex Value="0" />
\t\t\t\t\t\t<LastPresetRef><Value /></LastPresetRef>
\t\t\t\t\t\t<LockedScripts />
\t\t\t\t\t\t<IsFolded Value="false" />
\t\t\t\t\t\t<ShouldShowPresetName Value="false" />
\t\t\t\t\t\t<UserName Value="" />
\t\t\t\t\t\t<Annotation Value="" />
\t\t\t\t\t\t<SourceContext><Value /></SourceContext>
\t\t\t\t\t\t<MpePitchBendUsesTuning Value="true" />
\t\t\t\t\t\t<ViewData Value="{}" />
\t\t\t\t\t\t<ClipSlotList>
${clipSlotsXml}
\t\t\t\t\t\t</ClipSlotList>
\t\t\t\t\t\t<MonitoringEnum Value="1" />
\t\t\t\t\t\t<KeepRecordMonitoringLatency Value="true" />
\t\t\t\t\t\t<ClipTimeable><ArrangerAutomation><Events /><AutomationTransformViewState><IsTransformPending Value="false" /><TimeAndValueTransforms /></AutomationTransformViewState></ArrangerAutomation></ClipTimeable>
\t\t\t\t\t\t<Recorder><IsArmed Value="false" /><TakeCounter Value="0" /></Recorder>
\t\t\t\t\t\t<MidiControllers>
${controllerTargetsXml}
\t\t\t\t\t\t</MidiControllers>
\t\t\t\t\t</MainSequencer>
${freezeSequencerXml}
\t\t\t\t\t<DeviceChain>
\t\t\t\t\t\t<Devices />
\t\t\t\t\t\t<SignalModulations />
\t\t\t\t\t</DeviceChain>
\t\t\t\t</DeviceChain>
\t\t\t\t<ReWireDeviceMidiTargetId Value="0" />
\t\t\t\t<PitchbendRange Value="96" />
\t\t\t\t<IsTuned Value="true" />
\t\t\t\t<ControllerLayoutRemoteable Value="0" />
\t\t\t\t<ControllerLayoutCustomization>
\t\t\t\t\t<PitchClassSource Value="0" />
\t\t\t\t\t<OctaveSource Value="2" />
\t\t\t\t\t<KeyNoteTarget Value="60" />
\t\t\t\t\t<StepSize Value="1" />
\t\t\t\t\t<OctaveEvery Value="12" />
\t\t\t\t\t<AllowedKeys Value="0" />
\t\t\t\t\t<FillerKeysMapTo Value="0" />
\t\t\t\t</ControllerLayoutCustomization>
\t\t\t</MidiTrack>
\t\t</Tracks>`
}

function buildScenesXml(startSignatureValue: number): string {
  const scenesXml = Array.from({ length: SESSION_SLOT_COUNT }, (_, scene) => `\t\t\t<Scene Id="${scene}">
\t\t\t\t<FollowAction><FollowTime Value="4" /><IsLinked Value="true" /><LoopIterations Value="1" /><FollowActionA Value="4" /><FollowActionB Value="0" /><FollowChanceA Value="100" /><FollowChanceB Value="0" /><JumpIndexA Value="0" /><JumpIndexB Value="0" /><FollowActionEnabled Value="false" /></FollowAction>
\t\t\t\t<Name Value="" />
\t\t\t\t<Annotation Value="" />
\t\t\t\t<Color Value="-1" />
\t\t\t\t<Tempo Value="120" />
\t\t\t\t<IsTempoEnabled Value="false" />
\t\t\t\t<TimeSignatureId Value="${startSignatureValue}" />
\t\t\t\t<IsTimeSignatureEnabled Value="false" />
\t\t\t\t<LomId Value="0" />
\t\t\t\t<ClipSlotsListWrapper LomId="0" />
\t\t\t</Scene>`).join('\n')

  return `\t\t<Scenes>
${scenesXml}
\t\t</Scenes>`
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.abs(value) < 1e-9 ? 0 : value
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

function buildLiveSetXml(options: {
  startTempo: number
  startSignatureValue: number
  tempoEvents: AbletonFloatEvent[]
  timeSignatureEvents: AbletonEnumEvent[]
  endBeat: number
}) {
  const tempoXml = buildTempoEventXml(options.tempoEvents)
  const signatureXml = buildTimeSignatureEventXml(options.timeSignatureEvents)
  const playerTrackXml = buildPlayerTrackXml()
  const scenesXml = buildScenesXml(options.startSignatureValue)
  const mainFreezeSequencerXml = buildMainFreezeSequencerXml()
  const currentTime = formatNumber(options.endBeat)
  const tempoValues = options.tempoEvents.map((event) => event.value)
  const tempoMin = Math.max(1, Math.floor(Math.min(60, options.startTempo, ...tempoValues)))
  const tempoMax = Math.ceil(Math.max(200, options.startTempo, ...tempoValues))

  return `<?xml version="1.0" encoding="UTF-8"?>
<Ableton MajorVersion="5" MinorVersion="12.0_12402" SchemaChangeCount="2" Creator="Warpgrid">
\t<LiveSet>
\t\t<NextPointeeId Value="256" />
\t\t<OverwriteProtectionNumber Value="0" />
\t\t<LomId Value="0" />
\t\t<LomIdView Value="0" />
${playerTrackXml}
\t\t<MainTrack SelectedToolPanel="7" SelectedTransformationName="" SelectedGeneratorName="">
\t\t\t<LomId Value="0" />
\t\t\t<LomIdView Value="0" />
\t\t\t<IsContentSelectedInDocument Value="false" />
\t\t\t<PreferredContentViewMode Value="0" />
\t\t\t<TrackDelay>
\t\t\t\t<Value Value="0" />
\t\t\t\t<IsValueSampleBased Value="false" />
\t\t\t</TrackDelay>
\t\t\t<Name>
\t\t\t\t<EffectiveName Value="Main" />
\t\t\t\t<UserName Value="" />
\t\t\t\t<Annotation Value="" />
\t\t\t\t<MemorizedFirstClipName Value="" />
\t\t\t</Name>
\t\t\t<Color Value="24" />
\t\t\t<AutomationEnvelopes>
\t\t\t\t<Envelopes>
\t\t\t\t\t<AutomationEnvelope Id="0">
\t\t\t\t\t\t<EnvelopeTarget>
\t\t\t\t\t\t\t<PointeeId Value="10" />
\t\t\t\t\t\t</EnvelopeTarget>
\t\t\t\t\t\t<Automation>
\t\t\t\t\t\t\t<Events>
${signatureXml}
\t\t\t\t\t\t\t</Events>
\t\t\t\t\t\t\t<AutomationTransformViewState>
\t\t\t\t\t\t\t\t<IsTransformPending Value="false" />
\t\t\t\t\t\t\t\t<TimeAndValueTransforms />
\t\t\t\t\t\t\t</AutomationTransformViewState>
\t\t\t\t\t\t</Automation>
\t\t\t\t\t</AutomationEnvelope>
\t\t\t\t\t<AutomationEnvelope Id="1">
\t\t\t\t\t\t<EnvelopeTarget>
\t\t\t\t\t\t\t<PointeeId Value="8" />
\t\t\t\t\t\t</EnvelopeTarget>
\t\t\t\t\t\t<Automation>
\t\t\t\t\t\t\t<Events>
${tempoXml}
\t\t\t\t\t\t\t</Events>
\t\t\t\t\t\t\t<AutomationTransformViewState>
\t\t\t\t\t\t\t\t<IsTransformPending Value="false" />
\t\t\t\t\t\t\t\t<TimeAndValueTransforms />
\t\t\t\t\t\t\t</AutomationTransformViewState>
\t\t\t\t\t\t</Automation>
\t\t\t\t\t</AutomationEnvelope>
\t\t\t\t</Envelopes>
\t\t\t</AutomationEnvelopes>
\t\t\t<TrackGroupId Value="-1" />
\t\t\t<TrackUnfolded Value="false" />
\t\t\t<DevicesListWrapper LomId="0" />
\t\t\t<ClipSlotsListWrapper LomId="0" />
\t\t\t<ArrangementClipsListWrapper LomId="0" />
\t\t\t<TakeLanesListWrapper LomId="0" />
\t\t\t<ViewData Value="{}" />
\t\t\t<TakeLanes>
\t\t\t\t<TakeLanes />
\t\t\t\t<AreTakeLanesFolded Value="true" />
\t\t\t</TakeLanes>
\t\t\t<LinkedTrackGroupId Value="-1" />
\t\t\t<DeviceChain>
\t\t\t\t<AutomationLanes>
\t\t\t\t\t<AutomationLanes>
\t\t\t\t\t\t<AutomationLane Id="0">
\t\t\t\t\t\t\t<SelectedDevice Value="1" />
\t\t\t\t\t\t\t<SelectedEnvelope Value="4" />
\t\t\t\t\t\t\t<IsContentSelectedInDocument Value="false" />
\t\t\t\t\t\t\t<LaneHeight Value="85" />
\t\t\t\t\t\t</AutomationLane>
\t\t\t\t\t</AutomationLanes>
\t\t\t\t\t<AreAdditionalAutomationLanesFolded Value="false" />
\t\t\t\t</AutomationLanes>
\t\t\t\t<ClipEnvelopeChooserViewState>
\t\t\t\t\t<SelectedDevice Value="0" />
\t\t\t\t\t<SelectedEnvelope Value="0" />
\t\t\t\t\t<PreferModulationVisible Value="false" />
\t\t\t\t</ClipEnvelopeChooserViewState>
\t\t\t\t<AudioInputRouting>
\t\t\t\t\t<Target Value="AudioIn/External/S0" />
\t\t\t\t\t<UpperDisplayString Value="Ext. In" />
\t\t\t\t\t<LowerDisplayString Value="1/2" />
\t\t\t\t</AudioInputRouting>
\t\t\t\t<MidiInputRouting>
\t\t\t\t\t<Target Value="MidiIn/External.All/-1" />
\t\t\t\t\t<UpperDisplayString Value="Ext: All Ins" />
\t\t\t\t\t<LowerDisplayString Value="" />
\t\t\t\t</MidiInputRouting>
\t\t\t\t<AudioOutputRouting>
\t\t\t\t\t<Target Value="AudioOut/Main" />
\t\t\t\t\t<UpperDisplayString Value="Main" />
\t\t\t\t\t<LowerDisplayString Value="" />
\t\t\t\t</AudioOutputRouting>
\t\t\t\t<MidiOutputRouting>
\t\t\t\t\t<Target Value="MidiOut/None" />
\t\t\t\t\t<UpperDisplayString Value="None" />
\t\t\t\t\t<LowerDisplayString Value="" />
\t\t\t\t</MidiOutputRouting>
\t\t\t\t<Mixer>
\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t<LomIdView Value="0" />
\t\t\t\t\t<IsExpanded Value="true" />
\t\t\t\t\t<BreakoutIsExpanded Value="false" />
\t\t\t\t\t<On>
\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t<Manual Value="true" />
\t\t\t\t\t\t<AutomationTarget Id="1"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t</On>
\t\t\t\t\t<ModulationSourceCount Value="0" />
\t\t\t\t\t<ParametersListWrapper LomId="0" />
\t\t\t\t\t<Pointee Id="30" />
\t\t\t\t\t<LastSelectedTimeableIndex Value="4" />
\t\t\t\t\t<LastSelectedClipEnvelopeIndex Value="0" />
\t\t\t\t\t<LastPresetRef><Value /></LastPresetRef>
\t\t\t\t\t<LockedScripts />
\t\t\t\t\t<IsFolded Value="false" />
\t\t\t\t\t<ShouldShowPresetName Value="false" />
\t\t\t\t\t<UserName Value="" />
\t\t\t\t\t<Annotation Value="" />
\t\t\t\t\t<SourceContext><Value /></SourceContext>
\t\t\t\t\t<ViewData Value="{}" />
\t\t\t\t\t<Sends />
\t\t\t\t\t<Speaker>
\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t<Manual Value="true" />
\t\t\t\t\t\t<AutomationTarget Id="2"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t</Speaker>
\t\t\t\t\t<SoloSink Value="false" />
\t\t\t\t\t<PanMode Value="0" />
\t\t\t\t\t<Pan>
\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t<Manual Value="0" />
\t\t\t\t\t\t<MidiControllerRange><Min Value="-1" /><Max Value="1" /></MidiControllerRange>
\t\t\t\t\t\t<AutomationTarget Id="3"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t<ModulationTarget Id="4"><LockEnvelope Value="0" /></ModulationTarget>
\t\t\t\t\t</Pan>
\t\t\t\t\t<Volume>
\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t<Manual Value="1" />
\t\t\t\t\t\t<MidiControllerRange><Min Value="0.0003162277571" /><Max Value="1.99526238" /></MidiControllerRange>
\t\t\t\t\t\t<AutomationTarget Id="5"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t<ModulationTarget Id="6"><LockEnvelope Value="0" /></ModulationTarget>
\t\t\t\t\t</Volume>
\t\t\t\t\t<ViewStateSessionTrackWidth Value="103" />
\t\t\t\t\t<CrossFadeState>
\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t<Manual Value="1" />
\t\t\t\t\t\t<AutomationTarget Id="7"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t<MidiControllerRange><Min Value="0" /><Max Value="2" /></MidiControllerRange>
\t\t\t\t\t</CrossFadeState>
\t\t\t\t\t<SendsListWrapper LomId="0" />
\t\t\t\t\t<Tempo>
\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t<Manual Value="${formatNumber(options.startTempo)}" />
\t\t\t\t\t\t<MidiControllerRange><Min Value="${tempoMin}" /><Max Value="${tempoMax}" /></MidiControllerRange>
\t\t\t\t\t\t<AutomationTarget Id="8"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t<ModulationTarget Id="9"><LockEnvelope Value="0" /></ModulationTarget>
\t\t\t\t\t</Tempo>
\t\t\t\t\t<TimeSignature>
\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t<Manual Value="${options.startSignatureValue}" />
\t\t\t\t\t\t<AutomationTarget Id="10"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t<MidiControllerRange><Min Value="0" /><Max Value="494" /></MidiControllerRange>
\t\t\t\t\t</TimeSignature>
\t\t\t\t\t<GlobalGrooveAmount>
\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t<Manual Value="0" />
\t\t\t\t\t\t<MidiControllerRange><Min Value="0" /><Max Value="131.25" /></MidiControllerRange>
\t\t\t\t\t\t<AutomationTarget Id="11"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t<ModulationTarget Id="12"><LockEnvelope Value="0" /></ModulationTarget>
\t\t\t\t\t</GlobalGrooveAmount>
\t\t\t\t\t<CrossFade>
\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t<Manual Value="0" />
\t\t\t\t\t\t<MidiControllerRange><Min Value="-1" /><Max Value="1" /></MidiControllerRange>
\t\t\t\t\t\t<AutomationTarget Id="13"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t<ModulationTarget Id="14"><LockEnvelope Value="0" /></ModulationTarget>
\t\t\t\t\t</CrossFade>
\t\t\t\t\t<TempoAutomationViewBottom Value="${tempoMin}" />
\t\t\t\t\t<TempoAutomationViewTop Value="${tempoMax}" />
\t\t\t\t</Mixer>
${mainFreezeSequencerXml}
\t\t\t\t<DeviceChain>
\t\t\t\t\t<Devices />
\t\t\t\t\t<SignalModulations />
\t\t\t\t</DeviceChain>
\t\t\t</DeviceChain>
\t\t</MainTrack>
\t\t<PreHearTrack SelectedToolPanel="7" SelectedTransformationName="" SelectedGeneratorName="">
\t\t\t<LomId Value="0" />
\t\t\t<LomIdView Value="0" />
\t\t\t<IsContentSelectedInDocument Value="false" />
\t\t\t<PreferredContentViewMode Value="0" />
\t\t\t<TrackDelay><Value Value="0" /><IsValueSampleBased Value="false" /></TrackDelay>
\t\t\t<Name><EffectiveName Value="0-Main" /><UserName Value="" /><Annotation Value="" /><MemorizedFirstClipName Value="" /></Name>
\t\t\t<Color Value="-1" />
\t\t\t<AutomationEnvelopes><Envelopes /></AutomationEnvelopes>
\t\t\t<TrackGroupId Value="-1" />
\t\t\t<TrackUnfolded Value="false" />
\t\t\t<DevicesListWrapper LomId="0" />
\t\t\t<ClipSlotsListWrapper LomId="0" />
\t\t\t<ArrangementClipsListWrapper LomId="0" />
\t\t\t<TakeLanesListWrapper LomId="0" />
\t\t\t<ViewData Value="{}" />
\t\t\t<TakeLanes><TakeLanes /><AreTakeLanesFolded Value="true" /></TakeLanes>
\t\t\t<LinkedTrackGroupId Value="-1" />
\t\t\t<DeviceChain><Devices /><SignalModulations /></DeviceChain>
\t\t</PreHearTrack>
\t\t<SendsPre />
${scenesXml}
\t\t<Transport>
\t\t\t<PhaseNudgeTempo Value="10" />
\t\t\t<LoopOn Value="false" />
\t\t\t<LoopStart Value="0" />
\t\t\t<LoopLength Value="${currentTime}" />
\t\t\t<LoopIsSongStart Value="false" />
\t\t\t<CurrentTime Value="${currentTime}" />
\t\t\t<PunchIn Value="false" />
\t\t\t<PunchOut Value="false" />
\t\t\t<MetronomeTickDuration Value="0" />
\t\t\t<DrawMode Value="false" />
\t\t</Transport>
\t\t<SessionScrollPos X="0" Y="0" />
\t\t<SelectedBreakpointValue Value="0" />
\t\t<SignalModulations />
\t\t<GlobalQuantisation Value="4" />
\t\t<AutoQuantisation Value="0" />
\t\t<Grid><FixedNumerator Value="1" /><FixedDenominator Value="16" /><GridIntervalPixel Value="20" /><Ntoles Value="2" /><SnapToGrid Value="true" /><Fixed Value="false" /></Grid>
\t\t<ScaleInformation><Root Value="0" /><Name Value="0" /></ScaleInformation>
\t\t<InKey Value="true" />
\t\t<SmpteFormat Value="0" />
\t\t<TimeSelection><AnchorTime Value="0" /><OtherTime Value="${currentTime}" /></TimeSelection>
\t\t<SequencerNavigator><BeatTimeHelper><CurrentZoom Value="1" /></BeatTimeHelper><ScrollerPos X="0" Y="0" /><ClientSize X="1000" Y="600" /></SequencerNavigator>
\t\t<IsContentSplitterOpen Value="true" />
\t\t<IsExpressionSplitterOpen Value="true" />
\t\t<ExpressionLanes />
\t\t<ContentLanes />
\t\t<ViewStateFxSlotCount Value="4" />
\t\t<ViewStateSessionMixerVolumeSectionHeight Value="120" />
\t\t<ViewStateArrangerMixerVolumeSectionHeight Value="120" />
\t\t<ShouldSceneTempoAndTimeSignatureBeVisible Value="false" />
\t\t<WaveformVerticalZoomFactor Value="1" />
\t\t<IsWaveformVerticalZoomActive Value="true" />
\t\t<Locators><Locators /></Locators>
\t\t<DetailClipKeyMidis />
\t\t<TracksListWrapper LomId="0" />
\t\t<VisibleTracksListWrapper LomId="0" />
\t\t<ReturnTracksListWrapper LomId="0" />
\t\t<ScenesListWrapper LomId="0" />
\t\t<CuePointsListWrapper LomId="0" />
\t\t<SelectedDocumentViewInMainWindow Value="0" />
\t\t<Annotation Value="" />
\t\t<SoloOrPflSavedValue Value="true" />
\t\t<SoloInPlace Value="true" />
\t\t<CrossfadeCurve Value="2" />
\t\t<LatencyCompensation Value="2" />
\t\t<HighlightedTrackIndex Value="0" />
\t\t<GroovePool><Grooves /></GroovePool>
\t\t<AutomationMode Value="false" />
\t\t<SnapAutomationToGrid Value="true" />
\t\t<ArrangementOverdub Value="false" />
\t\t<ColorSequenceIndex Value="0" />
\t\t<ViewData Value="{}" />
\t\t<ResetNonautomatedMidiControllersOnClipStarts Value="true" />
\t\t<MidiFoldIn Value="false" />
\t\t<MidiFoldMode Value="-99" />
\t\t<MultiClipFocusMode Value="false" />
\t\t<MultiClipLoopBarHeight Value="0" />
\t\t<MidiPrelisten Value="false" />
\t\t<LinkedTrackGroups />
\t\t<NoteSpellingPreference Value="0" />
\t\t<AccidentalSpellingPreference Value="3" />
\t\t<PreferFlatRootNote Value="false" />
\t\t<UseWarperLegacyHiQMode Value="false" />
\t\t<VideoWindowRect Top="-2147483648" Left="-2147483648" Bottom="-2147483648" Right="-2147483648" />
\t\t<ShowVideoWindow Value="true" />
\t\t<TuningSystems />
\t\t<TrackHeaderWidth Value="93" />
\t\t<ViewStateMainWindowClipDetailOpen Value="false" />
\t\t<ViewStateMainWindowHiddenOtherDocViewTypeClipDetailOpen Value="false" />
\t\t<ViewStateMainWindowHiddenOtherDocViewTypeDeviceDetailOpen Value="true" />
\t\t<ViewStateMainWindowDeviceDetailOpen Value="true" />
\t\t<ViewStateSecondWindowClipDetailOpen Value="true" />
\t\t<ViewStateSecondWindowDeviceDetailOpen Value="false" />
\t\t<ViewStates />
\t\t<NoteAlgorithms />
\t</LiveSet>
</Ableton>
`
}
