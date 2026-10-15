/**
 * Track dashboard visit frequency per path in localStorage.
 *
 * On each navigation, records a visit count per dashboard path. The
 * prefetch-on-startup logic that consumes this data lives in
 * dashboardPrefetch.ts (kept separate so that recordDashboardVisit's
 * callers, like useLastRoute.ts, don't transitively depend on
 * dashboardChunks.ts's dynamic imports of every dashboard — which include
 * Arcade.tsx, a consumer of useLastRoute.ts, and closed a circular
 * dependency).
 */

import { ROUTES } from '../config/routes'

const VISIT_COUNTS_KEY = 'kubestellar-dashboard-visits'
export const DEFAULT_TOP_N = 5

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
  if (path.startsWith(ROUTES.AUTH_BASE) || path === ROUTES.LOGIN || path === ROUTES.SETTINGS) return

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
