import { describe, it, expect, vi, beforeEach } from 'vitest'
import { __testables } from '../useDeployMissions'

const {
  safeReplicaCount,
  isTerminalStatus,
  authHeaders,
  loadMissions,
  saveMissions,
  runWithConcurrency,
  MISSIONS_STORAGE_KEY,
  MAX_MISSIONS,
  MAX_STATUS_FAILURES,
  MAX_NETWORK_FAILURES,
  MIN_ACTIVE_MS,
  LOG_RECOVERY_EXTRA_POLLS,
  DEPLOY_POLL_MAX_CONCURRENCY,
} = __testables

beforeEach(() => {
  localStorage.clear()
})

describe('constants', () => {
  it('MISSIONS_STORAGE_KEY is a non-empty string', () => {
    expect(typeof MISSIONS_STORAGE_KEY).toBe('string')
    expect(MISSIONS_STORAGE_KEY.length).toBeGreaterThan(0)
  })

  it('MAX_MISSIONS is a positive integer', () => {
    expect(Number.isInteger(MAX_MISSIONS)).toBe(true)
    expect(MAX_MISSIONS).toBeGreaterThan(0)
  })

  it('MAX_STATUS_FAILURES is a positive integer', () => {
    expect(Number.isInteger(MAX_STATUS_FAILURES)).toBe(true)
    expect(MAX_STATUS_FAILURES).toBeGreaterThan(0)
  })

  it('MAX_NETWORK_FAILURES is greater than MAX_STATUS_FAILURES', () => {
    expect(MAX_NETWORK_FAILURES).toBeGreaterThan(MAX_STATUS_FAILURES)
  })

  it('MIN_ACTIVE_MS is a positive number', () => {
    expect(MIN_ACTIVE_MS).toBeGreaterThan(0)
  })

  it('LOG_RECOVERY_EXTRA_POLLS is a non-negative integer', () => {
    expect(Number.isInteger(LOG_RECOVERY_EXTRA_POLLS)).toBe(true)
    expect(LOG_RECOVERY_EXTRA_POLLS).toBeGreaterThanOrEqual(0)
  })

  it('DEPLOY_POLL_MAX_CONCURRENCY is a positive integer', () => {
    expect(Number.isInteger(DEPLOY_POLL_MAX_CONCURRENCY)).toBe(true)
    expect(DEPLOY_POLL_MAX_CONCURRENCY).toBeGreaterThan(0)
  })
})

describe('safeReplicaCount', () => {
  it('returns a valid number as-is', () => {
    expect(safeReplicaCount(3)).toBe(3)
    expect(safeReplicaCount(0)).toBe(0)
  })

  it('parses numeric strings', () => {
    expect(safeReplicaCount('5')).toBe(5)
    expect(safeReplicaCount('0')).toBe(0)
  })

  it('returns fallback for NaN inputs', () => {
    expect(safeReplicaCount('not-a-number')).toBe(0)
    expect(safeReplicaCount('not-a-number', 1)).toBe(1)
  })

  it('returns fallback for null and undefined', () => {
    expect(safeReplicaCount(null)).toBe(0)
    expect(safeReplicaCount(undefined)).toBe(0)
  })

  it('returns fallback for Infinity and -Infinity', () => {
    expect(safeReplicaCount(Infinity)).toBe(0)
    expect(safeReplicaCount(-Infinity)).toBe(0)
    expect(safeReplicaCount(Infinity, 2)).toBe(2)
  })

  it('returns fallback for negative numbers', () => {
    expect(safeReplicaCount(-1)).toBe(0)
    expect(safeReplicaCount(-100, 5)).toBe(5)
  })

  it('handles objects and arrays by returning fallback', () => {
    expect(safeReplicaCount({})).toBe(0)
    expect(safeReplicaCount([])).toBe(0)
  })

  it('uses custom fallback when provided', () => {
    expect(safeReplicaCount(NaN, 42)).toBe(42)
  })
})

describe('isTerminalStatus', () => {
  it('returns true for orbit', () => {
    expect(isTerminalStatus('orbit')).toBe(true)
  })

  it('returns true for abort', () => {
    expect(isTerminalStatus('abort')).toBe(true)
  })

  it('returns true for partial', () => {
    expect(isTerminalStatus('partial')).toBe(true)
  })

  it('returns false for launching', () => {
    expect(isTerminalStatus('launching')).toBe(false)
  })

  it('returns false for deploying', () => {
    expect(isTerminalStatus('deploying')).toBe(false)
  })
})

describe('authHeaders', () => {
  it('returns Authorization header when token exists', () => {
    localStorage.setItem('token', 'my-secret-token')
    const headers = authHeaders()
    expect(headers).toEqual({ Authorization: 'Bearer my-secret-token' })
  })

  it('returns empty object when no token', () => {
    expect(authHeaders()).toEqual({})
  })

  it('returns empty object when token is removed', () => {
    localStorage.setItem('token', 'abc')
    localStorage.removeItem('token')
    expect(authHeaders()).toEqual({})
  })
})

function makeMission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-1',
    workload: 'nginx',
    namespace: 'default',
    sourceCluster: 'cluster-a',
    targetClusters: ['cluster-b'],
    status: 'deploying',
    clusterStatuses: [
      { cluster: 'cluster-b', status: 'applying', replicas: 1, readyReplicas: 0 },
    ],
    startedAt: Date.now(),
    ...overrides,
  }
}

describe('loadMissions', () => {
  it('returns empty array when nothing stored', () => {
    expect(loadMissions()).toEqual([])
  })

  it('loads missions from the primary storage key', () => {
    const missions = [makeMission()]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))
    const loaded = loadMissions()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].id).toBe('test-1')
  })

  it('migrates from old split keys', () => {
    const active = [makeMission({ id: 'active-1' })]
    const history = [makeMission({ id: 'history-1', status: 'orbit' })]
    localStorage.setItem('kubestellar-missions-active', JSON.stringify(active))
    localStorage.setItem('kubestellar-missions-history', JSON.stringify(history))

    const loaded = loadMissions()
    expect(loaded).toHaveLength(2)
    expect(loaded.map((m: { id: string }) => m.id)).toContain('active-1')
    expect(loaded.map((m: { id: string }) => m.id)).toContain('history-1')

    expect(localStorage.getItem('kubestellar-missions-active')).toBeNull()
    expect(localStorage.getItem('kubestellar-missions-history')).toBeNull()
    expect(localStorage.getItem(MISSIONS_STORAGE_KEY)).not.toBeNull()
  })

  it('limits migrated missions to MAX_MISSIONS', () => {
    const many = Array.from({ length: MAX_MISSIONS + 10 }, (_, i) =>
      makeMission({ id: `m-${i}` }),
    )
    localStorage.setItem('kubestellar-missions-active', JSON.stringify(many))

    const loaded = loadMissions()
    expect(loaded).toHaveLength(MAX_MISSIONS)
  })

  it('returns empty array on corrupt JSON', () => {
    localStorage.setItem(MISSIONS_STORAGE_KEY, '{not valid json')
    expect(loadMissions()).toEqual([])
  })

  it('returns empty array when old keys have empty arrays', () => {
    localStorage.setItem('kubestellar-missions-active', JSON.stringify([]))
    localStorage.setItem('kubestellar-missions-history', JSON.stringify([]))
    const loaded = loadMissions()
    expect(loaded).toEqual([])
  })
})

describe('saveMissions', () => {
  it('saves missions to localStorage', () => {
    const missions = [makeMission()] as any[]
    saveMissions(missions)
    const stored = JSON.parse(localStorage.getItem(MISSIONS_STORAGE_KEY)!)
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('test-1')
  })

  it('truncates to MAX_MISSIONS', () => {
    const many = Array.from({ length: MAX_MISSIONS + 10 }, (_, i) =>
      makeMission({ id: `m-${i}` }),
    ) as any[]
    saveMissions(many)
    const stored = JSON.parse(localStorage.getItem(MISSIONS_STORAGE_KEY)!)
    expect(stored).toHaveLength(MAX_MISSIONS)
  })

  it('strips logs from active (non-terminal) missions', () => {
    const missions = [
      makeMission({
        status: 'deploying',
        clusterStatuses: [
          { cluster: 'c1', status: 'applying', replicas: 1, readyReplicas: 0, logs: ['line1'] },
        ],
      }),
    ] as any[]
    saveMissions(missions)
    const stored = JSON.parse(localStorage.getItem(MISSIONS_STORAGE_KEY)!)
    expect(stored[0].clusterStatuses[0].logs).toBeUndefined()
  })

  it('preserves logs for terminal missions', () => {
    const missions = [
      makeMission({
        status: 'orbit',
        clusterStatuses: [
          { cluster: 'c1', status: 'running', replicas: 1, readyReplicas: 1, logs: ['line1'] },
        ],
      }),
    ] as any[]
    saveMissions(missions)
    const stored = JSON.parse(localStorage.getItem(MISSIONS_STORAGE_KEY)!)
    expect(stored[0].clusterStatuses[0].logs).toEqual(['line1'])
  })

  it('preserves logs for abort status', () => {
    const missions = [
      makeMission({
        status: 'abort',
        clusterStatuses: [
          { cluster: 'c1', status: 'failed', replicas: 0, readyReplicas: 0, logs: ['error'] },
        ],
      }),
    ] as any[]
    saveMissions(missions)
    const stored = JSON.parse(localStorage.getItem(MISSIONS_STORAGE_KEY)!)
    expect(stored[0].clusterStatuses[0].logs).toEqual(['error'])
  })

  it('preserves logs for partial status', () => {
    const missions = [
      makeMission({
        status: 'partial',
        clusterStatuses: [
          { cluster: 'c1', status: 'running', replicas: 1, readyReplicas: 1, logs: ['ok'] },
        ],
      }),
    ] as any[]
    saveMissions(missions)
    const stored = JSON.parse(localStorage.getItem(MISSIONS_STORAGE_KEY)!)
    expect(stored[0].clusterStatuses[0].logs).toEqual(['ok'])
  })
})

describe('runWithConcurrency', () => {
  it('returns results in order', async () => {
    const tasks = [
      () => Promise.resolve('a'),
      () => Promise.resolve('b'),
      () => Promise.resolve('c'),
    ]
    const results = await runWithConcurrency(tasks, 2)
    expect(results).toEqual(['a', 'b', 'c'])
  })

  it('handles empty task array', async () => {
    const results = await runWithConcurrency([], 3)
    expect(results).toEqual([])
  })

  it('handles single task', async () => {
    const results = await runWithConcurrency([() => Promise.resolve(42)], 1)
    expect(results).toEqual([42])
  })

  it('respects concurrency limit', async () => {
    let maxConcurrent = 0
    let currentConcurrent = 0
    const CONCURRENCY_LIMIT = 2
    const TASK_COUNT = 6

    const tasks = Array.from({ length: TASK_COUNT }, () => async () => {
      currentConcurrent++
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
      await new Promise(r => setTimeout(r, 10))
      currentConcurrent--
      return maxConcurrent
    })

    await runWithConcurrency(tasks, CONCURRENCY_LIMIT)
    expect(maxConcurrent).toBeLessThanOrEqual(CONCURRENCY_LIMIT)
  })

  it('handles limit larger than task count', async () => {
    const tasks = [() => Promise.resolve(1), () => Promise.resolve(2)]
    const results = await runWithConcurrency(tasks, 100)
    expect(results).toEqual([1, 2])
  })

  it('handles limit of zero by using at least 1 worker', async () => {
    const tasks = [() => Promise.resolve('x')]
    const results = await runWithConcurrency(tasks, 0)
    expect(results).toEqual(['x'])
  })

  it('propagates rejections', async () => {
    const tasks = [
      () => Promise.resolve('ok'),
      () => Promise.reject(new Error('boom')),
    ]
    await expect(runWithConcurrency(tasks, 2)).rejects.toThrow('boom')
  })

  it('preserves result types', async () => {
    const tasks = [
      () => Promise.resolve({ name: 'a', count: 1 }),
      () => Promise.resolve({ name: 'b', count: 2 }),
    ]
    const results = await runWithConcurrency(tasks, 2)
    expect(results[0].name).toBe('a')
    expect(results[1].count).toBe(2)
  })
})
