import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { ClusterStatusDot, getClusterState, type ClusterState } from './ClusterStatusBadge'
import type { ClusterErrorType } from '../../lib/errorClassifier'
import { cn } from '../../lib/cn'
import { Button } from './Button'

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
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const selectedCluster = clusters.find(c => c.name === value)
  const selectedState: ClusterState | null = selectedCluster
    ? (selectedCluster.healthy !== undefined || selectedCluster.reachable !== undefined
        ? getClusterState(selectedCluster.healthy ?? true, selectedCluster.reachable, selectedCluster.nodeCount, undefined, selectedCluster.errorType)
        : 'healthy')
    : null

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        variant="secondary"
        size="md"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'rounded-md border border-border px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-left',
          className,
        )}
        icon={selectedState ? <ClusterStatusDot state={selectedState} size="sm" /> : undefined}
        iconRight={<ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />}
      >
        <span className="flex-1 truncate">{value || placeholder}</span>
      </Button>

      {isOpen && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          role="listbox"
          aria-label={placeholder.replace(/\.+$/, '')}
          className="fixed max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="p-1">
            {/* Empty option */}
            <Button
              variant="ghost"
              size="sm"
              role="option"
              aria-selected={!value}
              onClick={() => { onChange(''); setIsOpen(false) }}
              className={cn(
                'w-full justify-start px-2 py-1.5 text-xs',
                !value ? 'bg-purple-900 text-purple-400' : 'text-muted-foreground',
              )}
              fullWidth
            >
              {placeholder}
            </Button>
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
                <Button
                  key={cluster.name}
                  variant="ghost"
                  size="sm"
                  role="option"
                  aria-selected={value === cluster.name}
                  onClick={() => {
                    if (!isUnreachable) {
                      onChange(cluster.name)
                      setIsOpen(false)
                    }
                  }}
                  disabled={isUnreachable}
                  className={cn(
                    'w-full justify-start px-2 py-1.5 text-xs',
                    isUnreachable
                      ? 'opacity-40 cursor-not-allowed'
                      : value === cluster.name
                        ? 'bg-purple-900 text-purple-400'
                        : 'text-foreground',
                  )}
                  fullWidth
                  title={stateLabel ? `${cluster.name} (${stateLabel})` : cluster.name}
                  icon={<ClusterStatusDot state={clusterState} size="sm" />}
                >
                  <span className="flex-1 truncate">{cluster.name}</span>
                  {stateLabel && (
                    <span className="text-2xs text-muted-foreground shrink-0">{stateLabel}</span>
                  )}
                </Button>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
