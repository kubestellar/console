import type { TFunction } from 'i18next'
import type { MutableRefObject } from 'react'
import type { PodMetrics } from '../../../hooks/usePrometheusMetrics'
import type { LLMdStack } from '../../../hooks/useStackDiscovery'
import type { KVCacheStats } from '../../../lib/llmd/mockData'

export type MetricType = 'util' | 'hitRate'
export type AggregationMode = 'aggregated' | 'disaggregated'
export type ViewMode = 'gauges' | 'horseshoe' | 'heatmap'
export type CardsCommonTFunction = TFunction<readonly ['cards', 'common']>

export interface PodMetricHistory {
  util: number[]
  hitRate: number[]
}

export type PodHistoryMap = Record<string, PodMetricHistory>

export interface PanelPosition {
  x: number
  y: number
}

export interface AggregateMetrics {
  avgUtil: number
  totalUsed: number
  totalCapacity: number
  avgHitRate: number
}

export interface HeatmapLegendItem {
  color: string
  label: string
}

export interface VisualizationProps {
  gaugeRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>
  isExpanded: boolean
  onGaugeClick: (podName: string, element: HTMLButtonElement | null) => void
  selectedPod: string | null
  stats: KVCacheStats[]
  t: CardsCommonTFunction
  viewMode: ViewMode
}

export interface DetailPanelProps {
  onClose: () => void
  onToggleMetric: (metric: MetricType) => void
  panelPosition: PanelPosition | null
  podHistory: PodHistoryMap
  selectedMetrics: MetricType[]
  selectedPod: string | null
  stats: KVCacheStats[]
  t: CardsCommonTFunction
}

export interface HeaderProps {
  aggregationMode: AggregationMode
  isDemoMode: boolean
  onAggregationModeChange: (mode: AggregationMode) => void
  onViewModeToggle: (nextMode: ViewMode) => void
  selectedStack: LLMdStack | null
  t: CardsCommonTFunction
  viewMode: ViewMode
}

export interface SummaryStatsProps {
  aggregateMetrics: AggregateMetrics
  podCount: number
  t: CardsCommonTFunction
  trend: number
}

export interface GenerateStatsArgs {
  aggregationMode: AggregationMode
  isDemoMode: boolean
  prometheusMetrics: Record<string, PodMetrics> | null
  selectedStack: LLMdStack | null
}
