import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useUpgradeStateMachine } from '../useUpgradeStateMachine'

// ---------------------------------------------------------------------------
// Named local constants for private hook configurations (avoiding magic numbers)
// ---------------------------------------------------------------------------
const RETRY_INTERVAL_MS = 15000
const VERSION_CACHE_TTL = 300000

// ---------------------------------------------------------------------------
// Mock useUpgradeWebSocket module
// ---------------------------------------------------------------------------
const { mockVersionWsHandle, mockClearCachedVersions } = vi.hoisted(() => ({
  mockClearCachedVersions: vi.fn(),
  mockVersionWsHandle: {
    ensureWs: vi.fn(),
    fetchClusterVersion: vi.fn(),
    destroy: vi.fn(),
  },
}))

vi.mock('../useUpgradeWebSocket', () => ({
  createVersionWsHandle: () => mockVersionWsHandle,
  clearCachedVersions: mockClearCachedVersions,
  VERSION_CACHE_TTL: 300000,
}))

// ---------------------------------------------------------------------------
// Mock upgradeHelpers module using the correct relative path
// ---------------------------------------------------------------------------
const mockGetDemoVersionForCluster = vi.fn((name) => `${name}-demo`)

vi.mock('../../components/cards/upgradeHelpers', () => ({
  getDemoVersionForCluster: (name: string) => mockGetDemoVersionForCluster(name),
}))

// ---------------------------------------------------------------------------
// Helper: Tick microtask queue
// ---------------------------------------------------------------------------
async function tick() {
  await act(async () => {
    await Promise.resolve()
  })
}

// ---------------------------------------------------------------------------
// Setup & Teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  mockVersionWsHandle.fetchClusterVersion.mockReset()
  mockVersionWsHandle.destroy.mockReset()
  mockGetDemoVersionForCluster.mockReset()
  mockClearCachedVersions.mockReset()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('useUpgradeStateMachine — Initial state', () => {
  it('returns empty clusterVersions and fetchCompleted=false on initial render when loading', () => {
    const clusters = [{ name: 'cluster-1', healthy: true, nodeCount: 1 }] as any[]
    // Mock fetchClusterVersion to return a pending promise so fetchCompleted remains false (loading)
    mockVersionWsHandle.fetchClusterVersion.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useUpgradeStateMachine({
      allClusters: clusters,
      agentConnected: true,
      isDemoMode: false,
      openTrackedWs: vi.fn(),
      parseWsMessage: vi.fn(),
    }))

    expect(result.current.clusterVersions).toEqual({})
    expect(result.current.fetchCompleted).toBe(false)
  })
})

describe('useUpgradeStateMachine — Demo mode', () => {
  it('handles demo mode setup and seeding correctly', () => {
    const allClusters = [
      { name: 'cluster-1', healthy: true, nodeCount: 3 },
      { name: 'cluster-2', healthy: true, nodeCount: 1 },
    ] as any[]

    mockGetDemoVersionForCluster.mockImplementation((name) => `${name}-demo-ver`)

    const { result, rerender } = renderHook(({ isDemoMode }) => useUpgradeStateMachine({
      allClusters,
      agentConnected: true,
      isDemoMode,
      openTrackedWs: vi.fn(),
      parseWsMessage: vi.fn(),
    }), {
      initialProps: { isDemoMode: true }
    })

    expect(result.current.clusterVersions).toEqual({
      'cluster-1': 'cluster-1-demo-ver',
      'cluster-2': 'cluster-2-demo-ver',
    })
    expect(result.current.fetchCompleted).toBe(true)
    expect(mockVersionWsHandle.fetchClusterVersion).not.toHaveBeenCalled()

    // Demo versions are not re-seeded on re-render after initial set
    mockGetDemoVersionForCluster.mockClear()
    rerender({ isDemoMode: true })
    expect(mockGetDemoVersionForCluster).not.toHaveBeenCalled()
  })
})

describe('useUpgradeStateMachine — Not connected / no clusters', () => {
  it('sets fetchCompleted=true (not loading) when agentConnected=false', () => {
    const clusters = [{ name: 'cluster-1', healthy: true, nodeCount: 2 }] as any[]
    const { result } = renderHook(() => useUpgradeStateMachine({
      allClusters: clusters,
      agentConnected: false,
      isDemoMode: false,
      openTrackedWs: vi.fn(),
      parseWsMessage: vi.fn(),
    }))

    expect(result.current.fetchCompleted).toBe(true)
    expect(mockVersionWsHandle.fetchClusterVersion).not.toHaveBeenCalled()
  })

  it('does not fetch when allClusters is empty', () => {
    const emptyClusters: any[] = []
    const { result } = renderHook(() => useUpgradeStateMachine({
      allClusters: emptyClusters,
      agentConnected: true,
      isDemoMode: false,
      openTrackedWs: vi.fn(),
      parseWsMessage: vi.fn(),
    }))

    expect(result.current.fetchCompleted).toBe(true)
    expect(mockVersionWsHandle.fetchClusterVersion).not.toHaveBeenCalled()
  })

  it('does not fetch when allClusters is null — array safety guard tested', () => {
    const { result } = renderHook(() => useUpgradeStateMachine({
      allClusters: null as any,
      agentConnected: true,
      isDemoMode: false,
      openTrackedWs: vi.fn(),
      parseWsMessage: vi.fn(),
    }))

    expect(result.current.fetchCompleted).toBe(true)
    expect(mockVersionWsHandle.fetchClusterVersion).not.toHaveBeenCalled()
  })
})

describe('useUpgradeStateMachine — Live fetching', () => {
  it('fetches versions for all healthy reachable clusters in parallel on connect', async () => {
    const allClusters = [
      { name: 'cluster-1', healthy: true, nodeCount: 3 },
      { name: 'cluster-2', healthy: true, nodeCount: 1 },
    ] as any[]

    mockVersionWsHandle.fetchClusterVersion.mockResolvedValue('v1.27.0')

    const { result } = renderHook(() => useUpgradeStateMachine({
      allClusters,
      agentConnected: true,
      isDemoMode: false,
      openTrackedWs: vi.fn(),
      parseWsMessage: vi.fn(),
    }))

    await waitFor(() => {
      expect(result.current.fetchCompleted).toBe(true)
    })

    expect(result.current.clusterVersions).toEqual({
      'cluster-1': 'v1.27.0',
      'cluster-2': 'v1.27.0',
    })
    expect(mockVersionWsHandle.fetchClusterVersion).toHaveBeenCalledTimes(2)
  })

  it('skips clusters where healthy=false or nodeCount=0', async () => {
    const allClusters = [
      { name: 'healthy-cluster', healthy: true, nodeCount: 2 },
      { name: 'unhealthy-cluster', healthy: false, nodeCount: 3 },
      { name: 'zero-nodes-cluster', healthy: true, nodeCount: 0 },
    ] as any[]

    mockVersionWsHandle.fetchClusterVersion.mockResolvedValue('v1.27.0')

    const { result } = renderHook(() => useUpgradeStateMachine({
      allClusters,
      agentConnected: true,
      isDemoMode: false,
      openTrackedWs: vi.fn(),
      parseWsMessage: vi.fn(),
    }))

    await waitFor(() => {
      expect(result.current.fetchCompleted).toBe(true)
    })

    expect(result.current.clusterVersions).toEqual({
      'healthy-cluster': 'v1.27.0',
    })
    expect(mockVersionWsHandle.fetchClusterVersion).toHaveBeenCalledTimes(1)
    expect(mockVersionWsHandle.fetchClusterVersion).toHaveBeenCalledWith('healthy-cluster')
  })
})

describe('useUpgradeStateMachine — Retry logic', () => {
  it('retries failed clusters after RETRY_INTERVAL_MS (15s) when agentConnected stays true', async () => {
    vi.useFakeTimers()
    const allClusters = [
      { name: 'success-cluster', healthy: true, nodeCount: 1 },
      { name: 'failed-cluster', healthy: true, nodeCount: 2 },
    ] as any[]

    // Use deterministic mockImplementation keyed by cluster name to prevent parallel promise race hazards
    mockVersionWsHandle.fetchClusterVersion.mockImplementation(async (name) => {
      if (name === 'success-cluster') return 'v1.27.0'
      if (name === 'failed-cluster') return null
      return null
    })

    const { result } = renderHook(() => useUpgradeStateMachine({
      allClusters,
      agentConnected: true,
      isDemoMode: false,
      openTrackedWs: vi.fn(),
      parseWsMessage: vi.fn(),
    }))

    // Let the first fetch run and resolve
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    expect(result.current.clusterVersions).toEqual({
      'success-cluster': 'v1.27.0',
    })

    // Setup retry resolution
    mockVersionWsHandle.fetchClusterVersion.mockImplementation(async (name) => {
      if (name === 'failed-cluster') return 'v1.27.1-retried'
      return null
    })

    // Advance by RETRY_INTERVAL_MS + 1ms (15001ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS + 1)
    })

    // Wait for the retry promise to resolve
    await tick()

    expect(result.current.clusterVersions).toEqual({
      'success-cluster': 'v1.27.0',
      'failed-cluster': 'v1.27.1-retried',
    })
  })

  it('does not retry when agentConnected=false during retry interval', async () => {
    vi.useFakeTimers()
    const allClusters = [
      { name: 'failed-cluster', healthy: true, nodeCount: 2 },
    ] as any[]

    mockVersionWsHandle.fetchClusterVersion.mockResolvedValue(null) // first try fails

    const { rerender } = renderHook(({ agentConnected }) => useUpgradeStateMachine({
      allClusters,
      agentConnected,
      isDemoMode: false,
      openTrackedWs: vi.fn(),
      parseWsMessage: vi.fn(),
    }), {
      initialProps: { agentConnected: true }
    })

    // First fetch resolves
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    mockVersionWsHandle.fetchClusterVersion.mockClear()

    // Transition agentConnected to false
    rerender({ agentConnected: false })

    // Advance by RETRY_INTERVAL_MS + 1ms (15001ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS + 1)
    })

    expect(mockVersionWsHandle.fetchClusterVersion).not.toHaveBeenCalled()
  })
})

describe('useUpgradeStateMachine — TTL refresh', () => {
  it('clears fetchedClusters and version cache after VERSION_CACHE_TTL and re-fetches all clusters', async () => {
    vi.useFakeTimers()
    const allClusters = [
      { name: 'cluster-1', healthy: true, nodeCount: 1 },
      { name: 'cluster-2', healthy: true, nodeCount: 2 },
    ] as any[]

    mockVersionWsHandle.fetchClusterVersion.mockResolvedValue('v1.27.0')

    const { result } = renderHook(() => useUpgradeStateMachine({
      allClusters,
      agentConnected: true,
      isDemoMode: false,
      openTrackedWs: vi.fn(),
      parseWsMessage: vi.fn(),
    }))

    // First fetch resolves
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    expect(result.current.clusterVersions).toEqual({
      'cluster-1': 'v1.27.0',
      'cluster-2': 'v1.27.0',
    })

    // Reset spies
    mockVersionWsHandle.fetchClusterVersion.mockClear()
    mockClearCachedVersions.mockClear()

    mockVersionWsHandle.fetchClusterVersion.mockResolvedValue('v1.28.0-updated')

    // Advance by VERSION_CACHE_TTL
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VERSION_CACHE_TTL)
    })

    expect(mockClearCachedVersions).toHaveBeenCalledWith(['cluster-1', 'cluster-2'])

    await tick()

    expect(result.current.clusterVersions).toEqual({
      'cluster-1': 'v1.28.0-updated',
      'cluster-2': 'v1.28.0-updated',
    })
  })
})

describe('useUpgradeStateMachine — Agent reconnect', () => {
  it('clears fetchedClusters and failedClusters when agentConnected transitions from false to true, but not when it stays true', async () => {
    vi.useFakeTimers()
    const allClusters = [
      { name: 'cluster-1', healthy: true, nodeCount: 1 },
    ] as any[]

    mockVersionWsHandle.fetchClusterVersion.mockResolvedValue('v1.27.0')

    const { result, rerender } = renderHook(({ agentConnected }) => useUpgradeStateMachine({
      allClusters,
      agentConnected,
      isDemoMode: false,
      openTrackedWs: vi.fn(),
      parseWsMessage: vi.fn(),
    }), {
      initialProps: { agentConnected: true }
    })

    // First fetch resolves
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    expect(result.current.clusterVersions).toEqual({
      'cluster-1': 'v1.27.0',
    })

    // Reset spies
    mockVersionWsHandle.fetchClusterVersion.mockClear()

    // Scenario A: agentConnected stays true.
    // Since it stayed true, it should NOT re-fetch cluster-1!
    rerender({ agentConnected: true })
    await tick()
    expect(mockVersionWsHandle.fetchClusterVersion).not.toHaveBeenCalled()

    // Scenario B: transition agentConnected true -> false
    rerender({ agentConnected: false })
    await tick()

    // Scenario C: transition agentConnected false -> true (reconnect!)
    // This should clear fetchedClustersRef and trigger a new fetch for cluster-1!
    mockVersionWsHandle.fetchClusterVersion.mockResolvedValue('v1.27.0-reconnected')
    rerender({ agentConnected: true })
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    await tick()
    expect(result.current.clusterVersions).toEqual({
      'cluster-1': 'v1.27.0-reconnected',
    })
  })
})

describe('useUpgradeStateMachine — Cleanup', () => {
  it('cancels retry and refresh intervals on unmount and calls handle.destroy()', () => {
    const spyClearInterval = vi.spyOn(globalThis, 'clearInterval')
    mockVersionWsHandle.destroy.mockClear()

    const clusters = [{ name: 'cluster-1', healthy: true, nodeCount: 1 }] as any[]
    const { unmount } = renderHook(() => useUpgradeStateMachine({
      allClusters: clusters,
      agentConnected: true,
      isDemoMode: false,
      openTrackedWs: vi.fn(),
      parseWsMessage: vi.fn(),
    }))

    unmount()

    expect(spyClearInterval).toHaveBeenCalledTimes(2)
    expect(mockVersionWsHandle.destroy).toHaveBeenCalledTimes(1)
    spyClearInterval.mockRestore()
  })
})
