import type { TokenCategory, TokenUsage, TokenUsageByCategory, TokenAlertLevel } from './useTokenUsage.types'

export function getTokenAlertLevel(usage: Pick<TokenUsage, 'used' | 'limit' | 'warningThreshold' | 'criticalThreshold' | 'stopThreshold'>): TokenAlertLevel {
  if (usage.limit <= 0) return 'normal'

  const percentageUsed = usage.used / usage.limit
  const stopThreshold = usage.stopThreshold > 0 ? usage.stopThreshold : DEFAULT_SETTINGS.stopThreshold

  if (percentageUsed >= stopThreshold) return 'stopped'
  if (percentageUsed >= usage.criticalThreshold) return 'critical'
  if (percentageUsed >= usage.warningThreshold) return 'warning'
  return 'normal'
}

export function reconcileUsageBreakdown(totalUsed: number, byCategory: TokenUsageByCategory): TokenUsageByCategory {
  if (totalUsed === 0) {
    return { ...DEFAULT_BY_CATEGORY }
  }
  const knownCategories = byCategory.missions + byCategory.diagnose + byCategory.insights + byCategory.predictions
  const other = Math.max(totalUsed - knownCategories, 0)
  return other === byCategory.other ? byCategory : { ...byCategory, other }
}

export function getUsagePeriodKey(now = new Date()): string {
  return LOCAL_DATE_FORMATTER.format(now)
}

export function getNextResetDate(): string {
  const now = new Date()
  const nextReset = new Date(now.getFullYear(), now.getMonth(), now.getDate() + NEXT_RESET_DAY_OFFSET)
  return nextReset.toISOString()
}

/** Maximum token delta to attribute in a single poll cycle (prevents init spikes) */
export const MAX_SINGLE_DELTA_TOKENS = 50_000

/** Minimum valid stop threshold — prevents "AI Disabled" at 0% from corrupted localStorage */
export const MIN_STOP_THRESHOLD = 0.01

/** localStorage key for the persisted last-known total token count (agent restart detection) */
export const LAST_KNOWN_USAGE_KEY = 'kc:tokenUsage:lastKnown'

/** localStorage key for the persisted agent session marker (agent restart detection) */
export const AGENT_SESSION_KEY = 'kc:tokenUsage:agentSession'

/** Default category used when a delta arrives with no active operation */
export const DEFAULT_CATEGORY: TokenCategory = 'other'

/**
 * Maximum age (ms) of an unflushed pending delta before it MUST be sent to the
 * backend even if the threshold-based trigger has not fired. Keeping this short
 * means a logged-in user who closes the tab loses at most ~30s of attribution
 * if `sendBeacon` is unavailable.
 */
export const TOKEN_USAGE_FLUSH_INTERVAL_MS = 30_000

/**
 * Minimum total tokens accumulated across pending deltas before triggering a
 * flush. Caps backend write traffic on heavy-usage sessions: ~1 POST per
 * `TOKEN_USAGE_FLUSH_THRESHOLD` tokens of activity, regardless of how many
 * individual deltas the local agent reports.
 */
export const TOKEN_USAGE_FLUSH_THRESHOLD = 100

const SETTINGS_KEY = 'kubestellar-token-settings'
const CATEGORY_KEY = 'kubestellar-token-categories'
const PERIOD_KEY = 'kubestellar-token-period'
const SETTINGS_CHANGED_EVENT = 'kubestellar-token-settings-changed'
const POLL_INTERVAL_MS = 30_000
const LOCAL_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })

export const DEFAULT_SETTINGS = {
  limit: 500000000,
  warningThreshold: 0.7,
  criticalThreshold: 0.9,
  stopThreshold: 1.0,
}

const NEXT_RESET_DAY_OFFSET = 1

export const DEFAULT_BY_CATEGORY: TokenUsageByCategory = {
  missions: 0,
  diagnose: 0,
  insights: 0,
  predictions: 0,
  other: 0,
}

export const DEMO_TOKEN_USAGE = 1247832
export const DEMO_BY_CATEGORY: TokenUsageByCategory = {
  missions: 523000,
  diagnose: 312000,
  insights: 245832,
  predictions: 167000,
  other: 0,
}

// Export constants for tests
export const __mathConstants = {
  SETTINGS_KEY,
  CATEGORY_KEY,
  PERIOD_KEY,
  SETTINGS_CHANGED_EVENT,
  POLL_INTERVAL_MS,
}
