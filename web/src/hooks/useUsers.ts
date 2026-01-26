import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
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

// Demo data for console users
function getDemoConsoleUsers(): ConsoleUser[] {
  return [
    {
      id: '1',
      github_id: '12345',
      github_login: 'admin-user',
      email: 'admin@example.com',
      avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
      role: 'admin',
      onboarded: true,
      created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      last_login: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '2',
      github_id: '23456',
      github_login: 'developer-jane',
      email: 'jane@example.com',
      avatar_url: 'https://avatars.githubusercontent.com/u/23456?v=4',
      role: 'editor',
      onboarded: true,
      created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      last_login: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '3',
      github_id: '34567',
      github_login: 'viewer-bob',
      email: 'bob@example.com',
      role: 'viewer',
      onboarded: true,
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      last_login: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '4',
      github_id: '45678',
      github_login: 'ops-engineer',
      email: 'ops@example.com',
      avatar_url: 'https://avatars.githubusercontent.com/u/45678?v=4',
      role: 'editor',
      onboarded: true,
      created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      last_login: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    },
  ]
}

// Demo data for user management summary
function getDemoUserManagementSummary(): UserManagementSummary {
  return {
    consoleUsers: {
      total: 4,
      admins: 1,
      editors: 2,
      viewers: 1,
    },
    k8sServiceAccounts: {
      total: 11,
      clusters: ['prod-east', 'staging', 'dev-cluster'],
    },
    currentUserPermissions: [
      {
        cluster: 'prod-east',
        isClusterAdmin: true,
        canCreateServiceAccounts: true,
        canManageRBAC: true,
        canViewSecrets: true,
      },
      {
        cluster: 'staging',
        isClusterAdmin: false,
        canCreateServiceAccounts: true,
        canManageRBAC: false,
        canViewSecrets: false,
      },
      {
        cluster: 'dev-cluster',
        isClusterAdmin: true,
        canCreateServiceAccounts: true,
        canManageRBAC: true,
        canViewSecrets: true,
      },
    ],
  }
}

/**
 * Hook for managing console users
 */
export function useConsoleUsers() {
  const [users, setUsers] = useState<ConsoleUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    // Demo mode returns demo data immediately
    if (getDemoMode()) {
      setUsers(getDemoConsoleUsers())
      setIsLoading(false)
      setIsRefreshing(false)
      setError(null)
      return
    }

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
    } catch {
      // Fall back to demo data if API fails
      setUsers(getDemoConsoleUsers())
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
      // Silently fail - backend may be unavailable
      throw err
    }
  }, [])

  const deleteUser = useCallback(async (userId: string) => {
    try {
      await api.delete(`/api/users/${userId}`)
      setUsers((prev) => prev.filter((u) => u.id !== userId))
      return true
    } catch (err) {
      // Silently fail - backend may be unavailable
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
    // Demo mode returns demo data immediately
    if (getDemoMode()) {
      setSummary(getDemoUserManagementSummary())
      setIsLoading(false)
      setIsRefreshing(false)
      setError(null)
      return
    }

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
    } catch {
      // Fall back to demo data if API fails
      setSummary(getDemoUserManagementSummary())
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
    } catch {
      // Silently fail - backend may be unavailable
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
    } catch {
      // Silently fail - fall back to demo data
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
      // Silently fail - backend may be unavailable
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
    } catch {
      // Silently fail - backend may be unavailable
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
    } catch {
      // Silently fail - backend may be unavailable
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
      // Silently fail - backend may be unavailable
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
    } catch {
      // Silently fail - backend may be unavailable
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  return { permissions, isLoading, error, refetch: fetchPermissions }
}
