import { ClusterInfo } from '../../hooks/useMCP'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'

/**
 * Canonical cluster health states surfaced by the shared helper.
 *
 * Priority (first match wins):
 * 1. `neverConnected` → `unknown`  (never produced a successful probe)
 * 2. `healthUnknown`  → `unknown`  (no probe has returned yet)
 * 3. unreachable      → `unreachable`
 * 4. `healthy === true`  → `healthy`
 * 5. `healthy === false` → `unhealthy`
 * 6. fallback         → `loading` or `unknown`
 *
 * - `healthy`    — backend reports healthy=true
 * - `unhealthy`  — backend reports healthy=false AND no higher-priority
 *                  signal (healthUnknown/neverConnected) is set
 * - `unreachable`— reachable=false or an unreachable errorType
 * - `loading`    — initial load with no data yet (nodeCount and reachable
 *                  both undefined) OR an explicit refresh is in progress
 * - `unknown`    — no authoritative health signal (no successful probe
 *                  yet or `healthUnknown`/`neverConnected` from backend)
 *
 * See #5923, #5924, #5928, #5942 for the history behind these states.
 */
export type ClusterHealthState =
  | 'healthy'
  | 'unhealthy'
  | 'unreachable'
  | 'loading'
  | 'unknown'

// Helper to determine if cluster is unreachable vs just unhealthy
// IMPORTANT: Only mark as unreachable with CORROBORATED evidence
// The useMCP hook only sets reachable=false after 5 minutes of consecutive failures
// This prevents fluctuation from transient network issues or slow health checks
export const isClusterUnreachable = (c: ClusterInfo): boolean => {
  // Only trust reachable=false - this is set after 5+ minutes of failures
  // Do NOT use nodeCount === 0 alone as it can be transient
  if (c.reachable === false) return true
  // Error type is only set after confirmed failures, so trust it
  if (c.errorType && ['timeout', 'network', 'certificate', 'auth'].includes(c.errorType)) return true
  return false
}

/**
 * Centralised cluster-health state machine (#5928).
 *
 * This is the single source of truth for cluster health across the whole
 * UI. Every component that needs to decide between healthy / unhealthy /
 * loading / unknown / unreachable MUST use this helper so that badges,
 * counts, and status indicators never disagree (#5920).
 */
export const getClusterHealthState = (c: ClusterInfo): ClusterHealthState => {
  // Priority order matters here — see #5942. The backend sets
  // `healthy: false` together with `healthUnknown: true` / `neverConnected: true`
  // for clusters that have never successfully reported health. We must
  // surface those as `unknown`, not as `unhealthy`, so the UI doesn't
  // alarm on clusters we've simply never heard from.
  if (c.neverConnected === true) return 'unknown'
  if (c.healthUnknown === true) return 'unknown'
  if (isClusterUnreachable(c)) return 'unreachable'
  if (c.healthy === true) return 'healthy'
  if (c.healthy === false) return 'unhealthy'
  // Health is undefined. Prefer a distinct `loading` state when we're
  // actively refreshing and have no cached node data (#5924).
  if (c.refreshing === true && (c.nodeCount === undefined || c.nodeCount === 0)) {
    return 'loading'
  }
  if (c.nodeCount === undefined && c.reachable === undefined) {
    return 'loading'
  }
  // No authoritative health signal — surface as unknown rather than
  // silently defaulting to healthy (#5923).
  return 'unknown'
}

/**
 * Backwards-compatible boolean helper used by stats counts and filter
 * tabs. Returns true only when the state machine reports `healthy`.
 * Previously this helper defaulted to true when health was unknown and
 * nodes were present; that was the bug behind #5923.
 */
export const isClusterHealthy = (c: ClusterInfo): boolean => {
  return getClusterHealthState(c) === 'healthy'
}

// Helper to check if cluster has token/auth expired error
export const isClusterTokenExpired = (c: ClusterInfo): boolean => {
  return c.errorType === 'auth'
}

// Helper to check if cluster is network offline (not auth issue)
export const isClusterNetworkOffline = (c: ClusterInfo): boolean => {
  if (!isClusterUnreachable(c)) return false
  return c.errorType !== 'auth'
}

// Helper to determine if cluster health is still loading
// Returns true only when actively refreshing - keeps left/right indicators in sync
export const isClusterLoading = (c: ClusterInfo): boolean => {
  return c.refreshing === true
}

// Helper to format labels/annotations for tooltip
export function formatMetadata(labels?: Record<string, string>, annotations?: Record<string, string>): string {
  const parts: string[] = []
  if (labels && Object.keys(labels).length > 0) {
    parts.push('Labels:')
    Object.entries(labels).slice(0, 5).forEach(([k, v]) => {
      parts.push(`  ${k}=${v}`)
    })
    if (Object.keys(labels).length > 5) {
      parts.push(`  ... and ${Object.keys(labels).length - 5} more`)
    }
  }
  if (annotations && Object.keys(annotations).length > 0) {
    if (parts.length > 0) parts.push('')
    parts.push('Annotations:')
    Object.entries(annotations).slice(0, 3).forEach(([k, v]) => {
      const truncatedValue = v.length > 50 ? v.slice(0, 50) + '...' : v
      parts.push(`  ${k}=${truncatedValue}`)
    })
    if (Object.keys(annotations).length > 3) {
      parts.push(`  ... and ${Object.keys(annotations).length - 3} more`)
    }
  }
  return parts.join('\n')
}

export interface ClusterCard {
  id: string
  card_type: string
  config: Record<string, unknown>
  title?: string
}

// Storage key for cluster page cards
const CLUSTERS_CARDS_KEY = 'kubestellar-clusters-cards'

export function loadClusterCards(): ClusterCard[] {
  try {
    const stored = safeGetItem(CLUSTERS_CARDS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function saveClusterCards(cards: ClusterCard[]): void {
  safeSetItem(CLUSTERS_CARDS_KEY, JSON.stringify(cards))
}
