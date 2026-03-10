import { ReactNode, useState, useEffect, useCallback, useRef, useMemo, createContext, useContext, ComponentType, Suspense, lazy } from 'react'
import { createPortal } from 'react-dom'
import {
  Maximize2, MoreVertical, Clock, Settings, Trash2, RefreshCw, MoveHorizontal, ChevronRight, ChevronDown, Info, Download, Link2, Bug,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CARD_TITLES, CARD_DESCRIPTIONS, DEMO_EXEMPT_CARDS } from './cardMetadata'
import { CARD_ICONS } from './cardIcons'
import { BaseModal } from '../../lib/modals'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { useCardCollapse } from '../../lib/cards'
import { useSnoozedCards } from '../../hooks/useSnoozedCards'
import { useDemoMode } from '../../hooks/useDemoMode'
import { isDemoMode as checkIsDemoMode } from '../../lib/demoMode'
// useLocalAgent removed — cards render immediately regardless of agent state
// isInClusterMode removed — cards render immediately without offline skeleton
import { useIsModeSwitching } from '../../lib/unified/demo'
import { CardDataReportContext, ForceLiveContext, type CardDataState } from './CardDataContext'
import { ChatMessage } from './CardChat'
import { CardSkeleton, type CardSkeletonProps } from '../../lib/cards/CardComponents'
import { isCardExportable } from '../../lib/widgets/widgetRegistry'
import { emitCardExpanded, emitCardRefreshed } from '../../lib/analytics'
// Lazy-load the widget export modal (~42 KB + code generator ~30 KB) — only when user exports
const WidgetExportModal = lazy(() =>
  import('../widgets/WidgetExportModal').then(m => ({ default: m.WidgetExportModal }))
)
// Lazy-load the feedback modal (~67 KB) — only loaded when user clicks bug report
const FeatureRequestModal = lazy(() =>
  import('../feedback/FeatureRequestModal').then(m => ({ default: m.FeatureRequestModal }))
)
import { LOADING_TIMEOUT_MS, SKELETON_DELAY_MS, INITIAL_RENDER_TIMEOUT_MS, TICK_INTERVAL_MS } from '../../lib/constants/network'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'


// Minimum duration to show spin animation (ensures at least one full rotation)
const MIN_SPIN_DURATION = 500

// Format relative time (e.g., "2m ago", "1h ago")
function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

interface PendingSwap {
  newType: string
  newTitle?: string
  reason: string
  swapAt: Date
}

// Card width options (in grid columns out of 12)
// labelKey/descKey reference cards.json cardWrapper.resize* keys
const WIDTH_OPTIONS = [
  { value: 3, labelKey: 'cardWrapper.resizeSmall' as const, descKey: 'cardWrapper.resizeSmallDesc' as const },
  { value: 4, labelKey: 'cardWrapper.resizeMedium' as const, descKey: 'cardWrapper.resizeMediumDesc' as const },
  { value: 6, labelKey: 'cardWrapper.resizeLarge' as const, descKey: 'cardWrapper.resizeLargeDesc' as const },
  { value: 8, labelKey: 'cardWrapper.resizeWide' as const, descKey: 'cardWrapper.resizeWideDesc' as const },
  { value: 12, labelKey: 'cardWrapper.resizeFull' as const, descKey: 'cardWrapper.resizeFullDesc' as const },
]

// Cards that need extra-large expanded modal (for maps, complex visualizations, etc.)
// These use 95vh height and 7xl width instead of the default 80vh/4xl
const LARGE_EXPANDED_CARDS = new Set([
  'cluster_comparison',
  'cluster_resource_tree',
  // AI-ML cards that need more space when expanded
  'kvcache_monitor',
  'pd_disaggregation',
  'llmd_ai_insights',
])

// Cards that should be nearly fullscreen when expanded (maps, large visualizations, games)
const FULLSCREEN_EXPANDED_CARDS = new Set([
  'cluster_locations',
  'mobile_browser', // Shows iPad view when expanded
  // AI-ML visualization cards benefit from full viewport
  'llmd_flow', 'epp_routing',
  // All arcade games need fullscreen to fill the entire screen
  'sudoku_game', 'container_tetris', 'node_invaders', 'kube_snake',
  'flappy_pod', 'kube_pong', 'kube_kong', 'game_2048', 'kube_man',
  'kube_galaga', 'kube_chess', 'checkers', 'pod_crosser', 'pod_brothers',
  'pod_pitfall', 'match_game', 'solitaire', 'kubedle', 'pod_sweeper',
  'kube_craft', 'kube_doom', 'kube_kart',
])

// Context to expose card expanded state to children
interface CardExpandedContextType {
  isExpanded: boolean
}
const CardExpandedContext = createContext<CardExpandedContextType>({ isExpanded: false })

/** Hook for child components to know if their parent card is expanded */
export function useCardExpanded() {
  return useContext(CardExpandedContext)
}

// Context to expose cardType to descendant shared components (CardControls,
// CardSearchInput, CardClusterFilter) so GA4 events can identify which card
// the user interacted with — no prop threading required.
const CardTypeContext = createContext<string>('')

/** Hook for shared UI components to read the cardType of their parent CardWrapper */
export function useCardType() {
  return useContext(CardTypeContext)
}

// Note: Lazy mounting and eager mount scheduling have been removed.
// Cards now render immediately to show cached data without delay.
// This trades some initial render performance for better UX with cached data.

/**
 * Hook for lazy mounting - only renders content when visible in viewport.
 *
 * IMPORTANT: Cards start visible (isVisible=true) to show cached data immediately.
 * IntersectionObserver is only used for off-screen cards that scroll into view later.
 * This prevents the "empty cards on page load" issue when cached data is available.
 */
function useLazyMount(_rootMargin = '100px') {
  // Start visible - show cached content immediately on page load.
  // This is intentional: we prioritize showing cached data over lazy loading performance.
  const [isVisible] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  // No lazy mounting - all cards render immediately.
  // The eager mount and IntersectionObserver logic has been removed because:
  // 1. It caused "empty cards" flash on page load even with cached data
  // 2. With only 4-8 cards visible at once, the performance impact is minimal
  // 3. Cached data should be shown instantly for good UX

  return { ref, isVisible }
}

/** Flash type for significant data changes */
export type CardFlashType = 'none' | 'info' | 'warning' | 'error'

interface CardWrapperProps {
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

// Re-export for backwards compatibility — data now lives in cardMetadata.ts and cardIcons.ts
export { CARD_TITLES, CARD_DESCRIPTIONS } from './cardMetadata'

/**
 * Info tooltip that renders via portal to escape overflow-hidden containers.
 * Updates position on scroll to stay attached to the trigger element.
 */
function InfoTooltip({ text }: { text: string }) {
  const { t } = useTranslation('cards')
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Update position based on trigger element's current bounding rect
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !isVisible) return

    const rect = triggerRef.current.getBoundingClientRect()
    const tooltipWidth = 280 // max-w-[280px]
    const tooltipHeight = tooltipRef.current?.offsetHeight || 80 // estimate

    // Position below the icon by default
    let top = rect.bottom + 8
    let left = rect.left - (tooltipWidth / 2) + (rect.width / 2)

    // Ensure tooltip stays within viewport
    if (left < 8) left = 8
    if (left + tooltipWidth > window.innerWidth - 8) {
      left = window.innerWidth - tooltipWidth - 8
    }

    // If tooltip would go below viewport, position above
    if (top + tooltipHeight > window.innerHeight - 8) {
      top = rect.top - tooltipHeight - 8
    }

    setPosition({ top, left })
  }, [isVisible])

  // Update position on scroll and resize
  useEffect(() => {
    if (!isVisible) return

    updatePosition()

    // Update on scroll (any scrollable ancestor)
    const handleScroll = () => updatePosition()
    const handleResize = () => updatePosition()

    window.addEventListener('scroll', handleScroll, true) // capture phase for nested scrolls
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [isVisible, updatePosition])

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!isVisible) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!triggerRef.current?.contains(target) && !tooltipRef.current?.contains(target)) {
        setIsVisible(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isVisible])

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setIsVisible(!isVisible)}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        title={t('cardWrapper.cardInfo')}
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {isVisible && position && createPortal(
        <div
          ref={tooltipRef}
          className="fixed z-[100] max-w-[280px] px-3 py-2 text-xs rounded-lg bg-background border border-border text-foreground shadow-xl animate-fade-in"
          style={{ top: position.top, left: position.left }}
          onMouseEnter={() => setIsVisible(true)}
          onMouseLeave={() => setIsVisible(false)}
        >
          {text}
        </div>,
        document.body
      )}
    </>
  )
}

export function CardWrapper({
  cardId,
  cardType,
  title: customTitle,
  icon: Icon,
  iconColor,
  lastSummary,
  pendingSwap,
  chatMessages: externalMessages,
  dragHandle,
  isRefreshing,
  lastUpdated,
  isDemoData,
  isLive,
  forceLive,
  isFailed,
  consecutiveFailures,
  cardWidth,
  isCollapsed: externalCollapsed,
  flashType = 'none',
  onCollapsedChange,
  onSwap,
  onSwapCancel,
  onConfigure,
  onRemove,
  onRefresh,
  onWidthChange,
  onChatMessage,
  onChatMessagesChange,
  skeletonType,
  skeletonRows,
  registerExpandTrigger,
  children,
}: CardWrapperProps) {
  const { t } = useTranslation(['cards', 'common'])
  const [isExpanded, setIsExpanded] = useState(false)
  const [showBugReport, setShowBugReport] = useState(false)

  // Register expand trigger for keyboard navigation
  useEffect(() => {
    registerExpandTrigger?.(() => setIsExpanded(true))
  }, [registerExpandTrigger])

  // Restore focus to card when expanded modal closes
  const prevExpandedRef = useRef(false)
  useEffect(() => {
    if (prevExpandedRef.current && !isExpanded && cardId) {
      const cardEl = document.querySelector(
        `[data-card-id="${cardId}"]`
      )?.closest('[tabindex="0"]') as HTMLElement | null
      cardEl?.focus()
    }
    prevExpandedRef.current = isExpanded
  }, [isExpanded, cardId])

  // Lazy mounting - only render children when card is visible in viewport
  const { ref: lazyRef, isVisible } = useLazyMount('200px')
  // Track animation key to re-trigger flash animation
  const [flashKey, setFlashKey] = useState(0)
  const prevFlashType = useRef(flashType)

  // Track visual spinning state separately to ensure minimum spin duration
  const [isVisuallySpinning, setIsVisuallySpinning] = useState(false)
  const spinStartRef = useRef<number | null>(null)

  // Child-reported data state (from card components via CardDataContext)
  // Declared early so it can be used in the refresh animation effect below
  const [childDataState, setChildDataState] = useState<CardDataState | null>(null)

  // Skeleton timeout: show skeleton for up to 5 seconds while waiting for card to report
  // After timeout, assume card doesn't use reporting and show content
  // IMPORTANT: Don't reset on childDataState change - this allows cached data to show immediately
  const [skeletonTimedOut, setSkeletonTimedOut] = useState(checkIsDemoMode)
  useEffect(() => {
    // Only run timeout once on mount - don't reset when childDataState changes
    // Cards with cached data will report hasData: true quickly, hiding skeleton
    const timer = setTimeout(() => setSkeletonTimedOut(true), LOADING_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, []) // Empty deps - only run on mount

  // Skeleton delay: don't show skeleton immediately, wait a brief moment
  // This prevents flicker when cache loads quickly from IndexedDB
  const [skeletonDelayPassed, setSkeletonDelayPassed] = useState(checkIsDemoMode)
  useEffect(() => {
    const timer = setTimeout(() => setSkeletonDelayPassed(true), SKELETON_DELAY_MS)
    return () => clearTimeout(timer)
  }, []) // Empty deps - only run on mount

  // Quick initial render timeout for cards that don't report state (static/demo cards)
  // If a card hasn't reported state within 150ms, assume it rendered content immediately
  // This prevents blank cards while still giving reporting cards time to report
  const [initialRenderTimedOut, setInitialRenderTimedOut] = useState(checkIsDemoMode)
  useEffect(() => {
    const timer = setTimeout(() => setInitialRenderTimedOut(true), INITIAL_RENDER_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, []) // Empty deps - only run on mount

  // Handle minimum spin duration for refresh button
  // Include both prop and context-reported refresh state
  const contextIsRefreshing = childDataState?.isRefreshing || false
  useEffect(() => {
    if (isRefreshing || contextIsRefreshing) {
      setIsVisuallySpinning(true)
      spinStartRef.current = Date.now()
    } else if (spinStartRef.current !== null) {
      const elapsed = Date.now() - spinStartRef.current
      const remaining = Math.max(0, MIN_SPIN_DURATION - elapsed)

      if (remaining > 0) {
        const timeout = setTimeout(() => {
          setIsVisuallySpinning(false)
          spinStartRef.current = null
        }, remaining)
        return () => clearTimeout(timeout)
      } else {
        setIsVisuallySpinning(false)
        spinStartRef.current = null
      }
    }
  }, [isRefreshing, contextIsRefreshing])

  // Re-trigger animation when flashType changes to a non-none value
  useEffect(() => {
    if (flashType !== 'none' && flashType !== prevFlashType.current) {
      setFlashKey(k => k + 1)
    }
    prevFlashType.current = flashType
  }, [flashType])

  // Get flash animation class based on type
  const getFlashClass = () => {
    switch (flashType) {
      case 'info': return 'animate-card-flash'
      case 'warning': return 'animate-card-flash-warning'
      case 'error': return 'animate-card-flash-error'
      default: return ''
    }
  }

  // Use the shared collapse hook with localStorage persistence
  // cardId is required for persistence; fall back to cardType if not provided
  const collapseKey = cardId || `${cardType}-default`
  const { isCollapsed: hookCollapsed, setCollapsed: hookSetCollapsed } = useCardCollapse(collapseKey)

  // Track whether initial data load has completed AND content has been visible
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(checkIsDemoMode)
  const [collapseDelayPassed, setCollapseDelayPassed] = useState(checkIsDemoMode)

  // Allow external control to override hook state
  // IMPORTANT: Don't collapse until initial data load is complete AND a brief delay has passed
  // This prevents the jarring sequence of: skeleton → collapse → show data
  // Cards stay expanded showing content briefly, then respect collapsed state
  const savedCollapsedState = externalCollapsed ?? hookCollapsed
  const isCollapsed = (hasCompletedInitialLoad && collapseDelayPassed) ? savedCollapsedState : false
  const setCollapsed = useCallback((collapsed: boolean) => {
    if (onCollapsedChange) {
      onCollapsedChange(collapsed)
    }
    // Always update the hook state for persistence
    hookSetCollapsed(collapsed)
  }, [onCollapsedChange, hookSetCollapsed])

  const [showSummary, setShowSummary] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showWidgetExport, setShowWidgetExport] = useState(false)
  const [showResizeMenu, setShowResizeMenu] = useState(false)
  const [resizeMenuOnLeft, setResizeMenuOnLeft] = useState(false)
  const [_timeRemaining, setTimeRemaining] = useState<number | null>(null)
  // Chat state reserved for future use
  // const [isChatOpen, setIsChatOpen] = useState(false)
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([])
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null)
  const { snoozeSwap } = useSnoozedCards()
  const { isDemoMode: globalDemoMode } = useDemoMode()
  const isModeSwitching = useIsModeSwitching()
  const isDemoExempt = DEMO_EXEMPT_CARDS.has(cardType)
  const isDemoMode = globalDemoMode && !isDemoExempt && !forceLive

  // Agent offline detection removed — cards render immediately regardless of agent state
  const menuContainerRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  // Report callback for CardDataContext (childDataState is declared earlier for refresh animation)
  const reportCallback = useCallback((state: CardDataState) => {
    setChildDataState(state)
  }, [])
  const reportCtx = useMemo(() => ({ report: reportCallback }), [reportCallback])

  // Merge child-reported state with props — child reports take priority when present
  const effectiveIsFailed = isFailed || childDataState?.isFailed || false
  const effectiveConsecutiveFailures = consecutiveFailures || childDataState?.consecutiveFailures || 0
  // Show loading when:
  // - Card explicitly reports isLoading: true, OR
  // - Card hasn't reported yet AND quick timeout hasn't passed (brief skeleton for reporting cards)
  // Static/demo cards that never report will stop showing as loading after 150ms
  // NOTE: isRefreshing is NOT included — background refreshes should be invisible to avoid flicker
  const effectiveIsLoading = childDataState?.isLoading || (childDataState === null && !initialRenderTimedOut && !skeletonTimedOut)
  // hasData logic:
  // - If card explicitly reports hasData, use it
  // - If card hasn't reported AND quick timeout passed, assume has data (static/demo card)
  // - If card hasn't reported AND skeleton timed out, assume has data (show content)
  // - If card reports isLoading:true but not hasData, assume no data (show skeleton)
  // - Otherwise default to true (show content)
  const effectiveHasData = childDataState?.hasData ?? (
    childDataState === null
      ? (initialRenderTimedOut || skeletonTimedOut)  // After quick timeout, assume static card has content
      : (childDataState?.isLoading ? false : true)
  )

  // Merge isDemoData from child-reported state with prop.
  // When forceLive is true, ignore child-reported isDemoData — the child checks global
  // demo mode independently but we know the data is real (in-cluster with OAuth).
  const effectiveIsDemoData = forceLive ? false : (isDemoData || childDataState?.isDemoData || false)

  // Child can explicitly opt-out of demo indicator by reporting isDemoData: false
  // This is used by stack-dependent cards that use stack data even in global demo mode
  const childExplicitlyNotDemo = childDataState?.isDemoData === false

  // Show demo indicator if:
  // 1. Child reports demo data (isDemoData: true via prop or report), OR
  // 2. Global demo mode is on AND child hasn't explicitly opted out
  // Always suppress during loading phase — showing a demo badge on a skeleton is misleading.
  // Demo-only cards resolve instantly so the badge appears within ms of content loading.
  const showDemoIndicator = !effectiveIsLoading && (effectiveIsDemoData || (isDemoMode && !childExplicitlyNotDemo))

  // Determine if we should show skeleton: loading with no cached data
  // OR when demo mode is OFF and agent is offline (prevents showing stale demo data)
  // OR when mode is switching (smooth transition between demo and live)
  // Force skeleton immediately when offline + demo OFF, without waiting for childDataState
  // This fixes the race condition where demo data briefly shows before skeleton
  // Cards with effectiveIsDemoData=true (explicitly showing demo) or demo-exempt cards are excluded
  const forceSkeletonForOffline = false // Cards render immediately — handle their own empty/offline state
  const forceSkeletonForModeSwitching = isModeSwitching && !isDemoExempt

  // Default to 'list' skeleton type if not specified, enabling automatic skeleton display
  const effectiveSkeletonType = skeletonType || 'list'
  // Cards render immediately — skeleton only used during demo↔live mode switching
  const wantsToShowSkeleton = forceSkeletonForModeSwitching
  const shouldShowSkeleton = (wantsToShowSkeleton && skeletonDelayPassed) || forceSkeletonForModeSwitching

  // Mark initial load as complete when data is ready or various timeouts pass
  // This allows the saved collapsed state to take effect only after content is ready
  // Conditions (any triggers completion):
  // - effectiveHasData: card reported it has data
  // - initialRenderTimedOut: 150ms passed, assume static card has content
  // - skeletonTimedOut: 5s passed, fallback for slow loading cards
  // - effectiveIsDemoData/isDemoMode: demo cards always have content immediately
  useEffect(() => {
    if (!hasCompletedInitialLoad && (effectiveHasData || initialRenderTimedOut || skeletonTimedOut || effectiveIsDemoData || isDemoMode)) {
      setHasCompletedInitialLoad(true)
    }
  }, [hasCompletedInitialLoad, effectiveHasData, initialRenderTimedOut, skeletonTimedOut, effectiveIsDemoData, isDemoMode])

  // Add a small delay before allowing collapse to ensure content is visible
  // This prevents immediate collapse for demo cards and ensures smooth UX
  useEffect(() => {
    if (hasCompletedInitialLoad && !collapseDelayPassed) {
      const timer = setTimeout(() => {
        setCollapseDelayPassed(true)
      }, 300) // 300ms delay to show content before collapsing
      return () => clearTimeout(timer)
    }
  }, [hasCompletedInitialLoad, collapseDelayPassed])

  // Use external messages if provided, otherwise use local state
  const messages = externalMessages ?? localMessages

  const title = t(`titles.${cardType}`, CARD_TITLES[cardType] || '') || customTitle || cardType
  const description = t(`descriptions.${cardType}`, CARD_DESCRIPTIONS[cardType] || '')
  const swapType = pendingSwap?.newType || ''
  const newTitle = pendingSwap?.newTitle || t(`titles.${swapType}`, CARD_TITLES[swapType] || '') || swapType

  // Get icon from prop or registry
  const cardIconConfig = CARD_ICONS[cardType]
  const ResolvedIcon = Icon || cardIconConfig?.icon
  const resolvedIconColor = iconColor || cardIconConfig?.color || 'text-foreground'

  // Countdown timer for pending swap
  useEffect(() => {
    if (!pendingSwap) {
      setTimeRemaining(null)
      return
    }

    const updateTime = () => {
      const now = Date.now()
      const swapTime = pendingSwap.swapAt.getTime()
      const remaining = Math.max(0, Math.floor((swapTime - now) / 1000))
      setTimeRemaining(remaining)

      if (remaining === 0 && onSwap) {
        onSwap(pendingSwap.newType)
      }
    }

    updateTime()
    const interval = setInterval(updateTime, TICK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [pendingSwap, onSwap])

  const handleSnooze = useCallback((durationMs: number = 3600000) => {
    if (!pendingSwap || !cardId) return

    snoozeSwap({
      originalCardId: cardId,
      originalCardType: cardType,
      originalCardTitle: title,
      newCardType: pendingSwap.newType,
      newCardTitle: newTitle || pendingSwap.newType,
      reason: pendingSwap.reason,
    }, durationMs)

    onSwapCancel?.()
  }, [pendingSwap, cardId, cardType, title, newTitle, snoozeSwap, onSwapCancel])

  const handleSwapNow = useCallback(() => {
    if (pendingSwap && onSwap) {
      onSwap(pendingSwap.newType)
    }
  }, [pendingSwap, onSwap])

  // Close resize submenu when main menu closes
  useEffect(() => {
    if (!showMenu) {
      setShowResizeMenu(false)
      setMenuPosition(null)
    }
  }, [showMenu])

  // Keep menu anchored to button on scroll/resize
  useEffect(() => {
    if (!showMenu || !menuButtonRef.current) return

    const updatePosition = () => {
      if (menuButtonRef.current) {
        const rect = menuButtonRef.current.getBoundingClientRect()
        setMenuPosition({
          top: rect.bottom + 4,
          right: window.innerWidth - rect.right,
        })
      }
    }

    // Find the scrollable parent (the main content area)
    let scrollParent: HTMLElement | Window = window
    let el = menuButtonRef.current.parentElement
    while (el) {
      const overflow = window.getComputedStyle(el).overflowY
      if (overflow === 'auto' || overflow === 'scroll') {
        scrollParent = el
        break
      }
      el = el.parentElement
    }

    scrollParent.addEventListener('scroll', updatePosition, { passive: true })
    window.addEventListener('resize', updatePosition, { passive: true })
    return () => {
      scrollParent.removeEventListener('scroll', updatePosition)
      window.removeEventListener('resize', updatePosition)
    }
  }, [showMenu])

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Check if click is outside the menu button and menu content
      if (!target.closest('[data-tour="card-menu"]') && !target.closest('.fixed.glass')) {
        setShowMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  // Calculate if resize submenu should be on the left side
  useEffect(() => {
    if (showResizeMenu && menuContainerRef.current) {
      const rect = menuContainerRef.current.getBoundingClientRect()
      const submenuWidth = 144 // w-36 = 9rem = 144px
      const margin = 20
      const shouldBeOnLeft = rect.right + submenuWidth + margin > window.innerWidth
      setResizeMenuOnLeft(shouldBeOnLeft)
    }
  }, [showResizeMenu])

  // Silence unused variable warnings for future chat implementation
  void messages
  void onChatMessage
  void onChatMessagesChange
  void title
  void setLocalMessages

  return (
    <CardTypeContext.Provider value={cardType}>
    <CardExpandedContext.Provider value={{ isExpanded }}>
      <ForceLiveContext.Provider value={!!forceLive}>
      <CardDataReportContext.Provider value={reportCtx}>
        <>
          {/* Main card */}
          <div
            ref={lazyRef}
            key={flashKey}
            data-tour="card"
            data-card-type={cardType}
            data-card-id={cardId}
            data-loading={shouldShowSkeleton ? 'true' : 'false'}
            data-effective-loading={effectiveIsLoading ? 'true' : 'false'}
            aria-label={title}
            aria-busy={effectiveIsLoading}
            className={cn(
              'glass rounded-xl overflow-hidden card-hover',
              'flex flex-col transition-all duration-200',
              isCollapsed ? 'h-auto' : 'h-full',
              showDemoIndicator && '!border-2 !border-yellow-500/50',
              // Only pulse during initial skeleton display, not background refreshes (prevents flicker)
              shouldShowSkeleton && !forceSkeletonForOffline && 'animate-card-refresh-pulse',
              getFlashClass()
            )}
            onMouseEnter={() => setShowSummary(true)}
            onMouseLeave={() => setShowSummary(false)}
          >
            {/* Header */}
            <div data-tour="card-header" className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                {dragHandle}
                {ResolvedIcon && <ResolvedIcon className={cn('w-4 h-4', resolvedIconColor)} />}
                <h3 className="text-sm font-medium text-foreground">{title}</h3>
                <InfoTooltip text={description || t('messages.descriptionComingSoon', { title })} />
                {/* Demo data indicator - shows if card uses demo data (respects child opt-out) */}
                {showDemoIndicator && (
                  <span
                    data-testid="demo-badge"
                    role="status"
                    aria-live="polite"
                    className="text-2xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400"
                    title={effectiveIsDemoData ? t('cardWrapper.demoBadgeTitle') : t('cardWrapper.demoModeTitle')}
                  >
                    {t('cardWrapper.demo')}
                  </span>
                )}
                {/* Live data indicator - for time-series/trend cards with real data */}
                {isLive && !showDemoIndicator && (
                  <span
                    role="status"
                    aria-live="polite"
                    className="text-2xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400"
                    title={t('cardWrapper.liveBadgeTitle')}
                  >
                    {t('cardWrapper.live')}
                  </span>
                )}
                {/* Failure indicator */}
                {effectiveIsFailed && (
                  <span
                    role="alert"
                    aria-live="assertive"
                    className="text-2xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 flex items-center gap-1"
                    title={t('cardWrapper.refreshFailedCount', { count: effectiveConsecutiveFailures })}
                  >
                    {t('cardWrapper.refreshFailed')}
                  </span>
                )}
                {/* Refresh indicator - only shows when no refresh button is present (button handles its own spin) */}
                {!onRefresh && (isVisuallySpinning || effectiveIsLoading || forceSkeletonForOffline) && !effectiveIsFailed && (
                  <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" aria-hidden="true" />
                )}
                {/* Last updated indicator */}
                {!isVisuallySpinning && !effectiveIsLoading && !effectiveIsFailed && lastUpdated && (
                  <span className="text-2xs text-muted-foreground" title={lastUpdated.toLocaleString()}>
                    {formatTimeAgo(lastUpdated)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Collapse/expand button */}
                <button
                  onClick={() => setCollapsed(!isCollapsed)}
                  className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={isCollapsed ? t('cardWrapper.expandCard') : t('cardWrapper.collapseCard')}
                  aria-expanded={!isCollapsed}
                  title={isCollapsed ? t('cardWrapper.expandCard') : t('cardWrapper.collapseCard')}
                >
                  {isCollapsed ? <ChevronRight className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
                </button>
                {/* Manual refresh button */}
                {onRefresh && (
                  <button
                    onClick={() => { onRefresh(); emitCardRefreshed(cardType) }}
                    disabled={isRefreshing || isVisuallySpinning || effectiveIsLoading || forceSkeletonForOffline}
                    className={cn(
                      'p-1.5 rounded-lg transition-colors',
                      isVisuallySpinning || effectiveIsLoading || forceSkeletonForOffline
                        ? 'text-blue-400 cursor-not-allowed'
                        : effectiveIsFailed
                          ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                    )}
                    aria-label={forceSkeletonForOffline ? t('cardWrapper.waitingForAgent') : effectiveIsFailed ? t('cardWrapper.refreshFailedRetry', { count: effectiveConsecutiveFailures }) : t('cardWrapper.refreshData')}
                    title={forceSkeletonForOffline ? t('cardWrapper.waitingForAgent') : effectiveIsFailed ? t('cardWrapper.refreshFailedRetry', { count: effectiveConsecutiveFailures }) : t('cardWrapper.refreshData')}
                  >
                    <RefreshCw className={cn('w-4 h-4', (isVisuallySpinning || effectiveIsLoading || forceSkeletonForOffline) && 'animate-spin')} aria-hidden="true" />
                  </button>
                )}
                {/* Chat button - feature not yet implemented
            <button
              data-tour="card-chat"
              className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
              title={t('common:buttons.askAI')}
            >
              <MessageCircle className="w-4 h-4" />
            </button>
            */}
                <button
                  onClick={() => { emitCardExpanded(cardType); setIsExpanded(true) }}
                  className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t('cardWrapper.expandFullScreen')}
                  title={t('cardWrapper.expandFullScreen')}
                >
                  <Maximize2 className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  onClick={() => setShowBugReport(true)}
                  className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t('cardWrapper.reportIssue')}
                  title={t('cardWrapper.reportIssue')}
                >
                  <Bug className="w-4 h-4" aria-hidden="true" />
                </button>
                <div className="relative" data-tour="card-menu">
                  <button
                    ref={menuButtonRef}
                    onClick={() => {
                      if (!showMenu && menuButtonRef.current) {
                        const rect = menuButtonRef.current.getBoundingClientRect()
                        setMenuPosition({
                          top: rect.bottom + 4,
                          right: window.innerWidth - rect.right,
                        })
                      }
                      setShowMenu(!showMenu)
                    }}
                    className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={t('cardWrapper.cardMenuTooltip')}
                    aria-expanded={showMenu}
                    aria-haspopup="menu"
                    title={t('cardWrapper.cardMenuTooltip')}
                  >
                    <MoreVertical className="w-4 h-4" aria-hidden="true" />
                  </button>
                  {showMenu && menuPosition && createPortal(
                    <div
                      className="fixed w-48 glass rounded-lg py-1 z-50 shadow-xl !bg-[rgba(10,15,25,0.98)]"
                      role="menu"
                      aria-label={t('cardWrapper.cardMenuTooltip')}
                      style={{ top: menuPosition.top, right: menuPosition.right }}
                    >
                      <button
                        onClick={() => {
                          setShowMenu(false)
                          onConfigure?.()
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center gap-2"
                        role="menuitem"
                        title={t('cardWrapper.configureTooltip')}
                      >
                        <Settings className="w-4 h-4" aria-hidden="true" />
                        {t('common:actions.configure')}
                      </button>
                      <button
                        onClick={() => {
                          setShowMenu(false)
                          const url = `${window.location.origin}${window.location.pathname}?card=${cardType}`
                          navigator.clipboard.writeText(url)
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center gap-2"
                        role="menuitem"
                        title={t('cardWrapper.copyLinkTooltip')}
                      >
                        <Link2 className="w-4 h-4" aria-hidden="true" />
                        {t('cardWrapper.copyLink')}
                      </button>
                      {/* Resize submenu */}
                      {onWidthChange && (
                        <div className="relative" ref={menuContainerRef}>
                          <button
                            onClick={() => setShowResizeMenu(!showResizeMenu)}
                            className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center justify-between"
                            role="menuitem"
                            aria-haspopup="menu"
                            aria-expanded={showResizeMenu}
                            title={t('cardWrapper.resizeTooltip')}
                          >
                            <span className="flex items-center gap-2">
                              <MoveHorizontal className="w-4 h-4" aria-hidden="true" />
                              {t('cardWrapper.resize')}
                            </span>
                            <ChevronRight className={cn('w-4 h-4 transition-transform', showResizeMenu && 'rotate-90')} aria-hidden="true" />
                          </button>
                          {showResizeMenu && (
                            <div
                              className={cn(
                                'absolute top-0 w-36 glass rounded-lg py-1 z-20',
                                resizeMenuOnLeft ? 'right-full mr-1' : 'left-full ml-1'
                              )}
                              role="menu"
                            >
                              {WIDTH_OPTIONS.map((option) => (
                                <button
                                  key={option.value}
                                  onClick={() => {
                                    onWidthChange(option.value)
                                    setShowResizeMenu(false)
                                    setShowMenu(false)
                                  }}
                                  className={cn(
                                    'w-full px-3 py-2 text-left text-sm flex items-center justify-between',
                                    cardWidth === option.value
                                      ? 'text-purple-400 bg-purple-500/10'
                                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                                  )}
                                  role="menuitem"
                                >
                                  <span>{t(option.labelKey)}</span>
                                  <span className="text-xs opacity-60">{t(option.descKey)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {isCardExportable(cardType) && (
                        <button
                          onClick={() => {
                            setShowMenu(false)
                            setShowWidgetExport(true)
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center gap-2"
                          role="menuitem"
                          title={t('cardWrapper.exportWidgetTooltip')}
                        >
                          <Download className="w-4 h-4" aria-hidden="true" />
                          {t('cardWrapper.exportWidget')}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setShowMenu(false)
                          onRemove?.()
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                        role="menuitem"
                        title={t('cardWrapper.removeTooltip')}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                        {t('common:actions.remove')}
                      </button>
                    </div>,
                    document.body
                  )}
                </div>
              </div>
            </div>

            {/* Content - hidden when collapsed, lazy loaded when visible or expanded */}
            {!isCollapsed && (
              <div className="flex-1 p-4 overflow-auto scroll-enhanced min-h-0 flex flex-col">
                {(isVisible || isExpanded) ? (
                  <>
                    {/* Show skeleton overlay when loading with no cached data */}
                    {shouldShowSkeleton && (
                      <div data-card-skeleton="true">
                        <CardSkeleton type={effectiveSkeletonType} rows={skeletonRows || 3} showHeader />
                      </div>
                    )}
                    {/* ALWAYS render children so they can report their data state via useCardLoadingState.
                    Hide visually when skeleton is showing, but keep mounted so useLayoutEffect runs.
                    This prevents the deadlock where CardWrapper waits for hasData but children never mount.
                    Suspense catches lazy() chunk loading so it doesn't bubble up to Layout and blank the whole page. */}
                    <div className={shouldShowSkeleton ? 'hidden' : 'contents'}>
                      <DynamicCardErrorBoundary cardId={cardId || cardType}>
                        <Suspense fallback={<CardSkeleton type={effectiveSkeletonType} rows={skeletonRows || 3} showHeader={false} />}>
                          {children}
                        </Suspense>
                      </DynamicCardErrorBoundary>
                    </div>
                  </>
                ) : (
                  // Show skeleton during lazy mount (before IntersectionObserver fires)
                  // This provides visual continuity instead of a tiny pulse loader
                  <CardSkeleton type={effectiveSkeletonType} rows={skeletonRows || 3} showHeader={false} />
                )}
              </div>
            )}

            {/* Pending swap notification - hidden when collapsed */}
            {!isCollapsed && pendingSwap && (
              <div className="px-4 py-3 bg-purple-500/10 border-t border-purple-500/20">
                <div className="flex items-center gap-2 text-sm">
                  <span title={t('cardWrapper.swapPending')}><Clock className="w-4 h-4 text-purple-400 animate-pulse" /></span>
                  <span className="text-purple-300">
                    {t('common:labels.swappingTo', { cardName: newTitle })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{pendingSwap.reason}</p>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSnooze(3600000)}
                    className="rounded"
                    title={t('cardWrapper.snoozeTooltip')}
                  >
                    {t('common:buttons.snoozeHour')}
                  </Button>
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={handleSwapNow}
                    className="rounded"
                    title={t('cardWrapper.swapNowTooltip')}
                  >
                    {t('common:buttons.swapNow')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSwapCancel?.()}
                    className="rounded"
                    title={t('cardWrapper.keepThisTooltip')}
                  >
                    {t('common:buttons.keepThis')}
                  </Button>
                </div>
              </div>
            )}

            {/* Hover summary */}
            {showSummary && lastSummary && (
              <div className="absolute bottom-full left-0 right-0 mb-2 mx-4 p-3 glass rounded-lg text-sm animate-fade-in-up">
                <p className="text-xs text-muted-foreground mb-1">{t('common:labels.sinceFocus')}</p>
                <p className="text-foreground">{lastSummary}</p>
              </div>
            )}
          </div>

          {/* Expanded modal */}
          <BaseModal
            isOpen={isExpanded}
            onClose={() => setIsExpanded(false)}
            size={FULLSCREEN_EXPANDED_CARDS.has(cardType) ? 'full' : LARGE_EXPANDED_CARDS.has(cardType) ? 'xl' : 'lg'}
          >
            <BaseModal.Header
              title={title}
              icon={Maximize2}
              onClose={() => setIsExpanded(false)}
              showBack={false}
            />
            <BaseModal.Content className={cn(
              'overflow-auto scroll-enhanced flex flex-col',
              FULLSCREEN_EXPANDED_CARDS.has(cardType)
                ? 'h-[calc(98vh-80px)]'
                : LARGE_EXPANDED_CARDS.has(cardType)
                  ? 'h-[calc(95vh-80px)]'
                  : 'max-h-[calc(80vh-80px)]'
            )}>
              {/* Wrapper ensures children fill available space in expanded mode */}
              <div className="flex-1 min-h-0 flex flex-col">
                <DynamicCardErrorBoundary cardId={cardId || cardType}>
                  {children}
                </DynamicCardErrorBoundary>
              </div>
            </BaseModal.Content>
          </BaseModal>

          {/* Widget Export Modal */}
          {showWidgetExport && (
            <Suspense fallback={null}>
              <WidgetExportModal
                isOpen={showWidgetExport}
                onClose={() => setShowWidgetExport(false)}
                cardType={cardType}
              />
            </Suspense>
          )}

          {/* Per-card bug/feature report modal */}
          {showBugReport && (
            <Suspense fallback={null}>
              <FeatureRequestModal
                isOpen={showBugReport}
                onClose={() => setShowBugReport(false)}
                initialTab="submit"
                initialContext={{
                  cardType,
                  cardTitle: title || CARD_TITLES[cardType] || cardType,
                }}
              />
            </Suspense>
          )}
        </>
      </CardDataReportContext.Provider>
      </ForceLiveContext.Provider>
    </CardExpandedContext.Provider>
    </CardTypeContext.Provider>
  )
}
