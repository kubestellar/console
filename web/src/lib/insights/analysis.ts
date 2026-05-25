import type { ClusterEvent, ClusterInfo, Deployment, PodIssue } from '../../hooks/mcp/types'
import type { CascadeLink, ClusterDelta, InsightCategory, MultiClusterInsight } from '../../types/insights'
import { MS_PER_MINUTE } from '../constants/time'
import {
  APP_BUG_MIN_CLUSTERS,
  CASCADE_DETECTION_WINDOW_MS,
  CPU_CRITICAL_THRESHOLD_PCT,
  EVENT_CORRELATION_WINDOW_MS,
  CRITICAL_CLUSTER_THRESHOLD,
  DELTA_SIGNIFICANCE_HIGH_PCT,
  DELTA_SIGNIFICANCE_MEDIUM_PCT,
  EMPTY_INSIGHTS_BY_CATEGORY,
  FULL_PROGRESS,
  INFRA_CRITICAL_WORKLOADS,
  INFRA_ISSUE_MIN_WORKLOADS,
  MAX_INSIGHTS_PER_CATEGORY,
  MAX_TOP_INSIGHTS,
  MIN_CORRELATED_CLUSTERS,
  RESOURCE_IMBALANCE_THRESHOLD_PCT,
  RESTART_CORRELATION_THRESHOLD,
  RESTART_CRITICAL_THRESHOLD,
  ROLLOUT_STATUS_COMPLETE,
  ROLLOUT_STATUS_FAILED,
  ROLLOUT_STATUS_IN_PROGRESS,
  SEVERITY_RANK,
} from './constants'
import { generateId, isCausallyRelated, now, parseTimestamp, pct } from './helpers'

export function detectEventCorrelations(events: ClusterEvent[]): MultiClusterInsight[] {
  const warnings = (events || []).filter(event => event.type === 'Warning' && event.cluster && event.lastSeen)
  if (warnings.length === 0) return []

  const windows = new Map<number, Map<string, ClusterEvent[]>>()
  for (const event of warnings) {
    const ts = parseTimestamp(event.lastSeen)
    if (ts === 0) continue

    const bucket = Math.floor(ts / EVENT_CORRELATION_WINDOW_MS) * EVENT_CORRELATION_WINDOW_MS
    if (!windows.has(bucket)) windows.set(bucket, new Map())

    const cluster = event.cluster || 'unknown'
    const clusterMap = windows.get(bucket)!
    if (!clusterMap.has(cluster)) clusterMap.set(cluster, [])
    clusterMap.get(cluster)!.push(event)
  }

  const insights: MultiClusterInsight[] = []
  for (const [bucket, clusterMap] of windows) {
    if (clusterMap.size < MIN_CORRELATED_CLUSTERS) continue

    const affectedClusters = Array.from(clusterMap.keys())
    const allEvents = Array.from(clusterMap.values()).flat()
    const reasons = [...new Set((allEvents || []).map(event => event.reason))].join(', ')
    const totalEvents = allEvents.reduce((sum, event) => sum + (event.count || 1), 0)

    insights.push({
      id: generateId('event-correlation', String(bucket)),
      category: 'event-correlation',
      source: 'heuristic',
      severity: clusterMap.size >= CRITICAL_CLUSTER_THRESHOLD ? 'critical' : 'warning',
      title: `${clusterMap.size} clusters had simultaneous warnings`,
      description: `${totalEvents} warning events across ${affectedClusters.join(', ')} within a 5-minute window. Common reasons: ${reasons}.`,
      affectedClusters,
      relatedResources: [...new Set((allEvents || []).map(event => String(event.object || '')))].slice(0, 5),
      detectedAt: new Date(bucket).toISOString(),
    })
  }

  return insights.slice(0, MAX_INSIGHTS_PER_CATEGORY)
}

export function detectClusterDeltas(deployments: Deployment[], clusters: ClusterInfo[]): MultiClusterInsight[] {
  if ((deployments || []).length === 0 || (clusters || []).length < 2) return []

  const workloadMap = new Map<string, Map<string, Deployment>>()
  for (const deployment of deployments || []) {
    const key = `${deployment.namespace}/${deployment.name}`
    if (!workloadMap.has(key)) workloadMap.set(key, new Map())
    if (deployment.cluster) workloadMap.get(key)!.set(deployment.cluster, deployment)
  }

  const insights: MultiClusterInsight[] = []
  for (const [workloadKey, clusterDeployments] of workloadMap) {
    if (clusterDeployments.size < 2) continue

    const deltas: ClusterDelta[] = []
    const entries = Array.from(clusterDeployments.entries())
    for (let left = 0; left < entries.length; left++) {
      for (let right = left + 1; right < entries.length; right++) {
        const [clusterA, depA] = entries[left]
        const [clusterB, depB] = entries[right]

        if (depA.image && depB.image && depA.image !== depB.image) {
          deltas.push({
            dimension: 'Image Version',
            clusterA: { name: clusterA, value: depA.image },
            clusterB: { name: clusterB, value: depB.image },
            significance: 'high',
          })
        }

        if (depA.replicas !== depB.replicas) {
          const diff = Math.abs(depA.replicas - depB.replicas)
          const maxReplicas = Math.max(depA.replicas, depB.replicas)
          const pctDiff = maxReplicas > 0 ? (diff / maxReplicas) * FULL_PROGRESS : 0
          deltas.push({
            dimension: 'Replica Count',
            clusterA: { name: clusterA, value: depA.replicas },
            clusterB: { name: clusterB, value: depB.replicas },
            significance: pctDiff >= DELTA_SIGNIFICANCE_HIGH_PCT ? 'high' : pctDiff >= DELTA_SIGNIFICANCE_MEDIUM_PCT ? 'medium' : 'low',
          })
        }

        if (depA.status !== depB.status) {
          deltas.push({
            dimension: 'Status',
            clusterA: { name: clusterA, value: depA.status },
            clusterB: { name: clusterB, value: depB.status },
            significance: depA.status === 'failed' || depB.status === 'failed' ? 'high' : 'medium',
          })
        }
      }
    }

    if (deltas.length === 0) continue

    const highDeltas = deltas.filter(delta => delta.significance === 'high')
    const affectedClusters = [...new Set(entries.map(([cluster]) => cluster))]
    insights.push({
      id: generateId('cluster-delta', workloadKey),
      category: 'cluster-delta',
      source: 'heuristic',
      severity: highDeltas.length > 0 ? 'warning' : 'info',
      title: `${workloadKey} differs across ${affectedClusters.length} clusters`,
      description: `Found ${deltas.length} differences: ${(deltas || []).map(delta => delta.dimension).join(', ')}.`,
      affectedClusters,
      relatedResources: [workloadKey],
      detectedAt: now(),
      deltas,
    })
  }

  return insights.sort((a, b) => (b.deltas?.length || 0) - (a.deltas?.length || 0)).slice(0, MAX_INSIGHTS_PER_CATEGORY)
}

export function detectCascadeImpact(events: ClusterEvent[]): MultiClusterInsight[] {
  const warnings = (events || [])
    .filter(event => event.type === 'Warning' && event.cluster && event.lastSeen)
    .sort((a, b) => parseTimestamp(a.lastSeen) - parseTimestamp(b.lastSeen))
  if (warnings.length < 2) return []

  const insights: MultiClusterInsight[] = []
  const usedEvents = new Set<number>()
  for (let index = 0; index < warnings.length; index++) {
    if (usedEvents.has(index)) continue

    const first = warnings[index]
    const chain: CascadeLink[] = [{
      cluster: first.cluster || 'unknown',
      resource: first.object,
      event: first.reason,
      timestamp: first.lastSeen || '',
      severity: 'warning',
    }]
    usedEvents.add(index)

    const baseTs = parseTimestamp(first.lastSeen)
    const seenClusters = new Set([first.cluster])
    for (let candidateIndex = index + 1; candidateIndex < warnings.length; candidateIndex++) {
      if (usedEvents.has(candidateIndex)) continue

      const candidate = warnings[candidateIndex]
      const ts = parseTimestamp(candidate.lastSeen)
      if (ts - baseTs > CASCADE_DETECTION_WINDOW_MS) break
      if (seenClusters.has(candidate.cluster)) continue
      if (!isCausallyRelated(first, candidate)) continue

      chain.push({
        cluster: candidate.cluster || 'unknown',
        resource: candidate.object,
        event: candidate.reason,
        timestamp: candidate.lastSeen || '',
        severity: 'warning',
      })
      seenClusters.add(candidate.cluster)
      usedEvents.add(candidateIndex)
    }

    if (chain.length < MIN_CORRELATED_CLUSTERS) continue

    const affectedClusters = chain.map(link => link.cluster)
    insights.push({
      id: generateId('cascade-impact', String(baseTs)),
      category: 'cascade-impact',
      source: 'heuristic',
      severity: chain.length >= CRITICAL_CLUSTER_THRESHOLD ? 'critical' : 'warning',
      title: `Possible cascade across ${chain.length} clusters`,
      description: `Issues started in ${chain[0].cluster} (${chain[0].event}) and spread to ${affectedClusters.slice(1).join(', ')} within ${Math.round(CASCADE_DETECTION_WINDOW_MS / MS_PER_MINUTE)} minutes.`,
      affectedClusters,
      detectedAt: chain[0].timestamp,
      chain,
    })
  }

  return insights.slice(0, MAX_INSIGHTS_PER_CATEGORY)
}

export function detectConfigDrift(deployments: Deployment[]): MultiClusterInsight[] {
  if ((deployments || []).length === 0) return []

  const workloadMap = new Map<string, Deployment[]>()
  for (const deployment of deployments || []) {
    const key = `${deployment.namespace}/${deployment.name}`
    if (!workloadMap.has(key)) workloadMap.set(key, [])
    workloadMap.get(key)!.push(deployment)
  }

  const insights: MultiClusterInsight[] = []
  for (const [workloadKey, deps] of workloadMap) {
    if (deps.length < 2) continue

    const images = new Set((deps || []).map(dep => dep.image).filter(Boolean))
    const replicaSets = new Set((deps || []).map(dep => dep.replicas))
    if (images.size <= 1 && replicaSets.size <= 1) continue

    const driftDimensions: string[] = []
    if (images.size > 1) driftDimensions.push(`${images.size} different images`)
    if (replicaSets.size > 1) driftDimensions.push(`${replicaSets.size} different replica counts`)

    const affectedClusters = [...new Set((deps || []).map(dep => dep.cluster).filter((cluster): cluster is string => !!cluster))]
    insights.push({
      id: generateId('config-drift', workloadKey),
      category: 'config-drift',
      source: 'heuristic',
      severity: images.size > 1 ? 'warning' : 'info',
      title: `Config drift in ${workloadKey}`,
      description: `${workloadKey} has ${driftDimensions.join(' and ')} across ${affectedClusters.length} clusters.`,
      affectedClusters,
      relatedResources: [workloadKey],
      detectedAt: now(),
    })
  }

  return insights.slice(0, MAX_INSIGHTS_PER_CATEGORY)
}

export function detectResourceImbalance(clusters: ClusterInfo[]): MultiClusterInsight[] {
  const healthy = (clusters || []).filter(cluster => cluster.healthy !== false && cluster.cpuCores && cluster.cpuCores > 0)
  if (healthy.length < 2) return []

  const insights: MultiClusterInsight[] = []
  const cpuPcts = healthy.map(cluster => ({
    name: cluster.name,
    pct: pct(cluster.cpuUsageCores || cluster.cpuRequestsCores, cluster.cpuCores),
  }))
  const avgCpu = cpuPcts.reduce((sum, cluster) => sum + cluster.pct, 0) / cpuPcts.length
  const overloaded = cpuPcts.filter(cluster => cluster.pct - avgCpu > RESOURCE_IMBALANCE_THRESHOLD_PCT)
  const underloaded = cpuPcts.filter(cluster => avgCpu - cluster.pct > RESOURCE_IMBALANCE_THRESHOLD_PCT)

  if (overloaded.length > 0 || underloaded.length > 0) {
    const metrics: Record<string, number> = {}
    for (const cluster of cpuPcts || []) metrics[cluster.name] = cluster.pct

    const parts: string[] = []
    if (overloaded.length > 0) parts.push(`${(overloaded || []).map(cluster => `${cluster.name} (${cluster.pct}%)`).join(', ')} above average`)
    if (underloaded.length > 0) parts.push(`${(underloaded || []).map(cluster => `${cluster.name} (${cluster.pct}%)`).join(', ')} below average`)

    insights.push({
      id: generateId('resource-imbalance', 'cpu'),
      category: 'resource-imbalance',
      source: 'heuristic',
      severity: overloaded.some(cluster => cluster.pct > CPU_CRITICAL_THRESHOLD_PCT) ? 'critical' : 'warning',
      title: `CPU imbalance across fleet (avg ${Math.round(avgCpu)}%)`,
      description: `${parts.join('; ')}. Fleet average: ${Math.round(avgCpu)}%.`,
      affectedClusters: [...overloaded, ...underloaded].map(cluster => cluster.name),
      detectedAt: now(),
      metrics,
    })
  }

  const memPcts = healthy
    .filter(cluster => cluster.memoryGB && cluster.memoryGB > 0)
    .map(cluster => ({
      name: cluster.name,
      pct: pct(cluster.memoryUsageGB || cluster.memoryRequestsGB, cluster.memoryGB),
    }))

  if (memPcts.length >= 2) {
    const avgMem = memPcts.reduce((sum, cluster) => sum + cluster.pct, 0) / memPcts.length
    const memOverloaded = memPcts.filter(cluster => cluster.pct - avgMem > RESOURCE_IMBALANCE_THRESHOLD_PCT)
    const memUnderloaded = memPcts.filter(cluster => avgMem - cluster.pct > RESOURCE_IMBALANCE_THRESHOLD_PCT)

    if (memOverloaded.length > 0 || memUnderloaded.length > 0) {
      const metrics: Record<string, number> = {}
      for (const cluster of memPcts || []) metrics[cluster.name] = cluster.pct

      insights.push({
        id: generateId('resource-imbalance', 'memory'),
        category: 'resource-imbalance',
        source: 'heuristic',
        severity: memOverloaded.some(cluster => cluster.pct > CPU_CRITICAL_THRESHOLD_PCT) ? 'critical' : 'warning',
        title: `Memory imbalance across fleet (avg ${Math.round(avgMem)}%)`,
        description: `Memory utilization ranges from ${Math.min(...memPcts.map(cluster => cluster.pct))}% to ${Math.max(...memPcts.map(cluster => cluster.pct))}%. Fleet average: ${Math.round(avgMem)}%.`,
        affectedClusters: [...memOverloaded, ...memUnderloaded].map(cluster => cluster.name),
        detectedAt: now(),
        metrics,
      })
    }
  }

  return insights
}

export function detectRestartCorrelation(podIssues: PodIssue[]): MultiClusterInsight[] {
  const issues = (podIssues || []).filter(issue => issue.restarts >= RESTART_CORRELATION_THRESHOLD && issue.cluster)
  if (issues.length === 0) return []

  const insights: MultiClusterInsight[] = []
  const workloadRestarts = new Map<string, Map<string, number>>()
  for (const issue of issues || []) {
    const parts = issue.name.split('-')
    const workload = parts.length > 2 ? parts.slice(0, -2).join('-') : issue.name
    const key = `${issue.namespace}/${workload}`
    if (!workloadRestarts.has(key)) workloadRestarts.set(key, new Map())

    const cluster = issue.cluster || 'unknown'
    const clusterMap = workloadRestarts.get(key)!
    clusterMap.set(cluster, (clusterMap.get(cluster) || 0) + issue.restarts)
  }

  for (const [workload, clusterMap] of workloadRestarts) {
    if (clusterMap.size < APP_BUG_MIN_CLUSTERS) continue

    const affectedClusters = Array.from(clusterMap.keys())
    const totalRestarts = Array.from(clusterMap.values()).reduce((sum, count) => sum + count, 0)
    insights.push({
      id: generateId('restart-correlation', 'app-bug', workload),
      category: 'restart-correlation',
      source: 'heuristic',
      severity: totalRestarts > RESTART_CRITICAL_THRESHOLD ? 'critical' : 'warning',
      title: `${workload} restarting across ${clusterMap.size} clusters (likely app bug)`,
      description: `${workload} has ${totalRestarts} total restarts across ${affectedClusters.join(', ')}. Same workload failing everywhere suggests an application-level issue.`,
      affectedClusters,
      relatedResources: [workload],
      detectedAt: now(),
    })
  }

  const clusterWorkloadCounts = new Map<string, Set<string>>()
  for (const [workload, clusterMap] of workloadRestarts) {
    for (const cluster of clusterMap.keys()) {
      if (!clusterWorkloadCounts.has(cluster)) clusterWorkloadCounts.set(cluster, new Set())
      clusterWorkloadCounts.get(cluster)!.add(workload)
    }
  }

  for (const [cluster, workloads] of clusterWorkloadCounts) {
    if (workloads.size < INFRA_ISSUE_MIN_WORKLOADS) continue

    insights.push({
      id: generateId('restart-correlation', 'infra-issue', cluster),
      category: 'restart-correlation',
      source: 'heuristic',
      severity: workloads.size >= INFRA_CRITICAL_WORKLOADS ? 'critical' : 'warning',
      title: `${workloads.size} workloads restarting in ${cluster} (likely infra issue)`,
      description: `Multiple different workloads (${Array.from(workloads).slice(0, 5).join(', ')}) are restarting in ${cluster}. This pattern suggests an infrastructure problem rather than an application bug.`,
      affectedClusters: [cluster],
      relatedResources: Array.from(workloads).slice(0, 10),
      detectedAt: now(),
    })
  }

  return insights.slice(0, MAX_INSIGHTS_PER_CATEGORY)
}

export function trackRolloutProgress(deployments: Deployment[]): MultiClusterInsight[] {
  if ((deployments || []).length === 0) return []

  const workloadMap = new Map<string, Deployment[]>()
  for (const deployment of deployments || []) {
    const key = `${deployment.namespace}/${deployment.name}`
    if (!workloadMap.has(key)) workloadMap.set(key, [])
    workloadMap.get(key)!.push(deployment)
  }

  const insights: MultiClusterInsight[] = []
  for (const [workloadKey, deps] of workloadMap) {
    if (deps.length < 2) continue

    const images = [...new Set((deps || []).map(dep => dep.image).filter(Boolean))]
    if (images.length < 2) continue

    const newestImage = (() => {
      const parseVersion = (image: string): number[] | null => {
        const match = image.match(/:v?(\d+(?:\.\d+)*)/)
        return match ? match[1].split('.').map(Number) : null
      }
      const compareVersions = (left: number[], right: number[]): number => {
        const length = Math.max(left.length, right.length)
        for (let index = 0; index < length; index++) {
          const diff = (left[index] || 0) - (right[index] || 0)
          if (diff !== 0) return diff
        }
        return 0
      }

      const uniqueImages = [...new Set((deps || []).map(dep => dep.image).filter((image): image is string => !!image))]
      const withVersion = uniqueImages
        .map(image => ({ image, version: parseVersion(image) }))
        .filter((item): item is { image: string; version: number[] } => item.version !== null)
      if (withVersion.length > 0) {
        withVersion.sort((left, right) => compareVersions(right.version, left.version))
        return withVersion[0].image
      }
      return uniqueImages.sort().reverse()[0]
    })()

    const completed = (deps || []).filter(dep => dep.image === newestImage && dep.cluster)
    const pending = (deps || []).filter(dep => dep.image !== newestImage && dep.status !== 'failed' && dep.cluster)
    const failed = (deps || []).filter(dep => dep.status === 'failed' && dep.cluster)
    const affectedClusters = [...new Set((deps || []).map(dep => dep.cluster).filter((cluster): cluster is string => !!cluster))]

    const metrics: Record<string, number> = {
      completed: completed.length,
      pending: pending.length,
      failed: failed.length,
      total: deps.length,
    }
    for (const dep of deps || []) {
      if (!dep.cluster) continue

      if (dep.status === 'failed') {
        metrics[`${dep.cluster}_progress`] = 0
        metrics[`${dep.cluster}_status`] = ROLLOUT_STATUS_FAILED
      } else if (dep.image === newestImage) {
        metrics[`${dep.cluster}_progress`] = FULL_PROGRESS
        metrics[`${dep.cluster}_status`] = ROLLOUT_STATUS_COMPLETE
      } else {
        metrics[`${dep.cluster}_progress`] = dep.replicas > 0 ? Math.round((dep.readyReplicas / dep.replicas) * FULL_PROGRESS) : 0
        metrics[`${dep.cluster}_status`] = ROLLOUT_STATUS_IN_PROGRESS
      }
    }

    insights.push({
      id: generateId('rollout-tracker', workloadKey),
      category: 'rollout-tracker',
      source: 'heuristic',
      severity: failed.length > 0 ? 'warning' : 'info',
      title: `Rollout in progress: ${workloadKey}`,
      description: `${completed.length}/${deps.length} clusters on ${newestImage}. ${pending.length} pending, ${failed.length} failed.`,
      affectedClusters,
      relatedResources: [workloadKey],
      detectedAt: now(),
      metrics,
    })
  }

  return insights.slice(0, MAX_INSIGHTS_PER_CATEGORY)
}

export function buildInsights(params: {
  deduplicatedClusters: ClusterInfo[]
  deployments: Deployment[]
  events: ClusterEvent[]
  podIssues: PodIssue[]
  warningEvents: ClusterEvent[]
}): MultiClusterInsight[] {
  const all: MultiClusterInsight[] = [
    ...detectEventCorrelations(params.events || []),
    ...detectClusterDeltas(params.deployments || [], params.deduplicatedClusters || []),
    ...detectCascadeImpact(params.warningEvents || []),
    ...detectConfigDrift(params.deployments || []),
    ...detectResourceImbalance(params.deduplicatedClusters || []),
    ...detectRestartCorrelation(params.podIssues || []),
    ...trackRolloutProgress(params.deployments || []),
  ]

  return all.sort((left, right) => {
    const severityDiff = (SEVERITY_RANK[right.severity] || 0) - (SEVERITY_RANK[left.severity] || 0)
    if (severityDiff !== 0) return severityDiff
    return right.affectedClusters.length - left.affectedClusters.length
  })
}

export function groupInsightsByCategory(insights: MultiClusterInsight[]): Record<InsightCategory, MultiClusterInsight[]> {
  const result: Record<InsightCategory, MultiClusterInsight[]> = { ...EMPTY_INSIGHTS_BY_CATEGORY }
  for (const category of Object.keys(result) as InsightCategory[]) result[category] = []
  for (const insight of insights || []) {
    result[insight.category].push(insight)
  }

  return result
}

export function getTopInsights(insights: MultiClusterInsight[]): MultiClusterInsight[] {
  return (insights || []).slice(0, MAX_TOP_INSIGHTS)
}
