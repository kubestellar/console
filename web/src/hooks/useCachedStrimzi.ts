/**
 * Strimzi Status Hook — Data fetching for the strimzi_status card.
 *
 * Keeps the public hook contract stable while sharing the common fetchJson helper.
 * Domain logic (Kafka cluster health, stats aggregation) remains in pure helpers.
 */

import { useCache } from '../lib/cache'
import { useCardLoadingState } from '../components/cards/CardDataContext'
import { fetchJson } from '../lib/fetchJson'
import {
  STRIMZI_DEMO_DATA,
  type StrimziKafkaCluster,
  type StrimziStats,
  type StrimziStatusData,
  type StrimziSummary,
} from '../components/cards/strimzi_status/demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'strimzi-status'
const STRIMZI_STATUS_ENDPOINT = '/api/strimzi/status'
const DEFAULT_OPERATOR_VERSION = 'unknown'

const EMPTY_STATS: StrimziStats = {
  clusterCount: 0,
  brokerCount: 0,
  topicCount: 0,
  consumerGroupCount: 0,
  totalLag: 0,
  operatorVersion: DEFAULT_OPERATOR_VERSION,
}

const EMPTY_SUMMARY: StrimziSummary = {
  totalClusters: 0,
  healthyClusters: 0,
  totalBrokers: 0,
  readyBrokers: 0,
}

const INITIAL_DATA: StrimziStatusData = {
  health: 'not-installed',
  clusters: [],
  stats: EMPTY_STATS,
  summary: EMPTY_SUMMARY,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/strimzi/status response)
// ---------------------------------------------------------------------------

interface StrimziStatusResponse {
  clusters?: StrimziKafkaCluster[]
  stats?: Partial<StrimziStats>
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function summarize(clusters: StrimziKafkaCluster[]): StrimziSummary {
  const totalClusters = (clusters || []).length
  const healthyClusters = (clusters || []).filter(c => c.health === 'healthy').length
  const totalBrokers = (clusters || []).reduce((sum, c) => sum + c.brokers.total, 0)
  const readyBrokers = (clusters || []).reduce((sum, c) => sum + c.brokers.ready, 0)
  return { totalClusters, healthyClusters, totalBrokers, readyBrokers }
}

function aggregateStats(
  clusters: StrimziKafkaCluster[],
  operatorVersion: string,
): StrimziStats {
  const topicCount = clusters.reduce((sum, c) => sum + (c.topics?.length ?? 0), 0)
  const consumerGroupCount = clusters.reduce(
    (sum, c) => sum + (c.consumerGroups?.length ?? 0),
    0,
  )
  const totalLag = clusters.reduce((sum, c) => sum + (c.totalLag ?? 0), 0)
  const brokerCount = clusters.reduce((sum, c) => sum + c.brokers.total, 0)
  return {
    clusterCount: clusters.length,
    brokerCount,
    topicCount,
    consumerGroupCount,
    totalLag,
    operatorVersion,
  }
}

function deriveHealth(clusters: StrimziKafkaCluster[]): StrimziStatusData['health'] {
  if (clusters.length === 0) {
    return 'not-installed'
  }
  const allHealthy = clusters.every(c => c.health === 'healthy')
  return allHealthy ? 'healthy' : 'degraded'
}

function buildStrimziStatus(
  clusters: StrimziKafkaCluster[],
  operatorVersion: string,
): StrimziStatusData {
  return {
    health: deriveHealth(clusters),
    clusters,
    stats: aggregateStats(clusters, operatorVersion),
    summary: summarize(clusters),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchStrimziStatus(): Promise<StrimziStatusData> {
  const result = await fetchJson<StrimziStatusResponse>(STRIMZI_STATUS_ENDPOINT)

  if (result.failed) {
    throw new Error('Unable to fetch Strimzi status')
  }

  const body = result.data
  const clusters = Array.isArray(body?.clusters) ? body.clusters : []
  const operatorVersion = body?.stats?.operatorVersion ?? DEFAULT_OPERATOR_VERSION

  return buildStrimziStatus(clusters, operatorVersion)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCachedStrimziResult {
  data: StrimziStatusData
  isLoading: boolean
  isRefreshing: boolean
  isDemoData: boolean
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  showSkeleton: boolean
  showEmptyState: boolean
  error: boolean
  refetch: () => Promise<void>
}

export function useCachedStrimzi(): UseCachedStrimziResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    lastRefresh,
    refetch,
  } = useCache<StrimziStatusData>({
    key: CACHE_KEY,
    category: 'realtime',
    initialData: INITIAL_DATA,
    demoData: STRIMZI_DEMO_DATA,
    persist: true,
    fetcher: fetchStrimziStatus,
  })

  const effectiveIsDemoData = isDemoFallback && !isLoading
  const hasAnyData =
    data.health === 'not-installed' ? true : (data.clusters ?? []).length > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: effectiveIsDemoData,
    lastRefresh,
  })

  return {
    data,
    isLoading,
    isRefreshing,
    isDemoData: effectiveIsDemoData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
    showSkeleton,
    showEmptyState,
    error: isFailed && !hasAnyData,
    refetch,
  }
}

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  summarize,
  aggregateStats,
  deriveHealth,
  buildStrimziStatus,
}
