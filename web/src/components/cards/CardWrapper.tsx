import { ReactNode, useState, useEffect, useCallback, useRef, useMemo, memo, createContext, use, ComponentType, Suspense } from 'react'
import { safeLazy } from '../../lib/safeLazy'
import { Maximize2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CARD_TITLES, CARD_DESCRIPTIONS, DEMO_EXEMPT_CARDS } from './cardMetadata'
import { CARD_ICONS } from './cardIcons'
import { BaseModal } from '../../lib/modals'
import { MS_PER_HOUR } from '../../lib/constants/time'
import { cn } from '@/lib/cn'
import { useCardCollapse } from '../../lib/cards/cardHooks'
import { useSnoozedCards } from '../../hooks/useSnoozedCards'
import { useDemoMode } from '../../hooks/useDemoMode'
import { isDemoMode as checkIsDemoMode } from '../../lib/demoMode'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { CardDataReportContext, ForceLiveContext, type CardDataState } from './CardDataContext'
import { ChatMessage } from './CardChat'
import type { CardSkeletonProps } from '@/lib/cards/CardComponents'
import { emitCardExpanded, emitCardRefreshed } from '../../lib/analytics'
import { useMissions } from '../../hooks/useMissions'
import { LOADING_TIMEOUT_MS, SKELETON_DELAY_MS, INITIAL_RENDER_TIMEOUT_MS, TICK_INTERVAL_MS, CARD_LOADING_TIMEOUT_MS, MIN_SKELETON_DISPLAY_MS } from '../../lib/constants/network'
import { CardErrorFallback, CardFailureBanner } from './CardErrorFallback'
import { CardLoadingState } from './CardLoadingState'
import { CardMeta } from './CardMeta'
import { CardToolbar } from './CardToolbar'
import { InfoTooltip } from './card-wrapper/InfoTooltip'
import { PendingSwapNotification } from './card-wrapper/PendingSwapNotification'
// Lazy-load the widget export modal (~42 KB + code generator ~30 KB) — only when user exports
const WidgetExportModal = safeLazy(() => import('../widgets/WidgetExportModal'), 'WidgetExportModal')
// Lazy-load the feedback modal (~67 KB) — only loaded when user clicks bug report
const FeatureRequestModal = safeLazy(() => import('../feedback/FeatureRequestModal'), 'FeatureRequestModal')


// Minimum duration to show spin animation (ensures at least one full rotation)
const CARD_REFRESH_SPINNER_MAX_AGE_MS = 500
const MIN_SPIN_DURATION = CARD_REFRESH_SPINNER_MAX_AGE_MS
const COLLAPSED_CARDS_STORAGE_KEY = 'kubestellar-collapsed-cards'

/** CSS container query style for card content responsive breakpoints */
const CONTAINER_QUERY_STYLE = { containerType: 'inline-size' } as const

/** Default snooze duration for card swaps */
const DEFAULT_SNOOZE_MS = MS_PER_HOUR

// ---------------------------------------------------------------------------
// Relative-time formatting for the card header "last updated" label.
// ---------------------------------------------------------------------------
/**
 * Re-render interval for the "last updated" label in ms. When SSE refresh
 * fails, the card's lastUpdated prop is frozen at the last successful fetch,
 * so without this ticker the label would render "5d ago" forever (#9104).
 * One minute is enough resolution for an "Xm/Xh/Xd" label and is cheap.
 */
const LAST_UPDATED_TICK_MS = 60_000
const COLLAPSE_DELAY_MS = 300

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

interface PendingSwap {
  newType: string
  newTitle?: string
  reason: string
  swapAt: Date
}

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

// Re-export for backwards compatibility — data now lives in cardMetadata.ts and cardIcons.ts
export { CARD_TITLES, CARD_DESCRIPTIONS } from './cardMetadata'

export const CardWrapper = memo(function CardWrapper({
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
  cardHeight,
  onHeightChange,
  onChatMessage,
  onChatMessagesChange,
  skeletonType,
  skeletonRows,
  registerExpandTrigger,
  children }: CardWrapperProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { setFullScreen } = useMissions()
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
  const [showWidgetExport, setShowWidgetExport] = useState(false)

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

  // Tick counter that forces the "last updated" label to re-render at a fixed
  // cadence (#9104). Without this, when the refresh source (e.g. SSE stream)
  // returns 404 repeatedly, `lastUpdated` is frozen at the last successful
  // fetch and the label shows a stale "5d ago" that never advances even as
  // real-world time passes. The setInterval below bumps this every minute so
  // formatTimeAgo() is called with a current Date.now() and the label advances.
  const [, setLastUpdatedTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setLastUpdatedTick(t => t + 1)
    }, LAST_UPDATED_TICK_MS)
    return () => clearInterval(id)
  }, [])

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
      const stored = localStorage.getItem(COLLAPSED_CARDS_STORAGE_KEY)
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
  const isCollapsedRef = useRef(isCollapsed)
  const onCollapsedChangeRef = useRef(onCollapsedChange)

  useEffect(() => {
    isCollapsedRef.current = isCollapsed
  }, [isCollapsed])

  useEffect(() => {
    onCollapsedChangeRef.current = onCollapsedChange
  }, [onCollapsedChange])

  const setCollapsed = useCallback((collapsed: boolean | ((prev: boolean) => boolean)) => {
    const nextCollapsed = typeof collapsed === 'function'
      ? collapsed(isCollapsedRef.current)
      : collapsed

    onCollapsedChangeRef.current?.(nextCollapsed)
    // Always update the hook state for persistence
    hookSetCollapsed(nextCollapsed)
  }, [hookSetCollapsed])

  const [showSummary, setShowSummary] = useState(false)
  const [__timeRemaining, setTimeRemaining] = useState<number | null>(null)
  // Chat state reserved for future use
  // const [isChatOpen, setIsChatOpen] = useState(false)
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([])
  const { snoozeSwap } = useSnoozedCards()
  const { isDemoMode: globalDemoMode } = useDemoMode()
  const isModeSwitching = useIsModeSwitching()
  const isDemoExempt = DEMO_EXEMPT_CARDS.has(cardType)
  const isDemoMode = globalDemoMode && !isDemoExempt && !forceLive

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
  const effectiveErrorMessage = childDataState?.errorMessage || undefined
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
  const effectiveLastUpdated = lastUpdated ?? childDataState?.lastUpdated
  const showHeaderRefreshIndicator = !onRefresh && (isRefreshing || isVisuallySpinning || effectiveIsLoading || forceSkeletonForOffline)
  const showInstallCta = showDemoIndicator && !shouldShowSkeleton && !DEMO_EXEMPT_CARDS.has(cardType)

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
      }, COLLAPSE_DELAY_MS)
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

  const handleSnooze = (durationMs: number = DEFAULT_SNOOZE_MS) => {
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

  const handleToggleCollapse = useCallback(() => {
    setCollapsed(prev => !prev)
  }, [setCollapsed])

  const handleRefresh = useCallback(() => {
    onRefresh?.()
    emitCardRefreshed(cardType)
  }, [onRefresh, cardType])

  const handleLoadingTimeoutRetry = useCallback(() => {
    setCardLoadingTimedOut(false)
    onRefresh?.()
  }, [onRefresh])

  const handleExpandFullscreen = useCallback(() => {
    emitCardExpanded(cardType)
    setIsExpanded(true)
  }, [cardType])

  const handleOpenBugReport = useCallback(() => {
    setFullScreen(false)
    setShowBugReport(true)
  }, [setFullScreen])

  // Silence unused variable warnings for future chat implementation
  void messages
  void onChatMessage
  void onChatMessagesChange
  void setLocalMessages

  // #6149 — Memoize inline provider values so every CardWrapper re-render
  // (there are dozens on every dashboard) does not invalidate the
  // CardExpandedContext / ForceLiveContext consumers inside the card.
  const cardExpandedValue = useMemo(
    () => ({ isExpanded, containerSize }),
    [isExpanded, containerSize]
  )
  const forceLiveValue = useMemo(() => !!forceLive, [forceLive])

  return (
    <CardTypeContext.Provider value={cardType}>
    <CardExpandedContext.Provider value={cardExpandedValue}>
      <ForceLiveContext.Provider value={forceLiveValue}>
      <CardDataReportContext.Provider value={reportCtx}>
        <>
          {/* Outer wrapper for demo corner brackets (outside card border) */}
          <div className={cn('relative', isCollapsed ? 'h-auto' : 'h-full')}>
            {showDemoIndicator && (
              <>
                <svg className="absolute -top-px -left-px w-5 h-5 pointer-events-none z-10" viewBox="0 0 20 20" fill="none">
                  <defs><filter id="demo-rough"><feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="4" result="noise" /><feDisplacementMap in="SourceGraphic" in2="noise" scale="1" /></filter></defs>
                  <path d="M2 17 V9 C2 4.5 4.5 2 9 2 H17" stroke="rgb(234 179 8 / 0.4)" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#demo-rough)" />
                </svg>
                <svg className="absolute -top-px -right-px w-5 h-5 pointer-events-none z-10" viewBox="0 0 20 20" fill="none">
                  <path d="M18 17 V9 C18 4.5 15.5 2 11 2 H3" stroke="rgb(234 179 8 / 0.4)" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#demo-rough)" />
                </svg>
                <svg className="absolute -bottom-px -left-px w-5 h-5 pointer-events-none z-10" viewBox="0 0 20 20" fill="none">
                  <path d="M2 3 V11 C2 15.5 4.5 18 9 18 H17" stroke="rgb(234 179 8 / 0.4)" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#demo-rough)" />
                </svg>
                <svg className="absolute -bottom-px -right-px w-5 h-5 pointer-events-none z-10" viewBox="0 0 20 20" fill="none">
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
            <div data-tour="card-header" className="flex flex-wrap items-center justify-between gap-y-2 border-b border-border/50 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                {dragHandle}
                {ResolvedIcon && <ResolvedIcon className={cn('h-4 w-4 shrink-0', resolvedIconColor)} />}
                <h2 className="truncate text-sm font-medium text-foreground">{title}</h2>
                <InfoTooltip text={description || t('messages.descriptionComingSoon', { title })} />
                <CardMeta
                  showDemoIndicator={showDemoIndicator}
                  isDemoData={effectiveIsDemoData}
                  isLive={isLive}
                  isFailed={effectiveIsFailed}
                  consecutiveFailures={effectiveConsecutiveFailures}
                  showRefreshIndicator={showHeaderRefreshIndicator}
                  isLoading={effectiveIsLoading}
                  isVisuallySpinning={isVisuallySpinning}
                  lastUpdated={effectiveLastUpdated}
                />
              </div>
              <CardToolbar
                title={title}
                isCollapsed={isCollapsed}
                onToggleCollapse={handleToggleCollapse}
                onRefresh={onRefresh ? handleRefresh : undefined}
                isRefreshDisabled={isRefreshing || isVisuallySpinning || effectiveIsLoading || forceSkeletonForOffline}
                isRefreshSpinning={isRefreshing || isVisuallySpinning || effectiveIsLoading || forceSkeletonForOffline}
                isFailed={effectiveIsFailed}
                consecutiveFailures={effectiveConsecutiveFailures}
                onExpandFullscreen={handleExpandFullscreen}
                onOpenBugReport={handleOpenBugReport}
                cardId={cardId}
                cardType={cardType}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
                onConfigure={onConfigure}
                onRemove={onRemove}
                onWidthChange={onWidthChange}
                onHeightChange={onHeightChange}
                onShowWidgetExport={() => setShowWidgetExport(true)}
              />
            </div>

            <CardFailureBanner
              cardType={cardType}
              isFailed={effectiveIsFailed}
              isCollapsed={isCollapsed}
              consecutiveFailures={effectiveConsecutiveFailures}
              errorMessage={effectiveErrorMessage}
              onRefresh={onRefresh}
              onRemove={onRemove}
              isRefreshing={isRefreshing}
              isVisuallySpinning={isVisuallySpinning}
            />

            {/* Content - hidden when collapsed, lazy loaded when visible or expanded */}
            {!isCollapsed && (
              <div className="flex min-h-full flex-1 flex-col overflow-hidden p-4">
                {/* Container query boundary — cards use @container breakpoints
                    instead of viewport breakpoints so layouts respond to actual
                    card width (which shrinks when side panels expand).
                    Must be INSIDE overflow-hidden (CSS spec: container-type and
                    overflow conflict on the same element). */}
                <div className="@container flex min-h-0 flex-1 flex-col" style={CONTAINER_QUERY_STYLE}>
                  <CardLoadingState
                    cardId={cardId || cardType}
                    cardType={cardType}
                    title={title}
                    isVisible={isVisible}
                    isExpanded={isExpanded}
                    shouldShowSkeleton={shouldShowSkeleton}
                    skeletonType={effectiveSkeletonType}
                    skeletonRows={skeletonRows || 3}
                    cardLoadingTimedOut={cardLoadingTimedOut}
                    childDataState={childDataState}
                    onRefresh={onRefresh}
                    onRemove={onRemove}
                    onLoadingTimeoutRetry={onRefresh ? handleLoadingTimeoutRetry : undefined}
                    isRefreshing={isRefreshing}
                    isVisuallySpinning={isVisuallySpinning}
                    showInstallCta={showInstallCta}
                  >
                    {children}
                  </CardLoadingState>
                </div>{/* Close @container query boundary */}

              </div>
            )}

            {/* Pending swap notification - hidden when collapsed */}
            {!isCollapsed && pendingSwap && (
              <PendingSwapNotification
                pendingSwap={pendingSwap}
                newTitle={newTitle}
                onSnooze={handleSnooze}
                onSwapNow={handleSwapNow}
                onCancel={() => onSwapCancel?.()}
                defaultSnoozeDurationMs={DEFAULT_SNOOZE_MS}
              />
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
            testId="drilldown-modal"
          >
            <BaseModal.Header
              title={title}
              icon={Maximize2}
              onClose={() => setIsExpanded(false)}
              onBack={() => setIsExpanded(false)}
              showBack={true}
              closeTestId="drilldown-close"
              backTestId="drilldown-back"
              tabsTestId="drilldown-tabs"
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
              <div ref={expandedContentRef} className="flex flex-1 min-h-0 flex-col">
                <CardErrorFallback cardId={cardId || cardType}>
                  {children}
                </CardErrorFallback>
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
})
