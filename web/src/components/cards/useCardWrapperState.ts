import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCardCollapse } from '../../lib/cards/cardHooks'
import { useSnoozedCards } from '../../hooks/useSnoozedCards'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useModal } from '../../hooks/useModal'
import { isDemoMode as checkIsDemoMode } from '../../lib/demoMode'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { useMissions } from '../../hooks/useMissions'
import { useTimeoutFlag, useConditionalTimeout } from '../../hooks/useTimeoutFlag'
import { emitCardExpanded, emitCardRefreshed } from '../../lib/analytics'
import { CARD_TITLES, CARD_DESCRIPTIONS, DEMO_EXEMPT_CARDS } from './cardMetadata'
import { CARD_ICONS } from './cardIcons'
import { LOADING_TIMEOUT_MS, SKELETON_DELAY_MS, INITIAL_RENDER_TIMEOUT_MS, TICK_INTERVAL_MS, CARD_LOADING_TIMEOUT_MS, MIN_SKELETON_DISPLAY_MS } from '../../lib/constants/network'
import { MS_PER_HOUR } from '../../lib/constants/time'
import type { CardDataState } from './CardDataContext'
import type { ChatMessage } from './CardChat'

const CARD_REFRESH_SPINNER_MAX_AGE_MS = 500
const MIN_SPIN_DURATION = CARD_REFRESH_SPINNER_MAX_AGE_MS
const COLLAPSED_CARDS_STORAGE_KEY = 'kubestellar-collapsed-cards'
const LAST_UPDATED_TICK_MS = 60_000
const COLLAPSE_DELAY_MS = 300
const DEFAULT_SNOOZE_MS = MS_PER_HOUR

export interface CardContainerSize {
  width: number
  height: number
}

function useLazyMount(_rootMargin = '100px') {
  const [isVisible] = useState(true)
  const ref = useRef<HTMLDivElement>(null)
  return { ref, isVisible }
}

interface PendingSwap {
  newType: string
  newTitle?: string
  reason: string
  swapAt: Date
}

interface UseCardWrapperStateParams {
  cardId?: string
  cardType: string
  customTitle?: string
  icon?: import('react').ComponentType<{ className?: string }>
  iconColor?: string
  forceLive?: boolean
  flashType?: 'none' | 'info' | 'warning' | 'error'
  isRefreshing?: boolean
  lastUpdated?: Date | null
  isDemoData?: boolean
  isFailed?: boolean
  consecutiveFailures?: number
  pendingSwap?: PendingSwap
  externalMessages?: ChatMessage[]
  onCollapsedChange?: (collapsed: boolean) => void
  onSwap?: (newType: string) => void
  onSwapCancel?: () => void
  onRefresh?: () => void
  onChatMessage?: (message: string) => Promise<ChatMessage>
  onChatMessagesChange?: (messages: ChatMessage[]) => void
  registerExpandTrigger?: (expand: () => void) => void
  skeletonType?: string
  cardWidth?: number
  cardHeight?: number
  externalCollapsed?: boolean
}

export function useCardWrapperState({
  cardId,
  cardType,
  customTitle,
  icon,
  iconColor,
  forceLive,
  flashType = 'none',
  isRefreshing,
  lastUpdated,
  isDemoData,
  isFailed,
  consecutiveFailures,
  pendingSwap,
  externalMessages,
  onCollapsedChange,
  onSwap,
  onSwapCancel,
  onRefresh,
  onChatMessage,
  onChatMessagesChange,
  registerExpandTrigger,
  skeletonType,
  externalCollapsed,
}: UseCardWrapperStateParams) {
  const { t } = useTranslation(['cards', 'common'])
  const { setFullScreen } = useMissions()
  const [isExpanded, setIsExpanded] = useState(false)
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
        setContainerSize(prev => (prev.width === w && prev.height === h) ? prev : { width: w, height: h })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [isExpanded])

  const { isOpen: showBugReport, open: openBugReport, close: closeBugReport } = useModal()
  const { isOpen: showWidgetExport, open: openWidgetExport, close: closeWidgetExport } = useModal()

  useEffect(() => {
    registerExpandTrigger?.(() => setIsExpanded(true))
  }, [registerExpandTrigger])

  const prevExpandedRef = useRef(false)
  useEffect(() => {
    if (prevExpandedRef.current && !isExpanded && cardId) {
      const cardEl = document.querySelector(`[data-card-id="${cardId}"]`)?.closest('[tabindex="0"]') as HTMLElement | null
      cardEl?.focus()
    }
    prevExpandedRef.current = isExpanded
  }, [isExpanded, cardId])

  const { ref: lazyRef, isVisible } = useLazyMount('200px')
  const [flashKey, setFlashKey] = useState(0)
  const prevFlashType = useRef(flashType)
  const [isVisuallySpinning, setIsVisuallySpinning] = useState(false)
  const spinStartRef = useRef<number | null>(null)

  const [, setLastUpdatedTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setLastUpdatedTick(tick => tick + 1), LAST_UPDATED_TICK_MS)
    return () => clearInterval(id)
  }, [])

  const [childDataState, setChildDataState] = useState<CardDataState | null>(null)
  const skeletonTimedOut = useTimeoutFlag(LOADING_TIMEOUT_MS, checkIsDemoMode())
  const skeletonDelayPassed = useTimeoutFlag(SKELETON_DELAY_MS, checkIsDemoMode())
  const initialRenderTimedOut = useTimeoutFlag(INITIAL_RENDER_TIMEOUT_MS, checkIsDemoMode())
  const minSkeletonElapsed = useTimeoutFlag(MIN_SKELETON_DISPLAY_MS, checkIsDemoMode())
  const cardLoadingTimedOut = useConditionalTimeout(childDataState?.isLoading ?? false, CARD_LOADING_TIMEOUT_MS)

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
      }
      setIsVisuallySpinning(false)
      spinStartRef.current = null
    }
  }, [isRefreshing, contextIsRefreshing])

  useEffect(() => {
    if (flashType !== 'none' && flashType !== prevFlashType.current) {
      setFlashKey(k => k + 1)
    }
    prevFlashType.current = flashType
  }, [flashType])

  const getFlashClass = () => {
    switch (flashType) {
      case 'info': return 'animate-card-flash'
      case 'warning': return 'animate-card-flash-warning'
      case 'error': return 'animate-card-flash-error'
      default: return ''
    }
  }

  const collapseKey = cardId || `${cardType}-default`
  const { isCollapsed: hookCollapsed, setCollapsed: hookSetCollapsed } = useCardCollapse(collapseKey)
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

  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(() => checkIsDemoMode() || hasSavedCollapseState)
  const [collapseDelayPassed, setCollapseDelayPassed] = useState(() => checkIsDemoMode() || hasSavedCollapseState)
  const savedCollapsedState = externalCollapsed ?? hookCollapsed
  const isCollapsed = (hasCompletedInitialLoad && collapseDelayPassed) ? savedCollapsedState : false
  const isCollapsedRef = useRef(isCollapsed)
  const onCollapsedChangeRef = useRef(onCollapsedChange)

  useEffect(() => { isCollapsedRef.current = isCollapsed }, [isCollapsed])
  useEffect(() => { onCollapsedChangeRef.current = onCollapsedChange }, [onCollapsedChange])

  const setCollapsed = useCallback((collapsed: boolean | ((prev: boolean) => boolean)) => {
    const nextCollapsed = typeof collapsed === 'function' ? collapsed(isCollapsedRef.current) : collapsed
    onCollapsedChangeRef.current?.(nextCollapsed)
    hookSetCollapsed(nextCollapsed)
  }, [hookSetCollapsed])

  const [showSummary, setShowSummary] = useState(false)
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([])
  const { snoozeSwap } = useSnoozedCards()
  const { isDemoMode: globalDemoMode } = useDemoMode()
  const isModeSwitching = useIsModeSwitching()
  const isDemoExempt = DEMO_EXEMPT_CARDS.has(cardType)
  const isDemoMode = globalDemoMode && !isDemoExempt && !forceLive

  const reportCallback = useCallback((state: CardDataState) => {
    setChildDataState(prev => {
      if (prev && prev.isFailed === state.isFailed && prev.consecutiveFailures === state.consecutiveFailures && prev.errorMessage === state.errorMessage && prev.isLoading === state.isLoading && prev.isRefreshing === state.isRefreshing && prev.hasData === state.hasData && prev.isDemoData === state.isDemoData && prev.lastUpdated === state.lastUpdated) {
        return prev
      }
      return state
    })
  }, [])
  const reportCtx = useMemo(() => ({ report: reportCallback }), [reportCallback])

  const effectiveIsFailed = isFailed || childDataState?.isFailed || cardLoadingTimedOut
  const effectiveConsecutiveFailures = consecutiveFailures || childDataState?.consecutiveFailures || (cardLoadingTimedOut ? 1 : 0)
  const effectiveErrorMessage = childDataState?.errorMessage || undefined
  const effectiveIsLoading = (childDataState?.isLoading && !cardLoadingTimedOut) || (childDataState === null && !initialRenderTimedOut && !skeletonTimedOut) || (!minSkeletonElapsed && childDataState === null)
  const effectiveHasData = cardLoadingTimedOut ? true : (childDataState?.hasData ?? (childDataState === null ? ((initialRenderTimedOut || skeletonTimedOut) && minSkeletonElapsed) : (childDataState?.isLoading ? false : true)))
  const effectiveIsDemoData = forceLive ? false : (childDataState?.isDemoData ?? isDemoData ?? false)
  const childExplicitlyNotDemo = childDataState?.isDemoData === false
  const showDemoIndicator = !effectiveIsLoading && (effectiveIsDemoData || (isDemoMode && !childExplicitlyNotDemo))
  const forceSkeletonForModeSwitching = isModeSwitching && !isDemoExempt
  const effectiveSkeletonType = skeletonType || 'list'
  const wantsToShowSkeleton = forceSkeletonForModeSwitching
  const shouldShowSkeleton = (wantsToShowSkeleton && skeletonDelayPassed) || forceSkeletonForModeSwitching
  const effectiveLastUpdated = lastUpdated ?? childDataState?.lastUpdated
  const showHeaderRefreshIndicator = !onRefresh && (isRefreshing || isVisuallySpinning || effectiveIsLoading)
  const showInstallCta = showDemoIndicator && !shouldShowSkeleton && !DEMO_EXEMPT_CARDS.has(cardType)

  useEffect(() => {
    if (!hasCompletedInitialLoad && (effectiveHasData || initialRenderTimedOut || skeletonTimedOut || effectiveIsDemoData || isDemoMode)) {
      setHasCompletedInitialLoad(true)
    }
  }, [hasCompletedInitialLoad, effectiveHasData, initialRenderTimedOut, skeletonTimedOut, effectiveIsDemoData, isDemoMode])

  useEffect(() => {
    if (hasCompletedInitialLoad && !collapseDelayPassed) {
      const timer = setTimeout(() => setCollapseDelayPassed(true), COLLAPSE_DELAY_MS)
      return () => clearTimeout(timer)
    }
  }, [hasCompletedInitialLoad, collapseDelayPassed])

  const messages = externalMessages ?? localMessages
  const title = t(`titles.${cardType}`, CARD_TITLES[cardType] || '') || customTitle || cardType
  const description = t(`descriptions.${cardType}`, CARD_DESCRIPTIONS[cardType] || '')
  const swapType = pendingSwap?.newType || ''
  const newTitle = pendingSwap?.newTitle || t(`titles.${swapType}`, CARD_TITLES[swapType] || '') || swapType
  const cardIconConfig = CARD_ICONS[cardType]
  const ResolvedIcon = icon || cardIconConfig?.icon
  const resolvedIconColor = iconColor || cardIconConfig?.color || 'text-foreground'

  useEffect(() => {
    if (!pendingSwap) return
    const updateTime = () => {
      const now = Date.now()
      const swapTime = pendingSwap.swapAt.getTime()
      const remaining = Math.max(0, Math.floor((swapTime - now) / 1000))
      if (remaining === 0 && onSwap) onSwap(pendingSwap.newType)
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
    if (pendingSwap && onSwap) onSwap(pendingSwap.newType)
  }

  const handleToggleCollapse = useCallback(() => setCollapsed(prev => !prev), [setCollapsed])
  const handleRefresh = useCallback(() => { onRefresh?.(); emitCardRefreshed(cardType) }, [onRefresh, cardType])
  const handleLoadingTimeoutRetry = useCallback(() => { onRefresh?.() }, [onRefresh])
  const handleExpandFullscreen = useCallback(() => { emitCardExpanded(cardType); setIsExpanded(true) }, [cardType])
  const handleOpenBugReport = useCallback(() => { setFullScreen(false); openBugReport() }, [setFullScreen, openBugReport])

  void messages
  void onChatMessage
  void onChatMessagesChange
  void setLocalMessages

  const cardExpandedValue = useMemo(() => ({ isExpanded, containerSize }), [isExpanded, containerSize])
  const forceLiveValue = useMemo(() => !!forceLive, [forceLive])

  return {
    isExpanded,
    setIsExpanded,
    containerSize,
    expandedContentRef,
    showBugReport,
    openBugReport,
    closeBugReport,
    showWidgetExport,
    openWidgetExport,
    closeWidgetExport,
    isCollapsed,
    setCollapsed,
    title,
    description,
    swapType,
    newTitle,
    ResolvedIcon,
    resolvedIconColor,
    isVisuallySpinning,
    shouldShowSkeleton,
    effectiveSkeletonType,
    skeletonRows: 3,
    showDemoIndicator,
    showInstallCta,
    effectiveHasData,
    effectiveIsLoading,
    effectiveIsFailed,
    effectiveConsecutiveFailures,
    effectiveErrorMessage,
    effectiveIsDemoData,
    effectiveLastUpdated,
    showHeaderRefreshIndicator,
    messages,
    localMessages,
    setLocalMessages,
    handleToggleCollapse,
    handleRefresh,
    handleLoadingTimeoutRetry,
    handleExpandFullscreen,
    handleOpenBugReport,
    handleSnooze,
    handleSwapNow,
    reportCtx,
    cardExpandedValue,
    forceLiveValue,
    flashKey,
    showSummary,
    setShowSummary,
    lazyRef,
    isVisible,
    getFlashClass,
    childDataState,
    cardLoadingTimedOut,
  }
}
