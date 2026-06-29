/**
 * useCachedEPPStatus — Hook for EPP (Endpoint Picker Protocol) monitoring.
 *
 * Follows the useCached* caching contract from CLAUDE.md:
 *   - Returns: data, isLoading, isRefreshing, isDemoData, isFailed,
 *     consecutiveFailures, lastRefresh, refetch.
 *   - isDemoData is suppressed while isLoading is true.
 *
 * Data source: derives EPP deployment status from llm-d servers
 * (componentType === 'epp') surfaced by useCachedLLMd. Metrics data
 * (queueDepth, latency, errorRate) is sourced from the demo factory
 * at `web/src/lib/demo/epp.ts` until live metric endpoints are available.
 *
 * Upstream issue: kubestellar/console#19910
 */

import { createCachedHook, type CachedHookResult, type RefreshCategory } from '../lib/cache'
import { fetchLLMdServers } from './useCachedLLMd'
import type { LLMdServer } from './useLLMd'
import { generateEPPStatus, type EPPStatusData as EPPMetrics } from '../lib/demo/epp'

export type { EPPStatusData as EPPMetricsData } from '../lib/demo/epp'

export type EPPHealth = 'healthy' | 'degraded' | 'unavailable'

export interface EPPStatusSummary {
  health: EPPHealth
  totalEPPs: number
  readyEPPs: number
  degradedEPPs: number
  unavailableEPPs: number
}

export interface EPPStatusData {
  epps: LLMdServer[]
  summary: EPPStatusSummary
  lastCheckTime: string
}

const DEFAULT_LLMD_CLUSTERS = ['vllm-d', 'platform-eval'] as const

const DEMO_PRIMARY_REPLICAS = 2
const DEMO_PRIMARY_READY_REPLICAS = 2
const DEMO_SECONDARY_REPLICAS = 2
const DEMO_SECONDARY_READY_REPLICAS = 1

const EMPTY_EPP_STATUS: EPPStatusData = {
  epps: [],
  summary: {
    health: 'unavailable',
    totalEPPs: 0,
    readyEPPs: 0,
    degradedEPPs: 0,
    unavailableEPPs: 0,
  },
  lastCheckTime: '',
}

export function summarizeEPPStatus(epps: LLMdServer[]): EPPStatusSummary {
  const readyEPPs = epps.filter((epp) => epp.status === 'running').length
  const degradedEPPs = epps.filter((epp) => epp.status === 'scaling').length
  const unavailableEPPs = epps.filter((epp) => epp.status === 'stopped' || epp.status === 'error').length

  let health: EPPHealth = 'healthy'
  if (epps.length === 0) {
    health = 'unavailable'
  } else if (degradedEPPs > 0 || unavailableEPPs > 0) {
    health = 'degraded'
  }

  return {
    health,
    totalEPPs: epps.length,
    readyEPPs,
    degradedEPPs,
    unavailableEPPs,
  }
}

export const getDemoEPPStatus = (): EPPStatusData => {
  const epps: LLMdServer[] = [
    {
      id: 'vllm-d-llm-d-llama-epp',
      name: 'llama-3-epp',
      namespace: 'llm-d',
      cluster: 'vllm-d',
      model: 'llama-3-70b',
      type: 'llm-d',
      componentType: 'epp',
      status: 'running',
      replicas: DEMO_PRIMARY_REPLICAS,
      readyReplicas: DEMO_PRIMARY_READY_REPLICAS,
    },
    {
      id: 'platform-eval-llm-d-granite-epp',
      name: 'granite-epp',
      namespace: 'llm-d',
      cluster: 'platform-eval',
      model: 'granite-13b',
      type: 'llm-d',
      componentType: 'epp',
      status: 'scaling',
      replicas: DEMO_SECONDARY_REPLICAS,
      readyReplicas: DEMO_SECONDARY_READY_REPLICAS,
    },
  ]

  return {
    epps,
    summary: summarizeEPPStatus(epps),
    lastCheckTime: new Date().toISOString(),
  }
}

export async function fetchEPPStatus(
  clusters: string[] = [...DEFAULT_LLMD_CLUSTERS]
): Promise<EPPStatusData> {
  const servers = await fetchLLMdServers(clusters)
  const epps = servers.filter((server) => server.componentType === 'epp')

  return {
    epps,
    summary: summarizeEPPStatus(epps),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export type UseCachedEPPStatusResult = CachedHookResult<EPPStatusData> & {
  epps: LLMdServer[]
  summary: EPPStatusSummary
  /** True when the hook is falling back to demo data (isDemoFallback alias). */
  isDemoData: boolean
  /** EPP monitoring metrics (queue depth, latency, error rate). */
  metrics: EPPMetrics
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCachedEPPStatus(
  clusters: string[] = [...DEFAULT_LLMD_CLUSTERS]
): UseCachedEPPStatusResult {
  const key = `llmd-epp-status:${clusters.join(',')}`

  const useEPPStatusBase = createCachedHook<EPPStatusData>({
    key,
    category: 'gitops' as RefreshCategory,
    initialData: EMPTY_EPP_STATUS,
    getDemoData: getDemoEPPStatus,
    fetcher: () => fetchEPPStatus(clusters),
  })
  const result = useEPPStatusBase()

  const isDemoData = result.isDemoFallback && !result.isLoading

  return {
    ...result,
    epps: result.data.epps,
    summary: result.data.summary,
    isDemoFallback: isDemoData,
    isDemoData,
    metrics: generateEPPStatus(),
  }
}
