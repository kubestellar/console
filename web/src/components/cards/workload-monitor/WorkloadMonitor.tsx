import { useState, useMemo, useCallback } from 'react'
import { Package, RefreshCw, Loader2, AlertTriangle, Search } from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { Pagination } from '../../ui/Pagination'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import type { SortDirection } from '../../../lib/cards/cardHooks'
import { useClusters, useNamespaces } from '../../../hooks/useMCP'
import { useWorkloads } from '../../../hooks/useWorkloads'
import { useWorkloadMonitor } from '../../../hooks/useWorkloadMonitor'
import { cn } from '../../../lib/cn'
import type {
  MonitoredResource,
  MonitorViewMode,
  ResourceCategory,
  ResourceHealthStatus,
  WorkloadMonitorConfig,
} from '../../../types/workloadMonitor'
import { WorkloadMonitorToolbar } from './WorkloadMonitorToolbar'
import { WorkloadMonitorTree } from './WorkloadMonitorTree'
import { WorkloadMonitorList } from './WorkloadMonitorList'
import { WorkloadMonitorAlerts } from './WorkloadMonitorAlerts'
import { WorkloadMonitorDiagnose } from './WorkloadMonitorDiagnose'

interface WorkloadMonitorProps {
  config?: Record<string, unknown>
}

type SortField = 'name' | 'kind' | 'status' | 'category' | 'order'

const STATUS_ORDER: Record<string, number> = { unhealthy: 0, missing: 1, degraded: 2, unknown: 3, healthy: 4 }

export function WorkloadMonitor({ config }: WorkloadMonitorProps) {
  const monitorConfig = config as WorkloadMonitorConfig | undefined

  // Cascading selectors (used when config doesn't pre-specify the workload)
  const { deduplicatedClusters: clusters } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState(monitorConfig?.cluster || '')
  const [selectedNamespace, setSelectedNamespace] = useState(monitorConfig?.namespace || '')
  const [selectedWorkload, setSelectedWorkload] = useState(monitorConfig?.workload || '')

  const isPreConfigured = !!(monitorConfig?.cluster && monitorConfig?.namespace && monitorConfig?.workload)
  const activeCluster = isPreConfigured ? monitorConfig!.cluster! : selectedCluster
  const activeNamespace = isPreConfigured ? monitorConfig!.namespace! : selectedNamespace
  const activeWorkload = isPreConfigured ? monitorConfig!.workload! : selectedWorkload

  // Fetch namespaces/workloads for selectors
  const { namespaces, isLoading: nsLoading } = useNamespaces(selectedCluster || undefined)
  const hasSelection = !!selectedCluster && !!selectedNamespace
  const workloadOpts = useMemo(() => {
    if (!selectedCluster || !selectedNamespace) return undefined
    return { cluster: selectedCluster, namespace: selectedNamespace }
  }, [selectedCluster, selectedNamespace])
  const { data: workloads, isLoading: wlLoading } = useWorkloads(workloadOpts, hasSelection)

  // Monitor data
  const {
    resources,
    issues,
    overallStatus,
    workloadKind,
    isLoading,
    isRefreshing,
    error,
    refetch,
  } = useWorkloadMonitor(activeCluster, activeNamespace, activeWorkload, {
    autoRefreshMs: monitorConfig?.autoRefreshMs,
  })

  // View mode and filters
  const [viewMode, setViewMode] = useState<MonitorViewMode>('tree')
  const [categoryFilter, setCategoryFilter] = useState<ResourceCategory | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<ResourceHealthStatus | 'all'>('all')

  // Pre-filter by category and status before useCardData
  const preFiltered = useMemo(() => {
    let filtered = resources
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(r => r.category === categoryFilter)
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter)
    }
    return filtered
  }, [resources, categoryFilter, statusFilter])

  const {
    items,
    totalItems,
    currentPage,
    totalPages,
    goToPage,
    needsPagination,
    itemsPerPage,
    setItemsPerPage,
    filters,
    sorting,
  } = useCardData<MonitoredResource, SortField>(preFiltered, {
    filter: {
      searchFields: ['name', 'kind', 'status', 'category', 'message'] as (keyof MonitoredResource)[],
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc' as SortDirection,
      comparators: {
        name: commonComparators.string<MonitoredResource>('name'),
        kind: commonComparators.string<MonitoredResource>('kind'),
        status: (a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3),
        category: commonComparators.string<MonitoredResource>('category'),
        order: (a, b) => a.order - b.order,
      },
    },
    defaultLimit: 10,
  })

  // Handlers for selectors
  const handleClusterChange = useCallback((cluster: string) => {
    setSelectedCluster(cluster)
    setSelectedNamespace('')
    setSelectedWorkload('')
  }, [])

  const handleNamespaceChange = useCallback((ns: string) => {
    setSelectedNamespace(ns)
    setSelectedWorkload('')
  }, [])

  const handleWorkloadChange = useCallback((name: string) => {
    setSelectedWorkload(name)
  }, [])

  const handleResourceClick = useCallback((_resource: MonitoredResource) => {
    // DrillDown integration will be added in Phase 3
    // For now, this is a placeholder for click-through navigation
  }, [])

  const clusterNames = useMemo(() => clusters.map(c => c.name).sort(), [clusters])

  // Loading state
  if (isLoading && !resources.length) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  const statusColors: Record<string, string> = {
    healthy: 'bg-green-500/20 text-green-400',
    degraded: 'bg-yellow-500/20 text-yellow-400',
    unhealthy: 'bg-red-500/20 text-red-400',
    unknown: 'bg-gray-500/20 text-gray-400',
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Cascading selectors (only when not pre-configured) */}
      {!isPreConfigured && (
        <div className="space-y-2 mb-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-20 shrink-0">Cluster</label>
            <select
              value={selectedCluster}
              onChange={(e) => handleClusterChange(e.target.value)}
              className="flex-1 text-sm rounded-md bg-secondary/50 border border-border px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            >
              <option value="">Select cluster...</option>
              {clusterNames.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-20 shrink-0">Namespace</label>
            <select
              value={selectedNamespace}
              onChange={(e) => handleNamespaceChange(e.target.value)}
              disabled={!selectedCluster || nsLoading}
              className={cn(
                'flex-1 text-sm rounded-md bg-secondary/50 border border-border px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50',
                (!selectedCluster || nsLoading) && 'opacity-50 cursor-not-allowed',
              )}
            >
              <option value="">{nsLoading ? 'Loading...' : 'Select namespace...'}</option>
              {namespaces.map(ns => (
                <option key={ns} value={ns}>{ns}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-20 shrink-0">Workload</label>
            <select
              value={selectedWorkload}
              onChange={(e) => handleWorkloadChange(e.target.value)}
              disabled={!selectedNamespace || wlLoading}
              className={cn(
                'flex-1 text-sm rounded-md bg-secondary/50 border border-border px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50',
                (!selectedNamespace || wlLoading) && 'opacity-50 cursor-not-allowed',
              )}
            >
              <option value="">{wlLoading ? 'Loading...' : 'Select workload...'}</option>
              {workloads?.map(w => (
                <option key={`${w.type}-${w.name}`} value={w.name}>
                  {w.name} ({w.type})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!activeWorkload && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Search className="w-8 h-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">
            Select a cluster, namespace, and workload to monitor.
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && activeWorkload && (
        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 flex items-start gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-yellow-400 font-medium">Monitor error</p>
            <p className="text-xs text-yellow-400/70 mt-0.5">{error.message}</p>
          </div>
        </div>
      )}

      {/* Main content (only when workload is selected and data is available) */}
      {activeWorkload && resources.length > 0 && (
        <>
          {/* Workload header */}
          <div className="rounded-lg bg-card/50 border border-border p-2.5 mb-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="text-sm font-medium text-foreground">{activeWorkload}</span>
            {workloadKind && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                {workloadKind}
              </span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded ml-auto ${statusColors[overallStatus] || statusColors.unknown}`}>
              {overallStatus}
            </span>
            <button
              onClick={refetch}
              disabled={isRefreshing}
              className="p-1 rounded hover:bg-secondary transition-colors"
              title="Refresh"
            >
              {isRefreshing
                ? <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
          </div>

          {/* Toolbar */}
          <WorkloadMonitorToolbar
            search={filters.search}
            onSearchChange={filters.setSearch}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            totalItems={totalItems}
            issueCount={issues.length}
            sortBy={sorting.sortBy}
            onSortChange={(v) => sorting.setSortBy(v as SortField)}
            sortDirection={sorting.sortDirection}
            onSortDirectionChange={sorting.setSortDirection}
            limit={itemsPerPage}
            onLimitChange={setItemsPerPage}
          />

          {/* View */}
          <div className="flex-1 overflow-y-auto">
            {viewMode === 'tree' ? (
              <WorkloadMonitorTree resources={items} onResourceClick={handleResourceClick} />
            ) : (
              <WorkloadMonitorList resources={items} onResourceClick={handleResourceClick} />
            )}
          </div>

          {/* Pagination */}
          {needsPagination && (
            <div className="mt-2 pt-2 border-t border-border/50">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
                onPageChange={goToPage}
              />
            </div>
          )}

          {/* Alerts */}
          <WorkloadMonitorAlerts issues={issues} />

          {/* AI Diagnose & Repair */}
          <WorkloadMonitorDiagnose
            resources={items}
            issues={issues}
            monitorType={monitorConfig?.monitorType || 'workload'}
            diagnosable={monitorConfig?.diagnosable !== false}
            repairable={monitorConfig?.repairable !== false}
            workloadContext={{
              cluster: activeCluster,
              namespace: activeNamespace,
              workload: activeWorkload,
              workloadKind,
              overallStatus,
            }}
          />
        </>
      )}
    </div>
  )
}
