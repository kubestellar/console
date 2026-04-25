import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocalAgent } from './useLocalAgent'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS, RETRY_DELAY_MS, UI_FEEDBACK_TIMEOUT_MS } from '../lib/constants/network'
import { useDemoMode } from './useDemoMode'
import { useClusterProgress } from './useClusterProgress'

/** Timeout for vCluster list operations */
const VCLUSTER_LIST_TIMEOUT_MS = 15_000
/** Timeout for vCluster connect operations */
const VCLUSTER_CONNECT_TIMEOUT_MS = 30_000
/** Timeout for vCluster create operations */
const VCLUSTER_CREATE_TIMEOUT_MS = 120_000

export interface LocalClusterTool {
  name: 'kind' | 'k3d' | 'minikube' | 'vcluster'
  installed: boolean
  version?: string
  path?: string
}

export interface VClusterInstance {
  name: string
  namespace: string
  status: string  // 'Running' | 'Paused' | 'Unknown'
  connected: boolean
  context?: string
}

/** Status of vCluster on a specific host cluster */
export interface VClusterClusterStatus {
  context: string
  name: string
  hasCRD: boolean
  version?: string
  instances: number
  vclusters?: VClusterInstance[]
}

export interface LocalCluster {
  name: string
  tool: string
  status: 'running' | 'stopped' | 'unknown'
}

export interface CreateClusterResult {
  status: 'creating' | 'error'
  message: string
}

// Demo data for local clusters
const DEMO_TOOLS: LocalClusterTool[] = [
  { name: 'kind', installed: true, version: '0.20.0', path: '/usr/local/bin/kind' },
  { name: 'k3d', installed: true, version: '5.6.0', path: '/usr/local/bin/k3d' },
  { name: 'minikube', installed: true, version: '1.32.0', path: '/usr/local/bin/minikube' },
  { name: 'vcluster', installed: true, version: '0.21.0', path: '/usr/local/bin/vcluster' },
]

const DEMO_CLUSTERS: LocalCluster[] = [
  { name: 'kind-local', tool: 'kind', status: 'running' },
  { name: 'kind-test', tool: 'kind', status: 'stopped' },
  { name: 'k3d-dev', tool: 'k3d', status: 'running' },
  { name: 'minikube', tool: 'minikube', status: 'running' },
]

const DEMO_VCLUSTER_INSTANCES: VClusterInstance[] = [
  { name: 'dev-tenant', namespace: 'vcluster', status: 'Running', connected: true, context: 'vcluster_dev-tenant_vcluster' },
  { name: 'staging', namespace: 'vcluster', status: 'Running', connected: false },
  { name: 'test-isolated', namespace: 'testing', status: 'Paused', connected: false },
]

export function useLocalClusterTools() {
  const { isConnected } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const [tools, setTools] = useState<LocalClusterTool[]>([])
  const [clusters, setClusters] = useState<LocalCluster[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null) // cluster name being deleted

  // vCluster state
  const [vclusterInstances, setVclusterInstances] = useState<VClusterInstance[]>([])
  const [vclusterClusterStatus, setVclusterClusterStatus] = useState<VClusterClusterStatus[]>([])
  // Dedicated loading/error state for /vcluster/list so the card can show a
  // skeleton on initial fetch and surface agent failures instead of silently
  // displaying stale or empty data (#7929 Copilot review on PR #7916).
  const [isVClustersLoading, setIsVClustersLoading] = useState(false)
  const [vclustersError, setVClustersError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState<string | null>(null) // vcluster name being connected
  const [isDisconnecting, setIsDisconnecting] = useState<string | null>(null) // vcluster name being disconnected

  // Real-time progress from kc-agent WebSocket
  const { progress: clusterProgress, dismiss: dismissProgress } = useClusterProgress()

  // Fetch detected tools
  const fetchTools = async () => {
    // In demo mode (without agent connected), show demo tools
    if (isDemoMode && !isConnected) {
      setTools(DEMO_TOOLS)
      setError(null)
      return
    }

    if (!isConnected) {
      setTools([])
      return
    }

    try {
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/local-cluster-tools`, {
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (response.ok) {
        const data = await response.json()
        setTools(data.tools || [])
        setError(null)
      }
    } catch (err) {
      console.error('Failed to fetch local cluster tools:', err)
      setError('Failed to fetch cluster tools')
    }
  }

  // Fetch existing clusters
  const fetchClusters = useCallback(async () => {
    // In demo mode (without agent connected), show demo clusters
    if (isDemoMode && !isConnected) {
      setClusters(DEMO_CLUSTERS)
      setError(null)
      return
    }

    if (!isConnected) {
      setClusters([])
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/local-clusters`, {
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (response.ok) {
        const data = await response.json()
        setClusters(data.clusters || [])
        setError(null)
      }
    } catch (err) {
      console.error('Failed to fetch local clusters:', err)
      setError('Failed to fetch clusters')
    } finally {
      setIsLoading(false)
    }
  }, [isConnected, isDemoMode])

  // Create a new cluster
  const createCluster = async (tool: string, name: string): Promise<CreateClusterResult> => {
    // In demo mode (without agent connected), simulate cluster creation
    if (isDemoMode && !isConnected) {
      setIsCreating(true)
      setError(null)
      
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
      
      setIsCreating(false)
      return { 
        status: 'creating', 
        message: `Simulation: ${tool} cluster "${name}" would be created here. Connect kc-agent to create real clusters.` 
      }
    }

    if (!isConnected) {
      return { status: 'error', message: 'Agent not connected' }
    }

    setIsCreating(true)
    setError(null)

    try {
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/local-clusters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ tool, name }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })

      if (response.ok) {
        const data = await response.json()
        return { status: 'creating', message: data.message }
      } else {
        const text = await response.text()
        return { status: 'error', message: text }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create cluster'
      setError(message)
      return { status: 'error', message }
    } finally {
      setIsCreating(false)
    }
  }

  // Lifecycle action (start/stop/restart) on a local cluster
  const clusterLifecycle = async (tool: string, name: string, action: 'start' | 'stop' | 'restart'): Promise<boolean> => {
    // In demo mode (without agent connected), simulate the action
    if (isDemoMode && !isConnected) {
      setError(null)
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
      return true
    }

    if (!isConnected) {
      return false
    }

    setError(null)

    try {
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/local-cluster-lifecycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ tool, name, action }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })

      if (response.ok) {
        // Refresh clusters list after action starts
        setTimeout(() => fetchClusters(), UI_FEEDBACK_TIMEOUT_MS)
        return true
      } else {
        const text = await response.text()
        setError(text)
        return false
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to ${action} cluster`
      setError(message)
      return false
    }
  }

  // Delete a cluster
  const deleteCluster = async (tool: string, name: string): Promise<boolean> => {
    // In demo mode (without agent connected), simulate cluster deletion
    if (isDemoMode && !isConnected) {
      setIsDeleting(name)
      setError(null)
      
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
      
      setIsDeleting(null)
      // In demo mode, we don't actually modify the demo data
      // The deletion is simulated - clusters will reappear on refresh
      return true
    }

    if (!isConnected) {
      return false
    }

    setIsDeleting(name)
    setError(null)

    try {
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/local-clusters?tool=${tool}&name=${name}`, {
        method: 'DELETE',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })

      if (response.ok) {
        // Refresh clusters list after deletion starts
        setTimeout(() => fetchClusters(), UI_FEEDBACK_TIMEOUT_MS)
        return true
      } else {
        const text = await response.text()
        setError(text)
        return false
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete cluster'
      setError(message)
      return false
    } finally {
      setIsDeleting(null)
    }
  }

  // Fetch vCluster instances
  const fetchVClusters = useCallback(async () => {
    // In demo mode (without agent connected), show demo vcluster instances
    if (isDemoMode && !isConnected) {
      setVclusterInstances(DEMO_VCLUSTER_INSTANCES)
      setVClustersError(null)
      setError(null)
      return
    }

    if (!isConnected) {
      setVclusterInstances([])
      setVClustersError(null)
      return
    }

    setIsVClustersLoading(true)
    try {
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/vcluster/list`, {
        signal: AbortSignal.timeout(VCLUSTER_LIST_TIMEOUT_MS) })
      if (response.ok) {
        const data = await response.json()
        // Backend returns `{ vclusters: [...] }` (pkg/agent/server_operations.go
        // handleVClusterList). Historically this read `data.instances`, which
        // was always undefined — live data silently fell back to [] (#7914).
        setVclusterInstances(data.vclusters || [])
        setVClustersError(null)
        setError(null)
      } else {
        // Non-2xx: clear stale instances and surface the failure so the card
        // can render an error state instead of silently showing empty or
        // stale data (#7929 Copilot review).
        const message = `vCluster list failed: HTTP ${response.status}`
        console.error(message)
        setVclusterInstances([])
        setVClustersError(message)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch vCluster instances'
      console.error('Failed to fetch vCluster instances:', err)
      setVclusterInstances([])
      setVClustersError(message)
      setError('Failed to fetch vCluster instances')
    } finally {
      setIsVClustersLoading(false)
    }
  }, [isConnected, isDemoMode])

  // Check if a specific cluster has vCluster installed (on-demand per cluster)
  const checkVClusterOnCluster = async (context: string) => {
    if (!isConnected || !context) return

    try {
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/vcluster/check?context=${encodeURIComponent(context)}`, {
        signal: AbortSignal.timeout(VCLUSTER_LIST_TIMEOUT_MS) })
      if (response.ok) {
        const data = await response.json()
        setVclusterClusterStatus(prev => {
          // Replace or add the status for this context
          const filtered = (prev || []).filter(s => s.context !== context)
          return [...filtered, data]
        })
      }
    } catch (err) {
      console.error(`Failed to check vCluster on ${context}:`, err)
    }
  }

  // Backwards-compatible: scan all healthy clusters (but one at a time, non-blocking)
  const fetchVClusterClusterStatus = async () => {
    // No-op: individual checks happen on-demand via checkVClusterOnCluster
    // This prevents the slow sequential scan of all contexts
  }

  // Create a new vCluster
  const createVCluster = async (name: string, namespace: string): Promise<CreateClusterResult> => {
    // In demo mode (without agent connected), simulate vcluster creation
    if (isDemoMode && !isConnected) {
      setIsCreating(true)
      setError(null)

      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))

      setIsCreating(false)
      return {
        status: 'creating',
        message: `Simulation: vCluster "${name}" in namespace "${namespace}" would be created here. Connect kc-agent to create real virtual clusters.` }
    }

    if (!isConnected) {
      return { status: 'error', message: 'Agent not connected' }
    }

    setIsCreating(true)
    setError(null)

    try {
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/vcluster/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ name, namespace }),
        signal: AbortSignal.timeout(VCLUSTER_CREATE_TIMEOUT_MS) })

      if (response.ok) {
        const data = await response.json()
        // Refresh vcluster list after creation starts
        setTimeout(() => fetchVClusters(), UI_FEEDBACK_TIMEOUT_MS)
        return { status: 'creating', message: data.message }
      } else {
        const text = await response.text()
        return { status: 'error', message: text }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create vCluster'
      setError(message)
      return { status: 'error', message }
    } finally {
      setIsCreating(false)
    }
  }

  // Connect to a vCluster
  const connectVCluster = async (name: string, namespace: string): Promise<boolean> => {
    // In demo mode (without agent connected), simulate connect
    if (isDemoMode && !isConnected) {
      setIsConnecting(name)
      setError(null)

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))

      setIsConnecting(null)
      return true
    }

    if (!isConnected) {
      return false
    }

    setIsConnecting(name)
    setError(null)

    try {
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/vcluster/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ name, namespace }),
        signal: AbortSignal.timeout(VCLUSTER_CONNECT_TIMEOUT_MS) })

      if (response.ok) {
        // Refresh vcluster list to update connected status
        setTimeout(() => fetchVClusters(), UI_FEEDBACK_TIMEOUT_MS)
        return true
      } else {
        const text = await response.text()
        setError(text)
        return false
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to vCluster'
      setError(message)
      return false
    } finally {
      setIsConnecting(null)
    }
  }

  // Disconnect from a vCluster
  const disconnectVCluster = async (name: string, namespace: string): Promise<boolean> => {
    // In demo mode (without agent connected), simulate disconnect
    if (isDemoMode && !isConnected) {
      setIsDisconnecting(name)
      setError(null)

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))

      setIsDisconnecting(null)
      return true
    }

    if (!isConnected) {
      return false
    }

    setIsDisconnecting(name)
    setError(null)

    try {
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/vcluster/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ name, namespace }),
        signal: AbortSignal.timeout(VCLUSTER_CONNECT_TIMEOUT_MS) })

      if (response.ok) {
        // Refresh vcluster list to update connected status
        setTimeout(() => fetchVClusters(), UI_FEEDBACK_TIMEOUT_MS)
        return true
      } else {
        const text = await response.text()
        setError(text)
        return false
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect from vCluster'
      setError(message)
      return false
    } finally {
      setIsDisconnecting(null)
    }
  }

  // Delete a vCluster
  const deleteVCluster = async (name: string, namespace: string): Promise<boolean> => {
    // In demo mode (without agent connected), simulate deletion
    if (isDemoMode && !isConnected) {
      setIsDeleting(name)
      setError(null)

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))

      setIsDeleting(null)
      return true
    }

    if (!isConnected) {
      return false
    }

    setIsDeleting(name)
    setError(null)

    try {
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/vcluster/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ name, namespace }),
        signal: AbortSignal.timeout(VCLUSTER_CONNECT_TIMEOUT_MS) })

      if (response.ok) {
        // Refresh vcluster list after deletion
        setTimeout(() => fetchVClusters(), UI_FEEDBACK_TIMEOUT_MS)
        return true
      } else {
        const text = await response.text()
        setError(text)
        return false
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete vCluster'
      setError(message)
      return false
    } finally {
      setIsDeleting(null)
    }
  }

  // Refresh all data
  const refresh = () => {
    fetchTools()
    fetchClusters()
    fetchVClusters()
    fetchVClusterClusterStatus()
  }

  // Initial fetch when connected or in demo mode — ref guard prevents infinite loop
  // from unstable function deps (fetchTools is not wrapped in useCallback)
  const localClusterInitRef = useRef(false)
  useEffect(() => {
    if (isConnected || isDemoMode) {
      if (!localClusterInitRef.current) {
        localClusterInitRef.current = true
        fetchTools()
        fetchClusters()
        fetchVClusters()
        fetchVClusterClusterStatus()
      }
    } else {
      localClusterInitRef.current = false
      setTools([])
      setClusters([])
      setVclusterInstances([])
      setVclusterClusterStatus([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps — fetchTools/fetchVClusterClusterStatus are not memoized
  }, [isConnected, isDemoMode, fetchClusters, fetchVClusters])

  // Auto-refresh cluster list when a create/delete operation completes
  useEffect(() => {
    if (clusterProgress?.status === 'done') {
      fetchClusters()
      fetchVClusters()
    }
  }, [clusterProgress?.status, fetchClusters, fetchVClusters])

  // Get only installed tools
  const installedTools = tools.filter(t => t.installed)

  return {
    tools,
    installedTools,
    clusters,
    isLoading,
    isCreating,
    isDeleting,
    error,
    isConnected,
    isDemoMode,
    clusterProgress,
    dismissProgress,
    createCluster,
    deleteCluster,
    clusterLifecycle,
    refresh,
    // vCluster state and actions
    vclusterInstances,
    vclusterClusterStatus,
    isVClustersLoading,
    vclustersError,
    checkVClusterOnCluster,
    isConnecting,
    isDisconnecting,
    createVCluster,
    connectVCluster,
    disconnectVCluster,
    deleteVCluster,
    fetchVClusters }
}
