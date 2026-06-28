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
import type { WaveformPeakLevel, WaveformPeaks } from '../../audio/peaks'
import type { ParsedMidi } from '../../midi/parseMidi'

const ANCHOR_HIT_PX = 7
const BAR_HIT_PX = 6
const RULER_H = 22
const MINIMAP_H = 36
const DRAG_THRESHOLD_PX = 4
const SNAP_PX = 7

interface DragState {
  ids: string[]
  moveIds: string[]
  origin: Record<string, number>
  primaryId: string
  startTime: number
  appliedDelta: number
  moved: boolean
  created: boolean
  historyPaused: boolean
  selectionBefore: string[]
  startedWithShift: boolean
}

interface PendingEmpty {
  startX: number
  startY: number
  kind: 'empty' | 'bar'
  barLine?: { beat: number; time: number }
  selectionBefore: string[]
  startedWithShift: boolean
  moved: boolean
}

interface PanState {
  mode: 'middle' | 'minimap'
  startX: number
  startScrollSec: number
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
  const [cursor, setCursor] = useState('crosshair')

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

  const { audioBuffer, peaks, parsedMidi, contentDuration } = useMemo(() => {
    let audioBuffer: AudioBuffer | undefined
    let peaks: WaveformPeaks | undefined
    let parsedMidi: ParsedMidi | undefined
    let dur = 0
    for (const src of project.sources) {
      const m = media[src.id]
      if (m?.audioBuffer) audioBuffer = m.audioBuffer
      if (m?.peaks) peaks = m.peaks
      if (m?.parsedMidi) parsedMidi = m.parsedMidi
      dur = Math.max(dur, src.duration)
    }
    return { audioBuffer, peaks, parsedMidi, contentDuration: dur || 8 }
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
  const minimapTopFor = useCallbackRef(() => Math.max(RULER_H + 40, size.h - MINIMAP_H))

  useEffect(() => {
    if (!view.followPlayhead || size.w === 0) return
    const scrollSec = view.playheadSec - size.w / (2 * view.pxPerSecond)
    if (Math.abs(scrollSec - view.scrollSec) > 0.001) setView({ scrollSec })
  }, [size.w, view.followPlayhead, view.playheadSec, view.pxPerSecond, view.scrollSec, setView])

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
    const minimapTop = Math.max(RULER_H + 40, size.h - MINIMAP_H)
    const laneH = Math.max(20, minimapTop - RULER_H)

    ctx.fillStyle = c('--bg-1')
    ctx.fillRect(0, 0, size.w, RULER_H)

    // ── waveform ──
    if (audioBuffer && shouldDrawRawWaveform(audioBuffer, view.pxPerSecond)) {
      drawRawWaveform(ctx, audioBuffer, {
        width: size.w,
        laneTop,
        laneH,
        scrollSec: view.scrollSec,
        pxPerSecond: view.pxPerSecond,
        waveColor: c('--wave'),
        dividerColor: c('--line'),
      })
    } else if (peaks) {
      drawPeakWaveform(ctx, peaks, {
        width: size.w,
        laneTop,
        laneH,
        scrollSec: view.scrollSec,
        pxPerSecond: view.pxPerSecond,
        waveColor: c('--wave'),
        dividerColor: c('--line'),
      })
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
          const y = laneTop + (1 - (n.midi - lo) / span) * (laneH - 10) + 5
          ctx.globalAlpha = 0.35 + Math.min(0.65, n.velocity ?? 0.8)
          ctx.fillRect(x, y - 2, w, 3)
        }
      }
      ctx.globalAlpha = 1
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
      ctx.lineTo(x + 0.5, minimapTop)
      ctx.stroke()
      if (isBar) {
        ctx.fillStyle = c('--text-2')
        ctx.fillText(String(barNumber(beat, tsList) + 1), x + 3, 14)
        ctx.fillStyle = c('--grid-bar')
        ctx.beginPath()
        ctx.arc(x, RULER_H - 4, 2, 0, Math.PI * 2)
        ctx.fill()
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
      ctx.lineTo(x + 0.5, minimapTop)
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
      ctx.lineTo(px + 0.5, minimapTop)
      ctx.stroke()
    }

    // ── minimap ──
    ctx.fillStyle = c('--bg-2')
    ctx.fillRect(0, minimapTop, size.w, MINIMAP_H)
    ctx.strokeStyle = c('--line')
    ctx.beginPath(); ctx.moveTo(0, minimapTop + 0.5); ctx.lineTo(size.w, minimapTop + 0.5); ctx.stroke()

    if (peaks) {
      const level = smallestPeakLevel(peaks)
      const mid = minimapTop + MINIMAP_H / 2
      ctx.fillStyle = c('--wave-hi')
      for (let px = 0; px < size.w; px++) {
        const t = (px / Math.max(1, size.w)) * peaks.duration
        const bucket = Math.floor((t / peaks.duration) * level.buckets)
        if (bucket < 0 || bucket >= level.buckets) continue
        let min = 0
        let max = 0
        const channels = Math.max(1, peaks.channels ?? 1)
        for (let ch = 0; ch < channels; ch++) {
          const idx = (ch * level.buckets + bucket) * 2
          min = Math.min(min, level.data[idx])
          max = Math.max(max, level.data[idx + 1])
        }
        const yMin = mid - max * (MINIMAP_H / 2) * 0.72
        const yMax = mid - min * (MINIMAP_H / 2) * 0.72
        ctx.fillRect(px, yMin, 1, Math.max(1, yMax - yMin))
      }
    } else if (parsedMidi && contentDuration > 0) {
      ctx.fillStyle = c('--accent-dim')
      ctx.globalAlpha = 0.55
      for (const tr of parsedMidi.midi.tracks) {
        for (const n of tr.notes) {
          const x = (n.time / contentDuration) * size.w
          const w = Math.max(1, (n.duration / contentDuration) * size.w)
          ctx.fillRect(x, minimapTop + 8, w, MINIMAP_H - 16)
        }
      }
      ctx.globalAlpha = 1
    }

    const overviewDuration = Math.max(0.001, contentDuration)
    const viewX = (view.scrollSec / overviewDuration) * size.w
    const viewW = (size.w / view.pxPerSecond / overviewDuration) * size.w
    const playX = (view.playheadSec / overviewDuration) * size.w
    ctx.fillStyle = c('--accent-soft')
    ctx.fillRect(viewX, minimapTop + 3, viewW, MINIMAP_H - 6)
    ctx.strokeStyle = c('--accent')
    ctx.strokeRect(viewX + 0.5, minimapTop + 3.5, viewW, MINIMAP_H - 7)
    if (playX >= 0 && playX <= size.w) {
      ctx.strokeStyle = c('--playhead')
      ctx.beginPath(); ctx.moveTo(playX + 0.5, minimapTop); ctx.lineTo(playX + 0.5, size.h); ctx.stroke()
    }
  }, [size, view, project.anchors, project.timeSignatures, audioBuffer, peaks, parsedMidi, tsMarkers, selectedIds, selectedTsId, rubber, snapX, timeToX, xToTime])

  // ── interaction ────────────────────────────────────────────────────────
  const drag = useRef<DragState | null>(null)
  const pending = useRef<PendingEmpty | null>(null)
  const pan = useRef<PanState | null>(null)

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

  const barLineAt = (x: number): { beat: number; time: number } | null => {
    const tsList = sortedTimeSignatures(project.timeSignatures)
    const startBeat = Math.floor(timeToBeat(view.scrollSec, project.anchors))
    const endBeat = Math.ceil(timeToBeat(view.scrollSec + size.w / view.pxPerSecond, project.anchors))
    let best: { beat: number; time: number } | null = null
    let bestDist = BAR_HIT_PX
    for (let beat = Math.max(0, startBeat - 1); beat <= endBeat + 1; beat++) {
      if (!isDownbeat(beat, tsList)) continue
      const time = beatToTime(beat, project.anchors)
      const d = Math.abs(timeToX(time) - x)
      if (d < bestDist) {
        bestDist = d
        best = { beat, time }
      }
    }
    return best
  }

  // Snap candidates: every non-dragged anchor, the playhead, and t=0.
  const snapCandidates = (excluded: Set<string>): number[] => {
    const cands = [0, view.playheadSec]
    for (const a of project.anchors) if (!excluded.has(a.id)) cands.push(a.time)
    return cands
  }

  const anchorForBeat = (beat: number): string | null => {
    const found = project.anchors.find((a) => Math.abs(a.beat - beat) < 1e-6)
    return found?.id ?? null
  }

  const downstreamIds = (baseIds: string[]): string[] => {
    const anchors = useProjectStore.getState().project.anchors
    const base = anchors.filter((a) => baseIds.includes(a.id))
    if (base.length === 0) return baseIds
    const minBeat = Math.min(...base.map((a) => a.beat))
    return anchors.filter((a) => a.beat >= minBeat - 1e-6).map((a) => a.id)
  }

  const centeredView = (scrollSec: number, pxPerSecond = view.pxPerSecond) => {
    const playheadSec = Math.max(0, scrollSec + size.w / (2 * pxPerSecond))
    return {
      playheadSec,
      scrollSec: playheadSec - size.w / (2 * pxPerSecond),
    }
  }

  const setTimelineScroll = (scrollSec: number) => {
    if (view.followPlayhead && size.w > 0) {
      const next = centeredView(scrollSec)
      setView(next)
      window.dispatchEvent(new CustomEvent('warpgrid:seek', { detail: { time: next.playheadSec } }))
    } else {
      setView({ scrollSec, followPlayhead: false })
    }
  }

  const scrollToMinimapX = (x: number) => {
    const duration = Math.max(0.001, contentDuration)
    const viewportSec = size.w / view.pxPerSecond
    const centerTime = (Math.min(Math.max(0, x), size.w) / Math.max(1, size.w)) * duration
    setTimelineScroll(centerTime - viewportSec / 2)
  }

  const seekTo = (time: number) => {
    const playheadSec = Math.max(0, time)
    setView({ playheadSec })
    window.dispatchEvent(new CustomEvent('warpgrid:seek', { detail: { time: playheadSec } }))
  }

  const hoverCursor = (x: number, y: number): string => {
    if (y >= minimapTopFor()) return 'grab'
    if (anchorAt(x)) return 'ew-resize'
    if (y >= RULER_H && barLineAt(x)) return 'col-resize'
    return 'crosshair'
  }

  const applyDragMove = (x: number, e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const rawDelta = xToTime(x) - d.startTime
    let target = d.origin[d.primaryId] + rawDelta
    let snapped = false
    if (!e.ctrlKey && !e.metaKey) {
      const tol = SNAP_PX / view.pxPerSecond
      const s = snapTime(target, snapCandidates(new Set(d.moveIds)), tol)
      if (s !== target) { target = s; snapped = true }
    }
    const totalDelta = target - d.origin[d.primaryId]
    if (!d.moved) {
      // First move records the pre-drag state, then we pause so the whole
      // gesture collapses into a single undo step.
      if (!d.selectionBefore.includes(d.primaryId)) selectAnchors(d.ids)
      moveAnchorsBy(d.moveIds, totalDelta - d.appliedDelta)
      if (!d.historyPaused) {
        pauseHistory()
        d.historyPaused = true
      }
      d.moved = true
    } else {
      moveAnchorsBy(d.moveIds, totalDelta - d.appliedDelta)
    }
    d.appliedDelta = totalDelta
    setSnapX(snapped ? timeToX(target) : null)
  }

  const beginDrag = (
    hit: string,
    x: number,
    created: boolean,
    startedWithShift: boolean,
    selectionBefore: string[],
  ) => {
    const current = selectionBefore
    const ids = current.includes(hit) ? current : [hit]
    const moveIds = startedWithShift ? ids : downstreamIds(ids)
    const origin: Record<string, number> = {}
    for (const a of useProjectStore.getState().project.anchors) {
      if (moveIds.includes(a.id)) origin[a.id] = a.time
    }
    drag.current = {
      ids,
      moveIds,
      origin,
      primaryId: hit,
      startTime: xToTime(x),
      appliedDelta: 0,
      moved: false,
      created,
      historyPaused: created,
      selectionBefore,
      startedWithShift,
    }
    if (created) pauseHistory()
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (e.button === 0 && y >= minimapTopFor()) {
      scrollToMinimapX(x)
      pan.current = { mode: 'minimap', startX: x, startScrollSec: view.scrollSec }
      setCursor('grabbing')
      canvasRef.current!.setPointerCapture(e.pointerId)
      return
    }

    if (e.button === 1) {
      e.preventDefault()
      pan.current = { mode: 'middle', startX: x, startScrollSec: view.scrollSec }
      setCursor('grabbing')
      canvasRef.current!.setPointerCapture(e.pointerId)
      return
    }
    if (e.button !== 0) return
    const current = selection.kind === 'anchors' ? selection.anchorIds : []

    // Ruler: select a time-signature marker.
    if (y < RULER_H) {
      const tsId = tsMarkerAt(x)
      if (tsId) { selectTimeSignature(tsId); return }
    }

    const hit = anchorAt(x)
    if (hit) {
      if (!e.shiftKey && !current.includes(hit)) selectAnchors([hit])
      beginDrag(hit, x, false, e.shiftKey, current)
      setCursor('ew-resize')
      canvasRef.current!.setPointerCapture(e.pointerId)
      return
    }

    const barLine = barLineAt(x)
    if (barLine && y >= RULER_H) {
      pending.current = { startX: x, startY: y, kind: 'bar', barLine, selectionBefore: current, startedWithShift: e.shiftKey, moved: false }
      setCursor('col-resize')
      canvasRef.current!.setPointerCapture(e.pointerId)
    } else {
      pending.current = { startX: x, startY: y, kind: 'empty', selectionBefore: current, startedWithShift: e.shiftKey, moved: false }
      canvasRef.current!.setPointerCapture(e.pointerId)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (pan.current) {
      if (pan.current.mode === 'minimap') scrollToMinimapX(x)
      else {
        const nextScroll = pan.current.startScrollSec - (x - pan.current.startX) / view.pxPerSecond
        setTimelineScroll(nextScroll)
      }
      return
    }

    if (drag.current) {
      applyDragMove(x, e)
      return
    }

    if (pending.current) {
      const p = pending.current
      if (!p.moved && Math.abs(x - p.startX) > DRAG_THRESHOLD_PX) p.moved = true
      if (p.moved && p.kind === 'bar' && p.barLine) {
        let id = anchorForBeat(p.barLine.beat)
        let created = false
        if (!id) {
          id = addAnchor(p.barLine.beat, p.barLine.time)
          created = true
        }
        selectAnchors([id])
        beginDrag(id, p.startX, created, p.startedWithShift, p.selectionBefore)
        applyDragMove(x, e)
        pending.current = null
        setCursor('ew-resize')
        return
      }
      if (p.moved) setRubber({ x0: p.startX, x1: x })
      else setCursor(hoverCursor(x, y))
      return
    }

    setCursor(hoverCursor(x, y))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    try { canvasRef.current!.releasePointerCapture(e.pointerId) } catch { /* ignore */ }

    if (pan.current) {
      pan.current = null
      setCursor('crosshair')
      return
    }

    if (drag.current) {
      const d = drag.current
      if (d.historyPaused) resumeHistory()
      if (!d.moved) {
        if (d.startedWithShift && !d.created) toggleAnchor(d.primaryId)
        else selectAnchors(d.ids)
        if (!view.followPlayhead) seekTo(d.origin[d.primaryId])
      }
      drag.current = null
      setSnapX(null)
      setCursor('crosshair')
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
        clearSelection()
        if (!view.followPlayhead) seekTo(xToTime(p.startX))
      }
      pending.current = null
      setRubber(null)
      setCursor('crosshair')
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      const rect = canvasRef.current!.getBoundingClientRect()
      const x = e.clientX - rect.left
      const tAtCursor = xToTime(x)
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const pxPerSecond = Math.min(4000, Math.max(8, view.pxPerSecond * factor))
      if (view.followPlayhead && size.w > 0) {
        setView({
          pxPerSecond,
          scrollSec: view.playheadSec - size.w / (2 * pxPerSecond),
        })
      } else {
        const scrollSec = tAtCursor - x / pxPerSecond
        setView({ pxPerSecond, scrollSec, followPlayhead: false })
      }
    } else {
      const scrollSec = view.scrollSec + (e.deltaX || e.deltaY) / view.pxPerSecond
      setTimelineScroll(scrollSec)
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const blockBrowserZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault()
    }
    canvas.addEventListener('wheel', blockBrowserZoom, { passive: false })
    return () => canvas.removeEventListener('wheel', blockBrowserZoom)
  }, [])

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const hit = anchorAt(x)
    if (!hit) return
    removeAnchor(hit)
    if (selectedIds.has(hit)) clearSelection()
  }

  return (
    <div ref={containerRef} className={styles.timeline}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ width: size.w, height: size.h, cursor }}
        onAuxClick={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onContextMenu={onContextMenu}
      />
      <div className={styles.legend}>
        <span>Click: seek when not centered · Drag bar line: anchor · Drag anchor: ripple warp · Shift+drag: isolated · Middle-drag: pan · Right-click: delete</span>
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

function pickPeakLevel(peaks: WaveformPeaks, pxPerSecond: number): WaveformPeakLevel {
  const levels = peaks.levels?.length ? peaks.levels : [{ data: peaks.data, buckets: peaks.buckets }]
  const desiredBuckets = Math.max(1, peaks.duration * pxPerSecond * 1.5)
  return [...levels].sort((a, b) => a.buckets - b.buckets).find((level) => level.buckets >= desiredBuckets) ?? levels[levels.length - 1]
}

function smallestPeakLevel(peaks: WaveformPeaks): WaveformPeakLevel {
  const levels = peaks.levels?.length ? peaks.levels : [{ data: peaks.data, buckets: peaks.buckets }]
  return [...levels].sort((a, b) => a.buckets - b.buckets)[0]
}

function shouldDrawRawWaveform(buffer: AudioBuffer, pxPerSecond: number): boolean {
  return buffer.sampleRate / pxPerSecond <= 4096
}

interface WaveformDrawOptions {
  width: number
  laneTop: number
  laneH: number
  scrollSec: number
  pxPerSecond: number
  waveColor: string
  dividerColor: string
}

function drawRawWaveform(ctx: CanvasRenderingContext2D, buffer: AudioBuffer, opts: WaveformDrawOptions) {
  const channels = Math.max(1, Math.min(buffer.numberOfChannels, 2))
  ctx.fillStyle = opts.waveColor
  drawWaveformChannels(ctx, channels, opts, (ch, px) => {
    const startTime = opts.scrollSec + px / opts.pxPerSecond
    const endTime = opts.scrollSec + (px + 1) / opts.pxPerSecond
    const start = Math.max(0, Math.floor(startTime * buffer.sampleRate))
    const end = Math.min(buffer.length, Math.max(start + 1, Math.ceil(endTime * buffer.sampleRate)))
    if (start >= buffer.length || end <= 0) return null
    const samples = buffer.getChannelData(ch % buffer.numberOfChannels)
    let min = 0
    let max = 0
    for (let i = start; i < end; i++) {
      const v = samples[i]
      if (v < min) min = v
      if (v > max) max = v
    }
    return { min, max }
  })
}

function drawPeakWaveform(ctx: CanvasRenderingContext2D, peaks: WaveformPeaks, opts: WaveformDrawOptions) {
  const level = pickPeakLevel(peaks, opts.pxPerSecond)
  const channels = Math.max(1, Math.min(peaks.channels ?? 1, 2))
  ctx.fillStyle = opts.waveColor
  drawWaveformChannels(ctx, channels, opts, (ch, px) => {
    const t = opts.scrollSec + px / opts.pxPerSecond
    const bucket = Math.floor((t / peaks.duration) * level.buckets)
    if (bucket < 0 || bucket >= level.buckets) return null
    const idx = ((ch % (peaks.channels ?? 1)) * level.buckets + bucket) * 2
    return { min: level.data[idx], max: level.data[idx + 1] }
  })
}

function drawWaveformChannels(
  ctx: CanvasRenderingContext2D,
  channels: number,
  opts: WaveformDrawOptions,
  valueAt: (channel: number, px: number) => { min: number; max: number } | null,
) {
  for (let ch = 0; ch < channels; ch++) {
    const chTop = opts.laneTop + (opts.laneH / channels) * ch
    const chH = opts.laneH / channels
    const mid = chTop + chH / 2
    ctx.strokeStyle = opts.dividerColor
    if (channels > 1 && ch > 0) {
      ctx.beginPath(); ctx.moveTo(0, chTop + 0.5); ctx.lineTo(opts.width, chTop + 0.5); ctx.stroke()
    }
    for (let px = 0; px < opts.width; px++) {
      const v = valueAt(ch, px)
      if (!v) continue
      const yMin = mid - v.max * (chH / 2) * 0.86
      const yMax = mid - v.min * (chH / 2) * 0.86
      ctx.fillRect(px, yMin, 1, Math.max(1, yMax - yMin))
    }
  }
}
