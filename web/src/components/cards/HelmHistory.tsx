import { useState, useMemo } from 'react'
import { History, CheckCircle, XCircle, RotateCcw, ArrowUp, Clock, Search } from 'lucide-react'
import { useClusters, useHelmReleases, useHelmHistory } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'

interface HelmHistoryProps {
  config?: {
    cluster?: string
    release?: string
    namespace?: string
  }
}

type SortByOption = 'revision' | 'status' | 'updated'

const SORT_OPTIONS = [
  { value: 'revision' as const, label: 'Revision' },
  { value: 'status' as const, label: 'Status' },
  { value: 'updated' as const, label: 'Updated' },
]

export function HelmHistory({ config }: HelmHistoryProps) {
  const { clusters: allClusters, isLoading: clustersLoading } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [selectedRelease, setSelectedRelease] = useState<string>(config?.release || '')
  const [sortBy, setSortBy] = useState<SortByOption>('revision')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localSearch, setLocalSearch] = useState('')
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()

  // Fetch ALL Helm releases from all clusters once (not per-cluster)
  const { releases: allHelmReleases, isLoading: releasesLoading } = useHelmReleases()

  // Fetch history for selected release (hook handles caching)
  const {
    history: rawHistory,
    isLoading: historyLoading,
    isRefreshing: historyRefreshing,
    refetch: refetchHistory,
    isFailed,
    consecutiveFailures,
    lastRefresh
  } = useHelmHistory(
    selectedCluster || undefined,
    selectedRelease || undefined,
    undefined
  )

  // Only show skeleton when no cached data exists
  const isLoading = (clustersLoading || releasesLoading) && allHelmReleases.length === 0

  // Apply global filters to clusters
  const clusters = useMemo(() => {
    let result = allClusters

    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query)
      )
    }

    return result
  }, [allClusters, globalSelectedClusters, isAllClustersSelected, customFilter])

  // Filter releases locally by selected cluster (no API call)
  const filteredReleases = useMemo(() => {
    if (!selectedCluster) return allHelmReleases
    return allHelmReleases.filter(r => r.cluster === selectedCluster)
  }, [allHelmReleases, selectedCluster])

  // Get unique release names for dropdown
  const releases = useMemo(() => {
    const releaseSet = new Set(filteredReleases.map(r => r.name))
    return Array.from(releaseSet).sort()
  }, [filteredReleases])

  // Sort and filter history
  const sortedHistory = useMemo(() => {
    const statusOrder: Record<string, number> = { failed: 0, 'pending-upgrade': 1, 'pending-rollback': 2, deployed: 3, superseded: 4 }
    let result = [...rawHistory]

    // Apply local search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(h =>
        h.chart.toLowerCase().includes(query) ||
        h.status.toLowerCase().includes(query) ||
        (h.description?.toLowerCase() || '').includes(query) ||
        String(h.revision).includes(query)
      )
    }

    return result.sort((a, b) => {
      let compare = 0
      switch (sortBy) {
        case 'revision':
          compare = b.revision - a.revision
          break
        case 'status':
          compare = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5)
          break
        case 'updated':
          compare = new Date(b.updated).getTime() - new Date(a.updated).getTime()
          break
      }
      return sortDirection === 'asc' ? -compare : compare
    })
  }, [rawHistory, sortBy, sortDirection, localSearch])

  // Use pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: history,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(sortedHistory, effectivePerPage)

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'deployed': return CheckCircle
      case 'failed': return XCircle
      case 'pending-rollback': return RotateCcw
      case 'pending-upgrade': return ArrowUp
      default: return Clock
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'deployed': return 'green'
      case 'failed': return 'red'
      case 'superseded': return 'gray'
      default: return 'blue'
    }
  }

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={120} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-4" />
        <div className="space-y-2">
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium text-muted-foreground">Helm History</span>
          {totalItems > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">
              {totalItems} revisions
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
            isRefreshing={historyRefreshing || historyLoading}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={refetchHistory}
            size="sm"
          />
        </div>
      </div>

      {/* Selectors */}
      <div className="flex gap-2 mb-4">
        <select
          value={selectedCluster}
          onChange={(e) => {
            setSelectedCluster(e.target.value)
            setSelectedRelease('')
          }}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground"
        >
          <option value="">Select cluster...</option>
          {clusters.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={selectedRelease}
          onChange={(e) => setSelectedRelease(e.target.value)}
          disabled={!selectedCluster || releasesLoading}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground disabled:opacity-50"
        >
          <option value="">Select release...</option>
          {releases.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {!selectedCluster || !selectedRelease ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a cluster and release to view history
        </div>
      ) : historyLoading && rawHistory.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <Skeleton variant="rounded" height={50} className="w-full" />
        </div>
      ) : (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            <ClusterBadge cluster={selectedCluster} />
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-foreground">{selectedRelease}</span>
          </div>

          {/* Local Search */}
          <div className="relative mb-4">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search history..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
          </div>

          {/* History timeline */}
          <div className="flex-1 overflow-y-auto">
            {history.length === 0 ? (
              <div className="flex items-center justify-center text-muted-foreground text-sm py-4">
                No history found for this release
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[7px] top-4 bottom-4 w-0.5 bg-border" />

                {/* History entries */}
                <div className="space-y-3">
                  {history.map((entry, idx) => {
                    const StatusIcon = getStatusIcon(entry.status)
                    const color = getStatusColor(entry.status)
                    const isCurrent = entry.status === 'deployed'

                    return (
                      <div key={idx} className="relative pl-6">
                        {/* Timeline dot */}
                        <div className={`absolute left-0 top-2 w-4 h-4 rounded-full flex items-center justify-center ${
                          isCurrent ? 'bg-green-500' : 'bg-secondary border border-border'
                        }`}>
                          <StatusIcon className={`w-2.5 h-2.5 ${isCurrent ? 'text-foreground' : `text-${color}-400`}`} />
                        </div>

                        <div className={`p-2 rounded-lg ${isCurrent ? 'bg-green-500/10 border border-green-500/20' : 'bg-secondary/30'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">Rev {entry.revision}</span>
                              {isCurrent && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                                  current
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">{formatDate(entry.updated)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span>{entry.chart}</span>
                            {entry.description && (
                              <>
                                <span className="mx-2">•</span>
                                <span>{entry.description}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
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
            Showing {history.length} of {totalItems} revisions
          </div>
        </>
      )}
    </div>
  )
}
