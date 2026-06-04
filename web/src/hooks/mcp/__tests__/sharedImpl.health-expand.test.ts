/**
 * Expanded tests for sharedImpl.health.ts — covers fetchSingleClusterHealth
 * and detectClusterDistribution, which are not tested in sharedImpl.health.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────

let mockIsAgentUnavailable = false
let mockIsNetlifyDeployment = false
let mockIsDemoToken = false
let mockIsClusterMode = false

vi.mock('../../useLocalAgent', () => ({
  reportAgentDataSuccess: vi.fn(),
  reportAgentDataError: vi.fn(),
  isAgentUnavailable: () => mockIsAgentUnavailable,
  getAgentClusterCount: () => 1,
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoToken: () => mockIsDemoToken,
  get isNetlifyDeployment() { return mockIsNetlifyDeployment },
}))

vi.mock('../../../lib/cache/fetcherUtils', () => ({
  isClusterModeBackend: () => mockIsClusterMode,
}))

const mockKubectlExec = vi.fn()
vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: (...args: unknown[]) => mockKubectlExec(...args) },
}))

const mockApiGet = vi.fn()
vi.mock('../../../lib/api', () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
}))

const mockAgentFetch = vi.fn()
vi.mock('../agentFetch', () => ({
  getLocalAgentURL: () => 'http://localhost:4201',
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
  getStoredAgentToken: () => sessionStorage.getItem('kc-auth-token') || '',
}))

const mockDetectDistributionFromNamespaces = vi.fn(() => undefined as string | undefined)
vi.mock('../clusterUtils', () => ({
  detectDistributionFromNamespaces: (...args: unknown[]) => mockDetectDistributionFromNamespaces(...args),
}))

vi.mock('../sharedImpl.state', () => ({
  updateSingleClusterInCache: vi.fn(),
}))

vi.mock('../sharedImpl.constants', () => ({
  HEALTH_CHECK_CONCURRENCY: 3,
  MAX_HEALTH_CHECK_FAILURES: 5,
  MAX_DISTRIBUTION_FAILURES: 3,
}))

vi.mock('../../../lib/constants/time', () => ({
  MS_PER_MINUTE: 60_000,
}))

vi.mock('../../../lib/constants', () => ({
  MCP_HOOK_TIMEOUT_MS: 10_000,
  METRICS_SERVER_TIMEOUT_MS: 5_000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:4201',
  KUBECTL_MAX_TIMEOUT_MS: 30_000,
}))

vi.mock('../../../lib/constants/network', () => ({
  MCP_HOOK_TIMEOUT_MS: 10_000,
  METRICS_SERVER_TIMEOUT_MS: 5_000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:4201',
  KUBECTL_MAX_TIMEOUT_MS: 30_000,
  FOCUS_DELAY_MS: 100,
}))

// ── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mockIsAgentUnavailable = false
  mockIsNetlifyDeployment = false
  mockIsDemoToken = false
  mockIsClusterMode = false
  mockDetectDistributionFromNamespaces.mockReturnValue(undefined)
  localStorage.clear()
})

// ── fetchSingleClusterHealth ───────────────────────────────────────────────

describe('fetchSingleClusterHealth', () => {
  it('returns health from local agent on success', async () => {
    const healthData = { cluster: 'prod', healthy: true, reachable: true, nodeCount: 5 }
    mockAgentFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(healthData),
    })
    const { fetchSingleClusterHealth } = await import('../sharedImpl.health')
    const result = await fetchSingleClusterHealth('prod', 'prod-ctx')
    expect(result).toEqual(healthData)
    expect(mockAgentFetch).toHaveBeenCalledWith(
      expect.stringContaining('cluster-health?cluster=prod-ctx'),
      expect.any(Object)
    )
  })

  it('falls through to backend fetch when agent HTTP returns non-OK', async () => {
    mockAgentFetch.mockResolvedValueOnce({ ok: false })
    // Fallback fetch returns health
    const healthData = { cluster: 'prod', healthy: true, nodeCount: 3 }
    const globalFetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(healthData),
    })
    vi.stubGlobal('fetch', globalFetchMock)

    const { fetchSingleClusterHealth } = await import('../sharedImpl.health')
    const result = await fetchSingleClusterHealth('prod', 'prod-ctx')
    expect(result).toEqual(healthData)
    expect(globalFetchMock).toHaveBeenCalled()
  })

  it('falls through to backend when agent fetch throws', async () => {
    mockAgentFetch.mockRejectedValueOnce(new TypeError('connection refused'))
    const healthData = { cluster: 'prod', healthy: true, nodeCount: 2 }
    const globalFetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(healthData),
    })
    vi.stubGlobal('fetch', globalFetchMock)

    const { fetchSingleClusterHealth } = await import('../sharedImpl.health')
    const result = await fetchSingleClusterHealth('prod')
    expect(result).toEqual(healthData)
  })

  it('returns null when healthCheckFailures >= MAX_HEALTH_CHECK_FAILURES', async () => {
    // Agent is called first (non-OK), then the failures check short-circuits before backend fetch
    mockAgentFetch.mockResolvedValueOnce({ ok: false })
    const globalFetchMock = vi.fn()
    vi.stubGlobal('fetch', globalFetchMock)

    const { fetchSingleClusterHealth, setHealthCheckFailures } = await import('../sharedImpl.health')
    setHealthCheckFailures(5) // MAX_HEALTH_CHECK_FAILURES = 5

    const result = await fetchSingleClusterHealth('prod')
    expect(result).toBeNull()
    // Backend fallback (global fetch) should NOT be called — failures check returns early
    expect(globalFetchMock).not.toHaveBeenCalled()
  })

  it('returns null when isDemoToken is true', async () => {
    // Agent is called first (non-OK), then isDemoToken check short-circuits before backend fetch
    mockIsDemoToken = true
    mockAgentFetch.mockResolvedValueOnce({ ok: false })
    const globalFetchMock = vi.fn()
    vi.stubGlobal('fetch', globalFetchMock)

    const { fetchSingleClusterHealth } = await import('../sharedImpl.health')
    const result = await fetchSingleClusterHealth('prod')
    expect(result).toBeNull()
    // Backend fallback should NOT be called — isDemoToken check returns early
    expect(globalFetchMock).not.toHaveBeenCalled()
  })

  it('uses cluster-mode backend API when isClusterModeBackend is true', async () => {
    mockIsClusterMode = true
    const healthData = { cluster: 'prod', healthy: true, nodeCount: 4 }
    mockApiGet.mockResolvedValueOnce({ data: healthData })

    const { fetchSingleClusterHealth } = await import('../sharedImpl.health')
    const result = await fetchSingleClusterHealth('prod')
    expect(result).toEqual(healthData)
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringContaining('/api/mcp/clusters/')
    )
  })

  it('returns null when cluster-mode API returns no data', async () => {
    mockIsClusterMode = true
    mockApiGet.mockResolvedValueOnce({ data: null })

    const { fetchSingleClusterHealth } = await import('../sharedImpl.health')
    const result = await fetchSingleClusterHealth('prod')
    expect(result).toBeNull()
  })

  it('increments healthCheckFailures and returns null when cluster-mode API throws', async () => {
    mockIsClusterMode = true
    mockApiGet.mockRejectedValueOnce(new Error('API down'))

    const { fetchSingleClusterHealth, getHealthCheckFailures } = await import('../sharedImpl.health')
    const result = await fetchSingleClusterHealth('prod')
    expect(result).toBeNull()
    expect(getHealthCheckFailures()).toBe(1)
  })

  it('returns null and increments failures when fallback fetch returns non-OK', async () => {
    mockAgentFetch.mockResolvedValueOnce({ ok: false })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false }))

    const { fetchSingleClusterHealth, getHealthCheckFailures } = await import('../sharedImpl.health')
    const result = await fetchSingleClusterHealth('prod')
    expect(result).toBeNull()
    expect(getHealthCheckFailures()).toBeGreaterThan(0)
  })

  it('returns null when fallback fetch throws', async () => {
    mockAgentFetch.mockResolvedValueOnce({ ok: false })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('network')))

    const { fetchSingleClusterHealth } = await import('../sharedImpl.health')
    const result = await fetchSingleClusterHealth('prod')
    expect(result).toBeNull()
  })

  it('skips agent when isNetlifyDeployment is true', async () => {
    mockIsNetlifyDeployment = true
    const healthData = { cluster: 'prod', healthy: true, nodeCount: 1 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(healthData),
    }))

    const { fetchSingleClusterHealth } = await import('../sharedImpl.health')
    await fetchSingleClusterHealth('prod')
    expect(mockAgentFetch).not.toHaveBeenCalled()
  })
})

// ── detectClusterDistribution ──────────────────────────────────────────────

describe('detectClusterDistribution', () => {
  it('uses cluster-mode backend API when available', async () => {
    mockIsClusterMode = true
    mockApiGet.mockResolvedValueOnce({ data: { namespaces: ['default', 'kube-system', 'openshift'] } })
    mockDetectDistributionFromNamespaces.mockReturnValueOnce('openshift')

    const { detectClusterDistribution } = await import('../sharedImpl.health')
    const result = await detectClusterDistribution('prod')
    expect(result).toMatchObject({ distribution: 'openshift', namespaces: expect.arrayContaining(['default']) })
    expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('/api/mcp/namespaces'))
  })

  it('returns empty object when cluster-mode API throws', async () => {
    mockIsClusterMode = true
    mockApiGet.mockRejectedValueOnce(new Error('api error'))

    const { detectClusterDistribution } = await import('../sharedImpl.health')
    const result = await detectClusterDistribution('prod')
    expect(result).toEqual({})
  })

  it('uses kubectl exec when agent is available', async () => {
    mockIsAgentUnavailable = false
    mockKubectlExec.mockResolvedValueOnce({
      exitCode: 0,
      output: 'default kube-system',
    })
    mockDetectDistributionFromNamespaces.mockReturnValueOnce('vanilla')

    const { detectClusterDistribution } = await import('../sharedImpl.health')
    const result = await detectClusterDistribution('prod', 'prod-ctx')
    expect(result).toMatchObject({
      distribution: 'vanilla',
      namespaces: ['default', 'kube-system'],
    })
  })

  it('falls through when kubectl exec returns non-zero exit code', async () => {
    mockIsAgentUnavailable = false
    mockKubectlExec.mockResolvedValueOnce({ exitCode: 1, output: '' })
    // Fallback: pods fetch succeeds with distribution
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ pods: [{ namespace: 'default' }, { namespace: 'kube-system' }] }),
    }).mockResolvedValue({ ok: false }))
    mockDetectDistributionFromNamespaces.mockReturnValueOnce('k3s')

    const { detectClusterDistribution } = await import('../sharedImpl.health')
    const result = await detectClusterDistribution('prod')
    expect(result.distribution).toBe('k3s')
  })

  it('returns empty when isDemoToken is true', async () => {
    mockIsDemoToken = true

    const { detectClusterDistribution } = await import('../sharedImpl.health')
    const result = await detectClusterDistribution('prod')
    expect(result).toEqual({})
  })

  it('falls back through pods → events → deployments endpoints', async () => {
    mockIsAgentUnavailable = true

    const podsResp = { ok: true, json: () => Promise.resolve({ pods: [] }) }
    const eventsResp = { ok: true, json: () => Promise.resolve({ events: [] }) }
    const deploymentsResp = {
      ok: true,
      json: () => Promise.resolve({ deployments: [{ namespace: 'prod-ns' }] }),
    }
    const globalFetchMock = vi.fn()
      .mockResolvedValueOnce(podsResp)
      .mockResolvedValueOnce(eventsResp)
      .mockResolvedValueOnce(deploymentsResp)
    vi.stubGlobal('fetch', globalFetchMock)
    mockDetectDistributionFromNamespaces
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce('rancher')

    const { detectClusterDistribution } = await import('../sharedImpl.health')
    const result = await detectClusterDistribution('prod')
    expect(result.distribution).toBe('rancher')
    expect(globalFetchMock).toHaveBeenCalledTimes(3)
  })

  it('returns empty when all endpoints fail', async () => {
    mockIsAgentUnavailable = true
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))

    const { detectClusterDistribution } = await import('../sharedImpl.health')
    const result = await detectClusterDistribution('prod')
    expect(result).toEqual({})
  })
})
