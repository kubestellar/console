/**
 * Pure data transform functions for ConsoleOfflineDetectionCard.
 * Extracted for testability and to reduce the main component's size.
 */
import type { PredictedRisk } from '../../../types/predictions'

// ============================================================================
// Types
// ============================================================================

export type NodeCondition = {
  type: string
  status: string
  reason?: string
  message?: string
}

export type NodeData = {
  name: string
  cluster?: string
  status: string
  roles: string[]
  unschedulable?: boolean
  conditions?: NodeCondition[]
}

export type UnifiedItem = {
  id: string
  category: 'offline' | 'gpu' | 'prediction'
  name: string
  cluster: string
  severity: 'critical' | 'warning' | 'info'
  reason: string
  reasonDetailed?: string
  metric?: string
  rootCause?: { cause: string; details: string }
  nodeData?: NodeData
  gpuData?: { nodeName: string; cluster: string; expected: number; available: number; reason: string }
  predictionData?: PredictedRisk
}

export type SortField = 'name' | 'cluster' | 'severity' | 'category'

export type GpuIssue = {
  cluster: string
  nodeName: string
  expected: number
  available: number
  reason: string
}

export type OfflineDetectionDataSource = {
  hasData: boolean
  isLoading?: boolean
  isRefreshing?: boolean
  isDemoData?: boolean
  isFailed?: boolean
  consecutiveFailures?: number
}

export type OfflineDetectionCardLoadState = {
  isLoading: boolean
  isRefreshing: boolean
  hasAnyData: boolean
  isDemoData: boolean
  isFailed: boolean
  consecutiveFailures: number
}

// Sort options for CardControls
export const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'severity', label: 'Severity' },
  { value: 'name', label: 'Name' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'category', label: 'Type' },
]

// ============================================================================
// Root Cause Analysis
// ============================================================================

/** Analyze node conditions to determine root cause of unhealthy status */
export function analyzeRootCause(node: NodeData): { cause: string; details: string } | null {
  if (!node.conditions || node.conditions.length === 0) {
    return null
  }

  const problems: string[] = []
  const details: string[] = []

  for (const condition of node.conditions) {
    if (['MemoryPressure', 'DiskPressure', 'PIDPressure', 'NetworkUnavailable'].includes(condition.type)) {
      if (condition.status === 'True') {
        problems.push(condition.type)
        details.push(`${condition.type}: ${condition.message || condition.reason || 'Unknown'}`)
      }
    }
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
    if (node.unschedulable) {
      return {
        cause: 'Cordoned for maintenance',
        details: 'Node is healthy but marked as unschedulable. This is typically done for planned maintenance or upgrades.'
      }
    }
    return null
  }

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

export function buildOfflineDetectionCardLoadState(
  sources: OfflineDetectionDataSource[],
  isDemoMode = false,
): OfflineDetectionCardLoadState {
  const hasAnyData = sources.some(source => source.hasData)
  const isLoading = sources.some(source => source.isLoading) && !hasAnyData
  const isRefreshing = sources.some(source => source.isRefreshing)
  const isFailed = !hasAnyData && sources.length > 0 && sources.every(source => source.isFailed)

  return {
    isLoading,
    isRefreshing,
    hasAnyData,
    isDemoData: isDemoMode || sources.some(source => source.isDemoData),
    isFailed,
    consecutiveFailures: isFailed
      ? Math.max(0, ...sources.map(source => source.consecutiveFailures ?? 0))
      : 0,
  }
}

// ============================================================================
// Item Builders
// ============================================================================

/** Build unified items from offline/unhealthy nodes */
export function buildOfflineItems(offlineNodes: NodeData[]): UnifiedItem[] {
  return offlineNodes.map((node, i) => {
    const rootCause = analyzeRootCause(node)
    return {
      id: `offline-${node.name}-${node.cluster || i}`,
      category: 'offline' as const,
      name: node.name,
      cluster: node.cluster || 'unknown',
      severity: 'critical' as const,
      reason: rootCause?.cause || (node.unschedulable ? 'Cordoned' : node.status),
      reasonDetailed: rootCause?.details,
      rootCause: rootCause || undefined,
      nodeData: node,
    }
  })
}

/** Build unified items from GPU issues */
export function buildGpuItems(gpuIssues: GpuIssue[]): UnifiedItem[] {
  return gpuIssues.map((issue, i) => ({
    id: `gpu-${issue.nodeName}-${issue.cluster}-${i}`,
    category: 'gpu' as const,
    name: issue.nodeName,
    cluster: issue.cluster,
    severity: 'warning' as const,
    reason: issue.reason,
    gpuData: issue,
  }))
}

/** Build unified items from predicted risks */
export function buildPredictionItems(predictedRisks: PredictedRisk[]): UnifiedItem[] {
  return predictedRisks.map(risk => ({
    id: risk.id,
    category: 'prediction' as const,
    name: risk.name,
    cluster: risk.cluster || 'unknown',
    severity: risk.severity,
    reason: risk.reason,
    reasonDetailed: risk.reasonDetailed,
    metric: risk.metric,
    predictionData: risk,
  }))
}

// ============================================================================
// Generate unique ID for heuristic predictions
// ============================================================================
export function generatePredictionId(type: string, name: string, cluster?: string): string {
  return `heuristic-${type}-${name}-${cluster || 'unknown'}`
}
