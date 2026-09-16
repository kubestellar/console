// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ManifestItem and ManifestData imported from ../mocks/liveMocks

export interface CardStateSnapshot {
  timestamp: number
  dataLoading: string | null
  dataEffectiveLoading: string | null
  hasDemoBadge: boolean
  hasYellowBorder: boolean
  hasLargeSkeleton: boolean
  hasSpinningRefresh: boolean
  textContentLength: number
  hasVisualContent: boolean
}

export type CriterionStatus = 'pass' | 'fail' | 'warn' | 'skip'

export interface CriterionResult {
  criterion: string
  status: CriterionStatus
  details: string
}

export interface CardComplianceResult {
  cardType: string
  cardId: string
  criteria: Record<string, CriterionResult>
  overallStatus: CriterionStatus
}

export interface BatchResult {
  batchIndex: number
  cards: CardComplianceResult[]
}

export interface ComplianceReport {
  timestamp: string
  totalCards: number
  batches: BatchResult[]
  summary: {
    totalCards: number
    passCount: number
    failCount: number
    warnCount: number
    skipCount: number
    criterionPassRates: Record<string, number>
  }
  gapAnalysis: GapAnalysisEntry[]
}

export interface GapAnalysisEntry {
  area: string
  observation: string
  suggestedImprovement: string
  priority: 'high' | 'medium' | 'low'
}

export interface ComplianceState {
  totalCards: number
  totalBatches: number
  allBatchResults: BatchResult[]
  setupDone: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// CI runners are slower than local dev — scale timeouts accordingly
export const IS_CI = !!process.env.CI
export const CI_TIMEOUT_MULTIPLIER = 2

export const BATCH_SIZE = 24
export const BATCH_LOAD_TIMEOUT_MS = IS_CI ? 45_000 : 30_000
export const BATCH_NAV_TIMEOUT_MS = IS_CI ? 90_000 : 45_000 // navigateToBatch timeout — generous for cold Vite compiles
export const MONITOR_POLL_INTERVAL_MS = 50
export const WARM_RETURN_WAIT_MS = 3_000

// Per-batch test timeout — each batch processes ~24 cards. 5 min base × 2 CI multiplier = 10 min in CI.
// Much tighter than the previous 40-minute monolithic timeout so a flaky batch can't block a runner.
// See Issue 9088 for the split rationale.
export const PER_BATCH_TIMEOUT_MS = 5 * 60 * 1000 // 5 min base, doubled in CI via CI_TIMEOUT_MULTIPLIER

// Upper bound on the number of batches we pre-declare tests for. 150+ cards at
// BATCH_SIZE=24 gives ~7 batches; we pre-declare more so the manifest can grow
// without editing this file. Extra tests short-circuit when their batch is empty.
export const MAX_EXPECTED_BATCHES = 16

// Network settle timeout after warmup or navigating away — best-effort, not blocking.
export const NETWORK_SETTLE_TIMEOUT_MS = 10_000
export const NAV_AWAY_SETTLE_TIMEOUT_MS = 5_000

// Warmup navigation timeout — 180s handles cold Vite module compilation of ~174 card modules.
export const WARMUP_NAV_TIMEOUT_MS = 180_000

// Retry attempts + delay for the in-page compliance monitor when a navigation
// destroys the execution context mid-read.
export const MONITOR_STOP_MAX_RETRIES = 3
export const MONITOR_STOP_RETRY_DELAY_MS = 500

// Grace period snapshots for criterion G — 500ms (10 × 50ms poll interval) of
// async cache hydration (SQLite Worker init, localStorage parse).
export const WARM_GRACE_SNAPSHOTS = 10

// Early-window snapshots for criterion I — ~200ms at 50ms poll interval.
export const CRITERION_I_EARLY_SNAPSHOTS = 4

// Minimum text length that counts as "content" (vs. empty skeleton).
export const MIN_CONTENT_TEXT_LENGTH = 10

// Threshold: criteria with a skip rate above this (fraction) are flagged as under-covered.
export const GAP_SKIP_RATE_THRESHOLD = 0.5
export const GAP_SKIP_RATE_HIGH_PRIORITY = 0.8
// Threshold: minimum number of demo-badge failures before we surface a cluster gap.
export const GAP_DEMO_BADGE_MIN_FAIL_COUNT = 3
export const GAP_DEMO_BADGE_SAMPLE_LIMIT = 5
// Threshold: SSE adoption below this fraction surfaces as a gap.
export const GAP_SSE_ADOPTION_THRESHOLD = 0.3
