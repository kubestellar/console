import type { TFunction } from 'i18next'
import type { CSSProperties } from 'react'
import type { LLMdStackComponent } from '../../../hooks/useStackDiscovery'
import { generateKVCacheStats, type KVCacheStats } from '../../../lib/llmd/mockData'
import type { AggregateMetrics, GenerateStatsArgs, HeatmapLegendItem, PodHistoryMap } from './KVCacheMonitor.types'

const H100_CAPACITY_GB = 80
const UNIFIED_CAPACITY_GB = 48
const HISTORY_LIMIT = 20
const HISTORY_SLICE_START = -(HISTORY_LIMIT - 1)
const PREFIX_LENGTH = 6

const GRID_BREAKPOINT_FEW = 2
const GRID_BREAKPOINT_SMALL = 3
const GRID_BREAKPOINT_MEDIUM = 4
const GRID_BREAKPOINT_LARGE = 6
const GRID_BREAKPOINT_DENSE = 9

const LOW_UTIL_THRESHOLD = 25
const MEDIUM_UTIL_THRESHOLD = 50
const HIGH_UTIL_THRESHOLD = 75
const CRITICAL_UTIL_THRESHOLD = 90

const PREFILL_CONFIG = {
  capacity: H100_CAPACITY_GB,
  evictionRange: 0.03,
  hitRateBase: 0.88,
  hitRateRange: 0.08,
  maxUtil: 95,
  spread: 25,
  start: 55,
  wave: 10,
}

const DECODE_CONFIG = {
  capacity: H100_CAPACITY_GB,
  evictionRange: 0.02,
  hitRateBase: 0.92,
  hitRateRange: 0.06,
  maxUtil: 90,
  spread: 20,
  start: 45,
  wave: 8,
}

const UNIFIED_CONFIG = {
  capacity: UNIFIED_CAPACITY_GB,
  evictionRange: 0.04,
  hitRateBase: 0.85,
  hitRateRange: 0.1,
  maxUtil: 92,
  spread: 25,
  start: 50,
  wave: 10,
}

const EMPTY_AGGREGATE_METRICS: AggregateMetrics = {
  avgHitRate: 0,
  avgUtil: 0,
  totalCapacity: 0,
  totalUsed: 0,
}

export const KVCACHE_MONITOR_DIV_STYLE_1: CSSProperties = { textShadow: '0 0 10px rgba(34,197,94,0.5)' }
export const KVCACHE_MONITOR_DIV_STYLE_2: CSSProperties = { textShadow: '0 0 10px rgba(6,182,212,0.5)' }

export const HEATMAP_LEGEND: HeatmapLegendItem[] = [
  { color: '#166534', label: '<25%' },
  { color: '#22c55e', label: '25-50%' },
  { color: '#eab308', label: '50-75%' },
  { color: '#f59e0b', label: '75-90%' },
  { color: '#ef4444', label: '>90%' },
]

interface UtilizationConfig {
  capacity: number
  evictionRange: number
  hitRateBase: number
  hitRateRange: number
  maxUtil: number
  spread: number
  start: number
  wave: number
}

interface AggregatedRoleConfig extends UtilizationConfig {
  components: LLMdStackComponent[]
  label: string
}

interface DisaggregatedRoleConfig extends UtilizationConfig {
  components: LLMdStackComponent[]
  prefix: string
}

function getPrometheusUtilization(
  prometheusMetrics: GenerateStatsArgs['prometheusMetrics'],
  podNames?: string[],
): number | null {
  if (!prometheusMetrics || !(podNames || []).length) return null

  const matchedPodNames = (podNames || []).filter(podName => prometheusMetrics[podName])
  if (!(matchedPodNames || []).length) return null

  const totalUtilization = matchedPodNames.reduce(
    (sum, podName) => sum + prometheusMetrics[podName].kvCacheUsage * 100,
    0,
  )

  return totalUtilization / matchedPodNames.length
}

function getReplicaCount(component: LLMdStackComponent): number {
  return Math.max(component.replicas || 1, component.readyReplicas || 0, 1)
}

function getSimulatedUtilization(config: UtilizationConfig, wave: number): number {
  return config.start + Math.random() * config.spread + wave * config.wave
}

function createStat(
  podName: string,
  cluster: string,
  namespace: string,
  baseUtilization: number,
  config: UtilizationConfig,
  hasPrometheusMetric: boolean,
): KVCacheStats {
  const utilizationPercent = Math.round(Math.min(baseUtilization, hasPrometheusMetric ? 100 : config.maxUtil))
  const usedGB = Math.round((baseUtilization / 100) * config.capacity * 10) / 10

  return {
    cluster,
    evictionRate: Math.random() * config.evictionRange,
    hitRate: config.hitRateBase + Math.random() * config.hitRateRange,
    lastUpdated: new Date(),
    namespace,
    podName,
    totalCapacityGB: config.capacity,
    usedGB,
    utilizationPercent,
  }
}

function createAggregatedRoleStat(
  cluster: string,
  namespace: string,
  wave: number,
  prometheusMetrics: GenerateStatsArgs['prometheusMetrics'],
  config: AggregatedRoleConfig,
): KVCacheStats | null {
  if (!(config.components || []).length) return null

  const allPods = config.components.flatMap(component => component.podNames || [])
  const promUtilization = getPrometheusUtilization(prometheusMetrics, allPods)
  const totalReplicas = config.components.reduce((sum, component) => sum + getReplicaCount(component), 0)
  const totalCapacity = totalReplicas * config.capacity
  const baseUtilization = promUtilization ?? getSimulatedUtilization(config, wave)
  const utilizationPercent = Math.round(Math.min(baseUtilization, promUtilization !== null ? 100 : config.maxUtil))

  return {
    cluster,
    evictionRate: Math.random() * config.evictionRange,
    hitRate: config.hitRateBase + Math.random() * config.hitRateRange,
    lastUpdated: new Date(),
    namespace,
    podName: `${config.label} (${totalReplicas})`,
    totalCapacityGB: totalCapacity,
    usedGB: Math.round((utilizationPercent / 100) * totalCapacity * 10) / 10,
    utilizationPercent,
  }
}

function pushDisaggregatedRoleStats(
  stats: KVCacheStats[],
  cluster: string,
  namespace: string,
  wave: number,
  prometheusMetrics: GenerateStatsArgs['prometheusMetrics'],
  config: DisaggregatedRoleConfig,
): void {
  ;(config.components || []).forEach(component => {
    const replicaCount = getReplicaCount(component)

    for (let replicaIndex = 0; replicaIndex < replicaCount; replicaIndex += 1) {
      const podName = component.podNames?.[replicaIndex]
      const promMetric = podName ? prometheusMetrics?.[podName] : undefined
      const baseUtilization = promMetric
        ? promMetric.kvCacheUsage * 100
        : getSimulatedUtilization(config, wave)

      stats.push(
        createStat(
          `${config.prefix}-${component.name.slice(0, PREFIX_LENGTH)}-${replicaIndex}`,
          cluster,
          namespace,
          baseUtilization,
          config,
          Boolean(promMetric),
        ),
      )
    }
  })
}

export function generateMonitorStats({
  aggregationMode,
  isDemoMode,
  prometheusMetrics,
  selectedStack,
}: GenerateStatsArgs): KVCacheStats[] {
  if (!selectedStack && isDemoMode) {
    return generateKVCacheStats()
  }

  if (!selectedStack) {
    return []
  }

  const wave = Math.sin(Date.now() / 10000)
  const nextStats: KVCacheStats[] = []

  if (aggregationMode === 'aggregated') {
    const aggregatedRoles: AggregatedRoleConfig[] = [
      { ...PREFILL_CONFIG, components: selectedStack.components.prefill, label: 'Prefill' },
      { ...DECODE_CONFIG, components: selectedStack.components.decode, label: 'Decode' },
      { ...UNIFIED_CONFIG, components: selectedStack.components.both, label: 'Unified' },
    ]

    ;(aggregatedRoles || []).forEach(config => {
      const stat = createAggregatedRoleStat(
        selectedStack.cluster,
        selectedStack.namespace,
        wave,
        prometheusMetrics,
        config,
      )

      if (stat) {
        nextStats.push(stat)
      }
    })

    return nextStats
  }

  const disaggregatedRoles: DisaggregatedRoleConfig[] = [
    { ...PREFILL_CONFIG, components: selectedStack.components.prefill, prefix: 'P' },
    { ...DECODE_CONFIG, components: selectedStack.components.decode, prefix: 'D' },
    { ...UNIFIED_CONFIG, components: selectedStack.components.both, prefix: 'U' },
  ]

  ;(disaggregatedRoles || []).forEach(config => {
    pushDisaggregatedRoleStats(
      nextStats,
      selectedStack.cluster,
      selectedStack.namespace,
      wave,
      prometheusMetrics,
      config,
    )
  })

  return nextStats
}

export function updatePodHistory(previousHistory: PodHistoryMap, nextStats: KVCacheStats[]): PodHistoryMap {
  const updatedHistory = { ...previousHistory }

  ;(nextStats || []).forEach(stat => {
    if (!updatedHistory[stat.podName]) {
      updatedHistory[stat.podName] = { hitRate: [], util: [] }
    }

    updatedHistory[stat.podName] = {
      hitRate: [...updatedHistory[stat.podName].hitRate.slice(HISTORY_SLICE_START), stat.hitRate * 100],
      util: [...updatedHistory[stat.podName].util.slice(HISTORY_SLICE_START), stat.utilizationPercent],
    }
  })

  return updatedHistory
}

export function calculateAggregateMetrics(stats: KVCacheStats[]): AggregateMetrics {
  if (!(stats || []).length) {
    return EMPTY_AGGREGATE_METRICS
  }

  const safeStats = stats || []

  return {
    avgHitRate: Math.round((safeStats.reduce((sum, stat) => sum + stat.hitRate, 0) / safeStats.length) * 100),
    avgUtil: Math.round(safeStats.reduce((sum, stat) => sum + stat.utilizationPercent, 0) / safeStats.length),
    totalCapacity: safeStats.reduce((sum, stat) => sum + stat.totalCapacityGB, 0),
    totalUsed: safeStats.reduce((sum, stat) => sum + stat.usedGB, 0),
  }
}

export function calculateTrend(history: number[]): number {
  const safeHistory = history || []
  if (safeHistory.length < 2) {
    return 0
  }

  return safeHistory[safeHistory.length - 1] - safeHistory[safeHistory.length - 2]
}

export function getGaugeGridClass(statsLength: number, isExpanded: boolean): string {
  if (isExpanded) {
    if (statsLength <= GRID_BREAKPOINT_FEW) return 'flex items-center justify-evenly gap-16'
    if (statsLength <= GRID_BREAKPOINT_MEDIUM) return 'grid grid-cols-2 @md:grid-cols-4 gap-8 place-items-center'
    if (statsLength <= GRID_BREAKPOINT_LARGE) return 'grid grid-cols-2 @md:grid-cols-3 gap-6 place-items-center'
    return 'grid grid-cols-2 @md:grid-cols-4 gap-4 place-items-center'
  }

  if (statsLength <= GRID_BREAKPOINT_FEW) return 'flex items-center justify-evenly gap-12'
  if (statsLength <= GRID_BREAKPOINT_SMALL) return 'grid grid-cols-2 @md:grid-cols-3 gap-6 place-items-center'
  if (statsLength <= GRID_BREAKPOINT_LARGE) return 'grid grid-cols-2 @md:grid-cols-3 gap-3 place-items-center'
  if (statsLength <= GRID_BREAKPOINT_DENSE) return 'grid grid-cols-2 @md:grid-cols-3 gap-2 place-items-center'
  return 'grid grid-cols-2 @md:grid-cols-4 gap-2 place-items-center'
}

export function getGaugeSize(statsLength: number, isExpanded: boolean): number {
  if (isExpanded) {
    if (statsLength <= GRID_BREAKPOINT_FEW) return 200
    if (statsLength <= GRID_BREAKPOINT_MEDIUM) return 180
    if (statsLength <= GRID_BREAKPOINT_LARGE) return 160
    return 140
  }

  if (statsLength <= GRID_BREAKPOINT_FEW) return 120
  if (statsLength <= GRID_BREAKPOINT_SMALL) return 130
  if (statsLength <= GRID_BREAKPOINT_LARGE) return 110
  if (statsLength <= GRID_BREAKPOINT_DENSE) return 100
  return 85
}

export function getHorseshoeGridClass(statsLength: number, isExpanded: boolean): string {
  if (isExpanded) {
    if (statsLength <= GRID_BREAKPOINT_FEW) return 'grid-cols-2 gap-6'
    if (statsLength <= GRID_BREAKPOINT_MEDIUM) return 'grid-cols-2 @md:grid-cols-4 gap-4'
    if (statsLength <= GRID_BREAKPOINT_LARGE) return 'grid-cols-2 @md:grid-cols-3 gap-4'
    return 'grid-cols-2 @md:grid-cols-4 gap-3'
  }

  if (statsLength <= GRID_BREAKPOINT_FEW) return 'grid-cols-2 gap-2'
  if (statsLength <= GRID_BREAKPOINT_SMALL) return 'grid-cols-2 @md:grid-cols-3 gap-1'
  if (statsLength <= GRID_BREAKPOINT_LARGE) return 'grid-cols-2 @md:grid-cols-3 gap-1'
  return 'grid-cols-2 @md:grid-cols-4 gap-1'
}

export function getHorseshoeSize(statsLength: number, isExpanded: boolean): number {
  if (isExpanded) {
    if (statsLength <= GRID_BREAKPOINT_FEW) return 240
    if (statsLength <= GRID_BREAKPOINT_MEDIUM) return 200
    if (statsLength <= GRID_BREAKPOINT_LARGE) return 180
    return 160
  }

  if (statsLength <= GRID_BREAKPOINT_FEW) return 180
  if (statsLength <= GRID_BREAKPOINT_SMALL) return 160
  if (statsLength <= GRID_BREAKPOINT_LARGE) return 140
  return 120
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function translateAggregatePodName(t: TFunction<any>, podName: string): string {
  if (podName.startsWith('Prefill (')) {
    return podName.replace('Prefill', t('llmd.prefill', 'Prefill'))
  }

  if (podName.startsWith('Decode (')) {
    return podName.replace('Decode', t('llmd.decode', 'Decode'))
  }

  if (podName.startsWith('Unified (')) {
    return podName.replace('Unified', t('llmd.unified', 'Unified'))
  }

  return podName
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDisplayPodName(t: TFunction<any>, podName: string, maxLength?: number): string {
  const translatedName = translateAggregatePodName(t, podName).replace('vllm-', '')
  return typeof maxLength === 'number' ? translatedName.slice(0, maxLength) : translatedName
}

export function getHeatCellColors(utilizationPercent: number): { bg: string; glow: string } {
  if (utilizationPercent >= CRITICAL_UTIL_THRESHOLD) return { bg: '#ef4444', glow: 'rgba(239,68,68,0.6)' }
  if (utilizationPercent >= HIGH_UTIL_THRESHOLD) return { bg: '#f59e0b', glow: 'rgba(245,158,11,0.5)' }
  if (utilizationPercent >= MEDIUM_UTIL_THRESHOLD) return { bg: '#eab308', glow: 'rgba(234,179,8,0.5)' }
  if (utilizationPercent >= LOW_UTIL_THRESHOLD) return { bg: '#22c55e', glow: 'rgba(34,197,94,0.5)' }
  return { bg: '#166534', glow: 'rgba(22,101,52,0.4)' }
}
