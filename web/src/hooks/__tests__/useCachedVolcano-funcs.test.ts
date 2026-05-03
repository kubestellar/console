/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedVolcano.ts, PLUS fetcher function tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockAuthFetch = vi.fn()
vi.mock('../../lib/api', () => ({
    createCachedHook: vi.fn(), authFetch: (...args: unknown[]) => mockAuthFetch(...args) }))

vi.mock('../../lib/constants/network', () => ({
    createCachedHook: vi.fn(),
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../useDemoMode', () => ({
    createCachedHook: vi.fn(),
  useDemoMode: () => ({ isDemoMode: false }),
  isDemoModeForced: () => false,
  canToggleDemoMode: () => true,
  isNetlifyDeployment: () => false,
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  getDemoMode: () => false,
  setGlobalDemoMode: vi.fn(),
}))

const mockUseCache = vi.fn(() => ({
  data: null,
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  error: null,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
  refetch: vi.fn(),
}))

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../../components/cards/CardDataContext', () => ({
    createCachedHook: vi.fn(),
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
  useCardDemoState: vi.fn(),
}))

import { __testables } from '../useCachedVolcano'
import { useCachedVolcano } from '../useCachedVolcano'
import type {
  VolcanoQueue,
  VolcanoJob,
  VolcanoPodGroup,
} from '../../components/cards/volcano_status/demoData'

const { summarize, deriveHealth, deriveStatsFromLists, buildVolcanoStatus } = __testables

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeQueue(overrides: Partial<VolcanoQueue> = {}): VolcanoQueue {
  return {
    name: 'default',
    state: 'Open',
    weight: 1,
    allocatedGpu: 4,
    pendingJobs: 0,
    runningJobs: 2,
    cluster: 'cluster-1',
    ...overrides,
  }
}

function makeJob(overrides: Partial<VolcanoJob> = {}): VolcanoJob {
  return {
    name: 'training-job-1',
    namespace: 'ml',
    queue: 'default',
    phase: 'Running',
    minAvailable: 1,
    replicas: 2,
    createdAt: new Date().toISOString(),
    cluster: 'cluster-1',
    ...overrides,
  }
}

function makePodGroup(overrides: Partial<VolcanoPodGroup> = {}): VolcanoPodGroup {
  return {
    name: 'pg-1',
    namespace: 'ml',
    phase: 'Running',
    minMember: 1,
    currentMembers: 2,
    cluster: 'cluster-1',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zeros for empty data', () => {
    const stats = { totalQueues: 0, openQueues: 0, totalJobs: 0, pendingJobs: 0, runningJobs: 0, completedJobs: 0, failedJobs: 0, totalPodGroups: 0, allocatedGpu: 0, schedulerVersion: 'unknown' }
    const result = summarize([], [], [], stats)
    expect(result.totalQueues).toBe(0)
    expect(result.totalJobs).toBe(0)
    expect(result.totalPodGroups).toBe(0)
    expect(result.allocatedGpu).toBe(0)
  })

  it('counts from array lengths', () => {
    const queues = [makeQueue()]
    const jobs = [makeJob(), makeJob({ name: 'job2' })]
    const podGroups = [makePodGroup()]
    const stats = { totalQueues: 1, openQueues: 1, totalJobs: 2, pendingJobs: 0, runningJobs: 2, completedJobs: 0, failedJobs: 0, totalPodGroups: 1, allocatedGpu: 4, schedulerVersion: '1.0' }
    const result = summarize(queues, jobs, podGroups, stats)
    expect(result.totalQueues).toBe(1)
    expect(result.totalJobs).toBe(2)
    expect(result.totalPodGroups).toBe(1)
    expect(result.allocatedGpu).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  it('returns not-installed when no queues and no jobs', () => {
    expect(deriveHealth([], [])).toBe('not-installed')
  })

  it('returns healthy when jobs are not failed', () => {
    expect(deriveHealth([makeQueue()], [makeJob()])).toBe('healthy')
  })

  it('returns degraded when a job is Failed', () => {
    const jobs = [makeJob(), makeJob({ name: 'j2', phase: 'Failed' })]
    expect(deriveHealth([makeQueue()], jobs)).toBe('degraded')
  })

  it('returns healthy with queues but no jobs', () => {
    expect(deriveHealth([makeQueue()], [])).toBe('healthy')
  })
})

// ---------------------------------------------------------------------------
// deriveStatsFromLists
// ---------------------------------------------------------------------------

describe('deriveStatsFromLists', () => {
  it('derives stats from queues and jobs', () => {
    const queues = [makeQueue({ state: 'Open', allocatedGpu: 8 })]
    const jobs = [
      makeJob({ phase: 'Running' }),
      makeJob({ name: 'j2', phase: 'Pending' }),
      makeJob({ name: 'j3', phase: 'Completed' }),
      makeJob({ name: 'j4', phase: 'Failed' }),
    ]
    const podGroups = [makePodGroup()]
    const result = deriveStatsFromLists(queues, jobs, podGroups, undefined)
    expect(result.openQueues).toBe(1)
    expect(result.runningJobs).toBe(1)
    expect(result.pendingJobs).toBe(1)
    expect(result.completedJobs).toBe(1)
    expect(result.failedJobs).toBe(1)
    expect(result.allocatedGpu).toBe(8)
    expect(result.totalPodGroups).toBe(1)
  })

  it('uses partial overrides when provided', () => {
    const partial = { totalQueues: 99, schedulerVersion: '2.0.0' }
    const result = deriveStatsFromLists([makeQueue()], [makeJob()], [], partial)
    expect(result.totalQueues).toBe(99)
    expect(result.schedulerVersion).toBe('2.0.0')
  })
})

// ---------------------------------------------------------------------------
// buildVolcanoStatus
// ---------------------------------------------------------------------------

describe('buildVolcanoStatus', () => {
  it('builds not-installed status with empty data', () => {
    const stats = { totalQueues: 0, openQueues: 0, totalJobs: 0, pendingJobs: 0, runningJobs: 0, completedJobs: 0, failedJobs: 0, totalPodGroups: 0, allocatedGpu: 0, schedulerVersion: 'unknown' }
    const result = buildVolcanoStatus([], [], [], stats)
    expect(result.health).toBe('not-installed')
    expect(result.queues).toEqual([])
    expect(result.jobs).toEqual([])
    expect(result.podGroups).toEqual([])
    expect(result.lastCheckTime).toBeTruthy()
  })

  it('builds healthy status', () => {
    const queues = [makeQueue()]
    const jobs = [makeJob()]
    const podGroups = [makePodGroup()]
    const stats = { totalQueues: 1, openQueues: 1, totalJobs: 1, pendingJobs: 0, runningJobs: 1, completedJobs: 0, failedJobs: 0, totalPodGroups: 1, allocatedGpu: 4, schedulerVersion: '1.0' }
    const result = buildVolcanoStatus(queues, jobs, podGroups, stats)
    expect(result.health).toBe('healthy')
    expect(result.queues).toHaveLength(1)
    expect(result.jobs).toHaveLength(1)
  })

  it('sets lastCheckTime to a valid ISO string', () => {
    const stats = { totalQueues: 0, openQueues: 0, totalJobs: 0, pendingJobs: 0, runningJobs: 0, completedJobs: 0, failedJobs: 0, totalPodGroups: 0, allocatedGpu: 0, schedulerVersion: 'unknown' }
    const result = buildVolcanoStatus([], [], [], stats)
    expect(new Date(result.lastCheckTime).toISOString()).toBe(result.lastCheckTime)
  })
})

// ---------------------------------------------------------------------------
// Fetcher function tests (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetchVolcanoStatus (via useCache fetcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: { health: 'not-installed', queues: [], jobs: [], podGroups: [], stats: { totalQueues: 0, openQueues: 0, totalJobs: 0, pendingJobs: 0, runningJobs: 0, completedJobs: 0, failedJobs: 0, totalPodGroups: 0, allocatedGpu: 0, schedulerVersion: 'unknown' }, summary: { totalQueues: 0, totalJobs: 0, totalPodGroups: 0, allocatedGpu: 0 }, lastCheckTime: '' },
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
    })
  })

  it('parses a successful API response into VolcanoStatusData', async () => {
    renderHook(() => useCachedVolcano())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          queues: [
            { name: 'default', state: 'Open', weight: 1, allocatedGpu: 4, pendingJobs: 0, runningJobs: 1, cluster: 'c1' },
          ],
          jobs: [
            { name: 'job1', namespace: 'ml', queue: 'default', phase: 'Running', minAvailable: 1, replicas: 2, createdAt: new Date().toISOString(), cluster: 'c1' },
          ],
          podGroups: [],
          stats: { schedulerVersion: '1.9.0' },
        }),
    })

    const result = await fetcher()
    expect(result.health).toBe('healthy')
    expect(result.queues).toHaveLength(1)
    expect(result.jobs).toHaveLength(1)
    expect(result.stats.schedulerVersion).toBe('1.9.0')
  })

  it('throws on non-ok response (non-404) so cache falls back to demo', async () => {
    renderHook(() => useCachedVolcano())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    await expect(fetcher()).rejects.toThrow('Unable to fetch Volcano status')
  })

  it('returns not-installed data on 404 (treated as empty)', async () => {
    renderHook(() => useCachedVolcano())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    const result = await fetcher()
    expect(result.health).toBe('not-installed')
    expect(result.queues).toEqual([])
  })

  it('throws on network error so cache falls back to demo', async () => {
    renderHook(() => useCachedVolcano())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockRejectedValueOnce(new Error('Network failure'))

    await expect(fetcher()).rejects.toThrow('Unable to fetch Volcano status')
  })

  it('handles empty body fields gracefully', async () => {
    renderHook(() => useCachedVolcano())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    })

    const result = await fetcher()
    expect(result.queues).toEqual([])
    expect(result.jobs).toEqual([])
    expect(result.podGroups).toEqual([])
  })
})
