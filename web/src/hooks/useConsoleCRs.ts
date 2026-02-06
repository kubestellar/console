import { useState, useEffect, useCallback, useRef } from 'react'
import { usePersistence } from './usePersistence'

// =============================================================================
// Types
// =============================================================================

export interface WorkloadReference {
  apiVersion?: string
  kind: string
  name: string
}

export interface ResourceReference {
  name: string
  namespace?: string
}

export interface ClusterFilter {
  field: string
  operator: string
  value: string
  labelKey?: string
}

// ManagedWorkload
export interface ManagedWorkloadSpec {
  sourceCluster: string
  sourceNamespace: string
  workloadRef: WorkloadReference
  targetClusters?: string[]
  targetGroups?: string[]
  replicas?: number
  overrides?: Record<string, unknown>
  suspend?: boolean
}

export interface ClusterDeploymentStatus {
  cluster: string
  status?: string
  replicas?: string
  message?: string
  lastUpdateTime?: string
}

export interface ManagedWorkloadStatus {
  phase?: string
  observedGeneration?: number
  lastSyncTime?: string
  deployedClusters?: ClusterDeploymentStatus[]
  conditions?: Condition[]
}

export interface ManagedWorkload {
  apiVersion?: string
  kind?: string
  metadata: {
    name: string
    namespace?: string
    creationTimestamp?: string
    resourceVersion?: string
  }
  spec: ManagedWorkloadSpec
  status?: ManagedWorkloadStatus
}

// ClusterGroup
export interface ClusterGroupSpec {
  description?: string
  color?: string
  icon?: string
  staticMembers?: string[]
  dynamicFilters?: ClusterFilter[]
  priority?: number
}

export interface ClusterGroupStatus {
  matchedClusters?: string[]
  matchedClusterCount?: number
  lastEvaluated?: string
  observedGeneration?: number
  conditions?: Condition[]
}

export interface ClusterGroup {
  apiVersion?: string
  kind?: string
  metadata: {
    name: string
    namespace?: string
    creationTimestamp?: string
    resourceVersion?: string
  }
  spec: ClusterGroupSpec
  status?: ClusterGroupStatus
}

// WorkloadDeployment
export interface RolloutConfig {
  maxUnavailable?: number
  maxSurge?: number
  pauseBetweenClusters?: string
  healthCheckTimeout?: string
}

export interface CanaryConfig {
  initialWeight?: number
  stepWeight?: number
  stepInterval?: string
  maxWeight?: number
}

export interface WorkloadDeploymentSpec {
  workloadRef: ResourceReference
  targetGroupRef?: ResourceReference
  targetClusters?: string[]
  strategy?: 'RollingUpdate' | 'Recreate' | 'BlueGreen' | 'Canary'
  rolloutConfig?: RolloutConfig
  canaryConfig?: CanaryConfig
  dryRun?: boolean
  autoPromote?: boolean
  suspend?: boolean
}

export interface ClusterRolloutStatus {
  cluster: string
  phase?: string
  progress?: string
  startedAt?: string
  completedAt?: string
  message?: string
  rollbackAvailable?: boolean
}

export interface CanaryStatus {
  currentWeight?: number
  currentStep?: number
  totalSteps?: number
  lastStepTime?: string
  metrics?: Record<string, unknown>
}

export interface WorkloadDeploymentStatus {
  phase?: string
  progress?: string
  observedGeneration?: number
  startedAt?: string
  completedAt?: string
  clusterStatuses?: ClusterRolloutStatus[]
  canaryStatus?: CanaryStatus
  conditions?: Condition[]
}

export interface WorkloadDeployment {
  apiVersion?: string
  kind?: string
  metadata: {
    name: string
    namespace?: string
    creationTimestamp?: string
    resourceVersion?: string
  }
  spec: WorkloadDeploymentSpec
  status?: WorkloadDeploymentStatus
}

interface Condition {
  type: string
  status: 'True' | 'False' | 'Unknown'
  lastTransitionTime?: string
  reason?: string
  message?: string
}

// =============================================================================
// Generic CRUD hook factory
// =============================================================================

function useConsoleCR<T extends { metadata: { name: string } }>(
  resourceType: string,
  endpoint: string
) {
  const { isEnabled, isActive } = usePersistence()
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isMounted = useRef(true)

  const shouldUseCRs = isEnabled && isActive

  // Fetch all items
  const fetchItems = useCallback(async () => {
    if (!shouldUseCRs) {
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`/api/persistence/${endpoint}`)
      if (response.ok) {
        const data = await response.json()
        if (isMounted.current) {
          setItems(data || [])
          setError(null)
        }
      } else {
        throw new Error('Failed to fetch')
      }
    } catch (err) {
      console.error(`[useConsoleCR] Failed to fetch ${resourceType}:`, err)
      if (isMounted.current) {
        setError(`Failed to load ${resourceType}`)
      }
    } finally {
      if (isMounted.current) {
        setLoading(false)
      }
    }
  }, [shouldUseCRs, endpoint, resourceType])

  // Get single item
  const getItem = useCallback(async (name: string): Promise<T | null> => {
    if (!shouldUseCRs) return null

    try {
      const response = await fetch(`/api/persistence/${endpoint}/${name}`)
      if (response.ok) {
        return await response.json()
      }
    } catch (err) {
      console.error(`[useConsoleCR] Failed to get ${resourceType} ${name}:`, err)
    }
    return null
  }, [shouldUseCRs, endpoint, resourceType])

  // Create item
  const createItem = useCallback(async (item: Omit<T, 'metadata'> & { metadata: { name: string } }): Promise<T | null> => {
    if (!shouldUseCRs) return null

    try {
      const response = await fetch(`/api/persistence/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
      if (response.ok) {
        const created = await response.json()
        // Optimistic update
        setItems(prev => [...prev, created])
        return created
      }
    } catch (err) {
      console.error(`[useConsoleCR] Failed to create ${resourceType}:`, err)
    }
    return null
  }, [shouldUseCRs, endpoint, resourceType])

  // Update item
  const updateItem = useCallback(async (name: string, item: Partial<T>): Promise<T | null> => {
    if (!shouldUseCRs) return null

    try {
      const response = await fetch(`/api/persistence/${endpoint}/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
      if (response.ok) {
        const updated = await response.json()
        // Optimistic update
        setItems(prev => prev.map(i => i.metadata.name === name ? updated : i))
        return updated
      }
    } catch (err) {
      console.error(`[useConsoleCR] Failed to update ${resourceType} ${name}:`, err)
    }
    return null
  }, [shouldUseCRs, endpoint, resourceType])

  // Delete item
  const deleteItem = useCallback(async (name: string): Promise<boolean> => {
    if (!shouldUseCRs) return false

    try {
      const response = await fetch(`/api/persistence/${endpoint}/${name}`, {
        method: 'DELETE',
      })
      if (response.ok || response.status === 204) {
        // Optimistic update
        setItems(prev => prev.filter(i => i.metadata.name !== name))
        return true
      }
    } catch (err) {
      console.error(`[useConsoleCR] Failed to delete ${resourceType} ${name}:`, err)
    }
    return false
  }, [shouldUseCRs, endpoint, resourceType])

  // TODO: Add WebSocket subscription for real-time updates
  // For now, use polling or manual refresh

  // Initial fetch
  useEffect(() => {
    isMounted.current = true
    fetchItems()
    return () => { isMounted.current = false }
  }, [fetchItems])

  return {
    items,
    loading,
    error,
    refresh: fetchItems,
    getItem,
    createItem,
    updateItem,
    deleteItem,
    isEnabled: shouldUseCRs,
  }
}

// =============================================================================
// Specific hooks for each resource type
// =============================================================================

export function useManagedWorkloads() {
  return useConsoleCR<ManagedWorkload>('ManagedWorkload', 'workloads')
}

export function useClusterGroups() {
  return useConsoleCR<ClusterGroup>('ClusterGroup', 'groups')
}

export function useWorkloadDeployments() {
  const base = useConsoleCR<WorkloadDeployment>('WorkloadDeployment', 'deployments')
  const { isEnabled, isActive } = usePersistence()
  const shouldUseCRs = isEnabled && isActive

  // Additional status update method
  const updateStatus = useCallback(async (
    name: string,
    status: WorkloadDeploymentStatus
  ): Promise<WorkloadDeployment | null> => {
    if (!shouldUseCRs) return null

    try {
      const response = await fetch(`/api/persistence/deployments/${name}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(status),
      })
      if (response.ok) {
        return await response.json()
      }
    } catch (err) {
      console.error(`[useWorkloadDeployments] Failed to update status for ${name}:`, err)
    }
    return null
  }, [shouldUseCRs])

  return {
    ...base,
    updateStatus,
  }
}

// =============================================================================
// Combined hook for all console CRs
// =============================================================================

export function useAllConsoleCRs() {
  const workloads = useManagedWorkloads()
  const groups = useClusterGroups()
  const deployments = useWorkloadDeployments()

  return {
    workloads,
    groups,
    deployments,
    loading: workloads.loading || groups.loading || deployments.loading,
    error: workloads.error || groups.error || deployments.error,
    isEnabled: workloads.isEnabled,
    refresh: async () => {
      await Promise.all([
        workloads.refresh(),
        groups.refresh(),
        deployments.refresh(),
      ])
    },
  }
}
