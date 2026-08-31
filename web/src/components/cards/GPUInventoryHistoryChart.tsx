import { Cpu, Clock, Server, BarChart3, Table2, ChevronDown, ArrowUpDown, RefreshCw } from 'lucide-react'
import { CardClusterFilter } from '../../lib/cards/CardComponents'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { GPU_INVENTORY_HISTORY_CHART_CONTAINER_STYLE, HIGH_USAGE_PCT, MEDIUM_USAGE_PCT, TABLE_PAGE_SIZE, GPUInventoryChart, type GPUHistoryDataPoint, type ChurnMetrics, type TranslateFn, type ViewMode, type ChartMode } from './GPUInventoryHistory.parts'

interface GPUInventoryHistoryChartProps {
  t: TranslateFn
  isRefreshing: boolean
  refetch: () => Promise<void>
  localClusterFilter: string[]
  setLocalClusterFilter: (v: string[]) => void
  showClusterFilter: boolean
  setShowClusterFilter: (v: boolean) => void
  clusterFilterRef: React.RefObject<HTMLDivElement>
  toggleClusterFilter: (name: string) => void
  availableClusters: { name: string; reachable: boolean }[]
  availableGPUTypes: string[]
  availableNodes: string[]
  viewMode: ViewMode
  setViewMode: (v: ViewMode) => void
  chartMode: ChartMode
  setChartMode: (v: ChartMode) => void
  selectedGPUType: string
  setSelectedGPUType: (v: string) => void
  selectedNode: string
  setSelectedNode: (v: string) => void
  showTypeDropdown: boolean
  setShowTypeDropdown: (fn: (v: boolean) => boolean) => void
  showNodeDropdown: boolean
  setShowNodeDropdown: (fn: (v: boolean) => boolean) => void
  typeDropdownRef: React.RefObject<HTMLDivElement>
  nodeDropdownRef: React.RefObject<HTMLDivElement>
  tablePage: number
  setTablePage: (fn: (p: number) => number) => void
  chartData: GPUHistoryDataPoint[]
  displayChartData: GPUHistoryDataPoint[]
  chartGPUTypes: string[]
  currentTotals: { allocated: number; total: number; free: number }
  trend: 'up' | 'down' | 'stable'
  churnMetrics: ChurnMetrics | null
  meanAllocatedGPUs: number
  snapshotIntervalMin: number
  formatIntervalDuration: (intervals: number) => string
  tableRows: { name: string; cluster: string; gpuType: string; allocated: number; total: number; free: number; utilizationPct: number }[]
  totalTablePages: number
  effectivePage: number
  paginatedRows: { name: string; cluster: string; gpuType: string; allocated: number; total: number; free: number; utilizationPct: number }[]
  usagePercent: number
  getUsageColor: () => string
  TrendIcon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
}

export function GPUInventoryHistoryChart(props: GPUInventoryHistoryChartProps) {
  const { t, isRefreshing, refetch, localClusterFilter, setLocalClusterFilter, showClusterFilter, setShowClusterFilter, clusterFilterRef, toggleClusterFilter, availableClusters, availableGPUTypes, availableNodes, viewMode, setViewMode, chartMode, setChartMode, selectedGPUType, setSelectedGPUType, selectedNode, setSelectedNode, showTypeDropdown, setShowTypeDropdown, showNodeDropdown, setShowNodeDropdown, typeDropdownRef, nodeDropdownRef, tablePage, setTablePage, chartData, displayChartData, chartGPUTypes, currentTotals, churnMetrics, meanAllocatedGPUs, snapshotIntervalMin, formatIntervalDuration, tableRows, totalTablePages, effectivePage, paginatedRows, usagePercent, getUsageColor, TrendIcon } = props

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
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {availableGPUTypes.length > 1 && (
            <div className="relative" ref={typeDropdownRef}>
              <button
                onClick={() => { setShowTypeDropdown(v => !v); setShowNodeDropdown(() => false) }}
                className={cn('flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border transition-colors',
                  selectedGPUType !== 'all' ? 'border-purple-500/50 bg-purple-500/10 text-purple-400' : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground')}
                title={t('cards:gpuInventoryHistory.filterByType', 'Filter by GPU type')}
              >
                <Cpu className="w-3 h-3" />
                <span className="max-w-[80px] truncate">{selectedGPUType === 'all' ? t('cards:gpuInventoryHistory.allTypes', 'All Types') : selectedGPUType}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {showTypeDropdown && (
                <div className="absolute right-0 top-full mt-1 z-dropdown min-w-[160px] rounded-md border border-border bg-popover shadow-lg py-1">
                  <button onClick={() => { setSelectedGPUType('all'); setShowTypeDropdown(() => false) }} className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/80 transition-colors', selectedGPUType === 'all' ? 'text-purple-400 font-medium' : 'text-foreground')}>
                    {t('cards:gpuInventoryHistory.allTypes', 'All Types')}
                  </button>
                  {(availableGPUTypes || []).map(type => (
                    <button key={type} onClick={() => { setSelectedGPUType(type); setShowTypeDropdown(() => false) }} className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/80 transition-colors', selectedGPUType === type ? 'text-purple-400 font-medium' : 'text-foreground')}>{type}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {availableNodes.length > 1 && (
            <div className="relative" ref={nodeDropdownRef}>
              <button
                onClick={() => { setShowNodeDropdown(v => !v); setShowTypeDropdown(() => false) }}
                className={cn('flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border transition-colors',
                  selectedNode !== 'all' ? 'border-blue-500/50 bg-blue-500/10 text-blue-400' : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground')}
                title={t('cards:gpuInventoryHistory.filterByNode', 'Filter by node')}
              >
                <Server className="w-3 h-3" />
                <span className="max-w-[80px] truncate">{selectedNode === 'all' ? t('cards:gpuInventoryHistory.allNodes', 'All Nodes') : selectedNode}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {showNodeDropdown && (
                <div className="absolute right-0 top-full mt-1 z-dropdown min-w-[160px] max-h-[200px] overflow-y-auto rounded-md border border-border bg-popover shadow-lg py-1">
                  <button onClick={() => { setSelectedNode('all'); setShowNodeDropdown(() => false) }} className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/80 transition-colors', selectedNode === 'all' ? 'text-blue-400 font-medium' : 'text-foreground')}>
                    {t('cards:gpuInventoryHistory.allNodes', 'All Nodes')}
                  </button>
                  {(availableNodes || []).map(node => (
                    <button key={node} onClick={() => { setSelectedNode(node); setShowNodeDropdown(() => false) }} className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/80 transition-colors truncate', selectedNode === node ? 'text-blue-400 font-medium' : 'text-foreground')}>{node}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />{localClusterFilter.length}/{availableClusters.length}
            </span>
          )}
          <CardClusterFilter availableClusters={availableClusters} selectedClusters={localClusterFilter} onToggle={toggleClusterFilter} onClear={() => setLocalClusterFilter([])} isOpen={showClusterFilter} setIsOpen={setShowClusterFilter} containerRef={clusterFilterRef} minClusters={1} />
          <div className="flex items-center border border-border rounded overflow-hidden">
            <button onClick={() => setViewMode('chart')} className={cn('p-1 transition-colors', viewMode === 'chart' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')} title={t('cards:gpuInventoryHistory.chartView', 'Chart view')}><BarChart3 className="w-3.5 h-3.5" /></button>
            <button onClick={() => setViewMode('table')} className={cn('p-1 transition-colors', viewMode === 'table' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')} title={t('cards:gpuInventoryHistory.tableView', 'Table view')}><Table2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20" title={`${currentTotals.total} total GPUs`}>
          <div className="flex items-center gap-1 mb-1"><Cpu className="w-3 h-3 text-blue-400" /><span className="text-xs text-blue-400">{t('common:common.total', 'Total')}</span></div>
          <span className="text-sm font-bold text-foreground">{currentTotals.total}</span>
        </div>
        <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20" title={`${currentTotals.allocated} GPUs allocated`}>
          <div className="flex items-center gap-1 mb-1"><Cpu className="w-3 h-3 text-purple-400" /><span className="text-xs text-purple-400">{t('common:common.used', 'In Use')}</span></div>
          <span className="text-sm font-bold text-foreground">{currentTotals.allocated}</span>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20" title={`${currentTotals.free} GPUs available`}>
          <div className="flex items-center gap-1 mb-1"><Cpu className="w-3 h-3 text-green-400" /><span className="text-xs text-green-400">{t('common:common.free', 'Free')}</span></div>
          <span className="text-sm font-bold text-foreground">{currentTotals.free}</span>
        </div>
        <div className="p-2 rounded-lg bg-secondary/50 border border-border" title={`${usagePercent}% GPU utilization — trend: ${props.trend}`}>
          <div className="flex items-center gap-1 mb-1"><TrendIcon className={`w-3 h-3 ${getUsageColor()}`} aria-hidden={true} /><span className={`text-xs ${getUsageColor()}`}>{t('cards:gpuInventoryHistory.trend', 'Trend')}</span></div>
          <span className={`text-sm font-bold ${getUsageColor()}`}>{usagePercent}%</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 min-h-[160px]">
        {viewMode === 'chart' ? (
          <>
            {availableGPUTypes.length > 1 && selectedGPUType === 'all' && (
              <div className="flex items-center gap-1 mb-1">
                <button onClick={() => setChartMode('aggregate')} className={cn('text-xs px-1.5 py-0.5 rounded transition-colors', chartMode === 'aggregate' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}>{t('cards:gpuInventoryHistory.aggregate', 'Aggregate')}</button>
                <button onClick={() => setChartMode('by-type')} className={cn('text-xs px-1.5 py-0.5 rounded transition-colors', chartMode === 'by-type' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}>{t('cards:gpuInventoryHistory.byType', 'By Type')}</button>
              </div>
            )}
            {(chartData || []).length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">{t('cards:gpuInventoryHistory.collecting', 'Collecting data...')}</div>
            ) : (
              <div style={GPU_INVENTORY_HISTORY_CHART_CONTAINER_STYLE} role="img" aria-label={`GPU inventory history chart: ${currentTotals.allocated} of ${currentTotals.total} GPUs in use (${usagePercent}% utilization), trend: ${props.trend}`}>
                <GPUInventoryChart displayChartData={displayChartData} chartMode={chartMode} chartGPUTypes={chartGPUTypes} t={t} />
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-1.5 px-1 text-muted-foreground font-medium"><span className="flex items-center gap-1"><Server className="w-3 h-3" />{t('cards:gpuInventoryHistory.node', 'Node')}</span></th>
                  <th className="text-left py-1.5 px-1 text-muted-foreground font-medium">{t('cards:gpuInventoryHistory.cluster', 'Cluster')}</th>
                  <th className="text-left py-1.5 px-1 text-muted-foreground font-medium">{t('cards:gpuInventoryHistory.type', 'Type')}</th>
                  <th className="text-right py-1.5 px-1 text-muted-foreground font-medium"><span className="flex items-center justify-end gap-1"><ArrowUpDown className="w-3 h-3" />{t('cards:gpuInventoryHistory.utilization', 'Util.')}</span></th>
                  <th className="text-right py-1.5 px-1 text-muted-foreground font-medium">{t('cards:gpuInventoryHistory.allocFree', 'Alloc/Free')}</th>
                </tr>
              </thead>
              <tbody>
                {(paginatedRows || []).map((row, idx) => (
                  <tr key={`${row.name}-${row.cluster}-${idx}`} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                    <td className="py-1.5 px-1 text-foreground truncate max-w-[120px]" title={row.name}>{row.name}</td>
                    <td className="py-1.5 px-1 text-muted-foreground truncate max-w-[80px]" title={row.cluster}>{row.cluster}</td>
                    <td className="py-1.5 px-1 text-muted-foreground truncate max-w-[100px]" title={row.gpuType}>{row.gpuType}</td>
                    <td className="py-1.5 px-1 text-right"><span className={cn('font-medium', row.utilizationPct >= HIGH_USAGE_PCT ? 'text-red-400' : row.utilizationPct >= MEDIUM_USAGE_PCT ? 'text-yellow-400' : 'text-green-400')}>{row.utilizationPct}%</span></td>
                    <td className="py-1.5 px-1 text-right text-muted-foreground">{row.allocated}/{row.free}</td>
                  </tr>
                ))}
                {(paginatedRows || []).length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">{t('cards:gpuInventoryHistory.noMatchingNodes', 'No matching nodes')}</td></tr>
                )}
              </tbody>
            </table>
            {totalTablePages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-y-2 mt-2 text-xs text-muted-foreground">
                <span>{t('cards:gpuInventoryHistory.showing', 'Showing')} {tablePage * TABLE_PAGE_SIZE + 1}-{Math.min((tablePage + 1) * TABLE_PAGE_SIZE, (tableRows || []).length)} {t('cards:gpuInventoryHistory.of', 'of')} {(tableRows || []).length}</span>
                <div className="flex gap-1">
                  <button onClick={() => setTablePage(p => Math.max(0, p - 1))} disabled={tablePage === 0} className="px-2 py-0.5 rounded border border-border disabled:opacity-40 hover:bg-secondary/80 transition-colors">{t('common:common.prev', 'Prev')}</button>
                  <button onClick={() => setTablePage(p => Math.min(totalTablePages - 1, p + 1))} disabled={tablePage >= totalTablePages - 1} className="px-2 py-0.5 rounded border border-border disabled:opacity-40 hover:bg-secondary/80 transition-colors">{t('common:common.next', 'Next')}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {(chartData || []).length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{t('cards:gpuInventoryHistory.peakUsage', 'Peak')}: <span className="text-foreground font-medium">{Math.max(...(chartData || []).map(d => d.allocated))} GPUs</span></span>
          <span>{t('cards:gpuInventoryHistory.minUsage', 'Min')}: <span className="text-foreground font-medium">{Math.min(...(chartData || []).map(d => d.allocated))} GPUs</span></span>
          <span>{t('cards:gpuInventoryHistory.avgUsage', 'Avg')}: <span className="text-foreground font-medium">{meanAllocatedGPUs} GPUs</span></span>
          {churnMetrics && (
            <>
              <span title={t('cards:gpuInventoryHistory.arrivalRateTooltip', 'Average GPUs newly allocated per snapshot interval')}>
                {t('cards:gpuInventoryHistory.arrivalRate', 'Arrival')}: <span className="text-foreground font-medium">+{churnMetrics.arrivalRate.toFixed(1)}/{snapshotIntervalMin} min</span>
              </span>
              <span title={t('cards:gpuInventoryHistory.departureRateTooltip', 'Average GPUs freed per snapshot interval')}>
                {t('cards:gpuInventoryHistory.departureRate', 'Departure')}: <span className="text-foreground font-medium">-{churnMetrics.departureRate.toFixed(1)}/{snapshotIntervalMin} min</span>
              </span>
              {churnMetrics.avgDurationIntervals > 0 && (
                <span title={t('cards:gpuInventoryHistory.avgDurationTooltip', 'Approximate average allocation duration in snapshot intervals (~10 min each)')}>
                  {t('cards:gpuInventoryHistory.avgDuration', 'Avg Duration')}: <span className="text-foreground font-medium">{formatIntervalDuration(churnMetrics.avgDurationIntervals)}</span>
                </span>
              )}
            </>
          )}
        </div>
      )}

      {/* Retry button shown when refreshing fails */}
      {isRefreshing === false && (
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="hidden">
          <RefreshCw className="w-3 h-3" />
        </Button>
      )}
    </div>
  )
}
