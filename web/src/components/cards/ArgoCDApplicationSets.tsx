import { CheckCircle, XCircle, RefreshCw, AlertTriangle, ExternalLink, AlertCircle, Layers, GitBranch } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { Skeleton } from '../ui/Skeleton'
import { useArgoApplicationSets, type ArgoApplicationSet } from '../../hooks/useArgoCD'
import { StatusBadge } from '../ui/StatusBadge'
import { useCardLoadingState } from './CardDataContext'
import { useCardData, commonComparators, type SortDirection } from '../../lib/cards/cardHooks'
import {
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter } from '../../lib/cards/CardComponents'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { useTranslation } from 'react-i18next'

interface ArgoCDApplicationSetsProps {
  config?: {
    cluster?: string
  }
}

type SortByOption = 'status' | 'name' | 'namespace' | 'appCount'

const SORT_OPTIONS_KEYS: ReadonlyArray<{ value: SortByOption; label: string }> = [
  { value: 'status', label: 'Status' },
  { value: 'name', label: 'Name' },
  { value: 'namespace', label: 'Namespace' },
  { value: 'appCount', label: 'App Count' },
]

const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string }> = {
  Healthy: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' },
  Progressing: { icon: RefreshCw, color: 'text-blue-400', bg: 'bg-blue-500/20' },
  Error: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20' },
  Unknown: { icon: AlertTriangle, color: 'text-muted-foreground', bg: 'bg-gray-500/20 dark:bg-gray-400/20' } }

const statusOrder: Record<string, number> = { Error: 0, Unknown: 1, Progressing: 2, Healthy: 3 }

const APPSET_SORT_COMPARATORS = {
  status: (a: ArgoApplicationSet, b: ArgoApplicationSet) => (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5),
  name: commonComparators.string<ArgoApplicationSet>('name'),
  namespace: commonComparators.string<ArgoApplicationSet>('namespace'),
  appCount: (a: ArgoApplicationSet, b: ArgoApplicationSet) => b.appCount - a.appCount }

function ArgoCDApplicationSetsInternal({ config }: ArgoCDApplicationSetsProps) {
  const { t } = useTranslation('cards')
  const {
    applicationSets: allAppSets,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoData } = useArgoApplicationSets()

  // Report loading state to CardWrapper
  const hasData = allAppSets.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures,
    isDemoData })

  // Pre-filter by config
  const preFiltered = (() => {
    let filtered = allAppSets
    if (config?.cluster) filtered = filtered.filter(a => a.cluster === config.cluster)
    return filtered
  })()

  // useCardData for search/cluster filter/sort/pagination
  const {
    items: appSets,
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
      clusterFilterRef },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection },
    containerRef,
    containerStyle } = useCardData<ArgoApplicationSet, SortByOption>(preFiltered, {
    filter: {
      searchFields: ['name', 'namespace', 'cluster', 'template'],
      clusterField: 'cluster',
      storageKey: 'argocd-applicationsets' },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc' as SortDirection,
      comparators: APPSET_SORT_COMPARATORS },
    defaultLimit: 5 })

  // Stats
  const stats = {
    healthy: preFiltered.filter(a => a.status === 'Healthy').length,
    progressing: preFiltered.filter(a => a.status === 'Progressing').length,
    error: preFiltered.filter(a => a.status === 'Error').length,
    totalApps: preFiltered.reduce((sum, a) => sum + a.appCount, 0) }

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
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
        <Layers className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">{t('argoCDApplicationSets.noApplicationSets', 'No ApplicationSets found')}</p>
        <p className="text-xs mt-1">{t('argoCDApplicationSets.deployWithArgoCD', 'Deploy ApplicationSets with ArgoCD to manage fleet-wide deployments')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header with controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <StatusBadge color="purple">
            {totalItems} AppSet{totalItems !== 1 ? 's' : ''}
          </StatusBadge>
          <StatusBadge color="blue">
            {stats.totalApps} generated app{stats.totalApps !== 1 ? 's' : ''}
          </StatusBadge>
        </div>
        <div className="flex items-center gap-2">
          <CardControlsRow
            clusterIndicator={localClusterFilter.length > 0 ? {
              selectedCount: localClusterFilter.length,
              totalCount: availableClusters.length } : undefined}
            clusterFilter={{
              availableClusters,
              selectedClusters: localClusterFilter,
              onToggle: toggleClusterFilter,
              onClear: clearClusterFilter,
              isOpen: showClusterFilter,
              setIsOpen: setShowClusterFilter,
              containerRef: clusterFilterRef,
              minClusters: 1 }}
            cardControls={{
              limit: itemsPerPage,
              onLimitChange: setItemsPerPage,
              sortBy,
              sortOptions: SORT_OPTIONS_KEYS.map(o => ({ ...o })),
              onSortChange: (v) => setSortBy(v as SortByOption),
              sortDirection,
              onSortDirectionChange: setSortDirection }}
            extra={
              <a
                href="https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/"
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
                title="ArgoCD ApplicationSet documentation"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            }
            className="mb-0"
          />
        </div>
      </div>

      {/* Integration notice — only shown in demo/fallback mode */}
      {isDemoData && !hasData && (
        <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-purple-400 font-medium">{t('argoCDApplicationSets.demoNotice', 'ArgoCD ApplicationSet Integration')}</p>
            <p className="text-muted-foreground">
              {t('argoCDApplicationSets.installGuide', 'Install or configure ArgoCD with ApplicationSet controller.')}{' '}
              <a href="https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline inline-block py-2">
                Setup Guide →
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Local Search */}
      <CardSearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search ApplicationSets..."
        className="mb-3"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 @md:grid-cols-3 gap-2 mb-3">
        <div className="text-center p-2 rounded-lg bg-green-500/10">
          <p className="text-lg font-bold text-green-400">{stats.healthy}</p>
          <p className="text-xs text-muted-foreground">Healthy</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-blue-500/10">
          <p className="text-lg font-bold text-blue-400">{stats.progressing}</p>
          <p className="text-xs text-muted-foreground">Progressing</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-red-500/10">
          <p className="text-lg font-bold text-red-400">{stats.error}</p>
          <p className="text-xs text-muted-foreground">Error</p>
        </div>
      </div>

      {/* ApplicationSet list */}
      <div ref={containerRef} className="flex-1 space-y-2 overflow-y-auto min-h-card-content" style={containerStyle}>
        {appSets.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No matching ApplicationSets
          </div>
        ) : (
          appSets.map((appSet, idx) => {
            const statusCfg = statusConfig[appSet.status] || statusConfig.Unknown
            const StatusIcon = statusCfg.icon

            return (
              <div
                key={`${appSet.cluster}-${appSet.namespace}-${appSet.name}-${idx}`}
                className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors group"
              >
                <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-medium text-foreground">{appSet.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color}`}>
                      <StatusIcon className="w-3 h-3 inline mr-1" />
                      {appSet.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                      {appSet.appCount} app{appSet.appCount !== 1 ? 's' : ''}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      appSet.syncPolicy === 'Automated'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {appSet.syncPolicy || 'Manual'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <ClusterBadge cluster={appSet.cluster} size="sm" />
                    <span>/{appSet.namespace}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    <span>{(appSet.generators || []).join(', ')}</span>
                  </div>
                </div>
                {appSet.template && (
                  <div className="mt-1 text-xs text-muted-foreground truncate">
                    Template: <span className="text-foreground/70">{appSet.template}</span>
                  </div>
                )}
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

export function ArgoCDApplicationSets(props: ArgoCDApplicationSetsProps) {
  return (
    <DynamicCardErrorBoundary cardId="ArgoCDApplicationSets">
      <ArgoCDApplicationSetsInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}
