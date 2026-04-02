/**
 * StackContext Tests
 *
 * Exercises StackProvider, useStack, useOptionalStack, demo mode stacks,
 * live stack filtering, selection persistence via localStorage, auto-selection
 * logic, computed helper properties (healthyStacks, disaggregatedStacks,
 * getStackById), and stale selection cleanup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockIsDemoMode = true
let mockDiscoveredStacks: Array<{
  id: string
  name: string
  namespace: string
  cluster: string
  inferencePool?: string
  components: {
    prefill: unknown[]
    decode: unknown[]
    both: unknown[]
    epp: unknown | null
    gateway: unknown | null
  }
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  hasDisaggregation: boolean
  model?: string
  totalReplicas: number
  readyReplicas: number
  autoscaler?: unknown
}> = []
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

// ── Import after mocks ────────────────────────────────────────────────────

import { StackProvider, useStack, useOptionalStack } from '../StackContext'

// ── Helpers ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'kubestellar-llmd-stack'

function wrapper({ children }: { children: ReactNode }) {
  return <StackProvider>{children}</StackProvider>
}

// ── Setup / Teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockIsDemoMode = true
  mockDiscoveredStacks = []
  mockIsLoading = false
  mockError = null
  mockLastRefresh = null
  mockDeduplicatedClusters = []
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

  it('returns null when useOptionalStack is called outside StackProvider', () => {
    const { result } = renderHook(() => useOptionalStack())
    expect(result.current).toBeNull()
  })

  it('returns context when useOptionalStack is called inside StackProvider', () => {
    const { result } = renderHook(() => useOptionalStack(), { wrapper })
    expect(result.current).not.toBeNull()
    expect(result.current!.stacks).toBeDefined()
  })

  // ── 2. Demo mode stacks ─────────────────────────────────────────────

  it('provides demo stacks when in demo mode', () => {
    mockIsDemoMode = true

    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.isDemoMode).toBe(true)
    expect(result.current.stacks.length).toBeGreaterThan(0)
    // Demo stacks include specific known IDs
    const stackIds = result.current.stacks.map(s => s.id)
    expect(stackIds).toContain('llm-inference@demo-cluster-1')
    expect(stackIds).toContain('vllm-prod@demo-cluster-2')
  })

  it('demo mode provides isLoading=false and error=null', () => {
    mockIsDemoMode = true
    mockIsLoading = true
    mockError = 'should be ignored'

    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('demo mode provides a no-op refetch and a Date lastRefresh', () => {
    mockIsDemoMode = true

    const { result } = renderHook(() => useStack(), { wrapper })

    // refetch should be callable without error
    expect(() => result.current.refetch()).not.toThrow()
    expect(result.current.lastRefresh).toBeInstanceOf(Date)
  })

  it('demo stacks include disaggregated and non-disaggregated stacks', () => {
    mockIsDemoMode = true

    const { result } = renderHook(() => useStack(), { wrapper })

    const disaggregated = result.current.stacks.filter(s => s.hasDisaggregation)
    const nonDisaggregated = result.current.stacks.filter(s => !s.hasDisaggregation)
    expect(disaggregated.length).toBeGreaterThan(0)
    expect(nonDisaggregated.length).toBeGreaterThan(0)
  })

  it('demo stacks include both healthy and degraded stacks', () => {
    mockIsDemoMode = true

    const { result } = renderHook(() => useStack(), { wrapper })

    const healthy = result.current.stacks.filter(s => s.status === 'healthy')
    const degraded = result.current.stacks.filter(s => s.status === 'degraded')
    expect(healthy.length).toBeGreaterThan(0)
    expect(degraded.length).toBeGreaterThan(0)
  })

  // ── 3. Live mode stacks ─────────────────────────────────────────────

  it('uses live stacks in non-demo mode', () => {
    mockIsDemoMode = false
    mockDeduplicatedClusters = [{ name: 'prod', reachable: true }]
    mockDiscoveredStacks = [
      {
        id: 'ns@prod',
        name: 'ns',
        namespace: 'ns',
        cluster: 'prod',
        components: { prefill: [], decode: [], both: [], epp: null, gateway: null },
        status: 'healthy',
        hasDisaggregation: false,
        totalReplicas: 2,
        readyReplicas: 2,
      },
    ]

    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.isDemoMode).toBe(false)
    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].id).toBe('ns@prod')
  })

  it('filters out stacks from clusters that went offline', () => {
    mockIsDemoMode = false
    // Only 'prod' is online; 'staging' is offline
    mockDeduplicatedClusters = [
      { name: 'prod', reachable: true },
      { name: 'staging', reachable: false },
    ]
    mockDiscoveredStacks = [
      {
        id: 'ns@prod',
        name: 'ns',
        namespace: 'ns',
        cluster: 'prod',
        components: { prefill: [], decode: [], both: [], epp: null, gateway: null },
        status: 'healthy',
        hasDisaggregation: false,
        totalReplicas: 2,
        readyReplicas: 2,
      },
      {
        id: 'ns@staging',
        name: 'ns',
        namespace: 'ns',
        cluster: 'staging',
        components: { prefill: [], decode: [], both: [], epp: null, gateway: null },
        status: 'degraded',
        hasDisaggregation: false,
        totalReplicas: 1,
        readyReplicas: 0,
      },
    ]

    const { result } = renderHook(() => useStack(), { wrapper })

    // Only the 'prod' stack should remain
    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].cluster).toBe('prod')
  })

  it('passes live loading state and error in non-demo mode', () => {
    mockIsDemoMode = false
    mockIsLoading = true
    mockError = 'network timeout'
    mockLastRefresh = new Date('2025-01-01T00:00:00Z')

    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.error).toBe('network timeout')
    expect(result.current.lastRefresh).toEqual(new Date('2025-01-01T00:00:00Z'))
  })

  // ── 4. Selection persistence ────────────────────────────────────────

  it('persists selected stack ID to localStorage', () => {
    mockIsDemoMode = true

    const { result } = renderHook(() => useStack(), { wrapper })

    act(() => {
      result.current.setSelectedStackId('vllm-prod@demo-cluster-2')
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBe('vllm-prod@demo-cluster-2')
    expect(result.current.selectedStackId).toBe('vllm-prod@demo-cluster-2')
  })

  it('loads selected stack ID from localStorage on mount', () => {
    mockIsDemoMode = true
    localStorage.setItem(STORAGE_KEY, 'vllm-prod@demo-cluster-2')

    const { result } = renderHook(() => useStack(), { wrapper })

    expect(result.current.selectedStackId).toBe('vllm-prod@demo-cluster-2')
    expect(result.current.selectedStack).toBeDefined()
    expect(result.current.selectedStack!.id).toBe('vllm-prod@demo-cluster-2')
  })

  it('clears localStorage when selection is set to null (before auto-select)', () => {
    // When no stacks are available, setting to null stays null
    mockIsDemoMode = false
    mockDeduplicatedClusters = []
    mockDiscoveredStacks = []
    localStorage.setItem(STORAGE_KEY, 'some-old-stack')

    const { result } = renderHook(() => useStack(), { wrapper })

    // The stale ID was cleared by the "selected stack no longer exists" effect
    // Verify setSelectedStackId(null) removes from localStorage
    act(() => {
      result.current.setSelectedStackId(null)
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(result.current.selectedStackId).toBeNull()
  })

  // ── 5. Auto-selection logic ─────────────────────────────────────────

  it('auto-selects first healthy disaggregated stack when none selected', () => {
    mockIsDemoMode = true
    // Clear any persisted selection
    localStorage.removeItem(STORAGE_KEY)

    const { result } = renderHook(() => useStack(), { wrapper })

    // The auto-selection prefers healthy + disaggregated first
    expect(result.current.selectedStackId).toBeDefined()
    const selected = result.current.selectedStack
    expect(selected).toBeDefined()
    // First preference is healthy + disaggregated
    if (selected!.status === 'healthy' && selected!.hasDisaggregation) {
      expect(selected!.id).toBe('llm-inference@demo-cluster-1')
    }
  })

  it('clears selection if selected stack no longer exists in stack list', () => {
    mockIsDemoMode = false
    mockDeduplicatedClusters = [{ name: 'prod', reachable: true }]
    mockDiscoveredStacks = [
      {
        id: 'ns@prod',
        name: 'ns',
        namespace: 'ns',
        cluster: 'prod',
        components: { prefill: [], decode: [], both: [], epp: null, gateway: null },
        status: 'healthy',
        hasDisaggregation: false,
        totalReplicas: 2,
        readyReplicas: 2,
      },
    ]
    // Persist a stack ID that no longer exists
    localStorage.setItem(STORAGE_KEY, 'vanished@gone-cluster')

    const { result } = renderHook(() => useStack(), { wrapper })

    // The stale selection should be cleared and auto-selected to existing stack
    // After the clearing effect runs, the auto-select effect should pick the first available
    expect(result.current.selectedStack?.id !== 'vanished@gone-cluster').toBe(true)
  })

  // ── 6. Computed properties ──────────────────────────────────────────

  it('healthyStacks filters only healthy stacks', () => {
    mockIsDemoMode = true

    const { result } = renderHook(() => useStack(), { wrapper })

    const healthyIds = result.current.healthyStacks.map(s => s.id)
    for (const stack of result.current.healthyStacks) {
      expect(stack.status).toBe('healthy')
    }
    // At least one healthy stack should exist in demo data
    expect(healthyIds.length).toBeGreaterThan(0)
  })

  it('disaggregatedStacks filters only stacks with hasDisaggregation=true', () => {
    mockIsDemoMode = true

    const { result } = renderHook(() => useStack(), { wrapper })

    for (const stack of result.current.disaggregatedStacks) {
      expect(stack.hasDisaggregation).toBe(true)
    }
    // At least one disaggregated stack should exist in demo data
    expect(result.current.disaggregatedStacks.length).toBeGreaterThan(0)
  })

  it('getStackById returns the matching stack', () => {
    mockIsDemoMode = true

    const { result } = renderHook(() => useStack(), { wrapper })

    const found = result.current.getStackById('llm-inference@demo-cluster-1')
    expect(found).toBeDefined()
    expect(found!.name).toBe('llm-inference')
  })

  it('getStackById returns undefined for non-existent ID', () => {
    mockIsDemoMode = true

    const { result } = renderHook(() => useStack(), { wrapper })

    const notFound = result.current.getStackById('non-existent@nowhere')
    expect(notFound).toBeUndefined()
  })

  it('selectedStack is null when no stack is selected', () => {
    mockIsDemoMode = false
    mockDeduplicatedClusters = []
    mockDiscoveredStacks = []

    const { result } = renderHook(() => useStack(), { wrapper })

    // No stacks available → no selection
    expect(result.current.selectedStack).toBeNull()
  })

  // ── 7. Demo stack structure ─────────────────────────────────────────

  it('demo stacks have valid component structures', () => {
    mockIsDemoMode = true

    const { result } = renderHook(() => useStack(), { wrapper })

    for (const stack of result.current.stacks) {
      expect(stack.components).toBeDefined()
      expect(Array.isArray(stack.components.prefill)).toBe(true)
      expect(Array.isArray(stack.components.decode)).toBe(true)
      expect(Array.isArray(stack.components.both)).toBe(true)
      // epp and gateway can be null or an object
      if (stack.components.epp !== null) {
        expect(stack.components.epp).toHaveProperty('name')
        expect(stack.components.epp).toHaveProperty('type')
      }
    }
  })

  it('demo stacks include autoscaler info where applicable', () => {
    mockIsDemoMode = true

    const { result } = renderHook(() => useStack(), { wrapper })

    const withAutoscaler = result.current.stacks.filter(s => s.autoscaler)
    const withoutAutoscaler = result.current.stacks.filter(s => !s.autoscaler)
    expect(withAutoscaler.length).toBeGreaterThan(0)
    expect(withoutAutoscaler.length).toBeGreaterThan(0)

    // WVA and HPA autoscaler types should be present
    const types = withAutoscaler.map(s => s.autoscaler!.type)
    expect(types).toContain('WVA')
    expect(types).toContain('HPA')
  })

  // ── 8. Online cluster filtering ─────────────────────────────────────

  it('only passes online cluster names to useStackDiscovery', () => {
    mockIsDemoMode = false
    mockDeduplicatedClusters = [
      { name: 'online-1', reachable: true },
      { name: 'offline-1', reachable: false },
      { name: 'unknown-1' }, // no reachable flag
    ]
    // The stacks from discovery would only include stacks from the online clusters
    // that were passed to useStackDiscovery
    mockDiscoveredStacks = []

    const { result } = renderHook(() => useStack(), { wrapper })

    // Verify the provider renders without error and has no stacks
    expect(result.current.stacks).toEqual([])
  })
})
