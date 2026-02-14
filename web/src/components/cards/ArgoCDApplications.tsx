import { useState, useMemo } from 'react'
import { CheckCircle, XCircle, RefreshCw, Clock, AlertTriangle, ChevronRight, ExternalLink, AlertCircle } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { Skeleton } from '../ui/Skeleton'
import { useArgoCDApplications, type ArgoApplication } from '../../hooks/useArgoCD'
import { useCardLoadingState } from './CardDataContext'
import {
  useCardData,
  commonComparators,
  type SortDirection,
} from '../../lib/cards'
import {
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
} from '../../lib/cards/CardComponents'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { useTranslation } from 'react-i18next'

interface ArgoCDApplicationsProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

type SortByOption = 'syncStatus' | 'healthStatus' | 'name' | 'namespace'

const SORT_OPTIONS = [
  { value: 'syncStatus' as const, label: 'Sync Status' },
  { value: 'healthStatus' as const, label: 'Health' },
  { value: 'name' as const, label: 'Name' },
  { value: 'namespace' as const, label: 'Namespace' },
]

const syncStatusConfig = {
  Synced: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' },
  OutOfSync: { icon: RefreshCw, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  Unknown: { icon: AlertTriangle, color: 'text-gray-400', bg: 'bg-gray-500/20' },
}

const healthStatusConfig = {
  Healthy: { icon: CheckCircle, color: 'text-green-400' },
  Degraded: { icon: XCircle, color: 'text-red-400' },
  Progressing: { icon: Clock, color: 'text-blue-400' },
  Missing: { icon: AlertTriangle, color: 'text-orange-400' },
  Unknown: { icon: AlertTriangle, color: 'text-gray-400' },
}

const syncOrder: Record<string, number> = { OutOfSync: 0, Unknown: 1, Synced: 2 }
const healthOrder: Record<string, number> = { Degraded: 0, Missing: 1, Progressing: 2, Unknown: 3, Healthy: 4 }

const ARGO_SORT_COMPARATORS = {
  syncStatus: (a: ArgoApplication, b: ArgoApplication) => (syncOrder[a.syncStatus] ?? 5) - (syncOrder[b.syncStatus] ?? 5),
  healthStatus: (a: ArgoApplication, b: ArgoApplication) => (healthOrder[a.healthStatus] ?? 5) - (healthOrder[b.healthStatus] ?? 5),
  name: commonComparators.string<ArgoApplication>('name'),
  namespace: commonComparators.string<ArgoApplication>('namespace'),
}

function ArgoCDApplicationsInternal({ config }: ArgoCDApplicationsProps) {
  const { t } = useTranslation()
  const {
    applications: allApps,
    isLoading,
    isFailed,
    consecutiveFailures,
  } = useArgoCDApplications()
  const { drillToArgoApp } = useDrillDownActions()

  // Report loading state to CardWrapper for skeleton/refresh behavior
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData: allApps.length > 0,
    isFailed,
    consecutiveFailures,
  })

  // Card-specific status filter
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'outOfSync' | 'unhealthy'>('all')

  // Step 2: Pre-filter by config and status filter (card-specific)
  const preFiltered = useMemo(() => {
    let filtered = allApps
    if (config?.cluster) filtered = filtered.filter(a => a.cluster === config.cluster)
    if (config?.namespace) filtered = filtered.filter(a => a.namespace === config.namespace)
    if (selectedFilter === 'outOfSync') filtered = filtered.filter(a => a.syncStatus === 'OutOfSync')
    else if (selectedFilter === 'unhealthy') filtered = filtered.filter(a => a.healthStatus !== 'Healthy')
    return filtered
  }, [allApps, config, selectedFilter])

  // Step 3: useCardData for search/cluster filter/sort/pagination
  const {
    items: applications,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: searchQuery,
      setSearch: setSearchQuery,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef,
    },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection,
    },
  } = useCardData<ArgoApplication, SortByOption>(preFiltered, {
    filter: {
      searchFields: ['name', 'namespace', 'cluster'],
      clusterField: 'cluster',
      storageKey: 'argocd-applications',
    },
    sort: {
      defaultField: 'syncStatus',
      defaultDirection: 'asc' as SortDirection,
      comparators: ARGO_SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

  // Stats computed from preFiltered (reflects status counts before search/pagination)
  const stats = useMemo(() => ({
    synced: preFiltered.filter(a => a.syncStatus === 'Synced').length,
    outOfSync: preFiltered.filter(a => a.syncStatus === 'OutOfSync').length,
    healthy: preFiltered.filter(a => a.healthStatus === 'Healthy').length,
    unhealthy: preFiltered.filter(a => a.healthStatus !== 'Healthy').length,
  }), [preFiltered])

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={150} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
        </div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">No ArgoCD applications</p>
        <p className="text-xs mt-1">Deploy applications with ArgoCD to see them here</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header with controls */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
            {totalItems} apps
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CardControlsRow
            clusterIndicator={localClusterFilter.length > 0 ? {
              selectedCount: localClusterFilter.length,
              totalCount: availableClusters.length,
            } : undefined}
            clusterFilter={{
              availableClusters,
              selectedClusters: localClusterFilter,
              onToggle: toggleClusterFilter,
              onClear: clearClusterFilter,
              isOpen: showClusterFilter,
              setIsOpen: setShowClusterFilter,
              containerRef: clusterFilterRef,
              minClusters: 1,
            }}
            cardControls={{
              limit: itemsPerPage,
              onLimitChange: setItemsPerPage,
              sortBy,
              sortOptions: SORT_OPTIONS,
              onSortChange: (v) => setSortBy(v as SortByOption),
              sortDirection,
              onSortDirectionChange: setSortDirection,
            }}
            extra={
              <a
                href="https://argo-cd.readthedocs.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
                title="ArgoCD Documentation"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            }
            className="mb-0"
          />
        </div>
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-orange-400 font-medium">ArgoCD Integration</p>
          <p className="text-muted-foreground">
            Install ArgoCD to manage GitOps workflows.{' '}
            <a href="https://argo-cd.readthedocs.io/en/stable/getting_started/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
              Install guide →
            </a>
          </p>
        </div>
      </div>

      {/* Local Search */}
      <CardSearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search applications..."
        className="mb-3"
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="text-center p-2 rounded-lg bg-green-500/10 cursor-pointer hover:bg-green-500/20"
             onClick={() => setSelectedFilter('all')}>
          <p className="text-lg font-bold text-green-400">{stats.synced}</p>
          <p className="text-xs text-muted-foreground">Synced</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-yellow-500/10 cursor-pointer hover:bg-yellow-500/20"
             onClick={() => setSelectedFilter('outOfSync')}>
          <p className="text-lg font-bold text-yellow-400">{stats.outOfSync}</p>
          <p className="text-xs text-muted-foreground">Out of Sync</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-green-500/10 cursor-pointer hover:bg-green-500/20"
             onClick={() => setSelectedFilter('all')}>
          <p className="text-lg font-bold text-green-400">{stats.healthy}</p>
          <p className="text-xs text-muted-foreground">{t('common.healthy')}</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-red-500/10 cursor-pointer hover:bg-red-500/20"
             onClick={() => setSelectedFilter('unhealthy')}>
          <p className="text-lg font-bold text-red-400">{stats.unhealthy}</p>
          <p className="text-xs text-muted-foreground">{t('common.unhealthy')}</p>
        </div>
      </div>

      {/* Filter indicator */}
      {selectedFilter !== 'all' && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground">Showing:</span>
          <button
            onClick={() => setSelectedFilter('all')}
            className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 flex items-center gap-1"
          >
            {selectedFilter === 'outOfSync' ? 'Out of Sync' : 'Unhealthy'}
            <XCircle className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Applications list */}
      <div className="flex-1 space-y-2 overflow-y-auto min-h-card-content">
        {applications.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No applications match the current filters
          </div>
        ) : (
          applications.map((app, idx) => {
            const syncConfig = syncStatusConfig[app.syncStatus]
            const healthConfig = healthStatusConfig[app.healthStatus]
            const SyncIcon = syncConfig.icon
            const HealthIcon = healthConfig.icon

            return (
              <div
                key={`${app.cluster}-${app.namespace}-${app.name}-${idx}`}
                onClick={() => drillToArgoApp(app.cluster, app.namespace, app.name, {
                  syncStatus: app.syncStatus,
                  healthStatus: app.healthStatus,
                  source: app.source,
                  lastSynced: app.lastSynced,
                })}
                className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors group"
                title={`Click to view ${app.name} details`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{app.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${syncConfig.bg} ${syncConfig.color}`}>
                      <SyncIcon className="w-3 h-3 inline mr-1" />
                      {app.syncStatus}
                    </span>
                    <HealthIcon className={`w-4 h-4 ${healthConfig.color}`} aria-label={app.healthStatus} />
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <ClusterBadge cluster={app.cluster} size="sm" />
                    <span>/{app.namespace}</span>
                  </div>
                  <span>{app.lastSynced}</span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />
    </div>
  )
}

export function ArgoCDApplications(props: ArgoCDApplicationsProps) {
  const { t: _t } = useTranslation()
  return (
    <DynamicCardErrorBoundary cardId="ArgoCDApplications">
      <ArgoCDApplicationsInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}
