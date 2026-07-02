// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { redactK8sGroundTruth } from '../redactK8sGroundTruth'
import type { K8sGroundTruth } from '../k8sTypes'

describe('redactK8sGroundTruth', () => {
  it('anonymizes context names while preserving count', () => {
    const input: K8sGroundTruth = {
      runId: 'test-run-1',
      contexts: {
        configured: 3,
        reachable: 3,
        names: ['prod-us-east-1', 'staging-eu-west-1', 'dev-local'],
      },
      nodes: { total: 0, ready: 0, notReady: 0 },
      pods: { total: 0, running: 0, pending: 0, failed: 0, crashLoopBackOff: 0 },
      namespaces: { total: 0, createdByHarness: [] },
      deployments: { total: 0, available: 0, unavailable: 0 },
    }

    const result = redactK8sGroundTruth(input)

    expect(result.contexts.names).toHaveLength(3)
    expect(result.contexts.names[0]).toMatch(/^context-1-/)
    expect(result.contexts.names[1]).toMatch(/^context-2-/)
    expect(result.contexts.names[2]).toMatch(/^context-3-/)
    
    // Should not contain original names
    expect(result.contexts.names.join()).not.toContain('prod-us-east-1')
    expect(result.contexts.names.join()).not.toContain('staging-eu-west-1')
    expect(result.contexts.names.join()).not.toContain('dev-local')
  })

  it('handles special characters in context names', () => {
    const input: K8sGroundTruth = {
      runId: 'test-run-2',
      contexts: {
        configured: 2,
        reachable: 2,
        names: ['test@cluster.local', 'arn:aws:eks:region'],
      },
      nodes: { total: 0, ready: 0, notReady: 0 },
      pods: { total: 0, running: 0, pending: 0, failed: 0, crashLoopBackOff: 0 },
      namespaces: { total: 0, createdByHarness: [] },
      deployments: { total: 0, available: 0, unavailable: 0 },
    }

    const result = redactK8sGroundTruth(input)

    expect(result.contexts.names).toHaveLength(2)
    expect(result.contexts.names[0]).toMatch(/^context-1-/)
    expect(result.contexts.names[1]).toMatch(/^context-2-/)
    
    // Special characters should be removed
    result.contexts.names.forEach(name => {
      expect(name).not.toContain('@')
      expect(name).not.toContain(':')
    })
  })

  it('truncates long context names to 12 characters plus prefix', () => {
    const input: K8sGroundTruth = {
      runId: 'test-run-3',
      contexts: {
        configured: 1,
        reachable: 1,
        names: ['very-long-context-name-that-exceeds-limit'],
      },
      nodes: { total: 0, ready: 0, notReady: 0 },
      pods: { total: 0, running: 0, pending: 0, failed: 0, crashLoopBackOff: 0 },
      namespaces: { total: 0, createdByHarness: [] },
      deployments: { total: 0, available: 0, unavailable: 0 },
    }

    const result = redactK8sGroundTruth(input)

    // Format: context-1-{first12chars}
    expect(result.contexts.names[0]).toMatch(/^context-1-[a-z0-9-]{1,12}$/)
    expect(result.contexts.names[0].length).toBeLessThanOrEqual('context-1-'.length + 12)
  })

  it('preserves numeric counters', () => {
    const input: K8sGroundTruth = {
      runId: 'test-run-4',
      contexts: {
        configured: 3,
        reachable: 2,
        names: ['context1', 'context2', 'context3'],
      },
      nodes: { total: 10, ready: 8, notReady: 2 },
      pods: { total: 50, running: 45, pending: 3, failed: 1, crashLoopBackOff: 1 },
      namespaces: { total: 15, createdByHarness: ['ns1', 'ns2'] },
      deployments: { total: 20, available: 18, unavailable: 2 },
    }

    const result = redactK8sGroundTruth(input)

    // All numeric counters should be preserved
    expect(result.contexts.configured).toBe(3)
    expect(result.contexts.reachable).toBe(2)
    expect(result.nodes.total).toBe(10)
    expect(result.nodes.ready).toBe(8)
    expect(result.nodes.notReady).toBe(2)
    expect(result.pods.total).toBe(50)
    expect(result.pods.running).toBe(45)
    expect(result.pods.pending).toBe(3)
    expect(result.pods.failed).toBe(1)
    expect(result.pods.crashLoopBackOff).toBe(1)
    expect(result.namespaces.total).toBe(15)
    expect(result.deployments.total).toBe(20)
    expect(result.deployments.available).toBe(18)
    expect(result.deployments.unavailable).toBe(2)
  })

  it('sanitizes namespace names created by harness', () => {
    const input: K8sGroundTruth = {
      runId: 'test-run-5',
      contexts: {
        configured: 1,
        reachable: 1,
        names: ['test-cluster'],
      },
      nodes: { total: 0, ready: 0, notReady: 0 },
      pods: { total: 0, running: 0, pending: 0, failed: 0, crashLoopBackOff: 0 },
      namespaces: {
        total: 3,
        createdByHarness: ['harness-test-ns-1', 'harness-test-ns-2'],
      },
      deployments: { total: 0, available: 0, unavailable: 0 },
    }

    const result = redactK8sGroundTruth(input)

    // Namespace names should be sanitized (checked for secrets/tokens)
    expect(result.namespaces.total).toBe(3)
    expect(result.namespaces.createdByHarness).toHaveLength(2)
  })

  it('handles empty contexts array', () => {
    const input: K8sGroundTruth = {
      runId: 'test-run-6',
      contexts: {
        configured: 0,
        reachable: 0,
        names: [],
      },
      nodes: { total: 0, ready: 0, notReady: 0 },
      pods: { total: 0, running: 0, pending: 0, failed: 0, crashLoopBackOff: 0 },
      namespaces: { total: 0, createdByHarness: [] },
      deployments: { total: 0, available: 0, unavailable: 0 },
    }

    const result = redactK8sGroundTruth(input)

    expect(result.contexts.names).toEqual([])
    expect(result.contexts.configured).toBe(0)
    expect(result.contexts.reachable).toBe(0)
  })

  it('redacts runId if it contains secrets', () => {
    const input: K8sGroundTruth = {
      runId: 'run-token-abc123xyz',
      contexts: {
        configured: 1,
        reachable: 1,
        names: ['test'],
      },
      nodes: { total: 0, ready: 0, notReady: 0 },
      pods: { total: 0, running: 0, pending: 0, failed: 0, crashLoopBackOff: 0 },
      namespaces: { total: 0, createdByHarness: [] },
      deployments: { total: 0, available: 0, unavailable: 0 },
    }

    const result = redactK8sGroundTruth(input)

    // runId with TOKEN in key should be redacted
    expect(result.runId).toBe('[REDACTED]')
  })

  it('applies sanitizeJson to entire structure', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
    const input = {
      runId: `test-${jwt}`,
      contexts: {
        configured: 1,
        reachable: 1,
        names: ['test'],
      },
      nodes: { total: 0, ready: 0, notReady: 0 },
      pods: { total: 0, running: 0, pending: 0, failed: 0, crashLoopBackOff: 0 },
      namespaces: { total: 0, createdByHarness: [] },
      deployments: { total: 0, available: 0, unavailable: 0 },
    } as K8sGroundTruth

    const result = redactK8sGroundTruth(input)

    // JWT should be redacted
    expect(result.runId).not.toContain(jwt)
    expect(result.runId).toContain('[REDACTED_JWT]')
  })

  it('handles skipped field', () => {
    const input: K8sGroundTruth = {
      runId: 'test-run-7',
      skipped: 'Test skipped due to missing cluster',
      contexts: {
        configured: 0,
        reachable: 0,
        names: [],
      },
      nodes: { total: 0, ready: 0, notReady: 0 },
      pods: { total: 0, running: 0, pending: 0, failed: 0, crashLoopBackOff: 0 },
      namespaces: { total: 0, createdByHarness: [] },
      deployments: { total: 0, available: 0, unavailable: 0 },
    }

    const result = redactK8sGroundTruth(input)

    expect(result.skipped).toBe('Test skipped due to missing cluster')
    expect(result.contexts.names).toEqual([])
  })
})
