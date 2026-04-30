import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/cardEvents', () => ({
  useCardSubscribe: vi.fn(),
}))
vi.mock('../mcp/shared', () => ({
  clusterCacheRef: { current: new Map() },
  agentFetch: vi.fn(),
}))
vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: vi.fn() },
}))
vi.mock('../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
  STORAGE_KEY_TOKEN: 'kc-auth-token',
  STORAGE_KEY_MISSIONS_ACTIVE: 'kc-missions-active',
  STORAGE_KEY_MISSIONS_HISTORY: 'kc-missions-history',
}))
vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
  DEPLOY_ABORT_TIMEOUT_MS: 30_000,
  KUBECTL_DEFAULT_TIMEOUT_MS: 15_000,
}))
vi.mock('../../lib/constants/time', () => ({
  MS_PER_MINUTE: 60_000,
}))

const mod = await import('../useDeployMissions')
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
} = mod.__testables

beforeEach(() => {
  localStorage.clear()
})

// ── safeReplicaCount ──

describe('safeReplicaCount', () => {
  it('returns numeric value for valid number', () => {
    expect(safeReplicaCount(3)).toBe(3)
  })

  it('returns 0 for NaN', () => {
    expect(safeReplicaCount(NaN)).toBe(0)
  })

  it('returns 0 for Infinity', () => {
    expect(safeReplicaCount(Infinity)).toBe(0)
  })

  it('returns 0 for -Infinity', () => {
    expect(safeReplicaCount(-Infinity)).toBe(0)
  })

  it('returns 0 for negative number', () => {
    expect(safeReplicaCount(-1)).toBe(0)
  })

  it('returns fallback for NaN when custom fallback given', () => {
    expect(safeReplicaCount(NaN, 5)).toBe(5)
  })

  it('parses string number', () => {
    expect(safeReplicaCount('3')).toBe(3)
  })

  it('returns 0 for non-numeric string', () => {
    expect(safeReplicaCount('abc')).toBe(0)
  })

  it('returns 0 for null', () => {
    expect(safeReplicaCount(null)).toBe(0)
  })

  it('returns 0 for undefined', () => {
    expect(safeReplicaCount(undefined)).toBe(0)
  })

  it('returns 0 for object', () => {
    expect(safeReplicaCount({})).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(safeReplicaCount('')).toBe(0)
  })

  it('returns value for zero', () => {
    expect(safeReplicaCount(0)).toBe(0)
  })

  it('returns value for float', () => {
    expect(safeReplicaCount(2.5)).toBe(2.5)
  })
})

// ── isTerminalStatus ──

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

// ── authHeaders ──

describe('authHeaders', () => {
  it('returns empty object when no token', () => {
    expect(authHeaders()).toEqual({})
  })

  it('returns Authorization header when token exists', () => {
    localStorage.setItem('kc-auth-token', 'test-jwt')
    expect(authHeaders()).toEqual({ Authorization: 'Bearer test-jwt' })
  })
})

// ── loadMissions / saveMissions ──

describe('loadMissions', () => {
  it('returns empty array when nothing stored', () => {
    expect(loadMissions()).toEqual([])
  })

  it('returns missions from primary storage key', () => {
    const missions = [{ id: 'm1', status: 'orbit', workload: 'test', clusterStatuses: [] }]
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(missions))
    expect(loadMissions()).toEqual(missions)
  })

  it('migrates from old split keys', () => {
    const active = [{ id: 'a1', status: 'deploying', workload: 'w1', clusterStatuses: [] }]
    const history = [{ id: 'h1', status: 'orbit', workload: 'w2', clusterStatuses: [] }]
    localStorage.setItem('kc-missions-active', JSON.stringify(active))
    localStorage.setItem('kc-missions-history', JSON.stringify(history))
    const result = loadMissions()
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('a1')
    expect(result[1].id).toBe('h1')
    expect(localStorage.getItem('kc-missions-active')).toBeNull()
    expect(localStorage.getItem('kc-missions-history')).toBeNull()
  })

  it('returns empty array for invalid JSON', () => {
    localStorage.setItem(MISSIONS_STORAGE_KEY, 'invalid{{{')
    expect(loadMissions()).toEqual([])
  })

  it('caps at MAX_MISSIONS during migration', () => {
    const many = Array.from({ length: MAX_MISSIONS + 10 }, (_, i) => ({
      id: `m${i}`, status: 'orbit', workload: `w${i}`, clusterStatuses: [],
    }))
    localStorage.setItem('kc-missions-active', JSON.stringify(many))
    const result = loadMissions()
    expect(result).toHaveLength(MAX_MISSIONS)
  })

  it('migrates when only old active key exists', () => {
    const active = [{ id: 'a1', status: 'deploying', workload: 'w1', clusterStatuses: [] }]
    localStorage.setItem('kc-missions-active', JSON.stringify(active))
    const result = loadMissions()
    expect(result).toHaveLength(1)
  })

  it('returns empty when old keys have empty arrays', () => {
    localStorage.setItem('kc-missions-active', '[]')
    localStorage.setItem('kc-missions-history', '[]')
    expect(loadMissions()).toEqual([])
  })
})

describe('saveMissions', () => {
  it('persists missions to localStorage', () => {
    const missions = [{
      id: 'm1', status: 'orbit' as const, workload: 'test',
      namespace: 'default', sourceCluster: 'c1', targetClusters: ['c2'],
      startedAt: Date.now(),
      clusterStatuses: [{ cluster: 'c2', status: 'running' as const, replicas: 1, readyReplicas: 1, logs: ['line1'] }],
    }]
    saveMissions(missions)
    const stored = JSON.parse(localStorage.getItem(MISSIONS_STORAGE_KEY)!)
    expect(stored).toHaveLength(1)
    expect(stored[0].clusterStatuses[0].logs).toEqual(['line1'])
  })

  it('strips logs for active missions', () => {
    const missions = [{
      id: 'm1', status: 'deploying' as const, workload: 'test',
      namespace: 'default', sourceCluster: 'c1', targetClusters: ['c2'],
      startedAt: Date.now(),
      clusterStatuses: [{ cluster: 'c2', status: 'applying' as const, replicas: 1, readyReplicas: 0, logs: ['should-strip'] }],
    }]
    saveMissions(missions)
    const stored = JSON.parse(localStorage.getItem(MISSIONS_STORAGE_KEY)!)
    expect(stored[0].clusterStatuses[0].logs).toBeUndefined()
  })

  it('caps at MAX_MISSIONS', () => {
    const many = Array.from({ length: MAX_MISSIONS + 5 }, (_, i) => ({
      id: `m${i}`, status: 'orbit' as const, workload: `w${i}`,
      namespace: 'default', sourceCluster: 'c1', targetClusters: ['c2'],
      startedAt: Date.now(), clusterStatuses: [],
    }))
    saveMissions(many)
    const stored = JSON.parse(localStorage.getItem(MISSIONS_STORAGE_KEY)!)
    expect(stored).toHaveLength(MAX_MISSIONS)
  })
})

// ── runWithConcurrency ──

describe('runWithConcurrency', () => {
  it('runs tasks in order and returns results', async () => {
    const tasks = [
      () => Promise.resolve('a'),
      () => Promise.resolve('b'),
      () => Promise.resolve('c'),
    ]
    const results = await runWithConcurrency(tasks, 2)
    expect(results).toEqual(['a', 'b', 'c'])
  })

  it('handles empty task list', async () => {
    const results = await runWithConcurrency([], 3)
    expect(results).toEqual([])
  })

  it('respects concurrency limit', async () => {
    let maxConcurrent = 0
    let running = 0
    const tasks = Array.from({ length: 6 }, () => () => {
      running++
      maxConcurrent = Math.max(maxConcurrent, running)
      return new Promise<number>(resolve => {
        setTimeout(() => { running--; resolve(running) }, 10)
      })
    })
    await runWithConcurrency(tasks, 2)
    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it('handles single task', async () => {
    const results = await runWithConcurrency([() => Promise.resolve(42)], 1)
    expect(results).toEqual([42])
  })

  it('handles limit greater than task count', async () => {
    const tasks = [() => Promise.resolve(1), () => Promise.resolve(2)]
    const results = await runWithConcurrency(tasks, 10)
    expect(results).toEqual([1, 2])
  })
})

// ── Constants ──

describe('constants', () => {
  it('MAX_STATUS_FAILURES is a positive integer', () => {
    expect(Number.isInteger(MAX_STATUS_FAILURES)).toBe(true)
    expect(MAX_STATUS_FAILURES).toBeGreaterThan(0)
  })

  it('MAX_NETWORK_FAILURES is larger than MAX_STATUS_FAILURES', () => {
    expect(MAX_NETWORK_FAILURES).toBeGreaterThan(MAX_STATUS_FAILURES)
  })

  it('MIN_ACTIVE_MS is positive', () => {
    expect(MIN_ACTIVE_MS).toBeGreaterThan(0)
  })

  it('LOG_RECOVERY_EXTRA_POLLS is a positive integer', () => {
    expect(Number.isInteger(LOG_RECOVERY_EXTRA_POLLS)).toBe(true)
    expect(LOG_RECOVERY_EXTRA_POLLS).toBeGreaterThan(0)
  })

  it('DEPLOY_POLL_MAX_CONCURRENCY is a positive integer', () => {
    expect(Number.isInteger(DEPLOY_POLL_MAX_CONCURRENCY)).toBe(true)
    expect(DEPLOY_POLL_MAX_CONCURRENCY).toBeGreaterThan(0)
  })
})
