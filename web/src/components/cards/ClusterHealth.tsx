import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CheckCircle, WifiOff, Cpu, Loader2, ExternalLink, AlertTriangle, KeyRound, Server } from 'lucide-react'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import { useClusters, ClusterInfo } from '../../hooks/useMCP'
import { useCachedGPUNodes } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useMobile } from '../../hooks/useMobile'
import { Skeleton, SkeletonStats, SkeletonList } from '../ui/Skeleton'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter, CardAIActions, CardEmptyState } from '../../lib/cards/CardComponents'
import { ClusterDetailModal } from '../clusters/ClusterDetailModal'
import { CloudProviderIcon, detectCloudProvider, getProviderLabel, CloudProvider } from '../ui/CloudProviderIcon'
import { isClusterUnreachable, isClusterTokenExpired, isClusterHealthy } from '../clusters/utils'
import { StatusBadge } from '../ui/StatusBadge'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useFederationAwareness, getProviderLabel as getFederationProviderLabel, getStateLabel, getStateColorClasses, type FederatedCluster } from '../../hooks/useFederation'
import { ROUTES } from '../../config/routes'
import { Tooltip } from '../ui/Tooltip'

// Console URL generation for cloud providers
function getConsoleUrl(provider: CloudProvider, clusterName: string, apiServerUrl?: string): string | null {
  const serverUrl = apiServerUrl?.toLowerCase() || ''

  switch (provider) {
    case 'eks': {
      const urlRegionMatch = serverUrl.match(/\.([a-z]{2}-[a-z]+-\d)\.eks\.amazonaws\.com/)
      const nameRegionMatch = clusterName.match(/(us|eu|ap|sa|ca|me|af)-(north|south|east|west|central|northeast|southeast)-\d/)
      const region = urlRegionMatch?.[1] || nameRegionMatch?.[0] || 'us-east-1'
      const shortName = clusterName.split('/').pop() || clusterName
      return `https://${region}.console.aws.amazon.com/eks/home?region=${region}#/clusters/${shortName}`
    }
    case 'gke': {
      const gkeMatch = clusterName.match(/gke_([^_]+)_([^_]+)_(.+)/)
      if (gkeMatch) {
        const [, project, location, gkeName] = gkeMatch
        return `https://console.cloud.google.com/kubernetes/clusters/details/${location}/${gkeName}?project=${project}`
      }
      return 'https://console.cloud.google.com/kubernetes/list/overview'
    }
    case 'aks':
      return 'https://portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.ContainerService%2FmanagedClusters'
    case 'openshift': {
      const apiMatch = apiServerUrl?.match(/https?:\/\/api\.([^:/]+)/)
      if (apiMatch) {
        return `https://console-openshift-console.apps.${apiMatch[1]}`
      }
      return null
    }
    case 'oci': {
      const regionMatch = serverUrl.match(/\.([a-z]+-[a-z]+-\d)\.clusters\.oci/)
      const region = regionMatch?.[1] || 'us-ashburn-1'
      return `https://cloud.oracle.com/containers/clusters?region=${region}`
    }
    case 'alibaba':
      return 'https://cs.console.aliyun.com/#/k8s/cluster/list'
    case 'digitalocean':
      return 'https://cloud.digitalocean.com/kubernetes/clusters'
    default:
      return null
  }
}

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
    lastRefresh } = useClusters()
  const { nodes: gpuNodes, isDemoFallback, isRefreshing: gpuRefreshing } = useCachedGPUNodes()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { isMobile } = useMobile()
  const { isDemoMode } = useDemoMode()
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const federation = useFederationAwareness()

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
    containerStyle } = useCardData<ClusterInfo, SortByOption>(rawClusters, {
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
  const hasData = rawClusters.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoadingHook && !hasData,
    isRefreshing: isRefreshing || gpuRefreshing,
    hasAnyData: hasData,
    isFailed: !!error && !hasData,
    consecutiveFailures: error ? 1 : 0,
    isDemoData: isDemoMode || isDemoFallback })
  const isLoading = showSkeleton

  // Calculate GPU counts per cluster
  const gpuByCluster = (() => {
    const map: Record<string, number> = {}
    gpuNodes.forEach(node => {
      const clusterKey = node.cluster.split('/')[0]
      map[clusterKey] = (map[clusterKey] || 0) + node.gpuCount
    })
    return map
  })()

  // Stats based on globally filtered clusters (not affected by local search/cluster filter)
  const filteredForStats = isAllClustersSelected
    ? rawClusters
    : rawClusters.filter(c => selectedClusters.includes(c.name))

  // Use shared isClusterHealthy / isClusterUnreachable from clusters/utils.ts
  // so that Dashboard, My Clusters, and Sidebar all produce identical counts.

  // Stats — uses the same shared helpers as Clusters.tsx and Sidebar.tsx
  const unreachableClusters = filteredForStats.filter(c => isClusterUnreachable(c)).length
  // Token expired = unreachable due to auth error
  const tokenExpiredClusters = filteredForStats.filter(c => isClusterTokenExpired(c)).length
  // Network offline = unreachable but NOT due to auth error
  const networkOfflineClusters = unreachableClusters - tokenExpiredClusters
  // Healthy = not unreachable and (healthy flag OR has reporting nodes)
  const healthyClusters = filteredForStats.filter(c => !isClusterUnreachable(c) && isClusterHealthy(c)).length
  // Unhealthy = not unreachable and not healthy
  const unhealthyClusters = filteredForStats.filter(c => !isClusterUnreachable(c) && !isClusterHealthy(c)).length
  const totalNodes = filteredForStats.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
  const totalCPUs = filteredForStats.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
  const totalPods = filteredForStats.reduce((sum, c) => sum + (c.podCount || 0), 0)
  const filteredGPUNodes = isAllClustersSelected
    ? gpuNodes
    : gpuNodes.filter(n => selectedClusters.some(c => n.cluster.startsWith(c)))
  const totalGPUs = filteredGPUNodes.reduce((sum, n) => sum + n.gpuCount, 0)
  const assignedGPUs = filteredGPUNodes.reduce((sum, n) => sum + n.gpuAllocated, 0)

  // Show skeleton structure during loading to prevent layout shift
  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        {/* Header skeleton */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
          <div className="flex items-center gap-2">
            <Skeleton variant="circular" width={16} height={16} />
            <Skeleton variant="text" width={80} height={16} />
          </div>
          <Skeleton variant="rounded" width={120} height={28} />
        </div>
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
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header with controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
        <div className="flex items-center gap-2">
          <StatusBadge color="purple" title={t('clusterHealth.totalClustersTitle', { count: rawClusters.length })}>
            {rawClusters.length} {t('clusterHealth.clustersLabel')}
          </StatusBadge>
          <RefreshIndicator
            isRefreshing={isRefreshing}
            lastUpdated={lastRefresh ? new Date(lastRefresh) : null}
            size="sm"
            showLabel={false}
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
          className="mb-0"
        />
      </div>

      {/* Local Search */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('common:common.searchClusters')}
        className="mb-4"
      />

      {/* Stats — hidden on /clusters page where StatsOverview already shows these metrics */}
      {!hideStatsGrid && (
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 mb-4">
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 min-w-0 overflow-hidden" title={t('clusterHealth.healthyTooltip', { count: healthyClusters })}>
          <div className="flex items-center gap-1.5 mb-1 min-w-0">
            <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
            <span className="text-xs text-green-400 truncate">{t('common:common.healthy')}</span>
          </div>
          <span className="text-2xl font-bold text-foreground">{healthyClusters}</span>
        </div>
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 min-w-0 overflow-hidden" title={t('clusterHealth.unhealthyTooltip', { count: unhealthyClusters })}>
          <div className="flex items-center gap-1.5 mb-1 min-w-0">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-xs text-red-400 truncate">{t('common:common.unhealthy')}</span>
          </div>
          <span className="text-2xl font-bold text-foreground">{unhealthyClusters}</span>
        </div>
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 min-w-0 overflow-hidden" title={t('clusterHealth.authErrorTooltip', { count: tokenExpiredClusters })}>
          <div className="flex items-center gap-1.5 mb-1 min-w-0">
            <KeyRound className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-xs text-red-400 truncate">{t('clusterHealth.authErrorLabel')}</span>
          </div>
          <span className="text-2xl font-bold text-foreground">{tokenExpiredClusters}</span>
        </div>
        <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 min-w-0 overflow-hidden" title={t('clusterHealth.offlineTooltip', { count: networkOfflineClusters })}>
          <div className="flex items-center gap-1.5 mb-1 min-w-0">
            <WifiOff className="w-4 h-4 text-yellow-400 shrink-0" />
            <span className="text-xs text-yellow-400 truncate">{t('common:common.offline')}</span>
          </div>
          <span className="text-2xl font-bold text-foreground">{networkOfflineClusters}</span>
        </div>
        {(federation.hubs || []).filter(h => h.detected).map(hub => {
          const hubClusters = (federation.clusters || []).filter(
            fc => fc.provider === hub.provider && fc.hubContext === hub.hubContext
          )
          const joinedCount = hubClusters.filter(fc => fc.state === 'joined' || fc.state === 'provisioned').length
          return (
            <div
              key={`${hub.provider}-${hub.hubContext}`}
              className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 min-w-0 overflow-hidden"
              title={`${getFederationProviderLabel(hub.provider)} hub: ${hub.hubContext} — ${joinedCount}/${hubClusters.length} clusters active`}
            >
              <div className="flex items-center gap-1.5 mb-1 min-w-0">
                <Server className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-xs text-blue-400 truncate">{getFederationProviderLabel(hub.provider)}</span>
              </div>
              <span className="text-2xl font-bold text-foreground">{hubClusters.length}</span>
              <span className="text-xs text-muted-foreground ml-1">{t('clusterHealth.clustersLabel').toLowerCase()}</span>
            </div>
          )
        })}
      </div>
      )}

      {/* Cluster list */}
      <div ref={containerRef} className="flex-1 space-y-2 overflow-y-auto" style={containerStyle}>
        {clusters.map((cluster, idx) => {
          const clusterUnreachable = isClusterUnreachable(cluster)
          const clusterTokenExpired = isClusterTokenExpired(cluster)
          const clusterHealthy = !clusterUnreachable && isClusterHealthy(cluster)
          // Only show loading spinner for initial load (health never checked, not unreachable)
          const clusterLoading = !clusterUnreachable && cluster.healthy === undefined
          // Use detected distribution from health check, or detect from name/server/namespaces
          const provider = cluster.distribution as CloudProvider ||
            detectCloudProvider(cluster.name, cluster.server, cluster.namespaces, cluster.user)
          const providerLabel = getProviderLabel(provider)
          const consoleUrl = getConsoleUrl(provider, cluster.name, cluster.server)
          const statusTooltip = clusterLoading
            ? t('clusterHealth.checkingHealth')
            : cluster.healthy
              ? t('clusterHealth.clusterHealthy', { nodes: cluster.nodeCount || 0, pods: cluster.podCount || 0 })
              : clusterTokenExpired
                ? t('clusterHealth.tokenExpired')
                : clusterUnreachable
                  ? t('clusterHealth.offlineCheckNetwork')
                  : cluster.errorMessage || t('clusterHealth.clusterHasIssues')
          return (
            <Tooltip key={cluster.name} content={t('clusterHealth.clickViewDetails', { name: cluster.name })}>
            <div
              data-tour={idx === 0 ? 'drilldown' : undefined}
              className={`group ${isMobile ? 'flex flex-col gap-1.5' : 'flex flex-wrap items-center justify-between gap-y-2'} p-2 rounded-lg border border-border/30 bg-secondary/30 transition-all cursor-pointer hover:bg-secondary/50 hover:border-border/50 min-w-0 overflow-hidden`}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedCluster(cluster.name)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedCluster(cluster.name) } }}
              aria-label={t('clusterHealth.clickViewDetails', { name: cluster.name })}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1" title={statusTooltip}>
                {/* Status icon: green check for healthy, red key for auth error, yellow wifi-off for offline, red triangle for degraded */}
                {clusterLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                ) : clusterTokenExpired ? (
                  <KeyRound className="w-3.5 h-3.5 text-red-400 shrink-0" />
                ) : clusterUnreachable ? (
                  <WifiOff className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                ) : clusterHealthy ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                )}
                <span title={providerLabel} className="shrink-0">
                  <CloudProviderIcon provider={provider} size={14} />
                </span>
                <span className="text-sm text-foreground truncate">{cluster.name}</span>
                {(() => {
                  const pills = (federation.clusters || []).filter(
                    (fc: FederatedCluster) => fc.name === cluster.name || (cluster.server && fc.apiServerURL === cluster.server)
                  )
                  if (pills.length === 0) return null
                  return pills.map((fc: FederatedCluster) => (
                    <span
                      key={`${fc.provider}-${fc.hubContext}`}
                      className={`inline-flex items-center gap-0.5 text-2xs px-1.5 py-0.5 rounded border shrink-0 ${getStateColorClasses(fc.state)}`}
                      title={`${getFederationProviderLabel(fc.provider)} [${fc.hubContext}]: ${getStateLabel(fc.state)}`}
                    >
                      {getFederationProviderLabel(fc.provider)}:{getStateLabel(fc.state)}
                    </span>
                  ))
                })()}
                {/* Warn when cluster is internally reachable but API server is externally unreachable (#4202) */}
                {!clusterUnreachable && !clusterLoading && cluster.externallyReachable === false && (
                  <span
                    className="flex items-center gap-0.5 text-2xs px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 shrink-0"
                    title="API server externally unreachable — cluster healthy internally but external access may be blocked"
                  >
                    <WifiOff className="w-3 h-3" />
                    <span className="hidden @sm:inline">ext. unreachable</span>
                  </span>
                )}
                {consoleUrl && (
                  <a
                    href={consoleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-0.5 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                    title={`Open ${providerLabel} console`}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className={`flex items-center ${isMobile ? 'gap-2 pl-6 flex-wrap' : 'gap-3 shrink-0'} text-xs text-muted-foreground min-w-0 overflow-hidden`}>
                <span className="whitespace-nowrap" title={clusterLoading ? t('common:common.checking') : !clusterUnreachable ? t('clusterHealth.nodesInCluster', { count: cluster.nodeCount || 0 }) : t('clusterHealth.offlineCheckNetwork')}>
                  {clusterLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : !clusterUnreachable ? (cluster.nodeCount || 0) : '-'} {t('common:common.nodes').toLowerCase()}
                </span>
                {!clusterLoading && !clusterUnreachable && (cluster.cpuCores || 0) > 0 && (
                  <span className="whitespace-nowrap" title={t('clusterHealth.totalCpuCores', { count: cluster.cpuCores })}>{cluster.cpuCores} {t('common:common.cpus')}</span>
                )}
                <span className="whitespace-nowrap" title={clusterLoading ? t('common:common.checking') : !clusterUnreachable ? t('clusterHealth.podsRunning', { count: cluster.podCount || 0 }) : t('clusterHealth.offlineCheckNetwork')}>
                  {clusterLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : !clusterUnreachable ? (cluster.podCount || 0) : '-'} {t('common:common.pods').toLowerCase()}
                </span>
                {!clusterLoading && !clusterUnreachable && (gpuByCluster[cluster.name] || 0) > 0 && (
                  <span className="flex items-center gap-1 text-purple-400 whitespace-nowrap" title={t('clusterHealth.gpusAvailable', { count: gpuByCluster[cluster.name] })}>
                    <Cpu className="w-3 h-3 shrink-0" />
                    {gpuByCluster[cluster.name]} {t('common:common.gpus')}
                  </span>
                )}
                {/* AI Diagnose & Repair for unhealthy/offline clusters */}
                {!clusterLoading && (clusterUnreachable || !clusterHealthy) && (
                  <CardAIActions
                    resource={{
                      kind: 'Cluster',
                      name: cluster.name,
                      status: clusterTokenExpired ? 'TokenExpired' : clusterUnreachable ? 'Unreachable' : 'Unhealthy' }}
                    issues={[{
                      name: clusterTokenExpired ? 'Auth Error' : clusterUnreachable ? 'Unreachable' : 'Unhealthy',
                      message: cluster.errorMessage || (clusterTokenExpired ? 'Token expired' : 'Cluster health check failed') }]}
                    additionalContext={{ nodeCount: cluster.nodeCount, podCount: cluster.podCount, server: cluster.server }}
                  />
                )}
              </div>
            </div>
            </Tooltip>
          )
        })}
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

      {error && (
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
      {selectedCluster && (
        <ClusterDetailModal
          clusterName={selectedCluster}
          clusterUser={rawClusters.find(c => c.name === selectedCluster)?.user}
          onClose={() => setSelectedCluster(null)}
        />
      )}
    </div>
  )
}
