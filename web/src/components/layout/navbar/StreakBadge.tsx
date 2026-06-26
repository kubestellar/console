/**
 * StreakBadge — tiny flame + number in the navbar showing consecutive
 * daily visits. Only visible when streak >= 2 (showing "1" is meaningless).
 *
 * Intentionally minimal: text-xs text-muted-foreground. Blends in,
 * doesn't demand attention.
 */

import { useTranslation } from 'react-i18next'
import { useVisitStreak } from '../../../hooks/useVisitStreak'
import { useAuth } from '../../../lib/auth'

/** Minimum streak to display the badge — showing "1" is meaningless */
const MIN_DISPLAY_STREAK = 2

export function StreakBadge() {
  const { t } = useTranslation()
  const { streak } = useVisitStreak()
  const { isAuthenticated } = useAuth()

  // Hide badge until authentication is confirmed to prevent flash
  // before OAuth redirect when session has expired (#4541)
  if (!isAuthenticated || streak < MIN_DISPLAY_STREAK) return null

  return (
    <span
      className="text-xs text-muted-foreground select-none"
      title={t('layout.navbar.dayStreak', { days: streak })}
    >
      {'\uD83D\uDD25'} {streak}
    </span>
  )
}
