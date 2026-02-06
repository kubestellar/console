import { ClusterInfo } from '../../hooks/useMCP'

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
    const stored = localStorage.getItem(CLUSTERS_CARDS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function saveClusterCards(cards: ClusterCard[]): void {
  localStorage.setItem(CLUSTERS_CARDS_KEY, JSON.stringify(cards))
}
