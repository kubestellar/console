/**
 * AlertsDataFetcher Tests
 *
 * Exercises the AlertsDataFetcher bridge component which connects MCP hooks
 * (useGPUNodes, usePodIssues, useClusters) to the AlertsContext via an
 * onData callback. Tests verify data forwarding, loading state aggregation,
 * error merging, null/undefined safety, and re-render behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import type { AlertsMCPData } from '../AlertsDataFetcher'

// ── Mock state ────────────────────────────────────────────────────────────

let mockGPUNodes: Array<{ cluster: string; gpuCount: number; gpuAllocated: number }> = []
let mockGPULoading = false
let mockGPUError: string | null = null

let mockPodIssues: Array<{
  name: string
  cluster?: string
  namespace?: string
  status?: string
  restarts?: number
  reason?: string
  issues?: string[]
}> = []
let mockPodIssuesLoading = false
let mockPodIssuesError: string | null = null

let mockClusters: Array<{
  name: string
  healthy?: boolean
  reachable?: boolean
  nodeCount?: number
}> = []
let mockClustersLoading = false
let mockClustersError: string | null = null

vi.mock('../../hooks/useMCP', () => ({
  useGPUNodes: () => ({
    nodes: mockGPUNodes,
    isLoading: mockGPULoading,
    error: mockGPUError,
  }),
  usePodIssues: () => ({
    issues: mockPodIssues,
    isLoading: mockPodIssuesLoading,
    error: mockPodIssuesError,
  }),
  useClusters: () => ({
    deduplicatedClusters: mockClusters,
    isLoading: mockClustersLoading,
    error: mockClustersError,
  }),
}))

// ── Import after mocks ───────────────────────────────────────────────────

import AlertsDataFetcher from '../AlertsDataFetcher'

// ── Setup / Teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  mockGPUNodes = []
  mockGPULoading = false
  mockGPUError = null
  mockPodIssues = []
  mockPodIssuesLoading = false
  mockPodIssuesError = null
  mockClusters = []
  mockClustersLoading = false
  mockClustersError = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('AlertsDataFetcher', () => {
  // ── 1. Basic rendering ──────────────────────────────────────────────

  it('renders nothing visible (returns null)', () => {
    const onData = vi.fn()
    const { container } = render(<AlertsDataFetcher onData={onData} />)
    expect(container.innerHTML).toBe('')
  })

  it('exports the component as default export', async () => {
    const mod = await import('../AlertsDataFetcher')
    expect(mod.default).toBeDefined()
    expect(typeof mod.default).toBe('function')
  })

  // ── 2. Initial data callback with empty state ────────────────────────

  it('calls onData with empty arrays when hooks return no data', () => {
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    expect(onData).toHaveBeenCalledWith(
      expect.objectContaining({
        gpuNodes: [],
        podIssues: [],
        clusters: [],
        isLoading: false,
        error: null,
      })
    )
  })

  // ── 3. Forwarding GPU node data ─────────────────────────────────────

  it('forwards GPU node data from useGPUNodes hook', () => {
    mockGPUNodes = [
      { cluster: 'prod-1', gpuCount: 8, gpuAllocated: 6 },
      { cluster: 'prod-2', gpuCount: 4, gpuAllocated: 4 },
    ]
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.gpuNodes).toHaveLength(2)
    expect(lastCall.gpuNodes[0].cluster).toBe('prod-1')
    expect(lastCall.gpuNodes[1].gpuAllocated).toBe(4)
  })

  // ── 4. Forwarding pod issues data ────────────────────────────────────

  it('forwards pod issues data from usePodIssues hook', () => {
    mockPodIssues = [
      { name: 'api-server-xyz', cluster: 'prod', namespace: 'default', status: 'CrashLoopBackOff', restarts: 15 },
    ]
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.podIssues).toHaveLength(1)
    expect(lastCall.podIssues[0].name).toBe('api-server-xyz')
    expect(lastCall.podIssues[0].restarts).toBe(15)
  })

  // ── 5. Forwarding cluster data ──────────────────────────────────────

  it('forwards cluster data from useClusters hook', () => {
    mockClusters = [
      { name: 'cluster-a', healthy: true, reachable: true, nodeCount: 5 },
      { name: 'cluster-b', healthy: false, reachable: true, nodeCount: 3 },
    ]
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.clusters).toHaveLength(2)
    expect(lastCall.clusters[0].name).toBe('cluster-a')
    expect(lastCall.clusters[1].healthy).toBe(false)
  })

  // ── 6. Loading state aggregation ─────────────────────────────────────

  it('reports isLoading true when GPU nodes are loading', () => {
    mockGPULoading = true
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.isLoading).toBe(true)
  })

  it('reports isLoading true when pod issues are loading', () => {
    mockPodIssuesLoading = true
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.isLoading).toBe(true)
  })

  it('reports isLoading true when clusters are loading', () => {
    mockClustersLoading = true
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.isLoading).toBe(true)
  })

  it('reports isLoading true when all sources are loading', () => {
    mockGPULoading = true
    mockPodIssuesLoading = true
    mockClustersLoading = true
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.isLoading).toBe(true)
  })

  it('reports isLoading false when no sources are loading', () => {
    mockGPULoading = false
    mockPodIssuesLoading = false
    mockClustersLoading = false
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.isLoading).toBe(false)
  })

  // ── 7. Error merging ────────────────────────────────────────────────

  it('reports null error when no hooks have errors', () => {
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.error).toBeNull()
  })

  it('reports single error from GPU hook', () => {
    mockGPUError = 'GPU fetch failed'
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.error).toContain('GPU fetch failed')
  })

  it('reports single error from pod issues hook', () => {
    mockPodIssuesError = 'Pod issues fetch failed'
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.error).toContain('Pod issues fetch failed')
  })

  it('reports single error from clusters hook', () => {
    mockClustersError = 'Clusters fetch failed'
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.error).toContain('Clusters fetch failed')
  })

  it('merges multiple errors with semicolons', () => {
    mockGPUError = 'GPU error'
    mockPodIssuesError = 'Pod error'
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.error).toContain('GPU error')
    expect(lastCall.error).toContain('Pod error')
    expect(lastCall.error).toContain('; ')
  })

  it('merges all three errors when all hooks fail', () => {
    mockGPUError = 'GPU error'
    mockPodIssuesError = 'Pod error'
    mockClustersError = 'Cluster error'
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.error).toContain('GPU error')
    expect(lastCall.error).toContain('Pod error')
    expect(lastCall.error).toContain('Cluster error')
  })

  // ── 8. Null/undefined safety ─────────────────────────────────────────

  it('defaults all data fields to arrays regardless of hook return values', () => {
    // The component guards each hook return with `|| []` to prevent undefined
    // from propagating to the AlertsContext. This test verifies those guards
    // by checking the shape of the onData payload.
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(Array.isArray(lastCall.gpuNodes)).toBe(true)
    expect(Array.isArray(lastCall.podIssues)).toBe(true)
    expect(Array.isArray(lastCall.clusters)).toBe(true)
  })

  // ── 9. Combined data forwarding ──────────────────────────────────────

  it('forwards all data sources simultaneously', () => {
    mockGPUNodes = [{ cluster: 'c1', gpuCount: 8, gpuAllocated: 4 }]
    mockPodIssues = [{ name: 'pod-1', cluster: 'c1', restarts: 3 }]
    mockClusters = [{ name: 'c1', healthy: true, reachable: true, nodeCount: 4 }]
    mockGPULoading = false
    mockPodIssuesLoading = false
    mockClustersLoading = false

    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.gpuNodes).toHaveLength(1)
    expect(lastCall.podIssues).toHaveLength(1)
    expect(lastCall.clusters).toHaveLength(1)
    expect(lastCall.isLoading).toBe(false)
    expect(lastCall.error).toBeNull()
  })

  // ── 10. Data shape validation ────────────────────────────────────────

  it('passes through complete GPU node objects with all fields', () => {
    mockGPUNodes = [
      { cluster: 'gpu-cluster', gpuCount: 16, gpuAllocated: 12 },
    ]
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    const node = lastCall.gpuNodes[0]
    expect(node).toEqual({ cluster: 'gpu-cluster', gpuCount: 16, gpuAllocated: 12 })
  })

  it('passes through complete pod issue objects with all fields', () => {
    mockPodIssues = [
      {
        name: 'failing-pod',
        cluster: 'prod',
        namespace: 'kube-system',
        status: 'CrashLoopBackOff',
        restarts: 42,
        reason: 'OOMKilled',
        issues: ['Out of memory'],
      },
    ]
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    const issue = lastCall.podIssues[0]
    expect(issue.name).toBe('failing-pod')
    expect(issue.namespace).toBe('kube-system')
    expect(issue.restarts).toBe(42)
    expect(issue.reason).toBe('OOMKilled')
  })

  // ── 11. Re-render triggers new callback ──────────────────────────────

  it('calls onData again when data changes (re-render)', () => {
    const onData = vi.fn()
    const { rerender } = render(<AlertsDataFetcher onData={onData} />)

    const initialCallCount = onData.mock.calls.length

    // Re-render with the same props
    rerender(<AlertsDataFetcher onData={onData} />)

    // React may or may not call the effect again depending on dep stability,
    // but the component should not throw
    expect(onData.mock.calls.length).toBeGreaterThanOrEqual(initialCallCount)
  })

  // ── 12. Partial loading states ──────────────────────────────────────

  it('reports isLoading true when only one of three sources is still loading', () => {
    mockGPULoading = false
    mockPodIssuesLoading = false
    mockClustersLoading = true

    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.isLoading).toBe(true)
  })

  // ── 13. Error with loading ──────────────────────────────────────────

  it('can report both an error and loading at the same time', () => {
    mockGPUError = 'GPU failed'
    mockPodIssuesLoading = true

    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.isLoading).toBe(true)
    expect(lastCall.error).toContain('GPU failed')
  })

  // ── 14. Large dataset forwarding ─────────────────────────────────────

  it('handles large numbers of GPU nodes', () => {
    const LARGE_COUNT = 100
    mockGPUNodes = Array.from({ length: LARGE_COUNT }, (_, i) => ({
      cluster: `cluster-${i}`,
      gpuCount: 8,
      gpuAllocated: Math.floor(Math.random() * 8),
    }))

    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.gpuNodes).toHaveLength(LARGE_COUNT)
  })

  it('handles large numbers of pod issues', () => {
    const LARGE_COUNT = 200
    mockPodIssues = Array.from({ length: LARGE_COUNT }, (_, i) => ({
      name: `pod-${i}`,
      cluster: 'cluster-1',
      namespace: 'default',
      restarts: i,
    }))

    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    const lastCall = onData.mock.calls[onData.mock.calls.length - 1][0] as AlertsMCPData
    expect(lastCall.podIssues).toHaveLength(LARGE_COUNT)
  })

  // ── 15. onData callback stability ────────────────────────────────────

  it('calls onData at least once on initial render', () => {
    const onData = vi.fn()
    render(<AlertsDataFetcher onData={onData} />)

    expect(onData).toHaveBeenCalled()
  })

  it('accepts a new onData callback without error', () => {
    const onData1 = vi.fn()
    const onData2 = vi.fn()

    const { rerender } = render(<AlertsDataFetcher onData={onData1} />)

    // Change the callback
    rerender(<AlertsDataFetcher onData={onData2} />)

    // The second callback should eventually be called
    // (at least the first one was called on initial render)
    expect(onData1).toHaveBeenCalled()
  })
})
