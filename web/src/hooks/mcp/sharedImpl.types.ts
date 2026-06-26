// Type definitions for cluster cache and shared state

import type { ClusterInfo } from './types'

export interface ClusterCache {
  // --- Data slice (heavy; notified inside startTransition) ---
  clusters: ClusterInfo[]
  lastUpdated: Date | null
  consecutiveFailures: number
  isFailed: boolean
  // --- UI slice (tiny; notified urgently, outside startTransition) ---
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  lastRefresh: Date | null
}

/** Fields that belong to the heavy data slice. Source of truth for the split. */
export const DATA_FIELDS: ReadonlyArray<keyof ClusterCache> = [
  'clusters',
  'lastUpdated',
  'consecutiveFailures',
  'isFailed',
]

/** Fields that belong to the tiny UI-indicator slice. */
export const UI_FIELDS: ReadonlyArray<keyof ClusterCache> = [
  'isLoading',
  'isRefreshing',
  'error',
  'lastRefresh',
]

export function updatesTouchData(updates: Partial<ClusterCache>): boolean {
  for (const field of (DATA_FIELDS || [])) {
    if (field in updates) return true
  }
  return false
}

export function updatesTouchUI(updates: Partial<ClusterCache>): boolean {
  for (const field of (UI_FIELDS || [])) {
    if (field in updates) return true
  }
  return false
}

export type ClusterSubscriber = (cache: ClusterCache) => void

// Re-export ClusterInfo and ClusterHealth from types module
export type { ClusterInfo, ClusterHealth } from './types'
