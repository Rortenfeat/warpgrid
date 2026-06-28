import { useEffect, useState } from 'react'
import styles from './InspectorBar.module.css'
import { useProjectStore } from '../../state/useProjectStore'
import { segmentBpmAt } from '../../core/tempoEdit'
import { sortedAnchors } from '../../core/tempoMap'
import { quarterBeatToBarBeat } from '../../core/timeSignature'

/**
 * Inspector: a slim contextual edit strip (not a separate screen). Shows
 * numeric fields for whatever is selected — a warp anchor, a tempo segment, or
 * a time-signature marker — and applies edits through the store actions.
 */
export function InspectorBar() {
  const selection = useProjectStore((s) => s.selection)
  const anchors = useProjectStore((s) => s.project.anchors)
  const timeSignatures = useProjectStore((s) => s.project.timeSignatures)

  if (selection.kind === 'anchors' && selection.anchorIds.length === 1) {
    return <AnchorInspector id={selection.anchorIds[0]} />
  }
  if (selection.kind === 'anchors' && selection.anchorIds.length > 1) {
    return (
      <Bar>
        <span className={styles.field}>{selection.anchorIds.length} anchors selected</span>
        <span className={styles.hint}>drag ripples downstream · Shift+drag isolates · ←/→ nudge · Del to delete</span>
      </Bar>
    )
  }
  if (selection.kind === 'segment' && selection.segmentStartId) {
    return <SegmentInspector startId={selection.segmentStartId} />
  }
  if (selection.kind === 'timeSignature' && selection.timeSignatureId) {
    const ts = timeSignatures.find((t) => t.id === selection.timeSignatureId)
    if (ts) return <TimeSigInspector id={ts.id} />
  }

  // Fallback / nothing selected.
  void anchors
  return (
    <Bar>
      <span className={styles.hint}>
        Select an anchor, a tempo segment, or a time-signature marker to edit it here.
      </span>
    </Bar>
  )
}

function Bar({ children }: { children: React.ReactNode }) {
  return <div className={styles.inspector}>{children}</div>
}

function AnchorInspector({ id }: { id: string }) {
  const anchor = useProjectStore((s) => s.project.anchors.find((a) => a.id === id))
  const anchors = useProjectStore((s) => s.project.anchors)
  const timeSignatures = useProjectStore((s) => s.project.timeSignatures)
  const setAnchorTime = useProjectStore((s) => s.setAnchorTime)
  const setAnchorCurve = useProjectStore((s) => s.setAnchorCurve)
  const removeAnchors = useProjectStore((s) => s.removeAnchors)
  const [time, setTime] = useState('')

  useEffect(() => { if (anchor) setTime(anchor.time.toFixed(3)) }, [anchor])
  if (!anchor) return <Bar><span className={styles.hint}>—</span></Bar>

  const { bar, beat } = quarterBeatToBarBeat(anchor.beat, timeSignatures)
  const isFirstAnchor = sortedAnchors(anchors)[0]?.id === id
  const apply = () => {
    const t = parseFloat(time)
    if (isFinite(t)) setAnchorTime(id, t)
  }

  return (
    <Bar>
      <span className={styles.tag}>Anchor</span>
      <label className={styles.field}>beat <b className="mono">{anchor.beat.toFixed(3)}</b></label>
      <label className={styles.field}>bar.beat <b className="mono">{bar + 1}.{(beat + 1).toFixed(2)}</b></label>
      <label className={styles.field}>
        time
        <input
          className={styles.num}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apply() }}
          onBlur={apply}
        />
        s
      </label>
      <label className={styles.field} title="Smooth the tempo from the previous anchor into this anchor">
        <input
          type="checkbox"
          checked={anchor.curve === 'ramp'}
          disabled={isFirstAnchor}
          onChange={(e) => setAnchorCurve(id, e.target.checked ? 'ramp' : 'constant')}
        />
        smooth
      </label>
      <button className={styles.danger} onClick={() => removeAnchors([id])}>Delete</button>
    </Bar>
  )
}

function SegmentInspector({ startId }: { startId: string }) {
  const anchors = useProjectStore((s) => s.project.anchors)
  const setSegmentBpm = useProjectStore((s) => s.setSegmentBpm)
  const [bpm, setBpm] = useState('')

  const current = segmentBpmAt(anchors, startId)
  useEffect(() => { setBpm(current.toFixed(2)) }, [current])

  const apply = () => {
    const v = parseFloat(bpm)
    if (isFinite(v) && v > 0) setSegmentBpm(startId, v)
  }

  return (
    <Bar>
      <span className={styles.tag}>Segment</span>
      <label className={styles.field}>
        tempo
        <input
          className={styles.num}
          value={bpm}
          onChange={(e) => setBpm(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apply() }}
          onBlur={apply}
        />
        BPM
      </label>
      <span className={styles.hint}>retunes this segment; downstream tempos unchanged</span>
    </Bar>
  )
}

function TimeSigInspector({ id }: { id: string }) {
  const ts = useProjectStore((s) => s.project.timeSignatures.find((t) => t.id === id))
  const updateTimeSignature = useProjectStore((s) => s.updateTimeSignature)
  const removeTimeSignature = useProjectStore((s) => s.removeTimeSignature)
  if (!ts) return <Bar><span className={styles.hint}>—</span></Bar>

  return (
    <Bar>
      <span className={styles.tag}>Time Sig</span>
      <span className={styles.field}>bar <b className="mono">{ts.bar + 1}</b></span>
      <label className={styles.field}>
        <input
          type="number" min={1} className={styles.num}
          value={ts.numerator}
          onChange={(e) => updateTimeSignature(id, { numerator: parseInt(e.target.value, 10) })}
        />
        /
        <select
          className={styles.select}
          value={ts.denominator}
          onChange={(e) => updateTimeSignature(id, { denominator: parseInt(e.target.value, 10) })}
        >
          {[1, 2, 4, 8, 16, 32].map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
      <button className={styles.danger} disabled={ts.bar === 0} onClick={() => removeTimeSignature(id)}>
        Delete
      </button>
      {ts.bar === 0 && <span className={styles.hint}>bar 1 signature can't be deleted</span>}
    </Bar>
  )
}
