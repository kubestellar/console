import { STORAGE_KEY_MAIN_DASHBOARD_CARDS } from '../../../lib/constants/storage'
import { getDefaultCardsForDashboard } from '../../../config/dashboards'
import type { Card, DashboardData } from '../dashboardUtils'

export interface CachedDashboard {
  dashboard: DashboardData | null
  cards: Card[]
  timestamp: number
}

export interface PendingDeploy {
  workloadName: string
  namespace: string
  sourceCluster: string
  targetClusters: string[]
  groupName: string
}

let dashboardCache: CachedDashboard | null = null

export const AUTO_REFRESH_INTERVAL_MS = 30_000
export const DASHBOARD_STORAGE_KEY = STORAGE_KEY_MAIN_DASHBOARD_CARDS
export const DEFAULT_DASHBOARD_CARDS: Card[] = getDefaultCardsForDashboard('main')

export function getDashboardCache(): CachedDashboard | null {
  return dashboardCache
}

export function setDashboardCache(cache: CachedDashboard | null): void {
  dashboardCache = cache
}
