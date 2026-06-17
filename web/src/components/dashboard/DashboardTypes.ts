import type { Card, DashboardData } from './dashboardUtils'
import type { useDashboardState } from './DashboardState'

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

export interface DashboardCardSuggestion {
  type: string
  title: string
  visualization: string
  config: Record<string, unknown>
}

export interface PendingRestoreCardLike {
  cardType: string
  config?: Record<string, unknown>
  cardTitle?: string
}

export interface DashboardClusterStats {
  clusterCount: number
  healthyClusters: number
  unhealthyClusters: number
  healthyNodes: number
  totalPods: number
  totalNamespaces: number
  totalNodes: number
}

export type DashboardState = ReturnType<typeof useDashboardState>
