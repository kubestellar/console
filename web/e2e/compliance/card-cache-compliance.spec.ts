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
  type ManifestItem,
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
const BATCH_LOAD_TIMEOUT_MS = 20_000
const WARM_RETURN_WAIT_MS = 3_000
const WARM_POLL_INTERVAL_MS = 50


// Mock data, setupAuth, setupLiveMocks, setLiveColdMode, navigateToBatch,
// waitForCardsToLoad imported from ../mocks/liveMocks
let mockControl: MockControl

// ---------------------------------------------------------------------------
// Card state capture helpers
// ---------------------------------------------------------------------------

async function captureColdSnapshots(page: Page, cardIds: string[]): Promise<ColdLoadSnapshot[]> {
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
}

async function captureWarmSnapshots(
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

test('card cache compliance — storage and retrieval', async ({ page }) => {
  const allBatchResults: Array<{ batchIndex: number; cards: CardCacheResult[] }> = []
  const coldSnapshots: Map<string, ColdLoadSnapshot> = new Map()
  let totalCards = 0

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[Browser ERROR] ${msg.text()}`)
  })
  page.on('pageerror', (err) => console.log(`[Browser EXCEPTION] ${err.message}`))

  // ── Phase 1: Setup ────────────────────────────────────────────────────
  console.log('[CacheTest] Phase 1: Setup — mocks + cold mode')
  await setupAuth(page)
  mockControl = await setupLiveMocks(page, { delayDataAPIs: false })
  await setLiveColdMode(page)

  // ── Phase 2: Warmup — prime Vite module cache ──────────────────────────
  console.log('[CacheTest] Phase 2: Warmup — priming module cache')
  const warmupManifest = await navigateToBatch(page, 0, 180_000)
  totalCards = warmupManifest.totalCards
  const totalBatches = Math.ceil(totalCards / BATCH_SIZE)
  console.log(`[CacheTest] Total cards: ${totalCards}, batches: ${totalBatches}`)
  await page.waitForTimeout(3_000)

  // ── Phase 3: Cold load all batches ─────────────────────────────────────
  console.log('[CacheTest] Phase 3: Cold load — loading all batches with network')

  for (let batch = 0; batch < totalBatches; batch++) {
    // Clear caches before each batch for true cold start
    await page.evaluate(() => {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (!key) continue
        if (key.includes('dashboard-cards') || key.startsWith('cache:') || key.includes('kubestellar-stack-cache')) {
          localStorage.removeItem(key)
        }
      }
      localStorage.setItem('kc-demo-mode', 'false')
      localStorage.setItem('token', 'test-token')
    })

    const manifest = await navigateToBatch(page, batch)
    const selected = manifest.selected || []
    if (selected.length === 0) continue

    const cardIds = selected.map((item) => item.cardId)
    await waitForCardsToLoad(page, cardIds, BATCH_LOAD_TIMEOUT_MS)
    // Allow lazy (code-split) components to mount and report state.
    // StackContext cards dynamically report isDemoData via useReportCardDataState —
    // without this wait the cold snapshot may capture before the child reports.
    await page.waitForTimeout(500)

    // Capture cold load state
    const snapshots = await captureColdSnapshots(page, cardIds)
    for (const snap of snapshots) {
      // Map cardId → cardType from manifest
      const manifestItem = selected.find((s) => s.cardId === snap.cardId)
      if (manifestItem) snap.cardType = manifestItem.cardType
      coldSnapshots.set(snap.cardId, snap)
    }

    const contentCount = snapshots.filter((s) => s.hasContent).length
    console.log(`[CacheTest] Batch ${batch + 1}/${totalBatches} cold: ${selected.length} cards, ${contentCount} with content`)
  }

  // ── Phase 4: Cache snapshot ────────────────────────────────────────────
  console.log('[CacheTest] Phase 4: Inspecting cache state')
  const cacheState = await snapshotCacheState(page)
  console.log(`[CacheTest] IndexedDB: ${cacheState.indexedDBEntries.length} entries, localStorage: ${cacheState.localStorageKeys.length} cache keys`)

  for (const entry of cacheState.indexedDBEntries) {
    console.log(`[CacheTest]   IDB: ${entry.key} (v${entry.version}, ${entry.dataSize} bytes, array=${entry.isArray}${entry.isArray ? ` len=${entry.arrayLength}` : ''})`)
  }

  // ── Phase 5: Navigate away ─────────────────────────────────────────────
  console.log('[CacheTest] Phase 5: Navigate away')
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  // ── Phase 6: Delay APIs + warm return ──────────────────────────────────
  console.log('[CacheTest] Phase 6: Warm return with delayed APIs (30s delay)')

  // Flip the flag — all data route handlers now delay 30s before responding.
  // Cards should display cached data within 500ms, well before API responses arrive.
  // Auth, health, and WebSocket routes continue to work normally (no delay).
  mockControl.setDelayMode(true)

  for (let batch = 0; batch < totalBatches; batch++) {
    const manifest = await navigateToBatch(page, batch)
    const selected = manifest.selected || []
    if (selected.length === 0) continue

    const cardIds = selected.map((item) => item.cardId)

    // Poll card state over the warm return period
    const warmSnapshots = await captureWarmSnapshots(page, cardIds, WARM_POLL_INTERVAL_MS, WARM_RETURN_WAIT_MS)

    // Evaluate each card
    const batchCards: CardCacheResult[] = []
    for (const warmSnap of warmSnapshots) {
      const coldSnap = coldSnapshots.get(warmSnap.cardId)
      const manifestItem = selected.find((s) => s.cardId === warmSnap.cardId)
      const cardType = manifestItem?.cardType || warmSnap.cardType || 'unknown'

      // Skip cards that had no content during cold load (demo-only, game cards, etc.)
      if (!coldSnap || !coldSnap.hasContent) {
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

      // Content match: warm text length should be similar to cold (within 50% or at least 10 chars)
      const textSimilar =
        warmSnap.textLength >= Math.min(coldSnap.textLength * 0.5, 10) ||
        (warmSnap.hasVisualContent && coldSnap.hasVisualContent)

      let status: CardCacheStatus = 'pass'
      let details = ''

      if (!warmHadContent) {
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
      } else if (warmSnap.timeToContentMs !== null && warmSnap.timeToContentMs > 500) {
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
  expect(cacheHitRate, `Cache hit rate ${Math.round(cacheHitRate * 100)}% should be >= 80%`).toBeGreaterThanOrEqual(0.80)
  // Allow up to 2 card failures (some cards like nightly_e2e_status may fall back to demo data)
  expect(failCount, `${failCount} cache failures found (max 2 allowed)`).toBeLessThanOrEqual(2)
  if (avgTtc !== null) {
    expect(avgTtc, `Avg warm time-to-content ${Math.round(avgTtc)}ms should be < 500ms`).toBeLessThan(500)
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
