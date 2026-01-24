import { useState, useEffect, useCallback } from 'react'
import { api, BackendUnavailableError } from '../lib/api'
import { getDemoMode } from './useDemoMode'
import type {
  ConsoleUser,
  K8sServiceAccount,
  K8sRole,
  K8sRoleBinding,
  K8sUser,
  ClusterPermissions,
  UserManagementSummary,
  UserRole,
  CreateServiceAccountRequest,
  CreateRoleBindingRequest,
} from '../types/users'

/**
 * Hook for managing console users
 */
export function useConsoleUsers() {
  const [users, setUsers] = useState<ConsoleUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    // Only show loading spinner if no cached data
    setIsRefreshing(true)
    setUsers(prev => {
      if (prev.length === 0) {
        setIsLoading(true)
      }
      return prev
    })
    setError(null)
    try {
      const { data } = await api.get<ConsoleUser[]>('/api/users')
      setUsers(data || [])
    } catch (err) {
      // Don't log or set error for expected failures (backend unavailable or timeout)
      const isExpectedFailure = err instanceof BackendUnavailableError ||
        (err instanceof Error && err.message.includes('Request timeout'))
      if (!isExpectedFailure) {
        setError('Failed to load users')
        if (err instanceof Error && err.message) {
          console.warn('Failed to load users:', err.message)
        }
      }
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const updateUserRole = useCallback(async (userId: string, role: UserRole) => {
    try {
      await api.put(`/api/users/${userId}/role`, { role })
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role } : u))
      )
      return true
    } catch (err) {
      console.error('Failed to update user role:', err)
      throw err
    }
  }, [])

  const deleteUser = useCallback(async (userId: string) => {
    try {
      await api.delete(`/api/users/${userId}`)
      setUsers((prev) => prev.filter((u) => u.id !== userId))
      return true
    } catch (err) {
      console.error('Failed to delete user:', err)
      throw err
    }
  }, [])

  return {
    users,
    isLoading,
    isRefreshing,
    error,
    refetch: fetchUsers,
    updateUserRole,
    deleteUser,
  }
}

/**
 * Hook for fetching user management summary
 */
export function useUserManagementSummary() {
  const [summary, setSummary] = useState<UserManagementSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSummary = useCallback(async () => {
    // Only show loading spinner if no cached data
    setIsRefreshing(true)
    setSummary(prev => {
      if (prev === null) {
        setIsLoading(true)
      }
      return prev
    })
    setError(null)
    try {
      const { data } = await api.get<UserManagementSummary>('/api/users/summary')
      setSummary(data)
    } catch (err) {
      // Don't log or set error for expected failures (backend unavailable or timeout)
      const isExpectedFailure = err instanceof BackendUnavailableError ||
        (err instanceof Error && err.message.includes('Request timeout'))
      if (!isExpectedFailure) {
        setError('Failed to load summary')
        if (err instanceof Error && err.message) {
          console.warn('Failed to load user summary:', err.message)
        }
      }
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  return { summary, isLoading, isRefreshing, error, refetch: fetchSummary }
}

/**
 * Hook for Kubernetes RBAC users
 */
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
      setUsers(data || [])
    } catch (err) {
      setError('Failed to load K8s users')
      console.error('Failed to load K8s users:', err)
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  return { users, isLoading, error, refetch: fetchUsers }
}

// Demo data for K8s service accounts
function getDemoK8sServiceAccounts(cluster?: string, namespace?: string): K8sServiceAccount[] {
  const accounts: K8sServiceAccount[] = [
    { name: 'default', namespace: 'default', cluster: 'prod-east', roles: ['view'] },
    { name: 'admin-sa', namespace: 'default', cluster: 'prod-east', roles: ['admin', 'cluster-admin'] },
    { name: 'jenkins', namespace: 'ci-cd', cluster: 'prod-east', roles: ['edit', 'deploy'] },
    { name: 'prometheus', namespace: 'monitoring', cluster: 'prod-east', roles: ['cluster-view'] },
    { name: 'grafana', namespace: 'monitoring', cluster: 'prod-east', roles: ['view'] },
    { name: 'argocd', namespace: 'argocd', cluster: 'prod-east', roles: ['cluster-admin'] },
    { name: 'default', namespace: 'default', cluster: 'staging', roles: ['view'] },
    { name: 'developer-sa', namespace: 'development', cluster: 'staging', roles: ['edit'] },
    { name: 'tester-sa', namespace: 'testing', cluster: 'staging', roles: ['view', 'pod-exec'] },
    { name: 'default', namespace: 'default', cluster: 'dev-cluster', roles: ['view'] },
    { name: 'local-admin', namespace: 'kube-system', cluster: 'dev-cluster', roles: ['cluster-admin'] },
  ]

  let result = accounts
  if (cluster) {
    result = result.filter(sa => sa.cluster === cluster)
  }
  if (namespace) {
    result = result.filter(sa => sa.namespace === namespace)
  }
  return result
}

/**
 * Hook for Kubernetes service accounts
 */
export function useK8sServiceAccounts(cluster?: string, namespace?: string) {
  const [serviceAccounts, setServiceAccounts] = useState<K8sServiceAccount[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchServiceAccounts = useCallback(async () => {
    // Demo mode returns demo data
    if (getDemoMode()) {
      setServiceAccounts(getDemoK8sServiceAccounts(cluster, namespace))
      setIsLoading(false)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (cluster) params.set('cluster', cluster)
      if (namespace) params.set('namespace', namespace)
      const { data } = await api.get<K8sServiceAccount[]>(`/api/rbac/service-accounts?${params}`)
      setServiceAccounts(data || [])
    } catch (err) {
      // Don't log or set error for expected failures (backend unavailable or timeout)
      const isExpectedFailure = err instanceof BackendUnavailableError ||
        (err instanceof Error && err.message.includes('Request timeout'))
      if (!isExpectedFailure) {
        setError('Failed to load service accounts')
        if (err instanceof Error && err.message) {
          console.warn('Failed to load service accounts:', err.message)
        }
      }
      // Fall back to demo data on any error
      setServiceAccounts(getDemoK8sServiceAccounts(cluster, namespace))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    fetchServiceAccounts()
  }, [fetchServiceAccounts])

  const createServiceAccount = useCallback(async (req: CreateServiceAccountRequest) => {
    try {
      const { data } = await api.post<K8sServiceAccount>('/api/rbac/service-accounts', req)
      setServiceAccounts((prev) => [...prev, data])
      return data
    } catch (err) {
      console.error('Failed to create service account:', err)
      throw err
    }
  }, [])

  return {
    serviceAccounts,
    isLoading,
    error,
    refetch: fetchServiceAccounts,
    createServiceAccount,
  }
}

/**
 * Hook for Kubernetes roles
 */
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
      const { data } = await api.get<K8sRole[]>(`/api/rbac/roles?${params}`)
      setRoles(data || [])
    } catch (err) {
      setError('Failed to load roles')
      console.error('Failed to load roles:', err)
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace, includeSystem])

  useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  return { roles, isLoading, error, refetch: fetchRoles }
}

/**
 * Hook for Kubernetes role bindings
 */
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
      const { data } = await api.get<K8sRoleBinding[]>(`/api/rbac/bindings?${params}`)
      setBindings(data || [])
    } catch (err) {
      setError('Failed to load role bindings')
      console.error('Failed to load role bindings:', err)
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace, includeSystem])

  useEffect(() => {
    fetchBindings()
  }, [fetchBindings])

  const createRoleBinding = useCallback(async (req: CreateRoleBindingRequest) => {
    try {
      await api.post('/api/rbac/bindings', req)
      await fetchBindings()
      return true
    } catch (err) {
      console.error('Failed to create role binding:', err)
      throw err
    }
  }, [fetchBindings])

  return {
    bindings,
    isLoading,
    error,
    refetch: fetchBindings,
    createRoleBinding,
  }
}

/**
 * Hook for current user's cluster permissions
 */
export function useClusterPermissions(cluster?: string) {
  const [permissions, setPermissions] = useState<ClusterPermissions[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPermissions = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = cluster ? `?cluster=${cluster}` : ''
      const { data } = await api.get<ClusterPermissions | ClusterPermissions[]>(
        `/api/rbac/permissions${params}`
      )
      setPermissions(Array.isArray(data) ? data : [data])
    } catch (err) {
      setError('Failed to load permissions')
      console.error('Failed to load permissions:', err)
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  return { permissions, isLoading, error, refetch: fetchPermissions }
}
