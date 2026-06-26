/**
 * Multi-Cluster Insights Hook
 *
 * Client-side correlation engine that detects cross-cluster patterns
 * impossible to see in single-cluster dashboards. Runs 7 heuristic
 * algorithms on cached data; when the kc-agent is connected, insights
 * are enriched with AI explanations and remediation suggestions.
 */

import { useMemo } from 'react'
import { useCachedEvents, useCachedWarningEvents, useCachedDeployments, useCachedPodIssues } from './useCachedData'
import { useClusters } from './mcp/clusters'
import { useDemoMode } from './useDemoMode'
import { useInsightEnrichment } from './useInsightEnrichment'
import type { UseMultiClusterInsightsResult } from '../types/insights'
import {
  APP_BUG_MIN_CLUSTERS,
  DELTA_SIGNIFICANCE_HIGH_PCT,
  DELTA_SIGNIFICANCE_MEDIUM_PCT,
  FULL_PROGRESS,
  INFRA_ISSUE_MIN_WORKLOADS,
  MAX_TOP_INSIGHTS,
  PARTIAL_PROGRESS,
  REASON_FAMILIES,
  REASON_TO_FAMILY,
  RESOURCE_IMBALANCE_THRESHOLD_PCT,
  ROLLOUT_STATUS_COMPLETE,
  ROLLOUT_STATUS_FAILED,
  ROLLOUT_STATUS_IN_PROGRESS,
  SEVERITY_RANK,
  buildInsights,
  getDemoInsights,
  getTopInsights,
  groupInsightsByCategory,
  isCausallyRelated,
  workloadPrefix,
} from '../lib/insights'

export {
  APP_BUG_MIN_CLUSTERS,
  CASCADE_DETECTION_WINDOW_MS,
  CPU_CRITICAL_THRESHOLD_PCT,
  CRITICAL_CLUSTER_THRESHOLD,
  DELTA_SIGNIFICANCE_HIGH_PCT,
  DELTA_SIGNIFICANCE_MEDIUM_PCT,
  EVENT_CORRELATION_WINDOW_MS,
  FULL_PROGRESS,
  INFRA_CRITICAL_WORKLOADS,
  INFRA_ISSUE_MIN_WORKLOADS,
  MAX_INSIGHTS_PER_CATEGORY,
  MAX_TOP_INSIGHTS,
  MIN_CORRELATED_CLUSTERS,
  PARTIAL_PROGRESS,
  RESTART_CORRELATION_THRESHOLD,
  RESTART_CRITICAL_THRESHOLD,
  RESOURCE_IMBALANCE_THRESHOLD_PCT,
  ROLLOUT_STATUS_COMPLETE,
  ROLLOUT_STATUS_FAILED,
  ROLLOUT_STATUS_IN_PROGRESS,
  detectCascadeImpact,
  detectClusterDeltas,
  detectConfigDrift,
  detectEventCorrelations,
  detectResourceImbalance,
  detectRestartCorrelation,
  generateId,
  parseTimestamp,
  pct,
  trackRolloutProgress,
} from '../lib/insights'
export { getDemoInsights } from '../lib/insights'
export type {
  CascadeLink,
  ClusterDelta,
  InsightCategory,
  InsightSeverity,
  MultiClusterInsight,
  UseMultiClusterInsightsResult,
} from '../types/insights'

export function useMultiClusterInsights(): UseMultiClusterInsightsResult {
  const { isDemoMode } = useDemoMode()
  const {
    deduplicatedClusters,
    isLoading: clustersLoading,
    isRefreshing: clustersRefreshing,
    isFailed,
    consecutiveFailures,
  } = useClusters()
  const {
    events,
    isLoading: eventsLoading,
    isRefreshing: eventsRefreshing,
    isDemoFallback: eventsDemoFallback,
  } = useCachedEvents()
  const { events: warningEvents } = useCachedWarningEvents()
  const {
    data: deployments,
    isLoading: deploymentsLoading,
    isRefreshing: deploymentsRefreshing,
    isDemoFallback: deploymentsDemoFallback,
  } = useCachedDeployments()
  const { issues: podIssues, isDemoFallback: podIssuesDemoFallback } = useCachedPodIssues()

  const isDemoData = isDemoMode || (eventsDemoFallback && deploymentsDemoFallback && podIssuesDemoFallback)
  const isLoading = clustersLoading || eventsLoading || deploymentsLoading
  const isRefreshing = clustersRefreshing || eventsRefreshing || deploymentsRefreshing

  const insights = useMemo(() => {
    if (isDemoData) return getDemoInsights()

    return buildInsights({
      deduplicatedClusters: deduplicatedClusters || [],
      deployments: deployments || [],
      events: events || [],
      podIssues: podIssues || [],
      warningEvents: warningEvents || [],
    })
  }, [deduplicatedClusters, deployments, events, isDemoData, podIssues, warningEvents])

  const { enrichedInsights } = useInsightEnrichment(insights)

  const insightsByCategory = useMemo(() => groupInsightsByCategory(enrichedInsights || []), [enrichedInsights])

  const topInsights = useMemo(() => getTopInsights(enrichedInsights || []), [enrichedInsights])

  return {
    insights: enrichedInsights,
    isLoading,
    isRefreshing,
    isDemoData: !!isDemoData,
    isFailed: !!isFailed,
    consecutiveFailures: consecutiveFailures ?? 0,
    insightsByCategory,
    topInsights,
  }
}

export const __testables = {
  workloadPrefix,
  isCausallyRelated,
  getDemoInsights,
  REASON_FAMILIES,
  REASON_TO_FAMILY,
  SEVERITY_RANK,
  MAX_TOP_INSIGHTS,
  RESOURCE_IMBALANCE_THRESHOLD_PCT,
  DELTA_SIGNIFICANCE_HIGH_PCT,
  DELTA_SIGNIFICANCE_MEDIUM_PCT,
  INFRA_ISSUE_MIN_WORKLOADS,
  APP_BUG_MIN_CLUSTERS,
  ROLLOUT_STATUS_IN_PROGRESS,
  ROLLOUT_STATUS_COMPLETE,
  ROLLOUT_STATUS_FAILED,
  FULL_PROGRESS,
  PARTIAL_PROGRESS,
}
