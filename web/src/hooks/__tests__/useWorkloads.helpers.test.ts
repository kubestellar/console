import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock state -- controlled from tests
// ---------------------------------------------------------------------------

let mockDemoMode = false
let mockAgentUnavailable = false
const mockClusterCacheRef = {
  clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }>,
}

/** Mocked value for LOCAL_AGENT_HTTP_URL -- tests can override via resetModules */
let mockLocalAgentUrl = 'http://127.0.0.1:8585'

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => mockDemoMode,
}))

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: () => mockAgentUnavailable,
}))

vi.mock('../mcp/shared', () => ({
  clusterCacheRef: mockClusterCacheRef,
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    get LOCAL_AGENT_HTTP_URL() { return mockLocalAgentUrl },
    STORAGE_KEY_TOKEN: 'token',
  }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    FETCH_DEFAULT_TIMEOUT_MS: 10_000,
    MCP_HOOK_TIMEOUT_MS: 15_000,
    POLL_INTERVAL_MS: 30_000,
    POLL_INTERVAL_SLOW_MS: 60_000,
  }
})

vi.mock('../../lib/utils/concurrency', () => ({
  mapSettledWithConcurrency: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  mockDemoMode = false
  mockAgentUnavailable = false
  mockLocalAgentUrl = 'http://127.0.0.1:8585'
  mockClusterCacheRef.clusters = []
  vi.spyOn(globalThis, 'fetch').mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Fresh import helper
// ---------------------------------------------------------------------------

async function importFresh() {
  vi.resetModules()
  return import('../useWorkloads')
}

// ---------------------------------------------------------------------------
// Tests: getDemoWorkloads (pure function)
// ---------------------------------------------------------------------------

describe('getDemoWorkloads', () => {
  it('returns all demo workloads when no filters provided', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads()

    expect(workloads.length).toBe(7)
    // Every workload must have required fields with correct types
    for (const w of workloads) {
      expect(typeof w.name).toBe('string')
      expect(w.name.length).toBeGreaterThan(0)
      expect(typeof w.namespace).toBe('string')
      expect(w.namespace.length).toBeGreaterThan(0)
      expect(['Deployment', 'StatefulSet', 'DaemonSet']).toContain(w.type)
      expect(typeof w.cluster).toBe('string')
      expect(w.cluster!.length).toBeGreaterThan(0)
      expect(typeof w.replicas).toBe('number')
      expect(w.readyReplicas).toBeLessThanOrEqual(w.replicas)
      expect(['Running', 'Degraded', 'Failed', 'Pending']).toContain(w.status)
      expect(w.image).toMatch(/:/)
      expect(new Date(w.createdAt).getTime()).not.toBeNaN()
    }
  })

  it('filters by cluster when cluster parameter is provided', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads('eks-prod-us-east-1')

    expect(workloads.length).toBeGreaterThan(0)
    for (const w of workloads) {
      expect(w.cluster).toBe('eks-prod-us-east-1')
    }
  })

  it('filters by namespace when namespace parameter is provided', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads(undefined, 'production')

    expect(workloads.length).toBeGreaterThan(0)
    for (const w of workloads) {
      expect(w.namespace).toBe('production')
    }
  })

  it('filters by both cluster and namespace', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads('eks-prod-us-east-1', 'data')

    expect(workloads.length).toBeGreaterThan(0)
    for (const w of workloads) {
      expect(w.cluster).toBe('eks-prod-us-east-1')
      expect(w.namespace).toBe('data')
    }
    // Should include redis in the data namespace
    expect(workloads.some(w => w.name === 'redis')).toBe(true)
  })

  it('returns empty array when cluster filter matches nothing', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads('nonexistent-cluster')

    expect(workloads).toEqual([])
  })

  it('returns empty array when namespace filter matches nothing', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads(undefined, 'nonexistent-namespace')

    expect(workloads).toEqual([])
  })

  it('includes workloads across multiple clusters', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads()

    const clusters = new Set(workloads.map(w => w.cluster))
    expect(clusters.size).toBeGreaterThan(1)
  })

  it('includes multiple workload types', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads()

    const types = new Set(workloads.map(w => w.type))
    expect(types.has('Deployment')).toBe(true)
    expect(types.has('StatefulSet')).toBe(true)
  })

  it('includes at least one degraded workload', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads()

    expect(workloads.some(w => w.status === 'Degraded')).toBe(true)
  })

  it('generates valid ISO date strings for createdAt', async () => {
    const { getDemoWorkloads } = await importFresh()
    const workloads = getDemoWorkloads()

    for (const w of workloads) {
      const date = new Date(w.createdAt)
      expect(date.getTime()).not.toBeNaN()
    }
  })
})
describe('authHeaders', () => {
  it('returns Authorization header when token exists in localStorage', async () => {
    localStorage.setItem('token', 'my-jwt-token')
    const { authHeaders } = await importFresh()

    const headers = authHeaders()
    expect(headers.Authorization).toBe('Bearer my-jwt-token')
  })

  it('returns empty object when no token in localStorage', async () => {
    const { authHeaders } = await importFresh()

    const headers = authHeaders()
    expect(headers.Authorization).toBeUndefined()
    expect(Object.keys(headers).length).toBe(0)
  })

  it('reflects updated token on subsequent calls', async () => {
    const { authHeaders } = await importFresh()

    expect(authHeaders().Authorization).toBeUndefined()

    localStorage.setItem('token', 'new-token')
    expect(authHeaders().Authorization).toBe('Bearer new-token')
  })
})
describe('requireLocalAgentHttp', () => {
  it('returns LOCAL_AGENT_HTTP_URL when it is set', async () => {
    mockLocalAgentUrl = 'http://127.0.0.1:8585'
    const { requireLocalAgentHttp } = await importFresh()

    const url = requireLocalAgentHttp('Testing')
    expect(url).toBe('http://127.0.0.1:8585')
  })

  it('throws when LOCAL_AGENT_HTTP_URL is empty', async () => {
    mockLocalAgentUrl = ''
    const { requireLocalAgentHttp } = await importFresh()

    expect(() => requireLocalAgentHttp('Deploying workloads')).toThrow(
      'Deploying workloads requires the local kc-agent; this browser is not connected to one.'
    )
  })

  it('includes the action name in the error message', async () => {
    mockLocalAgentUrl = ''
    const { requireLocalAgentHttp } = await importFresh()

    expect(() => requireLocalAgentHttp('Scaling pods')).toThrow('Scaling pods')
  })
})
