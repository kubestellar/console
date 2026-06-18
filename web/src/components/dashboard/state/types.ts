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

export const AUTO_REFRESH_INTERVAL_MS = 30_000
