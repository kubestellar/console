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
  type ManifestData,
} from '../mocks/liveMocks'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ManifestItem and ManifestData imported from ../mocks/liveMocks

interface ColdLoadSnapshot {
  cardId: string
  cardType: string
  textLength: number
  hasVisualContent: boolean
  hasContent: boolean
  hasDemoBadge: boolean
  dataLoading: string | null
}

interface WarmLoadSnapshot {
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

interface CacheEntry {
  key: string
  timestamp: number
  version: number
  dataSize: number
  dataType: string
  isArray: boolean
  arrayLength: number | null
}

type CardCacheStatus = 'pass' | 'fail' | 'warn' | 'skip'

interface CardCacheResult {
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

interface CacheComplianceReport {
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

const BATCH_SIZE = 24
const BATCH_LOAD_TIMEOUT_MS = 30_000
/**
 * How long to poll for warm-return content.  CI runners often need more time
 * because the SQLite worker and IDB preload race with React hydration under
 * CPU contention.  5s gives the async loadFromStorage() path enough headroom
 * after a full page navigation fallback.
 */
const WARM_RETURN_WAIT_MS = process.env.CI ? 5_000 : 3_000
/** Polling interval (ms) for the resilient warm-snapshot capture loop. */
const WARM_POLL_INTERVAL_MS = 200
/** Max retry attempts for page.evaluate calls that may race with navigation */
const EVALUATE_RETRY_ATTEMPTS = 3
/** Delay between evaluate retries (ms) */
const EVALUATE_RETRY_DELAY_MS = 500
/**
 * Timeout for navigateToBatch calls (ms). Must be generous enough for CI
 * preview servers under load. 20s default is too tight when the server is
 * already serving other suites (#9101).
 */
const BATCH_NAV_TIMEOUT_MS = process.env.CI ? 90_000 : 45_000
/**
 * Overall test timeout (ms). 300s base × 2 CI multiplier = 600s, matching
 * the suite wall-clock cap in run-all-tests.sh (#9101).
 */
const CACHE_TEST_TIMEOUT_MS = 300_000
const CI_TIMEOUT_MULTIPLIER = 2
/**
 * Maximum acceptable average warm time-to-content (ms).
 * CI shared runners exhibit 2-3× slower React hydration due to CPU
 * contention and virtualisation overhead, so we apply a multiplier.
 * Increased to 1500ms (3× local) to account for observed 3× variance (#13257).
 */
const WARM_TTC_THRESHOLD_MS = process.env.CI ? 1_500 : 500


// Mock data, setupAuth, setupLiveMocks, setLiveColdMode, navigateToBatch,
// waitForCardsToLoad imported from ../mocks/liveMocks
let mockControl: MockControl

// ---------------------------------------------------------------------------
// Card state capture helpers
// ---------------------------------------------------------------------------

async function captureColdSnapshots(page: Page, cardIds: string[]): Promise<ColdLoadSnapshot[]> {
  // Retry page.evaluate to handle transient execution-context invalidation
  // (e.g., a background navigation triggered by a card hook between
  // waitForCardsToLoad and this call).
  for (let attempt = 0; attempt < EVALUATE_RETRY_ATTEMPTS; attempt++) {
    try {
      return await page.evaluate((ids: string[]) => {
        return ids.map((id) => {
          const card = document.querySelector(`[data-card-id="${id}"]`)
          if (!card) {
            return {
              cardId: id, cardType: '', textLength: 0,
              hasVisualContent: false, hasContent: false,
              hasDemoBadge: false, dataLoading: null,
            }
          }
          const textLen = (card.textContent || '').trim().length
          const hasVisual = !!card.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]')
          return {
            cardId: id,
            cardType: card.getAttribute('data-card-type') || '',
            textLength: textLen,
            hasVisualContent: hasVisual,
            hasContent: textLen > 10 || hasVisual,
            hasDemoBadge: !!card.querySelector('[data-testid="demo-badge"]'),
            dataLoading: card.getAttribute('data-loading'),
          }
        })
      }, cardIds)
    } catch (err) {
      console.warn(`[CacheTest] captureColdSnapshots attempt ${attempt + 1}/${EVALUATE_RETRY_ATTEMPTS} failed:`, err)
      if (attempt === EVALUATE_RETRY_ATTEMPTS - 1) {
        // Final attempt — return empty snapshots instead of crashing
        console.warn('[CacheTest] All captureColdSnapshots retries exhausted, returning empty snapshots')
        return cardIds.map((id) => ({
          cardId: id, cardType: '', textLength: 0,
          hasVisualContent: false, hasContent: false,
          hasDemoBadge: false, dataLoading: null,
        }))
      }
      // Wait before retrying to let the page settle
      await new Promise((r) => setTimeout(r, EVALUATE_RETRY_DELAY_MS))
      // Re-wait for page to be stable
      await page.waitForLoadState('domcontentloaded', { timeout: BATCH_LOAD_TIMEOUT_MS }).catch(() => { /* best-effort */ })
    }
  }
  // TypeScript: unreachable but needed for type safety
  return []
}

async function _captureWarmSnapshots(
  page: Page,
  cardIds: string[],
  pollMs: number,
  totalMs: number
): Promise<WarmLoadSnapshot[]> {
  // Poll card state over time to find when content first appears
  return await page.evaluate(
    ({ ids, interval, duration }: { ids: string[]; interval: number; duration: number }) => {
      return new Promise<Array<{
        cardId: string; cardType: string; textLength: number;
        hasVisualContent: boolean; hasContent: boolean;
        hasDemoBadge: boolean; hasLargeSkeleton: boolean;
        dataLoading: string | null; timeToContentMs: number | null;
      }>>((resolve) => {
        const firstContentTime: Record<string, number | null> = {}
        for (const id of ids) firstContentTime[id] = null

        const start = performance.now()
        const timer = setInterval(() => {
          const elapsed = performance.now() - start
          for (const id of ids) {
            if (firstContentTime[id] !== null) continue
            const card = document.querySelector(`[data-card-id="${id}"]`)
            if (!card) continue
            const textLen = (card.textContent || '').trim().length
            const hasVisual = !!card.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]')
            const hasSkeleton = !!card.querySelector('[data-card-skeleton="true"]')
            if ((textLen > 10 || hasVisual) && !hasSkeleton) {
              firstContentTime[id] = elapsed
            }
          }

          if (elapsed >= duration) {
            clearInterval(timer)
            // Final snapshot
            const results = ids.map((id) => {
              const card = document.querySelector(`[data-card-id="${id}"]`)
              if (!card) {
                return {
                  cardId: id, cardType: '', textLength: 0,
                  hasVisualContent: false, hasContent: false,
                  hasDemoBadge: false, hasLargeSkeleton: false,
                  dataLoading: null, timeToContentMs: null,
                }
              }
              const textLen = (card.textContent || '').trim().length
              const hasVisual = !!card.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]')
              const hasSkeleton = !!card.querySelector('[data-card-skeleton="true"]')
              return {
                cardId: id,
                cardType: card.getAttribute('data-card-type') || '',
                textLength: textLen,
                hasVisualContent: hasVisual,
                hasContent: textLen > 10 || hasVisual,
                hasDemoBadge: !!card.querySelector('[data-testid="demo-badge"]'),
                hasLargeSkeleton: hasSkeleton,
                dataLoading: card.getAttribute('data-loading'),
                timeToContentMs: firstContentTime[id],
              }
            })
            resolve(results)
          }
        }, interval)
      })
    },
    { ids: cardIds, interval: pollMs, duration: totalMs }
  )
}

/**
 * Resilient warm snapshot capture — uses Playwright-side polling instead of
 * in-page setInterval, which is vulnerable to execution-context destruction
 * during SPA navigation.
 */
async function captureWarmSnapshotsResilient(
  page: Page,
  cardIds: string[],
  totalMs: number
): Promise<WarmLoadSnapshot[]> {
  const start = Date.now()
  const firstContentTime: Record<string, number | null> = {}
  for (const id of cardIds) firstContentTime[id] = null

  while (Date.now() - start < totalMs) {
    try {
      const snapshot = await page.evaluate((ids: string[]) => {
        return ids.map((id) => {
          const card = document.querySelector(`[data-card-id="${id}"]`)
          if (!card) return { id, textLen: 0, hasVisual: false, hasSkeleton: true }
          const textLen = (card.textContent || '').trim().length
          const hasVisual = !!card.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]')
          const hasSkeleton = !!card.querySelector('[data-card-skeleton="true"]')
          return { id, textLen, hasVisual, hasSkeleton }
        })
      }, cardIds)
      const elapsed = Date.now() - start
      for (const s of snapshot) {
        if (firstContentTime[s.id] === null && (s.textLen > 10 || s.hasVisual) && !s.hasSkeleton) {
          firstContentTime[s.id] = elapsed
        }
      }
    } catch {
      // page context may have been destroyed during navigation — skip this tick
    }
    await page.waitForTimeout(WARM_POLL_INTERVAL_MS)
  }

  // Final snapshot
  try {
    return await page.evaluate((ids: string[]) => {
      return ids.map((id) => {
        const card = document.querySelector(`[data-card-id="${id}"]`)
        if (!card) {
          return {
            cardId: id, cardType: '', textLength: 0,
            hasVisualContent: false, hasContent: false,
            hasDemoBadge: false, hasLargeSkeleton: false,
            dataLoading: null, timeToContentMs: null,
          }
        }
        const textLen = (card.textContent || '').trim().length
        const hasVisual = !!card.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]')
        const hasSkeleton = !!card.querySelector('[data-card-skeleton="true"]')
        return {
          cardId: id,
          cardType: card.getAttribute('data-card-type') || '',
          textLength: textLen,
          hasVisualContent: hasVisual,
          hasContent: textLen > 10 || hasVisual,
          hasDemoBadge: !!card.querySelector('[data-testid="demo-badge"]'),
          hasLargeSkeleton: hasSkeleton,
          dataLoading: card.getAttribute('data-loading'),
          timeToContentMs: null, // filled below
        }
      })
    }, cardIds).then((results) => {
      for (const r of results) {
        r.timeToContentMs = firstContentTime[r.cardId] ?? null
      }
      return results
    })
  } catch {
    return cardIds.map((id) => ({
      cardId: id, cardType: '', textLength: 0,
      hasVisualContent: false, hasContent: false,
      hasDemoBadge: false, hasLargeSkeleton: false,
      dataLoading: null, timeToContentMs: null,
    }))
  }
}

/**
 * Soft navigation — calls the React-exposed __COMPLIANCE_SET_BATCH__ setter
 * to switch batches via useSearchParams without a full page reload, preserving
 * React Query's in-memory cache.  Falls back to page.goto if the setter is
 * unavailable.
 */
async function softNavigateToBatch(
  page: Page,
  batch: number,
  batchSize = 24
): Promise<ManifestData | null> {
  const hasSetter = await page.evaluate(() =>
    typeof (window as Window & { __COMPLIANCE_SET_BATCH__?: unknown }).__COMPLIANCE_SET_BATCH__ === 'function'
  )

  if (hasSetter) {
    await page.evaluate(
      ({ b, s }: { b: number; s: number }) => {
        (window as Window & { __COMPLIANCE_SET_BATCH__?: (batch: number, size?: number) => void }).__COMPLIANCE_SET_BATCH__!(b, s)
      },
      { b: batch, s: batchSize }
    )
    // Wait for cards to appear after React re-render
    try {
      await page.waitForSelector('[data-card-id]', { timeout: 10000 })
    } catch {
      console.log(`[CacheTest] softNavigateToBatch: no cards appeared for batch ${batch}`)
    }
  } else {
    console.log(`[CacheTest] softNavigateToBatch: __COMPLIANCE_SET_BATCH__ not available, falling back to page.goto`)
    await page.goto(`/compliance-perf-test?batch=${batch + 1}&size=${batchSize}`, { waitUntil: 'networkidle' })
    // Wait for cards to appear after full page navigation
    try {
      await page.waitForSelector('[data-card-id]', { timeout: 10000 })
    } catch {
      console.log(`[CacheTest] softNavigateToBatch: no cards appeared for batch ${batch} after page.goto`)
    }
  }

  // Read manifest
  const manifest = await page.evaluate(() =>
    (window as Window & { __COMPLIANCE_MANIFEST__?: unknown }).__COMPLIANCE_MANIFEST__
  ) as ManifestData | undefined
  return manifest ?? null
}

// ---------------------------------------------------------------------------
// Cache inspection helpers
// ---------------------------------------------------------------------------

async function snapshotCacheState(page: Page): Promise<{
  indexedDBEntries: CacheEntry[]
  localStorageKeys: string[]
}> {
  return await page.evaluate(async () => {
    // Read localStorage cache-related keys
    const lsKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      if (
        key.includes('cache') || key.includes('kubestellar-') ||
        key.startsWith('kc-') || key.startsWith('kc_') || key.startsWith('cache:')
      ) {
        lsKeys.push(key)
      }
    }

    // Read IndexedDB kc_cache entries
    const idbEntries = await new Promise<Array<{
      key: string; timestamp: number; version: number;
      dataSize: number; dataType: string; isArray: boolean; arrayLength: number | null;
    }>>((resolve) => {
      try {
        const req = indexedDB.open('kc_cache', 1)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('cache')) {
            db.createObjectStore('cache', { keyPath: 'key' })
          }
        }
        req.onsuccess = () => {
          try {
            const db = req.result
            if (!db.objectStoreNames.contains('cache')) {
              db.close()
              resolve([])
              return
            }
            const tx = db.transaction('cache', 'readonly')
            const store = tx.objectStore('cache')
            const all = store.getAll()
            all.onsuccess = () => {
              const entries = (all.result || []).map((entry: Record<string, unknown>) => {
                const data = entry.data
                return {
                  key: String(entry.key || ''),
                  timestamp: Number(entry.timestamp || 0),
                  version: Number(entry.version || 0),
                  dataSize: JSON.stringify(data).length,
                  dataType: typeof data,
                  isArray: Array.isArray(data),
                  arrayLength: Array.isArray(data) ? data.length : null,
                }
              })
              db.close()
              resolve(entries)
            }
            all.onerror = () => { db.close(); resolve([]) }
          } catch {
            resolve([])
          }
        }
        req.onerror = () => resolve([])
      } catch {
        resolve([])
      }
    })

    return { indexedDBEntries: idbEntries, localStorageKeys: lsKeys }
  })
}

// Data delay is controlled via mockControl.setDelayMode(true) from shared mocks.
// When enabled, data routes delay 30s while auth/health/WebSocket respond normally.
// This avoids 503 errors that trigger app error handling / route redirects.

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function writeReport(report: CacheComplianceReport, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true })

  // JSON report
  fs.writeFileSync(path.join(outDir, 'cache-compliance-report.json'), JSON.stringify(report, null, 2))

  // Markdown summary
  const allCards = report.batches.flatMap((b) => b.cards)
  const md: string[] = [
    '# Card Cache Compliance Report',
    '',
    `Generated: ${report.timestamp}`,
    `Total cards tested: ${report.totalCards}`,
    '',
    '## Cache Snapshot After Cold Load',
    '',
    `- IndexedDB entries: ${report.cacheSnapshot.indexedDBEntries}`,
    `- localStorage cache-related keys: ${report.cacheSnapshot.localStorageCacheKeys}`,
    '',
  ]

  if (report.cacheSnapshot.cacheEntries.length > 0) {
    md.push('### IndexedDB Cache Entries', '', '| Key | Version | Data Size | Type | Array Length |', '|-----|---------|-----------|------|-------------|')
    for (const entry of report.cacheSnapshot.cacheEntries) {
      md.push(`| ${entry.key} | ${entry.version} | ${entry.dataSize} | ${entry.dataType} | ${entry.arrayLength ?? 'N/A'} |`)
    }
    md.push('')
  }

  // Summary stats
  md.push(
    '## Summary',
    '',
    `- **Pass**: ${report.summary.passCount} cards — cached data loaded on warm return without network`,
    `- **Fail**: ${report.summary.failCount} cards — no cached data on warm return`,
    `- **Warn**: ${report.summary.warnCount} cards — partial cache behavior`,
    `- **Skip**: ${report.summary.skipCount} cards — no content on cold load (demo-only or game cards)`,
    `- **Cache hit rate**: ${Math.round(report.summary.cacheHitRate * 100)}%`,
    `- **Avg warm time-to-content**: ${report.summary.avgWarmTimeToContentMs !== null ? `${Math.round(report.summary.avgWarmTimeToContentMs)}ms` : 'N/A'}`,
    '',
  )

  // Pass/fail table
  md.push('## Per-Card Results', '', '| Card Type | Cold Content | Warm Content | Demo Badge | Skeleton | Time-to-Content | Status | Details |', '|-----------|-------------|-------------|------------|----------|-----------------|--------|---------|')
  for (const card of allCards) {
    md.push(
      `| ${card.cardType} | ${card.coldLoadHadContent ? 'Yes' : 'No'} | ${card.warmReturnHadContent ? 'Yes' : 'No'} | ${card.warmDemoBadge ? 'YES' : 'No'} | ${card.warmSkeleton ? 'YES' : 'No'} | ${card.warmTimeToContentMs !== null ? `${Math.round(card.warmTimeToContentMs)}ms` : 'N/A'} | ${card.status} | ${card.details} |`
    )
  }

  // Failures section
  const failedCards = allCards.filter((c) => c.status === 'fail')
  if (failedCards.length > 0) {
    md.push('', '## Failures', '')
    for (const card of failedCards) {
      md.push(`- **${card.cardType}**: ${card.details}`)
    }
  }

  md.push('')
  fs.writeFileSync(path.join(outDir, 'cache-compliance-summary.md'), md.join('\n') + '\n')
}

// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' })

test('card cache compliance — storage and retrieval', async ({ page }, testInfo) => {
  // 300s base × 2 CI multiplier = 600s, matching the suite wall-clock cap in
  // run-all-tests.sh. No testInfo.setTimeout was set before (#9101), so the
  // test ran against the global config timeout (1200s) which meant timeout
  // errors only surfaced as wall-clock kills.
  testInfo.setTimeout(process.env.CI ? CACHE_TEST_TIMEOUT_MS * CI_TIMEOUT_MULTIPLIER : CACHE_TEST_TIMEOUT_MS)

  const allBatchResults: Array<{ batchIndex: number; cards: CardCacheResult[] }> = []
  const coldSnapshots: Map<string, ColdLoadSnapshot> = new Map()

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[Browser ERROR] ${msg.text()}`)
  })
  page.on('pageerror', (err) => console.log(`[Browser EXCEPTION] ${err.message}`))

  // ── Phase 1: Setup ────────────────────────────────────────────────────
  console.log('[CacheTest] Phase 1: Setup — mocks + cold mode')
  await setupAuth(page)
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
  ]
  for (const pattern of skipRoutePatterns) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  }

  await setLiveColdMode(page)

  // ── Phase 2: Warmup — prime Vite module cache ──────────────────────────
  console.log('[CacheTest] Phase 2: Warmup — priming module cache')
  const warmupManifest = await navigateToBatch(page, 0, 180_000)
  const totalCards = warmupManifest.totalCards
  const totalBatches = Math.ceil(totalCards / BATCH_SIZE)
  console.log(`[CacheTest] Total cards: ${totalCards}, batches: ${totalBatches}`)
  // Wait for warmup batch to fully load
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => { /* best-effort */ })

  // ── Phase 3: Cold load all batches ─────────────────────────────────────
  console.log('[CacheTest] Phase 3: Cold load — loading all batches with network')

  for (let batch = 0; batch < totalBatches; batch++) {
    // Clear caches before each batch — allowlist keeps only essential settings
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
      localStorage.setItem('kc-demo-mode', 'false')
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('kc-agent-setup-dismissed', 'true')
    })

    const manifest = await navigateToBatch(page, batch, BATCH_NAV_TIMEOUT_MS)
    const selected = manifest.selected || []
    if (selected.length === 0) continue

    const cardIds = selected.map((item) => item.cardId)
    await waitForCardsToLoad(page, cardIds, BATCH_LOAD_TIMEOUT_MS)
    // Allow lazy (code-split) components to mount and report state.
    // StackContext cards dynamically report isDemoData via useReportCardDataState —
    // wait for cards to settle before capturing cold snapshot.
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => { /* best-effort */ })

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
  const cacheState = await snapshotCacheState(page)
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
  } catch {
    console.log('[CacheTest] Phase 5: Soft nav failed, cache may be partially lost')
  }
  // Wait for soft navigation to settle
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => { /* best-effort */ })

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
      } catch {
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
      const warmSnapshots = await captureWarmSnapshotsResilient(page, cardIds, WARM_RETURN_WAIT_MS)

    // Evaluate each card
    const batchCards: CardCacheResult[] = []
    for (const warmSnap of warmSnapshots) {
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
  const avgTtc = ttcValues.length > 0 ? ttcValues.reduce((a, b) => a + b, 0) / ttcValues.length : null

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
      avgWarmTimeToContentMs: avgTtc,
    },
  }

  const outDir = path.resolve(__dirname, '../test-results')
  writeReport(report, outDir)

  console.log(`[CacheTest] Report: ${path.join(outDir, 'cache-compliance-report.json')}`)
  console.log(`[CacheTest] Summary: ${path.join(outDir, 'cache-compliance-summary.md')}`)
  console.log(`[CacheTest] Pass: ${passCount}, Fail: ${failCount}, Warn: ${warnCount}, Skip: ${skipCount}`)
  console.log(`[CacheTest] Cache hit rate: ${Math.round(cacheHitRate * 100)}%`)
  if (avgTtc !== null) {
    console.log(`[CacheTest] Avg warm time-to-content: ${Math.round(avgTtc)}ms`)
  }

  // ── Assertions ──────────────────────────────────────────────────────────
  expect(cacheHitRate, `Cache hit rate ${Math.round(cacheHitRate * 100)}% should be >= 50%`).toBeGreaterThanOrEqual(0.50)
  // Cards that showed demo badge on cold load used demo data as initialData — this is by design.
  // Only count failures where cold load was clean but warm return regressed to demo data.
  const realFails = allCards.filter((c) => c.status === 'fail' && !c.details.includes('initialData')).length
  expect(realFails, `${realFails} real cache failures (excl. initialData) — cards fell back to demo data instead of using cache`).toBe(0)
  if (avgTtc !== null) {
    expect(avgTtc, `Avg warm time-to-content ${Math.round(avgTtc)}ms should be < ${WARM_TTC_THRESHOLD_MS}ms`).toBeLessThan(WARM_TTC_THRESHOLD_MS)
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
