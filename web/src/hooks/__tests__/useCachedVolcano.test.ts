import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
    useCache: (args: any) => mockUseCache(args),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../useDemoMode', () => ({
    createCachedHook: vi.fn(),
    useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
    isDemoModeForced: () => false,
    canToggleDemoMode: () => true,
    isNetlifyDeployment: () => false,
    isDemoToken: () => false,
    hasRealToken: () => true,
    setDemoToken: vi.fn(),
    getDemoMode: () => false,
    setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../components/cards/CardDataContext', () => ({
    createCachedHook: vi.fn(),
    useCardLoadingState: () => ({ showSkeleton: false, showEmptyState: false }),
}))

import { useCachedVolcano, __testables } from '../useCachedVolcano'
import {
    VOLCANO_DEMO_DATA,
    type VolcanoQueue,
    type VolcanoJob,
    type VolcanoPodGroup,
    type VolcanoStats,
} from '../../components/cards/volcano_status/demoData'

const { summarize, deriveHealth, deriveStatsFromLists, buildVolcanoStatus } = __testables

const makeQueue = (overrides: Partial<VolcanoQueue> = {}): VolcanoQueue => ({
    name: 'default',
    state: 'Open',
    weight: 1,
    runningJobs: 0,
    pendingJobs: 0,
    allocatedCpu: 0,
    allocatedMemGiB: 0,
    allocatedGpu: 2,
    capabilityCpu: 0,
    capabilityMemGiB: 0,
    capabilityGpu: 4,
    cluster: 'c1',
    ...overrides,
})

const makeJob = (overrides: Partial<VolcanoJob> = {}): VolcanoJob => ({
    name: 'train-job',
    namespace: 'ml',
    queue: 'default',
    phase: 'Running',
    minAvailable: 1,
    replicas: 1,
    runningTasks: 1,
    pendingTasks: 0,
    failedTasks: 0,
    succeededTasks: 0,
    creationTime: new Date().toISOString(),
    cluster: 'c1',
    ...overrides,
})

const makePodGroup = (overrides: Partial<VolcanoPodGroup> = {}): VolcanoPodGroup => ({
    name: 'pg-1',
    namespace: 'ml',
    phase: 'Running',
    minMember: 1,
    currentMembers: 1,
    queue: 'default',
    cluster: 'c1',
    ...overrides,
})

const EMPTY_STATS: VolcanoStats = {
    totalQueues: 0, openQueues: 0, totalJobs: 0, pendingJobs: 0,
    runningJobs: 0, completedJobs: 0, failedJobs: 0, totalPodGroups: 0,
    allocatedGpu: 0, schedulerVersion: 'unknown',
}

const makeCacheResult = (overrides: Record<string, unknown> = {}) => ({
    data: { health: 'not-installed', queues: [], jobs: [], podGroups: [], stats: EMPTY_STATS, summary: { totalQueues: 0, totalJobs: 0, totalPodGroups: 0, allocatedGpu: 0 }, lastCheckTime: '' },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: 123456789,
    refetch: vi.fn(),
    ...overrides,
})

describe('useCachedVolcano', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockIsDemoMode.mockReturnValue(false)
        mockUseCache.mockReturnValue(makeCacheResult())
    })

    it('returns data from cache when not in demo mode', () => {
        const { result } = renderHook(() => useCachedVolcano())
        expect(result.current.data.health).toBe('not-installed')
        expect(result.current.isDemoData).toBe(false)
    })

    it('returns demo data when demo mode is enabled', () => {
        mockIsDemoMode.mockReturnValue(true)
        mockUseCache.mockReturnValue(makeCacheResult({ data: VOLCANO_DEMO_DATA, isDemoFallback: true }))
        const { result } = renderHook(() => useCachedVolcano())
        expect(result.current.isDemoData).toBe(true)
        expect((result.current.data.queues || []).length).toBeGreaterThan(0)
    })

    it('respects isLoading state — isDemoData false during loading', () => {
        mockUseCache.mockReturnValue(makeCacheResult({ isLoading: true, isDemoFallback: true, lastRefresh: null }))
        const { result } = renderHook(() => useCachedVolcano())
        expect(result.current.isLoading).toBe(true)
        expect(result.current.isDemoData).toBe(false)
    })
})

describe('__testables.summarize', () => {
    it('returns zeroed summary for empty lists', () => {
        const s = summarize([], [], [], EMPTY_STATS)
        expect(s.totalQueues).toBe(0)
        expect(s.totalJobs).toBe(0)
        expect(s.totalPodGroups).toBe(0)
        expect(s.allocatedGpu).toBe(0)
    })

    it('counts queues, jobs, pod groups, and GPU from stats', () => {
        const s = summarize([makeQueue()], [makeJob()], [makePodGroup()], { ...EMPTY_STATS, allocatedGpu: 4 })
        expect(s.totalQueues).toBe(1)
        expect(s.totalJobs).toBe(1)
        expect(s.totalPodGroups).toBe(1)
        expect(s.allocatedGpu).toBe(4)
    })
})

describe('__testables.deriveHealth', () => {
    it('returns not-installed for empty queues and jobs', () => {
        expect(deriveHealth([], [])).toBe('not-installed')
    })

    it('returns healthy when no failed jobs', () => {
        expect(deriveHealth([makeQueue()], [makeJob()])).toBe('healthy')
    })

    it('returns degraded when any job is Failed', () => {
        expect(deriveHealth([makeQueue()], [makeJob({ phase: 'Failed' })])).toBe('degraded')
    })
})

describe('__testables.deriveStatsFromLists', () => {
    it('derives stats from lists', () => {
        const queues = [makeQueue({ state: 'Open', allocatedGpu: 4 })]
        const jobs = [makeJob({ phase: 'Running' }), makeJob({ phase: 'Pending' })]
        const podGroups = [makePodGroup()]
        const s = deriveStatsFromLists(queues, jobs, podGroups, undefined)
        expect(s.totalQueues).toBe(1)
        expect(s.openQueues).toBe(1)
        expect(s.runningJobs).toBe(1)
        expect(s.pendingJobs).toBe(1)
        expect(s.allocatedGpu).toBe(4)
    })

    it('prefers partial overrides when provided', () => {
        const s = deriveStatsFromLists([makeQueue()], [], [], { totalQueues: 99 })
        expect(s.totalQueues).toBe(99)
    })
})

describe('__testables.buildVolcanoStatus', () => {
    it('builds complete status', () => {
        const status = buildVolcanoStatus([makeQueue()], [makeJob()], [makePodGroup()], { ...EMPTY_STATS, allocatedGpu: 2 })
        expect(status.health).toBe('healthy')
        expect(status.queues).toHaveLength(1)
        expect(status.jobs).toHaveLength(1)
    })

    it('returns not-installed for empty data', () => {
        expect(buildVolcanoStatus([], [], [], EMPTY_STATS).health).toBe('not-installed')
    })
})
