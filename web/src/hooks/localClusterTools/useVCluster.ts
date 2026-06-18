import { useCallback, useEffect, useRef, useState } from 'react'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants'
import { RETRY_DELAY_MS, UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { agentFetch } from '../mcp/shared'
import { DEMO_VCLUSTER_INSTANCES } from './localClusterDemoData'
import type { CreateClusterResult, VClusterActionFeedback, VClusterClusterStatus, VClusterInstance } from './types'

/** Timeout for vCluster list operations */
const VCLUSTER_LIST_TIMEOUT_MS = 15_000
/** Timeout for vCluster connect operations */
const VCLUSTER_CONNECT_TIMEOUT_MS = 30_000
/** Timeout for vCluster create operations */
const VCLUSTER_CREATE_TIMEOUT_MS = 120_000

interface UseVClusterArgs {
  isConnected: boolean
  isDemoMode: boolean
  setGlobalError: (message: string | null) => void
}

export function useVCluster({ isConnected, isDemoMode, setGlobalError }: UseVClusterArgs) {
  const [vclusterInstances, setVclusterInstances] = useState<VClusterInstance[]>([])
  const [vclusterClusterStatus, setVclusterClusterStatus] = useState<VClusterClusterStatus[]>([])
  const [isVClustersLoading, setIsVClustersLoading] = useState(false)
  const [vclustersError, setVClustersError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState<string | null>(null)
  const [isDisconnecting, setIsDisconnecting] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vclusterActionFeedback, setVClusterActionFeedback] = useState<VClusterActionFeedback | null>(null)
  const pendingTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const fetchVClusters = useCallback(async () => {
    if (isDemoMode && !isConnected) {
      setVclusterInstances(DEMO_VCLUSTER_INSTANCES)
      setVClustersError(null)
      setError(null)
      setGlobalError(null)
      return
    }

    if (!isConnected) {
      setVclusterInstances([])
      setVClustersError(null)
      return
    }

    setIsVClustersLoading(true)
    try {
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/vcluster/list`, {
        signal: AbortSignal.timeout(VCLUSTER_LIST_TIMEOUT_MS),
      })

      if (response.ok) {
        const data = await response.json()
        setVclusterInstances(data.vclusters || [])
        setVClustersError(null)
        setError(null)
        setGlobalError(null)
      } else {
        const message = `vCluster list failed: HTTP ${response.status}`
        console.error(message)
        setVclusterInstances([])
        setVClustersError(message)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch vCluster instances'
      console.error('Failed to fetch vCluster instances:', err)
      setVclusterInstances([])
      setVClustersError(message)
      setError('Failed to fetch vCluster instances')
      setGlobalError('Failed to fetch vCluster instances')
    } finally {
      setIsVClustersLoading(false)
    }
  }, [isConnected, isDemoMode, setGlobalError])

  const checkVClusterOnCluster = useCallback(async (context: string) => {
    if (!isConnected || !context) return

    try {
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/vcluster/check?context=${encodeURIComponent(context)}`, {
        signal: AbortSignal.timeout(VCLUSTER_LIST_TIMEOUT_MS),
      })

      if (response.ok) {
        const data = await response.json()
        setVclusterClusterStatus(prev => {
          const filtered = (prev || []).filter(status => status.context !== context)
          return [...filtered, data]
        })
      }
    } catch (err: unknown) {
      console.error(`Failed to check vCluster on ${context}:`, err)
    }
  }, [isConnected])

  const fetchVClusterClusterStatus = useCallback(async () => {
    // No-op: individual checks happen on-demand via checkVClusterOnCluster
  }, [])

  const createVCluster = useCallback(async (name: string, namespace: string): Promise<CreateClusterResult> => {
    if (isDemoMode && !isConnected) {
      setIsCreating(true)
      setError(null)
      setGlobalError(null)

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))

      setIsCreating(false)
      return {
        status: 'creating',
        message: `Simulation: vCluster "${name}" in namespace "${namespace}" would be created here. Connect kc-agent to create real virtual clusters.`,
      }
    }

    if (!isConnected) {
      return { status: 'error', message: 'Agent not connected' }
    }

    setIsCreating(true)
    setError(null)
    setGlobalError(null)

    try {
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/vcluster/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ name, namespace }),
        signal: AbortSignal.timeout(VCLUSTER_CREATE_TIMEOUT_MS),
      })

      if (response.ok) {
        const data = await response.json()
        const timeoutId = setTimeout(() => {
          void fetchVClusters()
        }, UI_FEEDBACK_TIMEOUT_MS)
        pendingTimeoutsRef.current.push(timeoutId)
        return { status: 'creating', message: data.message }
      }

      const text = await response.text()
      return { status: 'error', message: text }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create vCluster'
      setError(message)
      setGlobalError(message)
      return { status: 'error', message }
    } finally {
      setIsCreating(false)
    }
  }, [fetchVClusters, isConnected, isDemoMode, setGlobalError])

  const connectVCluster = useCallback(async (name: string, namespace: string): Promise<boolean> => {
    setVClusterActionFeedback({ action: 'connect', name, namespace, state: 'pending' })

    if (isDemoMode && !isConnected) {
      setIsConnecting(name)
      setError(null)
      setGlobalError(null)

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))

      setVClusterActionFeedback({ action: 'connect', name, namespace, state: 'success' })
      setIsConnecting(null)
      return true
    }

    if (!isConnected) {
      const message = 'Agent not connected'
      setVClusterActionFeedback({ action: 'connect', name, namespace, state: 'error', message })
      setError(message)
      setGlobalError(message)
      return false
    }

    setIsConnecting(name)
    setError(null)
    setGlobalError(null)

    try {
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/vcluster/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ name, namespace }),
        signal: AbortSignal.timeout(VCLUSTER_CONNECT_TIMEOUT_MS),
      })

      if (response.ok) {
        const timeoutId = setTimeout(() => {
          void fetchVClusters()
        }, UI_FEEDBACK_TIMEOUT_MS)
        pendingTimeoutsRef.current.push(timeoutId)
        setVClusterActionFeedback({ action: 'connect', name, namespace, state: 'success' })
        return true
      }

      const text = await response.text()
      setError(text)
      setGlobalError(text)
      setVClusterActionFeedback({ action: 'connect', name, namespace, state: 'error', message: text })
      return false
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect to vCluster'
      setError(message)
      setGlobalError(message)
      setVClusterActionFeedback({ action: 'connect', name, namespace, state: 'error', message })
      return false
    } finally {
      setIsConnecting(null)
    }
  }, [fetchVClusters, isConnected, isDemoMode, setGlobalError])

  const disconnectVCluster = useCallback(async (name: string, namespace: string): Promise<boolean> => {
    setVClusterActionFeedback({ action: 'disconnect', name, namespace, state: 'pending' })

    if (isDemoMode && !isConnected) {
      setIsDisconnecting(name)
      setError(null)
      setGlobalError(null)

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))

      setVClusterActionFeedback({ action: 'disconnect', name, namespace, state: 'success' })
      setIsDisconnecting(null)
      return true
    }

    if (!isConnected) {
      const message = 'Agent not connected'
      setVClusterActionFeedback({ action: 'disconnect', name, namespace, state: 'error', message })
      setError(message)
      setGlobalError(message)
      return false
    }

    setIsDisconnecting(name)
    setError(null)
    setGlobalError(null)

    try {
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/vcluster/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ name, namespace }),
        signal: AbortSignal.timeout(VCLUSTER_CONNECT_TIMEOUT_MS),
      })

      if (response.ok) {
        const timeoutId = setTimeout(() => {
          void fetchVClusters()
        }, UI_FEEDBACK_TIMEOUT_MS)
        pendingTimeoutsRef.current.push(timeoutId)
        setVClusterActionFeedback({ action: 'disconnect', name, namespace, state: 'success' })
        return true
      }

      const text = await response.text()
      setError(text)
      setGlobalError(text)
      setVClusterActionFeedback({ action: 'disconnect', name, namespace, state: 'error', message: text })
      return false
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect from vCluster'
      setError(message)
      setGlobalError(message)
      setVClusterActionFeedback({ action: 'disconnect', name, namespace, state: 'error', message })
      return false
    } finally {
      setIsDisconnecting(null)
    }
  }, [fetchVClusters, isConnected, isDemoMode, setGlobalError])

  const deleteVCluster = useCallback(async (name: string, namespace: string): Promise<boolean> => {
    setVClusterActionFeedback({ action: 'delete', name, namespace, state: 'pending' })

    if (isDemoMode && !isConnected) {
      setIsDeleting(name)
      setError(null)
      setGlobalError(null)

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))

      setVClusterActionFeedback({ action: 'delete', name, namespace, state: 'success' })
      setIsDeleting(null)
      return true
    }

    if (!isConnected) {
      const message = 'Agent not connected'
      setVClusterActionFeedback({ action: 'delete', name, namespace, state: 'error', message })
      setError(message)
      setGlobalError(message)
      return false
    }

    setIsDeleting(name)
    setError(null)
    setGlobalError(null)

    try {
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/vcluster/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ name, namespace }),
        signal: AbortSignal.timeout(VCLUSTER_CONNECT_TIMEOUT_MS),
      })

      if (response.ok) {
        const timeoutId = setTimeout(() => {
          void fetchVClusters()
        }, UI_FEEDBACK_TIMEOUT_MS)
        pendingTimeoutsRef.current.push(timeoutId)
        setVClusterActionFeedback({ action: 'delete', name, namespace, state: 'success' })
        return true
      }

      const text = await response.text()
      setError(text)
      setGlobalError(text)
      setVClusterActionFeedback({ action: 'delete', name, namespace, state: 'error', message: text })
      return false
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete vCluster'
      setError(message)
      setGlobalError(message)
      setVClusterActionFeedback({ action: 'delete', name, namespace, state: 'error', message })
      return false
    } finally {
      setIsDeleting(null)
    }
  }, [fetchVClusters, isConnected, isDemoMode, setGlobalError])

  useEffect(() => {
    if (!isConnected && !isDemoMode) {
      setVclusterInstances([])
      setVclusterClusterStatus([])
    }
  }, [isConnected, isDemoMode])

  useEffect(() => {
    return () => {
      pendingTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId))
      pendingTimeoutsRef.current = []
    }
  }, [])

  return {
    vclusterInstances,
    vclusterClusterStatus,
    isVClustersLoading,
    vclustersError,
    isConnecting,
    isDisconnecting,
    isCreating,
    isDeleting,
    error,
    vclusterActionFeedback,
    setVClusterActionFeedback,
    fetchVClusters,
    checkVClusterOnCluster,
    fetchVClusterClusterStatus,
    createVCluster,
    connectVCluster,
    disconnectVCluster,
    deleteVCluster,
  }
}
