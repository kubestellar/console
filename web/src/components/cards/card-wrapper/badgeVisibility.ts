export interface LiveBadgeState {
  isLive?: boolean
  showDemoIndicator: boolean
  isFailed: boolean
}

export function shouldShowLiveBadge({
  isLive,
  showDemoIndicator,
  isFailed,
}: LiveBadgeState): boolean {
  return !!isLive && !showDemoIndicator && !isFailed
}
