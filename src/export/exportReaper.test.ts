import { describe, expect, it } from 'vitest'
import { exportReaper } from './exportReaper'
import { createEmptyProject } from '../core/types'

describe('exportReaper', () => {
  it('includes tempo points and markers', () => {
    const project = createEmptyProject()
    project.anchors.push({ id: 'a2', beat: 4, time: 2, curve: 'constant', origin: 'user' })
    project.timeSignatures.push({ id: 'ts2', bar: 1, numerator: 3, denominator: 4 })

    const text = exportReaper(project)
    expect(text).toContain('HASDATA 1 480 QN')
    expect(text).toContain('CCINTERP 32')
    expect(text).toContain('TEMPOENVEX')
    expect(text).toContain('<TEMPOENVEX')
    expect(text).toContain('PT 0.000000000000')
    expect(text).toContain('ff 58 04')
    expect(text).toContain('TEMPO')
  })

  it('exports tempo points relative to the first bar line', () => {
    const project = createEmptyProject()
    project.anchors = [
      { id: 'a0', beat: 0, time: 2, curve: 'constant', origin: 'user' },
      { id: 'a1', beat: 4, time: 4, curve: 'constant', origin: 'user' },
    ]

    const text = exportReaper(project)

    expect(text).toContain('PT 0.000000000000 120.0000000000')
    expect(text).toContain('PT 2.000000000000 120.0000000000')
  })
})
