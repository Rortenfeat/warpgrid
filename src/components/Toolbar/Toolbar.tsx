import { useRef } from 'react'
import styles from './Toolbar.module.css'
import { useFileImport } from '../../hooks/useFileImport'
import { useProjectStore, useHistory } from '../../state/useProjectStore'
import { ExportPanel } from '../ExportPanel/ExportPanel'

export function Toolbar() {
  const importFiles = useFileImport()
  const reset = useProjectStore((s) => s.reset)
  const sources = useProjectStore((s) => s.project.sources)
  const { undo, redo } = useHistory()
  const fileInput = useRef<HTMLInputElement>(null)

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
        <button title="Undo (Ctrl+Z)" onClick={undo}>↶ Undo</button>
        <button title="Redo (Ctrl+Shift+Z)" onClick={redo}>↷ Redo</button>
      </div>

      <div className={styles.spacer} />

      <div className={styles.group}>
        <button onClick={reset} disabled={sources.length === 0}>Clear</button>
        <ExportPanel />
      </div>
    </header>
  )
}
