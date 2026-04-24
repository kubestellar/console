/**
 * Unified Data Hooks using the new caching layer
 *
 * These hooks provide a cleaner interface to fetch Kubernetes data with:
 * - Automatic caching with configurable refresh rates
 * - Stale-while-revalidate pattern
 * - Failure tracking
 * - localStorage persistence
 *
 * Migration guide:
 * - Replace `usePods()` with `useCachedPods()`
 * - Replace `useEvents()` with `useCachedEvents()`
 * - etc.
 *
 * The hooks maintain the same return interface for easy migration.
 *
 * ---------------------------------------------------------------------------
 * Module layout (extracted for maintainability — issue #8624):
 *
 *   lib/cache/fetcherUtils.ts   — internal API fetch helpers (fetchAPI, SSE, etc.)
 *   hooks/useCachedData/
 *     agentFetchers.ts          — kc-agent HTTP fetchers
 *     demoData.ts               — synthetic demo data generators
 *   hooks/useCachedCoreWorkloads.ts  — pods, events, deployments, security, workloads
 *   hooks/useCachedNodes.ts          — node hooks + CoreDNS
 *   hooks/useCachedGPU.ts            — GPU nodes, GPU health, hardware health, warning events
 *   hooks/useCachedK8sResources.ts   — PVCs, namespaces, jobs, HPAs, configmaps, …
 *   hooks/useCachedGitOps.ts         — Helm, operators, GitOps drift, buildpacks, RBAC
 *   hooks/useCachedProw.ts           — Prow CI (pre-existing)
 *   hooks/useCachedLLMd.ts           — LLM-d (pre-existing)
 *   hooks/useCachedISO27001.ts       — ISO 27001 audit (pre-existing)
 * ---------------------------------------------------------------------------
 */

// ============================================================================
// Public API surface — re-export everything from focused modules
// ============================================================================

// Core abort helper (stays here — it's a global singleton operation)
export { abortAllFetches } from '../lib/cache/fetcherUtils'

// Core workload hooks
export {
  useCachedPods,
  useCachedAllPods,
  useCachedEvents,
  useCachedPodIssues,
  useCachedDeploymentIssues,
  useCachedDeployments,
  useCachedServices,
  useCachedSecurityIssues,
  useCachedWorkloads,
} from './useCachedCoreWorkloads'

// Node hooks
export {
  useCachedNodes,
  useCachedAllNodes,
  useCachedCoreDNSStatus,
} from './useCachedNodes'

// Node types (re-exported so existing imports still work)
export type {
  CoreDNSPodInfo,
  CoreDNSClusterStatus,
} from './useCachedNodes'

// GPU hooks
export {
  useCachedGPUNodes,
  useCachedGPUNodeHealth,
  useGPUHealthCronJob,
  useCachedHardwareHealth,
  useCachedWarningEvents,
} from './useCachedGPU'

// Hardware health types (re-exported so existing imports still work)
export type {
  DeviceAlert,
  DeviceCounts,
  NodeDeviceInventory,
  HardwareHealthData,
} from './useCachedGPU'

// K8s resource hooks
export {
  useCachedPVCs,
  useCachedNamespaces,
  useCachedJobs,
  useCachedHPAs,
  useCachedConfigMaps,
  useCachedSecrets,
  useCachedServiceAccounts,
  useCachedReplicaSets,
  useCachedStatefulSets,
  useCachedDaemonSets,
  useCachedCronJobs,
  useCachedIngresses,
  useCachedNetworkPolicies,
} from './useCachedK8sResources'

// GitOps & RBAC hooks
export {
  useCachedHelmReleases,
  useCachedHelmHistory,
  useCachedHelmValues,
  useCachedOperators,
  useCachedOperatorSubscriptions,
  useCachedGitOpsDrifts,
  useCachedBuildpackImages,
  useCachedK8sRoles,
  useCachedK8sRoleBindings,
  useCachedK8sServiceAccounts,
} from './useCachedGitOps'

// ============================================================================
// Prow CI Hooks — moved to useCachedProw.ts
// ============================================================================

export * from './useCachedProw'

// ============================================================================
// LLM-d Hooks — moved to useCachedLLMd.ts
// ============================================================================

export * from './useCachedLLMd'

// ============================================================================
// ISO 27001 Security Audit — re-exported from useCachedISO27001.ts
// ============================================================================

export * from './useCachedISO27001'

// ============================================================================
// Cilium Monitoring — useCachedCiliumStatus.ts
// ============================================================================

export * from './useCachedCiliumStatus'

// ============================================================================
// Jaeger Tracing — useCachedJaegerStatus.ts
// ============================================================================

export * from './useCachedJaegerStatus'

// ============================================================================
// Rook Cloud-Native Storage (Ceph) — useCachedRook.ts
// ============================================================================
// Named re-export (avoids `__testables` export-name collision with TiKV).

export { useCachedRook } from './useCachedRook'

// ============================================================================
// SPIFFE Workload Identity — useCachedSpiffe.ts (CNCF graduated)
// ============================================================================
// Named re-export (avoids `__testables` export-name collision with TiKV).

export { useCachedSpiffe } from './useCachedSpiffe'

// ============================================================================
// TiKV Distributed Key-Value Store — useCachedTikv.ts
// ============================================================================

export * from './useCachedTikv'

// ============================================================================
// Dapr Distributed Application Runtime — useCachedDapr.ts
// ============================================================================

export { useCachedDapr } from './useCachedDapr'

// ============================================================================
// OpenTelemetry Collector — useCachedOtel.ts
// ============================================================================

export { useCachedOtel } from './useCachedOtel'

// ============================================================================
// TUF (The Update Framework) — useCachedTuf.ts
// ============================================================================

export { useCachedTuf } from './useCachedTuf'

// ============================================================================
// Dragonfly P2P Image/File Distribution — useCachedDragonfly.ts
// ============================================================================

// Named re-export to avoid `__testables` collision with useCachedTikv.
export { useCachedDragonfly } from './useCachedDragonfly'

// ============================================================================
// Backstage developer portal (CNCF incubating) — useCachedBackstage.ts
// ============================================================================

export { useCachedBackstage } from './useCachedBackstage'

// ============================================================================
// Standalone fetchers for prefetch (no React hooks, plain async)
// ============================================================================

import { isBackendUnavailable, authFetch } from '../lib/api'
import { clusterCacheRef } from './mcp/shared'
import { isAgentUnavailable } from './useLocalAgent'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import {
  fetchAPI,
  fetchFromAllClusters,
  getToken,
  MAX_PREFETCH_PODS,
} from '../lib/cache/fetcherUtils'
import {
  fetchPodIssuesViaAgent,
  fetchDeploymentsViaAgent,
  fetchWorkloadsFromAgent,
  fetchSecurityIssuesViaKubectl,
} from './useCachedCoreWorkloads'
import { fetchProwJobs } from './useCachedProw'
import { fetchLLMdServers, fetchLLMdModels } from './useCachedLLMd'
import { validateResponse } from '../lib/schemas/validate'
import { SecurityIssuesResponseSchema } from '../lib/schemas'
import type {
  PodInfo,
  PodIssue,
  ClusterEvent,
  DeploymentIssue,
  Deployment,
  Service,
  SecurityIssue,
  NodeInfo,
} from './useMCP'
import type { Workload } from './useWorkloads'

/** Core data fetchers — used by prefetchCardData to warm caches at startup */
export const coreFetchers = {
  pods: async (): Promise<PodInfo[]> => {
    const pods = await fetchFromAllClusters<PodInfo>('pods', 'pods', {})
    return pods.sort((a, b) => (b.restarts || 0) - (a.restarts || 0)).slice(0, MAX_PREFETCH_PODS)
  },
  podIssues: async (): Promise<PodIssue[]> => {
    if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
      const issues = await fetchPodIssuesViaAgent()
      return issues.sort((a, b) => (b.restarts || 0) - (a.restarts || 0))
    }
    const token = getToken()
    if (token && token !== 'demo-token' && !isBackendUnavailable()) {
      const issues = await fetchFromAllClusters<PodIssue>('pod-issues', 'issues', {})
      return issues.sort((a, b) => (b.restarts || 0) - (a.restarts || 0))
    }
    return []
  },
  events: async (): Promise<ClusterEvent[]> => {
    const data = await fetchAPI<{ events: ClusterEvent[] }>('events', { limit: 20 })
    return data.events || []
  },
  deploymentIssues: async (): Promise<DeploymentIssue[]> => {
    if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
      const deployments = await fetchDeploymentsViaAgent()
      return deployments
        .filter(d => (d.readyReplicas ?? 0) < (d.replicas ?? 1))
        .map(d => ({
          name: d.name,
          namespace: d.namespace || 'default',
          cluster: d.cluster,
          replicas: d.replicas ?? 1,
          readyReplicas: d.readyReplicas ?? 0,
          reason: d.status === 'failed' ? 'DeploymentFailed' : 'ReplicaFailure'
        }))
    }
    const token = getToken()
    if (token && token !== 'demo-token' && !isBackendUnavailable()) {
      const data = await fetchAPI<{ issues: DeploymentIssue[] }>('deployment-issues', {})
      return data.issues || []
    }
    return []
  },
  deployments: async (): Promise<Deployment[]> => {
    if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
      return fetchDeploymentsViaAgent()
    }
    const token = getToken()
    if (token && token !== 'demo-token' && !isBackendUnavailable()) {
      return await fetchFromAllClusters<Deployment>('deployments', 'deployments', {})
    }
    return []
  },
  services: async (): Promise<Service[]> => {
    const data = await fetchAPI<{ services: Service[] }>('services', {})
    return data.services || []
  },
  securityIssues: async (): Promise<SecurityIssue[]> => {
    if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
      try {
        const issues = await fetchSecurityIssuesViaKubectl()
        if (issues.length > 0) return issues
      } catch { /* fall through */ }
    }
    const token = getToken()
    if (token && token !== 'demo-token' && !isBackendUnavailable()) {
      const response = await authFetch(`${LOCAL_AGENT_HTTP_URL}/security-issues`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS)
      })
      if (response.ok) {
        const rawSecurity = await response.json().catch(() => null)
        const data = validateResponse(SecurityIssuesResponseSchema, rawSecurity, '/security-issues (fallback)')
        if (data && data.issues && data.issues.length > 0) return data.issues
      }
    }
    return []
  },
  nodes: async (): Promise<NodeInfo[]> => {
    return fetchFromAllClusters<NodeInfo>('nodes', 'nodes', {})
  },
  warningEvents: async (): Promise<ClusterEvent[]> => {
    return fetchFromAllClusters<ClusterEvent>('events/warnings', 'events', { limit: 50 })
  },
  workloads: async (): Promise<Workload[]> => {
    const agentData = await fetchWorkloadsFromAgent()
    if (agentData) return agentData
    const token = getToken()
    if (token && token !== 'demo-token' && !isBackendUnavailable()) {
      const res = await fetch('/api/workloads', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS)
      })
      if (res.ok) {
        const data = await res.json().catch(() => null)
        if (!data) return []
        const items = (data.items || data) as Array<Record<string, unknown>>
        return items.map(d => ({
          name: String(d.name || ''),
          namespace: String(d.namespace || 'default'),
          type: (String(d.type || 'Deployment')) as Workload['type'],
          cluster: String(d.cluster || ''),
          targetClusters: (d.targetClusters as string[]) || (d.cluster ? [String(d.cluster)] : []),
          replicas: Number(d.replicas || 1),
          readyReplicas: Number(d.readyReplicas || 0),
          status: (String(d.status || 'Running')) as Workload['status'],
          image: String(d.image || ''),
          labels: (d.labels as Record<string, string>) || {},
          createdAt: String(d.createdAt || new Date().toISOString())
        }))
      }
    }
    return []
  }
}

/** Specialty data fetchers — lower priority, prefetched after core data */
export const specialtyFetchers = {
  prowJobs: () => fetchProwJobs('prow', 'prow'),
  llmdServers: () => fetchLLMdServers(['vllm-d', 'platform-eval']),
  llmdModels: () => fetchLLMdModels(['vllm-d', 'platform-eval'])
}
