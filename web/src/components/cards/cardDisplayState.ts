import type { CardDataState } from './CardDataContext'
import type { CardSkeletonProps } from '@/lib/cards/CardComponents'
import { DEMO_EXEMPT_CARDS } from './cardMetadata'

/** Inputs required to derive a card's effective display state. */
export interface CardDisplayStateInput {
  cardType: string
  childDataState: CardDataState | null
  // Prop-level flags
  isFailed?: boolean
  consecutiveFailures?: number
  isDemoData?: boolean
  forceLive?: boolean
  isRefreshing?: boolean
  lastUpdated?: Date | null
  onRefresh?: () => void
  skeletonType?: CardSkeletonProps['type']
  // Timeout flags
  cardLoadingTimedOut: boolean
  initialRenderTimedOut: boolean
  skeletonTimedOut: boolean
  minSkeletonElapsed: boolean
  skeletonDelayPassed: boolean
  // Demo / mode state
  isDemoMode: boolean
  isDemoExempt: boolean
  isModeSwitching: boolean
  isVisuallySpinning: boolean
}

/** Effective (merged) display state consumed by the CardWrapper render. */
export interface CardDisplayState {
  effectiveIsFailed: boolean
  effectiveConsecutiveFailures: number
  effectiveErrorMessage: string | undefined
  effectiveIsLoading: boolean
  effectiveHasData: boolean
  effectiveIsDemoData: boolean
  showDemoIndicator: boolean
  forceSkeletonForOffline: boolean
  effectiveSkeletonType: CardSkeletonProps['type']
  shouldShowSkeleton: boolean
  effectiveLastUpdated: Date | null | undefined
  showHeaderRefreshIndicator: boolean
  showInstallCta: boolean
}

/**
 * Merges child-reported data state with props and timeout flags into the set of
 * effective values used to render a card. Pure function — extracted from
 * CardWrapper for readability and testability (#22959).
 */
export function deriveCardDisplayState(input: CardDisplayStateInput): CardDisplayState {
  const {
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
  } = input

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

  return {
    effectiveIsFailed: !!effectiveIsFailed,
    effectiveConsecutiveFailures,
    effectiveErrorMessage,
    effectiveIsLoading: !!effectiveIsLoading,
    effectiveHasData: !!effectiveHasData,
    effectiveIsDemoData,
    showDemoIndicator,
    forceSkeletonForOffline,
    effectiveSkeletonType,
    shouldShowSkeleton,
    effectiveLastUpdated,
    showHeaderRefreshIndicator: !!showHeaderRefreshIndicator,
    showInstallCta,
  }
}
