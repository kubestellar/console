// Health checking and distribution detection for clusters

import { api } from '../../lib/api'
import { reportAgentDataSuccess, isAgentUnavailable, getAgentClusterCount } from '../useLocalAgent'
import { isDemoToken, isNetlifyDeployment } from '../../lib/demoMode'
import { isClusterModeBackend } from '../../lib/cache/fetcherUtils'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { MS_PER_MINUTE } from '../../lib/constants/time'
import {
  MCP_HOOK_TIMEOUT_MS,
  METRICS_SERVER_TIMEOUT_MS,
  LOCAL_AGENT_HTTP_URL,
} from '../../lib/constants'
import { KUBECTL_MAX_TIMEOUT_MS } from '../../lib/constants/network'
import { getLocalAgentURL, agentFetch, AGENT_TOKEN_STORAGE_KEY } from './agentFetch'
import { detectDistributionFromNamespaces } from './clusterUtils'
import { updateSingleClusterInCache } from './sharedImpl.state'
import { HEALTH_CHECK_CONCURRENCY, MAX_HEALTH_CHECK_FAILURES, MAX_DISTRIBUTION_FAILURES } from './sharedImpl.constants'
import { FOCUS_DELAY_MS } from '../../lib/constants/network'
import type { ClusterInfo, ClusterHealth } from './types'

// Track consecutive health check failures to avoid spamming
export let healthCheckFailures = 0

// Per-cluster failure tracking to prevent transient errors from showing "-"
// Track first failure timestamp - only mark unreachable after 5 minutes of consecutive failures
const clusterHealthFailureStart = new Map<string, number>() // timestamp of first failure
const OFFLINE_THRESHOLD_MS = 5 * MS_PER_MINUTE // 5 minutes before marking as offline

// Helper to check if cluster has been failing long enough to mark offline
export function shouldMarkOffline(clusterName: string): boolean {
  const firstFailure = clusterHealthFailureStart.get(clusterName)
  if (!firstFailure) return false
  
  // If failures haven't reached the threshold yet, don't mark offline
  if (Date.now() - firstFailure < OFFLINE_THRESHOLD_MS) return false
  
  // Trust the agent's health status (#12410, #12419)
  // If the agent is connected and reports clusters > 0, the cluster is online
  // even if individual health checks fail (e.g., direct node fetching errors)
  if (!isAgentUnavailable()) {
    const agentClusterCount = getAgentClusterCount()
    if (agentClusterCount > 0) {
      // Agent confirms at least one cluster is connected - trust it
      return false
    }
  }
  
  // Agent is disconnected or reports 0 clusters, and we've had 5+ minutes of failures
  return true
}

// Helper to record a failure (only sets timestamp if not already set)
export function recordClusterFailure(clusterName: string): void {
  if (!clusterHealthFailureStart.has(clusterName)) {
    clusterHealthFailureStart.set(clusterName, Date.now())
  }
}

// Helper to clear failure tracking on success
export function clearClusterFailure(clusterName: string): void {
  clusterHealthFailureStart.delete(clusterName)
}

// Fetch health for a single cluster - uses HTTP endpoint like GPU nodes
export async function fetchSingleClusterHealth(clusterName: string, kubectlContext?: string): Promise<ClusterHealth | null> {
  // Try local agent's HTTP endpoint first (same pattern as GPU nodes)
  // This is more reliable than WebSocket for simple data fetching
  if (!isNetlifyDeployment && !isAgentUnavailable() && !isClusterModeBackend()) {
    try {
      const context = kubectlContext || clusterName
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), MCP_HOOK_TIMEOUT_MS)
      const response = await agentFetch(`${getLocalAgentURL()}/cluster-health?cluster=${encodeURIComponent(context)}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      })
      clearTimeout(timeoutId)

      if (response.ok) {
        // Use .catch() on .json() to prevent Firefox from firing unhandledrejection
        // before the outer try/catch processes the rejection (microtask timing issue).
        const health = await response.json().catch(() => null)
        if (!health) throw new Error('Invalid JSON from health endpoint')
        reportAgentDataSuccess()
        return health
      }
    } catch {
      // Agent HTTP failed, will try backend below
    }
  }

  // Skip backend if we've had too many consecutive failures or using demo token
  if (healthCheckFailures >= MAX_HEALTH_CHECK_FAILURES || isDemoToken()) {
    return null
  }

  // Cluster-mode routing: use the backend API instead of local agent endpoints (#11684)
  if (isClusterModeBackend()) {
    try {
      const { data } = await api.get<ClusterHealth>(
        `/api/mcp/clusters/${encodeURIComponent(clusterName)}/health`
      )
      if (data) {
        healthCheckFailures = 0
        return data
      }
    } catch {
      healthCheckFailures++
    }
    return null
  }

  // Fall back to backend API
  const agentToken = localStorage.getItem(AGENT_TOKEN_STORAGE_KEY)
  try {
    const response = await fetch(
      `${LOCAL_AGENT_HTTP_URL}/clusters/${encodeURIComponent(clusterName)}/health`,
      {
        signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS),
        headers: agentToken ? { 'Authorization': `Bearer ${agentToken}` } : {},
      }
    )
    if (response.ok) {
      healthCheckFailures = 0 // Reset on success
      // Use .catch() on .json() to prevent Firefox from firing unhandledrejection
      // before the outer try/catch processes the rejection (microtask timing issue).
      const result = await response.json().catch(() => null)
      if (!result) throw new Error('Invalid JSON from cluster health endpoint')
      return result
    }
    // Non-OK response (e.g., 500) - track failure
    healthCheckFailures++
  } catch {
    // Timeout or error - track failure
    healthCheckFailures++
  }
  return null
}

// Track backend API failures for distribution detection separately
let distributionDetectionFailures = 0

// Detect cluster distribution by checking for system namespaces
// Uses kubectl via WebSocket when available, falls back to backend API
export async function detectClusterDistribution(clusterName: string, kubectlContext?: string): Promise<{ distribution?: string; namespaces?: string[] }> {
  // Cluster-mode routing: use backend API for namespace list (#11685)
  if (isClusterModeBackend()) {
    try {
      const { data } = await api.get<{ namespaces: string[] }>(
        `/api/mcp/namespaces?cluster=${encodeURIComponent(clusterName)}`
      )
      const namespaces = (data?.namespaces || [])
      const distribution = detectDistributionFromNamespaces(namespaces)
      return { distribution, namespaces }
    } catch {
      return {}
    }
  }

  // Try kubectl via WebSocket first (if agent available)
  // Use the kubectl context (full path) if provided, otherwise fall back to name
  if (!isAgentUnavailable() && !isClusterModeBackend()) {
    try {
      const response = await kubectlProxy.exec(
        ['get', 'namespaces', '-o', 'jsonpath={.items[*].metadata.name}'],
        { context: kubectlContext || clusterName, timeout: KUBECTL_MAX_TIMEOUT_MS }
      )
      if (response.exitCode === 0 && response.output) {
        const namespaces = response.output.split(/\s+/).filter(Boolean)
        const distribution = detectDistributionFromNamespaces(namespaces)
        return { distribution, namespaces }
      }
    } catch {
      // WebSocket failed, continue to backend fallback
    }
  }

  // Skip backend if using demo token, too many failures, or health checks failing
  if (isDemoToken() ||
      distributionDetectionFailures >= MAX_DISTRIBUTION_FAILURES ||
      healthCheckFailures >= MAX_HEALTH_CHECK_FAILURES) {
    return {}
  }

  const agentToken = localStorage.getItem(AGENT_TOKEN_STORAGE_KEY)
  const headers: Record<string, string> = agentToken ? { 'Authorization': `Bearer ${agentToken}` } : {}

  // Helper to extract namespaces from API response
  const extractNamespaces = (items: Array<{ namespace?: string }>): string[] => {
    return Array.from(new Set<string>(
      items.map(item => item.namespace).filter((ns): ns is string => Boolean(ns))
    ))
  }

  // Try pods endpoint first
  try {
    const response = await fetch(
      `${LOCAL_AGENT_HTTP_URL}/pods?cluster=${encodeURIComponent(clusterName)}&limit=500`,
      { signal: AbortSignal.timeout(METRICS_SERVER_TIMEOUT_MS), headers }
    )
    if (response.ok) {
      distributionDetectionFailures = 0 // Reset on success
      const data = await response.json().catch(() => null)
      if (!data) throw new Error('Invalid JSON')
      const namespaces = extractNamespaces(data.pods || [])
      const distribution = detectDistributionFromNamespaces(namespaces)
      if (distribution) return { distribution, namespaces }
    } else {
      distributionDetectionFailures++
      if (distributionDetectionFailures >= MAX_DISTRIBUTION_FAILURES) return {}
    }
  } catch {
    distributionDetectionFailures++
    if (distributionDetectionFailures >= MAX_DISTRIBUTION_FAILURES) return {}
  }

  // Fallback: try events endpoint
  try {
    const response = await fetch(
      `${LOCAL_AGENT_HTTP_URL}/events?cluster=${encodeURIComponent(clusterName)}&limit=200`,
      { signal: AbortSignal.timeout(METRICS_SERVER_TIMEOUT_MS), headers }
    )
    if (response.ok) {
      distributionDetectionFailures = 0
      const data = await response.json().catch(() => null)
      if (!data) throw new Error('Invalid JSON')
      const namespaces = extractNamespaces(data.events || [])
      const distribution = detectDistributionFromNamespaces(namespaces)
      if (distribution) return { distribution, namespaces }
    } else {
      distributionDetectionFailures++
      if (distributionDetectionFailures >= MAX_DISTRIBUTION_FAILURES) return {}
    }
  } catch {
    distributionDetectionFailures++
    if (distributionDetectionFailures >= MAX_DISTRIBUTION_FAILURES) return {}
  }

  // Fallback: try deployments endpoint
  try {
    const response = await fetch(
      `${LOCAL_AGENT_HTTP_URL}/deployments?cluster=${encodeURIComponent(clusterName)}`,
      { signal: AbortSignal.timeout(METRICS_SERVER_TIMEOUT_MS), headers }
    )
    if (response.ok) {
      distributionDetectionFailures = 0
      const data = await response.json().catch(() => null)
      if (!data) throw new Error('Invalid JSON')
      const namespaces = extractNamespaces(data.deployments || [])
      const distribution = detectDistributionFromNamespaces(namespaces)
      if (distribution) return { distribution, namespaces }
    } else {
      distributionDetectionFailures++
    }
  } catch {
    distributionDetectionFailures++
  }

  return {}
}

// Process a single cluster's health check
async function processClusterHealth(cluster: ClusterInfo): Promise<void> {
    // Use cluster.context for kubectl commands (full context path), cluster.name for cache key
    const health = await fetchSingleClusterHealth(cluster.name, cluster.context)

    if (health) {
      // Check if the cluster itself is reachable based on the response data
      // A cluster is reachable if it has valid node data OR no error message
      const hasValidData = health.nodeCount !== undefined && health.nodeCount > 0
      const isReachable = hasValidData || !health.errorMessage

      // Only clear failure tracking if the cluster is actually reachable
      // Don't clear just because we got a response - the response might say "unreachable"
      if (isReachable) {
        clearClusterFailure(cluster.name)
      }

      if (isReachable) {
        // Cluster is reachable - update with fresh data

        // Detect cluster distribution (async, non-blocking update)
        // Use cluster.context for kubectl commands
        detectClusterDistribution(cluster.name, cluster.context).then(({ distribution, namespaces }) => {
          if (distribution || namespaces) {
            updateSingleClusterInCache(cluster.name, { distribution, namespaces })
          }
        }).catch(() => { /* non-critical — distribution detection is best-effort */ })

        updateSingleClusterInCache(cluster.name, {
          // If we have nodes, consider healthy based on actual node readiness
          // healthy: true means all nodes are ready; false means some aren't ready but cluster is reachable
          healthy: hasValidData ? health.healthy : false,
          reachable: true,  // We definitely reached the cluster if we have data
          // External reachability probe result (#4202)
          externallyReachable: health.externallyReachable,
          nodeCount: health.nodeCount,
          podCount: health.podCount,
          cpuCores: health.cpuCores,
          cpuRequestsCores: health.cpuRequestsCores,
          // Actual usage from metrics-server
          cpuUsageCores: health.cpuUsageCores,
          memoryUsageGB: health.memoryUsageGB,
          metricsAvailable: health.metricsAvailable,
          // Memory/storage metrics
          memoryBytes: health.memoryBytes,
          memoryGB: health.memoryGB,
          memoryRequestsGB: health.memoryRequestsGB,
          storageBytes: health.storageBytes,
          storageGB: health.storageGB,
          pvcCount: health.pvcCount,
          pvcBoundCount: health.pvcBoundCount,
          issues: health.issues,
          errorType: undefined,
          errorMessage: undefined,
          refreshing: false,
        })
      } else {
        // Cluster reported as unreachable by the agent
        recordClusterFailure(cluster.name)

        // Distinguish between definitive errors and transient timeouts.
        // A timeout means the health check took too long (large cluster, slow network)
        // but does NOT mean the cluster is genuinely unreachable.
        const errorMsg = health.errorMessage?.toLowerCase() || ''
        const isDefinitiveError = errorMsg.includes('connection refused') ||
          errorMsg.includes('connection reset') ||
          errorMsg.includes('no such host') ||
          errorMsg.includes('network is unreachable') ||
          errorMsg.includes('certificate') ||
          errorMsg.includes('unauthorized') ||
          health.errorType === 'network' ||
          health.errorType === 'certificate' ||
          health.errorType === 'auth'

        if (isDefinitiveError) {
          // Definitive error - cluster is genuinely unreachable, mark offline immediately
          updateSingleClusterInCache(cluster.name, {
            healthy: false,
            reachable: false,
            nodeCount: 0,
            errorType: health.errorType,
            errorMessage: health.errorMessage,
            refreshing: false,
          })
        } else if (shouldMarkOffline(cluster.name)) {
          // Transient errors (timeout) persisting for 5+ minutes - now mark offline
          updateSingleClusterInCache(cluster.name, {
            healthy: false,
            reachable: false,
            nodeCount: 0,
            errorType: health.errorType,
            errorMessage: health.errorMessage,
            refreshing: false,
          })
        } else {
          // Transient failure (timeout) - keep existing cached values
          updateSingleClusterInCache(cluster.name, {
            refreshing: false,
          })
        }
      }
    } else {
      // No health data - could be backend error or agent unavailable
      // Track failure start time but don't immediately mark as unreachable
      recordClusterFailure(cluster.name)

      if (shouldMarkOffline(cluster.name)) {
        // 5+ minutes of failures - mark as unreachable
        updateSingleClusterInCache(cluster.name, {
          healthy: false,
          reachable: false,
          errorMessage: 'Unable to connect after 5 minutes',
          refreshing: false,
        })
      } else {
        // Transient failure - keep existing cached values
        updateSingleClusterInCache(cluster.name, {
          refreshing: false,
        })
      }
    }
}

// Progressive health check with rolling concurrency
// Uses continuous processing: as soon as one finishes, the next starts
// This is much more efficient than strict batches for large cluster counts
export async function checkHealthProgressively(clusterList: ClusterInfo[]) {
  if (clusterList.length === 0) return

  const queue = [...clusterList]
  const inProgress = new Set<string>()
  let completed = 0

  // Process next cluster from queue
  const processNext = async (): Promise<void> => {
    while (queue.length > 0 && inProgress.size < HEALTH_CHECK_CONCURRENCY) {
      const cluster = queue.shift()!
      // Skip clusters being manually refreshed to avoid race conditions
      if (cluster.refreshing) {
        completed++
        continue
      }
      const key = cluster.name
      inProgress.add(key)

      // Don't await here - let multiple run in parallel
      processClusterHealth(cluster)
        .catch(() => { /* health check errors are non-fatal — cluster stays in existing state */ })
        .finally(() => {
          inProgress.delete(key)
          completed++
          // Start next one immediately when one finishes
          if (queue.length > 0) {
            processNext().catch(() => { /* ignore — errors already handled per-cluster */ })
          }
        })
    }
  }

  // Start initial batch up to concurrency limit
  const initialBatch = Math.min(HEALTH_CHECK_CONCURRENCY, clusterList.length)
  for (let i = 0; i < initialBatch; i++) {
    processNext().catch(() => { /* ignore — errors already handled per-cluster */ })
  }

  // Wait for all to complete (non-blocking check)
  while (completed < clusterList.length) {
    await new Promise(resolve => setTimeout(resolve, FOCUS_DELAY_MS))
  }
}

// Getter/setter functions for module-level state
export function setHealthCheckFailures(value: number) {
  healthCheckFailures = value
}

export function getHealthCheckFailures(): number {
  return healthCheckFailures
}
