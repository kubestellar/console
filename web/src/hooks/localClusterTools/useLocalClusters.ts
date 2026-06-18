import { useCallback, useEffect, useRef, useState } from 'react'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS, RETRY_DELAY_MS, UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { agentFetch } from '../mcp/shared'
import { DEMO_CLUSTERS } from './localClusterDemoData'
import type { CreateClusterResult, LocalCluster } from './types'

interface UseLocalClustersArgs {
  isConnected: boolean
  isDemoMode: boolean
  setGlobalError: (message: string | null) => void
}

export function useLocalClusters({ isConnected, isDemoMode, setGlobalError }: UseLocalClustersArgs) {
  const [clusters, setClusters] = useState<LocalCluster[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pendingTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const fetchClusters = useCallback(async () => {
    if (isDemoMode && !isConnected) {
      setClusters(DEMO_CLUSTERS)
      setError(null)
      setGlobalError(null)
      return
    }

    if (!isConnected) {
      setClusters([])
      return
    }

    setIsLoading(true)
    try {
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/local-clusters`, {
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (response.ok) {
        const data = await response.json()
        setClusters(data.clusters || [])
        setError(null)
        setGlobalError(null)
      }
    } catch (err: unknown) {
      console.error('Failed to fetch local clusters:', err)
      const message = 'Failed to fetch clusters'
      setError(message)
      setGlobalError(message)
    } finally {
      setIsLoading(false)
    }
  }, [isConnected, isDemoMode, setGlobalError])

  const createCluster = useCallback(async (tool: string, name: string): Promise<CreateClusterResult> => {
    if (isDemoMode && !isConnected) {
      setIsCreating(true)
      setError(null)
      setGlobalError(null)

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))

      setIsCreating(false)
      return {
        status: 'creating',
        message: `Simulation: ${tool} cluster "${name}" would be created here. Connect kc-agent to create real clusters.`,
      }
    }

    if (!isConnected) {
      return { status: 'error', message: 'Agent not connected' }
    }

    setIsCreating(true)
    setError(null)
    setGlobalError(null)

    try {
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/local-clusters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ tool, name }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (response.ok) {
        const data = await response.json()
        return { status: 'creating', message: data.message }
      }

      const text = await response.text()
      return { status: 'error', message: text }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create cluster'
      setError(message)
      setGlobalError(message)
      return { status: 'error', message }
    } finally {
      setIsCreating(false)
    }
  }, [isConnected, isDemoMode, setGlobalError])

  const clusterLifecycle = useCallback(async (tool: string, name: string, action: 'start' | 'stop' | 'restart'): Promise<boolean> => {
    if (isDemoMode && !isConnected) {
      setError(null)
      setGlobalError(null)
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
      return true
    }

    if (!isConnected) {
      return false
    }

    setError(null)
    setGlobalError(null)

    try {
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/local-cluster-lifecycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ tool, name, action }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (response.ok) {
        const timeoutId = setTimeout(() => {
          void fetchClusters()
        }, UI_FEEDBACK_TIMEOUT_MS)
        pendingTimeoutsRef.current.push(timeoutId)
        return true
      }

      const text = await response.text()
      setError(text)
      setGlobalError(text)
      return false
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : `Failed to ${action} cluster`
      setError(message)
      setGlobalError(message)
      return false
    }
  }, [fetchClusters, isConnected, isDemoMode, setGlobalError])

  const deleteCluster = useCallback(async (tool: string, name: string): Promise<boolean> => {
    if (isDemoMode && !isConnected) {
      setIsDeleting(name)
      setError(null)
      setGlobalError(null)

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))

      setIsDeleting(null)
      return true
    }

    if (!isConnected) {
      return false
    }

    setIsDeleting(name)
    setError(null)
    setGlobalError(null)

    try {
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/local-clusters?tool=${tool}&name=${name}`, {
        method: 'DELETE',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (response.ok) {
        const timeoutId = setTimeout(() => {
          void fetchClusters()
        }, UI_FEEDBACK_TIMEOUT_MS)
        pendingTimeoutsRef.current.push(timeoutId)
        return true
      }

      const text = await response.text()
      setError(text)
      setGlobalError(text)
      return false
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete cluster'
      setError(message)
      setGlobalError(message)
      return false
    } finally {
      setIsDeleting(null)
    }
  }, [fetchClusters, isConnected, isDemoMode, setGlobalError])

  useEffect(() => {
    if (!isConnected && !isDemoMode) {
      setClusters([])
    }
  }, [isConnected, isDemoMode])

  useEffect(() => {
    return () => {
      pendingTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId))
      pendingTimeoutsRef.current = []
    }
  }, [])

  return {
    clusters,
    isLoading,
    isCreating,
    isDeleting,
    error,
    fetchClusters,
    createCluster,
    deleteCluster,
    clusterLifecycle,
  }
}
