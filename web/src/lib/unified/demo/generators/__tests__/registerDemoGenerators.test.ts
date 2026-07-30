import { describe, it, expect, vi } from 'vitest'

/**
 * Tests for registerDemoGenerators - demo data generators.
 *
 * Tests the individual generator functions for correctness
 * and the registerAllDemoGenerators orchestration.
 */

// Mock the registry so we can verify registrations
vi.mock('../../demoDataRegistry', () => ({
  registerDemoDataBatch: vi.fn(),
}))

import {
  registerAllDemoGenerators,
  getDemoClusters,
  getDemoPodIssues,
  getDemoDeploymentIssues,
  getDemoEvents,
  getDemoSecurityIssues,
  getDemoGPUNodes,
  getDemoHelmReleases,
  getDemoOperators,
  getDemoServices,
} from '../registerDemoGenerators'
import { registerDemoDataBatch } from '../../demoDataRegistry'

describe('getDemoClusters', () => {
  it('returns an array of clusters', () => {
    const clusters = getDemoClusters()
    expect(Array.isArray(clusters)).toBe(true)
    expect(clusters.length).toBeGreaterThan(0)
  })

  it('each cluster has required fields', () => {
    const clusters = getDemoClusters()
    for (const cluster of clusters) {
      expect(cluster.name).toBeDefined()
      expect(typeof cluster.name).toBe('string')
      expect(cluster.context).toBeDefined()
      expect(typeof cluster.healthy).toBe('boolean')
    }
  })

  it('includes varied distributions', () => {
    const clusters = getDemoClusters()
    const distributions = clusters.map((c) => c.distribution)
    expect(distributions).toContain('kind')
    expect(distributions).toContain('eks')
    expect(distributions).toContain('gke')
    expect(distributions).toContain('openshift')
  })

  it('includes at least one unhealthy cluster', () => {
    const clusters = getDemoClusters()
    const unhealthy = clusters.filter((c) => !c.healthy)
    expect(unhealthy.length).toBeGreaterThanOrEqual(1)
  })
})

describe('getDemoPodIssues', () => {
  it('returns an array of pod issues', () => {
    const issues = getDemoPodIssues()
    expect(Array.isArray(issues)).toBe(true)
    expect(issues.length).toBeGreaterThan(0)
  })

  it('each issue has name, namespace, cluster, status', () => {
    const issues = getDemoPodIssues()
    for (const issue of issues) {
      expect(issue.name).toBeDefined()
      expect(issue.namespace).toBeDefined()
      expect(issue.cluster).toBeDefined()
      expect(issue.status).toBeDefined()
    }
  })

  it('includes varied statuses like CrashLoopBackOff and Pending', () => {
    const issues = getDemoPodIssues()
    const statuses = issues.map((i) => i.status)
    expect(statuses).toContain('CrashLoopBackOff')
    expect(statuses).toContain('Pending')
  })
})

describe('getDemoDeploymentIssues', () => {
  it('returns an array of deployment issues', () => {
    const issues = getDemoDeploymentIssues()
    expect(Array.isArray(issues)).toBe(true)
    expect(issues.length).toBeGreaterThan(0)
  })

  it('each issue has name, namespace, cluster, replicas, status', () => {
    for (const issue of getDemoDeploymentIssues()) {
      expect(issue.name).toBeDefined()
      expect(issue.namespace).toBeDefined()
      expect(issue.cluster).toBeDefined()
      expect(issue.replicas).toBeDefined()
      expect(issue.status).toBeDefined()
    }
  })
})

describe('getDemoEvents', () => {
  it('returns an array of events', () => {
    const events = getDemoEvents()
    expect(Array.isArray(events)).toBe(true)
    expect(events.length).toBeGreaterThan(0)
  })

  it('each event has type, reason, message, involvedObject, cluster', () => {
    for (const event of getDemoEvents()) {
      expect(event.type).toBeDefined()
      expect(event.reason).toBeDefined()
      expect(event.message).toBeDefined()
      expect(event.involvedObject).toBeDefined()
      expect(event.cluster).toBeDefined()
    }
  })

  it('includes both Warning and Normal event types', () => {
    const events = getDemoEvents()
    const types = events.map((e) => e.type)
    expect(types).toContain('Warning')
    expect(types).toContain('Normal')
  })

  it('timestamps are in the past', () => {
    const now = Date.now()
    for (const event of getDemoEvents()) {
      expect(event.timestamp).toBeLessThanOrEqual(now)
    }
  })
})

describe('getDemoSecurityIssues', () => {
  it('returns an array of security issues', () => {
    const issues = getDemoSecurityIssues()
    expect(Array.isArray(issues)).toBe(true)
    expect(issues.length).toBeGreaterThan(0)
  })

  it('includes varied severity levels', () => {
    const issues = getDemoSecurityIssues()
    const severities = issues.map((i) => i.severity)
    expect(severities).toContain('critical')
    expect(severities).toContain('high')
    expect(severities).toContain('medium')
    expect(severities).toContain('low')
  })
})

describe('getDemoGPUNodes', () => {
  it('returns an array of GPU nodes', () => {
    const nodes = getDemoGPUNodes()
    expect(Array.isArray(nodes)).toBe(true)
    expect(nodes.length).toBeGreaterThan(0)
  })

  it('each node has gpuCount and gpuType', () => {
    for (const node of getDemoGPUNodes()) {
      expect(typeof node.gpuCount).toBe('number')
      expect(typeof node.gpuType).toBe('string')
      expect(node.gpuAllocated).toBeLessThanOrEqual(node.gpuCount)
    }
  })
})

describe('getDemoHelmReleases', () => {
  it('returns an array of Helm releases', () => {
    const releases = getDemoHelmReleases()
    expect(Array.isArray(releases)).toBe(true)
    expect(releases.length).toBeGreaterThan(0)
  })

  it('includes at least one failed release', () => {
    const releases = getDemoHelmReleases()
    const failed = releases.filter((r) => r.status === 'failed')
    expect(failed.length).toBeGreaterThanOrEqual(1)
  })
})

describe('getDemoOperators', () => {
  it('returns an array of operators', () => {
    const operators = getDemoOperators()
    expect(Array.isArray(operators)).toBe(true)
    expect(operators.length).toBeGreaterThan(0)
  })

  it('each operator has name, namespace, version, status', () => {
    for (const op of getDemoOperators()) {
      expect(op.name).toBeDefined()
      expect(op.namespace).toBeDefined()
      expect(op.version).toBeDefined()
      expect(op.status).toBeDefined()
    }
  })
})

describe('getDemoServices', () => {
  it('returns an array of services', () => {
    const services = getDemoServices()
    expect(Array.isArray(services)).toBe(true)
    expect(services.length).toBeGreaterThan(0)
  })

  it('includes varied service types', () => {
    const services = getDemoServices()
    const types = services.map((s) => s.type)
    expect(types).toContain('LoadBalancer')
    expect(types).toContain('ClusterIP')
  })
})

describe('registerAllDemoGenerators', () => {
  it('calls registerDemoDataBatch with entries', () => {
    registerAllDemoGenerators()
    expect(registerDemoDataBatch).toHaveBeenCalledTimes(1)
  })

  it('registers entries with correct categories', () => {
    registerAllDemoGenerators()
    const entries = vi.mocked(registerDemoDataBatch).mock.calls[0][0]
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.id).toBeDefined()
      expect(entry.category).toBe('card')
      expect(entry.config.generate).toBeDefined()
      expect(typeof entry.config.generate).toBe('function')
    }
  })

  it('registers expected entry IDs', () => {
    vi.mocked(registerDemoDataBatch).mockClear()
    registerAllDemoGenerators()
    const entries = vi.mocked(registerDemoDataBatch).mock.calls[0][0]
    const ids = entries.map((e: { id: string }) => e.id)
    expect(ids).toContain('clusters')
    expect(ids).toContain('pod_issues')
    expect(ids).toContain('events')
    expect(ids).toContain('security_issues')
    expect(ids).toContain('gpu_inventory')
    expect(ids).toContain('helm_release_status')
  })
})
