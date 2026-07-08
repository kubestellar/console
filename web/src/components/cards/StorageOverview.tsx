import { useMemo } from 'react'
import { HardDrive, Database, CheckCircle, AlertTriangle, Clock } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useCachedPVCs } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useCardLoadingState } from './CardDataContext'
import { formatStat, formatStorageStat } from '../../lib/formatStats'
import { CardControlsRow, CardHeaderRow, CardStatGrid, CardStatHeader } from '../../lib/cards/CardComponents'
import { useChartFilters } from '../../lib/cards/cardHooks'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'
import { Skeleton, SkeletonStats, SkeletonList } from '../ui/Skeleton'

export function StorageOverview() {
  const { t } = useTranslation(['cards', 'common'])
  const { deduplicatedClusters: clusters, isLoading, isRefreshing: clustersRefreshing } = useClusters()
  const { pvcs, isLoading: pvcsLoading, isRefreshing: pvcsRefreshing, consecutiveFailures, isFailed, isDemoFallback, error: pvcsError } = useCachedPVCs()

  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { isDemoMode } = useDemoMode()

  // Report card data state
  const hasData = pvcs.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: (isLoading || pvcsLoading) && !hasData,
    isRefreshing: clustersRefreshing || pvcsRefreshing,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures,
    isDemoData: isDemoFallback || isDemoMode })

  // Local cluster filter
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef } = useChartFilters({
    storageKey: 'storage-overview' })

  // Filter clusters by global selection first
  const globalFilteredClusters = (() => {
    if (isAllClustersSelected) return clusters
    return clusters.filter(c => selectedClusters.includes(c.name))
  })()

  // Apply local cluster filter
  const filteredClusters = (() => {
    if (localClusterFilter.length === 0) return globalFilteredClusters
    return globalFilteredClusters.filter(c => localClusterFilter.includes(c.name))
  })()

  // Filter PVCs by selection and reachability (must match Storage page logic)
  const filteredPVCs = (() => {
    let result = pvcs
    if (!isAllClustersSelected) {
      result = result.filter(p => p.cluster && selectedClusters.includes(p.cluster))
    }
    if (localClusterFilter.length > 0) {
      result = result.filter(p => p.cluster && localClusterFilter.includes(p.cluster))
    }
    // Exclude PVCs from unreachable clusters to match Storage page totals (#7479)
    result = result.filter(p => {
      const cluster = clusters.find(c => c.name === p.cluster)
      return cluster?.reachable !== false
    })
    return result
  })()

  // Calculate storage stats
  const stats = useMemo(() => {
    const totalStorageGB = filteredClusters.reduce((sum, c) => sum + (c.storageGB || 0), 0)
    const totalPVCs = filteredPVCs.length
    const boundPVCs = filteredPVCs.filter(p => p.status === 'Bound').length
    const pendingPVCs = filteredPVCs.filter(p => p.status === 'Pending').length
    // Only count PVCs with explicitly failed statuses — Released, Terminating,
    // and Available are valid lifecycle states, not failures (#8516).
    const PVC_FAILED_STATUSES = ['Failed', 'Lost']
    const failedPVCs = filteredPVCs.filter(p => PVC_FAILED_STATUSES.includes(p.status || '')).length

    // Group by storage class
    const storageClasses = new Map<string, number>()
    filteredPVCs.forEach(p => {
      const sc = p.storageClass || 'default'
      storageClasses.set(sc, (storageClasses.get(sc) || 0) + 1)
    })

    return {
      totalStorageGB,
      totalPVCs,
      boundPVCs,
      pendingPVCs,
      failedPVCs,
      storageClasses: Array.from(storageClasses.entries()).sort((a, b) => b[1] - a[1]),
      clustersWithStorage: filteredClusters.filter(c => (c.storageGB || 0) > 0).length }
  }, [filteredClusters, filteredPVCs])

  // Check if we have real data from reachable clusters — storage data is valid
  // regardless of nodeCount (#6808)
  const hasRealData = !isLoading && filteredClusters.length > 0 &&
    filteredClusters.some(c => c.reachable !== false && c.storageGB !== undefined)

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        {/* Loading label for accessibility / test hook */}
        <p className="sr-only">{t('storageOverview.loading')}</p>
        {/* Header skeleton */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
          <Skeleton variant="text" width={120} height={16} />
          <Skeleton variant="rounded" width={80} height={24} />
        </div>
        {/* Stats skeleton */}
        <SkeletonStats className="mb-4" />
        {/* List skeleton */}
        <SkeletonList items={3} className="flex-1" />
      </div>
    )
  }

  if (showEmptyState) {
    // Distinguish between "no data exists" and "failed to fetch data"
    if (isFailed || pvcsError) {
      return (
        <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
          <AlertTriangle className="w-8 h-8 mb-2 text-red-400 opacity-70" />
          <p className="text-sm text-red-400">{t('storageOverview.fetchFailed', { defaultValue: 'Failed to load storage data' })}</p>
          <p className="text-xs mt-1">{pvcsError || t('storageOverview.fetchFailedHint', { defaultValue: 'Check cluster connectivity and try again' })}</p>
        </div>
      )
    }
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">{t('storageOverview.noData')}</p>
        <p className="text-xs mt-1">{t('storageOverview.noDataHint')}</p>
      </div>
    )
  }

  // When all cluster fetches have failed, show unified error state instead of
  // rendering misleading partial/empty data from stale cache (#11539).
  if (consecutiveFailures > 0 && !(clustersRefreshing || pvcsRefreshing) && !isDemoFallback && !isDemoMode) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mb-2 text-red-400 opacity-70" />
        <p className="text-sm text-red-400">{t('storageOverview.allFetchesFailed')}</p>
        <p className="text-xs mt-1 text-center px-4">{t('storageOverview.allFetchesFailedHint')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <CardHeaderRow>
        <div />
        <CardControlsRow
          clusterIndicator={
            localClusterFilter.length > 0
              ? { selectedCount: localClusterFilter.length, totalCount: availableClusters.length }
              : undefined
          }
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
          className="mb-0"
        />
      </CardHeaderRow>

      {/* Error banner */}
      {pvcsError && (
        <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{t('storageOverview.fetchError', { defaultValue: 'Failed to load PVC data: {{error}}', error: pvcsError })}</span>
        </div>
      )}

      {/* Main stats */}
      <CardStatGrid className="gap-3">
        <div
          className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 cursor-default"
          title={hasRealData
            ? t('storageOverview.totalCapacityTooltip', {
                capacity: formatStorageStat(stats.totalStorageGB),
                count: stats.clustersWithStorage,
              })
            : t('storageOverview.noDataTooltip')}
        >
          <CardStatHeader>
            <Database className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-purple-400">{t('storageOverview.totalCapacity')}</span>
          </CardStatHeader>
          <span className="text-2xl font-bold text-foreground">
            {formatStorageStat(stats.totalStorageGB, hasRealData)}
          </span>
          <div className="text-xs text-muted-foreground mt-1">
            {t('storageOverview.acrossClusters', { count: stats.clustersWithStorage })}
          </div>
        </div>

        <div
          className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 cursor-default transition-colors"
          title={stats.totalPVCs > 0 ? t('storageOverview.pvcCountTooltip', { count: stats.totalPVCs }) : t('storageOverview.noPvcsTooltip')}
        >
          <CardStatHeader>
            <HardDrive className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-blue-400">{t('storageOverview.pvcs')}</span>
          </CardStatHeader>
          <span className="text-2xl font-bold text-foreground">{formatStat(stats.totalPVCs)}</span>
          <div className="text-xs text-muted-foreground mt-1">
            {t('storageOverview.persistentVolumeClaims')}
          </div>
        </div>
      </CardStatGrid>

      {/* PVC Status breakdown */}
      <CardStatGrid className="@md:grid-cols-3 gap-2">
        <div
          className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 cursor-default transition-colors"
          title={stats.boundPVCs > 0 ? t('storageOverview.boundTooltip', { count: stats.boundPVCs }) : t('storageOverview.noBoundTooltip')}
        >
          <CardStatHeader className="gap-1.5">
            <CheckCircle className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400">{t('storageOverview.bound')}</span>
          </CardStatHeader>
          <span className="text-lg font-bold text-foreground">{formatStat(stats.boundPVCs)}</span>
        </div>
        <div
          className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 cursor-default transition-colors"
          title={stats.pendingPVCs > 0 ? t('storageOverview.pendingTooltip', { count: stats.pendingPVCs }) : t('storageOverview.noPendingTooltip')}
        >
          <CardStatHeader className="gap-1.5">
            <Clock className="w-3 h-3 text-yellow-400" />
            <span className="text-xs text-yellow-400">{t('common:common.pending')}</span>
          </CardStatHeader>
          <span className="text-lg font-bold text-foreground">{formatStat(stats.pendingPVCs)}</span>
        </div>
        <div
          className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 cursor-default transition-colors"
          title={stats.failedPVCs > 0 ? t('storageOverview.failedTooltip', { count: stats.failedPVCs }) : t('storageOverview.noFailedTooltip')}
        >
          <CardStatHeader className="gap-1.5">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <span className="text-xs text-red-400">{t('common:common.failed')}</span>
          </CardStatHeader>
          <span className="text-lg font-bold text-foreground">{formatStat(stats.failedPVCs)}</span>
        </div>
      </CardStatGrid>

      {/* Storage Classes */}
      {stats.storageClasses.length > 0 && (
        <div className="flex-1">
          <div className="text-xs text-muted-foreground mb-2">{t('storageOverview.storageClasses')}</div>
          <div className="space-y-1.5">
            {stats.storageClasses.slice(0, 5).map(([name, count]) => (
              <div key={name} className="flex flex-wrap items-center justify-between gap-y-2 p-2 rounded bg-secondary/30 cursor-default" title={t('storageOverview.storageClassTooltip', { name, count })}>
                <span className="text-sm text-foreground truncate" title={name}>{name}</span>
                <span className="text-xs text-muted-foreground">{t('storageOverview.nPVCs', { count })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        {t('storageOverview.footer', { pvcs: stats.totalPVCs, clusters: filteredClusters.length })}
      </div>
    </div>
  )
}
