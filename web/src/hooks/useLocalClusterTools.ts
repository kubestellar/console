import { useState, useEffect, useCallback } from 'react'
import { useLocalAgent } from './useLocalAgent'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'

export interface LocalClusterTool {
  name: 'kind' | 'k3d' | 'minikube'
  installed: boolean
  version?: string
  path?: string
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

export function useLocalClusterTools() {
  const { isConnected } = useLocalAgent()
  const [tools, setTools] = useState<LocalClusterTool[]>([])
  const [clusters, setClusters] = useState<LocalCluster[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null) // cluster name being deleted

  // Fetch detected tools
  const fetchTools = useCallback(async () => {
    if (!isConnected) {
      setTools([])
      return
    }

    try {
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/local-cluster-tools`)
      if (response.ok) {
        const data = await response.json()
        setTools(data.tools || [])
        setError(null)
      }
    } catch (err) {
      console.error('Failed to fetch local cluster tools:', err)
      setError('Failed to fetch cluster tools')
    }
  }, [isConnected])

  // Fetch existing clusters
  const fetchClusters = useCallback(async () => {
    if (!isConnected) {
      setClusters([])
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/local-clusters`)
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
  }, [isConnected])

  // Create a new cluster
  const createCluster = useCallback(async (tool: string, name: string): Promise<CreateClusterResult> => {
    if (!isConnected) {
      return { status: 'error', message: 'Agent not connected' }
    }

    setIsCreating(true)
    setError(null)

    try {
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/local-clusters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, name }),
      })

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
  }, [isConnected])

  // Delete a cluster
  const deleteCluster = useCallback(async (tool: string, name: string): Promise<boolean> => {
    if (!isConnected) {
      return false
    }

    setIsDeleting(name)
    setError(null)

    try {
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/local-clusters?tool=${tool}&name=${name}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        // Refresh clusters list after deletion starts
        setTimeout(() => fetchClusters(), 2000)
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
  }, [isConnected, fetchClusters])

  // Refresh all data
  const refresh = useCallback(() => {
    fetchTools()
    fetchClusters()
  }, [fetchTools, fetchClusters])

  // Initial fetch when connected
  useEffect(() => {
    if (isConnected) {
      fetchTools()
      fetchClusters()
    } else {
      setTools([])
      setClusters([])
    }
  }, [isConnected, fetchTools, fetchClusters])

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
    createCluster,
    deleteCluster,
    refresh,
  }
}
