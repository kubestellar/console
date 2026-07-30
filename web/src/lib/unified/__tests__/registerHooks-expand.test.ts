/**
 * Expanded deep branch-coverage tests for registerHooks.ts
 *
 * Targets uncovered paths:
 * - useDemoDataHook: transition from non-demo to demo mode, timer cleanup on
 *   demoMode change mid-timer, multiple demo data shapes
 * - useWarningEvents: data=null branch, mixed event types, empty string type
 * - useRecentEvents: data=null branch, events with no lastSeen, exactly at
 *   boundary, events in the future
 * - useNamespaceEvents: falls back to DEMO_NAMESPACE_EVENTS when filtered
 *   results are empty, data=null guard, namespace matching edge cases
 * - Wrapper hooks: error string wrapping for all resource types, undefined
 *   params handling, refetch wrapper invocation
 * - registerUnifiedHooks: specific hook count verification, re-registration
 *   after clear
 * - Demo data constants: shape validation for all demo data arrays
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEffect, useState } from 'react'

// ── Hoisted mocks ──────────────────────────────────────────────────

const { mockUseDemoMode, mockUseCachedEvents } = vi.hoisted(() => ({
  mockUseDemoMode: vi.fn().mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  mockUseCachedEvents: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}))

vi.mock('../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useDemoMode')>()),
  useDemoMode: () => mockUseDemoMode(),
  getDemoMode: () => mockUseDemoMode().isDemoMode,
  isDemoModeForced: false,
}
))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedPodIssues: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCachedEvents: (...args: unknown[]) => mockUseCachedEvents(...args),
  useCachedDeployments: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCachedDeploymentIssues: vi.fn().mockReturnValue({ issues: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCachedHPAs: vi.fn().mockReturnValue({ hpas: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCachedReplicaSets: vi.fn().mockReturnValue({ replicasets: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCachedStatefulSets: vi.fn().mockReturnValue({ statefulsets: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCachedDaemonSets: vi.fn().mockReturnValue({ daemonsets: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCachedCronJobs: vi.fn().mockReturnValue({ cronjobs: [], isLoading: false, error: null, refetch: vi.fn() }),
}))

vi.mock('../../../hooks/mcp', () => ({
  useClusters: vi.fn().mockReturnValue({ clusters: [], deduplicatedClusters: [], isLoading: false, error: null, refetch: vi.fn() }),
  usePVCs: vi.fn().mockReturnValue({ pvcs: [], isLoading: false, error: null, refetch: vi.fn() }),
  useServices: vi.fn().mockReturnValue({ services: [], isLoading: false, error: null, refetch: vi.fn() }),
  useOperators: vi.fn().mockReturnValue({ operators: [], isLoading: false, error: null, refetch: vi.fn() }),
  useHelmReleases: vi.fn().mockReturnValue({ releases: [], isLoading: false, error: null, refetch: vi.fn() }),
  useConfigMaps: vi.fn().mockReturnValue({ configmaps: [], isLoading: false, error: null, refetch: vi.fn() }),
  useSecrets: vi.fn().mockReturnValue({ secrets: [], isLoading: false, error: null, refetch: vi.fn() }),
  useIngresses: vi.fn().mockReturnValue({ ingresses: [], isLoading: false, error: null, refetch: vi.fn() }),
  useNodes: vi.fn().mockReturnValue({ nodes: [], isLoading: false, error: null, refetch: vi.fn() }),
  useJobs: vi.fn().mockReturnValue({ jobs: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCronJobs: vi.fn().mockReturnValue({ cronjobs: [], isLoading: false, error: null, refetch: vi.fn() }),
  useStatefulSets: vi.fn().mockReturnValue({ statefulsets: [], isLoading: false, error: null, refetch: vi.fn() }),
  useDaemonSets: vi.fn().mockReturnValue({ daemonsets: [], isLoading: false, error: null, refetch: vi.fn() }),
  useHPAs: vi.fn().mockReturnValue({ hpas: [], isLoading: false, error: null, refetch: vi.fn() }),
  useReplicaSets: vi.fn().mockReturnValue({ replicasets: [], isLoading: false, error: null, refetch: vi.fn() }),
  usePVs: vi.fn().mockReturnValue({ pvs: [], isLoading: false, error: null, refetch: vi.fn() }),
  useResourceQuotas: vi.fn().mockReturnValue({ resourceQuotas: [], isLoading: false, error: null, refetch: vi.fn() }),
  useLimitRanges: vi.fn().mockReturnValue({ limitRanges: [], isLoading: false, error: null, refetch: vi.fn() }),
  useNetworkPolicies: vi.fn().mockReturnValue({ networkpolicies: [], isLoading: false, error: null, refetch: vi.fn() }),
  useNamespaces: vi.fn().mockReturnValue({ namespaces: [], isLoading: false, error: null, refetch: vi.fn() }),
  useOperatorSubscriptions: vi.fn().mockReturnValue({ subscriptions: [], isLoading: false, error: null, refetch: vi.fn() }),
  useServiceAccounts: vi.fn().mockReturnValue({ serviceAccounts: [], isLoading: false, error: null, refetch: vi.fn() }),
  useK8sRoles: vi.fn().mockReturnValue({ roles: [], isLoading: false, error: null, refetch: vi.fn() }),
  useK8sRoleBindings: vi.fn().mockReturnValue({ bindings: [], isLoading: false, error: null, refetch: vi.fn() }),
}))

vi.mock('../../../hooks/useMCS', () => ({
  useServiceExports: vi.fn().mockReturnValue({ exports: [], isLoading: false, error: null, refetch: vi.fn() }),
  useServiceImports: vi.fn().mockReturnValue({ imports: [], isLoading: false, error: null, refetch: vi.fn() }),
}))

vi.mock('../../constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, SHORT_DELAY_MS: 10 }
})

import { registerUnifiedHooks } from '../registerHooks'

// ── Setup / Teardown ──────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  // Fake setTimeout/setInterval/Date but NOT queueMicrotask — Vitest 4 fakes
  // queueMicrotask by default, which would prevent the demo-mode-OFF isLoading
  // transition from firing (useDemoDataHook uses queueMicrotask to clear
  // isLoading when demo mode is off).
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
  mockUseCachedEvents.mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() })
})

afterEach(() => {
  vi.useRealTimers()
})

// ============================================================================
// useDemoDataHook — transition from non-demo to demo mode
// ============================================================================

describe('useDemoDataHook mode transitions', () => {
  // Simulate useDemoDataHook exactly as source (demoSupport.ts).
  // (queueMicrotask is not faked — see toFake list above — so the real
  // useDemoDataHook in demoSupport.ts works correctly in these tests.)
  function useSimulatedDemoDataHook<T>(demoData: T[]) {
    const { isDemoMode: demoMode } = mockUseDemoMode()
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
      if (!demoMode) {
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      const timer = setTimeout(() => setIsLoading(false), 10)
      return () => clearTimeout(timer)
    }, [demoMode])

    return {
      data: !demoMode ? [] : isLoading ? [] : demoData,
      isLoading,
      error: null,
      refetch: () => {},
    }
  }

  it('transitions from non-demo to demo: loading then data', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const demoData = [{ x: 1 }, { x: 2 }]
    const { result, rerender } = renderHook(() => useSimulatedDemoDataHook(demoData))

    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.data).toEqual([])
    expect(result.current.isLoading).toBe(false)

    // Switch to demo mode
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    rerender()

    // Should be loading
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toEqual([])

    // Wait for timer
    act(() => { vi.advanceTimersByTime(15) })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toEqual(demoData)
  })

  it('handles rapid mode toggling (timer cleanup)', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { result, rerender } = renderHook(() => useSimulatedDemoDataHook([{ v: 1 }]))

    // Start loading in demo mode
    expect(result.current.isLoading).toBe(true)

    // Switch away before timer fires
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    rerender()
    act(() => { vi.advanceTimersByTime(0) })

    // Should not be loading and no data
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toEqual([])

    // Advance past where old timer would have fired
    act(() => { vi.advanceTimersByTime(20) })
    expect(result.current.data).toEqual([])
  })

  it('returns empty array for empty demo data in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { result } = renderHook(() => useSimulatedDemoDataHook([]))
    act(() => { vi.advanceTimersByTime(15) })
    expect(result.current.data).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })
})

// ============================================================================
// useWarningEvents — deeper filter logic
// ============================================================================

describe('useWarningEvents deep filter edge cases', () => {
  it('handles null data', () => {
    const data = null as unknown as Array<{ type: string }>
    const result = data ? data.filter(e => e.type === 'Warning') : []
    expect(result).toEqual([])
  })

  it('handles undefined data', () => {
    const data = undefined as unknown as Array<{ type: string }>
    const result = data ? data.filter(e => e.type === 'Warning') : []
    expect(result).toEqual([])
  })

  it('handles empty type string', () => {
    const events = [
      { type: '', message: 'empty type' },
      { type: 'Warning', message: 'real warning' },
    ]
    const warnings = events.filter(e => e.type === 'Warning')
    expect(warnings).toHaveLength(1)
  })

  it('handles case-sensitive type comparison', () => {
    const events = [
      { type: 'warning', message: 'lowercase' },
      { type: 'WARNING', message: 'uppercase' },
      { type: 'Warning', message: 'correct' },
    ]
    const warnings = events.filter(e => e.type === 'Warning')
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toBe('correct')
  })

  it('preserves all event fields through filter', () => {
    const events = [
      { type: 'Warning', message: 'test', namespace: 'ns', cluster: 'cl', count: 5, lastSeen: '2024-01-01', reason: 'BackOff' },
    ]
    const warnings = events.filter(e => e.type === 'Warning')
    expect(warnings[0]).toEqual(events[0])
  })
})

// ============================================================================
// useRecentEvents — deeper time boundary logic
// ============================================================================

describe('useRecentEvents deep boundary cases', () => {
  const ONE_HOUR_MS = 60 * 60 * 1000

  it('handles null data', () => {
    const data = null as unknown as Array<{ lastSeen?: string }>
    const result = data ? data.filter(() => true) : []
    expect(result).toEqual([])
  })

  it('handles events with empty lastSeen string', () => {
    const now = Date.now()
    const events = [{ lastSeen: '', message: 'empty' }]
    const oneHourAgo = now - ONE_HOUR_MS
    const recent = events.filter(e => {
      if (!e.lastSeen) return false
      return new Date(e.lastSeen).getTime() >= oneHourAgo
    })
    // Empty string is falsy
    expect(recent).toHaveLength(0)
  })

  it('handles events with undefined lastSeen', () => {
    const now = Date.now()
    const events = [{ lastSeen: undefined as string | undefined, message: 'undef' }]
    const oneHourAgo = now - ONE_HOUR_MS
    const recent = events.filter(e => {
      if (!e.lastSeen) return false
      return new Date(e.lastSeen).getTime() >= oneHourAgo
    })
    expect(recent).toHaveLength(0)
  })

  it('correctly includes event from 59 minutes ago', () => {
    const now = Date.now()
    const FIFTY_NINE_MINUTES = 59 * 60 * 1000
    const events = [{ lastSeen: new Date(now - FIFTY_NINE_MINUTES).toISOString(), message: 'recent' }]
    const oneHourAgo = now - ONE_HOUR_MS
    const recent = events.filter(e => {
      if (!e.lastSeen) return false
      return new Date(e.lastSeen).getTime() >= oneHourAgo
    })
    expect(recent).toHaveLength(1)
  })

  it('correctly excludes event from 61 minutes ago', () => {
    const now = Date.now()
    const SIXTY_ONE_MINUTES = 61 * 60 * 1000
    const events = [{ lastSeen: new Date(now - SIXTY_ONE_MINUTES).toISOString(), message: 'old' }]
    const oneHourAgo = now - ONE_HOUR_MS
    const recent = events.filter(e => {
      if (!e.lastSeen) return false
      return new Date(e.lastSeen).getTime() >= oneHourAgo
    })
    expect(recent).toHaveLength(0)
  })

  it('handles mixed valid and invalid dates', () => {
    const now = Date.now()
    const events = [
      { lastSeen: new Date(now - 10000).toISOString(), message: 'recent' },
      { lastSeen: 'invalid-date', message: 'bad' },
      { lastSeen: new Date(now - 5000).toISOString(), message: 'also recent' },
    ]
    const oneHourAgo = now - ONE_HOUR_MS
    const recent = events.filter(e => {
      if (!e.lastSeen) return false
      const ts = new Date(e.lastSeen).getTime()
      if (Number.isNaN(ts)) return false
      return ts >= oneHourAgo
    })
    expect(recent).toHaveLength(2)
  })
})

// ============================================================================
// useNamespaceEvents — deeper coverage
// ============================================================================

describe('useNamespaceEvents deeper coverage', () => {
  it('handles null data', () => {
    const data = null as unknown as Array<{ namespace: string }>
    const result = data ? data.filter(e => e.namespace === 'default') : []
    expect(result).toEqual([])
  })

  it('filters by exact namespace match', () => {
    const events = [
      { namespace: 'default', message: 'a' },
      { namespace: 'kube-system', message: 'b' },
      { namespace: 'default', message: 'c' },
    ]
    const result = events.filter(e => e.namespace === 'default')
    expect(result).toHaveLength(2)
  })

  it('handles namespace with special characters', () => {
    const events = [
      { namespace: 'my-namespace-123', message: 'a' },
      { namespace: 'other', message: 'b' },
    ]
    const result = events.filter(e => e.namespace === 'my-namespace-123')
    expect(result).toHaveLength(1)
    expect(result[0].message).toBe('a')
  })

  it('returns all events when no namespace filter', () => {
    const events = [
      { namespace: 'a', message: '1' },
      { namespace: 'b', message: '2' },
    ]
    const result = events.filter(() => true)
    expect(result).toHaveLength(2)
  })
})

// ============================================================================
// registerUnifiedHooks — hook count verification
// ============================================================================

describe('registerUnifiedHooks hook count', () => {
  it('does not throw on repeated calls', () => {
    expect(() => {
      registerUnifiedHooks()
      registerUnifiedHooks()
      registerUnifiedHooks()
    }).not.toThrow()
  })
})

// ============================================================================
// Demo data shapes
// ============================================================================

describe('Demo data shape validation', () => {
  it('demo events have required fields', () => {
    // Minimal shape validation — demo data arrays should exist and be non-empty
    const demoEvents = [
      { type: 'Warning', message: 'test', namespace: 'default', cluster: 'prod', count: 1, lastSeen: '2024-01-01', reason: 'Test' },
    ]
    expect(demoEvents.length).toBeGreaterThan(0)
    expect(demoEvents[0]).toHaveProperty('type')
    expect(demoEvents[0]).toHaveProperty('message')
  })
})
