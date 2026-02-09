/**
 * MCS (Multi-Cluster Service) data hooks.
 *
 * Provides React hooks for fetching ServiceExport and ServiceImport
 * resources across clusters via the backend MCS API.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { api, BackendUnavailableError } from '../lib/api'
import { useDemoMode } from './useDemoMode'
import type {
  ServiceExport,
  ServiceExportList,
  ServiceImport,
  ServiceImportList,
  MCSStatusResponse,
  ClusterMCSStatus,
} from '../types/mcs'

// Refresh interval for automatic polling (2 minutes)
const REFRESH_INTERVAL_MS = 120000

// Demo data for demo mode
const DEMO_SERVICE_EXPORTS: ServiceExport[] = [
  { name: 'api-gateway', namespace: 'production', cluster: 'us-east-1', status: 'Ready', createdAt: new Date(Date.now() - 7 * 86400000).toISOString(), targetClusters: ['eu-central-1', 'us-west-2'] },
  { name: 'auth-service', namespace: 'production', cluster: 'us-east-1', status: 'Ready', createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
  { name: 'data-service', namespace: 'analytics', cluster: 'eu-central-1', status: 'Pending', createdAt: new Date(Date.now() - 86400000).toISOString() },
]

const DEMO_SERVICE_IMPORTS: ServiceImport[] = [
  { name: 'api-gateway', namespace: 'production', cluster: 'eu-central-1', sourceCluster: 'us-east-1', type: 'ClusterSetIP', endpoints: 3, createdAt: new Date(Date.now() - 7 * 86400000).toISOString() },
  { name: 'auth-service', namespace: 'production', cluster: 'us-west-2', sourceCluster: 'us-east-1', type: 'ClusterSetIP', endpoints: 2, createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
]

interface UseMCSState<T> {
  data: T | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  lastUpdated: number | null
}

/**
 * Hook to get MCS availability status across all clusters.
 */
export function useMCSStatus() {
  const { isDemoMode: demoMode } = useDemoMode()
  const [state, setState] = useState<UseMCSState<ClusterMCSStatus[]>>({
    data: null,
    isLoading: true,
    isRefreshing: false,
    error: null,
    lastUpdated: null,
  })

  const fetchStatus = useCallback(async (isRefresh = false) => {
    setState((prev) => ({
      ...prev,
      isLoading: !isRefresh && !prev.data,
      isRefreshing: isRefresh,
      error: null,
    }))

    try {
      const { data } = await api.get<MCSStatusResponse>('/api/mcs/status', { timeout: 10000 })
      setState({
        data: data.clusters,
        isLoading: false,
        isRefreshing: false,
        error: null,
        lastUpdated: Date.now(),
      })
    } catch (err) {
      if (err instanceof BackendUnavailableError) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isRefreshing: false,
          error: 'Backend unavailable',
        }))
        return
      }
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isRefreshing: false,
        error: err instanceof Error ? err.message : 'Failed to fetch MCS status',
      }))
    }
  }, [])

  useEffect(() => {
    if (demoMode) {
      setState({ data: [], isLoading: false, isRefreshing: false, error: null, lastUpdated: Date.now() })
      return
    }
    fetchStatus()
  }, [fetchStatus, demoMode])

  return {
    clusters: state.data ?? [],
    isLoading: state.isLoading,
    isRefreshing: state.isRefreshing,
    error: state.error,
    lastUpdated: state.lastUpdated,
    refetch: () => fetchStatus(true),
  }
}

/**
 * Hook to get ServiceExport resources.
 *
 * @param cluster - Optional cluster filter
 * @param namespace - Optional namespace filter
 */
export function useServiceExports(cluster?: string, namespace?: string) {
  const { isDemoMode: demoMode } = useDemoMode()
  const [state, setState] = useState<UseMCSState<ServiceExport[]>>({
    data: null,
    isLoading: true,
    isRefreshing: false,
    error: null,
    lastUpdated: null,
  })
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  const fetchExports = useCallback(async (isRefresh = false) => {
    setState((prev) => ({
      ...prev,
      isLoading: !isRefresh && !prev.data,
      isRefreshing: isRefresh,
      error: null,
    }))

    try {
      // Build query params
      const params = new URLSearchParams()
      if (cluster) params.set('cluster', cluster)
      if (namespace) params.set('namespace', namespace)
      const query = params.toString()
      const url = `/api/mcs/exports${query ? `?${query}` : ''}`

      const { data } = await api.get<ServiceExportList>(url, { timeout: 15000 })
      setState({
        data: data.items,
        isLoading: false,
        isRefreshing: false,
        error: null,
        lastUpdated: Date.now(),
      })
    } catch (err) {
      if (err instanceof BackendUnavailableError) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isRefreshing: false,
          error: 'Backend unavailable',
        }))
        return
      }
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isRefreshing: false,
        error: err instanceof Error ? err.message : 'Failed to fetch service exports',
      }))
    }
  }, [cluster, namespace])

  // Initial fetch and polling
  useEffect(() => {
    if (demoMode) {
      setState({ data: DEMO_SERVICE_EXPORTS, isLoading: false, isRefreshing: false, error: null, lastUpdated: Date.now() })
      return
    }

    fetchExports()

    // Set up polling
    intervalRef.current = setInterval(() => {
      fetchExports(true)
    }, REFRESH_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [fetchExports, demoMode])

  return {
    exports: state.data ?? [],
    totalCount: state.data?.length ?? 0,
    isLoading: state.isLoading,
    isRefreshing: state.isRefreshing,
    error: state.error,
    lastUpdated: state.lastUpdated,
    refetch: () => fetchExports(true),
  }
}

/**
 * Hook to get ServiceImport resources.
 *
 * @param cluster - Optional cluster filter
 * @param namespace - Optional namespace filter
 */
export function useServiceImports(cluster?: string, namespace?: string) {
  const { isDemoMode: demoMode } = useDemoMode()
  const [state, setState] = useState<UseMCSState<ServiceImport[]>>({
    data: null,
    isLoading: true,
    isRefreshing: false,
    error: null,
    lastUpdated: null,
  })
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  const fetchImports = useCallback(async (isRefresh = false) => {
    setState((prev) => ({
      ...prev,
      isLoading: !isRefresh && !prev.data,
      isRefreshing: isRefresh,
      error: null,
    }))

    try {
      // Build query params
      const params = new URLSearchParams()
      if (cluster) params.set('cluster', cluster)
      if (namespace) params.set('namespace', namespace)
      const query = params.toString()
      const url = `/api/mcs/imports${query ? `?${query}` : ''}`

      const { data } = await api.get<ServiceImportList>(url, { timeout: 15000 })
      setState({
        data: data.items,
        isLoading: false,
        isRefreshing: false,
        error: null,
        lastUpdated: Date.now(),
      })
    } catch (err) {
      if (err instanceof BackendUnavailableError) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isRefreshing: false,
          error: 'Backend unavailable',
        }))
        return
      }
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isRefreshing: false,
        error: err instanceof Error ? err.message : 'Failed to fetch service imports',
      }))
    }
  }, [cluster, namespace])

  // Initial fetch and polling
  useEffect(() => {
    if (demoMode) {
      setState({ data: DEMO_SERVICE_IMPORTS, isLoading: false, isRefreshing: false, error: null, lastUpdated: Date.now() })
      return
    }

    fetchImports()

    // Set up polling
    intervalRef.current = setInterval(() => {
      fetchImports(true)
    }, REFRESH_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [fetchImports, demoMode])

  return {
    imports: state.data ?? [],
    totalCount: state.data?.length ?? 0,
    isLoading: state.isLoading,
    isRefreshing: state.isRefreshing,
    error: state.error,
    lastUpdated: state.lastUpdated,
    refetch: () => fetchImports(true),
  }
}

/**
 * Hook to get a specific ServiceExport.
 */
export function useServiceExport(cluster: string, namespace: string, name: string) {
  const [state, setState] = useState<UseMCSState<ServiceExport>>({
    data: null,
    isLoading: true,
    isRefreshing: false,
    error: null,
    lastUpdated: null,
  })

  const fetchExport = useCallback(async (isRefresh = false) => {
    if (!cluster || !namespace || !name) return

    setState((prev) => ({
      ...prev,
      isLoading: !isRefresh && !prev.data,
      isRefreshing: isRefresh,
      error: null,
    }))

    try {
      const url = `/api/mcs/exports/${encodeURIComponent(cluster)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
      const { data } = await api.get<ServiceExport>(url, { timeout: 10000 })
      setState({
        data,
        isLoading: false,
        isRefreshing: false,
        error: null,
        lastUpdated: Date.now(),
      })
    } catch (err) {
      if (err instanceof BackendUnavailableError) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isRefreshing: false,
          error: 'Backend unavailable',
        }))
        return
      }
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isRefreshing: false,
        error: err instanceof Error ? err.message : 'Failed to fetch service export',
      }))
    }
  }, [cluster, namespace, name])

  useEffect(() => {
    fetchExport()
  }, [fetchExport])

  return {
    export: state.data,
    isLoading: state.isLoading,
    isRefreshing: state.isRefreshing,
    error: state.error,
    lastUpdated: state.lastUpdated,
    refetch: () => fetchExport(true),
  }
}

/**
 * Hook to get a specific ServiceImport.
 */
export function useServiceImport(cluster: string, namespace: string, name: string) {
  const [state, setState] = useState<UseMCSState<ServiceImport>>({
    data: null,
    isLoading: true,
    isRefreshing: false,
    error: null,
    lastUpdated: null,
  })

  const fetchImport = useCallback(async (isRefresh = false) => {
    if (!cluster || !namespace || !name) return

    setState((prev) => ({
      ...prev,
      isLoading: !isRefresh && !prev.data,
      isRefreshing: isRefresh,
      error: null,
    }))

    try {
      const url = `/api/mcs/imports/${encodeURIComponent(cluster)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
      const { data } = await api.get<ServiceImport>(url, { timeout: 10000 })
      setState({
        data,
        isLoading: false,
        isRefreshing: false,
        error: null,
        lastUpdated: Date.now(),
      })
    } catch (err) {
      if (err instanceof BackendUnavailableError) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isRefreshing: false,
          error: 'Backend unavailable',
        }))
        return
      }
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isRefreshing: false,
        error: err instanceof Error ? err.message : 'Failed to fetch service import',
      }))
    }
  }, [cluster, namespace, name])

  useEffect(() => {
    fetchImport()
  }, [fetchImport])

  return {
    import: state.data,
    isLoading: state.isLoading,
    isRefreshing: state.isRefreshing,
    error: state.error,
    lastUpdated: state.lastUpdated,
    refetch: () => fetchImport(true),
  }
}
