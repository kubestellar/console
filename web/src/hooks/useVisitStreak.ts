/**
 * useVisitStreak — tracks consecutive daily visits in localStorage.
 *
 * On load:
 *   - If lastVisitDate is yesterday, increment streak.
 *   - If lastVisitDate is today, no change.
 *   - If lastVisitDate is older (or missing), reset streak to 1.
 *
 * Fires GA4 `ksc_streak_day` event when the streak increments.
 */

import { useState } from 'react'
import { safeGetJSON, safeSetJSON } from '../lib/utils/localStorage'
import { STORAGE_KEY_VISIT_STREAK } from '../lib/constants/storage'
import { emitStreakDay } from '../lib/analytics'
import { MS_PER_DAY } from '../lib/constants/time'

interface StreakData {
  /** Last visit date in YYYY-MM-DD format */
  lastVisitDate: string
  /** Current consecutive-day streak count */
  currentStreak: number
}

/** Format a Date as YYYY-MM-DD in the user's local timezone */
function toDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Calculate the streak on mount (runs once via useState initializer) */
function calculateStreak(): number {
  const today = toDateString(new Date())
  const stored = safeGetJSON<StreakData>(STORAGE_KEY_VISIT_STREAK)

  if (!stored || !stored.lastVisitDate) {
    // First visit ever — start at 1
    safeSetJSON<StreakData>(STORAGE_KEY_VISIT_STREAK, {
      lastVisitDate: today,
      currentStreak: 1,
    })
    return 1
  }

  if (stored.lastVisitDate === today) {
    // Already visited today — no change
    return stored.currentStreak
  }

  // Check if lastVisitDate was yesterday
  const lastDate = new Date(stored.lastVisitDate)
  const now = new Date()
  // Normalize both to midnight to compare calendar days
  const lastMidnight = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate())
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffMs = todayMidnight.getTime() - lastMidnight.getTime()

  /** Exactly one calendar day difference */
  const isYesterday = diffMs === MS_PER_DAY

  const newStreak = isYesterday ? stored.currentStreak + 1 : 1

  safeSetJSON<StreakData>(STORAGE_KEY_VISIT_STREAK, {
    lastVisitDate: today,
    currentStreak: newStreak,
  })

  // Fire GA4 event when streak actually increments (not resets)
  if (isYesterday) {
    emitStreakDay(newStreak)
  }

  return newStreak
}

export function useVisitStreak(): { streak: number } {
  const [streak] = useState(calculateStreak)
  return { streak }
}
