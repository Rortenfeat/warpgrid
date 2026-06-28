/**
 * Warpgrid core domain types.
 *
 * The whole app revolves around a TempoMap: a bidirectional mapping between
 * musical time (bars / beats) and real time (seconds). The user manipulates
 * WarpAnchors (grid lines pinned to real-time positions); everything else —
 * the tempo curve, the bar lines, the export — is derived from those anchors
 * plus the time-signature changes.
 *
 * A "beat" here is always a quarter-note beat (the MIDI/PPQ convention),
 * independent of the time-signature denominator, unless explicitly noted.
 * Time-signature changes affect how beats group into bars, not the length of
 * a beat. Tempo (BPM) is quarter-notes per minute.
 */

/** Stable unique id for an entity (anchor, marker, source). */
export type Id = string

/**
 * A warp anchor pins a musical position (beat) to a real-time position
 * (seconds in the source media). Dragging an anchor is the core interaction.
 *
 * `curve` belongs to this anchor as a destination: if anchor N is marked
 * 'ramp', the segment from anchor N-1 to N is smoothed.
 */
export interface WarpAnchor {
  id: Id
  /** Musical position, in quarter-note beats from the project start. */
  beat: number
  /** Real-time position, in seconds from the source start. */
  time: number
  /**
   * How tempo behaves across the segment that ENDS at this anchor:
   *  - 'constant': one fixed BPM for the whole segment (piecewise-constant).
   *  - 'ramp': BPM changes linearly across the segment.
   */
  curve: SegmentCurve
  /**
   * Whether this anchor was placed by the user (locked, authoritative) or
   * proposed by detection (a candidate the user can accept / nudge / delete).
   */
  origin: AnchorOrigin
}

export type SegmentCurve = 'constant' | 'ramp'
export type AnchorOrigin = 'user' | 'detected'

/**
 * A time-signature change effective from a given bar number (0-indexed bars
 * from project start). The first change is conventionally at bar 0.
 */
export interface TimeSignatureChange {
  id: Id
  /** Bar index (0-based) at which this signature takes effect. */
  bar: number
  /** Beats per bar — the numerator (e.g. 3 in 3/4, 7 in 7/8). */
  numerator: number
  /** Note value that gets one beat — the denominator (e.g. 4, 8). */
  denominator: number
}

/**
 * A resolved tempo segment over a beat range. This is DERIVED from anchors
 * (not stored) and is what export writers consume.
 */
export interface TempoSegment {
  /** Inclusive start beat. */
  startBeat: number
  /** Exclusive end beat (Infinity for the trailing/open segment). */
  endBeat: number
  /** Real time (seconds) at startBeat. */
  startTime: number
  /** BPM at startBeat (quarter-notes per minute). */
  startBpm: number
  /** BPM at endBeat; equals startBpm for 'constant' segments. */
  endBpm: number
  curve: SegmentCurve
}

/** A single tempo event for export (timestamped BPM marker). */
export interface TempoEvent {
  beat: number
  time: number
  bpm: number
  curve: SegmentCurve
}

/** Kind of media backing a source. */
export type SourceKind = 'audio' | 'midi'

/**
 * An imported source. The heavy decoded payload (AudioBuffer / parsed MIDI)
 * lives outside the serializable project state and is referenced by id; only
 * lightweight metadata is kept here.
 */
export interface SourceMeta {
  id: Id
  kind: SourceKind
  name: string
  /** Total duration in seconds. */
  duration: number
  /** Audio only: sample rate (Hz). */
  sampleRate?: number
  /** Audio only: channel count. */
  channels?: number
  /** MIDI only: number of tracks. */
  trackCount?: number
  /** MIDI only: total note count across tracks. */
  noteCount?: number
}

/**
 * The serializable project state — everything needed to reconstruct the tempo
 * map. Decoded media is held separately (see state layer) and not part of the
 * undo/redo history.
 */
export interface Project {
  /** Source media metadata (audio and/or MIDI), in import order. */
  sources: SourceMeta[]
  /** Warp anchors, kept sorted by beat (invariant maintained by the store). */
  anchors: WarpAnchor[]
  /** Time-signature changes, kept sorted by bar. */
  timeSignatures: TimeSignatureChange[]
  /**
   * Beats per quarter-note tick resolution used when reading/writing MIDI.
   * Standard SMF default is 480 or 960; we keep it explicit for export.
   */
  ppq: number
}

/** A fresh, empty project at a sensible default tempo (one anchor at 120 BPM). */
export function createEmptyProject(): Project {
  return {
    sources: [],
    anchors: [
      { id: 'anchor-origin', beat: 0, time: 0, curve: 'constant', origin: 'user' },
    ],
    timeSignatures: [
      { id: 'ts-origin', bar: 0, numerator: 4, denominator: 4 },
    ],
    ppq: 480,
  }
}

/** Default tempo (BPM) assumed when there is only a single anchor at the origin. */
export const DEFAULT_BPM = 120
