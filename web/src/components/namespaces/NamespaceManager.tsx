import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Folder,
  Plus,
  RefreshCw,
  Search,
  Shield,
  UserPlus,
  Trash2,
  ChevronRight,
  ChevronDown,
  X,
  AlertTriangle,
  Hourglass,
  Layers,
  Server,
  WifiOff
} from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { BaseModal } from '../../lib/modals'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { ClusterBadge } from '../ui/ClusterBadge'
import { DashboardHeader } from '../shared/DashboardHeader'
import { api } from '../../lib/api'
import { useToast } from '../ui/Toast'
import { useTranslation } from 'react-i18next'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants'

type GroupByMode = 'cluster' | 'type'

interface NamespaceDetails {
  name: string
  cluster: string
  status: string
  labels?: Record<string, string>
  createdAt: string
}

interface NamespaceAccessEntry {
  bindingName: string
  subjectKind: string
  subjectName: string
  subjectNamespace?: string
  roleName: string
  roleKind: string
}

// Cache for namespace data per cluster - persists across filter changes
const namespaceCache = new Map<string, NamespaceDetails[]>()

export function NamespaceManager() {
  const { t } = useTranslation()
  const { showToast } = useToast()
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
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showGrantAccessModal, setShowGrantAccessModal] = useState(false)
  const [namespaceToDelete, setNamespaceToDelete] = useState<NamespaceDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Group by cluster by default for better organization
  const [groupBy, setGroupBy] = useState<GroupByMode>('cluster')
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set())

  // Track if we've fetched to prevent infinite loops
  const hasFetchedRef = useRef(false)
  const lastFetchKeyRef = useRef<string>('')

  // Get all available clusters
  const allClusterNames = useMemo(() => deduplicatedClusters.map(c => c.name), [deduplicatedClusters])

  // Get target clusters based on global filter selection
  // We don't check permissions upfront - let the API handle auth errors per-cluster
  const targetClusters = useMemo(() => {
    return isAllClustersSelected
      ? deduplicatedClusters.map(c => c.name)
      : selectedClusters
  }, [deduplicatedClusters, selectedClusters, isAllClustersSelected])


  // Filter namespaces from cache based on selected clusters (no refetch needed)
  const namespaces = useMemo(() => {
    return allNamespaces.filter(ns => targetClusters.includes(ns.cluster))
  }, [allNamespaces, targetClusters])

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
          const timeoutId = setTimeout(() => controller.abort(), 8000)
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
                createdAt: ns.createdAt || new Date().toISOString(),
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
              `/api/mcp/pods?cluster=${encodeURIComponent(cluster)}&limit=1000`
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
                createdAt: new Date().toISOString(),
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
      } catch (err) {
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
  }, [allClusterNames, allNamespaces.length])

  const handleRefreshNamespaces = useCallback(() => fetchNamespaces(true), [fetchNamespaces])
  const { showIndicator, triggerRefresh } = useRefreshIndicator(handleRefreshNamespaces)
  const isFetching = loading || showIndicator

  const fetchAccess = useCallback(async (namespace: NamespaceDetails) => {
    setAccessLoading(true)
    try {
      const response = await api.get(`/namespaces/${namespace.name}/access?cluster=${namespace.cluster}`)
      setAccessEntries(response.data?.bindings || [])
    } catch (err) {
      console.error('Failed to fetch access:', err)
      setAccessEntries([])
      showToast('Failed to fetch namespace access', 'error')
    } finally {
      setAccessLoading(false)
    }
  }, [])

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
    if (selectedNamespace) {
      fetchAccess(selectedNamespace)
    }
  }, [selectedNamespace, fetchAccess])

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
      await api.delete(`/namespaces/${namespaceToDelete.name}?cluster=${namespaceToDelete.cluster}`)
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
      setNamespaceToDelete(null)
    }
  }

  const handleRevokeAccess = async (binding: NamespaceAccessEntry) => {
    if (!selectedNamespace) return

    if (!confirm(`Revoke access for ${binding.subjectName}?`)) {
      return
    }

    try {
      await api.delete(`/namespaces/${selectedNamespace.name}/access/${binding.bindingName}?cluster=${selectedNamespace.cluster}`)
      fetchAccess(selectedNamespace)
    } catch (err) {
      console.error('Failed to revoke access:', err)
      setError('Failed to revoke access')
    }
  }

  // Show loading while clusters are being fetched
  if (clustersLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6">
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
      <div className="h-full flex flex-col items-center justify-center p-6">
        <AlertTriangle className="w-16 h-16 text-amber-400 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">No Clusters Selected</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Select one or more clusters using the filter in the navigation bar to manage namespaces.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <DashboardHeader
        title="Namespace Manager"
        subtitle="Create namespaces and manage access across clusters"
        icon={<Folder className="w-6 h-6 text-blue-400" />}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        lastUpdated={lastUpdated}
        rightExtra={
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/80 text-white text-sm hover:bg-blue-500 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Create
          </button>
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
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/30">
          <button
            onClick={() => setGroupBy('cluster')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
              groupBy === 'cluster'
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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
              groupBy === 'type'
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
              <p>No namespaces found</p>
            </div>
          )}
        </div>

        {/* Access panel */}
        {selectedNamespace && (
          <div className="w-96 glass rounded-xl p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-medium text-white">{selectedNamespace.name}</h3>
                <p className="text-sm text-muted-foreground">Access Management</p>
              </div>
              <button
                onClick={() => setShowGrantAccessModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors text-sm"
              >
                <UserPlus className="w-4 h-4" />
                Grant Access
              </button>
            </div>

            <ClusterBadge cluster={selectedNamespace.cluster} size="sm" className="mb-4" />

            {accessLoading ? (
              <div className="flex items-center justify-center h-20">
                <div className="spinner w-6 h-6" />
              </div>
            ) : accessEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No role bindings found</p>
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
                      title="Revoke access"
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
          onClose={() => setShowCreateModal(false)}
          onCreated={(cluster: string) => {
            setShowCreateModal(false)
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
          onClose={() => setShowGrantAccessModal(false)}
          onGranted={() => {
            setShowGrantAccessModal(false)
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

interface NamespaceCardProps {
  namespace: NamespaceDetails
  isSelected: boolean
  onSelect: () => void
  onDelete?: () => void
  isSystem?: boolean
  showCluster?: boolean
}

function NamespaceCard({ namespace, isSelected, onSelect, onDelete, isSystem, showCluster = true }: NamespaceCardProps) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-4 p-4 rounded-lg cursor-pointer transition-colors group ${
        isSelected
          ? 'bg-blue-500/20 border border-blue-500/50'
          : 'bg-secondary/30 hover:bg-secondary/50 border border-transparent'
      }`}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
        isSystem ? 'bg-gray-500/20' : 'bg-blue-500/20'
      }`}>
        <Folder className={`w-5 h-5 ${isSystem ? 'text-gray-400' : 'text-blue-400'}`} />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{namespace.name}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            namespace.status === 'Active'
              ? 'bg-green-500/20 text-green-400'
              : 'bg-yellow-500/20 text-yellow-400'
          }`}>
            {namespace.status}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Created {new Date(namespace.createdAt).toLocaleDateString()}
        </p>
      </div>
      {showCluster && <ClusterBadge cluster={namespace.cluster} size="sm" />}
      {!isSystem && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="p-2 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
          title="Delete namespace"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </div>
  )
}

// Skeleton loading component for namespace cards
function NamespaceCardSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 rounded-lg bg-secondary/30 border border-transparent animate-pulse">
      {/* Icon placeholder */}
      <div className="w-10 h-10 rounded-lg bg-secondary/50" />

      {/* Content placeholder */}
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-4 w-32 bg-secondary/50 rounded" />
          <div className="h-4 w-14 bg-secondary/50 rounded" />
        </div>
        <div className="h-3 w-24 bg-secondary/50 rounded" />
      </div>

      {/* Cluster badge placeholder */}
      <div className="h-6 w-20 bg-secondary/50 rounded-full" />

      {/* Chevron placeholder */}
      <div className="w-4 h-4 bg-secondary/50 rounded" />
    </div>
  )
}

// Common users/groups for namespace access
const AVAILABLE_USERS = [
  'admin@example.com',
  'developer@example.com',
  'operator@example.com',
  'viewer@example.com',
  'ci-bot@example.com',
]

const AVAILABLE_GROUPS = [
  'developers',
  'operators',
  'viewers',
  'platform-team',
  'sre-team',
]

interface DeleteConfirmModalProps {
  namespace: NamespaceDetails
  onClose: () => void
  onConfirm: () => void
}

function DeleteConfirmModal({ namespace, onClose, onConfirm }: DeleteConfirmModalProps) {
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const canDelete = confirmText === namespace.name

  const handleDelete = async () => {
    if (!canDelete) return
    setDeleting(true)
    await onConfirm()
  }

  return (
    <BaseModal isOpen={true} onClose={onClose} size="md">
      <BaseModal.Header
        title="Delete Namespace"
        description="This action cannot be undone"
        icon={Trash2}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content>
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-sm text-red-300">
            You are about to delete namespace <strong>"{namespace.name}"</strong> from cluster <strong>"{namespace.cluster}"</strong>.
            This will permanently delete all resources within the namespace.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Type <span className="text-red-400 font-mono">{namespace.name}</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Enter namespace name"
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/50"
          />
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="flex-1" />
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-muted-foreground hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? 'Deleting...' : 'Delete Namespace'}
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}

interface CreateNamespaceModalProps {
  clusters: string[]
  onClose: () => void
  onCreated: (cluster: string) => void
}

interface InitialAccessEntry {
  type: 'User' | 'Group'
  name: string
  role: 'cluster-admin' | 'admin' | 'edit' | 'view'
}

function CreateNamespaceModal({ clusters, onClose, onCreated }: CreateNamespaceModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [cluster, setCluster] = useState(clusters[0] || '')
  const [teamLabel, setTeamLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialAccess, setInitialAccess] = useState<InitialAccessEntry[]>([])
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [showGroupDropdown, setShowGroupDropdown] = useState(false)

  const addUserAccess = (user: string) => {
    if (!initialAccess.some(a => a.type === 'User' && a.name === user)) {
      setInitialAccess([...initialAccess, { type: 'User', name: user, role: 'edit' }])
    }
    setShowUserDropdown(false)
  }

  const addGroupAccess = (group: string) => {
    if (!initialAccess.some(a => a.type === 'Group' && a.name === group)) {
      setInitialAccess([...initialAccess, { type: 'Group', name: group, role: 'edit' }])
    }
    setShowGroupDropdown(false)
  }

  const removeAccess = (index: number) => {
    setInitialAccess(initialAccess.filter((_, i) => i !== index))
  }

  const updateAccessRole = (index: number, role: 'cluster-admin' | 'admin' | 'edit' | 'view') => {
    setInitialAccess(initialAccess.map((a, i) => i === index ? { ...a, role } : a))
  }

  const handleCreate = async () => {
    if (!name || !cluster) return

    setCreating(true)
    setError(null)

    try {
      const labels: Record<string, string> = {}
      if (teamLabel) {
        labels['team'] = teamLabel
      }

      await api.post('/namespaces', {
        cluster,
        name,
        labels: Object.keys(labels).length > 0 ? labels : undefined,
        initialAccess: initialAccess.length > 0 ? initialAccess : undefined,
      })
      onCreated(cluster)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create namespace'
      setError(errorMessage)
    } finally {
      setCreating(false)
    }
  }

  const availableUsers = AVAILABLE_USERS.filter(
    u => !initialAccess.some(a => a.type === 'User' && a.name === u)
  )

  const availableGroups = AVAILABLE_GROUPS.filter(
    g => !initialAccess.some(a => a.type === 'Group' && a.name === g)
  )

  return (
    <BaseModal isOpen={true} onClose={onClose} size="lg">
      <BaseModal.Header
        title="Create Namespace"
        icon={Folder}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[60vh]">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('common.cluster')}</label>
            <select
              value={cluster}
              onChange={(e) => setCluster(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {clusters.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Namespace Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              placeholder="my-namespace"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Team Label (optional)</label>
            <input
              type="text"
              value={teamLabel}
              onChange={(e) => setTeamLabel(e.target.value)}
              placeholder="platform-team"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {/* Initial Access Section */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Grant Initial Access (optional)
            </label>

            {/* Add User/Group buttons */}
            <div className="flex gap-2 mb-3">
              <div className="relative">
                <button
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors text-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  Add User
                </button>
                {showUserDropdown && availableUsers.length > 0 && (
                  <div className="absolute z-10 top-full left-0 mt-1 w-48 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {availableUsers.map(user => (
                      <button
                        key={user}
                        onClick={() => addUserAccess(user)}
                        className="w-full px-3 py-2 text-left text-sm text-white hover:bg-secondary/50 transition-colors"
                      >
                        {user}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowGroupDropdown(!showGroupDropdown)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors text-sm"
                >
                  <Shield className="w-4 h-4" />
                  Add Group
                </button>
                {showGroupDropdown && availableGroups.length > 0 && (
                  <div className="absolute z-10 top-full left-0 mt-1 w-48 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {availableGroups.map(group => (
                      <button
                        key={group}
                        onClick={() => addGroupAccess(group)}
                        className="w-full px-3 py-2 text-left text-sm text-white hover:bg-secondary/50 transition-colors"
                      >
                        {group}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Close dropdowns overlay */}
            {(showUserDropdown || showGroupDropdown) && (
              <button
                onClick={() => {
                  setShowUserDropdown(false)
                  setShowGroupDropdown(false)
                }}
                className="fixed inset-0 z-0"
                aria-label="Close dropdown"
              />
            )}

            {/* Selected access list */}
            {initialAccess.length > 0 && (
              <div className="space-y-2">
                {initialAccess.map((entry, index) => (
                  <div
                    key={`${entry.type}-${entry.name}`}
                    className="flex items-center justify-between p-2 rounded-lg bg-secondary/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        entry.type === 'User' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                      }`}>
                        {entry.type}
                      </span>
                      <span className="text-sm text-white">{entry.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={entry.role}
                        onChange={(e) => updateAccessRole(index, e.target.value as 'cluster-admin' | 'admin' | 'edit' | 'view')}
                        className="px-2 py-1 text-xs rounded bg-secondary border border-border text-white"
                      >
                        <option value="cluster-admin">Full Admin</option>
                        <option value="admin">Admin</option>
                        <option value="edit">{t('common.edit')}</option>
                        <option value="view">{t('common.view')}</option>
                      </select>
                      <button
                        onClick={() => removeAccess(index)}
                        className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {initialAccess.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No initial access configured. You can add users/groups after creation.
              </p>
            )}
          </div>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="flex-1" />
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-muted-foreground hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name || !cluster || creating}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}

interface GrantAccessModalProps {
  namespace: NamespaceDetails
  existingAccess: NamespaceAccessEntry[]
  onClose: () => void
  onGranted: () => void
}

// Common users/groups discovered from RBAC (these would ideally come from cluster role bindings)
const COMMON_SUBJECTS = {
  User: [
    'admin@example.com',
    'developer@example.com',
    'operator@example.com',
    'viewer@example.com',
    'ci-bot@example.com',
  ],
  Group: [
    'system:authenticated',
    'system:cluster-admins',
    'developers',
    'operators',
    'viewers',
    'platform-team',
    'sre-team',
  ],
  ServiceAccount: [
    'default',
    'deployer',
    'argocd-application-controller',
    'flux-reconciler',
    'prometheus',
  ],
}

function GrantAccessModal({ namespace, existingAccess, onClose, onGranted }: GrantAccessModalProps) {
  const { t } = useTranslation()
  const [subjectKind, setSubjectKind] = useState<'User' | 'Group' | 'ServiceAccount'>('User')
  const [subjectName, setSubjectName] = useState('')
  const [subjectNS, setSubjectNS] = useState('')
  const [role, setRole] = useState('admin')
  const [granting, setGranting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  // Filter out subjects that already have access
  const existingSubjectNames = new Set(
    existingAccess
      .filter(e => e.subjectKind === subjectKind)
      .map(e => e.subjectName)
  )

  const availableSubjects = COMMON_SUBJECTS[subjectKind].filter(
    name => !existingSubjectNames.has(name)
  )

  const handleGrant = async () => {
    if (!subjectName) return

    setGranting(true)
    setError(null)

    try {
      await api.post(`/namespaces/${namespace.name}/access`, {
        cluster: namespace.cluster,
        subjectKind,
        subjectName,
        subjectNamespace: subjectKind === 'ServiceAccount' ? subjectNS : undefined,
        role,
      })
      onGranted()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to grant access'
      setError(errorMessage)
    } finally {
      setGranting(false)
    }
  }

  const selectSubject = (name: string) => {
    setSubjectName(name)
    setShowDropdown(false)
  }

  return (
    <BaseModal isOpen={true} onClose={onClose} size="md">
      <BaseModal.Header
        title="Grant Access"
        description={`Namespace: ${namespace.name}`}
        icon={Shield}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content>
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Subject Type</label>
            <select
              value={subjectKind}
              onChange={(e) => {
                setSubjectKind(e.target.value as 'User' | 'Group' | 'ServiceAccount')
                setSubjectName('') // Clear selection when type changes
              }}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="User">User</option>
              <option value="Group">Group</option>
              <option value="ServiceAccount">Service Account</option>
            </select>
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {subjectKind === 'User' ? 'Username / Email' : subjectKind === 'Group' ? 'Group Name' : 'Service Account Name'}
            </label>
            <div className="relative">
              <input
                type="text"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                onFocus={() => setShowDropdown(true)}
                placeholder={subjectKind === 'User' ? 'Select or type a user...' : subjectKind === 'Group' ? 'Select or type a group...' : 'Select or type a service account...'}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              {showDropdown && availableSubjects.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {availableSubjects
                    .filter(name => !subjectName || name.toLowerCase().includes(subjectName.toLowerCase()))
                    .map(name => (
                      <button
                        key={name}
                        onClick={() => selectSubject(name)}
                        className="w-full px-3 py-2 text-left text-sm text-white hover:bg-secondary/50 transition-colors"
                      >
                        {name}
                      </button>
                    ))}
                  {subjectName && !availableSubjects.some(n => n.toLowerCase() === subjectName.toLowerCase()) && (
                    <button
                      onClick={() => selectSubject(subjectName)}
                      className="w-full px-3 py-2 text-left text-sm text-blue-400 hover:bg-secondary/50 transition-colors border-t border-border"
                    >
                      Use "{subjectName}"
                    </button>
                  )}
                </div>
              )}
            </div>
            {showDropdown && (
              <button
                onClick={() => setShowDropdown(false)}
                className="fixed inset-0 z-0"
                aria-label="Close dropdown"
              />
            )}
          </div>

          {subjectKind === 'ServiceAccount' && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Service Account Namespace</label>
              <input
                type="text"
                value={subjectNS}
                onChange={(e) => setSubjectNS(e.target.value)}
                placeholder="default"
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('common.role')}</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="cluster-admin">Namespace Admin - Full Access (all resources, RBAC, secrets)</option>
              <option value="admin">Admin (all resources except RBAC)</option>
              <option value="edit">Edit (create/update/delete, no secrets/RBAC)</option>
              <option value="view">View (read-only)</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              These roles are scoped to this namespace only - not cluster-wide.
            </p>
          </div>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="flex-1" />
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-muted-foreground hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGrant}
            disabled={!subjectName || granting}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {granting ? 'Granting...' : 'Grant Access'}
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
