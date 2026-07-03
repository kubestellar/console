import { describe, it, expect } from 'vitest'
import { normalizeK8sState } from '../normalizeK8sState'

describe('normalizeK8sState', () => {
  const baseInput = {
    runId: 'test-run-001',
    contextNames: ['ctx-a', 'ctx-b'],
    reachableContexts: ['ctx-a'],
    nodes: [],
    pods: [],
    namespaces: [],
    deployments: [],
  }

  it('returns correct structure with empty inputs', () => {
    const result = normalizeK8sState(baseInput)
    expect(result).toEqual({
      runId: 'test-run-001',
      contexts: { configured: 2, reachable: 1, names: ['ctx-a', 'ctx-b'] },
      nodes: { total: 0, ready: 0, notReady: 0 },
      pods: { total: 0, running: 0, pending: 0, failed: 0, crashLoopBackOff: 0 },
      namespaces: { total: 0, createdByHarness: [] },
      deployments: { total: 0, available: 0, unavailable: 0 },
    })
  })

  it('counts ready and not-ready nodes', () => {
    const nodes = [
      { status: { conditions: [{ type: 'Ready', status: 'True' }] } },
      { status: { conditions: [{ type: 'Ready', status: 'False' }] } },
      { status: { conditions: [{ type: 'MemoryPressure', status: 'True' }] } },
    ]
    const result = normalizeK8sState({ ...baseInput, nodes })
    expect(result.nodes).toEqual({ total: 3, ready: 1, notReady: 2 })
  })

  it('counts pod phases correctly', () => {
    const pods = [
      { status: { phase: 'Running' } },
      { status: { phase: 'Running' } },
      { status: { phase: 'Pending' } },
      { status: { phase: 'Failed' } },
      { status: { phase: 'Succeeded' } },
    ]
    const result = normalizeK8sState({ ...baseInput, pods })
    expect(result.pods.total).toBe(5)
    expect(result.pods.running).toBe(2)
    expect(result.pods.pending).toBe(1)
    expect(result.pods.failed).toBe(1)
  })

  it('counts CrashLoopBackOff pods', () => {
    const pods = [
      { status: { phase: 'Running', containerStatuses: [{ state: { waiting: { reason: 'CrashLoopBackOff' } } }] } },
      { status: { phase: 'Running', containerStatuses: [{ state: { running: {} } }] } },
    ]
    const result = normalizeK8sState({ ...baseInput, pods })
    expect(result.pods.crashLoopBackOff).toBe(1)
  })

  it('counts available and unavailable deployments', () => {
    const deployments = [
      { status: { replicas: 3, availableReplicas: 3 } },
      { status: { replicas: 2, availableReplicas: 1 } },
      { status: { replicas: 1, availableReplicas: 0 } },
    ]
    const result = normalizeK8sState({ ...baseInput, deployments })
    expect(result.deployments).toEqual({ total: 3, available: 1, unavailable: 2 })
  })

  it('handles deployment with no status', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deployments = [{ status: undefined }, {}] as Array<Record<string, unknown>>
    const result = normalizeK8sState({ ...baseInput, deployments })
    // availableReplicas defaults to 0, replicas defaults to 0 — 0 >= 0 is true
    expect(result.deployments.total).toBe(2)
    expect(result.deployments.available).toBe(2)
  })

  it('preserves createdNamespaces', () => {
    const result = normalizeK8sState({
      ...baseInput,
      namespaces: [{}, {}, {}],
      createdNamespaces: ['ns-a', 'ns-b'],
    })
    expect(result.namespaces).toEqual({ total: 3, createdByHarness: ['ns-a', 'ns-b'] })
  })

  it('defaults createdNamespaces to empty array', () => {
    const result = normalizeK8sState({ ...baseInput, namespaces: [{}] })
    expect(result.namespaces.createdByHarness).toEqual([])
  })

  it('handles nodes with missing status gracefully', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodes = [{ status: undefined }, {}] as Array<Record<string, unknown>>
    const result = normalizeK8sState({ ...baseInput, nodes })
    expect(result.nodes).toEqual({ total: 2, ready: 0, notReady: 2 })
  })
})
