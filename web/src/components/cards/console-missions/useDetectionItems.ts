import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ALERT_SEVERITY_ORDER } from '../../../types/alerts'
import type { PredictedRisk } from '../../../types/predictions'
import type { ClusterTrendPoint, PodRestartTrendPoint } from '../../../hooks/useMetricsHistory'
import { getClusterHealthState, isClusterTokenExpired } from '../../clusters/utils'
import {
  type NodeData,
  type UnifiedItem,
  type SortField,
  type GpuIssue,
  type ClusterHealthIssue,
  buildOfflineItems,
  buildClusterHealthItems,
  buildGpuItems,
  buildPredictionItems,
  generatePredictionId,
  buildRootCauseGroups,
} from './offlineDataTransforms'
import { GPU_CLUSTER_EXHAUSTION_THRESHOLD } from './nodeCache'

export interface DetectionParams {
  allNodes: NodeData[]
  gpuNodes: Array<{ cluster: string; name: string; gpuCount: number; gpuType?: string; gpuAllocated: number }>
  podIssues: Array<{ name: string; cluster?: string; namespace?: string; restarts?: number }>
  globalFilteredClusters: Array<{ name: string; errorMessage?: string; context?: string; namespaces?: string[] }>
  clusters: Array<{ name: string; cpuCores?: number; cpuUsageCores?: number; memoryGB?: number; memoryUsageGB?: number }>
  selectedClusters: string[]
  isAllClustersSelected: boolean
  customFilter: string
  selectedDistributions: string[]
  isAllDistributionsSelected: boolean
  THRESHOLDS: { highRestartCount: number; cpuPressure: number; memoryPressure: number }
  getPodRestartTrend: (podName: string, clusterName: string) => PodRestartTrendPoint[] | undefined
  getClusterTrend: (clusterName: string, metric: 'cpuPercent' | 'memoryPercent') => ClusterTrendPoint[] | undefined
  aiPredictions: PredictedRisk[]
  aiEnabled: boolean
  search: string
  localClusterFilter: string[]
  sortField: SortField
  sortDirection: 'asc' | 'desc'
  itemsPerPage: number | 'unlimited'
  currentPage: number
}

export function useDetectionItems({
  allNodes,
  gpuNodes,
  podIssues,
  globalFilteredClusters,
  clusters,
  selectedClusters,
  isAllClustersSelected,
  customFilter,
  selectedDistributions,
  isAllDistributionsSelected,
  THRESHOLDS,
  getPodRestartTrend,
  getClusterTrend,
  aiPredictions,
  aiEnabled,
  search,
  localClusterFilter,
  sortField,
  sortDirection,
  itemsPerPage,
  currentPage,
}: DetectionParams) {
  const { t } = useTranslation(['cards', 'common'])
  void selectedDistributions
  void isAllDistributionsSelected

  const nodes = useMemo(() => {
    let result = allNodes
    if (!isAllClustersSelected) result = result.filter(n => !n.cluster || selectedClusters.includes(n.cluster))
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(n => n.name.toLowerCase().includes(query) || (n.cluster?.toLowerCase() || '').includes(query))
    }
    return result
  }, [allNodes, isAllClustersSelected, selectedClusters, customFilter])

  const offlineNodes = useMemo(() => {
    const unhealthy = nodes.filter(n => n.status !== 'Ready' || n.unschedulable === true)
    const byName = new Map<string, typeof unhealthy[0]>()
    unhealthy.forEach(n => {
      const existing = byName.get(n.name)
      if (!existing || (n.cluster?.length || 999) < (existing.cluster?.length || 999)) byName.set(n.name, n)
    })
    return Array.from(byName.values())
  }, [nodes])

  const clusterHealthIssues = useMemo((): ClusterHealthIssue[] => {
    const clustersWithOfflineNodes = new Set(offlineNodes.map(node => node.cluster).filter((x): x is string => !!x))
    return globalFilteredClusters.flatMap((cluster): ClusterHealthIssue[] => {
      if (clustersWithOfflineNodes.has(cluster.name)) return []
      const state = getClusterHealthState(cluster)
      if (state === 'unhealthy') {
        return [{ cluster: cluster.name, state, reason: t('common:common.unhealthy'), reasonDetailed: cluster.errorMessage || t('cards:clusterHealth.clusterHasIssues'), severity: 'warning' }]
      }
      if (state === 'unreachable') {
        return [{ cluster: cluster.name, state, reason: t('common:common.offline'), reasonDetailed: isClusterTokenExpired(cluster) ? t('cards:clusterHealth.tokenExpired') : (cluster.errorMessage || t('cards:clusterHealth.offlineCheckNetwork')), severity: 'critical' }]
      }
      return []
    })
  }, [globalFilteredClusters, offlineNodes, t])

  const gpuIssues = useMemo((): GpuIssue[] => {
    const issues: GpuIssue[] = []
    const filtered = isAllClustersSelected ? gpuNodes : gpuNodes.filter(n => selectedClusters.includes(n.cluster))
    filtered.forEach(node => {
      if (node.gpuCount === 0 && node.gpuType) {
        issues.push({ cluster: node.cluster, nodeName: node.name, expected: -1, available: 0, reason: `GPU node showing 0 GPUs (type: ${node.gpuType})` })
      }
    })
    return issues
  }, [gpuNodes, isAllClustersSelected, selectedClusters])

  const heuristicPredictions = useMemo(() => {
    const risks: PredictedRisk[] = []
    const filteredPodIssues = isAllClustersSelected ? podIssues : podIssues.filter(p => selectedClusters.includes(p.cluster || ''))
    filteredPodIssues.forEach(pod => {
      if (pod.restarts && pod.restarts >= THRESHOLDS.highRestartCount) {
        const trend = getPodRestartTrend(pod.name, pod.cluster || '')
        risks.push({ id: generatePredictionId('pod-crash', pod.name, pod.cluster), type: 'pod-crash', severity: pod.restarts >= 5 ? 'critical' : 'warning', name: pod.name, cluster: pod.cluster, namespace: pod.namespace, reason: `${pod.restarts} restarts - likely to crash`, reasonDetailed: `Pod has restarted ${pod.restarts} times, which indicates instability. This typically suggests memory pressure (OOMKill), application bugs, or configuration issues. Recommended actions: Check pod logs with 'kubectl logs ${pod.name}', describe the pod to see recent events, and review resource limits.`, metric: `${pod.restarts} restarts`, source: 'heuristic', trend })
      }
    })

    const filteredClusters = isAllClustersSelected ? clusters : clusters.filter(c => selectedClusters.includes(c.name))
    filteredClusters.forEach(cluster => {
      if (cluster.cpuCores && cluster.cpuUsageCores) {
        const cpuPercent = (cluster.cpuUsageCores / cluster.cpuCores) * 100
        if (cpuPercent >= THRESHOLDS.cpuPressure) {
          const trend = getClusterTrend(cluster.name, 'cpuPercent')
          risks.push({ id: generatePredictionId('resource-exhaustion-cpu', cluster.name, cluster.name), type: 'resource-exhaustion', severity: cpuPercent >= 90 ? 'critical' : 'warning', name: cluster.name, cluster: cluster.name, reason: `CPU at ${cpuPercent.toFixed(0)}% - risk of throttling`, reasonDetailed: `Cluster CPU utilization is at ${cpuPercent.toFixed(1)}%, above the ${THRESHOLDS.cpuPressure}% warning threshold. At this level, workloads may experience throttling, increased latency, and degraded performance. Consider scaling up nodes, optimizing resource-intensive workloads, or implementing CPU limits.`, metric: `${cpuPercent.toFixed(0)}% CPU`, source: 'heuristic', trend })
        }
      }
      if (cluster.memoryGB && cluster.memoryUsageGB) {
        const memPercent = (cluster.memoryUsageGB / cluster.memoryGB) * 100
        if (memPercent >= THRESHOLDS.memoryPressure) {
          const trend = getClusterTrend(cluster.name, 'memoryPercent')
          risks.push({ id: generatePredictionId('resource-exhaustion-mem', cluster.name, cluster.name), type: 'resource-exhaustion', severity: memPercent >= 95 ? 'critical' : 'warning', name: cluster.name, cluster: cluster.name, reason: `Memory at ${memPercent.toFixed(0)}% - risk of OOM`, reasonDetailed: `Cluster memory utilization is at ${memPercent.toFixed(1)}%, above the ${THRESHOLDS.memoryPressure}% warning threshold. Pods may be OOMKilled, nodes may become unschedulable, and new deployments may fail. Consider scaling up memory, reviewing memory limits, or identifying memory leaks.`, metric: `${memPercent.toFixed(0)}% memory`, source: 'heuristic', trend })
        }
      }
    })

    const filteredGpuNodes = isAllClustersSelected ? gpuNodes : gpuNodes.filter(n => selectedClusters.includes(n.cluster))
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
        risks.push({ id: generatePredictionId('gpu-over-allocated', cluster, cluster), type: 'gpu-exhaustion', severity: 'critical', name: cluster, cluster, reason: `GPU over-allocation: ${gpus.allocated}/${gpus.total}`, reasonDetailed: `Cluster ${cluster} has more GPUs allocated (${gpus.allocated}) than available (${gpus.total}). This may cause scheduling failures or workload evictions.`, metric: `${gpus.allocated}/${gpus.total} GPUs`, source: 'heuristic' })
      } else if (gpus.total > 0 && gpus.allocated / gpus.total > GPU_CLUSTER_EXHAUSTION_THRESHOLD) {
        const pct = Math.round((gpus.allocated / gpus.total) * 100)
        risks.push({ id: generatePredictionId('gpu-exhaustion', cluster, cluster), type: 'gpu-exhaustion', severity: 'warning', name: cluster, cluster, reason: `Cluster GPU capacity ${pct}% allocated`, reasonDetailed: `Cluster ${cluster} has ${gpus.allocated} of ${gpus.total} GPUs allocated (${pct}%). New GPU workloads may not schedule. Consider adding GPU nodes or optimizing utilization.`, metric: `${gpus.allocated}/${gpus.total} GPUs (${pct}%)`, source: 'heuristic' })
      }
    })
    return risks
  }, [podIssues, clusters, gpuNodes, selectedClusters, isAllClustersSelected, THRESHOLDS, getClusterTrend, getPodRestartTrend])

  const predictedRisks = useMemo(() => {
    const filteredAIPredictions = aiEnabled ? aiPredictions.filter(p => isAllClustersSelected || !p.cluster || selectedClusters.includes(p.cluster)) : []
    const allRisks = [...heuristicPredictions, ...filteredAIPredictions]
    const uniqueRisks = allRisks.reduce((acc, risk) => {
      const key = `${risk.type}-${risk.name}-${risk.cluster || 'unknown'}`
      const existing = acc.get(key)
      if (!existing) acc.set(key, risk)
      else if (risk.source === 'ai' && existing.source === 'heuristic') acc.set(key, risk)
      else if (existing.severity === 'warning' && risk.severity === 'critical') acc.set(key, risk)
      return acc
    }, new Map<string, PredictedRisk>())
    return Array.from(uniqueRisks.values()).sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1
      if (a.source !== b.source) return a.source === 'ai' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [heuristicPredictions, aiPredictions, aiEnabled, selectedClusters, isAllClustersSelected])

  const { totalPredicted, criticalPredicted, aiPredictionCount, heuristicPredictionCount } = useMemo(() => {
    let critical = 0, ai = 0, heuristic = 0
    for (const r of predictedRisks) {
      if (r.severity === 'critical') critical++
      if (r.source === 'ai') ai++
      else if (r.source === 'heuristic') heuristic++
    }
    return { totalPredicted: predictedRisks.length, criticalPredicted: critical, aiPredictionCount: ai, heuristicPredictionCount: heuristic }
  }, [predictedRisks])

  const unifiedItems = useMemo((): UnifiedItem[] => [
    ...buildOfflineItems(offlineNodes),
    ...buildClusterHealthItems(clusterHealthIssues),
    ...buildGpuItems(gpuIssues),
    ...buildPredictionItems(predictedRisks),
  ], [offlineNodes, clusterHealthIssues, gpuIssues, predictedRisks])

  const filteredItems = useMemo(() => {
    let result = unifiedItems
    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter(item => item.name.toLowerCase().includes(query) || item.cluster.toLowerCase().includes(query) || item.reason.toLowerCase().includes(query))
    }
    if (localClusterFilter.length > 0) result = result.filter(item => localClusterFilter.includes(item.cluster))
    return result
  }, [unifiedItems, search, localClusterFilter])

  const sortedItems = useMemo(() => {
    const sevOrder = ALERT_SEVERITY_ORDER as Record<string, number>
    const categoryOrder: Record<string, number> = { offline: 0, gpu: 1, prediction: 2 }
    return [...filteredItems].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'cluster': cmp = a.cluster.localeCompare(b.cluster); break
        case 'severity': cmp = (sevOrder[a.severity] ?? 999) - (sevOrder[b.severity] ?? 999); break
        case 'category': cmp = (categoryOrder[a.category] ?? 999) - (categoryOrder[b.category] ?? 999); break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
  }, [filteredItems, sortField, sortDirection])

  const { effectivePerPage, totalPages, needsPagination, paginatedItems } = useMemo(() => {
    const eff = itemsPerPage === 'unlimited' ? sortedItems.length : itemsPerPage
    const tp = Math.ceil(sortedItems.length / eff) || 1
    const needs = itemsPerPage !== 'unlimited' && sortedItems.length > eff
    const items = itemsPerPage === 'unlimited' ? sortedItems : sortedItems.slice((currentPage - 1) * eff, (currentPage - 1) * eff + eff)
    return { effectivePerPage: eff, totalPages: tp, needsPagination: needs, paginatedItems: items }
  }, [sortedItems, itemsPerPage, currentPage])

  const availableClustersForFilter = useMemo(() => {
    const set = new Set<string>()
    unifiedItems.forEach(item => set.add(item.cluster))
    return Array.from(set).sort()
  }, [unifiedItems])

  const categorizedItems = useMemo(() => {
    const offline: UnifiedItem[] = []
    const gpu: UnifiedItem[] = []
    const prediction: UnifiedItem[] = []
    const criticalPredictions: UnifiedItem[] = []
    const aiPredictions: UnifiedItem[] = []
    for (const item of sortedItems) {
      if (item.category === 'offline') offline.push(item)
      else if (item.category === 'gpu') gpu.push(item)
      else if (item.category === 'prediction') {
        prediction.push(item)
        if (item.predictionData?.severity === 'critical') criticalPredictions.push(item)
        if (item.predictionData?.source === 'ai') aiPredictions.push(item)
      }
    }
    return { offline, gpu, prediction, criticalPredictions, aiPredictions }
  }, [sortedItems])

  const filteredOfflineCount = categorizedItems.offline.length
  const filteredGpuCount = categorizedItems.gpu.length
  const filteredPredictionCount = categorizedItems.prediction.length
  const rootCauseGroups = useMemo(() => buildRootCauseGroups(sortedItems, ALERT_SEVERITY_ORDER as Record<string, number>), [sortedItems])
  const filteredTotalIssues = filteredOfflineCount + filteredGpuCount
  const filteredTotalPredicted = filteredPredictionCount
  const filteredCriticalPredicted = categorizedItems.criticalPredictions.length
  const filteredAIPredictionCount = categorizedItems.aiPredictions.length
  const currentClusterIssueCount = offlineNodes.length + clusterHealthIssues.length
  const firstCurrentIssueCluster = offlineNodes[0]?.cluster || clusterHealthIssues[0]?.cluster || null
  const isFiltered = search.trim() !== '' || localClusterFilter.length > 0

  return {
    nodes,
    offlineNodes,
    clusterHealthIssues,
    gpuIssues,
    heuristicPredictions,
    predictedRisks,
    totalPredicted,
    criticalPredicted,
    aiPredictionCount,
    heuristicPredictionCount,
    unifiedItems,
    filteredItems,
    sortedItems,
    effectivePerPage,
    totalPages,
    needsPagination,
    paginatedItems,
    availableClustersForFilter,
    categorizedItems,
    filteredOfflineCount,
    filteredGpuCount,
    filteredPredictionCount,
    filteredTotalIssues,
    filteredTotalPredicted,
    filteredCriticalPredicted,
    filteredAIPredictionCount,
    rootCauseGroups,
    currentClusterIssueCount,
    firstCurrentIssueCluster,
    isFiltered,
  }
}
