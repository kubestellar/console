import type { TokenAlertLevel, TokenCategory, TokenUsage, TokenUsageByCategory, TokenUsageSettings } from './types'

/** Maximum token delta to attribute in a single poll cycle (prevents init spikes) */
export const MAX_SINGLE_DELTA_TOKENS = 50_000

/** Minimum valid stop threshold — prevents "AI Disabled" at 0% from corrupted localStorage */
export const MIN_STOP_THRESHOLD = 0.01

/** Default category used when a delta arrives with no active operation */
export const DEFAULT_CATEGORY: TokenCategory = 'other'

const NEXT_RESET_DAY_OFFSET = 1

export const DEFAULT_SETTINGS: TokenUsageSettings = {
  limit: 500000000,
  warningThreshold: 0.7,
  criticalThreshold: 0.9,
  stopThreshold: 1.0,
}

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

export function getNextResetDate(): string {
  const now = new Date()
  const nextReset = new Date(now.getFullYear(), now.getMonth(), now.getDate() + NEXT_RESET_DAY_OFFSET)
  return nextReset.toISOString()
}
