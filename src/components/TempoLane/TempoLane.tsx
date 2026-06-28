import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './TempoLane.module.css'
import { useProjectStore } from '../../state/useProjectStore'
import { beatToTime, deriveTempoSegments, sortedAnchors } from '../../core/tempoMap'

/**
 * Tempo lane: a visualization of the BPM curve implied by the warp anchors,
 * time-aligned with the Timeline. Each segment draws as a step (piecewise
 * constant). Click a step to select that segment; double-click to edit its BPM
 * inline (which retunes the segment, keeping downstream tempos — see
 * core/tempoEdit.setSegmentBpmEdits).
 */
export function TempoLane() {
  const ref = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [edit, setEdit] = useState<{ startId: string; left: number; value: string } | null>(null)

  const anchors = useProjectStore((s) => s.project.anchors)
  const view = useProjectStore((s) => s.view)
  const selection = useProjectStore((s) => s.selection)
  const selectSegment = useProjectStore((s) => s.selectSegment)
  const setSegmentBpm = useProjectStore((s) => s.setSegmentBpm)

  const segments = useMemo(() => deriveTempoSegments(anchors), [anchors])
  const sorted = useMemo(() => sortedAnchors(anchors), [anchors])
  const selectedSegId = selection.kind === 'segment' ? selection.segmentStartId : undefined

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const xFor = (t: number) => (t - view.scrollSec) * view.pxPerSecond
  const xToTime = (x: number) => view.scrollSec + x / view.pxPerSecond

  /** The anchor id that starts the segment under a given x (null = open tail). */
  const segmentStartAt = (x: number): string | null => {
    if (sorted.length < 2) return null
    const t = xToTime(x)
    for (let i = 0; i < sorted.length - 1; i++) {
      if (t >= sorted[i].time && t < sorted[i + 1].time) return sorted[i].id
    }
    return sorted[sorted.length - 2].id // clamp to last real segment
  }

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || size.w === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    const css = getComputedStyle(document.documentElement)
    const c = (n: string) => css.getPropertyValue(n).trim()

    const bpms = segments.map((s) => s.startBpm)
    const minB = Math.min(...bpms) - 6
    const maxB = Math.max(...bpms) + 6
    const range = Math.max(8, maxB - minB)
    const pad = 10
    const yFor = (bpm: number) => size.h - pad - ((bpm - minB) / range) * (size.h - 2 * pad)

    for (const frac of [0.25, 0.5, 0.75]) {
      const y = pad + frac * (size.h - 2 * pad)
      ctx.strokeStyle = c('--line')
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size.w, y); ctx.stroke()
    }

    // Highlight the selected segment band.
    segments.forEach((seg, i) => {
      if (sorted[i]?.id !== selectedSegId) return
      const x0 = xFor(seg.startTime)
      const x1 = xFor(isFinite(seg.endBeat) ? beatToTime(seg.endBeat, anchors) : view.scrollSec + size.w / view.pxPerSecond)
      ctx.fillStyle = c('--accent-soft')
      ctx.fillRect(x0, 0, x1 - x0, size.h)
    })

    // Tempo curve.
    ctx.strokeStyle = c('--accent')
    ctx.lineWidth = 2
    ctx.beginPath()
    let started = false
    for (const seg of segments) {
      const x0 = xFor(seg.startTime)
      const x1 = xFor(isFinite(seg.endBeat) ? beatToTime(seg.endBeat, anchors) : view.scrollSec + size.w / view.pxPerSecond)
      if (seg.curve === 'ramp' && isFinite(seg.endBeat)) {
        for (let i = 0; i <= 24; i++) {
          const frac = i / 24
          const beat = seg.startBeat + (seg.endBeat - seg.startBeat) * frac
          const x = xFor(beatToTime(beat, anchors))
          const y = yFor(seg.startBpm + (seg.endBpm - seg.startBpm) * frac)
          if (!started) { ctx.moveTo(x, y); started = true } else { ctx.lineTo(x, y) }
        }
      } else {
        const y = yFor(seg.startBpm)
        if (!started) { ctx.moveTo(x0, y); started = true } else { ctx.lineTo(x0, y) }
        ctx.lineTo(x1, y)
      }
    }
    ctx.stroke()

    ctx.fillStyle = c('--text-1')
    ctx.font = '11px var(--font-mono, monospace)'
    for (const seg of segments) {
      const x = xFor(seg.startTime)
      if (x < -20 || x > size.w) continue
      ctx.fillText(`${seg.startBpm.toFixed(1)}`, x + 4, yFor(seg.startBpm) - 5)
    }
  }, [size, view, segments, sorted, anchors, selectedSegId])

  const onClick = (e: React.MouseEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    const id = segmentStartAt(e.clientX - rect.left)
    if (id) selectSegment(id)
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const id = segmentStartAt(x)
    if (!id) return
    const idx = sorted.findIndex((a) => a.id === id)
    const seg = segments[idx]
    selectSegment(id)
    setEdit({ startId: id, left: Math.min(size.w - 70, Math.max(2, x)), value: seg ? seg.startBpm.toFixed(2) : '120' })
  }

  const commitEdit = () => {
    if (!edit) return
    const bpm = parseFloat(edit.value)
    if (isFinite(bpm) && bpm > 0) setSegmentBpm(edit.startId, bpm)
    setEdit(null)
  }

  return (
    <div ref={containerRef} className={styles.lane}>
      <div className={styles.label}>TEMPO · BPM</div>
      <canvas ref={ref} style={{ width: size.w, height: size.h }} onClick={onClick} onDoubleClick={onDoubleClick} />
      {edit && (
        <input
          className={styles.bpmInput}
          style={{ left: edit.left }}
          autoFocus
          value={edit.value}
          onChange={(e) => setEdit({ ...edit, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            else if (e.key === 'Escape') setEdit(null)
          }}
          onBlur={commitEdit}
        />
      )}
    </div>
  )
}
