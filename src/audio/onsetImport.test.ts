import { describe, expect, it } from 'vitest'
import { parseOnsetsFromText } from './onsetImport'

describe('parseOnsetsFromText', () => {
  it('parses comma-separated onset times with optional strengths', () => {
    const csv = `time,strength
0.50,0.9
1.00,0.6
1.50,0.3`

    const result = parseOnsetsFromText(csv)
    expect(result.onsets).toEqual([0.5, 1, 1.5])
    expect(result.strength[0]).toBeCloseTo(1)
    expect(result.strength[1]).toBeCloseTo(0.667, 3)
    expect(result.strength[2]).toBeCloseTo(0.333, 3)
  })

  it('ignores comments and collapses duplicates', () => {
    const text = `
# Sonic generated
0.500	0.8
0.500	1.0
0.501	0.6
0.502	0.9
1.200	0.4
`

    const result = parseOnsetsFromText(text)
    expect(result.onsets).toEqual([0.5, 1.2])
    expect(result.strength).toHaveLength(2)
    expect(result.strength[0]).toBeGreaterThan(result.strength[1])
  })
})
