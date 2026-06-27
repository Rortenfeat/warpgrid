import { useEffect } from 'react'
import styles from './App.module.css'
import { Toolbar } from './components/Toolbar/Toolbar'
import { Timeline } from './components/Timeline/Timeline'
import { TempoLane } from './components/TempoLane/TempoLane'
import { TransportBar } from './components/TransportBar/TransportBar'
import { StatusBar } from './components/StatusBar/StatusBar'
import { ImportDropzone } from './components/ImportDropzone/ImportDropzone'
import { useProjectStore } from './state/useProjectStore'
import { useHistory } from './state/useProjectStore'

/**
 * Single-page DAW-style shell. No secondary screens — every control lives in
 * one of the horizontal lanes: Toolbar / Timeline / TempoLane / Transport /
 * Status. The ImportDropzone overlays the whole app for drag-and-drop import.
 */
export function App() {
  const hasSources = useProjectStore((s) => s.project.sources.length > 0)
  const { undo, redo } = useHistory()

  // Global keyboard shortcuts (PC/laptop tool — keyboard-first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return (
    <ImportDropzone>
      <div className={styles.app}>
        <Toolbar />
        <main className={styles.workspace}>
          <Timeline />
          <TempoLane />
        </main>
        <TransportBar />
        <StatusBar />
        {!hasSources && (
          <div className={styles.hint}>
            <div className={styles.hintInner}>
              <strong>Drop an audio or MIDI file</strong>
              <span>or use <em>Import</em> in the toolbar. Click the timeline to drop a warp anchor; drag anchors to bend the grid onto the performance.</span>
            </div>
          </div>
        )}
      </div>
    </ImportDropzone>
  )
}
