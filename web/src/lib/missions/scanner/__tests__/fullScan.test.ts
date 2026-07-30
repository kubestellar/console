import { describe, it, expect } from 'vitest'
import { fullScan } from '../index'
import type { MissionExport } from '../../types'

function makeMission(overrides: Partial<MissionExport> = {}): MissionExport {
  return {
    version: '1.0',
    title: 'Install Example Service',
    description: 'A complete guide to installing example service on Kubernetes',
    type: 'install',
    tags: ['kubernetes', 'example'],
    steps: [
      { title: 'Apply manifest', description: 'Apply the deployment', command: 'kubectl apply -f deploy.yaml' },
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Metadata extraction
// ---------------------------------------------------------------------------
describe('fullScan — metadata', () => {
  it('extracts title, type, version from mission', () => {
    const result = fullScan(makeMission())
    expect(result.metadata).toEqual({
      title: 'Install Example Service',
      type: 'install',
      version: '1.0',
      stepCount: 1,
      tagCount: 2,
    })
  })

  it('handles null title/type/version gracefully', () => {
    const result = fullScan(makeMission({ title: '', type: '' as MissionExport['type'], version: '' }))
    expect(result.metadata?.title).toBe('')
    expect(result.metadata?.type).toBe('')
    expect(result.metadata?.version).toBe('')
  })

  it('counts steps and tags', () => {
    const mission = makeMission({
      steps: [
        { title: 'a', description: 'a', command: 'echo a' },
        { title: 'b', description: 'b', command: 'echo b' },
        { title: 'c', description: 'c', command: 'echo c' },
      ],
      tags: ['k8s', 'helm', 'security'],
    })
    const result = fullScan(mission)
    expect(result.metadata?.stepCount).toBe(3)
    expect(result.metadata?.tagCount).toBe(3)
  })

  it('sets stepCount to 0 when steps is undefined', () => {
    const result = fullScan(makeMission({ steps: undefined as unknown as MissionExport['steps'] }))
    expect(result.metadata?.stepCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Title/description quality checks
// ---------------------------------------------------------------------------
describe('fullScan — content quality', () => {
  it('warns on short title (< 5 chars)', () => {
    const result = fullScan(makeMission({ title: 'Fix' }))
    const finding = result.findings.find((f) => f.code === 'SHORT_TITLE')
    expect(finding).toBeDefined()
    expect(finding?.severity).toBe('warning')
    expect(finding?.path).toBe('.title')
  })

  it('does not warn on adequate title', () => {
    const result = fullScan(makeMission({ title: 'Install OpenTelemetry Collector' }))
    expect(result.findings.find((f) => f.code === 'SHORT_TITLE')).toBeUndefined()
  })

  it('warns on short description (< 20 chars)', () => {
    const result = fullScan(makeMission({ description: 'Install it' }))
    const finding = result.findings.find((f) => f.code === 'SHORT_DESCRIPTION')
    expect(finding).toBeDefined()
    expect(finding?.severity).toBe('warning')
    expect(finding?.path).toBe('.description')
  })

  it('does not warn on adequate description', () => {
    const result = fullScan(makeMission({ description: 'A complete guide to deploying the service' }))
    expect(result.findings.find((f) => f.code === 'SHORT_DESCRIPTION')).toBeUndefined()
  })

  it('warns when tags array is empty', () => {
    const result = fullScan(makeMission({ tags: [] }))
    const finding = result.findings.find((f) => f.code === 'NO_TAGS')
    expect(finding).toBeDefined()
    expect(finding?.path).toBe('.tags')
  })

  it('does not warn when tags are present', () => {
    const result = fullScan(makeMission({ tags: ['k8s'] }))
    expect(result.findings.find((f) => f.code === 'NO_TAGS')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Destructive command detection
// ---------------------------------------------------------------------------
describe('fullScan — destructive commands', () => {
  it('warns on kubectl delete without validation', () => {
    const result = fullScan(makeMission({
      steps: [{ title: 'Cleanup', description: 'Remove old deployment', command: 'kubectl delete deployment old-app' }],
    }))
    const finding = result.findings.find((f) => f.code === 'DESTRUCTIVE_NO_VALIDATION')
    expect(finding).toBeDefined()
    expect(finding?.path).toBe('.steps[0]')
  })

  it('warns on kubectl drain without validation', () => {
    const result = fullScan(makeMission({
      steps: [{ title: 'Drain', description: 'Drain node', command: 'kubectl drain node-1' }],
    }))
    expect(result.findings.find((f) => f.code === 'DESTRUCTIVE_NO_VALIDATION')).toBeDefined()
  })

  it('warns on rm -rf without validation', () => {
    const result = fullScan(makeMission({
      steps: [{ title: 'Remove', description: 'Remove dir', command: 'rm -rf /tmp/old' }],
    }))
    expect(result.findings.find((f) => f.code === 'DESTRUCTIVE_NO_VALIDATION')).toBeDefined()
  })

  it('warns on SQL DROP TABLE without validation', () => {
    const result = fullScan(makeMission({
      steps: [{ title: 'Drop', description: 'Drop table', command: 'psql -c "DROP TABLE users"' }],
    }))
    expect(result.findings.find((f) => f.code === 'DESTRUCTIVE_NO_VALIDATION')).toBeDefined()
  })

  it('does NOT warn when destructive command has validation', () => {
    const result = fullScan(makeMission({
      steps: [{
        title: 'Cleanup',
        description: 'Remove old',
        command: 'kubectl delete deployment old-app',
        validation: 'kubectl get deployment old-app should fail',
      }],
    }))
    expect(result.findings.find((f) => f.code === 'DESTRUCTIVE_NO_VALIDATION')).toBeUndefined()
  })

  it('does NOT warn on non-destructive commands', () => {
    const result = fullScan(makeMission({
      steps: [{ title: 'Apply', description: 'Deploy', command: 'kubectl apply -f deploy.yaml' }],
    }))
    expect(result.findings.find((f) => f.code === 'DESTRUCTIVE_NO_VALIDATION')).toBeUndefined()
  })

  it('warns on kubectl cordon and kubectl taint', () => {
    const result = fullScan(makeMission({
      steps: [
        { title: 'Cordon', description: 'Cordon node', command: 'kubectl cordon node-1' },
        { title: 'Taint', description: 'Taint node', command: 'kubectl taint nodes node-1 key=val:NoSchedule' },
      ],
    }))
    const destructive = result.findings.filter((f) => f.code === 'DESTRUCTIVE_NO_VALIDATION')
    expect(destructive).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// YAML step validation
// ---------------------------------------------------------------------------
describe('fullScan — YAML validation', () => {
  it('warns on empty YAML block', () => {
    const result = fullScan(makeMission({
      steps: [{ title: 'Apply', description: 'Apply yaml', yaml: '   ' }],
    }))
    const finding = result.findings.find((f) => f.code === 'EMPTY_YAML')
    expect(finding).toBeDefined()
    expect(finding?.path).toBe('.steps[0].yaml')
  })

  it('warns when YAML contains tabs', () => {
    const result = fullScan(makeMission({
      steps: [{ title: 'Apply', description: 'Apply yaml', yaml: 'apiVersion: v1\n\tkind: Pod' }],
    }))
    const finding = result.findings.find((f) => f.code === 'YAML_TABS')
    expect(finding).toBeDefined()
  })

  it('does NOT warn on valid YAML with spaces', () => {
    const result = fullScan(makeMission({
      steps: [{ title: 'Apply', description: 'Apply yaml', yaml: 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: test' }],
    }))
    expect(result.findings.find((f) => f.code === 'EMPTY_YAML')).toBeUndefined()
    expect(result.findings.find((f) => f.code === 'YAML_TABS')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Resolution checks
// ---------------------------------------------------------------------------
describe('fullScan — resolution', () => {
  it('reports info when resolution has no summary', () => {
    const result = fullScan(makeMission({
      resolution: { summary: '', steps: ['Fixed it'] },
    }))
    const finding = result.findings.find((f) => f.code === 'NO_RESOLUTION_SUMMARY')
    expect(finding).toBeDefined()
    expect(finding?.severity).toBe('info')
  })

  it('reports info when resolution has no steps', () => {
    const result = fullScan(makeMission({
      resolution: { summary: 'Fixed the issue', steps: [] },
    }))
    const finding = result.findings.find((f) => f.code === 'NO_RESOLUTION_STEPS')
    expect(finding).toBeDefined()
    expect(finding?.severity).toBe('info')
  })

  it('does not report when resolution is complete', () => {
    const result = fullScan(makeMission({
      resolution: { summary: 'Resolved by updating config', steps: ['Updated config.yaml'] },
    }))
    expect(result.findings.find((f) => f.code === 'NO_RESOLUTION_SUMMARY')).toBeUndefined()
    expect(result.findings.find((f) => f.code === 'NO_RESOLUTION_STEPS')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Prerequisite checks
// ---------------------------------------------------------------------------
describe('fullScan — prerequisites', () => {
  it('warns on empty prerequisite strings', () => {
    const result = fullScan(makeMission({
      prerequisites: ['kubectl installed', '', 'Helm 3'],
    }))
    const finding = result.findings.find((f) => f.code === 'EMPTY_PREREQUISITE')
    expect(finding).toBeDefined()
    expect(finding?.path).toBe('.prerequisites[1]')
  })

  it('does not warn when all prerequisites are non-empty', () => {
    const result = fullScan(makeMission({
      prerequisites: ['kubectl installed', 'Helm 3'],
    }))
    expect(result.findings.find((f) => f.code === 'EMPTY_PREREQUISITE')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Overall validity
// ---------------------------------------------------------------------------
describe('fullScan — validity', () => {
  it('returns valid: true when no error-severity findings', () => {
    const result = fullScan(makeMission())
    expect(result.valid).toBe(true)
  })

  it('returns valid: true even with warnings', () => {
    const result = fullScan(makeMission({ title: 'Fix', tags: [] }))
    expect(result.findings.length).toBeGreaterThan(0)
    expect(result.valid).toBe(true) // warnings don't invalidate
  })

  it('returns findings array even for clean missions', () => {
    const result = fullScan(makeMission())
    expect(Array.isArray(result.findings)).toBe(true)
  })
})
