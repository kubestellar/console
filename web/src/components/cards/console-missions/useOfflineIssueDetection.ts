/**
 * Detects offline nodes, cluster health issues, GPU issues, and predicted
 * risks (heuristic + AI) for ConsoleOfflineDetectionCard, and builds the
 * resulting unified item list. Extracted from the main component to keep
 * it focused on composition/rendering.
 */
import { useMemo } from 'react'
import type { TFunction } from 'i18next'
import type { ClusterInfo, GPUNode } from '../../../hooks/useMCP'
import type { PodIssue } from '../../../hooks/mcp/types.workloads'
import type { PredictedRisk, PredictionSettings, TrendDirection } from '../../../types/predictions'
import { getClusterHealthState, isClusterTokenExpired } from '../../clusters/utils'
import {
  type NodeData,
  type UnifiedItem,
  type ClusterHealthIssue,
  type GpuIssue,
  buildOfflineItems,
  buildClusterHealthItems,
  buildGpuItems,
  buildPredictionItems,
  generatePredictionId,
} from './offlineDataTransforms'
import { GPU_CLUSTER_EXHAUSTION_THRESHOLD } from './nodeCache'

interface UseOfflineIssueDetectionArgs {
  nodes: NodeData[]
  globalFilteredClusters: ClusterInfo[]
  gpuNodes: GPUNode[]
  podIssues: PodIssue[]
  clusters: ClusterInfo[]
  selectedClusters: string[]
  isAllClustersSelected: boolean
  thresholds: PredictionSettings['thresholds']
  aiPredictions: PredictedRisk[]
  aiEnabled: boolean
  getClusterTrend: (clusterName: string, metric: 'cpuPercent' | 'memoryPercent') => TrendDirection
  getPodRestartTrend: (podName: string, cluster: string) => TrendDirection
  t: TFunction<['cards', 'common']>
}

export function useOfflineIssueDetection({
  nodes,
  globalFilteredClusters,
  gpuNodes,
  podIssues,
  clusters,
  selectedClusters,
  isAllClustersSelected,
  thresholds,
  aiPredictions,
  aiEnabled,
  getClusterTrend,
  getPodRestartTrend,
  t,
}: UseOfflineIssueDetectionArgs) {
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
      if (pod.restarts && pod.restarts >= thresholds.highRestartCount) {
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
        if (cpuPercent >= thresholds.cpuPressure) {
          const trend = getClusterTrend(cluster.name, 'cpuPercent')
          risks.push({
            id: generatePredictionId('resource-exhaustion-cpu', cluster.name, cluster.name),
            type: 'resource-exhaustion',
            severity: cpuPercent >= 90 ? 'critical' : 'warning',
            name: cluster.name,
            cluster: cluster.name,
            reason: `CPU at ${cpuPercent.toFixed(0)}% - risk of throttling`,
            reasonDetailed: `Cluster CPU utilization is at ${cpuPercent.toFixed(1)}%, above the ${thresholds.cpuPressure}% warning threshold. At this level, workloads may experience throttling, increased latency, and degraded performance. Consider scaling up nodes, optimizing resource-intensive workloads, or implementing CPU limits.`,
            metric: `${cpuPercent.toFixed(0)}% CPU`,
            source: 'heuristic',
            trend })
        }
      }

      if (cluster.memoryGB && cluster.memoryUsageGB) {
        const memPercent = (cluster.memoryUsageGB / cluster.memoryGB) * 100
        if (memPercent >= thresholds.memoryPressure) {
          const trend = getClusterTrend(cluster.name, 'memoryPercent')
          risks.push({
            id: generatePredictionId('resource-exhaustion-mem', cluster.name, cluster.name),
            type: 'resource-exhaustion',
            severity: memPercent >= 95 ? 'critical' : 'warning',
            name: cluster.name,
            cluster: cluster.name,
            reason: `Memory at ${memPercent.toFixed(0)}% - risk of OOM`,
            reasonDetailed: `Cluster memory utilization is at ${memPercent.toFixed(1)}%, above the ${thresholds.memoryPressure}% warning threshold. Pods may be OOMKilled, nodes may become unschedulable, and new deployments may fail. Consider scaling up memory, reviewing memory limits, or identifying memory leaks.`,
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
  }, [podIssues, clusters, gpuNodes, selectedClusters, isAllClustersSelected, thresholds, getClusterTrend, getPodRestartTrend])

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

  // Single-pass counts to avoid repeated O(n) scans
  const { totalPredicted, criticalPredicted, aiPredictionCount, heuristicPredictionCount } = useMemo(() => {
    let critical = 0
    let ai = 0
    let heuristic = 0
    for (const r of predictedRisks) {
      if (r.severity === 'critical') critical++
      if (r.source === 'ai') ai++
      else if (r.source === 'heuristic') heuristic++
    }
    return {
      totalPredicted: predictedRisks.length,
      criticalPredicted: critical,
      aiPredictionCount: ai,
      heuristicPredictionCount: heuristic,
    }
  }, [predictedRisks])

  // Unified items list for filtering/sorting/pagination
  const unifiedItems = useMemo((): UnifiedItem[] => {
    return [
      ...buildOfflineItems(offlineNodes),
      ...buildClusterHealthItems(clusterHealthIssues),
      ...buildGpuItems(gpuIssues),
      ...buildPredictionItems(predictedRisks),
    ]
  }, [offlineNodes, clusterHealthIssues, gpuIssues, predictedRisks])

  return {
    offlineNodes,
    clusterHealthIssues,
    gpuIssues,
    predictedRisks,
    unifiedItems,
    totalPredicted,
    criticalPredicted,
    aiPredictionCount,
    heuristicPredictionCount,
  }
}
