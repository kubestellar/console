import type { TokenCategory, TokenUsageByCategory } from './useTokenUsage.types'

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

export const SETTINGS_KEY = 'kubestellar-token-settings'
export const CATEGORY_KEY = 'kubestellar-token-categories'
export const PERIOD_KEY = 'kubestellar-token-period'
export const SETTINGS_CHANGED_EVENT = 'kubestellar-token-settings-changed'
export const POLL_INTERVAL_MS = 30_000 // Poll every 30 seconds

// Demo mode token usage - simulate realistic usage
export const DEMO_TOKEN_USAGE = 1247832 // ~25% of 5M limit
export const DEMO_BY_CATEGORY: TokenUsageByCategory = {
  missions: 523000,
  diagnose: 312000,
  insights: 245832,
  predictions: 167000,
  other: 0 }
