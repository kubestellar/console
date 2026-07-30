import type { LucideIcon } from 'lucide-react'
import type { DrillDownViewType } from '../../../../hooks/useDrillDown'

export interface MultiClusterSummaryDrillDownProps {
  data: Record<string, unknown>
  viewType: DrillDownViewType
}

export type SummaryItem = Record<string, unknown>

export interface ViewConfig {
  icon: LucideIcon
  color: string
  bgColor: string
  dataKey: string
  nameKey: string
  getStatus: (item: SummaryItem) => string
}

export interface StatusBadgeConfig {
  icon: LucideIcon
  color: string
  bg: string
}

export interface SummaryStats {
  total: number
  healthy: number
  issues: number
  firing: number
  resolved: number
}

export interface ClusterErrorEntry {
  cluster: string
  errorType: string
}

export const HEALTHY_STATUSES = [
  'running',
  'healthy',
  'ready',
  'active',
  'deployed',
  'succeeded',
  'available',
  'normal',
]
