import { type ReactNode, type RefObject } from 'react'
import { type SortDirection, CardControls as CardControlsUI } from '../../components/ui/CardControls'
import { CardClusterFilter, CardClusterIndicator } from './CardClusterFilter'

export interface CardControlsRowProps {
  /** Cluster filter config (from useCardData or useCardFilters) */
  clusterFilter?: {
    availableClusters: { name: string }[]
    selectedClusters: string[]
    onToggle: (cluster: string) => void
    onClear: () => void
    isOpen: boolean
    setIsOpen: (open: boolean) => void
    containerRef: RefObject<HTMLDivElement | null>
    minClusters?: number
  }
  /** Cluster indicator showing selected/total count */
  clusterIndicator?: {
    selectedCount: number
    totalCount: number
  }
  /** Sort & limit controls */
  cardControls?: {
    limit: number | 'unlimited'
    onLimitChange: (limit: number | 'unlimited') => void
    sortBy: string
    sortOptions: { value: string; label: string }[]
    onSortChange: (sortBy: string) => void
    sortDirection: SortDirection
    onSortDirectionChange: (dir: SortDirection) => void
  }
  /** Extra content to render at the end */
  extra?: ReactNode
  className?: string
}

/**
 * Composition component assembling the standard controls row:
 * [ClusterIndicator] [ClusterFilter] [CardControls] [Extra]
 *
 * Refresh is handled by CardWrapper's title bar — do NOT add a refresh
 * button here to avoid duplication.
 *
 * All sections are optional — only renders what's provided.
 */
export function CardControlsRow({
  clusterFilter,
  clusterIndicator,
  cardControls,
  extra,
  className = '' }: CardControlsRowProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 mb-3 ${className}`}>
      {clusterIndicator && (
        <CardClusterIndicator
          selectedCount={clusterIndicator.selectedCount}
          totalCount={clusterIndicator.totalCount}
        />
      )}
      {clusterFilter && (
        <CardClusterFilter
          availableClusters={clusterFilter.availableClusters}
          selectedClusters={clusterFilter.selectedClusters}
          onToggle={clusterFilter.onToggle}
          onClear={clusterFilter.onClear}
          isOpen={clusterFilter.isOpen}
          setIsOpen={clusterFilter.setIsOpen}
          containerRef={clusterFilter.containerRef}
          minClusters={clusterFilter.minClusters}
        />
      )}
      {cardControls && (
        <CardControlsUI
          limit={cardControls.limit}
          onLimitChange={cardControls.onLimitChange}
          sortBy={cardControls.sortBy}
          sortOptions={cardControls.sortOptions}
          onSortChange={cardControls.onSortChange}
          sortDirection={cardControls.sortDirection}
          onSortDirectionChange={cardControls.onSortDirectionChange}
        />
      )}
      {extra}
    </div>
  )
}
