import { useRef, useState } from 'react'
import styles from './Toolbar.module.css'
import { useFileImport } from '../../hooks/useFileImport'
import { useProjectStore, useHistory } from '../../state/useProjectStore'
import { ExportPanel } from '../ExportPanel/ExportPanel'
import { timeToBeat } from '../../core/tempoMap'
import { quarterBeatToBarBeat } from '../../core/timeSignature'
import { detectOnsets } from '../../audio/onsetDetection'
import { parseOnsetsFromText } from '../../audio/onsetImport'

export function Toolbar({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const importFiles = useFileImport()
  const reset = useProjectStore((s) => s.reset)
  const sources = useProjectStore((s) => s.project.sources)
  const media = useProjectStore((s) => s.media)
  const clearAudioOnsets = useProjectStore((s) => s.clearAudioOnsets)
  const { undo, redo } = useHistory()
  const fileInput = useRef<HTMLInputElement>(null)
  const onsetFileInput = useRef<HTMLInputElement>(null)
  const [detecting, setDetecting] = useState(false)
  const hasSources = sources.length > 0
  const audioSource = sources.find((src) => media[src.id]?.audioBuffer)

  const applyDetectedOnsets = (sourceId: string | undefined, resultLabel: string, result: { onsets: number[]; strength: number[] }) => {
    const s = useProjectStore.getState()
    if (!sourceId) return false
    s.setAudioOnsets(sourceId, result)
    s.setStatus(`Loaded ${result.onsets.length} events from ${resultLabel}; alignment guides updated`)
    return true
  }

  const loadImportedOnsets = async (file: File) => {
    const s = useProjectStore.getState()
    const sourceId = audioSource?.id
    if (!sourceId) {
      s.setStatus('Import an audio file first, then import onset/beat data for it.')
      return
    }
    setDetecting(true)
    s.setStatus(`Parsing onset list “${file.name}”...`)
    try {
      const text = await file.text()
      const parsed = parseOnsetsFromText(text)
      if (parsed.onsets.length === 0) {
        s.setStatus(`“${file.name}” parsed successfully but contained no valid onset times`)
        return
      }
      applyDetectedOnsets(sourceId, `“${file.name}”`, parsed)
    } catch (error) {
      s.setStatus(error instanceof Error ? error.message : 'Failed to import onset data')
    } finally {
      setDetecting(false)
    }
  }

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

  const generateCandidates = async () => {
    const s = useProjectStore.getState()
    const source = s.project.sources.find((src) => s.media[src.id]?.audioBuffer)
    const buffer = source ? s.media[source.id]?.audioBuffer : undefined
    if (!source || !buffer) return
    setDetecting(true)
    s.setStatus('Detecting audio transients...')
    try {
      const result = await detectOnsets(buffer)
      applyDetectedOnsets(source.id, 'audio detection', result)
    } catch (error) {
      s.setStatus(error instanceof Error ? error.message : 'Onset detection failed')
    } finally {
      setDetecting(false)
    }
  }

  const clearDetectedGuides = () => {
    if (!audioSource) return
    clearAudioOnsets(audioSource.id)
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
        <input
          ref={onsetFileInput}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain"
          hidden
          onChange={(e) => {
            if (!e.target.files || e.target.files.length === 0) return
            const file = e.target.files[0]
            void loadImportedOnsets(file)
            e.target.value = ''
          }}
        />
      </div>

      <div className={styles.group}>
        <button title="Add anchor at playhead (A)" disabled={!hasSources} onClick={addAnchorAtPlayhead}>+ Anchor</button>
        <button title="Add time signature at playhead bar" disabled={!hasSources} onClick={addTimeSigAtPlayhead}>+ Time Sig</button>
        <button title="Detect audio transients to update alignment guides" disabled={!audioSource || detecting} onClick={() => void generateCandidates()}>
          {detecting ? 'Detecting...' : 'Detect'}
        </button>
        <button title="Import onset/beat times from Sonic Visualiser or other tools" disabled={!audioSource || detecting} onClick={() => onsetFileInput.current?.click()}>
          Import onsets
        </button>
        <button title="Clear detected/ imported alignment guide points" disabled={!audioSource || detecting} onClick={clearDetectedGuides}>
          Clear Guides
        </button>
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
