import { useState, useEffect, useCallback, useMemo } from 'react'
import { isBackendUnavailable } from '../lib/api'

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

const CACHE_TTL = 60000 // 1 minute cache for permissions
const API_BASE = import.meta.env.VITE_API_URL || ''

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
    if (!forceRefresh && permissionsCache && Date.now() - cacheTime < CACHE_TTL) {
      setPermissions(permissionsCache)
      setLoading(false)
      return
    }

    const token = localStorage.getItem('token')

    // Skip if backend is unavailable or using demo token
    if (isBackendUnavailable() || !token || token === 'demo-token') {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${API_BASE}/api/permissions/summary`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      })

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
  // If permissions data is not available for a cluster, assume admin (don't show warning)
  const isClusterAdmin = useCallback((cluster: string): boolean => {
    if (!permissions?.clusters[cluster]) return true // Assume admin if no data
    return permissions.clusters[cluster].isClusterAdmin
  }, [permissions])

  // Check if user has a specific permission
  const hasPermission = useCallback((
    cluster: string,
    permission: keyof Omit<ClusterPermissions, 'accessibleNamespaces'>
  ): boolean => {
    if (!permissions?.clusters[cluster]) return false
    return permissions.clusters[cluster][permission]
  }, [permissions])

  // Check if user can access a namespace
  const canAccessNamespace = useCallback((cluster: string, namespace: string): boolean => {
    if (!permissions?.clusters[cluster]) return false
    const clusterPerms = permissions.clusters[cluster]
    // Cluster admins can access all namespaces
    if (clusterPerms.isClusterAdmin) return true
    return clusterPerms.accessibleNamespaces.includes(namespace)
  }, [permissions])

  // Get accessible namespaces for a cluster
  const getAccessibleNamespaces = useCallback((cluster: string): string[] => {
    if (!permissions?.clusters[cluster]) return []
    return permissions.clusters[cluster].accessibleNamespaces
  }, [permissions])

  // Get permissions for a specific cluster
  const getClusterPermissions = useCallback((cluster: string): ClusterPermissions | null => {
    if (!permissions?.clusters[cluster]) return null
    return permissions.clusters[cluster]
  }, [permissions])

  // Get all clusters
  const clusters = useMemo(() => {
    if (!permissions?.clusters) return []
    return Object.keys(permissions.clusters)
  }, [permissions])

  // Check if user has limited access (not cluster-admin) on any cluster
  const hasLimitedAccess = useMemo(() => {
    if (!permissions?.clusters) return false
    return Object.values(permissions.clusters).some(p => !p.isClusterAdmin)
  }, [permissions])

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
    hasLimitedAccess,
  }
}

/**
 * Hook to perform individual permission checks (SelfSubjectAccessReview)
 */
export function useCanI() {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<CanIResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkPermission = useCallback(async (request: CanIRequest): Promise<CanIResponse> => {
    // Skip if backend is known to be unavailable
    if (isBackendUnavailable()) {
      return { allowed: true } // Assume allowed in demo mode
    }

    setChecking(true)
    setError(null)
    setResult(null)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/api/rbac/can-i`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        // Silently fail on error - assume allowed in demo mode
        return { allowed: true }
      }

      const data: CanIResponse = await response.json()
      setResult(data)
      return data
    } catch {
      // Silently fail - backend may be unavailable in demo mode
      return { allowed: true }
    } finally {
      setChecking(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return {
    checkPermission,
    checking,
    result,
    error,
    reset,
  }
}

/**
 * Clear the permissions cache (useful when logging out or switching users)
 */
export function clearPermissionsCache() {
  permissionsCache = null
  cacheTime = 0
}
