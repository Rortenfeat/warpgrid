import { useState } from 'react'
import styles from './ExportPanel.module.css'
import { useProjectStore } from '../../state/useProjectStore'
import { exportMidi } from '../../export/exportMidi'
import { exportReaper } from '../../export/exportReaper'
import { exportAbleton } from '../../export/exportAbleton'
import { exportTempoMapCsv } from '../../export/exportTempoMap'
import { downloadBlob } from '../../utils/download'

/**
 * Export menu. MIDI / CSV are functional in Phase 0 (tempo map only); Reaper /
 * Ableton writers are stubbed (they emit a skeleton) and marked accordingly —
 * they get fleshed out in ROADMAP Phase 4.
 */
export function ExportPanel() {
  const [open, setOpen] = useState(false)
  const project = useProjectStore((s) => s.project)
  const hasSources = project.sources.length > 0

  const run = (fn: () => void) => {
    try {
      fn()
    } catch (err) {
      useProjectStore.getState().setStatus(`Export failed: ${(err as Error).message}`)
    }
    setOpen(false)
  }

  return (
    <div className={styles.wrap}>
      <button className="primary" disabled={!hasSources} onClick={() => setOpen((o) => !o)}>
        Export ▾
      </button>
      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <ul className={styles.menu}>
            <li onClick={() => run(() => downloadBlob(exportMidi(project), 'warpgrid.mid', 'audio/midi'))}>
              <span>MIDI</span><small>tempo + time-sig meta</small>
            </li>
            <li onClick={() => run(() => downloadBlob(exportTempoMapCsv(project), 'tempo-map.csv', 'text/csv'))}>
              <span>Tempo map (CSV)</span><small>DAW-agnostic table</small>
            </li>
            <li className={styles.wip} onClick={() => run(() => downloadBlob(exportReaper(project), 'warpgrid.rpp', 'text/plain'))}>
              <span>Reaper (.rpp)</span><small>Phase 4 · skeleton</small>
            </li>
            <li className={styles.wip} onClick={() => run(() => downloadBlob(exportAbleton(project), 'warpgrid.als', 'application/gzip'))}>
              <span>Ableton (.als)</span><small>Phase 4 · skeleton</small>
            </li>
          </ul>
        </>
      )}
    </div>
  )
}
