import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, AlertTriangle, XCircle, Clock, ChevronRight, Server, Package } from 'lucide-react'
import { formatTimeAgo } from '../../../lib/formatters'
import { useClusters, BuildpackImage } from '../../../hooks/useMCP'
import { useCachedBuildpackImages } from '../../../hooks/useCachedData'
import { Skeleton } from '../../ui/Skeleton'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { CardSearchInput, CardControlsRow, CardPaginationFooter, CardAIActions } from '../../../lib/cards/CardComponents'
import { useCardData } from '../../../lib/cards/cardHooks'
import { useCardLoadingState } from '../CardDataContext'
import { useDrillDownActions } from '../../../hooks/useDrillDown'

interface BuildpacksStatusProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

export type BuildpackStatus =
  | 'succeeded'
  | 'failed'
  | 'building'
  | 'unknown'

type SortByOption = 'status' | 'name' | 'builder' | 'updated'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'builder' as const, label: 'Builder' },
  { value: 'updated' as const, label: 'Updated' },
]

const STATUS_STYLES = {
  succeeded: {
    icon: 'text-green-400',
    badge: 'bg-green-500/20 text-green-400' },
  failed: {
    icon: 'text-red-400',
    badge: 'bg-red-500/20 text-red-400' },
  building: {
    icon: 'text-blue-400',
    badge: 'bg-blue-500/20 text-blue-400' },
  unknown: {
    icon: 'text-orange-400',
    badge: 'bg-orange-500/20 text-orange-400' } }

const STATUS_ORDER: Record<string, number> = {
  failed: 0,
  building: 1,
  unknown: 2,
  succeeded: 3 }


export function BuildpacksStatus({ config }: BuildpacksStatusProps) {
  const { t } = useTranslation('cards')
  const { isLoading: clustersLoading } = useClusters()

  const {
    images: allImages,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    error,
    isDemoFallback: isDemoData } = useCachedBuildpackImages(config?.cluster)

  const { drillToBuildpack } = useDrillDownActions()

  const [selectedNamespace, setSelectedNamespace] = useState(
    config?.namespace || ''
  )

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: clustersLoading || isLoading,
    isRefreshing,
    hasAnyData: allImages.length > 0,
    isFailed,
    consecutiveFailures,
    isDemoData })

  const allBuilds = allImages

  const namespacedBuilds = (() => {
    if (!selectedNamespace) return allBuilds
    return allBuilds.filter(b => b.namespace === selectedNamespace)
  })()

  const namespaces = Array.from(new Set(allBuilds.map(b => b.namespace))).sort()

  const {
    items: builds,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: localSearch,
      setSearch: setLocalSearch,
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
    containerStyle } = useCardData<BuildpackImage, SortByOption>(namespacedBuilds, {
    filter: {
      searchFields: ['name', 'namespace', 'builder', 'image'],
      clusterField: 'cluster',
      statusField: 'status',
      storageKey: 'buildpacks-status' },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: (a, b) => (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5),
        name: (a, b) => a.name.localeCompare(b.name),
        builder: (a, b) => a.builder.localeCompare(b.builder),
        updated: (a, b) =>
          new Date(b.updated).getTime() -
          new Date(a.updated).getTime() } },
    defaultLimit: 5 })

  const { successCount, failedCount, buildingCount } = {
      successCount: namespacedBuilds.filter(b => b.status === 'succeeded').length,
      failedCount: namespacedBuilds.filter(b => b.status === 'failed').length,
      buildingCount: namespacedBuilds.filter(b => b.status === 'building').length }

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={60} />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        {error ? (
          <>
            <AlertTriangle className="w-6 h-6 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
            <p className="text-xs mt-1">{t('buildpacksStatus.loadFailed')}</p>
          </>
        ) : (
          <>
            <Package className="w-8 h-8 text-muted-foreground/50" />
            <p className="text-sm">{t('buildpacksStatus.noImages')}</p>
            <p className="text-xs mt-1">
              {t('buildpacksStatus.createHint')}
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2 mb-4">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}
        </div>

        <CardControlsRow
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
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection }}
        />
      </div>

      {/* Namespace Selector */}
      <div className="mb-4">
        <select
          value={selectedNamespace}
          onChange={(e) => setSelectedNamespace(e.target.value)}
          className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground"
        >
          <option value="">{t('buildpacksStatus.allNamespaces')}</option>
          {namespaces.map(ns => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
      </div>

      {/* Scope Badge */}
      <div className="flex items-center gap-2 mb-4">
        {localClusterFilter.length === 1 ? (
          <ClusterBadge cluster={localClusterFilter[0]} />
        ) : localClusterFilter.length > 1 ? (
          <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">
            {t('buildpacksStatus.clustersCount', { count: localClusterFilter.length })}
          </span>
        ) : (
          <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">
            {t('buildpacksStatus.allClusters')}
          </span>
        )}

        {selectedNamespace && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-foreground">{selectedNamespace}</span>
          </>
        )}
      </div>

      {/* Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder={t('buildpacksStatus.searchPlaceholder')}
        className="mb-4"
      />

      {/* Summary */}
      <div className="flex gap-2 mb-4">
        <Summary label={t('buildpacksStatus.total')} value={totalItems} color="blue" />
        <Summary label={t('buildpacksStatus.succeeded')} value={successCount} color="green" />
        <Summary label={t('buildpacksStatus.building')} value={buildingCount} color="blue" />
        <Summary label={t('buildpacksStatus.failed')} value={failedCount} color="red" />
      </div>

      {/* List */}
      <div ref={containerRef} className="flex-1 space-y-2 overflow-y-auto" style={containerStyle}>
        {builds.map(build => {
          const Icon =
            build.status === 'succeeded'
              ? CheckCircle
              : build.status === 'failed'
              ? XCircle
              : build.status === 'building'
              ? Clock
              : AlertTriangle

          const styles = STATUS_STYLES[build.status]

          return (
            <div key={`${build.cluster}-${build.namespace}-${build.name}`}
              onClick={() =>
                drillToBuildpack(build.cluster || '',
                  build.namespace,
                  build.name,
                  {
                    builder: build.builder,
                    image: build.image,
                    status: build.status,
                    updated: build.updated }
                )
              }
              className={`p-3 rounded-lg transition-colors cursor-pointer group ${
                build.status === 'failed'
                  ? 'bg-red-500/10 border border-red-500/20'
                  : 'bg-secondary/30'
              } hover:bg-secondary/50`}
            >
              <div className="flex flex-wrap items-center justify-between gap-y-2 mb-1">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${styles.icon}`} />
                  <span className="text-sm font-medium group-hover:text-purple-400">
                    {build.name}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {build.status !== 'succeeded' && (
                    <CardAIActions
                      resource={{
                        kind: 'BuildpackImage',
                        name: build.name,
                        namespace: build.namespace,
                        cluster: build.cluster,
                        status: build.status }}
                      issues={[
                        {
                          name: `Image ${build.status}`,
                          message: `Buildpack image ${build.name} is ${build.status}` },
                      ]}
                    />
                  )}
                  <span className={`text-xs px-1.5 py-0.5 rounded ${styles.badge}`}>
                    {build.status}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              <div className="flex items-center gap-4 ml-6 text-xs text-muted-foreground">
                {build.cluster && (
                  <ClusterBadge cluster={build.cluster} size="sm" />
                )}
                <span>{build.builder}</span>
                <span className="ml-auto">
                  {formatTimeAgo(build.updated)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />

      <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        {totalItems} image{totalItems !== 1 ? 's' : ''}
        {localClusterFilter.length === 1
          ? (selectedNamespace
              ? ` in ${localClusterFilter[0]}/${selectedNamespace}`
              : ` in ${localClusterFilter[0]}`)
          : ` across ${availableClusters.length} cluster${availableClusters.length !== 1 ? 's' : ''}`}
      </div>
    </div>
  )
}

function Summary({
  label,
  value,
  color }: {
  label: string
  value: number
  color: string
}) {
  const COLORS: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-400',
    green: 'bg-green-500/10 text-green-400',
    red: 'bg-red-500/10 text-red-400' }

  return (
    <div className={`flex-1 p-2 rounded-lg text-center ${COLORS[color]}`}>
      <span className="text-lg font-bold">{value}</span>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
