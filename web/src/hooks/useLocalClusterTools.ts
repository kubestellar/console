import { useState, useEffect, useCallback } from 'react'
import { useLocalAgent } from './useLocalAgent'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { useDemoMode } from './useDemoMode'

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

// Demo data for local clusters
const DEMO_TOOLS: LocalClusterTool[] = [
  { name: 'kind', installed: true, version: '0.20.0', path: '/usr/local/bin/kind' },
  { name: 'k3d', installed: true, version: '5.6.0', path: '/usr/local/bin/k3d' },
  { name: 'minikube', installed: true, version: '1.32.0', path: '/usr/local/bin/minikube' },
]

const DEMO_CLUSTERS: LocalCluster[] = [
  { name: 'kind-local', tool: 'kind', status: 'running' },
  { name: 'kind-test', tool: 'kind', status: 'stopped' },
  { name: 'k3d-dev', tool: 'k3d', status: 'running' },
  { name: 'minikube', tool: 'minikube', status: 'running' },
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

  // Fetch detected tools
  const fetchTools = useCallback(async () => {
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
  }, [isConnected, isDemoMode])

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
  }, [isConnected, isDemoMode])

  // Create a new cluster
  const createCluster = useCallback(async (tool: string, name: string): Promise<CreateClusterResult> => {
    // In demo mode (without agent connected), simulate cluster creation
    if (isDemoMode && !isConnected) {
      setIsCreating(true)
      setError(null)
      
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
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
  }, [isConnected, isDemoMode])

  // Delete a cluster
  const deleteCluster = useCallback(async (tool: string, name: string): Promise<boolean> => {
    // In demo mode (without agent connected), simulate cluster deletion
    if (isDemoMode && !isConnected) {
      setIsDeleting(name)
      setError(null)
      
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
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
  }, [isConnected, isDemoMode, fetchClusters])

  // Refresh all data
  const refresh = useCallback(() => {
    fetchTools()
    fetchClusters()
  }, [fetchTools, fetchClusters])

  // Initial fetch when connected or in demo mode
  useEffect(() => {
    if (isConnected || isDemoMode) {
      fetchTools()
      fetchClusters()
    } else {
      setTools([])
      setClusters([])
    }
  }, [isConnected, isDemoMode, fetchTools, fetchClusters])

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
    createCluster,
    deleteCluster,
    refresh,
  }
}
