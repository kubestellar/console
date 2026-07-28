import { Cpu, Clock, RefreshCw } from 'lucide-react'
import { Skeleton, SkeletonStats } from '../ui/Skeleton'
import { Button } from '../ui/Button'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { CHART_HEIGHT_STANDARD } from '../../lib/constants'
import {
  GPU_INVENTORY_HISTORY_CHART_CONTAINER_STYLE,
  GPUInventoryChart,
  type TranslateFn,
} from './GPUInventoryHistory.parts'
import { useGPUInventoryHistoryData } from './gpuInventoryHistory/useGPUInventoryHistoryData'
import { FilterToolbar } from './gpuInventoryHistory/FilterToolbar'
import { UtilisationTable } from './gpuInventoryHistory/UtilisationTable'

export function GPUInventoryHistory() {
  const { t } = useTranslation(['cards', 'common'])
  const {
    isRefreshing,
    refetch,
    isLoading,
    showDemo,
    showSkeleton,
    showEmptyState,
    gpuNodes,
    history,
    localClusterFilter,
    setLocalClusterFilter,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
    viewMode,
    setViewMode,
    chartMode,
    setChartMode,
    selectedGPUType,
    setSelectedGPUType,
    selectedNode,
    setSelectedNode,
    showTypeDropdown,
    setShowTypeDropdown,
    showNodeDropdown,
    setShowNodeDropdown,
    typeDropdownRef,
    nodeDropdownRef,
    tablePage,
    setTablePage,
    availableClusters,
    availableGPUTypes,
    availableNodes,
    toggleClusterFilter,
    chartData,
    chartGPUTypes,
    displayChartData,
    currentTotals,
    trend,
    TrendIcon,
    churnMetrics,
    meanAllocatedGPUs,
    snapshotIntervalMin,
    formatIntervalDuration,
    tableRows,
    totalTablePages,
    paginatedRows,
    usagePercent,
    getUsageColor,
  } = useGPUInventoryHistoryData()

  // ── Loading state ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="h-full w-full min-w-0 flex flex-col min-h-card">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <Skeleton variant="text" width={120} height={16} />
          <Skeleton variant="rounded" width={28} height={28} />
        </div>
        <SkeletonStats className="mb-4" />
        <Skeleton variant="rounded" height={CHART_HEIGHT_STANDARD} className="flex-1" />
      </div>
    )
  }

  // ── Empty state ────────────────────────────────────────────────────
  if ((gpuNodes || []).length === 0 && (history || []).length === 0 && !showDemo) {
    return (
      <div className="h-full w-full min-w-0 flex flex-col content-loaded">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
            <Cpu className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium">{t('cards:gpuInventoryHistory.noData', 'No GPU History')}</p>
          <p className="text-sm text-muted-foreground">{t('cards:gpuInventoryHistory.noDataDescription', 'No historical GPU data available yet. Data is collected every 10 minutes.')}</p>
        </div>
      </div>
    )
  }

  if (showSkeleton) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">{t('common:common.loading', 'Loading...')}</div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 gap-2">
        <div className="text-center text-muted-foreground">
          <p className="text-sm font-medium">{t('cards:gpuInventoryHistory.loadFailed', 'Failed to load GPU inventory')}</p>
          <p className="text-xs mt-1">{t('cards:gpuInventoryHistory.tryRefresh', 'Please refresh the page to try again.')}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          {t('common.retry', 'Retry')}
        </Button>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────
  // Header uses flex-wrap so controls reflow onto a second line when the card
  // is narrow, preventing overlap and ensuring the snapshots label stays
  // visible. w-full + min-w-0 on the root and inner flex containers ensures
  // the card fills its grid column without forcing horizontal overflow.
  return (
    <div className="h-full w-full min-w-0 flex flex-col content-loaded">
      {/* Header with controls */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground truncate min-w-0 flex-1">
            {(chartData || []).length} {t('cards:gpuInventoryHistory.snapshots', 'snapshots')}
          </span>
        </div>
        <FilterToolbar
          t={t}
          availableGPUTypes={availableGPUTypes}
          selectedGPUType={selectedGPUType}
          onSelectGPUType={(type) => { setSelectedGPUType(type); setShowTypeDropdown(false) }}
          showTypeDropdown={showTypeDropdown}
          onToggleTypeDropdown={() => { setShowTypeDropdown(v => !v); setShowNodeDropdown(false) }}
          typeDropdownRef={typeDropdownRef}
          availableNodes={availableNodes}
          selectedNode={selectedNode}
          onSelectNode={(node) => { setSelectedNode(node); setShowNodeDropdown(false) }}
          showNodeDropdown={showNodeDropdown}
          onToggleNodeDropdown={() => { setShowNodeDropdown(v => !v); setShowTypeDropdown(false) }}
          nodeDropdownRef={nodeDropdownRef}
          availableClusters={availableClusters}
          localClusterFilter={localClusterFilter}
          onToggleClusterFilter={toggleClusterFilter}
          onClearClusterFilter={() => setLocalClusterFilter([])}
          showClusterFilter={showClusterFilter}
          setShowClusterFilter={setShowClusterFilter}
          clusterFilterRef={clusterFilterRef}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>

      {/* Stats row — 2 columns on narrow widths, 4 columns from sm (>=640px) */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20" title={`${currentTotals.total} total GPUs`}>
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-blue-400">{t('common:common.total', 'Total')}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{currentTotals.total}</span>
        </div>
        <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20" title={`${currentTotals.allocated} GPUs allocated`}>
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-purple-400" />
            <span className="text-xs text-purple-400">{t('common:common.used', 'In Use')}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{currentTotals.allocated}</span>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20" title={`${currentTotals.free} GPUs available`}>
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400">{t('common:common.free', 'Free')}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{currentTotals.free}</span>
        </div>
        <div className="p-2 rounded-lg bg-secondary/50 border border-border" title={`${usagePercent}% GPU utilization — trend: ${trend}`}>
          <div className="flex items-center gap-1 mb-1">
            <TrendIcon className={`w-3 h-3 ${getUsageColor()}`} aria-hidden="true" />
            <span className={`text-xs ${getUsageColor()}`}>{t('cards:gpuInventoryHistory.trend', 'Trend')}</span>
          </div>
          <span className={`text-sm font-bold ${getUsageColor()}`}>{usagePercent}%</span>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 min-w-0 min-h-[160px]">
        {viewMode === 'chart' ? (
          <>
            {/* Chart mode toggle (aggregate vs by-type) */}
            {availableGPUTypes.length > 1 && selectedGPUType === 'all' && (
              <div className="flex items-center gap-1 mb-1">
                <button
                  onClick={() => setChartMode('aggregate')}
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded transition-colors',
                    chartMode === 'aggregate' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t('cards:gpuInventoryHistory.aggregate', 'Aggregate')}
                </button>
                <button
                  onClick={() => setChartMode('by-type')}
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded transition-colors',
                    chartMode === 'by-type' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t('cards:gpuInventoryHistory.byType', 'By Type')}
                </button>
              </div>
            )}
            {(chartData || []).length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                {t('cards:gpuInventoryHistory.collecting', 'Collecting data...')}
              </div>
            ) : (
              <div
                style={GPU_INVENTORY_HISTORY_CHART_CONTAINER_STYLE}
                role="img"
                aria-label={`GPU inventory history chart: ${currentTotals.allocated} of ${currentTotals.total} GPUs in use (${usagePercent}% utilization), trend: ${trend}`}
              >
                <GPUInventoryChart
                  displayChartData={displayChartData}
                  chartMode={chartMode}
                  chartGPUTypes={chartGPUTypes}
                  t={t as unknown as TranslateFn}
                />
              </div>
            )}
          </>
        ) : (
          /* Table view — per-node, per-type breakdown */
          <UtilisationTable
            t={t}
            paginatedRows={paginatedRows}
            tableRows={tableRows}
            tablePage={tablePage}
            totalTablePages={totalTablePages}
            onPageChange={setTablePage}
          />
        )}
      </div>

      {/* Footer — stats + churn metrics */}
      {(chartData || []).length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {t('cards:gpuInventoryHistory.peakUsage', 'Peak')}:{' '}
            <span className="text-foreground font-medium">
              {Math.max(...(chartData || []).map(d => d.allocated))} GPUs
            </span>
          </span>
          <span>
            {t('cards:gpuInventoryHistory.minUsage', 'Min')}:{' '}
            <span className="text-foreground font-medium">
              {Math.min(...(chartData || []).map(d => d.allocated))} GPUs
            </span>
          </span>
          <span>
            {t('cards:gpuInventoryHistory.avgUsage', 'Avg')}:{' '}
            <span className="text-foreground font-medium">
              {meanAllocatedGPUs} GPUs
            </span>
          </span>
          {churnMetrics && (
            <>
              <span title={t('cards:gpuInventoryHistory.arrivalRateTooltip', 'Average GPUs newly allocated per snapshot interval')}>
                {t('cards:gpuInventoryHistory.arrivalRate', 'Arrival')}:{' '}
                <span className="text-foreground font-medium">
                  +{churnMetrics.arrivalRate.toFixed(1)}/{snapshotIntervalMin} min
                </span>
              </span>
              <span title={t('cards:gpuInventoryHistory.departureRateTooltip', 'Average GPUs freed per snapshot interval')}>
                {t('cards:gpuInventoryHistory.departureRate', 'Departure')}:{' '}
                <span className="text-foreground font-medium">
                  -{churnMetrics.departureRate.toFixed(1)}/{snapshotIntervalMin} min
                </span>
              </span>
              {churnMetrics.avgDurationIntervals > 0 && (
                <span title={t('cards:gpuInventoryHistory.avgDurationTooltip', 'Approximate average allocation duration in snapshot intervals (~10 min each)')}>
                  {t('cards:gpuInventoryHistory.avgDuration', 'Avg Duration')}:{' '}
                  <span className="text-foreground font-medium">
                    {formatIntervalDuration(churnMetrics.avgDurationIntervals)}
                  </span>
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
