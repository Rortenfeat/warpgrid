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
 * TempoLane stay in sync. When no audio is loaded the play button is disabled
 * (MIDI playback is a Phase 1 addition).
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
  const duration = useMemo(
    () => audioBuffer?.duration ?? sources.reduce((max, src) => Math.max(max, src.duration), 0),
    [audioBuffer, sources],
  )

  const [playing, setPlaying] = useState(false)
  const nodeRef = useRef<AudioBufferSourceNode | null>(null)
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
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    setPlaying(false)
  }, [])

  const playFrom = useCallback((startAt: number) => {
    if (!audioBuffer) return
    const ctx = getCtx()
    void ctx.resume()
    const node = ctx.createBufferSource()
    node.buffer = audioBuffer
    node.connect(ctx.destination)
    const offset = Math.min(Math.max(0, startAt), audioBuffer.duration - 0.01)
    offsetRef.current = Math.max(0, offset)
    startedAtRef.current = ctx.currentTime
    setView({ playheadSec: offsetRef.current })
    node.start(0, offsetRef.current)
    node.onended = () => { if (nodeRef.current === node) stop() }
    nodeRef.current = node
    setPlaying(true)

    const tick = () => {
      const t = offsetRef.current + (ctx.currentTime - startedAtRef.current)
      setView({ playheadSec: t })
      if (t >= audioBuffer.duration) { stop(); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [audioBuffer, setView, stop])

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
          <button className={`${styles.iconBtn} primary`} onClick={play} disabled={!audioBuffer} title="Play">▶</button>
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
