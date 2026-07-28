import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Filter, ChevronDown, Server } from 'lucide-react'
import { ClusterStatusDot, getClusterState } from '../../../ui/ClusterStatusBadge'

interface Cluster {
  name: string
  healthy?: boolean
  reachable?: boolean
  nodeCount?: number
  errorType?: string
}

interface ClusterFilterProps {
  availableClusters: Cluster[]
  localClusterFilter: string[]
  onToggleCluster: (cluster: string) => void
  onClearFilter: () => void
}

export function ClusterFilter({
  availableClusters,
  localClusterFilter,
  onToggleCluster,
  onClearFilter
}: ClusterFilterProps) {
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)
  const clusterFilterBtnRef = useRef<HTMLButtonElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number } | null>(null)

  // Compute dropdown position
  useEffect(() => {
    if (showClusterFilter && clusterFilterBtnRef.current) {
      const rect = clusterFilterBtnRef.current.getBoundingClientRect()
      setDropdownStyle({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - 192) })
    } else {
      setDropdownStyle(null)
    }
  }, [showClusterFilter])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(event.target as Node)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close dropdown on Escape key
  useEffect(() => {
    if (!showClusterFilter) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setShowClusterFilter(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showClusterFilter])

  if (availableClusters.length < 1) {
    return null
  }

  return (
    <div ref={clusterFilterRef} className="relative">
      <button
        ref={clusterFilterBtnRef}
        onClick={() => setShowClusterFilter(!showClusterFilter)}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
          localClusterFilter.length > 0
            ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
            : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
        }`}
        title="Filter by cluster"
      >
        <Filter className="w-3 h-3" />
        {localClusterFilter.length > 0 && (
          <span className="flex items-center gap-1">
            <Server className="w-3 h-3" />
            {localClusterFilter.length}/{availableClusters.length}
          </span>
        )}
        <ChevronDown className="w-3 h-3" />
      </button>
      {showClusterFilter && dropdownStyle && createPortal(
        <div
          className="fixed w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50"
          style={{ top: dropdownStyle.top, left: dropdownStyle.left }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="p-1">
            <button
              onClick={() => { onClearFilter(); setShowClusterFilter(false) }}
              className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
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
                  onClick={() => { onToggleCluster(cluster.name); }}
                  className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors flex items-center gap-2 ${
                    localClusterFilter.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
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
