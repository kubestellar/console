import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { redactK8sGroundTruth } from '../redactK8sGroundTruth'
import type { K8sGroundTruth } from '../k8sTypes'

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('redactK8sGroundTruth', () => {
  const baseGroundTruth: K8sGroundTruth = {
    runId: 'run-123',
    contexts: {
      configured: 2,
      reachable: 1,
      names: ['arn:aws:eks:us-east-1:123456789012:cluster/prod', 'gke_project_zone_cluster'],
    },
    nodes: { total: 4, ready: 3, notReady: 1 },
    pods: { total: 20, running: 15, pending: 3, failed: 2, crashLoopBackOff: 1 },
    namespaces: { total: 10, createdByHarness: ['ns-fixture-1'] },
    deployments: { total: 5, available: 4, unavailable: 1 },
  }

  it('anonymizes context names with index-based prefix', () => {
    const result = redactK8sGroundTruth(baseGroundTruth)
    expect(result.contexts.names[0]).toMatch(/^context-1-/)
    expect(result.contexts.names[1]).toMatch(/^context-2-/)
  })

  it('strips non-alphanumeric characters from context names', () => {
    const result = redactK8sGroundTruth(baseGroundTruth)
    // Original has colons, slashes, underscores — all stripped
    for (const name of result.contexts.names) {
      const suffix = name.replace(/^context-\d+-/, '')
      expect(suffix).toMatch(/^[a-z0-9]*$/i)
    }
  })

  it('truncates context name suffix to 12 characters', () => {
    const result = redactK8sGroundTruth(baseGroundTruth)
    for (const name of result.contexts.names) {
      const suffix = name.replace(/^context-\d+-/, '')
      expect(suffix.length).toBeLessThanOrEqual(12)
    }
  })

  it('preserves numeric fields unchanged', () => {
    const result = redactK8sGroundTruth(baseGroundTruth)
    expect(result.nodes).toEqual(baseGroundTruth.nodes)
    expect(result.pods).toEqual(baseGroundTruth.pods)
    expect(result.deployments).toEqual(baseGroundTruth.deployments)
    expect(result.contexts.configured).toBe(2)
    expect(result.contexts.reachable).toBe(1)
  })

  it('sanitizes any sensitive values via sanitizeJson', () => {
    const withSecret: K8sGroundTruth = {
      ...baseGroundTruth,
      runId: 'Bearer some-secret-token-value',
    }
    const result = redactK8sGroundTruth(withSecret)
    expect(result.runId).toContain('Bearer [REDACTED]')
  })

  it('handles empty context names array', () => {
    const input: K8sGroundTruth = {
      ...baseGroundTruth,
      contexts: { configured: 0, reachable: 0, names: [] },
    }
    const result = redactK8sGroundTruth(input)
    expect(result.contexts.names).toEqual([])
  })
})
