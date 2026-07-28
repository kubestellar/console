/**
 * Token usage types and constants.
 *
 * Extracted from useTokenUsage.ts — see issue #15790 / #21605.
 */

/** Maximum token delta to attribute in a single poll cycle (prevents init spikes) */
export const MAX_SINGLE_DELTA_TOKENS = 50_000

/** Minimum valid stop threshold — prevents "AI Disabled" at 0% from corrupted localStorage */
export const MIN_STOP_THRESHOLD = 0.01

/** localStorage key for the persisted last-known total token count (agent restart detection) */
export const LAST_KNOWN_USAGE_KEY = 'kc:tokenUsage:lastKnown'

/** localStorage key for the persisted agent session marker (agent restart detection) */
export const AGENT_SESSION_KEY = 'kc:tokenUsage:agentSession'

/** Default category used when a delta arrives with no active operation */
export const DEFAULT_CATEGORY_VALUE = 'other' as const

/**
 * Maximum age (ms) of an unflushed pending delta before it MUST be sent to the
 * backend even if the threshold-based trigger has not fired.
 */
export const TOKEN_USAGE_FLUSH_INTERVAL_MS = 30_000

/**
 * Minimum total tokens accumulated across pending deltas before triggering a
 * flush.
 */
export const TOKEN_USAGE_FLUSH_THRESHOLD = 100

export const SETTINGS_KEY = 'kubestellar-token-settings'
export const CATEGORY_KEY = 'kubestellar-token-categories'
export const PERIOD_KEY = 'kubestellar-token-period'
export const SETTINGS_CHANGED_EVENT = 'kubestellar-token-settings-changed'
export const POLL_INTERVAL_MS = 30_000

export const DEFAULT_SETTINGS = {
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

// Demo mode token usage - simulate realistic usage
export const DEMO_TOKEN_USAGE = 1247832
export const DEMO_BY_CATEGORY: TokenUsageByCategory = {
  missions: 523000,
  diagnose: 312000,
  insights: 245832,
  predictions: 167000,
  other: 0,
}

export type TokenCategory = 'missions' | 'diagnose' | 'insights' | 'predictions' | 'other'

export interface TokenUsageByCategory {
  missions: number
  diagnose: number
  insights: number
  predictions: number
  other: number
}

export interface TokenUsage {
  used: number
  limit: number
  warningThreshold: number
  criticalThreshold: number
  stopThreshold: number
  resetDate: string
  byCategory: TokenUsageByCategory
}

export type TokenAlertLevel = 'normal' | 'warning' | 'critical' | 'stopped'
