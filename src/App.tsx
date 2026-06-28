import { useEffect, useState } from 'react'
import styles from './App.module.css'
import { Toolbar } from './components/Toolbar/Toolbar'
import { Timeline } from './components/Timeline/Timeline'
import { TempoLane } from './components/TempoLane/TempoLane'
import { TransportBar } from './components/TransportBar/TransportBar'
import { StatusBar } from './components/StatusBar/StatusBar'
import { InspectorBar } from './components/Inspector/InspectorBar'
import { ImportDropzone } from './components/ImportDropzone/ImportDropzone'
import { useProjectStore, useHistory } from './state/useProjectStore'
import { timeToBeat } from './core/tempoMap'

/** True when the keyboard focus is in text entry, so Space remains typeable. */
function inTextEntryField(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  if ((el as HTMLElement).isContentEditable) return true
  if (tag === 'textarea') return true
  if (tag !== 'input') return false
  const type = ((el as HTMLInputElement).type || 'text').toLowerCase()
  return ['email', 'number', 'password', 'search', 'tel', 'text', 'url'].includes(type)
}

function shouldHandleTransportSpace(e: KeyboardEvent): boolean {
  return e.code === 'Space' && !inTextEntryField()
}

/**
 * Single-page Warpgrid shell. Lanes: Toolbar / Timeline / TempoLane /
 * Inspector / Transport / Status. Keyboard-first editing is wired here.
 */
export function App() {
  const hasSources = useProjectStore((s) => s.project.sources.length > 0)
  const { undo, redo } = useHistory()
  const [showShortcuts, setShowShortcuts] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()

      if (shouldHandleTransportSpace(e)) {
        e.preventDefault()
        e.stopPropagation()
        if (!e.repeat) window.dispatchEvent(new Event('warpgrid:togglePlayback'))
        return
      }

      // Undo / redo work everywhere.
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return }

      // The rest must not fire while typing in the inspector / BPM field.
      if (inTextEntryField()) return

      const store = useProjectStore.getState()
      const sel = store.selection
      const selIds = sel.kind === 'anchors' ? sel.anchorIds : []

      if (mod && k === 'a') {
        e.preventDefault(); store.selectAll(); return
      }
      if (k === 'escape') { store.clearSelection(); setShowShortcuts(false); return }
      if (k === '?' || (e.shiftKey && k === '/')) { setShowShortcuts((s) => !s); return }
      if ((k === 'delete' || k === 'backspace') && selIds.length) {
        e.preventDefault(); store.removeAnchors(selIds); store.clearSelection(); return
      }
      if ((k === 'arrowleft' || k === 'arrowright') && selIds.length) {
        e.preventDefault()
        const base = Math.max(0.001, 1 / store.view.pxPerSecond) * (e.shiftKey ? 10 : 1)
        store.moveAnchorsBy(selIds, k === 'arrowleft' ? -base : base)
        return
      }
      if (k === 'a' && !mod) {
        // Drop an anchor at the playhead, snapped to the nearest beat.
        const t = store.view.playheadSec
        const beat = Math.round(timeToBeat(t, store.project.anchors))
        const id = store.addAnchor(beat, t)
        store.selectAnchors([id])
        return
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (!shouldHandleTransportSpace(e)) return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    window.addEventListener('keyup', onKeyUp, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener('keyup', onKeyUp, { capture: true })
    }
  }, [undo, redo])

  return (
    <ImportDropzone>
      <div className={styles.app}>
        <Toolbar onShowShortcuts={() => setShowShortcuts(true)} />
        <main className={styles.workspace}>
          <Timeline />
          <TempoLane />
        </main>
        <InspectorBar />
        <TransportBar />
        <StatusBar />

        {!hasSources && (
          <div className={styles.hint}>
            <div className={styles.hintInner}>
              <strong>Drop an audio or MIDI file</strong>
              <span>or use <em>Import</em> in the toolbar. Drag bar lines onto the performance; Warpgrid creates anchors as you correct the grid.</span>
            </div>
          </div>
        )}

        {showShortcuts && (
          <div className={styles.shortcuts} onClick={() => setShowShortcuts(false)}>
            <div className={styles.shortcutsCard} onClick={(e) => e.stopPropagation()}>
              <h3>Keyboard & mouse</h3>
              <dl>
                <dt>Drag bar line</dt><dd>create or move a warp anchor</dd>
                <dt>Drag anchor</dt><dd>ripple warp — downstream anchors move with it</dd>
                <dt>Shift+Drag</dt><dd>isolated warp — downstream anchors stay fixed</dd>
                <dt>Shift+Click</dt><dd>add / remove anchor from selection</dd>
                <dt>Box drag</dt><dd>rubber-band select anchors</dd>
                <dt>Right-click</dt><dd>delete an anchor</dd>
                <dt>Middle-drag</dt><dd>pan the timeline viewport</dd>
                <dt>Click</dt><dd>seek when Center is off</dd>
                <dt>Space</dt><dd>play / pause</dd>
                <dt>← / →</dt><dd>nudge selected anchors (Shift = ×10)</dd>
                <dt>Delete</dt><dd>remove selected anchors</dd>
                <dt>A</dt><dd>add anchor at the playhead</dd>
                <dt>Ctrl+A / Esc</dt><dd>select all / clear selection</dd>
                <dt>Ctrl+Z / Ctrl+Shift+Z</dt><dd>undo / redo</dd>
                <dt>Ctrl+Wheel</dt><dd>zoom · double-click tempo lane to edit BPM</dd>
              </dl>
              <button className={styles.shortcutsClose} onClick={() => setShowShortcuts(false)}>Close</button>
            </div>
          </div>
        )}
      </div>
    </ImportDropzone>
  )
}
