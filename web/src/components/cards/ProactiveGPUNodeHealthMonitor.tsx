import { useState, useMemo, useRef, useEffect } from 'react'
import { Server, Clock, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { useCardLoadingState } from './CardDataContext'
import { CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useCachedGPUNodeHealth } from '../../hooks/useCachedData'
import type { GPUNodeHealthStatus } from '../../hooks/useMCP'
import { CronJobClusterPanel } from './ProactiveGPUNodeHealthMonitor.CronJobPanel'
import { NodeListPanel } from './ProactiveGPUNodeHealthMonitor.NodeListPanel'
import { SORT_OPTIONS, STATUS_ORDER, PAGE_SIZE, type SortField, type SortDirection } from './ProactiveGPUNodeHealthMonitor.constants'

function ProactiveGPUNodeHealthMonitorInternal() {
  const { t } = useTranslation(['common', 'cards'])
  const {
    nodes,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    lastRefresh } = useCachedGPUNodeHealth()

  const { drillToNode } = useDrillDownActions()

  // Card controls state
  const [search, setSearch] = useState('')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const [sortField, setSortField] = useState<SortField>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedNode, setExpandedNode] = useState<string | null>(null)
  const [showCronJobPanel, setShowCronJobPanel] = useState(false)

  const clusterFilterRef = useRef<HTMLDivElement>(null!)

  // Report loading state to CardWrapper (lastRefresh enables "Updated Xm ago" freshness display)
  useCardLoadingState({
    isLoading: isLoading && nodes.length === 0,
    isRefreshing,
    hasAnyData: nodes.length > 0,
    isFailed,
    consecutiveFailures,
    isDemoData: isDemoFallback,
    lastRefresh })

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(e.target as Node)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Compute summary counts
  const summary = (() => {
    let healthy = 0, degraded = 0, unhealthy = 0
    for (const n of nodes) {
      if (n.status === 'healthy') healthy++
      else if (n.status === 'degraded') degraded++
      else unhealthy++
    }
    return { healthy, degraded, unhealthy }
  })()

  // Available clusters for filter
  const availableClusters = (() => {
    const set = new Set(nodes.map((n: GPUNodeHealthStatus) => n.cluster))
    return Array.from(set).sort()
  })()

  // Filter, search, sort
  const filteredNodes = useMemo(() => {
    let result = [...nodes]

    // Cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(n => localClusterFilter.includes(n.cluster))
    }

    // Search
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(n =>
        n.nodeName.toLowerCase().includes(q) ||
        n.cluster.toLowerCase().includes(q) ||
        n.gpuType.toLowerCase().includes(q) ||
        (n.issues || []).some((i: string) => i.toLowerCase().includes(q))
      )
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'status':
          cmp = (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
          break
        case 'nodeName':
          cmp = a.nodeName.localeCompare(b.nodeName)
          break
        case 'cluster':
          cmp = a.cluster.localeCompare(b.cluster)
          break
        case 'gpuCount':
          cmp = a.gpuCount - b.gpuCount
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })

    return result
  }, [nodes, localClusterFilter, search, sortField, sortDirection])

  // Pagination
  const totalItems = filteredNodes.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const paginatedNodes = filteredNodes.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Reset page on filter change
  useEffect(() => { setCurrentPage(1) }, [search, localClusterFilter, sortField, sortDirection])

  if (nodes.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-white/40">
        <Server className="w-8 h-8 mb-2" />
        <p className="text-sm font-medium">{t('cards:gpuNodeHealth.noGPUNodes')}</p>
        <p className="text-xs mt-1">{t('cards:gpuNodeHealth.connectClusters')}</p>
        {/* Still show CronJob panel even with no nodes — user may want to set up monitoring */}
        {availableClusters.length === 0 && (
          <button
            onClick={() => setShowCronJobPanel(prev => !prev)}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-border bg-secondary text-muted-foreground hover:text-foreground/70 hover:bg-secondary/80 transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5" />
            {t('cards:gpuNodeHealth.cronJobSetup')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Summary row */}
      <div className="flex gap-2">
        {/* #9881 — Normalize summary backgrounds to the /10 bg + /20 ring pattern used by cilium_status. */}
        <div className={cn('flex-1 rounded-lg px-3 py-2 text-center', summary.unhealthy > 0 ? 'bg-red-500/10 ring-1 ring-red-500/20' : 'bg-secondary')}>
          <div className={cn('text-lg font-bold', summary.unhealthy > 0 ? 'text-red-400' : 'text-white/30')}>{summary.unhealthy}</div>
          <div className="text-2xs text-white/40 uppercase tracking-wider">{t('cards:gpuNodeHealth.unhealthy')}</div>
        </div>
        <div className={cn('flex-1 rounded-lg px-3 py-2 text-center', summary.degraded > 0 ? 'bg-yellow-500/10 ring-1 ring-yellow-500/20' : 'bg-secondary')}>
          <div className={cn('text-lg font-bold', summary.degraded > 0 ? 'text-yellow-400' : 'text-white/30')}>{summary.degraded}</div>
          <div className="text-2xs text-white/40 uppercase tracking-wider">{t('cards:gpuNodeHealth.degraded')}</div>
        </div>
        <div className={cn('flex-1 rounded-lg px-3 py-2 text-center', summary.healthy > 0 ? 'bg-green-500/10' : 'bg-secondary')}>
          <div className={cn('text-lg font-bold', summary.healthy > 0 ? 'text-green-400' : 'text-white/30')}>{summary.healthy}</div>
          <div className="text-2xs text-white/40 uppercase tracking-wider">{t('cards:gpuNodeHealth.healthy')}</div>
        </div>
      </div>

      {/* Controls */}
      <CardControlsRow
        clusterFilter={{
          availableClusters: availableClusters.map(c => ({ name: c })),
          selectedClusters: localClusterFilter,
          onToggle: (cluster: string) => {
            setLocalClusterFilter(prev =>
              prev.includes(cluster) ? prev.filter(c => c !== cluster) : [...prev, cluster]
            )
          },
          onClear: () => setLocalClusterFilter([]),
          isOpen: showClusterFilter,
          setIsOpen: setShowClusterFilter,
          containerRef: clusterFilterRef }}
        cardControls={{
          limit: PAGE_SIZE,
          onLimitChange: () => {},
          sortBy: sortField,
          sortOptions: SORT_OPTIONS,
          onSortChange: (v: string) => setSortField(v as SortField),
          sortDirection,
          onSortDirectionChange: (d: SortDirection) => setSortDirection(d) }}
        extra={
          <div className="flex items-center gap-1">
            {search && (
              <button
                onClick={() => setSearch('')}
                className="px-2 py-1 text-xs rounded border border-white/10 bg-secondary text-white/50 hover:text-white/70"
              >
                {t('cards:gpuNodeHealth.clearSearch')}
              </button>
            )}
            <button
              onClick={() => setShowCronJobPanel(prev => !prev)}
              className={cn(
                'p-1 rounded transition-colors',
                showCronJobPanel ? 'bg-blue-500/15 text-blue-400' : 'text-white/30 hover:text-white/50 hover:bg-secondary'
              )}
              title={t('cards:gpuNodeHealth.cronJobManagement')}
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </div>
        }
      />

      {/* Search bar */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('cards:gpuNodeHealth.searchPlaceholder')}
          className="w-full px-3 py-1.5 text-xs rounded border border-white/10 bg-secondary text-white/80 placeholder:text-white/30 focus:outline-hidden focus:border-white/20"
        />
      </div>

      {/* CronJob Management Panel */}
      {showCronJobPanel && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/3 p-2 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-medium text-blue-300">{t('cards:gpuNodeHealth.cronJobTitle')}</span>
            <span className="text-2xs text-white/30">{t('cards:gpuNodeHealth.automatedChecks')}</span>
          </div>
          <div className="space-y-1">
            {availableClusters.map(cluster => (
              <CronJobClusterPanel key={cluster} cluster={cluster} />
            ))}
            {availableClusters.length === 0 && (
              <div className="text-xs text-white/30 text-center py-2">
                {t('cards:gpuNodeHealth.noGPUClusters')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Node list */}
      <NodeListPanel
        nodes={paginatedNodes}
        expandedNode={expandedNode}
        setExpandedNode={setExpandedNode}
        drillToNode={drillToNode}
      />

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={PAGE_SIZE}
        onPageChange={setCurrentPage}
        needsPagination={totalPages > 1}
      />
    </div>
  )
}

export function ProactiveGPUNodeHealthMonitor() {
  return (
    <DynamicCardErrorBoundary cardId="ProactiveGPUNodeHealthMonitor">
      <ProactiveGPUNodeHealthMonitorInternal />
    </DynamicCardErrorBoundary>
  )
}

export default ProactiveGPUNodeHealthMonitor
