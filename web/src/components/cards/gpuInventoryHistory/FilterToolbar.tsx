import type { RefObject } from 'react'
import { Cpu, Server, ChevronDown, BarChart3, Table2 } from 'lucide-react'
import type { TFunction } from 'i18next'
import { CardClusterFilter } from '../../../lib/cards/CardComponents'
import { cn } from '../../../lib/cn'
import type { ViewMode } from '../GPUInventoryHistory.parts'

export interface FilterToolbarProps {
  t: TFunction
  availableGPUTypes: string[]
  selectedGPUType: string
  onSelectGPUType: (type: string) => void
  showTypeDropdown: boolean
  onToggleTypeDropdown: () => void
  typeDropdownRef: RefObject<HTMLDivElement>
  availableNodes: string[]
  selectedNode: string
  onSelectNode: (node: string) => void
  showNodeDropdown: boolean
  onToggleNodeDropdown: () => void
  nodeDropdownRef: RefObject<HTMLDivElement>
  availableClusters: Array<{ name: string; reachable: boolean }>
  localClusterFilter: string[]
  onToggleClusterFilter: (clusterName: string) => void
  onClearClusterFilter: () => void
  showClusterFilter: boolean
  setShowClusterFilter: (open: boolean) => void
  clusterFilterRef: RefObject<HTMLDivElement>
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

/**
 * Header toolbar for GPUInventoryHistory: GPU-type filter dropdown, node
 * filter dropdown, cluster filter, and chart/table view mode toggle.
 * Extracted from GPUInventoryHistory.tsx to keep that file under the
 * line/hook budget (#21650).
 */
export function FilterToolbar({
  t,
  availableGPUTypes,
  selectedGPUType,
  onSelectGPUType,
  showTypeDropdown,
  onToggleTypeDropdown,
  typeDropdownRef,
  availableNodes,
  selectedNode,
  onSelectNode,
  showNodeDropdown,
  onToggleNodeDropdown,
  nodeDropdownRef,
  availableClusters,
  localClusterFilter,
  onToggleClusterFilter,
  onClearClusterFilter,
  showClusterFilter,
  setShowClusterFilter,
  clusterFilterRef,
  viewMode,
  onViewModeChange,
}: FilterToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
      {/* GPU Type filter dropdown */}
      {availableGPUTypes.length > 1 && (
        <div className="relative" ref={typeDropdownRef}>
          <button
            onClick={onToggleTypeDropdown}
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
                onClick={() => onSelectGPUType('all')}
                className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/80 transition-colors',
                  selectedGPUType === 'all' ? 'text-purple-400 font-medium' : 'text-foreground',
                )}
              >
                {t('cards:gpuInventoryHistory.allTypes', 'All Types')}
              </button>
              {(availableGPUTypes || []).map(type => (
                <button
                  key={type}
                  onClick={() => onSelectGPUType(type)}
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

      {/* Node filter dropdown */}
      {availableNodes.length > 1 && (
        <div className="relative" ref={nodeDropdownRef}>
          <button
            onClick={onToggleNodeDropdown}
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
                onClick={() => onSelectNode('all')}
                className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/80 transition-colors',
                  selectedNode === 'all' ? 'text-blue-400 font-medium' : 'text-foreground',
                )}
              >
                {t('cards:gpuInventoryHistory.allNodes', 'All Nodes')}
              </button>
              {(availableNodes || []).map(node => (
                <button
                  key={node}
                  onClick={() => onSelectNode(node)}
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

      {/* Cluster filter */}
      {localClusterFilter.length > 0 && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
          <Server className="w-3 h-3" />
          {localClusterFilter.length}/{availableClusters.length}
        </span>
      )}
      <CardClusterFilter
        availableClusters={availableClusters}
        selectedClusters={localClusterFilter}
        onToggle={onToggleClusterFilter}
        onClear={onClearClusterFilter}
        isOpen={showClusterFilter}
        setIsOpen={setShowClusterFilter}
        containerRef={clusterFilterRef}
        minClusters={1}
      />

      {/* View mode toggle */}
      <div className="flex items-center border border-border rounded overflow-hidden">
        <button
          onClick={() => onViewModeChange('chart')}
          className={cn(
            'p-1 transition-colors',
            viewMode === 'chart' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
          title={t('cards:gpuInventoryHistory.chartView', 'Chart view')}
        >
          <BarChart3 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onViewModeChange('table')}
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
  )
}
