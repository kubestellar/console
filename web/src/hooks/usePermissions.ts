import { useState, useEffect, useCallback } from 'react'
import { isBackendUnavailable } from '../lib/api'
import { STORAGE_KEY_TOKEN } from '../lib/constants'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants/network'

export interface ClusterPermissions {
  isClusterAdmin: boolean
  canListNodes: boolean
  canListNamespaces: boolean
  canCreateNamespaces: boolean
  canManageRBAC: boolean
  canViewSecrets: boolean
  accessibleNamespaces: string[]
}

export interface PermissionsSummary {
  clusters: Record<string, ClusterPermissions>
}

export interface CanIRequest {
  cluster: string
  verb: string
  resource: string
  namespace?: string
  group?: string
  subresource?: string
  name?: string
  groups?: string[]  // User groups for group-based RBAC (common in OpenShift)
}

export interface CanIResponse {
  allowed: boolean
  reason?: string
}

/** Cache TTL: 1 minute */
const CACHE_TTL_MS = 60_000
/** Per-request timeout for permission checks (ms) */
const PERMISSION_REQUEST_TIMEOUT_MS = 5000

// Cache for permissions to avoid repeated API calls
let permissionsCache: PermissionsSummary | null = null
let cacheTime = 0

/**
 * Hook to fetch and manage user permissions across clusters
 */
export function usePermissions() {
  const [permissions, setPermissions] = useState<PermissionsSummary | null>(permissionsCache)
  const [loading, setLoading] = useState(!permissionsCache)
  const [error, setError] = useState<string | null>(null)

  // Fetch permissions summary
  const fetchPermissions = useCallback(async (forceRefresh = false) => {
    // Check cache first
    if (!forceRefresh && permissionsCache && Date.now() - cacheTime < CACHE_TTL_MS) {
      setPermissions(permissionsCache)
      setLoading(false)
      return
    }

    const token = localStorage.getItem(STORAGE_KEY_TOKEN)

    // Skip if backend is unavailable or using demo token
    if (isBackendUnavailable() || !token || token === 'demo-token') {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // #7993 Phase 6: route permissions summary through kc-agent so the
      // SelfSubjectAccessReviews run under the user's kubeconfig rather than
      // the backend pod ServiceAccount when console is deployed in-cluster.
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/permissions/summary`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(PERMISSION_REQUEST_TIMEOUT_MS) })

      if (!response.ok) {
        // Don't throw on 500 - just silently fail
        setLoading(false)
        return
      }

      const data: PermissionsSummary = await response.json()
      permissionsCache = data
      cacheTime = Date.now()
      setPermissions(data)
    } catch {
      // Silently fail when backend is unavailable - this is expected in demo mode
      // The UI will work with default/demo permissions
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  // Check if user is cluster admin for a specific cluster
  // SECURITY: If permissions data is not available (fetch failed, network error),
  // deny access (fail-closed). Only assume admin when backend is explicitly
  // unavailable (demo mode) or no token is present.
  const isClusterAdmin = (cluster: string): boolean => {
    if (!permissions?.clusters?.[cluster]) return false // Fail-closed: deny when no data
    return permissions.clusters[cluster].isClusterAdmin
  }

  // Check if user has a specific permission
  const hasPermission = (
    cluster: string,
    permission: keyof Omit<ClusterPermissions, 'accessibleNamespaces'>
  ): boolean => {
    if (!permissions?.clusters?.[cluster]) return false
    return permissions.clusters[cluster][permission]
  }

  // Check if user can access a namespace
  const canAccessNamespace = (cluster: string, namespace: string): boolean => {
    if (!permissions?.clusters?.[cluster]) return false
    const clusterPerms = permissions.clusters[cluster]
    // Cluster admins can access all namespaces
    if (clusterPerms.isClusterAdmin) return true
    return clusterPerms.accessibleNamespaces.includes(namespace)
  }

  // Get accessible namespaces for a cluster
  const getAccessibleNamespaces = (cluster: string): string[] => {
    if (!permissions?.clusters?.[cluster]) return []
    return permissions.clusters[cluster].accessibleNamespaces
  }

  // Get permissions for a specific cluster
  const getClusterPermissions = (cluster: string): ClusterPermissions | null => {
    if (!permissions?.clusters?.[cluster]) return null
    return permissions.clusters[cluster]
  }

  // Get all clusters
  const clusters = (() => {
    if (!permissions?.clusters) return []
    return Object.keys(permissions.clusters)
  })()

  // Check if user has limited access (not cluster-admin) on any cluster
  const hasLimitedAccess = (() => {
    if (!permissions?.clusters) return false
    return Object.values(permissions.clusters).some(p => !p.isClusterAdmin)
  })()

  return {
    permissions,
    loading,
    error,
    refresh: () => fetchPermissions(true),
    isClusterAdmin,
    hasPermission,
    canAccessNamespace,
    getAccessibleNamespaces,
    getClusterPermissions,
    clusters,
    hasLimitedAccess }
}

/**
 * Hook to perform individual permission checks (SelfSubjectAccessReview)
 */
export function useCanI() {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<CanIResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkPermission = async (request: CanIRequest): Promise<CanIResponse> => {
    // Skip if backend is known to be unavailable (demo mode)
    if (isBackendUnavailable()) {
      return { allowed: true } // Assume allowed in demo mode
    }

    setChecking(true)
    setError(null)
    setResult(null)

    try {
      const token = localStorage.getItem(STORAGE_KEY_TOKEN)
      // #7993 Phase 6: SelfSubjectAccessReview must run under the caller's
      // kubeconfig, not the backend pod ServiceAccount — otherwise in-cluster
      // it answers "can the pod SA do X?" instead of "can the user do X?".
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/rbac/can-i`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(PERMISSION_REQUEST_TIMEOUT_MS) })

      if (!response.ok) {
        // SECURITY: fail-closed — deny permission when API returns error
        const denied: CanIResponse = { allowed: false, reason: 'Permission check failed (API error)' }
        setResult(denied)
        return denied
      }

      const data: CanIResponse = await response.json()
      setResult(data)
      return data
    } catch {
      // SECURITY: fail-closed — deny permission on network/timeout error
      const denied: CanIResponse = { allowed: false, reason: 'Permission check failed (network error)' }
      setResult(denied)
      return denied
    } finally {
      setChecking(false)
    }
  }

  const reset = () => {
    setResult(null)
    setError(null)
  }

  return {
    checkPermission,
    checking,
    result,
    error,
    reset }
}

/**
 * Clear the permissions cache (useful when logging out or switching users)
 */
export function clearPermissionsCache() {
  permissionsCache = null
  cacheTime = 0
}
