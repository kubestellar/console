import { useState, useMemo, useEffect, useRef } from 'react'
import { CheckCircle, XCircle, RotateCcw, ArrowUp, Clock, ChevronRight } from 'lucide-react'
import { useClusters, useHelmReleases, useHelmHistory, type HelmHistoryEntry } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import {
  useCardData,
  CardSearchInput, CardControlsRow, CardPaginationFooter,
} from '../../lib/cards'

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

const STATUS_ORDER: Record<string, number> = {
  failed: 0,
  'pending-upgrade': 1,
  'pending-rollback': 2,
  deployed: 3,
  superseded: 4,
}

export function HelmHistory({ config }: HelmHistoryProps) {
  const { deduplicatedClusters: allClusters, isLoading: clustersLoading } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [selectedRelease, setSelectedRelease] = useState<string>(config?.release || '')

  // Track local selection state for global filter sync
  const savedLocalCluster = useRef<string>('')
  const savedLocalRelease = useRef<string>('')
  const wasGlobalFilterActive = useRef(false)

  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()
  const { drillToHelm } = useDrillDownActions()

  // Sync local selection with global filter changes
  useEffect(() => {
    const isGlobalFilterActive = !isAllClustersSelected && globalSelectedClusters.length > 0

    if (isGlobalFilterActive && !wasGlobalFilterActive.current) {
      // Global filter just became active - save current local selection
      savedLocalCluster.current = selectedCluster
      savedLocalRelease.current = selectedRelease
      // Auto-select first cluster from global filter if current selection is not in filter
      if (selectedCluster && !globalSelectedClusters.includes(selectedCluster)) {
        setSelectedCluster(globalSelectedClusters[0] || '')
        setSelectedRelease('')
      }
    } else if (!isGlobalFilterActive && wasGlobalFilterActive.current) {
      // Global filter just cleared - restore previous local selection
      if (savedLocalCluster.current) {
        setSelectedCluster(savedLocalCluster.current)
        setSelectedRelease(savedLocalRelease.current)
        savedLocalCluster.current = ''
        savedLocalRelease.current = ''
      }
    }

    wasGlobalFilterActive.current = isGlobalFilterActive
    // Note: selectedCluster/selectedRelease deliberately excluded to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSelectedClusters, isAllClustersSelected])

  // Fetch ALL Helm releases from all clusters once (not per-cluster)
  const { releases: allHelmReleases, isLoading: releasesLoading } = useHelmReleases()

  // Look up namespace from the selected release (required for helm history command)
  const selectedReleaseNamespace = useMemo(() => {
    if (!selectedCluster || !selectedRelease) return undefined
    const release = allHelmReleases.find(
      r => r.cluster === selectedCluster && r.name === selectedRelease
    )
    return release?.namespace
  }, [allHelmReleases, selectedCluster, selectedRelease])

  // Fetch history for selected release (hook handles caching)
  const {
    history: rawHistory,
    isLoading: historyLoading,
    isRefreshing: historyRefreshing,
  } = useHelmHistory(
    selectedCluster || undefined,
    selectedRelease || undefined,
    selectedReleaseNamespace
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

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: history,
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
      clusterFilterRef,
    },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection,
    },
  } = useCardData<HelmHistoryEntry, SortByOption>(rawHistory, {
    filter: {
      searchFields: ['chart', 'status', 'description'] as (keyof HelmHistoryEntry)[],
      customPredicate: (item, query) => String(item.revision).includes(query),
      storageKey: 'helm-history',
    },
    sort: {
      defaultField: 'revision',
      defaultDirection: 'desc',
      comparators: {
        revision: (a, b) => a.revision - b.revision,
        status: (a, b) => (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5),
        updated: (a, b) => new Date(a.updated).getTime() - new Date(b.updated).getTime(),
      },
    },
    defaultLimit: 5,
  })

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
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {totalItems > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">
              {totalItems} revisions
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
            minClusters: 1,
          }}
          clusterIndicator={localClusterFilter.length > 0 ? {
            selectedCount: localClusterFilter.length,
            totalCount: availableClusters.length,
          } : undefined}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection,
          }}
        />
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
      ) : (historyLoading || historyRefreshing) && rawHistory.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="flex items-center gap-2 text-sm text-blue-400">
            <RotateCcw className="w-4 h-4 animate-spin" />
            <span>Loading history for {selectedRelease}...</span>
          </div>
          <Skeleton variant="rounded" height={50} className="w-full" />
          <Skeleton variant="rounded" height={50} className="w-full" />
        </div>
      ) : (
        <>
          {/* Scope badge - clickable to drill down */}
          <button
            onClick={() => drillToHelm(selectedCluster, selectedReleaseNamespace || 'default', selectedRelease, {
              history: rawHistory,
              currentRevision: rawHistory.find(h => h.status === 'deployed')?.revision,
            })}
            className="group flex items-center gap-2 mb-4 p-2 -m-2 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer min-w-0 max-w-full overflow-hidden"
            title={`Click to view details for ${selectedRelease}`}
          >
            <div className="shrink-0"><ClusterBadge cluster={selectedCluster} /></div>
            <span className="text-muted-foreground shrink-0">/</span>
            <span className="text-sm text-foreground group-hover:text-primary transition-colors truncate min-w-0">{selectedRelease}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>

          {/* Local Search */}
          <CardSearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder="Search history..."
            className="mb-4"
          />

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
                      <div
                        key={idx}
                        className="relative pl-6 group cursor-pointer"
                        onClick={() => drillToHelm(selectedCluster, selectedReleaseNamespace || 'default', selectedRelease, {
                          history: rawHistory,
                          currentRevision: entry.revision,
                          selectedRevision: entry,
                        })}
                        title={`Click to view details for revision ${entry.revision}`}
                      >
                        {/* Timeline dot */}
                        <div className={`absolute left-0 top-2 w-4 h-4 rounded-full flex items-center justify-center ${
                          isCurrent ? 'bg-green-500' : 'bg-secondary border border-border'
                        }`}>
                          <StatusIcon className={`w-2.5 h-2.5 ${isCurrent ? 'text-foreground' : `text-${color}-400`}`} />
                        </div>

                        <div className={`p-2 rounded-lg transition-colors ${isCurrent ? 'bg-green-500/10 border border-green-500/20 group-hover:bg-green-500/20' : 'bg-secondary/30 group-hover:bg-secondary/50'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">Rev {entry.revision}</span>
                              {isCurrent && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                                  current
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{formatDate(entry.updated)}</span>
                              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            <span>{entry.chart}</span>
                            {entry.description && (
                              <>
                                <span className="mx-2">•</span>
                                <span className="truncate">{entry.description}</span>
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
          <CardPaginationFooter
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10}
            onPageChange={goToPage}
            needsPagination={needsPagination}
          />

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            Showing {history.length} of {totalItems} revisions
          </div>
        </>
      )}
    </div>
  )
}
