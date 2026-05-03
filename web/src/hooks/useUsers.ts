import { useState, useEffect, useCallback } from 'react'
import { api, isBackendUnavailable } from '../lib/api'
import { mapSettledWithConcurrency } from '../lib/utils/concurrency'
import { getDemoMode } from './useDemoMode'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_TOKEN } from '../lib/constants'
import { agentFetch } from './mcp/shared'
import { FETCH_DEFAULT_TIMEOUT_MS, RBAC_QUERY_TIMEOUT_MS } from '../lib/constants/network'
import { MS_PER_DAY, MS_PER_HOUR } from '../lib/constants/time'
import type {
  ConsoleUser,
  K8sServiceAccount,
  K8sRole,
  K8sRoleBinding,
  K8sUser,
  OpenShiftUser,
  ClusterPermissions,
  UserManagementSummary,
  UserRole,
  CreateServiceAccountRequest,
  CreateRoleBindingRequest } from '../types/users'

// agentAuthHeaders attaches the local-agent Bearer token when one is stored.
// The token is optional — the agent accepts unauthenticated requests from
// allowed origins when KC_AGENT_TOKEN is unset — so we simply omit the
// Authorization header when no token is configured. Mirrors authHeaders() in
// useWorkloads.ts.
function agentAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

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
      created_at: new Date(Date.now() - 90 * MS_PER_DAY).toISOString(),
      last_login: new Date(Date.now() - 2 * MS_PER_HOUR).toISOString() },
    {
      id: '2',
      github_id: '23456',
      github_login: 'developer-jane',
      email: 'jane@example.com',
      avatar_url: 'https://avatars.githubusercontent.com/u/23456?v=4',
      role: 'editor',
      onboarded: true,
      created_at: new Date(Date.now() - 60 * MS_PER_DAY).toISOString(),
      last_login: new Date(Date.now() - 5 * MS_PER_HOUR).toISOString() },
    {
      id: '3',
      github_id: '34567',
      github_login: 'viewer-bob',
      email: 'bob@example.com',
      role: 'viewer',
      onboarded: true,
      created_at: new Date(Date.now() - 30 * MS_PER_DAY).toISOString(),
      last_login: new Date(Date.now() - MS_PER_DAY).toISOString() },
    {
      id: '4',
      github_id: '45678',
      github_login: 'ops-engineer',
      email: 'ops@example.com',
      avatar_url: 'https://avatars.githubusercontent.com/u/45678?v=4',
      role: 'editor',
      onboarded: true,
      created_at: new Date(Date.now() - 45 * MS_PER_DAY).toISOString(),
      last_login: new Date(Date.now() - 1 * MS_PER_HOUR).toISOString() },
  ]
}

// Demo data for user management summary
function getDemoUserManagementSummary(): UserManagementSummary {
  return {
    consoleUsers: {
      total: 4,
      admins: 1,
      editors: 2,
      viewers: 1 },
    k8sServiceAccounts: {
      total: 11,
      clusters: ['prod-east', 'staging', 'dev-cluster'] },
    currentUserPermissions: [
      {
        cluster: 'prod-east',
        isClusterAdmin: true,
        canCreateServiceAccounts: true,
        canManageRBAC: true,
        canViewSecrets: true },
      {
        cluster: 'staging',
        isClusterAdmin: false,
        canCreateServiceAccounts: true,
        canManageRBAC: false,
        canViewSecrets: false },
      {
        cluster: 'dev-cluster',
        isClusterAdmin: true,
        canCreateServiceAccounts: true,
        canManageRBAC: true,
        canViewSecrets: true },
    ] }
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
      setUsers(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      // Don't fall back to demo data - show error state
      // Users will be empty, but the current user is displayed from auth context
      setError(err instanceof Error ? err.message : 'Failed to load users')
      setUsers([])
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const updateUserRole = async (userId: string, role: UserRole) => {
    await api.put(`/api/users/${userId}/role`, { role })
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role } : u))
    )
    return true
  }

  const deleteUser = async (userId: string) => {
    await api.delete(`/api/users/${userId}`)
    setUsers((prev) => prev.filter((u) => u.id !== userId))
    return true
  }

  return {
    users,
    isLoading,
    isRefreshing,
    error,
    refetch: fetchUsers,
    updateUserRole,
    deleteUser }
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
      // Fall back to demo data for summary if API unavailable
      // (summary includes K8s cluster stats which benefit from demo visualization)
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

// Demo data for OpenShift users
function getDemoOpenShiftUsers(cluster?: string): OpenShiftUser[] {
  if (!cluster) return []

  return [
    {
      name: 'admin',
      fullName: 'Cluster Admin',
      identities: ['htpasswd:admin'],
      groups: ['system:cluster-admins', 'system:authenticated'],
      cluster,
      createdAt: new Date(Date.now() - 90 * MS_PER_DAY).toISOString() },
    {
      name: 'developer',
      fullName: 'Dev User',
      identities: ['htpasswd:developer'],
      groups: ['developers', 'system:authenticated'],
      cluster,
      createdAt: new Date(Date.now() - 60 * MS_PER_DAY).toISOString() },
    {
      name: 'ops-user',
      fullName: 'Operations Engineer',
      identities: ['ldap:ops-user'],
      groups: ['operations', 'system:authenticated'],
      cluster,
      createdAt: new Date(Date.now() - 45 * MS_PER_DAY).toISOString() },
    {
      name: 'viewer',
      identities: ['htpasswd:viewer'],
      groups: ['viewers', 'system:authenticated'],
      cluster,
      createdAt: new Date(Date.now() - 30 * MS_PER_DAY).toISOString() },
  ]
}

// Demo data for all OpenShift users across multiple clusters
// Note: Keeping for future use when we want demo data for all clusters mode
function _getDemoAllOpenShiftUsers(clusters: string[]): OpenShiftUser[] {
  const allUsers: OpenShiftUser[] = []
  clusters.forEach(cluster => {
    allUsers.push(...getDemoOpenShiftUsers(cluster))
  })
  return allUsers
}
void _getDemoAllOpenShiftUsers // prevent unused warning

/**
 * Hook for OpenShift users (users.user.openshift.io)
 */
export function useOpenShiftUsers(cluster?: string) {
  const [users, setUsers] = useState<OpenShiftUser[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    if (!cluster) {
      setUsers([])
      return
    }

    // Clear old data immediately when fetching for new cluster
    setUsers([])
    setIsLoading(true)
    setError(null)
    try {
      // Always try API first - agent may be connected even in demo mode
      const { data } = await api.get<OpenShiftUser[]>(`/api/openshift/users?cluster=${cluster}`)
      setUsers(Array.isArray(data) ? data : [])
    } catch {
      // Fall back to demo data when API is unavailable (backend not running, no auth, etc.)
      setUsers(getDemoOpenShiftUsers(cluster))
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  return { users, isLoading, error, refetch: fetchUsers }
}

/**
 * Hook for fetching OpenShift users from ALL clusters at once
 * Returns all users with cluster field populated, for local filtering
 */
export function useAllOpenShiftUsers(clusters: Array<{ name: string }>) {
  const [users, setUsers] = useState<OpenShiftUser[]>([])
  const [isLoading, setIsLoading] = useState(true) // true initially
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedClusters, setFailedClusters] = useState<string[]>([])

  const fetchAllUsers = useCallback(async () => {
    if (clusters.length === 0) {
      setUsers([])
      setIsLoading(false)
      return
    }

    // Only show loading spinner on initial load, use refreshing for subsequent fetches
    setUsers(prev => {
      if (prev.length === 0) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
      return prev
    })
    setError(null)
    setFailedClusters([])

    const allUsers: OpenShiftUser[] = []
    const failed: string[] = []

    // Fetch from all clusters with bounded concurrency
    const results = await mapSettledWithConcurrency(
      clusters,
      async (cluster) => {
        try {
          const { data } = await api.get<OpenShiftUser[]>(`/api/openshift/users?cluster=${cluster.name}`)
          return { cluster: cluster.name, users: Array.isArray(data) ? data : [] }
        } catch {
          // Mark cluster as failed but don't break the whole fetch
          return { cluster: cluster.name, users: [] as OpenShiftUser[], failed: true }
        }
      },
    )

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const { cluster, users: clusterUsers, failed: clusterFailed } = result.value as { cluster: string; users: OpenShiftUser[]; failed?: boolean }
        if (clusterFailed) {
          failed.push(cluster)
          // Add demo data for failed clusters
          allUsers.push(...getDemoOpenShiftUsers(cluster))
        } else {
          allUsers.push(...clusterUsers)
        }
      }
    })

    setUsers(allUsers)
    setFailedClusters(failed)
    setIsLoading(false)
    setIsRefreshing(false)
  }, [clusters])

  useEffect(() => {
    fetchAllUsers()
  }, [fetchAllUsers])

  return { users, isLoading, isRefreshing, error, failedClusters, refetch: fetchAllUsers }
}

/**
 * Hook for Kubernetes RBAC users (legacy - use useOpenShiftUsers for OpenShift clusters)
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
      setUsers(Array.isArray(data) ? data : [])
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

// Demo data for K8s service accounts - generates for the specified cluster
function getDemoK8sServiceAccounts(cluster?: string, namespace?: string): K8sServiceAccount[] {
  // If no cluster specified, return empty (user needs to select a cluster)
  if (!cluster) return []

  // Generate demo SAs for the selected cluster with varied namespaces
  const accounts: K8sServiceAccount[] = [
    { name: 'default', namespace: 'default', cluster, roles: ['view'] },
    { name: 'admin-sa', namespace: 'default', cluster, roles: ['admin', 'cluster-admin'] },
    { name: 'prometheus', namespace: 'monitoring', cluster, roles: ['cluster-view'] },
    { name: 'grafana', namespace: 'monitoring', cluster, roles: ['view'] },
    { name: 'argocd', namespace: 'argocd', cluster, roles: ['cluster-admin'] },
    { name: 'builder', namespace: 'kube-system', cluster, roles: ['edit'] },
  ]

  // Filter by namespace only if specified
  if (namespace) {
    return accounts.filter(sa => sa.namespace === namespace)
  }
  return accounts
}

// Demo data for all service accounts across multiple clusters
// Note: Keeping for future use when we want demo data for all clusters mode
function _getDemoAllK8sServiceAccounts(clusters: string[]): K8sServiceAccount[] {
  const allSAs: K8sServiceAccount[] = []
  clusters.forEach(cluster => {
    allSAs.push(...getDemoK8sServiceAccounts(cluster))
  })
  return allSAs
}
void _getDemoAllK8sServiceAccounts // prevent unused warning

/**
 * Hook for Kubernetes service accounts
 */
export function useK8sServiceAccounts(cluster?: string, namespace?: string) {
  const [serviceAccounts, setServiceAccounts] = useState<K8sServiceAccount[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchServiceAccounts = useCallback(async () => {
    // Don't fetch if no cluster is selected - fetching all clusters is too slow
    if (!cluster) {
      setServiceAccounts([])
      setIsLoading(false)
      setError(null)
      return
    }

    // Clear old data immediately when fetching for new cluster/namespace
    setServiceAccounts([])
    setIsLoading(true)
    setError(null)
    try {
      // Always try API first - agent may be connected even in demo mode
      const params = new URLSearchParams()
      params.set('cluster', cluster)
      if (namespace) params.set('namespace', namespace)
      const { data } = await api.get<K8sServiceAccount[]>(`/api/rbac/service-accounts?${params}`, { timeout: RBAC_QUERY_TIMEOUT_MS })
      setServiceAccounts(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err: unknown) {
      // Set error message for unreachable clusters
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch service accounts'
      if (errorMsg.includes('connection refused') || errorMsg.includes('unreachable')) {
        setError(`Cluster ${cluster} is not reachable from the backend`)
      }
      // Fall back to demo data when API is unavailable
      setServiceAccounts(getDemoK8sServiceAccounts(cluster, namespace))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    fetchServiceAccounts()
  }, [fetchServiceAccounts])

  const createServiceAccount = async (req: CreateServiceAccountRequest) => {
    // Creating a ServiceAccount is a user-initiated mutation on a managed
    // cluster, so it must run under the user's kubeconfig via kc-agent, not
    // the backend pod ServiceAccount. See #7993 Phase 1.5 PR A.
    const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/serviceaccounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...agentAuthHeaders() },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'unknown error' }))
      throw new Error(errorData.error || 'Failed to create service account')
    }
    const data = (await res.json()) as K8sServiceAccount
    setServiceAccounts((prev) => [...prev, data])
    return data
  }

  return {
    serviceAccounts,
    isLoading,
    error,
    refetch: fetchServiceAccounts,
    createServiceAccount }
}

/**
 * Hook for fetching service accounts from ALL clusters at once
 * Returns all SAs with cluster field populated, for local filtering
 */
export function useAllK8sServiceAccounts(clusters: Array<{ name: string }>) {
  const [serviceAccounts, setServiceAccounts] = useState<K8sServiceAccount[]>([])
  const [isLoading, setIsLoading] = useState(true) // true initially
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedClusters, setFailedClusters] = useState<string[]>([])

  const fetchAllServiceAccounts = useCallback(async () => {
    if (clusters.length === 0) {
      setServiceAccounts([])
      setIsLoading(false)
      return
    }

    // Only show loading spinner on initial load, use refreshing for subsequent fetches
    setServiceAccounts(prev => {
      if (prev.length === 0) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
      return prev
    })
    setError(null)
    setFailedClusters([])

    const allSAs: K8sServiceAccount[] = []
    const failed: string[] = []

    // Fetch from all clusters with bounded concurrency
    const results = await mapSettledWithConcurrency(
      clusters,
      async (cluster) => {
        try {
          const { data } = await api.get<K8sServiceAccount[]>(`/api/rbac/service-accounts?cluster=${cluster.name}`, { timeout: RBAC_QUERY_TIMEOUT_MS })
          return { cluster: cluster.name, sas: Array.isArray(data) ? data : [] }
        } catch {
          // Mark cluster as failed but don't break the whole fetch
          return { cluster: cluster.name, sas: [] as K8sServiceAccount[], failed: true }
        }
      },
    )

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const { cluster, sas, failed: clusterFailed } = result.value as { cluster: string; sas: K8sServiceAccount[]; failed?: boolean }
        if (clusterFailed) {
          failed.push(cluster)
          // Add demo data for failed clusters
          allSAs.push(...getDemoK8sServiceAccounts(cluster))
        } else {
          allSAs.push(...sas)
        }
      }
    })

    setServiceAccounts(allSAs)
    setFailedClusters(failed)
    setIsLoading(false)
    setIsRefreshing(false)
  }, [clusters])

  useEffect(() => {
    fetchAllServiceAccounts()
  }, [fetchAllServiceAccounts])

  return { serviceAccounts, isLoading, isRefreshing, error, failedClusters, refetch: fetchAllServiceAccounts }
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
      const { data } = await api.get<K8sRole[]>(`/api/rbac/roles?${params}`, { timeout: RBAC_QUERY_TIMEOUT_MS })
      setRoles(Array.isArray(data) ? data : [])
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
      const { data } = await api.get<K8sRoleBinding[]>(`/api/rbac/bindings?${params}`, { timeout: RBAC_QUERY_TIMEOUT_MS })
      setBindings(Array.isArray(data) ? data : [])
    } catch {
      // Silently fail - backend may be unavailable
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace, includeSystem])

  useEffect(() => {
    fetchBindings()
  }, [fetchBindings])

  const createRoleBinding = async (req: CreateRoleBindingRequest) => {
    // Creating a RoleBinding is a user-initiated RBAC mutation, so it must
    // run under the user's kubeconfig via kc-agent, not the backend pod
    // ServiceAccount. See #7993 Phase 1.5 PR A.
    const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/rolebindings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...agentAuthHeaders() },
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

  return {
    bindings,
    isLoading,
    error,
    refetch: fetchBindings,
    createRoleBinding }
}

/**
 * Hook for current user's cluster permissions
 */
export function useClusterPermissions(cluster?: string) {
  const [permissions, setPermissions] = useState<ClusterPermissions[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPermissions = useCallback(async () => {
    // Skip in demo / Netlify mode — kc-agent is not running.
    if (isBackendUnavailable()) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      // #7993 Phase 6: route through kc-agent so SelfSubjectAccessReviews run
      // under the user's kubeconfig instead of the backend pod ServiceAccount.
      // Reuse agentAuthHeaders() so the Authorization header is omitted when
      // no token is configured (agent accepts unauthenticated requests from
      // allowed origins when KC_AGENT_TOKEN is unset). Sending an empty
      // Authorization header would fail token validation on the agent side.
      const params = cluster ? `?cluster=${cluster}` : ''
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/rbac/permissions${params}`, {
        headers: agentAuthHeaders(),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (!response.ok) {
        setIsLoading(false)
        return
      }
      const data = (await response.json()) as ClusterPermissions | ClusterPermissions[]
      setPermissions(Array.isArray(data) ? data : [data])
    } catch {
      // Silently fail - kc-agent may be unavailable
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  return { permissions, isLoading, error, refetch: fetchPermissions }
}

export const __testables = {
  agentAuthHeaders,
  getDemoConsoleUsers,
  getDemoUserManagementSummary,
}
