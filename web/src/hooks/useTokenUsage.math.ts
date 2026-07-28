// Pure token-budget math helpers extracted from useTokenUsage.ts so the hook
// implementation file stays under the max-lines limit (tracked by #15790,
// split by #21605). These functions have no side effects and no dependency
// on the hook's module-level singleton state.

import type { TokenAlertLevel, TokenUsage, TokenUsageByCategory } from './useTokenUsage.types'

export const LOCAL_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })

export const DEFAULT_SETTINGS = {
  limit: 500000000, // 500M tokens daily default
  warningThreshold: 0.7, // 70%
  criticalThreshold: 0.9, // 90%
  stopThreshold: 1.0, // 100%
}

const NEXT_RESET_DAY_OFFSET = 1

export const DEFAULT_BY_CATEGORY: TokenUsageByCategory = {
  missions: 0,
  diagnose: 0,
  insights: 0,
  predictions: 0,
  other: 0 }

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
  // If no tokens used, reset all categories to 0 (prevents stale demo/cached data from showing)
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
