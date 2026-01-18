import { useState, useEffect, useCallback, useMemo } from 'react'

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

    setLoading(true)
    setError(null)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/api/permissions/summary`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch permissions: ${response.status}`)
      }

      const data: PermissionsSummary = await response.json()
      permissionsCache = data
      cacheTime = Date.now()
      setPermissions(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch permissions'
      setError(message)
      console.error('[usePermissions] Error:', message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  // Check if user is cluster admin for a specific cluster
  const isClusterAdmin = useCallback((cluster: string): boolean => {
    if (!permissions?.clusters[cluster]) return false
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
    if (!permissions) return []
    return Object.keys(permissions.clusters)
  }, [permissions])

  // Check if user has limited access (not cluster-admin) on any cluster
  const hasLimitedAccess = useMemo(() => {
    if (!permissions) return false
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
      })

      if (!response.ok) {
        throw new Error(`Failed to check permission: ${response.status}`)
      }

      const data: CanIResponse = await response.json()
      setResult(data)
      return data
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check permission'
      setError(message)
      console.error('[useCanI] Error:', message)
      throw err
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
