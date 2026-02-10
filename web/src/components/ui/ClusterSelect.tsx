import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { ClusterStatusDot, getClusterState, type ClusterState } from './ClusterStatusBadge'
import type { ClusterErrorType } from '../../lib/errorClassifier'
import { cn } from '../../lib/cn'

interface ClusterInfo {
  name: string
  healthy?: boolean
  reachable?: boolean
  nodeCount?: number
  errorType?: ClusterErrorType
}

interface ClusterSelectProps {
  clusters: ClusterInfo[]
  value: string
  onChange: (cluster: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

/**
 * Custom single-select cluster dropdown with health status indicators.
 * Shows ClusterStatusDot next to each cluster name and disables offline clusters.
 */
export function ClusterSelect({
  clusters,
  value,
  onChange,
  disabled = false,
  placeholder = 'Select cluster...',
  className,
}: ClusterSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const calculatePosition = useCallback(() => {
    if (!buttonRef.current) return null
    const rect = buttonRef.current.getBoundingClientRect()
    return {
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      setDropdownPos(calculatePosition())
    } else {
      setDropdownPos(null)
    }
  }, [isOpen, calculatePosition])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const selectedCluster = clusters.find(c => c.name === value)
  const selectedState: ClusterState | null = selectedCluster
    ? (selectedCluster.healthy !== undefined || selectedCluster.reachable !== undefined
        ? getClusterState(selectedCluster.healthy ?? true, selectedCluster.reachable, selectedCluster.nodeCount, undefined, selectedCluster.errorType)
        : 'healthy')
    : null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'flex items-center gap-2 text-sm rounded-md bg-secondary/50 border border-border px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-left',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
      >
        {selectedState && <ClusterStatusDot state={selectedState} size="sm" />}
        <span className="flex-1 truncate">{value || placeholder}</span>
        <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
      </button>

      {isOpen && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          className="fixed max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="p-1">
            {/* Empty option */}
            <button
              onClick={() => { onChange(''); setIsOpen(false) }}
              className={cn(
                'w-full px-2 py-1.5 text-xs text-left rounded transition-colors',
                !value ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-muted-foreground',
              )}
            >
              {placeholder}
            </button>
            {clusters.map(cluster => {
              const clusterState: ClusterState = cluster.healthy !== undefined || cluster.reachable !== undefined
                ? getClusterState(cluster.healthy ?? true, cluster.reachable, cluster.nodeCount, undefined, cluster.errorType)
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
                  onClick={() => {
                    if (!isUnreachable) {
                      onChange(cluster.name)
                      setIsOpen(false)
                    }
                  }}
                  disabled={isUnreachable}
                  className={cn(
                    'w-full px-2 py-1.5 text-xs text-left rounded transition-colors flex items-center gap-2',
                    isUnreachable
                      ? 'opacity-40 cursor-not-allowed'
                      : value === cluster.name
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'hover:bg-secondary text-foreground',
                  )}
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
        document.body,
      )}
    </>
  )
}
