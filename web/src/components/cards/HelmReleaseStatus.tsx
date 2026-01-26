import { useState, useMemo } from 'react'
import { CheckCircle, AlertTriangle, XCircle, Clock, Search, ChevronRight, Filter, ChevronDown, Server } from 'lucide-react'
import { useClusters, useHelmReleases } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useChartFilters } from '../../lib/cards'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'

interface HelmReleaseStatusProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

// Display format for Helm release
interface HelmReleaseDisplay {
  name: string
  namespace: string
  chart: string
  version: string
  appVersion: string
  status: 'deployed' | 'failed' | 'pending' | 'superseded' | 'uninstalling'
  updated: string
  revision: number
  cluster?: string
}

type SortByOption = 'status' | 'name' | 'chart' | 'updated'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'chart' as const, label: 'Chart' },
  { value: 'updated' as const, label: 'Updated' },
]

export function HelmReleaseStatus({ config }: HelmReleaseStatusProps) {
  const { isLoading: clustersLoading } = useClusters()
  const { drillToHelm } = useDrillDownActions()

  // Use chart filters hook for cluster filtering
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    filteredClusters: clusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
  } = useChartFilters({ storageKey: 'helm-release-status' })

  const [selectedNamespace, setSelectedNamespace] = useState<string>(config?.namespace || '')
  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localSearch, setLocalSearch] = useState('')
  const {
    customFilter,
    filterByStatus,
  } = useGlobalFilters()

  // Fetch ALL Helm releases once (not per-cluster) - filter locally
  const {
    releases: allHelmReleases,
    isLoading: releasesLoading,
    isRefreshing,
    refetch,
    isFailed,
    consecutiveFailures,
    lastRefresh
  } = useHelmReleases()

  // Only show loading skeleton when no data exists (not during refresh)
  const isLoading = (clustersLoading || releasesLoading) && allHelmReleases.length === 0

  // Filter by selected clusters locally (no API call)
  const helmReleases = useMemo(() => {
    const clusterNames = new Set(clusters.map(c => c.name))
    return allHelmReleases.filter(r => r.cluster && clusterNames.has(r.cluster))
  }, [allHelmReleases, clusters])

  // Transform API data to display format
  const allReleases = useMemo(() => {
    return helmReleases.map(r => {
      // Parse chart name and version (e.g., "prometheus-25.8.0" -> chart: "prometheus", version: "25.8.0")
      const chartParts = r.chart.match(/^(.+)-(\d+\.\d+\.\d+.*)$/)
      const chartName = chartParts ? chartParts[1] : r.chart
      const chartVersion = chartParts ? chartParts[2] : ''

      return {
        name: r.name,
        namespace: r.namespace,
        chart: chartName,
        version: chartVersion,
        appVersion: r.app_version || '',
        status: r.status.toLowerCase() as 'deployed' | 'failed' | 'pending' | 'superseded' | 'uninstalling',
        updated: r.updated,
        revision: parseInt(r.revision) || 1,
        cluster: r.cluster,
      }
    })
  }, [helmReleases])

  // Get unique namespaces
  const namespaces = useMemo(() => {
    const nsSet = new Set(allReleases.map(r => r.namespace))
    return Array.from(nsSet).sort()
  }, [allReleases])

  // Filter and sort releases by namespace, status, and custom text
  const filteredAndSorted = useMemo(() => {
    let result = allReleases

    // Filter by namespace
    if (selectedNamespace) {
      result = result.filter(r => r.namespace === selectedNamespace)
    }

    // Apply status filter
    result = filterByStatus(result)

    // Apply custom text filter (global)
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(r =>
        r.name.toLowerCase().includes(query) ||
        r.namespace.toLowerCase().includes(query) ||
        r.chart.toLowerCase().includes(query) ||
        r.version.toLowerCase().includes(query)
      )
    }

    // Apply local search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(r =>
        r.name.toLowerCase().includes(query) ||
        r.namespace.toLowerCase().includes(query) ||
        r.chart.toLowerCase().includes(query) ||
        r.version.toLowerCase().includes(query)
      )
    }

    // Sort
    const statusOrder: Record<string, number> = { failed: 0, pending: 1, uninstalling: 2, superseded: 3, deployed: 4 }
    result = [...result].sort((a, b) => {
      let compare = 0
      switch (sortBy) {
        case 'status':
          compare = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5)
          break
        case 'name':
          compare = a.name.localeCompare(b.name)
          break
        case 'chart':
          compare = a.chart.localeCompare(b.chart)
          break
        case 'updated':
          compare = new Date(b.updated).getTime() - new Date(a.updated).getTime()
          break
      }
      return sortDirection === 'asc' ? compare : -compare
    })

    return result
  }, [allReleases, selectedNamespace, filterByStatus, customFilter, sortBy, sortDirection, localSearch])

  // Use pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: releases,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(filteredAndSorted, effectivePerPage)

  const getStatusIcon = (status: HelmReleaseDisplay['status']) => {
    switch (status) {
      case 'deployed': return CheckCircle
      case 'failed': return XCircle
      case 'pending': return Clock
      default: return AlertTriangle
    }
  }

  const getStatusColor = (status: HelmReleaseDisplay['status']) => {
    switch (status) {
      case 'deployed': return 'green'
      case 'failed': return 'red'
      case 'pending': return 'blue'
      default: return 'orange'
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  }

  // Use filteredAndSorted for total counts (not paginated releases)
  const deployedCount = filteredAndSorted.filter(r => r.status === 'deployed').length
  const failedCount = filteredAndSorted.filter(r => r.status === 'failed').length

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={140} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-4" />
        <div className="space-y-2">
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">
      {/* Controls - single row */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {clusters.length}/{availableClusters.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Cluster Filter */}
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
            onRefresh={refetch}
            size="sm"
          />
        </div>
      </div>

      {/* Namespace selector */}
      <div className="mb-4">
        <select
          value={selectedNamespace}
          onChange={(e) => setSelectedNamespace(e.target.value)}
          className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground"
          title="Filter by namespace"
        >
          <option value="">All namespaces</option>
          {namespaces.map(ns => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
      </div>

      {availableClusters.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No clusters available
        </div>
      ) : (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            {localClusterFilter.length === 1 ? (
              <ClusterBadge cluster={localClusterFilter[0]} />
            ) : localClusterFilter.length > 1 ? (
              <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">{localClusterFilter.length} clusters</span>
            ) : (
              <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">All clusters</span>
            )}
            {selectedNamespace && (
              <>
                <span className="text-muted-foreground">/</span>
                <span className="text-sm text-foreground">{selectedNamespace}</span>
              </>
            )}
          </div>

          {/* Local Search */}
          <div className="relative mb-4">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search releases..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
          </div>

          {/* Summary */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1 p-2 rounded-lg bg-blue-500/10 text-center cursor-default" title={`${totalItems} total Helm release${totalItems !== 1 ? 's' : ''}`}>
              <span className="text-lg font-bold text-blue-400">{totalItems}</span>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-green-500/10 text-center cursor-default" title={`${deployedCount} release${deployedCount !== 1 ? 's' : ''} successfully deployed`}>
              <span className="text-lg font-bold text-green-400">{deployedCount}</span>
              <p className="text-xs text-muted-foreground">Deployed</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-red-500/10 text-center cursor-default" title={`${failedCount} release${failedCount !== 1 ? 's' : ''} in failed state`}>
              <span className="text-lg font-bold text-red-400">{failedCount}</span>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>

          {/* Releases list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {releases.map((release, idx) => {
              const StatusIcon = getStatusIcon(release.status)
              const color = getStatusColor(release.status)

              return (
                <div
                  key={idx}
                  onClick={() => drillToHelm(release.cluster || '', release.namespace, release.name, {
                    chart: release.chart,
                    version: release.version,
                    appVersion: release.appVersion,
                    status: release.status,
                    revision: release.revision,
                    updated: release.updated,
                  })}
                  className={`p-3 rounded-lg ${release.status === 'failed' ? 'bg-red-500/10 border border-red-500/20' : 'bg-secondary/30'} hover:bg-secondary/50 transition-colors cursor-pointer group`}
                  title={`${release.name} - ${release.chart}@${release.version} (Revision ${release.revision})`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span title={`Status: ${release.status}`}><StatusIcon className={`w-4 h-4 text-${color}-400`} /></span>
                      <span className="text-sm text-foreground font-medium group-hover:text-purple-400" title={release.name}>{release.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded bg-${color}-500/20 text-${color}-400`} title={`Release status: ${release.status}`}>
                        {release.status}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 ml-6 text-xs text-muted-foreground min-w-0">
                    {release.cluster && <div className="shrink-0"><ClusterBadge cluster={release.cluster} size="sm" /></div>}
                    <span className="truncate" title={`Chart: ${release.chart}, Version: ${release.version}`}>{release.chart}@{release.version}</span>
                    <span className="shrink-0 whitespace-nowrap" title={`Helm revision: ${release.revision}`}>Rev {release.revision}</span>
                    <span className="ml-auto shrink-0 whitespace-nowrap" title={`Last updated: ${new Date(release.updated).toLocaleString()}`}>{formatTime(release.updated)}</span>
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

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            {totalItems} release{totalItems !== 1 ? 's' : ''}{localClusterFilter.length === 1 ? (selectedNamespace ? ` in ${localClusterFilter[0]}/${selectedNamespace}` : ` in ${localClusterFilter[0]}`) : ` across ${clusters.length} cluster${clusters.length !== 1 ? 's' : ''}`}
          </div>
        </>
      )}
    </div>
  )
}
