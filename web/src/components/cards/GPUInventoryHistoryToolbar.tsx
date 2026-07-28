import type { Dispatch, RefObject, SetStateAction } from 'react'
import { Cpu, Server, BarChart3, Table2, ChevronDown, Clock } from 'lucide-react'
import { CardClusterFilter } from '../../lib/cards/CardComponents'
import { cn } from '../../lib/cn'
import type { TranslateFn, ViewMode } from './GPUInventoryHistory.parts'

interface GPUInventoryHistoryToolbarProps {
  chartDataLength: number
  availableGPUTypes: string[]
  availableNodes: string[]
  availableClusters: Array<{ name: string; reachable: boolean }>
  selectedGPUType: string
  selectedNode: string
  localClusterFilter: string[]
  showTypeDropdown: boolean
  setShowTypeDropdown: Dispatch<SetStateAction<boolean>>
  showNodeDropdown: boolean
  setShowNodeDropdown: Dispatch<SetStateAction<boolean>>
  showClusterFilter: boolean
  setShowClusterFilter: Dispatch<SetStateAction<boolean>>
  setSelectedGPUType: Dispatch<SetStateAction<string>>
  setSelectedNode: Dispatch<SetStateAction<string>>
  toggleClusterFilter: (clusterName: string) => void
  clearClusterFilter: () => void
  viewMode: ViewMode
  setViewMode: Dispatch<SetStateAction<ViewMode>>
  typeDropdownRef: RefObject<HTMLDivElement>
  nodeDropdownRef: RefObject<HTMLDivElement>
  clusterFilterRef: RefObject<HTMLDivElement>
  t: TranslateFn
}

export function GPUInventoryHistoryToolbar({
  chartDataLength,
  availableGPUTypes,
  availableNodes,
  availableClusters,
  selectedGPUType,
  selectedNode,
  localClusterFilter,
  showTypeDropdown,
  setShowTypeDropdown,
  showNodeDropdown,
  setShowNodeDropdown,
  showClusterFilter,
  setShowClusterFilter,
  setSelectedGPUType,
  setSelectedNode,
  toggleClusterFilter,
  clearClusterFilter,
  viewMode,
  setViewMode,
  typeDropdownRef,
  nodeDropdownRef,
  clusterFilterRef,
  t,
}: GPUInventoryHistoryToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-2">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground truncate min-w-0 flex-1">
          {chartDataLength} {t('cards:gpuInventoryHistory.snapshots', 'snapshots')}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        {availableGPUTypes.length > 1 && (
          <div className="relative" ref={typeDropdownRef}>
            <button
              onClick={() => { setShowTypeDropdown(v => !v); setShowNodeDropdown(false) }}
              className={cn(
                'flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border transition-colors',
                selectedGPUType !== 'all'
                  ? 'border-purple-500/50 bg-purple-500/10 text-purple-400'
                  : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground',
              )}
              title={t('cards:gpuInventoryHistory.filterByType', 'Filter by GPU type')}
            >
              <Cpu className="w-3 h-3" />
              <span className="max-w-[80px] truncate">{selectedGPUType === 'all' ? t('cards:gpuInventoryHistory.allTypes', 'All Types') : selectedGPUType}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showTypeDropdown && (
              <div className="absolute right-0 top-full mt-1 z-dropdown min-w-[160px] rounded-md border border-border bg-popover shadow-lg py-1">
                <button
                  onClick={() => { setSelectedGPUType('all'); setShowTypeDropdown(false) }}
                  className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/80 transition-colors',
                    selectedGPUType === 'all' ? 'text-purple-400 font-medium' : 'text-foreground',
                  )}
                >
                  {t('cards:gpuInventoryHistory.allTypes', 'All Types')}
                </button>
                {(availableGPUTypes || []).map(type => (
                  <button
                    key={type}
                    onClick={() => { setSelectedGPUType(type); setShowTypeDropdown(false) }}
                    className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/80 transition-colors',
                      selectedGPUType === type ? 'text-purple-400 font-medium' : 'text-foreground',
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {availableNodes.length > 1 && (
          <div className="relative" ref={nodeDropdownRef}>
            <button
              onClick={() => { setShowNodeDropdown(v => !v); setShowTypeDropdown(false) }}
              className={cn(
                'flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border transition-colors',
                selectedNode !== 'all'
                  ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                  : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground',
              )}
              title={t('cards:gpuInventoryHistory.filterByNode', 'Filter by node')}
            >
              <Server className="w-3 h-3" />
              <span className="max-w-[80px] truncate">{selectedNode === 'all' ? t('cards:gpuInventoryHistory.allNodes', 'All Nodes') : selectedNode}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showNodeDropdown && (
              <div className="absolute right-0 top-full mt-1 z-dropdown min-w-[160px] max-h-[200px] overflow-y-auto rounded-md border border-border bg-popover shadow-lg py-1">
                <button
                  onClick={() => { setSelectedNode('all'); setShowNodeDropdown(false) }}
                  className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/80 transition-colors',
                    selectedNode === 'all' ? 'text-blue-400 font-medium' : 'text-foreground',
                  )}
                >
                  {t('cards:gpuInventoryHistory.allNodes', 'All Nodes')}
                </button>
                {(availableNodes || []).map(node => (
                  <button
                    key={node}
                    onClick={() => { setSelectedNode(node); setShowNodeDropdown(false) }}
                    className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/80 transition-colors truncate',
                      selectedNode === node ? 'text-blue-400 font-medium' : 'text-foreground',
                    )}
                  >
                    {node}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {localClusterFilter.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
            <Server className="w-3 h-3" />
            {localClusterFilter.length}/{availableClusters.length}
          </span>
        )}
        <CardClusterFilter
          availableClusters={availableClusters}
          selectedClusters={localClusterFilter}
          onToggle={toggleClusterFilter}
          onClear={clearClusterFilter}
          isOpen={showClusterFilter}
          setIsOpen={setShowClusterFilter}
          containerRef={clusterFilterRef}
          minClusters={1}
        />

        <div className="flex items-center border border-border rounded overflow-hidden">
          <button
            onClick={() => setViewMode('chart')}
            className={cn(
              'p-1 transition-colors',
              viewMode === 'chart' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            title={t('cards:gpuInventoryHistory.chartView', 'Chart view')}
          >
            <BarChart3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={cn(
              'p-1 transition-colors',
              viewMode === 'table' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            title={t('cards:gpuInventoryHistory.tableView', 'Table view')}
          >
            <Table2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
