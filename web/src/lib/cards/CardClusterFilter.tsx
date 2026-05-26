import { createPortal } from 'react-dom'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { ChevronDown, Filter, Server } from 'lucide-react'
import { useCardType } from '../../components/cards/CardWrapper'
import { ClusterStatusDot, getClusterState, type ClusterState } from '../../components/ui/ClusterStatusBadge'
import { useKeyboardNav } from '../../hooks/useKeyboardNav'
import { emitCardClusterFilterChanged } from '../analytics'
import type { ClusterWithHealth } from './cardHooks'

export interface CardClusterFilterProps {
  /** Available clusters to filter (includes health info for status indicators) */
  availableClusters: ClusterWithHealth[]
  /** Currently selected clusters */
  selectedClusters: string[]
  /** Toggle cluster selection */
  onToggle: (cluster: string) => void
  /** Clear all selections */
  onClear: () => void
  /** Whether dropdown is visible */
  isOpen: boolean
  /** Set dropdown visibility */
  setIsOpen: (open: boolean) => void
  /** Ref for click outside handling */
  containerRef: RefObject<HTMLDivElement | null>
  /** Minimum number of clusters required to show filter (default: 2) */
  minClusters?: number
}

export function CardClusterFilter({
  availableClusters,
  selectedClusters,
  onToggle,
  onClear,
  isOpen,
  setIsOpen,
  containerRef,
  minClusters = 2 }: CardClusterFilterProps) {
  const cardType = useCardType()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)
  const keyboardNav = useKeyboardNav({ selector: 'button:not([disabled])', orientation: 'vertical', onEscape: () => setIsOpen(false) })

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + DROPDOWN_GAP,
        left: Math.max(DROPDOWN_GAP * 2, rect.right - DROPDOWN_WIDTH) })
    } else {
      setDropdownPos(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleScroll = () => setIsOpen(false)
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true })

    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [isOpen, setIsOpen])

  useEffect(() => {
    if (!isOpen || !dropdownPos) return

    keyboardNav.focusMatchingItem({ preferredSelector: 'button[aria-pressed="true"]', fallbackSelector: 'button:not([disabled])' })
  }, [dropdownPos, isOpen, keyboardNav])

  if (availableClusters.length < minClusters) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          setIsOpen(true)
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${selectedClusters.length > 0
          ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
          : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
          }`}
        title="Filter by cluster"
      >
        <Filter className="w-3 h-3" />
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && dropdownPos && createPortal(
        <div
          ref={(node) => {
            dropdownRef.current = node
            keyboardNav.containerRef.current = node
          }}
          role="listbox"
          aria-label="Cluster filter"
          className="fixed w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-dropdown"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
          onMouseDown={e => e.stopPropagation()}
          onKeyDown={(event) => {
            keyboardNav.handleKeyDown(event)
            if (event.key === 'Escape') {
              buttonRef.current?.focus()
            }
          }}
        >
          <div className="p-1">
            <button
              aria-pressed={selectedClusters.length === 0}
              onClick={() => { onClear(); emitCardClusterFilterChanged(0, availableClusters.length, cardType) }}
              className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${selectedClusters.length === 0
                ? 'bg-purple-500/20 text-purple-400'
                : 'hover:bg-secondary text-foreground'
                }`}
            >
              All clusters
            </button>
            {availableClusters.map((cluster) => {
              // Determine cluster state for status indicator.
              // Pass `cluster.healthy` through as-is (don't default to true)
              // so clusters with no health signal surface as `unknown`
              // rather than silently appearing healthy (#5923, #5942).
              const clusterState: ClusterState = cluster.healthy !== undefined || cluster.reachable !== undefined
                ? getClusterState(
                  cluster.healthy,
                  cluster.reachable,
                  cluster.nodeCount,
                  undefined,
                  cluster.errorType
                )
                : 'unknown'

              const isUnreachable = cluster.reachable === false

              // Get status label for tooltip
              const stateLabel = clusterState === 'healthy' ? '' :
                clusterState === 'degraded' ? 'degraded' :
                  clusterState === 'unreachable-auth' ? 'needs auth' :
                    clusterState === 'unreachable-timeout' ? 'offline' :
                      clusterState.startsWith('unreachable') ? 'offline' : ''

              return (
                <button
                  key={cluster.name}
                  aria-pressed={selectedClusters.includes(cluster.name)}
                  onClick={() => {
                    if (!isUnreachable) {
                      onToggle(cluster.name)
                      // Compute resulting count: toggling adds or removes one cluster
                      const willBeSelected = !selectedClusters.includes(cluster.name)
                      const newCount = willBeSelected ? selectedClusters.length + 1 : selectedClusters.length - 1
                      emitCardClusterFilterChanged(newCount, availableClusters.length, cardType)
                    }
                  }}
                  disabled={isUnreachable}
                  className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors flex items-center gap-2 ${isUnreachable
                    ? 'opacity-40 cursor-not-allowed'
                    : selectedClusters.includes(cluster.name)
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'hover:bg-secondary text-foreground'
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

// ============================================================================
// useDropdownPortal - Shared hook for portaling dropdowns out of overflow
// ============================================================================

export const DROPDOWN_WIDTH = 192 // w-48 = 12rem = 192px
export const DROPDOWN_GAP = 4

/**
 * Hook that computes fixed positioning for a dropdown rendered via createPortal.
 * Attach `triggerRef` to the button that opens the dropdown.
 * When `isOpen` is true, `style` will contain { top, left } for the portal div.
 */
export function useDropdownPortal(isOpen: boolean) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [style, setStyle] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setStyle({
        top: rect.bottom + DROPDOWN_GAP,
        left: Math.max(8, rect.right - DROPDOWN_WIDTH) })
    } else {
      setStyle(null)
    }
  }, [isOpen])

  return { triggerRef, style }
}

// ============================================================================
// CardClusterIndicator - Shows current cluster filter state
// ============================================================================

export interface CardClusterIndicatorProps {
  selectedCount: number
  totalCount: number
}

export function CardClusterIndicator({ selectedCount, totalCount }: CardClusterIndicatorProps) {
  if (selectedCount === 0) return null

  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
      <Server className="w-3 h-3" />
      {selectedCount}/{totalCount}
    </span>
  )
}
