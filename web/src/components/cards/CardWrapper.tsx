import { ReactNode, useState, useEffect, useCallback, useRef, useMemo, createContext, use, ComponentType, Suspense, lazy } from 'react'
import { createPortal } from 'react-dom'
import {
  Maximize2, MoreVertical, Clock, Settings, Trash2, RefreshCw, MoveHorizontal, ChevronRight, ChevronDown, Info, Download, Link2, Bug, AlertTriangle, Sparkles, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CARD_TITLES, CARD_DESCRIPTIONS, DEMO_EXEMPT_CARDS } from './cardMetadata'
import { CARD_ICONS } from './cardIcons'
import { BaseModal } from '../../lib/modals'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { useCardCollapse } from '../../lib/cards/cardHooks'
import { useSnoozedCards } from '../../hooks/useSnoozedCards'
import { useDemoMode } from '../../hooks/useDemoMode'
import { isDemoMode as checkIsDemoMode } from '../../lib/demoMode'
// useLocalAgent removed — cards render immediately regardless of agent state
// isInClusterMode removed — cards render immediately without offline skeleton
import { useIsModeSwitching } from '../../lib/unified/demo'
import { CardDataReportContext, ForceLiveContext, type CardDataState } from './CardDataContext'
import { useDashboardContextOptional } from '../../hooks/useDashboardContext'
import { ChatMessage } from './CardChat'
import { CardSkeleton, type CardSkeletonProps } from '../../lib/cards/CardComponents'
import { isCardExportable } from '../../lib/widgets/widgetRegistry'
import { emitCardExpanded, emitCardRefreshed } from '../../lib/analytics'
import { useMissions } from '../../hooks/useMissions'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { CARD_INSTALL_MAP } from '../../lib/cards/cardInstallMap'
import { loadMissionPrompt } from '../cards/multi-tenancy/missionLoader'
import { ClusterSelectionDialog } from '../missions/ClusterSelectionDialog'
// Lazy-load the widget export modal (~42 KB + code generator ~30 KB) — only when user exports
const WidgetExportModal = lazy(() =>
  import('../widgets/WidgetExportModal').then(m => ({ default: m.WidgetExportModal }))
)
// Lazy-load the feedback modal (~67 KB) — only loaded when user clicks bug report
const FeatureRequestModal = lazy(() =>
  import('../feedback/FeatureRequestModal').then(m => ({ default: m.FeatureRequestModal }))
)
import { LOADING_TIMEOUT_MS, SKELETON_DELAY_MS, INITIAL_RENDER_TIMEOUT_MS, TICK_INTERVAL_MS, CARD_LOADING_TIMEOUT_MS, MIN_SKELETON_DISPLAY_MS } from '../../lib/constants/network'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { copyToClipboard } from '../../lib/clipboard'


// Minimum duration to show spin animation (ensures at least one full rotation)
const MIN_SPIN_DURATION = 500

/** One hour in milliseconds — default snooze duration for card swaps */
const ONE_HOUR_MS = 60 * 60 * 1000

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
  'kube_doom', 'kube_kart',
])

/** Dimensions of the card's content container (updated via ResizeObserver) */
export interface CardContainerSize {
  width: number
  height: number
}

// Context to expose card expanded state to children
interface CardExpandedContextType {
  isExpanded: boolean
  /** Live dimensions of the expanded modal content container (0x0 when collapsed) */
  containerSize: CardContainerSize
}
const CardExpandedContext = createContext<CardExpandedContextType>({
  isExpanded: false,
  containerSize: { width: 0, height: 0 } })

/** Hook for child components to know if their parent card is expanded and get container size */
export function useCardExpanded() {
  return use(CardExpandedContext)
}

// Context to expose cardType to descendant shared components (CardControls,
// CardSearchInput, CardClusterFilter) so GA4 events can identify which card
// the user interacted with — no prop threading required.
const CardTypeContext = createContext<string>('')

/** Hook for shared UI components to read the cardType of their parent CardWrapper */
export function useCardType() {
  return use(CardTypeContext)
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
  const tooltipId = `info-tooltip-${Math.random().toString(36).slice(2, 9)}`

  // Update position based on trigger element's current bounding rect
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !isVisible) return

    const rect = triggerRef.current.getBoundingClientRect()
    const tooltipWidth = 320 // max-w-xs (320px)
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

  // Close tooltip when clicking outside or pressing Escape
  useEffect(() => {
    if (!isVisible) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!triggerRef.current?.contains(target) && !tooltipRef.current?.contains(target)) {
        setIsVisible(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsVisible(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isVisible])

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setIsVisible(!isVisible)}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        className="p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        aria-label={t('cardWrapper.cardInfo')}
        aria-describedby={isVisible ? tooltipId : undefined}
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {isVisible && position && createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className="fixed z-dropdown max-w-xs px-3 py-2.5 text-xs leading-relaxed rounded-lg bg-background border border-border text-foreground shadow-xl animate-fade-in"
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
  children }: CardWrapperProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { startMission, openSidebar, setFullScreen } = useMissions()
  const { status: agentStatus } = useLocalAgent()
  const isAgentConnected = agentStatus === 'connected'
  const [isExpanded, setIsExpanded] = useState(false)
  /** Live container dimensions for expanded modal — games use this to scale their boards */
  const [containerSize, setContainerSize] = useState<CardContainerSize>({ width: 0, height: 0 })
  const expandedContentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isExpanded) {
      setContainerSize({ width: 0, height: 0 })
      return
    }
    const el = expandedContentRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width)
        const h = Math.round(entry.contentRect.height)
        // Only update when dimensions actually change to avoid unnecessary rerenders
        setContainerSize(prev => (prev.width === w && prev.height === h) ? prev : { width: w, height: h })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [isExpanded])
  const [showBugReport, setShowBugReport] = useState(false)
  const [showInstallClusterSelect, setShowInstallClusterSelect] = useState(false)
  const [showInstallGuide, setShowInstallGuide] = useState<{ mission: { mission?: { title?: string; description?: string; steps?: { title?: string; description?: string }[] } } } | null>(null)
  const installInfo = CARD_INSTALL_MAP[cardType]

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

  // Minimum skeleton display duration guard (#5206): once the skeleton starts showing,
  // keep it visible for at least MIN_SKELETON_DISPLAY_MS. This prevents the flicker
  // where childDataState starts null (skeleton), then child reports state via
  // useLayoutEffect causing a re-render that briefly shows content before the
  // skeleton timeout completes (skeleton → content → skeleton → content).
  const [minSkeletonElapsed, setMinSkeletonElapsed] = useState(checkIsDemoMode)
  useEffect(() => {
    const timer = setTimeout(() => setMinSkeletonElapsed(true), MIN_SKELETON_DISPLAY_MS)
    return () => clearTimeout(timer)
  }, []) // Empty deps - only run on mount

  // Stuck loading guard: if a card reports isLoading:true but never updates,
  // force it to exit loading state after CARD_LOADING_TIMEOUT_MS (30 seconds).
  // This prevents cards from being permanently stuck in loading state due to
  // interrupted renders, hook cancellation, or errors during data fetching.
  const [cardLoadingTimedOut, setCardLoadingTimedOut] = useState(false)
  useEffect(() => {
    // Only start the timer when a card explicitly reports isLoading: true
    if (childDataState?.isLoading) {
      setCardLoadingTimedOut(false)
      const timer = setTimeout(() => setCardLoadingTimedOut(true), CARD_LOADING_TIMEOUT_MS)
      return () => clearTimeout(timer)
    }
    // Card is no longer loading — reset the flag
    setCardLoadingTimedOut(false)
  }, [childDataState?.isLoading])

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

  // Check if this card has a previously-saved collapse state in localStorage.
  // When the user explicitly collapsed a card, we should respect that immediately
  // on page navigation (no delay) to prevent a flash of expanded state (#4895).
  const hasSavedCollapseState = useMemo(() => {
    try {
      const stored = localStorage.getItem('kubestellar-collapsed-cards')
      if (!stored) return false
      const ids: string[] = JSON.parse(stored)
      return ids.includes(collapseKey)
    } catch {
      return false
    }
  }, [collapseKey])

  // Track whether initial data load has completed AND content has been visible
  // Skip the delay entirely if the card has a saved collapsed state — the user
  // explicitly collapsed it, so we should respect that immediately across navigations.
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(checkIsDemoMode || hasSavedCollapseState)
  const [collapseDelayPassed, setCollapseDelayPassed] = useState(checkIsDemoMode || hasSavedCollapseState)

  // Allow external control to override hook state
  // IMPORTANT: Don't collapse until initial data load is complete AND a brief delay has passed
  // This prevents the jarring sequence of: skeleton → collapse → show data
  // Cards stay expanded showing content briefly, then respect collapsed state
  // Exception: if the card has a saved collapse state, apply it immediately (#4895)
  const savedCollapsedState = externalCollapsed ?? hookCollapsed
  const isCollapsed = (hasCompletedInitialLoad && collapseDelayPassed) ? savedCollapsedState : false
  const setCollapsed = (collapsed: boolean) => {
    if (onCollapsedChange) {
      onCollapsedChange(collapsed)
    }
    // Always update the hook state for persistence
    hookSetCollapsed(collapsed)
  }

  const [showSummary, setShowSummary] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showWidgetExport, setShowWidgetExport] = useState(false)
  const studioContext = useDashboardContextOptional()
  const [showResizeMenu, setShowResizeMenu] = useState(false)
  const [resizeMenuOnLeft, setResizeMenuOnLeft] = useState(false)
  const [__timeRemaining, setTimeRemaining] = useState<number | null>(null)
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
  // Must be useCallback — CardDataContext children use this in useLayoutEffect deps
  // Stable reference required — useLayoutEffect in CardDataContext depends on this.
  // Use functional update to compare prev state and skip no-op updates that would
  // otherwise trigger infinite re-renders (new object reference, same values).
  const reportCallback = useCallback((state: CardDataState) => {
    setChildDataState(prev => {
      if (prev &&
        prev.isFailed === state.isFailed &&
        prev.consecutiveFailures === state.consecutiveFailures &&
        prev.errorMessage === state.errorMessage &&
        prev.isLoading === state.isLoading &&
        prev.isRefreshing === state.isRefreshing &&
        prev.hasData === state.hasData &&
        prev.isDemoData === state.isDemoData &&
        prev.lastUpdated === state.lastUpdated) {
        return prev
      }
      return state
    })
  }, [])
  const reportCtx = useMemo(() => ({ report: reportCallback }), [reportCallback])

  // Merge child-reported state with props — child reports take priority when present
  const effectiveIsFailed = isFailed || childDataState?.isFailed || cardLoadingTimedOut
  const effectiveConsecutiveFailures = consecutiveFailures || childDataState?.consecutiveFailures || (cardLoadingTimedOut ? 1 : 0)
  // Show loading when:
  // - Card explicitly reports isLoading: true (AND stuck-loading timeout hasn't fired), OR
  // - Card hasn't reported yet AND quick timeout hasn't passed (brief skeleton for reporting cards)
  // - Minimum skeleton display time hasn't elapsed yet (#5206) — prevents flicker from
  //   child useLayoutEffect reports causing skeleton → content → skeleton → content
  // Static/demo cards that never report will stop showing as loading after 150ms
  // NOTE: isRefreshing is NOT included — background refreshes should be invisible to avoid flicker
  // cardLoadingTimedOut acts as a safety valve: if a card stays in isLoading:true for
  // CARD_LOADING_TIMEOUT_MS (30s), force it out of loading state to prevent permanent spinner.
  const effectiveIsLoading = (childDataState?.isLoading && !cardLoadingTimedOut) || (childDataState === null && !initialRenderTimedOut && !skeletonTimedOut) || (!minSkeletonElapsed && childDataState === null)
  // hasData logic:
  // - If card explicitly reports hasData, use it
  // - If card hasn't reported AND quick timeout passed, assume has data (static/demo card)
  // - If card hasn't reported AND skeleton timed out, assume has data (show content)
  // - If card reports isLoading:true but not hasData, assume no data (show skeleton)
  // - If stuck loading timed out, force hasData to true so content area is shown
  // - Minimum skeleton display hasn't elapsed — don't claim hasData yet (#5206)
  // - Otherwise default to true (show content)
  const effectiveHasData = cardLoadingTimedOut ? true : (childDataState?.hasData ?? (
    childDataState === null
      ? ((initialRenderTimedOut || skeletonTimedOut) && minSkeletonElapsed)  // After quick timeout AND min skeleton elapsed, assume static card has content
      : (childDataState?.isLoading ? false : true)
  ))

  // Merge isDemoData from child-reported state with prop.
  // When forceLive is true, ignore child-reported isDemoData — the child checks global
  // demo mode independently but we know the data is real (in-cluster with OAuth).
  const effectiveIsDemoData = forceLive ? false : (childDataState?.isDemoData ?? isDemoData ?? false)

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

  const handleSnooze = (durationMs: number = ONE_HOUR_MS) => {
    if (!pendingSwap || !cardId) return

    snoozeSwap({
      originalCardId: cardId,
      originalCardType: cardType,
      originalCardTitle: title,
      newCardType: pendingSwap.newType,
      newCardTitle: newTitle || pendingSwap.newType,
      reason: pendingSwap.reason }, durationMs)

    onSwapCancel?.()
  }

  const handleSwapNow = () => {
    if (pendingSwap && onSwap) {
      onSwap(pendingSwap.newType)
    }
  }

  // Close resize submenu when main menu closes
  useEffect(() => {
    if (!showMenu) {
      setShowResizeMenu(false)
      setMenuPosition(null)
    }
  }, [showMenu])

  // Keep menu anchored to button on scroll/resize.
  // Includes boundary detection to prevent the menu from rendering off-screen (#5253).
  useEffect(() => {
    if (!showMenu || !menuButtonRef.current) return

    /** Approximate height of the card action menu (px) */
    const MENU_APPROX_HEIGHT = 300
    /** Width of the card action menu (w-48 = 192px) */
    const MENU_WIDTH_PX = 192
    /** Viewport edge padding (px) */
    const VIEWPORT_PADDING = 8

    const updatePosition = () => {
      if (menuButtonRef.current) {
        const rect = menuButtonRef.current.getBoundingClientRect()
        let top = rect.bottom + 4
        let right = window.innerWidth - rect.right

        // If the menu would extend below the viewport, position it above the button
        if (top + MENU_APPROX_HEIGHT > window.innerHeight - VIEWPORT_PADDING) {
          top = Math.max(VIEWPORT_PADDING, rect.top - MENU_APPROX_HEIGHT - 4)
        }
        // If the menu would extend beyond the right edge, clamp it
        if (right < VIEWPORT_PADDING) {
          right = VIEWPORT_PADDING
        }
        // If the menu would extend beyond the left edge, clamp it
        const leftEdge = window.innerWidth - right - MENU_WIDTH_PX
        if (leftEdge < VIEWPORT_PADDING) {
          right = window.innerWidth - MENU_WIDTH_PX - VIEWPORT_PADDING
        }

        setMenuPosition({ top, right })
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
    <CardExpandedContext.Provider value={{ isExpanded, containerSize }}>
      <ForceLiveContext.Provider value={!!forceLive}>
      <CardDataReportContext.Provider value={reportCtx}>
        <>
          {/* Outer wrapper for demo corner brackets (outside card border) */}
          <div className={cn('relative', isCollapsed ? 'h-auto' : 'h-full')}>
            {showDemoIndicator && (
              <>
                <svg className="absolute -top-[1px] -left-[1px] w-5 h-5 pointer-events-none z-10" viewBox="0 0 20 20" fill="none">
                  <defs><filter id="demo-rough"><feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="4" result="noise" /><feDisplacementMap in="SourceGraphic" in2="noise" scale="1" /></filter></defs>
                  <path d="M2 17 V9 C2 4.5 4.5 2 9 2 H17" stroke="rgb(234 179 8 / 0.4)" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#demo-rough)" />
                </svg>
                <svg className="absolute -top-[1px] -right-[1px] w-5 h-5 pointer-events-none z-10" viewBox="0 0 20 20" fill="none">
                  <path d="M18 17 V9 C18 4.5 15.5 2 11 2 H3" stroke="rgb(234 179 8 / 0.4)" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#demo-rough)" />
                </svg>
                <svg className="absolute -bottom-[1px] -left-[1px] w-5 h-5 pointer-events-none z-10" viewBox="0 0 20 20" fill="none">
                  <path d="M2 3 V11 C2 15.5 4.5 18 9 18 H17" stroke="rgb(234 179 8 / 0.4)" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#demo-rough)" />
                </svg>
                <svg className="absolute -bottom-[1px] -right-[1px] w-5 h-5 pointer-events-none z-10" viewBox="0 0 20 20" fill="none">
                  <path d="M18 3 V11 C18 15.5 15.5 18 11 18 H3" stroke="rgb(234 179 8 / 0.4)" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#demo-rough)" />
                </svg>
              </>
            )}
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
              // Only pulse during initial skeleton display, not background refreshes (prevents flicker)
              shouldShowSkeleton && !forceSkeletonForOffline && 'animate-card-refresh-pulse',
              getFlashClass()
            )}
            onMouseEnter={() => setShowSummary(true)}
            onMouseLeave={() => setShowSummary(false)}
          >
            {/* Header */}
            <div data-tour="card-header" className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-2 min-w-0">
                {dragHandle}
                {ResolvedIcon && <ResolvedIcon className={cn('w-4 h-4 flex-shrink-0', resolvedIconColor)} />}
                <h3 className="text-sm font-medium text-foreground truncate">{title}</h3>
                <InfoTooltip text={description || t('messages.descriptionComingSoon', { title })} />
                {/* Demo data indicator - shows if card uses demo data (respects child opt-out) */}
                {showDemoIndicator && (
                  <span
                    data-testid="demo-badge"
                    role="status"
                    aria-live="polite"
                    className="text-2xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 flex-shrink-0"
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
                    className="text-2xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 flex-shrink-0"
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
                    className="text-2xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 flex items-center gap-1 flex-shrink-0"
                    title={t('cardWrapper.refreshFailedCount', { count: effectiveConsecutiveFailures })}
                  >
                    {t('cardWrapper.refreshFailed')}
                  </span>
                )}
                {/* Refresh indicator - only shows when no refresh button is present (button handles its own spin) */}
                {!onRefresh && (isVisuallySpinning || effectiveIsLoading || forceSkeletonForOffline) && !effectiveIsFailed && (
                  <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" aria-hidden="true" />
                )}
                {/* Last updated indicator — use prop or child-reported timestamp */}
                {(() => {
                  const effectiveLastUpdated = lastUpdated ?? childDataState?.lastUpdated
                  return !isVisuallySpinning && !effectiveIsLoading && !effectiveIsFailed && effectiveLastUpdated ? (
                    <span className="text-2xs text-muted-foreground" title={effectiveLastUpdated.toLocaleString()}>
                      {formatTimeAgo(effectiveLastUpdated)}
                    </span>
                  ) : null
                })()}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
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
                  onClick={() => { setFullScreen(false); setShowBugReport(true) }}
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
                        /** Approximate height of the card action menu (px) */
                        const MENU_APPROX_HEIGHT = 300
                        /** Width of the card action menu (w-48 = 192px) */
                        const MENU_WIDTH_PX = 192
                        /** Viewport edge padding (px) */
                        const VIEWPORT_PADDING = 8

                        let top = rect.bottom + 4
                        let right = window.innerWidth - rect.right

                        // Prevent menu from rendering off-screen (#5253)
                        if (top + MENU_APPROX_HEIGHT > window.innerHeight - VIEWPORT_PADDING) {
                          top = Math.max(VIEWPORT_PADDING, rect.top - MENU_APPROX_HEIGHT - 4)
                        }
                        if (right < VIEWPORT_PADDING) {
                          right = VIEWPORT_PADDING
                        }
                        const leftEdge = window.innerWidth - right - MENU_WIDTH_PX
                        if (leftEdge < VIEWPORT_PADDING) {
                          right = window.innerWidth - MENU_WIDTH_PX - VIEWPORT_PADDING
                        }

                        setMenuPosition({ top, right })
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
                      onKeyDown={(e) => {
                        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                        e.preventDefault()
                        const items = e.currentTarget.querySelectorAll<HTMLElement>('button[role="menuitem"]:not([disabled])')
                        const idx = Array.from(items).indexOf(document.activeElement as HTMLElement)
                        if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
                        else items[Math.max(idx - 1, 0)]?.focus()
                      }}
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
                          copyToClipboard(url)
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
                              onKeyDown={(e) => {
                                if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                                e.preventDefault()
                                const items = e.currentTarget.querySelectorAll<HTMLElement>('button[role="menuitem"]:not([disabled])')
                                const idx = Array.from(items).indexOf(document.activeElement as HTMLElement)
                                if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
                                else items[Math.max(idx - 1, 0)]?.focus()
                              }}
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
                            // Open Console Studio at Widgets section with this card pre-selected
                            if (studioContext?.openAddCardModal) {
                              studioContext.openAddCardModal('widgets', cardType)
                            } else {
                              setShowWidgetExport(true)
                            }
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
                    {/* Loading timeout fallback: if loading exceeded CARD_LOADING_TIMEOUT_MS and
                    the child has no data, show a clear error state instead of a blank/stuck card.
                    The child is still mounted (hidden) so it can resume if the data eventually arrives. */}
                    {cardLoadingTimedOut && !childDataState?.hasData && (
                      <div className="h-full flex flex-col items-center justify-center p-4 text-center" data-card-loading-timeout="true">
                        <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
                        <p className="text-sm font-medium text-foreground mb-1">
                          {t('cardWrapper.loadingTimedOutTitle')}
                        </p>
                        <p className="text-xs text-muted-foreground mb-3 max-w-xs">
                          {t('cardWrapper.loadingTimedOutMessage')}
                        </p>
                        {onRefresh && (
                          <button
                            onClick={() => {
                              setCardLoadingTimedOut(false)
                              onRefresh()
                            }}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" />
                            {t('cardWrapper.loadingTimedOutRetry')}
                          </button>
                        )}
                      </div>
                    )}
                    {/* Fallback empty state: when a card finishes loading but has no data,
                    show a helpful empty state instead of a blank card (#4894).
                    This catches cards that don't implement their own showEmptyState check.
                    Conditions: child reported state, not loading, no data, and timeout hasn't fired. */}
                    {childDataState && !childDataState.isLoading && !childDataState.hasData && !cardLoadingTimedOut && (
                      <div className="h-full flex flex-col items-center justify-center p-4 text-center" data-card-empty-state="true">
                        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
                          <Info className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium text-foreground mb-1">
                          {t('cardWrapper.noDataTitle')}
                        </p>
                        <p className="text-xs text-muted-foreground mb-3 max-w-xs">
                          {t('cardWrapper.noDataMessage')}
                        </p>
                        {onRefresh && (
                          <button
                            onClick={onRefresh}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" />
                            {t('cardWrapper.loadingTimedOutRetry')}
                          </button>
                        )}
                      </div>
                    )}
                    {/* ALWAYS render children so they can report their data state via useCardLoadingState.
                    Hide visually when skeleton is showing, loading timed out, or empty state is shown,
                    but keep mounted so useLayoutEffect runs.
                    This prevents the deadlock where CardWrapper waits for hasData but children never mount.
                    Suspense catches lazy() chunk loading so it doesn't bubble up to Layout and blank the whole page. */}
                    <div className={(shouldShowSkeleton || (cardLoadingTimedOut && !childDataState?.hasData) || (childDataState && !childDataState.isLoading && !childDataState.hasData && !cardLoadingTimedOut)) ? 'hidden' : 'contents'}>
                      <DynamicCardErrorBoundary cardId={cardId || cardType}>
                        <Suspense fallback={<CardSkeleton type={effectiveSkeletonType} rows={skeletonRows || 3} showHeader={false} />}>
                          {children}
                        </Suspense>
                      </DynamicCardErrorBoundary>
                    </div>
                    {/* Demo CTA — install prompt for live data */}
                    {showDemoIndicator && !shouldShowSkeleton && !DEMO_EXEMPT_CARDS.has(cardType) && (
                      <div className="mt-auto pt-2 border-t border-yellow-500/10">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (isAgentConnected && installInfo) {
                              // Agent available: show cluster selector, then start AI mission
                              setShowInstallClusterSelect(true)
                            } else if (installInfo) {
                              // No agent: try to load KB guide and show manual steps
                              try {
                                const resp = await fetch(`/console-kb/${installInfo.kbPaths[0]}`, { signal: AbortSignal.timeout(10_000) })
                                if (resp.ok) {
                                  const data = await resp.json()
                                  setShowInstallGuide({ mission: data })
                                }
                              } catch { /* ignore fetch error */ }
                            } else {
                              // Generic fallback: start AI mission
                              startMission({
                                title: `Set up ${title} for live data`,
                                description: `Install and configure the components needed for live data`,
                                type: 'deploy',
                                initialPrompt: `The user is viewing the "${title}" dashboard card which is currently showing demo data. Help them install and configure whatever is needed to get live data for this card.` })
                              openSidebar()
                            }
                          }}
                          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-yellow-400/80 hover:text-yellow-300 hover:bg-yellow-500/10 rounded transition-colors"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Install {installInfo?.project ?? 'components'} for live data</span>
                        </button>
                      </div>
                    )}
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
                    onClick={() => handleSnooze(ONE_HOUR_MS)}
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
          </div>{/* Close outer wrapper for demo corner brackets */}

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
              <div ref={expandedContentRef} className="flex-1 min-h-0 flex flex-col">
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

          {/* Install CTA: cluster selection dialog (agent available) */}
          {showInstallClusterSelect && installInfo && (
            <ClusterSelectionDialog
              open={showInstallClusterSelect}
              onCancel={() => setShowInstallClusterSelect(false)}
              onSelect={async (clusters) => {
                setShowInstallClusterSelect(false)
                const prompt = await loadMissionPrompt(
                  installInfo.missionKey,
                  `Install and configure ${installInfo.project} for live data on the "${title}" dashboard card.`,
                  installInfo.kbPaths,
                )
                const clusterContext = clusters.length > 0
                  ? `\n\n**Target cluster(s):** ${clusters.join(', ')}\n\nPlease install on ${clusters.length === 1 ? `cluster "${clusters[0]}"` : `the following clusters: ${clusters.join(', ')}`}.`
                  : ''
                startMission({
                  title: `Install ${installInfo.project}`,
                  description: `Install and configure ${installInfo.project}`,
                  type: 'deploy',
                  cluster: clusters.length > 0 ? clusters.join(',') : undefined,
                  initialPrompt: prompt + clusterContext })
                openSidebar()
              }}
              missionTitle={`Install ${installInfo.project}`}
            />
          )}

          {/* Install CTA: manual guide modal (no agent) */}
          {showInstallGuide && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="presentation" onClick={() => setShowInstallGuide(null)}>
              <div className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto p-6" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 id="install-guide-title" className="text-lg font-semibold">{showInstallGuide.mission.mission?.title ?? `Install ${installInfo?.project ?? 'Component'}`}</h3>
                  <button onClick={() => setShowInstallGuide(null)} className="p-1 hover:bg-secondary rounded" aria-label="Close dialog"><X className="w-4 h-4" /></button>
                </div>
                {showInstallGuide.mission.mission?.description && (
                  <p className="text-sm text-muted-foreground mb-4">{showInstallGuide.mission.mission.description}</p>
                )}
                <ol className="space-y-4">
                  {(showInstallGuide.mission.mission?.steps ?? []).map((step: { title?: string; description?: string }, i: number) => (
                    <li key={i} className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs flex items-center justify-center font-medium">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        {step.title && <p className="text-sm font-medium mb-1">{step.title}</p>}
                        {step.description && <div className="text-sm text-muted-foreground whitespace-pre-wrap">{step.description}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
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
                  cardTitle: title || CARD_TITLES[cardType] || cardType }}
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
