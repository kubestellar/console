import { useState, useMemo, useCallback } from 'react'
import { CheckCircle, AlertTriangle, XCircle, Database } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'

interface CRDHealthProps {
  config?: {
    cluster?: string
  }
}

interface CRD {
  name: string
  group: string
  version: string
  scope: 'Namespaced' | 'Cluster'
  status: 'Established' | 'NotEstablished' | 'Terminating'
  instances: number
  cluster: string
}

type SortByOption = 'status' | 'name' | 'group' | 'instances'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'group' as const, label: 'Group' },
  { value: 'instances' as const, label: 'Instances' },
]

const statusOrder: Record<string, number> = { NotEstablished: 0, Terminating: 1, Established: 2 }

export function CRDHealth({ config: _config }: CRDHealthProps) {
  const { isLoading, deduplicatedClusters } = useClusters()

  const [filterGroup, setFilterGroup] = useState<string>('')

  // Generate cluster-specific CRD data
  const getClusterCRDs = useCallback((clusterName: string): CRD[] => {
    // Generate cluster-specific data using hash of cluster name
    const hash = clusterName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const crdCount = 5 + (hash % 6) // 5-10 CRDs per cluster

    const baseCRDs: CRD[] = [
      { name: 'certificates', group: 'cert-manager.io', version: 'v1', scope: 'Namespaced', status: 'Established', instances: 20 + (hash % 30), cluster: clusterName },
      { name: 'clusterissuers', group: 'cert-manager.io', version: 'v1', scope: 'Cluster', status: 'Established', instances: 1 + (hash % 3), cluster: clusterName },
      { name: 'issuers', group: 'cert-manager.io', version: 'v1', scope: 'Namespaced', status: hash % 7 === 0 ? 'NotEstablished' : 'Established', instances: hash % 7 === 0 ? 0 : 5 + (hash % 10), cluster: clusterName },
      { name: 'prometheuses', group: 'monitoring.coreos.com', version: 'v1', scope: 'Namespaced', status: 'Established', instances: 1 + (hash % 5), cluster: clusterName },
      { name: 'servicemonitors', group: 'monitoring.coreos.com', version: 'v1', scope: 'Namespaced', status: 'Established', instances: 50 + (hash % 100), cluster: clusterName },
      { name: 'alertmanagers', group: 'monitoring.coreos.com', version: 'v1', scope: 'Namespaced', status: hash % 5 === 0 ? 'Terminating' : 'Established', instances: 1 + (hash % 3), cluster: clusterName },
      { name: 'kafkas', group: 'kafka.strimzi.io', version: 'v1beta2', scope: 'Namespaced', status: 'Established', instances: 2 + (hash % 5), cluster: clusterName },
      { name: 'kafkatopics', group: 'kafka.strimzi.io', version: 'v1beta2', scope: 'Namespaced', status: hash % 4 === 0 ? 'NotEstablished' : 'Established', instances: hash % 4 === 0 ? 0 : 10 + (hash % 20), cluster: clusterName },
      { name: 'applications', group: 'argoproj.io', version: 'v1alpha1', scope: 'Namespaced', status: 'Established', instances: 20 + (hash % 50), cluster: clusterName },
      { name: 'appprojects', group: 'argoproj.io', version: 'v1alpha1', scope: 'Namespaced', status: 'Established', instances: 2 + (hash % 5), cluster: clusterName },
    ]

    return baseCRDs.slice(0, crdCount)
  }, [])

  // Generate CRDs for all reachable clusters (useCardData handles cluster filtering)
  const allCRDs: CRD[] = useMemo(() => {
    const reachable = deduplicatedClusters.filter(c => c.reachable !== false)
    const crdsWithClusters: CRD[] = []
    reachable.forEach(c => {
      crdsWithClusters.push(...getClusterCRDs(c.name))
    })
    return crdsWithClusters
  }, [deduplicatedClusters, getClusterCRDs])

  // Apply group filter before passing to useCardData
  const groupFilteredCRDs = useMemo(() => {
    if (!filterGroup) return allCRDs
    return allCRDs.filter(c => c.group === filterGroup)
  }, [allCRDs, filterGroup])

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: crds,
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
  } = useCardData<CRD, SortByOption>(groupFilteredCRDs, {
    filter: {
      searchFields: ['name', 'group', 'cluster'] as (keyof CRD)[],
      clusterField: 'cluster' as keyof CRD,
      storageKey: 'crd-health',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: (a, b) => statusOrder[a.status] - statusOrder[b.status],
        name: commonComparators.string('name'),
        group: commonComparators.string('group'),
        instances: (a, b) => a.instances - b.instances,
      },
    },
    defaultLimit: 5,
  })

  // Get unique groups (from all CRDs before useCardData filtering)
  const groups = useMemo(() => {
    const groupSet = new Set(allCRDs.map(c => c.group))
    return Array.from(groupSet).sort()
  }, [allCRDs])

  const getStatusIcon = (status: CRD['status']) => {
    switch (status) {
      case 'Established': return CheckCircle
      case 'NotEstablished': return XCircle
      case 'Terminating': return AlertTriangle
    }
  }

  const getStatusColor = (status: CRD['status']) => {
    switch (status) {
      case 'Established': return 'green'
      case 'NotEstablished': return 'red'
      case 'Terminating': return 'orange'
    }
  }

  // Compute stats from the filtered set (pre-pagination) by approximating
  // the same filters useCardData applies: cluster filter + search
  const statsSource = useMemo(() => {
    let result = groupFilteredCRDs

    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(c => localClusterFilter.includes(c.cluster))
    }

    // Apply local search
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.group.toLowerCase().includes(query) ||
        c.cluster.toLowerCase().includes(query)
      )
    }

    return result
  }, [groupFilteredCRDs, localClusterFilter, localSearch])

  const healthyCount = statsSource.filter(c => c.status === 'Established').length
  const unhealthyCount = statsSource.filter(c => c.status !== 'Established').length
  const totalInstances = statsSource.reduce((sum, c) => sum + c.instances, 0)

  const showSkeleton = isLoading && allCRDs.length === 0

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={110} height={20} />
          <Skeleton variant="rounded" width={120} height={32} />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Controls - single row */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2" />
        <CardControlsRow
          clusterIndicator={{
            selectedCount: localClusterFilter.length,
            totalCount: availableClusters.length,
          }}
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

      {/* Local Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder="Search CRDs..."
        className="mb-4"
      />

      {availableClusters.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No clusters available
        </div>
      ) : (
        <>
          {/* Scope badge and filter */}
          <div className="flex items-center gap-2 mb-4">
            {localClusterFilter.length === 1 ? (
              <ClusterBadge cluster={localClusterFilter[0]} />
            ) : localClusterFilter.length > 1 ? (
              <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">{localClusterFilter.length} clusters</span>
            ) : (
              <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">All clusters</span>
            )}
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="ml-auto px-2 py-1 rounded bg-secondary border border-border text-xs text-foreground"
            >
              <option value="">All groups</option>
              {groups.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="p-2 rounded-lg bg-teal-500/10 text-center">
              <span className="text-lg font-bold text-teal-400">{totalItems}</span>
              <p className="text-xs text-muted-foreground">CRDs</p>
            </div>
            <div className="p-2 rounded-lg bg-green-500/10 text-center">
              <span className="text-lg font-bold text-green-400">{healthyCount}</span>
              <p className="text-xs text-muted-foreground">Healthy</p>
            </div>
            <div className="p-2 rounded-lg bg-red-500/10 text-center">
              <span className="text-lg font-bold text-red-400">{unhealthyCount}</span>
              <p className="text-xs text-muted-foreground">Issues</p>
            </div>
            <div className="p-2 rounded-lg bg-blue-500/10 text-center">
              <span className="text-lg font-bold text-blue-400">{totalInstances}</span>
              <p className="text-xs text-muted-foreground">Instances</p>
            </div>
          </div>

          {/* CRDs list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {crds.map((crd) => {
              const StatusIcon = getStatusIcon(crd.status)
              const color = getStatusColor(crd.status)

              return (
                <div
                  key={`${crd.cluster}-${crd.group}-${crd.name}`}
                  className="p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`w-4 h-4 text-${color}-400`} />
                      <ClusterBadge cluster={crd.cluster} size="sm" />
                      <span className="text-sm text-foreground">{crd.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Database className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{crd.instances}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1 ml-6 text-xs text-muted-foreground">
                    <span className="truncate">{crd.group}</span>
                    <span className="text-border">|</span>
                    <span>{crd.version}</span>
                    <span className="text-border">|</span>
                    <span>{crd.scope}</span>
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
            {groups.length} API groups {localClusterFilter.length === 1 ? `on ${localClusterFilter[0]}` : `across ${availableClusters.length} cluster${availableClusters.length !== 1 ? 's' : ''}`}
          </div>
        </>
      )}
    </div>
  )
}
