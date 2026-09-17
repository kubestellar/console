import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CARD_TITLES, CARD_DESCRIPTIONS, DEMO_EXEMPT_CARDS } from './cardMetadata'
import { CARD_ICONS } from './cardIcons'
import { useCardCollapseState } from './useCardCollapseState'
import { useSnoozedCards } from '../../hooks/useSnoozedCards'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useModal } from '../../hooks/useModal'
import { isDemoMode as checkIsDemoMode } from '../../lib/demoMode'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { type CardDataState } from './CardDataContext'
import { ChatMessage } from './CardChat'
import { emitCardExpanded, emitCardRefreshed } from '../../lib/analytics'
import { useMissions } from '../../hooks/useMissions'
import { LOADING_TIMEOUT_MS, SKELETON_DELAY_MS, INITIAL_RENDER_TIMEOUT_MS, TICK_INTERVAL_MS, CARD_LOADING_TIMEOUT_MS, MIN_SKELETON_DISPLAY_MS } from '../../lib/constants/network'
import { useTimeoutFlag, useConditionalTimeout } from '../../hooks/useTimeoutFlag'
import { useResizeHandle } from './ResizeHandle'
import type { CardWrapperProps } from './CardWrapper.types'
import {
  DEFAULT_SNOOZE_MS,
  LAST_UPDATED_TICK_MS,
} from './CardWrapper.constants'
import { useLazyMount } from './CardWrapper.useLazyMount'
import { deriveCardDisplayState } from './cardDisplayState'
import { useMinSpinDuration } from './useMinSpinDuration'

/**
 * Encapsulates all of CardWrapper's state, timeout flags, derived rendering
 * values and event handlers so the component body stays purely presentational.
 * Extracted from CardWrapper.tsx to reduce complexity (#22959).
 */
export function useCardWrapperState(props: CardWrapperProps) {
  const {
    cardId,
    cardType,
    title: customTitle,
    icon: Icon,
    iconColor,
    pendingSwap,
    chatMessages: externalMessages,
    isRefreshing,
    lastUpdated,
    isDemoData,
    forceLive,
    isFailed,
    consecutiveFailures,
    isCollapsed: externalCollapsed,
    flashType = 'none',
    onCollapsedChange,
    onSwap,
    onSwapCancel,
    onRefresh,
    onChatMessage,
    onChatMessagesChange,
    skeletonType,
    registerExpandTrigger,
  } = props

  const { t } = useTranslation(['cards', 'common'])
  const { setFullScreen } = useMissions()
  const [isExpanded, setIsExpanded] = useState(false)
  const { containerSize, expandedContentRef } = useResizeHandle(isExpanded)
  const { isOpen: showBugReport, open: openBugReport, close: closeBugReport } = useModal()
  const { isOpen: showWidgetExport, open: openWidgetExport, close: closeWidgetExport } = useModal()

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

  // Skeleton timeout: show skeleton for up to 5s while waiting for card to report.
  // After timeout, assume card doesn't use reporting and show content.
  const skeletonTimedOut = useTimeoutFlag(LOADING_TIMEOUT_MS, checkIsDemoMode())

  // Skeleton delay: don't show skeleton immediately — prevents flicker when cache loads quickly from IndexedDB
  const skeletonDelayPassed = useTimeoutFlag(SKELETON_DELAY_MS, checkIsDemoMode())

  // Quick initial render timeout: if card hasn't reported state within 150ms, assume static/demo card
  const initialRenderTimedOut = useTimeoutFlag(INITIAL_RENDER_TIMEOUT_MS, checkIsDemoMode())

  // Minimum skeleton display duration guard (#5206): prevents skeleton→content→skeleton flicker
  const minSkeletonElapsed = useTimeoutFlag(MIN_SKELETON_DISPLAY_MS, checkIsDemoMode())

  // Stuck loading guard: force exit loading state after CARD_LOADING_TIMEOUT_MS (30s)
  const cardLoadingTimedOut = useConditionalTimeout(childDataState?.isLoading ?? false, CARD_LOADING_TIMEOUT_MS)

  // Keep the refresh spinner visible for a minimum duration (prop + child-reported state)
  const isVisuallySpinning = useMinSpinDuration(isRefreshing || (childDataState?.isRefreshing ?? false))

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
  const flashClass = getFlashClass()

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

  // Merge child-reported state with props + timeout flags into effective render state
  const {
    effectiveIsFailed,
    effectiveConsecutiveFailures,
    effectiveErrorMessage,
    effectiveIsLoading,
    effectiveHasData,
    effectiveIsDemoData,
    showDemoIndicator,
    forceSkeletonForOffline,
    effectiveSkeletonType,
    shouldShowSkeleton,
    effectiveLastUpdated,
    showHeaderRefreshIndicator,
    showInstallCta,
  } = deriveCardDisplayState({
    cardType,
    childDataState,
    isFailed,
    consecutiveFailures,
    isDemoData,
    forceLive,
    isRefreshing,
    lastUpdated,
    onRefresh,
    skeletonType,
    cardLoadingTimedOut,
    initialRenderTimedOut,
    skeletonTimedOut,
    minSkeletonElapsed,
    skeletonDelayPassed,
    isDemoMode,
    isDemoExempt,
    isModeSwitching,
    isVisuallySpinning,
  })

  const { isCollapsed, handleToggleCollapse } = useCardCollapseState({
    cardId,
    cardType,
    externalCollapsed,
    onCollapsedChange,
    effectiveHasData,
    initialRenderTimedOut,
    skeletonTimedOut,
    effectiveIsDemoData,
    isDemoMode,
  })

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

  const handleRefresh = useCallback(() => {
    onRefresh?.()
    emitCardRefreshed(cardType)
  }, [onRefresh, cardType])

  const handleLoadingTimeoutRetry = useCallback(() => {
    // cardLoadingTimedOut resets automatically via useConditionalTimeout when
    // childDataState.isLoading toggles back to true on re-fetch
    onRefresh?.()
  }, [onRefresh])

  const handleExpandFullscreen = useCallback(() => {
    emitCardExpanded(cardType)
    setIsExpanded(true)
  }, [cardType])

  const handleOpenBugReport = useCallback(() => {
    setFullScreen(false)
    openBugReport()
  }, [setFullScreen, openBugReport])

  // Silence unused variable warnings for future chat implementation
  void messages
  void onChatMessage
  void onChatMessagesChange
  void setLocalMessages
  void __timeRemaining

  // #6149 — Memoize inline provider values so every CardWrapper re-render
  // (there are dozens on every dashboard) does not invalidate the
  // CardExpandedContext / ForceLiveContext consumers inside the card.
  const cardExpandedValue = useMemo(
    () => ({ isExpanded, containerSize }),
    [isExpanded, containerSize]
  )
  const forceLiveValue = useMemo(() => !!forceLive, [forceLive])

  // #21775 — CardHeader expects a plain `(key, defaultValue?, options?) => string`
  // translator (matching how it actually calls `t`). Passing the raw i18next
  // TFunction<['cards','common']> directly triggers an excessively deep type
  // instantiation (TS2589) because of its complex overloaded/generic call
  // signature. Wrap it in a simple function that forwards all arguments.
  const headerT = useCallback(
    (key: string, defaultValue?: string, options?: Record<string, unknown>): string => {
      if (defaultValue !== undefined) {
        return t(key, defaultValue, options) as string
      }
      return t(key) as string
    },
    [t]
  )

  return {
    t,
    isExpanded,
    setIsExpanded,
    expandedContentRef,
    showBugReport,
    closeBugReport,
    showWidgetExport,
    openWidgetExport,
    closeWidgetExport,
    lazyRef,
    isVisible,
    flashKey,
    flashClass,
    isVisuallySpinning,
    childDataState,
    cardLoadingTimedOut,
    isCollapsed,
    showSummary,
    setShowSummary,
    reportCtx,
    effectiveIsFailed,
    effectiveConsecutiveFailures,
    effectiveErrorMessage,
    effectiveIsLoading,
    effectiveIsDemoData,
    showDemoIndicator,
    forceSkeletonForOffline,
    effectiveSkeletonType,
    shouldShowSkeleton,
    effectiveLastUpdated,
    showHeaderRefreshIndicator,
    showInstallCta,
    title,
    description,
    newTitle,
    ResolvedIcon,
    resolvedIconColor,
    handleSnooze,
    handleSwapNow,
    handleToggleCollapse,
    handleRefresh,
    handleLoadingTimeoutRetry,
    handleExpandFullscreen,
    handleOpenBugReport,
    cardExpandedValue,
    forceLiveValue,
    headerT,
  }
}
