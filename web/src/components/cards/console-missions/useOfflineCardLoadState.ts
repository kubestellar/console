/**
 * Computes the aggregate card loading state for ConsoleOfflineDetectionCard
 * from the three underlying data sources (nodes, GPU nodes, pod issues).
 * Extracted from the main component to keep it focused on composition.
 */
import { useMemo } from 'react'
import { buildOfflineDetectionCardLoadState, type OfflineDetectionCardLoadState } from './offlineDataTransforms'
import { OFFLINE_DETECTION_FAILURE_THRESHOLD } from './nodeCache'

interface UseOfflineCardLoadStateArgs {
  shouldUseDemoData: boolean
  isDemoMode: boolean
  allNodesCount: number
  nodesLoading: boolean
  nodesRefreshing: boolean
  nodesFailures: number
  gpuNodesCount: number
  gpuLoading: boolean
  gpuRefreshing: boolean
  gpuDemoFallback: boolean
  gpuFailed: boolean
  gpuFailures: number
  podIssuesCount: number
  podsLoading: boolean
  podsRefreshing: boolean
  podsDemoFallback: boolean
  podsFailed: boolean
  podsFailures: number
}

export function useOfflineCardLoadState({
  shouldUseDemoData,
  isDemoMode,
  allNodesCount,
  nodesLoading,
  nodesRefreshing,
  nodesFailures,
  gpuNodesCount,
  gpuLoading,
  gpuRefreshing,
  gpuDemoFallback,
  gpuFailed,
  gpuFailures,
  podIssuesCount,
  podsLoading,
  podsRefreshing,
  podsDemoFallback,
  podsFailed,
  podsFailures,
}: UseOfflineCardLoadStateArgs): OfflineDetectionCardLoadState {
  return useMemo(
    () => buildOfflineDetectionCardLoadState([
      {
        hasData: allNodesCount > 0,
        isLoading: !shouldUseDemoData && nodesLoading,
        isRefreshing: !shouldUseDemoData && nodesRefreshing,
        consecutiveFailures: shouldUseDemoData ? 0 : nodesFailures,
        isFailed: !shouldUseDemoData && nodesFailures >= OFFLINE_DETECTION_FAILURE_THRESHOLD,
      },
      {
        hasData: gpuNodesCount > 0,
        isLoading: gpuLoading,
        isRefreshing: gpuRefreshing,
        isDemoData: gpuDemoFallback,
        isFailed: gpuFailed,
        consecutiveFailures: gpuFailures,
      },
      {
        hasData: podIssuesCount > 0,
        isLoading: podsLoading,
        isRefreshing: podsRefreshing,
        isDemoData: podsDemoFallback,
        isFailed: podsFailed,
        consecutiveFailures: podsFailures,
      },
    ], shouldUseDemoData || isDemoMode),
    [
      allNodesCount,
      gpuDemoFallback,
      gpuFailed,
      gpuFailures,
      gpuLoading,
      gpuNodesCount,
      gpuRefreshing,
      isDemoMode,
      nodesFailures,
      nodesLoading,
      nodesRefreshing,
      podIssuesCount,
      podsDemoFallback,
      podsFailed,
      podsFailures,
      podsLoading,
      podsRefreshing,
      shouldUseDemoData,
    ],
  )
}
