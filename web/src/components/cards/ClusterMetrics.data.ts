import { CLUSTER_POLL_INTERVAL_MS } from '../../hooks/mcp/shared'
import { MS_PER_SECOND, MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../../lib/constants/time'
import {
  METRIC_CPU_COLOR, METRIC_MEMORY_COLOR, METRIC_PODS_COLOR, METRIC_NODES_COLOR,
} from '../../lib/theme/chartColors'

export type TimeRange = '15m' | '1h' | '6h' | '24h'
export type MetricType = 'cpu' | 'memory' | 'pods' | 'nodes'
export type ChartMode = 'total' | 'per-cluster'

interface DemoMetricTuning {
  primaryAmplitudeRatio: number
  secondaryAmplitudeRatio: number
  clusterPhaseOffset: number
  roundingStep: number
}

// History buffer is rebuilt client-side from live polling — nothing is
// persisted beyond the localStorage TTL below. MAX_HISTORY_POINTS bounds the
// buffer size, and at the shared cluster poll interval the buffer can span at
// most MAX_HISTORY_DURATION_MS of wall-clock time. Any time-range option
// larger than that can never have data, so we hide it from the selector
// (fixes issue #6048).
export const MAX_HISTORY_POINTS = 60                                                  // buffer cap (points)
export const MAX_HISTORY_DURATION_MS = MAX_HISTORY_POINTS * CLUSTER_POLL_INTERVAL_MS  // max wall-clock span of buffer
export const MIN_POINT_SPACING_MS = 30 * MS_PER_SECOND
const FIFTEEN_MIN_MS = 15 * MS_PER_MINUTE
const SIX_HOURS_MS = 6 * MS_PER_HOUR
const TWENTY_FOUR_HOURS_MS = MS_PER_DAY

const LEGACY_15M_POINTS = 15
const LEGACY_15M_INTERVAL_MS = MS_PER_MINUTE
const LEGACY_1H_POINTS = 20
const LEGACY_1H_INTERVAL_MS = 3 * MS_PER_MINUTE
const LEGACY_6H_POINTS = 24
const LEGACY_6H_INTERVAL_MS = 15 * MS_PER_MINUTE
const LEGACY_24H_POINTS = 24
const LEGACY_24H_INTERVAL_MS = MS_PER_HOUR
const FULL_CYCLE_RADIANS = Math.PI * 2
const DEMO_PRIMARY_WAVE_PERIOD_POINTS = 18
const DEMO_SECONDARY_WAVE_PERIOD_POINTS = 7
const DEMO_MIN_VALUE = 0
const DEMO_METRIC_TUNING: Record<MetricType, DemoMetricTuning> = {
  cpu: { primaryAmplitudeRatio: 0.022, secondaryAmplitudeRatio: 0.008, clusterPhaseOffset: 0.6, roundingStep: 1 },
  memory: { primaryAmplitudeRatio: 0.018, secondaryAmplitudeRatio: 0.006, clusterPhaseOffset: 0.45, roundingStep: 0.1 },
  pods: { primaryAmplitudeRatio: 0.035, secondaryAmplitudeRatio: 0.012, clusterPhaseOffset: 0.75, roundingStep: 1 },
  nodes: { primaryAmplitudeRatio: 0, secondaryAmplitudeRatio: 0, clusterPhaseOffset: 0, roundingStep: 1 },
}

/** Height (px) of the chart area — used for both the chart and its Suspense fallback */
export const CHART_AREA_MIN_HEIGHT = 160

export const CHART_AREA_STYLE = { minHeight: CHART_AREA_MIN_HEIGHT } as const
export const CHART_FALLBACK_STYLE = { height: CHART_AREA_MIN_HEIGHT } as const

/** Metric name display threshold before truncation */
export const MAX_METRIC_NAME_DISPLAY = 15
/** Length to truncate metric names to when they exceed the display threshold */
export const TRUNCATED_METRIC_NAME = 12

const TIME_RANGE_KEYS: Array<{
  value: TimeRange
  labelKey:
    | 'clusterMetrics.timeRange15m'
    | 'clusterMetrics.timeRange1h'
    | 'clusterMetrics.timeRange6h'
    | 'clusterMetrics.timeRange24h'
  points: number
  intervalMs: number
  rangeMs: number
}> = [
  { value: '15m', labelKey: 'clusterMetrics.timeRange15m', points: LEGACY_15M_POINTS, intervalMs: LEGACY_15M_INTERVAL_MS, rangeMs: FIFTEEN_MIN_MS },
  { value: '1h', labelKey: 'clusterMetrics.timeRange1h', points: LEGACY_1H_POINTS, intervalMs: LEGACY_1H_INTERVAL_MS, rangeMs: MS_PER_HOUR },
  { value: '6h', labelKey: 'clusterMetrics.timeRange6h', points: LEGACY_6H_POINTS, intervalMs: LEGACY_6H_INTERVAL_MS, rangeMs: SIX_HOURS_MS },
  { value: '24h', labelKey: 'clusterMetrics.timeRange24h', points: LEGACY_24H_POINTS, intervalMs: LEGACY_24H_INTERVAL_MS, rangeMs: TWENTY_FOUR_HOURS_MS },
]

// Only expose time ranges the client-side history buffer can actually cover.
// At CLUSTER_POLL_INTERVAL_MS = 60s and MAX_HISTORY_POINTS = 60, this yields
// a 60-minute ceiling — so '15m' and '1h' remain, while '6h' and '24h' are
// filtered out (they would always render as sparse/empty, issue #6048).
export const SUPPORTED_TIME_RANGE_KEYS = TIME_RANGE_KEYS.filter(
  (opt) => opt.rangeMs <= MAX_HISTORY_DURATION_MS,
)

export const TIME_RANGE_MS: Record<TimeRange, number> = {
  '15m': FIFTEEN_MIN_MS,
  '1h': MS_PER_HOUR,
  '6h': SIX_HOURS_MS,
  '24h': TWENTY_FOUR_HOURS_MS,
}

export const SUPPORTED_TIME_RANGE_VALUES = new Set<TimeRange>(
  SUPPORTED_TIME_RANGE_KEYS.map((opt) => opt.value),
)
export const DEFAULT_TIME_RANGE: TimeRange =
  SUPPORTED_TIME_RANGE_KEYS[SUPPORTED_TIME_RANGE_KEYS.length - 1]?.value ?? '15m'


export const metricConfigBase = {
  cpu: { labelKey: 'clusterMetrics.cpuCores' as const, color: METRIC_CPU_COLOR, unit: '', baseValue: 65, variance: 30 },
  memory: { labelKey: 'clusterMetrics.memory' as const, color: METRIC_MEMORY_COLOR, unit: ' GB', baseValue: 72, variance: 20 },
  pods: { labelKey: 'clusterMetrics.pods' as const, color: METRIC_PODS_COLOR, unit: '', baseValue: 150, variance: 100 },
  nodes: { labelKey: 'clusterMetrics.nodes' as const, color: METRIC_NODES_COLOR, unit: '', baseValue: 10, variance: 5 } }

export interface ClusterMetricValues {
  cpu: number
  memory: number
  pods: number
  nodes: number
}

export interface MetricPoint {
  time: string
  timestamp: number
  cpu: number
  memory: number
  pods: number
  nodes: number
  // Per-cluster values for comparison mode
  clusters?: Record<string, ClusterMetricValues>
}

export interface ClusterMetricSource {
  name: string
  cpuCores?: number
  memoryGB?: number
  podCount?: number
  nodeCount?: number
}

const roundToStep = (value: number, step: number) => {
  if (step <= 0) return value
  return Math.round(value / step) * step
}

const getClusterMetricBaseValue = (cluster: ClusterMetricSource, metric: MetricType) => {
  if (metric === 'cpu') return cluster.cpuCores || 0
  if (metric === 'memory') return cluster.memoryGB || 0
  if (metric === 'pods') return cluster.podCount || 0
  return cluster.nodeCount || 0
}

const createDemoMetricValue = (baseValue: number, metric: MetricType, pointIndex: number, clusterIndex: number) => {
  if (baseValue <= 0) return DEMO_MIN_VALUE

  const tuning = DEMO_METRIC_TUNING[metric]
  const primaryAngle = ((pointIndex + (clusterIndex * tuning.clusterPhaseOffset)) * FULL_CYCLE_RADIANS) / DEMO_PRIMARY_WAVE_PERIOD_POINTS
  const secondaryAngle = ((pointIndex + clusterIndex) * FULL_CYCLE_RADIANS) / DEMO_SECONDARY_WAVE_PERIOD_POINTS
  const variationRatio = 1 +
    (Math.sin(primaryAngle) * tuning.primaryAmplitudeRatio) +
    (Math.cos(secondaryAngle) * tuning.secondaryAmplitudeRatio)

  return Math.max(DEMO_MIN_VALUE, roundToStep(baseValue * variationRatio, tuning.roundingStep))
}

export const buildDemoMetricHistory = (clusters: ClusterMetricSource[], now: number = Date.now()): MetricPoint[] => {
  return Array.from({ length: MAX_HISTORY_POINTS }, (_, pointIndex) => {
    const timestamp = now - ((MAX_HISTORY_POINTS - pointIndex - 1) * CLUSTER_POLL_INTERVAL_MS)
    const clusterValues: Record<string, ClusterMetricValues> = {}
    let totalCpu = 0
    let totalMemory = 0
    let totalPods = 0
    let totalNodes = 0

    ;(clusters || []).forEach((cluster: ClusterMetricSource, clusterIndex: number) => {
      const values: ClusterMetricValues = {
        cpu: createDemoMetricValue(getClusterMetricBaseValue(cluster, 'cpu'), 'cpu', pointIndex, clusterIndex),
        memory: createDemoMetricValue(getClusterMetricBaseValue(cluster, 'memory'), 'memory', pointIndex, clusterIndex),
        pods: createDemoMetricValue(getClusterMetricBaseValue(cluster, 'pods'), 'pods', pointIndex, clusterIndex),
        nodes: createDemoMetricValue(getClusterMetricBaseValue(cluster, 'nodes'), 'nodes', pointIndex, clusterIndex),
      }
      clusterValues[cluster.name] = values
      totalCpu += values.cpu
      totalMemory += values.memory
      totalPods += values.pods
      totalNodes += values.nodes
    })

    return {
      time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp,
      cpu: totalCpu,
      memory: roundToStep(totalMemory, DEMO_METRIC_TUNING.memory.roundingStep),
      pods: totalPods,
      nodes: totalNodes,
      clusters: clusterValues,
    }
  })
}

