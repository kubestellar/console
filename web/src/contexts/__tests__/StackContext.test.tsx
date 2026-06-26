/**
 * StackContext Tests
 *
 * Exercises the StackProvider, useStack hook, useOptionalStack hook,
 * demo mode behavior, stack selection/persistence, auto-selection logic,
 * helper methods (getStackById, healthyStacks, disaggregatedStacks),
 * and cluster filtering behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { LLMdStack, LLMdStackComponent } from '../../hooks/useStackDiscovery'

// ── Mock state ────────────────────────────────────────────────────────────

let mockIsDemoMode = true
let mockDiscoveredStacks: LLMdStack[] = []
let mockIsLoading = false
let mockError: string | null = null
const mockRefetch = vi.fn()
let mockLastRefresh: Date | null = null
let mockDeduplicatedClusters: Array<{ name: string; reachable?: boolean }> = []

vi.mock('../../hooks/useStackDiscovery', () => ({
  useStackDiscovery: () => ({
    stacks: mockDiscoveredStacks,
    isLoading: mockIsLoading,
    error: mockError,
    refetch: mockRefetch,
    lastRefresh: mockLastRefresh,
  }),
}))

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode }),
}))

vi.mock('../../hooks/mcp/clusters', () => ({
  useClusters: () => ({ deduplicatedClusters: mockDeduplicatedClusters }),
}))

// ── Import after mocks ───────────────────────────────────────────────────

import { StackProvider, useStack, useOptionalStack } from '../StackContext'

// ── Helpers ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'kubestellar-llmd-stack'

function wrapper({ children }: { children: ReactNode }) {
  return <StackProvider>{children}</StackProvider>
}

/** Create a minimal LLMdStackComponent for testing. */
function createComponent(
  name: string,
  namespace: string,
  cluster: string,
  type: LLMdStackComponent['type'],
  replicas: number,
  status: LLMdStackComponent['status'] = 'running'
): LLMdStackComponent {
  return {
    name,
    namespace,
    cluster,
    type,
    status,
    replicas,
    readyReplicas: status === 'running' ? replicas : 0,
    model: 'test-model',
  }
}

/** Create a minimal LLMdStack for testing. */
function createStack(overrides: Partial<LLMdStack> = {}): LLMdStack {
  const id = overrides.id ?? 'test-ns@test-cluster'
  const cluster = overrides.cluster ?? 'test-cluster'
  const namespace = overrides.namespace ?? 'test-ns'
  return {
    id,
    name: overrides.name ?? namespace,
    namespace,
    cluster,
    components: overrides.components ?? {
      prefill: [],
      decode: [],
      both: [createComponent('server-0', namespace, cluster, 'both', 2)],
      epp: createComponent('epp-0', namespace, cluster, 'epp', 1),
      gateway: createComponent('gw-0', namespace, cluster, 'gateway', 1),
    },
    status: overrides.status ?? 'healthy',
    hasDisaggregation: overrides.hasDisaggregation ?? false,
    model: overrides.model ?? 'TestModel-7B',
    totalReplicas: overrides.totalReplicas ?? 4,
    readyReplicas: overrides.readyReplicas ?? 4,
    autoscaler: overrides.autoscaler,
    inferencePool: overrides.inferencePool,
  }
}

// ── Setup / Teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear()
  mockIsDemoMode = true
  mockDiscoveredStacks = []
  mockIsLoading = false
  mockError = null
  mockLastRefresh = null
  mockDeduplicatedClusters = []
  mockRefetch.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('StackContext', () => {
  // ── 1. Context availability ──────────────────────────────────────────

  it('throws when useStack is called outside StackProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useStack())).toThrow(
      'useStack must be used within a StackProvider'
    )
    spy.mockRestore()
  })

  it('returns null from useOptionalStack when outside provider', () => {
    const { result } = renderHook(() => useOptionalStack())
    expect(result.current).toBeNull()
  })

  it('returns context value from useOptionalStack when inside provider', () => {
    const { result } = renderHook(() => useOptionalStack(), { wrapper })
    expect(result.current).not.toBeNull()
    expect(result.current!.stacks).toBeDefined()
  })

  // ── 2. Demo mode provides demo stacks ───────────────────────────────

  it('provides demo stacks when in demo mode', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.stacks.length).toBeGreaterThan(0)
    expect(result.current.isDemoMode).toBe(true)
  })

  it('includes a disaggregated stack in demo stacks', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    const disaggregated = result.current.stacks.filter(s => s.hasDisaggregation)
    expect(disaggregated.length).toBeGreaterThan(0)
  })

  it('includes a stack with WVA autoscaler in demo stacks', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    const wvaStack = result.current.stacks.find(s => s.autoscaler?.type === 'WVA')
    expect(wvaStack).toBeDefined()
  })

  it('includes a stack with HPA autoscaler in demo stacks', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    const hpaStack = result.current.stacks.find(s => s.autoscaler?.type === 'HPA')
    expect(hpaStack).toBeDefined()
  })

  it('includes a degraded stack in demo stacks', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    const degraded = result.current.stacks.find(s => s.status === 'degraded')
    expect(degraded).toBeDefined()
  })

  it('reports isLoading as false in demo mode', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.isLoading).toBe(false)
  })

  it('reports error as null in demo mode', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.error).toBeNull()
  })

  it('provides a no-op refetch in demo mode', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    // Should not throw
    expect(() => result.current.refetch()).not.toThrow()
    // Should NOT call the live refetch mock in demo mode
    expect(mockRefetch).not.toHaveBeenCalled()
  })

  // ── 3. Live mode uses discovered stacks ──────────────────────────────

  it('uses discovered stacks from useStackDiscovery in live mode', () => {
    mockIsDemoMode = false
    const liveStack = createStack({ id: 'live-ns@cluster-a', cluster: 'cluster-a' })
    mockDiscoveredStacks = [liveStack]
    mockDeduplicatedClusters = [{ name: 'cluster-a', reachable: true }]

    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.stacks).toHaveLength(1)
    expect(result.current.stacks[0].id).toBe('live-ns@cluster-a')
    expect(result.current.isDemoMode).toBe(false)
  })

  it('passes live isLoading state in live mode', () => {
    mockIsDemoMode = false
    mockIsLoading = true

    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.isLoading).toBe(true)
  })

  it('passes live error state in live mode', () => {
    mockIsDemoMode = false
    mockError = 'Failed to discover stacks'

    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.error).toBe('Failed to discover stacks')
  })

  it('uses live refetch function in live mode', () => {
    mockIsDemoMode = false
    const { result } = renderHook(() => useStack(), { wrapper })

    result.current.refetch()
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  // ── 4. Cluster filtering — exclude offline clusters ──────────────────

  it('filters out stacks from clusters that are not reachable', () => {
    mockIsDemoMode = false
    mockDiscoveredStacks = [
      createStack({ id: 'ns@online', cluster: 'online' }),
      createStack({ id: 'ns@offline', cluster: 'offline' }),
    ]
    mockDeduplicatedClusters = [
      { name: 'online', reachable: true },
      { name: 'offline', reachable: false },
    ]

    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.stacks).toHaveLength(1)
    expect(result.current.stacks[0].cluster).toBe('online')
  })

  it('shows no stacks when all clusters are offline', () => {
    mockIsDemoMode = false
    mockDiscoveredStacks = [
      createStack({ id: 'ns@c1', cluster: 'c1' }),
    ]
    mockDeduplicatedClusters = [
      { name: 'c1', reachable: false },
    ]

    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.stacks).toHaveLength(0)
  })

  // ── 5. Stack selection ───────────────────────────────────────────────

  it('allows selecting a stack by ID', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    const firstStack = result.current.stacks[0]
    act(() => {
      result.current.setSelectedStackId(firstStack.id)
    })

    expect(result.current.selectedStackId).toBe(firstStack.id)
    expect(result.current.selectedStack).toBeDefined()
    expect(result.current.selectedStack!.id).toBe(firstStack.id)
  })

  // SKIP: test update needed — StackContext now returns default stack instead of null
  it('auto-selects a default stack when selection is cleared and stacks are available', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    // Clear any auto-selected stack — auto-select effect will re-select a default
    act(() => {
      result.current.setSelectedStackId(null)
    })

    // StackContext auto-selects a healthy disaggregated stack when selectedStackId is null
    expect(result.current.selectedStack).not.toBeNull()
    expect(result.current.selectedStackId).not.toBeNull()
  })

  // SKIP: test update needed — StackContext now returns default stack instead of null
  it('auto-selects a default stack when selected ID does not match any stack', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    act(() => {
      result.current.setSelectedStackId('nonexistent@cluster')
    })

    // The auto-clear effect removes the invalid ID, then the auto-select
    // effect picks a default stack since stacks are available
    expect(result.current.selectedStack).not.toBeNull()
  })

  // ── 6. Selection persistence to localStorage ─────────────────────────

  it('persists selected stack ID to localStorage', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    const stackId = result.current.stacks[0].id
    act(() => {
      result.current.setSelectedStackId(stackId)
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBe(stackId)
  })

  // SKIP: test update needed — StackContext now returns default stack instead of null
  it('re-populates localStorage with auto-selected stack when selection is set to null', () => {
    mockIsDemoMode = true
    localStorage.setItem(STORAGE_KEY, 'some-id')

    const { result } = renderHook(() => useStack(), { wrapper })

    act(() => {
      result.current.setSelectedStackId(null)
    })

    // Setting to null momentarily clears localStorage, but the auto-select
    // effect fires and persists the new default stack ID back to localStorage
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    // The auto-selected stack should be persisted
    expect(localStorage.getItem(STORAGE_KEY)).toBe(result.current.selectedStackId)
  })

  it('restores selection from localStorage on mount', () => {
    mockIsDemoMode = true
    // Need to render once to get the demo stack IDs
    const { result: firstResult } = renderHook(() => useStack(), { wrapper })
    const stackId = firstResult.current.stacks[0].id

    // Set localStorage manually
    localStorage.setItem(STORAGE_KEY, stackId)

    // Render again - should pick up stored ID
    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.selectedStackId).toBe(stackId)
    expect(result.current.selectedStack?.id).toBe(stackId)
  })

  // ── 7. Auto-selection logic ──────────────────────────────────────────

  it('auto-selects a healthy disaggregated stack first', () => {
    mockIsDemoMode = true
    // The demo stacks include a healthy disaggregated one
    const { result } = renderHook(() => useStack(), { wrapper })

    // Should have auto-selected something
    expect(result.current.selectedStackId).not.toBeNull()
    const selectedStack = result.current.selectedStack
    expect(selectedStack).toBeDefined()
    // Should prefer healthy + disaggregated
    expect(selectedStack!.status).toBe('healthy')
    expect(selectedStack!.hasDisaggregation).toBe(true)
  })

  it('auto-selects first healthy stack when no disaggregated stacks available', () => {
    mockIsDemoMode = false
    mockIsLoading = false
    const healthyUnified = createStack({
      id: 'unified@c1',
      cluster: 'c1',
      status: 'healthy',
      hasDisaggregation: false,
    })
    const degradedStack = createStack({
      id: 'degraded@c1',
      cluster: 'c1',
      status: 'degraded',
      hasDisaggregation: false,
    })
    mockDiscoveredStacks = [degradedStack, healthyUnified]
    mockDeduplicatedClusters = [{ name: 'c1', reachable: true }]

    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.selectedStackId).toBe('unified@c1')
  })

  it('auto-selects first stack when none are healthy', () => {
    mockIsDemoMode = false
    mockIsLoading = false
    const stack1 = createStack({
      id: 'deg-1@c1',
      cluster: 'c1',
      status: 'degraded',
      hasDisaggregation: false,
    })
    const stack2 = createStack({
      id: 'deg-2@c1',
      cluster: 'c1',
      status: 'unhealthy',
      hasDisaggregation: false,
    })
    mockDiscoveredStacks = [stack1, stack2]
    mockDeduplicatedClusters = [{ name: 'c1', reachable: true }]

    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.selectedStackId).toBe('deg-1@c1')
  })

  it('does not auto-select while loading', () => {
    mockIsDemoMode = false
    mockIsLoading = true
    mockDiscoveredStacks = []
    mockDeduplicatedClusters = []

    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.selectedStackId).toBeNull()
  })

  it('does not auto-select when stacks are empty', () => {
    mockIsDemoMode = false
    mockIsLoading = false
    mockDiscoveredStacks = []
    mockDeduplicatedClusters = []

    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.selectedStackId).toBeNull()
  })

  // ── 8. getStackById helper ───────────────────────────────────────────

  it('getStackById returns correct stack for valid ID', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    const firstStack = result.current.stacks[0]
    const found = result.current.getStackById(firstStack.id)

    expect(found).toBeDefined()
    expect(found!.id).toBe(firstStack.id)
  })

  it('getStackById returns undefined for non-existent ID', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    const found = result.current.getStackById('totally-fake@nonexistent')
    expect(found).toBeUndefined()
  })

  // ── 9. healthyStacks helper ──────────────────────────────────────────

  it('healthyStacks filters only healthy stacks', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    const healthyCount = result.current.healthyStacks.length
    const allHealthy = result.current.healthyStacks.every(s => s.status === 'healthy')

    expect(healthyCount).toBeGreaterThan(0)
    expect(allHealthy).toBe(true)
  })

  it('healthyStacks excludes degraded stacks', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    const degradedInHealthy = result.current.healthyStacks.some(s => s.status === 'degraded')
    expect(degradedInHealthy).toBe(false)

    // Verify there are degraded stacks in the full list
    const degradedInAll = result.current.stacks.some(s => s.status === 'degraded')
    expect(degradedInAll).toBe(true)
  })

  // ── 10. disaggregatedStacks helper ───────────────────────────────────

  it('disaggregatedStacks filters only stacks with disaggregation', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    const disaggCount = result.current.disaggregatedStacks.length
    const allDisagg = result.current.disaggregatedStacks.every(s => s.hasDisaggregation)

    expect(disaggCount).toBeGreaterThan(0)
    expect(allDisagg).toBe(true)
  })

  it('disaggregatedStacks excludes unified stacks', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    const unifiedInDisagg = result.current.disaggregatedStacks.some(s => !s.hasDisaggregation)
    expect(unifiedInDisagg).toBe(false)

    // Verify there are unified stacks in the full list
    const unifiedInAll = result.current.stacks.some(s => !s.hasDisaggregation)
    expect(unifiedInAll).toBe(true)
  })

  // ── 11. Demo stacks structure validation ─────────────────────────────

  it('demo stacks have valid component structures', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    for (const stack of result.current.stacks) {
      expect(stack.components).toBeDefined()
      expect(Array.isArray(stack.components.prefill)).toBe(true)
      expect(Array.isArray(stack.components.decode)).toBe(true)
      expect(Array.isArray(stack.components.both)).toBe(true)
      // EPP should be a component or null
      if (stack.components.epp !== null) {
        expect(stack.components.epp.type).toBe('epp')
      }
      // Gateway can be null for degraded stacks
      if (stack.components.gateway !== null) {
        expect(stack.components.gateway.type).toBe('gateway')
      }
    }
  })

  it('demo stacks have unique IDs', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    const ids = result.current.stacks.map(s => s.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('demo stacks include at least one stack with zero replicas for WVA idle testing', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    const idleStack = result.current.stacks.find(
      s => s.totalReplicas === 0 && s.autoscaler?.type === 'WVA'
    )
    expect(idleStack).toBeDefined()
    expect(idleStack!.autoscaler!.currentReplicas).toBe(0)
  })

  // ── 12. lastRefresh ──────────────────────────────────────────────────

  it('provides a Date for lastRefresh in demo mode', () => {
    mockIsDemoMode = true
    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.lastRefresh).toBeInstanceOf(Date)
  })

  it('passes through live lastRefresh in live mode', () => {
    mockIsDemoMode = false
    const liveDate = new Date('2025-01-01T00:00:00Z')
    mockLastRefresh = liveDate

    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.lastRefresh).toBe(liveDate)
  })

  it('passes through null lastRefresh when live data has not loaded yet', () => {
    mockIsDemoMode = false
    mockLastRefresh = null

    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.lastRefresh).toBeNull()
  })

  // ── 13. Selection clearing on stale data ─────────────────────────────

  it('clears selection when selected stack disappears from the list', () => {
    mockIsDemoMode = false
    mockIsLoading = false
    const stack = createStack({ id: 'will-vanish@c1', cluster: 'c1' })
    mockDiscoveredStacks = [stack]
    mockDeduplicatedClusters = [{ name: 'c1', reachable: true }]

    const { result, rerender } = renderHook(() => useStack(), { wrapper })

    // Should auto-select the only stack
    expect(result.current.selectedStackId).toBe('will-vanish@c1')

    // Now remove the stack
    mockDiscoveredStacks = []
    rerender()

    // Selection should be cleared
    expect(result.current.selectedStackId).toBeNull()
    expect(result.current.selectedStack).toBeNull()
  })

  // ── 14. Multiple stacks in live mode ─────────────────────────────────

  it('handles multiple stacks across different clusters', () => {
    mockIsDemoMode = false
    mockIsLoading = false
    mockDiscoveredStacks = [
      createStack({ id: 'ns1@c1', cluster: 'c1', status: 'healthy' }),
      createStack({ id: 'ns2@c2', cluster: 'c2', status: 'degraded' }),
      createStack({ id: 'ns3@c3', cluster: 'c3', status: 'healthy', hasDisaggregation: true }),
    ]
    mockDeduplicatedClusters = [
      { name: 'c1', reachable: true },
      { name: 'c2', reachable: true },
      { name: 'c3', reachable: true },
    ]

    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.stacks).toHaveLength(3)
    expect(result.current.healthyStacks).toHaveLength(2)
    expect(result.current.disaggregatedStacks).toHaveLength(1)
    // Should auto-select healthy + disaggregated
    expect(result.current.selectedStackId).toBe('ns3@c3')
  })

  // ── 15. Selection does not change when stacks reload ─────────────────

  it('preserves user selection across re-renders when stack still exists', () => {
    mockIsDemoMode = false
    mockIsLoading = false
    const stacks = [
      createStack({ id: 'ns1@c1', cluster: 'c1', status: 'healthy', hasDisaggregation: true }),
      createStack({ id: 'ns2@c1', cluster: 'c1', status: 'healthy' }),
    ]
    mockDiscoveredStacks = stacks
    mockDeduplicatedClusters = [{ name: 'c1', reachable: true }]

    const { result, rerender } = renderHook(() => useStack(), { wrapper })

    // Manually select the second stack
    act(() => {
      result.current.setSelectedStackId('ns2@c1')
    })

    expect(result.current.selectedStackId).toBe('ns2@c1')

    // Re-render (simulating data refresh)
    rerender()

    // Selection should be preserved
    expect(result.current.selectedStackId).toBe('ns2@c1')
  })
})
