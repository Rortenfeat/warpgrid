/**
 * Import onset/beat times exported by external tools (including Sonic Visualiser
 * Vamp plugin outputs). This keeps the app working with workflows outside the
 * browser runtime, where directly invoking Vamp is not possible.
 */

import type { OnsetResult } from './onsetDetection'

/** Parse a text export where the first numeric column is time (seconds). */
export function parseOnsetsFromText(content: string): OnsetResult {
  const rows = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  type Candidate = { time: number; strength: number }
  const candidates: Candidate[] = []

  for (const row of rows) {
    if (row.startsWith('#') || row.startsWith('%') || row.startsWith('//')) continue
    if (/^(time|start|onset|timestamp|frame|time\(s\))/i.test(row)) continue

    const parts = row.split(/[\t,;]/).map((value) => value.trim())
    const numbers = parts.filter((value) => value.length > 0 && Number.isFinite(Number(value)))
    if (numbers.length === 0) continue

    const time = Number(numbers[0])
    if (!Number.isFinite(time) || time < 0) continue

    const strength = numbers.length > 1 ? Number(numbers[1]) : 1
    candidates.push({
      time,
      strength: Number.isFinite(strength) ? Math.max(0, strength) : 1,
    })
  }

  candidates.sort((a, b) => a.time - b.time)

  const merged: Candidate[] = []
  const timeEpsilon = 0.005 // merge near-duplicate events (in seconds)

  for (const candidate of candidates) {
    const prev = merged[merged.length - 1]
    if (prev && candidate.time - prev.time <= timeEpsilon) {
      if (candidate.strength > prev.strength) {
        prev.time = candidate.time
        prev.strength = candidate.strength
      }
      continue
    }
    merged.push({ ...candidate })
  }

  const onsets = merged.map((c) => c.time)
  const maxStrength = Math.max(...merged.map((m) => m.strength))
  const denominator = maxStrength > 0 ? maxStrength : 1
  const strength = merged.map((c) => Math.min(1, c.strength / denominator))

  return { onsets, strength }
}
