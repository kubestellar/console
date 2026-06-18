import { useCallback, useMemo } from 'react'
import { MCP_HOOK_TIMEOUT_MS, FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { isClusterModeBackend } from '../../../lib/cache/fetcherUtils'
import { useClusterResourceQuery } from '../useClusterResourceQuery'
import type { ResourceQuota, LimitRange, ResourceQuotaSpec } from '../types'

// Hook to get ResourceQuotas
// When forceLive is true, skip demo mode fallback and always query the real API.
// Used by GPU Reservations to show live data when running in-cluster with OAuth.
// Returns `isDemoFallback: true` when the hook is serving demo data so callers
// can render the Demo badge only for true demo output. See Issue 9356.
export function useResourceQuotas(cluster?: string, namespace?: string, forceLive = false) {
  const result = useClusterResourceQuery<ResourceQuota>({
    resourceKey: 'resourceQuotas',
    endpoint: 'resourcequotas',
    dataField: 'resourceQuotas',
    getDemoData: getDemoResourceQuotas,
    filterFn: (item, c, ns) => (!c || item.cluster === c) && (!ns || item.namespace === ns),
    cluster,
    namespace,
    forceLive,
    silentErrors: true,
  })

  return {
    resourceQuotas: result.data,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
    isDemoFallback: result.isDemoFallback,
  }
}

// Hook to get LimitRanges
export function useLimitRanges(cluster?: string, namespace?: string) {
  const result = useClusterResourceQuery<LimitRange>({
    resourceKey: 'limitRanges',
    endpoint: 'limitranges',
    dataField: 'limitRanges',
    getDemoData: getDemoLimitRanges,
    filterFn: (item, c, ns) => (!c || item.cluster === c) && (!ns || item.namespace === ns),
    cluster,
    namespace,
    silentErrors: true,
  })

  return {
    limitRanges: result.data,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  }
}

// Create or update a ResourceQuota
export async function createOrUpdateResourceQuota(spec: ResourceQuotaSpec): Promise<ResourceQuota> {
  if (isClusterModeBackend()) {
    const response = await fetch('/api/mcp/resourcequotas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spec),
      signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    return data.resourceQuota
  }

  const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/resourcequotas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const data = await resp.json()
  return data.resourceQuota
}

// Delete a ResourceQuota
export async function deleteResourceQuota(cluster: string, namespace: string, name: string): Promise<void> {
  const params = new URLSearchParams({ cluster, namespace, name })

  if (isClusterModeBackend()) {
    const response = await fetch(`/api/mcp/resourcequotas?${params.toString()}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return
  }

  const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/resourcequotas?${params.toString()}`, {
    method: 'DELETE',
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
}

// Common GPU resource types for quotas
export const GPU_RESOURCE_TYPES = [
  { key: 'requests.nvidia.com/gpu', label: 'NVIDIA GPU Requests', description: 'Maximum GPUs that can be requested' },
  { key: 'limits.nvidia.com/gpu', label: 'NVIDIA GPU Limits', description: 'Maximum GPU limits allowed' },
  { key: 'requests.amd.com/gpu', label: 'AMD GPU Requests', description: 'Maximum AMD GPUs that can be requested' },
  { key: 'limits.amd.com/gpu', label: 'AMD GPU Limits', description: 'Maximum AMD GPU limits allowed' },
] as const

// Common resource types for quotas
export const COMMON_RESOURCE_TYPES = [
  { key: 'requests.cpu', label: 'CPU Requests', description: 'Total CPU requests allowed' },
  { key: 'limits.cpu', label: 'CPU Limits', description: 'Total CPU limits allowed' },
  { key: 'requests.memory', label: 'Memory Requests', description: 'Total memory requests allowed' },
  { key: 'limits.memory', label: 'Memory Limits', description: 'Total memory limits allowed' },
  { key: 'pods', label: 'Pods', description: 'Maximum number of pods' },
  { key: 'services', label: 'Services', description: 'Maximum number of services' },
  { key: 'persistentvolumeclaims', label: 'PVCs', description: 'Maximum number of PVCs' },
  { key: 'requests.storage', label: 'Storage Requests', description: 'Total storage that can be requested' },
  ...GPU_RESOURCE_TYPES,
] as const

// Demo data functions
export function getDemoResourceQuotas(): ResourceQuota[] {
  return [
    {
      name: 'compute-quota',
      namespace: 'production',
      cluster: 'prod-east',
      hard: { 'requests.cpu': '10', 'requests.memory': '20Gi', 'limits.cpu': '20', 'limits.memory': '40Gi', pods: '50' },
      used: { 'requests.cpu': '5', 'requests.memory': '10Gi', 'limits.cpu': '8', 'limits.memory': '16Gi', pods: '25' },
      age: '30d'
    },
    {
      name: 'storage-quota',
      namespace: 'data',
      cluster: 'prod-east',
      hard: { 'requests.storage': '500Gi', persistentvolumeclaims: '10' },
      used: { 'requests.storage': '320Gi', persistentvolumeclaims: '5' },
      age: '40d'
    },
    {
      name: 'ml-quota',
      namespace: 'ml',
      cluster: 'vllm-d',
      hard: { 'requests.cpu': '100', 'requests.memory': '200Gi', 'limits.cpu': '200', 'limits.memory': '400Gi', 'requests.nvidia.com/gpu': '8', pods: '20' },
      used: { 'requests.cpu': '64', 'requests.memory': '128Gi', 'limits.cpu': '128', 'limits.memory': '256Gi', 'requests.nvidia.com/gpu': '4', pods: '8' },
      age: '15d'
    },
    {
      name: 'default-quota',
      namespace: 'default',
      cluster: 'staging',
      hard: { 'requests.cpu': '4', 'requests.memory': '8Gi', 'limits.cpu': '8', 'limits.memory': '16Gi', pods: '20' },
      used: { 'requests.cpu': '1', 'requests.memory': '2Gi', 'limits.cpu': '2', 'limits.memory': '4Gi', pods: '5' },
      age: '60d'
    },
  ]
}

export function getDemoLimitRanges(): LimitRange[] {
  return [
    {
      name: 'container-limits',
      namespace: 'production',
      cluster: 'prod-east',
      limits: [
        {
          type: 'Container',
          default: { cpu: '500m', memory: '512Mi' },
          defaultRequest: { cpu: '100m', memory: '128Mi' },
          max: { cpu: '2', memory: '4Gi' },
          min: { cpu: '50m', memory: '64Mi' }
        }
      ],
      age: '30d'
    },
    {
      name: 'pod-limits',
      namespace: 'ml',
      cluster: 'vllm-d',
      limits: [
        {
          type: 'Container',
          default: { cpu: '1', memory: '2Gi' },
          defaultRequest: { cpu: '500m', memory: '1Gi' },
          max: { cpu: '16', memory: '64Gi' },
          min: { cpu: '100m', memory: '256Mi' }
        },
        {
          type: 'Pod',
          max: { cpu: '32', memory: '128Gi' }
        }
      ],
      age: '15d'
    },
    {
      name: 'storage-limits',
      namespace: 'data',
      cluster: 'prod-east',
      limits: [
        {
          type: 'PersistentVolumeClaim',
          max: { storage: '100Gi' },
          min: { storage: '1Gi' }
        }
      ],
      age: '40d'
    },
  ]
}
