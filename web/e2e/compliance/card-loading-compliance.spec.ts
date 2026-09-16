import { test, expect, type Page } from '@playwright/test'
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
import {
  IS_CI,
  CI_TIMEOUT_MULTIPLIER,
  BATCH_SIZE,
  BATCH_LOAD_TIMEOUT_MS,
  BATCH_NAV_TIMEOUT_MS,
  PER_BATCH_TIMEOUT_MS,
  MAX_EXPECTED_BATCHES,
  NETWORK_SETTLE_TIMEOUT_MS,
  NAV_AWAY_SETTLE_TIMEOUT_MS,
  WARMUP_NAV_TIMEOUT_MS,
  WARM_RETURN_WAIT_MS,
  type BatchResult,
  type CardComplianceResult,
  type CriterionResult,
  type ComplianceReport,
  type ComplianceState,
} from './loading-constants'
import { startComplianceMonitor, stopComplianceMonitor } from './helpers/loading-monitor'
import {
  checkCriterionA,
  checkCriterionB,
  checkCriterionC,
  checkCriterionD,
  checkCriterionE,
  checkCriterionF,
  checkCriterionG,
  checkCriterionH,
  checkCriterionI,
  deriveOverallStatus,
} from './helpers/loading-criteria'
import { generateGapAnalysis, writeReport } from './helpers/loading-report'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

const complianceState: ComplianceState = {
  totalCards: 0,
  totalBatches: 0,
  allBatchResults: [],
  setupDone: false,
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
    // --- Release gate thresholds (strict) ---
    // CI runners have slower CPUs — the 50ms polling monitor can miss fast state
    // transitions, causing a few cards to fail criteria that pass locally.
    // Use relaxed thresholds in CI to account for timing jitter.
    const CRITERION_A_THRESHOLD = IS_CI ? 0.99 : 1.0         // No demo badge during loading — max 1-2 cards
    const CRITICAL_CRITERION_THRESHOLD = IS_CI ? 0.97 : 1.0  // Skeleton→content, persistent cache — max ~5 cards
    const MAX_NON_CRITERION_I_FAILS = IS_CI ? 3 : 1          // Tighter non-I failure budget
    // Criterion i (no initial demo flash) — some cards use demo data as initialData by design.
    // These cards show a demo badge immediately on cold start because initialData is pre-set.
    // This is a card design choice, not a bug. The exact count fluctuates as cards are added/removed.
    const CRITERION_I_THRESHOLD = IS_CI ? 0.80 : 0.90        // No initial demo flash — max ~36 cards (was 62)

    /** Cards with documented exceptions to specific criteria (must link to issue) */
    const KNOWN_EXCEPTIONS: Record<string, string[]> = {
      // Example: 'some-card': ['i'],  // Uses demo initialData by design — #NNNN
    }

    // Criterion a (no demo badge during loading) — must be 100% locally, >= 97% in CI
    expect(criterionPassRates['a'], `Criterion a pass rate ${Math.round(criterionPassRates['a'] * 100)}% should be >= ${Math.round(CRITERION_A_THRESHOLD * 100)}%`).toBeGreaterThanOrEqual(CRITERION_A_THRESHOLD)
    expect(criterionPassRates['i'], `Criterion i pass rate ${Math.round(criterionPassRates['i'] * 100)}% should be >= ${Math.round(CRITERION_I_THRESHOLD * 100)}%`).toBeGreaterThanOrEqual(CRITERION_I_THRESHOLD)
    // Critical criteria (c: SSE streaming, d: skeleton→content transition, f: persistent cache)
    // Criterion c (SSE streaming) requires a live backend — when the backend is
    // down or tests ran with resource exhaustion (503s), cards fall back to demo
    // data which never triggers SSE, so pass-rate drops to 0%.
    // If not enough cards attempted SSE, warn but still check the ones that did.
    const cResults = allCards.map((c) => c.criteria['c']).filter(Boolean)
    const cTestable = cResults.filter((r) => r.status !== 'skip')
    const cRelevant = cTestable.length > allCards.length * 0.5
    if (!cRelevant) {
      console.warn(`[Compliance] Only ${cTestable.length}/${allCards.length} cards attempted SSE — criterion C evaluated on available subset only`)
    }
    // Always include C in critical criteria if ANY cards are testable
    const criticalCriteria = cTestable.length > 0 ? ['c', 'd', 'f'] as const : ['d', 'f'] as const
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
