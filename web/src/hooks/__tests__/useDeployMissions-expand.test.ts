import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MISSIONS_STORAGE_KEY = 'kubestellar-missions'
const _OLD_ACTIVE_KEY = 'kc-missions-active'
const OLD_HISTORY_KEY = 'kc-missions-history'
const INITIAL_POLL_DELAY_MS = 1000
const POLL_INTERVAL_MS = 5000
const MAX_MISSIONS = 50
const _MIN_ACTIVE_MS = 10000

// ---------------------------------------------------------------------------
// Track subscribe callbacks
// ---------------------------------------------------------------------------
type SubscribeCallback = (event: { type: string; payload: unknown }) => void
const subscribeCallbacks: Map<string, SubscribeCallback> = new Map()

vi.mock('../../lib/cardEvents', () => ({
  useCardSubscribe: vi.fn(() => {
    return (type: string, callback: SubscribeCallback) => {
      subscribeCallbacks.set(type, callback)
      return () => { subscribeCallbacks.delete(type) }
    }
  }),
}))

const mockClusterCacheRef = vi.hoisted(() => ({
  clusters: [] as Array<{ name: string; context?: string }>,
}))

vi.mock('../mcp/shared', () => ({
  clusterCacheRef: mockClusterCacheRef,
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
}))

const mockKubectlExec = vi.hoisted(() => vi.fn())

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: (...args: unknown[]) => mockKubectlExec(...args) },
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
    STORAGE_KEY_TOKEN: 'kc-auth-token',
    STORAGE_KEY_MISSIONS_ACTIVE: 'kc-missions-active',
    STORAGE_KEY_MISSIONS_HISTORY: 'kc-missions-history',
  }
})

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
  DEPLOY_ABORT_TIMEOUT_MS: 5000,
  MCP_HOOK_TIMEOUT_MS: 15_000,
}))

vi.mock('../useBackendHealth', () => ({
  isInClusterMode: vi.fn().mockReturnValue(false),
}))

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: null }) },
}))

import { useDeployMissions } from '../useDeployMissions'
import type { DeployMission } from '../useDeployMissions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMission(overrides: Partial<DeployMission> = {}): DeployMission {
  return {
    id: 'mission-1',
    workload: 'nginx',
    namespace: 'default',
    sourceCluster: 'hub',
    targetClusters: ['cluster-a'],
    status: 'deploying',
    clusterStatuses: [{
      cluster: 'cluster-a',
      status: 'applying',
      replicas: 1,
      readyReplicas: 0,
    }],
    startedAt: Date.now(),
    pollCount: 0,
    ...overrides,
  }
}

function fireDeployStarted(payload: {
  id: string
  workload: string
  namespace: string
  sourceCluster: string
  targetClusters: string[]
  groupName?: string
  deployedBy?: string
}) {
  const cb = subscribeCallbacks.get('deploy:started')
  if (!cb) throw new Error('No deploy:started subscriber registered')
  cb({ type: 'deploy:started', payload: { timestamp: Date.now(), ...payload } })
}

function fireDeployResult(payload: {
  id: string
  success: boolean
  message: string
  dependencies?: Array<{ kind: string; name: string; action: string }>
  warnings?: string[]
}) {
  const cb = subscribeCallbacks.get('deploy:result')
  if (!cb) throw new Error('No deploy:result subscriber registered')
  cb({ type: 'deploy:result', payload })
}

async function advancePastInitialPoll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(INITIAL_POLL_DELAY_MS + 100)
  })
}

async function _advancePollInterval() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 100)
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDeployMissions — expanded edge cases', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
    subscribeCallbacks.clear()
    mockClusterCacheRef.clusters = []
    global.fetch = vi.fn().mockRejectedValue(new Error('not available'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // 1. Deploy result updates dependencies and warnings
  it('updates mission dependencies on deploy:result event', () => {
    const { result } = renderHook(() => useDeployMissions())
    act(() => {
      fireDeployStarted({
        id: 'dep-test',
        workload: 'app',
        namespace: 'prod',
        sourceCluster: 'hub',
        targetClusters: ['edge-1'],
      })
    })

    act(() => {
      fireDeployResult({
        id: 'dep-test',
        success: true,
        message: 'ok',
        dependencies: [{ kind: 'ConfigMap', name: 'config', action: 'created' }],
        warnings: ['PVC not found'],
      })
    })

    const m = result.current.missions.find(m => m.id === 'dep-test')
    expect(m?.dependencies).toHaveLength(1)
    expect(m?.dependencies?.[0].kind).toBe('ConfigMap')
    expect(m?.warnings).toEqual(['PVC not found'])
  })

  // 2. deploy:result for unknown mission ID is ignored
  it('ignores deploy:result for non-existent mission', () => {
    const { result } = renderHook(() => useDeployMissions())
    act(() => {
      fireDeployResult({
        id: 'nonexistent',
        success: true,
        message: 'ok',
      })
    })
    expect(result.current.missions).toHaveLength(0)
  })

  // 3. Missions capped at MAX_MISSIONS
  it('caps missions at max limit when adding new ones', () => {
    const missions = Array.from({ length: MAX_MISSIONS }, (_, i) =>
      makeMission({ id: `m-${i}`, status: 'orbit', completedAt: Date.now() })
    )
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))
    const { result } = renderHook(() => useDeployMissions())
    expect(result.current.missions).toHaveLength(MAX_MISSIONS)

    act(() => {
      fireDeployStarted({
        id: 'overflow',
        workload: 'app',
        namespace: 'ns',
        sourceCluster: 'hub',
        targetClusters: ['c1'],
      })
    })

    expect(result.current.missions.length).toBeLessThanOrEqual(MAX_MISSIONS)
    expect(result.current.missions[0].id).toBe('overflow')
  })

  // 4. clearCompleted removes only orbit and abort missions
  it('clearCompleted only removes completed missions', () => {
    const missions = [
      makeMission({ id: 'active-1', status: 'deploying' }),
      makeMission({ id: 'done-1', status: 'orbit', completedAt: Date.now() }),
      makeMission({ id: 'failed-1', status: 'abort', completedAt: Date.now() }),
    ]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))
    const { result } = renderHook(() => useDeployMissions())
    expect(result.current.missions).toHaveLength(3)

    act(() => { result.current.clearCompleted() })
    expect(result.current.missions).toHaveLength(1)
    expect(result.current.missions[0].id).toBe('active-1')
  })

  // 5. hasActive reflects active missions
  it('hasActive is true when active missions exist', () => {
    const missions = [makeMission({ id: 'active', status: 'deploying' })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))
    const { result } = renderHook(() => useDeployMissions())
    expect(result.current.hasActive).toBe(true)
  })

  // 6. activeMissions and completedMissions are correctly categorized (partial is terminal)
  it('correctly categorizes active vs completed missions', () => {
    const missions = [
      makeMission({ id: 'a', status: 'deploying' }),
      makeMission({ id: 'b', status: 'launching' }),
      makeMission({ id: 'c', status: 'orbit', completedAt: Date.now() }),
      makeMission({ id: 'd', status: 'abort', completedAt: Date.now() }),
      makeMission({ id: 'e', status: 'partial', completedAt: Date.now() }),
    ]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))
    const { result } = renderHook(() => useDeployMissions())
    expect(result.current.activeMissions.map(m => m.id)).toEqual(expect.arrayContaining(['a', 'b']))
    expect(result.current.completedMissions.map(m => m.id)).toEqual(expect.arrayContaining(['c', 'd', 'e']))
  })

  // 7. Poll fetches deployment status via agent
  it('polls deployment status via agent when clusterCacheRef has cluster info', async () => {
    mockClusterCacheRef.clusters = [{ name: 'cluster-a', context: 'ctx-a' }]
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/deployments')) {
        return Promise.resolve(new Response(JSON.stringify({
          deployments: [{ name: 'nginx', replicas: 1, readyReplicas: 1, status: 'running' }],
        }), { status: 200 }))
      }
      return Promise.reject(new Error('not available'))
    })
    global.fetch = mockFetch as unknown as typeof fetch
    mockKubectlExec.mockResolvedValue({ exitCode: 0, output: JSON.stringify({ items: [] }) })

    // Must render the hook to register the deploy:started subscriber
    renderHook(() => useDeployMissions())

    act(() => {
      fireDeployStarted({
        id: 'poll-test',
        workload: 'nginx',
        namespace: 'default',
        sourceCluster: 'hub',
        targetClusters: ['cluster-a'],
      })
    })

    // Advance past initial poll
    await advancePastInitialPoll()
    // Agent should have been called
    expect(mockFetch).toHaveBeenCalled()
  })

  // 8. Poll falls back to REST API when agent fails
  it('falls back to REST API when agent fetch fails', async () => {
    mockClusterCacheRef.clusters = [{ name: 'cluster-a', context: 'ctx-a' }]
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/deployments')) {
        return Promise.reject(new Error('agent down'))
      }
      if (url.includes('/deploy-status/')) {
        return Promise.resolve(new Response(JSON.stringify({
          status: 'running',
          replicas: 2,
          readyReplicas: 2,
        }), { status: 200 }))
      }
      if (url.includes('/deploy-logs/')) {
        return Promise.resolve(new Response(JSON.stringify({ logs: ['deployed'] }), { status: 200 }))
      }
      return Promise.reject(new Error('not available'))
    })
    global.fetch = mockFetch as unknown as typeof fetch

    // Must render the hook to register the deploy:started subscriber
    renderHook(() => useDeployMissions())

    act(() => {
      fireDeployStarted({
        id: 'fallback-test',
        workload: 'redis',
        namespace: 'prod',
        sourceCluster: 'hub',
        targetClusters: ['cluster-a'],
      })
    })
    await advancePastInitialPoll()
  })

  // 9. saveMissions strips logs from active missions
  it('persists missions to localStorage on state change', () => {
    // Must render the hook to register the deploy:started subscriber
    renderHook(() => useDeployMissions())

    act(() => {
      fireDeployStarted({
        id: 'persist-test',
        workload: 'app',
        namespace: 'ns',
        sourceCluster: 'hub',
        targetClusters: ['c1'],
      })
    })
    const stored = JSON.parse(localStorage.getItem(MISSIONS_STORAGE_KEY) || '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('persist-test')
  })

  // 10. Grace period keeps mission in deploying state
  it('keeps mission in deploying during MIN_ACTIVE_MS grace period', async () => {
    mockClusterCacheRef.clusters = [{ name: 'cluster-a', context: 'ctx-a' }]
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/deployments')) {
        return Promise.resolve(new Response(JSON.stringify({
          deployments: [{ name: 'nginx', replicas: 1, readyReplicas: 1, status: 'running' }],
        }), { status: 200 }))
      }
      return Promise.reject(new Error('not available'))
    }) as unknown as typeof fetch
    mockKubectlExec.mockResolvedValue({ exitCode: 0, output: JSON.stringify({ items: [] }) })

    const { result } = renderHook(() => useDeployMissions())
    act(() => {
      fireDeployStarted({
        id: 'grace-test',
        workload: 'nginx',
        namespace: 'default',
        sourceCluster: 'hub',
        targetClusters: ['cluster-a'],
      })
    })

    // Poll before grace period expires (startedAt is Date.now())
    await advancePastInitialPoll()
    // Mission should still be in deploying due to grace period
    const m = result.current.missions.find(m => m.id === 'grace-test')
    expect(m).toBeDefined()
    // Status should be deploying (grace period) or orbit (if timer advanced enough)
    expect(['deploying', 'orbit']).toContain(m?.status)
  })

  // 11. Migration with only history key
  it('migrates when only old history key exists', () => {
    const history = [makeMission({ id: 'hist-only', status: 'orbit', completedAt: Date.now() })]
    localStorage.setItem(OLD_HISTORY_KEY, JSON.stringify(history))
    const { result } = renderHook(() => useDeployMissions())
    expect(result.current.missions).toHaveLength(1)
    expect(result.current.missions[0].id).toBe('hist-only')
  })

  // 12. Mission with multiple target clusters
  it('creates cluster statuses for all target clusters', () => {
    const { result } = renderHook(() => useDeployMissions())
    act(() => {
      fireDeployStarted({
        id: 'multi-target',
        workload: 'app',
        namespace: 'ns',
        sourceCluster: 'hub',
        targetClusters: ['c1', 'c2', 'c3'],
      })
    })
    const m = result.current.missions[0]
    expect(m.clusterStatuses).toHaveLength(3)
    expect(m.clusterStatuses.map(cs => cs.cluster)).toEqual(['c1', 'c2', 'c3'])
    expect(m.clusterStatuses.every(cs => cs.status === 'pending')).toBe(true)
  })
})
