import { useRef } from 'react'
import styles from './Toolbar.module.css'
import { useFileImport } from '../../hooks/useFileImport'
import { useProjectStore, useHistory } from '../../state/useProjectStore'
import { ExportPanel } from '../ExportPanel/ExportPanel'
import { timeToBeat } from '../../core/tempoMap'
import { quarterBeatToBarBeat } from '../../core/timeSignature'

export function Toolbar({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const importFiles = useFileImport()
  const reset = useProjectStore((s) => s.reset)
  const sources = useProjectStore((s) => s.project.sources)
  const { undo, redo } = useHistory()
  const fileInput = useRef<HTMLInputElement>(null)
  const hasSources = sources.length > 0

  const addAnchorAtPlayhead = () => {
    const s = useProjectStore.getState()
    const t = s.view.playheadSec
    const beat = Math.round(timeToBeat(t, s.project.anchors))
    s.selectAnchors([s.addAnchor(beat, t)])
  }

  const addTimeSigAtPlayhead = () => {
    const s = useProjectStore.getState()
    const beat = timeToBeat(s.view.playheadSec, s.project.anchors)
    const { bar } = quarterBeatToBarBeat(beat, s.project.timeSignatures)
    s.selectTimeSignature(s.addTimeSignature(bar, 4, 4))
  }

  return (
    <header className={styles.toolbar}>
      <div className={styles.brand}>
        <svg className={styles.logo} viewBox="0 0 32 32" aria-hidden>
          <g stroke="var(--line-strong)" strokeWidth="1">
            <line x1="8" y1="3" x2="8" y2="29" />
            <line x1="16" y1="3" x2="16" y2="29" />
            <line x1="24" y1="3" x2="24" y2="29" />
          </g>
          <path d="M2 19 Q9 5 15 16 T30 13" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="15" cy="16" r="2.4" fill="var(--accent)" />
        </svg>
        <span className={styles.name}>Warpgrid</span>
      </div>

      <div className={styles.group}>
        <button onClick={() => fileInput.current?.click()}>Import…</button>
        <input
          ref={fileInput}
          type="file"
          accept=".wav,.mp3,.flac,.ogg,.m4a,.aac,.aiff,.aif,.mid,.midi"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void importFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      <div className={styles.group}>
        <button title="Add anchor at playhead (A)" disabled={!hasSources} onClick={addAnchorAtPlayhead}>+ Anchor</button>
        <button title="Add time signature at playhead bar" disabled={!hasSources} onClick={addTimeSigAtPlayhead}>+ Time Sig</button>
      </div>

      <div className={styles.group}>
        <button title="Undo (Ctrl+Z)" onClick={undo}>↶ Undo</button>
        <button title="Redo (Ctrl+Shift+Z)" onClick={redo}>↷ Redo</button>
      </div>

      <div className={styles.spacer} />

      <div className={styles.group}>
        <button title="Keyboard shortcuts (?)" onClick={onShowShortcuts}>?</button>
        <button onClick={reset} disabled={!hasSources}>Clear</button>
        <ExportPanel />
      </div>
    </header>
  )
}
