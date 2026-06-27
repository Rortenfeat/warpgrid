import styles from './StatusBar.module.css'
import { useProjectStore } from '../../state/useProjectStore'
import { timeToBeat, tempoAtBeat } from '../../core/tempoMap'
import { formatBarBeat } from '../../core/timeSignature'

/**
 * Bottom status bar: free-text status message plus a live readout of the
 * playhead position (bar.beat.tick) and the local tempo there.
 */
export function StatusBar() {
  const status = useProjectStore((s) => s.status)
  const anchors = useProjectStore((s) => s.project.anchors)
  const timeSignatures = useProjectStore((s) => s.project.timeSignatures)
  const playheadSec = useProjectStore((s) => s.view.playheadSec)
  const anchorCount = useProjectStore((s) => s.project.anchors.length)

  const beat = timeToBeat(playheadSec, anchors)
  const barBeat = formatBarBeat(beat, timeSignatures)
  const bpm = tempoAtBeat(beat, anchors)

  return (
    <div className={styles.status}>
      <span className={styles.msg}>{status}</span>
      <span className={styles.spacer} />
      <span className={styles.field}>anchors <b className="mono">{anchorCount}</b></span>
      <span className={styles.field}>pos <b className="mono">{barBeat}</b></span>
      <span className={styles.field}>tempo <b className="mono">{bpm.toFixed(1)}</b> bpm</span>
    </div>
  )
}
