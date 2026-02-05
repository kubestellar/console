import { useMemo, useState, useEffect, useRef } from 'react'
import { AlertCircle, CheckCircle, Clock, ChevronRight, TrendingUp, TrendingDown, Minus, Cpu, HardDrive, RefreshCw, Info, Sparkles, ThumbsUp, ThumbsDown, Zap, Layers, List, Stethoscope, Wrench } from 'lucide-react'
import { useCardDemoState } from '../CardDataContext'
import { useMissions } from '../../../hooks/useMissions'
import { useGPUNodes, usePodIssues, useClusters } from '../../../hooks/useMCP'
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
import type { PredictedRisk, TrendDirection } from '../../../types/predictions'
import { CardControlsRow, CardSearchInput, CardPaginationFooter } from '../../../lib/cards/CardComponents'
import { ClusterBadge } from '../../ui/ClusterBadge'

// ============================================================================
// Unified Item Type for all card items
// ============================================================================
type UnifiedItem = {
  id: string
  category: 'offline' | 'gpu' | 'prediction'
  name: string
  cluster: string
  severity: 'critical' | 'warning' | 'info'
  reason: string
  reasonDetailed?: string
  metric?: string
  rootCause?: { cause: string; details: string }
  // Original data references
  nodeData?: NodeData
  gpuData?: { nodeName: string; cluster: string; expected: number; available: number; reason: string }
  predictionData?: PredictedRisk
}

// Sort field options
type SortField = 'name' | 'cluster' | 'severity' | 'category'

// Sort options for CardControls
const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'severity', label: 'Severity' },
  { value: 'name', label: 'Name' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'category', label: 'Type' },
]

// ============================================================================
// Module-level cache for all nodes (shared across card instances)
// ============================================================================
type NodeCondition = {
  type: string
  status: string
  reason?: string
  message?: string
}

type NodeData = {
  name: string
  cluster?: string
  status: string
  roles: string[]
  unschedulable?: boolean
  conditions?: NodeCondition[]
}

// Analyze node conditions to determine root cause of unhealthy status
function analyzeRootCause(node: NodeData): { cause: string; details: string } | null {
  if (!node.conditions || node.conditions.length === 0) {
    return null
  }

  // Check for problematic conditions
  const problems: string[] = []
  const details: string[] = []

  for (const condition of node.conditions) {
    // MemoryPressure, DiskPressure, PIDPressure should be False
    if (['MemoryPressure', 'DiskPressure', 'PIDPressure', 'NetworkUnavailable'].includes(condition.type)) {
      if (condition.status === 'True') {
        problems.push(condition.type)
        details.push(`${condition.type}: ${condition.message || condition.reason || 'Unknown'}`)
      }
    }
    // Ready should be True
    if (condition.type === 'Ready' && condition.status !== 'True') {
      if (condition.reason && condition.reason !== 'KubeletNotReady') {
        problems.push(condition.reason)
      }
      if (condition.message) {
        details.push(`Ready: ${condition.message}`)
      }
    }
  }

  if (problems.length === 0) {
    // Node is cordoned but healthy otherwise
    if (node.unschedulable) {
      return {
        cause: 'Cordoned for maintenance',
        details: 'Node is healthy but marked as unschedulable. This is typically done for planned maintenance or upgrades.'
      }
    }
    return null
  }

  // Determine primary root cause
  if (problems.includes('MemoryPressure')) {
    return {
      cause: 'Memory pressure',
      details: details.join('; ') || 'Node is running low on memory. Pods may be evicted.'
    }
  }
  if (problems.includes('DiskPressure')) {
    return {
      cause: 'Disk pressure',
      details: details.join('; ') || 'Node is running low on disk space. Image pulls may fail.'
    }
  }
  if (problems.includes('PIDPressure')) {
    return {
      cause: 'PID pressure',
      details: details.join('; ') || 'Node is running low on process IDs. New processes may fail to start.'
    }
  }
  if (problems.includes('NetworkUnavailable')) {
    return {
      cause: 'Network unavailable',
      details: details.join('; ') || 'Network is not configured correctly. Pods may not be able to communicate.'
    }
  }
  if (problems.includes('KubeletDown') || problems.includes('ContainerRuntimeUnhealthy')) {
    return {
      cause: 'Kubelet/Runtime issue',
      details: details.join('; ') || 'Kubelet or container runtime is not responding.'
    }
  }

  return {
    cause: problems.join(', '),
    details: details.join('; ') || 'Multiple conditions are affecting this node.'
  }
}

let nodesCache: NodeData[] = []
let nodesCacheTimestamp = 0
let nodesFetchInProgress = false
const NODES_CACHE_TTL = 30000 // 30 seconds
const nodesSubscribers = new Set<(nodes: NodeData[]) => void>()

function notifyNodesSubscribers() {
  nodesSubscribers.forEach(cb => cb(nodesCache))
}

async function fetchAllNodes(): Promise<NodeData[]> {
  // Return cached data if still fresh
  if (Date.now() - nodesCacheTimestamp < NODES_CACHE_TTL && nodesCache.length > 0) {
    return nodesCache
  }

  // If fetch in progress, wait and return cache
  if (nodesFetchInProgress) {
    return nodesCache
  }

  nodesFetchInProgress = true
  try {
    const response = await fetch('http://127.0.0.1:8585/nodes')
    if (response.ok) {
      const data = await response.json()
      nodesCache = data.nodes || []
      nodesCacheTimestamp = Date.now()
      notifyNodesSubscribers()
    }
  } catch (error) {
    console.error('[OfflineDetection] Error fetching nodes:', error)
  } finally {
    nodesFetchInProgress = false
  }
  return nodesCache
}

// Trend icon component
function TrendIcon({ trend, className }: { trend?: TrendDirection; className?: string }) {
  if (!trend || trend === 'stable') {
    return (
      <span title="Stable">
        <Minus className={cn('w-3 h-3 text-muted-foreground', className)} />
      </span>
    )
  }
  if (trend === 'worsening') {
    return (
      <span title="Worsening">
        <TrendingUp className={cn('w-3 h-3 text-orange-400', className)} />
      </span>
    )
  }
  return (
    <span title="Improving">
      <TrendingDown className={cn('w-3 h-3 text-green-400', className)} />
    </span>
  )
}

// Generate unique ID for heuristic predictions
function generatePredictionId(type: string, name: string, cluster?: string): string {
  return `heuristic-${type}-${name}-${cluster || 'unknown'}`
}

// Card 4: Predictive Health Monitor - Detect issues, predict failures, group by root cause
export function ConsoleOfflineDetectionCard(_props: ConsoleMissionCardProps) {
  const { startMission, missions } = useMissions()
  const { nodes: gpuNodes, isLoading } = useGPUNodes()
  const { issues: podIssues } = usePodIssues()
  const { deduplicatedClusters: clusters } = useClusters()
  const { selectedClusters, isAllClustersSelected, customFilter } = useGlobalFilters()
  const { drillToCluster, drillToNode } = useDrillDownActions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()
  const { shouldUseDemoData } = useCardDemoState({ requires: 'agent' })

  // Prediction hooks
  const { settings: predictionSettings } = usePredictionSettings()
  const { predictions: aiPredictions, isAnalyzing, analyze: triggerAIAnalysis, isEnabled: aiEnabled } = useAIPredictions()
  const { submitFeedback, getFeedback } = usePredictionFeedback()
  const { getClusterTrend, getPodRestartTrend } = useMetricsHistory()

  // Get thresholds from settings
  const THRESHOLDS = predictionSettings.thresholds

  // Get all nodes from shared cache
  const [allNodes, setAllNodes] = useState<NodeData[]>(() => nodesCache)
  const [nodesLoading, setNodesLoading] = useState(nodesCache.length === 0)

  // Report loading state to CardWrapper for skeleton/refresh behavior
  // Consider both GPU nodes AND local nodes cache for hasAnyData
  useCardLoadingState({
    isLoading: isLoading && nodesLoading,
    hasAnyData: gpuNodes.length > 0 || nodesCache.length > 0 || allNodes.length > 0,
  })

  // Subscribe to cache updates and fetch nodes
  useEffect(() => {
    // Skip agent requests in demo mode (no local agent on Netlify)
    if (shouldUseDemoData) {
      setNodesLoading(false)
      return
    }

    // Subscribe to cache updates
    const handleUpdate = (nodes: NodeData[]) => {
      setAllNodes(nodes)
      setNodesLoading(false)
    }
    nodesSubscribers.add(handleUpdate)

    // Initial fetch (will use cache if fresh)
    fetchAllNodes().then(nodes => {
      setAllNodes(nodes)
      setNodesLoading(false)
    })

    // Poll every 30 seconds
    const interval = setInterval(() => fetchAllNodes(), 30000)

    return () => {
      nodesSubscribers.delete(handleUpdate)
      clearInterval(interval)
    }
  }, [shouldUseDemoData])

  // Filter nodes by global cluster filter
  const nodes = useMemo(() => {
    let result = allNodes

    // Apply global cluster filter
    if (!isAllClustersSelected) {
      result = result.filter(n => !n.cluster || selectedClusters.includes(n.cluster))
    }

    // Apply global custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(n =>
        n.name.toLowerCase().includes(query) ||
        (n.cluster?.toLowerCase() || '').includes(query)
      )
    }

    return result
  }, [allNodes, selectedClusters, isAllClustersSelected, customFilter])

  // Detect any node that is not fully Ready (NotReady, Unknown, SchedulingDisabled, Cordoned, etc.)
  // Deduplicate by node name, preferring short cluster names
  const offlineNodes = useMemo(() => {
    const unhealthy = nodes.filter(n =>
      n.status !== 'Ready' || n.unschedulable === true
    )
    // Deduplicate by node name, keep entry with shortest cluster name
    const byName = new Map<string, typeof unhealthy[0]>()
    unhealthy.forEach(n => {
      const existing = byName.get(n.name)
      if (!existing || (n.cluster?.length || 999) < (existing.cluster?.length || 999)) {
        byName.set(n.name, n)
      }
    })
    return Array.from(byName.values())
  }, [nodes])

  // Detect GPU issues from GPU nodes data
  const gpuIssues = useMemo(() => {
    const issues: Array<{ cluster: string; nodeName: string; expected: number; available: number; reason: string }> = []

    // Filter GPU nodes by global cluster filter
    const filteredGpuNodes = isAllClustersSelected
      ? gpuNodes
      : gpuNodes.filter(n => selectedClusters.includes(n.cluster))

    // Detect nodes with 0 GPUs that should have GPUs (based on their GPU type label)
    filteredGpuNodes.forEach(node => {
      if (node.gpuCount === 0 && node.gpuType) {
        issues.push({
          cluster: node.cluster,
          nodeName: node.name,
          expected: -1, // Unknown expected count
          available: 0,
          reason: `GPU node showing 0 GPUs (type: ${node.gpuType})`
        })
      }
    })

    return issues
  }, [gpuNodes, selectedClusters, isAllClustersSelected])

  // Predict potential failures using heuristics
  const heuristicPredictions = useMemo(() => {
    const risks: PredictedRisk[] = []

    // 1. Pods with high restart counts - likely to crash
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
          trend,
        })
      }
    })

    // 2. Clusters with high resource usage - at risk of node pressure
    const filteredClusters = isAllClustersSelected
      ? clusters
      : clusters.filter(c => selectedClusters.includes(c.name))

    filteredClusters.forEach(cluster => {
      // Check CPU pressure (if metrics available)
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
            trend,
          })
        }
      }

      // Check memory pressure
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
            trend,
          })
        }
      }
    })

    // 3. GPU nodes with high allocation - risk of GPU exhaustion
    const filteredGpuNodes = isAllClustersSelected
      ? gpuNodes
      : gpuNodes.filter(n => selectedClusters.includes(n.cluster))

    filteredGpuNodes.forEach(node => {
      if (node.gpuCount > 0 && node.gpuAllocated >= node.gpuCount) {
        risks.push({
          id: generatePredictionId('gpu-exhaustion', node.name, node.cluster),
          type: 'gpu-exhaustion',
          severity: 'warning',
          name: node.name,
          cluster: node.cluster,
          reason: `All ${node.gpuCount} GPUs allocated - no capacity`,
          reasonDetailed: `All ${node.gpuCount} GPUs on this node are fully allocated (${node.gpuAllocated}/${node.gpuCount}). New GPU workloads will not be able to schedule on this node. Consider adding more GPU nodes, optimizing GPU utilization, or implementing GPU sharing strategies.`,
          metric: `${node.gpuAllocated}/${node.gpuCount} GPUs`,
          source: 'heuristic',
        })
      }
    })

    return risks
  }, [podIssues, clusters, gpuNodes, selectedClusters, isAllClustersSelected, THRESHOLDS, getClusterTrend, getPodRestartTrend])

  // Merge heuristic and AI predictions
  const predictedRisks = useMemo(() => {
    // Filter AI predictions by cluster selection
    const filteredAIPredictions = aiEnabled
      ? aiPredictions.filter(p =>
          isAllClustersSelected || !p.cluster || selectedClusters.includes(p.cluster)
        )
      : []

    // Combine all predictions
    const allRisks = [...heuristicPredictions, ...filteredAIPredictions]

    // Deduplicate by key, preferring AI predictions when they overlap
    const uniqueRisks = allRisks.reduce((acc, risk) => {
      const key = `${risk.type}-${risk.name}-${risk.cluster || 'unknown'}`
      const existing = acc.get(key)
      if (!existing) {
        acc.set(key, risk)
      } else if (risk.source === 'ai' && existing.source === 'heuristic') {
        // AI prediction takes precedence
        acc.set(key, risk)
      } else if (existing.severity === 'warning' && risk.severity === 'critical') {
        // Higher severity takes precedence
        acc.set(key, risk)
      }
      return acc
    }, new Map<string, PredictedRisk>())

    // Sort: critical first, then AI predictions, then by name
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
    const items: UnifiedItem[] = []

    // Add offline nodes with root cause analysis
    offlineNodes.forEach((node, i) => {
      const rootCause = analyzeRootCause(node)
      items.push({
        id: `offline-${node.name}-${node.cluster || i}`,
        category: 'offline',
        name: node.name,
        cluster: node.cluster || 'unknown',
        severity: 'critical',
        reason: rootCause?.cause || (node.unschedulable ? 'Cordoned' : node.status),
        reasonDetailed: rootCause?.details,
        rootCause: rootCause || undefined,
        nodeData: node,
      })
    })

    // Add GPU issues
    gpuIssues.forEach((issue, i) => {
      items.push({
        id: `gpu-${issue.nodeName}-${issue.cluster}-${i}`,
        category: 'gpu',
        name: issue.nodeName,
        cluster: issue.cluster,
        severity: 'warning',
        reason: issue.reason,
        gpuData: issue,
      })
    })

    // Add predictions
    predictedRisks.forEach(risk => {
      items.push({
        id: risk.id,
        category: 'prediction',
        name: risk.name,
        cluster: risk.cluster || 'unknown',
        severity: risk.severity,
        reason: risk.reason,
        reasonDetailed: risk.reasonDetailed,
        metric: risk.metric,
        predictionData: risk,
      })
    })

    return items
  }, [offlineNodes, gpuIssues, predictedRisks])

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

  // Filter items
  const filteredItems = useMemo(() => {
    let result = unifiedItems

    // Apply search
    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.cluster.toLowerCase().includes(query) ||
        item.reason.toLowerCase().includes(query)
      )
    }

    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(item => localClusterFilter.includes(item.cluster))
    }

    return result
  }, [unifiedItems, search, localClusterFilter])

  // Sort items
  const sortedItems = useMemo(() => {
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 }
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
          cmp = (severityOrder[a.severity] ?? 999) - (severityOrder[b.severity] ?? 999)
          break
        case 'category':
          cmp = (categoryOrder[a.category] ?? 999) - (categoryOrder[b.category] ?? 999)
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
  }, [filteredItems, sortField, sortDirection])

  // Pagination
  const effectivePerPage = itemsPerPage === 'unlimited' ? sortedItems.length : itemsPerPage
  const totalPages = Math.ceil(sortedItems.length / effectivePerPage) || 1
  const needsPagination = itemsPerPage !== 'unlimited' && sortedItems.length > effectivePerPage

  const paginatedItems = useMemo(() => {
    if (itemsPerPage === 'unlimited') return sortedItems
    const start = (currentPage - 1) * effectivePerPage
    return sortedItems.slice(start, start + effectivePerPage)
  }, [sortedItems, currentPage, effectivePerPage, itemsPerPage])

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, localClusterFilter, sortField])

  // Ensure current page is valid
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(Math.max(1, totalPages))
    }
  }, [currentPage, totalPages])

  const toggleClusterFilter = (cluster: string) => {
    setLocalClusterFilter(prev =>
      prev.includes(cluster) ? prev.filter(c => c !== cluster) : [...prev, cluster]
    )
  }

  const clearClusterFilter = () => {
    setLocalClusterFilter([])
  }

  // Filtered counts for the action button (respects search and cluster filter)
  const filteredOfflineCount = sortedItems.filter(i => i.category === 'offline').length
  const filteredGpuCount = sortedItems.filter(i => i.category === 'gpu').length
  const filteredPredictionCount = sortedItems.filter(i => i.category === 'prediction').length

  // ============================================================================
  // Root Cause Grouping - shows which fixes solve multiple issues
  // ============================================================================
  type RootCauseGroup = {
    cause: string
    details: string
    items: UnifiedItem[]
    severity: 'critical' | 'warning' | 'info'
    categories: Set<string>
  }

  const rootCauseGroups = useMemo(() => {
    const groups = new Map<string, RootCauseGroup>()

    sortedItems.forEach(item => {
      // Determine the grouping key
      let groupKey: string
      let groupDetails: string

      if (item.rootCause) {
        groupKey = item.rootCause.cause
        groupDetails = item.rootCause.details
      } else if (item.category === 'gpu') {
        groupKey = 'GPU exhaustion'
        groupDetails = 'No GPUs available on these nodes'
      } else if (item.category === 'prediction') {
        // Group predictions by type
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
          categories: new Set(),
        })
      }

      const group = groups.get(groupKey)!
      group.items.push(item)
      group.categories.add(item.category)
      // Escalate severity if any item is more severe
      if (item.severity === 'critical') group.severity = 'critical'
      else if (item.severity === 'warning' && group.severity === 'info') group.severity = 'warning'
    })

    // Sort groups by item count (most impactful first), then by severity
    return Array.from(groups.values()).sort((a, b) => {
      // First by count (descending)
      if (b.items.length !== a.items.length) return b.items.length - a.items.length
      // Then by severity
      const severityOrder = { critical: 0, warning: 1, info: 2 }
      return severityOrder[a.severity] - severityOrder[b.severity]
    })
  }, [sortedItems])

  const toggleGroupExpand = (cause: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(cause)) next.delete(cause)
      else next.add(cause)
      return next
    })
  }
  const filteredTotalIssues = filteredOfflineCount + filteredGpuCount
  const filteredTotalPredicted = filteredPredictionCount
  const filteredCriticalPredicted = sortedItems.filter(i => i.category === 'prediction' && i.predictionData?.severity === 'critical').length
  const filteredAIPredictionCount = sortedItems.filter(i => i.category === 'prediction' && i.predictionData?.source === 'ai').length
  const isFiltered = search.trim() !== '' || localClusterFilter.length > 0

  const runningMission = missions.find(m =>
    (m.title.includes('Analysis') || m.title.includes('Diagnose')) && m.status === 'running'
  )

  const doStartAnalysis = () => {
    // When filter is active, use filtered data from sortedItems
    // Otherwise use the full unfiltered data
    const filteredOfflineItems = isFiltered
      ? sortedItems.filter(i => i.category === 'offline')
      : unifiedItems.filter(i => i.category === 'offline')
    const filteredOfflineNodes = filteredOfflineItems.map(i => i.nodeData!).filter(Boolean)
    const filteredGpuIssuesList = isFiltered
      ? sortedItems.filter(i => i.category === 'gpu' && i.gpuData).map(i => i.gpuData!)
      : gpuIssues
    const filteredPredictedRisks = isFiltered
      ? sortedItems.filter(i => i.category === 'prediction' && i.predictionData).map(i => i.predictionData!)
      : predictedRisks

    // Include root cause analysis in the summary
    const nodesSummary = filteredOfflineItems.map(item => {
      const n = item.nodeData!
      const rootCause = item.rootCause
      let line = `- Node ${n.name} (${n.cluster || 'unknown'}): Status=${n.unschedulable ? 'Cordoned' : n.status}`
      if (rootCause) {
        line += `\n  Root Cause: ${rootCause.cause}`
        line += `\n  Details: ${rootCause.details}`
      }
      return line
    }).join('\n')

    const gpuSummary = filteredGpuIssuesList.map(g =>
      `- Node ${g.nodeName} (${g.cluster}): ${g.reason}`
    ).join('\n')

    // Include both summary and detailed explanation for each prediction
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

${hasCurrentIssues ? `**Current Offline/Unhealthy Nodes (${filteredOfflineNodes.length}):**
${nodesSummary || 'None detected'}

**Current GPU Issues (${filteredGpuIssuesList.length}):**
${gpuSummary || 'None detected'}

` : ''}**Predicted Failure Risks (${filteredTotalPredicted} total: ${filteredAICount} AI-detected, ${filteredHeuristicCount} threshold-based):**
${predictedSummary || 'None predicted'}

Please:
1. ${hasCurrentIssues ? 'Identify root causes for current offline nodes' : 'Analyze the predicted risks and their likelihood'}
2. ${hasPredictions ? 'Assess the predicted failures - which are most likely to occur? Consider the AI confidence levels and trends.' : 'Check for patterns in the current issues'}
3. Provide preventive actions to avoid predicted failures
4. ${hasCurrentIssues ? 'Provide remediation steps for current issues' : 'Recommend monitoring thresholds to catch issues earlier'}
5. Prioritize by severity and potential impact
6. Suggest proactive measures to prevent future failures`,
      context: {
        offlineNodes: filteredOfflineNodes.slice(0, 20),
        gpuIssues: filteredGpuIssuesList,
        predictedRisks: filteredPredictedRisks.slice(0, 20),
        affectedClusters: new Set([
          ...filteredOfflineNodes.map(n => n.cluster || 'unknown'),
          ...filteredGpuIssuesList.map(g => g.cluster)
        ]).size,
        criticalPredicted: filteredCriticalPredicted,
        aiPredictionCount: filteredAICount,
        heuristicPredictionCount: filteredHeuristicCount,
      },
    })
  }

  const handleStartAnalysis = () => checkKeyAndRun(doStartAnalysis)

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
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div
          className={cn(
            'p-2 rounded-lg border',
            offlineNodes.length > 0
              ? 'bg-red-500/10 border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors'
              : 'bg-green-500/10 border-green-500/20 cursor-default'
          )}
          onClick={() => {
            if (offlineNodes.length > 0 && offlineNodes[0]?.cluster) {
              drillToCluster(offlineNodes[0].cluster)
            }
          }}
          title={offlineNodes.length > 0 ? `${offlineNodes.length} offline node${offlineNodes.length !== 1 ? 's' : ''} - Click to view` : 'All nodes online'}
        >
          <div className="text-xl font-bold text-foreground">{offlineNodes.length}</div>
          <div className={cn('text-[10px]', offlineNodes.length > 0 ? 'text-red-400' : 'text-green-400')}>
            Offline
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
          <div className={cn('text-[10px]', gpuIssues.length > 0 ? 'text-yellow-400' : 'text-green-400')}>
            GPU Issues
          </div>
        </div>
        <div
          className={cn(
            'p-2 rounded-lg border',
            totalPredicted > 0
              ? 'bg-blue-500/10 border-blue-500/20 cursor-pointer hover:bg-blue-500/20 transition-colors'
              : 'bg-green-500/10 border-green-500/20 cursor-default'
          )}
          onClick={aiEnabled && !isAnalyzing ? () => triggerAIAnalysis() : undefined}
          title={`Predictive Failure Detection:

Heuristic Rules (instant):
• Pods with ${THRESHOLDS.highRestartCount}+ restarts → likely to crash
• Clusters with >${THRESHOLDS.cpuPressure}% CPU → throttling risk
• Clusters with >${THRESHOLDS.memoryPressure}% memory → OOM risk
• GPU nodes at full capacity → no headroom

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
            'text-[10px] flex items-center gap-1',
            totalPredicted > 0 ? 'text-blue-400' : 'text-green-400'
          )}>
            Predicted
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
          minClusters: 1,
        }}
        clusterIndicator={localClusterFilter.length > 0 ? {
          selectedCount: localClusterFilter.length,
          totalCount: availableClustersForFilter.length,
        } : undefined}
        cardControls={{
          limit: itemsPerPage,
          onLimitChange: setItemsPerPage,
          sortBy: sortField,
          sortOptions: SORT_OPTIONS,
          onSortChange: (s) => setSortField(s as SortField),
          sortDirection,
          onSortDirectionChange: setSortDirection,
        }}
      />

      {/* Search and View Mode Toggle */}
      <div className="flex items-center gap-2 mb-3">
        <CardSearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search issues..."
          className="flex-1"
        />
        {/* View mode toggle - only show if there are grouped items */}
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
        {viewMode === 'grouped' ? (
          /* ============================================================================
           * GROUPED VIEW - Shows root causes with item counts
           * ============================================================================ */
          <>
            {rootCauseGroups.map((group) => {
              const isExpanded = expandedGroups.has(group.cause)
              const severityColor = group.severity === 'critical' ? 'red' : group.severity === 'warning' ? 'yellow' : 'blue'

              return (
                <div key={group.cause} className="space-y-1">
                  {/* Group Header */}
                  <div
                    className={cn(
                      'p-2 rounded text-xs cursor-pointer transition-colors flex items-center justify-between',
                      `bg-${severityColor}-500/10 hover:bg-${severityColor}-500/20 border border-${severityColor}-500/20`
                    )}
                    style={{
                      backgroundColor: `rgba(${severityColor === 'red' ? '239,68,68' : severityColor === 'yellow' ? '234,179,8' : '59,130,246'}, 0.1)`,
                      borderColor: `rgba(${severityColor === 'red' ? '239,68,68' : severityColor === 'yellow' ? '234,179,8' : '59,130,246'}, 0.2)`,
                    }}
                    onClick={() => toggleGroupExpand(group.cause)}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <ChevronRight
                        className={cn(
                          'w-3.5 h-3.5 flex-shrink-0 transition-transform',
                          isExpanded && 'rotate-90'
                        )}
                        style={{ color: `rgb(${severityColor === 'red' ? '248,113,113' : severityColor === 'yellow' ? '250,204,21' : '96,165,250'})` }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{group.cause}</span>
                          <span
                            className="px-1.5 py-0.5 text-[10px] font-bold rounded"
                            style={{
                              backgroundColor: `rgba(${severityColor === 'red' ? '239,68,68' : severityColor === 'yellow' ? '234,179,8' : '59,130,246'}, 0.2)`,
                              color: `rgb(${severityColor === 'red' ? '248,113,113' : severityColor === 'yellow' ? '250,204,21' : '96,165,250'})`,
                            }}
                          >
                            {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                          </span>
                          {group.items.length > 1 && (
                            <span className="text-[10px] text-green-400 font-medium">
                              ✓ Fix once, solve {group.items.length}
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground truncate mt-0.5">{group.details}</div>
                      </div>
                    </div>
                    <button
                      className={cn(
                        'px-2 py-1 text-[10px] rounded font-medium transition-colors flex-shrink-0 ml-2',
                        'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                      )}
                      onClick={(e) => {
                        e.stopPropagation()
                        // Start analysis for this specific root cause group
                        const groupItems = group.items
                        const summary = groupItems.map(item => `- ${item.name} (${item.cluster}): ${item.reason}`).join('\n')
                        startMission({
                          title: `Diagnose: ${group.cause}`,
                          description: `Diagnosing ${group.items.length} items with root cause: ${group.cause}`,
                          type: 'troubleshoot',
                          initialPrompt: `You are diagnosing a Kubernetes cluster issue.

ROOT CAUSE: ${group.cause}
DETAILS: ${group.details}

AFFECTED ITEMS (${group.items.length}):
${summary}

TASK:
1. Explain why this root cause is affecting all these items
2. Provide a single fix that will resolve all ${group.items.length} items
3. List the specific commands or steps to remediate
4. Explain any risks and how to verify the fix worked`,
                          context: { rootCause: group.cause, affectedCount: group.items.length },
                        })
                      }}
                      title={`Diagnose all ${group.items.length} items with this root cause`}
                    >
                      Diagnose {group.items.length}
                    </button>
                  </div>

                  {/* Expanded Items */}
                  {isExpanded && (
                    <div className="ml-4 space-y-1 border-l-2 border-border/50 pl-2">
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          className="p-1.5 rounded bg-secondary/30 text-xs cursor-pointer hover:bg-secondary/50 transition-colors flex items-center justify-between"
                          onClick={() => {
                            if (item.category === 'offline' && item.nodeData?.cluster) {
                              drillToNode(item.nodeData.cluster, item.name, {})
                            } else if (item.cluster) {
                              drillToCluster(item.cluster)
                            }
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-foreground truncate">{item.name}</span>
                            <ClusterBadge cluster={item.cluster} size="sm" />
                          </div>
                          <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Empty state for grouped view */}
            {rootCauseGroups.length === 0 && (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-4">
                <CheckCircle className="w-4 h-4 mr-2 text-green-400" />
                {search || localClusterFilter.length > 0 ? 'No matching items' : 'All nodes & GPUs healthy'}
              </div>
            )}
          </>
        ) : (
          /* ============================================================================
           * LIST VIEW - Original flat list
           * ============================================================================ */
          <>
        {paginatedItems.map((item) => {
          // Render based on category
          if (item.category === 'offline' && item.nodeData) {
            const node = item.nodeData
            const rootCause = item.rootCause
            return (
              <div
                key={item.id}
                className="p-2 rounded bg-red-500/10 text-xs cursor-pointer hover:bg-red-500/20 transition-colors group flex items-center justify-between"
                onClick={() => node.cluster && drillToNode(node.cluster, node.name, {
                  status: node.unschedulable ? 'Cordoned' : node.status,
                  unschedulable: node.unschedulable,
                  roles: node.roles,
                  issue: rootCause?.details || (node.unschedulable ? 'Node is cordoned and not accepting new workloads' : `Node status: ${node.status}`),
                  rootCause: rootCause?.cause,
                })}
                title={rootCause ? `${rootCause.cause}: ${rootCause.details}` : `Click to diagnose ${node.name}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-foreground truncate">{node.name}</span>
                    <span className="flex-shrink-0 px-1 py-0.5 text-[9px] font-medium bg-red-500/20 text-red-400 rounded">
                      {rootCause?.cause || 'Offline'}
                    </span>
                    {node.cluster && (
                      <ClusterBadge cluster={node.cluster} size="sm" />
                    )}
                  </div>
                  <div className="text-red-400 truncate mt-0.5">
                    {rootCause?.details || (node.unschedulable ? 'Cordoned' : node.status)}
                  </div>
                </div>
                {/* Item action buttons */}
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      startMission({
                        title: `Diagnose: ${node.name}`,
                        description: `Diagnosing node ${node.name}`,
                        type: 'troubleshoot',
                        initialPrompt: `Diagnose this Kubernetes node issue:

NODE: ${node.name}
CLUSTER: ${node.cluster || 'unknown'}
STATUS: ${node.unschedulable ? 'Cordoned' : node.status}
ROOT CAUSE: ${rootCause?.cause || 'Unknown'}
DETAILS: ${rootCause?.details || 'No details available'}

Please:
1. Explain what this issue means
2. Identify the root cause
3. List diagnostic commands to gather more info
4. Provide the steps to fix this issue`,
                        context: { node: node.name, cluster: node.cluster },
                      })
                    }}
                    className="p-1 rounded text-muted-foreground hover:text-purple-400 hover:bg-purple-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    title={`Diagnose ${node.name}`}
                  >
                    <Stethoscope className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      startMission({
                        title: `Repair: ${node.name}`,
                        description: `Repairing node ${node.name}`,
                        type: 'troubleshoot',
                        initialPrompt: `Repair this Kubernetes node:

NODE: ${node.name}
CLUSTER: ${node.cluster || 'unknown'}
STATUS: ${node.unschedulable ? 'Cordoned' : node.status}
ROOT CAUSE: ${rootCause?.cause || 'Unknown'}
DETAILS: ${rootCause?.details || 'No details available'}

Please provide:
1. The exact commands to fix this issue
2. Any prerequisites or safety checks
3. How to verify the repair was successful
4. Any follow-up actions needed`,
                        context: { node: node.name, cluster: node.cluster },
                      })
                    }}
                    className="p-1 rounded text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    title={`Repair ${node.name}`}
                  >
                    <Wrench className="w-3 h-3" />
                  </button>
                  <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                </div>
              </div>
            )
          }

          if (item.category === 'gpu' && item.gpuData) {
            const issue = item.gpuData
            return (
              <div
                key={item.id}
                className="p-2 rounded bg-yellow-500/10 text-xs cursor-pointer hover:bg-yellow-500/20 transition-colors group flex items-center justify-between"
                onClick={() => drillToCluster(issue.cluster)}
                title={`Click to view cluster ${issue.cluster}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-foreground truncate">{issue.nodeName}</span>
                    <span className="flex-shrink-0 px-1 py-0.5 text-[9px] font-medium bg-yellow-500/20 text-yellow-400 rounded">
                      GPU
                    </span>
                    <ClusterBadge cluster={issue.cluster} size="sm" />
                  </div>
                  <div className="text-yellow-400 truncate mt-0.5">0 GPUs available</div>
                </div>
                {/* Item action buttons */}
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      startMission({
                        title: `Diagnose GPU: ${issue.nodeName}`,
                        description: `Diagnosing GPU issue on ${issue.nodeName}`,
                        type: 'troubleshoot',
                        initialPrompt: `Diagnose this GPU issue:

NODE: ${issue.nodeName}
CLUSTER: ${issue.cluster}
ISSUE: ${issue.reason}
EXPECTED GPUs: ${issue.expected > 0 ? issue.expected : 'Unknown'}
AVAILABLE GPUs: ${issue.available}

Please:
1. Explain what could cause GPUs to show as unavailable
2. List diagnostic commands to check GPU status
3. Check for driver issues, nvidia-smi output, device plugin status
4. Identify the root cause`,
                        context: { node: issue.nodeName, cluster: issue.cluster },
                      })
                    }}
                    className="p-1 rounded text-muted-foreground hover:text-purple-400 hover:bg-purple-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    title={`Diagnose GPU on ${issue.nodeName}`}
                  >
                    <Stethoscope className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      startMission({
                        title: `Repair GPU: ${issue.nodeName}`,
                        description: `Repairing GPU on ${issue.nodeName}`,
                        type: 'troubleshoot',
                        initialPrompt: `Repair the GPU issue on this node:

NODE: ${issue.nodeName}
CLUSTER: ${issue.cluster}
ISSUE: ${issue.reason}

Please provide:
1. Steps to restore GPU availability
2. How to restart NVIDIA device plugin
3. Driver-related fixes if applicable
4. How to verify GPUs are working again`,
                        context: { node: issue.nodeName, cluster: issue.cluster },
                      })
                    }}
                    className="p-1 rounded text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    title={`Repair GPU on ${issue.nodeName}`}
                  >
                    <Wrench className="w-3 h-3" />
                  </button>
                  <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                </div>
              </div>
            )
          }

          if (item.category === 'prediction' && item.predictionData) {
            const risk = item.predictionData
            const feedback = risk.id ? getFeedback(risk.id) : null
            return (
              <div
                key={item.id}
                className={cn(
                  'p-2 rounded text-xs transition-colors group',
                  // All predictions are blue
                  'bg-blue-500/10 hover:bg-blue-500/20'
                )}
                title={risk.reasonDetailed || risk.reason}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="min-w-0 flex items-center gap-2 flex-1 cursor-pointer"
                    onClick={() => risk.cluster && drillToCluster(risk.cluster)}
                  >
                    {/* Type Icon - all blue */}
                    {risk.type === 'pod-crash' && (
                      <RefreshCw className="w-3 h-3 flex-shrink-0 text-blue-400" />
                    )}
                    {risk.type === 'resource-exhaustion' && <Cpu className="w-3 h-3 flex-shrink-0 text-blue-400" />}
                    {risk.type === 'gpu-exhaustion' && <HardDrive className="w-3 h-3 flex-shrink-0 text-blue-400" />}
                    {(risk.type === 'resource-trend' || risk.type === 'capacity-risk' || risk.type === 'anomaly') && (
                      <Sparkles className="w-3 h-3 flex-shrink-0 text-blue-400" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-foreground truncate">{risk.name}</span>
                        {/* Source Badge */}
                        {risk.source === 'ai' ? (
                          <span className="flex-shrink-0 px-1 py-0.5 text-[9px] font-medium bg-blue-500/20 text-blue-400 rounded">
                            AI
                          </span>
                        ) : (
                          <span className="flex-shrink-0 px-1 py-0.5 text-[9px] font-medium bg-blue-500/20 text-blue-400 rounded flex items-center gap-0.5">
                            <Zap className="w-2 h-2" />
                          </span>
                        )}
                        {/* Confidence */}
                        {risk.confidence !== undefined && (
                          <span className="text-[9px] text-muted-foreground">{risk.confidence}%</span>
                        )}
                        {/* Trend */}
                        {risk.trend && <TrendIcon trend={risk.trend} />}
                        {/* Namespace Badge */}
                        {risk.namespace && (
                          <span className="flex-shrink-0 px-1 py-0.5 text-[9px] font-medium bg-slate-500/20 text-slate-400 rounded truncate max-w-[80px]" title={`namespace: ${risk.namespace}`}>
                            {risk.namespace}
                          </span>
                        )}
                        {/* Cluster Badge */}
                        {risk.cluster && (
                          <ClusterBadge cluster={risk.cluster} size="sm" />
                        )}
                      </div>
                      <div className="truncate mt-0.5 text-blue-400">
                        {risk.metric || risk.reason}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons + Feedback + Chevron */}
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    {/* Diagnose & Repair buttons */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        startMission({
                          title: `Diagnose: ${risk.name}`,
                          description: `Diagnosing predicted risk for ${risk.name}`,
                          type: 'troubleshoot',
                          initialPrompt: `Diagnose this predicted failure risk:

RESOURCE: ${risk.name}
CLUSTER: ${risk.cluster || 'unknown'}
${risk.namespace ? `NAMESPACE: ${risk.namespace}` : ''}
TYPE: ${risk.type}
SEVERITY: ${risk.severity}
PREDICTION SOURCE: ${risk.source === 'ai' ? `AI (${risk.confidence || 0}% confidence)` : 'Heuristic threshold'}
${risk.trend ? `TREND: ${risk.trend}` : ''}

SUMMARY: ${risk.reason}
${risk.reasonDetailed ? `DETAILS: ${risk.reasonDetailed}` : ''}

Please:
1. Explain what this prediction means
2. Assess the likelihood of this failure occurring
3. List diagnostic commands to verify the risk
4. Identify contributing factors`,
                          context: { name: risk.name, cluster: risk.cluster, type: risk.type },
                        })
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-purple-400 hover:bg-purple-500/10 transition-colors opacity-0 group-hover:opacity-100"
                      title={`Diagnose ${risk.name}`}
                    >
                      <Stethoscope className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        startMission({
                          title: `Prevent: ${risk.name}`,
                          description: `Preventing predicted failure for ${risk.name}`,
                          type: 'troubleshoot',
                          initialPrompt: `Prevent this predicted failure:

RESOURCE: ${risk.name}
CLUSTER: ${risk.cluster || 'unknown'}
${risk.namespace ? `NAMESPACE: ${risk.namespace}` : ''}
TYPE: ${risk.type}
SEVERITY: ${risk.severity}

SUMMARY: ${risk.reason}
${risk.reasonDetailed ? `DETAILS: ${risk.reasonDetailed}` : ''}

Please provide:
1. Preventive actions to avoid this failure
2. Specific commands or configuration changes
3. How to verify the risk has been mitigated
4. Monitoring recommendations to catch this earlier`,
                          context: { name: risk.name, cluster: risk.cluster, type: risk.type },
                        })
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10 transition-colors opacity-0 group-hover:opacity-100"
                      title={`Prevent failure for ${risk.name}`}
                    >
                      <Wrench className="w-3 h-3" />
                    </button>
                    {/* AI feedback buttons */}
                    {risk.source === 'ai' && risk.id && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            submitFeedback(risk.id, 'accurate', risk.type, risk.provider)
                          }}
                          className={cn(
                            'p-1 rounded transition-colors',
                            feedback === 'accurate'
                              ? 'bg-green-500/20 text-green-400'
                              : 'text-muted-foreground hover:text-green-400 hover:bg-green-500/10 opacity-0 group-hover:opacity-100'
                          )}
                          title="Mark as accurate"
                        >
                          <ThumbsUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            submitFeedback(risk.id, 'inaccurate', risk.type, risk.provider)
                          }}
                          className={cn(
                            'p-1 rounded transition-colors',
                            feedback === 'inaccurate'
                              ? 'bg-red-500/20 text-red-400'
                              : 'text-muted-foreground hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100'
                          )}
                          title="Mark as inaccurate"
                        >
                          <ThumbsDown className="w-3 h-3" />
                        </button>
                      </>
                    )}
                    <ChevronRight
                      className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-pointer"
                      onClick={() => risk.cluster && drillToCluster(risk.cluster)}
                    />
                  </div>
                </div>
              </div>
            )
          }

          return null
        })}

        {/* Empty state for list view */}
        {sortedItems.length === 0 && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-4" title="All nodes and GPUs healthy">
            <CheckCircle className="w-4 h-4 mr-2 text-green-400" />
            {search || localClusterFilter.length > 0 ? 'No matching items' : 'All nodes & GPUs healthy'}
          </div>
        )}
          </>
        )}
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

      {/* Action Button - uses filtered counts when filter is active */}
      <button
        onClick={handleStartAnalysis}
        disabled={(filteredTotalIssues === 0 && filteredTotalPredicted === 0) || !!runningMission}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all',
          filteredTotalIssues === 0 && filteredTotalPredicted === 0
            ? 'bg-green-500/20 text-green-400 cursor-default'
            : runningMission
              ? 'bg-blue-500/20 text-blue-400 cursor-wait'
              : filteredTotalIssues > 0
                ? filteredOfflineCount > 0
                  ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                  : 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400'
                : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400'
        )}
      >
        {filteredTotalIssues === 0 && filteredTotalPredicted === 0 ? (
          <>
            <CheckCircle className="w-4 h-4" />
            {isFiltered ? 'No matching items' : 'All Healthy'}
          </>
        ) : runningMission ? (
          <>
            <Clock className="w-4 h-4 animate-pulse" />
            Analyzing...
          </>
        ) : filteredTotalIssues > 0 ? (
          <>
            <AlertCircle className="w-4 h-4" />
            Analyze {filteredTotalIssues} Issue{filteredTotalIssues !== 1 ? 's' : ''}{filteredTotalPredicted > 0 ? ` + ${filteredTotalPredicted} Risks` : ''}
          </>
        ) : (
          <>
            {filteredAIPredictionCount > 0 ? <Sparkles className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
            Analyze {filteredTotalPredicted} Predicted Risk{filteredTotalPredicted !== 1 ? 's' : ''}
            {filteredAIPredictionCount > 0 && (
              <span className="text-xs opacity-75">({filteredAIPredictionCount} AI)</span>
            )}
          </>
        )}
      </button>
    </div>
  )
}
