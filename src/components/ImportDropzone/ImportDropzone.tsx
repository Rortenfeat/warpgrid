import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import styles from './ImportDropzone.module.css'
import { useFileImport } from '../../hooks/useFileImport'

/**
 * Full-app drag-and-drop import overlay. Wraps the whole UI; shows a highlight
 * while a file is dragged over the window and routes drops through the shared
 * import pipeline.
 */
export function ImportDropzone({ children }: { children: ReactNode }) {
  const importFiles = useFileImport()
  const [dragging, setDragging] = useState(false)

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      if (e.dataTransfer.files?.length) void importFiles(e.dataTransfer.files)
    },
    [importFiles],
  )

  return (
    <div
      className={styles.zone}
      onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true) }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }}
      onDrop={onDrop}
    >
      {children}
      {dragging && (
        <div className={styles.overlay}>
          <div className={styles.box}>Drop to import audio / MIDI</div>
        </div>
      )}
    </div>
  )
}
