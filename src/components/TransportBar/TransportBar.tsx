import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './TransportBar.module.css'
import { useProjectStore } from '../../state/useProjectStore'

/** Lazily-created shared AudioContext for playback. */
let sharedCtx: AudioContext | null = null
function getCtx(): AudioContext {
  if (!sharedCtx) sharedCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  return sharedCtx
}

/**
 * Transport: play / stop audio, scrub, and zoom. Playback drives the shared
 * playhead (view.playheadSec) via requestAnimationFrame so the Timeline and
 * TempoLane stay in sync. Audio files play as buffers; MIDI files use a simple
 * Web Audio synth so imported MIDI can be checked without a DAW.
 */
export function TransportBar() {
  const media = useProjectStore((s) => s.media)
  const sources = useProjectStore((s) => s.project.sources)
  const view = useProjectStore((s) => s.view)
  const setView = useProjectStore((s) => s.setView)

  const audioBuffer = useMemo(() => {
    for (const src of sources) {
      const m = media[src.id]
      if (m?.audioBuffer) return m.audioBuffer
    }
    return undefined
  }, [sources, media])

  const midiNotes = useMemo(() => {
    const notes: MidiPlaybackNote[] = []
    for (const src of sources) {
      const parsed = media[src.id]?.parsedMidi
      if (!parsed) continue
      parsed.midi.tracks.forEach((track, trackIndex) => {
        for (const note of track.notes) {
          notes.push({
            time: note.time,
            duration: note.duration,
            midi: note.midi,
            velocity: note.velocity ?? 0.75,
            trackIndex,
          })
        }
      })
    }
    return notes.sort((a, b) => a.time - b.time)
  }, [sources, media])

  const duration = useMemo(
    () => audioBuffer?.duration ?? sources.reduce((max, src) => Math.max(max, src.duration), 0),
    [audioBuffer, sources],
  )
  const canPlay = Boolean(audioBuffer || midiNotes.length)

  const [playing, setPlaying] = useState(false)
  const nodeRef = useRef<AudioBufferSourceNode | null>(null)
  const midiNodesRef = useRef<Array<{ osc: OscillatorNode; gain: GainNode }>>([])
  const rafRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const offsetRef = useRef(0)
  const playingRef = useRef(false)

  useEffect(() => { playingRef.current = playing }, [playing])

  const stop = useCallback(() => {
    if (nodeRef.current) {
      try { nodeRef.current.stop() } catch { /* already stopped */ }
      nodeRef.current.disconnect()
      nodeRef.current = null
    }
    for (const { osc, gain } of midiNodesRef.current) {
      try { osc.stop() } catch { /* already stopped */ }
      osc.disconnect()
      gain.disconnect()
    }
    midiNodesRef.current = []
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    setPlaying(false)
  }, [])

  const playFrom = useCallback((startAt: number) => {
    if (!canPlay || duration <= 0) return
    const ctx = getCtx()
    void ctx.resume()
    const offset = Math.min(Math.max(0, startAt), Math.max(0, duration - 0.01))
    offsetRef.current = Math.max(0, offset)
    startedAtRef.current = ctx.currentTime
    setView({ playheadSec: offsetRef.current })

    if (audioBuffer) {
      const node = ctx.createBufferSource()
      node.buffer = audioBuffer
      node.connect(ctx.destination)
      node.start(0, Math.min(offsetRef.current, audioBuffer.duration - 0.01))
      node.onended = () => {
        if (nodeRef.current !== node) return
        node.disconnect()
        nodeRef.current = null
      }
      nodeRef.current = node
    }
    midiNodesRef.current = scheduleMidi(ctx, midiNotes, offsetRef.current, duration)
    setPlaying(true)

    const tick = () => {
      const t = offsetRef.current + (ctx.currentTime - startedAtRef.current)
      setView({ playheadSec: t })
      if (t >= duration) { stop(); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [audioBuffer, canPlay, duration, midiNotes, setView, stop])

  const play = useCallback(() => playFrom(view.playheadSec), [playFrom, view.playheadSec])

  const seek = useCallback((time: number, resume = playingRef.current) => {
    const clamped = Math.min(Math.max(0, time), Math.max(0, duration))
    stop()
    setView({ playheadSec: clamped })
    if (resume) playFrom(clamped)
  }, [duration, playFrom, setView, stop])

  const togglePlayback = useCallback(() => {
    if (playingRef.current) stop()
    else playFrom(view.playheadSec)
  }, [playFrom, stop, view.playheadSec])

  // Clean up on unmount.
  useEffect(() => stop, []) // eslint-disable-line react-hooks/exhaustive-deps

  const zoom = (factor: number) =>
    setView({ pxPerSecond: Math.min(4000, Math.max(8, view.pxPerSecond * factor)) })

  const skip = (delta: number) => seek(view.playheadSec + delta)

  useEffect(() => {
    const onToggle = () => togglePlayback()
    const onSeek = (event: Event) => {
      const detail = (event as CustomEvent<{ time: number }>).detail
      if (detail && Number.isFinite(detail.time)) seek(detail.time)
    }
    window.addEventListener('warpgrid:togglePlayback', onToggle)
    window.addEventListener('warpgrid:seek', onSeek)
    return () => {
      window.removeEventListener('warpgrid:togglePlayback', onToggle)
      window.removeEventListener('warpgrid:seek', onSeek)
    }
  }, [seek, togglePlayback])

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = (s % 60).toFixed(2).padStart(5, '0')
    return `${m}:${sec}`
  }

  return (
    <footer className={styles.transport}>
      <div className={styles.group}>
        <button className={styles.iconBtn} onClick={() => { stop(); setView({ playheadSec: 0 }) }} title="Return to start">⏮</button>
        <button className={styles.iconBtn} onClick={() => skip(-1)} disabled={!duration} title="Back 1 second">−1</button>
        {playing ? (
          <button className={`${styles.iconBtn} primary`} onClick={stop} title="Stop">⏸</button>
        ) : (
          <button className={`${styles.iconBtn} primary`} onClick={play} disabled={!canPlay} title="Play">▶</button>
        )}
        <button className={styles.iconBtn} onClick={() => skip(1)} disabled={!duration} title="Forward 1 second">+1</button>
      </div>

      <div className={`${styles.time} mono`}>{fmt(view.playheadSec)} / {fmt(duration)}</div>

      <input
        className={styles.seek}
        type="range"
        min={0}
        max={Math.max(0, duration)}
        step={0.001}
        value={Math.min(Math.max(0, view.playheadSec), Math.max(0, duration))}
        disabled={!duration}
        onChange={(e) => seek(parseFloat(e.target.value))}
        title="Seek"
      />

      <div className={styles.spacer} />

      <label className={styles.follow}>
        <input
          type="checkbox"
          checked={view.followPlayhead}
          onChange={(e) => setView({ followPlayhead: e.target.checked })}
        />
        Center
      </label>

      <div className={styles.group}>
        <span className={styles.zoomLabel}>Zoom</span>
        <button className={styles.iconBtn} onClick={() => zoom(1 / 1.3)} title="Zoom out">－</button>
        <button className={styles.iconBtn} onClick={() => zoom(1.3)} title="Zoom in">＋</button>
      </div>
    </footer>
  )
}

interface MidiPlaybackNote {
  time: number
  duration: number
  midi: number
  velocity: number
  trackIndex: number
}

function scheduleMidi(ctx: AudioContext, notes: MidiPlaybackNote[], offset: number, duration: number) {
  const scheduled: Array<{ osc: OscillatorNode; gain: GainNode }> = []
  const now = ctx.currentTime + 0.025
  const horizon = duration + 0.001

  for (const note of notes) {
    const end = note.time + note.duration
    if (end < offset || note.time > horizon) continue
    const startAt = now + Math.max(0, note.time - offset)
    const stopAt = now + Math.max(0.03, end - offset)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = note.trackIndex % 2 === 0 ? 'triangle' : 'sine'
    osc.frequency.value = midiToFrequency(note.midi)
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.01, note.velocity) * 0.045, startAt + 0.012)
    gain.gain.setTargetAtTime(0.0001, Math.max(startAt + 0.02, stopAt - 0.035), 0.018)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(startAt)
    osc.stop(stopAt + 0.08)
    scheduled.push({ osc, gain })
  }

  return scheduled
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}
