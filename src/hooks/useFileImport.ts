import { useCallback } from 'react'
import { decodeAudioFile, summarizeAudio } from '../audio/decode'
import { computePeaks } from '../audio/peaks'
import { parseMidiFile } from '../midi/parseMidi'
import { useProjectStore } from '../state/useProjectStore'

const AUDIO_EXT = /\.(wav|mp3|flac|ogg|m4a|aac|aiff?)$/i
const MIDI_EXT = /\.(midi?|smf)$/i

/**
 * Imports dropped/selected files: decodes audio (and computes peaks) or parses
 * MIDI, then registers the source in the store. Shared by the toolbar's file
 * picker and the drag-and-drop zone so both paths behave identically.
 */
export function useFileImport() {
  const addAudioSource = useProjectStore((s) => s.addAudioSource)
  const addMidiSource = useProjectStore((s) => s.addMidiSource)
  const setStatus = useProjectStore((s) => s.setStatus)

  return useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        try {
          if (AUDIO_EXT.test(file.name)) {
            setStatus(`Decoding “${file.name}”…`)
            const buffer = await decodeAudioFile(file)
            const peaks = computePeaks(buffer)
            addAudioSource({ name: file.name, ...summarizeAudio(buffer) }, { audioBuffer: buffer, peaks })
          } else if (MIDI_EXT.test(file.name)) {
            setStatus(`Parsing “${file.name}”…`)
            const parsed = await parseMidiFile(file)
            addMidiSource(
              { name: file.name, duration: parsed.duration, trackCount: parsed.trackCount, noteCount: parsed.noteCount },
              parsed,
            )
          } else {
            setStatus(`Unsupported file type: ${file.name}`)
          }
        } catch (err) {
          console.error(err)
          setStatus(`Failed to load ${file.name}: ${(err as Error).message}`)
        }
      }
    },
    [addAudioSource, addMidiSource, setStatus],
  )
}
