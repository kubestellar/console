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

const BATCH_SIZE = 24
const BATCH_LOAD_TIMEOUT_MS = 20_000
const MONITOR_POLL_INTERVAL_MS = 50
const WARM_RETURN_WAIT_MS = 3_000


// Mock data, setupAuth, setupLiveMocks, setLiveColdMode imported from ../mocks/liveMocks
// navigateToBatch, waitForCardsToLoad imported from ../mocks/liveMocks
let mockControl: MockControl

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
  // Transition: loading → content (data-loading goes from true to false, text > 10 chars)
  const hadLoading = history.some((s) => s.dataLoading === 'true')
  const hadContent = history.some(
    (s) => s.dataLoading === 'false' && (s.textContentLength > 10 || s.hasVisualContent)
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
    (s) => s.dataLoading === 'false' && (s.textContentLength > 10 || s.hasVisualContent)
  )
  if (firstContentIdx === -1) {
    return { criterion: 'e', status: 'skip', details: 'No content phase captured' }
  }

  // Look for spinning refresh in post-content snapshots (incremental refresh)
  const postContent = history.slice(firstContentIdx)
  const hasSpinner = postContent.some((s) => s.hasSpinningRefresh && s.textContentLength > 10)
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

const WARM_GRACE_SNAPSHOTS = 10 // 500ms grace period (10 × 50ms poll interval)

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
    (s) => (s.textContentLength > 10 || s.hasVisualContent) && !s.hasLargeSkeleton
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
    (s) => (s.textContentLength > 10 || s.hasVisualContent) && !s.hasLargeSkeleton
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
    (s) => s.textContentLength > 10 || s.hasVisualContent
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

// ---------------------------------------------------------------------------
// Gap analysis — self-evaluating section for continuous improvement
// ---------------------------------------------------------------------------

function generateGapAnalysis(report: ComplianceReport): GapAnalysisEntry[] {
  const gaps: GapAnalysisEntry[] = []
  const rates = report.summary.criterionPassRates

  // Check for criteria with high skip rates (not enough coverage)
  const allCards = report.batches.flatMap((b) => b.cards)
  for (const criterion of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    const results = allCards.map((c) => c.criteria[criterion]).filter(Boolean)
    const skipCount = results.filter((r) => r.status === 'skip').length
    const skipRate = results.length > 0 ? skipCount / results.length : 0

    if (skipRate > 0.5) {
      gaps.push({
        area: `Criterion ${criterion} coverage`,
        observation: `${Math.round(skipRate * 100)}% of cards skipped criterion ${criterion}`,
        suggestedImprovement:
          criterion === 'e'
            ? 'Consider triggering a manual refresh via button click to test incremental refresh, rather than waiting for auto-refresh timer'
            : `Review test timing — the polling window may be too short to capture the loading→content transition for criterion ${criterion}`,
        priority: skipRate > 0.8 ? 'high' : 'medium',
      })
    }
  }

  // Check if demo badge failures cluster around specific card types
  const failedCards = allCards.filter((c) => c.criteria.a?.status === 'fail')
  if (failedCards.length > 3) {
    const failedTypes = failedCards.map((c) => c.cardType)
    const uniqueTypes = [...new Set(failedTypes)]
    gaps.push({
      area: 'Demo badge contamination',
      observation: `${uniqueTypes.length} card types show demo badges during skeleton: ${uniqueTypes.slice(0, 5).join(', ')}${uniqueTypes.length > 5 ? '...' : ''}`,
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
  if (rates.c !== undefined && rates.c < 0.3) {
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
  }

  for (const criterion of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
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
// Main test
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' })

test('card loading compliance — cold + warm', async ({ page }, testInfo) => {
  testInfo.setTimeout(180_000) // 8 batches cold + warm needs more time
  const allBatchResults: BatchResult[] = []
  let totalCards = 0

  // Capture browser console for debugging
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[Browser ERROR] ${msg.text()}`)
  })
  page.on('pageerror', (err) => console.log(`[Browser EXCEPTION] ${err.message}`))

  // ── Phase 1: Setup mocks ──────────────────────────────────────────────
  await setupAuth(page)
  mockControl = await setupLiveMocks(page, { trackSSERequests: true })
  await setLiveColdMode(page)

  // ── Phase 2: Warmup — prime Vite module cache ─────────────────────────
  console.log('[Compliance] Phase 1: Warmup — priming Vite module cache')

  // Use 180s timeout for cold dev server (Vite compiles 174 card modules on first load)
  const warmupManifest = await navigateToBatch(page, 0, 180_000)
  totalCards = warmupManifest.totalCards
  const totalBatches = Math.ceil(totalCards / BATCH_SIZE)
  console.log(`[Compliance] Total cards: ${totalCards}, batches: ${totalBatches}`)

  // Let modules finish loading
  await page.waitForTimeout(3_000)

  // ── Phase 3: Live-Cold — test each batch ──────────────────────────────
  console.log('[Compliance] Phase 2: Live-Cold — testing card loading behavior')

  for (let batch = 0; batch < totalBatches; batch++) {
    // Clear caches in-page before each batch (init scripts already set from phase 1)
    await page.evaluate(() => {
      // Clear cache-related localStorage entries
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (!key) continue
        if (key.includes('dashboard-cards') || key.startsWith('cache:') || key.includes('kubestellar-stack-cache')) {
          localStorage.removeItem(key)
        }
      }
      // Ensure live mode
      localStorage.setItem('kc-demo-mode', 'false')
      localStorage.setItem('token', 'test-token')
    })

    mockControl.sseRequestLog.length = 0

    const manifest = await navigateToBatch(page, batch)
    const selected = manifest.selected || []
    if (selected.length === 0) continue

    const cardIds = selected.map((item) => item.cardId)

    // Start the compliance monitor
    await startComplianceMonitor(page, cardIds)

    // Wait for cards to finish loading
    await waitForCardsToLoad(page, cardIds, BATCH_LOAD_TIMEOUT_MS)

    // Stop monitor, collect history
    const coldHistory = await stopComplianceMonitor(page)

    // Check criterion F (cache) once per batch
    const criterionFResult = await checkCriterionF(page)

    // Evaluate criteria a-f per card
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
      `[Compliance] Batch ${batch + 1}/${totalBatches} cold: ${selected.length} cards, ${failCount} failures`
    )

    allBatchResults.push({ batchIndex: batch, cards: batchCards })
  }

  // ── Phase 4: Navigate away ────────────────────────────────────────────
  console.log('[Compliance] Phase 3: Navigate away')
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  // ── Phase 5: Live-Warm return — test cache behavior ───────────────────
  console.log('[Compliance] Phase 4: Live-Warm return — testing cache behavior')

  for (let batch = 0; batch < totalBatches; batch++) {
    // Do NOT re-apply cold mode — we want warm/cached data
    const manifest = await navigateToBatch(page, batch)
    const selected = manifest.selected || []
    if (selected.length === 0) continue

    const cardIds = selected.map((item) => item.cardId)

    // Start monitor for warm return
    await startComplianceMonitor(page, cardIds)

    // Wait shorter — cached data should appear fast
    await page.waitForTimeout(WARM_RETURN_WAIT_MS)

    const warmHistory = await stopComplianceMonitor(page)

    // Evaluate criteria g, h per card and add to existing batch results
    const batchResult = allBatchResults.find((b) => b.batchIndex === batch)
    if (batchResult) {
      for (const card of batchResult.cards) {
        const history = warmHistory[card.cardId] || []
        card.criteria.g = checkCriterionG(card.cardId, card.cardType, history)
        card.criteria.h = checkCriterionH(card.cardId, card.cardType, history)
        card.overallStatus = deriveOverallStatus(card.criteria)
      }
    }

    const warmFails = batchResult
      ? batchResult.cards.filter((c) => c.criteria.g?.status === 'fail' || c.criteria.h?.status === 'fail').length
      : 0
    console.log(
      `[Compliance] Batch ${batch + 1}/${totalBatches} warm: ${selected.length} cards, ${warmFails} warm failures`
    )
  }

  // ── Phase 6: Generate report ──────────────────────────────────────────
  console.log('[Compliance] Phase 5: Generating report')

  const allCards = allBatchResults.flatMap((b) => b.cards)
  const criterionPassRates: Record<string, number> = {}
  for (const criterion of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    const results = allCards.map((c) => c.criteria[criterion]).filter(Boolean)
    const testable = results.filter((r) => r.status !== 'skip')
    criterionPassRates[criterion] = testable.length > 0
      ? testable.filter((r) => r.status === 'pass').length / testable.length
      : 1
  }

  const report: ComplianceReport = {
    timestamp: new Date().toISOString(),
    totalCards,
    batches: allBatchResults,
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

  // Generate gap analysis
  report.gapAnalysis = generateGapAnalysis(report)

  const outDir = path.resolve(__dirname, '../test-results')
  writeReport(report, outDir)

  console.log(`[Compliance] Report: ${path.join(outDir, 'compliance-report.json')}`)
  console.log(`[Compliance] Summary: ${path.join(outDir, 'compliance-summary.md')}`)
  console.log(`[Compliance] Pass: ${report.summary.passCount}, Fail: ${report.summary.failCount}, Warn: ${report.summary.warnCount}, Skip: ${report.summary.skipCount}`)

  for (const criterion of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
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
  // Criterion a (no demo badge during loading) must be 100% — was the main issue, now fixed
  expect(criterionPassRates['a'], `Criterion a pass rate ${Math.round(criterionPassRates['a'] * 100)}% should be 100%`).toBe(1)
  // Critical criteria (c: SSE streaming, d: skeleton→content transition, f: persistent cache)
  for (const criterion of ['c', 'd', 'f'] as const) {
    const rate = criterionPassRates[criterion]
    expect(rate, `Criterion ${criterion} pass rate ${Math.round(rate * 100)}% should be >= 95%`).toBeGreaterThanOrEqual(0.95)
  }
  // Overall fail count — allow 1-2 nondeterministic edge cases (timing-sensitive criterion B)
  expect(report.summary.failCount, `${report.summary.failCount} card compliance failures exceeds tolerance`).toBeLessThanOrEqual(2)
})
