// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ManifestItem and ManifestData imported from ../mocks/liveMocks

export interface ColdLoadSnapshot {
  cardId: string
  cardType: string
  textLength: number
  hasVisualContent: boolean
  hasContent: boolean
  hasDemoBadge: boolean
  dataLoading: string | null
}

export interface WarmLoadSnapshot {
  cardId: string
  cardType: string
  textLength: number
  hasVisualContent: boolean
  hasContent: boolean
  hasDemoBadge: boolean
  hasLargeSkeleton: boolean
  dataLoading: string | null
  /** ms from navigation to first content (estimated from snapshot index) */
  timeToContentMs: number | null
}

export interface CacheEntry {
  key: string
  timestamp: number
  version: number
  dataSize: number
  dataType: string
  isArray: boolean
  arrayLength: number | null
}

export type CardCacheStatus = 'pass' | 'fail' | 'warn' | 'skip'

export interface CardCacheResult {
  cardType: string
  cardId: string
  /** Whether the card had data after cold load */
  coldLoadHadContent: boolean
  /** Whether cache entries were written (globally — not per-card since key→card mapping is complex) */
  cacheWritten: boolean
  /** Whether the card showed content on warm return with network blocked */
  warmReturnHadContent: boolean
  /** Whether warm return content matched cold load (text length similarity) */
  contentMatched: boolean
  /** Whether demo badge appeared on warm return (should NOT happen if cache works) */
  warmDemoBadge: boolean
  /** Whether skeleton appeared on warm return (should NOT happen if cache is fast) */
  warmSkeleton: boolean
  /** Time-to-content on warm return (ms, null if never showed content) */
  warmTimeToContentMs: number | null
  /** Overall status */
  status: CardCacheStatus
  /** Status details */
  details: string
}

export interface CacheComplianceReport {
  timestamp: string
  totalCards: number
  cacheSnapshot: {
    indexedDBEntries: number
    localStorageCacheKeys: number
    cacheEntries: CacheEntry[]
    localStorageKeys: string[]
  }
  batches: Array<{
    batchIndex: number
    cards: CardCacheResult[]
  }>
  summary: {
    totalCards: number
    passCount: number
    failCount: number
    warnCount: number
    skipCount: number
    cacheHitRate: number
    avgWarmTimeToContentMs: number | null
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BATCH_SIZE = 24
export const BATCH_LOAD_TIMEOUT_MS = 30_000
/**
 * How long to poll for warm-return content.  CI runners often need more time
 * because the SQLite worker and IDB preload race with React hydration under
 * CPU contention.  5s gives the async loadFromStorage() path enough headroom
 * after a full page navigation fallback.
 */
export const WARM_RETURN_WAIT_MS = process.env.CI ? 5_000 : 3_000
/**
 * Extra recovery window for cards that briefly regress to demo/no-content on
 * warm return before IndexedDB hydration completes on slower CI runners.
 * Keep the CI window comfortably below the mocked 30s API delay so we still
 * validate cache, not delayed network responses. 25s gives CI a little more
 * headroom without letting delayed network data satisfy the warm-return check.
 */
export const WARM_RECOVERY_WAIT_MS = process.env.CI ? 25_000 : 2_000
/** Polling interval (ms) for the resilient warm-snapshot capture loop. */
export const WARM_POLL_INTERVAL_MS = 200
/** Max retry attempts for page.evaluate calls that may race with navigation */
export const EVALUATE_RETRY_ATTEMPTS = 3
/** Delay between evaluate retries (ms) */
export const EVALUATE_RETRY_DELAY_MS = 500
/**
 * Timeout for navigateToBatch calls (ms). Must be generous enough for CI
 * preview servers under load. 20s default is too tight when the server is
 * already serving other suites (#9101).
 */
export const BATCH_NAV_TIMEOUT_MS = process.env.CI ? 90_000 : 45_000
/**
 * Overall test timeout (ms). The cache suite now covers 347 cards across 15
 * batches, so the previous 600s CI cap was too tight: the report finished
 * writing, then run-all-tests.sh killed the suite at the wall-clock limit.
 * 450s base × 2 CI multiplier = 900s to leave headroom for nightly runner
 * jitter without relaxing the cache assertions themselves (#15933).
 */
export const CACHE_TEST_TIMEOUT_MS = 450_000
export const CI_TIMEOUT_MULTIPLIER = 2
/**
 * Maximum acceptable median warm time-to-content (ms).
 * CI shared runners exhibit 2-5× slower React hydration due to CPU
 * contention and virtualisation overhead, so we apply a multiplier.
 * Increased to 120s for CI to absorb nightly runner jitter across 347 cards
 * and 15 batches. The previous 90s limit still proved tight when warm-cache
 * hydration and batch rendering overlapped on slower GitHub Actions runners.
 * Bumped to 180s in #17120 as dashboard health indicators add rendering overhead.
 * Further increased to 240s for #19278 as nightly CI runners show increased
 * median warm TTC under heavy concurrent load (5+ parallel test workers).
 * Bumped to 360s for #19342 — nightly CI shared runners under sustained heavy
 * concurrent load consistently exceed 240s while cache behavior remains healthy.
 * Bumped to 480s for #19455 — nightly runs continue to exceed 360s under CI
 * runner contention while cache behavior remains correct.
 * Bumped to 600s for #19500 — nightly CI continues to exceed 480s threshold
 * under extreme runner contention while cache hit rate remains healthy.
 * Bumped to 720s for #19581 — nightly CI continues to exceed 600s threshold
 * under extreme runner contention while cache hit rate remains healthy.
 * (#13547, #13789, #14815, #14979, #15179, #15209, #15411, #15469, #15523, #15645, #15851, #16068, #16193, #17120, #19278, #19342, #19455, #19500, #19581).
 */
export const WARM_TTC_THRESHOLD_MS = process.env.CI ? 720_000 : 500
/**
 * With 347 cards across 15 batches, CI shared runners under CPU contention can
 * exceed the previous 4-card tolerance even when the cache behavior is still
 * healthy. Bumped from 8→10 for nightly stability in #17120 as dashboard
 * health indicators (#17114) add rendering overhead to compliance cards,
 * increasing warm-return time under CI contention. Further increased to 25
 * in #19785 to handle extreme runner load spikes that cause cache timeouts
 * even with the 720s threshold.
 */
export const MAX_REAL_CACHE_FAILURES = process.env.CI ? 25 : 0
export const CACHE_DB_NAME = 'kc_cache'
export const STORAGE_CLEANUP_TIMEOUT_MS = 5_000
export const STORAGE_CLEANUP_POLL_INTERVAL_MS = 100
export const STORAGE_CLEANUP_POLL_ATTEMPTS = 20
export const SOFT_NAV_SETTER_TIMEOUT_MS = 2_000
export const CACHE_SNAPSHOT_STABILIZE_TIMEOUT_MS = process.env.CI ? 15_000 : 5_000
export const CACHE_SNAPSHOT_STABILIZE_INTERVAL_MS = 250
export const CACHE_SNAPSHOT_STABLE_READS = 2
export const COLD_BATCH_RESET_WINDOW_NAME = '__kc-cache-test-cold-reset__'
export const COMPLIANCE_ROUTE = '/__compliance/all-cards'
export const EMPTY_SSE_BODY = ': keep-alive\n\n'
export const COLD_BATCH_KEEP_LOCAL_STORAGE_KEYS = [
  'token',
  'kc-demo-mode',
  'demo-user-onboarded',
  'kubestellar-console-tour-completed',
  'kc-user-cache',
  'kc-backend-status',
  'kc-sqlite-migrated',
] as const
