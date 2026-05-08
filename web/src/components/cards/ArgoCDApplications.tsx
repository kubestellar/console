import { useState } from 'react'
import { CheckCircle, XCircle, RefreshCw, Clock, AlertTriangle, ChevronRight, ExternalLink, AlertCircle, Play, Loader2 } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { Skeleton } from '../ui/Skeleton'
import { useArgoCDApplications, useArgoCDTriggerSync, type ArgoApplication } from '../../hooks/useArgoCD'
import { StatusBadge } from '../ui/StatusBadge'
import { Button } from '../ui/Button'
import { useCardLoadingState } from './CardDataContext'
import { useCardData, commonComparators, type SortDirection } from '../../lib/cards/cardHooks'
import {
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
  CardEmptyState } from '../../lib/cards/CardComponents'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { useTranslation } from 'react-i18next'

interface ArgoCDApplicationsProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

type SortByOption = 'syncStatus' | 'healthStatus' | 'name' | 'namespace'
type SortTranslationKey = 'argoCDApplications.sortSyncStatus' | 'argoCDApplications.sortHealth' | 'argoCDApplications.sortName' | 'argoCDApplications.sortNamespace'

const SORT_OPTIONS_KEYS: ReadonlyArray<{ value: SortByOption; labelKey: SortTranslationKey }> = [
  { value: 'syncStatus' as const, labelKey: 'argoCDApplications.sortSyncStatus' },
  { value: 'healthStatus' as const, labelKey: 'argoCDApplications.sortHealth' },
  { value: 'name' as const, labelKey: 'argoCDApplications.sortName' },
  { value: 'namespace' as const, labelKey: 'argoCDApplications.sortNamespace' },
]

const syncStatusConfig = {
  Synced: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' },
  OutOfSync: { icon: RefreshCw, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  Unknown: { icon: AlertTriangle, color: 'text-muted-foreground', bg: 'bg-gray-500/20 dark:bg-gray-400/20' } }

const healthStatusConfig = {
  Healthy: { icon: CheckCircle, color: 'text-green-400' },
  Degraded: { icon: XCircle, color: 'text-red-400' },
  Progressing: { icon: Clock, color: 'text-blue-400' },
  Missing: { icon: AlertTriangle, color: 'text-orange-400' },
  Unknown: { icon: AlertTriangle, color: 'text-muted-foreground' } }

const syncOrder: Record<string, number> = { OutOfSync: 0, Unknown: 1, Synced: 2 }
const healthOrder: Record<string, number> = { Degraded: 0, Missing: 1, Progressing: 2, Unknown: 3, Healthy: 4 }

const ARGO_SORT_COMPARATORS = {
  syncStatus: (a: ArgoApplication, b: ArgoApplication) => (syncOrder[a.syncStatus] ?? 5) - (syncOrder[b.syncStatus] ?? 5),
  healthStatus: (a: ArgoApplication, b: ArgoApplication) => (healthOrder[a.healthStatus] ?? 5) - (healthOrder[b.healthStatus] ?? 5),
  name: commonComparators.string<ArgoApplication>('name'),
  namespace: commonComparators.string<ArgoApplication>('namespace') }

function ArgoCDApplicationsInternal({ config }: ArgoCDApplicationsProps) {
  const { t } = useTranslation('cards')
  const {
    applications: allApps,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoData } = useArgoCDApplications()
  const { drillToArgoApp } = useDrillDownActions()
  const { triggerSync } = useArgoCDTriggerSync()
  // Track per-app sync state with a Set to avoid shared-boolean race conditions
  const [syncingApps, setSyncingApps] = useState<Set<string>>(new Set())
  const addSyncingApp = (key: string) => setSyncingApps(prev => new Set(prev).add(key))
  const removeSyncingApp = (key: string) => setSyncingApps(prev => { const next = new Set(prev); next.delete(key); return next })

  // Report loading state to CardWrapper for skeleton/refresh behavior
  const hasData = allApps.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures,
    isDemoData })

  // Translated sort options
  const sortOptions = SORT_OPTIONS_KEYS.map(o => ({ value: o.value, label: t(o.labelKey) as string }))

  // Card-specific status filter
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'outOfSync' | 'unhealthy'>('all')

  // Step 2: Pre-filter by config and status filter (card-specific)
  const preFiltered = (() => {
    let filtered = allApps
    if (config?.cluster) filtered = filtered.filter(a => a.cluster === config.cluster)
    if (config?.namespace) filtered = filtered.filter(a => a.namespace === config.namespace)
    if (selectedFilter === 'outOfSync') filtered = filtered.filter(a => a.syncStatus === 'OutOfSync')
    else if (selectedFilter === 'unhealthy') filtered = filtered.filter(a => a.healthStatus !== 'Healthy')
    return filtered
  })()

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
      clusterFilterRef },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection },
    containerRef,
    containerStyle } = useCardData<ArgoApplication, SortByOption>(preFiltered, {
    filter: {
      searchFields: ['name', 'namespace', 'cluster'],
      clusterField: 'cluster',
      storageKey: 'argocd-applications' },
    sort: {
      defaultField: 'syncStatus',
      defaultDirection: 'asc' as SortDirection,
      comparators: ARGO_SORT_COMPARATORS },
    defaultLimit: 5 })

  // Stats computed from preFiltered (reflects status counts before search/pagination)
  const stats = {
    synced: preFiltered.filter(a => a.syncStatus === 'Synced').length,
    outOfSync: preFiltered.filter(a => a.syncStatus === 'OutOfSync').length,
    healthy: preFiltered.filter(a => a.healthStatus === 'Healthy').length,
    unhealthy: preFiltered.filter(a => a.healthStatus !== 'Healthy').length }

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
      <CardEmptyState
        icon={Play}
        title={t('argoCDApplications.noApplications')}
        message={t('argoCDApplications.deployWithArgoCD')}
      />
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header with controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <StatusBadge color="orange">
            {t('argoCDApplications.appsCount', { count: totalItems })}
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
              sortOptions,
              onSortChange: (v) => setSortBy(v as SortByOption),
              sortDirection,
              onSortDirectionChange: setSortDirection }}
            extra={
              <a
                href="https://argo-cd.readthedocs.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
                title={t('argoCDApplications.argocdDocumentation')}
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            }
            className="mb-0"
          />
        </div>
      </div>

      {/* Integration notice — only shown in demo/fallback mode (#4201) */}
      {isDemoData && !hasData && (
        <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-orange-400 font-medium">{t('argoCDApplications.argocdIntegration')}</p>
            <p className="text-muted-foreground">
              {t('argoCDApplications.installArgoCD')}{' '}
              <a href="https://argo-cd.readthedocs.io/en/stable/getting_started/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline inline-block py-2">
                {t('argoCDApplications.installGuide')}
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Local Search */}
      <CardSearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder={t('argoCDApplications.searchApplications')}
        className="mb-3"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 mb-3">
        <div className="text-center p-2 rounded-lg bg-green-500/10 cursor-pointer hover:bg-green-500/20"
             role="button" tabIndex={0}
             aria-label={`Show all applications (${stats.synced} synced)`}
             onClick={() => setSelectedFilter('all')}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedFilter('all') } }}>
          <p className="text-lg font-bold text-green-400">{stats.synced}</p>
          <p className="text-xs text-muted-foreground">{t('argoCDApplications.synced')}</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-yellow-500/10 cursor-pointer hover:bg-yellow-500/20"
             role="button" tabIndex={0}
             aria-label={`Filter out of sync applications (${stats.outOfSync} out of sync)`}
             onClick={() => setSelectedFilter('outOfSync')}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedFilter('outOfSync') } }}>
          <p className="text-lg font-bold text-yellow-400">{stats.outOfSync}</p>
          <p className="text-xs text-muted-foreground">{t('argoCDApplications.outOfSync')}</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-green-500/10 cursor-pointer hover:bg-green-500/20"
             role="button" tabIndex={0}
             aria-label={`Show all applications (${stats.healthy} healthy)`}
             onClick={() => setSelectedFilter('all')}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedFilter('all') } }}>
          <p className="text-lg font-bold text-green-400">{stats.healthy}</p>
          <p className="text-xs text-muted-foreground">{t('argoCDApplications.healthy')}</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-red-500/10 cursor-pointer hover:bg-red-500/20"
             role="button" tabIndex={0}
             aria-label={`Filter unhealthy applications (${stats.unhealthy} unhealthy)`}
             onClick={() => setSelectedFilter('unhealthy')}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedFilter('unhealthy') } }}>
          <p className="text-lg font-bold text-red-400">{stats.unhealthy}</p>
          <p className="text-xs text-muted-foreground">{t('argoCDApplications.unhealthy')}</p>
        </div>
      </div>

      {/* Filter indicator */}
      {selectedFilter !== 'all' && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground">{t('argoCDApplications.showing')}:</span>
          <Button
            variant="accent"
            size="sm"
            onClick={() => setSelectedFilter('all')}
            className="px-2 py-0.5"
            aria-label={`Clear filter: ${selectedFilter === 'outOfSync' ? t('argoCDApplications.outOfSync') : t('argoCDApplications.unhealthy')}`}
          >
            {selectedFilter === 'outOfSync' ? t('argoCDApplications.outOfSync') : t('argoCDApplications.unhealthy')}
            <XCircle className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Applications list */}
      <div ref={containerRef} className="flex-1 space-y-2 overflow-y-auto min-h-card-content" style={containerStyle}>
        {applications.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            {t('argoCDApplications.noMatchingApplications')}
          </div>
        ) : (
          applications.map((app, idx) => {
            const syncConfig = syncStatusConfig[app.syncStatus]
            const healthConfig = healthStatusConfig[app.healthStatus]
            const SyncIcon = syncConfig.icon
            const HealthIcon = healthConfig.icon
            const appKey = `${app.cluster}/${app.namespace}/${app.name}`
            const isThisAppSyncing = syncingApps.has(appKey)

            return (
              <div
                key={`${app.cluster}-${app.namespace}-${app.name}-${idx}`}
                onClick={() => drillToArgoApp(app.cluster, app.namespace, app.name, {
                  syncStatus: app.syncStatus,
                  healthStatus: app.healthStatus,
                  source: app.source,
                  lastSynced: app.lastSynced })}
                className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors group"
                title={t('argoCDApplications.clickToView', { name: app.name })}
              >
                <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{app.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${syncConfig.bg} ${syncConfig.color}`}>
                      <SyncIcon className="w-3 h-3 inline mr-1" />
                      {app.syncStatus}
                    </span>
                    <HealthIcon className={`w-4 h-4 ${healthConfig.color}`} aria-label={app.healthStatus} />
                  </div>
                  <div className="flex items-center gap-2">
                    {app.syncStatus === 'OutOfSync' && (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          addSyncingApp(appKey)
                          triggerSync(app.name, app.namespace).finally(() => removeSyncingApp(appKey))
                        }}
                        disabled={isThisAppSyncing}
                        className="bg-orange-500/20 px-2 py-0.5 text-orange-400 hover:bg-orange-500/30"
                        title={t('argoCDApplications.syncNow')}
                        aria-label={t('argoCDApplications.syncNow') + ': ' + app.name}
                      >
                        {isThisAppSyncing ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        {t('argoCDApplications.syncNow')}
                      </Button>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted-foreground">
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
  return (
    <DynamicCardErrorBoundary cardId="ArgoCDApplications">
      <ArgoCDApplicationsInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}
