import { Cpu, RefreshCw } from 'lucide-react'
import { Skeleton, SkeletonStats } from '../ui/Skeleton'
import { Button } from '../ui/Button'
import { useTranslation } from 'react-i18next'
import { CHART_HEIGHT_STANDARD } from '../../lib/constants'
import { useGPUInventoryHistory } from './useGPUInventoryHistory'
import { GPUInventoryHistoryChart } from './GPUInventoryHistoryChart'

export function GPUInventoryHistory() {
  const { t } = useTranslation(['cards', 'common'])
  const state = useGPUInventoryHistory()
  const { gpuNodes, isLoading, isRefreshing, showDemo, showSkeleton, showEmptyState, history, refetch } = state

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

  return (
    <GPUInventoryHistoryChart
      t={state.t}
      isRefreshing={isRefreshing}
      refetch={refetch}
      localClusterFilter={state.localClusterFilter}
      setLocalClusterFilter={state.setLocalClusterFilter}
      showClusterFilter={state.showClusterFilter}
      setShowClusterFilter={state.setShowClusterFilter}
      clusterFilterRef={state.clusterFilterRef}
      toggleClusterFilter={state.toggleClusterFilter}
      availableClusters={state.availableClusters}
      availableGPUTypes={state.availableGPUTypes}
      availableNodes={state.availableNodes}
      viewMode={state.viewMode}
      setViewMode={state.setViewMode}
      chartMode={state.chartMode}
      setChartMode={state.setChartMode}
      selectedGPUType={state.selectedGPUType}
      setSelectedGPUType={state.setSelectedGPUType}
      selectedNode={state.selectedNode}
      setSelectedNode={state.setSelectedNode}
      showTypeDropdown={state.showTypeDropdown}
      setShowTypeDropdown={state.setShowTypeDropdown}
      showNodeDropdown={state.showNodeDropdown}
      setShowNodeDropdown={state.setShowNodeDropdown}
      typeDropdownRef={state.typeDropdownRef}
      nodeDropdownRef={state.nodeDropdownRef}
      tablePage={state.tablePage}
      setTablePage={state.setTablePage}
      chartData={state.chartData}
      displayChartData={state.displayChartData}
      chartGPUTypes={state.chartGPUTypes}
      currentTotals={state.currentTotals}
      trend={state.trend}
      churnMetrics={state.churnMetrics}
      meanAllocatedGPUs={state.meanAllocatedGPUs}
      snapshotIntervalMin={state.snapshotIntervalMin}
      formatIntervalDuration={state.formatIntervalDuration}
      tableRows={state.tableRows}
      totalTablePages={state.totalTablePages}
      paginatedRows={state.paginatedRows}
      usagePercent={state.usagePercent}
      getUsageColor={state.getUsageColor}
      TrendIcon={state.TrendIcon}
    />
  )
}
