import { ungzip } from 'pako'
import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '../core/types'
import { exportAbleton } from './exportAbleton'

async function blobText(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return new TextDecoder().decode(ungzip(bytes))
}

describe('exportAbleton', () => {
  it('exports a Live set with main-track tempo and time-signature automation in beat time', async () => {
    const project = createEmptyProject()
    project.anchors = [
      { id: 'a0', beat: 0, time: 0, curve: 'constant', origin: 'user' },
      { id: 'a1', beat: 7, time: 2.9888879999999998, curve: 'constant', origin: 'user' },
      { id: 'a2', beat: 12, time: 6.440472999999999, curve: 'constant', origin: 'user' },
    ]
    project.timeSignatures = [
      { id: 'ts0', bar: 0, numerator: 7, denominator: 4 },
      { id: 'ts2', bar: 2, numerator: 3, denominator: 4 },
    ]

    const xml = await blobText(exportAbleton(project))

    expect(xml).toContain('<Ableton MajorVersion="5" MinorVersion="12.0_12402"')
    expect(xml).toContain('<Tracks>')
    expect(xml).toContain('<MidiTrack Id="16"')
    expect(xml).toContain('<MainSequencer>')
    expect(xml).not.toContain('<Tracks />')
    expect(xml.match(/<Scene Id="/g)).toHaveLength(8)
    expect(xml.match(/<ClipSlotList>/g)).toHaveLength(3)
    expect(xml.match(/<ClipSlot Id="/g)).toHaveLength(24)
    expect(xml).toContain('<FreezeSequencer>')
    expect(xml).toContain('<AudioSequencer Id="0">')
    expect(xml).toContain('<MainTrack SelectedToolPanel="7"')
    expect(xml).toContain('<PointeeId Value="8" />')
    expect(xml).toContain('<PointeeId Value="10" />')
    const pointeeIds = [...xml.matchAll(/<(?:AutomationTarget|ModulationTarget|Pointee|ControllerTargets\.\d+) Id="(\d+)"/g)]
      .map((match) => Number(match[1]))
    expect(new Set(pointeeIds).size).toBe(pointeeIds.length)
    const nextPointeeId = Number(xml.match(/<NextPointeeId Value="(\d+)" \/>/)?.[1])
    expect(Math.max(...pointeeIds)).toBeLessThan(nextPointeeId)

    expect(xml).toContain('<FloatEvent Id="2" Time="0" Value="140.520488" />')
    expect(xml).toContain('<FloatEvent Id="3" Time="7" Value="140.520488" />')
    expect(xml).toContain('<FloatEvent Id="4" Time="7" Value="86.91659" />')
    expect(xml).toContain('<FloatEvent Id="5" Time="12" Value="86.91659" />')

    expect(xml).toContain('<EnumEvent Id="2" Time="0" Value="204" />')
    expect(xml).toContain('<EnumEvent Id="3" Time="14" Value="200" />')
  })
})
