import { getDefaultCardsForDashboard } from '../../config/dashboards'
import { STORAGE_KEY_MAIN_DASHBOARD_CARDS } from '../../lib/constants/storage'
import type { Card, DashboardData } from './dashboardUtils'

export const AUTO_REFRESH_INTERVAL_MS = 30_000

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

export const DASHBOARD_STORAGE_KEY = STORAGE_KEY_MAIN_DASHBOARD_CARDS
export const DEFAULT_DASHBOARD_CARDS: Card[] = getDefaultCardsForDashboard('main')

export type DashboardState = ReturnType<typeof import('./DashboardStateMain').useDashboardState>
