/**
 * ACMM Scan Hook
 *
 * Fetches /api/acmm/scan?repo=owner/repo and returns the card-rules shape.
 * Powers the 4 cards on /acmm. One hook per repo — changing the repo
 * changes the cache key and triggers a fresh fetch.
 */

import { useCallback, useRef, useSyncExternalStore } from 'react'
import { useCache, type RefreshCategory } from '../lib/cache'
import { computeLevel, type LevelComputation } from '../lib/acmm/computeLevel'
import { computeRecommendations, type Recommendation } from '../lib/acmm/computeRecommendations'

const API_PATH = '/api/acmm/scan'
/** Scan results change slowly; 10-min refresh avoids GitHub rate limits. */
const REFRESH_CATEGORY: RefreshCategory = 'costs'

/**
 * ACMM scan timeout (issue #8978).
 *
 * A cold scan of a large repo (like kubestellar/console, ~1600 files) fans
 * out into up to 12 GitHub API calls from the Netlify Function: 1 repo info
 * + 1 full-tree fetch + up to 10 paginated search pages for weekly activity.
 * Each GitHub call has its own 15s timeout inside the function. The default
 * 10s browser fetch timeout (FETCH_DEFAULT_TIMEOUT_MS) was too tight and
 * aborted healthy live scans, making the UI show "request timed out" even
 * though the backend would eventually answer (and cache the result, so the
 * next visit worked). 30s covers the realistic worst case without hanging
 * the tab indefinitely.
 */
const ACMM_SCAN_TIMEOUT_MS = 30_000

export interface WeeklyActivity {
  week: string
  aiPrs: number
  humanPrs: number
  aiIssues: number
  humanIssues: number
}

export interface ACMMScanData {
  repo: string
  scannedAt: string
  detectedIds: string[]
  weeklyActivity: WeeklyActivity[]
}

export interface UseACMMScanResult {
  data: ACMMScanData
  detectedIds: Set<string>
  level: LevelComputation
  recommendations: Recommendation[]
  isLoading: boolean
  isRefreshing: boolean
  isDemoData: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
  /** Bypasses the server blob cache for one fetch — use for user-initiated refresh */
  forceRefetch: () => Promise<void>
}

const DEFAULT_REPO = 'kubestellar/console'

function emptyScan(repo: string): ACMMScanData {
  return {
    repo,
    scannedAt: '',
    detectedIds: [],
    weeklyActivity: [],
  }
}

function demoScan(repo: string): ACMMScanData {
  const WEEKS = 16
  const weeks: WeeklyActivity[] = []
  for (let i = WEEKS - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i * 7)
    const year = d.getUTCFullYear()
    const jan1 = new Date(Date.UTC(year, 0, 1))
    const week = Math.ceil(
      ((d.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000) + 1) / 7,
    )
    weeks.push({
      week: `${year}-W${String(week).padStart(2, '0')}`,
      aiPrs: 25 + Math.floor(Math.sin(i) * 5 + 10),
      humanPrs: 4 + Math.floor(Math.cos(i) * 2 + 1),
      aiIssues: 12 + Math.floor(Math.sin(i * 2) * 3),
      humanIssues: 3,
    })
  }
  // Issue #8978: detectedIds must use the CURRENT criterion IDs from
  // web/src/lib/acmm/sources/acmm.ts — the previous list used legacy short
  // IDs (acmm:pr-template, acmm:style-config, …) that no longer exist in
  // the taxonomy, so the demo fallback computed to L1 even for well-tooled
  // repos like kubestellar/console which should land at L5. Keep this set
  // in sync with acmm-scan.mts when criteria IDs change.
  return {
    repo,
    scannedAt: new Date().toISOString(),
    detectedIds: [
      // L0 prerequisites
      'acmm:prereq-test-suite',
      'acmm:prereq-e2e',
      'acmm:prereq-cicd',
      'acmm:prereq-pr-template',
      'acmm:prereq-issue-template',
      'acmm:prereq-contrib-guide',
      'acmm:prereq-code-style',
      'acmm:prereq-coverage-gate',
      // L2 — Instructed
      'acmm:claude-md',
      'acmm:copilot-instructions',
      'acmm:agents-md',
      'acmm:prompts-catalog',
      'acmm:editor-config',
      // L3 — Measured / Enforced
      'acmm:pr-acceptance-metric',
      'acmm:pr-review-rubric',
      'acmm:quality-dashboard',
      'acmm:ci-matrix',
      // L4 — Adaptive / Structured
      'acmm:auto-qa-tuning',
      'acmm:nightly-compliance',
      'acmm:auto-label',
      'acmm:ai-fix-workflow',
      'acmm:tier-classifier',
      'acmm:security-ai-md',
      // L5 — Semi-Automated
      'acmm:github-actions-ai',
      'acmm:auto-qa-self-tuning',
      'acmm:public-metrics',
      'acmm:policy-as-code',
      // L6 — Fully Autonomous
      'acmm:strategic-dashboard',
      // Other sources
      'fullsend:test-coverage',
      'fullsend:ci-cd-maturity',
      'aef:session-continuity',
      'aef:cross-tool-config',
    ],
    weeklyActivity: weeks,
  }
}

/**
 * Per-repo demo-fallback flag store.
 *
 * The Netlify Function (`/api/acmm/scan`) returns HTTP 200 with a
 * `demoFallback: true` body when its live GitHub fetch fails (missing
 * GITHUB_TOKEN, rate-limited, network error, etc.). The response still
 * contains a plausible demo catalog so the dashboard renders, but the
 * user MUST be told it's demo data — otherwise they see a working-looking
 * scan of kubestellar/console that doesn't match reality (bug Issue 8848).
 *
 * We can't surface that flag through `useCache` (which only tracks its
 * own demo-fallback path — triggered when the fetcher errors, not when
 * it succeeds with a demoFallback-flagged body). Instead, we keep a
 * lightweight per-repo store updated by the fetcher and subscribe to it
 * via useSyncExternalStore so any re-render picks up the latest flag.
 */
const demoFallbackByRepo = new Map<string, boolean>()
const demoFallbackSubs = new Set<() => void>()

function subscribeDemoFallback(notify: () => void): () => void {
  demoFallbackSubs.add(notify)
  return () => {
    demoFallbackSubs.delete(notify)
  }
}

function setDemoFallback(repo: string, value: boolean): void {
  const prev = demoFallbackByRepo.get(repo) ?? false
  if (prev === value) return
  demoFallbackByRepo.set(repo, value)
  for (const notify of demoFallbackSubs) notify()
}

function getDemoFallback(repo: string): boolean {
  return demoFallbackByRepo.get(repo) ?? false
}

async function fetchACMMScan(repo: string, force: boolean): Promise<ACMMScanData> {
  const qs = force ? `&force=true` : ''
  const res = await fetch(`${API_PATH}?repo=${encodeURIComponent(repo)}${qs}`, {
    signal: AbortSignal.timeout(ACMM_SCAN_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`ACMM scan failed: ${res.status} ${res.statusText}`)
  }
  // Safety net: if the response isn't JSON (e.g. older builds without the Go
  // handler, or an SPA catch-all returning index.html), throw a clean error
  // so the card falls back to demo data instead of a JSON parse crash.
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    throw new Error('ACMM scan is not available on this deployment — showing demo data')
  }
  const body = (await res.json()) as ACMMScanData & { demoFallback?: boolean }
  // Track the server-signalled demoFallback flag so the hook can expose it
  // via isDemoData even though the HTTP call itself succeeded (see bug Issue 8848:
  // the Netlify function returns 200 with demoFallback:true when upstream
  // GitHub is unreachable, and without this signal the UI silently shows the
  // demo catalog as if it were a live scan of the user's repo).
  setDemoFallback(repo, Boolean(body.demoFallback))
  return body
}

export function useCachedACMMScan(repo: string = DEFAULT_REPO): UseACMMScanResult {
  /** Set to true for the next fetch to bypass the server blob cache (user-triggered refresh). */
  const forceNextRef = useRef(false)

  const cacheResult = useCache<ACMMScanData>({
    key: `acmm:scan:${repo}`,
    category: REFRESH_CATEGORY,
    initialData: emptyScan(repo),
    demoData: demoScan(repo),
    fetcher: () => {
      const force = forceNextRef.current
      forceNextRef.current = false
      return fetchACMMScan(repo, force)
    },
    liveInDemoMode: true,
  })

  const refetch = cacheResult.refetch
  const forceRefetch = useCallback(async () => {
    forceNextRef.current = true
    await refetch()
  }, [refetch])

  // Subscribe to the per-repo demo-fallback flag set by the fetcher. This
  // re-renders the hook whenever the Netlify Function flips between live
  // and demo-fallback responses for this repo.
  const serverDemoFallback = useSyncExternalStore(
    subscribeDemoFallback,
    () => getDemoFallback(repo),
    () => false,
  )

  // When the Netlify Function isn't available (localhost / cluster deploy),
  // the fetcher throws "ACMM scan is not available on this deployment".
  // Detect this from the error string (available on the FIRST failure) rather
  // than isFailed (which requires 3 consecutive failures to flip). Once
  // detected, substitute demo data and suppress all error/failure indicators
  // so the cards render with the standard Demo badge instead of "Refresh failed".
  const apiUnavailable =
    (cacheResult.error?.includes('not available') ?? false) ||
    (cacheResult.isFailed && cacheResult.data.detectedIds.length === 0)
  const effectiveData = apiUnavailable ? demoScan(repo) : cacheResult.data

  const detectedIds = new Set(effectiveData.detectedIds ?? [])
  const level = computeLevel(detectedIds)
  const recommendations = computeRecommendations(detectedIds, level)

  const isDemoData =
    (cacheResult.isDemoFallback && !cacheResult.isLoading) ||
    apiUnavailable ||
    serverDemoFallback

  return {
    data: effectiveData,
    detectedIds,
    level,
    recommendations,
    isLoading: apiUnavailable ? false : cacheResult.isLoading,
    isRefreshing: apiUnavailable ? false : cacheResult.isRefreshing,
    isDemoData,
    error: apiUnavailable ? null : cacheResult.error,
    isFailed: apiUnavailable ? false : cacheResult.isFailed,
    consecutiveFailures: apiUnavailable ? 0 : cacheResult.consecutiveFailures,
    lastRefresh: cacheResult.lastRefresh,
    refetch: cacheResult.refetch,
    forceRefetch,
  }
}
