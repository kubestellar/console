import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn() } }))
vi.mock('../../useLocalAgent', () => ({
  reportAgentDataSuccess: vi.fn(),
  isAgentUnavailable: () => false,
}))
vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: vi.fn().mockReturnValue(false),
}))
vi.mock('../../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))
vi.mock('../../../lib/modeTransition', () => ({
  registerCacheReset: vi.fn(),
  registerRefetch: vi.fn(),
}))
vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: vi.fn() },
}))
vi.mock('../../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'kc-auth-token',
}))
vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 120_000,
  MIN_REFRESH_INDICATOR_MS: 500,
  getEffectiveInterval: (base: number) => base,
  LOCAL_AGENT_URL: 'http://127.0.0.1:8585/mcp',
  agentFetch: vi.fn(),
  clusterCacheRef: { current: new Map() },
}))
vi.mock('../pollingManager', () => ({
  subscribePolling: vi.fn(),
}))
vi.mock('../../../lib/constants/network', () => ({
  MCP_HOOK_TIMEOUT_MS: 15_000,
  DEPLOY_ABORT_TIMEOUT_MS: 30_000,
  SERVICES_CACHE_TTL_MS: 300_000,
  LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
}))
vi.mock('../../useCachedData/demoData', () => ({
  getDemoIngresses: vi.fn().mockReturnValue([]),
}))

const mod = await import('../networking')
const { loadServicesCacheFromStorage, getDemoServices } = mod.__networkingTestables

beforeEach(() => {
  localStorage.clear()
})

// ── loadServicesCacheFromStorage ──

describe('loadServicesCacheFromStorage', () => {
  it('returns null when nothing stored', () => {
    expect(loadServicesCacheFromStorage('services:all')).toBeNull()
  })

  it('returns null for corrupted JSON', () => {
    localStorage.setItem('kubestellar-services-cache', 'invalid{{{')
    expect(loadServicesCacheFromStorage('services:all')).toBeNull()
  })

  it('returns null when key does not match', () => {
    localStorage.setItem('kubestellar-services-cache', JSON.stringify({
      data: [{ name: 'svc1' }],
      key: 'services:prod',
      timestamp: new Date().toISOString(),
    }))
    expect(loadServicesCacheFromStorage('services:staging')).toBeNull()
  })

  it('returns null for empty data array', () => {
    localStorage.setItem('kubestellar-services-cache', JSON.stringify({
      data: [],
      key: 'services:all',
      timestamp: new Date().toISOString(),
    }))
    expect(loadServicesCacheFromStorage('services:all')).toBeNull()
  })

  it('returns cached data when key matches and not stale', () => {
    const data = [{ name: 'kubernetes', namespace: 'default', cluster: 'c1', type: 'ClusterIP' }]
    localStorage.setItem('kubestellar-services-cache', JSON.stringify({
      data,
      key: 'services:all',
      timestamp: new Date().toISOString(),
    }))
    const result = loadServicesCacheFromStorage('services:all')
    expect(result).not.toBeNull()
    expect(result!.data).toEqual(data)
    expect(result!.timestamp).toBeInstanceOf(Date)
  })

  it('returns null for stale cache (beyond TTL)', () => {
    const staleTime = new Date(Date.now() - 600_000).toISOString()
    localStorage.setItem('kubestellar-services-cache', JSON.stringify({
      data: [{ name: 'svc' }],
      key: 'services:all',
      timestamp: staleTime,
    }))
    const result = loadServicesCacheFromStorage('services:all')
    expect(result).toBeNull()
    expect(localStorage.getItem('kubestellar-services-cache')).toBeNull()
  })

  it('uses current date when timestamp missing', () => {
    localStorage.setItem('kubestellar-services-cache', JSON.stringify({
      data: [{ name: 'svc' }],
      key: 'services:all',
    }))
    const result = loadServicesCacheFromStorage('services:all')
    expect(result).not.toBeNull()
    expect(result!.timestamp).toBeInstanceOf(Date)
  })
})

// ── getDemoServices ──

describe('getDemoServices', () => {
  it('returns an array of demo services', () => {
    const services = getDemoServices()
    expect(Array.isArray(services)).toBe(true)
    expect(services.length).toBeGreaterThan(5)
  })

  it('each service has required fields', () => {
    const services = getDemoServices()
    for (const svc of services) {
      expect(svc.name).toBeTruthy()
      expect(svc.namespace).toBeTruthy()
      expect(svc.cluster).toBeTruthy()
      expect(svc.type).toBeTruthy()
    }
  })

  it('includes LoadBalancer services with lbStatus', () => {
    const services = getDemoServices()
    const lbs = services.filter(s => s.type === 'LoadBalancer')
    expect(lbs.length).toBeGreaterThanOrEqual(2)
    const readyLb = lbs.find(s => s.lbStatus === 'Ready')
    expect(readyLb).toBeDefined()
    const provisioningLb = lbs.find(s => s.lbStatus === 'Provisioning')
    expect(provisioningLb).toBeDefined()
  })

  it('includes services with zero endpoints', () => {
    const services = getDemoServices()
    const zeroEndpoints = services.filter(s => s.endpoints === 0)
    expect(zeroEndpoints.length).toBeGreaterThanOrEqual(1)
  })

  it('includes ClusterIP, LoadBalancer, and NodePort types', () => {
    const services = getDemoServices()
    const types = new Set(services.map(s => s.type))
    expect(types.has('ClusterIP')).toBe(true)
    expect(types.has('LoadBalancer')).toBe(true)
    expect(types.has('NodePort')).toBe(true)
  })
})
