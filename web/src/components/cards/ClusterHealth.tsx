import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { WifiOff, Cpu, KeyRound } from 'lucide-react'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import { useClusters, ClusterInfo, getDemoClusters } from '../../hooks/useMCP'
import { useCachedGPUNodes } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useMobile } from '../../hooks/useMobile'
import { Skeleton, SkeletonStats, SkeletonList } from '../ui/Skeleton'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter, CardEmptyState } from '../../lib/cards/CardComponents'
import { ClusterDetailModal } from '../clusters/ClusterDetailModal'
import { isClusterUnreachable, isClusterTokenExpired, isClusterHealthy } from '../clusters/utils'
import { StatusBadge } from '../ui/StatusBadge'
import { useCardDemoState, useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useFederationAwareness } from '../../hooks/useFederation'
import { ROUTES } from '../../config/routes'
import { CARD_LOADING_TIMEOUT_MS } from '../../lib/constants/network'
import { CardHeaderActions, CardHeaderRow } from '../../lib/cards/CardComponents'
import { ClusterHealthStatsGrid } from './ClusterHealthStatsGrid'
import { ClusterHealthRow } from './ClusterHealthRow'

type SortByOption = 'status' | 'name' | 'nodes' | 'pods'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'nodes' as const, label: 'Nodes' },
  { value: 'pods' as const, label: 'Pods' },
]

const CLUSTER_SORT_COMPARATORS = {
  status: (a: ClusterInfo, b: ClusterInfo) => {
    if (a.healthy !== b.healthy) return a.healthy ? 1 : -1
    return a.name.localeCompare(b.name)
  },
  name: commonComparators.string<ClusterInfo>('name'),
  nodes: (a: ClusterInfo, b: ClusterInfo) => (b.nodeCount || 0) - (a.nodeCount || 0),
  pods: (a: ClusterInfo, b: ClusterInfo) => (b.podCount || 0) - (a.podCount || 0) }


export function ClusterHealth() {
  const { t } = useTranslation(['cards', 'common'])
  const location = useLocation()
  const {
    deduplicatedClusters: rawClusters,
    isLoading: isLoadingHook,
    isRefreshing,
    error,
    lastRefresh,
    consecutiveFailures,
    isFailed } = useClusters()
  const { nodes: gpuNodes, isDemoFallback, isRefreshing: gpuRefreshing } = useCachedGPUNodes()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { isMobile } = useMobile()
  const { isDemoMode } = useDemoMode()
  const { shouldUseDemoData } = useCardDemoState({ requires: 'agent' })
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const federation = useFederationAwareness()
  const demoClusters = useMemo(() => getDemoClusters(), [])
  const hasResolvedClusterHealth = rawClusters.some(cluster => (
    cluster.healthy !== undefined ||
    cluster.reachable !== undefined ||
    cluster.nodeCount !== undefined ||
    cluster.podCount !== undefined ||
    cluster.errorType !== undefined ||
    cluster.errorMessage !== undefined
  ))
  const [healthFallbackTimedOut, setHealthFallbackTimedOut] = useState(false)

  useEffect(() => {
    if (isDemoMode || shouldUseDemoData || rawClusters.length === 0 || hasResolvedClusterHealth) {
      setHealthFallbackTimedOut(false)
      return
    }

    const timeoutId = window.setTimeout(() => {
      setHealthFallbackTimedOut(true)
    }, CARD_LOADING_TIMEOUT_MS)

    return () => window.clearTimeout(timeoutId)
  }, [hasResolvedClusterHealth, isDemoMode, rawClusters.length, shouldUseDemoData])

  const shouldShowDemoFallback = ((!isDemoMode && shouldUseDemoData) || healthFallbackTimedOut) && !hasResolvedClusterHealth
  const usingSyntheticDemoClusters = shouldShowDemoFallback && !rawClusters.some(cluster => cluster.isDemo)
  const displayClusters = usingSyntheticDemoClusters ? demoClusters : rawClusters
  const effectiveIsRefreshing = !shouldShowDemoFallback && (isRefreshing || gpuRefreshing)
  const effectiveIsDemoData = isDemoMode || isDemoFallback || displayClusters.some(cluster => cluster.isDemo)
  const lastRefreshMs = lastRefresh instanceof Date
    ? lastRefresh.getTime()
    : (lastRefresh ? new Date(lastRefresh).getTime() : null)
  const canOpenClusterDetails = !usingSyntheticDemoClusters

  // Hide the inline stats grid when this card is rendered on the Clusters page,
  // which already has its own StatsOverview showing the same metrics (#11415).
  const hideStatsGrid = location.pathname === ROUTES.CLUSTERS

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: clusters,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search,
      setSearch,
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
    containerStyle } = useCardData<ClusterInfo, SortByOption>(displayClusters, {
    filter: {
      searchFields: ['name', 'context', 'server'],
      clusterField: 'name',
      storageKey: 'cluster-health' },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: CLUSTER_SORT_COMPARATORS },
    defaultLimit: 'unlimited' })

  // Report state to CardWrapper for refresh animation
  // Show skeleton if loading OR if we haven't completed the initial fetch yet
  // This prevents the empty card flash while waiting for initial data
  const hasData = displayClusters.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoadingHook && !hasData && !shouldShowDemoFallback,
    isRefreshing: effectiveIsRefreshing,
    hasAnyData: hasData,
    isFailed: (!!error && !hasData) || (isFailed && !hasResolvedClusterHealth) || healthFallbackTimedOut,
    consecutiveFailures: healthFallbackTimedOut ? Math.max(consecutiveFailures, 1) : consecutiveFailures,
    isDemoData: effectiveIsDemoData,
    lastRefresh: lastRefreshMs })
  const isLoading = showSkeleton

  // Calculate GPU counts per cluster
  const gpuByCluster = useMemo(() => {
    const map: Record<string, number> = {}
    gpuNodes.forEach(node => {
      const clusterKey = node.cluster.split('/')[0]
      map[clusterKey] = (map[clusterKey] || 0) + node.gpuCount
    })
    return map
  }, [gpuNodes])

  // Stats based on globally filtered clusters (not affected by local search/cluster filter)
  const clusterStats = useMemo(() => {
    const filteredForStats = isAllClustersSelected
      ? displayClusters
      : displayClusters.filter(c => selectedClusters.includes(c.name))

    const unreachableClusters = filteredForStats.filter(c => isClusterUnreachable(c)).length
    const tokenExpiredClusters = filteredForStats.filter(c => isClusterTokenExpired(c)).length
    const networkOfflineClusters = unreachableClusters - tokenExpiredClusters
    const healthyClusters = filteredForStats.filter(c => !isClusterUnreachable(c) && isClusterHealthy(c)).length
    const unhealthyClusters = filteredForStats.filter(c => !isClusterUnreachable(c) && !isClusterHealthy(c)).length
    const totalNodes = filteredForStats.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
    const totalCPUs = filteredForStats.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
    const totalPods = filteredForStats.reduce((sum, c) => sum + (c.podCount || 0), 0)
    const filteredGPUNodes = isAllClustersSelected
      ? gpuNodes
      : gpuNodes.filter(n => selectedClusters.some(c => n.cluster.startsWith(c)))
    const totalGPUs = filteredGPUNodes.reduce((sum, n) => sum + n.gpuCount, 0)
    const assignedGPUs = filteredGPUNodes.reduce((sum, n) => sum + n.gpuAllocated, 0)

    return {
      tokenExpiredClusters, networkOfflineClusters,
      healthyClusters, unhealthyClusters, totalNodes, totalCPUs, totalPods,
      totalGPUs, assignedGPUs,
    }
  }, [displayClusters, selectedClusters, isAllClustersSelected, gpuNodes])

  const {
    tokenExpiredClusters, networkOfflineClusters,
    healthyClusters, unhealthyClusters, totalNodes, totalCPUs, totalPods,
    totalGPUs, assignedGPUs,
  } = clusterStats

  // Show skeleton structure during loading to prevent layout shift
  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        {/* Header skeleton */}
        <CardHeaderRow>
          <CardHeaderActions>
            <Skeleton variant="circular" width={16} height={16} />
            <Skeleton variant="text" width={80} height={16} />
          </CardHeaderActions>
          <Skeleton variant="rounded" width={120} height={28} />
        </CardHeaderRow>
        {/* Stats skeleton */}
        <SkeletonStats className="mb-4" />
        {/* List skeleton */}
        <SkeletonList items={4} className="flex-1" />
        {/* Footer skeleton */}
        <div className="mt-4 pt-3 border-t border-border/50">
          <Skeleton variant="text" width="60%" height={12} />
        </div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <CardEmptyState
        icon={Cpu}
        title={t('clusterHealth.noClustersConfigured')}
        message={t('clusterHealth.addClustersPrompt')}
      />
    )
  }

  return (
    <div className="h-full flex flex-col content-loaded">
      {/* Header with controls */}
      <CardHeaderRow>
        <CardHeaderActions>
          <StatusBadge color="purple" title={t('clusterHealth.totalClustersTitle', { count: displayClusters.length })}>
            {displayClusters.length} {t('clusterHealth.clustersLabel')}
          </StatusBadge>
          <RefreshIndicator
            isRefreshing={effectiveIsRefreshing}
            lastUpdated={!shouldShowDemoFallback && lastRefresh ? new Date(lastRefresh) : null}
            size="sm"
            showLabel={false}
          />
        </CardHeaderActions>
      </CardHeaderRow>

      <div className="mb-4 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 shrink basis-64 overflow-hidden">
          {/* Local Search */}
          <CardSearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('common:common.searchClusters')}
            className="mb-0 w-full min-w-0 shrink overflow-hidden text-ellipsis"
          />
        </div>
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
            minClusters: 1 }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection }}
          className="mb-0 max-w-full shrink-0 justify-start gap-2"
        />
      </div>

      {/* Stats — hidden on /clusters page where StatsOverview already shows these metrics */}
      {!hideStatsGrid && (
      <ClusterHealthStatsGrid
        healthyClusters={healthyClusters}
        unhealthyClusters={unhealthyClusters}
        tokenExpiredClusters={tokenExpiredClusters}
        networkOfflineClusters={networkOfflineClusters}
        federationHubs={federation.hubs}
        federationClusters={federation.clusters}
      />
      )}

      {/* Cluster list */}
      <div ref={containerRef} className="flex-1 flex flex-col gap-3 overflow-y-auto" style={containerStyle}>
        {clusters.map((cluster, idx) => (
          <ClusterHealthRow
            key={cluster.name}
            cluster={cluster}
            idx={idx}
            canOpenClusterDetails={canOpenClusterDetails}
            isMobile={isMobile}
            federationClusters={federation.clusters}
            gpuCount={gpuByCluster[cluster.name]}
            onSelect={setSelectedCluster}
          />
        ))}
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

      {/* Footer totals */}
      <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground min-w-0 overflow-hidden">
        <span className="whitespace-nowrap truncate" title={t('clusterHealth.totalNodesTitle')}>{totalNodes} {t('clusterHealth.totalNodes')}</span>
        {totalCPUs > 0 && <span className="whitespace-nowrap truncate" title={t('clusterHealth.totalCpusTitle')}>{totalCPUs} {t('common:common.cpus')}</span>}
        {totalGPUs > 0 && (
          <span className="flex items-center gap-1 text-purple-400 whitespace-nowrap" title={t('clusterHealth.totalGpusTitle', { assigned: assignedGPUs, total: totalGPUs })}>
            <Cpu className="w-3 h-3 shrink-0" />
            {assignedGPUs}/{totalGPUs} {t('common:common.gpus')}
          </span>
        )}
        <span className="whitespace-nowrap truncate" title={t('clusterHealth.totalPodsTitle')}>{totalPods} {t('clusterHealth.totalPods')}</span>
      </div>

      {(error || shouldShowDemoFallback) && (
        <div className="mt-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20" title={t('clusterHealth.checkKubeconfigNetwork')}>
          <div className="text-xs text-yellow-400">
            {t('clusterHealth.unableToConnect')}
          </div>
        </div>
      )}

      {/* Show token expired clusters summary if any */}
      {!error && tokenExpiredClusters > 0 && (
        <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20" title={t('clusterHealth.reauthenticateToRestore')}>
          <div className="flex items-center gap-1.5 text-xs text-red-400">
            <KeyRound className="w-3 h-3" />
            {t('clusterHealth.clustersExpiredCredentials', { count: tokenExpiredClusters })}
          </div>
        </div>
      )}

      {/* Show network offline clusters summary if any */}
      {!error && networkOfflineClusters > 0 && (
        <div className="mt-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20" title={t('clusterHealth.checkNetworkVpn')}>
          <div className="flex items-center gap-1.5 text-xs text-yellow-400">
            <WifiOff className="w-3 h-3" />
            {t('clusterHealth.clustersOfflineNetwork', { count: networkOfflineClusters })}
          </div>
        </div>
      )}

      {/* Cluster Detail Modal */}
      {canOpenClusterDetails && selectedCluster && (
        <ClusterDetailModal
          clusterName={selectedCluster}
          clusterUser={rawClusters.find(c => c.name === selectedCluster)?.user}
          onClose={() => setSelectedCluster(null)}
        />
      )}
    </div>
  )
}
