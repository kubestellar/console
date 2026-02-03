import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import { reportAgentDataSuccess, isAgentUnavailable } from '../useLocalAgent'
import { getDemoMode } from '../useDemoMode'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { REFRESH_INTERVAL_MS, getEffectiveInterval, LOCAL_AGENT_URL, clusterCacheRef } from './shared'
import type { PVC, PV, ResourceQuota, LimitRange, ResourceQuotaSpec } from './types'

// Module-level cache for PVCs data (persists across navigation)
const PVCS_CACHE_KEY = 'kubestellar-pvcs-cache'

interface PVCsCache {
  data: PVC[]
  timestamp: Date
  key: string
}

let pvcsCache: PVCsCache | null = null

// Load PVCs cache from localStorage
function loadPVCsCacheFromStorage(cacheKey: string): { data: PVC[], timestamp: Date } | null {
  try {
    const stored = localStorage.getItem(PVCS_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.key === cacheKey && parsed.data && parsed.data.length > 0) {
        const timestamp = parsed.timestamp ? new Date(parsed.timestamp) : new Date()
        pvcsCache = { data: parsed.data, timestamp, key: cacheKey }
        return { data: parsed.data, timestamp }
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

function savePVCsCacheToStorage() {
  if (pvcsCache) {
    try {
      localStorage.setItem(PVCS_CACHE_KEY, JSON.stringify({
        data: pvcsCache.data,
        timestamp: pvcsCache.timestamp.toISOString(),
        key: pvcsCache.key
      }))
    } catch {
      // Ignore storage errors
    }
  }
}

// Hook to get PVCs with localStorage-backed caching
export function usePVCs(cluster?: string, namespace?: string) {
  const cacheKey = `pvcs:${cluster || 'all'}:${namespace || 'all'}`

  // Initialize from cache if available
  const getCachedData = () => {
    if (pvcsCache && pvcsCache.key === cacheKey) {
      return { data: pvcsCache.data, timestamp: pvcsCache.timestamp }
    }
    return loadPVCsCacheFromStorage(cacheKey)
  }

  const cached = getCachedData()
  const [pvcs, setPVCs] = useState<PVC[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached?.timestamp || null)

  // Reset state when cluster changes
  useEffect(() => {
    setPVCs([])
    setIsLoading(true)
    setError(null)
  }, [cluster, namespace])

  const refetch = useCallback(async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true)
    }
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoPVCs = getDemoPVCs().filter(p =>
        (!cluster || p.cluster === cluster) && (!namespace || p.namespace === namespace)
      )
      setPVCs(demoPVCs)
      setIsLoading(false)
      setIsRefreshing(false)
      setError(null)
      setLastUpdated(new Date())
      return
    }

    // Try local agent HTTP endpoint first
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(`${LOCAL_AGENT_URL}/pvcs?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const agentData = await response.json()
          const mappedPVCs: PVC[] = (agentData.pvcs || []).map((p: PVC) => ({ ...p, cluster }))
          const now = new Date()
          pvcsCache = { data: mappedPVCs, timestamp: now, key: cacheKey }
          setPVCs(mappedPVCs)
          setError(null)
          setLastUpdated(now)
          setConsecutiveFailures(0)
          setLastRefresh(now)
          setIsLoading(false)
          setIsRefreshing(false)
          reportAgentDataSuccess()
          return
        }
      } catch {
        // Fall through to kubectl proxy
      }
    }

    // Try kubectl proxy when cluster is specified
    if (cluster && !isAgentUnavailable()) {
      try {
        const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
        const kubectlContext = clusterInfo?.context || cluster
        const pvcData = await kubectlProxy.getPVCs(kubectlContext, namespace)
        const now = new Date()
        // Map to PVC format
        const mappedPVCs: PVC[] = pvcData.map(p => ({
          name: p.name,
          namespace: p.namespace,
          cluster: cluster,
          status: p.status,
          capacity: p.capacity,
          storageClass: p.storageClass,
        }))
        pvcsCache = { data: mappedPVCs, timestamp: now, key: cacheKey }
        setPVCs(mappedPVCs)
        setError(null)
        setLastUpdated(now)
        setConsecutiveFailures(0)
        setLastRefresh(now)
        setIsLoading(false)
        setIsRefreshing(false)
        return
      } catch (err) {
        console.error(`[usePVCs] kubectl proxy failed for ${cluster}, trying API`)
      }
    }

    if (!silent) {
      const hasCachedData = pvcsCache && pvcsCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ pvcs: PVC[] }>(`/api/mcp/pvcs?${params}`)
      const newData = data.pvcs || []
      const now = new Date()

      // Update module-level cache
      pvcsCache = { data: newData, timestamp: now, key: cacheKey }
      savePVCsCacheToStorage()

      setPVCs(newData)
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err) {
      // Keep stale data on error
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !pvcsCache) {
        setError('Failed to fetch PVCs')
        setPVCs([])
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace, cacheKey])

  useEffect(() => {
    const hasCachedData = pvcsCache && pvcsCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll for PVC updates
    const interval = setInterval(() => refetch(true), getEffectiveInterval(REFRESH_INTERVAL_MS))
    return () => clearInterval(interval)
  }, [refetch, cacheKey])

  return {
    pvcs,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    refetch: () => refetch(false),
    consecutiveFailures,
    isFailed: consecutiveFailures >= 3,
    lastRefresh,
  }
}

// Hook to get PVs (PersistentVolumes)
export function usePVs(cluster?: string) {
  const [pvs, setPVs] = useState<PV[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoPVs = getDemoPVs().filter(pv =>
        (!cluster || pv.cluster === cluster)
      )
      setPVs(demoPVs)
      setIsLoading(false)
      setError(null)
      return
    }
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      const { data } = await api.get<{ pvs: PV[] }>(`/api/mcp/pvs?${params}`)
      setPVs(data.pvs || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch PVs')
      // Fall back to demo data on error
      setPVs(getDemoPVs().filter(pv =>
        (!cluster || pv.cluster === cluster)
      ))
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    refetch()
    const interval = setInterval(refetch, getEffectiveInterval(REFRESH_INTERVAL_MS))
    return () => clearInterval(interval)
  }, [refetch])

  return { pvs, isLoading, error, refetch }
}

// Hook to get ResourceQuotas
export function useResourceQuotas(cluster?: string, namespace?: string) {
  const [resourceQuotas, setResourceQuotas] = useState<ResourceQuota[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoQuotas = getDemoResourceQuotas().filter(q =>
        (!cluster || q.cluster === cluster) && (!namespace || q.namespace === namespace)
      )
      setResourceQuotas(demoQuotas)
      setIsLoading(false)
      setError(null)
      return
    }
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ resourceQuotas: ResourceQuota[] }>(`/api/mcp/resourcequotas?${params}`)
      setResourceQuotas(data.resourceQuotas || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch ResourceQuotas')
      // Don't fall back to demo data - show empty instead
      setResourceQuotas([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()
    const interval = setInterval(refetch, getEffectiveInterval(REFRESH_INTERVAL_MS))
    return () => clearInterval(interval)
  }, [refetch])

  return { resourceQuotas, isLoading, error, refetch }
}

// Hook to get LimitRanges
export function useLimitRanges(cluster?: string, namespace?: string) {
  const [limitRanges, setLimitRanges] = useState<LimitRange[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoRanges = getDemoLimitRanges().filter(lr =>
        (!cluster || lr.cluster === cluster) && (!namespace || lr.namespace === namespace)
      )
      setLimitRanges(demoRanges)
      setIsLoading(false)
      setError(null)
      return
    }
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ limitRanges: LimitRange[] }>(`/api/mcp/limitranges?${params}`)
      setLimitRanges(data.limitRanges || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch LimitRanges')
      // Don't fall back to demo data - show empty instead
      setLimitRanges([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()
    const interval = setInterval(refetch, getEffectiveInterval(REFRESH_INTERVAL_MS))
    return () => clearInterval(interval)
  }, [refetch])

  return { limitRanges, isLoading, error, refetch }
}

// Create or update a ResourceQuota
export async function createOrUpdateResourceQuota(spec: ResourceQuotaSpec): Promise<ResourceQuota> {
  const { data } = await api.post<{ resourceQuota: ResourceQuota }>('/api/mcp/resourcequotas', spec)
  return data.resourceQuota
}

// Delete a ResourceQuota
export async function deleteResourceQuota(cluster: string, namespace: string, name: string): Promise<void> {
  await api.delete(`/api/mcp/resourcequotas?cluster=${cluster}&namespace=${namespace}&name=${name}`)
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

// Demo data functions (not exported)

function getDemoPVs(): PV[] {
  return [
    { name: 'pv-postgres-data', cluster: 'prod-east', capacity: '100Gi', accessModes: ['ReadWriteOnce'], reclaimPolicy: 'Retain', status: 'Bound', storageClass: 'gp3', claimRef: 'data/postgres-data', age: '40d' },
    { name: 'pv-redis-data', cluster: 'prod-east', capacity: '20Gi', accessModes: ['ReadWriteOnce'], reclaimPolicy: 'Retain', status: 'Bound', storageClass: 'gp3', claimRef: 'data/redis-data', age: '40d' },
    { name: 'pv-prometheus', cluster: 'staging', capacity: '50Gi', accessModes: ['ReadWriteOnce'], reclaimPolicy: 'Delete', status: 'Bound', storageClass: 'standard', claimRef: 'monitoring/prometheus-data', age: '20d' },
    { name: 'pv-grafana', cluster: 'staging', capacity: '10Gi', accessModes: ['ReadWriteOnce'], reclaimPolicy: 'Delete', status: 'Bound', storageClass: 'standard', claimRef: 'monitoring/grafana-data', age: '20d' },
    { name: 'pv-model-cache', cluster: 'vllm-d', capacity: '500Gi', accessModes: ['ReadWriteMany'], reclaimPolicy: 'Retain', status: 'Bound', storageClass: 'fast-ssd', claimRef: 'ml/model-cache', age: '15d' },
    { name: 'pv-training-data', cluster: 'vllm-d', capacity: '1Ti', accessModes: ['ReadWriteMany'], reclaimPolicy: 'Retain', status: 'Available', storageClass: 'fast-ssd', age: '10d' },
    { name: 'pv-logs', cluster: 'prod-east', capacity: '200Gi', accessModes: ['ReadWriteOnce'], reclaimPolicy: 'Delete', status: 'Bound', storageClass: 'cold-storage', claimRef: 'logging/logs-archive', age: '60d' },
  ]
}

function getDemoPVCs(): PVC[] {
  return [
    { name: 'postgres-data', namespace: 'data', cluster: 'prod-east', status: 'Bound', storageClass: 'gp3', capacity: '100Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-abc123', age: '40d' },
    { name: 'redis-data', namespace: 'data', cluster: 'prod-east', status: 'Bound', storageClass: 'gp3', capacity: '20Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-def456', age: '40d' },
    { name: 'prometheus-data', namespace: 'monitoring', cluster: 'staging', status: 'Bound', storageClass: 'standard', capacity: '50Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-ghi789', age: '20d' },
    { name: 'grafana-data', namespace: 'monitoring', cluster: 'staging', status: 'Bound', storageClass: 'standard', capacity: '10Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-jkl012', age: '20d' },
    { name: 'model-cache', namespace: 'ml', cluster: 'vllm-d', status: 'Bound', storageClass: 'fast-ssd', capacity: '500Gi', accessModes: ['ReadWriteMany'], volumeName: 'pvc-mno345', age: '15d' },
    { name: 'training-data', namespace: 'ml', cluster: 'vllm-d', status: 'Pending', storageClass: 'fast-ssd', capacity: '1Ti', accessModes: ['ReadWriteMany'], age: '1d' },
    { name: 'logs-archive', namespace: 'logging', cluster: 'prod-east', status: 'Bound', storageClass: 'cold-storage', capacity: '200Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-pqr678', age: '60d' },
  ]
}

function getDemoResourceQuotas(): ResourceQuota[] {
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

function getDemoLimitRanges(): LimitRange[] {
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
