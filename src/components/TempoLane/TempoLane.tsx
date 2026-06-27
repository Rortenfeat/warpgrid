import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './TempoLane.module.css'
import { useProjectStore } from '../../state/useProjectStore'
import { beatToTime, deriveTempoSegments } from '../../core/tempoMap'

/**
 * Tempo lane: a read-only visualization of the BPM curve implied by the warp
 * anchors, time-aligned with the Timeline above. Each segment draws as a step
 * (piecewise-constant tempo in Phase 0). Editing tempo numerically and ramp
 * curves arrive in ROADMAP Phase 2.
 */
export function TempoLane() {
  const ref = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const anchors = useProjectStore((s) => s.project.anchors)
  const view = useProjectStore((s) => s.view)

  const segments = useMemo(() => deriveTempoSegments(anchors), [anchors])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

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
    const xFor = (t: number) => (t - view.scrollSec) * view.pxPerSecond

    // baseline grid
    ctx.strokeStyle = c('--line')
    ctx.lineWidth = 1
    for (const frac of [0.25, 0.5, 0.75]) {
      const y = pad + frac * (size.h - 2 * pad)
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size.w, y); ctx.stroke()
    }

    // tempo steps
    ctx.strokeStyle = c('--accent')
    ctx.fillStyle = c('--accent-soft')
    ctx.lineWidth = 2
    ctx.beginPath()
    let started = false
    for (const seg of segments) {
      const x0 = xFor(seg.startTime)
      const x1 = xFor(isFinite(seg.endBeat) ? beatToTime(seg.endBeat, anchors) : view.scrollSec + size.w / view.pxPerSecond)
      const y = yFor(seg.startBpm)
      if (!started) { ctx.moveTo(x0, y); started = true } else { ctx.lineTo(x0, y) }
      ctx.lineTo(x1, y)
    }
    ctx.stroke()

    // labels at each segment start
    ctx.fillStyle = c('--text-1')
    ctx.font = '11px var(--font-mono, monospace)'
    for (const seg of segments) {
      const x = xFor(seg.startTime)
      if (x < -20 || x > size.w) continue
      ctx.fillText(`${seg.startBpm.toFixed(1)}`, x + 4, yFor(seg.startBpm) - 5)
    }
  }, [size, view, segments, anchors])

  return (
    <div ref={containerRef} className={styles.lane}>
      <div className={styles.label}>TEMPO · BPM</div>
      <canvas ref={ref} style={{ width: size.w, height: size.h }} />
    </div>
  )
}
