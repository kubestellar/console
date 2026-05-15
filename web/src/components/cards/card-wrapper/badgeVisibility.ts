const COMPACT_FAILURE_STATUS_CARDS = new Set(['events_timeline'])

export interface LiveBadgeState {
  isLive?: boolean
  showDemoIndicator: boolean
  isFailed: boolean
}

export interface FailureBannerState {
  cardType: string
  isFailed: boolean
  isCollapsed: boolean
}

export function shouldShowLiveBadge({
  isLive,
  showDemoIndicator,
  isFailed,
}: LiveBadgeState): boolean {
  return !!isLive && !showDemoIndicator && !isFailed
}

export function shouldShowFailureBanner({
  cardType,
  isFailed,
  isCollapsed,
}: FailureBannerState): boolean {
  return isFailed && !isCollapsed && !COMPACT_FAILURE_STATUS_CARDS.has(cardType)
}
