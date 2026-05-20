import { useCallback, useMemo, useState } from 'react'
import { Box, Plus } from 'lucide-react'
import { Skeleton } from '../ui/Skeleton'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { useCachedWorkloads } from '../../hooks/useCachedData'
import { useClusters } from '../../hooks/useMCP'
import { useCardLoadingState } from './CardDataContext'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useTranslation } from 'react-i18next'
import { WorkloadImportDialog } from './WorkloadImportDialog'
import { DraggableWorkloadItem } from './WorkloadDeploymentItem'
import { usePersistedClusterFilter } from './WorkloadDeployment.hooks'
import {
  CLUSTER_FILTER_STORAGE_KEY,
  DEMO_WORKLOADS,
  REFETCH_AFTER_SCALE_MS,
  SORT_OPTIONS,
  WORKLOAD_STATUSES,
  WORKLOAD_TYPES,
  filterWorkloads,
  getAvailableClusters,
  getWorkloadStats,
  mapApiWorkloads,
  workloadStatusOrder,
  type SortByOption,
  type Workload,
  type WorkloadStatus,
  type WorkloadType,
} from './WorkloadDeployment.utils'

interface WorkloadDeploymentProps {
  config?: Record<string, unknown>
}

export function WorkloadDeployment(_props: WorkloadDeploymentProps) {
  const { t } = useTranslation()
  const [typeFilter, setTypeFilter] = useState<WorkloadType | 'All'>('All')
  const [statusFilter, setStatusFilter] = useState<WorkloadStatus | 'All'>('All')
  const [selectedWorkload, setSelectedWorkload] = useState<Workload | null>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importedWorkloads, setImportedWorkloads] = useState<Workload[]>([])

  const handleImportWorkloads = useCallback((newWorkloads: Workload[]) => {
    setImportedWorkloads(prev => [...prev, ...newWorkloads])
  }, [])

  const { deduplicatedClusters, isLoading: clustersLoading } = useClusters()
  const { isDemoMode: demoMode } = useDemoMode()
  const isDemo = demoMode

  const {
    data: realWorkloads,
    isLoading: workloadsLoading,
    isRefreshing: workloadsRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    refetch: refetchWorkloads,
  } = useCachedWorkloads()

  const hasAnyData = isDemo ? DEMO_WORKLOADS.length > 0 : (realWorkloads?.length ?? 0) > 0
  const { showSkeleton } = useCardLoadingState({
    isLoading: (clustersLoading || workloadsLoading) && !hasAnyData,
    isRefreshing: workloadsRefreshing,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: isDemoFallback || isDemo,
    errorMessage: isFailed ? t('common.failedToLoadWorkloads') : undefined,
  })

  const {
    selectedClusters: localClusterFilter,
    toggleCluster: toggleClusterFilter,
    clearClusters: clearClusterFilter,
    isOpen: showClusterFilter,
    setIsOpen: setShowClusterFilter,
    containerRef: clusterFilterRef,
  } = usePersistedClusterFilter(CLUSTER_FILTER_STORAGE_KEY)

  const availableClusters = useMemo(
    () => getAvailableClusters(isDemo, deduplicatedClusters, DEMO_WORKLOADS),
    [deduplicatedClusters, isDemo],
  )

  const workloads = useMemo(
    () => (isDemo ? [...DEMO_WORKLOADS, ...importedWorkloads] : mapApiWorkloads(realWorkloads, importedWorkloads)),
    [realWorkloads, isDemo, importedWorkloads],
  )

  const stats = useMemo(
    () => getWorkloadStats(isDemo, realWorkloads, workloads),
    [isDemo, realWorkloads, workloads],
  )

  const preFiltered = useMemo(
    () => filterWorkloads(workloads, typeFilter, statusFilter, localClusterFilter, availableClusters),
    [availableClusters, localClusterFilter, statusFilter, typeFilter, workloads],
  )

  const {
    items: filteredWorkloads,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: { search, setSearch },
    sorting: { sortBy, setSortBy, sortDirection, setSortDirection },
    containerRef,
    containerStyle,
  } = useCardData<Workload, SortByOption>(preFiltered, {
    filter: {
      searchFields: ['name', 'namespace', 'image'] as (keyof Workload)[],
      customPredicate: (workload, query) =>
        (workload.targetClusters || []).some(cluster => cluster.toLowerCase().includes(query)),
      storageKey: 'workload-deployment',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: commonComparators.statusOrder<Workload>('status', workloadStatusOrder),
        name: commonComparators.string<Workload>('name'),
        type: commonComparators.string<Workload>('type'),
      },
    },
    defaultLimit: 5,
  })

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
          <Skeleton variant="text" width={120} height={16} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-2" />
        <Skeleton variant="rounded" height={48} className="mb-2" />
        <div className="space-y-2">
          <Skeleton variant="rounded" height={70} />
          <Skeleton variant="rounded" height={70} />
          <Skeleton variant="rounded" height={70} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 shrink-0 px-3 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {stats.totalWorkloads} total &middot; {stats.uniqueWorkloads} unique
          </span>
        </div>
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
            onSortChange: value => setSortBy(value as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection,
          }}
        />
      </div>

      <div className="px-3 mb-2 flex gap-2">
        <CardSearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search workloads..."
          className="mb-0! flex-1"
        />
        <button
          onClick={() => setShowImportDialog(true)}
          className="self-start px-3 py-1.5 text-xs font-medium rounded-md bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap"
          aria-label="Add workload"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      <div className="grid grid-cols-6 gap-2 px-3 py-2 bg-gray-50 dark:bg-secondary/50 border-b border-gray-200 dark:border-border">
        <div className="text-center">
          <div className="text-lg font-semibold text-gray-900 dark:text-foreground">{stats.totalWorkloads}</div>
          <div className="text-xs text-muted-foreground">{t('common.total')}</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-purple-500">{stats.uniqueWorkloads}</div>
          <div className="text-xs text-muted-foreground">Unique</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-green-600">{stats.runningCount}</div>
          <div className="text-xs text-muted-foreground">{t('common.running')}</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-yellow-600">{stats.degradedCount}</div>
          <div className="text-xs text-muted-foreground">{t('common.degraded')}</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-blue-600">{stats.pendingCount}</div>
          <div className="text-xs text-muted-foreground">{t('common.pending')}</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-red-600">{stats.failedCount}</div>
          <div className="text-xs text-muted-foreground">{t('common.failed')}</div>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-gray-200 dark:border-border">
        <div className="flex gap-2 flex-wrap">
          <select
            value={typeFilter}
            onChange={event => setTypeFilter(event.target.value as WorkloadType | 'All')}
            className="text-xs px-2 py-1 border border-gray-300 dark:border-border rounded bg-white dark:bg-secondary text-gray-900 dark:text-foreground"
          >
            {WORKLOAD_TYPES.map(type => (
              <option key={type} value={type}>
                {type === 'All' ? 'All Types' : type}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value as WorkloadStatus | 'All')}
            className="text-xs px-2 py-1 border border-gray-300 dark:border-border rounded bg-white dark:bg-secondary text-gray-900 dark:text-foreground"
          >
            {WORKLOAD_STATUSES.map(status => (
              <option key={status} value={status}>
                {status === 'All' ? 'All Statuses' : status}
              </option>
            ))}
          </select>
          <span className="ml-auto text-2xs text-muted-foreground italic">
            Drag onto Cluster Groups to deploy
          </span>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto" style={containerStyle}>
        {filteredWorkloads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
            <Box className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No workloads found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-border">
            {filteredWorkloads.map(workload => (
              <DraggableWorkloadItem
                key={`${workload.namespace}/${workload.name}`}
                workload={workload}
                isSelected={selectedWorkload?.name === workload.name}
                onSelect={() =>
                  setSelectedWorkload(selectedWorkload?.name === workload.name ? null : workload)
                }
                onScaled={() => setTimeout(refetchWorkloads, REFETCH_AFTER_SCALE_MS)}
              />
            ))}
          </div>
        )}
      </div>

      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={preFiltered.length}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : preFiltered.length}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />

      <WorkloadImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImport={handleImportWorkloads}
      />
    </div>
  )
}

export type { ClusterDeployment, Workload, WorkloadStatus, WorkloadType } from './WorkloadDeployment.utils'
