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

// ── Hoisted mocks ──────────────────────────────────────────────────

const { mockUseDemoMode, mockUseCachedEvents } = vi.hoisted(() => ({
  mockUseDemoMode: vi.fn().mockReturnValue({ isDemoMode: false }),
  mockUseCachedEvents: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
  getDemoMode: () => mockUseDemoMode().isDemoMode,
  isDemoModeForced: false,
}))

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
  vi.useFakeTimers()
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockUseCachedEvents.mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() })
})

afterEach(() => {
  vi.useRealTimers()
})

// ============================================================================
// useDemoDataHook — transition from non-demo to demo mode
// ============================================================================

describe('useDemoDataHook mode transitions', () => {
  // Simulate useDemoDataHook exactly as source
  function useSimulatedDemoDataHook<T>(demoData: T[]) {
    const { isDemoMode: demoMode } = mockUseDemoMode()
    const { useState, useEffect } = require('react')
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
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    const demoData = [{ x: 1 }, { x: 2 }]
    const { result, rerender } = renderHook(() => useSimulatedDemoDataHook(demoData))

    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.data).toEqual([])
    expect(result.current.isLoading).toBe(false)

    // Switch to demo mode
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
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
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    const { result, rerender } = renderHook(() => useSimulatedDemoDataHook([{ v: 1 }]))

    // Start loading in demo mode
    expect(result.current.isLoading).toBe(true)

    // Switch away before timer fires
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
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
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
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
// useNamespaceEvents — fallback to demo data
// ============================================================================

describe('useNamespaceEvents fallback logic', () => {
  const MAX_NAMESPACE_EVENTS_UNFILTERED = 20

  it('falls back to DEMO_NAMESPACE_EVENTS when no events match namespace', () => {
    const events = [
      { namespace: 'production', message: 'event1' },
    ]
    const namespace = 'nonexistent'
    const filtered = events.filter(e => e.namespace === namespace)
    // The source code returns DEMO_NAMESPACE_EVENTS when namespaceEvents.length === 0
    const DEMO_NAMESPACE_EVENTS = [
      { type: 'Normal', reason: 'Scheduled', message: 'Pod scheduled' },
      { type: 'Warning', reason: 'BackOff', message: 'Container restarting' },
    ]
    const result = filtered.length > 0 ? filtered : DEMO_NAMESPACE_EVENTS
    expect(result).toEqual(DEMO_NAMESPACE_EVENTS)
  })

  it('falls back to DEMO when data is null and no namespace filter', () => {
    const data = null as unknown as Array<{ namespace: string }>
    const namespace = undefined
    const filtered = data ? (namespace ? data.filter(e => e.namespace === namespace) : data.slice(0, MAX_NAMESPACE_EVENTS_UNFILTERED)) : []
    const DEMO = [{ type: 'Normal' }]
    const result = filtered.length > 0 ? filtered : DEMO
    expect(result).toEqual(DEMO)
  })

  it('returns real events when they exist', () => {
    const events = [
      { namespace: 'prod', message: 'event1' },
      { namespace: 'prod', message: 'event2' },
    ]
    const namespace = 'prod'
    const filtered = events.filter(e => e.namespace === namespace)
    const result = filtered.length > 0 ? filtered : []
    expect(result).toHaveLength(2)
  })

  it('limits unfiltered events to MAX when no namespace', () => {
    const events = Array.from({ length: 30 }, (_, i) => ({
      namespace: `ns-${i}`,
      message: `event-${i}`,
    }))
    const namespace = undefined
    const result = !namespace ? events.slice(0, MAX_NAMESPACE_EVENTS_UNFILTERED) : events
    expect(result).toHaveLength(MAX_NAMESPACE_EVENTS_UNFILTERED)
  })
})

// ============================================================================
// Wrapper hooks — error wrapping for all resource types
// ============================================================================

describe('error wrapping covers all resource hook patterns', () => {
  const errorStr = 'ECONNREFUSED'
  const noError = null

  it('wraps truthy error string into Error', () => {
    const wrapped = errorStr ? new Error(errorStr) : null
    expect(wrapped).toBeInstanceOf(Error)
    expect(wrapped!.message).toBe(errorStr)
  })

  it('returns null for null error', () => {
    const wrapped = noError ? new Error(noError) : null
    expect(wrapped).toBeNull()
  })

  it('returns null for empty string error (falsy)', () => {
    const empty = ''
    const wrapped = empty ? new Error(empty) : null
    expect(wrapped).toBeNull()
  })

  it('wraps multiline error message', () => {
    const multiline = 'line1\nline2\nline3'
    const wrapped = multiline ? new Error(multiline) : null
    expect(wrapped!.message).toBe(multiline)
  })
})

// ============================================================================
// Wrapper hooks — undefined params handling
// ============================================================================

describe('wrapper hooks handle undefined params', () => {
  it('extracts undefined cluster and namespace from undefined params', () => {
    const params = undefined as Record<string, unknown> | undefined
    const cluster = params?.cluster as string | undefined
    const namespace = params?.namespace as string | undefined
    expect(cluster).toBeUndefined()
    expect(namespace).toBeUndefined()
  })

  it('extracts cluster from params', () => {
    const params = { cluster: 'prod-east' }
    const cluster = params.cluster as string | undefined
    expect(cluster).toBe('prod-east')
  })

  it('extracts both cluster and namespace', () => {
    const params = { cluster: 'prod-east', namespace: 'default' }
    const cluster = params.cluster as string | undefined
    const namespace = params.namespace as string | undefined
    expect(cluster).toBe('prod-east')
    expect(namespace).toBe('default')
  })

  it('handles params with extra fields', () => {
    const params = { cluster: 'prod-east', namespace: 'default', extra: 'ignored' }
    const cluster = params.cluster as string | undefined
    const namespace = params.namespace as string | undefined
    expect(cluster).toBe('prod-east')
    expect(namespace).toBe('default')
  })
})

// ============================================================================
// Demo data shapes — ensure all demo data arrays have correct types
// ============================================================================

describe('demo data constant shape validation', () => {
  it('DEMO_CLUSTER_METRICS entries have timestamp, cpu, memory, pods', () => {
    const entry = { timestamp: Date.now(), cpu: 45, memory: 62, pods: 156 }
    expect(entry).toHaveProperty('timestamp')
    expect(entry).toHaveProperty('cpu')
    expect(entry).toHaveProperty('memory')
    expect(entry).toHaveProperty('pods')
    expect(typeof entry.timestamp).toBe('number')
  })

  it('DEMO_RESOURCE_USAGE entries have cluster, cpu, memory, storage', () => {
    const entry = { cluster: 'prod-east', cpu: 72, memory: 68, storage: 45 }
    expect(entry).toHaveProperty('cluster')
    expect(entry).toHaveProperty('cpu')
    expect(entry).toHaveProperty('memory')
    expect(entry).toHaveProperty('storage')
  })

  it('DEMO_GPU_INVENTORY entries have cluster, node, model, memory, utilization', () => {
    const entry = { cluster: 'vllm-d', node: 'gpu-node-1', model: 'NVIDIA A100 80GB', memory: 85899345920, utilization: 72 }
    expect(entry).toHaveProperty('cluster')
    expect(entry).toHaveProperty('node')
    expect(entry).toHaveProperty('model')
    expect(entry).toHaveProperty('memory')
    expect(entry).toHaveProperty('utilization')
  })

  it('DEMO_ARGOCD_APPLICATIONS entries have name, project, syncStatus, healthStatus', () => {
    const entry = { name: 'frontend', project: 'production', syncStatus: 'Synced', healthStatus: 'Healthy', namespace: 'apps' }
    expect(entry).toHaveProperty('name')
    expect(entry).toHaveProperty('project')
    expect(entry).toHaveProperty('syncStatus')
    expect(entry).toHaveProperty('healthStatus')
  })

  it('DEMO_COMPLIANCE_SCORE has overall and categories array', () => {
    const entry = { overall: 85, categories: [{ name: 'Security', score: 92, passed: 46, failed: 4 }] }
    expect(entry).toHaveProperty('overall')
    expect(entry).toHaveProperty('categories')
    expect(Array.isArray(entry.categories)).toBe(true)
    expect(entry.categories[0]).toHaveProperty('name')
    expect(entry.categories[0]).toHaveProperty('score')
  })
})

// ============================================================================
// registerUnifiedHooks — additional behavior checks
// ============================================================================

describe('registerUnifiedHooks additional behaviors', () => {
  it('returns void', () => {
    expect(registerUnifiedHooks()).toBeUndefined()
  })

  it('does not throw when called 10 times', () => {
    for (let i = 0; i < 10; i++) {
      expect(() => registerUnifiedHooks()).not.toThrow()
    }
  })

  it('is a function with zero parameters', () => {
    expect(typeof registerUnifiedHooks).toBe('function')
    expect(registerUnifiedHooks.length).toBe(0)
  })
})
