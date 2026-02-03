import { useState, useMemo } from 'react'
import { CheckCircle, AlertTriangle, XCircle, Clock, ChevronRight, Server } from 'lucide-react'
import { useClusters, useHelmReleases } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import {
  useCardData,
  CardSearchInput, CardControlsRow, CardPaginationFooter,
} from '../../lib/cards'
import { useReportCardDataState } from './CardDataContext'

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

  const [selectedNamespace, setSelectedNamespace] = useState<string>(config?.namespace || '')

  // Fetch ALL Helm releases once (not per-cluster) - filter locally
  const {
    releases: allHelmReleases,
    isLoading: releasesLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
  } = useHelmReleases()

  // Only show loading skeleton when no data exists (not during refresh)
  const isLoading = (clustersLoading || releasesLoading) && allHelmReleases.length === 0

  // hasData should be true once loading completes (even with empty data)
  const hasData = !isLoading || allHelmReleases.length > 0

  // Report card data state to parent CardWrapper for automatic skeleton/refresh handling
  useReportCardDataState({
    isFailed,
    consecutiveFailures,
    isLoading,
    isRefreshing,
    hasData,
  })

  // Transform API data to display format
  const allReleases = useMemo(() => {
    return allHelmReleases.map(r => {
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
  }, [allHelmReleases])

  // Pre-filter by namespace before passing to useCardData
  const namespacedReleases = useMemo(() => {
    if (!selectedNamespace) return allReleases
    return allReleases.filter(r => r.namespace === selectedNamespace)
  }, [allReleases, selectedNamespace])

  // Get unique namespaces (from full unfiltered set)
  const namespaces = useMemo(() => {
    const nsSet = new Set(allReleases.map(r => r.namespace))
    return Array.from(nsSet).sort()
  }, [allReleases])

  const statusOrder: Record<string, number> = { failed: 0, pending: 1, uninstalling: 2, superseded: 3, deployed: 4 }

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: releases,
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
  } = useCardData<HelmReleaseDisplay, SortByOption>(namespacedReleases, {
    filter: {
      searchFields: ['name', 'namespace', 'chart', 'version'] as (keyof HelmReleaseDisplay)[],
      clusterField: 'cluster' as keyof HelmReleaseDisplay,
      statusField: 'status' as keyof HelmReleaseDisplay,
      storageKey: 'helm-release-status',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: (a, b) => (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5),
        name: (a, b) => a.name.localeCompare(b.name),
        chart: (a, b) => a.chart.localeCompare(b.chart),
        updated: (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime(),
      },
    },
    defaultLimit: 5,
  })

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

  // Counts from namespace-filtered releases (pre-pagination summary)
  const deployedCount = namespacedReleases.filter(r => r.status === 'deployed').length
  const failedCount = namespacedReleases.filter(r => r.status === 'failed').length

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
            minClusters: 1,
          }}
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
          <CardSearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder="Search releases..."
            className="mb-4"
          />

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
          <CardPaginationFooter
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10}
            onPageChange={goToPage}
            needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
          />

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            {totalItems} release{totalItems !== 1 ? 's' : ''}{localClusterFilter.length === 1 ? (selectedNamespace ? ` in ${localClusterFilter[0]}/${selectedNamespace}` : ` in ${localClusterFilter[0]}`) : ` across ${availableClusters.length} cluster${availableClusters.length !== 1 ? 's' : ''}`}
          </div>
        </>
      )}
    </div>
  )
}
