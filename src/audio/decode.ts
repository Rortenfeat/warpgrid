/**
 * Audio decoding via the Web Audio API.
 *
 * Decoding is browser-native (no extra deps). The decoded AudioBuffer is heavy
 * and is held in the runtime media registry (see state layer), not in the
 * serializable / undoable project state.
 */

/** Decode an audio file (wav/mp3/flac/ogg as the browser supports) to a buffer. */
export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer()
  // A short-lived context just for decoding; sample rate follows the device.
  const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  try {
    // decodeAudioData wants its own copy; slice to avoid detaching the source.
    return await ctx.decodeAudioData(arrayBuffer.slice(0))
  } finally {
    void ctx.close()
  }
}

/** Lightweight, serializable summary of a decoded buffer. */
export interface AudioSummary {
  duration: number
  sampleRate: number
  channels: number
}

export function summarizeAudio(buffer: AudioBuffer): AudioSummary {
  return {
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
  }
}
