/**
 * StreakBadge — tiny flame + number in the navbar showing consecutive
 * daily visits. Only visible when streak >= 2 (showing "1" is meaningless).
 *
 * Intentionally minimal: text-xs text-muted-foreground. Blends in,
 * doesn't demand attention.
 */

import { useVisitStreak } from '../../../hooks/useVisitStreak'

/** Minimum streak to display the badge — showing "1" is meaningless */
const MIN_DISPLAY_STREAK = 2

export function StreakBadge() {
  const { streak } = useVisitStreak()

  if (streak < MIN_DISPLAY_STREAK) return null

  return (
    <span
      className="text-xs text-muted-foreground select-none"
      title={`${streak}-day streak`}
    >
      {'\uD83D\uDD25'} {streak}
    </span>
  )
}
