/**
 * Prefetch route chunks for the user's top-visited dashboards on startup.
 *
 * Split out of dashboardVisits.ts (docs#24xxx-style cycle fix): this module
 * is the only one that needs DASHBOARD_CHUNKS's dynamic imports of every
 * dashboard component, so only its caller (main.tsx) pays for that edge —
 * recordDashboardVisit's callers (e.g. useLastRoute.ts) no longer
 * transitively import DASHBOARD_CHUNKS, which closed a circular dependency
 * through Arcade.tsx.
 */

import { DASHBOARD_CHUNKS } from './dashboardChunks'
import { getTopVisitedDashboards, DEFAULT_TOP_N } from './dashboardVisits'
import { RETRY_DELAY_MS } from './constants/network'
import { logger } from './logger'

export const PREFETCH_IDLE_TIMEOUT_MS = 3_000

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
        loader().catch((err) => {
          logger.warn(`Failed to prefetch dashboard chunk for ${path}:`, err)
        })
      }
    }
  }

  // Use requestIdleCallback to avoid competing with initial render
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(prefetch, { timeout: PREFETCH_IDLE_TIMEOUT_MS })
  } else {
    setTimeout(prefetch, RETRY_DELAY_MS)
  }
}
