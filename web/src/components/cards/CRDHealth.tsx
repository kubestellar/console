import { useState, useMemo, useCallback } from 'react'
import { FileCode, CheckCircle, AlertTriangle, XCircle, Database, Search, AlertCircle } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { usePersistedClusterSelection } from '../../hooks/usePersistedClusterSelection'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'

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

export function CRDHealth({ config }: CRDHealthProps) {
  const { isLoading, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  // Use persisted cluster selection - survives global filter changes
  const {
    selectedCluster,
    setSelectedCluster,
    availableClusters: clusters,
    isOutsideGlobalFilter,
  } = usePersistedClusterSelection({
    storageKey: 'crd-health',
    defaultValue: config?.cluster || 'all',
    allowAll: true,
  })
  const [filterGroup, setFilterGroup] = useState<string>('')
  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localSearch, setLocalSearch] = useState('')
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
  } = useGlobalFilters()

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

  // Mock CRD data - generates CRDs for each cluster
  const allCRDs: CRD[] = useMemo(() => {
    if (selectedCluster && selectedCluster !== 'all') {
      return getClusterCRDs(selectedCluster)
    }

    // When 'all' selected, show CRDs from all clusters matching global filter
    const clustersToShow = isAllClustersSelected
      ? clusters
      : clusters.filter(c => globalSelectedClusters.includes(c.name))

    const crdsWithClusters: CRD[] = []
    clustersToShow.forEach(c => {
      crdsWithClusters.push(...getClusterCRDs(c.name))
    })
    return crdsWithClusters
  }, [selectedCluster, clusters, isAllClustersSelected, globalSelectedClusters, getClusterCRDs])

  // Get unique groups
  const groups = useMemo(() => {
    const groupSet = new Set(allCRDs.map(c => c.group))
    return Array.from(groupSet).sort()
  }, [allCRDs])

  // Filter and sort CRDs
  const filteredAndSorted = useMemo(() => {
    let result = filterGroup ? allCRDs.filter(c => c.group === filterGroup) : allCRDs

    // Apply local search
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(crd =>
        crd.name.toLowerCase().includes(query) ||
        crd.group.toLowerCase().includes(query) ||
        crd.version.toLowerCase().includes(query) ||
        crd.scope.toLowerCase().includes(query) ||
        crd.cluster.toLowerCase().includes(query)
      )
    }

    // Sort
    const statusOrder: Record<string, number> = { NotEstablished: 0, Terminating: 1, Established: 2 }
    result = [...result].sort((a, b) => {
      let compare = 0
      switch (sortBy) {
        case 'status':
          compare = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5)
          break
        case 'name':
          compare = a.name.localeCompare(b.name)
          break
        case 'group':
          compare = a.group.localeCompare(b.group)
          break
        case 'instances':
          compare = b.instances - a.instances
          break
      }
      return sortDirection === 'asc' ? compare : -compare
    })

    return result
  }, [allCRDs, filterGroup, sortBy, sortDirection, localSearch])

  // Use pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: crds,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(filteredAndSorted, effectivePerPage)

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

  const healthyCRDs = filteredAndSorted.filter(c => c.status === 'Established').length
  const unhealthyCRDs = filteredAndSorted.filter(c => c.status !== 'Established').length
  const totalInstances = filteredAndSorted.reduce((sum, c) => sum + c.instances, 0)
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
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-teal-400" />
          <span className="text-sm font-medium text-muted-foreground">CRD Health</span>
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
            isRefreshing={isRefreshing}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={refetch}
            size="sm"
          />
        </div>
      </div>

      {/* Cluster selector */}
      <div className="mb-4">
        <select
          value={selectedCluster}
          onChange={(e) => setSelectedCluster(e.target.value)}
          className={`w-full px-3 py-1.5 rounded-lg bg-secondary border text-sm text-foreground ${
            isOutsideGlobalFilter ? 'border-orange-500/50' : 'border-border'
          }`}
        >
          <option value="all">All Clusters</option>
          {clusters.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
          {/* Show the selected cluster even if outside global filter */}
          {isOutsideGlobalFilter && (
            <option value={selectedCluster}>{selectedCluster} (filtered out)</option>
          )}
        </select>
        {isOutsideGlobalFilter && (
          <div className="flex items-center gap-1 mt-1 text-xs text-orange-400">
            <AlertCircle className="w-3 h-3" />
            <span>Selection outside global filter</span>
          </div>
        )}
      </div>

      {/* Local Search */}
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search CRDs..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {clusters.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No clusters available
        </div>
      ) : (
        <>
          {/* Scope badge and filter */}
          <div className="flex items-center gap-2 mb-4">
            {selectedCluster ? (
              <ClusterBadge cluster={selectedCluster} />
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
              <span className="text-lg font-bold text-teal-400">{filteredAndSorted.length}</span>
              <p className="text-xs text-muted-foreground">CRDs</p>
            </div>
            <div className="p-2 rounded-lg bg-green-500/10 text-center">
              <span className="text-lg font-bold text-green-400">{healthyCRDs}</span>
              <p className="text-xs text-muted-foreground">Healthy</p>
            </div>
            <div className="p-2 rounded-lg bg-red-500/10 text-center">
              <span className="text-lg font-bold text-red-400">{unhealthyCRDs}</span>
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
            {groups.length} API groups {selectedCluster === 'all' ? 'across all clusters' : `on ${selectedCluster}`}
          </div>
        </>
      )}
    </div>
  )
}
