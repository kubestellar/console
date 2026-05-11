// Modal safety: the ApiKeyPromptModal used here is the shared BaseModal-based
// prompt that already guards its own close behavior; no form state on this
// card can be lost to a backdrop click. Treat as closeOnBackdropClick={false}.
import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { TrendingUp, RefreshCw, Info, Sparkles, Layers, List } from 'lucide-react'
import { useCardDemoState } from '../CardDataContext'
import { useMissions } from '../../../hooks/useMissions'
import { useClusters } from '../../../hooks/useMCP'
import { useCachedPodIssues, useCachedGPUNodes } from '../../../hooks/useCachedData'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { usePredictionSettings } from '../../../hooks/usePredictionSettings'
import { useAIPredictions } from '../../../hooks/useAIPredictions'
import { usePredictionFeedback } from '../../../hooks/usePredictionFeedback'
import { useMetricsHistory } from '../../../hooks/useMetricsHistory'
import { cn } from '../../../lib/cn'
import { useApiKeyCheck, ApiKeyPromptModal } from './shared'
import type { ConsoleMissionCardProps } from './shared'
import { useCardLoadingState } from '../CardDataContext'
import { ALERT_SEVERITY_ORDER } from '../../../types/alerts'
import type { PredictedRisk } from '../../../types/predictions'
import { CardControlsRow, CardSearchInput, CardPaginationFooter } from '../../../lib/cards/CardComponents'
import { useTranslation } from 'react-i18next'
import { LOCAL_AGENT_HTTP_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'
import { POLL_INTERVAL_MS } from '../../../lib/constants/network'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { agentFetch } from '../../../hooks/mcp/shared'
import { useClusterFiltering } from '../../clusters/useClusterFiltering'
import { getClusterHealthState, isClusterTokenExpired } from '../../clusters/utils'

// Extracted subcomponents and helpers
import {
  type NodeData,
  type UnifiedItem,
  type SortField,
  type GpuIssue,
  type ClusterHealthIssue,
  SORT_OPTIONS,
  buildOfflineDetectionCardLoadState,
  buildOfflineItems,
  buildClusterHealthItems,
  buildGpuItems,
  buildPredictionItems,
  generatePredictionId,
} from './offlineDataTransforms'
import { UnifiedItemsList } from './UnifiedItemsList'
import { RootCauseAnalyzer, type RootCauseGroup } from './RootCauseAnalyzer'
import { AIAnalysisPanel } from './AIAnalysisPanel'

// ============================================================================
// Module-level cache for all nodes (shared across card instances)
// ============================================================================
let nodesCache: NodeData[] = []
let nodesCacheTimestamp = 0
let nodesFetchInProgress = false
let nodesFetchError: string | null = null
let nodesFetchConsecutiveFailures = 0
const NODES_CACHE_TTL = 30000
const OFFLINE_DETECTION_FAILURE_THRESHOLD = 3
/** Cluster-level GPU allocation threshold — flag when >80% of a cluster's GPUs are allocated */
const GPU_CLUSTER_EXHAUSTION_THRESHOLD = 0.8
const nodesSubscribers = new Set<(nodes: NodeData[]) => void>()

type NodesFetchResult = {
  nodes: NodeData[]
  error: string | null
  consecutiveFailures: number
}

function notifyNodesSubscribers() {
  nodesSubscribers.forEach(cb => cb(nodesCache))
}

async function fetchAllNodes(): Promise<NodesFetchResult> {
  if (Date.now() - nodesCacheTimestamp < NODES_CACHE_TTL && nodesCache.length > 0) {
    return { nodes: nodesCache, error: null, consecutiveFailures: 0 }
  }

  if (nodesFetchInProgress) {
    return {
      nodes: nodesCache,
      error: nodesFetchError,
      consecutiveFailures: nodesFetchConsecutiveFailures,
    }
  }

  nodesFetchInProgress = true
  try {
    const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/nodes`, {
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json() as { nodes?: NodeData[] }
    nodesCache = data.nodes || []
    nodesCacheTimestamp = Date.now()
    nodesFetchError = null
    nodesFetchConsecutiveFailures = 0
    notifyNodesSubscribers()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    nodesFetchConsecutiveFailures += 1
    nodesFetchError = message
    
    // Fix for #13038: In local k3d/k3s environments, the /nodes endpoint may not be
    // configured, causing persistent JSON parse errors. Suppress excessive logging
    // after the first few failures to reduce console noise.
    const isJsonParseError = message.includes('Unexpected token') || message.includes('JSON')
    const shouldLogError = nodesFetchConsecutiveFailures <= OFFLINE_DETECTION_FAILURE_THRESHOLD || !isJsonParseError
    
    if (nodesCache.length > 0) {
      if (shouldLogError) {
        console.warn('[OfflineDetection] Node fetch degraded:', message)
      }
    } else {
      if (shouldLogError) {
        console.error('[OfflineDetection] Error fetching nodes:', error)
      }
    }
  } finally {
    nodesFetchInProgress = false
  }

  return {
    nodes: nodesCache,
    error: nodesFetchError,
    consecutiveFailures: nodesFetchConsecutiveFailures,
  }
}

// Card 4: AI Cluster Issue Predictor - Detect issues, predict failures, group by root cause
export function ConsoleOfflineDetectionCard(_props: ConsoleMissionCardProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { startMission, missions } = useMissions()
  const {
    nodes: gpuNodes,
    isLoading: gpuLoading,
    isRefreshing: gpuRefreshing,
    isDemoFallback: gpuDemoFallback,
    isFailed: gpuFailed,
    consecutiveFailures: gpuFailures,
  } = useCachedGPUNodes()
  const {
    issues: podIssues,
    isLoading: podsLoading,
    isRefreshing: podsRefreshing,
    isDemoFallback: podsDemoFallback,
    isFailed: podsFailed,
    consecutiveFailures: podsFailures,
  } = useCachedPodIssues()
  const { deduplicatedClusters: clusters } = useClusters()
  const {
    selectedClusters,
    isAllClustersSelected,
    customFilter,
    selectedDistributions,
    isAllDistributionsSelected,
  } = useGlobalFilters()
  const { drillToCluster, drillToNode } = useDrillDownActions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()
  const { shouldUseDemoData } = useCardDemoState({ requires: 'agent' })
  const { isDemoMode } = useDemoMode()

  // Prediction hooks
  const { settings: predictionSettings } = usePredictionSettings()
  const { predictions: aiPredictions, isAnalyzing, analyze: triggerAIAnalysis, isEnabled: aiEnabled } = useAIPredictions()
  const { submitFeedback, getFeedback } = usePredictionFeedback()
  const { getClusterTrend, getPodRestartTrend } = useMetricsHistory()

  // Get thresholds from settings
  const THRESHOLDS = predictionSettings.thresholds

  // Get all nodes from shared cache
  const [allNodes, setAllNodes] = useState<NodeData[]>(() => nodesCache)
  const [nodesLoading, setNodesLoading] = useState(() => !shouldUseDemoData && nodesCache.length === 0)
  const [nodesRefreshing, setNodesRefreshing] = useState(false)
  const [nodesFailures, setNodesFailures] = useState(0)

  const cardLoadState = useMemo(
    () => buildOfflineDetectionCardLoadState([
      {
        hasData: allNodes.length > 0,
        isLoading: !shouldUseDemoData && nodesLoading,
        isRefreshing: !shouldUseDemoData && nodesRefreshing,
        consecutiveFailures: shouldUseDemoData ? 0 : nodesFailures,
        isFailed: !shouldUseDemoData && nodesFailures >= OFFLINE_DETECTION_FAILURE_THRESHOLD,
      },
      {
        hasData: gpuNodes.length > 0,
        isLoading: gpuLoading,
        isRefreshing: gpuRefreshing,
        isDemoData: gpuDemoFallback,
        isFailed: gpuFailed,
        consecutiveFailures: gpuFailures,
      },
      {
        hasData: podIssues.length > 0,
        isLoading: podsLoading,
        isRefreshing: podsRefreshing,
        isDemoData: podsDemoFallback,
        isFailed: podsFailed,
        consecutiveFailures: podsFailures,
      },
    ], shouldUseDemoData || isDemoMode),
    [
      allNodes.length,
      gpuDemoFallback,
      gpuFailed,
      gpuFailures,
      gpuLoading,
      gpuNodes.length,
      gpuRefreshing,
      isDemoMode,
      nodesFailures,
      nodesLoading,
      nodesRefreshing,
      podIssues.length,
      podsDemoFallback,
      podsFailed,
      podsFailures,
      podsLoading,
      podsRefreshing,
      shouldUseDemoData,
    ],
  )

  // Report loading state to CardWrapper for skeleton/refresh behavior
  useCardLoadingState(cardLoadState)

  // Subscribe to cache updates and fetch nodes
  useEffect(() => {
    if (shouldUseDemoData) {
      return
    }

    let isMounted = true
    const handleUpdate = (nodes: NodeData[]) => {
      if (!isMounted) return
      setAllNodes(nodes)
      setNodesLoading(false)
    }
    nodesSubscribers.add(handleUpdate)

    const refreshNodes = () => {
      if (!isMounted) return
      setNodesRefreshing(nodesCache.length > 0)

      fetchAllNodes().then(result => {
        if (!isMounted) return
        setAllNodes(result.nodes)
        setNodesLoading(false)
        setNodesRefreshing(false)
        setNodesFailures(result.consecutiveFailures)
      }).catch(() => {
        if (!isMounted) return
        setNodesRefreshing(false)
      })
    }

    refreshNodes()
    const interval = setInterval(refreshNodes, POLL_INTERVAL_MS)

    return () => {
      isMounted = false
      nodesSubscribers.delete(handleUpdate)
      clearInterval(interval)
    }
  }, [shouldUseDemoData])

  const { globalFilteredClusters } = useClusterFiltering({
    clusters,
    filter: 'all',
    globalSelectedClusters: selectedClusters,
    isAllClustersSelected,
    customFilter,
    selectedDistributions,
    isAllDistributionsSelected,
    sortBy: 'name',
    sortAsc: true,
    customOrder: [],
  })

  // Filter nodes by global cluster filter
  const nodes = useMemo(() => {
    let result = allNodes

    if (!isAllClustersSelected) {
      result = result.filter(n => !n.cluster || selectedClusters.includes(n.cluster))
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(n =>
        n.name.toLowerCase().includes(query) ||
        (n.cluster?.toLowerCase() || '').includes(query)
      )
    }

    return result
  }, [allNodes, isAllClustersSelected, selectedClusters, customFilter])

  // Detect any node that is not fully Ready
  const offlineNodes = useMemo(() => {
    const unhealthy = nodes.filter(n =>
      n.status !== 'Ready' || n.unschedulable === true
    )
    const byName = new Map<string, typeof unhealthy[0]>()
    unhealthy.forEach(n => {
      const existing = byName.get(n.name)
      if (!existing || (n.cluster?.length || 999) < (existing.cluster?.length || 999)) {
        byName.set(n.name, n)
      }
    })
    return Array.from(byName.values())
  }, [nodes])

  const clusterHealthIssues = useMemo((): ClusterHealthIssue[] => {
    const clustersWithOfflineNodes = new Set(
      offlineNodes
        .map(node => node.cluster)
        .filter((clusterName): clusterName is string => !!clusterName)
    )

    return globalFilteredClusters.flatMap((cluster): ClusterHealthIssue[] => {
      if (clustersWithOfflineNodes.has(cluster.name)) {
        return []
      }

      const state = getClusterHealthState(cluster)
      if (state === 'unhealthy') {
        return [{
          cluster: cluster.name,
          state,
          reason: t('common:common.unhealthy'),
          reasonDetailed: cluster.errorMessage || t('cards:clusterHealth.clusterHasIssues'),
          severity: 'warning',
        }]
      }

      if (state === 'unreachable') {
        return [{
          cluster: cluster.name,
          state,
          reason: t('common:common.offline'),
          reasonDetailed: isClusterTokenExpired(cluster)
            ? t('cards:clusterHealth.tokenExpired')
            : (cluster.errorMessage || t('cards:clusterHealth.offlineCheckNetwork')),
          severity: 'critical',
        }]
      }

      return []
    })
  }, [globalFilteredClusters, offlineNodes, t])

  // Detect GPU issues from GPU nodes data
  const gpuIssues = useMemo((): GpuIssue[] => {
    const issues: GpuIssue[] = []

    const filteredGpuNodes = isAllClustersSelected
      ? gpuNodes
      : gpuNodes.filter(n => selectedClusters.includes(n.cluster))

    filteredGpuNodes.forEach(node => {
      if (node.gpuCount === 0 && node.gpuType) {
        issues.push({
          cluster: node.cluster,
          nodeName: node.name,
          expected: -1,
          available: 0,
          reason: `GPU node showing 0 GPUs (type: ${node.gpuType})`
        })
      }
    })

    return issues
  }, [gpuNodes, isAllClustersSelected, selectedClusters])

  // Predict potential failures using heuristics
  const heuristicPredictions = useMemo(() => {
    const risks: PredictedRisk[] = []

    const filteredPodIssues = isAllClustersSelected
      ? podIssues
      : podIssues.filter(p => selectedClusters.includes(p.cluster || ''))

    filteredPodIssues.forEach(pod => {
      if (pod.restarts && pod.restarts >= THRESHOLDS.highRestartCount) {
        const trend = getPodRestartTrend(pod.name, pod.cluster || '')
        risks.push({
          id: generatePredictionId('pod-crash', pod.name, pod.cluster),
          type: 'pod-crash',
          severity: pod.restarts >= 5 ? 'critical' : 'warning',
          name: pod.name,
          cluster: pod.cluster,
          namespace: pod.namespace,
          reason: `${pod.restarts} restarts - likely to crash`,
          reasonDetailed: `Pod has restarted ${pod.restarts} times, which indicates instability. This typically suggests memory pressure (OOMKill), application bugs, or configuration issues. Recommended actions: Check pod logs with 'kubectl logs ${pod.name}', describe the pod to see recent events, and review resource limits.`,
          metric: `${pod.restarts} restarts`,
          source: 'heuristic',
          trend })
      }
    })

    const filteredClusters = isAllClustersSelected
      ? clusters
      : clusters.filter(c => selectedClusters.includes(c.name))

    filteredClusters.forEach(cluster => {
      if (cluster.cpuCores && cluster.cpuUsageCores) {
        const cpuPercent = (cluster.cpuUsageCores / cluster.cpuCores) * 100
        if (cpuPercent >= THRESHOLDS.cpuPressure) {
          const trend = getClusterTrend(cluster.name, 'cpuPercent')
          risks.push({
            id: generatePredictionId('resource-exhaustion-cpu', cluster.name, cluster.name),
            type: 'resource-exhaustion',
            severity: cpuPercent >= 90 ? 'critical' : 'warning',
            name: cluster.name,
            cluster: cluster.name,
            reason: `CPU at ${cpuPercent.toFixed(0)}% - risk of throttling`,
            reasonDetailed: `Cluster CPU utilization is at ${cpuPercent.toFixed(1)}%, above the ${THRESHOLDS.cpuPressure}% warning threshold. At this level, workloads may experience throttling, increased latency, and degraded performance. Consider scaling up nodes, optimizing resource-intensive workloads, or implementing CPU limits.`,
            metric: `${cpuPercent.toFixed(0)}% CPU`,
            source: 'heuristic',
            trend })
        }
      }

      if (cluster.memoryGB && cluster.memoryUsageGB) {
        const memPercent = (cluster.memoryUsageGB / cluster.memoryGB) * 100
        if (memPercent >= THRESHOLDS.memoryPressure) {
          const trend = getClusterTrend(cluster.name, 'memoryPercent')
          risks.push({
            id: generatePredictionId('resource-exhaustion-mem', cluster.name, cluster.name),
            type: 'resource-exhaustion',
            severity: memPercent >= 95 ? 'critical' : 'warning',
            name: cluster.name,
            cluster: cluster.name,
            reason: `Memory at ${memPercent.toFixed(0)}% - risk of OOM`,
            reasonDetailed: `Cluster memory utilization is at ${memPercent.toFixed(1)}%, above the ${THRESHOLDS.memoryPressure}% warning threshold. Pods may be OOMKilled, nodes may become unschedulable, and new deployments may fail. Consider scaling up memory, reviewing memory limits, or identifying memory leaks.`,
            metric: `${memPercent.toFixed(0)}% memory`,
            source: 'heuristic',
            trend })
        }
      }
    })

    // Cluster-level GPU exhaustion
    const filteredGpuNodes = isAllClustersSelected
      ? gpuNodes
      : gpuNodes.filter(n => selectedClusters.includes(n.cluster))

    const clusterGpuTotals = new Map<string, { total: number; allocated: number }>()
    filteredGpuNodes.forEach(node => {
      if (node.gpuCount > 0) {
        const entry = clusterGpuTotals.get(node.cluster) || { total: 0, allocated: 0 }
        entry.total += node.gpuCount
        entry.allocated += node.gpuAllocated
        clusterGpuTotals.set(node.cluster, entry)
      }
    })

    clusterGpuTotals.forEach((gpus, cluster) => {
      if (gpus.allocated > gpus.total) {
        risks.push({
          id: generatePredictionId('gpu-over-allocated', cluster, cluster),
          type: 'gpu-exhaustion',
          severity: 'critical',
          name: cluster,
          cluster,
          reason: `GPU over-allocation: ${gpus.allocated}/${gpus.total}`,
          reasonDetailed: `Cluster ${cluster} has more GPUs allocated (${gpus.allocated}) than available (${gpus.total}). This may cause scheduling failures or workload evictions.`,
          metric: `${gpus.allocated}/${gpus.total} GPUs`,
          source: 'heuristic' })
      } else if (gpus.total > 0 && gpus.allocated / gpus.total > GPU_CLUSTER_EXHAUSTION_THRESHOLD) {
        const pct = Math.round((gpus.allocated / gpus.total) * 100)
        risks.push({
          id: generatePredictionId('gpu-exhaustion', cluster, cluster),
          type: 'gpu-exhaustion',
          severity: 'warning',
          name: cluster,
          cluster,
          reason: `Cluster GPU capacity ${pct}% allocated`,
          reasonDetailed: `Cluster ${cluster} has ${gpus.allocated} of ${gpus.total} GPUs allocated (${pct}%). New GPU workloads may not schedule. Consider adding GPU nodes or optimizing utilization.`,
          metric: `${gpus.allocated}/${gpus.total} GPUs (${pct}%)`,
          source: 'heuristic' })
      }
    })

    return risks
  }, [podIssues, clusters, gpuNodes, selectedClusters, isAllClustersSelected, THRESHOLDS, getClusterTrend, getPodRestartTrend])

  // Merge heuristic and AI predictions
  const predictedRisks = useMemo(() => {
    const filteredAIPredictions = aiEnabled
      ? aiPredictions.filter(p =>
          isAllClustersSelected || !p.cluster || selectedClusters.includes(p.cluster)
        )
      : []

    const allRisks = [...heuristicPredictions, ...filteredAIPredictions]

    const uniqueRisks = allRisks.reduce((acc, risk) => {
      const key = `${risk.type}-${risk.name}-${risk.cluster || 'unknown'}`
      const existing = acc.get(key)
      if (!existing) {
        acc.set(key, risk)
      } else if (risk.source === 'ai' && existing.source === 'heuristic') {
        acc.set(key, risk)
      } else if (existing.severity === 'warning' && risk.severity === 'critical') {
        acc.set(key, risk)
      }
      return acc
    }, new Map<string, PredictedRisk>())

    return Array.from(uniqueRisks.values())
      .sort((a, b) => {
        if (a.severity !== b.severity) {
          return a.severity === 'critical' ? -1 : 1
        }
        if (a.source !== b.source) {
          return a.source === 'ai' ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })
  }, [heuristicPredictions, aiPredictions, aiEnabled, selectedClusters, isAllClustersSelected])

  const totalPredicted = predictedRisks.length
  const criticalPredicted = predictedRisks.filter(r => r.severity === 'critical').length
  const aiPredictionCount = predictedRisks.filter(r => r.source === 'ai').length
  const heuristicPredictionCount = predictedRisks.filter(r => r.source === 'heuristic').length

  // ============================================================================
  // Unified items list for filtering/sorting/pagination
  // ============================================================================
  const unifiedItems = useMemo((): UnifiedItem[] => {
    return [
      ...buildOfflineItems(offlineNodes),
      ...buildClusterHealthItems(clusterHealthIssues),
      ...buildGpuItems(gpuIssues),
      ...buildPredictionItems(predictedRisks),
    ]
  }, [offlineNodes, clusterHealthIssues, gpuIssues, predictedRisks])

  // ============================================================================
  // Card controls state
  // ============================================================================
  const [search, setSearch] = useState('')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const [sortField, setSortField] = useState<SortField>('severity')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState<number | 'unlimited'>(5)
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const clusterFilterRef = useRef<HTMLDivElement>(null)

  // Close cluster dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(target)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Available clusters for filtering
  const availableClustersForFilter = useMemo(() => {
    const clusterSet = new Set<string>()
    unifiedItems.forEach(item => clusterSet.add(item.cluster))
    return Array.from(clusterSet).sort()
  }, [unifiedItems])

  // Filter items (memoized)
  const filteredItems = useMemo(() => {
    let result = unifiedItems

    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.cluster.toLowerCase().includes(query) ||
        item.reason.toLowerCase().includes(query)
      )
    }

    if (localClusterFilter.length > 0) {
      result = result.filter(item => localClusterFilter.includes(item.cluster))
    }

    return result
  }, [unifiedItems, search, localClusterFilter])

  // Sort items (memoized)
  const sortedItems = useMemo(() => {
    const sevOrder = ALERT_SEVERITY_ORDER as Record<string, number>
    const categoryOrder: Record<string, number> = { offline: 0, gpu: 1, prediction: 2 }

    return [...filteredItems].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'cluster':
          cmp = a.cluster.localeCompare(b.cluster)
          break
        case 'severity':
          cmp = (sevOrder[a.severity] ?? 999) - (sevOrder[b.severity] ?? 999)
          break
        case 'category':
          cmp = (categoryOrder[a.category] ?? 999) - (categoryOrder[b.category] ?? 999)
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
  }, [filteredItems, sortField, sortDirection])

  // Pagination (memoized)
  const { effectivePerPage, totalPages, needsPagination, paginatedItems } = useMemo(() => {
    const eff = itemsPerPage === 'unlimited' ? sortedItems.length : itemsPerPage
    const tp = Math.ceil(sortedItems.length / eff) || 1
    const needs = itemsPerPage !== 'unlimited' && sortedItems.length > eff
    const items = itemsPerPage === 'unlimited'
      ? sortedItems
      : sortedItems.slice((currentPage - 1) * eff, (currentPage - 1) * eff + eff)
    return { effectivePerPage: eff, totalPages: tp, needsPagination: needs, paginatedItems: items }
  }, [sortedItems, itemsPerPage, currentPage])

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, localClusterFilter, sortField])

  // Ensure current page is valid (#5762)
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [totalPages, currentPage])

  const toggleClusterFilter = useCallback((cluster: string) => {
    setLocalClusterFilter(prev =>
      prev.includes(cluster) ? prev.filter(c => c !== cluster) : [...prev, cluster]
    )
  }, [])

  const clearClusterFilter = useCallback(() => {
    setLocalClusterFilter([])
  }, [])

  // Filtered counts for the action button
  const filteredOfflineCount = useMemo(() => sortedItems.filter(i => i.category === 'offline').length, [sortedItems])
  const filteredGpuCount = useMemo(() => sortedItems.filter(i => i.category === 'gpu').length, [sortedItems])
  const filteredPredictionCount = useMemo(() => sortedItems.filter(i => i.category === 'prediction').length, [sortedItems])

  // ============================================================================
  // Root Cause Grouping
  // ============================================================================
  const rootCauseGroups = useMemo((): RootCauseGroup[] => {
    const groups = new Map<string, RootCauseGroup>()

    sortedItems.forEach(item => {
      let groupKey: string
      let groupDetails: string

      if (item.rootCause) {
        groupKey = item.rootCause.cause
        groupDetails = item.rootCause.details
      } else if (item.category === 'gpu') {
        groupKey = 'GPU exhaustion'
        groupDetails = 'No GPUs available on these nodes'
      } else if (item.category === 'prediction') {
        const risk = item.predictionData
        if (risk?.type === 'pod-crash') {
          groupKey = 'Pod crash risk'
          groupDetails = 'Pods with high restart counts likely to crash again'
        } else if (risk?.type === 'resource-exhaustion') {
          groupKey = risk.metric === 'cpu' ? 'CPU pressure' : 'Memory pressure'
          groupDetails = `Clusters approaching ${risk.metric?.toUpperCase()} limits`
        } else if (risk?.type === 'gpu-exhaustion') {
          groupKey = 'GPU capacity risk'
          groupDetails = 'GPU nodes at full capacity with no headroom'
        } else {
          groupKey = 'AI-detected risk'
          groupDetails = risk?.reason || 'Anomaly detected by AI analysis'
        }
      } else {
        groupKey = item.reason || 'Unknown'
        groupDetails = item.reasonDetailed || item.reason
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          cause: groupKey,
          details: groupDetails,
          items: [],
          severity: item.severity,
          categories: new Set() })
      }

      const group = groups.get(groupKey)!
      group.items.push(item)
      group.categories.add(item.category)
      if (item.severity === 'critical') group.severity = 'critical'
      else if (item.severity === 'warning' && group.severity === 'info') group.severity = 'warning'
    })

    return Array.from(groups.values()).sort((a, b) => {
      if (b.items.length !== a.items.length) return b.items.length - a.items.length
      return (ALERT_SEVERITY_ORDER as Record<string, number>)[a.severity] - (ALERT_SEVERITY_ORDER as Record<string, number>)[b.severity]
    })
  }, [sortedItems])

  // Fixed: immutable Set update pattern
  const toggleGroupExpand = useCallback((cause: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(cause)) next.delete(cause)
      else next.add(cause)
      return next
    })
  }, [])

  const filteredTotalIssues = filteredOfflineCount + filteredGpuCount
  const filteredTotalPredicted = filteredPredictionCount
  const filteredCriticalPredicted = useMemo(
    () => sortedItems.filter(i => i.category === 'prediction' && i.predictionData?.severity === 'critical').length,
    [sortedItems]
  )
  const filteredAIPredictionCount = useMemo(
    () => sortedItems.filter(i => i.category === 'prediction' && i.predictionData?.source === 'ai').length,
    [sortedItems]
  )
  const isFiltered = search.trim() !== '' || localClusterFilter.length > 0

  const runningMission = missions.find(m =>
    (m.title.includes('Analysis') || m.title.includes('Diagnose')) && m.status === 'running'
  )

  const doStartAnalysis = () => {
    const filteredOfflineItems = isFiltered
      ? sortedItems.filter(i => i.category === 'offline')
      : unifiedItems.filter(i => i.category === 'offline')
    const filteredOfflineNodes = filteredOfflineItems
      .map(i => i.nodeData)
      .filter((node): node is NonNullable<typeof node> => !!node)
    const filteredClusterHealthIssues = filteredOfflineItems
      .map(i => i.clusterIssueData)
      .filter((issue): issue is NonNullable<typeof issue> => !!issue)
    const filteredGpuIssuesList = isFiltered
      ? sortedItems.filter(i => i.category === 'gpu' && i.gpuData).map(i => i.gpuData) as typeof gpuIssues
      : gpuIssues
    const filteredPredictedRisks = isFiltered
      ? sortedItems.filter(i => i.category === 'prediction' && i.predictionData).map(i => i.predictionData) as typeof predictedRisks
      : predictedRisks

    const nodesSummary = filteredOfflineNodes.map(node => {
      const item = filteredOfflineItems.find(entry => entry.nodeData?.name === node.name && entry.nodeData?.cluster === node.cluster)
      const rootCause = item?.rootCause
      let line = `- Node ${node.name} (${node.cluster || 'unknown'}): Status=${node.unschedulable ? 'Cordoned' : node.status}`
      if (rootCause) {
        line += `\n  Root Cause: ${rootCause.cause}`
        line += `\n  Details: ${rootCause.details}`
      }
      return line
    }).join('\n')

    const clusterHealthSummary = filteredClusterHealthIssues.map(issue =>
      `- Cluster ${issue.cluster}: ${issue.reason}${issue.reasonDetailed ? `\n  Details: ${issue.reasonDetailed}` : ''}`
    ).join('\n')

    const gpuSummary = filteredGpuIssuesList.map(g =>
      `- Node ${g.nodeName} (${g.cluster}): ${g.reason}`
    ).join('\n')

    const predictedSummary = filteredPredictedRisks.map(r => {
      const sourceLabel = r.source === 'ai' ? `AI (${r.confidence || 0}% confidence)` : 'Heuristic'
      const trendLabel = r.trend ? ` [${r.trend}]` : ''
      let entry = `- [${r.severity.toUpperCase()}] [${sourceLabel}]${trendLabel} ${r.name} (${r.cluster || 'unknown'}):\n  Summary: ${r.reason}`
      if (r.reasonDetailed) {
        entry += `\n  Details: ${r.reasonDetailed}`
      }
      return entry
    }).join('\n\n')

    const filteredAICount = filteredPredictedRisks.filter(r => r.source === 'ai').length
    const filteredHeuristicCount = filteredPredictedRisks.filter(r => r.source === 'heuristic').length
    const hasCurrentIssues = filteredTotalIssues > 0
    const hasPredictions = filteredTotalPredicted > 0

    startMission({
      title: hasPredictions && !hasCurrentIssues ? 'Predictive Health Analysis' : 'Health Issue Analysis',
      description: hasCurrentIssues
        ? `Analyzing ${filteredTotalIssues} issues${hasPredictions ? ` + ${filteredTotalPredicted} predicted risks` : ''}`
        : `Analyzing ${filteredTotalPredicted} predicted failure risks (${filteredAICount} AI, ${filteredHeuristicCount} heuristic)`,
      type: 'troubleshoot',
      initialPrompt: `I need help analyzing ${hasCurrentIssues ? 'current issues and ' : ''}potential failures in my Kubernetes clusters.

${hasCurrentIssues ? `**Current Cluster Health Issues (${filteredClusterHealthIssues.length}):**
${clusterHealthSummary || 'None detected'}

**Current Node Issues (${filteredOfflineNodes.length}):**
${nodesSummary || 'None detected'}

**Current GPU Issues (${filteredGpuIssuesList.length}):**
${gpuSummary || 'None detected'}

` : ''}**Predicted Failure Risks (${filteredTotalPredicted} total: ${filteredAICount} AI-detected, ${filteredHeuristicCount} threshold-based):**
${predictedSummary || 'None predicted'}

Please:
1. ${hasCurrentIssues ? 'Identify root causes for the current cluster and node issues' : 'Analyze the predicted risks and their likelihood'}
2. ${hasPredictions ? 'Assess the predicted failures - which are most likely to occur? Consider the AI confidence levels and trends.' : 'Check for patterns in the current issues'}
3. Provide preventive actions to avoid predicted failures
4. ${hasCurrentIssues ? 'Provide remediation steps for the current issues' : 'Recommend monitoring thresholds to catch issues earlier'}
5. Prioritize by severity and potential impact
6. Suggest proactive measures to prevent future failures`,
      context: {
        offlineNodes: filteredOfflineNodes.slice(0, 20),
        clusterHealthIssues: filteredClusterHealthIssues.slice(0, 20),
        gpuIssues: filteredGpuIssuesList,
        predictedRisks: filteredPredictedRisks.slice(0, 20),
        affectedClusters: new Set([
          ...filteredOfflineNodes.map(node => node.cluster || 'unknown'),
          ...filteredClusterHealthIssues.map(issue => issue.cluster),
          ...filteredGpuIssuesList.map(g => g.cluster)
        ]).size,
        criticalPredicted: filteredCriticalPredicted,
        aiPredictionCount: filteredAICount,
        heuristicPredictionCount: filteredHeuristicCount } })
  }

  const handleStartAnalysis = () => checkKeyAndRun(doStartAnalysis)
  const currentClusterIssueCount = offlineNodes.length + clusterHealthIssues.length
  const firstCurrentIssueCluster = offlineNodes[0]?.cluster || clusterHealthIssues[0]?.cluster || null

  return (
    <div className="h-full flex flex-col relative">
      {/* API Key Prompt Modal */}
      <ApiKeyPromptModal
        isOpen={showKeyPrompt}
        onDismiss={dismissPrompt}
        onGoToSettings={goToSettings}
      />

      <div className="flex items-center justify-end mb-4">
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-2 @md:grid-cols-3 gap-2 mb-4">
        <div
          className={cn(
            'p-2 rounded-lg border',
            currentClusterIssueCount > 0
              ? 'bg-red-500/10 border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors'
              : 'bg-green-500/10 border-green-500/20 cursor-default'
          )}
          onClick={() => {
            if (firstCurrentIssueCluster) {
              drillToCluster(firstCurrentIssueCluster)
            }
          }}
          title={currentClusterIssueCount > 0
            ? t('common:healthCheck.issuesTooltip', { count: currentClusterIssueCount })
            : t('cards:consoleOfflineDetection.allHealthy')}
        >
          <div className="text-xl font-bold text-foreground">{currentClusterIssueCount}</div>
          <div className={cn('text-2xs', currentClusterIssueCount > 0 ? 'text-red-400' : 'text-green-400')}>
            {t('common:common.issues', { defaultValue: 'Issues' })}
          </div>
        </div>
        <div
          className={cn(
            'p-2 rounded-lg border',
            gpuIssues.length > 0
              ? 'bg-yellow-500/10 border-yellow-500/20 cursor-pointer hover:bg-yellow-500/20 transition-colors'
              : 'bg-green-500/10 border-green-500/20 cursor-default'
          )}
          onClick={() => {
            if (gpuIssues.length > 0 && gpuIssues[0]) {
              drillToCluster(gpuIssues[0].cluster)
            }
          }}
          title={gpuIssues.length > 0 ? `${gpuIssues.length} GPU issue${gpuIssues.length !== 1 ? 's' : ''} - Click to view` : 'All GPUs available'}
        >
          <div className="text-xl font-bold text-foreground">{gpuIssues.length}</div>
          <div className={cn('text-2xs', gpuIssues.length > 0 ? 'text-yellow-400' : 'text-green-400')}>
            {t('cards:consoleOfflineDetection.gpuIssues')}
          </div>
        </div>
        <div
          className={cn(
            'p-2 rounded-lg border',
            totalPredicted > 0 && aiEnabled && !isAnalyzing
              ? 'bg-blue-500/10 border-blue-500/20 cursor-pointer hover:bg-blue-500/20 transition-colors'
              : totalPredicted > 0
                ? 'bg-blue-500/10 border-blue-500/20 cursor-default'
                : 'bg-green-500/10 border-green-500/20 cursor-default'
          )}
          onClick={aiEnabled && !isAnalyzing ? () => triggerAIAnalysis() : undefined}
          title={`Predictive Failure Detection:

Heuristic Rules (instant):
 Pods with ${THRESHOLDS.highRestartCount}+ restarts → likely to crash
 Clusters with >${THRESHOLDS.cpuPressure}% CPU → throttling risk
 Clusters with >${THRESHOLDS.memoryPressure}% memory → OOM risk
 GPU nodes at full capacity → no headroom

AI Analysis (${aiEnabled ? `every ${predictionSettings.interval}m` : 'disabled'}):
${aiEnabled ? '• Trend detection over time\n• Correlated failure patterns\n• Anomaly detection' : '• Enable in Settings > Predictions'}

${totalPredicted > 0 ? `Current: ${heuristicPredictionCount} heuristic, ${aiPredictionCount} AI${criticalPredicted > 0 ? ` (${criticalPredicted} critical)` : ''}` : 'No predicted risks detected'}
${aiEnabled ? '\nClick to run AI analysis now' : ''}`}
        >
          <div className="flex items-center gap-1">
            {aiPredictionCount > 0 ? (
              <Sparkles className="w-3 h-3 text-blue-400" />
            ) : (
              <TrendingUp className={cn('w-3 h-3', totalPredicted > 0 ? 'text-blue-400' : 'text-green-400')} />
            )}
            <span className="text-xl font-bold text-foreground">{totalPredicted}</span>
            {isAnalyzing && (
              <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
            )}
          </div>
          <div className={cn(
            'text-2xs flex items-center gap-1',
            totalPredicted > 0 ? 'text-blue-400' : 'text-green-400'
          )}>
            {t('cards:consoleOfflineDetection.predicted')}
            <Info className="w-3 h-3 opacity-60" />
          </div>
        </div>
      </div>

      {/* Card Controls: Search, Cluster Filter, Sort */}
      <CardControlsRow
        clusterFilter={{
          availableClusters: availableClustersForFilter.map(c => ({ name: c })),
          selectedClusters: localClusterFilter,
          onToggle: toggleClusterFilter,
          onClear: clearClusterFilter,
          isOpen: showClusterFilter,
          setIsOpen: setShowClusterFilter,
          containerRef: clusterFilterRef,
          minClusters: 1 }}
        clusterIndicator={localClusterFilter.length > 0 ? {
          selectedCount: localClusterFilter.length,
          totalCount: availableClustersForFilter.length } : undefined}
        cardControls={{
          limit: itemsPerPage,
          onLimitChange: setItemsPerPage,
          sortBy: sortField,
          sortOptions: SORT_OPTIONS,
          onSortChange: (s) => setSortField(s as SortField),
          sortDirection,
          onSortDirectionChange: setSortDirection }}
      />

      {/* Search and View Mode Toggle */}
      <div className="flex items-center gap-2 mb-3">
        <CardSearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('common:common.searchIssues')}
          className="flex-1 mb-0!"
        />
        {rootCauseGroups.length > 0 && rootCauseGroups.some(g => g.items.length > 1) && (
          <div className="flex bg-secondary/50 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-1.5 rounded transition-colors',
                viewMode === 'list' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              title="List view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={cn(
                'p-1.5 rounded transition-colors',
                viewMode === 'grouped' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              title="Group by root cause - see which fixes solve multiple issues"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Items - List or Grouped View */}
      <div className="flex-1 space-y-1.5 overflow-y-auto mb-2">
        <DynamicCardErrorBoundary
          cardId="ConsoleOfflineDetectionAI"
          fallbackTitle={t('cards:consoleOfflineDetection.aiRenderErrorTitle')}
          fallbackMessage={t('cards:consoleOfflineDetection.aiRenderErrorDescription')}
        >
          {viewMode === 'grouped' ? (
            <RootCauseAnalyzer
              rootCauseGroups={rootCauseGroups}
              expandedGroups={expandedGroups}
              toggleGroupExpand={toggleGroupExpand}
              search={search}
              localClusterFilter={localClusterFilter}
              drillToNode={drillToNode}
              drillToCluster={drillToCluster}
              startMission={startMission as (config: { title: string; description: string; type: string; initialPrompt: string; context: Record<string, unknown> }) => void}
            />
          ) : (
            <UnifiedItemsList
              paginatedItems={paginatedItems}
              sortedItemsLength={sortedItems.length}
              search={search}
              localClusterFilter={localClusterFilter}
              drillToNode={drillToNode}
              drillToCluster={drillToCluster}
              getFeedback={getFeedback}
              submitFeedback={submitFeedback as (id: string, feedback: string, type: string, provider?: string) => void}
            />
          )}
        </DynamicCardErrorBoundary>
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={sortedItems.length}
        itemsPerPage={effectivePerPage}
        onPageChange={setCurrentPage}
        needsPagination={needsPagination}
      />

      {/* Action Button */}
      <AIAnalysisPanel
        filteredTotalIssues={filteredTotalIssues}
        filteredTotalPredicted={filteredTotalPredicted}
        filteredOfflineCount={filteredOfflineCount}
        filteredAIPredictionCount={filteredAIPredictionCount}
        isFiltered={isFiltered}
        runningMission={!!runningMission}
        onStartAnalysis={handleStartAnalysis}
      />
    </div>
  )
}
