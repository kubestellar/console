import { describe, it, expect } from 'vitest'
import { fullScan } from '../scanner'
import type { MissionExport } from '../types'

function makeMission(overrides: Partial<MissionExport> = {}): MissionExport {
  return {
    version: '1.0',
    title: 'Test Mission Title',
    description: 'A sufficiently long description for testing',
    type: 'deploy',
    tags: ['kubernetes'],
    steps: [{ title: 'Step 1', description: 'Do something useful' }],
    ...overrides,
  }
}

describe('fullScan', () => {
  it('returns valid with no findings for a good mission', () => {
    const result = fullScan(makeMission())
    expect(result.valid).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('extracts metadata correctly', () => {
    const m = makeMission({ version: '2.0', type: 'troubleshoot', tags: ['a', 'b', 'c'] })
    m.steps = [
      { title: 's1', description: 'd1' },
      { title: 's2', description: 'd2' },
    ]
    const result = fullScan(m)
    expect(result.metadata).toEqual({
      title: 'Test Mission Title',
      type: 'troubleshoot',
      version: '2.0',
      stepCount: 2,
      tagCount: 3,
    })
  })

  it('warns on short title', () => {
    const result = fullScan(makeMission({ title: 'Hi' }))
    expect(result.findings.some((f) => f.code === 'SHORT_TITLE')).toBe(true)
  })

  it('warns on short description', () => {
    const result = fullScan(makeMission({ description: 'Short' }))
    expect(result.findings.some((f) => f.code === 'SHORT_DESCRIPTION')).toBe(true)
  })

  it('warns when tags array is empty', () => {
    const result = fullScan(makeMission({ tags: [] }))
    expect(result.findings.some((f) => f.code === 'NO_TAGS')).toBe(true)
  })

  it('warns on destructive command without validation', () => {
    const m = makeMission({
      steps: [{ title: 'Delete', description: 'Remove ns', command: 'kubectl delete ns test' }],
    })
    const result = fullScan(m)
    expect(result.findings.some((f) => f.code === 'DESTRUCTIVE_NO_VALIDATION')).toBe(true)
  })

  it('no warning for destructive command with validation', () => {
    const m = makeMission({
      steps: [
        {
          title: 'Delete',
          description: 'Remove ns',
          command: 'kubectl delete ns test',
          validation: 'Namespace should be gone',
        },
      ],
    })
    const result = fullScan(m)
    expect(result.findings.some((f) => f.code === 'DESTRUCTIVE_NO_VALIDATION')).toBe(false)
  })

  it('warns on empty YAML block', () => {
    const m = makeMission({
      steps: [{ title: 'Apply', description: 'Apply config', yaml: '   ' }],
    })
    const result = fullScan(m)
    expect(result.findings.some((f) => f.code === 'EMPTY_YAML')).toBe(true)
  })

  it('info finding when resolution has no summary', () => {
    const m = makeMission({
      resolution: { summary: '', steps: ['fixed it'] },
    })
    const result = fullScan(m)
    expect(result.findings.some((f) => f.code === 'NO_RESOLUTION_SUMMARY')).toBe(true)
  })

  it('info finding when resolution has no steps', () => {
    const m = makeMission({
      resolution: { summary: 'Fixed', steps: [] },
    })
    const result = fullScan(m)
    expect(result.findings.some((f) => f.code === 'NO_RESOLUTION_STEPS')).toBe(true)
  })

  it('warns on empty prerequisite', () => {
    const m = makeMission({ prerequisites: ['kubectl', '  ', 'helm'] })
    const result = fullScan(m)
    expect(result.findings.some((f) => f.code === 'EMPTY_PREREQUISITE')).toBe(true)
  })

  it('stays valid when only warnings and info findings present', () => {
    const m = makeMission({ title: 'Hi', tags: [] })
    const result = fullScan(m)
    expect(result.valid).toBe(true)
    expect(result.findings.length).toBeGreaterThan(0)
    expect(result.findings.every((f) => f.severity !== 'error')).toBe(true)
  })
})
