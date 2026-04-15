import { useState, useEffect, useCallback, useRef } from 'react'
import { usePersistence } from './usePersistence'
import { FETCH_DEFAULT_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../lib/constants/network'

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

// consoleCRAgentEndpoint maps the legacy backend endpoint segment ("workloads",
// "groups", "deployments") to the corresponding kc-agent route segment added
// in #7993 Phase 2.5. Reads still go to the backend until Phase 4.5 migrates
// the list/get handlers; writes go through the agent so they run under the
// user's kubeconfig instead of the backend pod SA.
const consoleCRAgentEndpoint: Record<string, string> = {
  workloads: 'workloads',
  groups: 'groups',
  deployments: 'deployments' }

function useConsoleCR<T extends { metadata: { name: string } }>(
  resourceType: string,
  endpoint: string
) {
  const { isEnabled, isActive, activeCluster, config } = usePersistence()
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isMounted = useRef(true)

  const shouldUseCRs = isEnabled && isActive
  const persistenceNamespace = config.namespace

  // agentWriteURL composes the kc-agent URL for a CR write. Cluster and
  // namespace are query parameters so kc-agent can resolve the user's
  // kubeconfig context for the persistence cluster. #7993 Phase 2.5.
  const agentWriteURL = useCallback(
    (extraPath = '', extraParams: Record<string, string> = {}) => {
      const base = `${LOCAL_AGENT_HTTP_URL}/console-cr/${consoleCRAgentEndpoint[endpoint] ?? endpoint}${extraPath}`
      const params = new URLSearchParams({
        cluster: activeCluster,
        namespace: persistenceNamespace,
        ...extraParams })
      return `${base}?${params.toString()}`
    },
    [endpoint, activeCluster, persistenceNamespace]
  )

  // Fetch all items
  const fetchItems = useCallback(async () => {
    if (!shouldUseCRs) {
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`/api/persistence/${endpoint}`, {
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
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
  const getItem = async (name: string): Promise<T | null> => {
    if (!shouldUseCRs) return null

    try {
      const response = await fetch(`/api/persistence/${endpoint}/${name}`, {
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (response.ok) {
        return await response.json()
      }
    } catch (err) {
      console.error(`[useConsoleCR] Failed to get ${resourceType} ${name}:`, err)
    }
    return null
  }

  // Create item — routed through kc-agent (#7993 Phase 2.5).
  const createItem = async (item: Omit<T, 'metadata'> & { metadata: { name: string } }): Promise<T | null> => {
    if (!shouldUseCRs) return null
    if (!activeCluster || !persistenceNamespace) {
      console.error(`[useConsoleCR] cannot create ${resourceType}: persistence cluster or namespace not set`)
      return null
    }

    try {
      const response = await fetch(agentWriteURL(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
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
  }

  // Update item — routed through kc-agent (#7993 Phase 2.5).
  const updateItem = async (name: string, item: Partial<T>): Promise<T | null> => {
    if (!shouldUseCRs) return null
    if (!activeCluster || !persistenceNamespace) {
      console.error(`[useConsoleCR] cannot update ${resourceType}: persistence cluster or namespace not set`)
      return null
    }

    try {
      const response = await fetch(agentWriteURL('', { name }), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
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
  }

  // Delete item — routed through kc-agent (#7993 Phase 2.5).
  const deleteItem = async (name: string): Promise<boolean> => {
    if (!shouldUseCRs) return false
    if (!activeCluster || !persistenceNamespace) {
      console.error(`[useConsoleCR] cannot delete ${resourceType}: persistence cluster or namespace not set`)
      return false
    }

    try {
      const response = await fetch(agentWriteURL('', { name }), {
        method: 'DELETE',
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (response.ok || response.status === 204) {
        // Optimistic update
        setItems(prev => prev.filter(i => i.metadata.name !== name))
        return true
      }
    } catch (err) {
      console.error(`[useConsoleCR] Failed to delete ${resourceType} ${name}:`, err)
    }
    return false
  }

  // WebSocket subscriptions can be added using sharedWebSocket infrastructure
  // (see src/hooks/mcp/shared.ts and clusters.ts). Currently uses fetch on mount
  // with manual refresh via refresh() function.

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
    isEnabled: shouldUseCRs }
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
  const { isEnabled, isActive, activeCluster, config } = usePersistence()
  const shouldUseCRs = isEnabled && isActive
  const persistenceNamespace = config.namespace

  // Additional status update method — routed through kc-agent (#7993 Phase 2.5).
  const updateStatus = async (
    name: string,
    status: WorkloadDeploymentStatus
  ): Promise<WorkloadDeployment | null> => {
    if (!shouldUseCRs) return null
    if (!activeCluster || !persistenceNamespace) {
      console.error('[useWorkloadDeployments] cannot update status: persistence cluster or namespace not set')
      return null
    }

    try {
      const params = new URLSearchParams({ cluster: activeCluster, namespace: persistenceNamespace, name })
      const url = `${LOCAL_AGENT_HTTP_URL}/console-cr/deployments/status?${params.toString()}`
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(status),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (response.ok) {
        return await response.json()
      }
    } catch (err) {
      console.error(`[useWorkloadDeployments] Failed to update status for ${name}:`, err)
    }
    return null
  }

  return {
    ...base,
    updateStatus }
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
    } }
}
