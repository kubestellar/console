import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Folder,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  ChevronDown,
  ChevronRight,
  X,
  AlertTriangle,
  Hourglass,
  Layers,
  Server,
  UserPlus,
  WifiOff
} from 'lucide-react'
import { Button } from '../ui/Button'
import { useClusters } from '../../hooks/useMCP'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { useModalState } from '../../lib/modals'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { ClusterBadge } from '../ui/ClusterBadge'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'
import { api, authFetch } from '../../lib/api'
import { useToast } from '../ui/Toast'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../lib/auth'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants'
import { NAMESPACE_ABORT_TIMEOUT_MS } from '../../lib/constants/network'
import { NamespaceCard, NamespaceCardSkeleton } from './NamespaceCard'
import { DeleteConfirmModal } from './DeleteConfirmModal'
import { CreateNamespaceModal } from './CreateNamespaceModal'
import { GrantAccessModal } from './GrantAccessModal'
import type { NamespaceDetails, NamespaceAccessEntry } from './types'

type GroupByMode = 'cluster' | 'type'

// Cache for namespace data per cluster - persists across filter changes
const namespaceCache = new Map<string, NamespaceDetails[]>()

export function NamespaceManager() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { clusters, deduplicatedClusters, isLoading: clustersLoading } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  // Note: We don't check permissions upfront - the API will return auth errors for inaccessible clusters
  const [allNamespaces, setAllNamespaces] = useState<NamespaceDetails[]>([])
  const [loading, setLoading] = useState(false)
  // Track which clusters are still loading (for progressive loading indicator)
  const [loadingClusters, setLoadingClusters] = useState<Set<string>>(new Set())
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNamespace, setSelectedNamespace] = useState<NamespaceDetails | null>(null)
  const [accessEntries, setAccessEntries] = useState<NamespaceAccessEntry[]>([])
  const [accessLoading, setAccessLoading] = useState(false)
  const { isOpen: showCreateModal, open: openCreateModal, close: closeCreateModal } = useModalState()
  const { isOpen: showGrantAccessModal, open: openGrantAccessModal, close: closeGrantAccessModal } = useModalState()
  const [namespaceToDelete, setNamespaceToDelete] = useState<NamespaceDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Group by cluster by default for better organization
  const [groupBy, setGroupBy] = useState<GroupByMode>('cluster')
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set())

  // Track if we've fetched to prevent infinite loops
  const hasFetchedRef = useRef(false)
  const lastFetchKeyRef = useRef<string>('')

  // Get all available clusters
  const allClusterNames = deduplicatedClusters.map(c => c.name)

  // Get target clusters based on global filter selection
  // We don't check permissions upfront - let the API handle auth errors per-cluster
  const targetClusters = isAllClustersSelected
    ? deduplicatedClusters.map(c => c.name)
    : selectedClusters


  // Filter namespaces from cache based on selected clusters (no refetch needed)
  const namespaces = allNamespaces.filter(ns => targetClusters.includes(ns.cluster))

  // Fetch namespaces from all available clusters and cache them
  // Uses progressive loading - updates UI as each cluster completes
  const fetchNamespaces = useCallback(async (force = false) => {
    // Determine which clusters to fetch
    const clustersToFetch = force
      ? allClusterNames // Force refresh fetches all clusters
      : allClusterNames.filter(c => !namespaceCache.has(c)) // Only fetch uncached clusters

    // If nothing to fetch and we have cache, use cached data
    if (clustersToFetch.length === 0 && !force) {
      // Build allNamespaces from cache
      const cachedNamespaces: NamespaceDetails[] = []
      for (const cluster of allClusterNames) {
        const cached = namespaceCache.get(cluster)
        if (cached) cachedNamespaces.push(...cached)
      }
      setAllNamespaces(cachedNamespaces)
      return
    }

    // Prevent infinite loops
    const fetchKey = [...clustersToFetch].sort().join(',')
    if (!force && lastFetchKeyRef.current === fetchKey && hasFetchedRef.current) {
      return
    }

    if (allClusterNames.length === 0) {
      setAllNamespaces([])
      return
    }

    hasFetchedRef.current = true
    lastFetchKeyRef.current = fetchKey
    setLoading(true)
    setLoadingClusters(new Set(clustersToFetch))
    setError(null)

    const failedClusters: string[] = []

    // Helper to update state progressively
    const updateNamespacesFromCache = () => {
      const newAllNamespaces: NamespaceDetails[] = []
      for (const cluster of allClusterNames) {
        const cached = namespaceCache.get(cluster)
        if (cached) newAllNamespaces.push(...cached)
      }
      setAllNamespaces(newAllNamespaces)
    }

    // Fetch namespaces from clusters progressively (not waiting for all)
    const fetchPromises = clustersToFetch.map(async (cluster) => {
      try {
        let clusterNamespaces: NamespaceDetails[] = []

        // Always try local agent first (works without backend auth)
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), NAMESPACE_ABORT_TIMEOUT_MS)
          const response = await fetch(
            `${LOCAL_AGENT_HTTP_URL}/namespaces?cluster=${encodeURIComponent(cluster)}`,
            { signal: controller.signal, headers: { 'Accept': 'application/json' } }
          )
          clearTimeout(timeoutId)

          if (response.ok) {
            const data = await response.json()
            if (data.namespaces && Array.isArray(data.namespaces)) {
              clusterNamespaces = data.namespaces.map((ns: { name: string; status?: string; labels?: Record<string, string>; createdAt?: string }) => ({
                name: ns.name,
                cluster,
                status: ns.status || 'Active',
                labels: ns.labels,
                createdAt: ns.createdAt || new Date().toISOString()
              }))
            }
          }
        } catch {
          // Local agent failed, will fall back to API
        }

        // Fall back to API if local agent didn't return data
        if (clusterNamespaces.length === 0) {
          try {
            const response = await api.get<{ pods: Array<{ namespace: string; status: string }> }>(
              `${LOCAL_AGENT_HTTP_URL}/pods?cluster=${encodeURIComponent(cluster)}&limit=1000`
            )

            // Extract unique namespaces from pods
            const nsSet = new Set<string>()
            response.data.pods?.forEach(pod => {
              if (pod.namespace) nsSet.add(pod.namespace)
            })

            nsSet.forEach(ns => {
              clusterNamespaces.push({
                name: ns,
                cluster,
                status: 'Active',
                createdAt: new Date().toISOString()
              })
            })
          } catch {
            // API also failed - cluster is likely unreachable
          }
        }

        // Only cache if we got data
        if (clusterNamespaces.length > 0) {
          namespaceCache.set(cluster, clusterNamespaces)
        }

        // Update UI progressively as each cluster completes
        setLoadingClusters(prev => {
          const next = new Set(prev)
          next.delete(cluster)
          return next
        })
        updateNamespacesFromCache()
      } catch {
        // Don't fail completely, just note which clusters failed
        failedClusters.push(cluster)
        // DON'T cache empty arrays on failure - allow retry next time
        // Update loading state even on failure
        setLoadingClusters(prev => {
          const next = new Set(prev)
          next.delete(cluster)
          return next
        })
      }
    })

    // Wait for all to complete before marking fully done
    await Promise.all(fetchPromises)

    // Final update from cache
    updateNamespacesFromCache()

    // Check actual cache size, not stale state
    let totalCachedNamespaces = 0
    for (const clusterName of allClusterNames) {
      const cached = namespaceCache.get(clusterName)
      if (cached) totalCachedNamespaces += cached.length
    }

    // Only show error if ALL clusters failed (no namespaces at all)
    if (failedClusters.length > 0 && totalCachedNamespaces === 0) {
      setError(`Unable to connect to clusters. Check that the KC agent is running.`)
    } else {
      // Clear any previous error since we have data
      setError(null)
    }

    setLoading(false)
    setLoadingClusters(new Set())
    setLastUpdated(new Date())
  }, [allClusterNames])

  const handleRefreshNamespaces = () => fetchNamespaces(true)
  const { showIndicator, triggerRefresh } = useRefreshIndicator(handleRefreshNamespaces)
  const isFetching = loading || showIndicator

  const fetchAccess = useCallback(async (namespace: NamespaceDetails) => {
    setAccessLoading(true)
    try {
      const response = await api.get<{ bindings: typeof accessEntries }>(`/api/namespaces/${encodeURIComponent(namespace.name)}/access?cluster=${encodeURIComponent(namespace.cluster)}`)
      setAccessEntries(response.data?.bindings || [])
    } catch (err) {
      console.error('Failed to fetch access:', err)
      setAccessEntries([])
      const message = err instanceof Error && err.message?.includes('403')
        ? t('namespaces.adminAccessRequired', 'Admin access required to view namespace details')
        : t('namespaces.fetchAccessFailed', 'Failed to fetch namespace access')
      showToast(message, 'error')
    } finally {
      setAccessLoading(false)
    }
  }, [showToast, t])

  // Initial fetch when clusters are loaded - fetches ALL clusters to populate cache
  // Subsequent filter changes will just filter cached data, no refetch needed
  useEffect(() => {
    // Only fetch if we have clusters loaded
    if (clusters.length > 0) {
      fetchNamespaces()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters.length])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchNamespaces(true)
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchNamespaces])

  useEffect(() => {
    if (selectedNamespace && isAdmin) {
      fetchAccess(selectedNamespace)
    }
  }, [selectedNamespace, fetchAccess, isAdmin])

  const filteredNamespaces = namespaces.filter(ns =>
    ns.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ns.cluster.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Filter out system namespaces
  const userNamespaces = filteredNamespaces.filter(ns =>
    !ns.name.startsWith('kube-') &&
    !ns.name.startsWith('openshift-') &&
    ns.name !== 'default'
  )

  const systemNamespaces = filteredNamespaces.filter(ns =>
    ns.name.startsWith('kube-') ||
    ns.name.startsWith('openshift-') ||
    ns.name === 'default'
  )

  const handleDeleteNamespace = async (ns: NamespaceDetails) => {
    setNamespaceToDelete(ns)
  }

  const confirmDeleteNamespace = async () => {
    if (!namespaceToDelete) return

    try {
      // #7993 Phase 2: namespace delete goes through kc-agent under the
      // user's kubeconfig. kc-agent takes `name` as a query parameter since
      // it uses the net/http mux (no URL path parameters).
      const params = new URLSearchParams({
        cluster: namespaceToDelete.cluster,
        name: namespaceToDelete.name,
      })
      // #8034 Copilot followup: use authFetch() which already injects the
      // Bearer token (skipping DEMO_TOKEN_VALUE) and applies the default
      // fetch timeout, instead of a per-file agentAuthHeaders() helper.
      const res = await authFetch(`${LOCAL_AGENT_HTTP_URL}/namespaces?${params}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'unknown error' }))
        throw new Error(errorData.error || 'Failed to delete namespace')
      }
      // Clear cache for this cluster and refresh
      namespaceCache.delete(namespaceToDelete.cluster)
      fetchNamespaces(true)
      if (selectedNamespace?.name === namespaceToDelete.name && selectedNamespace?.cluster === namespaceToDelete.cluster) {
        setSelectedNamespace(null)
      }
      setNamespaceToDelete(null)
    } catch (err) {
      console.error('Failed to delete namespace:', err)
      setError('Failed to delete namespace')
      showToast('Failed to delete namespace', 'error')
      setNamespaceToDelete(null)
    }
  }

  const handleRevokeAccess = async (binding: NamespaceAccessEntry) => {
    if (!isAdmin) return
    if (!selectedNamespace) return

    if (!confirm(`Revoke access for ${binding.subjectName}?`)) {
      return
    }

    try {
      // Revoking namespace access deletes a RoleBinding on a managed cluster,
      // so it must run under the user's kubeconfig via kc-agent, not the
      // backend pod ServiceAccount. See #7993 Phase 1.5 PR A. The backend
      // DELETE /api/namespaces/:name/access/:binding route still exists and
      // will be removed as part of Phase 2 once all frontend callers are
      // migrated — this switches the only caller over.
      const params = new URLSearchParams({
        cluster: selectedNamespace.cluster,
        namespace: selectedNamespace.name,
        name: binding.bindingName,
      })
      // #8034 Copilot followup: use authFetch() which already injects the
      // Bearer token and applies the default fetch timeout.
      const res = await authFetch(`${LOCAL_AGENT_HTTP_URL}/rolebindings?${params}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'unknown error' }))
        throw new Error(errorData.error || 'Failed to revoke access')
      }
      fetchAccess(selectedNamespace)
    } catch (err) {
      console.error('Failed to revoke access:', err)
      setError('Failed to revoke access')
      showToast('Failed to revoke access', 'error')
    }
  }

  // Show loading while clusters are being fetched
  if (clustersLoading) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6">
        <RefreshCw className="w-16 h-16 text-blue-400 mb-4 animate-spin" />
        <h2 className="text-xl font-semibold text-white mb-2">Loading Clusters...</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Discovering available clusters.
        </p>
      </div>
    )
  }

  // Show message if no clusters are selected
  if (targetClusters.length === 0) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6">
        <AlertTriangle className="w-16 h-16 text-yellow-400 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">No Clusters Selected</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Select one or more clusters using the filter in the navigation bar to manage namespaces.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-full flex flex-col p-6">
      {/* Header */}
      <DashboardHeader
        title="Namespace Manager"
        subtitle="Create namespaces and manage access across clusters"
        icon={<Folder className="w-6 h-6 text-blue-400" />}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        lastUpdated={lastUpdated}
        rightExtra={
          <>
            <RotatingTip page="namespaces" />
            <Button
              variant="primary"
              onClick={() => openCreateModal()}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              Create
            </Button>
          </>
        }
      />

      {/* Error display */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search and Group By Toggle */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('common.searchNamespaces')}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/30">
          <button
            onClick={() => setGroupBy('cluster')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${groupBy === 'cluster'
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-muted-foreground hover:text-white'
              }`}
            title="Group by cluster"
          >
            <Server className="w-4 h-4" />
            By Cluster
          </button>
          <button
            onClick={() => setGroupBy('type')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${groupBy === 'type'
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-muted-foreground hover:text-white'
              }`}
            title="Group by type (user/system)"
          >
            <Layers className="w-4 h-4" />
            By Type
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Namespace list */}
        <div className="flex-1 overflow-y-auto space-y-4">
          {groupBy === 'cluster' ? (
            // Group by Cluster view
            <>
              {targetClusters.map(clusterName => {
                const cluster = clusters.find(c => c.name === clusterName)
                const isUnreachable = cluster?.reachable === false
                const clusterNamespaces = filteredNamespaces
                  .filter(ns => ns.cluster === clusterName)
                  .sort((a, b) => a.name.localeCompare(b.name))
                const isCollapsed = collapsedClusters.has(clusterName)
                const isClusterLoading = loadingClusters.has(clusterName)
                const hasData = namespaceCache.has(clusterName) && !isClusterLoading

                return (
                  <div key={clusterName}>
                    {/* Cluster header - always show */}
                    <button
                      onClick={() => {
                        setCollapsedClusters(prev => {
                          const next = new Set(prev)
                          if (next.has(clusterName)) {
                            next.delete(clusterName)
                          } else {
                            next.add(clusterName)
                          }
                          return next
                        })
                      }}
                      className="flex items-center gap-2 w-full text-left mb-2 group"
                      title={isCollapsed ? 'Expand cluster' : isUnreachable ? `Cluster offline - check network connection` : 'Collapse cluster'}
                      aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${clusterName}`}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-white transition-colors" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-white transition-colors" />
                      )}
                      <ClusterBadge cluster={clusterName} size="sm" />
                      {isUnreachable && (
                        <span title="Cluster offline">
                          <WifiOff className="w-4 h-4 text-yellow-400" />
                        </span>
                      )}
                      <span className="text-sm text-muted-foreground">
                        {isUnreachable ? (
                          <span className="text-yellow-400">offline</span>
                        ) : isClusterLoading ? (
                          <span className="flex items-center gap-1.5">
                            <Hourglass className="w-3 h-3 animate-pulse" />
                            loading...
                          </span>
                        ) : (
                          `${clusterNamespaces.length} namespace${clusterNamespaces.length !== 1 ? 's' : ''}`
                        )}
                      </span>
                    </button>

                    {/* Cluster namespaces or skeleton */}
                    {!isCollapsed && (
                      <div className="space-y-2 ml-6">
                        {isClusterLoading && !hasData && !isUnreachable ? (
                          // Show skeleton for loading clusters (only on initial load, not refresh)
                          [1, 2, 3].map((i) => (
                            <NamespaceCardSkeleton key={`${clusterName}-skeleton-${i}`} />
                          ))
                        ) : clusterNamespaces.length > 0 ? (
                          clusterNamespaces.map(ns => {
                            const isSystem = ns.name.startsWith('kube-') ||
                              ns.name.startsWith('openshift-') ||
                              ns.name === 'default'
                            return (
                              <NamespaceCard
                                key={`${ns.cluster}-${ns.name}`}
                                namespace={ns}
                                isSelected={selectedNamespace?.name === ns.name && selectedNamespace?.cluster === ns.cluster}
                                onSelect={() => setSelectedNamespace(ns)}
                                onDelete={!isSystem ? () => handleDeleteNamespace(ns) : undefined}
                                isSystem={isSystem}
                                showCluster={false}
                              />
                            )
                          })
                        ) : hasData ? (
                          <p className="text-sm text-muted-foreground py-2">No namespaces found</p>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          ) : (
            // Group by Type view (user/system)
            <>
              {/* User namespaces */}
              {userNamespaces.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                    User Namespaces ({userNamespaces.length})
                  </h3>
                  <div className="space-y-2">
                    {userNamespaces.map(ns => (
                      <NamespaceCard
                        key={`${ns.cluster}-${ns.name}`}
                        namespace={ns}
                        isSelected={selectedNamespace?.name === ns.name && selectedNamespace?.cluster === ns.cluster}
                        onSelect={() => setSelectedNamespace(ns)}
                        onDelete={() => handleDeleteNamespace(ns)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* System namespaces */}
              {systemNamespaces.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                    System Namespaces ({systemNamespaces.length})
                  </h3>
                  <div className="space-y-2">
                    {systemNamespaces.map(ns => (
                      <NamespaceCard
                        key={`${ns.cluster}-${ns.name}`}
                        namespace={ns}
                        isSelected={selectedNamespace?.name === ns.name && selectedNamespace?.cluster === ns.cluster}
                        onSelect={() => setSelectedNamespace(ns)}
                        isSystem
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Skeleton loading */}
              {loading && filteredNamespaces.length === 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                    Loading Namespaces...
                  </h3>
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <NamespaceCardSkeleton key={i} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {filteredNamespaces.length === 0 && !loading && loadingClusters.size === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Folder className="w-12 h-12 mb-3 opacity-50" />
              <p>{t('namespaces.noNamespaces')}</p>
            </div>
          )}
        </div>

        {/* Access panel */}
        {selectedNamespace && (
          <div className="w-96 glass rounded-xl p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-medium text-white">{selectedNamespace.name}</h3>
                <p className="text-sm text-muted-foreground">{t('namespaces.accessManagement', 'Access Management')}</p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => openGrantAccessModal()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors text-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  {t('namespaces.grantAccess', 'Grant Access')}
                </button>
              )}
            </div>

            <ClusterBadge cluster={selectedNamespace.cluster} size="sm" className="mb-4" />

            {!isAdmin ? (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('namespaces.adminRequiredForAccess', 'Admin access required to view role bindings')}</p>
              </div>
            ) : accessLoading ? (
              <div className="flex items-center justify-center h-20">
                <div className="spinner w-6 h-6" />
              </div>
            ) : accessEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('namespaces.noRoleBindings', 'No role bindings found')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {accessEntries.map((entry, idx) => (
                  <div
                    key={`${entry.bindingName}-${idx}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{entry.subjectName}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                          {entry.subjectKind}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Role: {entry.roleName}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRevokeAccess(entry)}
                      className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title={t('namespaces.revokeAccess', 'Revoke access')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Namespace Modal */}
      {showCreateModal && (
        <CreateNamespaceModal
          clusters={targetClusters.filter(clusterName => {
            const cluster = clusters.find(c => c.name === clusterName)
            return cluster?.reachable !== false
          })}
          onClose={() => closeCreateModal()}
          onCreated={(cluster: string) => {
            closeCreateModal()
            // Clear cache for this cluster and refresh
            namespaceCache.delete(cluster)
            fetchNamespaces(true)
          }}
        />
      )}

      {/* Grant Access Modal */}
      {showGrantAccessModal && selectedNamespace && (
        <GrantAccessModal
          namespace={selectedNamespace}
          existingAccess={accessEntries}
          onClose={() => closeGrantAccessModal()}
          onGranted={() => {
            closeGrantAccessModal()
            fetchAccess(selectedNamespace)
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {namespaceToDelete && (
        <DeleteConfirmModal
          namespace={namespaceToDelete}
          onClose={() => setNamespaceToDelete(null)}
          onConfirm={confirmDeleteNamespace}
        />
      )}
    </div>
  )
}

