import type { ReactNode, ComponentType } from 'react'
import type { ChatMessage } from './CardChat'
import type { CardSkeletonProps } from '@/lib/cards/CardComponents'

/** Dimensions of the card's content container (updated via ResizeObserver) */
export interface CardContainerSize {
  width: number
  height: number
}

// Context type to expose card expanded state to children
export interface CardExpandedContextType {
  isExpanded: boolean
  /** Live dimensions of the expanded modal content container (0x0 when collapsed) */
  containerSize: CardContainerSize
}

/** Flash type for significant data changes */
export type CardFlashType = 'none' | 'info' | 'warning' | 'error'

export interface PendingSwap {
  newType: string
  newTitle?: string
  reason: string
  swapAt: Date
}

export interface CardWrapperProps {
  cardId?: string
  cardType: string
  title?: string
  /** Icon to display next to the card title */
  icon?: ComponentType<{ className?: string }>
  /** Icon color class (e.g., 'text-purple-400') - defaults to title color */
  iconColor?: string
  lastSummary?: string
  pendingSwap?: PendingSwap
  chatMessages?: ChatMessage[]
  dragHandle?: ReactNode
  /** Whether the card is currently refreshing data */
  isRefreshing?: boolean
  /** Last time the card data was updated */
  lastUpdated?: Date | null
  /** Whether this card uses demo/mock data instead of real data */
  isDemoData?: boolean
  /** Whether this card is showing live/real-time data (for time-series/trend cards) */
  isLive?: boolean
  /** Force live mode — suppress demo badge even when global demo mode is on.
   *  Used by GPU Reservations when running in-cluster with OAuth. */
  forceLive?: boolean
  /** Whether data refresh has failed 3+ times consecutively */
  isFailed?: boolean
  /** Number of consecutive refresh failures */
  consecutiveFailures?: number
  /** Current card width in grid columns (1-12) */
  cardWidth?: number
  /** Whether the card is collapsed (showing only header) */
  isCollapsed?: boolean
  /** Flash animation type when significant data changes occur */
  flashType?: CardFlashType
  /** Callback when collapsed state changes */
  onCollapsedChange?: (collapsed: boolean) => void
  onSwap?: (newType: string) => void
  onSwapCancel?: () => void
  onConfigure?: () => void
  onRemove?: () => void
  onRefresh?: () => void
  /** Callback when card width is changed */
  onWidthChange?: (newWidth: number) => void
  /** Current card height in grid row spans */
  cardHeight?: number
  /** Callback when card height is changed */
  onHeightChange?: (newHeight: number) => void
  onChatMessage?: (message: string) => Promise<ChatMessage>
  onChatMessagesChange?: (messages: ChatMessage[]) => void
  /** Skeleton type to show when loading with no cached data */
  skeletonType?: CardSkeletonProps['type']
  /** Number of skeleton rows to show */
  skeletonRows?: number
  /** Register a callback to expand the card programmatically (keyboard nav) */
  registerExpandTrigger?: (expand: () => void) => void
  children: ReactNode
}
