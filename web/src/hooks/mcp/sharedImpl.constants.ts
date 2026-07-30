// Constants and configuration for cluster cache and MCP hooks

import { DEFAULT_REFRESH_INTERVAL_MS } from '../../lib/constants'

// Re-export canonical constant under the name used by MCP hooks
export const REFRESH_INTERVAL_MS = DEFAULT_REFRESH_INTERVAL_MS

// Polling intervals for cluster and GPU data freshness
export const CLUSTER_POLL_INTERVAL_MS = 60000  // 60 seconds
export const GPU_POLL_INTERVAL_MS = 30000      // 30 seconds

/** Cache TTL: matches cluster poll interval for freshness checks */
export const CACHE_TTL_MS = CLUSTER_POLL_INTERVAL_MS

/** Backoff multiplier applied per consecutive failure (2x, 4x, 8x …) */
const FAILURE_BACKOFF_MULTIPLIER = 2
/** Maximum polling interval after repeated failures (10 minutes) */
const MAX_BACKOFF_INTERVAL_MS = 600_000

export function getEffectiveInterval(baseInterval: number, consecutiveFailures = 0): number {
  if (consecutiveFailures <= 0) return baseInterval
  const multiplier = Math.pow(FAILURE_BACKOFF_MULTIPLIER, Math.min(consecutiveFailures, 5))
  return Math.min(baseInterval * multiplier, MAX_BACKOFF_INTERVAL_MS)
}

/** Debounce delay for batching rapid cluster health check notifications */
export const CLUSTER_NOTIFY_DEBOUNCE_MS = 50

// Minimum time to show the "Updating" indicator (ensures visibility for fast API responses)
export const MIN_REFRESH_INDICATOR_MS = 500

// Max reconnect attempts before giving up (prevents infinite loops)
export const MAX_RECONNECT_ATTEMPTS = 3
export const RECONNECT_BASE_DELAY_MS = 5000

// Track consecutive health check failures to avoid spamming
export const MAX_HEALTH_CHECK_FAILURES = 3

// Track backend API failures for distribution detection separately
export const MAX_DISTRIBUTION_FAILURES = 2

// Concurrency limit for health checks - rolling concurrency for 100+ clusters
// Keep at 2 to avoid overwhelming the local agent WebSocket connection
export const HEALTH_CHECK_CONCURRENCY = 6

// Backend availability check interval
export const WS_BACKEND_RECHECK_INTERVAL = 120000 // Re-check backend every 2 minutes
