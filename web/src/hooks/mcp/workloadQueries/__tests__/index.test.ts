/**
 * Unit tests for workloadQueries/index.ts
 *
 * Tests the module-level cache-reset orchestration registered via
 * registerCacheReset('workloads', ...) and the __workloadsTestables export.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockRegisterCacheReset, mockResetPodsCache, mockResetDeploymentsCache, mockResetInfrastructureCaches } = vi.hoisted(() => ({
  mockRegisterCacheReset: vi.fn(),
  mockResetPodsCache: vi.fn(),
  mockResetDeploymentsCache: vi.fn(),
  mockResetInfrastructureCaches: vi.fn(),
}))

vi.mock('../../../../lib/modeTransition', () => ({
  registerCacheReset: mockRegisterCacheReset,
  registerRefetch: vi.fn(),
  unregisterCacheReset: vi.fn(),
}))

vi.mock('../pods', () => ({
  getDemoPods: vi.fn(() => []),
  getDemoPodIssues: vi.fn(() => []),
  getDemoAllPods: vi.fn(() => []),
  loadPodsCacheFromStorage: vi.fn(),
  savePodsCacheToStorage: vi.fn(),
  resetPodsCache: mockResetPodsCache,
  PODS_CACHE_KEY: 'kc-pods-cache',
  usePods: vi.fn(),
  useAllPods: vi.fn(),
  usePodIssues: vi.fn(),
  usePodLogs: vi.fn(),
  USE_POD_LOGS_DEFAULT_TAIL: 250,
}))

vi.mock('../deployments', () => ({
  getDemoDeploymentIssues: vi.fn(() => []),
  getDemoDeployments: vi.fn(() => []),
  resetDeploymentsCache: mockResetDeploymentsCache,
  useDeploymentIssues: vi.fn(),
  useDeployments: vi.fn(),
}))

vi.mock('../infrastructure', () => ({
  __resetInfrastructureCaches: mockResetInfrastructureCaches,
  useJobs: vi.fn(),
  useHPAs: vi.fn(),
  useReplicaSets: vi.fn(),
  useStatefulSets: vi.fn(),
  useDaemonSets: vi.fn(),
  useCronJobs: vi.fn(),
}))

vi.mock('../shared', () => ({
  fetchInClusterCollection: vi.fn(),
  PodClusterError: undefined,
}))

vi.mock('../../workloadSubscriptions', () => ({
  subscribeWorkloadsCache: vi.fn(() => vi.fn()),
  setWorkloadsSharedState: vi.fn(),
  notifyWorkloadsSubscribers: vi.fn(),
}))

vi.mock('../../pollingManager', () => ({
  subscribePolling: vi.fn(() => vi.fn()),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('workloadQueries/index.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers a cache reset handler for "workloads" on module load', async () => {
    await import('../index')
    expect(mockRegisterCacheReset).toHaveBeenCalledWith('workloads', expect.any(Function))
  })

  it('cache reset handler calls all module reset functions', async () => {
    await import('../index')
    const resetHandler = mockRegisterCacheReset.mock.calls[0]?.[1]
    expect(resetHandler).toBeDefined()

    // Execute the registered reset handler
    resetHandler()

    expect(mockResetPodsCache).toHaveBeenCalled()
    expect(mockResetDeploymentsCache).toHaveBeenCalled()
    expect(mockResetInfrastructureCaches).toHaveBeenCalled()
  })

  it('exports __workloadsTestables with expected demo functions', async () => {
    const mod = await import('../index')
    expect(mod.__workloadsTestables).toBeDefined()
    expect(mod.__workloadsTestables).toHaveProperty('getDemoPods')
    expect(mod.__workloadsTestables).toHaveProperty('getDemoPodIssues')
    expect(mod.__workloadsTestables).toHaveProperty('getDemoDeploymentIssues')
    expect(mod.__workloadsTestables).toHaveProperty('getDemoDeployments')
    expect(mod.__workloadsTestables).toHaveProperty('getDemoAllPods')
    expect(mod.__workloadsTestables).toHaveProperty('loadPodsCacheFromStorage')
    expect(mod.__workloadsTestables).toHaveProperty('savePodsCacheToStorage')
    expect(mod.__workloadsTestables).toHaveProperty('PODS_CACHE_KEY')
  })

  it('re-exports all hooks from sub-modules', async () => {
    const mod = await import('../index')
    // Verify key hook exports exist
    expect(mod).toHaveProperty('usePods')
    expect(mod).toHaveProperty('useAllPods')
    expect(mod).toHaveProperty('usePodIssues')
    expect(mod).toHaveProperty('useDeploymentIssues')
    expect(mod).toHaveProperty('useDeployments')
    expect(mod).toHaveProperty('useJobs')
    expect(mod).toHaveProperty('useHPAs')
    expect(mod).toHaveProperty('useReplicaSets')
    expect(mod).toHaveProperty('useStatefulSets')
    expect(mod).toHaveProperty('useDaemonSets')
    expect(mod).toHaveProperty('useCronJobs')
    expect(mod).toHaveProperty('usePodLogs')
  })

  it('re-exports fetchInClusterCollection from shared', async () => {
    const mod = await import('../index')
    expect(mod).toHaveProperty('fetchInClusterCollection')
  })
})
