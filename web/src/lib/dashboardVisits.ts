/**
 * Track dashboard visit frequency and prefetch top-visited dashboard chunks.
 *
 * On each navigation, records a visit count per dashboard path in localStorage.
 * On app startup, prefetches the route chunks for the user's top N most-visited
 * dashboards so they load instantly when navigated to.
 */

import { DASHBOARD_CHUNKS } from './dashboardChunks'
import { RETRY_DELAY_MS } from './constants/network'

const VISIT_COUNTS_KEY = 'kubestellar-dashboard-visits'
const DEFAULT_TOP_N = 5

interface VisitCounts {
  [path: string]: number
}

function getVisitCounts(): VisitCounts {
  try {
    return JSON.parse(localStorage.getItem(VISIT_COUNTS_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveVisitCounts(counts: VisitCounts): void {
  try {
    localStorage.setItem(VISIT_COUNTS_KEY, JSON.stringify(counts))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Record a visit to a dashboard path.
 * Call this on each navigation to a dashboard route.
 */
export function recordDashboardVisit(path: string): void {
  // Only track dashboard paths (skip auth, settings, etc.)
  if (path.startsWith('/auth') || path === '/login' || path === '/settings') return

  const counts = getVisitCounts()
  counts[path] = (counts[path] || 0) + 1
  saveVisitCounts(counts)
}

/**
 * Get the top N most-visited dashboard paths, sorted by visit count descending.
 */
export function getTopVisitedDashboards(n: number = DEFAULT_TOP_N): string[] {
  const counts = getVisitCounts()
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([path]) => path)
}

/** Map path to DASHBOARD_CHUNKS key */
function pathToChunkId(path: string): string {
  if (path === '/') return 'dashboard'
  return path.replace(/^\//, '')
}

/**
 * Prefetch route chunks for the user's top-visited dashboards.
 * Call once on app startup (e.g., in main.tsx or App.tsx).
 * Skips the current route (already loading) and uses requestIdleCallback
 * to avoid blocking initial render.
 */
export function prefetchTopDashboards(currentPath?: string, n: number = DEFAULT_TOP_N): void {
  const topPaths = getTopVisitedDashboards(n)
  if (topPaths.length === 0) return

  const prefetch = () => {
    for (const path of topPaths) {
      if (path === currentPath) continue // Already loading
      const chunkId = pathToChunkId(path)
      const loader = DASHBOARD_CHUNKS[chunkId]
      if (loader) {
        loader().catch(() => {}) // Fire and forget
      }
    }
  }

  // Use requestIdleCallback to avoid competing with initial render
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(prefetch, { timeout: 3000 })
  } else {
    setTimeout(prefetch, RETRY_DELAY_MS)
  }
}
