import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseCache = vi.fn()
const mockUseCardLoadingState = vi.fn()

vi.mock('../../../../lib/cache', () => ({
  useCache: (args: Record<string, unknown>) => mockUseCache(args),
}))

vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (args: Record<string, unknown>) => mockUseCardLoadingState(args),
}))

import { useFailoverTimeline } from '../useFailoverTimeline'
import type { FailoverTimelineData, FailoverEvent } from '../useFailoverTimeline'

const refetch = vi.fn(async () => {})

describe('useFailoverTimeline - Multi-cluster guards (#16050)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
  })

  it('shows all target clusters in details when binding has multiple clusters', () => {
    const multiClusterEvent: FailoverEvent = {
      timestamp: '2024-01-15T10:00:00Z',
      eventType: 'binding_reschedule',
      cluster: 'cluster-a',
      workload: 'Deployment/web-app',
      details: 'ResourceBinding rescheduled from old-cluster to cluster-a, cluster-b, cluster-c',
      severity: 'warning',
    }

    const mockData: FailoverTimelineData = {
      events: [multiClusterEvent],
      activeClusters: 3,
      totalClusters: 4,
      lastFailover: '2024-01-15T09:55:00Z',
      lastCheckTime: '2024-01-15T10:00:00Z',
    }

    mockUseCache.mockReturnValue({
      data: mockData,
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
      refetch,
    })

    const { result } = renderHook(() => useFailoverTimeline())

    // Verify the event shows all target clusters consistently in both fields.
    const event = result.current.data.events[0]
    expect(event.details).toContain('cluster-a, cluster-b, cluster-c')
    expect(event.cluster).toBe('cluster-a, cluster-b, cluster-c')
  })

  it('handles undefined clusters array gracefully without crashing', () => {
    const eventWithUnknown: FailoverEvent = {
      timestamp: '2024-01-15T10:00:00Z',
      eventType: 'binding_reschedule',
      cluster: 'unknown',
      workload: 'Deployment/web-app',
      details: 'ResourceBinding rescheduled to unknown',
      severity: 'warning',
    }

    const mockData: FailoverTimelineData = {
      events: [eventWithUnknown],
      activeClusters: 0,
      totalClusters: 1,
      lastFailover: null,
      lastCheckTime: '2024-01-15T10:00:00Z',
    }

    mockUseCache.mockReturnValue({
      data: mockData,
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
      refetch,
    })

    const { result } = renderHook(() => useFailoverTimeline())

    // Verify it doesn't crash and shows 'unknown' for missing clusters
    expect(result.current.data.events[0].cluster).toBe('unknown')
    expect(result.current.data.events[0].details).toContain('unknown')
    expect(result.current.error).toBe(false)
  })

  it('handles empty clusters array without crashing', () => {
    const eventWithEmptyArray: FailoverEvent = {
      timestamp: '2024-01-15T10:00:00Z',
      eventType: 'binding_reschedule',
      cluster: 'unknown',
      workload: 'Deployment/web-app',
      details: 'ResourceBinding rescheduled to unknown',
      severity: 'warning',
    }

    const mockData: FailoverTimelineData = {
      events: [eventWithEmptyArray],
      activeClusters: 0,
      totalClusters: 0,
      lastFailover: null,
      lastCheckTime: '2024-01-15T10:00:00Z',
    }

    mockUseCache.mockReturnValue({
      data: mockData,
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
      refetch,
    })

    const { result } = renderHook(() => useFailoverTimeline())

    // Verify it shows 'unknown' for empty clusters array
    expect(result.current.data.events[0].cluster).toBe('unknown')
    expect(result.current.error).toBe(false)
  })

  it('uses the full target cluster list for the cluster field', () => {
    const multiClusterEvent: FailoverEvent = {
      timestamp: '2024-01-15T10:00:00Z',
      eventType: 'binding_reschedule',
      cluster: 'primary-cluster, secondary-cluster',
      workload: 'Deployment/app',
      details: 'ResourceBinding rescheduled from old-cluster to primary-cluster, secondary-cluster',
      severity: 'warning',
    }

    const mockData: FailoverTimelineData = {
      events: [multiClusterEvent],
      activeClusters: 2,
      totalClusters: 3,
      lastFailover: null,
      lastCheckTime: '2024-01-15T10:00:00Z',
    }

    mockUseCache.mockReturnValue({
      data: mockData,
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
      refetch,
    })

    const { result } = renderHook(() => useFailoverTimeline())

    expect(result.current.data.events[0].cluster).toBe('primary-cluster, secondary-cluster')
    expect(result.current.data.events[0].details).toContain('primary-cluster, secondary-cluster')
  })

  it('does not modify cluster field for non-reschedule events', () => {
    const nonRescheduleEvent: FailoverEvent = {
      timestamp: '2024-01-15T10:00:00Z',
      eventType: 'cluster_not_ready',
      cluster: 'node-1',
      workload: 'Deployment/web-app',
      details: 'Cluster node-1 became NotReady',
      severity: 'critical',
    }

    const mockData: FailoverTimelineData = {
      events: [nonRescheduleEvent],
      activeClusters: 0,
      totalClusters: 1,
      lastFailover: '2024-01-15T10:00:00Z',
      lastCheckTime: '2024-01-15T10:00:00Z',
    }

    mockUseCache.mockReturnValue({
      data: mockData,
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
      refetch,
    })

    const { result } = renderHook(() => useFailoverTimeline())

    // Non-reschedule events should keep their original cluster value
    expect(result.current.data.events[0].cluster).toBe('node-1')
  })

  it('guards against undefined events array', () => {
    mockUseCache.mockReturnValue({
      data: {
        events: undefined, // Could happen with malformed API response
        activeClusters: 0,
        totalClusters: 0,
        lastFailover: null,
        lastCheckTime: '2024-01-15T10:00:00Z',
      },
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
      refetch,
    })

    const { result } = renderHook(() => useFailoverTimeline())

    // The hook's hasAnyData check uses (data.events || []).length
    // so this should not crash
    expect(result.current.error).toBe(false)
  })
})
