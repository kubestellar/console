import { useRef, useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Filter, ChevronDown, Server } from 'lucide-react'
import { ClusterStatusDot, getClusterState, type ClusterState } from './ClusterStatusBadge'
import type { ClusterErrorType } from '../../lib/errorClassifier'

interface ClusterFilterDropdownProps {
  localClusterFilter: string[]
  availableClusters: { name: string; healthy?: boolean; reachable?: boolean; nodeCount?: number; errorType?: ClusterErrorType }[]
  showClusterFilter: boolean
  setShowClusterFilter: (show: boolean) => void
  toggleClusterFilter: (cluster: string) => void
  clearClusterFilter: () => void
  clusterFilterRef: React.RefObject<HTMLDivElement>
  /** Minimum clusters before showing the filter (default: 1) */
  minClusters?: number
}

/**
 * Cluster filter dropdown with dynamic positioning.
 * Automatically detects whether to open left or right based on available space.
 */
export function ClusterFilterDropdown({
  localClusterFilter,
  availableClusters,
  showClusterFilter,
  setShowClusterFilter,
  toggleClusterFilter,
  clearClusterFilter,
  clusterFilterRef,
  minClusters = 1,
}: ClusterFilterDropdownProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left?: number; right?: number } | null>(null)

  // Calculate dropdown position when opening (using fixed positioning for portal)
  const calculatePosition = useCallback(() => {
    if (!buttonRef.current) return null

    const buttonRect = buttonRef.current.getBoundingClientRect()
    const dropdownWidth = 160 // w-40 = 10rem = 160px

    // Check space on right side
    const spaceOnRight = window.innerWidth - buttonRect.right
    // Check space on left side
    const spaceOnLeft = buttonRect.left

    const top = buttonRect.bottom + 4 // 4px gap below button

    // If more space on right, align dropdown left edge with button left edge
    // If more space on left, align dropdown right edge with button right edge
    if (spaceOnRight >= dropdownWidth) {
      return { top, left: buttonRect.left }
    } else if (spaceOnLeft >= dropdownWidth) {
      return { top, right: window.innerWidth - buttonRect.right }
    } else {
      // Not enough space either way, default to whichever has more
      return spaceOnRight >= spaceOnLeft
        ? { top, left: buttonRect.left }
        : { top, right: window.innerWidth - buttonRect.right }
    }
  }, [])

  // Update position when dropdown opens
  useEffect(() => {
    if (showClusterFilter) {
      setDropdownStyle(calculatePosition())
    }
  }, [showClusterFilter, calculatePosition])

  if (availableClusters.length < minClusters) {
    return null
  }

  return (
    <>
      {/* Cluster count indicator */}
      {localClusterFilter.length > 0 && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
          <Server className="w-3 h-3" />
          {localClusterFilter.length}/{availableClusters.length}
        </span>
      )}

      {/* Cluster filter dropdown */}
      <div ref={clusterFilterRef} className="relative">
        <button
          ref={buttonRef}
          onClick={() => setShowClusterFilter(!showClusterFilter)}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
            localClusterFilter.length > 0
              ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
              : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
          }`}
          title="Filter by cluster"
        >
          <Filter className="w-3 h-3" />
          <ChevronDown className="w-3 h-3" />
        </button>

        {/* Portal dropdown to escape overflow-hidden containers */}
        {showClusterFilter && dropdownStyle && createPortal(
          <div
            className="fixed w-40 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50"
            style={{
              top: dropdownStyle.top,
              left: dropdownStyle.left,
              right: dropdownStyle.right,
            }}
          >
            <div className="p-1">
              <button
                onClick={clearClusterFilter}
                className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                  localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                }`}
              >
                All clusters
              </button>
              {availableClusters.map(cluster => {
                const clusterState: ClusterState = cluster.healthy !== undefined || cluster.reachable !== undefined
                  ? getClusterState(
                      cluster.healthy ?? true,
                      cluster.reachable,
                      cluster.nodeCount,
                      undefined,
                      cluster.errorType
                    )
                  : 'healthy'

                const isUnreachable = cluster.reachable === false
                const stateLabel = clusterState === 'healthy' ? '' :
                  clusterState === 'degraded' ? 'degraded' :
                  clusterState === 'unreachable-auth' ? 'needs auth' :
                  clusterState === 'unreachable-timeout' ? 'offline' :
                  clusterState.startsWith('unreachable') ? 'offline' : ''

                return (
                  <button
                    key={cluster.name}
                    onClick={() => !isUnreachable && toggleClusterFilter(cluster.name)}
                    disabled={isUnreachable}
                    className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors flex items-center gap-2 ${
                      isUnreachable
                        ? 'opacity-40 cursor-not-allowed'
                        : localClusterFilter.includes(cluster.name)
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'hover:bg-secondary text-foreground'
                    }`}
                    title={stateLabel ? `${cluster.name} (${stateLabel})` : cluster.name}
                  >
                    <ClusterStatusDot state={clusterState} size="sm" />
                    <span className="flex-1 truncate">{cluster.name}</span>
                    {stateLabel && (
                      <span className="text-[10px] text-muted-foreground shrink-0">{stateLabel}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>,
          document.body
        )}
      </div>
    </>
  )
}
