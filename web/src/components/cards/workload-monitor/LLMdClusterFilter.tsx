// Cluster filter flyout for the llm-d stack monitor card.
// Extracted from LLMdStackMonitor.tsx (issue #21614) — markup unchanged.
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Filter, Server } from 'lucide-react'
import { ClusterStatusDot, getClusterState } from '../../ui/ClusterStatusBadge'
import type { ClusterInfo } from '../../../hooks/mcp/types'

interface LLMdClusterFilterProps {
  containerRef: RefObject<HTMLDivElement | null>
  buttonRef: RefObject<HTMLButtonElement | null>
  availableClusters: ClusterInfo[]
  selectedClusters: string[]
  showDropdown: boolean
  dropdownStyle: { top: number; left: number } | null
  onToggleDropdown: () => void
  onClearFilter: () => void
  onToggleCluster: (cluster: string) => void
}

export function LLMdClusterFilter({
  containerRef,
  buttonRef,
  availableClusters,
  selectedClusters,
  showDropdown,
  dropdownStyle,
  onToggleDropdown,
  onClearFilter,
  onToggleCluster,
}: LLMdClusterFilterProps) {
  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        onClick={onToggleDropdown}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
          selectedClusters.length > 0
            ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
            : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
        }`}
        title="Filter by cluster"
      >
        <Filter className="w-3 h-3" />
        {selectedClusters.length > 0 && (
          <span className="flex items-center gap-1">
            <Server className="w-3 h-3" />
            {selectedClusters.length}/{availableClusters.length}
          </span>
        )}
        <ChevronDown className="w-3 h-3" />
      </button>
      {showDropdown && dropdownStyle && createPortal(
        <div
          className="fixed w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50"
          style={{ top: dropdownStyle.top, left: dropdownStyle.left }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="p-1">
            <button
              onClick={onClearFilter}
              className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                selectedClusters.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
              }`}
            >
              All clusters
            </button>
            {availableClusters.map(cluster => {
              const clusterState = getClusterState(
                cluster.healthy,
                cluster.reachable,
                cluster.nodeCount,
                undefined,
                cluster.errorType
              )
              const stateLabel = clusterState === 'healthy' ? '' :
                clusterState === 'degraded' ? 'degraded' :
                clusterState === 'unreachable-auth' ? 'needs auth' :
                clusterState === 'unreachable-timeout' ? 'offline' :
                'offline'
              return (
                <button
                  key={cluster.name}
                  onClick={() => onToggleCluster(cluster.name)}
                  className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors flex items-center gap-2 ${
                    selectedClusters.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                  }`}
                  title={stateLabel ? `${cluster.name} (${stateLabel})` : cluster.name}
                >
                  <ClusterStatusDot state={clusterState} size="sm" />
                  <span className="flex-1 truncate">{cluster.name}</span>
                  {stateLabel && (
                    <span className="text-2xs text-muted-foreground shrink-0">{stateLabel}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
