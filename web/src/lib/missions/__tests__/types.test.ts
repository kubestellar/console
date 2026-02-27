import { describe, it, expect } from 'vitest'
import { validateMissionExport } from '../types'
import type { MissionExport } from '../types'

function validMission(): MissionExport {
  return {
    version: '1.0',
    title: 'Test Mission',
    description: 'A test mission for validation',
    type: 'deploy',
    tags: ['kubernetes', 'test'],
    steps: [{ title: 'Step 1', description: 'Do something' }],
  }
}

describe('validateMissionExport', () => {
  it('accepts a valid mission export', () => {
    const result = validateMissionExport(validMission())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects null input', () => {
    const result = validateMissionExport(null)
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('JSON object')
  })

  it('rejects non-object input (string)', () => {
    const result = validateMissionExport('not an object')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('JSON object')
  })

  it('rejects array input', () => {
    const result = validateMissionExport([1, 2, 3])
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('JSON object')
  })

  it('errors when version field is missing', () => {
    const m = validMission() as Record<string, unknown>
    delete m.version
    const result = validateMissionExport(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === '.version')).toBe(true)
  })

  it('errors when title is missing', () => {
    const m = validMission() as Record<string, unknown>
    delete m.title
    const result = validateMissionExport(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === '.title')).toBe(true)
  })

  it('errors when title is empty string', () => {
    const m = validMission()
    m.title = ''
    const result = validateMissionExport(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('title'))).toBe(true)
  })

  it('errors when description is missing', () => {
    const m = validMission() as Record<string, unknown>
    delete m.description
    const result = validateMissionExport(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === '.description')).toBe(true)
  })

  it('errors on invalid type with valid options listed', () => {
    const m = validMission() as Record<string, unknown>
    m.type = 'invalid-type'
    const result = validateMissionExport(m)
    expect(result.valid).toBe(false)
    const typeError = result.errors.find((e) => e.path === '.type')
    expect(typeError).toBeDefined()
    expect(typeError!.message).toContain('upgrade')
    expect(typeError!.message).toContain('troubleshoot')
    expect(typeError!.message).toContain('deploy')
  })

  it('errors when type is missing', () => {
    const m = validMission() as Record<string, unknown>
    delete m.type
    const result = validateMissionExport(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === '.type')).toBe(true)
  })

  it('accepts all valid mission types', () => {
    const types = ['upgrade', 'troubleshoot', 'analyze', 'deploy', 'repair', 'custom'] as const
    for (const type of types) {
      const m = validMission()
      m.type = type
      const result = validateMissionExport(m)
      expect(result.valid).toBe(true)
    }
  })

  it('errors when tags is not an array', () => {
    const m = validMission() as Record<string, unknown>
    m.tags = 'not-an-array'
    const result = validateMissionExport(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === '.tags')).toBe(true)
  })

  it('errors when tags is missing', () => {
    const m = validMission() as Record<string, unknown>
    delete m.tags
    const result = validateMissionExport(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === '.tags')).toBe(true)
  })

  it('errors when steps is missing', () => {
    const m = validMission() as Record<string, unknown>
    delete m.steps
    const result = validateMissionExport(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === '.steps')).toBe(true)
  })

  it('errors when steps is empty array', () => {
    const m = validMission()
    m.steps = []
    const result = validateMissionExport(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('non-empty'))).toBe(true)
  })

  it('errors when a step is missing title', () => {
    const m = validMission()
    m.steps = [{ title: '', description: 'desc' }]
    const result = validateMissionExport(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === '.steps[0].title')).toBe(true)
  })

  it('errors when a step is missing description', () => {
    const m = validMission() as Record<string, unknown>
    m.steps = [{ title: 'Step' }]
    const result = validateMissionExport(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === '.steps[0].description')).toBe(true)
  })

  it('errors when a step is not an object', () => {
    const m = validMission() as Record<string, unknown>
    m.steps = ['not-an-object']
    const result = validateMissionExport(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === '.steps[0]')).toBe(true)
  })

  it('accepts valid mission with all optional fields', () => {
    const m: MissionExport = {
      version: '2.0',
      title: 'Full Mission',
      description: 'A mission with every optional field',
      type: 'troubleshoot',
      tags: ['istio', 'networking'],
      category: 'service-mesh',
      cncfProject: 'istio',
      prerequisites: ['kubectl installed', 'istioctl installed'],
      steps: [
        {
          title: 'Check pods',
          description: 'Verify pods are running',
          command: 'kubectl get pods -n istio-system',
          validation: 'All pods should be Running',
        },
        {
          title: 'Apply config',
          description: 'Apply the YAML manifest',
          yaml: 'apiVersion: v1\nkind: ConfigMap',
        },
      ],
      resolution: {
        summary: 'Fixed the issue',
        steps: ['Restarted pods', 'Applied fix'],
        yaml: 'apiVersion: v1\nkind: Service',
      },
      metadata: {
        author: 'test',
        source: 'manual',
        createdAt: '2025-01-01',
        updatedAt: '2025-01-02',
      },
    }
    const result = validateMissionExport(m)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns data in result even when invalid', () => {
    const m = { version: '1.0' }
    const result = validateMissionExport(m)
    expect(result.valid).toBe(false)
    expect(result.data).toBeDefined()
  })

  it('collects multiple errors at once', () => {
    const result = validateMissionExport({})
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(1)
  })
})
