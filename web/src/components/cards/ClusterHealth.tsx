import { useState, useMemo } from 'react'
import { CheckCircle, XCircle, WifiOff, Cpu, Loader2, ExternalLink, Search, AlertTriangle, Filter, ChevronDown, Server } from 'lucide-react'
import { useClusters, useGPUNodes, ClusterInfo } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { Skeleton, SkeletonStats, SkeletonList } from '../ui/Skeleton'
import { RefreshButton } from '../ui/RefreshIndicator'
import { useChartFilters } from '../../lib/cards'
import { ClusterDetailModal } from '../clusters/ClusterDetailModal'
import { CloudProviderIcon, detectCloudProvider, getProviderLabel, CloudProvider } from '../ui/CloudProviderIcon'
import { isClusterUnreachable } from '../clusters/utils'

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
      const apiMatch = apiServerUrl?.match(/https?:\/\/api\.([^:\/]+)/)
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


export function ClusterHealth() {
  const {
    deduplicatedClusters: rawClusters,
    isLoading: isLoadingHook,
    isRefreshing,
    error,
    refetch,
    isFailed,
    consecutiveFailures,
    lastRefresh
  } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>('unlimited')
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const [localSearch, setLocalSearch] = useState('')

  // Local cluster filter
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
  } = useChartFilters({
    storageKey: 'cluster-health',
  })

  // Only show skeleton when no cached data exists - prevents flickering on refresh
  const isLoading = isLoadingHook && rawClusters.length === 0

  // Calculate GPU counts per cluster
  const gpuByCluster = useMemo(() => {
    const map: Record<string, number> = {}
    gpuNodes.forEach(node => {
      const clusterKey = node.cluster.split('/')[0]
      map[clusterKey] = (map[clusterKey] || 0) + node.gpuCount
    })
    return map
  }, [gpuNodes])

  // Filter by global cluster selection and local search, then sort
  const filteredAndSorted = useMemo(() => {
    // Apply global cluster filter
    let filtered = isAllClustersSelected
      ? rawClusters
      : rawClusters.filter(c => selectedClusters.includes(c.name))

    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      filtered = filtered.filter(c => localClusterFilter.includes(c.name))
    }

    // Apply local search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query) ||
        c.server?.toLowerCase().includes(query)
      )
    }

    const sorted = [...filtered].sort((a, b) => {
      let result = 0
      if (sortBy === 'status') {
        if (a.healthy !== b.healthy) result = a.healthy ? 1 : -1 // unhealthy first
        else result = a.name.localeCompare(b.name)
      } else if (sortBy === 'name') result = a.name.localeCompare(b.name)
      else if (sortBy === 'nodes') result = (b.nodeCount || 0) - (a.nodeCount || 0)
      else if (sortBy === 'pods') result = (b.podCount || 0) - (a.podCount || 0)
      return sortDirection === 'asc' ? result : -result
    })
    return sorted
  }, [rawClusters, sortBy, sortDirection, selectedClusters, isAllClustersSelected, localSearch, localClusterFilter])

  // Use pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: clusters,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(filteredAndSorted, effectivePerPage)

  // Stats based on filtered clusters
  const filteredForStats = isAllClustersSelected
    ? rawClusters
    : rawClusters.filter(c => selectedClusters.includes(c.name))

  // Use shared utilities for consistent status determination across all cards
  // Match EXACTLY the logic from Clusters.tsx to ensure stats are in sync

  // Helper: A cluster is healthy if it has nodes OR if healthy flag is explicitly true
  // This is the EXACT same logic as Clusters.tsx line 1716
  const isHealthy = (c: ClusterInfo) => (c.nodeCount && c.nodeCount > 0) || c.healthy === true

  // Helper to check if cluster is in initial loading state (no data yet)
  // Only show loading spinners when we truly have NO information about the cluster
  const isInitialLoading = (c: ClusterInfo) => {
    // If unreachable, not loading - show offline state
    if (isClusterUnreachable(c)) return false
    // If we have node data, not loading
    if (c.nodeCount !== undefined && c.nodeCount > 0) return false
    // If healthy flag is set (from kubeconfig or previous health check), not loading
    // The healthy flag is our best indicator until nodeCount is populated
    if (c.healthy === true) return false
    // Only show loading if we have no information at all
    return c.nodeCount === undefined && c.healthy === undefined
  }

  // Stats: EXACT same logic as Clusters.tsx lines 1714-1720
  // Unreachable = reachable explicitly false or connection errors or no nodes
  const unreachableClusters = filteredForStats.filter(c => isClusterUnreachable(c)).length
  // Healthy = not unreachable and (has nodes OR healthy flag)
  const healthyClusters = filteredForStats.filter(c => !isClusterUnreachable(c) && isHealthy(c)).length
  // Unhealthy = not unreachable and not healthy
  const unhealthyClusters = filteredForStats.filter(c => !isClusterUnreachable(c) && !isHealthy(c)).length
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
        <div className="flex items-center justify-between mb-4">
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

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header with refresh */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400" title={`${rawClusters.length} total clusters configured`}>
            {rawClusters.length} clusters
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Cluster count indicator */}
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}

          {/* Cluster filter dropdown */}
          {availableClusters.length >= 1 && (
            <div ref={clusterFilterRef} className="relative">
              <button
                onClick={() => setShowClusterFilter(!showClusterFilter)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                  localClusterFilter.length > 0
                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
                title="Filter by cluster"
              >
                <Filter className="w-3 h-3" />
                <ChevronDown className="w-3 h-3" />
              </button>

              {showClusterFilter && (
                <div className="absolute top-full right-0 mt-1 w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50">
                  <div className="p-1">
                    <button
                      onClick={clearClusterFilter}
                      className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                        localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      All clusters
                    </button>
                    {availableClusters.map(cluster => (
                      <button
                        key={cluster.name}
                        onClick={() => toggleClusterFilter(cluster.name)}
                        className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                          localClusterFilter.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                        }`}
                      >
                        {cluster.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
          <RefreshButton
            isRefreshing={isRefreshing}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={() => refetch()}
          />
        </div>
      </div>

      {/* Local Search */}
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search clusters..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20" title={`${healthyClusters} clusters are healthy and responding`}>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-xs text-green-400">Healthy</span>
          </div>
          <span className="text-2xl font-bold text-foreground">{healthyClusters}</span>
        </div>
        <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20" title={`${unhealthyClusters} clusters are reachable but have issues`}>
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-orange-400">Unhealthy</span>
          </div>
          <span className="text-2xl font-bold text-foreground">{unhealthyClusters}</span>
        </div>
        <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20" title={`${unreachableClusters} clusters cannot be contacted - check network connection`}>
          <div className="flex items-center gap-2 mb-1">
            <WifiOff className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-yellow-400">Offline</span>
          </div>
          <span className="text-2xl font-bold text-foreground">{unreachableClusters}</span>
        </div>
      </div>

      {/* Cluster list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {clusters.map((cluster, idx) => {
          const clusterUnreachable = isClusterUnreachable(cluster)
          const clusterHealthy = !clusterUnreachable && isHealthy(cluster)
          // Only show loading spinner for initial load (no cached data)
          // During refresh with cached data, show the cached data
          const clusterLoading = isInitialLoading(cluster)
          // Use detected distribution from health check, or detect from name/server/namespaces
          const provider = cluster.distribution as CloudProvider ||
            detectCloudProvider(cluster.name, cluster.server, cluster.namespaces, cluster.user)
          const providerLabel = getProviderLabel(provider)
          const consoleUrl = getConsoleUrl(provider, cluster.name, cluster.server)
          const statusTooltip = clusterLoading
            ? 'Checking cluster health...'
            : cluster.healthy
              ? `Cluster is healthy with ${cluster.nodeCount || 0} nodes and ${cluster.podCount || 0} pods`
              : clusterUnreachable
                ? 'Offline - check network connection'
                : cluster.errorMessage || 'Cluster has issues - click to view details'
          return (
            <div
              key={cluster.name}
              data-tour={idx === 0 ? 'drilldown' : undefined}
              className="flex items-center justify-between p-2 rounded-lg border border-border/30 bg-secondary/30 transition-all cursor-pointer hover:bg-secondary/50 hover:border-border/50"
              onClick={() => setSelectedCluster(cluster.name)}
              title={`Click to view details for ${cluster.name}`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1" title={statusTooltip}>
                {/* Status icon: green check for healthy, yellow wifi-off for offline, orange triangle for degraded */}
                {clusterLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                ) : clusterUnreachable ? (
                  <WifiOff className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                ) : clusterHealthy ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                )}
                <span title={providerLabel} className="shrink-0">
                  <CloudProviderIcon provider={provider} size={14} />
                </span>
                <span className="text-sm text-foreground truncate">{cluster.name}</span>
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
              <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                <span title={clusterLoading ? 'Checking...' : !clusterUnreachable ? `${cluster.nodeCount || 0} worker nodes in cluster` : 'Offline - check network connection'}>
                  {clusterLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : !clusterUnreachable ? (cluster.nodeCount || 0) : '-'} nodes
                </span>
                {!clusterLoading && !clusterUnreachable && (cluster.cpuCores || 0) > 0 && (
                  <span title={`${cluster.cpuCores} total CPU cores available`}>{cluster.cpuCores} CPUs</span>
                )}
                <span title={clusterLoading ? 'Checking...' : !clusterUnreachable ? `${cluster.podCount || 0} pods running in cluster` : 'Offline - check network connection'}>
                  {clusterLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : !clusterUnreachable ? (cluster.podCount || 0) : '-'} pods
                </span>
                {!clusterLoading && !clusterUnreachable && (gpuByCluster[cluster.name] || 0) > 0 && (
                  <span className="flex items-center gap-1 text-purple-400" title={`${gpuByCluster[cluster.name]} GPUs available for workloads`}>
                    <Cpu className="w-3 h-3" />
                    {gpuByCluster[cluster.name]} GPUs
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={perPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}

      {/* Footer totals */}
      <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span title="Total worker nodes across all filtered clusters">{totalNodes} total nodes</span>
        {totalCPUs > 0 && <span title="Total CPU cores across all filtered clusters">{totalCPUs} CPUs</span>}
        {totalGPUs > 0 && (
          <span className="flex items-center gap-1 text-purple-400" title={`${assignedGPUs} GPUs assigned out of ${totalGPUs} total`}>
            <Cpu className="w-3 h-3" />
            {assignedGPUs}/{totalGPUs} GPUs
          </span>
        )}
        <span title="Total pods running across all filtered clusters">{totalPods} total pods</span>
      </div>

      {error && (
        <div className="mt-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20" title="Check your kubeconfig and network connectivity">
          <div className="text-xs text-yellow-400">
            Unable to connect to clusters - showing demo data
          </div>
        </div>
      )}

      {/* Show offline clusters summary if any */}
      {!error && unreachableClusters > 0 && (
        <div className="mt-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20" title="Check network connectivity and VPN status">
          <div className="flex items-center gap-1.5 text-xs text-yellow-400">
            <WifiOff className="w-3 h-3" />
            {unreachableClusters} cluster(s) offline - check network connection
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
