import { STORAGE_KEY_MAIN_DASHBOARD_CARDS } from '../../lib/constants/storage'
import { getDefaultCardsForDashboard } from '../../config/dashboards'
import { loadDashboardCardsFromStorage } from '../../lib/dashboards/dashboardCardStorage'
import type { Card, DashboardData } from './dashboardUtils'

/** How often the auto-refresh timer fires (ms). */
export const AUTO_REFRESH_INTERVAL_MS = 30_000

/** localStorage key used to persist the main dashboard card list. */
export const DASHBOARD_STORAGE_KEY = STORAGE_KEY_MAIN_DASHBOARD_CARDS

/** Canonical default card set for the main dashboard. */
export const DEFAULT_DASHBOARD_CARDS: Card[] = getDefaultCardsForDashboard('main')

/** Shape of the in-memory dashboard cache shared across hook instances. */
export interface CachedDashboard {
  dashboard: DashboardData | null
  cards: Card[]
  timestamp: number
}

/** Payload describing a pending workload-deploy operation. */
export interface PendingDeploy {
  workloadName: string
  namespace: string
  sourceCluster: string
  targetClusters: string[]
  groupName: string
}

/**
 * Module-level in-memory cache.
 * Persists across React renders and survives client-side route navigation,
 * enabling instant display of previously loaded cards.
 */
export let dashboardCache: CachedDashboard | null = null

/** Replace the entire cache entry. */
export function setDashboardCache(value: CachedDashboard | null): void {
  dashboardCache = value
}

/** Merge a partial update into the existing cache entry (no-op if cache is null). */
export function patchDashboardCache(patch: Partial<Omit<CachedDashboard, 'dashboard'>> & { timestamp: number }): void {
  if (dashboardCache) {
    dashboardCache = { ...dashboardCache, ...patch }
  }
}

/**
 * Computes the initial card list for the dashboard state hook.
 *
 * Priority order:
 * 1. In-memory cache (survives navigation within the same tab)
 * 2. localStorage (survives page reload)
 * 3. Hard-coded defaults
 */
export function initLocalCardsState(): Card[] {
  if ((dashboardCache?.cards?.length ?? 0) > 0) return dashboardCache!.cards
  const restoredCards = loadDashboardCardsFromStorage<Card>(
    DASHBOARD_STORAGE_KEY,
    DEFAULT_DASHBOARD_CARDS,
    { requirePosition: true, requireGridCoordinates: true },
  )
  if (restoredCards.length > 0) return restoredCards
  return DEFAULT_DASHBOARD_CARDS
}
