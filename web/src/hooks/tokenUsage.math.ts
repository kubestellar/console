/**
 * Token-budget math utilities and storage helpers.
 *
 * Extracted from useTokenUsage.ts — see issue #15790 / #21605.
 */
import {
  MIN_STOP_THRESHOLD,
  DEFAULT_SETTINGS,
  DEFAULT_BY_CATEGORY,
  CATEGORY_KEY,
  PERIOD_KEY,
  LAST_KNOWN_USAGE_KEY,
  AGENT_SESSION_KEY,
  type TokenCategory,
  type TokenUsage,
  type TokenUsageByCategory,
  type TokenAlertLevel,
} from './tokenUsage.types'

const NEXT_RESET_DAY_OFFSET = 1
const LOCAL_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })

export function getTokenAlertLevel(
  usage: Pick<TokenUsage, 'used' | 'limit' | 'warningThreshold' | 'criticalThreshold' | 'stopThreshold'>,
): TokenAlertLevel {
  if (usage.limit <= 0) return 'normal'
  const percentageUsed = usage.used / usage.limit
  const stopThreshold = usage.stopThreshold > 0 ? usage.stopThreshold : DEFAULT_SETTINGS.stopThreshold
  if (percentageUsed >= stopThreshold) return 'stopped'
  if (percentageUsed >= usage.criticalThreshold) return 'critical'
  if (percentageUsed >= usage.warningThreshold) return 'warning'
  return 'normal'
}

export function reconcileUsageBreakdown(totalUsed: number, byCategory: TokenUsageByCategory): TokenUsageByCategory {
  if (totalUsed === 0) return { ...DEFAULT_BY_CATEGORY }
  const knownCategories = byCategory.missions + byCategory.diagnose + byCategory.insights + byCategory.predictions
  const other = Math.max(totalUsed - knownCategories, 0)
  return other === byCategory.other ? byCategory : { ...byCategory, other }
}

export function getNextResetDate(): string {
  const now = new Date()
  const nextReset = new Date(now.getFullYear(), now.getMonth(), now.getDate() + NEXT_RESET_DAY_OFFSET)
  return nextReset.toISOString()
}

export function getUsagePeriodKey(now = new Date()): string {
  return LOCAL_DATE_FORMATTER.format(now)
}

export function resetUsagePeriodState(
  currentUsagePeriodRef: { value: string },
  sharedUsageRef: { value: TokenUsage },
  pendingDeltasRef: { value: Map<TokenCategory, number> },
  pendingDeltaTotalRef: { value: number },
  flushTimerIdRef: { value: ReturnType<typeof setTimeout> | null },
  lastKnownUsageRef: { value: number | null },
  notifySubscribers: () => void,
  nextPeriod: string,
  forceNotify = false,
): void {
  currentUsagePeriodRef.value = nextPeriod
  sharedUsageRef.value = {
    ...sharedUsageRef.value,
    used: 0,
    resetDate: getNextResetDate(),
    byCategory: { ...DEFAULT_BY_CATEGORY },
  }
  lastKnownUsageRef.value = null
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CATEGORY_KEY)
    localStorage.removeItem(LAST_KNOWN_USAGE_KEY)
    localStorage.setItem(PERIOD_KEY, currentUsagePeriodRef.value)
  }
  if (flushTimerIdRef.value !== null) {
    clearTimeout(flushTimerIdRef.value)
    flushTimerIdRef.value = null
  }
  pendingDeltasRef.value.clear()
  pendingDeltaTotalRef.value = 0
  if (forceNotify) notifySubscribers()
}

/**
 * Safely load the persisted last-known usage + agent session marker from
 * localStorage. Returns null fields if localStorage is unavailable.
 */
export function loadPersistedUsage(): { lastKnown: number | null; sessionId: string | null } {
  if (typeof window === 'undefined') return { lastKnown: null, sessionId: null }
  try {
    const rawLastKnown = localStorage.getItem(LAST_KNOWN_USAGE_KEY)
    const rawSession = localStorage.getItem(AGENT_SESSION_KEY)
    const lastKnown = rawLastKnown !== null ? Number(rawLastKnown) : null
    return {
      lastKnown: lastKnown !== null && Number.isFinite(lastKnown) ? lastKnown : null,
      sessionId: rawSession,
    }
  } catch {
    return { lastKnown: null, sessionId: null }
  }
}

/**
 * Safely persist the last-known usage baseline + agent session marker to
 * localStorage. Silently ignores quota/SSR/private-mode errors.
 */
export function persistUsage(lastKnown: number, sessionId: string | null): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, String(lastKnown))
    if (sessionId !== null) {
      localStorage.setItem(AGENT_SESSION_KEY, sessionId)
    }
  } catch {
    // Quota exceeded / private mode — ignore, this is best-effort.
  }
}

export { MIN_STOP_THRESHOLD, DEFAULT_SETTINGS, DEFAULT_BY_CATEGORY }
