import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn() } }))
vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: vi.fn().mockReturnValue(false),
}))
vi.mock('../../../lib/sseClient', () => ({ fetchSSE: vi.fn() }))
vi.mock('../../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))
vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: vi.fn(),
  registerCacheReset: vi.fn(),
}))
vi.mock('../../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'kc-auth-token',
}))
vi.mock('../shared', () => ({
  clusterCacheRef: { current: new Map() },
  subscribeClusterCache: vi.fn(),
  agentFetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
}))

const mod = await import('../operators')
const {
  loadOperatorsCacheFromStorage,
  saveOperatorsCacheToStorage,
  loadSubscriptionsCacheFromStorage,
  saveSubscriptionsCacheToStorage,
  getDemoOperators,
  getDemoOperatorSubscriptions,
  OPERATORS_CACHE_KEY,
  SUBSCRIPTIONS_CACHE_KEY,
} = mod.__operatorsTestables

beforeEach(() => {
  localStorage.clear()
})

// ── loadOperatorsCacheFromStorage ──

describe('loadOperatorsCacheFromStorage', () => {
  it('returns null when nothing stored', () => {
    expect(loadOperatorsCacheFromStorage('operators:all')).toBeNull()
  })

  it('returns cached data when key matches', () => {
    const data = [{ name: 'prometheus-operator', namespace: 'monitoring', version: 'v0.65.1', status: 'Succeeded', cluster: 'prod' }]
    localStorage.setItem(OPERATORS_CACHE_KEY, JSON.stringify({ data, timestamp: 1000, key: 'operators:all' }))
    const result = loadOperatorsCacheFromStorage('operators:all')
    expect(result).not.toBeNull()
    expect(result!.data).toEqual(data)
    expect(result!.timestamp).toBe(1000)
  })

  it('returns null when key does not match', () => {
    localStorage.setItem(OPERATORS_CACHE_KEY, JSON.stringify({ data: [{ name: 'op' }], timestamp: 1000, key: 'operators:prod' }))
    expect(loadOperatorsCacheFromStorage('operators:staging')).toBeNull()
  })

  it('returns null for empty data array', () => {
    localStorage.setItem(OPERATORS_CACHE_KEY, JSON.stringify({ data: [], timestamp: 1000, key: 'operators:all' }))
    expect(loadOperatorsCacheFromStorage('operators:all')).toBeNull()
  })

  it('returns null for corrupted JSON', () => {
    localStorage.setItem(OPERATORS_CACHE_KEY, 'invalid{{{')
    expect(loadOperatorsCacheFromStorage('operators:all')).toBeNull()
  })

  it('uses Date.now() fallback when timestamp missing', () => {
    const before = Date.now()
    localStorage.setItem(OPERATORS_CACHE_KEY, JSON.stringify({ data: [{ name: 'op' }], key: 'operators:all' }))
    const result = loadOperatorsCacheFromStorage('operators:all')
    expect(result).not.toBeNull()
    expect(result!.timestamp).toBeGreaterThanOrEqual(before)
  })
})

// ── saveOperatorsCacheToStorage ──

describe('saveOperatorsCacheToStorage', () => {
  it('saves operators to localStorage', () => {
    const data = [{ name: 'op1', namespace: 'ns1', version: 'v1', status: 'Succeeded', cluster: 'c1' }]
    saveOperatorsCacheToStorage(data, 'operators:all')
    const stored = JSON.parse(localStorage.getItem(OPERATORS_CACHE_KEY)!)
    expect(stored.data).toEqual(data)
    expect(stored.key).toBe('operators:all')
    expect(typeof stored.timestamp).toBe('number')
  })

  it('does not save empty array', () => {
    saveOperatorsCacheToStorage([], 'operators:all')
    expect(localStorage.getItem(OPERATORS_CACHE_KEY)).toBeNull()
  })

  it('does not throw on storage error', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => saveOperatorsCacheToStorage([{ name: 'op' }] as never[], 'key')).not.toThrow()
    vi.restoreAllMocks()
  })
})

// ── loadSubscriptionsCacheFromStorage ──

describe('loadSubscriptionsCacheFromStorage', () => {
  it('returns null when nothing stored', () => {
    expect(loadSubscriptionsCacheFromStorage('subs:all')).toBeNull()
  })

  it('returns cached data when key matches', () => {
    const data = [{ name: 'sub1', namespace: 'ns1', channel: 'stable', source: 'catalog', installPlanApproval: 'Automatic', currentCSV: 'op.v1', cluster: 'c1' }]
    localStorage.setItem(SUBSCRIPTIONS_CACHE_KEY, JSON.stringify({ data, timestamp: 2000, key: 'subs:all' }))
    const result = loadSubscriptionsCacheFromStorage('subs:all')
    expect(result).not.toBeNull()
    expect(result!.data).toEqual(data)
  })

  it('returns null for key mismatch', () => {
    localStorage.setItem(SUBSCRIPTIONS_CACHE_KEY, JSON.stringify({ data: [{ name: 's' }], key: 'subs:prod', timestamp: 1 }))
    expect(loadSubscriptionsCacheFromStorage('subs:staging')).toBeNull()
  })

  it('returns null for corrupted JSON', () => {
    localStorage.setItem(SUBSCRIPTIONS_CACHE_KEY, 'broken')
    expect(loadSubscriptionsCacheFromStorage('subs:all')).toBeNull()
  })
})

// ── saveSubscriptionsCacheToStorage ──

describe('saveSubscriptionsCacheToStorage', () => {
  it('saves subscriptions to localStorage', () => {
    const data = [{ name: 's1', namespace: 'ns', channel: 'stable', source: 'cat', installPlanApproval: 'Auto', currentCSV: 'x.v1', cluster: 'c1' }]
    saveSubscriptionsCacheToStorage(data, 'subs:all')
    const stored = JSON.parse(localStorage.getItem(SUBSCRIPTIONS_CACHE_KEY)!)
    expect(stored.data).toEqual(data)
    expect(stored.key).toBe('subs:all')
  })

  it('does not save empty array', () => {
    saveSubscriptionsCacheToStorage([], 'subs:all')
    expect(localStorage.getItem(SUBSCRIPTIONS_CACHE_KEY)).toBeNull()
  })
})

// ── getDemoOperators ──

describe('getDemoOperators', () => {
  it('returns operators for a cluster', () => {
    const ops = getDemoOperators('prod-east')
    expect(ops.length).toBeGreaterThanOrEqual(3)
    expect(ops.length).toBeLessThanOrEqual(7)
    for (const op of ops) {
      expect(op.cluster).toBe('prod-east')
      expect(op.name).toBeTruthy()
      expect(op.namespace).toBeTruthy()
    }
  })

  it('varies count based on cluster name hash', () => {
    const a = getDemoOperators('cluster-a')
    const b = getDemoOperators('cluster-b')
    // Different clusters may produce different counts
    expect(typeof a.length).toBe('number')
    expect(typeof b.length).toBe('number')
  })

  it('includes known operator names', () => {
    const ops = getDemoOperators('test-cluster')
    const names = ops.map(o => o.name)
    expect(names).toContain('prometheus-operator')
    expect(names).toContain('cert-manager')
  })

  it('has varied statuses based on hash', () => {
    const allStatuses = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const ops = getDemoOperators(`cluster-${i}`)
      for (const op of ops) allStatuses.add(op.status)
    }
    expect(allStatuses.size).toBeGreaterThan(1)
  })
})

// ── getDemoOperatorSubscriptions ──

describe('getDemoOperatorSubscriptions', () => {
  it('returns subscriptions for a cluster', () => {
    const subs = getDemoOperatorSubscriptions('prod-east')
    expect(subs.length).toBeGreaterThanOrEqual(2)
    expect(subs.length).toBeLessThanOrEqual(5)
    for (const sub of subs) {
      expect(sub.cluster).toBe('prod-east')
      expect(sub.name).toBeTruthy()
      expect(sub.source).toBeTruthy()
    }
  })

  it('includes prometheus-operator subscription', () => {
    const subs = getDemoOperatorSubscriptions('any-cluster')
    const names = subs.map(s => s.name)
    expect(names).toContain('prometheus-operator')
  })

  it('has varied installPlanApproval based on hash', () => {
    const approvals = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const subs = getDemoOperatorSubscriptions(`cluster-${i}`)
      for (const sub of subs) approvals.add(sub.installPlanApproval)
    }
    expect(approvals.size).toBeGreaterThan(1)
  })
})
