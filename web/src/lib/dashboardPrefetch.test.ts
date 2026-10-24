import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PREFETCH_IDLE_TIMEOUT_MS, prefetchTopDashboards } from './dashboardPrefetch'

const TOP_PATHS = ['/clusters', '/workloads']

vi.mock('./dashboardVisits', () => ({
  getTopVisitedDashboards: vi.fn(() => TOP_PATHS),
  DEFAULT_TOP_N: 5,
}))

const clustersLoader = vi.fn(() => Promise.resolve({}))
const workloadsLoader = vi.fn(() => Promise.resolve({}))

vi.mock('./dashboardChunks', () => ({
  DASHBOARD_CHUNKS: {
    get clusters() {
      return clustersLoader
    },
    get workloads() {
      return workloadsLoader
    },
  },
}))

vi.mock('./logger', () => ({
  logger: { warn: vi.fn() },
}))

import { getTopVisitedDashboards } from './dashboardVisits'
import { logger } from './logger'

describe('prefetchTopDashboards', () => {
  let originalRIC: typeof requestIdleCallback | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    originalRIC = globalThis.requestIdleCallback
  })

  afterEach(() => {
    if (originalRIC) {
      globalThis.requestIdleCallback = originalRIC
    } else {
      // @ts-expect-error - cleaning up a test-only global
      delete globalThis.requestIdleCallback
    }
    vi.useRealTimers()
  })

  it('does nothing when there are no top-visited dashboards', () => {
    vi.mocked(getTopVisitedDashboards).mockReturnValueOnce([])
    // @ts-expect-error - stub to detect accidental invocation
    globalThis.requestIdleCallback = vi.fn()
    prefetchTopDashboards()
    expect(globalThis.requestIdleCallback).not.toHaveBeenCalled()
  })

  it('prefetches via requestIdleCallback when available, skipping the current path', () => {
    let callback: (() => void) | undefined
    // @ts-expect-error - minimal stub matching the subset used by the module
    globalThis.requestIdleCallback = vi.fn((cb: () => void, opts?: { timeout: number }) => {
      expect(opts).toEqual({ timeout: PREFETCH_IDLE_TIMEOUT_MS })
      callback = cb
      return 1
    })

    prefetchTopDashboards('/clusters')
    expect(callback).toBeDefined()
    callback!()

    expect(clustersLoader).not.toHaveBeenCalled()
    expect(workloadsLoader).toHaveBeenCalledTimes(1)
  })

  it('falls back to setTimeout when requestIdleCallback is unavailable', () => {
    // @ts-expect-error - simulate an environment without requestIdleCallback
    delete globalThis.requestIdleCallback
    vi.useFakeTimers()

    prefetchTopDashboards()
    vi.runAllTimers()

    expect(clustersLoader).toHaveBeenCalledTimes(1)
    expect(workloadsLoader).toHaveBeenCalledTimes(1)
  })

  it('logs a warning when a chunk loader rejects', async () => {
    let callback: (() => void) | undefined
    // @ts-expect-error - minimal stub matching the subset used by the module
    globalThis.requestIdleCallback = vi.fn((cb: () => void) => {
      callback = cb
      return 1
    })
    const error = new Error('boom')
    clustersLoader.mockReturnValueOnce(Promise.reject(error))

    prefetchTopDashboards()
    callback!()
    await Promise.resolve()
    await Promise.resolve()

    expect(logger.warn).toHaveBeenCalledWith('Failed to prefetch dashboard chunk for /clusters:', error)
  })

  it('ignores top-visited paths with no matching chunk', () => {
    vi.mocked(getTopVisitedDashboards).mockReturnValueOnce(['/unknown-path'])
    let callback: (() => void) | undefined
    // @ts-expect-error - minimal stub matching the subset used by the module
    globalThis.requestIdleCallback = vi.fn((cb: () => void) => {
      callback = cb
      return 1
    })

    prefetchTopDashboards()
    callback!()

    expect(clustersLoader).not.toHaveBeenCalled()
    expect(workloadsLoader).not.toHaveBeenCalled()
  })
})
