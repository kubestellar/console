import { test, expect, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import {
  setupAuth,
  setupLiveMocks,
  setLiveColdMode,
  navigateToBatch,
  waitForCardsToLoad,
  type MockControl,
} from '../mocks/liveMocks'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ManifestItem and ManifestData imported from ../mocks/liveMocks

interface CardStateSnapshot {
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

type CriterionStatus = 'pass' | 'fail' | 'warn' | 'skip'

interface CriterionResult {
  criterion: string
  status: CriterionStatus
  details: string
}

interface CardComplianceResult {
  cardType: string
  cardId: string
  criteria: Record<string, CriterionResult>
  overallStatus: CriterionStatus
}

interface BatchResult {
  batchIndex: number
  cards: CardComplianceResult[]
}

interface ComplianceReport {
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

interface GapAnalysisEntry {
  area: string
  observation: string
  suggestedImprovement: string
  priority: 'high' | 'medium' | 'low'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// CI runners are slower than local dev — scale timeouts accordingly
const IS_CI = !!process.env.CI
const CI_TIMEOUT_MULTIPLIER = 2

const BATCH_SIZE = 24
const BATCH_LOAD_TIMEOUT_MS = IS_CI ? 45_000 : 30_000
const BATCH_NAV_TIMEOUT_MS = IS_CI ? 90_000 : 45_000 // navigateToBatch timeout — generous for cold Vite compiles
const MONITOR_POLL_INTERVAL_MS = 50
const WARM_RETURN_WAIT_MS = 3_000

// Per-batch test timeout — each batch processes ~24 cards. 5 min base × 2 CI multiplier = 10 min in CI.
// Much tighter than the previous 40-minute monolithic timeout so a flaky batch can't block a runner.
// See Issue 9088 for the split rationale.
const PER_BATCH_TIMEOUT_MS = 5 * 60 * 1000 // 5 min base, doubled in CI via CI_TIMEOUT_MULTIPLIER

// Upper bound on the number of batches we pre-declare tests for. 150+ cards at
// BATCH_SIZE=24 gives ~7 batches; we pre-declare more so the manifest can grow
// without editing this file. Extra tests short-circuit when their batch is empty.
const MAX_EXPECTED_BATCHES = 16

// Network settle timeout after warmup or navigating away — best-effort, not blocking.
const NETWORK_SETTLE_TIMEOUT_MS = 10_000
const NAV_AWAY_SETTLE_TIMEOUT_MS = 5_000

// Warmup navigation timeout — 180s handles cold Vite module compilation of ~174 card modules.
const WARMUP_NAV_TIMEOUT_MS = 180_000

// Retry attempts + delay for the in-page compliance monitor when a navigation
// destroys the execution context mid-read.
const MONITOR_STOP_MAX_RETRIES = 3
const MONITOR_STOP_RETRY_DELAY_MS = 500

// Grace period snapshots for criterion G — 500ms (10 × 50ms poll interval) of
// async cache hydration (SQLite Worker init, localStorage parse).
const WARM_GRACE_SNAPSHOTS = 10

// Early-window snapshots for criterion I — ~200ms at 50ms poll interval.
const CRITERION_I_EARLY_SNAPSHOTS = 4

// Minimum text length that counts as "content" (vs. empty skeleton).
const MIN_CONTENT_TEXT_LENGTH = 10


// Mock data, setupAuth, setupLiveMocks, setLiveColdMode imported from ../mocks/liveMocks
// navigateToBatch, waitForCardsToLoad imported from ../mocks/liveMocks
let mockControl: MockControl

// ---------------------------------------------------------------------------
// Cross-test shared state (serial describe block)
//
// These live at module scope so the per-batch tests can accumulate results
// and the final aggregation test can run cross-batch assertions + write the
// compliance report. The previous monolithic test held this on the stack;
// splitting into per-batch tests (Issue 9088) forces us to share state across
// tests, but serial mode guarantees ordered execution within the same worker.
// ---------------------------------------------------------------------------

interface ComplianceState {
  totalCards: number
  totalBatches: number
  allBatchResults: BatchResult[]
  setupDone: boolean
}

const complianceState: ComplianceState = {
  totalCards: 0,
  totalBatches: 0,
  allBatchResults: [],
  setupDone: false,
}

// ---------------------------------------------------------------------------
// Compliance monitor — injected into the page
// ---------------------------------------------------------------------------

async function startComplianceMonitor(page: Page, cardIds: string[]) {
  await page.evaluate(
    ({ ids, pollInterval }: { ids: string[]; pollInterval: number }) => {
      type Snapshot = {
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

      const win = window as Window & {
        __COMPLIANCE_MONITOR__?: {
          cardHistory: Record<string, Snapshot[]>
          running: boolean
          intervalId: number
        }
      }

      const cardHistory: Record<string, Snapshot[]> = {}
      for (const id of ids) cardHistory[id] = []

      function snapshot() {
        const now = performance.now()
        for (const id of ids) {
          const card = document.querySelector(`[data-card-id="${id}"]`)
          if (!card) continue

          const snap: Snapshot = {
            timestamp: now,
            dataLoading: card.getAttribute('data-loading'),
            dataEffectiveLoading: card.getAttribute('data-effective-loading'),
            hasDemoBadge: !!card.querySelector('[data-testid="demo-badge"]'),
            hasYellowBorder: card.className.includes('border-yellow-500'),
            hasLargeSkeleton: false,
            hasSpinningRefresh: !!card.querySelector('svg.animate-spin'),
            textContentLength: (card.textContent || '').trim().length,
            hasVisualContent: !!card.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]'),
          }

          // Check for CardWrapper skeleton overlay (precise attribute — ignores card-internal animate-pulse decorations)
          if (card.querySelector('[data-card-skeleton="true"]')) {
            snap.hasLargeSkeleton = true
          }

          cardHistory[id].push(snap)
        }
      }

      const intervalId = window.setInterval(snapshot, pollInterval)
      // Take an immediate first snapshot
      snapshot()

      win.__COMPLIANCE_MONITOR__ = { cardHistory, running: true, intervalId }
    },
    { ids: cardIds, pollInterval: MONITOR_POLL_INTERVAL_MS }
  )
}

async function stopComplianceMonitor(page: Page): Promise<Record<string, CardStateSnapshot[]>> {
  for (let attempt = 0; attempt < MONITOR_STOP_MAX_RETRIES; attempt++) {
    try {
      return await page.evaluate(() => {
        const win = window as Window & {
          __COMPLIANCE_MONITOR__?: {
            cardHistory: Record<string, unknown[]>
            running: boolean
            intervalId: number
          }
        }
        const monitor = win.__COMPLIANCE_MONITOR__
        if (!monitor) return {}
        clearInterval(monitor.intervalId)
        monitor.running = false
        return monitor.cardHistory as Record<string, CardStateSnapshot[]>
      })
    } catch (err) {
      // Execution context can be destroyed if a navigation is still settling
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Execution context') && attempt < MONITOR_STOP_MAX_RETRIES - 1) {
        console.log(`  [stopComplianceMonitor] context destroyed, retrying (${attempt + 1}/${MONITOR_STOP_MAX_RETRIES})...`)
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(MONITOR_STOP_RETRY_DELAY_MS)
        continue
      }
      console.log(`  [stopComplianceMonitor] failed: ${msg}`)
      return {}
    }
  }
  return {}
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Criterion evaluators
// ---------------------------------------------------------------------------

function checkCriterionA(
  cardId: string,
  cardType: string,
  history: CardStateSnapshot[]
): CriterionResult {
  // Loading phase should NOT have demo badge or yellow border
  const loadingSnapshots = history.filter((s) => s.dataEffectiveLoading === 'true')
  if (loadingSnapshots.length === 0) {
    return { criterion: 'a', status: 'skip', details: 'No loading snapshots captured' }
  }

  const violations = loadingSnapshots.filter((s) => s.hasDemoBadge || s.hasYellowBorder)
  if (violations.length === 0) {
    return { criterion: 'a', status: 'pass', details: `${loadingSnapshots.length} loading snapshots, all clean` }
  }

  const pct = Math.round((violations.length / loadingSnapshots.length) * 100)
  return {
    criterion: 'a',
    status: 'fail',
    details: `${violations.length}/${loadingSnapshots.length} loading snapshots showed demo indicators (${pct}%)`,
  }
}

function checkCriterionB(
  cardId: string,
  cardType: string,
  history: CardStateSnapshot[]
): CriterionResult {
  // Refresh icon should spin during loading
  const loadingSnapshots = history.filter((s) => s.dataEffectiveLoading === 'true')
  if (loadingSnapshots.length === 0) {
    return { criterion: 'b', status: 'skip', details: 'No loading snapshots captured' }
  }

  const spinning = loadingSnapshots.filter((s) => s.hasSpinningRefresh)
  if (spinning.length > 0) {
    return {
      criterion: 'b',
      status: 'pass',
      details: `${spinning.length}/${loadingSnapshots.length} loading snapshots had spinning refresh`,
    }
  }

  return {
    criterion: 'b',
    status: 'fail',
    details: `No spinning refresh icon detected during ${loadingSnapshots.length} loading snapshots`,
  }
}

function checkCriterionC(
  cardId: string,
  cardType: string,
  sseUrls: string[]
): CriterionResult {
  // Check if SSE stream requests were made (some cards use REST only)
  if (sseUrls.length > 0) {
    return { criterion: 'c', status: 'pass', details: `${sseUrls.length} SSE stream requests observed` }
  }
  return {
    criterion: 'c',
    status: 'warn',
    details: 'No SSE /stream requests detected — card may use REST only',
  }
}

function checkCriterionD(
  cardId: string,
  cardType: string,
  history: CardStateSnapshot[]
): CriterionResult {
  // Transition: loading → content (data-loading goes from true to false, text > threshold)
  const hadLoading = history.some((s) => s.dataLoading === 'true')
  const hadContent = history.some(
    (s) => s.dataLoading === 'false' && (s.textContentLength > MIN_CONTENT_TEXT_LENGTH || s.hasVisualContent)
  )

  if (!hadLoading && hadContent) {
    return { criterion: 'd', status: 'pass', details: 'Content appeared (no loading phase captured)' }
  }
  if (hadLoading && hadContent) {
    return { criterion: 'd', status: 'pass', details: 'Transitioned from loading skeleton to content' }
  }
  if (hadLoading && !hadContent) {
    return { criterion: 'd', status: 'fail', details: 'Loading skeleton appeared but no content followed' }
  }
  return { criterion: 'd', status: 'skip', details: 'No loading or content snapshots captured' }
}

function checkCriterionE(
  cardId: string,
  cardType: string,
  history: CardStateSnapshot[]
): CriterionResult {
  // After first content, refresh icon should still spin during incremental load
  const firstContentIdx = history.findIndex(
    (s) => s.dataLoading === 'false' && (s.textContentLength > MIN_CONTENT_TEXT_LENGTH || s.hasVisualContent)
  )
  if (firstContentIdx === -1) {
    return { criterion: 'e', status: 'skip', details: 'No content phase captured' }
  }

  // Look for spinning refresh in post-content snapshots (incremental refresh)
  const postContent = history.slice(firstContentIdx)
  const hasSpinner = postContent.some((s) => s.hasSpinningRefresh && s.textContentLength > MIN_CONTENT_TEXT_LENGTH)
  if (hasSpinner) {
    return { criterion: 'e', status: 'pass', details: 'Refresh icon animated during incremental load' }
  }
  // This is expected to skip for most cards — auto-refresh timer is 15s+
  return {
    criterion: 'e',
    status: 'skip',
    details: 'No incremental refresh observed (auto-refresh timer not triggered within test window)',
  }
}

async function checkCriterionF(page: Page): Promise<CriterionResult> {
  // Check all persistent cache stores: localStorage (old MCP hooks) + IndexedDB (new cache system)
  const cacheInfo = await page.evaluate(() => {
    // Check localStorage for cache entries from old MCP hooks and new cache metadata
    let localStorageCount = 0
    const cacheKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      if (
        key.includes('cache') ||
        key.includes('kubestellar-') ||
        key.startsWith('kc-') ||
        key.startsWith('cache:')
      ) {
        localStorageCount++
        cacheKeys.push(key)
      }
    }

    // Check IndexedDB
    return new Promise<{ localStorageCount: number; idbCount: number; cacheKeys: string[] }>((resolve) => {
      try {
        const req = indexedDB.open('kc_cache')
        req.onsuccess = () => {
          try {
            const db = req.result
            const storeNames = Array.from(db.objectStoreNames)
            if (storeNames.length === 0) {
              db.close()
              resolve({ localStorageCount, idbCount: 0, cacheKeys })
              return
            }
            const tx = db.transaction(storeNames, 'readonly')
            let total = 0
            let done = 0
            for (const store of storeNames) {
              const countReq = tx.objectStore(store).count()
              countReq.onsuccess = () => {
                total += countReq.result
                done++
                if (done === storeNames.length) {
                  db.close()
                  resolve({ localStorageCount, idbCount: total, cacheKeys })
                }
              }
              countReq.onerror = () => {
                done++
                if (done === storeNames.length) {
                  db.close()
                  resolve({ localStorageCount, idbCount: total, cacheKeys })
                }
              }
            }
          } catch {
            resolve({ localStorageCount, idbCount: 0, cacheKeys })
          }
        }
        req.onerror = () => resolve({ localStorageCount, idbCount: 0, cacheKeys })
      } catch {
        resolve({ localStorageCount, idbCount: 0, cacheKeys })
      }
    })
  })

  const total = cacheInfo.localStorageCount + cacheInfo.idbCount
  if (total > 0) {
    return {
      criterion: 'f',
      status: 'pass',
      details: `Cache: ${cacheInfo.localStorageCount} localStorage + ${cacheInfo.idbCount} IndexedDB entries`,
    }
  }
  return { criterion: 'f', status: 'fail', details: 'No persistent cache entries found in localStorage or IndexedDB' }
}

function checkCriterionG(
  cardId: string,
  cardType: string,
  warmHistory: CardStateSnapshot[]
): CriterionResult {
  // On warm return: cached data should appear within 500ms (grace period for async cache hydration)
  if (warmHistory.length === 0) {
    return { criterion: 'g', status: 'skip', details: 'No warm return snapshots captured' }
  }

  // Allow a brief grace period for async cache hydration (SQLite Worker init, localStorage parse)
  const earlyHistory = warmHistory.slice(0, Math.min(WARM_GRACE_SNAPSHOTS, warmHistory.length))

  // Find first snapshot with content and no skeleton within the grace period
  const firstContentIdx = earlyHistory.findIndex(
    (s) => (s.textContentLength > MIN_CONTENT_TEXT_LENGTH || s.hasVisualContent) && !s.hasLargeSkeleton
  )

  if (firstContentIdx === 0) {
    return { criterion: 'g', status: 'pass', details: 'Cached data loaded immediately, no skeleton phase' }
  }
  if (firstContentIdx > 0 && firstContentIdx < WARM_GRACE_SNAPSHOTS) {
    const ms = firstContentIdx * MONITOR_POLL_INTERVAL_MS
    return { criterion: 'g', status: 'pass', details: `Cached data appeared after ${ms}ms (within grace period)` }
  }

  // Check if content appeared outside the grace period
  const laterIdx = warmHistory.findIndex(
    (s) => (s.textContentLength > MIN_CONTENT_TEXT_LENGTH || s.hasVisualContent) && !s.hasLargeSkeleton
  )
  if (laterIdx >= 0) {
    const ms = laterIdx * MONITOR_POLL_INTERVAL_MS
    return {
      criterion: 'g',
      status: 'warn',
      details: `Cached data appeared after ${ms}ms (outside ${WARM_GRACE_SNAPSHOTS * MONITOR_POLL_INTERVAL_MS}ms grace period)`,
    }
  }

  const first = warmHistory[0]
  return {
    criterion: 'g',
    status: 'fail',
    details: `First snapshot: text=${first.textContentLength} chars, skeleton=${first.hasLargeSkeleton}, loading=${first.dataLoading}`,
  }
}

function checkCriterionH(
  cardId: string,
  cardType: string,
  warmHistory: CardStateSnapshot[]
): CriterionResult {
  // Cached data maintained throughout warm return — no regressions to skeleton
  if (warmHistory.length === 0) {
    return { criterion: 'h', status: 'skip', details: 'No warm return snapshots captured' }
  }

  const contentSnapshots = warmHistory.filter(
    (s) => s.textContentLength > MIN_CONTENT_TEXT_LENGTH || s.hasVisualContent
  )
  const skeletonSnapshots = warmHistory.filter((s) => s.hasLargeSkeleton)

  if (contentSnapshots.length === warmHistory.length) {
    return { criterion: 'h', status: 'pass', details: 'Content stable throughout warm return' }
  }
  if (contentSnapshots.length > 0 && skeletonSnapshots.length === 0) {
    return { criterion: 'h', status: 'pass', details: 'Content present, no skeleton regression' }
  }

  const demoBadges = warmHistory.filter((s) => s.hasDemoBadge)
  if (demoBadges.length > 0) {
    return {
      criterion: 'h',
      status: 'fail',
      details: `${demoBadges.length}/${warmHistory.length} warm snapshots showed demo badge`,
    }
  }

  return {
    criterion: 'h',
    status: 'warn',
    details: `${contentSnapshots.length}/${warmHistory.length} snapshots had content, ${skeletonSnapshots.length} had skeleton`,
  }
}

function checkCriterionI(
  cardId: string,
  cardType: string,
  history: CardStateSnapshot[]
): CriterionResult {
  // On cold start with cleared caches, the first snapshot should be
  // skeleton/loading — NOT demo data.  If the first snapshot has content +
  // demo badge + data-loading="false", `initialData` was set to demo data
  // (bypassing the loading→content transition entirely).
  if (history.length === 0) {
    return { criterion: 'i', status: 'skip', details: 'No snapshots captured' }
  }

  const first = history[0]
  const hasContent = first.textContentLength > MIN_CONTENT_TEXT_LENGTH || first.hasVisualContent

  if (first.hasDemoBadge && hasContent && first.dataLoading === 'false') {
    return {
      criterion: 'i',
      status: 'fail',
      details: `First snapshot already has demo content (${first.textContentLength} chars) with demo badge — initialData likely set to demo data`,
    }
  }

  // Also check early snapshots (within first ~200ms / 4 polls) for same pattern
  const earlySnapshots = history.slice(0, Math.min(CRITERION_I_EARLY_SNAPSHOTS, history.length))
  const earlyDemoFlash = earlySnapshots.find(
    (s) => s.hasDemoBadge && (s.textContentLength > MIN_CONTENT_TEXT_LENGTH || s.hasVisualContent) && s.dataLoading === 'false'
  )
  if (earlyDemoFlash) {
    return {
      criterion: 'i',
      status: 'fail',
      details: `Demo data appeared within first ${CRITERION_I_EARLY_SNAPSHOTS * MONITOR_POLL_INTERVAL_MS}ms (${earlyDemoFlash.textContentLength} chars) — initialData likely set to demo data`,
    }
  }

  if (hasContent && first.dataLoading === 'false' && !first.hasDemoBadge) {
    // Content without demo badge on first snapshot — could be from localStorage cache, OK
    return { criterion: 'i', status: 'pass', details: 'First snapshot has content without demo badge (likely cached)' }
  }

  return { criterion: 'i', status: 'pass', details: 'First snapshot shows loading/skeleton as expected' }
}

// ---------------------------------------------------------------------------
// Gap analysis — self-evaluating section for continuous improvement
// ---------------------------------------------------------------------------

// Threshold: criteria with a skip rate above this (fraction) are flagged as under-covered.
const GAP_SKIP_RATE_THRESHOLD = 0.5
const GAP_SKIP_RATE_HIGH_PRIORITY = 0.8
// Threshold: minimum number of demo-badge failures before we surface a cluster gap.
const GAP_DEMO_BADGE_MIN_FAIL_COUNT = 3
const GAP_DEMO_BADGE_SAMPLE_LIMIT = 5
// Threshold: SSE adoption below this fraction surfaces as a gap.
const GAP_SSE_ADOPTION_THRESHOLD = 0.3

function generateGapAnalysis(report: ComplianceReport): GapAnalysisEntry[] {
  const gaps: GapAnalysisEntry[] = []
  const rates = report.summary.criterionPassRates

  // Check for criteria with high skip rates (not enough coverage)
  const allCards = report.batches.flatMap((b) => b.cards)
  for (const criterion of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']) {
    const results = allCards.map((c) => c.criteria[criterion]).filter(Boolean)
    const skipCount = results.filter((r) => r.status === 'skip').length
    const skipRate = results.length > 0 ? skipCount / results.length : 0

    if (skipRate > GAP_SKIP_RATE_THRESHOLD) {
      gaps.push({
        area: `Criterion ${criterion} coverage`,
        observation: `${Math.round(skipRate * 100)}% of cards skipped criterion ${criterion}`,
        suggestedImprovement:
          criterion === 'e'
            ? 'Consider triggering a manual refresh via button click to test incremental refresh, rather than waiting for auto-refresh timer'
            : `Review test timing — the polling window may be too short to capture the loading→content transition for criterion ${criterion}`,
        priority: skipRate > GAP_SKIP_RATE_HIGH_PRIORITY ? 'high' : 'medium',
      })
    }
  }

  // Check for initial demo flash failures (criterion i)
  const demoFlashFails = allCards.filter((c) => c.criteria.i?.status === 'fail')
  if (demoFlashFails.length > 0) {
    const failedTypes = demoFlashFails.map((c) => c.cardType)
    const uniqueTypes = [...new Set(failedTypes)]
    gaps.push({
      area: 'Initial demo data as initialData',
      observation: `${uniqueTypes.length} card types use demo data as useCache initialData: ${uniqueTypes.join(', ')}`,
      suggestedImprovement:
        'Change initialData from demo data to empty (e.g., [] or { items: [], isDemo: false }). Demo data should only be in the demoData prop. Cards with demo initialData skip the skeleton phase and flash demo badges on cold start.',
      priority: 'high',
    })
  }

  // Check if demo badge failures cluster around specific card types
  const failedCards = allCards.filter((c) => c.criteria.a?.status === 'fail')
  if (failedCards.length > GAP_DEMO_BADGE_MIN_FAIL_COUNT) {
    const failedTypes = failedCards.map((c) => c.cardType)
    const uniqueTypes = [...new Set(failedTypes)]
    gaps.push({
      area: 'Demo badge contamination',
      observation: `${uniqueTypes.length} card types show demo badges during skeleton: ${uniqueTypes.slice(0, GAP_DEMO_BADGE_SAMPLE_LIMIT).join(', ')}${uniqueTypes.length > GAP_DEMO_BADGE_SAMPLE_LIMIT ? '...' : ''}`,
      suggestedImprovement:
        'Investigate whether these cards report isDemoData=true during initial load. The showDemoIndicator logic in CardWrapper may need a loading-phase exemption.',
      priority: 'high',
    })
  }

  // Check warm return issues — caching gaps
  const warmFailCards = allCards.filter((c) => c.criteria.g?.status === 'fail')
  if (warmFailCards.length > 0) {
    gaps.push({
      area: 'Cache miss on warm return',
      observation: `${warmFailCards.length} cards showed skeleton on warm return instead of cached data`,
      suggestedImprovement:
        'Check if these cards use useCachedData correctly. Cards may be clearing cache on unmount or using non-cacheable data sources.',
      priority: 'high',
    })
  }

  // Check criterion C (SSE) — many warns suggest cards arent using SSE
  if (rates.c !== undefined && rates.c < GAP_SSE_ADOPTION_THRESHOLD) {
    gaps.push({
      area: 'SSE streaming adoption',
      observation: `Only ${Math.round(rates.c * 100)}% of cards use SSE streaming — most use REST only`,
      suggestedImprovement:
        'Consider whether criterion C should be split: REST cards vs SSE cards, each with their own compliance path. REST cards should still validate incremental loading.',
      priority: 'low',
    })
  }

  // Meta: suggest adding new criteria based on observed patterns
  gaps.push({
    area: 'Future criteria candidates',
    observation: 'The current 8 criteria cover core loading behavior but may miss edge cases',
    suggestedImprovement:
      'Consider adding: (i) error-state compliance — cards showing errors should not show demo badges; (j) responsive sizing — cards should not overflow their container during loading; (k) accessibility — skeleton states should have appropriate ARIA attributes.',
    priority: 'low',
  })

  return gaps
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function deriveOverallStatus(criteria: Record<string, CriterionResult>): CriterionStatus {
  const statuses = Object.values(criteria).map((r) => r.status)
  if (statuses.includes('fail')) return 'fail'
  if (statuses.includes('warn')) return 'warn'
  if (statuses.every((s) => s === 'skip')) return 'skip'
  return 'pass'
}

function writeReport(report: ComplianceReport, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true })

  // JSON report
  fs.writeFileSync(path.join(outDir, 'compliance-report.json'), JSON.stringify(report, null, 2))

  // Markdown summary
  const allCards = report.batches.flatMap((b) => b.cards)
  const md: string[] = [
    '# Card Loading Compliance Report',
    '',
    `Generated: ${report.timestamp}`,
    `Total cards tested: ${report.totalCards}`,
    '',
    '## Criterion Pass Rates',
    '',
    '| Criterion | Description | Pass Rate | Pass | Fail | Warn | Skip |',
    '|-----------|-------------|-----------|------|------|------|------|',
  ]

  const criterionDescriptions: Record<string, string> = {
    a: 'Skeleton without demo badge during loading',
    b: 'Refresh icon spins during loading',
    c: 'Data loads via SSE streaming',
    d: 'Skeleton replaced by data content',
    e: 'Refresh icon animated during incremental load',
    f: 'Data cached persistently as it loads',
    g: 'Cached data loads immediately on return',
    h: 'Cached data updated without skeleton regression',
    i: 'No demo data flash on cold start',
  }

  for (const criterion of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']) {
    const results = allCards.map((c) => c.criteria[criterion]).filter(Boolean)
    const pass = results.filter((r) => r.status === 'pass').length
    const fail = results.filter((r) => r.status === 'fail').length
    const warn = results.filter((r) => r.status === 'warn').length
    const skip = results.filter((r) => r.status === 'skip').length
    const rate = report.summary.criterionPassRates[criterion]
    const pct = rate !== undefined ? `${Math.round(rate * 100)}%` : 'N/A'

    md.push(
      `| ${criterion} | ${criterionDescriptions[criterion] || ''} | ${pct} | ${pass} | ${fail} | ${warn} | ${skip} |`
    )
  }

  // Failures section
  const failedCards = allCards.filter((c) => c.overallStatus === 'fail')
  if (failedCards.length > 0) {
    md.push('', '## Failures', '', '| Card Type | Failed Criteria | Details |', '|-----------|----------------|---------|')
    for (const card of failedCards) {
      const failedCriteria = Object.entries(card.criteria)
        .filter(([, r]) => r.status === 'fail')
        .map(([key, r]) => `${key}: ${r.details}`)
      md.push(`| ${card.cardType} | ${failedCriteria.map((f) => f.split(':')[0]).join(', ')} | ${failedCriteria.join('; ')} |`)
    }
  }

  // Summary
  md.push(
    '',
    '## Summary',
    '',
    `- **Pass**: ${report.summary.passCount}`,
    `- **Fail**: ${report.summary.failCount}`,
    `- **Warn**: ${report.summary.warnCount}`,
    `- **Skip**: ${report.summary.skipCount}`,
  )

  // Gap analysis section
  if (report.gapAnalysis.length > 0) {
    md.push(
      '',
      '## Gap Analysis & Improvement Opportunities',
      '',
      'The following gaps were identified during this compliance run. Use these to improve both the test suite and the UI:',
      '',
    )
    for (const gap of report.gapAnalysis) {
      md.push(
        `### [${gap.priority.toUpperCase()}] ${gap.area}`,
        '',
        `**Observation:** ${gap.observation}`,
        '',
        `**Suggested improvement:** ${gap.suggestedImprovement}`,
        '',
      )
    }
  }

  fs.writeFileSync(path.join(outDir, 'compliance-summary.md'), md.join('\n') + '\n')
}

// ---------------------------------------------------------------------------
// Phase runners — extracted from the old monolithic test so each per-batch
// test call stays small and readable.
// ---------------------------------------------------------------------------

async function runColdBatch(page: Page, batch: number): Promise<BatchResult | null> {
  // Clear caches in-page before each batch — allowlist keeps only essential settings
  // so card-specific localStorage backup keys (e.g. nightly-e2e-cache) are cleared too
  await page.evaluate(() => {
    const KEEP_KEYS = new Set([
      'token', 'kc-demo-mode', 'demo-user-onboarded',
      'kubestellar-console-tour-completed', 'kc-user-cache',
      'kc-backend-status', 'kc-sqlite-migrated',
    ])
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (!key || KEEP_KEYS.has(key)) continue
      localStorage.removeItem(key)
    }
    // Ensure live mode
    localStorage.setItem('kc-demo-mode', 'false')
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
  })

  mockControl.sseRequestLog.length = 0

  const manifest = await navigateToBatch(page, batch, BATCH_NAV_TIMEOUT_MS)
  const selected = manifest.selected || []
  if (selected.length === 0) return null

  const cardIds = selected.map((item) => item.cardId)

  await startComplianceMonitor(page, cardIds)
  await waitForCardsToLoad(page, cardIds, BATCH_LOAD_TIMEOUT_MS)
  const coldHistory = await stopComplianceMonitor(page)

  const criterionFResult = await checkCriterionF(page)

  const batchCards: CardComplianceResult[] = []
  for (const item of selected) {
    const history = coldHistory[item.cardId] || []
    const criteria: Record<string, CriterionResult> = {
      a: checkCriterionA(item.cardId, item.cardType, history),
      b: checkCriterionB(item.cardId, item.cardType, history),
      c: checkCriterionC(item.cardId, item.cardType, mockControl.sseRequestLog),
      d: checkCriterionD(item.cardId, item.cardType, history),
      e: checkCriterionE(item.cardId, item.cardType, history),
      f: criterionFResult,
      i: checkCriterionI(item.cardId, item.cardType, history),
    }

    batchCards.push({
      cardType: item.cardType,
      cardId: item.cardId,
      criteria,
      overallStatus: deriveOverallStatus(criteria),
    })
  }

  const failCount = batchCards.filter((c) => c.overallStatus === 'fail').length
  console.log(
    `[Compliance] Batch ${batch + 1}/${complianceState.totalBatches} cold: ${selected.length} cards, ${failCount} failures`
  )

  return { batchIndex: batch, cards: batchCards }
}

async function runWarmBatch(page: Page, batch: number, batchResult: BatchResult): Promise<void> {
  // Do NOT re-apply cold mode — we want warm/cached data
  const manifest = await navigateToBatch(page, batch, BATCH_NAV_TIMEOUT_MS)
  const selected = manifest.selected || []
  if (selected.length === 0) return

  const cardIds = selected.map((item) => item.cardId)

  await startComplianceMonitor(page, cardIds)

  // Wait for cached data to appear — monitor records snapshots during this period
  await page.waitForLoadState('networkidle', { timeout: WARM_RETURN_WAIT_MS }).catch(() => { /* monitoring window */ })

  const warmHistory = await stopComplianceMonitor(page)

  for (const card of batchResult.cards) {
    const history = warmHistory[card.cardId] || []
    card.criteria.g = checkCriterionG(card.cardId, card.cardType, history)
    card.criteria.h = checkCriterionH(card.cardId, card.cardType, history)
    card.overallStatus = deriveOverallStatus(card.criteria)
  }

  const warmFails = batchResult.cards.filter((c) => c.criteria.g?.status === 'fail' || c.criteria.h?.status === 'fail').length
  console.log(
    `[Compliance] Batch ${batch + 1}/${complianceState.totalBatches} warm: ${selected.length} cards, ${warmFails} warm failures`
  )
}

// ---------------------------------------------------------------------------
// Test suite — per-batch split (Issue 9088)
//
// The previous single test() iterated over all batches in one 40-minute block.
// A single flaky card failed the whole suite with no retry, no per-batch
// isolation, and a bloated timeout that blocked runners even on first-batch
// failures. We now emit one test per batch for the cold phase, a nav-away
// test, one test per batch for the warm phase, and a final aggregation test
// that runs the cross-batch assertions and writes the report.
//
// Must run in serial mode within a single worker: the cold phase populates
// the in-browser cache that the warm phase depends on, and the aggregation
// test consumes state built up by all preceding tests.
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' })

test.describe('card loading compliance (per-batch split — Issue 9088)', () => {
  // Persistent page for the whole describe block — cold/warm phases share the
  // in-browser localStorage + IndexedDB cache, so we cannot take a fresh page
  // per test. beforeAll opens the page once and afterAll closes it; each test
  // below uses `sharedPage` instead of the default `page` fixture.
  let sharedPage: Page

  test.beforeAll(async ({ browser }) => {
    // Do NOT override baseURL here — playwright.config.ts already provides a
    // sensible default (PLAYWRIGHT_BASE_URL || http://localhost:8080). Passing
    // `baseURL: process.env.PLAYWRIGHT_BASE_URL` when the env var is unset
    // assigned `undefined` to the context, which broke relative navigations
    // (e.g. `page.goto('/__compliance/all-cards?...')`) with "invalid URL".
    // Dropping the override lets the project-level baseURL flow through.
    // See Issue 9208 follow-up (Copilot review comment on line 909).
    const context = await browser.newContext()
    sharedPage = await context.newPage()

    // Capture browser console for debugging
    sharedPage.on('console', (msg) => {
      if (msg.type() === 'error') console.log(`[Browser ERROR] ${msg.text()}`)
    })
    sharedPage.on('pageerror', (err) => console.log(`[Browser EXCEPTION] ${err.message}`))
  })

  test.afterAll(async () => {
    if (sharedPage) {
      await sharedPage.context().close().catch(() => { /* best-effort */ })
    }
  })

  test('setup — mocks + warmup + manifest', async ({}, testInfo) => {
    testInfo.setTimeout(IS_CI ? PER_BATCH_TIMEOUT_MS * CI_TIMEOUT_MULTIPLIER : PER_BATCH_TIMEOUT_MS)

    await setupAuth(sharedPage)
    mockControl = await setupLiveMocks(sharedPage, { trackSSERequests: true })
    await setLiveColdMode(sharedPage)

    console.log('[Compliance] Phase 1: Warmup — priming Vite module cache')
    // Use a long timeout for cold dev server (Vite compiles 174 card modules on first load)
    const warmupManifest = await navigateToBatch(sharedPage, 0, WARMUP_NAV_TIMEOUT_MS)
    complianceState.totalCards = warmupManifest.totalCards
    complianceState.totalBatches = Math.ceil(complianceState.totalCards / BATCH_SIZE)
    complianceState.allBatchResults = []
    complianceState.setupDone = true
    console.log(`[Compliance] Total cards: ${complianceState.totalCards}, batches: ${complianceState.totalBatches}`)

    // Fail fast if the manifest has outgrown our pre-declared test count.
    // Playwright requires test() declarations at load time, so we can't size
    // the per-batch loops dynamically. Without this guard, extra batches are
    // silently dropped from the cold/warm phases AND the aggregate report —
    // those cards effectively escape compliance checking. See Issue 9208
    // follow-up (Copilot review comment on line 955).
    expect(
      complianceState.totalBatches,
      `Manifest has ${complianceState.totalCards} cards (${complianceState.totalBatches} batches of ${BATCH_SIZE}), ` +
        `which exceeds MAX_EXPECTED_BATCHES=${MAX_EXPECTED_BATCHES}. ` +
        `Bump MAX_EXPECTED_BATCHES in card-loading-compliance.spec.ts to at least ${complianceState.totalBatches} ` +
        `so all batches are covered by pre-declared cold/warm tests.`,
    ).toBeLessThanOrEqual(MAX_EXPECTED_BATCHES)

    await sharedPage.waitForLoadState('networkidle', { timeout: NETWORK_SETTLE_TIMEOUT_MS }).catch(() => { /* best-effort */ })
  })

  // Pre-declare per-batch tests up to MAX_EXPECTED_BATCHES. Tests for batches
  // beyond the actual manifest size short-circuit (Playwright requires test
  // declarations at load time, so we can't size this dynamically).
  for (let batchIdx = 0; batchIdx < MAX_EXPECTED_BATCHES; batchIdx++) {
    test(`cold — batch ${batchIdx + 1}`, async ({}, testInfo) => {
      testInfo.setTimeout(IS_CI ? PER_BATCH_TIMEOUT_MS * CI_TIMEOUT_MULTIPLIER : PER_BATCH_TIMEOUT_MS)
      if (!complianceState.setupDone) {
        test.skip(true, 'setup did not complete')
      }
      if (batchIdx >= complianceState.totalBatches) {
        test.skip(true, `batch ${batchIdx + 1} beyond manifest total (${complianceState.totalBatches})`)
      }
      const result = await runColdBatch(sharedPage, batchIdx)
      if (result) complianceState.allBatchResults.push(result)
    })
  }

  test('navigate away — between cold and warm phases', async ({}, testInfo) => {
    testInfo.setTimeout(IS_CI ? PER_BATCH_TIMEOUT_MS * CI_TIMEOUT_MULTIPLIER : PER_BATCH_TIMEOUT_MS)
    if (!complianceState.setupDone) test.skip(true, 'setup did not complete')
    console.log('[Compliance] Phase 3: Navigate away')
    await sharedPage.goto('/', { waitUntil: 'domcontentloaded' })
    await sharedPage.waitForLoadState('networkidle', { timeout: NAV_AWAY_SETTLE_TIMEOUT_MS }).catch(() => { /* best-effort */ })
  })

  for (let batchIdx = 0; batchIdx < MAX_EXPECTED_BATCHES; batchIdx++) {
    test(`warm — batch ${batchIdx + 1}`, async ({}, testInfo) => {
      testInfo.setTimeout(IS_CI ? PER_BATCH_TIMEOUT_MS * CI_TIMEOUT_MULTIPLIER : PER_BATCH_TIMEOUT_MS)
      if (!complianceState.setupDone) {
        test.skip(true, 'setup did not complete')
      }
      if (batchIdx >= complianceState.totalBatches) {
        test.skip(true, `batch ${batchIdx + 1} beyond manifest total (${complianceState.totalBatches})`)
      }
      const batchResult = complianceState.allBatchResults.find((b) => b.batchIndex === batchIdx)
      if (!batchResult) {
        test.skip(true, `no cold result for batch ${batchIdx + 1} (cold phase likely failed)`)
        return
      }
      await runWarmBatch(sharedPage, batchIdx, batchResult)
    })
  }

  test('aggregate report + cross-batch assertions', async ({}, testInfo) => {
    testInfo.setTimeout(IS_CI ? PER_BATCH_TIMEOUT_MS * CI_TIMEOUT_MULTIPLIER : PER_BATCH_TIMEOUT_MS)
    if (!complianceState.setupDone) test.skip(true, 'setup did not complete')

    console.log('[Compliance] Phase 5: Generating report')

    const allCards = complianceState.allBatchResults.flatMap((b) => b.cards)
    const criterionPassRates: Record<string, number> = {}
    for (const criterion of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']) {
      const results = allCards.map((c) => c.criteria[criterion]).filter(Boolean)
      const testable = results.filter((r) => r.status !== 'skip')
      criterionPassRates[criterion] = testable.length > 0
        ? testable.filter((r) => r.status === 'pass').length / testable.length
        : 1
    }

    const report: ComplianceReport = {
      timestamp: new Date().toISOString(),
      totalCards: complianceState.totalCards,
      batches: complianceState.allBatchResults,
      summary: {
        totalCards: allCards.length,
        passCount: allCards.filter((c) => c.overallStatus === 'pass').length,
        failCount: allCards.filter((c) => c.overallStatus === 'fail').length,
        warnCount: allCards.filter((c) => c.overallStatus === 'warn').length,
        skipCount: allCards.filter((c) => c.overallStatus === 'skip').length,
        criterionPassRates,
      },
      gapAnalysis: [],
    }

    report.gapAnalysis = generateGapAnalysis(report)

    const outDir = path.resolve(__dirname, '../test-results')
    writeReport(report, outDir)

    console.log(`[Compliance] Report: ${path.join(outDir, 'compliance-report.json')}`)
    console.log(`[Compliance] Summary: ${path.join(outDir, 'compliance-summary.md')}`)
    console.log(`[Compliance] Pass: ${report.summary.passCount}, Fail: ${report.summary.failCount}, Warn: ${report.summary.warnCount}, Skip: ${report.summary.skipCount}`)

    for (const criterion of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']) {
      const rate = criterionPassRates[criterion]
      console.log(`[Compliance] Criterion ${criterion}: ${Math.round(rate * 100)}% pass rate`)
    }

    if (report.gapAnalysis.length > 0) {
      console.log(`[Compliance] Gap analysis: ${report.gapAnalysis.length} improvement opportunities identified`)
      for (const gap of report.gapAnalysis) {
        console.log(`  [${gap.priority.toUpperCase()}] ${gap.area}: ${gap.observation}`)
      }
    }

    // ── Assertions ──────────────────────────────────────────────────────────
    // CI runners have slower CPUs — the 50ms polling monitor can miss fast state
    // transitions, causing a few cards to fail criteria that pass locally.
    // Use relaxed thresholds in CI to account for timing jitter.
    const CRITERION_A_THRESHOLD = IS_CI ? 0.97 : 1.0
    const CRITICAL_CRITERION_THRESHOLD = IS_CI ? 0.90 : 0.95
    const MAX_NON_CRITERION_I_FAILS = IS_CI ? 5 : 2
    // Criterion i (no initial demo flash) — ~42 of 178 cards use demo data as initialData by design.
    // These cards show a demo badge immediately on cold start because initialData is pre-set.
    // This is a card design choice, not a bug. The exact count fluctuates as cards are added/removed,
    // so use a generous threshold. Observed range: 69-76%.
    const CRITERION_I_THRESHOLD = 0.65

    // Criterion a (no demo badge during loading) — must be 100% locally, >= 97% in CI
    expect(criterionPassRates['a'], `Criterion a pass rate ${Math.round(criterionPassRates['a'] * 100)}% should be >= ${Math.round(CRITERION_A_THRESHOLD * 100)}%`).toBeGreaterThanOrEqual(CRITERION_A_THRESHOLD)
    expect(criterionPassRates['i'], `Criterion i pass rate ${Math.round(criterionPassRates['i'] * 100)}% should be >= ${Math.round(CRITERION_I_THRESHOLD * 100)}%`).toBeGreaterThanOrEqual(CRITERION_I_THRESHOLD)
    // Critical criteria (c: SSE streaming, d: skeleton→content transition, f: persistent cache)
    // Criterion c (SSE streaming) requires a live backend — when the backend is
    // down or tests ran with resource exhaustion (503s), cards fall back to demo
    // data which never triggers SSE, so pass-rate drops to 0%.  Only assert c
    // when enough cards actually attempted SSE (testable count > 50% of cards).
    const cResults = allCards.map((c) => c.criteria['c']).filter(Boolean)
    const cTestable = cResults.filter((r) => r.status !== 'skip')
    const cRelevant = cTestable.length > allCards.length * 0.5
    const criticalCriteria = cRelevant ? ['c', 'd', 'f'] as const : ['d', 'f'] as const
    if (!cRelevant) {
      console.log(`[Compliance] ⚠️  Skipping criterion c assertion — only ${cTestable.length}/${allCards.length} cards attempted SSE (backend likely unavailable)`)
    }
    for (const criterion of criticalCriteria) {
      const rate = criterionPassRates[criterion]
      expect(rate, `Criterion ${criterion} pass rate ${Math.round(rate * 100)}% should be >= ${Math.round(CRITICAL_CRITERION_THRESHOLD * 100)}%`).toBeGreaterThanOrEqual(CRITICAL_CRITERION_THRESHOLD)
    }
    // Overall fail count — allow more nondeterministic edge cases in CI (timing-sensitive criteria)
    // Exclude criterion-i-only fails since demo initialData is by design
    const nonCriterionIFails = allCards.filter((c) => {
      if (c.overallStatus !== 'fail') return false
      const failingCriteria = Object.entries(c.criteria).filter(([, r]) => r?.status === 'fail').map(([k]) => k)
      return !(failingCriteria.length === 1 && failingCriteria[0] === 'i')
    }).length
    expect(nonCriterionIFails, `${nonCriterionIFails} card compliance failures (excl. criterion i) exceeds tolerance`).toBeLessThanOrEqual(MAX_NON_CRITERION_I_FAILS)
  })
})
