import { useCallback, useEffect, useState } from 'react'
import { api, isBackendUnavailable } from '../../lib/api'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS, RBAC_QUERY_TIMEOUT_MS } from '../../lib/constants/network'
import { mapSettledWithConcurrency } from '../../lib/utils/concurrency'
import { agentFetch } from '../mcp/shared'
import { getDemoK8sServiceAccounts } from './demoData'
import { agentAuthHeaders } from './shared'
import type { ClusterPermissions, CreateRoleBindingRequest, CreateServiceAccountRequest, K8sRole, K8sRoleBinding, K8sServiceAccount, K8sUser } from '../../types/users'

export function useK8sUsers(cluster?: string) {
  const [users, setUsers] = useState<K8sUser[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    if (!cluster) return
    setIsLoading(true)
    setError(null)
    try {
      const { data } = await api.get<K8sUser[]>(`/api/rbac/users?cluster=${cluster}`)
      setUsers(Array.isArray(data) ? data : [])
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  return { users, isLoading, error, refetch: fetchUsers }
}

export function useK8sServiceAccounts(cluster?: string, namespace?: string) {
  const [serviceAccounts, setServiceAccounts] = useState<K8sServiceAccount[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchServiceAccounts = useCallback(async () => {
    if (!cluster) {
      setServiceAccounts([])
      setIsLoading(false)
      setError(null)
      return
    }

    setServiceAccounts([])
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('cluster', cluster)
      if (namespace) params.set('namespace', namespace)
      const { data } = await api.get<K8sServiceAccount[]>(`/api/rbac/service-accounts?${params}`, { timeout: RBAC_QUERY_TIMEOUT_MS })
      setServiceAccounts(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch service accounts'
      if (message.includes('connection refused') || message.includes('unreachable')) {
        setError(`Cluster ${cluster} is not reachable from the backend`)
      }
      setServiceAccounts(getDemoK8sServiceAccounts(cluster, namespace))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    fetchServiceAccounts()
  }, [fetchServiceAccounts])

  const createServiceAccount = async (req: CreateServiceAccountRequest) => {
    const authHeaders = await agentAuthHeaders()
    const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/serviceaccounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...authHeaders },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'unknown error' }))
      throw new Error(errorData.error || 'Failed to create service account')
    }
    const data = (await res.json()) as K8sServiceAccount
    setServiceAccounts(prev => [...prev, data])
    return data
  }

  return { serviceAccounts, isLoading, error, refetch: fetchServiceAccounts, createServiceAccount }
}

export function useAllK8sServiceAccounts(clusters: Array<{ name: string }>) {
  const [serviceAccounts, setServiceAccounts] = useState<K8sServiceAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedClusters, setFailedClusters] = useState<string[]>([])

  const fetchAllServiceAccounts = useCallback(async () => {
    if (clusters.length === 0) {
      setServiceAccounts([])
      setIsLoading(false)
      return
    }

    setServiceAccounts(prev => {
      if (prev.length === 0) setIsLoading(true)
      else setIsRefreshing(true)
      return prev
    })
    setError(null)
    setFailedClusters([])

    const allServiceAccounts: K8sServiceAccount[] = []
    const failed: string[] = []
    const results = await mapSettledWithConcurrency(clusters, async cluster => {
      try {
        const { data } = await api.get<K8sServiceAccount[]>(`/api/rbac/service-accounts?cluster=${cluster.name}`, { timeout: RBAC_QUERY_TIMEOUT_MS })
        return { cluster: cluster.name, serviceAccounts: Array.isArray(data) ? data : [] }
      } catch {
        return { cluster: cluster.name, serviceAccounts: [] as K8sServiceAccount[], failed: true }
      }
    })

    results.forEach(result => {
      if (result.status !== 'fulfilled') return
      const { cluster, serviceAccounts: clusterAccounts, failed: clusterFailed } = result.value as { cluster: string; serviceAccounts: K8sServiceAccount[]; failed?: boolean }
      if (clusterFailed) {
        failed.push(cluster)
        allServiceAccounts.push(...getDemoK8sServiceAccounts(cluster))
      } else {
        allServiceAccounts.push(...clusterAccounts)
      }
    })

    setServiceAccounts(allServiceAccounts)
    setFailedClusters(failed)
    setIsLoading(false)
    setIsRefreshing(false)
  }, [clusters])

  useEffect(() => {
    fetchAllServiceAccounts()
  }, [fetchAllServiceAccounts])

  return { serviceAccounts, isLoading, isRefreshing, error, failedClusters, refetch: fetchAllServiceAccounts }
}

export function useK8sRoles(cluster: string, namespace?: string, includeSystem?: boolean) {
  const [roles, setRoles] = useState<K8sRole[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRoles = useCallback(async () => {
    if (!cluster) return
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ cluster })
      if (namespace) params.set('namespace', namespace)
      if (includeSystem) params.set('includeSystem', 'true')
      const { data } = await api.get<K8sRole[]>(`/api/rbac/roles?${params}`, { timeout: RBAC_QUERY_TIMEOUT_MS })
      setRoles(Array.isArray(data) ? data : [])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, includeSystem, namespace])

  useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  return { roles, isLoading, error, refetch: fetchRoles }
}

export function useK8sRoleBindings(cluster: string, namespace?: string, includeSystem?: boolean) {
  const [bindings, setBindings] = useState<K8sRoleBinding[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBindings = useCallback(async () => {
    if (!cluster) return
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ cluster })
      if (namespace) params.set('namespace', namespace)
      if (includeSystem) params.set('includeSystem', 'true')
      const { data } = await api.get<K8sRoleBinding[]>(`/api/rbac/bindings?${params}`, { timeout: RBAC_QUERY_TIMEOUT_MS })
      setBindings(Array.isArray(data) ? data : [])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, includeSystem, namespace])

  useEffect(() => {
    fetchBindings()
  }, [fetchBindings])

  const createRoleBinding = async (req: CreateRoleBindingRequest) => {
    const authHeaders = await agentAuthHeaders()
    const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/rolebindings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...authHeaders },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'unknown error' }))
      throw new Error(errorData.error || 'Failed to create role binding')
    }
    await fetchBindings()
    return true
  }

  return { bindings, isLoading, error, refetch: fetchBindings, createRoleBinding }
}

export function useClusterPermissions(cluster?: string) {
  const [permissions, setPermissions] = useState<ClusterPermissions[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPermissions = useCallback(async () => {
    if (isBackendUnavailable()) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const params = cluster ? `?cluster=${cluster}` : ''
      const authHeaders = await agentAuthHeaders()
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/rbac/permissions${params}`, {
        headers: authHeaders,
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (!response.ok) {
        setIsLoading(false)
        return
      }
      const data = (await response.json()) as ClusterPermissions | ClusterPermissions[]
      setPermissions(Array.isArray(data) ? data : [data])
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  return { permissions, isLoading, error, refetch: fetchPermissions }
}
