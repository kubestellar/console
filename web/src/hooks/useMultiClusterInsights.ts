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
import type {
  MultiClusterInsight,
  InsightCategory,
  InsightSeverity,
  UseMultiClusterInsightsResult,
  CascadeLink,
  ClusterDelta,
} from '../types/insights'
import type { ClusterEvent, Deployment, PodIssue } from './mcp/types'
import type { ClusterInfo } from './mcp/types'

// ── Thresholds & Constants ────────────────────────────────────────────

/** Minimum clusters with events in same window to trigger correlation */
const MIN_CORRELATED_CLUSTERS = 2
/** Time window in ms for event correlation grouping (5 minutes) */
const EVENT_CORRELATION_WINDOW_MS = 5 * 60 * 1000
/** Time window in ms for cascade detection (15 minutes) */
const CASCADE_DETECTION_WINDOW_MS = 15 * 60 * 1000
/** CPU/memory utilization percentage threshold for resource imbalance */
const RESOURCE_IMBALANCE_THRESHOLD_PCT = 30
/** Pod restart count threshold for restart correlation */
const RESTART_CORRELATION_THRESHOLD = 3
/** Maximum number of insights per category */
const MAX_INSIGHTS_PER_CATEGORY = 10
/** Maximum number of top insights to return */
const MAX_TOP_INSIGHTS = 5
/** Percentage threshold for considering two values significantly different */
const DELTA_SIGNIFICANCE_HIGH_PCT = 50
/** Percentage threshold for medium significance */
const DELTA_SIGNIFICANCE_MEDIUM_PCT = 20
/** Minimum workloads in a vertical restart pattern to flag infra issue */
const INFRA_ISSUE_MIN_WORKLOADS = 3
/** Minimum clusters in a horizontal restart pattern to flag app bug */
const APP_BUG_MIN_CLUSTERS = 2

/** Rollout per-cluster status indices (stored in metrics as ${cluster}_status): 0=pending, 1=in-progress, 2=complete, 3=failed */
const ROLLOUT_STATUS_IN_PROGRESS = 1
const ROLLOUT_STATUS_COMPLETE = 2
const ROLLOUT_STATUS_FAILED = 3
/** Full rollout progress percentage */
const FULL_PROGRESS = 100
/** Partial rollout progress percentage (pending cluster) */
const PARTIAL_PROGRESS = 50

/** Demo time offset: 5 minutes ago */
const DEMO_OFFSET_5M_MS = 5 * 60 * 1000
/** Demo time offset: 10 minutes ago */
const DEMO_OFFSET_10M_MS = 10 * 60 * 1000
/** Demo time offset: 15 minutes ago */
const DEMO_OFFSET_15M_MS = 15 * 60 * 1000

// ── Helpers ───────────────────────────────────────────────────────────

/** @internal Exported for testing */
export function generateId(category: InsightCategory, ...parts: string[]): string {
  return `${category}:${parts.join(':')}`
}

/** @internal Exported for testing */
export function now(): string {
  return new Date().toISOString()
}

/** @internal Exported for testing */
export function parseTimestamp(ts?: string): number {
  if (!ts) return 0
  return new Date(ts).getTime()
}

/** @internal Exported for testing */
export function pct(value: number | undefined, total: number | undefined): number {
  if (!value || !total || total === 0) return 0
  return Math.round((value / total) * 100)
}

// ── Algorithm 1: Event Correlations ───────────────────────────────────

/** @internal Exported for testing */
export function detectEventCorrelations(events: ClusterEvent[]): MultiClusterInsight[] {
  const warnings = (events || []).filter(e => e.type === 'Warning' && e.cluster && e.lastSeen)
  if (warnings.length === 0) return []

  // Group events into time windows
  const windows = new Map<number, Map<string, ClusterEvent[]>>()

  for (const event of (warnings || [])) {
    const ts = parseTimestamp(event.lastSeen)
    if (ts === 0) continue
    const bucket = Math.floor(ts / EVENT_CORRELATION_WINDOW_MS) * EVENT_CORRELATION_WINDOW_MS
    if (!windows.has(bucket)) windows.set(bucket, new Map())
    const clusterMap = windows.get(bucket)!
    const cluster = event.cluster || 'unknown'
    if (!clusterMap.has(cluster)) clusterMap.set(cluster, [])
    clusterMap.get(cluster)!.push(event)
  }

  const insights: MultiClusterInsight[] = []

  for (const [bucket, clusterMap] of windows) {
    if (clusterMap.size < MIN_CORRELATED_CLUSTERS) continue

    const affectedClusters = Array.from(clusterMap.keys())
    const allEvents = Array.from(clusterMap.values()).flat()
    const reasons = [...new Set((allEvents || []).map(e => e.reason))].join(', ')
    const totalEvents = allEvents.reduce((sum, e) => sum + (e.count || 1), 0)

    insights.push({
      id: generateId('event-correlation', String(bucket)),
      category: 'event-correlation',
      source: 'heuristic',
      severity: clusterMap.size >= 3 ? 'critical' : 'warning',
      title: `${clusterMap.size} clusters had simultaneous warnings`,
      description: `${totalEvents} warning events across ${affectedClusters.join(', ')} within a 5-minute window. Common reasons: ${reasons}.`,
      affectedClusters,
      relatedResources: [...new Set((allEvents || []).map(e => String(e.object || '')))].slice(0, 5),
      detectedAt: new Date(bucket).toISOString(),
    })
  }

  return insights.slice(0, MAX_INSIGHTS_PER_CATEGORY)
}

// ── Algorithm 2: Cluster Deltas ───────────────────────────────────────

/** @internal Exported for testing */
export function detectClusterDeltas(
  deployments: Deployment[],
  clusters: ClusterInfo[],
): MultiClusterInsight[] {
  if ((deployments || []).length === 0 || (clusters || []).length < 2) return []

  // Group deployments by name+namespace across clusters
  const workloadMap = new Map<string, Map<string, Deployment>>()
  for (const dep of deployments || []) {
    const key = `${dep.namespace}/${dep.name}`
    if (!workloadMap.has(key)) workloadMap.set(key, new Map())
    if (dep.cluster) workloadMap.get(key)!.set(dep.cluster, dep)
  }

  const insights: MultiClusterInsight[] = []

  for (const [workloadKey, clusterDeployments] of workloadMap) {
    if (clusterDeployments.size < 2) continue

    const deltas: ClusterDelta[] = []
    const entries = Array.from(clusterDeployments.entries())

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [clusterA, depA] = entries[i]
        const [clusterB, depB] = entries[j]

        // Image version delta
        if (depA.image && depB.image && depA.image !== depB.image) {
          deltas.push({
            dimension: 'Image Version',
            clusterA: { name: clusterA, value: depA.image },
            clusterB: { name: clusterB, value: depB.image },
            significance: 'high',
          })
        }

        // Replica count delta
        if (depA.replicas !== depB.replicas) {
          const diff = Math.abs(depA.replicas - depB.replicas)
          const maxReplicas = Math.max(depA.replicas, depB.replicas)
          const pctDiff = maxReplicas > 0 ? (diff / maxReplicas) * 100 : 0
          deltas.push({
            dimension: 'Replica Count',
            clusterA: { name: clusterA, value: depA.replicas },
            clusterB: { name: clusterB, value: depB.replicas },
            significance: pctDiff >= DELTA_SIGNIFICANCE_HIGH_PCT ? 'high' : pctDiff >= DELTA_SIGNIFICANCE_MEDIUM_PCT ? 'medium' : 'low',
          })
        }

        // Ready vs desired delta
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

    if (deltas.length > 0) {
      const highDeltas = deltas.filter(d => d.significance === 'high')
      const affectedClusters = [...new Set(entries.map(([c]) => c))]

      insights.push({
        id: generateId('cluster-delta', workloadKey),
        category: 'cluster-delta',
        source: 'heuristic',
        severity: highDeltas.length > 0 ? 'warning' : 'info',
        title: `${workloadKey} differs across ${affectedClusters.length} clusters`,
        description: `Found ${deltas.length} differences: ${(deltas || []).map(d => d.dimension).join(', ')}.`,
        affectedClusters,
        relatedResources: [workloadKey],
        detectedAt: now(),
        deltas,
      })
    }
  }

  return insights
    .sort((a, b) => (b.deltas?.length || 0) - (a.deltas?.length || 0))
    .slice(0, MAX_INSIGHTS_PER_CATEGORY)
}

// ── Algorithm 3: Cascade Impact ───────────────────────────────────────

/** @internal Exported for testing */
export function detectCascadeImpact(events: ClusterEvent[]): MultiClusterInsight[] {
  const warnings = (events || [])
    .filter(e => e.type === 'Warning' && e.cluster && e.lastSeen)
    .sort((a, b) => parseTimestamp(a.lastSeen) - parseTimestamp(b.lastSeen))

  if (warnings.length < 2) return []

  const insights: MultiClusterInsight[] = []
  const usedEvents = new Set<number>()

  for (let i = 0; i < warnings.length; i++) {
    if (usedEvents.has(i)) continue
    const chain: CascadeLink[] = [{
      cluster: warnings[i].cluster || 'unknown',
      resource: warnings[i].object,
      event: warnings[i].reason,
      timestamp: warnings[i].lastSeen || '',
      severity: 'warning',
    }]
    usedEvents.add(i)

    const baseTs = parseTimestamp(warnings[i].lastSeen)
    const seenClusters = new Set([warnings[i].cluster])

    for (let j = i + 1; j < warnings.length; j++) {
      if (usedEvents.has(j)) continue
      const ts = parseTimestamp(warnings[j].lastSeen)
      if (ts - baseTs > CASCADE_DETECTION_WINDOW_MS) break
      if (seenClusters.has(warnings[j].cluster)) continue

      chain.push({
        cluster: warnings[j].cluster || 'unknown',
        resource: warnings[j].object,
        event: warnings[j].reason,
        timestamp: warnings[j].lastSeen || '',
        severity: 'warning',
      })
      seenClusters.add(warnings[j].cluster)
      usedEvents.add(j)
    }

    if (chain.length >= MIN_CORRELATED_CLUSTERS) {
      const affectedClusters = (chain || []).map(c => c.cluster)
      insights.push({
        id: generateId('cascade-impact', String(baseTs)),
        category: 'cascade-impact',
        source: 'heuristic',
        severity: chain.length >= 3 ? 'critical' : 'warning',
        title: `Possible cascade across ${chain.length} clusters`,
        description: `Issues started in ${chain[0].cluster} (${chain[0].event}) and spread to ${affectedClusters.slice(1).join(', ')} within ${Math.round(CASCADE_DETECTION_WINDOW_MS / 60000)} minutes.`,
        affectedClusters,
        detectedAt: chain[0].timestamp,
        chain,
      })
    }
  }

  return insights.slice(0, MAX_INSIGHTS_PER_CATEGORY)
}

// ── Algorithm 4: Config Drift ─────────────────────────────────────────

/** @internal Exported for testing */
export function detectConfigDrift(deployments: Deployment[]): MultiClusterInsight[] {
  if ((deployments || []).length === 0) return []

  // Group by name+namespace
  const workloadMap = new Map<string, Deployment[]>()
  for (const dep of deployments || []) {
    const key = `${dep.namespace}/${dep.name}`
    if (!workloadMap.has(key)) workloadMap.set(key, [])
    workloadMap.get(key)!.push(dep)
  }

  const insights: MultiClusterInsight[] = []

  for (const [workloadKey, deps] of workloadMap) {
    if (deps.length < 2) continue

    const images = new Set((deps || []).map(d => d.image).filter(Boolean))
    const replicaSets = new Set((deps || []).map(d => d.replicas))

    if (images.size <= 1 && replicaSets.size <= 1) continue

    const driftDimensions: string[] = []
    if (images.size > 1) driftDimensions.push(`${images.size} different images`)
    if (replicaSets.size > 1) driftDimensions.push(`${replicaSets.size} different replica counts`)

    const affectedClusters = [...new Set((deps || []).map(d => d.cluster).filter((c): c is string => !!c))]

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

// ── Algorithm 5: Resource Imbalance ───────────────────────────────────

/** @internal Exported for testing */
export function detectResourceImbalance(clusters: ClusterInfo[]): MultiClusterInsight[] {
  const healthy = (clusters || []).filter(c => c.healthy !== false && c.cpuCores && c.cpuCores > 0)
  if (healthy.length < 2) return []

  const insights: MultiClusterInsight[] = []

  // CPU imbalance
  const cpuPcts = healthy.map(c => ({
    name: c.name,
    pct: pct(c.cpuRequestsCores || c.cpuUsageCores, c.cpuCores),
  }))
  const avgCpu = cpuPcts.reduce((sum, c) => sum + c.pct, 0) / cpuPcts.length
  const overloaded = cpuPcts.filter(c => c.pct - avgCpu > RESOURCE_IMBALANCE_THRESHOLD_PCT)
  const underloaded = cpuPcts.filter(c => avgCpu - c.pct > RESOURCE_IMBALANCE_THRESHOLD_PCT)

  if (overloaded.length > 0 || underloaded.length > 0) {
    const metrics: Record<string, number> = {}
    for (const c of (cpuPcts || [])) metrics[c.name] = c.pct

    const parts: string[] = []
    if (overloaded.length > 0) {
      parts.push(`${(overloaded || []).map(c => `${c.name} (${c.pct}%)`).join(', ')} above average`)
    }
    if (underloaded.length > 0) {
      parts.push(`${(underloaded || []).map(c => `${c.name} (${c.pct}%)`).join(', ')} below average`)
    }

    insights.push({
      id: generateId('resource-imbalance', 'cpu'),
      category: 'resource-imbalance',
      source: 'heuristic',
      severity: overloaded.some(c => c.pct > 85) ? 'critical' : 'warning',
      title: `CPU imbalance across fleet (avg ${Math.round(avgCpu)}%)`,
      description: `${parts.join('; ')}. Fleet average: ${Math.round(avgCpu)}%.`,
      affectedClusters: [...overloaded, ...underloaded].map(c => c.name),
      detectedAt: now(),
      metrics,
    })
  }

  // Memory imbalance
  const memPcts = healthy
    .filter(c => c.memoryGB && c.memoryGB > 0)
    .map(c => ({
      name: c.name,
      pct: pct(c.memoryRequestsGB || c.memoryUsageGB, c.memoryGB),
    }))

  if (memPcts.length >= 2) {
    const avgMem = memPcts.reduce((sum, c) => sum + c.pct, 0) / memPcts.length
    const memOverloaded = memPcts.filter(c => c.pct - avgMem > RESOURCE_IMBALANCE_THRESHOLD_PCT)
    const memUnderloaded = memPcts.filter(c => avgMem - c.pct > RESOURCE_IMBALANCE_THRESHOLD_PCT)

    if (memOverloaded.length > 0 || memUnderloaded.length > 0) {
      const metrics: Record<string, number> = {}
      for (const c of (memPcts || [])) metrics[c.name] = c.pct

      insights.push({
        id: generateId('resource-imbalance', 'memory'),
        category: 'resource-imbalance',
        source: 'heuristic',
        severity: memOverloaded.some(c => c.pct > 85) ? 'critical' : 'warning',
        title: `Memory imbalance across fleet (avg ${Math.round(avgMem)}%)`,
        description: `Memory utilization ranges from ${Math.min(...memPcts.map(c => c.pct))}% to ${Math.max(...memPcts.map(c => c.pct))}%. Fleet average: ${Math.round(avgMem)}%.`,
        affectedClusters: [...memOverloaded, ...memUnderloaded].map(c => c.name),
        detectedAt: now(),
        metrics,
      })
    }
  }

  return insights
}

// ── Algorithm 6: Restart Correlation ──────────────────────────────────

/** @internal Exported for testing */
export function detectRestartCorrelation(podIssues: PodIssue[]): MultiClusterInsight[] {
  const issues = (podIssues || []).filter(p => p.restarts >= RESTART_CORRELATION_THRESHOLD && p.cluster)
  if (issues.length === 0) return []

  const insights: MultiClusterInsight[] = []

  // Group by workload name (strip pod hash suffix) across clusters
  const workloadRestarts = new Map<string, Map<string, number>>()
  for (const issue of (issues || [])) {
    // Strip pod hash: "api-server-abc123-xyz" → "api-server"
    const parts = issue.name.split('-')
    const workload = parts.length > 2 ? parts.slice(0, -2).join('-') : issue.name
    const key = `${issue.namespace}/${workload}`
    if (!workloadRestarts.has(key)) workloadRestarts.set(key, new Map())
    const clusterMap = workloadRestarts.get(key)!
    clusterMap.set(
      issue.cluster || 'unknown',
      (clusterMap.get(issue.cluster || 'unknown') || 0) + issue.restarts,
    )
  }

  // Horizontal pattern: same workload restarting in multiple clusters = app bug
  for (const [workload, clusterMap] of workloadRestarts) {
    if (clusterMap.size >= APP_BUG_MIN_CLUSTERS) {
      const affectedClusters = Array.from(clusterMap.keys())
      const totalRestarts = Array.from(clusterMap.values()).reduce((a, b) => a + b, 0)

      insights.push({
        id: generateId('restart-correlation', 'app-bug', workload),
        category: 'restart-correlation',
        source: 'heuristic',
        severity: totalRestarts > 20 ? 'critical' : 'warning',
        title: `${workload} restarting across ${clusterMap.size} clusters (likely app bug)`,
        description: `${workload} has ${totalRestarts} total restarts across ${affectedClusters.join(', ')}. Same workload failing everywhere suggests an application-level issue.`,
        affectedClusters,
        relatedResources: [workload],
        detectedAt: now(),
      })
    }
  }

  // Vertical pattern: many workloads restarting in one cluster = infra issue
  const clusterWorkloadCounts = new Map<string, Set<string>>()
  for (const [workload, clusterMap] of workloadRestarts) {
    for (const cluster of clusterMap.keys()) {
      if (!clusterWorkloadCounts.has(cluster)) clusterWorkloadCounts.set(cluster, new Set())
      clusterWorkloadCounts.get(cluster)!.add(workload)
    }
  }

  for (const [cluster, workloads] of clusterWorkloadCounts) {
    if (workloads.size >= INFRA_ISSUE_MIN_WORKLOADS) {
      insights.push({
        id: generateId('restart-correlation', 'infra-issue', cluster),
        category: 'restart-correlation',
        source: 'heuristic',
        severity: workloads.size >= 5 ? 'critical' : 'warning',
        title: `${workloads.size} workloads restarting in ${cluster} (likely infra issue)`,
        description: `Multiple different workloads (${Array.from(workloads).slice(0, 5).join(', ')}) are restarting in ${cluster}. This pattern suggests an infrastructure problem rather than an application bug.`,
        affectedClusters: [cluster],
        relatedResources: Array.from(workloads).slice(0, 10),
        detectedAt: now(),
      })
    }
  }

  return insights.slice(0, MAX_INSIGHTS_PER_CATEGORY)
}

// ── Algorithm 7: Rollout Tracking ─────────────────────────────────────

/** @internal Exported for testing */
export function trackRolloutProgress(deployments: Deployment[]): MultiClusterInsight[] {
  if ((deployments || []).length === 0) return []

  // Group by name+namespace
  const workloadMap = new Map<string, Deployment[]>()
  for (const dep of deployments || []) {
    const key = `${dep.namespace}/${dep.name}`
    if (!workloadMap.has(key)) workloadMap.set(key, [])
    workloadMap.get(key)!.push(dep)
  }

  const insights: MultiClusterInsight[] = []

  for (const [workloadKey, deps] of workloadMap) {
    if (deps.length < 2) continue

    const images = [...new Set((deps || []).map(d => d.image).filter(Boolean))]
    if (images.length < 2) continue

    // Find the newest image (highest version or most common)
    const imageCounts = new Map<string, number>()
    for (const dep of (deps || [])) {
      if (dep.image) imageCounts.set(dep.image, (imageCounts.get(dep.image) || 0) + 1)
    }
    const [newestImage] = Array.from(imageCounts.entries()).sort((a, b) => b[1] - a[1])[0]

    const completed = (deps || []).filter(d => d.image === newestImage && d.cluster)
    const pending = (deps || []).filter(d => d.image !== newestImage && d.status !== 'failed' && d.cluster)
    const failed = (deps || []).filter(d => d.status === 'failed' && d.cluster)

    const affectedClusters = [...new Set((deps || []).map(d => d.cluster).filter((c): c is string => !!c))]

    // Build per-cluster progress metrics for the DeploymentRolloutTracker chart
    const metrics: Record<string, number> = {
      completed: completed.length,
      pending: pending.length,
      failed: failed.length,
      total: deps.length,
    }
    for (const dep of (deps || [])) {
      if (!dep.cluster) continue
      if (dep.status === 'failed') {
        metrics[`${dep.cluster}_progress`] = 0
        metrics[`${dep.cluster}_status`] = ROLLOUT_STATUS_FAILED
      } else if (dep.image === newestImage) {
        metrics[`${dep.cluster}_progress`] = FULL_PROGRESS
        metrics[`${dep.cluster}_status`] = ROLLOUT_STATUS_COMPLETE
      } else {
        metrics[`${dep.cluster}_progress`] = PARTIAL_PROGRESS
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

// ── Demo Data ─────────────────────────────────────────────────────────

function getDemoInsights(): MultiClusterInsight[] {
  const demoTime = new Date()
  const fiveMinAgo = new Date(demoTime.getTime() - DEMO_OFFSET_5M_MS).toISOString()
  const tenMinAgo = new Date(demoTime.getTime() - DEMO_OFFSET_10M_MS).toISOString()
  const fifteenMinAgo = new Date(demoTime.getTime() - DEMO_OFFSET_15M_MS).toISOString()

  return [
    {
      id: 'demo-event-correlation-1',
      category: 'event-correlation',
      source: 'heuristic',
      severity: 'critical',
      title: '3 clusters had simultaneous warnings',
      description: '18 warning events across eks-prod-us-east-1, gke-staging, openshift-prod within a 5-minute window. Common reasons: BackOff, FailedScheduling.',
      affectedClusters: ['eks-prod-us-east-1', 'gke-staging', 'openshift-prod'],
      relatedResources: ['api-server', 'metrics-collector'],
      detectedAt: fiveMinAgo,
      remediation: 'Check shared infrastructure (DNS, load balancer, or shared storage) that all three clusters depend on. The simultaneous timing strongly suggests a common upstream dependency failure.',
    },
    {
      id: 'demo-resource-imbalance-cpu',
      category: 'resource-imbalance',
      source: 'ai',
      severity: 'warning',
      confidence: 82,
      provider: 'claude',
      title: 'CPU imbalance across fleet (avg 54%)',
      description: 'eks-prod-us-east-1 is significantly overloaded at 87% CPU while aks-dev-westeu sits at only 22%. This 65-point spread indicates workloads are not evenly distributed across the fleet.',
      affectedClusters: ['eks-prod-us-east-1', 'aks-dev-westeu'],
      detectedAt: fiveMinAgo,
      remediation: 'Consider migrating 2-3 non-critical workloads from eks-prod-us-east-1 to aks-dev-westeu. Alternatively, enable HPA on the top CPU consumers in eks-prod to allow autoscaling.',
      metrics: {
        'eks-prod-us-east-1': 87,
        'gke-staging': 55,
        'openshift-prod': 62,
        'aks-dev-westeu': 22,
        'vllm-gpu-cluster': 45,
      },
    },
    {
      id: 'demo-restart-app-bug',
      category: 'restart-correlation',
      source: 'heuristic',
      severity: 'warning',
      title: 'default/api-server restarting across 3 clusters (likely app bug)',
      description: 'default/api-server has 26 total restarts across eks-prod-us-east-1, gke-staging, openshift-prod. Same workload failing everywhere suggests an application-level issue.',
      affectedClusters: ['eks-prod-us-east-1', 'gke-staging', 'openshift-prod'],
      relatedResources: ['default/api-server'],
      detectedAt: tenMinAgo,
      remediation: 'Check api-server logs for OOMKilled or panic traces. Since the same workload fails across all clusters, this is almost certainly an application bug — not infrastructure. Roll back to the previous image if this started after a recent deployment.',
    },
    {
      id: 'demo-restart-infra-issue',
      category: 'restart-correlation',
      source: 'heuristic',
      severity: 'critical',
      title: '4 workloads restarting in vllm-gpu-cluster (likely infra issue)',
      description: 'Multiple different workloads (default/metrics-collector, default/cache-redis, default/gpu-scheduler, default/log-agent) are restarting in vllm-gpu-cluster. This pattern suggests an infrastructure problem rather than an application bug.',
      affectedClusters: ['vllm-gpu-cluster'],
      relatedResources: ['default/metrics-collector', 'default/cache-redis', 'default/gpu-scheduler', 'default/log-agent'],
      detectedAt: tenMinAgo,
    },
    {
      id: 'demo-cascade-1',
      category: 'cascade-impact',
      source: 'ai',
      severity: 'critical',
      confidence: 91,
      provider: 'claude',
      title: 'Possible cascade across 3 clusters',
      description: 'A shared ConfigMap mount failure in openshift-prod propagated to dependent services in eks-prod-us-east-1 and gke-staging. The cascade pattern matches a centralized config distribution failure.',
      affectedClusters: ['openshift-prod', 'eks-prod-us-east-1', 'gke-staging'],
      detectedAt: fifteenMinAgo,
      remediation: 'The root cause is the FailedMount in openshift-prod/config-service. Check if the backing Secret or ConfigMap was recently modified or deleted. Restoring it should resolve the downstream Unhealthy and CrashLoopBackOff issues within minutes.',
      chain: [
        { cluster: 'openshift-prod', resource: 'config-service', event: 'FailedMount', timestamp: fifteenMinAgo, severity: 'warning' },
        { cluster: 'eks-prod-us-east-1', resource: 'api-gateway', event: 'Unhealthy', timestamp: tenMinAgo, severity: 'warning' },
        { cluster: 'gke-staging', resource: 'frontend', event: 'CrashLoopBackOff', timestamp: fiveMinAgo, severity: 'critical' },
      ],
    },
    {
      id: 'demo-config-drift-1',
      category: 'config-drift',
      source: 'heuristic',
      severity: 'warning',
      title: 'Config drift in default/api-server',
      description: 'default/api-server has 3 different images and 2 different replica counts across 4 clusters.',
      affectedClusters: ['eks-prod-us-east-1', 'gke-staging', 'openshift-prod', 'aks-dev-westeu'],
      relatedResources: ['default/api-server'],
      detectedAt: fiveMinAgo,
      remediation: 'Standardize on the newest stable image across all clusters. Use a KubeStellar BindingPolicy to enforce consistent image versions and replica counts fleet-wide.',
    },
    {
      id: 'demo-cluster-delta-1',
      category: 'cluster-delta',
      source: 'heuristic',
      severity: 'warning',
      title: 'default/api-server differs across 2 clusters',
      description: 'Found 3 differences: Image Version, Replica Count, Status.',
      affectedClusters: ['eks-prod-us-east-1', 'gke-staging'],
      relatedResources: ['default/api-server'],
      detectedAt: fiveMinAgo,
      deltas: [
        { dimension: 'Image Version', clusterA: { name: 'eks-prod-us-east-1', value: 'api-server:v2.1.0' }, clusterB: { name: 'gke-staging', value: 'api-server:v2.0.3' }, significance: 'high' },
        { dimension: 'Replica Count', clusterA: { name: 'eks-prod-us-east-1', value: 5 }, clusterB: { name: 'gke-staging', value: 3 }, significance: 'medium' },
        { dimension: 'Status', clusterA: { name: 'eks-prod-us-east-1', value: 'running' }, clusterB: { name: 'gke-staging', value: 'deploying' }, significance: 'medium' },
      ],
    },
    {
      id: 'demo-rollout-1',
      category: 'rollout-tracker',
      source: 'heuristic',
      severity: 'warning',
      title: 'Rollout in progress: default/api-server',
      description: '3/5 clusters on api-server:v2.1.0. 1 pending, 1 failed.',
      affectedClusters: ['eks-prod-us-east-1', 'gke-staging', 'openshift-prod', 'aks-dev-westeu', 'vllm-gpu-cluster'],
      relatedResources: ['default/api-server'],
      detectedAt: fiveMinAgo,
      metrics: {
        completed: 3, pending: 1, failed: 1, total: 5,
        'eks-prod-us-east-1_progress': FULL_PROGRESS,
        'eks-prod-us-east-1_status': ROLLOUT_STATUS_COMPLETE,
        'gke-staging_progress': FULL_PROGRESS,
        'gke-staging_status': ROLLOUT_STATUS_COMPLETE,
        'openshift-prod_progress': FULL_PROGRESS,
        'openshift-prod_status': ROLLOUT_STATUS_COMPLETE,
        'aks-dev-westeu_progress': PARTIAL_PROGRESS,
        'aks-dev-westeu_status': ROLLOUT_STATUS_IN_PROGRESS,
        'vllm-gpu-cluster_progress': 0,
        'vllm-gpu-cluster_status': ROLLOUT_STATUS_FAILED,
      },
    },
  ]
}

// ── Severity Ranking ──────────────────────────────────────────────────

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
}

// ── Main Hook ─────────────────────────────────────────────────────────

export function useMultiClusterInsights(): UseMultiClusterInsightsResult {
  const { isDemoMode } = useDemoMode()
  const { deduplicatedClusters, isLoading: clustersLoading } = useClusters()
  const { events, isLoading: eventsLoading, isDemoFallback: eventsDemoFallback } = useCachedEvents()
  const { events: warningEvents } = useCachedWarningEvents()
  const { data: deployments, isLoading: deploymentsLoading, isDemoFallback: deploymentsDemoFallback } = useCachedDeployments()
  const { issues: podIssues, isDemoFallback: podIssuesDemoFallback } = useCachedPodIssues()

  const isDemoData = isDemoMode || (eventsDemoFallback && deploymentsDemoFallback && podIssuesDemoFallback)
  const isLoading = clustersLoading || eventsLoading || deploymentsLoading

  const insights = useMemo(() => {
    if (isDemoData) return getDemoInsights()

    const all: MultiClusterInsight[] = [
      ...detectEventCorrelations(events || []),
      ...detectClusterDeltas(deployments || [], deduplicatedClusters || []),
      ...detectCascadeImpact(warningEvents || []),
      ...detectConfigDrift(deployments || []),
      ...detectResourceImbalance(deduplicatedClusters || []),
      ...detectRestartCorrelation(podIssues || []),
      ...trackRolloutProgress(deployments || []),
    ]

    // Sort by severity (critical first), then by affected clusters count
    return all.sort((a, b) => {
      const sevDiff = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0)
      if (sevDiff !== 0) return sevDiff
      return b.affectedClusters.length - a.affectedClusters.length
    })
  }, [isDemoData, events, warningEvents, deployments, deduplicatedClusters, podIssues])

  // AI enrichment: when agent is connected, enrich heuristic insights
  // with AI-generated descriptions, root causes, and remediation.
  // Falls back gracefully to heuristic-only when agent is unavailable.
  const { enrichedInsights } = useInsightEnrichment(insights)

  const insightsByCategory = useMemo(() => {
    const result: Record<InsightCategory, MultiClusterInsight[]> = {
      'event-correlation': [],
      'cluster-delta': [],
      'cascade-impact': [],
      'config-drift': [],
      'resource-imbalance': [],
      'restart-correlation': [],
      'rollout-tracker': [],
    }
    for (const insight of enrichedInsights || []) {
      result[insight.category].push(insight)
    }
    return result
  }, [enrichedInsights])

  const topInsights = useMemo(
    () => (enrichedInsights || []).slice(0, MAX_TOP_INSIGHTS),
    [enrichedInsights],
  )

  return {
    insights: enrichedInsights,
    isLoading,
    isDemoData: !!isDemoData,
    insightsByCategory,
    topInsights,
  }
}
