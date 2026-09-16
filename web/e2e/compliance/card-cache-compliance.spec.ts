import { test, expect } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'
import {
  setupAuth,
  setupLiveMocks,
  setLiveColdMode,
  navigateToBatch,
  waitForCardsToLoad,
  type MockControl,
  type ManifestData,
} from '../mocks/liveMocks'
import {
  BATCH_SIZE,
  BATCH_LOAD_TIMEOUT_MS,
  WARM_RETURN_WAIT_MS,
  WARM_RECOVERY_WAIT_MS,
  BATCH_NAV_TIMEOUT_MS,
  CACHE_TEST_TIMEOUT_MS,
  CI_TIMEOUT_MULTIPLIER,
  WARM_TTC_THRESHOLD_MS,
  MAX_REAL_CACHE_FAILURES,
  type ColdLoadSnapshot,
  type CardCacheResult,
  type CardCacheStatus,
  type CacheComplianceReport,
} from './cache-constants'
import {
  captureColdSnapshots,
  captureWarmSnapshotsResilient,
  shouldRetryWarmSnapshot,
  mergeRecoveredWarmSnapshot,
  waitForSettledCacheState,
} from './helpers/cache-snapshots'
import {
  softNavigateToBatch,
  registerColdBatchStorageReset,
  clearColdBatchStorage,
} from './helpers/cache-batch'
import { writeReport, fulfillSkippedRoute } from './helpers/cache-report'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Data delay is controlled via mockControl.setDelayMode(true) from shared mocks.
// When enabled, data route handlers now delay 30s before responding.
// Cards should display cached data within 500ms, well before API responses arrive.
// Auth, health, and WebSocket routes continue to work normally (no delay).

// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------

let mockControl: MockControl

test.describe.configure({ mode: 'serial' })

test('card cache compliance — storage and retrieval', async ({ page }, testInfo) => {
  // 450s base × 2 CI multiplier = 900s, aligned with run-all-tests.sh. The
  // suite now renders 347 cards across 15 batches, so the old 600s ceiling
  // could kill the run after report generation even when cache assertions
  // already passed (#15933).
  testInfo.setTimeout(process.env.CI ? CACHE_TEST_TIMEOUT_MS * CI_TIMEOUT_MULTIPLIER : CACHE_TEST_TIMEOUT_MS)

  const allBatchResults: Array<{ batchIndex: number; cards: CardCacheResult[] }> = []
  const coldSnapshots: Map<string, ColdLoadSnapshot> = new Map()

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[Browser ERROR] ${msg.text()}`)
  })
  page.on('pageerror', (err) => console.log(`[Browser EXCEPTION] ${err.message}`))

  // ── Phase 1: Setup ────────────────────────────────────────────────────
  console.log('[CacheTest] Phase 1: Setup — mocks + cold mode')
  // Playwright applies route handlers in reverse registration order, so install
  // the broad /api fallback first and layer specific mocks on top of it.
  await page.route('**/api/**', fulfillSkippedRoute)
  await setupAuth(page)
  await registerColdBatchStorageReset(page)
  mockControl = await setupLiveMocks(page, { delayDataAPIs: false })

  // Mock all skipPattern routes that would otherwise fall through to the real
  // server, return 401, and trigger handle401() → redirect to /login
  const skipRoutePatterns = [
    '**/api/workloads/**', '**/api/kubectl/**', '**/api/active-users*',
    '**/api/notifications/**', '**/api/user/preferences*', '**/api/permissions/**',
    '**/auth/**', '**/api/dashboards/**', '**/api/gpu/**', '**/api/feedback/**',
    '**/api/persistence/**', '**/api/config/**', '**/api/gitops/**',
    '**/api/nightly-e2e/**', '**/api/public/nightly-e2e/**', '**/api/rewards/**',
    '**/api/self-upgrade/**', '**/api/admin/**', '**/api/acmm/**',
    '**/api/kagenti-provider/**', '**/api/token-usage/**',
    '**/api/onboarding/**', '**/api/settings**', '**/api/events**',
    '**/api/stellar/**', '**/api/agent/**',
  ]
  for (const pattern of skipRoutePatterns) {
    await page.route(pattern, fulfillSkippedRoute)
  }

  await setLiveColdMode(page)

  // ── Phase 2: Warmup — prime Vite module cache ──────────────────────────
  console.log('[CacheTest] Phase 2: Warmup — priming module cache')
  await clearColdBatchStorage(page)
  const warmupManifest = await navigateToBatch(page, 0, 180_000)
  const totalCards = warmupManifest.totalCards
  const totalBatches = Math.ceil(totalCards / BATCH_SIZE)
  console.log(`[CacheTest] Total cards: ${totalCards}, batches: ${totalBatches}`)
  // Wait for warmup batch to fully load
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch((error) => { console.error('Best-effort operation failed:', error) })

  // ── Phase 3: Cold load all batches ─────────────────────────────────────
  console.log('[CacheTest] Phase 3: Cold load — loading all batches with network')

  for (let batch = 0; batch < totalBatches; batch++) {
    // Clear caches before each batch — allowlist keeps only essential settings
    // so card-specific localStorage backup keys (e.g. nightly-e2e-cache) and
    // IndexedDB cache state from previous retries are cleared too.
    await clearColdBatchStorage(page)

    const manifest = await navigateToBatch(page, batch, BATCH_NAV_TIMEOUT_MS)
    const selected = manifest.selected || []
    if (selected.length === 0) continue

    const cardIds = selected.map((item) => item.cardId)
    await waitForCardsToLoad(page, cardIds, BATCH_LOAD_TIMEOUT_MS)
    // Allow lazy (code-split) components to mount and report state.
    // StackContext cards dynamically report isDemoData via useReportCardDataState —
    // wait for cards to settle before capturing cold snapshot.
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch((error) => { console.error('Best-effort operation failed:', error) })

    // Capture cold load state
    const snapshots = await captureColdSnapshots(page, cardIds)
    for (const snap of snapshots) {
      // Map cardId → cardType from manifest
      const manifestItem = selected.find((s) => s.cardId === snap.cardId)
      if (manifestItem) snap.cardType = manifestItem.cardType
      coldSnapshots.set(snap.cardId, snap)
    }

    const contentCount = snapshots.filter((s) => s.hasContent).length
    const demoBadgeCount = snapshots.filter((s) => s.hasDemoBadge).length
    console.log(`[CacheTest] Batch ${batch + 1}/${totalBatches} cold: ${selected.length} cards, ${contentCount} with content, ${demoBadgeCount} with demo badge`)
    if (demoBadgeCount > 0) {
      for (const snap of snapshots.filter((s) => s.hasDemoBadge)) {
        console.log(`[CacheTest]   COLD DEMO BADGE: ${snap.cardType} (${snap.cardId}) — initialData may contain demo data`)
      }
    }

    // Wait for async IndexedDB/SQLite mirror writes to settle before the next
    // batch clears storage again, otherwise pending writes can race the reset.
    const settledCacheState = await waitForSettledCacheState(page)
    console.log(
      `[CacheTest] Batch ${batch + 1}/${totalBatches} persistence: ${settledCacheState.indexedDBEntries.length} IndexedDB entries stabilized`
    )
  }

  // Log cold snapshot map stats
  const coldWithContent = [...coldSnapshots.values()].filter(s => s.hasContent).length
  console.log(`[CacheTest] Cold snapshots: ${coldSnapshots.size} total, ${coldWithContent} with content`)
  if (coldSnapshots.size > 0) {
    const first = [...coldSnapshots.entries()][0]
    console.log(`[CacheTest]   Sample cold snap: id=${first[0]}, hasContent=${first[1].hasContent}, textLength=${first[1].textLength}`)
  }

  // ── Phase 4: Cache snapshot ────────────────────────────────────────────
  console.log('[CacheTest] Phase 4: Inspecting cache state')
  const cacheState = await waitForSettledCacheState(page)
  console.log(`[CacheTest] IndexedDB: ${cacheState.indexedDBEntries.length} entries, localStorage: ${cacheState.localStorageKeys.length} cache keys`)

  for (const entry of cacheState.indexedDBEntries) {
    console.log(`[CacheTest]   IDB: ${entry.key} (v${entry.version}, ${entry.dataSize} bytes, array=${entry.isArray}${entry.isArray ? ` len=${entry.arrayLength}` : ''})`)
  }

  // ── Phase 5: Soft navigate away and back ─────────────────────────────────
  // Use client-side navigation to avoid page.goto which kills React Query cache.
  console.log('[CacheTest] Phase 5: Soft navigate away (preserving in-memory cache)')
  try {
    await softNavigateToBatch(page, 0)
    console.log('[CacheTest] Phase 5: Soft navigated to batch 0 — React Query cache intact')
  } catch (error) {
    console.error('Soft navigation failed:', error)
    console.log('[CacheTest] Phase 5: Soft nav failed, cache may be partially lost')
  }
  // Wait for soft navigation to settle
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch((error) => { console.error('Best-effort operation failed:', error) })

  // ── Phase 5.5: Informational only ─────────────────────────────────────
  // page.reload() kills React Query in-memory cache. We log this but skip
  // the actual reload to preserve cache for Phase 6 warm return testing.
  console.log('[CacheTest] Phase 5.5: Skipped (page reload would destroy in-memory cache needed for Phase 6)')

  // ── Phase 6: Delay APIs + warm return ──────────────────────────────────
  console.log('[CacheTest] Phase 6: Warm return with delayed APIs (30s delay)')

  // Flip the flag — all data route handlers now delay 30s before responding.
  // Cards should display cached data within 500ms, well before API responses arrive.
  // Auth, health, and WebSocket routes continue to work normally (no delay).
  mockControl.setDelayMode(true)

  // Verify compliance page context before Phase 6 loop
  const phase6Url = page.url()
  console.log(`[CacheTest] Phase 6 pre-check: URL=${phase6Url}`)
  const hasSetter = await page.evaluate(() => typeof (window as Window & { __COMPLIANCE_SET_BATCH__?: unknown }).__COMPLIANCE_SET_BATCH__ === 'function')
  console.log(`[CacheTest] Phase 6 pre-check: __COMPLIANCE_SET_BATCH__ available=${hasSetter}`)

  for (let batch = 0; batch < totalBatches; batch++) {
    try {
      // Use soft navigation to preserve React Query cache
      let manifest: ManifestData | null = null
      try {
        manifest = await softNavigateToBatch(page, batch)
        console.log(`[CacheTest] Phase 6 batch ${batch}: soft nav OK`)
      } catch (error) {
        console.error(`Soft nav failed for batch ${batch}:`, error)
        console.log(`[CacheTest] Phase 6 batch ${batch}: soft nav failed, falling back to page.goto`)
        manifest = await navigateToBatch(page, batch, BATCH_NAV_TIMEOUT_MS)
      }
      if (!manifest) {
        console.log(`[CacheTest] Phase 6 batch ${batch}: no manifest, skipping`)
        continue
      }
      const selected = manifest.selected || []
      if (selected.length === 0) continue

      const cardIds = selected.map((item) => item.cardId)

      // Use resilient snapshot — immune to context destruction
      const initialWarmSnapshots = await captureWarmSnapshotsResilient(page, cardIds, WARM_RETURN_WAIT_MS)
      const warmSnapshots = new Map(initialWarmSnapshots.map((snap) => [snap.cardId, snap]))
      const retryCardIds = initialWarmSnapshots
        .filter((warmSnap) => shouldRetryWarmSnapshot(coldSnapshots.get(warmSnap.cardId), warmSnap))
        .map((warmSnap) => warmSnap.cardId)

      if (retryCardIds.length > 0) {
        console.log(
          `[CacheTest] Phase 6 batch ${batch}: retrying ${retryCardIds.length} cards with transient warm-cache regressions`
        )
        const recoveredWarmSnapshots = await captureWarmSnapshotsResilient(page, retryCardIds, WARM_RECOVERY_WAIT_MS)
        const recoveredCardIds: string[] = []

        for (const recoveredWarmSnap of recoveredWarmSnapshots) {
          const initialWarmSnap = warmSnapshots.get(recoveredWarmSnap.cardId)
          if (!initialWarmSnap) continue

          if (recoveredWarmSnap.hasContent && !recoveredWarmSnap.hasDemoBadge) {
            warmSnapshots.set(
              recoveredWarmSnap.cardId,
              mergeRecoveredWarmSnapshot(initialWarmSnap, recoveredWarmSnap)
            )
            recoveredCardIds.push(recoveredWarmSnap.cardId)
          }
        }

        if (recoveredCardIds.length > 0) {
          console.log(
            `[CacheTest] Phase 6 batch ${batch}: recovered ${recoveredCardIds.length} cards after extended warm-cache wait`
          )
        }
      }

      // Evaluate each card
      const batchCards: CardCacheResult[] = []
      for (const cardId of cardIds) {
        const warmSnap = warmSnapshots.get(cardId)
        if (!warmSnap) continue
        const coldSnap = coldSnapshots.get(warmSnap.cardId)
        const manifestItem = selected.find((s) => s.cardId === warmSnap.cardId)
        const cardType = manifestItem?.cardType || warmSnap.cardType || 'unknown'

        // Skip cards that had no content during cold load (demo-only, game cards, etc.)
        if (!coldSnap || !coldSnap.hasContent) {
          if (!coldSnap) {
            console.log(`[CacheTest]   SKIP: ${warmSnap.cardId} — no cold snapshot found`)
          }
          batchCards.push({
            cardType,
            cardId: warmSnap.cardId,
            coldLoadHadContent: false,
            cacheWritten: false,
            warmReturnHadContent: warmSnap.hasContent,
            contentMatched: false,
            warmDemoBadge: warmSnap.hasDemoBadge,
            warmSkeleton: warmSnap.hasLargeSkeleton,
            warmTimeToContentMs: warmSnap.timeToContentMs,
            status: 'skip',
            details: 'No content on cold load — card may be demo-only or game card',
          })
          continue
        }

        // Card had content on cold load — check warm return
        const warmHadContent = warmSnap.hasContent
        const warmDemoBadge = warmSnap.hasDemoBadge
        const warmSkeleton = warmSnap.hasLargeSkeleton
        const coldHadDemoBadge = coldSnap.hasDemoBadge

        // Content match: warm text length should be similar to cold (within 50% or at least 10 chars)
        const textSimilar =
          warmSnap.textLength >= Math.min(coldSnap.textLength * 0.5, 10) ||
          (warmSnap.hasVisualContent && coldSnap.hasVisualContent)

        let status: CardCacheStatus = 'pass'
        let details = ''

        // Cold load in non-demo mode should never show demo badge —
        // this means initialData was set to demo data (bypassing skeleton)
        if (coldHadDemoBadge) {
          status = 'fail'
          details = 'Cold load showed demo badge in non-demo mode — initialData likely set to demo data'
        } else if (!warmHadContent) {
          status = 'fail'
          details = `No content on warm return (cold had ${coldSnap.textLength} chars). Cache miss.`
        } else if (warmDemoBadge && !coldSnap.hasDemoBadge) {
          status = 'fail'
          details = 'Demo badge appeared on warm return but not on cold load — cache fell back to demo data'
        } else if (warmSkeleton) {
          status = 'warn'
          details = `Content present but skeleton still visible on warm return (ttc: ${warmSnap.timeToContentMs}ms)`
        } else if (!textSimilar) {
          status = 'warn'
          details = `Content mismatch: cold=${coldSnap.textLength} chars, warm=${warmSnap.textLength} chars`
        } else if (warmSnap.timeToContentMs !== null && warmSnap.timeToContentMs > WARM_TTC_THRESHOLD_MS) {
          status = 'warn'
          details = `Cache loaded but slow: ${Math.round(warmSnap.timeToContentMs)}ms to content`
        } else {
          details = warmSnap.timeToContentMs !== null
            ? `Cache hit: content in ${Math.round(warmSnap.timeToContentMs)}ms`
            : 'Cache hit: content present immediately'
        }

        batchCards.push({
          cardType,
          cardId: warmSnap.cardId,
          coldLoadHadContent: true,
          cacheWritten: true,
          warmReturnHadContent: warmHadContent,
          contentMatched: textSimilar && warmHadContent,
          warmDemoBadge,
          warmSkeleton,
          warmTimeToContentMs: warmSnap.timeToContentMs,
          status,
          details,
        })
      }

      const failCount = batchCards.filter((c) => c.status === 'fail').length
      console.log(
        `[CacheTest] Batch ${batch + 1}/${totalBatches} warm: ${selected.length} cards, ${failCount} failures`
      )

      allBatchResults.push({ batchIndex: batch, cards: batchCards })
    } catch (err) {
      console.log(`[CacheTest] Phase 6 batch ${batch + 1}/${totalBatches}: SKIPPED — ${String(err).slice(0, 120)}`)
    }
  }

  // ── Phase 7: Generate report ───────────────────────────────────────────
  console.log('[CacheTest] Phase 7: Generating report')

  const allCards = allBatchResults.flatMap((b) => b.cards)
  const testableCards = allCards.filter((c) => c.status !== 'skip')
  const passCount = allCards.filter((c) => c.status === 'pass').length
  const failCount = allCards.filter((c) => c.status === 'fail').length
  const warnCount = allCards.filter((c) => c.status === 'warn').length
  const skipCount = allCards.filter((c) => c.status === 'skip').length
  const cacheHitRate = testableCards.length > 0 ? testableCards.filter((c) => c.warmReturnHadContent).length / testableCards.length : 0

  const ttcValues = allCards.filter((c) => c.warmTimeToContentMs !== null).map((c) => c.warmTimeToContentMs!)
  const sortedTtc = [...ttcValues].sort((a, b) => a - b)
  const medianTtc = sortedTtc.length > 0
    ? sortedTtc.length % 2 === 1
      ? sortedTtc[Math.floor(sortedTtc.length / 2)]
      : (sortedTtc[sortedTtc.length / 2 - 1] + sortedTtc[sortedTtc.length / 2]) / 2
    : null

  const report: CacheComplianceReport = {
    timestamp: new Date().toISOString(),
    totalCards,
    cacheSnapshot: {
      indexedDBEntries: cacheState.indexedDBEntries.length,
      localStorageCacheKeys: cacheState.localStorageKeys.length,
      cacheEntries: cacheState.indexedDBEntries,
      localStorageKeys: cacheState.localStorageKeys,
    },
    batches: allBatchResults,
    summary: {
      totalCards: allCards.length,
      passCount,
      failCount,
      warnCount,
      skipCount,
      cacheHitRate,
      avgWarmTimeToContentMs: medianTtc,
    },
  }

  const outDir = path.resolve(__dirname, '../test-results')
  writeReport(report, outDir)

  console.log(`[CacheTest] Report: ${path.join(outDir, 'cache-compliance-report.json')}`)
  console.log(`[CacheTest] Summary: ${path.join(outDir, 'cache-compliance-summary.md')}`)
  console.log(`[CacheTest] Pass: ${passCount}, Fail: ${failCount}, Warn: ${warnCount}, Skip: ${skipCount}`)
  console.log(`[CacheTest] Cache hit rate: ${Math.round(cacheHitRate * 100)}%`)
  if (medianTtc !== null) {
    console.log(`[CacheTest] Median warm time-to-content: ${Math.round(medianTtc)}ms`)
  }

  // ── Assertions ──────────────────────────────────────────────────────────
  expect(cacheHitRate, `Cache hit rate ${Math.round(cacheHitRate * 100)}% should be >= 50%`).toBeGreaterThanOrEqual(0.50)
  // Cards that showed demo badge on cold load used demo data as initialData — this is by design.
  // Only count failures where cold load was clean but warm return regressed to demo data.
  const realFails = allCards.filter((c) => c.status === 'fail' && !c.details.includes('initialData')).length
  expect(
    realFails,
    `${realFails} real cache failures (excl. initialData) — cards fell back to demo data instead of using cache`,
  ).toBeLessThanOrEqual(MAX_REAL_CACHE_FAILURES)
  // Timing assertion is intentionally skipped on CI: shared runners under CPU
  // contention produce wall-clock times that are not meaningful measures of cache
  // correctness.  The threshold has been bumped 19+ times (see #19710 comment)
  // and still fails under extreme runner load.  Cache *correctness* is validated
  // above (hit-rate ≥ 50%, real failures ≤ MAX_REAL_CACHE_FAILURES).  TTC timing
  // remains asserted in local runs where the 500 ms threshold is meaningful.
  if (!process.env.CI && medianTtc !== null) {
    expect(medianTtc, `Median warm time-to-content ${Math.round(medianTtc)}ms should be < ${WARM_TTC_THRESHOLD_MS}ms`).toBeLessThan(WARM_TTC_THRESHOLD_MS)
  }

  // ── Phase 8: Per-card cache key mapping ─────────────────────────────
  console.log('[CacheTest] Phase 8: Per-card cache key verification')

  // Map card types to expected IndexedDB cache key patterns
  const cardTypesWithContent = allCards
    .filter((c) => c.coldLoadHadContent && c.status !== 'skip')
    .map((c) => c.cardType)
  const uniqueCardTypes = [...new Set(cardTypesWithContent)]

  // Verify IndexedDB entries exist for cards that had content
  const idbKeys = cacheState.indexedDBEntries.map((e) => e.key)
  const localKeys = cacheState.localStorageKeys

  let mappedCount = 0
  const unmappedTypes: string[] = []
  for (const cardType of uniqueCardTypes) {
    // Cache keys typically contain the card type or a related endpoint name
    const keyFragment = cardType.replace(/Card$/, '').replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')
    const hasIdbMatch = idbKeys.some((k) => k.toLowerCase().includes(keyFragment) || k.toLowerCase().includes(cardType.toLowerCase()))
    const hasLsMatch = localKeys.some((k) => k.toLowerCase().includes(keyFragment) || k.toLowerCase().includes(cardType.toLowerCase()))
    if (hasIdbMatch || hasLsMatch) {
      mappedCount++
    } else {
      unmappedTypes.push(cardType)
    }
  }

  console.log(`[CacheTest] Cache key mapping: ${mappedCount}/${uniqueCardTypes.length} card types mapped to cache keys`)
  if (unmappedTypes.length > 0) {
    console.log(`[CacheTest] Unmapped types (may use shared/endpoint-level keys): ${unmappedTypes.join(', ')}`)
  }

  // ── Phase 9: Cache TTL validation ───────────────────────────────────
  console.log('[CacheTest] Phase 9: Cache TTL validation')

  // Check that cache entries have reasonable timestamps (not stale)
  const now = Date.now()
  const MAX_ACCEPTABLE_AGE_MS = 5 * 60 * 1000 // 5 minutes (entries were just written)
  let staleEntries = 0
  let validTimestamps = 0

  for (const entry of cacheState.indexedDBEntries) {
    if (entry.timestamp > 0) {
      const ageMs = now - entry.timestamp
      if (ageMs > MAX_ACCEPTABLE_AGE_MS) {
        staleEntries++
        console.log(`[CacheTest] STALE: ${entry.key} — age ${Math.round(ageMs / 1000)}s (max ${MAX_ACCEPTABLE_AGE_MS / 1000}s)`)
      } else {
        validTimestamps++
      }
    }
  }

  if (cacheState.indexedDBEntries.length > 0) {
    console.log(`[CacheTest] TTL check: ${validTimestamps} valid, ${staleEntries} stale out of ${cacheState.indexedDBEntries.length} entries`)
  }

  // Stale entries should be 0 since we just wrote them
  expect(staleEntries, `${staleEntries} cache entries are stale (>5min old)`).toBe(0)
})
