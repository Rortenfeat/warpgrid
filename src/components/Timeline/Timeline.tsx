import { useCallbackRef } from './useCallbackRef'
import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './Timeline.module.css'
import { useProjectStore } from '../../state/useProjectStore'
import { beatToTime, timeToBeat } from '../../core/tempoMap'
import { barLengthInQuarters, sortedTimeSignatures } from '../../core/timeSignature'
import type { WaveformPeaks } from '../../audio/peaks'
import type { ParsedMidi } from '../../midi/parseMidi'

const ANCHOR_HIT_PX = 7
const RULER_H = 22

/**
 * The main timeline canvas: waveform / MIDI notes, the beat grid derived from
 * the tempo map, and draggable warp anchors. This is where the user bends the
 * grid: click empty space to drop an anchor at the nearest beat, drag an anchor
 * to pin that beat to a new point in the audio.
 */
export function Timeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const project = useProjectStore((s) => s.project)
  const media = useProjectStore((s) => s.media)
  const view = useProjectStore((s) => s.view)
  const addAnchor = useProjectStore((s) => s.addAnchor)
  const moveAnchor = useProjectStore((s) => s.moveAnchor)
  const removeAnchor = useProjectStore((s) => s.removeAnchor)
  const setView = useProjectStore((s) => s.setView)

  const { peaks, parsedMidi, contentDuration } = useMemo(() => {
    let peaks: WaveformPeaks | undefined
    let parsedMidi: ParsedMidi | undefined
    let dur = 0
    for (const src of project.sources) {
      const m = media[src.id]
      if (m?.peaks) peaks = m.peaks
      if (m?.parsedMidi) parsedMidi = m.parsedMidi
      dur = Math.max(dur, src.duration)
    }
    return { peaks, parsedMidi, contentDuration: dur || 8 }
  }, [project.sources, media])

  // Track container size for a crisp, responsive canvas.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const timeToX = useCallbackRef((t: number) => (t - view.scrollSec) * view.pxPerSecond)
  const xToTime = useCallbackRef((x: number) => view.scrollSec + x / view.pxPerSecond)

  // ── render ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)

    const css = getComputedStyle(document.documentElement)
    const c = (name: string) => css.getPropertyValue(name).trim()
    const laneTop = RULER_H
    const laneH = size.h - RULER_H

    // Ruler background
    ctx.fillStyle = c('--bg-1')
    ctx.fillRect(0, 0, size.w, RULER_H)

    // ── waveform ──
    if (peaks) {
      const mid = laneTop + laneH / 2
      ctx.fillStyle = c('--wave')
      for (let px = 0; px < size.w; px++) {
        const t0 = xToTime(px)
        const bucket = Math.floor((t0 / peaks.duration) * peaks.buckets)
        if (bucket < 0 || bucket >= peaks.buckets) continue
        const min = peaks.data[bucket * 2]
        const max = peaks.data[bucket * 2 + 1]
        const yMin = mid - max * (laneH / 2) * 0.92
        const yMax = mid - min * (laneH / 2) * 0.92
        ctx.fillRect(px, yMin, 1, Math.max(1, yMax - yMin))
      }
    }

    // ── MIDI notes (simple piano-roll) ──
    if (parsedMidi) {
      let lo = 127, hi = 0
      for (const tr of parsedMidi.midi.tracks) for (const n of tr.notes) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi) }
      const span = Math.max(1, hi - lo)
      ctx.fillStyle = c('--accent-dim')
      for (const tr of parsedMidi.midi.tracks) {
        for (const n of tr.notes) {
          const x = timeToX(n.time)
          const w = Math.max(2, n.duration * view.pxPerSecond)
          const y = laneTop + (1 - (n.midi - lo) / span) * (laneH - 8) + 4
          ctx.fillRect(x, y - 2, w, 3)
        }
      }
    }

    // ── beat grid (derived from the tempo map) ──
    const tsList = sortedTimeSignatures(project.timeSignatures)
    const startBeat = Math.floor(timeToBeat(view.scrollSec, project.anchors))
    const endBeat = Math.ceil(timeToBeat(view.scrollSec + size.w / view.pxPerSecond, project.anchors))
    ctx.font = '10px var(--font-mono, monospace)'
    for (let beat = Math.max(0, startBeat); beat <= endBeat + 1; beat++) {
      const x = timeToX(beatToTime(beat, project.anchors))
      if (x < -2 || x > size.w + 2) continue
      // Is this beat a bar downbeat? Walk bar lengths from the active signature.
      const isBar = isDownbeat(beat, tsList)
      ctx.strokeStyle = isBar ? c('--grid-bar') : c('--grid')
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x + 0.5, isBar ? 0 : RULER_H)
      ctx.lineTo(x + 0.5, size.h)
      ctx.stroke()
      if (isBar) {
        ctx.fillStyle = c('--text-2')
        ctx.fillText(String(barNumber(beat, tsList) + 1), x + 3, 14)
      }
    }

    // ── warp anchors ──
    for (const a of project.anchors) {
      const x = timeToX(a.time)
      if (x < -6 || x > size.w + 6) continue
      ctx.strokeStyle = a.origin === 'detected' ? c('--anchor-detected') : c('--anchor')
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x + 0.5, RULER_H)
      ctx.lineTo(x + 0.5, size.h)
      ctx.stroke()
      // handle
      ctx.fillStyle = a.origin === 'detected' ? c('--anchor-detected') : c('--anchor')
      ctx.beginPath()
      ctx.moveTo(x, RULER_H)
      ctx.lineTo(x - 5, RULER_H + 8)
      ctx.lineTo(x + 5, RULER_H + 8)
      ctx.closePath()
      ctx.fill()
    }

    // ── playhead ──
    const px = timeToX(view.playheadSec)
    if (px >= 0 && px <= size.w) {
      ctx.strokeStyle = c('--playhead')
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px + 0.5, 0)
      ctx.lineTo(px + 0.5, size.h)
      ctx.stroke()
    }
  }, [size, view, project.anchors, project.timeSignatures, peaks, parsedMidi, timeToX, xToTime])

  // ── interaction ────────────────────────────────────────────────────────
  const dragId = useRef<string | null>(null)

  const anchorAt = (x: number): string | null => {
    for (const a of project.anchors) {
      if (Math.abs(timeToX(a.time) - x) <= ANCHOR_HIT_PX) return a.id
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const hit = anchorAt(x)
    if (e.altKey && hit) {
      removeAnchor(hit)
      return
    }
    if (hit) {
      dragId.current = hit
      canvasRef.current!.setPointerCapture(e.pointerId)
    } else {
      // Drop a new anchor: pin the nearest beat to the clicked time.
      const t = Math.max(0, xToTime(x))
      const beat = Math.round(timeToBeat(t, project.anchors))
      addAnchor(beat, t)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragId.current) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const t = Math.max(0, xToTime(e.clientX - rect.left))
    moveAnchor(dragId.current, t)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragId.current) {
      canvasRef.current!.releasePointerCapture(e.pointerId)
      dragId.current = null
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Zoom about the cursor.
      const rect = canvasRef.current!.getBoundingClientRect()
      const x = e.clientX - rect.left
      const tAtCursor = xToTime(x)
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const pxPerSecond = Math.min(4000, Math.max(8, view.pxPerSecond * factor))
      const scrollSec = Math.max(0, tAtCursor - x / pxPerSecond)
      setView({ pxPerSecond, scrollSec })
    } else {
      const scrollSec = Math.max(0, view.scrollSec + (e.deltaX || e.deltaY) / view.pxPerSecond)
      setView({ scrollSec })
    }
  }

  return (
    <div ref={containerRef} className={styles.timeline}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ width: size.w, height: size.h }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      />
      <div className={styles.legend}>
        <span>Click: add anchor · Drag: warp · Alt+Click: delete · Ctrl+Wheel: zoom</span>
        <span className="mono">{Math.round(view.pxPerSecond)} px/s · {contentDuration.toFixed(1)}s</span>
      </div>
    </div>
  )
}

// A beat is a downbeat if its offset from each signature's start aligns to a bar.
function isDownbeat(beat: number, tsList: ReturnType<typeof sortedTimeSignatures>): boolean {
  return Number.isInteger(barFractional(beat, tsList))
}
function barNumber(beat: number, tsList: ReturnType<typeof sortedTimeSignatures>): number {
  return Math.floor(barFractional(beat, tsList))
}
/** Fractional bar position of a quarter-beat, accounting for signature changes. */
function barFractional(beat: number, tsList: ReturnType<typeof sortedTimeSignatures>): number {
  let bars = 0
  let cursorBeat = 0
  for (let i = 0; i < tsList.length; i++) {
    const ts = tsList[i]
    const barLen = barLengthInQuarters(ts)
    const nextChangeBar = i + 1 < tsList.length ? tsList[i + 1].bar : Infinity
    const segStartBeat = cursorBeat
    const segBars = nextChangeBar - ts.bar
    const segEndBeat = isFinite(segBars) ? segStartBeat + segBars * barLen : Infinity
    if (beat < segEndBeat || !isFinite(segEndBeat)) {
      return ts.bar + (beat - segStartBeat) / barLen
    }
    bars = nextChangeBar
    cursorBeat = segEndBeat
  }
  return bars
}
