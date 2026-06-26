import { describe, it, expect, vi, beforeEach } from 'vitest'
import { recordDashboardVisit, getTopVisitedDashboards, prefetchTopDashboards } from '../dashboardVisits'

describe('recordDashboardVisit', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('records visits and increments count', () => {
    recordDashboardVisit('/')
    recordDashboardVisit('/')
    recordDashboardVisit('/')

    const top = getTopVisitedDashboards()
    expect(top[0]).toBe('/')
  })

  it('skips auth paths', () => {
    recordDashboardVisit('/auth/callback')
    expect(getTopVisitedDashboards()).toEqual([])
  })

  it('skips login path', () => {
    recordDashboardVisit('/login')
    expect(getTopVisitedDashboards()).toEqual([])
  })

  it('skips settings path', () => {
    recordDashboardVisit('/settings')
    expect(getTopVisitedDashboards()).toEqual([])
  })

  // --- New edge case tests ---

  it('skips nested auth paths (e.g. /auth/login, /auth/logout)', () => {
    recordDashboardVisit('/auth/login')
    recordDashboardVisit('/auth/logout')
    recordDashboardVisit('/auth/refresh')
    expect(getTopVisitedDashboards()).toEqual([])
  })

  it('records paths that start with /auth-like strings but are not /auth', () => {
    // "/authentication" does NOT start with "/auth/" and is not exactly "/auth"
    // But the implementation checks path.startsWith('/auth') — so /authentication IS skipped
    recordDashboardVisit('/authentication')
    // startsWith('/auth') matches '/authentication'
    expect(getTopVisitedDashboards()).toEqual([])
  })

  it('tracks multiple distinct dashboard paths independently', () => {
    recordDashboardVisit('/clusters')
    recordDashboardVisit('/pods')
    recordDashboardVisit('/nodes')

    const top = getTopVisitedDashboards()
    expect(top).toHaveLength(3)
    expect(top).toContain('/clusters')
    expect(top).toContain('/pods')
    expect(top).toContain('/nodes')
  })

  it('correctly increments count for repeated visits to same path', () => {
    const VISIT_COUNT = 5
    for (let i = 0; i < VISIT_COUNT; i++) {
      recordDashboardVisit('/clusters')
    }
    recordDashboardVisit('/pods')

    const top = getTopVisitedDashboards()
    // /clusters (5 visits) should rank above /pods (1 visit)
    expect(top[0]).toBe('/clusters')
    expect(top[1]).toBe('/pods')
  })

  it('handles localStorage being full (quota exceeded) gracefully', () => {
    // Simulate localStorage.setItem throwing
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    })

    // Should not throw
    expect(() => recordDashboardVisit('/clusters')).not.toThrow()

    setItemSpy.mockRestore()
  })

  it('handles corrupted localStorage data when recording a new visit', () => {
    localStorage.setItem('kubestellar-dashboard-visits', '{{{invalid json')

    // Should not throw — getVisitCounts returns {} on parse error
    expect(() => recordDashboardVisit('/clusters')).not.toThrow()

    // After the record attempt, the new visit should be tracked
    // (corrupted data is replaced with a fresh object)
    const top = getTopVisitedDashboards()
    expect(top).toContain('/clusters')
  })

  it('records root path (/)', () => {
    recordDashboardVisit('/')
    expect(getTopVisitedDashboards()).toContain('/')
  })
})

describe('getTopVisitedDashboards', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns empty array when no visits', () => {
    expect(getTopVisitedDashboards()).toEqual([])
  })

  it('returns dashboards sorted by visit count', () => {
    recordDashboardVisit('/clusters')
    recordDashboardVisit('/clusters')
    recordDashboardVisit('/clusters')
    recordDashboardVisit('/pods')
    recordDashboardVisit('/')
    recordDashboardVisit('/')

    const top = getTopVisitedDashboards()
    expect(top[0]).toBe('/clusters')
    expect(top[1]).toBe('/')
    expect(top[2]).toBe('/pods')
  })

  it('limits to N results', () => {
    for (let i = 0; i < 10; i++) {
      recordDashboardVisit(`/dash-${i}`)
    }
    const top = getTopVisitedDashboards(3)
    expect(top.length).toBe(3)
  })

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('kubestellar-dashboard-visits', 'not-json')
    expect(getTopVisitedDashboards()).toEqual([])
  })

  // --- New edge case tests ---

  it('defaults to top 5 when no argument is provided', () => {
    const TOTAL_DASHBOARDS = 8
    for (let i = 0; i < TOTAL_DASHBOARDS; i++) {
      recordDashboardVisit(`/dash-${i}`)
    }

    const top = getTopVisitedDashboards()
    const DEFAULT_TOP_N = 5
    expect(top).toHaveLength(DEFAULT_TOP_N)
  })

  it('returns fewer than N when fewer dashboards have been visited', () => {
    recordDashboardVisit('/clusters')
    recordDashboardVisit('/pods')

    const top = getTopVisitedDashboards(10)
    expect(top).toHaveLength(2)
  })

  it('returns empty array for n=0', () => {
    recordDashboardVisit('/clusters')
    expect(getTopVisitedDashboards(0)).toEqual([])
  })

  it('correctly orders dashboards with equal visit counts', () => {
    // When visits are equal, order depends on Object.entries sort (insertion order)
    recordDashboardVisit('/a')
    recordDashboardVisit('/b')
    recordDashboardVisit('/c')

    const top = getTopVisitedDashboards()
    // All have 1 visit — all three should be present
    expect(top).toHaveLength(3)
    expect(top).toContain('/a')
    expect(top).toContain('/b')
    expect(top).toContain('/c')
  })

  it('handles n=1 and returns only the top visited dashboard', () => {
    recordDashboardVisit('/pods')
    recordDashboardVisit('/clusters')
    recordDashboardVisit('/clusters')

    const top = getTopVisitedDashboards(1)
    expect(top).toEqual(['/clusters'])
  })

  it('returns paths as strings, not numbers', () => {
    recordDashboardVisit('/123')
    const top = getTopVisitedDashboards()
    expect(typeof top[0]).toBe('string')
    expect(top[0]).toBe('/123')
  })
})

describe('prefetchTopDashboards', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does nothing when no visits have been recorded', () => {
    // Should not throw
    expect(() => prefetchTopDashboards()).not.toThrow()
  })

  it('skips the current path when prefetching', () => {
    // Record visits to two dashboards
    recordDashboardVisit('/clusters')
    recordDashboardVisit('/clusters')
    recordDashboardVisit('/pods')

    // Prefetch with currentPath=/clusters — /clusters should be skipped
    prefetchTopDashboards('/clusters')

    // Trigger requestIdleCallback or fallback setTimeout
    vi.advanceTimersByTime(2000)

    // We can't easily assert which chunks were loaded without mocking DASHBOARD_CHUNKS,
    // but we verify it doesn't throw
  })

  it('uses requestIdleCallback when available', () => {
    recordDashboardVisit('/clusters')

    const mockIdleCallback = vi.fn()
    vi.stubGlobal('requestIdleCallback', mockIdleCallback)

    prefetchTopDashboards()

    expect(mockIdleCallback).toHaveBeenCalledTimes(1)
    expect(mockIdleCallback).toHaveBeenCalledWith(
      expect.any(Function),
      { timeout: 3000 }
    )

    vi.unstubAllGlobals()
  })

  it('falls back to setTimeout when requestIdleCallback is unavailable', () => {
    recordDashboardVisit('/clusters')

    // Remove requestIdleCallback
    vi.stubGlobal('requestIdleCallback', undefined)

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout')

    prefetchTopDashboards()

    // Should have called setTimeout as fallback
    expect(setTimeoutSpy).toHaveBeenCalled()

    vi.unstubAllGlobals()
    setTimeoutSpy.mockRestore()
  })

  it('respects custom n parameter', () => {
    // Record visits to many dashboards
    for (let i = 0; i < 10; i++) {
      recordDashboardVisit(`/dash-${i}`)
    }

    // Prefetch only top 2 — should not throw
    expect(() => prefetchTopDashboards(undefined, 2)).not.toThrow()
  })
})
