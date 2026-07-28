import { cn } from '../../lib/cn'
import {
  GPUInventoryChart,
  GPU_INVENTORY_HISTORY_CHART_CONTAINER_STYLE,
  type ChartMode,
  type GPUHistoryDataPoint,
  type TranslateFn,
} from './GPUInventoryHistory.parts'

interface GPUInventoryHistoryChartPanelProps {
  availableGPUTypesLength: number
  selectedGPUType: string
  chartMode: ChartMode
  setChartMode: (mode: ChartMode) => void
  chartData: GPUHistoryDataPoint[]
  displayChartData: GPUHistoryDataPoint[]
  chartGPUTypes: string[]
  currentTotals: { allocated: number; total: number; free: number }
  usagePercent: number
  trend: 'up' | 'down' | 'stable'
  t: TranslateFn
}

export function GPUInventoryHistoryChartPanel({
  availableGPUTypesLength,
  selectedGPUType,
  chartMode,
  setChartMode,
  chartData,
  displayChartData,
  chartGPUTypes,
  currentTotals,
  usagePercent,
  trend,
  t,
}: GPUInventoryHistoryChartPanelProps) {
  return (
    <>
      {availableGPUTypesLength > 1 && selectedGPUType === 'all' && (
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
            t={t}
          />
        </div>
      )}
    </>
  )
}
