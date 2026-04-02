/**
 * AlertsDataFetcher Tests
 *
 * Exercises the AlertsDataFetcher component which bridges MCP hooks
 * (useGPUNodes, usePodIssues, useClusters) into the AlertsContext
 * via an onData callback. The component renders nothing visible.
 *
 * Tests cover: data propagation, loading states, error aggregation,
 * guard against undefined arrays, and correct callback invocation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGPUNodesState = {
  nodes: [{ cluster: 'c1', gpuCount: 4, gpuAllocated: 2 }] as Array<{ cluster: string; gpuCount: number; gpuAllocated: number }>,
  isLoading: false,
  error: null as string | null,
}

const mockPodIssuesState = {
  issues: [{ name: 'pod-1', cluster: 'c1', namespace: 'default', status: 'CrashLoopBackOff', restarts: 10 }] as Array<{
    name: string
    cluster?: string
    namespace?: string
    status?: string
    restarts?: number
    reason?: string
    issues?: string[]
  }>,
  isLoading: false,
  error: null as string | null,
}

const mockClustersState = {
  deduplicatedClusters: [{ name: 'c1', healthy: true, reachable: true, nodeCount: 3 }] as Array<{
    name: string
    healthy?: boolean
    reachable?: boolean
    nodeCount?: number
  }>,
  isLoading: false,
  error: null as string | null,
}

vi.mock('../../hooks/useMCP', () => ({
  useGPUNodes: () => mockGPUNodesState,
  usePodIssues: () => mockPodIssuesState,
  useClusters: () => mockClustersState,
}))

// ── Import after mocks ────────────────────────────────────────────────────

import AlertsDataFetcher from '../AlertsDataFetcher'

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  // Reset to defaults
  mockGPUNodesState.nodes = [{ cluster: 'c1', gpuCount: 4, gpuAllocated: 2 }]
  mockGPUNodesState.isLoading = false
  mockGPUNodesState.error = null

  mockPodIssuesState.issues = [{ name: 'pod-1', cluster: 'c1', namespace: 'default', status: 'CrashLoopBackOff', restarts: 10 }]
  mockPodIssuesState.isLoading = false
  mockPodIssuesState.error = null

  mockClustersState.deduplicatedClusters = [{ name: 'c1', healthy: true, reachable: true, nodeCount: 3 }]
  mockClustersState.isLoading = false
  mockClustersState.error = null
})

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('AlertsDataFetcher', () => {
  // ── 1. Rendering behavior ───────────────────────────────────────────

  it('renders nothing (returns null)', () => {
    const onData = vi.fn()
    const { container } = render(<AlertsDataFetcher onData={onData} />)
    expect(container.innerHTML).toBe('')
  })

  // ── 2. Data propagation ─────────────────────────────────────────────

  it('calls onData with GPU nodes, pod issues, and clusters', () => {
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    expect(onData).toHaveBeenCalled()
    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0]
    expect(lastCall.gpuNodes).toEqual([{ cluster: 'c1', gpuCount: 4, gpuAllocated: 2 }])
    expect(lastCall.podIssues).toEqual([{ name: 'pod-1', cluster: 'c1', namespace: 'default', status: 'CrashLoopBackOff', restarts: 10 }])
    expect(lastCall.clusters).toEqual([{ name: 'c1', healthy: true, reachable: true, nodeCount: 3 }])
  })

  it('reports isLoading=false when all hooks are done loading', () => {
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0]
    expect(lastCall.isLoading).toBe(false)
  })

  it('reports isLoading=true when GPU nodes are loading', () => {
    mockGPUNodesState.isLoading = true
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0]
    expect(lastCall.isLoading).toBe(true)
  })

  it('reports isLoading=true when pod issues are loading', () => {
    mockPodIssuesState.isLoading = true
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0]
    expect(lastCall.isLoading).toBe(true)
  })

  it('reports isLoading=true when clusters are loading', () => {
    mockClustersState.isLoading = true
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0]
    expect(lastCall.isLoading).toBe(true)
  })

  // ── 3. Error aggregation ────────────────────────────────────────────

  it('reports null error when no hooks have errors', () => {
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0]
    expect(lastCall.error).toBeNull()
  })

  it('reports single error from GPU nodes hook', () => {
    mockGPUNodesState.error = 'GPU fetch failed'
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0]
    expect(lastCall.error).toBe('GPU fetch failed')
  })

  it('aggregates multiple errors with semicolons', () => {
    mockGPUNodesState.error = 'GPU error'
    mockPodIssuesState.error = 'Pod error'
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0]
    expect(lastCall.error).toContain('GPU error')
    expect(lastCall.error).toContain('Pod error')
    expect(lastCall.error).toContain('; ')
  })

  it('aggregates errors from all three hooks', () => {
    mockGPUNodesState.error = 'err1'
    mockPodIssuesState.error = 'err2'
    mockClustersState.error = 'err3'
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0]
    expect(lastCall.error).toBe('err1; err2; err3')
  })

  // ── 4. Null/undefined data guards ───────────────────────────────────

  it('defaults gpuNodes to empty array when hook returns null', () => {
    mockGPUNodesState.nodes = null as unknown as typeof mockGPUNodesState.nodes
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0]
    expect(lastCall.gpuNodes).toEqual([])
  })

  it('defaults podIssues to empty array when hook returns null', () => {
    mockPodIssuesState.issues = null as unknown as typeof mockPodIssuesState.issues
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0]
    expect(lastCall.podIssues).toEqual([])
  })

  it('defaults clusters to empty array when hook returns null', () => {
    mockClustersState.deduplicatedClusters = null as unknown as typeof mockClustersState.deduplicatedClusters
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0]
    expect(lastCall.clusters).toEqual([])
  })

  // ── 5. Combined states ──────────────────────────────────────────────

  it('handles all hooks loading simultaneously', () => {
    mockGPUNodesState.isLoading = true
    mockPodIssuesState.isLoading = true
    mockClustersState.isLoading = true
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0]
    expect(lastCall.isLoading).toBe(true)
  })

  it('handles errors and loading together', () => {
    mockGPUNodesState.isLoading = true
    mockPodIssuesState.error = 'pod hook failed'
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0]
    expect(lastCall.isLoading).toBe(true)
    expect(lastCall.error).toBe('pod hook failed')
  })
})
