import { useMemo, useState } from 'react'
import { CheckCircle, XCircle, Clock, ChevronRight, Server } from 'lucide-react'
import { ClusterBadge } from '../../ui/ClusterBadge'
import {
  useCardData,
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
} from '../../../lib/cards'

interface BuildpacksStatusProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

interface BuildpackBuild {
  name: string
  namespace: string
  builder: string
  image: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  lastBuildTime: string
  cluster?: string
}

type SortByOption = 'status' | 'name' | 'builder' | 'updated'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'builder' as const, label: 'Builder' },
  { value: 'updated' as const, label: 'Updated' },
]

export function BuildpacksStatus({ config }: BuildpacksStatusProps) {
  const [selectedNamespace, setSelectedNamespace] = useState<string>(
    config?.namespace || ''
  )
  //Demo data - replace with real API call when backend is implemented
  const demoBuilds: BuildpackBuild[] = [
    {
      name: 'frontend-app',
      namespace: 'apps',
      builder: 'paketo-builder',
      image: 'registry.io/frontend:v1.2.0',
      status: 'succeeded',
      lastBuildTime: new Date(Date.now() - 3600000).toISOString(),
      cluster: 'gke-prod',
    },
    {
      name: 'payments-api',
      namespace: 'backend',
      builder: 'heroku-builder',
      image: 'registry.io/payments:v3.4.1',
      status: 'failed',
      lastBuildTime: new Date(Date.now() - 7200000).toISOString(),
      cluster: 'eks-prod-us-east-1',
    },
    {
      name: 'auth-service',
      namespace: 'security',
      builder: 'paketo-builder',
      image: 'registry.io/auth:v2.1.0',
      status: 'pending',
      lastBuildTime: new Date(Date.now() - 1800000).toISOString(),
      cluster: 'gke-prod',
    },
  ]

  const clusterFiltered = useMemo(() => {
    if (!config?.cluster) return demoBuilds
    return demoBuilds.filter(b => b.cluster === config.cluster)
  }, [config?.cluster])

  const namespacedBuilds = useMemo(() => {
    if (!selectedNamespace) return clusterFiltered
    return clusterFiltered.filter(b => b.namespace === selectedNamespace)
  }, [clusterFiltered, selectedNamespace])

  const namespaces = useMemo(() => {
    return Array.from(new Set(clusterFiltered.map(b => b.namespace))).sort()
  }, [clusterFiltered])

  const statusOrder: Record<BuildpackBuild['status'], number> = {
    failed: 0,
    cancelled: 1,
    pending: 2,
    running: 3,
    succeeded: 4,
  }

  const {
    items: builds,
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
  } = useCardData<BuildpackBuild, SortByOption>(namespacedBuilds, {
    filter: {
      searchFields: ['name', 'namespace', 'builder', 'image'],
      clusterField: 'cluster',
      statusField: 'status',
      storageKey: 'buildpacks-status',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: (a, b) =>
          statusOrder[a.status] - statusOrder[b.status],
        name: (a, b) => a.name.localeCompare(b.name),
        builder: (a, b) => a.builder.localeCompare(b.builder),
        updated: (a, b) =>
          new Date(b.lastBuildTime).getTime() -
          new Date(a.lastBuildTime).getTime(),
      },
    },
    defaultLimit: 5,
  })

  const successCount = namespacedBuilds.filter(b => b.status === 'succeeded').length
  const failedCount = namespacedBuilds.filter(b => b.status === 'failed').length
  const pendingCount = namespacedBuilds.filter(b => b.status === 'pending').length

  const getStatusIcon = (status: BuildpackBuild['status']) => {
    switch (status) {
      case 'succeeded': return CheckCircle
      case 'failed':
      case 'cancelled': return XCircle
      default: return Clock
    }
  }

  const getStatusColor = (status: BuildpackBuild['status']) => {
    switch (status) {
      case 'succeeded': return 'green'
      case 'failed':
      case 'cancelled': return 'red'
      case 'pending': return 'yellow'
      case 'running': return 'blue'
      default: return 'gray'
    }
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">

      {/* Controls */}
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

      {/* Namespace Selector */}
      <div className="mb-4">
        <select
          value={selectedNamespace}
          onChange={(e) => setSelectedNamespace(e.target.value)}
          className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground"
        >
          <option value="">All namespaces</option>
          {namespaces.map(ns => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
      </div>

      {/* Scope Badge */}
      <div className="flex items-center gap-2 mb-4">
        {localClusterFilter.length === 1 ? (
          <ClusterBadge cluster={localClusterFilter[0]} />
        ) : (
          <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">
            All clusters
          </span>
        )}

        {selectedNamespace && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-foreground">{selectedNamespace}</span>
          </>
        )}
      </div>

      {/* Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder="Search builds..."
        className="mb-4"
      />

      {/* Summary */}
      <div className="flex gap-2 mb-4">
        <SummaryBlock label="Total" value={totalItems} color="blue" />
        <SummaryBlock label="Pending" value={pendingCount} color="yellow" />
        <SummaryBlock label="Success" value={successCount} color="green" />
        <SummaryBlock label="Failed" value={failedCount} color="red" />
      </div>

      {/* List */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {builds.map(build => {
          const StatusIcon = getStatusIcon(build.status)
          const color = getStatusColor(build.status)

          return (
            <div
              key={`${build.cluster}-${build.namespace}-${build.name}`}
              className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <StatusIcon className={`w-4 h-4 text-${color}-400`} />
                  <span className="text-sm font-medium group-hover:text-purple-400">
                    {build.name}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded bg-${color}-500/20 text-${color}-400`}>
                    {build.status}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              <div className="ml-6 text-xs text-muted-foreground flex items-center gap-3">
                {build.cluster && <ClusterBadge cluster={build.cluster} size="sm" />}
                <span>{build.builder}</span>
              </div>
            </div>
          )
        })}
      </div>

      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />

      <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        {totalItems} build{totalItems !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

function SummaryBlock({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className={`flex-1 p-2 rounded-lg bg-${color}-500/10 text-center`}>
      <span className={`text-lg font-bold text-${color}-400`}>{value}</span>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
