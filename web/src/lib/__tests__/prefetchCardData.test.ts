/**
 * Tests for prefetchCardData.ts — the startup data prefetcher.
 *
 * Mocks isDemoMode + prefetchCache + the coreFetchers/specialtyFetchers
 * so we test the flow logic (demo short-circuit, tiered scheduling,
 * idempotency) without hitting real APIs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockPrefetchCache = vi.fn().mockResolvedValue(undefined)
const mockIsDemoMode = vi.fn(() => false)

vi.mock('../cache', () => ({
  prefetchCache: (...a: unknown[]) => mockPrefetchCache(...a),
}))

vi.mock('../demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../hooks/useCachedData', () => ({
  coreFetchers: {
    pods: vi.fn().mockResolvedValue([]),
    podIssues: vi.fn().mockResolvedValue([]),
    events: vi.fn().mockResolvedValue([]),
    deploymentIssues: vi.fn().mockResolvedValue([]),
    deployments: vi.fn().mockResolvedValue([]),
    services: vi.fn().mockResolvedValue([]),
    workloads: vi.fn().mockResolvedValue([]),
    securityIssues: vi.fn().mockResolvedValue([]),
  },
  specialtyFetchers: {
    prowJobs: vi.fn().mockResolvedValue([]),
    llmdServers: vi.fn().mockResolvedValue([]),
    llmdModels: vi.fn().mockResolvedValue([]),
  },
}))

async function importFresh() {
  vi.resetModules()
  return import('../prefetchCardData')
}

describe('prefetchCardData', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockPrefetchCache.mockClear()
    mockIsDemoMode.mockReturnValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls prefetchCache for priority entries immediately', async () => {
    const mod = await importFresh()
    mod.prefetchCardData()
    // Priority entries fire synchronously (no setTimeout)
    await vi.runAllTimersAsync()
    expect(mockPrefetchCache).toHaveBeenCalled()
  })

  it('is idempotent — second call is a no-op', async () => {
    const mod = await importFresh()
    mod.prefetchCardData()
    const countAfterFirst = mockPrefetchCache.mock.calls.length
    mod.prefetchCardData()
    await vi.runAllTimersAsync()
    // Count should not have doubled
    expect(mockPrefetchCache.mock.calls.length).toBeLessThanOrEqual(countAfterFirst + 10)
  })

  it('skips all fetching in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const mod = await importFresh()
    mod.prefetchCardData()
    await vi.runAllTimersAsync()
    expect(mockPrefetchCache).not.toHaveBeenCalled()
  })

  it('schedules core/background/specialty entries via setTimeout tiers', async () => {
    const mod = await importFresh()
    mod.prefetchCardData()

    // Before any timers fire, only priority tier ran
    const initialCalls = mockPrefetchCache.mock.calls.length

    // Advance past all tier delays
    await vi.advanceTimersByTimeAsync(5000)

    // Should have more calls now (core + background + specialty tiers)
    expect(mockPrefetchCache.mock.calls.length).toBeGreaterThan(initialCalls)
  })
})
