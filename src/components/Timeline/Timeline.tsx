import { useCallbackRef } from './useCallbackRef'
import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './Timeline.module.css'
import {
  useProjectStore,
  pauseHistory,
  resumeHistory,
} from '../../state/useProjectStore'
import { beatToTime, timeToBeat } from '../../core/tempoMap'
import { snapTime } from '../../core/tempoEdit'
import { barLengthInQuarters, sortedTimeSignatures, barStartInQuarters } from '../../core/timeSignature'
import type { WaveformPeaks } from '../../audio/peaks'
import type { ParsedMidi } from '../../midi/parseMidi'

const ANCHOR_HIT_PX = 7
const RULER_H = 22
const DRAG_THRESHOLD_PX = 4
const SNAP_PX = 7

interface DragState {
  ids: string[]
  origin: Record<string, number>
  primaryId: string
  startTime: number
  appliedDelta: number
  moved: boolean
}

interface PendingEmpty {
  startX: number
  startY: number
  time: number
  beat: number
  moved: boolean
}

/**
 * The main timeline canvas: waveform / MIDI notes, the beat grid derived from
 * the tempo map, and draggable warp anchors. Phase 2 adds selection, group
 * drag with snapping, rubber-band select, and time-signature markers — drags
 * are batched into a single undo step.
 */
export function Timeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [rubber, setRubber] = useState<{ x0: number; x1: number } | null>(null)
  const [snapX, setSnapX] = useState<number | null>(null)

  const project = useProjectStore((s) => s.project)
  const media = useProjectStore((s) => s.media)
  const view = useProjectStore((s) => s.view)
  const selection = useProjectStore((s) => s.selection)
  const addAnchor = useProjectStore((s) => s.addAnchor)
  const moveAnchorsBy = useProjectStore((s) => s.moveAnchorsBy)
  const removeAnchor = useProjectStore((s) => s.removeAnchor)
  const selectAnchors = useProjectStore((s) => s.selectAnchors)
  const toggleAnchor = useProjectStore((s) => s.toggleAnchor)
  const selectTimeSignature = useProjectStore((s) => s.selectTimeSignature)
  const clearSelection = useProjectStore((s) => s.clearSelection)
  const setView = useProjectStore((s) => s.setView)

  const selectedIds = useMemo(
    () => new Set(selection.kind === 'anchors' ? selection.anchorIds : []),
    [selection],
  )
  const selectedTsId = selection.kind === 'timeSignature' ? selection.timeSignatureId : undefined

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

  // Real-time x positions of the time-signature markers (ruler), for hit-testing.
  const tsMarkers = useMemo(() => {
    const list = sortedTimeSignatures(project.timeSignatures)
    return list.map((ts) => ({
      ts,
      time: beatToTime(barStartInQuarters(ts.bar, project.timeSignatures), project.anchors),
    }))
  }, [project.timeSignatures, project.anchors])

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

    // ── MIDI notes ──
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

    // ── beat grid ──
    const tsList = sortedTimeSignatures(project.timeSignatures)
    const startBeat = Math.floor(timeToBeat(view.scrollSec, project.anchors))
    const endBeat = Math.ceil(timeToBeat(view.scrollSec + size.w / view.pxPerSecond, project.anchors))
    ctx.font = '10px var(--font-mono, monospace)'
    for (let beat = Math.max(0, startBeat); beat <= endBeat + 1; beat++) {
      const x = timeToX(beatToTime(beat, project.anchors))
      if (x < -2 || x > size.w + 2) continue
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

    // ── time-signature markers (ruler) ──
    ctx.font = '10px var(--font-mono, monospace)'
    for (const { ts, time } of tsMarkers) {
      const x = timeToX(time)
      if (x < -30 || x > size.w + 30) continue
      const selected = ts.id === selectedTsId
      const label = `${ts.numerator}/${ts.denominator}`
      const w = ctx.measureText(label).width + 8
      ctx.fillStyle = selected ? c('--accent') : c('--bg-3')
      ctx.fillRect(x + 1, RULER_H - 13, w, 12)
      ctx.fillStyle = selected ? '#fff' : c('--text-1')
      ctx.fillText(label, x + 5, RULER_H - 3)
    }

    // ── snap guide ──
    if (snapX != null) {
      ctx.strokeStyle = c('--ok')
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(snapX + 0.5, 0); ctx.lineTo(snapX + 0.5, size.h); ctx.stroke()
      ctx.setLineDash([])
    }

    // ── warp anchors ──
    for (const a of project.anchors) {
      const x = timeToX(a.time)
      if (x < -6 || x > size.w + 6) continue
      const sel = selectedIds.has(a.id)
      const baseColor = a.origin === 'detected' ? c('--anchor-detected') : c('--anchor')
      ctx.strokeStyle = sel ? c('--accent') : baseColor
      ctx.lineWidth = sel ? 2.5 : 2
      ctx.beginPath()
      ctx.moveTo(x + 0.5, RULER_H)
      ctx.lineTo(x + 0.5, size.h)
      ctx.stroke()
      ctx.fillStyle = sel ? c('--accent') : baseColor
      ctx.beginPath()
      ctx.moveTo(x, RULER_H)
      ctx.lineTo(x - 5, RULER_H + 8)
      ctx.lineTo(x + 5, RULER_H + 8)
      ctx.closePath()
      ctx.fill()
      if (sel) {
        ctx.strokeStyle = c('--accent')
        ctx.lineWidth = 1
        ctx.strokeRect(x - 5.5, RULER_H + 0.5, 11, 8)
      }
    }

    // ── rubber-band ──
    if (rubber) {
      const x0 = Math.min(rubber.x0, rubber.x1)
      const w = Math.abs(rubber.x1 - rubber.x0)
      ctx.fillStyle = c('--accent-soft')
      ctx.fillRect(x0, RULER_H, w, laneH)
      ctx.strokeStyle = c('--accent')
      ctx.lineWidth = 1
      ctx.strokeRect(x0 + 0.5, RULER_H + 0.5, w, laneH - 1)
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
  }, [size, view, project.anchors, project.timeSignatures, peaks, parsedMidi, tsMarkers, selectedIds, selectedTsId, rubber, snapX, timeToX, xToTime])

  // ── interaction ────────────────────────────────────────────────────────
  const drag = useRef<DragState | null>(null)
  const pending = useRef<PendingEmpty | null>(null)

  const anchorAt = (x: number): string | null => {
    let best: string | null = null
    let bestDist = ANCHOR_HIT_PX
    for (const a of project.anchors) {
      const d = Math.abs(timeToX(a.time) - x)
      if (d < bestDist) { bestDist = d; best = a.id }
    }
    return best
  }

  const tsMarkerAt = (x: number): string | null => {
    for (const { ts, time } of tsMarkers) {
      if (Math.abs(timeToX(time) - x) <= 16) return ts.id
    }
    return null
  }

  // Snap candidates: every non-dragged anchor, the playhead, and t=0.
  const snapCandidates = (excluded: Set<string>): number[] => {
    const cands = [0, view.playheadSec]
    for (const a of project.anchors) if (!excluded.has(a.id)) cands.push(a.time)
    return cands
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Ruler: select a time-signature marker.
    if (y < RULER_H) {
      const tsId = tsMarkerAt(x)
      if (tsId) { selectTimeSignature(tsId); return }
    }

    const hit = anchorAt(x)
    if (e.altKey && hit) {
      removeAnchor(hit)
      clearSelection()
      return
    }

    if (hit) {
      if (e.shiftKey) { toggleAnchor(hit); return }
      // If the hit anchor isn't part of the current selection, select just it.
      const current = selection.kind === 'anchors' ? selection.anchorIds : []
      const ids = current.includes(hit) ? current : [hit]
      if (!current.includes(hit)) selectAnchors([hit])
      const origin: Record<string, number> = {}
      for (const a of project.anchors) if (ids.includes(a.id)) origin[a.id] = a.time
      drag.current = { ids, origin, primaryId: hit, startTime: xToTime(x), appliedDelta: 0, moved: false }
      canvasRef.current!.setPointerCapture(e.pointerId)
    } else {
      pending.current = { startX: x, startY: y, time: Math.max(0, xToTime(x)), beat: 0, moved: false }
      canvasRef.current!.setPointerCapture(e.pointerId)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left

    if (drag.current) {
      const d = drag.current
      const rawDelta = xToTime(x) - d.startTime
      let target = d.origin[d.primaryId] + rawDelta
      let snapped = false
      if (!e.ctrlKey && !e.metaKey) {
        const tol = SNAP_PX / view.pxPerSecond
        const s = snapTime(target, snapCandidates(new Set(d.ids)), tol)
        if (s !== target) { target = s; snapped = true }
      }
      const totalDelta = target - d.origin[d.primaryId]
      if (!d.moved) {
        // First move records the pre-drag state, then we pause so the whole
        // gesture collapses into a single undo step.
        moveAnchorsBy(d.ids, totalDelta - d.appliedDelta)
        pauseHistory()
        d.moved = true
      } else {
        moveAnchorsBy(d.ids, totalDelta - d.appliedDelta)
      }
      d.appliedDelta = totalDelta
      setSnapX(snapped ? timeToX(target) : null)
      return
    }

    if (pending.current) {
      const p = pending.current
      if (!p.moved && Math.abs(x - p.startX) > DRAG_THRESHOLD_PX) p.moved = true
      if (p.moved) setRubber({ x0: p.startX, x1: x })
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    try { canvasRef.current!.releasePointerCapture(e.pointerId) } catch { /* ignore */ }

    if (drag.current) {
      if (drag.current.moved) resumeHistory()
      drag.current = null
      setSnapX(null)
      return
    }

    if (pending.current) {
      const p = pending.current
      if (p.moved && rubber) {
        // Rubber-band: select anchors whose time falls in the swept range.
        const t0 = xToTime(Math.min(rubber.x0, rubber.x1))
        const t1 = xToTime(Math.max(rubber.x0, rubber.x1))
        const ids = project.anchors.filter((a) => a.time >= t0 && a.time <= t1).map((a) => a.id)
        selectAnchors(ids)
      } else {
        // Plain click on empty space: drop a new anchor at the nearest beat.
        clearSelection()
        const t = p.time
        const beat = Math.round(timeToBeat(t, project.anchors))
        const id = addAnchor(beat, t)
        selectAnchors([id])
      }
      pending.current = null
      setRubber(null)
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
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
        <span>Click: add · Drag: warp · Shift: multi-select · box-drag: select · Alt+Click: delete · Ctrl: no-snap · Ctrl+Wheel: zoom</span>
        <span className="mono">{Math.round(view.pxPerSecond)} px/s · {contentDuration.toFixed(1)}s</span>
      </div>
    </div>
  )
}

function isDownbeat(beat: number, tsList: ReturnType<typeof sortedTimeSignatures>): boolean {
  return Number.isInteger(barFractional(beat, tsList))
}
function barNumber(beat: number, tsList: ReturnType<typeof sortedTimeSignatures>): number {
  return Math.floor(barFractional(beat, tsList))
}
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
