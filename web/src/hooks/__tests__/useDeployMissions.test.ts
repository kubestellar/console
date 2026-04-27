import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Constants — no magic numbers
// ---------------------------------------------------------------------------
const MISSIONS_STORAGE_KEY = 'kubestellar-missions'
const OLD_ACTIVE_KEY = 'kc-missions-active'
const OLD_HISTORY_KEY = 'kc-missions-history'
const INITIAL_POLL_DELAY_MS = 1000
const POLL_INTERVAL_MS = 5000
const MAX_MISSIONS = 50
const CACHE_TTL_MS = 5 * 60 * 1000
const MIN_ACTIVE_MS = 10000

// ---------------------------------------------------------------------------
// Track subscribe callbacks so tests can fire card events
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

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    FETCH_DEFAULT_TIMEOUT_MS: 10000,
    DEPLOY_ABORT_TIMEOUT_MS: 5000,
  }
})

import { useDeployMissions } from '../useDeployMissions'
import type { DeployMission } from '../useDeployMissions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mission object with sensible defaults */
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

/** Fire a deploy:started card event */
function fireDeployStarted(payload: {
  id: string
  workload: string
  namespace: string
  sourceCluster: string
  targetClusters: string[]
  groupName?: string
  deployedBy?: string
  timestamp?: number
}) {
  const cb = subscribeCallbacks.get('deploy:started')
  if (!cb) throw new Error('No deploy:started subscriber registered')
  cb({ type: 'deploy:started', payload: { timestamp: Date.now(), ...payload } })
}

/** Fire a deploy:result card event */
function fireDeployResult(payload: {
  id: string
  success: boolean
  message: string
  deployedTo?: string[]
  failedClusters?: string[]
  dependencies?: Array<{ kind: string; name: string; action: 'created' | 'updated' | 'skipped' | 'failed' }>
  warnings?: string[]
}) {
  const cb = subscribeCallbacks.get('deploy:result')
  if (!cb) throw new Error('No deploy:result subscriber registered')
  cb({ type: 'deploy:result', payload })
}

/**
 * Advance fake timers past the initial poll delay and flush the async poll.
 * Uses vi.advanceTimersByTimeAsync which processes microtasks between ticks,
 * allowing async poll() to resolve its Promises.
 */
async function advancePastInitialPoll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(INITIAL_POLL_DELAY_MS + 100)
  })
}

/** Advance past one additional poll interval */
async function advancePollInterval() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 100)
  })
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('useDeployMissions', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
    subscribeCallbacks.clear()
    mockClusterCacheRef.clusters = []
    // Default: fetch rejects (agent not available)
    global.fetch = vi.fn().mockRejectedValue(new Error('not available'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // =========================================================================
  // 1. Initial state
  // =========================================================================
  it('starts with empty missions when localStorage is empty', () => {
    const { result } = renderHook(() => useDeployMissions())
    expect(result.current.missions).toEqual([])
    expect(result.current.activeMissions).toEqual([])
    expect(result.current.completedMissions).toEqual([])
    expect(result.current.hasActive).toBe(false)
    expect(typeof result.current.clearCompleted).toBe('function')
  })

  // =========================================================================
  // 2. Load from localStorage (primary key)
  // =========================================================================
  it('loads missions from the primary localStorage key', () => {
    const missions = [makeMission({ id: 'stored-1', status: 'orbit', completedAt: Date.now() })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))
    const { result } = renderHook(() => useDeployMissions())
    expect(result.current.missions).toHaveLength(1)
    expect(result.current.missions[0].id).toBe('stored-1')
    expect(result.current.completedMissions).toHaveLength(1)
  })

  // =========================================================================
  // 3. Migrate from old split keys
  // =========================================================================
  it('migrates missions from old split localStorage keys', () => {
    const active = [makeMission({ id: 'old-active', status: 'deploying' })]
    const history = [makeMission({ id: 'old-history', status: 'orbit', completedAt: Date.now() })]
    localStorage.setItem(OLD_ACTIVE_KEY, JSON.stringify(active))
    localStorage.setItem(OLD_HISTORY_KEY, JSON.stringify(history))

    const { result } = renderHook(() => useDeployMissions())
    expect(result.current.missions).toHaveLength(2)
    expect(localStorage.getItem(OLD_ACTIVE_KEY)).toBeNull()
    expect(localStorage.getItem(OLD_HISTORY_KEY)).toBeNull()
    expect(localStorage.getItem(MISSIONS_STORAGE_KEY)).not.toBeNull()
  })

  // =========================================================================
  // 4. Migration with only active (no history)
  // =========================================================================
  it('migrates when only old active key exists', () => {
    const active = [makeMission({ id: 'active-only', status: 'deploying' })]
    localStorage.setItem(OLD_ACTIVE_KEY, JSON.stringify(active))

    const { result } = renderHook(() => useDeployMissions())
    expect(result.current.missions).toHaveLength(1)
    expect(result.current.missions[0].id).toBe('active-only')
  })

  // =========================================================================
  // 5. Handles corrupt localStorage gracefully
  // =========================================================================
  it('returns empty missions when localStorage contains invalid JSON', () => {
    localStorage.setItem(MISSIONS_STORAGE_KEY, 'not-valid-json{{{')
    const { result } = renderHook(() => useDeployMissions())
    expect(result.current.missions).toEqual([])
  })

  // =========================================================================
  // 6. deploy:started creates a new mission
  // =========================================================================
  it('creates a mission when deploy:started event fires', () => {
    const { result } = renderHook(() => useDeployMissions())
    expect(result.current.missions).toHaveLength(0)

    act(() => {
      fireDeployStarted({
        id: 'new-mission',
        workload: 'redis',
        namespace: 'prod',
        sourceCluster: 'hub',
        targetClusters: ['edge-1', 'edge-2'],
        groupName: 'my-group',
        deployedBy: 'admin',
      })
    })

    expect(result.current.missions).toHaveLength(1)
    const m = result.current.missions[0]
    expect(m.id).toBe('new-mission')
    expect(m.workload).toBe('redis')
    expect(m.namespace).toBe('prod')
    expect(m.sourceCluster).toBe('hub')
    expect(m.targetClusters).toEqual(['edge-1', 'edge-2'])
    expect(m.groupName).toBe('my-group')
    expect(m.deployedBy).toBe('admin')
    expect(m.status).toBe('launching')
    expect(m.clusterStatuses).toHaveLength(2)
    expect(m.clusterStatuses[0]).toEqual({
      cluster: 'edge-1', status: 'pending', replicas: 0, readyReplicas: 0,
    })
    expect(m.clusterStatuses[1]).toEqual({
      cluster: 'edge-2', status: 'pending', replicas: 0, readyReplicas: 0,
    })
    expect(m.pollCount).toBe(0)
    expect(m.startedAt).toBeGreaterThan(0)
    expect(result.current.hasActive).toBe(true)
  })

  // =========================================================================
  // 7. deploy:result attaches dependencies and warnings
  // =========================================================================
  it('attaches dependencies and warnings when deploy:result fires', () => {
    const { result } = renderHook(() => useDeployMissions())

    act(() => {
      fireDeployStarted({
        id: 'dep-mission', workload: 'api', namespace: 'ns',
        sourceCluster: 'hub', targetClusters: ['c1'],
      })
    })

    act(() => {
      fireDeployResult({
        id: 'dep-mission', success: true, message: 'Deployed',
        dependencies: [
          { kind: 'ConfigMap', name: 'config', action: 'created' },
          { kind: 'Secret', name: 'creds', action: 'updated' },
        ],
        warnings: ['Deprecated API version'],
      })
    })

    const m = result.current.missions[0]
    expect(m.dependencies).toHaveLength(2)
    expect(m.dependencies![0]).toEqual({ kind: 'ConfigMap', name: 'config', action: 'created' })
    expect(m.warnings).toEqual(['Deprecated API version'])
  })

  // =========================================================================
  // 8. deploy:result ignores unmatched mission IDs
  // =========================================================================
  it('does not modify missions for unmatched deploy:result IDs', () => {
    const { result } = renderHook(() => useDeployMissions())

    act(() => {
      fireDeployStarted({
        id: 'match-me', workload: 'app', namespace: 'ns',
        sourceCluster: 'hub', targetClusters: ['c1'],
      })
    })

    act(() => {
      fireDeployResult({ id: 'no-match', success: false, message: 'Failed' })
    })

    expect(result.current.missions[0].dependencies).toBeUndefined()
    expect(result.current.missions[0].warnings).toBeUndefined()
  })

  // =========================================================================
  // 9. MAX_MISSIONS limit enforced on new missions
  // =========================================================================
  it('limits missions to MAX_MISSIONS when adding new ones', () => {
    const existing = Array.from({ length: MAX_MISSIONS }, (_, i) =>
      makeMission({ id: `m-${i}`, status: 'orbit', completedAt: Date.now() })
    )
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(existing))

    const { result } = renderHook(() => useDeployMissions())
    expect(result.current.missions).toHaveLength(MAX_MISSIONS)

    act(() => {
      fireDeployStarted({
        id: 'overflow', workload: 'overflow-app', namespace: 'ns',
        sourceCluster: 'hub', targetClusters: ['c1'],
      })
    })

    expect(result.current.missions).toHaveLength(MAX_MISSIONS)
    expect(result.current.missions[0].id).toBe('overflow')
  })

  // =========================================================================
  // 10. clearCompleted removes orbit, abort, and partial missions
  // =========================================================================
  it('clearCompleted removes only completed missions (orbit, abort, partial)', () => {
    const missions = [
      makeMission({ id: 'active-1', status: 'deploying' }),
      makeMission({ id: 'done-1', status: 'orbit', completedAt: Date.now() }),
      makeMission({ id: 'failed-1', status: 'abort', completedAt: Date.now() }),
      makeMission({ id: 'partial-1', status: 'partial', completedAt: Date.now() }),
    ]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    const { result } = renderHook(() => useDeployMissions())
    expect(result.current.completedMissions).toHaveLength(3)

    act(() => { result.current.clearCompleted() })

    expect(result.current.missions).toHaveLength(1)
    expect(result.current.completedMissions).toHaveLength(0)
    expect(result.current.missions.map(m => m.id)).toEqual(['active-1'])
  })

  // =========================================================================
  // 11. activeMissions and completedMissions filtering (partial is terminal)
  // =========================================================================
  it('correctly separates active and completed missions', () => {
    const missions = [
      makeMission({ id: 'launch', status: 'launching' }),
      makeMission({ id: 'deploy', status: 'deploying' }),
      makeMission({ id: 'partial', status: 'partial', completedAt: Date.now() }),
      makeMission({ id: 'orbit', status: 'orbit', completedAt: Date.now() }),
      makeMission({ id: 'abort', status: 'abort', completedAt: Date.now() }),
    ]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    const { result } = renderHook(() => useDeployMissions())
    expect(result.current.activeMissions).toHaveLength(2)
    expect(result.current.completedMissions).toHaveLength(3)
    expect(result.current.hasActive).toBe(true)
  })

  // =========================================================================
  // 12. Persists missions to localStorage on state change
  // =========================================================================
  it('persists missions to localStorage when state changes', () => {
    renderHook(() => useDeployMissions())

    act(() => {
      fireDeployStarted({
        id: 'persist-test', workload: 'app', namespace: 'ns',
        sourceCluster: 'hub', targetClusters: ['c1'],
      })
    })

    const stored = JSON.parse(localStorage.getItem(MISSIONS_STORAGE_KEY) || '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('persist-test')
  })

  // =========================================================================
  // 13. saveMissions strips logs for non-terminal missions
  // =========================================================================
  it('strips logs for active missions but keeps logs for terminal missions when persisting', () => {
    const missions = [
      makeMission({
        id: 'active-logs', status: 'deploying',
        clusterStatuses: [{
          cluster: 'c1', status: 'applying', replicas: 1, readyReplicas: 0,
          logs: ['log line 1', 'log line 2'],
        }],
      }),
      makeMission({
        id: 'done-logs', status: 'orbit', completedAt: Date.now(),
        clusterStatuses: [{
          cluster: 'c2', status: 'running', replicas: 1, readyReplicas: 1,
          logs: ['success log'],
        }],
      }),
    ]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    renderHook(() => useDeployMissions())

    const stored = JSON.parse(localStorage.getItem(MISSIONS_STORAGE_KEY) || '[]')
    const activeMission = stored.find((m: DeployMission) => m.id === 'active-logs')
    expect(activeMission.clusterStatuses[0].logs).toBeUndefined()
    const doneMission = stored.find((m: DeployMission) => m.id === 'done-logs')
    expect(doneMission.clusterStatuses[0].logs).toEqual(['success log'])
  })

  // =========================================================================
  // 14. Polling via agent — all clusters running => orbit
  // =========================================================================
  it('polls agent and transitions to orbit when all clusters running', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'poll-orbit', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = [{ name: 'c1', context: 'ctx-c1' }]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        deployments: [{ name: 'nginx', replicas: 2, readyReplicas: 2 }],
      }),
    })
    mockKubectlExec.mockResolvedValue({ exitCode: 1, output: '' })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(result.current.missions[0].status).toBe('orbit')
    expect(result.current.missions[0].clusterStatuses[0].status).toBe('running')
    expect(result.current.missions[0].clusterStatuses[0].replicas).toBe(2)
    expect(result.current.missions[0].clusterStatuses[0].readyReplicas).toBe(2)
    expect(result.current.missions[0].completedAt).toBeDefined()
  })

  // =========================================================================
  // 15. Polling — failed cluster with no running => abort
  // =========================================================================
  it('transitions to abort when all clusters fail (past grace period)', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'poll-abort', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = [{ name: 'c1', context: 'ctx-c1' }]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        deployments: [{ name: 'nginx', replicas: 1, readyReplicas: 0, status: 'failed' }],
      }),
    })
    mockKubectlExec.mockResolvedValue({ exitCode: 1, output: '' })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(result.current.missions[0].status).toBe('abort')
    expect(result.current.missions[0].clusterStatuses[0].status).toBe('failed')
  })

  // =========================================================================
  // 16. Polling — partial: some running, some failed
  // =========================================================================
  it('transitions to partial when some clusters run and some fail', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'poll-partial', status: 'deploying', startedAt,
      targetClusters: ['c1', 'c2'],
      clusterStatuses: [
        { cluster: 'c1', status: 'pending', replicas: 0, readyReplicas: 0 },
        { cluster: 'c2', status: 'pending', replicas: 0, readyReplicas: 0 },
      ],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = [
      { name: 'c1', context: 'ctx-c1' },
      { name: 'c2', context: 'ctx-c2' },
    ]

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('cluster=ctx-c1')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            deployments: [{ name: 'nginx', replicas: 1, readyReplicas: 1 }],
          }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          deployments: [{ name: 'nginx', replicas: 1, readyReplicas: 0, status: 'failed' }],
        }),
      })
    })
    mockKubectlExec.mockResolvedValue({ exitCode: 1, output: '' })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(result.current.missions[0].status).toBe('partial')
  })

  // =========================================================================
  // 17. Grace period: prevents premature orbit/abort within MIN_ACTIVE_MS
  // =========================================================================
  it('keeps deploying status during grace period even if all clusters are running', async () => {
    const startedAt = Date.now() // recent — within grace period
    const missions = [makeMission({
      id: 'grace-test', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = [{ name: 'c1', context: 'ctx-c1' }]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        deployments: [{ name: 'nginx', replicas: 1, readyReplicas: 1 }],
      }),
    })
    mockKubectlExec.mockResolvedValue({ exitCode: 1, output: '' })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    // Should stay deploying during grace period, cluster status is running
    expect(result.current.missions[0].status).toBe('deploying')
    expect(result.current.missions[0].clusterStatuses[0].status).toBe('running')
  })

  // =========================================================================
  // 18. Agent fallback to REST API when agent is unavailable
  // =========================================================================
  it('falls back to REST API when agent fetch fails', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'rest-fallback', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    // No cluster in cache => agent path skipped entirely
    mockClusterCacheRef.clusters = []

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/workloads/deploy-status/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'Running', replicas: 3, readyReplicas: 3,
          }),
        })
      }
      if (typeof url === 'string' && url.includes('/api/workloads/deploy-logs/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ logs: ['event: pod started'] }),
        })
      }
      return Promise.reject(new Error('unexpected URL'))
    })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(result.current.missions[0].status).toBe('orbit')
    expect(result.current.missions[0].clusterStatuses[0].replicas).toBe(3)
    expect(result.current.missions[0].clusterStatuses[0].logs).toEqual(['event: pod started'])
  })

  // =========================================================================
  // 19. REST API returns failed status
  // =========================================================================
  it('handles REST API returning Failed status', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'rest-failed', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = []

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/workloads/deploy-status/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'Failed', replicas: 1, readyReplicas: 0,
          }),
        })
      }
      return Promise.reject(new Error('unexpected'))
    })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(result.current.missions[0].status).toBe('abort')
    expect(result.current.missions[0].clusterStatuses[0].status).toBe('failed')
  })

  // =========================================================================
  // 20. REST API returns not-ok response => pending
  // =========================================================================
  it('treats REST API non-ok response as pending', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'rest-not-ok', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = []
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(result.current.missions[0].clusterStatuses[0].status).toBe('pending')
    expect(result.current.missions[0].status).toBe('deploying')
  })

  // =========================================================================
  // 21. REST API fetch throws => pending cluster status
  // =========================================================================
  it('treats REST API fetch exception as pending', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'rest-throw', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = []
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(result.current.missions[0].clusterStatuses[0].status).toBe('pending')
  })

  // =========================================================================
  // 22. Agent: workload not found yet => pending
  // =========================================================================
  it('returns pending when agent finds no matching workload', async () => {
    const missions = [makeMission({
      id: 'no-match', status: 'deploying', startedAt: Date.now(),
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = [{ name: 'c1', context: 'ctx-c1' }]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        deployments: [{ name: 'other-app', replicas: 1, readyReplicas: 1 }],
      }),
    })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(result.current.missions[0].clusterStatuses[0].status).toBe('pending')
  })

  // =========================================================================
  // 23. Agent: fetch throws => falls through to REST API
  // =========================================================================
  it('falls back to REST when agent fetch throws', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'agent-throw', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = [{ name: 'c1', context: 'ctx-c1' }]

    let callCount = 0
    global.fetch = vi.fn().mockImplementation((url: string) => {
      callCount++
      if (callCount === 1) return Promise.reject(new Error('Agent down'))
      if (typeof url === 'string' && url.includes('/api/workloads/deploy-status/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'Running', replicas: 1, readyReplicas: 1,
          }),
        })
      }
      return Promise.reject(new Error('unexpected'))
    })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(result.current.missions[0].status).toBe('orbit')
  })

  // =========================================================================
  // 24. Completed mission past CACHE_TTL with logs + exhausted recovery budget
  //     => skips polling. #6415: up to LOG_RECOVERY_EXTRA_POLLS (3) grace
  //     polls are allowed AFTER logs first arrive so late-emitted error
  //     lines (e.g. CrashLoopBackOff reasons) can be captured. Once the
  //     budget is exhausted, polling stops for good.
  // =========================================================================
  it('skips polling for completed missions past TTL after log recovery budget exhausted', async () => {
    const completedAt = Date.now() - CACHE_TTL_MS - 1
    const missions = [makeMission({
      id: 'ttl-skip', status: 'orbit',
      startedAt: completedAt - MIN_ACTIVE_MS, completedAt,
      targetClusters: ['c1'],
      clusterStatuses: [{
        cluster: 'c1', status: 'running', replicas: 1, readyReplicas: 1,
        logs: ['existing log'],
      }],
      // Simulate 3 prior grace-window polls (the cap defined by
      // LOG_RECOVERY_EXTRA_POLLS in useDeployMissions.ts).
      logRecoveryPolls: 3,
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    const fetchSpy = vi.fn()
    global.fetch = fetchSpy

    renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // =========================================================================
  // 24b. Completed mission past CACHE_TTL with logs but recovery budget
  //      NOT yet exhausted => continues polling (#6415).
  // =========================================================================
  it('continues polling completed missions within the log-recovery grace window', async () => {
    const completedAt = Date.now() - CACHE_TTL_MS - 1
    const missions = [makeMission({
      id: 'ttl-grace', status: 'orbit',
      startedAt: completedAt - MIN_ACTIVE_MS, completedAt,
      targetClusters: ['c1'],
      clusterStatuses: [{
        cluster: 'c1', status: 'running', replicas: 1, readyReplicas: 1,
        logs: ['existing log'],
      }],
      // logRecoveryPolls === 0 → first grace poll is still allowed.
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = [{ name: 'c1', context: 'ctx-c1' }]
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        deployments: [{ name: 'nginx', replicas: 1, readyReplicas: 1 }],
      }),
    })
    global.fetch = fetchSpy
    mockKubectlExec.mockResolvedValue({ exitCode: 1, output: '' })

    renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(fetchSpy).toHaveBeenCalled()
  })

  // =========================================================================
  // 25. Completed mission past TTL without logs => recovers logs
  // =========================================================================
  it('does one recovery poll for completed missions past TTL without logs', async () => {
    const completedAt = Date.now() - CACHE_TTL_MS - 1
    const missions = [makeMission({
      id: 'ttl-recover', status: 'orbit',
      startedAt: completedAt - MIN_ACTIVE_MS, completedAt,
      targetClusters: ['c1'],
      clusterStatuses: [{
        cluster: 'c1', status: 'running', replicas: 1, readyReplicas: 1,
        // No logs — should trigger a recovery poll
      }],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = [{ name: 'c1', context: 'ctx-c1' }]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        deployments: [{ name: 'nginx', replicas: 1, readyReplicas: 1 }],
      }),
    })
    mockKubectlExec.mockResolvedValue({ exitCode: 1, output: '' })

    renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(global.fetch).toHaveBeenCalled()
  })

  // =========================================================================
  // 26. Poll count increments on each poll cycle
  // =========================================================================
  it('increments pollCount on each poll cycle', async () => {
    const missions = [makeMission({
      id: 'pollcount-test', status: 'deploying',
      startedAt: Date.now(), targetClusters: ['c1'], pollCount: 0,
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = []
    global.fetch = vi.fn().mockRejectedValue(new Error('down'))

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()
    expect(result.current.missions[0].pollCount).toBe(1)

    await advancePollInterval()
    expect(result.current.missions[0].pollCount).toBe(2)
  })

  // =========================================================================
  // 27. Auth headers include bearer token from localStorage
  // =========================================================================
  it('sends authorization header from stored token', async () => {
    localStorage.setItem('kc-auth-token', 'my-secret-token')

    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'auth-test', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = []

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'Running', replicas: 1, readyReplicas: 1,
      }),
    })

    renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const statusCall = calls.find((c: unknown[]) =>
      typeof c[0] === 'string' && (c[0] as string).includes('/api/workloads/deploy-status/')
    )
    expect(statusCall).toBeDefined()
    expect((statusCall![1] as Record<string, Record<string, string>>).headers.Authorization).toBe('Bearer my-secret-token')
  })

  // =========================================================================
  // 28. No auth header when no token present
  // =========================================================================
  it('sends no auth header when no token is stored', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'no-auth', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = []

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'Running', replicas: 1, readyReplicas: 1,
      }),
    })

    renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const statusCall = calls.find((c: unknown[]) =>
      typeof c[0] === 'string' && (c[0] as string).includes('/api/workloads/deploy-status/')
    )
    expect(statusCall).toBeDefined()
    expect((statusCall![1] as Record<string, Record<string, string>>).headers.Authorization).toBeUndefined()
  })

  // =========================================================================
  // 29. fetchDeployEventsViaProxy returns formatted event log strings
  // =========================================================================
  it('fetches and formats K8s events from kubectlProxy', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'events-test', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = [{ name: 'c1', context: 'ctx-c1' }]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        deployments: [{ name: 'nginx', replicas: 1, readyReplicas: 1 }],
      }),
    })

    mockKubectlExec.mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify({
        items: [
          {
            lastTimestamp: '2024-01-15T10:30:00Z',
            reason: 'Scheduled',
            message: 'Successfully assigned',
            involvedObject: { name: 'nginx-abc123' },
          },
          {
            lastTimestamp: '2024-01-15T10:30:05Z',
            reason: 'Pulled',
            message: 'Container image pulled',
            involvedObject: { name: 'nginx' },
          },
          {
            lastTimestamp: '2024-01-15T10:30:10Z',
            reason: 'Started',
            message: 'Some other workload',
            involvedObject: { name: 'redis-xyz' },
          },
        ],
      }),
    })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    const logs = result.current.missions[0].clusterStatuses[0].logs
    expect(logs).toBeDefined()
    // 2 relevant events (nginx exact match, nginx-abc123 prefix match), not redis
    expect(logs!.length).toBe(2)
    expect(logs![0]).toContain('Pulled')
    expect(logs![0]).toContain('Container image pulled')
    expect(logs![1]).toContain('Scheduled')
    expect(logs![1]).toContain('Successfully assigned')
  })

  // =========================================================================
  // 30. fetchDeployEventsViaProxy handles invalid JSON from kubectl
  // =========================================================================
  it('returns no logs when kubectlProxy output is invalid JSON', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'bad-json', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = [{ name: 'c1', context: 'ctx-c1' }]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        deployments: [{ name: 'nginx', replicas: 1, readyReplicas: 1 }],
      }),
    })

    mockKubectlExec.mockResolvedValue({
      exitCode: 0,
      output: 'not valid json at all {{{{',
    })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(result.current.missions[0].status).toBe('orbit')
    expect(result.current.missions[0].clusterStatuses[0].logs).toBeUndefined()
  })

  // =========================================================================
  // 31. REST API: applying status with partial readyReplicas
  // =========================================================================
  it('reports applying status when REST API shows partial readyReplicas', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'rest-applying', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = []

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/workloads/deploy-status/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'Progressing', replicas: 3, readyReplicas: 1,
          }),
        })
      }
      return Promise.reject(new Error('unexpected'))
    })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(result.current.missions[0].clusterStatuses[0].status).toBe('applying')
    expect(result.current.missions[0].clusterStatuses[0].replicas).toBe(3)
    expect(result.current.missions[0].clusterStatuses[0].readyReplicas).toBe(1)
  })

  // =========================================================================
  // 32. Sorting: active missions first, then completed, both newest-first
  // =========================================================================
  it('sorts active missions before completed, both newest-first', async () => {
    const now = Date.now()
    // Completed missions need completedAt past CACHE_TTL and existing logs
    // so the poll loop skips them and they retain orbit status.
    const pastTtl = now - CACHE_TTL_MS - 1
    const missions = [
      makeMission({ id: 'old-active', status: 'deploying', startedAt: now - 5000, targetClusters: ['c1'] }),
      makeMission({ id: 'new-active', status: 'deploying', startedAt: now, targetClusters: ['c1'] }),
      makeMission({
        id: 'old-done', status: 'orbit', startedAt: pastTtl - 10000,
        completedAt: pastTtl - 5000, targetClusters: ['c1'],
        clusterStatuses: [{ cluster: 'c1', status: 'running', replicas: 1, readyReplicas: 1, logs: ['done'] }],
      }),
      makeMission({
        id: 'new-done', status: 'orbit', startedAt: pastTtl - 2000,
        completedAt: pastTtl - 1000, targetClusters: ['c1'],
        clusterStatuses: [{ cluster: 'c1', status: 'running', replicas: 1, readyReplicas: 1, logs: ['done'] }],
      }),
    ]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = []
    global.fetch = vi.fn().mockRejectedValue(new Error('down'))

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    const ids = result.current.missions.map(m => m.id)
    // Active first (newest first), then completed (newest first)
    expect(ids[0]).toBe('new-active')
    expect(ids[1]).toBe('old-active')
    expect(ids[2]).toBe('new-done')
    expect(ids[3]).toBe('old-done')
  })

  // =========================================================================
  // 33. Multiple missions from multiple deploy:started events
  // =========================================================================
  it('handles multiple deploy:started events', () => {
    const { result } = renderHook(() => useDeployMissions())

    act(() => {
      fireDeployStarted({
        id: 'first', workload: 'app-a', namespace: 'ns',
        sourceCluster: 'hub', targetClusters: ['c1'],
      })
    })

    act(() => {
      fireDeployStarted({
        id: 'second', workload: 'app-b', namespace: 'ns',
        sourceCluster: 'hub', targetClusters: ['c1', 'c2'],
      })
    })

    expect(result.current.missions).toHaveLength(2)
    expect(result.current.missions[0].id).toBe('second')
    expect(result.current.missions[1].id).toBe('first')
  })

  // =========================================================================
  // 34. deploy:started with no optional fields
  // =========================================================================
  it('handles deploy:started with no optional fields', () => {
    const { result } = renderHook(() => useDeployMissions())

    act(() => {
      fireDeployStarted({
        id: 'minimal', workload: 'app', namespace: 'default',
        sourceCluster: 'hub', targetClusters: ['c1'],
      })
    })

    const m = result.current.missions[0]
    expect(m.groupName).toBeUndefined()
    expect(m.deployedBy).toBeUndefined()
  })

  // =========================================================================
  // 35. Empty old keys during migration produce empty missions
  // =========================================================================
  it('handles migration when both old keys have empty arrays', () => {
    localStorage.setItem(OLD_ACTIVE_KEY, JSON.stringify([]))
    localStorage.setItem(OLD_HISTORY_KEY, JSON.stringify([]))

    const { result } = renderHook(() => useDeployMissions())
    expect(result.current.missions).toEqual([])
    expect(localStorage.getItem(OLD_ACTIVE_KEY)).toBeNull()
    expect(localStorage.getItem(OLD_HISTORY_KEY)).toBeNull()
  })

  // =========================================================================
  // 36. Cleanup: timers are cleared on unmount
  // =========================================================================
  it('cleans up polling timers on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

    const { unmount } = renderHook(() => useDeployMissions())
    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  // =========================================================================
  // 37. REST API log fetch failure is non-critical
  // =========================================================================
  it('does not fail when REST API log fetch throws', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'log-fail', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = []

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/workloads/deploy-status/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'Running', replicas: 1, readyReplicas: 1,
          }),
        })
      }
      if (typeof url === 'string' && url.includes('/api/workloads/deploy-logs/')) {
        return Promise.reject(new Error('log fetch failed'))
      }
      return Promise.reject(new Error('unexpected'))
    })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(result.current.missions[0].status).toBe('orbit')
    expect(result.current.missions[0].clusterStatuses[0].logs).toBeUndefined()
  })

  // =========================================================================
  // 38. Agent fetch returns not-ok => counts as pending/failed (no REST fallback)
  // =========================================================================
  it('counts agent non-ok as pending failure without falling to REST', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'agent-not-ok', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = [{ name: 'c1', context: 'ctx-c1' }]

    global.fetch = vi.fn().mockImplementation(() => {
      // Agent returns non-OK — should NOT fall through to REST
      return Promise.resolve({ ok: false, status: 500 })
    })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    // #6816 — Agent non-ok now returns pendingOrFailed() immediately;
    // the cluster stays pending (first failure) and never hits REST.
    const clusterStatus = result.current.missions[0].clusterStatuses[0]
    expect(clusterStatus.status).toBe('pending')
    expect(clusterStatus.consecutiveFailures).toBe(1)

    // Verify no REST call was made (only the agent call)
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const restCalls = calls.filter((c: unknown[]) =>
      typeof c[0] === 'string' && (c[0] as string).includes('/api/workloads/deploy-status/')
    )
    expect(restCalls).toHaveLength(0)
  })

  // =========================================================================
  // 39. Agent uses cluster context (not name) for query param
  // =========================================================================
  it('uses cluster context from cache when querying agent', async () => {
    const missions = [makeMission({
      id: 'ctx-test', status: 'deploying', startedAt: Date.now(),
      targetClusters: ['my-cluster'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = [{ name: 'my-cluster', context: 'actual-context' }]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ deployments: [] }),
    })
    mockKubectlExec.mockResolvedValue({ exitCode: 1, output: '' })

    renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const agentCall = calls.find((c: unknown[]) =>
      typeof c[0] === 'string' && (c[0] as string).includes('localhost:8585')
    )
    expect(agentCall).toBeDefined()
    expect(agentCall![0]).toContain('cluster=actual-context')
  })

  // =========================================================================
  // 40. No polling when missions list is empty
  // =========================================================================
  it('does not fetch when no missions exist', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy

    renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // =========================================================================
  // 41. #5501: partial mission reaches terminal state with completedAt
  // =========================================================================
  it('treats partial as terminal and sets completedAt', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'partial-terminal', status: 'deploying', startedAt,
      targetClusters: ['c1', 'c2'],
      clusterStatuses: [
        { cluster: 'c1', status: 'pending', replicas: 0, readyReplicas: 0 },
        { cluster: 'c2', status: 'pending', replicas: 0, readyReplicas: 0 },
      ],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = [
      { name: 'c1', context: 'ctx-c1' },
      { name: 'c2', context: 'ctx-c2' },
    ]

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('cluster=ctx-c1')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            deployments: [{ name: 'nginx', replicas: 1, readyReplicas: 1 }],
          }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          deployments: [{ name: 'nginx', replicas: 1, readyReplicas: 0, status: 'failed' }],
        }),
      })
    })
    mockKubectlExec.mockResolvedValue({ exitCode: 1, output: '' })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(result.current.missions[0].status).toBe('partial')
    expect(result.current.missions[0].completedAt).toBeDefined()
    // partial is terminal — should appear in completedMissions
    expect(result.current.completedMissions).toHaveLength(1)
    expect(result.current.activeMissions).toHaveLength(0)
  })

  // =========================================================================
  // 42. #5501 + #6415: partial mission stops polling after CACHE_TTL once
  //      the log-recovery grace window has been exhausted.
  // =========================================================================
  it('stops polling partial missions past TTL after log recovery budget exhausted', async () => {
    const completedAt = Date.now() - CACHE_TTL_MS - 1
    const missions = [makeMission({
      id: 'partial-ttl', status: 'partial',
      startedAt: completedAt - MIN_ACTIVE_MS, completedAt,
      targetClusters: ['c1', 'c2'],
      clusterStatuses: [
        { cluster: 'c1', status: 'running', replicas: 1, readyReplicas: 1, logs: ['ok'] },
        { cluster: 'c2', status: 'failed', replicas: 1, readyReplicas: 0, logs: ['fail'] },
      ],
      // #6415: simulate grace window already consumed.
      logRecoveryPolls: 3,
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    const fetchSpy = vi.fn()
    global.fetch = fetchSpy

    renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // =========================================================================
  // 43. #5500: event log does not mix workloads with shared prefix
  // =========================================================================
  it('excludes events from workloads sharing a prefix (e.g. api vs api-gateway)', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'prefix-test', workload: 'api', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = [{ name: 'c1', context: 'ctx-c1' }]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        deployments: [{ name: 'api', replicas: 1, readyReplicas: 1 }],
      }),
    })

    mockKubectlExec.mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify({
        items: [
          {
            lastTimestamp: '2024-01-15T10:30:00Z',
            reason: 'Scaled',
            message: 'Scaled up api ReplicaSet',
            involvedObject: { name: 'api' },
          },
          {
            lastTimestamp: '2024-01-15T10:30:01Z',
            reason: 'Pulled',
            message: 'Container image pulled',
            involvedObject: { name: 'api-7f8d9c' },
          },
          {
            lastTimestamp: '2024-01-15T10:30:02Z',
            reason: 'Started',
            message: 'Started api-gateway container',
            involvedObject: { name: 'api-gateway' },
          },
          {
            lastTimestamp: '2024-01-15T10:30:03Z',
            reason: 'Pulled',
            message: 'Pulled gateway image',
            involvedObject: { name: 'api-gateway-5f4d3c' },
          },
          {
            lastTimestamp: '2024-01-15T10:30:04Z',
            reason: 'Started',
            message: 'Started gateway pod',
            involvedObject: { name: 'api-gateway-5f4d3c-ab12c' },
          },
        ],
      }),
    })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    const logs = result.current.missions[0].clusterStatuses[0].logs
    expect(logs).toBeDefined()
    // Only api (exact) and api-7f8d9c (K8s child) — not api-gateway or its children
    expect(logs!.length).toBe(2)
    expect(logs!.some(l => l.includes('Scaled up api ReplicaSet'))).toBe(true)
    expect(logs!.some(l => l.includes('Container image pulled'))).toBe(true)
    expect(logs!.some(l => l.includes('gateway'))).toBe(false)
  })

  // =========================================================================
  // 44. #5499: 401 during deploy is reported as auth error, not unreachable
  // =========================================================================
  it('reports auth error for 401 instead of status unreachable', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'auth-401', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = []
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    const cs = result.current.missions[0].clusterStatuses[0]
    expect(cs.status).toBe('failed')
    expect(cs.logs).toBeDefined()
    expect(cs.logs![0]).toContain('Authentication failed')
    expect(cs.logs![0]).toContain('401')
  })

  // =========================================================================
  // 45. #5499: 403 during deploy is reported as auth error
  // =========================================================================
  it('reports auth error for 403 instead of status unreachable', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'auth-403', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = []
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    const cs = result.current.missions[0].clusterStatuses[0]
    expect(cs.status).toBe('failed')
    expect(cs.logs).toBeDefined()
    expect(cs.logs![0]).toContain('Authentication failed')
    expect(cs.logs![0]).toContain('403')
  })

  // =========================================================================
  // 46. #5499: 500 still goes through pendingOrFailed (not auth error)
  // =========================================================================
  it('treats 500 as pending (not auth error)', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'rest-500', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = []
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

    const { result } = renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    const cs = result.current.missions[0].clusterStatuses[0]
    expect(cs.status).toBe('pending')
    // #6666 — Non-auth HTTP errors now append a "Backend error HTTP ..."
    // log line so operators can see the backend is returning errors. The
    // mission still stays in `pending` (not `failed`) and is NOT flagged
    // as an auth error.
    expect(cs.logs).toBeDefined()
    expect(cs.logs?.some(l => /Backend error HTTP 500/.test(l))).toBe(true)
    expect(cs.logs?.some(l => /Authentication failed/.test(l))).toBe(false)
  })

  // =========================================================================
  // 47. #5498: abort timer is cleared on agent fetch failure
  // =========================================================================
  it('clears abort timer even when agent fetch throws', async () => {
    const missions = [makeMission({
      id: 'timer-leak', status: 'deploying',
      startedAt: Date.now(), targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = [{ name: 'c1', context: 'ctx-c1' }]

    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

    // Agent fetch throws — the finally block should still clear the timer
    global.fetch = vi.fn().mockRejectedValue(new Error('Agent network failure'))

    renderHook(() => useDeployMissions())

    await advancePastInitialPoll()

    // clearTimeout should have been called for the abort timer (among others)
    // The abort timer clearTimeout is called in the finally block
    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  // =========================================================================
  // #6414: 403 with an RBAC body surfaces the permission message
  // =========================================================================
  it('surfaces RBAC permission message for 403 with a parseable body', async () => {
    const startedAt = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [makeMission({
      id: 'rbac-403', status: 'deploying', startedAt,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = []
    // Build a Response-like mock with a .clone().text() chain returning a
    // K8s-style Forbidden Status object. The hook should pull the message
    // out rather than falling back to the legacy "token expired" line.
    const rbacBody = JSON.stringify({
      kind: 'Status',
      reason: 'Forbidden',
      message: 'deployments.apps is forbidden: User "alice" cannot list resource "deployments" in namespace "prod"',
    })
    const makeCloneable = () => ({
      ok: false,
      status: 403,
      clone: () => ({ text: async () => rbacBody }),
      text: async () => rbacBody,
    })
    global.fetch = vi.fn().mockResolvedValue(makeCloneable())

    const { result } = renderHook(() => useDeployMissions())
    await advancePastInitialPoll()

    const cs = result.current.missions[0].clusterStatuses[0]
    expect(cs.status).toBe('failed')
    expect(cs.logs![0]).toContain('Permission denied')
    expect(cs.logs![0]).toContain('cannot list')
  })

  // =========================================================================
  // #6412: transient network failures do not flip the mission to failed
  // =========================================================================
  it('treats repeated pure-network failures as network-pending, not failed', async () => {
    const missions = [makeMission({
      id: 'net-blip', status: 'deploying',
      startedAt: Date.now() - MIN_ACTIVE_MS - 1,
      targetClusters: ['c1'],
    })]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = []
    // fetch throws on every call — simulates sustained network blackout
    // that is still SHORT of the network-failure threshold.
    global.fetch = vi.fn().mockRejectedValue(new Error('Network unreachable'))

    const { result } = renderHook(() => useDeployMissions())
    await advancePastInitialPoll()
    // 6 more polls: with the old code this would have marked cluster failed.
    for (let i = 0; i < 6; i++) await advancePollInterval()

    const cs = result.current.missions[0].clusterStatuses[0]
    // After 7 polls the HTTP failure count threshold (6) would have
    // tripped; the network failure count threshold (60) has not.
    expect(cs.status).toBe('pending')
    expect(cs.networkFailureCount).toBeGreaterThanOrEqual(6)
    // Status counter for HTTP errors stays at zero because these are
    // network-level, not HTTP errors.
    expect(cs.consecutiveFailures ?? 0).toBe(0)
  })

  // =========================================================================
  // #6411: active-mission sort is deterministic for equal startedAt
  // =========================================================================
  it('orders missions deterministically when startedAt is identical', async () => {
    const t = Date.now() - MIN_ACTIVE_MS - 1
    const missions = [
      makeMission({ id: 'mm-c', status: 'deploying', startedAt: t, targetClusters: ['c1'] }),
      makeMission({ id: 'mm-a', status: 'deploying', startedAt: t, targetClusters: ['c1'] }),
      makeMission({ id: 'mm-b', status: 'deploying', startedAt: t, targetClusters: ['c1'] }),
    ]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    mockClusterCacheRef.clusters = []
    global.fetch = vi.fn().mockRejectedValue(new Error('not available'))

    const { result } = renderHook(() => useDeployMissions())
    await advancePastInitialPoll()

    // All three share the same startedAt: tiebreaker should sort by id ascending.
    const ids = result.current.missions.map(m => m.id)
    expect(ids).toEqual(['mm-a', 'mm-b', 'mm-c'])

    // Re-poll — order must be stable across polls.
    await advancePollInterval()
    expect(result.current.missions.map(m => m.id)).toEqual(['mm-a', 'mm-b', 'mm-c'])
  })

  // =========================================================================
  // 48. #5501: saveMissions preserves logs for partial missions
  // =========================================================================
  it('preserves logs for partial missions when persisting to localStorage', () => {
    const missions = [
      makeMission({
        id: 'partial-logs', status: 'partial', completedAt: Date.now(),
        clusterStatuses: [
          {
            cluster: 'c1', status: 'running', replicas: 1, readyReplicas: 1,
            logs: ['success log'],
          },
          {
            cluster: 'c2', status: 'failed', replicas: 1, readyReplicas: 0,
            logs: ['failure log'],
          },
        ],
      }),
    ]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))

    renderHook(() => useDeployMissions())

    const stored = JSON.parse(localStorage.getItem(MISSIONS_STORAGE_KEY) || '[]')
    const partialMission = stored.find((m: DeployMission) => m.id === 'partial-logs')
    // partial is terminal — logs should be preserved, not stripped
    expect(partialMission.clusterStatuses[0].logs).toEqual(['success log'])
    expect(partialMission.clusterStatuses[1].logs).toEqual(['failure log'])
  })
})
