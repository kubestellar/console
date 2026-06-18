import {
  DEFAULT_BY_CATEGORY,
  DEFAULT_CATEGORY,
  DEFAULT_SETTINGS,
  DEMO_BY_CATEGORY,
  DEMO_TOKEN_USAGE,
  MAX_SINGLE_DELTA_TOKENS,
  MIN_STOP_THRESHOLD,
  getNextResetDate,
  getTokenAlertLevel,
} from './accounting'
import {
  AGENT_SESSION_KEY,
  LAST_KNOWN_USAGE_KEY,
  PERIOD_KEY,
  TOKEN_USAGE_FLUSH_INTERVAL_MS,
  TOKEN_USAGE_FLUSH_THRESHOLD,
  getUsagePeriodKey,
  loadPersistedUsage,
  persistUsage,
} from './persistence'
import {
  addCategoryTokens,
  clearActiveTokenCategory,
  getActiveTokenCategories,
  setActiveTokenCategory,
  useTokenUsage,
} from './state'

export type { TokenAlertLevel, TokenCategory, TokenUsage, TokenUsageByCategory } from './types'
export { getTokenAlertLevel, useTokenUsage, addCategoryTokens, setActiveTokenCategory, clearActiveTokenCategory, getActiveTokenCategories }

export const __testables = {
  loadPersistedUsage,
  persistUsage,
  getNextResetDate,
  MAX_SINGLE_DELTA_TOKENS,
  MIN_STOP_THRESHOLD,
  LAST_KNOWN_USAGE_KEY,
  AGENT_SESSION_KEY,
  DEFAULT_CATEGORY,
  TOKEN_USAGE_FLUSH_INTERVAL_MS,
  TOKEN_USAGE_FLUSH_THRESHOLD,
  DEFAULT_SETTINGS,
  DEFAULT_BY_CATEGORY,
  DEMO_TOKEN_USAGE,
  DEMO_BY_CATEGORY,
  PERIOD_KEY,
  getUsagePeriodKey,
}
