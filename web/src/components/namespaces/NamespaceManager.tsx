
import { useState } from 'react'
import {
  Folder,
  Plus,
  RefreshCw,
  AlertTriangle,
  X,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { useClusters } from '../../hooks/useMCP'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { useModalState } from '../../lib/modals'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'
import { authFetch } from '../../lib/api'
import { useToast } from '../ui/Toast'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../lib/auth'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants'
import { NamespaceCard, NamespaceCardSkeleton } from './NamespaceCard'
import { DeleteConfirmModal } from './DeleteConfirmModal'
import { CreateNamespaceModal } from './CreateNamespaceModal'
import { NamespaceAccessPanel } from './NamespaceAccessPanel'
import { NamespaceClusterGroup } from './NamespaceClusterGroup'
import { NamespaceFilterBar, type GroupByMode } from './NamespaceFilterBar'
import { getCachedNamespacesForCluster, invalidateNamespaceCache, useNamespaceFetch } from './useNamespaceFetch'
import type { NamespaceDetails } from './types'

export function NamespaceManager() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { clusters, deduplicatedClusters, isLoading: clustersLoading } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  const {
    allNamespaces,
    loading,
    loadingClusters,
    clusterStatuses,
    error,
    setError,
    lastUpdated,
    fetchNamespaces,
  } = useNamespaceFetch({ clusters, deduplicatedClusters })

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNamespace, setSelectedNamespace] = useState<NamespaceDetails | null>(null)
  const { isOpen: showCreateModal, open: openCreateModal, close: closeCreateModal } = useModalState()
  const [namespaceToDelete, setNamespaceToDelete] = useState<NamespaceDetails | null>(null)
  // Group by cluster by default for better organization
  const [groupBy, setGroupBy] = useState<GroupByMode>('cluster')
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set())

  // Get target clusters based on global filter selection
  // We don't check permissions upfront - let the API handle auth errors per-cluster
  const targetClusters = isAllClustersSelected
    ? (deduplicatedClusters || []).map(c => c.name)
    : (selectedClusters || [])

  // Filter namespaces from cache based on selected clusters (no refetch needed)
  const namespaces = (allNamespaces || []).filter(ns => targetClusters.includes(ns.cluster))

  const handleRefreshNamespaces = () => fetchNamespaces(true)
  const { showIndicator, triggerRefresh } = useRefreshIndicator(handleRefreshNamespaces)
  const isFetching = loading || showIndicator

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
  const unavailableClusterCount = Object.values(clusterStatuses).filter(status => status === 'unavailable').length
  const routeState = loading || loadingClusters.size > 0
    ? 'partial'
    : error && namespaces.length === 0
      ? 'unavailable'
      : namespaces.length === 0
        ? 'empty'
        : unavailableClusterCount > 0
          ? 'partial'
          : 'loaded'

  const handleDeleteNamespace = async (ns: NamespaceDetails) => {
    setNamespaceToDelete(ns)
  }

  const handleToggleCollapse = (clusterName: string) => {
    setCollapsedClusters(prev => {
      const next = new Set(prev)
      if (next.has(clusterName)) {
        next.delete(clusterName)
      } else {
        next.add(clusterName)
      }
      return next
    })
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
      invalidateNamespaceCache(namespaceToDelete.cluster)
      fetchNamespaces(true)
      if (selectedNamespace?.name === namespaceToDelete.name && selectedNamespace?.cluster === namespaceToDelete.cluster) {
        setSelectedNamespace(null)
      }
      setNamespaceToDelete(null)
    } catch (err: unknown) {
      console.error('Failed to delete namespace:', err)
      setError('Failed to delete namespace')
      showToast('Failed to delete namespace', 'error')
      setNamespaceToDelete(null)
    }
  }

  // Show loading while clusters are being fetched
  if (clustersLoading) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6" data-live-route-state="partial" data-live-source="k8s">
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
      <div className="min-h-full flex flex-col items-center justify-center p-6" data-live-route-state="empty" data-live-source="k8s">
        <AlertTriangle className="w-16 h-16 text-yellow-400 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">No Clusters Selected</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Select one or more clusters using the filter in the navigation bar to manage namespaces.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-full flex flex-col p-6" data-live-route-state={routeState} data-live-source="k8s">
      <span className="sr-only" data-groundtruth-field="namespaces-total">{namespaces.length}</span>
      <span className="sr-only" data-groundtruth-field="namespaces-unavailable-clusters">{unavailableClusterCount}</span>
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
          <button aria-label={t('actions.dismiss')} onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search and Group By Toggle */}
      <NamespaceFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
      />

      {/* Main content */}
      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Namespace list */}
        <div className="flex-1 overflow-y-auto space-y-4">
          {groupBy === 'cluster' ? (
            // Group by Cluster view
            <>
              {(targetClusters || []).map(clusterName => {
                const cluster = (clusters || []).find(c => c.name === clusterName)
                const isUnreachable = cluster?.reachable === false
                const clusterNamespaces = filteredNamespaces
                  .filter(ns => ns.cluster === clusterName)
                  .sort((a, b) => a.name.localeCompare(b.name))
                const isCollapsed = collapsedClusters.has(clusterName)
                const isClusterLoading = loadingClusters.has(clusterName)
                const clusterStatus = clusterStatuses[clusterName]
                const hasData = getCachedNamespacesForCluster(clusterName).length > 0

                return (
                  <NamespaceClusterGroup
                    key={clusterName}
                    clusterName={clusterName}
                    namespaces={clusterNamespaces}
                    isCollapsed={isCollapsed}
                    onToggleCollapse={handleToggleCollapse}
                    isLoading={isClusterLoading}
                    clusterStatus={clusterStatus}
                    hasData={hasData}
                    isUnreachable={isUnreachable}
                    selectedNamespace={selectedNamespace}
                    onSelect={setSelectedNamespace}
                    onDelete={handleDeleteNamespace}
                  />
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

          {filteredNamespaces.length === 0 && !loading && loadingClusters.size === 0 && !error && targetClusters.every(clusterName => !clusterStatuses[clusterName]) && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Folder className="w-12 h-12 mb-3 opacity-50" />
              <p>{t('namespaces.noNamespaces')}</p>
            </div>
          )}
        </div>

        {/* Access panel */}
        <NamespaceAccessPanel namespace={selectedNamespace} isAdmin={isAdmin} />
      </div>

      {/* Create Namespace Modal */}
      {showCreateModal && (
        <CreateNamespaceModal
          clusters={(targetClusters || []).filter(clusterName => {
            const cluster = (clusters || []).find(c => c.name === clusterName)
            return cluster?.reachable !== false
          })}
          onClose={() => closeCreateModal()}
          onCreated={(cluster: string) => {
            closeCreateModal()
            // Clear cache for this cluster and refresh
            invalidateNamespaceCache(cluster)
            fetchNamespaces(true)
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
